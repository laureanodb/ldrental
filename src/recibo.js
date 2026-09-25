import { S } from './state.js';
import { carById, driverName, driverDebt } from './calc.js';
import { money, moneyUSD, fdate, iso, today } from './utils.js';
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
export async function estadoCuentaPDF(driverId) {
  try {
    const d = S.drivers.find(x => x.id === driverId);
    if (!d) { toast('Chofer no encontrado'); return; }
    const t0 = today();
    const desde = iso(new Date(t0.getFullYear(), t0.getMonth(), 1));
    const hasta = iso(t0);
    const pagos = S.payments.filter(p => p.choferId === driverId && p.fecha >= desde && p.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 15, width = 210 - margin * 2;
    let y = 20;
    doc.setFontSize(15); doc.text(settings.companyName || 'LD Rental', margin, y); y += 8;
    doc.setFontSize(12); doc.text('Estado de cuenta — ' + d.nombre, margin, y); y += 7;
    doc.setFontSize(9); doc.setTextColor(120); doc.text('Período: ' + fdate(desde) + ' al ' + fdate(hasta), margin, y); doc.setTextColor(0); y += 9;
    doc.setFontSize(10);
    if (!pagos.length) { doc.text('Sin pagos registrados en el período.', margin, y); y += 8; }
    else {
      doc.text('Fecha', margin, y); doc.text('Concepto', margin + 30, y); doc.text('Método', margin + 100, y); doc.text('Monto', margin + width - 25, y); y += 5;
      doc.setDrawColor(200); doc.line(margin, y, margin + width, y); y += 5;
      let totalARS = 0, totalUSD = 0;
      pagos.forEach(p => {
        if (y > 270) { doc.addPage(); y = 20; }
        const concepto = p.tipo === 'alquiler' ? 'Alquiler' : p.tipo === 'cuota' ? 'Cuota' : 'Otro';
        const metodo = (METODOS_PAGO.find(x => x[0] === p.metodo) || [0, ''])[1];
        const monto = p.tipo === 'cuota' ? moneyUSD(p.monto) : money(p.monto);
        if (p.tipo === 'cuota') totalUSD += (+p.monto || 0); else totalARS += (+p.monto || 0);
        doc.text(fdate(p.fecha), margin, y); doc.text(concepto, margin + 30, y); doc.text(metodo, margin + 100, y); doc.text(monto, margin + width - 25, y); y += 6;
      });
      y += 3; doc.line(margin, y, margin + width, y); y += 7;
      doc.setFontSize(11); doc.text('Total pagado en el período: ' + money(totalARS) + (totalUSD ? ' + ' + moneyUSD(totalUSD) : ''), margin, y); y += 8;
    }
    const debt = driverDebt(driverId);
    doc.setFontSize(11); doc.text('Deuda actual: ' + money(debt), margin, y); y += 10;
    doc.setFontSize(8); doc.setTextColor(140); doc.text('Comprobante generado por ' + (settings.companyName || 'LD Rental'), margin, y);
    doc.save('estado-cuenta-' + d.nombre.replace(/\s+/g, '-').toLowerCase() + '-' + hasta + '.pdf');
    toast('Estado de cuenta generado');
  } catch (e) {
    toast('No se pudo generar el estado de cuenta: ' + ((e && e.message) || 'error'));
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
