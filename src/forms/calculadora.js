import { val } from '../utils.js';
import { openModal } from '../modal.js';
import { activeCars, isContract } from '../calc.js';

export function calculadoraForm() {
  const h = '<h3>Calculadora: financiar vs. alquilar</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Ingresá todos los montos en la misma moneda para que la comparación tenga sentido (por ejemplo, todo en dólares si el auto se financia en dólares).</div>' +
  '<label class="f"><span>Anticipo (financiado)</span><input id="cf_anticipo" inputmode="decimal" value="0" oninput="calcularComparacion()"></label>' +
  '<div class="two"><label class="f"><span>Cuota semanal (financiado)</span><input id="cf_cuota" inputmode="decimal" value="0" oninput="calcularComparacion()"></label>' +
  '<label class="f"><span>Cantidad de semanas a comparar</span><input id="cf_cuotas" inputmode="numeric" value="0" oninput="calcularComparacion()"></label></div>' +
  '<label class="f"><span>Alquiler semanal equivalente</span><input id="cf_alquiler" inputmode="decimal" value="0" oninput="calcularComparacion()"></label>' +
  '<div id="cf_resultado" class="card"></div>' +
  '<div class="row" style="margin-top:14px"><button class="btn sec grow" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
  calcularComparacion();
}
export function calcularComparacion() {
  const el = document.getElementById('cf_resultado'); if (!el) return;
  const anticipo = +val('cf_anticipo') || 0;
  const cuota = +val('cf_cuota') || 0;
  const semanas = +val('cf_cuotas') || 0;
  const alquiler = +val('cf_alquiler') || 0;
  const fmt = n => Math.round(n).toLocaleString('es-AR');
  const totalFinanciado = anticipo + cuota * semanas;
  const totalAlquiler = alquiler * semanas;
  const dif = totalFinanciado - totalAlquiler;
  el.innerHTML = '<div class="row between small"><span class="muted">Total pagado financiando</span><b>' + fmt(totalFinanciado) + '</b></div>' +
  '<div class="row between small"><span class="muted">Total pagado alquilando (mismo plazo)</span><b>' + fmt(totalAlquiler) + '</b></div>' +
  '<div class="row between" style="margin-top:6px"><b>Diferencia</b><b style="color:' + (dif <= 0 ? 'var(--ok)' : 'inherit') + '">' + (dif >= 0 ? '+' : '') + fmt(dif) + '</b></div>' +
  '<div class="small muted" style="margin-top:6px">' + (dif > 0 ? 'Financiar cuesta ' + fmt(dif) + ' más en este plazo, pero al terminar las cuotas el auto queda del chofer.' : 'Financiar termina costando igual o menos en este plazo, y además el auto queda del chofer al final.') + '</div>';
}

