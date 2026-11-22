import { S, sb } from './state.js';
import { toast } from './modal.js';
import { render } from './nav.js';
import { normCar } from './constants.js';
import { queueOp, getQueue, setQueue, cacheCollection, readCachedCollection, programarCache, isNetworkError } from './offline.js';
import { modoConsultaActivo } from './consulta.js';
import { tocarDatos } from './memo.js';
import { isAdmin } from './roles.js';
import { settings } from './settings.js';
import { alPapelera } from './forms/papelera.js';
import { camposCambiados, combinar, preguntarConflicto } from './conflictos.js';
import { money } from './utils.js';

/* Gastos y mantenimientos que superan el monto de aprobación, cargados por alguien que no es
   administrador, quedan en S.pendientes hasta que se aprueban: no cuentan en ningún número. */
const CON_APROBACION = ['gastos', 'mantenimientos'];
const esPendiente = o => Boolean(o && o.pendienteAprobacion);
function pendientesDe(col) { if (!S.pendientes) S.pendientes = {}; return S.pendientes[col] || (S.pendientes[col] = []); }
const todasDe = col => (CON_APROBACION.includes(col) ? S[col].concat(pendientesDe(col)) : S[col]);
// Asigna una colección completa separando lo pendiente de aprobación.
export function asignarColeccion(col, rows) {
  if (CON_APROBACION.includes(col)) { S[col] = rows.filter(x => !esPendiente(x)); S.pendientes[col] = rows.filter(esPendiente); }
  else S[col] = rows;
  tocarDatos();
}
function necesitaAprobacion(col, obj) {
  if (!CON_APROBACION.includes(col) || isAdmin() || obj.aprobado) return false;
  const umbral = +settings.aprobacionUmbral || 0;
  if (!umbral || (+obj.costo || 0) < umbral) return false;
  const ex = todasDe(col).find(x => x.id === obj.id);
  return !(ex && !esPendiente(ex) && (+obj.costo || 0) <= (+ex.costo || 0));
}

export function rowOf(obj) { const d = Object.assign({}, obj); delete d.id; return { id: obj.id, data: d, updated_at: new Date().toISOString() }; }
export function putLocal(col, obj) {
  if (CON_APROBACION.includes(col)) {
    if (esPendiente(obj)) S[col] = S[col].filter(x => x.id !== obj.id);
    else S.pendientes[col] = pendientesDe(col).filter(x => x.id !== obj.id);
  }
  const L = CON_APROBACION.includes(col) && esPendiente(obj) ? pendientesDe(col) : S[col];
  const i = L.findIndex(x => x.id === obj.id); if (i >= 0) L[i] = obj; else L.push(obj);
  tocarDatos(); programarCache(col, () => todasDe(col));
}
function quitarLocal(col, id) {
  S[col] = S[col].filter(x => x.id !== id);
  if (CON_APROBACION.includes(col)) S.pendientes[col] = pendientesDe(col).filter(x => x.id !== id);
  tocarDatos(); programarCache(col, () => todasDe(col));
}

/* Versión (updated_at) que tiene este celular de cada registro. Al guardar, solo se pisa
   si en el servidor sigue esa misma versión; si alguien guardó otra cosa en el medio,
   se combinan los cambios o se pregunta (ver conflictos.js). */
const versiones = new Map();
const claveVer = (col, id) => col + '\u0000' + id;
export function anotarVersion(col, id, v) { if (v) versiones.set(claveVer(col, id), v); else versiones.delete(claveVer(col, id)); }

/* Meses cerrados (Más → Cobros → Cierre de mes): cobros, gastos, depósitos y arreglos de
   esos meses solo los cambia un administrador, y queda anotado. */
const COLS_MES = ['payments', 'gastos', 'depositos', 'mantenimientos'];
function mesCerrado(col, obj) {
  if (!COLS_MES.includes(col) || !obj || !obj.fecha) return '';
  const m = String(obj.fecha).slice(0, 7);
  return (settings.mesesCerrados || []).includes(m) ? m : '';
}
const nombreMes = m => new Date(m + '-02').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

/* Cambios que el dueño quiere saber: borrar un cobro, cambiar un monto de contrato,
   condonar deuda o tocar un mes cerrado. Se anotan en la auditoría con "sensible:". */
