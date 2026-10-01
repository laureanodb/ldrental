// Cuenta corriente del chofer: todos los cargos y pagos en una sola lista
// (alquiler o cuota semanal, ajustes, seguro, multas, adelantos), con saldo
// por moneda, y plan de pagos para ponerse al día con la deuda en pesos o
// en dólares. Los saldos salen de las mismas cuentas que usa el resto de la
// app (calc, seguroPendiente, multas, adelantos), así siempre coinciden.
import { S } from '../state.js';
import { esc, val, uid, money, moneyUSD, fdate, iso, today, parse } from '../utils.js';
import { isContract, calc, esSeguroRecuperable, badge, saldosCuenta, estadoPlan } from '../calc.js';
import { METODOS_PAGO } from '../constants.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { canVerFinanzas } from '../roles.js';
import { settings } from '../settings.js';
import { cotizacion, enPesos, textoCotizacion } from '../dolar.js';

const metodoLabel = m => (METODOS_PAGO.find(x => x[0] === m) || [0, ''])[1];
const mon = (m, n) => (m === 'USD' ? moneyUSD(n) : money(n));

export function movimientosCuenta(driverId) {
  const M = [];
  const autos = S.cars.filter(c => c.choferId === driverId && isContract(c));
  autos.forEach(c => {
    const moneda = c.tipo === 'financiado' ? 'USD' : 'ARS';
    const kind = c.tipo === 'alquiler' ? 'alquiler' : 'cuota';
    const i = calc(c);
    for (let k = 0; k < i.weeks; k++) {
      const f = parse(c.inicio); f.setDate(f.getDate() + 7 * k);
      M.push({ fecha: iso(f), concepto: kind === 'alquiler' ? 'Alquiler semana ' + (k + 1) : 'Cuota ' + (k + 1) + (c.cuotas ? ' de ' + c.cuotas : ''), detalle: c.patente || '', cargo: +c.monto || 0, abono: 0, moneda });
    }
    (c.ajustesDeuda || []).forEach(a => {
      const m = +a.monto || 0; if (!m) return;
      M.push({ fecha: a.fecha || c.inicio, concepto: m > 0 ? 'Ajuste / descuento' : 'Ajuste', detalle: a.motivo || '', cargo: m < 0 ? -m : 0, abono: m > 0 ? m : 0, moneda });
    });
    S.payments.filter(p => p.carId === c.id && p.tipo === kind && p.fecha >= c.inicio).forEach(p => {
      M.push({ fecha: p.fecha, concepto: 'Pago', detalle: [metodoLabel(p.metodo), c.patente].filter(Boolean).join(' · '), cargo: 0, abono: +p.monto || 0, moneda });
    });
    if (i.adelantoAplicado) M.push({ fecha: iso(today()), concepto: 'Cubierto con semana adelantada', detalle: c.patente || '', cargo: 0, abono: i.adelantoAplicado, moneda });
  });
  S.gastos.filter(g => esSeguroRecuperable(g) && g.recuperaDe === driverId).forEach(g => {
    const c = S.cars.find(x => x.id === g.carId);
    M.push({ fecha: g.fecha, concepto: 'Seguro', detalle: (c ? c.patente : '') + (g.fecha ? ' · ' + g.fecha.slice(5, 7) + '/' + g.fecha.slice(0, 4) : ''), cargo: +g.costo || 0, abono: 0, moneda: 'ARS' });
  });
  S.payments.filter(p => p.choferId === driverId && p.tipo === 'seguro').forEach(p => {
    M.push({ fecha: p.fecha, concepto: 'Pago de seguro', detalle: metodoLabel(p.metodo), cargo: 0, abono: +p.monto || 0, moneda: 'ARS' });
  });
  S.multas.filter(m => m.choferId === driverId && (m.estado === 'pendiente' || m.estado === 'vencida')).forEach(m => {
    const c = S.cars.find(x => x.id === m.carId);
    M.push({ fecha: m.fecha, concepto: 'Multa', detalle: [m.numeroActa ? 'Acta ' + m.numeroActa : '', c ? c.patente : ''].filter(Boolean).join(' · '), cargo: +m.monto || 0, abono: 0, moneda: 'ARS' });
  });
  const d = S.drivers.find(x => x.id === driverId);
  ((d && d.adelantos) || []).forEach(a => {
    const m = +a.monto || 0; if (!m) return;
    M.push({ fecha: a.fecha, concepto: m > 0 ? 'Adelanto' : 'Devolución de adelanto', detalle: a.motivo || '', cargo: m > 0 ? m : 0, abono: m < 0 ? -m : 0, moneda: 'ARS' });
  });
  M.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || (b.cargo - a.cargo));
  const corrido = { ARS: 0, USD: 0 };
  M.forEach(x => { corrido[x.moneda] += x.cargo - x.abono; x.saldo = corrido[x.moneda]; });
  return M;
}

