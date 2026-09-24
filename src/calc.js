import { S } from './state.js';
import { VENC, TIPOS, MANTENIMIENTO_ITEMS, COLS } from './constants.js';
import { days, parse, today, iso, esc, fdate, money, num1 } from './utils.js';
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

/* Plan de mantenimiento: [{item, label, intervaloKm, intervaloMeses, ultimoKm, ultimaFecha}] por auto. */
export function planMantenimientoDefault(km, fecha) {
  return MANTENIMIENTO_ITEMS.map(([item, label, intervaloKm, intervaloMeses]) => ({
    item, label, intervaloKm: intervaloKm || null, intervaloMeses: intervaloMeses || null, ultimoKm: +km || 0, ultimaFecha: fecha,
  }));
}
function clasificarVencimiento(restanteKm, restanteDias) {
  if ((restanteKm != null && restanteKm <= 0) || (restanteDias != null && restanteDias <= 0)) return 'bad';
  if ((restanteKm != null && restanteKm <= 1000) || (restanteDias != null && restanteDias <= settings.avisoWarn)) return 'warn';
  if ((restanteKm != null && restanteKm <= 3000) || (restanteDias != null && restanteDias <= settings.avisoSoft)) return 'soft';
  return 'ok';
}
export function estadoPlanItem(c, p) {
  const kmActual = +c.km || 0;
  let restanteKm = null, restanteDias = null;
  if (p.intervaloKm) restanteKm = (+p.ultimoKm || 0) + (+p.intervaloKm) - kmActual;
  if (p.intervaloMeses && p.ultimaFecha) {
    const venc = parse(p.ultimaFecha); venc.setMonth(venc.getMonth() + (+p.intervaloMeses));
    restanteDias = days(today(), venc);
  }
  return { cls: clasificarVencimiento(restanteKm, restanteDias), restanteKm, restanteDias };
}
export function estadoGeneralAuto(c) {
  const orden = { ok: 0, soft: 1, warn: 2, bad: 3 };
  let peor = 'ok';
  const marcar = cls => { if (orden[cls] > orden[peor]) peor = cls; };
  VENC.forEach(v => { const s = vs(c[v[0]]); if (s) marcar(s.cls); });
  (c.mantenimientoPlan || []).forEach(p => {
    if (!p.intervaloKm && !p.intervaloMeses) return;
    marcar(estadoPlanItem(c, p).cls);
  });
  if (S.siniestros.some(s => s.carId === c.id && s.estado !== 'cerrado')) marcar('bad');
  if (S.multas.some(m => m.carId === c.id && (m.estado === 'pendiente' || m.estado === 'vencida'))) marcar('warn');
  return peor;
}
export function textoRestante(e) {
  if (e.cls === 'ok') return 'Al día';
  if (e.cls === 'bad') return 'Vencido';
  const partes = [];
  if (e.restanteKm != null && e.restanteKm > 0) partes.push(e.restanteKm.toLocaleString('es-AR') + ' km');
  if (e.restanteDias != null && e.restanteDias > 0) partes.push(e.restanteDias + ' d');
  return 'En ' + (partes.join(' / ') || 'breve');
}
export function textoEstadoItem(label, e) {
  if (e.cls === 'bad') return label + ' vencido';
  const partes = [];
  if (e.restanteKm != null && e.restanteKm > 0) partes.push(e.restanteKm.toLocaleString('es-AR') + ' km');
  if (e.restanteDias != null && e.restanteDias > 0) partes.push(e.restanteDias + ' d');
  return label + ' en ' + (partes.join(' / ') || 'breve');
}
const CLS_ORDEN = { bad: 0, warn: 1, soft: 2, ok: 3 };
export function peorItemMantenimiento(c) {
  let peor = null;
  (c.mantenimientoPlan || []).forEach(p => {
    if (!p.intervaloKm && !p.intervaloMeses) return;
    const e = estadoPlanItem(c, p);
    if (e.cls === 'ok') return;
    if (!peor || CLS_ORDEN[e.cls] < CLS_ORDEN[peor.e.cls]) peor = { p, e };
  });
  if (!peor) return null;
  return { cls: peor.e.cls, t: textoEstadoItem(peor.p.label || peor.p.item, peor.e), item: peor.p.item };
}
export function agendaMantenimiento() {
  const out = [];
  activeCars().forEach(c => {
    (c.mantenimientoPlan || []).forEach(p => {
      if (!p.intervaloKm && !p.intervaloMeses) return;
      const e = estadoPlanItem(c, p);
      if (e.cls === 'ok' || e.cls === 'soft') return;
      out.push({ c, p, e, t: textoEstadoItem(p.label || p.item, e) });
    });
  });
  return out.sort((a, b) => CLS_ORDEN[a.e.cls] - CLS_ORDEN[b.e.cls]);
}
export function fichaTecnica(c) {
  const porItem = {};
  S.mantenimientos.filter(m => m.carId === c.id && (m.marca || m.especificacion)).forEach(m => {
    const cur = porItem[m.item];
    if (!cur || m.fecha > cur.fecha) porItem[m.item] = m;
  });
  return Object.values(porItem).map(m => {
    const planItem = (c.mantenimientoPlan || []).find(p => p.item === m.item);
    return { item: m.item, label: m.label || (planItem && planItem.label) || m.item, marca: m.marca, especificacion: m.especificacion, fecha: m.fecha };
  }).sort((a, b) => String(a.label).localeCompare(String(b.label)));
}
export function mantenimientoVencidosCount() {
  let n = 0;
  activeCars().forEach(c => (c.mantenimientoPlan || []).forEach(p => {
    if (!p.intervaloKm && !p.intervaloMeses) return;
    if (estadoPlanItem(c, p).cls === 'bad') n++;
  }));
  return n;
}
export function garantiasPorVencer() {
  const out = [];
  S.mantenimientos.forEach(m => {
    if (!m.garantiaMeses && !m.garantiaKm) return;
    const c = carById(m.carId);
    if (!c || c.vendido) return;
    let restanteDias = null, restanteKm = null;
    if (m.garantiaMeses) { const venc = parse(m.fecha); venc.setMonth(venc.getMonth() + (+m.garantiaMeses)); restanteDias = days(today(), venc); }
    if (m.garantiaKm) restanteKm = (+m.km || 0) + (+m.garantiaKm) - (+c.km || 0);
    const cls = clasificarVencimiento(restanteKm, restanteDias);
    if (cls === 'ok') return;
    out.push({ m, c, cls, restanteKm, restanteDias });
  });
  return out.sort((a, b) => CLS_ORDEN[a.cls] - CLS_ORDEN[b.cls]);
}
export function rankingTalleresMantenimiento() {
  const porTaller = {};
  S.mantenimientos.filter(m => m.proveedorId).forEach(m => {
    if (!porTaller[m.proveedorId]) porTaller[m.proveedorId] = { proveedorId: m.proveedorId, cantidad: 0, total: 0 };
    porTaller[m.proveedorId].cantidad++; porTaller[m.proveedorId].total += (+m.costo || 0);
  });
  return Object.values(porTaller).map(x => {
    const p = S.proveedores.find(v => v.id === x.proveedorId);
    return Object.assign(x, { nombre: p ? p.nombre : 'Proveedor eliminado' });
  }).sort((a, b) => b.total - a.total);
}
export function rankingItemsMantenimiento() {
  const porItem = {};
  S.mantenimientos.forEach(m => {
    const k = m.item || 'otro';
    if (!porItem[k]) porItem[k] = { item: k, label: m.label || k, cantidad: 0, total: 0 };
    porItem[k].cantidad++; porItem[k].total += (+m.costo || 0);
  });
  return Object.values(porItem).sort((a, b) => b.total - a.total);
}
export function proporcionMantenimiento() {
  const preventivo = S.mantenimientos.filter(m => m.tipo !== 'correctivo').length;
  const correctivo = S.mantenimientos.filter(m => m.tipo === 'correctivo').length;
  return { preventivo, correctivo, total: preventivo + correctivo };
}
export function gastoMantenimientoDelMes(offsetMeses) {
  const t = today();
  const d = new Date(t.getFullYear(), t.getMonth() - offsetMeses, 1);
  const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  return S.mantenimientos.filter(m => (m.fecha || '').slice(0, 7) === key).reduce((a, m) => a + (+m.costo || 0), 0);
}
export function saldoDeposito(driverId) {
  return S.depositos.filter(x => x.driverId === driverId).reduce((a, x) => a + (+x.monto || 0), 0);
}
export function depositosDeChofer(driverId) {
  return S.depositos.filter(x => x.driverId === driverId).sort((a, b) => b.fecha.localeCompare(a.fecha));
}
export function multasPendientesChofer(driverId) {
  return S.multas.filter(m => m.choferId === driverId && (m.estado === 'pendiente' || m.estado === 'vencida')).reduce((a, m) => a + (+m.monto || 0), 0);
}
export function puntosLicencia(driverId) {
  const desde = new Date(); desde.setMonth(desde.getMonth() - (settings.puntosVigenciaMeses || 24));
  const desdeIso = iso(desde);
  return S.multas.filter(m => m.choferId === driverId && m.fecha >= desdeIso && m.resultadoDescargo !== 'aceptado').reduce((a, m) => a + (+m.puntos || 0), 0);
}
export function alertaFotoControl(c) {
  const fotos = (c.files || []).filter(f => !f.link && f.cat === 'fotos');
  if (!fotos.length) return null;
  const ultima = fotos.reduce((a, f) => (f.fecha > a ? f.fecha : a), fotos[0].fecha);
  const restante = settings.fotoControlDias - days(parse(ultima), today());
  const cls = clasificarVencimiento(null, restante);
  if (cls === 'ok') return null;
  return { cls, restante };
}
export function kmUltimaSemana(c) {
  const hist = (c.kmHistorial || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (hist.length < 2) return null;
  const ultima = hist[hist.length - 1];
  const dLimite = parse(ultima.fecha); dLimite.setDate(dLimite.getDate() - 7);
  const fechaLimite = iso(dLimite);
  const anterior = [...hist].reverse().find(h => h.fecha <= fechaLimite) || hist[0];
  const dias = days(parse(anterior.fecha), parse(ultima.fecha));
  if (dias <= 0) return null;
  return Math.round(((+ultima.km || 0) - (+anterior.km || 0)) / dias * 7);
}
export function sugerirAptoFinanciar(driverId) {
  const score = driverScore(driverId);
  const hist = carHistoryForDriver(driverId);
  const desde = hist.reduce((min, h) => (!min || h.desde < min ? h.desde : min), null);
  const antiguedadDias = desde ? days(parse(desde), today()) : 0;
  const sancionesRecientes = S.sanciones.some(s => s.driverId === driverId && days(parse(s.fecha), today()) <= 180);
  return { cumple: score != null && score >= 80 && antiguedadDias >= 90 && !sancionesRecientes, score, antiguedadDias, sancionesRecientes };
}
export function alerts() {
  const out = [];
  activeCars().forEach(c => VENC.forEach(([k, l]) => {
    const s = vs(c[k]); if (!s) return;
    const key = 'car:' + c.id + ':' + k; if (isSnoozed(key)) return;
    out.push(Object.assign({ who: c.patente || 'Auto sin patente', sub: l, kind: 'car', id: c.id, key }, s));
  }));
  activeCars().forEach(c => {
    (c.mantenimientoPlan || []).forEach(p => {
      if (!p.intervaloKm && !p.intervaloMeses) return;
      const e = estadoPlanItem(c, p); if (e.cls === 'ok') return;
      const key = 'car:' + c.id + ':mant:' + p.item; if (isSnoozed(key)) return;
      const d = e.cls === 'bad' ? -1 : (e.restanteDias != null ? e.restanteDias : (e.cls === 'warn' ? 7 : 20));
      out.push({ who: c.patente || 'Auto sin patente', sub: p.label || p.item, kind: 'car', id: c.id, key, d, cls: e.cls, t: textoEstadoItem(p.label || p.item, e) });
    });
  });
  activeDrivers().forEach(d => {
    const s = vs(d.licVenc); if (!s) return;
    const key = 'driver:' + d.id + ':lic'; if (isSnoozed(key)) return;
    out.push(Object.assign({ who: d.nombre, sub: 'Licencia', kind: 'driver', id: d.id, key }, s));
  });
  S.multas.filter(m => m.estado === 'pendiente' || m.estado === 'vencida').forEach(m => {
    const s = vs(m.fechaLimitePago); if (!s) return;
    const key = 'multa:' + m.id; if (isSnoozed(key)) return;
    const auto = carById(m.carId);
    out.push(Object.assign({ who: (auto && auto.patente) || 'Auto', sub: 'Multa pendiente de pago', kind: 'multa', id: m.id, carId: m.carId, key }, s));
  });
  activeDrivers().forEach(d => {
    const objetivo = +d.depositoObjetivo || 0; if (!objetivo) return;
    const saldo = saldoDeposito(d.id);
    const umbral = objetivo * (settings.depositoAvisoPct / 100);
    if (saldo >= umbral) return;
    const key = 'driver:' + d.id + ':deposito'; if (isSnoozed(key)) return;
    out.push({ who: d.nombre, sub: 'Depósito de garantía bajo', kind: 'driver', id: d.id, key, d: 0, cls: saldo <= 0 ? 'bad' : 'warn', t: 'Depósito: ' + money(saldo) + ' de ' + money(objetivo) });
  });
  activeDrivers().forEach(d => {
    const pend = multasPendientesChofer(d.id);
    if (pend < settings.multaUmbral) return;
    const key = 'driver:' + d.id + ':multaumbral'; if (isSnoozed(key)) return;
    out.push({ who: d.nombre, sub: 'Multas acumuladas superan el límite', kind: 'driver', id: d.id, key, d: 0, cls: 'bad', t: money(pend) + ' en multas pendientes' });
  });
  activeDrivers().forEach(d => {
    const pts = puntosLicencia(d.id);
    if (pts < settings.puntosLimite) return;
    const key = 'driver:' + d.id + ':puntoslicencia'; if (isSnoozed(key)) return;
    out.push({ who: d.nombre, sub: 'Puntos de licencia acumulados', kind: 'driver', id: d.id, key, d: 0, cls: 'bad', t: pts + ' de ' + settings.puntosLimite + ' puntos' });
  });
  activeDrivers().forEach(d => {
    if (!driverEnRiesgo(d.id)) return;
    const key = 'driver:' + d.id + ':riesgo'; if (isSnoozed(key)) return;
    out.push({ who: d.nombre, sub: 'Chofer en riesgo por atrasos', kind: 'driver', id: d.id, key, d: 0, cls: 'bad', t: num1(driverWeeksInfo(d.id).lateWeeks) + ' semanas de atraso' });
  });
  activeCars().forEach(c => {
    const f = alertaFotoControl(c); if (!f) return;
    const key = 'car:' + c.id + ':foto'; if (isSnoozed(key)) return;
    const d = f.cls === 'bad' ? -1 : f.restante;
    out.push({ who: c.patente || 'Auto sin patente', sub: 'Fotos de control', kind: 'car', id: c.id, key, d, cls: f.cls, t: f.cls === 'bad' ? 'Sin fotos hace ' + (-f.restante) + ' d' : 'Actualizar fotos en ' + f.restante + ' d' });
  });
  activeCars().forEach(c => {
    const semanal = kmUltimaSemana(c);
    if (semanal == null || semanal <= settings.kmSemanaEsperado) return;
    const key = 'car:' + c.id + ':sobrekm'; if (isSnoozed(key)) return;
    out.push({ who: c.patente || 'Auto sin patente', sub: 'Sobrekilometraje', kind: 'car', id: c.id, key, d: 20, cls: 'warn', t: semanal.toLocaleString('es-AR') + ' km/semana (esperado ' + settings.kmSemanaEsperado.toLocaleString('es-AR') + ')' });
  });
  activeDrivers().forEach(d => {
    if (d.prospecto) return;
    const cars = S.cars.filter(c => c.choferId === d.id && isContract(c) && c.inicio);
    if (!cars.length) return;
    const ultimoPago = S.payments.filter(p => p.choferId === d.id).reduce((max, p) => (!max || p.fecha > max ? p.fecha : max), null);
    const inicioMasViejo = cars.reduce((min, c) => (!min || c.inicio < min ? c.inicio : min), null);
    const desde = ultimoPago || inicioMasViejo;
    if (!desde) return;
    const diasSinPago = days(parse(desde), today());
    if (diasSinPago < 14) return;
    const key = 'driver:' + d.id + ':inactivo'; if (isSnoozed(key)) return;
    out.push({ who: d.nombre, sub: 'Posible chofer inactivo', kind: 'driver', id: d.id, key, d: 0, cls: 'bad', t: 'Sin cobros hace ' + diasSinPago + ' días' });
  });
  S.proveedores.filter(p => !p.inactivo && p.deudaPendiente).forEach(p => {
    const key = 'proveedor:' + p.id + ':deuda'; if (isSnoozed(key)) return;
    const s = p.fechaPago ? vs(p.fechaPago) : { d: 0, cls: 'warn', t: 'Pago pendiente' };
    out.push(Object.assign({ who: p.nombre, sub: 'Cuenta por pagar: ' + money(p.deudaPendiente), kind: 'proveedor', id: p.id, key }, s));
  });
  activeCars().forEach(c => {
    if (c.tipo !== 'disponible' || !c.disponibleDesde) return;
    const dias = days(parse(c.disponibleDesde), today());
    if (dias < settings.autoParadoDias) return;
    const key = 'car:' + c.id + ':parado'; if (isSnoozed(key)) return;
    out.push({ who: c.patente || 'Auto sin patente', sub: 'Auto parado sin generar ingresos', kind: 'car', id: c.id, key, d: 0, cls: 'warn', t: dias + ' días disponible sin asignar' });
  });
  S.recordatorios.filter(r => !r.hecho && r.fecha).forEach(r => {
    const s = vs(r.fecha); if (!s) return;
    const key = 'recordatorio:' + r.id; if (isSnoozed(key)) return;
    out.push(Object.assign({ who: r.texto, sub: 'Recordatorio', kind: 'recordatorio', id: r.id, key }, s));
  });
  activeCars().forEach(c => {
    if (!alertaRoturaProbable(c)) return;
    const key = 'car:' + c.id + ':rotura'; if (isSnoozed(key)) return;
    out.push({ who: c.patente || 'Auto sin patente', sub: 'Posible rotura', kind: 'car', id: c.id, key, d: 10, cls: 'warn', t: 'Gasto de mantenimiento en aumento' });
  });
  activeDrivers().forEach(d => {
    if (d.prospecto || !driverCambioPatron(d.id)) return;
    const key = 'driver:' + d.id + ':cambiopatron'; if (isSnoozed(key)) return;
    out.push({ who: d.nombre, sub: 'Empezó a atrasarse', kind: 'driver', id: d.id, key, d: 15, cls: 'soft', t: 'Antes cumplía y ahora tiene atraso' });
  });
  activeCars().forEach(c => {
    if (!autoBajaRentabilidadSostenida(c)) return;
    const key = 'car:' + c.id + ':bajarenta'; if (isSnoozed(key)) return;
    out.push({ who: c.patente || 'Auto sin patente', sub: 'Rentabilidad negativa sostenida', kind: 'car', id: c.id, key, d: 20, cls: 'warn', t: 'Gasta más de lo que cobra hace tiempo' });
  });
  const diasSinCobros = diasSinCobrosGlobal();
  if (diasSinCobros != null && diasSinCobros >= 7) {
    const key = 'sistema:sincobros'; if (!isSnoozed(key)) {
      out.push({ who: 'Sin cobros cargados', sub: 'Recordatorio', kind: 'sistema', id: '', key, d: 0, cls: 'soft', t: 'Hace ' + diasSinCobros + ' días que no se carga ningún cobro' });
    }
  }
  return out.sort((a, b) => a.d - b.d);
}
export function alertaRoturaProbable(c) {
  const MH = S.mantenimientos.filter(m => m.carId === c.id).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (MH.length < 3) return false;
  const ultimos = MH.slice(-3).map(m => +m.costo || 0);
  return ultimos[0] > 0 && ultimos[0] < ultimos[1] && ultimos[1] < ultimos[2];
}
export function driverCambioPatron(driverId) {
  const score = driverScore(driverId);
  if (score == null || score < 85) return false;
  const { lateWeeks } = driverWeeksInfo(driverId);
  return lateWeeks >= 1 && lateWeeks < settings.riesgoSemanas;
}
export function autoBajaRentabilidadSostenida(c) {
  if (c.tipo === 'financiado' || !c.inicio) return false;
  if (days(parse(c.inicio), today()) < 90) return false;
  const r = rentabilidadAuto(c);
  return r.neta != null && r.neta < 0;
}
export function diasSinCobrosGlobal() {
  if (!S.payments.length) return null;
  const ultima = S.payments.reduce((max, p) => (!max || p.fecha > max ? p.fecha : max), null);
  return ultima ? days(parse(ultima), today()) : null;
}
export const urgent = () => alerts().filter(a => a.d <= settings.avisoWarn);
export const driverName = id => { const d = S.drivers.find(x => x.id === id); return d ? d.nombre : ''; };
export const carById = id => S.cars.find(x => x.id === id);
export function driverDebt(id) {
  return S.cars.filter(c => c.choferId === id && isContract(c)).reduce((a, c) => a + calc(c).debt, 0);
}
export function choferEnFecha(c, fecha) {
  const h = (c.historialChoferes || []).find(x => x.desde <= fecha && (!x.hasta || fecha <= x.hasta));
  if (h) return h.choferId;
  if (c.choferId && (!c.inicio || fecha >= c.inicio)) return c.choferId;
  return '';
}
export function carHistoryForDriver(driverId) {
  const out = [];
  S.cars.forEach(c => (c.historialChoferes || []).forEach(h => { if (h.choferId === driverId) out.push({ patente: c.patente, desde: h.desde, hasta: h.hasta }); }));
  return out.sort((a, b) => b.desde.localeCompare(a.desde));
}
export function diasEnTaller(c) {
  return (c.historialTaller || []).reduce((a, h) => a + Math.max(0, days(parse(h.desde), h.hasta ? parse(h.hasta) : today())), 0);
}
export function resumenAnual(year) {
  const inicio = year + '-01-01', fin = year + '-12-31';
  const enRango = S.payments.filter(p => p.fecha >= inicio && p.fecha <= fin);
  const cobrado = enRango.filter(p => p.tipo !== 'cuota').reduce((a, p) => a + (+p.monto || 0), 0);
  const cobradoUSD = enRango.filter(p => p.tipo === 'cuota').reduce((a, p) => a + (+p.monto || 0), 0);
  const gastos = S.gastos.filter(g => g.fecha >= inicio && g.fecha <= fin).reduce((a, g) => a + (+g.costo || 0), 0) +
    S.mantenimientos.filter(m => m.fecha >= inicio && m.fecha <= fin).reduce((a, m) => a + (+m.costo || 0), 0);
  return { year, cobrado, cobradoUSD, gastos, neta: cobrado - gastos };
}
export function financiacionesProximas(semanas) {
  return activeCars().filter(c => c.tipo === 'financiado' && c.cuotas && c.choferId).map(c => {
    const i = calc(c);
    return { c, restantes: Math.max(0, (+c.cuotas) - i.weeks) };
  }).filter(x => x.restantes > 0 && x.restantes <= semanas).sort((a, b) => a.restantes - b.restantes);
}
export function cronogramaCuotas(c) {
  if (c.tipo !== 'financiado' || !c.inicio || !c.cuotas || !c.monto) return [];
  const i = calc(c);
  const cubierto = i.paid + (i.ajustes || 0);
  const inicio = parse(c.inicio);
  const out = [];
  for (let n = 1; n <= +c.cuotas; n++) {
    const f = new Date(inicio); f.setDate(f.getDate() + (n - 1) * 7);
    const cubiertoCuota = Math.max(0, Math.min(cubierto - (n - 1) * c.monto, c.monto));
    let estado;
    if (cubiertoCuota >= c.monto) estado = 'pagada';
    else if (cubiertoCuota > 0) estado = 'parcial';
    else estado = days(today(), f) < 0 ? 'atrasada' : 'pendiente';
    out.push({ numero: n, fecha: iso(f), monto: c.monto, estado });
  }
  return out;
}
export function financiacionesCompletadasSinTransferir() {
  return activeCars().filter(c => {
    if (c.tipo !== 'financiado' || !c.cuotas || c.tituloTransferido) return false;
    const i = calc(c);
    return i.saldo != null && i.saldo <= 0;
  });
}
export function promedioAnticipacionVenc(tipo) {
  const registros = [];
  S.cars.forEach(c => (c.vencHistorial || []).forEach(h => {
    if (h.tipo !== tipo || !h.fechaAnterior || !h.cambiado) return;
    registros.push(days(parse(h.cambiado), parse(h.fechaAnterior)));
  }));
  if (registros.length < 2) return null;
  return Math.round(registros.reduce((a, b) => a + b, 0) / registros.length);
}
export function sugerenciasAnticipacionVenc() {
  return VENC.map(v => ({ tipo: v[0], label: v[1], dias: promedioAnticipacionVenc(v[0]) })).filter(x => x.dias != null);
}
export function rentabilidadPorChofer() {
  return activeCars().filter(c => c.choferId && c.tipo !== 'financiado').map(c => Object.assign({ c, driverId: c.choferId }, rentabilidadAuto(c))).sort((a, b) => b.neta - a.neta);
}
export function rentabilidadAuto(c) {
  const cobrado = S.payments.filter(p => p.carId === c.id).reduce((a, p) => a + (+p.monto || 0), 0);
  const gastos = S.gastos.filter(g => g.carId === c.id).reduce((a, g) => a + (+g.costo || 0), 0) +
    S.mantenimientos.filter(m => m.carId === c.id).reduce((a, m) => a + (+m.costo || 0), 0);
  const moneda = c.tipo === 'financiado' ? 'USD' : 'ARS';
  return { cobrado, gastos, neta: moneda === 'USD' ? null : cobrado - gastos, costoCompra: +c.costoCompra || 0, moneda };
}
export function resultadoVenta(c) {
  if (!c.vendido || !c.precioVenta) return null;
  const rent = rentabilidadAuto(c);
  if (rent.moneda === 'USD') return null;
  const resultado = rent.cobrado - rent.gastos - rent.costoCompra + (+c.precioVenta || 0);
  return { resultado, cobrado: rent.cobrado, gastos: rent.gastos, costoCompra: rent.costoCompra, precioVenta: +c.precioVenta || 0 };
}
export function puntoEquilibrio(c) {
  if (c.tipo === 'financiado') return null;
  const costoCompra = +c.costoCompra || 0;
  if (!costoCompra) return null;
  const cobrado = rentabilidadAuto(c).cobrado;
  const falta = costoCompra - cobrado;
  if (falta <= 0) return { recuperado: true, falta: 0, semanas: 0 };
  const monto = +c.monto || 0;
  return { recuperado: false, falta, semanas: monto > 0 ? Math.ceil(falta / monto) : null };
}
export function gastoMantenimientoAuto(c) {
  return S.mantenimientos.filter(m => m.carId === c.id).reduce((a, m) => a + (+m.costo || 0), 0);
}
export function autosConGastoExcesivo() {
  const cars = activeCars().filter(c => !c.aReemplazar);
  const gastos = cars.map(c => ({ c, gasto: gastoMantenimientoAuto(c) }));
  const conGasto = gastos.filter(x => x.gasto > 0);
  if (!conGasto.length) return [];
  const promedio = conGasto.reduce((a, x) => a + x.gasto, 0) / conGasto.length;
  if (!promedio) return [];
  return conGasto.filter(x => x.gasto > promedio * 2).map(x => ({ c: x.c, gasto: x.gasto, promedio })).sort((a, b) => b.gasto - a.gasto);
}
export function planRenovacionFlota() {
  const t = today();
  const cars = activeCars().filter(c => c.aReemplazar || c.fechaRenovacionPlan);
  return cars.map(c => {
    const diasPlan = c.fechaRenovacionPlan ? days(t, parse(c.fechaRenovacionPlan)) : null;
    return { c, diasPlan, motivo: c.motivoReemplazo };
  }).sort((a, b) => {
    if (a.diasPlan == null && b.diasPlan == null) return 0;
    if (a.diasPlan == null) return 1;
    if (b.diasPlan == null) return -1;
    return a.diasPlan - b.diasPlan;
  });
}
export function gastosPorCategoria() {
  const out = {};
  S.gastos.forEach(g => { const k = g.categoria || 'otro'; out[k] = (out[k] || 0) + (+g.costo || 0); });
  return out;
}
export function mapaCalorGastos(nMeses) {
  const t = today();
  const meses = [];
  for (let i = nMeses - 1; i >= 0; i--) {
    const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
    meses.push({ key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: d.toLocaleDateString('es-AR', { month: 'short' }) });
  }
  const cars = activeCars();
  const filas = cars.map(c => {
    const gastosAuto = S.gastos.filter(g => g.carId === c.id).concat(S.mantenimientos.filter(m => m.carId === c.id));
    const valores = meses.map(m => gastosAuto.filter(g => (g.fecha || '').slice(0, 7) === m.key).reduce((a, g) => a + (+g.costo || 0), 0));
    return { c, valores, total: valores.reduce((a, v) => a + v, 0) };
  }).filter(f => f.total > 0).sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...filas.flatMap(f => f.valores));
  return { meses, filas, max };
}
const RATING_ORDEN = { bueno: 0, regular: 1, malo: 2 };
export function proveedoresActivos() {
  return S.proveedores.filter(p => !p.inactivo).slice().sort((a, b) => {
    if (Boolean(a.preferido) !== Boolean(b.preferido)) return a.preferido ? -1 : 1;
    const ra = RATING_ORDEN[a.rating] != null ? RATING_ORDEN[a.rating] : 3;
    const rb = RATING_ORDEN[b.rating] != null ? RATING_ORDEN[b.rating] : 3;
    return ra !== rb ? ra - rb : String(a.nombre).localeCompare(String(b.nombre));
  });
}
export function gastoTotalProveedor(proveedorId) {
  const p = S.proveedores.find(x => x.id === proveedorId);
  if (!p) return 0;
  const deGastos = S.gastos.filter(g => g.proveedor === p.nombre).reduce((a, g) => a + (+g.costo || 0), 0);
  const deMant = S.mantenimientos.filter(m => m.proveedorId === proveedorId).reduce((a, m) => a + (+m.costo || 0), 0);
  const deSin = S.siniestros.filter(s => s.proveedorId === proveedorId).reduce((a, s) => a + (+s.costoTaller || 0), 0);
  return deGastos + deMant + deSin;
}
export function siniestrosDeAuto(c) {
  return S.siniestros.filter(s => s.carId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
}
export function rankingSiniestrosChoferes() {
  const porChofer = {};
  S.siniestros.forEach(s => {
    if (!s.choferId) return;
    if (!porChofer[s.choferId]) porChofer[s.choferId] = { driverId: s.choferId, cantidad: 0 };
    porChofer[s.choferId].cantidad++;
  });
  return Object.values(porChofer).map(x => Object.assign(x, { nombre: driverName(x.driverId) })).sort((a, b) => b.cantidad - a.cantidad);
}
export function comparativaChoferes() {
  return S.drivers.filter(d => !d.inactivo && !d.prospecto).map(d => {
    const hist = carHistoryForDriver(d.id);
    const desde = hist.reduce((min, h) => (!min || h.desde < min ? h.desde : min), null);
    const antiguedadDias = desde ? days(parse(desde), today()) : 0;
    const monedaDeuda = S.cars.some(c => c.choferId === d.id && c.tipo === 'financiado') ? 'USD' : 'ARS';
    return { driverId: d.id, nombre: d.nombre, antiguedadDias, totalPagado: driverTotalPagado(d.id), deuda: driverDebt(d.id), monedaDeuda, score: driverScore(d.id) };
  });
}
export function comparativaAutos() {
  return activeCars().filter(c => c.tipo !== 'financiado').map(c => {
    const rent = rentabilidadAuto(c);
    return { c, neta: rent.neta, cobrado: rent.cobrado, gastos: rent.gastos, km: +c.km || 0, diasTaller: diasEnTaller(c) };
  });
}
export function resumenGeneral() {
  const cobrado = S.payments.filter(p => p.tipo !== 'cuota').reduce((a, p) => a + (+p.monto || 0), 0);
  const cobradoUSD = S.payments.filter(p => p.tipo === 'cuota').reduce((a, p) => a + (+p.monto || 0), 0);
  const gastos = S.gastos.reduce((a, g) => a + (+g.costo || 0), 0) + S.mantenimientos.reduce((a, m) => a + (+m.costo || 0), 0);
  const deudaTotal = activeCars().filter(c => isContract(c) && c.tipo !== 'financiado').reduce((a, c) => a + calc(c).debt, 0);
  const deudaTotalUSD = activeCars().filter(c => c.tipo === 'financiado').reduce((a, c) => a + calc(c).debt, 0);
  return {
    cobrado, cobradoUSD, gastos, neta: cobrado - gastos, deudaTotal, deudaTotalUSD,
    autosActivos: activeCars().length,
    choferesActivos: S.drivers.filter(d => !d.inactivo && !d.prospecto).length,
  };
}
export function rankingRoiAutos() {
  return activeCars().filter(c => c.tipo !== 'financiado' && c.costoCompra).map(c => {
    const r = rentabilidadAuto(c);
    return { c, roi: r.neta != null ? Math.round(r.neta / c.costoCompra * 1000) / 10 : null, neta: r.neta };
  }).filter(x => x.roi != null).sort((a, b) => b.roi - a.roi);
}
export function porcentajePerdidaGanancia() {
  const rows = activeCars().filter(c => c.tipo !== 'financiado').map(c => rentabilidadAuto(c)).filter(r => r.neta != null);
  if (!rows.length) return null;
  const ganancia = rows.filter(r => r.neta >= 0).length;
  return { total: rows.length, ganancia, perdida: rows.length - ganancia, pctGanancia: Math.round(ganancia / rows.length * 100) };
}
export function saludChoferes() {
  return S.drivers.filter(d => !d.inactivo && !d.prospecto).map(d => {
    const multas = multasDeChofer(d.id).filter(m => m.estado === 'pendiente' || m.estado === 'vencida').length;
    const siniestros = S.siniestros.filter(s => s.choferId === d.id).length;
    return { driverId: d.id, nombre: d.nombre, score: driverScore(d.id), deuda: driverDebt(d.id), multas, siniestros };
  });
}
export function alertasTendencia() {
  const hoy = today();
  const d90 = new Date(hoy); d90.setDate(d90.getDate() - 90);
  const d180 = new Date(hoy); d180.setDate(d180.getDate() - 180);
  const hoyIso = iso(hoy), ini1 = iso(d90), ini2 = iso(d180);
  const sumaGastos = (desde, hasta) => S.gastos.filter(g => g.fecha >= desde && g.fecha < hasta).reduce((a, g) => a + (+g.costo || 0), 0) +
    S.mantenimientos.filter(m => m.fecha >= desde && m.fecha < hasta).reduce((a, m) => a + (+m.costo || 0), 0);
  const actual = sumaGastos(ini1, hoyIso);
  const anterior = sumaGastos(ini2, ini1);
  const out = [];
  if (anterior > 0) {
    const delta = Math.round((actual - anterior) / anterior * 100);
    if (Math.abs(delta) >= 20) out.push({ t: 'Gastos de mantenimiento y gastos generales ' + (delta > 0 ? 'subieron' : 'bajaron') + ' ' + Math.abs(delta) + '% este trimestre respecto al anterior', cls: delta > 0 ? 'bad' : 'ok' });
  }
  return out;
}
export function proyeccionRentabilidadTendencia() {
  const t = today();
  const meses = [0, 1, 2].map(i => {
    const cobrado = cobradoDelMes(i);
    const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const gastos = S.gastos.filter(g => (g.fecha || '').slice(0, 7) === key).reduce((a, g) => a + (+g.costo || 0), 0) +
      S.mantenimientos.filter(m => (m.fecha || '').slice(0, 7) === key).reduce((a, m) => a + (+m.costo || 0), 0);
    return cobrado - gastos;
  });
  const promedioMensual = meses.reduce((a, b) => a + b, 0) / meses.length;
  return { promedioMensual, proyeccion6: promedioMensual * 6, proyeccion12: promedioMensual * 12 };
}
export function driverTotalPagado(driverId) {
  return S.payments.filter(p => p.choferId === driverId && p.tipo !== 'cuota').reduce((a, p) => a + (+p.monto || 0), 0);
}
export function driverWeeksInfo(driverId) {
  const cars = S.cars.filter(c => c.choferId === driverId && isContract(c) && c.inicio);
  let totalWeeks = 0, lateWeeks = 0;
  cars.forEach(c => { const i = calc(c); totalWeeks += i.weeks; lateWeeks += i.late; });
  return { totalWeeks, lateWeeks, tieneCars: cars.length > 0 };
}
export function driverScore(driverId) {
  const { totalWeeks, lateWeeks, tieneCars } = driverWeeksInfo(driverId);
  if (!tieneCars || !totalWeeks) return null;
  return Math.max(0, Math.round((1 - lateWeeks / totalWeeks) * 100));
}
export function driverEnRiesgo(driverId) {
  const { lateWeeks } = driverWeeksInfo(driverId);
  return settings.riesgoSemanas > 0 && lateWeeks >= settings.riesgoSemanas;
}
export function rankingMensualChoferes() {
  const inicioMes = new Date(today().getFullYear(), today().getMonth(), 1);
  const inicioMesIso = iso(inicioMes);
  return activeDrivers().filter(d => !d.prospecto).map(d => {
    const score = driverScore(d.id);
    const sancionesMes = S.sanciones.filter(s => s.driverId === d.id && s.fecha >= inicioMesIso).length;
    const siniestrosMes = S.siniestros.filter(s => s.choferId === d.id && s.fecha >= inicioMesIso).length;
    return { driverId: d.id, nombre: d.nombre, score, sancionesMes, siniestrosMes };
  }).filter(x => x.score != null).sort((a, b) => {
    const penA = a.sancionesMes + a.siniestrosMes, penB = b.sancionesMes + b.siniestrosMes;
    if (penA !== penB) return penA - penB;
    return b.score - a.score;
  }).slice(0, 5);
}
export function driverCalificaBono(driverId) {
  const { totalWeeks, lateWeeks, tieneCars } = driverWeeksInfo(driverId);
  return tieneCars && lateWeeks === 0 && totalWeeks >= settings.bonoSemanas;
}
function pagosDelMes(offsetMeses) {
  const t = today();
  const d = new Date(t.getFullYear(), t.getMonth() - offsetMeses, 1);
  const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  return S.payments.filter(p => (p.fecha || '').slice(0, 7) === key);
}
export function cobradoDelMes(offsetMeses) {
  return pagosDelMes(offsetMeses).filter(p => p.tipo !== 'cuota').reduce((a, p) => a + (+p.monto || 0), 0);
}
export function cobradoDelMesUSD(offsetMeses) {
  return pagosDelMes(offsetMeses).filter(p => p.tipo === 'cuota').reduce((a, p) => a + (+p.monto || 0), 0);
}
export function cobradoDelMesPorMetodo(offsetMeses) {
  const out = {};
  pagosDelMes(offsetMeses).filter(p => p.tipo !== 'cuota').forEach(p => {
    const m = p.metodo || 'sin_especificar';
    out[m] = (out[m] || 0) + (+p.monto || 0);
  });
  return out;
}
export function metodoPreferidoChofer(driverId) {
  const conteo = {};
  S.payments.filter(p => p.choferId === driverId && p.metodo).forEach(p => { conteo[p.metodo] = (conteo[p.metodo] || 0) + 1; });
  let mejor = '', max = 0;
  Object.entries(conteo).forEach(([m, n]) => { if (n > max) { max = n; mejor = m; } });
  return mejor;
}
export function proyeccionFlujoCaja(semanas) {
  const out = [];
  const hoy = today();
  for (let i = 0; i < semanas; i++) {
    const d = new Date(hoy); d.setDate(d.getDate() + i * 7);
    out.push({ semana: i + 1, fecha: iso(d), ars: 0, usd: 0 });
  }
  activeCars().filter(c => isContract(c) && c.choferId && c.monto).forEach(c => {
    const info = calc(c);
    for (let i = 0; i < semanas; i++) {
      if (c.tipo === 'financiado') {
        const semanaContrato = info.weeks + i;
        if (c.cuotas && semanaContrato > +c.cuotas) continue;
        out[i].usd += +c.monto;
      } else {
        out[i].ars += +c.monto;
      }
    }
  });
  return out;
}
export function usoDeDatos() {
  let registros = 0, bytes = 0;
  const porColeccion = COLS.map(c => {
    const arr = S[c] || [];
    const b = new Blob ? new Blob([JSON.stringify(arr)]).size : JSON.stringify(arr).length;
    registros += arr.length; bytes += b;
    return { col: c, n: arr.length, bytes: b };
  }).filter(x => x.n);
  return { registros, bytes, porColeccion: porColeccion.sort((a, b) => b.bytes - a.bytes) };
}
export const plate = p => '<span class="plate">' + esc(p || 'Sin patente') + '</span>';
export const badge = (cls, t) => '<span class="badge b-' + cls + '">' + esc(t) + '</span>';
export const tipoBadge = t => badge(t === 'alquiler' ? 'info' : t === 'financiado' ? 'ok' : 'mute', TIPOS[t] || t);
export const estadoMultaCls = e => e === 'pagada' ? 'ok' : e === 'vencida' ? 'bad' : e === 'apelada' ? 'info' : 'warn';
export function multasDeChofer(driverId) {
  return S.multas.filter(m => m.choferId === driverId).sort((a, b) => b.fecha.localeCompare(a.fecha));
}
export function multasPendientesCount() {
  return S.multas.filter(m => m.estado === 'pendiente' || m.estado === 'vencida').length;
}
export function rankingMultasChoferes() {
  const porChofer = {};
  S.multas.filter(m => m.choferId).forEach(m => {
    if (!porChofer[m.choferId]) porChofer[m.choferId] = { driverId: m.choferId, cantidad: 0, total: 0 };
    porChofer[m.choferId].cantidad++; porChofer[m.choferId].total += (+m.monto || 0);
  });
  return Object.values(porChofer).map(x => Object.assign(x, { nombre: driverName(x.driverId) })).sort((a, b) => b.total - a.total);
}
