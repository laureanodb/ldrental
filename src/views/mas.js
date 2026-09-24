import { ui } from '../state.js';
import { render } from '../nav.js';
import { isAdmin } from '../roles.js';
import { proveedoresView } from '../forms/proveedor.js';
import { recordatoriosView } from '../forms/recordatorio.js';
import { gastosGeneralesView } from '../forms/gastos-generales.js';
import { usuariosView } from '../forms/usuarios.js';
import { auditoriaView } from '../forms/auditoria.js';
import { mapaFlotaView } from '../forms/mapa.js';
import { viewMantenimiento } from './mantenimiento.js';
import { viewReportes } from './reportes.js';
import { viewMultas } from './multas.js';
import { viewSiniestros } from './siniestros.js';
import { ajustesCard, backupCard } from './shared.js';
import { googleCard } from './google-ui.js';

export function goMas(v) { ui.masView = v; render(); window.scrollTo(0, 0); }

function backBar(title) {
  return '<div class="row between" style="margin-bottom:6px"><button class="btn sec sm" onclick="goMas(\'\')">‹ Más</button><b>' + title + '</b><span style="width:1px"></span></div>';
}
function tarjeta(label, action) {
  return '<div class="card row between tap" onclick="' + action + '"><span>' + label + '</span><span class="muted">›</span></div>';
}
function grupo(titulo, items) {
  return '<div class="sec-t">' + titulo + '</div>' + items.map(([label, action]) => tarjeta(label, action)).join('');
}

export function viewMas() {
  const v = ui.masView;
  if (v === 'mantenimiento') return backBar('Mantenimiento') + viewMantenimiento();
  if (v === 'reportes') return backBar('Reportes') + viewReportes();
  if (v === 'multas') return backBar('Multas') + viewMultas();
  if (v === 'siniestros') return backBar('Siniestros') + viewSiniestros();
  if (v === 'ajustes') return backBar('Ajustes') + ajustesCard();
  if (v === 'backup') return backBar('Copia de seguridad') + backupCard();
  if (v === 'google') return backBar('Google') + googleCard();

  let h = '<h1>Más</h1>';
  h += grupo('Flota', [
    ['Mantenimiento', "goMas('mantenimiento')"],
    ['Multas', "goMas('multas')"],
    ['Siniestros', "goMas('siniestros')"],
    ['Gastos generales', 'gastosGeneralesView()'],
    ['Proveedores y talleres', 'proveedoresView()'],
    ['Mapa de flota', 'mapaFlotaView()'],
  ]);
  h += grupo('Análisis', [['Reportes', "goMas('reportes')"]]);
  h += grupo('Herramientas', [
    ['Recordatorios', 'recordatoriosView()'],
    ['Calculadora: financiar vs. alquilar', 'calculadoraForm()'],
  ]);
  const admin = [['Ajustes', "goMas('ajustes')"], ['Copia de seguridad', "goMas('backup')"], ['Google', "goMas('google')"]];
  if (isAdmin()) admin.push(['Usuarios y permisos', 'usuariosView()'], ['Auditoría', 'auditoriaView()']);
  h += grupo('Administración', admin);
  return h;
}
