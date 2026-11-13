// Denuncia de siniestro para la aseguradora, armada con los datos que ya están en la app
// (auto, póliza, chofer, siniestro y tercero) más lo que falte: hora, heridos, testigos y
// denuncia policial. Sale como PDF o como texto para pegar en la web o el WhatsApp del seguro.
import { esc, iso, today, fdate } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de } from '../memo.js';
import { settings } from '../settings.js';
import { TIPOS_SINIESTRO, COBERTURAS_SEGURO } from '../constants.js';

const v = id => ((document.getElementById(id) || {}).value || '').trim();
const CAMPOS = [
  ['hora', 'Hora aproximada', 'ej: 22:30'], ['direccion', 'Calle, altura y localidad', ''], ['heridos', 'Heridos', 'ej: no hubo / el tercero fue al hospital'],
  ['terceroDni', 'DNI o registro del tercero', ''], ['terceroAuto', 'Auto del tercero (marca y modelo)', ''], ['terceroPoliza', 'Póliza del tercero', ''],
  ['testigos', 'Testigos (nombre y teléfono)', ''], ['policial', 'Denuncia policial (comisaría y número)', ''], ['danosPropios', 'Daños de nuestro auto', 'ej: paragolpes delantero, óptica derecha'],
];

function datos(s) {
  const c = de('cars', 'id', s.carId)[0] || {}, d = s.choferId ? de('drivers', 'id', s.choferId)[0] || {} : {};
  const dn = s.denuncia || {};
  return { c, d, dn };
}
export function textoDenuncia(s, extra) {
  const { c, d } = datos(s), dn = Object.assign({}, s.denuncia || {}, extra || {});
  const tipo = (TIPOS_SINIESTRO.find(x => x[0] === s.tipo) || [0, s.tipo || 'Siniestro'])[1];
  const cob = (COBERTURAS_SEGURO.find(x => x[0] === c.coberturaSeguro) || [0, ''])[1];
  const L = [
    'DENUNCIA DE SINIESTRO — ' + tipo.toUpperCase(),
    '',
    'ASEGURADO: ' + (c.titularRegistral || settings.companyName || 'LD Rental') + (settings.pagoCuit ? ' — CUIT ' + settings.pagoCuit : '') + (settings.companyPhone ? ' — Tel. ' + settings.companyPhone : ''),
    'Póliza: ' + (c.polizaNumero || '(completar)') + ' — ' + (c.aseguradora || 'aseguradora sin cargar') + (cob ? ' — ' + cob : ''),
    '',
    'VEHÍCULO: ' + [c.marca, c.modelo, c.anio].filter(Boolean).join(' ') + ' — Patente ' + (c.patente || '') + (c.color ? ' — Color ' + c.color : ''),
    'Chasis: ' + (c.vin || '—') + ' — Motor: ' + (c.numeroMotor || '—') + (c.km ? ' — Km: ' + Number(c.km).toLocaleString('es-AR') : ''),
    '',
    'CONDUCTOR: ' + (d.nombre || '(completar)') + (d.dni ? ' — DNI ' + d.dni : '') + (d.tipoLicencia ? ' — Licencia ' + d.tipoLicencia : '') + (d.licVenc ? ' (vence ' + fdate(d.licVenc) + ')' : ''),
    'Domicilio: ' + (d.domicilio || '—') + (d.tel ? ' — Tel. ' + d.tel : ''),
    '',
    'HECHO: ' + fdate(s.fecha) + (dn.hora ? ' a las ' + dn.hora : '') + ' — ' + (dn.direccion || s.lugar || '(lugar)'),
    'Relato: ' + (s.descripcion || '(completar)'),
    'Heridos: ' + (dn.heridos || 'no informado'),
    dn.danosPropios ? 'Daños de nuestro vehículo: ' + dn.danosPropios : '',
  ];
  if (s.terceroNombre || s.terceroPatente || dn.terceroDni) L.push('', 'TERCERO: ' + (s.terceroNombre || '—') + (dn.terceroDni ? ' — DNI/registro ' + dn.terceroDni : '') + (s.terceroTel ? ' — Tel. ' + s.terceroTel : ''),
    'Vehículo: ' + (dn.terceroAuto || '—') + ' — Patente ' + (s.terceroPatente || '—') + ' — Seguro: ' + (s.terceroAseguradora || '—') + (dn.terceroPoliza ? ' (póliza ' + dn.terceroPoliza + ')' : ''));
  if (dn.testigos) L.push('', 'Testigos: ' + dn.testigos);
  if (dn.policial) L.push('Denuncia policial: ' + dn.policial);
  if (s.numeroSiniestro) L.push('', 'Número de siniestro: ' + s.numeroSiniestro);
  L.push('', 'Fecha de esta denuncia: ' + fdate(iso(today())));
  return L.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
}

