// Mensajes por WhatsApp armados por la app (sin bot): mensajes programados para
// una fecha, saber si el chofer abrió el portal después de mandarle el link y
// agradecerle cuando avisa un problema a tiempo.
import { S } from '../state.js';
import { esc, val, uid, iso, today, fdate, parse, days } from '../utils.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de } from '../memo.js';
import { settings, saveSettings } from '../settings.js';
import { isContract, calc } from '../calc.js';
import { isSnoozed } from '../snooze.js';
import { waLink } from './choferes-extra.js';

const choferDe = id => de('drivers', 'id', id)[0];
const primerNombre = d => String((d && d.nombre) || '').split(' ')[0];
const empresa = () => settings.companyName || 'LD Rental';

/* ---------- ¿Abrió el portal? ---------- */
const haceCuanto = isoStr => {
  const min = Math.round((Date.now() - Date.parse(isoStr)) / 60000);
  if (min < 60) return 'hace ' + Math.max(1, min) + ' min';
  const h = Math.round(min / 60); if (h < 24) return 'hace ' + h + ' h';
  const d = Math.round(h / 24); return 'hace ' + d + (d === 1 ? ' día' : ' días');
};
export function estadoPortalVisto(d) {
  const visto = d.portalVisto, enviado = d.portalLinkEnviado;
  if (enviado && (!visto || visto < enviado)) return '<div class="small" style="color:var(--warn);margin-top:6px">Le mandaste el link ' + haceCuanto(enviado) + ' y todavía no lo abrió.</div>';
  if (visto) return '<div class="small muted" style="margin-top:6px">Abrió el portal ' + haceCuanto(visto) + (d.portalVisitas ? ' · ' + d.portalVisitas + (d.portalVisitas === 1 ? ' vez' : ' veces') + ' en total' : '') + '.</div>';
  return '<div class="small muted" style="margin-top:6px">Todavía no abrió el portal.</div>';
}
export async function marcarLinkEnviado(id) {
  const d = choferDe(id); if (!d) return;
  await save('drivers', Object.assign({}, d, { portalLinkEnviado: new Date().toISOString() }));
}

/* ---------- Agradecer un aviso a tiempo ---------- */
export function textoAgradecimiento(d, que) {
  return '¡Gracias por avisar' + (que ? ' lo de ' + que : '') + ', ' + primerNombre(d) + '! Avisar a tiempo nos ayuda a arreglarlo antes de que sea peor. — ' + empresa();
}
export function botonAgradecer(c, o) {
  const d = choferDe(c.choferId);
  if (!d || !d.tel || o.origen !== 'portal') return '';
  if (o.agradecido) return '<div class="small muted" style="margin-top:4px">✓ Le agradeciste el aviso el ' + fdate(o.agradecido) + '.</div>';
  return '<a class="btn sec sm" style="margin-top:6px" target="_blank" rel="noopener" href="' + waLink(d.tel, textoAgradecimiento(d, (o.titulo || '').toLowerCase())) + '" onclick="marcarAgradecido(\'' + c.id + '\',\'' + o.id + '\')">Agradecerle el aviso por WhatsApp</a>';
}
export async function marcarAgradecido(carId, otId) {
  const c = de('cars', 'id', carId)[0]; if (!c) return;
  await save('cars', Object.assign({}, c, { ordenes: (c.ordenes || []).map(o => (o.id === otId ? Object.assign({}, o, { agradecido: iso(today()) }) : o)) }));
}

/* ---------- Mensajes programados ---------- */
export const DESTINOS = [['todos', 'Todos los choferes activos'], ['alquiler', 'Solo los de alquiler'], ['financiado', 'Solo los financiados'], ['deudores', 'Los que deben plata']];
function destinatarios(m) {
  return S.drivers.filter(d => !d.inactivo && !d.prospecto && d.tel).filter(d => {
    const autos = de('cars', 'choferId', d.id).filter(c => c.choferId === d.id && !c.vendido && isContract(c));
    if (!autos.length) return false;
    if (m.destino === 'alquiler') return autos.some(c => c.tipo === 'alquiler');
    if (m.destino === 'financiado') return autos.some(c => c.tipo === 'financiado');
    if (m.destino === 'deudores') return autos.some(c => calc(c).debt > 0);
    return true;
  });
}
const personalizar = (texto, d) => String(texto || '').replace(/\{nombre\}/gi, primerNombre(d)).replace(/\{empresa\}/gi, empresa());
const lista = () => settings.mensajesProgramados || [];
async function guardarLista(L) { saveSettings({ mensajesProgramados: L }); }

