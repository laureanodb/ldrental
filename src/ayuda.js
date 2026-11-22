// Ayuda en cada pantalla (botón "?") y glosario de términos.
// Las pantallas se reconocen por la pestaña o por el título de la ventana.
import { ui } from './state.js';
import { esc } from './utils.js';
import { openModal } from './modal.js';

const PESTANAS = {
  panel: 'El resumen del día: cuánto te deben, quién está atrasado, qué vence pronto y qué conviene hacer hoy. Tocá cualquier tarjeta para ir al detalle.',
  autos: 'Todos los autos de la flota. Tocá uno para ver su ficha: chofer, contrato, deuda, papeles, seguro, mantenimiento, daños y actas. El botón + agrega un auto.',
  choferes: 'Los choferes activos, los dados de baja y los postulantes. Desde la ficha del chofer mandás su link del portal, ves su cuenta corriente y lo liquidás.',
  cobros: 'Lo que pagó cada chofer en la semana. "Registrar cobro" anota un pago; si te equivocás, lo podés editar o borrar desde la lista (queda registrado quién lo hizo).',
  venc: 'Los papeles que vencen: VTV, seguro, patente, cédula, licencias de los choferes. Los rojos ya vencieron; los amarillos vencen pronto.',
  mas: 'Todo lo demás: mantenimiento, multas, siniestros, pañol, reportes, herramientas, comunicación con los choferes y la administración de la app.',
  'mas/mantenimiento': 'Services y arreglos de cada auto. La app avisa cuándo toca el próximo según los km o la fecha del plan de mantenimiento.',
  'mas/multas': 'Las multas de cada auto, con su estado. Si fue del chofer, podés descontársela de la cuenta o del depósito.',
  'mas/siniestros': 'Choques y robos: denuncia, fotos, presupuestos y quién paga. Desde acá armás la denuncia al seguro.',
  'mas/stock': 'Pañol: repuestos, insumos y herramientas. Cada uso descuenta del stock y avisa cuando hay que comprar.',
  'mas/reportes': 'Rentabilidad por auto y por chofer, gastos por categoría y la evolución mes a mes.',
  'mas/ajustes': 'Datos de la empresa (nombre, logo, CUIT, teléfono), datos de pago, dólar y preferencias de la app.',
  'mas/backup': 'Descargá una copia de todo y guardala en un lugar seguro. Para restaurar, primero probá la copia: te dice qué cambiaría sin tocar nada.',
};

