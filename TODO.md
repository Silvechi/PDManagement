# PD Tracker — Deferred Work

Items identified during the May 2026 code review that were deliberately not fixed yet.

---

## Security

### #6 — Token visible in browser history
**Current behaviour:** the device token lives in the URL fragment (`#uuid`). Browsers store this in navigation history, so anyone who opens History on the device can read the token.

**Why deferred:** acceptable for a personal single-user device. Not a change to make lightly — it would break every existing bookmarked URL.

**Suggested change when ready:**
Replace the fragment approach with a path-based token stored only in `localStorage`. The "bookmark URL" would become the plain app URL (no hash); the app would read the token exclusively from `localStorage` on every load. Existing users would need to re-register once.

Alternative: keep the fragment but add a copy-to-clipboard button on the pending screen and explicitly warn users not to share their bookmark URL.

---

### #7 — No rate limiting on `registerToken`
**Current behaviour:** `registerToken` in Code.gs is a public endpoint with no rate limit. Anyone who knows the Apps Script URL can call it in a loop to flood the Tokens sheet with pending rows (spam that the owner must manually clean up).

**Suggested approach:**
Google Apps Script doesn't have built-in rate limiting, but a simple time-based lock works:

```javascript
function registerToken(token, label) {
  var cache = CacheService.getScriptCache();
  var recentKey = 'reg_' + String(token).slice(0, 36);
  if (cache.get(recentKey)) throw new Error('Too many requests. Try again later.');
  cache.put(recentKey, '1', 60); // block re-registration of same token for 60 s
  // ... rest of function
}
```

For broader protection (different tokens from the same actor), add a global registration-rate counter with a short TTL in `CacheService`. Each call increments it; if it exceeds ~10/minute, reject with 429-style error.

This only needs to be done if the app URL becomes semi-public or if you observe spam rows appearing in the Tokens sheet.

---

## Performance

### #9 — Dashboard reloads data on every tab visit
**Current behaviour:** navigating to the Dashboard always fires a fresh `getDashboard` API call (deliberately — a previous caching attempt was annoying because stale data was shown).

**Options that don't use a cache:**

1. **Pull-to-refresh only:** show the last-loaded data immediately, add a visible "Refresh" button in the page header. User pulls to reload deliberately.

2. **Timed staleness indicator:** keep the timestamp of the last fetch. If it's less than 2 minutes old, re-use the existing data silently; if older, re-fetch. Show "Last updated X min ago" in the page header so the user always knows if data is fresh.

3. **Background refresh on focus:** use `document.addEventListener('visibilitychange')` — when the tab/app comes back into focus after being hidden for >2 minutes, trigger a background re-fetch and update the UI once it completes, without a loading spinner.

---

## Data / Storage

### #10 — `getHistory` reads the entire Daily_Measurements sheet
**Current behaviour:** `getHistory` in Code.gs does `sheet.getRange(2, 1, totalRows, 9).getValues()` — loads all rows into memory on every history request. The early-break `if (rowDate < fromDate) break` stops processing early, but all rows still get read into memory first.

**Impact:** after 3 years of 4 exchanges/day ≈ ~4,400 rows. After 10 years ≈ ~15,000 rows. GAS memory limit is ~50 MB; a 15,000 × 9 cell range is well under that, but execution time grows linearly.

**Suggested improvement:**
Switch to a tail-read with a fixed window. The history feature only queries recent data (default 7 days, max typically 90 days). 90 days × 4 exchanges/day = ~360 rows. Reading the last 1,000 rows from the tail covers any realistic query:

```javascript
function getHistory(from, to) {
  var sheet = getSheet(TAB.MEASUREMENTS);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { rows: [] };

  var readFrom = Math.max(2, lastRow - 999); // last 1000 rows
  var data = sheet.getRange(readFrom, 1, lastRow - readFrom + 1, 9).getValues();
  // ... rest of filtering unchanged
}
```

If you ever need to export full history (e.g. for a doctor), add a separate `exportAll` endpoint that reads everything — keeping the regular history endpoint fast.
