import { S, sb } from './state.js';
import { toast } from './modal.js';
import { isAdmin } from './roles.js';

let canal = null;

export async function iniciarAlertasSupervisor() {
  if (!isAdmin() || !S.profilesEnabled || canal || !sb) return;
  const r = await sb.from('profiles').select('id').eq('rol', 'supervisor');
  const supervisores = new Set((r.data || []).map(x => x.id));
  if (!supervisores.size) return;
  canal = sb.channel('audit-supervisor');
  canal.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_log' }, (payload) => {
    const row = payload.new;
    if (row.accion === 'eliminado' && supervisores.has(row.user_id)) {
      toast('Un supervisor (' + (row.user_email || '') + ') eliminó un registro de ' + row.tabla);
    }
  });
  canal.subscribe();
}
export function detenerAlertasSupervisor() {
  if (canal) { try { sb.removeChannel(canal); } catch (e) {} canal = null; }
}
