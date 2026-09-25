import { S } from './state.js';
import { carById } from './calc.js';
import { esc, money, moneyUSD, fdate, iso, today } from './utils.js';
import { settings } from './settings.js';
import { toast, openModal } from './modal.js';
import { TIPOS } from './constants.js';
import { save } from './data.js';

async function registrarGeneracionContrato(c) {
  const historial = (c.contratoHistorial || []).concat([{
    fecha: iso(today()), tipo: c.tipo, monto: +c.monto || 0, cuotas: c.cuotas || null, total: c.total || null,
  }]);
  await save('cars', Object.assign({}, c, { contratoHistorial: historial }));
}

let firmaCtx = null, firmaTrazada = false, firmaDrawing = false, firmaUltimo = null;

export async function generarConstanciaCesion(carId) {
  const c = carById(carId);
  if (!c) { toast('Auto no encontrado'); return; }
  if (!c.choferId) { toast('Asigná un chofer al auto antes de generar la constancia'); return; }
  const d = S.drivers.find(x => x.id === c.choferId);
  if (!d) { toast('Chofer no encontrado'); return; }
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 24;
  doc.setFontSize(16); doc.text(settings.companyName || 'LD Rental', 14, y); y += 10;
  doc.setFontSize(13); doc.text('Constancia de cesión de uso de vehículo', 14, y); y += 12;
  doc.setFontSize(11);
  const linea = t => { doc.text(t, 14, y, { maxWidth: 180 }); y += 9; };
  linea('Por medio de la presente, ' + (settings.companyName || 'LD Rental') + ' hace constar que el vehículo detallado a continuación se encuentra cedido en uso a:');
  y += 2;
  linea('Conductor: ' + d.nombre + (d.dni ? ' — DNI ' + d.dni : ''));
  linea('Vehículo: ' + [c.marca, c.modelo].filter(Boolean).join(' ') + ' — Patente ' + (c.patente || '—'));
  if (c.anio) linea('Año: ' + c.anio);
  linea('Fecha de emisión: ' + fdate(iso(today())));
  y += 6;
  linea('Esta constancia certifica la autorización de uso del vehículo mencionado, a los fines que el interesado estime corresponder.');
  doc.save('constancia-cesion-' + (c.patente || 'auto') + '-' + iso(today()) + '.pdf');
  toast('Constancia descargada');
}

export function contratoForm(carId) {
  const c = carById(carId);
  if (!c) { toast('Auto no encontrado'); return; }
  if (!c.choferId) { toast('Asigná un chofer al auto antes de generar el contrato'); return; }
  const d = S.drivers.find(x => x.id === c.choferId);
  if (!d) { toast('Chofer no encontrado'); return; }
  const mon = c.tipo === 'financiado' ? moneyUSD : money;
  const h = '<h3>Contrato — ' + esc(c.patente) + '</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Se genera con los datos actuales del auto y el chofer. Pedile al chofer que firme abajo antes de generar el PDF.</div>' +
  '<div class="card small" style="margin-bottom:10px">' +
    '<div><b>Chofer:</b> ' + esc(d.nombre) + (d.dni ? ' · DNI ' + esc(d.dni) : '') + '</div>' +
    '<div><b>Auto:</b> ' + esc(c.patente) + ' ' + esc([c.marca, c.modelo].filter(Boolean).join(' ')) + '</div>' +
    '<div><b>Tipo:</b> ' + esc(TIPOS[c.tipo] || c.tipo) + '</div>' +
    '<div><b>Monto:</b> ' + mon(c.monto) + (c.tipo === 'financiado' ? ' semanal en ' + (c.cuotas || '—') + ' cuotas' : ' semanal') + '</div>' +
  '</div>' +
  '<div class="small muted" style="margin-bottom:6px">Firma del chofer</div>' +
  '<canvas id="ct_firma" width="335" height="140" style="width:100%;height:140px;border:1px solid var(--line);border-radius:8px;touch-action:none;background:#fff;display:block"></canvas>' +
  '<div class="row" style="margin-top:8px"><button class="btn sec sm" onclick="limpiarFirmaContrato()">Limpiar firma</button></div>' +
  '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="generarContrato(\'' + c.id + '\')">Generar PDF</button><button class="btn sec" onclick="compartirContrato(\'' + c.id + '\')">Compartir</button></div>' +
  '<button class="btn sec block" style="margin-top:8px" onclick="carForm(\'' + c.id + '\')">Volver</button>';
  openModal(h);
  initFirmaContrato();
}

function initFirmaContrato() {
  const cv = document.getElementById('ct_firma');
  if (!cv) return;
  firmaCtx = cv.getContext('2d');
  firmaCtx.lineWidth = 2; firmaCtx.lineCap = 'round'; firmaCtx.strokeStyle = '#111';
  firmaTrazada = false; firmaDrawing = false;
  const pos = e => {
    const r = cv.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return [(p.clientX - r.left) * (cv.width / r.width), (p.clientY - r.top) * (cv.height / r.height)];
  };
  cv.onpointerdown = e => { firmaDrawing = true; firmaUltimo = pos(e); try { cv.setPointerCapture(e.pointerId); } catch (err) {} };
  cv.onpointermove = e => {
    if (!firmaDrawing) return;
    const p = pos(e);
    firmaCtx.beginPath(); firmaCtx.moveTo(firmaUltimo[0], firmaUltimo[1]); firmaCtx.lineTo(p[0], p[1]); firmaCtx.stroke();
    firmaUltimo = p; firmaTrazada = true;
  };
  cv.onpointerup = () => { firmaDrawing = false; };
  cv.onpointerleave = () => { firmaDrawing = false; };
}
export function limpiarFirmaContrato() {
  const cv = document.getElementById('ct_firma');
  if (!cv || !firmaCtx) return;
  firmaCtx.clearRect(0, 0, cv.width, cv.height);
  firmaTrazada = false;
}

