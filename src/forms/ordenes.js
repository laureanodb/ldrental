// Órdenes de trabajo del taller. Viven dentro de cada auto (c.ordenes), así no
// hace falta una tabla nueva. Cada acción se guarda al instante.
import { S, ui } from '../state.js';
import { esc, val, uid, iso, today, fdate, money, num1 } from '../utils.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de } from '../memo.js';
import { settings, saveSettings } from '../settings.js';
import { badge, proveedoresActivos } from '../calc.js';
import { canDelete, isAdmin } from '../roles.js';
import { subirArchivoSuelto } from '../files.js';
import { hydrateThumbs } from '../storage.js';
import { registrarSalidaStock } from './repuesto.js';
import { itemsActivos, tipoDe, costoDe, stockDe, unidades } from '../panol.js';

export const OT_ESTADOS = [
  ['reportada', 'Reportada por el chofer', 'warn'],
  ['abierta', 'Abierta', 'info'],
  ['en_reparacion', 'En reparación', 'info'],
  ['esperando_repuesto', 'Esperando repuesto', 'warn'],
  ['lista', 'Lista para retirar', 'ok'],
  ['cerrada', 'Cerrada', 'mute'],
  ['cancelada', 'Cancelada', 'mute'],
];
const estadoLabel = k => (OT_ESTADOS.find(x => x[0] === k) || [0, k])[1];
const estadoCls = k => (OT_ESTADOS.find(x => x[0] === k) || [0, 0, 'mute'])[2];
export const otAbierta = o => !['cerrada', 'cancelada'].includes(o.estado);
const carDe = id => de('cars', 'id', id)[0];
const valorHora = () => +settings.valorHoraMecanico || 0;

export function costosOT(o) {
  const repuestos = (o.repuestos || []).reduce((a, r) => a + (+r.cant || 0) * (+r.costoUnit || 0), 0);
  const manoPropia = (o.horas || []).reduce((a, h) => a + (+h.horas || 0) * (+h.valorHora || 0), 0);
  const horas = (o.horas || []).reduce((a, h) => a + (+h.horas || 0), 0);
  const externa = +o.manoObraExterna || 0, otros = +o.otrosCostos || 0;
  return { repuestos, manoPropia, horas, externa, otros, total: repuestos + manoPropia + externa + otros };
}
export function todasLasOrdenes() {
  const out = [];
  S.cars.forEach(c => (c.ordenes || []).forEach(o => out.push({ c, o })));
  return out.sort((a, b) => (b.o.fecha || '').localeCompare(a.o.fecha || '') || (b.o.numero || 0) - (a.o.numero || 0));
}
const proximoNumero = () => todasLasOrdenes().reduce((m, x) => Math.max(m, +x.o.numero || 0), 0) + 1;

async function guardarOT(c, o, msg) {
  const ordenes = (c.ordenes || []).some(x => x.id === o.id) ? c.ordenes.map(x => (x.id === o.id ? o : x)) : (c.ordenes || []).concat([o]);
  if (!(await save('cars', Object.assign({}, c, { ordenes })))) return false;
  if (msg) toast(msg);
  return true;
}
const buscar = (carId, otId) => { const c = carDe(carId); const o = c && (c.ordenes || []).find(x => x.id === otId); return { c, o }; };

