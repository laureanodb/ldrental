const KEY = 'flota-modoconsulta-hasta';

export function modoConsultaActivo() {
  try {
    const h = localStorage.getItem(KEY);
    return Boolean(h && h > new Date().toISOString());
  } catch (e) { return false; }
}
export function modoConsultaHasta() {
  try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
}
export function activarModoConsulta(horas) {
  const hasta = new Date(Date.now() + horas * 3600e3).toISOString();
  try { localStorage.setItem(KEY, hasta); } catch (e) {}
}
export function desactivarModoConsulta() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}
