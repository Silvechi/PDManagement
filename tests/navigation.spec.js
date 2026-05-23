import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api.js';

// Wait helper: ensures dashboard has finished loading before navigation tests run
async function waitForDashboard(page) {
  await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
}

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await waitForDashboard(page);
  });

  test('bottom nav renders all 6 tabs', async ({ page }) => {
    await expect(page.locator('#botnav-dashboard')).toBeVisible();
    await expect(page.locator('#botnav-measurements')).toBeVisible();
    await expect(page.locator('#botnav-inventory')).toBeVisible();
    await expect(page.locator('#botnav-history')).toBeVisible();
    await expect(page.locator('#botnav-prep')).toBeVisible();
    await expect(page.locator('#botnav-users')).toBeVisible();
  });

  test('dashboard is the default active screen', async ({ page }) => {
    await expect(page.locator('#dash-content')).toBeVisible();
    await expect(page.locator('#botnav-dashboard')).toHaveClass(/active/);
  });

  test('tapping Log tab shows measurement screen', async ({ page }) => {
    await page.locator('#botnav-measurements').click();
    await expect(page.getByRole('heading', { name: 'Log', exact: true })).toBeVisible();
    await expect(page.locator('#botnav-measurements')).toHaveClass(/active/);
  });

  test('tapping Inventory tab shows inventory screen', async ({ page }) => {
    await page.locator('#botnav-inventory').click();
    await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
    await expect(page.locator('#botnav-inventory')).toHaveClass(/active/);
  });

  test('tapping Prep tab shows prep screen', async ({ page }) => {
    await page.locator('#botnav-prep').click();
    await expect(page.getByRole('heading', { name: 'Prep', exact: true })).toBeVisible();
    await expect(page.locator('#botnav-prep')).toHaveClass(/active/);
  });

  test('each tab switch updates the active highlight', async ({ page }) => {
    const tabs = [
      { id: '#botnav-measurements', heading: 'Log'       },
      { id: '#botnav-inventory',    heading: 'Inventory' },
      { id: '#botnav-prep',         heading: 'Prep'      },
    ];
    for (const { id, heading } of tabs) {
      await page.locator(id).click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await expect(page.locator(id)).toHaveClass(/active/);
    }
  });
});
