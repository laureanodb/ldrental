import { val, uid, iso, today, esc } from '../utils.js';
import { S } from '../state.js';
import { GASTO_CATS, RECLAMO_SEGURO_ESTADOS } from '../constants.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { carById, proveedoresActivos } from '../calc.js';
import { carForm } from './car.js';
import { subirYLeerFactura, resumenFactura, opcionParecida } from '../factura.js';
import { de } from '../memo.js';

export function gastoForm(carId) {
  const c = carById(carId);
  if (!c) { toast('Auto no encontrado'); return; }
  const FRECUENTES = ['combustible', 'service', 'patente', 'seguro'];
  facturaGasto = null; facturaDatos = null;
  const h = '<h3>Nuevo gasto — ' + esc(c.patente) + '</h3>' +
  '<label class="btn sec sm block filebtn" style="margin-bottom:4px">📷 Leer la factura o el ticket (foto o PDF)<input id="g_factIn" type="file" accept="image/*,application/pdf" onchange="leerFacturaGasto(\'' + c.id + '\')"></label>' +
  '<div id="g_ia" class="small muted" style="margin-bottom:10px"></div>' +
  '<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">' + FRECUENTES.map(k => {
    const cat = GASTO_CATS.find(x => x[0] === k);
    return cat ? '<button type="button" class="btn sec sm" onclick="elegirCategoriaGasto(\'' + k + '\')">' + esc(cat[1].replace(/ \(.*\)/, '')) + '</button>' : '';
  }).join('') + '</div>' +
  '<div class="two"><label class="f"><span>Categoría</span><select id="g_cat">' + GASTO_CATS.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Fecha</span><input id="g_fecha" type="date" value="' + iso(today()) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Costo</span><input id="g_costo" inputmode="decimal"></label>' +
  '<label class="f"><span>Km (opcional)</span><input id="g_km" inputmode="numeric"></label></div>' +
  '<label class="f"><span>Proveedor / taller</span><select id="g_proveedorSel" onchange="document.getElementById(\'g_proveedorOtroBox\').style.display=this.value===\'__otro__\'?\'\':\'none\'"><option value="">Sin especificar</option>' + proveedoresActivos().map(p => '<option value="' + esc(p.nombre) + '">' + esc(p.nombre) + '</option>').join('') + '<option value="__otro__">Otro (escribir)</option></select></label>' +
  '<div id="g_proveedorOtroBox" style="display:none"><label class="f"><span>Nombre del proveedor</span><input id="g_proveedorOtro"></label></div>' +
  '<label class="f"><span>Descripción</span><textarea id="g_desc"></textarea></label>' +
  '<label class="chk"><input type="checkbox" id="g_sinFactura"><span>Sin factura</span></label>' +
  '<label class="chk"><input type="checkbox" id="g_reclamoSeguro"><span>A reclamar al seguro</span></label>' +
  '<div class="row"><button class="btn grow" onclick="saveGasto(\'' + c.id + '\', this)">Guardar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
}
// Factura leída con IA para el gasto que se está cargando.
let facturaGasto = null, facturaDatos = null;
export async function leerFacturaGasto(carId) {
  const r = await subirYLeerFactura('g_factIn', 'g_ia');
  if (!r) return;
  facturaGasto = r.archivo; facturaDatos = r.datos;
  const d = r.datos; if (!d) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el && v !== '' && v != null && v !== 0) el.value = v; };
  set('g_cat', d.categoria);
  if (d.fecha && d.fecha <= iso(today())) set('g_fecha', d.fecha);
  set('g_costo', d.total);
  set('g_km', d.km);
  if (d.proveedor) {
    const sel = document.getElementById('g_proveedorSel');
    const v = opcionParecida(sel, d.proveedor);
    if (v) sel.value = v;
    else { sel.value = '__otro__'; document.getElementById('g_proveedorOtroBox').style.display = ''; set('g_proveedorOtro', d.proveedor); }
  }
  if (!val('g_desc')) set('g_desc', d.concepto + (d.numero ? ' (comp. ' + d.numero + ')' : ''));
  if (d.esFactura && /factura/.test(d.tipoComprobante || '')) document.getElementById('g_sinFactura').checked = false;
  resumenFactura(d, carId, 'g_ia');
}
export function elegirCategoriaGasto(cat) {
  const sel = document.getElementById('g_cat'); if (!sel) return;
  sel.value = cat;
  const costo = document.getElementById('g_costo'); if (costo) costo.focus();
}
let gastoDupArmed = null;
export async function saveGasto(carId, btn) {
  const costo = +val('g_costo');
  if (!costo || costo <= 0) { toast('Poné el costo del gasto'); return; }
  const fecha = val('g_fecha') || iso(today());
  if (fecha > iso(today())) { toast('La fecha del gasto no puede ser futura'); return; }
  const categoria = val('g_cat');
  const dup = de('gastos', 'carId', carId).some(g => g.carId === carId && g.fecha === fecha && +g.costo === costo && g.categoria === categoria);
  if (dup && gastoDupArmed !== btn) {
    gastoDupArmed = btn;
    toast('Ya existe un gasto igual ese día para este auto. Tocá Guardar de nuevo para confirmar');
    return;
  }
  gastoDupArmed = null;
  const selProveedor = val('g_proveedorSel');
  const proveedor = selProveedor === '__otro__' ? val('g_proveedorOtro') : selProveedor;
  const reclamoSeguro = document.getElementById('g_reclamoSeguro').checked;
  const o = { id: uid(), carId, categoria, fecha, costo, km: val('g_km'), proveedor, descripcion: val('g_desc'), sinFactura: document.getElementById('g_sinFactura').checked, reclamoSeguro, reclamoEstado: reclamoSeguro ? 'pendiente' : '' };
  if (facturaGasto) o.files = [facturaGasto];
  if (facturaDatos && facturaDatos.numero) { o.facturaNumero = facturaDatos.numero; o.facturaCuit = facturaDatos.cuit || ''; }
  // Seguro de un auto cuyo seguro se le cobra al chofer: queda a su cargo.
  const car = carById(carId);
  if (categoria === 'seguro' && car && car.seguroPaga === 'recupera' && car.choferId) o.recuperaDe = car.choferId;
  if (await save('gastos', o)) { facturaGasto = null; facturaDatos = null; closeModal(); toast(o.recuperaDe ? 'Gasto registrado y sumado al seguro que debe ' + (de('drivers', 'id', car.choferId)[0] || {}).nombre : 'Gasto registrado'); }
}
export async function delGasto(id) {
  const g = de('gastos', 'id', id)[0];
  if (await remove('gastos', id)) { toast('Gasto borrado'); if (g) carForm(g.carId); }
}
export function reclamoSeguroForm(gastoId) {
  const g = de('gastos', 'id', gastoId)[0];
  if (!g) { toast('Gasto no encontrado'); return; }
  const h = '<h3>Reclamo al seguro</h3>' +
  '<div class="small muted" style="margin-bottom:10px">' + esc(g.descripcion || g.categoria) + ' · ' + esc(g.fecha) + '</div>' +
  '<label class="f"><span>Estado</span><select id="rs_estado">' + RECLAMO_SEGURO_ESTADOS.map(x => '<option value="' + x[0] + '"' + (g.reclamoEstado === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="guardarReclamoSeguro(\'' + g.id + '\')">Guardar</button><button class="btn sec" onclick="carForm(\'' + g.carId + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function guardarReclamoSeguro(gastoId) {
  const g = de('gastos', 'id', gastoId)[0];
  if (!g) return;
  if (await save('gastos', Object.assign({}, g, { reclamoEstado: val('rs_estado') }))) { toast('Guardado'); carForm(g.carId); }
}