export function mensajesProgramadosView() {
  const L = lista().slice().sort((a, b) => String(a.fecha).localeCompare(b.fecha));
  const hoy = iso(today());
  const pend = L.filter(m => !m.cerrado), viejos = L.filter(m => m.cerrado).slice(-10).reverse();
  const fila = m => {
    const dest = destinatarios(m), enviados = Object.keys(m.enviados || {}).length;
    const toca = m.fecha <= hoy;
    return '<div class="card"><div class="row between"><b>' + fdate(m.fecha) + '</b><span class="small" style="color:' + (m.cerrado ? 'var(--ok)' : toca ? 'var(--warn)' : 'var(--muted)') + '">' + (m.cerrado ? 'Enviado' : toca ? 'Para mandar' : 'Programado') + '</span></div>' +
      '<div class="small muted">' + esc((DESTINOS.find(x => x[0] === m.destino) || [0, ''])[1]) + ' · ' + enviados + ' de ' + dest.length + ' enviados</div>' +
      '<div style="white-space:pre-wrap;margin-top:4px">' + esc(m.texto) + '</div>' +
      '<div class="row" style="margin-top:8px">' + (!m.cerrado ? '<button class="btn sm grow" onclick="enviarMensajeProgramado(\'' + m.id + '\')">' + (toca ? 'Mandar ahora' : 'Mandar antes') + '</button>' : '') +
      '<button class="btn danger sm" onclick="confirmDel(this,()=>borrarMensajeProgramado(\'' + m.id + '\'))">Borrar</button></div></div>';
  };
  openModal('<h3>Mensajes programados</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Dejá escrito un mensaje para un día (un aumento, un feriado, un aviso). Ese día te aparece en Vencimientos y lo mandás por WhatsApp a cada chofer con un toque, ya con su nombre.</div>' +
    (pend.length ? pend.map(fila).join('') : '<div class="small muted" style="margin-bottom:10px">No hay mensajes programados.</div>') +
    '<div class="sec-t">Nuevo mensaje</div>' +
    '<div class="two"><label class="f"><span>Día</span><input id="mp_fecha" type="date" value="' + hoy + '"></label>' +
    '<label class="f"><span>Para</span><select id="mp_destino">' + DESTINOS.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></label></div>' +
    '<label class="f"><span>Mensaje <small>{nombre} se reemplaza por el nombre de cada chofer</small></span><textarea id="mp_texto" rows="4" placeholder="Hola {nombre}, te recordamos que el lunes es feriado y la oficina está cerrada."></textarea></label>' +
    '<button class="btn block" onclick="guardarMensajeProgramado()">Programar</button>' +
    (viejos.length ? '<div class="sec-t">Ya enviados</div>' + viejos.map(fila).join('') : '') +
    '<button class="btn sec block" style="margin-top:10px" onclick="closeModal()">Cerrar</button>');
}
export async function guardarMensajeProgramado() {
  const texto = val('mp_texto'), fecha = val('mp_fecha');
  if (!texto) { toast('Escribí el mensaje'); return; }
  if (!fecha) { toast('Elegí el día'); return; }
  await guardarLista(lista().concat([{ id: uid(), fecha, texto, destino: val('mp_destino'), creado: iso(today()), enviados: {} }]));
  toast('Mensaje programado para el ' + fdate(fecha)); mensajesProgramadosView();
}
export async function borrarMensajeProgramado(id) {
  await guardarLista(lista().filter(m => m.id !== id)); toast('Borrado'); mensajesProgramadosView();
}
export function enviarMensajeProgramado(id) {
  const m = lista().find(x => x.id === id); if (!m) return;
  const dest = destinatarios(m);
  openModal('<h3>Mandar mensaje del ' + fdate(m.fecha) + '</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Tocá cada chofer: se abre WhatsApp con el mensaje listo y queda marcado como enviado.</div>' +
    (dest.length ? dest.map(d => {
      const env = (m.enviados || {})[d.id];
      return '<div class="card row between"><span>' + esc(d.nombre) + '</span>' + (env ? '<span class="small" style="color:var(--ok)">✓ Enviado</span>' : '<a class="btn sm" target="_blank" rel="noopener" href="' + waLink(d.tel, personalizar(m.texto, d)) + '" onclick="marcarMensajeEnviado(\'' + m.id + '\',\'' + d.id + '\')">WhatsApp</a>') + '</div>';
    }).join('') : '<div class="small muted">No hay choferes con teléfono para este grupo.</div>') +
    '<div class="row" style="margin-top:10px"><button class="btn grow" onclick="cerrarMensajeProgramado(\'' + m.id + '\')">Listo, ya lo mandé</button><button class="btn sec" onclick="mensajesProgramadosView()">Volver</button></div>');
}
export async function marcarMensajeEnviado(id, driverId) {
  await guardarLista(lista().map(m => (m.id === id ? Object.assign({}, m, { enviados: Object.assign({}, m.enviados || {}, { [driverId]: iso(today()) }) }) : m)));
  setTimeout(() => enviarMensajeProgramado(id), 300);
}
export async function cerrarMensajeProgramado(id) {
  await guardarLista(lista().map(m => (m.id === id ? Object.assign({}, m, { cerrado: iso(today()) }) : m)));
  closeModal(); toast('Mensaje marcado como enviado');
}
export function alertasMensajes() {
  const hoy = iso(today());
  return lista().filter(m => !m.cerrado && m.fecha <= hoy && !isSnoozed('mensaje:' + m.id)).map(m => ({
    who: 'Mensaje programado', sub: 'Para mandar por WhatsApp', kind: 'sistema', id: m.id, key: 'mensaje:' + m.id, d: Math.min(0, days(today(), parse(m.fecha))), cls: 'warn',
    t: m.texto.slice(0, 50) + (m.texto.length > 50 ? '…' : ''), accion: "enviarMensajeProgramado('" + m.id + "')",
  }));
}
