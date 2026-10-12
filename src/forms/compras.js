// Compra y venta de autos: checklist mecánico para revisar un usado antes de
// comprarlo, a quién se le compró cada auto y cómo salió, cuánto pierde de valor
// cada 10.000 km, cuándo conviene sumar un auto y el precio mínimo de venta.
import { S } from '../state.js';
import { esc, val, uid, iso, today, fdate, money, num1, parse, days } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de } from '../memo.js';
import { settings, saveSettings } from '../settings.js';
import { badge, rentabilidadAuto, isContract } from '../calc.js';

const carDe = id => de('cars', 'id', id)[0];

/* ---------- Checklist mecánico de compra ---------- */
export const CHECK_COMPRA = [
  ['motor', 'Motor: arranque en frío, ruidos, humo, pérdidas de aceite'],
  ['caja', 'Caja y embrague: cambios suaves, que no patine'],
  ['tren', 'Tren delantero: extremos, rótulas, bujes, ruidos al doblar'],
  ['frenos', 'Frenos: pastillas, discos, que no tire para un lado'],
  ['suspension', 'Suspensión y amortiguadores'],
  ['refrigeracion', 'Refrigeración: temperatura estable, sin pérdidas'],
  ['electricidad', 'Electricidad: luces, levantavidrios, tablero sin testigos'],
  ['aire', 'Aire acondicionado'],
  ['carroceria', 'Carrocería: óxido, choques, pintura pareja, luces de puertas'],
  ['cubiertas', 'Cubiertas y auxilio'],
  ['escaner', 'Escáner OBD sin códigos de falla'],
  ['prueba', 'Prueba de manejo de al menos 15 minutos'],
  ['papeles', 'Papeles: título, cédula, informe de dominio, libre deuda, VTV'],
  ['gnc', 'GNC (si tiene): oblea y prueba hidráulica al día'],
];
const candidatos = () => settings.candidatosCompra || [];
const guardarCandidatos = L => saveSettings({ candidatosCompra: L });
const puntaje = x => { const v = Object.values(x.checklist || {}); return { ok: v.filter(e => e === 'ok').length, mal: v.filter(e => e === 'mal').length, total: CHECK_COMPRA.length }; };

