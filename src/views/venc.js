import { alerts, sugerenciasAnticipacionVenc } from '../calc.js';
import { alertRow } from './shared.js';
import { today, esc } from '../utils.js';
import { settings } from '../settings.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function calendarioVenc(A) {
  const t = today();
  const year = t.getFullYear(), month = t.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const byDay = {};
  A.forEach(a => {
    const d = new Date(t); d.setDate(t.getDate() + a.d);
    if (d.getFullYear() === year && d.getMonth() === month) {
      (byDay[d.getDate()] = byDay[d.getDate()] || []).push(a);
    }
  });
  const peorClase = L => L.some(a => a.cls === 'bad') ? 'bad' : L.some(a => a.cls === 'warn') ? 'warn' : L.some(a => a.cls === 'soft') ? 'soft' : 'ok';
  let cells = '';
  for (let i = 0; i < startWeekday; i++) cells += '<div></div>';
  for (let day = 1; day <= daysInMonth; day++) {
    const L = byDay[day];
    const esHoy = day === t.getDate();
    cells += '<div class="daycell' + (esHoy ? ' hoy' : '') + (L ? ' b-' + peorClase(L) : '') + '"><span>' + day + '</span>' + (L ? '<b>' + L.length + '</b>' : '') + '</div>';
  }
  return '<h2>' + MESES[month] + '</h2><div class="monthgrid">' + DIAS_SEMANA.map(d => '<div class="small muted" style="text-align:center">' + d + '</div>').join('') + cells + '</div>';
}

export function viewVenc() {
  const A = alerts();
  let h = '<h1>Vencimientos</h1><p class="sub">Documentación de autos y licencias de choferes</p>';
  if (!A.length) return h + '<div class="card empty"><b>Sin fechas cargadas</b>Cargá VTV, seguro, patente y licencias en cada auto y chofer.</div>';
  const sug = sugerenciasAnticipacionVenc();
  if (sug.length) {
    h += '<div class="card" style="margin-bottom:10px"><div class="small muted" style="margin-bottom:6px">Según lo que tardaste en renovarlos antes</div>' +
    sug.map(s => '<div class="row between small" style="padding:2px 0"><span>' + esc(s.label) + '</span><span class="muted">' + (s.dias >= 0 ? 'se renueva ' + s.dias + ' d después del vencimiento anterior' : 'se renueva ' + (-s.dias) + ' d antes') + '</span></div>').join('') + '</div>';
  }
  h += calendarioVenc(A);
  const sec = (t, L) => L.length ? '<h2>' + t + '</h2>' + L.map(alertRow).join('') : '';
  h += sec('Vencidos', A.filter(a => a.d < 0));
  h += sec('En los próximos ' + settings.avisoSoft + ' días', A.filter(a => a.d >= 0 && a.d <= settings.avisoSoft));
  h += sec('Más adelante', A.filter(a => a.d > settings.avisoSoft));
  return h;
}
