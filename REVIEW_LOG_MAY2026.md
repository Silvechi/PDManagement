# PDManagement — Code Review + Fix Log (May 2026)

5 complete iterations of: run tests → code review → fix → verify → update docs.

**Start state:** 198/198 tests passing.  
**End state:** 236/236 tests passing (38 new tests added).  
**Constraint:** No commits made; awaiting explicit user approval.

---

## Iteration 1 — RTL, accessibility, CSS, JS safety

### Fixes

**`css/styles.css`**  
- `.bag-pick-check`: `right: 7px` → `inset-inline-end: 7px`  
  In RTL, the check icon appeared on the wrong (start) edge of the bag-pick card.  
- `.bag-hero::before`: `right: -20px` → `inset-inline-end: -20px`  
  Decorative bubble overflowed the wrong edge in RTL.  
- Added after `html, body` rule:
  ```css
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition: none !important; animation: none !important; }
  }
  ```

**`js/users.js`**  
- `_renderUserForm`: `onclick="_usersSubmitForm('${escHtml(id)}')"` → data-attribute pattern.  
  `escHtml()` escapes `<>&"` but NOT `'`. A patientId containing `'` would break the JS string. Fixed by storing ID in `data-patient-id` and reading `this.dataset.patientId`.  
- Settings screen headings: `<div class="card-label">` → `<div class="card-head"><h2 class="card-title">`.  
  `.card-label` has no CSS rule; headings rendered unstyled.

**`js/prep.js`**  
- `localStorage.getItem(_PREP_CACHE_KEY)` wrapped in `try/catch`.  
  In browsers with storage blocked (private-mode restrictions), this throws `SecurityError`.

**`js/i18n.js`**  
- Added `document.documentElement.lang = currentLang` at startup IIFE.  
- Added `document.documentElement.lang = lang` in `setLang()`.  
  Without this, screen readers used wrong pronunciation engine for Hebrew (lang stayed `"en"`).  
- Added `time.*` key group in both EN and HE blocks.

**`js/app.js`**  
- `timeAgo()` rewritten to use `t('time.just_now')`, `t('time.mins_ago', { n })`, etc. instead of hardcoded English strings.

### Tests added

**`tests/measurements.spec.js`**  
- Test renamed: `'Drainage is the default active tab'` → `'Exchange tab is active by default'`  
- Drum click test: replaced `waitForFunction` (2 s timeout, flaky on mobile) with `toHaveCSS('opacity', '1', { timeout: 5000 })`.

**`tests/i18n.spec.js`** — 5 new tests  
- `switching to Hebrew sets lang="he" on <html>`  
- `switching back to English restores lang="en" on <html>`  
- `page loads with lang="he" when Hebrew is already stored`  
- `Hebrew last-exchange label uses Hebrew time-ago strings`

**`tests/history.spec.js`** — new file (26 tests, chromium + mobile)  
Covers: page title, preset chips, 1W-default active state, date inputs, no-data message, preset switching, row count, type chips, detail text, notes, date grouping, Hebrew title.

### Docs

**`README.md`**: added `history.spec.js` to file structure; removed resolved timeAgo gap from known issues.

**`TODO.md`**: marked done — #25 (RTL physical right), #26 (users.js onclick injection), #27 (prep.js localStorage), #28 (html lang attribute), #29 (card-label CSS), #30 (drum picker flaky test), #31 (timeAgo English-only), #32 (focus-visible/reduced-motion CSS).

---

## Iteration 2 — Prep screen + i18n tests (validation pass)

Re-ran full test suite: **232/232 passed.** No new issues found in this pass. The `history.spec.js` additions completed without regressions.

---

## Iteration 3 — Test suite baseline verification

Re-ran: **232/232 passed.** All previous fixes confirmed stable across both `chromium` and `mobile` (Samsung Galaxy S25) profiles.

---

## Iteration 4 — Dashboard version mismatch bug (Bug #7)

### Root cause

`getDashboard` (Code.gs) returned `configVersion: readConfigVersion()` which reads the Config sheet's `meta | lastUpdated` key. `_dashBackgroundRefresh` (dashboard.js) compared it against `API.getDataVersion()` which reads the completely different `meta | dataLastUpdated` key. These two keys are never equal, so the version comparison was always true → a background re-fetch of `getDashboard` fired on **every single page load**, even when no data had changed.

### Fixes

