import { $ } from './utils.js';
import { S, ui, configured } from './state.js';
import { urgent } from './calc.js';
import { viewSetup, viewLogin } from './session.js';
import { viewPanel } from './views/panel.js';
import { viewAutos, listAutos } from './views/autos.js';
import { viewChoferes, listChoferes } from './views/choferes.js';
import { viewCobros } from './views/cobros.js';
import { viewVenc } from './views/venc.js';
import { viewReportes } from './views/reportes.js';

const ICONS = {
  panel: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z"/>',
  autos: '<path d="M5 16v-4l2-5h10l2 5v4M3 16h18M7 19v-3M17 19v-3M7.5 12h9"/>',
  choferes: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  cobros: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
  venc: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M12 13v3l2 1"/>',
  reportes: '<path d="M4 19h16M7 19v-6M12 19V6M17 19v-9"/>'
};
export function renderNav() {
  if (!configured() || !S.user) { $('#nav').innerHTML = ''; return; }
  const n = urgent().length;
  const items = [['panel', 'Panel'], ['autos', 'Autos'], ['choferes', 'Choferes'], ['cobros', 'Cobros'], ['venc', 'Vencimientos'], ['reportes', 'Reportes']];
  $('#nav').innerHTML = items.map(([k, l]) => '<button class="' + (ui.tab === k ? 'on' : '') + '" onclick="go(\'' + k + '\')"><svg viewBox="0 0 24 24">' + ICONS[k] + '</svg>' + l + (k === 'venc' && n ? '<span class="dot">' + n + '</span>' : '') + '</button>').join('');
}
export function go(t) { ui.tab = t; render(); window.scrollTo(0, 0); }
export function render() {
  renderNav();
  const app = $('#app');
  if (!configured()) { app.innerHTML = viewSetup(); return; }
  if (!S.user) { app.innerHTML = viewLogin(); return; }
  if (!S.ready) { app.innerHTML = '<div class="loading">Cargando tu flota…</div>'; return; }
  const v = { panel: viewPanel, autos: viewAutos, choferes: viewChoferes, cobros: viewCobros, venc: viewVenc, reportes: viewReportes }[ui.tab]();
  app.innerHTML = v;
  renderList();
}
export function renderList() {
  const el = $('#list'); if (!el) return;
  if (ui.tab === 'autos') el.innerHTML = listAutos();
  if (ui.tab === 'choferes') el.innerHTML = listChoferes();
}
