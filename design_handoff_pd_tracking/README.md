# Handoff: PD (Peritoneal Dialysis) Tracking App

## Overview

A personal tracking app for peritoneal dialysis (PD) patients. Lets the user:

- **Log** drainage exchanges (bag out → bag in), body weight, and blood pressure measurements
- **Track inventory** of solution bags (three concentrations) and consumable supplies
- **See a dashboard** with stock-at-a-glance, latest vitals, weight trend, and recent exchanges
- **Reference** a static prep checklist & procedure for the exchange ritual

The redesign solves four UX problems in the original mockups:

1. **Bag concentration was visually buried.** Every reference to a solution bag now uses a strong color-coded chip — yellow for 1.36% (low dextrose), green for 2.27% (medium), magenta for 3.86% (high). This is the single most important visual rule in the system.
2. **Date/time inputs dominated every form.** Replaced with a small `Now · Today 2:52 PM` pill that auto-fills to the current moment; tap to expand a `datetime-local` field for backdating.
3. **Numeric entry used an awkward scroll-wheel that only showed one column.** Now a proper iOS-style drum scroller — one wheel per digit with scroll-snap, fade falloff, and an accent band.
4. **No responsive story.** One layout adapts via CSS container queries to desktop, iPad, and Samsung Galaxy S25 (top tabs become bottom nav, three-column grids stack, drum scrollers scale down).

Dark mode is fully supported with calibrated contrast (no gray-on-black foot-guns).

## About the Design Files

The files in this bundle are **design references created in HTML / React / vanilla CSS** — prototypes showing the intended look and behavior, not production code to copy directly.

Your task is to **recreate these HTML designs in the target codebase's existing environment** (React Native, SwiftUI, Flutter, Next.js, etc.) using its established patterns, design system, and component library. If no codebase exists yet, choose the most appropriate framework for the use case (likely React + Vite, or a mobile-first framework given the audience) and implement there.

The prototype is wrapped in a `DesignCanvas` host that shows three device viewports side-by-side (Desktop, iPad, Galaxy S25) for comparison. That canvas chrome is **not** part of the design — only the contents of each artboard are.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, and interactions are all locked in. Recreate pixel-faithfully using the codebase's existing libraries.

---

## Screens / Views

### 1. Dashboard

**Purpose:** At-a-glance status. The first thing the user sees when they open the app. Three questions it answers: *Do I have enough bags? What were my last vitals? When was my last exchange?*

**Layout:**
- Top app bar (desktop/tablet) or hidden (phone, where bottom nav is used)
- Page header: greeting "Hi, Yael" + "Today, Fri May 22" + "Quick log" primary CTA (right-aligned)
- Stack of cards with 16px gap (12px on phone):
  1. **Solution bags** — 3-column grid (stacks to 1 column at ≤ 480px container width) of large color-coded tiles
  2. **Supplies** — 6-column grid (3 at ≤ 700px, 2 at ≤ 380px) of small centered tiles
  3. **Latest vitals + Weight** — two-column grid (stacks at ≤ 700px)
  4. **Recent exchanges** — list of activity rows

**Components:**

**Bag hero tile** (one per concentration)
- Background: `var(--bag-soft)` (e.g. `#FCEFD0` for low) with 1.5px border at 30% bag color
- Decorative circle in bottom-right: 90×90px, bag color at 18% opacity, positioned `right: -20px; bottom: -30px`
- 14×14px content padding (`14px 16px 16px`)
- Content vertical stack:
  - Top row: 28px circular bag-color dot + bag percentage (14px / 700 weight)
  - Count: 44px / 700 weight, tabular-nums, bag-deep color, `letter-spacing: -0.03em`
  - Bottom: either `bags in stock` (small muted) OR a "low" pill (bag color background, white text, uppercase 10px / 700)
- Low state: `box-shadow: inset 0 0 0 1px var(--bag)` (an inner ring)

**Supply tile**
- Background: `var(--surface-2)`, 1px `var(--border-2)` border, `10px` radius
- Padding `8px 6px 9px`, center-aligned column
- Label: 10px / 600 weight, uppercase, `letter-spacing: 0.06em`, `var(--text-3)`
- Value: 20px / 700 weight, tabular-nums, line-height 1.2
- Low state: value colors to `var(--warn)`, small warn icon appears next to value

