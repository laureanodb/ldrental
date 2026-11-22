import { S, dl } from './state.js';
import { iso, today } from './utils.js';
import { COLS, normCar } from './constants.js';
import { openModal, closeModal, toast } from './modal.js';
import { saveMany, remove } from './data.js';
import { render } from './nav.js';
import { esc } from './utils.js';
import { carById, driverName } from './calc.js';
import { isAdmin } from './roles.js';
import { settings, saveSettings, SYNC_KEYS } from './settings.js';
import { movimientosCajaChica, restaurarCajaChica } from './forms/caja-chica.js';

export async function saveFile(filename, data, type) {
  if (dl) { await dl.save({ filename, data }); return; }
  const b = new Blob([data], { type: type || 'text/plain' });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a'); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
export async function backup() {
  // 'mi-flota' es el formato del archivo de copia (nombre viejo de la app): se mantiene para que las copias viejas sigan sirviendo.
  const data = { app: 'mi-flota', version: 1, fecha: new Date().toISOString() };
  COLS.forEach(c => { data[c] = S[c]; });
  // También los ajustes compartidos (cierres de mes, numeración, portal, etc.) y la caja chica.
  data.ajustes = {}; SYNC_KEYS.forEach(k => { if (settings[k] !== undefined) data.ajustes[k] = settings[k]; });
  data.cajachica = movimientosCajaChica();
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
    (d.ajustes ? '<label class="chk"><input type="checkbox" id="rs_ajustes"><span>Restaurar también los ajustes (nombre de la empresa, portal, cierres de mes, numeración…)</span></label>' : '') +
    '<button class="btn sec block" style="margin:8px 0" onclick="probarRestore()">Probar la copia sin cambiar nada</button><div id="rs_prueba"></div>' +
    '<div class="row"><button class="btn grow" onclick="doRestore()">Restaurar</button><button class="btn sec" onclick="cancelRestore()">Cancelar</button></div>');
}
export function cancelRestore() { pendingRestore = null; closeModal(); }
// Revisa la copia contra lo que hay ahora, sin escribir nada: qué se agregaría, qué se
// reemplazaría, qué está dañado y qué cobros apuntan a autos o choferes que no existen.
export function probarRestore() {
  const d = pendingRestore; const el = document.getElementById('rs_prueba'); if (!d || !el) return;
  const filas = [], problemas = [];
  COLS.filter(c => Array.isArray(d[c])).forEach(c => {
    const arr = d[c], sinId = arr.filter(x => !x || typeof x.id !== 'string' || !x.id).length;
    const ids = new Map((S[c] || []).map(x => [x.id, x]));
    let nuevos = 0, iguales = 0, distintos = 0;
    arr.forEach(x => { if (!x || !x.id) return; const a = ids.get(x.id); if (!a) nuevos++; else if (JSON.stringify(a) === JSON.stringify(x)) iguales++; else distintos++; });
    if (arr.length) filas.push('<tr><td>' + esc(c) + '</td><td style="text-align:right">' + arr.length + '</td><td style="text-align:right">' + nuevos + '</td><td style="text-align:right">' + distintos + '</td><td style="text-align:right">' + iguales + '</td></tr>');
    if (sinId) problemas.push(sinId + ' registro(s) de ' + c + ' sin código: se saltean');
  });
  const autos = new Set(d.cars.map(x => x && x.id)), chof = new Set(d.drivers.map(x => x && x.id));
  const huerf = d.payments.filter(p => p && p.carId && !autos.has(p.carId)).length;
  if (huerf) problemas.push(huerf + ' cobro(s) de autos que no están en la copia');
  const sinChofer = d.cars.filter(c => c && c.choferId && !chof.has(c.choferId)).length;
  if (sinChofer) problemas.push(sinChofer + ' auto(s) con un chofer que no está en la copia');
  const fecha = d.fecha ? new Date(d.fecha) : null;
  const dias = fecha ? Math.round((Date.now() - fecha) / 864e5) : null;
  el.innerHTML = '<div class="card small"><b>' + (problemas.length ? '⚠ La copia se puede restaurar, con observaciones' : '✓ La copia está sana y se puede restaurar') + '</b>' +
    (dias != null ? '<div class="muted">Tiene ' + dias + ' día(s) de antigüedad.</div>' : '') +
    '<table style="width:100%;margin-top:6px;border-collapse:collapse"><tr class="muted"><td>Tabla</td><td style="text-align:right">En la copia</td><td style="text-align:right">Nuevos</td><td style="text-align:right">Reemplaza</td><td style="text-align:right">Iguales</td></tr>' + filas.join('') + '</table>' +
    (d.ajustes ? '<div class="muted" style="margin-top:6px">Incluye ajustes y ' + ((d.cajachica || []).length) + ' movimiento(s) de caja chica.</div>' : '<div class="muted" style="margin-top:6px">Es una copia vieja: no trae los ajustes ni la caja chica.</div>') +
    (problemas.length ? '<ul style="margin:6px 0 0 18px;padding:0">' + problemas.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + '</div>';
}
export async function doRestore() {
  const d = pendingRestore; if (!d) return;
  const conAjustes = !!(document.getElementById('rs_ajustes') || {}).checked;
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
  if (Array.isArray(d.cajachica)) n += await restaurarCajaChica(d.cajachica);
  if (conAjustes && d.ajustes && typeof d.ajustes === 'object') {
    const a = {}; SYNC_KEYS.forEach(k => { if (k in d.ajustes) a[k] = d.ajustes[k]; });
    saveSettings(a);
  }
  render();
  toast('Copia restaurada: ' + n + ' registros' + (conAjustes ? ' y los ajustes' : ''));
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
  const h = '<h3>Archivar registros viejos</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Exporta a Excel y después elimina de la base los cobros, encuestas y movimientos de autoseguro anteriores a la fecha elegida, para aligerar la app. Guardá bien el archivo exportado: esto no se puede deshacer.</div>' +
  '<label class="f"><span>Archivar anteriores a</span><input id="av_fecha" type="date" value="' + limiteDefault + '" onchange="actualizarInfoArchivar()"></label>' +
  '<div class="small muted" id="av_info" style="margin-bottom:10px"></div>' +
  '<div class="row"><button class="btn danger grow" onclick="confirmDel(this,()=>archivarCobrosViejos())">Exportar y eliminar</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>';
  openModal(h);
  actualizarInfoArchivar();
}
export function actualizarInfoArchivar() {
  const el = document.getElementById('av_fecha'); const info = document.getElementById('av_info');
  if (!el || !info) return;
  const n = S.payments.filter(p => p.fecha < el.value).length;
  const nEnc = S.encuestas.filter(e => e.fecha < el.value).length;
  const nAs = (settings.autoseguroFondo || []).filter(t => t.fecha < el.value).length;
  info.textContent = n + ' cobro' + (n === 1 ? '' : 's') + ', ' + nEnc + ' encuesta' + (nEnc === 1 ? '' : 's') + ' y ' + nAs + ' movimiento' + (nAs === 1 ? '' : 's') + ' de autoseguro se van a exportar y eliminar.';
}
export async function archivarCobrosViejos() {
  const el = document.getElementById('av_fecha'); if (!el) return;
  const viejos = S.payments.filter(p => p.fecha < el.value);
  const encViejas = S.encuestas.filter(e => e.fecha < el.value);
  const asViejos = (settings.autoseguroFondo || []).filter(t => t.fecha < el.value);
  if (!viejos.length && !encViejas.length && !asViejos.length) { toast('No hay nada para archivar'); closeModal(); return; }
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    if (viejos.length) {
      const rows = viejos.map(p => { const c = carById(p.carId); return { Fecha: p.fecha, Patente: c ? c.patente : '', Chofer: driverName(p.choferId), Tipo: p.tipo, Monto: p.monto, Metodo: p.metodo || '', Nota: p.nota || '' }; });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Cobros archivados');
    }
    if (encViejas.length) {
      const rows = encViejas.map(e => ({ Fecha: e.fecha, Chofer: driverName(e.choferId), Puntaje: e.rating, Comentario: e.comentario || '' }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Encuestas archivadas');
    }
    if (asViejos.length) {
      const rows = asViejos.map(t => ({ Fecha: t.fecha, Monto: t.monto, Motivo: t.motivo || '', Categoria: t.categoria || '' }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Autoseguro archivado');
    }
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    await saveFile('archivo-' + iso(today()) + '.xlsx', out, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (e) {
    toast('No se pudo exportar, se canceló el archivado');
    return;
  }
  const total = viejos.length + encViejas.length + asViejos.length;
  toast('Eliminando ' + total + ' registros…');
  let ok = 0;
  for (const p of viejos) { if (await remove('payments', p.id)) ok++; }
  for (const e of encViejas) { if (await remove('encuestas', e.id)) ok++; }
  if (asViejos.length) {
    const idsViejos = new Set(asViejos.map(t => t.id));
    saveSettings({ autoseguroFondo: (settings.autoseguroFondo || []).filter(t => !idsViejos.has(t.id)) });
    ok += asViejos.length;
  }
  closeModal();
  toast(ok + ' registro' + (ok === 1 ? '' : 's') + ' archivado' + (ok === 1 ? '' : 's') + ' y eliminado' + (ok === 1 ? '' : 's'));
}
