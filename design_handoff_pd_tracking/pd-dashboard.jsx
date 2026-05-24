// PD Tracking — screens: Dashboard, Log, Inventory, Prep

const { BAGS, BAG_LIST, I, BagChip, NowPill, Stepper, WeightEntry, BPEntry } = window.PD;
const { useState, useMemo } = React;

// ─── Shared layout pieces ────────────────────────────────────
function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={'card ' + className}>
      {(title || action) && (
        <header className="card-head">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

function Stat({ icon, label, value, unit, sub, accent }) {
  return (
    <div className="stat" style={accent ? { '--accent': accent } : undefined}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-body">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}{unit && <span className="stat-unit"> {unit}</span>}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// DASHBOARD
// ═════════════════════════════════════════════════════════════
function Dashboard({ state, go }) {
  const { bags, supplies, vitals, weight, log } = state;
  const lowest = Math.min(bags.low, bags.med, bags.high);
  const totalBags = bags.low + bags.med + bags.high;
  const lastWeight = weight[weight.length - 1];
  const lastBP = vitals[vitals.length - 1];

  // weight trend mini chart
  const wMin = Math.min(...weight.map(w => w.kg)) - 0.5;
  const wMax = Math.max(...weight.map(w => w.kg)) + 0.5;

  return (
    <div className="page">
      <PageHead title="Hi, Yael" subtitle="Today, Fri May 22" right={
        <button className="quick-log" onClick={() => go('log')}>
          {I.plus}<span>Quick log</span>
        </button>
      }/>

      {/* Bag inventory hero — the 3 bag types as the dominant visual */}
      <Card title="Solution bags" subtitle={lowest < 5 ? `${lowest} ${lowest === 1 ? 'bag' : 'bags'} of one type running low` : `${totalBags} total in stock`} action={
        <button className="link" onClick={() => go('inventory')}>Manage →</button>
      }>
        <div className="bag-hero-grid">
          {BAG_LIST.map(b => {
            const count = bags[b.id];
            const low = count < 5;
            return (
              <div key={b.id} className={'bag-hero' + (low ? ' low' : '')} style={{ '--bag': b.color, '--bag-soft': b.soft, '--bag-deep': b.deep }}>
                <div className="bag-hero-top">
                  <span className="bag-dot lg" />
                  <span className="bag-hero-pct">{b.pct}</span>
                </div>
                <div className="bag-hero-count">{count}</div>
                <div className="bag-hero-label">
                  {low
                    ? <span className="low-tag">{I.warn} low</span>
                    : <span className="bag-hero-stock">bags in stock</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Supplies — compact row */}
      <Card title="Supplies">
        <div className="supplies-grid">
          {Object.entries(supplies).map(([k, v]) => {
            const lbl = { caps:'Caps', gauze:'Gauze pads', salt:'Salt water', ointment:'Antibiotic ointment', big:'Big bandage', small:'Small bandage' }[k];
            const warn = { caps:10, gauze:10, salt:2, ointment:1, big:5, small:5 }[k];
            const low = v < warn;
            return (
              <div key={k} className={'supply' + (low ? ' low' : '')}>
                <div className="supply-label">{lbl}</div>
                <div className="supply-val">{v}{low && <span className="warn-icon">{I.warn}</span>}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Vitals + Weight */}
      <div className="two-col">
        <Card title="Latest vitals" action={<button className="link" onClick={() => go('log')}>Log →</button>}>
          <div className="vitals-stack">
            <div className="vitals-row big">
              <span className="vitals-label">Blood pressure</span>
              <span className="vitals-val">{lastBP.sys}<span className="slash">/</span>{lastBP.dia}<span className="unit"> mmHg</span></span>
            </div>
            <div className="vitals-meta">{timeAgo(lastBP.at)} · 3-day avg <strong>{avg(vitals.slice(-9).map(v=>v.sys))}/{avg(vitals.slice(-9).map(v=>v.dia))}</strong></div>
          </div>
        </Card>

        <Card title="Weight" action={<button className="link" onClick={() => go('log')}>Log →</button>}>
          <div className="weight-summary">
            <div className="weight-now">{lastWeight.kg.toFixed(1)}<span className="unit">kg</span></div>
            <Sparkline data={weight.map(w=>w.kg)} min={wMin} max={wMax} />
          </div>
          <div className="vitals-meta">7-day trend · {(weight[weight.length-1].kg - weight[0].kg >= 0 ? '+' : '')}{(weight[weight.length-1].kg - weight[0].kg).toFixed(1)} kg</div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card title="Recent exchanges" action={<button className="link">All →</button>}>
        <ul className="activity">
          {log.slice(0, 5).map((e, i) => (
            <li key={i} className="activity-row">
              <BagChip bag={BAGS[e.bag]} size="sm" />
              <div className="activity-info">
                <div className="activity-meta">{timeAgo(e.at)} · drained {e.drained.toFixed(1)} kg</div>
              </div>
              <div className="activity-time">{new Date(e.at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Sparkline({ data, min, max, w = 160, h = 44 }) {
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - 8) + 4;
    const y = h - 6 - ((v - min) / (max - min)) * (h - 12);
    return [x, y];
  });
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="sparkline">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => i === pts.length - 1 && <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="currentColor" />)}
    </svg>
  );
}

function PageHead({ title, subtitle, right }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

function timeAgo(at) {
  const diff = (Date.now() - new Date(at).getTime()) / 60000;
  if (diff < 1) return 'just now';
  if (diff < 60) return Math.round(diff) + ' min ago';
  if (diff < 60 * 24) return Math.round(diff / 60) + ' h ago';
  return Math.round(diff / 1440) + ' d ago';
}
function avg(arr) { return Math.round(arr.reduce((a,b)=>a+b,0) / arr.length); }

window.PDDash = { Dashboard, Card, Stat, PageHead, Sparkline, timeAgo, avg };
