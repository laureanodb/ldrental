import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { esc, money, moneyUSD, fdate, today, parse, days } from './utils.js';
import { brandH1, settings } from './settings.js';

const TEMA_KEY = 'portal-tema';
function temaGuardado() { try { return localStorage.getItem(TEMA_KEY) || ''; } catch (e) { return ''; } }
export function toggleTemaPortal() {
  const actual = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const nuevo = actual === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = nuevo;
  try { localStorage.setItem(TEMA_KEY, nuevo); } catch (e) {}
  const btn = document.getElementById('portal-tema-btn');
  if (btn) btn.textContent = nuevo === 'dark' ? '☀ Modo claro' : '🌙 Modo oscuro';
}
function aplicarTemaGuardado() {
  const t = temaGuardado();
  if (t) document.documentElement.dataset.theme = t;
}

function brandH1Portal(j) {
  const logo = (j && j.companyLogo) || settings.companyLogo;
  const nombre = (j && j.companyName) || settings.companyName || 'LD Rental';
  return (logo ? '<img src="' + logo + '" alt="" style="height:32px;display:block;margin-bottom:6px">' : '') + '<h1>' + esc(nombre) + '</h1>';
}
function pantalla(app, inner, j) {
  app.innerHTML = '<div class="login" style="max-width:480px">' + (j ? brandH1Portal(j) : brandH1()) +
  '<div class="row" style="justify-content:flex-end;margin:-4px 0 8px"><button type="button" class="btn sec sm" id="portal-tema-btn" onclick="toggleTemaPortal()">' + (document.documentElement.dataset.theme === 'dark' ? '☀ Modo claro' : '🌙 Modo oscuro') + '</button></div>' +
  inner + '</div>';
}

let PORTAL_ID = '', PORTAL_TOKEN = '';

