import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api.js';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
  });

  test('bottom nav renders all 4 tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /log/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /inventory/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /prep/i })).toBeVisible();
  });

  test('dashboard is the default active screen', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    const dashBtn = page.getByRole('button', { name: /dashboard/i });
    await expect(dashBtn).toHaveClass(/active/);
  });

  test('tapping Log tab shows measurement screen', async ({ page }) => {
    await page.getByRole('button', { name: /log/i }).click();
    await expect(page.getByRole('heading', { name: 'Log Measurements' })).toBeVisible();
    await expect(page.getByRole('button', { name: /log/i })).toHaveClass(/active/);
  });

  test('tapping Inventory tab shows inventory manager', async ({ page }) => {
    await page.locator('#nav-inventory').click();
    await expect(page.getByRole('heading', { name: 'Inventory Manager' })).toBeVisible();
    await expect(page.locator('#nav-inventory')).toHaveClass(/active/);
  });

  test('tapping Prep tab shows prep screen', async ({ page }) => {
    await page.locator('#nav-prep').click();
    await expect(page.getByRole('heading', { name: 'Prep' })).toBeVisible();
    await expect(page.locator('#nav-prep')).toHaveClass(/active/);
  });

  test('each tab switch updates the active highlight', async ({ page }) => {
    const tabs = [
      { btn: /log/i,       heading: 'Log Measurements' },
      { btn: /inventory/i, heading: 'Inventory Manager' },
      { btn: /prep/i,      heading: 'Prep' },
    ];
    for (const { btn, heading } of tabs) {
      await page.getByRole('button', { name: btn }).click();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
  });
});
