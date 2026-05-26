import { test, expect } from '@playwright/test';
import { setupMockApi, DASHBOARD_RESPONSE, INVENTORY_CONFIG } from './helpers/mock-api.js';

// Inventory uses inventoryConfig index for element IDs: #inv-val-N (input), #inv-bag-row-N (bag), #inv-supply-row-N (supply)
// Bags: indices 0-2 (Solution Bags 1.36%, 2.27%, 3.86%)
// Supplies: indices 3-6 (Caps, Gauze Pads, Bandages, Ointment)

// Helper: stepper buttons adjacent to an input
function stepperInc(page, inputId) {
  return page.locator(`#${inputId}`).locator('xpath=following-sibling::button[1]');
}
function stepperDec(page, inputId) {
  return page.locator(`#${inputId}`).locator('xpath=preceding-sibling::button[1]');
}

test.describe('Inventory Manager', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
    await page.locator('#botnav-inventory').click();
    await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
  });

  // ── Initial counts seeded from dashboard data ─────────────

  test('displays current bag counts from dashboard data', async ({ page }) => {
    await expect(page.locator('#inv-val-0')).toHaveValue('8');  // Bags 1.36%
    await expect(page.locator('#inv-val-1')).toHaveValue('6');  // Bags 2.27%
    await expect(page.locator('#inv-val-2')).toHaveValue('4');  // Bags 3.86%
  });

  test('displays current supply counts from dashboard data', async ({ page }) => {
    await expect(page.locator('#inv-val-3')).toHaveValue('20'); // Caps
    await expect(page.locator('#inv-val-4')).toHaveValue('3');  // Gauze Pads
    await expect(page.locator('#inv-val-5')).toHaveValue('15'); // Bandages
    await expect(page.locator('#inv-val-6')).toHaveValue('8');  // Ointment
  });

  test('shows low class for supply item below threshold', async ({ page }) => {
    // Gauze Pads = 3, min = 10 → low
    await expect(page.locator('#inv-supply-row-4')).toHaveClass(/low/);
    await expect(page.locator('#inv-supply-row-4 .low-tag')).toBeVisible();
  });

  test('shows low class for bag below threshold', async ({ page }) => {
    // Solution Bags 3.86% = 4, min = 5 → low
    await expect(page.locator('#inv-bag-row-2')).toHaveClass(/low/);
  });

  test('no low class for items above threshold', async ({ page }) => {
    // Caps = 20, min = 10 → ok
    await expect(page.locator('#inv-supply-row-3')).not.toHaveClass(/low/);
  });

  // ── + / − stepper buttons ─────────────────────────────────

  test('+ button increases bag count by 1', async ({ page }) => {
    await stepperInc(page, 'inv-val-0').click();
    await expect(page.locator('#inv-val-0')).toHaveValue('9');
  });

  test('− button decreases bag count by 1', async ({ page }) => {
    await stepperDec(page, 'inv-val-0').click();
    await expect(page.locator('#inv-val-0')).toHaveValue('7');
  });

  test('− button cannot reduce count below 0', async ({ page }) => {
    // Gauze Pads = 3 → click − 5 times → min 0
    for (let i = 0; i < 5; i++) await stepperDec(page, 'inv-val-4').click();
    await expect(page.locator('#inv-val-4')).toHaveValue('0');
  });

  test('low class appears dynamically when count drops below threshold', async ({ page }) => {
    // Caps = 20, min = 10 → click − 12 times → count = 8 → low
    for (let i = 0; i < 12; i++) await stepperDec(page, 'inv-val-3').click();
    await expect(page.locator('#inv-val-3')).toHaveValue('8');
    await expect(page.locator('#inv-supply-row-3')).toHaveClass(/low/);
    await expect(page.locator('#inv-supply-row-3 .low-tag')).toBeVisible();
  });

  test('low class is removed when count rises back above threshold', async ({ page }) => {
    // Start: Gauze Pads = 3 (low). Increment enough to exceed threshold (min=10).
    for (let i = 0; i < 8; i++) await stepperInc(page, 'inv-val-4').click();
    await expect(page.locator('#inv-val-4')).toHaveValue('11');
    await expect(page.locator('#inv-supply-row-4')).not.toHaveClass(/low/);
  });

  // ── Direct input ──────────────────────────────────────────

  test('typing a value directly into the input updates the count', async ({ page }) => {
    await page.locator('#inv-val-3').fill('50');
    await expect(page.locator('#inv-val-3')).toHaveValue('50');
  });

  // ── Save ──────────────────────────────────────────────────

  test('Save inventory button calls API and shows success', async ({ page }) => {
    await page.getByRole('button', { name: /save inventory/i }).click();
    await expect(page.locator('#inv-feedback')).toContainText(/inventory saved/i, { timeout: 5000 });
  });

  test('API error on save shows error message', async ({ page }) => {
    await setupMockApi(page, { updateInventory: { error: 'Write failed' } });
    await page.goto('/');
    await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
    await page.locator('#botnav-inventory').click();
    await page.getByRole('button', { name: /save inventory/i }).click();
    await expect(page.locator('#inv-feedback')).toContainText(/error/i, { timeout: 5000 });
  });

  // ── Bag colour dots ───────────────────────────────────────

  test('bag rows show coloured dot', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await expect(page.locator(`#inv-bag-row-${i} .bag-dot`)).toBeVisible();
    }
  });

  test('supply rows do not show coloured dot', async ({ page }) => {
    await expect(page.locator('#inv-supply-row-3 .bag-dot')).not.toBeAttached();
  });

  // ── Hebrew item names ─────────────────────────────────────

  test('renders correctly with Hebrew item names', async ({ page }) => {
    await setupMockApi(page, {
      getDashboard: {
        inventoryConfig: [
          { name: 'פקקים',       min: 10 },
          { name: 'שקית צהובה', min: 5  }
        ],
        inventory: { 'פקקים': 8, 'שקית צהובה': 6 },
        lowStockFlags: '',
        weightTrend: [],
        bpRecent: [],
        bpAvg: null
      }
    });
    await page.goto('/');
    await expect(page.locator('#dash-loading')).not.toBeVisible({ timeout: 8000 });
    await page.locator('#botnav-inventory').click();
    await expect(page.locator('#inv-val-0')).toHaveValue('8');
    await expect(page.locator('#inv-val-1')).toHaveValue('6');
  });

  // ── Hebrew display names ───────────────────────────────────

  test('Hebrew mode shows displayNameHe for bag items', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('pd_lang', 'he'); });
    await setupMockApi(page);
    await page.goto('/');
    await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
    await page.locator('#botnav-inventory').click();
    await expect(page.locator('#inv-bag-row-0')).toContainText('שקית 1.36%', { timeout: 8000 });
    await expect(page.locator('#inv-bag-row-1')).toContainText('שקית 2.27%');
    await expect(page.locator('#inv-bag-row-2')).toContainText('שקית 3.86%');
  });

  test('Hebrew mode shows displayNameHe for supply items', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('pd_lang', 'he'); });
    await setupMockApi(page);
    await page.goto('/');
    await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
    await page.locator('#botnav-inventory').click();
    await expect(page.locator('#inv-supply-row-3')).toContainText('פקקים', { timeout: 8000 });
    await expect(page.locator('#inv-supply-row-4')).toContainText('גזה');
    await expect(page.locator('#inv-supply-row-5')).toContainText('תחבושות');
    await expect(page.locator('#inv-supply-row-6')).toContainText('משחה (יחידות)');
  });

  test('English mode still shows English names when displayNameHe is set', async ({ page }) => {
    await expect(page.locator('#inv-bag-row-0')).toContainText('1.36%');
    await expect(page.locator('#inv-supply-row-3')).toContainText('Caps');
  });

  test('+/- buttons work with Hebrew item names', async ({ page }) => {
    await setupMockApi(page, {
      getDashboard: {
        inventoryConfig: [{ name: 'פקקים', min: 10 }],
        inventory: { 'פקקים': 5 },
        lowStockFlags: '',
        weightTrend: [], bpRecent: [], bpAvg: null,
        dataVersion: '2'  // differs from beforeEach cache ('1') → forces background re-fetch
      },
      getDataVersion: { version: '2' }
    });
    await page.goto('/');
    await expect(page.locator('#dash-loading')).not.toBeVisible({ timeout: 8000 });
    await page.locator('#botnav-inventory').click();
    await stepperInc(page, 'inv-val-0').click();
    await expect(page.locator('#inv-val-0')).toHaveValue('6');
  });
});
