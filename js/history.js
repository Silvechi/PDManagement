// ============================================================
// history.js — Exchange history screen
// ============================================================

const HIST_PRESETS = [
  { label: '1W', days: 7  },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
];

let _histFrom = null; // YYYY-MM-DD
let _histTo   = null; // YYYY-MM-DD
let _histRows = null;

function _todayStr() {
  return new Date().toLocaleDateString('en-CA');
}
function _daysAgoStr(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('en-CA');
}
function _activePreset() {
  const to = _histTo || _todayStr();
  return HIST_PRESETS.find(p => _histFrom === _daysAgoStr(p.days) && to === _todayStr()) || null;
}

async function renderHistory(container) {
  _histFrom = _daysAgoStr(7);
  _histTo   = _todayStr();
  _histRows = null;

  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">History</h1>
          <div class="page-sub">Exchange log</div>
        </div>
      </div>
      <div class="hist-filter">
        <div class="chip-row" id="hist-chips"></div>
        <div class="hist-daterange">
          <div class="hist-daterange-field">
            <label class="hist-daterange-label" for="hist-from">From</label>
            <input type="date" class="hist-date-input" id="hist-from"
                   value="${_histFrom}" max="${_todayStr()}" onchange="onHistFromChange(this.value)">
          </div>
          <span class="hist-daterange-sep">→</span>
          <div class="hist-daterange-field">
            <label class="hist-daterange-label" for="hist-to">To</label>
            <input type="date" class="hist-date-input" id="hist-to"
                   value="${_histTo}" max="${_todayStr()}" onchange="onHistToChange(this.value)">
          </div>
        </div>
      </div>
      <div id="hist-loading" class="loading-state">Loading…</div>
      <div id="hist-content"></div>
    </div>
  `;

  _renderHistChips();
  await _fetchAndRenderHist();
}

function _renderHistChips() {
  const container = document.getElementById('hist-chips');
  if (!container) return;
  const active = _activePreset();
  container.innerHTML = HIST_PRESETS.map(p => `
    <button class="chip${active?.days === p.days ? ' active' : ''}" onclick="setHistPreset(${p.days})">
      ${p.label}
    </button>
  `).join('');
}

function setHistPreset(days) {
  _histFrom = _daysAgoStr(days);
  _histTo   = _todayStr();
  const fromEl = document.getElementById('hist-from');
  const toEl   = document.getElementById('hist-to');
  if (fromEl) fromEl.value = _histFrom;
  if (toEl)   toEl.value   = _histTo;
  _renderHistChips();
  _fetchAndRenderHist();
}

function onHistFromChange(val) {
  _histFrom = val;
  _renderHistChips();
  _fetchAndRenderHist();
}

function onHistToChange(val) {
  _histTo = val;
  _renderHistChips();
  _fetchAndRenderHist();
}

async function _fetchAndRenderHist() {
  const loading = document.getElementById('hist-loading');
  const content = document.getElementById('hist-content');
  if (loading) { loading.textContent = 'Loading…'; loading.style.display = ''; }
  if (content) content.innerHTML = '';

  try {
    const needsConfig = !getDashboardData();
    const [result] = await Promise.all([
      API.getHistory({ from: _histFrom, to: _histTo }),
      needsConfig ? API.getDashboard().then(d => { dashboardData = d; }) : Promise.resolve()
    ]);
    _histRows = result.rows || [];
    _renderHistContent();
  } catch (err) {
    if (loading) loading.innerHTML = `<div class="feedback feedback-error">Failed to load: ${escHtml(err.message)}</div>`;
  }
}

function _renderHistContent() {
  const loading = document.getElementById('hist-loading');
  const content = document.getElementById('hist-content');
  if (loading) loading.style.display = 'none';
  if (!content) return;

  const exchangeTypes = new Set(['drain', 'fill', 'drain_fill']);
  const rows = (_histRows || []).filter(r => exchangeTypes.has(r.measurementType));

  if (!rows.length) {
    content.innerHTML = `<p class="no-data">No exchanges in this period.</p>`;
    return;
  }

  // Group by calendar date, newest first
  const groups = {};
  rows.forEach(row => {
    const key = _histDateKey(row.date);
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });

  content.innerHTML = Object.keys(groups)
    .sort((a, b) => b.localeCompare(a))
    .map(key => {
      const d     = new Date(key + 'T00:00:00');
      const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      return `
        <div class="hist-group">
          <div class="hist-date-hdr">${escHtml(label)}</div>
          ${groups[key].map(_buildHistRow).join('')}
        </div>
      `;
    }).join('');
}

function _bagColorForType(bagType) {
  if (!bagType) return null;
  const dash = typeof getDashboardData === 'function' ? getDashboardData() : null;
  const cfg  = dash?.inventoryConfig || [];
  const item = cfg.find(i => bagDisplayName(i) === bagType || i.name === bagType);
  return item ? bagColorsFor(item).color : null;
}

function _buildHistRow(row) {
  const type   = row.measurementType || '';
  const labels = { drain_fill: 'Drain & Fill', drain: 'Drain only', fill: 'Fill only' };
  const time   = _histFmtTime(row.time);

  const bagType   = row.bagType   ? escHtml(String(row.bagType))   : '';
  const bagWeight = row.bagWeight !== '' && row.bagWeight !== null ? parseFloat(row.bagWeight) : null;
  const notes     = row.notes     ? escHtml(String(row.notes))     : '';

  let detail = '';
  if (type !== 'fill' && bagWeight !== null && !isNaN(bagWeight)) {
    detail = bagType
      ? `${bagType} · ${bagWeight.toFixed(1)} kg drained`
      : `${bagWeight.toFixed(1)} kg drained`;
  } else if (bagType) {
    detail = bagType;
  }

  const color      = _bagColorForType(row.bagType);
  const colorStyle = color ? ` style="--row-bag:${color}"` : '';

  return `
    <div class="hist-row"${colorStyle}>
      <div class="hist-row-top">
        <span class="hist-time">${escHtml(time)}</span>
        <span class="hist-chip hist-chip-${type}">${escHtml(labels[type] || type)}</span>
      </div>
      ${detail ? `<div class="hist-detail">${detail}</div>` : ''}
      ${notes  ? `<div class="hist-notes">${notes}</div>`  : ''}
    </div>
  `;
}

function _histDateKey(dateVal) {
  if (!dateVal) return '0000-00-00';
  const s = String(dateVal);
  if (s.length >= 10 && s[4] === '-') return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return s;
}

function _histFmtTime(timeVal) {
  if (!timeVal) return '';
  const s = String(timeVal);
  // GAS time values serialize as "1899-12-30THH:MM:SS.000Z" — extract HH:MM in UTC
  if (s.includes('T')) {
    const d = new Date(s);
    if (!isNaN(d)) {
      return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
    }
  }
  return s.slice(0, 5);
}
