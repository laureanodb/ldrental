import { val } from '../utils.js';
import { openModal } from '../modal.js';

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
