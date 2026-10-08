// Secciones extra de la ficha del auto: papeles, cédulas de autorizado, turno de VTV,
// batería, cubiertas (con estimación por foto), valor de mercado y códigos de falla.
import { S } from '../state.js';
import { esc, val, uid, iso, today, fdate, money, num1 } from '../utils.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de } from '../memo.js';
import { settings } from '../settings.js';
import { leerDocumento, archivoADataUrl } from '../ia.js';
import { badge } from '../calc.js';
import {
  papelesAuto, cedulasActivas, cubiertas, estadoBateria, autoProblema, POS_CUBIERTA, MINIMO_LEGAL_MM,
  ultimaActualizacionValor, valorFlota, autosValorDesactualizado,
} from '../calc-auto.js';
import { describirCodigo, codigoValido, leerCodigosOBD, obdDisponible } from '../obd.js';

const carDe = id => de('cars', 'id', id)[0];
const nombreChofer = id => ((de('drivers', 'id', id)[0] || {}).nombre || '');
async function guardarYVolver(c, patch, tab, msg) {
  if (!(await save('cars', Object.assign({}, c, patch)))) return false;
  if (msg) toast(msg);
  window.carForm(c.id);
  if (tab) window.setTabAuto(tab);
  return true;
}

/* ---------- Papeles ---------- */
const ICONO = { ok: '✓', warn: '!', bad: '✕' };
export function seccionPapeles(c) {
  const L = papelesAuto(c);
  const malos = L.filter(x => x.estado === 'bad').length, flojos = L.filter(x => x.estado === 'warn').length;
  return '<details class="card" style="margin-bottom:10px"' + (malos ? ' open' : '') + '><summary class="row between"><b>Papeles</b>' +
    badge(malos ? 'bad' : flojos ? 'warn' : 'ok', malos ? malos + ' con problema' : flojos ? flojos + ' por completar' : 'Todo en orden') + '</summary>' +
    L.map(x => '<div class="row between small" style="padding:4px 0;gap:8px"><span><span class="badge b-' + x.estado + '" style="min-width:22px;text-align:center">' + ICONO[x.estado] + '</span> ' + esc(x.label) + '</span><span class="muted" style="text-align:right">' + esc(x.detalle) + '</span></div>').join('') +
    '<div class="small muted" style="margin-top:6px">Las copias se suben abajo en Archivos (Título, Cédula, Póliza…).</div></details>';
}

/* ---------- Cédulas de autorizado a conducir ---------- */
export function seccionCedulas(c) {
  const L = (c.cedulasAutorizado || []).slice().sort((a, b) => (a.baja ? 1 : 0) - (b.baja ? 1 : 0) || (b.alta || '').localeCompare(a.alta || ''));
  return '<div class="sec-t">Cédulas de autorizado a conducir</div>' +
    (L.length ? L.map(x => '<div class="card row between"><div><div>' + esc(nombreChofer(x.choferId) || x.nombre || 'Sin nombre') + (x.numero ? ' <span class="small muted">n° ' + esc(x.numero) + '</span>' : '') + '</div>' +
      '<div class="small muted">Alta ' + fdate(x.alta) + (x.baja ? ' · baja ' + fdate(x.baja) : '') + '</div></div>' +
      (x.baja ? badge('mute', 'Dada de baja') : (x.choferId && x.choferId !== c.choferId ? badge('warn', 'Ya no maneja') + ' ' : '') + '<button class="btn sec sm" onclick="bajaCedula(\'' + c.id + '\',\'' + x.id + '\')">Dar de baja</button>') + '</div>').join('')
      : '<div class="small muted" style="margin-bottom:8px">No hay cédulas cargadas.</div>') +
    '<button class="btn sec block" style="margin:6px 0 14px" onclick="cedulaForm(\'' + c.id + '\')">+ Cargar cédula</button>';
}
export function cedulaForm(carId) {
  const c = carDe(carId); if (!c) return;
  const choferes = S.drivers.filter(d => !d.inactivo && !d.prospecto).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  openModal('<h3>Cédula de autorizado · ' + esc(c.patente) + '</h3>' +
    '<label class="f"><span>Chofer</span><select id="ca_chofer">' + choferes.map(d => '<option value="' + d.id + '"' + (d.id === c.choferId ? ' selected' : '') + '>' + esc(d.nombre) + '</option>').join('') + '</select></label>' +
    '<div class="two"><label class="f"><span>Fecha de alta</span><input id="ca_alta" type="date" value="' + iso(today()) + '"></label>' +
    '<label class="f"><span>Número <small>opcional</small></span><input id="ca_numero"></label></div>' +
    '<div class="row"><button class="btn grow" onclick="guardarCedula(\'' + c.id + '\')">Guardar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>');
}
export async function guardarCedula(carId) {
  const c = carDe(carId); if (!c) return;
  const choferId = val('ca_chofer');
  if (!choferId) { toast('Elegí el chofer'); return; }
  if (cedulasActivas(c).some(x => x.choferId === choferId)) { toast('Ese chofer ya tiene una cédula activa en este auto', 'error'); return; }
  const nueva = { id: uid(), choferId, alta: val('ca_alta') || iso(today()), numero: val('ca_numero') };
  await guardarYVolver(c, { cedulasAutorizado: (c.cedulasAutorizado || []).concat([nueva]) }, null, 'Cédula cargada');
}
export async function bajaCedula(carId, cid) {
  const c = carDe(carId); if (!c) return;
  await guardarYVolver(c, { cedulasAutorizado: (c.cedulasAutorizado || []).map(x => (x.id === cid ? Object.assign({}, x, { baja: iso(today()) }) : x)) }, null, 'Cédula dada de baja');
}

