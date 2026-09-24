import { S, sb } from './state.js';
import { BUCKET } from './config.js';
import { isAdmin } from './roles.js';
import { toast, openModal, closeModal } from './modal.js';
import { settings } from './settings.js';

const COLS_CON_ARCHIVOS = ['cars', 'drivers', 'mantenimientos', 'multas', 'siniestros'];

function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

let huerfanosActuales = [];

export async function buscarArchivosHuerfanos() {
  if (!isAdmin()) { toast('Solo un administrador puede hacer esto'); return; }
  openModal('<h3>Archivos huérfanos</h3><div class="small muted" id="hf_status">Buscando…</div>');
  const referenciados = new Set();
  COLS_CON_ARCHIVOS.forEach(col => {
    (S[col] || []).forEach(r => (r.files || []).forEach(f => { if (!f.link) referenciados.add(f.id); }));
  });
  const huerfanos = [];
  let totalBytes = 0, totalArchivos = 0;
  try {
    const { data: carpetas, error } = await sb.storage.from(BUCKET).list('', { limit: 1000 });
    if (error) throw error;
    for (const carpeta of (carpetas || [])) {
      if (carpeta.id) continue;
      const { data: items } = await sb.storage.from(BUCKET).list(carpeta.name, { limit: 1000 });
      (items || []).forEach(it => {
        if (!it.id) return;
        const path = carpeta.name + '/' + it.name;
        const size = (it.metadata && it.metadata.size) || 0;
        totalBytes += size; totalArchivos++;
        if (!referenciados.has(path)) huerfanos.push({ path, size });
      });
    }
  } catch (e) {
    const el = document.getElementById('hf_status');
    if (el) { el.textContent = 'No se pudo buscar: ' + ((e && e.message) || 'error'); }
    return;
  }
  mostrarHuerfanos(huerfanos, totalBytes, totalArchivos);
}
function mostrarHuerfanos(lista, totalBytes, totalArchivos) {
  huerfanosActuales = lista;
  const total = lista.reduce((a, x) => a + x.size, 0);
  const limiteBytes = (settings.almacenamientoAvisoMB || 0) * 1024 * 1024;
  const pct = limiteBytes ? Math.round(totalBytes / limiteBytes * 100) : 0;
  const h = '<h3>Archivos huérfanos</h3>' +
  '<div class="card" style="margin-bottom:10px"><div class="row between small"><span class="muted">Almacenamiento total</span><b' + (pct >= 80 ? ' style="color:var(--warn)"' : '') + '>' + fmtBytes(totalBytes) + '</b></div>' +
  '<div class="small muted">' + totalArchivos + ' archivo' + (totalArchivos === 1 ? '' : 's') + (limiteBytes ? ' · ' + pct + '% del aviso configurado (' + settings.almacenamientoAvisoMB + ' MB)' : '') + '</div>' +
  (limiteBytes && pct >= 80 ? '<div class="small" style="color:var(--warn);margin-top:4px">Te estás acercando al límite. Considerá borrar archivos huérfanos o comprimir fotos viejas.</div>' : '') + '</div>' +
  (lista.length ? '<div class="small muted" style="margin-bottom:10px">' + lista.length + ' archivo' + (lista.length === 1 ? '' : 's') + ' sin ningún registro que lo use · ' + fmtBytes(total) + '</div>' +
  '<button class="btn danger block" onclick="confirmDel(this,()=>confirmarBorrarHuerfanos())">Eliminar todos</button>'
  : '<div class="card muted">No se encontraron archivos huérfanos.</div>') +
  '<button class="btn sec block" style="margin-top:8px" onclick="closeModal()">Cerrar</button>';
  openModal(h);
}
export async function confirmarBorrarHuerfanos() {
  const lista = huerfanosActuales;
  if (!lista.length) return;
  let ok = 0;
  for (const x of lista) {
    try { const r = await sb.storage.from(BUCKET).remove([x.path]); if (!r.error) ok++; } catch (e) {}
  }
  huerfanosActuales = [];
  toast(ok + ' archivo' + (ok === 1 ? '' : 's') + ' eliminado' + (ok === 1 ? '' : 's'));
  closeModal();
}
