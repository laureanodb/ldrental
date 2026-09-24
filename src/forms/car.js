import { S } from '../state.js';
import { $, val, uid, iso, today, esc, fdate, money, moneyUSD, parse } from '../utils.js';
import { TIPOS, VENC, COMBUSTIBLES, GASTO_CATS, MULTA_ESTADOS, MOTIVOS_REEMPLAZO, TIPOS_SINIESTRO, SINIESTRO_ESTADOS, ASEGURADORAS, TRANSMISIONES, COBERTURAS_SEGURO, ELEMENTOS_SEGURIDAD } from '../constants.js';
import { isContract, calc, finFinanciado, driverName, diasEnTaller, planMantenimientoDefault, estadoPlanItem, textoRestante, badge, estadoMultaCls, resultadoVenta, fichaTecnica, cronogramaCuotas, estadoGeneralAuto } from '../calc.js';
import { openModal, closeModal, toast, confirmDel } from '../modal.js';
import { save, remove } from '../data.js';
import { renderFiles, purgeFiles } from '../files.js';
import { canDelete, isAdmin } from '../roles.js';
import { inflacionAcumulada } from '../inflacion.js';
import { settings } from '../settings.js';

const gastoCatLabel = k => (GASTO_CATS.find(x => x[0] === k) || [0, 'Gasto'])[1];

