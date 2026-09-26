import { S } from './state.js';
import { COLS } from './constants.js';
import { iso, today } from './utils.js';
import { toast } from './modal.js';
import { saveFile } from './backup.js';
import { resumenGeneral } from './calc.js';

const SHEET_LABELS = { cars: 'Autos', drivers: 'Choferes', payments: 'Cobros', gastos: 'Gastos', proveedores: 'Proveedores', sanciones: 'Sanciones', prospectos: 'Prospectos', inspecciones: 'Inspecciones', mantenimientos: 'Mantenimiento', multas: 'Multas', depositos: 'Depositos', siniestros: 'Siniestros', gastosrecurrentes: 'Gastos recurrentes', repuestos: 'Stock repuestos' };

function limpiar(obj) {
  const o = {};
  for (const k in obj) {
    if (k === 'files') { o.archivos = (obj.files || []).length; continue; }
    const v = obj[k];
    o[k] = (v && typeof v === 'object') ? JSON.stringify(v) : v;
  }
  return o;
}

export async function exportarExcel() {
  try {
    toast('Generando archivo Excel…');
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const r = resumenGeneral();
    const wsResumen = XLSX.utils.json_to_sheet([
      { concepto: 'Cobrado total (pesos, alquileres)', valor: r.cobrado },
      { concepto: 'Cobrado total (dólares, financiados)', valor: r.cobradoUSD },
      { concepto: 'Gastos totales (gastos + mantenimiento, pesos)', valor: r.gastos },
      { concepto: 'Rentabilidad neta (pesos)', valor: r.neta },
      { concepto: 'Deuda total de choferes (pesos, alquileres)', valor: r.deudaTotal },
      { concepto: 'Deuda total de financiados (dólares)', valor: r.deudaTotalUSD },
      { concepto: 'Autos activos', valor: r.autosActivos },
      { concepto: 'Choferes activos', valor: r.choferesActivos },
    ]);
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
    COLS.forEach(col => {
      const rows = (S[col] || []).map(limpiar);
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ sinDatos: true }]);
      XLSX.utils.book_append_sheet(wb, ws, (SHEET_LABELS[col] || col).slice(0, 31));
    });
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    await saveFile('flota-completo-' + iso(today()) + '.xlsx', out, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast('Excel descargado');
  } catch (e) {
    toast('No se pudo generar el Excel: ' + ((e && e.message) || 'error'));
  }
}
