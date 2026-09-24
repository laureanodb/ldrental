import { esc } from './utils.js';
import { openModal } from './modal.js';
import { CHANGELOG } from './constants.js';

const KEY = 'flota-lastversion';

export function mostrarNovedades() {
  const h = '<h3>Novedades</h3><div class="small muted" style="margin-bottom:10px">Esto es lo nuevo desde la última vez que entraste.</div>' +
  CHANGELOG[0].items.map(t => '<div class="card">' + esc(t) + '</div>').join('') +
  '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="closeModal()">Entendido</button></div>';
  openModal(h);
}
export function checkChangelog() {
  try {
    const latest = CHANGELOG[0].v;
    const last = localStorage.getItem(KEY);
    if (last && last !== latest) mostrarNovedades();
    if (last !== latest) localStorage.setItem(KEY, latest);
  } catch (e) {}
}
