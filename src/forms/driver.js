import { S } from '../state.js';
import { esc, val, uid, money } from '../utils.js';
import { DOCS } from '../constants.js';
import { plate, driverDebt } from '../calc.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { renderFiles, purgeFiles } from '../files.js';

export function driverForm(id) {
  const ex = S.drivers.find(x => x.id === id);
  const d = ex || { docs: {} };
  let h = '<h3>' + (ex ? esc(d.nombre) : 'Nuevo chofer') + '</h3>';
  if (ex) {
    const cars = S.cars.filter(c => c.choferId === d.id); const debt = driverDebt(d.id);
    h += '<div class="card"><div class="row between"><span class="muted">Autos</span><span>' + (cars.length ? cars.map(c => plate(c.patente)).join(' ') : 'Ninguno') + '</span></div>' +
    '<div class="row between"><span class="muted">Deuda</span><b style="color:' + (debt > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + money(debt) + '</b></div></div>';
  }
  h += '<label class="f"><span>Nombre y apellido</span><input id="d_nombre" value="' + esc(d.nombre) + '"></label>' +
  '<div class="two"><label class="f"><span>DNI</span><input id="d_dni" inputmode="numeric" value="' + esc(d.dni) + '"></label>' +
  '<label class="f"><span>Vence la licencia</span><input id="d_lic" type="date" value="' + esc(d.licVenc) + '"></label></div>' +
  '<label class="f"><span>Teléfono <small>con código de país, ej: +5491155551234</small></span><input id="d_tel" type="tel" value="' + esc(d.tel) + '"></label>' +
  '<label class="f"><span>Domicilio</span><input id="d_dom" value="' + esc(d.domicilio) + '"></label>' +
  '<div class="sec-t">Documentación entregada</div>' + DOCS.map(x => '<label class="chk"><input type="checkbox" id="dc_' + x[0] + '"' + (d.docs && d.docs[x[0]] ? ' checked' : '') + '><span>' + x[1] + '</span></label>').join('') +
  '<div class="sec-t">Archivos</div><div id="files"></div><div id="fstatus" class="small" style="margin:-4px 0 12px;overflow-wrap:anywhere"></div>' +
  '<label class="f" style="margin-top:14px"><span>Notas</span><textarea id="d_notas">' + esc(d.notas) + '</textarea></label>' +
  '<div class="row"><button class="btn grow" onclick="saveDriver(' + (ex ? "'" + d.id + "'" : 'null') + ')">Guardar</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>';
  if (ex) h += '<div style="margin-top:20px"><button class="btn danger block" onclick="confirmDel(this,()=>delDriver(\'' + d.id + '\'))">Eliminar chofer</button></div>';
  openModal(h); renderFiles('drivers', ex ? ex.id : null);
}
export async function saveDriver(id) {
  const nombre = val('d_nombre');
  if (!nombre) { toast('Falta el nombre'); return; }
  const docs = {}; DOCS.forEach(x => { docs[x[0]] = document.getElementById('dc_' + x[0]).checked; });
  const o = { id: id || uid(), nombre, dni: val('d_dni'), licVenc: val('d_lic'), tel: val('d_tel'), domicilio: val('d_dom'), notas: val('d_notas'), docs, files: ((S.drivers.find(x => x.id === id) || {}).files) || [] };
  if (await save('drivers', o)) { closeModal(); toast('Chofer guardado'); }
}
export async function delDriver(id) {
  await purgeFiles(S.drivers.find(x => x.id === id));
  for (const c of S.cars.filter(c => c.choferId === id)) await save('cars', Object.assign({}, c, { choferId: '', tipo: 'disponible' }));
  if (await remove('drivers', id)) { closeModal(); toast('Chofer eliminado'); }
}
