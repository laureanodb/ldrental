import { $, esc, money, moneyUSD, fdate } from '../utils.js';
import { S } from '../state.js';
import { openModal } from '../modal.js';
import { plate, driverName, carById, alertaService, driverDebt, kmUltimaSemana } from '../calc.js';
import { TIPOS_INFRACCION, TIPOS_SINIESTRO } from '../constants.js';
import { settings } from '../settings.js';

const FILTROS_INTELIGENTES = [
  { re: /sin service|service vencido|necesitan? service/, label: 'Autos con service vencido', run: () => S.cars.filter(c => !c.vendido && alertaService(c) && alertaService(c).cls === 'bad') },
  { re: /con deuda|deben|deudor/, label: 'Choferes con deuda', run: () => S.drivers.filter(d => !d.prospecto && driverDebt(d.id) > 0) },
  { re: /sin chofer|disponible/, label: 'Autos sin chofer asignado', run: () => S.cars.filter(c => !c.vendido && !c.choferId) },
  { re: /en taller/, label: 'Autos en el taller', run: () => S.cars.filter(c => !c.vendido && c.tipo === 'taller') },
  { re: /sobrekilometraje|exceso de km|mucho km/, label: 'Autos con sobrekilometraje', run: () => S.cars.filter(c => !c.vendido && (kmUltimaSemana(c) || 0) > settings.kmSemanaEsperado) },
];
function filtroInteligente(q) {
  const f = FILTROS_INTELIGENTES.find(x => x.re.test(q));
  if (!f) return null;
  return { label: f.label, items: f.run() };
}

export function searchView() {
  const h = '<h3>Buscar</h3><input id="sr_q" type="search" placeholder="Patente, marca, chofer, DNI... o: sin service, con deuda, en taller" oninput="doSearch()"><div id="sr_results" style="margin-top:12px"></div>';
  openModal(h);
  setTimeout(() => { const el = $('#sr_q'); if (el) el.focus(); }, 50);
}
export function doSearch() {
  const input = $('#sr_q'), el = $('#sr_results');
  if (!input || !el) return;
  const q = input.value.trim().toLowerCase();
  if (!q) { el.innerHTML = ''; return; }
  const smart = filtroInteligente(q);
  if (smart) {
    const rows = smart.items;
    const esChofer = rows.length && rows[0].nombre !== undefined;
    el.innerHTML = '<div class="sec-t">' + smart.label + ' (' + rows.length + ')</div>' +
      (rows.length ? rows.map(x => esChofer ?
        '<div class="card tap" onclick="driverForm(\'' + x.id + '\')">' + esc(x.nombre) + (driverDebt(x.id) ? ' <span class="small" style="color:var(--bad)">' + money(driverDebt(x.id)) + '</span>' : '') + '</div>' :
        '<div class="card tap" onclick="carForm(\'' + x.id + '\')">' + plate(x.patente) + ' <span class="small muted">' + esc([x.marca, x.modelo].filter(Boolean).join(' ')) + '</span></div>'
      ).join('') : '<div class="small muted">Nada coincide con este filtro ahora.</div>');
    return;
  }
  const qDigits = q.replace(/\D/g, '');
  const autos = S.cars.filter(c => [c.patente, c.marca, c.modelo, driverName(c.choferId)].join(' ').toLowerCase().includes(q)).slice(0, 8);
  const choferes = S.drivers.filter(d => [d.nombre, d.dni, d.tel].join(' ').toLowerCase().includes(q) ||
    (qDigits && String(d.tel || '').replace(/\D/g, '').includes(qDigits))).slice(0, 8);
  const cobros = S.payments.filter(p => { const c = carById(p.carId); return c && [c.patente, driverName(p.choferId), p.nota].join(' ').toLowerCase().includes(q); }).slice(0, 8);
  const tipoLabel = k => (TIPOS_INFRACCION.find(x => x[0] === k) || [0, ''])[1];
  const multas = S.multas.filter(m => { const c = carById(m.carId); return [c && c.patente, driverName(m.choferId), m.numeroActa, tipoLabel(m.tipoInfraccion), m.organismo].join(' ').toLowerCase().includes(q); }).slice(0, 8);
  const tipoSinLabel = k => (TIPOS_SINIESTRO.find(x => x[0] === k) || [0, ''])[1];
  const siniestros = S.siniestros.filter(s => { const c = carById(s.carId); return [c && c.patente, driverName(s.choferId), tipoSinLabel(s.tipo), s.lugar, s.descripcion].join(' ').toLowerCase().includes(q); }).slice(0, 8);
  let h = '';
  if (autos.length) h += '<div class="sec-t">Autos</div>' + autos.map(c => '<div class="card row between"><div class="grow tap" onclick="carForm(\'' + c.id + '\')">' + plate(c.patente) + ' <span class="small muted">' + esc([c.marca, c.modelo].filter(Boolean).join(' ')) + '</span></div>' + (c.choferId ? '<button class="btn sec sm" onclick="closeModal();payForm(\'' + c.id + '\')">Cobrar</button>' : '') + '</div>').join('');
  if (choferes.length) h += '<div class="sec-t">Choferes</div>' + choferes.map(d => '<div class="card row between"><div class="grow tap" onclick="driverForm(\'' + d.id + '\')">' + esc(d.nombre) + '</div>' + (d.tel ? '<a class="btn sec sm" target="_blank" href="https://wa.me/' + encodeURIComponent(String(d.tel).replace(/[^\d+]/g, '')) + '">WhatsApp</a>' : '') + '</div>').join('');
  if (cobros.length) h += '<div class="sec-t">Cobros</div>' + cobros.map(p => { const c = carById(p.carId); return '<div class="card tap" onclick="carForm(\'' + c.id + '\')">' + (p.tipo === 'cuota' ? moneyUSD(p.monto) : money(p.monto)) + ' <span class="small muted">' + fdate(p.fecha) + ' · ' + esc(c.patente) + '</span></div>'; }).join('');
  if (multas.length) h += '<div class="sec-t">Multas</div>' + multas.map(m => { const c = carById(m.carId); return '<div class="card tap" onclick="multaForm(\'' + m.carId + '\',\'' + m.id + '\')">' + money(m.monto) + ' <span class="small muted">' + fdate(m.fecha) + ' · ' + esc(c ? c.patente : '') + '</span></div>'; }).join('');
  if (siniestros.length) h += '<div class="sec-t">Siniestros</div>' + siniestros.map(s => { const c = carById(s.carId); return '<div class="card tap" onclick="siniestroForm(\'' + s.carId + '\',\'' + s.id + '\')">' + esc(tipoSinLabel(s.tipo)) + ' <span class="small muted">' + fdate(s.fecha) + ' · ' + esc(c ? c.patente : '') + '</span></div>'; }).join('');
  el.innerHTML = h || '<div class="small muted">Sin resultados.</div>';
}
