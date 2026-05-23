// ============================================================
// auth.js — Device token auth (localStorage + URL hash)
// ============================================================

const AUTH_STORAGE_KEY = 'pd_device_token_v1';

async function initAuth() {
  const storedToken = localStorage.getItem(AUTH_STORAGE_KEY);

  if (!storedToken) {
    _authShowRegistration();
    return false;
  }

  try {
    const result = await API.validateToken(storedToken);
    if (result.status === 'approved' || result.status === 'readonly') {
      setDeviceToken(storedToken);
      API.touchToken(storedToken).catch(() => {});
      if (result.theme) applyTheme(result.theme);
      return true;
    }
    if (result.status === 'pending') {
      _authShowPending();
      return false;
    }
    // revoked or unknown — clear stored token and show login
    localStorage.removeItem(AUTH_STORAGE_KEY);
    _authShowDenied();
    return false;
  } catch (_err) {
    // Offline: allow access with stored token
    setDeviceToken(storedToken);
    return true;
  }
}

// ── Shared container helper ───────────────────────────────────

function _authContainer() {
  document.getElementById('topbar').style.display     = 'none';
  document.getElementById('bottom-nav').style.display = 'none';
  return document.getElementById('screen-container');
}

// ── Registration / login screen ───────────────────────────────

function _authShowRegistration(errorMsg) {
  const c = _authContainer();
  c.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <h1 class="auth-title">PD Tracker</h1>
        <p class="auth-sub">Enter your device name and password to sign in or register.</p>
        <label class="auth-label" for="auth-label-input">Device name</label>
        <input id="auth-label-input" class="auth-input" type="text"
               placeholder="e.g. Mom's phone" maxlength="50" autocomplete="username">
        <label class="auth-label" for="auth-pw-input">Password <span class="auth-hint">(6–20 characters)</span></label>
        <input id="auth-pw-input" class="auth-input" type="password"
               placeholder="Password" minlength="6" maxlength="20" autocomplete="current-password">
        <button class="auth-btn" id="auth-submit-btn" onclick="_authSubmit()">Continue</button>
        <p id="auth-msg" class="auth-msg">${errorMsg ? escHtml(errorMsg) : ''}</p>
      </div>
    </div>
  `;
  if (errorMsg) document.getElementById('auth-msg').style.color = 'var(--danger)';
  document.getElementById('auth-pw-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') _authSubmit();
  });
}

async function _authSubmit() {
  const btn      = document.getElementById('auth-submit-btn');
  const label    = (document.getElementById('auth-label-input').value || '').trim();
  const password = (document.getElementById('auth-pw-input').value   || '');
  const msg      = document.getElementById('auth-msg');

  if (!label) {
    msg.textContent = 'Please enter a device name.';
    msg.style.color = 'var(--danger)';
    return;
  }
  if (password.length < 6 || password.length > 20) {
    msg.textContent = 'Password must be 6–20 characters.';
    msg.style.color = 'var(--danger)';
    return;
  }

  btn.disabled    = true;
  msg.textContent = 'Connecting…';
  msg.style.color = 'var(--text-3)';

  try {
    const passwordHash = await _hashPassword(password);
    const newUUID      = _genToken();
    const result       = await API.loginOrRegister(label, passwordHash, newUUID);

    if (result.status === 'approved') {
      localStorage.setItem(AUTH_STORAGE_KEY, result.token);
      setDeviceToken(result.token);
      API.touchToken(result.token).catch(() => {});
      location.reload();
    } else if (result.status === 'pending') {
      localStorage.setItem(AUTH_STORAGE_KEY, result.token);
      _authShowPending();
    } else if (result.status === 'revoked') {
      _authShowDenied();
    } else {
      msg.textContent = 'Unexpected response. Try again.';
      msg.style.color = 'var(--danger)';
      btn.disabled = false;
    }
  } catch (err) {
    msg.textContent = 'Error: ' + err.message;
    msg.style.color = 'var(--danger)';
    btn.disabled = false;
  }
}

// ── Pending screen ────────────────────────────────────────────

function _authShowPending() {
  const c = _authContainer();
  c.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <h1 class="auth-title">Waiting for approval</h1>
        <p class="auth-sub">Your request is pending. Ask the account owner to approve it in the <strong>Tokens</strong> sheet in Google Sheets.</p>
        <p class="auth-sub">Once approved, sign in again with your device name and password.</p>
        <button class="auth-btn" id="auth-submit-btn" onclick="_authCheckAgain()">Check again</button>
        <button class="auth-btn auth-btn-secondary" onclick="_authShowRegistration()">Back</button>
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

// ── Password hashing ──────────────────────────────────────────

async function _hashPassword(password) {
  const data   = new TextEncoder().encode(password);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
