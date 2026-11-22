// Qué secciones ve cada rol. Lo elige el administrador.
import { openModal, toast } from '../modal.js';
import { settings, saveSettings } from '../settings.js';
import { isAdmin, SECCIONES } from '../roles.js';

const ROLES = [['supervisor', 'Supervisor'], ['empleado', 'Empleado']];

export function permisosSeccionesForm() {
  if (!isAdmin()) { toast('Solo un administrador puede cambiar esto'); return; }
  const P = settings.permisosSecciones || {};
  openModal('<h3>Qué ve cada rol</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Destildá lo que no necesita ver cada rol. El administrador siempre ve todo. Sirve para que cada uno tenga la app más simple; quién puede borrar o ver finanzas se sigue manejando con el rol.</div>' +
    '<table style="width:100%;border-collapse:collapse"><tr><td></td>' + ROLES.map(r => '<td class="small" style="text-align:center;padding:4px"><b>' + r[1] + '</b></td>').join('') + '</tr>' +
    SECCIONES.map(([k, l]) => '<tr style="border-top:1px solid var(--line)"><td class="small" style="padding:6px 0">' + l + '</td>' +
      ROLES.map(([r]) => '<td style="text-align:center"><input type="checkbox" class="ps_chk" data-rol="' + r + '" data-sec="' + k + '"' + ((P[r] || {})[k] === false ? '' : ' checked') + '></td>').join('') + '</tr>').join('') +
    '</table><div class="row" style="margin-top:12px"><button class="btn grow" onclick="guardarPermisosSecciones()">Guardar</button><button class="btn sec" onclick="usuariosView()">Volver</button></div>');
}
export function guardarPermisosSecciones() {
  const P = {};
  document.querySelectorAll('.ps_chk').forEach(x => { if (!x.checked) (P[x.dataset.rol] = P[x.dataset.rol] || {})[x.dataset.sec] = false; });
  saveSettings({ permisosSecciones: P });
  toast('Listo: cada rol ve lo que elegiste'); window.render();
  window.usuariosView();
}
