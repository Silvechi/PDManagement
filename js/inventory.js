// ============================================================
// inventory.js — Inventory screen
// ============================================================

let inventoryCounts = {};
let inventoryConfig = [];

function renderInventory(container, dashData) {
  if (dashData?.inventoryConfig) inventoryConfig = dashData.inventoryConfig;
  if (dashData?.inventory) {
    inventoryConfig.forEach(item => {
      inventoryCounts[item.name] = dashData.inventory[item.name] ?? 0;
    });
  } else {
    inventoryConfig.forEach(item => {
      if (inventoryCounts[item.name] === undefined) inventoryCounts[item.name] = 0;
    });
  }

  // Split into bag items and other supplies
  const bagItems    = inventoryConfig.filter(item => isBagItem(item) && isActiveBagItem(item));
  const supplyItems = inventoryConfig.filter(item => !isBagItem(item) && isActiveBagItem(item));

  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">Inventory</h1>
          <div class="page-sub">Adjust counts as you use or restock</div>
        </div>
      </div>

      ${bagItems.length ? `
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">Solution bags</h2>
          <p class="card-sub">Tap +/− to adjust</p>
        </div>
        <div class="inv-bag-list" id="inv-bag-list"></div>
      </section>
      ` : ''}

      ${supplyItems.length ? `
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">Other supplies</h2>
        </div>
        <ul class="inv-list" id="inv-supply-list"></ul>
      </section>
      ` : ''}

      ${!inventoryConfig.length ? `<p class="no-data">No inventory items configured.</p>` : ''}

      <div id="inv-feedback" class="feedback" aria-live="polite"></div>

      <button class="primary-btn lg w-full" id="inv-submit" onclick="handleInventorySubmit()">
        Save inventory
      </button>
    </div>
  `;

  renderBagRows(bagItems);
  renderSupplyRows(supplyItems);
}

function renderBagRows(bagItems) {
  const list = document.getElementById('inv-bag-list');
  if (!list || !bagItems.length) return;

  list.innerHTML = bagItems.map((item, idx) => {
    const c      = bagColorsFor(item);
    const label  = bagDisplayName(item);
    const count  = inventoryCounts[item.name] ?? 0;
    const low    = count < (item.min || 5);
    const vars   = `--bag:${c.color};--bag-soft:${c.soft};--bag-deep:${c.deep}`;
    const bagIdx = inventoryConfig.indexOf(item);
    return `
      <div class="inv-bag${low ? ' low' : ''}" style="${vars}" id="inv-bag-row-${bagIdx}">
        <div class="inv-bag-left">
          <span class="bag-dot lg"></span>
          <div>
            <div class="inv-bag-pct">${escHtml(label)}</div>
            <div class="inv-bag-hint">Warn below ${item.min || 5}</div>
          </div>
        </div>
        <div class="stepper">
          <button onclick="adjustCount(${bagIdx}, -1)">${MINUS_ICON}</button>
          <input type="number" class="stepper-val" id="inv-val-${bagIdx}" value="${count}" min="0" oninput="syncInventoryCount(${bagIdx},this.value)">
          <button onclick="adjustCount(${bagIdx}, 1)">${PLUS_ICON}</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderSupplyRows(supplyItems) {
  const list = document.getElementById('inv-supply-list');
  if (!list || !supplyItems.length) return;

  list.innerHTML = supplyItems.map(item => {
    const idx   = inventoryConfig.indexOf(item);
    const count = inventoryCounts[item.name] ?? 0;
    const low   = count < (item.min || 0);
    return `
      <li class="inv-row${low ? ' low' : ''}" id="inv-supply-row-${idx}">
        <div class="inv-row-info">
          <div class="inv-row-label">
            ${escHtml(item.name)}
            ${low ? `<span class="low-tag">low</span>` : ''}
          </div>
          ${item.description ? `<div class="inv-row-hint">${escHtml(item.description)} · warn below ${item.min}</div>` : (item.min ? `<div class="inv-row-hint">Warn below ${item.min}</div>` : '')}
        </div>
        <div class="stepper">
          <button onclick="adjustCount(${idx}, -1)">${MINUS_ICON}</button>
          <input type="number" class="stepper-val" id="inv-val-${idx}" value="${count}" min="0" oninput="syncInventoryCount(${idx},this.value)">
          <button onclick="adjustCount(${idx}, 1)">${PLUS_ICON}</button>
        </div>
      </li>
    `;
  }).join('');
}

function adjustCount(idx, delta) {
  const item  = inventoryConfig[idx];
  if (!item) return;
  const valEl = document.getElementById('inv-val-' + idx);
  const cur   = valEl ? (parseInt(valEl.value) || 0) : (inventoryCounts[item.name] ?? 0);
  const next  = Math.max(0, cur + delta);
  inventoryCounts[item.name] = next;
  if (valEl) valEl.value = next;
  updateRowStyling(idx);
}

function syncInventoryCount(idx, val) {
  const item = inventoryConfig[idx];
  if (!item) return;
  inventoryCounts[item.name] = Math.max(0, parseInt(val) || 0);
  updateRowStyling(idx);
}

function updateRowStyling(idx) {
  const item  = inventoryConfig[idx];
  if (!item) return;
  const count = inventoryCounts[item.name] ?? 0;
  const low   = count < (item.min || 0);

  // Check if bag or supply row
  const bagRow     = document.getElementById('inv-bag-row-' + idx);
  const supplyRow  = document.getElementById('inv-supply-row-' + idx);

  if (bagRow) {
    bagRow.classList.toggle('low', low);
  }
  if (supplyRow) {
    supplyRow.classList.toggle('low', low);
    const label = supplyRow.querySelector('.inv-row-label');
    if (label) {
      const existing = label.querySelector('.low-tag');
      if (low && !existing) {
        label.insertAdjacentHTML('beforeend', `<span class="low-tag">low</span>`);
      } else if (!low && existing) {
        existing.remove();
      }
    }
  }
}

async function handleInventorySubmit() {
  const now      = new Date();
  const datetime = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const btn      = document.getElementById('inv-submit');
  btn.disabled = true; btn.textContent = 'Saving…';
  setInventoryFeedback('', '');

  const items = inventoryConfig.map(item => ({
    name:  item.name,
    count: inventoryCounts[item.name] ?? 0,
  }));

  try {
    await API.updateInventory({ datetime, items, patientId: getActivePatientId() });
    setInventoryFeedback('Inventory saved.', 'success');
    const dash = typeof getDashboardData === 'function' ? getDashboardData() : null;
    if (dash?.inventory) {
      inventoryConfig.forEach(item => {
        dash.inventory[item.name] = inventoryCounts[item.name] ?? 0;
      });
    }
  } catch (err) {
    setInventoryFeedback('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save inventory';
  }
}

function setInventoryFeedback(msg, type) {
  const el = document.getElementById('inv-feedback');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'feedback' + (type ? ' feedback-' + type : '');
}
