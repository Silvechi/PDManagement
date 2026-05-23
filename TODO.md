# PD Tracker — Deferred Work

Items identified during the May 2026 code review that were deliberately not fixed yet.

---

## Security

### #6 — Token visible in browser history + password-based recovery

**Current behaviour:** the device token lives in the URL fragment (`#uuid`). Browsers store this in navigation history, so anyone who opens History on the device can read the token. A localStorage clear also permanently locks the device out with no recovery path.

**Chosen approach:** Strip the fragment immediately after first read; add label + password authentication so the token can be recovered without needing the URL.

---

**Registration / recovery — single unified flow:**

When no token exists in localStorage, show one form: **label** (device name) + **password** (6–20 characters). No branching UI — the system resolves whether this is a restore or a new registration.

Client always pre-generates a UUID. Calls `loginOrRegister(label, passwordHash, newUUID)`.

GAS logic:
1. Scan Tokens sheet for a row where Label = `label` AND PasswordHash = `hash` AND Status = `approved`
2. **Match found** → restore: return that token UUID + settings (theme, language, patientId, etc.)
3. **No match** (wrong password, unknown label, or label exists but hash differs) → register: insert new pending row using `newUUID`, return `{ restored: false }`

"Label matches but wrong password" intentionally creates a new pending token rather than rejecting — the owner must approve it, so there is no way to hijack an existing account. The worst outcome is a spam pending row (same threat as #7).

**Frontend response handling:**
- `{ restored: true, token, theme, language, ... }` → store token in localStorage, proceed normally
- `{ restored: false }` → show pending screen, poll `validateToken`

---

**Password hashing — client-side, Web Crypto API (no library):**
```javascript
async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
```
Plaintext password never leaves the device. GAS stores and compares only the hex SHA-256 hash.

---

**Tokens sheet changes:**
- New column `PasswordHash` — SHA-256 hex string, written on registration, compared on restore
- New column `ActivePatientID` — UUID of the last selected patient; written whenever the user switches patients (via a `setActivePatient` POST action); returned in the restore response so the device lands on the right patient after a cache clear
- Existing `registerToken` endpoint replaced by `loginOrRegister`

**Restore response — full shape:**
```javascript
{ restored: true, token, theme, language, activePatientId }
```
On restore, all per-device settings are recovered in one call — no additional round-trips needed.

---

**URL fragment cleanup (strips token from browser history):**
```javascript
// auth.js — after reading token from URL on first install
const hash = window.location.hash.slice(1);
if (hash && isValidUUID(hash)) {
  localStorage.setItem('device_token', hash);
  history.replaceState(null, '', window.location.pathname); // removes hash from history
}
```
After this runs once, the app URL in history is the plain app URL with no token.

---

**Migration note:** Existing approved tokens have no PasswordHash. On first load after the update, those devices will have their token in localStorage and won't hit the login form — no disruption. The PasswordHash column will be blank for legacy rows; if such a device later clears localStorage, it will go through new registration (pending + owner approval) rather than restore. Acceptable one-time cost.

---

### #7 — No rate limiting on registration endpoint
**Current behaviour:** The registration path (now `loginOrRegister` — see #6) is a public endpoint with no rate limit. Anyone who knows the Apps Script URL can call it in a loop to flood the Tokens sheet with pending rows (spam that the owner must manually clean up).

**Suggested approach:**
Google Apps Script doesn't have built-in rate limiting, but a simple time-based lock works:

```javascript
function loginOrRegister(data) {
  var cache = CacheService.getScriptCache();
  var recentKey = 'reg_' + String(data.newUUID).slice(0, 36);
  if (cache.get(recentKey)) throw new Error('Too many requests. Try again later.');
  cache.put(recentKey, '1', 60); // block same UUID from re-registering within 60 s
  // ... rest of function
}
```

For broader protection (different tokens from the same actor), add a global registration-rate counter with a short TTL in `CacheService`. Each call increments it; if it exceeds ~10/minute, reject with 429-style error.

This only needs to be done if the app URL becomes semi-public or if you observe spam rows appearing in the Tokens sheet.

---

## Performance

### #9 — Dashboard reloads data on every tab visit

**Current behaviour:** navigating to the Dashboard always fires a fresh `getDashboard` API call (deliberately — a previous caching attempt was annoying because stale data was shown).

**Chosen approach: server version check + instant cache render**

Multi-device caregiver support means a client-side dirty flag alone is not sufficient — a caregiver logging an exchange on their device won't invalidate the patient's device cache. A server-side signal is required.

**GAS changes:**
- `logExchange` and `updateInventory` both write the current timestamp to `meta | dataLastUpdated` in the sheet (same pattern as `meta | lastUpdated` in Config)
- New lightweight endpoint `getDataVersion()` reads only that cell and returns the string

**Dashboard cache format** (keyed per patient — switching patients always fetches fresh):
```javascript
localStorage.setItem('dashboard_' + patientId, JSON.stringify({ version: '2026-05-23 14:30', data: {...} }));
```

**On each dashboard tab visit:**
1. Render cache immediately — no spinner, instant display
2. Fire `getDataVersion()` in the background (one cheap cell read)
3. If returned version matches `cache.version` → do nothing, cache stays
4. If mismatch → re-fetch full `getDashboard`, update cache and UI when it arrives

**Local writes optimisation:** On a successful write from this device for the active patient, skip the background version check and invalidate only that patient's cache directly (set `cache.version = null`). Saves one round-trip in the common case.

**"Last updated" display:** Show `cache.version` timestamp in the dashboard header so the user always knows how fresh the data is.

**Manual refresh:** Small "↻" icon in the header clears cache and forces a full re-fetch.

---

## Data / Storage

### #10 — `getHistory` reads the entire Daily_Measurements sheet

**Current behaviour:** `getHistory` in Code.gs does `sheet.getRange(2, 1, totalRows, 9).getValues()` — loads all rows into memory on every history request. The early-break `if (rowDate < fromDate) break` stops processing early, but all rows still get read into memory first.

**Impact (single patient):** 10 years × 4 exchanges/day ≈ 15,000 rows. Manageable but execution time grows linearly. With multiple patients the sheet fills N× faster.

**Chosen approach: scaled tail-read on a single shared sheet**

No per-patient tabs — those would clutter the sheet for the owner. Instead, keep one `Daily_Measurements` sheet with a `PatientID` column, and scale the tail window by the number of patients:

```javascript
function getHistory(patientId, from, to) {
  var sheet = getSheet(TAB.MEASUREMENTS);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { rows: [] };

  var patientCount = Math.max(1, getSheet(TAB.PATIENTS).getLastRow() - 1);
  var tailRows = Math.max(1000, patientCount * 1000);
  var readFrom = Math.max(2, lastRow - tailRows + 1);
  var data = sheet.getRange(readFrom, 1, lastRow - readFrom + 1, COLS).getValues();

  // filter by patientId and date range in memory
}
```

- 1 patient → last 1,000 rows (~250 days headroom at 4 exchanges/day)
- 5 patients → last 5,000 rows (still one `getRange` call, same headroom per patient)
- 10 patients → last 10,000 rows (well within GAS memory limits)

Same approach for `Inventory` — append-only rows are far fewer per patient, so the shared sheet with patientId filtering stays fast at any realistic patient count.

If you ever need to export full history (e.g. for a doctor), add a separate `exportAll` endpoint that reads everything — keeping the regular history endpoint fast.

---

**Frontend: history screen should use the same caching logic as the dashboard**

History queries are heavier than dashboard calls, so caching pays off more. The same `dataLastUpdated` version signal applies.

**Cache format:**
```javascript
localStorage.setItem('history_v1', JSON.stringify({
  version: dataLastUpdated,    // same signal as dashboard_v1
  range: '7d',                 // active range selector value
  patientId: currentPatientId,
  data: [...]
}));
```

**On history screen visit:**
- Cache exists AND range matches AND patientId matches → render instantly, fire background `getDataVersion()` check (same as dashboard)
- Range or patient changed → fetch fresh, cache not consulted

**Shared version signal:** If `getDataVersion()` was already called this session (e.g. dashboard was visited first), the result can be reused in memory — no second network call needed.

**Future optimisation (not now):** Ranges where `to` is before today are immutable — those could cache indefinitely and skip the version check entirely.

---

## Multi-patient Support

### #11 — One deployment, multiple users (patients)

**Goal:** Run a single spreadsheet + GAS deployment for several PD patients — one caregiver device switches between them.

**Naming convention:** The UI calls them **"users"** throughout (screens, labels, nav). Internally — sheet tab name, backend variable names, localStorage keys, API parameter names — they remain **"patient"** / `patientId` to avoid collision with the existing concept of a "device user" (token holder).

**Chosen model:** One device, multiple patients. The active patient is selected in the app and stored in `localStorage`. The token still identifies the device and controls access; patient selection is a separate concern on top.

**Suggested data model changes:**

**New `Patients` sheet** — managed exclusively via the in-app "Add user" flow, never by hand-typing into the sheet (to avoid duplicate UUIDs):

| Col | Field | Notes |
|-----|-------|-------|
| A | PatientID | UUID — generated server-side by `addPatient()`; never entered manually |
| B | Name | Display name shown in the app |
| C | DOB | Date of birth (`yyyy-MM-dd`) |
| D | Comment | Free text (medical notes, contact info, etc.) |
| E | Active | `TRUE` / `FALSE` — inactive users hidden from the switcher |
| F | LastUpdated | Datetime — updated by the backend on every add/edit; used to bust the users cache (same pattern as `meta | lastUpdated` in Config) |

1. **Daily_Measurements** — add column J: `PatientID`
2. **Inventory** — add column D: `PatientID` — each user has their own independent stock counts; the inventory screen shows and updates only the active user's rows
3. **Config sheet** — start with shared config (all users use the same bag types and procedure steps). If a user needs different bag types or thresholds, add a `PatientID` column to Config rows later and filter on read.
4. **Tokens sheet** — no change needed for the basic model. If you later want to restrict a token to specific users only, add a `PatientIDs` column (comma-separated allowlist).

**Backend changes:**
- `getDashboard()`, `getHistory()` accept a `patientId` query parameter and filter all sheet reads by it
- `logMeasurement()`, `updateInventory()` write the `patientId` sent in the POST body to each row
- `patientId` comes from the client (it's a data selector, not an auth claim) — the token still handles auth
- `getPatients()` — reads the `Patients` sheet, returns `[{ patientId, name, active }]` plus a `version` field (the `LastUpdated` value from column F). Client caches this list; version change busts the cache.
- `addPatient(name, dob, comment)` — POST; generates a UUID server-side, appends a new row to the Patients sheet, updates `LastUpdated`, returns the new `patientId`
- `editPatient(patientId, fields)` — POST; updates name/DOB/comment/active on the matching row, updates `LastUpdated`

**Frontend changes:**
- New `users.js` screen with two sub-views:
  - **User list** — card per active user, tap to select as active; "Add user" button at the bottom
  - **Add / Edit user form** — fields: Name (required), DOB (optional), Comment (optional); on submit calls `addPatient` or `editPatient`; on success busts the local patients cache and returns to the list
- Active patient stored in `localStorage` as `active_patient_id`
- Patients list cached in `localStorage` as `pd_patients_v1` with `{ version, data }` — same invalidation pattern as the prep/reference cache
- Topbar shows the active user's name with a tap-to-switch affordance — always visible so the caregiver can't accidentally log under the wrong user
- All API calls include `patientId` derived from `active_patient_id`; if none is set, show the user picker before anything else loads
- Nav label and screen title: "Users" (not "Patients")

**Caution:** Once `patientId` is in every row, a schema migration is needed for existing data. Plan a one-time migration script or accept that pre-migration rows belong to a `"default"` patient ID.

---

## Easier Installation

### #12 — Remove the `config.js` file-edit requirement

**Current pain:** Users must clone the repo, edit `js/config.js`, and push just to set the GAS URL. That requires git knowledge and a local dev environment.

**Fix:** Eliminate `config.js` entirely. On first load, if `localStorage.getItem('gas_url')` is empty, show a **Setup screen** that:
1. Explains what a "Web App URL" is (with a screenshot or GIF)
2. Has a single text input: "Paste your Apps Script Web App URL"
3. On save, stores it to localStorage and reloads the app
4. On subsequent loads, `window.APPS_SCRIPT_URL` is read from localStorage instead of a file

This means the GitHub repo ships with zero user-specific configuration. Users fork/use the template, enable GitHub Pages, and that's it — no file to edit.

`config.js` and `config.js.example` become obsolete. Remove from `.gitignore` too.

### #13 — Shareable Apps Script template

**Current pain:** Users must create two script files in Apps Script, paste code into each, and know which file is which.

**Fix:** Publish the Code.gs project as a [shareable Google Apps Script project](https://support.google.com/docs/answer/2942294). Users click a single link → "Make a copy" → they now have their own copy of the project in their Google Drive. They only need to:
1. Open their Sheets file, go to Extensions → Apps Script → link the copied project (or deploy standalone)
2. Fill in `Config.defaults.gs` with their personal values
3. Run `setupSheet()` and deploy

This reduces the GAS setup from ~6 steps to ~3.

### #14 — GitHub template repo + streamlined README

**Mark the repo as a GitHub template** (Settings → Template repository checkbox). Users then click **"Use this template"** on GitHub instead of forking. First-time contributors don't need to understand forks.

README should be rewritten as a **Setup Checklist** with exactly two sections:
- **Google Sheets** (steps 1–N)
- **GitHub / Web App** (steps N+1–M)

Each step should have a screenshot or a clear "what you'll see" description. Avoid developer jargon (no "clone", "commit", "push" for users who don't know git).

Long-term: a one-page interactive `setup.html` in the repo that detects whether the user has a GAS URL configured and walks through each remaining step with checkboxes.

---

## Extra Features

### #15 — Ultrafiltration tracking

**What it is:** Ultrafiltration (UF) = volume drained − volume filled. It's the net fluid removed per exchange — a clinically important number that nephrologists track closely.

**Current gap:** The app logs drain weight (bag after drain) but doesn't record fill volume per exchange, so UF can't be calculated.

**Suggested addition:**
- Add a "Fill volume (L)" field to the log screen for `drain_fill` and `fill` entry types
- Store it in a new column on Daily_Measurements
- Dashboard: show daily UF total (sum of all exchange UF values for today)
- History: show UF per row alongside drain weight

### #16 — Data export for doctor visits (CSV download + email)

**Phase 1: CSV only.** PDF support is deferred but the UI must include a format selector from the start so it can be enabled without a redesign.

**Format selector (in the export modal):**
- `[ ] CSV`  `[ ] PDF`  `[ ] Both`
- Phase 1: CSV is the only enabled option; PDF and Both are shown but disabled with a "coming soon" label
- Phase 2: enable PDF — GAS can produce an HTML-formatted email body that most email clients render well as a printable page; alternatively use a Sheets-based template and export as PDF via `DriveApp`

**Two delivery modes:**

1. **Download to device** — CSV generated client-side from the already-fetched history rows, triggered via a Blob URL. No new API call needed; works offline.
2. **Email** — CSV (and later PDF) generated server-side by GAS and sent as an attachment using `MailApp.sendEmail()`. Natural fit since GAS already runs under a Google account. Daily quota is 100 emails/day — more than enough for personal use.

**CSV columns** (match what a nephrologist expects):
`Date, Time, Type, Bag Type, Drain Weight (kg), Fill Volume (L), UF (L), BP Systolic, BP Diastolic, Weight (kg), Notes`

---

**Email address — where it lives:**

Add a `meta | exportEmail` row to the Config sheet (owner sets it once). The app reads it from `getDashboard()` or a dedicated call. The UI prefills the address but lets the user override it per send — useful when emailing a different doctor or a family member.

---

**Backend — new `emailExport` POST endpoint:**

```javascript
function emailExport(data) {
  var rows  = getHistory(data.patientId, data.from, data.to).rows;  // patientId required for multi-patient
  var cols  = ['Date','Time','Type','Bag Type','Drain Weight (kg)',
               'Fill Volume (L)','UF (L)','BP Systolic','BP Diastolic',
               'Weight (kg)','Notes'];
  var lines = [cols.join(',')].concat(rows.map(function(r) {
    return [r.date, r.time, r.measurementType, r.bagType, r.bagWeight,
            r.fillVolume || '', r.uf || '', r.bpSystolic, r.bpDiastolic,
            r.weight, '"' + (r.notes || '').replace(/"/g,'""') + '"'].join(',');
  }));
  var csv  = lines.join('\n');
  var blob = Utilities.newBlob(csv, 'text/csv',
               'pd-export-' + data.from + '-to-' + data.to + '.csv');
  var patientName = _getPatientName(data.patientId); // look up name from Patients sheet
  MailApp.sendEmail({
    to:          data.to,
    subject:     'PD Export — ' + patientName + ' — ' + data.from + ' – ' + data.to,
    body:        'Please find the exchange log for ' + patientName + ' attached.',
    attachments: [blob]
  });
  return { success: true };
}
```

The email comes from the script owner's Gmail address. The recipient address is provided by the client (pre-filled from Config, editable before sending).

---

**Frontend — History screen additions:**

- "Export" button in the History page header, active whenever rows are loaded
- Tapping opens an export modal with three sections:

  **1. Format** (radio/chip selector):
  - `CSV` — enabled (phase 1)
  - `PDF` — disabled, labelled "coming soon" (phase 1); enable in phase 2
  - `Both` — disabled, labelled "coming soon" (phase 1); enable in phase 2

  **2. Delivery**:
  - `Download to device` — client-side Blob, instant, no spinner needed
  - `Email` — reveals an email input pre-filled from `exportEmail` Config value, editable before sending; shows a spinner then a success/error toast

  **3. Confirm / Send button**

- Date range used is whatever is currently displayed in History (respects the From/To filter the user already set); shown read-only in the modal so the user can confirm what they're exporting before sending

### #17 — PWA (Progressive Web App) — install to home screen

**What it adds:**
- App installable to home screen like a native app (no browser chrome)
- Works offline — shows cached dashboard data when no network

**Files needed:**
- `manifest.json` — app name, icons, theme color, `display: "standalone"`
- `sw.js` — service worker that caches the app shell (HTML/CSS/JS) and serves it offline; network requests fall through to GAS as normal

**Effort:** Low for the basic install-to-home-screen experience. Offline data access requires a more complete service worker cache strategy.

### #18 — Exchange overdue indicator

**Goal:** Loosely flag when too much time has passed since the last exchange, without enforcing a rigid schedule. Different bag types have different expected intervals (e.g. a standard daytime bag every 4–6 hours; an overnight bag is expected to run 8–10 hours).

**Config:** Add a `maxHours` value per inventory item in the Config sheet — a new column or a second `Value` field on bag rows. Example: `1.36%` bag → `maxHours: 6`, overnight bag → `maxHours: 10`. If no `maxHours` is set for a bag type, fall back to a global `meta | maxExchangeHours` value.

**Dashboard behaviour:**
- The "last exchange" block already shows the time and type
- If `now − lastExchange.time > maxHours` for the bag type used in that exchange, render the elapsed time in red with a warning icon instead of the normal muted colour
- No timeline, no slots, no schedule — just the single "last exchange" indicator changing colour

**Backend:** No changes needed. `getDashboard()` already returns `lastExchange` with date, time, and bag type. The threshold lookup happens client-side from `inventoryConfig` (also already in the dashboard response).

**Frontend:** Pure client-side calculation in `dashboard.js`. On render, compute elapsed hours from `lastExchange`, find the matching inventory config item, read its `maxHours`, compare, and apply a CSS class (`exchange-overdue`) that turns the elapsed time red.

**Complexity:** Low.

### #19 — Supply reorder reminder with lead time

**Note:** Dialysis bags are managed by the supply company — they call every two weeks on Mondays and handle replenishment. The purpose of tracking bag stock is simply to have the current counts ready to report when they call. No reorder reminder or lead-time calculation needed for bags. This feature is only relevant for consumables the caregiver manages independently (e.g. gauze, tape, disinfectant).

**Current behaviour:** Low-stock flag shows when count drops below threshold. No forward planning.

**Enhancement:** Add a `reorderDays` column to Config (how many days' supply to keep as buffer). Dashboard calculates: at current usage rate, when will stock run out? Show "Reorder by [date]" instead of just a low-stock flag. Apply only to non-bag inventory items (i.e. items where `isBag` is `FALSE`).

Usage rate = (previous count − current count) / days between updates. Requires storing enough inventory history to calculate a rate — the append-only log already provides this.

### #20 — Read-only caregiver / doctor link

**Goal:** Share a view-only version of the dashboard with a carer or nephrologist without giving them the ability to log new data or access the full app.

**Chosen approach: read-only token.** Add a `readonly` status to the Tokens sheet (alongside `pending`, `approved`, `revoked`). 

**Backend changes:**
- `validateToken()` returns the full per-device state in one response — complete shape (aggregating #20, #21, #22, #6):
  ```javascript
  { status, readonly, theme, language, activePatientId }
  ```
- `logMeasurement()` and `updateInventory()` reject requests from readonly tokens with a clear error
- All GET endpoints work normally for readonly tokens

**Note on token recovery (#6):** `loginOrRegister` only restores tokens with `status = 'approved'`. Readonly tokens are set up differently (owner writes `readonly` directly into the sheet) and are not intended for recovery via the password flow — a readonly viewer who loses their token simply re-registers and the owner re-marks the new token as `readonly`.

**Frontend changes:**
- After token validation, store `readonly` flag in a module-level variable in `auth.js`
- Hide the Log, Inventory, and any write-action buttons from the nav and screens when `readonly` is true
- Dashboard and History are fully visible
- A subtle "read-only" label in the topbar so the viewer knows they're in view-only mode

**Setup:** Owner registers the device normally, then sets its Status to `readonly` in the Tokens sheet instead of `approved`. The device sees the app immediately with no approval wait.

### #21 — Theme setting: light / dark / system, saved per device in Tokens sheet

**Current behaviour:** Manual light/dark toggle, no system-follow option, saved only in localStorage.

**Chosen approach:** Three-way setting stored in the Tokens sheet (same column as language preference — or a dedicated column), surviving localStorage clears.

**Tokens sheet:** Add column `Theme` (`light` / `dark` / `system`, default `system`). Read back in the `validateToken` response alongside `language`.

**Backend changes** (mirror the language pattern in #22):
- `validateToken()` returns `{ status, language, theme }`
- `registerToken()` writes default `'system'` to the Theme column
- `setTheme` POST action: updates the Theme column for the token, returns `{ success: true }`

**Frontend — three-way toggle in topbar** (replaces the current binary button):
- Cycles through `light → dark → system` on each tap, or opens a small picker
- Icon: sun (light) / moon (dark) / half-moon or monitor (system)
- `system` reads `window.matchMedia('(prefers-color-scheme: dark)')` on load and adds a `change` listener to follow the OS in real time
- On change, calls `setTheme` to persist server-side, updates localStorage as a local cache for instant apply on next load before the token validation response arrives

---

## Dialysis Modality

### #23 — CCPD support

**Background:** The entire app is currently built around CAPD (Continuous Ambulatory Peritoneal Dialysis) — manual exchanges performed by the patient throughout the day, logged one at a time as `drain`, `fill`, or `drain_fill` entries. CCPD (Continuous Cycler-assisted Peritoneal Dialysis) is fundamentally different: a machine (cycler) performs multiple exchanges automatically overnight, and the patient typically does one manual daytime exchange (the "last fill" left in from the cycler drains in the morning, then a fresh manual fill).

**What changes for CCPD:**

*New measurement type: `cycler_session`*
A CCPD night is logged as a single session, not individual cycles. Relevant fields:
- Session date + start time / end time
- Total volume drained (ml or L)
- Total volume filled (ml or L) — may differ from drained due to ultrafiltration
- Number of cycles (optional — not all patients track this)
- Last fill volume (the bag left in during the day)
- Last fill bag type
- Notes

*New columns on `Daily_Measurements`:*
Add `Fill Volume (L)`, `Num Cycles`, `Last Fill Volume (L)` — these are empty for CAPD entries, populated for cycler sessions. Alternatively add a separate `Cycler_Sessions` sheet if the column mismatch becomes unwieldy.

*Modality setting in Config:*
Add `meta | modality` with value `CAPD`, `CCPD`, or `both`. The app uses this to:
- Show/hide the cycler session log form
- Adjust the Log screen tabs (CAPD exchanges vs. cycler session)
- Adjust the prep/reference card (CAPD procedure vs. cycler setup procedure)
- Filter history display — cycler sessions and manual exchanges are visually distinct

*Dashboard adjustments:*
- Show last cycler session separately from last manual exchange
- The overdue indicator (#18) must be aware of modality — a CCPD patient is expected to use the cycler overnight; flagging "no exchange in 6 hours" at 3am is wrong. Suppress the overdue indicator between cycler session start and end times, or simply use a much longer threshold for CCPD patients.
- UF calculation (#15) works the same way but pulls from cycler session totals

*Prep/reference card:*
CCPD patients need a cycler setup checklist and teardown procedure instead of (or alongside) the CAPD manual exchange steps. Config already supports multiple prep_items and prep_steps categories — extend with a `cycler_prep_items` / `cycler_prep_steps` category, shown only when modality includes CCPD.

**Complexity:** Medium-high. Schema changes touch measurements, config, dashboard, history, and the log form. Best tackled after multi-user (#11) is stable, since both touch the measurements schema.

**Status: On hold** — more domain knowledge about CCPD clinical procedures and what caregivers actually need to track is required before design can begin. Revisit once that's understood.

---

## Internationalisation

### #22 — Hebrew UI + RTL layout, preference stored per device in Tokens sheet

**Goal:** Full Hebrew translation of all UI strings, RTL layout, with the language preference stored server-side in the Tokens sheet so it survives localStorage clears and transfers to a new browser.

---

**Language preference — where it lives:**

Add column F to the `Tokens` sheet: `Language` (`he` / `en`, default `he`).

- `validateToken` response already comes back on every app load — extend it to include `{ status, language }`
- On approved, `initAuth()` reads `language` from the response and applies it before any screen renders
- The owner can change a device's language by editing the Tokens sheet directly (column F)
- Also expose a language toggle button in the app UI (topbar, next to the theme toggle) that calls a new `setTokenLanguage(lang)` POST endpoint and reloads — so the user can change it themselves without touching the sheet
- Fall back to `he` if column F is empty or the token is not yet approved

**Backend changes:**
- `Tokens` sheet: add column F `Language`; update `HEADERS.Tokens` and `setupSheet()` accordingly
- `validateToken()`: read column F and include `language` in the response
- `registerToken()`: write default `'he'` to column F on new registrations
- New POST action `setLanguage`: accepts `{ token, language }`, validates token is approved, updates column F, returns `{ success: true }`
- `touchToken()`: no change needed

---

**Translation system — frontend:**

Add `js/i18n.js` (loads before `app.js`):

```javascript
const TRANSLATIONS = {
  en: {
    nav_dashboard: 'Dashboard', nav_log: 'Log', nav_inventory: 'Inventory',
    nav_history: 'History', nav_prep: 'Prep',
    dashboard_title: 'Dashboard', log_title: 'Log Exchange',
    // ... all UI strings
  },
  he: {
    nav_dashboard: 'לוח בקרה', nav_log: 'תיעוד', nav_inventory: 'מלאי',
    nav_history: 'היסטוריה', nav_prep: 'הכנה',
    dashboard_title: 'לוח בקרה', log_title: 'תיעוד החלפה',
    // ... all UI strings
  }
};

let _lang = 'he';

function setLang(lang) {
  _lang = lang;
  document.documentElement.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lang);
  try { localStorage.setItem('pd_lang', lang); } catch {}
}

function t(key) {
  return (TRANSLATIONS[_lang] || TRANSLATIONS['he'])[key] || key;
}
```

All screen files use `t('key')` instead of hardcoded English strings. Load order: `i18n.js` after `config.js`, before all screen files.

**Strings that do NOT need translation** — these come from the Config sheet and are already in whatever language the owner wrote them: inventory item names, bag types, prep checklist items, procedure steps. The owner controls the language of their own content.

---

**RTL layout — CSS:**

Apply `dir="rtl"` to `<html>` via `setLang()` — this alone handles the majority of layout flipping automatically (flex row direction, text alignment, browser-native inputs).

Explicit overrides needed for components that use physical CSS properties:

```css
/* History row accent border — physical property, needs manual RTL flip */
.hist-row {
  border-left: 3px solid var(--row-bag, var(--border));
}
[dir="rtl"] .hist-row {
  border-left: none;
  border-right: 3px solid var(--row-bag, var(--border));
}

/* Prep step number — sits to the left in LTR, right in RTL */
[dir="rtl"] .step-num {
  margin-left: 0;
  margin-right: /* original value */;
}

/* Bottom nav — icons + labels stack vertically, unaffected by dir */
/* (no change needed) */
```

Audit every component that uses `padding-left`, `padding-right`, `margin-left`, `margin-right`, `border-left`, `border-right`, `text-align: left/right`, `left:`, `right:` — these are the ones that need `[dir="rtl"]` counterparts or conversion to logical properties (`padding-inline-start`, `border-inline-start`, etc.).

---

**What does NOT need to change:**
- Date/time format — `yyyy-MM-dd` and `HH:mm` are locale-neutral; keep as-is
- Number format — keep decimal point, no locale number formatting
- Screen routing, API calls, localStorage keys — fully language-agnostic
- Config sheet content — owner-controlled, already in their language
