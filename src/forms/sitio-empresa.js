// Editor de la página pública de la empresa. Los textos se guardan en los ajustes
// compartidos (sitioEmpresa) y la página los lee por la función pública "postulacion".
import { esc } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { settings, saveSettings } from '../settings.js';

const CAMPOS = [
  ['titulo', 'Título grande', 'ej: Autos para choferes de aplicaciones', 'input'],
  ['bajada', 'Bajada (una o dos oraciones)', 'ej: Alquiler y financiación de autos para trabajar con Uber, DiDi y Cabify en zona sur.', 'textarea'],
  ['requisitos', 'Requisitos para manejar (uno por renglón)', 'Licencia profesional vigente\nDNI y comprobante de domicilio\nCertificado de antecedentes', 'textarea'],
  ['beneficios', 'Qué ofrecés (uno por renglón)', 'Seguro incluido\nService a cargo de la empresa\nPortal para ver tus pagos desde el celular', 'textarea'],
  ['quienes', 'Quiénes son', 'Unas líneas sobre la empresa', 'textarea'],
  ['whatsapp', 'WhatsApp para consultas', 'ej: 5491155551234', 'input'],
  ['zona', 'Zona', 'ej: Lomas de Zamora y alrededores', 'input'],
  ['direccion', 'Dirección (opcional)', '', 'input'],
  ['horario', 'Horario de atención', 'ej: lunes a viernes de 9 a 18', 'input'],
  ['instagram', 'Instagram (opcional)', 'ej: @ldrental', 'input'],
];
const valor = (s, k) => (Array.isArray(s[k]) ? s[k].join('\n') : s[k] || '');
export const urlPaginaEmpresa = () => location.origin + location.pathname + '#/empresa';

export function sitioEmpresaForm() {
  const s = settings.sitioEmpresa || {};
  openModal('<h3>Página de la empresa</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Es la página pública para que te conozcan y se postulen. El nombre y el logo salen de Ajustes. Lo que dejes vacío no aparece.</div>' +
    CAMPOS.map(([k, l, ph, t]) => '<label class="f"><span>' + l + '</span>' + (t === 'textarea' ? '<textarea id="se_' + k + '" rows="' + (k === 'bajada' ? 2 : 4) + '" placeholder="' + esc(ph) + '">' + esc(valor(s, k)) + '</textarea>' : '<input id="se_' + k + '" value="' + esc(valor(s, k)) + '" placeholder="' + esc(ph) + '">') + '</label>').join('') +
    '<div class="row"><button class="btn grow" onclick="guardarSitioEmpresa()">Guardar</button><button class="btn sec" onclick="closeModal()">Cerrar</button></div>' +
    '<div class="card small" style="margin-top:10px"><b>Dónde se ve</b><div style="margin-top:4px;overflow-wrap:anywhere">' + esc(urlPaginaEmpresa()) + '</div>' +
    '<div class="muted" style="margin-top:4px">Y en www.ldrental.com.ar cuando apuntes ese dominio a Vercel. Para que muestre estos textos, tiene que estar pegada la versión nueva de la función postulacion en Supabase.</div>' +
    '<a class="btn sec sm" style="margin-top:8px;display:inline-block;text-decoration:none" href="' + esc(urlPaginaEmpresa()) + '" target="_blank" rel="noopener">Ver la página</a></div>');
}
export function guardarSitioEmpresa() {
  const s = {};
  CAMPOS.forEach(([k]) => {
    const v = ((document.getElementById('se_' + k) || {}).value || '').trim();
    s[k] = k === 'requisitos' || k === 'beneficios' ? v.split('\n').map(x => x.trim()).filter(Boolean) : v;
  });
  saveSettings({ sitioEmpresa: s });
  toast('Página guardada');
}
