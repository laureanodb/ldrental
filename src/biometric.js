import { sb, S } from './state.js';
import { toast } from './modal.js';
import { render } from './nav.js';

const KEY = 'flota-biometria';

function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

export function biometricSoportado() {
  return typeof window !== 'undefined' && window.PublicKeyCredential && navigator.credentials;
}
export function biometricRegistrado() {
  try { return Boolean(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return false; }
}
export async function activarBiometria() {
  if (!biometricSoportado()) { toast('Este dispositivo no admite biometría'); return; }
  try {
    const disponible = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!disponible) { toast('No se detectó huella, rostro ni PIN del dispositivo'); return; }
    const g = await sb.auth.getSession();
    const session = g.data && g.data.session;
    if (!session) { toast('Iniciá sesión de nuevo antes de activar la biometría'); return; }
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge, rp: { name: 'LD Rental' },
        user: { id: userId, name: S.user.email || 'usuario', displayName: S.user.email || 'usuario' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000,
      },
    });
    if (!cred) { toast('No se pudo registrar la biometría'); return; }
    localStorage.setItem(KEY, JSON.stringify({ credentialId: b64(cred.rawId), refreshToken: session.refresh_token, email: S.user.email }));
    toast('Acceso biométrico activado en este dispositivo');
    render();
  } catch (e) {
    toast('No se pudo activar: ' + ((e && e.message) || 'error'));
  }
}
export function desactivarBiometria() {
  localStorage.removeItem(KEY);
  toast('Acceso biométrico desactivado');
  render();
}
export async function loginConBiometria() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return;
  let data; try { data = JSON.parse(raw); } catch (e) { return; }
  const err = document.getElementById('l_err');
  try {
    if (err) { err.style.color = 'var(--muted)'; err.textContent = 'Verificando…'; }
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: { challenge, allowCredentials: [{ id: unb64(data.credentialId), type: 'public-key' }], userVerification: 'required', timeout: 60000 },
    });
    if (!assertion) { if (err) err.textContent = 'No se pudo verificar.'; return; }
    const r = await sb.auth.refreshSession({ refresh_token: data.refreshToken });
    if (r.error || !r.data.session) {
      localStorage.removeItem(KEY);
      if (err) { err.style.color = 'var(--bad)'; err.textContent = 'La sesión guardada venció. Ingresá con tu contraseña.'; }
      return;
    }
    data.refreshToken = r.data.session.refresh_token;
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    if (err) { err.style.color = 'var(--bad)'; err.textContent = 'No se pudo verificar la biometría.'; }
  }
}
