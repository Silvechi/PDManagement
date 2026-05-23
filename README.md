# PD Tracker

A web-based medical tracking platform for peritoneal dialysis patients. Tracks daily measurements, procedure supplies, and inventory. Syncs to Google Sheets as the backend — no hosting required.

---

## What it does

| Screen | Purpose |
|---|---|
| **Dashboard** | At-a-glance view: solution bag counts (colour-coded), 7-day weight trend sparkline, recent BP readings, time since last exchange. Low-stock alert banner. |
| **Log** | Three toggled cards — Drainage (default), Weight, Blood Pressure — each independently submittable with scroll-wheel numeric pickers and auto-filled date/time. Shows time since last exchange. |
| **Inventory** | Adjust supply counts with `+` / `−` buttons. Item list, low-stock thresholds, bag colours, and display names are all driven by the Config sheet. |
| **History** | Chronological log of exchange entries (drain/fill). Configurable date range with from/to date pickers and 1W/1M/3M presets. Newest entries first. |
| **Prep** | Static reference: what to gather before the procedure and the procedure steps. Both read from the Config sheet. Tap any item to reveal a tooltip explanation. |

---

## Architecture

```
Browser (index.html + vanilla JS)
        ↓
Google Apps Script Web App  (apps-script/Code.gs)
        ↓
Google Sheets  (tabs: Daily_Measurements, Inventory, Dashboard, Config, Tokens)
```

**Why this stack:**
- Zero hosting cost
- Google Sheets = live data store and admin panel
- Apps Script = free API layer, no server needed
- Pure HTML/CSS/JS = works on any device via URL

---

## Security model

Access is controlled by per-device tokens rather than a single shared password:

1. First visit → registration form → device generates a UUID token → GAS records it as `pending` in the **Tokens** sheet
2. Owner opens the Tokens sheet and changes status to `approved`
3. Device bookmarks `app-url/#token` → future visits validate automatically
4. To revoke a device, change its status to `revoked` in the sheet

The token is stored in both `localStorage` (persists across sessions) and the URL fragment (acts as the bookmark). Both must be present; an attacker needs the specific bookmarked URL on the registered device.

---

## Design principles

- **Glove-friendly**: all tap targets ≥ 48 px (56 px for primary actions)
- **Scroll-wheel pickers**: numerical values use a physical drum/scroll-wheel UI — no keyboard required
- **Auto-timestamp**: date and time pre-filled on every form, always editable
- **Never silent-fail**: all API calls show visible feedback on error, with an offline banner if the server is unreachable
- **Config-driven**: inventory items, thresholds, bag colours, prep checklist, and procedure steps all live in the `Config` sheet — no code changes needed to update them
- **Responsive**: single-column on mobile, card grid on tablet/desktop; nav moves from bottom to top on wide screens

---

## File structure

```
PDManagement/
├── index.html                  App shell + screen router
├── mockup-proposed.html        Design mockup reference (open in browser)
├── package.json                Dev dependencies (Playwright)
├── playwright.config.js        Test configuration
│
├── css/
│   └── styles.css              Mobile-first styles, design tokens, all components
│
├── js/
│   ├── config.js               Local config — sets APPS_SCRIPT_URL (gitignored)
│   ├── app.js                  Screen routing, nav, global init, shared helpers
│   ├── api.js                  fetch() wrapper, timeout, device token, API object
│   ├── auth.js                 Device token auth — registration, pending, denied screens
│   ├── drum-picker.js          Scroll-wheel numeric input component
│   ├── dashboard.js            Dashboard render + SVG weight sparkline
│   ├── measurements.js         Three-card measurement log with toggle + drum pickers
│   ├── inventory.js            Inventory display + +/− adjustments + save
│   ├── history.js              Exchange history log with date range picker
│   └── prep.js                 Prep screen (checklist + procedure steps)
│
├── apps-script/
│   └── Code.gs                 Google Apps Script backend (all endpoints)
│
└── tests/
    ├── helpers/mock-api.js     Playwright API mock (page.route + addInitScript)
    ├── dashboard.spec.js
    ├── measurements.spec.js
    ├── inventory.spec.js
    ├── timer.spec.js
    └── navigation.spec.js
```

---

## Google Sheets structure

### `Daily_Measurements`
| Date | Time | Weight (kg) | BP Systolic | BP Diastolic | Bag Weight After Drainage (kg) | Notes | Bag Type | Measurement Type |

`Measurement Type` values: `drain`, `fill`, `drain_fill`, `weight`, `bp`

