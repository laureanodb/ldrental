// LD Rental — resumen semanal por notificación push.
// Junta lo cobrado en los últimos 7 días, la deuda total de choferes y
// los vencimientos próximos, y lo manda como notificación push a todos
// los dispositivos suscriptos. Se dispara por un cron job aparte del
// resumen diario (ver sql/fase_push_semanal.sql), pensado para los
// lunes. Se puede invocar a mano para probar:
// `supabase functions invoke push-semanal`.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const AVISO_DIAS = 15;
const VENC_KEYS = ['vtv', 'seguro', 'impuesto', 'cedula', 'gnc', 'habilitacion'];

function diasHasta(fechaIso: string, hoy: Date): number {
  const d = new Date(fechaIso + 'T00:00:00');
  return Math.round((d.getTime() - hoy.getTime()) / 86400000);
}
function fmt(n: number): string {
  return Math.round(n).toLocaleString('es-AR');
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
    const haceSieteDias = new Date(hoy); haceSieteDias.setDate(haceSieteDias.getDate() - 7);
    const haceSieteDiasIso = haceSieteDias.toISOString().slice(0, 10);

    const [{ data: carsRaw }, { data: paymentsRaw }] = await Promise.all([
      sb.from('cars').select('id,data'),
      sb.from('payments').select('id,data'),
    ]);
    const cars = (carsRaw || []).map((r: any) => Object.assign({ id: r.id }, r.data));
    const payments = (paymentsRaw || []).map((r: any) => Object.assign({ id: r.id }, r.data));

    const cobradoSemana = payments.filter((p: any) => p.tipo !== 'cuota' && p.fecha >= haceSieteDiasIso)
      .reduce((a: number, p: any) => a + (+p.monto || 0), 0);
    const cobradoSemanaUSD = payments.filter((p: any) => p.tipo === 'cuota' && p.fecha >= haceSieteDiasIso)
      .reduce((a: number, p: any) => a + (+p.monto || 0), 0);

    let deudaTotal = 0, deudaTotalUSD = 0;
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
      if (c.tipo === 'financiado') deudaTotalUSD += debt; else deudaTotal += debt;
    }

    let vencProximos = 0;
    for (const c of cars) {
      if (c.vendido) continue;
      for (const k of VENC_KEYS) {
        const f = c[k]; if (!f) continue;
        if (diasHasta(f, hoy) <= AVISO_DIAS) vencProximos++;
      }
    }

    const partes: string[] = [];
    partes.push('Cobrado: $' + fmt(cobradoSemana) + (cobradoSemanaUSD ? ' + US$' + fmt(cobradoSemanaUSD) : ''));
    partes.push('Deuda: $' + fmt(deudaTotal) + (deudaTotalUSD ? ' + US$' + fmt(deudaTotalUSD) : ''));
    if (vencProximos) partes.push(vencProximos + ' vencimiento' + (vencProximos === 1 ? '' : 's') + ' próximo' + (vencProximos === 1 ? '' : 's'));
    const body = partes.join(' · ');

    const { data: subs } = await sb.from('push_subscriptions').select('id,endpoint,p256dh,auth');
    let enviados = 0, fallidos = 0;
    for (const s of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: 'Resumen semanal', body, url: './' })
        );
        enviados++;
      } catch (e: any) {
        fallidos++;
        if (e && (e.statusCode === 404 || e.statusCode === 410)) {
          await sb.from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    }
    return new Response(JSON.stringify({ ok: true, body, enviados, fallidos }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
