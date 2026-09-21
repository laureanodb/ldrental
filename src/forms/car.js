import { S } from '../state.js';
import { $, val, uid, iso, today, esc, fdate, money } from '../utils.js';
import { TIPOS, VENC, COMBUSTIBLES, GASTO_CATS } from '../constants.js';
import { isContract, calc, finFinanciado, driverName, diasEnTaller } from '../calc.js';
import { openModal, closeModal, toast, confirmDel } from '../modal.js';
import { save, remove } from '../data.js';
import { renderFiles, purgeFiles } from '../files.js';
import { isAdmin } from '../roles.js';
import { inflacionAcumulada } from '../inflacion.js';

const gastoCatLabel = k => (GASTO_CATS.find(x => x[0] === k) || [0, 'Gasto'])[1];

function actualizarHistorialChoferes(ex, newChoferId) {
  const prevChoferId = ex ? ex.choferId : '';
  let historial = (ex && ex.historialChoferes) || [];
  if (prevChoferId === newChoferId) return historial;
  const hoy = iso(today());
  historial = historial.map(h => (!h.hasta && h.choferId === prevChoferId) ? Object.assign({}, h, { hasta: hoy }) : h);
  if (newChoferId) historial = historial.concat([{ choferId: newChoferId, desde: hoy, hasta: null }]);
  return historial;
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

export function carForm(id) {
  const ex = S.cars.find(x => x.id === id);
  const c = ex || { tipo: 'disponible', inicio: iso(today()) };
  let h = '<h3>' + (ex ? 'Auto ' + esc(c.patente) : 'Nuevo auto') + '</h3>';
  if (ex && c.vendido) h += '<div class="card" style="margin-bottom:10px"><span class="badge b-mute">Vendido</span></div>';
  if (ex && isContract(c)) {
    const i = calc(c);
    const fin = finFinanciado(c);
    h += '<div class="card"><div class="row between"><span class="muted">Pagado desde el inicio</span><b>' + money(i.paid) + '</b></div>' +
    '<div class="row between"><span class="muted">Debería haber pagado</span><b>' + money(i.due) + '</b></div>' +
    '<div class="row between"><span class="muted">Deuda</span><b style="color:' + (i.debt > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + money(i.debt) + '</b></div>' +
    (i.ajustes > 0 ? '<div class="row between small muted"><span>Ajustes / condonaciones</span><span>-' + money(i.ajustes) + '</span></div>' : '') +
    (i.saldo != null ? '<div class="row between"><span class="muted">Saldo total de la financiación</span><b>' + money(i.saldo) + '</b></div>' : '') +
    (fin ? '<div class="row between"><span class="muted">Fin estimado de cuotas</span><b>' + fdate(iso(fin)) + '</b></div>' : '') +
    '<div class="row" style="margin-top:10px"><button class="btn grow" onclick="payForm(\'' + c.id + '\')">Registrar cobro</button><button class="btn sec" onclick="ajusteForm(\'' + c.id + '\')">Ajustar deuda</button></div></div>';
    const AJ = (c.ajustesDeuda || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (AJ.length) h += '<div class="sec-t">Ajustes de deuda</div>' + AJ.map(x => '<div class="card row"><div class="grow"><div>-' + money(x.monto) + ' <span class="small muted">' + fdate(x.fecha) + '</span></div>' + (x.motivo ? '<div class="small muted">' + esc(x.motivo) + '</div>' : '') + '</div>' + (isAdmin() ? '<button class="btn danger sm" onclick="confirmDel(this,()=>delAjuste(\'' + c.id + '\',\'' + x.id + '\'))">Borrar</button>' : '') + '</div>').join('');
  }
  h += '<div class="two"><label class="f"><span>Patente</span><input id="c_patente" value="' + esc(c.patente) + '" autocapitalize="characters"></label>' +
  '<label class="f"><span>Año</span><input id="c_anio" inputmode="numeric" value="' + esc(c.anio) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Marca</span><input id="c_marca" value="' + esc(c.marca) + '"></label>' +
  '<label class="f"><span>Modelo</span><input id="c_modelo" value="' + esc(c.modelo) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Número de flota</span><input id="c_numflota" value="' + esc(c.numeroFlota) + '"></label>' +
  '<label class="f"><span>Combustible</span><select id="c_combustible"><option value="">Sin especificar</option>' + COMBUSTIBLES.map(x => '<option value="' + x[0] + '"' + (c.combustible === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label></div>' +
  '<div class="two"><label class="f"><span>Kilometraje actual</span><input id="c_km" inputmode="numeric" value="' + esc(c.km) + '"></label>' +
  '<label class="f"><span>Costo de compra</span><input id="c_costocompra" inputmode="decimal" value="' + esc(c.costoCompra || '') + '"></label></div>' +
  '<label class="f"><span>Próximo service <small>a qué kilometraje</small></span><input id="c_proxservice" inputmode="numeric" value="' + esc(c.proximoServiceKm) + '"></label>' +
  '<label class="f"><span>Estado</span><select id="c_tipo" data-orig="' + esc(ex ? c.tipo : '') + '" onchange="onTipo(this)">' + Object.keys(TIPOS).map(k => '<option value="' + k + '"' + (c.tipo === k ? ' selected' : '') + '>' + TIPOS[k] + '</option>').join('') + '</select></label>' +
  '<div id="contrato"><label class="f"><span>Chofer</span><select id="c_chofer"><option value="">Elegir chofer</option>' + S.drivers.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))).map(d => '<option value="' + d.id + '"' + (c.choferId === d.id ? ' selected' : '') + '>' + esc(d.nombre) + '</option>').join('') + '</select></label>' +
  '<div id="finbox" class="two"><label class="f"><span>Total a pagar en cuotas</span><input id="c_total" inputmode="decimal" value="' + esc(c.total || '') + '" oninput="autoCuota()"></label>' +
  '<label class="f"><span>Cantidad de cuotas</span><input id="c_cuotas" inputmode="numeric" value="' + esc(c.cuotas || '') + '" oninput="autoCuota()"></label></div>' +
  '<div class="two"><label class="f"><span id="lblmonto">Monto semanal</span><input id="c_monto" inputmode="decimal" value="' + esc(c.monto || '') + '" oninput="this.dataset.touched=1"></label>' +
  '<label class="f"><span>Inicio del contrato</span><input id="c_inicio" type="date" value="' + esc(c.inicio) + '"></label></div>' +
  (ex && isContract(c) && c.tipo !== 'financiado' && c.inicio && c.monto ? '<button type="button" class="btn sec sm" style="margin:-4px 0 12px" onclick="sugerirAjusteInflacion(\'' + c.id + '\')">Sugerir ajuste por inflación</button>' : '') +
  '<div class="small muted" style="margin:-4px 0 12px">Si cambia el chofer o pasa de alquiler a financiación, poné la fecha nueva de inicio. La deuda se cuenta desde ahí.</div></div>' +
  '<div class="sec-t">Vencimientos</div><div class="two">' + VENC.map(v => '<label class="f"><span>' + v[1] + '</span><input id="v_' + v[0] + '" type="date" value="' + esc(c[v[0]]) + '"></label>').join('') + '</div>' +
  '<div class="two"><label class="f"><span>N° de póliza</span><input id="c_poliza" value="' + esc(c.polizaNumero) + '"></label>' +
  '<label class="f"><span>Aseguradora</span><input id="c_aseguradora" value="' + esc(c.aseguradora) + '"></label></div>' +
  '<div class="sec-t">Archivos</div><div id="files"></div><div id="fstatus" class="small" style="margin:-4px 0 12px;overflow-wrap:anywhere"></div>' +
  '<label class="f"><span>Notas</span><textarea id="c_notas">' + esc(c.notas) + '</textarea></label>' +
  '<div class="row"><button class="btn grow" onclick="saveCar(' + (ex ? "'" + c.id + "'" : 'null') + ')">Guardar</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>';
  if (ex) {
    const P = S.payments.filter(p => p.carId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5);
    if (P.length) h += '<div class="sec-t">Últimos cobros</div>' + P.map(p => '<div class="row between small"><span class="muted">' + fdate(p.fecha) + '</span><span>' + money(p.monto) + '</span></div>').join('');
    const G = S.gastos.filter(g => g.carId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const totalGastos = G.reduce((a, g) => a + (+g.costo || 0), 0);
    const diasTaller = diasEnTaller(c);
    h += '<div class="sec-t row between">Gastos y mantenimiento<span class="small muted">' + money(totalGastos) + ' en total' + (diasTaller ? ' · ' + diasTaller + ' días parado' : '') + '</span></div>';
    if (G.length) h += G.map(g => '<div class="card row"><div class="grow"><div>' + money(g.costo) + ' <span class="small muted">' + esc(gastoCatLabel(g.categoria)) + '</span></div><div class="small muted">' + fdate(g.fecha) + (g.proveedor ? ' · ' + esc(g.proveedor) : '') + (g.descripcion ? ' · ' + esc(g.descripcion) : '') + '</div></div>' + (isAdmin() ? '<button class="btn danger sm" onclick="confirmDel(this,()=>delGasto(\'' + g.id + '\'))">Borrar</button>' : '') + '</div>').join('');
    h += '<button class="btn sec block" style="margin:8px 0 20px" onclick="gastoForm(\'' + c.id + '\')">+ Agregar gasto</button>';
    const I = S.inspecciones.filter(x => x.carId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    h += '<div class="sec-t">Inspecciones de entrega/recepción</div>';
    if (I.length) h += I.map(x => '<div class="card row"><div class="grow"><div>' + (x.tipo === 'entrega' ? 'Entrega' : 'Recepción') + ' <span class="small muted">' + fdate(x.fecha) + (x.km ? ' · ' + x.km + ' km' : '') + '</span></div>' + (x.notas ? '<div class="small muted">' + esc(x.notas) + '</div>' : '') + '</div>' + (isAdmin() ? '<button class="btn danger sm" onclick="confirmDel(this,()=>delInspeccion(\'' + x.id + '\'))">Borrar</button>' : '') + '</div>').join('');
    else h += '<div class="small muted" style="margin-bottom:8px">Sin inspecciones registradas.</div>';
    const H = (c.historialChoferes || []).slice().sort((a, b) => b.desde.localeCompare(a.desde));
    if (H.length) {
      h += '<div class="sec-t">Historial de choferes</div>' + H.map(x => '<div class="row between small" style="padding:4px 0"><span>' + esc(driverName(x.choferId) || 'Chofer eliminado') + '</span><span class="muted">' + fdate(x.desde) + ' – ' + (x.hasta ? fdate(x.hasta) : 'actual') + '</span></div>').join('');
    }
    h += '<button class="btn sec block" style="margin:8px 0 20px" onclick="inspeccionForm(\'' + c.id + '\')">+ Registrar inspección</button>';
    h += '<div class="row"><button class="btn sec grow" onclick="toggleVendido(\'' + c.id + '\')">' + (c.vendido ? 'Restaurar de vendidos' : 'Marcar como vendido') + '</button></div>' +
    (isAdmin() ? '<div style="margin-top:8px"><button class="btn danger block" onclick="confirmDel(this,()=>delCar(\'' + c.id + '\'))">Eliminar auto</button></div>' : '');
  }
  openModal(h); onTipo($('#c_tipo'), true); renderFiles('cars', ex ? ex.id : null);
}

export function onTipo(el, init) {
  const t = el.value, con = t === 'alquiler' || t === 'financiado';
  $('#contrato').style.display = con ? '' : 'none';
  $('#finbox').style.display = t === 'financiado' ? '' : 'none';
  $('#lblmonto').textContent = t === 'financiado' ? 'Cuota semanal' : 'Alquiler semanal';
  if (!init && con && el.value !== el.dataset.orig) $('#c_inicio').value = iso(today());
}
export function autoCuota() {
  const m = $('#c_monto'); if (m.dataset.touched) return;
  const t = +val('c_total'), n = +val('c_cuotas');
  if (t && n) m.value = Math.round(t / n);
}
export async function saveCar(id) {
  const patente = val('c_patente').toUpperCase();
  if (!patente) { toast('Falta la patente'); return; }
  const tipo = val('c_tipo'), con = tipo === 'alquiler' || tipo === 'financiado';
  const ex = S.cars.find(x => x.id === id);
  const choferId = con ? val('c_chofer') : '';
  const o = {
    id: id || uid(), patente, marca: val('c_marca'), modelo: val('c_modelo'), anio: val('c_anio'), tipo,
    choferId, monto: con ? (+val('c_monto') || 0) : 0, inicio: con ? val('c_inicio') : '',
    total: tipo === 'financiado' ? (+val('c_total') || 0) : 0, cuotas: tipo === 'financiado' ? (+val('c_cuotas') || 0) : 0, notas: val('c_notas'),
    numeroFlota: val('c_numflota'), combustible: val('c_combustible'), km: val('c_km'), costoCompra: +val('c_costocompra') || 0,
    proximoServiceKm: val('c_proxservice'),
    polizaNumero: val('c_poliza'), aseguradora: val('c_aseguradora'),
    vendido: (ex || {}).vendido || false,
    files: (ex || {}).files || [],
    ajustesDeuda: (ex || {}).ajustesDeuda || [],
    historialChoferes: actualizarHistorialChoferes(ex, choferId),
    historialTaller: actualizarHistorialTaller(ex, tipo)
  };
  VENC.forEach(v => { o[v[0]] = val('v_' + v[0]); });
  if (con) {
    if (!o.choferId) { toast('Elegí el chofer (cargalo primero en Choferes)'); return; }
    if (!o.monto || !o.inicio) { toast('Completá el monto semanal y la fecha de inicio'); return; }
    if (tipo === 'financiado' && !o.cuotas) { toast('Completá la cantidad de cuotas'); return; }
  }
  if (await save('cars', o)) { closeModal(); toast('Auto guardado'); }
}
export async function toggleVendido(id) {
  const c = S.cars.find(x => x.id === id); if (!c) return;
  if (await save('cars', Object.assign({}, c, { vendido: !c.vendido }))) { closeModal(); toast(c.vendido ? 'Auto restaurado' : 'Auto marcado como vendido'); }
}
export async function delCar(id) {
  await purgeFiles(S.cars.find(x => x.id === id));
  for (const p of S.payments.filter(p => p.carId === id)) await remove('payments', p.id);
  if (await remove('cars', id)) { closeModal(); toast('Auto eliminado'); }
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
