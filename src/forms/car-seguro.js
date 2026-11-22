// Seguro del auto: quién lo paga, póliza y credencial, renovación con cotizaciones,
// lectura de la póliza con IA y corrección de gastos de seguro.
import { S } from '../state.js';
import { $, val, uid, iso, today, esc, fdate, money, parse, days } from '../utils.js';
import { ASEGURADORAS, COBERTURAS_SEGURO } from '../constants.js';
import { seguroPendiente, seguroPendienteDesde, driverName, badge } from '../calc.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { attach } from '../files.js';
import { leerDocumento, archivoADataUrl } from '../ia.js';
import { de } from '../memo.js';
import { carForm, setTabAuto } from './car.js';

export const SEGURO_PAGA = [['empresa', 'Yo, es costo mío'], ['recupera', 'Yo, y se lo cobro al chofer'], ['chofer', 'El chofer, por su cuenta']];
export function ayudaSeguroPaga(v) {
  if (v === 'recupera') return 'Cada mes la app registra el pago del seguro y se lo suma al chofer como seguro a pagar, en pesos. No cuenta como gasto en la rentabilidad.';
  if (v === 'chofer') return 'No se genera ningún gasto. La app solo controla el vencimiento de la póliza.';
  return 'La app genera el gasto del seguro todos los meses como costo tuyo.';
}
// Al pasar un auto a "se lo cobro al chofer", el seguro ya cargado este mes queda a cargo del chofer actual.
export async function pasarSeguroDelMesAlChofer(c) {
  if (!c.choferId) return;
  const desde = iso(today()).slice(0, 8) + '01';
  for (const g of de('gastos', 'carId', c.id).filter(x => x.carId === c.id && x.categoria === 'seguro' && !x.recuperaDe && (x.fecha || '') >= desde)) {
    await save('gastos', Object.assign({}, g, { recuperaDe: c.choferId }));
  }
}
export function tarjetaSeguroRecupera(c) {
  const mes = iso(today()).slice(0, 7);
  const delMes = de('gastos', 'carId', c.id).filter(g => g.carId === c.id && g.categoria === 'seguro' && g.recuperaDe && (g.fecha || '').slice(0, 7) === mes);
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
export function seguroDocsHtml(c) {
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
  const c = de('cars', 'id', carId)[0];
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
  const pagado = de('gastos', 'carId', c.id).filter(g => g.carId === c.id && g.categoria === 'seguro' && g.fecha >= d).reduce((a, g) => a + (+g.costo || 0), 0);
  const recuperado = de('payments', 'carId', c.id).filter(p => p.carId === c.id && p.tipo === 'seguro' && p.fecha >= d).reduce((a, p) => a + (+p.monto || 0), 0);
  return { pagado, recuperado };
}
export function renovacionSeguroHtml(c) {
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
  const el = document.getElementById('segRenov'); const c = de('cars', 'id', carId)[0];
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
  const c = de('cars', 'id', carId)[0]; if (!c) return;
  const monto = +val('cq_monto');
  if (!monto || monto <= 0) { toast('Poné el monto por mes de la cotización'); return; }
  const q = { id: uid(), aseguradora: val('cq_aseguradora').trim(), montoMensual: monto, cobertura: val('cq_cobertura'), franquicia: +val('cq_franquicia') || 0, nota: val('cq_nota').trim(), fecha: iso(today()) };
  if (!(await save('cars', Object.assign({}, c, { cotizacionesSeguro: (c.cotizacionesSeguro || []).concat([q]) })))) return;
  renderRenovacionSeguro(carId); toast('Cotización agregada');
}
export async function quitarCotizacionSeguro(carId, qid) {
  const c = de('cars', 'id', carId)[0]; if (!c) return;
  if (!(await save('cars', Object.assign({}, c, { cotizacionesSeguro: (c.cotizacionesSeguro || []).filter(q => q.id !== qid) })))) return;
  renderRenovacionSeguro(carId);
}
// Pasa los datos de la cotización a la ficha abierta; el usuario pone el nuevo vencimiento y guarda.
export async function elegirCotizacionSeguro(carId, qid) {
  const c = de('cars', 'id', carId)[0]; const q = c && (c.cotizacionesSeguro || []).find(x => x.id === qid); if (!q) return;
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
  const d = j.datos, c = de('cars', 'id', carId)[0] || {};
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
  const g = de('gastos', 'id', gastoId)[0]; if (!g) return;
  const c = de('cars', 'id', g.carId)[0];
  openModal('<h3>Seguro de ' + esc(c ? c.patente : 'auto') + '</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Poné lo que te cobró la aseguradora este mes. Es lo que se le cobra al chofer.</div>' +
    '<label class="f"><span>Monto del mes</span><input id="cs_monto" inputmode="decimal" value="' + esc(g.costo || '') + '"></label>' +
    '<label class="chk"><input type="checkbox" id="cs_default"><span>Usar este monto también para los próximos meses</span></label>' +
    '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="guardarCorreccionSeguro(\'' + g.id + '\')">Guardar</button><button class="btn sec" onclick="carForm(\'' + g.carId + '\')">Cancelar</button></div>');
}
export async function guardarCorreccionSeguro(gastoId) {
  const g = de('gastos', 'id', gastoId)[0]; if (!g) return;
  const monto = +val('cs_monto') || 0;
  if (!monto) { toast('Poné el monto'); return; }
  if (!(await save('gastos', Object.assign({}, g, { costo: monto })))) return;
  const c = de('cars', 'id', g.carId)[0];
  if (c && document.getElementById('cs_default').checked) await save('cars', Object.assign({}, c, { seguroMensual: monto }));
  toast('Seguro corregido'); carForm(g.carId); setTabAuto('seguro');
}
