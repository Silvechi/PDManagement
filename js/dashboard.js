// ============================================================
// dashboard.js — Dashboard screen
// ============================================================

let dashboardData      = null;
let _dashExchangeTimer = null;

// inventory.js and measurements.js read this via getDashboardData() rather than the raw global
function getDashboardData() { return dashboardData; }

// ── Exchange time helpers ─────────────────────────────────────

// Normalises a GAS time value ("1899-12-30THH:MM:SS.000Z" or "HH:MM") to "HH:MM".
function _parseExchangeTime(timeStr) {
  if (!timeStr) return '00:00';
  const s = String(timeStr);
  if (s.includes('T')) {
    const d = new Date(s);
    if (!isNaN(d)) {
      return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
    }
  }
  return s.slice(0, 5) || '00:00';
}

// Returns a precise elapsed string: "4h 15m", "25m", "2d 3h", etc.
function _fmtElapsed(dateStr, timeStr) {
  if (!dateStr) return '';
  const dt = new Date(dateStr + 'T' + _parseExchangeTime(timeStr) + ':00');
  const totalMin = Math.floor((Date.now() - dt.getTime()) / 60000);
  if (isNaN(totalMin) || totalMin < 0) return '';
  const days = Math.floor(totalMin / 1440);
  const hrs  = Math.floor((totalMin % 1440) / 60);
  const min  = totalMin % 60;
  if (days > 0) return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
  if (hrs  > 0) return min > 0 ? `${hrs}h ${min}m` : `${hrs}h`;
  return `${min}m`;
}

// Starts a 1-minute interval to keep #dash-exchange-elapsed current.
// Self-cancels when the user navigates away from the dashboard.
function _startExchangeTimer(lastExchange) {
  if (_dashExchangeTimer) { clearInterval(_dashExchangeTimer); _dashExchangeTimer = null; }
  if (!lastExchange) return;
  _dashExchangeTimer = setInterval(() => {
    if (activeScreen !== 'dashboard') {
      clearInterval(_dashExchangeTimer);
      _dashExchangeTimer = null;
      return;
    }
    const el = document.getElementById('dash-exchange-elapsed');
    if (el) el.textContent = _fmtElapsed(lastExchange.date, lastExchange.time);
  }, 60000);
}

// Call after a successful local write to force re-fetch on next visit
function invalidateDashboardCache(patientId) {
  AppCache.invalidateDashboard(patientId || getActivePatientId());
}

