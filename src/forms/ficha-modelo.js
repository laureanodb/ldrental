// Ficha técnica por modelo: qué aceite, filtros, pastillas, lámparas, cubiertas y batería
// usa cada modelo. Se carga una vez y vale para todos los autos de la misma marca y modelo.
import { S } from '../state.js';
import { esc, iso, today, fdate } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { settings, saveSettings } from '../settings.js';

export const CAMPOS_FICHA = [
  ['aceite', 'Aceite de motor', 'ej: 5W30 sintético, 4 litros'], ['filtroAceite', 'Filtro de aceite', 'marca y código'],
  ['filtroAire', 'Filtro de aire', ''], ['filtroCombustible', 'Filtro de combustible', ''], ['filtroHabitaculo', 'Filtro de habitáculo', ''],
  ['bujias', 'Bujías', ''], ['pastillasDel', 'Pastillas delanteras', ''], ['pastillasTras', 'Pastillas o cintas traseras', ''],
  ['correaDistribucion', 'Kit de distribución', 'código y cada cuántos km'], ['refrigerante', 'Refrigerante', ''], ['liquidoFrenos', 'Líquido de frenos', 'ej: DOT 4'],
  ['cubiertas', 'Medida de cubiertas', 'ej: 185/65 R15'], ['presion', 'Presión de cubiertas', 'ej: 30 adelante / 28 atrás'],
  ['bateria', 'Batería', 'ej: 12x65'], ['lamparas', 'Lámparas', 'ej: H4 delantera, P21W giro'], ['escobillas', 'Escobillas', 'medidas'],
];
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
export const claveModelo = c => (c && c.marca && c.modelo ? norm(c.marca) + '|' + norm(c.modelo) : '');
const fichas = () => settings.fichasModelo || {};
export const fichaDe = c => fichas()[claveModelo(c)] || null;
const llenos = f => (f ? CAMPOS_FICHA.filter(k => (f[k[0]] || '').trim()).length : 0);

// Modelos de la flota, con cuántos autos tiene cada uno.
function modelos() {
  const M = {};
  S.cars.filter(c => !c.vendido && claveModelo(c)).forEach(c => {
    const k = claveModelo(c);
    M[k] = M[k] || { clave: k, nombre: [c.marca, c.modelo].join(' '), autos: [] };
    M[k].autos.push(c);
  });
  return Object.values(M).sort((a, b) => b.autos.length - a.autos.length || a.nombre.localeCompare(b.nombre));
}

export function fichasModeloView() {
  const M = modelos();
  const sinModelo = S.cars.filter(c => !c.vendido && !claveModelo(c)).length;
  let h = '<h3>Ficha técnica por modelo</h3><div class="small muted" style="margin-bottom:10px">Cargá una vez qué repuestos y medidas usa cada modelo y lo ves en la ficha de todos los autos iguales.</div>';
  h += M.length ? M.map(m => {
    const f = fichas()[m.clave], n = llenos(f);
    return '<div class="card tap row between" onclick="fichaModeloForm(\'' + encodeURIComponent(m.clave) + '\')" style="gap:8px"><div style="min-width:0"><b>' + esc(m.nombre) + '</b><div class="small muted">' + m.autos.length + (m.autos.length === 1 ? ' auto' : ' autos') + ': ' + m.autos.map(c => esc(c.patente)).join(', ') + '</div></div>' +
      '<span class="small" style="color:' + (n ? 'var(--ok)' : 'var(--muted)') + ';white-space:nowrap">' + (n ? n + ' de ' + CAMPOS_FICHA.length + ' datos' : 'Sin cargar') + '</span></div>';
  }).join('') : '<div class="card muted">Cargá la marca y el modelo de los autos para armar sus fichas.</div>';
  if (sinModelo) h += '<div class="small muted" style="margin-top:6px">' + sinModelo + (sinModelo === 1 ? ' auto no tiene' : ' autos no tienen') + ' marca y modelo cargados.</div>';
  h += '<button class="btn sec block" style="margin-top:10px" onclick="closeModal()">Cerrar</button>';
  openModal(h);
}
// La clave va codificada en los onclick (puede tener comillas o espacios).
export function fichaModeloForm(claveCod, volverCar) {
  const clave = decodeURIComponent(claveCod);
  const m = modelos().find(x => x.clave === clave);
  const f = fichas()[clave] || {};
  const nombre = m ? m.nombre : (f.nombre || clave.replace('|', ' '));
  let h = '<h3>' + esc(nombre) + '</h3>' +
    '<div class="small muted" style="margin-bottom:10px">' + (m ? 'Vale para ' + m.autos.length + (m.autos.length === 1 ? ' auto: ' : ' autos: ') + m.autos.map(c => esc(c.patente)).join(', ') + '.' : '') + (f.actualizado ? ' Actualizada el ' + fdate(f.actualizado) + '.' : '') + '</div>';
  h += CAMPOS_FICHA.map(([k, l, ph]) => '<label class="f"><span>' + l + '</span><input id="fm_' + k + '" value="' + esc(f[k] || '') + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '></label>').join('') +
    '<label class="f"><span>Notas</span><textarea id="fm_notas" rows="3">' + esc(f.notas || '') + '</textarea></label>' +
    '<div class="row"><button class="btn grow" onclick="guardarFichaModelo(\'' + encodeURIComponent(clave) + '\',\'' + esc(volverCar || '') + '\')">Guardar</button><button class="btn sec" onclick="' + (volverCar ? "carForm('" + esc(volverCar) + "')" : 'fichasModeloView()') + '">Volver</button></div>';
  openModal(h);
}
export function guardarFichaModelo(claveCod, volverCar) {
  const clave = decodeURIComponent(claveCod);
  const m = modelos().find(x => x.clave === clave);
  const f = { nombre: m ? m.nombre : clave, actualizado: iso(today()), notas: (document.getElementById('fm_notas') || {}).value || '' };
  CAMPOS_FICHA.forEach(([k]) => { f[k] = ((document.getElementById('fm_' + k) || {}).value || '').trim(); });
  saveSettings({ fichasModelo: Object.assign({}, fichas(), { [clave]: f }) });
  toast('Ficha guardada');
  if (volverCar) window.carForm(volverCar); else fichasModeloView();
}
// Resumen en la ficha del auto.
export function seccionFichaModelo(c) {
  const k = claveModelo(c); if (!k) return '';
  const f = fichaDe(c), n = llenos(f);
  const resumen = f ? CAMPOS_FICHA.filter(x => (f[x[0]] || '').trim()).slice(0, 4).map(x => x[1] + ': ' + f[x[0]]).join(' · ') : '';
  return '<div class="card row between" style="margin-bottom:10px;gap:8px"><div style="min-width:0"><b>Ficha técnica del ' + esc([c.marca, c.modelo].join(' ')) + '</b><div class="small muted">' + (n ? esc(resumen) + (n > 4 ? ' y ' + (n - 4) + ' más' : '') : 'Sin cargar: aceite, filtros, pastillas, cubiertas…') + '</div></div>' +
    '<button class="btn sec sm" onclick="fichaModeloForm(\'' + encodeURIComponent(k) + '\',\'' + c.id + '\')">' + (n ? 'Ver' : 'Cargar') + '</button></div>';
}
