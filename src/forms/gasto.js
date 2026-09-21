import { val, uid, iso, today, esc } from '../utils.js';
import { GASTO_CATS } from '../constants.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { carById } from '../calc.js';

export function gastoForm(carId) {
  const c = carById(carId);
  if (!c) { toast('Auto no encontrado'); return; }
  const h = '<h3>Nuevo gasto — ' + esc(c.patente) + '</h3>' +
  '<div class="two"><label class="f"><span>Categoría</span><select id="g_cat">' + GASTO_CATS.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Fecha</span><input id="g_fecha" type="date" value="' + iso(today()) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Costo</span><input id="g_costo" inputmode="decimal"></label>' +
  '<label class="f"><span>Km (opcional)</span><input id="g_km" inputmode="numeric"></label></div>' +
  '<label class="f"><span>Proveedor / taller</span><input id="g_proveedor"></label>' +
  '<label class="f"><span>Descripción</span><textarea id="g_desc"></textarea></label>' +
  '<div class="row"><button class="btn grow" onclick="saveGasto(\'' + c.id + '\')">Guardar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function saveGasto(carId) {
  const costo = +val('g_costo');
  if (!costo || costo <= 0) { toast('Poné el costo del gasto'); return; }
  const o = { id: uid(), carId, categoria: val('g_cat'), fecha: val('g_fecha') || iso(today()), costo, km: val('g_km'), proveedor: val('g_proveedor'), descripcion: val('g_desc') };
  if (await save('gastos', o)) { closeModal(); toast('Gasto registrado'); }
}
export async function delGasto(id) { if (await remove('gastos', id)) toast('Gasto borrado'); }
