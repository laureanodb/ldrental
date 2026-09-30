// Lectura de documentos con IA (Edge Function leer-documento).
// tipo: 'comprobante' | 'poliza' | 'resumen'. Se manda el path del archivo
// ya subido al bucket, o el archivo en base64 (dataURL) si no se guarda.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { sb } from './state.js';

export async function leerDocumento(tipo, { path, archivo } = {}) {
  if (!navigator.onLine) return { ok: false, error: 'Sin conexión: la lectura con IA necesita internet' };
  if (!sb) return { ok: false, error: 'La lectura con IA no está disponible acá' };
  try {
    const { data } = await sb.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) return { ok: false, error: 'Tenés que iniciar sesión' };
    const r = await fetch(SUPABASE_URL + '/functions/v1/leer-documento', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, path, archivo }),
    });
    const j = await r.json().catch(() => null);
    if (!j || typeof j.ok !== 'boolean') return { ok: false, error: r.status === 404 ? 'Falta crear la función leer-documento en Supabase' : 'No se pudo leer el documento' };
    if (j.error === 'sin_ia') j.error = 'Falta cargar la clave ANTHROPIC_API_KEY en Supabase';
    return j;
  } catch (e) {
    return { ok: false, error: 'No se pudo conectar para leer el documento' };
  }
}

export function archivoADataUrl(f) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(f);
  });
}
