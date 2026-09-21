import { S, sb, as } from './state.js';
import { $, val, uid, iso, today, esc, fdate } from './utils.js';
import { DOCS, DCATS, CCATS, ACCEPT } from './constants.js';
import { BUCKET } from './config.js';
import { toast } from './modal.js';
import { render } from './nav.js';
import { rowOf, putLocal } from './data.js';
import { hydrateThumbs } from './storage.js';

export async function purgeFiles(e) {
  if (!as || !e || !e.files) return;
  for (const f of e.files) { if (f.link) continue; try { await as.delete(f.id); } catch (x) {} }
}
export async function patchDoc(col, id, patch) {
  const cur = S[col].find(x => x.id === id);
  if (!cur) { toast('No se encontró el registro.'); return false; }
  const o = Object.assign({}, cur);
  for (const k in patch) o[k] = k === 'docs' ? Object.assign({}, o.docs || {}, patch.docs) : patch[k];
  const r = await sb.from(col).upsert(rowOf(o));
  if (r.error) { toast('No se pudo guardar el archivo (' + r.error.message + ')'); return false; }
  putLocal(col, o); render(); return true;
}
export function renderFiles(col, id) {
  const el = $('#files'); if (!el) return;
  if (!id) { el.innerHTML = '<div class="small muted" style="margin-bottom:12px">Guardá primero y después podés adjuntar fotos, PDF o links.</div>'; return; }
  const prev = $('#f_cat') ? $('#f_cat').value : '';
  const e = S[col].find(x => x.id === id); const F = (e && e.files) || [];
  const cats = col === 'drivers' ? DCATS : CCATS;
  const label = k => (cats.find(c => c[0] === k) || [0, 'Archivo'])[1];
  const gallery = col === 'cars' ? F.filter(f => !f.link && f.cat === 'fotos' && (f.type || '').startsWith('image/')) : [];
  const rest = F.filter(f => !gallery.includes(f));
  const catCounts = {}; rest.forEach(f => { catCounts[f.cat] = (catCounts[f.cat] || 0) + 1; });
  const lastIdxByCat = {}; rest.forEach((f, i) => { lastIdxByCat[f.cat] = i; });
  let h = '';
  if (gallery.length) {
    h += '<div class="photogrid">' + gallery.map(f =>
      '<div class="phototile tap" onclick="viewFile(\'' + esc(f.id) + '\',\'' + esc(f.name) + '\')"><img alt="" data-path="' + esc(f.id) + '">' +
      (as ? '<button class="btn danger sm" onclick="event.stopPropagation();confirmDel(this,()=>delFile(\'' + col + '\',\'' + id + '\',\'' + esc(f.id) + '\'))">Quitar</button>' : '') + '</div>'
    ).join('') + '</div>';
  }
  h += rest.length ? rest.map((f, i) => {
    const img = !f.link && (f.type || '').startsWith('image/');
    const open = f.link ? "window.open('" + esc(f.link) + "','_blank')" : "viewFile('" + esc(f.id) + "','" + esc(f.name) + "')";
    const version = catCounts[f.cat] > 1 ? (i === lastIdxByCat[f.cat] ? ' <span class="badge b-ok">Vigente</span>' : ' <span class="badge b-mute">Anterior</span>') : '';
    return '<div class="card row"><div class="row grow tap" onclick="' + open + '">' +
    (img ? '<img class="fthumb" alt="" data-path="' + esc(f.id) + '">' : '<div class="fthumb fpdf">' + (f.link ? 'LINK' : 'PDF') + '</div>') +
    '<div class="grow" style="overflow-wrap:anywhere"><div>' + esc(label(f.cat)) + version + '</div><div class="small muted">' + esc(f.name) + ' · ' + fdate(f.fecha) + '</div></div></div>' +
    ((as || f.link) ? '<button class="btn danger sm" onclick="confirmDel(this,()=>delFile(\'' + col + '\',\'' + id + '\',\'' + esc(f.id) + '\'))">Quitar</button>' : '') + '</div>';
  }).join('') : (gallery.length ? '' : '<div class="small muted" style="margin-bottom:8px">Todavía no hay archivos.</div>');
  h += '<label class="f"><span>Categoría</span><select id="f_cat">' + cats.map(c => '<option value="' + c[0] + '">' + esc(c[1]) + '</option>').join('') + '</select></label>';
  if (as) {
    h += '<div class="two" style="margin-bottom:10px">' +
      '<label class="btn sec filebtn">Elegir archivo<input id="fileIn" type="file" accept="image/*,application/pdf" onchange="attach(\'' + col + '\',\'' + id + '\')"></label>' +
      '<button class="btn sec" onclick="liveCam(\'' + col + '\',\'' + id + '\')">Sacar foto</button></div>' +
      '<div class="paste" contenteditable="true" data-ph="Tocá acá y pegá una foto copiada" onpaste="onPaste(event,\'' + col + '\',\'' + id + '\')" oninput="this.innerHTML=\'\'"></div>';
  } else {
    h += '<div class="small muted" style="margin-bottom:10px">Subir archivos no está disponible en esta vista.</div>';
    if (!renderFiles._t && !renderFiles._tried) { renderFiles._t = 1; renderFiles._tried = 1; getAssets().then(a => { renderFiles._t = 0; if (a) renderFiles(col, id); else diag().then(t => fstat(t)); }); }
  }
  h += '<div class="small muted" style="margin-bottom:6px">También podés pegar el link de un archivo guardado en Drive o Dropbox.</div>' +
    '<div class="two" style="margin-bottom:12px"><input id="f_link" type="url" inputmode="url" placeholder="https://…"><button class="btn sec" onclick="addLink(\'' + col + '\',\'' + id + '\')">Guardar link</button></div>';
  el.innerHTML = h; hydrateThumbs(el);
  if (prev && $('#f_cat')) $('#f_cat').value = prev;
}
renderFiles._tried = 0;
renderFiles._t = 0;

