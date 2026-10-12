// Partes del portal del chofer agregadas en la ronda de las 200 preguntas:
// racha sin atrasos, recordatorio del service, avisar que se atrasa con el pago,
// cargar un gasto que pagó él, avisar que devuelve el auto y mandar reclamos.
import { esc, money, fdate, iso, today } from './utils.js';

const mañana = () => { const d = today(); d.setDate(d.getDate() + 1); return iso(d); };
const autoSelect = (id, autos) => '<label class="f"><span>Auto</span><select id="' + id + '">' + autos.map(a => '<option value="' + esc(a.id) + '">' + esc(a.patente) + '</option>').join('') + '</select></label>';

// Arriba de todo: turno de service de hoy o mañana y la racha de semanas al día.
export function bannersPortal(j) {
  let h = '';
  const hoy = iso(today()), man = mañana();
  (j.misAutos || []).forEach(m => (m.turnos || []).filter(t => t.estado === 'confirmado' && (t.fecha === hoy || t.fecha === man)).forEach(t => {
    h += '<div class="card" style="margin-bottom:12px;border-color:var(--warn)"><b>🔧 ' + (t.fecha === hoy ? 'Hoy' : 'Mañana') + ' tenés turno de service</b><div class="small">' + esc(m.patente) + ' · ' + esc(t.motivo || 'Service') + (t.hora ? ' · a las ' + esc(t.hora) : '') + '</div>' + (t.nota ? '<div class="small muted">' + esc(t.nota) + '</div>' : '') + '</div>';
  }));
  if (j.racha >= 2) h += '<div class="card" style="margin-bottom:12px;border-color:var(--ok)"><b>🔥 Llevás ' + j.racha + ' semanas seguidas al día</b><div class="small muted">¡Gracias por cumplir! Seguí así.</div></div>';
  return h;
}

// Debajo de "Cómo pagar".
export function avisoAtrasoHtml(j) {
  if (!(j.autos || []).length) return '';
  const a = j.avisoAtraso;
  const vigente = a && a.estado !== 'cerrado' && a.pagaEl >= iso(today());
  return '<div class="card" id="aa_card" style="margin-bottom:14px">' +
    (vigente ? '<div class="small">Avisaste el ' + fdate(a.fecha) + ' que pagás el <b>' + fdate(a.pagaEl) + '</b>. La empresa ya lo sabe.</div>'
      : '<details><summary style="cursor:pointer"><b>¿Te vas a atrasar con el pago?</b> <span class="small muted">Avisá acá</span></summary>' +
        '<div class="small muted" style="margin:6px 0">Avisar antes es mejor que no decir nada: la empresa lo tiene en cuenta.</div>' +
        '<label class="f"><span>¿Qué día pagás?</span><input id="aa_fecha" type="date" min="' + iso(today()) + '"></label>' +
        '<label class="f"><span>¿Qué pasó? <small>opcional</small></span><input id="aa_motivo" placeholder="ej: el auto estuvo en el taller, cobro el viernes"></label>' +
        '<button class="btn sec block" id="aa_btn">Avisar</button><div class="small muted" id="aa_status" style="margin-top:6px"></div></details>') +
    '</div>';
}

const ESTADO_GASTO = { pendiente: ['La empresa lo está revisando', 'var(--warn)'], aprobado: ['Aprobado: se descontó de lo que debés', 'var(--ok)'], rechazado: ['No se descontó', 'var(--bad)'] };
export function seccionesFinalesPortal(j) {
  const autos = j.misAutos || [];
  let h = '';
  if (autos.length) {
    const G = j.gastosChofer || [];
    h += '<div class="sec-t">Pagué un gasto del auto</div><div class="card" id="gc_card">' +
      '<div class="small muted" style="margin-bottom:8px">Si pagaste algo del auto (una lámpara, un lavado, una gomería), cargalo con la foto del ticket. Si la empresa lo aprueba, se te descuenta de lo que debés.</div>' +
      (G.length ? G.map(g => '<div class="row between small" style="padding:3px 0;gap:8px"><span>' + fdate(g.fecha) + ' · ' + esc(g.concepto) + ' · ' + money(g.monto) + '</span><b style="color:' + (ESTADO_GASTO[g.estado] || ['', 'var(--muted)'])[1] + ';text-align:right">' + esc((ESTADO_GASTO[g.estado] || [g.estado])[0]) + '</b></div>' + (g.nota ? '<div class="small muted">' + esc(g.nota) + '</div>' : '')).join('') + '<div style="border-top:1px solid var(--line);margin:8px 0"></div>' : '') +
      autoSelect('gc_car', autos) +
      '<label class="f"><span>¿Qué pagaste?</span><input id="gc_concepto" placeholder="ej: lámpara de giro"></label>' +
      '<div class="two"><label class="f"><span>Monto</span><input id="gc_monto" inputmode="decimal"></label><label class="f"><span>Fecha</span><input id="gc_fecha" type="date" value="' + iso(today()) + '"></label></div>' +
      '<label class="f"><span>Tipo</span><select id="gc_cat"><option value="repuestos">Repuesto</option><option value="service">Arreglo / gomería</option><option value="otro">Lavado u otro</option></select></label>' +
      '<label class="btn sec block filebtn">Foto del ticket<input id="gc_foto" type="file" accept="image/*" capture="environment"></label><div class="small muted" id="gc_foto_txt" style="margin:4px 0"></div>' +
      '<button class="btn sec block" id="gc_btn">Enviar</button><div class="small muted" id="gc_status" style="margin-top:6px"></div></div>';
    const dv = j.devolucion;
    h += '<div class="sec-t">Devolver el auto</div><div class="card" id="dv_card">' +
      (dv && dv.estado === 'avisada' ? '<div class="small">Avisaste que devolvés el auto el <b>' + fdate(dv.fechaDevolucion) + '</b>. La empresa se va a comunicar con vos para coordinar.</div>'
        : '<details><summary class="small" style="cursor:pointer">Avisar que voy a devolver el auto</summary>' +
          autoSelect('dv_car', autos) +
          '<label class="f"><span>¿Qué día lo devolvés?</span><input id="dv_fecha" type="date" min="' + iso(today()) + '"></label>' +
          '<label class="f"><span>Motivo <small>opcional</small></span><input id="dv_motivo"></label>' +
          '<button class="btn sec block" id="dv_btn">Avisar</button><div class="small muted" id="dv_status" style="margin-top:6px"></div></details>') +
      '</div>';
  }
  const R = j.reclamos || [];
  h += '<div class="sec-t">Reclamos y sugerencias</div><div class="card" id="rc_card">' +
    (R.length ? R.map(r => '<div class="small" style="padding:3px 0"><span class="muted">' + fdate(r.fecha) + '</span> · ' + esc(r.detalle).slice(0, 80) + ' · <b style="color:' + (r.estado === 'resuelto' ? 'var(--ok)' : 'var(--warn)') + '">' + (r.estado === 'resuelto' ? 'Resuelto' : 'Recibido') + '</b>' + (r.resolucion ? '<div class="muted">' + esc(r.resolucion) + '</div>' : '') + '</div>').join('') + '<div style="border-top:1px solid var(--line);margin:8px 0"></div>' : '') +
    '<label class="f"><span>Sobre qué</span><select id="rc_motivo"><option value="pagos">Pagos o cobros</option><option value="auto">El auto o el taller</option><option value="trato">Trato o atención</option><option value="portal">Esta página</option><option value="sugerencia">Una sugerencia</option><option value="otro">Otro</option></select></label>' +
    '<label class="f"><span>Contanos</span><textarea id="rc_detalle"></textarea></label>' +
    '<button class="btn sec block" id="rc_btn">Enviar</button><div class="small muted" id="rc_status" style="margin-top:6px"></div></div>';
  return h;
}

