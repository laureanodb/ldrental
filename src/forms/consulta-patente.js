// Deuda de patente (impuesto automotor): ronda de consulta como la de multas.
// AGIP (CABA), ARBA (Provincia) y los municipios que cobran la patente de autos viejos
// no tienen una consulta que la app pueda hacer sola (piden código de seguridad), así que
// la app copia la patente, abre la página oficial y vos anotás si está al día o cuánto debe.
import { S } from '../state.js';
import { esc, val, uid, iso, today, fdate, money, parse, days } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de } from '../memo.js';
import { settings, saveSettings } from '../settings.js';
import { isSnoozed } from '../snooze.js';

export const LUGARES_BASE = [
  { id: 'caba', nombre: 'CABA (AGIP)', url: 'https://buenosaires.gob.ar/tramites/patentes-automotores-consulta-de-boletas-saldos-y-deuda', nota: 'Entrá a la consulta de Patentes, pegá el dominio sin espacios y completá el código de seguridad. Muestra solo las cuotas sin pagar.' },
  { id: 'pba', nombre: 'Provincia de Buenos Aires (ARBA)', url: 'https://www.arba.gov.ar/', nota: 'Entrá a "Automotor" → "Consulta de deuda", pegá el dominio y completá el código de validación.' },
];
export const lugares = () => LUGARES_BASE.concat(settings.patenteLugares || []);
const lugar = id => lugares().find(l => l.id === id) || null;
const diasLimite = () => +settings.patenteConsultaDias || 30;
const autos = () => S.cars.filter(c => !c.vendido).sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
const ultima = c => c.consultaPatente || null;
function estado(c) {
  const u = ultima(c);
  if (!u) return 'nunca';
  if (u.resultado === 'debe') return 'debe';
  return days(parse(u.fecha), today()) > diasLimite() ? 'vieja' : 'ok';
}
export const pendientes = () => autos().filter(c => ['nunca', 'vieja'].includes(estado(c)));
export const conDeuda = () => autos().filter(c => estado(c) === 'debe');

const chip = c => {
  const u = ultima(c), e = estado(c);
  const col = e === 'ok' ? 'var(--ok)' : e === 'debe' ? 'var(--bad)' : e === 'vieja' ? 'var(--warn)' : 'var(--muted)';
  const t = e === 'nunca' ? 'Sin consultar' : e === 'debe' ? 'Debe ' + money(u.monto) + (u.vencimiento ? ' · vence ' + fdate(u.vencimiento) : '') : 'Al día · ' + fdate(u.fecha);
  return '<span class="small" style="border:1px solid ' + col + ';color:' + col + ';border-radius:99px;padding:2px 8px">' + esc(t) + '</span>';
};

