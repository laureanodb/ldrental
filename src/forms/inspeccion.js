import { val, uid, iso, today, esc } from '../utils.js';
import { S } from '../state.js';
import { INSPECCION_ITEMS } from '../constants.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { carById } from '../calc.js';
import { carForm, actualizarKm } from './car.js';
import { liveCam } from '../files.js';

let firmaCtx = null, firmaTrazada = false, firmaDrawing = false, firmaUltimo = null;

export function inspeccionForm(carId) {
  const c = carById(carId);
  if (!c) { toast('Auto no encontrado'); return; }
  const h = '<h3>Inspección — ' + esc(c.patente) + '</h3>' +
  '<div class="two"><label class="f"><span>Tipo</span><select id="i_tipo"><option value="entrega">Entrega al chofer</option><option value="recepcion">Recepción del chofer</option></select></label>' +
  '<label class="f"><span>Fecha</span><input id="i_fecha" type="date" value="' + iso(today()) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Kilometraje</span><input id="i_km" inputmode="numeric" value="' + esc(c.km) + '"></label>' +
  '<label class="f"><span>Combustible</span><select id="i_combustible"><option value="lleno">Lleno</option><option value="3/4">3/4</option><option value="1/2">1/2</option><option value="1/4">1/4</option><option value="reserva">Reserva</option></select></label></div>' +
  '<div class="sec-t">Checklist</div>' + INSPECCION_ITEMS.map(x => '<label class="chk"><input type="checkbox" id="i_' + x[0] + '" checked><span>' + x[1] + '</span></label>').join('') +
  '<label class="f" style="margin-top:14px"><span>Observaciones</span><textarea id="i_notas"></textarea></label>' +
  '<div class="sec-t">Fotos del estado</div>' +
  '<div class="small muted" style="margin-bottom:8px">Se guardan en los archivos del auto, categoría "Fotos".</div>' +
  '<div class="row" style="margin-bottom:10px"><button type="button" class="btn sec grow" onclick="liveCam(\'cars\',\'' + c.id + '\')">Sacar foto ahora</button></div>' +
  '<div class="sec-t">Firma de conformidad</div>' +
  '<canvas id="in_firma" width="335" height="140" style="width:100%;height:140px;border:1px solid var(--line);border-radius:8px;touch-action:none;background:#fff;display:block"></canvas>' +
  '<div class="row" style="margin-top:8px"><button class="btn sec sm" onclick="limpiarFirmaInspeccion()">Limpiar firma</button></div>' +
  '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="saveInspeccion(\'' + c.id + '\')">Guardar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
  initFirmaInspeccion();
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
  const o = { id: uid(), carId, driverId: (c || {}).choferId || '', tipo: val('i_tipo'), fecha: val('i_fecha') || iso(today()), km: val('i_km'), combustible: val('i_combustible'), items, notas: val('i_notas'), firma };
  const km = val('i_km');
  if (await save('inspecciones', o)) { if (km) await actualizarKm(carId, km); closeModal(); toast('Inspección guardada' + (firma ? ' con firma' : '')); }
}
export async function delInspeccion(id) {
  const x = S.inspecciones.find(v => v.id === id);
  if (await remove('inspecciones', id)) { toast('Inspección borrada'); if (x) carForm(x.carId); }
}
