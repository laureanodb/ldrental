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
  j.cotizacion = await cotizacionPortal(j.dolar);
  pantalla(app, '', j);
  renderPortal(app, j);
}
// Dólar del día con la misma cotización que eligió la empresa en Ajustes.
async function cotizacionPortal(cfg) {
  if (!cfg) return null;
  if (+cfg.manual > 0) return { valor: +cfg.manual, nombre: '' };
  try {
    const r = await fetch('https://dolarapi.com/v1/dolares');
    const L = await r.json();
    const x = (L || []).find(d => d.casa === cfg.tipo);
    const valor = x ? +(cfg.precio === 'compra' ? x.compra : x.venta) : 0;
    return valor ? { valor, nombre: (x.nombre || cfg.tipo) } : null;
  } catch (e) { return null; }
}
function tarjetaComoPagar(j) {
  const pg = j.pago || {};
  const autos = j.autos || [];
  const cot = j.cotizacion;
  const enPesos = usd => (cot ? '<span class="small muted" style="display:block;font-weight:400">≈ ' + money(Math.round(usd * cot.valor)) + '</span>' : '');
  const lineas = [];
  autos.forEach(a => {
    const usd = a.moneda === 'USD';
    const m = n => (usd ? moneyUSD(n) : money(n));
    if (a.debt > 0) lineas.push('<div class="row between" style="gap:8px"><span>' + esc(a.patente) + ': lo que debés</span><b style="color:var(--bad);white-space:nowrap;text-align:right">' + m(a.debt) + (usd ? enPesos(a.debt) : '') + '</b></div>');
    else if (a.proximo) lineas.push('<div class="row between" style="gap:8px"><span>' + esc(a.patente) + ': ' + (usd ? 'cuota' : 'alquiler') + ' del ' + fdate(a.proximo) + '</span><b style="white-space:nowrap;text-align:right">' + m(a.monto) + (usd ? enPesos(a.monto) : '') + '</b></div>');
  });
  if (j.seguroPendiente > 0) lineas.push('<div class="row between"><span>Seguro</span><b style="color:var(--bad)">' + money(j.seguroPendiente) + '</b></div>');
  if (j.plan && !j.plan.cumplido) lineas.push('<div class="row between"><span>Cuota del plan de pagos</span><b>' + (j.plan.moneda === 'USD' ? moneyUSD(j.plan.montoCuota) : money(j.plan.montoCuota)) + '</b></div>');
  const hayDatos = pg.alias || pg.cbu;
  if (!hayDatos && !lineas.length) return '';
  const copiar = (label, valor) => '<div class="row between" style="padding:6px 0;border-top:1px solid var(--line)"><div style="min-width:0"><div class="small muted">' + label + '</div><b style="overflow-wrap:anywhere">' + esc(valor) + '</b></div><button type="button" class="btn sec sm" data-copiar="' + esc(valor) + '">Copiar</button></div>';
  return '<div class="sec-t">Cómo pagar</div><div class="card" style="margin-bottom:14px">' +
    (lineas.length ? lineas.join('') + (cot && autos.some(a => a.moneda === 'USD') ? '<div class="small muted" style="margin-top:2px">Pesos al dólar ' + esc(cot.nombre ? cot.nombre.toLowerCase() + ' ' : '') + 'de hoy: ' + money(cot.valor) + '. Confirmá el valor con la empresa.</div>' : '') : '') +
    (hayDatos ? '<div style="margin-top:8px">' + (pg.alias ? copiar('Alias', pg.alias) : '') + (pg.cbu ? copiar('CBU / CVU', pg.cbu) : '') +
      ((pg.titular || pg.cuit || pg.banco) ? '<div class="small muted" style="padding-top:6px;border-top:1px solid var(--line)">' + [pg.titular, pg.cuit ? 'CUIT ' + pg.cuit : '', pg.banco].filter(Boolean).map(esc).join(' · ') + '</div>' : '') +
      (pg.nota ? '<div class="small" style="margin-top:4px">' + esc(pg.nota) + '</div>' : '') + '</div>' : '') +
    ((j.autos || []).length ? '<button type="button" class="btn block" style="margin-top:10px" id="ya_pague">Ya pagué: subir el comprobante</button>' : '') +
    '</div>';
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
  const mis = j.misAutos || [];
  if (mis.length) {
    h += '<div class="card" id="aux_card" style="margin-bottom:14px;border-color:var(--bad)"><button class="btn danger block" id="aux_btn">🆘 Necesito auxilio</button>' +
      '<div class="small muted" style="margin-top:6px">Le manda tu ubicación a la empresa para que te ayuden (auto roto, choque, problema en la calle).</div>' +
      '<div id="aux_form" hidden><label class="f" style="margin-top:8px"><span>Auto</span><select id="aux_car">' + mis.map(a => '<option value="' + esc(a.id) + '">' + esc(a.patente) + '</option>').join('') + '</select></label>' +
      '<label class="f"><span>¿Qué pasó? <small>opcional</small></span><input id="aux_msg" placeholder="ej: no arranca, pinché una goma"></label>' +
      '<button class="btn danger block" id="aux_enviar">Enviar mi ubicación</button></div>' +
      '<div class="small" id="aux_status" style="margin-top:6px"></div></div>';
  }
  const taller = j.taller || [];
  if (taller.length) {
    h += '<div class="sec-t">Tu auto en el taller</div>' + taller.map(t => '<div class="card"><div class="row between"><b>' + esc(t.patente) + (t.numero ? ' · Orden ' + esc(t.numero) : '') + '</b><span class="small" style="font-weight:600;color:' + (t.estado === 'lista' ? 'var(--ok)' : t.estado === 'reportada' || t.estado === 'esperando_repuesto' ? 'var(--warn)' : 'var(--muted)') + '">' + esc(t.estadoTexto) + '</span></div>' +
      '<div class="small muted">' + esc(t.titulo) + (t.fecha ? ' · desde el ' + fdate(t.fecha) : '') + (t.tareasTotal ? ' · ' + t.tareasHechas + ' de ' + t.tareasTotal + ' tareas hechas' : '') + '</div>' +
      (t.tareasTotal ? '<div style="background:var(--soft);border-radius:6px;height:6px;overflow:hidden;margin-top:6px"><div style="width:' + Math.round(t.tareasHechas / t.tareasTotal * 100) + '%;height:100%;background:var(--ok)"></div></div>' : '') + '</div>').join('');
  }
  (j.arreglos || []).forEach((x, i) => {
    h += '<div class="card" data-arreglo="' + i + '" style="margin-bottom:10px"><b>¿Quedó bien el arreglo?</b><div class="small muted">' + esc(x.patente) + ' · ' + esc(x.titulo) + ' · ' + fdate(x.fecha) + '</div>' +
      '<input class="arr_com" placeholder="Comentario (opcional)" style="margin:8px 0">' +
      '<div class="row"><button class="btn sm grow arr_si">Sí, quedó bien</button><button class="btn sec sm grow arr_no">Sigue fallando</button></div><div class="small muted arr_st" style="margin-top:4px"></div></div>';
  });
  (j.contratosPendientes || []).forEach((k, i) => {
    h += '<div class="sec-t">Contrato para firmar</div><div class="card" id="fc_card_' + i + '" style="border-color:var(--warn);margin-bottom:14px">' +
      '<b>' + esc(k.titulo) + (k.patente ? ' · ' + esc(k.patente) : '') + '</b>' +
      '<div style="max-height:280px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:10px;margin:8px 0;font-size:13px;line-height:1.45">' + k.parrafos.map(t => '<p style="margin:0 0 8px">' + esc(t) + '</p>').join('') + '</div>' +
      '<div class="two"><label class="f"><span>Nombre y apellido</span><input id="fc_nombre_' + i + '" value="' + esc(j.nombre || '') + '"></label>' +
      '<label class="f"><span>DNI</span><input id="fc_dni_' + i + '" inputmode="numeric"></label></div>' +
      '<div class="small muted" style="margin-bottom:6px">Firmá con el dedo en el recuadro</div>' +
      '<canvas id="fc_firma_' + i + '" width="335" height="140" style="width:100%;height:140px;border:1px solid var(--line);border-radius:8px;touch-action:none;background:#fff;display:block"></canvas>' +
      '<button type="button" class="btn sec sm" style="margin-top:6px" id="fc_limpiar_' + i + '">Borrar firma</button>' +
      '<label class="chk" style="margin-top:8px"><input type="checkbox" id="fc_acepto_' + i + '"><span>Leí el contrato completo y lo acepto</span></label>' +
      '<button class="btn block" style="margin-top:8px" id="fc_btn_' + i + '">Firmar contrato</button>' +
      '<div class="small muted" id="fc_status_' + i + '" style="margin-top:6px"></div></div>';
  });
  h += tarjetaComoPagar(j);
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
  if (j.cuenta && (j.cuenta.deudaARS > 0 || j.cuenta.deudaUSD > 0)) {
    h += '<div class="sec-t">Tu deuda total</div><div class="card" style="margin-bottom:14px">' +
      (j.cuenta.deudaARS > 0 ? '<div class="row between"><span class="muted">En pesos</span><b style="color:var(--bad)">' + money(j.cuenta.deudaARS) + '</b></div><div class="small muted">Suma alquiler, seguro, multas y adelantos pendientes.</div>' : '') +
      (j.cuenta.deudaUSD > 0 ? '<div class="row between"' + (j.cuenta.deudaARS > 0 ? ' style="margin-top:6px"' : '') + '><span class="muted">Cuotas en dólares</span><b style="color:var(--bad)">' + moneyUSD(j.cuenta.deudaUSD) + '</b></div>' : '') +
      '</div>';
  }
  if (j.plan) {
    const p = j.plan, m = n => (p.moneda === 'USD' ? moneyUSD(n) : money(n));
    const pct = p.deudaInicial ? Math.min(100, Math.round(Math.max(0, p.deudaInicial - p.deudaHoy) / p.deudaInicial * 100)) : 0;
    h += '<div class="sec-t">Tu plan de pagos</div><div class="card" style="margin-bottom:14px">' +
      '<div class="row between"><span>' + p.cuotas + ' semanas de ' + m(p.montoCuota) + '</span><b style="color:' + (p.alDia ? 'var(--ok)' : 'var(--bad)') + '">' + (p.cumplido ? '¡Cumplido!' : p.alDia ? 'Al día' : 'Atrasado') + '</b></div>' +
      '<div style="background:var(--soft);border-radius:6px;height:8px;overflow:hidden;margin:8px 0"><div style="width:' + pct + '%;height:100%;background:var(--ok)"></div></div>' +
      '<div class="small muted">Vas ' + pct + '% · semana ' + p.semanas + ' de ' + p.cuotas + '. Esta cuota se paga además del ' + (p.moneda === 'USD' ? 'pago de la cuota' : 'alquiler') + '.</div>' +
      (!p.alDia ? '<div class="small" style="color:var(--bad);margin-top:4px">Para estar al día deberías deber como máximo ' + m(p.deberiaQuedar) + ' (hoy debés ' + m(p.deudaHoy) + ').</div>' : '') +
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
      (a.docsSeguro && a.docsSeguro.length ? '<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px"><div class="small muted">Papeles del seguro' + (a.aseguradora ? ' · ' + esc(a.aseguradora) : '') + (a.polizaNumero ? ' · Póliza ' + esc(a.polizaNumero) : '') + '</div>' +
        a.docsSeguro.map(d => '<a class="btn sec block" style="margin-top:6px" target="_blank" rel="noopener" href="' + esc(d.url) + '">Descargar ' + esc(d.label.toLowerCase()) + '</a>').join('') +
        '<div class="small muted" style="margin-top:4px">Tenelos a mano por si te paran. Si el link no abre, recargá la página.</div></div>' : '') +
      planServiceHtml((j.misAutos || []).find(m => m.id === a.id)) +
      '</div>';
    });
  }
  if (j.seguroACargo) {
    h += '<div class="sec-t">Seguro del auto</div><div class="card"><div class="row between"><span class="muted">Seguro a pagar</span><b style="color:' + (j.seguroPendiente > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + (j.seguroPendiente > 0 ? money(j.seguroPendiente) : 'Al día') + '</b></div>' +
      '<div class="small muted" style="margin-top:4px">Es el seguro que te pagamos y se abona aparte de la cuota, en pesos.</div></div>';
  }
  const pagos = j.pagos || [];
  if (pagos.length) {
    h += '<div class="sec-t">Historial de pagos</div>' + pagos.map((p, i) => '<div class="card row between"><div><div>' + fdate(p.fecha) + '</div><div class="small muted">' + (p.tipo === 'seguro' ? 'Seguro · ' : '') + esc(p.metodoLabel || '') + (p.patente ? ' · ' + esc(p.patente) : '') + '</div></div>' +
    '<div class="row" style="align-items:center;gap:8px"><b>' + (p.tipo === 'cuota' ? moneyUSD(p.monto) : money(p.monto)) + '</b><button class="btn sec sm" data-recibo="' + i + '">Recibo</button></div></div>').join('');
  }
  if (mis.length) {
    const turnos = mis.flatMap(m => (m.turnos || []).map(t => Object.assign({ patente: m.patente }, t)));
    h += '<div class="sec-t">Pedir turno de service</div><div class="card" id="tour_service">' +
    (turnos.length ? turnos.map(t => '<div class="row between small" style="padding:3px 0"><span>' + esc(t.patente) + ' · ' + esc(t.motivo || 'Service') + (t.fecha ? ' · ' + fdate(t.fecha) + (t.hora ? ' ' + esc(t.hora) : '') : '') + '</span><b style="color:' + (t.estado === 'confirmado' ? 'var(--ok)' : t.estado === 'rechazado' ? 'var(--bad)' : 'var(--warn)') + '">' + (t.estado === 'confirmado' ? 'Confirmado' : t.estado === 'rechazado' ? 'No disponible' : 'Pedido') + '</b></div>' + (t.nota ? '<div class="small muted">' + esc(t.nota) + '</div>' : '')).join('') + '<div style="border-top:1px solid var(--line);margin:8px 0"></div>' : '') +
    '<label class="f"><span>Auto</span><select id="pt_car">' + mis.map(a => '<option value="' + esc(a.id) + '">' + esc(a.patente) + '</option>').join('') + '</select></label>' +
    '<div class="two"><label class="f"><span>Día que te queda bien</span><input id="pt_fecha" type="date"></label><label class="f"><span>Hora</span><input id="pt_hora" type="time"></label></div>' +
    '<label class="f"><span>Motivo</span><textarea id="pt_motivo" placeholder="ej: cambio de aceite, revisión programada..."></textarea></label>' +
    '<button class="btn sec block" id="pt_btn">Pedir turno</button>' +
    '<div class="small muted" id="pt_status" style="margin-top:6px"></div></div>';
    h += '<div class="sec-t">Reportar un problema</div><div class="card" id="tour_problema">' +
    '<label class="f"><span>Auto</span><select id="pr_car">' + mis.map(a => '<option value="' + esc(a.id) + '">' + esc(a.patente) + '</option>').join('') + '</select></label>' +
    '<label class="f"><span>¿Qué pasó?</span><textarea id="pr_descripcion" placeholder="ej: ruido en el freno, luz de motor encendida..."></textarea></label>' +
    '<label class="btn sec block filebtn">Agregar fotos o un video corto <small>(hasta 3 fotos)</small><input id="pr_fotos" type="file" accept="image/*" capture="environment" multiple></label>' +
    '<div class="small muted" id="pr_fotos_txt" style="margin:4px 0"></div>' +
    '<label class="chk"><input type="checkbox" id="pr_urgente"><span>Es urgente, no puedo seguir manejando</span></label>' +
    '<button class="btn danger block" id="pr_btn" style="margin-top:8px">Reportar problema</button>' +
    '<div class="small muted" id="pr_status" style="margin-top:6px"></div></div>';
    h += '<div class="sec-t">Cargar kilometraje</div><div class="card" id="tour_km">' +
    '<div class="small muted" style="margin-bottom:8px">Sacale una foto al tablero con el auto en contacto. La leemos y vos confirmás el número.</div>' +
    '<label class="f"><span>Auto</span><select id="km_car">' + mis.map(a => '<option value="' + esc(a.id) + '">' + esc(a.patente) + (a.km ? ' (último: ' + Number(a.km).toLocaleString('es-AR') + ' km)' : '') + '</option>').join('') + '</select></label>' +
    '<label class="btn sec block filebtn">Sacar foto del tablero<input id="km_file" type="file" accept="image/*" capture="environment"></label>' +
    '<div id="km_res" hidden><label class="f" style="margin-top:8px"><span>Kilometraje</span><input id="km_valor" inputmode="numeric"></label><div class="small muted" id="km_extra"></div>' +
    '<button class="btn block" id="km_btn" style="margin-top:8px">Confirmar kilometraje</button></div>' +
    '<div class="small muted" id="km_status" style="margin-top:6px"></div></div>';
  }
  if (autos.length) {
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
  const docs = j.documentos || [];
  if (docs.length) {
    h += '<div class="sec-t">Tu documentación</div>' + docs.map(x => {
      const color = x.enRevision ? 'var(--muted)' : x.dias == null ? 'var(--warn)' : x.dias < 0 ? 'var(--bad)' : x.dias <= 30 ? 'var(--warn)' : 'var(--ok)';
      const estado = x.enRevision ? 'En revisión' : x.dias == null ? 'Sin fecha cargada' : x.dias < 0 ? 'Vencida hace ' + (-x.dias) + ' d' : x.dias === 0 ? 'Vence hoy' : x.dias <= 30 ? 'Vence en ' + x.dias + ' d' : 'Vence el ' + fdate(x.vence);
      const pedir = !x.enRevision && (x.dias == null || x.dias <= 30);
      return '<div class="card" data-doc="' + esc(x.tipo) + '"><div class="row between"><b>' + esc(x.label) + '</b><span class="small" style="color:' + color + ';font-weight:600">' + estado + '</span></div>' +
        (pedir ? '<div class="small muted" style="margin:4px 0 6px">Subí una foto de la nueva para que la empresa la actualice.</div>' : '') +
        '<details' + (pedir ? ' open' : '') + '><summary class="small muted" style="cursor:pointer">' + (pedir ? 'Subir la nueva' : 'Subir una nueva') + '</summary>' +
        '<label class="f" style="margin-top:6px"><span>¿Hasta cuándo vale la nueva?</span><input type="date" class="doc_vence"></label>' +
        '<label class="btn sec block filebtn">Sacar o elegir foto<input class="doc_file" type="file" accept="image/*" capture="environment"></label>' +
        '<button class="btn block doc_btn" style="margin-top:8px">Enviar</button><div class="small muted doc_status" style="margin-top:6px"></div></details></div>';
    }).join('');
  }
  h += '<div class="sec-t">Actualizar mis datos</div><div class="card">' +
  (j.cambiosPendientes ? '<div class="small" style="color:var(--warn);margin-bottom:8px">Ya mandaste cambios el ' + fdate(j.cambiosPendientes.fecha) + ' y la empresa los está revisando.</div>' : '') +
  '<label class="f"><span>Teléfono nuevo</span><input id="ad_tel" type="tel"></label>' +
  '<label class="f"><span>Domicilio nuevo</span><input id="ad_domicilio"></label>' +
  '<label class="f"><span>Email</span><input id="ad_email" type="email"></label>' +
  '<button class="btn sec block" id="ad_btn">Enviar</button>' +
  '<div class="small muted" id="ad_status" style="margin-top:6px"></div></div>';
  h += '<div style="text-align:center;margin:18px 0 6px"><a class="small muted tap" style="text-decoration:underline" id="tour_ver">Ver cómo usar esta página</a></div>';
  const wrap = app.querySelector('.login');
  wrap.insertAdjacentHTML('beforeend', h);
  wrap.querySelectorAll('[data-recibo]').forEach(btn => {
    btn.addEventListener('click', () => descargarReciboPortal(j, pagos[+btn.dataset.recibo]));
  });
  wrap.querySelectorAll('[data-copiar]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copiar); b.textContent = '¡Copiado!'; } catch (e) { b.textContent = 'No se pudo'; }
    setTimeout(() => { b.textContent = 'Copiar'; }, 1800);
  }));
  const yaPague = wrap.querySelector('#ya_pague');
  if (yaPague) yaPague.addEventListener('click', () => { const el = wrap.querySelector('#cp_file'); if (el) { el.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'center' }); } });
  (j.contratosPendientes || []).forEach((k, i) => {
    const pad = padFirma(wrap.querySelector('#fc_firma_' + i));
    wrap.querySelector('#fc_limpiar_' + i).addEventListener('click', pad.limpiar);
    const btn = wrap.querySelector('#fc_btn_' + i), st = wrap.querySelector('#fc_status_' + i);
    btn.addEventListener('click', async () => {
      const nombre = wrap.querySelector('#fc_nombre_' + i).value.trim(), dni = wrap.querySelector('#fc_dni_' + i).value.trim();
      if (nombre.length < 3) { st.textContent = 'Escribí tu nombre y apellido'; return; }
      if (!/\d{6,}/.test(dni.replace(/\D/g, ''))) { st.textContent = 'Escribí tu DNI'; return; }
      if (!pad.trazada()) { st.textContent = 'Falta tu firma en el recuadro'; return; }
      if (!wrap.querySelector('#fc_acepto_' + i).checked) { st.textContent = 'Marcá que leíste y aceptás el contrato'; return; }
      btn.disabled = true; st.textContent = 'Firmando…';
      const r = await postPortal({ accion: 'firmar_contrato', carId: k.carId, firmaId: k.id, nombre, dni, acepto: true, firma: pad.png() });
      if (r.ok) wrap.querySelector('#fc_card_' + i).innerHTML = '<b style="color:var(--ok)">✓ Contrato firmado</b><div class="small muted" style="margin-top:4px">Gracias, ' + esc(nombre.split(' ')[0]) + '. La empresa ya recibió tu firma.</div>';
      else { st.textContent = r.error || 'No se pudo firmar, probá de nuevo.'; btn.disabled = false; }
    });
  });
  wrap.querySelectorAll('[data-doc]').forEach(card => {
    const btn = card.querySelector('.doc_btn'), st = card.querySelector('.doc_status');
    btn.addEventListener('click', async () => {
      const f = card.querySelector('.doc_file').files[0];
      if (!f) { st.textContent = 'Sacá o elegí la foto primero'; return; }
      st.textContent = 'Preparando…'; btn.disabled = true;
      let imagen;
      try { imagen = await comprimirImagen(f); } catch (e) { st.textContent = 'No se pudo procesar la foto'; btn.disabled = false; return; }
      const r = await postPortal({ accion: 'documento', tipo: card.dataset.doc, vence: card.querySelector('.doc_vence').value, imagen });
      if (r.ok) card.querySelector('details').outerHTML = '<div class="small" style="color:var(--ok);margin-top:4px">✓ Enviada. La empresa la va a revisar.</div>';
      else { st.textContent = r.error || 'No se pudo enviar, probá de nuevo.'; btn.disabled = false; }
    });
  });
  conectarNuevos(wrap, j);
  const adBtn = wrap.querySelector('#ad_btn');
  if (adBtn) adBtn.addEventListener('click', async () => {
    const tel = wrap.querySelector('#ad_tel').value.trim(), domicilio = wrap.querySelector('#ad_domicilio').value.trim(), email = wrap.querySelector('#ad_email').value.trim();
    const st = wrap.querySelector('#ad_status');
    if (!tel && !domicilio && !email) { st.textContent = 'Completá al menos un dato'; return; }
    adBtn.disabled = true; st.textContent = 'Enviando…';
    const r = await postPortal({ accion: 'actualizar_datos', tel, domicilio, email });
    st.textContent = r.ok ? '✓ Enviado. La empresa lo va a revisar.' : (r.error || 'No se pudo enviar, probá de nuevo.');
    adBtn.disabled = false;
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

async function postPortal(body) {
  try {
    const r = await fetch(SUPABASE_URL + '/functions/v1/portal-chofer', { method: 'POST', headers: { Authorization: 'Bearer ' + SUPABASE_KEY, apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ id: PORTAL_ID, t: PORTAL_TOKEN }, body)) });
    return await r.json();
  } catch (e) { return { ok: false, error: 'No se pudo enviar, revisá tu conexión.' }; }
}
// Recuadro para firmar con el dedo o el mouse.
function padFirma(cv) {
  const ctx = cv.getContext('2d');
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111';
  let dibujando = false, ultimo = null, trazada = false;
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
  cv.onpointerdown = e => { dibujando = true; ultimo = pos(e); try { cv.setPointerCapture(e.pointerId); } catch (x) {} };
  cv.onpointermove = e => { if (!dibujando) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(ultimo[0], ultimo[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); ultimo = p; trazada = true; };
  cv.onpointerup = cv.onpointerleave = () => { dibujando = false; };
  return { limpiar: () => { ctx.clearRect(0, 0, cv.width, cv.height); trazada = false; }, trazada: () => trazada, png: () => cv.toDataURL('image/png') };
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
  linea('Concepto:', p.tipo === 'alquiler' ? 'Alquiler semanal' : p.tipo === 'cuota' ? 'Cuota de financiación' : p.tipo === 'seguro' ? 'Seguro del auto' : 'Otro');
  if (p.metodoLabel) linea('Método de pago:', p.metodoLabel);
  y += 4;
  doc.setFontSize(13); doc.text('Monto: ' + (p.tipo === 'cuota' ? moneyUSD(p.monto) : money(p.monto)), 12, y);
  y += 14;
  doc.setFontSize(8); doc.setTextColor(140); doc.text('Comprobante generado por ' + (settings.companyName || 'LD Rental'), 12, y);
  doc.save('recibo-' + (p.patente || 'auto') + '-' + p.fecha + '.pdf');
}

/* ---------- Partes nuevas del portal ---------- */
function planServiceHtml(m) {
  if (!m || !(m.planService || []).length) return '';
  const L = m.planService.slice(0, 5);
  const col = e => (e === 'vencido' ? 'var(--bad)' : e === 'pronto' ? 'var(--warn)' : 'var(--muted)');
  return '<details style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px"><summary class="small muted" style="cursor:pointer">Plan de service del auto' + (L.some(x => x.estado !== 'ok') ? ' · <b style="color:' + col(L.some(x => x.estado === 'vencido') ? 'vencido' : 'pronto') + '">hay algo por hacer</b>' : '') + '</summary>' +
    L.map(x => '<div class="row between small" style="padding:3px 0"><span>' + esc(x.label) + '</span><span style="color:' + col(x.estado) + '">' +
      (x.estado === 'vencido' ? 'Ya toca' : [x.faltanKm != null ? 'en ' + Number(Math.max(0, x.faltanKm)).toLocaleString('es-AR') + ' km' : '', x.proxFecha ? 'antes del ' + fdate(x.proxFecha) : ''].filter(Boolean).join(' o ')) + '</span></div>').join('') +
    '<div class="small muted" style="margin-top:4px">Si te toca algo, pedí turno más abajo.</div></details>';
}
async function aDataUrls(files, max) {
  const out = [];
  for (const f of [...(files || [])].slice(0, max)) { if ((f.type || '').startsWith('image/')) out.push(await comprimirImagen(f)); }
  return out;
}
function conectarNuevos(wrap, j) {
  const $w = s => wrap.querySelector(s);
  // Turno de service
  const ptBtn = $w('#pt_btn');
  if (ptBtn) ptBtn.addEventListener('click', async () => {
    const st = $w('#pt_status');
    ptBtn.disabled = true; st.textContent = 'Enviando…';
    const r = await postPortal({ accion: 'service', carId: $w('#pt_car').value, fecha: $w('#pt_fecha').value, hora: $w('#pt_hora').value, motivo: $w('#pt_motivo').value });
    st.textContent = r.ok ? '✓ Pedido. Te avisamos cuando la empresa lo confirme (lo ves acá mismo).' : (r.error || 'No se pudo enviar, probá de nuevo.');
    ptBtn.disabled = false;
  });
  // Problema con fotos
  const prFotos = $w('#pr_fotos');
  if (prFotos) prFotos.addEventListener('change', () => { const n = prFotos.files.length; $w('#pr_fotos_txt').textContent = n ? n + ' foto' + (n === 1 ? '' : 's') + (n > 3 ? ' (se mandan las primeras 3)' : '') : ''; });
  const prBtn = $w('#pr_btn');
  if (prBtn) prBtn.addEventListener('click', async () => {
    const st = $w('#pr_status');
    const descripcion = $w('#pr_descripcion').value.trim();
    if (!descripcion) { st.textContent = 'Contá qué pasó'; return; }
    prBtn.disabled = true; st.textContent = 'Preparando…';
    let fotos = [];
    try { fotos = await aDataUrls(prFotos && prFotos.files, 3); } catch (e) { st.textContent = 'No se pudo procesar una foto'; prBtn.disabled = false; return; }
    st.textContent = 'Enviando…';
    const r = await postPortal({ accion: 'problema', carId: $w('#pr_car').value, descripcion, urgente: $w('#pr_urgente').checked, fotos });
    if (r.ok) { st.textContent = '✓ Listo, la empresa ya lo recibió' + (r.numero ? ' (orden ' + r.numero + ')' : '') + '. Vas a ver el avance en "Tu auto en el taller".'; $w('#pr_descripcion').value = ''; if (prFotos) prFotos.value = ''; $w('#pr_fotos_txt').textContent = ''; }
    else st.textContent = r.error || 'No se pudo enviar, probá de nuevo.';
    prBtn.disabled = false;
  });
  // Km con foto del tablero
  const kmFile = $w('#km_file');
  let kmPath = '', kmLectura = null;
  if (kmFile) kmFile.addEventListener('change', async () => {
    const f = kmFile.files && kmFile.files[0]; if (!f) return;
    const st = $w('#km_status');
    st.textContent = 'Leyendo la foto…'; $w('#km_res').hidden = true;
    let imagen;
    try { imagen = await comprimirImagen(f); } catch (e) { st.textContent = 'No se pudo procesar la foto'; return; }
    const r = await postPortal({ accion: 'tablero', carId: $w('#km_car').value, imagen });
    kmFile.value = '';
    if (!r.ok) { st.textContent = r.error || 'No se pudo enviar, probá de nuevo.'; return; }
    kmPath = r.path || ''; kmLectura = r.lectura;
    const L = r.lectura;
    $w('#km_res').hidden = false;
    $w('#km_valor').value = L && L.esTablero && L.km ? L.km : '';
    $w('#km_extra').textContent = !L ? 'No pudimos leer la foto: escribí el número que marca el tablero.' : !L.esTablero || !L.km ? 'No se ve bien el número: escribilo vos.' :
      'Leímos ' + Number(L.km).toLocaleString('es-AR') + ' km' + (L.combustiblePct != null ? ' y ' + L.combustiblePct + '% de combustible' : '') + '. Revisá que esté bien.' + (L.testigos && L.testigos.length ? ' Vemos encendido: ' + L.testigos.join(', ') + '.' : '');
    st.textContent = '';
  });
  const kmBtn = $w('#km_btn');
  if (kmBtn) kmBtn.addEventListener('click', async () => {
    const st = $w('#km_status');
    const km = +String($w('#km_valor').value).replace(/\D/g, '');
    if (!km) { st.textContent = 'Escribí el kilometraje'; return; }
    kmBtn.disabled = true; st.textContent = 'Guardando…';
    const r = await postPortal({ accion: 'km', carId: $w('#km_car').value, km, path: kmPath, combustiblePct: kmLectura && kmLectura.combustiblePct, testigos: (kmLectura && kmLectura.testigos) || [] });
    if (r.ok) { $w('#km_res').hidden = true; st.textContent = '✓ Kilometraje guardado: ' + km.toLocaleString('es-AR') + ' km.'; }
    else st.textContent = r.error || 'No se pudo guardar, probá de nuevo.';
    kmBtn.disabled = false;
  });
  // Auxilio
  const auxBtn = $w('#aux_btn');
  if (auxBtn) auxBtn.addEventListener('click', () => { $w('#aux_form').hidden = false; auxBtn.hidden = true; });
  const auxEnviar = $w('#aux_enviar');
  if (auxEnviar) auxEnviar.addEventListener('click', async () => {
    const st = $w('#aux_status');
    auxEnviar.disabled = true; st.style.color = 'var(--muted)'; st.textContent = 'Buscando tu ubicación…';
    const pos = await new Promise(res => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(p => res(p.coords), () => res(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    });
    st.textContent = 'Avisando a la empresa…';
    const r = await postPortal({ accion: 'auxilio', carId: $w('#aux_car').value, mensaje: $w('#aux_msg').value, lat: pos ? pos.latitude : null, lng: pos ? pos.longitude : null, precision: pos ? pos.accuracy : 0 });
    const tel = j.telefonoEmergencia || j.companyPhone || '';
    if (r.ok) { st.style.color = 'var(--ok)'; st.innerHTML = '✓ La empresa recibió tu pedido' + (pos ? ' con tu ubicación' : ' (no pudimos tomar tu ubicación: decí dónde estás por teléfono)') + '.' + (tel ? ' <a class="btn sec block" style="margin-top:8px" href="tel:' + esc(tel) + '">Llamar a ' + esc(tel) + '</a>' : ''); }
    else { st.style.color = 'var(--bad)'; st.textContent = r.error || 'No se pudo enviar. Llamá a la empresa.'; auxEnviar.disabled = false; }
  });
  // Opinión sobre los arreglos
  wrap.querySelectorAll('[data-arreglo]').forEach(card => {
    const x = (j.arreglos || [])[+card.dataset.arreglo];
    const enviar = async resultado => {
      const st = card.querySelector('.arr_st');
      st.textContent = 'Enviando…';
      const r = await postPortal({ accion: 'opinion', carId: x.carId, otId: x.tipo === 'ot' ? x.id : '', mantId: x.tipo === 'mant' ? x.id : '', resultado, comentario: card.querySelector('.arr_com').value });
      if (r.ok) card.innerHTML = '<b style="color:var(--ok)">✓ Gracias por avisar</b>' + (resultado !== 'bien' ? '<div class="small muted">La empresa se va a comunicar con vos.</div>' : '');
      else st.textContent = r.error || 'No se pudo enviar, probá de nuevo.';
    };
    card.querySelector('.arr_si').addEventListener('click', () => enviar('bien'));
    card.querySelector('.arr_no').addEventListener('click', () => enviar('sigue_fallando'));
  });
  // Recorrido de bienvenida
  const verTour = $w('#tour_ver');
  if (verTour) verTour.addEventListener('click', () => recorrido(wrap, true));
  recorrido(wrap, false);
}

// Recorrido corto la primera vez que el chofer entra al portal.
function recorrido(wrap, forzar) {
  const KEY = 'portal-recorrido-' + PORTAL_ID;
  if (!forzar) { try { if (localStorage.getItem(KEY)) return; } catch (e) { return; } }
  const pasos = [
    ['.sec-t', 'Bienvenido a tu portal', 'Acá ves todo lo tuyo con la empresa. Guardá este link en el celular para entrar cuando quieras.'],
    ['#ya_pague', 'Cómo pagar', 'Arriba están los datos para transferir. Cuando pagues, subí el comprobante desde acá.'],
    ['#aux_card', 'Si te quedás en la calle', 'Con este botón le mandás tu ubicación a la empresa para que te ayuden.'],
    ['#tour_problema', 'Si el auto tiene un problema', 'Contalo con fotos. Se abre una orden en el taller y ves el avance en esta misma página.'],
    ['#tour_km', 'Kilometraje', 'Sacale una foto al tablero y la leemos sola. Te lleva 10 segundos.'],
    ['#tour_service', 'Turnos de service', 'Pedí el turno con el día que te queda bien. Cuando la empresa lo confirma, lo ves acá.'],
  ].filter(p => wrap.querySelector(p[0]));
  if (!pasos.length) return;
  let i = 0, marcado = null;
  const capa = document.createElement('div');
  capa.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:50;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));background:var(--card);border-top:2px solid var(--btn);box-shadow:0 -6px 20px rgba(0,0,0,.18)';
  document.body.appendChild(capa);
  const cerrar = () => { if (marcado) marcado.style.outline = ''; capa.remove(); try { localStorage.setItem(KEY, '1'); } catch (e) {} };
  const mostrar = () => {
    const [sel, titulo, texto] = pasos[i];
    if (marcado) marcado.style.outline = '';
    marcado = wrap.querySelector(sel);
    if (marcado) { marcado.style.outline = '3px solid var(--btn)'; marcado.style.outlineOffset = '3px'; marcado.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    capa.innerHTML = '<div class="small muted">' + (i + 1) + ' de ' + pasos.length + '</div><b>' + esc(titulo) + '</b><div class="small" style="margin:4px 0 10px">' + esc(texto) + '</div>' +
      '<div class="row"><button class="btn sec sm" id="tour_saltar">Saltar</button><button class="btn sm grow" id="tour_sig">' + (i === pasos.length - 1 ? 'Listo' : 'Siguiente') + '</button></div>';
    capa.querySelector('#tour_saltar').onclick = cerrar;
    capa.querySelector('#tour_sig').onclick = () => { i++; if (i >= pasos.length) cerrar(); else mostrar(); };
  };
  mostrar();
}
