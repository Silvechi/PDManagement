// ============================================================
// users.js — Patient management + active patient state
// ============================================================

const PATIENT_STORAGE_KEY = 'pd_active_patient_id';
const PATIENTS_CACHE_KEY  = 'pd_patients_v1';

let _activePatientId   = localStorage.getItem(PATIENT_STORAGE_KEY) || null;
let _activePatientName = null;
let _patientsCache     = null; // { version, patients }

function getActivePatientId()   { return _activePatientId; }
function getActivePatientName() { return _activePatientName; }

// Called once on app init — loads patients and resolves active patient.
async function loadPatientsCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(PATIENTS_CACHE_KEY));
    if (cached?.version && cached?.patients) _patientsCache = cached;
  } catch {}

  try {
    const result = await API.getPatients();
    _patientsCache = { version: result.version, patients: result.patients };
    try { localStorage.setItem(PATIENTS_CACHE_KEY, JSON.stringify(_patientsCache)); } catch {}
  } catch {}

  _resolveActivePatient();
}

function _resolveActivePatient() {
  if (!_patientsCache?.patients) return;
  const active = _patientsCache.patients.filter(p => p.active);
  if (_activePatientId) {
    const found = active.find(p => p.patientId === _activePatientId);
    if (found) {
      _activePatientName = found.name;
      return;
    }
  }
  // Stored ID missing or no longer valid — auto-select sole active patient
  if (active.length === 1) {
    _activePatientId   = active[0].patientId;
    _activePatientName = active[0].name;
    try { localStorage.setItem(PATIENT_STORAGE_KEY, _activePatientId); } catch {}
  } else {
    _activePatientId   = null;
    _activePatientName = null;
  }
}

function setActivePatient(patientId, name) {
  _activePatientId   = patientId;
  _activePatientName = name;
  try { localStorage.setItem(PATIENT_STORAGE_KEY, patientId); } catch {}
  updatePatientChip();
}

function updatePatientChip() {
  const chip = document.getElementById('patient-chip');
  if (!chip) return;
  chip.textContent = _activePatientName || t('users.select');
}

// ============================================================
// Settings screen
// ============================================================

async function renderSettings(container) {
  container.innerHTML = `<div class="page"><div class="loading-state">${t('common.loading')}</div></div>`;
  try {
    const result = await API.getPatients();
    _patientsCache = { version: result.version, patients: result.patients };
    try { localStorage.setItem(PATIENTS_CACHE_KEY, JSON.stringify(_patientsCache)); } catch {}
  } catch {}
  _renderSettingsPage(container, _patientsCache?.patients || []);
}

