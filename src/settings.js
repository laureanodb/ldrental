const KEY = 'flota-settings';
const DEFAULTS = { avisoWarn: 15, avisoSoft: 30, depositoAvisoPct: 50, multaUmbral: 500000, multaPlazoDias: 7, kmSemanaEsperado: 1500, fotoControlDias: 30 };

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
