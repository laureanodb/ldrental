import { val, uid, iso, today, esc, money, fdate } from '../utils.js';
import { S } from '../state.js';
import { STOCK_CATEGORIAS, STOCK_UNIDADES } from '../constants.js';
import { openModal, closeModal, toast, confirmDel } from '../modal.js';
import { save, remove } from '../data.js';
import { repuestoById, proveedoresActivos, preciosPorProveedor } from '../calc.js';
import { canDelete } from '../roles.js';

const unidadLabel = k => (STOCK_UNIDADES.find(x => x[0] === k) || [0, 'Unidad'])[1];

export function repuestoForm(editId) {
  const ex = editId ? repuestoById(editId) : null;
  if (editId && !ex) { toast('Repuesto no encontrado'); return; }
  const h = '<h3>' + (ex ? 'Editar repuesto' : 'Nuevo repuesto') + '</h3>' +
  '<label class="f"><span>Nombre</span><input id="rp_nombre" placeholder="ej: Aceite 5W30 sintético" value="' + esc(ex ? ex.nombre : '') + '"></label>' +
  '<div class="two"><label class="f"><span>Categoría</span><select id="rp_cat">' + STOCK_CATEGORIAS.map(x => '<option value="' + x[0] + '"' + (ex && ex.categoria === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Unidad</span><select id="rp_unidad">' + STOCK_UNIDADES.map(x => '<option value="' + x[0] + '"' + (ex && ex.unidad === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label></div>' +
  (ex ? '<div class="card row between" style="margin-bottom:10px"><span class="muted">Stock actual</span><b>' + (ex.stockActual || 0) + ' ' + esc(unidadLabel(ex.unidad)) + (ex.stockActual === 1 ? '' : 's') + '</b></div>' :
    '<label class="f"><span>Stock inicial</span><input id="rp_stockinicial" inputmode="numeric" value="0"></label>') +
  '<div class="two"><label class="f"><span>Stock mínimo <small>avisa cuando llega a este nivel</small></span><input id="rp_min" inputmode="numeric" value="' + esc(ex ? ex.stockMinimo || '' : '') + '"></label>' +
  '<label class="f"><span>Costo unitario</span><input id="rp_costo" inputmode="decimal" value="' + esc(ex ? ex.costoUnitario || '' : '') + '"></label></div>' +
  '<label class="f"><span>Proveedor <small>opcional</small></span><select id="rp_proveedor"><option value="">Sin especificar</option>' + proveedoresActivos().map(p => '<option value="' + p.id + '"' + (ex && ex.proveedorId === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Notas</span><textarea id="rp_notas">' + esc(ex ? ex.notas : '') + '</textarea></label>' +
  (ex ? '<label class="chk"><input type="checkbox" id="rp_inactivo"' + (ex.inactivo ? ' checked' : '') + '><span>Inactivo (no se cuenta en el stock ni avisa)</span></label>' : '') +
  '<div class="row"><button class="btn grow" onclick="saveRepuesto(' + (ex ? "'" + ex.id + "'" : 'null') + ')">Guardar</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>' +
  (ex ? '<div class="row" style="margin-top:10px"><button class="btn sec grow" onclick="movimientoStockForm(\'' + ex.id + '\',\'entrada\')">+ Entrada (compra)</button><button class="btn sec grow" onclick="movimientoStockForm(\'' + ex.id + '\',\'salida\')">- Salida (uso)</button></div>' : '') +
  (ex ? comparacionPrecios(ex.id) : '') +
  (ex ? historialMovimientos(ex) : '') +
  (ex && canDelete() ? '<div style="margin-top:14px"><button class="btn danger block" onclick="confirmDel(this,()=>delRepuesto(\'' + ex.id + '\'))">Eliminar repuesto</button></div>' : '');
  openModal(h);
}
function comparacionPrecios(repuestoId) {
  const precios = preciosPorProveedor(repuestoId);
  if (precios.length < 2) return '';
  return '<div class="sec-t">Comparación de precios por proveedor</div>' + precios.map(p => '<div class="card row between small"><span>' + esc(p.proveedorNombre) + '</span><span>' + money(p.precioPromedio) + ' <span class="muted">· ' + fdate(p.ultimaFecha) + '</span></span></div>').join('');
}
function historialMovimientos(r) {
  const movs = (r.movimientos || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
  if (!movs.length) return '<div class="sec-t">Movimientos</div><div class="small muted">Todavía no hay movimientos registrados.</div>';
  return '<div class="sec-t">Movimientos</div>' + movs.map(m => {
    const c = m.carId ? S.cars.find(x => x.id === m.carId) : null;
    return '<div class="card row between"><div><div>' + (m.tipo === 'entrada' ? '+ ' : '- ') + m.cantidad + ' ' + esc(unidadLabel(r.unidad)) + '</div>' +
    '<div class="small muted">' + esc(m.fecha) + (c ? ' · ' + esc(c.patente) : '') + (m.nota ? ' · ' + esc(m.nota) : '') + '</div></div>' +
    (canDelete() ? '<button class="btn sec sm" onclick="confirmDel(this,()=>delMovimientoStock(\'' + r.id + '\',\'' + m.id + '\'))">Borrar</button>' : '') + '</div>';
  }).join('');
}
export async function saveRepuesto(editId) {
  const nombre = val('rp_nombre');
  if (!nombre) { toast('Poné el nombre'); return; }
  const ex = editId ? repuestoById(editId) : null;
  const o = {
    id: editId || uid(), nombre, categoria: val('rp_cat'), unidad: val('rp_unidad'),
    stockActual: ex ? (+ex.stockActual || 0) : (+val('rp_stockinicial') || 0),
    stockMinimo: +val('rp_min') || 0, costoUnitario: +val('rp_costo') || 0,
    proveedorId: val('rp_proveedor'), notas: val('rp_notas'),
    movimientos: ex ? (ex.movimientos || []) : [],
    creadoFecha: ex ? ex.creadoFecha : iso(today()),
    inactivo: editId ? document.getElementById('rp_inactivo').checked : false,
  };
  if (await save('repuestos', o)) { closeModal(); toast(ex ? 'Repuesto guardado' : 'Repuesto creado. Registrale un stock inicial con "Entrada" si hace falta ajustarlo.'); }
}
export async function delRepuesto(id) {
  if (await remove('repuestos', id)) { closeModal(); toast('Repuesto borrado'); }
}
export function movimientoStockForm(repuestoId, tipo) {
  const r = repuestoById(repuestoId);
  if (!r) { toast('Repuesto no encontrado'); return; }
  const cars = S.cars.filter(c => !c.vendido).slice().sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  const h = '<h3>' + (tipo === 'entrada' ? 'Entrada de stock (compra)' : 'Salida de stock (uso)') + '</h3>' +
  '<div class="small muted" style="margin-bottom:12px">' + esc(r.nombre) + ' · Stock actual: ' + (r.stockActual || 0) + ' ' + esc(unidadLabel(r.unidad)) + (r.stockActual === 1 ? '' : 's') + '</div>' +
  '<div class="two"><label class="f"><span>Cantidad</span><input id="mv_cantidad" inputmode="decimal"></label>' +
  '<label class="f"><span>Fecha</span><input id="mv_fecha" type="date" value="' + iso(today()) + '"></label></div>' +
  (tipo === 'entrada' ? '<label class="f"><span>Costo unitario</span><input id="mv_costo" inputmode="decimal" value="' + esc(r.costoUnitario || '') + '"></label>' +
    '<label class="f"><span>Proveedor <small>opcional, para comparar precios</small></span><select id="mv_proveedor"><option value="">Sin especificar</option>' + proveedoresActivos().map(p => '<option value="' + p.id + '"' + (r.proveedorId === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') + '</select></label>' +
    '<label class="chk"><input type="checkbox" id="mv_gengasto" checked><span>Generar gasto general por esta compra</span></label>' :
    '<label class="f"><span>Auto <small>opcional, para qué auto se usó</small></span><select id="mv_car"><option value="">Sin especificar</option>' + cars.map(c => '<option value="' + c.id + '">' + esc(c.patente) + '</option>').join('') + '</select></label>') +
  '<label class="f"><span>Nota <small>opcional</small></span><input id="mv_nota"></label>' +
  '<div class="row"><button class="btn grow" onclick="guardarMovimientoStock(\'' + r.id + '\',\'' + tipo + '\')">Guardar</button><button class="btn sec" onclick="repuestoForm(\'' + r.id + '\')">Cancelar</button></div>';
  openModal(h);
}
async function aplicarMovimiento(r, mov, costoUnitario) {
  const stockActual = (+r.stockActual || 0) + (mov.tipo === 'entrada' ? mov.cantidad : -mov.cantidad);
  const o = Object.assign({}, r, { stockActual, costoUnitario: costoUnitario != null ? costoUnitario : r.costoUnitario, movimientos: (r.movimientos || []).concat([mov]) });
  if (!(await save('repuestos', o))) return null;
  return stockActual;
}
export async function registrarSalidaStock(repuestoId, cantidad, fecha, carId, nota) {
  const r = repuestoById(repuestoId);
  if (!r || !cantidad || cantidad <= 0) return false;
  const mov = { id: uid(), tipo: 'salida', cantidad, fecha: fecha || iso(today()), nota };
  if (carId) mov.carId = carId;
  const stockActual = await aplicarMovimiento(r, mov);
  if (stockActual == null) return false;
  if (stockActual < 0) toast('Atención: "' + r.nombre + '" quedó con stock negativo, revisá la carga');
  return true;
}
export async function guardarMovimientoStock(repuestoId, tipo) {
  const r = repuestoById(repuestoId);
  if (!r) return;
  const cantidad = +val('mv_cantidad');
  if (!cantidad || cantidad <= 0) { toast('Poné la cantidad'); return; }
  const fecha = val('mv_fecha') || iso(today());
  const nota = val('mv_nota');
  const mov = { id: uid(), tipo, cantidad, fecha, nota };
  let costoUnitario, generarGasto = null;
  if (tipo === 'entrada') {
    costoUnitario = +val('mv_costo') || r.costoUnitario || 0;
    mov.costoUnitario = costoUnitario;
    const proveedorId = val('mv_proveedor'); if (proveedorId) mov.proveedorId = proveedorId;
    if (document.getElementById('mv_gengasto').checked && costoUnitario) {
      generarGasto = { id: uid(), carId: '', categoria: 'repuestos', fecha, costo: cantidad * costoUnitario, descripcion: 'Compra: ' + r.nombre + ' (' + cantidad + ' ' + unidadLabel(r.unidad) + (cantidad === 1 ? '' : 's') + ')', generadoAuto: true };
    }
  } else {
    const carId = val('mv_car'); if (carId) mov.carId = carId;
  }
  const stockActual = await aplicarMovimiento(r, mov, costoUnitario);
  if (stockActual == null) return;
  if (tipo === 'salida' && stockActual < 0) toast('Atención: el stock quedó en negativo, revisá la carga');
  if (generarGasto) await save('gastos', generarGasto);
  closeModal(); toast('Movimiento registrado'); repuestoForm(r.id);
}
export async function delMovimientoStock(repuestoId, movId) {
  const r = repuestoById(repuestoId);
  if (!r) return;
  const mov = (r.movimientos || []).find(m => m.id === movId);
  if (!mov) return;
  const stockActual = (+r.stockActual || 0) - (mov.tipo === 'entrada' ? mov.cantidad : -mov.cantidad);
  const o = Object.assign({}, r, { stockActual, movimientos: (r.movimientos || []).filter(m => m.id !== movId) });
  if (await save('repuestos', o)) { toast('Movimiento borrado'); repuestoForm(r.id); }
}
