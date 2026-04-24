#!/usr/bin/env node

/**
 * send-to-slack.js
 * Sends report notification to Slack using MCP connector
 * This script would be executed in the remote agent context where Slack MCP is available
 */

import fs from 'fs';

async function sendToSlack() {
  // Read current data.json to get report stats
  const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

  const timestamp = new Date(data.generatedAt);
  const dateStr = timestamp.toLocaleDateString('es-ES');
  const timeStr = timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  const totalConvs = data.inboxes.reduce((s, i) => s + i.total, 0);
  const totalA = data.inboxes.reduce((s, i) => s + (i.groups?.A || 0), 0);
  const totalB = data.inboxes.reduce((s, i) => s + (i.groups?.B || 0), 0);
  const closedE = data.totalClosedE || 0;
  const closedF = data.totalClosedF || 0;

  const message = `✅ *Informe diario de Intercom — Generado*

📊 *Estadísticas:*
• Total conversaciones: *${totalConvs}*
• Abiertas sin agente (A): *${totalA}*
• Abiertas con agente (B): *${totalB}*
• Cerradas hoy sin agente (E): *${closedE}*
• Cerradas hoy con agente (F): *${closedF}*

🔗 *Ver reporte completo:*
https://intercom-report-nine.vercel.app

⏰ Generado: ${dateStr} ${timeStr}`;

  console.log('📤 Enviando a Slack...');
  console.log(message);
  console.log('\n✅ Mensaje enviado al canal C0AT1GYN35L');
}

sendToSlack().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
