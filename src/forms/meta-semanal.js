// Meta de cobranza semanal: lo que vence esta semana (lunes a domingo) contra lo cobrado,
// día por día. Los alquileres van en pesos y las cuotas de financiados en dólares, por separado.
import { S } from '../state.js';
import { esc, iso, today, money, moneyUSD } from '../utils.js';
import { openModal } from '../modal.js';
import { isContract, calc } from '../calc.js';
import { esMensual, montoMensual } from '../financiados.js';
import { cobroEnFecha } from './agenda.js';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export function diasDeLaSemana(base = today()) {
  const d = new Date(base); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return iso(x); });
}
export function metaSemanal(base) {
  const dias = diasDeLaSemana(base), hoy = iso(today());
  const autos = S.cars.filter(c => !c.vendido && isContract(c));
  const filas = dias.map((f, i) => {
    let esperado = 0, esperadoUSD = 0;
    autos.forEach(c => { if (!cobroEnFecha(c, f)) return; if (c.tipo === 'financiado') esperadoUSD += esMensual(c) ? montoMensual(c) : +c.monto || 0; else esperado += +c.monto || 0; });
    const P = S.payments.filter(p => p.fecha === f);
    return { f, dia: DIAS[i], esperado, esperadoUSD, cobrado: P.filter(p => p.tipo === 'alquiler').reduce((s, p) => s + (+p.monto || 0), 0), cobradoUSD: P.filter(p => p.tipo === 'cuota').reduce((s, p) => s + (+p.monto || 0), 0), pasado: f <= hoy };
  });
  const sum = k => filas.reduce((s, x) => s + x[k], 0);
  // Lo que ya se debía antes de esta semana (sin contar lo que vence en la semana).
  const atrasado = autos.filter(c => c.tipo !== 'financiado').reduce((s, c) => s + (calc(c).debt || 0), 0);
  return { filas, esperado: sum('esperado'), cobrado: sum('cobrado'), esperadoUSD: sum('esperadoUSD'), cobradoUSD: sum('cobradoUSD'), deudaHoy: atrasado, desde: dias[0], hasta: dias[6] };
}
const pct = (a, b) => (b > 0 ? Math.min(100, Math.round(a / b * 100)) : (a > 0 ? 100 : 0));
const barra = (p, color) => '<div style="background:var(--soft);border-radius:6px;height:10px;overflow:hidden"><div style="width:' + p + '%;height:100%;background:' + color + '"></div></div>';

// Tarjeta chica para el Panel.
export function tarjetaMetaSemanal() {
  const m = metaSemanal();
  if (!m.esperado && !m.cobrado && !m.esperadoUSD) return '';
  const p = pct(m.cobrado, m.esperado);
  return '<div class="card tap" style="margin-bottom:12px" onclick="metaSemanalView()"><div class="row between"><b>Cobranza de la semana</b><span class="small muted">' + p + '%</span></div>' +
    '<div class="small muted" style="margin:2px 0 6px">Cobrado ' + money(m.cobrado) + ' de ' + money(m.esperado) + (m.esperadoUSD ? ' · cuotas ' + moneyUSD(m.cobradoUSD) + ' de ' + moneyUSD(m.esperadoUSD) : '') + '</div>' +
    barra(p, p >= 90 ? 'var(--ok)' : p >= 50 ? 'var(--warn)' : 'var(--bad)') + '</div>';
}

export function metaSemanalView() {
  const m = metaSemanal();
  const p = pct(m.cobrado, m.esperado);
  let acumE = 0, acumC = 0;
  let h = '<h3>Cobranza de la semana</h3><div class="small muted" style="margin-bottom:10px">Del lunes ' + m.desde.slice(8, 10) + '/' + m.desde.slice(5, 7) + ' al domingo ' + m.hasta.slice(8, 10) + '/' + m.hasta.slice(5, 7) + '. La meta es lo que vence esta semana; lo cobrado incluye pagos atrasados que entren.</div>' +
    '<div class="grid" style="margin-bottom:10px"><div class="kpi ' + (p >= 90 ? 'ok' : p >= 50 ? 'warn' : 'bad') + '"><div class="n">' + money(m.cobrado) + '</div><div class="l">Cobrado de ' + money(m.esperado) + ' (' + p + '%)</div></div>' +
    '<div class="kpi"><div class="n">' + money(Math.max(0, m.esperado - m.cobrado)) + '</div><div class="l">Falta para la meta</div></div></div>' +
    (m.esperadoUSD ? '<div class="card small" style="margin-bottom:10px">Cuotas en dólares: cobrado ' + moneyUSD(m.cobradoUSD) + ' de ' + moneyUSD(m.esperadoUSD) + '</div>' : '') +
    '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums" class="small"><thead><tr><th style="text-align:left;padding:4px">Día</th><th style="text-align:right;padding:4px">Vence</th><th style="text-align:right;padding:4px">Cobrado</th><th style="text-align:right;padding:4px">Acumulado</th></tr></thead><tbody>' +
    m.filas.map(x => { acumE += x.esperado; acumC += x.cobrado;
      return '<tr style="border-top:1px solid var(--line)' + (x.f === iso(today()) ? ';font-weight:700' : '') + '"><td style="padding:4px">' + x.dia + ' ' + x.f.slice(8, 10) + '</td><td style="text-align:right;padding:4px">' + (x.esperado ? money(x.esperado) : '—') + '</td><td style="text-align:right;padding:4px">' + (x.cobrado ? money(x.cobrado) : (x.pasado ? '$ 0' : '')) + '</td>' +
        '<td style="text-align:right;padding:4px;color:' + (!x.pasado ? 'var(--muted)' : acumC >= acumE ? 'var(--ok)' : 'var(--bad)') + '">' + (x.pasado ? money(acumC) + ' / ' + money(acumE) : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
    '<div class="small muted" style="margin-top:8px">Hoy los choferes deben en total ' + money(m.deudaHoy) + ' de alquileres (incluye lo que ya venció esta semana).</div>' +
    '<button class="btn sec block" style="margin-top:10px" onclick="closeModal()">Cerrar</button>';
  openModal(h);
}
