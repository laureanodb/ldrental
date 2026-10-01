// Simulador de financiación de un auto en cuotas semanales. Los plazos se
// eligen (6 meses a 5 años, o cualquier cantidad de meses) y cada uno tiene su
// tasa anual en dólares. Se calcula con interés sobre saldo (sistema francés);
// la cuota se redondea al dólar para arriba y el total es cuota × semanas.
import { S } from '../state.js';
import { $, val, esc, moneyUSD, money, iso, today } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { settings, saveSettings } from '../settings.js';
import { cotizacion, enPesos, textoCotizacion } from '../dolar.js';

const PRESETS = [6, 12, 18, 24, 30, 36, 42, 48, 60];
const PLAZOS_DEFAULT = [{ meses: 12, tasa: 25 }, { meses: 24, tasa: 28 }, { meses: 36, tasa: 32 }, { meses: 48, tasa: 36 }];
export const semanasDe = meses => Math.round(meses * 52 / 12);
export const etiquetaPlazo = meses => (meses % 12 === 0 ? (meses / 12) + (meses === 12 ? ' año' : ' años') : meses + ' meses');
// Plazos activos con su tasa; se recuerdan entre usos.
let plazos = null;
function plazosGuardados() {
  if (Array.isArray(settings.simPlazos) && settings.simPlazos.length) return settings.simPlazos.map(x => ({ meses: +x.meses, tasa: +x.tasa || 0 }));
  if (Array.isArray(settings.simTasas) && settings.simTasas.length === 4) return PLAZOS_DEFAULT.map((x, i) => ({ meses: x.meses, tasa: +settings.simTasas[i] || x.tasa }));
  return PLAZOS_DEFAULT.map(x => Object.assign({}, x));
}
export function cuotaSemanal(capital, tasaAnual, semanas) {
  if (capital <= 0 || semanas <= 0) return 0;
  const r = (+tasaAnual || 0) / 100 / 52;
  const exacta = r ? capital * r / (1 - Math.pow(1 + r, -semanas)) : capital / semanas;
  return Math.ceil(exacta - 1e-9);
}
export function simular({ precio, anticipo, gastos, plazos: P }) {
  const capital = Math.max(0, (+precio || 0) + (+gastos || 0) - (+anticipo || 0));
  return P.map(({ meses, tasa }) => {
    const semanas = semanasDe(meses);
    const cuota = cuotaSemanal(capital, tasa, semanas);
    const totalCuotas = cuota * semanas;
    const total = totalCuotas + (+anticipo || 0);
    const ganancia = totalCuotas - capital;
    return { meses, semanas, label: etiquetaPlazo(meses), tasa: +tasa || 0, cuota, mensual: Math.round(cuota * 52 / 12), totalCuotas, total, ganancia, recargoPct: precio ? Math.round((total - (+precio || 0) - (+gastos || 0)) / (+precio) * 100) : 0 };
  });
}

