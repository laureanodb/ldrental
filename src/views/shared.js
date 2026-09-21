import { S } from '../state.js';
import { esc, val } from '../utils.js';
import { badge } from '../calc.js';
import { settings, saveSettings } from '../settings.js';
import { toast } from '../modal.js';
import { render } from '../nav.js';

export function ajustesCard() {
  return '<h2>Ajustes</h2><div class="card"><div class="small muted" style="margin-bottom:10px">Cuántos días antes querés que un vencimiento se marque como urgente o próximo.</div>' +
  '<div class="two"><label class="f"><span>Aviso urgente (días)</span><input id="a_warn" inputmode="numeric" value="' + settings.avisoWarn + '"></label>' +
  '<label class="f"><span>Aviso próximo (días)</span><input id="a_soft" inputmode="numeric" value="' + settings.avisoSoft + '"></label></div>' +
  '<button class="btn sec block" onclick="saveAjustes()">Guardar ajustes</button></div>';
}
export function saveAjustes() {
  const w = +val('a_warn') || 15, s = +val('a_soft') || 30;
  saveSettings({ avisoWarn: w, avisoSoft: Math.max(w, s) });
  toast('Ajustes guardados'); render();
}
export function backupCard() {
  return '<h2>Copia de seguridad</h2><div class="card"><div class="small muted" style="margin-bottom:10px">Descargá un archivo con todos tus autos, choferes y cobros y guardalo en tu celular, Drive o mail. Sirve para recuperar todo si algo se pierde. Las fotos y PDF adjuntos no van dentro del archivo.</div>' +
  '<div class="row">' + '<button class="btn grow" onclick="backup()">Descargar copia</button>' + '<label class="btn sec grow filebtn">Restaurar copia<input id="restoreIn" type="file" onchange="pickRestore(this)"></label></div></div>' +
  '<button class="btn sec block" style="margin-top:8px" onclick="logout()">Cerrar sesión (' + esc(S.user && S.user.email || '') + ')</button>';
}
export function alertRow(a) {
  return '<div class="card tap row" onclick="' + (a.kind === 'car' ? "carForm('" : "driverForm('") + a.id + '\')"><div class="grow"><div>' + esc(a.who) + '</div><div class="small muted">' + esc(a.sub) + '</div></div>' + badge(a.cls, a.t) + '</div>';
}
