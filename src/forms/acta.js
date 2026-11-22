// Acta de entrega y de devolución del auto: km, combustible, elementos, limpieza, daños,
// fotos y la firma de los dos en el celular. Sale un PDF con membrete que queda en los
// archivos del auto. En la devolución se compara con el acta de entrega (km y daños nuevos).
import { S } from '../state.js';
import { esc, uid, iso, today, fdate } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de } from '../memo.js';
import { driverName } from '../calc.js';
import { ELEMENTOS_SEGURIDAD } from '../constants.js';
import { subirArchivoSuelto } from '../files.js';
import { membrete, pies, proximoNumero } from '../membrete.js';
import { TIPOS_DANO } from './danos.js';

const COMBUSTIBLE = ['Reserva', '1/4', '1/2', '3/4', 'Lleno'];
const EXTRAS = [['llaves', 'Llaves (todas las copias)'], ['cedula', 'Cédula del auto'], ['seguro', 'Credencial del seguro'], ['auxilio', 'Rueda de auxilio y criquet']];
const tipoDano = t => (TIPOS_DANO.find(x => x[0] === t) || [0, 'Daño'])[1];
const firmas = {};

export function seccionActas(c) {
  const A = (c.actas || []).slice().sort((a, b) => String(b.fecha).localeCompare(a.fecha)).slice(0, 3);
  return '<div class="card" style="margin-bottom:10px"><div class="row between" style="gap:8px"><b>Actas de entrega y devolución</b></div>' +
    (A.length ? A.map(a => '<div class="small muted" style="padding:2px 0">' + fdate(a.fecha) + ' · ' + (a.tipo === 'entrega' ? 'Entrega' : 'Devolución') + ' · ' + esc(driverName(a.choferId) || 'sin chofer') + ' · ' + Number(a.km || 0).toLocaleString('es-AR') + ' km · N° ' + esc(a.numero) + '</div>').join('') : '<div class="small muted">Todavía no hay actas.</div>') +
    '<div class="row" style="margin-top:8px;gap:8px"><button class="btn sec sm grow" onclick="actaForm(\'' + c.id + '\',\'entrega\')">Acta de entrega</button><button class="btn sec sm grow" onclick="actaForm(\'' + c.id + '\',\'devolucion\')">Acta de devolución</button></div></div>';
}

