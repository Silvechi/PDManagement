import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api.js';

async function waitForDashboard(page) {
  await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
}

async function goToSettings(page) {
  await waitForDashboard(page);
  await page.locator('#botnav-users').click();
}

test.describe('i18n / Language', () => {
  // ── Default English behaviour ─────────────────────────────

  test('default language is English (LTR)', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await waitForDashboard(page);
    await expect(page.locator('html')).not.toHaveAttribute('dir', 'rtl');
  });

  test('nav labels are English by default', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await waitForDashboard(page);
    await expect(page.locator('#botnav-dashboard')).toContainText('Dashboard');
    await expect(page.locator('#botnav-measurements')).toContainText('Log');
    await expect(page.locator('#botnav-inventory')).toContainText('Inventory');
    await expect(page.locator('#botnav-prep')).toContainText('Prep');
  });

  // ── Switching to Hebrew ───────────────────────────────────

  test('switching to Hebrew sets dir="rtl" on <html>', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await goToSettings(page);
    await page.getByRole('button', { name: 'עברית' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('switching to Hebrew updates nav labels', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await goToSettings(page);
    await page.getByRole('button', { name: 'עברית' }).click();
    await expect(page.locator('#botnav-dashboard')).toContainText('לוח בקרה');
    await expect(page.locator('#botnav-measurements')).toContainText('רישום');
    await expect(page.locator('#botnav-inventory')).toContainText('מלאי');
  });

  test('switching to Hebrew saves "he" to localStorage', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await goToSettings(page);
    await page.getByRole('button', { name: 'עברית' }).click();
    const lang = await page.evaluate(() => localStorage.getItem('pd_lang'));
    expect(lang).toBe('he');
  });

  // ── Switching back to English ─────────────────────────────

  test('switching back to English restores LTR', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await goToSettings(page);
    await page.getByRole('button', { name: 'עברית' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('switching back to English saves "en" to localStorage', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await goToSettings(page);
    await page.getByRole('button', { name: 'עברית' }).click();
    await page.getByRole('button', { name: 'English' }).click();
    const lang = await page.evaluate(() => localStorage.getItem('pd_lang'));
    expect(lang).toBe('en');
  });

  // ── Persisted Hebrew loads correctly ─────────────────────

  test('page loads RTL when Hebrew is already stored', async ({ page }) => {
    await setupMockApi(page);
    await page.addInitScript(() => {
      localStorage.setItem('pd_lang', 'he');
    });
    await page.goto('/');
    // i18n.js reads 'he' from localStorage before any render
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await waitForDashboard(page);
    await expect(page.locator('#botnav-dashboard')).toContainText('לוח בקרה');
  });

  test('Hebrew dashboard shows RTL screen title', async ({ page }) => {
    await setupMockApi(page);
    await page.addInitScript(() => {
      localStorage.setItem('pd_lang', 'he');
    });
    await page.goto('/');
    await waitForDashboard(page);
    await expect(page.getByRole('heading', { name: 'לוח בקרה', exact: true })).toBeVisible();
  });

  // ── Language toggle active state ──────────────────────────

  test('English button is active by default', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await goToSettings(page);
    const enBtn = page.getByRole('button', { name: 'English' });
    await expect(enBtn).toHaveClass(/active/);
    const heBtn = page.getByRole('button', { name: 'עברית' });
    await expect(heBtn).not.toHaveClass(/active/);
  });

  test('Hebrew button becomes active after switching', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await goToSettings(page);
    await page.getByRole('button', { name: 'עברית' }).click();
    await expect(page.getByRole('button', { name: 'עברית' })).toHaveClass(/active/);
    await expect(page.getByRole('button', { name: 'English' })).not.toHaveClass(/active/);
  });
});
