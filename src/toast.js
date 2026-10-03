// Aviso corto abajo de la pantalla (módulo aparte para que el portal no cargue toda la app).
let toastT;
export function toast(m, type) {
  let t = document.querySelector('.toast'); if (t) t.remove();
  const esError = type === 'error' || /^no se pudo|error al|inválid|falta[n]?\s/i.test(m);
  t = document.createElement('div'); t.className = 'toast ' + (esError ? 'bad' : 'ok');
  t.textContent = (esError ? '⚠ ' : '✓ ') + m;
  document.body.appendChild(t);
  clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 3200);
}