let camStream = null;
export async function liveCam(col, id) {
  const m = $('#modal2');
  m.innerHTML = '<div class="scrim" onclick="closeCam()"></div><div class="sheet"><h3>Sacar foto</h3><div id="camBox" class="small muted">Pidiendo permiso a la cámara…</div>' +
    '<div class="row" style="margin-top:12px"><button class="btn grow" id="shot" disabled onclick="shoot(\'' + col + '\',\'' + id + '\')">Capturar</button><button class="btn sec" onclick="closeCam()">Cerrar</button></div></div>';
  m.classList.add('open');
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    const box = document.getElementById('camBox');
    box.innerHTML = '<video id="cam" class="viewer" autoplay playsinline muted></video>';
    const v = document.getElementById('cam'); v.srcObject = camStream;
    try { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (x) {}
    const btn = document.getElementById('shot'); if (btn) btn.disabled = false;
  } catch (e) {
    const n = (e && e.name) || '';
    const msg = n === 'NotAllowedError' ? 'No se dio permiso para usar la cámara. Habilitalo para Claude en los ajustes del celular, o pegá una foto copiada en el recuadro.' :
      n === 'NotFoundError' ? 'No se encontró ninguna cámara en este dispositivo.' :
      'No se pudo abrir la cámara acá (' + (n || 'error') + '). Probá pegar una foto copiada, o abrir la app desde el navegador del celular.';
    const box = document.getElementById('camBox'); if (box) { box.textContent = msg; box.style.color = 'var(--bad)'; }
  }
}
export function closeCam() {
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  const m = $('#modal2'); m.classList.remove('open'); m.innerHTML = '';
}
export async function shoot(col, id) {
  const v = document.getElementById('cam'); if (!v) return;
  if (!v.videoWidth) { toast('La cámara todavía está iniciando. Esperá un segundo y volvé a tocar Capturar.'); return; }
  try {
    const cv = document.createElement('canvas');
    cv.width = v.videoWidth; cv.height = v.videoHeight;
    cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
    closeCam();
    if (!blob) { fstat('No se pudo capturar la foto.', 1); return; }
    try { blob.name = 'foto-' + iso(today()) + '.jpg'; } catch (x) {}
    await attach(col, id, null, blob);
  } catch (e) {
    fstat('Error al capturar: ' + ((e && (e.name || e.message)) || 'desconocido'), 1);
  }
}
let lastObj = null;
export async function viewFile(fid, name) {
  try {
    const r = await sb.storage.from(BUCKET).download(fid);
    if (r.error || !r.data) throw (r.error || new Error('sin datos'));
    const b = r.data;
    if (lastObj) URL.revokeObjectURL(lastObj);
    lastObj = URL.createObjectURL(b);
    const t = b.type || '';
    let body;
    if (t.startsWith('image/')) body = '<img class="viewer" alt="' + esc(name) + '" src="' + lastObj + '">';
    else body = '<div class="card"><div style="overflow-wrap:anywhere">' + esc(name) + '</div><div class="small muted">' + Math.round(b.size / 1024) + ' KB</div></div>';
    const m = $('#modal2');
    m.innerHTML = '<div class="scrim" onclick="closeViewer()"></div><div class="sheet" role="dialog" aria-modal="true"><h3 style="overflow-wrap:anywhere">' + esc(name) + '</h3>' + body +
      '<div class="row" style="margin-top:12px"><a class="btn grow" style="text-align:center" href="' + lastObj + '" download="' + esc(name) + '" target="_blank" rel="noopener">Descargar</a>' +
      '<button class="btn sec" onclick="closeViewer()">Cerrar</button></div></div>';
    m.classList.add('open');
  } catch (e) {
    toast('No se pudo abrir el archivo. Puede que se haya borrado.');
  }
}
export function closeViewer() {
  const m = $('#modal2'); m.classList.remove('open'); m.innerHTML = '';
  if (lastObj) { URL.revokeObjectURL(lastObj); lastObj = null; }
}
export async function addLink(col, id) {
  const u = val('f_link');
  if (!/^https?:\/\/\S+$/i.test(u)) { fstat('Pegá un link que empiece con https://', 1); return; }
  const cat = val('f_cat');
  const cur = S[col].find(x => x.id === id);
  const files = ((cur && cur.files) || []).concat([{ id: uid(), name: u.replace(/^https?:\/\//i, '').slice(0, 60), cat, link: u, fecha: iso(today()) }]);
  const patch = { files };
  const tick = col === 'drivers' && DOCS.some(x => x[0] === cat);
  if (tick) patch.docs = { [cat]: true };
  if (!(await patchDoc(col, id, patch))) return;
  if (tick) { const cb = document.getElementById('dc_' + cat); if (cb) cb.checked = true; }
  renderFiles(col, id); fstat('Listo: link guardado.');
}
async function shrink(f) {
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (k === 1 && f.type === 'image/jpeg' && f.size < 1.5e6) return f;
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const b = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
    if (!b) return f;
    return (ACCEPT.includes(f.type) && b.size >= f.size) ? f : b;
  } catch (e) { return f; }
}
function guessType(f) {
  if (f.type) return f.type;
  const e = ((f.name || '').split('.').pop() || '').toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', heic: 'image/heic' }[e] || '';
}
export function fstat(m, bad) {
  const el = document.getElementById('fstatus');
  if (el) { el.textContent = m; el.style.color = bad ? 'var(--bad)' : 'var(--muted)'; }
  if (bad) toast(m);
}
async function getAssets() { return as; }
async function diag() { return 'Sesión: ' + (S.user ? 'iniciada' : 'no iniciada'); }
export async function onPaste(ev, col, id) {
  const it = (ev.clipboardData && ev.clipboardData.items) || [];
  for (const i of it) {
    if (i.kind === 'file') { const f = i.getAsFile(); if (f) { ev.preventDefault(); await attach(col, id, null, f); ev.target.innerHTML = ''; return; } }
  }
  ev.preventDefault(); fstat('No había ninguna imagen copiada. Copiá la foto y volvé a pegar.', 1);
}
export async function attach(col, id, inputId, blobIn) {
  const inp = document.getElementById(inputId || 'fileIn');
  const f = blobIn || (inp && inp.files && inp.files[0]);
  if (!f) { fstat('No se eligió ningún archivo.', 1); return; }
  try {
    if (!(await getAssets())) { fstat('Adjuntar no está disponible en esta vista. ' + await diag(), 1); return; }
    const cat = val('f_cat'); const ft = guessType(f);
    if (inp) inp.value = '';
    fstat('Archivo elegido: ' + (f.name || 'imagen') + ' (' + Math.round(f.size / 1024) + ' KB). Preparando…');
    let blob = f;
    if (ft.startsWith('image/') && ft !== 'image/gif') blob = await shrink(f);
    else if (!f.type && ft) blob = f.slice(0, f.size, ft);
    if (!ACCEPT.includes(blob.type)) { fstat('Formato no admitido (' + (blob.type || ft || 'desconocido') + '). Usá foto JPG o PNG, o PDF.', 1); return; }
    fstat('Subiendo ' + Math.round(blob.size / 1024) + ' KB…');
    let r;
    try { r = await as.upload(blob); }
    catch (e) {
      fstat('No se pudo subir el archivo: ' + ((e && e.message) || 'error'), 1); return;
    }
    const cur = S[col].find(x => x.id === id);
    const files = ((cur && cur.files) || []).concat([{ id: r.id, name: f.name || ('foto-' + iso(today()) + '.jpg'), cat, type: r.contentType, size: r.sizeBytes, fecha: iso(today()) }]);
    const patch = { files };
    const tick = col === 'drivers' && DOCS.some(x => x[0] === cat);
    if (tick) patch.docs = { [cat]: true };
    if (!(await patchDoc(col, id, patch))) { try { await as.delete(r.id); } catch (x) {} fstat('El archivo se subió pero no se pudo guardar en la ficha. Probá de nuevo.', 1); return; }
    if (tick) { const cb = document.getElementById('dc_' + cat); if (cb) cb.checked = true; }
    renderFiles(col, id); fstat('Listo: archivo adjuntado.');
  } catch (e) {
    fstat('Error al adjuntar: ' + ((e && (e.code || e.message)) || 'desconocido'), 1);
  }
}
export async function delFile(col, id, fid) {
  const e = S[col].find(x => x.id === id); if (!e) return;
  const f = (e.files || []).find(x => x.id === fid);
  if (!(await patchDoc(col, id, { files: (e.files || []).filter(x => x.id !== fid) }))) return;
  if (f && !f.link && as) { try { await as.delete(fid); } catch (x) {} }
  renderFiles(col, id); toast('Archivo quitado');
}
