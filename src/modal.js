import { $ } from './utils.js';
import { renderFiles } from './files.js';

export function openModal(html) {
  renderFiles._tried = 0;
  $('#modal').innerHTML = '<div class="scrim" onclick="closeModal()"></div><div class="sheet" role="dialog" aria-modal="true">' + html + '</div>';
  $('#modal').classList.add('open'); document.body.style.overflow = 'hidden';
}
export function closeModal() { $('#modal').classList.remove('open'); $('#modal').innerHTML = ''; document.body.style.overflow = ''; }

export { toast } from './toast.js';

let armed = null;
export function confirmDel(btn, fn) {
  if (armed && armed.btn === btn) { clearTimeout(armed.t); armed = null; fn(); return; }
  if (armed) { clearTimeout(armed.t); armed.btn.textContent = armed.txt; armed.btn.classList.remove('armed'); }
  const txt = btn.textContent; btn.textContent = '¿Seguro? Tocá de nuevo'; btn.classList.add('armed');
  armed = { btn, txt, t: setTimeout(() => { btn.textContent = txt; btn.classList.remove('armed'); armed = null; }, 4000) };
}
