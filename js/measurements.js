// ============================================================
// measurements.js — Log Measurements screen (toggle between 3 cards)
// ============================================================

function nowDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const MEAS_TABS = [
  { key: 'bag',    label: 'Drainage' },
  { key: 'weight', label: 'Weight'   },
  { key: 'bp',     label: 'BP'       }
];

const PROC_TYPES = [
  { key: 'both',  label: 'Drain + Fill' },
  { key: 'drain', label: 'Drain only'   },
  { key: 'fill',  label: 'Fill only'    }
];

function renderMeasurements(container) {
  container.innerHTML = `
    <div class="screen-header">
      <h1>Log Measurements</h1>
    </div>
    <div class="meas-toggle" id="meas-toggle"></div>
    <div id="m-bag-card"></div>
    <div id="m-weight-card" style="display:none"></div>
    <div id="m-bp-card" style="display:none"></div>
  `;

  buildMeasToggle('bag');
  buildBagCard();
  buildWeightCard();
  buildBPCard();
}

function buildMeasToggle(activeKey) {
  const el = document.getElementById('meas-toggle');
  if (!el) return;
  el.innerHTML = MEAS_TABS.map(t => `
    <button class="meas-tab-btn ${t.key === activeKey ? 'meas-tab-active' : ''}"
            id="meas-tab-${t.key}"
            onclick="switchMeasCard('${t.key}')">
      ${t.label}
    </button>
  `).join('');
}

function switchMeasCard(key) {
  MEAS_TABS.forEach(t => {
    const card = document.getElementById(`m-${t.key}-card`);
    const btn  = document.getElementById(`meas-tab-${t.key}`);
    if (card) card.style.display = t.key === key ? '' : 'none';
    if (btn)  btn.classList.toggle('meas-tab-active', t.key === key);
  });
}

// ── Bag drainage card ─────────────────────────────────────────

const BAG_TYPES = ['1.36%', '2.27%', '3.86%'];

function buildBagCard() {
  const card = document.getElementById('m-bag-card');
  if (!card) return;

  window._procType  = 'both';
  window._bagType   = BAG_TYPES[0];
  window._usageBags = 1;
  window._usageCaps = 1;

  const procTypeBtns = PROC_TYPES.map(p => `
    <button class="btn proc-type-btn ${p.key === 'both' ? 'proc-type-active' : ''}"
            id="proc-btn-${p.key}"
            data-proc="${p.key}"
            onclick="switchProcType('${p.key}')">
      ${p.label}
    </button>
  `).join('');

  const bagTypeBtns = BAG_TYPES.map(t => `
    <button class="btn bag-type-btn ${t === BAG_TYPES[0] ? 'bag-type-active' : ''}"
            onclick="selectBagType(this, '${t}')"
            aria-pressed="${t === BAG_TYPES[0] ? 'true' : 'false'}">
      ${bagDotHtml(t)}${t}
    </button>
  `).join('');

  card.innerHTML = `
    <div class="form-card meas-card" id="bag-card">
      <div class="meas-datetime-row">
        <div class="form-row">
          <label for="bag-date">Date</label>
          <input type="date" id="bag-date" class="meas-date-input" value="${nowDateStr()}">
        </div>
        <div class="form-row">
          <label for="bag-time">Time</label>
          <input type="time" id="bag-time" class="meas-time-input" value="${nowTimeStr()}">
        </div>
      </div>

      <div class="proc-type-selector" id="proc-type-toggle" role="group" aria-label="Procedure type">
        ${procTypeBtns}
      </div>

      <div id="bag-drain-section">
        <p class="meas-group-label">Drainage weight (bag out)</p>
        <div class="drum-wrap">
          <div class="drum-group">
            <div class="dp-container" id="bag-int-dp"></div>
            <span class="drum-sep">.</span>
            <div class="dp-container" id="bag-dec-dp"></div>
            <span class="drum-unit">kg</span>
          </div>
        </div>
      </div>

      <div id="bag-fill-section">
        <p class="meas-group-label">New bag going in</p>
        <div class="bag-type-selector" id="bag-type-selector" role="group" aria-label="Bag concentration">
          ${bagTypeBtns}
        </div>

        <p class="meas-group-label" style="margin-top:12px">Used this exchange</p>
        <div class="usage-row">
          <div class="usage-counter">
            <button class="btn usage-qty-btn" id="usage-bags-dec" onclick="adjustUsage('bags', -1)">−</button>
            <span class="usage-qty-val" id="usage-bags-val">1</span>
            <button class="btn usage-qty-btn" id="usage-bags-inc" onclick="adjustUsage('bags', 1)">+</button>
            <span class="usage-counter-label">bags</span>
          </div>
          <div class="usage-counter">
            <button class="btn usage-qty-btn" id="usage-caps-dec" onclick="adjustUsage('caps', -1)">−</button>
            <span class="usage-qty-val" id="usage-caps-val">1</span>
            <button class="btn usage-qty-btn" id="usage-caps-inc" onclick="adjustUsage('caps', 1)">+</button>
            <span class="usage-counter-label">caps</span>
          </div>
        </div>
      </div>

      <div class="form-row" style="margin-top:12px">
        <label for="bag-notes">Notes</label>
        <textarea id="bag-notes" rows="2" placeholder="Optional…"></textarea>
      </div>

      <div id="bag-feedback" class="feedback" aria-live="polite"></div>

      <button class="btn btn-primary btn-large" id="bag-submit" onclick="submitBag()">
        Save Drainage
      </button>
    </div>
  `;

  window._bagInt = new DrumPicker(document.getElementById('bag-int-dp'), {
    min: 0, max: 20, value: 2, label: 'bag weight kilograms'
  });
  window._bagDec = new DrumPicker(document.getElementById('bag-dec-dp'), {
    min: 0, max: 9, value: 0, label: 'bag weight tenths'
  });
}

