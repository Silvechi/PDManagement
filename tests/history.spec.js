import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api.js';

const HISTORY_ROWS = [
  { date: '2026-05-23', time: '08:30', measurementType: 'drain_fill', bagType: '1.36%', bagWeight: '2.1', notes: 'All good' },
  { date: '2026-05-23', time: '14:15', measurementType: 'drain',      bagType: '',      bagWeight: '1.8', notes: '' },
  { date: '2026-05-22', time: '09:00', measurementType: 'fill',       bagType: '2.27%', bagWeight: '',   notes: '' },
];

async function goToHistory(page) {
  await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
  await page.locator('#botnav-history').click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
}

test.describe('History Screen', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await goToHistory(page);
  });

  // ── Structure ──────────────────────────────────────────────

  test('renders page title', async ({ page }) => {
    await expect(page.locator('.page-title')).toContainText('History');
  });

  test('renders 1W, 1M, 3M preset chips', async ({ page }) => {
    await expect(page.locator('.chip').filter({ hasText: '1W' })).toBeVisible();
    await expect(page.locator('.chip').filter({ hasText: '1M' })).toBeVisible();
    await expect(page.locator('.chip').filter({ hasText: '3M' })).toBeVisible();
  });

  test('1W chip is active by default', async ({ page }) => {
    await expect(page.locator('.chip').filter({ hasText: '1W' })).toHaveClass(/active/);
    await expect(page.locator('.chip').filter({ hasText: '1M' })).not.toHaveClass(/active/);
    await expect(page.locator('.chip').filter({ hasText: '3M' })).not.toHaveClass(/active/);
  });

  test('from and to date inputs are present', async ({ page }) => {
    await expect(page.locator('#hist-from')).toBeVisible();
    await expect(page.locator('#hist-to')).toBeVisible();
  });

  test('shows no-data message when API returns empty rows', async ({ page }) => {
    await expect(page.locator('.no-data')).toContainText(/no exchanges/i, { timeout: 8000 });
  });

  // ── Preset switching ───────────────────────────────────────

  test('clicking 3M chip makes it active and deactivates 1W', async ({ page }) => {
    await page.locator('.chip').filter({ hasText: '3M' }).click();
    await expect(page.locator('.chip').filter({ hasText: '3M' })).toHaveClass(/active/);
    await expect(page.locator('.chip').filter({ hasText: '1W' })).not.toHaveClass(/active/);
  });

  test('clicking 1M chip makes it active', async ({ page }) => {
    await page.locator('.chip').filter({ hasText: '1M' }).click();
    await expect(page.locator('.chip').filter({ hasText: '1M' })).toHaveClass(/active/);
  });

  // ── Row rendering ──────────────────────────────────────────

  test('renders exchange rows from API response', async ({ page }) => {
    await setupMockApi(page, { getHistory: { rows: HISTORY_ROWS } });
    await page.goto('/');
    await goToHistory(page);
    await expect(page.locator('.hist-row')).toHaveCount(HISTORY_ROWS.length, { timeout: 8000 });
  });

  test('drain+fill row shows correct type chip', async ({ page }) => {
    await setupMockApi(page, { getHistory: { rows: HISTORY_ROWS } });
    await page.goto('/');
    await goToHistory(page);
    await expect(page.locator('.hist-chip-drain_fill').first()).toBeVisible({ timeout: 8000 });
  });

  test('drain row shows bag weight in detail', async ({ page }) => {
    await setupMockApi(page, { getHistory: { rows: HISTORY_ROWS } });
    await page.goto('/');
    await goToHistory(page);
    await expect(page.locator('.hist-detail').filter({ hasText: '1.8' })).toBeVisible({ timeout: 8000 });
  });

  test('notes are shown when present', async ({ page }) => {
    await setupMockApi(page, { getHistory: { rows: HISTORY_ROWS } });
    await page.goto('/');
    await goToHistory(page);
    await expect(page.locator('.hist-notes')).toContainText('All good', { timeout: 8000 });
  });

  test('rows are grouped by date with a date header', async ({ page }) => {
    await setupMockApi(page, { getHistory: { rows: HISTORY_ROWS } });
    await page.goto('/');
    await goToHistory(page);
    await expect(page.locator('.hist-date-hdr')).toHaveCount(2, { timeout: 8000 });
  });

  // ── Hebrew ─────────────────────────────────────────────────

  test('Hebrew history screen renders title in Hebrew', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('pd_lang', 'he'); });
    await page.goto('/');
    await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
    await page.locator('#botnav-history').click();
    await expect(page.locator('.page-title')).toContainText('היסטוריה', { timeout: 8000 });
  });

  test('Hebrew date range separator is a left-pointing arrow', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('pd_lang', 'he'); });
    await page.goto('/');
    await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
    await page.locator('#botnav-history').click();
    await expect(page.locator('.hist-daterange-sep')).toContainText('←', { timeout: 8000 });
  });

  test('English date range separator is a right-pointing arrow', async ({ page }) => {
    await expect(page.locator('.hist-daterange-sep')).toContainText('→');
  });
});
