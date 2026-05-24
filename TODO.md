# PD Tracker — Deferred Work

Items identified during the May 2026 code review that were deliberately not fixed yet.

---

## Security

### #7 — No rate limiting on registration endpoint

The `loginOrRegister` endpoint is public with no rate limit. Anyone who knows the Apps Script URL can call it in a loop to flood the Tokens sheet with pending rows (spam the owner must manually clean up).

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

Only needed if the app URL becomes semi-public or spam rows appear in the Tokens sheet.

---

## Easier Installation

### #12 — Remove the `config.js` file-edit requirement

**Current pain:** Users must clone the repo, edit `js/config.js`, and push just to set the GAS URL.

**Fix:** Eliminate `config.js` entirely. On first load, if `localStorage.getItem('gas_url')` is empty, show a **Setup screen** with a single text input: "Paste your Apps Script Web App URL". On save, store to localStorage and reload. `window.APPS_SCRIPT_URL` is then read from localStorage instead of a file.

`config.js` and `config.js.example` become obsolete. Remove from `.gitignore` too.

### #13 — Shareable Apps Script template

Publish the Code.gs project as a shareable Google Apps Script project. Users click a link → "Make a copy" → they have their own copy. Reduces GAS setup from ~6 steps to ~3.

### #14 — GitHub template repo + streamlined README

Mark the repo as a GitHub template (Settings → Template repository). Rewrite README as a **Setup Checklist** with exactly two sections (Google Sheets / GitHub Pages). Avoid developer jargon. Long-term: an interactive `setup.html` that walks through each step with checkboxes.

---

## Extra Features

### #15 — Ultrafiltration tracking

**Schema ready:** `Fill Volume (L)` column exists in `Daily_Measurements` (col 11). `logMeasurement` writes it, `getHistory` returns it.

**Not yet built:**
- Fill volume input field on the Log screen for `drain_fill` and `fill` entries
- UF calculation (drained − filled) on dashboard (daily total) and history (per row)
- New `Daily_Measurements` column for fill volume is already there but the UI doesn't expose it

### #16 — Data export for doctor visits (CSV download + email)

**Phase 1: CSV only.** PDF deferred but the UI must include a disabled format selector from the start.

**Two delivery modes:**
1. **Download to device** — client-side Blob from already-fetched history rows. No new API call, works offline.
2. **Email** — `MailApp.sendEmail()` in GAS with CSV attachment. Email address comes from `meta | exportEmail` in Config (pre-filled, editable before send).

**Backend — new `emailExport` POST endpoint** reads history for the patient and date range, builds CSV, sends via `MailApp`.

**Frontend — History screen:** "Export" button in header → modal with format selector, delivery mode, and confirm button. Date range is whatever is currently displayed.

**CSV columns:** `Date, Time, Type, Bag Type, Drain Weight (kg), Fill Volume (L), UF (L), BP Systolic, BP Diastolic, Weight (kg), Notes`

### #17 — PWA (Progressive Web App) — install to home screen

**Files needed:**
- `manifest.json` — app name, icons, theme color, `display: "standalone"`
- `sw.js` — service worker caching the app shell; network requests fall through to GAS

**Effort:** Low for install-to-home-screen. Full offline data access requires a more complete service worker strategy.

### #19 — Supply reorder reminder with lead time

**Schema ready:** `reorderDays` column added to Config schema (col 10).

**Not yet built:** Dashboard does not compute usage rates or show "Reorder by [date]". Usage rate = (previous count − current count) / days between updates. Apply only to non-bag inventory items (`isBag = FALSE`).

### #20 — Read-only caregiver / doctor link

**Backend done:** `readonly` status in Tokens sheet dropdown validation. `checkToken` rejects writes from readonly tokens. `validateToken` returns `readonly: true`. `initAuth` accepts `readonly` status and proceeds normally.

**Not yet built (frontend):**
- Store the `readonly` flag after token validation
- Hide Log, Inventory, and all write-action buttons when `readonly` is true
- Show a subtle "read-only" label in the topbar

**Setup (already works):** Owner sets a device's Status to `readonly` in the Tokens sheet instead of `approved`. The device gets read access with no approval wait.

### #21 — Theme setting: add "system" option

**Backend done:** `Theme` column in Tokens sheet. `savePreferences` writes it. `validateToken` returns it. `initAuth` applies it via `applyTheme` on load.

**Not yet built:** Add `system` as a third option (alongside `light` / `dark`). When active, reads `window.matchMedia('(prefers-color-scheme: dark)')` on load and adds a `change` listener to follow the OS in real time. Update the Settings tab-pill from 2 to 3 buttons.

---

## Dialysis Modality

### #23 — CCPD support

**Background:** The app is built around CAPD (manual exchanges logged one at a time). CCPD uses a cycler overnight; the patient logs one session per night instead of individual exchanges.

**What changes:** New `cycler_session` measurement type. New columns on `Daily_Measurements` (`Fill Volume (L)` already added; add `Num Cycles`, `Last Fill Volume (L)`). New `meta | modality` Config key (`CAPD` / `CCPD` / `both`) controlling which log forms and prep steps are shown. Dashboard overdue indicator must be modality-aware.

