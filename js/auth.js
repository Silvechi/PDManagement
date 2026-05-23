// ============================================================
// auth.js — Device token auth (localStorage + URL hash)
// ============================================================

const AUTH_STORAGE_KEY = 'pd_device_token_v1';

async function initAuth() {
  const hashToken   = location.hash.slice(1) || null;
  const storedToken = localStorage.getItem(AUTH_STORAGE_KEY);
  const token       = hashToken || storedToken;

  if (!token) {
    _authShowRegistration();
    return false;
  }

  // Keep localStorage and hash in sync
  if (hashToken && hashToken !== storedToken) {
    localStorage.setItem(AUTH_STORAGE_KEY, hashToken);
  }
  if (!hashToken && storedToken) {
    history.replaceState(null, '', location.pathname + '#' + storedToken);
  }

  try {
    const result = await API.validateToken(token);
    if (result.status === 'approved') {
      setDeviceToken(token);
      API.touchToken(token).catch(() => {});
      return true;
    }
    if (result.status === 'pending') {
      _authShowPending(token);
      return false;
    }
    // revoked or unknown — clear stored token
    localStorage.removeItem(AUTH_STORAGE_KEY);
    history.replaceState(null, '', location.pathname);
    _authShowDenied();
    return false;
  } catch (_err) {
    // Offline: allow access if we already had a stored token
    if (storedToken) {
      setDeviceToken(storedToken);
      return true;
    }
    _authShowError('Could not reach server. Check your connection and try again.');
    return false;
  }
}

// ── Shared container helper ───────────────────────────────────

function _authContainer() {
  document.getElementById('topbar').style.display     = 'none';
  document.getElementById('bottom-nav').style.display = 'none';
  return document.getElementById('screen-container');
}

// ── Registration screen ───────────────────────────────────────

function _authShowRegistration() {
  const c = _authContainer();
  c.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <h1 class="auth-title">PD Tracker</h1>
        <p class="auth-sub">Register this device to request access.</p>
        <label class="auth-label" for="auth-label-input">
          Device name <span class="auth-hint">(optional)</span>
        </label>
        <input id="auth-label-input" class="auth-input" type="text"
               placeholder="e.g. Mom's phone" maxlength="50" autocomplete="off">
        <button class="auth-btn" id="auth-submit-btn" onclick="_authRegister()">Request access</button>
        <p id="auth-msg" class="auth-msg"></p>
      </div>
    </div>
  `;
  document.getElementById('auth-label-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') _authRegister();
  });
}

async function _authRegister() {
  const btn   = document.getElementById('auth-submit-btn');
  const label = (document.getElementById('auth-label-input').value || '').trim();
  const msg   = document.getElementById('auth-msg');
  btn.disabled = true;
  msg.textContent = 'Sending request…';
  msg.style.color = 'var(--text-3)';

  try {
    const token = _genToken();
    await API.registerToken(token, label || 'Unnamed device');
    localStorage.setItem(AUTH_STORAGE_KEY, token);
    history.replaceState(null, '', location.pathname + '#' + token);
    _authShowPending(token);
  } catch (err) {
    msg.textContent = 'Error: ' + err.message;
    msg.style.color = 'var(--danger)';
    btn.disabled = false;
  }
}

// ── Pending screen ────────────────────────────────────────────

function _authShowPending(token) {
  const c = _authContainer();
  const bookmarkUrl = location.origin + location.pathname + '#' + token;
  c.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <h1 class="auth-title">Waiting for approval</h1>
        <p class="auth-sub">Your request is pending. Ask the account owner to approve it in the <strong>Tokens</strong> sheet in Google Sheets.</p>
        <div class="auth-bookmark-box">
          <p class="auth-bookmark-label">Save this URL as a bookmark — it's how you'll access the app:</p>
          <code class="auth-url">${escHtml(bookmarkUrl)}</code>
        </div>
        <button class="auth-btn" id="auth-submit-btn" onclick="_authCheckAgain()">Check again</button>
        <p id="auth-msg" class="auth-msg"></p>
      </div>
    </div>
  `;
}

async function _authCheckAgain() {
  const btn = document.getElementById('auth-submit-btn');
  const msg = document.getElementById('auth-msg');
  btn.disabled = true;
  msg.textContent = 'Checking…';
  msg.style.color = 'var(--text-3)';

  const token = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!token) { location.reload(); return; }

  try {
    const result = await API.validateToken(token);
    if (result.status === 'approved') {
      location.reload();
    } else if (result.status === 'revoked') {
      _authShowDenied();
    } else {
      msg.textContent = 'Still pending. Check back after the owner approves it in the Tokens sheet.';
      msg.style.color = 'var(--text-2)';
      btn.disabled = false;
    }
  } catch (_err) {
    msg.textContent = 'Could not reach server. Try again.';
    msg.style.color = 'var(--danger)';
    btn.disabled = false;
  }
}

// ── Denied / error screens ────────────────────────────────────

function _authShowDenied() {
  const c = _authContainer();
  c.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <h1 class="auth-title">Access denied</h1>
        <p class="auth-sub">This device's access has been revoked. Contact the account owner.</p>
        <button class="auth-btn" onclick="localStorage.removeItem('${AUTH_STORAGE_KEY}'); history.replaceState(null,'',location.pathname); location.reload()">Register a new device</button>
      </div>
    </div>
  `;
}

function _authShowError(message) {
  const c = _authContainer();
  c.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <h1 class="auth-title">Connection error</h1>
        <p class="auth-sub">${escHtml(message)}</p>
        <button class="auth-btn" onclick="location.reload()">Retry</button>
      </div>
    </div>
  `;
}

// ── Token generator ───────────────────────────────────────────

function _genToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
