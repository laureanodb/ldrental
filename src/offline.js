const QKEY = 'flota-offline-queue';
const CKEY = 'flota-cache-';

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QKEY)) || []; } catch (e) { return []; }
}
function writeQueue(q) {
  try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) {}
}
export function queueOp(op) { const q = readQueue(); q.push(op); writeQueue(q); }
export function getQueue() { return readQueue(); }
export function setQueue(q) { writeQueue(q); }
export function queueLength() { return readQueue().length; }

export function cacheCollection(col, rows) {
  try { localStorage.setItem(CKEY + col, JSON.stringify(rows)); } catch (e) {}
}
export function readCachedCollection(col) {
  try { const raw = localStorage.getItem(CKEY + col); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

export function isNetworkError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return !navigator.onLine || msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch');
}
