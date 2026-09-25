import './styles.css';

import { ui } from './state.js';
import { init } from './session.js';
import { go, render, renderList } from './nav.js';
import { doLogin, logout } from './session.js';
import { activarBiometria, desactivarBiometria, loginConBiometria } from './biometric.js';
import { asignarChoferForm, guardarAsignacionChofer, quitarChofer, asignarAutoForm, guardarAsignacionAuto, quitarAutoDeChofer, onAsignacionTipo, calcularCuotaAsignacion } from './forms/asignacion.js';
import { altaRapidaAutoForm, onAltaRapidaAutoTipo, guardarAltaRapidaAuto, altaRapidaChoferForm, guardarAltaRapidaChofer } from './forms/alta-rapida.js';
import { carForm, onTipo, autoCuota, saveCar, delCar, toggleVendido, sugerirAjusteInflacion, sacarDeTaller, setTabAuto, venderAutoForm, confirmarVenta, cronogramaCuotasForm, accesorioForm, saveAccesorio, delAccesorio, qrAutoForm, toggleFavoritoAuto, simularAumentoForm, calcularSimulacionAumento } from './forms/car.js';
import { recordatoriosView, saveRecordatorio, toggleHechoRecordatorio, delRecordatorio } from './forms/recordatorio.js';
import { calculadoraForm, calcularComparacion, roiAutoForm, calcularRoi, escenarioFlotaForm, calcularEscenarioFlota } from './forms/calculadora.js';
import { compararAutosForm, renderComparacionAutos } from './forms/comparar.js';
import { reportePersonalizadoForm, toggleColumnaReporte, renderReportePersonalizado, exportarReportePersonalizado, exportarReportePersonalizadoPDF, guardarFavoritoReporte, cargarFavoritoReporte, borrarFavoritoReporte } from './forms/reporte-personalizado.js';
import { traspasoForm, saveTraspaso } from './forms/traspaso.js';
import { reemplazoTemporalForm, saveReemplazoTemporal, finalizarReemplazoTemporal } from './forms/reemplazo-temporal.js';
import { mantenimientoLoteForm, marcarTodosLote, saveMantenimientoLote } from './forms/mantenimiento-lote.js';
import { mantenimientoForm, onMantCar, onMantItem, saveMantenimiento, delMantenimiento, editarPlanMantenimiento, guardarPlanMantenimiento } from './forms/mantenimiento.js';
import { mantAtajoFecha } from './views/mantenimiento.js';
import { multaForm, onMultaCar, onMultaFecha, onMultaTipo, saveMulta, delMulta } from './forms/multa.js';
import { siniestroForm, onSiniestroCar, onSiniestroFecha, saveSiniestro, delSiniestro, generarGastoSiniestro } from './forms/siniestro.js';
import { reciboPDF, reciboCompartir, estadoCuentaPDF } from './recibo.js';
import { descargarReporteEjecutivo } from './reporte-ejecutivo.js';
import { contratoForm, renovarContratoForm, limpiarFirmaContrato, generarContrato, compartirContrato, generarConstanciaCesion } from './contrato.js';
import { plantillaForm, onPlantillaTipo, generarPlantilla, marcarCartaEnviada } from './plantillas.js';
import { exportarExcel } from './export-excel.js';
import { activarPush, desactivarPush, guardarHorarioPush, guardarPreferenciasPush } from './push.js';
import { driverForm, saveDriver, delDriver, addTelRow, toggleInactivo, aprobarProspecto, onFotoPerfil, regenerarLinkPortal, copiarLinkPortal, setTabChofer, liquidacionForm, addConceptoRow, confirmarLiquidacion, toggleFavoritoChofer, agregarComunicacion, borrarComunicacion } from './forms/driver.js';
import { goMas } from './views/mas.js';
import { initPortal, toggleTemaPortal } from './portal.js';
import { initPostulacion } from './postulacion.js';
import { depositoForm, saveDeposito, delDeposito, semanaAdelantadaForm, guardarSemanaAdelantada, delSemanaAdelantada } from './forms/deposito.js';
import { payForm, onPayCar, savePay, delPay, toggleDepositado } from './forms/payment.js';
import { closeModal, confirmDel } from './modal.js';
import { attach, liveCam, closeCam, shoot, viewFile, closeViewer, addLink, onPaste, delFile } from './files.js';
import { backup, pickRestore, doRestore, exportCSV, cancelRestore, archivarCobrosViejosForm, actualizarInfoArchivar, archivarCobrosViejos } from './backup.js';
import { buscarArchivosHuerfanos, confirmarBorrarHuerfanos } from './huerfanos.js';
import { saveAjustes, snoozeAlert, toggleEnTramite, silenciarAlertasAuto, guardarNombreEmpresa, subirLogo, quitarLogo, guardarProtocoloEmergencia, protocoloEmergenciaForm, anunciosForm, agregarAnuncio, borrarAnuncio, activarModoConsultaUI, desactivarModoConsultaUI, guardarNotaInterna, desafioMesForm, guardarDesafioMes, borrarDesafioMes } from './views/shared.js';
import { posponerSugerencia, resolverSugerencia } from './views/panel.js';
import { socioForm, guardarSocio, borrarSocio, reporteSocios } from './forms/socios.js';
import { adelantoForm, guardarAdelanto, borrarAdelanto } from './forms/adelanto.js';
import { autoseguroForm, registrarTransaccionAutoseguro, borrarTransaccionAutoseguro } from './autoseguro.js';
import { imprimirContactosChoferes } from './views/choferes.js';
import { mostrarNovedades } from './changelog.js';
import { gastoForm, saveGasto, delGasto, reclamoSeguroForm, guardarReclamoSeguro, elegirCategoriaGasto } from './forms/gasto.js';
import { gastosGeneralesView, gastoGeneralForm, onGastoGeneralCat, saveGastoGeneral, delGastoGeneral, gastoRecurrenteForm, onGastoRecurrenteCat, saveGastoRecurrente, delGastoRecurrente } from './forms/gastos-generales.js';
import { sancionForm, saveSancion, delSancion } from './forms/sancion.js';
import { inspeccionForm, saveInspeccion, delInspeccion, limpiarFirmaInspeccion } from './forms/inspeccion.js';
import { proveedoresView, saveProveedor, delProveedor } from './forms/proveedor.js';
import { ajusteForm, saveAjuste, delAjuste } from './forms/ajuste.js';
import { searchView, doSearch, usarFiltroReciente } from './forms/search.js';
import { flushQueue } from './data.js';
import { usuariosView, cambiarRol, toggleActivo } from './forms/usuarios.js';
import { auditoriaView, auditCargarMas, auditFiltrar, historialAutoView } from './forms/auditoria.js';
import { mapaFlotaView } from './forms/mapa.js';
import { conectarGoogleUI } from './views/google-ui.js';
import { googleConfigured, loadGis } from './google.js';
import { syncCalendarUI } from './google-calendar.js';
import { syncSheetsUI, syncMultasSheetsUI, syncMantenimientoSheetsUI } from './google-sheets.js';
import { syncDriveUI } from './google-drive.js';

