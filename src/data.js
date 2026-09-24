import { S, sb } from './state.js';
import { toast } from './modal.js';
import { render } from './nav.js';
import { normCar } from './constants.js';
import { queueOp, getQueue, setQueue, cacheCollection, readCachedCollection, isNetworkError } from './offline.js';
import { modoConsultaActivo } from './consulta.js';

export function rowOf(obj) { const d = Object.assign({}, obj); delete d.id; return { id: obj.id, data: d, updated_at: new Date().toISOString() }; }
export function putLocal(col, obj) { const i = S[col].findIndex(x => x.id === obj.id); if (i >= 0) S[col][i] = obj; else S[col].push(obj); }

function logAudit(accion, tabla, registroId) {
  if (!S.user) return;
  sb.from('audit_log').insert({ user_id: S.user.id, user_email: S.user.email, accion, tabla, registro_id: registroId }).then(() => {}, () => {});
}

export async function fetchAll(col) {
  const out = []; const step = 1000;
  for (let from = 0; ; from += step) {
    const r = await sb.from(col).select('id,data').order('id').range(from, from + step - 1);
    if (r.error) throw r.error;
    out.push(...r.data);
    if (r.data.length < step) break;
  }
  return out.map(x => Object.assign({ id: x.id }, x.data || {}));
}
export async function load(col) {
  try {
    let rows = await fetchAll(col);
    if (col === 'cars') rows = rows.map(normCar);
    S[col] = rows; cacheCollection(col, rows); return true;
  } catch (e) {
    const cached = readCachedCollection(col);
    if (cached) { S[col] = cached; toast('Sin conexión: mostrando la última copia guardada en este celular.'); return true; }
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
    const r = await sb.from(col).upsert(rowOf(obj));
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
    S[col] = S[col].filter(x => x.id !== id); render(); queueOp({ type: 'remove', col, id });
    toast('Eliminado sin conexión, se sincroniza solo cuando vuelva internet'); return true;
  }
  try {
    const r = await sb.from(col).delete().eq('id', id);
    if (r.error) { toast('No se pudo eliminar: ' + r.error.message); return false; }
  } catch (e) {
    S[col] = S[col].filter(x => x.id !== id); render(); queueOp({ type: 'remove', col, id });
    toast('Eliminado sin conexión, se sincroniza solo cuando vuelva internet'); return true;
  }
  S[col] = S[col].filter(x => x.id !== id); render(); logAudit('eliminado', col, id); return true;
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