/* ---------- Turno de VTV ---------- */
const LINKS_VTV = [['Provincia de Bs. As.', 'https://www.google.com/search?q=sacar+turno+VTV+provincia+de+buenos+aires'], ['CABA', 'https://www.google.com/search?q=sacar+turno+VTV+CABA']];
export function seccionVtv(c) {
  const t = c.vtvTurno;
  const links = settings.vtvTurnoLink ? [['Sacar turno', settings.vtvTurnoLink]] : LINKS_VTV;
  return '<div class="card" style="margin-bottom:12px"><div class="row between"><b>Turno de VTV</b>' + (t && t.fecha ? badge(t.fecha >= iso(today()) ? 'info' : 'mute', fdate(t.fecha) + (t.hora ? ' ' + t.hora : '')) : '<span class="small muted">sin turno</span>') + '</div>' +
    (t && t.lugar ? '<div class="small muted">' + esc(t.lugar) + '</div>' : '') +
    '<div class="row" style="margin-top:8px;flex-wrap:wrap">' + links.map(([l, u]) => '<a class="btn sec sm" target="_blank" rel="noopener" href="' + esc(u) + '">' + esc(l) + '</a>').join('') +
    '<button class="btn sec sm" onclick="vtvTurnoForm(\'' + c.id + '\')">' + (t && t.fecha ? 'Cambiar turno' : 'Anotar turno') + '</button></div></div>';
}
export function vtvTurnoForm(carId) {
  const c = carDe(carId); if (!c) return;
  const t = c.vtvTurno || {};
  openModal('<h3>Turno de VTV · ' + esc(c.patente) + '</h3>' +
    '<div class="small muted" style="margin-bottom:10px">' + (c.vtv ? 'La VTV vence el ' + fdate(c.vtv) + '.' : 'No hay vencimiento de VTV cargado.') + ' El día anterior te aparece el aviso.</div>' +
    '<div class="two"><label class="f"><span>Fecha</span><input id="vt_fecha" type="date" value="' + esc(t.fecha || '') + '"></label>' +
    '<label class="f"><span>Hora</span><input id="vt_hora" type="time" value="' + esc(t.hora || '') + '"></label></div>' +
    '<label class="f"><span>Planta / dirección</span><input id="vt_lugar" value="' + esc(t.lugar || '') + '"></label>' +
    '<div class="row"><button class="btn grow" onclick="guardarVtvTurno(\'' + c.id + '\')">Guardar</button>' + (t.fecha ? '<button class="btn sec" onclick="borrarVtvTurno(\'' + c.id + '\')">Borrar</button>' : '') + '<button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>');
}
export async function guardarVtvTurno(carId) {
  const c = carDe(carId); if (!c) return;
  const fecha = val('vt_fecha');
  if (!fecha) { toast('Poné la fecha del turno'); return; }
  await guardarYVolver(c, { vtvTurno: { fecha, hora: val('vt_hora'), lugar: val('vt_lugar') } }, null, 'Turno anotado');
}
export async function borrarVtvTurno(carId) { const c = carDe(carId); if (c) await guardarYVolver(c, { vtvTurno: null }, null, 'Turno borrado'); }

