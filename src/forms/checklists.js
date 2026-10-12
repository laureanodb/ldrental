// Checklists fijos por tipo de trabajo: al abrir una orden se cargan solas las
// tareas (service de 10.000 km, frenos, distribución…). Se editan en Ajustes del taller.
import { esc, uid } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { settings, saveSettings } from '../settings.js';

const DEFAULT = [
  { id: 'service10', nombre: 'Service de 10.000 km', tipo: 'preventivo', tareas: ['Cambiar aceite de motor', 'Cambiar filtro de aceite', 'Revisar filtro de aire', 'Revisar filtro de habitáculo', 'Revisar niveles (refrigerante, frenos, dirección, limpiaparabrisas)', 'Revisar presión y desgaste de cubiertas', 'Revisar luces', 'Revisar pastillas de freno', 'Anotar km en la ficha'] },
  { id: 'service20', nombre: 'Service de 20.000 km', tipo: 'preventivo', tareas: ['Cambiar aceite de motor', 'Cambiar filtro de aceite', 'Cambiar filtro de aire', 'Cambiar filtro de combustible', 'Cambiar filtro de habitáculo', 'Revisar bujías', 'Revisar correas', 'Rotar cubiertas', 'Revisar frenos y tren delantero', 'Anotar km en la ficha'] },
  { id: 'frenos', nombre: 'Frenos', tipo: 'correctivo', tareas: ['Medir pastillas delanteras', 'Medir pastillas traseras / cintas', 'Medir discos', 'Revisar líquido de frenos', 'Cambiar lo que esté gastado', 'Probar el auto'] },
  { id: 'distribucion', nombre: 'Distribución', tipo: 'preventivo', tareas: ['Cambiar correa de distribución', 'Cambiar tensor y rodillos', 'Revisar bomba de agua', 'Cambiar correa de accesorios', 'Revisar pérdidas', 'Probar el auto'] },
  { id: 'tren', nombre: 'Tren delantero', tipo: 'correctivo', tareas: ['Revisar extremos y rótulas', 'Revisar bujes', 'Revisar amortiguadores', 'Alinear y balancear', 'Probar el auto'] },
];
export function checklistsTrabajo() {
  const L = settings.checklistsTrabajo;
  return L && L.length ? L : DEFAULT;
}
export function opcionesChecklist() {
  return '<option value="">Sin checklist</option>' + checklistsTrabajo().map(k => '<option value="' + esc(k.id) + '">' + esc(k.nombre) + ' (' + k.tareas.length + ' tareas)</option>').join('');
}
export const checklistPorId = id => checklistsTrabajo().find(k => k.id === id) || null;
export const tareasDeChecklist = id => { const k = checklistPorId(id); return k ? k.tareas.map(texto => ({ id: uid(), texto, hecho: false })) : []; };
// Al elegir un checklist en la orden nueva, completa el título y el tipo si están vacíos.
export function onChecklistOT() {
  const k = checklistPorId((document.getElementById('ot_checklist') || {}).value);
  if (!k) return;
  const t = document.getElementById('ot_titulo'); if (t && !t.value.trim()) t.value = k.nombre;
  const tipo = document.getElementById('ot_tipo'); if (tipo) tipo.value = k.tipo || 'correctivo';
}

export function checklistsTrabajoView() {
  const L = checklistsTrabajo();
  openModal('<h3>Checklists por tipo de trabajo</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Al abrir una orden elegís uno y se cargan las tareas solas. Una tarea por renglón.</div>' +
    L.map((k, i) => '<div class="card"><div class="two"><label class="f"><span>Nombre</span><input class="ck_nombre" value="' + esc(k.nombre) + '"></label>' +
      '<label class="f"><span>Tipo</span><select class="ck_tipo"><option value="preventivo"' + (k.tipo === 'preventivo' ? ' selected' : '') + '>Preventivo</option><option value="correctivo"' + (k.tipo !== 'preventivo' ? ' selected' : '') + '>Arreglo</option></select></label></div>' +
      '<label class="f"><span>Tareas</span><textarea class="ck_tareas" rows="5">' + esc(k.tareas.join('\n')) + '</textarea></label>' +
      '<input type="hidden" class="ck_id" value="' + esc(k.id) + '"><button class="btn danger sm" onclick="this.closest(\'.card\').remove()">Quitar</button></div>').join('') +
    '<div id="ck_nuevos"></div>' +
    '<button class="btn sec block" style="margin-bottom:10px" onclick="agregarChecklistTrabajo()">+ Agregar otro</button>' +
    '<div class="row"><button class="btn grow" onclick="guardarChecklistsTrabajo()">Guardar</button><button class="btn sec" onclick="ordenesView()">Volver</button></div>');
}
export function agregarChecklistTrabajo() {
  document.getElementById('ck_nuevos').insertAdjacentHTML('beforeend', '<div class="card"><div class="two"><label class="f"><span>Nombre</span><input class="ck_nombre" placeholder="ej: Embrague"></label>' +
    '<label class="f"><span>Tipo</span><select class="ck_tipo"><option value="correctivo">Arreglo</option><option value="preventivo">Preventivo</option></select></label></div>' +
    '<label class="f"><span>Tareas</span><textarea class="ck_tareas" rows="5"></textarea></label><input type="hidden" class="ck_id" value="' + uid() + '"></div>');
}
export function guardarChecklistsTrabajo() {
  const L = [...document.querySelectorAll('#modal .card')].map(card => ({
    id: card.querySelector('.ck_id').value, nombre: card.querySelector('.ck_nombre').value.trim(), tipo: card.querySelector('.ck_tipo').value,
    tareas: card.querySelector('.ck_tareas').value.split('\n').map(x => x.trim()).filter(Boolean),
  })).filter(k => k.nombre && k.tareas.length);
  if (!L.length) { toast('Dejá al menos un checklist con nombre y tareas'); return; }
  saveSettings({ checklistsTrabajo: L });
  toast('Checklists guardados');
  window.ordenesView();
}
