import { GOOGLE_CLIENT_ID } from './config.js';
import { toast } from './modal.js';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');
const TOKEN_KEY = 'flota-google-token';

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;
let gisLoading = null;

try {
  const raw = sessionStorage.getItem(TOKEN_KEY);
  if (raw) { const d = JSON.parse(raw); if (d.tokenExpiry > Date.now()) { accessToken = d.accessToken; tokenExpiry = d.tokenExpiry; } }
} catch (e) {}

export function loadGis() {
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    s.onerror = () => { gisLoading = null; reject(new Error('No se pudo cargar Google')); };
    document.head.appendChild(s);
  });
  return gisLoading;
}

export const googleConfigured = () => Boolean(GOOGLE_CLIENT_ID);
export const isGoogleConnected = () => Boolean(accessToken && Date.now() < tokenExpiry);

export async function conectarGoogle() {
  if (!googleConfigured()) { toast('Falta configurar VITE_GOOGLE_CLIENT_ID para conectar con Google'); return false; }
  try { await loadGis(); } catch (e) { toast('No se pudo cargar Google. Revisá tu conexión.'); return false; }
  return new Promise(resolve => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error) { toast('No se pudo conectar con Google: ' + resp.error); resolve(false); return; }
        accessToken = resp.access_token;
        tokenExpiry = Date.now() + ((resp.expires_in || 3600) * 1000) - 60000;
        try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken, tokenExpiry })); } catch (e) {}
        toast('Conectado con Google');
        resolve(true);
      },
    });
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

export async function ensureGoogleToken() {
  if (isGoogleConnected()) return accessToken;
  const ok = await conectarGoogle();
  return ok ? accessToken : null;
}

export async function googleFetch(url, options) {
  const token = await ensureGoogleToken();
  if (!token) throw new Error('No conectado con Google');
  const headers = Object.assign({ Authorization: 'Bearer ' + token }, (options && options.headers) || {});
  const r = await fetch(url, Object.assign({}, options, { headers }));
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Google API (' + r.status + '): ' + t.slice(0, 200)); }
  if (r.status === 204) return null;
  return r.json();
}
