import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { S, sb, setSb, setAs, configured } from './state.js';
import { $, val } from './utils.js';
import { COLS } from './constants.js';
import { load, flushQueue } from './data.js';
import { render } from './nav.js';
import { makeStorage } from './storage.js';
import { loadOwnProfile } from './roles.js';
import { brandH1 } from './settings.js';
import { generarGastosRecurrentes } from './recurrentes.js';
import { checkChangelog } from './changelog.js';
import { biometricRegistrado } from './biometric.js';

export function viewSetup() {
  return '<div class="login">' + brandH1() + '<div class="card"><b>Falta configurar la conexión</b><p class="small muted">Completá VITE_SUPABASE_URL y VITE_SUPABASE_KEY en el archivo .env, con los datos de tu proyecto de Supabase.</p></div></div>';
}
export function viewLogin() {
  return '<div class="login">' + brandH1() + '<p class="sub">Ingresá con tu usuario</p>' +
  (biometricRegistrado() ? '<button class="btn block" style="margin-bottom:10px" onclick="loginConBiometria()">Entrar con huella / rostro</button><div class="small muted" style="text-align:center;margin-bottom:14px">o con tu contraseña</div>' : '') +
  '<label class="f"><span>Email</span><input id="l_email" type="email" autocomplete="username" inputmode="email" autocapitalize="none"></label>' +
  '<label class="f"><span>Contraseña</span><input id="l_pass" type="password" autocomplete="current-password" onkeydown="if(event.key===\'Enter\')doLogin()"></label>' +
  '<button class="btn block" onclick="doLogin()">Entrar</button><div id="l_err" class="small" style="color:var(--bad);margin-top:10px"></div></div>';
}
export async function doLogin() {
  const email = val('l_email'), password = document.getElementById('l_pass').value;
  const err = document.getElementById('l_err');
  if (!email || !password) { err.textContent = 'Completá el email y la contraseña.'; return; }
  err.textContent = 'Entrando…'; err.style.color = 'var(--muted)';
  const r = await sb.auth.signInWithPassword({ email, password });
  if (r.error) { err.style.color = 'var(--bad)'; err.textContent = /invalid login/i.test(r.error.message) ? 'Email o contraseña incorrectos.' : r.error.message; }
}
export async function logout() {
  try { localStorage.removeItem('flota-biometria'); } catch (e) {}
  await sb.auth.signOut();
}
export async function start() {
  S.ready = false; render();
  await flushQueue();
  await Promise.all([...COLS.map(load), loadOwnProfile()]);
  S.ready = true; render();
  generarGastosRecurrentes();
  checkChangelog();
  if (!S.chan) {
    S.chan = sb.channel('flota');
    const timers = {};
    COLS.forEach(c => S.chan.on('postgres_changes', { event: '*', schema: 'public', table: c }, () => {
      clearTimeout(timers[c]); timers[c] = setTimeout(async () => { await load(c); render(); }, 300);
    }));
    S.chan.subscribe();
  }
}
export function stop() {
  if (S.chan) { try { sb.removeChannel(S.chan); } catch (e) {} S.chan = null; }
  COLS.forEach(c => S[c] = []); S.ready = false; S.profile = null; S.profilesEnabled = false;
}

export async function init() {
  render();
  if (!configured()) return;
  setSb(createClient(SUPABASE_URL, SUPABASE_KEY));
  setAs(makeStorage());
  const g = await sb.auth.getSession();
  S.user = (g.data && g.data.session) ? g.data.session.user : null;
  sb.auth.onAuthStateChange((ev, session) => {
    const u = session ? session.user : null;
    const changed = (u && u.id) !== (S.user && S.user.id);
    S.user = u;
    if (changed) setTimeout(() => { if (u) start(); else { stop(); render(); } }, 0);
  });
  if (S.user) start(); else render();
}
