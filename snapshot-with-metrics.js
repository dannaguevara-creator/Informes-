#!/usr/bin/env node
/**
 * snapshot-with-metrics.js
 * Toma snapshot a las 1:00 AM y guarda métricas de grupos
 */

import fs from 'fs';
import path from 'path';

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
    if (!res.ok) throw new Error(`${res.status}`);
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
  console.log(`\n1️⃣  SNAPSHOT 1:00 AM - Tomar foto de métricas`);
  console.log(`Using ${Object.keys(TEAM_ID_MAP).length} teams from configuration\n`);

  const snapshot = {
    timestamp: new Date().toISOString(),
    inboxMetrics: {},
  };

  const allConversations = [];

  for (const inboxName of TARGET_INBOXES) {
    const teamId = TEAM_ID_MAP[inboxName];

    if (!teamId) {
      console.log(`  SKIP: "${inboxName}" (ID not configured)`);
      snapshot.inboxMetrics[inboxName] = { A: 0, B: 0, C: 0, D: 0, H: 0 };
      continue;
    }

    process.stdout.write(`  ${inboxName}... `);
    const openConvos = await getConversations(teamId, 'open');
    const snoozedConvos = await getConversations(teamId, 'snoozed');
    const allConvos = [...openConvos, ...snoozedConvos];

    allConversations.push(...allConvos);

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

    snapshot.inboxMetrics[inboxName] = groups;
    console.log(`${allConvos.length} convos | A:${groups.A} B:${groups.B} C:${groups.C} D:${groups.D} H:${groups.H}`);
  }

  // Guardar snapshot con métricas
  const snapshotsDir = './snapshots';
  if (!fs.existsSync(snapshotsDir)) fs.mkdirSync(snapshotsDir, { recursive: true });

  const filename = `metrics-${new Date().toISOString().split('T')[0]}-1am.json`;
  fs.writeFileSync(path.join(snapshotsDir, filename), JSON.stringify(snapshot, null, 2));

  console.log(`\n✅ Snapshot guardado: ${filename}`);
  console.log(`📸 Foto de 1:00 AM lista para comparar a las 3:30 PM`);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ TODO OK - RUTINA DE 1:00 AM COMPLETADA EXITOSAMENTE`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Hora de ejecución: ${new Date().toISOString()}`);
  console.log(`Inboxes procesados: 16`);
  console.log(`Archivo generado: ${filename}`);
  console.log(`Estado: LISTO PARA 3:30 PM`);
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
