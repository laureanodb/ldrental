// App del dueño y su equipo (se carga solo cuando no es el portal del chofer ni la postulación).
import { ui } from './state.js';
import { init } from './session.js';
import { go, render, renderList } from './nav.js';
import { doLogin, logout } from './session.js';
import { activarBiometria, desactivarBiometria, loginConBiometria } from './biometric.js';
import { renderSeguroDocs, subirDocSeguro, completarSeguroConIA, leerCotizacionSeguro, agregarCotizacionSeguro, quitarCotizacionSeguro, elegirCotizacionSeguro, ayudaSeguroPaga, corregirSeguroForm, guardarCorreccionSeguro, valorSemanalForm, guardarValorSemanal, volverDeValorSemanal, carForm, onTipo, autoCuota, saveCar, delCar, toggleVendido, sugerirAjusteInflacion, sacarDeTaller, marcarEnTaller, setTabAuto, venderAutoForm, confirmarVenta, cronogramaCuotasForm, accesorioForm, saveAccesorio, delAccesorio, qrAutoForm, toggleFavoritoAuto, simularAumentoForm, calcularSimulacionAumento } from './forms/car.js';
import { cedulaForm, guardarCedula, bajaCedula, vtvTurnoForm, guardarVtvTurno, borrarVtvTurno, medicionBateriaForm, guardarMedicionBateria, estimarCubiertaIA, valoresMercadoView, guardarValoresMercado, codigoFallaForm, onCodigoFalla, guardarCodigoFalla, resolverCodigoFalla, leerOBD, ejecutarLecturaOBD } from './forms/auto-extra.js';
import { nuevaOTForm, crearOT, otForm, guardarDatosOT, agregarTareaOT, sumarChecklistOT, toggleTareaOT, agregarRepuestoOT, quitarRepuestoOT, agregarHorasOT, quitarHorasOT, valorHoraForm, guardarValorHora, subirFotoOT, cerrarOTForm, cerrarOT, cancelarOT, ordenesView, atenderOpinionOT, reabrirOT, borrarOT } from './forms/ordenes.js';
import { onChecklistOT, checklistsTrabajoView, agregarChecklistTrabajo, guardarChecklistsTrabajo } from './forms/checklists.js';
import { aprobacionesView, guardarUmbralAprobacion, aprobarPendiente, rechazarPendiente, bitacoraView, decisionForm, guardarDecision, borrarDecision, metasForm, guardarMetas } from './forms/control.js';
import { turnoServiceForm, responderTurno, auxilioView, atenderAuxilio, aprobarCambiosDatos, rechazarCambiosDatos } from './forms/portal-pedidos.js';
import { agendarServiceForm, guardarServiceAgendado, recordarServiceView, marcarServiceRecordado, agregarReclamo, resolverReclamo, borrarReclamo, llamarYAnotar, saludoView, mandarSaludo, marcarSaludado } from './forms/choferes-extra.js';
import { mensajesProgramadosView, guardarMensajeProgramado, borrarMensajeProgramado, enviarMensajeProgramado, marcarMensajeEnviado, cerrarMensajeProgramado, marcarLinkEnviado, marcarAgradecido } from './forms/mensajes.js';
import { onFrecuencia, cargoFinanciadoForm, calcCargoFinanciado, guardarCargoFinanciado, borrarCargoFinanciado, rankingFinanciacionesView } from './forms/financiados-ui.js';
import { candidatosCompraView, candidatoCompraForm, guardarCandidatoCompra, descartarCandidato, comprarCandidato, comprasPorVendedorView, calendarioComprasView, guardarCalendarioCompras } from './forms/compras.js';
import { tiemposRespuestaView, duracionChoferesView, kmFlotaView, servicesATiempoView, chequeoView, hacerChequeo, verChequeo } from './forms/reportes-extra.js';
import { papeleraView, restaurarPapelera } from './forms/papelera.js';
import { elegirPantallaInicio, limpiarFiltrosGuardados, cargarPreferencias } from './preferencias.js';
import { recorridoApp } from './recorrido.js';
import { gpsView, generarClaveGps, copiarUrlGps, guardarConfigGps, zonaGpsForm, ubicacionZonaGps, guardarZonaGps, borrarZonaGps } from './forms/gps.js';
import { consultaMultasView, rondaMultas, abrirConsultaMulta, resultadoConsultaMulta, cargarMultaManual, terminarConMultas, leerCapturaMultas, guardarMultasLeidas, lugaresMultasView, guardarLugaresMultas } from './forms/consulta-multas.js';
import { leerTituloAuto } from './forms/titulo-auto.js';
import { cambiarMiContrasenaForm, guardarMiContrasena, olvideContrasena, guardarNuevaContrasena, contrasenaUsuarioForm, generarContrasena, guardarContrasenaUsuario } from './forms/contrasena.js';
import { corregirMontosView, aplicarCorreccionMontos } from './forms/corregir-montos.js';
import { instalarNormalizadorNumeros } from './numeros.js';
import { datosFaltantesView } from './forms/ficha-completa.js';
import { consultaPatenteView, rondaPatente, pasoPatente, cambiarLugarPatente, abrirConsultaPatente, resultadoPatente, guardarDeudaPatente, patentePagada, gastoPatente, lugaresPatenteView, guardarLugaresPatente, quitarLugarPatente } from './forms/consulta-patente.js';
import { referidosView, guardarReglaReferido, darPremioReferido } from './forms/referidos.js';
import { agendaView } from './forms/agenda.js';
import { cajaChicaView, guardarCajaChica } from './forms/caja-chica.js';
import { bienvenidaForm, enviarBienvenida, copiarBienvenida, bienvenidaConfigForm, guardarBienvenidaConfig, volverTextoBienvenida } from './forms/bienvenida.js';
import { mensajeATodosForm, armarMensajeATodos } from './forms/mensajes.js';
import { danosView, clickMapaDano, nuevoDanoForm, guardarDano, repararDano } from './forms/danos.js';
import { fichasModeloView, fichaModeloForm, guardarFichaModelo } from './forms/ficha-modelo.js';
import { metaSemanalView } from './forms/meta-semanal.js';
import { elegirLetra, aplicarLetra } from './preferencias.js';
import { vencimientosAlCalendario } from './ics.js';
import { agendaAlCalendario } from './forms/agenda.js';
import { cierreMesView, cerrarMes, reabrirMes } from './forms/cierre-mes.js';
import { cerrarSesionGlobal, cerrarSesionDe } from './forms/contrasena.js';
import { portalAjustesForm, guardarPortalAjustes } from './forms/portal-ajustes.js';
import { instalarReporteErrores, erroresView } from './errores.js';
import { actaForm, limpiarFirmaActa, guardarActa } from './forms/acta.js';
import { ayudaPantalla, glosarioView } from './ayuda.js';
import { arcaForm, guardarArca, generarCsrArca, guardarCertArca, probarArca, facturarCobro, facturaPDF } from './forms/arca.js';
import { instalarBloqueo } from './bloqueo.js';
import { permisosSeccionesForm, guardarPermisosSecciones } from './forms/permisos.js';
import { entrarPractica, salirPractica } from './practica.js';
import { aprobarGastoChofer, rechazarGastoChofer, cerrarAvisoAtraso, cerrarDevolucion } from './forms/pedidos-chofer.js';
import { recordatoriosView, saveRecordatorio, toggleHechoRecordatorio, delRecordatorio } from './forms/recordatorio.js';
import { compararAutosForm, renderComparacionAutos } from './forms/comparar.js';
import { reportePersonalizadoForm, toggleColumnaReporte, renderReportePersonalizado, exportarReportePersonalizado, exportarReportePersonalizadoPDF, guardarFavoritoReporte, cargarFavoritoReporte, borrarFavoritoReporte } from './forms/reporte-personalizado.js';
import { mantAtajoFecha } from './views/mantenimiento.js';
import { listaDeCompraForm, guardarCoberturaPanol } from './views/stock.js';
import { repuestoForm, saveRepuesto, delRepuesto, movimientoStockForm, guardarMovimientoStock, delMovimientoStock, onRepuestoCat, prestarHerramientaForm, guardarPrestamo, devolverHerramienta, inventarioPanolForm, guardarInventarioPanol, inventariosAnteriores, verInventario, kitsPanolView, kitPanolForm, addKitRow, guardarKitPanol, borrarKitPanol, usarKitForm, guardarUsoKit, exportarPanolExcel, ventaPanolForm, calcVentaPanol, guardarVentaPanol } from './forms/repuesto.js';
import { contratoForm, renovarContratoForm, limpiarFirmaContrato, generarContrato, compartirContrato, generarConstanciaCesion, mandarContratoAFirmar, avisoFirmaRemota, cancelarFirmaRemota, descargarContratoFirmado, copiarLinkFirma } from './contrato.js';
import { activarPush, desactivarPush, guardarHorarioPush, guardarPreferenciasPush } from './push.js';
import { marcarComprobantePortal, aceptarDocPortal, rechazarDocPortal, driverForm, saveDriver, delDriver, addTelRow, toggleInactivo, aprobarProspecto, onFotoPerfil, regenerarLinkPortal, copiarLinkPortal, togglePortalDesactivado, setTabChofer, liquidacionForm, addConceptoRow, confirmarLiquidacion, toggleFavoritoChofer, agregarComunicacion, borrarComunicacion } from './forms/driver.js';
import { goMas } from './views/mas.js';
import { depositoForm, saveDeposito, delDeposito, semanaAdelantadaForm, guardarSemanaAdelantada, delSemanaAdelantada, confirmarBorrarSemanaAdelantada, fusionarDuplicadosLedger } from './forms/deposito.js';
import { payForm, payFormACuenta, onPayCar, savePay, delPay, toggleDepositado, cobrarComprobantePortal, payFormSeguro, onPayTipo, leerComprobanteCobro, onPayPesos, avisoMontoCobro } from './forms/payment.js';
import { cruceArchivo, cruceColumna, cruceOrigen, cruceLimpiar, cruceCobrar, cruceIgnorar, cruceConfirmar } from './forms/cruce.js';
import { closeModal, confirmDel, toast } from './modal.js';
import { attach, liveCam, closeCam, shoot, viewFile, closeViewer, addLink, onPaste, delFile } from './files.js';
import { backup, pickRestore, probarRestore, doRestore, exportCSV, cancelRestore, archivarCobrosViejosForm, actualizarInfoArchivar, archivarCobrosViejos } from './backup.js';
import { saveAjustes, snoozeAlert, toggleEnTramite, silenciarAlertasAuto, guardarNombreEmpresa, guardarDolarAjustes, guardarDatosPago, subirLogo, quitarLogo, guardarProtocoloEmergencia, protocoloEmergenciaForm, anunciosForm, agregarAnuncio, borrarAnuncio, activarModoConsultaUI, desactivarModoConsultaUI, guardarNotaInterna, desafioMesForm, guardarDesafioMes, borrarDesafioMes } from './views/shared.js';
import { posponerSugerencia, resolverSugerencia } from './views/panel.js';
import { socioForm, guardarSocio, borrarSocio, reporteSocios } from './forms/socios.js';
import { adelantoForm, guardarAdelanto, borrarAdelanto } from './forms/adelanto.js';
import { autoseguroForm, registrarTransaccionAutoseguro, borrarTransaccionAutoseguro } from './autoseguro.js';
import { imprimirContactosChoferes } from './views/choferes.js';
import { mostrarNovedades } from './changelog.js';
import { gastosGeneralesView, gastoGeneralForm, onGastoGeneralCat, saveGastoGeneral, delGastoGeneral, gastoRecurrenteForm, onGastoRecurrenteCat, saveGastoRecurrente, delGastoRecurrente } from './forms/gastos-generales.js';
import { proveedoresView, saveProveedor, delProveedor } from './forms/proveedor.js';
import { flushQueue } from './data.js';
import { usuariosView, cambiarRol, toggleActivo } from './forms/usuarios.js';
import { auditoriaView, auditCargarMas, auditFiltrar, historialAutoView } from './forms/auditoria.js';
import { mapaFlotaView } from './forms/mapa.js';
import { conectarGoogleUI } from './views/google-ui.js';
import { googleConfigured, loadGis } from './google.js';

