// LD Rental — bot de WhatsApp para el dueño de la flota.
// Meta llama a esta función (webhook) cada vez que llega un mensaje a la
// línea del bot. Si el mensaje viene de un número autorizado
// (WHATSAPP_OWNER_NUMBERS), consulta los datos de la flota y responde.
// Cualquier otro número se ignora, para no exponer datos del negocio.
// Se despliega con la verificación de JWT desactivada (Meta no manda token
// de Supabase). SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen cargadas
// por Supabase; hay que agregar WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID y
// WHATSAPP_OWNER_NUMBERS en Edge Functions → Secrets.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || 'e3a0371437b398928059075505738fe2';
const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN') || '';
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
const OWNERS = (Deno.env.get('WHATSAPP_OWNER_NUMBERS') || '').split(',').map(normTel).filter(Boolean);

const VENC = [['vtv', 'VTV'], ['seguro', 'Seguro'], ['impuesto', 'Impuesto'], ['cedula', 'Cédula'], ['gncOblea', 'Oblea GNC'], ['gncHidraulica', 'Prueba hidráulica GNC'], ['habilitacion', 'Habilitación']];
const AVISO_DIAS = 15;

// Argentina: Meta manda "549..." pero a veces solo acepta enviar a "54...".
function normTel(n: any): string {
  let d = String(n || '').replace(/\D/g, '');
  if (d.startsWith('549')) d = '54' + d.slice(3);
  return d;
}
function sinAcentos(s: any): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function pesos(n: number): string { return '$ ' + Math.round(n || 0).toLocaleString('es-AR'); }
function dolares(n: number): string { return 'US$ ' + Math.round(n || 0).toLocaleString('es-AR'); }
function fecha(iso: string): string { const p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
function hoyAR(): string { return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); }
function dias(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400e3);
}
function restarDias(iso: string, n: number): string {
  return new Date(Date.parse(iso + 'T00:00:00Z') - n * 86400e3).toISOString().slice(0, 10);
}

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function tabla(nombre: string): Promise<any[]> {
  const out: any[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from(nombre).select('id,data').order('id').range(desde, desde + 999);
    if (error) throw error;
    out.push(...(data || []).map((r: any) => Object.assign({ id: r.id }, r.data)));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function cargar() {
  const [cars, drivers, payments, multas] = await Promise.all(['cars', 'drivers', 'payments', 'multas'].map(tabla));
  return { cars: cars.filter((c: any) => !c.vendido), drivers, payments, multas };
}

function esContrato(c: any): boolean { return c.tipo === 'alquiler' || c.tipo === 'financiado'; }
function mon(c: any) { return c.tipo === 'financiado' ? dolares : pesos; }
function chofer(D: any, id: string): any { return D.drivers.find((d: any) => d.id === id); }

function deuda(D: any, c: any, hoy: string): number {
  if (!esContrato(c) || !c.inicio || !c.monto || !c.choferId) return 0;
  const d = dias(c.inicio, hoy);
  if (d < 0) return 0;
  let semanas = Math.floor(d / 7) + 1;
  if (c.tipo === 'financiado' && c.cuotas) semanas = Math.min(semanas, +c.cuotas);
  const tipo = c.tipo === 'alquiler' ? 'alquiler' : 'cuota';
  const pagado = D.payments.filter((p: any) => p.carId === c.id && p.tipo === tipo && p.fecha >= c.inicio).reduce((a: number, p: any) => a + (+p.monto || 0), 0);
  const ajustes = (c.ajustesDeuda || []).reduce((a: number, x: any) => a + (+x.monto || 0), 0);
  return Math.max(0, semanas * c.monto - pagado - ajustes);
}

function vencimientos(D: any, hoy: string) {
  const out: any[] = [];
  for (const c of D.cars) for (const [k, label] of VENC) {
    if (!c[k]) continue;
    const d = dias(hoy, c[k]);
    if (d <= AVISO_DIAS) out.push({ c, label, fecha: c[k], d });
  }
  return out.sort((a, b) => a.d - b.d);
}
function textoDias(d: number): string {
  if (d < 0) return 'vencido hace ' + (-d) + ' día' + (d === -1 ? '' : 's');
  if (d === 0) return 'vence hoy';
  return 'en ' + d + ' día' + (d === 1 ? '' : 's');
}

function cobrado(D: any, desde: string, hasta: string) {
  const L = D.payments.filter((p: any) => p.fecha >= desde && p.fecha <= hasta);
  return {
    ars: L.filter((p: any) => p.tipo !== 'cuota').reduce((a: number, p: any) => a + (+p.monto || 0), 0),
    usd: L.filter((p: any) => p.tipo === 'cuota').reduce((a: number, p: any) => a + (+p.monto || 0), 0),
  };
}
function lineaCobro(x: any): string { return pesos(x.ars) + (x.usd ? ' + ' + dolares(x.usd) : ''); }

const AYUDA = [
  '👋 Soy el bot de *LD Rental*. Podés escribirme:',
  '',
  '• *resumen*: cómo viene la flota',
  '• *cobrado*: lo que entró hoy, en la semana y en el mes',
  '• *deudas*: quién te debe y cuánto',
  '• *vencimientos*: VTV, seguros y demás próximos',
  '• *multas*: multas pendientes',
  '• *taller*: autos parados en el taller',
  '• *disponibles*: autos sin chofer',
  '• Una *patente* (ej: AB123CD): estado de ese auto',
  '• El *nombre de un chofer*: su deuda y sus autos',
].join('\n');

function responder(D: any, texto: string): string {
  const hoy = hoyAR();
  const t = sinAcentos(texto).trim();

  if (!t || /^(hola|buenas|buen dia|ayuda|menu|help|comandos|\?)/.test(t)) return AYUDA;

  if (t.includes('resumen') || t.includes('como viene') || t.includes('estado')) {
    const sem = cobrado(D, restarDias(hoy, 6), hoy);
    let ars = 0, usd = 0;
    for (const c of D.cars) { const d = deuda(D, c, hoy); if (c.tipo === 'financiado') usd += d; else ars += d; }
    const v = vencimientos(D, hoy);
    const m = D.multas.filter((x: any) => x.estado === 'pendiente' || x.estado === 'vencida');
    return [
      '📊 *Resumen de la flota*',
      '',
      'Cobrado (últimos 7 días): ' + lineaCobro(sem),
      'Deuda total: ' + pesos(ars) + (usd ? ' + ' + dolares(usd) : ''),
      'Autos: ' + D.cars.filter(esContrato).length + ' trabajando · ' + D.cars.filter((c: any) => c.tipo === 'disponible').length + ' disponibles · ' + D.cars.filter((c: any) => c.tipo === 'taller').length + ' en taller',
      'Vencimientos próximos: ' + v.length,
      'Multas pendientes: ' + m.length,
      '',
      'Escribí *deudas* o *vencimientos* para ver el detalle.',
    ].join('\n');
  }

  if (/cobr|ingres|entro|recaud|factur/.test(t)) {
    return [
      '💰 *Cobrado*',
      '',
      'Hoy: ' + lineaCobro(cobrado(D, hoy, hoy)),
      'Últimos 7 días: ' + lineaCobro(cobrado(D, restarDias(hoy, 6), hoy)),
      'Este mes: ' + lineaCobro(cobrado(D, hoy.slice(0, 8) + '01', hoy)),
    ].join('\n');
  }

  if (/deud|debe|mora|atras|morosos/.test(t)) {
    const L = D.cars.map((c: any) => ({ c, d: deuda(D, c, hoy) })).filter((x: any) => x.d > 0).sort((a: any, b: any) => b.d - a.d);
    if (!L.length) return '✅ Nadie te debe nada. Todos al día.';
    const totalArs = L.filter((x: any) => x.c.tipo !== 'financiado').reduce((a: number, x: any) => a + x.d, 0);
    const totalUsd = L.filter((x: any) => x.c.tipo === 'financiado').reduce((a: number, x: any) => a + x.d, 0);
    return [
      '🔴 *Deudas* (' + L.length + ')',
      '',
      ...L.slice(0, 20).map((x: any) => '• ' + x.c.patente + ' — ' + ((chofer(D, x.c.choferId) || {}).nombre || 'sin chofer') + ': ' + mon(x.c)(x.d)),
      L.length > 20 ? '… y ' + (L.length - 20) + ' más' : '',
      '',
      'Total: ' + pesos(totalArs) + (totalUsd ? ' + ' + dolares(totalUsd) : ''),
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  }

  if (t.includes('venc')) {
    const v = vencimientos(D, hoy);
    if (!v.length) return '✅ No hay vencimientos en los próximos ' + AVISO_DIAS + ' días.';
    return ['📅 *Vencimientos próximos*', '', ...v.slice(0, 25).map((x: any) => '• ' + x.c.patente + ' ' + x.label + ': ' + fecha(x.fecha) + ' (' + textoDias(x.d) + ')')].join('\n');
  }

  if (t.includes('multa')) {
    const m = D.multas.filter((x: any) => x.estado === 'pendiente' || x.estado === 'vencida').sort((a: any, b: any) => String(b.fecha).localeCompare(String(a.fecha)));
    if (!m.length) return '✅ No hay multas pendientes.';
    const total = m.reduce((a: number, x: any) => a + (+x.monto || 0), 0);
    return [
      '🚨 *Multas pendientes* (' + m.length + ') — ' + pesos(total),
      '',
      ...m.slice(0, 20).map((x: any) => {
        const c = D.cars.find((k: any) => k.id === x.carId);
        const ch = chofer(D, x.choferId);
        return '• ' + (c ? c.patente : 'auto') + ': ' + pesos(+x.monto) + ' (' + fecha(x.fecha) + ')' + (ch ? ' — ' + ch.nombre : '');
      }),
    ].join('\n');
  }

  if (t.includes('taller')) {
    const L = D.cars.filter((c: any) => c.tipo === 'taller');
    return L.length ? ['🔧 *En taller* (' + L.length + ')', '', ...L.map((c: any) => ('• ' + c.patente + ' ' + [c.marca, c.modelo].filter(Boolean).join(' ')).trim())].join('\n') : '✅ No hay autos en el taller.';
  }

  if (/disponib|libre|sin chofer|parado/.test(t)) {
    const L = D.cars.filter((c: any) => c.tipo === 'disponible');
    return L.length ? ['🚗 *Disponibles* (' + L.length + ')', '', ...L.map((c: any) => ('• ' + c.patente + ' ' + [c.marca, c.modelo].filter(Boolean).join(' ')).trim())].join('\n') : 'No hay autos disponibles, están todos asignados.';
  }

  const plano = t.replace(/[^a-z0-9]/g, '');
  const auto = D.cars.find((c: any) => { const p = sinAcentos(c.patente).replace(/[^a-z0-9]/g, ''); return p.length >= 6 && plano.includes(p); });
  if (auto) return fichaAuto(D, auto, hoy);

  const palabras = t.split(/\s+/).filter((w) => w.length >= 3);
  const choferes = D.drivers.filter((d: any) => !d.inactivo && !d.prospecto && sinAcentos(d.nombre).split(/\s+/).some((w) => palabras.includes(w)));
  if (choferes.length === 1) return fichaChofer(D, choferes[0], hoy);
  if (choferes.length > 1) return 'Encontré varios choferes:\n\n' + choferes.slice(0, 10).map((d: any) => '• ' + d.nombre).join('\n') + '\n\nEscribí el nombre completo.';

  return 'No te entendí 🤔\nEscribí *ayuda* para ver lo que puedo responder.';
}

function fichaAuto(D: any, c: any, hoy: string): string {
  const ch = chofer(D, c.choferId);
  const pagos = D.payments.filter((p: any) => p.carId === c.id).sort((a: any, b: any) => String(b.fecha).localeCompare(String(a.fecha)));
  const tipos: any = { alquiler: 'Alquilado', financiado: 'Financiado', disponible: 'Disponible', taller: 'En taller' };
  const v = vencimientos({ cars: [c] }, hoy);
  return [
    '🚗 *' + c.patente + '*' + ([c.marca, c.modelo].filter(Boolean).length ? ' — ' + [c.marca, c.modelo].filter(Boolean).join(' ') : ''),
    '',
    'Estado: ' + (tipos[c.tipo] || c.tipo || '-') + (esContrato(c) && c.monto ? ' · ' + mon(c)(c.monto) + ' por semana' : ''),
    'Chofer: ' + (ch ? ch.nombre + (ch.tel ? ' (' + ch.tel + ')' : '') : 'sin chofer'),
    esContrato(c) ? 'Deuda: ' + mon(c)(deuda(D, c, hoy)) : '',
    pagos.length ? 'Último pago: ' + mon(c)(+pagos[0].monto) + ' el ' + fecha(pagos[0].fecha) : 'Sin pagos registrados',
    v.length ? '\nVencimientos:\n' + v.map((x: any) => '• ' + x.label + ': ' + fecha(x.fecha) + ' (' + textoDias(x.d) + ')').join('\n') : '',
  ].filter(Boolean).join('\n');
}

function fichaChofer(D: any, d: any, hoy: string): string {
  const autos = D.cars.filter((c: any) => c.choferId === d.id);
  return [
    '👤 *' + d.nombre + '*',
    d.tel ? 'Tel: ' + d.tel : '',
    '',
    autos.length ? autos.map((c: any) => '• ' + c.patente + ': debe ' + mon(c)(deuda(D, c, hoy))).join('\n') : 'No tiene autos asignados.',
  ].filter((l, i) => l !== '' || i === 2).join('\n');
}

async function enviar(to: string, body: string): Promise<void> {
  const intento = (num: string) => fetch('https://graph.facebook.com/v20.0/' + WA_PHONE_ID + '/messages', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + WA_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: num, type: 'text', text: { body: body.slice(0, 4000) } }),
  });
  let r = await intento(to);
  if (!r.ok && to.startsWith('549')) r = await intento('54' + to.slice(3));
  if (!r.ok) console.log('No se pudo enviar la respuesta:', await r.text());
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === VERIFY_TOKEN;
    const challenge = url.searchParams.get('hub.challenge');
    return ok && challenge ? new Response(challenge, { status: 200 }) : new Response('Forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let payload: any = null;
  try { payload = await req.json(); } catch (_) { return new Response('OK', { status: 200 }); }

  const mensajes: any[] = [];
  for (const e of payload?.entry || []) for (const ch of e.changes || []) for (const m of ch.value?.messages || []) mensajes.push(m);

  for (const m of mensajes) {
    if (!OWNERS.includes(normTel(m.from))) { console.log('Ignorado, número no autorizado:', m.from); continue; }
    try {
      if (m.type !== 'text') { await enviar(m.from, 'Por ahora solo entiendo mensajes de texto. Escribí *ayuda*.'); continue; }
      const D = await cargar();
      await enviar(m.from, responder(D, m.text?.body || ''));
    } catch (err) {
      console.log('Error respondiendo:', String(err));
      await enviar(m.from, 'Tuve un problema leyendo los datos. Probá de nuevo en un rato.');
    }
  }
  return new Response('EVENT_RECEIVED', { status: 200 });
});
