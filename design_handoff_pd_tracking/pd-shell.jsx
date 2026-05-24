// PD Tracking — App shell: nav + routing + seed data

const { useState, useEffect, useRef } = React;
const { I } = window.PD;
const { Dashboard } = window.PDDash;
const { LogScreen, InventoryScreen, PrepScreen } = window.PDScreens;

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: I.home },
  { id: 'log',       label: 'Log',       icon: I.log },
  { id: 'inventory', label: 'Inventory', icon: I.box },
  { id: 'prep',      label: 'Prep',      icon: I.prep },
];

function makeSeed() {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return {
    bags: { low: 54, med: 17, high: 4 },
    supplies: { caps: 45, gauze: 60, salt: 60, ointment: 3, big: 20, small: 10 },
    vitals: Array.from({ length: 9 }, (_, i) => ({
      sys: 118 + (i % 3) * 4,
      dia: 76 + (i % 3) * 3,
      at: now - (9 - i) * 6 * 60 * 60 * 1000,
    })),
    weight: Array.from({ length: 7 }, (_, i) => ({
      kg: 64.8 + Math.sin(i * 0.8) * 0.6 + i * 0.05,
      at: now - (6 - i) * day,
    })),
    log: [
      { bag: 'low',  drained: 2.3, at: now - 2  * 60 * 60 * 1000 },
      { bag: 'med',  drained: 2.1, at: now - 8  * 60 * 60 * 1000 },
      { bag: 'low',  drained: 2.2, at: now - 14 * 60 * 60 * 1000 },
      { bag: 'high', drained: 2.4, at: now - 20 * 60 * 60 * 1000 },
      { bag: 'low',  drained: 2.0, at: now - 26 * 60 * 60 * 1000 },
    ],
  };
}

function PDApp({ frame = 'desktop' }) {
  const [tab, setTab] = useState('dashboard');
  const [state, setState] = useState(makeSeed);
  const ref = useRef(null);

  // bottom nav for narrow containers, top tabs for wider
  return (
    <div ref={ref} className={'pd-root pd-frame-' + frame} data-tab={tab}>
      {/* Top bar (visible on desktop/tablet) */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <span className="brand-name">PD<span className="brand-light"> · daily</span></span>
        </div>
        <nav className="topnav">
          {TABS.map(t => (
            <button key={t.id} className={'topnav-btn' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <button className="icon-btn" title="Profile">
            <span className="avatar">Y</span>
          </button>
        </div>
      </header>

      <main className="content">
        {tab === 'dashboard' && <Dashboard state={state} go={setTab} />}
        {tab === 'log'       && <LogScreen state={state} setState={setState} />}
        {tab === 'inventory' && <InventoryScreen state={state} setState={setState} />}
        {tab === 'prep'      && <PrepScreen />}
      </main>

      {/* Bottom nav (visible on phone) */}
      <nav className="botnav">
        {TABS.map(t => (
          <button key={t.id} className={'botnav-btn' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

window.PDApp = PDApp;