/* ---------- Pantalla principal ---------- */
export function consultaPatenteView() {
  const A = autos(), pend = pendientes(), deuda = conDeuda();
  const total = deuda.reduce((s, c) => s + (+ultima(c).monto || 0), 0);
  let h = '<h3>Deuda de patente</h3>' +
    '<div class="small muted" style="margin-bottom:10px">La app te lleva auto por auto: copia la patente, abre la página de AGIP, ARBA o el municipio, y vos anotás si está al día o cuánto debe. Elegí en cada auto dónde paga patente.</div>';
  if (!A.length) { openModal(h + '<div class="card">Todavía no hay autos cargados.</div><button class="btn sec block" onclick="closeModal()">Cerrar</button>'); return; }
  h += '<div class="grid" style="margin-bottom:10px"><div class="kpi ' + (pend.length ? 'warn' : 'ok') + '"><div class="n">' + (A.length - pend.length) + ' de ' + A.length + '</div><div class="l">Consultados (últimos ' + diasLimite() + ' días)</div></div>' +
    '<div class="kpi ' + (deuda.length ? 'bad' : '') + '"><div class="n">' + money(total) + '</div><div class="l">' + deuda.length + (deuda.length === 1 ? ' auto con deuda' : ' autos con deuda') + '</div></div></div>' +
    (pend.length ? '<button class="btn block" style="margin-bottom:10px" onclick="rondaPatente(0)">Empezar la ronda (' + pend.length + (pend.length === 1 ? ' auto' : ' autos') + ')</button>' : '<div class="card" style="color:var(--ok)">✓ Todos consultados en los últimos ' + diasLimite() + ' días.</div>');
  h += A.map(c => {
    const l = lugar(c.patenteJur);
    return '<div class="card"><div class="row between" style="gap:8px"><div style="min-width:0"><b>' + esc(c.patente || 'Sin patente') + '</b> <span class="small muted">' + esc(l ? l.nombre : 'Lugar sin elegir') + '</span></div>' +
      '<button class="btn sec sm" onclick="rondaPatente(0,\'' + c.id + '\')">Consultar</button></div><div style="margin-top:6px">' + chip(c) + '</div>' +
      (estado(c) === 'debe' ? '<div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap"><button class="btn sm" onclick="patentePagada(\'' + c.id + '\')">Ya la pagué</button><button class="btn sec sm" onclick="gastoPatente(\'' + c.id + '\')">Cargar el pago como gasto</button></div>' : '') +
      '</div>';
  }).join('');
  h += '<div class="row" style="margin-top:10px"><button class="btn sec grow" onclick="lugaresPatenteView()">Municipios y frecuencia</button><button class="btn sec" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
}

