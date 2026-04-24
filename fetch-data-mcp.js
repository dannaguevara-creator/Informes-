/**
 * fetch-data-mcp.js
 * Fetches all open + snoozed conversations from Intercom using MCP connector.
 * Uses search_conversations tool from Intercom MCP.
 */

import fs from 'fs';
import { saveSnapshot, getLastSnapshot, calculateClosedConversations } from './snapshots.js';

// MCP tool interface (would be called via the actual MCP connector)
// For now, this is a placeholder that would use the actual MCP tools
// In a real remote agent environment, these would be available directly

const PRIORITY_INBOXES = new Set(['Recepción', 'Support']);

const TARGET_INBOXES = [
  'Apolo: Squad PC & FACT',
  'Concorde - Cobros IGIC MKT',
  'Concorde - Memorias no pagadas',
  'Concorde - Ratif Memorias',
  'Concorde: Subsanación de morias',
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

// This function would use the MCP search_conversations tool
async function searchConversations(query) {
  // In a remote agent with MCP, this would call:
  // const result = await mcp.search_conversations(query);
  // For now, we'll use a helper that imports and calls the actual tool

  // This is a placeholder - in the remote agent, the actual MCP tool would be used
  console.log(`Searching conversations with query:`, JSON.stringify(query, null, 2));

  // Normally this would come from the MCP tool
  return { data: [], pages: {} };
}

async function main() {
  console.log('📡 Fetching Intercom data via MCP connector...\n');

  const results = [];
  const unmapped = [];
  const allConversations = [];

  for (const inboxName of TARGET_INBOXES) {
    console.log(`Fetching: ${inboxName}`);

    // Query for open conversations
    const openQuery = `object_type:conversations team_assignee_id:* state:open`;
    const openData = await searchConversations(openQuery);

    // Query for snoozed conversations
    const snoozedQuery = `object_type:conversations team_assignee_id:* state:snoozed`;
    const snoozedData = await searchConversations(snoozedQuery);

    const openConvos = openData.data || [];
    const snoozedConvos = snoozedData.data || [];
    const allConvos = [...openConvos, ...snoozedConvos];

    allConversations.push(...allConvos);

    const groups = {
      A: openConvos.filter(c => !c.admin_assignee_id).length,
      B: openConvos.filter(c => c.admin_assignee_id).length,
      C: snoozedConvos.filter(c => !c.admin_assignee_id).length,
      D: snoozedConvos.filter(c => c.admin_assignee_id).length,
    };

    results.push({
      name: inboxName,
      displayName: PRIORITY_INBOXES.has(inboxName) ? inboxName + ' (prioritaria)' : inboxName,
      priority: PRIORITY_INBOXES.has(inboxName),
      teamId: null,
      total: allConvos.length,
      openTotal: openConvos.length,
      snoozedTotal: snoozedConvos.length,
      groups,
    });

    console.log(`  ✓ ${allConvos.length} total (open: ${openConvos.length}, snoozed: ${snoozedConvos.length})`);
  }

  // Save snapshot and calculate closed
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
    inboxes: enhancedResults,
    unmapped,
    totalClosedE: closedE,
    totalClosedF: closedF,
  };

  fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
  console.log('\n✅ Data saved to data.json');
  console.log(`   Timestamp: ${output.generatedAt}`);
  if (closedE > 0 || closedF > 0) {
    console.log(`   ✓ Closed sin agente: ${closedE}`);
    console.log(`   ✓ Closed con agente: ${closedF}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
