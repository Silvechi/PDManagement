// ============================================================
// history.js — Exchange history screen
// ============================================================

const MAIL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true">
  <rect x="2" y="4" width="20" height="16" rx="2"/>
  <polyline points="2,4 12,13 22,4"/>
</svg>`;

const HIST_PRESETS = [
  { label: '1W', days: 7  },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
];

let _histFrom   = null; // YYYY-MM-DD
let _histTo     = null; // YYYY-MM-DD
let _histRows   = null;
let _histConfig = null; // inventoryConfig cache for bag color lookup

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

function _histBuildShell(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">${t('hist.title')}</h1>
          <div class="page-sub">${t('hist.sub')}</div>
        </div>
        <button class="ghost-btn hist-email-btn" onclick="_histShowEmailScreen(document.getElementById('screen-container'))"
                title="${t('hist.email_btn')}" aria-label="${t('hist.email_btn')}">${MAIL_ICON}</button>
      </div>
      <div class="hist-filter">
        <div class="hist-filter-top">
          <div class="chip-row" id="hist-chips"></div>
          <span class="hist-sync-dot" id="hist-sync-dot" style="display:none"></span>
        </div>
        <div class="hist-daterange">
          <div class="hist-daterange-field">
            <label class="hist-daterange-label" for="hist-from">${t('hist.from')}</label>
            <input type="date" class="hist-date-input" id="hist-from"
                   value="${_histFrom}" max="${_todayStr()}" onchange="onHistFromChange(this.value)">
          </div>
          <span class="hist-daterange-sep">${t('hist.range_sep')}</span>
          <div class="hist-daterange-field">
            <label class="hist-daterange-label" for="hist-to">${t('hist.to')}</label>
            <input type="date" class="hist-date-input" id="hist-to"
                   value="${_histTo}" max="${_todayStr()}" onchange="onHistToChange(this.value)">
          </div>
        </div>
      </div>
      <div id="hist-loading" class="loading-state">${t('common.loading')}</div>
      <div id="hist-content"></div>
    </div>
  `;
  _renderHistChips();
}

async function renderHistory(container) {
  _histFrom = _daysAgoStr(7);
  _histTo   = _todayStr();
  _histRows = null;
  _histBuildShell(container);
  await _fetchAndRenderHist();
}

// Back-navigation from email sub-screen — restores history shell preserving current date filter
async function _histEmailBack(container) {
  _histRows = null;
  _histBuildShell(container);
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
  const loading   = document.getElementById('hist-loading');
  const content   = document.getElementById('hist-content');
  const patientId = getActivePatientId();

  const cached = AppCache.getHistory(patientId, _histFrom, _histTo);
  if (cached) {
    _histRows = cached.data;
    if (loading) loading.style.display = 'none';
    _renderHistContent();
    _histBackgroundRefresh(patientId, cached.version);
    return;
  }

  if (loading) { loading.textContent = t('common.loading'); loading.style.display = ''; }
  if (content) content.innerHTML = '';

  try {
    const [result, dashResult] = await Promise.all([
      API.getHistory({ patientId, from: _histFrom, to: _histTo }),
      _histConfig ? Promise.resolve(null) : API.getDashboard(patientId)
    ]);
    if (dashResult?.inventoryConfig) _histConfig = dashResult.inventoryConfig;
    _histRows = result.rows || [];
    AppCache.setHistory(patientId, _histFrom, _histTo, _histRows, result.version || null);
    _renderHistContent();
  } catch (err) {
    if (loading) loading.innerHTML = `<div class="feedback feedback-error">${t('common.failed', { msg: escHtml(err.message) })}</div>`;
  }
}

function _histSetSyncing(on) {
  const dot = document.getElementById('hist-sync-dot');
  if (dot) dot.style.display = on ? '' : 'none';
}

