// Papelera: lo que se borra queda 30 días para recuperarlo. Se guarda en los
// ajustes compartidos, así lo ve cualquiera del equipo desde cualquier celular.
// Los archivos (fotos, PDF) que se borraron junto con el registro no vuelven.
import { S } from '../state.js';
import { esc, uid, today, fdate, money, moneyUSD, parse, days } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de } from '../memo.js';
import { settings, saveSettings } from '../settings.js';

const DIAS = 30, MAX = 300;
const NOMBRES = { cars: 'Auto', drivers: 'Chofer', payments: 'Cobro', gastos: 'Gasto', mantenimientos: 'Mantenimiento', multas: 'Multa', siniestros: 'Siniestro', depositos: 'Movimiento de depósito', sanciones: 'Sanción', repuestos: 'Ítem del pañol', proveedores: 'Proveedor', recordatorios: 'Recordatorio', inspecciones: 'Inspección', ordenes: 'Orden de trabajo', gastosrecurrentes: 'Gasto recurrente', encuestas: 'Encuesta' };
const vigentes = () => (settings.papelera || []).filter(x => days(parse(String(x.borrado).slice(0, 10)), today()) <= DIAS);

export function alPapelera(col, obj, extra) {
  if (!obj || !obj.id) return;
  try {
    const L = vigentes().concat([{ id: uid(), col, obj, extra: extra || null, borrado: new Date().toISOString(), por: (S.user && S.user.email) || '' }]);
    saveSettings({ papelera: L.slice(-MAX) });
  } catch (e) { /* si no se puede guardar en la papelera, el borrado sigue igual */ }
}
function descripcion(x) {
  const o = x.obj || {};
  const auto = id => ((de('cars', 'id', id)[0] || {}).patente || '');
  const m = n => (o.tipo === 'cuota' ? moneyUSD(n) : money(n));
  switch (x.col) {
    case 'cars': return o.patente || 'Auto';
    case 'drivers': return o.nombre || 'Chofer';
    case 'payments': return m(o.monto) + ' del ' + fdate(o.fecha) + (o.carId ? ' · ' + auto(o.carId) : '');
    case 'gastos': return (o.descripcion || o.categoria || 'Gasto') + ' · ' + money(o.costo) + (o.carId ? ' · ' + auto(o.carId) : '');
    case 'mantenimientos': return (o.label || o.item || 'Mantenimiento') + ' · ' + fdate(o.fecha) + (o.carId ? ' · ' + auto(o.carId) : '');
    case 'multas': return money(o.monto) + ' · ' + fdate(o.fecha) + (o.carId ? ' · ' + auto(o.carId) : '');
    case 'ordenes': return 'OT ' + (o.numero || '') + ' · ' + (o.titulo || '') + (x.extra && x.extra.carId ? ' · ' + auto(x.extra.carId) : '');
    default: return o.nombre || o.texto || o.motivo || o.descripcion || fdate(o.fecha) || o.id;
  }
}
export function papeleraView() {
  const L = vigentes().slice().reverse();
  openModal('<h3>Papelera</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Lo que se borró en los últimos ' + DIAS + ' días. Al recuperarlo vuelve tal cual estaba; las fotos o archivos que se borraron con el registro no vuelven.</div>' +
    (L.length ? L.map(x => '<div class="card row between"><div style="min-width:0"><div><b>' + esc(NOMBRES[x.col] || x.col) + '</b> · ' + esc(descripcion(x)) + '</div>' +
      '<div class="small muted">Borrado el ' + fdate(String(x.borrado).slice(0, 10)) + (x.por ? ' por ' + esc(x.por) : '') + ' · se va en ' + Math.max(0, DIAS - days(parse(String(x.borrado).slice(0, 10)), today())) + ' d</div></div>' +
      '<button class="btn sec sm" onclick="restaurarPapelera(\'' + x.id + '\')">Recuperar</button></div>').join('') : '<div class="card empty">La papelera está vacía.</div>') +
    '<button class="btn sec block" style="margin-top:10px" onclick="closeModal()">Cerrar</button>');
}
export async function restaurarPapelera(id) {
  const x = vigentes().find(v => v.id === id); if (!x) return;
  let ok = false;
  if (x.col === 'ordenes') {
    const c = de('cars', 'id', x.extra && x.extra.carId)[0];
    if (!c) { toast('El auto de esa orden ya no existe'); return; }
    ok = await save('cars', Object.assign({}, c, { ordenes: (c.ordenes || []).filter(o => o.id !== x.obj.id).concat([x.obj]) }));
  } else {
    if ((S[x.col] || []).some(r => r.id === x.obj.id)) { toast('Ese registro ya existe, no hace falta recuperarlo'); }
    else ok = await save(x.col, x.obj);
  }
  if (!ok) return;
  saveSettings({ papelera: vigentes().filter(v => v.id !== id) });
  toast((NOMBRES[x.col] || 'Registro') + ' recuperado'); papeleraView();
}
export const enPapelera = () => vigentes().length;
