// Membrete único para todos los PDF: logo, nombre, CUIT, teléfono y dirección arriba,
// título y número del documento a la derecha, y pie con la página en cada hoja.
// La numeración es correlativa por tipo de documento (REC-00000001, CON-00000001…).
import { settings, saveSettings } from './settings.js';
import { fdate, iso, today } from './utils.js';

const PREFIJOS = { recibo: 'REC', estado: 'EC', cuenta: 'CC', contrato: 'CON', constancia: 'CES', liquidacion: 'LIQ', carta: 'CAR', denuncia: 'DEN', acta: 'ACT', reporte: 'REP' };
export function proximoNumero(tipo) {
  const N = Object.assign({}, settings.docNumeros || {});
  N[tipo] = (+N[tipo] || 0) + 1;
  saveSettings({ docNumeros: N });
  return (PREFIJOS[tipo] || 'DOC') + '-' + String(N[tipo]).padStart(8, '0');
}
const rgb = hex => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [34, 43, 51]; };
const datosEmpresa = () => {
  const s = settings.sitioEmpresa || {};
  return [settings.pagoCuit ? 'CUIT ' + String(settings.pagoCuit).replace(/^(\d{2})(\d{8})(\d)$/, '$1-$2-$3') : '', settings.companyPhone ? 'Tel. ' + settings.companyPhone : '', s.direccion || ''].filter(Boolean).join(' · ');
};

// Dibuja el encabezado y devuelve la altura (y) donde empieza el contenido.
export function membrete(doc, { titulo, numero, fecha } = {}) {
  const W = doc.internal.pageSize.getWidth(), mg = W > 160 ? 15 : 12;
  let x = mg;
  const logo = settings.companyLogo;
  if (logo && /^data:image\/(png|jpe?g)/i.test(logo)) {
    try {
      const p = doc.getImageProperties(logo), h = 13, w = Math.min(36, h * p.width / p.height);
      doc.addImage(logo, /png/i.test(logo.slice(0, 20)) ? 'PNG' : 'JPEG', mg, 9, w, w * p.height / p.width);
      x = mg + w + 4;
    } catch (e) { /* logo ilegible: va solo el nombre */ }
  }
  doc.setTextColor(20); doc.setFont(undefined, 'bold'); doc.setFontSize(W > 160 ? 14 : 12);
  doc.text(settings.companyName || 'LD Rental', x, 15);
  doc.setFont(undefined, 'normal'); doc.setFontSize(8); doc.setTextColor(110);
  const datos = datosEmpresa(); if (datos) doc.text(doc.splitTextToSize(datos, W / 2 - 10)[0], x, 20);
  doc.setTextColor(20); doc.setFont(undefined, 'bold'); doc.setFontSize(W > 160 ? 11 : 10);
  if (titulo) doc.text(doc.splitTextToSize(titulo, W / 2 - mg)[0], W - mg, 15, { align: 'right' });
  doc.setFont(undefined, 'normal'); doc.setFontSize(8); doc.setTextColor(110);
  doc.text([numero ? 'N° ' + numero : '', fdate(fecha || iso(today()))].filter(Boolean).join(' · '), W - mg, 20, { align: 'right' });
  const [r, g, b] = rgb(settings.colorPortal);
  doc.setDrawColor(r, g, b); doc.setLineWidth(0.8); doc.line(mg, 25, W - mg, 25);
  doc.setLineWidth(0.2); doc.setDrawColor(200); doc.setTextColor(0); doc.setFontSize(10);
  return 34;
}
// Pie en todas las hojas: empresa, número y "página X de Y". Llamar justo antes de guardar.
export function pies(doc, numero) {
  const n = doc.getNumberOfPages(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), mg = W > 160 ? 15 : 12;
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(140);
    doc.text([settings.companyName || 'LD Rental', numero ? 'N° ' + numero : ''].filter(Boolean).join(' · '), mg, H - 7);
    doc.text('Página ' + i + ' de ' + n, W - mg, H - 7, { align: 'right' });
  }
  doc.setTextColor(0);
}
