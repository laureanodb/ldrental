import { val, uid, iso, today, esc, fdate } from '../utils.js';
import { S } from '../state.js';
import { INSPECCION_ITEMS, PASOS_FOTOS } from '../constants.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { carById } from '../calc.js';
import { carForm, actualizarKm } from './car.js';
import { subirArchivoSuelto } from '../files.js';
import { hydrateThumbs } from '../storage.js';
import { de } from '../memo.js';

// Fotos guiadas de la inspección que se está cargando: { paso: { id, type, size } }.
let fotos = {}, avisoFaltanFotos = false;
const PASOS = PASOS_FOTOS.concat([['danio', 'Daño o detalle (opcional)']]);

let firmaCtx = null, firmaTrazada = false, firmaDrawing = false, firmaUltimo = null;

export function inspeccionForm(carId) {
  const c = carById(carId);
  if (!c) { toast('Auto no encontrado'); return; }
  const h = '<h3>Inspección — ' + esc(c.patente) + '</h3>' +
  '<div class="two"><label class="f"><span>Tipo</span><select id="i_tipo" onchange="renderPasosFotos(\'' + c.id + '\')"><option value="entrega">Entrega al chofer</option><option value="recepcion">Recepción del chofer</option></select></label>' +
  '<label class="f"><span>Fecha</span><input id="i_fecha" type="date" value="' + iso(today()) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Kilometraje</span><input id="i_km" inputmode="numeric" value="' + esc(c.km) + '"></label>' +
  '<label class="f"><span>Combustible</span><select id="i_combustible"><option value="lleno">Lleno</option><option value="3/4">3/4</option><option value="1/2">1/2</option><option value="1/4">1/4</option><option value="reserva">Reserva</option></select></label></div>' +
  '<div class="sec-t">Checklist</div>' + INSPECCION_ITEMS.map(x => '<label class="chk"><input type="checkbox" id="i_' + x[0] + '" checked><span>' + x[1] + '</span></label>').join('') +
  '<label class="f" style="margin-top:14px"><span>Observaciones</span><textarea id="i_notas"></textarea></label>' +
  '<div class="sec-t row between">Fotos del auto<span class="small muted" id="i_fotosCuenta"></span></div>' +
  '<div class="small muted" style="margin-bottom:8px">Recorré el auto en este orden. En la devolución se ven al lado las fotos de la entrega para comparar.</div>' +
  '<div id="i_fotos"></div>' +
  '<div class="sec-t">Firma de conformidad</div>' +
  '<canvas id="in_firma" width="335" height="140" style="width:100%;height:140px;border:1px solid var(--line);border-radius:8px;touch-action:none;background:#fff;display:block"></canvas>' +
  '<div class="row" style="margin-top:8px"><button class="btn sec sm" onclick="limpiarFirmaInspeccion()">Limpiar firma</button></div>' +
  '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="saveInspeccion(\'' + c.id + '\')">Guardar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
  fotos = {}; avisoFaltanFotos = false;
  renderPasosFotos(carId);
  initFirmaInspeccion();
}
// Última entrega con fotos del auto, para tener de referencia en la devolución.
function entregaDeReferencia(carId, hasta) {
  return de('inspecciones', 'carId', carId).filter(x => x.carId === carId && x.tipo === 'entrega' && x.fotos && Object.keys(x.fotos).length && (!hasta || x.fecha <= hasta))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0] || null;
}
export function renderPasosFotos(carId) {
  const el = document.getElementById('i_fotos'); if (!el) return;
  const tipo = val('i_tipo');
  const ref = tipo === 'recepcion' ? entregaDeReferencia(carId) : null;
  el.innerHTML = (ref ? '<div class="small muted" style="margin-bottom:6px">A la izquierda, la entrega del ' + fdate(ref.fecha) + '.</div>' : '') +
    '<div class="photogrid" style="grid-template-columns:1fr 1fr">' + PASOS.map(([k, l]) => {
      const f = fotos[k], r = ref && ref.fotos[k];
      return '<div><div class="small" style="margin-bottom:3px;font-weight:600">' + (f ? '✓ ' : '') + esc(l) + '</div>' +
        '<div class="row" style="gap:4px">' +
        (r ? '<div class="phototile" style="flex:1"><img alt="" data-path="' + esc(r) + '"></div>' : '') +
        '<label class="phototile tap" style="flex:1;display:flex;align-items:center;justify-content:center;text-align:center;' + (f ? '' : 'border:2px dashed var(--line);') + '">' +
        (f ? '<img alt="" data-path="' + esc(f.id) + '">' : '<span class="small muted">📷<br>Sacar</span>') +
        '<input type="file" accept="image/*" capture="environment" style="display:none" onchange="fotoPaso(\'' + carId + '\',\'' + k + '\',this)"></label></div></div>';
    }).join('') + '</div>';
  const n = PASOS_FOTOS.filter(([k]) => fotos[k]).length;
  const cuenta = document.getElementById('i_fotosCuenta'); if (cuenta) cuenta.textContent = n + ' de ' + PASOS_FOTOS.length;
  hydrateThumbs(el);
}
export async function fotoPaso(carId, paso, inp) {
  const f = inp.files && inp.files[0]; if (!f) return;
  const cuenta = document.getElementById('i_fotosCuenta'); if (cuenta) cuenta.textContent = 'Subiendo…';
  const r = await subirArchivoSuelto(f);
  if (!r) { renderPasosFotos(carId); return; }
  fotos[paso] = r;
  renderPasosFotos(carId);
}
function initFirmaInspeccion() {
  const cv = document.getElementById('in_firma');
  if (!cv) return;
  firmaCtx = cv.getContext('2d');
  firmaCtx.lineWidth = 2; firmaCtx.lineCap = 'round'; firmaCtx.strokeStyle = '#111';
  firmaTrazada = false; firmaDrawing = false;
  const pos = e => {
    const r = cv.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return [(p.clientX - r.left) * (cv.width / r.width), (p.clientY - r.top) * (cv.height / r.height)];
  };
  cv.onpointerdown = e => { firmaDrawing = true; firmaUltimo = pos(e); try { cv.setPointerCapture(e.pointerId); } catch (err) {} };
  cv.onpointermove = e => {
    if (!firmaDrawing) return;
    const p = pos(e);
    firmaCtx.beginPath(); firmaCtx.moveTo(firmaUltimo[0], firmaUltimo[1]); firmaCtx.lineTo(p[0], p[1]); firmaCtx.stroke();
    firmaUltimo = p; firmaTrazada = true;
  };
  cv.onpointerup = () => { firmaDrawing = false; };
  cv.onpointerleave = () => { firmaDrawing = false; };
}
export function limpiarFirmaInspeccion() {
  const cv = document.getElementById('in_firma');
  if (!cv || !firmaCtx) return;
  firmaCtx.clearRect(0, 0, cv.width, cv.height);
  firmaTrazada = false;
}
export async function saveInspeccion(carId) {
  const items = {};
  INSPECCION_ITEMS.forEach(x => { items[x[0]] = document.getElementById('i_' + x[0]).checked; });
  const c = carById(carId);
  const cv = document.getElementById('in_firma');
  const firma = (cv && firmaTrazada) ? cv.toDataURL('image/png') : '';
  const faltan = PASOS_FOTOS.filter(([k]) => !fotos[k]).length;
  if (faltan && !avisoFaltanFotos) { avisoFaltanFotos = true; toast('Faltan ' + faltan + ' fotos. Tocá Guardar de nuevo para guardar igual.'); return; }
  const fotosIds = {}; Object.keys(fotos).forEach(k => { fotosIds[k] = fotos[k].id; });
  const o = { id: uid(), carId, driverId: (c || {}).choferId || '', tipo: val('i_tipo'), fecha: val('i_fecha') || iso(today()), km: val('i_km'), combustible: val('i_combustible'), items, notas: val('i_notas'), firma, fotos: fotosIds };
  const km = val('i_km');
  if (!(await save('inspecciones', o))) return;
  // Las fotos también quedan en la galería del auto.
  const nombre = (o.tipo === 'entrega' ? 'entrega' : 'devolucion') + '-' + o.fecha;
  const nuevas = PASOS.filter(([k]) => fotos[k]).map(([k, l]) => ({ id: fotos[k].id, name: nombre + '-' + k + '.jpg', cat: 'fotos', type: fotos[k].type, size: fotos[k].size, fecha: o.fecha, nota: l }));
  const cAct = carById(carId);
  if (cAct && nuevas.length) await save('cars', Object.assign({}, cAct, { files: (cAct.files || []).concat(nuevas) }));
  if (km) await actualizarKm(carId, km);
  fotos = {};
  closeModal(); toast('Inspección guardada' + (nuevas.length ? ' con ' + nuevas.length + ' fotos' : '') + (firma ? ' y firma' : ''));
}
export async function delInspeccion(id) {
  const x = de('inspecciones', 'id', id)[0];
  if (await remove('inspecciones', id)) { toast('Inspección borrada'); if (x) carForm(x.carId); }
}

