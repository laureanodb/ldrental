const KEY = 'flota-snooze';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
const map = read();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) {} }

export function isSnoozed(key) {
  const until = map[key];
  return Boolean(until && until >= new Date().toISOString().slice(0, 10));
}
export function snooze(key, days) {
  const d = new Date(); d.setDate(d.getDate() + days);
  map[key] = d.toISOString().slice(0, 10);
  persist();
}
