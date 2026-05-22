// ============================================================
// app.js — Screen routing and global state
// ============================================================

// Bag concentration → brand colour (confirmed: 1.36% yellow, 2.27% green, 3.86% pink).
const BAG_TYPE_COLORS = {
  '1.36%': '#f5c800',  // yellow
  '2.27%': '#43a047',  // green
  '3.86%': '#e91e8c',  // fuchsia / pink
};

// Returns an <span class="bag-dot"> with the right inline colour, or '' if unknown.
function bagDotHtml(type) {
  const color = BAG_TYPE_COLORS[type];
  if (!color) return '';
  return `<span class="bag-dot" style="background:${color}" aria-hidden="true"></span>`;
}

// Shared HTML escaping used by inventory.js, prep.js, etc.
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SCREENS = {
  dashboard:    { label: 'Dashboard', icon: '📊', render: renderDashboard    },
  measurements: { label: 'Log',       icon: '📝', render: renderMeasurements },
  inventory:    { label: 'Inventory', icon: '📦', render: renderInventory    },
  prep:         { label: 'Prep',      icon: '✅', render: renderPrep         }
};

let activeScreen = null;

// ============================================================
// Initialise on DOM ready
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  buildNav();
  navigateTo('dashboard');
  checkConnectivity();
});

// ============================================================
// Navigation
// ============================================================

function buildNav() {
  const nav = document.getElementById('bottom-nav');
  if (!nav) return;
  nav.innerHTML = Object.entries(SCREENS).map(([key, cfg]) => `
    <button class="nav-btn" id="nav-${key}" onclick="navigateTo('${key}')"
            aria-label="${cfg.label}">
      <span class="nav-icon">${cfg.icon}</span>
      <span>${cfg.label}</span>
    </button>
  `).join('');
}

async function navigateTo(screenKey) {
  if (activeScreen === screenKey) return;
  activeScreen = screenKey;

  // Update nav highlight
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById('nav-' + screenKey);
  if (activeBtn) activeBtn.classList.add('active');

  // Render screen
  const container = document.getElementById('screen-container');
  if (!container) return;

  const cfg = SCREENS[screenKey];
  if (!cfg) {
    container.innerHTML = `<p class="no-data">Unknown screen: ${screenKey}</p>`;
    return;
  }

  // Pass cached dashboard data to inventory screen so it can seed counts
  if (screenKey === 'inventory') {
    cfg.render(container, typeof dashboardData !== 'undefined' ? dashboardData : null);
  } else {
    cfg.render(container);
  }
}