function cambiosSensibles(col, base, obj, borrado) {
  const out = [];
  const pat = id => { const c = (S.cars || []).find(x => x.id === id); return c ? c.patente : ''; };
  if (col === 'payments' && borrado) out.push('borró un cobro de ' + money(base.monto) + (pat(base.carId) ? ' (' + pat(base.carId) + ')' : '') + ' del ' + String(base.fecha || '').split('-').reverse().join('/'));
  if (col === 'payments' && base && obj && +base.monto !== +obj.monto) out.push('cambió un cobro' + (pat(obj.carId) ? ' de ' + pat(obj.carId) : '') + ' de ' + money(base.monto) + ' a ' + money(obj.monto));
  if (col === 'cars' && base && obj && base.choferId && +base.monto && +obj.monto && +base.monto !== +obj.monto) out.push('cambió el monto de ' + (obj.patente || 'un auto') + ' de ' + money(base.monto) + ' a ' + money(obj.monto));
  if (col === 'cars' && base && obj) {
    const viejos = new Set((base.ajustesDeuda || []).map(a => a.id));
    (obj.ajustesDeuda || []).filter(a => !viejos.has(a.id) && +a.monto > 0).forEach(a => out.push('le descontó ' + money(a.monto) + ' de deuda a ' + (obj.patente || 'un auto') + (a.motivo ? ': ' + String(a.motivo).slice(0, 60) : '')));
  }
  const m = mesCerrado(col, obj) || mesCerrado(col, base);
  if (m) out.push((borrado ? 'borró ' : 'cambió ') + (col === 'payments' ? 'un cobro' : 'un registro') + ' de ' + nombreMes(m) + ', que estaba cerrado');
  return out;
}

/* Cambios propios: cuando Supabase avisa en vivo de un cambio que hicimos desde
   este mismo celular, no hace falta volver a aplicarlo ni redibujar. */
const ecos = new Map();
function anotarEco(col, id, marca) {
  const k = col + '\u0000' + id;
  const l = ecos.get(k) || []; l.push(marca); ecos.delete(k); ecos.set(k, l.slice(-5));
  if (ecos.size > 500) ecos.delete(ecos.keys().next().value);
}
function esEco(col, id, marca) {
  const k = col + '\u0000' + id, l = ecos.get(k);
  const i = l ? l.indexOf(marca) : -1;
  if (i < 0) return false;
  l.splice(i, 1); if (!l.length) ecos.delete(k);
  return true;
}
const fechaMs = v => { const t = Date.parse(v); return isNaN(t) ? null : t; };

/* Aplica a S los cambios que llegan en vivo (sin volver a descargar la tabla entera).
   Devuelve true si algo cambió y hay que redibujar, o 'recargar' si el aviso vino
   incompleto y conviene traer la colección de nuevo. */
export function aplicarCambios(col, eventos) {
  let cambio = false;
  for (const p of eventos) {
    const tipo = p.eventType;
    if (tipo === 'DELETE') {
      const id = p.old && p.old.id;
      if (id == null) return 'recargar';
      anotarVersion(col, id, null);
      if (esEco(col, id, 'borrado')) continue;
      if (todasDe(col).some(x => x.id === id)) { quitarLocal(col, id); cambio = true; }
      continue;
    }
    const row = p.new;
    if (!row || row.id == null || !row.data || typeof row.data !== 'object') return 'recargar';
    anotarVersion(col, row.id, row.updated_at);
    if (esEco(col, row.id, fechaMs(row.updated_at))) continue;
    let obj = Object.assign({ id: row.id }, row.data);
    if (col === 'cars') obj = normCar(obj);
    putLocal(col, obj); cambio = true;
  }
  return cambio;
}


function logAudit(accion, tabla, registroId) {
  if (!S.user) return;
  sb.from('audit_log').insert({ user_id: S.user.id, user_email: S.user.email, accion, tabla, registro_id: registroId }).then(() => {}, () => {});
}

