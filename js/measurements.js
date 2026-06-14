// ============================================================
// measurements.js — Log screen (Drainage / Weight / BP)
// ============================================================

// ── NowPill ──────────────────────────────────────────────────

let _nowPillDate = null;

function _nowFmt(d) {
  const today = new Date(); today.setHours(0,0,0,0);
  const dd    = new Date(d); dd.setHours(0,0,0,0);
  const day   = dd.getTime() === today.getTime() ? t('now.today')
    : dd.getTime() === today.getTime() - 86400000 ? t('now.yesterday')
    : new Date(d).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' });
  const time  = new Date(d).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

function _nowToInput(d) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
}

function buildNowPill(containerId) {
  _nowPillDate = new Date();
  _renderNowPill(containerId, false);
}

function _renderNowPill(containerId, open) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const display = _nowFmt(_nowPillDate);
  const EDIT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4z"/></svg>`;
  el.innerHTML = `
    <div class="now-pill-wrap">
      <button class="now-pill" id="now-pill-btn">
        <span class="now-dot"></span>
        <span><strong>${t('now.now')}</strong> · ${display}</span>
        <span class="now-edit-icon">${EDIT_ICON}</span>
      </button>
      ${open ? `
      <div class="now-edit-pop">
        <input type="datetime-local" id="now-dt-input" value="${_nowToInput(_nowPillDate)}">
        <div class="now-pop-row">
          <button class="ghost-btn" id="now-reset-btn">${t('now.reset')}</button>
          <button class="primary-btn sm" id="now-done-btn">${t('now.done')}</button>
        </div>
      </div>
      ` : ''}
    </div>
  `;

  document.getElementById('now-pill-btn').addEventListener('click', () => {
    _renderNowPill(containerId, !open);
  });
  if (open) {
    const dtInput = document.getElementById('now-dt-input');
    dtInput.addEventListener('change', e => { _nowPillDate = new Date(e.target.value); });
    document.getElementById('now-reset-btn').addEventListener('click', () => {
      _nowPillDate = new Date();
      _renderNowPill(containerId, false);
    });
    document.getElementById('now-done-btn').addEventListener('click', () => {
      _renderNowPill(containerId, false);
    });
  }
}

