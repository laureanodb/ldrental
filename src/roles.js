import { S, sb } from './state.js';
import { toast } from './modal.js';

export async function loadOwnProfile() {
  if (!S.user) { S.profile = null; return; }
  try {
    const r = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
    if (r.error) { S.profilesEnabled = false; S.profile = null; return; }
    S.profilesEnabled = true;
    S.profile = r.data || null;
    if (S.profile && !S.profile.activo) {
      toast('Tu acceso fue revocado. Consultá con el administrador.');
      await sb.auth.signOut();
    }
  } catch (e) { S.profilesEnabled = false; S.profile = null; }
}
export const isAdmin = () => !S.profilesEnabled || Boolean(S.profile && S.profile.rol === 'admin' && S.profile.activo);
export const isSupervisor = () => Boolean(S.profile && S.profile.rol === 'supervisor' && S.profile.activo);
export const canDelete = () => isAdmin() || isSupervisor();
export const canVerFinanzas = () => isAdmin() || isSupervisor();
