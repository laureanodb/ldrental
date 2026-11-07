// Caja chica: la plata que le das a alguien del equipo (el mecánico, el cobrador) para
// gastos del día. Cada gasto que hace con esa plata se carga con su ticket y queda también
// como gasto normal (del auto o general), así cuenta en la rentabilidad. Al final devuelve
// lo que sobró. El saldo de cada persona es: lo que le diste − lo que gastó − lo que devolvió.
import { S } from '../state.js';
import { esc, val, uid, iso, today, fdate, money } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de } from '../memo.js';
import { settings, saveSettings } from '../settings.js';
import { GASTO_CATS } from '../constants.js';
import { subirArchivoSuelto } from '../files.js';
import { isAdmin, isSupervisor } from '../roles.js';

const movs = () => settings.cajaChica || [];
const yo = () => ((S.user && S.user.email) || '').toLowerCase();
const nombre = p => (String(p).includes('@') ? String(p).split('@')[0] : String(p));
const TIPOS = { entrega: 'Le diste', gasto: 'Gastó', devolucion: 'Devolvió' };
const veTodo = () => isAdmin() || isSupervisor();

export function saldos() {
  const S2 = {};
  movs().forEach(m => {
    const k = m.persona;
    S2[k] = S2[k] || { persona: k, entregado: 0, gastado: 0, devuelto: 0, ultimo: '' };
    S2[k][m.tipo === 'entrega' ? 'entregado' : m.tipo === 'gasto' ? 'gastado' : 'devuelto'] += +m.monto || 0;
    if (m.fecha > S2[k].ultimo) S2[k].ultimo = m.fecha;
  });
  return Object.values(S2).map(x => Object.assign(x, { saldo: x.entregado - x.gastado - x.devuelto })).sort((a, b) => b.saldo - a.saldo);
}
// Agrega un movimiento sobre la lista más nueva que haya (por si otro cargó algo recién).
function agregar(m) { saveSettings({ cajaChica: movs().concat([m]).slice(-1000) }); }

let persona = '';
export function cajaChicaView(p) {
  if (p !== undefined) persona = p;
  // Un empleado ve solo su caja.
  if (!veTodo()) persona = yo();
  const L = saldos();
  let h = '<h3>Caja chica</h3>';
  if (!persona) {
    h += '<div class="small muted" style="margin-bottom:10px">La plata que le das a alguien del equipo para gastos del día. Cada gasto se carga con su ticket y queda también en los gastos del auto o en gastos generales.</div>';
    const total = L.reduce((s, x) => s + Math.max(0, x.saldo), 0);
    h += '<div class="card row between" style="margin-bottom:10px"><span class="muted">En manos del equipo</span><b>' + money(total) + '</b></div>';
    h += L.length ? L.map(x => '<div class="card tap row between" onclick="cajaChicaView(\'' + esc(x.persona) + '\')"><div><b>' + esc(nombre(x.persona)) + '</b><div class="small muted">Le diste ' + money(x.entregado) + ' · gastó ' + money(x.gastado) + (x.devuelto ? ' · devolvió ' + money(x.devuelto) : '') + '</div></div>' +
      '<b style="color:' + (x.saldo < 0 ? 'var(--bad)' : 'var(--ink)') + '">' + money(x.saldo) + '</b></div>').join('') : '<div class="card muted">Todavía no le diste plata a nadie.</div>';
    h += '<div class="sec-t">Darle plata a alguien</div>' + formMovimiento('entrega') +
      '<button class="btn sec block" style="margin-top:10px" onclick="closeModal()">Cerrar</button>';
    openModal(h); return;
  }
  const x = L.find(y => y.persona === persona) || { entregado: 0, gastado: 0, devuelto: 0, saldo: 0 };
  const M = movs().filter(m => m.persona === persona).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || '').localeCompare(a.creado || ''));
  h += '<div class="small muted" style="margin-bottom:8px">' + esc(nombre(persona)) + '</div>' +
    '<div class="grid" style="margin-bottom:10px"><div class="kpi ' + (x.saldo < 0 ? 'bad' : '') + '"><div class="n">' + money(x.saldo) + '</div><div class="l">' + (x.saldo < 0 ? 'Puso de su bolsillo' : 'Tiene en la caja') + '</div></div>' +
    '<div class="kpi"><div class="n">' + money(x.gastado) + '</div><div class="l">Gastó en total</div></div></div>';
  h += '<div class="sec-t">Cargar un gasto con la caja</div>' + formMovimiento('gasto');
  if (veTodo()) h += '<details style="margin-top:10px"><summary class="small" style="cursor:pointer">Darle más plata o anotar lo que devolvió</summary>' + formMovimiento('entrega') + formMovimiento('devolucion') + '</details>';
  h += '<div class="sec-t">Movimientos</div>' + (M.length ? M.map(m => {
    const c = m.carId ? de('cars', 'id', m.carId)[0] : null;
    return '<div class="row between small" style="padding:5px 0;border-bottom:1px solid var(--line);gap:8px"><span style="min-width:0">' + fdate(m.fecha) + ' · ' + TIPOS[m.tipo] + (m.concepto ? ': ' + esc(m.concepto) : '') + (c ? ' · ' + esc(c.patente) : '') + (m.foto ? ' · 🧾' : '') + '</span>' +
      '<b style="color:' + (m.tipo === 'entrega' ? 'var(--ok)' : 'var(--ink)') + '">' + (m.tipo === 'entrega' ? '+' : '−') + money(m.monto) + '</b></div>';
  }).join('') : '<div class="small muted">Sin movimientos.</div>');
  h += '<div class="row" style="margin-top:12px">' + (veTodo() ? '<button class="btn sec grow" onclick="cajaChicaView(\'\')">‹ Todas las cajas</button>' : '') + '<button class="btn sec" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
}

