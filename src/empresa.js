// Página pública de la empresa (www.ldrental.com.ar o …/#/empresa): quiénes son,
// requisitos para manejar, beneficios, WhatsApp y el botón para postularse.
// Los textos se cargan en la app (Más → Página de la empresa) y llegan por la función
// pública "postulacion" (GET). Si todavía no está actualizada, muestra lo básico.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { esc } from './utils.js';

const CSS = `
.em{max-width:880px;margin:0 auto;padding-block:calc(28px + env(safe-area-inset-top,0px)) 48px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:flex;flex-direction:column;gap:28px}
.em-top{display:flex;align-items:center;gap:12px}.em-top img{height:40px}.em-top b{font-size:20px}
.em-hero{display:flex;flex-direction:column;gap:14px}
.em-hero h1{font-size:clamp(30px,6vw,48px);line-height:1.05;margin:0;letter-spacing:-.02em;text-wrap:balance}
.em-hero p{font-size:18px;color:var(--muted);margin:0;max-width:60ch}
.em-cta{display:flex;flex-wrap:wrap;gap:10px}.em-cta a{text-decoration:none}
.em-sec{display:flex;flex-direction:column;gap:10px}.em-sec h2{margin:0;font-size:22px}
.em-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.em-paso{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}.em-paso .n{font-weight:800;font-size:13px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase}
.em-lista{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:17px}
.em-pie{color:var(--muted);font-size:14px;border-top:1px solid var(--line);padding-top:16px;display:flex;flex-direction:column;gap:4px}
`;
const PASOS = [['Postulate', 'Dejá tus datos en el formulario. Tarda un minuto.'], ['Te llamamos', 'Revisamos tus papeles y coordinamos una entrevista.'], ['Empezás a manejar', 'Firmás el contrato, te entregamos el auto y tenés tu portal para ver todo desde el celular.']];

export async function initEmpresa() {
  const nav = document.getElementById('nav'); if (nav) nav.style.display = 'none';
  if (!document.getElementById('em_css')) { const st = document.createElement('style'); st.id = 'em_css'; st.textContent = CSS; document.head.appendChild(st); }
  const app = document.getElementById('app');
  let j = null;
  try {
    const r = await fetch(SUPABASE_URL + '/functions/v1/postulacion', { headers: { Authorization: 'Bearer ' + SUPABASE_KEY, apikey: SUPABASE_KEY } });
    j = await r.json().catch(() => null);
  } catch (e) { /* sin conexión: queda lo básico */ }
  app.innerHTML = pagina(j && j.ok ? j : {});
}

export function pagina(j) {
  const s = j.sitio || {};
  const nombre = j.companyName || 'LD Rental';
  document.title = nombre + (s.titulo ? ' · ' + s.titulo : '');
  const wa = String(s.whatsapp || '').replace(/\D/g, '');
  const waUrl = wa ? 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Hola, quiero información para manejar con ' + nombre + '.') : '';
  const postular = location.pathname + '#/postulacion';
  const lista = L => '<ul class="em-lista">' + L.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
  return '<div class="em">' +
    '<div class="em-top">' + (j.companyLogo ? '<img src="' + esc(j.companyLogo) + '" alt="' + esc(nombre) + '">' : '<b>' + esc(nombre) + '</b>') + '</div>' +
    '<section class="em-hero"><h1>' + esc(s.titulo || 'Autos para choferes de aplicaciones') + '</h1>' +
    '<p>' + esc(s.bajada || 'Alquiler y financiación de autos para trabajar con Uber, DiDi y Cabify.') + '</p>' +
    '<div class="em-cta"><a class="btn" href="' + esc(postular) + '">Quiero manejar</a>' + (waUrl ? '<a class="btn sec" href="' + esc(waUrl) + '" target="_blank" rel="noopener">Escribinos por WhatsApp</a>' : '') + '</div></section>' +
    '<section class="em-sec"><h2>Cómo es</h2><div class="em-grid">' + PASOS.map((p, i) => '<div class="em-paso"><div class="n">Paso ' + (i + 1) + '</div><b>' + p[0] + '</b><div class="small muted" style="margin-top:4px">' + p[1] + '</div></div>').join('') + '</div></section>' +
    (s.requisitos && s.requisitos.length ? '<section class="em-sec"><h2>Qué necesitás</h2>' + lista(s.requisitos) + '</section>' : '') +
    (s.beneficios && s.beneficios.length ? '<section class="em-sec"><h2>Qué te damos</h2>' + lista(s.beneficios) + '</section>' : '') +
    (s.quienes ? '<section class="em-sec"><h2>Quiénes somos</h2><p style="margin:0;max-width:65ch;white-space:pre-wrap">' + esc(s.quienes) + '</p></section>' : '') +
    '<section class="em-sec"><div class="em-cta"><a class="btn" href="' + esc(postular) + '">Postularme ahora</a></div></section>' +
    '<footer class="em-pie"><b>' + esc(nombre) + '</b>' + [s.zona, s.direccion, s.horario].filter(Boolean).map(x => '<span>' + esc(x) + '</span>').join('') +
    (wa ? '<span>WhatsApp: +' + esc(wa) + '</span>' : '') + (s.instagram ? '<span>Instagram: ' + esc(s.instagram) + '</span>' : '') + '</footer></div>';
}
