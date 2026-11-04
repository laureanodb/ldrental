// Contraseñas: cambiar la propia (Más → Cuenta), recuperarla por mail desde la
// pantalla de entrada, y que un admin le ponga una nueva a otro usuario
// (Edge Function usuarios-admin, porque hace falta la clave de servicio).
import { S, sb } from '../state.js';
import { esc } from '../utils.js';
import { openModal, closeModal, toast } from '../modal.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

const MIN = 8;
const campo = (id, label, auto) => '<label class="f"><span>' + label + '</span><input id="' + id + '" type="password" autocomplete="' + auto + '"></label>';
const valor = id => (document.getElementById(id) || {}).value || '';
const estado = (t, color) => { const el = document.getElementById('pw_status'); if (el) { el.textContent = t; el.style.color = color || 'var(--muted)'; } };
// Revisa la contraseña nueva y su repetición; devuelve el error o ''.
function revisarNueva(nueva, repetida) {
  if (nueva.length < MIN) return 'La contraseña nueva tiene que tener al menos ' + MIN + ' caracteres.';
  if (nueva.length > 72) return 'La contraseña es demasiado larga.';
  if (nueva !== repetida) return 'Las dos contraseñas nuevas no coinciden.';
  return '';
}
const traducir = m => (/same.*password|different from the old/i.test(m) ? 'La contraseña nueva tiene que ser distinta de la anterior.' : /weak|pwned|leaked/i.test(m) ? 'Esa contraseña es muy fácil de adivinar. Probá con otra.' : m);

/* ---------- Cambiar la propia ---------- */
export function cambiarMiContrasenaForm() {
  if (!S.user) return;
  openModal('<h3>Cambiar mi contraseña</h3>' +
    '<div class="small muted" style="margin-bottom:10px">' + esc(S.user.email || '') + '. Usá al menos ' + MIN + ' caracteres.</div>' +
    campo('pw_actual', 'Contraseña actual', 'current-password') +
    campo('pw_nueva', 'Contraseña nueva', 'new-password') +
    campo('pw_repetir', 'Repetí la contraseña nueva', 'new-password') +
    '<div id="pw_status" class="small" style="margin:4px 0 10px"></div>' +
    '<div class="row"><button class="btn grow" id="pw_btn" onclick="guardarMiContrasena()">Cambiar</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>');
}
export async function guardarMiContrasena() {
  const actual = valor('pw_actual'), nueva = valor('pw_nueva'), repetida = valor('pw_repetir');
  if (!actual) { estado('Escribí tu contraseña actual.', 'var(--bad)'); return; }
  const err = revisarNueva(nueva, repetida);
  if (err) { estado(err, 'var(--bad)'); return; }
  const btn = document.getElementById('pw_btn'); if (btn) btn.disabled = true;
  try {
    estado('Revisando…');
    // Se confirma la actual volviendo a entrar con ella (no cambia la sesión: es el mismo usuario).
    const r1 = await sb.auth.signInWithPassword({ email: S.user.email, password: actual });
    if (r1.error) { estado('La contraseña actual no es correcta.', 'var(--bad)'); return; }
    const r2 = await sb.auth.updateUser({ password: nueva });
    if (r2.error) { estado('No se pudo cambiar: ' + traducir(r2.error.message), 'var(--bad)'); return; }
    closeModal(); toast('Contraseña cambiada');
  } finally { if (btn) btn.disabled = false; }
}

/* ---------- Olvidé mi contraseña ---------- */
export async function olvideContrasena() {
  const email = ((document.getElementById('l_email') || {}).value || '').trim();
  const err = document.getElementById('l_err');
  const msg = (t, color) => { if (err) { err.textContent = t; err.style.color = color || 'var(--muted)'; } };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg('Escribí tu email arriba y tocá de nuevo "¿Olvidaste tu contraseña?".', 'var(--bad)'); document.getElementById('l_email')?.focus(); return; }
  msg('Enviando…');
  const r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (r.error) { msg(/rate|too many|seconds/i.test(r.error.message) ? 'Ya se mandaron varios mails. Esperá un rato y probá de nuevo.' : 'No se pudo mandar el mail: ' + r.error.message, 'var(--bad)'); return; }
  // Por seguridad no se dice si el email existe o no.
  msg('Si ese email tiene usuario, te llegó un mail con un link para elegir una contraseña nueva. Revisá también la carpeta de spam. Si no te llega, pedile al administrador que te la cambie.', 'var(--ok)');
}