function _renderSettingsPage(container, patients) {
  const activePatient = patients.find(p => p.patientId === _activePatientId);
  const theme    = typeof currentTheme    !== 'undefined' ? currentTheme    : 'light';
  const textSize = typeof currentTextSize !== 'undefined' ? currentTextSize : 'normal';
  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <h1 class="page-title">${t('settings.title')}</h1>
      </div>

      <section class="card">
        <div class="card-head"><h2 class="card-title">${t('settings.appearance')}</h2></div>
        <div class="settings-row">
          <span class="settings-row-label">${t('settings.theme')}</span>
          <div class="tab-pill" style="width:auto">
            <button class="tab-pill-btn${theme !== 'dark' ? ' active' : ''}"
                    onclick="_settingsSetTheme('light')">${t('settings.light')}</button>
            <button class="tab-pill-btn${theme === 'dark' ? ' active' : ''}"
                    onclick="_settingsSetTheme('dark')">${t('settings.dark')}</button>
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-row-label">${t('settings.language')}</span>
          <div class="tab-pill" style="width:auto">
            <button class="tab-pill-btn${currentLang !== 'he' ? ' active' : ''}"
                    onclick="_settingsSetLang('en')">English</button>
            <button class="tab-pill-btn${currentLang === 'he' ? ' active' : ''}"
                    onclick="_settingsSetLang('he')">עברית</button>
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-row-label">${t('settings.text_size')}</span>
          <div class="tab-pill" style="width:auto">
            <button class="tab-pill-btn${textSize === 'normal' ? ' active' : ''}"
                    onclick="_settingsSetTextSize('normal')">${t('settings.text_normal')}</button>
            <button class="tab-pill-btn${textSize === 'large'  ? ' active' : ''}"
                    onclick="_settingsSetTextSize('large')">${t('settings.text_large')}</button>
            <button class="tab-pill-btn${textSize === 'xlarge' ? ' active' : ''}"
                    onclick="_settingsSetTextSize('xlarge')">${t('settings.text_xlarge')}</button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2 class="card-title">${t('settings.active_user')}</h2></div>
        ${activePatient
          ? `<div class="settings-row">
               <div>
                 <div class="settings-row-label">${escHtml(activePatient.name)}</div>
                 ${activePatient.dob ? `<div class="settings-row-sub">${t('settings.dob', { dob: escHtml(activePatient.dob) })}</div>` : ''}
               </div>
             </div>`
          : `<p class="no-data" style="margin:8px 0">${t('settings.no_user')}</p>`}
        <button class="ghost-btn full-width" style="margin-top:10px"
                onclick="renderUsers(document.getElementById('screen-container'))">
          ${t('settings.manage_users')}
        </button>
      </section>
    </div>
  `;
}

function _settingsSetTheme(theme) {
  applyTheme(theme);
  API.savePreferences({ theme }).catch(() => {});
  _renderSettingsPage(document.getElementById('screen-container'), _patientsCache?.patients || []);
}

function _settingsSetLang(lang) {
  setLang(lang);
  API.savePreferences({ language: lang }).catch(() => {});
  _renderSettingsPage(document.getElementById('screen-container'), _patientsCache?.patients || []);
}

function _settingsSetTextSize(size) {
  applyTextSize(size);
  API.savePreferences({ textSize: size }).catch(() => {});
  _renderSettingsPage(document.getElementById('screen-container'), _patientsCache?.patients || []);
}

// ============================================================
// Users screen — list
// ============================================================

async function renderUsers(container) {
  container.innerHTML = `<div class="page"><div class="loading-state">${t('common.loading')}</div></div>`;
  try {
    const result = await API.getPatients();
    _patientsCache = { version: result.version, patients: result.patients };
    try { localStorage.setItem(PATIENTS_CACHE_KEY, JSON.stringify(_patientsCache)); } catch {}
    _renderUsersList(container, result.patients);
  } catch (err) {
    container.innerHTML = `<div class="page"><div class="feedback feedback-error">${t('common.failed', { msg: escHtml(err.message) })}</div></div>`;
  }
}

function _renderUsersList(container, patients) {
  const active = patients.filter(p => p.active);
  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <button class="ghost-btn" onclick="renderSettings(document.getElementById('screen-container'))">${t('common.back')}</button>
        <div>
          <h1 class="page-title">${t('users.title')}</h1>
          <div class="page-sub">${t('users.active_count', { n: active.length })}</div>
        </div>
      </div>
      <div id="users-list">
        ${patients.length === 0
          ? `<p class="no-data">${t('users.no_users')}</p>`
          : patients.map(p => _userCardHtml(p)).join('')}
      </div>
      <div class="users-add-btn">
        <button class="primary-btn full-width" onclick="_usersShowAddForm()">${t('users.add_btn')}</button>
      </div>
    </div>
  `;
}

function _userCardHtml(p) {
  const isCurrent = _activePatientId === p.patientId;
  return `
    <div class="user-card${isCurrent ? ' user-card-active' : ''}${!p.active ? ' user-card-inactive' : ''}">
      <div class="user-card-body"
           data-patient-id="${escHtml(p.patientId)}"
           data-patient-name="${escHtml(p.name)}"
           onclick="_usersSelectAndGo(this.dataset.patientId, this.dataset.patientName)">
        <div class="user-card-name">${escHtml(p.name)}</div>
        ${p.dob ? `<div class="user-card-sub">${t('users.dob', { dob: escHtml(p.dob) })}</div>` : ''}
        ${isCurrent ? `<span class="user-active-badge">${t('users.active_badge')}</span>` : ''}
        ${!p.active ? `<span class="user-inactive-badge">${t('users.inactive_badge')}</span>` : ''}
      </div>
      <button class="ghost-btn user-edit-btn"
              data-patient-id="${escHtml(p.patientId)}"
              onclick="event.stopPropagation(); _usersShowEditForm(this.dataset.patientId)">${t('users.edit')}</button>
    </div>
  `;
}

