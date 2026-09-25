// LD Rental — biblioteca de plantillas legales (cartas documento, intimaciones).
// Genera un PDF de texto simple con los datos del chofer/auto ya completados,
// para que quede como base y se termine de revisar con un abogado si hace falta.
import { S } from './state.js';
import { driverDebt } from './calc.js';
import { esc, money, fdate, iso, today, uid } from './utils.js';
import { settings } from './settings.js';
import { toast, openModal } from './modal.js';
import { save } from './data.js';

const PLANTILLAS = [
  ['intimacion_pago', 'Intimación de pago', d => 'Por medio de la presente, se intima a Ud. a regularizar en el plazo de 48 (cuarenta y ocho) horas la deuda que mantiene por el uso del vehículo asignado, la cual asciende a ' + money(driverDebt(d.id)) + ' a la fecha. Vencido dicho plazo sin que se verifique el pago, se procederá conforme a las cláusulas del contrato suscripto, incluyendo la eventual recuperación del vehículo y las acciones legales que correspondan.'],
  ['rescision', 'Rescisión de contrato', () => 'Por medio de la presente se notifica la rescisión del contrato de uso del vehículo que Ud. tiene asignado, con efecto a partir de la fecha que se indique en la entrevista personal a coordinar. Se lo intima a hacer entrega del vehículo, documentación y accesorios en las condiciones pactadas, dentro del plazo que se le informe.'],
  ['dano', 'Reclamo por daño al vehículo', () => 'Por medio de la presente se le informa que, conforme a lo constatado en la última inspección del vehículo que tiene asignado, se han detectado daños no reportados oportunamente. Se lo intima a presentarse dentro de las 72 horas para coordinar la reparación y, en su caso, el descuento correspondiente conforme a lo pactado en el contrato.'],
  ['buena_conducta', 'Constancia de buena conducta', d => 'Por medio de la presente se deja constancia de que ' + (d.nombre || 'el chofer') + ' se desempeñó como conductor dentro de la flota, cumpliendo en forma satisfactoria con las obligaciones asumidas y sin registrar observaciones de conducta que ameriten señalar.'],
  ['autorizacion_viajar', 'Autorización para viajar', d => 'Por medio de la presente se autoriza a ' + (d.nombre || 'el chofer') + (d.dni ? ', DNI ' + d.dni : '') + ' a circular con el vehículo que tiene asignado dentro del territorio que se indique, dejando constancia de que el mismo forma parte de la flota de ' + (settings.companyName || 'LD Rental') + ' y se encuentra autorizado para su uso conforme al contrato vigente.'],
];
const MEDIOS_ENVIO = [['whatsapp', 'WhatsApp'], ['email', 'Correo'], ['mano', 'En mano'], ['carta_documento', 'Carta documento postal']];

function textoBase(tipo, d) {
  const plantilla = PLANTILLAS.find(x => x[0] === tipo) || PLANTILLAS[0];
  return plantilla[2](d);
}

export function plantillaForm(driverId) {
  const d = S.drivers.find(x => x.id === driverId);
  if (!d) { toast('Chofer no encontrado'); return; }
  const tipoInicial = PLANTILLAS[0][0];
  const h = '<h3>Carta documento — ' + esc(d.nombre) + '</h3>' +
  '<input type="hidden" id="pl_driverid" value="' + esc(d.id) + '">' +
  '<label class="f"><span>Plantilla</span><select id="pl_tipo" onchange="onPlantillaTipo(\'' + d.id + '\')">' + PLANTILLAS.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Texto <small>podés editarlo antes de generar el PDF</small></span><textarea id="pl_texto" rows="8">' + esc(textoBase(tipoInicial, d)) + '</textarea></label>' +
  '<label class="f"><span>Texto adicional <small>opcional</small></span><textarea id="pl_extra" placeholder="Detalle extra que quieras agregar al final..."></textarea></label>' +
  '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="generarPlantilla(\'' + d.id + '\')">Generar PDF</button><button class="btn sec" onclick="driverForm(\'' + d.id + '\')">Cancelar</button></div>' +
  seccionCartas(d);
  openModal(h);
}
export function onPlantillaTipo(driverId) {
  const d = S.drivers.find(x => x.id === driverId);
  const tipoSel = document.getElementById('pl_tipo');
  const textoEl = document.getElementById('pl_texto');
  if (!d || !tipoSel || !textoEl) return;
  textoEl.value = textoBase(tipoSel.value, d);
}

