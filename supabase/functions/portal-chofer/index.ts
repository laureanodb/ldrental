// LD Rental — portal para choferes, sin login.
// GET ?id=<driverId>&t=<portalToken>: si el token coincide con el guardado
// en el chofer, devuelve su deuda, próximo pago, cronograma de cuotas si
// es financiado, datos del auto asignado, los últimos pagos, sus multas
// pendientes y la config compartida (branding, protocolo de emergencia,
// anuncios) desde app_settings, y links de descarga (1 hora) de la credencial
// de circulación y el certificado de cobertura del seguro de su auto. No
// expone nada de otros choferes ni de la operación en general.
// POST { id, t, accion, ... } valida el mismo token. Acciones:
// - service: pide turno de service (queda en el auto para que la empresa lo confirme).
// - problema: reporta una falla con fotos; abre una orden de trabajo "reportada".
// - actualizar_datos: teléfono, domicilio o email nuevos, para que la empresa los apruebe.
// - tablero: lee con IA la foto del tablero (km, combustible, luces); 'km' confirma y guarda.
// - auxilio: manda la ubicación del chofer para que lo vayan a buscar.
// - opinion: el chofer dice si un arreglo quedó bien o sigue fallando.
// - encuesta, foto, comprobante, documento, firmar_contrato: como antes.
// Todo valida que el auto sea del chofer y avisa a la empresa con una notificación.
// El token se genera y se puede regenerar desde la ficha del chofer en la app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const METODOS: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercadopago: 'MercadoPago', otro: 'Otro' };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const BUCKET = Deno.env.get('DOCUMENTOS_BUCKET') || 'documentos';
const MAX_FOTO_BYTES = 8 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
// Documentos del seguro que el chofer puede descargar (por si lo para la policía).
// La póliza no se muestra: solo la credencial de circulación y el certificado.
const DOCS_SEGURO_CHOFER: [string, string][] = [['seguroCredencial', 'Credencial de circulación'], ['seguroCertificado', 'Certificado de cobertura']];
async function docsSeguroDe(sb: any, c: any) {
  const out: any[] = [];
  for (const [cat, label] of DOCS_SEGURO_CHOFER) {
    const f = (c.files || []).filter((x: any) => x.cat === cat).sort((a: any, b: any) => String(b.fecha || '').localeCompare(String(a.fecha || '')))[0];
    if (!f) continue;
    let url = f.link || '';
    if (!url && f.id) {
      const { data } = await sb.storage.from(BUCKET).createSignedUrl(f.id, 3600);
      url = (data && data.signedUrl) || '';
    }
    if (url) out.push({ cat, label, url, fecha: f.fecha || '', tipo: f.type || '' });
  }
  return out;
}
// Documentos del chofer con vencimiento que puede renovar desde el portal.
const DOCS_CHOFER: Record<string, { label: string; campo: string; archivo: string }> = {
  lic: { label: 'Licencia de conducir', campo: 'licVenc', archivo: 'licencia' },
  ant: { label: 'Certificado de antecedentes', campo: 'antecedentesVenc', archivo: 'antecedentes' },
};
function diasEntre(fechaIso: string, hoy: Date): number {
  return Math.round((hoy.getTime() - new Date(fechaIso + 'T00:00:00').getTime()) / 86400000);
}

