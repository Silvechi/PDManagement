// ============================================================
// drum-picker.js — Scroll-snap drum wheel input
//
// Usage:
//   const picker = new DrumPicker(containerEl, {
//     min: 0, max: 9, value: 5,
//     label: 'kg integer', onChange: v => console.log(v)
//   });
//   picker.value       // get current value
//   picker.value = 7   // set value (animates scroll)
// ============================================================

class DrumPicker {
  constructor(container, options = {}) {
    this.min      = options.min      ?? 0;
    this.max      = options.max      ?? 9;
    this._value   = this._clamp(options.value ?? this.min);
    this.onChange = options.onChange ?? (() => {});
    this.ITEM_H   = 44;
    this._timer   = null;
    this._build(container);
  }

  // ── Public API ──────────────────────────────────────────────

  get value() { return this._value; }

  set value(v) {
    const c = this._clamp(v);
    if (c === this._value) return;
    this._value = c;
    this._scrollTo(c, false);
    this._updateOpacity();
    this.onChange(c);
  }

  // ── Private ─────────────────────────────────────────────────

  _clamp(v) {
    return Math.max(this.min, Math.min(this.max, Math.round(Number(v) || 0)));
  }

  _idxOf(v) { return v - this.min; }

  _fmt(v) { return String(v); }

  _build(container) {
    const H = this.ITEM_H;
    const digits = String(this.max).length;
    const w = digits >= 3 ? 78 : digits >= 2 ? 60 : 52;

    let items = '';
    for (let v = this.min; v <= this.max; v++) {
      const d = Math.abs(this._idxOf(v) - this._idxOf(this._value));
      const op = d === 0 ? 1 : d === 1 ? 0.45 : 0;
      items += `<button type="button" class="drum-item" style="height:${H}px;opacity:${op}" data-v="${v}">${this._fmt(v)}</button>`;
    }

    container.innerHTML = `
      <div class="drum" style="height:${H * 3}px;width:${w}px">
        <div class="drum-scroll">
          <div style="height:${H}px;flex-shrink:0" aria-hidden="true"></div>
          ${items}
          <div style="height:${H}px;flex-shrink:0" aria-hidden="true"></div>
        </div>
        <div class="drum-band" aria-hidden="true"></div>
        <div class="drum-fade-top" aria-hidden="true"></div>
        <div class="drum-fade-bot" aria-hidden="true"></div>
      </div>
    `;

    this._scroll = container.querySelector('.drum-scroll');
    this._attachEvents();
    // Use requestAnimationFrame so layout is settled before scrolling
    requestAnimationFrame(() => this._scrollTo(this._value, false));
  }

  _scrollTo(v, smooth = true) {
    if (!this._scroll) return;
    const top = this._idxOf(v) * this.ITEM_H;
    if (smooth) {
      this._scroll.scrollTo({ top, behavior: 'smooth' });
    } else {
      this._scroll.scrollTop = top;
    }
  }

  _updateOpacity() {
    if (!this._scroll) return;
    const currentIdx = this._idxOf(this._value);
    this._scroll.querySelectorAll('.drum-item').forEach((el, i) => {
      const d = Math.abs(i - currentIdx);
      el.style.opacity = d === 0 ? 1 : d === 1 ? 0.45 : 0;
    });
  }

  _attachEvents() {
    const scroll = this._scroll;

    scroll.addEventListener('scroll', () => {
      // Live opacity update while scrolling
      const liveIdx = Math.round(scroll.scrollTop / this.ITEM_H);
      const liveV   = this._clamp(this.min + liveIdx);
      if (liveV !== this._value) {
        this._value = liveV;
        this._updateOpacity();
      }

      // Hard-snap + fire onChange after scroll settles
      clearTimeout(this._timer);
      this._timer = setTimeout(() => {
        const idx     = Math.round(scroll.scrollTop / this.ITEM_H);
        const snapped = this._clamp(this.min + idx);
        this._value   = snapped;
        this._updateOpacity();
        this.onChange(snapped);
        // Ensure pixel-perfect snap position
        const target = this._idxOf(snapped) * this.ITEM_H;
        if (Math.abs(scroll.scrollTop - target) > 0.5) {
          scroll.scrollTo({ top: target, behavior: 'smooth' });
        }
      }, 110);
    }, { passive: true });

    // Tap an item to scroll to it
    scroll.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-v]');
      if (!btn) return;
      const v = parseInt(btn.dataset.v, 10);
      if (v !== this._value) {
        this._value = v;
        this._scrollTo(v, true);
        this._updateOpacity();
        this.onChange(v);
      }
    });
  }
}
