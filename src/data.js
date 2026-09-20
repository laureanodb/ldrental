import { S, sb } from './state.js';
import { toast } from './modal.js';
import { render } from './nav.js';
import { normCar } from './constants.js';

export function rowOf(obj) { const d = Object.assign({}, obj); delete d.id; return { id: obj.id, data: d, updated_at: new Date().toISOString() }; }
export function putLocal(col, obj) { const i = S[col].findIndex(x => x.id === obj.id); if (i >= 0) S[col][i] = obj; else S[col].push(obj); }

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
    S[col] = rows; return true;
  } catch (e) { toast('No se pudieron cargar los datos (' + ((e && e.message) || 'error') + ')'); return false; }
}
export async function save(col, obj) {
  const r = await sb.from(col).upsert(rowOf(obj));
  if (r.error) { toast('No se pudo guardar: ' + r.error.message); return false; }
  putLocal(col, obj); render(); return true;
}
export async function saveMany(col, arr) {
  for (let i = 0; i < arr.length; i += 200) {
    const r = await sb.from(col).upsert(arr.slice(i, i + 200).map(rowOf));
    if (r.error) { toast('No se pudo restaurar: ' + r.error.message); return false; }
  }
  arr.forEach(o => putLocal(col, o)); return true;
}
export async function remove(col, id) {
  const r = await sb.from(col).delete().eq('id', id);
  if (r.error) { toast('No se pudo eliminar: ' + r.error.message); return false; }
  S[col] = S[col].filter(x => x.id !== id); render(); return true;
}
