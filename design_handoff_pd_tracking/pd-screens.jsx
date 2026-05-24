// PD Tracking — Log, Inventory, Prep screens

const { BAGS, BAG_LIST, I, BagChip, NowPill, Stepper, WeightEntry, BodyWeightEntry, BPEntry } = window.PD;
const { Card, PageHead } = window.PDDash;
const { useState } = React;

// ═════════════════════════════════════════════════════════════
// LOG
// ═════════════════════════════════════════════════════════════
function LogScreen({ state, setState }) {
  const [tab, setTab] = useState('drainage');
  const [when, setWhen] = useState(new Date());
  // drainage state
  const [type, setType] = useState('drain_fill');
  const [drained, setDrained] = useState(2.1);
  const [bagIn, setBagIn] = useState('low');
  const [bagsUsed, setBagsUsed] = useState(1);
  const [capsUsed, setCapsUsed] = useState(1);
  const [notes, setNotes] = useState('');
  // weight
  const [w, setW] = useState(state.weight[state.weight.length-1].kg);
  // BP
  const [sys, setSys] = useState(120);
  const [dia, setDia] = useState(80);

  const types = [
    { id: 'drain_fill', label: 'Drain + Fill' },
    { id: 'drain', label: 'Drain only' },
    { id: 'fill', label: 'Fill only' },
  ];

  return (
    <div className="page">
      <PageHead title="Log" subtitle="Record an exchange or measurement" />

      {/* big tab pill */}
      <div className="tab-pill">
        {[
          { id: 'drainage', label: 'Drainage', icon: I.drop },
          { id: 'weight',   label: 'Weight',   icon: I.scale },
          { id: 'bp',       label: 'BP',       icon: I.heart },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={'tab-pill-btn' + (tab === t.id ? ' on' : '')}>
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* compact date pill — bag color dominates, not date */}
      <NowPill value={when} onChange={setWhen} />

      {tab === 'drainage' && (
        <>
          <Card title="Exchange type">
            <div className="seg-row">
              {types.map(t => (
                <button key={t.id} onClick={() => setType(t.id)} className={'seg' + (type === t.id ? ' on' : '')}>
                  {t.label}
                </button>
              ))}
            </div>
          </Card>

          {(type === 'drain_fill' || type === 'drain') && (
            <Card title="Drained (bag out)" subtitle="Weight of the drainage bag — scroll the wheels">
              <WeightEntry value={drained} onChange={setDrained} accent={BAGS[bagIn].color} />
            </Card>
          )}

          {(type === 'drain_fill' || type === 'fill') && (
            <Card title="New bag going in" subtitle="Tap to select concentration">
              <div className="bag-pick">
                {BAG_LIST.map(b => {
                  const sel = bagIn === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setBagIn(b.id)}
                      className={'bag-pick-card' + (sel ? ' on' : '')}
                      style={{ '--bag': b.color, '--bag-soft': b.soft, '--bag-deep': b.deep }}
                    >
                      <span className="bag-dot lg" />
                      <span className="bag-pick-pct">{b.pct}</span>
                      <span className="bag-pick-stock">{state.bags[b.id]} in stock</span>
                      {sel && <span className="bag-pick-check">{I.check}</span>}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          <Card title="Supplies used">
            <div className="used-row">
              <div className="used-cell">
                <Stepper value={bagsUsed} onChange={setBagsUsed} min={0} max={9} />
                <span className="used-label">bags</span>
              </div>
              <div className="used-cell">
                <Stepper value={capsUsed} onChange={setCapsUsed} min={0} max={9} />
                <span className="used-label">caps</span>
              </div>
            </div>
          </Card>

          <Card title="Notes" subtitle="Optional — symptoms, fluid color, etc">
            <textarea className="notes" placeholder="Anything to remember…" value={notes} onChange={e => setNotes(e.target.value)} />
          </Card>

          <button className="primary-btn lg sticky">
            <span className="bag-dot" style={{ background: BAGS[bagIn].color, width: 14, height: 14 }} />
            Save {types.find(t=>t.id===type).label.toLowerCase()} · <strong>{BAGS[bagIn].pct}</strong>
          </button>
        </>
      )}

      {tab === 'weight' && (
        <>
          <Card title="Body weight" subtitle="Empty bladder, no shoes — same time each day">
            <BodyWeightEntry value={w} onChange={setW} />
          </Card>
          <Card title="Notes">
            <textarea className="notes" placeholder="Optional…" />
          </Card>
          <button className="primary-btn lg sticky">Save weight · {w.toFixed(1)} kg</button>
        </>
      )}

      {tab === 'bp' && (
        <>
          <Card title="Blood pressure">
            <BPEntry sys={sys} dia={dia} onSys={setSys} onDia={setDia} />
            <div className={'bp-status ' + bpStatus(sys, dia).cls}>
              <span className="bp-status-dot" />
              {bpStatus(sys, dia).label}
            </div>
          </Card>
          <Card title="Notes">
            <textarea className="notes" placeholder="Optional…" />
          </Card>
          <button className="primary-btn lg sticky">Save BP · {sys}/{dia}</button>
        </>
      )}
    </div>
  );
}

function bpStatus(s, d) {
  if (s < 90 || d < 60)  return { cls: 'warn', label: 'Lower than usual range' };
  if (s > 140 || d > 90) return { cls: 'warn', label: 'Higher than usual range' };
  if (s > 130 || d > 85) return { cls: 'mid',  label: 'Slightly elevated' };
  return { cls: 'ok', label: 'Within healthy range' };
}

// ═════════════════════════════════════════════════════════════
// INVENTORY
// ═════════════════════════════════════════════════════════════
function InventoryScreen({ state, setState }) {
  const setBag = (id, v) => setState(s => ({ ...s, bags: { ...s.bags, [id]: Math.max(0, v) } }));
  const setSup = (id, v) => setState(s => ({ ...s, supplies: { ...s.supplies, [id]: Math.max(0, v) } }));

  const supplyMeta = [
    { id: 'caps',     label: 'Caps',              warn: 10, hint: 'Disinfecting caps' },
    { id: 'gauze',    label: 'Gauze pads',        warn: 10, hint: 'Sterile dressings' },
    { id: 'salt',     label: 'Salt water',        warn: 2,  hint: 'For exit site' },
    { id: 'ointment', label: 'Antibiotic ointment', warn: 1, hint: 'Mupirocin' },
    { id: 'big',      label: 'Big bandage',       warn: 5 },
    { id: 'small',    label: 'Small bandage',     warn: 5 },
  ];

  return (
    <div className="page">
      <PageHead title="Inventory" subtitle="Adjust counts as you use or restock" />

      <Card title="Solution bags" subtitle="Tap +/− to adjust">
        <div className="inv-bag-list">
          {BAG_LIST.map(b => {
            const v = state.bags[b.id];
            const low = v < 5;
            return (
              <div key={b.id} className={'inv-bag' + (low ? ' low' : '')} style={{ '--bag': b.color, '--bag-soft': b.soft, '--bag-deep': b.deep }}>
                <div className="inv-bag-left">
                  <span className="bag-dot lg" />
                  <div>
                    <div className="inv-bag-pct">{b.pct}</div>
                    <div className="inv-bag-hint">Warn below 5</div>
                  </div>
                </div>
                <div className="inv-bag-right">
                  <Stepper value={v} onChange={x => setBag(b.id, x)} max={199} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Other supplies">
        <ul className="inv-list">
          {supplyMeta.map(m => {
            const v = state.supplies[m.id];
            const low = v < m.warn;
            return (
              <li key={m.id} className={'inv-row' + (low ? ' low' : '')}>
                <div className="inv-row-info">
                  <div className="inv-row-label">{m.label}{low && <span className="low-tag">{I.warn} low</span>}</div>
                  {m.hint && <div className="inv-row-hint">{m.hint} · warn below {m.warn}</div>}
                </div>
                <Stepper value={v} onChange={x => setSup(m.id, x)} max={199} />
              </li>
            );
          })}
        </ul>
      </Card>

      <button className="primary-btn lg sticky">Save inventory</button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// PREP — info only, no checkboxes (this is a reference card)
// ═════════════════════════════════════════════════════════════
function PrepScreen() {
  const items = [
    'Blue mask',
    '2 caps',
    'Paper towel',
    'Alcohol wipes',
    'Hand sanitizer',
    'Blue clamps',
    'Solution bag',
  ];

  const steps = [
    'Wash hands thoroughly with soap.',
    'Wipe the cart down with an alcohol wipe.',
    'Lay out all supplies on the cart.',
    'Verify the bag — correct concentration, color, volume and expiry date.',
    'Put on the mask.',
    'Place a paper towel under the catheter.',
    'Wipe the connector tip with an alcohol wipe.',
    'Sanitize hands with gel.',
    'Hold the connector securely — by the blue section only — with the tip pointed down.',
    'Open the new bag cap and connect.',
    'Drain, then fill, then disconnect and cap off.',
    'Weigh the drained bag and log the exchange.',
  ];

  return (
    <div className="page">
      <PageHead title="Prep" subtitle="Reference card for the exchange procedure" />

      <Card title="What to prepare">
        <ul className="prep-items">
          {items.map(it => (
            <li key={it} className="prep-item">
              <span className="prep-dot" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Procedure">
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={i} className="step">
              <span className="step-num">{i + 1}</span>
              <span className="step-text">{s}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

window.PDScreens = { LogScreen, InventoryScreen, PrepScreen };
