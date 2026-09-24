import { S } from '../state.js';
import { esc, money, val, iso, today } from '../utils.js';
import { activeCars, calc, isContract, rentabilidadAuto, estadoGeneralAuto, diasEnTaller, gastoMantenimientoAuto, driverName } from '../calc.js';
import { openModal } from '../modal.js';
import { toast } from '../modal.js';
import { saveFile } from '../backup.js';
import { canVerFinanzas } from '../roles.js';

const FAV_KEY = 'flota-reportes-favoritos';
function leerFavoritos() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (e) { return []; } }
function guardarFavoritosStorage(list) { try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch (e) {} }

const ESTADO_LABEL = { ok: 'Todo al día', soft: 'Todo al día', warn: 'Algo pendiente', bad: 'Vencido / atención' };

const COLUMNAS = [
  ['patente', 'Patente', c => c.patente || ''],
  ['marca', 'Marca / modelo', c => [c.marca, c.modelo].filter(Boolean).join(' ')],
  ['tipo', 'Estado', c => c.tipo || ''],
  ['chofer', 'Chofer', c => c.choferId ? driverName(c.choferId) : ''],
  ['monto', 'Monto semanal', c => isContract(c) ? (+c.monto || 0) : ''],
  ['deuda', 'Deuda', c => calc(c).debt],
  ['km', 'Kilometraje', c => +c.km || 0],
  ['estadoGeneral', 'Estado general', c => ESTADO_LABEL[estadoGeneralAuto(c)] || ''],
  ['gastoMant', 'Gasto de mantenimiento', c => gastoMantenimientoAuto(c)],
  ['diasTaller', 'Días en taller', c => diasEnTaller(c)],
  ['costoCompra', 'Costo de compra', c => +c.costoCompra || 0],
  ['valorMercado', 'Valor de mercado', c => +c.valorMercado || 0],
  ['rentabilidad', 'Rentabilidad neta', c => (canVerFinanzas() && c.tipo !== 'financiado') ? rentabilidadAuto(c).neta : ''],
];

let seleccion = ['patente', 'marca', 'chofer', 'monto', 'deuda', 'estadoGeneral'];

export function toggleColumnaReporte(k) {
  const i = seleccion.indexOf(k);
  if (i >= 0) seleccion.splice(i, 1); else seleccion.push(k);
  renderReportePersonalizado();
}

export function reportePersonalizadoForm() {
  const favs = leerFavoritos();
  const h = '<h3>Reporte personalizado</h3>' +
  (favs.length ? '<div class="small muted" style="margin-bottom:4px">Favoritos</div><div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">' +
    favs.map(f => '<span class="badge b-mute tap" style="cursor:pointer" onclick="cargarFavoritoReporte(\'' + esc(f.nombre) + '\')">' + esc(f.nombre) + ' <span onclick="event.stopPropagation();borrarFavoritoReporte(\'' + esc(f.nombre) + '\')">✕</span></span>').join('') + '</div>' : '') +
  '<div class="small muted" style="margin-bottom:10px">Elegí qué columnas ver.</div>' +
  '<div style="display:flex;flex-wrap:wrap;gap:6px 14px;margin-bottom:12px">' +
  COLUMNAS.map(x => '<label class="chk" style="width:auto"><input type="checkbox"' + (seleccion.includes(x[0]) ? ' checked' : '') + ' onchange="toggleColumnaReporte(\'' + x[0] + '\')"><span>' + x[1] + '</span></label>').join('') +
  '</div><div id="rp_resultado" style="overflow-x:auto"></div>' +
  '<div class="two" style="margin-top:10px"><input id="rp_nombreFav" placeholder="Nombre para guardar como favorito"><button class="btn sec" onclick="guardarFavoritoReporte()">Guardar favorito</button></div>' +
  '<div class="row" style="margin-top:14px"><button class="btn sec grow" onclick="exportarReportePersonalizado()">Exportar a Excel</button><button class="btn sec grow" onclick="exportarReportePersonalizadoPDF()">Exportar a PDF</button></div>' +
  '<div class="row" style="margin-top:8px"><button class="btn sec block" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
  renderReportePersonalizado();
}
export function guardarFavoritoReporte() {
  const nombre = val('rp_nombreFav').trim();
  if (!nombre) { toast('Poné un nombre para el favorito'); return; }
  const favs = leerFavoritos().filter(f => f.nombre !== nombre);
  favs.push({ nombre, columnas: seleccion.slice() });
  guardarFavoritosStorage(favs);
  toast('Favorito guardado');
  reportePersonalizadoForm();
}
export function cargarFavoritoReporte(nombre) {
  const f = leerFavoritos().find(x => x.nombre === nombre);
  if (!f) return;
  seleccion = f.columnas.slice();
  reportePersonalizadoForm();
}
export function borrarFavoritoReporte(nombre) {
  guardarFavoritosStorage(leerFavoritos().filter(x => x.nombre !== nombre));
  reportePersonalizadoForm();
}

