import { $, val, uid, iso, today, esc, parse } from '../utils.js';
import { S } from '../state.js';
import { TIPOS_INFRACCION, MULTA_ESTADOS } from '../constants.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { carById, driverName, choferEnFecha, isContract } from '../calc.js';
import { settings } from '../settings.js';
import { carForm } from './car.js';
import { renderFiles } from '../files.js';

export function multaForm(carId, editId) {
  const ex = editId ? S.multas.find(x => x.id === editId) : null;
  const cars = S.cars.filter(c => !c.vendido).slice().sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  if (!cars.length) { toast('Primero cargá un auto'); return; }
  const c = carById(carId) || cars[0];
  const fecha = ex ? ex.fecha : iso(today());
  const sugerido = choferEnFecha(c, fecha);
  const limiteDefault = ex ? ex.fechaLimitePago : (() => { const d = parse(fecha); d.setDate(d.getDate() + settings.multaPlazoDias); return iso(d); })();
  const h = '<h3>' + (ex ? 'Multa — ' + esc(c.patente) : 'Nueva multa — ' + esc(c.patente)) + '</h3>' +
  '<input type="hidden" id="mu_carid" value="' + esc(c.id) + '">' +
  (ex ? '' : '<label class="f"><span>Auto</span><select id="mu_car" onchange="onMultaCar()">' + cars.map(x => '<option value="' + x.id + '"' + (x.id === c.id ? ' selected' : '') + '>' + esc(x.patente) + '</option>').join('') + '</select></label>') +
  '<div class="two"><label class="f"><span>N° de acta</span><input id="mu_acta" value="' + esc(ex ? ex.numeroActa : '') + '"></label>' +
  '<label class="f"><span>Fecha de la infracción</span><input id="mu_fecha" type="date" value="' + esc(fecha) + '" onchange="onMultaFecha()"></label></div>' +
  '<div class="two"><label class="f"><span>Tipo de infracción</span><select id="mu_tipo">' + TIPOS_INFRACCION.map(x => '<option value="' + x[0] + '"' + (ex && ex.tipoInfraccion === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Organismo / jurisdicción</span><input id="mu_organismo" value="' + esc(ex ? ex.organismo : '') + '"></label></div>' +
  '<div class="two"><label class="f"><span>Monto</span><input id="mu_monto" inputmode="decimal" value="' + esc(ex ? ex.monto : '') + '"></label>' +
  '<label class="f"><span>Fecha límite de pago</span><input id="mu_limite" type="date" value="' + esc(limiteDefault) + '"></label></div>' +
  '<label class="f"><span>Estado</span><select id="mu_estado">' + MULTA_ESTADOS.map(x => '<option value="' + x[0] + '"' + ((ex ? ex.estado : 'pendiente') === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Chofer responsable</span><select id="mu_chofer" onchange="this.dataset.touched=1">' +
    '<option value="">Sin asignar (a cargo de la empresa)</option>' +
    S.drivers.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))).map(d => '<option value="' + d.id + '"' + ((ex ? ex.choferId : sugerido) === d.id ? ' selected' : '') + '>' + esc(d.nombre) + '</option>').join('') +
  '</select></label>' +
  '<div id="mu_hint" class="small muted" style="margin:-4px 0 12px">' + (sugerido && !ex ? 'Sugerido según el historial: ' + esc(driverName(sugerido)) : '') + '</div>' +
  '<label class="chk"><input type="checkbox" id="mu_descontarDeposito"' + (ex && ex.descontadaDeposito ? ' checked disabled' : '') + '><span>' + (ex && ex.descontadaDeposito ? 'Ya descontada del depósito de garantía' : 'Descontar del depósito de garantía al guardar') + '</span></label>' +
  (isContract(c) ? '<label class="chk"><input type="checkbox" id="mu_descontar"' + (ex && ex.descontada ? ' checked disabled' : '') + '><span>' + (ex && ex.descontada ? 'Ya sumada a la deuda del chofer' : 'Sumar el monto a la deuda del chofer responsable al guardar') + '</span></label>' : '') +
  '<label class="f"><span>Notas</span><textarea id="mu_notas">' + esc(ex ? ex.notas : '') + '</textarea></label>' +
  '<div class="sec-t">Archivos</div><div id="files"></div><div id="fstatus" class="small" style="margin:-4px 0 12px;overflow-wrap:anywhere"></div>' +
  '<div class="row"><button class="btn grow" onclick="saveMulta(' + (ex ? "'" + ex.id + "'" : 'null') + ')">Guardar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
  renderFiles('multas', ex ? ex.id : null);
}
export function onMultaCar() {
  const hid = $('#mu_carid'); const sel = $('#mu_car');
  if (hid && sel) hid.value = sel.value;
  refrescarSugerido();
}
export function onMultaFecha() { refrescarSugerido(); }
function refrescarSugerido() {
  const c = carById(val('mu_carid'));
  const fecha = val('mu_fecha'); if (!c || !fecha) return;
  const sug = choferEnFecha(c, fecha);
  const hint = $('#mu_hint'); if (hint) hint.textContent = sug ? 'Sugerido según el historial: ' + driverName(sug) : '';
  const sel = $('#mu_chofer'); if (sel && !sel.dataset.touched && sug) sel.value = sug;
}
export async function saveMulta(editId) {
  const monto = +val('mu_monto');
  if (!monto || monto <= 0) { toast('Poné el monto de la multa'); return; }
  const carId = val('mu_carid');
  const c = carById(carId);
  if (!c) { toast('Elegí el auto'); return; }
  const o = {
    id: editId || uid(), carId, numeroActa: val('mu_acta'), fecha: val('mu_fecha') || iso(today()),
    tipoInfraccion: val('mu_tipo'), organismo: val('mu_organismo'), monto,
    fechaLimitePago: val('mu_limite'), estado: val('mu_estado'), choferId: val('mu_chofer'),
    notas: val('mu_notas'), descontada: (editId && (S.multas.find(x => x.id === editId) || {}).descontada) || false,
    descontadaDeposito: (editId && (S.multas.find(x => x.id === editId) || {}).descontadaDeposito) || false,
    files: (editId && (S.multas.find(x => x.id === editId) || {}).files) || [],
  };
  if (!(await save('multas', o))) return;
  const chk = document.getElementById('mu_descontar');
  if (chk && chk.checked && !chk.disabled) await descontarMultaDeDeuda(o.id);
  const chkDep = document.getElementById('mu_descontarDeposito');
  if (chkDep && chkDep.checked && !chkDep.disabled) await descontarMultaDeDeposito(o.id);
  if (!editId) { toast('Multa registrada. Podés adjuntar el acta o el comprobante.'); multaForm(carId, o.id); }
  else { closeModal(); toast('Multa guardada'); }
}
export async function descontarMultaDeDeuda(multaId) {
  const m = S.multas.find(x => x.id === multaId);
  if (!m || !m.choferId) { toast('Asigná primero un chofer responsable'); return; }
  const c = carById(m.carId);
  if (!c || !isContract(c)) { toast('El auto no tiene un contrato de alquiler o financiación activo'); return; }
  if (m.descontada) return;
  const ajuste = { id: uid(), fecha: iso(today()), monto: -Math.abs(m.monto), motivo: 'Multa' + (m.numeroActa ? ' Nº ' + m.numeroActa : '') + (m.tipoInfraccion ? ' (' + (TIPOS_INFRACCION.find(x => x[0] === m.tipoInfraccion) || [0, m.tipoInfraccion])[1] + ')' : ''), multaId: m.id };
  const ajustesDeuda = (c.ajustesDeuda || []).concat([ajuste]);
  if (!(await save('cars', Object.assign({}, c, { ajustesDeuda })))) return;
  await save('multas', Object.assign({}, m, { descontada: true }));
  toast('Multa sumada a la deuda del chofer');
}
export async function descontarMultaDeDeposito(multaId) {
  const m = S.multas.find(x => x.id === multaId);
  if (!m || !m.choferId) { toast('Asigná primero un chofer responsable'); return; }
  if (m.descontadaDeposito) return;
  const o = { id: uid(), driverId: m.choferId, fecha: iso(today()), monto: -Math.abs(m.monto), tipo: 'descuento_multa', nota: 'Multa' + (m.numeroActa ? ' Nº ' + m.numeroActa : '') };
  if (!(await save('depositos', o))) return;
  await save('multas', Object.assign({}, m, { descontadaDeposito: true }));
  toast('Multa descontada del depósito de garantía');
}
export async function delMulta(id) {
  const m = S.multas.find(x => x.id === id);
  if (await remove('multas', id)) { toast('Multa borrada'); if (m) carForm(m.carId); }
}