export function candidatosCompraView() {
  const L = candidatos().filter(x => x.estado !== 'descartado' && x.estado !== 'comprado');
  const otros = candidatos().filter(x => x.estado === 'descartado' || x.estado === 'comprado').slice(-8).reverse();
  const fila = x => {
    const p = puntaje(x);
    return '<div class="card tap" onclick="candidatoCompraForm(\'' + x.id + '\')"><div class="row between"><b>' + esc([x.marca, x.modelo, x.anio].filter(Boolean).join(' ') || 'Auto') + '</b>' +
      (x.estado === 'comprado' ? badge('ok', 'Comprado') : x.estado === 'descartado' ? badge('mute', 'Descartado') : p.mal ? badge('bad', p.mal + ' cosa' + (p.mal === 1 ? '' : 's') + ' mal') : badge(p.ok === p.total ? 'ok' : 'soft', p.ok + ' de ' + p.total + ' revisado')) + '</div>' +
      '<div class="small muted">' + [x.precio ? money(x.precio) : '', x.km ? Number(x.km).toLocaleString('es-AR') + ' km' : '', x.vendedor ? (x.tipoVendedor === 'agencia' ? 'Agencia ' : '') + x.vendedor : ''].filter(Boolean).map(esc).join(' · ') + '</div></div>';
  };
  openModal('<h3>Autos para comprar</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Anotá cada auto que te ofrecen y revisalo con el checklist mecánico antes de comprarlo. Si lo comprás, se carga solo en la flota con el vendedor y el precio.</div>' +
    (L.length ? L.map(fila).join('') : '<div class="small muted" style="margin-bottom:10px">No hay autos en evaluación.</div>') +
    '<button class="btn block" style="margin-top:6px" onclick="candidatoCompraForm()">+ Anotar un auto</button>' +
    (otros.length ? '<div class="sec-t">Ya decididos</div>' + otros.map(fila).join('') : '') +
    '<button class="btn sec block" style="margin-top:10px" onclick="closeModal()">Cerrar</button>');
}
export function candidatoCompraForm(id) {
  const x = candidatos().find(c => c.id === id) || { checklist: {} };
  const opt = (k, v) => '<option value="' + k + '"' + ((x.checklist || {})[v] === k ? ' selected' : '') + '>';
  openModal('<h3>' + (id ? 'Auto para comprar' : 'Anotar un auto') + '</h3>' +
    '<div class="two"><label class="f"><span>Marca</span><input id="cc_marca" value="' + esc(x.marca) + '"></label><label class="f"><span>Modelo</span><input id="cc_modelo" value="' + esc(x.modelo) + '"></label></div>' +
    '<div class="two"><label class="f"><span>Año</span><input id="cc_anio" inputmode="numeric" value="' + esc(x.anio) + '"></label><label class="f"><span>Km</span><input id="cc_km" inputmode="numeric" value="' + esc(x.km) + '"></label></div>' +
    '<div class="two"><label class="f"><span>Precio que piden</span><input id="cc_precio" inputmode="decimal" value="' + esc(x.precio || '') + '"></label><label class="f"><span>Patente <small>opcional</small></span><input id="cc_patente" value="' + esc(x.patente) + '"></label></div>' +
    '<div class="two"><label class="f"><span>Quién lo vende</span><input id="cc_vendedor" value="' + esc(x.vendedor) + '" placeholder="nombre o agencia"></label>' +
    '<label class="f"><span>Es</span><select id="cc_tipovend"><option value="particular">Particular</option><option value="agencia"' + (x.tipoVendedor === 'agencia' ? ' selected' : '') + '>Agencia / concesionaria</option></select></label></div>' +
    '<label class="f"><span>Contacto <small>opcional</small></span><input id="cc_contacto" value="' + esc(x.contacto) + '"></label>' +
    '<div class="sec-t">Checklist mecánico</div>' +
    CHECK_COMPRA.map(([k, l]) => '<div class="row between" style="padding:4px 0;gap:8px"><span class="small">' + esc(l) + '</span><select class="cc_ck" data-k="' + k + '" style="width:auto">' + opt('', k) + '—</option>' + opt('ok', k) + 'Bien</option>' + opt('mal', k) + 'Mal</option>' + opt('na', k) + 'No aplica</option></select></div>').join('') +
    '<label class="f" style="margin-top:8px"><span>Notas / qué hay que arreglar</span><textarea id="cc_notas">' + esc(x.notas) + '</textarea></label>' +
    '<div class="row"><button class="btn grow" onclick="guardarCandidatoCompra(\'' + (id || '') + '\')">Guardar</button><button class="btn sec" onclick="candidatosCompraView()">Volver</button></div>' +
    (id && x.estado !== 'comprado' ? '<div class="row" style="margin-top:8px"><button class="btn sec grow" onclick="comprarCandidato(\'' + id + '\')">Lo compré: cargarlo en la flota</button><button class="btn sec" onclick="descartarCandidato(\'' + id + '\')">Descartar</button></div>' : ''));
}
function leerCandidato(id) {
  const ex = candidatos().find(c => c.id === id) || {};
  const checklist = {}; document.querySelectorAll('.cc_ck').forEach(s => { if (s.value) checklist[s.dataset.k] = s.value; });
  return Object.assign({}, ex, { id: id || uid(), fecha: ex.fecha || iso(today()), marca: val('cc_marca'), modelo: val('cc_modelo'), anio: val('cc_anio'), km: +val('cc_km') || 0, precio: +val('cc_precio') || 0, patente: val('cc_patente').toUpperCase(), vendedor: val('cc_vendedor'), tipoVendedor: val('cc_tipovend'), contacto: val('cc_contacto'), notas: val('cc_notas'), checklist, estado: ex.estado || 'evaluando' });
}
export function guardarCandidatoCompra(id) {
  const x = leerCandidato(id);
  if (!x.marca && !x.modelo) { toast('Poné al menos la marca o el modelo'); return; }
  guardarCandidatos(id ? candidatos().map(c => (c.id === id ? x : c)) : candidatos().concat([x]));
  toast('Guardado'); candidatosCompraView();
}
export function descartarCandidato(id) {
  guardarCandidatos(candidatos().map(c => (c.id === id ? Object.assign({}, leerCandidato(id), { estado: 'descartado' }) : c)));
  toast('Descartado'); candidatosCompraView();
}
export async function comprarCandidato(id) {
  const x = Object.assign(leerCandidato(id), { estado: 'comprado' });
  if (!x.patente) { toast('Poné la patente para cargarlo en la flota'); return; }
  if (S.cars.some(c => String(c.patente).toUpperCase() === x.patente)) { toast('Ya hay un auto con esa patente'); return; }
  const car = { id: uid(), patente: x.patente, marca: x.marca, modelo: x.modelo, anio: x.anio, km: x.km || '', costoCompra: x.precio || 0, tipo: 'disponible', disponibleDesde: iso(today()), fechaCompra: iso(today()), compraVendedor: x.vendedor, compraTipoVendedor: x.tipoVendedor, compraChecklist: x.checklist, compraNotas: x.notas, files: [] };
  if (!(await save('cars', car))) return;
  guardarCandidatos(candidatos().map(c => (c.id === id ? Object.assign({}, x, { carId: car.id }) : c)));
  toast('Auto cargado en la flota'); window.carForm(car.id);
}

