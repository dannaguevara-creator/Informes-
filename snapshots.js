/**
 * snapshots.js
 * Manages conversation snapshots for comparing closed conversations day-over-day.
 */

import fs from 'fs';
import path from 'path';

const SNAPSHOTS_DIR = './snapshots';

// Ensure snapshots directory exists
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

export function saveSnapshot(conversations) {
  const timestamp = new Date().toISOString();
  const filename = `snapshot-${new Date().toISOString().split('T')[0]}-${Date.now()}.json`;
  const filepath = path.join(SNAPSHOTS_DIR, filename);

  const snapshot = {
    timestamp,
    conversations: conversations.map(c => ({
      id: c.id,
      state: c.state,
      team_assignee_id: c.team_assignee_id,
      admin_assignee_id: c.admin_assignee_id || null,
    })),
  };

  fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2));
  console.log(`✓ Snapshot saved: ${filename}`);
  return snapshot;
}

export function getLastSnapshot() {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    return null;
  }

  const files = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.startsWith('snapshot-'));
  if (files.length === 0) return null;

  files.sort().reverse();
  const filepath = path.join(SNAPSHOTS_DIR, files[0]);
  const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  return data;
}

export function calculateClosedConversations(previousSnapshot, currentConversations) {
  if (!previousSnapshot) {
    return { E: [], F: [], closedE: 0, closedF: 0 };
  }

  const currentIds = new Set(currentConversations.map(c => c.id));

  // Conversations that were in previous snapshot but are not in current (closed or deleted)
  const closedIds = previousSnapshot.conversations.filter(c => !currentIds.has(c.id));

  const closedE = closedIds.filter(c => c.state === 'open' && !c.admin_assignee_id).length;
  const closedF = closedIds.filter(c => c.state === 'open' && c.admin_assignee_id).length;

  return {
    E: closedIds.filter(c => c.state === 'open' && !c.admin_assignee_id),
    F: closedIds.filter(c => c.state === 'open' && c.admin_assignee_id),
    closedE,
    closedF,
  };
}
