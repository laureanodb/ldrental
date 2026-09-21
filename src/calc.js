import { S } from './state.js';
import { VENC, TIPOS } from './constants.js';
import { days, parse, today, esc, fdate } from './utils.js';
import { settings } from './settings.js';
import { isSnoozed } from './snooze.js';

export const isContract = c => c.tipo === 'alquiler' || c.tipo === 'financiado';
export const activeCars = () => S.cars.filter(c => !c.vendido);
export const activeDrivers = () => S.drivers.filter(d => !d.inactivo);

export function finFinanciado(c) {
  if (c.tipo !== 'financiado' || !c.inicio || !c.cuotas) return null;
  const d = parse(c.inicio);
  d.setDate(d.getDate() + (+c.cuotas) * 7);
  return d;
}

export function calc(c) {
  const r = { debt: 0, late: 0, paid: 0, due: 0, weeks: 0, saldo: null, total: 0 };
  if (!isContract(c) || !c.inicio || !c.monto) return r;
  const d = days(parse(c.inicio), today());
  if (d < 0) return r;
  let weeks = Math.floor(d / 7) + 1;
  const kind = c.tipo === 'alquiler' ? 'alquiler' : 'cuota';
  if (c.tipo === 'financiado' && c.cuotas) weeks = Math.min(weeks, +c.cuotas);
  const paid = S.payments.filter(p => p.carId === c.id && p.tipo === kind && p.fecha >= c.inicio).reduce((a, p) => a + (+p.monto || 0), 0);
  const ajustes = (c.ajustesDeuda || []).reduce((a, x) => a + (+x.monto || 0), 0);
  r.weeks = weeks; r.paid = paid; r.due = weeks * c.monto; r.ajustes = ajustes;
  r.debt = Math.max(0, r.due - paid - ajustes); r.late = r.debt / c.monto;
  if (c.tipo === 'financiado') { r.total = +c.total || c.monto * (+c.cuotas || 0); r.saldo = Math.max(0, r.total - paid); }
  return r;
}

export function vs(f) {
  if (!f) return null;
  const d = days(today(), parse(f));
  if (d < 0) return { d, cls: 'bad', t: 'Vencido hace ' + (-d) + ' d' };
  if (d === 0) return { d, cls: 'bad', t: 'Vence hoy' };
  if (d <= settings.avisoWarn) return { d, cls: 'warn', t: 'Vence en ' + d + ' d' };
  if (d <= settings.avisoSoft) return { d, cls: 'soft', t: 'Vence en ' + d + ' d' };
  return { d, cls: 'ok', t: 'Vence ' + fdate(f) };
}

export function alertaService(c) {
  const km = +c.km || 0, prox = +c.proximoServiceKm || 0;
  if (!prox) return null;
  const restante = prox - km;
  if (restante <= 0) return { cls: 'bad', d: -1, t: 'Service vencido (' + km.toLocaleString('es-AR') + ' km)' };
  if (restante <= 1000) return { cls: 'warn', d: 7, t: 'Service en ' + restante.toLocaleString('es-AR') + ' km' };
  if (restante <= 3000) return { cls: 'soft', d: 20, t: 'Service en ' + restante.toLocaleString('es-AR') + ' km' };
  return null;
}
export function alerts() {
  const out = [];
  activeCars().forEach(c => VENC.forEach(([k, l]) => {
    const s = vs(c[k]); if (!s) return;
    const key = 'car:' + c.id + ':' + k; if (isSnoozed(key)) return;
    out.push(Object.assign({ who: c.patente || 'Auto sin patente', sub: l, kind: 'car', id: c.id, key }, s));
  }));
  activeCars().forEach(c => {
    const s = alertaService(c); if (!s) return;
    const key = 'car:' + c.id + ':service'; if (isSnoozed(key)) return;
    out.push(Object.assign({ who: c.patente || 'Auto sin patente', sub: 'Service', kind: 'car', id: c.id, key }, s));
  });
  activeDrivers().forEach(d => {
    const s = vs(d.licVenc); if (!s) return;
    const key = 'driver:' + d.id + ':lic'; if (isSnoozed(key)) return;
    out.push(Object.assign({ who: d.nombre, sub: 'Licencia', kind: 'driver', id: d.id, key }, s));
  });
  return out.sort((a, b) => a.d - b.d);
}
export const urgent = () => alerts().filter(a => a.d <= settings.avisoWarn);
export const driverName = id => { const d = S.drivers.find(x => x.id === id); return d ? d.nombre : ''; };
export const carById = id => S.cars.find(x => x.id === id);
export function driverDebt(id) {
  return S.cars.filter(c => c.choferId === id && isContract(c)).reduce((a, c) => a + calc(c).debt, 0);
}
export function carHistoryForDriver(driverId) {
  const out = [];
  S.cars.forEach(c => (c.historialChoferes || []).forEach(h => { if (h.choferId === driverId) out.push({ patente: c.patente, desde: h.desde, hasta: h.hasta }); }));
  return out.sort((a, b) => b.desde.localeCompare(a.desde));
}
export function diasEnTaller(c) {
  return (c.historialTaller || []).reduce((a, h) => a + Math.max(0, days(parse(h.desde), h.hasta ? parse(h.hasta) : today())), 0);
}
export function rentabilidadAuto(c) {
  const cobrado = S.payments.filter(p => p.carId === c.id).reduce((a, p) => a + (+p.monto || 0), 0);
  const gastos = S.gastos.filter(g => g.carId === c.id).reduce((a, g) => a + (+g.costo || 0), 0);
  return { cobrado, gastos, neta: cobrado - gastos, costoCompra: +c.costoCompra || 0 };
}
export function driverTotalPagado(driverId) {
  return S.payments.filter(p => p.choferId === driverId).reduce((a, p) => a + (+p.monto || 0), 0);
}
export function driverScore(driverId) {
  const cars = S.cars.filter(c => c.choferId === driverId && isContract(c) && c.inicio);
  if (!cars.length) return null;
  let totalWeeks = 0, lateWeeks = 0;
  cars.forEach(c => { const i = calc(c); totalWeeks += i.weeks; lateWeeks += i.late; });
  if (!totalWeeks) return null;
  return Math.max(0, Math.round((1 - lateWeeks / totalWeeks) * 100));
}
export function cobradoDelMes(offsetMeses) {
  const t = today();
  const d = new Date(t.getFullYear(), t.getMonth() - offsetMeses, 1);
  const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  return S.payments.filter(p => (p.fecha || '').slice(0, 7) === key).reduce((a, p) => a + (+p.monto || 0), 0);
}
export const plate = p => '<span class="plate">' + esc(p || 'Sin patente') + '</span>';
export const badge = (cls, t) => '<span class="badge b-' + cls + '">' + esc(t) + '</span>';
export const tipoBadge = t => badge(t === 'alquiler' ? 'info' : t === 'financiado' ? 'ok' : 'mute', TIPOS[t] || t);
