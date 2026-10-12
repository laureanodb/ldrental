// Pantallas de financiados: pago mensual, arreglos financiados sumados a las
// cuotas y ranking de cuánto rinde cada dólar puesto en cada financiación.
import { S } from '../state.js';
import { esc, val, uid, iso, today, fdate, moneyUSD, money, num1, parse, days } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de } from '../memo.js';
import { calc, driverName, badge } from '../calc.js';
import { esMensual, montoMensual, cuotasMensuales, totalPlan, cargosFinanciados, cargoVencido } from '../financiados.js';
import { cotizacion } from '../dolar.js';

const carDe = id => de('cars', 'id', id)[0];

/* ---------- Campos del contrato ---------- */
export function camposFinanciado(c) {
  const mensual = c.frecuencia === 'mensual';
  return '<div id="frecbox" class="card small" style="margin-bottom:10px">' +
    '<div class="two"><label class="f"><span>Paga</span><select id="c_frecuencia" onchange="onFrecuencia()"><option value="semanal">Por semana</option><option value="mensual"' + (mensual ? ' selected' : '') + '>Por mes</option></select></label>' +
    '<label class="f" id="c_ajfrec_box" style="' + (mensual ? '' : 'display:none') + '"><span>Descuento (−) o recargo (+) %</span><input id="c_ajfrec" inputmode="decimal" value="' + esc(c.ajusteFrecuenciaPct || '') + '" placeholder="ej: -3 o 5" oninput="onFrecuencia()"></label></div>' +
    '<div class="muted" id="c_frec_txt">' + (mensual && +c.monto ? 'Cuota mensual: ' + moneyUSD(montoMensual(c)) + (c.cuotas ? ' · ' + cuotasMensuales(c) + ' cuotas · total ' + moneyUSD(totalPlan(c)) : '') + '. Vence el mismo día de cada mes que el inicio.' : '') + '</div>' +
    '<label class="f" style="margin-top:8px"><span>Lo que pusiste en el auto, en dólares <small>para el ranking de rendimiento</small></span><input id="c_costousd" inputmode="decimal" value="' + esc(c.costoCompraUSD || '') + '"></label></div>';
}
export function onFrecuencia() {
  const f = document.getElementById('c_frecuencia'); if (!f) return;
  const mensual = f.value === 'mensual';
  document.getElementById('c_ajfrec_box').style.display = mensual ? '' : 'none';
  const txt = document.getElementById('c_frec_txt');
  const monto = +val('c_monto') || 0, cuotas = +val('c_cuotas') || 0;
  if (!mensual || !monto) { txt.textContent = mensual ? 'Poné el monto semanal: la cuota mensual se calcula sola.' : ''; return; }
  const c = { tipo: 'financiado', frecuencia: 'mensual', monto, cuotas, total: +val('c_total') || 0, ajusteFrecuenciaPct: +val('c_ajfrec') || 0 };
  txt.textContent = 'Cuota mensual: ' + moneyUSD(montoMensual(c)) + (cuotas ? ' · ' + cuotasMensuales(c) + ' cuotas · total ' + moneyUSD(totalPlan(c)) : '') + '. Vence el mismo día de cada mes que el inicio.';
}
export function datosFinanciado() {
  const f = document.getElementById('c_frecuencia');
  if (!f) return {};
  return { frecuencia: f.value, ajusteFrecuenciaPct: f.value === 'mensual' ? (+val('c_ajfrec') || 0) : 0, costoCompraUSD: +val('c_costousd') || 0 };
}

