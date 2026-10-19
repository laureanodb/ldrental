// Consulta de multas en CABA, Provincia de Buenos Aires, rutas nacionales y los
// municipios que elijas. Los portales oficiales piden verificación de seguridad
// (captcha) o usuario y no tienen una API pública, así que la app arma la "ronda":
// auto por auto y lugar por lugar, copia la patente, abre la página oficial, anota
// el resultado y carga las multas que encuentres (a mano o leyendo una captura con IA).
import { S } from '../state.js';
import { esc, val, uid, iso, today, fdate, money, parse, days } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de } from '../memo.js';
import { settings, saveSettings } from '../settings.js';
import { choferEnFecha } from '../calc.js';
import { leerDocumento } from '../ia.js';
import { subirArchivoSuelto } from '../files.js';
import { isSnoozed } from '../snooze.js';

// Lugares conocidos. Los que no tienen link lo carga el usuario una vez (el link oficial del municipio).
export const CATALOGO = [
  { id: 'caba', nombre: 'Ciudad de Buenos Aires (CABA)', url: 'https://buenosaires.gob.ar/licenciasdeconducir/consulta-de-infracciones/?actas=transito', nota: 'Elegí "Dominio" y pegá la patente sin espacios. Pide una verificación de seguridad.', activa: true },
  { id: 'pba', nombre: 'Provincia de Buenos Aires (InfraccionesBA)', url: 'https://infraccionesba.gba.gob.ar/', nota: 'Fotomultas, rutas provinciales y los municipios que usan el sistema provincial. Consultá por dominio.', activa: true },
  { id: 'nacion', nombre: 'Rutas nacionales (Seguridad Vial)', url: 'https://consultainfracciones.seguridadvial.gob.ar/', nota: 'Infracciones en rutas nacionales y de otras provincias adheridas.', activa: false },
  { id: 'lomas', nombre: 'Lomas de Zamora', url: 'https://webextra.lomasdezamora.gov.ar/infracciones', nota: '', activa: false },
  { id: 'tresdefebrero', nombre: 'Tres de Febrero', url: 'https://mistramites.tresdefebrero.gob.ar/multas', nota: '', activa: false },
  { id: 'vicentelopez', nombre: 'Vicente López', url: 'https://www.vicentelopez.gov.ar/infracciones-de-transito', nota: 'Las fotomultas y radares las juzga la Provincia: revisalas en InfraccionesBA.', activa: false },
  { id: 'lamatanza', nombre: 'La Matanza', url: 'https://www.lamatanza.gov.ar/', nota: 'Las actas nuevas están en InfraccionesBA; en el municipio quedan las viejas y algunos casos especiales.', activa: false },
  { id: 'escobar', nombre: 'Escobar', url: 'https://infracciones.escobar.gob.ar/', nota: '', activa: false },
  { id: 'mardelplata', nombre: 'General Pueyrredón (Mar del Plata)', url: 'https://www.mardelplata.gob.ar/justiciadefaltas/consultacontravenciones', nota: '', activa: false },
].concat(['Almirante Brown', 'Avellaneda', 'Berazategui', 'Esteban Echeverría', 'Ezeiza', 'Florencio Varela', 'General San Martín', 'Hurlingham', 'Ituzaingó', 'José C. Paz', 'La Plata', 'Lanús', 'Malvinas Argentinas', 'Merlo', 'Moreno', 'Morón', 'Pilar', 'Quilmes', 'San Fernando', 'San Isidro', 'San Miguel', 'Tigre']
  .map(n => ({ id: n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, ''), nombre: n, url: '', nota: '', activa: false })));

