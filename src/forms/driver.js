import { $, esc, val, uid, money, moneyUSD, fdate, iso, today } from '../utils.js';
import { S } from '../state.js';
import { DOCS, RATINGS, MULTA_ESTADOS, ETAPAS_PROSPECTO, ONBOARDING_ITEMS, CANALES_PROSPECTO, METODOS_PAGO, COMUNICACION_TIPOS } from '../constants.js';
import { plate, driverDebt, carHistoryForDriver, driverScore, multasDeChofer, estadoMultaCls, badge, saldoDeposito, depositosDeChofer, sugerirAptoFinanciar, driverEnRiesgo, driverCalificaBono, puntosLicencia, metodoPreferidoChofer } from '../calc.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { renderFiles, purgeFiles } from '../files.js';
import { canDelete } from '../roles.js';
import { settings } from '../settings.js';

function telRow(t) {
  t = t || {};
  return '<div class="two d-tel"><input class="d-tel-etq" placeholder="Etiqueta (familiar, taller...)" value="' + esc(t.etiqueta) + '">' +
  '<div class="row"><input class="d-tel-num grow" type="tel" placeholder="Teléfono" value="' + esc(t.tel) + '"><button class="btn danger sm" onclick="this.closest(\'.d-tel\').remove()">✕</button></div></div>';
}
export function addTelRow() { $('#d_tels').insertAdjacentHTML('beforeend', telRow()); }
export function onFotoPerfil(input) {
  const f = input.files && input.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const data = document.getElementById('d_fotoPerfilData'); if (data) data.value = reader.result;
    const img = document.getElementById('d_fotoPreview'); if (img) { img.src = reader.result; img.style.display = ''; }
  };
  reader.readAsDataURL(f);
}

export function setTabChofer(t) {
  document.querySelectorAll('.tabpanel[data-scope="chofer"]').forEach(el => { el.style.display = el.dataset.tab === t ? '' : 'none'; });
  document.querySelectorAll('.tabs[data-scope="chofer"] .tab').forEach(b => { b.classList.toggle('on', b.dataset.tab === t); });
}
function tabpanelChofer(tab, visible, content) {
  return '<div class="tabpanel" data-scope="chofer" data-tab="' + tab + '"' + (visible ? '' : ' style="display:none"') + '>' + content + '</div>';
}

