import './styles.css';

import { ui } from './state.js';
import { init } from './session.js';
import { go, render, renderList } from './nav.js';
import { doLogin, logout } from './session.js';
import { carForm, onTipo, autoCuota, saveCar, delCar, toggleVendido, sugerirAjusteInflacion, sacarDeTaller } from './forms/car.js';
import { mantenimientoForm, onMantItem, saveMantenimiento, delMantenimiento } from './forms/mantenimiento.js';
import { multaForm, onMultaCar, onMultaFecha, saveMulta, delMulta } from './forms/multa.js';
import { driverForm, saveDriver, delDriver, addTelRow, toggleInactivo } from './forms/driver.js';
import { payForm, onPayCar, savePay, delPay } from './forms/payment.js';
import { closeModal, confirmDel } from './modal.js';
import { attach, liveCam, closeCam, shoot, viewFile, closeViewer, addLink, onPaste, delFile } from './files.js';
import { backup, pickRestore, doRestore, exportCSV, cancelRestore } from './backup.js';
import { saveAjustes, snoozeAlert } from './views/shared.js';
import { gastoForm, saveGasto, delGasto } from './forms/gasto.js';
import { sancionForm, saveSancion, delSancion } from './forms/sancion.js';
import { inspeccionForm, saveInspeccion, delInspeccion } from './forms/inspeccion.js';
import { proveedoresView, saveProveedor, delProveedor } from './forms/proveedor.js';
import { ajusteForm, saveAjuste, delAjuste } from './forms/ajuste.js';
import { searchView, doSearch } from './forms/search.js';
import { flushQueue } from './data.js';
import { usuariosView, cambiarRol, toggleActivo } from './forms/usuarios.js';
import { conectarGoogleUI } from './views/google-ui.js';
import { googleConfigured, loadGis } from './google.js';
import { syncCalendarUI } from './google-calendar.js';
import { syncSheetsUI, syncMultasSheetsUI } from './google-sheets.js';
import { syncDriveUI } from './google-drive.js';

/* Las plantillas HTML generadas usan atributos inline (onclick, oninput, …)
   que se resuelven en el scope global, así que las funciones que referencian
   necesitan quedar colgadas de window. */
Object.assign(window, {
  ui, go, render, renderList,
  doLogin, logout,
  carForm, onTipo, autoCuota, saveCar, delCar, toggleVendido, sugerirAjusteInflacion, sacarDeTaller,
  mantenimientoForm, onMantItem, saveMantenimiento, delMantenimiento,
  multaForm, onMultaCar, onMultaFecha, saveMulta, delMulta,
  driverForm, saveDriver, delDriver, addTelRow, toggleInactivo,
  payForm, onPayCar, savePay, delPay,
  closeModal, confirmDel,
  attach, liveCam, closeCam, shoot, viewFile, closeViewer, addLink, onPaste, delFile,
  backup, pickRestore, doRestore, exportCSV, cancelRestore,
  saveAjustes, snoozeAlert,
  gastoForm, saveGasto, delGasto,
  sancionForm, saveSancion, delSancion,
  inspeccionForm, saveInspeccion, delInspeccion,
  proveedoresView, saveProveedor, delProveedor,
  ajusteForm, saveAjuste, delAjuste,
  searchView, doSearch,
  usuariosView, cambiarRol, toggleActivo,
  conectarGoogleUI, syncCalendarUI, syncSheetsUI, syncMultasSheetsUI, syncDriveUI,
});

window.addEventListener('online', () => { flushQueue(); render(); });
window.addEventListener('offline', () => render());

if (googleConfigured()) loadGis().catch(() => {});

init();