/* ---------- Batería ---------- */
export function seccionBateria(c) {
  const b = estadoBateria(c);
  const u = b.ultima;
  return '<div class="small" style="margin:-6px 0 10px">' + (b.meses != null ? 'Tiene ' + b.meses + ' mes' + (b.meses === 1 ? '' : 'es') + '. ' : '') +
    (u ? 'Última medición: ' + (u.voltaje ? num1(u.voltaje) + ' V ' : '') + (u.resultado ? '(' + esc(u.resultado) + ') ' : '') + 'el ' + fdate(u.fecha) + '. ' : 'Sin mediciones. ') +
    (b.cls !== 'ok' ? badge(b.cls, 'Revisar: ' + b.motivo) + ' ' : '') +
    '<button class="btn sec sm" onclick="medicionBateriaForm(\'' + c.id + '\')">Anotar medición</button></div>';
}
export function medicionBateriaForm(carId) {
  const c = carDe(carId); if (!c) return;
  openModal('<h3>Medición de batería · ' + esc(c.patente) + '</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Con el motor apagado: 12,6 V o más está bien; 12,2 a 12,4 V está floja; menos de 12 V está para cambiar. Si la mide una casa de baterías, anotá lo que te dijeron.</div>' +
    '<div class="two"><label class="f"><span>Fecha</span><input id="bm_fecha" type="date" value="' + iso(today()) + '"></label>' +
    '<label class="f"><span>Tensión <small>V, opcional</small></span><input id="bm_voltaje" inputmode="decimal" placeholder="12,6"></label></div>' +
    '<label class="f"><span>Resultado</span><select id="bm_resultado"><option value="buena">Buena</option><option value="regular">Regular / floja</option><option value="mala">Mala, para cambiar</option></select></label>' +
    '<label class="chk"><input type="checkbox" id="bm_cambio"><span>Se cambió la batería hoy (reinicia la fecha de cambio)</span></label>' +
    '<div class="row"><button class="btn grow" onclick="guardarMedicionBateria(\'' + c.id + '\')">Guardar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>');
}
export async function guardarMedicionBateria(carId) {
  const c = carDe(carId); if (!c) return;
  const fecha = val('bm_fecha') || iso(today());
  const voltaje = +String(val('bm_voltaje')).replace(',', '.') || 0;
  const m = { id: uid(), fecha, voltaje, resultado: val('bm_resultado') };
  const patch = { bateriaMediciones: (c.bateriaMediciones || []).concat([m]) };
  if (document.getElementById('bm_cambio').checked) { patch.bateria12vFecha = fecha; patch.bateriaMediciones = [Object.assign({}, m, { resultado: 'buena', nota: 'Batería nueva' })]; }
  await guardarYVolver(c, patch, null, 'Medición guardada');
}

