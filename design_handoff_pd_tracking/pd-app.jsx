// PD Tracking — responsive app component
// Uses CSS container queries so it adapts to its container, not viewport.
// Bag colors are the dominant visual language.

const { useState, useEffect, useMemo, useRef } = React;

// ─── Bag color system ────────────────────────────────────────
// The three peritoneal dialysis solution concentrations, color-coded everywhere.
const BAGS = {
  low:  { id: 'low',  pct: '1.36%', label: 'Low',    desc: 'Low dextrose',    color: '#E8A317', soft: '#FCEFD0', deep: '#7A5210' },
  med:  { id: 'med',  pct: '2.27%', label: 'Medium', desc: 'Medium dextrose', color: '#2BA15A', soft: '#D5EFDF', deep: '#13502A' },
  high: { id: 'high', pct: '3.86%', label: 'High',   desc: 'High dextrose',   color: '#D6347B', soft: '#FADCE8', deep: '#6E1340' },
};
const BAG_LIST = [BAGS.low, BAGS.med, BAGS.high];

// ─── Icons (inline SVG, single-stroke) ───────────────────────
const I = {
  home:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M3 11l9-8 9 8M5 9v11h14V9"/></svg>,
  log:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M12 5v14M5 12h14"/></svg>,
  box:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10"/></svg>,
  prep:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M9 11l3 3 7-7M20 12v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1h9"/></svg>,
  edit:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4z"/></svg>,
  plus:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><path d="M12 5v14M5 12h14"/></svg>,
  minus:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><path d="M5 12h14"/></svg>,
  check:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M5 12l5 5L20 7"/></svg>,
  warn:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M12 9v4M12 17h.01M10.3 3.8L2.6 17a2 2 0 001.7 3h15.4a2 2 0 001.7-3L13.7 3.8a2 2 0 00-3.4 0z"/></svg>,
  drop:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M12 2.5s7 7.5 7 12.5a7 7 0 01-14 0c0-5 7-12.5 7-12.5z"/></svg>,
  scale:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  heart:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M3 12h3l2-5 3 10 2-7 2 4h6"/></svg>,
  back:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
};

// ─── Bag chip — the core visual element ──────────────────────
function BagChip({ bag, size = 'md', selected = false, onClick, showLabel = true, style }) {
  const sizes = {
    sm: { h: 28, dot: 10, fs: 12, gap: 6, pad: '0 10px' },
    md: { h: 36, dot: 14, fs: 14, gap: 8, pad: '0 14px' },
    lg: { h: 56, dot: 20, fs: 18, gap: 12, pad: '0 18px' },
  };
  const s = sizes[size];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={selected ? 'bag-chip selected' : 'bag-chip'}
      style={{
        height: s.h, padding: s.pad, gap: s.gap, fontSize: s.fs,
        '--bag': bag.color, '--bag-soft': bag.soft, '--bag-deep': bag.deep,
        ...style,
      }}
    >
      <span className="bag-dot" style={{ width: s.dot, height: s.dot }} />
      <span className="bag-pct">{bag.pct}</span>
      {showLabel && <span className="bag-label">{bag.label}</span>}
    </Tag>
  );
}

