// LD Rental — portal para choferes, sin login.
// GET ?id=<driverId>&t=<portalToken>: si el token coincide con el guardado
// en el chofer, devuelve su deuda, próximo pago, cronograma de cuotas si
// es financiado, datos del auto asignado, los últimos pagos, sus multas
// pendientes y la config compartida (branding, protocolo de emergencia,
// anuncios) desde app_settings. No expone nada de otros choferes ni de la
// operación en general.
// POST { id, t, accion: 'service'|'problema'|'actualizar_datos'|'encuesta'|'foto', ... }:
// valida el mismo token. Todas menos 'foto' solo mandan una notificación
// push a la empresa (no guardan nada, es un aviso best-effort). 'foto' sube
// una imagen (base64) al bucket de documentos y la agrega a los archivos
// del auto asignado al chofer (valida que el auto sea suyo). El token se
// genera y se puede regenerar desde la ficha del chofer en la app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const METODOS: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercadopago: 'MercadoPago', otro: 'Otro' };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const BUCKET = Deno.env.get('DOCUMENTOS_BUCKET') || 'documentos';
const MAX_FOTO_BYTES = 8 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function diasEntre(fechaIso: string, hoy: Date): number {
  return Math.round((hoy.getTime() - new Date(fechaIso + 'T00:00:00').getTime()) / 86400000);
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
        const patente = String(body.patente || '').trim().slice(0, 20);
        const motivo = String(body.motivo || '').trim().slice(0, 300);
        await avisarPush(sb, 'Turno de service solicitado', (d.nombre || 'Chofer') + (patente ? ' · ' + patente : '') + (motivo ? ': ' + motivo : ''));
      } else if (accion === 'problema') {
        const patente = String(body.patente || '').trim().slice(0, 20);
        const descripcion = String(body.descripcion || '').trim().slice(0, 300);
        const urgente = Boolean(body.urgente);
        await avisarPush(sb, (urgente ? '⚠ Problema urgente reportado' : 'Problema reportado'), (d.nombre || 'Chofer') + (patente ? ' · ' + patente : '') + (descripcion ? ': ' + descripcion : ''));
      } else if (accion === 'actualizar_datos') {
        const tel = String(body.tel || '').trim().slice(0, 40);
        const domicilio = String(body.domicilio || '').trim().slice(0, 200);
        await avisarPush(sb, 'Chofer pidió actualizar sus datos', (d.nombre || 'Chofer') + (tel ? ' · Tel: ' + tel : '') + (domicilio ? ' · Domicilio: ' + domicilio : ''));
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

    const [{ data: carsRaw }, { data: paymentsRaw }, { data: multasRaw }, { data: settingsRow }, { data: depositosRaw }] = await Promise.all([
      sb.from('cars').select('id,data'),
      sb.from('payments').select('id,data'),
      sb.from('multas').select('id,data'),
      sb.from('app_settings').select('data').eq('id', 'main').maybeSingle(),
      sb.from('depositos').select('id,data'),
    ]);
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
      return { id: c.id, patente: c.patente || '', marca: c.marca || '', modelo: c.modelo || '', vtv: c.vtv || '', seguro: c.seguro || '', tipo: c.tipo, monto: +c.monto || 0, moneda, debt, proximo, cuotas: +c.cuotas || 0, cuotaActual, saldo, adelantoAplicado };
    });

    const pagos = payments.filter((p: any) => p.fecha).sort((a: any, b: any) => b.fecha.localeCompare(a.fecha)).slice(0, 100)
      .map((p: any) => {
        const c = cars.find((x: any) => x.id === p.carId);
        return { fecha: p.fecha, monto: +p.monto || 0, tipo: p.tipo, metodoLabel: METODOS[p.metodo] || '', patente: c ? c.patente : '' };
      });

    return json({
      ok: true, nombre: d.nombre || '', autos, pagos, multas,
      deposito: saldoDeposito, depositoObjetivo: +d.depositoObjetivo || 0,
      semanaAdelantada: Math.max(0, adelantoRestante),
      companyName: cfg.companyName || '', companyLogo: cfg.companyLogo || '', companyPhone: cfg.companyPhone || '',
      telefonoEmergencia: cfg.telefonoEmergencia || '', protocoloEmergencia: cfg.protocoloEmergencia || '', anuncios: cfg.anuncios || [],
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
