// Cargar un auto desde el título del automotor (o la cédula): la IA lee la foto o el PDF
// y completa el formulario abierto. No guarda: marca en verde lo que completó para que
// el usuario lo revise. Al guardar el auto, el archivo queda en sus papeles como "Título".
import { S } from '../state.js';
import { esc, fdate, iso, today } from '../utils.js';
import { leerDocumento, archivoADataUrl } from '../ia.js';
import { subirArchivoSuelto, patchDoc } from '../files.js';
import { settings } from '../settings.js';

let pendiente = null; // { file, carId, cat, extra }

const soloLetras = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const normal = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// AB123CD → "AB 123 CD"; ABC123 → "ABC 123".
export function formatoPatente(p) {
  const s = soloLetras(p);
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(s)) return s.slice(0, 2) + ' ' + s.slice(2, 5) + ' ' + s.slice(5);
  if (/^[A-Z]{3}\d{3}$/.test(s)) return s.slice(0, 3) + ' ' + s.slice(3);
  return s;
}
// Cilindrada en litros: "1,6", "1.6 L", "1600 cc" o "1598" → "1.6". Si no se entiende, queda como se escribió.
export function normalizarCilindrada(v) {
  const t = String(v || '').trim();
  const m = t.replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*(l|lts?|litros?|cc|cm3|c\.c\.)?$/i);
  if (!m) return t.slice(0, 20);
  const n = +m[1];
  if (n >= 50) return (Math.round(n / 100) / 10).toFixed(1);
  return n > 0 && n < 10 ? n.toFixed(1) : t;
}
// "Gol Trend 1.6 Trendline" → "1.6".
const cilindradaDelModelo = modelo => { const m = String(modelo || '').match(/(?:^|\s)(\d[.,]\d)(?=\s|$|[a-z])/i); return m ? normalizarCilindrada(m[1]) : ''; };
// ¿El titular es la empresa? (para no llenar "Titular registral, si no es la empresa").
function esLaEmpresa(nombre) {
  const n = normal(nombre);
  return [settings.companyName, settings.pagoTitular].map(normal).filter(x => x.length >= 3).some(e => n.includes(e) || e.includes(n));
}

// pre: prefijo de los campos del formulario ('c' en la ficha del auto, 'nr' en el alta rápida).
export function botonTituloAuto(c, pre = 'c') {
  return '<label class="btn sec block filebtn" style="margin-bottom:6px">✨ ' + (c && c.id ? 'Completar con el título (foto o PDF)' : 'Cargar desde el título (foto o PDF)') +
    '<input id="titulo_file" type="file" accept="image/*,application/pdf" onchange="leerTituloAuto(\'' + esc((c && c.id) || '') + '\',\'' + pre + '\')"></label>' +
    '<div id="tituloStatus" class="small muted" style="margin-bottom:10px">' + (c && c.id ? '' : 'Sirve el título del automotor o la cédula. La IA completa los datos y vos revisás antes de guardar.') + '</div>';
}

