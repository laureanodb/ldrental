// Errores de la app: si algo falla, el usuario ve un aviso claro (no una pantalla rota)
// y el error queda guardado en la tabla app_errores (si existe) con lo necesario para
// arreglarlo: qué pasó, en qué pantalla, en qué versión y en qué celular. El administrador
// los ve en Más → Errores de la app.
import { S, sb, ui } from './state.js';
import { toast } from './toast.js';
import { openModal } from './modal.js';

const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '';
let enviados = 0, ultimoAviso = 0;
const vistos = new Set();

export function reportarError(mensaje, extra) {
  const msg = String(mensaje || 'Error').slice(0, 500);
  // Después de publicar una versión nueva, el celular puede pedir un archivo viejo que ya no existe: se recarga una vez.
  if (/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg)) {
    let ya = false; try { ya = sessionStorage.getItem('ld-recarga') === '1'; sessionStorage.setItem('ld-recarga', '1'); } catch (e) {}
    if (!ya) { location.reload(); return; }
  }
  if (Date.now() - ultimoAviso > 15000) { ultimoAviso = Date.now(); toast('Algo no funcionó como debía. Si vuelve a pasar, cerrá y abrí la app.'); }
  const clave = msg + '|' + ((extra && extra.donde) || '');
  if (vistos.has(clave) || enviados >= 20 || !sb || !S.user) return;
  vistos.add(clave); enviados++;
  sb.from('app_errores').insert({
    data: {
      mensaje: msg, pila: String((extra && extra.pila) || '').slice(0, 3000), donde: (extra && extra.donde) || '',
      pantalla: ui.tab + (ui.masView ? '/' + ui.masView : ''), version: VERSION, usuario: S.user.email || '',
      navegador: navigator.userAgent.slice(0, 200), fecha: new Date().toISOString(),
    },
  }).then(() => {}, () => {});
}
export function instalarReporteErrores() {
  window.addEventListener('error', e => {
    // Errores de carga de recursos (imágenes, etc.) no son de la app.
    if (!e.error && !e.message) return;
    reportarError(e.message || (e.error && e.error.message), { pila: e.error && e.error.stack, donde: (e.filename || '').split('/').pop() + ':' + (e.lineno || '') });
  });
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    const msg = (r && (r.message || r.error_description)) || String(r);
    // Cortes de conexión: ya los maneja la app (modo sin conexión).
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return;
    reportarError(msg, { pila: r && r.stack, donde: 'promesa' });
  });
}

// Pantalla para el administrador.
export async function erroresView() {
  openModal('<h3>Errores de la app</h3><div id="er_lista" class="small muted">Cargando…</div>');
  const el = () => document.getElementById('er_lista');
  if (!sb) { el().textContent = 'No disponible.'; return; }
  const r = await sb.from('app_errores').select('id,data,created_at').order('created_at', { ascending: false }).limit(60);
  if (!el()) return;
  if (r.error) { el().innerHTML = 'Todavía no está creada la tabla de errores en Supabase. Está en la guía de configuración (SQL para Supabase).'; return; }
  const L = r.data || [];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  el().outerHTML = L.length ? '<div>' + L.map(x => { const d = x.data || {};
    return '<div class="card"><div class="row between small" style="gap:8px"><b style="min-width:0;overflow-wrap:anywhere">' + esc(d.mensaje) + '</b><span class="muted" style="white-space:nowrap">' + esc(String(x.created_at || d.fecha || '').slice(0, 16).replace('T', ' ')) + '</span></div>' +
      '<div class="small muted">' + esc([d.usuario, d.pantalla, d.donde, d.version && 'versión ' + d.version].filter(Boolean).join(' · ')) + '</div>' +
      (d.pila ? '<details class="small"><summary style="cursor:pointer">Detalle técnico</summary><pre style="white-space:pre-wrap;font-size:11px">' + esc(d.pila) + '</pre></details>' : '') + '</div>'; }).join('') + '</div>'
    : '<div class="card" style="color:var(--ok)">✓ No hubo errores registrados.</div>';
}
