import { S, ui } from '../state.js';
import { esc, money, fdate, num1, parse, today } from '../utils.js';
import { isContract, calc, carById, badge, plate, driverName } from '../calc.js';
import { METODOS_PAGO } from '../constants.js';

const metodoLabel = m => (METODOS_PAGO.find(x => x[0] === m) || [])[1];
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];

function calendarioCobros(act) {
  const hoy = today().getDay();
  const porDia = Array.from({ length: 7 }, () => []);
  act.forEach(x => { if (!x.c.inicio) return; porDia[parse(x.c.inicio).getDay()].push(x); });
  return '<h2>Calendario de la semana</h2><div class="scroll-x"><div class="row" style="gap:6px;padding-bottom:4px">' + ORDEN_SEMANA.map(wd => {
    const items = porDia[wd], esHoy = wd === hoy;
    return '<div class="card" style="min-width:78px;flex:none' + (esHoy ? ';border-color:var(--info)' : '') + '">' +
      '<div class="small" style="text-align:center;font-weight:' + (esHoy ? '700' : '400') + (esHoy ? ';color:var(--info)' : ';color:var(--muted)') + '">' + DIAS[wd] + '</div>' +
      (items.length ? items.map(x => '<div class="small tap" style="margin-top:4px;text-align:center;' + (x.i.debt > 0 ? 'color:var(--bad)' : '') + '" onclick="payForm(\'' + x.c.id + '\')">' + esc(x.c.patente) + '</div>').join('') : '<div class="small muted" style="text-align:center;margin-top:4px">–</div>') +
      '</div>';
  }).join('') + '</div></div>';
}

export function viewCobros() {
  const act = S.cars.filter(c => isContract(c) && c.choferId).map(c => ({ c, i: calc(c) })).sort((a, b) => b.i.debt - a.i.debt);
  let h = '<h1>Cobros</h1><p class="sub">Cobro semanal por auto</p><div class="bar"><button class="btn grow" onclick="payForm()">Registrar cobro</button>' + '<button class="btn sec" onclick="exportCSV()">Exportar</button>' + '</div>';
  if (act.length) h += calendarioCobros(act);
  h += '<h2>Estado de cada auto</h2>';
  if (!act.length) h += '<div class="card empty">Cuando tengas autos alquilados o financiados con chofer, van a aparecer acá.</div>';
  act.forEach(x => {
    const c = x.c, i = x.i, d = S.drivers.find(y => y.id === c.choferId);
    let wa = '';
    if (i.debt > 0 && d && d.tel) {
      const msg = 'Hola ' + d.nombre.split(' ')[0] + ', te escribo por el pago de ' + (c.tipo === 'alquiler' ? 'alquiler' : 'cuota') + ' del auto ' + c.patente + '. Tenés pendiente ' + money(i.debt) + '. ¿Cuándo podés pasar a abonarlo?';
      wa = '<a class="btn sec sm" target="_blank" rel="noopener" href="https://wa.me/' + d.tel.replace(/\D/g, '') + '?text=' + encodeURIComponent(msg) + '">WhatsApp</a>';
    }
    h += '<div class="card"><div class="row between"><div>' + plate(c.patente) + ' <span class="small muted">' + esc(d ? d.nombre : '') + '</span></div>' + (i.debt > 0 ? badge('bad', 'Debe ' + money(i.debt)) : badge('ok', 'Al día')) + '</div>' +
    '<div class="row between small muted" style="margin-top:6px"><div>' + (c.tipo === 'alquiler' ? 'Alquiler' : 'Cuota') + ' ' + money(c.monto) + ' por semana' + (i.debt > 0 ? ' · ' + num1(i.late) + ' sem. de atraso' : '') + '</div></div>' +
    '<div class="row" style="margin-top:8px"><button class="btn sm" onclick="payForm(\'' + c.id + '\')">Cobrar</button>' + wa + '</div></div>';
  });
  h += '<h2>Historial</h2><div class="bar"><select onchange="ui.filterCar=this.value;render()"><option value="">Todos los autos</option>' + S.cars.map(c => '<option value="' + c.id + '"' + (ui.filterCar === c.id ? ' selected' : '') + '>' + esc(c.patente) + '</option>').join('') + '</select></div>';
  const P = S.payments.filter(p => !ui.filterCar || p.carId === ui.filterCar).sort((a, b) => (b.fecha + b.id).localeCompare(a.fecha + a.id));
  if (!P.length) h += '<div class="card muted">Todavía no hay cobros registrados.</div>';
  P.slice(0, 40).forEach(p => {
    const c = carById(p.carId);
    h += '<div class="card row"><div class="grow"><div>' + money(p.monto) + ' <span class="small muted">' + esc(p.tipo === 'alquiler' ? 'alquiler' : p.tipo === 'cuota' ? 'cuota' : 'otro') + '</span>' + (p.parcial ? ' ' + badge('warn', 'Parcial') : '') + '</div><div class="small muted">' + fdate(p.fecha) + ' · ' + esc(c ? c.patente : 'auto eliminado') + (p.choferId && driverName(p.choferId) ? ' · ' + esc(driverName(p.choferId)) : '') + (metodoLabel(p.metodo) ? ' · ' + esc(metodoLabel(p.metodo)) : '') + (p.nota ? ' · ' + esc(p.nota) : '') + '</div></div><button class="btn danger sm" onclick="confirmDel(this,()=>delPay(\'' + p.id + '\'))">Borrar</button></div>';
  });
  if (P.length > 40) h += '<div class="small muted" style="text-align:center">Se muestran los últimos 40. Exportá para ver todos.</div>';
  return h;
}