/* ---------- Ronda ---------- */
let ronda = [];
export function rondaPatente(i, carId) {
  if (i === 0) ronda = carId ? [carId] : pendientes().map(c => c.id);
  pasoPatente(i);
}
// Muestra un paso de la ronda ya armada.
export function pasoPatente(i) {
  if (i >= ronda.length) { toast('Ronda terminada'); consultaPatenteView(); return; }
  const c = de('cars', 'id', ronda[i])[0];
  if (!c) { pasoPatente(i + 1); return; }
  const L = lugares(), l = lugar(c.patenteJur);
  const u = ultima(c);
  openModal('<div class="small muted">' + (i + 1) + ' de ' + ronda.length + '</div><h3>Patente de ' + esc(c.patente || 'auto') + '</h3>' +
    '<div class="card" style="text-align:center"><div class="small muted">Dominio</div><div style="font-size:32px;font-weight:800;letter-spacing:2px">' + esc(c.patente || '') + '</div>' +
    (u ? '<div class="small muted">Última consulta: ' + fdate(u.fecha) + (u.resultado === 'debe' ? ' (debía ' + money(u.monto) + ')' : ' (al día)') + '</div>' : '') + '</div>' +
    '<label class="f"><span>¿Dónde paga patente este auto?</span><select id="rp_jur" onchange="cambiarLugarPatente(\'' + c.id + '\',' + i + ')"><option value="">Elegir</option>' +
    L.map(x => '<option value="' + esc(x.id) + '"' + (c.patenteJur === x.id ? ' selected' : '') + '>' + esc(x.nombre) + '</option>').join('') + '</select></label>' +
    (l ? (l.nota ? '<div class="small muted" style="margin:-4px 0 10px">' + esc(l.nota) + '</div>' : '') +
      '<button class="btn block" style="margin-bottom:8px" onclick="abrirConsultaPatente(\'' + c.id + '\')">Copiar patente y abrir la página</button>' +
      '<div class="small muted" style="margin-bottom:10px">Cuando veas el resultado, volvé a esta pestaña y tocá lo que corresponda:</div>' +
      '<div class="row"><button class="btn sec grow" onclick="resultadoPatente(' + i + ',\'al_dia\')">Está al día</button><button class="btn sec grow" onclick="resultadoPatente(' + i + ',\'debe\')">Tiene deuda</button></div>'
      : '<div class="small muted" style="margin-bottom:10px">Elegí arriba dónde paga patente. Si el auto paga en un municipio, agregalo en "Municipios y frecuencia".</div>') +
    '<div class="row" style="margin-top:8px"><button class="btn sec sm grow" onclick="pasoPatente(' + (i + 1) + ')">Saltar</button><button class="btn sec sm" onclick="consultaPatenteView()">Terminar</button></div>');
}
export async function cambiarLugarPatente(carId, i) {
  const c = de('cars', 'id', carId)[0]; if (!c) return;
  if (await save('cars', Object.assign({}, c, { patenteJur: val('rp_jur') }))) pasoPatente(i);
}
export async function abrirConsultaPatente(carId) {
  const c = de('cars', 'id', carId)[0], l = c && lugar(c.patenteJur); if (!l) return;
  const pat = String(c.patente || '').replace(/\s/g, '');
  try { await navigator.clipboard.writeText(pat); toast('Patente ' + pat + ' copiada: pegala en la página'); } catch (e) { toast('Escribí la patente ' + pat); }
  window.open(l.url, '_blank', 'noopener');
}
async function anotar(carId, datos) {
  const c = de('cars', 'id', carId)[0]; if (!c) return false;
  const reg = Object.assign({ fecha: iso(today()), jur: c.patenteJur || '', por: (S.user && S.user.email) || '' }, datos);
  const hist = (c.consultasPatenteHist || []).concat([reg]).slice(-24);
  return save('cars', Object.assign({}, c, { consultaPatente: reg, consultasPatenteHist: hist }));
}
export async function resultadoPatente(i, resultado) {
  const carId = ronda[i];
  if (resultado === 'al_dia') { await anotar(carId, { resultado: 'al_dia', monto: 0 }); pasoPatente(i + 1); return; }
  const c = de('cars', 'id', carId)[0];
  openModal('<h3>Deuda de patente · ' + esc(c.patente) + '</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Anotá el total que figura como deuda. Si querés, poné qué cuotas son y hasta cuándo se puede pagar sin recargo.</div>' +
    '<div class="two"><label class="f"><span>Total adeudado</span><input id="rp_monto" inputmode="decimal"></label>' +
    '<label class="f"><span>Vence <small>opcional</small></span><input id="rp_venc" type="date"></label></div>' +
    '<label class="f"><span>Cuotas o detalle <small>opcional</small></span><input id="rp_nota" placeholder="ej: cuotas 7 y 8 de 2026"></label>' +
    '<div class="row"><button class="btn grow" onclick="guardarDeudaPatente(' + i + ')">Guardar y seguir</button><button class="btn sec" onclick="pasoPatente(' + i + ')">Volver</button></div>');
}
export async function guardarDeudaPatente(i) {
  const monto = +val('rp_monto') || 0;
  if (!(monto > 0)) { toast('Poné el total adeudado'); return; }
  if (await anotar(ronda[i], { resultado: 'debe', monto, vencimiento: val('rp_venc'), nota: val('rp_nota') })) pasoPatente(i + 1);
}
export async function patentePagada(carId) {
  if (await anotar(carId, { resultado: 'al_dia', monto: 0, nota: 'Marcada como pagada' })) { toast('Anotada como pagada'); consultaPatenteView(); }
}
// Abre el gasto ya completo con lo que debía.
export function gastoPatente(carId) {
  const c = de('cars', 'id', carId)[0], u = c && ultima(c); if (!c) return;
  window.gastoForm(carId);
  const set = (id, v) => { const el = document.getElementById(id); if (el && v) { el.value = v; el.dispatchEvent(new Event('change')); } };
  set('g_cat', 'patente');
  set('g_costo', u && u.monto ? String(u.monto) : '');
  set('g_desc', 'Patente' + (u && u.nota ? ' · ' + u.nota : ''));
}

