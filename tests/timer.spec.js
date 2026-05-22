import { test, expect } from '@playwright/test';
import { setupMockApi, CONFIG_RESPONSE } from './helpers/mock-api.js';

// Helper: extract display text from a prep item (plain string or {text} object)
function itemText(item) { return typeof item === 'string' ? item : item.text; }
function itemDesc(item) { return typeof item === 'string' ? '' : (item.description || ''); }

// First item with a description (for tooltip tests)
const firstItemWithTip = CONFIG_RESPONSE.prepItems.find(i => itemDesc(i));
const firstStepWithTip = CONFIG_RESPONSE.prepSteps.find(i => itemDesc(i));

test.describe('Prep Screen', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await page.getByRole('button', { name: /prep/i }).click();
    await expect(page.getByRole('heading', { name: 'Prep' })).toBeVisible();
  });

  // ── Loading & render ──────────────────────────────────────

  test('shows loading state then renders content', async ({ page }) => {
    await expect(page.locator('#prep-content')).toBeVisible();
    await expect(page.locator('#prep-loading')).not.toBeVisible();
  });

  test('renders "What to Prepare" section', async ({ page }) => {
    await expect(page.locator('.section-title').filter({ hasText: 'What to Prepare' })).toBeVisible();
  });

  test('renders "Procedure Steps" section', async ({ page }) => {
    await expect(page.locator('.section-title').filter({ hasText: 'Procedure Steps' })).toBeVisible();
  });

  // ── Content from mock config ──────────────────────────────

  test('prep items list is populated from config', async ({ page }) => {
    // .prep-list contains only items; .prep-steps-list contains steps
    await expect(page.locator('.prep-list > .prep-list-item')).toHaveCount(CONFIG_RESPONSE.prepItems.length);
  });

  test('prep steps list is populated from config', async ({ page }) => {
    await expect(page.locator('.prep-step-item')).toHaveCount(CONFIG_RESPONSE.prepSteps.length);
  });

  test('first prep item text matches config', async ({ page }) => {
    await expect(page.locator('.prep-list > .prep-list-item').first().locator('.prep-item-text'))
      .toContainText(itemText(CONFIG_RESPONSE.prepItems[0]));
  });

  test('step numbers are shown', async ({ page }) => {
    await expect(page.locator('.prep-step-number').first()).toContainText('1');
  });

  test('prep items show bullet markers (not checkboxes)', async ({ page }) => {
    await expect(page.locator('.prep-list-item').first().locator('.prep-bullet')).toBeVisible();
  });

  // ── Tooltips ──────────────────────────────────────────────

  test('items with descriptions show the ⓘ icon', async ({ page }) => {
    const row = page.locator('.prep-list > .prep-list-item').filter({ hasText: itemText(firstItemWithTip) });
    await expect(row.locator('.prep-tip-icon')).toBeVisible();
  });

  test('items without descriptions do not show ⓘ icon', async ({ page }) => {
    const plainItem = CONFIG_RESPONSE.prepItems.find(i => !itemDesc(i));
    const row = page.locator('.prep-list > .prep-list-item').filter({ hasText: itemText(plainItem) });
    await expect(row.locator('.prep-tip-icon')).not.toBeVisible();
  });

  test('tip panel is hidden before clicking', async ({ page }) => {
    const row = page.locator('.prep-list > .prep-list-item').filter({ hasText: itemText(firstItemWithTip) });
    await expect(row.locator('.prep-tip-panel')).not.toBeVisible();
  });

  test('clicking an item with a tip reveals the description', async ({ page }) => {
    const row = page.locator('.prep-list > .prep-list-item').filter({ hasText: itemText(firstItemWithTip) });
    await row.click();
    await expect(row.locator('.prep-tip-panel')).toBeVisible();
    await expect(row.locator('.prep-tip-panel')).toContainText(itemDesc(firstItemWithTip));
  });

  test('clicking the same item again closes the tip', async ({ page }) => {
    const row = page.locator('.prep-list > .prep-list-item').filter({ hasText: itemText(firstItemWithTip) });
    await row.click();
    await expect(row.locator('.prep-tip-panel')).toBeVisible();
    await row.click();
    await expect(row.locator('.prep-tip-panel')).not.toBeVisible();
  });

  test('opening a second tip closes the first', async ({ page }) => {
    const items = CONFIG_RESPONSE.prepItems.filter(i => itemDesc(i));
    const row1 = page.locator('.prep-list > .prep-list-item').filter({ hasText: itemText(items[0]) });
    const row2 = page.locator('.prep-list > .prep-list-item').filter({ hasText: itemText(items[1]) });
    await row1.click();
    await expect(row1.locator('.prep-tip-panel')).toBeVisible();
    await row2.click();
    await expect(row1.locator('.prep-tip-panel')).not.toBeVisible();
    await expect(row2.locator('.prep-tip-panel')).toBeVisible();
  });

  test('procedure steps with descriptions show ⓘ icon', async ({ page }) => {
    const row = page.locator('.prep-step-item').filter({ hasText: itemText(firstStepWithTip) });
    await expect(row.locator('.prep-tip-icon')).toBeVisible();
  });

  test('clicking a step tip reveals the description', async ({ page }) => {
    const row = page.locator('.prep-step-item').filter({ hasText: itemText(firstStepWithTip) });
    await row.click();
    await expect(row.locator('.prep-tip-panel')).toBeVisible();
    await expect(row.locator('.prep-tip-panel')).toContainText(itemDesc(firstStepWithTip));
  });

  // ── Hebrew tooltip ────────────────────────────────────────

  test('tooltips work with Hebrew item text and descriptions', async ({ page }) => {
    await setupMockApi(page, {
      getConfig: {
        prepItems: [
          { text: 'כפפות סטריליות', description: 'השתמש בגודל המתאים לך.' },
          'פדים'
        ],
        prepSteps: []
      }
    });
    await page.goto('/');
    await page.getByRole('button', { name: /prep/i }).click();
    const row = page.locator('.prep-list-item').filter({ hasText: 'כפפות סטריליות' });
    await expect(row.locator('.prep-tip-icon')).toBeVisible();
    await row.click();
    await expect(row.locator('.prep-tip-panel')).toContainText('השתמש בגודל המתאים לך.');
  });

  // ── Error state ───────────────────────────────────────────

  test('shows error when API fails', async ({ page }) => {
    await setupMockApi(page, { getConfig: { error: 'Config not found' } });
    await page.goto('/');
    await page.getByRole('button', { name: /prep/i }).click();
    await expect(page.locator('.feedback-error')).toContainText(/failed to load/i);
  });
});
