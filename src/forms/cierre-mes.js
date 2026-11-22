// Cierre de mes: el administrador revisa el resumen del mes y lo cierra. Después, los
// cobros, gastos, depósitos y arreglos de ese mes solo los cambia un administrador,
// y cada cambio queda anotado (data.js). Se puede reabrir.
import { S } from '../state.js';
import { esc, iso, today, money, moneyUSD } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { settings, saveSettings } from '../settings.js';
import { isAdmin } from '../roles.js';

const nombreMes = m => { const t = new Date(m + '-02').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
function resumen(m) {
  const P = S.payments.filter(p => String(p.fecha).slice(0, 7) === m);
  const G = S.gastos.filter(g => String(g.fecha).slice(0, 7) === m);
  return {
    cobradoARS: P.filter(p => p.tipo !== 'cuota').reduce((s, p) => s + (+p.monto || 0), 0),
    cobradoUSD: P.filter(p => p.tipo === 'cuota').reduce((s, p) => s + (+p.monto || 0), 0),
    gastos: G.reduce((s, g) => s + (+g.costo || 0), 0), nCobros: P.length, nGastos: G.length,
    pendientesAprobacion: ((S.pendientes || {}).gastos || []).filter(g => String(g.fecha).slice(0, 7) === m).length,
  };
}
export function cierreMesView() {
  if (!isAdmin()) { toast('Solo un administrador puede cerrar meses'); return; }
  const cerrados = settings.mesesCerrados || [];
  const hoy = today();
  const meses = Array.from({ length: 6 }, (_, i) => iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1 - i, 1)).slice(0, 7));
  let h = '<h3>Cierre de mes</h3><div class="small muted" style="margin-bottom:10px">Revisá el resumen y cerrá el mes. Después, sus cobros y gastos solo los puede cambiar un administrador, y cada cambio te queda avisado. Lo podés reabrir.</div>';
  h += meses.map(m => {
    const r = resumen(m), cerrado = cerrados.includes(m);
    return '<div class="card"><div class="row between" style="gap:8px"><b>' + esc(nombreMes(m)) + '</b>' + (cerrado ? '<span class="badge b-ok">Cerrado</span>' : '<span class="badge b-warn">Abierto</span>') + '</div>' +
      '<div class="small muted" style="margin:4px 0">Cobrado ' + money(r.cobradoARS) + (r.cobradoUSD ? ' y ' + moneyUSD(r.cobradoUSD) : '') + ' en ' + r.nCobros + (r.nCobros === 1 ? ' cobro' : ' cobros') + ' · gastos ' + money(r.gastos) + ' (' + r.nGastos + ')</div>' +
      (r.pendientesAprobacion && !cerrado ? '<div class="small" style="color:var(--warn)">' + r.pendientesAprobacion + (r.pendientesAprobacion === 1 ? ' gasto espera' : ' gastos esperan') + ' tu aprobación: resolvelos antes de cerrar.</div>' : '') +
      '<button class="btn ' + (cerrado ? 'sec ' : '') + 'sm" onclick="' + (cerrado ? 'reabrirMes' : 'cerrarMes') + '(\'' + m + '\')">' + (cerrado ? 'Reabrir' : 'Cerrar el mes') + '</button></div>';
  }).join('');
  h += '<button class="btn sec block" onclick="closeModal()">Cerrar</button>';
  openModal(h);
}
export function cerrarMes(m) {
  saveSettings({ mesesCerrados: [...new Set((settings.mesesCerrados || []).concat([m]))].sort(), mesesCerradosPor: Object.assign({}, settings.mesesCerradosPor || {}, { [m]: { fecha: iso(today()), por: (S.user && S.user.email) || '' } }) });
  toast(nombreMes(m) + ' cerrado'); cierreMesView();
}
export function reabrirMes(m) {
  saveSettings({ mesesCerrados: (settings.mesesCerrados || []).filter(x => x !== m) });
  toast(nombreMes(m) + ' reabierto'); cierreMesView();
}
// Recordatorio el día 5 de cerrar el mes anterior.
export function alertaCierreMes() {
  if (!isAdmin()) return [];
  const hoy = today(); if (hoy.getDate() < 5) return [];
  const m = iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)).slice(0, 7);
  if ((settings.mesesCerrados || []).includes(m) || !S.payments.some(p => String(p.fecha).slice(0, 7) === m)) return [];
  return [{ who: 'Cerrar ' + nombreMes(m), sub: 'Cierre de mes', kind: 'sistema', id: '', key: 'sistema:cierremes:' + m, d: 10, cls: 'soft', t: 'Revisá y cerrá el mes anterior', accion: 'cierreMesView()' }];
}