const hoyIso = () => new Date().toISOString().slice(0, 10);
const txt = (v: unknown, max = 300) => String(v || '').trim().slice(0, max);
const nuevoId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
// Sube una imagen en base64 al bucket y devuelve el path, o un error para el chofer.
async function subirImagen(sb: any, dataUrl: string, prefijo: string): Promise<{ path?: string; type?: string; size?: number; error?: string }> {
  const m = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return { error: 'Foto inválida' };
  const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  if (bytes.byteLength > MAX_FOTO_BYTES) return { error: 'La foto es muy pesada' };
  const ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg';
  const path = new Date().getFullYear() + '/' + prefijo + '-' + crypto.randomUUID() + '.' + ext;
  const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: m[1], upsert: false });
  if (up.error) return { error: 'No se pudo subir: ' + up.error.message };
  return { path, type: m[1], size: bytes.byteLength };
}
// Auto del chofer (valida que esté asignado a él). Acepta el id o la patente.
async function autoDelChofer(sb: any, driverId: string, carId: string, patente?: string) {
  let row: any = null;
  if (carId) { const { data } = await sb.from('cars').select('id,data').eq('id', carId).maybeSingle(); row = data; }
  else if (patente) {
    const { data } = await sb.from('cars').select('id,data');
    row = (data || []).find((r: any) => r.data && r.data.choferId === driverId && String(r.data.patente || '').toUpperCase() === patente.toUpperCase()) || null;
  }
  if (!row || !row.data || row.data.choferId !== driverId) return null;
  return row;
}
async function guardarAuto(sb: any, row: any, patch: any) {
  const { data: fresco } = await sb.from('cars').select('id,data').eq('id', row.id).maybeSingle();
  const base = (fresco && fresco.data) || row.data;
  const upd = await sb.from('cars').update({ data: Object.assign({}, base, typeof patch === 'function' ? (patch as any)(base) : patch), updated_at: new Date().toISOString() }).eq('id', row.id);
  return upd.error ? upd.error.message : '';
}
const ESTADOS_OT: Record<string, string> = { reportada: 'Recibido, la empresa lo va a revisar', abierta: 'Abierta', en_reparacion: 'En reparación', esperando_repuesto: 'Esperando un repuesto', lista: 'Listo para retirar', cerrada: 'Terminado', cancelada: 'Cancelado' };
// Próximos services del plan del auto, con km y fecha estimada.
function planService(c: any) {
  const km = +c.km || 0;
  return (c.mantenimientoPlan || []).filter((p: any) => p.intervaloKm || p.intervaloMeses).map((p: any) => {
    const proxKm = p.intervaloKm ? (+p.ultimoKm || 0) + +p.intervaloKm : null;
    let proxFecha = '';
    if (p.intervaloMeses && p.ultimaFecha) { const f = new Date(p.ultimaFecha + 'T00:00:00'); f.setMonth(f.getMonth() + +p.intervaloMeses); proxFecha = f.toISOString().slice(0, 10); }
    const faltanKm = proxKm != null ? proxKm - km : null;
    const faltanDias = proxFecha ? Math.round((new Date(proxFecha + 'T00:00:00').getTime() - Date.now()) / 86400000) : null;
    const vencido = (faltanKm != null && faltanKm <= 0) || (faltanDias != null && faltanDias <= 0);
    const pronto = !vencido && ((faltanKm != null && faltanKm <= 1500) || (faltanDias != null && faltanDias <= 20));
    return { label: p.label || p.item, proxKm, proxFecha, faltanKm, faltanDias, estado: vencido ? 'vencido' : pronto ? 'pronto' : 'ok' };
  }).sort((a: any, b: any) => (a.faltanKm ?? 1e9) - (b.faltanKm ?? 1e9));
}

