// ============================================================
// app.js — Screen routing, navigation, shared helpers
// ============================================================

// Bag colors — fallback for items without an explicit color in the config
const BAG_COLORS = {
  '1.36%': { color: '#E8A317', soft: '#FCEFD0', deep: '#7A5210' },
  '2.27%': { color: '#2BA15A', soft: '#D5EFDF', deep: '#13502A' },
  '3.86%': { color: '#D6347B', soft: '#FADCE8', deep: '#6E1340' },
};

// ── Dynamic bag helpers ───────────────────────────────────────
// inventoryConfig items can carry: isBag (bool/"TRUE"/"FALSE"),
// color (#hex), active (bool/"TRUE"/"FALSE"), displayName (string)

function isBagItem(item) {
  if (item.isBag === true  || item.isBag === 'TRUE')  return true;
  if (item.isBag === false || item.isBag === 'FALSE') return false;
  return Object.keys(BAG_COLORS).some(t => (item.name || '').includes(t));
}

function isActiveBagItem(item) {
  return item.active !== false && item.active !== 'FALSE';
}

function bagDisplayName(item) {
  if (item.displayName) return item.displayName;
  return Object.keys(BAG_COLORS).find(t => (item.name || '').includes(t)) || item.name;
}

function bagColorsFor(item) {
  if (item.color) {
    const h = item.color.startsWith('#') ? item.color : '#' + item.color;
    return { color: h, soft: _tintHex(h, 0.83), deep: _shadeHex(h, 0.42) };
  }
  const type = Object.keys(BAG_COLORS).find(t => (item.name || '').includes(t));
  return type ? BAG_COLORS[type] : { color: '#888888', soft: '#e8e8e8', deep: '#444444' };
}

function _tintHex(h, t) {
  const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);
  return '#'+[r,g,b].map(v=>Math.min(255,Math.round(v+(255-v)*t)).toString(16).padStart(2,'0')).join('');
}
function _shadeHex(h, t) {
  const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);
  return '#'+[r,g,b].map(v=>Math.round(v*t).toString(16).padStart(2,'0')).join('');
}

