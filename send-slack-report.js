#!/usr/bin/env node

/**
 * send-slack-report.js
 * Sends report link to Slack with current date
 */

import https from 'https';
import { URL } from 'url';

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;
const REPORT_URL = process.env.REPORT_URL || 'https://intercom-report-nine.vercel.app';

function getFormattedDate() {
  const now = new Date();
  const day = now.getDate();
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const month = months[now.getMonth()];
  const year = now.getFullYear();
  return `${day}/${month}/${year}`;
}

async function sendToSlack() {
  const dateStr = getFormattedDate();
  const message = `Ver reporte completo con todos los inboxes de ${dateStr}`;

  const payload = {
    text: message,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<${REPORT_URL}|${message}>`
        }
      }
    ]
  };

  const url = new URL(SLACK_WEBHOOK);

  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 && body === 'ok') {
          console.log(`✅ Mensaje enviado a Slack: ${message}`);
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

sendToSlack().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