/* ---------- Municipios y frecuencia ---------- */
export function lugaresPatenteView() {
  const extra = settings.patenteLugares || [];
  openModal('<h3>Dónde se paga la patente</h3>' +
    '<div class="small muted" style="margin-bottom:10px">AGIP y ARBA ya están. En Provincia, los autos con muchos años pagan la patente en el municipio: agregalo acá con el link oficial de consulta.</div>' +
    extra.map(l => '<div class="card row between" style="gap:8px"><div style="min-width:0"><b>' + esc(l.nombre) + '</b><div class="small muted" style="overflow-wrap:anywhere">' + esc(l.url) + '</div></div><button class="btn danger sm" onclick="quitarLugarPatente(\'' + esc(l.id) + '\')">Quitar</button></div>').join('') +
    '<div class="sec-t">Agregar un municipio</div><div class="two"><label class="f"><span>Nombre</span><input id="lp_nombre" placeholder="ej: Municipio de Morón"></label><label class="f"><span>Link oficial</span><input id="lp_url" placeholder="https://…"></label></div>' +
    '<label class="f"><span>Consultar cada cuántos días</span><input id="lp_dias" inputmode="numeric" value="' + diasLimite() + '"></label>' +
    '<div class="row"><button class="btn grow" onclick="guardarLugaresPatente()">Guardar</button><button class="btn sec" onclick="consultaPatenteView()">Volver</button></div>');
}
export function guardarLugaresPatente() {
  const nombre = val('lp_nombre'), url = val('lp_url');
  const extra = (settings.patenteLugares || []).slice();
  if (nombre || url) {
    if (!nombre || !/^https?:\/\//.test(url)) { toast('Poné el nombre y un link que empiece con https://'); return; }
    extra.push({ id: 'm' + uid(), nombre, url, nota: '' });
  }
  saveSettings({ patenteLugares: extra, patenteConsultaDias: Math.max(1, Math.round(+val('lp_dias') || 30)) });
  toast('Guardado'); consultaPatenteView();
}
export function quitarLugarPatente(id) {
  saveSettings({ patenteLugares: (settings.patenteLugares || []).filter(l => l.id !== id) });
  lugaresPatenteView();
}

/* ---------- En la ficha del auto y avisos ---------- */
export function seccionPatenteAuto(c) {
  const l = lugar(c.patenteJur);
  return '<div class="small muted" style="margin:-4px 0 10px">Patente (impuesto): ' + chip(c) + (l ? ' · ' + esc(l.nombre) : '') +
    ' · <a class="tap" style="text-decoration:underline" onclick="rondaPatente(0,\'' + c.id + '\')">consultar ahora</a></div>';
}
export function alertasPatente() {
  const out = [];
  conDeuda().forEach(c => {
    const u = ultima(c);
    const key = 'patente:' + c.id + ':' + u.fecha;
    if (isSnoozed(key)) return;
    const d = u.vencimiento ? days(today(), parse(u.vencimiento)) : 10;
    out.push({ who: c.patente || 'Auto', sub: 'Deuda de patente', kind: 'car', id: c.id, key, d, cls: d < 0 ? 'bad' : d <= 7 ? 'warn' : 'soft', t: 'Debe ' + money(u.monto) + (u.vencimiento ? (d < 0 ? ' · venció el ' : ' · vence el ') + fdate(u.vencimiento) : ''), accion: 'consultaPatenteView()' });
  });
  const p = pendientes();
  if (p.length) {
    const key = 'sistema:consultapatente:' + iso(today()).slice(0, 7);
    if (!isSnoozed(key)) out.push({ who: 'Consultar deuda de patente', sub: 'AGIP, ARBA o municipio', kind: 'sistema', id: '', key, d: 6, cls: 'soft', t: p.length + (p.length === 1 ? ' auto sin consultar' : ' autos sin consultar') + ' hace más de ' + diasLimite() + ' días', accion: 'consultaPatenteView()' });
  }
  return out;
}
