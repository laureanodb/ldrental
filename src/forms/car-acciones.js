// Acciones sobre un auto fuera del formulario principal: valor semanal, favorito, venta,
// cronograma de cuotas, accesorios, QR, km, taller y ajuste por inflación.
import { $, val, uid, iso, today, esc, fdate, money, moneyUSD, parse, days } from '../utils.js';
import { driverName, badge, cronogramaCuotas } from '../calc.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { purgeFiles } from '../files.js';
import { inflacionAcumulada } from '../inflacion.js';
import { settings } from '../settings.js';
import { avisoAlquilerBajo } from './corregir-montos.js';
import { de } from '../memo.js';
import { actualizarHistorialMonto, actualizarHistorialTaller, carForm } from './car.js';

export function valorSemanalRow(c, volver) {
  const fin = c.tipo === 'financiado', alq = c.tipo === 'alquiler';
  const v = (alq || fin) ? +c.monto || 0 : +c.valorSemanal || 0;
  const label = fin ? 'Cuota semanal' : alq ? 'Alquiler semanal' : 'Valor semanal de alquiler';
  return '<div class="row between" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line)"><div><div class="small muted">' + label + '</div>' +
    '<b>' + (v ? (fin ? moneyUSD(v) : money(v)) : '<span class="muted">Sin cargar</span>') + '</b></div>' +
    (fin ? '' : '<button class="btn sec sm" onclick="valorSemanalForm(\'' + c.id + '\',\'' + volver + '\')">' + (v ? 'Editar' : 'Cargar') + '</button>') + '</div>';
}
function semanasCorridas(c) {
  if (c.tipo !== 'alquiler' || !c.inicio || !c.monto) return 0;
  const d = days(parse(c.inicio), today());
  return d < 0 ? 0 : Math.floor(d / 7) + 1;
}
export function valorSemanalForm(carId, volver) {
  const c = de('cars', 'id', carId)[0]; if (!c) return;
  const alq = c.tipo === 'alquiler';
  const semanas = semanasCorridas(c);
  openModal('<h3>Valor semanal — ' + esc(c.patente) + '</h3>' +
    '<label class="f"><span>Alquiler semanal ($)</span><input id="vs_monto" inputmode="decimal" value="' + esc((alq ? c.monto : c.valorSemanal) || '') + '"></label>' +
    '<div class="small muted" style="margin:-4px 0 12px">' + (alq
      ? 'Es lo que paga ' + esc(driverName(c.choferId)) + ' por semana.'
      : 'Es el precio de referencia del auto. Cuando se lo asignes a un chofer, se propone solo como monto del alquiler.') + '</div>' +
    (semanas ? '<label class="chk"><input type="checkbox" id="vs_desdeAhora" checked><span>Aplicar desde la semana que viene (las ' + semanas + ' semanas ya corridas quedan con el valor anterior)</span></label>' +
      '<div class="small muted" style="margin:-4px 0 12px">Destildalo solo si estás corrigiendo un monto mal cargado desde el principio.</div>' : '') +
    '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="guardarValorSemanal(\'' + c.id + '\',\'' + volver + '\')">Guardar</button>' +
    '<button class="btn sec" onclick="volverDeValorSemanal(\'' + c.id + '\',\'' + volver + '\')">Cancelar</button></div>');
}
export function volverDeValorSemanal(carId, volver) {
  if (volver === 'auto') carForm(carId); else window.driverForm(volver);
}
export async function guardarValorSemanal(carId, volver) {
  const c = de('cars', 'id', carId)[0]; if (!c) return;
  const nuevo = +val('vs_monto') || 0;
  if (!nuevo) { toast('Cargá el valor semanal'); return; }
  const bajoAlq = avisoAlquilerBajo('alquiler', nuevo); if (bajoAlq) { toast(bajoAlq); return; }
  let o;
  if (c.tipo === 'alquiler') {
    const anterior = +c.monto || 0;
    const semanas = semanasCorridas(c);
    const chk = document.getElementById('vs_desdeAhora');
    const ajustesDeuda = (c.ajustesDeuda || []).slice();
    // La deuda se calcula como semanas × monto actual; para no reescribir las semanas
    // ya corridas, se compensa la diferencia con un ajuste de deuda.
    if (chk && chk.checked && semanas && nuevo !== anterior) {
      ajustesDeuda.push({ id: uid(), fecha: iso(today()), monto: semanas * (nuevo - anterior), motivo: 'Cambio de alquiler semanal de ' + money(anterior) + ' a ' + money(nuevo) + ': las ' + semanas + ' semanas ya corridas quedan al valor anterior' });
    }
    o = Object.assign({}, c, { monto: nuevo, valorSemanal: nuevo, ajustesDeuda, montoHistorial: actualizarHistorialMonto(c, nuevo) });
  } else {
    o = Object.assign({}, c, { valorSemanal: nuevo });
  }
  if (!(await save('cars', o))) return;
  toast('Valor semanal guardado');
  volverDeValorSemanal(carId, volver);
}
export async function toggleFavoritoAuto(id) {
  const c = de('cars', 'id', id)[0]; if (!c) return;
  await save('cars', Object.assign({}, c, { favorito: !c.favorito }));
}
export async function toggleVendido(id) {
  const c = de('cars', 'id', id)[0]; if (!c) return;
  if (await save('cars', Object.assign({}, c, { vendido: !c.vendido }))) { closeModal(); toast(c.vendido ? 'Auto restaurado' : 'Auto marcado como vendido'); }
}
export function venderAutoForm(id) {
  const c = de('cars', 'id', id)[0]; if (!c) return;
  const h = '<h3>Marcar como vendido — ' + esc(c.patente) + '</h3>' +
  '<label class="f"><span>Precio de venta</span><input id="cv_precio" inputmode="decimal"></label>' +
  '<div class="two"><label class="f"><span>Fecha de venta</span><input id="cv_fecha" type="date" value="' + iso(today()) + '"></label>' +
  '<label class="f"><span>Km al vender</span><input id="cv_km" inputmode="numeric" value="' + esc(c.km || '') + '"></label></div>' +
  '<div class="row"><button class="btn grow" onclick="confirmarVenta(\'' + c.id + '\')">Confirmar venta</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function confirmarVenta(id) {
  const c = de('cars', 'id', id)[0]; if (!c) return;
  const precioVenta = +val('cv_precio') || 0;
  const fechaVenta = val('cv_fecha') || iso(today());
  const kmVenta = +val('cv_km') || 0;
  const kmHistorial = kmVenta && kmVenta !== (+c.km || 0) ? (c.kmHistorial || []).concat([{ fecha: fechaVenta, km: kmVenta }]) : c.kmHistorial;
  if (await save('cars', Object.assign({}, c, { vendido: true, precioVenta, fechaVenta, km: kmVenta || c.km, kmHistorial }))) {
    await save('recordatorios', { id: uid(), texto: 'Dar de baja el seguro y la patente de ' + (c.patente || 'auto vendido'), fecha: iso(today()), hecho: false });
    closeModal(); toast('Auto marcado como vendido');
  }
}
export function cronogramaCuotasForm(id) {
  const c = de('cars', 'id', id)[0]; if (!c) return;
  const cron = cronogramaCuotas(c);
  const cls = { pagada: 'ok', parcial: 'warn', atrasada: 'bad', pendiente: 'mute' };
  const etiqueta = { pagada: 'Paga', parcial: 'Parcial', atrasada: 'Atrasada', pendiente: 'Pendiente' };
  const h = '<h3>Cronograma de cuotas — ' + esc(c.patente) + '</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Estimado en base a lo cobrado hasta ahora. No refleja pagos parciales dentro de una misma cuota.</div>' +
  cron.map(x => '<div class="row between small" style="padding:4px 0"><span>Cuota ' + x.numero + ' · ' + fdate(x.fecha) + '</span>' + badge(cls[x.estado], etiqueta[x.estado]) + '</div>').join('') +
  '<div class="row" style="margin-top:14px"><button class="btn sec grow" onclick="carForm(\'' + c.id + '\')">Volver</button></div>';
  openModal(h);
}
export async function delCar(id) {
  await purgeFiles(de('cars', 'id', id)[0]);
  for (const p of de('payments', 'carId', id).filter(p => p.carId === id)) await remove('payments', p.id);
  if (await remove('cars', id)) { closeModal(); toast('Auto eliminado'); }
}
export function accesorioForm(carId, idx) {
  const c = de('cars', 'id', carId)[0]; if (!c) return;
  const a = idx != null ? (c.accesorios || [])[idx] : null;
  const h = '<h3>' + (a ? 'Editar accesorio' : 'Nuevo accesorio') + ' — ' + esc(c.patente) + '</h3>' +
  '<label class="f"><span>Nombre</span><input id="ac_nombre" placeholder="GPS, cámara, alarma..." value="' + esc(a ? a.nombre : '') + '"></label>' +
  '<div class="two"><label class="f"><span>Fecha de instalación</span><input id="ac_fecha" type="date" value="' + esc(a ? a.fecha : iso(today())) + '"></label>' +
  '<label class="f"><span>Garantía <small>meses</small></span><input id="ac_garantia" inputmode="numeric" value="' + esc(a ? a.garantiaMeses || '' : '') + '"></label></div>' +
  '<label class="f"><span>Notas</span><textarea id="ac_notas">' + esc(a ? a.notas : '') + '</textarea></label>' +
  '<div class="row"><button class="btn grow" onclick="saveAccesorio(\'' + c.id + '\',' + (idx != null ? idx : 'null') + ')">Guardar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>' +
  (a ? '<div style="margin-top:8px"><button class="btn danger block" onclick="delAccesorio(\'' + c.id + '\',' + idx + ')">Eliminar accesorio</button></div>' : '');
  openModal(h);
}
export async function saveAccesorio(carId, idx) {
  const c = de('cars', 'id', carId)[0]; if (!c) return;
  const nombre = val('ac_nombre');
  if (!nombre) { toast('Poné un nombre'); return; }
  const o = { nombre, fecha: val('ac_fecha') || iso(today()), garantiaMeses: +val('ac_garantia') || 0, notas: val('ac_notas') };
  const accesorios = (c.accesorios || []).slice();
  if (idx != null) accesorios[idx] = o; else accesorios.push(o);
  if (await save('cars', Object.assign({}, c, { accesorios }))) { toast('Accesorio guardado'); carForm(carId); }
}
export async function delAccesorio(carId, idx) {
  const c = de('cars', 'id', carId)[0]; if (!c) return;
  const accesorios = (c.accesorios || []).slice(); accesorios.splice(idx, 1);
  if (await save('cars', Object.assign({}, c, { accesorios }))) { toast('Accesorio eliminado'); carForm(carId); }
}
export function qrAutoForm(id) {
  const c = de('cars', 'id', id)[0]; if (!c) return;
  const tel = (settings.companyPhone || '').replace(/\D/g, '');
  if (!tel) { toast('Cargá el teléfono de la empresa en Ajustes primero'); return; }
  const msg = 'Reporto un problema con el auto ' + (c.patente || '');
  const waUrl = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg);
  const qrImg = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' + encodeURIComponent(waUrl);
  const h = '<h3>QR para reportar un problema — ' + esc(c.patente) + '</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Imprimí este QR y pegalo en el auto. Al escanearlo, se abre WhatsApp con un mensaje pre-armado a tu número.</div>' +
  '<div style="text-align:center"><img src="' + qrImg + '" alt="QR" style="width:220px;height:220px"></div>' +
  '<div class="row" style="margin-top:14px"><button class="btn sec grow" onclick="carForm(\'' + c.id + '\')">Volver</button></div>';
  openModal(h);
}
/* Actualización silenciosa de km desde otros formularios (cobro, inspección, mantenimiento).
   Nunca retrocede el km ni interrumpe el flujo del formulario que la llama. */