export async function generarPlantilla(driverId) {
  const d = S.drivers.find(x => x.id === driverId);
  if (!d) { toast('Chofer no encontrado'); return; }
  const tipoSel = document.getElementById('pl_tipo');
  const textoEl = document.getElementById('pl_texto');
  const extraEl = document.getElementById('pl_extra');
  const tipo = tipoSel ? tipoSel.value : PLANTILLAS[0][0];
  const texto = textoEl ? textoEl.value.trim() : textoBase(tipo, d);
  const extra = extraEl ? extraEl.value.trim() : '';
  const plantilla = PLANTILLAS.find(x => x[0] === tipo) || PLANTILLAS[0];
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 15, width = 210 - margin * 2;
    let y = 20;
    doc.setFontSize(15); doc.text(settings.companyName || 'LD Rental', margin, y); y += 8;
    doc.setFontSize(12); doc.text(plantilla[1], margin, y); y += 10;
    doc.setFontSize(10);
    const parrafo = txt => {
      const lines = doc.splitTextToSize(txt, width);
      lines.forEach(l => { if (y > 275) { doc.addPage(); y = 20; } doc.text(l, margin, y); y += 5.5; });
      y += 3;
    };
    parrafo('Fecha: ' + fdate(iso(today())));
    parrafo('Destinatario: ' + d.nombre + (d.dni ? ', DNI ' + d.dni : '') + (d.domicilio ? ', con domicilio en ' + d.domicilio : ''));
    parrafo(texto);
    if (extra) parrafo(extra);
    y += 4;
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text('Firma: _________________________', margin, y); y += 10;
    doc.setFontSize(8); doc.setTextColor(140); doc.text('Generado por ' + (settings.companyName || 'LD Rental') + '. Revisar con un abogado antes de enviar si el caso lo requiere.', margin, y);
    doc.save('carta-' + tipo + '-' + (d.nombre || 'chofer').replace(/\s+/g, '-').toLowerCase() + '-' + iso(today()) + '.pdf');
    const cartasHistorial = (d.cartasHistorial || []).concat([{ id: uid(), fecha: iso(today()), tipo, titulo: plantilla[1], enviada: false, medio: '' }]);
    await save('drivers', Object.assign({}, d, { cartasHistorial }));
    toast('Carta generada');
    plantillaForm(driverId);
  } catch (e) {
    toast('No se pudo generar la carta: ' + ((e && e.message) || 'error'));
  }
}

function seccionCartas(d) {
  const L = (d.cartasHistorial || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!L.length) return '';
  return '<div class="sec-t">Cartas generadas</div>' + L.map(c => '<div class="card row between small">' +
    '<div><div>' + esc(c.titulo) + '</div><div class="muted">' + fdate(c.fecha) + (c.enviada ? ' · enviada por ' + esc((MEDIOS_ENVIO.find(x => x[0] === c.medio) || [0, c.medio])[1]) : '') + '</div></div>' +
    (c.enviada ? '' : '<select onchange="marcarCartaEnviada(\'' + d.id + '\',\'' + c.id + '\',this.value)"><option value="">Marcar enviada por…</option>' + MEDIOS_ENVIO.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select>') +
  '</div>').join('');
}
export async function marcarCartaEnviada(driverId, cartaId, medio) {
  if (!medio) return;
  const d = S.drivers.find(x => x.id === driverId); if (!d) return;
  const cartasHistorial = (d.cartasHistorial || []).map(c => c.id === cartaId ? Object.assign({}, c, { enviada: true, medio }) : c);
  if (await save('drivers', Object.assign({}, d, { cartasHistorial }))) { toast('Marcada como enviada'); plantillaForm(driverId); }
}