// ─── Date/time compact pill ──────────────────────────────────
// Default "Now · Today 2:52 PM" — tap to edit, expands inline.
function NowPill({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const fmt = (d) => {
    const today = new Date(); today.setHours(0,0,0,0);
    const dd = new Date(d); const ddDay = new Date(d); ddDay.setHours(0,0,0,0);
    const day = ddDay.getTime() === today.getTime() ? 'Today'
      : ddDay.getTime() === today.getTime() - 86400000 ? 'Yesterday'
      : dd.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const time = dd.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${day} · ${time}`;
  };
  const toLocalInput = (d) => {
    const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
    return x.toISOString().slice(0, 16);
  };
  return (
    <div className="now-pill-wrap">
      <button className="now-pill" onClick={() => setOpen(!open)}>
        <span className="now-dot" />
        <span className="now-text"><strong>Now</strong> · {fmt(value)}</span>
        <span className="now-edit">{I.edit}</span>
      </button>
      {open && (
        <div className="now-edit-pop">
          <input
            type="datetime-local"
            value={toLocalInput(value)}
            onChange={(e) => onChange(new Date(e.target.value))}
          />
          <button onClick={() => { onChange(new Date()); setOpen(false); }} className="ghost-btn">Reset to now</button>
          <button onClick={() => setOpen(false)} className="primary-btn sm">Done</button>
        </div>
      )}
    </div>
  );
}

// ─── Stepper ─────────────────────────────────────────────────
function Stepper({ value, onChange, min = 0, max = 999, step = 1, suffix }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - step))} aria-label="Decrease">{I.minus}</button>
      <span className="stepper-val">{value}{suffix && <span className="stepper-suffix">{suffix}</span>}</span>
      <button onClick={() => onChange(Math.min(max, value + step))} aria-label="Increase">{I.plus}</button>
    </div>
  );
}

// ─── Drum scroller — single digit wheel ─────────────────────
// iOS-style picker: scroll-snap based, scales/fades non-center items,
// shows a translucent band over the selected row.
function DigitWheel({ value, onChange, min = 0, max = 9, pad = 1, itemH = 44 }) {
  const ref = useRef();
  const tmr = useRef();
  const [scrollTop, setScrollTop] = useState((value - min) * itemH);
  const items = useMemo(() => {
    const arr = []; for (let i = min; i <= max; i++) arr.push(i); return arr;
  }, [min, max]);

  // External value changes → scroll the wheel
  useEffect(() => {
    if (!ref.current) return;
    const target = (value - min) * itemH;
    if (Math.abs(ref.current.scrollTop - target) > 1) {
      ref.current.scrollTop = target;
      setScrollTop(target);
    }
  }, [value, min, itemH]);

  const onScroll = () => {
    if (!ref.current) return;
    setScrollTop(ref.current.scrollTop);
    clearTimeout(tmr.current);
    tmr.current = setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.round(ref.current.scrollTop / itemH);
      const v = Math.max(min, Math.min(max, idx + min));
      if (v !== value) onChange(v);
      // hard snap
      const target = (v - min) * itemH;
      if (Math.abs(ref.current.scrollTop - target) > 0.5) {
        ref.current.scrollTop = target;
      }
    }, 110);
  };

  const currentIdx = Math.round(scrollTop / itemH);
  const fmt = (n) => pad > 1 ? String(n).padStart(pad, '0') : String(n);

  return (
    <div className="drum" style={{ height: itemH * 5, width: pad >= 2 ? 78 : 52 }}>
      <div className="drum-scroll" ref={ref} onScroll={onScroll}>
        <div style={{ height: itemH * 2, flexShrink: 0 }} />
        {items.map((n, i) => {
          const d = Math.abs(i - currentIdx);
          return (
            <button
              key={n}
              type="button"
              className="drum-item"
              style={{
                height: itemH,
                opacity: d === 0 ? 1 : d === 1 ? 0.45 : d === 2 ? 0.18 : 0,
              }}
              onClick={() => ref.current.scrollTo({ top: i * itemH, behavior: 'smooth' })}
            >
              {fmt(n)}
            </button>
          );
        })}
        <div style={{ height: itemH * 2, flexShrink: 0 }} />
      </div>
      <div className="drum-band" />
      <div className="drum-fade-top" />
      <div className="drum-fade-bot" />
    </div>
  );
}

// ─── Helpers to split a number into its digit places ────────
// e.g. decompose(64.5, 3, 1) → [0, 6, 4, 5]  (hundreds, tens, ones, tenth)
function decompose(value, intDigits, decimals = 0) {
  const m = Math.pow(10, decimals);
  let v = Math.round(value * m);
  const total = intDigits + decimals;
  const arr = new Array(total).fill(0);
  for (let i = total - 1; i >= 0; i--) { arr[i] = v % 10; v = Math.floor(v / 10); }
  return arr;
}
function compose(arr, decimals = 0) {
  let v = 0; for (const d of arr) v = v * 10 + d;
  return v / Math.pow(10, decimals);
}

// ─── Drainage weight drum: X.X kg ───────────────────────────
function WeightEntry({ value, onChange, accent }) {
  // value 0.0 - 9.9
  const [ones, tenth] = decompose(value, 1, 1);
  const set = (i, v) => {
    const arr = decompose(value, 1, 1); arr[i] = v;
    onChange(compose(arr, 1));
  };
  return (
    <div className="drum-wrap" style={accent ? { '--drum-accent': accent } : undefined}>
      <div className="drum-picker">
        <DigitWheel value={ones}  min={0} max={9} onChange={v => set(0, v)} />
        <span className="drum-sep">.</span>
        <DigitWheel value={tenth} min={0} max={9} onChange={v => set(1, v)} />
        <span className="drum-unit">kg</span>
      </div>
    </div>
  );
}

// ─── Body weight drum: XXX.X kg ─────────────────────────────
function BodyWeightEntry({ value, onChange }) {
  const [h, t, o, dec] = decompose(value, 3, 1);
  const set = (i, v) => {
    const arr = decompose(value, 3, 1); arr[i] = v;
    onChange(compose(arr, 1));
  };
  return (
    <div className="drum-wrap">
      <div className="drum-picker">
        <DigitWheel value={h}   min={0} max={2} onChange={v => set(0, v)} />
        <DigitWheel value={t}   min={0} max={9} onChange={v => set(1, v)} />
        <DigitWheel value={o}   min={0} max={9} onChange={v => set(2, v)} />
        <span className="drum-sep">.</span>
        <DigitWheel value={dec} min={0} max={9} onChange={v => set(3, v)} />
        <span className="drum-unit">kg</span>
      </div>
    </div>
  );
}

// ─── BP drum: XXX / XXX mmHg ────────────────────────────────
function BPEntry({ sys, dia, onSys, onDia, accent }) {
  const [sh, st, so] = decompose(sys, 3, 0);
  const [dh, dt, doo] = decompose(dia, 3, 0);
  const setSys = (i, v) => { const a = decompose(sys, 3, 0); a[i] = v; onSys(compose(a, 0)); };
  const setDia = (i, v) => { const a = decompose(dia, 3, 0); a[i] = v; onDia(compose(a, 0)); };
  return (
    <div className="drum-wrap bp-drum" style={accent ? { '--drum-accent': accent } : undefined}>
      <div className="drum-picker">
        <DigitWheel value={sh} min={0} max={2} onChange={v => setSys(0, v)} />
        <DigitWheel value={st} min={0} max={9} onChange={v => setSys(1, v)} />
        <DigitWheel value={so} min={0} max={9} onChange={v => setSys(2, v)} />
      </div>
      <span className="drum-slash">/</span>
      <div className="drum-picker">
        <DigitWheel value={dh} min={0} max={1} onChange={v => setDia(0, v)} />
        <DigitWheel value={dt} min={0} max={9} onChange={v => setDia(1, v)} />
        <DigitWheel value={doo} min={0} max={9} onChange={v => setDia(2, v)} />
        <span className="drum-unit">mmHg</span>
      </div>
    </div>
  );
}

window.PD = {
  BAGS, BAG_LIST, I, BagChip, NowPill, Stepper,
  DigitWheel, WeightEntry, BodyWeightEntry, BPEntry,
};