export async function actualizarKm(carId, km) {
  const k = +km || 0;
  const c = de('cars', 'id', carId)[0];
  if (!c || !k || k <= (+c.km || 0)) return;
  const kmHistorial = (c.kmHistorial || []).concat([{ fecha: iso(today()), km: k }]);
  await save('cars', Object.assign({}, c, { km: k, kmHistorial }));
}
export async function marcarEnTaller(id) {
  const c = de('cars', 'id', id)[0];
  if (!c || c.tipo === 'taller') return;
  const historialTaller = actualizarHistorialTaller(c, 'taller');
  await save('cars', Object.assign({}, c, { tipo: 'taller', tipoPrevioTaller: c.tipo, historialTaller }));
}
export async function sacarDeTaller(id) {
  const c = de('cars', 'id', id)[0];
  if (!c || c.tipo !== 'taller') return;
  const nuevoTipo = c.tipoPrevioTaller || 'disponible';
  const historialTaller = actualizarHistorialTaller(c, nuevoTipo);
  if (c.reemplazoTemporalActivo) {
    const temp = de('cars', 'id', c.reemplazoTemporalCarId)[0];
    if (temp) await save('cars', Object.assign({}, temp, { tipo: 'disponible', choferId: '', esReemplazoTemporalDe: '' }));
  }
  if (await save('cars', Object.assign({}, c, { tipo: nuevoTipo, tipoPrevioTaller: '', historialTaller, reemplazoTemporalActivo: false, reemplazoTemporalCarId: '', reemplazoTemporalChoferId: '', reemplazoTemporalDesde: '' }))) { closeModal(); toast('Auto sacado de taller'); }
}
export function simularAumentoForm(id) {
  const c = de('cars', 'id', id)[0]; if (!c) return;
  const h = '<h3>Simular aumento — ' + esc(c.patente) + '</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Monto actual: ' + money(c.monto || 0) + ' por semana.</div>' +
  '<div class="two"><label class="f"><span>Monto nuevo</span><input id="sa_nuevo" inputmode="decimal" value="' + (c.monto || 0) + '" oninput="calcularSimulacionAumento(\'' + c.id + '\')"></label>' +
  '<label class="f"><span>Semanas a proyectar</span><input id="sa_semanas" inputmode="numeric" value="12" oninput="calcularSimulacionAumento(\'' + c.id + '\')"></label></div>' +
  '<div id="sa_resultado" class="card"></div>' +
  '<div class="row" style="margin-top:14px"><button class="btn sec grow" onclick="carForm(\'' + c.id + '\')">Volver</button></div>';
  openModal(h);
  calcularSimulacionAumento(id);
}
export function calcularSimulacionAumento(id) {
  const c = de('cars', 'id', id)[0]; if (!c) return;
  const el = document.getElementById('sa_resultado'); if (!el) return;
  const actual = +c.monto || 0;
  const nuevo = +val('sa_nuevo') || 0;
  const semanas = +val('sa_semanas') || 0;
  const fmt = n => Math.round(n).toLocaleString('es-AR');
  const dif = nuevo - actual;
  const extra = dif * semanas;
  el.innerHTML = '<div class="row between small"><span class="muted">Diferencia semanal</span><b style="color:' + (dif >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + (dif >= 0 ? '+' : '') + fmt(dif) + '</b></div>' +
  '<div class="row between"><span class="muted">Extra proyectado en ' + semanas + ' semanas</span><b>' + fmt(extra) + '</b></div>' +
  (actual ? '<div class="small muted" style="margin-top:6px">Eso es un ' + (dif >= 0 ? '+' : '') + Math.round(dif / actual * 100) + '% respecto del monto actual.</div>' : '');
}
export async function sugerirAjusteInflacion(id) {
  const c = de('cars', 'id', id)[0];
  if (!c || !c.inicio || !c.monto) return;
  toast('Consultando índice de inflación…');
  try {
    const { factor, meses } = await inflacionAcumulada(c.inicio);
    if (!meses) { toast('Todavía no hay datos de inflación publicados desde el inicio del contrato'); return; }
    const sugerido = Math.round(c.monto * factor);
    const input = $('#c_monto');
    if (input) { input.value = sugerido; input.dataset.touched = 1; }
    toast('Inflación acumulada desde el inicio (' + meses + ' meses): ' + Math.round((factor - 1) * 100) + '%. Monto sugerido: ' + money(sugerido) + '. Revisá y guardá.');
  } catch (e) {
    toast('No se pudo calcular el ajuste: ' + e.message);
  }
}
