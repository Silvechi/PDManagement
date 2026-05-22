/**
 * Shared Playwright helper: mocks the Apps Script API via page.route().
 *
 * Strategy:
 *   1. Inject window.APPS_SCRIPT_URL = MOCK_URL before page scripts run
 *   2. Intercept all requests to MOCK_URL with page.route()
 */

export const MOCK_URL = 'http://localhost:3333/mock-api';

export const INVENTORY_CONFIG = [
  { name: 'Solution Bags 1.36%', min: 5,  description: 'Yellow bag. Check expiry before use.' },
  { name: 'Solution Bags 2.27%', min: 5,  description: 'Green bag. Check expiry before use.' },
  { name: 'Solution Bags 3.86%', min: 5,  description: 'Pink bag. Check expiry before use.' },
  { name: 'Caps',                min: 10, description: 'Replace the cap on the transfer set after every exchange.' },
  { name: 'Gauze Pads',          min: 10, description: '' },
  { name: 'Bandages',            min: 10, description: '' },
  { name: 'Ointment (units)',    min: 10, description: 'Apply a small amount around the exit site at each dressing change.' }
];

export const DASHBOARD_RESPONSE = {
  inventoryConfig: INVENTORY_CONFIG,
  inventory: {
    'Solution Bags 1.36%': 8,
    'Solution Bags 2.27%': 6,
    'Solution Bags 3.86%': 4,
    'Caps':             20,
    'Gauze Pads':       3,   // below threshold of 10 → low stock
    'Bandages':         15,
    'Ointment (units)': 8    // below threshold of 10 → low stock
  },
  lowStockFlags: 'Gauze Pads (3 left), Ointment (units) (8 left)',
  weightTrend: [
    { date: '2026-05-15', weight: 72.4 },
    { date: '2026-05-16', weight: 72.8 },
    { date: '2026-05-17', weight: 72.1 },
    { date: '2026-05-18', weight: 72.3 },
    { date: '2026-05-19', weight: 71.9 },
    { date: '2026-05-20', weight: 71.5 },
    { date: '2026-05-21', weight: 71.7 }
  ],
  bpRecent: [
    { date: '2026-05-19', time: '08:15', systolic: 125, diastolic: 79 },
    { date: '2026-05-20', time: '08:30', systolic: 128, diastolic: 82 },
    { date: '2026-05-21', time: '09:00', systolic: 131, diastolic: 85 }
  ],
  bpAvg: { systolic: 128, diastolic: 82 }
};

export const CONFIG_RESPONSE = {
  prepItems: [
    { text: 'Sterile gloves', description: 'Use the size that fits you. Non-sterile gloves are not sufficient for this step.' },
    { text: 'Dialysis solution bags (check type and expiry)', description: 'Check the label matches your prescription (e.g. 1.36%, 2.27%, or 3.86%). Never use an expired bag.' },
    'Cap replacements',
    'Gauze pads',
    { text: 'Antiseptic ointment', description: 'Apply a small amount around the exit site after cleaning.' },
    { text: 'Clean workspace / tray', description: 'Wipe the surface with a disinfectant cloth and let it dry before placing supplies.' }
  ],
  prepSteps: [
    { text: 'Wash hands thoroughly for at least 30 seconds', description: 'Use soap and water. Scrub between fingers and under nails. Dry with a clean paper towel.' },
    'Put on sterile mask and gloves',
    'Prepare solution bags and check expiry dates',
    { text: 'Connect fresh bag to transfer set', description: "Follow your clinic's protocol. Never touch the spike tip." },
    { text: 'Allow drainage (approximately 20–30 minutes)', description: 'Keep the drain bag below the level of your abdomen to allow gravity drainage.' },
    'Infuse fresh dialysis solution',
    'Disconnect and replace exit-site cap',
    { text: 'Clean exit site and apply fresh dressing', description: 'Clean in a circular motion from the centre outward.' },
    { text: 'Weigh drainage bag and record', description: 'Expected drainage is roughly equal to infused volume ± 200 ml.' },
    'Dispose of used supplies per protocol'
  ]
};

const DEFAULT_RESPONSES = {
  getDashboard:    DASHBOARD_RESPONSE,
  getHistory:      { rows: [] },
  getConfig:       CONFIG_RESPONSE,
  logMeasurement:  { success: true, message: 'Measurement logged.' },
  updateInventory: { success: true, message: 'Inventory updated.' }
};

/**
 * Call before page.goto(). Injects mock URL into window and registers
 * a Playwright route handler to intercept all API calls.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Record<string,object>} [overrides]  Per-action response overrides
 */
export async function setupMockApi(page, overrides = {}) {
  const responses = { ...DEFAULT_RESPONSES, ...overrides };

  await page.addInitScript((mockUrl) => {
    window.APPS_SCRIPT_URL   = mockUrl;
    window.APPS_SCRIPT_TOKEN = 'test-token';
  }, MOCK_URL);

  await page.route(`${MOCK_URL}**`, async (route) => {
    const req = route.request();
    let action = null;

    try {
      if (req.method() === 'POST') {
        action = JSON.parse(req.postData()).action;
      } else {
        action = new URL(req.url()).searchParams.get('action');
      }
    } catch (_) {}

    const data = action && responses[action] != null
      ? responses[action]
      : { error: 'No mock defined for action: ' + action };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });
  });
}