### `Inventory`
| Date | Item Name | Count |

*(Tall format — one row per item per save. Latest row per item wins.)*

### `Config`
| Category | Key | Value | Description | isBag | active | color | displayName |

Config row categories:
- `inventory` — supply items. `isBag=TRUE` marks solution bags; `active=FALSE` hides an item without deleting it; `color` is a hex code for the bag dot; `displayName` is the label shown in the UI (e.g. `2.27%`)
- `prep_items` — the pre-procedure checklist (Key = order number)
- `prep_steps` — numbered procedure steps (Key = order number)

### `Tokens`
| Token | Label | Status | Created | Last Used |

Status values: `pending`, `approved`, `revoked`. Change `pending` → `approved` to grant a device access.

### `Dashboard` *(unused, kept for legacy)*

---

## Deployment

### 1. Set up Google Sheets

1. Create a new Google Sheet
2. Open **Extensions → Apps Script**
3. Paste the contents of `apps-script/Code.gs`, save
4. Run `setupSheet()` once — creates all five tabs with headers, populates Config with defaults, and adds the status dropdown to the Tokens tab

### 2. Deploy as a Web App

1. Click **Deploy → New Deployment → Web App**
2. Set:
   - Execute as: **Me**
   - Who has access: **Anyone**
3. Click **Deploy** and copy the generated URL

> If you ever edit `Code.gs`, create a **New deployment** to publish changes. Saving the file alone does not update the live app.

### 3. Configure the frontend

Create `js/config.js` (this file is gitignored so it won't be committed):

```js
window.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_ID/exec';
```

### 4. Register your first device

1. Open `index.html` in a browser
2. A registration screen appears — enter a device name (optional) and click **Request access**
3. The app shows a pending screen with a bookmark URL (e.g. `your-app-url/#uuid`)
4. Open the **Tokens** sheet in Google Sheets — a new row appears with status `pending`
5. Change `pending` → `approved` using the dropdown
6. Return to the app and click **Check again** — the app loads

Save the bookmark URL. This is the URL you (and any approved user) will use to open the app.

---

## API endpoints

All requests go to the single Apps Script Web App URL.

| Method | `action` | Auth required | Behaviour |
|---|---|---|---|
| `GET` | `validateToken` | No | Check if a device token is approved/pending/revoked |
| `GET` | `registerToken` | No | Add a new device token as `pending` |
| `GET` | `touchToken` | No | Update last-used timestamp for a token |
| `GET` | `getDashboard` | Yes | Latest inventory + 7-day stats + last exchange |
| `GET` | `getHistory` | Yes | Exchange rows filtered by `from`/`to` date params |
| `GET` | `getConfig` | Yes | Prep items and procedure steps from Config tab |
| `POST` | `logMeasurement` | Yes | Append row to `Daily_Measurements` |
| `POST` | `updateInventory` | Yes | Append rows to `Inventory` (one per item) |

---

## Customising via Config sheet

All of the following can be changed by editing the `Config` tab — no code deployment needed:

| Category | What it controls |
|---|---|
| `inventory` | Supply items, low-stock thresholds, bag colours, display names, active/inactive |
| `prep_items` | The pre-procedure checklist on the Prep screen |
| `prep_steps` | The numbered procedure steps on the Prep screen |

**Inventory columns (A–H):**

| Col | Field | Example |
|---|---|---|
| A | `inventory` | (literal text) |
| B | Item name | `Solution Bags 2.27%` |
| C | Min stock threshold | `5` |
| D | Description / tooltip | `Green bag. Check expiry.` |
| E | isBag (`TRUE`/`FALSE`) | `TRUE` |
| F | active (`TRUE`/`FALSE`) | `TRUE` |
| G | Colour hex | `#2BA15A` |
| H | Display name | `2.27%` |

Default values are written by `setupSheet()` and can be freely edited afterwards.

---

## Installation

See **[INSTALL.md](INSTALL.md)** for a full step-by-step guide (no coding experience required).

---

## Running tests

```bash
npm install
npx playwright install chromium
npm test                # headless
npm run test:ui         # interactive Playwright UI
npm run test:report     # open HTML report
```

Tests mock the Apps Script API via `page.route()` — no real Google account is needed.

---

## Known open issues

| # | Issue | Priority |
|---|---|---|
| Bug #7 | Dashboard makes two `getDashboard` calls on startup | Low |
| Bug #8 | Dashboard tab can't be re-tapped to refresh data | Low |
