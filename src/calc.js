import { S } from './state.js';
import { VENC, TIPOS } from './constants.js';
import { days, parse, today, esc, fdate } from './utils.js';

export const isContract = c => c.tipo === 'alquiler' || c.tipo === 'financiado';

export function calc(c) {
  const r = { debt: 0, late: 0, paid: 0, due: 0, weeks: 0, saldo: null, total: 0 };
  if (!isContract(c) || !c.inicio || !c.monto) return r;
  const d = days(parse(c.inicio), today());
  if (d < 0) return r;
  let weeks = Math.floor(d / 7) + 1;
  const kind = c.tipo === 'alquiler' ? 'alquiler' : 'cuota';
  if (c.tipo === 'financiado' && c.cuotas) weeks = Math.min(weeks, +c.cuotas);
  const paid = S.payments.filter(p => p.carId === c.id && p.tipo === kind && p.fecha >= c.inicio).reduce((a, p) => a + (+p.monto || 0), 0);
  r.weeks = weeks; r.paid = paid; r.due = weeks * c.monto;
  r.debt = Math.max(0, r.due - paid); r.late = r.debt / c.monto;
  if (c.tipo === 'financiado') { r.total = +c.total || c.monto * (+c.cuotas || 0); r.saldo = Math.max(0, r.total - paid); }
  return r;
}

export function vs(f) {
  if (!f) return null;
  const d = days(today(), parse(f));
  if (d < 0) return { d, cls: 'bad', t: 'Vencido hace ' + (-d) + ' d' };
  if (d === 0) return { d, cls: 'bad', t: 'Vence hoy' };
  if (d <= 15) return { d, cls: 'warn', t: 'Vence en ' + d + ' d' };
  if (d <= 30) return { d, cls: 'soft', t: 'Vence en ' + d + ' d' };
  return { d, cls: 'ok', t: 'Vence ' + fdate(f) };
}

export function alerts() {
  const out = [];
  S.cars.forEach(c => VENC.forEach(([k, l]) => { const s = vs(c[k]); if (s) out.push(Object.assign({ who: c.patente || 'Auto sin patente', sub: l, kind: 'car', id: c.id }, s)); }));
  S.drivers.forEach(d => { const s = vs(d.licVenc); if (s) out.push(Object.assign({ who: d.nombre, sub: 'Licencia', kind: 'driver', id: d.id }, s)); });
  return out.sort((a, b) => a.d - b.d);
}
export const urgent = () => alerts().filter(a => a.d <= 15);
export const driverName = id => { const d = S.drivers.find(x => x.id === id); return d ? d.nombre : ''; };
export const carById = id => S.cars.find(x => x.id === id);
export function driverDebt(id) {
  return S.cars.filter(c => c.choferId === id && isContract(c)).reduce((a, c) => a + calc(c).debt, 0);
}
export const plate = p => '<span class="plate">' + esc(p || 'Sin patente') + '</span>';
export const badge = (cls, t) => '<span class="badge b-' + cls + '">' + esc(t) + '</span>';
export const tipoBadge = t => badge(t === 'alquiler' ? 'info' : t === 'financiado' ? 'ok' : 'mute', TIPOS[t] || t);
