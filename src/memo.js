// Índices y memoria de cálculos para que la app no recorra todos los cobros
// (o gastos, multas…) cada vez que necesita los de un solo auto o chofer.
// Los índices se rehacen solos cuando cambia la colección: si se reemplaza el
// array, si cambia su largo, o cuando data.js avisa con tocarDatos().
import { S } from './state.js';

let version = 0;
const indices = new Map();
const pasada = new Map();

// Llamar cada vez que se modifica un registro en el lugar (putLocal).
export function tocarDatos() { version++; pasada.clear(); }
// Al empezar cada render: los cálculos memorizados valen para un solo dibujo.
export function nuevaPasada() { pasada.clear(); }

function indice(col, campo) {
  const arr = S[col] || [];
  const k = col + '\u0000' + campo;
  let e = indices.get(k);
  if (!e || e.arr !== arr || e.len !== arr.length || e.v !== version) {
    const map = new Map();
    for (const x of arr) {
      const v = x[campo];
      const l = map.get(v);
      if (l) l.push(x); else map.set(v, [x]);
    }
    e = { arr, len: arr.length, v: version, map };
    indices.set(k, e);
  }
  return e.map;
}

const VACIO = Object.freeze([]);
// Registros de la colección cuyo campo vale `valor`, en el mismo orden que S[col].
// No modificar el array devuelto.
export const de = (col, campo, valor) => indice(col, campo).get(valor) || VACIO;

// Memoriza el resultado de fn durante el render actual (o hasta el próximo cambio de datos).
export function enPasada(clave, fn) {
  if (pasada.has(clave)) return pasada.get(clave);
  const v = fn();
  pasada.set(clave, v);
  return v;
}
