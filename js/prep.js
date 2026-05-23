// ============================================================
// prep.js — Prep reference card screen
// ============================================================

let prepConfig   = null;
let _prepVersion = null; // configVersion at last load, for in-memory invalidation
const _PREP_CACHE_KEY = 'pd_config_v1';

async function renderPrep(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">Prep</h1>
          <div class="page-sub">Reference card for the exchange procedure</div>
        </div>
      </div>
      <div id="prep-loading" class="loading-state">Loading…</div>
      <div id="prep-content" style="display:none"></div>
    </div>
  `;

  const dashVersion = getDashboardData()?.configVersion || null;

  // In-memory hit — valid if version still matches (or no version tracking)
  if (prepConfig) {
    if (!dashVersion || _prepVersion === dashVersion) {
      renderPrepContent(prepConfig);
      return;
    }
    // Version changed since last load — fall through to re-fetch
  }

  // localStorage hit — use only if version matches
  const cached = localStorage.getItem(_PREP_CACHE_KEY);
  if (cached) {
    try {
      const entry = JSON.parse(cached);
      const cacheValid = entry.data && (!dashVersion || entry.version === dashVersion);
      if (cacheValid) {
        prepConfig      = entry.data;
        _prepVersion    = entry.version;
        renderPrepContent(prepConfig);
        if (!dashVersion) _refreshPrepInBackground(); // no version tracking — keep refreshing
        return;
      }
    } catch {}
  }

  // No cache or stale — blocking fetch
  try {
    const fresh = await API.getConfig();
    prepConfig   = fresh;
    _prepVersion = getDashboardData()?.configVersion || null;
    try { localStorage.setItem(_PREP_CACHE_KEY, JSON.stringify({ version: _prepVersion, data: fresh })); } catch {}
    renderPrepContent(prepConfig);
  } catch (err) {
    document.getElementById('prep-loading').innerHTML =
      `<div class="feedback feedback-error">Failed to load: ${escHtml(err.message)}</div>`;
  }
}

function _refreshPrepInBackground() {
  API.getConfig().then(fresh => {
    prepConfig   = fresh;
    _prepVersion = null;
    try { localStorage.setItem(_PREP_CACHE_KEY, JSON.stringify({ version: null, data: fresh })); } catch {}
  }).catch(() => {});
}

function renderPrepContent(cfg) {
  const loading = document.getElementById('prep-loading');
  const content = document.getElementById('prep-content');
  if (loading) loading.style.display = 'none';
  if (content) content.style.display = 'block';

  const itemsHtml = cfg.prepItems?.length
    ? cfg.prepItems.map(item => {
        const text = typeof item === 'string' ? item : (item.text || '');
        return `<li class="prep-item"><span class="prep-dot"></span><span>${escHtml(text)}</span></li>`;
      }).join('')
    : '<li class="prep-item" style="color:var(--text-3)">No items configured.</li>';

  const stepsHtml = cfg.prepSteps?.length
    ? cfg.prepSteps.map((step, i) => {
        const text = typeof step === 'string' ? step : (step.text || '');
        const desc = typeof step === 'string' ? '' : (step.description || '');
        return `
          <li class="step">
            <span class="step-num">${i + 1}</span>
            <span class="step-text">
              ${escHtml(text)}
              ${desc ? `<span style="display:block;margin-top:4px;font-size:12px;color:var(--text-3)">${escHtml(desc)}</span>` : ''}
            </span>
          </li>
        `;
      }).join('')
    : '<li class="step"><span class="step-num">—</span><span class="step-text" style="color:var(--text-3)">No steps configured.</span></li>';

  content.innerHTML = `
    <section class="card">
      <div class="card-head">
        <h2 class="card-title">What to prepare</h2>
      </div>
      <ul class="prep-items">${itemsHtml}</ul>
    </section>

    <section class="card">
      <div class="card-head">
        <h2 class="card-title">Procedure</h2>
      </div>
      <ol class="steps">${stepsHtml}</ol>
    </section>
  `;
}
