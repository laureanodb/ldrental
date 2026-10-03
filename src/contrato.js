import { S, as, sb } from './state.js';
import { BUCKET } from './config.js';
import { carById } from './calc.js';
import { esc, money, moneyUSD, fdate, iso, today, uid } from './utils.js';
import { settings } from './settings.js';
import { toast, openModal } from './modal.js';
import { TIPOS } from './constants.js';
import { save } from './data.js';
import { de } from './memo.js';

let renovando = false;

async function registrarGeneracionContrato(c, doc, filename) {
  const entry = { fecha: iso(today()), tipo: c.tipo, monto: +c.monto || 0, cuotas: c.cuotas || null, total: c.total || null, renovacion: renovando };
  if (as) {
    try {
      const blob = doc.output('blob');
      const r = await as.upload(blob);
      entry.pdfId = r.id;
      entry.pdfName = filename;
    } catch (e) { /* si falla la subida, igual queda el registro sin PDF adjunto */ }
  }
  const historial = (c.contratoHistorial || []).concat([entry]);
  await save('cars', Object.assign({}, c, { contratoHistorial: historial }));
}

let firmaCtx = null, firmaTrazada = false, firmaDrawing = false, firmaUltimo = null;

export async function generarConstanciaCesion(carId) {
  const c = carById(carId);
  if (!c) { toast('Auto no encontrado'); return; }
  if (!c.choferId) { toast('Asigná un chofer al auto antes de generar la constancia'); return; }
  const d = de('drivers', 'id', c.choferId)[0];
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
  renovando = false;
  contratoFormInterno(carId);
}
export function renovarContratoForm(carId) {
  renovando = true;
  contratoFormInterno(carId);
}
function contratoFormInterno(carId) {
  const c = carById(carId);
  if (!c) { toast('Auto no encontrado'); return; }
  if (!c.choferId) { toast('Asigná un chofer al auto antes de generar el contrato'); return; }
  const d = de('drivers', 'id', c.choferId)[0];
  if (!d) { toast('Chofer no encontrado'); return; }
  const mon = c.tipo === 'financiado' ? moneyUSD : money;
  const h = '<h3>' + (renovando ? 'Renovar contrato — ' : 'Contrato — ') + esc(c.patente) + '</h3>' +
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
  '<div class="small muted" style="margin:14px 0 4px;text-align:center">¿El chofer no está con vos?</div>' +
  '<button class="btn sec block" onclick="mandarContratoAFirmar(\'' + c.id + '\')">📲 Mandar a firmar por el portal del chofer</button>' +
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

// Texto del contrato como lista de párrafos. Es el mismo para el PDF firmado
// en el celular de la empresa y para el que el chofer firma desde el portal.
export function textoContrato(c, d) {
  const mon = c.tipo === 'financiado' ? moneyUSD : money;
  const P = [];
  P.push('Entre ' + (settings.companyName || 'LD Rental') + ', en adelante "la empresa", y ' + d.nombre + (d.dni ? ', DNI ' + d.dni : '') + (d.domicilio ? ', con domicilio en ' + d.domicilio : '') + ', en adelante "el chofer", se celebra el presente contrato de ' + (c.tipo === 'financiado' ? 'financiación' : 'alquiler') + ' de vehículo, sujeto a las siguientes cláusulas:');
  P.push('1. Vehículo: ' + c.patente + (c.marca || c.modelo ? ' — ' + [c.marca, c.modelo, c.anio].filter(Boolean).join(' ') : '') + '.');
  P.push('2. Inicio del contrato: ' + (c.inicio ? fdate(c.inicio) : '—') + '.');
  if (c.tipo === 'financiado') {
    P.push('3. Modalidad: financiación. El chofer abonará una cuota semanal de ' + mon(c.monto) + ' durante ' + (c.cuotas || '—') + ' semanas, hasta completar un total de ' + mon(c.total || (c.monto * (c.cuotas || 0))) + '. Las cuotas se abonan en dólares estadounidenses.');
  } else {
    P.push('3. Modalidad: alquiler semanal. El chofer abonará un monto semanal de ' + mon(c.monto) + '.');
  }
  let n = 4;
  P.push(n + '. Multas: las infracciones de tránsito labradas durante la vigencia de este contrato son responsabilidad exclusiva del chofer, quien dispone de ' + (settings.multaPlazoDias || 7) + ' días desde la notificación para regularizar su pago.'); n++;
  if (d.depositoObjetivo) {
    P.push(n + '. Depósito de garantía: el chofer deberá constituir un depósito de garantía de ' + money(d.depositoObjetivo) + ', que será retenido por la empresa durante la vigencia del contrato y devuelto al finalizar el mismo, descontando cualquier daño, deuda o incumplimiento pendiente.'); n++;
  }
  P.push(n + '. Uso del vehículo: el chofer se compromete a utilizar el vehículo exclusivamente para actividades de transporte autorizadas, mantenerlo en buen estado y comunicar de inmediato cualquier siniestro, rotura o inconveniente.'); n++;
  P.push(n + '. Rescisión: cualquiera de las partes podrá rescindir este contrato con aviso previo, quedando pendientes de liquidación los montos adeudados hasta la fecha de finalización.');
  return { titulo: 'Contrato de ' + (c.tipo === 'financiado' ? 'financiación de vehículo' : 'alquiler de vehículo'), parrafos: P };
}
// Arma el PDF. firma: imagen PNG (dataURL). pie: líneas extra debajo de la firma (datos de la firma remota).
async function pdfContrato(titulo, parrafos, fecha, firmaData, pie) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 15, width = 210 - margin * 2;
  let y = 20;
  doc.setFontSize(15); doc.text(settings.companyName || 'LD Rental', margin, y); y += 8;
  doc.setFontSize(12); doc.text(titulo, margin, y); y += 10;
  doc.setFontSize(10);
  const parrafo = txt => {
    const lines = doc.splitTextToSize(txt, width);
    lines.forEach(l => { if (y > 275) { doc.addPage(); y = 20; } doc.text(l, margin, y); y += 5.5; });
    y += 3;
  };
  parrafos.forEach(parrafo);
  y += 4;
  parrafo('Fecha: ' + fdate(fecha));
  if (y > 240) { doc.addPage(); y = 20; }
  doc.text('Firma del chofer:', margin, y); y += 4;
  doc.addImage(firmaData, 'PNG', margin, y, 60, 25);
  y += 30;
  doc.setFontSize(8);
  (pie || []).forEach(t => { doc.splitTextToSize(t, width).forEach(l => { doc.text(l, margin, y); y += 4; }); });
  doc.setTextColor(140); doc.text('Contrato generado por ' + (settings.companyName || 'LD Rental'), margin, y + 2);
  return doc;
}

