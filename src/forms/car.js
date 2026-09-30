import { S } from '../state.js';
import { $, val, uid, iso, today, esc, fdate, money, moneyUSD, parse, days } from '../utils.js';
import { TIPOS, VENC, COMBUSTIBLES, GASTO_CATS, MULTA_ESTADOS, MOTIVOS_REEMPLAZO, TIPOS_SINIESTRO, SINIESTRO_ESTADOS, ASEGURADORAS, TRANSMISIONES, COBERTURAS_SEGURO, ELEMENTOS_SEGURIDAD, CUMPLIMIENTO_NORMATIVO_ITEMS, RECLAMO_SEGURO_ESTADOS, STOCK_UNIDADES } from '../constants.js';
import { seguroPaga, seguroPendiente, seguroPendienteDesde, isContract, calc, finFinanciado, driverName, diasEnTaller, planMantenimientoDefault, estadoPlanItem, textoRestante, badge, estadoMultaCls, resultadoVenta, fichaTecnica, cronogramaCuotas, estadoGeneralAuto, mejorPeorMesAuto, lineaDeTiempoAuto, contratoVencimiento, vs, gastosFijosMensuales, historialGastosFijos, comparacionGastoFijo, desgloseCobradoPorChofer, movimientosSalidaPorAuto, gastosRepuestosPorAuto } from '../calc.js';
import { openModal, closeModal, toast, confirmDel } from '../modal.js';
import { save, remove } from '../data.js';
import { renderFiles, purgeFiles, attach } from '../files.js';
import { canDelete, isAdmin, canVerFinanzas } from '../roles.js';
import { seccionSocios } from './socios.js';
import { inflacionAcumulada } from '../inflacion.js';
import { settings, featureOculta } from '../settings.js';
import { leerDocumento, archivoADataUrl } from '../ia.js';

const gastoCatLabel = k => (GASTO_CATS.find(x => x[0] === k) || [0, 'Gasto'])[1];
const unidadLabel = k => (STOCK_UNIDADES.find(x => x[0] === k) || [0, 'Unidad'])[1];

export function actualizarHistorialChoferes(ex, newChoferId) {
  const prevChoferId = ex ? ex.choferId : '';
  let historial = (ex && ex.historialChoferes) || [];
  if (prevChoferId === newChoferId) return historial;
  const hoy = iso(today());
  historial = historial.map(h => (!h.hasta && h.choferId === prevChoferId) ? Object.assign({}, h, { hasta: hoy }) : h);
  if (newChoferId) historial = historial.concat([{ choferId: newChoferId, desde: hoy, hasta: null }]);
  return historial;
}
export function actualizarHistorialMonto(ex, monto) {
  const historial = (ex && ex.montoHistorial) || [];
  const prevMonto = ex ? (+ex.monto || 0) : null;
  if (!monto || monto === prevMonto) return historial;
  return historial.concat([{ fecha: iso(today()), monto }]);
}

/* Valor semanal del alquiler: en autos alquilados es el monto del contrato;
   en el resto es la tarifa de referencia (valorSemanal) que se propone al asignar. */