**Vitals card** (Latest BP)
- Card title "Latest vitals" + small "Log →" link
- Big BP value: 32px / 700, tabular-nums (e.g. `124/82 mmHg`), slash in `var(--text-3)`
- Meta line: 12px `var(--text-3)`, format: `{relative time} · 3-day avg {avg}/{avg}`

**Weight card**
- Title "Weight" + "Log →" link
- Big current weight: 36px / 700, tabular-nums, `kg` unit small + muted
- Inline sparkline (160 × 44px SVG): last 7 weight values, accent-color polyline, filled dot on last point
- Meta line: `7-day trend · +0.2 kg` or `-0.1 kg`

**Activity row** (Recent exchanges, 5 most recent)
- Horizontal: bag chip (small) | "drained 2.3 kg" + "2h ago" | time on right
- 1px bottom border between rows (`var(--border-2)`), gone on last row

---

### 2. Log

**Purpose:** Record a new exchange (drainage) or measurement (body weight, BP).

**Layout:**
- Page header: "Log" / "Record an exchange or measurement"
- Sub-nav: pill-style segmented control with 3 tabs (Drainage, Weight, BP), each with a leading icon
- `NowPill` (compact date/time) — sits between the sub-nav and the form
- Form cards (vary by tab) stacked vertically
- Full-width primary "Save" button at the bottom

**NowPill component** (used across all Log tabs)
- 8px × 14px padding, 100px radius, `var(--surface)` background, 1px border `var(--border)`
- Pulsing green dot (8px, with 0 0 0 3px halo) + `<strong>Now</strong> · Today 2:52 PM` + tiny pencil icon
- Tap → expands a 240px+ popover with a `<input type="datetime-local">`, "Reset to now" ghost button, and a primary "Done" button
- Hover: border becomes accent, background tints to accent-soft

#### Drainage tab

- **Exchange type** card — 3-button segmented row: Drain + Fill / Drain only / Fill only. Selected state: accent background, white text, 600 weight.
- **Drained (bag out)** card (visible for Drain+Fill, Drain only) — drum scroller (X.X kg)
- **New bag going in** card (visible for Drain+Fill, Fill only) — 3-column grid of large bag picker cards (stacks at ≤ 480px). Each card shows: 28px bag dot · `1.36%` (22px/700) · `54 in stock` (11px muted). Selected: bag-soft background, 1.5px bag-color border, soft outer ring (3px halo at 18% opacity), and a check badge in the top-right corner (22px circle, bag color, white check).
- **Supplies used** card — two stepper rows: `bags` and `caps`
- **Notes** card — textarea, 70px min-height, placeholder "Anything to remember…"
- **Save button** (full-width, primary) — content: bag-color dot + "Save drain + fill · **1.36%**"

#### Weight tab

- **Body weight** card with subtitle "Empty bladder, no shoes — same time each day" + a drum scroller (XXX.X kg, 4 wheels)
- **Notes** card
- **Save button** — "Save weight · 64.5 kg"

#### BP tab

- **Blood pressure** card with two drum scrollers separated by a thin slash, mmHg unit on the right
- Status pill below the drum: `ok` (green) / `mid` (warn-yellow) / `warn` (red) with descriptive text
- **Notes** card
- **Save button** — "Save BP · 120/80"

