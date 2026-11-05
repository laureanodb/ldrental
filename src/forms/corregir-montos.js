// Corregir montos cargados sin los ceros: "360.000" se guardaba como 360 (la app
// tomaba el punto como decimal). Lista lo que quedó sospechosamente bajo y lo
// multiplica por 1.000 desde el principio, sin dejar las semanas viejas al valor malo.
import { S } from '../state.js';
import { esc, money, fdate } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de, tocarDatos } from '../memo.js';
import { driverName } from '../calc.js';
import { isSnoozed } from '../snooze.js';

// Ningún alquiler semanal en pesos es menor a esto.
export const ALQUILER_MINIMO = 1000;
const bajo = n => +n > 0 && +n < ALQUILER_MINIMO;
export function avisoAlquilerBajo(tipo, monto) {
  if (tipo === 'financiado' || !bajo(monto)) return '';
  return 'El alquiler semanal quedó en ' + money(monto) + '. ¿Quisiste poner ' + money(monto * 1000) + '? Escribilo sin puntos o con los puntos de miles (ej: 360.000).';
}
// Ajuste que se hizo al "corregir" con la casilla tildada: deja las semanas viejas al valor malo.
const RE_AJUSTE = /^Cambio de alquiler semanal de \$ ([\d.]+) a \$ ([\d.]+)/;
const ajusteDeCorreccion = a => { const m = RE_AJUSTE.exec(a.motivo || ''); return m && bajo(+m[1].replace(/\./g, '')) ? m : null; };

function pendientes() {
  const autos = S.cars.filter(c => !c.vendido && c.tipo !== 'financiado' && (bajo(c.tipo === 'alquiler' ? c.monto : c.valorSemanal) || bajo(c.valorSemanal) || bajo(c.deudaInicial) || (c.ajustesDeuda || []).some(ajusteDeCorreccion) || (c.tipo === 'alquiler' && (c.montoHistorial || []).some(x => bajo(x.monto)))));
  const pagos = S.payments.filter(p => p.tipo === 'alquiler' && bajo(p.monto)).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return { autos, pagos };
}
export function hayMontosSinCeros() { const p = pendientes(); return p.autos.length + p.pagos.length; }

export function corregirMontosView() {
  const { autos, pagos } = pendientes();
  let h = '<h3>Corregir montos sin los ceros</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Estos montos quedaron por debajo de ' + money(ALQUILER_MINIMO) + ': casi seguro se escribió "360.000" y la app guardó 360. Ya está arreglado para lo que se cargue de ahora en más. Revisá, cambiá lo que haga falta y tocá <b>Corregir</b>. La deuda se recalcula desde el principio de cada contrato.</div>';
  if (!autos.length && !pagos.length) {
    openModal(h + '<div class="card">✓ No hay montos para corregir.</div><button class="btn sec block" onclick="closeModal()">Cerrar</button>');
    return;
  }
  if (autos.length) {
    h += '<div class="sec-t">Autos (' + autos.length + ')</div>';
    h += autos.map(c => {
      const actual = c.tipo === 'alquiler' ? +c.monto || 0 : +c.valorSemanal || 0;
      const malos = (c.ajustesDeuda || []).filter(ajusteDeCorreccion);
      return '<div class="card" data-car="' + esc(c.id) + '"><label class="chk" style="margin:0 0 6px"><input type="checkbox" class="cm_si" checked><span><b>' + esc(c.patente || 'Auto') + '</b>' + (c.choferId ? ' · ' + esc(driverName(c.choferId)) : '') + '</span></label>' +
        (bajo(actual) ? '<div class="two"><label class="f"><span>' + (c.tipo === 'alquiler' ? 'Alquiler semanal' : 'Valor semanal') + ' ahora</span><input disabled value="' + esc(money(actual)) + '"></label>' +
          '<label class="f"><span>Corregido</span><input class="cm_monto" inputmode="decimal" value="' + actual * 1000 + '"></label></div>' : '') +
        (bajo(c.deudaInicial) ? '<div class="two"><label class="f"><span>Deuda inicial ahora</span><input disabled value="' + esc(money(c.deudaInicial)) + '"></label>' +
          '<label class="f"><span>Corregida</span><input class="cm_deuda" inputmode="decimal" value="' + (+c.deudaInicial) * 1000 + '"></label></div>' : '') +
        (malos.length ? '<div class="small" style="color:var(--warn)">Se borra' + (malos.length > 1 ? 'n ' + malos.length + ' ajustes' : ' 1 ajuste') + ' "Cambio de alquiler semanal" que dejaba las semanas viejas con el monto equivocado.</div>' : '') +
        '</div>';
    }).join('');
  }
  if (pagos.length) {
    h += '<div class="sec-t">Cobros de alquiler (' + pagos.length + ')</div><div class="small muted" style="margin-bottom:6px">Destildá los que de verdad fueron por ese monto.</div><div class="card">' +
      pagos.map(p => {
        const c = de('cars', 'id', p.carId)[0];
        return '<label class="chk" data-pago="' + esc(p.id) + '" style="margin:4px 0"><input type="checkbox" class="cm_pago" checked><span>' + fdate(p.fecha) + ' · ' + esc((c && c.patente) || '') + ' · ' + esc(driverName(p.choferId) || '') + ': ' + money(p.monto) + ' → <b>' + money(p.monto * 1000) + '</b></span></label>';
      }).join('') + '</div>';
  }
  h += '<div class="row" style="margin-top:12px"><button class="btn grow" id="cm_btn" onclick="aplicarCorreccionMontos()">Corregir</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>';
  openModal(h);
}

