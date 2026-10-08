// Control del dueño: aprobación de gastos grandes, bitácora de decisiones y metas de la flota.
import { S } from '../state.js';
import { esc, val, uid, iso, today, fdate, money, num1 } from '../utils.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { de } from '../memo.js';
import { settings, saveSettings } from '../settings.js';
import { render } from '../nav.js';
import { isAdmin } from '../roles.js';
import { badge, activeCars, isContract, calc, cobradoDelMes } from '../calc.js';
import { isSnoozed } from '../snooze.js';

/* ---------- Aprobación de gastos grandes ---------- */
const pendientes = () => ['gastos', 'mantenimientos'].flatMap(col => ((S.pendientes && S.pendientes[col]) || []).map(o => ({ col, o })))
  .sort((a, b) => (b.o.solicitadoFecha || b.o.fecha || '').localeCompare(a.o.solicitadoFecha || a.o.fecha || ''));
export const cantidadPendientes = () => pendientes().length;
const descripcion = ({ col, o }) => {
  const c = o.carId ? de('cars', 'id', o.carId)[0] : null;
  return (col === 'mantenimientos' ? (o.label || o.item || 'Mantenimiento') : (o.descripcion || o.categoria || 'Gasto')) + (c ? ' · ' + c.patente : col === 'gastos' ? ' · gasto general' : '');
};
export function aprobacionesView() {
  const L = pendientes();
  const admin = isAdmin();
  let h = '<h3>Gastos para aprobar</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Los gastos y mantenimientos de ' + (+settings.aprobacionUmbral ? money(settings.aprobacionUmbral) + ' o más' : 'cualquier monto (no hay monto configurado)') + ' que carga alguien que no es administrador quedan acá, sin contar en los números, hasta que se aprueban.</div>';
  if (admin) h += '<div class="row" style="margin-bottom:12px"><label class="f grow" style="margin:0"><span>Monto a partir del cual se aprueba <small>0 = no pedir aprobación</small></span><input id="ap_umbral" inputmode="decimal" value="' + esc(settings.aprobacionUmbral || '') + '"></label><button class="btn sec" style="align-self:flex-end" onclick="guardarUmbralAprobacion()">Guardar</button></div>';
  h += L.length ? L.map(x => '<div class="card"><div class="row between"><div style="min-width:0"><b>' + money(x.o.costo) + '</b> ' + esc(descripcion(x)) + '<div class="small muted">' + fdate(x.o.fecha) + ' · lo cargó ' + esc(x.o.solicitadoPor || 'alguien del equipo') + (x.o.proveedor ? ' · ' + esc(x.o.proveedor) : '') + '</div></div>' + badge('warn', 'Pendiente') + '</div>' +
    (admin ? '<div class="row" style="margin-top:8px"><button class="btn sm grow" onclick="aprobarPendiente(\'' + x.col + '\',\'' + x.o.id + '\')">Aprobar</button><button class="btn danger sm" onclick="confirmDel(this,()=>rechazarPendiente(\'' + x.col + '\',\'' + x.o.id + '\'))">Rechazar y borrar</button></div>' : '') + '</div>').join('')
    : '<div class="card empty">No hay nada pendiente de aprobación.</div>';
  h += '<button class="btn sec block" style="margin-top:10px" onclick="closeModal()">Cerrar</button>';
  openModal(h);
}
export function guardarUmbralAprobacion() { saveSettings({ aprobacionUmbral: +val('ap_umbral') || 0 }); toast('Monto guardado'); aprobacionesView(); }
const buscarPend = (col, id) => ((S.pendientes && S.pendientes[col]) || []).find(x => x.id === id);
export async function aprobarPendiente(col, id) {
  const o = buscarPend(col, id); if (!o) return;
  const ok = await save(col, Object.assign({}, o, { pendienteAprobacion: false, aprobado: true, aprobadoPor: (S.user && S.user.email) || '', aprobadoFecha: iso(today()) }));
  if (ok) { toast('Aprobado'); aprobacionesView(); }
}
export async function rechazarPendiente(col, id) {
  if (await remove(col, id)) { toast('Rechazado y borrado'); aprobacionesView(); }
}

