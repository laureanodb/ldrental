import { val, uid, iso, today, esc, money, fdate, num1 } from '../utils.js';
import { S } from '../state.js';
import { STOCK_CATEGORIAS, STOCK_UNIDADES, PANOL_TIPOS } from '../constants.js';
import { openModal, closeModal, toast, confirmDel } from '../modal.js';
import { save, remove } from '../data.js';
import { repuestoById, proveedoresActivos, preciosPorProveedor } from '../calc.js';
import { canDelete } from '../roles.js';
import { de } from '../memo.js';
import { settings, saveSettings } from '../settings.js';
import { saveFile } from '../backup.js';
import {
  tipoDe, tipoPorCategoria, tipoLabel, catLabel, unidadLabel, unidades, deltaMov, stockDe, costoDe, precioReposicion, fechaPrecioReposicion,
  valorItem, costoPromedioNuevo, consumoDiario, coberturaDias, ultimoMovimiento, itemsActivos, modelosFlota, esCompatible, resumenPanol,
} from '../panol.js';

const cant = (r, n) => num1(+n || 0) + ' ' + unidades(r, n);
const ubicaciones = () => [...new Set(S.repuestos.map(r => (r.ubicacion || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const quienes = () => [...new Set(S.drivers.filter(d => !d.inactivo && !d.prospecto).map(d => d.nombre).concat(proveedoresActivos().map(p => p.nombre)).filter(Boolean))];

function fichaValores(r) {
  const cob = coberturaDias(r), cm = consumoDiario(r) * 30, pr = precioReposicion(r), fpr = fechaPrecioReposicion(r);
  const fila = (l, v) => '<div class="row between small" style="padding:3px 0"><span class="muted">' + l + '</span><b>' + v + '</b></div>';
  return '<div class="card" style="margin-bottom:12px">' +
    fila('Stock', cant(r, stockDe(r))) +
    fila('Costo promedio', money(costoDe(r)) + ' / ' + unidadLabel(r.unidad).toLowerCase()) +
    fila('Valor al costo', money(valorItem(r, 'costo'))) +
    (pr ? fila('Precio de reposición' + (fpr ? ' (' + fdate(fpr) + ')' : ''), money(pr)) + fila('Valor a reposición', money(valorItem(r, 'reposicion'))) : '') +
    (tipoDe(r) !== 'herramienta' ? fila('Consumo', cm ? num1(cm) + ' ' + unidades(r, cm) + ' por mes' : 'sin salidas en 90 días') : '') +
    (cob != null ? fila('Te alcanza para', cob >= 365 ? 'más de un año' : '~' + cob + ' día' + (cob === 1 ? '' : 's')) : '') +
    (ultimoMovimiento(r) ? fila('Último movimiento', fdate(ultimoMovimiento(r))) : '') +
    (r.ultimoInventario ? fila('Último inventario', fdate(r.ultimoInventario)) : '') +
    (r.prestadaA ? fila('Prestada a', esc(r.prestadaA) + (r.prestadaDesde ? ' desde el ' + fdate(r.prestadaDesde) : '')) : '') +
  '</div>';
}

export function repuestoForm(editId) {
  const ex = editId ? repuestoById(editId) : null;
  if (editId && !ex) { toast('Ítem no encontrado'); return; }
  const tipo = ex ? tipoDe(ex) : 'consumible';
  const cat = ex ? ex.categoria : STOCK_CATEGORIAS.find(x => x[2] === tipo)[0];
  const modelos = modelosFlota(), compat = (ex && ex.compatibles) || [];
  const esHerr = tipo === 'herramienta';
  const h = '<h3>' + (ex ? esc(ex.nombre) : 'Nuevo ítem del pañol') + '</h3>' +
  (ex ? fichaValores(ex) : '') +
  (ex ? '<div class="row" style="margin-bottom:12px">' +
    '<button class="btn sec grow" onclick="movimientoStockForm(\'' + ex.id + '\',\'entrada\')">+ Entrada (compra)</button>' +
    (esHerr ? (ex.prestadaA ? '<button class="btn sec grow" onclick="devolverHerramienta(\'' + ex.id + '\')">Devuelta</button>' : '<button class="btn sec grow" onclick="prestarHerramientaForm(\'' + ex.id + '\')">Prestar</button>') +
      '<button class="btn sec grow" onclick="movimientoStockForm(\'' + ex.id + '\',\'salida\')">Baja</button>' :
      '<button class="btn sec grow" onclick="movimientoStockForm(\'' + ex.id + '\',\'salida\')">- Salida (uso)</button><button class="btn sec grow" onclick="ventaPanolForm(\'' + ex.id + '\')">Vender</button>') +
  '</div>' : '') +
  '<label class="f"><span>Tipo</span><select id="rp_tipo">' + PANOL_TIPOS.map(x => '<option value="' + x[0] + '"' + (tipo === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<div class="small muted" style="margin:-6px 0 10px">' + PANOL_TIPOS.map(x => '<b>' + x[1] + ':</b> ' + x[2]).join('<br>') + '</div>' +
  '<label class="f"><span>Nombre</span><input id="rp_nombre" placeholder="ej: Aceite 5W30 sintético" value="' + esc(ex ? ex.nombre : '') + '"></label>' +
  '<div class="two"><label class="f"><span>Categoría</span><select id="rp_cat" onchange="onRepuestoCat()">' + STOCK_CATEGORIAS.map(x => '<option value="' + x[0] + '"' + (cat === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Unidad</span><select id="rp_unidad">' + STOCK_UNIDADES.map(x => '<option value="' + x[0] + '"' + (ex && ex.unidad === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label></div>' +
  '<div class="two"><label class="f"><span>Código / nº de parte <small>opcional</small></span><input id="rp_codigo" value="' + esc(ex ? ex.codigo || '' : '') + '"></label>' +
  '<label class="f"><span>Ubicación <small>estante, caja…</small></span><input id="rp_ubicacion" list="rp_ubics" placeholder="ej: Estante A2" value="' + esc(ex ? ex.ubicacion || '' : '') + '"><datalist id="rp_ubics">' + ubicaciones().map(u => '<option value="' + esc(u) + '">').join('') + '</datalist></label></div>' +
  (ex ? '' : '<div class="two"><label class="f"><span>Stock inicial</span><input id="rp_stockinicial" inputmode="decimal" value="0"></label><span></span></div>') +
  '<div class="two"><label class="f"><span>Stock mínimo <small>avisa al llegar</small></span><input id="rp_min" inputmode="decimal" value="' + esc(ex ? ex.stockMinimo || '' : '') + '"></label>' +
  '<label class="f"><span>' + (ex ? 'Costo promedio' : 'Costo unitario') + ' <small>lo que te costó</small></span><input id="rp_costo" inputmode="decimal" value="' + esc(ex ? Math.round(costoDe(ex) * 100) / 100 || '' : '') + '"></label></div>' +
  '<div class="two"><label class="f"><span>Precio de reposición <small>lo que sale hoy, opcional</small></span><input id="rp_reposicion" inputmode="decimal" value="' + esc(ex ? ex.precioReposicion || '' : '') + '"></label>' +
  '<label class="f"><span>Proveedor <small>opcional</small></span><select id="rp_proveedor"><option value="">Sin especificar</option>' + proveedoresActivos().map(p => '<option value="' + p.id + '"' + (ex && ex.proveedorId === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') + '</select></label></div>' +
  (modelos.length ? '<div class="sec-t">Sirve para <small>dejalo vacío si sirve para todos los autos</small></div><div style="display:flex;flex-wrap:wrap;gap:4px 14px;margin-bottom:10px">' +
    modelos.map((m, i) => '<label class="chk" style="margin:0"><input type="checkbox" class="rp-compat" value="' + esc(m) + '"' + (compat.includes(m) ? ' checked' : '') + '><span>' + esc(m) + '</span></label>').join('') + '</div>' : '') +
  '<label class="f"><span>Notas</span><textarea id="rp_notas">' + esc(ex ? ex.notas : '') + '</textarea></label>' +
  (ex ? '<label class="chk"><input type="checkbox" id="rp_inactivo"' + (ex.inactivo ? ' checked' : '') + '><span>Inactivo (no se cuenta en el pañol ni avisa)</span></label>' : '') +
  '<div class="row"><button class="btn grow" onclick="saveRepuesto(' + (ex ? "'" + ex.id + "'" : 'null') + ')">Guardar</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>' +
  (ex ? comparacionPrecios(ex.id) : '') +
  (ex ? historialMovimientos(ex) : '') +
  (ex && canDelete() ? '<div style="margin-top:14px"><button class="btn danger block" onclick="confirmDel(this,()=>delRepuesto(\'' + ex.id + '\'))">Eliminar ítem</button></div>' : '');
  openModal(h);
}
export function onRepuestoCat() {
  const t = document.getElementById('rp_tipo');
  if (t) t.value = tipoPorCategoria(val('rp_cat'));
}
function comparacionPrecios(repuestoId) {
  const precios = preciosPorProveedor(repuestoId);
  if (precios.length < 2) return '';
  return '<div class="sec-t">Comparación de precios por proveedor</div>' + precios.map(p => '<div class="card row between small"><span>' + esc(p.proveedorNombre) + '</span><span>' + money(p.precioPromedio) + ' <span class="muted">· ' + fdate(p.ultimaFecha) + '</span></span></div>').join('');
}
function textoMov(r, m) {
  if (m.tipo === 'ajuste') return (m.cantidad >= 0 ? '+ ' : '- ') + cant(r, Math.abs(m.cantidad)) + ' · ' + esc(m.nota || 'Ajuste');
  if (m.tipo === 'entrada') return '+ ' + cant(r, m.cantidad) + (m.costoUnitario ? ' a ' + money(m.costoUnitario) : '');
  if (m.venta) return '- ' + cant(r, m.cantidad) + ' vendido a ' + esc(m.venta.comprador || 'un tercero') + ' por ' + money(m.cantidad * m.venta.precioUnit) + (m.venta.aCuenta ? ' (a cuenta)' : '');
  return '- ' + cant(r, m.cantidad) + (m.baja ? ' (baja)' : '');
}
function historialMovimientos(r) {
  const movs = (r.movimientos || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
  if (!movs.length) return '<div class="sec-t">Movimientos</div><div class="small muted">Todavía no hay movimientos registrados.</div>';
  return '<div class="sec-t">Movimientos</div>' + movs.slice(0, 60).map(m => {
    const c = m.carId ? de('cars', 'id', m.carId)[0] : null;
    const prov = m.proveedorId ? de('proveedores', 'id', m.proveedorId)[0] : null;
    const extra = [fdate(m.fecha), c && c.patente, m.retiro && 'retiró ' + m.retiro, prov && prov.nombre, m.factura && 'fact. ' + m.factura, m.tipo !== 'ajuste' && m.nota].filter(Boolean).map(esc).join(' · ');
    return '<div class="card row between"><div><div>' + textoMov(r, m) + '</div><div class="small muted">' + extra + '</div></div>' +
    (canDelete() ? '<button class="btn sec sm" onclick="confirmDel(this,()=>delMovimientoStock(\'' + r.id + '\',\'' + m.id + '\'))">Borrar</button>' : '') + '</div>';
  }).join('') + (movs.length > 60 ? '<div class="small muted">Se muestran los últimos 60 movimientos.</div>' : '');
}
export async function saveRepuesto(editId) {
  const nombre = val('rp_nombre');
  if (!nombre) { toast('Poné el nombre'); return; }
  const ex = editId ? repuestoById(editId) : null;
  const repo = +val('rp_reposicion') || 0;
  const o = Object.assign({}, ex || {}, {
    id: editId || uid(), nombre, tipo: val('rp_tipo'), categoria: val('rp_cat'), unidad: val('rp_unidad'),
    codigo: val('rp_codigo'), ubicacion: val('rp_ubicacion'),
    stockMinimo: +val('rp_min') || 0, costoUnitario: +val('rp_costo') || 0,
    proveedorId: val('rp_proveedor'), notas: val('rp_notas'),
    compatibles: [...document.querySelectorAll('.rp-compat:checked')].map(x => x.value),
    creadoFecha: ex ? ex.creadoFecha : iso(today()),
    inactivo: editId ? document.getElementById('rp_inactivo').checked : false,
  });
  if (repo !== (+(ex && ex.precioReposicion) || 0)) { o.precioReposicion = repo; o.precioReposicionFecha = repo ? iso(today()) : ''; }
  if (!ex) {
    const inicial = +val('rp_stockinicial') || 0;
    o.stockActual = inicial;
    o.movimientos = inicial ? [{ id: uid(), tipo: 'ajuste', cantidad: inicial, fecha: iso(today()), nota: 'Stock inicial', costoUnitario: o.costoUnitario }] : [];
  }
  if (await save('repuestos', o)) { closeModal(); toast(ex ? 'Guardado' : 'Ítem creado'); }
}
export async function delRepuesto(id) {
  if (await remove('repuestos', id)) { closeModal(); toast('Ítem borrado'); }
}

export function movimientoStockForm(repuestoId, tipo) {
  const r = repuestoById(repuestoId);
  if (!r) { toast('Ítem no encontrado'); return; }
  const esHerr = tipoDe(r) === 'herramienta';
  const cars = S.cars.filter(c => !c.vendido).slice().sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  const titulo = tipo === 'entrada' ? 'Entrada (compra)' : esHerr ? 'Baja de herramienta (rota o perdida)' : 'Salida (uso)';
  const h = '<h3>' + titulo + '</h3>' +
  '<div class="small muted" style="margin-bottom:12px">' + esc(r.nombre) + ' · Stock actual: ' + cant(r, stockDe(r)) + (tipo === 'entrada' && costoDe(r) ? ' · costo promedio ' + money(costoDe(r)) : '') + '</div>' +
  '<div class="two"><label class="f"><span>Cantidad</span><input id="mv_cantidad" inputmode="decimal"></label>' +
  '<label class="f"><span>Fecha</span><input id="mv_fecha" type="date" value="' + iso(today()) + '"></label></div>' +
  (tipo === 'entrada' ?
    '<div class="two"><label class="f"><span>Precio unitario de compra</span><input id="mv_costo" inputmode="decimal" value="' + esc(precioReposicion(r) || '') + '"></label>' +
    '<label class="f"><span>Factura nº <small>opcional</small></span><input id="mv_factura"></label></div>' +
    '<label class="f"><span>Proveedor <small>opcional, para comparar precios</small></span><select id="mv_proveedor"><option value="">Sin especificar</option>' + proveedoresActivos().map(p => '<option value="' + p.id + '"' + (r.proveedorId === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') + '</select></label>' +
    '<label class="chk"><input type="checkbox" id="mv_gengasto" checked><span>Generar gasto general por esta compra</span></label>' :
    (esHerr ? '' : '<label class="f"><span>Auto <small>opcional, para qué auto se usó</small></span><select id="mv_car"><option value="">Sin especificar</option>' + cars.map(c => '<option value="' + c.id + '">' + esc(c.patente) + (esCompatible(r, c) ? '' : ' (no figura como compatible)') + '</option>').join('') + '</select></label>') +
    '<label class="f"><span>' + (esHerr ? 'Quién la tenía' : 'Retiró') + ' <small>opcional</small></span><input id="mv_retiro" list="mv_quienes"><datalist id="mv_quienes">' + quienes().map(n => '<option value="' + esc(n) + '">').join('') + '</datalist></label>') +
  '<label class="f"><span>Nota <small>opcional</small></span><input id="mv_nota"></label>' +
  '<div class="row"><button class="btn grow" onclick="guardarMovimientoStock(\'' + r.id + '\',\'' + tipo + '\')">Guardar</button><button class="btn sec" onclick="repuestoForm(\'' + r.id + '\')">Cancelar</button></div>';
  openModal(h);
}
async function aplicarMovimiento(r, mov, cambios) {
  const stockActual = stockDe(r) + deltaMov(mov);
  const o = Object.assign({}, r, cambios || {}, { stockActual, movimientos: (r.movimientos || []).concat([mov]) });
  if (!(await save('repuestos', o))) return null;
  return stockActual;
}
// Salida desde otros módulos (service, kits). Guarda el costo promedio del momento para valorizar el consumo.
export async function registrarSalidaStock(repuestoId, cantidad, fecha, carId, nota, retiro) {
  const r = repuestoById(repuestoId);
  if (!r || !cantidad || cantidad <= 0) return false;
  const mov = { id: uid(), tipo: 'salida', cantidad, fecha: fecha || iso(today()), nota, costoUnitario: costoDe(r) };
  if (carId) mov.carId = carId;
  if (retiro) mov.retiro = retiro;
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
  let cambios = null, generarGasto = null;
  if (tipo === 'entrada') {
    const precio = +val('mv_costo') || 0;
    mov.costoUnitario = precio || costoDe(r);
    const proveedorId = val('mv_proveedor'); if (proveedorId) mov.proveedorId = proveedorId;
    const factura = val('mv_factura'); if (factura) mov.factura = factura;
    cambios = { costoUnitario: costoPromedioNuevo(r, cantidad, precio) };
    if (document.getElementById('mv_gengasto').checked && precio) {
      generarGasto = { id: uid(), carId: '', categoria: 'repuestos', fecha, costo: cantidad * precio, proveedorId: proveedorId || '', descripcion: 'Compra pañol: ' + r.nombre + ' (' + cant(r, cantidad) + ')' + (factura ? ' · fact. ' + factura : ''), generadoAuto: true };
    }
  } else {
    mov.costoUnitario = costoDe(r);
    const carEl = document.getElementById('mv_car'); if (carEl && carEl.value) mov.carId = carEl.value;
    const retiro = val('mv_retiro'); if (retiro) mov.retiro = retiro;
    if (tipoDe(r) === 'herramienta') { mov.baja = true; cambios = { prestadaA: '', prestadaDesde: '' }; }
  }
  const stockActual = await aplicarMovimiento(r, mov, cambios);
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
  const o = Object.assign({}, r, { stockActual: stockDe(r) - deltaMov(mov), movimientos: (r.movimientos || []).filter(m => m.id !== movId) });
  if (await save('repuestos', o)) { toast('Movimiento borrado'); repuestoForm(r.id); }
}

/* ---------- Herramientas: préstamo y devolución ---------- */
export function prestarHerramientaForm(id) {
  const r = repuestoById(id); if (!r) return;
  openModal('<h3>Prestar: ' + esc(r.nombre) + '</h3>' +
    '<label class="f"><span>A quién</span><input id="pr_quien" list="pr_quienes" placeholder="Chofer, mecánico, taller…"><datalist id="pr_quienes">' + quienes().map(n => '<option value="' + esc(n) + '">').join('') + '</datalist></label>' +
    '<label class="f"><span>Fecha</span><input id="pr_fecha" type="date" value="' + iso(today()) + '"></label>' +
    '<div class="row"><button class="btn grow" onclick="guardarPrestamo(\'' + r.id + '\')">Guardar</button><button class="btn sec" onclick="repuestoForm(\'' + r.id + '\')">Cancelar</button></div>');
}
export async function guardarPrestamo(id) {
  const r = repuestoById(id); if (!r) return;
  const quien = val('pr_quien');
  if (!quien) { toast('Poné a quién se la prestaste'); return; }
  const fecha = val('pr_fecha') || iso(today());
  const prestamos = (r.prestamos || []).concat([{ id: uid(), quien, desde: fecha }]);
  if (await save('repuestos', Object.assign({}, r, { prestadaA: quien, prestadaDesde: fecha, prestamos }))) { toast('Préstamo anotado'); repuestoForm(r.id); }
}
export async function devolverHerramienta(id) {
  const r = repuestoById(id); if (!r) return;
  const prestamos = (r.prestamos || []).map(p => (!p.hasta && p.quien === r.prestadaA ? Object.assign({}, p, { hasta: iso(today()) }) : p));
  if (await save('repuestos', Object.assign({}, r, { prestadaA: '', prestadaDesde: '', prestamos }))) { toast('Devolución anotada'); repuestoForm(r.id); }
}

/* ---------- Inventario físico ---------- */
let invUbic = '';
export function inventarioPanolForm(ubic) {
  if (ubic !== undefined) invUbic = ubic;
  const ubs = ubicaciones();
  const L = itemsActivos().filter(r => !invUbic || (r.ubicacion || '').trim() === invUbic)
    .sort((a, b) => String(a.ubicacion || '~').localeCompare(String(b.ubicacion || '~')) || String(a.nombre).localeCompare(String(b.nombre)));
  let h = '<h3>Hacer inventario</h3><div class="small muted" style="margin-bottom:10px">Contá lo que hay en el pañol y anotalo. Dejá vacío lo que no contaste. Al guardar se corrige el stock y te muestra cuánta plata falta o sobra.</div>';
  if (ubs.length) h += '<label class="f"><span>Contar solo</span><select onchange="inventarioPanolForm(this.value)"><option value="">Todo el pañol</option>' + ubs.map(u => '<option value="' + esc(u) + '"' + (invUbic === u ? ' selected' : '') + '>' + esc(u) + '</option>').join('') + '</select></label>';
  if (!L.length) h += '<div class="card empty">No hay ítems para contar.</div>';
  let ub = null;
  L.forEach(r => {
    const u = (r.ubicacion || '').trim() || 'Sin ubicación';
    if (u !== ub) { ub = u; h += '<div class="sec-t">' + esc(u) + '</div>'; }
    h += '<div class="card row between"><div class="grow"><div>' + esc(r.nombre) + '</div><div class="small muted">Según la app: ' + cant(r, stockDe(r)) + '</div></div>' +
    '<input class="inv-cant" data-id="' + r.id + '" inputmode="decimal" placeholder="Contado" style="width:90px"></div>';
  });
  h += '<div class="row" style="margin-top:12px"><button class="btn grow" onclick="guardarInventarioPanol()">Guardar inventario</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>';
  openModal(h);
}
export async function guardarInventarioPanol() {
  const filas = [...document.querySelectorAll('.inv-cant')].filter(i => i.value.trim() !== '');
  if (!filas.length) { toast('No anotaste ninguna cantidad'); return; }
  const fecha = iso(today());
  const detalle = []; let faltante = 0, sobrante = 0;
  for (const i of filas) {
    const r = repuestoById(i.dataset.id); if (!r) continue;
    const contado = +String(i.value).replace(',', '.');
    if (isNaN(contado) || contado < 0) continue;
    const dif = Math.round((contado - stockDe(r)) * 1000) / 1000;
    const cambios = { ultimoInventario: fecha };
    if (!dif) { await save('repuestos', Object.assign({}, r, cambios)); continue; }
    const valor = dif * costoDe(r);
    if (dif < 0) faltante += -valor; else sobrante += valor;
    detalle.push({ nombre: r.nombre, dif, unidad: unidades(r, dif), valor });
    await aplicarMovimiento(r, { id: uid(), tipo: 'ajuste', cantidad: dif, fecha, nota: 'Inventario', costoUnitario: costoDe(r) }, cambios);
  }
  const reg = { id: uid(), fecha, usuario: (S.user && S.user.email) || '', zona: invUbic || 'Todo el pañol', contados: filas.length, faltante, sobrante, detalle: detalle.slice(0, 60) };
  saveSettings({ inventariosPanol: [reg].concat(settings.inventariosPanol || []).slice(0, 24) });
  resultadoInventario(reg);
}
function resultadoInventario(reg) {
  let h = '<h3>Inventario del ' + fdate(reg.fecha) + '</h3><div class="small muted" style="margin-bottom:10px">' + esc(reg.zona) + ' · ' + reg.contados + ' ítem' + (reg.contados === 1 ? '' : 's') + ' contado' + (reg.contados === 1 ? '' : 's') + (reg.usuario ? ' · ' + esc(reg.usuario) : '') + '</div>' +
  '<div class="grid" style="margin-bottom:12px"><div class="kpi ' + (reg.faltante ? 'bad' : '') + '"><div class="n">' + money(reg.faltante) + '</div><div class="l">Faltante</div></div><div class="kpi"><div class="n">' + money(reg.sobrante) + '</div><div class="l">Sobrante</div></div></div>';
  h += reg.detalle.length ? reg.detalle.map(d => '<div class="card row between"><span>' + esc(d.nombre) + '</span><span class="' + (d.dif < 0 ? 'bad' : '') + '">' + (d.dif > 0 ? '+' : '') + num1(d.dif) + ' ' + esc(d.unidad) + ' · ' + money(d.valor) + '</span></div>').join('') : '<div class="card">Todo coincide con lo que dice la app.</div>';
  h += '<button class="btn sec block" style="margin-top:12px" onclick="closeModal()">Cerrar</button>';
  openModal(h);
}
export function inventariosAnteriores() {
  const L = settings.inventariosPanol || [];
  let h = '<h3>Inventarios anteriores</h3>';
  h += L.length ? L.map((x, i) => '<div class="card tap row between" onclick="verInventario(' + i + ')"><div><div>' + fdate(x.fecha) + ' · ' + esc(x.zona) + '</div><div class="small muted">' + x.contados + ' contados · ' + x.detalle.length + ' con diferencia</div></div><span class="' + (x.faltante ? 'bad' : 'muted') + '">' + (x.faltante ? '-' + money(x.faltante) : 'OK') + '</span></div>').join('') : '<div class="card empty">Todavía no hiciste ningún inventario.</div>';
  h += '<button class="btn sec block" style="margin-top:12px" onclick="closeModal()">Cerrar</button>';
  openModal(h);
}
export function verInventario(i) { const x = (settings.inventariosPanol || [])[i]; if (x) resultadoInventario(x); }

/* ---------- Kits de service ---------- */
const kits = () => settings.kitsPanol || [];
export function kitsPanolView() {
  let h = '<h3>Kits de service</h3><div class="small muted" style="margin-bottom:10px">Armá el combo de lo que usás en cada service (ej: 4 litros de aceite + filtro de aceite + filtro de aire) y descontalo del pañol con un solo toque.</div>';
  h += kits().length ? kits().map(k => {
    const costo = k.items.reduce((a, x) => { const r = repuestoById(x.rid); return a + (r ? costoDe(r) * x.cant : 0); }, 0);
    const falta = k.items.some(x => { const r = repuestoById(x.rid); return !r || stockDe(r) < x.cant; });
    return '<div class="card"><div class="row between"><b>' + esc(k.nombre) + '</b><span class="small muted">' + money(costo) + '</span></div>' +
    '<div class="small muted" style="margin:4px 0 8px">' + k.items.map(x => { const r = repuestoById(x.rid); return r ? num1(x.cant) + ' × ' + esc(r.nombre) : '(ítem borrado)'; }).join(' · ') + (falta ? ' · <span class="bad">falta stock</span>' : '') + '</div>' +
    '<div class="row"><button class="btn sm grow" onclick="usarKitForm(\'' + k.id + '\')">Usar en un auto</button><button class="btn sec sm" onclick="kitPanolForm(\'' + k.id + '\')">Editar</button></div></div>';
  }).join('') : '<div class="card empty">Todavía no armaste kits.</div>';
  h += '<div class="row" style="margin-top:10px"><button class="btn grow" onclick="kitPanolForm()">+ Nuevo kit</button><button class="btn sec" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
}
function filaKit(x) {
  return '<div class="two kit-row"><select class="kit-rid">' + itemsActivos().filter(r => tipoDe(r) !== 'herramienta').sort((a, b) => a.nombre.localeCompare(b.nombre)).map(r => '<option value="' + r.id + '"' + (x && x.rid === r.id ? ' selected' : '') + '>' + esc(r.nombre) + '</option>').join('') + '</select>' +
  '<div class="row"><input class="kit-cant grow" inputmode="decimal" placeholder="Cantidad" value="' + (x ? x.cant : 1) + '"><button type="button" class="btn danger sm" onclick="this.closest(\'.kit-row\').remove()">✕</button></div></div>';
}
export function kitPanolForm(id) {
  const k = id ? kits().find(x => x.id === id) : null;
  openModal('<h3>' + (k ? 'Editar kit' : 'Nuevo kit') + '</h3>' +
    '<label class="f"><span>Nombre</span><input id="kit_nombre" placeholder="ej: Service 10.000 km Cronos" value="' + esc(k ? k.nombre : '') + '"></label>' +
    '<div class="sec-t">Qué lleva</div><div id="kit_items">' + (k ? k.items.map(filaKit).join('') : filaKit()) + '</div>' +
    '<button type="button" class="btn sec sm" style="margin-bottom:14px" onclick="addKitRow()">+ Agregar ítem</button>' +
    '<div class="row"><button class="btn grow" onclick="guardarKitPanol(' + (k ? "'" + k.id + "'" : 'null') + ')">Guardar</button><button class="btn sec" onclick="kitsPanolView()">Cancelar</button></div>' +
    (k ? '<button class="btn danger block" style="margin-top:10px" onclick="confirmDel(this,()=>borrarKitPanol(\'' + k.id + '\'))">Borrar kit</button>' : ''));
}
export function addKitRow() { const el = document.getElementById('kit_items'); if (el) el.insertAdjacentHTML('beforeend', filaKit()); }
export function guardarKitPanol(id) {
  const nombre = val('kit_nombre');
  if (!nombre) { toast('Poné el nombre del kit'); return; }
  const items = [...document.querySelectorAll('.kit-row')].map(f => ({ rid: f.querySelector('.kit-rid').value, cant: +String(f.querySelector('.kit-cant').value).replace(',', '.') || 0 })).filter(x => x.rid && x.cant > 0);
  if (!items.length) { toast('Agregá al menos un ítem'); return; }
  const k = { id: id || uid(), nombre, items };
  saveSettings({ kitsPanol: id ? kits().map(x => (x.id === id ? k : x)) : kits().concat([k]) });
  toast('Kit guardado'); kitsPanolView();
}
export function borrarKitPanol(id) { saveSettings({ kitsPanol: kits().filter(x => x.id !== id) }); toast('Kit borrado'); kitsPanolView(); }
export function usarKitForm(id) {
  const k = kits().find(x => x.id === id); if (!k) return;
  const cars = S.cars.filter(c => !c.vendido).slice().sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  openModal('<h3>Usar kit: ' + esc(k.nombre) + '</h3>' +
    '<div class="small muted" style="margin-bottom:10px">' + k.items.map(x => { const r = repuestoById(x.rid); return r ? num1(x.cant) + ' × ' + esc(r.nombre) + ' (hay ' + cant(r, stockDe(r)) + ')' : ''; }).filter(Boolean).join('<br>') + '</div>' +
    '<label class="f"><span>Auto</span><select id="uk_car"><option value="">Sin especificar</option>' + cars.map(c => '<option value="' + c.id + '">' + esc(c.patente) + '</option>').join('') + '</select></label>' +
    '<div class="two"><label class="f"><span>Fecha</span><input id="uk_fecha" type="date" value="' + iso(today()) + '"></label>' +
    '<label class="f"><span>Retiró <small>opcional</small></span><input id="uk_retiro" list="uk_quienes"><datalist id="uk_quienes">' + quienes().map(n => '<option value="' + esc(n) + '">').join('') + '</datalist></label></div>' +
    '<div class="row"><button class="btn grow" onclick="guardarUsoKit(\'' + k.id + '\')">Descontar del pañol</button><button class="btn sec" onclick="kitsPanolView()">Cancelar</button></div>');
}
export async function guardarUsoKit(id) {
  const k = kits().find(x => x.id === id); if (!k) return;
  const carId = val('uk_car'), fecha = val('uk_fecha') || iso(today()), retiro = val('uk_retiro');
  let n = 0;
  for (const x of k.items) if (await registrarSalidaStock(x.rid, x.cant, fecha, carId, 'Kit: ' + k.nombre, retiro)) n++;
  closeModal(); toast(n + ' ítem' + (n === 1 ? '' : 's') + ' descontado' + (n === 1 ? '' : 's') + ' del pañol');
}
// Para el formulario de service: devuelve las filas del kit para descontar.
export const itemsDeKit = id => ((kits().find(x => x.id === id) || {}).items || []);

/* ---------- Excel valorizado ---------- */
export async function exportarPanolExcel() {
  try {
    toast('Generando Excel del pañol…');
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const L = itemsActivos().slice().sort((a, b) => tipoDe(a).localeCompare(tipoDe(b)) || String(a.nombre).localeCompare(String(b.nombre)));
    const filas = L.map(r => ({
      Tipo: tipoLabel(tipoDe(r)), 'Categoría': catLabel(r.categoria), Nombre: r.nombre, 'Código': r.codigo || '', 'Ubicación': r.ubicacion || '',
      Stock: stockDe(r), Unidad: unidadLabel(r.unidad), 'Costo promedio': Math.round(costoDe(r)), 'Valor al costo': Math.round(valorItem(r, 'costo')),
      'Precio reposición': Math.round(precioReposicion(r)), 'Valor a reposición': Math.round(valorItem(r, 'reposicion')),
      'Mínimo': +r.stockMinimo || 0, 'Consumo por mes': Math.round(consumoDiario(r) * 30 * 10) / 10, 'Alcanza (días)': coberturaDias(r) == null ? '' : coberturaDias(r),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.length ? filas : [{ sinDatos: true }]), 'Pañol');
    const Rc = resumenPanol('costo'), Rr = resumenPanol('reposicion');
    const res = PANOL_TIPOS.map(([k, l]) => ({ Concepto: l, 'Ítems': Rc.porTipo[k].items, 'Valor al costo': Math.round(Rc.porTipo[k].valor), 'Valor a reposición': Math.round(Rr.porTipo[k].valor) }));
    res.push({ Concepto: 'Total', 'Ítems': Rc.items, 'Valor al costo': Math.round(Rc.total), 'Valor a reposición': Math.round(Rr.total) });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(res), 'Resumen');
    const movs = [];
    S.repuestos.forEach(r => (r.movimientos || []).forEach(m => {
      const c = m.carId ? de('cars', 'id', m.carId)[0] : null;
      movs.push({ Fecha: m.fecha, 'Ítem': r.nombre, Movimiento: m.tipo === 'ajuste' ? (m.nota || 'Ajuste') : m.tipo === 'entrada' ? 'Entrada' : m.baja ? 'Baja' : 'Salida', Cantidad: deltaMov(m), 'Costo unitario': Math.round(+m.costoUnitario || 0), Auto: c ? c.patente : '', 'Retiró': m.retiro || '', Nota: m.nota || '' });
    }));
    movs.sort((a, b) => b.Fecha.localeCompare(a.Fecha));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(movs.length ? movs : [{ sinDatos: true }]), 'Movimientos');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    await saveFile('panol-' + iso(today()) + '.xlsx', out, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast('Excel descargado');
  } catch (e) {
    toast('No se pudo generar el Excel: ' + ((e && e.message) || 'error'));
  }
}

/* ---------- Venta desde el pañol ---------- */
export function ventaPanolForm(id) {
  const r = repuestoById(id); if (!r) return;
  const margen = +settings.panolMargenPct || 0;
  const sugerido = Math.ceil(precioReposicion(r) * (1 + margen / 100) / 100) * 100;
  const choferes = S.drivers.filter(d => !d.inactivo && !d.prospecto).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  openModal('<h3>Vender: ' + esc(r.nombre) + '</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Hay ' + cant(r, stockDe(r)) + '. Costo promedio ' + money(costoDe(r)) + ', precio de hoy ' + money(precioReposicion(r)) + '. Precio sugerido con ' + margen + '% de margen.</div>' +
    '<div class="two"><label class="f"><span>Cantidad</span><input id="vp_cant" inputmode="decimal" value="1" oninput="calcVentaPanol(\'' + r.id + '\')"></label>' +
    '<label class="f"><span>Precio por ' + esc(unidadLabel(r.unidad).toLowerCase()) + '</span><input id="vp_precio" inputmode="decimal" value="' + sugerido + '" oninput="calcVentaPanol(\'' + r.id + '\')"></label></div>' +
    '<label class="f"><span>A quién</span><select id="vp_chofer" onchange="calcVentaPanol(\'' + r.id + '\')"><option value="">Otra persona</option>' + choferes.map(d => '<option value="' + d.id + '">' + esc(d.nombre) + '</option>').join('') + '</select></label>' +
    '<label class="f" id="vp_nombreBox"><span>Nombre</span><input id="vp_nombre" placeholder="ej: taller vecino"></label>' +
    '<label class="f"><span>Cómo paga</span><select id="vp_pago"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="mercadopago">Mercado Pago</option><option value="cuenta" id="vp_cuenta">A cuenta del chofer (se suma a lo que debe)</option></select></label>' +
    '<div id="vp_res" class="card small" style="margin-bottom:10px"></div>' +
    '<div class="row"><button class="btn grow" onclick="guardarVentaPanol(\'' + r.id + '\')">Registrar venta</button><button class="btn sec" onclick="repuestoForm(\'' + r.id + '\')">Cancelar</button></div>');
  calcVentaPanol(r.id);
}
export function calcVentaPanol(id) {
  const r = repuestoById(id); if (!r) return;
  const q = +String(val('vp_cant')).replace(',', '.') || 0, p = +String(val('vp_precio')).replace(',', '.') || 0;
  const esChofer = !!val('vp_chofer');
  document.getElementById('vp_nombreBox').hidden = esChofer;
  const opCuenta = document.getElementById('vp_cuenta'); if (opCuenta) { opCuenta.disabled = !esChofer; if (!esChofer && val('vp_pago') === 'cuenta') document.getElementById('vp_pago').value = 'efectivo'; }
  const total = q * p, costo = q * costoDe(r);
  document.getElementById('vp_res').innerHTML = 'Total: <b>' + money(total) + '</b> · ganancia ' + money(total - costo) + (costo ? ' (' + Math.round((total - costo) / costo * 100) + '%)' : '');
}
export async function guardarVentaPanol(id) {
  const r = repuestoById(id); if (!r) return;
  const q = +String(val('vp_cant')).replace(',', '.') || 0, p = +String(val('vp_precio')).replace(',', '.') || 0;
  if (q <= 0 || p <= 0) { toast('Poné la cantidad y el precio'); return; }
  if (q > stockDe(r)) { toast('No hay tanto stock: quedan ' + cant(r, stockDe(r)), 'error'); return; }
  const choferId = val('vp_chofer'), pago = val('vp_pago');
  const d = choferId ? de('drivers', 'id', choferId)[0] : null;
  const comprador = d ? d.nombre : (val('vp_nombre') || 'Otra persona');
  const fecha = iso(today());
  const mov = { id: uid(), tipo: 'salida', cantidad: q, fecha, costoUnitario: costoDe(r), nota: 'Venta', venta: { precioUnit: p, comprador, choferId: choferId || '', formaPago: pago, aCuenta: pago === 'cuenta' } };
  if (await aplicarMovimiento(r, mov) == null) return;
  const total = q * p, concepto = 'Compra en el pañol: ' + cant(r, q) + ' de ' + r.nombre;
  if (d && pago === 'cuenta') {
    await save('drivers', Object.assign({}, d, { adelantos: (d.adelantos || []).concat([{ id: uid(), fecha, monto: total, motivo: concepto, origen: 'panol' }]) }));
  } else if (d) {
    const auto = de('cars', 'choferId', d.id).find(c => c.choferId === d.id && !c.vendido);
    if (auto) await save('payments', { id: uid(), carId: auto.id, choferId: d.id, fecha, monto: total, tipo: 'otro', metodo: pago, nota: concepto });
  }
  closeModal(); toast('Venta registrada: ' + money(total)); repuestoForm(r.id);
}
