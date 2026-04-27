/**
 * generate-report.js
 * Reads data.json and produces index.html with the visual report.
 */

import fs from 'fs';

const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

function fmt(n) {
  return String(n).padStart(2, ' ');
}

function pct(n, total) {
  if (!total) return '0%';
  return Math.round((n / total) * 100) + '%';
}

const now = new Date(data.generatedAt);
const dateStr = now.toLocaleDateString('es-ES', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
});
const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

const totalConvs = data.inboxes.reduce((s, i) => s + i.total, 0);
const totalOpen = data.inboxes.reduce((s, i) => s + (i.openTotal || 0), 0);
const totalSnoozed = data.inboxes.reduce((s, i) => s + (i.snoozedTotal || 0), 0);
const totalA = data.inboxes.reduce((s, i) => s + (i.groups?.A || 0), 0);
const totalB = data.inboxes.reduce((s, i) => s + (i.groups?.B || 0), 0);
const totalC = data.inboxes.reduce((s, i) => s + (i.groups?.C || 0), 0);
const totalD = data.inboxes.reduce((s, i) => s + (i.groups?.D || 0), 0);
const totalE = data.totalClosedE || 0;
const totalF = data.totalClosedF || 0;
const totalH = data.inboxes.reduce((s, i) => s + (i.groups?.H || 0), 0);

function inboxCard(inbox) {
  const { displayName, priority, total, openTotal = 0, snoozedTotal = 0, groups = {}, closedE = 0, closedF = 0, baseline = {}, error } = inbox;
  const A = groups.A || 0;
  const B = groups.B || 0;
  const C = groups.C || 0;
  const D = groups.D || 0;
  const H = groups.H || 0;

  const cardClass = priority ? 'card card-priority' : 'card';
  const badge = priority ? '<span class="priority-badge">PRIORITARIA</span>' : '';
  const errorNote = error ? `<div class="error-note">⚠ ${error}</div>` : '';

  // Progress bars widths
  const barA = total ? Math.round((A / total) * 100) : 0;
  const barB = total ? Math.round((B / total) * 100) : 0;
  const barC = total ? Math.round((C / total) * 100) : 0;
  const barD = total ? Math.round((D / total) * 100) : 0;

  // Porcentajes de E y F basados en baseline (foto de 1:00 AM)
  const closedE_pct = baseline.A > 0 ? Math.round((closedE / baseline.A) * 100) : 0;
  const closedF_pct = baseline.B > 0 ? Math.round((closedF / baseline.B) * 100) : 0;
  const H_pct = snoozedTotal > 0 ? Math.round((H / snoozedTotal) * 100) : 0;

  return `
    <div class="${cardClass}">
      <div class="card-header">
        <div class="card-title">
          ${badge}
          <span class="inbox-name">${displayName}</span>
        </div>
        <div class="card-total">
          <span class="total-number">${total}</span>
          <span class="total-label">conversaciones</span>
        </div>
      </div>
      ${errorNote}
      <div class="card-summary">
        <span class="summary-pill open-pill">📬 ${openTotal} abiertas</span>
        <span class="summary-pill snooze-pill">😴 ${snoozedTotal} aplazadas</span>
      </div>
      <div class="groups-grid">
        <div class="group group-a">
          <div class="group-header">
            <span class="group-label">Grupo A</span>
            <span class="group-desc">Abiertas sin agente</span>
          </div>
          <div class="group-count">${A}</div>
          <div class="progress-bar"><div class="progress-fill fill-a" style="width:${barA}%"></div></div>
          <div class="group-pct">${pct(A, total)}</div>
        </div>
        <div class="group group-b">
          <div class="group-header">
            <span class="group-label">Grupo B</span>
            <span class="group-desc">Abiertas con agente</span>
          </div>
          <div class="group-count">${B}</div>
          <div class="progress-bar"><div class="progress-fill fill-b" style="width:${barB}%"></div></div>
          <div class="group-pct">${pct(B, total)}</div>
        </div>
        <div class="group group-c">
          <div class="group-header">
            <span class="group-label">Grupo C</span>
            <span class="group-desc">Aplazadas sin agente</span>
          </div>
          <div class="group-count">${C}</div>
          <div class="progress-bar"><div class="progress-fill fill-c" style="width:${barC}%"></div></div>
          <div class="group-pct">${pct(C, total)}</div>
        </div>
        <div class="group group-d">
          <div class="group-header">
            <span class="group-label">Grupo D</span>
            <span class="group-desc">Aplazadas con agente</span>
          </div>
          <div class="group-count">${D}</div>
          <div class="progress-bar"><div class="progress-fill fill-d" style="width:${barD}%"></div></div>
          <div class="group-pct">${pct(D, total)}</div>
        </div>
      </div>
      <div class="closed-groups">
        <div class="closed-group closed-e">
          <div class="closed-header">Grupo E: Cerrados día</div>
          <div class="closed-count">${closedE}</div>
          <div class="closed-pct">${closedE_pct}%</div>
        </div>
        <div class="closed-group closed-f">
          <div class="closed-header">Grupo F: Cerrados día</div>
          <div class="closed-count">${closedF}</div>
          <div class="closed-pct">${closedF_pct}%</div>
        </div>
        <div class="closed-group closed-h">
          <div class="closed-header">Grupo H: Aplazadas +1 día</div>
          <div class="closed-count">${H}</div>
          <div class="closed-pct">${H_pct}%</div>
        </div>
      </div>
    </div>`;
}

