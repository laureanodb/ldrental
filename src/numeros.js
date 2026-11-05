// Números escritos como se escriben en Argentina: "360.000" es trescientos sesenta mil
// (no 360), "1.500.000,50" es un millón y medio con 50 centavos. Para que todos los
// formularios lo entiendan sin tocar cada uno, al salir de un campo numérico se
// reescribe el valor en el formato que entiende la app ("360000", "1500000.50").

// Devuelve el texto normalizado, o el mismo texto si no hay nada que cambiar.
export function normalizarNumero(texto) {
  const original = String(texto == null ? '' : texto);
  let s = original.trim().replace(/^(US\$|U\$S|\$)\s*/i, '').replace(/\s+/g, '');
  if (!/[.,]/.test(s) || !/^-?[\d.,]+$/.test(s)) return original;
  const neg = s.startsWith('-'); if (neg) s = s.slice(1);
  const ultPunto = s.lastIndexOf('.'), ultComa = s.lastIndexOf(',');
  if (ultPunto >= 0 && ultComa >= 0) {
    // Los dos: el último que aparece es el decimal ("1.500,50" o "1,500.50").
    s = ultComa > ultPunto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (ultPunto >= 0) {
    // Solo puntos: si van de a tres cifras son de miles ("360.000", "1.500.000").
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    else if ((s.match(/\./g) || []).length > 1) return original;
  } else {
    // Solo comas: "1,5" es decimal; "360,000" o "1,500,000" son de miles.
    if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
    else if ((s.match(/,/g) || []).length > 1) return original;
    else s = s.replace(',', '.');
  }
  return (neg ? '-' : '') + s;
}

const esNumerico = el => el && el.tagName === 'INPUT' && /^(decimal|numeric)$/.test(el.getAttribute('inputmode') || '') && el.type !== 'tel';

function normalizarCampo(el) {
  if (!esNumerico(el)) return;
  const nuevo = normalizarNumero(el.value);
  if (nuevo === el.value) return;
  el.value = nuevo;
  // Para que se recalcule lo que depende del campo (cuotas, avisos de monto).
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
export function instalarNormalizadorNumeros() {
  // Al salir del campo…
  document.addEventListener('change', e => normalizarCampo(e.target), true);
  // …y antes de cualquier botón (en algunos celulares tocar Guardar no saca el foco del campo).
  document.addEventListener('click', e => {
    if (!e.target.closest || !e.target.closest('button, [onclick]')) return;
    document.querySelectorAll('input[inputmode="decimal"], input[inputmode="numeric"]').forEach(normalizarCampo);
  }, true);
}