/* ---------- A quién se le compró cada auto ---------- */
export function camposOrigenCompra(c) {
  return '<div class="two"><label class="f"><span>A quién se lo compraste</span><input id="c_compravend" value="' + esc(c.compraVendedor) + '" list="c_vendedores"><datalist id="c_vendedores">' + vendedores().map(v => '<option value="' + esc(v) + '">').join('') + '</datalist></label>' +
    '<label class="f"><span>Es</span><select id="c_compratipo"><option value="">Sin especificar</option><option value="particular"' + (c.compraTipoVendedor === 'particular' ? ' selected' : '') + '>Particular</option><option value="agencia"' + (c.compraTipoVendedor === 'agencia' ? ' selected' : '') + '>Agencia / concesionaria</option></select></label></div>' +
    '<label class="f"><span>Fecha de compra</span><input id="c_fechacompra" type="date" value="' + esc(c.fechaCompra || '') + '"></label>';
}
export const datosOrigenCompra = () => (document.getElementById('c_compravend') ? { compraVendedor: val('c_compravend'), compraTipoVendedor: val('c_compratipo'), fechaCompra: val('c_fechacompra') } : {});
const vendedores = () => [...new Set(S.cars.map(c => (c.compraVendedor || '').trim()).filter(Boolean))].sort();
// Gasto de taller en los primeros 6 meses: dice si el auto vino bien o con sorpresas.
function tallerPrimerosMeses(c) {
  const desde = c.fechaCompra || c.inicio; if (!desde) return null;
  const hasta = new Date(parse(desde)); hasta.setMonth(hasta.getMonth() + 6);
  const h = iso(hasta);
  return de('mantenimientos', 'carId', c.id).filter(m => m.carId === c.id && m.fecha >= desde && m.fecha <= h).reduce((a, m) => a + (+m.costo || 0), 0) +
    de('gastos', 'carId', c.id).filter(g => g.carId === c.id && g.fecha >= desde && g.fecha <= h && (g.categoria === 'service' || g.categoria === 'repuestos')).reduce((a, g) => a + (+g.costo || 0), 0);
}
export function comprasPorVendedorView() {
  const grupos = {};
  S.cars.filter(c => c.compraVendedor).forEach(c => {
    const k = c.compraVendedor.trim();
    (grupos[k] = grupos[k] || { vendedor: k, tipo: c.compraTipoVendedor, autos: [] }).autos.push(c);
  });
  const L = Object.values(grupos).map(g => {
    const taller = g.autos.map(tallerPrimerosMeses).filter(x => x != null);
    const rent = g.autos.map(c => rentabilidadAuto(c)).filter(r => r.neta != null);
    return Object.assign(g, { tallerProm: taller.length ? taller.reduce((a, b) => a + b, 0) / taller.length : null, neta: rent.reduce((a, r) => a + r.neta, 0), costo: g.autos.reduce((a, c) => a + (+c.costoCompra || 0), 0) });
  }).sort((a, b) => (a.tallerProm ?? 1e12) - (b.tallerProm ?? 1e12));
  const sin = S.cars.filter(c => !c.compraVendedor).length;
  openModal('<h3>Cómo salió cada compra</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Por vendedor: cuánto gastaste en taller en los primeros 6 meses de cada auto (un auto que vino bien casi no gasta) y lo que dejó en total.</div>' +
    (L.length ? L.map(g => '<div class="card"><div class="row between"><b>' + esc(g.vendedor) + '</b><span class="small muted">' + (g.tipo === 'agencia' ? 'Agencia · ' : g.tipo === 'particular' ? 'Particular · ' : '') + g.autos.length + (g.autos.length === 1 ? ' auto' : ' autos') + '</span></div>' +
      '<div class="small">' + g.autos.map(c => '<a class="tap" style="text-decoration:underline" onclick="carForm(\'' + c.id + '\')">' + esc(c.patente) + '</a>').join(', ') + '</div>' +
      '<div class="row between small" style="margin-top:4px"><span class="muted">Taller en los primeros 6 meses (promedio)</span><b style="color:' + (g.tallerProm > 300000 ? 'var(--bad)' : 'inherit') + '">' + (g.tallerProm != null ? money(g.tallerProm) : '—') + '</b></div>' +
      '<div class="row between small"><span class="muted">Ganancia neta acumulada</span><b style="color:' + (g.neta >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(g.neta) + '</b></div></div>').join('') : '<div class="card empty">Todavía no cargaste a quién le compraste los autos. Se carga en la ficha del auto (Datos).</div>') +
    (sin ? '<div class="small muted" style="margin-top:6px">' + sin + ' autos sin el vendedor cargado.</div>' : '') +
    '<button class="btn sec block" style="margin-top:10px" onclick="closeModal()">Cerrar</button>');
}

/* ---------- Cuánto baja el valor cada 10.000 km ---------- */
function kmEnFecha(c, fecha) {
  const H = (c.kmHistorial || []).filter(h => h.fecha && +h.km).sort((a, b) => a.fecha.localeCompare(b.fecha));
  let km = null;
  H.forEach(h => { if (h.fecha <= fecha) km = +h.km; });
  if (km == null && H.length) km = +H[0].km;
  return km;
}
export function depreciacionPorKm(c) {
  const V = (c.valorMercadoHist || []).filter(v => v.fecha && +v.valor).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (V.length < 2) return null;
  const a = V[0], b = V[V.length - 1];
  const kmA = kmEnFecha(c, a.fecha), kmB = kmEnFecha(c, b.fecha) ?? +c.km;
  if (kmA == null || kmB == null || kmB - kmA < 1000) return null;
  return { por10k: (a.valor - b.valor) / (kmB - kmA) * 10000, desde: a.fecha, hasta: b.fecha, km: kmB - kmA, perdida: a.valor - b.valor, pct10k: (a.valor - b.valor) / a.valor / (kmB - kmA) * 10000 * 100 };
}
export function depreciacionFlota() {
  const L = S.cars.filter(c => !c.vendido).map(c => ({ c, d: depreciacionPorKm(c) })).filter(x => x.d);
  return { autos: L, promedio: L.length ? L.reduce((a, x) => a + x.d.por10k, 0) / L.length : null, promedioPct: L.length ? L.reduce((a, x) => a + x.d.pct10k, 0) / L.length : null };
}
export function textoDepreciacion(c) {
  const d = depreciacionPorKm(c);
  if (!d) return '';
  return '<div class="small muted" style="margin-top:4px">Pierde ~' + money(d.por10k) + ' (' + num1(d.pct10k) + '%) cada 10.000 km · medido entre ' + fdate(d.desde) + ' y ' + fdate(d.hasta) + '</div>';
}

/* ---------- Calendario de compras ---------- */
function netoMensualFlota() {
  // Lo que deja la flota por mes en pesos: promedio de los últimos 3 meses de cobros menos gastos.
  const hoy = today(), desde = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1), d0 = iso(desde), hasta = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const cobrado = S.payments.filter(p => p.fecha >= d0 && p.fecha < hasta && p.tipo !== 'cuota').reduce((a, p) => a + (+p.monto || 0), 0);
  const gastos = S.gastos.filter(g => g.fecha >= d0 && g.fecha < hasta).reduce((a, g) => a + (+g.costo || 0), 0) + S.mantenimientos.filter(m => m.fecha >= d0 && m.fecha < hasta).reduce((a, m) => a + (+m.costo || 0), 0);
  return (cobrado - gastos) / 3;
}
export function calendarioComprasView() {
  const flota = S.cars.filter(c => !c.vendido);
  const ocupados = flota.filter(isContract).length;
  const ocupacion = flota.length ? Math.round(ocupados / flota.length * 100) : 0;
  const esperando = S.drivers.filter(d => !d.inactivo && (d.prospecto ? d.etapaProspecto === 'aprobado' : !S.cars.some(c => c.choferId === d.id && !c.vendido))).length;
  const parados = flota.filter(c => c.tipo === 'disponible').length;
  const costos = flota.map(c => +c.costoCompra || 0).filter(Boolean);
  const precio = +settings.compraPrecioObjetivo || (costos.length ? Math.round(costos.reduce((a, b) => a + b, 0) / costos.length) : 0);
  const caja = +settings.compraCajaHoy || 0;
  const neto = netoMensualFlota();
  const demanda = esperando > parados && ocupacion >= 85 ? ['ok', 'Hay demanda: choferes esperando y la flota casi llena'] : parados > 0 ? ['warn', 'Tenés ' + parados + (parados === 1 ? ' auto parado' : ' autos parados') + ': primero alquilá esos'] : ['soft', 'Demanda normal'];
  const meses = [];
  let acum = caja;
  for (let i = 0; i < 12; i++) {
    const f = new Date(today().getFullYear(), today().getMonth() + i, 1);
    if (i > 0) acum += neto;
    meses.push({ mes: f.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }), acum, alcanza: precio && acum >= precio });
  }
  const primero = meses.findIndex(m => m.alcanza);
  openModal('<h3>Cuándo conviene comprar</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Junta la demanda (choferes esperando, ocupación, autos parados) con la plata que vas juntando según lo que deja la flota por mes.</div>' +
    '<div class="grid" style="margin-bottom:10px"><div class="kpi"><div class="n">' + ocupacion + '%</div><div class="l">Ocupación de la flota</div></div><div class="kpi"><div class="n">' + esperando + '</div><div class="l">Choferes esperando auto</div></div>' +
    '<div class="kpi"><div class="n">' + parados + '</div><div class="l">Autos parados</div></div><div class="kpi"><div class="n">' + money(neto) + '</div><div class="l">Deja la flota por mes (prom. 3 meses)</div></div></div>' +
    '<div class="card" style="margin-bottom:10px">' + badge(demanda[0], demanda[1]) + '</div>' +
    '<div class="two"><label class="f"><span>Plata disponible hoy</span><input id="cm_caja" inputmode="decimal" value="' + esc(caja || '') + '"></label>' +
    '<label class="f"><span>Precio del próximo auto</span><input id="cm_precio" inputmode="decimal" value="' + esc(precio || '') + '"></label></div>' +
    '<button class="btn sec block" style="margin-bottom:10px" onclick="guardarCalendarioCompras()">Recalcular</button>' +
    (precio ? '<div class="card" style="margin-bottom:10px"><b>' + (primero === 0 ? 'Ya te alcanza para comprar' : primero > 0 ? 'Te alcanza en ' + meses[primero].mes : neto > 0 ? 'En 12 meses no llegás: faltan ' + money(precio - meses[11].acum) : 'Con lo que deja hoy la flota no se junta la plata') + '</b>' +
      (primero >= 0 && demanda[0] === 'ok' ? '<div class="small" style="color:var(--ok)">Y hay demanda: es buen momento.</div>' : primero >= 0 && demanda[0] === 'warn' ? '<div class="small" style="color:var(--warn)">Pero tenés autos parados: conviene esperar a alquilarlos.</div>' : '') + '</div>' : '') +
    meses.slice(0, 12).map((m, i) => '<div class="row between small" style="padding:3px 0;' + (i === primero ? 'font-weight:700;color:var(--ok)' : '') + '"><span>' + esc(m.mes) + '</span><span>' + money(m.acum) + (m.alcanza ? ' ✓' : '') + '</span></div>').join('') +
    '<div class="small muted" style="margin-top:8px">Es una estimación: no descuenta retiros ni impuestos. Ajustá la plata disponible cuando cambie.</div>' +
    '<button class="btn sec block" style="margin-top:10px" onclick="closeModal()">Cerrar</button>');
}
export function guardarCalendarioCompras() {
  saveSettings({ compraCajaHoy: +val('cm_caja') || 0, compraPrecioObjetivo: +val('cm_precio') || 0 });
  calendarioComprasView();
}