async function _histBackgroundRefresh(patientId, cachedVersion) {
  try {
    const { version } = await API.getDataVersion();
    if (version && version !== cachedVersion) {
      _histSetSyncing(true);
      const loading = document.getElementById('hist-loading');
      const content = document.getElementById('hist-content');
      if (loading) { loading.textContent = t('common.loading'); loading.style.display = ''; }
      if (content) content.innerHTML = '';
      const [result, dashResult] = await Promise.all([
        API.getHistory({ patientId, from: _histFrom, to: _histTo }),
        _histConfig ? Promise.resolve(null) : API.getDashboard(patientId)
      ]);
      if (dashResult?.inventoryConfig) _histConfig = dashResult.inventoryConfig;
      _histRows = result.rows || [];
      AppCache.setHistory(patientId, _histFrom, _histTo, _histRows, result.version || null);
      _renderHistContent();
      _histSetSyncing(false);
    }
  } catch { _histSetSyncing(false); }
}

function _renderHistContent() {
  const loading = document.getElementById('hist-loading');
  const content = document.getElementById('hist-content');
  if (loading) loading.style.display = 'none';
  if (!content) return;

  const exchangeTypes = new Set(['drain', 'fill', 'drain_fill']);
  const rows = (_histRows || []).filter(r => exchangeTypes.has(r.measurementType));

  if (!rows.length) {
    content.innerHTML = `<p class="no-data">${t('hist.no_data')}</p>`;
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
      const label = d.toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
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
  const cfg = _histConfig || getDashboardData()?.inventoryConfig;
  if (!cfg) return null;
  const item = cfg.find(i => bagDisplayName(i) === bagType || i.name === bagType);
  return item ? bagColorsFor(item).color : null;
}

function _buildHistRow(row) {
  const type = row.measurementType || '';
  const labels = {
    drain_fill: t('hist.drain_fill'),
    drain:      t('hist.drain'),
    fill:       t('hist.fill'),
  };
  const time = _histFmtTime(row.time);

  const bagType   = row.bagType   ? escHtml(String(row.bagType))   : '';
  const bagWeight = row.bagWeight !== '' && row.bagWeight !== null ? parseFloat(row.bagWeight) : null;
  const notes     = row.notes     ? escHtml(String(row.notes))     : '';

  let detail = '';
  if (type !== 'fill' && bagWeight !== null && !isNaN(bagWeight)) {
    const drainedStr = t('hist.drained', { weight: bagWeight.toFixed(1) });
    detail = bagType ? `${bagType} · ${drainedStr}` : drainedStr;
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

// ============================================================
// Email report sub-screen
// ============================================================

async function _histShowEmailScreen(container) {
  const savedFrom = _histFrom;
  const savedTo   = _histTo;

  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <button class="ghost-btn back-btn" onclick="_histEmailBack(document.getElementById('screen-container'))"
                aria-label="${t('common.back')}">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
               aria-hidden="true"><polyline points="15,18 9,12 15,6"/></svg>
        </button>
        <div>
          <h1 class="page-title">${t('hist.email_title')}</h1>
          <div class="page-sub">${t('hist.email_range')}: ${escHtml(savedFrom)} → ${escHtml(savedTo)}</div>
        </div>
      </div>
      <div id="email-screen-body">
        <div class="loading-state">${t('common.loading')}</div>
      </div>
    </div>
  `;

  try {
    const { recipients } = await API.getRecipients();
    _histRenderRecipientList(container, recipients, savedFrom, savedTo);
  } catch (err) {
    const body = document.getElementById('email-screen-body');
    if (body) body.innerHTML = `<div class="feedback feedback-error">${t('common.failed', { msg: escHtml(err.message) })}</div>`;
  }
}

function _histRenderRecipientList(container, recipients, savedFrom, savedTo) {
  const body = document.getElementById('email-screen-body');
  if (!body) return;

  if (!recipients || !recipients.length) {
    body.innerHTML = `<p class="no-data">${t('hist.email_none')}</p>`;
    return;
  }

  const rows = recipients.map((r, i) => `
    <label class="email-recipient-row">
      <input type="checkbox" class="email-recipient-cb" value="${escHtml(r.email)}" checked>
      <span class="email-recipient-info">
        <span class="email-recipient-name">${escHtml(r.name)}</span>
        <span class="email-recipient-email">${escHtml(r.email)}</span>
      </span>
    </label>
  `).join('');

  body.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2 class="card-title">${t('hist.email_recipients')}</h2>
        <label class="email-select-all">
          <input type="checkbox" id="email-select-all-cb" checked onchange="_histEmailToggleAll(this.checked)">
          <span>${t('hist.email_select_all')}</span>
        </label>
      </div>
      <div class="email-recipient-list">${rows}</div>
    </div>
    <div id="email-feedback"></div>
    <div class="email-action-row">
      <button class="primary-btn lg" id="email-send-btn" onclick="_histSendEmail(document.getElementById('screen-container'))">
        ${t('hist.email_send')}
      </button>
      <button class="ghost-btn email-download-btn" id="email-download-btn" onclick="_histDownloadReport()">
        ${t('hist.email_download')}
      </button>
    </div>
  `;
}

function _histEmailToggleAll(checked) {
  document.querySelectorAll('.email-recipient-cb').forEach(cb => { cb.checked = checked; });
}

async function _histSendEmail(container) {
  const sendBtn  = document.getElementById('email-send-btn');
  const feedback = document.getElementById('email-feedback');

  const selected = Array.from(document.querySelectorAll('.email-recipient-cb:checked'))
    .map(cb => cb.value);

  if (!selected.length) {
    if (feedback) feedback.innerHTML = `<div class="feedback feedback-error">${t('hist.email_no_recipients')}</div>`;
    return;
  }

  if (sendBtn)  { sendBtn.disabled = true; sendBtn.textContent = t('hist.email_sending'); }
  if (feedback) feedback.innerHTML = '';

  try {
    const result = await API.sendHistoryEmail({
      patientId:  getActivePatientId(),
      from:       _histFrom,
      to:         _histTo,
      recipients: selected
    });
    if (feedback) feedback.innerHTML = `<div class="feedback feedback-success">${t('hist.email_sent', { n: result.sent })}</div>`;
    setTimeout(() => _histEmailBack(container), 1500);
  } catch (err) {
    if (feedback) feedback.innerHTML = `<div class="feedback feedback-error">${t('hist.email_error', { msg: escHtml(err.message) })}</div>`;
    if (sendBtn)  { sendBtn.disabled = false; sendBtn.textContent = t('hist.email_send'); }
  }
}

async function _histDownloadReport() {
  const dlBtn   = document.getElementById('email-download-btn');
  const feedback = document.getElementById('email-feedback');

  // Open the window NOW — synchronously in the click handler — before any await,
  // or mobile browsers will treat it as a popup and block it.
  const win = window.open('', '_blank');
  if (!win) {
    if (feedback) feedback.innerHTML = `<div class="feedback feedback-error">Popup blocked — please allow popups for this page and try again.</div>`;
    return;
  }

  win.document.write('<html><head><meta charset="UTF-8"><title>PD Report</title></head>' +
    '<body style="font-family:sans-serif;padding:32px;color:#555">' +
    '<p style="font-size:15px">Generating report…</p></body></html>');

  if (dlBtn) { dlBtn.disabled = true; dlBtn.textContent = t('hist.email_downloading'); }
  if (feedback) feedback.innerHTML = '';

  try {
    const result = await API.getHistoryReportHtml({
      patientId: getActivePatientId(),
      from:      _histFrom,
      to:        _histTo
    });
    win.document.open();
    win.document.write(result.html);
    win.document.close();
  } catch (err) {
    win.document.open();
    win.document.write('<html><body style="font-family:sans-serif;padding:32px;color:#c00">' +
      '<strong>Error generating report:</strong> ' + escHtml(err.message) + '</body></html>');
    win.document.close();
    if (feedback) feedback.innerHTML = `<div class="feedback feedback-error">${t('hist.email_error', { msg: escHtml(err.message) })}</div>`;
  } finally {
    if (dlBtn) { dlBtn.disabled = false; dlBtn.textContent = t('hist.email_download'); }
  }
}
