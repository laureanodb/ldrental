import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { brandH1 } from './settings.js';
import { CANALES_PROSPECTO } from './constants.js';

function pantalla(app, inner) {
  app.innerHTML = '<div class="login" style="max-width:480px">' + brandH1() + inner + '</div>';
}

export function initPostulacion() {
  const nav = document.getElementById('nav'); if (nav) nav.style.display = 'none';
  const app = document.getElementById('app');
  renderForm(app);
}

function renderForm(app) {
  pantalla(app, '<p class="sub">Sumate a la flota</p>' +
  '<label class="f"><span>Nombre y apellido</span><input id="po_nombre"></label>' +
  '<label class="f"><span>Teléfono <small>con código de país, ej: +5491155551234</small></span><input id="po_tel" type="tel"></label>' +
  '<label class="f"><span>¿Cómo te enteraste?</span><select id="po_canal"><option value="">Sin especificar</option>' + CANALES_PROSPECTO.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></label>' +
  '<div id="po_otroBox" style="display:none"><label class="f"><span>¿Cuál?</span><input id="po_canalOtro"></label></div>' +
  '<label class="f"><span>Tipo de licencia</span><input id="po_licencia" placeholder="ej: B1, profesional..."></label>' +
  '<label class="f"><span>Experiencia previa como chofer</span><textarea id="po_experiencia"></textarea></label>' +
  '<button class="btn block" id="po_submit">Enviar</button>' +
  '<div id="po_err" class="small" style="margin-top:8px"></div>');
  const sel = document.getElementById('po_canal');
  if (sel) sel.addEventListener('change', () => { document.getElementById('po_otroBox').style.display = sel.value === 'otro' ? '' : 'none'; });
  const btn = document.getElementById('po_submit');
  if (btn) btn.addEventListener('click', () => enviar(app));
}

function pantallaOk(app) {
  pantalla(app, '<div class="card"><b>¡Listo!</b><p class="small muted">Recibimos tus datos. En breve nos ponemos en contacto.</p></div>');
}

async function enviar(app) {
  const nombre = document.getElementById('po_nombre').value.trim();
  const tel = document.getElementById('po_tel').value.trim();
  const err = document.getElementById('po_err');
  if (!nombre || !tel) { err.style.color = 'var(--bad)'; err.textContent = 'Completá tu nombre y teléfono.'; return; }
  err.style.color = 'var(--muted)'; err.textContent = 'Enviando…';
  const btn = document.getElementById('po_submit'); if (btn) btn.disabled = true;
  try {
    const body = {
      nombre, tel,
      canalOrigen: document.getElementById('po_canal').value,
      canalOrigenOtro: document.getElementById('po_canalOtro').value,
      tipoLicencia: document.getElementById('po_licencia').value.trim(),
      experienciaChofer: document.getElementById('po_experiencia').value.trim(),
    };
    const r = await fetch(SUPABASE_URL + '/functions/v1/postulacion', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + SUPABASE_KEY, apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      err.style.color = 'var(--bad)'; err.textContent = 'No se pudo enviar. Probá de nuevo en un rato.';
      if (btn) btn.disabled = false;
      return;
    }
    pantallaOk(app);
  } catch (e) {
    err.style.color = 'var(--bad)'; err.textContent = 'No se pudo enviar. Revisá tu conexión.';
    if (btn) btn.disabled = false;
  }
}
