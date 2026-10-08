// Cálculos de la ficha del auto: papeles, cédulas de autorizado, cubiertas,
// batería, turno de VTV, valor de mercado y "auto problema". Sin DOM.
import { S } from './state.js';
import { today, iso, parse, days, fdate } from './utils.js';
import { isSnoozed } from './snooze.js';
import { de, enPasada } from './memo.js';

const hoyIso = () => iso(today());
const diasHasta = f => (f ? days(today(), parse(f)) : null);
const nombreChofer = id => ((de('drivers', 'id', id)[0] || {}).nombre || 'Chofer');
const esContrato = c => c.tipo === 'alquiler' || c.tipo === 'financiado';
const tieneArchivo = (c, cats) => (c.files || []).some(f => cats.includes(f.cat));

export const POS_CUBIERTA = [['di', 'Delantera izquierda'], ['dd', 'Delantera derecha'], ['ti', 'Trasera izquierda'], ['td', 'Trasera derecha']];
export const MINIMO_LEGAL_MM = 1.6;

/* ---------- Semáforo de papeles ---------- */
function estadoFecha(f) {
  const d = diasHasta(f);
  if (d == null) return null;
  return d < 0 ? 'bad' : d <= 30 ? 'warn' : 'ok';
}
export function papelesAuto(c) {
  const L = [];
  const add = (label, estado, detalle) => L.push({ label, estado, detalle });
  add('Título', tieneArchivo(c, ['titulo']) ? 'ok' : 'warn', tieneArchivo(c, ['titulo']) ? 'cargado' : 'falta la copia');
  {
    const e = estadoFecha(c.cedula), arch = tieneArchivo(c, ['cedula']);
    add('Cédula verde', e === 'bad' ? 'bad' : !arch ? 'warn' : e || 'ok', e === 'bad' ? 'vencida' : !arch ? 'falta la copia' : c.cedula ? 'vence ' + fdate(c.cedula) : 'cargada');
  }
  {
    const e = estadoFecha(c.seguro), arch = tieneArchivo(c, ['seguro', 'seguroCertificado', 'seguroCredencial']);
    add('Seguro', !c.seguro ? 'bad' : e === 'bad' ? 'bad' : !arch ? 'warn' : e, !c.seguro ? 'sin vencimiento cargado' : e === 'bad' ? 'vencido' : !arch ? 'falta la póliza' : 'vence ' + fdate(c.seguro));
  }
  if (esContrato(c)) add('Póliza apta para apps', c.seguroApps === 'si' ? 'ok' : c.seguroApps === 'no' ? 'bad' : 'warn', c.seguroApps === 'si' ? 'cubre transporte por apps' : c.seguroApps === 'no' ? 'no cubre uso en apps' : 'sin confirmar');
  {
    const e = estadoFecha(c.vtv);
    add('VTV', !c.vtv ? 'warn' : e, !c.vtv ? 'sin vencimiento cargado' : e === 'bad' ? 'vencida' : 'vence ' + fdate(c.vtv) + (c.vtvTurno && c.vtvTurno.fecha ? ' · turno ' + fdate(c.vtvTurno.fecha) : ''));
  }
  if (c.combustible === 'gnc') {
    const e = estadoFecha(c.gncOblea);
    add('Oblea de GNC', !c.gncOblea ? 'warn' : e, !c.gncOblea ? 'sin vencimiento cargado' : e === 'bad' ? 'vencida' : 'vence ' + fdate(c.gncOblea));
  }
  if (c.impuesto) { const e = estadoFecha(c.impuesto); add('Impuesto automotor', e, e === 'bad' ? 'vencido' : 'vence ' + fdate(c.impuesto)); }
  if (c.choferId && esContrato(c)) {
    const ok = cedulaActiva(c, c.choferId);
    add('Cédula de autorizado', ok ? 'ok' : 'warn', ok ? nombreChofer(c.choferId) : 'falta la de ' + nombreChofer(c.choferId));
  }
  return L;
}
export function papelesResumen(c) {
  const L = papelesAuto(c);
  return { bad: L.filter(x => x.estado === 'bad').length, warn: L.filter(x => x.estado === 'warn').length, total: L.length };
}

/* ---------- Cédulas de autorizado a conducir ---------- */
export const cedulasActivas = c => (c.cedulasAutorizado || []).filter(x => !x.baja);
export const cedulaActiva = (c, choferId) => cedulasActivas(c).some(x => x.choferId === choferId);
function desdeAsignacion(c) {
  const h = (c.historialChoferes || []).slice().reverse().find(x => x.choferId === c.choferId && !x.hasta);
  return h ? h.desde : c.inicio;
}

