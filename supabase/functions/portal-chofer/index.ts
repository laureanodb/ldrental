// LD Rental — portal de solo lectura para choferes, sin login.
// Recibe ?id=<driverId>&t=<portalToken> y, si el token coincide con el
// guardado en el chofer, devuelve su deuda, próximo pago, datos del auto
// asignado y los últimos pagos. No expone nada de otros choferes ni de
// la operación en general. El token se genera y se puede regenerar desde
// la ficha del chofer en la app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const METODOS: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercadopago: 'MercadoPago', otro: 'Otro' };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function diasEntre(fechaIso: string, hoy: Date): number {
  return Math.round((hoy.getTime() - new Date(fechaIso + 'T00:00:00').getTime()) / 86400000);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const url = new URL(req.url);
    const driverId = url.searchParams.get('id') || '';
    const token = url.searchParams.get('t') || '';
    if (!driverId || !token) return json({ ok: false, error: 'Faltan parámetros' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { data: driverRow } = await sb.from('drivers').select('id,data').eq('id', driverId).maybeSingle();
    if (!driverRow || !driverRow.data || driverRow.data.portalToken !== token) {
      return json({ ok: false, error: 'Link inválido' }, 403);
    }
    const d = Object.assign({ id: driverRow.id }, driverRow.data);

    const [{ data: carsRaw }, { data: paymentsRaw }] = await Promise.all([
      sb.from('cars').select('id,data'),
      sb.from('payments').select('id,data'),
    ]);
    const cars = (carsRaw || []).map((r: any) => Object.assign({ id: r.id }, r.data))
      .filter((c: any) => c.choferId === driverId && !c.vendido && (c.tipo === 'alquiler' || c.tipo === 'financiado'));
    const payments = (paymentsRaw || []).map((r: any) => Object.assign({ id: r.id }, r.data)).filter((p: any) => p.choferId === driverId);

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    const autos = cars.map((c: any) => {
      const moneda = c.tipo === 'financiado' ? 'USD' : 'ARS';
      let debt = 0, proximo: string | null = null;
      if (c.inicio && c.monto) {
        const dias = diasEntre(c.inicio, hoy);
        if (dias >= 0) {
          let weeks = Math.floor(dias / 7) + 1;
          if (c.tipo === 'financiado' && c.cuotas) weeks = Math.min(weeks, +c.cuotas);
          const kind = c.tipo === 'alquiler' ? 'alquiler' : 'cuota';
          const paid = payments.filter((p: any) => p.carId === c.id && p.tipo === kind && p.fecha >= c.inicio)
            .reduce((a: number, p: any) => a + (+p.monto || 0), 0);
          const ajustes = (c.ajustesDeuda || []).reduce((a: number, x: any) => a + (+x.monto || 0), 0);
          debt = Math.max(0, weeks * c.monto - paid - ajustes);
          const prox = new Date(c.inicio + 'T00:00:00'); prox.setDate(prox.getDate() + weeks * 7);
          proximo = prox.toISOString().slice(0, 10);
        }
      }
      return { patente: c.patente || '', marca: c.marca || '', modelo: c.modelo || '', vtv: c.vtv || '', seguro: c.seguro || '', tipo: c.tipo, monto: +c.monto || 0, moneda, debt, proximo };
    });

    const pagos = payments.filter((p: any) => p.fecha).sort((a: any, b: any) => b.fecha.localeCompare(a.fecha)).slice(0, 20)
      .map((p: any) => {
        const c = cars.find((x: any) => x.id === p.carId);
        return { fecha: p.fecha, monto: +p.monto || 0, tipo: p.tipo, metodoLabel: METODOS[p.metodo] || '', patente: c ? c.patente : '' };
      });

    return json({ ok: true, nombre: d.nombre || '', autos, pagos });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
