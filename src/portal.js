import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { esc, money, moneyUSD, fdate } from './utils.js';
import { brandH1, settings } from './settings.js';

function pantalla(app, inner) {
  app.innerHTML = '<div class="login" style="max-width:480px">' + brandH1() + inner + '</div>';
}

export async function initPortal(driverId, token) {
  const nav = document.getElementById('nav'); if (nav) nav.style.display = 'none';
  const app = document.getElementById('app');
  pantalla(app, '<p class="sub">Cargando tu estado de cuenta…</p>');
  let j;
  try {
    const url = SUPABASE_URL + '/functions/v1/portal-chofer?id=' + encodeURIComponent(driverId) + '&t=' + encodeURIComponent(token);
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + SUPABASE_KEY, apikey: SUPABASE_KEY } });
    j = await r.json();
    if (!r.ok || !j.ok) { pantalla(app, '<div class="card"><b>Link inválido o vencido</b><p class="small muted">Pedile a la empresa que te mande un link nuevo.</p></div>'); return; }
  } catch (e) {
    pantalla(app, '<div class="card"><b>No se pudo cargar</b><p class="small muted">Revisá tu conexión e intentá de nuevo.</p></div>');
    return;
  }
  pantalla(app, '');
  renderPortal(app, j);
}

function renderPortal(app, j) {
  let h = '<p class="sub">Hola ' + esc(j.nombre || '') + '</p>';
  const autos = j.autos || [];
  if (!autos.length) {
    h += '<div class="card empty">No tenés un auto asignado en este momento.</div>';
  } else {
    autos.forEach(a => {
      const mon = a.moneda === 'USD' ? moneyUSD : money;
      h += '<div class="sec-t">' + esc(a.patente || 'Auto') + (a.marca || a.modelo ? ' <span class="small muted">' + esc([a.marca, a.modelo].filter(Boolean).join(' ')) + '</span>' : '') + '</div>' +
      '<div class="card">' +
      '<div class="row between"><span class="muted">Deuda actual</span><b style="color:' + (a.debt > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + mon(a.debt) + '</b></div>' +
      (a.proximo ? '<div class="row between"><span class="muted">Próximo pago</span><b>' + fdate(a.proximo) + '</b></div>' : '') +
      (a.vtv ? '<div class="row between small"><span class="muted">VTV</span><span>' + fdate(a.vtv) + '</span></div>' : '') +
      (a.seguro ? '<div class="row between small"><span class="muted">Seguro</span><span>' + fdate(a.seguro) + '</span></div>' : '') +
      '</div>';
    });
  }
  const pagos = j.pagos || [];
  if (pagos.length) {
    h += '<div class="sec-t">Historial de pagos</div>' + pagos.map((p, i) => '<div class="card row between"><div><div>' + fdate(p.fecha) + '</div><div class="small muted">' + esc(p.metodoLabel || '') + (p.patente ? ' · ' + esc(p.patente) : '') + '</div></div>' +
    '<div class="row" style="align-items:center;gap:8px"><b>' + (p.tipo === 'cuota' ? moneyUSD(p.monto) : money(p.monto)) + '</b><button class="btn sec sm" data-recibo="' + i + '">Recibo</button></div></div>').join('');
  }
  const wrap = app.querySelector('.login');
  wrap.insertAdjacentHTML('beforeend', h);
  wrap.querySelectorAll('[data-recibo]').forEach(btn => {
    btn.addEventListener('click', () => descargarReciboPortal(j, pagos[+btn.dataset.recibo]));
  });
}

async function descargarReciboPortal(j, p) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  let y = 18;
  doc.setFontSize(16); doc.text(settings.companyName || 'LD Rental', 12, y); y += 8;
  doc.setFontSize(11); doc.text('Recibo de cobro', 12, y); y += 10;
  doc.setFontSize(10);
  const linea = (label, val) => { doc.text(label, 12, y); doc.text(String(val), 60, y); y += 7; };
  linea('Fecha:', fdate(p.fecha));
  if (p.patente) linea('Auto:', p.patente);
  linea('Chofer:', j.nombre || '—');
  linea('Concepto:', p.tipo === 'alquiler' ? 'Alquiler semanal' : p.tipo === 'cuota' ? 'Cuota de financiación' : 'Otro');
  if (p.metodoLabel) linea('Método de pago:', p.metodoLabel);
  y += 4;
  doc.setFontSize(13); doc.text('Monto: ' + (p.tipo === 'cuota' ? moneyUSD(p.monto) : money(p.monto)), 12, y);
  y += 14;
  doc.setFontSize(8); doc.setTextColor(140); doc.text('Comprobante generado por ' + (settings.companyName || 'LD Rental'), 12, y);
  doc.save('recibo-' + (p.patente || 'auto') + '-' + p.fecha + '.pdf');
}