export async function aplicarCorreccionMontos() {
  const btn = document.getElementById('cm_btn'); if (btn) btn.disabled = true;
  let nAutos = 0, nPagos = 0, errores = 0;
  try {
    for (const card of document.querySelectorAll('#modal [data-car]')) {
      if (!card.querySelector('.cm_si').checked) continue;
      const c = de('cars', 'id', card.dataset.car)[0]; if (!c) continue;
      const o = Object.assign({}, c);
      const m = card.querySelector('.cm_monto');
      if (m) {
        const nuevo = +m.value || 0;
        if (nuevo < ALQUILER_MINIMO) { toast(c.patente + ': revisá el monto corregido'); errores++; continue; }
        if (c.tipo === 'alquiler') o.monto = nuevo;
        if (c.tipo === 'alquiler' || bajo(c.valorSemanal)) o.valorSemanal = nuevo;
      }
      // El historial también: si no, la corrección queda registrada como un aumento.
      if (c.tipo === 'alquiler') o.montoHistorial = (c.montoHistorial || []).map(x => (bajo(x.monto) ? Object.assign({}, x, { monto: x.monto * 1000 }) : x));
      const d = card.querySelector('.cm_deuda');
      if (d) o.deudaInicial = Math.max(0, +d.value || 0);
      o.ajustesDeuda = (c.ajustesDeuda || []).filter(a => !ajusteDeCorreccion(a));
      if (await save('cars', o)) nAutos++; else errores++;
    }
    for (const el of document.querySelectorAll('#modal [data-pago]')) {
      if (!el.querySelector('.cm_pago').checked) continue;
      const p = S.payments.find(x => x.id === el.dataset.pago); if (!p || !bajo(p.monto)) continue;
      if (await save('payments', Object.assign({}, p, { monto: p.monto * 1000, montoCorregido: { anterior: p.monto, fecha: new Date().toISOString().slice(0, 10) } }))) nPagos++; else errores++;
    }
  } finally { if (btn) btn.disabled = false; }
  tocarDatos();
  toast('Corregido: ' + nAutos + (nAutos === 1 ? ' auto' : ' autos') + (nPagos ? ' y ' + nPagos + (nPagos === 1 ? ' cobro' : ' cobros') : '') + (errores ? '. ' + errores + ' sin corregir' : ''));
  corregirMontosView();
}

// Aviso en el Panel mientras quede algo para corregir.
export function alertaMontosSinCeros() {
  const n = hayMontosSinCeros(); if (!n) return [];
  const key = 'sistema:montossinceros';
  if (isSnoozed(key)) return [];
  return [{ who: 'Montos sin los ceros', sub: 'Alquileres o cobros menores a ' + money(ALQUILER_MINIMO), kind: 'sistema', id: '', key, d: -1, cls: 'bad', t: n + (n === 1 ? ' monto para corregir' : ' montos para corregir'), accion: 'corregirMontosView()' }];
}
