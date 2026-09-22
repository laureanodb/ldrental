import { S } from './state.js';
import { activeCars } from './calc.js';
import { save } from './data.js';
import { iso, today, uid } from './utils.js';
import { toast } from './modal.js';

const GATE_KEY = 'flota-recurrentes-fecha';

async function generarSiFalta(c, categoria, monto) {
  if (!monto) return false;
  const mesActual = iso(today()).slice(0, 7);
  const yaExiste = S.gastos.some(g => g.carId === c.id && g.categoria === categoria && (g.fecha || '').slice(0, 7) === mesActual && g.generadoAuto);
  if (yaExiste) return false;
  await save('gastos', { id: uid(), carId: c.id, categoria, fecha: iso(today()), costo: monto, descripcion: 'Generado automáticamente', generadoAuto: true });
  return true;
}
export async function generarGastosRecurrentes() {
  try { if (localStorage.getItem(GATE_KEY) === iso(today())) return; } catch (e) {}
  let n = 0;
  for (const c of activeCars()) {
    if (await generarSiFalta(c, 'seguro', +c.seguroMensual || 0)) n++;
    if (await generarSiFalta(c, 'patente', +c.patenteMensual || 0)) n++;
  }
  try { localStorage.setItem(GATE_KEY, iso(today())); } catch (e) {}
  if (n) toast(n + ' gasto' + (n === 1 ? '' : 's') + ' recurrente' + (n === 1 ? '' : 's') + ' generado' + (n === 1 ? '' : 's') + ' automáticamente (seguro/patente)');
}
