import { S } from './state.js';
import { carById, driverName } from './calc.js';
import { money, moneyUSD, fdate } from './utils.js';
import { settings } from './settings.js';
import { toast } from './modal.js';
import { METODOS_PAGO } from './constants.js';

const metodoLabel = m => ((METODOS_PAGO.find(x => x[0] === m) || [])[1]) || '';

async function construirRecibo(paymentId) {
  const p = S.payments.find(x => x.id === paymentId);
  if (!p) { toast('Cobro no encontrado'); return null; }
  const c = carById(p.carId);
  const chofer = driverName(p.choferId);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  let y = 18;
  doc.setFontSize(16); doc.text(settings.companyName || 'LD Rental', 12, y); y += 8;
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
  doc.setFontSize(13); doc.text('Monto: ' + (p.tipo === 'cuota' ? moneyUSD(p.monto) : money(p.monto)), 12, y);
  y += 14;
  doc.setFontSize(8); doc.setTextColor(140); doc.text('Comprobante generado por ' + (settings.companyName || 'LD Rental'), 12, y);
  const filename = 'recibo-' + (c ? c.patente : 'auto') + '-' + p.fecha + '.pdf';
  return { doc, filename };
}

export async function reciboPDF(paymentId) {
  try {
    const r = await construirRecibo(paymentId);
    if (!r) return;
    r.doc.save(r.filename);
    toast('Recibo generado');
  } catch (e) {
    toast('No se pudo generar el recibo: ' + ((e && e.message) || 'error'));
  }
}
export async function reciboCompartir(paymentId) {
  try {
    const r = await construirRecibo(paymentId);
    if (!r) return;
    if (navigator.share && navigator.canShare) {
      const blob = r.doc.output('blob');
      const file = new File([blob], r.filename, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Recibo de cobro', text: r.filename });
        return;
      }
    }
    r.doc.save(r.filename);
    toast('Tu navegador no permite compartir directo: se descargó el recibo, adjuntalo desde WhatsApp.');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    toast('No se pudo compartir el recibo: ' + ((e && e.message) || 'error'));
  }
}