export function jurisdicciones() {
  const guard = settings.multasJurisdicciones || [];
  const porId = Object.fromEntries(guard.map(j => [j.id, j]));
  const base = CATALOGO.map(j => Object.assign({}, j, porId[j.id] || {}));
  return base.concat(guard.filter(j => !CATALOGO.some(c => c.id === j.id)));
}
export const activas = () => jurisdicciones().filter(j => j.activa && j.url);
const diasLimite = () => +settings.multasConsultaDias || 15;
const autos = () => S.cars.filter(c => !c.vendido).sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
const ultima = (c, jid) => (c.consultasMultas || {})[jid] || null;
function estado(c, jid) {
  const u = ultima(c, jid);
  if (!u) return 'nunca';
  return days(parse(u.fecha), today()) > diasLimite() ? 'vieja' : 'ok';
}
// Pares auto × lugar que hay que consultar (nunca o hace más de los días elegidos).
export function pendientes() {
  const out = [];
  autos().forEach(c => activas().forEach(j => { if (estado(c, j.id) !== 'ok') out.push({ c, j }); }));
  return out;
}

/* ---------- Pantalla principal ---------- */
export function consultaMultasView() {
  const J = activas(), A = autos();
  const total = J.length * A.length, pend = pendientes().length;
  const col = e => (e === 'ok' ? 'var(--ok)' : e === 'vieja' ? 'var(--warn)' : 'var(--bad)');
  let h = '<h3>Consultar multas</h3>' +
    '<div class="small muted" style="margin-bottom:10px">La app te lleva auto por auto: copia la patente, abre la página oficial y vos anotás qué encontraste. Si hay multas, sacale una captura y la IA las carga solas.</div>';
  if (!J.length) h += '<div class="card">Elegí dónde consultar para empezar.</div>';
  else {
    h += '<div class="grid" style="margin-bottom:10px"><div class="kpi ' + (pend ? 'warn' : 'ok') + '"><div class="n">' + (total - pend) + ' de ' + total + '</div><div class="l">Consultas al día (últimos ' + diasLimite() + ' días)</div></div>' +
      '<div class="kpi"><div class="n">' + J.length + '</div><div class="l">Lugares donde consultás</div></div></div>' +
      (pend ? '<button class="btn block" style="margin-bottom:10px" onclick="rondaMultas(0)">Empezar la ronda (' + pend + ' consultas)</button>' : '<div class="card" style="color:var(--ok)">✓ Todo consultado en los últimos ' + diasLimite() + ' días.</div>');
    h += A.map(c => '<div class="card"><div class="row between"><b>' + esc(c.patente) + '</b><button class="btn sec sm" onclick="rondaMultas(0,\'' + c.id + '\')">Consultar este auto</button></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">' + J.map(j => {
        const u = ultima(c, j.id), e = estado(c, j.id);
        return '<span class="small" style="border:1px solid ' + col(e) + ';border-radius:99px;padding:2px 8px">' + esc(corto(j)) + ': ' + (u ? fdate(u.fecha).slice(0, 5) + (u.resultado === 'con' ? ' · ' + (u.n || '') + ' multa' + (u.n === 1 ? '' : 's') : ' ✓') : 'nunca') + '</span>';
      }).join('') + '</div></div>').join('');
  }
  h += '<div class="row" style="margin-top:10px"><button class="btn sec grow" onclick="lugaresMultasView()">Elegir dónde consultar</button><button class="btn sec" onclick="closeModal()">Cerrar</button></div>' +
    '<div class="small muted" style="margin-top:10px">¿Querés que sea automático? Los portales oficiales no lo permiten. Hay servicios pagos que consultan por vos (por ejemplo Multas.ar, Patente.ar o Multabot, que ofrecen acceso para sistemas). Si contratás uno, pasame los datos de acceso que te den y lo conecto.</div>';
  openModal(h);
}
const corto = j => j.nombre.replace(/ \(.*\)$/, '').replace('Ciudad de Buenos Aires', 'CABA').replace('Provincia de Buenos Aires', 'Provincia');

