// Bienvenida al asignar un auto: mensaje de WhatsApp armado con el link del portal,
// el monto y el día de cobro, el teléfono de emergencia y tus reglas. El texto base se
// edita una vez (Más → Mensaje de bienvenida) y se completa solo para cada chofer.
import { esc, uid, iso, today, parse, money, moneyUSD } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de } from '../memo.js';
import { settings, saveSettings } from '../settings.js';
import { waLink } from './choferes-extra.js';
import { esMensual, montoMensual } from '../financiados.js';

const DIAS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
export const TEXTO_BIENVENIDA = 'Hola {nombre}, ¡bienvenido a {empresa}! Ya tenés asignado el {auto} patente {patente}.\n\n' +
  '• Pagás {monto} por {periodo}, los {dia}.\n• En tu portal ves lo que debés, tus pagos, los papeles del auto y los avisos: {portal}\n• Emergencias: {emergencia}\n\n{reglas}\n\nCualquier duda, escribinos por acá.';
const texto = () => settings.bienvenidaTexto || TEXTO_BIENVENIDA;
const linkPortal = d => (d.portalToken ? location.origin + location.pathname + '#/portal/' + d.id + '/' + d.portalToken : '');

export function armarBienvenida(d, c) {
  const fin = c.tipo === 'financiado', mensual = esMensual(c);
  const monto = fin ? moneyUSD(mensual ? montoMensual(c) : c.monto) : money(c.monto);
  const dia = c.inicio ? (mensual ? 'días ' + parse(c.inicio).getDate() + ' de cada mes' : DIAS[parse(c.inicio).getDay()]) : 'días que acordamos';
  const rep = {
    nombre: String(d.nombre || '').split(' ')[0], empresa: settings.companyName || 'LD Rental',
    auto: [c.marca, c.modelo].filter(Boolean).join(' ') || 'auto', patente: c.patente || '',
    monto, periodo: mensual ? 'mes' : 'semana', dia, portal: linkPortal(d) || '(te lo mandamos aparte)',
    emergencia: settings.telefonoEmergencia || settings.companyPhone || '(te lo pasamos aparte)', reglas: (settings.bienvenidaReglas || '').trim(),
  };
  return texto().replace(/\{(\w+)\}/g, (m, k) => (k in rep ? rep[k] : m)).replace(/\n{3,}/g, '\n\n').trim();
}

// Se abre después de asignar un auto. Si el chofer no tiene link del portal, lo genera.
export async function bienvenidaForm(carId, volver) {
  const c = de('cars', 'id', carId)[0]; if (!c || !c.choferId) return;
  let d = de('drivers', 'id', c.choferId)[0]; if (!d) return;
  if (!d.portalToken) {
    const nuevo = Object.assign({}, d, { portalToken: uid() + uid() });
    if (await save('drivers', nuevo)) d = nuevo;
  }
  const msg = armarBienvenida(d, c);
  const ya = d.bienvenidaEnviada && d.bienvenidaEnviada.carId === c.id;
  openModal('<h3>Bienvenida para ' + esc(d.nombre) + '</h3>' +
    '<div class="small muted" style="margin-bottom:8px">Revisá el mensaje, cambiá lo que quieras y mandalo por WhatsApp.' + (ya ? ' Ya se lo mandaste el ' + esc(d.bienvenidaEnviada.fecha.split('-').reverse().join('/')) + '.' : '') + '</div>' +
    '<textarea id="bv_texto" rows="12">' + esc(msg) + '</textarea>' +
    (d.tel ? '' : '<div class="small" style="color:var(--warn);margin-top:6px">Este chofer no tiene teléfono cargado: copiá el mensaje y mandáselo por donde puedas.</div>') +
    '<div class="row" style="margin-top:10px">' + (d.tel ? '<button class="btn grow" onclick="enviarBienvenida(\'' + c.id + '\',\'' + esc(volver || '') + '\')">Abrir WhatsApp</button>' : '<button class="btn grow" onclick="copiarBienvenida()">Copiar</button>') +
    '<button class="btn sec" onclick="' + (volver === 'chofer' ? "driverForm('" + d.id + "')" : "carForm('" + c.id + "')") + '">Ahora no</button></div>' +
    '<button class="btn sec sm block" style="margin-top:8px" onclick="bienvenidaConfigForm()">Cambiar el texto base</button>');
}
export async function enviarBienvenida(carId, volver) {
  const c = de('cars', 'id', carId)[0], d = c && de('drivers', 'id', c.choferId)[0]; if (!d) return;
  const t = (document.getElementById('bv_texto') || {}).value || armarBienvenida(d, c);
  window.open(waLink(d.tel, t), '_blank', 'noopener');
  await save('drivers', Object.assign({}, d, { bienvenidaEnviada: { carId, fecha: iso(today()) } }));
  toast('Bienvenida anotada como enviada');
  if (volver === 'chofer') window.driverForm(d.id); else window.carForm(carId);
}
export async function copiarBienvenida() {
  const t = (document.getElementById('bv_texto') || {}).value || '';
  try { await navigator.clipboard.writeText(t); toast('Copiado'); } catch (e) { const el = document.getElementById('bv_texto'); if (el) { el.focus(); el.select(); } toast('Seleccionado: copialo'); }
}

export function bienvenidaConfigForm() {
  openModal('<h3>Mensaje de bienvenida</h3>' +
    '<div class="small muted" style="margin-bottom:8px">Se completa solo para cada chofer. Podés usar: {nombre} {empresa} {auto} {patente} {monto} {periodo} {dia} {portal} {emergencia} {reglas}.</div>' +
    '<label class="f"><span>Texto</span><textarea id="bv_base" rows="10">' + esc(texto()) + '</textarea></label>' +
    '<label class="f"><span>Tus reglas <small>van donde dice {reglas}</small></span><textarea id="bv_reglas" rows="5" placeholder="Ej: No se fuma en el auto. El auto no se presta. Avisá cualquier ruido o luz en el tablero.">' + esc(settings.bienvenidaReglas || '') + '</textarea></label>' +
    '<div class="row"><button class="btn grow" onclick="guardarBienvenidaConfig()">Guardar</button><button class="btn sec" onclick="volverTextoBienvenida()">Volver al texto original</button></div>' +
    '<button class="btn sec block" style="margin-top:8px" onclick="closeModal()">Cerrar</button>');
}
export function guardarBienvenidaConfig() {
  const base = (document.getElementById('bv_base') || {}).value || '';
  saveSettings({ bienvenidaTexto: base.trim() === TEXTO_BIENVENIDA ? '' : base, bienvenidaReglas: (document.getElementById('bv_reglas') || {}).value || '' });
  toast('Mensaje de bienvenida guardado'); closeModalSafe();
}
export function volverTextoBienvenida() {
  const el = document.getElementById('bv_base'); if (el) el.value = TEXTO_BIENVENIDA;
}
const closeModalSafe = () => { if (window.closeModal) window.closeModal(); };
