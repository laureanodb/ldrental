import { S, ui } from '../state.js';
import { esc } from '../utils.js';
import { render } from '../nav.js';
import { isAdmin, canVerFinanzas } from '../roles.js';
import { proveedoresView } from '../forms/proveedor.js';
import { recordatoriosView } from '../forms/recordatorio.js';
import { gastosGeneralesView } from '../forms/gastos-generales.js';
import { usuariosView } from '../forms/usuarios.js';
import { auditoriaView } from '../forms/auditoria.js';
import { mapaFlotaView } from '../forms/mapa.js';
import { compararAutosForm } from '../forms/comparar.js';
import { reportePersonalizadoForm } from '../forms/reporte-personalizado.js';
import { viewMantenimiento } from './mantenimiento.js';
import { viewReportes } from './reportes.js';
import { viewMultas } from './multas.js';
import { viewSiniestros } from './siniestros.js';
import { viewStock } from './stock.js';
import { cantidadPendientes } from '../forms/control.js';
import { viewTablero } from './tablero.js';
import { ajustesCard, backupCard, saludDatosCard } from './shared.js';
import { googleCard } from './google-ui.js';
import { featureOculta } from '../settings.js';
import { viewCruce } from '../forms/cruce.js';

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
  if (v === 'stock') return backBar('Pañol') + viewStock();
  if (v === 'tablero') return backBar('Tablero semanal') + viewTablero();
  if (v === 'ajustes') return backBar('Ajustes') + ajustesCard();
  if (v === 'backup') return backBar('Copia de seguridad') + backupCard();
  if (v === 'saluddatos') return backBar('Salud de los datos') + saludDatosCard();
  if (v === 'google') return backBar('Google') + googleCard();
  if (v === 'cruce' && canVerFinanzas()) return backBar('Cruce con Mercado Pago / banco') + viewCruce();

  let h = '<h1>Más</h1>';
  h += grupo('Flota', [
    ['Mantenimiento', "goMas('mantenimiento')"],
    ['Órdenes de trabajo del taller', 'ordenesView()'],
    ['Multas', "goMas('multas')"],
    ['Siniestros', "goMas('siniestros')"],
    ['Pañol (repuestos, insumos y herramientas)', "goMas('stock')"],
    ['Gastos generales', 'gastosGeneralesView()'],
    ['Proveedores y talleres', 'proveedoresView()'],
    ['Mapa de flota', 'mapaFlotaView()'],
    ['Valores de mercado', 'valoresMercadoView()'],
    ['Mantenimiento preventivo en lote', 'mantenimientoLoteForm()'],
  ]);
  if (canVerFinanzas()) h += grupo('Cobros', [['Cruzar con el resumen de Mercado Pago o del banco', "goMas('cruce')"]]);
  h += grupo('Análisis', [['Tablero semanal por auto', "goMas('tablero')"], ['Reportes', "goMas('reportes')"], ['Reporte personalizado', 'reportePersonalizadoForm()'], ['Metas de la flota', 'metasForm()']]);
  h += grupo('Herramientas', [
    ['Recordatorios', 'recordatoriosView()'],
    ['Simulador de financiación', 'simuladorFinanciacionForm()'],
    ['Calculadora: financiar vs. alquilar', 'calculadoraForm()'],
    ['Calculadora: ROI antes de comprar', 'roiAutoForm()'],
    ['Simular un aumento general de la flota', 'escenarioFlotaForm()'],
    ['Comparar autos', 'compararAutosForm()'],
    ['Protocolo de emergencia', 'protocoloEmergenciaForm()'],
    ['Novedades de la app', 'mostrarNovedades()'],
  ]);
  if (isAdmin() && !featureOculta('desafios')) h += grupo('Motivación', [['Desafío del mes', 'desafioMesForm()']]);
  if (isAdmin()) h += grupo('Comunicación', [['Tablón de anuncios (portal del chofer)', 'anunciosForm()']]);
  const admin = [['Ajustes', "goMas('ajustes')"], ['Copia de seguridad', "goMas('backup')"], ['Google', "goMas('google')"], ['Salud de los datos', "goMas('saluddatos')"]];
  if (canVerFinanzas() && !featureOculta('autoseguro')) admin.push(['Fondo de autoseguro', 'autoseguroForm()']);
  if (isAdmin()) admin.push(['Usuarios y permisos', 'usuariosView()'], ['Auditoría', 'auditoriaView()'], ['Bitácora de decisiones', 'bitacoraView()']);
  const nPend = cantidadPendientes();
  if (isAdmin() || nPend) admin.unshift(['Gastos para aprobar' + (nPend ? ' (' + nPend + ')' : ''), 'aprobacionesView()']);
  h += grupo('Administración', admin);
  h += grupo('Cuenta', [['Cerrar sesión (' + esc(S.user && S.user.email || '') + ')', 'logout()']]);
  const ver = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '';
  h += '<div class="small muted" style="text-align:center;margin:18px 0 6px">' + (ver ? 'Versión del ' + esc(ver.slice(8, 10) + '/' + ver.slice(5, 7) + ' ' + ver.slice(11)) + ' · ' : '') + '<a class="tap" style="text-decoration:underline" onclick="buscarActualizacion()">Buscar actualización</a></div>';
  return h;
}