/* Las plantillas HTML generadas usan atributos inline (onclick, oninput, …)
   que se resuelven en el scope global, así que las funciones que referencian
   necesitan quedar colgadas de window. */
Object.assign(window, {
  ui, go, render, renderList, sincronizarAhora: flushQueue,
  doLogin, logout, activarBiometria, desactivarBiometria, loginConBiometria,
  asignarChoferForm, guardarAsignacionChofer, quitarChofer, asignarAutoForm, guardarAsignacionAuto, quitarAutoDeChofer, onAsignacionTipo, calcularCuotaAsignacion,
  altaRapidaAutoForm, onAltaRapidaAutoTipo, guardarAltaRapidaAuto, altaRapidaChoferForm, guardarAltaRapidaChofer,
  carForm, onTipo, autoCuota, saveCar, delCar, toggleVendido, sugerirAjusteInflacion, sacarDeTaller, setTabAuto, venderAutoForm, confirmarVenta, cronogramaCuotasForm, accesorioForm, saveAccesorio, delAccesorio, qrAutoForm, toggleFavoritoAuto, simularAumentoForm, calcularSimulacionAumento,
  recordatoriosView, saveRecordatorio, toggleHechoRecordatorio, delRecordatorio,
  calculadoraForm, calcularComparacion, roiAutoForm, calcularRoi, escenarioFlotaForm, calcularEscenarioFlota, compararAutosForm, renderComparacionAutos,
  reportePersonalizadoForm, toggleColumnaReporte, renderReportePersonalizado, exportarReportePersonalizado, exportarReportePersonalizadoPDF, guardarFavoritoReporte, cargarFavoritoReporte, borrarFavoritoReporte,
  traspasoForm, saveTraspaso,
  reemplazoTemporalForm, saveReemplazoTemporal, finalizarReemplazoTemporal,
  mantenimientoLoteForm, marcarTodosLote, saveMantenimientoLote,
  goMas,
  mantenimientoForm, onMantCar, onMantItem, saveMantenimiento, delMantenimiento, editarPlanMantenimiento, guardarPlanMantenimiento, mantAtajoFecha,
  multaForm, onMultaCar, onMultaFecha, onMultaTipo, saveMulta, delMulta,
  siniestroForm, onSiniestroCar, onSiniestroFecha, saveSiniestro, delSiniestro, generarGastoSiniestro,
  reciboPDF, reciboCompartir, estadoCuentaPDF, descargarReporteEjecutivo, exportarExcel, activarPush, desactivarPush, guardarHorarioPush, guardarPreferenciasPush,
  contratoForm, renovarContratoForm, limpiarFirmaContrato, generarContrato, compartirContrato, generarConstanciaCesion, plantillaForm, onPlantillaTipo, generarPlantilla, marcarCartaEnviada,
  driverForm, saveDriver, delDriver, addTelRow, toggleInactivo, aprobarProspecto, onFotoPerfil, regenerarLinkPortal, copiarLinkPortal, setTabChofer, liquidacionForm, addConceptoRow, confirmarLiquidacion, toggleFavoritoChofer, agregarComunicacion, borrarComunicacion,
  adelantoForm, guardarAdelanto, borrarAdelanto,
  depositoForm, saveDeposito, delDeposito, semanaAdelantadaForm, guardarSemanaAdelantada, delSemanaAdelantada,
  payForm, onPayCar, savePay, delPay, toggleDepositado,
  closeModal, confirmDel,
  attach, liveCam, closeCam, shoot, viewFile, closeViewer, addLink, onPaste, delFile,
  backup, pickRestore, doRestore, exportCSV, cancelRestore, archivarCobrosViejosForm, actualizarInfoArchivar, archivarCobrosViejos,
  buscarArchivosHuerfanos, confirmarBorrarHuerfanos,
  saveAjustes, snoozeAlert, toggleEnTramite, silenciarAlertasAuto, guardarNombreEmpresa, subirLogo, quitarLogo, guardarProtocoloEmergencia, protocoloEmergenciaForm,
  anunciosForm, agregarAnuncio, borrarAnuncio, activarModoConsultaUI, desactivarModoConsultaUI, guardarNotaInterna,
  desafioMesForm, guardarDesafioMes, borrarDesafioMes,
  posponerSugerencia, resolverSugerencia,
  socioForm, guardarSocio, borrarSocio, reporteSocios,
  autoseguroForm, registrarTransaccionAutoseguro, borrarTransaccionAutoseguro,
  imprimirContactosChoferes, mostrarNovedades,
  gastoForm, saveGasto, delGasto, reclamoSeguroForm, guardarReclamoSeguro, elegirCategoriaGasto,
  gastosGeneralesView, gastoGeneralForm, onGastoGeneralCat, saveGastoGeneral, delGastoGeneral, gastoRecurrenteForm, onGastoRecurrenteCat, saveGastoRecurrente, delGastoRecurrente,
  sancionForm, saveSancion, delSancion,
  inspeccionForm, saveInspeccion, delInspeccion, limpiarFirmaInspeccion,
  proveedoresView, saveProveedor, delProveedor,
  ajusteForm, saveAjuste, delAjuste,
  searchView, doSearch, usarFiltroReciente,
  usuariosView, cambiarRol, toggleActivo, auditoriaView, auditCargarMas, auditFiltrar, historialAutoView, mapaFlotaView,
  conectarGoogleUI, syncCalendarUI, syncSheetsUI, syncMultasSheetsUI, syncMantenimientoSheetsUI, syncDriveUI,
  toggleTemaPortal,
});

const portalMatch = location.hash.match(/^#\/portal\/([^/]+)\/([^/]+)/);
if (portalMatch) {
  initPortal(decodeURIComponent(portalMatch[1]), decodeURIComponent(portalMatch[2]));
} else if (location.hash.match(/^#\/postulacion/)) {
  initPostulacion();
} else {
  window.addEventListener('online', () => { flushQueue(); render(); });
  window.addEventListener('offline', () => render());

  if (googleConfigured()) loadGis().catch(() => {});

  init();
}