export async function initPortal(driverId, token) {
  PORTAL_ID = driverId; PORTAL_TOKEN = token;
  aplicarTemaGuardado();
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
  pantalla(app, '', j);
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
  const companyPhone = j.companyPhone || settings.companyPhone;
  if (companyPhone) {
    h += '<a class="btn block" style="margin-bottom:14px" target="_blank" href="https://wa.me/' + esc(companyPhone.replace(/\D/g, '')) + '?text=' + encodeURIComponent('Hola, soy ' + (j.nombre || '') + '.') + '">Contactar por WhatsApp</a>';
  }
  const anuncios = (j.anuncios && j.anuncios.length ? j.anuncios : (settings.anuncios || [])).slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5);
  if (anuncios.length) {
    h += '<div class="sec-t">Anuncios</div>' + anuncios.map(a => '<div class="card"><div>' + esc(a.texto) + '</div><div class="small muted" style="margin-top:4px">' + fdate(a.fecha) + '</div></div>').join('');
  }
  const telEmergencia = j.telefonoEmergencia || settings.telefonoEmergencia;
  const protocolo = j.protocoloEmergencia || settings.protocoloEmergencia;
  if (telEmergencia || protocolo) {
    h += '<div class="sec-t">Protocolo de emergencia</div><div class="card" style="margin-bottom:14px">' +
    (telEmergencia ? '<a class="btn block" href="tel:' + esc(telEmergencia) + '">Llamar a ' + esc(telEmergencia) + '</a>' : '') +
    (protocolo ? '<div class="small" style="white-space:pre-wrap;margin-top:10px">' + esc(protocolo) + '</div>' : '') +
    '</div>';
  }
  if (j.deposito || j.semanaAdelantada) {
    h += '<div class="sec-t">Tu cuenta con nosotros</div><div class="card" style="margin-bottom:14px">' +
    (j.deposito ? '<div class="row between small"><span class="muted">Depósito de garantía</span><b>' + money(j.deposito) + (j.depositoObjetivo ? ' de ' + money(j.depositoObjetivo) : '') + '</b></div>' : '') +
    (j.semanaAdelantada ? '<div class="row between small"><span class="muted">Semana adelantada</span><b style="color:var(--ok)">' + money(j.semanaAdelantada) + '</b></div>' : '') +
    '</div>';
  }
  const multas = j.multas || [];
  if (multas.length) {
    const totalMultas = multas.reduce((a, m) => a + (+m.monto || 0), 0);
    h += '<div class="sec-t row between">Multas pendientes<span class="small muted">' + money(totalMultas) + '</span></div>' +
    multas.map(m => '<div class="card row between small"><span>' + (m.numeroActa ? 'Acta ' + esc(m.numeroActa) : 'Multa') + ' · ' + fdate(m.fecha) + '</span><b style="color:var(--bad)">' + money(m.monto) + '</b></div>').join('');
  }
  const autos = j.autos || [];
  if (!autos.length) {
    h += '<div class="card empty">No tenés un auto asignado en este momento.</div>';
  } else {
    autos.forEach(a => {
      const mon = a.moneda === 'USD' ? moneyUSD : money;
      const diasProx = a.proximo ? days(today(), parse(a.proximo)) : null;
      const proxTexto = diasProx == null ? '' : diasProx < 0 ? 'Vencido hace ' + (-diasProx) + ' d' : diasProx === 0 ? 'Hoy' : 'En ' + diasProx + ' d';
      const proxColor = diasProx == null ? '' : diasProx <= 0 ? 'var(--bad)' : diasProx <= 3 ? 'var(--warn)' : 'var(--ok)';
      const semaforo = a.debt > 0 ? { t: 'Atrasado', c: 'var(--bad)' } : a.adelantoAplicado > 0 ? { t: 'Adelantado', c: 'var(--ok)' } : { t: 'Al día', c: 'var(--ok)' };
      h += '<div class="sec-t row between">' + esc(a.patente || 'Auto') + (a.marca || a.modelo ? ' <span class="small muted">' + esc([a.marca, a.modelo].filter(Boolean).join(' ')) + '</span>' : '') + '<span class="small" style="color:' + semaforo.c + ';font-weight:600">● ' + semaforo.t + '</span></div>' +
      '<div class="card">' +
      '<div class="row between"><span class="muted">Deuda actual</span><b style="color:' + (a.debt > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + mon(a.debt) + '</b></div>' +
      (a.proximo ? '<div class="row between"><span class="muted">Próximo pago</span><span><b>' + fdate(a.proximo) + '</b><span class="small" style="color:' + proxColor + ';margin-left:6px">' + proxTexto + '</span></span></div>' : '') +
      (a.tipo === 'financiado' && a.cuotas ? '<div class="row between small"><span class="muted">Cuota actual</span><span>' + a.cuotaActual + ' de ' + a.cuotas + '</span></div>' : '') +
      (a.tipo === 'financiado' && a.cuotas ? '<div style="background:var(--soft);border-radius:6px;height:8px;overflow:hidden;margin:6px 0"><div style="width:' + Math.min(100, Math.round(a.cuotaActual / a.cuotas * 100)) + '%;height:100%;background:var(--ok)"></div></div>' : '') +
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
    '<label class="f"><span>Motivo</span><textarea id="pt_motivo" placeholder="ej: cambio de aceite, revisión programada..."></textarea></label>' +
    '<button class="btn sec block" id="pt_btn">Pedir turno</button>' +
    '<div class="small muted" id="pt_status" style="margin-top:6px"></div></div>';
    h += '<div class="sec-t">Reportar un problema</div><div class="card">' +
    '<label class="f"><span>Auto</span><select id="pr_patente">' + autos.map(a => '<option value="' + esc(a.patente) + '">' + esc(a.patente) + '</option>').join('') + '</select></label>' +
    '<label class="f"><span>¿Qué pasó?</span><textarea id="pr_descripcion" placeholder="ej: ruido en el freno, luz de motor encendida..."></textarea></label>' +
    '<label class="chk"><input type="checkbox" id="pr_urgente"><span>Es urgente, no puedo seguir manejando</span></label>' +
    '<button class="btn danger block" id="pr_btn" style="margin-top:8px">Reportar problema</button>' +
    '<div class="small muted" id="pr_status" style="margin-top:6px"></div></div>';
    h += '<div class="sec-t">Subir una foto del auto</div><div class="card">' +
    '<label class="f"><span>Auto</span><select id="ph_car">' + autos.map(a => '<option value="' + esc(a.id) + '">' + esc(a.patente) + '</option>').join('') + '</select></label>' +
    '<label class="btn sec block filebtn">Elegir foto<input id="ph_file" type="file" accept="image/*" capture="environment"></label>' +
    '<button class="btn sec block" id="ph_btn" style="margin-top:8px">Subir</button>' +
    '<div class="small muted" id="ph_status" style="margin-top:6px"></div></div>';
    h += '<div class="sec-t">Subir comprobante de pago</div><div class="card">' +
    '<label class="f"><span>Auto <small>opcional</small></span><select id="cp_car"><option value="">Sin especificar</option>' + autos.map(a => '<option value="' + esc(a.id) + '">' + esc(a.patente) + '</option>').join('') + '</select></label>' +
    '<label class="btn sec block filebtn">Elegir imagen del comprobante<input id="cp_file" type="file" accept="image/*"></label>' +
    '<button class="btn sec block" id="cp_btn" style="margin-top:8px">Subir</button>' +
    '<div class="small muted" id="cp_status" style="margin-top:6px"></div></div>';
  }
  h += '<div class="sec-t">Actualizar mis datos</div><div class="card">' +
  '<label class="f"><span>Teléfono nuevo</span><input id="ad_tel" type="tel"></label>' +
  '<label class="f"><span>Domicilio nuevo</span><input id="ad_domicilio"></label>' +
  '<button class="btn sec block" id="ad_btn">Enviar</button>' +
  '<div class="small muted" id="ad_status" style="margin-top:6px"></div></div>';
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
  const prBtn = wrap.querySelector('#pr_btn');
  if (prBtn) prBtn.addEventListener('click', () => enviarAccionPortal(
    { accion: 'problema', patente: wrap.querySelector('#pr_patente').value, descripcion: wrap.querySelector('#pr_descripcion').value, urgente: wrap.querySelector('#pr_urgente').checked },
    wrap.querySelector('#pr_status'), prBtn
  ));
  const adBtn = wrap.querySelector('#ad_btn');
  if (adBtn) adBtn.addEventListener('click', () => {
    const tel = wrap.querySelector('#ad_tel').value.trim(), domicilio = wrap.querySelector('#ad_domicilio').value.trim();
    if (!tel && !domicilio) { wrap.querySelector('#ad_status').textContent = 'Completá al menos un dato'; return; }
    enviarAccionPortal({ accion: 'actualizar_datos', tel, domicilio }, wrap.querySelector('#ad_status'), adBtn);
  });
  const phBtn = wrap.querySelector('#ph_btn');
  if (phBtn) phBtn.addEventListener('click', async () => {
    const inp = wrap.querySelector('#ph_file');
    const statusEl = wrap.querySelector('#ph_status');
    const f = inp.files && inp.files[0];
    if (!f) { statusEl.textContent = 'Elegí una foto primero'; return; }
    statusEl.textContent = 'Preparando…';
    let imagen;
    try { imagen = await comprimirImagen(f); } catch (e) { statusEl.textContent = 'No se pudo procesar la foto'; return; }
    await enviarAccionPortal({ accion: 'foto', carId: wrap.querySelector('#ph_car').value, imagen }, statusEl, phBtn);
    inp.value = '';
  });
  const cpBtn = wrap.querySelector('#cp_btn');
  if (cpBtn) cpBtn.addEventListener('click', async () => {
    const inp = wrap.querySelector('#cp_file');
    const statusEl = wrap.querySelector('#cp_status');
    const f = inp.files && inp.files[0];
    if (!f) { statusEl.textContent = 'Elegí una imagen primero'; return; }
    statusEl.textContent = 'Preparando…';
    let imagen;
    try { imagen = await comprimirImagen(f); } catch (e) { statusEl.textContent = 'No se pudo procesar la imagen'; return; }
    await enviarAccionPortal({ accion: 'comprobante', carId: wrap.querySelector('#cp_car').value, imagen }, statusEl, cpBtn);
    inp.value = '';
  });
}

function comprimirImagen(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 1280;
      let w = img.width, h = img.height;
      if (w > max || h > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
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