/* ---------- Cubiertas ---------- */
export function seccionCubiertas(c) {
  const L = cubiertas(c).filter(x => x.mm);
  return (L.length ? '<div class="card small" style="margin-bottom:8px">' + L.map(x => '<div class="row between" style="padding:2px 0"><span>' + esc(x.label) + '</span><span>' + badge(x.cls, String(x.mm).replace('.', ',') + ' mm') + (x.kmRestantes ? ' <span class="muted">~' + x.kmRestantes.toLocaleString('es-AR') + ' km</span>' : '') + '</span></div>').join('') +
    '<div class="muted" style="margin-top:4px">Mínimo legal: ' + String(MINIMO_LEGAL_MM).replace('.', ',') + ' mm. Cuando cargás una medición nueva queda en el historial y se calcula cuántos km le quedan.</div></div>' : '') +
    '<div class="row" style="margin-bottom:12px;flex-wrap:wrap"><select id="nm_ia_pos" style="flex:1">' + POS_CUBIERTA.map(([p, l]) => '<option value="' + p + '">' + l + '</option>').join('') + '</select>' +
    '<label class="btn sec sm" style="cursor:pointer">Estimar con una foto (IA)<input type="file" id="nm_ia_file" accept="image/*" capture="environment" hidden onchange="estimarCubiertaIA()"></label></div>' +
    '<div id="nm_ia_status" class="small" style="margin:-6px 0 10px"></div>';
}
export async function estimarCubiertaIA() {
  const inp = document.getElementById('nm_ia_file'), st = document.getElementById('nm_ia_status');
  const f = inp && inp.files && inp.files[0]; if (!f) return;
  const pos = val('nm_ia_pos');
  st.style.color = 'var(--muted)'; st.textContent = 'Mirando la foto…';
  let archivo; try { archivo = await archivoADataUrl(f); } catch (e) { st.textContent = 'No se pudo abrir la foto'; return; }
  inp.value = '';
  const j = await leerDocumento('cubierta', { archivo });
  if (!j.ok) { st.style.color = 'var(--bad)'; st.textContent = 'No se pudo estimar: ' + j.error; return; }
  const d = j.datos;
  if (!d.esCubierta || !d.profundidadMm) { st.style.color = 'var(--warn)'; st.textContent = 'No se ve bien la banda de rodadura. Sacá la foto de frente al dibujo, con buena luz' + (d.observaciones ? ': ' + d.observaciones : '.'); return; }
  const campo = document.getElementById('nm_' + pos + '_prof'), fecha = document.getElementById('nm_' + pos + '_fecha');
  if (campo) campo.value = String(d.profundidadMm);
  if (fecha) fecha.value = iso(today());
  st.style.color = d.profundidadMm < MINIMO_LEGAL_MM ? 'var(--bad)' : d.profundidadMm < 3 ? 'var(--warn)' : 'var(--ok)';
  st.textContent = 'Estimado: ' + String(d.profundidadMm).replace('.', ',') + ' mm (' + d.estado + ')' + (d.desgasteIrregular ? ', con desgaste desparejo: revisá la alineación' : '') + '. Es una estimación: si podés, confirmalo con un medidor. Guardá el auto para registrarlo.';
}

