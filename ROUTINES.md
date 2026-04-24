# Intercom Report - Rutinas Automáticas Diarias

## RUTINA 1: 1:00 AM COLOMBIA

**Cron:** `0 6 * * *` (UTC)  
**Comando:** `node snapshot-with-metrics.js`  
**Trigger ID:** `trig_014RakC4hu6jMdhgR2fuESBN`

**Acción:** Toma snapshot base del día con métricas de todos los inboxes  
**Guarda:** `snapshots/metrics-YYYY-MM-DD-1am.json`

**Grupos capturados:**
- A = Abierto sin agente
- B = Abierto con agente  
- C = Snoozed sin agente
- D = Snoozed con agente
- H = Snoozed > 1 día

---

## RUTINA 2: 3:30 PM COLOMBIA

**Cron:** `30 20 * * *` (UTC)  
**Comando:** `node compare-and-report.js`  
**Trigger ID:** `trig_01V89ss9FwSJ5VatFKQucLDi`

**Acción:**
1. Carga baseline de 1:00 AM
2. Toma foto actual de 3:30 PM
3. Calcula: E = A_1am - A_actual, F = B_1am - B_actual
4. Genera reporte HTML
5. Despliega a Vercel
6. Notifica a Slack

**Grupos en reporte:**
- A, B, C, D, H = valores actuales de 3:30 PM
- E = conversaciones cerradas sin agente
- F = conversaciones cerradas con agente

**Output:** `index.html` → https://intercom-report-nine.vercel.app

---

## Archivos Clave

- `snapshot-with-metrics.js` - Rutina 1
- `compare-and-report.js` - Rutina 2  
- `data.json` - Datos generados
- `snapshots/metrics-YYYY-MM-DD-1am.json` - Baseline diario
- `index.html` - Reporte en Vercel
