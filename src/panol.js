// Pañol: cálculos de stock valorizado, consumo y reposición.
// Los ítems viven en la colección `repuestos` (consumibles, repuestos y herramientas).
import { S } from './state.js';
import { STOCK_CATEGORIAS, STOCK_UNIDADES, PANOL_TIPOS } from './constants.js';
import { today, iso, parse, days } from './utils.js';
import { settings } from './settings.js';
import { de } from './memo.js';

export const catLabel = k => (STOCK_CATEGORIAS.find(x => x[0] === k) || [0, 'Otro'])[1];
export const unidadLabel = k => (STOCK_UNIDADES.find(x => x[0] === k) || [0, 'Unidad'])[1];
export const tipoLabel = k => (PANOL_TIPOS.find(x => x[0] === k) || [0, 'Repuesto'])[1];
export const tipoPorCategoria = cat => (STOCK_CATEGORIAS.find(x => x[0] === cat) || [0, 0, 'repuesto'])[2];
// Los ítems cargados antes del pañol no tienen tipo: se deduce de la categoría.
export const tipoDe = r => r.tipo || tipoPorCategoria(r.categoria);
export const unidades = (r, n) => unidadLabel(r.unidad).toLowerCase() + (Math.abs(+n) === 1 ? '' : (/[aeiou]$/.test(unidadLabel(r.unidad).toLowerCase()) ? 's' : 'es'));

// Cuánto suma o resta cada movimiento al stock. Un ajuste (inventario, stock inicial) trae el signo en la cantidad.
export const deltaMov = m => (m.tipo === 'entrada' ? +m.cantidad || 0 : m.tipo === 'ajuste' ? +m.cantidad || 0 : -(+m.cantidad || 0));

export const stockDe = r => +r.stockActual || 0;
// Costo promedio ponderado (lo que realmente te costó lo que tenés).
export const costoDe = r => +r.costoUnitario || 0;
function ultimaCompra(r) {
  let u = null;
  (r.movimientos || []).forEach(m => { if (m.tipo === 'entrada' && +m.costoUnitario > 0 && (!u || m.fecha >= u.fecha)) u = m; });
  return u;
}
// Precio de reposición: lo que cuesta hoy volver a comprarlo (cargado a mano o el de la última compra).
export function precioReposicion(r) {
  const u = ultimaCompra(r);
  const manual = +r.precioReposicion || 0;
  if (manual && (!u || !r.precioReposicionFecha || r.precioReposicionFecha >= u.fecha)) return manual;
  return u ? +u.costoUnitario : (manual || costoDe(r));
}
export function fechaPrecioReposicion(r) {
  const u = ultimaCompra(r);
  if (+r.precioReposicion && (!u || !r.precioReposicionFecha || r.precioReposicionFecha >= u.fecha)) return r.precioReposicionFecha || '';
  return u ? u.fecha : '';
}
export const valorItem = (r, modo) => Math.max(stockDe(r), 0) * (modo === 'reposicion' ? precioReposicion(r) : costoDe(r));

// Nuevo costo promedio al comprar `cant` a `precio`.
export function costoPromedioNuevo(r, cant, precio) {
  const st = Math.max(stockDe(r), 0), c = costoDe(r);
  if (!precio) return c;
  if (st + cant <= 0) return precio;
  return (st * c + cant * precio) / (st + cant);
}

export const itemsActivos = () => S.repuestos.filter(r => !r.inactivo);

/* Consumo diario promedio de los últimos `dias` (salidas por uso). Si el ítem es más nuevo,
   se divide por los días que lleva cargado (mínimo 14 para no exagerar con pocos datos). */
export function consumoDiario(r, dias = 90) {
  const desde = new Date(today()); desde.setDate(desde.getDate() - dias);
  const d0 = iso(desde);
  let total = 0, primera = null;
  (r.movimientos || []).forEach(m => {
    if (!primera || m.fecha < primera) primera = m.fecha;
    if (m.tipo === 'salida' && m.fecha >= d0 && !m.baja && !m.venta) total += +m.cantidad || 0;
  });
  if (!total) return 0;
  const inicio = [r.creadoFecha, primera].filter(Boolean).sort()[0];
  const lleva = inicio ? days(parse(inicio), today()) : dias;
  return total / Math.max(14, Math.min(dias, lleva || dias));
}
// Días que alcanza el stock al ritmo de consumo actual (null si no se usa).
export function coberturaDias(r) {
  const c = consumoDiario(r);
  if (!c) return null;
  return Math.max(0, Math.floor(stockDe(r) / c));
}
export const stockBajoPanol = r => tipoDe(r) !== 'herramienta' ? stockDe(r) <= (+r.stockMinimo || 0) : (+r.stockMinimo > 0 && stockDe(r) < +r.stockMinimo);
// Se está por acabar: bajo el mínimo o le quedan menos de 10 días al ritmo de consumo.
export function porReponer(r) {
  if (stockBajoPanol(r)) return true;
  const cob = coberturaDias(r);
  return cob != null && cob < 10;
}
// Cantidad sugerida para cubrir el mínimo y los días de cobertura configurados.
export function sugeridoCompra(r) {
  const objetivo = Math.max(+r.stockMinimo || 0, Math.ceil(consumoDiario(r) * (+settings.panolCoberturaDias || 30)));
  return Math.max(Math.ceil(objetivo - stockDe(r)), 1);
}

