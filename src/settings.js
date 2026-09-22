import { esc } from './utils.js';

const KEY = 'flota-settings';
const DEFAULTS = { avisoWarn: 15, avisoSoft: 30, depositoAvisoPct: 50, multaUmbral: 500000, multaPlazoDias: 7, kmSemanaEsperado: 1500, fotoControlDias: 30, companyName: 'Mi Flota', companyLogo: '', bonoSemanas: 8, riesgoSemanas: 2 };

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
export function brandH1() {
  return (settings.companyLogo ? '<img src="' + settings.companyLogo + '" alt="" style="height:32px;display:block;margin-bottom:6px">' : '') +
    '<h1>' + esc(settings.companyName || 'Mi Flota') + '</h1>';
}
