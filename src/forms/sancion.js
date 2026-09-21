import { val, uid, iso, today, esc } from '../utils.js';
import { S } from '../state.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { driverForm } from './driver.js';

export function sancionForm(driverId) {
  const d = S.drivers.find(x => x.id === driverId);
  if (!d) { toast('Chofer no encontrado'); return; }
  const h = '<h3>Nueva sanción — ' + esc(d.nombre) + '</h3>' +
  '<label class="f"><span>Fecha</span><input id="s_fecha" type="date" value="' + iso(today()) + '"></label>' +
  '<label class="f"><span>Motivo</span><textarea id="s_motivo"></textarea></label>' +
  '<div class="row"><button class="btn grow" onclick="saveSancion(\'' + d.id + '\')">Guardar</button><button class="btn sec" onclick="driverForm(\'' + d.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function saveSancion(driverId) {
  const motivo = val('s_motivo');
  if (!motivo) { toast('Contá qué pasó'); return; }
  const o = { id: uid(), driverId, fecha: val('s_fecha') || iso(today()), motivo };
  if (await save('sanciones', o)) { closeModal(); toast('Sanción registrada'); }
}
export async function delSancion(id) {
  const s = S.sanciones.find(x => x.id === id);
  if (await remove('sanciones', id)) { toast('Sanción borrada'); if (s) driverForm(s.driverId); }
}
