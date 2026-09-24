import { S } from '../state.js';
import { esc, val, fdate, iso, today } from '../utils.js';
import { badge, usoDeDatos } from '../calc.js';
import { settings, saveSettings } from '../settings.js';
import { PANEL_KPIS } from '../constants.js';
import { snooze } from '../snooze.js';
import { toast, openModal } from '../modal.js';
import { render } from '../nav.js';
import { isAdmin } from '../roles.js';
import { pushSoportado, pushConfigurado, pushEstadoCache, refrescarPushEstado } from '../push.js';
import { canVerFinanzas } from '../roles.js';

function pushCard() {
  if (!pushSoportado() || !pushConfigurado()) return '';
  const cache = pushEstadoCache();
  if (!cache.checked) refrescarPushEstado();
  const on = cache.estado === 'activo';
  const bloqueado = cache.estado === 'bloqueado';
  return '<div class="card"><div class="row between"><div><div>Notificaciones push</div><div class="small muted">' + (bloqueado ? 'Bloqueadas en el navegador. Habilitalas en los ajustes del sitio.' : 'Un resumen diario de vencimientos, deudas y multas.') + '</div></div>' +
  (bloqueado ? '' : '<button class="btn sec sm" onclick="' + (on ? 'desactivarPush()' : 'activarPush()') + '">' + (on ? 'Desactivar' : 'Activar') + '</button>') + '</div>' +
  (on ? '<div style="margin-top:10px"><div class="small muted" style="margin-bottom:6px">Qué querés que te avise el resumen diario</div>' +
  '<label class="chk"><input type="checkbox" id="pp_venc"' + (cache.prefs.vencimientos !== false ? ' checked' : '') + '><span>Vencimientos urgentes</span></label>' +
  '<label class="chk"><input type="checkbox" id="pp_deuda"' + (cache.prefs.deuda !== false ? ' checked' : '') + '><span>Choferes con deuda</span></label>' +
  '<label class="chk"><input type="checkbox" id="pp_multas"' + (cache.prefs.multas !== false ? ' checked' : '') + '><span>Multas pendientes</span></label>' +
  '<button class="btn sec block" style="margin-top:6px" onclick="guardarPreferenciasPush()">Guardar preferencias</button></div>' : '') +
  (isAdmin() ? '<div style="margin-top:10px"><label class="f"><span>Hora del resumen <small>Argentina</small></span><input id="a_pushHora" inputmode="numeric" value="8"></label><button class="btn sec block" onclick="guardarHorarioPush()">Guardar horario</button></div>' : '') +
  '</div>';
}