export const SEGURO_PAGA = [['empresa', 'Yo, es costo mío'], ['recupera', 'Yo, y se lo cobro al chofer'], ['chofer', 'El chofer, por su cuenta']];
export function ayudaSeguroPaga(v) {
  if (v === 'recupera') return 'Cada mes la app registra el pago del seguro y se lo suma al chofer como seguro a pagar, en pesos. No cuenta como gasto en la rentabilidad.';
  if (v === 'chofer') return 'No se genera ningún gasto. La app solo controla el vencimiento de la póliza.';
  return 'La app genera el gasto del seguro todos los meses como costo tuyo.';
}
// Al pasar un auto a "se lo cobro al chofer", el seguro ya cargado este mes queda a cargo del chofer actual.
async function pasarSeguroDelMesAlChofer(c) {
  if (!c.choferId) return;
  const desde = iso(today()).slice(0, 8) + '01';
  for (const g of S.gastos.filter(x => x.carId === c.id && x.categoria === 'seguro' && !x.recuperaDe && (x.fecha || '') >= desde)) {
    await save('gastos', Object.assign({}, g, { recuperaDe: c.choferId }));
  }
}
function tarjetaSeguroRecupera(c) {
  const mes = iso(today()).slice(0, 7);
  const delMes = S.gastos.filter(g => g.carId === c.id && g.categoria === 'seguro' && g.recuperaDe && (g.fecha || '').slice(0, 7) === mes);
  const pend = c.choferId ? seguroPendiente(c.choferId) : 0;
  const desde = c.choferId ? seguroPendienteDesde(c.choferId) : null;
  return '<div class="sec-t">Seguro a cobrar al chofer</div><div class="card">' +
    (delMes.length ? delMes.map(g => '<div class="row between"><span class="muted">Seguro de este mes</span><span><b>' + money(g.costo) + '</b> <button class="btn sec sm" onclick="corregirSeguroForm(\'' + g.id + '\')">Corregir</button></span></div>').join('')
      : '<div class="small muted">Todavía no se generó el seguro de este mes.</div>') +
    (c.choferId ? '<div class="row between" style="margin-top:6px"><span class="muted">' + esc(driverName(c.choferId)) + ' debe de seguro</span><b style="color:' + (pend > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + money(pend) + '</b></div>' +
      (desde ? '<div class="small muted">Sin pagar desde el ' + fdate(desde) + '</div>' : '') +
      (pend > 0 ? '<button class="btn block" style="margin-top:8px" onclick="payFormSeguro(\'' + c.id + '\')">Registrar pago de seguro</button>' : '') : '<div class="small muted" style="margin-top:6px">El auto no tiene chofer: el seguro queda como costo tuyo.</div>') +
    '</div>';
}
// Documentos del seguro: siempre se muestra el más reciente de cada tipo y los anteriores quedan guardados.
const DOCS_SEGURO = [['seguroCredencial', 'Credencial de circulación'], ['seguro', 'Póliza'], ['seguroCertificado', 'Certificado de cobertura']];
function seguroDocsHtml(c) {
  const abrir = (f, nombre) => f.link ? "window.open('" + esc(f.link) + "','_blank')" : "viewFile('" + esc(f.id) + "','" + esc(f.name || nombre) + "')";
  return DOCS_SEGURO.map(([k, label]) => {
    const L = (c.files || []).filter(f => f.cat === k).sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
    const vig = L[0];
    return '<div class="card"><div class="row between"><b>' + label + '</b>' + (vig ? badge('ok', 'Cargada') : badge('warn', 'Sin cargar')) + '</div>' +
      '<div class="small muted" style="margin:4px 0 8px;overflow-wrap:anywhere">' + (vig ? esc(vig.name || label) + ' · subida el ' + fdate(vig.fecha) : 'Todavía no la subiste.') + '</div>' +
      '<div class="row">' + (vig ? '<button class="btn sm grow" onclick="' + abrir(vig, label) + '">Ver / descargar</button>' : '') +
      (vig && !vig.link ? '<button class="btn sec sm" title="Completar los datos del seguro leyendo este documento" onclick="completarSeguroConIA(\'' + c.id + '\',\'' + esc(vig.id) + '\')">✨ Leer</button>' : '') +
      '<label class="btn sec sm filebtn' + (vig ? '' : ' grow') + '">' + (vig ? 'Subir nueva' : 'Subir foto o PDF') +
      '<input id="segIn_' + k + '" type="file" accept="image/*,application/pdf" onchange="subirDocSeguro(\'' + c.id + '\',\'' + k + '\')"></label></div>' +
      (L.length > 1 ? '<details style="margin-top:8px"><summary class="small muted" style="cursor:pointer">Anteriores (' + (L.length - 1) + ')</summary>' +
        L.slice(1).map(f => '<div class="row between small" style="padding:3px 0"><span>' + fdate(f.fecha) + '</span><a class="tap" style="text-decoration:underline" onclick="' + abrir(f, label) + '">Ver / descargar</a></div>').join('') + '</details>' : '') +
      '</div>';
  }).join('');
}
export function renderSeguroDocs(carId) {
  const el = document.getElementById('segDocs');
  const c = S.cars.find(x => x.id === carId);
  if (el && c) el.innerHTML = seguroDocsHtml(c);
}
export async function subirDocSeguro(carId, cat) {
  const f = await attach('cars', carId, 'segIn_' + cat, null, cat);
  if (f && f.id) await completarSeguroConIA(carId, f.id);
}
/* ---- Renovación del seguro: costo del último año y cotizaciones para comparar ---- */
export function costoSeguroUltimoAnio(c) {
  const desde = new Date(today()); desde.setFullYear(desde.getFullYear() - 1);
  const d = iso(desde);
  const pagado = S.gastos.filter(g => g.carId === c.id && g.categoria === 'seguro' && g.fecha >= d).reduce((a, g) => a + (+g.costo || 0), 0);
  const recuperado = S.payments.filter(p => p.carId === c.id && p.tipo === 'seguro' && p.fecha >= d).reduce((a, p) => a + (+p.monto || 0), 0);
  return { pagado, recuperado };
}
function renovacionSeguroHtml(c) {
  const dias = c.seguro ? days(today(), parse(c.seguro)) : null;
  const L = c.cotizacionesSeguro || [];
  const actual = +c.seguroMensual || 0;
  const { pagado, recuperado } = costoSeguroUltimoAnio(c);
  const cobLabel = k => (COBERTURAS_SEGURO.find(x => x[0] === k) || [0, ''])[1];
  let h = '<div class="card">';
  if (dias != null && dias <= 45) h += '<div style="margin-bottom:6px">' + badge(dias < 0 ? 'bad' : dias <= 15 ? 'warn' : 'soft', dias < 0 ? 'Vencido hace ' + (-dias) + ' d' : dias === 0 ? 'Vence hoy' : 'Vence en ' + dias + ' d') + ' <span class="small muted">Es momento de pedir cotizaciones.</span></div>';
  h += '<div class="row between"><span class="muted">Pagaste en los últimos 12 meses</span><b>' + money(pagado) + '</b></div>' +
    (recuperado ? '<div class="row between small"><span class="muted">De eso te lo pagó el chofer</span><span>' + money(recuperado) + '</span></div>' : '') +
    (actual ? '<div class="row between small"><span class="muted">Hoy pagás por mes</span><span>' + money(actual) + (c.aseguradora ? ' · ' + esc(c.aseguradora) : '') + '</span></div>' : '');
  if (L.length) {
    const orden = L.slice().sort((a, b) => (+a.montoMensual || 0) - (+b.montoMensual || 0));
    h += '<div class="small muted" style="margin:10px 0 4px">Cotizaciones (de la más barata a la más cara)</div>' + orden.map((q, i) => {
      const dif = actual ? (+q.montoMensual || 0) - actual : 0;
      return '<div style="border-top:1px solid var(--line);padding:6px 0"><div class="row between"><b>' + esc(q.aseguradora || 'Sin nombre') + (i === 0 && L.length > 1 ? ' ' + badge('ok', 'Más barata') : '') + (q.elegida ? ' ' + badge('ok', 'Elegida') : '') + '</b><b>' + money(q.montoMensual) + '/mes</b></div>' +
        '<div class="small muted">' + [cobLabel(q.cobertura), q.franquicia ? 'Franquicia ' + money(q.franquicia) : '', q.nota, 'cargada el ' + fdate(q.fecha)].filter(Boolean).map(esc).join(' · ') + '</div>' +
        (actual && dif ? '<div class="small" style="color:' + (dif < 0 ? 'var(--ok)' : 'var(--bad)') + '">' + (dif < 0 ? 'Ahorrás ' : 'Pagás ') + money(Math.abs(dif)) + ' por mes (' + money(Math.abs(dif) * 12) + ' al año) ' + (dif < 0 ? 'contra' : 'más que') + ' lo actual</div>' : '') +
        '<div class="row" style="margin-top:4px"><button class="btn sm" onclick="elegirCotizacionSeguro(\'' + c.id + '\',\'' + q.id + '\')">Elegir esta</button>' +
        '<button class="btn sec sm" onclick="quitarCotizacionSeguro(\'' + c.id + '\',\'' + q.id + '\')">Quitar</button></div></div>';
    }).join('');
  }
  h += '<details style="margin-top:8px"' + (L.length ? '' : ' open') + '><summary class="small" style="cursor:pointer;font-weight:600">+ Cargar una cotización</summary>' +
    '<label class="btn sec sm block filebtn" style="margin:8px 0 4px">✨ Leer la cotización con IA (foto o PDF)<input id="cq_file" type="file" accept="image/*,application/pdf" onchange="leerCotizacionSeguro()"></label>' +
    '<div id="cq_status" class="small muted" style="margin-bottom:6px"></div>' +
    '<div class="two"><label class="f"><span>Aseguradora</span><input id="cq_aseguradora" list="cq_asegs"><datalist id="cq_asegs">' + ASEGURADORAS.slice(0, -1).map(a => '<option value="' + a + '">').join('') + '</datalist></label>' +
    '<label class="f"><span>Monto por mes</span><input id="cq_monto" inputmode="decimal"></label></div>' +
    '<div class="two"><label class="f"><span>Cobertura</span><select id="cq_cobertura"><option value="">Sin especificar</option>' + COBERTURAS_SEGURO.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></label>' +
    '<label class="f"><span>Franquicia</span><input id="cq_franquicia" inputmode="decimal"></label></div>' +
    '<label class="f"><span>Nota <small>opcional</small></span><input id="cq_nota" placeholder="ej: productor, incluye granizo…"></label>' +
    '<button class="btn sec block" onclick="agregarCotizacionSeguro(\'' + c.id + '\')">Agregar cotización</button></details>';
  return h + '</div>';
}
function renderRenovacionSeguro(carId) {
  const el = document.getElementById('segRenov'); const c = S.cars.find(x => x.id === carId);
  if (el && c) el.innerHTML = renovacionSeguroHtml(c);
}
export async function leerCotizacionSeguro() {
  const inp = document.getElementById('cq_file'); const f = inp && inp.files && inp.files[0]; if (!f) return;
  const st = document.getElementById('cq_status');
  if (f.size > 10e6) { st.textContent = 'El archivo es muy pesado (máximo 10 MB).'; return; }
  st.style.color = 'var(--muted)'; st.textContent = 'Leyendo la cotización con IA…';
  let archivo;
  try { archivo = await archivoADataUrl(f); } catch (e) { st.textContent = 'No se pudo abrir el archivo.'; return; }
  inp.value = '';
  const j = await leerDocumento('poliza', { archivo });
  if (!document.getElementById('cq_status')) return;
  if (!j.ok) { st.style.color = 'var(--bad)'; st.textContent = 'No se pudo leer con IA: ' + j.error + '.'; return; }
  const d = j.datos;
  if (d.aseguradora) $('#cq_aseguradora').value = aseguradoraDeLista(d.aseguradora) === 'Otro' ? d.aseguradora : aseguradoraDeLista(d.aseguradora);
  if (d.premioMensual) $('#cq_monto').value = d.premioMensual;
  if (d.cobertura) $('#cq_cobertura').value = d.cobertura;
  if (d.franquicia) $('#cq_franquicia').value = d.franquicia;
  st.style.color = 'var(--ok)'; st.textContent = '✓ Completé lo que leí. Revisá y tocá "Agregar cotización".' + (d.observaciones ? ' ⚠ ' + d.observaciones : '');
}
export async function agregarCotizacionSeguro(carId) {
  const c = S.cars.find(x => x.id === carId); if (!c) return;
  const monto = +val('cq_monto');
  if (!monto || monto <= 0) { toast('Poné el monto por mes de la cotización'); return; }
  const q = { id: uid(), aseguradora: val('cq_aseguradora').trim(), montoMensual: monto, cobertura: val('cq_cobertura'), franquicia: +val('cq_franquicia') || 0, nota: val('cq_nota').trim(), fecha: iso(today()) };
  if (!(await save('cars', Object.assign({}, c, { cotizacionesSeguro: (c.cotizacionesSeguro || []).concat([q]) })))) return;
  renderRenovacionSeguro(carId); toast('Cotización agregada');
}
export async function quitarCotizacionSeguro(carId, qid) {
  const c = S.cars.find(x => x.id === carId); if (!c) return;
  if (!(await save('cars', Object.assign({}, c, { cotizacionesSeguro: (c.cotizacionesSeguro || []).filter(q => q.id !== qid) })))) return;
  renderRenovacionSeguro(carId);
}
// Pasa los datos de la cotización a la ficha abierta; el usuario pone el nuevo vencimiento y guarda.
export async function elegirCotizacionSeguro(carId, qid) {
  const c = S.cars.find(x => x.id === carId); const q = c && (c.cotizacionesSeguro || []).find(x => x.id === qid); if (!q) return;
  const poner = (id, v) => { const el = document.getElementById(id); if (!el || el.disabled || v === '' || v == null) return; el.value = v; el.dispatchEvent(new Event('change')); el.style.outline = '2px solid var(--ok)'; };
  const aseg = aseguradoraDeLista(q.aseguradora);
  if (aseg) { poner('c_aseguradora', aseg); if (aseg === 'Otro') poner('c_aseguradoraOtro', q.aseguradora); }
  poner('c_coberturaSeguro', q.cobertura);
  poner('c_franquiciaSeguro', q.franquicia || '');
  poner('c_seguroMensual', q.montoMensual);
  if (!(await save('cars', Object.assign({}, c, { cotizacionesSeguro: (c.cotizacionesSeguro || []).map(x => Object.assign({}, x, { elegida: x.id === qid })) })))) return;
  renderRenovacionSeguro(carId);
  const v = document.getElementById('v_seguro'); if (v) { v.style.outline = '2px solid var(--warn)'; v.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  toast('Listo: poné la nueva fecha de vencimiento de la póliza y tocá Guardar');
}
// La aseguradora que lee la IA viene con el nombre completo ("Federación Patronal Seguros S.A.").
const RAIZ_ASEGURADORA = { 'Fed. Pat.': 'federacion', 'Nación': 'nacion', 'Mercantil': 'mercantil', 'Holando': 'holando' };
function aseguradoraDeLista(nombre) {
  const n = String(nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!n) return '';
  return ASEGURADORAS.slice(0, -1).find(a => n.includes(RAIZ_ASEGURADORA[a] || a.toLowerCase())) || 'Otro';
}
// Lee con IA la póliza, el certificado o la credencial y completa los datos del seguro en la ficha abierta.
// No guarda: marca en verde lo que cambió para que el usuario lo revise y toque Guardar.
export async function completarSeguroConIA(carId, path) {
  const st = () => document.getElementById('segStatus');
  const msg = (t, color) => { const el = st(); if (el) { el.innerHTML = t; el.style.color = color || 'var(--muted)'; } };
  msg('Leyendo el documento con IA…');
  const j = await leerDocumento('poliza', { path });
  if (!st()) return;
  if (!j.ok) { msg('No se pudo leer con IA: ' + esc(j.error) + '.', 'var(--bad)'); return; }
  const d = j.datos, c = S.cars.find(x => x.id === carId) || {};
  const cambios = [], avisos = [];
  const poner = (id, valor, etiqueta, mostrar) => {
    const el = document.getElementById(id);
    if (!el || el.disabled || valor === '' || valor == null || valor === 0 || String(el.value) === String(valor)) return;
    el.value = valor; el.dispatchEvent(new Event('change'));
    el.style.outline = '2px solid var(--ok)';
    cambios.push(etiqueta + ': ' + (mostrar || valor));
  };
  poner('c_poliza', d.polizaNumero, 'N° de póliza');
  const aseg = aseguradoraDeLista(d.aseguradora);
  if (aseg) {
    poner('c_aseguradora', aseg, 'Aseguradora', aseg === 'Otro' ? d.aseguradora : aseg);
    if (aseg === 'Otro') poner('c_aseguradoraOtro', d.aseguradora, 'Nombre de la aseguradora');
  }
  poner('c_coberturaSeguro', d.cobertura, 'Cobertura', (COBERTURAS_SEGURO.find(x => x[0] === d.cobertura) || [0, d.cobertura])[1]);
  poner('c_franquiciaSeguro', d.franquicia, 'Franquicia', money(d.franquicia));
  poner('v_seguro', d.vigenciaHasta, 'Vencimiento', d.vigenciaHasta ? fdate(d.vigenciaHasta) : '');
  if (d.tipoDocumento !== 'credencial') poner('c_seguroMensual', d.premioMensual, 'Monto mensual', money(d.premioMensual));
  const pat = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (d.patente && c.patente && pat(d.patente) !== pat(c.patente)) avisos.push('La patente del documento (' + d.patente + ') no coincide con la del auto (' + c.patente + ').');
  if (d.vigenciaHasta && d.vigenciaHasta < iso(today())) avisos.push('Según el documento, el seguro venció el ' + fdate(d.vigenciaHasta) + '.');
  if (d.observaciones) avisos.push(d.observaciones);
  const av = avisos.map(a => '<div style="color:var(--warn)">⚠ ' + esc(a) + '</div>').join('');
  if (!cambios.length) { msg('✓ La IA leyó el documento y los datos ya coinciden con la ficha.' + av, 'var(--ok)'); return; }
  msg('✓ Completé con IA (marcado en verde): ' + esc(cambios.join(' · ')) + '. Revisá y tocá <b>Guardar</b>.' + av, 'var(--ok)');
}
export function corregirSeguroForm(gastoId) {
  const g = S.gastos.find(x => x.id === gastoId); if (!g) return;
  const c = S.cars.find(x => x.id === g.carId);
  openModal('<h3>Seguro de ' + esc(c ? c.patente : 'auto') + '</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Poné lo que te cobró la aseguradora este mes. Es lo que se le cobra al chofer.</div>' +
    '<label class="f"><span>Monto del mes</span><input id="cs_monto" inputmode="decimal" value="' + esc(g.costo || '') + '"></label>' +
    '<label class="chk"><input type="checkbox" id="cs_default"><span>Usar este monto también para los próximos meses</span></label>' +
    '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="guardarCorreccionSeguro(\'' + g.id + '\')">Guardar</button><button class="btn sec" onclick="carForm(\'' + g.carId + '\')">Cancelar</button></div>');
}
export async function guardarCorreccionSeguro(gastoId) {
  const g = S.gastos.find(x => x.id === gastoId); if (!g) return;
  const monto = +val('cs_monto') || 0;
  if (!monto) { toast('Poné el monto'); return; }
  if (!(await save('gastos', Object.assign({}, g, { costo: monto })))) return;
  const c = S.cars.find(x => x.id === g.carId);
  if (c && document.getElementById('cs_default').checked) await save('cars', Object.assign({}, c, { seguroMensual: monto }));
  toast('Seguro corregido'); carForm(g.carId); setTabAuto('seguro');
}
export function valorSemanalRow(c, volver) {
  const fin = c.tipo === 'financiado', alq = c.tipo === 'alquiler';
  const v = (alq || fin) ? +c.monto || 0 : +c.valorSemanal || 0;
  const label = fin ? 'Cuota semanal' : alq ? 'Alquiler semanal' : 'Valor semanal de alquiler';
  return '<div class="row between" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line)"><div><div class="small muted">' + label + '</div>' +
    '<b>' + (v ? (fin ? moneyUSD(v) : money(v)) : '<span class="muted">Sin cargar</span>') + '</b></div>' +
    (fin ? '' : '<button class="btn sec sm" onclick="valorSemanalForm(\'' + c.id + '\',\'' + volver + '\')">' + (v ? 'Editar' : 'Cargar') + '</button>') + '</div>';
}
function semanasCorridas(c) {
  if (c.tipo !== 'alquiler' || !c.inicio || !c.monto) return 0;
  const d = days(parse(c.inicio), today());
  return d < 0 ? 0 : Math.floor(d / 7) + 1;
}
export function valorSemanalForm(carId, volver) {
  const c = S.cars.find(x => x.id === carId); if (!c) return;
  const alq = c.tipo === 'alquiler';
  const semanas = semanasCorridas(c);
  openModal('<h3>Valor semanal — ' + esc(c.patente) + '</h3>' +
    '<label class="f"><span>Alquiler semanal ($)</span><input id="vs_monto" inputmode="decimal" value="' + esc((alq ? c.monto : c.valorSemanal) || '') + '"></label>' +
    '<div class="small muted" style="margin:-4px 0 12px">' + (alq
      ? 'Es lo que paga ' + esc(driverName(c.choferId)) + ' por semana.'
      : 'Es el precio de referencia del auto. Cuando se lo asignes a un chofer, se propone solo como monto del alquiler.') + '</div>' +
    (semanas ? '<label class="chk"><input type="checkbox" id="vs_desdeAhora" checked><span>Aplicar desde la semana que viene (las ' + semanas + ' semanas ya corridas quedan con el valor anterior)</span></label>' +
      '<div class="small muted" style="margin:-4px 0 12px">Destildalo solo si estás corrigiendo un monto mal cargado desde el principio.</div>' : '') +
    '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="guardarValorSemanal(\'' + c.id + '\',\'' + volver + '\')">Guardar</button>' +
    '<button class="btn sec" onclick="volverDeValorSemanal(\'' + c.id + '\',\'' + volver + '\')">Cancelar</button></div>');
}
export function volverDeValorSemanal(carId, volver) {
  if (volver === 'auto') carForm(carId); else window.driverForm(volver);
}
export async function guardarValorSemanal(carId, volver) {
  const c = S.cars.find(x => x.id === carId); if (!c) return;
  const nuevo = +val('vs_monto') || 0;
  if (!nuevo) { toast('Cargá el valor semanal'); return; }
  let o;
  if (c.tipo === 'alquiler') {
    const anterior = +c.monto || 0;
    const semanas = semanasCorridas(c);
    const chk = document.getElementById('vs_desdeAhora');
    const ajustesDeuda = (c.ajustesDeuda || []).slice();
    // La deuda se calcula como semanas × monto actual; para no reescribir las semanas
    // ya corridas, se compensa la diferencia con un ajuste de deuda.
    if (chk && chk.checked && semanas && nuevo !== anterior) {
      ajustesDeuda.push({ id: uid(), fecha: iso(today()), monto: semanas * (nuevo - anterior), motivo: 'Cambio de alquiler semanal de ' + money(anterior) + ' a ' + money(nuevo) + ': las ' + semanas + ' semanas ya corridas quedan al valor anterior' });
    }
    o = Object.assign({}, c, { monto: nuevo, valorSemanal: nuevo, ajustesDeuda, montoHistorial: actualizarHistorialMonto(c, nuevo) });
  } else {
    o = Object.assign({}, c, { valorSemanal: nuevo });
  }
  if (!(await save('cars', o))) return;
  toast('Valor semanal guardado');
  volverDeValorSemanal(carId, volver);
}
function actualizarHistorialTaller(ex, newTipo) {
  const prevTipo = ex ? ex.tipo : '';
  let historial = (ex && ex.historialTaller) || [];
  if (prevTipo === newTipo) return historial;
  const hoy = iso(today());
  if (prevTipo === 'taller') historial = historial.map(h => !h.hasta ? Object.assign({}, h, { hasta: hoy }) : h);
  if (newTipo === 'taller') historial = historial.concat([{ desde: hoy, hasta: null }]);
  return historial;
}
function actualizarHistorialVenc(ex, nuevos) {
  let historial = (ex && ex.vencHistorial) || [];
  const hoy = iso(today());
  VENC.forEach(v => {
    const prev = ex ? (ex[v[0]] || '') : '';
    const next = nuevos[v[0]] || '';
    if (next && next !== prev) historial = historial.concat([{ tipo: v[0], fechaAnterior: prev, fechaNueva: next, cambiado: hoy }]);
  });
  return historial;
}

export function setTabAuto(t) {
  document.querySelectorAll('.tabpanel[data-scope="auto"]').forEach(el => { el.style.display = el.dataset.tab === t ? '' : 'none'; });
  document.querySelectorAll('.tabs[data-scope="auto"] .tab').forEach(b => { b.classList.toggle('on', b.dataset.tab === t); });
}
function tabpanel(tab, visible, content) {
  return '<div class="tabpanel" data-scope="auto" data-tab="' + tab + '"' + (visible ? '' : ' style="display:none"') + '>' + content + '</div>';
}

export function carForm(id) {
  const ex = S.cars.find(x => x.id === id);
  const c = ex || { tipo: 'disponible', inicio: iso(today()) };
  let h = '<h3>' + (ex ? 'Auto ' + esc(c.patente) : 'Nuevo auto') + '</h3>';
  if (ex && c.vendido) h += '<div class="card" style="margin-bottom:10px"><span class="badge b-mute">Vendido</span></div>';
  else if (ex) {
    const estGen = estadoGeneralAuto(c);
    const estLabel = { ok: 'Todo al día', soft: 'Todo al día', warn: 'Algo pendiente', bad: 'Vencido / atención' }[estGen];
    const aceite = (c.mantenimientoPlan || []).find(p => p.item === 'aceite' && (p.intervaloKm || p.intervaloMeses));
    const eAceite = aceite ? estadoPlanItem(c, aceite) : null;
    h += '<div class="card" style="margin-bottom:10px">' + badge(estGen, estLabel) + (eAceite ? ' ' + badge(eAceite.cls, 'Aceite: ' + textoRestante(eAceite)) : '') + '</div>';
  }
  if (ex && !c.vendido) {
    const asigActual = c.choferId ? (c.historialChoferes || []).slice().reverse().find(hh => hh.choferId === c.choferId && !hh.hasta) : null;
    const tiempoConChofer = asigActual ? days(parse(asigActual.desde), today()) : null;
    h += '<div class="card" style="margin-bottom:10px">' + (c.choferId ?
      '<div class="row between"><div><div class="small muted">Chofer asignado' + (tiempoConChofer != null ? ' · hace ' + (tiempoConChofer < 30 ? tiempoConChofer + ' días' : Math.round(tiempoConChofer / 30) + ' meses') : '') + '</div><b>' + esc(driverName(c.choferId)) + '</b></div>' +
      '<div class="row"><button class="btn sec sm" onclick="asignarChoferForm(\'' + c.id + '\')">Cambiar</button>' +
      (c.tipo === 'alquiler' ? '<button class="btn danger sm" onclick="confirmDel(this,()=>quitarChofer(\'' + c.id + '\'))">Quitar</button>' : '') + '</div></div>'
      : '<div class="row between"><span class="muted">Sin chofer asignado</span><button class="btn sm" onclick="asignarChoferForm(\'' + c.id + '\')">Asignar chofer</button></div>') +
    valorSemanalRow(c, 'auto') +
    '</div>';
  }

  /* ---- Datos ---- */
  let datos = '';
  if (ex && c.tipo !== 'financiado' && c.valorMercado && c.costoCompra) {
    const dif = c.valorMercado - c.costoCompra;
    datos += '<div class="card row between"><span class="muted">Valor de mercado vs. invertido</span><b style="color:' + (dif >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(dif) + '</b></div>';
  }
  datos += '<div class="two"><label class="f"><span>Patente</span><input id="c_patente" value="' + esc(c.patente) + '" autocapitalize="characters"></label>' +
  '<label class="f"><span>Año</span><input id="c_anio" inputmode="numeric" value="' + esc(c.anio) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Marca</span><input id="c_marca" value="' + esc(c.marca) + '"></label>' +
  '<label class="f"><span>Modelo</span><input id="c_modelo" value="' + esc(c.modelo) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Color</span><input id="c_color" value="' + esc(c.color) + '"></label>' +
  '<label class="f"><span>Transmisión</span><select id="c_transmision"><option value="">Sin especificar</option>' + TRANSMISIONES.map(x => '<option value="' + x[0] + '"' + (c.transmision === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label></div>' +
  '<div class="two"><label class="f"><span>VIN / chasis</span><input id="c_vin" value="' + esc(c.vin) + '"></label>' +
  '<label class="f"><span>Número de motor</span><input id="c_numeroMotor" value="' + esc(c.numeroMotor) + '"></label></div>' +
  '<label class="f"><span>Etiquetas <small>separadas por coma</small></span><input id="c_tags" value="' + esc((c.tags || []).join(', ')) + '" placeholder="ej: premium, ejecutivo, nuevo"></label>' +
  '<div class="two"><label class="f"><span>Número de flota</span><input id="c_numflota" value="' + esc(c.numeroFlota) + '"></label>' +
  '<label class="f"><span>Combustible</span><select id="c_combustible"><option value="">Sin especificar</option>' + COMBUSTIBLES.map(x => '<option value="' + x[0] + '"' + (c.combustible === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label></div>' +
  '<div class="two"><label class="f"><span>Kilometraje actual</span><input id="c_km" inputmode="numeric" value="' + esc(c.km) + '"></label>' +
  '<label class="f"><span>Costo de compra</span><input id="c_costocompra" inputmode="decimal" value="' + esc(c.costoCompra || '') + '"></label></div>' +
  '<label class="f"><span>Valor de mercado actual</span><input id="c_valormercado" inputmode="decimal" value="' + esc(c.valorMercado || '') + '"></label>' +
  '<label class="f"><span>Estado</span><select id="c_tipo" data-orig="' + esc(ex ? c.tipo : '') + '" onchange="onTipo(this)">' + Object.keys(TIPOS).map(k => '<option value="' + k + '"' + (c.tipo === k ? ' selected' : '') + '>' + TIPOS[k] + '</option>').join('') + '</select></label>' +
  '<div class="sec-t">Vencimientos</div><div class="two">' + VENC.filter(v => v[0] !== 'seguro').map(v => '<label class="f"><span>' + v[1] + '</span><input id="v_' + v[0] + '" type="date" value="' + esc(c[v[0]]) + '"></label>').join('') + '</div>' +
  '<label class="chk"><input type="checkbox" id="c_form08"' + (c.form08 ? ' checked' : '') + '><span>08</span></label>' +
  '<label class="chk"><input type="checkbox" id="c_gncInstaladoEmpresa" onchange="document.getElementById(\'gncInstaladorBox\').style.display=this.checked?\'\':\'none\'"' + (c.gncInstaladoEmpresa ? ' checked' : '') + '><span>El GNC lo instaló la empresa</span></label>' +
  '<div id="gncInstaladorBox" class="two" style="display:' + (c.gncInstaladoEmpresa ? '' : 'none') + '"><label class="f"><span>Instalador</span><input id="c_gncInstalador" value="' + esc(c.gncInstalador) + '"></label>' +
  '<label class="f"><span>Fecha de instalación</span><input id="c_gncFechaInstalacion" type="date" value="' + esc(c.gncFechaInstalacion) + '"></label></div>' +
  '<div class="small muted" style="margin:-4px 0 8px">Si cargás un monto mensual de patente, la app genera el gasto automáticamente cada mes (dejalo en 0 para no generarlo).' + (!isAdmin() ? ' Solo un administrador puede editar estos montos.' : '') + '</div>' +
  '<div class="two">' +
  '<label class="f"><span>Patente: monto mensual</span><input id="c_patenteMensual" inputmode="decimal" value="' + esc(c.patenteMensual || '') + '"' + (isAdmin() ? '' : ' disabled') + '></label></div>' +
  '<label class="f"><span>Mantenimiento preventivo: estimado mensual <small>no genera gasto, solo para la rentabilidad</small></span><input id="c_mantenimientoMensualEstimado" inputmode="decimal" value="' + esc(c.mantenimientoMensualEstimado || '') + '"' + (isAdmin() ? '' : ' disabled') + '></label>' +
  '<div class="sec-t">Ubicación y GPS</div>' +
  '<div class="two"><label class="f"><span>Dónde duerme de noche</span><input id="c_dondeDuerme" value="' + esc(c.dondeDuerme) + '"></label>' +
  '<label class="f"><span>Link de Google Maps <small>opcional</small></span><input id="c_dondeDuermeMaps" type="url" value="' + esc(c.dondeDuermeMaps) + '"></label></div>' +
  '<label class="f"><span>Tipo de GPS</span><input id="c_gpsTipo" value="' + esc(c.gpsTipo) + '"></label>' +
  '<label class="chk"><input type="checkbox" id="c_gpsAlerta"' + (c.gpsAlerta ? ' checked' : '') + '><span>GPS roto / con alerta' + (c.gpsAlerta ? '' : ' (pone el auto en taller al guardar)') + '</span></label>' +
  '<div class="sec-t">Datos administrativos</div>' +
  '<div class="two"><label class="f"><span>Fecha de compra</span><input id="c_fechaCompra" type="date" value="' + esc(c.fechaCompra) + '"></label>' +
  '<label class="f"><span>Dónde se compró</span><input id="c_dondeCompro" value="' + esc(c.dondeCompro) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Gastos de patentamiento <small>opcional</small></span><input id="c_gastosPatentamiento" inputmode="decimal" value="' + esc(c.gastosPatentamiento || '') + '"></label>' +
  '<label class="f"><span>Titular registral <small>si no es la empresa</small></span><input id="c_titularRegistral" value="' + esc(c.titularRegistral) + '"></label></div>' +
  '<label class="chk"><input type="checkbox" id="c_llaveDuplicada"' + (c.llaveDuplicada ? ' checked' : '') + '><span>Tiene llave duplicada</span></label>' +
  '<div class="two"><label class="f"><span>Copias de llave <small>en total</small></span><input id="c_copiasLlave" inputmode="numeric" value="' + esc(c.copiasLlave || '') + '"></label>' +
  '<label class="f"><span>Dónde están</span><input id="c_llavesUbicacion" value="' + esc(c.llavesUbicacion) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Última inspección mecánica general</span><input id="c_ultimaInspeccionGeneral" type="date" value="' + esc(c.ultimaInspeccionGeneral) + '"></label>' +
  '<label class="f"><span>Último lavado / detailing</span><input id="c_ultimoLavado" type="date" value="' + esc(c.ultimoLavado) + '"></label></div>' +
  '<div class="sec-t">Cumplimiento normativo para dar de alta</div>' + CUMPLIMIENTO_NORMATIVO_ITEMS.map(x => '<label class="chk"><input type="checkbox" id="cn_' + x[0] + '"' + (c.cumplimientoNormativo && c.cumplimientoNormativo[x[0]] ? ' checked' : '') + '><span>' + x[1] + '</span></label>').join('') +
  '<div class="sec-t">Estado de flota</div>' +
  '<label class="chk"><input type="checkbox" id="c_soloAlquiler"' + (c.soloAlquiler ? ' checked' : '') + '><span>Solo alquiler, nunca financiado</span></label>' +
  '<label class="chk"><input type="checkbox" id="c_enPreparacion"' + (c.enPreparacion ? ' checked' : '') + '><span>En preparación (todavía no disponible para asignar)</span></label>' +
  '<label class="chk"><input type="checkbox" id="c_reservado" onchange="document.getElementById(\'reservadoBox\').style.display=this.checked?\'\':\'none\'"' + (c.reservado ? ' checked' : '') + '><span>Reservado</span></label>' +
  '<div id="reservadoBox" style="display:' + (c.reservado ? '' : 'none') + '"><label class="f"><span>Reservado para</span><input id="c_reservadoPara" value="' + esc(c.reservadoPara) + '"></label></div>' +
  '<label class="chk"><input type="checkbox" id="c_aReemplazar" onchange="document.getElementById(\'reemplazoBox\').style.display=this.checked?\'\':\'none\'"' + (c.aReemplazar ? ' checked' : '') + '><span>Marcar para reemplazar</span></label>' +
  '<div id="reemplazoBox" style="display:' + (c.aReemplazar ? '' : 'none') + '"><label class="f"><span>Motivo</span><select id="c_motivoReemplazo">' + MOTIVOS_REEMPLAZO.map(x => '<option value="' + x[0] + '"' + (c.motivoReemplazo === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Fecha estimada de renovación</span><input id="c_fechaRenovacionPlan" type="date" value="' + esc(c.fechaRenovacionPlan) + '"></label></div>' +
  '<div class="sec-t">Elementos de seguridad</div>' + ELEMENTOS_SEGURIDAD.map(x => '<label class="chk"><input type="checkbox" id="es_' + x[0] + '"' + (c.elementosSeguridad && c.elementosSeguridad[x[0]] ? ' checked' : '') + '><span>' + x[1] + '</span></label>').join('') +
  '<label class="f"><span>Batería 12V: fecha de cambio</span><input id="c_bateria12vFecha" type="date" value="' + esc(c.bateria12vFecha) + '"></label>' +
  '<div class="sec-t">Neumáticos</div>' +
  '<div class="two"><label class="f"><span>Marca / modelo</span><input id="c_neumaticosMarca" value="' + esc(c.neumaticosMarca) + '"></label>' +
  '<label class="f"><span>Rodado <small>pulgadas</small></span><input id="c_rodadoPulgadas" inputmode="numeric" value="' + esc(c.rodadoPulgadas || '') + '"></label></div>' +
  ['di', 'dd', 'ti', 'td'].map(pos => {
    const n = (c.neumaticos || {})[pos] || {};
    const label = { di: 'Del. izquierdo', dd: 'Del. derecho', ti: 'Tras. izquierdo', td: 'Tras. derecho' }[pos];
    return '<div class="two"><label class="f"><span>' + label + ' · fecha</span><input id="nm_' + pos + '_fecha" type="date" value="' + esc(n.fecha || '') + '"></label>' +
    '<label class="f"><span>Profundidad <small>mm</small></span><input id="nm_' + pos + '_prof" inputmode="numeric" value="' + esc(n.profundidad || '') + '"></label></div>';
  }).join('') +
  (ex ? '<div class="sec-t">Accesorios instalados</div>' +
  ((c.accesorios || []).length ? c.accesorios.map((a, i) => {
    let garTxt = '';
    if (a.garantiaMeses && a.fecha) {
      const d = parse(a.fecha); d.setMonth(d.getMonth() + (+a.garantiaMeses));
      garTxt = (d < today() ? 'Garantía vencida' : 'Garantía hasta ' + fdate(iso(d)));
    }
    return '<div class="card row tap" onclick="accesorioForm(\'' + c.id + '\',' + i + ')"><div class="grow"><div>' + esc(a.nombre) + '</div><div class="small muted">' + fdate(a.fecha) + (garTxt ? ' · ' + garTxt : '') + '</div></div></div>';
  }).join('') : '<div class="small muted" style="margin-bottom:8px">Sin accesorios registrados.</div>') +
  '<button class="btn sec block" style="margin:8px 0 20px" onclick="accesorioForm(\'' + c.id + '\')">+ Agregar accesorio</button>' +
  '<button class="btn sec block" style="margin-bottom:20px" onclick="qrAutoForm(\'' + c.id + '\')">Generar QR para reportar problemas</button>' : '') +
  '<div class="sec-t">Archivos</div><div id="files"></div><div id="fstatus" class="small" style="margin:-4px 0 12px;overflow-wrap:anywhere"></div>' +
  '<label class="f"><span>Notas</span><textarea id="c_notas">' + esc(c.notas) + '</textarea></label>';

  /* ---- Seguro ---- */
  let seguroTab = '<div class="sec-t">Datos del seguro</div>' +
  '<div class="two"><label class="f"><span>N° de póliza</span><input id="c_poliza" value="' + esc(c.polizaNumero) + '"></label>' +
  (() => {
    const fija = c.aseguradora && ASEGURADORAS.slice(0, -1).includes(c.aseguradora);
    const esOtro = c.aseguradora && !fija;
    return '<label class="f"><span>Aseguradora</span><select id="c_aseguradora" onchange="document.getElementById(\'aseguradoraOtroBox\').style.display=this.value===\'Otro\'?\'\':\'none\'">' +
    '<option value=""' + (!c.aseguradora ? ' selected' : '') + '>Sin especificar</option>' +
    ASEGURADORAS.map(a => '<option value="' + a + '"' + ((fija && c.aseguradora === a) || (esOtro && a === 'Otro') ? ' selected' : '') + '>' + a + '</option>').join('') +
    '</select></label>';
  })() + '</div>' +
  (() => {
    const fija = c.aseguradora && ASEGURADORAS.slice(0, -1).includes(c.aseguradora);
    const esOtro = c.aseguradora && !fija;
    return '<div id="aseguradoraOtroBox" style="display:' + (esOtro ? '' : 'none') + '"><label class="f"><span>Nombre de la aseguradora</span><input id="c_aseguradoraOtro" value="' + esc(esOtro ? c.aseguradora : '') + '"></label></div>';
  })() +
  '<div class="two"><label class="f"><span>Cobertura</span><select id="c_coberturaSeguro"><option value="">Sin especificar</option>' + COBERTURAS_SEGURO.map(x => '<option value="' + x[0] + '"' + (c.coberturaSeguro === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Franquicia</span><input id="c_franquiciaSeguro" inputmode="decimal" value="' + esc(c.franquiciaSeguro || '') + '"></label></div>' +
  '<label class="f"><span>¿Quién paga el seguro?</span><select id="c_seguroPaga" onchange="document.getElementById(\'seguroPagaAyuda\').textContent=ayudaSeguroPaga(this.value)"' + (isAdmin() ? '' : ' disabled') + '>' +
    SEGURO_PAGA.map(x => '<option value="' + x[0] + '"' + (seguroPaga(c) === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<div id="seguroPagaAyuda" class="small muted" style="margin:-4px 0 8px">' + esc(ayudaSeguroPaga(seguroPaga(c))) + '</div>' +
  '<div class="two"><label class="f"><span>Vencimiento de la póliza</span><input id="v_seguro" type="date" value="' + esc(c.seguro) + '"></label>' +
  '<label class="f"><span>Seguro: monto mensual</span><input id="c_seguroMensual" inputmode="decimal" value="' + esc(c.seguroMensual || '') + '"' + (isAdmin() ? '' : ' disabled') + '></label>' + '</div>' +
  '<div class="small muted" style="margin:-4px 0 8px">Con el monto mensual cargado, la app genera el gasto del seguro cada mes (salvo que lo pague el chofer).</div>';
  if (ex && seguroPaga(c) === 'recupera') seguroTab += tarjetaSeguroRecupera(c);
  if (ex) seguroTab += '<div class="sec-t">Renovación y cotizaciones</div><div id="segRenov">' + renovacionSeguroHtml(c) + '</div>';
  seguroTab += '<div class="sec-t">Documentos del seguro</div>' + (ex ? '<div id="segDocs">' + seguroDocsHtml(c) + '</div><div id="segStatus" class="small" style="margin:-4px 0 12px;overflow-wrap:anywhere"></div>' : '<div class="small muted" style="margin-bottom:12px">Guardá el auto y después subís la credencial, la póliza y el certificado.</div>');

  /* ---- Contrato ---- */
  let contrato = '';
  if (ex && isContract(c)) {
    const i = calc(c);
    const fin = finFinanciado(c);
    const mon = c.tipo === 'financiado' ? moneyUSD : money;
    contrato += '<div class="card"><div class="row between"><span class="muted">Pagado desde el inicio</span><b>' + mon(i.paid) + '</b></div>' +
    '<div class="row between"><span class="muted">Debería haber pagado</span><b>' + mon(i.due) + '</b></div>' +
    '<div class="row between"><span class="muted">Deuda</span><b style="color:' + (i.debt > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + mon(i.debt) + '</b></div>' +
    (i.ajustes !== 0 ? '<div class="row between small muted"><span>Ajustes / condonaciones</span><span>' + (i.ajustes > 0 ? '-' + mon(i.ajustes) : '+' + mon(-i.ajustes)) + '</span></div>' : '') +
    (i.adelantoAplicado ? '<div class="row between small muted"><span>Cubierto con semana adelantada</span><span>-' + mon(i.adelantoAplicado) + '</span></div>' : '') +
    (c.anticipo ? '<div class="row between small muted"><span>Anticipo pagado</span><span>' + mon(c.anticipo) + '</span></div>' : '') +
    (i.saldo != null ? '<div class="row between"><span class="muted">Saldo total de la financiación</span><b>' + mon(i.saldo) + '</b></div>' : '') +
    (c.tipo === 'financiado' && c.cuotas ? '<div class="row between small muted"><span>Cuota actual</span><span>' + Math.min(i.weeks, +c.cuotas) + ' de ' + c.cuotas + '</span></div>' : '') +
    (fin ? '<div class="row between"><span class="muted">Fin estimado de cuotas</span><b>' + fdate(iso(fin)) + '</b></div>' : '') +
    '<div class="row" style="margin-top:10px"><button class="btn grow" onclick="payForm(\'' + c.id + '\')">Registrar cobro</button><button class="btn sec" onclick="ajusteForm(\'' + c.id + '\')">Ajustar deuda</button></div>' +
    (c.tipo === 'financiado' && c.cuotas ? '<div class="row" style="margin-top:8px"><button class="btn sec grow" onclick="cronogramaCuotasForm(\'' + c.id + '\')">Ver cronograma de cuotas</button></div>' : '') +
    (c.tipo !== 'financiado' ? '<div class="row" style="margin-top:8px"><button class="btn sec grow" onclick="simularAumentoForm(\'' + c.id + '\')">Simular aumento</button></div>' : '') +
    '</div>';
    const AJ = (c.ajustesDeuda || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (AJ.length) contrato += '<div class="sec-t">Ajustes de deuda</div>' + AJ.map(x => '<div class="card row"><div class="grow"><div>' + (x.monto >= 0 ? '-' + mon(x.monto) : '+' + mon(-x.monto)) + ' <span class="small muted">' + fdate(x.fecha) + '</span></div>' + (x.motivo ? '<div class="small muted">' + esc(x.motivo) + '</div>' : '') + '</div>' + (canDelete() ? '<button class="btn danger sm" onclick="confirmDel(this,()=>delAjuste(\'' + c.id + '\',\'' + x.id + '\'))">Borrar</button>' : '') + '</div>').join('');
    if (c.tipo === 'financiado' && i.saldo != null && i.saldo <= 0) {
      contrato += '<div class="sec-t">Financiación completada</div><div class="card">' +
      '<label class="chk"><input type="checkbox" id="c_tituloTransferido"' + (c.tituloTransferido ? ' checked' : '') + '><span>Título transferido al chofer</span></label>' +
      '<label class="f"><span>Fecha de transferencia</span><input id="c_tituloTransferidoFecha" type="date" value="' + esc(c.tituloTransferidoFecha || iso(today())) + '"></label></div>';
    }
    if (c.choferId) {
      const cv = contratoVencimiento(c);
      const cvs = cv ? vs(cv) : null;
      if (cvs && cvs.cls !== 'ok') contrato += '<div class="card row between small" style="margin-bottom:6px"><span>Contrato ' + (cvs.d < 0 ? 'vencido' : 'próximo a vencer') + '</span>' + badge(cvs.cls, cvs.t) + '</div>';
      else if (cv) contrato += '<div class="small muted" style="margin-bottom:6px">Contrato vigente hasta ' + fdate(cv) + '.</div>';
      const vencido = cvs && cvs.cls !== 'ok';
      contrato += '<div class="row" style="margin:8px 0"><button class="btn sec grow" onclick="' + (vencido ? 'renovarContratoForm' : 'contratoForm') + '(\'' + c.id + '\')">' + (vencido ? 'Renovar contrato' : 'Generar contrato') + '</button><button class="btn sec" onclick="generarConstanciaCesion(\'' + c.id + '\')">Constancia de uso</button></div>';
      if ((c.contratoHistorial || []).length > 1) {
        contrato += '<details style="margin-bottom:8px"><summary class="small muted" style="cursor:pointer">Historial de contratos (' + c.contratoHistorial.length + ')</summary>' +
        c.contratoHistorial.slice().reverse().map(h => '<div class="row between small" style="padding:2px 0"><span>' + (h.renovacion ? 'Renovación · ' : '') + fdate(h.fecha) + '</span><span class="muted">' + (h.tipo === 'financiado' ? moneyUSD(h.monto) : money(h.monto)) + (h.cuotas ? ' · ' + h.cuotas + ' cuotas' : '') + (h.pdfId ? ' · <a class="tap" style="text-decoration:underline" onclick="viewFile(\'' + h.pdfId + '\',\'' + esc(h.pdfName || 'contrato.pdf') + '\')">ver PDF</a>' : '') + '</span></div>').join('') + '</details>';
      }
    }
    if (canVerFinanzas() && !featureOculta('socios')) contrato += seccionSocios(c);
    const mp = mejorPeorMesAuto(c);
    if (mp) {
      const mesLabel = k => new Date(k + '-02').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      contrato += '<div class="sec-t">Mejor y peor mes</div><div class="card">' +
      '<div class="row between small"><span class="muted">Mejor: ' + esc(mesLabel(mp.mejor[0])) + '</span><b style="color:var(--ok)">' + money(mp.mejor[1]) + '</b></div>' +
      '<div class="row between small" style="margin-top:2px"><span class="muted">Peor: ' + esc(mesLabel(mp.peor[0])) + '</span><b style="color:var(--bad)">' + money(mp.peor[1]) + '</b></div></div>';
    }
  }
  contrato += '<div id="contrato"><label class="f"><span>Chofer</span><select id="c_chofer"><option value="">Elegir chofer</option>' + S.drivers.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))).map(d => '<option value="' + d.id + '"' + (c.choferId === d.id ? ' selected' : '') + '>' + esc(d.nombre) + '</option>').join('') + '</select></label>' +
  '<div id="finbox" class="two"><label class="f"><span id="lbltotal">Total a pagar en cuotas</span><input id="c_total" inputmode="decimal" value="' + esc(c.total || '') + '" oninput="autoCuota()"></label>' +
  '<label class="f"><span>Cantidad de cuotas</span><input id="c_cuotas" inputmode="numeric" value="' + esc(c.cuotas || '') + '" oninput="autoCuota()"></label>' +
  '<label class="f"><span>Anticipo pagado <small>opcional</small></span><input id="c_anticipo" inputmode="decimal" value="' + esc(c.anticipo || '') + '"></label></div>' +
  '<div class="two"><label class="f"><span id="lblmonto">Monto semanal</span><input id="c_monto" inputmode="decimal" value="' + esc(c.monto || '') + '" data-vs="' + esc(c.valorSemanal || '') + '" oninput="this.dataset.touched=1"></label>' +
  '<label class="f"><span>Inicio del contrato</span><input id="c_inicio" type="date" value="' + esc(c.inicio) + '"></label></div>' +
  (ex && isContract(c) && c.tipo !== 'financiado' && c.inicio && c.monto ? '<button type="button" class="btn sec sm" style="margin:-4px 0 12px" onclick="sugerirAjusteInflacion(\'' + c.id + '\')">Sugerir ajuste por inflación</button>' : '') +
  '<div class="small muted" style="margin:-4px 0 12px">Si cambia el chofer o pasa de alquiler a financiación, poné la fecha nueva de inicio. La deuda se cuenta desde ahí.</div></div>';
  if (ex) {
    const P = S.payments.filter(p => p.carId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5);
    if (P.length) contrato += '<div class="sec-t">Últimos cobros</div>' + P.map(p => '<div class="row between small"><span class="muted">' + fdate(p.fecha) + '</span><span>' + (p.tipo === 'cuota' ? moneyUSD(p.monto) : money(p.monto)) + '</span></div>').join('');
  }

  let mant = '', gastos = '', hist = '';
  if (ex) {
    /* ---- Mantenimiento ---- */
    const diasTaller = diasEnTaller(c);
    const plan = (c.mantenimientoPlan || []).filter(p => p.intervaloKm || p.intervaloMeses);
    const MH = S.mantenimientos.filter(m => m.carId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const totalMant = MH.reduce((a, m) => a + (+m.costo || 0), 0);
    const FT = fichaTecnica(c);
    if (FT.length) {
      mant += '<div class="sec-t" style="margin-top:0">Ficha técnica</div><div class="card">' +
      FT.map(x => '<div class="row between small" style="padding:2px 0"><span class="muted">' + esc(x.label) + '</span><span>' + esc([x.marca, x.especificacion].filter(Boolean).join(' · ')) + '</span></div>').join('') +
      '</div>';
    }
    mant += '<div class="sec-t row between">Mantenimiento<span class="small muted">' + money(totalMant) + ' en total' + (diasTaller ? ' · ' + diasTaller + ' días parado' : '') + '</span></div>';
    if (c.tipo === 'taller') {
      if (c.reemplazoTemporalActivo) {
        const temp = S.cars.find(x => x.id === c.reemplazoTemporalCarId);
        mant += '<div class="card" style="margin-bottom:10px"><div class="small muted">Reemplazo temporal activo</div><div>' + esc(driverName(c.reemplazoTemporalChoferId)) + ' está manejando ' + (temp ? esc(temp.patente) : 'un auto') + '</div>' +
        '<button class="btn sec block" style="margin-top:8px" onclick="finalizarReemplazoTemporal(\'' + c.id + '\');carForm(\'' + c.id + '\')">Finalizar reemplazo temporal</button></div>';
      } else if (c.choferId) {
        mant += '<div class="row" style="margin-bottom:10px"><button class="btn sec grow" onclick="reemplazoTemporalForm(\'' + c.id + '\')">Asignar auto de reemplazo temporal</button></div>';
      }
      mant += '<div class="row" style="margin-bottom:10px"><button class="btn sec grow" onclick="sacarDeTaller(\'' + c.id + '\')">Sacar de taller</button></div>';
    }
    if (plan.length) mant += plan.map(p => { const e = estadoPlanItem(c, p); return '<div class="row between small" style="padding:4px 0"><span>' + esc(p.label || p.item) + '</span><span>' + badge(e.cls, textoRestante(e)) + '</span></div>'; }).join('');
    mant += '<div class="row" style="margin:8px 0"><button class="btn sec grow" onclick="mantenimientoForm(\'' + c.id + '\')">+ Registrar mantenimiento</button>' + (plan.length ? '<button class="btn sec" onclick="editarPlanMantenimiento(\'' + c.id + '\')">Editar plan</button>' : '') + '</div>';
    if (MH.length) mant += '<div class="sec-t">Historial de mantenimiento</div>' + MH.map(m => '<div class="card row"><div class="grow tap" onclick="mantenimientoForm(\'' + c.id + '\',\'' + m.id + '\')"><div>' + money(m.costo) + ' <span class="small muted">' + esc(m.label || m.item) + (m.tipo === 'correctivo' ? ' · correctivo' : '') + (m.sinFactura ? ' · sin factura' : '') + '</span></div><div class="small muted">' + fdate(m.fecha) + (m.km ? ' · ' + (+m.km).toLocaleString('es-AR') + ' km' : '') + ([m.marca, m.especificacion].filter(Boolean).length ? ' · ' + esc([m.marca, m.especificacion].filter(Boolean).join(' · ')) : '') + '</div></div>' + (canDelete() ? '<button class="btn danger sm" onclick="confirmDel(this,()=>delMantenimiento(\'' + m.id + '\'))">Borrar</button>' : '') + '</div>').join('');
    const MR = MH.filter(m => m.marca || m.especificacion);
    if (MR.length) mant += '<div class="sec-t">Historial de repuestos</div>' + MR.map(m => '<div class="row between small" style="padding:4px 0"><span>' + esc(m.label || m.item) + ': ' + esc([m.marca, m.especificacion].filter(Boolean).join(' · ')) + '</span><span class="muted">' + fdate(m.fecha) + '</span></div>').join('');

    /* ---- Gastos fijos mensuales (seguro + patente) ---- */
    const GF = gastosFijosMensuales(c);
    if (GF.total || canVerFinanzas()) {
      gastos += '<div class="sec-t">Gastos fijos mensuales</div><div class="card">' +
      '<div class="row between small"><span class="muted">Seguro</span><span>' + (GF.seguro ? money(GF.seguro) + '/mes' : 'Sin cargar') + '</span></div>' +
      '<div class="row between small"><span class="muted">Patente</span><span>' + (GF.patente ? money(GF.patente) + '/mes' : 'Sin cargar') + '</span></div>' +
      (GF.mantenimientoEstimado ? '<div class="row between small"><span class="muted">Mantenimiento preventivo (estimado)</span><span>' + money(GF.mantenimientoEstimado) + '/mes</span></div>' : '') +
      '<div class="row between" style="margin-top:4px"><b>Total</b><b>' + money(GF.total) + '/mes</b></div>' +
      (canVerFinanzas() ? comparacionGastoFijo(c).filter(x => x.distinto).map(x => '<div class="small muted" style="margin-top:6px;color:var(--warn)">' + (x.categoria === 'seguro' ? 'Seguro' : 'Patente') + ': el monto cargado difiere ' + x.difPct + '% de lo que realmente se pagó en los últimos meses (' + money(x.promedioReal) + ' en promedio).</div>').join('') : '') +
      '</div>';
      const HGF = historialGastosFijos(c);
      if (HGF.length) {
        gastos += '<details style="margin-bottom:8px"><summary class="small muted" style="cursor:pointer">Historial de seguro y patente pagados (' + HGF.length + ')</summary>' +
        HGF.map(g => '<div class="row between small" style="padding:2px 0"><span>' + esc(gastoCatLabel(g.categoria)) + '</span><span class="muted">' + money(g.costo) + ' · ' + fdate(g.fecha) + '</span></div>').join('') + '</details>';
      }
      const gfh = (c.gastoFijoHistorial || []).slice().reverse();
      if (gfh.length) {
        gastos += '<details style="margin-bottom:8px"><summary class="small muted" style="cursor:pointer">Historial de cambios en los montos (' + gfh.length + ')</summary>' +
        gfh.map(x => '<div class="row between small" style="padding:2px 0"><span>' + (x.campo === 'seguro' ? 'Seguro' : 'Patente') + ': ' + money(x.anterior) + ' → ' + money(x.nuevo) + '</span><span class="muted">' + fdate(x.fecha) + '</span></div>').join('') + '</details>';
      }
    }

    /* ---- Repuestos consumidos ---- */
    const RC = movimientosSalidaPorAuto(c.id);
    if (RC.length) {
      gastos += '<div class="sec-t row between">Repuestos consumidos<span class="small muted">' + money(gastosRepuestosPorAuto(c.id)) + ' en total</span></div><details style="margin-bottom:8px">' +
      '<summary class="small muted" style="cursor:pointer">Ver movimientos (' + RC.length + ')</summary>' +
      RC.map(x => '<div class="row between small" style="padding:2px 0"><span>' + esc(x.r.nombre) + ' · ' + x.m.cantidad + ' ' + esc(unidadLabel(x.r.unidad)) + '</span><span class="muted">' + fdate(x.m.fecha) + '</span></div>').join('') + '</details>';
    }

    /* ---- Gastos (incluye multas y siniestros) ---- */
    const G = S.gastos.filter(g => g.carId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const totalGastos = G.reduce((a, g) => a + (+g.costo || 0), 0);
    gastos += '<div class="sec-t row between">Gastos<span class="small muted">' + money(totalGastos) + ' en total</span></div>';
    if (G.length) gastos += G.map(g => '<div class="card row"><div class="grow tap" onclick="' + (g.reclamoSeguro ? "reclamoSeguroForm('" + g.id + "')" : '') + '"><div>' + money(g.costo) + ' <span class="small muted">' + esc(gastoCatLabel(g.categoria)) + (g.sinFactura ? ' · sin factura' : '') + '</span></div><div class="small muted">' + fdate(g.fecha) + (g.proveedor ? ' · ' + esc(g.proveedor) : '') + (g.descripcion ? ' · ' + esc(g.descripcion) : '') + '</div>' + (g.reclamoSeguro ? badge(g.reclamoEstado === 'aprobado' ? 'ok' : g.reclamoEstado === 'rechazado' ? 'bad' : 'warn', 'Seguro: ' + (RECLAMO_SEGURO_ESTADOS.find(x => x[0] === g.reclamoEstado) || [0, g.reclamoEstado])[1]) : '') + '</div>' + (canDelete() ? '<button class="btn danger sm" onclick="event.stopPropagation();confirmDel(this,()=>delGasto(\'' + g.id + '\'))">Borrar</button>' : '') + '</div>').join('');
    gastos += '<button class="btn sec block" style="margin:8px 0 20px" onclick="gastoForm(\'' + c.id + '\')">+ Agregar gasto</button>';
    const MU = S.multas.filter(m => m.carId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const estLabel = e => (MULTA_ESTADOS.find(x => x[0] === e) || [0, e])[1];
    gastos += '<div class="sec-t">Multas</div>';
    if (MU.length) gastos += MU.map(m => '<div class="card row tap" onclick="multaForm(\'' + c.id + '\',\'' + m.id + '\')"><div class="grow"><div>' + money(m.monto) + ' <span class="small muted">' + fdate(m.fecha) + '</span></div><div class="small muted">' + esc(m.choferId ? driverName(m.choferId) : 'Sin asignar') + '</div></div>' + badge(estadoMultaCls(m.estado), estLabel(m.estado)) + (canDelete() ? '<button class="btn danger sm" onclick="event.stopPropagation();confirmDel(this,()=>delMulta(\'' + m.id + '\'))">Borrar</button>' : '') + '</div>').join('');
    else gastos += '<div class="small muted" style="margin-bottom:8px">Sin multas registradas.</div>';
    gastos += '<button class="btn sec block" style="margin:8px 0 20px" onclick="multaForm(\'' + c.id + '\')">+ Registrar multa</button>';
    const SI = S.siniestros.filter(x => x.carId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const estSinLabel = e => (SINIESTRO_ESTADOS.find(x => x[0] === e) || [0, e])[1];
    const tipoSinLabel = t => (TIPOS_SINIESTRO.find(x => x[0] === t) || [0, t])[1];
    gastos += '<div class="sec-t">Siniestros</div>';
    if (SI.length) gastos += SI.map(s => '<div class="card row tap" onclick="siniestroForm(\'' + c.id + '\',\'' + s.id + '\')"><div class="grow"><div>' + esc(tipoSinLabel(s.tipo)) + ' <span class="small muted">' + fdate(s.fecha) + '</span></div><div class="small muted">' + esc(s.choferId ? driverName(s.choferId) : 'Sin asignar') + (s.costoTaller ? ' · ' + money(s.costoTaller) : '') + '</div></div>' + badge(s.estado === 'cerrado' ? 'mute' : s.estado === 'tramite' ? 'warn' : 'bad', estSinLabel(s.estado)) + (canDelete() ? '<button class="btn danger sm" onclick="event.stopPropagation();confirmDel(this,()=>delSiniestro(\'' + s.id + '\'))">Borrar</button>' : '') + '</div>').join('');
    else gastos += '<div class="small muted" style="margin-bottom:8px">Sin siniestros registrados.</div>';
    gastos += '<button class="btn sec block" style="margin:8px 0 20px" onclick="siniestroForm(\'' + c.id + '\')">+ Registrar siniestro</button>';

    /* ---- Historial ---- */
    if (c.vendido && c.precioVenta) {
      const r = resultadoVenta(c);
      if (r) {
        hist += '<div class="card"><div class="sec-t" style="margin-top:0">Resultado de la venta</div>' +
        '<div class="row between small"><span class="muted">Costo de compra</span><span>' + money(r.costoCompra) + '</span></div>' +
        '<div class="row between small"><span class="muted">Cobrado en alquiler</span><span>' + money(r.cobrado) + '</span></div>' +
        '<div class="row between small"><span class="muted">Gastos</span><span>' + money(r.gastos) + '</span></div>' +
        '<div class="row between small"><span class="muted">Precio de venta</span><span>' + money(r.precioVenta) + '</span></div>' +
        '<div class="row between" style="margin-top:6px"><b>Resultado</b><b style="color:' + (r.resultado >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(r.resultado) + '</b></div></div>';
      }
    }
    const LT = lineaDeTiempoAuto(c);
    if (LT.length) {
      hist += '<div class="sec-t" style="margin-top:0">Línea de tiempo</div><div class="card">' +
      LT.map(x => '<div class="row between small" style="padding:3px 0"><span>' + esc(x.texto) + '</span><span class="muted">' + fdate(x.fecha) + '</span></div>').join('') + '</div>';
    }
    const I = S.inspecciones.filter(x => x.carId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    hist += '<div class="sec-t">Inspecciones de entrega/recepción</div>';
    if (I.length) hist += I.map(x => '<div class="card row"><div class="grow"><div>' + (x.tipo === 'entrega' ? 'Entrega' : 'Recepción') + ' <span class="small muted">' + fdate(x.fecha) + (x.km ? ' · ' + x.km + ' km' : '') + (x.firma ? ' · firmado' : '') + '</span></div>' + (x.notas ? '<div class="small muted">' + esc(x.notas) + '</div>' : '') + '</div>' + (canDelete() ? '<button class="btn danger sm" onclick="confirmDel(this,()=>delInspeccion(\'' + x.id + '\'))">Borrar</button>' : '') + '</div>').join('');
    else hist += '<div class="small muted" style="margin-bottom:8px">Sin inspecciones registradas.</div>';
    hist += '<button class="btn sec block" style="margin:8px 0 6px" onclick="inspeccionForm(\'' + c.id + '\')">+ Registrar inspección</button>';
    hist += '<button class="btn sec block" style="margin-bottom:20px" onclick="traspasoForm(\'' + c.id + '\')">Traspaso (cambiar chofer con checklist)</button>';
    const H = (c.historialChoferes || []).slice().sort((a, b) => b.desde.localeCompare(a.desde));
    if (H.length) {
      const totalHistorico = isAdmin() ? S.payments.filter(p => p.carId === c.id).reduce((a, p) => a + (+p.monto || 0), 0) : null;
      hist += '<div class="sec-t row between">Historial de choferes' + (totalHistorico != null ? '<span class="small muted">Total cobrado en este auto: ' + (c.tipo === 'financiado' ? moneyUSD(totalHistorico) : money(totalHistorico)) + '</span>' : '') + '</div>' +
      H.map(x => '<div class="row between small" style="padding:4px 0"><span>' + esc(driverName(x.choferId) || 'Chofer eliminado') + '</span><span class="muted">' + fdate(x.desde) + ' – ' + (x.hasta ? fdate(x.hasta) : 'actual') + '</span></div>').join('');
      if (isAdmin() && c.tipo !== 'financiado') {
        const desglose = desgloseCobradoPorChofer(c);
        if (desglose.length > 1) {
          const maxCobrado = Math.max(...desglose.map(x => x.cobrado), 1);
          hist += '<div class="small muted" style="margin:8px 0 4px">Cobrado y rentabilidad por chofer</div>' +
          desglose.map(x => '<div style="margin-bottom:8px"><div class="row between small"><span>' + esc(driverName(x.choferId) || 'Chofer eliminado') + '</span><b>' + money(x.cobrado) + '</b></div>' +
          '<div style="background:var(--soft);border-radius:6px;height:6px;overflow:hidden;margin:3px 0"><div style="width:' + Math.round(x.cobrado / maxCobrado * 100) + '%;height:100%;background:var(--teal)"></div></div>' +
          '<div class="small muted">Rentabilidad neta: <b style="color:' + (x.neta >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(x.neta) + '</b></div></div>').join('');
        }
      }
    }
    const HM = (c.montoHistorial || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (HM.length) {
      hist += '<div class="sec-t">Historial de monto semanal</div>' + HM.map(x => '<div class="row between small" style="padding:4px 0"><span>' + (c.tipo === 'financiado' ? moneyUSD(x.monto) : money(x.monto)) + '</span><span class="muted">' + fdate(x.fecha) + '</span></div>').join('');
    }
    const HV = (c.vencHistorial || []).slice().sort((a, b) => b.cambiado.localeCompare(a.cambiado));
    if (HV.length) {
      const vencLabel = t => (VENC.find(v => v[0] === t) || [0, t])[1];
      hist += '<div class="sec-t">Historial de vencimientos resueltos</div>' + HV.map(x => '<div class="row between small" style="padding:4px 0"><span>' + esc(vencLabel(x.tipo)) + (x.fechaAnterior ? ': ' + fdate(x.fechaAnterior) + ' → ' + fdate(x.fechaNueva) : ': cargado ' + fdate(x.fechaNueva)) + '</span><span class="muted">' + fdate(x.cambiado) + '</span></div>').join('');
    }
    if (isAdmin()) hist += '<button class="btn sec block" style="margin-top:12px" onclick="historialAutoView(\'' + c.id + '\',\'' + esc(c.patente) + '\')">Ver historial completo de cambios</button>';
  }

  const saveCancelRow = '<div class="row stickysave"><button class="btn grow" onclick="saveCar(this' + (ex ? ",'" + c.id + "'" : ',null') + ')">Guardar</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>';
  let accionesRow = ex ? '<div class="row" style="margin-top:20px"><button class="btn sec grow" onclick="' + (c.vendido ? "toggleVendido('" + c.id + "')" : "venderAutoForm('" + c.id + "')") + '">' + (c.vendido ? 'Restaurar de vendidos' : 'Marcar como vendido') + '</button></div>' : '';
  if (ex && !c.vendido) {
    accionesRow += '<div class="row" style="margin-top:8px"><button class="btn sec grow" onclick="silenciarAlertasAuto(\'' + c.id + '\')">Silenciar alertas 30 días</button></div>';
  }
  if (ex && canDelete()) {
    const nPagos = S.payments.filter(p => p.carId === c.id).length;
    const nOtros = S.gastos.filter(g => g.carId === c.id).length + S.mantenimientos.filter(m => m.carId === c.id).length + S.multas.filter(m => m.carId === c.id).length;
    const avisoHist = (nPagos || nOtros) ? '<div class="small muted" style="margin:8px 0 4px">Este auto tiene ' + [nPagos ? nPagos + ' cobro' + (nPagos === 1 ? '' : 's') : '', nOtros ? nOtros + ' registro' + (nOtros === 1 ? '' : 's') + ' de gastos/mantenimiento/multas' : ''].filter(Boolean).join(' y ') + '. Al eliminar el auto se borran los cobros' + (nOtros ? '; el resto queda sin auto asociado' : '') + '.</div>' : '';
    accionesRow += '<div style="margin-top:8px">' + avisoHist + '<button class="btn danger block" onclick="confirmDel(this,()=>delCar(\'' + c.id + '\'))">Eliminar auto</button></div>';
  }

  if (ex) {
    h += '<div class="tabs" data-scope="auto">' +
      '<button class="tab on" data-tab="datos" onclick="setTabAuto(\'datos\')">Datos</button>' +
      '<button class="tab" data-tab="contrato" onclick="setTabAuto(\'contrato\')">Contrato</button>' +
      '<button class="tab" data-tab="seguro" onclick="setTabAuto(\'seguro\')">Seguro</button>' +
      '<button class="tab" data-tab="mant" onclick="setTabAuto(\'mant\')">Mantenimiento</button>' +
      '<button class="tab" data-tab="gastos" onclick="setTabAuto(\'gastos\')">Gastos</button>' +
      '<button class="tab" data-tab="hist" onclick="setTabAuto(\'hist\')">Historial</button>' +
    '</div>';
    h += saveCancelRow;
    h += tabpanel('datos', true, datos);
    h += tabpanel('contrato', false, contrato);
    h += tabpanel('seguro', false, seguroTab);
    h += tabpanel('mant', false, mant);
    h += tabpanel('gastos', false, gastos);
    h += tabpanel('hist', false, hist);
    h += accionesRow;
  } else {
    h += datos + seguroTab + contrato + saveCancelRow;
  }
  openModal(h); onTipo($('#c_tipo'), true); renderFiles('cars', ex ? ex.id : null);
}

export function onTipo(el, init) {
  const t = el.value, con = t === 'alquiler' || t === 'financiado';
  $('#contrato').style.display = con ? '' : 'none';
  $('#finbox').style.display = t === 'financiado' ? '' : 'none';
  $('#lblmonto').textContent = t === 'financiado' ? 'Cuota semanal (en dólares)' : 'Alquiler semanal';
  const lblTotal = $('#lbltotal'); if (lblTotal) lblTotal.textContent = 'Total a pagar en cuotas (en dólares)';
  if (!init && con && el.value !== el.dataset.orig) $('#c_inicio').value = iso(today());
  const m = $('#c_monto');
  if (!init && t === 'alquiler' && !m.value && m.dataset.vs) m.value = m.dataset.vs;
}
export function autoCuota() {
  const m = $('#c_monto'); if (m.dataset.touched) return;
  const t = +val('c_total'), n = +val('c_cuotas');
  if (t && n) m.value = Math.round(t / n);
}
let saveCarAvisoArmed = null;
export async function saveCar(btn, id) {
  const patente = val('c_patente').toUpperCase();
  if (!patente) { toast('Falta la patente'); return; }
  if (S.cars.some(x => x.id !== id && String(x.patente || '').toUpperCase() === patente)) { toast('Ya existe un auto con esa patente'); return; }
  const numFlota = val('c_numflota');
  if (numFlota && S.cars.some(x => x.id !== id && String(x.numeroFlota || '').trim() === numFlota)) { toast('Ya existe un auto con ese número de flota'); return; }
  const poliza = val('c_poliza');
  if (poliza && S.cars.some(x => x.id !== id && String(x.polizaNumero || '').trim() === poliza)) { toast('Ya existe un auto con ese número de póliza'); return; }
  const vin = val('c_vin').trim();
  if (vin && S.cars.some(x => x.id !== id && String(x.vin || '').trim().toUpperCase() === vin.toUpperCase())) { toast('Ya existe un auto con ese VIN/chasis'); return; }
  const tipo = val('c_tipo'), con = tipo === 'alquiler' || tipo === 'financiado';
  const ex = S.cars.find(x => x.id === id);
  const hoy = iso(today());
  const avisos = [];
  if (con && val('c_inicio') && val('c_inicio') > hoy) avisos.push('el inicio del contrato es una fecha futura');
  VENC.forEach(v => {
    const nv = val('v_' + v[0]);
    const prev = ex ? (ex[v[0]] || '') : '';
    if (nv && nv !== prev && nv < hoy) avisos.push(v[1] + ' ya está vencido');
  });
  const nuevoSeguro = +val('c_seguroMensual') || 0, nuevaPatente = +val('c_patenteMensual') || 0;
  if (isAdmin()) {
    const otrosSeguro = S.cars.filter(x => x.id !== id && +x.seguroMensual > 0).map(x => +x.seguroMensual);
    const otrasPatente = S.cars.filter(x => x.id !== id && +x.patenteMensual > 0).map(x => +x.patenteMensual);
    const promSeguro = otrosSeguro.length ? otrosSeguro.reduce((a, x) => a + x, 0) / otrosSeguro.length : null;
    const promPatente = otrasPatente.length ? otrasPatente.reduce((a, x) => a + x, 0) / otrasPatente.length : null;
    if (nuevoSeguro && promSeguro && nuevoSeguro > promSeguro * 5) avisos.push('el seguro mensual parece muy alto comparado con el resto de la flota (¿ceros de más?)');
    if (nuevaPatente && promPatente && nuevaPatente > promPatente * 5) avisos.push('la patente mensual parece muy alta comparada con el resto de la flota (¿ceros de más?)');
  }
  if (avisos.length && saveCarAvisoArmed !== btn) {
    saveCarAvisoArmed = btn;
    toast('Atención: ' + avisos.join('; ') + '. Tocá "Guardar" de nuevo para confirmar.');
    return;
  }
  saveCarAvisoArmed = null;
  const choferId = con ? val('c_chofer') : '';
  const kmNuevo = +val('c_km') || 0;
  const kmViejo = ex ? (+ex.km || 0) : null;
  const kmHistorial = (ex && ex.kmHistorial) || [];
  let gastoFijoHistorial = (ex && ex.gastoFijoHistorial) || [];
  if (ex && +ex.seguroMensual !== nuevoSeguro) gastoFijoHistorial = gastoFijoHistorial.concat([{ fecha: hoy, campo: 'seguro', anterior: +ex.seguroMensual || 0, nuevo: nuevoSeguro }]);
  if (ex && +ex.patenteMensual !== nuevaPatente) gastoFijoHistorial = gastoFijoHistorial.concat([{ fecha: hoy, campo: 'patente', anterior: +ex.patenteMensual || 0, nuevo: nuevaPatente }]);
  // Se parte del registro guardado para no perder lo que no está en el formulario
  // (historial de contratos, socios, reemplazos, etc.).
  const o = Object.assign({}, ex || {}, {
    id: id || uid(), patente, marca: val('c_marca'), modelo: val('c_modelo'), anio: val('c_anio'), tipo,
    choferId, monto: con ? (+val('c_monto') || 0) : 0, inicio: con ? val('c_inicio') : '',
    total: tipo === 'financiado' ? (+val('c_total') || 0) : 0, cuotas: tipo === 'financiado' ? (+val('c_cuotas') || 0) : 0,
    anticipo: tipo === 'financiado' ? (+val('c_anticipo') || 0) : 0, notas: val('c_notas'),
    tituloTransferido: document.getElementById('c_tituloTransferido') ? document.getElementById('c_tituloTransferido').checked : ((ex && ex.tituloTransferido) || false),
    tituloTransferidoFecha: document.getElementById('c_tituloTransferidoFecha') ? val('c_tituloTransferidoFecha') : ((ex && ex.tituloTransferidoFecha) || ''),
    numeroFlota: val('c_numflota'), combustible: val('c_combustible'), km: val('c_km'), costoCompra: +val('c_costocompra') || 0,
    valorMercado: +val('c_valormercado') || 0,
    polizaNumero: val('c_poliza'), aseguradora: val('c_aseguradora') === 'Otro' ? val('c_aseguradoraOtro') : val('c_aseguradora'),
    seguroPaga: document.getElementById('c_seguroPaga') ? val('c_seguroPaga') : seguroPaga(ex), seguroMensual: nuevoSeguro, patenteMensual: nuevaPatente, mantenimientoMensualEstimado: +val('c_mantenimientoMensualEstimado') || 0, gastoFijoHistorial,
    dondeDuerme: val('c_dondeDuerme'), dondeDuermeMaps: val('c_dondeDuermeMaps'),
    gpsTipo: val('c_gpsTipo'), gpsAlerta: document.getElementById('c_gpsAlerta').checked,
    form08: document.getElementById('c_form08').checked,
    color: val('c_color'), transmision: val('c_transmision'), vin: val('c_vin'), numeroMotor: val('c_numeroMotor'),
    tags: val('c_tags').split(',').map(s => s.trim()).filter(Boolean),
    gncInstaladoEmpresa: document.getElementById('c_gncInstaladoEmpresa').checked,
    gncInstalador: val('c_gncInstalador'), gncFechaInstalacion: val('c_gncFechaInstalacion'),
    coberturaSeguro: val('c_coberturaSeguro'), franquiciaSeguro: +val('c_franquiciaSeguro') || 0,
    fechaCompra: val('c_fechaCompra'), dondeCompro: val('c_dondeCompro'),
    gastosPatentamiento: +val('c_gastosPatentamiento') || 0, titularRegistral: val('c_titularRegistral'),
    llaveDuplicada: document.getElementById('c_llaveDuplicada').checked, copiasLlave: +val('c_copiasLlave') || 0, llavesUbicacion: val('c_llavesUbicacion'),
    ultimaInspeccionGeneral: val('c_ultimaInspeccionGeneral'), ultimoLavado: val('c_ultimoLavado'),
    cumplimientoNormativo: Object.fromEntries(CUMPLIMIENTO_NORMATIVO_ITEMS.map(x => [x[0], document.getElementById('cn_' + x[0]).checked])),
    elementosSeguridad: Object.fromEntries(ELEMENTOS_SEGURIDAD.map(x => [x[0], document.getElementById('es_' + x[0]).checked])),
    bateria12vFecha: val('c_bateria12vFecha'),
    neumaticosMarca: val('c_neumaticosMarca'), rodadoPulgadas: val('c_rodadoPulgadas'),
    soloAlquiler: document.getElementById('c_soloAlquiler').checked,
    enPreparacion: document.getElementById('c_enPreparacion').checked,
    reservado: document.getElementById('c_reservado').checked, reservadoPara: val('c_reservadoPara'),
    aReemplazar: document.getElementById('c_aReemplazar').checked, motivoReemplazo: val('c_motivoReemplazo'), fechaRenovacionPlan: val('c_fechaRenovacionPlan'),
    neumaticos: {
      di: { fecha: val('nm_di_fecha'), profundidad: +val('nm_di_prof') || 0 },
      dd: { fecha: val('nm_dd_fecha'), profundidad: +val('nm_dd_prof') || 0 },
      ti: { fecha: val('nm_ti_fecha'), profundidad: +val('nm_ti_prof') || 0 },
      td: { fecha: val('nm_td_fecha'), profundidad: +val('nm_td_prof') || 0 },
    },
    accesorios: (ex || {}).accesorios || [],
    disponibleDesde: tipo === 'disponible' ? ((ex && ex.tipo === 'disponible' && ex.disponibleDesde) || iso(today())) : '',
    vendido: (ex || {}).vendido || false,
    favorito: (ex || {}).favorito || false,
    files: (ex || {}).files || [],
    ajustesDeuda: (ex || {}).ajustesDeuda || [],
    historialChoferes: actualizarHistorialChoferes(ex, choferId),
    historialTaller: actualizarHistorialTaller(ex, tipo),
    mantenimientoPlan: (ex && ex.mantenimientoPlan) || planMantenimientoDefault(kmNuevo, iso(today())),
    kmHistorial: (kmNuevo && kmNuevo !== kmViejo) ? kmHistorial.concat([{ fecha: iso(today()), km: kmNuevo }]) : kmHistorial,
    montoHistorial: actualizarHistorialMonto(ex, con ? (+val('c_monto') || 0) : 0),
    valorSemanal: tipo === 'alquiler' ? (+val('c_monto') || 0) : ((ex && ex.valorSemanal) || (ex && ex.tipo === 'alquiler' ? +ex.monto || 0 : 0)),
  });
  VENC.forEach(v => { o[v[0]] = val('v_' + v[0]); });
  o.vencHistorial = actualizarHistorialVenc(ex, o);
  if (con) {
    if (!o.choferId) { toast('Elegí el chofer (cargalo primero en Choferes)'); return; }
    if (!o.monto || !o.inicio) { toast('Completá el monto semanal y la fecha de inicio'); return; }
    if (tipo === 'financiado' && !o.cuotas) { toast('Completá la cantidad de cuotas'); return; }
  }
  if (!(await save('cars', o))) return;
  if (o.seguroPaga === 'recupera' && seguroPaga(ex) !== 'recupera') await pasarSeguroDelMesAlChofer(o);
  if (o.gpsAlerta && !(ex && ex.gpsAlerta)) await marcarEnTaller(o.id);
  closeModal(); toast('Auto guardado');
}
export async function toggleFavoritoAuto(id) {
  const c = S.cars.find(x => x.id === id); if (!c) return;
  await save('cars', Object.assign({}, c, { favorito: !c.favorito }));
}
export async function toggleVendido(id) {
  const c = S.cars.find(x => x.id === id); if (!c) return;
  if (await save('cars', Object.assign({}, c, { vendido: !c.vendido }))) { closeModal(); toast(c.vendido ? 'Auto restaurado' : 'Auto marcado como vendido'); }
}
export function venderAutoForm(id) {
  const c = S.cars.find(x => x.id === id); if (!c) return;
  const h = '<h3>Marcar como vendido — ' + esc(c.patente) + '</h3>' +
  '<label class="f"><span>Precio de venta</span><input id="cv_precio" inputmode="decimal"></label>' +
  '<div class="two"><label class="f"><span>Fecha de venta</span><input id="cv_fecha" type="date" value="' + iso(today()) + '"></label>' +
  '<label class="f"><span>Km al vender</span><input id="cv_km" inputmode="numeric" value="' + esc(c.km || '') + '"></label></div>' +
  '<div class="row"><button class="btn grow" onclick="confirmarVenta(\'' + c.id + '\')">Confirmar venta</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function confirmarVenta(id) {
  const c = S.cars.find(x => x.id === id); if (!c) return;
  const precioVenta = +val('cv_precio') || 0;
  const fechaVenta = val('cv_fecha') || iso(today());
  const kmVenta = +val('cv_km') || 0;
  const kmHistorial = kmVenta && kmVenta !== (+c.km || 0) ? (c.kmHistorial || []).concat([{ fecha: fechaVenta, km: kmVenta }]) : c.kmHistorial;
  if (await save('cars', Object.assign({}, c, { vendido: true, precioVenta, fechaVenta, km: kmVenta || c.km, kmHistorial }))) {
    await save('recordatorios', { id: uid(), texto: 'Dar de baja el seguro y la patente de ' + (c.patente || 'auto vendido'), fecha: iso(today()), hecho: false });
    closeModal(); toast('Auto marcado como vendido');
  }
}
export function cronogramaCuotasForm(id) {
  const c = S.cars.find(x => x.id === id); if (!c) return;
  const cron = cronogramaCuotas(c);
  const cls = { pagada: 'ok', parcial: 'warn', atrasada: 'bad', pendiente: 'mute' };
  const etiqueta = { pagada: 'Paga', parcial: 'Parcial', atrasada: 'Atrasada', pendiente: 'Pendiente' };
  const h = '<h3>Cronograma de cuotas — ' + esc(c.patente) + '</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Estimado en base a lo cobrado hasta ahora. No refleja pagos parciales dentro de una misma cuota.</div>' +
  cron.map(x => '<div class="row between small" style="padding:4px 0"><span>Cuota ' + x.numero + ' · ' + fdate(x.fecha) + '</span>' + badge(cls[x.estado], etiqueta[x.estado]) + '</div>').join('') +
  '<div class="row" style="margin-top:14px"><button class="btn sec grow" onclick="carForm(\'' + c.id + '\')">Volver</button></div>';
  openModal(h);
}
export async function delCar(id) {
  await purgeFiles(S.cars.find(x => x.id === id));
  for (const p of S.payments.filter(p => p.carId === id)) await remove('payments', p.id);
  if (await remove('cars', id)) { closeModal(); toast('Auto eliminado'); }
}
export function accesorioForm(carId, idx) {
  const c = S.cars.find(x => x.id === carId); if (!c) return;
  const a = idx != null ? (c.accesorios || [])[idx] : null;
  const h = '<h3>' + (a ? 'Editar accesorio' : 'Nuevo accesorio') + ' — ' + esc(c.patente) + '</h3>' +
  '<label class="f"><span>Nombre</span><input id="ac_nombre" placeholder="GPS, cámara, alarma..." value="' + esc(a ? a.nombre : '') + '"></label>' +
  '<div class="two"><label class="f"><span>Fecha de instalación</span><input id="ac_fecha" type="date" value="' + esc(a ? a.fecha : iso(today())) + '"></label>' +
  '<label class="f"><span>Garantía <small>meses</small></span><input id="ac_garantia" inputmode="numeric" value="' + esc(a ? a.garantiaMeses || '' : '') + '"></label></div>' +
  '<label class="f"><span>Notas</span><textarea id="ac_notas">' + esc(a ? a.notas : '') + '</textarea></label>' +
  '<div class="row"><button class="btn grow" onclick="saveAccesorio(\'' + c.id + '\',' + (idx != null ? idx : 'null') + ')">Guardar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>' +
  (a ? '<div style="margin-top:8px"><button class="btn danger block" onclick="delAccesorio(\'' + c.id + '\',' + idx + ')">Eliminar accesorio</button></div>' : '');
  openModal(h);
}
export async function saveAccesorio(carId, idx) {
  const c = S.cars.find(x => x.id === carId); if (!c) return;
  const nombre = val('ac_nombre');
  if (!nombre) { toast('Poné un nombre'); return; }
  const o = { nombre, fecha: val('ac_fecha') || iso(today()), garantiaMeses: +val('ac_garantia') || 0, notas: val('ac_notas') };
  const accesorios = (c.accesorios || []).slice();
  if (idx != null) accesorios[idx] = o; else accesorios.push(o);
  if (await save('cars', Object.assign({}, c, { accesorios }))) { toast('Accesorio guardado'); carForm(carId); }
}
export async function delAccesorio(carId, idx) {
  const c = S.cars.find(x => x.id === carId); if (!c) return;
  const accesorios = (c.accesorios || []).slice(); accesorios.splice(idx, 1);
  if (await save('cars', Object.assign({}, c, { accesorios }))) { toast('Accesorio eliminado'); carForm(carId); }
}
export function qrAutoForm(id) {
  const c = S.cars.find(x => x.id === id); if (!c) return;
  const tel = (settings.companyPhone || '').replace(/\D/g, '');
  if (!tel) { toast('Cargá el teléfono de la empresa en Ajustes primero'); return; }
  const msg = 'Reporto un problema con el auto ' + (c.patente || '');
  const waUrl = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg);
  const qrImg = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' + encodeURIComponent(waUrl);
  const h = '<h3>QR para reportar un problema — ' + esc(c.patente) + '</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Imprimí este QR y pegalo en el auto. Al escanearlo, se abre WhatsApp con un mensaje pre-armado a tu número.</div>' +
  '<div style="text-align:center"><img src="' + qrImg + '" alt="QR" style="width:220px;height:220px"></div>' +
  '<div class="row" style="margin-top:14px"><button class="btn sec grow" onclick="carForm(\'' + c.id + '\')">Volver</button></div>';
  openModal(h);
}
/* Actualización silenciosa de km desde otros formularios (cobro, inspección, mantenimiento).
   Nunca retrocede el km ni interrumpe el flujo del formulario que la llama. */
export async function actualizarKm(carId, km) {
  const k = +km || 0;
  const c = S.cars.find(x => x.id === carId);
  if (!c || !k || k <= (+c.km || 0)) return;
  const kmHistorial = (c.kmHistorial || []).concat([{ fecha: iso(today()), km: k }]);
  await save('cars', Object.assign({}, c, { km: k, kmHistorial }));
}
export async function marcarEnTaller(id) {
  const c = S.cars.find(x => x.id === id);
  if (!c || c.tipo === 'taller') return;
  const historialTaller = actualizarHistorialTaller(c, 'taller');
  await save('cars', Object.assign({}, c, { tipo: 'taller', tipoPrevioTaller: c.tipo, historialTaller }));
}
export async function sacarDeTaller(id) {
  const c = S.cars.find(x => x.id === id);
  if (!c || c.tipo !== 'taller') return;
  const nuevoTipo = c.tipoPrevioTaller || 'disponible';
  const historialTaller = actualizarHistorialTaller(c, nuevoTipo);
  if (c.reemplazoTemporalActivo) {
    const temp = S.cars.find(x => x.id === c.reemplazoTemporalCarId);
    if (temp) await save('cars', Object.assign({}, temp, { tipo: 'disponible', choferId: '', esReemplazoTemporalDe: '' }));
  }
  if (await save('cars', Object.assign({}, c, { tipo: nuevoTipo, tipoPrevioTaller: '', historialTaller, reemplazoTemporalActivo: false, reemplazoTemporalCarId: '', reemplazoTemporalChoferId: '', reemplazoTemporalDesde: '' }))) { closeModal(); toast('Auto sacado de taller'); }
}
export function simularAumentoForm(id) {
  const c = S.cars.find(x => x.id === id); if (!c) return;
  const h = '<h3>Simular aumento — ' + esc(c.patente) + '</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Monto actual: ' + money(c.monto || 0) + ' por semana.</div>' +
  '<div class="two"><label class="f"><span>Monto nuevo</span><input id="sa_nuevo" inputmode="decimal" value="' + (c.monto || 0) + '" oninput="calcularSimulacionAumento(\'' + c.id + '\')"></label>' +
  '<label class="f"><span>Semanas a proyectar</span><input id="sa_semanas" inputmode="numeric" value="12" oninput="calcularSimulacionAumento(\'' + c.id + '\')"></label></div>' +
  '<div id="sa_resultado" class="card"></div>' +
  '<div class="row" style="margin-top:14px"><button class="btn sec grow" onclick="carForm(\'' + c.id + '\')">Volver</button></div>';
  openModal(h);
  calcularSimulacionAumento(id);
}
export function calcularSimulacionAumento(id) {
  const c = S.cars.find(x => x.id === id); if (!c) return;
  const el = document.getElementById('sa_resultado'); if (!el) return;
  const actual = +c.monto || 0;
  const nuevo = +val('sa_nuevo') || 0;
  const semanas = +val('sa_semanas') || 0;
  const fmt = n => Math.round(n).toLocaleString('es-AR');
  const dif = nuevo - actual;
  const extra = dif * semanas;
  el.innerHTML = '<div class="row between small"><span class="muted">Diferencia semanal</span><b style="color:' + (dif >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + (dif >= 0 ? '+' : '') + fmt(dif) + '</b></div>' +
  '<div class="row between"><span class="muted">Extra proyectado en ' + semanas + ' semanas</span><b>' + fmt(extra) + '</b></div>' +
  (actual ? '<div class="small muted" style="margin-top:6px">Eso es un ' + (dif >= 0 ? '+' : '') + Math.round(dif / actual * 100) + '% respecto del monto actual.</div>' : '');
}
export async function sugerirAjusteInflacion(id) {
  const c = S.cars.find(x => x.id === id);
  if (!c || !c.inicio || !c.monto) return;
  toast('Consultando índice de inflación…');
  try {
    const { factor, meses } = await inflacionAcumulada(c.inicio);
    if (!meses) { toast('Todavía no hay datos de inflación publicados desde el inicio del contrato'); return; }
    const sugerido = Math.round(c.monto * factor);
    const input = $('#c_monto');
    if (input) { input.value = sugerido; input.dataset.touched = 1; }
    toast('Inflación acumulada desde el inicio (' + meses + ' meses): ' + Math.round((factor - 1) * 100) + '%. Monto sugerido: ' + money(sugerido) + '. Revisá y guardá.');
  } catch (e) {
    toast('No se pudo calcular el ajuste: ' + e.message);
  }
}