/* ---------- Precio mínimo de venta ---------- */
export function precioMinimoVenta(c) {
  if (c.tipo === 'financiado' || !+c.costoCompra) return null;
  const r = rentabilidadAuto(c);
  if (r.neta == null) return null;
  const sinPerder = Math.max(0, r.costoCompra - r.neta);
  const meses = c.fechaCompra || c.inicio ? Math.max(1, days(parse(c.fechaCompra || c.inicio), today()) / 30.4) : 12;
  const objetivo = +settings.ventaGananciaAnualPct || 20;
  const conGanancia = Math.max(0, r.costoCompra * (1 + objetivo / 100 * meses / 12) - r.neta);
  return { sinPerder, conGanancia, objetivo, rendido: r.neta, costo: r.costoCompra, meses };
}
export function seccionPrecioMinimo(c) {
  const p = precioMinimoVenta(c); if (!p || c.vendido) return '';
  return '<div class="card" style="margin-bottom:10px"><div class="sec-t" style="margin-top:0">Si lo vendés hoy</div>' +
    '<div class="row between small"><span class="muted">Te costó</span><span>' + money(p.costo) + '</span></div>' +
    '<div class="row between small"><span class="muted">Ya te dejó (cobrado − gastos)</span><span>' + money(p.rendido) + '</span></div>' +
    '<div class="row between" style="margin-top:6px"><b>Precio mínimo para no perder</b><b>' + (p.sinPerder ? money(p.sinPerder) : 'Ya lo recuperaste') + '</b></div>' +
    '<div class="row between small"><span class="muted">Para ganar ' + p.objetivo + '% anual en ' + num1(p.meses) + ' meses</span><b>' + money(p.conGanancia) + '</b></div>' +
    (+c.valorMercado ? '<div class="small muted" style="margin-top:4px">El valor de mercado cargado es ' + money(c.valorMercado) + (c.valorMercado < p.sinPerder ? ': venderlo hoy sería a pérdida.' : '.') + '</div>' : '') +
    textoDepreciacion(c) + '</div>';
}