**Drum scroller (DigitWheel)** — the centerpiece interaction
- 220px tall (5 × 44px items), 52px wide for single-digit wheels, 78px for 2-digit wheels (when used)
- Inside a `.drum-picker` container: 4px×10px padding, 16px radius, `var(--surface-2)` background, 1px `var(--border)` border
- Each digit wheel is `overflow-y: auto` with `scroll-snap-type: y mandatory` and `scroll-snap-align: center` on each item
- 88px transparent padding (top and bottom) so the first/last item can center in the band
- Items: 30px / 600 weight, tabular-nums, `letter-spacing: -0.01em`
- Center item: opacity 1
- Items 1 step away: opacity 0.45
- Items 2 steps away: opacity 0.18
- Further: opacity 0 (invisible but still in scroll flow)
- **Band** (the "selected" indicator): absolute, 100% wide ± 2px, 44px tall, vertically centered (`top: 50%; transform: translateY(-50%)`); 1.5px top+bottom border in `var(--drum-accent, var(--accent))`; background `color-mix(in srgb, var(--drum-accent) 9%, transparent)`
- **Fade gradients** (top + bottom of wheel, 88px tall): `linear-gradient(var(--drum-bg) 25%, transparent)` — fades the off-axis items into the picker background
- Snap timing: on scroll end (110ms after last scroll event), round `scrollTop / 44` to nearest item index, call `onChange(value)`, and hard-snap the element
- Click on a non-center item: smooth-scrolls that item into the band
- For the drainage drum, the band accent **inherits the selected bag color** (passed in via `--drum-accent`). For body weight and BP, defaults to the app accent.

**Number composition** for drum-based values
- Helpers: `decompose(value, intDigits, decimals)` returns `[d0, d1, ...]`; `compose(arr, decimals)` returns the number back
- Drainage: `decompose(2.1, 1, 1)` → `[2, 1]` (ones + tenth)
- Body weight: `decompose(64.5, 3, 1)` → `[0, 6, 4, 5]` (hundreds + tens + ones + tenth); hundreds wheel maxes at 2
- BP: `decompose(120, 3, 0)` → `[1, 2, 0]`; systolic hundreds wheel maxes at 2, diastolic at 1

---

### 3. Inventory

**Purpose:** Manually adjust counts of bags and supplies — what the user does after a delivery, or to correct drift.

**Layout:**
- Page header: "Inventory" / "Adjust counts as you use or restock"
- **Solution bags** card — 3 rows, each a horizontal layout of (28px bag dot · `1.36%` 16px/700 in bag-deep color, "Warn below 5" hint) on the left and a stepper on the right. Background tinted with bag-soft. Low state: 1.5px ring in bag color.
- **Other supplies** card — list of supplies. Each row: label (with optional low tag) + small hint underneath / stepper on the right. Bottom border between rows.
- Full-width "Save inventory" button at bottom

**Stepper component** — pill-style with two circular −/+ buttons flanking the value
- 100px radius outer pill, `var(--surface-2)` background, 1px border
- Buttons: 32px circle, `var(--surface)` background, hover → accent-soft
- Value: 16px / 700, tabular-nums, min 32px wide

---

### 4. Prep

**Purpose:** Static reference card for the exchange procedure. **Read-only — no checkboxes.**

**Layout:**
- Page header: "Prep" / "Reference card for the exchange procedure"
- **What to prepare** card — 2-column grid (single column at ≤ 480px) of items. Each item is a small dot + label.
- **Procedure** card — numbered list. Each step has a 26px circle with the step number in accent color, and the step text on the right.

---

## Navigation

**Top tabs (desktop / iPad, container ≥ 600px):**
- Header bar: brand (left) + horizontal tab nav (center-left) + avatar (right)
- 4 tabs: Dashboard, Log, Inventory, Prep
- Each: icon + label, 8px×14px padding, 9px radius
- Active: `var(--accent-soft)` background, `var(--accent-deep)` text

**Bottom nav (phone, container ≤ 600px):**
- Replaces the top tab nav (top bar still shows just brand + avatar)
- 4 buttons, stacked icon-over-label, 22px icon, 11px label
- Active: `var(--accent)` color

The whole switch is driven by a single `@container pd (max-width: 600px)` rule.

---

## Interactions & Behavior

### State

The app has one root state object held in `PDApp`:

```ts
type State = {
  bags: { low: number; med: number; high: number };
  supplies: { caps: number; gauze: number; salt: number; ointment: number; big: number; small: number };
  vitals: { sys: number; dia: number; at: number /* timestamp ms */ }[];
  weight: { kg: number; at: number }[];
  log: { bag: 'low' | 'med' | 'high'; drained: number; at: number }[];
};
```

Each screen receives `state` and `setState` (or a thinner subset). Form state on the Log screen is local-to-component until "Save".

### Transitions