export function actaForm(carId, tipo) {
  const c = de('cars', 'id', carId)[0]; if (!c) return;
  const choferId = c.choferId || ((c.historialChoferes || []).slice(-1)[0] || {}).choferId || '';
  const abiertos = (c.danos || []).filter(d => !d.reparado);
  const ultimaEntrega = (c.actas || []).filter(a => a.tipo === 'entrega').sort((a, b) => String(b.fecha).localeCompare(a.fecha))[0];
  const chk = (id, l, on) => '<label class="chk"><input type="checkbox" class="ac_el" data-k="' + id + '"' + (on ? ' checked' : '') + '><span>' + l + '</span></label>';
  openModal('<h3>Acta de ' + (tipo === 'entrega' ? 'entrega' : 'devolución') + ' · ' + esc(c.patente) + '</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Completala con el chofer al lado. Al final firman los dos en la pantalla y queda el PDF en los archivos del auto.</div>' +
    '<label class="f"><span>Chofer</span><select id="ac_chofer"><option value="">Sin chofer</option>' + S.drivers.filter(d => !d.prospecto).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))).map(d => '<option value="' + d.id + '"' + (d.id === choferId ? ' selected' : '') + '>' + esc(d.nombre) + '</option>').join('') + '</select></label>' +
    '<div class="two"><label class="f"><span>Kilometraje</span><input id="ac_km" inputmode="numeric" value="' + esc(c.km || '') + '"></label>' +
    '<label class="f"><span>Combustible</span><select id="ac_comb">' + COMBUSTIBLE.map(x => '<option>' + x + '</option>').join('') + '</select></label></div>' +
    (tipo === 'devolucion' && ultimaEntrega ? '<div class="small muted" style="margin:-4px 0 10px">En la entrega del ' + fdate(ultimaEntrega.fecha) + ' tenía ' + Number(ultimaEntrega.km || 0).toLocaleString('es-AR') + ' km y combustible ' + esc(ultimaEntrega.combustible || '—') + '.</div>' : '') +
    '<div class="sec-t">Elementos</div>' + ELEMENTOS_SEGURIDAD.concat(EXTRAS).map(([k, l]) => chk(k, l, true)).join('') +
    '<label class="f" style="margin-top:8px"><span>Limpieza</span><select id="ac_limpio"><option>Limpio</option><option>Aceptable</option><option>Sucio</option></select></label>' +
    '<div class="sec-t">Daños</div>' + (abiertos.length ? abiertos.map((d, i) => '<div class="small">' + (i + 1) + '. ' + esc(tipoDano(d.tipo)) + (d.descripcion ? ': ' + esc(d.descripcion) : '') + ' <span class="muted">(' + fdate(d.fecha) + ')</span></div>').join('') : '<div class="small muted">Sin daños marcados.</div>') +
    '<button class="btn sec sm" style="margin:6px 0 10px" onclick="danosView(\'' + c.id + '\')">Marcar un daño en el mapa</button>' +
    '<label class="f"><span>Observaciones</span><textarea id="ac_obs" rows="3" placeholder="ej: rayón chico en paragolpes trasero, ya estaba"></textarea></label>' +
    '<label class="btn sec block filebtn" style="margin-bottom:6px">Fotos del auto (hasta 4)<input id="ac_fotos" type="file" accept="image/*" multiple onchange="document.getElementById(\'ac_fotosTxt\').textContent=this.files.length?this.files.length+\' foto(s) lista(s)\':\'\'"></label><div id="ac_fotosTxt" class="small muted" style="margin-bottom:8px"></div>' +
    '<div class="sec-t">Firmas</div>' +
    '<div class="small muted">Firma del chofer</div><canvas id="ac_f1" width="600" height="180" style="width:100%;height:110px;border:1px solid var(--line);border-radius:8px;background:#fff;touch-action:none"></canvas><button class="btn sec sm" onclick="limpiarFirmaActa(\'ac_f1\')">Borrar</button>' +
    '<div class="small muted" style="margin-top:8px">Firma de la empresa</div><canvas id="ac_f2" width="600" height="180" style="width:100%;height:110px;border:1px solid var(--line);border-radius:8px;background:#fff;touch-action:none"></canvas><button class="btn sec sm" onclick="limpiarFirmaActa(\'ac_f2\')">Borrar</button>' +
    '<div class="row" style="margin-top:12px"><button class="btn grow" id="ac_btn" onclick="guardarActa(\'' + c.id + '\',\'' + tipo + '\')">Generar acta</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>');
  ['ac_f1', 'ac_f2'].forEach(pad);
}
function pad(id) {
  const cv = document.getElementById(id); if (!cv) return;
  const ctx = cv.getContext('2d'); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#111';
  firmas[id] = false;
  let ult = null;
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  cv.addEventListener('pointerdown', e => { ult = pos(e); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (!ult) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(ult[0], ult[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); ult = p; firmas[id] = true; });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => cv.addEventListener(ev, () => { ult = null; }));
}
export function limpiarFirmaActa(id) {
  const cv = document.getElementById(id); if (!cv) return;
  cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); firmas[id] = false;
}
// Foto achicada en JPEG para meter en el PDF.
async function fotoParaPdf(f) {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return { url: cv.toDataURL('image/jpeg', 0.7), w: cv.width, h: cv.height };
}

