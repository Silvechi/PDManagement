# PD Tracker

A web-based medical tracking platform for peritoneal dialysis patients. Tracks daily measurements, procedure supplies, and inventory. Syncs to Google Sheets as the backend — no hosting required.

---

## What it does

| Screen | Purpose |
|---|---|
| **Dashboard** | At-a-glance view: inventory status (color-coded), 7-day weight trend chart (kg), average BP |
| **Log** | Three toggled cards — Drainage (default), Weight, Blood Pressure — each independently submittable with scroll-wheel numeric pickers and auto-filled date/time |
| **Inventory** | Adjust supply counts with `+` / `−` buttons; item list and low-stock thresholds are driven by the Config sheet |
| **Prep** | Static reference: what to gather before the procedure and the procedure steps, both read from the Config sheet. Tap any item to reveal an explanation tooltip (configured in column D of the Config sheet) |

---

## Architecture

```
Browser (index.html + vanilla JS)
        ↓
Google Apps Script Web App  (apps-script/Code.gs)
        ↓
Google Sheets  (tabs: Daily_Measurements, Inventory, Dashboard, Config)
```

**Why this stack:**
- Zero hosting cost
- Google Sheets = shareable live dashboard for any viewer
- Apps Script = free API layer, no server needed
- Pure HTML/CSS/JS = works on any device via URL

---

## Design principles

- **Glove-friendly**: all tap targets ≥ 48 px (56 px for primary actions)
- **Scroll-wheel pickers**: numerical values use a physical drum/scroll-wheel UI — no keyboard required
- **Auto-timestamp**: date and time pre-filled on every form, always editable
- **Never silent-fail**: all API calls show visible feedback on error, with an offline banner if the server is unreachable
- **Config-driven**: inventory items, low-stock thresholds, prep checklist, and procedure steps all live in a Google Sheet `Config` tab — no code changes needed to update them
- **Responsive**: single-column on mobile, card grid on tablet/desktop; nav moves from bottom to top on wide screens

---

## File structure

```
PDManagement/
├── index.html                  App shell + screen router
├── mockup.html                 Static design mockup (open in browser)
├── package.json                Dev dependencies (Playwright)
├── playwright.config.js        Test configuration
│
├── css/
│   └── styles.css              Mobile-first styles, design tokens, all components
│
├── js/
│   ├── app.js                  Screen routing, nav, global init
│   ├── api.js                  fetch() wrapper, timeout, offline banner, API object
│   ├── drum-picker.js          Scroll-wheel numeric input component
│   ├── dashboard.js            Dashboard render + SVG weight chart
│   ├── measurements.js         Three-card measurement log with toggle + drum pickers
│   ├── inventory.js            Inventory display + +/− adjustments + save
│   └── prep.js                 Prep screen (what to prepare + procedure steps)
│
├── apps-script/
│   └── Code.gs                 Google Apps Script backend (all endpoints)
│
└── tests/
    ├── helpers/mock-api.js     Playwright API mock (page.route + addInitScript)
    ├── dashboard.spec.js
    ├── measurements.spec.js
    ├── inventory.spec.js
    ├── timer.spec.js           (Prep screen tests)
    └── navigation.spec.js
```

---

## Google Sheets structure

### `Daily_Measurements`
| Date | Time | Weight (kg) | BP Systolic | BP Diastolic | Bag Weight After Drainage (kg) | Notes | Measurement Type |

### `Inventory`
| Date | Item Name | Count |

*(Tall format — one row per item per save. Items are defined in the Config tab.)*

### `Config`
| Category | Key | Value |

Config rows:
- `inventory` rows define supply items and their minimum counts
- `prep_items` rows define the "what to prepare" list (Key = order number)
- `prep_steps` rows define procedure steps (Key = order number)

### `Dashboard` *(read-only, populated by API)*

---

## Deployment

### 1. Set up Google Sheets

1. Create a new Google Sheet
2. Name the 4 tabs exactly: `Daily_Measurements`, `Inventory`, `Dashboard`, `Config`
3. Open **Extensions → Apps Script**
4. Paste the contents of `apps-script/Code.gs`
5. Run `setupSheet()` once — creates headers on all tabs and populates Config with default items

### 2. Deploy as a Web App

1. Click **Deploy → New Deployment → Web App**
2. Set:
   - Execute as: **Me**
   - Who has access: **Anyone**
3. Click **Deploy** and copy the generated URL

### 3. Wire up the frontend

Open `js/api.js` and replace the placeholder:

```js
const APPS_SCRIPT_URL = window.APPS_SCRIPT_URL || 'YOUR_APPS_SCRIPT_URL_HERE';
//                                                  ↑ paste your Web App URL here
```

### 4. Open the app

Open `index.html` in any browser. For sharing, host on GitHub Pages or any static file host and share the URL.

---

## API endpoints

All requests go to the single Apps Script Web App URL.

| Method | `action` | Behaviour |
|---|---|---|
| `GET` | `getDashboard` | Latest inventory + 7-day stats + inventory config as JSON |
| `GET` | `getHistory` | Last N rows of `Daily_Measurements` |
| `GET` | `getConfig` | Prep items and procedure steps from Config tab |
| `POST` | `logMeasurement` | Append row to `Daily_Measurements` |
| `POST` | `updateInventory` | Append rows to `Inventory` (one per item) |

---

## Customising via Config sheet

All of the following can be changed by editing the `Config` tab — no code deployment needed:

| Category | What it controls |
|---|---|
| `inventory` | Which supplies are tracked and their low-stock thresholds |
| `prep_items` | The "What to Prepare" list shown on the Prep screen |
| `prep_steps` | The numbered procedure steps shown on the Prep screen |

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

142 tests across 5 spec files. The test suite mocks the Apps Script API via `page.route()` so no real Google account is needed.

---

## Known open issues

| # | Issue | Priority |
|---|---|---|
| Bug #7 | Dashboard makes two `getDashboard` calls on startup (render + connectivity check) | Low |
| Bug #8 | Dashboard tab can't be re-tapped to refresh data | Low |
