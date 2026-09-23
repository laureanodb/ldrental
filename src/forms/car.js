import { S } from '../state.js';
import { $, val, uid, iso, today, esc, fdate, money, moneyUSD } from '../utils.js';
import { TIPOS, VENC, COMBUSTIBLES, GASTO_CATS, MULTA_ESTADOS, MOTIVOS_REEMPLAZO, TIPOS_SINIESTRO, SINIESTRO_ESTADOS, ASEGURADORAS } from '../constants.js';
import { isContract, calc, finFinanciado, driverName, diasEnTaller, planMantenimientoDefault, estadoPlanItem, textoRestante, badge, estadoMultaCls, resultadoVenta, fichaTecnica, cronogramaCuotas } from '../calc.js';
import { openModal, closeModal, toast, confirmDel } from '../modal.js';
import { save, remove } from '../data.js';
import { renderFiles, purgeFiles } from '../files.js';
import { canDelete } from '../roles.js';
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
  '<div class="two"><label class="f"><span>Número de flota</span><input id="c_numflota" value="' + esc(c.numeroFlota) + '"></label>' +
  '<label class="f"><span>Combustible</span><select id="c_combustible"><option value="">Sin especificar</option>' + COMBUSTIBLES.map(x => '<option value="' + x[0] + '"' + (c.combustible === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label></div>' +
  '<div class="two"><label class="f"><span>Kilometraje actual</span><input id="c_km" inputmode="numeric" value="' + esc(c.km) + '"></label>' +
  '<label class="f"><span>Costo de compra</span><input id="c_costocompra" inputmode="decimal" value="' + esc(c.costoCompra || '') + '"></label></div>' +
  '<label class="f"><span>Valor de mercado actual</span><input id="c_valormercado" inputmode="decimal" value="' + esc(c.valorMercado || '') + '"></label>' +
  '<label class="f"><span>Estado</span><select id="c_tipo" data-orig="' + esc(ex ? c.tipo : '') + '" onchange="onTipo(this)">' + Object.keys(TIPOS).map(k => '<option value="' + k + '"' + (c.tipo === k ? ' selected' : '') + '>' + TIPOS[k] + '</option>').join('') + '</select></label>' +
  '<div class="sec-t">Vencimientos</div><div class="two">' + VENC.map(v => '<label class="f"><span>' + v[1] + '</span><input id="v_' + v[0] + '" type="date" value="' + esc(c[v[0]]) + '"></label>').join('') + '</div>' +
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
  '<div class="small muted" style="margin:-4px 0 8px">Si cargás un monto mensual, la app genera el gasto automáticamente cada mes (dejalo en 0 para no generarlo).</div>' +
  '<div class="two"><label class="f"><span>Seguro: monto mensual</span><input id="c_seguroMensual" inputmode="decimal" value="' + esc(c.seguroMensual || '') + '"></label>' +
  '<label class="f"><span>Patente: monto mensual</span><input id="c_patenteMensual" inputmode="decimal" value="' + esc(c.patenteMensual || '') + '"></label></div>' +
  '<div class="sec-t">Ubicación y GPS</div>' +
  '<div class="two"><label class="f"><span>Dónde duerme de noche</span><input id="c_dondeDuerme" value="' + esc(c.dondeDuerme) + '"></label>' +
  '<label class="f"><span>Link de Google Maps <small>opcional</small></span><input id="c_dondeDuermeMaps" type="url" value="' + esc(c.dondeDuermeMaps) + '"></label></div>' +
  '<label class="f"><span>Tipo de GPS</span><input id="c_gpsTipo" value="' + esc(c.gpsTipo) + '"></label>' +
  '<label class="chk"><input type="checkbox" id="c_gpsAlerta"' + (c.gpsAlerta ? ' checked' : '') + '><span>GPS roto / con alerta' + (c.gpsAlerta ? '' : ' (pone el auto en taller al guardar)') + '</span></label>' +
  '<div class="sec-t">Estado de flota</div>' +
  '<label class="chk"><input type="checkbox" id="c_soloAlquiler"' + (c.soloAlquiler ? ' checked' : '') + '><span>Solo alquiler, nunca financiado</span></label>' +
  '<label class="chk"><input type="checkbox" id="c_reservado" onchange="document.getElementById(\'reservadoBox\').style.display=this.checked?\'\':\'none\'"' + (c.reservado ? ' checked' : '') + '><span>Reservado</span></label>' +
  '<div id="reservadoBox" style="display:' + (c.reservado ? '' : 'none') + '"><label class="f"><span>Reservado para</span><input id="c_reservadoPara" value="' + esc(c.reservadoPara) + '"></label></div>' +
  '<label class="chk"><input type="checkbox" id="c_aReemplazar" onchange="document.getElementById(\'reemplazoBox\').style.display=this.checked?\'\':\'none\'"' + (c.aReemplazar ? ' checked' : '') + '><span>Marcar para reemplazar</span></label>' +
  '<div id="reemplazoBox" style="display:' + (c.aReemplazar ? '' : 'none') + '"><label class="f"><span>Motivo</span><select id="c_motivoReemplazo">' + MOTIVOS_REEMPLAZO.map(x => '<option value="' + x[0] + '"' + (c.motivoReemplazo === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label></div>' +
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
    if (c.tipo === 'taller') mant += '<div class="row" style="margin-bottom:10px"><button class="btn sec grow" onclick="sacarDeTaller(\'' + c.id + '\')">Sacar de taller</button></div>';
    if (plan.length) mant += plan.map(p => { const e = estadoPlanItem(c, p); return '<div class="row between small" style="padding:4px 0"><span>' + esc(p.label || p.item) + '</span><span>' + badge(e.cls, textoRestante(e)) + '</span></div>'; }).join('');
    mant += '<div class="row" style="margin:8px 0"><button class="btn sec grow" onclick="mantenimientoForm(\'' + c.id + '\')">+ Registrar mantenimiento</button>' + (plan.length ? '<button class="btn sec" onclick="editarPlanMantenimiento(\'' + c.id + '\')">Editar plan</button>' : '') + '</div>';
    if (MH.length) mant += '<div class="sec-t">Historial de mantenimiento</div>' + MH.map(m => '<div class="card row"><div class="grow tap" onclick="mantenimientoForm(\'' + c.id + '\',\'' + m.id + '\')"><div>' + money(m.costo) + ' <span class="small muted">' + esc(m.label || m.item) + (m.tipo === 'correctivo' ? ' · correctivo' : '') + (m.sinFactura ? ' · sin factura' : '') + '</span></div><div class="small muted">' + fdate(m.fecha) + (m.km ? ' · ' + (+m.km).toLocaleString('es-AR') + ' km' : '') + ([m.marca, m.especificacion].filter(Boolean).length ? ' · ' + esc([m.marca, m.especificacion].filter(Boolean).join(' · ')) : '') + '</div></div>' + (canDelete() ? '<button class="btn danger sm" onclick="confirmDel(this,()=>delMantenimiento(\'' + m.id + '\'))">Borrar</button>' : '') + '</div>').join('');

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
    hist += '<button class="btn sec block" style="margin:8px 0 20px" onclick="inspeccionForm(\'' + c.id + '\')">+ Registrar inspección</button>';
    const H = (c.historialChoferes || []).slice().sort((a, b) => b.desde.localeCompare(a.desde));
    if (H.length) {
      hist += '<div class="sec-t">Historial de choferes</div>' + H.map(x => '<div class="row between small" style="padding:4px 0"><span>' + esc(driverName(x.choferId) || 'Chofer eliminado') + '</span><span class="muted">' + fdate(x.desde) + ' – ' + (x.hasta ? fdate(x.hasta) : 'actual') + '</span></div>').join('');
    }
    const HM = (c.montoHistorial || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (HM.length) {
      hist += '<div class="sec-t">Historial de monto semanal</div>' + HM.map(x => '<div class="row between small" style="padding:4px 0"><span>' + (c.tipo === 'financiado' ? moneyUSD(x.monto) : money(x.monto)) + '</span><span class="muted">' + fdate(x.fecha) + '</span></div>').join('');
    }
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
    soloAlquiler: document.getElementById('c_soloAlquiler').checked,
    reservado: document.getElementById('c_reservado').checked, reservadoPara: val('c_reservadoPara'),
    aReemplazar: document.getElementById('c_aReemplazar').checked, motivoReemplazo: val('c_motivoReemplazo'),
    vendido: (ex || {}).vendido || false,
    files: (ex || {}).files || [],
    ajustesDeuda: (ex || {}).ajustesDeuda || [],
    historialChoferes: actualizarHistorialChoferes(ex, choferId),
    historialTaller: actualizarHistorialTaller(ex, tipo),
    mantenimientoPlan: (ex && ex.mantenimientoPlan) || planMantenimientoDefault(kmNuevo, iso(today())),
    kmHistorial: (kmNuevo && kmNuevo !== kmViejo) ? kmHistorial.concat([{ fecha: iso(today()), km: kmNuevo }]) : kmHistorial,
    montoHistorial: actualizarHistorialMonto(ex, con ? (+val('c_monto') || 0) : 0),
  };
  VENC.forEach(v => { o[v[0]] = val('v_' + v[0]); });
  if (con) {
    if (!o.choferId) { toast('Elegí el chofer (cargalo primero en Choferes)'); return; }
    if (!o.monto || !o.inicio) { toast('Completá el monto semanal y la fecha de inicio'); return; }
    if (tipo === 'financiado' && !o.cuotas) { toast('Completá la cantidad de cuotas'); return; }
  }
  if (!(await save('cars', o))) return;
  if (o.gpsAlerta && !(ex && ex.gpsAlerta)) await marcarEnTaller(o.id);
  closeModal(); toast('Auto guardado');
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
  if (await save('cars', Object.assign({}, c, { vendido: true, precioVenta, fechaVenta }))) { closeModal(); toast('Auto marcado como vendido'); }
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
  if (await save('cars', Object.assign({}, c, { tipo: nuevoTipo, tipoPrevioTaller: '', historialTaller }))) { closeModal(); toast('Auto sacado de taller'); }
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
