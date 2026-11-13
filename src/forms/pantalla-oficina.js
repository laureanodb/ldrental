// Pantalla para la oficina: tablero grande para dejar abierto en un televisor o una compu.
// Se actualiza solo cada minuto (y cuando llegan cambios). Muestra lo cobrado hoy y en la
// semana contra la meta, la deuda, cómo está la flota y quién tiene que pagar hoy.
import { S } from '../state.js';
import { esc, iso, today, money } from '../utils.js';
import { isContract, calc, driverName, urgent } from '../calc.js';
import { metaSemanal } from './meta-semanal.js';
import { cobroEnFecha } from './agenda.js';
import { settings } from '../settings.js';

let timer = null, wake = null;
const pct = (a, b) => (b > 0 ? Math.min(100, Math.round(a / b * 100)) : 0);

function contenido() {
  const hoy = iso(today());
  const cobradoHoy = S.payments.filter(p => p.fecha === hoy && p.tipo !== 'cuota').reduce((s, p) => s + (+p.monto || 0), 0);
  const m = metaSemanal();
  const autos = S.cars.filter(c => !c.vendido);
  const trabajando = autos.filter(c => isContract(c) && c.choferId).length;
  const libres = autos.filter(c => c.tipo === 'disponible').length, taller = autos.filter(c => c.tipo === 'taller').length;
  const deuda = autos.filter(c => isContract(c) && c.tipo !== 'financiado').reduce((s, c) => s + (calc(c).debt || 0), 0);
  const morosos = autos.filter(c => isContract(c) && c.tipo !== 'financiado' && calc(c).debt > 0).length;
  const pagaHoy = autos.filter(c => cobroEnFecha(c, hoy)).map(c => ({ c, i: calc(c), pago: S.payments.some(p => p.carId === c.id && p.fecha === hoy) }));
  const p = pct(m.cobrado, m.esperado);
  const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const fecha = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, x => x.toUpperCase());
  const kpi = (n, l, color) => '<div class="po-kpi"><div class="po-n"' + (color ? ' style="color:' + color + '"' : '') + '>' + n + '</div><div class="po-l">' + l + '</div></div>';
  return '<div class="po-top"><div><div class="po-emp">' + esc(settings.companyName || 'LD Rental') + '</div><div class="po-fecha">' + esc(fecha) + '</div></div><div class="po-hora">' + hora + '</div></div>' +
    '<div class="po-grid">' +
    kpi(money(cobradoHoy), 'Cobrado hoy') +
    kpi(money(m.cobrado), 'Cobrado esta semana · ' + p + '% de ' + money(m.esperado), p >= 90 ? 'var(--ok)' : p >= 50 ? 'var(--soft-c)' : 'var(--bad)') +
    kpi(money(deuda), morosos + (morosos === 1 ? ' chofer debe' : ' choferes deben'), deuda > 0 ? 'var(--bad)' : 'var(--ok)') +
    kpi(trabajando + ' / ' + autos.length, 'Autos trabajando · ' + libres + ' libres · ' + taller + ' en taller') +
    '</div>' +
    '<div class="po-barra"><div style="width:' + p + '%"></div></div>' +
    '<div class="po-cols"><div class="po-box"><div class="po-t">Pagan hoy (' + pagaHoy.length + ')</div>' +
    (pagaHoy.length ? pagaHoy.slice(0, 12).map(x => '<div class="po-fila"><span>' + esc(driverName(x.c.choferId) || 'Sin chofer') + ' <span class="po-mut">' + esc(x.c.patente) + '</span></span><b style="color:' + (x.pago ? 'var(--ok)' : x.i.debt > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + (x.pago ? '✓ Pagó' : x.i.debt > 0 ? 'Debe ' + money(x.i.debt) : 'Al día') + '</b></div>').join('') : '<div class="po-mut">Hoy no vence ningún pago.</div>') + '</div>' +
    '<div class="po-box"><div class="po-t">Avisos urgentes (' + urgent().length + ')</div>' +
    (urgent().length ? urgent().slice(0, 8).map(a => '<div class="po-fila"><span>' + esc(a.who) + ' <span class="po-mut">' + esc(a.sub) + '</span></span><b>' + esc(a.t) + '</b></div>').join('') : '<div class="po-mut">Nada urgente.</div>') + '</div></div>' +
    '<div class="po-pie">Se actualiza solo · ' + hora + ' · <button onclick="salirPantallaOficina()">Salir</button></div>';
}
const CSS = '#po{position:fixed;inset:0;z-index:200;background:var(--bg);color:var(--ink);overflow:auto;padding:calc(20px + env(safe-area-inset-top,0px)) max(20px,env(safe-area-inset-right,0px)) calc(20px + env(safe-area-inset-bottom,0px)) max(20px,env(safe-area-inset-left,0px));font-size:clamp(14px,1.4vw,22px)}' +
  '#po .po-top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:2vh}#po .po-emp{font-size:2.2em;font-weight:800}#po .po-fecha{color:var(--muted)}#po .po-hora{font-size:3em;font-weight:800;font-variant-numeric:tabular-nums}' +
  '#po .po-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(14em,1fr));gap:1.2vw}#po .po-kpi{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:1.2em}#po .po-n{font-size:2.4em;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1}#po .po-l{color:var(--muted);margin-top:.3em}' +
  '#po .po-barra{height:12px;background:var(--soft);border-radius:8px;overflow:hidden;margin:1.5vh 0}#po .po-barra>div{height:100%;background:var(--ok)}' +
  '#po .po-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(18em,1fr));gap:1.2vw}#po .po-box{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:1em 1.2em;min-width:0}#po .po-t{font-weight:800;margin-bottom:.5em}' +
  '#po .po-fila{display:flex;justify-content:space-between;gap:1em;padding:.35em 0;border-top:1px solid var(--line)}#po .po-fila span{min-width:0}#po .po-mut{color:var(--muted)}' +
  '#po .po-pie{color:var(--muted);text-align:center;margin-top:2vh;font-size:.8em}#po .po-pie button{font:inherit;background:none;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:.2em .8em;cursor:pointer}';

export function pantallaOficina() {
  salirPantallaOficina();
  if (window.closeModal) window.closeModal();
  if (!document.getElementById('po_css')) { const st = document.createElement('style'); st.id = 'po_css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div'); el.id = 'po'; el.innerHTML = contenido();
  document.body.appendChild(el);
  timer = setInterval(() => { const x = document.getElementById('po'); if (x) x.innerHTML = contenido(); else salirPantallaOficina(); }, 60000);
  // Pantalla completa y que no se apague (si el navegador lo permite).
  try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { wake = w; }).catch(() => {}); } catch (e) {}
}
export function refrescarPantallaOficina() { const x = document.getElementById('po'); if (x) x.innerHTML = contenido(); }
export function salirPantallaOficina() {
  clearInterval(timer); timer = null;
  const el = document.getElementById('po'); if (el) el.remove();
  try { if (wake) wake.release(); } catch (e) {} wake = null;
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
}
