import { S, ui } from '../state.js';
import { esc, money } from '../utils.js';
import { repuestosActivos, stockBajo, valorStock, listaDeCompra } from '../calc.js';
import { STOCK_CATEGORIAS, STOCK_UNIDADES } from '../constants.js';
import { openModal, closeModal, toast } from '../modal.js';

const catLabel = k => (STOCK_CATEGORIAS.find(x => x[0] === k) || [0, 'Otro'])[1];
const unidadLabel = k => (STOCK_UNIDADES.find(x => x[0] === k) || [0, 'Unidad'])[1];

export function stockFiltrado() {
  let L = repuestosActivos();
  const q = (ui.qStock || '').trim().toLowerCase();
  if (q) L = L.filter(r => [r.nombre, catLabel(r.categoria), r.notas].join(' ').toLowerCase().includes(q));
  if (ui.stockCat) L = L.filter(r => r.categoria === ui.stockCat);
  if (ui.stockSoloBajo) L = L.filter(stockBajo);
  return L.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
}
function seccionResumen() {
  const bajos = repuestosActivos().filter(stockBajo).length;
  return '<div class="grid" style="margin-bottom:14px">' +
    '<div class="kpi ' + (bajos ? 'warn' : '') + '"><div class="n">' + bajos + '</div><div class="l">Bajo stock</div></div>' +
    '<div class="kpi"><div class="n">' + money(valorStock()) + '</div><div class="l">Valor del stock</div></div>' +
  '</div>';
}
export function viewStock() {
  if (!S.repuestos.length) {
    return '<h1>Stock de repuestos</h1><p class="sub">Repuestos y consumibles de la flota (aceite, filtros, bujías, etc.)</p>' +
    '<div class="row" style="margin-bottom:14px"><button class="btn grow" onclick="repuestoForm()">+ Nuevo repuesto</button></div>' +
    '<div class="card empty">Todavía no cargaste repuestos.</div>';
  }
  let h = '<h1>Stock de repuestos</h1><p class="sub">Repuestos y consumibles de la flota (aceite, filtros, bujías, etc.)</p>' +
  '<div class="row" style="margin-bottom:14px"><button class="btn grow" onclick="repuestoForm()">+ Nuevo repuesto</button></div>';
  h += seccionResumen();
  if (repuestosActivos().filter(stockBajo).length) h += '<button class="btn sec block" style="margin-bottom:12px" onclick="listaDeCompraForm()">Ver lista de compra</button>';
  h += '<label class="f" style="margin-bottom:8px"><span>Buscar</span><input value="' + esc(ui.qStock) + '" oninput="ui.qStock=this.value;renderList()" placeholder="Nombre, categoría..."></label>';
  h += '<div class="two" style="margin-bottom:10px"><label class="f"><span>Categoría</span><select onchange="ui.stockCat=this.value;render()"><option value="">Todas</option>' + STOCK_CATEGORIAS.map(x => '<option value="' + x[0] + '"' + (ui.stockCat === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="chk" style="align-self:flex-end;padding-bottom:10px"><input type="checkbox"' + (ui.stockSoloBajo ? ' checked' : '') + ' onchange="ui.stockSoloBajo=this.checked;render()"><span>Solo bajo stock</span></label></div>';
  h += '<div id="list"></div>';
  return h;
}
export function listaDeCompraForm() {
  const grupos = listaDeCompra();
  if (!grupos.length) { toast('No hay repuestos bajo el mínimo'); return; }
  let texto = 'Lista de compra de repuestos:\n';
  let h = '<h3>Lista de compra</h3><div class="small muted" style="margin-bottom:10px">Cantidad sugerida para volver a estar por encima del mínimo.</div>';
  grupos.forEach(g => {
    texto += '\n' + g.proveedorNombre + ':\n';
    h += '<div class="sec-t">' + esc(g.proveedorNombre) + '</div>';
    g.items.forEach(x => {
      const linea = x.r.nombre + ': ' + x.sugerido + ' ' + unidadLabel(x.r.unidad) + (x.sugerido === 1 ? '' : 's');
      texto += '- ' + linea + '\n';
      h += '<div class="card row between"><span>' + esc(x.r.nombre) + '</span><b>' + x.sugerido + ' ' + esc(unidadLabel(x.r.unidad)) + (x.sugerido === 1 ? '' : 's') + '</b></div>';
    });
  });
  h += '<a class="btn sec block" style="margin-top:12px" target="_blank" href="https://wa.me/?text=' + encodeURIComponent(texto) + '">Compartir por WhatsApp</a>' +
  '<button class="btn sec block" style="margin-top:8px" onclick="closeModal()">Cerrar</button>';
  openModal(h);
}
export function listStock() {
  const L = stockFiltrado();
  if (!L.length) return '<div class="card empty">Ningún repuesto coincide con el filtro.</div>';
  return L.map(r => {
    const bajo = stockBajo(r);
    return '<div class="card tap" onclick="repuestoForm(\'' + r.id + '\')"><div class="row between"><div><b>' + esc(r.nombre) + '</b><div class="small muted">' + esc(catLabel(r.categoria)) + (r.costoUnitario ? ' · ' + money(r.costoUnitario) + '/' + esc(unidadLabel(r.unidad)).toLowerCase() : '') + '</div></div>' +
    '<div class="right"><span class="badge b-' + (bajo ? ((r.stockActual || 0) <= 0 ? 'bad' : 'warn') : 'ok') + '">' + (r.stockActual || 0) + ' ' + esc(unidadLabel(r.unidad)) + (r.stockActual === 1 ? '' : 's') + '</span></div></div></div>';
  }).join('');
}
