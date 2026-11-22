// Prueba mensual de la copia de seguridad: baja la última copia automática (la que guarda
// la función backup-semanal), revisa que se pueda leer y que traiga todo, y avisa si algo
// falta. Corre sola una vez por mes en el celular del administrador. No cambia nada.
import { S, sb } from '../state.js';
import { BUCKET } from '../config.js';
import { COLS } from '../constants.js';
import { settings, saveSettings } from '../settings.js';
import { esc, iso, today, fdate, days, parse } from '../utils.js';
import { openModal } from '../modal.js';
import { isAdmin } from '../roles.js';
import { enPractica } from '../practica.js';

export async function probarUltimaCopia() {
  const r = { fecha: iso(today()), ok: false, copiaFecha: '', problemas: [], conteos: {} };
  const L = await sb.storage.from(BUCKET).list('backups', { limit: 100, sortBy: { column: 'name', order: 'desc' } }).catch(e => ({ error: e }));
  if (!L || L.error) { r.problemas.push('No se pudo ver la carpeta de copias automáticas.'); return r; }
  const archivos = (L.data || []).filter(f => /\.json$/.test(f.name)).sort((a, b) => String(b.name).localeCompare(String(a.name)));
  if (!archivos.length) { r.problemas.push('No hay copias automáticas guardadas. Revisá que esté programada la función backup-semanal.'); return r; }
  const f = archivos[0];
  const d = await sb.storage.from(BUCKET).download('backups/' + f.name).catch(e => ({ error: e }));
  if (!d || d.error || !d.data) { r.problemas.push('No se pudo bajar la última copia (' + f.name + ').'); return r; }
  let j; try { j = JSON.parse(await d.data.text()); } catch (e) { r.problemas.push('La última copia está dañada: no se puede leer.'); return r; }
  r.copiaFecha = String(j.fecha || '').slice(0, 10);
  if (j.app !== 'mi-flota') r.problemas.push('El archivo no tiene el formato de copia de la app.');
  const antig = r.copiaFecha ? days(parse(r.copiaFecha), today()) : 999;
  if (antig > 10) r.problemas.push('La última copia automática tiene ' + antig + ' días: las copias semanales no se están haciendo.');
  COLS.forEach(c => {
    const enCopia = Array.isArray(j[c]) ? j[c].length : null, ahora = (S[c] || []).length;
    r.conteos[c] = [enCopia, ahora];
    if (enCopia === null) { if (ahora) r.problemas.push('La copia no trae ' + c + '.'); return; }
    // Una copia de hace una semana puede tener algo menos, pero no mucho menos.
    if (ahora >= 10 && enCopia < ahora * 0.8) r.problemas.push(c + ': la copia trae ' + enCopia + ' y hoy hay ' + ahora + '.');
    const sinId = j[c].filter(x => !x || !x.id).length;
    if (sinId) r.problemas.push(c + ': ' + sinId + ' registro(s) sin código.');
  });
  r.ok = !r.problemas.length;
  return r;
}
const resumen = r => (r.ok ? 'La copia del ' + fdate(r.copiaFecha) + ' está completa.' : r.problemas.join(' '));

// Corre sola si pasó más de un mes desde la última prueba.
export async function pruebaMensualCopia() {
  if (!isAdmin() || enPractica() || !navigator.onLine) return false;
  const u = settings.pruebaCopia;
  if (u && u.fecha && days(parse(u.fecha), today()) < 30) return false;
  const r = await probarUltimaCopia();
  saveSettings({ pruebaCopia: { fecha: r.fecha, ok: r.ok, copiaFecha: r.copiaFecha, resumen: resumen(r).slice(0, 600) } });
  return true;
}
export async function probarCopiaAhora() {
  openModal('<h3>Prueba de la copia de seguridad</h3><div id="pc_res" class="small muted">Bajando la última copia automática…</div>');
  const r = await probarUltimaCopia();
  saveSettings({ pruebaCopia: { fecha: r.fecha, ok: r.ok, copiaFecha: r.copiaFecha, resumen: resumen(r).slice(0, 600) } });
  const el = document.getElementById('pc_res'); if (!el) return;
  el.innerHTML = '<div class="card"><b>' + (r.ok ? '✓ ' : '✗ ') + esc(r.ok ? 'La copia se puede recuperar completa' : 'Hay problemas con la copia') + '</b>' +
    (r.copiaFecha ? '<div class="muted">Copia del ' + fdate(r.copiaFecha) + '</div>' : '') +
    (r.problemas.length ? '<ul style="margin:6px 0 0 18px;padding:0">' + r.problemas.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + '</div>' +
    (Object.keys(r.conteos).length ? '<table class="small" style="width:100%;margin-top:8px"><tr class="muted"><td>Tabla</td><td style="text-align:right">En la copia</td><td style="text-align:right">Hoy</td></tr>' +
      Object.entries(r.conteos).filter(([, v]) => v[0] || v[1]).map(([c, v]) => '<tr><td>' + esc(c) + '</td><td style="text-align:right">' + (v[0] == null ? '—' : v[0]) + '</td><td style="text-align:right">' + v[1] + '</td></tr>').join('') + '</table>' : '') +
    '<button class="btn sec block" style="margin-top:10px" onclick="closeModal()">Cerrar</button>';
}
export function alertaPruebaCopia() {
  if (!isAdmin()) return [];
  const u = settings.pruebaCopia;
  if (!u || u.ok) return [];
  return [{ who: 'Copia de seguridad', sub: 'Prueba mensual', kind: 'sistema', id: '', key: 'sistema:pruebacopia:' + u.fecha, d: 0, cls: 'bad', t: String(u.resumen || 'La copia tiene problemas').slice(0, 140), accion: 'probarCopiaAhora()' }];
}