export async function guardarActa(carId, tipo) {
  const c = de('cars', 'id', carId)[0]; if (!c) return;
  if (!firmas.ac_f1 || !firmas.ac_f2) { toast('Faltan las firmas del chofer y de la empresa'); return; }
  const btn = document.getElementById('ac_btn'); if (btn) btn.disabled = true;
  try {
    const v = id => ((document.getElementById(id) || {}).value || '').trim();
    const choferId = v('ac_chofer'), km = Math.round(+v('ac_km') || 0), combustible = v('ac_comb'), limpieza = v('ac_limpio'), obs = v('ac_obs');
    const elementos = [...document.querySelectorAll('.ac_el')].map(x => ({ k: x.dataset.k, ok: x.checked }));
    const etiqueta = k => (ELEMENTOS_SEGURIDAD.concat(EXTRAS).find(x => x[0] === k) || [0, k])[1];
    const fotosIn = [...((document.getElementById('ac_fotos') || {}).files || [])].slice(0, 4);
    const fotos = [];
    for (const f of fotosIn) { try { fotos.push(await fotoParaPdf(f)); } catch (e) { /* foto ilegible: se saltea */ } }
    const f1 = document.getElementById('ac_f1').toDataURL('image/png'), f2 = document.getElementById('ac_f2').toDataURL('image/png');
    const entrega = (c.actas || []).filter(a => a.tipo === 'entrega').sort((a, b) => String(b.fecha).localeCompare(a.fecha))[0];
    const abiertos = (c.danos || []).filter(d => !d.reparado);
    const nuevos = tipo === 'devolucion' && entrega ? abiertos.filter(d => d.fecha >= entrega.fecha) : [];

    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const numero = proximoNumero('acta');
    let y = membrete(doc, { titulo: 'Acta de ' + (tipo === 'entrega' ? 'entrega' : 'devolución'), numero });
    const mg = 15, W = 180;
    const linea = (l, t) => { if (y > 270) { doc.addPage(); y = 20; } doc.setTextColor(110); doc.text(l, mg, y); doc.setTextColor(0); doc.text(doc.splitTextToSize(String(t), W - 50), mg + 50, y); y += 6 * Math.max(1, doc.splitTextToSize(String(t), W - 50).length); };
    const titulo = t => { y += 3; if (y > 265) { doc.addPage(); y = 20; } doc.setFont(undefined, 'bold'); doc.text(t, mg, y); doc.setFont(undefined, 'normal'); y += 7; };
    titulo('Vehículo');
    linea('Auto', [c.marca, c.modelo, c.anio].filter(Boolean).join(' ') + ' · Patente ' + (c.patente || ''));
    linea('Chofer', driverName(choferId) || '—');
    linea('Fecha', fdate(iso(today())));
    linea('Kilometraje', km.toLocaleString('es-AR') + ' km' + (tipo === 'devolucion' && entrega ? ' (' + (km - (+entrega.km || 0)).toLocaleString('es-AR') + ' km desde la entrega del ' + fdate(entrega.fecha) + ')' : ''));
    linea('Combustible', combustible + (tipo === 'devolucion' && entrega && entrega.combustible ? ' (en la entrega: ' + entrega.combustible + ')' : ''));
    linea('Limpieza', limpieza);
    titulo('Elementos');
    elementos.forEach(e => linea(etiqueta(e.k), e.ok ? 'Sí' : 'NO'));
    titulo('Daños');
    if (!abiertos.length) linea('Estado', 'Sin daños marcados');
    abiertos.forEach((d, i) => linea((i + 1) + '. ' + tipoDano(d.tipo), (d.descripcion || '—') + ' (' + fdate(d.fecha) + ')' + (nuevos.includes(d) ? ' — NUEVO' : '')));
    if (obs) { titulo('Observaciones'); linea('', obs); }
    if (fotos.length) {
      titulo('Fotos');
      let x = mg;
      fotos.forEach(f => { const w = 86, h = Math.min(65, w * f.h / f.w); if (x + w > mg + W + 1) { x = mg; y += 68; } if (y + h > 280) { doc.addPage(); y = 20; x = mg; } doc.addImage(f.url, 'JPEG', x, y, w, h); x += w + 8; });
      y += 70;
    }
    if (y > 235) { doc.addPage(); y = 20; }
    y += 6;
    doc.addImage(f1, 'PNG', mg, y, 70, 21); doc.addImage(f2, 'PNG', mg + 95, y, 70, 21);
    y += 24; doc.setFontSize(8);
    doc.text('Firma del chofer: ' + (driverName(choferId) || ''), mg, y); doc.text('Firma de la empresa', mg + 95, y);
    pies(doc, numero);
    const nombre = 'acta-' + tipo + '-' + String(c.patente || 'auto').replace(/\s/g, '') + '-' + iso(today()) + '.pdf';
    const blob = doc.output('blob');
    const archivo = new File([blob], nombre, { type: 'application/pdf' });
    const up = await subirArchivoSuelto(archivo);
    doc.save(nombre);
    const acta = { id: uid(), tipo, fecha: iso(today()), choferId, km, combustible, limpieza, elementos, observaciones: obs, numero, archivo: up ? up.id : '', danosNuevos: nuevos.map(d => d.id) };
    const fresco = de('cars', 'id', carId)[0] || c;
    const patch = { actas: (fresco.actas || []).concat([acta]) };
    if (up) patch.files = (fresco.files || []).concat([{ id: up.id, name: nombre, cat: 'acta', type: 'application/pdf', size: up.size, fecha: iso(today()) }]);
    if (km > (+fresco.km || 0)) { patch.km = km; patch.kmHistorial = (fresco.kmHistorial || []).concat([{ fecha: iso(today()), km, origen: 'acta' }]); }
    if (await save('cars', Object.assign({}, fresco, patch))) { toast('Acta generada' + (up ? ' y guardada en los archivos del auto' : '')); window.carForm(carId); }
  } catch (e) {
    toast('No se pudo generar el acta: ' + ((e && e.message) || 'error'));
  } finally { if (btn) btn.disabled = false; }
}
