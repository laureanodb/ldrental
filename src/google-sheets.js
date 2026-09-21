import { googleFetch } from './google.js';
import { S } from './state.js';
import { carById, driverName } from './calc.js';
import { toast } from './modal.js';

const SHEET_ID_KEY = 'flota-sheet-id';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

async function obtenerOCrearPlanilla() {
  let id = null;
  try { id = localStorage.getItem(SHEET_ID_KEY); } catch (e) {}
  if (id) {
    try { await googleFetch(SHEETS_BASE + '/' + id); return id; } catch (e) { /* la planilla ya no existe, se crea otra */ }
  }
  const creada = await googleFetch(SHEETS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: { title: 'Mi Flota — Cobros' } }),
  });
  try { localStorage.setItem(SHEET_ID_KEY, creada.spreadsheetId); } catch (e) {}
  return creada.spreadsheetId;
}

export async function syncSheetsUI() {
  try {
    const id = await obtenerOCrearPlanilla();
    const rows = [['Fecha', 'Patente', 'Chofer', 'Tipo', 'Monto', 'Método', 'Nota']];
    S.payments.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(p => {
      const c = carById(p.carId);
      rows.push([p.fecha, c ? c.patente : '', driverName(p.choferId), p.tipo, p.monto, p.metodo || '', p.nota || '']);
    });
    await googleFetch(SHEETS_BASE + '/' + id + '/values/A1:Z' + (rows.length + 1) + '?valueInputOption=RAW', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows }),
    });
    toast('Exportado a Sheets: ' + (rows.length - 1) + ' cobros');
  } catch (e) {
    toast('No se pudo exportar a Sheets: ' + e.message);
  }
}
