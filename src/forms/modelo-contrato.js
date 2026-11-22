// Modelo de contrato: cláusulas propias (las que revise el abogado), quién lo revisó y
// número de versión. Cada vez que cambia el texto, sube la versión; cada contrato guarda
// con qué versión se hizo, así sabés qué firmó cada chofer.
import { S } from '../state.js';
import { esc, iso, today, fdate } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { settings, saveSettings } from '../settings.js';
import { isAdmin } from '../roles.js';
import { modeloContrato } from '../contrato.js';
import { driverName } from '../calc.js';

export function modeloContratoForm() {
  if (!isAdmin()) { toast('Solo un administrador puede cambiar esto'); return; }
  const m = modeloContrato();
  openModal('<h3>Modelo de contrato</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Las cláusulas básicas (vehículo, inicio, monto, multas, depósito, uso y rescisión) las arma la app con los datos de cada auto. Acá agregás las tuyas. Cuando cambiás el texto, la versión sube sola.</div>' +
    '<div class="card row between" style="margin-bottom:10px"><span>Versión vigente</span><b>v' + m.version + '</b></div>' +
    '<label class="f"><span>Cláusulas adicionales <small>una por párrafo, separadas por una línea en blanco</small></span><textarea id="mc_texto" rows="10" placeholder="Ej: El chofer no podrá ceder el uso del vehículo a terceros.">' + esc(m.clausulas.join('\n\n')) + '</textarea></label>' +
    '<div class="two"><label class="f"><span>Revisado por <small>abogado/a</small></span><input id="mc_por" value="' + esc(m.revisadoPor) + '" placeholder="Dra. …"></label>' +
    '<label class="f"><span>Fecha de revisión</span><input id="mc_el" type="date" value="' + esc(m.revisadoEl) + '"></label></div>' +
    '<div class="row"><button class="btn grow" onclick="guardarModeloContrato()">Guardar</button><button class="btn sec" onclick="closeModal()">Cerrar</button></div>' +
    '<button class="btn sec block" style="margin-top:8px" onclick="verificarVersionesContrato()">Qué versión firmó cada chofer</button>');
}
export function guardarModeloContrato() {
  const m = modeloContrato();
  const clausulas = ((document.getElementById('mc_texto') || {}).value || '').split(/\n\s*\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const por = ((document.getElementById('mc_por') || {}).value || '').trim(), el = (document.getElementById('mc_el') || {}).value || '';
  const cambio = JSON.stringify(clausulas) !== JSON.stringify(m.clausulas);
  const version = cambio ? m.version + 1 : m.version;
  const hist = (settings.contratoModelo && settings.contratoModelo.historial) || [];
  saveSettings({ contratoModelo: { version, clausulas, revisadoPor: por, revisadoEl: el, historial: cambio ? hist.concat([{ version: m.version, clausulas: m.clausulas, hasta: iso(today()) }]).slice(-20) : hist } });
  toast(cambio ? 'Modelo guardado: ahora es la versión ' + version : 'Modelo guardado'); modeloContratoForm();
}
export function verificarVersionesContrato() {
  const v = modeloContrato().version;
  const filas = [];
  S.cars.filter(c => c.choferId && !c.vendido && (c.tipo === 'alquiler' || c.tipo === 'financiado')).forEach(c => {
    const h = (c.contratoHistorial || []).filter(x => !x.choferId || x.choferId === c.choferId).slice(-1)[0];
    filas.push({ c, h, al: h && +h.versionModelo === v });
  });
  filas.sort((a, b) => Number(a.al) - Number(b.al));
  openModal('<h3>Qué versión firmó cada chofer</h3><div class="small muted" style="margin-bottom:10px">Versión vigente: v' + v + '. Los que firmaron una anterior (o no tienen contrato registrado) aparecen primero.</div>' +
    (filas.length ? filas.map(({ c, h, al }) => '<div class="card row between small"><span><b>' + esc(driverName(c.choferId)) + '</b> · ' + esc(c.patente) + '</span><span style="color:' + (al ? 'var(--ok)' : 'var(--warn)') + '">' +
      (h ? (h.versionModelo ? 'v' + h.versionModelo : 'sin versión') + ' · ' + fdate(h.fecha) : 'sin contrato') + '</span></div>').join('') : '<div class="small muted">No hay contratos activos.</div>') +
    '<button class="btn sec block" style="margin-top:10px" onclick="modeloContratoForm()">Volver</button>');
}
