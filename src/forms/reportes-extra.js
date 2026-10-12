// Reportes de la ronda de las 200 preguntas: cuánto se tarda en resolver cada
// tipo de aviso, cuánto duran los choferes según edad y experiencia, km de la
// flota por semana, services hechos a tiempo y el chequeo trimestral con IA.
import { S } from '../state.js';
import { esc, val, iso, today, fdate, num1, parse, days } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { de } from '../memo.js';
import { settings, saveSettings } from '../settings.js';
import { calc, isContract, alerts, rentabilidadAuto, driverDebt } from '../calc.js';
import { leerDocumento } from '../ia.js';
import { isSnoozed } from '../snooze.js';
import { fechaIngreso } from './choferes-extra.js';

const barra = (pct, color) => '<div style="background:var(--soft);border-radius:6px;height:8px;overflow:hidden;margin:4px 0"><div style="width:' + Math.max(0, Math.min(100, pct)) + '%;height:100%;background:' + (color || 'var(--btn)') + '"></div></div>';
const cerrar = '<button class="btn sec block" style="margin-top:10px" onclick="closeModal()">Cerrar</button>';
const dias = (a, b) => (a && b ? Math.max(0, days(parse(String(a).slice(0, 10)), parse(String(b).slice(0, 10)))) : null);

/* ---------- Tiempos de respuesta ---------- */
export function tiemposRespuesta(diasAtras = 120) {
  const desde = iso(new Date(Date.now() - diasAtras * 864e5));
  const T = {};
  const add = (tipo, inicio, fin, quien) => {
    if (!inicio || String(inicio).slice(0, 10) < desde) return;
    const t = T[tipo] = T[tipo] || { tipo, resueltos: [], pendientes: 0, peor: null };
    if (!fin) { t.pendientes++; return; }
    const d = dias(inicio, fin); t.resueltos.push(d);
    if (!t.peor || d > t.peor.d) t.peor = { d, quien };
  };
  S.cars.forEach(c => {
    (c.turnosService || []).filter(t => t.origen !== 'empresa').forEach(t => add('Turnos de service pedidos', t.pedidoEl, t.estado !== 'pedido' ? t.respondido || t.pedidoEl : '', c.patente));
    (c.auxilios || []).forEach(a => add('Pedidos de auxilio', a.fecha, a.atendido, c.patente));
    (c.ordenes || []).filter(o => o.estado !== 'cancelada').forEach(o => add(o.origen === 'portal' ? 'Fallas reportadas por el chofer (hasta cerrar la orden)' : 'Órdenes de trabajo (hasta cerrarlas)', o.fecha, o.estado === 'cerrada' ? o.fechaCierre : '', c.patente + ' · OT ' + o.numero));
  });
  S.drivers.forEach(d => {
    (d.reclamos || []).forEach(r => add('Reclamos de choferes', r.fecha, r.estado === 'resuelto' ? r.resueltoEl : '', d.nombre));
    (d.gastosChofer || []).forEach(g => add('Gastos pagados por choferes (aprobar o rechazar)', g.enviado || g.fecha, g.estado !== 'pendiente' ? g.resuelto : '', d.nombre));
  });
  return Object.values(T).map(t => Object.assign(t, { promedio: t.resueltos.length ? t.resueltos.reduce((a, b) => a + b, 0) / t.resueltos.length : null })).sort((a, b) => (b.promedio || 0) - (a.promedio || 0));
}
export function tiemposRespuestaView() {
  const L = tiemposRespuesta();
  const max = Math.max(1, ...L.map(t => t.promedio || 0));
  const abiertos = alerts().length;
  openModal('<h3>Cuánto tardás en resolver</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Últimos 4 meses, en días, desde que llega el pedido hasta que lo resolvés. Hoy tenés ' + abiertos + ' avisos abiertos en Vencimientos.</div>' +
    (L.length ? L.map(t => '<div class="card"><div class="row between"><b>' + esc(t.tipo) + '</b><b>' + (t.promedio != null ? num1(t.promedio) + ' d' : '—') + '</b></div>' +
      (t.promedio != null ? barra(t.promedio / max * 100, t.promedio > 7 ? 'var(--bad)' : t.promedio > 2 ? 'var(--warn)' : 'var(--ok)') : '') +
      '<div class="small muted">' + t.resueltos.length + ' resueltos' + (t.pendientes ? ' · ' + t.pendientes + ' sin resolver' : '') + (t.peor ? ' · el más lento: ' + t.peor.d + ' d (' + esc(t.peor.quien || '') + ')' : '') + '</div></div>').join('')
      : '<div class="card empty">Todavía no hay pedidos con fecha de resolución.</div>') + cerrar);
}

