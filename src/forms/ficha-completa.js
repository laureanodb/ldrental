// Ficha completa al %: qué datos tiene cargados cada auto y cada chofer y qué le falta.
// Sirve mientras se carga la flota: en cada ficha se ve el porcentaje, y en
// Más → Datos que faltan cargar está la lista general, ordenada de lo más incompleto a lo más completo.
import { S } from '../state.js';
import { esc } from '../utils.js';
import { openModal } from '../modal.js';
import { isContract } from '../calc.js';
import { de } from '../memo.js';

const tiene = v => v != null && String(v).trim() !== '' && v !== 0;
const archivo = (x, cats) => (x.files || []).some(f => cats.includes(f.cat));

// [dato, ¿está?, dónde se carga]
export function camposAuto(c) {
  const L = [
    ['Patente', tiene(c.patente), 'Datos'], ['Marca', tiene(c.marca), 'Datos'], ['Modelo', tiene(c.modelo), 'Datos'],
    ['Año', tiene(c.anio), 'Datos'], ['Cilindrada', tiene(c.cilindrada), 'Datos'], ['Color', tiene(c.color), 'Datos'],
    ['Chasis (VIN)', tiene(c.vin), 'Datos'], ['Número de motor', tiene(c.numeroMotor), 'Datos'], ['Kilometraje', +c.km > 0, 'Datos'],
    ['Combustible', tiene(c.combustible), 'Datos'],
    ['Costo de compra', +c.costoCompra > 0, 'Datos'], ['Fecha de compra', tiene(c.fechaCompra), 'Datos'], ['Valor de mercado', +c.valorMercado > 0, 'Datos'],
    ['Aseguradora', tiene(c.aseguradora), 'Seguro'], ['Vencimiento del seguro', tiene(c.seguro), 'Seguro'],
    ['Monto mensual del seguro', +c.seguroMensual > 0 || c.seguroPaga === 'chofer', 'Seguro'], ['Patente: monto mensual', +c.patenteMensual > 0, 'Datos'],
    ['Vencimiento de la VTV', tiene(c.vtv), 'Datos'],
    ['Copia del título', archivo(c, ['titulo']), 'Archivos'], ['Copia de la cédula', archivo(c, ['cedula']), 'Archivos'],
    ['Copia de la póliza', archivo(c, ['seguro', 'seguroCredencial', 'seguroCertificado']), 'Archivos'],
    ['Último service', (c.mantenimientoPlan || []).some(p => p.ultimaFecha || +p.ultimoKm > 0) || de('mantenimientos', 'carId', c.id).some(m => m.carId === c.id), 'Mantenimiento'],
  ];
  if (isContract(c)) L.push(['Chofer', tiene(c.choferId), 'Contrato'], ['Monto semanal', +c.monto > 0, 'Contrato'], ['Inicio del contrato', tiene(c.inicio), 'Contrato']);
  return L;
}
export function camposChofer(d) {
  const docs = d.docs || {};
  return [
    ['Nombre y apellido', tiene(d.nombre), 'Datos'], ['Teléfono', tiene(d.tel), 'Datos'], ['DNI', tiene(d.dni), 'Datos'],
    ['Fecha de nacimiento', tiene(d.fechaNacimiento), 'Datos'], ['Domicilio', tiene(d.domicilio), 'Datos'],
    ['Vencimiento de la licencia', tiene(d.licVenc), 'Datos'], ['Tipo de licencia', tiene(d.tipoLicencia), 'Datos'],
    ['Vencimiento de antecedentes', tiene(d.antecedentesVenc), 'Datos'], ['Contacto de emergencia', tiene(d.contactoEmergencia && d.contactoEmergencia.tel), 'Datos'],
    ['Garante', tiene(d.garanteNombre), 'Datos'], ['Desde cuándo trabaja con vos', tiene(d.fechaIngreso), 'Datos'],
    ['DNI (copia)', !!docs.dni || archivo(d, ['dni']), 'Documentación'], ['Licencia (copia)', !!docs.lic || archivo(d, ['lic']), 'Documentación'],
    ['Comprobante de domicilio', !!docs.dom || archivo(d, ['dom']), 'Documentación'], ['Certificado de antecedentes', !!docs.ant || archivo(d, ['ant']), 'Documentación'],
    ['Contrato firmado', !!docs.contrato || archivo(d, ['contrato']), 'Documentación'], ['Link del portal', tiene(d.portalToken), 'Portal'],
  ];
}
export function porcentaje(L) { return L.length ? Math.round(L.filter(x => x[1]).length / L.length * 100) : 100; }
const color = p => (p >= 90 ? 'var(--ok)' : p >= 60 ? 'var(--warn)' : 'var(--bad)');
const barra = p => '<div style="background:var(--soft);border-radius:6px;height:8px;overflow:hidden;flex:1;min-width:60px"><div style="width:' + p + '%;height:100%;background:' + color(p) + '"></div></div>';

