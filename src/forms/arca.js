// Facturación electrónica con ARCA desde la app. La parte delicada (clave, certificado,
// conexión con ARCA) la hace la función facturar-arca de Supabase; acá están la
// configuración paso a paso, el botón "Facturar" de cada cobro y el PDF con el QR.
import { S, sb } from '../state.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';
import { esc, fdate, money } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { settings, saveSettings } from '../settings.js';
import { isAdmin, canVerFinanzas } from '../roles.js';
import { de } from '../memo.js';
import { membrete, pies } from '../membrete.js';
import { asignarColeccion } from '../data.js';
import { tocarDatos } from '../memo.js';

const LETRA = { 1: 'A', 6: 'B', 11: 'C' };
const cfg = () => Object.assign({ modo: 'homologacion', ptoVta: 1, condicion: 'monotributo' }, settings.arca || {});
const numeroFactura = f => String(f.ptoVta).padStart(5, '0') + '-' + String(f.numero).padStart(8, '0');

async function llamar(cuerpo) {
  const g = await sb.auth.getSession();
  const token = g.data && g.data.session && g.data.session.access_token;
  if (!token) return { ok: false, error: 'Tenés que iniciar sesión' };
  try {
    const c = cfg();
    const r = await fetch(SUPABASE_URL + '/functions/v1/facturar-arca', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ modo: c.modo, ptoVta: c.ptoVta, condicion: c.condicion, cuit: settings.pagoCuit || '' }, cuerpo)),
    });
    const j = await r.json().catch(() => null);
    if (!j) return { ok: false, error: r.status === 404 ? 'Falta publicar la función facturar-arca en Supabase' : 'No respondió el servidor' };
    return j;
  } catch (e) { return { ok: false, error: 'Sin conexión' }; }
}