export async function fetchAll(col) {
  // Primera página + total de filas; el resto de las páginas se piden todas juntas.
  const step = 1000;
  const first = await sb.from(col).select('id,data,updated_at', { count: 'exact' }).order('id').range(0, step - 1);
  if (first.error) throw first.error;
  let out = first.data || [];
  if (out.length === step) {
    const total = first.count != null ? first.count : 0;
    if (total > step) {
      const pages = [];
      for (let from = step; from < total; from += step) pages.push(sb.from(col).select('id,data,updated_at').order('id').range(from, from + step - 1));
      const rs = await Promise.all(pages);
      rs.forEach(r => { if (r.error) throw r.error; });
      out = out.concat(...rs.map(r => r.data));
    }
  }
  // Si entraron filas nuevas mientras se descargaba, seguir hasta la última página.
  while (out.length && out.length % step === 0) {
    const r = await sb.from(col).select('id,data,updated_at').order('id').range(out.length, out.length + step - 1);
    if (r.error) throw r.error;
    out = out.concat(r.data);
    if (r.data.length < step) break;
  }
  const vistos = new Set();
  out.forEach(x => anotarVersion(col, x.id, x.updated_at));
  return out.filter(x => (vistos.has(x.id) ? false : vistos.add(x.id))).map(x => Object.assign({ id: x.id }, x.data || {}));
}
let avisoSinConexion = 0;
export async function load(col) {
  try {
    let rows = await fetchAll(col);
    if (col === 'cars') rows = rows.map(normCar);
    asignarColeccion(col, rows); cacheCollection(col, rows); return true;
  } catch (e) {
    // Si ya hay datos en pantalla se mantienen (pueden ser más nuevos que la copia guardada).
    const cached = todasDe(col).length ? null : await readCachedCollection(col);
    if (cached || todasDe(col).length) {
      if (cached) asignarColeccion(col, cached);
      if (Date.now() - avisoSinConexion > 10000) { avisoSinConexion = Date.now(); toast('Sin conexión: mostrando la última copia guardada en este celular.'); }
      return true;
    }
    toast('No se pudieron cargar los datos (' + ((e && e.message) || 'error') + ')'); return false;
  }
}
export async function save(col, obj) {
  if (modoConsultaActivo()) { toast('No se puede guardar: modo solo consulta activado', 'error'); return false; }
  const base = todasDe(col).find(x => x.id === obj.id);
  const cerrado = mesCerrado(col, obj) || mesCerrado(col, base);
  if (cerrado && !isAdmin()) { toast(nombreMes(cerrado) + ' está cerrado: solo un administrador puede cambiar sus cobros y gastos.', 'error'); return false; }
  if (necesitaAprobacion(col, obj)) {
    obj = Object.assign({}, obj, { pendienteAprobacion: true, solicitadoPor: (S.user && S.user.email) || '', solicitadoFecha: new Date().toISOString().slice(0, 10) });
    setTimeout(() => toast('Supera el monto de aprobación: queda pendiente hasta que lo apruebe un administrador'), 80);
  }
  if (!navigator.onLine) {
    putLocal(col, obj); render(); queueOp({ type: 'save', col, obj });
    toast('Guardado sin conexión, se sincroniza solo cuando vuelva internet'); return true;
  }
  try {
    const r = await guardarConVersion(col, obj, base);
    if (r === 'error') return false;
    if (r === 'suyo') return true;
    obj = r;
  } catch (e) {
    putLocal(col, obj); render(); queueOp({ type: 'save', col, obj });
    toast('Guardado sin conexión, se sincroniza solo cuando vuelva internet'); return true;
  }
  putLocal(col, obj); render(); logAudit('guardado', col, obj.id);
  cambiosSensibles(col, base, obj, false).forEach(t => logAudit('sensible:' + t, col, obj.id));
  return true;
}
// Guarda solo si nadie cambió el registro desde que lo cargamos. Devuelve el objeto guardado
// (puede ser la combinación con lo del otro), 'suyo' si se eligió lo de la otra persona, o 'error'.
async function guardarConVersion(col, obj, base) {
  const conocida = versiones.get(claveVer(col, obj.id));
  for (let intento = 0; intento < 3; intento++) {
    const row = rowOf(obj); anotarEco(col, obj.id, fechaMs(row.updated_at));
    const r = conocida || intento
      ? await sb.from(col).update({ data: row.data, updated_at: row.updated_at }).eq('id', obj.id).eq('updated_at', versiones.get(claveVer(col, obj.id))).select('id,updated_at')
      : await sb.from(col).upsert(row).select('id,updated_at');
    if (r.error) { toast('No se pudo guardar: ' + r.error.message); return 'error'; }
    if (r.data && r.data.length) { anotarVersion(col, obj.id, r.data[0].updated_at); return obj; }
    // Nadie con esa versión: o lo borraron, o alguien guardó en el medio.
    const srv = await sb.from(col).select('id,data,updated_at').eq('id', obj.id).maybeSingle();
    if (srv.error) { toast('No se pudo guardar: ' + srv.error.message); return 'error'; }
    if (!srv.data) { anotarVersion(col, obj.id, null); const u = await sb.from(col).upsert(row).select('id,updated_at'); if (u.error) { toast('No se pudo guardar: ' + u.error.message); return 'error'; } anotarVersion(col, obj.id, u.data && u.data[0] && u.data[0].updated_at); return obj; }
    let servidor = Object.assign({ id: srv.data.id }, srv.data.data || {});
    if (col === 'cars') servidor = normCar(servidor);
    anotarVersion(col, obj.id, srv.data.updated_at);
    const mios = camposCambiados(base, obj), suyos = camposCambiados(base, servidor);
    const choque = base ? mios.filter(k => suyos.includes(k)) : mios.filter(k => JSON.stringify(obj[k]) !== JSON.stringify(servidor[k]));
    if (choque.length) {
      const eleccion = await preguntarConflicto(choque);
      if (eleccion === 'suyo') { putLocal(col, servidor); render(); toast('Quedó lo de la otra persona'); return 'suyo'; }
    }
    obj = combinar(servidor, obj, base || servidor);
    base = servidor;
  }
  toast('No se pudo guardar: muchos cambios al mismo tiempo. Probá de nuevo.'); return 'error';
}
export async function saveMany(col, arr) {
  for (let i = 0; i < arr.length; i += 200) {
    const r = await sb.from(col).upsert(arr.slice(i, i + 200).map(rowOf));
    if (r.error) { toast('No se pudo restaurar: ' + r.error.message); return false; }
  }
  arr.forEach(o => putLocal(col, o));
  if (arr.length) logAudit('restauracion_masiva(' + arr.length + ')', col, null);
  return true;
}
export async function remove(col, id) {
  if (modoConsultaActivo()) { toast('No se puede eliminar: modo solo consulta activado', 'error'); return false; }
  const previo = (S[col] || []).find(x => x.id === id) || ((S.pendientes || {})[col] || []).find(x => x.id === id);
  const cerrado = mesCerrado(col, previo);
  if (cerrado && !isAdmin()) { toast(nombreMes(cerrado) + ' está cerrado: solo un administrador puede borrar sus cobros y gastos.', 'error'); return false; }
  alPapelera(col, previo);
  if (!navigator.onLine) {
    quitarLocal(col, id); render(); queueOp({ type: 'remove', col, id });
    toast('Eliminado sin conexión, se sincroniza solo cuando vuelva internet'); return true;
  }
  try {
    anotarEco(col, id, 'borrado');
    const r = await sb.from(col).delete().eq('id', id);
    if (r.error) { toast('No se pudo eliminar: ' + r.error.message); return false; }
  } catch (e) {
    quitarLocal(col, id); render(); queueOp({ type: 'remove', col, id });
    toast('Eliminado sin conexión, se sincroniza solo cuando vuelva internet'); return true;
  }
  quitarLocal(col, id); render(); logAudit('eliminado', col, id);
  anotarVersion(col, id, null);
  if (previo) cambiosSensibles(col, previo, null, true).forEach(t => logAudit('sensible:' + t, col, id));
  return true;
}

export async function flushQueue() {
  const q = getQueue();
  if (!q.length || !navigator.onLine) return;
  const remaining = [];
  let done = 0;
  for (const op of q) {
    try {
      if (op.type === 'save') {
        const r = await sb.from(op.col).upsert(rowOf(op.obj));
        if (r.error) { remaining.push(op); continue; }
        logAudit('guardado', op.col, op.obj.id);
      } else if (op.type === 'remove') {
        const r = await sb.from(op.col).delete().eq('id', op.id);
        if (r.error) { remaining.push(op); continue; }
        logAudit('eliminado', op.col, op.id);
      }
      done++;
    } catch (e) { remaining.push(op); }
  }
  setQueue(remaining);
  if (done) toast('Sincronizado: ' + done + ' cambio' + (done === 1 ? '' : 's') + ' pendiente' + (done === 1 ? '' : 's'));
  render();
}