const nombreProveedor = id => (id ? ((de('proveedores', 'id', id)[0] || {}).nombre || 'Proveedor') : 'Sin proveedor asignado');
export function listaCompraPanol() {
  const grupos = {};
  itemsActivos().filter(r => tipoDe(r) !== 'herramienta' || stockBajoPanol(r)).filter(porReponer).forEach(r => {
    const key = r.proveedorId || '';
    if (!grupos[key]) grupos[key] = { proveedorId: key, proveedorNombre: nombreProveedor(key), items: [], total: 0 };
    const sugerido = sugeridoCompra(r), precio = precioReposicion(r);
    grupos[key].items.push({ r, sugerido, precio, subtotal: sugerido * precio, cobertura: coberturaDias(r) });
    grupos[key].total += sugerido * precio;
  });
  return Object.values(grupos).sort((a, b) => (a.proveedorId ? 0 : 1) - (b.proveedorId ? 0 : 1) || a.proveedorNombre.localeCompare(b.proveedorNombre));
}

// Fecha del último movimiento (o del alta): sirve para detectar plata inmovilizada.
export function ultimoMovimiento(r) {
  let f = r.creadoFecha || null;
  (r.movimientos || []).forEach(m => { if (!f || m.fecha > f) f = m.fecha; });
  return f;
}
export function diasQuieto(r) { const f = ultimoMovimiento(r); return f ? days(parse(f), today()) : null; }

export function resumenPanol(modo) {
  const R = { total: 0, items: 0, porTipo: {}, porCategoria: {}, porUbicacion: {}, bajos: 0, quieto: 0, quietoItems: 0, prestadas: 0, top: [] };
  PANOL_TIPOS.forEach(([k]) => { R.porTipo[k] = { valor: 0, items: 0 }; });
  const L = itemsActivos();
  L.forEach(r => {
    const v = valorItem(r, modo), t = tipoDe(r);
    R.total += v; R.items++;
    R.porTipo[t].valor += v; R.porTipo[t].items++;
    R.porCategoria[r.categoria || 'otro'] = (R.porCategoria[r.categoria || 'otro'] || 0) + v;
    const ub = (r.ubicacion || '').trim() || 'Sin ubicación';
    R.porUbicacion[ub] = (R.porUbicacion[ub] || 0) + v;
    if (stockBajoPanol(r)) R.bajos++;
    const q = diasQuieto(r);
    if (stockDe(r) > 0 && t !== 'herramienta' && q != null && q >= 90) { R.quieto += v; R.quietoItems++; }
    if (t === 'herramienta' && r.prestadaA) R.prestadas++;
  });
  R.top = L.map(r => ({ r, v: valorItem(r, modo) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 5);
  return R;
}

// Plata que se fue en consumibles y repuestos cada mes (salidas valorizadas al costo de ese momento).
export function consumoPorMes(meses = 6) {
  const hoy = today();
  const claves = [];
  for (let i = meses - 1; i >= 0; i--) { const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1); claves.push(iso(d).slice(0, 7)); }
  const out = claves.map(k => ({ mes: k, consumible: 0, repuesto: 0, herramienta: 0 }));
  const idx = Object.fromEntries(claves.map((k, i) => [k, i]));
  S.repuestos.forEach(r => (r.movimientos || []).forEach(m => {
    if (m.tipo !== 'salida' || m.venta) return;
    const i = idx[(m.fecha || '').slice(0, 7)];
    if (i == null) return;
    out[i][tipoDe(r)] += (+m.cantidad || 0) * (+m.costoUnitario || costoDe(r));
  }));
  return out;
}

export function modelosFlota() {
  const set = new Set();
  S.cars.filter(c => !c.vendido).forEach(c => { const k = [c.marca, c.modelo].filter(Boolean).join(' ').trim(); if (k) set.add(k); });
  return [...set].sort((a, b) => a.localeCompare(b));
}
export const modeloDe = c => [c.marca, c.modelo].filter(Boolean).join(' ').trim();
export function esCompatible(r, c) {
  const L = r.compatibles || [];
  return !L.length || !c || L.includes(modeloDe(c));
}

// Ventas del pañol del mes (ingreso, costo y ganancia).
export function ventasPanolMes(mes) {
  const m = mes || iso(today()).slice(0, 7);
  const R = { ingreso: 0, costo: 0, n: 0 };
  S.repuestos.forEach(r => (r.movimientos || []).forEach(x => {
    if (!x.venta || (x.fecha || '').slice(0, 7) !== m) return;
    R.ingreso += (+x.cantidad || 0) * (+x.venta.precioUnit || 0);
    R.costo += (+x.cantidad || 0) * (+x.costoUnitario || costoDe(r));
    R.n++;
  }));
  R.ganancia = R.ingreso - R.costo;
  return R;
}
