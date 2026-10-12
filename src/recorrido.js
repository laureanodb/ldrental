// Recorrido de ayuda de la app: la primera vez (en cada celular) muestra paso a
// paso para qué sirve cada parte. Se puede volver a ver desde Más.
const KEY = 'app-recorrido-v1';
const PASOS = [
  ['.tb-search', 'Buscar', 'Encontrá cualquier auto, chofer, cobro o multa escribiendo la patente, el nombre o un monto.'],
  ['#nav button:nth-child(1)', 'Panel', 'Lo importante del día: cuánto cobraste, quién debe, sugerencias y las metas de la flota.'],
  ['#nav button:nth-child(2)', 'Autos', 'La ficha de cada auto: contrato, mantenimiento, gastos, papeles, órdenes del taller y la venta.'],
  ['#nav button:nth-child(3)', 'Choferes', 'Datos, deuda, portal, reclamos y llamados de cada chofer.'],
  ['#nav button:nth-child(4)', 'Cobros', 'Cargá los cobros. Con "Guardar y cargar otro" cargás varios seguidos.'],
  ['#nav button:nth-child(5)', 'Vencimientos', 'Todos los avisos: lo que vence, lo que pidieron los choferes y lo que hay que resolver. Podés posponer o marcar en trámite.'],
  ['#nav button:nth-child(6)', 'Más', 'Pañol, taller, reportes, compra de autos, mensajes programados, ajustes y la papelera.'],
  ['#fabBar', 'Accesos rápidos', 'Botones para cargar un cobro o un gasto desde cualquier pantalla. Se eligen en Ajustes.'],
];
export function recorridoApp(forzar) {
  if (!forzar) { try { if (localStorage.getItem(KEY)) return; } catch (e) { return; } }
  const pasos = PASOS.filter(p => document.querySelector(p[0]));
  if (!pasos.length || document.getElementById('recorrido-app')) return;
  let i = 0, marcado = null;
  const capa = document.createElement('div');
  capa.id = 'recorrido-app';
  capa.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:12px;width:min(440px,calc(100% - 24px));z-index:60;padding:12px 14px;background:var(--card);border:2px solid var(--btn);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.2)';
  document.body.appendChild(capa);
  const quitarMarca = () => { if (marcado) { marcado.style.outline = ''; marcado.style.outlineOffset = ''; } };
  const cerrar = () => { quitarMarca(); capa.remove(); try { localStorage.setItem(KEY, '1'); } catch (e) {} };
  const mostrar = () => {
    const [sel, titulo, texto] = pasos[i];
    quitarMarca();
    marcado = document.querySelector(sel);
    if (marcado) { marcado.style.outline = '3px solid var(--btn)'; marcado.style.outlineOffset = '2px'; }
    capa.innerHTML = '<div class="small muted">' + (i + 1) + ' de ' + pasos.length + '</div><b>' + titulo + '</b><div class="small" style="margin:4px 0 10px">' + texto + '</div>' +
      '<div class="row"><button class="btn sec sm" id="rec_saltar">Saltar</button><button class="btn sm grow" id="rec_sig">' + (i === pasos.length - 1 ? 'Listo' : 'Siguiente') + '</button></div>';
    capa.querySelector('#rec_saltar').onclick = cerrar;
    capa.querySelector('#rec_sig').onclick = () => { i++; if (i >= pasos.length) cerrar(); else mostrar(); };
  };
  mostrar();
}
let programado = false;
// Se llama después de dibujar con los datos cargados; corre una sola vez por sesión.
export function programarRecorrido() {
  if (programado) return;
  programado = true;
  setTimeout(() => { if (!document.querySelector('#modal.open')) recorridoApp(false); }, 1200);
}
