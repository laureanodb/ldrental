const QKEY = 'flota-offline-queue';
const CKEY = 'flota-cache-';

// La cola se guarda en localStorage (sobrevive a todo) y se mantiene una copia
// en memoria para no releerla en cada dibujo de pantalla.
let colaMem = null;
function readQueue() {
  if (colaMem) return colaMem;
  try { colaMem = JSON.parse(localStorage.getItem(QKEY)) || []; } catch (e) { colaMem = []; }
  return colaMem;
}
function writeQueue(q) {
  colaMem = q;
  try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) {}
}
window.addEventListener('storage', e => { if (e.key === QKEY) colaMem = null; });
export function queueOp(op) { const q = readQueue().slice(); q.push(op); writeQueue(q); }
export function getQueue() { return readQueue().slice(); }
export function setQueue(q) { writeQueue(q.slice()); }
export function queueLength() { return readQueue().length; }

/* Copia local de cada colección para abrir la app al instante y sin internet.
   Va en IndexedDB (mucho más espacio que localStorage y no traba la pantalla al
   guardar). Si el navegador no lo permite, se usa localStorage como antes. */
const DB = 'flota-cache', STORE = 'colecciones';
let dbProm = null;
function abrirDB() {
  if (dbProm) return dbProm;
  dbProm = new Promise(resolve => {
    try {
      if (!window.indexedDB) return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch (e) { resolve(null); }
  });
  return dbProm;
}
function idb(modo, fn) {
  return abrirDB().then(db => new Promise(resolve => {
    if (!db) return resolve(undefined);
    try {
      const tx = db.transaction(STORE, modo);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : true);
      tx.onerror = tx.onabort = () => resolve(undefined);
    } catch (e) { resolve(undefined); }
  }));
}
function leerLS(col) {
  try { const raw = localStorage.getItem(CKEY + col); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

export async function cacheCollection(col, rows) {
  const ok = await idb('readwrite', st => st.put(rows, col));
  if (ok) { try { localStorage.removeItem(CKEY + col); } catch (e) {} return; }
  try { localStorage.setItem(CKEY + col, JSON.stringify(rows)); } catch (e) {}
}
export async function readCachedCollection(col) {
  const v = await idb('readonly', st => st.get(col));
  if (Array.isArray(v)) return v;
  return leerLS(col);
}
// Lee todas las colecciones juntas (una sola transacción al abrir la app).
export async function readCachedCollections(cols) {
  const out = {};
  const db = await abrirDB();
  if (db) {
    await new Promise(resolve => {
      try {
        const tx = db.transaction(STORE, 'readonly'), st = tx.objectStore(STORE);
        cols.forEach(c => { const r = st.get(c); r.onsuccess = () => { if (Array.isArray(r.result)) out[c] = r.result; }; });
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
      } catch (e) { resolve(); }
    });
  }
  cols.forEach(c => { if (!out[c]) { const v = leerLS(c); if (v) out[c] = v; } });
  return out;
}
// Guarda la copia un ratito después del último cambio (varios cambios seguidos = una sola escritura).
const pendientes = {};
export function programarCache(col, getRows) {
  if (pendientes[col]) clearTimeout(pendientes[col].t);
  pendientes[col] = { getRows, t: setTimeout(() => { delete pendientes[col]; cacheCollection(col, getRows()); }, 1500) };
}
// Si se cierra o se manda al fondo la app, guardar ya lo que quedó pendiente.
function guardarPendientes() {
  Object.keys(pendientes).forEach(col => { const p = pendientes[col]; clearTimeout(p.t); delete pendientes[col]; cacheCollection(col, p.getRows()); });
}
window.addEventListener('pagehide', guardarPendientes);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') guardarPendientes(); });

export function isNetworkError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return !navigator.onLine || msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch');
}
