import { S } from '../state.js';
import { esc } from '../utils.js';
import { badge } from '../calc.js';

export function backupCard() {
  return '<h2>Copia de seguridad</h2><div class="card"><div class="small muted" style="margin-bottom:10px">Descargá un archivo con todos tus autos, choferes y cobros y guardalo en tu celular, Drive o mail. Sirve para recuperar todo si algo se pierde. Las fotos y PDF adjuntos no van dentro del archivo.</div>' +
  '<div class="row">' + '<button class="btn grow" onclick="backup()">Descargar copia</button>' + '<label class="btn sec grow filebtn">Restaurar copia<input id="restoreIn" type="file" onchange="pickRestore(this)"></label></div></div>' +
  '<button class="btn sec block" style="margin-top:8px" onclick="logout()">Cerrar sesión (' + esc(S.user && S.user.email || '') + ')</button>';
}
export function alertRow(a) {
  return '<div class="card tap row" onclick="' + (a.kind === 'car' ? "carForm('" : "driverForm('") + a.id + '\')"><div class="grow"><div>' + esc(a.who) + '</div><div class="small muted">' + esc(a.sub) + '</div></div>' + badge(a.cls, a.t) + '</div>';
}
