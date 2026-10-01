// Foto o PDF de una factura/ticket: se sube, se lee con IA y se completa el
// formulario de gasto o de mantenimiento. El archivo queda adjunto al guardar.
import { S } from './state.js';
import { esc, money, fdate, iso, today } from './utils.js';
import { leerDocumento } from './ia.js';
import { subirArchivoSuelto } from './files.js';

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Busca en un <select> la opción cuyo texto se parece al nombre leído.
export function opcionParecida(sel, nombre) {
  const n = norm(nombre); if (!sel || !n) return '';
  const palabras = n.split(' ').filter(w => w.length > 3);
  const op = [...sel.options].find(o => o.value && o.value !== '__otro__' && (norm(o.textContent) === n || palabras.some(w => norm(o.textContent).split(' ').includes(w))));
  return op ? op.value : '';
}
// Sube el archivo del input, lo lee y devuelve { archivo, datos } (datos null si la IA no pudo).
export async function subirYLeerFactura(inputId, statusId) {
  const inp = document.getElementById(inputId);
  const f = inp && inp.files && inp.files[0]; if (!f) return null;
  const st = () => document.getElementById(statusId);
  const msg = (t, color) => { const el = st(); if (el) { el.innerHTML = t; el.style.color = color || 'var(--muted)'; } };
  msg('Subiendo la factura…');
  const r = await subirArchivoSuelto(f);
  if (inp) inp.value = '';
  if (!r) { msg(''); return null; }
  const archivo = { id: r.id, name: 'factura-' + iso(today()) + '.' + (r.type === 'application/pdf' ? 'pdf' : 'jpg'), cat: 'factura', type: r.type, size: r.size, fecha: iso(today()) };
  msg('📎 Factura adjunta. Leyéndola con IA…');
  const j = await leerDocumento('factura', { path: r.id });
  if (!st()) return { archivo, datos: null };
  if (!j.ok) { msg('📎 Factura adjunta. No se pudo leer con IA: ' + esc(j.error) + '. Completá los datos a mano.'); return { archivo, datos: null }; }
  return { archivo, datos: j.datos };
}
// Texto de lo leído + avisos (patente distinta, factura repetida, no parece una factura).
export function resumenFactura(d, carId, statusId) {
  const el = document.getElementById(statusId); if (!el) return;
  const c = S.cars.find(x => x.id === carId);
  const avisos = [];
  if (!d.esFactura) avisos.push('La IA no reconoce esto como una factura o ticket. Revisalo.');
  const pat = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (d.patente && c && c.patente && pat(d.patente) !== pat(c.patente)) avisos.push('La factura dice patente ' + d.patente + ' y el auto es ' + c.patente + '.');
  if (d.numero) {
    const rep = S.gastos.find(g => g.facturaNumero === d.numero && (!d.cuit || g.facturaCuit === d.cuit)) || S.mantenimientos.find(m => m.facturaNumero === d.numero && (!d.cuit || m.facturaCuit === d.cuit));
    if (rep) avisos.push('Esta factura (n° ' + d.numero + ') ya está cargada del ' + fdate(rep.fecha) + '.');
  }
  if (d.observaciones) avisos.push(d.observaciones);
  const leido = [d.total ? money(d.total) : '', d.fecha ? 'del ' + fdate(d.fecha) : '', d.proveedor ? 'de ' + d.proveedor : '', d.concepto ? '· ' + d.concepto : ''].filter(Boolean).join(' ');
  el.style.color = avisos.length ? 'var(--warn)' : 'var(--ok)';
  el.innerHTML = '✓ Leído con IA: ' + esc(leido || 'sin datos claros') + '. Revisá antes de guardar.' + avisos.map(a => '<div>⚠ ' + esc(a) + '</div>').join('');
}