/* ---------- Valor de mercado ---------- */
export function seccionValorMercado(c) {
  const H = (c.valorMercadoHist || []).slice(-6);
  if (!H.length) return '';
  const ant = H.length > 1 ? H[H.length - 2] : null, ult = H[H.length - 1];
  const varPct = ant && ant.valor ? Math.round((ult.valor - ant.valor) / ant.valor * 100) : null;
  return '<div class="small muted" style="margin:-6px 0 10px">Actualizado el ' + fdate(ult.fecha) + (varPct != null ? ' · ' + (varPct >= 0 ? '+' : '') + varPct + '% contra ' + fdate(ant.fecha) : '') +
    ' · <a class="tap" style="text-decoration:underline" target="_blank" rel="noopener" href="' + linkMercadoLibre(c) + '">ver publicaciones parecidas</a></div>';
}
export function linkMercadoLibre(c) {
  const q = [c.marca, c.modelo, c.anio].filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return 'https://listado.mercadolibre.com.ar/' + (q || 'autos');
}
export function valoresMercadoView() {
  const L = S.cars.filter(c => !c.vendido).slice().sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  const desact = new Set(autosValorDesactualizado().map(c => c.id));
  let h = '<h3>Valores de mercado</h3><div class="small muted" style="margin-bottom:10px">Una vez por mes, mirá cuánto se publica cada modelo y anotá el valor. Queda el historial de cada auto y sirve para la rentabilidad, el simulador y la decisión de vender.</div>' +
    '<div class="kpi" style="margin-bottom:10px"><div class="n">' + money(valorFlota()) + '</div><div class="l">Valor de la flota según lo cargado</div></div>';
  h += L.map(c => {
    const f = ultimaActualizacionValor(c);
    return '<div class="card"><div class="row between"><div><b>' + esc(c.patente) + '</b> <span class="small muted">' + esc([c.marca, c.modelo, c.anio].filter(Boolean).join(' ')) + '</span></div>' + (desact.has(c.id) ? badge('warn', f ? 'Hace más de un mes' : 'Sin actualizar') : badge('ok', fdate(f))) + '</div>' +
      '<div class="row" style="margin-top:6px"><input class="vm-valor grow" data-id="' + c.id + '" inputmode="decimal" placeholder="Valor actual" value="' + esc(c.valorMercado || '') + '">' +
      '<a class="btn sec sm" target="_blank" rel="noopener" href="' + linkMercadoLibre(c) + '">Mercado Libre</a></div></div>';
  }).join('');
  h += '<div class="small muted" style="margin:8px 0">Para que se actualice solo hace falta contratar el acceso a una guía de precios (InfoAuto o similar). Si lo contratás, avisame y lo conecto.</div>' +
    '<div class="row"><button class="btn grow" onclick="guardarValoresMercado()">Guardar valores</button><button class="btn sec" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
}
export async function guardarValoresMercado() {
  const hoy = iso(today());
  let n = 0;
  for (const inp of document.querySelectorAll('.vm-valor')) {
    const c = carDe(inp.dataset.id); if (!c) continue;
    const v = +String(inp.value).replace(/\./g, '').replace(',', '.') || 0;
    if (!v) continue;
    const H = c.valorMercadoHist || [];
    const ult = H[H.length - 1];
    if (v === +c.valorMercado && ult && ult.fecha === hoy) continue;
    const hist = ult && ult.fecha === hoy ? H.slice(0, -1).concat([{ fecha: hoy, valor: v }]) : H.concat([{ fecha: hoy, valor: v }]);
    if (await save('cars', Object.assign({}, c, { valorMercado: v, valorMercadoHist: hist }))) n++;
  }
  closeModal(); toast(n ? n + ' valor' + (n === 1 ? '' : 'es') + ' actualizado' + (n === 1 ? '' : 's') : 'No hubo cambios');
}

