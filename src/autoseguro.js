// LD Rental — fondo de autoseguro interno.
// No es una aseguradora real: es una caja separada donde se van juntando
// aportes (ej: un % de cada cobro, o un monto fijo semanal) para cubrir
// reparaciones de siniestros en vez de pagarle a una aseguradora externa.
import { val, uid, iso, today, esc, money, fdate } from './utils.js';
import { settings, saveSettings, featureOculta } from './settings.js';
import { openModal, closeModal, toast, confirmDel } from './modal.js';
import { canDelete, canVerFinanzas } from './roles.js';
import { modoConsultaActivo } from './consulta.js';
import { TIPOS_SINIESTRO } from './constants.js';

const CATEGORIAS_EGRESO = TIPOS_SINIESTRO;

export function saldoAutoseguro() {
  return (settings.autoseguroFondo || []).reduce((a, x) => a + (+x.monto || 0), 0);
}
export function autoseguroCard() {
  if (!canVerFinanzas() || featureOculta('autoseguro')) return '';
  return '<div class="card tap row between" onclick="autoseguroForm()"><span>Fondo de autoseguro</span><b style="color:' + (saldoAutoseguro() >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(saldoAutoseguro()) + '</b></div>';
}
function evolucionMensual(meses) {
  const t = today();
  const out = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    const neto = (settings.autoseguroFondo || []).filter(x => x.fecha.slice(0, 7) === key).reduce((a, x) => a + (+x.monto || 0), 0);
    out.push({ label: d.toLocaleDateString('es-AR', { month: 'short' }), neto });
  }
  return out;
}
function comparacionAseguradora() {
  const costoMensual = +settings.autoseguroCostoEstimadoMensual || 0;
  if (!costoMensual) return '';
  const movs = settings.autoseguroFondo || [];
  if (!movs.length) return '';
  const primera = movs.slice().sort((a, b) => a.fecha.localeCompare(b.fecha))[0].fecha;
  const meses = Math.max(1, Math.round((today() - new Date(primera + 'T00:00:00')) / (30 * 86400000)));
  const gastado = movs.filter(x => x.monto < 0).reduce((a, x) => a + (-x.monto), 0);
  const hubieraCostado = costoMensual * meses;
  const ahorro = hubieraCostado - gastado;
  return '<div class="card" style="margin-bottom:10px"><div class="small muted">Vs. aseguradora externa (' + meses + ' mes' + (meses === 1 ? '' : 'es') + ' a ' + money(costoMensual) + '/mes)</div>' +
  '<div class="row between small"><span>Gastado del fondo en reparaciones</span><b>' + money(gastado) + '</b></div>' +
  '<div class="row between small"><span>Hubiera costado la aseguradora</span><b>' + money(hubieraCostado) + '</b></div>' +
  '<div class="row between" style="margin-top:4px"><b>Ahorro estimado</b><b style="color:' + (ahorro >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(ahorro) + '</b></div></div>';
}
export function autoseguroForm() {
  const M = (settings.autoseguroFondo || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const evo = evolucionMensual(6);
  const max = Math.max(...evo.map(x => Math.abs(x.neto)), 1);
  const soloLectura = modoConsultaActivo();
  const h = '<h3>Fondo de autoseguro</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Caja interna para cubrir reparaciones de siniestros en vez de pagar una aseguradora. Saldo actual: <b>' + money(saldoAutoseguro()) + '</b></div>' +
  '<div class="row" style="align-items:flex-end;gap:6px;height:60px;margin-bottom:10px">' + evo.map(x => {
    const h2 = Math.max(4, Math.round(Math.abs(x.neto) / max * 50));
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:100%;height:' + h2 + 'px;background:' + (x.neto >= 0 ? 'var(--ok)' : 'var(--bad)') + ';border-radius:4px 4px 0 0"></div><div class="small muted">' + x.label + '</div></div>';
  }).join('') + '</div>' +
  comparacionAseguradora() +
  (soloLectura ? '<div class="small muted" style="margin-bottom:10px">Modo consulta activo: no se pueden registrar movimientos.</div>' :
  '<div class="two"><label class="f"><span>Tipo</span><select id="fs_tipo" onchange="document.getElementById(\'fs_catbox\').style.display=this.value===\'egreso\'?\'\':\'none\'"><option value="ingreso">Aporte al fondo</option><option value="egreso">Pago de una reparación</option></select></label>' +
  '<label class="f"><span>Monto</span><input id="fs_monto" inputmode="decimal"></label></div>' +
  '<label class="f" id="fs_catbox" style="display:none"><span>Categoría</span><select id="fs_cat">' + CATEGORIAS_EGRESO.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Motivo</span><input id="fs_motivo" placeholder="ej: aporte semanal, reparación choque auto AB123CD"></label>' +
  '<button class="btn sec block" style="margin-bottom:14px" onclick="registrarTransaccionAutoseguro()">Registrar</button>') +
  (M.length ? M.map(x => '<div class="card row"><div class="grow"><div>' + (x.monto >= 0 ? '+' + money(x.monto) : '-' + money(-x.monto)) + ' <span class="small muted">' + fdate(x.fecha) + '</span></div>' + (x.motivo ? '<div class="small muted">' + esc(x.motivo) + (x.categoria ? ' · ' + esc((CATEGORIAS_EGRESO.find(c => c[0] === x.categoria) || [0, x.categoria])[1]) : '') + '</div>' : '') + '</div>' + (canDelete() && !soloLectura ? '<button class="btn danger sm" onclick="confirmDel(this,()=>borrarTransaccionAutoseguro(\'' + x.id + '\'))">Borrar</button>' : '') + '</div>').join('') : '<div class="small muted">Sin movimientos todavía.</div>') +
  '<div class="row" style="margin-top:14px"><button class="btn sec grow" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
}
export function registrarTransaccionAutoseguro() {
  if (modoConsultaActivo()) { toast('Modo consulta activo: no se puede registrar'); return; }
  const tipo = val('fs_tipo');
  const montoAbs = +val('fs_monto');
  if (!montoAbs || montoAbs <= 0) { toast('Poné el monto'); return; }
  const monto = tipo === 'egreso' ? -montoAbs : montoAbs;
  const tx = { id: uid(), fecha: iso(today()), monto, motivo: val('fs_motivo'), categoria: tipo === 'egreso' ? val('fs_cat') : '' };
  saveSettings({ autoseguroFondo: (settings.autoseguroFondo || []).concat([tx]) });
  toast('Registrado');
  autoseguroForm();
}
export function borrarTransaccionAutoseguro(id) {
  if (modoConsultaActivo()) { toast('Modo consulta activo: no se puede borrar'); return; }
  saveSettings({ autoseguroFondo: (settings.autoseguroFondo || []).filter(x => x.id !== id) });
  autoseguroForm();
}
export function registrarPagoAutoseguro(monto, motivo, categoria) {
  if (!monto) return;
  const tx = { id: uid(), fecha: iso(today()), monto: -Math.abs(monto), motivo, categoria: categoria || '' };
  saveSettings({ autoseguroFondo: (settings.autoseguroFondo || []).concat([tx]) });
}
