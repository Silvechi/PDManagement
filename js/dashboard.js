// ============================================================
// dashboard.js — Dashboard screen
// ============================================================

// Cached dashboard data exposed to inventory.js
let dashboardData = null;

async function renderDashboard(container) {
  container.innerHTML = `
    <div class="screen-header">
      <h1>Dashboard</h1>
    </div>
    <div id="dash-loading" class="loading-state">Loading data…</div>
    <div id="dash-content" style="display:none"></div>
  `;

  try {
    dashboardData = await API.getDashboard();
    renderDashboardContent(dashboardData);
  } catch (err) {
    document.getElementById('dash-loading').innerHTML =
      `<div class="feedback feedback-error">Failed to load: ${err.message}</div>`;
  }
}

function renderDashboardContent(data) {
  const loading = document.getElementById('dash-loading');
  const content = document.getElementById('dash-content');
  if (loading) loading.style.display = 'none';
  if (content) content.style.display = 'block';

  // ---- Low stock banner ----
  let lowStockBanner = '';
  if (data.lowStockFlags) {
    lowStockBanner = `
      <div class="alert-banner alert-red">
        ⚠ Low stock: ${data.lowStockFlags}
      </div>
    `;
  }

  // ---- Inventory cards ----
  let inventoryCards = '<p class="no-data">No inventory data yet.</p>';
  const config = data.inventoryConfig;
  if (config && config.length && data.inventory) {
    inventoryCards = config.map(item => {
      const count = data.inventory[item.name] ?? 0;
      const min   = item.min || 0;
      const statusClass = count < min
        ? 'inv-card-red'
        : count < min * 2
          ? 'inv-card-yellow'
          : 'inv-card-green';
      const matchedType = Object.keys(BAG_TYPE_COLORS).find(t => item.name.includes(t)) || null;
      const dot   = matchedType ? bagDotHtml(matchedType) : '';
      const label = matchedType ? matchedType + ' bag' : item.name;
      return `
        <div class="inv-card ${statusClass}">
          <span class="inv-card-label" dir="auto">${dot}${label}</span>
          <span class="inv-card-count">${count}</span>
        </div>
      `;
    }).join('');
  }

  // ---- BP summary ----
  let bpHtml = '<p class="no-data">No BP data yet.</p>';
  const bpRecent = data.bpRecent || [];
  if (bpRecent.length || data.bpAvg) {
    const rows = bpRecent.map(r => `
      <div class="bp-reading-row">
        <span class="bp-reading-date">${r.time || String(r.date).slice(5)}</span>
        <span class="bp-reading-val">${r.systolic} / ${r.diastolic}</span>
      </div>
    `).join('');
    const avgRow = data.bpAvg ? `
      <div class="bp-reading-row bp-avg">
        <span class="bp-reading-date">Avg</span>
        <span class="bp-reading-val">${data.bpAvg.systolic} / ${data.bpAvg.diastolic}</span>
        <span class="bp-reading-unit">mmHg</span>
      </div>
    ` : '';
    bpHtml = `
      <div class="stat-card stat-card-col">
        <span class="stat-label">Blood Pressure</span>
        <div class="bp-readings">${rows}${avgRow}</div>
      </div>
    `;
  }

  // ---- Weight trend chart ----
  let chartHtml = '<p class="no-data">No weight data yet.</p>';
  if (data.weightTrend && data.weightTrend.length > 0) {
    chartHtml = buildWeightChart(data.weightTrend);
  }

  content.innerHTML = `
    ${lowStockBanner}

    <section class="dash-section">
      <h2 class="section-title">Inventory</h2>
      <div class="inv-card-grid">${inventoryCards}</div>
    </section>

    <section class="dash-section">
      <h2 class="section-title">Vitals</h2>
      ${bpHtml}
    </section>

    <section class="dash-section">
      <h2 class="section-title">Weight Trend (last 7 entries)</h2>
      ${chartHtml}
    </section>
  `;
}

// ============================================================
// Mini bar chart (pure SVG, no dependencies)
// ============================================================

function buildWeightChart(trend) {
  // Filter out entries with no weight
  const entries = trend.filter(e => e.weight !== '' && e.weight !== null && !isNaN(parseFloat(e.weight)));
  if (entries.length === 0) return '<p class="no-data">No weight data yet.</p>';

  const values  = entries.map(e => parseFloat(e.weight));
  const labels  = entries.map(e => String(e.date).slice(5)); // MM-DD
  const minVal  = Math.min(...values);
  const maxVal  = Math.max(...values);
  const range   = maxVal - minVal || 1;

  const chartW  = 340;
  const chartH  = 120;
  const padL    = 40;
  const padR    = 25;
  const padT    = 10;
  const padB    = 28;
  const innerW  = chartW - padL - padR;
  const innerH  = chartH - padT - padB;
  const n       = entries.length;
  const step    = n > 1 ? innerW / (n - 1) : innerW / 2;

  const points = values.map((v, i) => {
    const x = padL + (n > 1 ? i * step : innerW / 2);
    const y = padT + innerH - ((v - minVal) / range) * innerH;
    return { x, y, v, label: labels[i] };
  });

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

  // Y-axis labels
  const yLabels = [minVal, (minVal + maxVal) / 2, maxVal].map(v => Math.round(v * 10) / 10);

  const yAxisSvg = yLabels.map((v, i) => {
    const y = padT + innerH - (i / 2) * innerH;
    return `<text x="${padL - 4}" y="${y + 4}" text-anchor="end" class="chart-label">${v}</text>`;
  }).join('');

  const dotsAndLabels = points.map((p, i) => `
    <circle cx="${p.x}" cy="${p.y}" r="5" class="chart-dot"/>
    <text x="${p.x}" y="${chartH - padB + 16}" text-anchor="middle" class="chart-label">${p.label}</text>
  `).join('');

  return `
    <div class="chart-wrapper">
      <svg viewBox="0 0 ${chartW} ${chartH}" class="weight-chart" role="img"
           aria-label="Weight trend chart">
        <!-- Grid line at middle -->
        <line x1="${padL}" y1="${padT + innerH / 2}" x2="${chartW - padR}" y2="${padT + innerH / 2}"
              class="chart-grid"/>
        <!-- Trend line -->
        <polyline points="${polyline}" class="chart-line" fill="none"/>
        <!-- Y labels -->
        ${yAxisSvg}
        <!-- Dots and X labels -->
        ${dotsAndLabels}
      </svg>
      <p class="chart-unit">kg</p>
    </div>
  `;
}