/* ---------- Duración de choferes según edad y experiencia ---------- */
function finDeChofer(d) {
  if (!d.inactivo) return iso(today());
  let f = '';
  S.cars.forEach(c => (c.historialChoferes || []).forEach(h => { if (h.choferId === d.id && h.hasta && h.hasta > f) f = h.hasta; }));
  return f || null;
}
function añosExperiencia(t) {
  const s = String(t || '').toLowerCase().trim();
  if (!s) return null;
  if (/^(no|ninguna|nada|sin)/.test(s)) return 0;
  const m = s.match(/(\d+[.,]?\d*)\s*(año|anio|a\b)/); if (m) return +m[1].replace(',', '.');
  const me = s.match(/(\d+)\s*mes/); if (me) return +me[1] / 12;
  if (/^(si|sí)/.test(s)) return 1;
  const n = s.match(/^(\d+)/); return n ? +n[1] : null;
}
export function duracionChoferes() {
  const filas = S.drivers.filter(d => !d.prospecto).map(d => {
    const ini = fechaIngreso(d), fin = finDeChofer(d);
    if (!ini || !fin) return null;
    const meses = Math.max(0, days(parse(ini), parse(fin)) / 30.4);
    const edad = d.fechaNacimiento ? (parse(ini) - parse(d.fechaNacimiento)) / 3.156e10 : null;
    return { d, meses, edad, exp: añosExperiencia(d.experienciaChofer), activo: !d.inactivo };
  }).filter(Boolean);
  const agrupar = (fn, orden) => {
    const G = {};
    filas.forEach(f => { const k = fn(f); (G[k] = G[k] || []).push(f); });
    return orden.filter(k => G[k]).map(k => ({ k, n: G[k].length, meses: G[k].reduce((a, f) => a + f.meses, 0) / G[k].length, activos: G[k].filter(f => f.activo).length }));
  };
  const edad = agrupar(f => f.edad == null ? 'Sin fecha de nacimiento' : f.edad < 25 ? 'Menos de 25' : f.edad < 35 ? '25 a 34' : f.edad < 45 ? '35 a 44' : f.edad < 55 ? '45 a 54' : '55 o más', ['Menos de 25', '25 a 34', '35 a 44', '45 a 54', '55 o más', 'Sin fecha de nacimiento']);
  const exp = agrupar(f => f.exp == null ? 'Sin dato' : f.exp === 0 ? 'Sin experiencia' : f.exp < 1 ? 'Menos de 1 año' : f.exp < 3 ? '1 a 3 años' : '3 años o más', ['Sin experiencia', 'Menos de 1 año', '1 a 3 años', '3 años o más', 'Sin dato']);
  return { filas, edad, exp };
}
export function duracionChoferesView() {
  const r = duracionChoferes();
  const tabla = (titulo, L) => {
    const max = Math.max(1, ...L.map(x => x.meses));
    return '<div class="sec-t">' + titulo + '</div>' + L.map(x => '<div class="card"><div class="row between"><b>' + esc(x.k) + '</b><b>' + num1(x.meses) + ' meses</b></div>' + barra(x.meses / max * 100) +
      '<div class="small muted">' + x.n + (x.n === 1 ? ' chofer' : ' choferes') + ' · ' + x.activos + ' siguen' + (x.n < 3 ? ' · pocos datos todavía' : '') + '</div></div>').join('');
  };
  openModal('<h3>Cuánto duran los choferes</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Tiempo promedio con la empresa (de los que siguen, hasta hoy). La edad es la que tenían al entrar. La experiencia sale del campo "Experiencia previa como chofer" (ej: "2 años", "no").</div>' +
    (r.filas.length ? tabla('Según la edad', r.edad) + tabla('Según la experiencia previa', r.exp) : '<div class="card empty">Faltan datos: fecha de ingreso de los choferes.</div>') + cerrar);
}

