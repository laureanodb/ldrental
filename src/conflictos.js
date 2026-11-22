// Cuando dos personas cambian el mismo registro a la vez: en vez de que el último
// borre sin querer lo del otro, se combinan los cambios si tocaron cosas distintas,
// y si tocaron lo mismo se pregunta qué hacer.
import { esc } from './utils.js';

const igual = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
// Campos que cambió cada uno respecto de la versión que tenían los dos.
export function camposCambiados(base, nuevo) {
  const ks = new Set(Object.keys(base || {}).concat(Object.keys(nuevo || {})));
  ks.delete('id');
  return [...ks].filter(k => !igual((base || {})[k], (nuevo || {})[k]));
}
// Junta lo del servidor con lo mío (solo los campos que cambié yo).
export function combinar(servidor, mio, base) {
  const out = Object.assign({}, servidor);
  camposCambiados(base, mio).forEach(k => { if (mio[k] === undefined) delete out[k]; else out[k] = mio[k]; });
  out.id = mio.id;
  return out;
}

const NOMBRES = {
  monto: 'monto', inicio: 'inicio del contrato', choferId: 'chofer', tipo: 'estado', km: 'kilometraje', kmHistorial: 'historial de km', ajustesDeuda: 'ajustes de deuda',
  files: 'archivos', notas: 'notas', fecha: 'fecha', costo: 'costo', estado: 'estado', tel: 'teléfono', nombre: 'nombre', danos: 'daños', ordenes: 'órdenes de taller',
  turnosService: 'turnos de service', mantenimientoPlan: 'plan de mantenimiento', valorSemanal: 'valor semanal', seguro: 'vencimiento del seguro', vtv: 'vencimiento de la VTV',
};
const nombreCampo = k => NOMBRES[k] || k.replace(/([A-Z])/g, ' $1').toLowerCase();

// Pregunta qué hacer cuando los dos cambiaron lo mismo. Devuelve 'mio' o 'suyo'.
export function preguntarConflicto(campos) {
  return new Promise(resolve => {
    const m = document.getElementById('modal2');
    if (!m) { resolve('mio'); return; }
    m.innerHTML = '<div class="scrim"></div><div class="sheet" role="alertdialog" aria-modal="true"><h3>Alguien cambió esto mientras lo editabas</h3>' +
      '<div class="small muted" style="margin-bottom:10px">Otra persona del equipo (o el chofer desde el portal) guardó cambios en este mismo registro hace un momento. Los dos tocaron: <b>' + campos.map(k => esc(nombreCampo(k))).join(', ') + '</b>.</div>' +
      '<div class="small muted" style="margin-bottom:12px">Lo demás que cambió la otra persona se conserva igual.</div>' +
      '<button class="btn block" id="cf_mio" style="margin-bottom:8px">Guardar lo mío en esos datos</button>' +
      '<button class="btn sec block" id="cf_suyo">Dejar lo de la otra persona</button></div>';
    m.classList.add('open');
    const fin = r => { m.classList.remove('open'); m.innerHTML = ''; resolve(r); };
    m.querySelector('#cf_mio').onclick = () => fin('mio');
    m.querySelector('#cf_suyo').onclick = () => fin('suyo');
  });
}
