import './styles.css';

import { ui } from './state.js';
import { init } from './session.js';
import { go, render, renderList } from './nav.js';
import { doLogin, logout } from './session.js';
import { carForm, onTipo, autoCuota, saveCar, delCar, toggleVendido, sugerirAjusteInflacion, sacarDeTaller, setTabAuto, venderAutoForm, confirmarVenta, cronogramaCuotasForm } from './forms/car.js';
import { mantenimientoForm, onMantCar, onMantItem, saveMantenimiento, delMantenimiento, editarPlanMantenimiento, guardarPlanMantenimiento } from './forms/mantenimiento.js';
import { mantAtajoFecha } from './views/mantenimiento.js';
import { multaForm, onMultaCar, onMultaFecha, onMultaTipo, saveMulta, delMulta } from './forms/multa.js';
import { siniestroForm, onSiniestroCar, onSiniestroFecha, saveSiniestro, delSiniestro, generarGastoSiniestro } from './forms/siniestro.js';
import { reciboPDF, reciboCompartir } from './recibo.js';
import { descargarReporteEjecutivo } from './reporte-ejecutivo.js';
import { contratoForm, limpiarFirmaContrato, generarContrato, compartirContrato } from './contrato.js';
import { exportarExcel } from './export-excel.js';
import { activarPush, desactivarPush, guardarHorarioPush } from './push.js';
import { driverForm, saveDriver, delDriver, addTelRow, toggleInactivo, aprobarProspecto, onFotoPerfil, regenerarLinkPortal, copiarLinkPortal, setTabChofer, liquidacionForm, addConceptoRow, confirmarLiquidacion } from './forms/driver.js';
import { goMas } from './views/mas.js';
import { initPortal } from './portal.js';
import { initPostulacion } from './postulacion.js';
import { depositoForm, saveDeposito, delDeposito } from './forms/deposito.js';
import { payForm, onPayCar, savePay, delPay, toggleDepositado } from './forms/payment.js';
import { closeModal, confirmDel } from './modal.js';
import { attach, liveCam, closeCam, shoot, viewFile, closeViewer, addLink, onPaste, delFile } from './files.js';
import { backup, pickRestore, doRestore, exportCSV, cancelRestore } from './backup.js';
import { saveAjustes, snoozeAlert, guardarNombreEmpresa, subirLogo, quitarLogo } from './views/shared.js';
import { gastoForm, saveGasto, delGasto } from './forms/gasto.js';
import { gastosGeneralesView, gastoGeneralForm, saveGastoGeneral, delGastoGeneral, gastoRecurrenteForm, saveGastoRecurrente, delGastoRecurrente } from './forms/gastos-generales.js';
import { sancionForm, saveSancion, delSancion } from './forms/sancion.js';
import { inspeccionForm, saveInspeccion, delInspeccion } from './forms/inspeccion.js';
import { proveedoresView, saveProveedor, delProveedor } from './forms/proveedor.js';
import { ajusteForm, saveAjuste, delAjuste } from './forms/ajuste.js';
import { searchView, doSearch } from './forms/search.js';
import { flushQueue } from './data.js';
import { usuariosView, cambiarRol, toggleActivo } from './forms/usuarios.js';
import { auditoriaView, auditCargarMas, auditFiltrar } from './forms/auditoria.js';
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
  ui, go, render, renderList,
  doLogin, logout,
  carForm, onTipo, autoCuota, saveCar, delCar, toggleVendido, sugerirAjusteInflacion, sacarDeTaller, setTabAuto, venderAutoForm, confirmarVenta, cronogramaCuotasForm,
  goMas,
  mantenimientoForm, onMantCar, onMantItem, saveMantenimiento, delMantenimiento, editarPlanMantenimiento, guardarPlanMantenimiento, mantAtajoFecha,
  multaForm, onMultaCar, onMultaFecha, onMultaTipo, saveMulta, delMulta,
  siniestroForm, onSiniestroCar, onSiniestroFecha, saveSiniestro, delSiniestro, generarGastoSiniestro,
  reciboPDF, reciboCompartir, descargarReporteEjecutivo, exportarExcel, activarPush, desactivarPush, guardarHorarioPush,
  contratoForm, limpiarFirmaContrato, generarContrato, compartirContrato,
  driverForm, saveDriver, delDriver, addTelRow, toggleInactivo, aprobarProspecto, onFotoPerfil, regenerarLinkPortal, copiarLinkPortal, setTabChofer, liquidacionForm, addConceptoRow, confirmarLiquidacion,
  depositoForm, saveDeposito, delDeposito,
  payForm, onPayCar, savePay, delPay, toggleDepositado,
  closeModal, confirmDel,
  attach, liveCam, closeCam, shoot, viewFile, closeViewer, addLink, onPaste, delFile,
  backup, pickRestore, doRestore, exportCSV, cancelRestore,
  saveAjustes, snoozeAlert, guardarNombreEmpresa, subirLogo, quitarLogo,
  gastoForm, saveGasto, delGasto,
  gastosGeneralesView, gastoGeneralForm, saveGastoGeneral, delGastoGeneral, gastoRecurrenteForm, saveGastoRecurrente, delGastoRecurrente,
  sancionForm, saveSancion, delSancion,
  inspeccionForm, saveInspeccion, delInspeccion,
  proveedoresView, saveProveedor, delProveedor,
  ajusteForm, saveAjuste, delAjuste,
  searchView, doSearch,
  usuariosView, cambiarRol, toggleActivo, auditoriaView, auditCargarMas, auditFiltrar, mapaFlotaView,
  conectarGoogleUI, syncCalendarUI, syncSheetsUI, syncMultasSheetsUI, syncMantenimientoSheetsUI, syncDriveUI,
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
