import { S, ui } from '../state.js';
import { esc, money, moneyUSD, num1, fdate } from '../utils.js';
import { STOCK_CATEGORIAS, PANOL_TIPOS } from '../constants.js';
import { openModal, toast } from '../modal.js';
import { settings, saveSettings } from '../settings.js';
import { cotizacion } from '../dolar.js';
import { canVerFinanzas } from '../roles.js';
import {
  tipoDe, catLabel, unidades, stockDe, costoDe, valorItem, coberturaDias, stockBajoPanol, porReponer, itemsActivos,
  resumenPanol, consumoPorMes, listaCompraPanol, diasQuieto, ventasPanolMes,
} from '../panol.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const modo = () => (ui.panolValuacion === 'reposicion' ? 'reposicion' : 'costo');
const enDolares = n => { const c = cotizacion(); return c && n ? ' <span class="small muted">≈ ' + moneyUSD(n / c.valor) + '</span>' : ''; };

export function stockFiltrado() {
  let L = itemsActivos();
  const q = (ui.qStock || '').trim().toLowerCase();
  if (q) L = L.filter(r => [r.nombre, r.codigo, catLabel(r.categoria), r.ubicacion, r.notas, (r.compatibles || []).join(' ')].join(' ').toLowerCase().includes(q));
  if (ui.panolTipo) L = L.filter(r => tipoDe(r) === ui.panolTipo);
  if (ui.stockCat) L = L.filter(r => r.categoria === ui.stockCat);
  if (ui.panolUbicacion) L = L.filter(r => ((r.ubicacion || '').trim() || '—') === ui.panolUbicacion);
  if (ui.stockSoloBajo) L = L.filter(porReponer);
  return L.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
}

function barras(filas, total) {
  const max = Math.max(...filas.map(f => f[1]), 1);
  return filas.map(([l, v]) => '<div style="margin:6px 0"><div class="row between small"><span>' + esc(l) + '</span><span>' + money(v) + (total ? ' <span class="muted">· ' + Math.round(v / total * 100) + '%</span>' : '') + '</span></div>' +
    '<div style="height:6px;border-radius:3px;background:var(--soft);margin-top:3px"><div style="height:6px;border-radius:3px;background:var(--btn);width:' + Math.max(2, Math.round(v / max * 100)) + '%"></div></div></div>').join('');
}

function seccionResumen() {
  const R = resumenPanol(modo());
  const t = R.porTipo;
  let h = '<div class="tabs" style="margin-bottom:10px">' +
    '<button class="tab' + (modo() === 'costo' ? ' on' : '') + '" onclick="ui.panolValuacion=\'costo\';render()">Valuado a costo</button>' +
    '<button class="tab' + (modo() === 'reposicion' ? ' on' : '') + '" onclick="ui.panolValuacion=\'reposicion\';render()">A precio de hoy</button></div>' +
    '<div class="small muted" style="margin:-4px 0 10px">' + (modo() === 'costo' ? 'Lo que te costó lo que tenés (costo promedio de tus compras).' : 'Lo que te saldría volver a comprar todo hoy (último precio pagado o el que cargaste a mano).') + '</div>';
  h += '<div class="kpi" style="margin-bottom:8px"><div class="n">' + money(R.total) + enDolares(R.total) + '</div><div class="l">Plata total en el pañol · ' + R.items + ' ítem' + (R.items === 1 ? '' : 's') + '</div></div>';
  h += '<div class="grid" style="margin-bottom:8px">' + PANOL_TIPOS.filter(([k]) => k !== 'herramienta' || t.herramienta.items).map(([k, l]) =>
    '<div class="kpi tap" onclick="ui.panolTipo=ui.panolTipo===\'' + k + '\'?\'\':\'' + k + '\';render()" style="' + (ui.panolTipo === k ? 'outline:2px solid var(--btn)' : '') + '"><div class="n">' + money(t[k].valor) + '</div><div class="l">' + l + 's · ' + t[k].items + '</div></div>').join('') +
    '<div class="kpi ' + (R.bajos ? 'warn' : '') + ' tap" onclick="ui.stockSoloBajo=!ui.stockSoloBajo;render()"><div class="n">' + R.bajos + '</div><div class="l">Bajo el mínimo</div></div>' +
  '</div>';
  if (R.quieto > 0) h += '<div class="card small" style="margin-bottom:8px"><b>' + money(R.quieto) + '</b> parados hace más de 90 días en ' + R.quietoItems + ' ítem' + (R.quietoItems === 1 ? '' : 's') + '. Es plata inmovilizada: conviene no volver a comprar eso hasta usarlo.</div>';
  const V = ventasPanolMes();
  if (V.n) h += '<div class="card small" style="margin-bottom:8px">Ventas del pañol este mes: <b>' + money(V.ingreso) + '</b> · ganancia ' + money(V.ganancia) + ' (' + V.n + ' venta' + (V.n === 1 ? '' : 's') + ')</div>';
  if (R.prestadas) h += '<div class="card small" style="margin-bottom:8px">' + R.prestadas + ' herramienta' + (R.prestadas === 1 ? ' prestada' : 's prestadas') + ' ahora.</div>';
  const cats = Object.entries(R.porCategoria).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  if (cats.length) {
    h += '<details class="card" style="margin-bottom:8px"><summary><b>En qué tenés la plata</b></summary>' + barras(cats.slice(0, 8).map(([k, v]) => [catLabel(k), v]), R.total) +
      (R.top.length ? '<div class="sec-t">Los ítems que más valen</div>' + R.top.map(x => '<div class="row between small tap" onclick="repuestoForm(\'' + x.r.id + '\')" style="padding:3px 0"><span>' + esc(x.r.nombre) + '</span><span>' + money(x.v) + '</span></div>').join('') : '') +
      (Object.keys(R.porUbicacion).length > 1 ? '<div class="sec-t">Por ubicación</div>' + barras(Object.entries(R.porUbicacion).sort((a, b) => b[1] - a[1]), R.total) : '') + '</details>';
  }
  const C = consumoPorMes(6);
  if (C.some(m => m.consumible || m.repuesto)) {
    const max = Math.max(...C.map(m => m.consumible + m.repuesto), 1);
    h += '<details class="card" style="margin-bottom:8px"><summary><b>Cuánto se gasta del pañol por mes</b></summary><div class="small muted" style="margin:6px 0">Lo que salió del pañol (uso en autos), valuado al costo. <span style="color:var(--btn)">■</span> consumibles <span style="opacity:.45">■</span> repuestos</div>' +
      '<div style="display:flex;align-items:flex-end;gap:6px;height:110px;margin-top:8px">' + C.map(m => {
        const hc = Math.round(m.consumible / max * 90), hr = Math.round(m.repuesto / max * 90);
        return '<div style="flex:1;text-align:center" title="' + money(m.consumible + m.repuesto) + '"><div style="display:flex;flex-direction:column;justify-content:flex-end;height:92px"><div style="height:' + hr + 'px;background:var(--btn);opacity:.45;border-radius:3px 3px 0 0"></div><div style="height:' + hc + 'px;background:var(--btn);border-radius:' + (hr ? '0' : '3px 3px 0 0') + '"></div></div><div class="small muted">' + MESES[+m.mes.slice(5) - 1] + '</div></div>';
      }).join('') + '</div>' +
      C.slice().reverse().filter(m => m.consumible || m.repuesto).slice(0, 3).map(m => '<div class="row between small" style="padding:2px 0"><span>' + MESES[+m.mes.slice(5) - 1] + ' ' + m.mes.slice(0, 4) + '</span><span>' + money(m.consumible) + ' + ' + money(m.repuesto) + ' = <b>' + money(m.consumible + m.repuesto) + '</b></span></div>').join('') + '</details>';
  }
  return h;
}

