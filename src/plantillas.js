// LD Rental — biblioteca de plantillas legales (cartas documento, intimaciones).
// Genera un PDF de texto simple con los datos del chofer/auto ya completados,
// para que quede como base y se termine de revisar con un abogado si hace falta.
import { S } from './state.js';
import { driverDebt } from './calc.js';
import { esc, money, fdate, iso, today } from './utils.js';
import { settings } from './settings.js';
import { toast, openModal } from './modal.js';

const PLANTILLAS = [
  ['intimacion_pago', 'Intimación de pago', d => 'Por medio de la presente, se intima a Ud. a regularizar en el plazo de 48 (cuarenta y ocho) horas la deuda que mantiene por el uso del vehículo asignado, la cual asciende a ' + money(driverDebt(d.id)) + ' a la fecha. Vencido dicho plazo sin que se verifique el pago, se procederá conforme a las cláusulas del contrato suscripto, incluyendo la eventual recuperación del vehículo y las acciones legales que correspondan.'],
  ['rescision', 'Rescisión de contrato', () => 'Por medio de la presente se notifica la rescisión del contrato de uso del vehículo que Ud. tiene asignado, con efecto a partir de la fecha que se indique en la entrevista personal a coordinar. Se lo intima a hacer entrega del vehículo, documentación y accesorios en las condiciones pactadas, dentro del plazo que se le informe.'],
  ['dano', 'Reclamo por daño al vehículo', () => 'Por medio de la presente se le informa que, conforme a lo constatado en la última inspección del vehículo que tiene asignado, se han detectado daños no reportados oportunamente. Se lo intima a presentarse dentro de las 72 horas para coordinar la reparación y, en su caso, el descuento correspondiente conforme a lo pactado en el contrato.'],
];

export function plantillaForm(driverId) {
  const d = S.drivers.find(x => x.id === driverId);
  if (!d) { toast('Chofer no encontrado'); return; }
  const h = '<h3>Carta documento — ' + esc(d.nombre) + '</h3>' +
  '<label class="f"><span>Plantilla</span><select id="pl_tipo">' + PLANTILLAS.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Texto adicional <small>opcional</small></span><textarea id="pl_extra" placeholder="Detalle extra que quieras agregar al final..."></textarea></label>' +
  '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="generarPlantilla(\'' + d.id + '\')">Generar PDF</button><button class="btn sec" onclick="driverForm(\'' + d.id + '\')">Cancelar</button></div>';
  openModal(h);
}

export async function generarPlantilla(driverId) {
  const d = S.drivers.find(x => x.id === driverId);
  if (!d) { toast('Chofer no encontrado'); return; }
  const tipoSel = document.getElementById('pl_tipo');
  const extraEl = document.getElementById('pl_extra');
  const tipo = tipoSel ? tipoSel.value : PLANTILLAS[0][0];
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
    parrafo(plantilla[2](d));
    if (extra) parrafo(extra);
    y += 4;
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text('Firma: _________________________', margin, y); y += 10;
    doc.setFontSize(8); doc.setTextColor(140); doc.text('Generado por ' + (settings.companyName || 'LD Rental') + '. Revisar con un abogado antes de enviar si el caso lo requiere.', margin, y);
    doc.save('carta-' + tipo + '-' + (d.nombre || 'chofer').replace(/\s+/g, '-').toLowerCase() + '-' + iso(today()) + '.pdf');
    toast('Carta generada');
  } catch (e) {
    toast('No se pudo generar la carta: ' + ((e && e.message) || 'error'));
  }
}