/* ---------- Ronda de consulta ---------- */
let ronda = [];
export function rondaMultas(i, carId) {
  if (i === 0) ronda = carId ? activas().map(j => ({ c: de('cars', 'id', carId)[0], j })) : pendientes();
  if (i >= ronda.length) { toast('Ronda terminada'); consultaMultasView(); return; }
  const { c, j } = ronda[i];
  const u = ultima(c, j.id);
  openModal('<div class="small muted">' + (i + 1) + ' de ' + ronda.length + '</div><h3>' + esc(j.nombre) + '</h3>' +
    '<div class="card" style="text-align:center"><div class="small muted">Patente</div><div style="font-size:32px;font-weight:800;letter-spacing:2px">' + esc(c.patente) + '</div>' +
    (u ? '<div class="small muted">Última consulta acá: ' + fdate(u.fecha) + (u.resultado === 'con' ? ' (tenía multas)' : ' (sin multas)') + '</div>' : '') + '</div>' +
    (j.nota ? '<div class="small muted" style="margin-bottom:10px">' + esc(j.nota) + '</div>' : '') +
    '<button class="btn block" style="margin-bottom:8px" onclick="abrirConsultaMulta(\'' + esc(c.patente) + '\',\'' + esc(j.url) + '\')">Copiar patente y abrir la página</button>' +
    '<div class="small muted" style="margin-bottom:10px">Cuando veas el resultado, volvé a esta pestaña y tocá lo que corresponda:</div>' +
    '<div class="row"><button class="btn sec grow" onclick="resultadoConsultaMulta(' + i + ',\'sin\')">No tiene multas</button><button class="btn sec grow" onclick="resultadoConsultaMulta(' + i + ',\'con\')">Tiene multas</button></div>' +
    '<div class="row" style="margin-top:8px"><button class="btn sec sm grow" onclick="rondaMultas(' + (i + 1) + ')">Saltar</button><button class="btn sec sm" onclick="consultaMultasView()">Terminar</button></div>');
}
export async function abrirConsultaMulta(patente, url) {
  try { await navigator.clipboard.writeText(patente); toast('Patente ' + patente + ' copiada: pegala en la página'); } catch (e) { toast('Escribí la patente ' + patente); }
  window.open(url, '_blank', 'noopener');
}
async function anotar(c, jid, resultado, n) {
  const fresco = de('cars', 'id', c.id)[0] || c;
  const reg = { fecha: iso(today()), resultado, n: n || 0, por: (S.user && S.user.email) || '' };
  await save('cars', Object.assign({}, fresco, { consultasMultas: Object.assign({}, fresco.consultasMultas || {}, { [jid]: reg }) }));
}
export async function resultadoConsultaMulta(i, resultado) {
  const { c, j } = ronda[i];
  if (resultado === 'sin') { await anotar(c, j.id, 'sin', 0); rondaMultas(i + 1); return; }
  openModal('<h3>Multas en ' + esc(corto(j)) + ' · ' + esc(c.patente) + '</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Sacale una captura de pantalla (o una foto) a la lista de multas que muestra la página y subila: la IA las lee y te las muestra para cargar. También podés cargarlas a mano.</div>' +
    '<label class="btn block filebtn" style="margin-bottom:8px">Subir captura o PDF<input id="cm_file" type="file" accept="image/*,application/pdf" onchange="leerCapturaMultas(' + i + ')"></label>' +
    '<div id="cm_ia" class="small muted" style="margin-bottom:8px"></div>' +
    '<button class="btn sec block" style="margin-bottom:8px" onclick="cargarMultaManual(' + i + ')">Cargar una a mano</button>' +
    '<div class="row"><button class="btn sec grow" onclick="terminarConMultas(' + i + ')">Listo, seguir con la ronda</button></div>');
}
export async function cargarMultaManual(i) {
  const { c, j } = ronda[i];
  window.multaForm(c.id);
  const org = document.getElementById('mu_organismo'); if (org) org.value = corto(j);
  // Al guardar vuelve a la ficha del auto; la consulta queda anotada.
  await anotar(c, j.id, 'con', 1);
}
export async function terminarConMultas(i) {
  const { c, j } = ronda[i];
  const n = S.multas.filter(m => m.carId === c.id && m.consultaJur === j.id && m.consultaFecha === iso(today())).length;
  await anotar(c, j.id, 'con', n || 1);
  rondaMultas(i + 1);
}
let leidas = [];
export async function leerCapturaMultas(i) {
  const { c, j } = ronda[i];
  const inp = document.getElementById('cm_file'); const f = inp && inp.files && inp.files[0]; if (!f) return;
  const st = document.getElementById('cm_ia');
  st.style.color = 'var(--muted)'; st.textContent = 'Subiendo…';
  const up = await subirArchivoSuelto(f);
  if (!up) { st.textContent = 'No se pudo subir el archivo'; return; }
  st.textContent = 'Leyendo las multas con IA…';
  const r = await leerDocumento('multas', { path: up.id });
  if (!document.getElementById('cm_ia')) return;
  if (!r.ok) { st.style.color = 'var(--warn)'; st.textContent = 'No se pudo leer con IA: ' + r.error + '. Cargalas a mano.'; return; }
  const ya = new Set(S.multas.map(m => String(m.numeroActa || '').replace(/\W/g, '')).filter(Boolean));
  leidas = (r.datos.multas || []).map(m => Object.assign({}, m, { repetida: m.acta && ya.has(String(m.acta).replace(/\W/g, '')) }));
  if (r.datos.patente && r.datos.patente !== String(c.patente).toUpperCase().replace(/\W/g, '')) leidas.forEach(m => { m.otraPatente = r.datos.patente; });
  if (!leidas.length) { st.textContent = 'La IA no encontró multas en la captura' + (r.datos.observaciones ? ': ' + r.datos.observaciones : '.'); return; }
  st.style.color = ''; st.innerHTML = (leidas[0].otraPatente ? '<div style="color:var(--bad)">⚠ La captura es de la patente ' + esc(leidas[0].otraPatente) + ', no de ' + esc(c.patente) + '.</div>' : '') +
    leidas.map((m, k) => '<label class="chk"><input type="checkbox" class="cm_sel" value="' + k + '"' + (m.repetida ? '' : ' checked') + '><span>' + money(m.monto) + ' · ' + fdate(m.fecha) + (m.acta ? ' · acta ' + esc(m.acta) : '') + (m.descripcion ? ' · ' + esc(m.descripcion) : '') + (m.repetida ? ' <b>(ya cargada)</b>' : '') + '</span></label>').join('') +
    '<button class="btn block" style="margin-top:8px" onclick="guardarMultasLeidas(' + i + ',\'' + esc(up.id) + '\')">Cargar las marcadas</button>';
}
export async function guardarMultasLeidas(i, archivo) {
  const { c, j } = ronda[i];
  const sel = [...document.querySelectorAll('.cm_sel:checked')].map(x => leidas[+x.value]);
  if (!sel.length) { toast('Marcá al menos una'); return; }
  let n = 0;
  for (const m of sel) {
    const fecha = m.fecha || iso(today());
    const venc = m.vencimiento || (() => { const d = parse(fecha); d.setDate(d.getDate() + (+settings.multaPlazoDias || 30)); return iso(d); })();
    const o = { id: uid(), carId: c.id, numeroActa: m.acta || '', fecha, tipoInfraccion: m.tipo || 'otro', organismo: m.organismo || corto(j), monto: +m.monto || 0,
      fechaLimitePago: venc, estado: m.estado === 'pagada' ? 'pagada' : venc < iso(today()) ? 'vencida' : 'pendiente', choferId: choferEnFecha(c, fecha) || '', puntos: 0, notas: (m.descripcion || '') + (m.lugar ? ' · ' + m.lugar : ''),
      consultaJur: j.id, consultaFecha: iso(today()), files: archivo ? [{ id: archivo, name: 'consulta-' + j.id + '-' + iso(today()) + '.jpg', cat: 'comprobante', fecha: iso(today()) }] : [] };
    if (await save('multas', o)) n++;
  }
  await anotar(c, j.id, 'con', n);
  toast(n + (n === 1 ? ' multa cargada' : ' multas cargadas') + (sel.some(m => m.fecha) ? (n === 1 ? ', asignada' : ', asignadas') + ' al chofer que tenía el auto ese día' : ''));
  rondaMultas(i + 1);
}

