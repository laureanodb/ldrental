import { S, sb } from './state.js';
import { toast } from './modal.js';
import { render } from './nav.js';
import { normCar } from './constants.js';
import { queueOp, getQueue, setQueue, cacheCollection, readCachedCollection, programarCache, isNetworkError } from './offline.js';
import { modoConsultaActivo } from './consulta.js';
import { tocarDatos } from './memo.js';

export function rowOf(obj) { const d = Object.assign({}, obj); delete d.id; return { id: obj.id, data: d, updated_at: new Date().toISOString() }; }
export function putLocal(col, obj) { const i = S[col].findIndex(x => x.id === obj.id); if (i >= 0) S[col][i] = obj; else S[col].push(obj); tocarDatos(); programarCache(col, () => S[col]); }
function quitarLocal(col, id) { S[col] = S[col].filter(x => x.id !== id); tocarDatos(); programarCache(col, () => S[col]); }

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
      if (esEco(col, id, 'borrado')) continue;
      if (S[col].some(x => x.id === id)) { quitarLocal(col, id); cambio = true; }
      continue;
    }
    const row = p.new;
    if (!row || row.id == null || !row.data || typeof row.data !== 'object') return 'recargar';
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
  const first = await sb.from(col).select('id,data', { count: 'exact' }).order('id').range(0, step - 1);
  if (first.error) throw first.error;
  let out = first.data || [];
  if (out.length === step) {
    const total = first.count != null ? first.count : 0;
    if (total > step) {
      const pages = [];
      for (let from = step; from < total; from += step) pages.push(sb.from(col).select('id,data').order('id').range(from, from + step - 1));
      const rs = await Promise.all(pages);
      rs.forEach(r => { if (r.error) throw r.error; });
      out = out.concat(...rs.map(r => r.data));
    }
  }
  // Si entraron filas nuevas mientras se descargaba, seguir hasta la última página.
  while (out.length && out.length % step === 0) {
    const r = await sb.from(col).select('id,data').order('id').range(out.length, out.length + step - 1);
    if (r.error) throw r.error;
    out = out.concat(r.data);
    if (r.data.length < step) break;
  }
  const vistos = new Set();
  return out.filter(x => (vistos.has(x.id) ? false : vistos.add(x.id))).map(x => Object.assign({ id: x.id }, x.data || {}));
}
let avisoSinConexion = 0;
export async function load(col) {
  try {
    let rows = await fetchAll(col);
    if (col === 'cars') rows = rows.map(normCar);
    S[col] = rows; tocarDatos(); cacheCollection(col, rows); return true;
  } catch (e) {
    // Si ya hay datos en pantalla se mantienen (pueden ser más nuevos que la copia guardada).
    const cached = S[col].length ? S[col] : await readCachedCollection(col);
    if (cached) {
      if (cached !== S[col]) { S[col] = cached; tocarDatos(); }
      if (Date.now() - avisoSinConexion > 10000) { avisoSinConexion = Date.now(); toast('Sin conexión: mostrando la última copia guardada en este celular.'); }
      return true;
    }
    toast('No se pudieron cargar los datos (' + ((e && e.message) || 'error') + ')'); return false;
  }
}
export async function save(col, obj) {
  if (modoConsultaActivo()) { toast('No se puede guardar: modo solo consulta activado', 'error'); return false; }
  if (!navigator.onLine) {
    putLocal(col, obj); render(); queueOp({ type: 'save', col, obj });
    toast('Guardado sin conexión, se sincroniza solo cuando vuelva internet'); return true;
  }
  try {
    const row = rowOf(obj); anotarEco(col, obj.id, fechaMs(row.updated_at));
    const r = await sb.from(col).upsert(row);
    if (r.error) { toast('No se pudo guardar: ' + r.error.message); return false; }
  } catch (e) {
    putLocal(col, obj); render(); queueOp({ type: 'save', col, obj });
    toast('Guardado sin conexión, se sincroniza solo cuando vuelva internet'); return true;
  }
  putLocal(col, obj); render(); logAudit('guardado', col, obj.id); return true;
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
  quitarLocal(col, id); render(); logAudit('eliminado', col, id); return true;
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