// Por título de la ventana (empieza con…). El primero que coincide gana.
const VENTANAS = [
  ['Acta de', 'Completala con el chofer al lado cuando le entregás o te devuelve el auto. Firman los dos en la pantalla y queda un PDF numerado en los archivos del auto. En la devolución se compara con la entrega: km hechos y daños nuevos.'],
  ['Auto', 'La ficha del auto. Arriba ves si debe algo; en las pestañas, el contrato, los papeles, el seguro, el mantenimiento y los archivos. Los cambios de monto o de chofer quedan en el historial.'],
  ['Nuevo auto', 'Cargá lo básico para crear el auto. Si tenés el título, la app puede leerlo y completar los datos sola.'],
  ['Chofer', 'La ficha del chofer: datos, documentos, su link del portal, la cuenta corriente y la liquidación.'],
  ['Nuevo chofer', 'Cargá nombre, teléfono y DNI. El teléfono se pasa solo al formato de WhatsApp.'],
  ['Registrar cobro', 'Anotá lo que pagó el chofer. Escribí el monto como quieras: "360.000" o "360000" es lo mismo. El recibo sale numerado.'],
  ['Cobro', 'Anotá lo que pagó el chofer. Escribí el monto como quieras: "360.000" o "360000" es lo mismo. El recibo sale numerado.'],
  ['Cuenta corriente', 'Todo lo que debe el chofer, separado por concepto. Si no puede pagar todo junto, armale un plan de pagos.'],
  ['Ajustar deuda', 'Para corregir la deuda calculada: un monto positivo la baja (descuento, condonación), uno negativo la sube (cargo extra). Queda registrado y le avisa al administrador.'],
  ['Caja chica', 'La plata que le das a alguien del equipo para gastos del día. Cada gasto con su ticket queda también como gasto normal.'],
  ['Cierre de mes', 'Cuando cerrás un mes, nadie puede cambiar cobros ni gastos de ese mes salvo el administrador, y si lo hace queda registrado. Así los números del mes no se mueven.'],
  ['Nuevo mantenimiento', 'Anotá el service o el arreglo. Con la foto de la factura, la app completa los datos sola.'],
  ['Mantenimiento', 'Anotá el service o el arreglo. Con la foto de la factura, la app completa los datos sola.'],
  ['Multa', 'Los datos de la multa y su estado. Si fue del chofer, podés descontársela de la cuenta o del depósito.'],
  ['Nuevo daño', 'Marcá dónde está el daño, qué tipo es y sacale una foto.'],
  ['Renovar contrato', 'Arma un contrato nuevo para el mismo chofer, con el monto y la fecha que elijas.'],
  ['Nueva multa', 'Cargá el acta. Si es del chofer, después la podés descontar de su cuenta.'],
  ['Nuevo gasto', 'Gasto de un auto o general. Si tenés la factura, sacale una foto: la app lee el monto y el proveedor.'],
  ['Gasto', 'Gasto de un auto o general. Si tenés la factura, sacale una foto: la app lee el monto y el proveedor.'],
  ['Restaurar copia', 'Antes de restaurar, tocá "Probar la copia": te dice qué se agregaría y qué se reemplazaría, sin cambiar nada.'],
  ['Portal del chofer', 'Cómo ve el chofer su portal: color, horario de atención, términos de uso y cuánto duran los links.'],
  ['Usuarios', 'Quién usa la app y con qué permisos. Administrador: todo. Supervisor: casi todo, sin administración. Empleado: carga y consulta, sin borrar ni ver finanzas.'],
  ['Auditoría', 'Todo lo que se guardó o borró, quién y cuándo. Sirve para encontrar errores de carga.'],
  ['Errores de la app', 'Si algo falló en el celular de alguien, aparece acá con el detalle técnico. Pasáselo a quien mantiene la app.'],
  ['Contrato', 'Arma el contrato con los datos del auto y el chofer. Puede firmarse en el celular o mandarse para firmar a distancia.'],
  ['Simulador', 'Probá distintos plazos y anticipos antes de ofrecer una financiación. Lo podés compartir por WhatsApp o en PDF.'],
  ['Calculadora', 'Compará si conviene alquilar o financiar un auto, con tus números.'],
  ['Mensaje a todos', 'Escribís una vez y se arma un WhatsApp para cada chofer, con su nombre, patente y deuda. Se mandan de a uno.'],
  ['Bienvenida', 'El mensaje para el chofer nuevo: link del portal, monto, día de cobro y reglas.'],
  ['Daños', 'Marcá en el dibujo dónde está cada golpe o rayón, con foto. Queda con la fecha y el chofer que tenía el auto.'],
  ['Glosario', 'Qué significa cada palabra de la app.'],
];

export const GLOSARIO = [
  ['Alquiler semanal', 'Lo que paga el chofer por semana por usar el auto. La deuda se cuenta por semanas empezadas desde el inicio del contrato.'],
  ['Financiado', 'Auto que el chofer va pagando en cuotas hasta quedárselo. Tiene saldo pendiente y cantidad de cuotas.'],
  ['Deuda', 'Lo que corresponde pagar hasta hoy, menos lo pagado y los ajustes. Nunca es negativa.'],
  ['Deuda inicial', 'Lo que el chofer ya debía cuando empezaste a usar la app. Se suma desde el primer día.'],
  ['Ajuste de deuda', 'Corrección manual de la deuda (descuento o cargo extra). Queda registrado.'],
  ['Semanas de atraso', 'Deuda dividida por el alquiler semanal. "1,5 semanas" es una semana y media sin pagar.'],
  ['Depósito / garantía', 'Plata que deja el chofer al empezar. Se devuelve al final, menos lo que deba o los daños.'],
  ['Semana adelantada', 'Una semana que el chofer paga por adelantado y se usa para cubrir un atraso.'],
  ['Cuenta corriente', 'El detalle de todo lo que debe un chofer: alquiler, multas, seguro, daños, planes de pago.'],
  ['Plan de pagos', 'Acuerdo para pagar una deuda en partes. Cada cuota se suma a lo que debe por semana.'],
  ['Liquidación', 'El cierre de cuentas con un chofer que se va: deuda, depósito, descuentos y saldo final.'],
  ['Caja chica', 'Plata entregada a alguien del equipo para gastos chicos. Su saldo = lo entregado − lo gastado − lo devuelto.'],
  ['Cierre de mes', 'Bloqueo de los números de un mes para que no cambien después.'],
  ['Cambio sensible', 'Un cambio que conviene revisar: pago borrado, monto modificado, descuento a favor del chofer. Aparece en Alertas.'],
  ['Portal del chofer', 'Página que ve cada chofer con su link: cuánto debe, sus pagos, papeles y avisos.'],
  ['Link del portal', 'Dirección personal del chofer para entrar al portal. Si lo das de baja, deja de funcionar.'],
  ['Acta de entrega / devolución', 'Documento firmado por los dos al entregar o recibir el auto: km, combustible, elementos y daños.'],
  ['VTV', 'Verificación técnica vehicular. Vence cada uno o dos años según la antigüedad del auto.'],
  ['Cédula', 'La tarjeta (verde o azul) que habilita a manejar el auto.'],
  ['Prueba hidráulica / oblea GNC', 'Controles obligatorios del equipo de gas. Sin oblea vigente no se puede cargar GNC.'],
  ['Orden de trabajo (OT)', 'Un trabajo del taller propio: tareas, repuestos, horas y fotos.'],
  ['Pañol', 'El depósito de repuestos, insumos y herramientas.'],
  ['Autoseguro', 'Fondo propio para cubrir daños chicos sin usar el seguro.'],
  ['Rentabilidad', 'Lo que dejó un auto: cobrado menos gastos, mantenimiento, seguro y multas a cargo tuyo.'],
  ['Copia de seguridad', 'Archivo con todos los datos. Guardalo en un lugar seguro; sirve para recuperar todo si pasa algo.'],
  ['Modo práctica', 'La app con datos de ejemplo para aprender. Nada se guarda.'],
  ['Modo solo consulta', 'Bloquea los cambios por un rato, por ejemplo para mostrar la app sin riesgo.'],
  ['Supervisor', 'Usuario que puede casi todo menos administrar usuarios y ajustes.'],
];

