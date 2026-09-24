const KEY = 'flota-tramite';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
const map = read();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) {} }

export function isEnTramite(key) { return Boolean(map[key]); }
export function marcarEnTramite(key) { map[key] = true; persist(); }
export function quitarEnTramite(key) { delete map[key]; persist(); }
