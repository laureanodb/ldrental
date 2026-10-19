// Avisos de los módulos agregados en la ronda de las 200 preguntas.
import { alertasChoferes } from './forms/choferes-extra.js';
import { alertasPedidosChofer } from './forms/pedidos-chofer.js';
import { alertasMensajes } from './forms/mensajes.js';
import { alertaChequeo } from './forms/reportes-extra.js';
import { alertasGps } from './forms/gps.js';
import { alertaConsultaMultas } from './forms/consulta-multas.js';
import { S } from './state.js';
import { isSnoozed } from './snooze.js';
import { parse, today, fdate, days } from './utils.js';

// Lo del pañol que caduca y todavía tiene stock: aviso 30 días antes.
function alertasVencePanol() {
  return S.repuestos.filter(r => !r.inactivo && r.venceEl && (+r.stockActual || 0) > 0).map(r => {
    const d = days(today(), parse(r.venceEl));
    if (d > 30) return null;
    const key = 'repuesto:' + r.id + ':vence:' + r.venceEl;
    if (isSnoozed(key)) return null;
    return { who: r.nombre, sub: 'Pañol: producto por vencer', kind: 'repuesto', id: r.id, key, d, cls: d < 0 ? 'bad' : d <= 7 ? 'warn' : 'soft', t: d < 0 ? 'Vencido el ' + fdate(r.venceEl) : 'Vence el ' + fdate(r.venceEl) };
  }).filter(Boolean);
}

export function alertasExtra() {
  return [...alertasChoferes(), ...alertasPedidosChofer(), ...alertasMensajes(), ...alertasVencePanol(), ...alertaChequeo(), ...alertasGps(), ...alertaConsultaMultas()];
}
