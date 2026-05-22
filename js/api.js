// ============================================================
// api.js — All fetch() calls to the Apps Script Web App
// ============================================================
// URL and token are set in config.js (gitignored).
// In tests, window.APPS_SCRIPT_URL / window.APPS_SCRIPT_TOKEN are injected by the mock helper.
const APPS_SCRIPT_URL   = window.APPS_SCRIPT_URL   || '';
const APPS_SCRIPT_TOKEN = window.APPS_SCRIPT_TOKEN || '';

// ============================================================
// Core fetch helpers
// ============================================================

async function apiGet(action, params = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set('action', action);
    if (APPS_SCRIPT_TOKEN) url.searchParams.set('token', APPS_SCRIPT_TOKEN);
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

async function apiPost(action, body = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    if (!APPS_SCRIPT_URL) {
      throw new Error('Apps Script URL not configured. Add it to js/config.js.');
    }
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' }, // Apps Script requires text/plain for doPost
      body: JSON.stringify({ action, token: APPS_SCRIPT_TOKEN || undefined, ...body })
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
// Connectivity check — called on app load
// ============================================================

async function checkConnectivity() {
  if (!APPS_SCRIPT_URL) {
    showOfflineBanner('Apps Script URL not configured. Add it to js/config.js.');
    return false;
  }
  try {
    await apiGet('getDashboard');
    hideOfflineBanner();
    return true;
  } catch (err) {
    showOfflineBanner('Cannot reach server: ' + err.message);
    return false;
  }
}

function showOfflineBanner(msg) {
  let banner = document.getElementById('offline-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'offline-banner';
    document.body.prepend(banner);
  }
  banner.textContent = '⚠ ' + msg;
  banner.style.display = 'block';
}

function hideOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.style.display = 'none';
}

// ============================================================
// Named API calls (used by each module)
// ============================================================

const API = {
  getDashboard: () => apiGet('getDashboard'),

  getHistory: (n = 7) => apiGet('getHistory', { n }),

  getConfig: () => apiGet('getConfig'),

  logMeasurement: (data) => apiPost('logMeasurement', data),

  updateInventory: (data) => apiPost('updateInventory', data)
};
