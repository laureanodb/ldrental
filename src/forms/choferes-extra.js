// Seguimiento del chofer día a día: turnos de service agendados por la empresa
// con recordatorio, reclamos, llamados con motivo, cumpleaños y aniversarios,
// y la racha de semanas seguidas sin atrasarse.
import { S } from '../state.js';
import { esc, val, uid, iso, today, parse, days, fdate } from '../utils.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de, enPasada } from '../memo.js';
import { isContract, badge } from '../calc.js';
import { isSnoozed } from '../snooze.js';
import { settings } from '../settings.js';

const carDe = id => de('cars', 'id', id)[0];
const choferDe = id => de('drivers', 'id', id)[0];
const primerNombre = d => String((d && d.nombre) || '').split(' ')[0];
const empresa = () => settings.companyName || 'LD Rental';
export const waLink = (tel, texto) => 'https://wa.me/' + String(tel || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(texto);
const mañana = () => { const d = today(); d.setDate(d.getDate() + 1); return iso(d); };

/* ---------- Turnos de service agendados por la empresa + recordatorio ---------- */
export function agendarServiceForm(carId) {
  const c = carDe(carId); if (!c) return;
  openModal('<h3>Agendar service · ' + esc(c.patente) + '</h3>' +
    (c.choferId ? '<div class="small muted" style="margin-bottom:10px">' + esc((choferDe(c.choferId) || {}).nombre || '') + ' lo ve en su portal y el día anterior te aparece un aviso para recordárselo.</div>' : '') +
    '<label class="f"><span>Qué se le hace</span><input id="as_motivo" placeholder="ej: service de 10.000 km, frenos"></label>' +
    '<div class="two"><label class="f"><span>Día</span><input id="as_fecha" type="date" value="' + mañana() + '"></label>' +
    '<label class="f"><span>Hora</span><input id="as_hora" type="time"></label></div>' +
    '<label class="f"><span>Dónde / nota para el chofer <small>opcional</small></span><input id="as_nota" placeholder="ej: taller de calle Mitre 123"></label>' +
    '<div class="row"><button class="btn grow" onclick="guardarServiceAgendado(\'' + c.id + '\')">Agendar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\');setTabAuto(\'mant\')">Cancelar</button></div>');
}
export async function guardarServiceAgendado(carId) {
  const c = carDe(carId); if (!c) return;
  const fecha = val('as_fecha');
  if (!fecha) { toast('Poné el día'); return; }
  const t = { id: uid(), origen: 'empresa', pedidoEl: iso(today()), motivo: val('as_motivo') || 'Service', fecha, hora: val('as_hora'), fechaConfirmada: fecha, horaConfirmada: val('as_hora'), nota: val('as_nota'), estado: 'confirmado', respondido: iso(today()) };
  if (!(await save('cars', Object.assign({}, c, { turnosService: (c.turnosService || []).concat([t]) })))) return;
  toast('Service agendado');
  recordarServiceView(carId, t.id, true);
}
function textoRecordatorio(c, t) {
  const d = choferDe(c.choferId);
  const cuando = t.fechaConfirmada === iso(today()) ? 'hoy' : t.fechaConfirmada === mañana() ? 'mañana ' + fdate(t.fechaConfirmada) : 'el ' + fdate(t.fechaConfirmada);
  return 'Hola ' + primerNombre(d) + ', te recuerdo que ' + cuando + (t.horaConfirmada ? ' a las ' + t.horaConfirmada : '') + ' tenés turno de ' + (t.motivo || 'service').toLowerCase() + ' para el auto ' + (c.patente || '') + '.' + (t.nota ? ' ' + t.nota + '.' : '') + ' Cualquier cosa avisame. ¡Gracias!';
}
export function recordarServiceView(carId, tid, recienAgendado) {
  const c = carDe(carId); const t = c && (c.turnosService || []).find(x => x.id === tid); if (!t) return;
  const d = choferDe(c.choferId);
  openModal('<h3>' + (recienAgendado ? 'Service agendado' : 'Recordarle el service') + '</h3>' +
    '<div class="card small">' + esc(c.patente) + ' · ' + esc(t.motivo || 'Service') + ' · ' + fdate(t.fechaConfirmada) + (t.horaConfirmada ? ' ' + esc(t.horaConfirmada) : '') + (t.nota ? '<br>' + esc(t.nota) : '') + '</div>' +
    (d && d.tel ? '<a class="btn block" style="margin:10px 0 8px" target="_blank" rel="noopener" href="' + waLink(d.tel, textoRecordatorio(c, t)) + '" onclick="marcarServiceRecordado(\'' + c.id + '\',\'' + t.id + '\')">Mandarle el ' + (recienAgendado ? 'aviso' : 'recordatorio') + ' por WhatsApp</a>' : '<div class="small muted" style="margin:10px 0">' + (d ? 'El chofer no tiene teléfono cargado.' : 'El auto no tiene chofer asignado.') + '</div>') +
    (!recienAgendado && !t.recordado ? '<button class="btn sec block" style="margin-bottom:8px" onclick="marcarServiceRecordado(\'' + c.id + '\',\'' + t.id + '\',true)">Ya le avisé por otro lado</button>' : '') +
    '<button class="btn sec block" onclick="closeModal()">Cerrar</button>');
}
export async function marcarServiceRecordado(carId, tid, cerrar) {
  const c = carDe(carId); if (!c) return;
  const ok = await save('cars', Object.assign({}, c, { turnosService: (c.turnosService || []).map(t => (t.id === tid ? Object.assign({}, t, { recordado: iso(today()) }) : t)) }));
  if (ok && cerrar) { closeModal(); toast('Listo'); }
}

/* ---------- Reclamos del chofer ---------- */
export const MOTIVOS_RECLAMO = [['pagos', 'Pagos o cobros'], ['auto', 'El auto o el taller'], ['trato', 'Trato o atención'], ['portal', 'Portal o app'], ['sugerencia', 'Sugerencia'], ['otro', 'Otro']];
const motivoReclamo = k => (MOTIVOS_RECLAMO.find(x => x[0] === k) || [0, 'Otro'])[1];
export function seccionReclamos(d) {
  const L = (d.reclamos || []).slice().sort((a, b) => (a.estado === 'abierto' ? 0 : 1) - (b.estado === 'abierto' ? 0 : 1) || String(b.fecha).localeCompare(a.fecha));
  const abiertos = L.filter(r => r.estado === 'abierto').length;
  return '<div class="sec-t row between">Reclamos y sugerencias' + (abiertos ? badge('warn', abiertos + ' sin resolver') : '') + '</div>' +
    (L.length ? L.map(r => '<div class="card"><div class="row between"><b>' + esc(motivoReclamo(r.motivo)) + '</b>' + (r.estado === 'abierto' ? badge('warn', 'Sin resolver') : badge('ok', 'Resuelto')) + '</div>' +
      '<div class="small muted">' + fdate(r.fecha) + (r.origen === 'portal' ? ' · desde el portal' : '') + '</div>' +
      (r.detalle ? '<div style="margin-top:4px;white-space:pre-wrap">' + esc(r.detalle) + '</div>' : '') +
      (r.estado === 'resuelto' ? '<div class="small" style="margin-top:6px"><span class="muted">Cómo se resolvió (' + fdate(r.resueltoEl) + ', ' + days(parse(r.fecha), parse(r.resueltoEl)) + ' d):</span> ' + esc(r.resolucion || '—') + '</div>'
        : '<label class="f" style="margin-top:8px"><span>Cómo se resolvió</span><input id="rc_res_' + r.id + '" placeholder="ej: se le devolvió la diferencia"></label><div class="row"><button class="btn sm grow" onclick="resolverReclamo(\'' + d.id + '\',\'' + r.id + '\')">Marcar resuelto</button><button class="btn danger sm" onclick="confirmDel(this,()=>borrarReclamo(\'' + d.id + '\',\'' + r.id + '\'))">Borrar</button></div>') +
      '</div>').join('') : '<div class="small muted" style="margin-bottom:8px">Sin reclamos registrados.' + (d.portalToken ? ' El chofer también puede mandarlos desde su portal.' : '') + '</div>') +
    '<details style="margin-bottom:20px"><summary class="small" style="cursor:pointer;padding:6px 0">+ Anotar un reclamo</summary>' +
    '<label class="f"><span>Sobre qué</span><select id="rc_motivo">' + MOTIVOS_RECLAMO.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></label>' +
    '<label class="f"><span>Qué pasó</span><textarea id="rc_detalle"></textarea></label>' +
    '<button class="btn sec block" onclick="agregarReclamo(\'' + d.id + '\')">Guardar reclamo</button></details>';
}
async function guardarChofer(d, patch, msg) {
  if (await save('drivers', Object.assign({}, d, patch))) { toast(msg); window.driverForm(d.id); window.setTabChofer('hist'); }
}
export async function agregarReclamo(id) {
  const d = choferDe(id); if (!d) return;
  const detalle = val('rc_detalle');
  if (!detalle) { toast('Contá qué pasó'); return; }
  await guardarChofer(d, { reclamos: (d.reclamos || []).concat([{ id: uid(), fecha: iso(today()), motivo: val('rc_motivo'), detalle, estado: 'abierto', origen: 'app' }]) }, 'Reclamo anotado');
}
export async function resolverReclamo(id, rid) {
  const d = choferDe(id); if (!d) return;
  const el = document.getElementById('rc_res_' + rid);
  const resolucion = el ? el.value.trim() : '';
  if (!resolucion) { toast('Contá cómo se resolvió'); return; }
  await guardarChofer(d, { reclamos: (d.reclamos || []).map(r => (r.id === rid ? Object.assign({}, r, { estado: 'resuelto', resolucion, resueltoEl: iso(today()) }) : r)) }, 'Reclamo resuelto');
}
export async function borrarReclamo(id, rid) {
  const d = choferDe(id); if (!d) return;
  await guardarChofer(d, { reclamos: (d.reclamos || []).filter(r => r.id !== rid) }, 'Reclamo borrado');
}

/* ---------- Llamados y contactos con motivo ---------- */
export const MOTIVOS_CONTACTO = [['cobranza', 'Cobranza / atraso'], ['documentacion', 'Documentación'], ['auto', 'Auto o taller'], ['multas', 'Multas'], ['seguimiento', 'Seguimiento / cómo anda'], ['otro', 'Otro']];
export const motivoContacto = k => (MOTIVOS_CONTACTO.find(x => x[0] === k) || [0, ''])[1];
export function ultimoContacto(d) {
  const L = (d.comunicaciones || []).slice().sort((a, b) => String(b.fecha).localeCompare(a.fecha));
  return L[0] || null;
}
export function llamarYAnotar(id) {
  const d = choferDe(id); if (!d || !d.tel) return;
  const tipo = document.getElementById('cm_tipo'); if (tipo) tipo.value = 'llamada';
  const f = document.getElementById('cm_fecha'); if (f) f.value = iso(today());
  location.href = 'tel:' + String(d.tel).replace(/[^\d+]/g, '');
  setTimeout(() => { const n = document.getElementById('cm_notas'); if (n) n.focus(); }, 400);
}

/* ---------- Cumpleaños y aniversarios ---------- */
export function fechaIngreso(d) {
  if (d.fechaIngreso) return d.fechaIngreso;
  const fechas = [];
  S.cars.forEach(c => {
    (c.historialChoferes || []).forEach(h => { if (h.choferId === d.id && h.desde) fechas.push(h.desde); });
    if (c.choferId === d.id && c.inicio) fechas.push(c.inicio);
  });
  return fechas.sort()[0] || '';
}
// Días hasta el próximo aniversario de una fecha (negativo si fue hace poco este año).
function diasAlAniversario(f) {
  if (!f) return null;
  const hoy = today(), p = parse(f);
  const este = new Date(hoy.getFullYear(), p.getMonth(), p.getDate());
  return days(hoy, este);
}
function fechasEspeciales(d) {
  const out = [], anio = today().getFullYear();
  const dc = diasAlAniversario(d.fechaNacimiento);
  if (dc != null && dc >= -2 && dc <= 1) out.push({ tipo: 'cumple', dias: dc, clave: 'cumple-' + anio, años: d.fechaNacimiento ? anio - +d.fechaNacimiento.slice(0, 4) : 0 });
  const fi = fechaIngreso(d);
  if (fi && +fi.slice(0, 4) < anio) {
    const da = diasAlAniversario(fi);
    if (da != null && da >= -2 && da <= 1) out.push({ tipo: 'aniversario', dias: da, clave: 'aniv-' + anio, años: anio - +fi.slice(0, 4) });
  }
  return out.filter(x => !(d.saludos || {})[x.clave]);
}
function textoSaludo(d, x) {
  if (x.tipo === 'cumple') return '¡Feliz cumpleaños, ' + primerNombre(d) + '! 🎉 Que tengas un gran día. Un abrazo de todo el equipo de ' + empresa() + '.';
  return '¡Hola ' + primerNombre(d) + '! Hoy se cumple' + (x.años === 1 ? ' 1 año' : 'n ' + x.años + ' años') + ' desde que trabajás con nosotros. Gracias por la confianza y por cuidar el auto. ¡Vamos por más! — ' + empresa();
}
export function saludoView(id, tipo) {
  const d = choferDe(id); if (!d) return;
  const x = fechasEspeciales(d).find(f => f.tipo === tipo); if (!x) { toast('Ya lo saludaste'); return; }
  const cuando = x.dias === 0 ? 'hoy' : x.dias === 1 ? 'mañana' : 'hace ' + (-x.dias) + ' día' + (x.dias === -1 ? '' : 's');
  openModal('<h3>' + (tipo === 'cumple' ? '🎂 Cumpleaños' : '🎉 Aniversario') + ' de ' + esc(d.nombre) + '</h3>' +
    '<div class="small muted" style="margin-bottom:10px">' + (tipo === 'cumple' ? 'Cumple ' + (x.años ? x.años + ' años ' : '') + cuando : 'Cumple ' + x.años + (x.años === 1 ? ' año' : ' años') + ' con la empresa ' + cuando) + '.</div>' +
    '<label class="f"><span>Mensaje</span><textarea id="sl_txt" rows="4">' + esc(textoSaludo(d, x)) + '</textarea></label>' +
    (d.tel ? '<button class="btn block" style="margin-bottom:8px" onclick="mandarSaludo(\'' + d.id + '\',\'' + tipo + '\')">Mandar por WhatsApp</button>' : '<div class="small muted" style="margin-bottom:8px">No tiene teléfono cargado.</div>') +
    '<button class="btn sec block" style="margin-bottom:8px" onclick="marcarSaludado(\'' + d.id + '\',\'' + tipo + '\',true)">Ya lo saludé</button>' +
    '<button class="btn sec block" onclick="closeModal()">Cerrar</button>');
}
export function mandarSaludo(id, tipo) {
  const d = choferDe(id); if (!d) return;
  window.open(waLink(d.tel, val('sl_txt')), '_blank', 'noopener');
  marcarSaludado(id, tipo, true);
}
export async function marcarSaludado(id, tipo, cerrar) {
  const d = choferDe(id); if (!d) return;
  const x = fechasEspeciales(d).find(f => f.tipo === tipo); if (!x) { if (cerrar) closeModal(); return; }
  if (await save('drivers', Object.assign({}, d, { saludos: Object.assign({}, d.saludos || {}, { [x.clave]: iso(today()) }) })) && cerrar) { closeModal(); toast('Anotado'); }
}

/* ---------- Racha de semanas seguidas sin atrasarse ---------- */
// Una semana cuenta si al terminar (día 7) lo pagado más los ajustes cubre todas las semanas hasta esa.
function rachaAuto(c) {
  const kind = c.tipo === 'alquiler' ? 'alquiler' : 'cuota';
  const inicio = parse(c.inicio), monto = +c.monto, inicial = Math.max(0, +c.deudaInicial || 0);
  const transcurridos = days(inicio, today());
  if (transcurridos < 0) return 0;
  const movs = de('payments', 'carId', c.id).filter(p => p.carId === c.id && p.tipo === kind && p.fecha >= c.inicio).map(p => [p.fecha, +p.monto || 0])
    .concat((c.ajustesDeuda || []).map(a => [a.fecha || c.inicio, +a.monto || 0])).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  let completas = Math.floor(transcurridos / 7);
  if (c.tipo === 'financiado' && +c.cuotas) completas = Math.min(completas, +c.cuotas);
  const pagadoHasta = f => movs.reduce((s, m) => (m[0] <= f ? s + m[1] : s), 0);
  let racha = 0;
  // La semana en curso suma si ya está cubierta.
  if (!(c.tipo === 'financiado' && +c.cuotas && completas >= +c.cuotas) && pagadoHasta(iso(today())) >= (completas + 1) * monto + inicial - 1) racha++;
  for (let k = completas - 1; k >= 0; k--) {
    const fin = new Date(inicio); fin.setDate(fin.getDate() + k * 7 + 6);
    if (pagadoHasta(iso(fin)) >= (k + 1) * monto + inicial - 1) racha++; else break;
  }
  return racha;
}
export function rachaSinAtraso(driverId) {
  return enPasada('racha:' + driverId, () => {
    const cars = de('cars', 'choferId', driverId).filter(c => c.choferId === driverId && isContract(c) && c.inicio && +c.monto > 0);
    if (!cars.length) return null;
    return Math.min(...cars.map(rachaAuto));
  });
}
export function textoRacha(n) {
  if (n == null) return '';
  return n === 0 ? 'Sin racha (tiene atraso)' : n + (n === 1 ? ' semana seguida' : ' semanas seguidas') + ' sin atrasarse';
}

/* ---------- Avisos ---------- */
export function alertasChoferes() {
  const out = [];
  const add = o => { if (!isSnoozed(o.key)) out.push(o); };
  const hoy = iso(today()), man = mañana();
  S.cars.filter(c => !c.vendido && c.choferId).forEach(c => {
    (c.turnosService || []).filter(t => t.estado === 'confirmado' && !t.recordado && (t.fechaConfirmada === hoy || t.fechaConfirmada === man)).forEach(t => add({
      who: c.patente || 'Auto', sub: 'Recordarle el service al chofer', kind: 'car', id: c.id, key: 'car:' + c.id + ':recservice:' + t.id, d: t.fechaConfirmada === hoy ? 0 : 1, cls: 'warn',
      t: (t.fechaConfirmada === hoy ? 'Hoy' : 'Mañana') + (t.horaConfirmada ? ' ' + t.horaConfirmada : '') + ' · ' + (t.motivo || 'Service'), accion: "recordarServiceView('" + c.id + "','" + t.id + "')",
    }));
  });
  S.drivers.filter(d => !d.inactivo && !d.prospecto).forEach(d => {
    fechasEspeciales(d).forEach(x => add({
      who: d.nombre, sub: x.tipo === 'cumple' ? 'Cumpleaños' : 'Aniversario con la empresa', kind: 'driver', id: d.id, key: 'driver:' + d.id + ':' + x.clave, d: Math.max(0, x.dias), cls: 'soft',
      t: (x.dias === 0 ? 'Hoy' : x.dias === 1 ? 'Mañana' : 'Fue hace ' + (-x.dias) + ' d') + (x.tipo === 'aniversario' ? ' · ' + x.años + (x.años === 1 ? ' año' : ' años') : ''), accion: "saludoView('" + d.id + "','" + x.tipo + "')",
    }));
    (d.reclamos || []).filter(r => r.estado === 'abierto').forEach(r => {
      const dias = days(parse(r.fecha), today());
      add({ who: d.nombre, sub: 'Reclamo sin resolver', kind: 'driver', id: d.id, key: 'driver:' + d.id + ':reclamo:' + r.id, d: dias >= 3 ? 0 : 3, cls: dias >= 3 ? 'warn' : 'soft', t: motivoReclamo(r.motivo) + ' · hace ' + dias + ' d' + (r.origen === 'portal' ? ' (desde el portal)' : ''), accion: "driverForm('" + d.id + "');setTabChofer('hist')" });
    });
  });
  return out;
}
