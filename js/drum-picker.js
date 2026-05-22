// ============================================================
// drum-picker.js — Scroll-wheel style numeric input
//
// Usage:
//   const picker = new DrumPicker(containerEl, {
//     min: 0, max: 250, value: 65,
//     label: 'kg integer', onChange: v => console.log(v)
//   });
//   picker.value            // get
//   picker.value = 70       // set
// ============================================================

class DrumPicker {
  constructor(container, options = {}) {
    this.min      = options.min   !== undefined ? options.min   : 0;
    this.max      = options.max   !== undefined ? options.max   : 999;
    this.step     = options.step  !== undefined ? options.step  : 1;
    this.label    = options.label !== undefined ? options.label : '';
    this._value   = this._clamp(options.value !== undefined ? options.value : this.min);
    this.onChange = options.onChange || function () {};

    // Touch state
    this._touchLastY = 0;
    this._touchAccum = 0;
    this.ITEM_H = 52;

    this._build(container);
    this._attach(this._el);
  }

  // ── Public API ──────────────────────────────────────────────

  get value() { return this._value; }
  set value(v) {
    const c = this._clamp(v);
    if (c !== this._value) {
      this._value = c;
      this._render();
      this.onChange(this._value);
    }
  }

  // ── Private ─────────────────────────────────────────────────

  _clamp(v) {
    return Math.max(this.min, Math.min(this.max, v));
  }

  _fmt(v) {
    return String(Math.round(v));
  }

  _build(container) {
    container.innerHTML = `
      <div class="dp" tabindex="0"
           role="spinbutton"
           aria-valuenow="${this._value}"
           aria-valuemin="${this.min}"
           aria-valuemax="${this.max}"
           aria-label="${this.label}">
        <div class="dp-items"></div>
        <div class="dp-selector"></div>
      </div>
    `;
    this._el      = container.querySelector('.dp');
    this._itemsEl = container.querySelector('.dp-items');
    this._render();
  }

  _render() {
    const rows = [];
    for (let offset = -2; offset <= 2; offset++) {
      const raw   = this._value + offset * this.step;
      const ghost = raw < this.min || raw > this.max;
      const sel   = offset === 0;
      const cls   = ['dp-item', sel ? 'dp-selected' : '', ghost ? 'dp-ghost' : '']
        .filter(Boolean).join(' ');
      rows.push(`<div class="${cls}">${ghost ? '' : this._fmt(raw)}</div>`);
    }
    this._itemsEl.innerHTML = rows.join('');
    this._el.setAttribute('aria-valuenow', this._value);
  }

  _step(delta) {
    // Avoid floating-point drift for fractional steps
    const precision = String(this.step).includes('.')
      ? String(this.step).split('.')[1].length : 0;
    const next = this._clamp(
      parseFloat((this._value + delta * this.step).toFixed(precision))
    );
    if (next !== this._value) {
      this._value = next;
      this._render();
      this.onChange(this._value);
    }
  }

  _attach(el) {
    // Mouse wheel: scroll up (deltaY < 0) = increment, down = decrement
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._step(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });

    // Touch drag: drag up (finger moves up) = increment
    el.addEventListener('touchstart', (e) => {
      this._touchLastY = e.touches[0].clientY;
      this._touchAccum = 0;
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const y = e.touches[0].clientY;
      this._touchAccum += this._touchLastY - y; // positive when dragging up
      this._touchLastY  = y;
      const steps = Math.trunc(this._touchAccum / this.ITEM_H);
      if (steps !== 0) {
        this._step(steps);
        this._touchAccum -= steps * this.ITEM_H;
      }
    }, { passive: false });

    // Keyboard: ArrowUp/Down like a number spinner
    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp')   { e.preventDefault(); this._step(1);  }
      if (e.key === 'ArrowDown') { e.preventDefault(); this._step(-1); }
      if (e.key === 'PageUp')    { e.preventDefault(); this._step(10); }
      if (e.key === 'PageDown')  { e.preventDefault(); this._step(-10); }
    });

    // Tap: upper half = decrement, lower half = increment
    el.addEventListener('click', (e) => {
      const rect = el.getBoundingClientRect();
      this._step(e.clientY < rect.top + rect.height / 2 ? -1 : 1);
    });
  }
}
