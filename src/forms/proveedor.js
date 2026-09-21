import { S } from '../state.js';
import { val, uid, esc } from '../utils.js';
import { openModal, closeModal, toast, confirmDel } from '../modal.js';
import { save, remove } from '../data.js';

export function proveedoresView() {
  const P = S.proveedores.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  let h = '<h3>Proveedores y talleres</h3>';
  h += P.length ? P.map(p => '<div class="card row"><div class="grow"><div>' + esc(p.nombre) + '</div><div class="small muted">' + esc([p.rubro, p.tel].filter(Boolean).join(' · ')) + '</div>' + (p.notas ? '<div class="small muted">' + esc(p.notas) + '</div>' : '') + '</div><button class="btn danger sm" onclick="confirmDel(this,()=>delProveedor(\'' + p.id + '\'))">Borrar</button></div>').join('') : '<div class="small muted" style="margin-bottom:8px">Todavía no cargaste proveedores.</div>';
  h += '<div class="sec-t">Agregar proveedor</div>' +
  '<label class="f"><span>Nombre</span><input id="pr_nombre"></label>' +
  '<div class="two"><label class="f"><span>Rubro</span><input id="pr_rubro" placeholder="Taller, gomería..."></label>' +
  '<label class="f"><span>Teléfono</span><input id="pr_tel" type="tel"></label></div>' +
  '<label class="f"><span>Notas</span><textarea id="pr_notas"></textarea></label>' +
  '<div class="row"><button class="btn grow" onclick="saveProveedor()">Guardar</button><button class="btn sec" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
}
export async function saveProveedor() {
  const nombre = val('pr_nombre');
  if (!nombre) { toast('Falta el nombre'); return; }
  const o = { id: uid(), nombre, rubro: val('pr_rubro'), tel: val('pr_tel'), notas: val('pr_notas') };
  if (await save('proveedores', o)) { toast('Proveedor guardado'); proveedoresView(); }
}
export async function delProveedor(id) { if (await remove('proveedores', id)) { toast('Proveedor borrado'); proveedoresView(); } }