/* ---------- Sección en la ficha del auto ---------- */
export function seccionOrdenes(c) {
  const L = (c.ordenes || []).slice().sort((a, b) => (otAbierta(b) ? 1 : 0) - (otAbierta(a) ? 1 : 0) || (b.fecha || '').localeCompare(a.fecha || ''));
  return '<div class="sec-t row between">Órdenes de trabajo<span class="small muted">' + L.filter(otAbierta).length + ' abierta' + (L.filter(otAbierta).length === 1 ? '' : 's') + '</span></div>' +
    L.slice(0, 6).map(o => filaOT(c, o)).join('') +
    '<button class="btn sec block" style="margin:6px 0 14px" onclick="nuevaOTForm(\'' + c.id + '\')">+ Nueva orden de trabajo</button>';
}
function filaOT(c, o, conPatente) {
  const k = costosOT(o);
  return '<div class="card tap" onclick="otForm(\'' + c.id + '\',\'' + o.id + '\')"><div class="row between"><div style="min-width:0"><b>' + (conPatente ? esc(c.patente) + ' · ' : '') + 'OT ' + (o.numero || '') + '</b> ' + esc(o.titulo || 'Sin título') +
    '<div class="small muted">' + fdate(o.fecha) + (o.origen === 'portal' ? ' · la reportó el chofer' : '') + (o.mecanico ? ' · ' + esc(o.mecanico) : '') + (k.total ? ' · ' + money(k.total) : '') + (o.opinionChofer ? ' · chofer: ' + (o.opinionChofer.resultado === 'bien' ? 'quedó bien' : 'sigue fallando') : '') + '</div></div>' +
    badge(estadoCls(o.estado), estadoLabel(o.estado)) + '</div></div>';
}

/* ---------- Nueva orden ---------- */
export function nuevaOTForm(carId) {
  const c = carId ? carDe(carId) : null;
  const cars = S.cars.filter(x => !x.vendido).sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  openModal('<h3>Nueva orden de trabajo</h3>' +
    (c ? '<input type="hidden" id="ot_car" value="' + c.id + '"><div class="small muted" style="margin-bottom:10px">' + esc(c.patente) + ' · ' + esc([c.marca, c.modelo].filter(Boolean).join(' ')) + '</div>' :
      '<label class="f"><span>Auto</span><select id="ot_car">' + cars.map(x => '<option value="' + x.id + '">' + esc(x.patente) + '</option>').join('') + '</select></label>') +
    '<label class="f"><span>Qué hay que hacer</span><input id="ot_titulo" placeholder="ej: ruido en tren delantero"></label>' +
    '<label class="f"><span>Detalle <small>opcional</small></span><textarea id="ot_desc"></textarea></label>' +
    '<div class="two"><label class="f"><span>Tipo</span><select id="ot_tipo"><option value="correctivo">Arreglo (correctivo)</option><option value="preventivo">Preventivo / service</option></select></label>' +
    '<label class="f"><span>Km</span><input id="ot_km" inputmode="numeric" value="' + esc(c ? c.km || '' : '') + '"></label></div>' +
    '<div class="two"><label class="f"><span>Quién lo hace</span><select id="ot_taller"><option value="propio">Taller propio</option>' + proveedoresActivos().map(p => '<option value="' + p.id + '">' + esc(p.nombre) + '</option>').join('') + '</select></label>' +
    '<label class="f"><span>Mecánico <small>opcional</small></span><input id="ot_mecanico" list="ot_mecs"><datalist id="ot_mecs">' + mecanicos().map(m => '<option value="' + esc(m) + '">').join('') + '</datalist></label></div>' +
    (c && c.tipo === 'taller' ? '' : '<label class="chk"><input type="checkbox" id="ot_parado"><span>El auto queda parado en el taller</span></label>') +
    '<div class="row"><button class="btn grow" onclick="crearOT()">Abrir orden</button><button class="btn sec" onclick="' + (c ? "carForm('" + c.id + "')" : 'closeModal()') + '">Cancelar</button></div>');
}
const mecanicos = () => [...new Set(todasLasOrdenes().flatMap(x => [x.o.mecanico].concat((x.o.horas || []).map(h => h.mecanico))).filter(Boolean))];
export async function crearOT() {
  const c = carDe(val('ot_car')); if (!c) return;
  const titulo = val('ot_titulo');
  if (!titulo) { toast('Escribí qué hay que hacer'); return; }
  const taller = val('ot_taller');
  const o = {
    id: uid(), numero: proximoNumero(), fecha: iso(today()), estado: 'abierta', origen: 'app', tipo: val('ot_tipo'), titulo, descripcion: val('ot_desc'),
    km: +val('ot_km') || +c.km || 0, proveedorId: taller === 'propio' ? '' : taller, mecanico: val('ot_mecanico'),
    tareas: [], repuestos: [], horas: [], fotosAntes: [], fotosDespues: [], creadoPor: (S.user && S.user.email) || '',
  };
  const parado = document.getElementById('ot_parado');
  if (parado && parado.checked) o.dejoEnTaller = true;
  if (!(await guardarOT(c, o, 'Orden ' + o.numero + ' abierta'))) return;
  if (o.dejoEnTaller) await window.marcarEnTaller(c.id);
  otForm(c.id, o.id);
}