/* ---------- Cubiertas ---------- */
export function cubiertas(c) {
  return POS_CUBIERTA.map(([pos, label]) => {
    const n = (c.neumaticos || {})[pos] || {};
    const mm = +n.profundidad || 0;
    const hist = (c.neumaticosHist || []).filter(x => x.pos === pos).sort((a, b) => a.fecha.localeCompare(b.fecha));
    let kmRestantes = null;
    const conKm = hist.filter(x => +x.km > 0);
    if (mm > MINIMO_LEGAL_MM && conKm.length >= 2) {
      const a = conKm[0], b = conKm[conKm.length - 1];
      const gasto = (+a.mm - +b.mm) / ((+b.km - +a.km) || 1);
      if (gasto > 0) kmRestantes = Math.round((mm - MINIMO_LEGAL_MM) / gasto / 1000) * 1000;
    }
    const cls = !mm ? '' : mm < MINIMO_LEGAL_MM ? 'bad' : mm < 3 ? 'warn' : 'ok';
    return { pos, label, mm, fecha: n.fecha || (hist.length ? hist[hist.length - 1].fecha : ''), cls, kmRestantes };
  });
}

/* ---------- Batería ---------- */
export function estadoBateria(c) {
  const meses = c.bateria12vFecha ? Math.floor(days(parse(c.bateria12vFecha), today()) / 30.4) : null;
  const M = (c.bateriaMediciones || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const ult = M[M.length - 1] || null;
  let cls = 'ok', motivo = '';
  if (ult && (ult.resultado === 'mala' || (+ult.voltaje && +ult.voltaje < 12))) { cls = 'bad'; motivo = 'la última medición dio mal'; }
  else if (ult && (ult.resultado === 'regular' || (+ult.voltaje && +ult.voltaje < 12.3))) { cls = 'warn'; motivo = 'la última medición dio floja'; }
  else if (meses != null && meses >= 36) { cls = 'warn'; motivo = 'tiene ' + meses + ' meses'; }
  else if (meses != null && meses >= 24 && (!ult || diasHasta(ult.fecha) < -90)) { cls = 'warn'; motivo = 'tiene ' + meses + ' meses y conviene medirla'; }
  return { meses, ultima: ult, cls, motivo };
}

/* ---------- Valor de mercado ---------- */
export function ultimaActualizacionValor(c) {
  const H = c.valorMercadoHist || [];
  return H.length ? H[H.length - 1].fecha : (c.valorMercado ? '' : null);
}
export function autosValorDesactualizado(diasLimite = 35) {
  return S.cars.filter(c => !c.vendido).filter(c => {
    const f = ultimaActualizacionValor(c);
    return !f || days(parse(f), today()) > diasLimite;
  });
}
export const valorFlota = () => S.cars.filter(c => !c.vendido).reduce((a, c) => a + (+c.valorMercado || 0), 0);

/* ---------- Auto problema: va al taller mucho más que los de su modelo ---------- */
const modelo = c => [c.marca, c.modelo].filter(Boolean).join(' ').trim().toLowerCase();
export const visitasTaller = (c, dias = 180) => enPasada('visitas:' + c.id + ':' + dias, () => _visitasTaller(c, dias));
function _visitasTaller(c, dias) {
  const desde = new Date(today()); desde.setDate(desde.getDate() - dias);
  const d0 = iso(desde);
  const mant = de('mantenimientos', 'carId', c.id).filter(m => m.carId === c.id && m.tipo === 'correctivo' && (m.fecha || '') >= d0).length;
  const ots = (c.ordenes || []).filter(o => (o.fecha || '') >= d0 && o.tipo !== 'preventivo').length;
  const taller = (c.historialTaller || []).filter(h => (h.desde || '') >= d0).length;
  return Math.max(mant + ots, taller);
}
export function autoProblema(c) {
  if (c.vendido) return null;
  const n = visitasTaller(c);
  if (n < 3) return null;
  const { suma, n: cant, porModelo } = enPasada('visitasFlota', () => {
    const r = { suma: 0, n: 0, porModelo: {} };
    S.cars.filter(x => !x.vendido).forEach(x => { const v = visitasTaller(x), m = modelo(x); r.suma += v; r.n++; if (m) { const p = r.porModelo[m] || (r.porModelo[m] = { suma: 0, n: 0 }); p.suma += v; p.n++; } });
    return r;
  });
  const pm = modelo(c) ? porModelo[modelo(c)] : null;
  const pares = pm && pm.n > 1 ? { suma: pm.suma - n, n: pm.n - 1 } : null;
  const base = pares || { suma: suma - n, n: cant - 1 };
  if (base.n <= 0) return null;
  const prom = base.suma / base.n;
  if (n < Math.max(3, prom * 2)) return null;
  return { visitas: n, promedio: Math.round(prom * 10) / 10, comparado: pares ? 'los otros ' + (c.marca || '') + ' ' + (c.modelo || '') : 'el resto de la flota' };
}

/* ---------- Avisos ---------- */
export function alertasAuto() {
  const out = [];
  const push = (c, key, sub, cls, t, d) => { if (!isSnoozed(key)) out.push({ who: c.patente || 'Auto sin patente', sub, kind: 'car', id: c.id, key, d, cls, t }); };
  S.cars.filter(c => !c.vendido).forEach(c => {
    // Cédula de autorizado
    cedulasActivas(c).forEach(x => {
      if (x.choferId && x.choferId !== c.choferId) push(c, 'car:' + c.id + ':cedulabaja:' + x.id, 'Dar de baja la cédula de autorizado', 'warn', nombreChofer(x.choferId) + ' ya no maneja este auto', 5);
    });
    if (c.choferId && esContrato(c) && !cedulaActiva(c, c.choferId)) {
      const desde = desdeAsignacion(c);
      if (!desde || days(parse(desde), today()) >= 3) push(c, 'car:' + c.id + ':cedulafalta', 'Falta la cédula de autorizado', 'warn', nombreChofer(c.choferId) + ' maneja sin cédula cargada', 7);
    }
    // Póliza apta para apps
    if (esContrato(c) && c.seguroApps === 'no') push(c, 'car:' + c.id + ':seguroapps', 'Póliza sin cobertura para apps', 'bad', 'El seguro no cubre transporte de pasajeros por aplicación', 0);
    // Cubiertas
    const malas = cubiertas(c).filter(x => x.cls === 'bad' || x.cls === 'warn');
    if (malas.length) {
      const peor = malas.reduce((a, b) => (a.mm <= b.mm ? a : b));
      push(c, 'car:' + c.id + ':cubiertas', peor.cls === 'bad' ? 'Cubierta bajo el mínimo legal' : 'Cubiertas para cambiar pronto', peor.cls,
        malas.map(x => x.label.toLowerCase() + ' ' + String(x.mm).replace('.', ',') + ' mm').join(', '), peor.cls === 'bad' ? -1 : 14);
    }
    // Batería
    const b = estadoBateria(c);
    if (b.cls !== 'ok') push(c, 'car:' + c.id + ':bateria', 'Batería', b.cls, 'Revisala: ' + b.motivo, b.cls === 'bad' ? 0 : 20);
    // Turno de VTV mañana u hoy
    const t = c.vtvTurno && c.vtvTurno.fecha;
    if (t) { const d = diasHasta(t); if (d != null && d >= 0 && d <= 1) push(c, 'car:' + c.id + ':vtvturno:' + t, 'Turno de VTV', 'warn', (d === 0 ? 'Hoy' : 'Mañana') + (c.vtvTurno.hora ? ' a las ' + c.vtvTurno.hora : '') + (c.vtvTurno.lugar ? ' en ' + c.vtvTurno.lugar : ''), d); }
    // Auto problema
    const p = autoProblema(c);
    if (p) push(c, 'car:' + c.id + ':problema', 'Auto problema', 'warn', p.visitas + ' visitas al taller en 6 meses (' + String(p.promedio).replace('.', ',') + ' en promedio ' + p.comparado + ')', 20);
    // Fallas reportadas por el chofer desde el portal y órdenes listas para retirar
    (c.ordenes || []).forEach(o => {
      if (o.estado === 'reportada') { const k = 'car:' + c.id + ':ot:' + o.id; if (!isSnoozed(k)) out.push({ who: c.patente || 'Auto', sub: 'Falla reportada por el chofer', kind: 'car', id: c.id, key: k, d: 0, cls: 'warn', t: o.titulo || 'Ver detalle', accion: "otForm('" + c.id + "','" + o.id + "')" }); }
      if (o.estado === 'lista') { const k = 'car:' + c.id + ':otlista:' + o.id; if (!isSnoozed(k)) out.push({ who: c.patente || 'Auto', sub: 'Auto listo en el taller', kind: 'car', id: c.id, key: k, d: 3, cls: 'info', t: 'OT ' + o.numero + ': ' + (o.titulo || ''), accion: "otForm('" + c.id + "','" + o.id + "')" }); }
    });
    // Códigos de falla sin resolver
    const cf = (c.codigosFalla || []).filter(x => !x.resuelto);
    if (cf.length) push(c, 'car:' + c.id + ':codigos', 'Códigos de falla sin resolver', 'warn', cf.map(x => x.codigo).join(', '), 10);
  });
  const desact = autosValorDesactualizado();
  const conValor = S.cars.filter(c => !c.vendido && (c.valorMercado || (c.valorMercadoHist || []).length)).length;
  if (conValor && desact.length && !isSnoozed('sistema:valormercado:' + hoyIso().slice(0, 7))) {
    out.push({ who: 'Valores de mercado', sub: 'Actualizalos este mes', kind: 'sistema', accion: 'valoresMercadoView()', id: '', key: 'sistema:valormercado:' + hoyIso().slice(0, 7), d: 25, cls: 'soft', t: desact.length + ' auto' + (desact.length === 1 ? '' : 's') + ' sin actualizar hace más de un mes' });
  }
  return out;
}
// Texto extra para el aviso de vencimiento de la VTV.
export function textoTurnoVtv(c) {
  const t = c.vtvTurno && c.vtvTurno.fecha;
  return t && t >= hoyIso() ? ' · turno el ' + fdate(t) : ' · sacá turno';
}