export function ajustesCard() {
  return '<h2>Ajustes</h2><div class="card"><div class="small muted" style="margin-bottom:10px">Cuántos días antes querés que un vencimiento se marque como urgente o próximo.</div>' +
  '<div class="two"><label class="f"><span>Aviso urgente (días)</span><input id="a_warn" inputmode="numeric" value="' + settings.avisoWarn + '"></label>' +
  '<label class="f"><span>Aviso próximo (días)</span><input id="a_soft" inputmode="numeric" value="' + settings.avisoSoft + '"></label></div>' +
  '<button class="btn sec block" onclick="saveAjustes()">Guardar ajustes</button></div>' +
  '<div class="card"><div class="small muted" style="margin-bottom:10px">Elegí qué indicadores mostrar arriba en el Panel.</div>' +
  PANEL_KPIS.map(x => '<label class="chk"><input type="checkbox" class="a_kpi" value="' + x[0] + '"' + (settings.panelKpis.includes(x[0]) ? ' checked' : '') + '><span>' + x[1] + '</span></label>').join('') +
  '<button class="btn sec block" style="margin-top:10px" onclick="saveAjustes()">Guardar ajustes</button></div>' +
  pushCard() +
  (isAdmin() ? '<div class="card"><div class="small muted" style="margin-bottom:10px">Umbrales y políticas de la flota.</div>' +
  '<div class="two"><label class="f"><span>Depósito: avisar si baja de <small>%</small></span><input id="a_depPct" inputmode="numeric" value="' + settings.depositoAvisoPct + '"></label>' +
  '<label class="f"><span>Multas: límite acumulado</span><input id="a_multaUmbral" inputmode="numeric" value="' + settings.multaUmbral + '"></label></div>' +
  '<div class="two"><label class="f"><span>Multas: plazo de pago <small>días</small></span><input id="a_multaPlazo" inputmode="numeric" value="' + settings.multaPlazoDias + '"></label>' +
  '<label class="f"><span>Km esperados por semana</span><input id="a_kmSemana" inputmode="numeric" value="' + settings.kmSemanaEsperado + '"></label></div>' +
  '<div class="two"><label class="f"><span>Fotos de control cada <small>días</small></span><input id="a_fotoDias" inputmode="numeric" value="' + settings.fotoControlDias + '"></label>' +
  '<label class="f"><span>Bono: semanas sin atraso</span><input id="a_bonoSemanas" inputmode="numeric" value="' + settings.bonoSemanas + '"></label></div>' +
  '<label class="f"><span>Chofer en riesgo: semanas de atraso</span><input id="a_riesgoSemanas" inputmode="numeric" value="' + settings.riesgoSemanas + '"></label>' +
  '<div class="two"><label class="f"><span>Multas: recargo por pago tardío <small>%</small></span><input id="a_multaRecargo" inputmode="numeric" value="' + settings.multaRecargoPct + '"></label>' +
  '<label class="f"><span>Puntos de licencia: límite de aviso</span><input id="a_puntosLimite" inputmode="numeric" value="' + settings.puntosLimite + '"></label></div>' +
  '<label class="f"><span>Auto disponible sin asignar: avisar a los <small>días</small></span><input id="a_autoParadoDias" inputmode="numeric" value="' + settings.autoParadoDias + '"></label>' +
  '<button class="btn sec block" onclick="saveAjustes()">Guardar ajustes</button></div>' : '') +
  (isAdmin() ? '<div class="card"><div class="small muted" style="margin-bottom:10px">Nombre, teléfono y logo que aparecen en el login, el panel y los QR de los autos.</div>' +
  '<label class="f"><span>Nombre de la empresa</span><input id="a_companyName" value="' + esc(settings.companyName) + '"></label>' +
  '<label class="f"><span>Teléfono de WhatsApp <small>para QR de reporte</small></span><input id="a_companyPhone" type="tel" placeholder="5491122334455" value="' + esc(settings.companyPhone) + '"></label>' +
  (settings.companyLogo ? '<div class="row" style="margin-bottom:10px;align-items:center"><img src="' + settings.companyLogo + '" alt="" style="height:36px"><button class="btn sec sm" onclick="quitarLogo()">Quitar logo</button></div>' : '') +
  '<label class="btn sec block filebtn" style="margin-bottom:10px">' + (settings.companyLogo ? 'Cambiar logo' : 'Subir logo') + '<input id="logoIn" type="file" accept="image/*" onchange="subirLogo(this)"></label>' +
  '<button class="btn sec block" onclick="guardarNombreEmpresa()">Guardar</button></div>' : '') +
  (isAdmin() ? '<div class="card"><div class="small muted" style="margin-bottom:10px">Protocolo de emergencia: se muestra a todos los usuarios y a los choferes en su portal.</div>' +
  '<label class="f"><span>Teléfono de emergencia</span><input id="a_telEmergencia" type="tel" value="' + esc(settings.telefonoEmergencia) + '"></label>' +
  '<label class="f"><span>Pasos a seguir</span><textarea id="a_protocoloEmergencia" placeholder="ej: 1) Ponerse a salvo. 2) Llamar al teléfono de emergencia. 3) Sacar fotos si es seguro hacerlo...">' + esc(settings.protocoloEmergencia) + '</textarea></label>' +
  '<button class="btn sec block" onclick="guardarProtocoloEmergencia()">Guardar</button></div>' : '');
}
export function saveAjustes() {
  const w = +val('a_warn') || 15, s = +val('a_soft') || 30;
  const patch = { avisoWarn: w, avisoSoft: Math.max(w, s) };
  const kpiEls = document.querySelectorAll('.a_kpi');
  if (kpiEls.length) patch.panelKpis = [...kpiEls].filter(el => el.checked).map(el => el.value);
  const depPct = document.getElementById('a_depPct');
  if (depPct) Object.assign(patch, {
    depositoAvisoPct: +depPct.value || settings.depositoAvisoPct,
    multaUmbral: +val('a_multaUmbral') || settings.multaUmbral,
    multaPlazoDias: +val('a_multaPlazo') || settings.multaPlazoDias,
    kmSemanaEsperado: +val('a_kmSemana') || settings.kmSemanaEsperado,
    fotoControlDias: +val('a_fotoDias') || settings.fotoControlDias,
    bonoSemanas: +val('a_bonoSemanas') || settings.bonoSemanas,
    riesgoSemanas: +val('a_riesgoSemanas') || settings.riesgoSemanas,
    multaRecargoPct: +val('a_multaRecargo') || settings.multaRecargoPct,
    puntosLimite: +val('a_puntosLimite') || settings.puntosLimite,
    autoParadoDias: +val('a_autoParadoDias') || settings.autoParadoDias,
  });
  saveSettings(patch);
  toast('Ajustes guardados'); render();
}
export function guardarNombreEmpresa() {
  saveSettings({ companyName: val('a_companyName') || 'LD Rental', companyPhone: val('a_companyPhone') });
  toast('Guardado'); render();
}
export function subirLogo(input) {
  const f = input.files && input.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = () => { saveSettings({ companyLogo: reader.result }); toast('Logo guardado'); render(); };
  reader.readAsDataURL(f);
}
export function quitarLogo() { saveSettings({ companyLogo: '' }); toast('Logo quitado'); render(); }
export function guardarProtocoloEmergencia() {
  saveSettings({ telefonoEmergencia: val('a_telEmergencia'), protocoloEmergencia: val('a_protocoloEmergencia') });
  toast('Protocolo guardado'); render();
}
export function anunciosForm() {
  const L = (settings.anuncios || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const h = '<h3>Tablón de anuncios</h3><div class="small muted" style="margin-bottom:10px">Se muestra a los choferes en su portal.</div>' +
  '<label class="f"><span>Nuevo anuncio</span><textarea id="an_texto"></textarea></label>' +
  '<button class="btn sec block" style="margin-bottom:14px" onclick="agregarAnuncio()">Publicar</button>' +
  (L.length ? L.map(a => '<div class="card row"><div class="grow"><div>' + esc(a.texto) + '</div><div class="small muted">' + fdate(a.fecha) + '</div></div><button class="btn danger sm" onclick="borrarAnuncio(\'' + a.id + '\')">Borrar</button></div>').join('') : '<div class="small muted">Sin anuncios publicados.</div>') +
  '<div class="row" style="margin-top:14px"><button class="btn sec grow" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
}
export function agregarAnuncio() {
  const texto = val('an_texto');
  if (!texto) { toast('Escribí el anuncio'); return; }
  const anuncios = (settings.anuncios || []).concat([{ id: String(Date.now()), texto, fecha: iso(today()) }]);
  saveSettings({ anuncios });
  toast('Anuncio publicado');
  anunciosForm();
}
export function borrarAnuncio(id) {
  saveSettings({ anuncios: (settings.anuncios || []).filter(a => a.id !== id) });
  anunciosForm();
}
export function protocoloEmergenciaForm() {
  const tel = settings.telefonoEmergencia;
  const h = '<h3>Protocolo de emergencia</h3>' +
  (tel ? '<a class="btn block" style="margin-bottom:14px" href="tel:' + esc(tel) + '">Llamar a ' + esc(tel) + '</a>' : '<div class="small muted" style="margin-bottom:14px">Todavía no se cargó un teléfono de emergencia.</div>') +
  (settings.protocoloEmergencia ? '<div class="card" style="white-space:pre-wrap">' + esc(settings.protocoloEmergencia) + '</div>' : '<div class="small muted">Todavía no se cargaron los pasos a seguir.</div>') +
  '<div class="row" style="margin-top:14px"><button class="btn sec grow" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
}
function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}
export function backupCard() {
  const u = usoDeDatos();
  return '<h2>Copia de seguridad</h2><div class="card"><div class="small muted" style="margin-bottom:10px">Descargá un archivo con todos tus autos, choferes y cobros y guardalo en tu celular, Drive o mail. Sirve para recuperar todo si algo se pierde. Las fotos y PDF adjuntos no van dentro del archivo.</div>' +
  '<div class="row">' + '<button class="btn grow" onclick="backup()">Descargar copia</button>' + '<label class="btn sec grow filebtn">Restaurar copia<input id="restoreIn" type="file" onchange="pickRestore(this)"></label></div></div>' +
  '<div class="card"><div class="row between"><span class="muted">Uso de datos</span><b>' + u.registros + ' registros · ' + fmtBytes(u.bytes) + '</b></div>' +
  u.porColeccion.slice(0, 6).map(x => '<div class="row between small" style="padding:2px 0"><span class="muted">' + esc(x.col) + '</span><span>' + x.n + ' · ' + fmtBytes(x.bytes) + '</span></div>').join('') + '</div>' +
  (canVerFinanzas() ? '<div class="card"><div class="small muted" style="margin-bottom:10px">Exportá todos los datos a un archivo Excel (una hoja por sección) para analizarlos o compartirlos.</div>' +
  '<button class="btn sec block" onclick="exportarExcel()">Exportar todo a Excel</button></div>' : '') +
  '<button class="btn sec block" style="margin-top:8px" onclick="logout()">Cerrar sesión (' + esc(S.user && S.user.email || '') + ')</button>';
}
export function alertRow(a) {
  const open = a.kind === 'car' ? "carForm('" + a.id + "')" : a.kind === 'multa' ? "multaForm('" + a.carId + "','" + a.id + "')" : a.kind === 'proveedor' ? "proveedoresView('" + a.id + "')" : a.kind === 'recordatorio' ? "recordatoriosView('" + a.id + "')" : a.kind === 'sistema' ? "go('cobros')" : "driverForm('" + a.id + "')";
  return '<div class="card row"><div class="grow tap" onclick="' + open + '"><div>' + esc(a.who) + '</div><div class="small muted">' + esc(a.sub) + '</div></div>' +
  '<div class="right">' + badge(a.cls, a.t) + '<div style="margin-top:4px"><button class="btn sec sm" onclick="snoozeAlert(\'' + esc(a.key) + '\')">Posponer</button></div></div></div>';
}
export function snoozeAlert(key) { snooze(key, 7); toast('Pospuesto 7 días'); render(); }
