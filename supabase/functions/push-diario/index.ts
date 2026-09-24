// Mi Flota — notificación push diaria.
// Junta un resumen de vencimientos urgentes, choferes con deuda y multas
// pendientes, y lo manda como notificación push a todos los dispositivos
// suscriptos. Se dispara por un cron job de Postgres (ver sql/fase_push.sql)
// o se puede invocar a mano para probar: `supabase functions invoke push-diario`.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const AVISO_DIAS = 15;
const VENC_KEYS = ['vtv', 'seguro', 'impuesto', 'cedula', 'gnc', 'habilitacion'];

function diasHasta(fechaIso: string, hoy: Date): number {
  const d = new Date(fechaIso + 'T00:00:00');
  return Math.round((d.getTime() - hoy.getTime()) / 86400000);
}

Deno.serve(async () => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const sb = createClient(supabaseUrl, serviceKey);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    const [{ data: carsRaw }, { data: paymentsRaw }, { data: multasRaw }] = await Promise.all([
      sb.from('cars').select('id,data'),
      sb.from('payments').select('id,data'),
      sb.from('multas').select('id,data'),
    ]);
    const cars = (carsRaw || []).map((r: any) => Object.assign({ id: r.id }, r.data));
    const payments = (paymentsRaw || []).map((r: any) => Object.assign({ id: r.id }, r.data));
    const multas = (multasRaw || []).map((r: any) => Object.assign({ id: r.id }, r.data));

    let vencUrgentes = 0;
    for (const c of cars) {
      if (c.vendido) continue;
      for (const k of VENC_KEYS) {
        const f = c[k]; if (!f) continue;
        if (diasHasta(f, hoy) <= AVISO_DIAS) vencUrgentes++;
      }
    }

    let choferesConDeuda = 0;
    for (const c of cars) {
      if (c.vendido || !(c.tipo === 'alquiler' || c.tipo === 'financiado') || !c.inicio || !c.monto) continue;
      const dias = Math.round((hoy.getTime() - new Date(c.inicio + 'T00:00:00').getTime()) / 86400000);
      if (dias < 0) continue;
      let weeks = Math.floor(dias / 7) + 1;
      if (c.tipo === 'financiado' && c.cuotas) weeks = Math.min(weeks, +c.cuotas);
      const kind = c.tipo === 'alquiler' ? 'alquiler' : 'cuota';
      const paid = payments.filter((p: any) => p.carId === c.id && p.tipo === kind && p.fecha >= c.inicio)
        .reduce((a: number, p: any) => a + (+p.monto || 0), 0);
      const ajustes = (c.ajustesDeuda || []).reduce((a: number, x: any) => a + (+x.monto || 0), 0);
      const debt = Math.max(0, weeks * c.monto - paid - ajustes);
      if (debt > 0) choferesConDeuda++;
    }

    const multasPendientes = multas.filter((m: any) => m.estado === 'pendiente' || m.estado === 'vencida').length;

    const vencTexto = vencUrgentes + ' vencimiento' + (vencUrgentes === 1 ? '' : 's') + ' urgente' + (vencUrgentes === 1 ? '' : 's');
    const deudaTexto = choferesConDeuda + ' chofer' + (choferesConDeuda === 1 ? '' : 'es') + ' con deuda';
    const multasTexto = multasPendientes + ' multa' + (multasPendientes === 1 ? '' : 's') + ' pendiente' + (multasPendientes === 1 ? '' : 's');

    if (!vencUrgentes && !choferesConDeuda && !multasPendientes) {
      return new Response(JSON.stringify({ ok: true, enviado: false, motivo: 'nada urgente' }), { headers: { 'Content-Type': 'application/json' } });
    }

    const { data: subs } = await sb.from('push_subscriptions').select('id,endpoint,p256dh,auth,prefs');
    let enviados = 0, fallidos = 0;
    for (const s of subs || []) {
      const prefs = s.prefs || {};
      const partes: string[] = [];
      if (vencUrgentes && prefs.vencimientos !== false) partes.push(vencTexto);
      if (choferesConDeuda && prefs.deuda !== false) partes.push(deudaTexto);
      if (multasPendientes && prefs.multas !== false) partes.push(multasTexto);
      if (!partes.length) continue;
      const body = partes.join(' · ');
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: 'Mi Flota', body, url: './' })
        );
        enviados++;
      } catch (e: any) {
        fallidos++;
        if (e && (e.statusCode === 404 || e.statusCode === 410)) {
          await sb.from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    }
    return new Response(JSON.stringify({ ok: true, enviado: enviados > 0, enviados, fallidos }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
