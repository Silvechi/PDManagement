import { test, expect } from '@playwright/test';
import { setupMockApi, DASHBOARD_RESPONSE, INVENTORY_CONFIG } from './helpers/mock-api.js';

// Item IDs are index-based so any Unicode name works safely.
// Indices: 0=Bags 1.36%, 1=Bags 2.27%, 2=Bags 3.86%, 3=Caps, 4=Gauze Pads, 5=Bandages, 6=Ointment
const INV_IDS = INVENTORY_CONFIG.map((_, i) => `#inv-item-${i}`);

test.describe('Inventory Manager', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await expect(page.locator('.inv-card-grid')).toBeVisible();
    await page.locator('#nav-inventory').click();
    await expect(page.getByRole('heading', { name: 'Inventory Manager' })).toBeVisible();
  });

  // ── Initial counts seeded from dashboard data ─────────────

  test('displays current counts from dashboard data', async ({ page }) => {
    await expect(page.locator(INV_IDS[0])).toHaveValue('8');  // Bags 1.36%
    await expect(page.locator(INV_IDS[1])).toHaveValue('6');  // Bags 2.27%
    await expect(page.locator(INV_IDS[2])).toHaveValue('4');  // Bags 3.86%
    await expect(page.locator(INV_IDS[3])).toHaveValue('20'); // Caps
    await expect(page.locator(INV_IDS[4])).toHaveValue('3');  // Gauze Pads
    await expect(page.locator(INV_IDS[5])).toHaveValue('15'); // Bandages
    await expect(page.locator(INV_IDS[6])).toHaveValue('8');  // Ointment
  });

  test('shows low-stock warning for items below threshold', async ({ page }) => {
    const gauzePadsRow = page.locator('.inv-row').filter({ hasText: 'Gauze Pads' });
    await expect(gauzePadsRow).toHaveClass(/inv-low/);
    await expect(gauzePadsRow.locator('.inv-warning')).toBeVisible();
  });

  test('no low-stock warning for items well above threshold', async ({ page }) => {
    const capsRow = page.locator('.inv-row').filter({ has: page.locator('.inv-name', { hasText: 'Caps' }) });
    await expect(capsRow).not.toHaveClass(/inv-low/);
  });

  // ── + / − buttons ─────────────────────────────────────────

  test('+ button increases count by 1', async ({ page }) => {
    const row = page.locator('.inv-row').filter({ has: page.locator('.inv-name', { hasText: '1.36%' }) });
    await row.getByRole('button', { name: /increase/i }).click();
    await expect(page.locator(INV_IDS[0])).toHaveValue('9');
  });

  test('− button decreases count by 1', async ({ page }) => {
    const row = page.locator('.inv-row').filter({ has: page.locator('.inv-name', { hasText: '1.36%' }) });
    await row.getByRole('button', { name: /decrease/i }).click();
    await expect(page.locator(INV_IDS[0])).toHaveValue('7');
  });

  test('− button cannot reduce count below 0', async ({ page }) => {
    const decreaseBtn = page.locator('.inv-row')
      .filter({ hasText: 'Gauze Pads' })
      .getByRole('button', { name: /decrease/i });
    for (let i = 0; i < 5; i++) await decreaseBtn.click();
    await expect(page.locator(INV_IDS[4])).toHaveValue('0');
  });

  test('low-stock warning appears dynamically when count drops below threshold', async ({ page }) => {
    const capsRow = page.locator('.inv-row').filter({ has: page.locator('.inv-name', { hasText: 'Caps' }) });
    const decreaseBtn = capsRow.getByRole('button', { name: /decrease/i });
    for (let i = 0; i < 12; i++) await decreaseBtn.click();
    await expect(page.locator(INV_IDS[3])).toHaveValue('8');
    await expect(capsRow).toHaveClass(/inv-low/);
    await expect(capsRow.locator('.inv-warning')).toBeVisible();
  });

  // ── Direct input ──────────────────────────────────────────

  test('typing a value directly updates the count (oninput)', async ({ page }) => {
    const input = page.locator(INV_IDS[3]); // Caps
    await input.fill('50');
    await expect(input).toHaveValue('50');
    await page.getByRole('button', { name: /save inventory/i }).click();
    await expect(page.locator('#inv-feedback')).toContainText(/saved successfully/i);
  });

  // ── Save ──────────────────────────────────────────────────

  test('Save Inventory button calls API and shows success', async ({ page }) => {
    await page.getByRole('button', { name: /save inventory/i }).click();
    await expect(page.locator('#inv-feedback')).toContainText(/saved successfully/i);
  });

  test('API error shows error message', async ({ page }) => {
    await setupMockApi(page, { updateInventory: { error: 'Write failed' } });
    await page.goto('/');
    await expect(page.locator('.inv-card-grid')).toBeVisible();
    await page.locator('#nav-inventory').click();
    await page.getByRole('button', { name: /save inventory/i }).click();
    await expect(page.locator('#inv-feedback')).toContainText(/error/i);
  });

  // ── Unicode / Hebrew item names ───────────────────────────

  test('renders correctly with Hebrew item names in config', async ({ page }) => {
    await setupMockApi(page, {
      getDashboard: {
        inventoryConfig: [
          { name: 'פקקים',       min: 10 },
          { name: 'שקית צהובה', min: 5  }
        ],
        inventory: { 'פקקים': 8, 'שקית צהובה': 6 },
        lowStockFlags: 'פקקים (8 left)',
        weightTrend: [],
        bpAvg: null,
        avgProcedureDuration: null
      }
    });
    await page.goto('/');
    await expect(page.locator('.inv-card-grid')).toBeVisible();
    await page.locator('#nav-inventory').click();
    // Both items render with correct counts
    await expect(page.locator('#inv-item-0')).toHaveValue('8');
    await expect(page.locator('#inv-item-1')).toHaveValue('6');
    // Item names are visible
    await expect(page.locator('.inv-name').first()).toContainText('פקקים');
  });

  test('+ / − buttons work with Hebrew item names', async ({ page }) => {
    await setupMockApi(page, {
      getDashboard: {
        inventoryConfig: [{ name: 'פקקים', min: 10 }],
        inventory: { 'פקקים': 5 },
        lowStockFlags: '',
        weightTrend: [], bpAvg: null, avgProcedureDuration: null
      }
    });
    await page.goto('/');
    await expect(page.locator('.inv-card-grid')).toBeVisible();
    await page.locator('#nav-inventory').click();
    const increaseBtn = page.locator('.inv-row').nth(0).getByRole('button', { name: /increase/i });
    await increaseBtn.click();
    await expect(page.locator('#inv-item-0')).toHaveValue('6');
  });

  // ── Inventory tooltips ────────────────────────────────────

  // All three bag rows and Caps and Ointment have descriptions; Gauze Pads and Bandages do not.

  test('items with descriptions show ⓘ icon', async ({ page }) => {
    const row = page.locator('.inv-row').filter({ has: page.locator('.inv-name', { hasText: '1.36%' }) });
    await expect(row.locator('.inv-tip-icon')).toBeVisible();
  });

  test('items without descriptions do not show ⓘ icon', async ({ page }) => {
    const row = page.locator('.inv-row').filter({ hasText: 'Gauze Pads' });
    await expect(row.locator('.inv-tip-icon')).not.toBeVisible();
  });

  test('tip panel is hidden before clicking', async ({ page }) => {
    const row = page.locator('.inv-row').filter({ has: page.locator('.inv-name', { hasText: '1.36%' }) });
    await expect(row.locator('.inv-tip-panel')).not.toBeVisible();
  });

  test('clicking the label reveals the tip description', async ({ page }) => {
    const row = page.locator('.inv-row').filter({ has: page.locator('.inv-name', { hasText: '1.36%' }) });
    await row.locator('.inv-label').click();
    await expect(row.locator('.inv-tip-panel')).toBeVisible();
    await expect(row.locator('.inv-tip-panel')).toContainText(INVENTORY_CONFIG[0].description);
  });

  test('clicking the label again closes the tip', async ({ page }) => {
    const row = page.locator('.inv-row').filter({ has: page.locator('.inv-name', { hasText: '1.36%' }) });
    await row.locator('.inv-label').click();
    await expect(row.locator('.inv-tip-panel')).toBeVisible();
    await row.locator('.inv-label').click();
    await expect(row.locator('.inv-tip-panel')).not.toBeVisible();
  });

  test('opening a second tip closes the first', async ({ page }) => {
    const row1 = page.locator('.inv-row').filter({ has: page.locator('.inv-name', { hasText: '1.36%' }) });
    const row2 = page.locator('.inv-row').filter({ has: page.locator('.inv-name', { hasText: 'Caps' }) });
    await row1.locator('.inv-label').click();
    await expect(row1.locator('.inv-tip-panel')).toBeVisible();
    await row2.locator('.inv-label').click();
    await expect(row1.locator('.inv-tip-panel')).not.toBeVisible();
    await expect(row2.locator('.inv-tip-panel')).toBeVisible();
  });

  test('+/- buttons still work when a tip is open', async ({ page }) => {
    const row = page.locator('.inv-row').filter({ has: page.locator('.inv-name', { hasText: '1.36%' }) });
    await row.locator('.inv-label').click();
    await expect(row.locator('.inv-tip-panel')).toBeVisible();
    await row.getByRole('button', { name: /increase/i }).click();
    await expect(page.locator(INV_IDS[0])).toHaveValue('9');
    // tip should still be open after button click
    await expect(row.locator('.inv-tip-panel')).toBeVisible();
  });

  test('tooltip works with Hebrew item name and description', async ({ page }) => {
    await setupMockApi(page, {
      getDashboard: {
        inventoryConfig: [
          { name: 'פקקים', min: 10, description: 'החלף פקק אחד בכל החלפה.' }
        ],
        inventory: { 'פקקים': 5 },
        lowStockFlags: '',
        weightTrend: [], bpAvg: null, avgProcedureDuration: null
      }
    });
    await page.goto('/');
    await expect(page.locator('.inv-card-grid')).toBeVisible();
    await page.locator('#nav-inventory').click();
    const row = page.locator('.inv-row').nth(0);
    await expect(row.locator('.inv-tip-icon')).toBeVisible();
    await row.locator('.inv-label').click();
    await expect(row.locator('.inv-tip-panel')).toContainText('החלף פקק אחד בכל החלפה.');
  });

  // ── Concentration colour dots ─────────────────────────────

  test('bag concentration rows show a coloured dot', async ({ page }) => {
    for (const conc of ['1.36%', '2.27%', '3.86%']) {
      const row = page.locator('.inv-row').filter({ has: page.locator('.inv-name', { hasText: conc }) });
      await expect(row.locator('.bag-dot')).toBeVisible();
    }
  });

  test('non-concentration items do not show a coloured dot', async ({ page }) => {
    const capsRow = page.locator('.inv-row').filter({ has: page.locator('.inv-name', { hasText: 'Caps' }) });
    await expect(capsRow.locator('.bag-dot')).not.toBeAttached();
  });
});