export function textoAyudaPantalla() {
  return PESTANAS[ui.tab === 'mas' && ui.masView ? 'mas/' + ui.masView : ui.tab] || PESTANAS[ui.tab] || '';
}
export function ayudaPantalla() {
  const t = textoAyudaPantalla();
  openModal('<h3>Ayuda</h3><p>' + esc(t || 'Esta pantalla todavía no tiene ayuda escrita.') + '</p>' +
    '<div class="row" style="gap:8px"><button class="btn sec grow" onclick="glosarioView()">Glosario</button><button class="btn sec grow" onclick="closeModal();recorridoApp(true)">Recorrido por la app</button></div>' +
    '<button class="btn block" style="margin-top:8px" onclick="closeModal()">Entendido</button>');
}
// Agrega el botón "?" al título de la ventana si hay ayuda para ella.
export function ponerAyudaVentana(raiz) {
  const h = raiz && raiz.querySelector('.sheet h3');
  if (!h || h.querySelector('.ayuda-btn')) return;
  const titulo = h.dataset.ayuda || h.textContent.trim();
  const e = VENTANAS.find(([k]) => titulo === k || titulo.startsWith(k + ' ') || titulo.startsWith(k + ':'));
  if (!e) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'ayuda-btn'; b.textContent = '?'; b.setAttribute('aria-label', 'Ayuda');
  b.style.cssText = 'margin-left:8px;width:24px;height:24px;border-radius:50%;border:1px solid var(--line);background:var(--soft);color:var(--ink);font:600 13px system-ui;vertical-align:2px;cursor:pointer';
  b.onclick = () => {
    const ya = h.nextElementSibling && h.nextElementSibling.classList.contains('ayuda-caja');
    if (ya) { h.nextElementSibling.remove(); return; }
    const d = document.createElement('div');
    d.className = 'ayuda-caja card small';
    d.style.cssText = 'background:var(--soft);margin-bottom:10px';
    d.innerHTML = esc(e[1]) + ' <a class="tap" style="text-decoration:underline" onclick="glosarioView()">Glosario</a>';
    h.after(d);
  };
  h.appendChild(b);
}
export function glosarioView(q) {
  const t = String(q || '').toLowerCase().trim();
  const L = GLOSARIO.filter(([a, b]) => !t || (a + ' ' + b).toLowerCase().includes(t));
  const lista = L.map(([a, b]) => '<div class="card"><b>' + esc(a) + '</b><div class="small muted">' + esc(b) + '</div></div>').join('') || '<div class="small muted">No hay nada con esa palabra.</div>';
  if (q !== undefined && document.getElementById('gl_lista')) { document.getElementById('gl_lista').innerHTML = lista; return; }
  openModal('<h3>Glosario</h3><label class="f"><span>Buscar</span><input id="gl_q" oninput="glosarioView(this.value)" placeholder="ej: depósito"></label><div id="gl_lista">' + lista + '</div>' +
    '<button class="btn sec block" style="margin-top:10px" onclick="closeModal()">Cerrar</button>');
}
