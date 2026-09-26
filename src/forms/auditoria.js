import { $, esc } from '../utils.js';
import { sb } from '../state.js';
import { openModal, toast } from '../modal.js';
import { isAdmin } from '../roles.js';

const TABLA_LABEL = { cars: 'Autos', drivers: 'Choferes', payments: 'Cobros', gastos: 'Gastos', proveedores: 'Proveedores', sanciones: 'Sanciones', prospectos: 'Prospectos', inspecciones: 'Inspecciones', mantenimientos: 'Mantenimiento', multas: 'Multas', depositos: 'Depósitos y semana adelantada', profiles: 'Usuarios' };
const ACCION_LABEL = { guardado: 'Guardado', eliminado: 'Eliminado' };
const accionLabel = a => ACCION_LABEL[a] || (a && a.indexOf('restauracion_masiva') === 0 ? 'Restauración masiva' : a);
const accionCls = a => a === 'eliminado' ? 'bad' : a === 'guardado' ? 'ok' : 'mute';

const PAGE = 50;
let filtros = { accion: '', tabla: '' };
let offset = 0, cargando = false, fin = false;

function filtrosHtml() {
  return '<div class="two" style="margin-bottom:10px">' +
  '<label class="f"><span>Acción</span><select onchange="auditFiltrar(\'accion\',this.value)">' +
  '<option value="">Todas</option><option value="guardado"' + (filtros.accion === 'guardado' ? ' selected' : '') + '>Guardado</option>' +
  '<option value="eliminado"' + (filtros.accion === 'eliminado' ? ' selected' : '') + '>Eliminado</option></select></label>' +
  '<label class="f"><span>Sección</span><select onchange="auditFiltrar(\'tabla\',this.value)">' +
  '<option value="">Todas</option>' + Object.keys(TABLA_LABEL).map(k => '<option value="' + k + '"' + (filtros.tabla === k ? ' selected' : '') + '>' + TABLA_LABEL[k] + '</option>').join('') +
  '</select></label></div>';
}
function fila(r) {
  const fecha = new Date(r.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return '<div class="card row between"><div><div>' + esc(r.user_email || 'Desconocido') + '</div><div class="small muted">' + (TABLA_LABEL[r.tabla] || esc(r.tabla)) + (r.registro_id ? ' · ' + esc(String(r.registro_id)).slice(0, 8) : '') + '</div></div>' +
  '<div class="right"><span class="badge b-' + accionCls(r.accion) + '">' + esc(accionLabel(r.accion)) + '</span><div class="small muted" style="margin-top:4px">' + fecha + '</div></div></div>';
}
export async function auditoriaView() {
  if (!isAdmin()) { toast('Solo un administrador puede ver esto'); return; }
  filtros = { accion: '', tabla: '' }; offset = 0; fin = false;
  openModal('<h3>Auditoría</h3><div class="small muted" style="margin-bottom:12px">Quién guardó o borró qué, y cuándo. Queda registrado automáticamente y nadie puede editarlo ni borrarlo.</div>' +
    '<div id="aud_filtros">' + filtrosHtml() + '</div><div id="aud_list" class="small muted">Cargando…</div>' +
    '<button id="aud_more" class="btn sec block" style="margin-top:8px;display:none" onclick="auditCargarMas()">Cargar más</button>');
  await auditCargar(true);
}
async function auditCargar(reset) {
  if (cargando || fin) return;
  cargando = true;
  let q = sb.from('audit_log').select('*').order('created_at', { ascending: false }).range(offset, offset + PAGE - 1);
  if (filtros.accion) q = q.eq('accion', filtros.accion);
  if (filtros.tabla) q = q.eq('tabla', filtros.tabla);
  const r = await q;
  cargando = false;
  const el = $('#aud_list'); if (!el) return;
  if (r.error) { el.textContent = 'No se pudo cargar: ' + r.error.message; return; }
  const rows = r.data || [];
  const html = rows.map(fila).join('');
  if (reset) el.innerHTML = html || '<div class="card muted">Sin movimientos.</div>';
  else el.insertAdjacentHTML('beforeend', html);
  offset += rows.length;
  fin = rows.length < PAGE;
  const more = $('#aud_more'); if (more) more.style.display = fin ? 'none' : '';
}
export function auditCargarMas() { auditCargar(false); }
export function auditFiltrar(campo, valor) { filtros[campo] = valor; offset = 0; fin = false; auditCargar(true); }

export async function historialAutoView(carId, patente) {
  if (!isAdmin()) { toast('Solo un administrador puede ver esto'); return; }
  openModal('<h3>Historial de cambios — ' + esc(patente || '') + '</h3><div class="small muted" style="margin-bottom:12px">Todo lo que se guardó o borró en este auto, con quién y cuándo.</div>' +
    '<div id="hac_list" class="small muted">Cargando…</div>');
  const r = await sb.from('audit_log').select('*').eq('tabla', 'cars').eq('registro_id', carId).order('created_at', { ascending: false }).limit(200);
  const el = $('#hac_list'); if (!el) return;
  if (r.error) { el.textContent = 'No se pudo cargar: ' + r.error.message; return; }
  const rows = r.data || [];
  el.innerHTML = rows.map(fila).join('') || '<div class="card muted">Sin movimientos registrados.</div>';
}
