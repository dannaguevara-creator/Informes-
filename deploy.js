#!/usr/bin/env node

/**
 * deploy.js
 * Orchestrates fetching data, generating report, and deploying to Vercel
 */

import { execSync } from 'child_process';
import fs from 'fs';
import https from 'https';
import { URL } from 'url';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;

if (!VERCEL_TOKEN) {
  console.error('❌ ERROR: VERCEL_TOKEN env var is required');
  process.exit(1);
}

async function sendToSlack(message, url) {
  const payload = {
    text: message,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<${url}|${message}>`
        }
      }
    ]
  };

  const slackUrl = new URL(SLACK_WEBHOOK);

  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'POST',
      hostname: slackUrl.hostname,
      path: slackUrl.pathname + slackUrl.search,
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 && body === 'ok') {
          console.log(`✅ Message sent to Slack`);
          resolve();
        } else {
          reject(new Error(`Slack webhook failed: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

async function run() {
  try {
    console.log('🔄 Fetching data from Intercom...');
    execSync('node fetch-data.js', { stdio: 'inherit' });

    console.log('\n📊 Generating report...');
    execSync('node generate-report.js', { stdio: 'inherit' });

    console.log('\n🚀 Deploying to Vercel...');
    const output = execSync('npx vercel --prod --yes', {
      encoding: 'utf8',
      env: { ...process.env, VERCEL_TOKEN }
    });

    const urlMatch = output.match(/Aliased: (https:\/\/\S+)/);
    const deployUrl = urlMatch ? urlMatch[1] : 'https://intercom-report-nine.vercel.app';

    console.log(`\n✅ Deployment successful!`);
    console.log(`   URL: ${deployUrl}`);

    const deployInfo = {
      deployedAt: new Date().toISOString(),
      url: deployUrl,
    };
    fs.writeFileSync('deploy-info.json', JSON.stringify(deployInfo, null, 2));
    console.log(`   Info saved to deploy-info.json`);

    if (SLACK_WEBHOOK) {
      console.log('\n📤 Sending to Slack...');
      const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
      const dateStr = new Date().toLocaleDateString('es-CO');
      const message = `Ver reporte completo con todos los inboxes de ${dateStr}`;

      await sendToSlack(message, deployUrl);
    } else {
      console.log('\n⚠️  SLACK_WEBHOOK not configured, skipping Slack notification');
    }

  } catch (err) {
    console.error('\n❌ Error during deployment:');
    console.error(err.message);
    process.exit(1);
  }
}

run();