- Navigating tabs: no animation in the prototype (instant swap). In a real app, consider a 150ms cross-fade.
- Drum scrolling: native scroll with `scroll-snap` + a 110ms debounced snap-back to guarantee precise alignment
- NowPill open/close: instant in the prototype, ideal would be a 120ms scale+fade
- Hover states on cards/buttons: 0.15s `background` + `border-color` + `transform` transitions

### Responsive rules

| Container width | Layout changes |
|---|---|
| ≥ 700px | Two-column dashboard (vitals + weight). Six-column supplies grid. |
| ≤ 700px | Single column. Supplies: 3 columns. |
| ≤ 600px | Bottom nav replaces top tabs. Cards tighten (14px → 12px padding). |
| ≤ 480px | Bag hero stacks to 1 column. Bag pick stacks to 1 column. Drum scrollers scale to 92%. |
| ≤ 420px | Brand name hides (just the mark remains). |
| ≤ 380px | Supplies: 2 columns. Drum scrollers scale to 84%. |

### Dark mode

Apply via `[data-theme="dark"]` on a body / root element. Both light and dark token sets are defined in `pd-styles.css`. Special rules layered on top:

- **Bag colors brighten** in dark mode via `color-mix(in srgb, var(--bag) 50%, #fff 50%)` so they pop against deep surfaces
- **Bag-tinted backgrounds** become deeper: `color-mix(in srgb, var(--bag) 22%, #131316 78%)` for hero tiles, `color-mix(in srgb, var(--bag) 18%, #1a1a1d 82%)` for inventory rows
- Top bar and bottom nav darken to `#131316` to lift cards
- All secondary text (`vitals-meta`, `activity-meta`, hints, etc.) goes to `#a8a39b` (above WCAG AA on `#1a1a1d`)
- Stepper buttons get a translucent white background instead of a raised surface card

---

## Design Tokens

### Colors — light

| Token | Value | Use |
|---|---|---|
| `--bg` | `#f6f5f1` | Page background (warm off-white) |
| `--surface` | `#ffffff` | Cards, top bar |
| `--surface-2` | `#faf9f6` | Tile backgrounds, stepper, drum-picker |
| `--text` | `#1a1815` | Primary copy |
| `--text-2` | `#58544d` | Secondary copy |
| `--text-3` | `#8a857d` | Muted / tertiary copy |
| `--border` | `rgba(20, 16, 10, 0.09)` | Hairline borders |
| `--border-2` | `rgba(20, 16, 10, 0.05)` | Even softer borders |
| `--accent` | `#2a5fd6` | Primary action color |
| `--accent-soft` | `#e6edfb` | Accent backgrounds |
| `--accent-deep` | `#163892` | Accent text on light surfaces |
| `--ok` | `#2BA15A` | BP "ok" status |
| `--warn` | `#C6802C` | BP "elevated", low-stock |
| `--danger` | `#C0392B` | BP "high" status |

### Colors — dark

| Token | Value |
|---|---|
| `--bg` | `#0d0d0f` |
| `--surface` | `#1a1a1d` |
| `--surface-2` | `#242429` |
| `--text` | `#f5f4f1` |
| `--text-2` | `#c8c5be` |
| `--text-3` | `#918d84` |
| `--border` | `rgba(255, 255, 255, 0.10)` |
| `--border-2` | `rgba(255, 255, 255, 0.06)` |
| `--accent` | `#7c9bff` |
| `--accent-soft` | `rgba(124, 155, 255, 0.18)` |
| `--accent-deep` | `#c9d6ff` |
| `--ok` | `#5dd494` |
| `--warn` | `#f0b56b` |
| `--danger` | `#ee7e6e` |

### Bag colors — **the design's signature**

| Bag | `--bag` | `--bag-soft` | `--bag-deep` |
|---|---|---|---|
| 1.36% (low dextrose) | `#E8A317` | `#FCEFD0` | `#7A5210` |
| 2.27% (medium) | `#2BA15A` | `#D5EFDF` | `#13502A` |
| 3.86% (high) | `#D6347B` | `#FADCE8` | `#6E1340` |

The bag color is applied via CSS custom properties on a wrapper element — every bag-tinted component reads `var(--bag)`, `var(--bag-soft)`, `var(--bag-deep)` rather than hardcoding. This is what lets a single component template render in three colors.