// Para la cabecera de la ficha: solo aparece si falta algo.
export function fichaCompletaCard(L) {
  const p = porcentaje(L), faltan = L.filter(x => !x[1]);
  if (!faltan.length) return '';
  const porSeccion = {};
  faltan.forEach(x => { (porSeccion[x[2]] = porSeccion[x[2]] || []).push(x[0]); });
  return '<details class="card" style="margin-bottom:10px"><summary class="row between" style="gap:10px;cursor:pointer"><span class="small">Ficha completa <b style="color:' + color(p) + '">' + p + '%</b></span>' + barra(p) +
    '<span class="small muted">' + faltan.length + (faltan.length === 1 ? ' dato' : ' datos') + ' por cargar</span></summary>' +
    Object.entries(porSeccion).map(([sec, L2]) => '<div class="small" style="margin-top:6px"><span class="muted">' + esc(sec) + ':</span> ' + L2.map(esc).join(' · ') + '</div>').join('') + '</details>';
}

const autosActivos = () => S.cars.filter(c => !c.vendido);
const choferesActivos = () => S.drivers.filter(d => !d.inactivo && !d.prospecto);
let pestaña = 'autos';
export function datosFaltantesView(p) {
  if (p) pestaña = p;
  const filas = pestaña === 'autos'
    ? autosActivos().map(c => ({ id: c.id, nombre: c.patente || 'Auto sin patente', sub: [c.marca, c.modelo].filter(Boolean).join(' '), L: camposAuto(c), abrir: "carForm('" + c.id + "')" }))
    : choferesActivos().map(d => ({ id: d.id, nombre: d.nombre || 'Sin nombre', sub: '', L: camposChofer(d), abrir: "driverForm('" + d.id + "')" }));
  filas.forEach(f => { f.p = porcentaje(f.L); f.faltan = f.L.filter(x => !x[1]).map(x => x[0]); });
  filas.sort((a, b) => a.p - b.p || String(a.nombre).localeCompare(String(b.nombre)));
  const prom = filas.length ? Math.round(filas.reduce((s, f) => s + f.p, 0) / filas.length) : 100;
  const completos = filas.filter(f => f.p === 100).length;
  // Lo que más falta en toda la flota, para cargarlo de una pasada.
  const cuenta = {};
  filas.forEach(f => f.faltan.forEach(n => { cuenta[n] = (cuenta[n] || 0) + 1; }));
  const top = Object.entries(cuenta).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const tab = (k, t) => '<button class="btn ' + (pestaña === k ? '' : 'sec ') + 'sm grow" onclick="datosFaltantesView(\'' + k + '\')">' + t + '</button>';
  let h = '<h3>Datos que faltan cargar</h3>' +
    '<div class="row" style="margin-bottom:10px">' + tab('autos', 'Autos (' + autosActivos().length + ')') + tab('choferes', 'Choferes (' + choferesActivos().length + ')') + '</div>';
  if (!filas.length) { openModal(h + '<div class="card">Todavía no hay ' + (pestaña === 'autos' ? 'autos' : 'choferes') + ' cargados.</div><button class="btn sec block" onclick="closeModal()">Cerrar</button>'); return; }
  h += '<div class="grid" style="margin-bottom:10px"><div class="kpi"><div class="n" style="color:' + color(prom) + '">' + prom + '%</div><div class="l">Completo en promedio</div></div>' +
    '<div class="kpi"><div class="n">' + completos + ' de ' + filas.length + '</div><div class="l">Con la ficha completa</div></div></div>';
  if (top.length) h += '<div class="card" style="margin-bottom:10px"><div class="small muted" style="margin-bottom:4px">Lo que más falta</div>' +
    top.map(([n, k]) => '<div class="row between small" style="padding:2px 0"><span>' + esc(n) + '</span><b>' + k + (pestaña === 'autos' ? (k === 1 ? ' auto' : ' autos') : (k === 1 ? ' chofer' : ' choferes')) + '</b></div>').join('') + '</div>';
  h += filas.map(f => '<div class="card tap" onclick="' + f.abrir + '"><div class="row between" style="gap:10px"><div style="min-width:0"><b>' + esc(f.nombre) + '</b>' + (f.sub ? ' <span class="small muted">' + esc(f.sub) + '</span>' : '') + '</div>' +
    '<b style="color:' + color(f.p) + '">' + f.p + '%</b></div><div style="margin:6px 0">' + barra(f.p) + '</div>' +
    (f.faltan.length ? '<div class="small muted">Falta: ' + f.faltan.slice(0, 5).map(esc).join(' · ') + (f.faltan.length > 5 ? ' y ' + (f.faltan.length - 5) + ' más' : '') + '</div>' : '<div class="small" style="color:var(--ok)">✓ Completa</div>') +
    '</div>').join('');
  h += '<button class="btn sec block" onclick="closeModal()">Cerrar</button>';
  openModal(h);
}