export function arcaForm() {
  if (!isAdmin()) { toast('Solo un administrador puede configurar la facturación'); return; }
  const c = cfg();
  openModal('<h3>Facturación electrónica (ARCA)</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Para que cada cobro pueda salir con su factura. Se configura una sola vez. Empezá en <b>modo prueba</b> (homologación): las facturas no valen, sirven para probar. Cuando ande, pasá a producción y repetí los pasos 1 y 2.</div>' +
    '<div class="two"><label class="f"><span>Modo</span><select id="ar_modo"><option value="homologacion"' + (c.modo !== 'produccion' ? ' selected' : '') + '>Prueba (homologación)</option><option value="produccion"' + (c.modo === 'produccion' ? ' selected' : '') + '>Producción (facturas reales)</option></select></label>' +
    '<label class="f"><span>Punto de venta</span><input id="ar_pv" inputmode="numeric" value="' + esc(c.ptoVta) + '"></label></div>' +
    '<label class="f"><span>La empresa es</span><select id="ar_cond"><option value="monotributo"' + (c.condicion !== 'ri' ? ' selected' : '') + '>Monotributista (factura C)</option><option value="ri"' + (c.condicion === 'ri' ? ' selected' : '') + '>Responsable inscripto (factura A o B, con IVA 21%)</option></select></label>' +
    '<label class="f"><span>CUIT de la empresa</span><input id="ar_cuit" inputmode="numeric" value="' + esc(settings.pagoCuit || '') + '"></label>' +
    '<button class="btn sec block" onclick="guardarArca()">Guardar estos datos</button>' +
    '<div class="sec-t">Paso 1: pedido de certificado</div>' +
    '<div class="small muted">Tocá el botón: se crea la clave (queda guardada en tu Supabase, nunca sale) y aparece un texto. Copialo y pegalo en ARCA → Administración de Certificados Digitales → Agregar alias.</div>' +
    '<button class="btn sec block" style="margin-top:6px" onclick="generarCsrArca()">Generar pedido de certificado</button><div id="ar_csr"></div>' +
    '<div class="sec-t">Paso 2: certificado de ARCA</div>' +
    '<div class="small muted">ARCA te da un archivo .crt. Abrilo con el Bloc de notas, copiá todo el texto y pegalo acá.</div>' +
    '<textarea id="ar_cert" rows="4" style="width:100%;margin-top:6px" placeholder="-----BEGIN CERTIFICATE-----"></textarea>' +
    '<button class="btn sec block" style="margin-top:6px" onclick="guardarCertArca()">Guardar certificado</button>' +
    '<div class="sec-t">Paso 3: probar</div>' +
    '<div class="small muted">Antes, en ARCA: Administrador de Relaciones → autorizá el servicio "Facturación electrónica" al certificado, y creá el punto de venta "RECE para aplicativo y web services".</div>' +
    '<button class="btn block" style="margin-top:6px" onclick="probarArca()">Probar la conexión</button><div id="ar_estado" class="small" style="margin-top:6px"></div>' +
    '<button class="btn sec block" style="margin-top:12px" onclick="closeModal()">Cerrar</button>');
}
function leerForm() {
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  return { modo: v('ar_modo') === 'produccion' ? 'produccion' : 'homologacion', ptoVta: Math.max(1, Math.round(+v('ar_pv') || 1)), condicion: v('ar_cond') === 'ri' ? 'ri' : 'monotributo', cuit: v('ar_cuit').replace(/\D/g, '') };
}
export function guardarArca(silencioso) {
  const f = leerForm();
  saveSettings({ arca: { modo: f.modo, ptoVta: f.ptoVta, condicion: f.condicion }, pagoCuit: f.cuit || settings.pagoCuit });
  if (!silencioso) toast('Datos de facturación guardados');
}
export async function generarCsrArca() {
  guardarArca(true);
  const el = document.getElementById('ar_csr');
  if ((settings.pagoCuit || '').replace(/\D/g, '').length !== 11) { toast('Poné el CUIT de la empresa (11 números)'); return; }
  el.innerHTML = '<div class="small muted">Generando…</div>';
  const j = await llamar({ accion: 'generar_csr', nombre: settings.companyName || 'LD Rental' });
  if (!j.ok) { el.innerHTML = '<div class="small" style="color:var(--bad)">' + esc(j.error) + '</div>'; return; }
  el.innerHTML = '<textarea id="ar_csrTxt" rows="5" readonly style="width:100%;margin-top:6px;font-size:11px">' + esc(j.csr) + '</textarea>' +
    '<button class="btn sec sm" onclick="navigator.clipboard.writeText(document.getElementById(\'ar_csrTxt\').value).then(()=>toast(\'Copiado\'))">Copiar</button>';
}
export async function guardarCertArca() {
  guardarArca(true);
  const pem = ((document.getElementById('ar_cert') || {}).value || '').trim();
  if (!pem) { toast('Pegá el certificado'); return; }
  const j = await llamar({ accion: 'guardar_certificado', certificado: pem });
  if (!j.ok) { toast(j.error); return; }
  toast('Certificado guardado. Vence el ' + fdate(j.vence));
}
export async function probarArca() {
  guardarArca(true);
  const el = document.getElementById('ar_estado'); el.textContent = 'Probando…'; el.style.color = 'var(--muted)';
  const j = await llamar({ accion: 'estado' });
  if (!j.ok) { el.style.color = 'var(--bad)'; el.textContent = j.error === 'sin_certificado' ? 'Falta hacer los pasos 1 y 2.' : j.error; return; }
  el.style.color = 'var(--ok)';
  el.textContent = '✓ Conectado con ARCA (' + (j.modo === 'produccion' ? 'producción' : 'prueba') + '). Factura ' + LETRA[j.tipo] + ', punto de venta ' + j.ptoVta + ': la última emitida es la ' + j.ultimo + '.' + (j.certificadoVence ? ' El certificado vence el ' + fdate(j.certificadoVence) + '.' : '');
}

