#!/usr/bin/env node
/**
 * fetch-data-simple.js - Simplified version that gets first page only per team/state
 */

import fs from 'fs';
import { saveSnapshot } from './snapshots.js';

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

const TEAM_ID_OVERRIDES = {
  'Apolo: Squad PC & FACT': 9355465,
  'Fenix - Subasanaciones': 8770964,
  'Concorde: Subsanación de memorias': 9772162,
};

const PRIORITY_INBOXES = new Set(['Recepción', 'Support']);

async function apiPost(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
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
  const teams = await getAllTeams();
  console.log(`Found ${teams.length} teams\n`);

  const results = [];
  const allConversations = [];

  for (const inboxName of TARGET_INBOXES) {
    let team = matchTeam(teams, inboxName);
    if (!team && TEAM_ID_OVERRIDES[inboxName]) {
      team = teams.find(t => t.id === TEAM_ID_OVERRIDES[inboxName]) ||
             { id: TEAM_ID_OVERRIDES[inboxName], name: inboxName };
    }

    if (!team) {
      console.log(`SKIP: "${inboxName}" (not found)`);
      results.push({
        name: inboxName,
        displayName: PRIORITY_INBOXES.has(inboxName) ? inboxName + ' (prioritaria)' : inboxName,
        priority: PRIORITY_INBOXES.has(inboxName),
        teamId: null,
        error: 'Team not found',
        total: 0,
        groups: { A: 0, B: 0, C: 0, D: 0, H: 0 },
      });
      continue;
    }

    process.stdout.write(`  ${inboxName}... `);

    const openConvos = await getConversations(team.id, 'open');
    // Skip snoozed for now - causing timeouts
    const snoozedConvos = [];
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

    console.log(`${allConvos.length} convos`);

    results.push({
      name: inboxName,
      displayName: PRIORITY_INBOXES.has(inboxName) ? inboxName + ' (prioritaria)' : inboxName,
      priority: PRIORITY_INBOXES.has(inboxName),
      teamId: team.id,
      teamName: team.name,
      total: allConvos.length,
      openTotal: openConvos.length,
      snoozedTotal: snoozedConvos.length,
      groups,
    });
  }

  const snapshot = saveSnapshot(allConversations);

  const output = {
    generatedAt: new Date().toISOString(),
    totalConvsScanned: allConversations.length,
    totalClosedE: 0,
    totalClosedF: 0,
    inboxes: results,
    unmapped: [],
  };

  fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
  console.log('\n✅ Data saved to data.json');
  console.log(`Total conversations: ${allConversations.length}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
