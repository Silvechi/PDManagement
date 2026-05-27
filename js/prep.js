// ============================================================
// prep.js — Prep reference card screen
// ============================================================

// ── Screen Wake Lock ──────────────────────────────────────────
// Keeps the display on while following the exchange procedure.
// Uses the Web Screen Wake Lock API (supported on Chrome/Android, Safari 16.4+).
// Falls back gracefully (toggle hidden) on unsupported browsers.
// Preference persists in localStorage so it survives page reloads mid-procedure.

const _WAKE_LOCK_KEY       = 'pd_prep_wake_lock';
const _wakeLockSupported   = ('wakeLock' in navigator);
let   _wakeLockSentinel    = null;                        // current WakeLockSentinel | null
let   _wakeLockEnabled     = (() => {
  try { return localStorage.getItem(_WAKE_LOCK_KEY) === '1'; } catch (_) { return false; }
})();

// Re-acquire after the browser auto-releases the lock (happens when page is hidden,
// e.g. screen lock, app switch). Called every time the document becomes visible.
document.addEventListener('visibilitychange', () => {
  if (_wakeLockEnabled && document.visibilityState === 'visible') _prepRequestWakeLock();
});

async function _prepRequestWakeLock() {
  if (!_wakeLockSupported) return;
  if (_wakeLockSentinel && !_wakeLockSentinel.released) return; // already held
  try {
    _wakeLockSentinel = await navigator.wakeLock.request('screen');
    // Sentinel fires 'release' when the system takes it back (page hidden, low battery, etc.)
    _wakeLockSentinel.addEventListener('release', () => { _wakeLockSentinel = null; });
  } catch (_) { /* denied — page not focused or permission refused; fail silently */ }
}

async function _prepReleaseWakeLock() {
  if (_wakeLockSentinel && !_wakeLockSentinel.released) {
    try { await _wakeLockSentinel.release(); } catch (_) {}
    _wakeLockSentinel = null;
  }
}

// Called from the toggle's onchange handler (global scope, regular <script>)
async function _prepToggleWakeLock(enabled) {
  _wakeLockEnabled = enabled;
  try { localStorage.setItem(_WAKE_LOCK_KEY, enabled ? '1' : '0'); } catch (_) {}
  // Sync the visual state of the label (handles the case where _updateWakeLockUI
  // is called before a re-render, e.g. fast toggles)
  const lbl = document.getElementById('prep-wake-lock-label');
  if (lbl) lbl.classList.toggle('wake-lock-on', enabled);
  if (enabled) {
    await _prepRequestWakeLock();
  } else {
    await _prepReleaseWakeLock();
  }
}
// ─────────────────────────────────────────────────────────────

let prepConfig   = null;
let _prepVersion = null; // dataVersion at last load, for in-memory invalidation

async function renderPrep(container) {
  // Wake lock toggle — hidden on browsers that don't support the API
  const wakeLockToggle = _wakeLockSupported ? `
    <label id="prep-wake-lock-label"
           class="wake-lock-toggle${_wakeLockEnabled ? ' wake-lock-on' : ''}"
           title="${t('prep.keep_screen_on')}">
      <input id="prep-wake-lock-cb" type="checkbox"
             ${_wakeLockEnabled ? 'checked' : ''}
             onchange="_prepToggleWakeLock(this.checked)">
      <span class="wake-lock-track"><span class="wake-lock-thumb"></span></span>
      <span class="wake-lock-text">${t('prep.keep_screen_on')}</span>
    </label>` : '';

  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">${t('prep.title')}</h1>
          <div class="page-sub">${t('prep.sub')}</div>
        </div>
        ${wakeLockToggle}
      </div>
      <div id="prep-loading" class="loading-state">${t('common.loading')}</div>
      <div id="prep-content" style="display:none"></div>
    </div>
  `;

  // Acquire immediately when landing on the prep screen (if preference is on)
  if (_wakeLockEnabled) _prepRequestWakeLock();

  const dashVersion = getDashboardData()?.dataVersion || null;

  // In-memory hit — valid if version still matches (or no version tracking)
  if (prepConfig) {
    if (!dashVersion || _prepVersion === dashVersion) {
      renderPrepContent(prepConfig);
      return;
    }
    // Version changed since last load — fall through to re-fetch
  }

  // localStorage hit — use only if version matches
  const cached = AppCache.getConfig();
  if (cached?.data) {
    const cacheValid = !dashVersion || cached.version === dashVersion;
    if (cacheValid) {
      prepConfig   = cached.data;
      _prepVersion = cached.version;
      renderPrepContent(prepConfig);
      if (!dashVersion) _refreshPrepInBackground(); // no version tracking — keep refreshing
      return;
    }
  }

  // No cache or stale — blocking fetch
  try {
    const fresh = await API.getConfig();
    prepConfig   = fresh;
    _prepVersion = getDashboardData()?.dataVersion || null;
    AppCache.setConfig(fresh, _prepVersion);
    renderPrepContent(prepConfig);
  } catch (err) {
    document.getElementById('prep-loading').innerHTML =
      `<div class="feedback feedback-error">${t('common.failed', { msg: escHtml(err.message) })}</div>`;
  }
}

function _refreshPrepInBackground() {
  API.getConfig().then(fresh => {
    prepConfig   = fresh;
    _prepVersion = null;
    AppCache.setConfig(fresh, null);
  }).catch(() => {});
}

function renderPrepContent(cfg) {
  const loading = document.getElementById('prep-loading');
  const content = document.getElementById('prep-content');
  if (loading) loading.style.display = 'none';
  if (content) content.style.display = 'block';

  const itemsHtml = cfg.prepItems?.length
    ? cfg.prepItems.map(item => {
        const raw  = typeof item === 'string' ? item : (item.text || '');
        const text = (currentLang === 'he' && typeof item === 'object' && item.textHe) ? item.textHe : raw;
        return `<li class="prep-item"><span class="prep-dot"></span><span>${escHtml(text)}</span></li>`;
      }).join('')
    : `<li class="prep-item" style="color:var(--text-3)">${t('prep.no_items')}</li>`;

  const stepsHtml = cfg.prepSteps?.length
    ? cfg.prepSteps.map((step, i) => {
        const rawText = typeof step === 'string' ? step : (step.text || '');
        const rawDesc = typeof step === 'string' ? '' : (step.description || '');
        const text = (currentLang === 'he' && typeof step === 'object' && step.textHe) ? step.textHe : rawText;
        const desc = (currentLang === 'he' && typeof step === 'object' && step.descriptionHe) ? step.descriptionHe : rawDesc;
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
    : `<li class="step"><span class="step-num">—</span><span class="step-text" style="color:var(--text-3)">${t('prep.no_steps')}</span></li>`;

  content.innerHTML = `
    <section class="card">
      <div class="card-head">
        <h2 class="card-title">${t('prep.what_to_prepare')}</h2>
      </div>
      <ul class="prep-items">${itemsHtml}</ul>
    </section>

    <section class="card">
      <div class="card-head">
        <h2 class="card-title">${t('prep.procedure')}</h2>
      </div>
      <ol class="steps">${stepsHtml}</ol>
    </section>
  `;
}