export function viewStock() {
  let h = '<h1>Pañol</h1><p class="sub">Consumibles, repuestos y herramientas, con lo que vale cada cosa.</p>' +
  '<div class="row" style="margin-bottom:8px"><button class="btn grow" onclick="repuestoForm()">+ Nuevo ítem</button>' + (S.repuestos.length ? '<button class="btn sec grow" onclick="inventarioPanolForm(\'\')">Hacer inventario</button>' : '') + '</div>';
  if (!S.repuestos.length) return h + '<div class="card empty"><b>El pañol está vacío</b>Cargá lo que tenés: aceite, filtros, pastillas, lamparitas, herramientas… Con el costo de cada uno la app te dice cuánta plata hay guardada.</div>';
  h += '<div class="row" style="margin-bottom:12px;flex-wrap:wrap"><button class="btn sec sm grow" onclick="kitsPanolView()">Kits de service</button>' +
    (listaCompraPanol().length ? '<button class="btn sec sm grow" onclick="listaDeCompraForm()">Lista de compra</button>' : '') +
    '<button class="btn sec sm grow" onclick="inventariosAnteriores()">Inventarios</button>' + (canVerFinanzas() ? '<button class="btn sec sm grow" onclick="exportarPanolExcel()">Excel</button>' : '') + '</div>';
  h += seccionResumen();
  h += '<div class="tabs" style="margin-top:12px">' + [['', 'Todo']].concat(PANOL_TIPOS.map(x => [x[0], x[1] + 's'])).map(([k, l]) => '<button class="tab' + ((ui.panolTipo || '') === k ? ' on' : '') + '" onclick="ui.panolTipo=\'' + k + '\';render()">' + l + '</button>').join('') + '</div>';
  h += '<label class="f" style="margin-bottom:8px"><span>Buscar</span><input value="' + esc(ui.qStock) + '" oninput="ui.qStock=this.value;renderList()" placeholder="Nombre, código, ubicación, modelo…"></label>';
  const ubs = [...new Set(S.repuestos.map(r => (r.ubicacion || '').trim() || '—'))].sort();
  h += '<div class="two" style="margin-bottom:6px"><label class="f"><span>Categoría</span><select onchange="ui.stockCat=this.value;render()"><option value="">Todas</option>' + STOCK_CATEGORIAS.filter(x => !ui.panolTipo || x[2] === ui.panolTipo || S.repuestos.some(r => r.categoria === x[0] && tipoDe(r) === ui.panolTipo)).map(x => '<option value="' + x[0] + '"' + (ui.stockCat === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  (ubs.length > 1 ? '<label class="f"><span>Ubicación</span><select onchange="ui.panolUbicacion=this.value;render()"><option value="">Todas</option>' + ubs.map(u => '<option value="' + esc(u) + '"' + (ui.panolUbicacion === u ? ' selected' : '') + '>' + esc(u === '—' ? 'Sin ubicación' : u) + '</option>').join('') + '</select></label>' : '<span></span>') + '</div>';
  h += '<label class="chk" style="margin-bottom:10px"><input type="checkbox"' + (ui.stockSoloBajo ? ' checked' : '') + ' onchange="ui.stockSoloBajo=this.checked;render()"><span>Solo lo que hay que reponer</span></label>';
  h += '<div id="list"></div>';
  return h;
}

export function listaDeCompraForm() {
  const grupos = listaCompraPanol();
  if (!grupos.length) { toast('No hay nada para reponer'); return; }
  const dias = +settings.panolCoberturaDias || 30;
  let texto = 'Lista de compra:\n', total = 0;
  let h = '<h3>Lista de compra</h3><div class="small muted" style="margin-bottom:8px">Lo que está bajo el mínimo o se termina en menos de 10 días. La cantidad sugerida cubre el mínimo y ' + dias + ' días de consumo.</div>' +
  '<label class="f"><span>Comprar para cuántos días</span><select onchange="guardarCoberturaPanol(this.value)">' + [15, 30, 45, 60, 90].map(d => '<option value="' + d + '"' + (d === dias ? ' selected' : '') + '>' + d + ' días</option>').join('') + '</select></label>';
  grupos.forEach(g => {
    texto += '\n' + g.proveedorNombre + ':\n'; total += g.total;
    h += '<div class="sec-t row between">' + esc(g.proveedorNombre) + (g.total ? '<span class="small muted">' + money(g.total) + '</span>' : '') + '</div>';
    g.items.forEach(x => {
      const linea = x.r.nombre + ': ' + num1(x.sugerido) + ' ' + unidades(x.r, x.sugerido);
      texto += '- ' + linea + '\n';
      h += '<div class="card row between"><div><div>' + esc(x.r.nombre) + '</div><div class="small muted">Hay ' + num1(stockDe(x.r)) + (x.cobertura != null ? ' · alcanza ~' + x.cobertura + ' d' : '') + (x.precio ? ' · ' + money(x.precio) + ' c/u' : '') + '</div></div><b>' + num1(x.sugerido) + ' ' + esc(unidades(x.r, x.sugerido)) + '</b></div>';
    });
  });
  if (total) h += '<div class="card row between"><b>Total estimado</b><b>' + money(total) + '</b></div>';
  h += '<a class="btn sec block" style="margin-top:12px" target="_blank" href="https://wa.me/?text=' + encodeURIComponent(texto) + '">Compartir por WhatsApp</a>' +
  '<button class="btn sec block" style="margin-top:8px" onclick="closeModal()">Cerrar</button>';
  openModal(h);
}
export function guardarCoberturaPanol(v) { saveSettings({ panolCoberturaDias: +v || 30 }); listaDeCompraForm(); }

export function listStock() {
  const L = stockFiltrado();
  if (!L.length) return '<div class="card empty">Ningún ítem coincide con el filtro.</div>';
  const m = modo();
  return L.map(r => {
    const bajo = stockBajoPanol(r), reponer = porReponer(r), cob = coberturaDias(r), t = tipoDe(r), q = diasQuieto(r);
    const sub = [catLabel(r.categoria), r.ubicacion, costoDe(r) ? money(costoDe(r)) + ' c/u' : '', r.codigo].filter(Boolean).map(esc).join(' · ');
    const extra = t === 'herramienta' ? (r.prestadaA ? '<span class="badge b-warn">Prestada a ' + esc(r.prestadaA) + '</span>' : '') :
      (cob != null ? '<span class="small ' + (cob < 10 ? 'bad' : 'muted') + '">alcanza ~' + (cob >= 365 ? '+1 año' : cob + ' d') + '</span>' : (stockDe(r) > 0 && q != null && q >= 90 ? '<span class="small muted">quieto hace ' + q + ' d</span>' : ''));
    return '<div class="card tap" onclick="repuestoForm(\'' + r.id + '\')"><div class="row between"><div class="grow" style="min-width:0"><b>' + esc(r.nombre) + '</b><div class="small muted">' + sub + '</div>' + (extra ? '<div>' + extra + '</div>' : '') + '</div>' +
    '<div class="right" style="text-align:right"><span class="badge b-' + (bajo ? (stockDe(r) <= 0 ? 'bad' : 'warn') : reponer ? 'warn' : 'ok') + '">' + num1(stockDe(r)) + ' ' + esc(unidades(r, stockDe(r))) + '</span><div class="small muted" style="margin-top:4px">' + money(valorItem(r, m)) + '</div></div></div></div>';
  }).join('');
}
