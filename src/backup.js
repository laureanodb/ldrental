import { S, dl } from './state.js';
import { iso, today } from './utils.js';
import { COLS, normCar } from './constants.js';
import { openModal, closeModal, toast } from './modal.js';
import { saveMany, remove } from './data.js';
import { render } from './nav.js';
import { esc } from './utils.js';
import { carById, driverName } from './calc.js';
import { isAdmin } from './roles.js';

export async function saveFile(filename, data, type) {
  if (dl) { await dl.save({ filename, data }); return; }
  const b = new Blob([data], { type: type || 'text/plain' });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a'); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
export async function backup() {
  const data = { app: 'mi-flota', version: 1, fecha: new Date().toISOString() };
  COLS.forEach(c => { data[c] = S[c]; });
  try { await saveFile('copia-flota-' + iso(today()) + '.json', JSON.stringify(data, null, 1), 'application/json'); toast('Copia descargada'); }
  catch (e) { if (!e || e.code !== 'declined') toast('No se pudo descargar la copia'); }
}
let pendingRestore = null;
export async function pickRestore(inp) {
  const f = inp.files[0]; inp.value = ''; if (!f) return;
  let d;
  try { d = JSON.parse(await f.text()); } catch (e) { toast('El archivo no es una copia válida'); return; }
  if (!d || d.app !== 'mi-flota' || !(Array.isArray(d.cars) && Array.isArray(d.drivers) && Array.isArray(d.payments))) { toast('Ese archivo no es una copia de LD Rental'); return; }
  pendingRestore = d;
  const fe = d.fecha ? new Date(d.fecha).toLocaleDateString('es-AR') : 'sin fecha';
  const nOtros = COLS.filter(c => !['cars', 'drivers', 'payments'].includes(c) && Array.isArray(d[c])).reduce((a, c) => a + d[c].length, 0);
  openModal('<h3>Restaurar copia</h3><div class="card"><div>Copia del ' + esc(fe) + '</div><div class="small muted">' + d.cars.length + ' autos · ' + d.drivers.length + ' choferes · ' + d.payments.length + ' cobros' + (nOtros ? ' · ' + nOtros + ' otros registros' : '') + '</div></div>' +
    '<p class="small muted">Los registros que ya existen con el mismo código se reemplazan por los de la copia. No se borra nada de lo que cargaste después.</p>' +
    '<div class="row"><button class="btn grow" onclick="doRestore()">Restaurar</button><button class="btn sec" onclick="cancelRestore()">Cancelar</button></div>');
}
export function cancelRestore() { pendingRestore = null; closeModal(); }
export async function doRestore() {
  const d = pendingRestore; if (!d) return;
  pendingRestore = null; closeModal();
  const cols = COLS.filter(c => Array.isArray(d[c]));
  const total = cols.reduce((a, c) => a + d[c].length, 0); let n = 0;
  toast('Restaurando ' + total + ' registros…');
  for (const c of cols) {
    let arr = d[c].filter(x => x && typeof x.id === 'string' && x.id);
    if (c === 'cars') arr = arr.map(normCar);
    if (!(await saveMany(c, arr))) { toast('Se cortó después de ' + n + ' de ' + total + '. Probá de nuevo.'); return; }
    n += arr.length;
  }
  render();
  toast('Copia restaurada: ' + n + ' registros');
}

export async function exportCSV() {
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const rows = [['Fecha', 'Patente', 'Chofer', 'Tipo', 'Monto', 'Nota']];
  S.payments.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(p => { const c = carById(p.carId); rows.push([p.fecha, c ? c.patente : '', driverName(p.choferId), p.tipo, p.monto, p.nota || '']); });
  const csv = '﻿' + rows.map(r => r.map(q).join(',')).join('\n');
  try { await saveFile('cobros-' + iso(today()) + '.csv', csv, 'text/csv'); }
  catch (e) { if (!e || e.code !== 'declined') toast('No se pudo exportar'); }
}

export function archivarCobrosViejosForm() {
  if (!isAdmin()) { toast('Solo un administrador puede hacer esto'); return; }
  const limiteDefault = iso(new Date(today().getFullYear() - 2, today().getMonth(), today().getDate()));
  const h = '<h3>Archivar cobros viejos</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Exporta a Excel y después elimina de la base los cobros anteriores a la fecha elegida, para aligerar la app. Guardá bien el archivo exportado: esto no se puede deshacer.</div>' +
  '<label class="f"><span>Archivar cobros anteriores a</span><input id="av_fecha" type="date" value="' + limiteDefault + '" onchange="actualizarInfoArchivar()"></label>' +
  '<div class="small muted" id="av_info" style="margin-bottom:10px"></div>' +
  '<div class="row"><button class="btn danger grow" onclick="confirmDel(this,()=>archivarCobrosViejos())">Exportar y eliminar</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>';
  openModal(h);
  actualizarInfoArchivar();
}
export function actualizarInfoArchivar() {
  const el = document.getElementById('av_fecha'); const info = document.getElementById('av_info');
  if (!el || !info) return;
  const n = S.payments.filter(p => p.fecha < el.value).length;
  info.textContent = n + ' cobro' + (n === 1 ? '' : 's') + ' se van a exportar y eliminar.';
}
export async function archivarCobrosViejos() {
  const el = document.getElementById('av_fecha'); if (!el) return;
  const viejos = S.payments.filter(p => p.fecha < el.value);
  if (!viejos.length) { toast('No hay cobros para archivar'); closeModal(); return; }
  try {
    const XLSX = await import('xlsx');
    const rows = viejos.map(p => { const c = carById(p.carId); return { Fecha: p.fecha, Patente: c ? c.patente : '', Chofer: driverName(p.choferId), Tipo: p.tipo, Monto: p.monto, Metodo: p.metodo || '', Nota: p.nota || '' }; });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Cobros archivados');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    await saveFile('cobros-archivados-' + iso(today()) + '.xlsx', out, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (e) {
    toast('No se pudo exportar, se canceló el archivado');
    return;
  }
  toast('Eliminando ' + viejos.length + ' cobros…');
  let ok = 0;
  for (const p of viejos) { if (await remove('payments', p.id)) ok++; }
  closeModal();
  toast(ok + ' cobro' + (ok === 1 ? '' : 's') + ' archivado' + (ok === 1 ? '' : 's') + ' y eliminado' + (ok === 1 ? '' : 's'));
}
