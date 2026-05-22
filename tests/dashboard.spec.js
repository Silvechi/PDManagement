import { test, expect } from '@playwright/test';
import { setupMockApi, DASHBOARD_RESPONSE, INVENTORY_CONFIG } from './helpers/mock-api.js';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
  });

  // ── Loading & render ──────────────────────────────────────

  test('shows loading state then resolves to content', async ({ page }) => {
    await expect(page.locator('#dash-content')).toBeVisible();
    await expect(page.locator('#dash-loading')).not.toBeVisible();
  });

  test('renders inventory section with correct number of supply cards', async ({ page }) => {
    await expect(page.locator('.inv-card-grid')).toBeVisible();
    await expect(page.locator('.inv-card')).toHaveCount(INVENTORY_CONFIG.length);
  });

  // ── Inventory card labels and dots ───────────────────────

  test('bag concentration cards show shortened label and coloured dot', async ({ page }) => {
    for (const conc of ['1.36%', '2.27%', '3.86%']) {
      const card = page.locator('.inv-card').filter({ hasText: conc + ' bag' });
      await expect(card).toBeVisible();
      await expect(card.locator('.bag-dot')).toBeVisible();
    }
  });

  test('non-concentration cards do not show a coloured dot', async ({ page }) => {
    const capsCard = page.locator('.inv-card').filter({ hasText: 'Caps' });
    await expect(capsCard.locator('.bag-dot')).not.toBeAttached();
  });

  // ── Inventory card values ─────────────────────────────────

  test('inventory cards show correct counts from API', async ({ page }) => {
    const cardCounts = await page.locator('.inv-card-count').allTextContents();
    expect(cardCounts).toContain('8');  // Solution Bags 1.36%
    expect(cardCounts).toContain('6');  // Solution Bags 2.27%
    expect(cardCounts).toContain('4');  // Solution Bags 3.86%
    expect(cardCounts).toContain('20'); // Caps
    expect(cardCounts).toContain('3');  // Gauze Pads
    expect(cardCounts).toContain('15'); // Bandages
  });

  test('item below threshold shows red card', async ({ page }) => {
    // Gauze Pads = 3, threshold = 10 → red
    const classes = await page.locator('.inv-card').evaluateAll(els => els.map(e => e.className));
    expect(classes.some(c => c.includes('inv-card-red'))).toBe(true);
  });

  test('item well above threshold shows green card', async ({ page }) => {
    // Caps = 20, threshold = 10 → green (above 2× threshold)
    const classes = await page.locator('.inv-card').evaluateAll(els => els.map(e => e.className));
    expect(classes.some(c => c.includes('inv-card-green'))).toBe(true);
  });

  // ── Low stock alert banner ────────────────────────────────

  test('red alert banner is shown when low stock flags exist', async ({ page }) => {
    await expect(page.locator('.alert-banner.alert-red')).toBeVisible();
    await expect(page.locator('.alert-banner.alert-red')).toContainText('Gauze Pads');
  });

  test('no alert banner when all stock is adequate', async ({ page }) => {
    await setupMockApi(page, {
      getDashboard: {
        ...DASHBOARD_RESPONSE,
        lowStockFlags: '',
        inventory: {
          ...DASHBOARD_RESPONSE.inventory,
          'Gauze Pads':       15,
          'Ointment (units)': 12
        }
      }
    });
    await page.goto('/');
    await expect(page.locator('#dash-content')).toBeVisible();
    await expect(page.locator('.alert-banner.alert-red')).not.toBeVisible();
  });

  // ── Vitals section ────────────────────────────────────────

  test('renders last 3 BP readings', async ({ page }) => {
    const bpCard = page.locator('.stat-card-col').filter({ hasText: 'Blood Pressure' });
    const rows = bpCard.locator('.bp-reading-row');
    await expect(rows).toHaveCount(4); // 3 readings + avg
    await expect(rows.nth(0)).toContainText('125 / 79');
    await expect(rows.nth(1)).toContainText('128 / 82');
    await expect(rows.nth(2)).toContainText('131 / 85');
  });

  test('renders BP average row', async ({ page }) => {
    const bpCard = page.locator('.stat-card-col').filter({ hasText: 'Blood Pressure' });
    const avgRow = bpCard.locator('.bp-reading-row.bp-avg');
    await expect(avgRow).toContainText('128 / 82');
    await expect(avgRow).toContainText('mmHg');
  });

  // ── Weight chart ──────────────────────────────────────────

  test('weight trend chart is rendered as SVG', async ({ page }) => {
    await expect(page.locator('.weight-chart')).toBeVisible();
    const polyline = page.locator('.weight-chart polyline.chart-line');
    await expect(polyline).toBeVisible();
    const pts = await polyline.getAttribute('points');
    const pointCount = pts.trim().split(' ').length;
    expect(pointCount).toBe(7);
  });

  test('chart x-axis labels show MM-DD format', async ({ page }) => {
    const labels = await page.locator('.weight-chart .chart-label').allTextContents();
    const dateLabels = labels.filter(l => /^\d{2}-\d{2}$/.test(l));
    expect(dateLabels.length).toBeGreaterThan(0);
  });

  test('chart unit shows kg', async ({ page }) => {
    await expect(page.locator('.chart-unit')).toContainText('kg');
  });

  // ── Empty states ──────────────────────────────────────────

  test('shows "no data" placeholders when API returns empty data', async ({ page }) => {
    await setupMockApi(page, {
      getDashboard: {
        inventoryConfig: [],
        inventory: {},
        lowStockFlags: '',
        weightTrend: [],
        bpAvg: null,
        avgProcedureDuration: null
      }
    });
    await page.goto('/');
    await page.waitForSelector('#dash-content:visible');
    const noDataText = await page.locator('.no-data').allTextContents();
    expect(noDataText.length).toBeGreaterThan(0);
  });

  // ── Error state ───────────────────────────────────────────

  test('shows error message when API fails', async ({ page }) => {
    await setupMockApi(page, {
      getDashboard: { error: 'Sheet not found. Run setupSheet() first.' }
    });
    await page.goto('/');
    await expect(page.locator('.feedback-error')).toContainText(/failed to load/i);
  });
});