**`apps-script/Code.gs`**  
- `getDashboard` return value: `configVersion: readConfigVersion()` → `dataVersion: _readDataLastUpdated()`

**`js/dashboard.js`**  
- `_dashFetch`: `fresh.configVersion` → `fresh.dataVersion`

**`js/prep.js`**  
- `getDashboardData()?.configVersion` → `getDashboardData()?.dataVersion` (2 occurrences)  
  `prep.js` used the old field name for its own version-staleness check.

**`tests/helpers/mock-api.js`**  
- `DASHBOARD_RESPONSE`: added `dataVersion: '1'`  
  Without this, every test would have `version = null` cached and background refresh would always fire.

**`tests/inventory.spec.js`**  
- `'+/- buttons work with Hebrew item names'` test: added `dataVersion: '2'` and `getDataVersion: { version: '2' }` to the getDashboard override.  
  This test sets up a custom `getDashboard` response and re-navigates the page. After the fix, the `beforeEach`-loaded cache (version `'1'`) matched `getDataVersion()` → no background refresh → stale cached data was used instead of the Hebrew override. The test now uses version `'2'` to intentionally bust the cache.

### Docs

**`README.md`**: removed Bug #7 from known open issues.  
**`TODO.md`**: added ~~#7~~ done entry explaining the fix.

---

## Iteration 5 — RTL separator, offline i18n

### Fixes

**`js/i18n.js`**  
- Added `'hist.range_sep': '→'` (EN) and `'hist.range_sep': '←'` (HE).  
  The history date range separator was hardcoded `→` in HTML. In RTL, the "from" input is on the physical right and "to" is on the left, so `→` (pointing toward "from") is semantically backwards.  
- Added `'common.offline': 'You are offline — data may be stale'` (EN) and Hebrew translation.

**`js/history.js`**  
- Separator: hardcoded `→` → `${t('hist.range_sep')}`

**`js/app.js`**  
- `checkConnectivity()`: hardcoded English `'You are offline — data may be stale'` → `t('common.offline')`.  
  Was the only visible UI string not going through the i18n layer.

### Tests added

**`tests/history.spec.js`** — 2 new tests  
- `'Hebrew date range separator is a left-pointing arrow'` — verifies `←` in HE mode  
- `'English date range separator is a right-pointing arrow'` — verifies `→` in EN mode

### Docs

**`TODO.md`**: added ~~#33~~ done entry.

---

## Final state

| Metric | Before | After |
|--------|--------|-------|
| Tests passing | 198/198 | 236/236 |
| New tests added | — | 38 |
| Test files | 6 | 7 (history.spec.js added) |
| Devices tested | chromium | chromium + mobile (Galaxy S25) |
| Known open bugs in README | 2 | 1 (Bug #8 remains) |

### Bug #8 (remaining — not fixed)

**Dashboard tab can't be re-tapped to refresh data.** In `navigateTo()`, if `activeScreen === screenKey` it returns early without re-rendering. Tapping the active Dashboard tab does nothing. Fix would require detecting a "same-tab tap" case and calling `refreshDashboard()`. Marked Low priority.

### Files changed

| File | Change type |
|------|-------------|
| `apps-script/Code.gs` | Bug fix (`configVersion` → `dataVersion`) |
| `js/app.js` | Bug fix (timeAgo i18n), improvement (offline i18n) |
| `js/dashboard.js` | Bug fix (`configVersion` → `dataVersion`) |
| `js/prep.js` | Bug fix (localStorage safety, `configVersion` → `dataVersion`) |
| `js/history.js` | Improvement (RTL separator) |
| `js/i18n.js` | Bug fix (lang attribute, time-ago keys), improvement (offline key, separator keys) |
| `js/users.js` | Bug fix (onclick injection, undefined CSS class) |
| `css/styles.css` | Bug fix (RTL logical props), improvement (focus-visible, reduced-motion) |
| `tests/helpers/mock-api.js` | Fix (add `dataVersion: '1'` to DASHBOARD_RESPONSE) |
| `tests/history.spec.js` | New file + 2 separator tests |
| `tests/i18n.spec.js` | +5 lang-attribute and time-ago tests |
| `tests/measurements.spec.js` | Renamed test, fixed flaky mobile drum test |
| `tests/inventory.spec.js` | Fixed version-busting in Hebrew item test |
| `README.md` | Added history.spec.js, removed resolved issues |
| `TODO.md` | Added done entries #7, #25–#33 |
