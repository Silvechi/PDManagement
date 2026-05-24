import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api.js';

// Helper: sibling button locators for a stepper (increment/decrement around the value span)
function stepperInc(page, spanId) {
  return page.locator(`#${spanId}`).locator('xpath=following-sibling::button[1]');
}
function stepperDec(page, spanId) {
  return page.locator(`#${spanId}`).locator('xpath=preceding-sibling::button[1]');
}

// Helper: wait for dashboard load, then navigate to Log
async function goToLog(page) {
  await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
  await page.locator('#botnav-measurements').click();
  await expect(page.getByRole('heading', { name: 'Log', exact: true })).toBeVisible();
}

test.describe('Log Measurements', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await goToLog(page);
  });

  // ── Tab bar ───────────────────────────────────────────────

  test('renders three measurement tabs', async ({ page }) => {
    await expect(page.locator('#meas-tab-bag')).toBeVisible();
    await expect(page.locator('#meas-tab-weight')).toBeVisible();
    await expect(page.locator('#meas-tab-bp')).toBeVisible();
  });

  test('Drainage is the default active tab', async ({ page }) => {
    await expect(page.locator('#meas-tab-bag')).toHaveClass(/active/);
    await expect(page.locator('#m-bag-card')).toBeVisible();
    await expect(page.locator('#m-weight-card')).not.toBeVisible();
    await expect(page.locator('#m-bp-card')).not.toBeVisible();
  });

  test('switching to Weight shows weight card and hides others', async ({ page }) => {
    await page.locator('#meas-tab-weight').click();
    await expect(page.locator('#m-weight-card')).toBeVisible();
    await expect(page.locator('#m-bag-card')).not.toBeVisible();
    await expect(page.locator('#meas-tab-weight')).toHaveClass(/active/);
  });

  test('switching to BP shows BP card', async ({ page }) => {
    await page.locator('#meas-tab-bp').click();
    await expect(page.locator('#m-bp-card')).toBeVisible();
    await expect(page.locator('#m-bag-card')).not.toBeVisible();
  });

  // ── Now pill ──────────────────────────────────────────────

  test('now pill shows today label by default', async ({ page }) => {
    await expect(page.locator('.now-pill')).toContainText('Today');
  });

  test('clicking now pill opens datetime editor', async ({ page }) => {
    await page.locator('.now-pill').click();
    await expect(page.locator('#now-dt-input')).toBeVisible();
    await expect(page.locator('#now-done-btn')).toBeVisible();
  });

  // ── Drum pickers (drainage) ───────────────────────────────

  test('drainage card has drum pickers for integer and decimal', async ({ page }) => {
    await expect(page.locator('#bag-int-dp .drum')).toBeVisible();
    await expect(page.locator('#bag-dec-dp .drum')).toBeVisible();
  });

  test('drainage int picker renders items including default value 2', async ({ page }) => {
    await expect(page.locator('#bag-int-dp .drum-item[data-v="2"]')).toBeAttached();
  });

  test('clicking a drum item changes the value', async ({ page }) => {
    // Click item 5 in the integer picker
    await page.locator('#bag-int-dp .drum-item[data-v="5"]').click();
    // Wait for scroll animation to settle, then check opacity
    await page.waitForFunction(() => {
      const el = document.querySelector('#bag-int-dp .drum-item[data-v="5"]');
      return el && parseFloat(el.style.opacity) === 1;
    }, { timeout: 2000 });
    const opacity = await page.locator('#bag-int-dp .drum-item[data-v="5"]').evaluate(
      el => parseFloat(el.style.opacity)
    );
    expect(opacity).toBe(1);
  });

  test('weight card has drum pickers for each digit', async ({ page }) => {
    await page.locator('#meas-tab-weight').click();
    await expect(page.locator('#wt-h-dp .drum')).toBeVisible();
    await expect(page.locator('#wt-t-dp .drum')).toBeVisible();
    await expect(page.locator('#wt-o-dp .drum')).toBeVisible();
    await expect(page.locator('#wt-dec-dp .drum')).toBeVisible();
  });

  test('BP card has drum pickers for systolic and diastolic digits', async ({ page }) => {
    await page.locator('#meas-tab-bp').click();
    await expect(page.locator('#bp-sh-dp .drum')).toBeVisible();
    await expect(page.locator('#bp-st-dp .drum')).toBeVisible();
    await expect(page.locator('#bp-so-dp .drum')).toBeVisible();
    await expect(page.locator('#bp-dh-dp .drum')).toBeVisible();
    await expect(page.locator('#bp-dt-dp .drum')).toBeVisible();
    await expect(page.locator('#bp-do-dp .drum')).toBeVisible();
  });

  // ── Bag type selector ─────────────────────────────────────

  test('bag type selector shows three concentration cards', async ({ page }) => {
    await expect(page.getByRole('button', { name: /1\.36%/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /2\.27%/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /3\.86%/ })).toBeVisible();
  });

  test('1.36% bag card is active by default', async ({ page }) => {
    await expect(page.locator('#bagpick-0')).toHaveClass(/active/);
    await expect(page.locator('#bagpick-1')).not.toHaveClass(/active/);
    await expect(page.locator('#bagpick-2')).not.toHaveClass(/active/);
  });

  test('clicking a bag card activates it and deactivates others', async ({ page }) => {
    await page.locator('#bagpick-1').click();
    await expect(page.locator('#bagpick-1')).toHaveClass(/active/);
    await expect(page.locator('#bagpick-0')).not.toHaveClass(/active/);
    await expect(page.locator('#bagpick-2')).not.toHaveClass(/active/);
  });

  // ── Procedure type toggle ─────────────────────────────────

  test('procedure type toggle renders three buttons', async ({ page }) => {
    await expect(page.locator('#proc-btn-both')).toBeVisible();
    await expect(page.locator('#proc-btn-drain')).toBeVisible();
    await expect(page.locator('#proc-btn-fill')).toBeVisible();
  });

  test('"Drain + Fill" is the default active procedure type', async ({ page }) => {
    await expect(page.locator('#proc-btn-both')).toHaveClass(/active/);
    await expect(page.locator('#proc-btn-drain')).not.toHaveClass(/active/);
    await expect(page.locator('#proc-btn-fill')).not.toHaveClass(/active/);
  });

  test('both drain and fill sections visible by default', async ({ page }) => {
    await expect(page.locator('#bag-drain-section')).toBeVisible();
    await expect(page.locator('#bag-fill-section')).toBeVisible();
  });

  test('switching to "Drain only" hides fill section', async ({ page }) => {
    await page.locator('#proc-btn-drain').click();
    await expect(page.locator('#bag-drain-section')).toBeVisible();
    await expect(page.locator('#bag-fill-section')).not.toBeVisible();
    await expect(page.locator('#proc-btn-drain')).toHaveClass(/active/);
  });

  test('switching to "Fill only" hides drain section', async ({ page }) => {
    await page.locator('#proc-btn-fill').click();
    await expect(page.locator('#bag-fill-section')).toBeVisible();
    await expect(page.locator('#bag-drain-section')).not.toBeVisible();
    await expect(page.locator('#proc-btn-fill')).toHaveClass(/active/);
  });

  test('submit button label updates with procedure type', async ({ page }) => {
    await expect(page.locator('#bag-submit')).toContainText('Save Drain + Fill');
    await page.locator('#proc-btn-drain').click();
    await expect(page.locator('#bag-submit')).toContainText('Save Drain only');
    await page.locator('#proc-btn-fill').click();
    await expect(page.locator('#bag-submit')).toContainText('Save Fill only');
  });

  // ── Usage counters ────────────────────────────────────────

  test('usage counters default to 1 bag and 1 cap', async ({ page }) => {
    await expect(page.locator('#usage-bags-val')).toHaveText('1');
    await expect(page.locator('#usage-caps-val')).toHaveText('1');
  });

  test('usage + button increments bags', async ({ page }) => {
    await stepperInc(page, 'usage-bags-val').click();
    await expect(page.locator('#usage-bags-val')).toHaveText('2');
    await stepperInc(page, 'usage-bags-val').click();
    await expect(page.locator('#usage-bags-val')).toHaveText('3');
  });

  test('usage − button decrements bags, minimum 0', async ({ page }) => {
    await stepperDec(page, 'usage-bags-val').click();
    await expect(page.locator('#usage-bags-val')).toHaveText('0');
    // Cannot go below 0
    await stepperDec(page, 'usage-bags-val').click();
    await expect(page.locator('#usage-bags-val')).toHaveText('0');
  });

  test('usage counters reset to 1 after successful Drain+Fill submit', async ({ page }) => {
    await stepperInc(page, 'usage-bags-val').click();
    await stepperInc(page, 'usage-caps-val').click();
    await expect(page.locator('#usage-bags-val')).toHaveText('2');
    await expect(page.locator('#usage-caps-val')).toHaveText('2');
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/saved/i, { timeout: 5000 });
    await expect(page.locator('#usage-bags-val')).toHaveText('1');
    await expect(page.locator('#usage-caps-val')).toHaveText('1');
  });

  // ── Submit happy path ─────────────────────────────────────

  test('Save Drain+Fill calls API and shows success', async ({ page }) => {
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/drainage saved/i, { timeout: 5000 });
  });

  test('Save Weight calls API and shows success', async ({ page }) => {
    await page.locator('#meas-tab-weight').click();
    await page.locator('#wt-submit').click();
    await expect(page.locator('#wt-feedback')).toContainText(/weight saved/i, { timeout: 5000 });
  });

  test('Save Blood Pressure calls API and shows success', async ({ page }) => {
    await page.locator('#meas-tab-bp').click();
    await page.locator('#bp-submit').click();
    await expect(page.locator('#bp-feedback')).toContainText(/bp saved/i, { timeout: 5000 });
  });

  // ── Procedure type submit messages ────────────────────────

  test('"Drain only" submit shows "Drain saved."', async ({ page }) => {
    await page.locator('#proc-btn-drain').click();
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/drain saved/i, { timeout: 5000 });
  });

  test('"Fill only" submit shows "Fill saved."', async ({ page }) => {
    await page.locator('#proc-btn-fill').click();
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/fill saved/i, { timeout: 5000 });
  });

  // ── Post-submit state ─────────────────────────────────────

  test('notes field clears after successful drainage submit', async ({ page }) => {
    await page.locator('#bag-notes').fill('Some notes');
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/saved/i, { timeout: 5000 });
    await expect(page.locator('#bag-notes')).toHaveValue('');
  });

  test('bag type resets to first card after successful submit', async ({ page }) => {
    await page.locator('#bagpick-1').click();
    await expect(page.locator('#bagpick-1')).toHaveClass(/active/);
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/saved/i, { timeout: 5000 });
    await expect(page.locator('#bagpick-0')).toHaveClass(/active/);
    await expect(page.locator('#bagpick-1')).not.toHaveClass(/active/);
  });

  // ── API error ─────────────────────────────────────────────

  test('API error shows error in drainage feedback', async ({ page }) => {
    await setupMockApi(page, { logMeasurement: { error: 'Spreadsheet not found' } });
    await page.goto('/');
    await goToLog(page);
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/error/i, { timeout: 5000 });
  });

  // ── Inventory deduction ───────────────────────────────────

  test('Drain+Fill submit calls updateInventory with correct deducted counts', async ({ page }) => {
    const postBodies = [];
    await page.route('http://localhost:3333/mock-api**', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') postBodies.push(JSON.parse(req.postData() || '{}'));
      await route.fallback();
    });
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/saved/i, { timeout: 5000 });
    const invCall = postBodies.find(b => b.action === 'updateInventory');
    expect(invCall).toBeDefined();
    // Mock: Solution Bags 1.36% = 8, Caps = 20 → deduct 1 each → 7 and 19
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
    await expect(page.locator('#bag-feedback')).toContainText(/saved/i, { timeout: 5000 });
    expect(postBodies.find(b => b.action === 'updateInventory')).toBeUndefined();
  });

  test('adjusted usage quantities are reflected in inventory deduction', async ({ page }) => {
    const postBodies = [];
    await page.route('http://localhost:3333/mock-api**', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') postBodies.push(JSON.parse(req.postData() || '{}'));
      await route.fallback();
    });
    await stepperInc(page, 'usage-bags-val').click();
    await stepperInc(page, 'usage-bags-val').click();
    await page.locator('#bag-submit').click();
    await expect(page.locator('#bag-feedback')).toContainText(/saved/i, { timeout: 5000 });
    const invCall = postBodies.find(b => b.action === 'updateInventory');
    // Mock: Solution Bags 1.36% = 8 → deduct 3 → count should be 5
    expect(invCall?.items.find(i => i.name === 'Solution Bags 1.36%')?.count).toBe(5);
  });
});