async function renderDashboard(container) {
  const today = new Date().toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' });
  const patientId = getActivePatientId();

  const REFRESH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15"/></svg>`;

  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">${t('nav.dashboard')}</h1>
          <div class="page-sub">${today}</div>
          <div class="dash-updated" id="dash-updated"></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="icon-btn" id="dash-refresh-btn" onclick="refreshDashboard()" title="Refresh">${REFRESH_ICON}</button>
          <button class="quick-log" onclick="navigateTo('measurements')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16"><path d="M12 5v14M5 12h14"/></svg>
            <span>${t('dash.quick_log')}</span>
          </button>
        </div>
      </div>
      <div id="dash-loading" class="loading-state" style="display:none">${t('common.loading')}</div>
      <div id="dash-content"></div>
    </div>
  `;

  const cached = AppCache.getDashboard(patientId);
  if (cached?.data) {
    dashboardData = cached.data;
    renderDashboardContent(cached.data);
    _dashSetUpdated(cached.savedAt);
    _dashBackgroundRefresh(patientId, cached.version);
  } else {
    document.getElementById('dash-loading').style.display = '';
    await _dashFetch(patientId);
  }
}

function _dashSetRefreshing(on) {
  const btn = document.getElementById('dash-refresh-btn');
  if (btn) btn.classList.toggle('spinning', on);
}

async function refreshDashboard() {
  const patientId = getActivePatientId();
  // Wipe the cache so stale data is gone before we show the loading state
  AppCache.clearDashboard(patientId);
  _dashSetRefreshing(true);
  const loading = document.getElementById('dash-loading');
  const content = document.getElementById('dash-content');
  if (content) content.innerHTML = '';
  if (loading) loading.style.display = '';
  await _dashFetch(patientId); // not silent — loading spinner shows while fetching
  _dashSetRefreshing(false);
}

async function _dashFetch(patientId, silent = false) {
  try {
    const fresh = await API.getDashboard(patientId);
    dashboardData = fresh;
    const version = fresh.dataVersion || null;
    AppCache.setDashboard(patientId, fresh, version);
    renderDashboardContent(fresh);
    _dashSetUpdated(Date.now());
    const loading = document.getElementById('dash-loading');
    if (loading) loading.style.display = 'none';
  } catch (err) {
    if (silent) return;
    const loading = document.getElementById('dash-loading');
    if (loading) {
      loading.style.display = '';
      loading.innerHTML = `<div class="feedback feedback-error">${t('common.failed', { msg: escHtml(err.message) })}</div>`;
    }
  }
}

async function _dashBackgroundRefresh(patientId, cachedVersion) {
  try {
    const { version } = await API.getDataVersion();
    if (version && version !== cachedVersion) {
      _dashSetRefreshing(true);
      await _dashFetch(patientId, true); // silent — cached content already showing
      _dashSetRefreshing(false);
    }
  } catch {}
}

function _dashSetUpdated(ts) {
  const el = document.getElementById('dash-updated');
  if (!el || !ts) return;
  const d = new Date(ts);
  el.textContent = t('dash.updated', { time: d.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' }) });
}

function renderDashboardContent(data) {
  const loading = document.getElementById('dash-loading');
  const content = document.getElementById('dash-content');
  if (loading) loading.style.display = 'none';
  if (content) content.style.display = 'block';

  const config    = data.inventoryConfig || [];
  const inventory = data.inventory || {};

  // Split items into bags and other supplies
  const bagItems     = config.filter(item => isBagItem(item) && isActiveBagItem(item));
  const supplyItems  = config.filter(item => !isBagItem(item) && isActiveBagItem(item));

  // ── Bag hero cards ──
  let bagHeroHtml = `<p class="no-data">${t('dash.no_bag_data')}</p>`;
  if (bagItems.length) {
    bagHeroHtml = bagItems.map(item => {
      const c     = bagColorsFor(item);
      const label = bagDisplayName(item);
      const count = inventory[item.name] ?? 0;
      const low   = count < (item.min || 5);
      const vars  = `--bag:${c.color};--bag-soft:${c.soft};--bag-deep:${c.deep}`;
      return `
        <div class="bag-hero${low ? ' low' : ''}" style="${vars}">
          <div class="bag-hero-top">
            <span class="bag-dot lg"></span>
            <span class="bag-hero-pct">${escHtml(label)}</span>
          </div>
          <div class="bag-hero-right">
            <div class="bag-hero-count">${count}</div>
            <div class="bag-hero-label">
              ${low ? `<span class="low-tag">${t('common.low')}</span>` : `<span class="bag-hero-stock">${t('dash.bags')}</span>`}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Supply cells ──
  let suppliesHtml = '';
  if (supplyItems.length) {
    suppliesHtml = `
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">${t('dash.supplies')}</h2>
          <button class="link" onclick="navigateTo('inventory')">${t('common.manage')}</button>
        </div>
        <div class="supplies-grid">
          ${supplyItems.map(item => {
            const v   = inventory[item.name] ?? 0;
            const low = v < (item.min || 0);
            const lbl = item.name.length > 12 ? item.name.slice(0, 12) + '…' : item.name;
            return `
              <div class="supply${low ? ' low' : ''}">
                <div class="supply-label">${escHtml(lbl)}</div>
                <div class="supply-val">${v}${low ? `<span class="warn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 9v4M12 17h.01M10.3 3.8L2.6 17a2 2 0 001.7 3h15.4a2 2 0 001.7-3L13.7 3.8a2 2 0 00-3.4 0z"/></svg></span>` : ''}</div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  // ── Low stock banner (if any bags low) ──
  let lowBanner = '';
  if (data.lowStockFlags) {
    lowBanner = `
      <div class="card card-low-stock">
        <div class="card-low-stock-inner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M12 9v4M12 17h.01M10.3 3.8L2.6 17a2 2 0 001.7 3h15.4a2 2 0 001.7-3L13.7 3.8a2 2 0 00-3.4 0z"/></svg>
          ${t('dash.low_stock', { flags: escHtml(data.lowStockFlags) })}
        </div>
      </div>
    `;
  }

  // ── Exchange overdue indicator ──
  let overdueBanner = '';
  if (data.lastExchange && bagItems.length) {
    const maxH = bagItems.reduce((m, item) =>
      (item.maxHours > 0) ? (m === null ? item.maxHours : Math.min(m, item.maxHours)) : m, null);
    if (maxH !== null) {
      const dt = new Date(data.lastExchange.date + 'T' + _parseExchangeTime(data.lastExchange.time) + ':00');
      const hoursAgo = (Date.now() - dt.getTime()) / 3600000;
      if (!isNaN(hoursAgo) && hoursAgo > maxH) {
        const elapsed = _fmtElapsed(data.lastExchange.date, data.lastExchange.time);
        overdueBanner = `
          <div class="card card-overdue">
            <div class="card-overdue-inner">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              ${t('dash.overdue', { elapsed, maxH })}
            </div>
          </div>
        `;
      }
    }
  }

  // ── BP vitals ──
  const bpRecent = data.bpRecent || [];
  let bpHtml = `<p class="no-data">${t('dash.no_bp')}</p>`;
  if (bpRecent.length || data.bpAvg) {
    const lastBP = bpRecent[bpRecent.length - 1] || data.bpAvg;
    const avgBP  = data.bpAvg;
    const valStr = lastBP
      ? `<span class="vitals-val">${lastBP.systolic}<span class="slash">/</span>${lastBP.diastolic}<span class="unit"> mmHg</span></span>`
      : '';
    const metaStr = avgBP
      ? `<div class="vitals-meta">${lastBP?.time || ''} · ${t('dash.avg')} <strong>${avgBP.systolic}/${avgBP.diastolic}</strong></div>`
      : `<div class="vitals-meta">${lastBP?.time || ''}</div>`;
    bpHtml = `
      <div class="vitals-stack">
        <div class="vitals-row big">
          <span class="vitals-label">${t('dash.blood_pressure')}</span>
          ${valStr}
        </div>
        ${metaStr}
      </div>
    `;
  }

  // ── Weight + sparkline ──
  const trend  = (data.weightTrend || []).filter(e => e.weight !== '' && e.weight !== null && !isNaN(parseFloat(e.weight)));
  let weightHtml = `<p class="no-data">${t('dash.no_weight')}</p>`;
  if (trend.length) {
    const values   = trend.map(e => parseFloat(e.weight));
    const last     = values[values.length - 1];
    const delta    = last - values[0];
    const deltaStr = (delta >= 0 ? '+' : '') + delta.toFixed(1);
    const sparkSvg = buildSparkline(values);
    weightHtml = `
      <div class="weight-summary">
        <div class="weight-now">${last.toFixed(1)}<span class="unit">kg</span></div>
        ${sparkSvg}
      </div>
      <div class="vitals-meta" style="margin-top:6px">${t('dash.trend', { delta: deltaStr })}</div>
    `;
  }

  content.innerHTML = `
    ${overdueBanner}
    ${lowBanner}

    ${bagItems.length ? `
    <section class="card">
      <div class="card-head">
        <div>
          <h2 class="card-title">${t('dash.solution_bags')}</h2>
          ${data.lastExchange ? `<p class="card-sub">${t('dash.last_exchange', { time: _parseExchangeTime(data.lastExchange.time) })}</p>` : ''}
        </div>
        <button class="link" onclick="navigateTo('inventory')">${t('common.manage')}</button>
      </div>
      <div class="bag-hero-grid">${bagHeroHtml}</div>
      ${data.lastExchange ? `
      <div class="exchange-timer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        <div>
          <div class="exchange-timer-val" id="dash-exchange-elapsed">${_fmtElapsed(data.lastExchange.date, data.lastExchange.time)}</div>
          <div class="exchange-timer-label">${t('dash.since_exchange')}</div>
        </div>
      </div>
      ` : ''}
    </section>
    ` : ''}

    ${suppliesHtml}

    ${data.lastCcpd ? `
    <section class="card">
      <div class="card-head">
        <div>
          <h2 class="card-title">${t('dash.ccpd.title')}</h2>
          <p class="card-sub">${timeAgo(data.lastCcpd.date, data.lastCcpd.time)}</p>
        </div>
        <button class="link" onclick="navigateTo('measurements','ccpd')">${t('common.log')}</button>
      </div>
      <div class="ccpd-summary">
        <div class="ccpd-stat">
          <div class="ccpd-stat-val">${data.lastCcpd.initialDrain}<span class="unit"> mL</span></div>
          <div class="ccpd-stat-label">${t('dash.ccpd.initial_drain')}</div>
        </div>
        <div class="ccpd-stat">
          <div class="ccpd-stat-val">${data.lastCcpd.ufVolume > 0 ? '+' : ''}${data.lastCcpd.ufVolume}<span class="unit"> mL</span></div>
          <div class="ccpd-stat-label">${t('dash.ccpd.uf')}</div>
        </div>
        <div class="ccpd-stat">
          <div class="ccpd-stat-val">${data.lastCcpd.avgDwell}<span class="unit"> min</span></div>
          <div class="ccpd-stat-label">${t('dash.ccpd.dwell')}</div>
        </div>
      </div>
    </section>
    ` : ''}

    <div class="two-col">
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">${t('dash.latest_vitals')}</h2>
          <button class="link" onclick="navigateTo('measurements','bp')">${t('common.log')}</button>
        </div>
        ${bpHtml}
      </section>

      <section class="card">
        <div class="card-head">
          <h2 class="card-title">${t('dash.weight')}</h2>
          <button class="link" onclick="navigateTo('measurements','weight')">${t('common.log')}</button>
        </div>
        ${weightHtml}
      </section>
    </div>
  `;

  _startExchangeTimer(data.lastExchange || null);
}

// ── Sparkline SVG ─────────────────────────────────────────────

function buildSparkline(values, w = 120, h = 44) {
  if (values.length < 2) return '';
  const min = Math.min(...values) - 0.3;
  const max = Math.max(...values) + 0.3;
  const n   = values.length;
  const pts = values.map((v, i) => {
    const x = (i / (n - 1)) * (w - 8) + 4;
    const y = h - 6 - ((v - min) / (max - min)) * (h - 12);
    return [x.toFixed(1), y.toFixed(1)];
  });
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' ');
  const last = pts[pts.length - 1];
  return `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="sparkline" aria-hidden="true">
      <path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="3" fill="currentColor"/>
    </svg>
  `;
}
