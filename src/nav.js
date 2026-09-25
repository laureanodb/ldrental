import { $, esc } from './utils.js';
import { S, ui, configured } from './state.js';
import { urgent, mantenimientoVencidosCount, multasPendientesCount } from './calc.js';
import { viewSetup, viewLogin } from './session.js';
import { viewPanel } from './views/panel.js';
import { viewAutos, listAutos } from './views/autos.js';
import { viewChoferes, listChoferes } from './views/choferes.js';
import { viewCobros } from './views/cobros.js';
import { viewVenc } from './views/venc.js';
import { viewMas } from './views/mas.js';
import { listMantenimiento } from './views/mantenimiento.js';
import { listMultas } from './views/multas.js';
import { listSiniestros } from './views/siniestros.js';
import { queueLength } from './offline.js';
import { settings } from './settings.js';
import { modoConsultaActivo, modoConsultaHasta } from './consulta.js';

const ICONS = {
  panel: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z"/>',
  autos: '<path d="M5 16v-4l2-5h10l2 5v4M3 16h18M7 19v-3M17 19v-3M7.5 12h9"/>',
  choferes: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  cobros: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
  venc: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M12 13v3l2 1"/>',
  mas: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
};
export function renderNav() {
  if (!configured() || !S.user) { $('#nav').innerHTML = ''; return; }
  const n = urgent().length;
  const nMas = mantenimientoVencidosCount() + multasPendientesCount();
  const items = [['panel', 'Panel'], ['autos', 'Autos'], ['choferes', 'Choferes'], ['cobros', 'Cobros'], ['venc', 'Vencimientos'], ['mas', 'Más']];
  $('#nav').innerHTML = items.map(([k, l]) => '<button class="' + (ui.tab === k ? 'on' : '') + '" onclick="' + (k === 'autos' ? "ui.filtroAutoTipo='';" : '') + (k === 'mas' ? "ui.masView='';" : '') + 'go(\'' + k + '\')"><svg viewBox="0 0 24 24">' + ICONS[k] + '</svg>' + l + (k === 'venc' && n ? '<span class="dot">' + n + '</span>' : '') + (k === 'mas' && nMas ? '<span class="dot">' + nMas + '</span>' : '') + '</button>').join('');
}
export function go(t) { ui.tab = t; render(); window.scrollTo(0, 0); }
function offlineBar() {
  const n = queueLength();
  if (navigator.onLine && !n) return '';
  return '<div class="offlinebar row between"><span>' + (!navigator.onLine ? 'Sin conexión' : 'Conectado') + (n ? ' · ' + n + ' cambio' + (n === 1 ? '' : 's') + ' por sincronizar' : '') + '</span>' +
  (navigator.onLine && n ? '<span class="tap" style="text-decoration:underline" onclick="sincronizarAhora()">Reintentar</span>' : '') + '</div>';
}
function consultaBar() {
  if (!modoConsultaActivo()) return '';
  const hasta = modoConsultaHasta();
  const txt = hasta ? new Date(hasta).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  return '<div class="offlinebar row between"><span>Modo solo consulta activado' + (txt ? ' hasta ' + txt : '') + '</span></div>';
}
function syncDot() {
  const n = queueLength();
  const cls = !navigator.onLine ? 'bad' : n ? 'warn' : 'ok';
  const title = !navigator.onLine ? 'Sin conexión' : n ? n + ' cambio' + (n === 1 ? '' : 's') + ' por sincronizar (tocá para reintentar)' : 'Todo sincronizado';
  return '<span class="syncdot ' + cls + '" title="' + esc(title) + '"' + (navigator.onLine && n ? ' onclick="sincronizarAhora()"' : '') + '></span>';
}
function topBar() {
  return '<div class="topbar"><span class="tb-brand">' + esc(settings.companyName || 'LD Rental') + syncDot() + '</span>' +
  '<button class="tb-search" onclick="searchView()" aria-label="Buscar"><svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></button></div>';
}
function fabBar() {
  return '<div class="fab-bar">' +
  '<button class="fab sec" title="Buscar" onclick="searchView()"><svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></button>' +
  '<button class="fab sec" title="Gasto rápido" onclick="gastoGeneralForm()"><svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg></button>' +
  '<button class="fab main" title="Cobro rápido" onclick="payForm()"><svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg></button>' +
  '</div>';
}
export function render() {
  renderNav();
  const app = $('#app');
  if (!configured()) { app.innerHTML = viewSetup(); return; }
  if (!S.user) { app.innerHTML = viewLogin(); return; }
  if (!S.ready) { app.innerHTML = '<div class="loading">Cargando tu flota…</div>'; return; }
  const v = { panel: viewPanel, autos: viewAutos, choferes: viewChoferes, cobros: viewCobros, venc: viewVenc, mas: viewMas }[ui.tab]();
  app.innerHTML = offlineBar() + consultaBar() + topBar() + v + (modoConsultaActivo() ? '' : fabBar());
  renderList();
}
export function renderList() {
  const el = $('#list'); if (!el) return;
  if (ui.tab === 'autos') el.innerHTML = listAutos();
  if (ui.tab === 'choferes') el.innerHTML = listChoferes();
  if (ui.tab === 'mas' && ui.masView === 'mantenimiento') el.innerHTML = listMantenimiento();
  if (ui.tab === 'mas' && ui.masView === 'multas') el.innerHTML = listMultas();
  if (ui.tab === 'mas' && ui.masView === 'siniestros') el.innerHTML = listSiniestros();
}
