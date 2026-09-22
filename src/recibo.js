import { S } from './state.js';
import { carById, driverName } from './calc.js';
import { money, fdate } from './utils.js';
import { settings } from './settings.js';
import { toast } from './modal.js';
import { METODOS_PAGO } from './constants.js';

const metodoLabel = m => ((METODOS_PAGO.find(x => x[0] === m) || [])[1]) || '';

export async function reciboPDF(paymentId) {
  const p = S.payments.find(x => x.id === paymentId);
  if (!p) { toast('Cobro no encontrado'); return; }
  const c = carById(p.carId);
  const chofer = driverName(p.choferId);
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a5' });
    let y = 18;
    doc.setFontSize(16); doc.text(settings.companyName || 'Mi Flota', 12, y); y += 8;
    doc.setFontSize(11); doc.text('Recibo de cobro', 12, y); y += 10;
    doc.setFontSize(10);
    const linea = (label, val) => { doc.text(label, 12, y); doc.text(String(val), 60, y); y += 7; };
    linea('Fecha:', fdate(p.fecha));
    linea('Auto:', c ? c.patente : '—');
    linea('Chofer:', chofer || '—');
    linea('Concepto:', p.tipo === 'alquiler' ? 'Alquiler semanal' : p.tipo === 'cuota' ? 'Cuota de financiación' : 'Otro');
    if (metodoLabel(p.metodo)) linea('Método de pago:', metodoLabel(p.metodo));
    if (p.parcial) linea('Tipo:', 'Pago parcial');
    if (p.nota) linea('Nota:', p.nota);
    y += 4;
    doc.setFontSize(13); doc.text('Monto: ' + money(p.monto), 12, y);
    y += 14;
    doc.setFontSize(8); doc.setTextColor(140); doc.text('Comprobante generado por ' + (settings.companyName || 'Mi Flota'), 12, y);
    doc.save('recibo-' + (c ? c.patente : 'auto') + '-' + p.fecha + '.pdf');
    toast('Recibo generado');
  } catch (e) {
    toast('No se pudo generar el recibo: ' + ((e && e.message) || 'error'));
  }
}
