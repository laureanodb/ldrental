import { S, sb } from './state.js';
import { VAPID_PUBLIC_KEY } from './config.js';
import { toast } from './modal.js';
import { render } from './nav.js';

export function pushSoportado() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
export function pushConfigurado() {
  return Boolean(VAPID_PUBLIC_KEY);
}
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

const cache = { checked: false, checking: false, estado: 'inactivo', prefs: { vencimientos: true, deuda: true, multas: true } };
export function pushEstadoCache() { return cache; }
export async function refrescarPushEstado() {
  if (cache.checking) return;
  if (!pushSoportado()) { cache.estado = 'no-soportado'; cache.checked = true; return; }
  cache.checking = true;
  try {
    if (Notification.permission === 'denied') { cache.estado = 'bloqueado'; }
    else {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      cache.estado = sub ? 'activo' : 'inactivo';
      if (sub) {
        const j = sub.toJSON();
        const r = await sb.from('push_subscriptions').select('prefs').eq('endpoint', j.endpoint).maybeSingle();
        if (r.data && r.data.prefs) cache.prefs = Object.assign({ vencimientos: true, deuda: true, multas: true }, r.data.prefs);
      }
    }
  } catch (e) { cache.estado = 'inactivo'; }
  cache.checked = true; cache.checking = false;
  render();
}
export async function activarPush() {
  if (!pushSoportado()) { toast('Este navegador no admite notificaciones push'); return; }
  if (!pushConfigurado()) { toast('Las notificaciones push todavía no están configuradas'); return; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('No se dio permiso para las notificaciones'); cache.estado = perm === 'denied' ? 'bloqueado' : 'inactivo'; render(); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    const j = sub.toJSON();
    const r = await sb.from('push_subscriptions').upsert(
      { user_id: S.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
      { onConflict: 'endpoint' }
    );
    if (r.error) { toast('No se pudo activar: ' + r.error.message); return; }
    cache.estado = 'activo'; toast('Notificaciones activadas'); render();
  } catch (e) {
    toast('No se pudo activar: ' + ((e && e.message) || 'error')); render();
  }
}
export async function guardarHorarioPush() {
  const input = document.getElementById('a_pushHora');
  if (!input) return;
  const horaAR = +input.value;
  if (Number.isNaN(horaAR) || horaAR < 0 || horaAR > 23) { toast('Poné una hora entre 0 y 23'); return; }
  const horaUTC = (horaAR + 3) % 24;
  const r = await sb.rpc('set_push_schedule', { hora_utc: horaUTC });
  if (r.error) { toast('No se pudo guardar el horario: ' + r.error.message); return; }
  toast('Horario guardado. El resumen diario va a llegar a las ' + horaAR + ':00 (hora Argentina).');
}
export async function guardarPreferenciasPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const prefs = {
      vencimientos: document.getElementById('pp_venc').checked,
      deuda: document.getElementById('pp_deuda').checked,
      multas: document.getElementById('pp_multas').checked,
    };
    const j = sub.toJSON();
    const r = await sb.from('push_subscriptions').update({ prefs }).eq('endpoint', j.endpoint);
    if (r.error) { toast('No se pudo guardar: ' + r.error.message); return; }
    cache.prefs = prefs;
    toast('Preferencias guardadas');
  } catch (e) {
    toast('No se pudo guardar: ' + ((e && e.message) || 'error'));
  }
}
export async function desactivarPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
    }
    cache.estado = 'inactivo'; toast('Notificaciones desactivadas'); render();
  } catch (e) {
    toast('No se pudo desactivar: ' + ((e && e.message) || 'error')); render();
  }
}