/* Las plantillas HTML generadas usan atributos inline (onclick, oninput, …)
   que se resuelven en el scope global, así que las funciones que referencian
   necesitan quedar colgadas de window. */
// Arma funciones que cargan su módulo la primera vez que se usan.
const modulos = new Map();
function perezoso(cargar, nombres) {
  const traer = () => { if (!modulos.has(cargar)) modulos.set(cargar, cargar().catch(e => { modulos.delete(cargar); throw e; })); return modulos.get(cargar); };
  return Object.fromEntries(nombres.map(n => [n, (...a) => traer().then(m => m[n](...a))]));
}

instalarNormalizadorNumeros();
aplicarLetra();
instalarReporteErrores();
instalarBloqueo();
Object.assign(window, { arcaForm, guardarArca, generarCsrArca, guardarCertArca, probarArca, facturarCobro, facturaPDF, permisosSeccionesForm, guardarPermisosSecciones, ayudaPantalla, glosarioView, entrarPractica, salirPractica, actaForm, limpiarFirmaActa, guardarActa, erroresView, portalAjustesForm, guardarPortalAjustes, cierreMesView, cerrarMes, reabrirMes, cerrarSesionGlobal, cerrarSesionDe, vencimientosAlCalendario, agendaAlCalendario, elegirLetra, metaSemanalView, fichasModeloView, fichaModeloForm, guardarFichaModelo, danosView, clickMapaDano, nuevoDanoForm, guardarDano, repararDano, mensajeATodosForm, armarMensajeATodos, bienvenidaForm, enviarBienvenida, copiarBienvenida, bienvenidaConfigForm, guardarBienvenidaConfig, volverTextoBienvenida, cajaChicaView, guardarCajaChica, agendaView, referidosView, guardarReglaReferido, darPremioReferido, consultaPatenteView, rondaPatente, pasoPatente, cambiarLugarPatente, abrirConsultaPatente, resultadoPatente, guardarDeudaPatente, patentePagada, gastoPatente, lugaresPatenteView, guardarLugaresPatente, quitarLugarPatente, datosFaltantesView, corregirMontosView, aplicarCorreccionMontos, cambiarMiContrasenaForm, guardarMiContrasena, olvideContrasena, guardarNuevaContrasena, contrasenaUsuarioForm, generarContrasena, guardarContrasenaUsuario, leerTituloAuto,
  agendarServiceForm, guardarServiceAgendado, recordarServiceView, marcarServiceRecordado, agregarReclamo, resolverReclamo, borrarReclamo, llamarYAnotar, saludoView, mandarSaludo, marcarSaludado,
  aprobarGastoChofer, rechazarGastoChofer, cerrarAvisoAtraso, cerrarDevolucion,
  consultaMultasView, rondaMultas, abrirConsultaMulta, resultadoConsultaMulta, cargarMultaManual, terminarConMultas, leerCapturaMultas, guardarMultasLeidas, lugaresMultasView, guardarLugaresMultas,
  gpsView, generarClaveGps, copiarUrlGps, guardarConfigGps, zonaGpsForm, ubicacionZonaGps, guardarZonaGps, borrarZonaGps,
  elegirPantallaInicio, limpiarFiltrosGuardados, toast, recorridoApp,
  papeleraView, restaurarPapelera,
  tiemposRespuestaView, duracionChoferesView, kmFlotaView, servicesATiempoView, chequeoView, hacerChequeo, verChequeo,
  candidatosCompraView, candidatoCompraForm, guardarCandidatoCompra, descartarCandidato, comprarCandidato, comprasPorVendedorView, calendarioComprasView, guardarCalendarioCompras,
  onFrecuencia, cargoFinanciadoForm, calcCargoFinanciado, guardarCargoFinanciado, borrarCargoFinanciado, rankingFinanciacionesView,
  mensajesProgramadosView, guardarMensajeProgramado, borrarMensajeProgramado, enviarMensajeProgramado, marcarMensajeEnviado, cerrarMensajeProgramado, marcarLinkEnviado, marcarAgradecido,
  ui, go, render, renderList, sincronizarAhora: flushQueue,
  doLogin, logout, activarBiometria, desactivarBiometria, loginConBiometria,
  valorSemanalForm, guardarValorSemanal, volverDeValorSemanal,
  carForm, onTipo, autoCuota, saveCar, delCar, toggleVendido, sugerirAjusteInflacion, sacarDeTaller, setTabAuto, venderAutoForm, confirmarVenta, cronogramaCuotasForm, accesorioForm, saveAccesorio, delAccesorio, qrAutoForm, toggleFavoritoAuto, simularAumentoForm, calcularSimulacionAumento,
  cedulaForm, guardarCedula, bajaCedula, vtvTurnoForm, guardarVtvTurno, borrarVtvTurno, medicionBateriaForm, guardarMedicionBateria, estimarCubiertaIA, valoresMercadoView, guardarValoresMercado, codigoFallaForm, onCodigoFalla, guardarCodigoFalla, resolverCodigoFalla, leerOBD, ejecutarLecturaOBD,
  nuevaOTForm, crearOT, otForm, guardarDatosOT, agregarTareaOT, sumarChecklistOT, onChecklistOT, checklistsTrabajoView, agregarChecklistTrabajo, guardarChecklistsTrabajo, toggleTareaOT, agregarRepuestoOT, quitarRepuestoOT, agregarHorasOT, quitarHorasOT, valorHoraForm, guardarValorHora, subirFotoOT, cerrarOTForm, cerrarOT, cancelarOT, ordenesView, marcarEnTaller,
  aprobacionesView, guardarUmbralAprobacion, aprobarPendiente, rechazarPendiente, bitacoraView, decisionForm, guardarDecision, borrarDecision, metasForm, guardarMetas,
  turnoServiceForm, responderTurno, auxilioView, atenderAuxilio, aprobarCambiosDatos, rechazarCambiosDatos, atenderOpinionOT, reabrirOT, borrarOT,
  recordatoriosView, saveRecordatorio, toggleHechoRecordatorio, delRecordatorio,
  compararAutosForm, renderComparacionAutos,
  reportePersonalizadoForm, toggleColumnaReporte, renderReportePersonalizado, exportarReportePersonalizado, exportarReportePersonalizadoPDF, guardarFavoritoReporte, cargarFavoritoReporte, borrarFavoritoReporte,
  goMas,
  mantAtajoFecha, listaDeCompraForm,
  repuestoForm, saveRepuesto, delRepuesto, movimientoStockForm, guardarMovimientoStock, delMovimientoStock,
  onRepuestoCat, prestarHerramientaForm, guardarPrestamo, devolverHerramienta, inventarioPanolForm, guardarInventarioPanol, inventariosAnteriores, verInventario,
  kitsPanolView, kitPanolForm, addKitRow, guardarKitPanol, borrarKitPanol, usarKitForm, guardarUsoKit, exportarPanolExcel, guardarCoberturaPanol, ventaPanolForm, calcVentaPanol, guardarVentaPanol,
  activarPush, desactivarPush, guardarHorarioPush, guardarPreferenciasPush,
  contratoForm, renovarContratoForm, limpiarFirmaContrato, generarContrato, compartirContrato, generarConstanciaCesion,
  driverForm, saveDriver, delDriver, addTelRow, toggleInactivo, aprobarProspecto, onFotoPerfil, regenerarLinkPortal, copiarLinkPortal, togglePortalDesactivado, setTabChofer, liquidacionForm, addConceptoRow, confirmarLiquidacion, toggleFavoritoChofer, agregarComunicacion, borrarComunicacion,
  adelantoForm, guardarAdelanto, borrarAdelanto,
  depositoForm, saveDeposito, delDeposito, semanaAdelantadaForm, guardarSemanaAdelantada, delSemanaAdelantada, confirmarBorrarSemanaAdelantada, fusionarDuplicadosLedger,
  payForm, payFormACuenta, onPayCar, savePay, delPay, toggleDepositado, cobrarComprobantePortal, marcarComprobantePortal, aceptarDocPortal, rechazarDocPortal, payFormSeguro, onPayTipo, leerComprobanteCobro, onPayPesos, avisoMontoCobro, renderSeguroDocs, subirDocSeguro, completarSeguroConIA, leerCotizacionSeguro, agregarCotizacionSeguro, quitarCotizacionSeguro, elegirCotizacionSeguro,
  mandarContratoAFirmar, avisoFirmaRemota, cancelarFirmaRemota, descargarContratoFirmado, copiarLinkFirma,
  cruceArchivo, cruceColumna, cruceOrigen, cruceLimpiar, cruceCobrar, cruceIgnorar, cruceConfirmar, ayudaSeguroPaga, corregirSeguroForm, guardarCorreccionSeguro,
  closeModal, confirmDel,
  attach, liveCam, closeCam, shoot, viewFile, closeViewer, addLink, onPaste, delFile,
  backup, pickRestore, probarRestore, doRestore, exportCSV, cancelRestore, archivarCobrosViejosForm, actualizarInfoArchivar, archivarCobrosViejos,
  saveAjustes, snoozeAlert, toggleEnTramite, silenciarAlertasAuto, guardarNombreEmpresa, guardarDolarAjustes, guardarDatosPago, subirLogo, quitarLogo, guardarProtocoloEmergencia, protocoloEmergenciaForm,
  anunciosForm, agregarAnuncio, borrarAnuncio, activarModoConsultaUI, desactivarModoConsultaUI, guardarNotaInterna,
  desafioMesForm, guardarDesafioMes, borrarDesafioMes,
  posponerSugerencia, resolverSugerencia,
  socioForm, guardarSocio, borrarSocio, reporteSocios,
  autoseguroForm, registrarTransaccionAutoseguro, borrarTransaccionAutoseguro,
  imprimirContactosChoferes, mostrarNovedades,
  gastosGeneralesView, gastoGeneralForm, onGastoGeneralCat, saveGastoGeneral, delGastoGeneral, gastoRecurrenteForm, onGastoRecurrenteCat, saveGastoRecurrente, delGastoRecurrente,
  proveedoresView, saveProveedor, delProveedor,
  usuariosView, cambiarRol, toggleActivo, auditoriaView, auditCargarMas, auditFiltrar, historialAutoView, mapaFlotaView,
  conectarGoogleUI,
});