/* ---------- Km de la flota por semana ---------- */
export function kmFlotaPorSemana(semanas = 12) {
  const hoy = today();
  const inicio = new Date(hoy); inicio.setDate(inicio.getDate() - semanas * 7 + 1);
  const out = Array.from({ length: semanas }, (_, i) => { const d = new Date(inicio); d.setDate(d.getDate() + i * 7); return { desde: iso(d), km: 0 }; });
  S.cars.forEach(c => {
    const H = (c.kmHistorial || []).filter(h => h.fecha && +h.km).sort((a, b) => a.fecha.localeCompare(b.fecha));
    for (let i = 1; i < H.length; i++) {
      const a = H[i - 1], b = H[i], kmDif = +b.km - +a.km, dd = days(parse(a.fecha), parse(b.fecha));
      if (kmDif <= 0 || dd <= 0 || kmDif / dd > 1500) continue;
      const porDia = kmDif / dd;
      for (let k = 0; k < dd; k++) {
        const f = new Date(parse(a.fecha)); f.setDate(f.getDate() + k + 1);
        const idx = Math.floor(days(inicio, f) / 7);
        if (idx >= 0 && idx < semanas) out[idx].km += porDia;
      }
    }
  });
  return out;
}
export function kmFlotaView() {
  const L = kmFlotaPorSemana(12);
  const max = Math.max(1, ...L.map(x => x.km));
  const ult4 = L.slice(-4).reduce((a, x) => a + x.km, 0), ant4 = L.slice(-8, -4).reduce((a, x) => a + x.km, 0);
  const tend = ant4 ? (ult4 - ant4) / ant4 * 100 : null;
  const autos = S.cars.filter(c => !c.vendido && isContract(c)).length;
  openModal('<h3>Km de la flota por semana</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Sale de los km que se cargan (cobros, portal, ficha). Entre dos cargas se reparte parejo por día, así que la semana actual puede verse baja hasta que se cargue el próximo km.</div>' +
    '<div class="grid" style="margin-bottom:10px"><div class="kpi"><div class="n">' + Math.round(ult4 / 4).toLocaleString('es-AR') + '</div><div class="l">Km por semana (últ. 4)</div></div>' +
    '<div class="kpi ' + (tend == null ? '' : tend < -10 ? 'bad' : tend > 10 ? 'ok' : '') + '"><div class="n">' + (tend == null ? '—' : (tend > 0 ? '+' : '') + Math.round(tend) + '%') + '</div><div class="l">vs. las 4 anteriores</div></div>' +
    '<div class="kpi"><div class="n">' + (autos ? Math.round(ult4 / 4 / autos).toLocaleString('es-AR') : '—') + '</div><div class="l">Km por auto trabajando</div></div></div>' +
    L.map(x => '<div class="row" style="gap:8px;align-items:center;padding:2px 0"><span class="small muted" style="width:62px">' + fdate(x.desde).slice(0, 5) + '</span><div style="flex:1;background:var(--soft);border-radius:4px;height:14px;overflow:hidden"><div style="width:' + Math.round(x.km / max * 100) + '%;height:100%;background:var(--btn)"></div></div><span class="small" style="width:70px;text-align:right">' + Math.round(x.km).toLocaleString('es-AR') + '</span></div>').join('') + cerrar);
}

