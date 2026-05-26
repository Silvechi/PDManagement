/**
 * Shared Playwright helper: mocks the Apps Script API via page.route().
 *
 * Strategy:
 *   1. Inject window.APPS_SCRIPT_URL + set localStorage token before page scripts run
 *   2. Intercept all requests to MOCK_URL with page.route()
 */

export const MOCK_URL = 'http://localhost:3333/mock-api';

// Bag items — name-based isBag detection works via '1.36%' / '2.27%' / '3.86%' substring match
export const INVENTORY_CONFIG = [
  { name: 'Solution Bags 1.36%', min: 5,  maxHours: 6, description: 'Yellow bag. Check expiry before use.',                           displayNameHe: 'שקית 1.36%' },
  { name: 'Solution Bags 2.27%', min: 5,  maxHours: 6, description: 'Green bag. Check expiry before use.',                            displayNameHe: 'שקית 2.27%' },
  { name: 'Solution Bags 3.86%', min: 5,  maxHours: 6, description: 'Pink bag. Check expiry before use.',                             displayNameHe: 'שקית 3.86%' },
  { name: 'Caps',                min: 10, description: 'Replace the cap on the transfer set after every exchange.',                    displayNameHe: 'פקקים' },
  { name: 'Gauze Pads',          min: 10, description: '',                                                                             displayNameHe: 'גזה' },
  { name: 'Bandages',            min: 10, description: '',                                                                             displayNameHe: 'תחבושות' },
  { name: 'Ointment (units)',    min: 10, description: 'Apply a small amount around the exit site at each dressing change.',           displayNameHe: 'משחה (יחידות)' }
];

// Bag items are indices 0-2; supply items are indices 3-6
export const BAG_COUNT   = 3;
export const SUPPLY_COUNT = 4;

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
  bpAvg: { systolic: 128, diastolic: 82 },
  dataVersion: '1'
  // no lastExchange by default → no overdue banner
};

export const CONFIG_RESPONSE = {
  prepItems: [
    { text: 'Sterile gloves',                              description: 'Use the size that fits you. Non-sterile gloves are not sufficient for this step.', textHe: 'כפפות סטריליות',                             descriptionHe: 'השתמש בגודל המתאים לך. כפפות לא סטריליות אינן מספיקות לשלב זה.' },
    { text: 'Dialysis solution bags (check type and expiry)', description: 'Check the label matches your prescription.',                                    textHe: 'שקיות תמיסה לדיאליזה (בדוק סוג ותוקף)',       descriptionHe: 'ודא שהתווית תואמת את המרשם שלך.' },
    { text: 'Cap replacements',                            description: '',                                                                                  textHe: 'פקקים חלופיים',                               descriptionHe: '' },
    { text: 'Gauze pads',                                  description: '',                                                                                  textHe: 'גזה',                                         descriptionHe: '' },
    { text: 'Antiseptic ointment',                         description: 'Apply a small amount around the exit site after cleaning.',                        textHe: 'משחה אנטיספטית',                              descriptionHe: 'מרח כמות קטנה סביב אתר היציאה לאחר ניקוי.' },
    { text: 'Clean workspace / tray',                      description: 'Wipe the surface with a disinfectant cloth and let it dry.',                       textHe: 'משטח עבודה נקי / מגש',                        descriptionHe: 'נגב את המשטח עם מטלית חיטוי והמתן לייבוש.' }
  ],
  prepSteps: [
    { text: 'Wash hands thoroughly for at least 30 seconds',  description: 'Use soap and water. Scrub between fingers and under nails.',           textHe: 'שטוף ידיים היטב לפחות 30 שניות',              descriptionHe: 'השתמש בסבון ומים. שפשף בין האצבעות ומתחת לציפורניים.' },
    { text: 'Put on sterile mask and gloves',                  description: '',                                                                     textHe: 'הרכב מסכה וכפפות סטריליות',                   descriptionHe: '' },
    { text: 'Prepare solution bags and check expiry dates',    description: '',                                                                     textHe: 'הכן שקיות תמיסה ובדוק תאריכי תפוגה',          descriptionHe: '' },
    { text: 'Connect fresh bag to transfer set',               description: "Follow your clinic's protocol. Never touch the spike tip.",           textHe: 'חבר שקית חדשה לסט ההעברה',                    descriptionHe: 'פעל לפי הנחיות המרפאה. אל תגע בקצה הסיכה.' },
    { text: 'Allow drainage (approximately 20–30 minutes)',    description: 'Keep the drain bag below the level of your abdomen.',                 textHe: 'אפשר ניקוז (כ-20–30 דקות)',                    descriptionHe: 'שמור את שקית הניקוז מתחת לגובה הבטן.' },
    { text: 'Infuse fresh dialysis solution',                  description: '',                                                                     textHe: 'הזרם תמיסת דיאליזה חדשה',                      descriptionHe: '' },
    { text: 'Disconnect and replace exit-site cap',            description: '',                                                                     textHe: 'נתק והחלף את הפקק באתר היציאה',                descriptionHe: '' },
    { text: 'Clean exit site and apply fresh dressing',        description: 'Clean in a circular motion from the centre outward.',                 textHe: 'נקה את אתר היציאה והנח חבישה חדשה',            descriptionHe: 'נקה בתנועה מעגלית מהמרכז החוצה.' },
    { text: 'Weigh drainage bag and record',                   description: 'Expected drainage is roughly equal to infused volume ± 200 ml.',      textHe: 'שקול את שקית הניקוז ורשום',                    descriptionHe: 'הניקוז הצפוי שווה בערך לנפח המוזרם ± 200 מ"ל.' },
    { text: 'Dispose of used supplies per protocol',           description: '',                                                                     textHe: 'סלק חומרים משומשים לפי הפרוטוקול',             descriptionHe: '' }
  ]
};

const DEFAULT_RESPONSES = {
  // Auth
  validateToken:   { status: 'approved' },
  // Patient management
  getPatients:     { version: '1', patients: [{ patientId: 'p1', name: 'Test Patient', active: true }] },
  addPatient:      { success: true, patientId: 'p2' },
  editPatient:     { success: true },
  // Data
  getDashboard:    DASHBOARD_RESPONSE,
  getDataVersion:  { version: '1' },
  getHistory:      { rows: [] },
  getConfig:       CONFIG_RESPONSE,
  // Mutations
  logMeasurement:  { success: true, message: 'Measurement logged.' },
  updateInventory: { success: true, message: 'Inventory updated.' },
  savePreferences: { success: true }
};

/**
 * Call before page.goto(). Injects mock URL + auth token into window/localStorage,
 * then registers a Playwright route handler to intercept all API calls.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Record<string,object>} [overrides]  Per-action response overrides
 */
export async function setupMockApi(page, overrides = {}) {
  const responses = { ...DEFAULT_RESPONSES, ...overrides };

  await page.addInitScript((mockUrl) => {
    // Use getter/setter so config.js (gitignored, local-only) cannot override these values.
    // configurable:true is required so api.js can still declare `const APPS_SCRIPT_URL`
    // without triggering ECMAScript's HasRestrictedGlobalProperty SyntaxError.
    Object.defineProperty(window, 'APPS_SCRIPT_URL',   { get: () => mockUrl,     set: () => {}, configurable: true });
    Object.defineProperty(window, 'APPS_SCRIPT_TOKEN', { get: () => 'test-token', set: () => {}, configurable: true });
    // Pre-set device token so initAuth() skips the registration screen
    localStorage.setItem('pd_device_token_v1', 'test-token');
    // Pre-set active patient so we land directly on dashboard
    localStorage.setItem('pd_active_patient_id', 'p1');
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