export function conectarExtra(wrap, post, comprimirImagen) {
  const $w = s => wrap.querySelector(s);
  const boton = (sel, fn) => { const b = $w(sel); if (b) b.addEventListener('click', async () => { b.disabled = true; try { await fn(b); } finally { b.disabled = false; } }); };
  boton('#aa_btn', async () => {
    const st = $w('#aa_status'), fecha = $w('#aa_fecha').value;
    if (!fecha) { st.textContent = 'Elegí el día que pagás'; return; }
    st.textContent = 'Enviando…';
    const r = await post({ accion: 'aviso_atraso', pagaEl: fecha, motivo: $w('#aa_motivo').value });
    if (r.ok) $w('#aa_card').innerHTML = '<div class="small" style="color:var(--ok)">✓ Listo. La empresa sabe que pagás el ' + fdate(fecha) + '.</div>';
    else st.textContent = r.error || 'No se pudo enviar, probá de nuevo.';
  });
  const gcFoto = $w('#gc_foto');
  if (gcFoto) gcFoto.addEventListener('change', () => { $w('#gc_foto_txt').textContent = gcFoto.files.length ? '✓ Foto lista' : ''; });
  boton('#gc_btn', async () => {
    const st = $w('#gc_status');
    const concepto = $w('#gc_concepto').value.trim(), monto = +String($w('#gc_monto').value).replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
    if (!concepto) { st.textContent = 'Contá qué pagaste'; return; }
    if (!monto) { st.textContent = 'Poné el monto'; return; }
    let imagen = '';
    const f = gcFoto && gcFoto.files[0];
    if (f) { st.textContent = 'Preparando la foto…'; try { imagen = await comprimirImagen(f); } catch (e) { st.textContent = 'No se pudo procesar la foto'; return; } }
    st.textContent = 'Enviando…';
    const r = await post({ accion: 'gasto', carId: $w('#gc_car').value, concepto, monto, fecha: $w('#gc_fecha').value, categoria: $w('#gc_cat').value, imagen });
    if (r.ok) { st.textContent = '✓ Enviado. Cuando la empresa lo apruebe lo ves acá.'; $w('#gc_concepto').value = ''; $w('#gc_monto').value = ''; if (gcFoto) gcFoto.value = ''; $w('#gc_foto_txt').textContent = ''; }
    else st.textContent = r.error || 'No se pudo enviar, probá de nuevo.';
  });
  boton('#dv_btn', async () => {
    const st = $w('#dv_status'), fecha = $w('#dv_fecha').value;
    if (!fecha) { st.textContent = 'Elegí el día'; return; }
    st.textContent = 'Enviando…';
    const r = await post({ accion: 'devolucion', carId: $w('#dv_car').value, fecha, motivo: $w('#dv_motivo').value });
    if (r.ok) $w('#dv_card').innerHTML = '<div class="small" style="color:var(--ok)">✓ Listo. La empresa se va a comunicar con vos para coordinar la devolución del ' + fdate(fecha) + '.</div>';
    else st.textContent = r.error || 'No se pudo enviar, probá de nuevo.';
  });
  boton('#rc_btn', async () => {
    const st = $w('#rc_status'), detalle = $w('#rc_detalle').value.trim();
    if (!detalle) { st.textContent = 'Contanos qué pasó'; return; }
    st.textContent = 'Enviando…';
    const r = await post({ accion: 'reclamo', motivo: $w('#rc_motivo').value, detalle });
    if (r.ok) { st.textContent = '✓ Recibido. La empresa te va a responder.'; $w('#rc_detalle').value = ''; }
    else st.textContent = r.error || 'No se pudo enviar, probá de nuevo.';
  });
}
