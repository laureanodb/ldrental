import { val, uid, iso, today, esc } from '../utils.js';
import { S } from '../state.js';
import { GASTO_CATS } from '../constants.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { carById, proveedoresActivos } from '../calc.js';
import { carForm } from './car.js';

export function gastoForm(carId) {
  const c = carById(carId);
  if (!c) { toast('Auto no encontrado'); return; }
  const h = '<h3>Nuevo gasto — ' + esc(c.patente) + '</h3>' +
  '<div class="two"><label class="f"><span>Categoría</span><select id="g_cat">' + GASTO_CATS.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Fecha</span><input id="g_fecha" type="date" value="' + iso(today()) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Costo</span><input id="g_costo" inputmode="decimal"></label>' +
  '<label class="f"><span>Km (opcional)</span><input id="g_km" inputmode="numeric"></label></div>' +
  '<label class="f"><span>Proveedor / taller</span><select id="g_proveedorSel" onchange="document.getElementById(\'g_proveedorOtroBox\').style.display=this.value===\'__otro__\'?\'\':\'none\'"><option value="">Sin especificar</option>' + proveedoresActivos().map(p => '<option value="' + esc(p.nombre) + '">' + esc(p.nombre) + '</option>').join('') + '<option value="__otro__">Otro (escribir)</option></select></label>' +
  '<div id="g_proveedorOtroBox" style="display:none"><label class="f"><span>Nombre del proveedor</span><input id="g_proveedorOtro"></label></div>' +
  '<label class="f"><span>Descripción</span><textarea id="g_desc"></textarea></label>' +
  '<label class="chk"><input type="checkbox" id="g_sinFactura"><span>Sin factura</span></label>' +
  '<div class="row"><button class="btn grow" onclick="saveGasto(\'' + c.id + '\')">Guardar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function saveGasto(carId) {
  const costo = +val('g_costo');
  if (!costo || costo <= 0) { toast('Poné el costo del gasto'); return; }
  const selProveedor = val('g_proveedorSel');
  const proveedor = selProveedor === '__otro__' ? val('g_proveedorOtro') : selProveedor;
  const o = { id: uid(), carId, categoria: val('g_cat'), fecha: val('g_fecha') || iso(today()), costo, km: val('g_km'), proveedor, descripcion: val('g_desc'), sinFactura: document.getElementById('g_sinFactura').checked };
  if (await save('gastos', o)) { closeModal(); toast('Gasto registrado'); }
}
export async function delGasto(id) {
  const g = S.gastos.find(x => x.id === id);
  if (await remove('gastos', id)) { toast('Gasto borrado'); if (g) carForm(g.carId); }
}