/* ---------- Ficha de la orden ---------- */
export function otForm(carId, otId) {
  const { c, o } = buscar(carId, otId);
  if (!o) { toast('No se encontró la orden'); return; }
  const k = costosOT(o), abierta = otAbierta(o);
  const prov = o.proveedorId ? de('proveedores', 'id', o.proveedorId)[0] : null;
  let h = '<h3>OT ' + o.numero + ' · ' + esc(c.patente) + '</h3>' +
    '<div class="row between" style="margin-bottom:10px">' + badge(estadoCls(o.estado), estadoLabel(o.estado)) + '<span class="small muted">' + fdate(o.fecha) + (o.km ? ' · ' + Number(o.km).toLocaleString('es-AR') + ' km' : '') + ' · ' + (prov ? esc(prov.nombre) : 'taller propio') + '</span></div>';
  if (o.origen === 'portal') h += '<div class="card small" style="margin-bottom:10px">La reportó ' + esc(o.reportadoPor || 'el chofer') + ' desde el portal.</div>';
  if (o.opinionChofer) h += '<div class="card small" style="margin-bottom:10px">Opinión del chofer (' + fdate(o.opinionChofer.fecha) + '): <b>' + (o.opinionChofer.resultado === 'bien' ? 'quedó bien' : 'sigue fallando') + '</b>' + (o.opinionChofer.comentario ? ' · ' + esc(o.opinionChofer.comentario) : '') +
    (o.opinionChofer.resultado !== 'bien' && !o.opinionAtendida ? '<div class="row" style="margin-top:6px"><button class="btn sm grow" onclick="reabrirOT(\'' + c.id + '\',\'' + o.id + '\')">Abrir otra orden</button><button class="btn sec sm" onclick="atenderOpinionOT(\'' + c.id + '\',\'' + o.id + '\')">Ya lo resolví</button></div>' : '') + '</div>';

  h += '<label class="f"><span>Qué hay que hacer</span><input id="otf_titulo" value="' + esc(o.titulo) + '"' + (abierta ? '' : ' disabled') + '></label>' +
    '<label class="f"><span>Detalle</span><textarea id="otf_desc"' + (abierta ? '' : ' disabled') + '>' + esc(o.descripcion || '') + '</textarea></label>' +
    '<div class="two"><label class="f"><span>Mecánico</span><input id="otf_mecanico" value="' + esc(o.mecanico || '') + '"' + (abierta ? '' : ' disabled') + '></label>' +
    '<label class="f"><span>Estado</span><select id="otf_estado"' + (abierta ? '' : ' disabled') + '>' + OT_ESTADOS.filter(x => x[0] !== 'cerrada').map(x => '<option value="' + x[0] + '"' + (o.estado === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + (o.estado === 'cerrada' ? '<option selected>Cerrada</option>' : '') + '</select></label></div>' +
    '<div class="two"><label class="f"><span>Mano de obra de afuera <small>$</small></span><input id="otf_externa" inputmode="decimal" value="' + esc(o.manoObraExterna || '') + '"' + (abierta ? '' : ' disabled') + '></label>' +
    '<label class="f"><span>Otros costos <small>$</small></span><input id="otf_otros" inputmode="decimal" value="' + esc(o.otrosCostos || '') + '"' + (abierta ? '' : ' disabled') + '></label></div>' +
    (abierta ? '<button class="btn sec block" style="margin-bottom:12px" onclick="guardarDatosOT(\'' + c.id + '\',\'' + o.id + '\')">Guardar cambios</button>' : '');

  // Tareas
  h += '<div class="sec-t">Tareas</div>' + ((o.tareas || []).length ? o.tareas.map(t => '<label class="chk"><input type="checkbox"' + (t.hecho ? ' checked' : '') + (abierta ? ' onchange="toggleTareaOT(\'' + c.id + '\',\'' + o.id + '\',\'' + t.id + '\')"' : ' disabled') + '><span>' + esc(t.texto) + '</span></label>').join('') : '<div class="small muted">Sin tareas.</div>') +
    (abierta ? '<div class="row" style="margin:6px 0 12px"><input id="otf_tarea" class="grow" placeholder="ej: cambiar bieletas"><button class="btn sec sm" onclick="agregarTareaOT(\'' + c.id + '\',\'' + o.id + '\')">Agregar</button></div>' : '');

  // Repuestos del pañol
  h += '<div class="sec-t row between">Repuestos<span class="small muted">' + money(k.repuestos) + '</span></div>' +
    ((o.repuestos || []).length ? o.repuestos.map(r => '<div class="row between small" style="padding:3px 0"><span>' + num1(r.cant) + ' × ' + esc(r.nombre) + (r.descontado ? ' <span class="muted">(descontado)</span>' : '') + '</span><span>' + money(r.cant * r.costoUnit) + (abierta ? ' <button class="btn sec sm" onclick="quitarRepuestoOT(\'' + c.id + '\',\'' + o.id + '\',\'' + r.id + '\')">✕</button>' : '') + '</span></div>').join('') : '<div class="small muted">Sin repuestos.</div>');
  if (abierta) {
    const items = itemsActivos().filter(r => tipoDe(r) !== 'herramienta').sort((a, b) => a.nombre.localeCompare(b.nombre));
    h += items.length ? '<div class="row" style="margin:6px 0 12px;flex-wrap:wrap"><select id="otf_rep" style="flex:2">' + items.map(r => '<option value="' + r.id + '">' + esc(r.nombre) + ' (hay ' + num1(stockDe(r)) + ')</option>').join('') + '</select>' +
      '<input id="otf_repcant" inputmode="decimal" value="1" style="width:70px"><button class="btn sec sm" onclick="agregarRepuestoOT(\'' + c.id + '\',\'' + o.id + '\')">Agregar</button></div>' +
      '<div class="small muted" style="margin:-6px 0 12px">Se descuentan del pañol al cerrar la orden.</div>' : '<div class="small muted" style="margin-bottom:12px">Cargá repuestos en el pañol para usarlos acá.</div>';
  }

  // Horas del mecánico
  h += '<div class="sec-t row between">Horas de mecánico<span class="small muted">' + num1(k.horas) + ' h' + (k.manoPropia ? ' · ' + money(k.manoPropia) : '') + '</span></div>' +
    ((o.horas || []).length ? o.horas.map(x => '<div class="row between small" style="padding:3px 0"><span>' + fdate(x.fecha) + ' · ' + esc(x.mecanico || 'Mecánico') + ' · ' + num1(x.horas) + ' h</span><span>' + (x.valorHora ? money(x.horas * x.valorHora) : '') + (abierta ? ' <button class="btn sec sm" onclick="quitarHorasOT(\'' + c.id + '\',\'' + o.id + '\',\'' + x.id + '\')">✕</button>' : '') + '</span></div>').join('') : '<div class="small muted">Sin horas cargadas.</div>');
  if (abierta) {
    h += '<div class="row" style="margin:6px 0 4px;flex-wrap:wrap"><input id="otf_horas" inputmode="decimal" placeholder="Horas" style="width:80px"><input id="otf_horamec" placeholder="Mecánico" value="' + esc(o.mecanico || '') + '" style="flex:1"><button class="btn sec sm" onclick="agregarHorasOT(\'' + c.id + '\',\'' + o.id + '\')">Agregar</button></div>' +
      '<div class="small muted" style="margin-bottom:12px">Valor de la hora: ' + (valorHora() ? money(valorHora()) : 'sin cargar') + ' · <a class="tap" style="text-decoration:underline" onclick="valorHoraForm(\'' + c.id + '\',\'' + o.id + '\')">cambiar</a></div>';
  }

  // Fotos antes y después
  h += '<div class="sec-t">Fotos</div><div class="two">' + ['fotosAntes', 'fotosDespues'].map(k2 => '<div><div class="small muted" style="margin-bottom:4px">' + (k2 === 'fotosAntes' ? 'Antes (cómo llegó)' : 'Después (cómo quedó)') + '</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:4px">' + (o[k2] || []).map(f => '<img class="fthumb tap" alt="" data-path="' + esc(f.id) + '" onclick="viewFile(\'' + esc(f.id) + '\',\'' + esc(f.name || 'foto') + '\')">').join('') + '</div>' +
    '<label class="btn sec sm" style="margin-top:6px;cursor:pointer">+ Foto<input type="file" accept="image/*" capture="environment" hidden onchange="subirFotoOT(\'' + c.id + '\',\'' + o.id + '\',\'' + k2 + '\',this)"></label></div>').join('') + '</div>' +
    '<div id="otf_fstatus" class="small muted" style="margin:6px 0 12px"></div>';

  // Total
  h += '<div class="card" style="margin-bottom:12px">' +
    [['Repuestos del pañol', k.repuestos], ['Mano de obra propia', k.manoPropia], ['Mano de obra de afuera', k.externa], ['Otros', k.otros]].filter(x => x[1]).map(([l, v]) => '<div class="row between small"><span class="muted">' + l + '</span><span>' + money(v) + '</span></div>').join('') +
    '<div class="row between"><b>Costo total del arreglo</b><b>' + money(k.total) + '</b></div>' +
    '<div class="small muted" style="margin-top:4px">Al cerrar, queda en el historial de mantenimiento con lo pagado afuera (' + money(k.externa + k.otros) + '). Los repuestos ya se contaron al comprarlos y la mano de obra propia es costo interno.</div></div>';

  if (abierta) h += '<div class="row"><button class="btn grow" onclick="cerrarOTForm(\'' + c.id + '\',\'' + o.id + '\')">Cerrar orden</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Volver al auto</button></div>' +
    (canDelete() ? '<button class="btn danger block" style="margin-top:10px" onclick="confirmDel(this,()=>cancelarOT(\'' + c.id + '\',\'' + o.id + '\'))">Cancelar orden</button>' : '');
  else h += '<div class="small muted" style="margin-bottom:8px">' + (o.estado === 'cerrada' ? 'Cerrada el ' + fdate(o.fechaCierre) : 'Cancelada') + '.</div><button class="btn sec block" onclick="carForm(\'' + c.id + '\')">Volver al auto</button>';
  openModal(h);
  hydrateThumbs(document.getElementById('modal'));
}
async function cambiar(carId, otId, fn, msg) {
  const { c, o } = buscar(carId, otId); if (!o) return;
  const n = fn(Object.assign({}, o));
  if (n === false) return;
  if (await guardarOT(c, n || o, msg)) otForm(carId, otId);
}
export function guardarDatosOT(carId, otId) {
  return cambiar(carId, otId, o => {
    o.titulo = val('otf_titulo') || o.titulo; o.descripcion = val('otf_desc'); o.mecanico = val('otf_mecanico');
    o.estado = val('otf_estado'); o.manoObraExterna = +val('otf_externa') || 0; o.otrosCostos = +val('otf_otros') || 0;
    return o;
  }, 'Orden guardada');
}
export function agregarTareaOT(carId, otId) {
  const texto = val('otf_tarea'); if (!texto) { toast('Escribí la tarea'); return; }
  return cambiar(carId, otId, o => { o.tareas = (o.tareas || []).concat([{ id: uid(), texto, hecho: false }]); return o; });
}
export function toggleTareaOT(carId, otId, tid) {
  return cambiar(carId, otId, o => { o.tareas = (o.tareas || []).map(t => (t.id === tid ? Object.assign({}, t, { hecho: !t.hecho }) : t)); return o; });
}
export function agregarRepuestoOT(carId, otId) {
  const r = de('repuestos', 'id', val('otf_rep'))[0]; if (!r) return;
  const cant = +String(val('otf_repcant')).replace(',', '.') || 0;
  if (cant <= 0) { toast('Poné la cantidad'); return; }
  if (cant > stockDe(r)) toast('Atención: en el pañol hay ' + num1(stockDe(r)) + ' ' + unidades(r, stockDe(r)));
  return cambiar(carId, otId, o => { o.repuestos = (o.repuestos || []).concat([{ id: uid(), rid: r.id, nombre: r.nombre, cant, costoUnit: costoDe(r) }]); return o; });
}
export function quitarRepuestoOT(carId, otId, id) { return cambiar(carId, otId, o => { o.repuestos = (o.repuestos || []).filter(r => r.id !== id); return o; }); }
export function agregarHorasOT(carId, otId) {
  const horas = +String(val('otf_horas')).replace(',', '.') || 0;
  if (horas <= 0) { toast('Poné las horas'); return; }
  return cambiar(carId, otId, o => { o.horas = (o.horas || []).concat([{ id: uid(), fecha: iso(today()), horas, mecanico: val('otf_horamec'), valorHora: valorHora() }]); return o; });
}
export function quitarHorasOT(carId, otId, id) { return cambiar(carId, otId, o => { o.horas = (o.horas || []).filter(x => x.id !== id); return o; }); }
export function valorHoraForm(carId, otId) {
  openModal('<h3>Valor de la hora del mecánico</h3><div class="small muted" style="margin-bottom:10px">Lo que te cuesta una hora de tu mecánico (sueldo y cargas divididos por las horas que trabaja). Se usa para calcular el costo real de cada arreglo.</div>' +
    '<label class="f"><span>Valor por hora</span><input id="vh_valor" inputmode="decimal" value="' + esc(valorHora() || '') + '"></label>' +
    '<div class="row"><button class="btn grow" onclick="guardarValorHora(\'' + carId + '\',\'' + otId + '\')">Guardar</button><button class="btn sec" onclick="otForm(\'' + carId + '\',\'' + otId + '\')">Cancelar</button></div>');
}
export function guardarValorHora(carId, otId) { saveSettings({ valorHoraMecanico: +val('vh_valor') || 0 }); toast('Valor guardado'); otForm(carId, otId); }
export async function subirFotoOT(carId, otId, campo, input) {
  const f = input.files && input.files[0]; if (!f) return;
  const st = document.getElementById('otf_fstatus'); if (st) st.textContent = 'Subiendo foto…';
  const r = await subirArchivoSuelto(f);
  input.value = '';
  if (!r) { if (st) st.textContent = ''; return; }
  const foto = { id: r.id, name: (campo === 'fotosAntes' ? 'antes-' : 'despues-') + iso(today()) + '.jpg', type: r.type, fecha: iso(today()) };
  return cambiar(carId, otId, o => { o[campo] = (o[campo] || []).concat([foto]); return o; }, 'Foto agregada');
}
export function cerrarOTForm(carId, otId) {
  const { c, o } = buscar(carId, otId); if (!o) return;
  const pend = (o.tareas || []).filter(t => !t.hecho).length;
  const k = costosOT(o);
  openModal('<h3>Cerrar OT ' + o.numero + '</h3>' +
    (pend ? '<div class="card small" style="color:var(--warn)">Quedan ' + pend + ' tarea' + (pend === 1 ? '' : 's') + ' sin marcar como hecha' + (pend === 1 ? '' : 's') + '.</div>' : '') +
    (!(o.fotosDespues || []).length ? '<div class="card small" style="color:var(--warn)">No hay fotos de cómo quedó.</div>' : '') +
    '<div class="small muted" style="margin:8px 0">Al cerrar: se descuentan del pañol ' + (o.repuestos || []).filter(r => !r.descontado).length + ' repuesto(s) y queda en el historial de mantenimiento por ' + money(k.externa + k.otros) + '.</div>' +
    '<div class="two"><label class="f"><span>Fecha de cierre</span><input id="otc_fecha" type="date" value="' + iso(today()) + '"></label>' +
    '<label class="f"><span>Km</span><input id="otc_km" inputmode="numeric" value="' + esc(o.km || c.km || '') + '"></label></div>' +
    (c.tipo === 'taller' ? '<label class="chk"><input type="checkbox" id="otc_sacar" checked><span>Sacar el auto del taller</span></label>' : '') +
    '<div class="row"><button class="btn grow" onclick="cerrarOT(\'' + c.id + '\',\'' + o.id + '\')">Cerrar orden</button><button class="btn sec" onclick="otForm(\'' + c.id + '\',\'' + o.id + '\')">Volver</button></div>');
}
export async function cerrarOT(carId, otId) {
  const { c, o } = buscar(carId, otId); if (!o) return;
  const fecha = val('otc_fecha') || iso(today()), km = +val('otc_km') || +o.km || 0;
  const sacar = document.getElementById('otc_sacar');
  const sacarTaller = sacar && sacar.checked;
  const repuestos = [];
  for (const r of (o.repuestos || [])) {
    if (!r.descontado && await registrarSalidaStock(r.rid, r.cant, fecha, c.id, 'OT ' + o.numero + ': ' + o.titulo, o.mecanico)) repuestos.push(Object.assign({}, r, { descontado: true }));
    else repuestos.push(r);
  }
  const k = costosOT(Object.assign({}, o, { repuestos }));
  const mantId = uid();
  await save('mantenimientos', {
    id: mantId, carId: c.id, item: 'ot', label: 'OT ' + o.numero + ': ' + o.titulo, tipo: o.tipo || 'correctivo', fecha, km,
    proveedorId: o.proveedorId || '', costo: k.externa + k.otros, otId: o.id,
    notas: [o.descripcion, (o.tareas || []).filter(t => t.hecho).map(t => '✓ ' + t.texto).join('\n'), repuestos.length ? 'Repuestos del pañol: ' + repuestos.map(r => num1(r.cant) + ' × ' + r.nombre).join(', ') : '', k.horas ? 'Horas de mecánico: ' + num1(k.horas) : ''].filter(Boolean).join('\n'),
    files: (o.fotosAntes || []).map(f => Object.assign({}, f, { cat: 'antes' })).concat((o.fotosDespues || []).map(f => Object.assign({}, f, { cat: 'despues' }))),
  });
  const c2 = carDe(carId);
  const cerrada = Object.assign({}, o, { repuestos, estado: 'cerrada', fechaCierre: fecha, km, costoTotal: k.total, mantenimientoId: mantId });
  await guardarOT(c2, cerrada, 'Orden ' + o.numero + ' cerrada');
  if (km > (+c2.km || 0)) await save('cars', Object.assign({}, carDe(carId), { km, kmHistorial: (carDe(carId).kmHistorial || []).concat([{ fecha, km }]) }));
  if (sacarTaller) await window.sacarDeTaller(carId);
  window.carForm(carId); window.setTabAuto('mant');
}
export async function cancelarOT(carId, otId) {
  const { c, o } = buscar(carId, otId); if (!o) return;
  if (await guardarOT(c, Object.assign({}, o, { estado: 'cancelada', fechaCierre: iso(today()) }), 'Orden cancelada')) { window.carForm(carId); window.setTabAuto('mant'); }
}

/* ---------- Tablero de órdenes (Más) ---------- */
export function ordenesView() {
  const L = todasLasOrdenes();
  const f = ui.otFiltro || 'abiertas';
  const mes = iso(today()).slice(0, 7);
  const delMes = L.filter(x => (x.o.fechaCierre || '').slice(0, 7) === mes && x.o.estado === 'cerrada');
  const horasMes = L.reduce((a, x) => a + (x.o.horas || []).filter(hh => (hh.fecha || '').slice(0, 7) === mes).reduce((b, hh) => b + (+hh.horas || 0), 0), 0);
  const vis = f === 'abiertas' ? L.filter(x => otAbierta(x.o)) : f === 'reportadas' ? L.filter(x => x.o.estado === 'reportada') : L;
  let h = '<h3>Órdenes de trabajo</h3>' +
    '<div class="grid" style="margin-bottom:10px"><div class="kpi"><div class="n">' + L.filter(x => otAbierta(x.o)).length + '</div><div class="l">Abiertas</div></div>' +
    '<div class="kpi ' + (L.some(x => x.o.estado === 'reportada') ? 'warn' : '') + '"><div class="n">' + L.filter(x => x.o.estado === 'reportada').length + '</div><div class="l">Reportadas por choferes</div></div>' +
    '<div class="kpi"><div class="n">' + delMes.length + '</div><div class="l">Cerradas este mes</div></div>' +
    '<div class="kpi"><div class="n">' + num1(horasMes) + ' h</div><div class="l">Horas de mecánico este mes</div></div></div>' +
    (isAdmin() && delMes.length ? '<div class="small muted" style="margin-bottom:10px">Costo de los arreglos cerrados este mes: ' + money(delMes.reduce((a, x) => a + costosOT(x.o).total, 0)) + '</div>' : '') +
    '<div class="tabs">' + [['abiertas', 'Abiertas'], ['reportadas', 'Reportadas'], ['todas', 'Todas']].map(([k, l]) => '<button class="tab' + (f === k ? ' on' : '') + '" onclick="ui.otFiltro=\'' + k + '\';ordenesView()">' + l + '</button>').join('') + '</div>';
  h += vis.length ? vis.slice(0, 80).map(x => filaOT(x.c, x.o, true)).join('') : '<div class="card empty">No hay órdenes acá.</div>';
  h += '<div class="row" style="margin-top:10px"><button class="btn grow" onclick="nuevaOTForm()">+ Nueva orden</button><button class="btn sec" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
}

// El chofer dijo que sigue fallando: se abre una orden nueva vinculada, o se marca como resuelto.
export async function atenderOpinionOT(carId, otId) {
  const { c, o } = buscar(carId, otId); if (!o) return;
  if (await guardarOT(c, Object.assign({}, o, { opinionAtendida: iso(today()) }), 'Listo')) otForm(carId, otId);
}
export async function reabrirOT(carId, otId) {
  const { c, o } = buscar(carId, otId); if (!o) return;
  const nueva = { id: uid(), numero: proximoNumero(), fecha: iso(today()), estado: 'abierta', origen: 'app', tipo: 'correctivo', titulo: 'Sigue fallando: ' + o.titulo, descripcion: (o.opinionChofer && o.opinionChofer.comentario) || '', km: +c.km || 0, proveedorId: o.proveedorId || '', mecanico: o.mecanico || '', tareas: [], repuestos: [], horas: [], fotosAntes: [], fotosDespues: [], otAnterior: o.id };
  const ordenes = (c.ordenes || []).map(x => (x.id === o.id ? Object.assign({}, x, { opinionAtendida: iso(today()) }) : x)).concat([nueva]);
  if (await save('cars', Object.assign({}, c, { ordenes }))) { toast('Orden ' + nueva.numero + ' abierta'); otForm(carId, nueva.id); }
}
