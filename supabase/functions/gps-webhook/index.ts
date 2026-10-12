// LD Rental — recibe las posiciones de los GPS de los autos.
// La plataforma del GPS (Traccar, Wialon, Gurtam, la del proveedor…) manda cada
// reporte por HTTP POST a:  .../functions/v1/gps-webhook?t=<clave>
// La clave se genera en la app (Más → GPS de la flota) y se guarda en app_settings.
// Acepta el formato de Traccar ("event/position forwarding") y uno simple:
//   { "imei": "...", "patente": "AB123CD", "lat": -34.6, "lng": -58.4, "velocidad": 80,
//     "odometro": 123456, "bateria": 12.4, "evento": "frenada" }
// Con cada reporte: guarda la última posición del auto, actualiza los km con el
// odómetro, anota excesos de velocidad, frenadas y aceleraciones bruscas (con el
// chofer que lo tenía), y avisa con una notificación si el auto sale de la zona
// permitida o si la batería está baja.
// Se crea con "Verify JWT" desactivado (la seguridad es la clave del link).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const num = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
const hoyIso = () => new Date().toISOString().slice(0, 10);

// Distancia en km entre dos puntos.
function distanciaKm(a: number, b: number, c: number, d: number) {
  const r = (x: number) => x * Math.PI / 180, R = 6371;
  const dLat = r(c - a), dLng = r(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Lleva cualquier formato a uno solo.
function normalizar(b: any) {
  if (b && (b.position || b.device)) {
    const p = b.position || {}, at = p.attributes || {}, ev = b.event || {};
    const alarma = String((ev.attributes && ev.attributes.alarm) || at.alarm || ev.type || '').toLowerCase();
    return {
      id: String((b.device && b.device.uniqueId) || p.deviceId || ''), patente: String((b.device && b.device.name) || ''),
      lat: num(p.latitude), lng: num(p.longitude), velocidad: num(p.speed) != null ? Math.round(+p.speed * 1.852) : null,
      odometro: num(at.totalDistance) != null ? Math.round(+at.totalDistance / 1000) : num(at.odometer) != null ? Math.round(+at.odometer / 1000) : null,
      bateria: num(at.power) ?? num(at.battery) ?? null, bateriaPct: num(at.batteryLevel),
      evento: /brak|frenad/.test(alarma) ? 'frenada' : /accel|aceler/.test(alarma) ? 'aceleracion' : /overspeed|exceso/.test(alarma) ? 'exceso' : /lowbattery|lowpower|bateria/.test(alarma) ? 'bateria' : '',
      fecha: p.fixTime || p.deviceTime || new Date().toISOString(),
    };
  }
  const ev = String(b.evento || b.event || '').toLowerCase();
  return {
    id: String(b.imei || b.id || b.deviceId || ''), patente: String(b.patente || b.plate || ''),
    lat: num(b.lat ?? b.latitude), lng: num(b.lng ?? b.lon ?? b.longitude), velocidad: num(b.velocidad ?? b.speed),
    odometro: num(b.odometro ?? b.odometer), bateria: num(b.bateria ?? b.battery ?? b.voltaje), bateriaPct: num(b.bateriaPct),
    evento: /frenad|brak/.test(ev) ? 'frenada' : /aceler|accel/.test(ev) ? 'aceleracion' : /exceso|overspeed/.test(ev) ? 'exceso' : /bater/.test(ev) ? 'bateria' : '',
    fecha: b.fecha || b.time || new Date().toISOString(),
  };
}
async function avisarPush(sb: any, title: string, body: string) {
  try {
    const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!pub || !priv) return;
    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com', pub, priv);
    const { data: subs } = await sb.from('push_subscriptions').select('id,endpoint,p256dh,auth');
    for (const s of subs || []) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, url: './' })); }
      catch (e: any) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await sb.from('push_subscriptions').delete().eq('id', s.id); }
    }
  } catch (e) { /* best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Usá POST' }, 405);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const { data: cfgRow } = await sb.from('app_settings').select('data').eq('id', 'main').maybeSingle();
    const cfgAll = (cfgRow && cfgRow.data) || {};
    const cfg = cfgAll.gpsConfig || {};
    const t = new URL(req.url).searchParams.get('t') || req.headers.get('x-gps-token') || '';
    if (!cfg.token || t !== cfg.token) return json({ ok: false, error: 'Clave inválida' }, 403);

    const body = await req.json().catch(() => null);
    const lista = Array.isArray(body) ? body : body && Array.isArray(body.positions) ? body.positions.map((p: any) => ({ position: p, device: (body.devices || []).find((d: any) => d.id === p.deviceId) })) : [body];
    const { data: carRows } = await sb.from('cars').select('id,data');
    const autos = (carRows || []).filter((r: any) => r.data && !r.data.vendido);
    const velMax = +cfg.velocidadMax || 120, batMin = +cfg.bateriaMinV || 11.8;
    const zonas = (cfgAll.gpsZonas || []).filter((z: any) => num(z.lat) != null && num(z.lng) != null && +z.radioKm > 0);
    let procesados = 0;
    for (const raw of lista.slice(0, 200)) {
      if (!raw) continue;
      const g = normalizar(raw);
      const pat = g.patente.toUpperCase().replace(/[\s-]/g, '');
      const row = autos.find((r: any) => (g.id && String(r.data.gpsId || '').trim() === g.id) || (pat && String(r.data.patente || '').toUpperCase().replace(/[\s-]/g, '') === pat));
      if (!row) continue;
      const { data: fresco } = await sb.from('cars').select('id,data').eq('id', row.id).maybeSingle();
      const c = (fresco && fresco.data) || row.data;
      const fecha = new Date(g.fecha).toISOString();
      const patch: any = {};
      const eventos: any[] = [];
      const ant = c.gps || {};
      // Posición y zona
      if (g.lat != null && g.lng != null) {
        const zonasAuto = zonas.filter((z: any) => !z.carIds || !z.carIds.length || z.carIds.includes(row.id));
        const dentro = !zonasAuto.length || zonasAuto.some((z: any) => distanciaKm(g.lat!, g.lng!, +z.lat, +z.lng) <= +z.radioKm);
        patch.gps = { lat: g.lat, lng: g.lng, fecha, velocidad: g.velocidad, bateria: g.bateria, bateriaPct: g.bateriaPct, fueraDeZona: !dentro, odometro: g.odometro ?? ant.odometro ?? null };
        if (!dentro && !ant.fueraDeZona) {
          eventos.push({ tipo: 'zona', valor: '', lat: g.lat, lng: g.lng });
          await avisarPush(sb, '📍 ' + (c.patente || 'Un auto') + ' salió de la zona permitida', 'https://maps.google.com/?q=' + g.lat + ',' + g.lng);
        }
        if (dentro && ant.fueraDeZona) eventos.push({ tipo: 'zona_vuelta', valor: '', lat: g.lat, lng: g.lng });
      } else patch.gps = Object.assign({}, ant, { fecha, velocidad: g.velocidad ?? ant.velocidad, bateria: g.bateria ?? ant.bateria });
      // Velocidad y manejo brusco
      // Un exceso cuenta una vez cada 10 minutos (el GPS reporta muchas veces mientras va rápido).
      const ultExceso = (c.gpsEventos || []).filter((e: any) => e.tipo === 'exceso').slice(-1)[0];
      const excesoReciente = ultExceso && (Date.parse(fecha) - Date.parse(ultExceso.fecha)) < 10 * 60000;
      if (g.velocidad != null && g.velocidad > velMax && !excesoReciente) eventos.push({ tipo: 'exceso', valor: g.velocidad, lat: g.lat, lng: g.lng });
      if (g.evento === 'frenada' || g.evento === 'aceleracion') eventos.push({ tipo: g.evento, valor: g.velocidad, lat: g.lat, lng: g.lng });
      // Batería (una notificación por día)
      const bajaV = g.bateria != null && g.bateria > 5 && g.bateria < batMin;
      const bajaPct = g.bateriaPct != null && g.bateriaPct < 20;
      if ((bajaV || bajaPct || g.evento === 'bateria') && (c.gpsBateriaAviso || '') !== hoyIso()) {
        patch.gpsBateriaAviso = hoyIso();
        eventos.push({ tipo: 'bateria', valor: g.bateria ?? g.bateriaPct ?? '' });
        await avisarPush(sb, '🔋 Batería baja en ' + (c.patente || 'un auto'), g.bateria != null ? g.bateria + ' V' : g.bateriaPct != null ? g.bateriaPct + '%' : 'Lo avisó el GPS');
      }
      // Km del odómetro
      if (g.odometro != null && g.odometro > (+c.km || 0) && g.odometro - (+c.km || 0) < 5000) {
        patch.km = g.odometro;
        const H = c.kmHistorial || [];
        const ult = H[H.length - 1];
        patch.kmHistorial = ult && ult.fecha === hoyIso() && ult.origen === 'gps' ? H.slice(0, -1).concat([{ fecha: hoyIso(), km: g.odometro, origen: 'gps' }]) : H.concat([{ fecha: hoyIso(), km: g.odometro, origen: 'gps' }]);
      }
      // Para no escribir el auto en cada reporte (los GPS mandan cada pocos segundos):
      // sin eventos ni km nuevos, se guarda como mucho cada 5 minutos o si se movió más de 300 m.
      const minDesde = ant.fecha ? (Date.parse(fecha) - Date.parse(ant.fecha)) / 60000 : 1e9;
      const movio = ant.lat != null && g.lat != null ? distanciaKm(ant.lat, ant.lng, g.lat, g.lng!) : 1;
      if (!eventos.length && !patch.km && !patch.gpsBateriaAviso && minDesde < 5 && movio < 0.3 && Boolean(ant.fueraDeZona) === Boolean(patch.gps.fueraDeZona)) continue;
      if (eventos.length) patch.gpsEventos = (c.gpsEventos || []).concat(eventos.map(e => Object.assign({ fecha, choferId: c.choferId || '' }, e))).slice(-300);
      const upd = await sb.from('cars').update({ data: Object.assign({}, c, patch), updated_at: new Date().toISOString() }).eq('id', row.id);
      if (!upd.error) procesados++;
    }
    return json({ ok: true, procesados });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