function switchProcType(key) {
  window._procType = key;
  document.querySelectorAll('.proc-type-btn').forEach(b => {
    b.classList.toggle('proc-type-active', b.dataset.proc === key);
  });
  const drainSection = document.getElementById('bag-drain-section');
  const fillSection  = document.getElementById('bag-fill-section');
  if (drainSection) drainSection.style.display = key !== 'fill'  ? '' : 'none';
  if (fillSection)  fillSection.style.display  = key !== 'drain' ? '' : 'none';
  const submitBtn = document.getElementById('bag-submit');
  if (submitBtn) submitBtn.textContent = key === 'drain' ? 'Save Drain' : key === 'fill' ? 'Save Fill' : 'Save Drainage';
}

function selectBagType(btn, type) {
  window._bagType = type;
  document.querySelectorAll('.bag-type-btn').forEach(b => {
    b.classList.toggle('bag-type-active', b === btn);
    b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
  });
}

function adjustUsage(type, delta) {
  const key = type === 'bags' ? '_usageBags' : '_usageCaps';
  window[key] = Math.max(0, (window[key] || 1) + delta);
  const el = document.getElementById(`usage-${type}-val`);
  if (el) el.textContent = window[key];
}

async function submitBag() {
  const procType = window._procType || 'both';
  const hasDrain = procType !== 'fill';
  const hasFill  = procType !== 'drain';

  const date  = document.getElementById('bag-date').value.trim();
  const time  = document.getElementById('bag-time').value.trim();
  const notes = document.getElementById('bag-notes').value.trim();
  if (!date || !time) { setFeedback('bag', 'Date and time are required.', 'error'); return; }

  const btn = document.getElementById('bag-submit');
  btn.disabled = true; btn.textContent = 'Saving…';
  setFeedback('bag', '', '');

  try {
    const bagWeight = hasDrain ? window._bagInt.value + window._bagDec.value / 10 : '';
    const bagType   = hasFill  ? (window._bagType || '') : '';
    await API.logMeasurement({
      date, time, bagWeight, bagType, notes,
      measurementType: procType === 'both' ? 'drain_fill' : procType
    });

    if (hasFill) {
      const usageBags = window._usageBags || 1;
      const usageCaps = window._usageCaps || 1;
      // Use client-side inventory cache (loaded with dashboard) so the count is correct
      // regardless of which backend version is deployed.
      const inv = (typeof dashboardData !== 'undefined' && dashboardData && dashboardData.inventory)
        ? dashboardData.inventory : null;
      if (inv !== null) {
        const bagKey = `Solution Bags ${bagType}`;
        const deductItems = [];
        if (usageBags > 0) deductItems.push({ name: bagKey,  count: Math.max(0, (inv[bagKey]    ?? 0) - usageBags) });
        if (usageCaps > 0) deductItems.push({ name: 'Caps',  count: Math.max(0, (inv['Caps']    ?? 0) - usageCaps) });
        if (deductItems.length) {
          await API.updateInventory({ date, items: deductItems });
          deductItems.forEach(item => { inv[item.name] = item.count; });
        }
      }
    }

    const msg = procType === 'drain' ? 'Drain saved.' : procType === 'fill' ? 'Fill saved.' : 'Drainage saved.';
    setFeedback('bag', msg, 'success');

    document.getElementById('bag-date').value = nowDateStr();
    document.getElementById('bag-time').value = nowTimeStr();
    document.getElementById('bag-notes').value = '';
    window._bagType   = BAG_TYPES[0];
    window._usageBags = 1;
    window._usageCaps = 1;
    document.querySelectorAll('.bag-type-btn').forEach((b, i) => {
      b.classList.toggle('bag-type-active', i === 0);
      b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    });
    const bagsEl = document.getElementById('usage-bags-val');
    const capsEl = document.getElementById('usage-caps-val');
    if (bagsEl) bagsEl.textContent = '1';
    if (capsEl) capsEl.textContent = '1';
  } catch (err) {
    setFeedback('bag', 'Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    const pt = window._procType || 'both';
    btn.textContent = pt === 'drain' ? 'Save Drain' : pt === 'fill' ? 'Save Fill' : 'Save Drainage';
  }
}

// ── Weight card ───────────────────────────────────────────────

function buildWeightCard() {
  const card = document.getElementById('m-weight-card');
  if (!card) return;

  card.innerHTML = `
    <div class="form-card meas-card" id="wt-card">
      <div class="meas-datetime-row">
        <div class="form-row">
          <label for="wt-date">Date</label>
          <input type="date" id="wt-date" class="meas-date-input" value="${nowDateStr()}">
        </div>
        <div class="form-row">
          <label for="wt-time">Time</label>
          <input type="time" id="wt-time" class="meas-time-input" value="${nowTimeStr()}">
        </div>
      </div>

      <div class="drum-wrap">
        <div class="drum-group">
          <div class="dp-container" id="wt-int-dp"></div>
          <span class="drum-sep">.</span>
          <div class="dp-container" id="wt-dec-dp"></div>
          <span class="drum-unit">kg</span>
        </div>
      </div>

      <div id="wt-feedback" class="feedback" aria-live="polite"></div>

      <button class="btn btn-primary btn-large" id="wt-submit" onclick="submitWeight()">
        Save Weight
      </button>
    </div>
  `;

  window._wtInt = new DrumPicker(document.getElementById('wt-int-dp'), {
    min: 0, max: 250, value: 65, label: 'weight kilograms'
  });
  window._wtDec = new DrumPicker(document.getElementById('wt-dec-dp'), {
    min: 0, max: 9, value: 0, label: 'weight tenths'
  });
}

async function submitWeight() {
  const date = document.getElementById('wt-date').value.trim();
  const time = document.getElementById('wt-time').value.trim();
  if (!date || !time) { setFeedback('wt', 'Date and time are required.', 'error'); return; }

  const weight = window._wtInt.value + window._wtDec.value / 10;
  const btn = document.getElementById('wt-submit');
  btn.disabled = true; btn.textContent = 'Saving…';
  setFeedback('wt', '', '');

  try {
    await API.logMeasurement({ date, time, weight, measurementType: 'weight' });
    setFeedback('wt', 'Weight saved.', 'success');
    document.getElementById('wt-date').value = nowDateStr();
    document.getElementById('wt-time').value = nowTimeStr();
  } catch (err) {
    setFeedback('wt', 'Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Weight';
  }
}

// ── Blood pressure card ───────────────────────────────────────

function buildBPCard() {
  const card = document.getElementById('m-bp-card');
  if (!card) return;

  card.innerHTML = `
    <div class="form-card meas-card" id="bp-card">
      <div class="meas-datetime-row">
        <div class="form-row">
          <label for="bp-date">Date</label>
          <input type="date" id="bp-date" class="meas-date-input" value="${nowDateStr()}">
        </div>
        <div class="form-row">
          <label for="bp-time">Time</label>
          <input type="time" id="bp-time" class="meas-time-input" value="${nowTimeStr()}">
        </div>
      </div>

      <div class="drum-wrap">
        <div class="drum-group">
          <div class="drum-col">
            <div class="dp-container" id="bp-sys-dp"></div>
            <span class="drum-col-label">SYS</span>
          </div>
          <span class="drum-sep drum-sep-bp">/</span>
          <div class="drum-col">
            <div class="dp-container" id="bp-dia-dp"></div>
            <span class="drum-col-label">DIA</span>
          </div>
          <span class="drum-unit">mmHg</span>
        </div>
      </div>

      <div id="bp-feedback" class="feedback" aria-live="polite"></div>

      <button class="btn btn-primary btn-large" id="bp-submit" onclick="submitBP()">
        Save Blood Pressure
      </button>
    </div>
  `;

  window._bpSys = new DrumPicker(document.getElementById('bp-sys-dp'), {
    min: 40, max: 280, value: 120, label: 'systolic'
  });
  window._bpDia = new DrumPicker(document.getElementById('bp-dia-dp'), {
    min: 30, max: 180, value: 80, label: 'diastolic'
  });
}

async function submitBP() {
  const date = document.getElementById('bp-date').value.trim();
  const time = document.getElementById('bp-time').value.trim();
  if (!date || !time) { setFeedback('bp', 'Date and time are required.', 'error'); return; }

  const btn = document.getElementById('bp-submit');
  btn.disabled = true; btn.textContent = 'Saving…';
  setFeedback('bp', '', '');

  try {
    await API.logMeasurement({ date, time, bpSystolic: window._bpSys.value, bpDiastolic: window._bpDia.value, measurementType: 'bp' });
    setFeedback('bp', 'Blood pressure saved.', 'success');
    document.getElementById('bp-date').value = nowDateStr();
    document.getElementById('bp-time').value = nowTimeStr();
  } catch (err) {
    setFeedback('bp', 'Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Blood Pressure';
  }
}

// ── Shared helpers ────────────────────────────────────────────

function setFeedback(prefix, msg, type) {
  const el = document.getElementById(prefix + '-feedback');
  if (!el) return;
  el.textContent = msg;
  el.className = 'feedback' + (type ? ' feedback-' + type : '');
}