export async function leerTituloAuto(carId, pre = 'c') {
  const inp = document.getElementById('titulo_file'); const f = inp && inp.files && inp.files[0]; if (!f) return;
  const msg = (t, color) => { const el = document.getElementById('tituloStatus'); if (el) { el.innerHTML = t; el.style.color = color || 'var(--muted)'; } };
  if (f.size > 10e6) { msg('El archivo es muy pesado (máximo 10 MB). Probá con una foto.', 'var(--bad)'); return; }
  msg('Leyendo el documento con IA…');
  let archivo;
  try { archivo = await archivoADataUrl(f); } catch (e) { msg('No se pudo abrir el archivo.', 'var(--bad)'); return; }
  inp.value = '';
  const j = await leerDocumento('titulo', { archivo });
  if (!document.getElementById('tituloStatus')) return;
  if (!j.ok) { msg('No se pudo leer con IA: ' + esc(j.error) + '.', 'var(--bad)'); return; }
  const d = j.datos;
  if (!d.esTitulo) { msg('La IA no reconoce un título ni una cédula de auto en ese archivo.' + (d.observaciones ? ' ' + esc(d.observaciones) : ''), 'var(--bad)'); return; }

  const cambios = [], avisos = [];
  const poner = (id, valor, etiqueta, soloSiVacio, mostrar) => {
    const el = document.getElementById(pre + '_' + id);
    if (!el || el.disabled || valor === '' || valor == null || valor === 0) return;
    if (String(el.value).trim() === String(valor)) return;
    if (soloSiVacio && String(el.value).trim()) return;
    el.value = valor; el.dispatchEvent(new Event('change'));
    el.style.outline = '2px solid var(--ok)';
    cambios.push(etiqueta + ': ' + (mostrar || valor));
  };
  const campoPat = (document.getElementById(pre + '_patente') || {}).value || '';
  if (d.patente && soloLetras(campoPat) && soloLetras(campoPat) !== d.patente) {
    msg('⚠ La patente del documento (' + esc(formatoPatente(d.patente)) + ') no es la de este auto (' + esc(campoPat) + '). No cambié nada: revisá que sea el título correcto.', 'var(--warn)');
    return;
  }
  poner('patente', formatoPatente(d.patente), 'Patente');
  const otro = d.patente && S.cars.find(x => x.id !== carId && soloLetras(x.patente) === d.patente);
  if (otro) avisos.push('Ya tenés un auto con la patente ' + otro.patente + '. Si es el mismo, cerrá esto y abrí su ficha.');
  poner('marca', d.marca, 'Marca');
  poner('modelo', d.modelo, 'Modelo');
  poner('anio', d.anio, 'Año');
  poner('cilindrada', cilindradaDelModelo(d.modelo), 'Cilindrada', true);
  const ajenos = d.titulares.filter(t => !esLaEmpresa(t.nombre));
  const titular = ajenos.map(t => t.nombre + (t.porcentaje && t.porcentaje < 100 ? ' (' + t.porcentaje + '%)' : '')).join(' y ');
  const fechaCompra = d.fechaInscripcion && d.tipoDocumento === 'titulo' ? d.fechaInscripcion : '';
  // En el alta rápida estos campos no están en pantalla: se guardan igual al crear el auto.
  const extra = {};
  const ponerOGuardar = (id, valor, etiqueta, soloSiVacio, mostrar) => {
    if (!valor) return;
    if (document.getElementById(pre + '_' + id)) poner(id, valor, etiqueta, soloSiVacio, mostrar);
    else { extra[id] = valor; cambios.push(etiqueta + ': ' + (mostrar || valor)); }
  };
  ponerOGuardar('numeroMotor', d.numeroMotor, 'Motor');
  ponerOGuardar('vin', d.numeroChasis, 'Chasis');
  ponerOGuardar('combustible', d.combustible, 'Combustible', true);
  ponerOGuardar('titularRegistral', titular, 'Titular', true);
  ponerOGuardar('fechaCompra', fechaCompra, 'Fecha de compra (la de inscripción del título)', true, fdate(fechaCompra));
  if (d.observaciones) avisos.push(d.observaciones);

  pendiente = { file: f, carId: carId || '', cat: d.tipoDocumento === 'cedula' ? 'cedula' : 'titulo', extra };
  const nombreDoc = d.tipoDocumento === 'cedula' ? 'la cédula' : 'el título';
  const av = avisos.map(a => '<div style="color:var(--warn)">⚠ ' + esc(a) + '</div>').join('');
  const info = (d.tipoVehiculo ? ' Tipo: ' + esc(d.tipoVehiculo) + '.' : '') + (d.fechaInscripcion && !fechaCompra ? ' Inscripto el ' + fdate(d.fechaInscripcion) + '.' : '');
  msg((cambios.length ? '✓ Completé con IA (marcado en verde): ' + esc(cambios.join(' · ')) + '.' : '✓ La IA leyó ' + nombreDoc + ' y los datos ya coinciden con la ficha.') + info +
    ' Revisá y tocá <b>' + (pre === 'nr' ? 'Crear auto' : 'Guardar') + '</b>: ' + nombreDoc + ' queda en los papeles del auto.' + av, 'var(--ok)');
}

// Después de guardar el auto: sube el archivo leído y lo agrega a sus papeles.
export async function adjuntarTituloPendiente(car) {
  const p = pendiente; pendiente = null;
  if (!p || !car || (p.carId && p.carId !== car.id)) return;
  if ((car.files || []).some(x => x.cat === p.cat && x.name === p.file.name && x.fecha === iso(today()))) return;
  const r = await subirArchivoSuelto(p.file);
  if (!r) return;
  const cur = S.cars.find(x => x.id === car.id) || car;
  await patchDoc('cars', car.id, { files: (cur.files || []).concat([{ id: r.id, name: p.file.name || (p.cat + '-' + iso(today()) + '.jpg'), cat: p.cat, type: r.type, size: r.size, fecha: iso(today()) }]) });
}
export const descartarTituloPendiente = () => { pendiente = null; };
// Datos del título que no entraron en el formulario (alta rápida).
export const datosTituloPendiente = () => (pendiente && !pendiente.carId ? Object.assign({}, pendiente.extra) : {});