async function construirContrato(carId) {
  const c = carById(carId);
  if (!c || !c.choferId) { toast('Auto no encontrado'); return null; }
  const d = de('drivers', 'id', c.choferId)[0];
  if (!d) { toast('Chofer no encontrado'); return null; }
  const cv = document.getElementById('ct_firma');
  if (!cv || !firmaTrazada) { toast('Falta la firma del chofer'); return null; }
  const t = textoContrato(c, d);
  const doc = await pdfContrato(t.titulo, t.parrafos, iso(today()), cv.toDataURL('image/png'));
  return { doc, filename: 'contrato-' + c.patente + '-' + iso(today()) + '.pdf' };
}

export async function generarContrato(carId) {
  try {
    const r = await construirContrato(carId);
    if (!r) return;
    r.doc.save(r.filename);
    const c = carById(carId); if (c) await registrarGeneracionContrato(c, r.doc, r.filename);
    toast('Contrato generado');
  } catch (e) {
    toast('No se pudo generar el contrato: ' + ((e && e.message) || 'error'));
  } finally { renovando = false; }
}
export async function compartirContrato(carId) {
  try {
    const r = await construirContrato(carId);
    if (!r) return;
    const c = carById(carId); if (c) await registrarGeneracionContrato(c, r.doc, r.filename);
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

/* ---------- Firma desde el portal del chofer ---------- */
// Se guarda el texto exacto del contrato en el auto; el chofer lo lee y lo
// firma desde su portal; la Edge Function portal-chofer guarda la firma, la
// fecha y hora, el nombre y DNI que escribió y la IP.
function linkPortal(d) {
  return d.portalToken ? location.origin + location.pathname + '#/portal/' + d.id + '/' + d.portalToken : '';
}
export async function mandarContratoAFirmar(carId) {
  const c = carById(carId); if (!c || !c.choferId) { toast('Asigná un chofer al auto primero'); return; }
  const d = de('drivers', 'id', c.choferId)[0]; if (!d) { toast('Chofer no encontrado'); return; }
  if (!d.portalToken) { toast('Primero generá el link del portal en la ficha del chofer (solapa Datos)'); return; }
  const t = textoContrato(c, d);
  const firmaRemota = { id: uid(), estado: 'pendiente', creado: new Date().toISOString(), choferId: d.id, titulo: t.titulo, parrafos: t.parrafos, renovacion: renovando, tipo: c.tipo, monto: +c.monto || 0, cuotas: c.cuotas || null, total: c.total || null };
  if (!(await save('cars', Object.assign({}, c, { firmaRemota })))) return;
  renovando = false;
  avisoFirmaRemota(carId);
}
export function avisoFirmaRemota(carId) {
  const c = carById(carId); const d = c && de('drivers', 'id', c.choferId)[0]; if (!d) return;
  const url = linkPortal(d);
  const msg = 'Hola ' + (d.nombre || '').split(' ')[0] + ', te mandé el contrato del auto ' + c.patente + ' para que lo leas y lo firmes desde tu portal: ' + url;
  openModal('<h3>Contrato enviado a firmar</h3>' +
    '<div class="small muted" style="margin-bottom:12px">Quedó esperando la firma de ' + esc(d.nombre) + '. Cuando firme te llega un aviso y lo descargás desde la solapa Contrato del auto.</div>' +
    (d.tel ? '<a class="btn block" style="margin-bottom:8px" target="_blank" rel="noopener" href="https://wa.me/' + esc(d.tel.replace(/\D/g, '')) + '?text=' + encodeURIComponent(msg) + '">Mandar el link por WhatsApp</a>' : '') +
    '<button class="btn sec block" style="margin-bottom:8px" onclick="copiarLinkFirma(\'' + c.id + '\')">Copiar link del portal</button>' +
    '<button class="btn sec block" onclick="carForm(\'' + c.id + '\');setTabAuto(\'contrato\')">Volver al auto</button>');
}
export async function copiarLinkFirma(carId) {
  const c = carById(carId); const d = c && de('drivers', 'id', c.choferId)[0]; if (!d) return;
  try { await navigator.clipboard.writeText(linkPortal(d)); toast('Link copiado'); } catch (e) { toast('No se pudo copiar: ' + linkPortal(d)); }
}
export async function cancelarFirmaRemota(carId) {
  const c = carById(carId); if (!c || !c.firmaRemota) return;
  if (!(await save('cars', Object.assign({}, c, { firmaRemota: null })))) return;
  toast('Pedido de firma cancelado');
}
function blobADataUrl(b) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(b); });
}
export async function descargarContratoFirmado(carId) {
  try {
    const c = carById(carId); const f = c && c.firmaRemota;
    if (!f || f.estado !== 'firmado') { toast('El contrato todavía no está firmado'); return; }
    const r = await sb.storage.from(BUCKET).download(f.firmaPath);
    if (r.error || !r.data) throw new Error('no se encontró la firma');
    const firma = await blobADataUrl(r.data);
    const cuando = new Date(f.firmadoEn);
    const hora = cuando.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const pie = ['Firmado digitalmente desde el portal del chofer el ' + hora + ' (hora de Argentina) por ' + (f.nombreFirmante || '') + (f.dniFirmante ? ', DNI ' + f.dniFirmante : '') + ', quien declaró haber leído y aceptado el contrato.' + (f.ip ? ' IP: ' + f.ip + '.' : ''), 'Código de verificación: ' + f.id];
    const doc = await pdfContrato(f.titulo, f.parrafos, iso(cuando), firma, pie);
    const filename = 'contrato-firmado-' + c.patente + '-' + iso(cuando) + '.pdf';
    doc.save(filename);
    if (!f.pdfId && as) {
      try {
        const up = await as.upload(doc.output('blob'));
        const entry = { fecha: iso(cuando), tipo: f.tipo, monto: f.monto, cuotas: f.cuotas, total: f.total, renovacion: f.renovacion, pdfId: up.id, pdfName: filename, firmadoPorPortal: true };
        await save('cars', Object.assign({}, c, { firmaRemota: Object.assign({}, f, { pdfId: up.id, pdfName: filename }), contratoHistorial: (c.contratoHistorial || []).concat([entry]) }));
      } catch (e) { /* el PDF igual se descargó */ }
    }
    toast('Contrato firmado descargado');
  } catch (e) {
    toast('No se pudo armar el contrato firmado: ' + ((e && e.message) || 'error'));
  }
}
export function tarjetaFirmaRemota(c) {
  const f = c.firmaRemota; if (!f) return '';
  if (f.estado === 'firmado') {
    return '<div class="card"><div class="row between"><b>Contrato firmado desde el portal</b><span class="badge b-ok">Firmado</span></div>' +
      '<div class="small muted">' + esc(f.nombreFirmante || '') + (f.dniFirmante ? ' · DNI ' + esc(f.dniFirmante) : '') + ' · ' + fdate(String(f.firmadoEn).slice(0, 10)) + '</div>' +
      '<div class="row" style="margin-top:8px"><button class="btn sm grow" onclick="descargarContratoFirmado(\'' + c.id + '\')">Descargar contrato firmado</button>' +
      '<button class="btn sec sm" onclick="cancelarFirmaRemota(\'' + c.id + '\')">Archivar</button></div></div>';
  }
  return '<div class="card"><div class="row between"><b>Contrato esperando firma</b><span class="badge b-warn">Pendiente</span></div>' +
    '<div class="small muted">Enviado el ' + fdate(String(f.creado).slice(0, 10)) + ' al portal del chofer.</div>' +
    '<div class="row" style="margin-top:8px"><button class="btn sec sm grow" onclick="avisoFirmaRemota(\'' + c.id + '\')">Reenviar link</button>' +
    '<button class="btn sec sm" onclick="cancelarFirmaRemota(\'' + c.id + '\')">Cancelar</button></div></div>';
}
