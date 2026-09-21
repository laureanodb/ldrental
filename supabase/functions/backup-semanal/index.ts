// Mi Flota — backup automático semanal.
// Junta todas las tablas de datos en el mismo formato que "Descargar copia"
// de la app, y lo sube al bucket de Storage "backups". Se dispara por un
// cron job de Postgres (ver sql/fase5_backups_automaticos.sql) o se puede
// invocar a mano para probar: `supabase functions invoke backup-semanal`.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const COLS = ['cars', 'drivers', 'payments', 'gastos', 'proveedores', 'sanciones', 'prospectos', 'inspecciones', 'mantenimientos', 'multas'];
const BUCKET = 'backups';
const KEEP = 8; // cuántas copias recientes conservar antes de borrar las viejas

async function fetchAll(sb: ReturnType<typeof createClient>, col: string) {
  const out: any[] = [];
  const step = 1000;
  for (let from = 0; ; from += step) {
    const { data, error } = await sb.from(col).select('id,data').order('id').range(from, from + step - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < step) break;
  }
  return out.map((x: any) => Object.assign({ id: x.id }, x.data || {}));
}

Deno.serve(async () => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, serviceKey);

    const payload: Record<string, unknown> = { app: 'mi-flota', version: 1, fecha: new Date().toISOString() };
    for (const col of COLS) payload[col] = await fetchAll(sb, col);

    const filename = 'backups/copia-' + new Date().toISOString().slice(0, 10) + '-' + Date.now() + '.json';
    const body = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const up = await sb.storage.from(BUCKET).upload(filename, body, { upsert: false, contentType: 'application/json' });
    if (up.error) throw up.error;

    const list = await sb.storage.from(BUCKET).list('backups', { sortBy: { column: 'name', order: 'desc' } });
    if (!list.error && list.data && list.data.length > KEEP) {
      const borrar = list.data.slice(KEEP).map((f) => 'backups/' + f.name);
      if (borrar.length) await sb.storage.from(BUCKET).remove(borrar);
    }

    return new Response(JSON.stringify({ ok: true, filename }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