function tarjetaPlan(d) {
  const e = estadoPlan(d); if (!e) return '';
  const p = e.p, m = n => mon(p.moneda, n);
  const pct = p.deudaInicial ? Math.min(100, Math.round(e.pagadoDelPlan / p.deudaInicial * 100)) : 0;
  return '<div class="card"><div class="row between"><b>Plan de pagos</b>' +
    (e.cumplido ? badge('ok', 'Cumplido') : e.alDia ? badge('ok', 'Al día') : badge('bad', 'Atrasado')) + '</div>' +
    '<div class="small muted">' + p.cuotas + ' cuotas semanales de ' + m(p.montoCuota) + ' desde el ' + fdate(p.inicio) + ' (además del ' + (p.moneda === 'USD' ? 'pago de la cuota' : 'alquiler') + '). Termina el ' + fdate(e.fin) + '.</div>' +
    '<div style="background:var(--soft);border-radius:6px;height:8px;overflow:hidden;margin:8px 0"><div style="width:' + pct + '%;height:100%;background:var(--ok)"></div></div>' +
    '<div class="row between small"><span class="muted">Deuda al empezar</span><span>' + m(p.deudaInicial) + '</span></div>' +
    '<div class="row between small"><span class="muted">Ya devolvió</span><span>' + m(e.pagadoDelPlan) + ' (' + pct + '%)</span></div>' +
    '<div class="row between small"><span class="muted">Hoy debería deber como máximo</span><span>' + m(e.deberiaQuedar) + '</span></div>' +
    '<div class="row between"><span class="muted">Debe hoy</span><b style="color:' + (e.alDia ? 'var(--ok)' : 'var(--bad)') + '">' + m(e.deudaHoy) + '</b></div>' +
    (!e.alDia ? '<div class="small" style="color:var(--bad)">Está ' + m(e.atraso) + ' atrasado con el plan.</div>' : '') +
    (p.nota ? '<div class="small muted" style="margin-top:4px">' + esc(p.nota) + '</div>' : '') +
    (canVerFinanzas() ? '<div class="row" style="margin-top:8px">' + (e.cumplido ? '<button class="btn sm grow" onclick="cerrarPlanPagos(\'' + d.id + '\')">Cerrar plan cumplido</button>' : '') + '<button class="btn sec sm" onclick="cerrarPlanPagos(\'' + d.id + '\')">' + (e.cumplido ? 'Quitar' : 'Cancelar el plan') + '</button></div>' : '') +
    '</div>';
}