let simCarId = '';
export function simuladorFinanciacionForm(carId) {
  simCarId = carId || '';
  const c = carId ? S.cars.find(x => x.id === carId) : null;
  plazos = plazosGuardados();
  const autos = S.cars.filter(x => !x.vendido).slice().sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  const h = '<h3>Simulador de financiación</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Cuotas semanales en dólares, con interés sobre saldo. Cambiá la tasa de cada plazo y mirá cómo queda la cuota.</div>' +
    '<label class="f"><span>Auto <small>opcional</small></span><select id="sf_car" onchange="simuladorElegirAuto(this.value)"><option value="">Sin elegir</option>' +
      autos.map(x => '<option value="' + x.id + '"' + (x.id === simCarId ? ' selected' : '') + '>' + esc(x.patente) + (x.marca || x.modelo ? ' · ' + esc([x.marca, x.modelo, x.anio].filter(Boolean).join(' ')) : '') + '</option>').join('') + '</select></label>' +
    '<div class="two"><label class="f"><span>Precio del auto (US$)</span><input id="sf_precio" inputmode="decimal" value="' + esc(c ? (c.valorMercado || c.costoCompra || '') : '') + '" oninput="simuladorCalcular()"></label>' +
    '<label class="f"><span>Anticipo (US$)</span><input id="sf_anticipo" inputmode="decimal" value="0" oninput="simuladorCalcular()"></label></div>' +
    '<label class="f"><span>Gastos que se suman a la financiación (US$) <small>opcional: transferencia, gestoría…</small></span><input id="sf_gastos" inputmode="decimal" value="0" oninput="simuladorCalcular()"></label>' +
    '<div class="sec-t">Plazos y tasa anual en dólares</div><div id="sf_plazos"></div>' +
    '<div id="sf_res"></div>' +
    '<div class="row" style="margin-top:12px"><button class="btn sec grow" onclick="simuladorCompartir()">Mandar por WhatsApp</button><button class="btn sec grow" onclick="simuladorPDF()">PDF</button></div>' +
    '<button class="btn sec block" style="margin-top:8px" onclick="closeModal()">Cerrar</button>';
  openModal(h);
  renderPlazos();
  simuladorCalcular();
}
function renderPlazos() {
  const el = document.getElementById('sf_plazos'); if (!el) return;
  plazos.sort((a, b) => a.meses - b.meses);
  const activos = plazos.map(x => x.meses);
  el.innerHTML = '<div class="small muted" style="margin-bottom:6px">Tocá los plazos que querés comparar (en meses).</div>' +
    '<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:8px">' + PRESETS.map(m => '<button type="button" class="btn sm' + (activos.includes(m) ? '' : ' sec') + '" onclick="simuladorTogglePlazo(' + m + ')">' + m + '</button>').join('') + '</div>' +
    '<div class="row" style="gap:6px;align-items:flex-end;margin-bottom:8px"><label class="f" style="flex:1;margin:0"><span>Otro plazo <small>meses</small></span><input id="sf_otro" inputmode="numeric" placeholder="ej: 15"></label><button type="button" class="btn sec" onclick="simuladorAgregarPlazo()">Agregar</button></div>' +
    (plazos.length ? '<div class="grid" style="grid-template-columns:1fr 1fr 1fr">' + plazos.map(x => '<label class="f" style="margin:0"><span>' + etiquetaPlazo(x.meses) + ' <small>%</small></span><input id="sf_tasa_' + x.meses + '" inputmode="decimal" value="' + x.tasa + '" oninput="simuladorCalcular()"></label>').join('') + '</div>' : '');
}
function tasaSugerida(meses) {
  if (!plazos.length) return 25;
  const cerca = plazos.slice().sort((a, b) => Math.abs(a.meses - meses) - Math.abs(b.meses - meses))[0];
  return cerca.tasa;
}
function leerTasas() { plazos.forEach(x => { const el = document.getElementById('sf_tasa_' + x.meses); if (el) x.tasa = +el.value || 0; }); }
export function simuladorTogglePlazo(meses) {
  leerTasas();
  if (plazos.some(x => x.meses === meses)) {
    if (plazos.length === 1) { toast('Dejá al menos un plazo'); return; }
    plazos = plazos.filter(x => x.meses !== meses);
  } else {
    if (plazos.length >= 9) { toast('Máximo 9 plazos a la vez'); return; }
    plazos.push({ meses, tasa: tasaSugerida(meses) });
  }
  renderPlazos(); simuladorCalcular();
}
export function simuladorAgregarPlazo() {
  const m = Math.round(+val('sf_otro'));
  if (!m || m < 1 || m > 120) { toast('Poné un plazo entre 1 y 120 meses'); return; }
  if (plazos.some(x => x.meses === m)) { toast('Ese plazo ya está'); return; }
  simuladorTogglePlazo(m);
}
export function simuladorElegirAuto(id) {
  simCarId = id;
  const c = S.cars.find(x => x.id === id);
  if (c && (c.valorMercado || c.costoCompra)) $('#sf_precio').value = c.valorMercado || c.costoCompra;
  simuladorCalcular();
}
function leerEntradas() {
  leerTasas();
  return { precio: +val('sf_precio') || 0, anticipo: +val('sf_anticipo') || 0, gastos: +val('sf_gastos') || 0, plazos: plazos.map(x => Object.assign({}, x)) };
}
export function simuladorCalcular() {
  const el = document.getElementById('sf_res'); if (!el) return;
  const e = leerEntradas();
  if (!e.precio) { el.innerHTML = '<div class="card empty" style="margin-top:10px">Poné el precio del auto.</div>'; return; }
  if (e.anticipo >= e.precio + e.gastos) { el.innerHTML = '<div class="card empty" style="margin-top:10px">El anticipo cubre todo el precio: no hay nada que financiar.</div>'; return; }
  saveSettings({ simPlazos: e.plazos });
  const R = simular(e);
  const cot = cotizacion();
  const linea = (l, v, color) => '<div class="row between small"><span class="muted">' + l + '</span><span' + (color ? ' style="color:' + color + '"' : '') + '>' + v + '</span></div>';
  el.innerHTML = '<div class="grid" style="margin-top:10px">' + R.map((r, i) => '<div class="card" style="margin:0">' +
      '<b>' + r.label + '</b><div class="small muted">' + r.semanas + ' semanas · tasa ' + r.tasa + '%</div>' +
      '<div style="font-size:22px;font-weight:700;margin:4px 0 0">' + moneyUSD(r.cuota) + '<span class="small muted" style="font-weight:400"> /sem</span></div>' +
      (cot ? '<div class="small muted" style="margin-bottom:4px">≈ ' + money(enPesos(r.cuota)) + '</div>' : '') +
      linea('Por mes', moneyUSD(r.mensual)) + linea('Total', moneyUSD(r.total)) + linea('Ganancia', moneyUSD(r.ganancia), 'var(--ok)') + linea('Recargo', r.recargoPct + '%') +
      '<button class="btn sm block" style="margin-top:8px" onclick="simuladorUsar(' + i + ')">Usar este plan</button></div>').join('') + '</div>' +
    '<div class="small muted" style="margin-top:6px">Total que paga = anticipo + cuotas. Ganancia = intereses sobre lo financiado.' + (cot ? ' Pesos al ' + esc(textoCotizacion()) + '.' : '') + '</div>';
}
function textoSimulacion() {
  const e = leerEntradas();
  const R = simular(e);
  const c = S.cars.find(x => x.id === simCarId);
  const cot = cotizacion();
  return (settings.companyName || 'LD Rental') + ' — Financiación' + (c ? ' del ' + [c.marca, c.modelo, c.anio].filter(Boolean).join(' ') + (c.patente ? ' (' + c.patente + ')' : '') : '') + '\n' +
    'Precio: ' + moneyUSD(e.precio) + (e.anticipo ? ' · Anticipo: ' + moneyUSD(e.anticipo) : '') + '\n\n' +
    R.map(r => '• ' + r.label + ': ' + r.semanas + ' cuotas semanales de ' + moneyUSD(r.cuota) + (cot ? ' (≈ ' + money(enPesos(r.cuota)) + ')' : '') + ' — total ' + moneyUSD(r.total)).join('\n') +
    '\n\nCuotas en dólares' + (cot ? '; los pesos son al dólar de hoy y pueden cambiar' : '') + '. Simulación del ' + iso(today()).split('-').reverse().join('/') + ', sujeta a aprobación.';
}
export function simuladorCompartir() {
  if (!(+val('sf_precio'))) { toast('Poné el precio del auto'); return; }
  window.open('https://wa.me/?text=' + encodeURIComponent(textoSimulacion()), '_blank');
}
export async function simuladorPDF() {
  if (!(+val('sf_precio'))) { toast('Poné el precio del auto'); return; }
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const e = leerEntradas(); const R = simular(e);
    const c = S.cars.find(x => x.id === simCarId);
    const cot = cotizacion();
    const mg = 15; let y = 20;
    doc.setFontSize(15); doc.text(settings.companyName || 'LD Rental', mg, y); y += 8;
    doc.setFontSize(12); doc.text('Simulación de financiación', mg, y); y += 7;
    doc.setFontSize(10);
    if (c) { doc.text('Auto: ' + [c.marca, c.modelo, c.anio].filter(Boolean).join(' ') + (c.patente ? ' — ' + c.patente : ''), mg, y); y += 6; }
    doc.text('Precio: ' + moneyUSD(e.precio) + (e.anticipo ? '   Anticipo: ' + moneyUSD(e.anticipo) : '') + (e.gastos ? '   Gastos: ' + moneyUSD(e.gastos) : ''), mg, y); y += 10;
    const cols = [mg, mg + 30, mg + 55, mg + 85, mg + 120, mg + 150];
    doc.setFont(undefined, 'bold');
    ['Plazo', 'Semanas', 'Cuota semanal', cot ? '≈ en pesos' : '', 'Total a pagar', ''].forEach((t, i) => t && doc.text(t, cols[i], y));
    doc.setFont(undefined, 'normal'); y += 3; doc.setDrawColor(200); doc.line(mg, y, 195, y); y += 6;
    R.forEach(r => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(r.label, cols[0], y); doc.text(String(r.semanas), cols[1], y); doc.text(moneyUSD(r.cuota), cols[2], y);
      if (cot) doc.text(money(enPesos(r.cuota)), cols[3], y);
      doc.text(moneyUSD(r.total), cols[4], y); y += 7;
    });
    y += 4; doc.setFontSize(8); doc.setTextColor(120);
    doc.text(doc.splitTextToSize('Cuotas semanales en dólares.' + (cot ? ' Los montos en pesos son al ' + textoCotizacion() + ' del ' + iso(today()).split('-').reverse().join('/') + ' y pueden variar.' : '') + ' Simulación sujeta a aprobación.', 180), mg, y);
    doc.save('simulacion-financiacion' + (c && c.patente ? '-' + c.patente : '') + '-' + iso(today()) + '.pdf');
  } catch (err) {
    toast('No se pudo generar el PDF: ' + ((err && err.message) || 'error'));
  }
}
// Pasa el plan elegido a la ficha del auto (tipo financiado). El usuario elige el chofer y guarda.
export function simuladorUsar(i) {
  const e = leerEntradas(); const r = simular(e)[i];
  if (!r || !r.cuota) return;
  if (!simCarId) { toast('Elegí el auto arriba para pasarle el plan'); return; }
  window.carForm(simCarId); window.setTabAuto('contrato');
  const tipo = document.getElementById('c_tipo');
  if (tipo) { tipo.value = 'financiado'; window.onTipo(tipo); }
  const poner = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.style.outline = '2px solid var(--ok)'; } };
  poner('c_total', r.totalCuotas); poner('c_cuotas', r.semanas); poner('c_anticipo', e.anticipo || '');
  poner('c_monto', r.cuota); const m = document.getElementById('c_monto'); if (m) m.dataset.touched = 1;
  toast('Plan de ' + r.label + ' cargado: elegí el chofer, revisá la fecha de inicio y tocá Guardar');
}
