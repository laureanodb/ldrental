import { alerts } from '../calc.js';
import { alertRow } from './shared.js';

export function viewVenc() {
  const A = alerts();
  let h = '<h1>Vencimientos</h1><p class="sub">Documentación de autos y licencias de choferes</p>';
  if (!A.length) return h + '<div class="card empty"><b>Sin fechas cargadas</b>Cargá VTV, seguro, patente y licencias en cada auto y chofer.</div>';
  const sec = (t, L) => L.length ? '<h2>' + t + '</h2>' + L.map(alertRow).join('') : '';
  h += sec('Vencidos', A.filter(a => a.d < 0));
  h += sec('En los próximos 30 días', A.filter(a => a.d >= 0 && a.d <= 30));
  h += sec('Más adelante', A.filter(a => a.d > 30));
  return h;
}
