import { esc } from './utils.js';

const KEY = 'flota-settings';
const DEFAULTS = { avisoWarn: 15, avisoSoft: 30, depositoAvisoPct: 50, multaUmbral: 500000, multaPlazoDias: 7, kmSemanaEsperado: 1500, fotoControlDias: 30, companyName: 'LD Rental', companyLogo: '', companyPhone: '', bonoSemanas: 8, riesgoSemanas: 2, multaRecargoPct: 10, puntosLimite: 20, puntosVigenciaMeses: 24, autoParadoDias: 14, cobroEdicionDias: 30, telefonoEmergencia: '', protocoloEmergencia: '', anuncios: [], panelKpis: ['cobrado', 'esperado', 'deuda', 'saldoFin', 'autosCalle', 'vencUrgentes', 'autosDisponibles'] };
const CAR_ICON = '<svg viewBox="0 0 24 24" style="width:26px;height:26px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;vertical-align:-5px;margin-right:8px"><path d="M5 16v-4l2-5h10l2 5v4M3 16h18M7 19v-3M17 19v-3M7.5 12h9"/></svg>';

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
    '<h1>' + (settings.companyLogo ? '' : CAR_ICON) + esc(settings.companyName || 'LD Rental') + '</h1>';
}
