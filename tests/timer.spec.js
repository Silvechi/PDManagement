import { test, expect } from '@playwright/test';
import { setupMockApi, CONFIG_RESPONSE } from './helpers/mock-api.js';

// Helper to extract display text from a prep config item (plain string or {text} object)
function itemText(item) { return typeof item === 'string' ? item : item.text; }

const firstItemWithDesc = CONFIG_RESPONSE.prepItems.find(i => typeof i !== 'string' && i.description);

// Helper: navigate to Prep screen
async function goToPrep(page) {
  await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
  await page.locator('#botnav-prep').click();
  await expect(page.getByRole('heading', { name: 'Prep', exact: true })).toBeVisible();
}

test.describe('Prep Screen', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');
    await goToPrep(page);
  });

  // ── Loading & render ──────────────────────────────────────

  test('shows loading state then renders content', async ({ page }) => {
    await expect(page.locator('#prep-content')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#prep-loading')).not.toBeVisible();
  });

  test('renders "What to prepare" section heading', async ({ page }) => {
    await expect(page.locator('.card-title').filter({ hasText: 'What to prepare' })).toBeVisible();
  });

  test('renders "Procedure" section heading', async ({ page }) => {
    await expect(page.locator('.card-title').filter({ hasText: 'Procedure' })).toBeVisible();
  });

  // ── Content from mock config ──────────────────────────────

  test('prep items list is populated from config', async ({ page }) => {
    await expect(page.locator('.prep-items > .prep-item')).toHaveCount(CONFIG_RESPONSE.prepItems.length, { timeout: 8000 });
  });

  test('prep steps list is populated from config', async ({ page }) => {
    await expect(page.locator('.steps > .step')).toHaveCount(CONFIG_RESPONSE.prepSteps.length, { timeout: 8000 });
  });

  test('first prep item text matches config', async ({ page }) => {
    await expect(page.locator('.prep-items > .prep-item').first())
      .toContainText(itemText(CONFIG_RESPONSE.prepItems[0]), { timeout: 8000 });
  });

  test('step numbers are shown starting from 1', async ({ page }) => {
    await expect(page.locator('.step-num').first()).toContainText('1', { timeout: 8000 });
  });

  test('prep items show bullet dot marker', async ({ page }) => {
    await expect(page.locator('.prep-item').first().locator('.prep-dot')).toBeVisible({ timeout: 8000 });
  });

  // ── Step descriptions inline ──────────────────────────────

  test('steps with descriptions show description text inline', async ({ page }) => {
    // First step has a description
    const firstStepWithDesc = CONFIG_RESPONSE.prepSteps.find(s => typeof s !== 'string' && s.description);
    const stepEl = page.locator('.step').filter({ hasText: itemText(firstStepWithDesc) });
    await expect(stepEl).toContainText(firstStepWithDesc.description, { timeout: 8000 });
  });

  test('steps without description do not show extra text', async ({ page }) => {
    const noDescStep = CONFIG_RESPONSE.prepSteps.find(s => !s.description);
    const stepEl = page.locator('.step').filter({ hasText: itemText(noDescStep) });
    await expect(stepEl).toBeVisible({ timeout: 8000 });
    await expect(stepEl.locator('.step-text span')).not.toBeAttached();
  });

  // ── Hebrew text ───────────────────────────────────────────

  test('renders correctly with Hebrew prep items', async ({ page }) => {
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
    await goToPrep(page);
    await expect(page.locator('.prep-items > .prep-item').first()).toContainText('כפפות סטריליות', { timeout: 8000 });
    await expect(page.locator('.prep-items > .prep-item').nth(1)).toContainText('פדים');
  });

  test('Hebrew step description is rendered inline', async ({ page }) => {
    await setupMockApi(page, {
      getConfig: {
        prepItems: [],
        prepSteps: [
          { text: 'שטפו ידיים', description: 'עם סבון ומים 30 שניות.' }
        ]
      }
    });
    await page.goto('/');
    await goToPrep(page);
    const stepEl = page.locator('.step').filter({ hasText: 'שטפו ידיים' });
    await expect(stepEl).toContainText('עם סבון ומים 30 שניות.', { timeout: 8000 });
  });

  // ── textHe / descriptionHe localization ───────────────────

  async function goToPrepHe(page) {
    await expect(page.locator('.bag-hero').first()).toBeVisible({ timeout: 8000 });
    await page.locator('#botnav-prep').click();
    await expect(page.locator('.prep-items')).toBeVisible({ timeout: 8000 });
  }

  test('Hebrew mode shows textHe for prep items when set', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('pd_lang', 'he'); });
    await setupMockApi(page);
    await page.goto('/');
    await goToPrepHe(page);
    await expect(page.locator('.prep-items > .prep-item').first()).toContainText('כפפות סטריליות');
  });

  test('Hebrew mode shows textHe for prep steps when set', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('pd_lang', 'he'); });
    await setupMockApi(page);
    await page.goto('/');
    await goToPrepHe(page);
    await expect(page.locator('.step').first()).toContainText('שטוף ידיים היטב לפחות 30 שניות');
  });

  test('Hebrew mode shows descriptionHe for steps when set', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('pd_lang', 'he'); });
    await setupMockApi(page);
    await page.goto('/');
    await goToPrepHe(page);
    await expect(page.locator('.step').first()).toContainText('שפשף בין האצבעות');
  });

  test('English mode shows text, not textHe', async ({ page }) => {
    await expect(page.locator('.prep-items > .prep-item').first()).toContainText('Sterile gloves', { timeout: 8000 });
    await expect(page.locator('.step').first()).toContainText('Wash hands', { timeout: 8000 });
  });

  // ── Error state ───────────────────────────────────────────

  test('shows error when API fails', async ({ page }) => {
    await setupMockApi(page, { getConfig: { error: 'Config not found' } });
    await page.addInitScript(() => localStorage.removeItem('pd_config_v1'));
    await page.goto('/');
    await goToPrep(page);
    await expect(page.locator('.feedback-error')).toContainText(/failed to load/i, { timeout: 8000 });
  });
});