// Botón del cobro: "Facturar" o, si ya tiene, "Factura".
export function botonFactura(p) {
  if (!settings.arca || !canVerFinanzas() || !(+p.monto > 0)) return '';
  return p.factura && p.factura.cae
    ? '<button class="btn sec sm" onclick="facturaPDF(\'' + p.id + '\')">Factura ' + esc(LETRA[p.factura.tipo] || '') + '</button>'
    : '<button class="btn sec sm" onclick="facturarCobro(\'' + p.id + '\',this)">Facturar</button>';
}
export async function facturarCobro(id, btn) {
  const p = S.payments.find(x => x.id === id); if (!p) return;
  if (p.factura && p.factura.cae) { facturaPDF(id); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Facturando…'; }
  const j = await llamar({ accion: 'facturar', paymentId: id });
  if (btn) { btn.disabled = false; btn.textContent = 'Facturar'; }
  if (!j.ok) { toast(j.error === 'sin_certificado' ? 'Falta configurar la facturación (Más → Facturación electrónica)' : j.error); return; }
  // La función ya lo guardó en la base; lo reflejamos acá sin esperar el aviso en vivo.
  asignarColeccion('payments', S.payments.map(x => (x.id === id ? Object.assign({}, x, { factura: j.factura }) : x))); tocarDatos();
  toast('Factura ' + (LETRA[j.factura.tipo] || '') + ' ' + numeroFactura(j.factura) + ' emitida' + (j.factura.modo !== 'produccion' ? ' (modo prueba)' : ''));
  window.render(); facturaPDF(id);
}
export async function facturaPDF(id) {
  const p = S.payments.find(x => x.id === id); const f = p && p.factura; if (!f) return;
  const c = de('cars', 'id', p.carId)[0] || {};
  const { jsPDF } = await import('jspdf');
  const QR = (await import('qrcode')).default;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const letra = LETRA[f.tipo] || '';
  let y = membrete(doc, { titulo: 'Factura ' + letra, numero: numeroFactura(f), fecha: f.fecha });
  if (f.modo !== 'produccion') { doc.setTextColor(200, 0, 0); doc.setFontSize(9); doc.text('COMPROBANTE DE PRUEBA (HOMOLOGACIÓN) — SIN VALIDEZ FISCAL', 15, y - 3); doc.setTextColor(0); }
  doc.setFontSize(28); doc.setFont(undefined, 'bold'); doc.text(letra, 105, y + 6, { align: 'center' }); doc.setFont(undefined, 'normal');
  doc.setFontSize(7); doc.text('Cód. ' + String(f.tipo).padStart(3, '0'), 105, y + 10, { align: 'center' });
  y += 18; doc.setFontSize(10);
  const linea = (a, b) => { doc.setTextColor(110); doc.text(a, 15, y); doc.setTextColor(0); doc.text(String(b), 60, y); y += 6; };
  linea('Emisor', (settings.companyName || '') + ' · CUIT ' + f.cuitEmisor + ' · ' + (settings.arca && settings.arca.condicion === 'ri' ? 'IVA Responsable inscripto' : 'Responsable monotributo'));
  linea('Cliente', f.receptor || '—');
  linea(f.docTipo === 80 ? 'CUIT' : f.docTipo === 96 ? 'DNI' : 'Documento', f.docNro || '—');
  linea('Condición IVA', { 1: 'Responsable inscripto', 4: 'Exento', 5: 'Consumidor final', 6: 'Monotributista' }[f.condRec] || '—');
  linea('Período', fdate(f.desde) + (f.hasta !== f.desde ? ' al ' + fdate(f.hasta) : ''));
  y += 4; doc.setDrawColor(200); doc.line(15, y, 195, y); y += 8;
  doc.text('Alquiler de vehículo' + (c.patente ? ' patente ' + c.patente : '') + (p.tipo === 'cuota' ? ' (cuota de financiación)' : ''), 15, y);
  doc.text(money(f.total), 195, y, { align: 'right' }); y += 10;
  if (f.iva) { linea('Neto gravado', money(f.neto)); linea('IVA 21%', money(f.iva)); }
  doc.setFont(undefined, 'bold'); doc.setFontSize(12); doc.text('Total', 15, y + 2); doc.text(money(f.total), 195, y + 2, { align: 'right' }); doc.setFont(undefined, 'normal'); doc.setFontSize(10);
  y += 14;
  // QR obligatorio de ARCA.
  const datosQR = { ver: 1, fecha: f.fecha, cuit: +f.cuitEmisor, ptoVta: f.ptoVta, tipoCmp: f.tipo, nroCmp: f.numero, importe: f.total, moneda: 'PES', ctz: 1, tipoDocRec: f.docTipo, nroDocRec: +f.docNro || 0, tipoCodAut: 'E', codAut: +f.cae };
  const url = 'https://www.afip.gob.ar/fe/qr/?p=' + btoa(JSON.stringify(datosQR));
  doc.addImage(await QR.toDataURL(url, { margin: 1, width: 300 }), 'PNG', 15, y, 32, 32);
  doc.text('CAE: ' + f.cae, 55, y + 10);
  doc.text('Vencimiento del CAE: ' + fdate(String(f.caeVto).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')), 55, y + 16);
  doc.setFontSize(8); doc.setTextColor(110); doc.text('Comprobante autorizado por ARCA', 55, y + 22); doc.setTextColor(0);
  pies(doc, numeroFactura(f));
  doc.save('factura-' + letra + '-' + numeroFactura(f) + '.pdf');
}
