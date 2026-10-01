// Dólar del día (dolarapi.com) para mostrar en pesos lo de los financiados
// y convertir a dólares una cuota que se paga en pesos. Se elige la
// cotización (blue, oficial, MEP...) y si se usa compra o venta en Ajustes;
// también se puede fijar un valor a mano. La última cotización queda guardada
// para usarla sin conexión.
import { settings } from './settings.js';

export const CASAS_DOLAR = [['blue', 'Blue'], ['oficial', 'Oficial'], ['bolsa', 'MEP (bolsa)'], ['contadoconliqui', 'Contado con liqui'], ['mayorista', 'Mayorista'], ['tarjeta', 'Tarjeta']];
const KEY = 'flota-dolar';
const URL_DOLAR = 'https://dolarapi.com/v1/dolares';
let lista = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } })();

export async function cargarDolar(forzar) {
  if (!forzar && lista && Date.now() - lista.t < 30 * 60e3) return lista;
  try {
    const r = await fetch(URL_DOLAR);
    if (!r.ok) return lista;
    const datos = await r.json();
    if (!Array.isArray(datos) || !datos.length) return lista;
    lista = { t: Date.now(), datos };
    try { localStorage.setItem(KEY, JSON.stringify(lista)); } catch (e) {}
  } catch (e) { /* sin conexión: queda la última guardada */ }
  return lista;
}
// Cotización en uso: { valor, nombre, fecha, manual } o null si todavía no hay ninguna.
export function cotizacion() {
  const manual = +settings.dolarManual || 0;
  if (manual > 0) return { valor: manual, nombre: 'fijado a mano', fecha: '', manual: true };
  if (!lista) return null;
  const casa = settings.tipoDolar || 'blue';
  const x = lista.datos.find(d => d.casa === casa);
  if (!x) return null;
  const valor = +(settings.dolarPrecio === 'compra' ? x.compra : x.venta) || 0;
  if (!valor) return null;
  return { valor, nombre: (CASAS_DOLAR.find(c => c[0] === casa) || [0, x.nombre])[1] + ' ' + (settings.dolarPrecio === 'compra' ? 'compra' : 'venta'), fecha: x.fechaActualizacion || '', manual: false };
}
export function enPesos(usd) {
  const c = cotizacion();
  return c ? Math.round((+usd || 0) * c.valor) : null;
}
export function textoCotizacion() {
  const c = cotizacion();
  if (!c) return '';
  return 'Dólar ' + c.nombre + ': $ ' + Math.round(c.valor).toLocaleString('es-AR');
}
