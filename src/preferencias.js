// Preferencias de este celular: con qué pantalla abre la app y los filtros de
// cada lista, que quedan como los dejaste la última vez.
import { ui } from './state.js';

const KEY_FILTROS = 'ld-filtros', KEY_INICIO = 'ld-inicio';
const FILTROS = ['filterCar', 'showVendidos', 'showInactivos', 'showProspectos', 'mantProveedor', 'mantDesde', 'mantHasta', 'mantAuto', 'mantItem', 'mantTipo', 'mantOrden',
  'ordenAutos', 'ordenChoferes', 'filtroAutoTipo', 'filtroSinLlave', 'filtroCobrosMetodo', 'muAuto', 'muEstado', 'muOrden', 'siAuto', 'siEstado', 'siOrden',
  'stockCat', 'stockSoloBajo', 'panolTipo', 'panolUbicacion', 'panolValuacion', 'otFiltro', 'tableroOrden', 'ordenCompChoferes', 'ordenCompAutos'];
export const PANTALLAS_INICIO = [['panel', 'Panel'], ['cobros', 'Cobros'], ['autos', 'Autos'], ['choferes', 'Choferes'], ['venc', 'Vencimientos'], ['stock', 'Pañol'], ['tablero', 'Tablero semanal']];

let ultimo = '';
export function cargarPreferencias() {
  try {
    const f = JSON.parse(localStorage.getItem(KEY_FILTROS) || '{}');
    FILTROS.forEach(k => { if (f[k] !== undefined && typeof f[k] === typeof ui[k]) ui[k] = f[k]; });
    ultimo = JSON.stringify(f);
  } catch (e) { /* sin preferencias guardadas */ }
  const ini = pantallaInicio();
  if (ini === 'stock' || ini === 'tablero') { ui.tab = 'mas'; ui.masView = ini; }
  else if (ini && ini !== 'panel') ui.tab = ini;
}
// Se llama en cada dibujo: guarda solo si cambió algo.
export function guardarFiltros() {
  const f = {}; FILTROS.forEach(k => { f[k] = ui[k]; });
  const s = JSON.stringify(f);
  if (s === ultimo) return;
  ultimo = s;
  try { localStorage.setItem(KEY_FILTROS, s); } catch (e) {}
}
export function pantallaInicio() { try { return localStorage.getItem(KEY_INICIO) || 'panel'; } catch (e) { return 'panel'; } }
export function elegirPantallaInicio(v) {
  try { localStorage.setItem(KEY_INICIO, v); } catch (e) {}
}
export function preferenciasCard() {
  const ini = pantallaInicio();
  return '<div class="card"><div class="small muted" style="margin-bottom:10px">En este celular: con qué pantalla abre la app. Los filtros de cada lista (autos, choferes, cobros, pañol, multas…) quedan como los dejaste.</div>' +
    '<label class="f"><span>Al abrir la app mostrar</span><select onchange="elegirPantallaInicio(this.value);toast(\'Listo: la próxima vez abre en \' + this.options[this.selectedIndex].text)">' +
    PANTALLAS_INICIO.map(([k, l]) => '<option value="' + k + '"' + (k === ini ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    '<button class="btn sec block" onclick="limpiarFiltrosGuardados()">Borrar los filtros guardados</button></div>';
}
export function limpiarFiltrosGuardados() {
  try { localStorage.removeItem(KEY_FILTROS); } catch (e) {}
  location.reload();
}