async function construirContrato(carId) {
  const c = carById(carId);
  if (!c || !c.choferId) { toast('Auto no encontrado'); return null; }
  const d = S.drivers.find(x => x.id === c.choferId);
  if (!d) { toast('Chofer no encontrado'); return null; }
  const cv = document.getElementById('ct_firma');
  if (!cv || !firmaTrazada) { toast('Falta la firma del chofer'); return null; }
  const firmaData = cv.toDataURL('image/png');
  const mon = c.tipo === 'financiado' ? moneyUSD : money;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 15, width = 210 - margin * 2;
  let y = 20;
  doc.setFontSize(15); doc.text(settings.companyName || 'LD Rental', margin, y); y += 8;
  doc.setFontSize(12); doc.text('Contrato de ' + (c.tipo === 'financiado' ? 'financiación de vehículo' : 'alquiler de vehículo'), margin, y); y += 10;
  doc.setFontSize(10);
  const parrafo = txt => {
    const lines = doc.splitTextToSize(txt, width);
    lines.forEach(l => { if (y > 275) { doc.addPage(); y = 20; } doc.text(l, margin, y); y += 5.5; });
    y += 3;
  };
  parrafo('Entre ' + (settings.companyName || 'LD Rental') + ', en adelante "la empresa", y ' + d.nombre + (d.dni ? ', DNI ' + d.dni : '') + (d.domicilio ? ', con domicilio en ' + d.domicilio : '') + ', en adelante "el chofer", se celebra el presente contrato de ' + (c.tipo === 'financiado' ? 'financiación' : 'alquiler') + ' de vehículo, sujeto a las siguientes cláusulas:');
  parrafo('1. Vehículo: ' + c.patente + (c.marca || c.modelo ? ' — ' + [c.marca, c.modelo, c.anio].filter(Boolean).join(' ') : '') + '.');
  parrafo('2. Inicio del contrato: ' + (c.inicio ? fdate(c.inicio) : '—') + '.');
  if (c.tipo === 'financiado') {
    parrafo('3. Modalidad: financiación. El chofer abonará una cuota semanal de ' + mon(c.monto) + ' durante ' + (c.cuotas || '—') + ' semanas, hasta completar un total de ' + mon(c.total || (c.monto * (c.cuotas || 0))) + '. Las cuotas se abonan en dólares estadounidenses.');
  } else {
    parrafo('3. Modalidad: alquiler semanal. El chofer abonará un monto semanal de ' + mon(c.monto) + '.');
  }
  let n = 4;
  parrafo(n + '. Multas: las infracciones de tránsito labradas durante la vigencia de este contrato son responsabilidad exclusiva del chofer, quien dispone de ' + (settings.multaPlazoDias || 7) + ' días desde la notificación para regularizar su pago.'); n++;
  if (d.depositoObjetivo) {
    parrafo(n + '. Depósito de garantía: el chofer deberá constituir un depósito de garantía de ' + money(d.depositoObjetivo) + ', que será retenido por la empresa durante la vigencia del contrato y devuelto al finalizar el mismo, descontando cualquier daño, deuda o incumplimiento pendiente.'); n++;
  }
  parrafo(n + '. Uso del vehículo: el chofer se compromete a utilizar el vehículo exclusivamente para actividades de transporte autorizadas, mantenerlo en buen estado y comunicar de inmediato cualquier siniestro, rotura o inconveniente.'); n++;
  parrafo(n + '. Rescisión: cualquiera de las partes podrá rescindir este contrato con aviso previo, quedando pendientes de liquidación los montos adeudados hasta la fecha de finalización.');
  y += 4;
  parrafo('Fecha: ' + fdate(iso(today())));
  if (y > 240) { doc.addPage(); y = 20; }
  doc.text('Firma del chofer:', margin, y); y += 4;
  doc.addImage(firmaData, 'PNG', margin, y, 60, 25);
  y += 30;
  doc.setFontSize(8); doc.setTextColor(140); doc.text('Contrato generado por ' + (settings.companyName || 'LD Rental'), margin, y);
  const filename = 'contrato-' + c.patente + '-' + iso(today()) + '.pdf';
  return { doc, filename };
}

export async function generarContrato(carId) {
  try {
    const r = await construirContrato(carId);
    if (!r) return;
    r.doc.save(r.filename);
    const c = carById(carId); if (c) await registrarGeneracionContrato(c);
    toast('Contrato generado');
  } catch (e) {
    toast('No se pudo generar el contrato: ' + ((e && e.message) || 'error'));
  }
}
export async function compartirContrato(carId) {
  try {
    const r = await construirContrato(carId);
    if (!r) return;
    const c = carById(carId); if (c) await registrarGeneracionContrato(c);
    if (navigator.share && navigator.canShare) {
      const blob = r.doc.output('blob');
      const file = new File([blob], r.filename, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Contrato', text: r.filename });
        return;
      }
    }
    r.doc.save(r.filename);
    toast('Tu navegador no permite compartir directo: se descargó el contrato, adjuntalo desde WhatsApp.');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    toast('No se pudo compartir el contrato: ' + ((e && e.message) || 'error'));
  }
}
