// Exportación mensual para el contador: un Excel (o CSV) con los ingresos (cobros) y los
// egresos (gastos y mantenimiento) del mes, con los datos que pide cualquier sistema
// contable: fecha, comprobante, persona, CUIT/DNI, concepto y monto en pesos.
import { S } from '../state.js';
import { iso, today } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { settings } from '../settings.js';
import { GASTO_CATS, METODOS_PAGO } from '../constants.js';
import { de } from '../memo.js';
import { canVerFinanzas } from '../roles.js';
import { saveFile } from '../backup.js';

const TIPO_COBRO = { alquiler: 'Alquiler semanal', cuota: 'Cuota de financiación', seguro: 'Seguro', otro: 'Otro' };
const cat = k => (GASTO_CATS.find(x => x[0] === k) || [0, k || 'Otro'])[1];
const metodo = k => (METODOS_PAGO.find(x => x[0] === k) || [0, k || ''])[1];
const r2 = n => Math.round((+n || 0) * 100) / 100;

function mesAnterior() { const h = today(); return iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)).slice(0, 7); }

export function contadorForm() {
  if (!canVerFinanzas()) { toast('Tu usuario no tiene acceso a las finanzas'); return; }
  openModal('<h3>Exportación para el contador</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Un archivo con los cobros y los gastos del mes. Si el sistema de tu contador pide otro formato, pasale el CSV: casi todos lo importan.</div>' +
    '<label class="f"><span>Mes</span><input id="ct_mes" type="month" value="' + mesAnterior() + '"></label>' +
    '<div id="ct_info" class="small muted" style="margin-bottom:10px"></div>' +
    '<div class="row" style="gap:8px"><button class="btn grow" onclick="exportarContador(\'xlsx\')">Excel</button><button class="btn sec grow" onclick="exportarContador(\'csv\')">CSV</button></div>' +
    '<button class="btn sec block" style="margin-top:8px" onclick="closeModal()">Cerrar</button>');
  const el = document.getElementById('ct_mes'); el.onchange = infoContador; infoContador();
}
function datosMes(mes) {
  const enMes = f => String(f || '').slice(0, 7) === mes;
  const ingresos = S.payments.filter(p => enMes(p.fecha) && (+p.monto || 0) > 0).sort((a, b) => String(a.fecha).localeCompare(b.fecha)).map(p => {
    const c = de('cars', 'id', p.carId)[0] || {}, d = de('drivers', 'id', p.choferId || c.choferId)[0] || {};
    const usd = p.tipo === 'cuota';
    const cot = usd ? +p.cotizacionDia || 0 : 1;
    return {
      Fecha: p.fecha, Comprobante: p.reciboNumero || '', Cliente: d.nombre || '', 'DNI/CUIT': d.cuit || d.dni || '', Patente: c.patente || '',
      Concepto: TIPO_COBRO[p.tipo] || p.tipo || '', 'Medio de pago': metodo(p.metodo), Moneda: usd ? 'USD' : 'ARS', Monto: r2(p.monto),
      Cotización: usd ? cot || '' : '', 'Monto en pesos': usd ? (cot ? r2(p.monto * cot) : '') : r2(p.monto), Nota: p.nota || '',
    };
  });
  const proveedorDe = id => (de('proveedores', 'id', id)[0] || {}).nombre || '';
  const egresos = S.gastos.filter(g => enMes(g.fecha) && (+g.costo || 0) > 0).map(g => ({
    Fecha: g.fecha, Comprobante: g.facturaNumero || '', Proveedor: g.proveedor || '', CUIT: g.facturaCuit || '', Patente: (de('cars', 'id', g.carId)[0] || {}).patente || 'General',
    Categoría: cat(g.categoria), Detalle: g.descripcion || '', 'Con factura': g.sinFactura ? 'No' : 'Sí', 'Monto en pesos': r2(g.costo),
  })).concat(S.mantenimientos.filter(m => enMes(m.fecha) && (+m.costo || 0) > 0).map(m => ({
    Fecha: m.fecha, Comprobante: m.facturaNumero || '', Proveedor: proveedorDe(m.proveedorId), CUIT: m.facturaCuit || '', Patente: (de('cars', 'id', m.carId)[0] || {}).patente || '',
    Categoría: 'Mantenimiento', Detalle: m.label || m.item || '', 'Con factura': m.sinFactura ? 'No' : 'Sí', 'Monto en pesos': r2(m.costo),
  }))).sort((a, b) => String(a.Fecha).localeCompare(b.Fecha));
  return { ingresos, egresos };
}
function infoContador() {
  const mes = (document.getElementById('ct_mes') || {}).value; const el = document.getElementById('ct_info'); if (!mes || !el) return;
  const { ingresos, egresos } = datosMes(mes);
  const sinCot = ingresos.filter(x => x.Moneda === 'USD' && !x.Cotización).length;
  el.innerHTML = ingresos.length + ' cobro(s) y ' + egresos.length + ' gasto(s) en el mes.' + (sinCot ? ' <span style="color:var(--warn)">' + sinCot + ' cobro(s) en dólares no tienen guardada la cotización del día: van sin monto en pesos.</span>' : '');
}
export async function exportarContador(formato) {
  const mes = (document.getElementById('ct_mes') || {}).value; if (!mes) { toast('Elegí el mes'); return; }
  const { ingresos, egresos } = datosMes(mes);
  if (!ingresos.length && !egresos.length) { toast('No hay movimientos en ese mes'); return; }
  const base = 'contador-' + String(settings.companyName || 'ldrental').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + mes;
  const totalIng = ingresos.reduce((s, x) => s + (+x['Monto en pesos'] || 0), 0), totalEgr = egresos.reduce((s, x) => s + (+x['Monto en pesos'] || 0), 0);
  try {
    if (formato === 'csv') {
      const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const filas = [['Tipo', 'Fecha', 'Comprobante', 'Persona', 'CUIT/DNI', 'Patente', 'Concepto', 'Detalle', 'Moneda', 'Monto', 'Monto en pesos']]
        .concat(ingresos.map(x => ['Ingreso', x.Fecha, x.Comprobante, x.Cliente, x['DNI/CUIT'], x.Patente, x.Concepto, x['Medio de pago'], x.Moneda, x.Monto, x['Monto en pesos']]))
        .concat(egresos.map(x => ['Egreso', x.Fecha, x.Comprobante, x.Proveedor, x.CUIT, x.Patente, x.Categoría, x.Detalle, 'ARS', x['Monto en pesos'], x['Monto en pesos']]));
      // Punto y coma y coma decimal: así lo abre bien Excel en castellano.
      const txt = '﻿' + filas.map(f => f.map(v => (typeof v === 'number' ? String(v).replace('.', ',') : q(v))).join(';')).join('\r\n');
      await saveFile(base + '.csv', txt, 'text/csv');
    } else {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
        { Concepto: 'Empresa', Valor: settings.companyName || '' }, { Concepto: 'CUIT', Valor: settings.pagoCuit || '' }, { Concepto: 'Mes', Valor: mes },
        { Concepto: 'Ingresos (pesos)', Valor: r2(totalIng) }, { Concepto: 'Egresos (pesos)', Valor: r2(totalEgr) }, { Concepto: 'Resultado (pesos)', Valor: r2(totalIng - totalEgr) },
        { Concepto: 'Cobros', Valor: ingresos.length }, { Concepto: 'Gastos', Valor: egresos.length }, { Concepto: 'Gastos sin factura', Valor: egresos.filter(x => x['Con factura'] === 'No').length },
      ]), 'Resumen');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ingresos.length ? ingresos : [{ Fecha: '' }]), 'Ingresos');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(egresos.length ? egresos : [{ Fecha: '' }]), 'Egresos');
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      await saveFile(base + '.xlsx', new Uint8Array(out), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    toast('Archivo para el contador listo');
  } catch (e) {
    if (!e || e.code !== 'declined') toast('No se pudo armar el archivo: ' + ((e && e.message) || 'error'));
  }
}
