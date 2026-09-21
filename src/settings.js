const KEY = 'flota-settings';
const DEFAULTS = { avisoWarn: 15, avisoSoft: 30 };

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? Object.assign({}, DEFAULTS, JSON.parse(raw)) : Object.assign({}, DEFAULTS);
  } catch (e) { return Object.assign({}, DEFAULTS); }
}

export const settings = read();

export function saveSettings(patch) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) {}
}
