import { val, uid, esc, money } from '../utils.js';
import { save } from '../data.js';
import { carById, repartoSocios } from '../calc.js';
import { openModal, closeModal, toast } from '../modal.js';
import { settings } from '../settings.js';
import { canDelete } from '../roles.js';
import { carForm } from './car.js';

export function socioForm(carId) {
  const c = carById(carId);
  if (!c) { toast('Auto no encontrado'); return; }
  const h = '<h3>Agregar socio inversor — ' + esc(c.patente) + '</h3>' +
  '<div class="small muted" style="margin-bottom:12px">El % se calcula sobre la rentabilidad neta acumulada del auto (cobrado menos gastos). No aplica a autos financiados.</div>' +
  '<label class="f"><span>Nombre</span><input id="sc_nombre"></label>' +
  '<label class="f"><span>Participación <small>%</small></span><input id="sc_pct" inputmode="decimal"></label>' +
  '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="guardarSocio(\'' + c.id + '\')">Guardar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function guardarSocio(carId) {
  const nombre = val('sc_nombre');
  const pct = +val('sc_pct') || 0;
  if (!nombre) { toast('Poné el nombre del socio'); return; }
  if (!pct || pct <= 0 || pct > 100) { toast('Poné un porcentaje entre 1 y 100'); return; }
  const c = carById(carId); if (!c) return;
  const socios = (c.socios || []).concat([{ id: uid(), nombre, pct }]);
  if (await save('cars', Object.assign({}, c, { socios }))) { closeModal(); toast('Socio agregado'); }
}
export async function borrarSocio(carId, socioId) {
  const c = carById(carId); if (!c) return;
  const socios = (c.socios || []).filter(x => x.id !== socioId);
  if (await save('cars', Object.assign({}, c, { socios }))) { toast('Socio quitado'); carForm(carId); }
}
export async function reporteSocios(carId) {
  const c = carById(carId);
  const r = c && repartoSocios(c);
  if (!r) { toast('No hay reparto para mostrar'); return; }
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 15; let y = 20;
    doc.setFontSize(15); doc.text(settings.companyName || 'LD Rental', margin, y); y += 8;
    doc.setFontSize(12); doc.text('Reparto de socios — ' + (c.patente || ''), margin, y); y += 10;
    doc.setFontSize(10);
    doc.text('Rentabilidad neta acumulada: ' + Math.round(r.neta).toLocaleString('es-AR'), margin, y); y += 8;
    r.socios.forEach(s => {
      doc.text(s.nombre + ' (' + s.pct + '%)', margin, y);
      doc.text(Math.round(s.monto).toLocaleString('es-AR'), margin + 130, y);
      y += 7;
    });
    if (r.sinAsignarPct > 0) { y += 2; doc.setTextColor(140); doc.text('Sin asignar: ' + r.sinAsignarPct + '%', margin, y); doc.setTextColor(0); }
    doc.save('reparto-socios-' + (c.patente || 'auto') + '.pdf');
    toast('Reporte generado');
  } catch (e) {
    toast('No se pudo generar el reporte: ' + ((e && e.message) || 'error'));
  }
}
export function seccionSocios(c) {
  const r = repartoSocios(c);
  let h = '<div class="sec-t">Socios inversores</div>';
  const socios = c.socios || [];
  if (!socios.length) {
    h += '<div class="small muted" style="margin-bottom:8px">Sin socios cargados en este auto.</div>';
  } else if (!r) {
    h += '<div class="small muted" style="margin-bottom:8px">' + (c.tipo === 'financiado' ? 'No aplica a autos financiados.' : 'Sin datos de rentabilidad todavía.') + '</div>';
  } else {
    h += r.socios.map(s => '<div class="card row between small"><span>' + esc(s.nombre) + ' (' + s.pct + '%)</span><span class="row" style="gap:8px"><b style="color:' + (s.monto >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(s.monto) + '</b>' + (canDelete() ? '<button class="btn danger sm" onclick="confirmDel(this,()=>borrarSocio(\'' + c.id + '\',\'' + s.id + '\'))">Quitar</button>' : '') + '</span></div>').join('');
    if (r.sinAsignarPct > 0) h += '<div class="small muted" style="margin:4px 0 8px">Sin asignar: ' + r.sinAsignarPct + '%</div>';
  }
  h += '<div class="row" style="margin:8px 0 20px"><button class="btn sec grow" onclick="socioForm(\'' + c.id + '\')">+ Agregar socio</button>' +
    (socios.length ? '<button class="btn sec" onclick="reporteSocios(\'' + c.id + '\')">Reporte PDF</button>' : '') + '</div>';
  return h;
}