/* ---------- Services hechos a tiempo ---------- */
export function servicesATiempo(meses = 6) {
  const hoy = today();
  const claves = Array.from({ length: meses }, (_, i) => iso(new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1 - i), 1)).slice(0, 7));
  const R = Object.fromEntries(claves.map(k => [k, { mes: k, hechos: 0, aTiempo: 0, tarde: [] }]));
  S.cars.forEach(c => {
    const plan = Object.fromEntries((c.mantenimientoPlan || []).map(p => [p.item, p]));
    const M = de('mantenimientos', 'carId', c.id).filter(m => m.carId === c.id && m.item && plan[m.item] && m.tipo !== 'correctivo').sort((a, b) => a.fecha.localeCompare(b.fecha));
    const prev = {};
    M.forEach(m => {
      const p = plan[m.item], ant = prev[m.item]; prev[m.item] = m;
      if (!ant) return;
      const r = R[m.fecha.slice(0, 7)]; if (!r) return;
      let tarde = false;
      if (p.intervaloKm && +m.km && +ant.km && +m.km > +ant.km + +p.intervaloKm + 500) tarde = true;
      if (p.intervaloMeses && ant.fecha) { const v = parse(ant.fecha); v.setMonth(v.getMonth() + +p.intervaloMeses); if (days(v, parse(m.fecha)) > 7) tarde = true; }
      r.hechos++; if (tarde) r.tarde.push(c.patente + ' · ' + (p.label || m.item)); else r.aTiempo++;
    });
  });
  return claves.map(k => R[k]);
}
export function servicesATiempoView() {
  const L = servicesATiempo(6);
  const tot = L.reduce((a, r) => ({ h: a.h + r.hechos, t: a.t + r.aTiempo }), { h: 0, t: 0 });
  const vencidosHoy = S.cars.filter(c => !c.vendido).filter(c => (c.mantenimientoPlan || []).some(p => {
    const kmAct = +c.km || 0;
    if (p.intervaloKm && (+p.ultimoKm || 0) + +p.intervaloKm < kmAct) return true;
    if (p.intervaloMeses && p.ultimaFecha) { const v = parse(p.ultimaFecha); v.setMonth(v.getMonth() + +p.intervaloMeses); return days(today(), v) < 0; }
    return false;
  }));
  const nombreMes = k => new Date(k + '-02').toLocaleDateString('es-AR', { month: 'long' });
  openModal('<h3>Services hechos a tiempo</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Un service está a tiempo si se hizo antes de pasarse 500 km o una semana de lo que marca el plan del auto.</div>' +
    '<div class="grid" style="margin-bottom:10px"><div class="kpi ' + (tot.h && tot.t / tot.h < 0.8 ? 'warn' : '') + '"><div class="n">' + (tot.h ? Math.round(tot.t / tot.h * 100) + '%' : '—') + '</div><div class="l">A tiempo (6 meses)</div></div>' +
    '<div class="kpi ' + (vencidosHoy.length ? 'bad' : 'ok') + '"><div class="n">' + vencidosHoy.length + '</div><div class="l">Autos con algo vencido hoy</div></div></div>' +
    L.map(r => '<div class="card"><div class="row between"><b style="text-transform:capitalize">' + esc(nombreMes(r.mes)) + '</b><span>' + (r.hechos ? r.aTiempo + ' de ' + r.hechos + ' a tiempo' : 'sin services') + '</span></div>' +
      (r.hechos ? barra(r.aTiempo / r.hechos * 100, r.aTiempo === r.hechos ? 'var(--ok)' : 'var(--warn)') : '') +
      (r.tarde.length ? '<div class="small muted">Tarde: ' + esc(r.tarde.slice(0, 4).join(', ')) + (r.tarde.length > 4 ? '…' : '') + '</div>' : '') + '</div>').join('') +
    (vencidosHoy.length ? '<div class="sec-t">Con algo vencido hoy</div>' + vencidosHoy.map(c => '<div class="card row between tap" onclick="carForm(\'' + c.id + '\');setTabAuto(\'mant\')"><span>' + esc(c.patente) + '</span><span class="muted">›</span></div>').join('') : '') + cerrar);
}

