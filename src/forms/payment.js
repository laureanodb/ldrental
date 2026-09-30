import { S } from '../state.js';
import { $, val, uid, iso, today, esc, money, moneyUSD, num1, fdate } from '../utils.js';
import { isContract, calc, carById, driverName, metodoPreferidoChofer, montoSugeridoCobro, seguroPendiente } from '../calc.js';
import { METODOS_PAGO } from '../constants.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { actualizarKm } from './car.js';
import { leerDocumento } from '../ia.js';
import { subirArchivoSuelto } from '../files.js';

// Comprobante que se adjunta al próximo cobro guardado: el que subió el chofer
// desde el portal (trae driverId) o una foto/PDF que se sube desde el formulario.
let comprobantePortal = null;
// Número de operación leído con IA, para avisar si el mismo comprobante se usa dos veces.
let comprobanteRef = '';
export function payForm(carId, comprobante) {
  const cars = S.cars.filter(c => isContract(c) && c.choferId);
  if (!cars.length) { toast('Primero cargá un auto alquilado o financiado con chofer'); return; }
  comprobantePortal = comprobante || null;
  comprobanteRef = '';
  const c = cars.find(x => x.id === carId) || cars[0];
  const h = '<h3>Registrar cobro</h3>' +
  (comprobante ? '<div class="card small" style="margin-bottom:10px">📎 Se adjunta el comprobante que subió ' + esc(driverName(comprobante.driverId) || 'el chofer') + ' el ' + fdate(comprobante.fecha) + '.<div id="p_ia" class="small muted" style="margin-top:4px"></div></div>'
    : '<label class="btn sec sm block filebtn" style="margin-bottom:4px">📷 Leer un comprobante (foto o PDF)<input id="p_compIn" type="file" accept="image/*,application/pdf" onchange="leerComprobanteCobro()"></label><div id="p_ia" class="small muted" style="margin-bottom:10px"></div>') +
  '<label class="f"><span>Auto</span><select id="p_car" onchange="onPayCar()">' + cars.map(x => '<option value="' + x.id + '"' + (x.id === c.id ? ' selected' : '') + '>' + esc(x.patente) + ' · ' + esc(driverName(x.choferId)) + '</option>').join('') + '</select></label>' +
  '<div class="small muted" id="p_info" style="margin:-4px 0 12px"></div>' +
  '<div class="two"><label class="f"><span id="p_lblmonto">Monto</span><input id="p_monto" inputmode="decimal"></label>' +
  '<label class="f"><span>Fecha</span><input id="p_fecha" type="date" value="' + iso(today()) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Tipo</span><select id="p_tipo" onchange="onPayTipo()"><option value="alquiler">Alquiler</option><option value="cuota">Cuota de financiación</option><option value="seguro">Seguro (en pesos)</option><option value="otro">Otro (anticipo, seña, etc.)</option></select></label>' +
  '<label class="f"><span>Método de pago</span><select id="p_metodo">' + METODOS_PAGO.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></label></div>' +
  '<label class="chk"><input type="checkbox" id="p_parcial"><span>Es un pago parcial</span></label>' +
  '<label class="chk"><input type="checkbox" id="p_acuenta"><span>El monto no coincide con el semanal (a cuenta, adelanto de varias semanas, etc.)</span></label>' +
  '<label class="chk"><input type="checkbox" id="p_generaradelanto"><span>Si sobra plata después de cubrir la deuda, generar semana adelantada con el resto</span></label>' +
  '<label class="f"><span>Km actual <small>opcional</small></span><input id="p_km" inputmode="numeric" placeholder="' + esc(c.km || '') + '"></label>' +
  '<label class="f"><span>Nota</span><input id="p_nota"></label>' +
  '<div class="row"><button class="btn grow" onclick="savePay(this)">Guardar cobro</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>';
  openModal(h); onPayCar();
  if (comprobante) leerComprobanteEnCobro(comprobante.id);
}
// Sube la foto o PDF elegido en el formulario, lo deja para adjuntar al cobro y lo lee con IA.
export async function leerComprobanteCobro() {
  const inp = document.getElementById('p_compIn');
  const f = inp && inp.files && inp.files[0]; if (!f) return;
  const st = document.getElementById('p_ia');
  if (st) { st.style.color = 'var(--muted)'; st.textContent = 'Subiendo el comprobante…'; }
  const r = await subirArchivoSuelto(f);
  if (inp) inp.value = '';
  if (!r) { if (st) st.textContent = ''; return; }
  comprobantePortal = Object.assign({ fecha: iso(today()) }, r);
  await leerComprobanteEnCobro(r.id);
}
async function leerComprobanteEnCobro(path) {
  const st = document.getElementById('p_ia'); if (!st) return;
  st.style.color = 'var(--muted)'; st.textContent = '📎 Comprobante adjunto. Leyéndolo con IA…';
  const j = await leerDocumento('comprobante', { path });
  if (!document.getElementById('p_ia')) return;
  if (!j.ok) { st.textContent = '📎 Comprobante adjunto. No se pudo leer con IA: ' + j.error + '. Completá los datos a mano.'; return; }
  aplicarLecturaComprobante(j.datos);
}
function mismaPersona(a, b) {
  const pal = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter(w => w.length > 2);
  const A = pal(a), B = pal(b);
  return !A.length || !B.length || A.some(w => B.includes(w));
}
export function aplicarLecturaComprobante(d) {
  const st = document.getElementById('p_ia'); if (!st) return;
  const c = carById(val('p_car'));
  if (!d.esComprobante) { st.style.color = 'var(--warn)'; st.textContent = '⚠ La IA no reconoce esto como un comprobante de pago. Revisalo antes de guardar.'; return; }
  const avisos = [];
  const pendSeguro = c && c.choferId ? seguroPendiente(c.choferId) : 0;
  if (d.monto > 0) {
    if (d.moneda === 'ARS' && pendSeguro > 0 && Math.abs(d.monto - pendSeguro) < 1 && Math.abs(d.monto - (+c.monto || 0)) >= 1) {
      $('#p_tipo').value = 'seguro'; onPayTipo(); $('#p_monto').value = d.monto;
    } else if (c && c.tipo === 'financiado' && d.moneda === 'ARS' && $('#p_tipo').value === 'cuota') {
      avisos.push('El comprobante es en pesos (' + money(d.monto) + ') y la cuota es en dólares: poné el equivalente en dólares.');
    } else $('#p_monto').value = d.monto;
  }
  if (d.fecha) {
    $('#p_fecha').value = d.fecha;
    const dias = Math.round((today() - new Date(d.fecha + 'T00:00:00')) / 864e5);
    if (dias < 0) avisos.push('La fecha del comprobante es futura.');
    else if (dias > 30) avisos.push('El comprobante es de hace ' + dias + ' días.');
  }
  if (['transferencia', 'mercadopago', 'efectivo'].includes(d.metodo)) $('#p_metodo').value = d.metodo;
  if (d.referencia) {
    comprobanteRef = d.referencia;
    const usado = S.payments.find(p => p.comprobanteRef && p.comprobanteRef === d.referencia);
    if (usado) avisos.push('Este comprobante (op. ' + d.referencia + ') ya se usó en un cobro del ' + fdate(usado.fecha) + (usado.choferId ? ' de ' + driverName(usado.choferId) : '') + '.');
  }
  const chofer = c ? driverName(c.choferId) : '';
  if (d.pagador && chofer && !mismaPersona(d.pagador, chofer)) avisos.push('Lo pagó ' + d.pagador + ', no ' + chofer + '.');
  if (d.observaciones) avisos.push(d.observaciones);
  if (!val('p_nota') && (d.referencia || d.pagador)) $('#p_nota').value = [d.referencia ? 'Op. ' + d.referencia : '', d.pagador ? 'de ' + d.pagador : ''].filter(Boolean).join(' · ');
  const leido = [d.monto ? (d.moneda === 'USD' ? moneyUSD(d.monto) : money(d.monto)) : '', d.fecha ? 'del ' + fdate(d.fecha) : '', d.pagador ? 'de ' + d.pagador : ''].filter(Boolean).join(' ');
  st.style.color = avisos.length ? 'var(--warn)' : 'var(--ok)';
  st.innerHTML = '✓ Leído con IA: ' + esc(leido || 'sin datos claros') + '. Revisá antes de guardar.' + avisos.map(a => '<div>⚠ ' + esc(a) + '</div>').join('');
}
export function payFormSeguro(carId) {
  payForm(carId);
  const c = carById(carId); if (!c) return;
  $('#p_tipo').value = 'seguro'; onPayTipo();
  $('#p_monto').value = c.choferId ? (seguroPendiente(c.choferId) || '') : '';
}
export function onPayTipo() {
  const c = carById($('#p_car').value); if (!c) return;
  const t = $('#p_tipo').value;
  $('#p_lblmonto').textContent = t === 'cuota' ? 'Monto (en dólares)' : t === 'seguro' ? 'Monto del seguro (en pesos)' : 'Monto';
  if (t === 'seguro') $('#p_info').textContent = 'Seguro pendiente de ' + (driverName(c.choferId) || 'el chofer') + ': ' + money(c.choferId ? seguroPendiente(c.choferId) : 0) + '.';
}
export function payFormACuenta(carId) {
  payForm(carId);
  const el = document.getElementById('p_acuenta');
  if (el) el.checked = true;
}
export function onPayCar() {
  const c = carById($('#p_car').value); if (!c) return;
  const i = calc(c);
  const mon = c.tipo === 'financiado' ? moneyUSD : money;
  $('#p_monto').value = montoSugeridoCobro(c) || '';
  $('#p_tipo').value = c.tipo === 'alquiler' ? 'alquiler' : 'cuota';
  $('#p_lblmonto').textContent = c.tipo === 'financiado' ? 'Monto (en dólares)' : 'Monto';
  $('#p_info').textContent = (i.debt > 0 ? 'Debe ' + mon(i.debt) + ' (' + num1(i.late) + ' semanas). ' : 'Está al día. ') + (c.tipo === 'alquiler' ? 'Alquiler' : 'Cuota') + ' semanal: ' + mon(c.monto) + '.';
  const metodoHabitual = metodoPreferidoChofer(c.choferId);
  if (metodoHabitual) $('#p_metodo').value = metodoHabitual;
}
let payAnomaloArmed = null;
export async function savePay(btn) {
  const c = carById(val('p_car')); const monto = +val('p_monto');
  if (!c) { toast('Elegí un auto'); return; }
  if (!monto || monto <= 0) { toast('Poné el monto cobrado'); return; }
  if (!val('p_fecha')) { toast('Poné la fecha'); return; }
  const parcial = document.getElementById('p_parcial').checked;
  const aCuenta = document.getElementById('p_acuenta').checked;
  const esperado = +c.monto || 0;
  if (val('p_tipo') !== 'seguro' && !parcial && !aCuenta && esperado && (monto > esperado * 1.5 || monto < esperado * 0.5) && payAnomaloArmed !== btn) {
    payAnomaloArmed = btn;
    const mon = c.tipo === 'financiado' ? moneyUSD : money;
    toast('Este monto (' + mon(monto) + ') es muy distinto al habitual (' + mon(esperado) + '). Tocá "Guardar cobro" de nuevo para confirmar.');
    return;
  }
  payAnomaloArmed = null;
  const tipo = val('p_tipo');
  const generarAdelanto = document.getElementById('p_generaradelanto').checked;
  let montoPago = monto, excedente = 0;
  if (generarAdelanto && c.choferId && (tipo === 'alquiler' || tipo === 'cuota')) {
    const debtActual = calc(c).debt;
    excedente = Math.max(0, monto - debtActual);
    if (excedente > 0) montoPago = monto - excedente;
  }
  const o = { id: uid(), carId: c.id, choferId: c.choferId, fecha: val('p_fecha'), monto: montoPago, tipo, metodo: val('p_metodo'), parcial, aCuenta, nota: val('p_nota'), depositado: false };
  const comp = comprobantePortal;
  if (comp) o.files = [{ id: comp.id, name: (comp.driverId ? 'comprobante-portal-' : 'comprobante-') + comp.fecha + '.' + (String(comp.type || '').split('/')[1] || 'jpg').replace('jpeg', 'jpg'), cat: 'comprobante', type: comp.type, size: comp.size, fecha: comp.fecha }];
  if (comprobanteRef) o.comprobanteRef = comprobanteRef;
  const km = val('p_km');
  if (!(await save('payments', o))) return;
  comprobantePortal = null; comprobanteRef = '';
  if (comp && comp.driverId) {
    const dr = S.drivers.find(x => x.id === comp.driverId);
    if (dr) await save('drivers', Object.assign({}, dr, { comprobantesPortal: (dr.comprobantesPortal || []).map(x => x.id === comp.id ? Object.assign({}, x, { revisado: true, pagoId: o.id }) : x) }));
  }
  if (excedente > 0) {
    await save('depositos', { id: uid(), driverId: c.choferId, fecha: val('p_fecha'), monto: excedente, tipo: 'semana_adelantada', nota: 'Generado desde un cobro' });
  }
  if (km) await actualizarKm(c.id, km);
  const mon2 = c.tipo === 'financiado' ? moneyUSD : money;
  const msgOk = excedente > 0 ? 'Cobro registrado y ' + mon2(excedente) + ' quedaron como semana adelantada' : 'Cobro registrado';
  const d = S.drivers.find(x => x.id === c.choferId);
  if (d && d.tel) {
    const wa = 'https://wa.me/' + d.tel.replace(/\D/g, '') + '?text=' + encodeURIComponent('Hola ' + (d.nombre || '').split(' ')[0] + ', te confirmamos que registramos tu pago de ' + mon2(montoPago) + ' del ' + val('p_fecha') + '. ¡Gracias!');
    openModal('<h3>Cobro registrado</h3><div class="small muted" style="margin-bottom:14px">' + esc(msgOk) + '.</div>' +
    '<div class="row"><a class="btn grow" target="_blank" rel="noopener" href="' + wa + '">Avisar por WhatsApp</a><button class="btn sec" onclick="closeModal()">Cerrar</button></div>');
  } else {
    closeModal();
    toast(msgOk);
  }
}
export function cobrarComprobantePortal(driverId, compId) {
  const d = S.drivers.find(x => x.id === driverId);
  const comp = d && (d.comprobantesPortal || []).find(x => x.id === compId);
  if (!comp) { toast('No se encontró el comprobante'); return; }
  const carId = comp.carId || (S.cars.find(c => c.choferId === driverId && isContract(c)) || {}).id;
  payForm(carId, Object.assign({ driverId }, comp));
}
export async function delPay(id) { if (await remove('payments', id)) toast('Cobro borrado'); }
export async function toggleDepositado(id) {
  const p = S.payments.find(x => x.id === id); if (!p) return;
  await save('payments', Object.assign({}, p, { depositado: !p.depositado }));
}