export function roiAutoForm() {
  const h = '<h3>Calculadora: ROI antes de comprar</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Estimá si conviene comprar uno o varios autos antes de hacerlo.</div>' +
  '<div class="two"><label class="f"><span>Costo de compra (por auto)</span><input id="cr_costo" inputmode="decimal" value="0" oninput="calcularRoi()"></label>' +
  '<label class="f"><span>Cantidad de autos</span><input id="cr_cantidad" inputmode="numeric" value="1" oninput="calcularRoi()"></label></div>' +
  '<div class="two"><label class="f"><span>Alquiler semanal esperado (por auto)</span><input id="cr_alquiler" inputmode="decimal" value="0" oninput="calcularRoi()"></label>' +
  '<label class="f"><span>Gastos mensuales estimados (por auto)</span><input id="cr_gastos" inputmode="decimal" value="0" oninput="calcularRoi()"></label></div>' +
  '<label class="f"><span>Horizonte a proyectar <small>meses</small></span><input id="cr_meses" inputmode="numeric" value="24" oninput="calcularRoi()"></label>' +
  '<div id="cr_resultado" class="card"></div>' +
  '<div class="row" style="margin-top:14px"><button class="btn sec grow" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
  calcularRoi();
}
export function calcularRoi() {
  const el = document.getElementById('cr_resultado'); if (!el) return;
  const cantidad = Math.max(1, +val('cr_cantidad') || 1);
  const costo = (+val('cr_costo') || 0) * cantidad;
  const alquilerSemanal = (+val('cr_alquiler') || 0) * cantidad;
  const gastosMensuales = (+val('cr_gastos') || 0) * cantidad;
  const meses = +val('cr_meses') || 0;
  const fmt = n => Math.round(n).toLocaleString('es-AR');
  const ingresoMensual = alquilerSemanal * 4.33;
  const netoMensual = ingresoMensual - gastosMensuales;
  const netoProyectado = netoMensual * meses;
  const roi = costo > 0 ? (netoProyectado / costo) * 100 : null;
  const mesesRecupero = netoMensual > 0 && costo > 0 ? Math.ceil(costo / netoMensual) : null;
  el.innerHTML = (cantidad > 1 ? '<div class="row between small"><span class="muted">Inversión total (' + cantidad + ' autos)</span><b>' + fmt(costo) + '</b></div>' : '') +
  '<div class="row between small"><span class="muted">Ingreso neto mensual estimado' + (cantidad > 1 ? ' (flota)' : '') + '</span><b>' + fmt(netoMensual) + '</b></div>' +
  '<div class="row between small"><span class="muted">Ingreso neto proyectado a ' + meses + ' meses</span><b>' + fmt(netoProyectado) + '</b></div>' +
  '<div class="row between" style="margin-top:6px"><b>ROI a ' + meses + ' meses</b><b style="color:' + (roi != null && roi >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + (roi != null ? (roi >= 0 ? '+' : '') + Math.round(roi) + '%' : '—') + '</b></div>' +
  '<div class="small muted" style="margin-top:6px">' + (mesesRecupero ? 'Se recuperaría la inversión en ' + mesesRecupero + ' meses.' : 'Con estos números no se recupera la inversión en el horizonte elegido.') + '</div>';
}

export function escenarioFlotaForm() {
  const activos = activeCars().filter(c => isContract(c) && c.choferId && c.tipo !== 'financiado');
  const totalActual = activos.reduce((a, c) => a + (+c.monto || 0), 0);
  const h = '<h3>Simular un aumento general</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Aplica el % a los ' + activos.length + ' autos alquilados activos (no financiados). Monto semanal actual de la flota: ' + Math.round(totalActual).toLocaleString('es-AR') + '.</div>' +
  '<div class="two"><label class="f"><span>Aumento <small>%</small></span><input id="ef_pct" inputmode="decimal" value="10" oninput="calcularEscenarioFlota()"></label>' +
  '<label class="f"><span>Semanas a proyectar</span><input id="ef_semanas" inputmode="numeric" value="12" oninput="calcularEscenarioFlota()"></label></div>' +
  '<div id="ef_resultado" class="card"></div>' +
  '<div class="row" style="margin-top:14px"><button class="btn sec grow" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
  calcularEscenarioFlota();
}
export function calcularEscenarioFlota() {
  const el = document.getElementById('ef_resultado'); if (!el) return;
  const activos = activeCars().filter(c => isContract(c) && c.choferId && c.tipo !== 'financiado');
  const totalActual = activos.reduce((a, c) => a + (+c.monto || 0), 0);
  const pct = +val('ef_pct') || 0;
  const semanas = +val('ef_semanas') || 0;
  const totalNuevo = totalActual * (1 + pct / 100);
  const difSemanal = totalNuevo - totalActual;
  const fmt = n => Math.round(n).toLocaleString('es-AR');
  el.innerHTML = '<div class="row between small"><span class="muted">Monto semanal de la flota, nuevo</span><b>' + fmt(totalNuevo) + '</b></div>' +
  '<div class="row between small"><span class="muted">Diferencia semanal</span><b style="color:' + (difSemanal >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + (difSemanal >= 0 ? '+' : '') + fmt(difSemanal) + '</b></div>' +
  '<div class="row between" style="margin-top:6px"><b>Extra proyectado en ' + semanas + ' semanas</b><b>' + fmt(difSemanal * semanas) + '</b></div>' +
  '<div class="small muted" style="margin-top:6px">No tiene en cuenta que algún chofer no acepte el aumento y se vaya.</div>';
}
