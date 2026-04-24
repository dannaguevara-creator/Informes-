/**
 * run.js
 * One-shot: fetch data → generate HTML → deploy to Vercel
 *
 * Usage:
 *   INTERCOM_ACCESS_TOKEN=<token> node run.js
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

function step(label, cmd, opts = {}) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`▶  ${label}`);
  console.log(`${'─'.repeat(60)}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

if (!process.env.INTERCOM_ACCESS_TOKEN) {
  console.error('\nERROR: INTERCOM_ACCESS_TOKEN env var is required.\n');
  console.error('Get it from: Intercom → Settings → Integrations → Developer Hub → Access Tokens\n');
  console.error('Usage:');
  console.error('  INTERCOM_ACCESS_TOKEN=dG9rOi... node run.js\n');
  process.exit(1);
}

step('Fetching Intercom data', 'node fetch-data.js');
step('Generating HTML report', 'node generate-report.js');
step('Deploying to Vercel', 'npx vercel --prod --yes');

console.log('\n✅ Done! Report deployed to Vercel production.\n');
