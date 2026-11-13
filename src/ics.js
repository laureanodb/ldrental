// Pasar eventos al calendario del celular: arma un archivo .ics (el formato que entienden
// Google Calendar, el calendario del iPhone y Outlook) y lo abre para agregarlo.
// Los vencimientos van como eventos de día completo con un aviso el día anterior a las 9.
import { S } from './state.js';
import { iso, today, parse } from './utils.js';
import { VENC } from './constants.js';
import { toast } from './modal.js';
import { settings } from './settings.js';

const limpiar = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fechaIcs = f => f.replace(/-/g, '');
const siguiente = f => { const d = parse(f); d.setDate(d.getDate() + 1); return fechaIcs(iso(d)); };
const sello = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

// eventos: [{ id, titulo, fecha: 'AAAA-MM-DD', hora?: 'HH:MM', descripcion? }]
export function armarIcs(eventos) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LD Rental//Agenda//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  eventos.filter(e => e.fecha).forEach(e => {
    L.push('BEGIN:VEVENT', 'UID:' + limpiar(e.id || (e.fecha + e.titulo)).replace(/\s/g, '') + '@ldrental', 'DTSTAMP:' + sello());
    if (e.hora && /^\d{2}:\d{2}$/.test(e.hora)) {
      const ini = fechaIcs(e.fecha) + 'T' + e.hora.replace(':', '') + '00';
      const h = +e.hora.slice(0, 2) + 1;
      L.push('DTSTART:' + ini, 'DTEND:' + fechaIcs(e.fecha) + 'T' + String(Math.min(23, h)).padStart(2, '0') + e.hora.slice(3) + '00');
    } else L.push('DTSTART;VALUE=DATE:' + fechaIcs(e.fecha), 'DTEND;VALUE=DATE:' + siguiente(e.fecha));
    L.push('SUMMARY:' + limpiar(e.titulo));
    if (e.descripcion) L.push('DESCRIPTION:' + limpiar(e.descripcion));
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + limpiar(e.titulo), e.hora ? 'TRIGGER:-PT2H' : 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}
export function descargarIcs(eventos, nombre) {
  const E = eventos.filter(e => e.fecha);
  if (!E.length) { toast('No hay nada para agregar'); return; }
  const blob = new Blob([armarIcs(E)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = (nombre || 'ldrental') + '.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast(E.length === 1 ? 'Abrí el archivo para agregarlo al calendario' : 'Abrí el archivo para agregar los ' + E.length + ' eventos al calendario');
}

// Vencimientos de los próximos días (papeles de autos, licencias y antecedentes).
export function vencimientosProximos(dias = 90) {
  const hoy = iso(today()), lim = (() => { const d = today(); d.setDate(d.getDate() + dias); return iso(d); })();
  const out = [];
  S.cars.filter(c => !c.vendido).forEach(c => VENC.forEach(([k, l]) => {
    if (c[k] && c[k] >= hoy && c[k] <= lim) out.push({ id: 'venc-' + c.id + '-' + k + '-' + c[k], titulo: 'Vence ' + l + ' · ' + (c.patente || ''), fecha: c[k], descripcion: (settings.companyName || 'LD Rental') + ': renovar ' + l + ' del ' + (c.patente || 'auto') });
  }));
  S.drivers.filter(d => !d.inactivo && !d.prospecto).forEach(d => {
    if (d.licVenc && d.licVenc >= hoy && d.licVenc <= lim) out.push({ id: 'lic-' + d.id + '-' + d.licVenc, titulo: 'Vence la licencia de ' + d.nombre, fecha: d.licVenc });
    if (d.antecedentesVenc && d.antecedentesVenc >= hoy && d.antecedentesVenc <= lim) out.push({ id: 'ant-' + d.id + '-' + d.antecedentesVenc, titulo: 'Vencen los antecedentes de ' + d.nombre, fecha: d.antecedentesVenc });
  });
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
export function vencimientosAlCalendario() { descargarIcs(vencimientosProximos(90), 'vencimientos-ldrental'); }