// Al entrar desde el link del mail: elegir la contraseña nueva.
export function nuevaContrasenaForm() {
  openModal('<h3>Elegí tu contraseña nueva</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Entraste con el link del mail' + (S.user && S.user.email ? ' (' + esc(S.user.email) + ')' : '') + '. Usá al menos ' + MIN + ' caracteres.</div>' +
    campo('pw_nueva', 'Contraseña nueva', 'new-password') +
    campo('pw_repetir', 'Repetí la contraseña nueva', 'new-password') +
    '<div id="pw_status" class="small" style="margin:4px 0 10px"></div>' +
    '<button class="btn block" id="pw_btn" onclick="guardarNuevaContrasena()">Guardar contraseña</button>');
}
export async function guardarNuevaContrasena() {
  const nueva = valor('pw_nueva'), err = revisarNueva(nueva, valor('pw_repetir'));
  if (err) { estado(err, 'var(--bad)'); return; }
  const btn = document.getElementById('pw_btn'); if (btn) btn.disabled = true;
  try {
    estado('Guardando…');
    const r = await sb.auth.updateUser({ password: nueva });
    if (r.error) { estado('No se pudo guardar: ' + traducir(r.error.message), 'var(--bad)'); return; }
    closeModal(); toast('Listo, ya tenés tu contraseña nueva');
  } finally { if (btn) btn.disabled = false; }
}

/* ---------- El admin cambia la de otro usuario ---------- */
export function contrasenaUsuarioForm(id, email) {
  openModal('<h3>Contraseña nueva</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Para <b>' + esc(email) + '</b>. Pasásela por un medio seguro y pedile que la cambie desde Más → Cambiar mi contraseña.</div>' +
    '<label class="f"><span>Contraseña nueva</span><input id="pw_nueva" type="text" autocomplete="off" autocapitalize="none" spellcheck="false"></label>' +
    '<button class="btn sec sm" style="margin:-4px 0 10px" onclick="generarContrasena()">Inventar una</button>' +
    '<div id="pw_status" class="small" style="margin:4px 0 10px"></div>' +
    '<div class="row"><button class="btn grow" id="pw_btn" onclick="guardarContrasenaUsuario(\'' + esc(id) + '\')">Cambiar</button><button class="btn sec" onclick="usuariosView()">Volver</button></div>');
}
// Sin letras ni números que se confunden (l, 1, O, 0).
export function generarContrasena() {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = new Uint32Array(12); crypto.getRandomValues(r);
  const el = document.getElementById('pw_nueva'); if (el) el.value = Array.from(r, n => abc[n % abc.length]).join('');
}
export async function guardarContrasenaUsuario(id) {
  const password = valor('pw_nueva').trim();
  if (password.length < MIN) { estado('Tiene que tener al menos ' + MIN + ' caracteres.', 'var(--bad)'); return; }
  const btn = document.getElementById('pw_btn'); if (btn) btn.disabled = true;
  try {
    estado('Cambiando…');
    const { data } = await sb.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) { estado('Tenés que iniciar sesión.', 'var(--bad)'); return; }
    let j = null, status = 0;
    try {
      const r = await fetch(SUPABASE_URL + '/functions/v1/usuarios-admin', { method: 'POST', headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'contrasena', userId: id, password }) });
      status = r.status; j = await r.json().catch(() => null);
    } catch (e) { estado('No se pudo conectar. Revisá internet y probá de nuevo.', 'var(--bad)'); return; }
    if (!j || typeof j.ok !== 'boolean') { estado(status === 404 ? 'Falta crear la función usuarios-admin en Supabase.' : 'No se pudo cambiar la contraseña.', 'var(--bad)'); return; }
    if (!j.ok) { estado(traducir(j.error || 'No se pudo cambiar la contraseña.'), 'var(--bad)'); return; }
    estado('✓ Listo. La contraseña nueva es: ' + password + ' — pasásela y pedile que la cambie.', 'var(--ok)');
    if (btn) btn.style.display = 'none';
  } finally { if (btn) btn.disabled = false; }
}
