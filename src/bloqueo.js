// Bloqueo por inactividad: si la app queda abierta sin usar (o en segundo plano) más de
// los minutos elegidos, se tapa la pantalla y pide la huella o la contraseña para seguir.
// Así, un celular olvidado en el taller no deja ver ni tocar la flota.
import { S, sb } from './state.js';
import { settings } from './settings.js';
import { esc } from './utils.js';
import { biometricRegistrado, verificarBiometria } from './biometric.js';
import { enPractica } from './practica.js';

const minutos = () => (settings.bloqueoMinutos === undefined ? 15 : +settings.bloqueoMinutos || 0);
let ultimo = Date.now(), bloqueada = false, instalado = false;

export function instalarBloqueo() {
  if (instalado) return; instalado = true;
  const actividad = () => { if (!bloqueada) ultimo = Date.now(); };
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev => window.addEventListener(ev, actividad, { passive: true, capture: true }));
  const revisar = () => {
    const m = minutos();
    if (!m || bloqueada || !S.user || enPractica()) return;
    if (Date.now() - ultimo > m * 60000) bloquear();
  };
  setInterval(revisar, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisar(); });
}
export function bloquear() {
  if (bloqueada || !S.user) return;
  bloqueada = true;
  const bio = biometricRegistrado();
  const d = document.createElement('div');
  d.id = 'bloqueo';
  d.style.cssText = 'position:fixed;inset:0;z-index:1000;background:var(--bg,#eef0ee);display:flex;align-items:center;justify-content:center;padding:24px';
  d.innerHTML = '<div class="card" style="max-width:360px;width:100%"><h3 style="margin-top:0">App bloqueada</h3>' +
    '<div class="small muted" style="margin-bottom:12px">Pasó un rato sin usarla. ' + esc(S.user.email || '') + '</div>' +
    (bio ? '<button class="btn block" id="bq_bio" style="margin-bottom:10px">Desbloquear con huella / rostro</button>' : '') +
    '<label class="f"><span>Contraseña</span><input id="bq_pass" type="password" autocomplete="current-password"></label>' +
    '<button class="btn ' + (bio ? 'sec ' : '') + 'block" id="bq_btn">Desbloquear</button>' +
    '<div id="bq_err" class="small" style="color:var(--bad);margin-top:8px"></div>' +
    '<button class="btn sec block" id="bq_salir" style="margin-top:10px;border:0;background:transparent">Cerrar sesión</button></div>';
  document.body.appendChild(d);
  const err = t => { const e = document.getElementById('bq_err'); if (e) e.textContent = t; };
  const pass = async () => {
    const p = document.getElementById('bq_pass').value;
    if (!p) { err('Escribí tu contraseña.'); return; }
    err('');
    const r = await sb.auth.signInWithPassword({ email: S.user.email, password: p });
    if (r.error) { err(/invalid/i.test(r.error.message) ? 'Contraseña incorrecta.' : r.error.message); return; }
    desbloquear();
  };
  document.getElementById('bq_btn').onclick = pass;
  document.getElementById('bq_pass').onkeydown = e => { if (e.key === 'Enter') pass(); };
  document.getElementById('bq_salir').onclick = () => { desbloquear(); window.logout(); };
  if (bio) {
    const b = document.getElementById('bq_bio');
    b.onclick = async () => { if (await verificarBiometria()) desbloquear(); else err('No se pudo verificar. Probá con la contraseña.'); };
    b.click();
  } else document.getElementById('bq_pass').focus();
}
function desbloquear() {
  bloqueada = false; ultimo = Date.now();
  const d = document.getElementById('bloqueo'); if (d) d.remove();
}