/* ---------- Bitácora de decisiones ---------- */
const TEMAS = [['precios', 'Precios'], ['autos', 'Autos (comprar / vender)'], ['choferes', 'Choferes'], ['gastos', 'Gastos y proveedores'], ['reglas', 'Reglas de la empresa'], ['otro', 'Otro']];
const temaLabel = k => (TEMAS.find(x => x[0] === k) || [0, 'Otro'])[1];
const decisiones = () => (settings.bitacoraDecisiones || []).slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
export function bitacoraView() {
  const L = decisiones();
  const hoy = iso(today());
  let h = '<h3>Bitácora de decisiones</h3><div class="small muted" style="margin-bottom:10px">Anotá qué decidiste y por qué. Si le ponés fecha para revisarla, ese día te aparece el aviso para anotar cómo salió.</div>';
  h += L.length ? L.map(x => '<div class="card tap" onclick="decisionForm(\'' + x.id + '\')"><div class="row between"><b>' + esc(x.titulo) + '</b><span class="small muted">' + fdate(x.fecha) + '</span></div>' +
    '<div class="small muted">' + esc(temaLabel(x.tema)) + (x.porque ? ' · ' + esc(x.porque.slice(0, 90)) + (x.porque.length > 90 ? '…' : '') : '') + '</div>' +
    (x.resultado ? '<div class="small" style="margin-top:4px">Cómo salió: ' + badge(x.resultado === 'bien' ? 'ok' : x.resultado === 'mal' ? 'bad' : 'warn', x.resultado === 'bien' ? 'Bien' : x.resultado === 'mal' ? 'Mal' : 'Más o menos') + (x.aprendizaje ? ' ' + esc(x.aprendizaje) : '') + '</div>' :
      x.revisarEl ? '<div class="small" style="margin-top:4px">' + badge(x.revisarEl <= hoy ? 'warn' : 'info', x.revisarEl <= hoy ? 'Para revisar' : 'Revisar el ' + fdate(x.revisarEl)) + '</div>' : '') + '</div>').join('')
    : '<div class="card empty">Todavía no anotaste decisiones.</div>';
  h += '<div class="row" style="margin-top:10px"><button class="btn grow" onclick="decisionForm()">+ Nueva decisión</button><button class="btn sec" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
}
export function decisionForm(id) {
  const x = id ? (settings.bitacoraDecisiones || []).find(d => d.id === id) : null;
  const revisada = x && x.revisarEl && x.revisarEl <= iso(today());
  openModal('<h3>' + (x ? 'Decisión' : 'Nueva decisión') + '</h3>' +
    '<label class="f"><span>Qué decidiste</span><input id="bd_titulo" placeholder="ej: subir 15% el alquiler de los Cronos" value="' + esc(x ? x.titulo : '') + '"></label>' +
    '<label class="f"><span>Por qué</span><textarea id="bd_porque" placeholder="Qué datos o situación te llevaron a decidirlo">' + esc(x ? x.porque : '') + '</textarea></label>' +
    '<div class="two"><label class="f"><span>Tema</span><select id="bd_tema">' + TEMAS.map(([k, l]) => '<option value="' + k + '"' + (x && x.tema === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    '<label class="f"><span>Fecha</span><input id="bd_fecha" type="date" value="' + esc(x ? x.fecha : iso(today())) + '"></label></div>' +
    '<label class="f"><span>Revisar el <small>opcional</small></span><input id="bd_revisar" type="date" value="' + esc(x ? x.revisarEl || '' : '') + '"></label>' +
    (x ? '<div class="sec-t">Cómo salió' + (revisada && !x.resultado ? ' <span class="badge b-warn">Para revisar</span>' : '') + '</div>' +
      '<label class="f"><span>Resultado</span><select id="bd_resultado"><option value="">Todavía no sé</option>' + [['bien', 'Bien'], ['regular', 'Más o menos'], ['mal', 'Mal']].map(([k, l]) => '<option value="' + k + '"' + (x.resultado === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
      '<label class="f"><span>Qué aprendiste</span><textarea id="bd_aprendizaje">' + esc(x.aprendizaje || '') + '</textarea></label>' : '') +
    '<div class="row"><button class="btn grow" onclick="guardarDecision(' + (x ? "'" + x.id + "'" : 'null') + ')">Guardar</button><button class="btn sec" onclick="bitacoraView()">Volver</button></div>' +
    (x ? '<button class="btn danger block" style="margin-top:10px" onclick="confirmDel(this,()=>borrarDecision(\'' + x.id + '\'))">Borrar</button>' : ''));
}
export function guardarDecision(id) {
  const titulo = val('bd_titulo');
  if (!titulo) { toast('Escribí qué decidiste'); return; }
  const ex = id ? (settings.bitacoraDecisiones || []).find(d => d.id === id) : null;
  const o = Object.assign({}, ex || { id: uid(), autor: (S.user && S.user.email) || '' }, {
    titulo, porque: val('bd_porque'), tema: val('bd_tema'), fecha: val('bd_fecha') || iso(today()), revisarEl: val('bd_revisar'),
  });
  if (ex) { o.resultado = val('bd_resultado'); o.aprendizaje = val('bd_aprendizaje'); }
  const L = settings.bitacoraDecisiones || [];
  saveSettings({ bitacoraDecisiones: ex ? L.map(d => (d.id === id ? o : d)) : [o].concat(L) });
  toast('Guardado'); bitacoraView(); render();
}
export function borrarDecision(id) { saveSettings({ bitacoraDecisiones: (settings.bitacoraDecisiones || []).filter(d => d.id !== id) }); toast('Borrada'); bitacoraView(); render(); }

/* ---------- Metas de la flota ---------- */
export const METAS = [
  { tipo: 'alDia', label: 'Choferes al día', unidad: '%', sentido: 'min', ayuda: 'Porcentaje de autos con chofer que no deben nada' },
  { tipo: 'ocupacion', label: 'Autos trabajando', unidad: '%', sentido: 'min', ayuda: 'Porcentaje de la flota alquilada o financiada' },
  { tipo: 'parados', label: 'Autos parados', unidad: 'autos', sentido: 'max', ayuda: 'Disponibles o en taller, como máximo' },
  { tipo: 'cobradoMes', label: 'Cobrado en el mes', unidad: '$', sentido: 'min', ayuda: 'Cobros en pesos del mes en curso' },
  { tipo: 'deuda', label: 'Deuda de choferes', unidad: '$', sentido: 'max', ayuda: 'Deuda total de alquileres, como máximo' },
  { tipo: 'gastosMes', label: 'Gastos del mes', unidad: '$', sentido: 'max', ayuda: 'Gastos y mantenimientos del mes, como máximo' },
];
export function valorMeta(tipo) {
  const flota = activeCars();
  const conChofer = flota.filter(c => isContract(c) && c.choferId);
  if (tipo === 'alDia') return conChofer.length ? Math.round(conChofer.filter(c => calc(c).debt <= 0).length / conChofer.length * 100) : 100;
  if (tipo === 'ocupacion') return flota.length ? Math.round(flota.filter(c => isContract(c)).length / flota.length * 100) : 0;
  if (tipo === 'parados') return flota.filter(c => c.tipo === 'disponible' || c.tipo === 'taller').length;
  if (tipo === 'cobradoMes') return cobradoDelMes(0);
  if (tipo === 'deuda') return conChofer.filter(c => c.tipo !== 'financiado').reduce((a, c) => a + calc(c).debt, 0);
  if (tipo === 'gastosMes') { const m = iso(today()).slice(0, 7); return S.gastos.filter(g => (g.fecha || '').slice(0, 7) === m).reduce((a, g) => a + (+g.costo || 0), 0) + S.mantenimientos.filter(x => (x.fecha || '').slice(0, 7) === m).reduce((a, x) => a + (+x.costo || 0), 0); }
  return 0;
}
const fmt = (m, v) => (m.unidad === '$' ? money(v) : m.unidad === '%' ? Math.round(v) + '%' : num1(v) + ' ' + m.unidad);
export function estadoMeta(meta) {
  const m = METAS.find(x => x.tipo === meta.tipo); if (!m) return null;
  const v = valorMeta(meta.tipo), obj = +meta.objetivo || 0;
  let pct, ok;
  if (m.sentido === 'min') { pct = obj ? Math.min(100, v / obj * 100) : 100; ok = v >= obj; }
  else { pct = v <= obj ? 100 : Math.max(0, 100 - (v - obj) / Math.max(obj, 1) * 100); ok = v <= obj; }
  return { m, v, obj, pct: Math.round(pct), ok, texto: fmt(m, v) + ' de ' + (m.sentido === 'max' ? 'máx. ' : '') + fmt(m, obj) };
}
export function tarjetaMetas() {
  const L = (settings.metasFlota || []).map(estadoMeta).filter(Boolean);
  if (!L.length) return '';
  const cumplidas = L.filter(x => x.ok).length;
  return '<div class="card" style="margin-bottom:12px"><div class="row between" style="margin-bottom:6px"><b>Metas de la flota</b><span class="small muted">' + cumplidas + ' de ' + L.length + ' cumplidas · <a class="tap" style="text-decoration:underline" onclick="metasForm()">editar</a></span></div>' +
    L.map(x => '<div style="margin:8px 0"><div class="row between small"><span>' + esc(x.m.label) + '</span><span class="' + (x.ok ? '' : 'muted') + '">' + esc(x.texto) + '</span></div>' +
      '<div style="height:8px;border-radius:4px;background:var(--soft);margin-top:4px"><div style="height:8px;border-radius:4px;width:' + Math.max(3, x.pct) + '%;background:' + (x.ok ? 'var(--ok)' : x.pct >= 70 ? 'var(--warn)' : 'var(--bad)') + '"></div></div></div>').join('') + '</div>';
}
export function metasForm() {
  const actual = settings.metasFlota || [];
  openModal('<h3>Metas de la flota</h3><div class="small muted" style="margin-bottom:10px">Elegí las que querés seguir. Aparecen en el Panel con una barra de avance. Dejá vacío lo que no te interesa.</div>' +
    METAS.map(m => {
      const v = (actual.find(x => x.tipo === m.tipo) || {}).objetivo;
      return '<label class="f"><span>' + m.label + (m.sentido === 'max' ? ' (máximo)' : ' (mínimo)') + ' <small>' + esc(m.ayuda) + ' · hoy: ' + fmt(m, valorMeta(m.tipo)) + '</small></span><input id="mt_' + m.tipo + '" inputmode="decimal" placeholder="' + (m.unidad === '$' ? 'Monto' : m.unidad === '%' ? 'Porcentaje' : 'Cantidad') + '" value="' + esc(v != null ? v : '') + '"></label>';
    }).join('') +
    '<div class="row"><button class="btn grow" onclick="guardarMetas()">Guardar</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>');
}
export function guardarMetas() {
  const metas = METAS.map(m => ({ tipo: m.tipo, raw: val('mt_' + m.tipo) })).filter(x => x.raw !== '').map(x => ({ tipo: x.tipo, objetivo: +String(x.raw).replace(/\./g, '').replace(',', '.') || 0 }));
  saveSettings({ metasFlota: metas }); closeModal(); toast(metas.length ? 'Metas guardadas' : 'Sin metas'); render();
}

/* ---------- Avisos ---------- */
export function alertasControl() {
  const out = [];
  if (isAdmin()) {
    const n = cantidadPendientes();
    if (n && !isSnoozed('sistema:aprobaciones')) out.push({ who: 'Gastos para aprobar', sub: 'Aprobación', kind: 'sistema', accion: 'aprobacionesView()', id: '', key: 'sistema:aprobaciones', d: 0, cls: 'warn', t: n + ' pendiente' + (n === 1 ? '' : 's') });
  }
  const hoy = iso(today());
  (settings.bitacoraDecisiones || []).filter(x => x.revisarEl && x.revisarEl <= hoy && !x.resultado).forEach(x => {
    const key = 'decision:' + x.id; if (isSnoozed(key)) return;
    out.push({ who: x.titulo, sub: 'Revisar decisión', kind: 'sistema', accion: "decisionForm('" + x.id + "')", id: '', key, d: 5, cls: 'soft', t: 'Decidido el ' + fdate(x.fecha) + ': anotá cómo salió' });
  });
  return out;
}
