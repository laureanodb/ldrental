// Cruce con el resumen de Mercado Pago o del banco.
// Se sube el archivo de movimientos (Excel o CSV; PDF se lee con IA) y se
// compara la plata que entró con los cobros registrados en la app:
// - entraron y están registrados (se pueden marcar como confirmados),
// - entraron pero no están registrados (con botón para registrar el cobro),
// - están registrados como transferencia/Mercado Pago pero no aparecen.
// Los movimientos quedan solo en memoria mientras dure la sesión.
import { S } from '../state.js';
import { esc, money, moneyUSD, fdate, iso, today, parse, days } from '../utils.js';
import { isContract, calc, driverName, badge, seguroPendiente } from '../calc.js';
import { toast } from '../modal.js';
import { save } from '../data.js';
import { render } from '../nav.js';
import { leerDocumento, archivoADataUrl } from '../ia.js';
import { payForm, onPayTipo } from './payment.js';

const CR = { nombre: '', filas: null, cols: null, map: null, movimientos: [], origen: 'transferencia', ignorados: new Set(), cargando: '' };

/* ---------- Lectura del archivo ---------- */
const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
export function leerMonto(v) {
  if (typeof v === 'number') return v;
  let s = String(v == null ? '' : v).trim();
  if (!s) return NaN;
  const neg = /^\(.*\)$/.test(s) || /^-|-$/.test(s.replace(/[$\s]|ars|usd/gi, ''));
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return NaN;
  const ultComa = s.lastIndexOf(','), ultPunto = s.lastIndexOf('.');
  if (ultComa >= 0 && ultPunto >= 0) {
    s = ultComa > ultPunto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (ultComa >= 0) {
    s = /,\d{1,2}$/.test(s) && (s.match(/,/g) || []).length === 1 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (ultPunto >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? NaN : (neg ? -n : n);
}
export function leerFecha(v) {
  if (v instanceof Date && !isNaN(v)) return iso(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return iso(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  const s = String(v == null ? '' : v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return a + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
  return '';
}
// Adivina qué columna es cada cosa mirando los títulos.
export function detectarColumnas(filas) {
  let hi = -1;
  for (let i = 0; i < Math.min(filas.length, 40); i++) {
    const t = (filas[i] || []).map(norm);
    if (t.some(x => /fecha|date/.test(x)) && t.some(x => /monto|importe|amount|credito|valor|ingreso/.test(x))) { hi = i; break; }
  }
  if (hi < 0) return null;
  const tit = (filas[hi] || []).map(norm);
  const idx = re => tit.findIndex(x => re.test(x));
  const fecha = [/fecha de (aprobacion|acreditacion|liquidacion)/, /release_date|settlement_date|date_approved/, /^fecha$/, /fecha|date/].map(idx).find(i => i >= 0);
  const credito = idx(/^credito|creditos|ingreso|entrada/);
  const debito = idx(/^debito|debitos|egreso|salida/);
  const monto = [/net_amount|monto neto|neto recibido|net_credit/, /transaction_amount|monto|importe|amount|valor/].map(re => tit.findIndex(x => re.test(x) && !/saldo|balance|comision|fee|bruto|cuota/.test(x))).find(i => i >= 0);
  const desc = tit.map((x, i) => (/descripci|concepto|detalle|description|pagador|payer|nombre|contraparte|origen|tipo de operacion|transaction_type|referencia de pago/.test(x) ? i : -1)).filter(i => i >= 0);
  const ref = idx(/numero de operacion|n de operacion|operation_id|source_id|reference_id|referencia|comprobante|id de operacion/);
  return { header: hi, titulos: filas[hi].map(x => String(x == null ? '' : x)), fecha: fecha == null ? -1 : fecha, monto: credito >= 0 ? -1 : (monto == null ? -1 : monto), credito, debito, desc, ref };
}
export function movimientosDeFilas(filas, map) {
  const out = [];
  for (let i = map.header + 1; i < filas.length; i++) {
    const r = filas[i] || [];
    const fecha = leerFecha(r[map.fecha]);
    let monto = NaN;
    if (map.credito >= 0) monto = (leerMonto(r[map.credito]) || 0) - (map.debito >= 0 ? (leerMonto(r[map.debito]) || 0) : 0);
    else if (map.monto >= 0) monto = leerMonto(r[map.monto]);
    if (!fecha || !monto || isNaN(monto)) continue;
    const descripcion = map.desc.map(j => String(r[j] == null ? '' : r[j]).trim()).filter(Boolean).join(' · ').slice(0, 200);
    out.push({ fecha, monto: Math.round(monto * 100) / 100, descripcion, referencia: map.ref >= 0 ? String(r[map.ref] == null ? '' : r[map.ref]).trim() : '' });
  }
  return out;
}

export async function cruceArchivo() {
  const inp = document.getElementById('cr_file'); const f = inp && inp.files && inp.files[0]; if (!f) return;
  inp.value = '';
  CR.nombre = f.name || 'archivo'; CR.filas = null; CR.map = null; CR.movimientos = []; CR.ignorados = new Set();
  if (/mercado|mp_|settlement|release|account_money/i.test(CR.nombre)) CR.origen = 'mercadopago';
  const esPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
  if (esPdf || (f.type || '').startsWith('image/')) {
    if (f.size > 10e6) { toast('El archivo es muy pesado (máximo 10 MB)'); return; }
    CR.cargando = 'Leyendo el resumen con IA… puede tardar un minuto.'; render();
    let archivo;
    try { archivo = await archivoADataUrl(f); } catch (e) { CR.cargando = ''; render(); toast('No se pudo abrir el archivo'); return; }
    const j = await leerDocumento('resumen', { archivo });
    CR.cargando = '';
    if (!j.ok) { render(); toast('No se pudo leer con IA: ' + j.error); return; }
    CR.movimientos = j.datos.movimientos;
    if (!CR.movimientos.length) toast('La IA no encontró movimientos en el archivo');
    render(); return;
  }
  try {
    CR.cargando = 'Leyendo el archivo…'; render();
    const XLSX = await import('xlsx');
    // En un CSV los montos quedan como texto ("150.000,00"): si no, se leen con formato de EE.UU.
    const esCsv = /\.(csv|txt)$/i.test(f.name || '') || /csv|text\/plain/.test(f.type || '');
    const wb = XLSX.read(await f.arrayBuffer(), esCsv ? { type: 'array', raw: true } : { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    CR.filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    CR.map = detectarColumnas(CR.filas);
    if (CR.map && CR.map.titulos.some(t => /settlement|release|transaction_net/i.test(t))) CR.origen = 'mercadopago';
    CR.movimientos = CR.map ? movimientosDeFilas(CR.filas, CR.map) : [];
    CR.cargando = '';
    if (!CR.map) toast('No encontré las columnas de fecha y monto: elegilas abajo');
  } catch (e) {
    CR.cargando = ''; toast('No se pudo leer el archivo. Probá exportarlo como Excel o CSV.');
  }
  render();
}
export function cruceColumna(campo, v) {
  if (!CR.filas) return;
  if (!CR.map) CR.map = { header: 0, titulos: (CR.filas[0] || []).map(x => String(x)), fecha: -1, monto: -1, credito: -1, debito: -1, desc: [], ref: -1 };
  const i = +v;
  if (campo === 'desc') CR.map.desc = i >= 0 ? [i] : [];
  else if (campo === 'monto') { CR.map.monto = i; CR.map.credito = -1; CR.map.debito = -1; }
  else CR.map[campo] = i;
  CR.movimientos = movimientosDeFilas(CR.filas, CR.map);
  render();
}
export function cruceOrigen(v) { CR.origen = v; render(); }
export function cruceLimpiar() { Object.assign(CR, { nombre: '', filas: null, map: null, movimientos: [], ignorados: new Set(), cargando: '' }); render(); }

/* ---------- Cruce ---------- */
function palabras(s) { return norm(s).split(/[^a-z]+/).filter(w => w.length > 3); }
function choferEnTexto(texto) {
  const t = palabras(texto);
  if (!t.length) return null;
  const cands = S.drivers.filter(d => !d.inactivo && !d.prospecto).map(d => ({ d, n: palabras(d.nombre).filter(w => t.includes(w)).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  return cands.length && (cands.length === 1 || cands[0].n > cands[1].n) ? cands[0].d : null;
}
export function cruzar(movs, pagos) {
  const entradas = movs.map((m, i) => Object.assign({ i }, m)).filter(m => m.monto > 0);
  if (!entradas.length) return { ok: [], faltan: [], sinMov: [] };
  const fechas = entradas.map(m => m.fecha).sort();
  const desde = fechas[0], hasta = fechas[fechas.length - 1];
  const cerca = (a, b) => Math.abs(days(parse(a), parse(b)));
  const corrida = (f, n) => { const d = parse(f); d.setDate(d.getDate() + n); return iso(d); };
  const d0 = corrida(desde, -5), d1 = corrida(hasta, 5);
  const libres = pagos.filter(p => p.fecha && p.fecha >= d0 && p.fecha <= d1);
  const usados = new Set();
  const ok = [], faltan = [];
  entradas.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(m => {
    const chofer = choferEnTexto(m.descripcion);
    const cands = libres.filter(p => !usados.has(p.id) && Math.abs((+p.monto || 0) - m.monto) < 1 && cerca(p.fecha, m.fecha) <= 4)
      .map(p => ({ p, score: (m.referencia && p.comprobanteRef && String(p.comprobanteRef) === String(m.referencia) ? -100 : 0) + (chofer && p.choferId === chofer.id ? -10 : 0) + cerca(p.fecha, m.fecha) }))
      .sort((a, b) => a.score - b.score);
    if (cands.length) { usados.add(cands[0].p.id); ok.push({ m, p: cands[0].p }); }
    else faltan.push(Object.assign({ chofer }, m));
  });
  const sinMov = libres.filter(p => !usados.has(p.id) && (p.metodo === 'transferencia' || p.metodo === 'mercadopago') && p.fecha >= desde && p.fecha <= hasta);
  return { ok, faltan, sinMov };
}
function autoSugerido(m) {
  const conDeuda = c => isContract(c) && c.choferId && !c.vendido;
  if (m.chofer) {
    const cs = S.cars.filter(c => conDeuda(c) && c.choferId === m.chofer.id);
    if (cs.length) return cs.find(c => Math.abs((+c.monto || 0) - m.monto) < 1) || cs[0];
  }
  const porMonto = S.cars.filter(c => conDeuda(c) && c.tipo === 'alquiler' && Math.abs((+c.monto || 0) - m.monto) < 1 && calc(c).debt > 0);
  return porMonto.length === 1 ? porMonto[0] : null;
}

export function cruceCobrar(i) {
  const m = CR.movimientos[i]; if (!m) return;
  const c = autoSugerido(Object.assign({ chofer: choferEnTexto(m.descripcion) }, m));
  payForm(c ? c.id : undefined);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  if (c && c.choferId && Math.abs(seguroPendiente(c.choferId) - m.monto) < 1 && Math.abs((+c.monto || 0) - m.monto) >= 1) { set('p_tipo', 'seguro'); onPayTipo(); }
  set('p_monto', m.monto); set('p_fecha', m.fecha); set('p_metodo', CR.origen);
  set('p_nota', ('Resumen: ' + (m.referencia ? 'op. ' + m.referencia + ' · ' : '') + m.descripcion).slice(0, 160));
  const info = document.getElementById('p_ia');
  if (info) { info.style.color = 'var(--muted)'; info.textContent = 'Datos tomados del resumen' + (c ? '' : ': elegí el auto') + '. Revisá antes de guardar.'; }
}
export function cruceIgnorar(i) { CR.ignorados.add(i); render(); }
export async function cruceConfirmar() {
  const { ok } = cruzar(CR.movimientos, S.payments);
  const pend = ok.filter(x => !x.p.conciliado);
  if (!pend.length) { toast('No hay cobros para confirmar'); return; }
  let n = 0;
  for (const x of pend) {
    if (await save('payments', Object.assign({}, x.p, { conciliado: true, conciliadoFecha: iso(today()), conciliadoRef: x.m.referencia || '' }))) n++;
  }
  toast(n + (n === 1 ? ' cobro confirmado' : ' cobros confirmados') + ' en el ' + (CR.origen === 'mercadopago' ? 'resumen de Mercado Pago' : 'banco'));
  render();
}

/* ---------- Pantalla ---------- */
const monP = p => (p.tipo === 'cuota' ? moneyUSD(p.monto) : money(p.monto));
function colSelect(campo, actual) {
  const tit = (CR.map && CR.map.titulos) || (CR.filas && CR.filas[0] || []).map(x => String(x));
  return '<select onchange="cruceColumna(\'' + campo + '\',this.value)"><option value="-1">—</option>' + tit.map((t, i) => '<option value="' + i + '"' + (i === actual ? ' selected' : '') + '>' + esc(t || 'Columna ' + (i + 1)) + '</option>').join('') + '</select>';
}
export function viewCruce() {
  let h = '<div class="small muted" style="margin-bottom:10px">Subí el resumen de Mercado Pago o del banco y la app te dice qué cobros ya entraron, cuáles faltan registrar y cuáles no aparecen. En Mercado Pago: <b>Tu dinero → Reportes → Descargar</b> (Excel o CSV). Del banco sirve el Excel, o el PDF (se lee con IA).</div>';
  h += '<div class="card"><label class="btn block filebtn">' + (CR.nombre ? 'Cambiar archivo' : 'Elegir archivo (Excel, CSV o PDF)') + '<input id="cr_file" type="file" accept=".xlsx,.xls,.csv,.pdf,application/pdf,image/*" onchange="cruceArchivo()"></label>' +
    (CR.nombre ? '<div class="small muted" style="margin-top:6px;overflow-wrap:anywhere">' + esc(CR.nombre) + ' · ' + CR.movimientos.length + ' movimientos <a class="tap" style="text-decoration:underline" onclick="cruceLimpiar()">quitar</a></div>' : '') +
    (CR.cargando ? '<div class="small" style="margin-top:6px">' + esc(CR.cargando) + '</div>' : '') +
    '<label class="f" style="margin-top:8px"><span>La plata entró por</span><select onchange="cruceOrigen(this.value)"><option value="transferencia"' + (CR.origen === 'transferencia' ? ' selected' : '') + '>Banco (transferencia)</option><option value="mercadopago"' + (CR.origen === 'mercadopago' ? ' selected' : '') + '>Mercado Pago</option></select></label>';
  if (CR.filas) {
    const mp = CR.map || { fecha: -1, monto: -1, credito: -1, desc: [], ref: -1 };
    h += '<details' + (CR.map && CR.movimientos.length ? '' : ' open') + '><summary class="small muted" style="cursor:pointer">Columnas del archivo</summary>' +
      '<div class="two"><label class="f"><span>Fecha</span>' + colSelect('fecha', mp.fecha) + '</label><label class="f"><span>Monto</span>' + colSelect('monto', mp.credito >= 0 ? mp.credito : mp.monto) + '</label></div>' +
      '<div class="two"><label class="f"><span>Descripción</span>' + colSelect('desc', mp.desc[0]) + '</label><label class="f"><span>N° de operación</span>' + colSelect('ref', mp.ref) + '</label></div></details>';
  }
  h += '</div>';
  if (!CR.movimientos.length) return h;

  const { ok, faltan, sinMov } = cruzar(CR.movimientos, S.payments);
  const faltanVis = faltan.filter(m => !CR.ignorados.has(m.i));
  const tot = L => L.reduce((a, x) => a + (+(x.m ? x.m.monto : x.monto) || 0), 0);
  const salidas = CR.movimientos.filter(m => m.monto < 0).length;
  const kpi = (n, color, l, sub) => '<div class="kpi"><div class="n" style="color:' + color + '">' + n + '</div><div class="l">' + l + '</div><div class="small muted">' + sub + '</div></div>';
  h += '<div class="grid" style="grid-template-columns:1fr 1fr 1fr;margin:10px 0">' +
    kpi(ok.length, 'var(--ok)', 'Entraron y están', money(tot(ok))) +
    kpi(faltanVis.length, faltanVis.length ? 'var(--warn)' : 'var(--ok)', 'Faltan registrar', money(tot(faltanVis))) +
    kpi(sinMov.length, sinMov.length ? 'var(--bad)' : 'var(--ok)', 'No aparecen', money(sinMov.reduce((a, p) => a + (+p.monto || 0), 0))) + '</div>';
  if (salidas) h += '<div class="small muted" style="margin-bottom:8px">Se ignoraron ' + salidas + ' movimientos de salida de plata.</div>';

  h += '<div class="sec-t">Entraron pero no están registrados</div>';
  h += faltanVis.length ? faltanVis.map(m => {
    const c = autoSugerido(m);
    return '<div class="card"><div class="row between"><b>' + money(m.monto) + '</b><span class="small muted">' + fdate(m.fecha) + '</span></div>' +
      '<div class="small" style="overflow-wrap:anywhere">' + esc(m.descripcion || 'Sin descripción') + (m.referencia ? ' <span class="muted">· op. ' + esc(m.referencia) + '</span>' : '') + '</div>' +
      (c ? '<div class="small muted">Parece de ' + esc(driverName(c.choferId)) + ' · ' + esc(c.patente) + '</div>' : '') +
      '<div class="row" style="margin-top:6px"><button class="btn sm grow" onclick="cruceCobrar(' + m.i + ')">Registrar cobro</button><button class="btn sec sm" onclick="cruceIgnorar(' + m.i + ')">No es un cobro</button></div></div>';
  }).join('') : '<div class="card empty">Todo lo que entró está registrado.</div>';

  h += '<div class="sec-t">Registrados pero no aparecen en el resumen</div>';
  h += sinMov.length ? '<div class="small muted" style="margin-bottom:6px">Están cargados como transferencia o Mercado Pago en esas fechas, pero no se encontró la plata. Revisá si entró a otra cuenta o si se cargó mal.</div>' +
    sinMov.map(p => '<div class="card row between"><div><div>' + monP(p) + ' · ' + esc(driverName(p.choferId) || 'sin chofer') + '</div><div class="small muted">' + fdate(p.fecha) + (p.nota ? ' · ' + esc(p.nota) : '') + '</div></div>' + badge('bad', 'No aparece') + '</div>').join('')
    : '<div class="card empty">Todos los cobros por transferencia de esas fechas aparecen.</div>';

  const sinConfirmar = ok.filter(x => !x.p.conciliado).length;
  h += '<div class="sec-t row between">Entraron y están registrados' + (sinConfirmar ? '<button class="btn sm" onclick="cruceConfirmar()">Marcar ' + sinConfirmar + ' como confirmados</button>' : '') + '</div>';
  h += ok.length ? '<details><summary class="small muted" style="cursor:pointer">Ver los ' + ok.length + '</summary>' + ok.map(x => '<div class="card row between"><div><div>' + money(x.m.monto) + ' · ' + esc(driverName(x.p.choferId) || '') + '</div><div class="small muted">' + fdate(x.m.fecha) + ' · ' + esc(x.m.descripcion).slice(0, 80) + '</div></div>' + (x.p.conciliado ? badge('ok', '✓ Confirmado') : badge('soft', 'Coincide')) + '</div>').join('') + '</details>'
    : '<div class="card empty">Ningún movimiento coincide con un cobro registrado.</div>';
  return h;
}