**Complexity:** Medium-high. Best tackled after #15 (UF tracking) since both touch the measurements schema.

**Status: On hold** — more domain knowledge about CCPD clinical procedures is required before design can begin.

---

## Accessibility

### #24 — Text size setting

**Context:** PD patients and caregivers skew older. The app already has 48 px tap targets; text scaling is the next step. WCAG 2.1 criterion 1.4.4 requires text to scale to 200% without loss of content.

**Approach — set `font-size` on `<html>`, use `rem` everywhere:**

Three fixed steps (not a slider — sliders are hard to use with gloves):

| Setting | `html` font-size | Effect |
|---------|-----------------|--------|
| Normal  | 16px (browser default) | Baseline |
| Large   | 20px (125%)    | ~25% larger throughout |
| X-Large | 24px (150%)    | ~50% larger throughout |

**Settings UI:** Three `A` buttons at increasing visual sizes in the Appearance card (same row pattern as Theme/Language). Self-evident without needing a translated label.

**Persistence:** `pd_text_size` in localStorage + `savePreferences` POST (add `textSize` field). Backend: add `TextSize` column to Tokens sheet; return in `validateToken`; apply in `initAuth`.

**CSS audit required:** Drum picker item height, `.bag-hero-count`, `.vitals-val`, bottom nav min-height, and card padding all use `px` — must convert to `rem` for scaling to work throughout.

**Drum picker special case:** The scroll-wheel calculates item offsets using a hardcoded `px` height constant. Fix: read `itemHeight` dynamically from `el.firstElementChild.getBoundingClientRect().height` after first render.

**Quick wins to do first (one-liners, high impact):**
- `@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }`
- `@media (prefers-contrast: more)` — boost `--text-2` and `--text-3` toward `--text-1`
- `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }` globally
- `aria-live="polite"` on all feedback `<p>` elements (`#bag-feedback`, `#wt-feedback`, `#bp-feedback`, `#inv-feedback`)

---

## Done

### ~~#6 — Token visible in browser history + password-based recovery~~ ✓ Done (May 2026)

Single login/registration form with device label + SHA-256 password hash (Web Crypto API, no library). `loginOrRegister` in Code.gs handles both new registration (returns pending) and restore by label+hash match (returns approved token + settings). URL fragment threat is moot — the new auth never puts tokens in the URL. `validateToken` returns `theme`, `language`, `activePatientId` applied immediately on restore.

---

### ~~#9 — Dashboard reloads data on every tab visit~~ ✓ Done (May 2026)

Cache-first render with per-patient localStorage key (`dashboard_<patientId>`). Background `getDataVersion()` check re-fetches only on version mismatch. `invalidateDashboardCache()` called after local writes. Manual ↻ refresh button. "Updated {time}" display. `_touchDataLastUpdated()` in Code.gs called by `logMeasurement` and `updateInventory`.

---

### ~~#10 — `getHistory` reads the entire Daily_Measurements sheet~~ ✓ Done (May 2026)

**Backend:** Tail-read scaled by patient count — `Math.max(1000, patientCount * 1000)` rows. One `getRange` call regardless of sheet size. `getHistory` returns `version` from `dataLastUpdated` for cache invalidation.

**Frontend:** Same cache-first + background version-check pattern as dashboard. Keyed by `history_<patientId>_<from>_<to>` — range or patient change fetches fresh automatically.

---

### ~~#11 — One deployment, multiple users (patients)~~ ✓ Done (May 2026)

`Patients` sheet with UUID-keyed rows managed only via the in-app Add/Edit flow. `getPatients`, `addPatient`, `editPatient` endpoints. All data endpoints (`getDashboard`, `getHistory`, `logMeasurement`, `updateInventory`) filter and tag by `patientId`. `users.js` has user list with active/inactive badges, add/edit form, and tap-to-select navigation. Patient chip in topbar always shows the active user. `loadPatientsCache()` on app init auto-selects the sole active patient when appropriate.

---

### ~~#18 — Exchange overdue indicator~~ ✓ Done (May 2026)

`maxHours` column added to Config schema (col 9, per-item). Global fallback via `meta | maxExchangeHours`. `readInventoryConfig()` in Code.gs reads `maxHours` per item. `dashboard.js` computes elapsed hours client-side from `lastExchange`, takes the minimum `maxHours` across all bag types, and shows a `.card-overdue` banner with elapsed time when exceeded.

---

### ~~#22 — Hebrew UI + RTL layout~~ ✓ Done (May 2026)

Full Hebrew translation in `js/i18n.js`. Language toggle in Settings. RTL layout via CSS logical properties + `dir="rtl"` on `<html>`. Preference persisted to localStorage and synced to Tokens sheet via `savePreferences`.

**Remaining gap:** `timeAgo()` in `app.js` still returns English strings (`'5m ago'`, `'2h ago'`, `'3d ago'`). Affects "Last exchange {ago}" on Dashboard and "Last {ago}" on the Log screen. Low priority — wrap `timeAgo()` outputs with `t()` keys when addressed.