function formMovimiento(tipo) {
  const p = 'cc_' + tipo + '_';
  const autos = S.cars.filter(c => !c.vendido).sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  const conocidas = [...new Set(movs().map(m => m.persona))].sort();
  let h = '<div class="card">';
  if (tipo === 'entrega' && !persona) h += '<label class="f"><span>A quién</span><input id="' + p + 'persona" list="cc_personas" placeholder="email del usuario o nombre"><datalist id="cc_personas">' + conocidas.map(x => '<option value="' + esc(x) + '">').join('') + '</datalist></label>';
  h += '<div class="two"><label class="f"><span>' + (tipo === 'entrega' ? 'Cuánto le das' : tipo === 'gasto' ? 'Cuánto gastó' : 'Cuánto devolvió') + '</span><input id="' + p + 'monto" inputmode="decimal"></label>' +
    '<label class="f"><span>Fecha</span><input id="' + p + 'fecha" type="date" value="' + iso(today()) + '"></label></div>';
  if (tipo === 'gasto') {
    h += '<label class="f"><span>En qué</span><input id="' + p + 'concepto" placeholder="ej: lámpara de giro, lavado"></label>' +
      '<div class="two"><label class="f"><span>Tipo de gasto</span><select id="' + p + 'cat">' + GASTO_CATS.map(x => '<option value="' + x[0] + '"' + (x[0] === 'repuestos' ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
      '<label class="f"><span>Auto</span><select id="' + p + 'auto"><option value="">Gasto general</option>' + autos.map(c => '<option value="' + c.id + '">' + esc(c.patente) + '</option>').join('') + '</select></label></div>' +
      '<label class="btn sec block filebtn" style="margin-bottom:8px">Foto del ticket<input id="' + p + 'foto" type="file" accept="image/*,application/pdf" onchange="document.getElementById(\'' + p + 'fotoTxt\').textContent=this.files.length?\'✓ Ticket listo\':\'\'"></label><div class="small muted" id="' + p + 'fotoTxt" style="margin:-4px 0 8px"></div>';
  } else h += '<label class="f"><span>Nota <small>opcional</small></span><input id="' + p + 'concepto"></label>';
  h += '<button class="btn block" id="' + p + 'btn" onclick="guardarCajaChica(\'' + tipo + '\')">' + (tipo === 'entrega' ? 'Anotar entrega' : tipo === 'gasto' ? 'Cargar gasto' : 'Anotar devolución') + '</button></div>';
  return h;
}

export async function guardarCajaChica(tipo) {
  const p = 'cc_' + tipo + '_';
  const quien = persona || (val(p + 'persona') || '').trim().toLowerCase();
  if (!quien) { toast('Elegí a quién'); return; }
  const monto = +val(p + 'monto') || 0;
  if (!(monto > 0)) { toast('Poné el monto'); return; }
  const fecha = val(p + 'fecha') || iso(today());
  const concepto = val(p + 'concepto');
  const btn = document.getElementById(p + 'btn'); if (btn) btn.disabled = true;
  try {
    const m = { id: uid(), tipo, persona: quien, monto, fecha, concepto, por: yo(), creado: new Date().toISOString() };
    if (tipo === 'gasto') {
      if (!concepto) { toast('Contá en qué gastó'); return; }
      const carId = val(p + 'auto');
      const inp = document.getElementById(p + 'foto'); const f = inp && inp.files && inp.files[0];
      let archivo = null;
      if (f) { const r = await subirArchivoSuelto(f); if (r) archivo = { id: r.id, name: f.name || 'ticket.jpg', cat: 'comprobante', type: r.type, size: r.size, fecha }; }
      // También como gasto normal, para que cuente en la rentabilidad.
      const g = { id: uid(), carId, categoria: val(p + 'cat'), fecha, costo: monto, proveedor: '', descripcion: concepto + ' (caja chica de ' + nombre(quien) + ')', sinFactura: !archivo, cajaChica: quien };
      if (archivo) g.files = [archivo];
      if (!(await save('gastos', g))) return;
      m.gastoId = g.id; m.carId = carId; m.foto = archivo ? archivo.id : '';
    }
    agregar(m);
    toast(tipo === 'entrega' ? 'Entrega anotada' : tipo === 'gasto' ? 'Gasto cargado' : 'Devolución anotada');
    cajaChicaView(quien);
  } finally { if (btn) btn.disabled = false; }
}