/* ---------- Arreglos financiados ---------- */
export function seccionCargosFinanciados(c) {
  const L = cargosFinanciados(c);
  return '<div class="sec-t row between">Arreglos financiados<button class="btn sec sm" onclick="cargoFinanciadoForm(\'' + c.id + '\')">+ Sumar un arreglo</button></div>' +
    (L.length ? L.map(x => {
      const venc = cargoVencido(c, x);
      return '<div class="card row between"><div><div>' + esc(x.concepto) + ' · <b>' + moneyUSD(x.monto) + '</b></div><div class="small muted">' + x.cuotas + ' cuotas ' + (esMensual(c) ? 'mensuales' : 'semanales') + ' de ' + moneyUSD(x.monto / x.cuotas) + ' desde el ' + fdate(x.desde) + ' · ya vencido ' + moneyUSD(venc) + '</div></div>' +
        '<button class="btn danger sm" onclick="confirmDel(this,()=>borrarCargoFinanciado(\'' + c.id + '\',\'' + x.id + '\'))">Quitar</button></div>';
    }).join('') : '<div class="small muted" style="margin-bottom:12px">Si le arreglás algo grande y lo paga en cuotas, sumalo acá: se agrega a lo que debe y a su saldo.</div>');
}
export function cargoFinanciadoForm(carId) {
  const c = carDe(carId); if (!c) return;
  const cot = cotizacion();
  openModal('<h3>Sumar un arreglo a la financiación</h3>' +
    '<div class="small muted" style="margin-bottom:10px">' + esc(c.patente) + ' · ' + esc(driverName(c.choferId)) + '. Se cobra en cuotas aparte, sumadas a la cuota del auto.</div>' +
    '<label class="f"><span>Qué se arregló</span><input id="cf_concepto" placeholder="ej: caja de cambios"></label>' +
    '<div class="two"><label class="f"><span>Monto en dólares</span><input id="cf_monto" inputmode="decimal" oninput="calcCargoFinanciado()"></label>' +
    '<label class="f"><span>o en pesos</span><input id="cf_pesos" inputmode="decimal" placeholder="' + (cot ? 'dólar a ' + money(cot.valor) : 'cargá el dólar en Ajustes') + '" oninput="calcCargoFinanciado(true)"></label></div>' +
    '<div class="two"><label class="f"><span>En cuántas cuotas ' + (esMensual(c) ? 'mensuales' : 'semanales') + '</span><input id="cf_cuotas" inputmode="numeric" value="' + (esMensual(c) ? 3 : 8) + '" oninput="calcCargoFinanciado()"></label>' +
    '<label class="f"><span>Desde</span><input id="cf_desde" type="date" value="' + iso(today()) + '"></label></div>' +
    '<div class="small muted" id="cf_txt" style="margin-bottom:10px"></div>' +
    '<div class="row"><button class="btn grow" onclick="guardarCargoFinanciado(\'' + c.id + '\')">Sumar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\');setTabAuto(\'contrato\')">Cancelar</button></div>');
}
export function calcCargoFinanciado(desdePesos) {
  const cot = cotizacion();
  if (desdePesos && cot) { const p = +val('cf_pesos'); document.getElementById('cf_monto').value = p ? Math.round(p / cot.valor * 100) / 100 : ''; }
  const m = +val('cf_monto'), n = +val('cf_cuotas') || 1;
  document.getElementById('cf_txt').textContent = m ? n + ' cuotas de ' + moneyUSD(m / n) + ' (US$ ' + num1(m / n) + ')' : '';
}
export async function guardarCargoFinanciado(carId) {
  const c = carDe(carId); if (!c) return;
  const concepto = val('cf_concepto'), monto = +val('cf_monto'), cuotas = Math.max(1, Math.round(+val('cf_cuotas') || 1));
  if (!concepto) { toast('Contá qué se arregló'); return; }
  if (!(monto > 0)) { toast('Poné el monto'); return; }
  const x = { id: uid(), concepto, monto, cuotas, desde: val('cf_desde') || iso(today()), creado: iso(today()) };
  if (+val('cf_pesos')) { x.pesos = +val('cf_pesos'); x.cotizacion = (cotizacion() || {}).valor || 0; }
  if (await save('cars', Object.assign({}, c, { cargosFinanciados: (c.cargosFinanciados || []).concat([x]) }))) { toast('Arreglo sumado a la financiación'); window.carForm(carId); window.setTabAuto('contrato'); }
}
export async function borrarCargoFinanciado(carId, xid) {
  const c = carDe(carId); if (!c) return;
  if (await save('cars', Object.assign({}, c, { cargosFinanciados: (c.cargosFinanciados || []).filter(x => x.id !== xid) }))) { toast('Quitado'); window.carForm(carId); window.setTabAuto('contrato'); }
}

