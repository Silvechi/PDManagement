import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api.js';

test.describe('Log Measurements', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await page.getByRole('button', { name: /log/i }).click();
    await expect(page.getByRole('heading', { name: 'Log Measurements' })).toBeVisible();
  });

  // ── Toggle bar ────────────────────────────────────────────

  test('renders three toggle buttons', async ({ page }) => {
    await expect(page.locator('#meas-tab-bag')).toBeVisible();
    await expect(page.locator('#meas-tab-weight')).toBeVisible();
    await expect(page.locator('#meas-tab-bp')).toBeVisible();
  });

  test('Drainage is the default active tab', async ({ page }) => {
    await expect(page.locator('#meas-tab-bag')).toHaveClass(/meas-tab-active/);
    await expect(page.locator('#m-bag-card')).toBeVisible();
    await expect(page.locator('#m-weight-card')).not.toBeVisible();
    await expect(page.locator('#m-bp-card')).not.toBeVisible();
  });

  test('switching to Weight shows weight card and hides others', async ({ page }) => {
    await page.locator('#meas-tab-weight').click();
    await expect(page.locator('#m-weight-card')).toBeVisible();
    await expect(page.locator('#m-bag-card')).not.toBeVisible();
    await expect(page.locator('#meas-tab-weight')).toHaveClass(/meas-tab-active/);
  });

  test('switching to BP shows BP card', async ({ page }) => {
    await page.locator('#meas-tab-bp').click();
    await expect(page.locator('#m-bp-card')).toBeVisible();
    await expect(page.locator('#m-bag-card')).not.toBeVisible();
  });

  // ── Date/time pre-fill ────────────────────────────────────

  test('drainage date is pre-filled with today in local time', async ({ page }) => {
    const now = new Date();
    const expected = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
    await expect(page.locator('#bag-date')).toHaveValue(expected);
  });

  test('drainage time is pre-filled with HH:MM format', async ({ page }) => {
    const val = await page.locator('#bag-time').inputValue();
    expect(val).toMatch(/^\d{2}:\d{2}$/);
  });

  test('weight date is pre-filled', async ({ page }) => {
    await page.locator('#meas-tab-weight').click();
    const now = new Date();
    const expected = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
    await expect(page.locator('#wt-date')).toHaveValue(expected);
  });

  // ── Drum pickers ──────────────────────────────────────────

  test('drainage card has two drum pickers', async ({ page }) => {
    await expect(page.locator('#bag-int-dp .dp')).toBeVisible();
    await expect(page.locator('#bag-dec-dp .dp')).toBeVisible();
  });

  test('weight card has two drum pickers', async ({ page }) => {
    await page.locator('#meas-tab-weight').click();
    await expect(page.locator('#wt-int-dp .dp')).toBeVisible();
    await expect(page.locator('#wt-dec-dp .dp')).toBeVisible();
  });

  test('BP card has two drum pickers', async ({ page }) => {
    await page.locator('#meas-tab-bp').click();
    await expect(page.locator('#bp-sys-dp .dp')).toBeVisible();
    await expect(page.locator('#bp-dia-dp .dp')).toBeVisible();
  });

  test('drum pickers show selected value in center slot', async ({ page }) => {
    // Default bag int = 2
    await expect(page.locator('#bag-int-dp .dp-selected')).toContainText('2');
  });

  // ── Drum picker interaction ───────────────────────────────

  test('keyboard ArrowUp increments bag integer picker', async ({ page }) => {
    const dp = page.locator('#bag-int-dp .dp');
    await dp.focus();
    await dp.press('ArrowUp');
    await expect(page.locator('#bag-int-dp .dp-selected')).toContainText('3');
  });

  test('keyboard ArrowDown decrements bag integer picker', async ({ page }) => {
    const dp = page.locator('#bag-int-dp .dp');
    await dp.focus();
    await dp.press('ArrowDown');
    await expect(page.locator('#bag-int-dp .dp-selected')).toContainText('1');
  });

  test('keyboard ArrowUp on weight picker increments', async ({ page }) => {
    await page.locator('#meas-tab-weight').click();
    const dp = page.locator('#wt-int-dp .dp');
    await dp.focus();
    await dp.press('ArrowUp');
    await expect(page.locator('#wt-int-dp .dp-selected')).toContainText('66');
  });

  // ── Bag type selector ────────────────────────────────────

  test('bag type selector shows three concentration options', async ({ page }) => {
    await expect(page.getByRole('button', { name: '1.36%' })).toBeVisible();
    await expect(page.getByRole('button', { name: '2.27%' })).toBeVisible();
    await expect(page.getByRole('button', { name: '3.86%' })).toBeVisible();
  });

  test('1.36% is active by default', async ({ page }) => {
    await expect(page.getByRole('button', { name: '1.36%' })).toHaveClass(/bag-type-active/);
    await expect(page.getByRole('button', { name: '2.27%' })).not.toHaveClass(/bag-type-active/);
    await expect(page.getByRole('button', { name: '3.86%' })).not.toHaveClass(/bag-type-active/);
  });

  test('clicking a concentration activates it and deactivates others', async ({ page }) => {
    await page.getByRole('button', { name: '2.27%' }).click();
    await expect(page.getByRole('button', { name: '2.27%' })).toHaveClass(/bag-type-active/);
    await expect(page.getByRole('button', { name: '1.36%' })).not.toHaveClass(/bag-type-active/);
    await expect(page.getByRole('button', { name: '3.86%' })).not.toHaveClass(/bag-type-active/);
  });

  test('bag type resets to 1.36% after successful submit', async ({ page }) => {
    await page.getByRole('button', { name: '3.86%' }).click();
    await expect(page.getByRole('button', { name: '3.86%' })).toHaveClass(/bag-type-active/);
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/saved/i);
    await expect(page.getByRole('button', { name: '1.36%' })).toHaveClass(/bag-type-active/);
    await expect(page.getByRole('button', { name: '3.86%' })).not.toHaveClass(/bag-type-active/);
  });

  // ── Submit happy path ─────────────────────────────────────

  test('Save Drainage calls API and shows success', async ({ page }) => {
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/saved/i);
  });

  test('Save Weight calls API and shows success', async ({ page }) => {
    await page.locator('#meas-tab-weight').click();
    await page.locator('#wt-submit').click();
    await expect(page.locator('#wt-feedback')).toContainText(/saved/i);
  });

  test('Save Blood Pressure calls API and shows success', async ({ page }) => {
    await page.locator('#meas-tab-bp').click();
    await page.locator('#bp-submit').click();
    await expect(page.locator('#bp-feedback')).toContainText(/saved/i);
  });

  // ── Validation ────────────────────────────────────────────

  test('clearing drainage date and submitting shows error', async ({ page }) => {
    await page.locator('#bag-date').fill('');
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/date and time are required/i);
  });

  test('clearing weight date and submitting shows error', async ({ page }) => {
    await page.locator('#meas-tab-weight').click();
    await page.locator('#wt-date').fill('');
    await page.locator('#wt-submit').click();
    await expect(page.locator('#wt-feedback')).toContainText(/date and time are required/i);
  });

  // ── API error ─────────────────────────────────────────────

  test('API error shows error in drainage feedback', async ({ page }) => {
    await setupMockApi(page, { logMeasurement: { error: 'Spreadsheet not found' } });
    await page.goto('/');
    await page.getByRole('button', { name: /log/i }).click();
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/error/i);
  });

  // ── Post-submit state ─────────────────────────────────────

  test('notes field clears after successful drainage submit', async ({ page }) => {
    await page.locator('#bag-notes').fill('Some notes');
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/saved/i);
    await expect(page.locator('#bag-notes')).toHaveValue('');
  });

  test('date refreshes to today after successful weight submit', async ({ page }) => {
    await page.locator('#meas-tab-weight').click();
    const now = new Date();
    const expected = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
    await page.locator('#wt-submit').click();
    await expect(page.locator('#wt-feedback')).toContainText(/saved/i);
    await expect(page.locator('#wt-date')).toHaveValue(expected);
  });

  // ── Procedure type toggle ─────────────────────────────────

  test('procedure type toggle renders three buttons', async ({ page }) => {
    await expect(page.locator('#proc-btn-both')).toBeVisible();
    await expect(page.locator('#proc-btn-drain')).toBeVisible();
    await expect(page.locator('#proc-btn-fill')).toBeVisible();
  });

  test('"Drain + Fill" is the default active procedure type', async ({ page }) => {
    await expect(page.locator('#proc-btn-both')).toHaveClass(/proc-type-active/);
    await expect(page.locator('#proc-btn-drain')).not.toHaveClass(/proc-type-active/);
    await expect(page.locator('#proc-btn-fill')).not.toHaveClass(/proc-type-active/);
  });

  test('both drain and fill sections visible by default', async ({ page }) => {
    await expect(page.locator('#bag-drain-section')).toBeVisible();
    await expect(page.locator('#bag-fill-section')).toBeVisible();
  });

  test('switching to "Drain only" hides fill section', async ({ page }) => {
    await page.locator('#proc-btn-drain').click();
    await expect(page.locator('#bag-drain-section')).toBeVisible();
    await expect(page.locator('#bag-fill-section')).not.toBeVisible();
    await expect(page.locator('#proc-btn-drain')).toHaveClass(/proc-type-active/);
  });

  test('switching to "Fill only" hides drain section', async ({ page }) => {
    await page.locator('#proc-btn-fill').click();
    await expect(page.locator('#bag-fill-section')).toBeVisible();
    await expect(page.locator('#bag-drain-section')).not.toBeVisible();
    await expect(page.locator('#proc-btn-fill')).toHaveClass(/proc-type-active/);
  });

  test('submit button label updates with procedure type', async ({ page }) => {
    await expect(page.locator('#bag-submit')).toContainText('Save Drainage');
    await page.locator('#proc-btn-drain').click();
    await expect(page.locator('#bag-submit')).toContainText('Save Drain');
    await page.locator('#proc-btn-fill').click();
    await expect(page.locator('#bag-submit')).toContainText('Save Fill');
  });

  // ── Usage counters ────────────────────────────────────────

  test('usage counters default to 1 bag and 1 cap', async ({ page }) => {
    await expect(page.locator('#usage-bags-val')).toHaveText('1');
    await expect(page.locator('#usage-caps-val')).toHaveText('1');
  });

  test('usage + button increments bags', async ({ page }) => {
    await page.locator('#usage-bags-inc').click();
    await expect(page.locator('#usage-bags-val')).toHaveText('2');
    await page.locator('#usage-bags-inc').click();
    await expect(page.locator('#usage-bags-val')).toHaveText('3');
  });

  test('usage − button decrements bags, minimum 0', async ({ page }) => {
    await page.locator('#usage-bags-dec').click();
    await expect(page.locator('#usage-bags-val')).toHaveText('0');
    // Cannot go below 0
    await page.locator('#usage-bags-dec').click();
    await expect(page.locator('#usage-bags-val')).toHaveText('0');
  });

  test('usage counters hidden in drain-only mode', async ({ page }) => {
    await page.locator('#proc-btn-drain').click();
    await expect(page.locator('#usage-bags-val')).not.toBeVisible();
    await expect(page.locator('#usage-caps-val')).not.toBeVisible();
  });

  test('usage counters reset to 1 after successful submit', async ({ page }) => {
    await page.locator('#usage-bags-inc').click();
    await page.locator('#usage-caps-inc').click();
    await expect(page.locator('#usage-bags-val')).toHaveText('2');
    await expect(page.locator('#usage-caps-val')).toHaveText('2');
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/saved/i);
    await expect(page.locator('#usage-bags-val')).toHaveText('1');
    await expect(page.locator('#usage-caps-val')).toHaveText('1');
  });

  // ── Procedure type submit messages ────────────────────────

  test('"Drain only" submit shows "Drain saved."', async ({ page }) => {
    await page.locator('#proc-btn-drain').click();
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/drain saved/i);
  });

  test('"Fill only" submit shows "Fill saved."', async ({ page }) => {
    await page.locator('#proc-btn-fill').click();
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/fill saved/i);
  });

  // ── Inventory deduction ───────────────────────────────────

  test('Drain+Fill submit calls updateInventory with correct absolute counts', async ({ page }) => {
    const postBodies = [];
    await page.route('http://localhost:3333/mock-api**', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') postBodies.push(JSON.parse(req.postData() || '{}'));
      await route.fallback();
    });
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/saved/i);
    const invCall = postBodies.find(b => b.action === 'updateInventory');
    expect(invCall).toBeDefined();
    // Mock has Solution Bags 1.36% = 8, Caps = 20 → after deducting 1 each: 7 and 19
    expect(invCall.items.find(i => i.name === 'Solution Bags 1.36%')?.count).toBe(7);
    expect(invCall.items.find(i => i.name === 'Caps')?.count).toBe(19);
  });

  test('Drain-only submit does NOT call updateInventory', async ({ page }) => {
    const postBodies = [];
    await page.route('http://localhost:3333/mock-api**', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') postBodies.push(JSON.parse(req.postData() || '{}'));
      await route.fallback();
    });
    await page.locator('#proc-btn-drain').click();
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/saved/i);
    expect(postBodies.find(b => b.action === 'updateInventory')).toBeUndefined();
  });

  test('adjusted usage quantities are reflected in inventory count', async ({ page }) => {
    const postBodies = [];
    await page.route('http://localhost:3333/mock-api**', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') postBodies.push(JSON.parse(req.postData() || '{}'));
      await route.fallback();
    });
    await page.locator('#usage-bags-inc').click();
    await page.locator('#usage-bags-inc').click();
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/saved/i);
    const invCall = postBodies.find(b => b.action === 'updateInventory');
    // Mock has Solution Bags 1.36% = 8 → deducting 3 → count should be 5
    expect(invCall?.items.find(i => i.name === 'Solution Bags 1.36%')?.count).toBe(5);
  });
});