/* ---------- Elegir dónde consultar ---------- */
export function lugaresMultasView() {
  const J = jurisdicciones();
  openModal('<h3>Dónde consultar</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Marcá los lugares donde andan tus autos. A los municipios sin link, pegales el link oficial de consulta de infracciones (lo buscás una vez en la página del municipio).</div>' +
    J.map(j => '<div class="card"><label class="chk" style="margin:0"><input type="checkbox" class="lj_act" data-id="' + esc(j.id) + '"' + (j.activa ? ' checked' : '') + '><span><b>' + esc(j.nombre) + '</b></span></label>' +
      '<input class="lj_url" data-id="' + esc(j.id) + '" placeholder="Link oficial de consulta" value="' + esc(j.url || '') + '" style="margin-top:6px">' + (j.nota ? '<div class="small muted" style="margin-top:4px">' + esc(j.nota) + '</div>' : '') + '</div>').join('') +
    '<div class="sec-t">Otro lugar</div><div class="two"><label class="f"><span>Nombre</span><input id="lj_nombre" placeholder="ej: Luján"></label><label class="f"><span>Link</span><input id="lj_link" placeholder="https://…"></label></div>' +
    '<label class="f"><span>Consultar cada cuántos días</span><input id="lj_dias" inputmode="numeric" value="' + diasLimite() + '"></label>' +
    '<div class="row"><button class="btn grow" onclick="guardarLugaresMultas()">Guardar</button><button class="btn sec" onclick="consultaMultasView()">Volver</button></div>');
}
export function guardarLugaresMultas() {
  const J = jurisdicciones().map(j => {
    const act = document.querySelector('.lj_act[data-id="' + j.id + '"]'), url = document.querySelector('.lj_url[data-id="' + j.id + '"]');
    return Object.assign({}, j, { activa: act ? act.checked : j.activa, url: url ? url.value.trim() : j.url });
  });
  const sinLink = J.filter(j => j.activa && !/^https?:\/\//.test(j.url || ''));
  if (sinLink.length) { toast('Falta el link de: ' + sinLink.map(j => j.nombre).join(', ')); return; }
  const nombre = val('lj_nombre'), link = val('lj_link');
  if (nombre && /^https?:\/\//.test(link)) J.push({ id: 'x' + uid(), nombre, url: link, nota: '', activa: true });
  saveSettings({ multasJurisdicciones: J.map(j => ({ id: j.id, nombre: j.nombre, url: j.url, nota: j.nota || '', activa: !!j.activa })), multasConsultaDias: Math.max(1, Math.round(+val('lj_dias') || 15)) });
  toast('Guardado'); consultaMultasView();
}

/* ---------- En la ficha del auto y avisos ---------- */
export function seccionConsultaAuto(c) {
  const J = activas(); if (!J.length) return '';
  return '<div class="small muted" style="margin:-2px 0 8px">Consultas: ' + J.map(j => { const u = ultima(c, j.id); return esc(corto(j)) + ' ' + (u ? fdate(u.fecha).slice(0, 5) : 'nunca'); }).join(' · ') +
    ' · <a class="tap" style="text-decoration:underline" onclick="rondaMultas(0,\'' + c.id + '\')">consultar ahora</a></div>';
}
export function alertaConsultaMultas() {
  const p = pendientes(); if (!p.length) return [];
  const nAutos = new Set(p.map(x => x.c.id)).size;
  const key = 'sistema:consultamultas:' + iso(today()).slice(0, 7) + ':' + Math.floor(today().getDate() / 8);
  if (isSnoozed(key)) return [];
  return [{ who: 'Consultar multas', sub: 'CABA, Provincia y municipios', kind: 'sistema', id: '', key, d: 5, cls: 'soft', t: nAutos + (nAutos === 1 ? ' auto' : ' autos') + ' sin consultar hace más de ' + diasLimite() + ' días', accion: 'consultaMultasView()' }];
}