/* ---------- Ranking: cuánto rinde cada dólar ---------- */
export function rankingFinanciaciones() {
  return S.cars.filter(c => c.tipo === 'financiado' && c.inicio && +c.monto > 0).map(c => {
    const i = calc(c);
    const puesto = +c.costoCompraUSD || 0;
    const anticipo = +c.anticipo || 0;
    const total = i.total + anticipo;
    const cobrado = i.paid + anticipo;
    const ganancia = puesto ? total - puesto : null;
    const fin = esMensual(c) ? cuotasMensuales(c) * 30.4 : (+c.cuotas || 0) * 7;
    const años = Math.max(fin / 365, 0.25);
    return {
      c, puesto, total, cobrado, ganancia,
      porDolar: puesto ? ganancia / puesto : null,
      anual: puesto ? ganancia / puesto / años * 100 : null,
      recuperado: puesto ? cobrado / puesto * 100 : null,
      deuda: i.debt, transcurrido: Math.min(100, Math.round(days(parse(c.inicio), today()) / Math.max(1, fin) * 100)),
    };
  }).sort((a, b) => (b.anual == null ? -1e9 : b.anual) - (a.anual == null ? -1e9 : a.anual));
}
export function rankingFinanciacionesView() {
  const L = rankingFinanciaciones();
  const conCosto = L.filter(x => x.puesto);
  const tot = conCosto.reduce((a, x) => ({ puesto: a.puesto + x.puesto, ganancia: a.ganancia + x.ganancia, cobrado: a.cobrado + x.cobrado }), { puesto: 0, ganancia: 0, cobrado: 0 });
  openModal('<h3>Rendimiento de las financiaciones</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Por cada dólar que pusiste en el auto, cuánto ganás al terminar el plan (total + anticipo − lo que pusiste) y cuánto es por año. "Recuperado" es lo que ya cobraste sobre lo que pusiste.</div>' +
    (conCosto.length ? '<div class="grid" style="margin-bottom:10px"><div class="kpi"><div class="n">' + moneyUSD(tot.puesto) + '</div><div class="l">Puesto en autos</div></div><div class="kpi"><div class="n">' + moneyUSD(tot.ganancia) + '</div><div class="l">Ganancia al terminar</div></div>' +
      '<div class="kpi"><div class="n">' + (tot.puesto ? num1(tot.ganancia / tot.puesto * 100) + '%' : '—') + '</div><div class="l">Sobre lo puesto</div></div><div class="kpi"><div class="n">' + (tot.puesto ? Math.round(tot.cobrado / tot.puesto * 100) + '%' : '—') + '</div><div class="l">Recuperado</div></div></div>' : '') +
    (L.length ? L.map((x, i) => '<div class="card tap" onclick="carForm(\'' + x.c.id + '\')"><div class="row between"><b>' + (x.puesto ? (i + 1) + '. ' : '') + esc(x.c.patente) + ' <span class="small muted">' + esc(driverName(x.c.choferId)) + '</span></b>' +
      (x.anual != null ? badge(x.anual >= 20 ? 'ok' : x.anual >= 0 ? 'soft' : 'bad', num1(x.anual) + '% por año') : badge('mute', 'Falta lo que pusiste')) + '</div>' +
      (x.puesto ? '<div class="small muted">Pusiste ' + moneyUSD(x.puesto) + ' · vas a cobrar ' + moneyUSD(x.total) + ' · cada US$ 1 rinde US$ ' + num1(1 + x.porDolar) + '</div>' +
        '<div style="background:var(--soft);border-radius:6px;height:8px;overflow:hidden;margin:6px 0"><div style="width:' + Math.min(100, Math.round(x.recuperado)) + '%;height:100%;background:' + (x.recuperado >= 100 ? 'var(--ok)' : 'var(--btn)') + '"></div></div>' +
        '<div class="small muted">Recuperado ' + Math.round(x.recuperado) + '% · plan ' + x.transcurrido + '% transcurrido' + (x.deuda > 0 ? ' · debe ' + moneyUSD(x.deuda) : '') + '</div>'
        : '<div class="small muted">Cargá en el contrato del auto cuánto pusiste en dólares.</div>') + '</div>').join('') : '<div class="card empty">No hay autos financiados.</div>') +
    '<button class="btn sec block" style="margin-top:10px" onclick="closeModal()">Cerrar</button>');
}