// Comparación lado a lado: entrega contra devolución.
export function compararInspeccion(id) {
  const x = de('inspecciones', 'id', id)[0]; if (!x) return;
  const ent = x.tipo === 'recepcion' ? entregaDeReferencia(x.carId, x.fecha) : x;
  const dev = x.tipo === 'recepcion' ? x : null;
  const c = carById(x.carId);
  const kmDif = ent && dev && ent.km && dev.km ? (+dev.km - +ent.km) : null;
  const cambios = ent && dev ? INSPECCION_ITEMS.filter(([k]) => ent.items && dev.items && ent.items[k] && !dev.items[k]).map(([, l]) => l) : [];
  let h = '<h3>' + (dev ? 'Entrega vs. devolución' : 'Fotos de la entrega') + ' · ' + esc(c ? c.patente : '') + '</h3>';
  if (dev && !ent) h += '<div class="card small">No hay una entrega con fotos anterior a esta devolución para comparar.</div>';
  if (ent && dev) {
    h += '<div class="card small"><div class="row between"><span class="muted">Entrega</span><span>' + fdate(ent.fecha) + (ent.km ? ' · ' + ent.km + ' km' : '') + (ent.combustible ? ' · ' + esc(ent.combustible) : '') + '</span></div>' +
      '<div class="row between"><span class="muted">Devolución</span><span>' + fdate(dev.fecha) + (dev.km ? ' · ' + dev.km + ' km' : '') + (dev.combustible ? ' · ' + esc(dev.combustible) : '') + '</span></div>' +
      (kmDif != null ? '<div class="row between"><span class="muted">Recorrió</span><b>' + kmDif.toLocaleString('es-AR') + ' km</b></div>' : '') +
      (cambios.length ? '<div style="color:var(--bad);margin-top:4px">⚠ Cambió desde la entrega: ' + esc(cambios.join(', ')) + '</div>' : '') +
      (dev.notas ? '<div class="muted" style="margin-top:4px">' + esc(dev.notas) + '</div>' : '') + '</div>';
  }
  const base = dev || ent;
  h += PASOS.map(([k, l]) => {
    const a = ent && ent.fotos && ent.fotos[k], b = dev && dev.fotos && dev.fotos[k];
    if (!a && !b) return '';
    return '<div class="small" style="font-weight:600;margin:10px 0 4px">' + esc(l) + '</div><div class="row" style="gap:6px">' +
      (dev ? [['Entrega', a], ['Devolución', b]] : [['', a]]).map(([t, id]) => '<div style="flex:1">' + (t ? '<div class="small muted">' + t + '</div>' : '') +
        (id ? '<img class="tap" alt="" data-path="' + esc(id) + '" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;background:var(--soft)" onclick="viewFile(\'' + esc(id) + '\',\'' + esc(l) + '\')">' : '<div class="small muted" style="aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;background:var(--soft);border-radius:8px">Sin foto</div>') + '</div>').join('') + '</div>';
  }).join('');
  h += '<button class="btn sec block" style="margin-top:14px" onclick="carForm(\'' + base.carId + '\');setTabAuto(\'hist\')">Volver al auto</button>';
  openModal(h);
  hydrateThumbs(document.getElementById('modal'));
}