function timeAgo(dateStr, timeStr) {
  if (!dateStr) return '';
  const dt   = new Date(dateStr + 'T' + (timeStr || '00:00') + ':00');
  const diff = Math.floor((Date.now() - dt.getTime()) / 60000);
  if (isNaN(diff) || diff < 0) return '';
  if (diff < 1)    return t('time.just_now');
  if (diff < 60)   return t('time.mins_ago',  { n: diff });
  if (diff < 1440) return t('time.hours_ago', { n: Math.floor(diff / 60) });
  return t('time.days_ago', { n: Math.floor(diff / 1440) });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Shared icons (used by inventory + measurements) ──────────
const PLUS_ICON  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16"><path d="M12 5v14M5 12h14"/></svg>`;
const MINUS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16"><path d="M5 12h14"/></svg>`;

// ── SVG icons ────────────────────────────────────────────────
const NAV_ICONS = {
  dashboard:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M3 11l9-8 9 8M5 9v11h14V9"/></svg>`,
  measurements: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M12 5v14M5 12h14"/></svg>`,
  inventory:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10"/></svg>`,
  history:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`,
  prep:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M9 11l3 3 7-7M20 12v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1h9"/></svg>`,
  users:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
};

const MOON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>`;
const SUN_ICON  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;

const SCREENS = {
  dashboard:    { label: 'Dashboard', render: renderDashboard    },
  measurements: { label: 'Log',       render: renderMeasurements },
  inventory:    { label: 'Inventory', render: renderInventory    },
  history:      { label: 'History',   render: renderHistory      },
  prep:         { label: 'Prep',      render: renderPrep         },
  users:        { label: 'Settings',  render: renderSettings     },
};

let activeScreen = null;
let currentTheme = 'light';

// ============================================================
// Init
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const savedTheme = localStorage.getItem('pd_theme') || 'light';
  applyTheme(savedTheme);
  const authed = await initAuth();
  if (!authed) return;

  await loadPatientsCache();
  buildNav();

  if (getActivePatientId()) {
    navigateTo('dashboard');
  } else {
    navigateTo('users'); // no patient selected — show picker / add form
  }

  checkConnectivity();
  API.getConfig().then(cfg => {
    try { localStorage.setItem('pd_config_v1', JSON.stringify(cfg)); } catch {}
  }).catch(() => {});
});

// ============================================================
// Theme
// ============================================================

function applyTheme(theme) {
  currentTheme = theme;
  document.body.setAttribute('data-theme', theme);
  try { localStorage.setItem('pd_theme', theme); } catch {}
  const btn = document.getElementById('theme-btn');
  if (btn) btn.innerHTML = theme === 'dark' ? SUN_ICON : MOON_ICON;
}

function toggleTheme() {
  applyTheme(currentTheme === 'light' ? 'dark' : 'light');
  API.savePreferences({ theme: currentTheme }).catch(() => {});
}

// ============================================================
// Navigation
// ============================================================

function buildNav() {
  const topbar   = document.getElementById('topbar');
  const botnav   = document.getElementById('bottom-nav');
  if (!topbar || !botnav) return;
  topbar.style.display  = '';
  botnav.style.display  = 'flex';

  const navBtns = Object.entries(SCREENS).map(([key]) => {
    const icon  = NAV_ICONS[key] || '';
    const label = t('nav.' + key);
    return { key, label, icon };
  });

  // Topbar: nav buttons + patient chip + theme toggle
  topbar.innerHTML = `
    <nav class="topnav" aria-label="Main navigation">
      ${navBtns.map(({ key, label, icon }) => `
        <button class="topnav-btn" id="topnav-${key}" onclick="navigateTo('${key}')"
                aria-label="${label}">
          ${icon}<span>${label}</span>
        </button>
      `).join('')}
    </nav>
    <div class="topbar-actions">
      <button class="patient-chip" id="patient-chip" onclick="navigateTo('users')"
              aria-label="Switch user" title="Active user">
        ${getActivePatientName() || t('users.select')}
      </button>
      <button class="theme-toggle-btn" id="theme-btn" onclick="toggleTheme()" aria-label="Toggle dark mode">
        ${MOON_ICON}
      </button>
    </div>
  `;

  // Bottom nav
  botnav.innerHTML = navBtns.map(({ key, label, icon }) => `
    <button class="botnav-btn" id="botnav-${key}" onclick="navigateTo('${key}')"
            aria-label="${label}">
      ${icon}<span>${label}</span>
    </button>
  `).join('');
}

async function navigateTo(screenKey, tab) {
  // If already on measurements and caller just wants a tab switch, skip re-render
  if (activeScreen === screenKey && screenKey === 'measurements' && tab) {
    if (typeof switchMeasCard === 'function') switchMeasCard(tab);
    return;
  }
  if (activeScreen === screenKey) return;
  activeScreen = screenKey;

  // Update active state on both navs
  document.querySelectorAll('.topnav-btn, .botnav-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('topnav-' + screenKey)?.classList.add('active');
  document.getElementById('botnav-' + screenKey)?.classList.add('active');

  const container = document.getElementById('screen-container');
  if (!container) return;

  const cfg = SCREENS[screenKey];
  if (!cfg) {
    container.innerHTML = `<div class="page"><p class="no-data">Unknown screen.</p></div>`;
    return;
  }

  if (screenKey === 'inventory') {
    cfg.render(container, typeof dashboardData !== 'undefined' ? dashboardData : null);
  } else if (screenKey === 'measurements') {
    cfg.render(container, tab);
  } else {
    cfg.render(container);
  }
}

// ============================================================
// Connectivity check (used by api.js)
// ============================================================

function checkConnectivity() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  if (!navigator.onLine) {
    banner.textContent = t('common.offline');
    banner.style.display = 'block';
  }
  window.addEventListener('online',  () => { banner.style.display = 'none'; });
  window.addEventListener('offline', () => {
    banner.textContent = t('common.offline');
    banner.style.display = 'block';
  });
}
