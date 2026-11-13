// Mapa de daños del auto: un dibujo del auto visto desde arriba donde se marcan golpes,
// rayones y roturas con su foto. Cada daño queda con la fecha y el chofer que tenía el auto,
// así al devolverlo se ve qué es nuevo desde que se lo entregaste.
import { S } from '../state.js';
import { esc, uid, iso, today, fdate } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de } from '../memo.js';
import { choferEnFecha, driverName } from '../calc.js';
import { subirArchivoSuelto } from '../files.js';

export const TIPOS_DANO = [['golpe', 'Golpe / abolladura'], ['rayon', 'Rayón'], ['rotura', 'Rotura (vidrio, óptica, espejo)'], ['interior', 'Interior (tapizado, tablero)'], ['otro', 'Otro']];
const tipoLabel = t => (TIPOS_DANO.find(x => x[0] === t) || [0, 'Daño'])[1];
const COLOR = { golpe: '#d64545', rayon: '#e09a1a', rotura: '#7b4fd6', interior: '#2f7fd6', otro: '#6b7480' };

// Desde cuándo lo tiene el chofer actual (o el último), para marcar lo nuevo.
function entregaActual(c) {
  const H = (c.historialChoferes || []).slice().sort((a, b) => String(b.desde).localeCompare(String(a.desde)));
  const h = H[0];
  return h ? { desde: h.desde, choferId: h.choferId, hasta: h.hasta } : null;
}
const abiertos = c => (c.danos || []).filter(d => !d.reparado);

