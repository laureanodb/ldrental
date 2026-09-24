import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { esc, money, moneyUSD, fdate } from './utils.js';
import { brandH1, settings } from './settings.js';

function pantalla(app, inner) {
  app.innerHTML = '<div class="login" style="max-width:480px">' + brandH1() + inner + '</div>';
}

let PORTAL_ID = '', PORTAL_TOKEN = '';

export async function initPortal(driverId, token) {
  PORTAL_ID = driverId; PORTAL_TOKEN = token;
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
async function enviarAccionPortal(body, statusEl, btn) {
  btn.disabled = true;
  statusEl.textContent = 'Enviando…';
  try {
    const url = SUPABASE_URL + '/functions/v1/portal-chofer';
    const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + SUPABASE_KEY, apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ id: PORTAL_ID, t: PORTAL_TOKEN }, body)) });
    const j = await r.json();
    statusEl.textContent = j.ok ? 'Listo, avisamos a la empresa.' : 'No se pudo enviar, probá de nuevo.';
  } catch (e) {
    statusEl.textContent = 'No se pudo enviar, revisá tu conexión.';
  }
  btn.disabled = false;
}

function renderPortal(app, j) {
  let h = '<p class="sub">Hola ' + esc(j.nombre || '') + '</p>';
  const anuncios = (settings.anuncios || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5);
  if (anuncios.length) {
    h += '<div class="sec-t">Anuncios</div>' + anuncios.map(a => '<div class="card"><div>' + esc(a.texto) + '</div><div class="small muted" style="margin-top:4px">' + fdate(a.fecha) + '</div></div>').join('');
  }
  if (settings.telefonoEmergencia || settings.protocoloEmergencia) {
    h += '<details class="card" style="margin-bottom:14px"><summary style="cursor:pointer">Protocolo de emergencia</summary>' +
    (settings.telefonoEmergencia ? '<a class="btn block" style="margin-top:10px" href="tel:' + esc(settings.telefonoEmergencia) + '">Llamar a ' + esc(settings.telefonoEmergencia) + '</a>' : '') +
    (settings.protocoloEmergencia ? '<div class="small" style="white-space:pre-wrap;margin-top:10px">' + esc(settings.protocoloEmergencia) + '</div>' : '') +
    '</details>';
  }
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
      (a.tipo === 'financiado' && a.cuotas ? '<div class="row between small"><span class="muted">Cuota actual</span><span>' + a.cuotaActual + ' de ' + a.cuotas + '</span></div>' : '') +
      (a.tipo === 'financiado' && a.saldo != null ? '<div class="row between small"><span class="muted">Saldo total</span><span>' + moneyUSD(a.saldo) + '</span></div>' : '') +
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
  if (autos.length) {
    h += '<div class="sec-t">Pedir turno de service</div><div class="card">' +
    '<label class="f"><span>Auto</span><select id="pt_patente">' + autos.map(a => '<option value="' + esc(a.patente) + '">' + esc(a.patente) + '</option>').join('') + '</select></label>' +
    '<label class="f"><span>Motivo</span><textarea id="pt_motivo" placeholder="ej: cambio de aceite, ruido en el freno..."></textarea></label>' +
    '<button class="btn sec block" id="pt_btn">Pedir turno</button>' +
    '<div class="small muted" id="pt_status" style="margin-top:6px"></div></div>';
  }
  h += '<div class="sec-t">¿Cómo te está yendo con nosotros?</div><div class="card">' +
  '<div class="row" style="gap:6px;margin-bottom:8px">' + [1, 2, 3, 4, 5].map(n => '<button type="button" class="btn sec sm" data-rating="' + n + '">' + n + ' ★</button>').join('') + '</div>' +
  '<label class="f"><span>Comentario <small>opcional</small></span><textarea id="en_comentario"></textarea></label>' +
  '<button class="btn sec block" id="en_btn">Enviar</button>' +
  '<div class="small muted" id="en_status" style="margin-top:6px"></div></div>';
  const wrap = app.querySelector('.login');
  wrap.insertAdjacentHTML('beforeend', h);
  wrap.querySelectorAll('[data-recibo]').forEach(btn => {
    btn.addEventListener('click', () => descargarReciboPortal(j, pagos[+btn.dataset.recibo]));
  });
  const ptBtn = wrap.querySelector('#pt_btn');
  if (ptBtn) ptBtn.addEventListener('click', () => enviarAccionPortal(
    { accion: 'service', patente: wrap.querySelector('#pt_patente').value, motivo: wrap.querySelector('#pt_motivo').value },
    wrap.querySelector('#pt_status'), ptBtn
  ));
  let ratingSel = 0;
  wrap.querySelectorAll('[data-rating]').forEach(b => b.addEventListener('click', () => {
    ratingSel = +b.dataset.rating;
    wrap.querySelectorAll('[data-rating]').forEach(x => x.classList.toggle('on', x === b));
  }));
  const enBtn = wrap.querySelector('#en_btn');
  if (enBtn) enBtn.addEventListener('click', () => {
    if (!ratingSel) { wrap.querySelector('#en_status').textContent = 'Elegí una calificación'; return; }
    enviarAccionPortal({ accion: 'encuesta', rating: ratingSel, comentario: wrap.querySelector('#en_comentario').value }, wrap.querySelector('#en_status'), enBtn);
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