async function avisarPush(sb: any, title: string, body: string) {
  try {
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!vapidPublic || !vapidPrivate) return;
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    const { data: subs } = await sb.from('push_subscriptions').select('id,endpoint,p256dh,auth');
    for (const s of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title, body, url: './' })
        );
      } catch (e: any) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) await sb.from('push_subscriptions').delete().eq('id', s.id);
      }
    }
  } catch (e) { /* best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, serviceKey);

  if (req.method === 'POST') {
    try {
      const body = await req.json().catch(() => ({}));
      const driverId = String(body.id || '');
      const token = String(body.t || '');
      if (!driverId || !token) return json({ ok: false, error: 'Faltan parámetros' }, 400);
      const { data: driverRow } = await sb.from('drivers').select('id,data').eq('id', driverId).maybeSingle();
      if (!driverRow || !driverRow.data || driverRow.data.portalToken !== token) return json({ ok: false, error: 'Link inválido' }, 403);
      const d = Object.assign({ id: driverRow.id }, driverRow.data);
      if (d.portalDesactivado) return json({ ok: false, error: 'El acceso al portal está desactivado temporalmente' }, 403);
      const accion = String(body.accion || '');
      if (accion === 'service') {
        const row = await autoDelChofer(sb, driverId, String(body.carId || ''), txt(body.patente, 20));
        if (!row) return json({ ok: false, error: 'Elegí tu auto' }, 400);
        const motivo = txt(body.motivo);
        const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha || '')) ? String(body.fecha) : '';
        const turno = { id: nuevoId(), pedidoEl: hoyIso(), fecha, hora: txt(body.hora, 10), motivo, estado: 'pedido' };
        const err = await guardarAuto(sb, row, (c: any) => ({ turnosService: (c.turnosService || []).concat([turno]) }));
        if (err) return json({ ok: false, error: 'No se pudo guardar: ' + err }, 500);
        await avisarPush(sb, 'Turno de service pedido', (d.nombre || 'Chofer') + ' · ' + (row.data.patente || '') + (fecha ? ' · para el ' + fecha.split('-').reverse().join('/') : '') + (motivo ? ': ' + motivo : ''));
      } else if (accion === 'problema') {
        const row = await autoDelChofer(sb, driverId, String(body.carId || ''), txt(body.patente, 20));
        if (!row) return json({ ok: false, error: 'Elegí tu auto' }, 400);
        const descripcion = txt(body.descripcion, 500);
        if (!descripcion) return json({ ok: false, error: 'Contá qué pasó' }, 400);
        const urgente = Boolean(body.urgente);
        const fotos: any[] = [];
        for (const img of (Array.isArray(body.fotos) ? body.fotos : []).slice(0, 3)) {
          const r = await subirImagen(sb, img, 'falla');
          if (r.error) return json({ ok: false, error: r.error }, 400);
          fotos.push({ id: r.path, name: 'falla-' + hoyIso() + '.jpg', type: r.type, fecha: hoyIso() });
        }
        const { data: todos } = await sb.from('cars').select('data');
        const numero = (todos || []).reduce((m: number, r: any) => Math.max(m, ...((r.data && r.data.ordenes) || []).map((o: any) => +o.numero || 0)), 0) + 1;
        const ot = { id: nuevoId(), numero, fecha: hoyIso(), estado: 'reportada', origen: 'portal', reportadoPor: d.nombre || 'Chofer', urgente, tipo: 'correctivo', titulo: descripcion.split(/[.\n]/)[0].slice(0, 80), descripcion, km: +row.data.km || 0, tareas: [], repuestos: [], horas: [], fotosAntes: fotos, fotosDespues: [] };
        const err = await guardarAuto(sb, row, (c: any) => ({ ordenes: (c.ordenes || []).concat([ot]) }));
        if (err) return json({ ok: false, error: 'No se pudo guardar: ' + err }, 500);
        await avisarPush(sb, (urgente ? '⚠ Problema urgente reportado' : 'Problema reportado'), (d.nombre || 'Chofer') + ' · ' + (row.data.patente || '') + ': ' + descripcion.slice(0, 140));
        return json({ ok: true, numero });
      } else if (accion === 'actualizar_datos') {
        const cambios = { tel: txt(body.tel, 40), domicilio: txt(body.domicilio, 200), email: txt(body.email, 120), fecha: hoyIso() };
        if (!cambios.tel && !cambios.domicilio && !cambios.email) return json({ ok: false, error: 'Completá al menos un dato' }, 400);
        const upd = await sb.from('drivers').update({ data: Object.assign({}, driverRow.data, { cambiosPendientes: cambios }), updated_at: new Date().toISOString() }).eq('id', driverId);
        if (upd.error) return json({ ok: false, error: 'No se pudo guardar: ' + upd.error.message }, 500);
        await avisarPush(sb, 'Chofer pidió actualizar sus datos', (d.nombre || 'Chofer') + (cambios.tel ? ' · Tel: ' + cambios.tel : '') + (cambios.domicilio ? ' · Domicilio: ' + cambios.domicilio : '') + (cambios.email ? ' · Email: ' + cambios.email : ''));
      } else if (accion === 'tablero') {
        const row = await autoDelChofer(sb, driverId, String(body.carId || ''));
        if (!row) return json({ ok: false, error: 'Elegí tu auto' }, 400);
        const r = await subirImagen(sb, String(body.imagen || ''), 'tablero');
        if (r.error) return json({ ok: false, error: r.error }, 400);
        let lectura: any = null;
        try {
          const resp = await fetch(supabaseUrl + '/functions/v1/leer-documento', { method: 'POST', headers: { Authorization: 'Bearer ' + serviceKey, apikey: serviceKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'tablero', path: r.path }) });
          const j = await resp.json().catch(() => null);
          if (j && j.ok) lectura = j.datos;
        } catch (e) { /* sin lectura: el chofer escribe el km a mano */ }
        return json({ ok: true, path: r.path, kmActual: +row.data.km || 0, lectura });
      } else if (accion === 'km') {
        const row = await autoDelChofer(sb, driverId, String(body.carId || ''));
        if (!row) return json({ ok: false, error: 'Elegí tu auto' }, 400);
        const km = Math.round(+body.km || 0);
        const actual = +row.data.km || 0;
        if (!km || km < actual) return json({ ok: false, error: 'El kilometraje tiene que ser mayor al último cargado (' + actual.toLocaleString('es-AR') + ' km)' }, 400);
        if (km - actual > 20000) return json({ ok: false, error: 'Son más de 20.000 km desde la última carga: revisá el número' }, 400);
        const path = String(body.path || '');
        const testigos = (Array.isArray(body.testigos) ? body.testigos : []).map((t: unknown) => txt(t, 40)).filter(Boolean).slice(0, 10);
        const pct = Number.isFinite(+body.combustiblePct) && +body.combustiblePct >= 0 ? Math.round(+body.combustiblePct) : null;
        const err = await guardarAuto(sb, row, (c: any) => {
          const patch: any = { km, kmHistorial: (c.kmHistorial || []).concat([{ fecha: hoyIso(), km, origen: 'portal' }]) };
          if (/^\d{4}\/tablero-[\w-]+\.(jpg|png|webp)$/.test(path)) patch.files = (c.files || []).concat([{ id: path, name: 'tablero-' + hoyIso() + '.jpg', cat: 'fotos', type: 'image/jpeg', fecha: hoyIso(), subidoPorChofer: true }]);
          if (pct != null) patch.ultimoCombustible = { fecha: hoyIso(), pct };
          if (testigos.length) patch.testigosPortal = (c.testigosPortal || []).concat([{ fecha: hoyIso(), testigos }]).slice(-10);
          return patch;
        });
        if (err) return json({ ok: false, error: 'No se pudo guardar: ' + err }, 500);
        if (testigos.length) await avisarPush(sb, 'Luces encendidas en el tablero', (row.data.patente || '') + ': ' + testigos.join(', ') + ' (' + (d.nombre || 'chofer') + ')');
      } else if (accion === 'auxilio') {
        const row = await autoDelChofer(sb, driverId, String(body.carId || ''));
        if (!row) return json({ ok: false, error: 'Elegí tu auto' }, 400);
        const lat = +body.lat, lng = +body.lng;
        const conUbicacion = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);
        const aux = { id: nuevoId(), fecha: new Date().toISOString(), choferId: driverId, lat: conUbicacion ? lat : null, lng: conUbicacion ? lng : null, precision: Math.round(+body.precision || 0), mensaje: txt(body.mensaje), atendido: false };
        const err = await guardarAuto(sb, row, (c: any) => ({ auxilios: (c.auxilios || []).concat([aux]).slice(-20) }));
        if (err) return json({ ok: false, error: 'No se pudo guardar: ' + err }, 500);
        await avisarPush(sb, '🆘 Pedido de auxilio', (d.nombre || 'Chofer') + ' · ' + (row.data.patente || '') + (aux.mensaje ? ': ' + aux.mensaje : '') + (conUbicacion ? ' · https://maps.google.com/?q=' + lat + ',' + lng : ' · sin ubicación'));
      } else if (accion === 'opinion') {
        const resultado = body.resultado === 'bien' ? 'bien' : 'sigue_fallando';
        const opinion = { resultado, comentario: txt(body.comentario), fecha: hoyIso() };
        if (body.otId) {
          const row = await autoDelChofer(sb, driverId, String(body.carId || ''));
          if (!row) return json({ ok: false, error: 'Auto no asignado a este chofer' }, 403);
          const err = await guardarAuto(sb, row, (c: any) => ({ ordenes: (c.ordenes || []).map((o: any) => (o.id === body.otId ? Object.assign({}, o, { opinionChofer: opinion }) : o)) }));
          if (err) return json({ ok: false, error: 'No se pudo guardar: ' + err }, 500);
        } else if (body.mantId) {
          const { data: m } = await sb.from('mantenimientos').select('id,data').eq('id', String(body.mantId)).maybeSingle();
          if (!m || !m.data) return json({ ok: false, error: 'No se encontró el arreglo' }, 404);
          const row = await autoDelChofer(sb, driverId, String(m.data.carId || ''));
          if (!row) return json({ ok: false, error: 'Auto no asignado a este chofer' }, 403);
          const upd = await sb.from('mantenimientos').update({ data: Object.assign({}, m.data, { opinionChofer: opinion }), updated_at: new Date().toISOString() }).eq('id', m.id);
          if (upd.error) return json({ ok: false, error: 'No se pudo guardar: ' + upd.error.message }, 500);
        } else return json({ ok: false, error: 'Falta el arreglo' }, 400);
        if (resultado !== 'bien') await avisarPush(sb, 'Un arreglo sigue fallando', (d.nombre || 'Chofer') + (opinion.comentario ? ': ' + opinion.comentario : ''));
      } else if (accion === 'encuesta') {
        const rating = Math.max(1, Math.min(5, +body.rating || 0));
        const comentario = String(body.comentario || '').trim().slice(0, 300);
        await sb.from('encuestas').insert({
          id: crypto.randomUUID(),
          data: { choferId: driverId, rating, comentario, fecha: new Date().toISOString().slice(0, 10) },
        });
        await avisarPush(sb, 'Encuesta de satisfacción', (d.nombre || 'Chofer') + ' · ' + rating + '/5' + (comentario ? ' — ' + comentario : ''));
      } else if (accion === 'foto') {
        const carId = String(body.carId || '');
        const dataUrl = String(body.imagen || '');
        const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
        if (!carId || !m) return json({ ok: false, error: 'Foto inválida' }, 400);
        const { data: carRow } = await sb.from('cars').select('id,data').eq('id', carId).maybeSingle();
        if (!carRow || !carRow.data || carRow.data.choferId !== driverId) return json({ ok: false, error: 'Auto no asignado a este chofer' }, 403);
        const contentType = m[1];
        const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
        if (bytes.byteLength > MAX_FOTO_BYTES) return json({ ok: false, error: 'La foto es muy pesada' }, 400);
        const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
        const path = new Date().getFullYear() + '/portal-' + crypto.randomUUID() + '.' + ext;
        const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
        if (up.error) return json({ ok: false, error: 'No se pudo subir: ' + up.error.message }, 500);
        const c = Object.assign({ id: carRow.id }, carRow.data);
        const files = (c.files || []).concat([{ id: path, name: 'foto-chofer-' + new Date().toISOString().slice(0, 10) + '.' + ext, cat: 'fotos', type: contentType, size: bytes.byteLength, fecha: new Date().toISOString().slice(0, 10), subidoPorChofer: true }]);
        const upd = await sb.from('cars').update({ data: Object.assign({}, c, { files }) }).eq('id', carId);
        if (upd.error) return json({ ok: false, error: 'No se pudo guardar: ' + upd.error.message }, 500);
        await avisarPush(sb, 'Foto subida por ' + (d.nombre || 'un chofer'), c.patente ? 'Auto ' + c.patente : 'Foto nueva en un auto');
      } else if (accion === 'comprobante') {
        const carId = String(body.carId || '');
        const dataUrl = String(body.imagen || '');
        const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
        if (!m) return json({ ok: false, error: 'Comprobante inválido' }, 400);
        const contentType = m[1];
        const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
        if (bytes.byteLength > MAX_FOTO_BYTES) return json({ ok: false, error: 'El archivo es muy pesado' }, 400);
        const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
        const path = new Date().getFullYear() + '/comprobante-' + crypto.randomUUID() + '.' + ext;
        const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
        if (up.error) return json({ ok: false, error: 'No se pudo subir: ' + up.error.message }, 500);
        const comprobantes = (driverRow.data.comprobantesPortal || []).concat([{ id: path, carId, type: contentType, size: bytes.byteLength, fecha: new Date().toISOString().slice(0, 10) }]);
        const upd = await sb.from('drivers').update({ data: Object.assign({}, driverRow.data, { comprobantesPortal: comprobantes }) }).eq('id', driverId);
        if (upd.error) return json({ ok: false, error: 'No se pudo guardar: ' + upd.error.message }, 500);
        await avisarPush(sb, 'Comprobante subido por ' + (d.nombre || 'un chofer'), 'Revisalo en la ficha del chofer');
      } else if (accion === 'documento') {
        // El chofer sube la licencia o el certificado de antecedentes nuevo;
        // queda para que la empresa lo revise y actualice el vencimiento.
        const tipo = String(body.tipo || '');
        if (!DOCS_CHOFER[tipo]) return json({ ok: false, error: 'Documento inválido' }, 400);
        const vence = /^\d{4}-\d{2}-\d{2}$/.test(String(body.vence || '')) ? String(body.vence) : '';
        const m = String(body.imagen || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
        if (!m) return json({ ok: false, error: 'Foto inválida' }, 400);
        const contentType = m[1];
        const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
        if (bytes.byteLength > MAX_FOTO_BYTES) return json({ ok: false, error: 'La foto es muy pesada' }, 400);
        const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
        const path = new Date().getFullYear() + '/doc-' + tipo + '-' + crypto.randomUUID() + '.' + ext;
        const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
        if (up.error) return json({ ok: false, error: 'No se pudo subir: ' + up.error.message }, 500);
        const fecha = new Date().toISOString().slice(0, 10);
        const actual = driverRow.data;
        const files = (actual.files || []).concat([{ id: path, name: DOCS_CHOFER[tipo].archivo + '-' + fecha + '.' + ext, cat: tipo, type: contentType, size: bytes.byteLength, fecha, subidoPorChofer: true }]);
        const docsPortal = (actual.docsPortal || []).concat([{ id: path, tipo, fecha, venceInformado: vence, type: contentType }]);
        const upd = await sb.from('drivers').update({ data: Object.assign({}, actual, { files, docsPortal }) }).eq('id', driverId);
        if (upd.error) return json({ ok: false, error: 'No se pudo guardar: ' + upd.error.message }, 500);
        await avisarPush(sb, DOCS_CHOFER[tipo].label + ' nueva de ' + (d.nombre || 'un chofer'), (vence ? 'Vence el ' + vence.split('-').reverse().join('/') + '. ' : '') + 'Revisala en la ficha del chofer.');
      } else if (accion === 'firmar_contrato') {
        // Firma remota del contrato: valida que el auto sea del chofer y que el
        // pedido de firma siga pendiente; guarda la firma, quién, cuándo y la IP.
        const carId = String(body.carId || '');
        const firmaId = String(body.firmaId || '');
        const nombre = String(body.nombre || '').trim().slice(0, 120);
        const dni = String(body.dni || '').replace(/\D/g, '').slice(0, 12);
        const m = String(body.firma || '').match(/^data:image\/png;base64,(.+)$/);
        if (!carId || !firmaId || !m || nombre.length < 3 || !body.acepto) return json({ ok: false, error: 'Faltan datos para firmar' }, 400);
        const { data: carRow } = await sb.from('cars').select('id,data').eq('id', carId).maybeSingle();
        if (!carRow || !carRow.data || carRow.data.choferId !== driverId) return json({ ok: false, error: 'Auto no asignado a este chofer' }, 403);
        const f = carRow.data.firmaRemota;
        if (!f || f.id !== firmaId || f.choferId !== driverId) return json({ ok: false, error: 'Este contrato ya no está para firmar' }, 409);
        if (f.estado !== 'pendiente') return json({ ok: false, error: 'Este contrato ya fue firmado' }, 409);
        const bytes = Uint8Array.from(atob(m[1]), c => c.charCodeAt(0));
        if (bytes.byteLength > 600 * 1024) return json({ ok: false, error: 'La firma es muy pesada' }, 400);
        const path = new Date().getFullYear() + '/firma-' + crypto.randomUUID() + '.png';
        const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/png', upsert: false });
        if (up.error) return json({ ok: false, error: 'No se pudo guardar la firma: ' + up.error.message }, 500);
        const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 60);
        const firmada = Object.assign({}, f, { estado: 'firmado', firmadoEn: new Date().toISOString(), firmaPath: path, nombreFirmante: nombre, dniFirmante: dni, ip, userAgent: (req.headers.get('user-agent') || '').slice(0, 200) });
        const upd = await sb.from('cars').update({ data: Object.assign({}, carRow.data, { firmaRemota: firmada }) }).eq('id', carId);
        if (upd.error) return json({ ok: false, error: 'No se pudo guardar: ' + upd.error.message }, 500);
        await avisarPush(sb, 'Contrato firmado por ' + (d.nombre || 'un chofer'), (carRow.data.patente ? 'Auto ' + carRow.data.patente + '. ' : '') + 'Descargalo desde la solapa Contrato del auto.');
      } else {
        return json({ ok: false, error: 'Acción inválida' }, 400);
      }
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  }

  try {
    const url = new URL(req.url);
    const driverId = url.searchParams.get('id') || '';
    const token = url.searchParams.get('t') || '';
    if (!driverId || !token) return json({ ok: false, error: 'Faltan parámetros' }, 400);

    const { data: driverRow } = await sb.from('drivers').select('id,data').eq('id', driverId).maybeSingle();
    if (!driverRow || !driverRow.data || driverRow.data.portalToken !== token) {
      return json({ ok: false, error: 'Link inválido' }, 403);
    }
    const d = Object.assign({ id: driverRow.id }, driverRow.data);
    if (d.portalDesactivado) return json({ ok: false, error: 'El acceso al portal está desactivado temporalmente' }, 403);

    const [{ data: carsRaw }, { data: paymentsRaw }, { data: multasRaw }, { data: settingsRow }, { data: depositosRaw }, { data: gastosRaw }, { data: mantRaw }] = await Promise.all([
      sb.from('cars').select('id,data'),
      sb.from('payments').select('id,data'),
      sb.from('multas').select('id,data'),
      sb.from('app_settings').select('data').eq('id', 'main').maybeSingle(),
      sb.from('depositos').select('id,data'),
      sb.from('gastos').select('id,data'),
      sb.from('mantenimientos').select('id,data'),
    ]);
    // Todos los autos que maneja (también el que está en el taller), para el estado del taller y el plan de service.
    const misAutos = (carsRaw || []).map((r: any) => Object.assign({ id: r.id }, r.data)).filter((c: any) => c.choferId === driverId && !c.vendido);
    const cars = (carsRaw || []).map((r: any) => Object.assign({ id: r.id }, r.data))
      .filter((c: any) => c.choferId === driverId && !c.vendido && (c.tipo === 'alquiler' || c.tipo === 'financiado'));
    const payments = (paymentsRaw || []).map((r: any) => Object.assign({ id: r.id }, r.data)).filter((p: any) => p.choferId === driverId);
    const depositos = (depositosRaw || []).map((r: any) => Object.assign({ id: r.id }, r.data)).filter((x: any) => x.driverId === driverId);
    const esGarantia = (x: any) => !x.tipo || x.tipo === 'cuota' || x.tipo === 'garantia';
    const saldoDeposito = depositos.filter(esGarantia).reduce((a: number, x: any) => a + (+x.monto || 0), 0);
    const saldoSemanaAdelantadaTotal = depositos.filter((x: any) => x.tipo === 'semana_adelantada').reduce((a: number, x: any) => a + (+x.monto || 0), 0);
    const multas = (multasRaw || []).map((r: any) => Object.assign({ id: r.id }, r.data))
      .filter((m: any) => m.choferId === driverId && (m.estado === 'pendiente' || m.estado === 'vencida'))
      .sort((a: any, b: any) => String(a.fecha).localeCompare(String(b.fecha)))
      .map((m: any) => ({ fecha: m.fecha, monto: +m.monto || 0, estado: m.estado, numeroActa: m.numeroActa || '', fechaLimitePago: m.fechaLimitePago || '' }));
    const cfg = (settingsRow && settingsRow.data) || {};
    // Seguro que paga la empresa y le cobra al chofer: cargos a su nombre menos lo que pagó.
    const seguroCargado = (gastosRaw || []).map((r: any) => r.data || {}).filter((g: any) => g.categoria === 'seguro' && g.recuperaDe === driverId)
      .reduce((a: number, g: any) => a + (+g.costo || 0), 0);
    const seguroPagado = payments.filter((p: any) => p.tipo === 'seguro').reduce((a: number, p: any) => a + (+p.monto || 0), 0);

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    let adelantoRestante = saldoSemanaAdelantadaTotal;

    const autos = cars.map((c: any) => {
      const moneda = c.tipo === 'financiado' ? 'USD' : 'ARS';
      let debt = 0, proximo: string | null = null, cuotaActual = 0, saldo: number | null = null, adelantoAplicado = 0;
      if (c.inicio && c.monto) {
        const dias = diasEntre(c.inicio, hoy);
        if (dias >= 0) {
          let weeks = Math.floor(dias / 7) + 1;
          cuotaActual = weeks;
          if (c.tipo === 'financiado' && c.cuotas) weeks = Math.min(weeks, +c.cuotas);
          const kind = c.tipo === 'alquiler' ? 'alquiler' : 'cuota';
          const paid = payments.filter((p: any) => p.carId === c.id && p.tipo === kind && p.fecha >= c.inicio)
            .reduce((a: number, p: any) => a + (+p.monto || 0), 0);
          const ajustes = (c.ajustesDeuda || []).reduce((a: number, x: any) => a + (+x.monto || 0), 0);
          const debtSinAdelanto = Math.max(0, weeks * c.monto - paid - ajustes);
          adelantoAplicado = Math.min(adelantoRestante, debtSinAdelanto);
          adelantoRestante -= adelantoAplicado;
          debt = Math.max(0, debtSinAdelanto - adelantoAplicado);
          const prox = new Date(c.inicio + 'T00:00:00'); prox.setDate(prox.getDate() + weeks * 7);
          proximo = prox.toISOString().slice(0, 10);
          if (c.tipo === 'financiado') {
            const total = +c.total || c.monto * (+c.cuotas || 0);
            saldo = Math.max(0, total - paid);
            if (c.cuotas) cuotaActual = Math.min(cuotaActual, +c.cuotas);
          }
        }
      }
      return { id: c.id, patente: c.patente || '', marca: c.marca || '', modelo: c.modelo || '', vtv: c.vtv || '', seguro: c.seguro || '', aseguradora: c.aseguradora || '', polizaNumero: c.polizaNumero || '', tipo: c.tipo, monto: +c.monto || 0, moneda, debt, proximo, cuotas: +c.cuotas || 0, cuotaActual, saldo, adelantoAplicado };
    });
    const contratosPendientes = cars.filter((c: any) => c.firmaRemota && c.firmaRemota.estado === 'pendiente' && c.firmaRemota.choferId === driverId)
      .map((c: any) => ({ carId: c.id, id: c.firmaRemota.id, patente: c.patente || '', titulo: c.firmaRemota.titulo || 'Contrato', parrafos: c.firmaRemota.parrafos || [] }));
    const docsPorAuto = await Promise.all(cars.map((c: any) => docsSeguroDe(sb, c).catch(() => [])));
    autos.forEach((a: any, i: number) => { a.docsSeguro = docsPorAuto[i]; });

    const pagos = payments.filter((p: any) => p.fecha).sort((a: any, b: any) => b.fecha.localeCompare(a.fecha)).slice(0, 100)
      .map((p: any) => {
        const c = cars.find((x: any) => x.id === p.carId);
        return { fecha: p.fecha, monto: +p.monto || 0, tipo: p.tipo, metodoLabel: METODOS[p.metodo] || '', patente: c ? c.patente : '' };
      });

    // Cuenta corriente resumida y plan de pagos (mismas cuentas que la app).
    const seguroPend = Math.max(0, seguroCargado - seguroPagado);
    const multasTotal = multas.reduce((a: number, m: any) => a + m.monto, 0);
    const adelantos = (d.adelantos || []).reduce((a: number, x: any) => a + (+x.monto || 0), 0);
    const deudaARS = Math.max(0, autos.filter((a: any) => a.moneda === 'ARS').reduce((s: number, a: any) => s + a.debt, 0) + seguroPend + multasTotal + adelantos);
    const deudaUSD = autos.filter((a: any) => a.moneda === 'USD').reduce((s: number, a: any) => s + a.debt, 0);
    let plan: any = null;
    if (d.planPagos && d.planPagos.activo) {
      const p = d.planPagos;
      const dd = diasEntre(p.inicio, hoy);
      const semanas = dd < 0 ? 0 : Math.min(+p.cuotas || 0, Math.floor(dd / 7) + 1);
      const deudaHoy = p.moneda === 'USD' ? deudaUSD : deudaARS;
      const deberiaQuedar = Math.max(0, (+p.deudaInicial || 0) - semanas * (+p.montoCuota || 0));
      plan = { moneda: p.moneda, cuotas: +p.cuotas || 0, montoCuota: +p.montoCuota || 0, inicio: p.inicio, deudaInicial: +p.deudaInicial || 0, semanas, deudaHoy, deberiaQuedar, alDia: deudaHoy <= deberiaQuedar + 0.5, cumplido: deudaHoy <= 0.5 };
    }

    // Taller: órdenes abiertas de sus autos y arreglos recientes para que diga si quedaron bien.
    const hace30 = new Date(hoy); hace30.setDate(hace30.getDate() - 30);
    const d30 = hace30.toISOString().slice(0, 10);
    const taller: any[] = [], arreglos: any[] = [];
    misAutos.forEach((c: any) => {
      const abiertas = (c.ordenes || []).filter((o: any) => !['cerrada', 'cancelada'].includes(o.estado));
      abiertas.forEach((o: any) => taller.push({ patente: c.patente || '', numero: o.numero || '', titulo: o.titulo || '', estado: o.estado, estadoTexto: ESTADOS_OT[o.estado] || o.estado, fecha: o.fecha || '', tareasHechas: (o.tareas || []).filter((t: any) => t.hecho).length, tareasTotal: (o.tareas || []).length }));
      if (c.tipo === 'taller' && !abiertas.length) taller.push({ patente: c.patente || '', numero: '', titulo: 'El auto está en el taller', estado: 'en_reparacion', estadoTexto: 'En el taller', fecha: '', tareasHechas: 0, tareasTotal: 0 });
      (c.ordenes || []).filter((o: any) => o.estado === 'cerrada' && (o.fechaCierre || '') >= d30 && !o.opinionChofer)
        .forEach((o: any) => arreglos.push({ tipo: 'ot', id: o.id, carId: c.id, patente: c.patente || '', titulo: o.titulo || 'Arreglo', fecha: o.fechaCierre }));
    });
    const misIds = new Set(misAutos.map((c: any) => c.id));
    (mantRaw || []).map((r: any) => Object.assign({ id: r.id }, r.data)).filter((m: any) => misIds.has(m.carId) && m.tipo === 'correctivo' && !m.otId && (m.fecha || '') >= d30 && !m.opinionChofer)
      .forEach((m: any) => { const c = misAutos.find((x: any) => x.id === m.carId); arreglos.push({ tipo: 'mant', id: m.id, carId: m.carId, patente: c ? c.patente : '', titulo: m.label || m.item || 'Arreglo', fecha: m.fecha }); });
    const extra = misAutos.map((c: any) => ({
      id: c.id, patente: c.patente || '', km: +c.km || 0, planService: planService(c),
      turnos: (c.turnosService || []).slice(-3).reverse().map((t: any) => ({ fecha: t.fechaConfirmada || t.fecha || '', hora: t.horaConfirmada || t.hora || '', motivo: t.motivo || '', estado: t.estado, nota: t.nota || '', pedidoEl: t.pedidoEl })),
    }));

    return json({
      ok: true, nombre: d.nombre || '', autos, pagos, multas, taller, arreglos, misAutos: extra,
      cambiosPendientes: d.cambiosPendientes || null,
      cuenta: { deudaARS, deudaUSD, adelantos }, plan, contratosPendientes,
      documentos: Object.entries(DOCS_CHOFER).map(([tipo, x]) => {
        const vence = d[x.campo] || '';
        const enRevision = (d.docsPortal || []).some((p: any) => p.tipo === tipo && !p.revisado && !p.rechazado);
        return { tipo, label: x.label, vence, dias: vence ? -diasEntre(vence, hoy) : null, enRevision };
      }),
      deposito: saldoDeposito, depositoObjetivo: +d.depositoObjetivo || 0,
      semanaAdelantada: Math.max(0, adelantoRestante),
      seguroPendiente: Math.max(0, seguroCargado - seguroPagado), seguroACargo: seguroCargado > 0,
      dolar: { tipo: cfg.tipoDolar || 'blue', precio: cfg.dolarPrecio === 'compra' ? 'compra' : 'venta', manual: +cfg.dolarManual || 0 },
      pago: { alias: cfg.pagoAlias || '', cbu: cfg.pagoCbu || '', titular: cfg.pagoTitular || '', cuit: cfg.pagoCuit || '', banco: cfg.pagoBanco || '', nota: cfg.pagoNota || '' },
      companyName: cfg.companyName || '', companyLogo: cfg.companyLogo || '', companyPhone: cfg.companyPhone || '',
      telefonoEmergencia: cfg.telefonoEmergencia || '', protocoloEmergencia: cfg.protocoloEmergencia || '', anuncios: cfg.anuncios || [],
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