export function actualizarHistorialChoferes(ex, newChoferId) {
  const prevChoferId = ex ? ex.choferId : '';
  let historial = (ex && ex.historialChoferes) || [];
  if (prevChoferId === newChoferId) return historial;
  const hoy = iso(today());
  historial = historial.map(h => (!h.hasta && h.choferId === prevChoferId) ? Object.assign({}, h, { hasta: hoy }) : h);
  if (newChoferId) historial = historial.concat([{ choferId: newChoferId, desde: hoy, hasta: null }]);
  return historial;
}
function actualizarHistorialMonto(ex, monto) {
  const historial = (ex && ex.montoHistorial) || [];
  const prevMonto = ex ? (+ex.monto || 0) : null;
  if (!monto || monto === prevMonto) return historial;
  return historial.concat([{ fecha: iso(today()), monto }]);
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
    h += '<div class="card" style="margin-bottom:10px">' + badge(estGen, estLabel) + '</div>';
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
  '<div class="sec-t">Vencimientos</div><div class="two">' + VENC.map(v => '<label class="f"><span>' + v[1] + '</span><input id="v_' + v[0] + '" type="date" value="' + esc(c[v[0]]) + '"></label>').join('') + '</div>' +
  '<label class="chk"><input type="checkbox" id="c_form08"' + (c.form08 ? ' checked' : '') + '><span>08</span></label>' +
  '<label class="chk"><input type="checkbox" id="c_gncInstaladoEmpresa" onchange="document.getElementById(\'gncInstaladorBox\').style.display=this.checked?\'\':\'none\'"' + (c.gncInstaladoEmpresa ? ' checked' : '') + '><span>El GNC lo instaló la empresa</span></label>' +
  '<div id="gncInstaladorBox" class="two" style="display:' + (c.gncInstaladoEmpresa ? '' : 'none') + '"><label class="f"><span>Instalador</span><input id="c_gncInstalador" value="' + esc(c.gncInstalador) + '"></label>' +
  '<label class="f"><span>Fecha de instalación</span><input id="c_gncFechaInstalacion" type="date" value="' + esc(c.gncFechaInstalacion) + '"></label></div>' +
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
  '<div class="small muted" style="margin:-4px 0 8px">Si cargás un monto mensual, la app genera el gasto automáticamente cada mes (dejalo en 0 para no generarlo).</div>' +
  '<div class="two"><label class="f"><span>Seguro: monto mensual</span><input id="c_seguroMensual" inputmode="decimal" value="' + esc(c.seguroMensual || '') + '"></label>' +
  '<label class="f"><span>Patente: monto mensual</span><input id="c_patenteMensual" inputmode="decimal" value="' + esc(c.patenteMensual || '') + '"></label></div>' +
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
  '<div class="two"><label class="f"><span>Copias de llave</span><input id="c_copiasLlave" inputmode="numeric" value="' + esc(c.copiasLlave || '') + '"></label>' +
  '<label class="f"><span>Dónde están</span><input id="c_llavesUbicacion" value="' + esc(c.llavesUbicacion) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Última inspección mecánica general</span><input id="c_ultimaInspeccionGeneral" type="date" value="' + esc(c.ultimaInspeccionGeneral) + '"></label>' +
  '<label class="f"><span>Último lavado / detailing</span><input id="c_ultimoLavado" type="date" value="' + esc(c.ultimoLavado) + '"></label></div>' +
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
    if (c.choferId) contrato += '<div class="row" style="margin:8px 0"><button class="btn sec grow" onclick="contratoForm(\'' + c.id + '\')">Generar contrato</button></div>';
  }
  contrato += '<div id="contrato"><label class="f"><span>Chofer</span><select id="c_chofer"><option value="">Elegir chofer</option>' + S.drivers.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))).map(d => '<option value="' + d.id + '"' + (c.choferId === d.id ? ' selected' : '') + '>' + esc(d.nombre) + '</option>').join('') + '</select></label>' +
  '<div id="finbox" class="two"><label class="f"><span id="lbltotal">Total a pagar en cuotas</span><input id="c_total" inputmode="decimal" value="' + esc(c.total || '') + '" oninput="autoCuota()"></label>' +
  '<label class="f"><span>Cantidad de cuotas</span><input id="c_cuotas" inputmode="numeric" value="' + esc(c.cuotas || '') + '" oninput="autoCuota()"></label>' +
  '<label class="f"><span>Anticipo pagado <small>opcional</small></span><input id="c_anticipo" inputmode="decimal" value="' + esc(c.anticipo || '') + '"></label></div>' +
  '<div class="two"><label class="f"><span id="lblmonto">Monto semanal</span><input id="c_monto" inputmode="decimal" value="' + esc(c.monto || '') + '" oninput="this.dataset.touched=1"></label>' +
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

    /* ---- Gastos (incluye multas y siniestros) ---- */
    const G = S.gastos.filter(g => g.carId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const totalGastos = G.reduce((a, g) => a + (+g.costo || 0), 0);
    gastos += '<div class="sec-t row between">Gastos<span class="small muted">' + money(totalGastos) + ' en total</span></div>';
    if (G.length) gastos += G.map(g => '<div class="card row"><div class="grow"><div>' + money(g.costo) + ' <span class="small muted">' + esc(gastoCatLabel(g.categoria)) + (g.sinFactura ? ' · sin factura' : '') + '</span></div><div class="small muted">' + fdate(g.fecha) + (g.proveedor ? ' · ' + esc(g.proveedor) : '') + (g.descripcion ? ' · ' + esc(g.descripcion) : '') + '</div></div>' + (canDelete() ? '<button class="btn danger sm" onclick="confirmDel(this,()=>delGasto(\'' + g.id + '\'))">Borrar</button>' : '') + '</div>').join('');
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
    const I = S.inspecciones.filter(x => x.carId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    hist += '<div class="sec-t">Inspecciones de entrega/recepción</div>';
    if (I.length) hist += I.map(x => '<div class="card row"><div class="grow"><div>' + (x.tipo === 'entrega' ? 'Entrega' : 'Recepción') + ' <span class="small muted">' + fdate(x.fecha) + (x.km ? ' · ' + x.km + ' km' : '') + '</span></div>' + (x.notas ? '<div class="small muted">' + esc(x.notas) + '</div>' : '') + '</div>' + (canDelete() ? '<button class="btn danger sm" onclick="confirmDel(this,()=>delInspeccion(\'' + x.id + '\'))">Borrar</button>' : '') + '</div>').join('');
    else hist += '<div class="small muted" style="margin-bottom:8px">Sin inspecciones registradas.</div>';
    hist += '<button class="btn sec block" style="margin:8px 0 6px" onclick="inspeccionForm(\'' + c.id + '\')">+ Registrar inspección</button>';
    hist += '<button class="btn sec block" style="margin-bottom:20px" onclick="traspasoForm(\'' + c.id + '\')">Traspaso (cambiar chofer con checklist)</button>';
    const H = (c.historialChoferes || []).slice().sort((a, b) => b.desde.localeCompare(a.desde));
    if (H.length) {
      hist += '<div class="sec-t">Historial de choferes</div>' + H.map(x => '<div class="row between small" style="padding:4px 0"><span>' + esc(driverName(x.choferId) || 'Chofer eliminado') + '</span><span class="muted">' + fdate(x.desde) + ' – ' + (x.hasta ? fdate(x.hasta) : 'actual') + '</span></div>').join('');
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

  const saveCancelRow = '<div class="row" style="margin:14px 0"><button class="btn grow" onclick="saveCar(' + (ex ? "'" + c.id + "'" : 'null') + ')">Guardar</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>';
  const accionesRow = ex ? '<div class="row" style="margin-top:20px"><button class="btn sec grow" onclick="' + (c.vendido ? "toggleVendido('" + c.id + "')" : "venderAutoForm('" + c.id + "')") + '">' + (c.vendido ? 'Restaurar de vendidos' : 'Marcar como vendido') + '</button></div>' +
    (canDelete() ? '<div style="margin-top:8px"><button class="btn danger block" onclick="confirmDel(this,()=>delCar(\'' + c.id + '\'))">Eliminar auto</button></div>' : '') : '';

  if (ex) {
    h += '<div class="tabs" data-scope="auto">' +
      '<button class="tab on" data-tab="datos" onclick="setTabAuto(\'datos\')">Datos</button>' +
      '<button class="tab" data-tab="contrato" onclick="setTabAuto(\'contrato\')">Contrato</button>' +
      '<button class="tab" data-tab="mant" onclick="setTabAuto(\'mant\')">Mantenimiento</button>' +
      '<button class="tab" data-tab="gastos" onclick="setTabAuto(\'gastos\')">Gastos</button>' +
      '<button class="tab" data-tab="hist" onclick="setTabAuto(\'hist\')">Historial</button>' +
    '</div>';
    h += saveCancelRow;
    h += tabpanel('datos', true, datos);
    h += tabpanel('contrato', false, contrato);
    h += tabpanel('mant', false, mant);
    h += tabpanel('gastos', false, gastos);
    h += tabpanel('hist', false, hist);
    h += accionesRow;
  } else {
    h += datos + contrato + saveCancelRow;
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
}
export function autoCuota() {
  const m = $('#c_monto'); if (m.dataset.touched) return;
  const t = +val('c_total'), n = +val('c_cuotas');
  if (t && n) m.value = Math.round(t / n);
}
export async function saveCar(id) {
  const patente = val('c_patente').toUpperCase();
  if (!patente) { toast('Falta la patente'); return; }
  if (S.cars.some(x => x.id !== id && String(x.patente || '').toUpperCase() === patente)) { toast('Ya existe un auto con esa patente'); return; }
  const numFlota = val('c_numflota');
  if (numFlota && S.cars.some(x => x.id !== id && String(x.numeroFlota || '').trim() === numFlota)) { toast('Ya existe un auto con ese número de flota'); return; }
  const poliza = val('c_poliza');
  if (poliza && S.cars.some(x => x.id !== id && String(x.polizaNumero || '').trim() === poliza)) { toast('Ya existe un auto con ese número de póliza'); return; }
  const tipo = val('c_tipo'), con = tipo === 'alquiler' || tipo === 'financiado';
  const ex = S.cars.find(x => x.id === id);
  const choferId = con ? val('c_chofer') : '';
  const kmNuevo = +val('c_km') || 0;
  const kmViejo = ex ? (+ex.km || 0) : null;
  const kmHistorial = (ex && ex.kmHistorial) || [];
  const o = {
    id: id || uid(), patente, marca: val('c_marca'), modelo: val('c_modelo'), anio: val('c_anio'), tipo,
    choferId, monto: con ? (+val('c_monto') || 0) : 0, inicio: con ? val('c_inicio') : '',
    total: tipo === 'financiado' ? (+val('c_total') || 0) : 0, cuotas: tipo === 'financiado' ? (+val('c_cuotas') || 0) : 0,
    anticipo: tipo === 'financiado' ? (+val('c_anticipo') || 0) : 0, notas: val('c_notas'),
    tituloTransferido: document.getElementById('c_tituloTransferido') ? document.getElementById('c_tituloTransferido').checked : ((ex && ex.tituloTransferido) || false),
    tituloTransferidoFecha: document.getElementById('c_tituloTransferidoFecha') ? val('c_tituloTransferidoFecha') : ((ex && ex.tituloTransferidoFecha) || ''),
    numeroFlota: val('c_numflota'), combustible: val('c_combustible'), km: val('c_km'), costoCompra: +val('c_costocompra') || 0,
    valorMercado: +val('c_valormercado') || 0,
    polizaNumero: val('c_poliza'), aseguradora: val('c_aseguradora') === 'Otro' ? val('c_aseguradoraOtro') : val('c_aseguradora'),
    seguroMensual: +val('c_seguroMensual') || 0, patenteMensual: +val('c_patenteMensual') || 0,
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
    copiasLlave: +val('c_copiasLlave') || 0, llavesUbicacion: val('c_llavesUbicacion'),
    ultimaInspeccionGeneral: val('c_ultimaInspeccionGeneral'), ultimoLavado: val('c_ultimoLavado'),
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
  };
  VENC.forEach(v => { o[v[0]] = val('v_' + v[0]); });
  o.vencHistorial = actualizarHistorialVenc(ex, o);
  if (con) {
    if (!o.choferId) { toast('Elegí el chofer (cargalo primero en Choferes)'); return; }
    if (!o.monto || !o.inicio) { toast('Completá el monto semanal y la fecha de inicio'); return; }
    if (tipo === 'financiado' && !o.cuotas) { toast('Completá la cantidad de cuotas'); return; }
  }
  if (!(await save('cars', o))) return;
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
  '<label class="f"><span>Fecha de venta</span><input id="cv_fecha" type="date" value="' + iso(today()) + '"></label>' +
  '<div class="row"><button class="btn grow" onclick="confirmarVenta(\'' + c.id + '\')">Confirmar venta</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function confirmarVenta(id) {
  const c = S.cars.find(x => x.id === id); if (!c) return;
  const precioVenta = +val('cv_precio') || 0;
  const fechaVenta = val('cv_fecha') || iso(today());
  if (await save('cars', Object.assign({}, c, { vendido: true, precioVenta, fechaVenta }))) {
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
