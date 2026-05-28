// ============================================================
// api.js — All fetch() calls to the Apps Script Web App
// ============================================================
// URL is set in config.js (gitignored).
// APPS_SCRIPT_TOKEN is only used by Playwright tests (injected via window.APPS_SCRIPT_TOKEN);
// production always uses the per-device token set by auth.js.
const APPS_SCRIPT_URL   = window.APPS_SCRIPT_URL   || '';
const APPS_SCRIPT_TOKEN = window.APPS_SCRIPT_TOKEN || '';

// Device token set by auth.js after successful validation
let _deviceToken = null;
function setDeviceToken(t) { _deviceToken = t; }

// ============================================================
// Core fetch helpers
// ============================================================

async function apiGet(action, params = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set('action', action);
    const tok = _deviceToken || APPS_SCRIPT_TOKEN;
    if (tok) url.searchParams.set('token', tok);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Request timed out. Check your connection.');
    throw err;
  }
}

async function apiPost(action, body = {}, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeout || 15000);

  try {
    if (!APPS_SCRIPT_URL) {
      throw new Error('Apps Script URL not configured. Add it to js/config.js.');
    }
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' }, // Apps Script requires text/plain for doPost
      body: JSON.stringify({ action, token: _deviceToken || APPS_SCRIPT_TOKEN || undefined, ...body })
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Request timed out. Check your connection.');
    throw err;
  }
}

// ============================================================
// Named API calls (used by each module)
// ============================================================

const API = {
  getDashboard:   (patientId) => apiGet('getDashboard', { patientId }),
  getDataVersion: ()          => apiGet('getDataVersion'),

  getHistory: ({ patientId, from, to } = {}) => apiGet('getHistory', { patientId, from, to }),

  getConfig: () => apiGet('getConfig'),

  logMeasurement: (data) => apiPost('logMeasurement', data),

  updateInventory: (data) => apiPost('updateInventory', data),

  // Patient management
  getPatients:  ()     => apiGet('getPatients'),
  addPatient:   (data) => apiPost('addPatient',  data),
  editPatient:  (data) => apiPost('editPatient', data),

  // Email report
  getRecipients:       ()     => apiGet('getRecipients'),
  sendHistoryEmail:    (data) => apiPost('sendHistoryEmail',    data, { timeout: 45000 }),
  getHistoryReportHtml:(data) => apiPost('getHistoryReportHtml', data, { timeout: 30000 }),

  // Auth — these are public (no approved token required)
  validateToken:    (token) => apiGet('validateToken', { token }),
  loginOrRegister:  (label, passwordHash, token) => apiPost('loginOrRegister', { label, passwordHash, token }),
  touchToken:       (token) => apiGet('touchToken', { token }),
  savePreferences:  (prefs) => apiPost('savePreferences', prefs),
};