function _usersSelectAndGo(patientId, name) {
  setActivePatient(patientId, name);
  navigateTo('dashboard');
}

// ============================================================
// Add / Edit form
// ============================================================

function _usersShowAddForm() {
  _renderUserForm(document.getElementById('screen-container'), null);
}

function _usersShowEditForm(patientId) {
  const patient = _patientsCache?.patients?.find(p => p.patientId === patientId) || null;
  _renderUserForm(document.getElementById('screen-container'), patient);
}

function _renderUserForm(container, patient) {
  const isEdit = !!patient;
  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <button class="ghost-btn" onclick="renderUsers(document.getElementById('screen-container'))">${t('common.back')}</button>
        <h1 class="page-title">${isEdit ? t('users.form.edit') : t('users.form.add')}</h1>
      </div>
      <section class="card">
        <div class="form-field">
          <label class="form-label">${t('users.form.name')}</label>
          <input id="uf-name" class="form-input" type="text"
                 value="${isEdit ? escHtml(patient.name) : ''}"
                 placeholder="${t('users.form.name_ph')}" maxlength="100">
        </div>
        <div class="form-field">
          <label class="form-label">${t('users.form.dob')}</label>
          <input id="uf-dob" class="form-input" type="date"
                 value="${isEdit && patient.dob ? escHtml(patient.dob) : ''}">
        </div>
        <div class="form-field">
          <label class="form-label">${t('users.form.comment')}</label>
          <textarea id="uf-comment" class="form-input" rows="3"
                    placeholder="${t('users.form.comment_ph')}">${isEdit && patient.comment ? escHtml(patient.comment) : ''}</textarea>
        </div>
        ${isEdit ? `
        <div class="form-field">
          <label class="form-label">${t('users.form.active')}</label>
          <select id="uf-active" class="form-input">
            <option value="true"  ${patient.active  ? 'selected' : ''}>${t('users.form.yes')}</option>
            <option value="false" ${!patient.active ? 'selected' : ''}>${t('users.form.no')}</option>
          </select>
        </div>
        ` : ''}
        <button class="primary-btn full-width" id="uf-submit"
                data-patient-id="${isEdit ? escHtml(patient.patientId) : ''}"
                onclick="_usersSubmitForm(this.dataset.patientId || null)">
          ${isEdit ? t('users.form.save') : t('users.form.add')}
        </button>
        <p id="uf-msg" class="auth-msg" style="margin-top:8px"></p>
      </section>
    </div>
  `;
}

async function _usersSubmitForm(patientId) {
  const btn     = document.getElementById('uf-submit');
  const msg     = document.getElementById('uf-msg');
  const name    = (document.getElementById('uf-name')?.value    || '').trim();
  const dob     = (document.getElementById('uf-dob')?.value     || '');
  const comment = (document.getElementById('uf-comment')?.value || '').trim();

  if (!name) {
    msg.textContent = t('users.form.required');
    msg.style.color = 'var(--danger)';
    return;
  }

  btn.disabled    = true;
  msg.textContent = t('common.saving');
  msg.style.color = 'var(--text-3)';

  try {
    if (patientId) {
      const active = document.getElementById('uf-active')?.value === 'true';
      await API.editPatient({ patientId, name, dob, comment, active });
    } else {
      const result = await API.addPatient({ name, dob, comment });
      // Auto-select if this is the first patient
      if (!_activePatientId) setActivePatient(result.patientId, name);
    }

    const fresh = await API.getPatients();
    _patientsCache = { version: fresh.version, patients: fresh.patients };
    try { localStorage.setItem(PATIENTS_CACHE_KEY, JSON.stringify(_patientsCache)); } catch {}

    // If first patient was just added, go straight to dashboard
    if (!patientId && fresh.patients.length === 1) {
      navigateTo('dashboard');
    } else {
      _renderUsersList(document.getElementById('screen-container'), fresh.patients);
    }
  } catch (err) {
    msg.textContent = t('common.error', { msg: err.message });
    msg.style.color = 'var(--danger)';
    btn.disabled = false;
  }
}