// Dibujo del auto visto desde arriba (adelante hacia arriba).
function dibujo(c, marcas, conClick) {
  const puntos = marcas.map((d, i) => '<g><circle cx="' + d.x * 2 + '" cy="' + d.y * 4 + '" r="9" fill="' + (COLOR[d.tipo] || COLOR.otro) + '" stroke="#fff" stroke-width="2"/>' +
    '<text x="' + d.x * 2 + '" y="' + (d.y * 4 + 4) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">' + (i + 1) + '</text></g>').join('');
  return '<svg id="dn_svg" viewBox="0 0 200 400" style="width:100%;max-width:220px;display:block;margin:0 auto;touch-action:manipulation;' + (conClick ? 'cursor:crosshair' : '') + '"' + (conClick ? ' onclick="clickMapaDano(event,\'' + c.id + '\')"' : '') + ' role="img" aria-label="Dibujo del auto visto desde arriba">' +
    '<text x="100" y="14" text-anchor="middle" font-size="11" fill="currentColor" opacity=".6">Adelante</text>' +
    '<text x="100" y="396" text-anchor="middle" font-size="11" fill="currentColor" opacity=".6">Atrás</text>' +
    '<text x="12" y="200" font-size="11" fill="currentColor" opacity=".6" transform="rotate(-90 12 200)" text-anchor="middle">Izquierda</text>' +
    '<text x="190" y="200" font-size="11" fill="currentColor" opacity=".6" transform="rotate(90 190 200)" text-anchor="middle">Derecha</text>' +
    '<rect x="44" y="70" width="14" height="40" rx="4" fill="currentColor" opacity=".55"/><rect x="142" y="70" width="14" height="40" rx="4" fill="currentColor" opacity=".55"/>' +
    '<rect x="44" y="280" width="14" height="40" rx="4" fill="currentColor" opacity=".55"/><rect x="142" y="280" width="14" height="40" rx="4" fill="currentColor" opacity=".55"/>' +
    '<rect x="52" y="24" width="96" height="352" rx="38" fill="none" stroke="currentColor" stroke-width="3"/>' +
    '<path d="M62 120 Q100 100 138 120 L132 150 Q100 140 68 150 Z" fill="currentColor" opacity=".18"/>' +
    '<rect x="66" y="156" width="68" height="110" rx="10" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/>' +
    '<path d="M68 272 Q100 282 132 272 L136 300 Q100 312 64 300 Z" fill="currentColor" opacity=".18"/>' +
    puntos + '</svg>';
}

export function seccionDanos(c) {
  const A = abiertos(c);
  const e = entregaActual(c);
  const nuevos = e ? A.filter(d => d.fecha >= e.desde).length : 0;
  return '<div class="card row between" style="margin-bottom:10px;gap:8px"><div><b>Daños</b><div class="small muted">' +
    (A.length ? A.length + (A.length === 1 ? ' daño sin reparar' : ' daños sin reparar') + (nuevos ? ' · ' + nuevos + (nuevos === 1 ? ' nuevo' : ' nuevos') + ' desde la última entrega' : '') : 'Sin daños marcados') +
    '</div></div><button class="btn sec sm" onclick="danosView(\'' + c.id + '\')">' + (A.length ? 'Ver mapa' : 'Marcar daños') + '</button></div>';
}

let soloNuevos = false;
export function danosView(carId, nuevos) {
  if (nuevos !== undefined) soloNuevos = !!nuevos;
  const c = de('cars', 'id', carId)[0]; if (!c) return;
  const e = entregaActual(c);
  let A = abiertos(c);
  if (soloNuevos && e) A = A.filter(d => d.fecha >= e.desde);
  const rep = (c.danos || []).filter(d => d.reparado).slice(-10).reverse();
  let h = '<h3>Daños · ' + esc(c.patente) + '</h3>' +
    '<div class="small muted" style="margin-bottom:8px">Tocá el dibujo donde está el daño para marcarlo. Cada marca queda con la fecha y el chofer que tenía el auto.</div>' +
    (e ? '<div class="row" style="margin-bottom:8px;gap:8px"><button class="btn ' + (soloNuevos ? 'sec ' : '') + 'sm grow" onclick="danosView(\'' + c.id + '\',false)">Todos</button><button class="btn ' + (soloNuevos ? '' : 'sec ') + 'sm grow" onclick="danosView(\'' + c.id + '\',true)">Nuevos desde el ' + fdate(e.desde) + '</button></div>' : '') +
    '<div class="card" style="color:var(--ink)">' + dibujo(c, A, true) + '</div>' +
    '<div class="small" style="display:flex;flex-wrap:wrap;gap:6px 12px;margin:6px 0 10px">' + TIPOS_DANO.map(t => '<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + COLOR[t[0]] + '"></span> ' + esc(t[1].split(' ')[0]) + '</span>').join('') + '</div>';
  h += A.length ? A.map((d, i) => '<div class="card"><div class="row between" style="gap:8px"><b>' + (i + 1) + '. ' + esc(tipoLabel(d.tipo)) + '</b><span class="small muted">' + fdate(d.fecha) + '</span></div>' +
    (d.descripcion ? '<div class="small">' + esc(d.descripcion) + '</div>' : '') +
    '<div class="small muted">' + (d.choferId ? 'Lo tenía ' + esc(driverName(d.choferId)) : 'Sin chofer en esa fecha') + (e && d.fecha >= e.desde ? ' · <b style="color:var(--warn)">nuevo</b>' : '') + '</div>' +
    '<div class="row" style="margin-top:6px;gap:8px">' + (d.foto ? '<button class="btn sec sm" onclick="viewFile(\'' + esc(d.foto) + '\',\'dano.jpg\')">Ver foto</button>' : '') +
    '<button class="btn sec sm" onclick="repararDano(\'' + c.id + '\',\'' + d.id + '\')">Ya está reparado</button></div></div>').join('')
    : '<div class="small muted" style="margin-bottom:8px">' + (soloNuevos ? 'No hay daños nuevos desde la última entrega.' : 'No hay daños marcados.') + '</div>';
  if (rep.length) h += '<details style="margin-top:8px"><summary class="small" style="cursor:pointer">Reparados (' + rep.length + ')</summary>' + rep.map(d => '<div class="small muted" style="padding:3px 0">' + fdate(d.fecha) + ' · ' + esc(tipoLabel(d.tipo)) + (d.descripcion ? ': ' + esc(d.descripcion) : '') + ' · reparado el ' + fdate(d.fechaReparado) + '</div>').join('') + '</details>';
  h += '<div class="row" style="margin-top:10px"><button class="btn sec grow" onclick="carForm(\'' + c.id + '\')">Volver al auto</button></div>';
  openModal(h);
}
export function clickMapaDano(ev, carId) {
  const svg = document.getElementById('dn_svg'); if (!svg) return;
  const r = svg.getBoundingClientRect();
  const x = Math.round((ev.clientX - r.left) / r.width * 100), y = Math.round((ev.clientY - r.top) / r.height * 100);
  nuevoDanoForm(carId, Math.min(98, Math.max(2, x)), Math.min(98, Math.max(2, y)));
}
export function nuevoDanoForm(carId, x, y) {
  const c = de('cars', 'id', carId)[0]; if (!c) return;
  openModal('<h3>Nuevo daño · ' + esc(c.patente) + '</h3>' +
    '<div class="card" style="color:var(--ink)">' + dibujo(c, [{ x, y, tipo: 'otro' }], false) + '</div>' +
    '<div class="two"><label class="f"><span>Tipo</span><select id="dn_tipo">' + TIPOS_DANO.map(t => '<option value="' + t[0] + '">' + t[1] + '</option>').join('') + '</select></label>' +
    '<label class="f"><span>Fecha</span><input id="dn_fecha" type="date" value="' + iso(today()) + '"></label></div>' +
    '<label class="f"><span>Descripción <small>opcional</small></span><input id="dn_desc" placeholder="ej: puerta trasera derecha, rayón de 10 cm"></label>' +
    '<label class="btn sec block filebtn" style="margin-bottom:6px">Foto del daño<input id="dn_foto" type="file" accept="image/*" capture="environment" onchange="document.getElementById(\'dn_fotoTxt\').textContent=this.files.length?\'✓ Foto lista\':\'\'"></label><div id="dn_fotoTxt" class="small muted" style="margin-bottom:8px"></div>' +
    '<div class="row"><button class="btn grow" id="dn_btn" onclick="guardarDano(\'' + c.id + '\',' + x + ',' + y + ')">Guardar</button><button class="btn sec" onclick="danosView(\'' + c.id + '\')">Cancelar</button></div>');
}
export async function guardarDano(carId, x, y) {
  const c = de('cars', 'id', carId)[0]; if (!c) return;
  const btn = document.getElementById('dn_btn'); if (btn) btn.disabled = true;
  try {
    const fecha = (document.getElementById('dn_fecha') || {}).value || iso(today());
    const inp = document.getElementById('dn_foto'); const f = inp && inp.files && inp.files[0];
    let foto = '';
    if (f) { const r = await subirArchivoSuelto(f); if (r) foto = r.id; }
    const d = { id: uid(), x, y, tipo: document.getElementById('dn_tipo').value, descripcion: document.getElementById('dn_desc').value.trim(), fecha, foto, choferId: choferEnFecha(c, fecha) || '', por: (S.user && S.user.email) || '' };
    const fresco = de('cars', 'id', carId)[0] || c;
    if (await save('cars', Object.assign({}, fresco, { danos: (fresco.danos || []).concat([d]) }))) { toast('Daño marcado'); danosView(carId); }
  } finally { if (btn) btn.disabled = false; }
}
export async function repararDano(carId, danoId) {
  const c = de('cars', 'id', carId)[0]; if (!c) return;
  const danos = (c.danos || []).map(d => (d.id === danoId ? Object.assign({}, d, { reparado: true, fechaReparado: iso(today()) }) : d));
  if (await save('cars', Object.assign({}, c, { danos }))) { toast('Marcado como reparado'); danosView(carId); }
}