/* ---------- Chequeo trimestral del negocio ---------- */
const PREGUNTAS = [
  ['ahorro', '¿Cuántos meses de gastos fijos podrías pagar con la plata que tenés guardada?', ['Nada', 'Menos de 1 mes', '1 a 3 meses', 'Más de 3 meses']],
  ['papeles', '¿Están al día los contratos firmados, seguros y papeles de todos los autos?', ['Sí, todos', 'Casi todos', 'Hay varios atrasados']],
  ['horas', '¿Cuántas horas por semana le dedicás al negocio?', ['Menos de 10', '10 a 25', '25 a 45', 'Más de 45']],
  ['planes', '¿Qué pensás hacer en los próximos 3 meses?', ['Comprar autos', 'Vender autos', 'Mantener la flota', 'No sé']],
  ['preocupa', '¿Qué es lo que más te preocupa hoy del negocio?', null],
];
export const chequeos = () => settings.chequeosNegocio || [];
function metricasNegocio() {
  const flota = S.cars.filter(c => !c.vendido);
  const contrato = flota.filter(isContract);
  const deudaARS = contrato.filter(c => c.tipo === 'alquiler').reduce((a, c) => a + calc(c).debt, 0);
  const atrasados = S.drivers.filter(d => !d.inactivo && !d.prospecto && driverDebt(d.id) > 0).length;
  const activos = S.drivers.filter(d => !d.inactivo && !d.prospecto).length;
  const hace = n => iso(new Date(today().getFullYear(), today().getMonth() - n, 1));
  const cobradoMes = n => S.payments.filter(p => p.fecha >= hace(n) && p.fecha < hace(n - 1) && p.tipo !== 'cuota').reduce((a, p) => a + (+p.monto || 0), 0);
  const gastoMes = n => S.gastos.filter(g => g.fecha >= hace(n) && g.fecha < hace(n - 1)).reduce((a, g) => a + (+g.costo || 0), 0) + S.mantenimientos.filter(m => m.fecha >= hace(n) && m.fecha < hace(n - 1)).reduce((a, m) => a + (+m.costo || 0), 0);
  const rent = flota.map(c => rentabilidadAuto(c)).filter(r => r.neta != null);
  const urgentes = alerts().filter(a => a.d <= 0).length;
  const st = servicesATiempo(3).reduce((a, r) => ({ h: a.h + r.hechos, t: a.t + r.aTiempo }), { h: 0, t: 0 });
  return {
    autos: flota.length, trabajando: contrato.length, parados: flota.filter(c => c.tipo === 'disponible').length, enTaller: flota.filter(c => c.tipo === 'taller').length,
    ocupacionPct: flota.length ? Math.round(contrato.length / flota.length * 100) : 0,
    choferesActivos: activos, choferesConDeuda: atrasados, deudaAlquileres: Math.round(deudaARS),
    cobrado: [3, 2, 1].map(cobradoMes), gastado: [3, 2, 1].map(gastoMes),
    autosConPerdida: rent.filter(r => r.neta < 0).length, avisosVencidos: urgentes,
    servicesATiempoPct: st.h ? Math.round(st.t / st.h * 100) : null,
    reclamosAbiertos: S.drivers.reduce((a, d) => a + (d.reclamos || []).filter(r => r.estado === 'abierto').length, 0),
  };
}
function textoParaIA(m, resp) {
  const L = [
    'Autos: ' + m.autos + ' (' + m.trabajando + ' trabajando, ' + m.parados + ' parados, ' + m.enTaller + ' en taller). Ocupación ' + m.ocupacionPct + '%.',
    'Choferes activos: ' + m.choferesActivos + ', con deuda: ' + m.choferesConDeuda + '. Deuda de alquileres: $' + m.deudaAlquileres.toLocaleString('es-AR') + '.',
    'Cobrado por mes (hace 3, 2 y 1 meses, en pesos, sin cuotas en dólares): ' + m.cobrado.map(x => '$' + Math.round(x).toLocaleString('es-AR')).join(', ') + '.',
    'Gastado por mes (mismo período): ' + m.gastado.map(x => '$' + Math.round(x).toLocaleString('es-AR')).join(', ') + '.',
    'Autos que hasta hoy dan pérdida: ' + m.autosConPerdida + '. Avisos vencidos sin resolver: ' + m.avisosVencidos + '. Reclamos de choferes abiertos: ' + m.reclamosAbiertos + '.',
    'Services hechos a tiempo en los últimos 3 meses: ' + (m.servicesATiempoPct == null ? 'sin datos' : m.servicesATiempoPct + '%') + '.',
    '', 'Respuestas del dueño:',
  ].concat(PREGUNTAS.map(([k, q]) => '- ' + q + ' ' + (resp[k] || 'sin respuesta')));
  return L.join('\n');
}
// Diagnóstico sin IA, por si no está la clave o falla.
function diagnosticoBasico(m, resp) {
  const flojos = [];
  if (m.ocupacionPct < 80) flojos.push({ tema: 'Autos sin trabajar', porQue: 'La ocupación es ' + m.ocupacionPct + '% (' + m.parados + ' parados).', queHacer: 'Mirá la lista de espera y los prospectos aprobados para asignar los autos parados.' });
  if (m.choferesActivos && m.choferesConDeuda / m.choferesActivos > 0.3) flojos.push({ tema: 'Cobranza', porQue: m.choferesConDeuda + ' de ' + m.choferesActivos + ' choferes deben plata ($' + m.deudaAlquileres.toLocaleString('es-AR') + ').', queHacer: 'Armá planes de pago con los que más deben y llamá esta semana a los demás.' });
  if (resp.ahorro === 'Nada' || resp.ahorro === 'Menos de 1 mes') flojos.push({ tema: 'Colchón de plata', porQue: 'Respondiste que tenés ' + resp.ahorro.toLowerCase() + ' de gastos guardados.', queHacer: 'Separá un porcentaje fijo de cada cobro hasta juntar al menos 2 meses de gastos.' });
  if (m.servicesATiempoPct != null && m.servicesATiempoPct < 80) flojos.push({ tema: 'Mantenimiento', porQue: 'Solo el ' + m.servicesATiempoPct + '% de los services se hizo a tiempo.', queHacer: 'Agendá los services desde la ficha de cada auto: el chofer recibe el recordatorio.' });
  if (m.avisosVencidos > 5) flojos.push({ tema: 'Pendientes acumulados', porQue: 'Hay ' + m.avisosVencidos + ' avisos vencidos sin resolver.', queHacer: 'Dedicá una hora esta semana a vaciar Vencimientos.' });
  if (resp.papeles === 'Hay varios atrasados') flojos.push({ tema: 'Papeles', porQue: 'Respondiste que hay papeles atrasados.', queHacer: 'Usá el semáforo de papeles de cada auto y empezá por el seguro.' });
  const bien = [];
  if (m.ocupacionPct >= 90) bien.push('La flota está casi toda trabajando (' + m.ocupacionPct + '%).');
  if (m.choferesActivos && m.choferesConDeuda === 0) bien.push('Ningún chofer debe plata.');
  if (m.servicesATiempoPct >= 90) bien.push('Los services se hacen a tiempo.');
  return { resumen: 'Chequeo hecho sin IA (con los números de la app).', flojos: flojos.slice(0, 4), bien: bien.slice(0, 3), prioridad: flojos.length ? flojos[0].queHacer : 'Seguí así y repetí el chequeo en 3 meses.' };
}
export function chequeoView() {
  const ult = chequeos().slice(-1)[0];
  openModal('<h3>Chequeo trimestral del negocio</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Cinco preguntas y la app junta tus números. La IA te dice dónde estás flojo y qué hacer. Te lo vuelve a pedir cada 3 meses.</div>' +
    (ult ? '<div class="card small" style="margin-bottom:10px">Último chequeo: ' + fdate(ult.fecha) + ' · <a class="tap" style="text-decoration:underline" onclick="verChequeo(\'' + ult.fecha + '\')">verlo</a></div>' : '') +
    PREGUNTAS.map(([k, q, ops]) => '<label class="f"><span>' + esc(q) + '</span>' + (ops ? '<select id="cq_' + k + '"><option value="">Elegí…</option>' + ops.map(o => '<option>' + esc(o) + '</option>').join('') + '</select>' : '<textarea id="cq_' + k + '" rows="2"></textarea>') + '</label>').join('') +
    '<button class="btn block" id="cq_btn" onclick="hacerChequeo()">Hacer el chequeo</button><div class="small muted" id="cq_status" style="margin-top:6px"></div>' + cerrar);
}
export async function hacerChequeo() {
  const resp = {}; PREGUNTAS.forEach(([k]) => { resp[k] = val('cq_' + k); });
  if (PREGUNTAS.slice(0, 4).some(([k]) => !resp[k])) { toast('Respondé las primeras cuatro preguntas'); return; }
  const btn = document.getElementById('cq_btn'), st = document.getElementById('cq_status');
  btn.disabled = true; st.textContent = 'Juntando tus números y pensando…';
  const m = metricasNegocio();
  const r = await leerDocumento('chequeo', { texto: textoParaIA(m, resp) });
  const diag = r.ok ? Object.assign({ conIA: true }, r.datos) : Object.assign(diagnosticoBasico(m, resp), { errorIA: r.error });
  const ch = { fecha: iso(today()), respuestas: resp, metricas: m, diagnostico: diag };
  saveSettings({ chequeosNegocio: chequeos().filter(x => x.fecha !== ch.fecha).concat([ch]).slice(-12) });
  verChequeo(ch.fecha);
}
export function verChequeo(fecha) {
  const ch = chequeos().find(x => x.fecha === fecha); if (!ch) return;
  const d = ch.diagnostico || {};
  openModal('<h3>Chequeo del ' + fdate(ch.fecha) + '</h3>' +
    (d.errorIA ? '<div class="small" style="color:var(--warn);margin-bottom:8px">No se pudo usar la IA (' + esc(d.errorIA) + '): este es el diagnóstico con las reglas de la app.</div>' : '') +
    '<div class="card">' + esc(d.resumen || '') + '</div>' +
    (d.prioridad ? '<div class="card" style="border-color:var(--btn)"><b>Lo más importante ahora</b><div>' + esc(d.prioridad) + '</div></div>' : '') +
    ((d.flojos || []).length ? '<div class="sec-t">Dónde estás flojo</div>' + d.flojos.map(f => '<div class="card"><b>' + esc(f.tema) + '</b><div class="small muted">' + esc(f.porQue) + '</div><div class="small" style="margin-top:4px">→ ' + esc(f.queHacer) + '</div></div>').join('') : '') +
    ((d.bien || []).length ? '<div class="sec-t">Lo que está bien</div>' + d.bien.map(b => '<div class="card small">✓ ' + esc(b) + '</div>').join('') : '') +
    '<button class="btn sec block" style="margin-top:10px" onclick="chequeoView()">Volver</button>');
}
export function alertaChequeo() {
  const ult = chequeos().slice(-1)[0];
  const desde = ult ? days(parse(ult.fecha), today()) : null;
  if (desde != null && desde < 90) return [];
  const key = 'sistema:chequeo:' + (ult ? ult.fecha : 'nunca');
  if (isSnoozed(key)) return [];
  return [{ who: 'Chequeo trimestral del negocio', sub: 'Recordatorio', kind: 'sistema', id: '', key, d: 10, cls: 'soft', t: ult ? 'El último fue hace ' + desde + ' días' : 'Todavía no lo hiciste', accion: 'chequeoView()' }];
}
