#!/usr/bin/env node
/**
 * compare-and-report.js
 * Ejecuta a las 3:30 PM: carga snapshot de 1:00 AM, calcula métricas actuales,
 * compara E y F, genera reporte HTML, despliega a Vercel, envía a Slack
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Cargar .env si existe
const envPath = '.env';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && key.trim()) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const TOKEN = process.env.INTERCOM_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('ERROR: INTERCOM_ACCESS_TOKEN env var is required.');
  process.exit(1);
}

const BASE = 'https://api.intercom.io';
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'Intercom-Version': '2.11',
};

const TARGET_INBOXES = [
  'Apolo: Squad PC & FACT',
  'Concorde - Cobros IGIC MKT',
  'Concorde - Memorias no pagadas',
  'Concorde - Ratif Memorias',
  'Concorde: Subsanación de memorias',
  'CS: Squad RRSS',
  'CS: Squad SEO',
  'CS: Squad WEB',
  'Customer Satisfaction',
  'Doble financiación',
  'Fenix - Estado Subvención',
  'Fenix - Ratif Subvenciones',
  'Fenix - Subasanaciones',
  'Recepción',
  'Support',
  'Titan - Firmas',
];

const TEAM_ID_MAP = {
  'Apolo: Squad PC & FACT': 9355465,
  'Concorde - Cobros IGIC MKT': 9245333,
  'Concorde - Memorias no pagadas': 9245549,
  'Concorde - Ratif Memorias': 9529001,
  'Concorde: Subsanación de memorias': 9772162,
  'CS: Squad RRSS': 9568408,
  'CS: Squad SEO': 9568428,
  'CS: Squad WEB': 9568401,
  'Customer Satisfaction': 7941298,
  'Doble financiación': 10363740,
  'Fenix - Estado Subvención': 9562448,
  'Fenix - Ratif Subvenciones': 9245400,
  'Fenix - Subasanaciones': 8770964,
  'Recepción': 10111639,
  'Support': 10111649,
  'Titan - Firmas': 9245536,
};

const PRIORITY_INBOXES = new Set(['Recepción', 'Support']);

async function apiPost(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`${res.status}: ${await res.text()}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getAllTeams() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${BASE}/teams`, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()).teams || [];
  } finally {
    clearTimeout(timeout);
  }
}

function normalize(str) {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

function matchTeam(teams, targetName) {
  const norm = normalize(targetName);
  let found = teams.find(t => normalize(t.name) === norm);
  if (found) return found;
  found = teams.find(t => normalize(t.name).includes(norm) || norm.includes(normalize(t.name)));
  return found || null;
}

async function getConversations(teamId, state) {
  const query = {
    query: {
      operator: 'AND',
      value: [
        { field: 'team_assignee_id', operator: '=', value: teamId },
        { field: 'state', operator: '=', value: state },
      ],
    },
    pagination: { per_page: 100 },
  };

  try {
    const data = await apiPost('/conversations/search', query);
    return data.conversations || [];
  } catch (err) {
    console.error(`    ERROR: ${err.message}`);
    return [];
  }
}

async function main() {
  const today = new Date().toISOString().split('T')[0];

  console.log(`\n3️⃣ REPORTE 3:30 PM - Comparar con foto de 1:00 AM`);

  // Cargar snapshot de 1:00 AM
  const snapshotsDir = './snapshots';
  const metricsFile = path.join(snapshotsDir, `metrics-${today}-1am.json`);

  let baselineMetrics = {};
  if (fs.existsSync(metricsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
      baselineMetrics = data.inboxMetrics;
      console.log(`✓ Snapshot de 1:00 AM cargado: ${metricsFile}\n`);
    } catch (err) {
      console.error(`ERROR: No se pudo cargar snapshot: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.error(`ERROR: Snapshot de 1:00 AM no encontrado: ${metricsFile}`);
    process.exit(1);
  }

  console.log(`Using ${Object.keys(TEAM_ID_MAP).length} teams from configuration\n`);

  const results = [];
  let totalClosedE = 0, totalClosedF = 0;

  for (const inboxName of TARGET_INBOXES) {
    const teamId = TEAM_ID_MAP[inboxName];

    if (!teamId) {
      console.log(`SKIP: "${inboxName}" (ID not configured)`);
      const baseline = baselineMetrics[inboxName] || { A: 0, B: 0, C: 0, D: 0, H: 0 };
      results.push({
        name: inboxName,
        displayName: PRIORITY_INBOXES.has(inboxName) ? inboxName + ' (prioritaria)' : inboxName,
        priority: PRIORITY_INBOXES.has(inboxName),
        teamId: null,
        error: 'Team ID not configured',
        total: 0,
        groups: { A: 0, B: 0, C: 0, D: 0, H: 0 },
        baseline,
        closedE: 0,
        closedF: 0,
      });
      continue;
    }

    process.stdout.write(`  ${inboxName}... `);

    const openConvos = await getConversations(teamId, 'open');
    const snoozedConvos = await getConversations(teamId, 'snoozed');
    const allConvos = [...openConvos, ...snoozedConvos];

    const now = Date.now() / 1000;
    const oneDayAgo = now - (24 * 60 * 60);
    const groups = { A: 0, B: 0, C: 0, D: 0, H: 0 };

    for (const c of allConvos) {
      const isOpen = c.open === true && c.state === 'open';
      const isSnoozed = c.state === 'snoozed';
      const hasAgent = !!c.assignee?.id || !!c.admin_assignee_id;
      const waitingSince = c.waiting_since || c.updated_at;

      if (isOpen && !hasAgent) groups.A++;
      else if (isOpen && hasAgent) groups.B++;
      else if (isSnoozed && !hasAgent) groups.C++;
      else if (isSnoozed && hasAgent) groups.D++;

      if (isSnoozed && waitingSince && waitingSince < oneDayAgo) {
        groups.H++;
      }
    }

    // Calcular E y F como diferencias con baseline
    const baseline = baselineMetrics[inboxName] || { A: 0, B: 0, C: 0, D: 0, H: 0 };
    const closedE = Math.max(0, baseline.A - groups.A); // Cerradas sin agente
    const closedF = Math.max(0, baseline.B - groups.B); // Cerradas con agente

    totalClosedE += closedE;
    totalClosedF += closedF;

    console.log(`${allConvos.length} convos | A:${groups.A} B:${groups.B} C:${groups.C} D:${groups.D} H:${groups.H} | E:${closedE} F:${closedF}`);

    results.push({
      name: inboxName,
      displayName: PRIORITY_INBOXES.has(inboxName) ? inboxName + ' (prioritaria)' : inboxName,
      priority: PRIORITY_INBOXES.has(inboxName),
      teamId,
      teamName: inboxName,
      total: allConvos.length,
      openTotal: openConvos.length,
      snoozedTotal: snoozedConvos.length,
      groups,
      baseline,
      closedE,
      closedF,
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    snapshotTime: '3:30 PM',
    totalConvsScanned: results.reduce((sum, r) => sum + r.total, 0),
    totalClosedE: totalClosedE,
    totalClosedF: totalClosedF,
    inboxes: results,
    unmapped: [],
  };

  fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
  console.log('\n✅ Data saved to data.json');

  // Generar reporte HTML
  console.log('📊 Generating HTML report...');
  try {
    execSync('node generate-report.js', { stdio: 'inherit' });
  } catch (err) {
    console.error('ERROR generating report:', err.message);
    process.exit(1);
  }

  // Desplegar a Vercel directamente (sin ejecutar deploy.js que sobrescribería los datos)
  console.log('🚀 Deploying to Vercel...');
  try {
    const deployOutput = execSync('npx vercel --prod --yes', {
      encoding: 'utf8',
      env: { ...process.env, VERCEL_TOKEN: process.env.VERCEL_TOKEN }
    });
    console.log(deployOutput);

    const urlMatch = deployOutput.match(/Aliased: (https:\/\/\S+)/);
    const deployUrl = urlMatch ? urlMatch[1] : 'https://intercom-report-nine.vercel.app';

    const deployInfo = {
      deployedAt: new Date().toISOString(),
      url: deployUrl,
    };
    fs.writeFileSync('deploy-info.json', JSON.stringify(deployInfo, null, 2));
    console.log(`   Deployment successful: ${deployUrl}`);
  } catch (err) {
    console.error('ERROR deploying:', err.message);
    process.exit(1);
  }

  // Enviar a Slack
  console.log('📤 Sending notification to Slack...');
  const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;
  if (SLACK_WEBHOOK) {
    try {
      const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
      const dateStr = new Date().toLocaleDateString('es-CO');
      const message = `Ver reporte completo con todos los inboxes de ${dateStr}`;

      const payload = {
        text: message,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `<https://intercom-report-nine.vercel.app|${message}>`
            }
          }
        ]
      };

      execSync(`curl -X POST -H 'Content-Type: application/json' -d '${JSON.stringify(payload).replace(/'/g, "'\\''")}' ${SLACK_WEBHOOK}`, { stdio: 'inherit' });
      console.log('✅ Message sent to Slack');
    } catch (err) {
      console.error('WARNING: Could not send to Slack:', err.message);
    }
  } else {
    console.warn('WARNING: SLACK_WEBHOOK not configured, skipping Slack notification');
  }

  console.log('\n✅ Flujo completado: Reporte generado, desplegado y notificado a Slack');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
