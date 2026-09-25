import { $, val, uid, iso, today, esc } from '../utils.js';
import { S } from '../state.js';
import { TIPOS_SINIESTRO, SINIESTRO_ESTADOS, RESPONSABLE_SINIESTRO } from '../constants.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { carById, choferEnFecha, driverName, proveedoresActivos, isContract } from '../calc.js';
import { carForm } from './car.js';
import { renderFiles } from '../files.js';
import { registrarPagoAutoseguro, saldoAutoseguro } from '../autoseguro.js';

function proveedoresParaSelect(actualId) {
  const L = proveedoresActivos();
  if (actualId && !L.some(p => p.id === actualId)) {
    const actual = S.proveedores.find(p => p.id === actualId);
    if (actual) return [actual].concat(L);
  }
  return L;
}
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
  '<div class="two"><label class="f"><span>Responsable</span><select id="si_responsable" onchange="document.getElementById(\'siCobroBox\').style.display=this.value===\'chofer\'?\'\':\'none\'">' + RESPONSABLE_SINIESTRO.map(x => '<option value="' + x[0] + '"' + ((ex ? ex.responsable : '') === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Franquicia del seguro <small>opcional</small></span><input id="si_franquicia" inputmode="decimal" value="' + esc(ex && ex.franquicia || '') + '"></label></div>' +
  '<label class="f"><span>Taller / proveedor</span><select id="si_proveedor"><option value="">Sin especificar</option>' + proveedoresParaSelect(ex && ex.proveedorId).map(p => '<option value="' + p.id + '"' + (ex && ex.proveedorId === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>N° de siniestro <small>aseguradora, opcional</small></span><input id="si_numero" value="' + esc(ex ? ex.numeroSiniestro : '') + '"></label>' +
  '<div class="sec-t">Datos del tercero <small class="muted">si aplica</small></div>' +
  '<div class="two"><label class="f"><span>Nombre</span><input id="si_terceroNombre" value="' + esc(ex ? ex.terceroNombre : '') + '"></label>' +
  '<label class="f"><span>Teléfono</span><input id="si_terceroTel" type="tel" value="' + esc(ex ? ex.terceroTel : '') + '"></label></div>' +
  '<div class="two"><label class="f"><span>Patente</span><input id="si_terceroPatente" value="' + esc(ex ? ex.terceroPatente : '') + '" autocapitalize="characters"></label>' +
  '<label class="f"><span>Aseguradora</span><input id="si_terceroAseguradora" value="' + esc(ex ? ex.terceroAseguradora : '') + '"></label></div>' +
  '<div class="two"><label class="f"><span>Costo de reparación</span><input id="si_costoTaller" inputmode="decimal" value="' + esc(ex && ex.costoTaller || '') + '"></label>' +
  '<label class="f"><span>Recuperado del seguro</span><input id="si_montoSeguro" inputmode="decimal" value="' + esc(ex && ex.montoSeguro || '') + '"></label></div>' +
  '<label class="f"><span>Estado</span><select id="si_estado">' + SINIESTRO_ESTADOS.map(x => '<option value="' + x[0] + '"' + ((ex ? ex.estado : 'abierto') === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="chk"><input type="checkbox" id="si_gasto"' + (ex && ex.gastoGenerado ? ' checked disabled' : '') + '><span>' + (ex && ex.gastoGenerado ? 'Ya se registró el costo neto como gasto' : 'Registrar el costo neto (reparación − seguro) como gasto del auto al guardar') + '</span></label>' +
  '<label class="chk"><input type="checkbox" id="si_autoseguro"' + (ex && ex.pagadoAutoseguro ? ' checked disabled' : '') + '><span>' + (ex && ex.pagadoAutoseguro ? 'Costo neto ya pagado desde el fondo de autoseguro' : 'Pagar el costo neto desde el fondo de autoseguro al guardar (saldo actual: ' + Math.round(saldoAutoseguro()).toLocaleString('es-AR') + ')') + '</span></label>' +
  '<div id="siCobroBox" style="display:' + ((ex ? ex.responsable : '') === 'chofer' ? '' : 'none') + '">' +
  '<label class="chk"><input type="checkbox" id="si_descontarDeposito"' + (ex && ex.costoDescontadoDeposito ? ' checked disabled' : '') + '><span>' + (ex && ex.costoDescontadoDeposito ? 'Costo neto ya descontado del depósito de garantía' : 'Descontar el costo neto del depósito de garantía al guardar') + '</span></label>' +
  (isContract(c) ? '<label class="chk"><input type="checkbox" id="si_descontarDeuda"' + (ex && ex.costoDescontadoDeuda ? ' checked disabled' : '') + '><span>' + (ex && ex.costoDescontadoDeuda ? 'Costo neto ya sumado a la deuda del chofer' : 'Sumar el costo neto a la deuda del chofer al guardar') + '</span></label>' : '') +
  '</div>' +
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
    responsable: val('si_responsable'), franquicia: +val('si_franquicia') || 0, proveedorId: val('si_proveedor'),
    numeroSiniestro: val('si_numero'),
    terceroNombre: val('si_terceroNombre'), terceroTel: val('si_terceroTel'),
    terceroPatente: val('si_terceroPatente').toUpperCase(), terceroAseguradora: val('si_terceroAseguradora'),
    costoTaller: +val('si_costoTaller') || 0, montoSeguro: +val('si_montoSeguro') || 0,
    estado: val('si_estado'), notas: val('si_notas'),
    gastoGenerado: (ex && ex.gastoGenerado) || false,
    costoDescontadoDeposito: (ex && ex.costoDescontadoDeposito) || false,
    costoDescontadoDeuda: (ex && ex.costoDescontadoDeuda) || false,
    pagadoAutoseguro: (ex && ex.pagadoAutoseguro) || false,
    files: (ex && ex.files) || [],
  };
  if (!(await save('siniestros', o))) return;
  const chk = document.getElementById('si_gasto');
  if (chk && chk.checked && !chk.disabled) await generarGastoSiniestro(o.id);
  const chkDep = document.getElementById('si_descontarDeposito');
  if (chkDep && chkDep.checked && !chkDep.disabled) await descontarSiniestroDeDeposito(o.id);
  const chkDeuda = document.getElementById('si_descontarDeuda');
  if (chkDeuda && chkDeuda.checked && !chkDeuda.disabled) await descontarSiniestroDeDeuda(o.id);
  const chkAutoseguro = document.getElementById('si_autoseguro');
  if (chkAutoseguro && chkAutoseguro.checked && !chkAutoseguro.disabled) await pagarSiniestroDesdeAutoseguro(o.id);
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
export async function descontarSiniestroDeDeuda(siniestroId) {
  const s = S.siniestros.find(x => x.id === siniestroId);
  if (!s || !s.choferId) { toast('Asigná primero un chofer'); return; }
  const c = carById(s.carId);
  if (!c || !isContract(c)) { toast('El auto no tiene un contrato de alquiler o financiación activo'); return; }
  if (s.costoDescontadoDeuda) return;
  const neto = Math.max(0, (+s.costoTaller || 0) - (+s.montoSeguro || 0));
  if (!neto) { toast('No hay costo neto para cobrar (el seguro cubrió todo)'); return; }
  const ajuste = { id: uid(), fecha: iso(today()), monto: -neto, motivo: 'Siniestro' + (s.numeroSiniestro ? ' Nº ' + s.numeroSiniestro : '') + (s.lugar ? ' en ' + s.lugar : ''), siniestroId: s.id };
  const ajustesDeuda = (c.ajustesDeuda || []).concat([ajuste]);
  if (!(await save('cars', Object.assign({}, c, { ajustesDeuda })))) return;
  await save('siniestros', Object.assign({}, s, { costoDescontadoDeuda: true }));
  toast('Costo neto sumado a la deuda del chofer');
}
export async function descontarSiniestroDeDeposito(siniestroId) {
  const s = S.siniestros.find(x => x.id === siniestroId);
  if (!s || !s.choferId) { toast('Asigná primero un chofer'); return; }
  if (s.costoDescontadoDeposito) return;
  const neto = Math.max(0, (+s.costoTaller || 0) - (+s.montoSeguro || 0));
  if (!neto) { toast('No hay costo neto para cobrar (el seguro cubrió todo)'); return; }
  const o = { id: uid(), driverId: s.choferId, fecha: iso(today()), monto: -neto, tipo: 'descuento_siniestro', nota: 'Siniestro' + (s.numeroSiniestro ? ' Nº ' + s.numeroSiniestro : '') };
  if (!(await save('depositos', o))) return;
  await save('siniestros', Object.assign({}, s, { costoDescontadoDeposito: true }));
  toast('Costo neto descontado del depósito de garantía');
}
export async function pagarSiniestroDesdeAutoseguro(siniestroId) {
  const s = S.siniestros.find(x => x.id === siniestroId);
  if (!s || s.pagadoAutoseguro) return;
  const neto = Math.max(0, (+s.costoTaller || 0) - (+s.montoSeguro || 0));
  if (!neto) { toast('No hay costo neto para pagar (el seguro cubrió todo)'); return; }
  const c = carById(s.carId);
  registrarPagoAutoseguro(neto, 'Siniestro' + (s.numeroSiniestro ? ' Nº ' + s.numeroSiniestro : '') + (c ? ' · ' + c.patente : ''), s.tipo);
  await save('siniestros', Object.assign({}, s, { pagadoAutoseguro: true }));
  toast('Costo neto pagado desde el fondo de autoseguro');
}
export async function delSiniestro(id) {
  const s = S.siniestros.find(x => x.id === id);
  if (await remove('siniestros', id)) { toast('Siniestro borrado'); if (s) carForm(s.carId); }
}
