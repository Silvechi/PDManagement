import { test, expect } from '@playwright/test';
import { setupMockApi, DASHBOARD_RESPONSE, INVENTORY_CONFIG, BAG_COUNT } from './helpers/mock-api.js';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
  });

  // ── Loading & render ──────────────────────────────────────

  test('shows loading state then resolves to content', async ({ page }) => {
    await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#dash-loading')).not.toBeVisible();
    await expect(page.locator('#dash-content')).toBeVisible();
  });

  // ── Bag hero cards ────────────────────────────────────────

  test('renders a bag hero card for each bag item', async ({ page }) => {
    await expect(page.locator('.bag-hero')).toHaveCount(BAG_COUNT, { timeout: 8000 });
  });

  test('bag hero cards show concentration label', async ({ page }) => {
    for (const conc of ['1.36%', '2.27%', '3.86%']) {
      await expect(page.locator('.bag-hero-pct', { hasText: conc })).toBeVisible();
    }
  });

  test('bag hero cards include coloured dot', async ({ page }) => {
    const dots = page.locator('.bag-hero .bag-dot');
    await expect(dots).toHaveCount(BAG_COUNT, { timeout: 8000 });
  });

  test('bag hero shows correct count from API', async ({ page }) => {
    // Solution Bags 1.36% = 8
    const card = page.locator('.bag-hero').filter({ hasText: '1.36%' });
    await expect(card.locator('.bag-hero-count')).toContainText('8');
  });

  test('bag hero below threshold shows low class and low-tag', async ({ page }) => {
    // Solution Bags 3.86% = 4, min = 5 → low
    const card = page.locator('.bag-hero').filter({ hasText: '3.86%' });
    await expect(card).toHaveClass(/low/, { timeout: 8000 });
    await expect(card.locator('.low-tag')).toBeVisible();
  });

  test('bag hero well above threshold does not show low class', async ({ page }) => {
    // Solution Bags 1.36% = 8, min = 5 → not low
    const card = page.locator('.bag-hero').filter({ hasText: '1.36%' });
    await expect(card).not.toHaveClass(/low/, { timeout: 8000 });
  });

  // ── Low stock banner ──────────────────────────────────────

  test('low stock banner is shown when flags exist', async ({ page }) => {
    await expect(page.locator('.card-low-stock')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.card-low-stock')).toContainText('Gauze Pads');
  });

  test('no low stock banner when all stock is adequate', async ({ page }) => {
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
    await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.card-low-stock')).not.toBeAttached();
  });

  // ── Overdue indicator ─────────────────────────────────────

  test('overdue banner is shown when exchange time has elapsed', async ({ page }) => {
    // lastExchange 2+ days ago, bag maxHours = 6 → overdue
    await setupMockApi(page, {
      getDashboard: {
        ...DASHBOARD_RESPONSE,
        lastExchange: { date: '2026-05-21', time: '08:00' }
      }
    });
    await page.goto('/');
    await expect(page.locator('.card-overdue')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.card-overdue')).toContainText(/exchange overdue/i);
    await expect(page.locator('.card-overdue')).toContainText('max 6h');
  });

  test('overdue banner is not shown when no last exchange recorded', async ({ page }) => {
    // Default DASHBOARD_RESPONSE has no lastExchange
    await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.card-overdue')).not.toBeAttached();
  });

  // ── Vitals section ────────────────────────────────────────

  test('renders latest BP reading in vitals', async ({ page }) => {
    await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
    // Most recent BP reading is 131/85
    await expect(page.locator('.vitals-val')).toContainText('131');
    await expect(page.locator('.vitals-val')).toContainText('85');
  });

  test('renders BP average in vitals meta', async ({ page }) => {
    await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.vitals-meta')).toContainText('128/82');
  });

  // ── Weight sparkline ──────────────────────────────────────

  test('weight sparkline is rendered as inline SVG', async ({ page }) => {
    await expect(page.locator('.sparkline')).toBeVisible({ timeout: 8000 });
    // Last weight in mock trend = 71.7 kg
    await expect(page.locator('.weight-now')).toContainText('71.7');
  });

  test('weight section shows trend delta', async ({ page }) => {
    await expect(page.locator('.vitals-meta').filter({ hasText: 'kg' })).toBeVisible({ timeout: 8000 });
  });

  // ── Empty states ──────────────────────────────────────────

  test('shows no-data placeholders when API returns empty data', async ({ page }) => {
    await setupMockApi(page, {
      getDashboard: {
        inventoryConfig: [],
        inventory: {},
        lowStockFlags: '',
        weightTrend: [],
        bpRecent: [],
        bpAvg: null
      }
    });
    await page.goto('/');
    await expect(page.locator('#dash-loading')).not.toBeVisible({ timeout: 8000 });
    const noData = page.locator('.no-data');
    await expect(noData.first()).toBeVisible();
  });

  // ── Error state ───────────────────────────────────────────

  test('shows error message when API fails', async ({ page }) => {
    await setupMockApi(page, {
      getDashboard: { error: 'Sheet not found. Run setupSheet() first.' }
    });
    await page.goto('/');
    await expect(page.locator('.feedback-error')).toContainText(/failed to load/i, { timeout: 8000 });
  });
});
