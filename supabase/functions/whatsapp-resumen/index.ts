// LD Rental — resumen diario por WhatsApp (para el dueño de la flota).
// Junta lo cobrado en los últimos 7 días, la deuda total de choferes,
// los vencimientos urgentes y las multas pendientes, y lo manda por
// WhatsApp usando la plantilla aprobada "resumen_flota". Se dispara por
// un cron job de Postgres (ver sql/fase_whatsapp_resumen.sql), o se
// puede invocar a mano para probar: `supabase functions invoke whatsapp-resumen`.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const waToken = Deno.env.get('WHATSAPP_TOKEN')!;
    const waPhoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!;
    const waTo = Deno.env.get('WHATSAPP_TO_NUMBER')!;
    const waTemplate = Deno.env.get('WHATSAPP_TEMPLATE_NAME') || 'resumen_flota';
    const waLang = Deno.env.get('WHATSAPP_TEMPLATE_LANG') || 'es_AR';

    const sb = createClient(supabaseUrl, serviceKey);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const haceSieteDias = new Date(hoy); haceSieteDias.setDate(haceSieteDias.getDate() - 7);
    const haceSieteDiasIso = haceSieteDias.toISOString().slice(0, 10);

    const [{ data: carsRaw }, { data: paymentsRaw }, { data: multasRaw }] = await Promise.all([
      sb.from('cars').select('id,data'),
      sb.from('payments').select('id,data'),
      sb.from('multas').select('id,data'),
    ]);
    const cars = (carsRaw || []).map((r: any) => Object.assign({ id: r.id }, r.data));
    const payments = (paymentsRaw || []).map((r: any) => Object.assign({ id: r.id }, r.data));
    const multas = (multasRaw || []).map((r: any) => Object.assign({ id: r.id }, r.data));

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

    let vencUrgentes = 0;
    for (const c of cars) {
      if (c.vendido) continue;
      for (const k of VENC_KEYS) {
        const f = c[k]; if (!f) continue;
        if (diasHasta(f, hoy) <= AVISO_DIAS) vencUrgentes++;
      }
    }
    const multasPendientes = multas.filter((m: any) => m.estado === 'pendiente' || m.estado === 'vencida').length;

    const partes: string[] = [];
    partes.push('Cobrado (7 días): $' + fmt(cobradoSemana) + (cobradoSemanaUSD ? ' + US$' + fmt(cobradoSemanaUSD) : ''));
    partes.push('Deuda total: $' + fmt(deudaTotal) + (deudaTotalUSD ? ' + US$' + fmt(deudaTotalUSD) : ''));
    if (vencUrgentes) partes.push(vencUrgentes + ' vencimiento' + (vencUrgentes === 1 ? '' : 's') + ' urgente' + (vencUrgentes === 1 ? '' : 's'));
    if (multasPendientes) partes.push(multasPendientes + ' multa' + (multasPendientes === 1 ? '' : 's') + ' pendiente' + (multasPendientes === 1 ? '' : 's'));
    const resumen = partes.join(' · ');

    const r = await fetch('https://graph.facebook.com/v20.0/' + waPhoneId + '/messages', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + waToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: waTo,
        type: 'template',
        template: {
          name: waTemplate,
          language: { code: waLang },
          components: [{ type: 'body', parameters: [{ type: 'text', text: resumen }] }],
        },
      }),
    });
    const data = await r.json();
    if (!r.ok) return new Response(JSON.stringify({ ok: false, resumen, error: data }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ ok: true, resumen, whatsapp: data }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