// Sort: priority first, then by total desc
const sorted = [...data.inboxes].sort((a, b) => {
  if (a.priority !== b.priority) return b.priority ? 1 : -1;
  return b.total - a.total;
});

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Intercom Inbox Report — ${dateStr}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0f1117;
      --bg2: #1a1d26;
      --bg3: #22263a;
      --border: #2e3350;
      --text: #e8eaf6;
      --text-muted: #8892b0;
      --accent: #6c8cff;
      --green: #43e097;
      --orange: #ffb347;
      --purple: #c084fc;
      --red: #ff6b6b;
      --priority-glow: 0 0 0 2px #6c8cff44, 0 4px 24px #6c8cff22;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh;
      padding: 2rem 1rem 4rem;
    }

    /* Header */
    .header {
      max-width: 1400px;
      margin: 0 auto 2.5rem;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
    }
    .header-left h1 {
      font-size: 1.75rem;
      font-weight: 700;
      background: linear-gradient(90deg, #6c8cff, #c084fc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .header-left .subtitle {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-top: 0.3rem;
    }
    .header-right {
      text-align: right;
      color: var(--text-muted);
      font-size: 0.85rem;
    }
    .header-right .datetime {
      font-size: 0.95rem;
      color: var(--text);
      font-weight: 500;
    }

    /* KPI bar */
    .kpi-bar {
      max-width: 1400px;
      margin: 0 auto 2.5rem;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 1rem;
    }
    .kpi {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.1rem 1.25rem;
      text-align: center;
    }
    .kpi-value {
      font-size: 2rem;
      font-weight: 700;
      line-height: 1;
    }
    .kpi-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.4rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .kpi-total .kpi-value { color: var(--accent); }
    .kpi-open .kpi-value  { color: var(--green); }
    .kpi-snooze .kpi-value { color: var(--orange); }
    .kpi-a .kpi-value { color: var(--red); }
    .kpi-b .kpi-value { color: var(--green); }
    .kpi-c .kpi-value { color: var(--orange); }
    .kpi-d .kpi-value { color: var(--purple); }
    .kpi-e .kpi-value { color: var(--red); }
    .kpi-f .kpi-value { color: var(--green); }
    .kpi-h .kpi-value { color: var(--orange); }

    /* Legend */
    .legend {
      max-width: 1400px;
      margin: 0 auto 2rem;
      display: flex;
      gap: 1.5rem;
      flex-wrap: wrap;
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .legend-item { display: flex; align-items: center; gap: 0.4rem; }
    .legend-dot {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
    }
    .dot-a { background: var(--red); }
    .dot-b { background: var(--green); }
    .dot-c { background: var(--orange); }
    .dot-d { background: var(--purple); }

    /* Cards grid */
    .cards-grid {
      max-width: 1400px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      gap: 1.25rem;
    }

    .card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.5rem;
      transition: border-color 0.2s;
    }
    .card:hover { border-color: var(--accent); }

    .card-priority {
      border-color: var(--accent);
      box-shadow: var(--priority-glow);
      background: linear-gradient(135deg, #1a1d2e 0%, #1e2040 100%);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
      gap: 0.5rem;
    }
    .card-title {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      flex: 1;
    }
    .priority-badge {
      display: inline-block;
      background: linear-gradient(90deg, #6c8cff22, #c084fc22);
      border: 1px solid var(--accent);
      color: var(--accent);
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      width: fit-content;
    }
    .inbox-name {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text);
      line-height: 1.3;
    }
    .card-total {
      text-align: right;
      flex-shrink: 0;
    }
    .total-number {
      display: block;
      font-size: 2.25rem;
      font-weight: 800;
      color: var(--accent);
      line-height: 1;
    }
    .total-label {
      font-size: 0.7rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .card-summary {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
    }
    .summary-pill {
      font-size: 0.75rem;
      padding: 0.25rem 0.65rem;
      border-radius: 20px;
      font-weight: 500;
    }
    .open-pill   { background: #43e09722; color: var(--green); border: 1px solid #43e09744; }
    .snooze-pill { background: #ffb34722; color: var(--orange); border: 1px solid #ffb34744; }

    .groups-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    .group {
      background: var(--bg3);
      border-radius: 10px;
      padding: 0.85rem;
    }
    .group-header {
      display: flex;
      flex-direction: column;
      margin-bottom: 0.5rem;
    }
    .group-label {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .group-desc {
      font-size: 0.68rem;
      color: var(--text-muted);
      margin-top: 0.1rem;
    }
    .group-a .group-label { color: var(--red); }
    .group-b .group-label { color: var(--green); }
    .group-c .group-label { color: var(--orange); }
    .group-d .group-label { color: var(--purple); }

    .group-count {
      font-size: 1.6rem;
      font-weight: 800;
      line-height: 1;
      margin-bottom: 0.4rem;
    }
    .group-a .group-count { color: var(--red); }
    .group-b .group-count { color: var(--green); }
    .group-c .group-count { color: var(--orange); }
    .group-d .group-count { color: var(--purple); }

    .progress-bar {
      height: 4px;
      background: var(--bg);
      border-radius: 2px;
      margin-bottom: 0.3rem;
      overflow: hidden;
    }
    .progress-fill { height: 100%; border-radius: 2px; transition: width 0.6s ease; }
    .fill-a { background: var(--red); }
    .fill-b { background: var(--green); }
    .fill-c { background: var(--orange); }
    .fill-d { background: var(--purple); }

    .group-pct {
      font-size: 0.68rem;
      color: var(--text-muted);
    }

    .closed-groups {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 0.75rem;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
    }

    .closed-group {
      background: var(--bg3);
      border-radius: 10px;
      padding: 0.85rem;
      text-align: center;
    }

    .closed-e {
      border-left: 3px solid var(--red);
    }

    .closed-f {
      border-left: 3px solid var(--green);
    }

    .closed-h {
      border-left: 3px solid var(--orange);
    }

    .closed-header {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
    }

    .closed-count {
      font-size: 1.6rem;
      font-weight: 800;
      line-height: 1;
      margin-bottom: 0.3rem;
    }

    .closed-e .closed-count {
      color: var(--red);
    }

    .closed-f .closed-count {
      color: var(--green);
    }

    .closed-h .closed-count {
      color: var(--orange);
    }

    .closed-pct {
      font-size: 0.68rem;
      color: var(--text-muted);
    }

    .error-note {
      font-size: 0.78rem;
      color: var(--orange);
      background: #ffb34711;
      border: 1px solid #ffb34733;
      border-radius: 6px;
      padding: 0.4rem 0.65rem;
      margin-bottom: 0.75rem;
    }

    /* Footer */
    .footer {
      max-width: 1400px;
      margin: 3rem auto 0;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
      text-align: center;
      color: var(--text-muted);
      font-size: 0.8rem;
    }

    @media (max-width: 600px) {
      .cards-grid { grid-template-columns: 1fr; }
      .groups-grid { grid-template-columns: 1fr 1fr; }
      .header { flex-direction: column; align-items: flex-start; }
      .header-right { text-align: left; }
    }
  </style>
</head>
<body>

  <header class="header">
    <div class="header-left">
      <h1>Intercom Inbox Report</h1>
      <p class="subtitle">Estado de conversaciones por bandeja de entrada — ORBIDI</p>
    </div>
    <div class="header-right">
      <div class="datetime">${dateStr}</div>
      <div>Generado a las ${timeStr}</div>
    </div>
  </header>

  <div class="kpi-bar">
    <div class="kpi kpi-total">
      <div class="kpi-value">${totalConvs}</div>
      <div class="kpi-label">Total</div>
    </div>
    <div class="kpi kpi-open">
      <div class="kpi-value">${totalOpen}</div>
      <div class="kpi-label">Abiertas</div>
    </div>
    <div class="kpi kpi-snooze">
      <div class="kpi-value">${totalSnoozed}</div>
      <div class="kpi-label">Aplazadas</div>
    </div>
    <div class="kpi kpi-a">
      <div class="kpi-value">${totalA}</div>
      <div class="kpi-label">Grupo A</div>
    </div>
    <div class="kpi kpi-b">
      <div class="kpi-value">${totalB}</div>
      <div class="kpi-label">Grupo B</div>
    </div>
    <div class="kpi kpi-c">
      <div class="kpi-value">${totalC}</div>
      <div class="kpi-label">Grupo C</div>
    </div>
    <div class="kpi kpi-d">
      <div class="kpi-value">${totalD}</div>
      <div class="kpi-label">Grupo D</div>
    </div>
    <div class="kpi kpi-e">
      <div class="kpi-value">${totalE}</div>
      <div class="kpi-label">Grupo E</div>
    </div>
    <div class="kpi kpi-f">
      <div class="kpi-value">${totalF}</div>
      <div class="kpi-label">Grupo F</div>
    </div>
    <div class="kpi kpi-h">
      <div class="kpi-value">${totalH}</div>
      <div class="kpi-label">Grupo H</div>
    </div>
  </div>

  <div class="legend">
    <div class="legend-item"><div class="legend-dot dot-a"></div> Grupo A — Abiertas SIN agente</div>
    <div class="legend-item"><div class="legend-dot dot-b"></div> Grupo B — Abiertas CON agente</div>
    <div class="legend-item"><div class="legend-dot dot-c"></div> Grupo C — Aplazadas SIN agente</div>
    <div class="legend-item"><div class="legend-dot dot-d"></div> Grupo D — Aplazadas CON agente</div>
    <div class="legend-item"><div class="legend-dot dot-a"></div> Grupo E — Cerradas SIN agente</div>
    <div class="legend-item"><div class="legend-dot dot-b"></div> Grupo F — Cerradas CON agente</div>
    <div class="legend-item"><div class="legend-dot dot-c"></div> Grupo H — Aplazadas +1 día</div>
  </div>

  <div class="cards-grid">
    ${sorted.map(inboxCard).join('')}
  </div>

  <footer class="footer">
    Informe generado automáticamente · ${dateStr} ${timeStr} · Datos en tiempo real de Intercom
  </footer>

</body>
</html>`;

fs.writeFileSync('index.html', html);
console.log('✅ index.html generado correctamente');
console.log(`   ${data.inboxes.length} inboxes · ${totalConvs} conversaciones totales`);
