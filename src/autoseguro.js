// LD Rental — fondo de autoseguro interno.
// No es una aseguradora real: es una caja separada donde se van juntando
// aportes (ej: un % de cada cobro, o un monto fijo semanal) para cubrir
// reparaciones de siniestros en vez de pagarle a una aseguradora externa.
import { val, uid, iso, today, esc, money, fdate } from './utils.js';
import { settings, saveSettings } from './settings.js';
import { openModal, closeModal, toast, confirmDel } from './modal.js';
import { canDelete, canVerFinanzas } from './roles.js';

export function saldoAutoseguro() {
  return (settings.autoseguroFondo || []).reduce((a, x) => a + (+x.monto || 0), 0);
}
export function autoseguroCard() {
  if (!canVerFinanzas()) return '';
  return '<div class="card tap row between" onclick="autoseguroForm()"><span>Fondo de autoseguro</span><b style="color:' + (saldoAutoseguro() >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(saldoAutoseguro()) + '</b></div>';
}
export function autoseguroForm() {
  const M = (settings.autoseguroFondo || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const h = '<h3>Fondo de autoseguro</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Caja interna para cubrir reparaciones de siniestros en vez de pagar una aseguradora. Saldo actual: <b>' + money(saldoAutoseguro()) + '</b></div>' +
  '<div class="two"><label class="f"><span>Tipo</span><select id="fs_tipo"><option value="ingreso">Aporte al fondo</option><option value="egreso">Pago de una reparación</option></select></label>' +
  '<label class="f"><span>Monto</span><input id="fs_monto" inputmode="decimal"></label></div>' +
  '<label class="f"><span>Motivo</span><input id="fs_motivo" placeholder="ej: aporte semanal, reparación choque auto AB123CD"></label>' +
  '<button class="btn sec block" style="margin-bottom:14px" onclick="registrarTransaccionAutoseguro()">Registrar</button>' +
  (M.length ? M.map(x => '<div class="card row"><div class="grow"><div>' + (x.monto >= 0 ? '+' + money(x.monto) : '-' + money(-x.monto)) + ' <span class="small muted">' + fdate(x.fecha) + '</span></div>' + (x.motivo ? '<div class="small muted">' + esc(x.motivo) + '</div>' : '') + '</div>' + (canDelete() ? '<button class="btn danger sm" onclick="confirmDel(this,()=>borrarTransaccionAutoseguro(\'' + x.id + '\'))">Borrar</button>' : '') + '</div>').join('') : '<div class="small muted">Sin movimientos todavía.</div>') +
  '<div class="row" style="margin-top:14px"><button class="btn sec grow" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
}
export function registrarTransaccionAutoseguro() {
  const tipo = val('fs_tipo');
  const montoAbs = +val('fs_monto');
  if (!montoAbs || montoAbs <= 0) { toast('Poné el monto'); return; }
  const monto = tipo === 'egreso' ? -montoAbs : montoAbs;
  const tx = { id: uid(), fecha: iso(today()), monto, motivo: val('fs_motivo') };
  saveSettings({ autoseguroFondo: (settings.autoseguroFondo || []).concat([tx]) });
  toast('Registrado');
  autoseguroForm();
}
export function borrarTransaccionAutoseguro(id) {
  saveSettings({ autoseguroFondo: (settings.autoseguroFondo || []).filter(x => x.id !== id) });
  autoseguroForm();
}
