import { $, val, uid, iso, today, esc } from '../utils.js';
import { S } from '../state.js';
import { TIPOS_SINIESTRO, SINIESTRO_ESTADOS } from '../constants.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { carById, choferEnFecha, driverName } from '../calc.js';
import { carForm } from './car.js';
import { renderFiles } from '../files.js';

export function siniestroForm(carId, editId) {
  const ex = editId ? S.siniestros.find(x => x.id === editId) : null;
  const cars = S.cars.filter(c => !c.vendido).slice().sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  if (!cars.length) { toast('Primero cargá un auto'); return; }
  const c = carById(carId) || cars[0];
  const fecha = ex ? ex.fecha : iso(today());
  const sugerido = choferEnFecha(c, fecha);
  const h = '<h3>' + (ex ? 'Siniestro — ' + esc(c.patente) : 'Nuevo siniestro — ' + esc(c.patente)) + '</h3>' +
  '<input type="hidden" id="si_carid" value="' + esc(c.id) + '">' +
  (ex ? '' : '<label class="f"><span>Auto</span><select id="si_car" onchange="onSiniestroCar()">' + cars.map(x => '<option value="' + x.id + '"' + (x.id === c.id ? ' selected' : '') + '>' + esc(x.patente) + '</option>').join('') + '</select></label>') +
  '<div class="two"><label class="f"><span>Tipo</span><select id="si_tipo">' + TIPOS_SINIESTRO.map(x => '<option value="' + x[0] + '"' + (ex && ex.tipo === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Fecha</span><input id="si_fecha" type="date" value="' + esc(fecha) + '" onchange="onSiniestroFecha()"></label></div>' +
  '<label class="f"><span>Lugar</span><input id="si_lugar" value="' + esc(ex ? ex.lugar : '') + '"></label>' +
  '<label class="f"><span>Chofer al mando</span><select id="si_chofer" onchange="this.dataset.touched=1">' +
    '<option value="">Sin asignar</option>' +
    S.drivers.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))).map(d => '<option value="' + d.id + '"' + ((ex ? ex.choferId : sugerido) === d.id ? ' selected' : '') + '>' + esc(d.nombre) + '</option>').join('') +
  '</select></label>' +
  '<div id="si_hint" class="small muted" style="margin:-4px 0 12px">' + (sugerido && !ex ? 'Sugerido según el historial: ' + esc(driverName(sugerido)) : '') + '</div>' +
  '<label class="f"><span>Descripción</span><textarea id="si_desc">' + esc(ex ? ex.descripcion : '') + '</textarea></label>' +
  '<div class="two"><label class="f"><span>Costo de reparación</span><input id="si_costoTaller" inputmode="decimal" value="' + esc(ex && ex.costoTaller || '') + '"></label>' +
  '<label class="f"><span>Recuperado del seguro</span><input id="si_montoSeguro" inputmode="decimal" value="' + esc(ex && ex.montoSeguro || '') + '"></label></div>' +
  '<label class="f"><span>Estado</span><select id="si_estado">' + SINIESTRO_ESTADOS.map(x => '<option value="' + x[0] + '"' + ((ex ? ex.estado : 'abierto') === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="chk"><input type="checkbox" id="si_gasto"' + (ex && ex.gastoGenerado ? ' checked disabled' : '') + '><span>' + (ex && ex.gastoGenerado ? 'Ya se registró el costo neto como gasto' : 'Registrar el costo neto (reparación − seguro) como gasto del auto al guardar') + '</span></label>' +
  '<label class="f"><span>Notas</span><textarea id="si_notas">' + esc(ex ? ex.notas : '') + '</textarea></label>' +
  '<div class="sec-t">Archivos</div><div id="files"></div><div id="fstatus" class="small" style="margin:-4px 0 12px;overflow-wrap:anywhere"></div>' +
  '<div class="row"><button class="btn grow" onclick="saveSiniestro(' + (ex ? "'" + ex.id + "'" : 'null') + ')">Guardar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
  renderFiles('siniestros', ex ? ex.id : null);
}
export function onSiniestroCar() {
  const hid = $('#si_carid'); const sel = $('#si_car');
  if (hid && sel) hid.value = sel.value;
  refrescarSugerido();
}
export function onSiniestroFecha() { refrescarSugerido(); }
function refrescarSugerido() {
  const c = carById(val('si_carid'));
  const fecha = val('si_fecha'); if (!c || !fecha) return;
  const sug = choferEnFecha(c, fecha);
  const hint = $('#si_hint'); if (hint) hint.textContent = sug ? 'Sugerido según el historial: ' + driverName(sug) : '';
  const sel = $('#si_chofer'); if (sel && !sel.dataset.touched && sug) sel.value = sug;
}
export async function saveSiniestro(editId) {
  const carId = val('si_carid');
  const c = carById(carId);
  if (!c) { toast('Elegí el auto'); return; }
  const ex = editId ? S.siniestros.find(x => x.id === editId) : null;
  const o = {
    id: editId || uid(), carId, tipo: val('si_tipo'), fecha: val('si_fecha') || iso(today()),
    lugar: val('si_lugar'), choferId: val('si_chofer'), descripcion: val('si_desc'),
    costoTaller: +val('si_costoTaller') || 0, montoSeguro: +val('si_montoSeguro') || 0,
    estado: val('si_estado'), notas: val('si_notas'),
    gastoGenerado: (ex && ex.gastoGenerado) || false,
    files: (ex && ex.files) || [],
  };
  if (!(await save('siniestros', o))) return;
  const chk = document.getElementById('si_gasto');
  if (chk && chk.checked && !chk.disabled) await generarGastoSiniestro(o.id);
  if (!editId) { toast('Siniestro registrado. Podés adjuntar fotos o el parte.'); siniestroForm(carId, o.id); }
  else { closeModal(); toast('Siniestro guardado'); }
}
export async function generarGastoSiniestro(siniestroId) {
  const s = S.siniestros.find(x => x.id === siniestroId);
  if (!s || s.gastoGenerado) return;
  const neto = Math.max(0, (+s.costoTaller || 0) - (+s.montoSeguro || 0));
  if (!neto) { toast('No hay costo neto para registrar (el seguro cubrió todo)'); return; }
  const gasto = { id: uid(), carId: s.carId, categoria: 'siniestro', fecha: s.fecha, costo: neto, descripcion: 'Siniestro' + (s.lugar ? ' en ' + s.lugar : ''), siniestroId: s.id };
  if (!(await save('gastos', gasto))) return;
  await save('siniestros', Object.assign({}, s, { gastoGenerado: true }));
  toast('Costo neto del siniestro registrado como gasto');
}
export async function delSiniestro(id) {
  const s = S.siniestros.find(x => x.id === id);
  if (await remove('siniestros', id)) { toast('Siniestro borrado'); if (s) carForm(s.carId); }
}
