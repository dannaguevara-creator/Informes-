/**
 * fetch-data.js
 * Fetches all open + snoozed conversations from Intercom for target inboxes.
 * Saves results to data.json for report generation.
 *
 * Required env var: INTERCOM_ACCESS_TOKEN
 */

import fs from 'fs';
import { saveSnapshot, getLastSnapshot, calculateClosedConversations } from './snapshots.js';

const TOKEN = process.env.INTERCOM_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('ERROR: INTERCOM_ACCESS_TOKEN env var is required.');
  console.error('Get it from: Intercom > Settings > Integrations > Developer Hub > Access Tokens');
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

async function apiGet(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${BASE}${path}`, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GET ${path} → ${res.status}: ${body}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function apiPost(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`POST ${path} → ${res.status}: ${txt}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getAllTeams() {
  console.log('→ Fetching teams list...');
  const data = await apiGet('/teams');
  return data.teams || [];
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

async function fetchConversationsForTeam(teamId, state) {
  const conversations = [];
  let startingAfter = null;
  let page = 1;

  try {
    while (true) {
      process.stdout.write(`    page ${page}...`);
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
      if (startingAfter) query.pagination.starting_after = startingAfter;

      const data = await apiPost('/conversations/search', query);
      const convos = data.conversations || [];
      conversations.push(...convos);
      process.stdout.write(` ${convos.length} convs\n`);

      const next = data.pages?.next;
      if (!next || convos.length === 0) break;
      startingAfter = next.starting_after;
      page++;
    }
  } catch (err) {
    console.error(`\n    ERROR fetching team ${teamId} state ${state}: ${err.message}`);
  }

  return conversations;
}

function categorize(conversations) {
  const groups = { A: [], B: [], C: [], D: [], H: [] };
  const now = Date.now() / 1000;
  const oneDayAgo = now - (24 * 60 * 60);

  for (const c of conversations) {
    const isOpen = c.open === true && c.state === 'open';
    const isSnoozed = c.state === 'snoozed';
    const hasAgent = !!c.assignee?.id || !!c.admin_assignee_id;
    const waitingSince = c.waiting_since || c.updated_at;

    if (isOpen && !hasAgent) groups.A.push(c.id);
    else if (isOpen && hasAgent) groups.B.push(c.id);
    else if (isSnoozed && !hasAgent) groups.C.push(c.id);
    else if (isSnoozed && hasAgent) groups.D.push(c.id);

    if (isSnoozed && waitingSince && waitingSince < oneDayAgo) {
      groups.H.push(c.id);
    }
  }

  return groups;
}

async function main() {
  const teams = await getAllTeams();
  console.log(`→ Found ${teams.length} teams in workspace\n`);

  const results = [];
  const unmapped = [];
  const allConversations = [];

  for (const inboxName of TARGET_INBOXES) {
    let team = matchTeam(teams, inboxName);

    if (!team && TEAM_ID_OVERRIDES[inboxName]) {
      const teamId = TEAM_ID_OVERRIDES[inboxName];
      team = teams.find(t => t.id === teamId) || { id: teamId, name: inboxName };
    }

    if (!team) {
      console.warn(`  ⚠  No team found matching: "${inboxName}"`);
      unmapped.push(inboxName);
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

    console.log(`  ✓  "${inboxName}" → team ID ${team.id} (${team.name})`);

    console.log(`    Fetching open conversations...`);
    const openConvos = await fetchConversationsForTeam(team.id, 'open');
    console.log(`    Fetching snoozed conversations...`);
    const snoozedConvos = await fetchConversationsForTeam(team.id, 'snoozed');

    const allConvos = [...openConvos, ...snoozedConvos];
    allConversations.push(...allConvos);

    const groups = categorize(allConvos);
    const total = allConvos.length;

    results.push({
      name: inboxName,
      displayName: PRIORITY_INBOXES.has(inboxName) ? inboxName + ' (prioritaria)' : inboxName,
      priority: PRIORITY_INBOXES.has(inboxName),
      teamId: team.id,
      teamName: team.name,
      total,
      openTotal: openConvos.length,
      snoozedTotal: snoozedConvos.length,
      groups: {
        A: groups.A.length,
        B: groups.B.length,
        C: groups.C.length,
        D: groups.D.length,
        H: groups.H.length,
      },
    });

    console.log(`    → Total: ${total} (open: ${openConvos.length}, snoozed: ${snoozedConvos.length})`);
    console.log(`    → A=${groups.A.length} B=${groups.B.length} C=${groups.C.length} D=${groups.D.length} H=${groups.H.length}\n`);
  }

  const currentSnapshot = saveSnapshot(allConversations);
  const lastSnapshot = getLastSnapshot();
  const previousSnapshot = lastSnapshot && lastSnapshot.timestamp !== currentSnapshot.timestamp ? lastSnapshot : null;
  const { closedE, closedF } = calculateClosedConversations(previousSnapshot, allConversations);

  const enhancedResults = results.map(inbox => ({
    ...inbox,
    closedE,
    closedF,
  }));

  const output = {
    generatedAt: new Date().toISOString(),
    totalConvsScanned: allConversations.length,
    totalClosedE: closedE,
    totalClosedF: closedF,
    inboxes: enhancedResults,
    unmapped,
  };

  fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
  console.log('\n✅ Data saved to data.json');
  if (closedE > 0 || closedF > 0) {
    console.log(`   ✓ Closed conversaciones (sin agente): ${closedE}`);
    console.log(`   ✓ Closed conversaciones (con agente): ${closedF}`);
  }

  if (unmapped.length > 0) {
    console.warn('\n⚠  Unmapped inboxes:', unmapped.join(', '));
    console.warn('   Check team names in your Intercom workspace match exactly.');
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