function nowDateStr() {
  const d = _nowPillDate || new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function nowTimeStr() {
  const d = _nowPillDate || new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ── Screen entry ──────────────────────────────────────────────

let _measCardsBuilt = {};

const MEAS_TABS = [
  { key: 'bag',    tKey: 'meas.tab.drainage', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 2.5s7 7.5 7 12.5a7 7 0 01-14 0c0-5 7-12.5 7-12.5z"/></svg>` },
  { key: 'weight', tKey: 'meas.tab.weight',   icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>` },
  { key: 'bp',     tKey: 'meas.tab.bp',       icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 12h3l2-5 3 10 2-7 2 4h6"/></svg>` },
  { key: 'ccpd',  tKey: 'meas.tab.ccpd',     icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 2v6h-6"/><path d="M3 22v-6h6"/><path d="M20.49 9a9 9 0 00-15-3.27L3 9M3.51 15a9 9 0 0015 3.27L21 15"/></svg>` },
];

const PROC_TYPES = [
  { key: 'both',  tKey: 'meas.proc.both'  },
  { key: 'drain', tKey: 'meas.proc.drain' },
  { key: 'fill',  tKey: 'meas.proc.fill'  },
];

const CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M5 12l5 5L20 7"/></svg>`;

// Bag card state — module-level so inline onclick handlers can reach them without window.*
let _procType  = 'both';
let _bagItem   = null;
let _usageBags = 1;
let _usageCaps = 1;
let _bagInt    = null;
let _bagDec    = null;
// Weight card state
let _wtH = null, _wtT = null, _wtO = null, _wtDec = null;
// BP card state
let _bpSH = null, _bpST = null, _bpSO = null;
let _bpDH = null, _bpDT = null, _bpDO = null;

let _activeBagItems = [];

function renderMeasurements(container, initialTab) {
  _nowPillDate = new Date();
  _measCardsBuilt = {};

  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">${t('meas.title')}</h1>
          <div class="page-sub">${t('meas.sub')}</div>
        </div>
        <div id="now-pill-container"></div>
      </div>

      <div class="tab-pill" id="meas-tab-pill">
        ${MEAS_TABS.map(tab => `
          <button class="tab-pill-btn" id="meas-tab-${tab.key}" onclick="switchMeasCard('${tab.key}')">
            ${tab.icon}<span>${t(tab.tKey)}</span>
          </button>
        `).join('')}
      </div>

      <div id="m-bag-card"></div>
      <div id="m-weight-card" style="display:none"></div>
      <div id="m-bp-card" style="display:none"></div>
      <div id="m-ccpd-card" style="display:none"></div>
    </div>
  `;

  buildNowPill('now-pill-container');
  switchMeasCard(initialTab || 'bag');
}

function switchMeasCard(key) {
  MEAS_TABS.forEach(tab => {
    const card = document.getElementById(`m-${tab.key}-card`);
    const btn  = document.getElementById(`meas-tab-${tab.key}`);
    if (card) card.style.display = tab.key === key ? '' : 'none';
    if (btn)  btn.classList.toggle('active', tab.key === key);
  });
  // Build card lazily — drum scroll-snap requires the element to be visible
  if (!_measCardsBuilt[key]) {
    _measCardsBuilt[key] = true;
    if (key === 'bag')    buildBagCard();
    if (key === 'weight') buildWeightCard();
    if (key === 'bp')     buildBPCard();
    if (key === 'ccpd')   buildCCPDCard();
  }
}

// ── Bag drainage card ─────────────────────────────────────────

function buildBagCard() {
  const card = document.getElementById('m-bag-card');
  if (!card) return;

  // Build active bag list from config
  const _dash = typeof getDashboardData === 'function' ? getDashboardData() : null;
  const _cfg = _dash?.inventoryConfig || [];
  _activeBagItems = _cfg.filter(item => isBagItem(item) && isActiveBagItem(item));

  _procType  = 'both';
  _bagItem   = _activeBagItems[0] || null;
  _usageBags = 1;
  _usageCaps = 1;

  const inv = _dash?.inventory;
  const bagCards = _activeBagItems.map((item, i) => {
    const c     = bagColorsFor(item);
    const label = bagDisplayName(item);
    const sel   = item === _bagItem;
    const stock = inv ? (inv[item.name] ?? '?') : '?';
    return `
      <button class="bag-pick-card${sel ? ' active' : ''}" id="bagpick-${i}"
              style="--bag:${c.color};--bag-soft:${c.soft};--bag-deep:${c.deep}"
              onclick="selectBagItem(${i})">
        <span class="bag-dot lg"></span>
        <span class="bag-pick-pct">${escHtml(label)}</span>
        <span class="bag-pick-stock">${t('meas.in_stock', { count: stock })}</span>
        ${sel ? `<span class="bag-pick-check">${CHECK_ICON}</span>` : ''}
      </button>
    `;
  }).join('');

  card.innerHTML = `
    <section class="card">
      <div class="card-head">
        <h2 class="card-title">${t('meas.exchange_type')}</h2>
        ${_dash?.lastExchange
          ? `<p class="card-sub">${t('meas.last', { ago: timeAgo(_dash.lastExchange.date, _dash.lastExchange.time) })}</p>`
          : ''}
      </div>
      <div class="seg-row">
        ${PROC_TYPES.map(p => `
          <button class="seg${p.key === _procType ? ' active' : ''}" id="proc-btn-${p.key}"
                  data-proc="${p.key}" onclick="switchProcType('${p.key}')">
            ${t(p.tKey)}
          </button>
        `).join('')}
      </div>
    </section>

    <section class="card" id="bag-drain-section">
      <div class="card-head">
        <h2 class="card-title">${t('meas.drained')}</h2>
        <p class="card-sub">${t('meas.scroll_wheels')}</p>
      </div>
      <div class="drum-wrap">
        <div class="drum-picker" id="drain-drum-picker">
          <div id="bag-int-dp"></div>
          <span class="drum-sep">.</span>
          <div id="bag-dec-dp"></div>
          <span class="drum-unit">kg</span>
        </div>
      </div>
    </section>

    <section class="card" id="bag-fill-section">
      <div class="card-head">
        <h2 class="card-title">${t('meas.new_bag')}</h2>
        <p class="card-sub">${t('meas.tap_select')}</p>
      </div>
      <div class="bag-pick">${bagCards}</div>
    </section>

    <section class="card">
      <div class="card-head"><h2 class="card-title">${t('meas.supplies_used')}</h2></div>
      <div class="used-row">
        <div class="used-cell">
          <div class="stepper">
            <button onclick="adjustUsage('bags', -1)">${MINUS_ICON}</button>
            <span class="stepper-val" id="usage-bags-val">1</span>
            <button onclick="adjustUsage('bags', 1)">${PLUS_ICON}</button>
          </div>
          <span class="used-label">${t('meas.bags')}</span>
        </div>
        <div class="used-cell">
          <div class="stepper">
            <button onclick="adjustUsage('caps', -1)">${MINUS_ICON}</button>
            <span class="stepper-val" id="usage-caps-val">1</span>
            <button onclick="adjustUsage('caps', 1)">${PLUS_ICON}</button>
          </div>
          <span class="used-label">${t('meas.caps')}</span>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2 class="card-title">${t('common.notes')}</h2>
        <p class="card-sub">${t('meas.notes_sub')}</p>
      </div>
      <textarea class="notes" id="bag-notes" placeholder="${t('meas.notes_ph')}"></textarea>
    </section>

    <div id="bag-feedback" class="feedback" aria-live="polite"></div>

    <button class="primary-btn lg w-full" id="bag-submit" onclick="submitBag()">
      ${t('meas.save.both')}
    </button>
  `;

  _bagInt = new DrumPicker(document.getElementById('bag-int-dp'), {
    min: 0, max: 20, value: 2, label: 'drainage kg integer'
  });
  _bagDec = new DrumPicker(document.getElementById('bag-dec-dp'), {
    min: 0, max: 9, value: 0, label: 'drainage kg tenths'
  });
}

function switchProcType(key) {
  _procType = key;
  document.querySelectorAll('[data-proc]').forEach(b => {
    b.classList.toggle('active', b.dataset.proc === key);
  });
  const drainSection = document.getElementById('bag-drain-section');
  const fillSection  = document.getElementById('bag-fill-section');
  if (drainSection) drainSection.style.display = key !== 'fill'  ? '' : 'none';
  if (fillSection)  fillSection.style.display  = key !== 'drain' ? '' : 'none';
  const submitBtn = document.getElementById('bag-submit');
  if (submitBtn) {
    submitBtn.textContent = t('meas.save.' + key) || t('meas.save.both');
  }
  // Drain-only uses 0 bags; reset to 1 when fill is involved
  const bagsEl = document.getElementById('usage-bags-val');
  if (key === 'drain') {
    _usageBags = 0;
    if (bagsEl) bagsEl.textContent = '0';
  } else if (_usageBags === 0) {
    _usageBags = 1;
    if (bagsEl) bagsEl.textContent = '1';
  }
}

function selectBagItem(idx) {
  _bagItem = _activeBagItems[idx] || null;
  _activeBagItems.forEach((_, i) => {
    const btn = document.getElementById('bagpick-' + i);
    if (!btn) return;
    const sel = i === idx;
    btn.classList.toggle('active', sel);
    const existing = btn.querySelector('.bag-pick-check');
    if (sel && !existing) {
      btn.insertAdjacentHTML('beforeend', `<span class="bag-pick-check">${CHECK_ICON}</span>`);
    } else if (!sel && existing) {
      existing.remove();
    }
  });
}

function adjustUsage(type, delta) {
  if (type === 'bags') {
    _usageBags = Math.max(0, (_usageBags || 1) + delta);
    const el = document.getElementById('usage-bags-val');
    if (el) el.textContent = _usageBags;
  } else {
    _usageCaps = Math.max(0, (_usageCaps || 1) + delta);
    const el = document.getElementById('usage-caps-val');
    if (el) el.textContent = _usageCaps;
  }
}

async function submitBag() {
  const procType = _procType || 'both';
  const hasDrain = procType !== 'fill';
  const hasFill  = procType !== 'drain';
  const date     = nowDateStr();
  const time     = nowTimeStr();
  const notes    = document.getElementById('bag-notes')?.value.trim() || '';

  const btn = document.getElementById('bag-submit');
  btn.disabled = true; btn.textContent = t('common.saving');
  setFeedback('bag', '', '');

  try {
    const bagWeight = hasDrain ? (_bagInt.value + _bagDec.value / 10) : '';
    const bagType   = hasFill  ? (_bagItem ? bagDisplayName(_bagItem) : '') : '';
    await API.logMeasurement({
      date, time, bagWeight, bagType, notes,
      measurementType: procType === 'both' ? 'drain_fill' : procType,
      patientId: getActivePatientId()
    });
    invalidateDashboardCache();

    if (hasFill && _bagItem) {
      const usageBags = _usageBags || 1;
      const usageCaps = _usageCaps || 1;
      const inv = (typeof getDashboardData === 'function' ? getDashboardData() : null)?.inventory ?? null;
      if (inv) {
        const bagKey      = _bagItem.name;
        const deductItems = [];
        if (usageBags > 0) deductItems.push({ name: bagKey,  count: Math.max(0, (inv[bagKey]    ?? 0) - usageBags) });
        if (usageCaps > 0) deductItems.push({ name: 'Caps',  count: Math.max(0, (inv['Caps']    ?? 0) - usageCaps) });
        if (deductItems.length) {
          await API.updateInventory({ datetime: date + ' ' + time, items: deductItems, patientId: getActivePatientId() });
          deductItems.forEach(i => { inv[i.name] = i.count; });
        }
      }
    }

    setFeedback('bag', t('meas.saved.' + procType) || t('meas.saved.both'), 'success');

    // Reset
    _bagItem   = _activeBagItems[0] || null;
    _usageBags = 1;
    _usageCaps = 1;
    if (document.getElementById('bag-notes')) document.getElementById('bag-notes').value = '';
    const bagsEl = document.getElementById('usage-bags-val');
    const capsEl = document.getElementById('usage-caps-val');
    if (bagsEl) bagsEl.textContent = '1';
    if (capsEl) capsEl.textContent = '1';
    selectBagItem(0);
    _nowPillDate = new Date();
    buildNowPill('now-pill-container');
  } catch (err) {
    setFeedback('bag', t('common.error', { msg: err.message }), 'error');
  } finally {
    btn.disabled = false;
    switchProcType(_procType || 'both');
  }
}

// ── Weight card ───────────────────────────────────────────────

function buildWeightCard() {
  const card = document.getElementById('m-weight-card');
  if (!card) return;

  card.innerHTML = `
    <section class="card">
      <div class="card-head">
        <h2 class="card-title">${t('meas.weight.title')}</h2>
        <p class="card-sub">${t('meas.weight.sub')}</p>
      </div>
      <div class="drum-wrap">
        <div class="drum-picker">
          <div id="wt-h-dp"></div>
          <div id="wt-t-dp"></div>
          <div id="wt-o-dp"></div>
          <span class="drum-sep">.</span>
          <div id="wt-dec-dp"></div>
          <span class="drum-unit">kg</span>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2 class="card-title">${t('common.notes')}</h2></div>
      <textarea class="notes" id="wt-notes" placeholder="${t('common.optional')}"></textarea>
    </section>

    <div id="wt-feedback" class="feedback" aria-live="polite"></div>

    <button class="primary-btn lg w-full" id="wt-submit" onclick="submitWeight()">
      ${t('meas.weight.save')}
    </button>
  `;

  // Get last weight from dashboard cache as default
  let defaultKg = 65.0;
  const _wDash = typeof getDashboardData === 'function' ? getDashboardData() : null;
  if (_wDash?.weightTrend?.length) {
    const last = _wDash.weightTrend.filter(e => e.weight !== '' && !isNaN(parseFloat(e.weight))).pop();
    if (last) defaultKg = parseFloat(last.weight);
  }

  const h   = Math.floor(defaultKg / 100);
  const tV  = Math.floor((defaultKg % 100) / 10);
  const o   = Math.floor(defaultKg % 10);
  const dec = Math.round((defaultKg * 10) % 10);

  _wtH   = new DrumPicker(document.getElementById('wt-h-dp'),   { min: 0, max: 2, value: h,   label: 'weight hundreds' });
  _wtT   = new DrumPicker(document.getElementById('wt-t-dp'),   { min: 0, max: 9, value: tV,  label: 'weight tens' });
  _wtO   = new DrumPicker(document.getElementById('wt-o-dp'),   { min: 0, max: 9, value: o,   label: 'weight ones' });
  _wtDec = new DrumPicker(document.getElementById('wt-dec-dp'), { min: 0, max: 9, value: dec, label: 'weight tenths' });
}

async function submitWeight() {
  const date   = nowDateStr();
  const time   = nowTimeStr();
  const weight = _wtH.value * 100 + _wtT.value * 10 + _wtO.value + _wtDec.value / 10;

  const btn = document.getElementById('wt-submit');
  btn.disabled = true; btn.textContent = t('common.saving');
  setFeedback('wt', '', '');

  try {
    await API.logMeasurement({ date, time, weight, measurementType: 'weight', patientId: getActivePatientId() });
    invalidateDashboardCache();
    setFeedback('wt', t('meas.weight.saved', { weight: weight.toFixed(1) }), 'success');
    _nowPillDate = new Date();
    buildNowPill('now-pill-container');
  } catch (err) {
    setFeedback('wt', t('common.error', { msg: err.message }), 'error');
  } finally {
    btn.disabled = false; btn.textContent = t('meas.weight.save');
  }
}

// ── BP card ───────────────────────────────────────────────────

function buildBPCard() {
  const card = document.getElementById('m-bp-card');
  if (!card) return;

  card.innerHTML = `
    <section class="card">
      <div class="card-head">
        <h2 class="card-title">${t('meas.bp.title')}</h2>
      </div>
      <div class="drum-wrap">
        <div class="drum-picker bp-drum">
          <div id="bp-sh-dp"></div>
          <div id="bp-st-dp"></div>
          <div id="bp-so-dp"></div>
        </div>
        <span class="drum-slash">/</span>
        <div class="drum-picker bp-drum">
          <div id="bp-dh-dp"></div>
          <div id="bp-dt-dp"></div>
          <div id="bp-do-dp"></div>
          <span class="drum-unit">mmHg</span>
        </div>
      </div>
      <div class="bp-status ok" id="bp-status-row">
        <span class="bp-status-dot"></span>
        <span id="bp-status-text">${t('meas.bp.healthy')}</span>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2 class="card-title">${t('common.notes')}</h2></div>
      <textarea class="notes" id="bp-notes" placeholder="${t('common.optional')}"></textarea>
    </section>

    <div id="bp-feedback" class="feedback" aria-live="polite"></div>

    <button class="primary-btn lg w-full" id="bp-submit" onclick="submitBP()">
      ${t('meas.bp.save')}
    </button>
  `;

  const onChange = () => updateBpStatus();

  let defaultSys = 120, defaultDia = 80;
  const _bpDash = typeof getDashboardData === 'function' ? getDashboardData() : null;
  if (_bpDash?.bpRecent?.length) {
    const last = _bpDash.bpRecent[_bpDash.bpRecent.length - 1];
    if (last?.systolic) { defaultSys = last.systolic; defaultDia = last.diastolic || 80; }
  }
  const sh = Math.floor(defaultSys / 100), st = Math.floor((defaultSys % 100) / 10), so = defaultSys % 10;
  const dh = Math.floor(defaultDia / 100), dt = Math.floor((defaultDia % 100) / 10), dobj = defaultDia % 10;

  _bpSH = new DrumPicker(document.getElementById('bp-sh-dp'), { min: 0, max: 2, value: sh,   label: 'systolic hundreds',  onChange });
  _bpST = new DrumPicker(document.getElementById('bp-st-dp'), { min: 0, max: 9, value: st,   label: 'systolic tens',      onChange });
  _bpSO = new DrumPicker(document.getElementById('bp-so-dp'), { min: 0, max: 9, value: so,   label: 'systolic ones',      onChange });
  _bpDH = new DrumPicker(document.getElementById('bp-dh-dp'), { min: 0, max: 1, value: dh,   label: 'diastolic hundreds', onChange });
  _bpDT = new DrumPicker(document.getElementById('bp-dt-dp'), { min: 0, max: 9, value: dt,   label: 'diastolic tens',     onChange });
  _bpDO = new DrumPicker(document.getElementById('bp-do-dp'), { min: 0, max: 9, value: dobj, label: 'diastolic ones',     onChange });

  updateBpStatus();
}

function getBpValues() {
  return {
    sys: _bpSH.value * 100 + _bpST.value * 10 + _bpSO.value,
    dia: _bpDH.value * 100 + _bpDT.value * 10 + _bpDO.value,
  };
}

function updateBpStatus() {
  const { sys, dia } = getBpValues();
  const row  = document.getElementById('bp-status-row');
  const text = document.getElementById('bp-status-text');
  if (!row || !text) return;
  if (sys === 0 && dia === 0) { row.style.display = 'none'; return; }
  row.style.display = '';
  let cls, label;
  if (sys < 90 || dia < 60)        { cls = 'warn'; label = t('meas.bp.low'); }
  else if (sys > 140 || dia > 90)  { cls = 'warn'; label = t('meas.bp.high'); }
  else if (sys > 130 || dia > 85)  { cls = 'mid';  label = t('meas.bp.elevated'); }
  else                             { cls = 'ok';   label = t('meas.bp.healthy'); }
  row.className = 'bp-status ' + cls;
  text.textContent = label;
}

async function submitBP() {
  const { sys, dia } = getBpValues();
  const date = nowDateStr();
  const time = nowTimeStr();

  const btn = document.getElementById('bp-submit');
  btn.disabled = true; btn.textContent = t('common.saving');
  setFeedback('bp', '', '');

  try {
    await API.logMeasurement({ date, time, bpSystolic: sys, bpDiastolic: dia, measurementType: 'bp', patientId: getActivePatientId() });
    invalidateDashboardCache();
    setFeedback('bp', t('meas.bp.saved', { sys, dia }), 'success');
    _nowPillDate = new Date();
    buildNowPill('now-pill-container');
  } catch (err) {
    setFeedback('bp', t('common.error', { msg: err.message }), 'error');
  } finally {
    btn.disabled = false; btn.textContent = t('meas.bp.save');
  }
}

// ── CCPD card ─────────────────────────────────────────────────

function buildCCPDCard() {
  const card = document.getElementById('m-ccpd-card');
  if (!card) return;

  card.innerHTML = `
    <section class="card">
      <div class="card-head">
        <h2 class="card-title">${t('meas.ccpd.title')}</h2>
        <p class="card-sub">${t('meas.ccpd.sub')}</p>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2 class="card-title">${t('meas.ccpd.initial_drain')}</h2>
        <p class="card-sub">${t('meas.ccpd.initial_drain_sub')}</p>
      </div>
      <div class="ccpd-field-row">
        <input type="number" class="num-input" id="ccpd-initial-drain"
               min="0" max="9999" placeholder="0" inputmode="numeric">
        <span class="ccpd-unit">mL</span>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2 class="card-title">${t('meas.ccpd.uf')}</h2>
        <p class="card-sub">${t('meas.ccpd.uf_sub')}</p>
      </div>
      <div class="ccpd-field-row">
        <input type="number" class="num-input" id="ccpd-uf"
               min="-9999" max="9999" placeholder="0" inputmode="numeric">
        <span class="ccpd-unit">mL</span>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2 class="card-title">${t('meas.ccpd.dwell')}</h2>
        <p class="card-sub">${t('meas.ccpd.dwell_sub')}</p>
      </div>
      <div class="ccpd-field-row">
        <input type="number" class="num-input" id="ccpd-dwell"
               min="0" max="999" placeholder="0" inputmode="numeric">
        <span class="ccpd-unit">min</span>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2 class="card-title">${t('common.notes')}</h2></div>
      <textarea class="notes" id="ccpd-notes" placeholder="${t('common.optional')}"></textarea>
    </section>

    <div id="ccpd-feedback" class="feedback" aria-live="polite"></div>

    <button class="primary-btn lg w-full" id="ccpd-submit" onclick="submitCCPD()">
      ${t('meas.ccpd.save')}
    </button>
  `;
}

async function submitCCPD() {
  const date         = nowDateStr();
  const time         = nowTimeStr();
  const initialDrain = parseInt(document.getElementById('ccpd-initial-drain')?.value) || 0;
  const ufRaw        = document.getElementById('ccpd-uf')?.value;
  const ufVolume     = ufRaw !== '' && ufRaw !== undefined ? (parseInt(ufRaw) || 0) : 0;
  const avgDwell     = parseInt(document.getElementById('ccpd-dwell')?.value) || 0;
  const notes        = document.getElementById('ccpd-notes')?.value.trim() || '';

  const btn = document.getElementById('ccpd-submit');
  btn.disabled = true; btn.textContent = t('common.saving');
  setFeedback('ccpd', '', '');

  try {
    await API.logMeasurement({
      date, time, notes,
      initialDrain, ufVolume, avgDwell,
      measurementType: 'ccpd',
      patientId: getActivePatientId()
    });
    invalidateDashboardCache();
    setFeedback('ccpd', t('meas.ccpd.saved'), 'success');

    document.getElementById('ccpd-initial-drain').value = '';
    document.getElementById('ccpd-uf').value            = '';
    document.getElementById('ccpd-dwell').value         = '';
    document.getElementById('ccpd-notes').value         = '';
    _nowPillDate = new Date();
    buildNowPill('now-pill-container');
  } catch (err) {
    setFeedback('ccpd', t('common.error', { msg: err.message }), 'error');
  } finally {
    btn.disabled = false; btn.textContent = t('meas.ccpd.save');
  }
}

// ── Shared ────────────────────────────────────────────────────

function setFeedback(prefix, msg, type) {
  const el = document.getElementById(prefix + '-feedback');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'feedback' + (type ? ' feedback-' + type : '');
}
