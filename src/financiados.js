// Financiaciones: pago por mes en vez de por semana (con descuento o recargo) y
// arreglos grandes que se financian sumados a las cuotas. Sin dependencias de la
// app para que calc.js lo pueda usar sin importar en círculo.
import { parse, iso, today, days } from './utils.js';

export const esMensual = c => c && c.tipo === 'financiado' && c.frecuencia === 'mensual';
export const pctFrecuencia = c => +c.ajusteFrecuenciaPct || 0;
// Cuota mensual equivalente a la semanal (52 semanas / 12 meses) con el descuento o recargo.
export function montoMensual(c) {
  return Math.round((+c.monto || 0) * 52 / 12 * (1 + pctFrecuencia(c) / 100) * 100) / 100;
}
// Cantidad de cuotas mensuales que corresponden a las semanales del plan.
export const cuotasMensuales = c => Math.ceil((+c.cuotas || 0) * 12 / 52);
// Total del plan con el descuento o recargo del pago mensual.
export function totalPlan(c) {
  const base = +c.total || (+c.monto || 0) * (+c.cuotas || 0);
  return esMensual(c) ? Math.round(base * (1 + pctFrecuencia(c) / 100) * 100) / 100 : base;
}
// Fecha de la cuota mensual n (1 = el día de inicio).
export function fechaMes(inicio, n) {
  const d = parse(inicio), dia = d.getDate();
  const f = new Date(d.getFullYear(), d.getMonth() + n - 1, 1);
  f.setDate(Math.min(dia, new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate()));
  return f;
}
// Cuántos meses del plan ya empezaron hasta la fecha.
export function mesesVencidos(c, hasta) {
  const h = hasta || today();
  if (!c.inicio || days(parse(c.inicio), h) < 0) return 0;
  let n = 1;
  while (n < 600 && days(fechaMes(c.inicio, n + 1), h) >= 0) n++;
  return n;
}

/* ---------- Arreglos financiados ---------- */
// Cada cargo se paga en sus propias cuotas (semanales o mensuales, como el plan) desde su fecha.
export function cargoVencido(c, x, hasta) {
  const h = hasta || today();
  if (!x.desde || days(parse(x.desde), h) < 0) return 0;
  const n = +x.cuotas || 1;
  const periodos = esMensual(c) ? mesesVencidos({ inicio: x.desde }, h) : Math.floor(days(parse(x.desde), h) / 7) + 1;
  return Math.min(n, periodos) * (+x.monto || 0) / n;
}
export const cargosFinanciados = c => (c && c.tipo === 'financiado' ? c.cargosFinanciados || [] : []);
export const totalCargos = c => cargosFinanciados(c).reduce((a, x) => a + (+x.monto || 0), 0);
export const cargosVencidos = (c, hasta) => cargosFinanciados(c).reduce((a, x) => a + cargoVencido(c, x, hasta), 0);
// Lo que ya debería haber pagado a la fecha en un plan mensual (sin los cargos).
export function vencidoMensual(c, hasta) {
  return Math.min(mesesVencidos(c, hasta) * montoMensual(c), totalPlan(c));
}
export const hoyIso = () => iso(today());