function filas() {
  const cols = COLUMNAS.filter(x => seleccion.includes(x[0]));
  const cars = activeCars();
  return { cols, cars };
}

export function renderReportePersonalizado() {
  const el = document.getElementById('rp_resultado'); if (!el) return;
  const { cols, cars } = filas();
  if (!cols.length) { el.innerHTML = '<div class="small muted">Elegí al menos una columna.</div>'; return; }
  let h = '<table style="width:100%;border-collapse:collapse"><thead><tr>' +
  cols.map(c => '<th class="small muted" style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)">' + esc(c[1]) + '</th>').join('') + '</tr></thead><tbody>';
  h += cars.map(c => '<tr>' + cols.map(col => {
    const v = col[2](c);
    const disp = typeof v === 'number' ? (col[0] === 'km' ? v.toLocaleString('es-AR') : money(v)) : esc(String(v || ''));
    return '<td style="padding:6px 8px;border-bottom:1px solid var(--line)" class="small">' + disp + '</td>';
  }).join('') + '</tr>').join('');
  h += '</tbody></table>';
  el.innerHTML = h;
}

export async function exportarReportePersonalizadoPDF() {
  const { cols, cars } = filas();
  if (!cols.length) { toast('Elegí al menos una columna'); return; }
  try {
    const { jsPDF } = await import('jspdf');
    const orientation = cols.length > 5 ? 'landscape' : 'portrait';
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation });
    const marginX = 10, pageWidth = doc.internal.pageSize.getWidth(), pageHeight = doc.internal.pageSize.getHeight();
    const colW = (pageWidth - marginX * 2) / cols.length;
    let y = 16;
    doc.setFontSize(14); doc.text('Reporte personalizado', marginX, y); y += 8;
    doc.setFontSize(8);
    const header = () => {
      cols.forEach((c, i) => doc.text(String(c[1]), marginX + i * colW, y, { maxWidth: colW - 2 }));
      y += 6; doc.setDrawColor(200); doc.line(marginX, y - 3, pageWidth - marginX, y - 3);
    };
    header();
    cars.forEach(c => {
      if (y > pageHeight - 12) { doc.addPage(); y = 16; header(); }
      cols.forEach((col, i) => {
        const v = col[2](c);
        const disp = typeof v === 'number' ? (col[0] === 'km' ? v.toLocaleString('es-AR') : money(v)) : String(v || '');
        doc.text(disp, marginX + i * colW, y, { maxWidth: colW - 2 });
      });
      y += 6;
    });
    doc.save('reporte-personalizado-' + iso(today()) + '.pdf');
    toast('PDF descargado');
  } catch (e) {
    toast('No se pudo generar el PDF: ' + ((e && e.message) || 'error'));
  }
}
export async function exportarReportePersonalizado() {
  const { cols, cars } = filas();
  if (!cols.length) { toast('Elegí al menos una columna'); return; }
  try {
    const XLSX = await import('xlsx');
    const rows = cars.map(c => {
      const o = {};
      cols.forEach(col => { o[col[1]] = col[2](c); });
      return o;
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    await saveFile('reporte-personalizado-' + iso(today()) + '.xlsx', out, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast('Excel descargado');
  } catch (e) {
    toast('No se pudo generar el Excel: ' + ((e && e.message) || 'error'));
  }
}
