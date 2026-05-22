// ============================================================
// prep.js — Prep screen (what to prepare + procedure steps)
// ============================================================

let prepConfig = null; // cached after first load

async function renderPrep(container) {
  container.innerHTML = `
    <div class="screen-header">
      <h1>Prep</h1>
    </div>
    <div id="prep-loading" class="loading-state">Loading…</div>
    <div id="prep-content" style="display:none"></div>
  `;

  if (prepConfig) {
    renderPrepContent(prepConfig);
    return;
  }

  try {
    prepConfig = await API.getConfig();
    renderPrepContent(prepConfig);
  } catch (err) {
    document.getElementById('prep-loading').innerHTML =
      `<div class="feedback feedback-error">Failed to load: ${err.message}</div>`;
  }
}

function renderPrepContent(cfg) {
  const loading = document.getElementById('prep-loading');
  const content = document.getElementById('prep-content');
  if (loading) loading.style.display = 'none';
  if (content) content.style.display = 'block';

  const itemsHtml = cfg.prepItems && cfg.prepItems.length
    ? cfg.prepItems.map(item => renderPrepRow(item, 'bullet')).join('')
    : '<li class="no-data">No items configured.</li>';

  const stepsHtml = cfg.prepSteps && cfg.prepSteps.length
    ? cfg.prepSteps.map((step, i) => renderPrepRow(step, 'step', i + 1)).join('')
    : '<li class="no-data">No steps configured.</li>';

  content.innerHTML = `
    <section class="dash-section">
      <h2 class="section-title">What to Prepare</h2>
      <ul class="prep-list">${itemsHtml}</ul>
    </section>

    <section class="dash-section">
      <h2 class="section-title">Procedure Steps</h2>
      <ol class="prep-steps-list">${stepsHtml}</ol>
    </section>

    <p class="section-hint" style="padding:0 0 16px">
      Edit items and steps in the <strong>Config</strong> tab of your Google Sheet.
    </p>
  `;
}

// Accepts either a plain string (legacy) or {text, description} object
function renderPrepRow(item, type, stepNum) {
  const text = typeof item === 'string' ? item : (item.text || '');
  const desc = typeof item === 'string' ? '' : (item.description || '');
  const hasTip = desc.trim().length > 0;

  const leadHtml = type === 'step'
    ? `<span class="prep-step-number">${stepNum}</span>`
    : `<span class="prep-bullet" aria-hidden="true">·</span>`;

  const listItemClass = ['prep-list-item', type === 'step' ? 'prep-step-item' : '', hasTip ? 'prep-has-tip' : '']
    .filter(Boolean).join(' ');

  const onclick = hasTip ? ' onclick="togglePrepTip(this)"' : '';

  return `
    <li class="${listItemClass}"${onclick}>
      ${leadHtml}
      <div class="prep-item-body">
        <div class="prep-item-row">
          <span class="prep-item-text" dir="auto">${escHtml(text)}</span>
          ${hasTip ? '<span class="prep-tip-icon" aria-hidden="true">ⓘ</span>' : ''}
        </div>
        ${hasTip ? `<div class="prep-tip-panel" dir="auto">${escHtml(desc)}</div>` : ''}
      </div>
    </li>
  `;
}

function togglePrepTip(li) {
  const wasOpen = li.classList.contains('prep-tip-open');
  // Close any other open tips first
  document.querySelectorAll('.prep-tip-open').forEach(el => el.classList.remove('prep-tip-open'));
  if (!wasOpen) li.classList.add('prep-tip-open');
}

// escHtml is defined in app.js
