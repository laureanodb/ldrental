// Patrimonio de la empresa: lo que vale todo lo que tenés menos lo que debés, mes a mes.
// Autos a valor de mercado (o a lo que costaron si falta el valor), lo que te deben los
// choferes y las financiaciones, la plata disponible que anotes y la caja chica,
// menos las garantías que tenés que devolver, la patente adeudada y otras deudas que anotes.
import { S } from '../state.js';
import { esc, val, iso, today, money } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { isContract, calc, saldoDeposito } from '../calc.js';
import { settings, saveSettings } from '../settings.js';
import { cotizacion, enPesos, textoCotizacion } from '../dolar.js';
import { saldos as saldosCajaChica } from './caja-chica.js';

export function patrimonio() {
  const autos = S.cars.filter(c => !c.vendido);
  let valorAutos = 0, sinValor = 0, porCosto = 0;
  const financiadosUSD = [];
  autos.forEach(c => {
    if (c.tipo === 'financiado' && isContract(c)) { financiadosUSD.push(calc(c).saldo || 0); return; }
    if (+c.valorMercado > 0) valorAutos += +c.valorMercado;
    else if (+c.costoCompra > 0) { valorAutos += +c.costoCompra; porCosto++; }
    else sinValor++;
  });
  const deudaAlquileres = autos.filter(c => isContract(c) && c.tipo !== 'financiado').reduce((s, c) => s + (calc(c).debt || 0), 0);
  const saldoFinUSD = financiadosUSD.reduce((s, x) => s + x, 0);
  const saldoFin = cotizacion() ? enPesos(saldoFinUSD) : 0;
  const caja = +settings.patrimonioCaja || 0;
  const cajaChica = saldosCajaChica().reduce((s, x) => s + Math.max(0, x.saldo), 0);
  const garantias = S.drivers.filter(d => !d.inactivo).reduce((s, d) => s + Math.max(0, saldoDeposito(d.id) || 0), 0);
  const patentes = autos.filter(c => c.consultaPatente && c.consultaPatente.resultado === 'debe').reduce((s, c) => s + (+c.consultaPatente.monto || 0), 0);
  const otrasDeudas = +settings.patrimonioDeudas || 0;
  const activo = valorAutos + deudaAlquileres + saldoFin + caja + cajaChica;
  const pasivo = garantias + patentes + otrasDeudas;
  return { valorAutos, sinValor, porCosto, deudaAlquileres, saldoFinUSD, saldoFin, caja, cajaChica, garantias, patentes, otrasDeudas, activo, pasivo, total: activo - pasivo, nFinanciados: financiadosUSD.length };
}

// Guarda la foto del mes actual (se actualiza cada vez que se abre en el mes).
function anotarMes(p) {
  const mes = iso(today()).slice(0, 7);
  const H = (settings.patrimonioHistorial || []).filter(x => x.mes !== mes);
  const nuevo = { mes, total: Math.round(p.total), activo: Math.round(p.activo), pasivo: Math.round(p.pasivo) };
  const prev = (settings.patrimonioHistorial || []).find(x => x.mes === mes);
  if (!prev || prev.total !== nuevo.total || prev.activo !== nuevo.activo) saveSettings({ patrimonioHistorial: H.concat([nuevo]).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-36) });
}
const mesLabel = k => new Date(k + '-02').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

export function patrimonioView() {
  const p = patrimonio();
  anotarMes(p);
  const fila = (t, v, nota, signo) => '<div class="row between" style="padding:4px 0;gap:10px"><span style="min-width:0">' + esc(t) + (nota ? '<div class="small muted">' + nota + '</div>' : '') + '</span><b style="white-space:nowrap">' + (signo || '') + money(v) + '</b></div>';
  let h = '<h3>Patrimonio de la empresa</h3>' +
    '<div class="card" style="text-align:center;margin-bottom:10px"><div class="small muted">Lo que vale hoy la empresa</div><div style="font-size:30px;font-weight:800">' + money(p.total) + '</div>' +
    '<div class="small muted">Tenés ' + money(p.activo) + ' y debés ' + money(p.pasivo) + '</div></div>';
  h += '<div class="card"><b>Lo que tenés</b>' +
    fila('Autos', p.valorAutos, (p.porCosto ? p.porCosto + (p.porCosto === 1 ? ' auto sin valor de mercado: va lo que costó' : ' autos sin valor de mercado: va lo que costaron') + '. ' : '') + (p.sinValor ? '<span style="color:var(--warn)">' + p.sinValor + (p.sinValor === 1 ? ' auto sin valor ni costo: no suma.' : ' autos sin valor ni costo: no suman.') + '</span>' : '')) +
    fila('Te deben los choferes (alquileres)', p.deudaAlquileres) +
    (p.nFinanciados ? fila('Saldo de las financiaciones', p.saldoFin, 'US$ ' + Math.round(p.saldoFinUSD).toLocaleString('es-AR') + (cotizacion() ? ' al ' + esc(textoCotizacion()) : ' · <span style="color:var(--warn)">sin cotización del dólar: no suma</span>')) : '') +
    fila('Plata disponible (cuentas y efectivo)', p.caja, 'La anotás vos abajo.') +
    (p.cajaChica ? fila('En la caja chica del equipo', p.cajaChica) : '') + '</div>';
  h += '<div class="card"><b>Lo que debés</b>' +
    fila('Garantías de choferes para devolver', p.garantias, '', '−') +
    (p.patentes ? fila('Patente adeudada', p.patentes, 'De la consulta de deuda de patente.', '−') : '') +
    fila('Otras deudas (créditos, prendas, proveedores)', p.otrasDeudas, 'La anotás vos abajo.', '−') + '</div>';
  const H = (settings.patrimonioHistorial || []).slice().reverse();
  if (H.length) h += '<div class="sec-t">Mes a mes</div><div class="card">' + H.map((x, i) => {
    const ant = H[i + 1]; const dif = ant ? x.total - ant.total : null;
    return '<div class="row between small" style="padding:3px 0"><span>' + esc(mesLabel(x.mes)) + '</span><span><b>' + money(x.total) + '</b>' + (dif != null ? ' <span style="color:' + (dif >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + (dif >= 0 ? '+' : '−') + money(Math.abs(dif)) + '</span>' : '') + '</span></div>';
  }).join('') + '<div class="small muted" style="margin-top:4px">Se guarda una foto por mes, la última vez que abriste esta pantalla en ese mes.</div></div>';
  h += '<div class="sec-t">Lo que anotás vos</div><div class="two"><label class="f"><span>Plata disponible</span><input id="pt_caja" inputmode="decimal" value="' + (p.caja || '') + '"></label>' +
    '<label class="f"><span>Otras deudas</span><input id="pt_deudas" inputmode="decimal" value="' + (p.otrasDeudas || '') + '"></label></div>' +
    '<div class="row"><button class="btn grow" onclick="guardarPatrimonio()">Guardar</button><button class="btn sec" onclick="closeModal()">Cerrar</button></div>' +
    '<div class="small muted" style="margin-top:8px">Para que el número sea más real, cargá el valor de mercado de cada auto (Más → Valores de mercado).</div>';
  openModal(h);
}
export function guardarPatrimonio() {
  saveSettings({ patrimonioCaja: Math.max(0, +val('pt_caja') || 0), patrimonioDeudas: Math.max(0, +val('pt_deudas') || 0) });
  toast('Guardado'); setTimeout(patrimonioView, 50);
}