export function denunciaSiniestroView(id) {
  const s = de('siniestros', 'id', id)[0]; if (!s) return;
  const { c, d, dn } = datos(s);
  const faltan = [!c.polizaNumero && 'número de póliza', !c.aseguradora && 'aseguradora', !s.choferId && 'conductor', s.choferId && !d.dni && 'DNI del conductor', !s.descripcion && 'relato'].filter(Boolean);
  openModal('<h3>Denuncia para el seguro</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Se arma con los datos del auto, la póliza, el chofer y el siniestro. Completá lo que falta y bajala en PDF o copiá el texto.</div>' +
    (faltan.length ? '<div class="small" style="color:var(--warn);margin-bottom:8px">Falta cargar: ' + faltan.join(', ') + '. Se completa en la ficha del auto, del chofer o del siniestro.</div>' : '') +
    CAMPOS.map(([k, l, ph]) => '<label class="f"><span>' + l + '</span><input id="dn_' + k + '" value="' + esc(dn[k] || '') + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '></label>').join('') +
    '<details style="margin:6px 0 10px"><summary class="small" style="cursor:pointer">Ver el texto</summary><textarea id="dn_texto" rows="14" readonly style="margin-top:6px">' + esc(textoDenuncia(s)) + '</textarea></details>' +
    '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn grow" onclick="pdfDenuncia(\'' + s.id + '\')">Bajar PDF</button><button class="btn sec grow" onclick="copiarDenuncia(\'' + s.id + '\')">Copiar texto</button></div>' +
    '<button class="btn sec block" style="margin-top:8px" onclick="siniestroForm(\'' + s.carId + '\',\'' + s.id + '\')">Volver al siniestro</button>');
}
// Guarda lo completado y devuelve el siniestro actualizado.
async function guardarExtra(id) {
  const s = de('siniestros', 'id', id)[0]; if (!s) return null;
  const extra = {}; CAMPOS.forEach(([k]) => { extra[k] = v('dn_' + k); });
  const o = Object.assign({}, s, { denuncia: Object.assign({}, s.denuncia || {}, extra, { armada: iso(today()) }) });
  await save('siniestros', o);
  return o;
}
export async function copiarDenuncia(id) {
  const s = await guardarExtra(id); if (!s) return;
  const t = textoDenuncia(s);
  const ta = document.getElementById('dn_texto'); if (ta) ta.value = t;
  try { await navigator.clipboard.writeText(t); toast('Texto copiado'); } catch (e) { if (ta) { ta.closest('details').open = true; ta.focus(); ta.select(); } toast('Seleccionado: copialo'); }
}
export async function pdfDenuncia(id) {
  const s = await guardarExtra(id); if (!s) return;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18;
  doc.setFontSize(10);
  textoDenuncia(s).split('\n').forEach((linea, i) => {
    if (i === 0) { doc.setFontSize(14); doc.text(linea, 14, y); doc.setFontSize(10); y += 9; return; }
    if (!linea) { y += 3; return; }
    const partes = doc.splitTextToSize(linea, 182);
    if (y + partes.length * 5 > 280) { doc.addPage(); y = 18; }
    doc.text(partes, 14, y); y += partes.length * 5;
  });
  y += 14; if (y > 270) { doc.addPage(); y = 30; }
  doc.text('Firma del asegurado: ______________________', 14, y);
  doc.text('Firma del conductor: ______________________', 110, y);
  const c = de('cars', 'id', s.carId)[0] || {};
  doc.save('denuncia-siniestro-' + (c.patente || 'auto').replace(/\s/g, '') + '-' + s.fecha + '.pdf');
  toast('PDF descargado');
}
