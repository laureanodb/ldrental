// Atajos del ícono de la app: al mantenerlo apretado en el celular aparecen "Cobrar",
// "Nuevo gasto", "Buscar" y "Agenda" (están en el manifest). Cada uno abre la app con
// ?atajo=… y acá se abre la pantalla que corresponde.
const ACCIONES = { cobrar: 'payForm', gasto: 'gastoGeneralForm', buscar: 'searchView', agenda: 'agendaView' };
export function ejecutarAtajo() {
  let atajo = '';
  try { atajo = new URLSearchParams(location.search).get('atajo') || ''; } catch (e) { return; }
  if (!atajo) return;
  // Se saca de la dirección para que no se repita al recargar.
  try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  const fn = window[ACCIONES[atajo]];
  if (typeof fn === 'function') setTimeout(() => fn(), 300);
}
