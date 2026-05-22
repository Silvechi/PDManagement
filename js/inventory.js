// ============================================================
// inventory.js — Inventory Manager screen
// ============================================================

// In-memory counts: { 'פקקים': 12, 'Solution Bags': 20, ... }
let inventoryCounts = {};
// Config from dashboardData: [{ name, min }, ...]
let inventoryConfig = [];

function renderInventory(container, dashData) {
  if (dashData && dashData.inventoryConfig) {
    inventoryConfig = dashData.inventoryConfig;
  }
  if (dashData && dashData.inventory) {
    inventoryConfig.forEach(item => {
      inventoryCounts[item.name] = dashData.inventory[item.name] ?? 0;
    });
  } else {
    inventoryConfig.forEach(item => {
      if (inventoryCounts[item.name] === undefined) inventoryCounts[item.name] = 0;
    });
  }

  container.innerHTML = `
    <div class="screen-header">
      <h1>Inventory Manager</h1>
    </div>

    <div class="form-card">
      <p class="section-hint">Adjust counts then tap <strong>Save Inventory</strong>.</p>

      <div id="inventory-items"></div>

      <div id="inv-feedback" class="feedback" aria-live="polite"></div>

      <button class="btn btn-primary btn-large" id="inv-submit" onclick="handleInventorySubmit()">
        Save Inventory
      </button>
    </div>
  `;

  renderInventoryItems();
}

function renderInventoryItems() {
  const container = document.getElementById('inventory-items');
  if (!container) return;

  if (!inventoryConfig.length) {
    container.innerHTML = '<p class="no-data">No inventory items configured.</p>';
    return;
  }

  // Use index as the HTML id so non-ASCII names (Hebrew etc.) don't break selectors.
  container.innerHTML = inventoryConfig.map((item, idx) => {
    const id     = itemId(idx);
    const count  = inventoryCounts[item.name] ?? 0;
    const isLow  = count < (item.min || 0);
    const desc   = item.description || '';
    const hasTip = desc.trim().length > 0;
    const matchedType = Object.keys(BAG_TYPE_COLORS).find(t => item.name.includes(t)) || null;
    const dotHtml = matchedType ? bagDotHtml(matchedType) : '';
    return `
      <div class="inv-row ${isLow ? 'inv-low' : ''} ${hasTip ? 'inv-has-tip' : ''}">
        <div class="inv-label" ${hasTip ? `onclick="toggleInvTip(${idx})"` : ''}>
          <div class="inv-name-row">
            <span class="inv-name" dir="auto">${dotHtml}${item.name}</span>
            ${hasTip ? '<span class="inv-tip-icon" aria-hidden="true">ⓘ</span>' : ''}
          </div>
          <span class="inv-threshold">Warn below ${item.min}</span>
        </div>
        <div class="inv-controls">
          <button class="btn btn-adjust" aria-label="Decrease"
                  onclick="adjustCount(${idx}, -1)">−</button>
          <input type="number" class="inv-count-input"
                 id="${id}"
                 value="${count}"
                 inputmode="numeric"
                 min="0"
                 aria-label="${escAttr(item.name)} count"
                 oninput="directSetCount(${idx}, this.value)">
          <button class="btn btn-adjust" aria-label="Increase"
                  onclick="adjustCount(${idx}, 1)">+</button>
        </div>
        ${isLow ? `<div class="inv-warning">⚠ Low stock</div>` : ''}
        ${hasTip ? `<div class="inv-tip-panel" dir="auto">${escHtml(desc)}</div>` : ''}
      </div>
    `;
  }).join('');
}

// Index-based id — safe for any Unicode item name
function itemId(idx) {
  return 'inv-item-' + idx;
}

// Escape a string for use in an HTML attribute value
function escAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// escHtml is defined in app.js

function adjustCount(idx, delta) {
  const item = inventoryConfig[idx];
  if (!item) return;
  inventoryCounts[item.name] = Math.max(0, (inventoryCounts[item.name] ?? 0) + delta);
  const input = document.getElementById(itemId(idx));
  if (input) input.value = inventoryCounts[item.name];
  updateRowStyling(idx);
}

function directSetCount(idx, rawValue) {
  const item = inventoryConfig[idx];
  if (!item) return;
  const val = parseInt(rawValue);
  inventoryCounts[item.name] = isNaN(val) || val < 0 ? 0 : val;
  const input = document.getElementById(itemId(idx));
  if (input) input.value = inventoryCounts[item.name];
  updateRowStyling(idx);
}

function updateRowStyling(idx) {
  const item  = inventoryConfig[idx];
  const input = document.getElementById(itemId(idx));
  if (!item || !input) return;
  const row   = input.closest('.inv-row');
  if (!row) return;
  const count = inventoryCounts[item.name] ?? 0;
  const isLow = count < (item.min || 0);
  row.classList.toggle('inv-low', isLow);
  let warn = row.querySelector('.inv-warning');
  if (isLow && !warn) {
    warn = document.createElement('div');
    warn.className = 'inv-warning';
    warn.textContent = '⚠ Low stock';
    const tipPanel = row.querySelector('.inv-tip-panel');
    if (tipPanel) row.insertBefore(warn, tipPanel);
    else row.appendChild(warn);
  } else if (!isLow && warn) {
    warn.remove();
  }
}

function toggleInvTip(idx) {
  const input = document.getElementById(itemId(idx));
  if (!input) return;
  const row = input.closest('.inv-row');
  if (!row) return;
  const wasOpen = row.classList.contains('inv-tip-open');
  document.querySelectorAll('.inv-row.inv-tip-open').forEach(el => el.classList.remove('inv-tip-open'));
  if (!wasOpen) row.classList.add('inv-tip-open');
}

async function handleInventorySubmit() {
  const now  = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const btn  = document.getElementById('inv-submit');
  btn.disabled = true; btn.textContent = 'Saving…';
  setInventoryFeedback('', '');

  const items = inventoryConfig.map(item => ({
    name:  item.name,
    count: inventoryCounts[item.name] ?? 0
  }));

  try {
    await API.updateInventory({ date, items });
    setInventoryFeedback('Inventory saved successfully.', 'success');
    // Keep dashboardData in sync so the Log screen deducts from the latest counts.
    if (typeof dashboardData !== 'undefined' && dashboardData && dashboardData.inventory) {
      inventoryConfig.forEach(item => {
        dashboardData.inventory[item.name] = inventoryCounts[item.name] ?? 0;
      });
    }
    renderInventoryItems();
  } catch (err) {
    setInventoryFeedback('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Inventory';
  }
}

function setInventoryFeedback(msg, type) {
  const el = document.getElementById('inv-feedback');
  if (!el) return;
  el.textContent = msg;
  el.className = 'feedback' + (type ? ' feedback-' + type : '');
}