export function driverForm(id) {
  const ex = S.drivers.find(x => x.id === id);
  const d = ex || { docs: {} };
  let h = '<h3>' + (ex ? esc(d.nombre) : 'Nuevo chofer') + '</h3>';
  if (ex && d.inactivo) h += '<div class="card" style="margin-bottom:10px"><span class="badge b-mute">Inactivo</span></div>';
  if (ex && d.prospecto) h += '<div class="card row between" style="margin-bottom:10px"><span class="badge b-info">Prospecto · ' + esc((ETAPAS_PROSPECTO.find(x => x[0] === d.etapaProspecto) || [0, 'Contacto inicial'])[1]) + '</span><button class="btn sm" onclick="aprobarProspecto(\'' + d.id + '\')">Aprobar y dar de alta</button></div>';
  if (ex && !d.prospecto) {
    const autoAsignado = S.cars.find(c => c.choferId === d.id && !c.vendido);
    h += '<div class="card" style="margin-bottom:10px">' + (autoAsignado ?
      '<div class="row between"><div><div class="small muted">Auto asignado</div><b>' + esc(autoAsignado.patente) + '</b></div>' +
      '<div class="row"><button class="btn sec sm" onclick="carForm(\'' + autoAsignado.id + '\')">Ver</button><button class="btn sec sm" onclick="asignarAutoForm(\'' + d.id + '\')">Cambiar</button>' +
      (autoAsignado.tipo === 'alquiler' ? '<button class="btn danger sm" onclick="confirmDel(this,()=>quitarAutoDeChofer(\'' + d.id + '\',\'' + autoAsignado.id + '\'))">Quitar</button>' : '') + '</div></div>'
      : '<div class="row between"><span class="muted">Sin auto asignado</span><button class="btn sm" onclick="asignarAutoForm(\'' + d.id + '\')">Asignar auto</button></div>') +
    '</div>';
  }
  if (ex) {
    const portalUrl = d.portalToken ? location.origin + location.pathname + '#/portal/' + d.id + '/' + d.portalToken : '';
    h += '<div class="card" style="margin-bottom:10px"><div class="small muted" style="margin-bottom:6px">Portal del chofer <small>link de solo lectura, sin login</small></div>' +
    (portalUrl ? '<input readonly value="' + esc(portalUrl) + '" onclick="this.select()" style="margin-bottom:8px">' +
      '<div class="row"><button class="btn sec sm" onclick="copiarLinkPortal(\'' + esc(portalUrl) + '\')">Copiar</button>' +
      '<a class="btn sec sm" target="_blank" href="https://wa.me/?text=' + encodeURIComponent('Hola ' + (d.nombre || '').split(' ')[0] + ', acá podés ver tu estado de cuenta: ' + portalUrl) + '">WhatsApp</a>' +
      '<button class="btn sec sm" onclick="regenerarLinkPortal(\'' + d.id + '\')">Regenerar</button></div>'
      : '<button class="btn sec block" onclick="regenerarLinkPortal(\'' + d.id + '\')">Generar link del portal</button>') +
    '</div>';
  }

  /* ---- Datos ---- */
  let datos = '';
  datos += '<div class="row" style="align-items:center;gap:12px;margin-bottom:10px">' +
  '<img id="d_fotoPreview" src="' + esc(d.fotoPerfil || '') + '" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover;background:var(--soft);display:' + (d.fotoPerfil ? '' : 'none') + '">' +
  '<label class="btn sec sm filebtn">Foto de perfil<input id="fotoPerfilIn" type="file" accept="image/*" onchange="onFotoPerfil(this)"></label>' +
  '<input type="hidden" id="d_fotoPerfilData" value="' + esc(d.fotoPerfil || '') + '">' +
  '</div>' +
  '<label class="f"><span>Nombre y apellido</span><input id="d_nombre" value="' + esc(d.nombre) + '"></label>' +
  '<label class="chk"><input type="checkbox" id="d_prospecto" onchange="document.getElementById(\'etapaBox\').style.display=this.checked?\'\':\'none\'"' + (d.prospecto ? ' checked' : '') + '><span>Es un prospecto (todavía no firmó contrato)</span></label>' +
  '<div id="etapaBox" style="display:' + (d.prospecto ? '' : 'none') + '"><label class="f"><span>Etapa del embudo</span><select id="d_etapaProspecto">' + ETAPAS_PROSPECTO.map(x => '<option value="' + x[0] + '"' + (d.etapaProspecto === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label></div>' +
  '<label class="f"><span>Referido por</span><input id="d_referidoPor" value="' + esc(d.referidoPor) + '"></label>' +
  '<label class="f"><span>Canal de origen</span><select id="d_canalOrigen" onchange="document.getElementById(\'canalOrigenOtroBox\').style.display=this.value===\'otro\'?\'\':\'none\'"><option value="">Sin especificar</option>' + CANALES_PROSPECTO.map(x => '<option value="' + x[0] + '"' + (d.canalOrigen === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<div id="canalOrigenOtroBox" style="display:' + (d.canalOrigen === 'otro' ? '' : 'none') + '"><label class="f"><span>¿Cuál?</span><input id="d_canalOrigenOtro" value="' + esc(d.canalOrigenOtro) + '"></label></div>' +
  '<div class="two"><label class="f"><span>DNI</span><input id="d_dni" inputmode="numeric" value="' + esc(d.dni) + '"></label>' +
  '<label class="f"><span>Vence la licencia</span><input id="d_lic" type="date" value="' + esc(d.licVenc) + '"></label></div>' +
  '<label class="f"><span>Tipo de licencia</span><input id="d_tipoLicencia" placeholder="ej: B1, profesional..." value="' + esc(d.tipoLicencia) + '"></label>' +
  '<label class="f"><span>Vence el certificado de antecedentes</span><input id="d_antecedentesVenc" type="date" value="' + esc(d.antecedentesVenc) + '"></label>' +
  '<label class="f"><span>Teléfono <small>con código de país, ej: +5491155551234</small></span><input id="d_tel" type="tel" value="' + esc(d.tel) + '"></label>' +
  '<div class="two"><label class="f"><span>Fecha de nacimiento</span><input id="d_nac" type="date" value="' + esc(d.fechaNacimiento) + '"></label>' +
  '<label class="f"><span>Calificación</span><select id="d_rating"><option value="">Sin calificar</option>' + RATINGS.map(x => '<option value="' + x[0] + '"' + (d.rating === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label></div>' +
  '<div class="two"><label class="f"><span>Domicilio</span><input id="d_dom" value="' + esc(d.domicilio) + '"></label>' +
  '<label class="f"><span>Link de Google Maps <small>opcional</small></span><input id="d_domMaps" type="url" value="' + esc(d.domicilioMaps) + '"></label></div>' +
  '<div class="sec-t">Datos adicionales</div>' +
  '<div class="two"><label class="f"><span>Nacionalidad</span><input id="d_nacionalidad" value="' + esc(d.nacionalidad) + '"></label>' +
  '<label class="f"><span>Estado civil / familia</span><input id="d_estadoCivil" value="' + esc(d.estadoCivil) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Referencia personal <small>nombre</small></span><input id="d_refNombre" value="' + esc(d.referenciaNombre) + '"></label>' +
  '<label class="f"><span>Referencia personal <small>teléfono</small></span><input id="d_refTel" type="tel" value="' + esc(d.referenciaTel) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Nivel de estudios</span><input id="d_estudios" value="' + esc(d.nivelEstudios) + '"></label>' +
  '<label class="f"><span>Otros ingresos</span><input id="d_otrosIngresos" value="' + esc(d.otrosIngresos) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Ocupación anterior</span><input id="d_ocupacion" value="' + esc(d.ocupacionAnterior) + '"></label>' +
  '<label class="f"><span>Experiencia previa como chofer</span><input id="d_experiencia" value="' + esc(d.experienciaChofer) + '"></label></div>' +
  '<div class="sec-t">Contacto de emergencia</div><div class="two"><label class="f"><span>Nombre</span><input id="d_emerg_nombre" value="' + esc((d.contactoEmergencia || {}).nombre) + '"></label>' +
  '<label class="f"><span>Teléfono</span><input id="d_emerg_tel" type="tel" value="' + esc((d.contactoEmergencia || {}).tel) + '"></label></div>' +
  '<div class="sec-t">Teléfonos adicionales</div><div id="d_tels">' + (d.otrosTelefonos || []).map(telRow).join('') + '</div>' +
  '<button class="btn sec sm" style="margin-bottom:14px" onclick="addTelRow()">+ Agregar teléfono</button>' +
  '<div class="sec-t">Documentación entregada</div>' + DOCS.map(x => '<label class="chk"><input type="checkbox" id="dc_' + x[0] + '"' + (d.docs && d.docs[x[0]] ? ' checked' : '') + '><span>' + x[1] + '</span></label>').join('') +
  '<div class="sec-t">Checklist de onboarding</div>' + ONBOARDING_ITEMS.map(x => '<label class="chk"><input type="checkbox" id="ob_' + x[0] + '"' + (d.onboarding && d.onboarding[x[0]] ? ' checked' : '') + '><span>' + x[1] + '</span></label>').join('') +
  '<div class="sec-t">Archivos</div><div id="files"></div><div id="fstatus" class="small" style="margin:-4px 0 12px;overflow-wrap:anywhere"></div>' +
  '<label class="f" style="margin-top:14px"><span>Notas</span><textarea id="d_notas">' + esc(d.notas) + '</textarea></label>';

  /* ---- Financiación ---- */
  let financiacion = '';
  if (ex) {
    const cars = S.cars.filter(c => c.choferId === d.id); const debt = driverDebt(d.id); const score = driverScore(d.id);
    const mon = cars.some(c => c.tipo === 'financiado') ? moneyUSD : money;
    financiacion += '<div class="card"><div class="row between"><span class="muted">Autos</span><span>' + (cars.length ? cars.map(c => plate(c.patente)).join(' ') : 'Ninguno') + '</span></div>' +
    '<div class="row between"><span class="muted">Deuda</span><b style="color:' + (debt > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + mon(debt) + '</b></div>' +
    (score != null ? '<div class="row between"><span class="muted">Puntualidad</span><b>' + score + '%</b></div>' : '') +
    (!d.prospecto && driverEnRiesgo(d.id) ? '<div class="row between"><span class="muted">Riesgo</span>' + badge('bad', 'En riesgo por atrasos') + '</div>' : '') +
    (!d.prospecto && driverCalificaBono(d.id) ? '<div class="row between"><span class="muted">Bono</span>' + badge('ok', 'Califica por puntualidad') + '</div>' : '') +
    (() => { const m = metodoPreferidoChofer(d.id); return m ? '<div class="row between small"><span class="muted">Método de pago habitual</span><span>' + esc((METODOS_PAGO.find(x => x[0] === m) || [0, m])[1]) + '</span></div>' : ''; })() + '</div>';
  }
  financiacion += (ex ? (() => { const s = sugerirAptoFinanciar(d.id); return '<div class="small muted" style="margin-bottom:8px">Sugerido según puntualidad, antigüedad y sanciones: <b style="color:' + (s.cumple ? 'var(--ok)' : 'var(--muted)') + '">' + (s.cumple ? 'Calificaría' : 'Todavía no calificaría') + '</b></div>'; })() : '') +
  '<label class="chk"><input type="checkbox" id="d_apto"' + (d.aptoFinanciar ? ' checked' : '') + '><span>Apto para financiar un auto (decisión final)</span></label>' +
  '<label class="f"><span>Objetivo del depósito de garantía</span><input id="d_depositoObjetivo" inputmode="decimal" value="' + esc(d.depositoObjetivo || '') + '"></label>';
  if (ex) {
    const DEP = depositosDeChofer(d.id);
    const saldoDep = saldoDeposito(d.id);
    financiacion += '<div class="sec-t row between">Depósito de garantía<span class="small muted">' + money(saldoDep) + (d.depositoObjetivo ? ' de ' + money(d.depositoObjetivo) : '') + '</span></div>';
    if (DEP.length) financiacion += DEP.map(x => '<div class="card row"><div class="grow"><div>' + (x.monto >= 0 ? '+' + money(x.monto) : '-' + money(-x.monto)) + ' <span class="small muted">' + fdate(x.fecha) + '</span></div>' + (x.nota ? '<div class="small muted">' + esc(x.nota) + '</div>' : '') + '</div>' + (canDelete() ? '<button class="btn danger sm" onclick="confirmDel(this,()=>delDeposito(\'' + x.id + '\'))">Borrar</button>' : '') + '</div>').join('');
    financiacion += '<button class="btn sec block" style="margin:8px 0 20px" onclick="depositoForm(\'' + d.id + '\')">+ Registrar pago de depósito</button>';
    if (!d.inactivo && !d.prospecto) {
      financiacion += '<div class="sec-t">Baja del chofer</div><button class="btn danger block" style="margin-bottom:20px" onclick="liquidacionForm(\'' + d.id + '\')">Dar de baja / Liquidación final</button>';
    }
  }

  /* ---- Sanciones y multas ---- */
  let sanciones = '';
  if (ex) {
    const San = S.sanciones.filter(s => s.driverId === d.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    sanciones += '<div class="sec-t">Sanciones</div>';
    if (San.length) sanciones += San.map(s => '<div class="card row"><div class="grow"><div class="small muted">' + fdate(s.fecha) + '</div><div>' + esc(s.motivo) + '</div></div>' + (canDelete() ? '<button class="btn danger sm" onclick="confirmDel(this,()=>delSancion(\'' + s.id + '\'))">Borrar</button>' : '') + '</div>').join('');
    else sanciones += '<div class="small muted" style="margin-bottom:8px">Sin sanciones registradas.</div>';
    sanciones += '<button class="btn sec block" style="margin:8px 0 20px" onclick="sancionForm(\'' + d.id + '\')">+ Agregar sanción</button>';
    const M = multasDeChofer(d.id);
    sanciones += '<div class="sec-t">Multas</div>';
    const pts = puntosLicencia(d.id);
    if (pts) sanciones += '<div class="card row between small" style="margin-bottom:8px"><span class="muted">Puntos de licencia acumulados</span><b style="color:' + (pts >= settings.puntosLimite ? 'var(--bad)' : 'inherit') + '">' + pts + ' de ' + settings.puntosLimite + '</b></div>';
    if (M.length) {
      const estLabel = e => (MULTA_ESTADOS.find(x => x[0] === e) || [0, e])[1];
      sanciones += M.map(m => '<div class="card row tap" onclick="multaForm(\'' + m.carId + '\',\'' + m.id + '\')"><div class="grow"><div>' + money(m.monto) + (m.recargo ? ' <span class="small" style="color:var(--bad)">+' + money(m.recargo) + '</span>' : '') + ' <span class="small muted">' + fdate(m.fecha) + '</span></div><div class="small muted">' + plate((S.cars.find(x => x.id === m.carId) || {}).patente) + '</div></div>' + badge(estadoMultaCls(m.estado), estLabel(m.estado)) + '</div>').join('');
    } else sanciones += '<div class="small muted" style="margin-bottom:8px">Sin multas registradas.</div>';
  }

  /* ---- Historial ---- */
  let hist = '';
  if (ex) {
    const H = carHistoryForDriver(d.id);
    hist += '<div class="sec-t">Historial de autos</div>';
    if (H.length) hist += H.map(x => '<div class="row between small" style="padding:4px 0"><span>' + esc(x.patente || 'Auto eliminado') + '</span><span class="muted">' + fdate(x.desde) + ' – ' + (x.hasta ? fdate(x.hasta) : 'actual') + '</span></div>').join('');
    else hist += '<div class="small muted" style="margin-bottom:20px">Sin autos asignados todavía.</div>';
    const COM = (d.comunicaciones || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
    hist += '<div class="sec-t">Historial de comunicaciones</div>' +
    '<div class="two"><label class="f"><span>Tipo</span><select id="cm_tipo">' + COMUNICACION_TIPOS.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></label>' +
    '<label class="f"><span>Fecha</span><input id="cm_fecha" type="date" value="' + iso(today()) + '"></label></div>' +
    '<label class="f"><span>Notas</span><textarea id="cm_notas" placeholder="ej: llamó por atraso en el pago, dijo que paga el viernes"></textarea></label>' +
    '<button class="btn sec block" style="margin-bottom:14px" onclick="agregarComunicacion(\'' + d.id + '\')">Agregar</button>' +
    (COM.length ? COM.map(c => '<div class="card row"><div class="grow"><div>' + esc((COMUNICACION_TIPOS.find(x => x[0] === c.tipo) || [0, c.tipo])[1]) + '</div><div class="small muted">' + fdate(c.fecha) + (c.notas ? ' · ' + esc(c.notas) : '') + '</div></div><button class="btn danger sm" onclick="confirmDel(this,()=>borrarComunicacion(\'' + d.id + '\',\'' + c.id + '\'))">Borrar</button></div>').join('') : '<div class="small muted" style="margin-bottom:20px">Sin comunicaciones registradas.</div>');
  }

  const saveCancelRow = '<div class="row stickysave"><button class="btn grow" onclick="saveDriver(' + (ex ? "'" + d.id + "'" : 'null') + ')">Guardar</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>';
  const accionesRow = ex ? '<div class="row" style="margin-top:20px"><button class="btn sec grow" onclick="toggleInactivo(\'' + d.id + '\')">' + (d.inactivo ? 'Reactivar' : 'Marcar como inactivo') + '</button></div>' +
    (canDelete() ? '<div style="margin-top:8px"><button class="btn danger block" onclick="confirmDel(this,()=>delDriver(\'' + d.id + '\'))">Eliminar chofer</button></div>' : '') : '';

  if (ex) {
    h += '<div class="tabs" data-scope="chofer">' +
      '<button class="tab on" data-tab="datos" onclick="setTabChofer(\'datos\')">Datos</button>' +
      '<button class="tab" data-tab="financiacion" onclick="setTabChofer(\'financiacion\')">Financiación</button>' +
      '<button class="tab" data-tab="sanciones" onclick="setTabChofer(\'sanciones\')">Sanciones y multas</button>' +
      '<button class="tab" data-tab="hist" onclick="setTabChofer(\'hist\')">Historial</button>' +
    '</div>';
    h += saveCancelRow;
    h += tabpanelChofer('datos', true, datos);
    h += tabpanelChofer('financiacion', false, financiacion);
    h += tabpanelChofer('sanciones', false, sanciones);
    h += tabpanelChofer('hist', false, hist);
    h += accionesRow;
  } else {
    h += datos + financiacion + saveCancelRow;
  }
  openModal(h); renderFiles('drivers', ex ? ex.id : null);
}
export async function saveDriver(id) {
  const nombre = val('d_nombre');
  if (!nombre) { toast('Falta el nombre'); return; }
  const dni = val('d_dni');
  if (dni && S.drivers.some(x => x.id !== id && String(x.dni || '').trim() === dni)) { toast('Ya existe un chofer con ese DNI'); return; }
  const tel = val('d_tel');
  if (tel && !/^\+?[\d\s()-]{6,}$/.test(tel)) { toast('El teléfono no parece válido. Usá solo números, espacios, +, - o paréntesis'); return; }
  if (tel && S.drivers.some(x => x.id !== id && String(x.tel || '').trim() === tel)) { toast('Ya existe un chofer con ese teléfono'); return; }
  const docs = {}; DOCS.forEach(x => { docs[x[0]] = document.getElementById('dc_' + x[0]).checked; });
  const onboarding = {}; ONBOARDING_ITEMS.forEach(x => { onboarding[x[0]] = document.getElementById('ob_' + x[0]).checked; });
  const otrosTelefonos = [...document.querySelectorAll('.d-tel')].map(row => ({
    etiqueta: row.querySelector('.d-tel-etq').value.trim(), tel: row.querySelector('.d-tel-num').value.trim()
  })).filter(t => t.tel);
  const ex = S.drivers.find(x => x.id === id);
  const o = {
    id: id || uid(), nombre, dni: val('d_dni'), licVenc: val('d_lic'), tipoLicencia: val('d_tipoLicencia'), antecedentesVenc: val('d_antecedentesVenc'), tel: val('d_tel'), domicilio: val('d_dom'), notas: val('d_notas'), docs,
    fechaNacimiento: val('d_nac'), rating: val('d_rating'),
    domicilioMaps: val('d_domMaps'), nacionalidad: val('d_nacionalidad'), estadoCivil: val('d_estadoCivil'),
    referenciaNombre: val('d_refNombre'), referenciaTel: val('d_refTel'), nivelEstudios: val('d_estudios'),
    otrosIngresos: val('d_otrosIngresos'), ocupacionAnterior: val('d_ocupacion'), experienciaChofer: val('d_experiencia'),
    aptoFinanciar: document.getElementById('d_apto').checked, depositoObjetivo: +val('d_depositoObjetivo') || 0,
    contactoEmergencia: { nombre: val('d_emerg_nombre'), tel: val('d_emerg_tel') },
    otrosTelefonos, inactivo: (ex || {}).inactivo || false, favorito: (ex || {}).favorito || false, prospecto: document.getElementById('d_prospecto').checked,
    etapaProspecto: val('d_etapaProspecto'), referidoPor: val('d_referidoPor'), onboarding,
    canalOrigen: val('d_canalOrigen'), canalOrigenOtro: val('d_canalOrigenOtro'),
    fotoPerfil: val('d_fotoPerfilData'),
    files: (ex || {}).files || []
  };
  if (await save('drivers', o)) { closeModal(); toast('Chofer guardado'); }
}
export async function agregarComunicacion(id) {
  const d = S.drivers.find(x => x.id === id); if (!d) return;
  const notas = val('cm_notas');
  const comunicaciones = (d.comunicaciones || []).concat([{ id: uid(), tipo: val('cm_tipo'), fecha: val('cm_fecha') || iso(today()), notas }]);
  if (await save('drivers', Object.assign({}, d, { comunicaciones }))) { toast('Comunicación registrada'); driverForm(id); }
}
export async function borrarComunicacion(id, comId) {
  const d = S.drivers.find(x => x.id === id); if (!d) return;
  const comunicaciones = (d.comunicaciones || []).filter(c => c.id !== comId);
  if (await save('drivers', Object.assign({}, d, { comunicaciones }))) { toast('Borrado'); driverForm(id); }
}
export async function regenerarLinkPortal(id) {
  const d = S.drivers.find(x => x.id === id); if (!d) return;
  const token = uid() + uid();
  if (!(await save('drivers', Object.assign({}, d, { portalToken: token })))) return;
  toast('Link generado'); driverForm(id);
}
export async function copiarLinkPortal(url) {
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copiado');
  } catch (e) {
    toast('No se pudo copiar: seleccioná el texto y copialo a mano');
  }
}
export async function toggleFavoritoChofer(id) {
  const d = S.drivers.find(x => x.id === id); if (!d) return;
  await save('drivers', Object.assign({}, d, { favorito: !d.favorito }));
}
export async function toggleInactivo(id) {
  const d = S.drivers.find(x => x.id === id); if (!d) return;
  if (await save('drivers', Object.assign({}, d, { inactivo: !d.inactivo }))) { closeModal(); toast(d.inactivo ? 'Chofer reactivado' : 'Chofer marcado como inactivo'); }
}
export async function aprobarProspecto(id) {
  const d = S.drivers.find(x => x.id === id); if (!d) return;
  if (await save('drivers', Object.assign({}, d, { prospecto: false, etapaProspecto: 'aprobado' }))) { toast('Chofer dado de alta'); driverForm(id); }
}
export async function delDriver(id) {
  await purgeFiles(S.drivers.find(x => x.id === id));
  for (const c of S.cars.filter(c => c.choferId === id)) await save('cars', Object.assign({}, c, { choferId: '', tipo: 'disponible' }));
  if (await remove('drivers', id)) { closeModal(); toast('Chofer eliminado'); }
}
function conceptoRow(x) {
  x = x || {};
  return '<div class="two d-concepto"><input class="d-concepto-motivo" placeholder="Motivo (ej: daño en el paragolpes)" value="' + esc(x.motivo) + '">' +
  '<div class="row"><input class="d-concepto-monto grow" inputmode="decimal" placeholder="Monto a descontar" value="' + esc(x.monto || '') + '"><button class="btn danger sm" onclick="this.closest(\'.d-concepto\').remove()">✕</button></div></div>';
}
export function addConceptoRow() { $('#lq_conceptos').insertAdjacentHTML('beforeend', conceptoRow()); }
export function liquidacionForm(id) {
  const d = S.drivers.find(x => x.id === id); if (!d) return;
  const saldoDep = saldoDeposito(d.id);
  const deuda = driverDebt(d.id);
  const h = '<h3>Liquidación final — ' + esc(d.nombre) + '</h3>' +
  '<div class="card"><div class="row between"><span class="muted">Saldo de depósito</span><b>' + money(saldoDep) + '</b></div>' +
  '<div class="row between"><span class="muted">Deuda pendiente</span><b style="color:' + (deuda > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + money(deuda) + '</b></div></div>' +
  '<div class="sec-t">Descuentos adicionales <small>opcional, ej. daños</small></div><div id="lq_conceptos"></div>' +
  '<button class="btn sec sm" style="margin-bottom:14px" onclick="addConceptoRow()">+ Agregar descuento</button>' +
  '<div class="small muted" style="margin-bottom:14px">Al confirmar: se calcula el monto final a devolver, se descarga un comprobante en PDF, el chofer queda inactivo y el auto que tenía asignado (si tiene) vuelve a estar disponible.</div>' +
  '<div class="row"><button class="btn grow" onclick="confirmarLiquidacion(\'' + d.id + '\')">Confirmar liquidación</button><button class="btn sec" onclick="driverForm(\'' + d.id + '\')">Cancelar</button></div>';
  openModal(h);
}
async function comprobanteLiquidacion(d, r) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  let y = 18;
  doc.setFontSize(16); doc.text(settings.companyName || 'LD Rental', 12, y); y += 8;
  doc.setFontSize(11); doc.text('Liquidación final', 12, y); y += 10;
  doc.setFontSize(10);
  const linea = (label, val) => { doc.text(label, 12, y); doc.text(String(val), 70, y); y += 7; };
  linea('Chofer:', d.nombre || '—');
  linea('Fecha:', fdate(iso(today())));
  linea('Saldo de depósito:', money(r.saldoDep));
  linea('Deuda pendiente:', '-' + money(r.deuda));
  r.conceptos.forEach(c => linea((c.motivo || 'Descuento') + ':', '-' + money(c.monto)));
  y += 4;
  doc.setFontSize(13); doc.text('Monto a devolver: ' + money(r.montoFinal), 12, y);
  y += 14;
  doc.setFontSize(8); doc.setTextColor(140); doc.text('Comprobante generado por ' + (settings.companyName || 'LD Rental'), 12, y);
  doc.save('liquidacion-' + String(d.nombre || 'chofer').replace(/\s+/g, '-') + '-' + iso(today()) + '.pdf');
}
export async function confirmarLiquidacion(id) {
  const d = S.drivers.find(x => x.id === id); if (!d) return;
  const saldoDep = saldoDeposito(d.id);
  const deuda = driverDebt(d.id);
  const conceptos = [...document.querySelectorAll('.d-concepto')].map(row => ({
    motivo: row.querySelector('.d-concepto-motivo').value.trim(),
    monto: +row.querySelector('.d-concepto-monto').value || 0,
  })).filter(c => c.monto > 0);
  const totalDescuentos = conceptos.reduce((a, c) => a + c.monto, 0);
  const montoFinal = saldoDep - deuda - totalDescuentos;
  if (saldoDep) {
    if (!(await save('depositos', { id: uid(), driverId: id, fecha: iso(today()), monto: -saldoDep, nota: 'Liquidación final' }))) return;
  }
  for (const c of S.cars.filter(c => c.choferId === id)) {
    await save('cars', Object.assign({}, c, { choferId: '', tipo: 'disponible' }));
  }
  if (!(await save('drivers', Object.assign({}, d, { inactivo: true })))) return;
  await comprobanteLiquidacion(d, { saldoDep, deuda, conceptos, montoFinal });
  closeModal(); toast('Chofer dado de baja. Liquidación registrada.');
}
