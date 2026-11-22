import { S, ui } from '../state.js';
import { esc } from '../utils.js';
import { render } from '../nav.js';
import { isAdmin, canVerFinanzas, puedeVer } from '../roles.js';
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
import { TAMANOS_LETRA, tamanoLetra } from '../preferencias.js';

const SECCION_DE_VISTA = { mantenimiento: 'mantenimiento', multas: 'multas', siniestros: 'siniestros', stock: 'stock', reportes: 'reportes', tablero: 'reportes', cruce: 'cobros' };
export function goMas(v) {
  if (SECCION_DE_VISTA[v] && !puedeVer(SECCION_DE_VISTA[v])) { window.toast('Tu usuario no tiene esta sección', 'error'); return; }
  ui.masView = v; render(); window.scrollTo(0, 0);
}

function backBar(title) {
  return '<div class="row between" style="margin-bottom:6px"><button class="btn sec sm" onclick="goMas(\'\')">‹ Más</button><b>' + title + '</b><span style="width:1px"></span></div>';
}
function tarjeta(label, action) {
  return '<div class="card row between tap" onclick="' + action + '"><span>' + label + '</span><span class="muted">›</span></div>';
}
function grupo(titulo, items) {
  // Un tercer dato en el ítem es la sección: si el rol no la ve, no aparece.
  items = items.filter(x => !x[2] || puedeVer(x[2]));
  if (!items.length) return '';
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
    ['Datos que faltan cargar (ficha completa)', 'datosFaltantesView()'],
    ['Ficha técnica por modelo', 'fichasModeloView()'],
    ['Mantenimiento', "goMas('mantenimiento')", 'mantenimiento'],
    ['Órdenes de trabajo del taller', 'ordenesView()', 'mantenimiento'],
    ['Multas', "goMas('multas')", 'multas'],
    ['Deuda de patente (AGIP, ARBA, municipio)', 'consultaPatenteView()', 'multas'],
    ['Siniestros', "goMas('siniestros')", 'siniestros'],
    ['Pañol (repuestos, insumos y herramientas)', "goMas('stock')", 'stock'],
    ['Gastos generales', 'gastosGeneralesView()', 'gastos'],
    ['Proveedores y talleres', 'proveedoresView()', 'gastos'],
    ['Mapa de flota', 'mapaFlotaView()'],
    ['GPS de la flota (zonas, batería, velocidad)', 'gpsView()'],
    ['Valores de mercado', 'valoresMercadoView()', 'compras'],
    ['Autos para comprar (checklist de revisión)', 'candidatosCompraView()', 'compras'],
    ['Cuándo conviene comprar otro auto', 'calendarioComprasView()', 'compras'],
    ['Cómo salió cada compra (por vendedor)', 'comprasPorVendedorView()', 'compras'],
    ['Mantenimiento preventivo en lote', 'mantenimientoLoteForm()', 'mantenimiento'],
  ]);
  if (canVerFinanzas() && puedeVer('cobros')) h += grupo('Cobros', [['Cruzar con el resumen de Mercado Pago o del banco', "goMas('cruce')"], ['Corregir montos cargados sin los ceros', 'corregirMontosView()'], ['Exportación para el contador (mensual)', 'contadorForm()']].concat(isAdmin() ? [['Facturación electrónica (ARCA)', 'arcaForm()']] : []).concat(isAdmin() ? [['Cierre de mes', 'cierreMesView()']] : []));
  h += grupo('Plata del negocio', [['Caja chica del equipo', 'cajaChicaView(\'\')', 'cajachica']].concat(canVerFinanzas() ? [['Patrimonio de la empresa', 'patrimonioView()']] : []));
  h += grupo('Análisis', [['Cobranza de la semana (meta)', 'metaSemanalView()', 'reportes'], ['Pantalla para la oficina (TV)', 'pantallaOficina()', 'reportes'], ['Chequeo trimestral del negocio (IA)', 'chequeoView()', 'reportes'], ['Cuánto tardás en resolver cada cosa', 'tiemposRespuestaView()', 'reportes'], ['Km de la flota por semana', 'kmFlotaView()', 'reportes'], ['Services hechos a tiempo', 'servicesATiempoView()', 'reportes'], ['Cuánto duran los choferes (edad y experiencia)', 'duracionChoferesView()', 'reportes'], ['Tablero semanal por auto', "goMas('tablero')", 'reportes'], ['Reportes', "goMas('reportes')", 'reportes'], ['Reporte personalizado', 'reportePersonalizadoForm()', 'reportes'], ['Metas de la flota', 'metasForm()', 'reportes']].concat(canVerFinanzas() ? [['Rendimiento de las financiaciones', 'rankingFinanciacionesView()', 'reportes']] : []));
  h += grupo('Herramientas', [
    ['Tareas y recordatorios (del equipo)', 'recordatoriosView()', 'reportes'],
    ['Agenda de hoy y mañana', 'agendaView()', 'reportes'],
    ['Simulador de financiación', 'simuladorFinanciacionForm()', 'herramientas', 'reportes'],
    ['Calculadora: financiar vs. alquilar', 'calculadoraForm()', 'herramientas', 'reportes'],
    ['Calculadora: ROI antes de comprar', 'roiAutoForm()', 'herramientas', 'reportes'],
    ['Simular un aumento general de la flota', 'escenarioFlotaForm()', 'herramientas', 'reportes'],
    ['Comparar autos', 'compararAutosForm()', 'herramientas', 'reportes'],
    ['Protocolo de emergencia', 'protocoloEmergenciaForm()', 'reportes'],
    ['Novedades de la app', 'mostrarNovedades()', 'reportes'],
    ['Glosario (qué significa cada cosa)', 'glosarioView()', 'reportes'],
    ['Modo práctica (datos de ejemplo, para aprender)', 'entrarPractica()', 'reportes'],
  ]);
  if (isAdmin() && !featureOculta('desafios')) h += grupo('Motivación', [['Desafío del mes', 'desafioMesForm()']]);
  h += grupo('Choferes', [['Premio por referido', 'referidosView()', 'comunicacion']]);
  h += grupo('Comunicación', [['Mensaje a todos los choferes', 'mensajeATodosForm()', 'comunicacion'], ['Mensajes programados por WhatsApp', 'mensajesProgramadosView()', 'comunicacion'], ['Mensaje de bienvenida', 'bienvenidaConfigForm()', 'comunicacion'], ['Portal del chofer: ajustes', 'portalAjustesForm()', 'comunicacion'], ['Guías para el chofer (portal)', 'guiasView()', 'comunicacion'], ['Página de la empresa (web)', 'sitioEmpresaForm()', 'comunicacion']].concat(isAdmin() ? [['Tablón de anuncios (portal del chofer)', 'anunciosForm()', 'comunicacion']] : []));
  const admin = [['Ajustes', "goMas('ajustes')", 'comunicacion'], ['Copia de seguridad', "goMas('backup')", 'comunicacion'], ['Google', "goMas('google')", 'comunicacion'], ['Salud de los datos', "goMas('saluddatos')", 'comunicacion']];
  if (canVerFinanzas() && !featureOculta('autoseguro')) admin.push(['Fondo de autoseguro', 'autoseguroForm()']);
  if (isAdmin()) admin.push(['Usuarios y permisos', 'usuariosView()'], ['Auditoría', 'auditoriaView()'], ['Bitácora de decisiones', 'bitacoraView()'], ['Errores de la app', 'erroresView()'], ['Modelo de contrato (versión y cláusulas)', 'modeloContratoForm()'], ['Revisar instalación (qué falta configurar)', 'revisarInstalacion()']);
  const nPend = cantidadPendientes();
  if (isAdmin() || nPend) admin.unshift(['Gastos para aprobar' + (nPend ? ' (' + nPend + ')' : ''), 'aprobacionesView()']);
  admin.push(['Papelera (lo borrado en los últimos 30 días)', 'papeleraView()']);
  h += grupo('Administración', admin);
  h += '<div class="sec-t">Tamaño de letra <span class="small muted" style="font-weight:400">en este celular</span></div><div class="row" style="gap:8px;margin-bottom:6px">' +
    TAMANOS_LETRA.map(([k, l]) => '<button class="btn ' + (tamanoLetra() === k ? '' : 'sec ') + 'sm grow" onclick="elegirLetra(\'' + k + '\');render()">' + l + '</button>').join('') + '</div>';
  h += grupo('Cuenta', [['Cambiar mi contraseña', 'cambiarMiContrasenaForm()'], ['Cerrar mi sesión en todos los dispositivos', 'cerrarSesionGlobal()'], ['Cerrar sesión (' + esc(S.user && S.user.email || '') + ')', 'logout()']]);
  const ver = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '';
  h += '<div class="small muted" style="text-align:center;margin:18px 0 6px">' + (ver ? 'Versión del ' + esc(ver.slice(8, 10) + '/' + ver.slice(5, 7) + ' ' + ver.slice(11)) + ' · ' : '') + '<a class="tap" style="text-decoration:underline" onclick="buscarActualizacion()">Buscar actualización</a> · <a class="tap" style="text-decoration:underline" onclick="go(\'panel\');setTimeout(()=>recorridoApp(true),300)">Ver cómo usar la app</a></div>';
  return h;
}