/* ---------- Pantalla ---------- */
const LIMITE = 40;
export function cuentaCorrienteView(driverId, todo) {
  const d = S.drivers.find(x => x.id === driverId); if (!d) return;
  const s = saldosCuenta(driverId);
  const M = movimientosCuenta(driverId);
  const linea = (l, n, m, color) => n ? '<div class="row between small"><span class="muted">' + l + '</span><span' + (color ? ' style="color:' + color + '"' : '') + '>' + mon(m || 'ARS', n) + '</span></div>' : '';
  let h = '<h3>Cuenta corriente · ' + esc(d.nombre) + '</h3>' +
    '<div class="card"><div class="row between"><span class="muted">Debe en pesos</span><b style="font-size:18px;color:' + (s.ars > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + money(s.ars) + '</b></div>' +
    linea('Alquiler', s.alquiler) + linea('Seguro', s.seguro) + linea('Multas', s.multas) + linea(s.adelantos >= 0 ? 'Adelantos' : 'Adelantos (a favor)', Math.abs(s.adelantos)) +
    (s.usd || S.cars.some(c => c.choferId === driverId && c.tipo === 'financiado') ? '<div class="row between" style="margin-top:6px"><span class="muted">Debe en dólares (cuotas)</span><b style="font-size:18px;color:' + (s.usd > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + moneyUSD(s.usd) + '</b></div>' +
      (s.usd > 0 && cotizacion() ? '<div class="row between small muted"><span>En pesos hoy (' + esc(textoCotizacion()) + ')</span><span>' + money(enPesos(s.usd)) + '</span></div>' : '') : '') +
    (s.deposito || s.semanaAdelantada ? '<div style="border-top:1px solid var(--line);margin-top:8px;padding-top:6px">' + linea('Depósito de garantía (a favor)', s.deposito, 'ARS', 'var(--ok)') + linea('Semana adelantada sin usar (a favor)', s.semanaAdelantada, 'ARS', 'var(--ok)') + '</div>' : '') +
    '</div>';
  h += tarjetaPlan(d);
  if (canVerFinanzas() && !estadoPlan(d) && (s.ars > 0 || s.usd > 0)) h += '<button class="btn sec block" style="margin-bottom:10px" onclick="planPagosForm(\'' + d.id + '\')">+ Armar un plan de pagos</button>';
  h += '<div class="row" style="margin-bottom:10px">' + (canVerFinanzas() ? '<button class="btn sec sm grow" onclick="cuentaCorrientePDF(\'' + d.id + '\')">Descargar PDF</button>' : '') +
    '<button class="btn sec sm grow" onclick="driverForm(\'' + d.id + '\');setTabChofer(\'financiacion\')">‹ Volver a la ficha</button></div>';
  const vis = todo ? M.slice().reverse() : M.slice(-LIMITE).reverse();
  h += '<div class="sec-t">Movimientos (del más nuevo al más viejo)</div>' + (vis.length ? vis.map(x =>
    '<div class="row between" style="border-bottom:1px solid var(--line);padding:6px 0;gap:8px"><div class="grow" style="min-width:0"><div class="small">' + esc(x.concepto) + '</div><div class="small muted" style="overflow-wrap:anywhere">' + fdate(x.fecha) + (x.detalle ? ' · ' + esc(x.detalle) : '') + '</div></div>' +
    '<div style="text-align:right;white-space:nowrap"><div class="small" style="color:' + (x.cargo ? 'var(--bad)' : 'var(--ok)') + '">' + (x.cargo ? '+' + mon(x.moneda, x.cargo) : '−' + mon(x.moneda, x.abono)) + '</div><div class="small muted">' + (x.saldo < 0 ? 'a favor ' + mon(x.moneda, -x.saldo) : 'saldo ' + mon(x.moneda, x.saldo)) + '</div></div></div>').join('')
    : '<div class="card empty">Sin movimientos todavía.</div>');
  if (!todo && M.length > LIMITE) h += '<button class="btn sec block" style="margin-top:10px" onclick="cuentaCorrienteView(\'' + d.id + '\',true)">Ver los ' + M.length + ' movimientos</button>';
  h += '<div class="small muted" style="margin-top:10px">+ es lo que se le cobra, − lo que pagó. El saldo corre por separado en pesos y en dólares.</div>';
  openModal(h);
}

let planDriverId = '';
export function planPagosForm(driverId) {
  const d = S.drivers.find(x => x.id === driverId); if (!d) return;
  planDriverId = driverId;
  const s = saldosCuenta(driverId);
  const moneda = s.ars > 0 || !s.usd ? 'ARS' : 'USD';
  const h = '<h3>Plan de pagos · ' + esc(d.nombre) + '</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Repartí la deuda en cuotas semanales que paga además de lo de siempre. La app sigue si va al día con el plan.</div>' +
    '<label class="f"><span>Deuda a refinanciar</span><select id="pp_moneda" onchange="planPagosRecalcular()"><option value="ARS"' + (moneda === 'ARS' ? ' selected' : '') + '>En pesos: ' + money(s.ars) + '</option>' + (s.usd ? '<option value="USD"' + (moneda === 'USD' ? ' selected' : '') + '>Cuotas en dólares: ' + moneyUSD(s.usd) + '</option>' : '') + '</select></label>' +
    '<div class="two"><label class="f"><span>Monto total</span><input id="pp_total" inputmode="decimal" value="' + (moneda === 'USD' ? s.usd : s.ars) + '" oninput="planPagosRecalcular(true)"></label>' +
    '<label class="f"><span>Cantidad de semanas</span><input id="pp_cuotas" inputmode="numeric" value="4" oninput="planPagosRecalcular(true)"></label></div>' +
    '<div class="two"><label class="f"><span>Cuota semanal</span><input id="pp_cuota" inputmode="decimal"></label>' +
    '<label class="f"><span>Empieza</span><input id="pp_inicio" type="date" value="' + iso(today()) + '"></label></div>' +
    '<label class="f"><span>Nota <small>opcional</small></span><input id="pp_nota" placeholder="ej: acordado por WhatsApp"></label>' +
    '<div class="row"><button class="btn grow" onclick="guardarPlanPagos(\'' + d.id + '\')">Guardar plan</button><button class="btn sec" onclick="cuentaCorrienteView(\'' + d.id + '\')">Cancelar</button></div>';
  openModal(h);
  planPagosRecalcular();
}
export function planPagosRecalcular(soloCuota) {
  const s = saldosCuenta(planDriverId);
  const moneda = val('pp_moneda');
  if (!soloCuota) document.getElementById('pp_total').value = moneda === 'USD' ? s.usd : s.ars;
  const total = +val('pp_total') || 0, n = Math.max(1, Math.round(+val('pp_cuotas') || 1));
  document.getElementById('pp_cuota').value = Math.ceil(total / n * 100) / 100;
}
export async function guardarPlanPagos(driverId) {
  const d = S.drivers.find(x => x.id === driverId); if (!d) return;
  const total = +val('pp_total'), cuotas = Math.round(+val('pp_cuotas')), montoCuota = +val('pp_cuota');
  if (!total || total <= 0) { toast('Poné el monto total'); return; }
  if (!cuotas || cuotas < 1) { toast('Poné la cantidad de semanas'); return; }
  if (!montoCuota || montoCuota <= 0) { toast('Poné la cuota semanal'); return; }
  if (montoCuota * cuotas < total - 0.5) { toast('Con esa cuota no llega a cubrir el total'); return; }
  const planPagos = { id: uid(), activo: true, moneda: val('pp_moneda'), deudaInicial: total, cuotas, montoCuota, inicio: val('pp_inicio') || iso(today()), nota: val('pp_nota').trim(), creado: iso(today()) };
  const historialPlanes = (d.historialPlanes || []).concat(d.planPagos ? [d.planPagos] : []);
  if (!(await save('drivers', Object.assign({}, d, { planPagos, historialPlanes })))) return;
  toast('Plan de pagos guardado');
  cuentaCorrienteView(driverId);
}
export async function cerrarPlanPagos(driverId) {
  const d = S.drivers.find(x => x.id === driverId); if (!d || !d.planPagos) return;
  const e = estadoPlan(d);
  const cerrado = Object.assign({}, d.planPagos, { activo: false, cerrado: iso(today()), resultado: e && e.cumplido ? 'cumplido' : 'cancelado' });
  if (!(await save('drivers', Object.assign({}, d, { planPagos: null, historialPlanes: (d.historialPlanes || []).concat([cerrado]) })))) return;
  toast(cerrado.resultado === 'cumplido' ? 'Plan cerrado como cumplido' : 'Plan cancelado');
  cuentaCorrienteView(driverId);
}

export async function cuentaCorrientePDF(driverId) {
  try {
    const d = S.drivers.find(x => x.id === driverId); if (!d) return;
    const s = saldosCuenta(driverId);
    const M = movimientosCuenta(driverId);
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const mg = 15, w = 180;
    let y = 20;
    const salto = () => { if (y > 275) { doc.addPage(); y = 20; } };
    doc.setFontSize(15); doc.text(settings.companyName || 'LD Rental', mg, y); y += 8;
    doc.setFontSize(12); doc.text('Cuenta corriente — ' + d.nombre, mg, y); y += 6;
    doc.setFontSize(9); doc.setTextColor(120); doc.text('Al ' + fdate(iso(today())), mg, y); doc.setTextColor(0); y += 9;
    doc.setFontSize(11);
    doc.text('Debe en pesos: ' + money(s.ars), mg, y); y += 6;
    doc.setFontSize(9);
    [['Alquiler', s.alquiler], ['Seguro', s.seguro], ['Multas', s.multas], ['Adelantos', s.adelantos]].forEach(([l, n]) => { if (n) { doc.text('   ' + l + ': ' + money(n), mg, y); y += 5; } });
    doc.setFontSize(11);
    if (s.usd) { doc.text('Debe en dólares (cuotas): ' + moneyUSD(s.usd), mg, y); y += 6; }
    doc.setFontSize(9);
    if (s.deposito) { doc.text('Depósito de garantía a favor: ' + money(s.deposito), mg, y); y += 5; }
    const e = estadoPlan(d);
    if (e) { y += 2; doc.text('Plan de pagos: ' + e.p.cuotas + ' cuotas semanales de ' + mon(e.p.moneda, e.p.montoCuota) + ' desde el ' + fdate(e.p.inicio) + ' — ' + (e.cumplido ? 'cumplido' : e.alDia ? 'al día' : 'atrasado ' + mon(e.p.moneda, e.atraso)), mg, y); y += 6; }
    y += 4;
    doc.text('Fecha', mg, y); doc.text('Concepto', mg + 22, y); doc.text('Cargo', mg + 115, y); doc.text('Pago', mg + 140, y); doc.text('Saldo', mg + 162, y); y += 3;
    doc.setDrawColor(200); doc.line(mg, y, mg + w, y); y += 5;
    M.forEach(x => {
      salto();
      doc.text(fdate(x.fecha), mg, y);
      doc.text(doc.splitTextToSize(x.concepto + (x.detalle ? ' · ' + x.detalle : ''), 90)[0], mg + 22, y);
      if (x.cargo) doc.text(mon(x.moneda, x.cargo), mg + 115, y);
      if (x.abono) doc.text(mon(x.moneda, x.abono), mg + 140, y);
      doc.text(mon(x.moneda, x.saldo), mg + 162, y);
      y += 5;
    });
    y += 4; salto();
    doc.setFontSize(8); doc.setTextColor(140); doc.text('Generado por ' + (settings.companyName || 'LD Rental'), mg, y);
    doc.save('cuenta-corriente-' + d.nombre.replace(/\s+/g, '-').toLowerCase() + '-' + iso(today()) + '.pdf');
  } catch (e) {
    toast('No se pudo generar el PDF: ' + ((e && e.message) || 'error'));
  }
}
