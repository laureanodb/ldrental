import { S } from '../state.js';
import { esc, money, moneyUSD, val } from '../utils.js';
import { activeCars, calc, isContract, rentabilidadAuto, estadoGeneralAuto, diasEnTaller, gastoMantenimientoAuto, driverName, plate } from '../calc.js';
import { openModal } from '../modal.js';
import { canVerFinanzas } from '../roles.js';

function selectAuto(id, sel) {
  return '<select id="' + id + '" onchange="renderComparacionAutos()"><option value="">Elegir auto…</option>' +
  activeCars().map(c => '<option value="' + c.id + '"' + (sel === c.id ? ' selected' : '') + '>' + esc(c.patente) + '</option>').join('') + '</select>';
}
function filaComparacion(label, dispA, dispB, rawA, rawB, masAlto) {
  let ganaA = false, ganaB = false;
  if (rawA != null && rawB != null && rawA !== rawB) {
    const aGana = masAlto ? rawA > rawB : rawA < rawB;
    ganaA = aGana; ganaB = !aGana;
  }
  return '<div class="row" style="padding:6px 0;border-bottom:1px solid var(--border)">' +
  '<div style="flex:1;text-align:right;padding-right:8px' + (ganaA ? ';color:var(--ok);font-weight:700' : '') + '">' + dispA + '</div>' +
  '<div style="width:120px;text-align:center" class="small muted">' + label + '</div>' +
  '<div style="flex:1;padding-left:8px' + (ganaB ? ';color:var(--ok);font-weight:700' : '') + '">' + dispB + '</div></div>';
}
export function compararAutosForm() {
  const h = '<h3>Comparar autos</h3>' +
  '<div class="two" style="margin-bottom:10px">' + selectAuto('cmp_a', '') + selectAuto('cmp_b', '') + '</div>' +
  '<div id="cmp_resultado"></div>' +
  '<div class="row" style="margin-top:14px"><button class="btn sec grow" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
  renderComparacionAutos();
}
export function renderComparacionAutos() {
  const el = document.getElementById('cmp_resultado'); if (!el) return;
  const idA = val('cmp_a'), idB = val('cmp_b');
  const a = S.cars.find(c => c.id === idA), b = S.cars.find(c => c.id === idB);
  if (!a || !b) { el.innerHTML = ''; return; }
  const estLabel = { ok: 'Todo al día', soft: 'Todo al día', warn: 'Algo pendiente', bad: 'Vencido / atención' };
  const monA = a.tipo === 'financiado' ? moneyUSD : money, monB = b.tipo === 'financiado' ? moneyUSD : money;
  let h = '<div class="row" style="padding:6px 0"><div style="flex:1;text-align:right;padding-right:8px"><b>' + plate(a.patente) + '</b></div><div style="width:120px"></div><div style="flex:1;padding-left:8px"><b>' + plate(b.patente) + '</b></div></div>';
  h += filaComparacion('Marca/modelo', esc([a.marca, a.modelo].filter(Boolean).join(' ')) || '—', esc([b.marca, b.modelo].filter(Boolean).join(' ')) || '—');
  h += filaComparacion('Chofer', a.choferId ? esc(driverName(a.choferId)) : 'Sin chofer', b.choferId ? esc(driverName(b.choferId)) : 'Sin chofer');
  h += filaComparacion('Monto semanal', isContract(a) ? monA(a.monto) : '—', isContract(b) ? monB(b.monto) : '—');
  const dA = calc(a).debt, dB = calc(b).debt;
  h += filaComparacion('Deuda actual', money(dA), money(dB), dA, dB, false);
  const kmA = +a.km || 0, kmB = +b.km || 0;
  h += filaComparacion('Kilometraje', kmA.toLocaleString('es-AR') + ' km', kmB.toLocaleString('es-AR') + ' km', kmA, kmB, false);
  const gmA = gastoMantenimientoAuto(a), gmB = gastoMantenimientoAuto(b);
  h += filaComparacion('Gasto de mantenimiento', money(gmA), money(gmB), gmA, gmB, false);
  const dtA = diasEnTaller(a), dtB = diasEnTaller(b);
  h += filaComparacion('Días en taller', dtA + '', dtB + '', dtA, dtB, false);
  h += filaComparacion('Estado general', estLabel[estadoGeneralAuto(a)], estLabel[estadoGeneralAuto(b)]);
  if (canVerFinanzas() && a.tipo !== 'financiado' && b.tipo !== 'financiado') {
    const rA = rentabilidadAuto(a), rB = rentabilidadAuto(b);
    h += filaComparacion('Rentabilidad neta', money(rA.neta), money(rB.neta), rA.neta, rB.neta, true);
  }
  el.innerHTML = h;
}