/* ---------- Póliza apta para apps ---------- */
export function campoSeguroApps(c) {
  const v = c.seguroApps || '';
  return '<label class="f"><span>¿La póliza cubre uso en aplicaciones (transporte de pasajeros)?</span><select id="c_seguroApps">' +
    [['', 'No lo sé / sin confirmar'], ['si', 'Sí, cubre uso en apps'], ['no', 'No, es uso particular']].map(([k, l]) => '<option value="' + k + '"' + (v === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    (v === 'no' ? '<div class="small" style="color:var(--bad);margin:-6px 0 10px">Con uso particular, la aseguradora puede rechazar un siniestro mientras el chofer lleva pasajeros.</div>' : '');
}

/* ---------- Códigos de falla ---------- */
export function seccionCodigosFalla(c) {
  const L = (c.codigosFalla || []).slice().sort((a, b) => (a.resuelto ? 1 : 0) - (b.resuelto ? 1 : 0) || (b.fecha || '').localeCompare(a.fecha || ''));
  return '<div class="sec-t">Códigos de falla (luz de motor)</div>' +
    (L.length ? L.slice(0, 15).map(x => '<div class="card row between"><div style="min-width:0"><div><b>' + esc(x.codigo) + '</b> ' + (x.resuelto ? badge('ok', 'Resuelto') : badge('warn', x.pendiente ? 'Pendiente' : 'Activo')) + '</div>' +
      '<div class="small muted">' + esc(x.descripcion || describirCodigo(x.codigo) || 'Sin descripción') + '</div><div class="small muted">' + fdate(x.fecha) + (x.km ? ' · ' + Number(x.km).toLocaleString('es-AR') + ' km' : '') + (x.origen === 'escaner' ? ' · leído con escáner' : '') + (x.nota ? ' · ' + esc(x.nota) : '') + '</div></div>' +
      '<div class="row">' + (x.resuelto ? '' : '<button class="btn sec sm" onclick="resolverCodigoFalla(\'' + c.id + '\',\'' + x.id + '\')">Resuelto</button>') +
      '<a class="btn sec sm" target="_blank" rel="noopener" href="https://www.google.com/search?q=' + encodeURIComponent(x.codigo + ' ' + [c.marca, c.modelo].filter(Boolean).join(' ')) + '">Buscar</a></div></div>').join('')
      : '<div class="small muted" style="margin-bottom:8px">Sin códigos registrados.</div>') +
    '<div class="row" style="margin:6px 0 14px;flex-wrap:wrap"><button class="btn sec grow" onclick="codigoFallaForm(\'' + c.id + '\')">+ Cargar código</button>' +
    '<button class="btn sec grow" onclick="leerOBD(\'' + c.id + '\')">Leer con escáner Bluetooth</button></div>';
}
export function codigoFallaForm(carId) {
  const c = carDe(carId); if (!c) return;
  openModal('<h3>Código de falla · ' + esc(c.patente) + '</h3>' +
    '<div class="two"><label class="f"><span>Código</span><input id="cf_codigo" placeholder="P0171" autocapitalize="characters" oninput="onCodigoFalla()"></label>' +
    '<label class="f"><span>Fecha</span><input id="cf_fecha" type="date" value="' + iso(today()) + '"></label></div>' +
    '<div id="cf_desc" class="small muted" style="margin:-6px 0 10px"></div>' +
    '<label class="f"><span>Km <small>opcional</small></span><input id="cf_km" inputmode="numeric" value="' + esc(c.km || '') + '"></label>' +
    '<label class="f"><span>Nota <small>opcional</small></span><input id="cf_nota" placeholder="ej: se prendió la luz en ruta"></label>' +
    '<div class="row"><button class="btn grow" onclick="guardarCodigoFalla(\'' + c.id + '\')">Guardar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>');
}
export function onCodigoFalla() {
  const c = val('cf_codigo').toUpperCase(), el = document.getElementById('cf_desc');
  if (el) el.textContent = codigoValido(c) ? (describirCodigo(c) || 'Código sin descripción en la lista') : c.length >= 5 ? 'El formato es una letra y 4 caracteres, ej: P0171' : '';
}
export async function guardarCodigoFalla(carId) {
  const c = carDe(carId); if (!c) return;
  const codigo = val('cf_codigo').toUpperCase();
  if (!codigoValido(codigo)) { toast('El código tiene que ser como P0171', 'error'); return; }
  const nuevo = { id: uid(), codigo, descripcion: describirCodigo(codigo), fecha: val('cf_fecha') || iso(today()), km: +val('cf_km') || 0, nota: val('cf_nota'), origen: 'manual' };
  await guardarYVolver(c, { codigosFalla: (c.codigosFalla || []).concat([nuevo]) }, 'mant', 'Código cargado');
}
export async function resolverCodigoFalla(carId, id) {
  const c = carDe(carId); if (!c) return;
  await guardarYVolver(c, { codigosFalla: (c.codigosFalla || []).map(x => (x.id === id ? Object.assign({}, x, { resuelto: iso(today()) }) : x)) }, 'mant', 'Marcado como resuelto');
}
export function leerOBD(carId) {
  const c = carDe(carId); if (!c) return;
  openModal('<h3>Leer con escáner Bluetooth</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Necesitás un adaptador OBD-II <b>ELM327 Bluetooth LE (4.0)</b> enchufado debajo del volante, el auto en contacto y Chrome en un celular Android. Los adaptadores Bluetooth "clásicos" y los iPhone no funcionan desde la web.</div>' +
    (obdDisponible() ? '' : '<div class="card small" style="color:var(--warn)">Este navegador no permite Bluetooth desde la web. Probá desde Chrome en Android, o cargá el código a mano.</div>') +
    '<div id="obd_estado" class="small" style="margin:8px 0"></div>' +
    '<div class="row"><button class="btn grow" id="obd_btn" onclick="ejecutarLecturaOBD(\'' + c.id + '\')"' + (obdDisponible() ? '' : ' disabled') + '>Conectar y leer</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cerrar</button></div>');
}
export async function ejecutarLecturaOBD(carId) {
  const c = carDe(carId); if (!c) return;
  const st = document.getElementById('obd_estado'), btn = document.getElementById('obd_btn');
  const msg = (t, color) => { if (st) { st.textContent = t; st.style.color = color || 'var(--muted)'; } };
  if (btn) btn.disabled = true;
  try {
    const r = await leerCodigosOBD(t => msg(t));
    const hoy = iso(today());
    const yaActivos = new Set((c.codigosFalla || []).filter(x => !x.resuelto).map(x => x.codigo));
    const nuevos = r.guardados.map(cod => ({ cod, pendiente: false })).concat(r.pendientes.map(cod => ({ cod, pendiente: true })))
      .filter(x => !yaActivos.has(x.cod))
      .map(x => ({ id: uid(), codigo: x.cod, descripcion: describirCodigo(x.cod), fecha: hoy, km: +c.km || 0, origen: 'escaner', pendiente: x.pendiente }));
    if (!r.guardados.length && !r.pendientes.length) { msg('El auto no tiene códigos de falla guardados. 👍', 'var(--ok)'); if (btn) btn.disabled = false; return; }
    if (!nuevos.length) { msg('Los códigos que tiene ya estaban cargados: ' + r.guardados.concat(r.pendientes).join(', '), 'var(--muted)'); if (btn) btn.disabled = false; return; }
    await guardarYVolver(c, { codigosFalla: (c.codigosFalla || []).concat(nuevos) }, 'mant', nuevos.length + ' código' + (nuevos.length === 1 ? '' : 's') + ' leído' + (nuevos.length === 1 ? '' : 's') + ': ' + nuevos.map(x => x.codigo).join(', '));
  } catch (e) {
    const m = (e && e.message) || 'error';
    msg(/cancel|chosen/i.test(m) ? 'No elegiste ningún adaptador.' : 'No se pudo leer: ' + m, 'var(--bad)');
    if (btn) btn.disabled = false;
  }
}

/* ---------- Auto problema ---------- */
export function badgeAutoProblema(c) {
  const p = autoProblema(c);
  return p ? ' ' + badge('warn', 'Auto problema: ' + p.visitas + ' visitas al taller en 6 meses') : '';
}

/* ---------- Al guardar la ficha: historiales ---------- */
export function completarAuto(ex, o) {
  const hoy = iso(today());
  const sa = document.getElementById('c_seguroApps');
  if (sa) o.seguroApps = sa.value;
  // Historial de mediciones de cubiertas
  const hist = (ex && ex.neumaticosHist) || [];
  const nuevas = [];
  POS_CUBIERTA.forEach(([pos]) => {
    const antes = +(((ex && ex.neumaticos) || {})[pos] || {}).profundidad || 0;
    const ahora = +((o.neumaticos || {})[pos] || {}).profundidad || 0;
    if (ahora && ahora !== antes) nuevas.push({ fecha: (o.neumaticos[pos].fecha || hoy), pos, mm: ahora, km: +o.km || 0 });
  });
  if (nuevas.length || (ex && ex.neumaticosHist)) o.neumaticosHist = hist.concat(nuevas);
  // Historial del valor de mercado
  const vAntes = +((ex && ex.valorMercado) || 0), vAhora = +o.valorMercado || 0;
  if (vAhora && vAhora !== vAntes) {
    const H = (ex && ex.valorMercadoHist) || [];
    const ult = H[H.length - 1];
    o.valorMercadoHist = ult && ult.fecha === hoy ? H.slice(0, -1).concat([{ fecha: hoy, valor: vAhora }]) : H.concat([{ fecha: hoy, valor: vAhora }]);
  }
  // Si se renovó la VTV, el turno ya pasó
  if (ex && o.vtv && o.vtv !== ex.vtv && o.vtvTurno && o.vtvTurno.fecha && o.vtvTurno.fecha <= hoy) o.vtvTurno = null;
  return o;
}
