import { S, sb } from './state.js';
import { toast } from './modal.js';
import { settings } from './settings.js';
import { days, parse, today } from './utils.js';

export async function loadOwnProfile() {
  if (!S.user) { S.profile = null; return; }
  try {
    await sb.rpc('revisar_reactivacion').catch(() => {});
    const r = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
    if (r.error) { S.profilesEnabled = false; S.profile = null; return; }
    S.profilesEnabled = true;
    S.profile = r.data || null;
    if (S.profile && !S.profile.activo) {
      toast('Tu acceso fue revocado. Consultá con el administrador.');
      await sb.auth.signOut();
      return;
    }
    sb.rpc('marcar_ultimo_ingreso').catch(() => {});
  } catch (e) { S.profilesEnabled = false; S.profile = null; }
}
export const isAdmin = () => !S.profilesEnabled || Boolean(S.profile && S.profile.rol === 'admin' && S.profile.activo);
export const isSupervisor = () => Boolean(S.profile && S.profile.rol === 'supervisor' && S.profile.activo);
export const canDelete = () => isAdmin() || isSupervisor();
export const canVerFinanzas = () => isAdmin() || isSupervisor();
export function puedeEditarCobro(p) {
  if (isAdmin()) return true;
  if (!canDelete()) return false;
  if (!p.fecha) return true;
  return days(parse(p.fecha), today()) <= settings.cobroEdicionDias;
}
