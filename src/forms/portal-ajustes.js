// Ajustes del portal del chofer: dirección propia (portal.ldrental.com.ar), color de la
// marca, vigencia de los links, horario y teléfono de atención, y términos de uso.
// También arma los links del portal en un solo lugar.
import { esc, iso, today, uid, parse, days } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { settings, saveSettings } from '../settings.js';

// Dirección base del portal: la propia si está configurada, si no la de esta app.
export function basePortal() {
  const b = String(settings.portalBaseUrl || '').trim();
  return /^https:\/\/[^\s/]+/.test(b) ? b.replace(/\/+$/, '') + '/' : location.origin + location.pathname;
}
export const urlPortal = d => (d && d.portalToken ? basePortal() + '#/portal/' + d.id + '/' + d.portalToken : '');
// ¿El link del chofer venció según la vigencia elegida?
export function linkVencido(d) {
  const dias = +settings.portalVigenciaDias || 0;
  if (!dias || !d || !d.portalToken || !d.portalTokenCreado) return false;
  return days(parse(String(d.portalTokenCreado).slice(0, 10)), today()) > dias;
}
export const nuevoToken = () => ({ portalToken: uid() + uid() + uid(), portalTokenCreado: iso(today()) });

export function portalAjustesForm() {
  const t = settings.terminosPortal || {};
  openModal('<h3>Portal del chofer</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Cómo se ve y cómo funciona el portal que usan los choferes.</div>' +
    '<label class="f"><span>Dirección propia del portal <small>opcional, ej: https://portal.ldrental.com.ar</small></span><input id="pa_base" placeholder="https://portal.ldrental.com.ar" value="' + esc(settings.portalBaseUrl || '') + '"></label>' +
    '<div class="small muted" style="margin:-4px 0 10px">Solo después de configurarla en Vercel y en tu DNS. Si la dejás vacía, los links usan la dirección de la app.</div>' +
    '<div class="two"><label class="f"><span>Color de la marca</span><input id="pa_color" type="color" value="' + esc(/^#[0-9a-f]{6}$/i.test(settings.colorPortal || '') ? settings.colorPortal : '#222b33') + '"></label>' +
    '<label class="f"><span>Los links vencen a los <small>días (0 = nunca)</small></span><input id="pa_vig" inputmode="numeric" value="' + esc(String(settings.portalVigenciaDias || 0)) + '"></label></div>' +
    '<div class="small muted" style="margin:-4px 0 10px">Con un chofer dado de baja, su link deja de andar siempre. Si elegís días, cuando le mandes el link (bienvenida o copiar) se genera uno nuevo solo.</div>' +
    '<div class="two"><label class="f"><span>Horario de atención</span><input id="pa_horario" placeholder="ej: lunes a viernes de 9 a 18" value="' + esc(settings.soporteHorario || '') + '"></label>' +
    '<label class="f"><span>Teléfono de atención</span><input id="pa_tel" type="tel" placeholder="ej: +5491155551234" value="' + esc(settings.soporteTel || '') + '"></label></div>' +
    '<label class="f"><span>Términos de uso <small>el chofer los acepta la primera vez que entra, y otra vez si los cambiás</small></span><textarea id="pa_terminos" rows="8" placeholder="Ej: El portal es personal. No compartas tu link. Los datos que ves son informativos…">' + esc(t.texto || '') + '</textarea></label>' +
    (t.version ? '<div class="small muted" style="margin:-4px 0 10px">Versión vigente: ' + esc(t.version) + '</div>' : '') +
    '<div class="row"><button class="btn grow" onclick="guardarPortalAjustes()">Guardar</button><button class="btn sec" onclick="closeModal()">Cerrar</button></div>' +
    '<div class="small muted" style="margin-top:8px">El color, el horario y los términos los ve el chofer cuando esté pegada la versión nueva de portal-chofer en Supabase.</div>');
}
export function guardarPortalAjustes() {
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  const base = v('pa_base');
  if (base && !/^https:\/\/[^\s/]+/.test(base)) { toast('La dirección tiene que empezar con https://'); return; }
  const texto = v('pa_terminos');
  const ant = settings.terminosPortal || {};
  // Si cambia el texto, cambia la versión y los choferes los vuelven a aceptar.
  const terminos = texto ? { texto, version: texto === ant.texto ? ant.version : iso(today()) + '-' + Math.random().toString(36).slice(2, 6) } : null;
  saveSettings({ portalBaseUrl: base, colorPortal: v('pa_color'), portalVigenciaDias: Math.max(0, Math.round(+v('pa_vig') || 0)), soporteHorario: v('pa_horario'), soporteTel: v('pa_tel'), terminosPortal: terminos });
  toast('Ajustes del portal guardados'); portalAjustesForm();
}