### Typography

- Font family: **Inter** (loaded from Google Fonts, weights 400, 500, 600, 700)
- Numeric content: `font-variant-numeric: tabular-nums` (essential for drum scrollers and any large number display)
- Letter-spacing on big numbers: `-0.02em` to `-0.04em`
- Card titles: 13px / 600, uppercase, `letter-spacing: 0.08em`, `var(--text-2)`
- Page titles: 28px / 700, `letter-spacing: -0.02em` (24px on phone)

### Spacing & radii

- Card padding: 18px 20px (14px 16px on phone)
- Page padding: 24px 28px 40px (16px 14px 24px on phone)
- Gap between cards: 16px (12px on phone)
- Radius scale: `9px` (small/buttons), `14px` (cards/tiles), `100px` (pills)

### Shadows

- `--shadow`: `0 1px 2px rgba(20, 16, 10, 0.04), 0 8px 24px rgba(20, 16, 10, 0.04)` — cards
- `--shadow-2`: `0 1px 2px rgba(20, 16, 10, 0.05), 0 16px 40px rgba(20, 16, 10, 0.08)` — popovers
- In dark mode both shadows shift to `rgba(0,0,0,0.4–0.5)` opacity

---

## Assets

All icons in the prototype are **inline SVGs** drawn as single-stroke line icons (1.6–1.7px stroke width, round caps & joins). They're defined in the `I` object in `pd-app.jsx`. In a real codebase, swap them for your icon library equivalents:

- `home` — house outline
- `log` — plus
- `box` — package / inventory cube
- `prep` — checkmark inside a square
- `edit` — pencil
- `plus`, `minus`, `check`, `warn` — utility glyphs
- `drop` — water drop (drainage)
- `scale` — clock face (weight, time)
- `heart` — heart-rate line (BP)

**No raster assets, no custom illustrations, no logos** in the design. The brand mark is a small CSS-drawn gradient square. Replace with a real logo when implementing.

---

## Files in this bundle

| File | What's in it |
|---|---|
| `PD Tracking.html` | Entry HTML; mounts React, loads JSX files, wraps app in three device frames on a DesignCanvas (Desktop, iPad, Galaxy S25 — light + dark). **Treat the DesignCanvas chrome as scaffolding, not part of the design.** |
| `pd-app.jsx` | Core primitives: `BAGS`/`BAG_LIST` color system, `BagChip`, `NowPill`, `Stepper`, `DigitWheel` (the drum scroller), `WeightEntry`, `BodyWeightEntry`, `BPEntry`. Plus the inline icon set `I`. |
| `pd-dashboard.jsx` | `Dashboard` screen + shared `Card`, `Stat`, `PageHead`, `Sparkline`, `timeAgo`, `avg` helpers. |
| `pd-screens.jsx` | `LogScreen`, `InventoryScreen`, `PrepScreen`. |
| `pd-shell.jsx` | `PDApp` — the routing shell (top tabs / bottom nav) + the seed data factory (`makeSeed`). |
| `pd-styles.css` | All design tokens (both light + dark) and every component style. Uses **CSS container queries** (`@container pd (max-width: ...)`) for responsiveness — make sure your target supports them or adapt to media queries. |

---

## Recommended implementation order

1. **Tokens first.** Port the CSS custom properties from `pd-styles.css` to your target's token system (Tailwind config, Vanilla Extract, styled-system, etc.). Especially get the three bag color trios right — everything depends on them.
2. **Build the bag color primitives.** A `<BagDot>`, `<BagChip>`, and a wrapper that exposes `--bag`, `--bag-soft`, `--bag-deep` as CSS variables. Once these work, the rest of the bag UI falls out.
3. **Drum scroller.** This is the trickiest component. The implementation uses native `scroll-snap` plus a debounced `onScroll` listener — straightforward in React with `useRef` + `useEffect`. Test on touch devices early.
4. **Layout shell** (top tab + bottom nav swap). Get the container-query responsive behavior in place before filling out content.
5. **Screens in order:** Inventory (simplest) → Dashboard → Log → Prep.
6. **Dark mode.** Wire up the toggle, then visually QA each screen at both themes — pay extra attention to bag-tinted areas and the drum band.
