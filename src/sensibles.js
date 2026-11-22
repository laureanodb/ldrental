// Avisos de cambios sensibles para el administrador: cobros borrados o cambiados, montos de
// contrato cambiados, deuda condonada y cambios en meses cerrados, hechos por otra persona.
// Salen de la auditoría (data.js los anota como "sensible:…") de los últimos 14 días.
import { S, sb } from './state.js';
import { isAdmin } from './roles.js';
import { isSnoozed } from './snooze.js';

export async function cargarSensibles() {
  S.cambiosSensibles = [];
  if (!sb || !isAdmin() || !S.user) return false;
  try {
    const desde = new Date(Date.now() - 14 * 864e5).toISOString();
    const r = await sb.from('audit_log').select('id,user_email,accion,created_at').like('accion', 'sensible:%').gte('created_at', desde).order('created_at', { ascending: false }).limit(60);
    if (r.error) return false;
    const yo = (S.user.email || '').toLowerCase();
    S.cambiosSensibles = (r.data || []).filter(x => (x.user_email || '').toLowerCase() !== yo);
    return S.cambiosSensibles.length > 0;
  } catch (e) { return false; }
}
export function alertasSensibles() {
  return (S.cambiosSensibles || []).map(x => {
    const key = 'sensible:' + x.id;
    if (isSnoozed(key)) return null;
    return { who: String(x.user_email || 'Alguien').split('@')[0], sub: 'Cambio para revisar', kind: 'sistema', id: '', key, d: 2, cls: 'warn', t: x.accion.replace(/^sensible:/, ''), accion: 'auditoriaView()' };
  }).filter(Boolean);
}
