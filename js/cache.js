// ============================================================
// cache.js — Unified localStorage cache
// All data entries share the same envelope: { data, version, savedAt }
// An in-memory mirror prevents redundant JSON.parse on repeated reads.
// ============================================================
// Auth/theme/text-size keys are plain strings managed by their own
// modules and are intentionally excluded from this layer.
// ============================================================

const _CACHE_PREFIX = 'pd2_';
const _mem = {};  // in-memory mirror; keyed by logical name (no prefix)

const AppCache = {

  // ── Core ─────────────────────────────────────────────────────

  /**
   * Read a cache entry.
   * Returns { data, version, savedAt } or null.
   */
  get(name) {
    if (_mem[name] !== undefined) return _mem[name];
    try {
      const raw = localStorage.getItem(_CACHE_PREFIX + name);
      _mem[name] = raw ? JSON.parse(raw) : null;
      return _mem[name];
    } catch { return (_mem[name] = null); }
  },

  /**
   * Write a cache entry.
   * Returns the stored entry { data, version, savedAt }.
   */
  set(name, data, version) {
    const entry = { data, version: version != null ? version : null, savedAt: Date.now() };
    _mem[name] = entry;
    try { localStorage.setItem(_CACHE_PREFIX + name, JSON.stringify(entry)); } catch {}
    return entry;
  },

  /**
   * Nullify version so next consumer knows the data may be stale.
   * Preserves the data so screens can still render while re-fetching.
   */
  invalidate(name) {
    const live = _mem[name];
    if (live) live.version = null;
    try {
      const stored = JSON.parse(localStorage.getItem(_CACHE_PREFIX + name) || 'null');
      if (stored) {
        stored.version = null;
        localStorage.setItem(_CACHE_PREFIX + name, JSON.stringify(stored));
      }
    } catch {}
  },

  /**
   * Fully remove a cache entry from memory and localStorage.
   * The next read will return null, forcing a fresh network fetch.
   */
  clear(name) {
    delete _mem[name];
    try { localStorage.removeItem(_CACHE_PREFIX + name); } catch {}
  },

  // ── Patients ──────────────────────────────────────────────────
  // data: Patient[]
  getPatients()          { return this.get('patients'); },
  setPatients(list, ver) { return this.set('patients', list, ver); },

  // ── Config (prep reference card) ──────────────────────────────
  // data: ConfigObj
  getConfig()            { return this.get('config'); },
  setConfig(cfg, ver)    { return this.set('config', cfg, ver); },

  // ── Dashboard (per patient) ───────────────────────────────────
  // data: DashboardObj
  getDashboard(pid)              { return this.get('dash_' + pid); },
  setDashboard(pid, data, ver)   { return this.set('dash_' + pid, data, ver); },
  invalidateDashboard(pid)       { this.invalidate('dash_' + pid); },
  clearDashboard(pid)            { this.clear('dash_' + pid); },

  // ── History (per patient + date range) ───────────────────────
  // data: Row[]
  getHistory(pid, from, to)            { return this.get('hist_' + pid + '_' + from + '_' + to); },
  setHistory(pid, from, to, rows, ver) { return this.set('hist_' + pid + '_' + from + '_' + to, rows, ver); },
};