// Pantallas que se usan menos: se bajan recién la primera vez que se abren, así la app arranca más rápido.
Object.assign(window,
  perezoso(() => import('./forms/contador.js'), ['contadorForm', 'exportarContador']),
  perezoso(() => import('./forms/modelo-contrato.js'), ['modeloContratoForm', 'guardarModeloContrato', 'verificarVersionesContrato']),
  perezoso(() => import('./forms/prueba-copia.js'), ['probarCopiaAhora']),
  perezoso(() => import('./forms/diagnostico.js'), ['revisarInstalacion']),
  perezoso(() => import('./export-excel.js'), ['exportarExcel']),
  perezoso(() => import('./forms/ajuste.js'), ['ajusteForm', 'saveAjuste', 'delAjuste']),
  perezoso(() => import('./forms/alta-rapida.js'), ['altaRapidaAutoForm', 'onAltaRapidaAutoTipo', 'guardarAltaRapidaAuto', 'altaRapidaChoferForm', 'guardarAltaRapidaChofer']),
  perezoso(() => import('./forms/asignacion.js'), ['asignarChoferForm', 'guardarAsignacionChofer', 'quitarChofer', 'asignarAutoForm', 'guardarAsignacionAuto', 'quitarAutoDeChofer', 'onAsignacionTipo', 'calcularCuotaAsignacion', 'onAsignarAutoElegido']),
  perezoso(() => import('./forms/calculadora.js'), ['calculadoraForm', 'calcularComparacion', 'roiAutoForm', 'calcularRoi', 'escenarioFlotaForm', 'calcularEscenarioFlota']),
  perezoso(() => import('./forms/cuenta.js'), ['cuentaCorrienteView', 'planPagosForm', 'planPagosRecalcular', 'guardarPlanPagos', 'cerrarPlanPagos', 'cuentaCorrientePDF']),
  perezoso(() => import('./forms/denuncia.js'), ['denunciaSiniestroView', 'copiarDenuncia', 'pdfDenuncia']),
  perezoso(() => import('./forms/gasto.js'), ['gastoForm', 'saveGasto', 'delGasto', 'reclamoSeguroForm', 'guardarReclamoSeguro', 'elegirCategoriaGasto', 'leerFacturaGasto']),
  perezoso(() => import('./forms/guias.js'), ['guiasView', 'agregarGuia', 'guardarGuias']),
  perezoso(() => import('./forms/inspeccion.js'), ['inspeccionForm', 'saveInspeccion', 'delInspeccion', 'limpiarFirmaInspeccion', 'renderPasosFotos', 'fotoPaso', 'compararInspeccion']),
  perezoso(() => import('./forms/mantenimiento-lote.js'), ['mantenimientoLoteForm', 'marcarTodosLote', 'saveMantenimientoLote']),
  perezoso(() => import('./forms/mantenimiento.js'), ['mantenimientoForm', 'onMantCar', 'onMantItem', 'saveMantenimiento', 'delMantenimiento', 'editarPlanMantenimiento', 'guardarPlanMantenimiento', 'addRepuestoMantRow', 'leerFacturaMant', 'cargarKitMant']),
  perezoso(() => import('./forms/multa.js'), ['multaForm', 'onMultaCar', 'onMultaFecha', 'onMultaTipo', 'saveMulta', 'delMulta']),
  perezoso(() => import('./forms/pantalla-oficina.js'), ['pantallaOficina', 'salirPantallaOficina', 'refrescarPantallaOficina']),
  perezoso(() => import('./forms/patrimonio.js'), ['patrimonioView', 'guardarPatrimonio']),
  perezoso(() => import('./forms/reemplazo-temporal.js'), ['reemplazoTemporalForm', 'saveReemplazoTemporal', 'finalizarReemplazoTemporal']),
  perezoso(() => import('./forms/sancion.js'), ['sancionForm', 'saveSancion', 'delSancion']),
  perezoso(() => import('./forms/search.js'), ['searchView', 'doSearch', 'usarFiltroReciente']),
  perezoso(() => import('./forms/simulador.js'), ['simuladorFinanciacionForm', 'simuladorElegirAuto', 'simuladorCalcular', 'simuladorCompartir', 'simuladorPDF', 'simuladorUsar', 'simuladorTogglePlazo', 'simuladorAgregarPlazo']),
  perezoso(() => import('./forms/siniestro.js'), ['siniestroForm', 'onSiniestroCar', 'onSiniestroFecha', 'saveSiniestro', 'delSiniestro', 'generarGastoSiniestro']),
  perezoso(() => import('./forms/sitio-empresa.js'), ['sitioEmpresaForm', 'guardarSitioEmpresa']),
  perezoso(() => import('./forms/traspaso.js'), ['traspasoForm', 'saveTraspaso']),
  perezoso(() => import('./google-calendar.js'), ['syncCalendarUI']),
  perezoso(() => import('./google-drive.js'), ['syncDriveUI']),
  perezoso(() => import('./google-sheets.js'), ['syncSheetsUI', 'syncMultasSheetsUI', 'syncMantenimientoSheetsUI']),
  perezoso(() => import('./huerfanos.js'), ['buscarArchivosHuerfanos', 'confirmarBorrarHuerfanos']),
  perezoso(() => import('./plantillas.js'), ['plantillaForm', 'onPlantillaTipo', 'generarPlantilla', 'marcarCartaEnviada']),
  perezoso(() => import('./recibo.js'), ['reciboPDF', 'reciboCompartir', 'estadoCuentaPDF']),
  perezoso(() => import('./reporte-ejecutivo.js'), ['descargarReporteEjecutivo'])
);

window.addEventListener('online', () => { flushQueue(); render(); });
window.addEventListener('offline', () => render());

if (googleConfigured()) loadGis().catch(() => {});

// Busca una versión nueva de la app y recarga.
window.buscarActualizacion = async () => {
  toast('Buscando actualización…');
  try { const r = await navigator.serviceWorker.getRegistration(); if (r) await r.update(); } catch (e) {}
  setTimeout(() => location.reload(), 2500);
};

cargarPreferencias();
init();
