// Validaciones de datos argentinos: DNI, CUIT, CBU, patentes y teléfonos.
// Sirven para frenar errores de tipeo antes de guardar.

const digitos = s => String(s || '').replace(/\D/g, '');

export function dniValido(s) { const d = digitos(s); return d.length >= 7 && d.length <= 8; }

// CUIT/CUIL: 11 dígitos, el último es verificador (módulo 11).
export function cuitValido(s) {
  const d = digitos(s);
  if (d.length !== 11) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((a, p, i) => a + p * +d[i], 0);
  let v = 11 - (suma % 11);
  if (v === 11) v = 0;
  if (v === 10) return false;
  return v === +d[10];
}

// CBU/CVU: 22 dígitos en dos bloques, cada uno con su dígito verificador.
export function cbuValido(s) {
  const d = digitos(s);
  if (d.length !== 22) return false;
  const bloque = (num, pesos) => { const suma = pesos.reduce((a, p, i) => a + p * +num[i], 0); return (10 - (suma % 10)) % 10; };
  const b1 = d.slice(0, 8), b2 = d.slice(8);
  return bloque(b1, [7, 1, 3, 9, 7, 1, 3]) === +b1[7] && bloque(b2, [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]) === +b2[13];
}

// Patentes argentinas: Mercosur (AB 123 CD), vieja (ABC 123) y motos (A123BCD / 123ABC).
export function patenteValida(s) {
  const p = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p) || /^[A-Z]{3}\d{3}$/.test(p) || /^[A-Z]\d{3}[A-Z]{3}$/.test(p) || /^\d{3}[A-Z]{3}$/.test(p);
}

// Teléfono argentino al formato de WhatsApp: +54 9 + código de área sin 0 + número sin 15.
// Si no se puede interpretar con seguridad, devuelve el texto como estaba.
export function normalizarTelAR(s) {
  const original = String(s || '').trim();
  if (!original) return '';
  let d = digitos(original);
  if (original.startsWith('+') && !d.startsWith('54')) return original; // número de otro país
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9') && d.length === 11) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  // Código de área de 2, 3 o 4 cifras seguido de 15: se saca el 15.
  if (d.length === 12) {
    for (const largo of [2, 3, 4]) if (d.slice(largo, largo + 2) === '15') { d = d.slice(0, largo) + d.slice(largo + 2); break; }
  }
  if (d.length !== 10) return original;
  return '+549' + d;
}
// Para comparar teléfonos escritos distinto: los últimos 8 dígitos.
export const mismoTel = (a, b) => { const x = digitos(a), y = digitos(b); return x.length >= 8 && y.length >= 8 && x.slice(-8) === y.slice(-8); };
export const mismoDni = (a, b) => { const x = digitos(a), y = digitos(b); return x.length >= 7 && x === y; };

// Confirmación con un segundo toque: la primera vez avisa, la segunda deja seguir.
const armados = new Map();
export function avisarUnaVez(clave, mensaje, toast) {
  const t = armados.get(clave);
  if (t && Date.now() - t < 8000) { armados.delete(clave); return false; }
  armados.set(clave, Date.now());
  toast(mensaje + ' Tocá Guardar otra vez para guardar igual.');
  return true;
}
