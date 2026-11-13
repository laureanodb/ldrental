// Guías para el chofer: textos tuyos que el chofer ve en su portal (qué hacer en un
// choque, cómo cuidar el auto, cómo cargar GNC). Se editan acá y se guardan en los ajustes
// compartidos; el portal las recibe junto con los anuncios.
import { esc, uid } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { settings, saveSettings } from '../settings.js';

export const MODELOS_GUIA = [
  { titulo: 'Si tenés un choque', texto: '1. Pará en un lugar seguro y poné las balizas.\n2. Si hay heridos, llamá al 107 (SAME) o al 911.\n3. Sacá fotos de los dos autos, las patentes, el lugar y los papeles del otro conductor (registro, cédula y seguro).\n4. No firmes nada ni aceptes culpas.\n5. Avisanos enseguida al teléfono de emergencia.\n6. Tenés 72 horas para hacer la denuncia en el seguro: te ayudamos.' },
  { titulo: 'Cuidado del auto', texto: '• Revisá el aceite y el agua una vez por semana.\n• Si se prende una luz en el tablero, sacale foto y avisanos.\n• Presión de las cubiertas: una vez por semana, con las cubiertas frías.\n• No andes con el tanque en reserva.\n• Lavalo al menos cada 15 días.' },
  { titulo: 'Cómo cargar GNC', texto: '• Apagá el motor y bajate del auto mientras cargan.\n• No fumes ni uses el celular cerca del surtidor.\n• Arrancá siempre con nafta y pasá a GNC andando.\n• Si sentís olor a gas, pará, apagá y avisanos.\n• La oblea y la prueba hidráulica tienen vencimiento: te avisamos cuando toca.' },
];
const guias = () => settings.guiasChofer || [];

export function guiasView() {
  const G = guias();
  let h = '<h3>Guías para el chofer</h3>' +
    '<div class="small muted" style="margin-bottom:10px">El chofer las ve en su portal, debajo del protocolo de emergencia. Escribilas con tus palabras.</div>';
  h += G.length ? G.map((g, i) => '<div class="card"><label class="f"><span>Título</span><input class="gu_titulo" value="' + esc(g.titulo) + '"></label>' +
    '<label class="f"><span>Texto</span><textarea class="gu_texto" rows="6">' + esc(g.texto) + '</textarea></label>' +
    '<input type="hidden" class="gu_id" value="' + esc(g.id) + '"><button class="btn danger sm" onclick="this.closest(\'.card\').remove()">Quitar</button></div>').join('')
    : '<div class="card muted">Todavía no hay guías. Empezá con un modelo y adaptalo.</div>';
  h += '<div id="gu_nuevas"></div>' +
    '<div class="sec-t">Agregar</div><div class="row" style="flex-wrap:wrap;gap:8px">' + MODELOS_GUIA.map((m, i) => '<button class="btn sec sm" onclick="agregarGuia(' + i + ')">' + esc(m.titulo) + '</button>').join('') +
    '<button class="btn sec sm" onclick="agregarGuia(-1)">En blanco</button></div>' +
    '<div class="row" style="margin-top:12px"><button class="btn grow" onclick="guardarGuias()">Guardar</button><button class="btn sec" onclick="closeModal()">Cerrar</button></div>' +
    '<div class="small muted" style="margin-top:8px">Para que el portal las muestre, tiene que estar pegada la versión nueva de portal-chofer en Supabase.</div>';
  openModal(h);
}
export function agregarGuia(i) {
  const m = MODELOS_GUIA[i] || { titulo: '', texto: '' };
  document.getElementById('gu_nuevas').insertAdjacentHTML('beforeend', '<div class="card"><label class="f"><span>Título</span><input class="gu_titulo" value="' + esc(m.titulo) + '"></label>' +
    '<label class="f"><span>Texto</span><textarea class="gu_texto" rows="6">' + esc(m.texto) + '</textarea></label><input type="hidden" class="gu_id" value="' + uid() + '">' +
    '<button class="btn danger sm" onclick="this.closest(\'.card\').remove()">Quitar</button></div>');
}
export function guardarGuias() {
  const L = [...document.querySelectorAll('#modal .card')].filter(c => c.querySelector('.gu_titulo')).map(c => ({
    id: c.querySelector('.gu_id').value, titulo: c.querySelector('.gu_titulo').value.trim(), texto: c.querySelector('.gu_texto').value.trim(),
  })).filter(g => g.titulo && g.texto).slice(0, 20);
  saveSettings({ guiasChofer: L });
  toast(L.length ? 'Guías guardadas' : 'Sin guías'); guiasView();
}
