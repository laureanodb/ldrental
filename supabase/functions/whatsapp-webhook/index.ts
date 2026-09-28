// LD Rental — bot de WhatsApp de la flota.
// Meta llama a esta función (webhook) cada vez que llega un mensaje a la
// línea del bot. Solo responde a los números autorizados en el secret
// WHATSAPP_OWNER_NUMBERS; cualquier otro número se ignora, para no exponer
// datos del negocio.
//
// Secrets (Edge Functions → Secrets):
//   WHATSAPP_TOKEN            token permanente del usuario del sistema de Meta
//   WHATSAPP_PHONE_NUMBER_ID  identificador del número del bot
//   WHATSAPP_OWNER_NUMBERS    números autorizados, separados por coma. Cada uno
//                             puede llevar rol y nombre: 5491122334455:empleado:Pedro
//                             Roles: admin (todo, es el valor por defecto),
//                             empleado (consulta y carga, pero no cobros, contratos
//                             ni rentabilidad) y consulta (solo consultas, sin
//                             rentabilidad).
//   ANTHROPIC_API_KEY         opcional: activa la interpretación de mensajes
//                             escritos en lenguaje libre.
//   IA_MODEL                  opcional: modelo de Claude a usar (claude-opus-5).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen cargadas por Supabase.
// Se despliega con la verificación de JWT desactivada (Meta no manda token de
// Supabase).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

function env(k: string): string { return Deno.env.get(k) || ''; }

const VERIFY_TOKEN = env('WHATSAPP_VERIFY_TOKEN') || 'e3a0371437b398928059075505738fe2';
const WA_TOKEN = env('WHATSAPP_TOKEN');
const WA_PHONE_ID = env('WHATSAPP_PHONE_NUMBER_ID');
const GRAPH = 'https://graph.facebook.com/v20.0/';
const BUCKET = env('DOCUMENTOS_BUCKET') || 'documentos';
const APP_URL = (env('APP_URL') || 'https://app.ldrental.com.ar/').replace(/\/*$/, '/');
const IA_KEY = env('ANTHROPIC_API_KEY');
const IA_MODEL = env('IA_MODEL') || 'claude-opus-5';
// Una confirmación (botón "Confirmar") vence a las 48 h de enviada.
const CONFIRMACION_MINUTOS = 48 * 60;
// Umbrales de aviso: los mismos valores por defecto que usa la app.
const AVISO_WARN = 15, AVISO_SOFT = 30;

/* ======================================================================
   Utilidades
   ====================================================================== */

// Argentina: Meta manda "549..." pero a veces solo acepta enviar a "54...".
function normTel(n: any): string {
  let d = String(n || '').replace(/\D/g, '');
  if (d.startsWith('549')) d = '54' + d.slice(3);
  return d;
}
function sinAcentos(s: any): string {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function plano(s: any): string { return sinAcentos(s).replace(/[^a-z0-9]/g, ''); }
function num(n: number): string { return Math.round(n || 0).toLocaleString('es-AR'); }
function pesos(n: number): string { return (n < 0 ? '-$ ' : '$ ') + num(Math.abs(n)); }
function dolares(n: number): string { return (n < 0 ? '-US$ ' : 'US$ ') + num(Math.abs(n)); }
function fecha(iso: string): string { const p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
function fechaCorta(iso: string): string { const p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : ''; }
function recortar(s: any, n: number): string { const t = String(s || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function plural(n: number, uno: string, varios?: string): string { return num(n) + ' ' + (n === 1 ? uno : (varios || uno + 's')); }
function semanas(late: number): string { const n = Math.round(late * 10) / 10; return n.toLocaleString('es-AR') + (n === 1 ? ' semana' : ' semanas'); }
function losDias(iso: string): string { const d = DIAS_SEMANA[diaSemana(iso)]; return 'los ' + (d === 'sábado' || d === 'domingo' ? d + 's' : d); }
function capital(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function uid(): string { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function ahoraMin(): number { return Math.floor(Date.now() / 60000); }

// Fechas como texto ISO (YYYY-MM-DD), calculadas en hora de Argentina.
function hoyAR(): string { return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); }
function msDe(iso: string): number { return Date.parse(iso + 'T00:00:00Z'); }
function isoDe(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }
function dias(desde: string, hasta: string): number { return Math.round((msDe(hasta) - msDe(desde)) / 86400e3); }
function sumarDias(iso: string, n: number): string { return isoDe(msDe(iso) + n * 86400e3); }
function sumarMeses(iso: string, n: number): string { const [y, m, d] = iso.split('-').map(Number); return isoDe(Date.UTC(y, m - 1 + n, d)); }
function diaSemana(iso: string): number { return new Date(msDe(iso)).getUTCDay(); }
function lunesDe(iso: string): string { return sumarDias(iso, -((diaSemana(iso) + 6) % 7)); }
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function textoDias(d: number): string {
  if (d < 0) return 'vencido hace ' + plural(-d, 'día');
  if (d === 0) return 'vence hoy';
  return 'en ' + plural(d, 'día');
}
function variacion(actual: number, anterior: number): string {
  if (!anterior) return actual ? '(sin datos del período anterior)' : '';
  const v = Math.round((actual - anterior) / anterior * 100);
  return v === 0 ? '(igual que el período anterior)' : (v > 0 ? '▲ +' : '▼ ') + v + '% vs. ' + pesos(anterior);
}
function waLink(tel: any, texto?: string): string {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = d.slice(1);
  if (!d.startsWith('54')) d = '549' + d;
  return 'https://wa.me/' + d + (texto ? '?text=' + encodeURIComponent(texto) : '');
}

/* ======================================================================
   Catálogos (espejo de src/constants.js de la app)
   ====================================================================== */

const TIPOS: Record<string, string> = { alquiler: 'Alquilado', financiado: 'Financiado', disponible: 'Disponible', taller: 'En taller' };
// [clave, etiqueta, palabras que la identifican]
const VENC: [string, string, string[]][] = [
  ['vtv', 'VTV', ['vtv']],
  ['seguro', 'Seguro', ['seguro', 'poliza']],
  ['impuesto', 'Impuesto automotor', ['impuesto', 'patente']],
  ['cedula', 'Cédula', ['cedula', 'tarjeta verde']],
  ['gncOblea', 'Oblea GNC', ['oblea', 'gnc']],
  ['gncHidraulica', 'Prueba hidráulica GNC', ['hidraulica']],
  ['habilitacion', 'Habilitación', ['habilitacion']],
];
const METODOS: [string, string, string[]][] = [
  ['efectivo', 'efectivo', ['efectivo', 'cash', 'billete']],
  ['transferencia', 'transferencia', ['transferencia', 'transfirio', 'transf', 'cbu', 'alias']],
  ['mercadopago', 'MercadoPago', ['mercadopago', 'mercado pago', 'mp']],
  ['credito', 'tarjeta', ['tarjeta', 'credito']],
];
const GASTO_CATS: [string, string, string[]][] = [
  ['siniestro', 'Siniestro / choque', ['choque', 'siniestro', 'franquicia']],
  ['multa', 'Multa', ['multa', 'infraccion', 'fotomulta']],
  ['combustible', 'Combustible', ['nafta', 'combustible', 'gasoil', 'diesel', 'carga de gnc', 'cargue']],
  ['seguro', 'Seguro (cuota)', ['seguro', 'poliza']],
  ['patente', 'Patente / impuesto automotor', ['patente', 'impuesto']],
  ['repuestos', 'Repuestos y consumibles', ['repuesto', 'aceite', 'filtro', 'bujia', 'pastilla', 'neumatico', 'cubierta', 'bateria', 'correa', 'liquido', 'lampara', 'escobilla']],
  ['service', 'Service / mantenimiento', ['service', 'mecanico', 'taller', 'arreglo', 'reparacion', 'mano de obra', 'chapa', 'pintura', 'gomeria', 'lavado', 'alineacion', 'balanceo']],
];
const GASTO_LABEL: Record<string, string> = Object.fromEntries(GASTO_CATS.map(x => [x[0], x[1]]).concat([['otro', 'Otro gasto']]));
// Ítems del plan de mantenimiento. El orden importa: primero los más específicos.
const MANT_ITEMS: [string, string, string[]][] = [
  ['liquidoFrenos', 'Líquido de frenos', ['liquido de freno']],
  ['liquidoRefrigerante', 'Líquido refrigerante', ['refrigerante']],
  ['filtroAire', 'Filtro de aire', ['filtro de aire', 'filtro aire']],
  ['filtroHabitaculo', 'Filtro de habitáculo', ['habitaculo']],
  ['aceite', 'Aceite y filtro de aceite', ['aceite']],
  ['frenos', 'Frenos (pastillas y discos)', ['freno', 'pastilla', 'disco']],
  ['bateria', 'Batería', ['bateria']],
  ['correaDistribucion', 'Correa de distribución', ['correa', 'distribucion']],
  ['bujias', 'Bujías', ['bujia']],
  ['alineacion', 'Alineación y balanceo', ['alineacion', 'balanceo']],
  ['neumaticos', 'Neumáticos', ['neumatico', 'cubierta']],
  ['matafuegos', 'Matafuegos', ['matafuego']],
];
// Categorías de archivos de un auto (CCATS en la app).
const DOC_CATS: [string, string, string[]][] = [
  ['cedula', 'Cédula', ['cedula', 'tarjeta verde']],
  ['titulo', 'Título', ['titulo', 'boleto']],
  ['seguroCredencial', 'Credencial de circulación del seguro', ['credencial', 'tarjeta de circulacion']],
  ['seguroCertificado', 'Certificado de cobertura', ['certificado', 'cobertura']],
  ['seguro', 'Póliza de seguro', ['seguro', 'poliza']],
  ['vtv', 'VTV', ['vtv']],
  ['patente', 'Comprobante de patente', ['patente', 'impuesto']],
  ['contrato', 'Contrato', ['contrato']],
  ['manual', 'Manual', ['manual']],
  ['fotos', 'Fotos del auto', ['foto', 'fotos', 'bitacora']],
];
const UNIDADES: Record<string, string> = { unidad: 'unidad', litro: 'litro', kg: 'kg', juego: 'juego' };

function contiene(t: string, palabra: string): boolean {
  return new RegExp('(^|[^a-z0-9])' + palabra.replace(/ /g, '\\s+') + '([^a-z0-9]|$)').test(t) ||
    new RegExp('(^|[^a-z0-9])' + palabra.replace(/ /g, '\\s+') + 's([^a-z0-9]|$)').test(t);
}
function buscarCat<T extends [string, string, string[]]>(t: string, cats: T[]): T | null {
  for (const c of cats) if (c[2].some(p => contiene(t, p))) return c;
  return null;
}

/* ======================================================================
   Usuarios autorizados y permisos
   ====================================================================== */

type Rol = 'admin' | 'empleado' | 'consulta';
interface Usuario { tel: string; rol: Rol; nombre: string }

function leerUsuarios(s: string): Usuario[] {
  return s.split(',').map(x => x.trim()).filter(Boolean).map(x => {
    const [tel, rol, ...nombre] = x.split(':').map(y => y.trim());
    const r = sinAcentos(rol);
    return { tel: normTel(tel), rol: (r === 'empleado' || r === 'consulta' ? r : 'admin') as Rol, nombre: nombre.join(':') };
  }).filter(u => u.tel);
}
const USUARIOS = leerUsuarios(env('WHATSAPP_OWNER_NUMBERS'));

const PERMISOS: Record<string, Rol[]> = {
  cargar: ['admin', 'empleado'],   // km, gastos, stock, service, vencimientos, recordatorios, fotos
  cobrar: ['admin'],               // cobros y pagos a cuenta
  contratos: ['admin'],            // valor semanal y asignación de choferes
  finanzas: ['admin'],             // rentabilidad, ranking y tablero con neto
};
function puede(u: Usuario, permiso: string): boolean { return (PERMISOS[permiso] || []).includes(u.rol); }
function sinPermiso(): string { return '🔒 Tu número no tiene permiso para eso. Pedíselo al dueño de la flota.'; }
function etiquetaUsuario(u: Usuario): string { return 'WhatsApp +' + u.tel + (u.nombre ? ' (' + u.nombre + ')' : ''); }

/* ======================================================================
   Datos (Supabase)
   ====================================================================== */

const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const TABLAS_OBLIGATORIAS = ['cars', 'drivers', 'payments'];
const TABLAS_OPCIONALES = ['gastos', 'mantenimientos', 'multas', 'depositos', 'repuestos', 'proveedores', 'recordatorios'];

async function tabla(nombre: string, opcional: boolean): Promise<any[]> {
  const out: any[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from(nombre).select('id,data').order('id').range(desde, desde + 999);
    if (error) { if (opcional) { console.log('No se pudo leer ' + nombre + ':', error.message); return []; } throw error; }
    out.push(...(data || []).map((r: any) => Object.assign({ id: r.id }, r.data)));
    if (!data || data.length < 1000) break;
  }
  return out;
}
// Corrige autos guardados con un bug viejo de la app: la patente quedó con una fecha.
function normCar(c: any): any {
  if (/^\d{4}-\d{2}-\d{2}$/.test(c.patente || '')) { if (!c.impuesto) c.impuesto = c.patente; c.patente = ''; }
  return c;
}
async function cargar(): Promise<any> {
  const nombres = TABLAS_OBLIGATORIAS.concat(TABLAS_OPCIONALES);
  const datos = await Promise.all(nombres.map(n => tabla(n, TABLAS_OPCIONALES.includes(n))));
  const D: any = {};
  nombres.forEach((n, i) => { D[n] = datos[i]; });
  D.todos = D.cars.map(normCar);
  D.cars = D.todos.filter((c: any) => !c.vendido);
  return D;
}
async function guardar(u: Usuario, col: string, obj: any): Promise<void> {
  const data = Object.assign({}, obj); delete data.id;
  const { error } = await sb.from(col).upsert({ id: obj.id, data, updated_at: new Date().toISOString() });
  if (error) throw new Error('No se pudo guardar en ' + col + ': ' + error.message);
  try {
    await sb.from('audit_log').insert({ user_id: null, user_email: etiquetaUsuario(u), accion: 'guardado', tabla: col, registro_id: obj.id });
  } catch (e) { console.log('No se pudo auditar:', String(e)); }
}

/* ======================================================================
   Cálculos (espejo de src/calc.js de la app)
   ====================================================================== */

function esContrato(c: any): boolean { return c.tipo === 'alquiler' || c.tipo === 'financiado'; }
function monedaDe(c: any) { return c.tipo === 'financiado' ? dolares : pesos; }
function chofer(D: any, id: string): any { return id ? D.drivers.find((d: any) => d.id === id) : null; }
function nombreChofer(D: any, id: string): string { const d = chofer(D, id); return d ? d.nombre : ''; }
function descAuto(c: any): string { return [c.marca, c.modelo].filter(Boolean).join(' '); }
function tituloAuto(c: any): string { return (c.patente || 'Auto sin patente') + (descAuto(c) ? ' (' + descAuto(c) + ')' : ''); }
function choferesActivos(D: any): any[] { return D.drivers.filter((d: any) => !d.inactivo && !d.prospecto); }

function esDeTipo(x: any, tipo: string): boolean {
  if (tipo === 'garantia') return !x.tipo || x.tipo === 'cuota' || x.tipo === 'garantia';
  return x.tipo === tipo;
}
function saldoDeposito(D: any, driverId: string, tipo: string): number {
  return D.depositos.filter((x: any) => x.driverId === driverId && esDeTipo(x, tipo)).reduce((a: number, x: any) => a + (+x.monto || 0), 0);
}
function calc(D: any, c: any, hoy: string): any {
  const r: any = { debt: 0, late: 0, paid: 0, due: 0, weeks: 0, saldo: null, total: 0, ajustes: 0, adelantoAplicado: 0 };
  if (!esContrato(c) || !c.inicio || !c.monto) return r;
  const d = dias(c.inicio, hoy);
  if (d < 0) return r;
  let weeks = Math.floor(d / 7) + 1;
  const kind = c.tipo === 'alquiler' ? 'alquiler' : 'cuota';
  if (c.tipo === 'financiado' && c.cuotas) weeks = Math.min(weeks, +c.cuotas);
  const paid = D.payments.filter((p: any) => p.carId === c.id && p.tipo === kind && p.fecha >= c.inicio).reduce((a: number, p: any) => a + (+p.monto || 0), 0);
  const ajustes = (c.ajustesDeuda || []).reduce((a: number, x: any) => a + (+x.monto || 0), 0);
  const due = weeks * c.monto;
  const adelanto = c.choferId ? saldoDeposito(D, c.choferId, 'semana_adelantada') : 0;
  const debtSinAdelanto = Math.max(0, due - paid - ajustes);
  r.weeks = weeks; r.paid = paid; r.due = due; r.ajustes = ajustes;
  r.adelantoAplicado = Math.min(adelanto, debtSinAdelanto);
  r.debt = Math.max(0, debtSinAdelanto - adelanto); r.late = r.debt / c.monto;
  if (c.tipo === 'financiado') { r.total = +c.total || c.monto * (+c.cuotas || 0); r.saldo = Math.max(0, r.total - paid); }
  return r;
}
// Seguro que paga la empresa y le cobra al chofer (auto con seguroPaga = 'recupera').
function esSeguroRecuperable(g: any): boolean { return g.categoria === 'seguro' && Boolean(g.recuperaDe); }
function seguroPendiente(D: any, driverId: string): number {
  const cargado = D.gastos.filter((g: any) => esSeguroRecuperable(g) && g.recuperaDe === driverId).reduce((a: number, g: any) => a + (+g.costo || 0), 0);
  const pagado = D.payments.filter((p: any) => p.tipo === 'seguro' && p.choferId === driverId).reduce((a: number, p: any) => a + (+p.monto || 0), 0);
  return Math.max(0, cargado - pagado);
}
function saldoAdelantos(D: any, driverId: string): number {
  const d = chofer(D, driverId);
  return ((d && d.adelantos) || []).reduce((a: number, x: any) => a + (+x.monto || 0), 0);
}
function deudaChofer(D: any, driverId: string, hoy: string): { ars: number; usd: number } {
  let ars = saldoAdelantos(D, driverId), usd = 0;
  D.todos.filter((c: any) => c.choferId === driverId && esContrato(c)).forEach((c: any) => {
    const d = calc(D, c, hoy).debt; if (c.tipo === 'financiado') usd += d; else ars += d;
  });
  return { ars, usd };
}
function semanaAdelantadaDisponible(D: any, driverId: string, hoy: string): number {
  const consumida = D.todos.filter((c: any) => c.choferId === driverId && esContrato(c)).reduce((a: number, c: any) => a + (calc(D, c, hoy).adelantoAplicado || 0), 0);
  return Math.max(0, saldoDeposito(D, driverId, 'semana_adelantada') - consumida);
}
function puntualidad(D: any, driverId: string, hoy: string): number | null {
  let total = 0, atrasadas = 0, tiene = false;
  D.todos.filter((c: any) => c.choferId === driverId && esContrato(c) && c.inicio).forEach((c: any) => {
    tiene = true; const i = calc(D, c, hoy); total += i.weeks; atrasadas += i.late;
  });
  if (!tiene || !total) return null;
  return Math.max(0, Math.round((1 - atrasadas / total) * 100));
}
function vs(f: string, hoy: string): any {
  if (!f) return null;
  const d = dias(hoy, f);
  if (d < 0) return { d, cls: 'bad' };
  if (d === 0) return { d, cls: 'bad' };
  if (d <= AVISO_WARN) return { d, cls: 'warn' };
  if (d <= AVISO_SOFT) return { d, cls: 'soft' };
  return { d, cls: 'ok' };
}
function estadoPlanItem(c: any, p: any, hoy: string): any {
  const km = +c.km || 0;
  let restanteKm: number | null = null, restanteDias: number | null = null;
  if (p.intervaloKm) restanteKm = (+p.ultimoKm || 0) + (+p.intervaloKm) - km;
  if (p.intervaloMeses && p.ultimaFecha) restanteDias = dias(hoy, sumarMeses(p.ultimaFecha, +p.intervaloMeses));
  let cls = 'ok';
  if ((restanteKm != null && restanteKm <= 0) || (restanteDias != null && restanteDias <= 0)) cls = 'bad';
  else if ((restanteKm != null && restanteKm <= 1000) || (restanteDias != null && restanteDias <= AVISO_WARN)) cls = 'warn';
  else if ((restanteKm != null && restanteKm <= 3000) || (restanteDias != null && restanteDias <= AVISO_SOFT)) cls = 'soft';
  return { cls, restanteKm, restanteDias };
}
function textoRestante(e: any): string {
  if (e.cls === 'ok') return 'al día';
  if (e.cls === 'bad') return 'vencido';
  const partes: string[] = [];
  if (e.restanteKm != null && e.restanteKm > 0) partes.push(num(e.restanteKm) + ' km');
  if (e.restanteDias != null && e.restanteDias > 0) partes.push(plural(e.restanteDias, 'día'));
  return 'en ' + (partes.join(' / ') || 'breve');
}
const ORDEN_CLS: Record<string, number> = { bad: 0, warn: 1, soft: 2, ok: 3 };
function servicePendiente(c: any, hoy: string): any[] {
  return (c.mantenimientoPlan || []).filter((p: any) => p.intervaloKm || p.intervaloMeses)
    .map((p: any) => ({ p, e: estadoPlanItem(c, p, hoy) })).filter((x: any) => x.e.cls !== 'ok')
    .sort((a: any, b: any) => ORDEN_CLS[a.e.cls] - ORDEN_CLS[b.e.cls]);
}
function vencimientosDe(cars: any[], hoy: string, horizonte: number): any[] {
  const out: any[] = [];
  for (const c of cars) for (const [k, label] of VENC) {
    if (!c[k]) continue;
    const d = dias(hoy, c[k]);
    if (d <= horizonte) out.push({ c, k, label, fecha: c[k], d });
  }
  return out.sort((a, b) => a.d - b.d);
}
// Cada auto se cobra el mismo día de la semana en que arrancó el contrato.
function inicioCiclo(D: any, c: any, hoy: string): string {
  const w = calc(D, c, hoy).weeks;
  return w ? sumarDias(c.inicio, (w - 1) * 7) : c.inicio;
}
function metodoPreferido(D: any, choferId: string): string {
  const pagos = D.payments.filter((p: any) => p.choferId === choferId && p.metodo).slice(-10);
  const cuenta: Record<string, number> = {};
  pagos.forEach((p: any) => { cuenta[p.metodo] = (cuenta[p.metodo] || 0) + 1; });
  return Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])[0] || '';
}
function metodoLabel(m: string): string { return (METODOS.find(x => x[0] === m) || [0, m])[1] as string; }
function pagosDe(D: any, desde: string, hasta: string): any[] {
  return D.payments.filter((p: any) => p.fecha >= desde && p.fecha <= hasta);
}
function sumaPagos(L: any[]): { ars: number; usd: number } {
  return {
    ars: L.filter(p => p.tipo !== 'cuota').reduce((a, p) => a + (+p.monto || 0), 0),
    usd: L.filter(p => p.tipo === 'cuota').reduce((a, p) => a + (+p.monto || 0), 0),
  };
}
function lineaPesosDolares(x: { ars: number; usd: number }): string { return !x.ars && x.usd ? dolares(x.usd) : pesos(x.ars) + (x.usd ? ' + ' + dolares(x.usd) : ''); }
function gastosDe(D: any, desde: string, hasta: string, carId?: string): any[] {
  const g = D.gastos.filter((x: any) => x.fecha >= desde && x.fecha <= hasta && (carId === undefined || x.carId === carId) && !esSeguroRecuperable(x))
    .map((x: any) => ({ fecha: x.fecha, costo: +x.costo || 0, cat: x.categoria || 'otro', desc: x.descripcion || '' }));
  const m = D.mantenimientos.filter((x: any) => x.fecha >= desde && x.fecha <= hasta && (carId === undefined || x.carId === carId))
    .map((x: any) => ({ fecha: x.fecha, costo: +x.costo || 0, cat: 'mantenimiento', desc: x.label || x.item || 'Mantenimiento' }));
  return g.concat(m);
}
function rentabilidadAuto(D: any, c: any): any {
  const cobrado = D.payments.filter((p: any) => p.carId === c.id && p.tipo !== 'seguro').reduce((a: number, p: any) => a + (+p.monto || 0), 0);
  const gastos = D.gastos.filter((g: any) => g.carId === c.id && !esSeguroRecuperable(g)).reduce((a: number, g: any) => a + (+g.costo || 0), 0) +
    D.mantenimientos.filter((m: any) => m.carId === c.id).reduce((a: number, m: any) => a + (+m.costo || 0), 0);
  const usd = c.tipo === 'financiado';
  return { cobrado, gastos, neta: usd ? null : cobrado - gastos, usd, costoCompra: +c.costoCompra || 0 };
}
function stockBajo(D: any): any[] {
  return D.repuestos.filter((r: any) => !r.inactivo && (+r.stockActual || 0) <= (+r.stockMinimo || 0))
    .sort((a: any, b: any) => (+a.stockActual || 0) - (+b.stockActual || 0));
}
function unidad(r: any, n: number): string {
  const u = UNIDADES[r.unidad] || 'unidad';
  if (n === 1) return u;
  return u === 'unidad' ? 'unidades' : u === 'kg' ? 'kg' : u + 's';
}
function actualizarHistorialChoferes(c: any, nuevo: string, hoy: string): any[] {
  const previo = c ? c.choferId || '' : '';
  let h = (c && c.historialChoferes) || [];
  if (previo === nuevo) return h;
  h = h.map((x: any) => (!x.hasta && x.choferId === previo) ? Object.assign({}, x, { hasta: hoy }) : x);
  if (nuevo) h = h.concat([{ choferId: nuevo, desde: hoy, hasta: null }]);
  return h;
}
function actualizarHistorialMonto(c: any, monto: number, hoy: string): any[] {
  const h = (c && c.montoHistorial) || [];
  if (!monto || monto === (+c.monto || 0)) return h;
  return h.concat([{ fecha: hoy, monto }]);
}

/* ======================================================================
   Cómo entender el texto: autos, choferes, montos y fechas
   ====================================================================== */

// Busca una patente dentro del texto (ignora espacios y guiones: "ab 123 cd").
function buscarAuto(D: any, t: string, todos?: boolean): any {
  const p = plano(t);
  const L = (todos ? D.todos : D.cars).filter((c: any) => { const x = plano(c.patente); return x.length >= 6 && p.includes(x); });
  return L.sort((a: any, b: any) => plano(b.patente).length - plano(a.patente).length)[0] || null;
}
// Quita la patente del texto para que sus números no se confundan con montos.
function sinPatente(t: string, c: any): string {
  if (!c || !c.patente) return t;
  const letras = plano(c.patente).split('').map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s.-]*');
  return t.replace(new RegExp(letras, 'i'), ' ');
}
const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'que', 'con', 'para', 'por', 'una', 'uno', 'unos', 'unas', 'mas', 'hoy', 'ayer', 'auto', 'chofer', 'cuanto', 'debe', 'deuda', 'cuenta', 'estado', 'portal', 'link', 'whatsapp', 'ficha', 'asignar', 'asigna', 'pago', 'pagos', 'cobre', 'cobro', 'semana', 'mes', 'todo', 'todos', 'como', 'viene', 'esta', 'este']);
function buscarChoferes(D: any, t: string): any[] {
  const id = (t.match(/#([a-z0-9]+)/i) || [])[1];
  if (id) { const d = D.drivers.find((x: any) => x.id === id); if (d) return [d]; }
  const palabras = sinAcentos(t).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !PALABRAS_VACIAS.has(w));
  if (!palabras.length) return [];
  const puntaje = (d: any) => { const n = sinAcentos(d.nombre).split(/\s+/); return palabras.filter(w => n.includes(w)).length; };
  const L = choferesActivos(D).map((d: any) => ({ d, s: puntaje(d) })).filter((x: any) => x.s > 0);
  const max = Math.max(0, ...L.map((x: any) => x.s));
  return L.filter((x: any) => x.s === max).map((x: any) => x.d);
}
function autoDeChofer(D: any, d: any): any {
  const L = D.cars.filter((c: any) => c.choferId === d.id && esContrato(c));
  return L.length === 1 ? L[0] : null;
}

// Números con formato argentino: 100000, 100.000, 1.500,50, 100k, 100 mil, 1,5 millones.
function leerNumeros(t: string): { valor: number; km: boolean }[] {
  const out: { valor: number; km: boolean }[] = [];
  const re = /(km\s*)?\$?\s*(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(k\b|mil\b|millon(?:es)?\b|palos?\b|m\b)?(\s*(?:km|kms|kilometros)\b)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    let s = m[2];
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    let v = parseFloat(s);
    if (isNaN(v)) continue;
    const suf = m[3] || '';
    if (suf === 'k' || suf === 'mil') v *= 1000;
    else if (/^(millon|palo|m$)/.test(suf)) v *= 1000000;
    out.push({ valor: Math.round(v * 100) / 100, km: Boolean(m[1] || m[4]) });
  }
  return out;
}
// Fechas en lenguaje natural; devuelve la fecha y el texto que la expresaba.
function leerFecha(t: string, hoy: string): { fecha: string; texto: string } | null {
  let m: RegExpMatchArray | null;
  if ((m = t.match(/\bpasado\s+manana\b/))) return { fecha: sumarDias(hoy, 2), texto: m[0] };
  if ((m = t.match(/\bmanana\b/))) return { fecha: sumarDias(hoy, 1), texto: m[0] };
  if ((m = t.match(/\bayer\b/))) return { fecha: sumarDias(hoy, -1), texto: m[0] };
  if ((m = t.match(/\bhoy\b/))) return { fecha: hoy, texto: m[0] };
  if ((m = t.match(/\ben\s+(\d+|un|una|dos|tres)\s+(dia|dias|semana|semanas|mes|meses)\b/))) {
    const n = ({ un: 1, una: 1, dos: 2, tres: 3 } as any)[m[1]] || +m[1];
    const f = m[2].startsWith('dia') ? sumarDias(hoy, n) : m[2].startsWith('semana') ? sumarDias(hoy, 7 * n) : sumarMeses(hoy, n);
    return { fecha: f, texto: m[0] };
  }
  if ((m = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/))) {
    const d = +m[1], mes = +m[2];
    let y = m[3] ? +m[3] : +hoy.slice(0, 4);
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mes >= 1 && mes <= 12) {
      let f = y + '-' + String(mes).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      if (!m[3] && f < sumarDias(hoy, -180)) f = (y + 1) + f.slice(4);
      return { fecha: f, texto: m[0] };
    }
  }
  if ((m = t.match(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?(\d{4}))?\b/))) {
    const mes = m[2] === 'setiembre' ? 9 : MESES.indexOf(m[2]) + 1;
    let y = m[3] ? +m[3] : +hoy.slice(0, 4);
    let f = y + '-' + String(mes).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
    if (!m[3] && f < sumarDias(hoy, -180)) { y += 1; f = y + f.slice(4); }
    return { fecha: f, texto: m[0] };
  }
  if ((m = t.match(/\b(?:el\s+|este\s+|el proximo\s+|proximo\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/))) {
    const objetivo = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].indexOf(m[1]);
    let n = (objetivo - diaSemana(hoy) + 7) % 7; if (n === 0) n = 7;
    return { fecha: sumarDias(hoy, n), texto: m[0] };
  }
  if ((m = t.match(/\bel\s+(\d{1,2})\b(?!\s*(?:km|%|\/))/))) {
    const d = +m[1];
    if (d >= 1 && d <= 31) {
      let f = hoy.slice(0, 8) + String(d).padStart(2, '0');
      if (f < hoy) f = sumarMeses(hoy.slice(0, 8) + '01', 1).slice(0, 8) + String(d).padStart(2, '0');
      return { fecha: f, texto: m[0] };
    }
  }
  return null;
}
function quitar(t: string, parte: string | null | undefined): string { return parte ? t.replace(parte, ' ') : t; }
function limpiarEspacios(t: string): string { return t.replace(/\s+/g, ' ').trim(); }

/* ======================================================================
   Salidas: texto, botones, listas y archivos
   ====================================================================== */

type Salida =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'botones'; texto: string; botones: { id: string; titulo: string }[] }
  | { tipo: 'lista'; texto: string; boton: string; filas: { id: string; titulo: string; desc?: string }[] }
  | { tipo: 'media'; clase: 'image' | 'document'; link: string; caption?: string; nombre?: string };

function txt(texto: string): Salida { return { tipo: 'texto', texto }; }
function botones(texto: string, bs: { id: string; titulo: string }[]): Salida { return { tipo: 'botones', texto, botones: bs.slice(0, 3) }; }
function botonCmd(comando: string, titulo: string) { return { id: 'cmd:' + comando, titulo }; }

// Las acciones a confirmar viajan dentro del id del botón (máx. 256 caracteres,
// 200 en las filas de una lista): así no hace falta guardar nada pendiente.
function idAccion(a: any, max = 256): string {
  const x = Object.assign({}, a, { ts: ahoraMin() });
  let s = 'ok:' + JSON.stringify(x);
  while (s.length > max && typeof x.n === 'string' && x.n.length > 12) {
    x.n = x.n.slice(0, Math.max(12, x.n.length - (s.length - max) - 1));
    s = 'ok:' + JSON.stringify(x);
  }
  if (s.length > max) throw new Error('Acción demasiado larga para un botón');
  return s;
}
function pedirConfirmacion(texto: string, a: any, ok = 'Confirmar'): Salida {
  return botones(texto, [{ id: idAccion(a), titulo: ok }, { id: 'no', titulo: 'Cancelar' }]);
}

function partir(texto: string, max: number): string[] {
  if (texto.length <= max) return [texto];
  const out: string[] = []; let actual = '';
  for (const linea of texto.split('\n')) {
    if ((actual + '\n' + linea).length > max && actual) { out.push(actual); actual = linea; }
    else actual = actual ? actual + '\n' + linea : linea;
  }
  if (actual) out.push(actual);
  return out.flatMap(p => p.length > max ? p.match(new RegExp('[\\s\\S]{1,' + max + '}', 'g')) || [] : [p]);
}
async function llamarGraph(path: string, body: any): Promise<Response> {
  return await fetch(GRAPH + path, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + WA_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
async function enviarPayload(to: string, payload: any): Promise<void> {
  const cuerpo = (n: string) => Object.assign({ messaging_product: 'whatsapp', recipient_type: 'individual', to: n }, payload);
  let r = await llamarGraph(WA_PHONE_ID + '/messages', cuerpo(to));
  if (!r.ok && to.startsWith('549')) r = await llamarGraph(WA_PHONE_ID + '/messages', cuerpo('54' + to.slice(3)));
  if (!r.ok) console.log('No se pudo enviar el mensaje:', await r.text());
}
async function enviar(to: string, s: Salida): Promise<void> {
  if (s.tipo === 'texto') {
    for (const parte of partir(s.texto, 3900)) await enviarPayload(to, { type: 'text', text: { body: parte, preview_url: false } });
    return;
  }
  if (s.tipo === 'media') {
    const media: any = { link: s.link };
    if (s.caption) media.caption = recortar(s.caption, 1000);
    if (s.clase === 'document') media.filename = s.nombre || 'documento.pdf';
    await enviarPayload(to, { type: s.clase, [s.clase]: media });
    return;
  }
  // Los mensajes interactivos admiten hasta 1024 caracteres: si el texto es
  // más largo va primero como texto común.
  let cuerpo = s.texto;
  if (cuerpo.length > 1024) { await enviar(to, txt(cuerpo)); cuerpo = s.tipo === 'botones' ? '¿Confirmás?' : 'Elegí una opción:'; }
  if (s.tipo === 'botones') {
    await enviarPayload(to, {
      type: 'interactive',
      interactive: { type: 'button', body: { text: cuerpo }, action: { buttons: s.botones.map(b => ({ type: 'reply', reply: { id: b.id, title: recortar(b.titulo, 20) } })) } },
    });
    return;
  }
  await enviarPayload(to, {
    type: 'interactive',
    interactive: {
      type: 'list', body: { text: cuerpo },
      action: { button: recortar(s.boton, 20), sections: [{ title: 'Opciones', rows: s.filas.slice(0, 10).map(f => Object.assign({ id: f.id, title: recortar(f.titulo, 24) }, f.desc ? { description: recortar(f.desc, 72) } : {})) }] },
    },
  });
}
async function marcarLeido(id: string): Promise<void> {
  try { await llamarGraph(WA_PHONE_ID + '/messages', { messaging_product: 'whatsapp', status: 'read', message_id: id }); } catch (_) { /* no es grave */ }
}

/* ======================================================================
   Archivos: fotos que llegan por WhatsApp y documentos que se mandan
   ====================================================================== */

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
async function subirMediaWhatsApp(mediaId: string): Promise<{ id: string; type: string; size: number }> {
  const r = await fetch(GRAPH + mediaId, { headers: { 'Authorization': 'Bearer ' + WA_TOKEN } });
  const info = await r.json();
  if (!r.ok || !info.url) throw new Error('No se pudo obtener el archivo de WhatsApp');
  const tipo = String(info.mime_type || 'image/jpeg').split(';')[0];
  if (!EXT[tipo]) throw new Error('Formato no admitido (' + tipo + '). Mandá una foto o un PDF.');
  const r2 = await fetch(info.url, { headers: { 'Authorization': 'Bearer ' + WA_TOKEN } });
  if (!r2.ok) throw new Error('No se pudo descargar el archivo de WhatsApp');
  const bytes = new Uint8Array(await r2.arrayBuffer());
  const path = new Date().getFullYear() + '/whatsapp-' + crypto.randomUUID() + '.' + EXT[tipo];
  const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: tipo, upsert: false });
  if (up.error) throw new Error('No se pudo guardar el archivo: ' + up.error.message);
  return { id: path, type: tipo, size: bytes.byteLength };
}
async function linkFirmado(path: string): Promise<string> {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw new Error('No se pudo generar el link del archivo');
  return data.signedUrl;
}

/* ======================================================================
   Menú y ayuda
   ====================================================================== */

function menu(u: Usuario): Salida[] {
  const filas = [
    { id: 'cmd:resumen', titulo: 'Resumen', desc: 'Cómo viene la flota' },
    { id: 'cmd:cobros hoy', titulo: 'Cobros de hoy', desc: 'Lo que entró hoy, auto por auto' },
    { id: 'cmd:quien no pago', titulo: 'Quién no pagó', desc: 'Autos sin pago en su semana actual' },
    { id: 'cmd:top deudores', titulo: 'Los que más deben', desc: 'Los 5 choferes con más deuda' },
    puede(u, 'finanzas')
      ? { id: 'cmd:tablero', titulo: 'Tablero semanal', desc: 'Cobrado, gastos y neto por auto' }
      : { id: 'cmd:esperado', titulo: 'Esperado de la semana', desc: 'Cuánto debería entrar y cuánto entró' },
    { id: 'cmd:flota', titulo: 'Flota', desc: 'Cuántos autos hay en cada estado' },
    { id: 'cmd:vencimientos', titulo: 'Vencimientos', desc: 'Lo que vence en los próximos 30 días' },
    { id: 'cmd:service', titulo: 'Service pendientes', desc: 'Autos con service próximo o vencido' },
    { id: 'cmd:lista de compra', titulo: 'Stock y compras', desc: 'Repuestos bajo mínimo, por proveedor' },
    { id: 'cmd:ayuda cargar', titulo: 'Cómo cargar datos', desc: 'Cobros, gastos, km, service y más' },
  ];
  return [{
    tipo: 'lista', boton: 'Ver opciones', filas,
    texto: '👋 Hola' + (u.nombre ? ' ' + u.nombre : '') + '. Soy el bot de *LD Rental*.\n\nElegí una opción o escribime directamente, por ejemplo:\n• *AB123CD* (ficha de un auto)\n• *deuda Juan*\n• *vencimientos*' + (puede(u, 'cobrar') ? '\n• *cobré 100000 AB123CD*' : ''),
  }];
}
function ayudaCargar(u: Usuario): string {
  if (!puede(u, 'cargar')) return '🔒 Tu número solo puede hacer consultas. Escribí *menú* para ver las opciones.';
  const L = ['✍️ *Cómo cargar datos*', 'Siempre te muestro lo que voy a guardar y lo confirmás con un botón.', ''];
  if (puede(u, 'cobrar')) {
    L.push('💵 *Cobro:* cobré 100000 AB123CD', '   Podés sumar el método (efectivo, transferencia, mp) y la fecha (ayer, 25/09).');
    L.push('💵 *Pago a cuenta:* a cuenta 50000 AB123CD', '   O "parcial" si es parte de la semana.');
    L.push('🛡️ *Pago de seguro:* cobré seguro 45000 AB123CD');
  }
  L.push('🧾 *Gasto:* gasto 25000 aceite AB123CD', '   Sin patente queda como gasto general.');
  L.push('🛣️ *Kilometraje:* km AB123CD 123456');
  L.push('🔧 *Service hecho:* service AB123CD aceite km 123456 45000');
  L.push('📅 *Vencimiento renovado:* vtv AB123CD 15/03/2027', '   También: seguro, impuesto, cédula, oblea, hidráulica, habilitación.');
  L.push('📦 *Usar stock:* usé 4 litros de aceite en AB123CD');
  L.push('⏰ *Recordatorio:* recordame el viernes llamar al gestor');
  if (puede(u, 'contratos')) {
    L.push('🏷️ *Valor semanal:* valor AB123CD 120000');
    L.push('🤝 *Asignar chofer:* asignar AB123CD Juan');
  }
  L.push('', '📷 *Fotos:* mandá una foto con la patente escrita abajo y queda en la bitácora del auto.');
  if (puede(u, 'cobrar')) L.push('   Con "comprobante AB123CD" se guarda en el último cobro de ese auto, y con "cobré 100000 AB123CD" se registra el cobro con la foto.');
  L.push('   Con "poliza AB123CD", "credencial AB123CD", "certificado AB123CD", "vtv AB123CD" o "cédula AB123CD" se guarda como ese documento.');
  L.push('📄 *Pedir un documento:* doc AB123CD');
  return L.join('\n');
}

/* ======================================================================
   Consultas
   ====================================================================== */

function resumen(D: any, hoy: string): string {
  const sem = sumaPagos(pagosDe(D, lunesDe(hoy), hoy));
  const mes = sumaPagos(pagosDe(D, hoy.slice(0, 8) + '01', hoy));
  let ars = 0, usd = 0;
  for (const c of D.cars) { const d = calc(D, c, hoy).debt; if (c.tipo === 'financiado') usd += d; else ars += d; }
  const v = vencimientosDe(D.cars, hoy, AVISO_WARN);
  const multas = D.multas.filter((x: any) => x.estado === 'pendiente' || x.estado === 'vencida');
  const bajo = stockBajo(D);
  return [
    '📊 *Resumen de la flota*', '',
    'Cobrado esta semana: ' + lineaPesosDolares(sem),
    'Cobrado este mes: ' + lineaPesosDolares(mes),
    'Deuda total: ' + pesos(ars) + (usd ? ' + ' + dolares(usd) : ''),
    'Autos: ' + D.cars.filter(esContrato).length + ' trabajando · ' + D.cars.filter((c: any) => c.tipo === 'disponible').length + ' disponibles · ' + D.cars.filter((c: any) => c.tipo === 'taller').length + ' en taller',
    'Vencimientos en ' + AVISO_WARN + ' días: ' + v.length,
    'Multas pendientes: ' + multas.length,
    bajo.length ? 'Repuestos bajo mínimo: ' + bajo.length : '',
    (() => { const t = choferesActivos(D).reduce((a: number, d: any) => a + seguroPendiente(D, d.id), 0); return t ? 'Seguro a cobrar a choferes: ' + pesos(t) : ''; })(),
    '', 'Escribí *menú* para ver todas las opciones.',
  ].filter((l, i, a) => l !== '' || (a[i - 1] !== '' && i > 0)).join('\n');
}

function cobrosHoy(D: any, hoy: string): string {
  const L = pagosDe(D, hoy, hoy).sort((a: any, b: any) => (+b.monto || 0) - (+a.monto || 0));
  if (!L.length) return '💰 Hoy todavía no se registró ningún cobro.';
  const total = sumaPagos(L);
  return ['💰 *Cobros de hoy* — ' + lineaPesosDolares(total), '', ...L.map((p: any) => {
    const c = D.todos.find((x: any) => x.id === p.carId);
    return '• ' + (c ? c.patente : 'auto') + ' ' + (nombreChofer(D, p.choferId) || '') + ': ' + (p.tipo === 'cuota' ? dolares(+p.monto) : pesos(+p.monto)) +
      (p.metodo ? ' (' + metodoLabel(p.metodo) + ')' : '') + (p.aCuenta ? ' · a cuenta' : '') + (p.parcial ? ' · parcial' : '');
  })].join('\n');
}
function cobrosPeriodo(D: any, hoy: string, periodo: 'semana' | 'mes'): string {
  let desde: string, antDesde: string, antHasta: string, titulo: string;
  if (periodo === 'semana') {
    desde = lunesDe(hoy); antDesde = sumarDias(desde, -7); antHasta = sumarDias(hoy, -7);
    titulo = '💰 *Cobros de la semana* (desde el lunes ' + fechaCorta(desde) + ')';
  } else {
    desde = hoy.slice(0, 8) + '01'; antDesde = sumarMeses(desde, -1);
    antHasta = sumarMeses(hoy, -1); if (antHasta.slice(0, 7) !== antDesde.slice(0, 7)) antHasta = sumarDias(desde, -1);
    titulo = '💰 *Cobros de ' + MESES[+hoy.slice(5, 7) - 1] + '* (hasta hoy)';
  }
  const L = pagosDe(D, desde, hoy), A = pagosDe(D, antDesde, antHasta);
  const act = sumaPagos(L), ant = sumaPagos(A);
  const porAuto: Record<string, number> = {};
  L.filter((p: any) => p.tipo !== 'cuota').forEach((p: any) => { porAuto[p.carId] = (porAuto[p.carId] || 0) + (+p.monto || 0); });
  const top = Object.entries(porAuto).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return [
    titulo + '\n',
    'Total: ' + lineaPesosDolares(act) + ' en ' + plural(L.length, 'pago'),
    'Comparado con el mismo período ' + (periodo === 'semana' ? 'de la semana pasada' : 'del mes pasado') + ': ' + variacion(act.ars, ant.ars),
    ant.usd || act.usd ? 'En dólares: ' + dolares(act.usd) + ' ' + variacion(act.usd, ant.usd).replace(/\$ /g, 'US$ ') : '',
    top.length ? '\nPor auto (pesos):' : '',
    ...top.map(([id, m]) => { const c = D.todos.find((x: any) => x.id === id); return '• ' + (c ? c.patente : 'auto') + ': ' + pesos(m); }),
  ].filter(Boolean).join('\n');
}
function cobrosGeneral(D: any, hoy: string): string {
  return [
    '💰 *Cobrado*', '',
    'Hoy: ' + lineaPesosDolares(sumaPagos(pagosDe(D, hoy, hoy))),
    'Esta semana: ' + lineaPesosDolares(sumaPagos(pagosDe(D, lunesDe(hoy), hoy))),
    'Este mes: ' + lineaPesosDolares(sumaPagos(pagosDe(D, hoy.slice(0, 8) + '01', hoy))),
    '', 'Más detalle: *cobros hoy*, *cobros semana* o *cobros mes*.',
  ].join('\n');
}
function quienNoPago(D: any, hoy: string): string {
  const sinPago: any[] = [], parcial: any[] = [];
  for (const c of D.cars.filter((x: any) => esContrato(x) && x.choferId)) {
    const i = calc(D, c, hoy);
    if (i.debt <= 0) continue;
    const kind = c.tipo === 'alquiler' ? 'alquiler' : 'cuota';
    const desde = inicioCiclo(D, c, hoy);
    const pagos = D.payments.filter((p: any) => p.carId === c.id && p.tipo === kind && p.fecha >= desde);
    (pagos.length ? parcial : sinPago).push({ c, i, desde });
  }
  const seguros = choferesActivos(D).map((d: any) => ({ d, s: seguroPendiente(D, d.id) })).filter((x: any) => x.s > 0);
  const lineaSeguro = seguros.length ? '\n🛡️ *Seguro sin pagar* (' + seguros.length + ')\n' + seguros.map((x: any) => '• ' + x.d.nombre + ': ' + pesos(x.s)).join('\n') : '';
  if (!sinPago.length && !parcial.length) return seguros.length ? '✅ Todos pagaron su semana.\n' + lineaSeguro : '✅ Todos pagaron su semana. Nadie debe nada.';
  const linea = (x: any) => '• ' + x.c.patente + ' ' + nombreChofer(D, x.c.choferId) + ': debe ' + monedaDe(x.c)(x.i.debt) +
    (x.i.late >= 1.05 ? ' (' + semanas(x.i.late) + ')' : '') + ' · paga ' + losDias(x.c.inicio);
  const orden = (a: any, b: any) => b.i.late - a.i.late;
  return [
    sinPago.length ? '🔴 *No pagaron su semana* (' + sinPago.length + ')' : '',
    ...sinPago.sort(orden).map(linea),
    parcial.length ? (sinPago.length ? '\n' : '') + '🟡 *Pagaron una parte* (' + parcial.length + ')' : '',
    ...parcial.sort(orden).map(linea),
    lineaSeguro,
  ].filter(Boolean).join('\n');
}
function listaDeudas(D: any, hoy: string): string {
  const L = D.cars.map((c: any) => ({ c, d: calc(D, c, hoy).debt })).filter((x: any) => x.d > 0).sort((a: any, b: any) => b.d - a.d);
  if (!L.length) return '✅ Nadie te debe nada. Todos al día.';
  const ars = L.filter((x: any) => x.c.tipo !== 'financiado').reduce((a: number, x: any) => a + x.d, 0);
  const usd = L.filter((x: any) => x.c.tipo === 'financiado').reduce((a: number, x: any) => a + x.d, 0);
  return ['🔴 *Deudas* (' + L.length + ')', '',
    ...L.slice(0, 25).map((x: any) => '• ' + x.c.patente + ' — ' + (nombreChofer(D, x.c.choferId) || 'sin chofer') + ': ' + monedaDe(x.c)(x.d)),
    L.length > 25 ? '… y ' + (L.length - 25) + ' más' : '',
    '', 'Total: ' + pesos(ars) + (usd ? ' + ' + dolares(usd) : ''),
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}
function topDeudores(D: any, hoy: string): string {
  const L = choferesActivos(D).map((d: any) => ({ d, x: deudaChofer(D, d.id, hoy) })).filter((y: any) => y.x.ars > 0 || y.x.usd > 0)
    .sort((a: any, b: any) => (b.x.ars - a.x.ars) || (b.x.usd - a.x.usd)).slice(0, 5);
  if (!L.length) return '✅ Ningún chofer debe plata.';
  return ['🔴 *Los que más deben*', '', ...L.map((y: any, i: number) => (i + 1) + '. ' + y.d.nombre + ': ' + lineaPesosDolares(y.x))].join('\n') +
    '\n\nEscribí *cuenta* y el nombre para ver el estado de cuenta.';
}
function deudaDeAuto(D: any, c: any, hoy: string): string {
  if (!esContrato(c) || !c.choferId) return c.patente + ' no tiene un contrato activo, así que no genera deuda.';
  const i = calc(D, c, hoy), mon = monedaDe(c);
  if (i.debt <= 0) return '✅ ' + c.patente + ' (' + nombreChofer(D, c.choferId) + ') está al día.';
  return [
    '🔴 *' + c.patente + '* — ' + nombreChofer(D, c.choferId),
    'Debe ' + mon(i.debt) + ' (' + semanas(i.late) + ' de ' + mon(c.monto) + ')',
    'Paga ' + losDias(c.inicio) + '. Pagó ' + mon(i.paid) + ' de ' + mon(i.due) + ' desde el ' + fecha(c.inicio) + '.',
    i.adelantoAplicado ? 'Se descontaron ' + mon(i.adelantoAplicado) + ' de semana adelantada.' : '',
  ].filter(Boolean).join('\n');
}
function estadoDeCuenta(D: any, d: any, hoy: string): string {
  const autos = D.cars.filter((c: any) => c.choferId === d.id);
  const deuda = deudaChofer(D, d.id, hoy);
  const garantia = saldoDeposito(D, d.id, 'garantia');
  const adelantada = semanaAdelantadaDisponible(D, d.id, hoy);
  const pagos = D.payments.filter((p: any) => p.choferId === d.id).sort((a: any, b: any) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 5);
  return [
    '📄 *Estado de cuenta — ' + d.nombre + '*', '',
    ...autos.map((c: any) => 'Auto: ' + tituloAuto(c) + (esContrato(c) && c.monto ? ' · ' + monedaDe(c)(c.monto) + ' por semana' : '')),
    autos.length ? null : 'No tiene auto asignado.',
    'Deuda: ' + (deuda.ars || deuda.usd ? lineaPesosDolares(deuda) : 'al día ✅'),
    saldoAdelantos(D, d.id) ? 'Incluye adelantos pendientes por ' + pesos(saldoAdelantos(D, d.id)) : null,
    'Depósito en garantía: ' + pesos(garantia) + (d.depositoObjetivo ? ' de ' + pesos(d.depositoObjetivo) : ''),
    'Semana adelantada disponible: ' + pesos(adelantada),
    seguroPendiente(D, d.id) ? '🛡️ Seguro a pagar: ' + pesos(seguroPendiente(D, d.id)) : null,
    '', pagos.length ? 'Últimos pagos:' : 'Sin pagos registrados.',
    ...pagos.map((p: any) => '• ' + fechaCorta(p.fecha) + ' ' + (p.tipo === 'cuota' ? dolares(+p.monto) : pesos(+p.monto)) + (p.metodo ? ' (' + metodoLabel(p.metodo) + ')' : '') + (p.aCuenta ? ' · a cuenta' : '')),
  ].filter(l => l !== null).filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
}
function esperado(D: any, hoy: string): string {
  const lunes = lunesDe(hoy), domingo = sumarDias(lunes, 6);
  let espArs = 0, espUsd = 0;
  for (const c of D.cars.filter((x: any) => esContrato(x) && x.choferId && x.monto && x.inicio && x.inicio <= domingo)) {
    if (c.tipo === 'financiado') { if (!c.cuotas || calc(D, c, hoy).weeks < +c.cuotas || inicioCiclo(D, c, hoy) >= lunes) espUsd += +c.monto; }
    else espArs += +c.monto;
  }
  const cob = sumaPagos(pagosDe(D, lunes, hoy).filter((p: any) => p.tipo === 'alquiler' || p.tipo === 'cuota'));
  return [
    '📅 *Semana del ' + fechaCorta(lunes) + ' al ' + fechaCorta(domingo) + '*', '',
    'Alquileres: esperado ' + pesos(espArs) + ' · cobrado ' + pesos(cob.ars) + ' · falta ' + pesos(Math.max(0, espArs - cob.ars)),
    espUsd || cob.usd ? 'Cuotas: esperado ' + dolares(espUsd) + ' · cobrado ' + dolares(cob.usd) + ' · falta ' + dolares(Math.max(0, espUsd - cob.usd)) : '',
    '', 'Escribí *quien no pago* para ver quiénes faltan.',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}
function financiados(D: any, hoy: string): string {
  const L = D.cars.filter((c: any) => c.tipo === 'financiado' && c.choferId);
  if (!L.length) return 'No hay autos financiados activos.';
  let saldoTotal = 0;
  const lineas = L.map((c: any) => {
    const i = calc(D, c, hoy); saldoTotal += i.saldo || 0;
    return '• ' + c.patente + ' ' + nombreChofer(D, c.choferId) + ': cuota ' + Math.min(i.weeks, +c.cuotas || i.weeks) + (c.cuotas ? ' de ' + c.cuotas : '') +
      ' · saldo ' + dolares(i.saldo || 0) + (i.debt > 0 ? ' · debe ' + dolares(i.debt) : ' · al día');
  });
  return ['🤝 *Financiados* (' + L.length + ')', '', ...lineas, '', 'Saldo total a cobrar: ' + dolares(saldoTotal)].join('\n');
}
function tablero(D: any, hoy: string): string {
  const desde = sumarDias(hoy, -7);
  const L = D.cars.filter((c: any) => c.choferId && esContrato(c)).map((c: any) => {
    const cobrado = D.payments.filter((p: any) => p.carId === c.id && p.tipo !== 'seguro' && p.fecha >= desde && p.fecha <= hoy).reduce((a: number, p: any) => a + (+p.monto || 0), 0);
    const gasto = gastosDe(D, desde, hoy, c.id).reduce((a: number, g: any) => a + g.costo, 0);
    return { c, cobrado, gasto, neto: cobrado - gasto, deuda: calc(D, c, hoy).debt };
  }).sort((a: any, b: any) => a.neto - b.neto);
  if (!L.length) return 'No hay autos trabajando.';
  const total = L.reduce((a: number, x: any) => a + (x.c.tipo === 'financiado' ? 0 : x.neto), 0);
  return ['📋 *Tablero de los últimos 7 días* (peor neto primero)', '',
    ...L.map((x: any) => {
      const mon = monedaDe(x.c);
      return '• *' + x.c.patente + '* ' + nombreChofer(D, x.c.choferId) + '\n   cobrado ' + mon(x.cobrado) + ' · gastos ' + pesos(x.gasto) + (x.c.tipo === 'financiado' ? '' : ' · neto ' + pesos(x.neto)) + (x.deuda > 0 ? ' · debe ' + mon(x.deuda) : '');
    }),
    '', 'Neto en pesos de la semana: ' + pesos(total),
  ].join('\n');
}
function flota(D: any): string {
  const cuenta = (f: (c: any) => boolean) => D.cars.filter(f).length;
  return ['🚗 *Flota* (' + D.cars.length + ' autos activos)', '',
    '• Alquilados: ' + cuenta(c => c.tipo === 'alquiler'),
    '• Financiados: ' + cuenta(c => c.tipo === 'financiado'),
    '• Disponibles: ' + cuenta(c => c.tipo === 'disponible') + (cuenta(c => c.tipo === 'disponible' && c.reservado) ? ' (' + cuenta(c => c.tipo === 'disponible' && c.reservado) + ' reservados)' : ''),
    '• En taller: ' + cuenta(c => c.tipo === 'taller'),
    '• Vendidos: ' + D.todos.filter((c: any) => c.vendido).length,
    '', 'Escribí *libres* para ver los disponibles.',
  ].join('\n');
}
function libres(D: any, hoy: string): string {
  const L = D.cars.filter((c: any) => c.tipo === 'disponible')
    .sort((a: any, b: any) => String(a.disponibleDesde || hoy).localeCompare(String(b.disponibleDesde || hoy)));
  if (!L.length) return 'No hay autos disponibles, están todos asignados.';
  return ['🟢 *Disponibles* (' + L.length + ')', '', ...L.map((c: any) => {
    const parado = c.disponibleDesde ? dias(c.disponibleDesde, hoy) : null;
    return '• ' + tituloAuto(c) + '\n   ' + (+c.valorSemanal ? pesos(+c.valorSemanal) + ' por semana' : 'sin valor semanal cargado') +
      (parado != null ? ' · parado hace ' + plural(parado, 'día') : '') + (c.reservado ? ' · reservado' + (c.reservadoPara ? ' para ' + c.reservadoPara : '') : '');
  })].join('\n');
}
function historialAuto(D: any, c: any, hoy: string): string {
  const H = (c.historialChoferes || []).slice().reverse();
  if (!H.length) return c.patente + ' no tiene historial de choferes cargado.';
  return ['🕓 *Choferes de ' + c.patente + '*', '', ...H.map((h: any) =>
    '• ' + (nombreChofer(D, h.choferId) || 'Chofer eliminado') + ': ' + fecha(h.desde) + ' → ' + (h.hasta ? fecha(h.hasta) : 'hoy') + ' (' + plural(dias(h.desde, h.hasta || hoy), 'día') + ')',
  )].join('\n');
}
function rankingPuntualidad(D: any, hoy: string): string {
  const L = choferesActivos(D).map((d: any) => ({ d, s: puntualidad(D, d.id, hoy) })).filter((x: any) => x.s != null).sort((a: any, b: any) => b.s - a.s);
  if (!L.length) return 'Todavía no hay datos de puntualidad.';
  const linea = (x: any) => '• ' + x.d.nombre + ': ' + x.s + '/100';
  if (L.length <= 10) return ['⏱️ *Puntualidad* (100 = siempre al día)', '', ...L.map(linea)].join('\n');
  return ['⏱️ *Puntualidad* (100 = siempre al día)', '', 'Más puntuales:', ...L.slice(0, 5).map(linea), '', 'Menos puntuales:', ...L.slice(-5).reverse().map(linea)].join('\n');
}
function vencimientos(D: any, hoy: string, horizonte: number, c?: any): string {
  const L = vencimientosDe(c ? [c] : D.cars, hoy, c ? 3650 : horizonte);
  if (!L.length) return c ? c.patente + ' no tiene vencimientos cargados.' : '✅ No hay vencimientos en los próximos ' + horizonte + ' días.';
  const icono = (d: number) => d < 0 ? '🔴' : d <= AVISO_WARN ? '🟡' : '⚪';
  return ['📅 *Vencimientos' + (c ? ' de ' + c.patente : ' (próximos ' + horizonte + ' días)') + '*\n',
    ...L.slice(0, 40).map((x: any) => icono(x.d) + ' ' + (c ? '' : x.c.patente + ' ') + x.label + ': ' + fecha(x.fecha) + ' (' + textoDias(x.d) + ')'),
    L.length > 40 ? '… y ' + (L.length - 40) + ' más' : '',
    c ? '' : '\nPara marcar uno renovado: *vtv AB123CD 15/03/2027*',
  ].filter(Boolean).join('\n');
}
function serviceFlota(D: any, hoy: string): string {
  const L: any[] = [];
  for (const c of D.cars) for (const x of servicePendiente(c, hoy)) L.push(Object.assign({ c }, x));
  if (!L.length) return '✅ Ningún auto tiene service pendiente.';
  L.sort((a, b) => ORDEN_CLS[a.e.cls] - ORDEN_CLS[b.e.cls] || (a.e.restanteKm ?? 1e9) - (b.e.restanteKm ?? 1e9));
  const icono: Record<string, string> = { bad: '🔴', warn: '🟡', soft: '⚪' };
  return ['🔧 *Service pendientes*\n', ...L.slice(0, 40).map((x: any) => icono[x.e.cls] + ' ' + x.c.patente + ' ' + (x.p.label || x.p.item) + ': ' + textoRestante(x.e)),
    L.length > 40 ? '… y ' + (L.length - 40) + ' más' : '',
    '\nPara cargar uno hecho: *service AB123CD aceite km 123456 45000*'].filter(Boolean).join('\n');
}
function serviceAuto(c: any, hoy: string): string {
  const plan = (c.mantenimientoPlan || []).filter((p: any) => p.intervaloKm || p.intervaloMeses);
  if (!plan.length) return c.patente + ' no tiene plan de mantenimiento cargado.';
  const icono: Record<string, string> = { bad: '🔴', warn: '🟡', soft: '⚪', ok: '🟢' };
  return ['🔧 *Service de ' + c.patente + '*' + (c.km ? ' (' + num(+c.km) + ' km)' : ''), '',
    ...plan.map((p: any) => ({ p, e: estadoPlanItem(c, p, hoy) })).sort((a: any, b: any) => ORDEN_CLS[a.e.cls] - ORDEN_CLS[b.e.cls])
      .map((x: any) => icono[x.e.cls] + ' ' + (x.p.label || x.p.item) + ': ' + textoRestante(x.e) + (x.p.ultimaFecha ? ' (último ' + fecha(x.p.ultimaFecha) + ')' : '')),
  ].join('\n');
}
function gastosMes(D: any, hoy: string): string {
  const desde = hoy.slice(0, 8) + '01';
  const L = gastosDe(D, desde, hoy);
  const ant = gastosDe(D, sumarMeses(desde, -1), sumarDias(desde, -1)).reduce((a, g) => a + g.costo, 0);
  if (!L.length) return '🧾 No hay gastos cargados este mes.';
  const porCat: Record<string, number> = {};
  L.forEach(g => { porCat[g.cat] = (porCat[g.cat] || 0) + g.costo; });
  const total = L.reduce((a, g) => a + g.costo, 0);
  const label = (k: string) => k === 'mantenimiento' ? 'Mantenimiento (service)' : GASTO_LABEL[k] || k;
  return ['🧾 *Gastos de ' + MESES[+hoy.slice(5, 7) - 1] + '* — ' + pesos(total), '',
    ...Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => '• ' + label(k) + ': ' + pesos(v)),
    '', 'Mes pasado completo: ' + pesos(ant)].join('\n');
}
function gastosAuto(D: any, c: any, hoy: string): string {
  const mes = gastosDe(D, hoy.slice(0, 8) + '01', hoy, c.id);
  const anio = gastosDe(D, hoy.slice(0, 4) + '-01-01', hoy, c.id);
  const ult = gastosDe(D, '0000-01-01', hoy, c.id).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 6);
  const suma = (L: any[]) => L.reduce((a, g) => a + g.costo, 0);
  return ['🧾 *Gastos de ' + c.patente + '*', '',
    'Este mes: ' + pesos(suma(mes)), 'En ' + hoy.slice(0, 4) + ': ' + pesos(suma(anio)),
    ult.length ? '\nÚltimos:' : '\nNo tiene gastos cargados.',
    ...ult.map(g => '• ' + fechaCorta(g.fecha) + ' ' + (g.desc || (g.cat === 'mantenimiento' ? 'Mantenimiento' : GASTO_LABEL[g.cat] || g.cat)) + ': ' + pesos(g.costo)),
  ].join('\n');
}
function rentabilidad(D: any, c: any, hoy: string): string {
  const r = rentabilidadAuto(D, c);
  const desde = hoy.slice(0, 8) + '01';
  const cobMes = D.payments.filter((p: any) => p.carId === c.id && p.tipo !== 'seguro' && p.fecha >= desde && p.fecha <= hoy).reduce((a: number, p: any) => a + (+p.monto || 0), 0);
  const gasMes = gastosDe(D, desde, hoy, c.id).reduce((a, g) => a + g.costo, 0);
  if (r.usd) {
    return ['📈 *' + c.patente + '* (financiado)', '', 'Cobrado desde el inicio: ' + dolares(r.cobrado), 'Gastos: ' + pesos(r.gastos),
      'Este mes: cobrado ' + dolares(cobMes) + ' · gastos ' + pesos(gasMes), '', 'Como cobra en dólares y gasta en pesos, no calculo un neto.'].join('\n');
  }
  return ['📈 *Rentabilidad de ' + c.patente + '*\n',
    'Desde que lo tenés: cobrado ' + pesos(r.cobrado) + ' · gastos ' + pesos(r.gastos) + ' · *neto ' + pesos(r.neta) + '*',
    'Este mes: cobrado ' + pesos(cobMes) + ' · gastos ' + pesos(gasMes) + ' · neto ' + pesos(cobMes - gasMes),
    r.costoCompra ? 'Recuperó el ' + Math.round(r.neta / r.costoCompra * 100) + '% de lo que costó (' + pesos(r.costoCompra) + ').' : '',
  ].filter(Boolean).join('\n');
}
function rankingRentabilidad(D: any, hoy: string): string {
  const desde = hoy.slice(0, 8) + '01';
  const L = D.cars.filter((c: any) => c.tipo !== 'financiado').map((c: any) => {
    const r = rentabilidadAuto(D, c);
    const mes = D.payments.filter((p: any) => p.carId === c.id && p.tipo !== 'seguro' && p.fecha >= desde).reduce((a: number, p: any) => a + (+p.monto || 0), 0) -
      gastosDe(D, desde, hoy, c.id).reduce((a, g) => a + g.costo, 0);
    return { c, neta: r.neta, mes };
  }).sort((a: any, b: any) => b.neta - a.neta);
  if (!L.length) return 'No hay autos para comparar.';
  const linea = (x: any, i: number) => (i + 1) + '. ' + x.c.patente + ' ' + descAuto(x.c) + ': ' + pesos(x.neta) + ' (este mes ' + pesos(x.mes) + ')';
  if (L.length <= 8) return ['🏆 *Rentabilidad neta por auto* (desde que lo tenés)', '', ...L.map(linea)].join('\n');
  return ['🏆 *Rentabilidad neta por auto* (desde que lo tenés)', '', 'Los mejores:', ...L.slice(0, 4).map(linea), '', 'Los peores:',
    ...L.slice(-4).reverse().map((x: any, i: number) => linea(x, L.length - 1 - i))].join('\n');
}
function stock(D: any): string {
  if (!D.repuestos.length) return '📦 No hay repuestos cargados en el stock.';
  const L = stockBajo(D);
  if (!L.length) return '✅ Todos los repuestos están por encima del mínimo.';
  return ['📦 *Repuestos bajo mínimo* (' + L.length + ')', '', ...L.map((r: any) => '• ' + r.nombre + ': ' + ((+r.stockActual || 0) === 1 ? 'queda ' : 'quedan ') + num(+r.stockActual || 0) + ' ' + unidad(r, +r.stockActual || 0) + ' (mínimo ' + num(+r.stockMinimo || 0) + ')'),
    '', 'Escribí *lista de compra* para verlos por proveedor.'].join('\n');
}
function listaDeCompra(D: any): string {
  const L = stockBajo(D);
  if (!L.length) return '✅ No hay nada para comprar: todo está por encima del mínimo.';
  const grupos: Record<string, any[]> = {};
  L.forEach((r: any) => { const k = r.proveedorId || ''; (grupos[k] = grupos[k] || []).push(r); });
  const nombreProv = (k: string) => k ? ((D.proveedores.find((p: any) => p.id === k) || {}).nombre || 'Proveedor') : 'Sin proveedor asignado';
  const salida = ['🛒 *Lista de compra*'];
  Object.keys(grupos).sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || nombreProv(a).localeCompare(nombreProv(b))).forEach(k => {
    salida.push('', '*' + nombreProv(k) + '*');
    grupos[k].forEach((r: any) => {
      const n = Math.max((+r.stockMinimo || 0) - (+r.stockActual || 0), 0) || 1;
      salida.push('• ' + r.nombre + ': ' + num(n) + ' ' + unidad(r, n));
    });
  });
  return salida.join('\n');
}
function multas(D: any): string {
  const m = D.multas.filter((x: any) => x.estado === 'pendiente' || x.estado === 'vencida').sort((a: any, b: any) => String(b.fecha).localeCompare(String(a.fecha)));
  if (!m.length) return '✅ No hay multas pendientes.';
  const total = m.reduce((a: number, x: any) => a + (+x.monto || 0), 0);
  return ['🚨 *Multas pendientes* (' + m.length + ') — ' + pesos(total), '', ...m.slice(0, 20).map((x: any) => {
    const c = D.todos.find((k: any) => k.id === x.carId);
    return '• ' + (c ? c.patente : 'auto') + ': ' + pesos(+x.monto) + ' (' + fecha(x.fecha) + ')' + (nombreChofer(D, x.choferId) ? ' — ' + nombreChofer(D, x.choferId) : '');
  })].join('\n');
}
function taller(D: any, hoy: string): string {
  const L = D.cars.filter((c: any) => c.tipo === 'taller');
  if (!L.length) return '✅ No hay autos en el taller.';
  return ['🔧 *En taller* (' + L.length + ')', '', ...L.map((c: any) => {
    const h = (c.historialTaller || []).filter((x: any) => !x.hasta).slice(-1)[0];
    return '• ' + tituloAuto(c) + (h ? ' · hace ' + plural(dias(h.desde, hoy), 'día') : '');
  })].join('\n');
}
const PALABRAS_COMANDO = new Set(['buscar', 'busca', 'busco', 'encontrar', 'flota', 'numero', 'nro', 'vencimientos', 'vencimiento', 'venc', 'service', 'mantenimiento', 'gastos', 'gasto', 'historial', 'rentabilidad', 'ganancia', 'doc', 'docs', 'documento', 'documentos', 'deudas', 'dueda', 'debe', 'deben', 'cuanto', 'me', 'mi', 'le', 'lo', 'ver', 'mostrame', 'pasame', 'dame', 'info', 'datos', 'decime', 'sobre', 'cual', 'es', 'tiene', 'tengo']);
function buscarAutosPorTexto(D: any, t: string): any[] {
  const quiereFlota = /\b(flota|numero|nro)\b/.test(t);
  const palabras = sinAcentos(t).split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !PALABRAS_VACIAS.has(w) && !PALABRAS_COMANDO.has(w) && (quiereFlota || !/^\d+$/.test(w)));
  if (!palabras.length) return [];
  return D.cars.filter((c: any) => {
    const campos = [c.marca, c.modelo, c.color, c.numeroFlota, ...(c.tags || [])].map(x => sinAcentos(x == null ? '' : String(x)));
    return palabras.every(w => campos.some(x => x && (x === w || x.split(/\s+/).includes(w) || (w.length >= 4 && x.includes(w)))));
  });
}
function autoUnicoPorTexto(D: any, t: string): any {
  const L = buscarAutosPorTexto(D, t);
  return L.length === 1 ? L[0] : null;
}

function fichaAuto(D: any, c: any, hoy: string): Salida[] {
  const d = chofer(D, c.choferId), mon = monedaDe(c);
  const pagos = D.payments.filter((p: any) => p.carId === c.id).sort((a: any, b: any) => String(b.fecha).localeCompare(String(a.fecha)));
  const i = calc(D, c, hoy);
  const seguro = c.seguro ? vs(c.seguro, hoy) : null;
  const serv = servicePendiente(c, hoy)[0];
  const venc = vencimientosDe([c], hoy, AVISO_SOFT).filter(x => x.k !== 'seguro');
  const lineas = [
    '🚗 *' + (c.patente || 'Sin patente') + '*' + (descAuto(c) ? ' — ' + descAuto(c) : '') + (c.color ? ' ' + c.color : '') + (c.numeroFlota ? ' · flota ' + c.numeroFlota : '') + '\n',
    'Estado: ' + (TIPOS[c.tipo] || c.tipo || '-') + (esContrato(c) && c.monto ? ' · ' + mon(c.monto) + ' por semana' : (+c.valorSemanal ? ' · valor ' + pesos(+c.valorSemanal) + ' por semana' : '')),
    c.tipo === 'disponible' && c.disponibleDesde ? 'Parado hace ' + plural(dias(c.disponibleDesde, hoy), 'día') : '',
    'Chofer: ' + (d ? d.nombre + (d.tel ? ' (' + d.tel + ')' : '') : 'sin chofer'),
    esContrato(c) && c.choferId ? 'Deuda: ' + (i.debt > 0 ? mon(i.debt) + ' (' + semanas(i.late) + ')' : 'al día ✅') : '',
    c.tipo === 'financiado' && c.cuotas ? 'Cuota ' + Math.min(i.weeks, +c.cuotas) + ' de ' + c.cuotas + ' · saldo ' + dolares(i.saldo || 0) : '',
    pagos.length ? 'Último pago: ' + (pagos[0].tipo === 'cuota' ? dolares(+pagos[0].monto) : pesos(+pagos[0].monto)) + ' el ' + fecha(pagos[0].fecha) : 'Sin pagos registrados',
    c.km ? 'Kilometraje: ' + num(+c.km) + ' km' : '',
    c.seguro || c.aseguradora ? 'Seguro: ' + (c.aseguradora || 'aseguradora sin cargar') + (c.seguro ? ', vence ' + fecha(c.seguro) + ' (' + textoDias(seguro.d) + ')' : '') : '',
    serv ? 'Próximo service: ' + (serv.p.label || serv.p.item) + ' ' + textoRestante(serv.e) : '',
    venc.length ? '\nVencimientos cercanos:\n' + venc.map((x: any) => '• ' + x.label + ': ' + fecha(x.fecha) + ' (' + textoDias(x.d) + ')').join('\n') : '',
  ];
  return [
    txt(lineas.filter(Boolean).join('\n')),
    botones('¿Qué más querés ver de ' + c.patente + '?', [
      botonCmd('vencimientos ' + c.patente, 'Vencimientos'),
      botonCmd('gastos ' + c.patente, 'Gastos'),
      botonCmd('historial ' + c.patente, 'Choferes que tuvo'),
    ]),
  ];
}
function fichaChofer(D: any, d: any, hoy: string, u: Usuario): Salida[] {
  const autos = D.cars.filter((c: any) => c.choferId === d.id);
  const deuda = deudaChofer(D, d.id, hoy);
  const score = puntualidad(D, d.id, hoy);
  const lic = d.licVenc ? vs(d.licVenc, hoy) : null;
  const lineas = [
    '👤 *' + d.nombre + '*' + (d.inactivo ? ' (inactivo)' : '') + (d.prospecto ? ' (prospecto)' : ''), '',
    d.tel ? 'Tel: ' + d.tel : 'Sin teléfono cargado',
    d.tel ? 'Chat: ' + waLink(d.tel) : '',
    autos.length ? autos.map((c: any) => 'Auto: ' + tituloAuto(c) + (esContrato(c) && c.monto ? ' · ' + monedaDe(c)(c.monto) + ' por semana' : '')).join('\n') : 'Sin auto asignado',
    'Deuda: ' + (deuda.ars || deuda.usd ? lineaPesosDolares(deuda) : 'al día ✅'),
    seguroPendiente(D, d.id) ? 'Seguro a pagar: ' + pesos(seguroPendiente(D, d.id)) : '',
    score != null ? 'Puntualidad: ' + score + '/100' : '',
    d.licVenc ? 'Licencia: vence ' + fecha(d.licVenc) + ' (' + textoDias(lic.d) + ')' + (d.tipoLicencia ? ' · ' + d.tipoLicencia : '') : 'Licencia: sin vencimiento cargado',
  ];
  const bs = [botonCmd('cuenta #' + d.id, 'Estado de cuenta'), botonCmd('portal #' + d.id, 'Link del portal')];
  return [txt(lineas.filter(Boolean).join('\n')), botones('¿Qué más querés de ' + d.nombre.split(' ')[0] + '?', bs)];
}
function linkPortal(d: any): string {
  if (!d.portalToken) return d.nombre + ' todavía no tiene link del portal. Generalo desde su ficha en la app (Portal del chofer → Generar link).';
  if (d.portalDesactivado) return 'El acceso al portal de ' + d.nombre + ' está desactivado. Reactivalo desde su ficha en la app.';
  const url = APP_URL + '#/portal/' + d.id + '/' + d.portalToken;
  const msg = 'Hola ' + (d.nombre || '').split(' ')[0] + ', acá podés ver tu estado de cuenta: ' + url;
  return '🔗 *Portal de ' + d.nombre + '*\n' + url + (d.tel ? '\n\nMandáselo con un toque:\n' + waLink(d.tel, msg) : '');
}
async function mandarDocumento(D: any, c: any, t: string): Promise<Salida[]> {
  const files = (c.files || []).slice();
  const cat = buscarCat(sinPatente(t, c), DOC_CATS);
  const labelCat = (k: string) => (DOC_CATS.find(x => x[0] === k) || [0, k === 'otro' ? 'Otro' : k])[1] as string;
  if (!cat) {
    const cats = (Array.from(new Set(files.map((f: any) => f.cat))) as string[]).filter(k => DOC_CATS.some(x => x[0] === k));
    if (!cats.length) return [txt(c.patente + ' no tiene documentos ni fotos cargados.')];
    return [{
      tipo: 'lista', boton: 'Ver documentos', texto: '📄 Documentos de ' + c.patente + '. ¿Cuál te mando?',
      filas: cats.slice(0, 10).map(k => ({ id: 'cmd:doc ' + c.patente + ' ' + (DOC_CATS.find(x => x[0] === k) as any)[2][0], titulo: labelCat(k), desc: plural(files.filter((f: any) => f.cat === k).length, 'archivo') })),
    }];
  }
  const deCat = files.filter((f: any) => f.cat === cat[0]).sort((a: any, b: any) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  if (!deCat.length) return [txt(c.patente + ' no tiene ' + cat[1].toLowerCase() + ' cargado' + (cat[0] === 'fotos' ? 's' : '') + '.')];
  const elegidos = cat[0] === 'fotos' ? deCat.slice(0, 3) : deCat.slice(0, 1);
  const out: Salida[] = [];
  for (const f of elegidos) {
    if (f.link) { out.push(txt(cat[1] + ' de ' + c.patente + ': ' + f.link)); continue; }
    const link = await linkFirmado(f.id);
    const esImagen = String(f.type || '').startsWith('image/');
    out.push({ tipo: 'media', clase: esImagen ? 'image' : 'document', link, caption: cat[1] + ' de ' + c.patente + (f.fecha ? ' · ' + fecha(f.fecha) : ''), nombre: f.name || (cat[0] + '-' + c.patente + '.pdf') });
  }
  if (cat[0] === 'fotos' && deCat.length > 3) out.push(txt('Te mandé las 3 más recientes de ' + deCat.length + '. El resto está en la ficha del auto en la app.'));
  return out;
}

/* ======================================================================
   Cargas: arman la confirmación. La escritura se hace en ejecutar().
   ====================================================================== */

function detectarMetodo(t: string): string { const m = buscarCat(t, METODOS); return m ? m[0] : ''; }

function prepararCobro(u: Usuario, D: any, t: string, hoy: string, mediaId?: string): Salida[] {
  if (!puede(u, 'cobrar')) return [txt(sinPermiso())];
  let c = buscarAuto(D, t);
  if (!c) {
    const ch = buscarChoferes(D, t);
    if (ch.length === 1) c = autoDeChofer(D, ch[0]);
    if (!c) return [txt('¿De qué auto es el cobro? Escribilo con la patente, por ejemplo: *cobré 100000 AB123CD*')];
  }
  if (!esContrato(c) || !c.choferId) return [txt(c.patente + ' no tiene un contrato activo con chofer, así que no puedo registrarle un cobro.')];
  const esSeguro = /\bseguro\b/.test(t);
  const f = leerFecha(t, hoy);
  const resto = quitar(sinPatente(t, c), f?.texto);
  const nums = leerNumeros(resto).filter(n => !n.km);
  if (!nums.length) return [txt('Me faltó el monto. Por ejemplo: *cobré 100000 ' + c.patente + '*')];
  const monto = nums[0].valor;
  if (monto <= 0) return [txt('El monto tiene que ser mayor a cero.')];
  const fechaPago = f ? f.fecha : hoy;
  if (fechaPago > hoy) return [txt('La fecha del cobro no puede ser futura (' + fecha(fechaPago) + ').')];
  const metodo = detectarMetodo(resto) || metodoPreferido(D, c.choferId) || 'efectivo';
  const aCuenta = /\ba cuenta\b/.test(t), parcial = /\bparcial\b/.test(t);
  if (esSeguro) {
    const pend = seguroPendiente(D, c.choferId);
    const textoSeg = ['¿Registro este pago de seguro?\n', '🚗 ' + c.patente + ' — ' + nombreChofer(D, c.choferId),
      '🛡️ ' + pesos(monto) + ' · ' + metodoLabel(metodo) + ' · ' + fecha(fechaPago), mediaId ? '📎 Con la foto como comprobante' : '',
      'Seguro pendiente: ' + pesos(pend) + ' → quedaría en ' + pesos(Math.max(0, pend - monto))].filter(Boolean).join('\n');
    const as: any = { a: 'cobro', t: 'seguro', c: c.id, m: monto, f: fechaPago, me: metodo, i: uid() };
    if (mediaId) as.md = mediaId;
    return [pedirConfirmacion(textoSeg, as, 'Registrar')];
  }
  const mon = monedaDe(c);
  const i = calc(D, c, hoy);
  const esperado = +c.monto || 0;
  const raro = !parcial && !aCuenta && esperado && (monto > esperado * 1.5 || monto < esperado * 0.5);
  const texto = [
    '¿Registro este cobro?\n',
    '🚗 ' + c.patente + ' — ' + nombreChofer(D, c.choferId),
    '💵 ' + mon(monto) + ' · ' + metodoLabel(metodo) + ' · ' + fecha(fechaPago) + (aCuenta ? ' · a cuenta' : '') + (parcial ? ' · parcial' : ''),
    mediaId ? '📎 Con la foto como comprobante' : '',
    i.debt > 0 ? 'Debe hoy: ' + mon(i.debt) + ' → quedaría en ' + mon(Math.max(0, i.debt - monto)) : 'Ya está al día: este pago cubre las semanas que vienen.',
    raro ? '\n⚠️ Es muy distinto a lo habitual (' + mon(esperado) + ' por semana). Si es a cuenta, mandalo con "a cuenta".' : '',
  ].filter(Boolean).join('\n');
  const a: any = { a: 'cobro', c: c.id, m: monto, f: fechaPago, me: metodo, i: uid() };
  if (aCuenta) a.ac = 1; if (parcial) a.p = 1; if (mediaId) a.md = mediaId;
  return [pedirConfirmacion(texto, a, 'Registrar')];
}
function prepararGasto(u: Usuario, D: any, t: string, textoOriginal: string, hoy: string): Salida[] {
  if (!puede(u, 'cargar')) return [txt(sinPermiso())];
  const c = buscarAuto(D, t);
  const f = leerFecha(t, hoy);
  const resto = quitar(sinPatente(t, c), f?.texto);
  const nums = leerNumeros(resto).filter(n => !n.km);
  if (!nums.length) return [txt('Me faltó el monto. Por ejemplo: *gasto 25000 aceite AB123CD*')];
  const monto = nums[0].valor;
  const cat = buscarCat(resto, GASTO_CATS);
  const categoria = cat ? cat[0] : 'otro';
  // La descripción es lo que queda del mensaje original sin el verbo, el monto, la patente ni la fecha.
  let desc = textoOriginal.replace(/^\s*(gasto|gasté|gaste|gastamos|pagué|pague|pagamos|compré|compre|compramos)(?=[\s:,]|$)[:,\s]*/i, '');
  if (c) desc = sinPatente(desc, c);
  if (f) desc = desc.replace(new RegExp(f.texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/manana/g, 'ma(?:ñ|n)ana').replace(/miercoles/g, 'mi(?:é|e)rcoles').replace(/sabado/g, 's(?:á|a)bado'), 'i'), ' ');
  desc = desc.replace(/\$?\s*\d[\d.,]*\s*(k|mil|millones?)?\b/i, ' ').replace(/^\s*(de|en|por|para)\s+/i, '');
  desc = capital(limpiarEspacios(desc.replace(/\s+(de|en|por|para|al|del)\s*$/i, '')));
  if (f && f.fecha > hoy) return [txt('La fecha del gasto no puede ser futura.')];
  const texto = ['¿Registro este gasto?\n',
    '🧾 ' + pesos(monto) + ' · ' + (cat ? cat[1] : 'Otro gasto'),
    desc ? '📝 ' + desc : '',
    '🚗 ' + (c ? tituloAuto(c) : 'Gasto general (sin auto)'),
    '📅 ' + fecha(f ? f.fecha : hoy)].filter(Boolean).join('\n');
  return [pedirConfirmacion(texto, { a: 'gasto', c: c ? c.id : '', m: monto, f: f ? f.fecha : hoy, k: categoria, n: recortar(desc, 90), i: uid() }, 'Registrar')];
}
function prepararKm(u: Usuario, D: any, t: string): Salida[] {
  if (!puede(u, 'cargar')) return [txt(sinPermiso())];
  const c = buscarAuto(D, t);
  if (!c) return [txt('¿De qué auto? Por ejemplo: *km AB123CD 123456*')];
  const nums = leerNumeros(sinPatente(t, c));
  if (!nums.length) return [txt('Me faltó el kilometraje. Por ejemplo: *km ' + c.patente + ' 123456*')];
  const km = Math.round(Math.max(...nums.map(n => n.valor)));
  const actual = +c.km || 0;
  if (km <= actual) return [txt('⚠️ ' + c.patente + ' ya tiene ' + num(actual) + ' km cargados. El kilometraje nuevo tiene que ser mayor.')];
  const salto = actual ? km - actual : 0;
  const texto = ['¿Actualizo el kilometraje?\n', '🚗 ' + tituloAuto(c), '🛣️ ' + (actual ? num(actual) + ' km → ' : '') + '*' + num(km) + ' km*',
    salto > 5000 ? '\n⚠️ Son ' + num(salto) + ' km más que lo último cargado. Revisá que esté bien.' : ''].filter(Boolean).join('\n');
  return [pedirConfirmacion(texto, { a: 'km', c: c.id, k: km }, 'Actualizar')];
}
function prepararRecordatorio(u: Usuario, t: string, textoOriginal: string, hoy: string): Salida[] {
  if (!puede(u, 'cargar')) return [txt(sinPermiso())];
  const f = leerFecha(t, hoy);
  let texto = textoOriginal.replace(/^\s*(recordame|recordá|recorda|recordar|recordatorio|acordate)(?=[\s:,]|$)[:,\s]*(que\s+)?/i, '');
  if (f) {
    const patron = f.texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/manana/g, 'ma(?:ñ|n)ana').replace(/miercoles/g, 'mi(?:é|e)rcoles').replace(/sabado/g, 's(?:á|a)bado').replace(/proximo/g, 'pr(?:ó|o)ximo');
    texto = texto.replace(new RegExp(patron, 'i'), ' ');
  }
  texto = capital(limpiarEspacios(texto.replace(/^\s*(que|de)\s+/i, '')));
  if (!texto) return [txt('¿Qué te recuerdo? Por ejemplo: *recordame el viernes llamar al gestor*')];
  const fechaRec = f ? f.fecha : hoy;
  return [pedirConfirmacion('¿Anoto este recordatorio?\n\n⏰ ' + texto + '\n📅 ' + DIAS_SEMANA[diaSemana(fechaRec)] + ' ' + fecha(fechaRec) + '\n\nLo vas a ver en la app, en Vencimientos.', { a: 'rec', n: recortar(texto, 150), f: fechaRec, i: uid() }, 'Anotar')];
}
function prepararStock(u: Usuario, D: any, t: string, hoy: string): Salida[] {
  if (!puede(u, 'cargar')) return [txt(sinPermiso())];
  if (!D.repuestos.length) return [txt('No hay repuestos cargados en el stock de la app.')];
  const c = buscarAuto(D, t);
  const resto = sinPatente(t, c);
  const nums = leerNumeros(resto);
  const cantidad = nums.length ? nums[0].valor : 1;
  if (cantidad <= 0) return [txt('La cantidad tiene que ser mayor a cero.')];
  const ignorar = new Set(['use', 'usamos', 'usaron', 'saque', 'sacamos', 'consumi', 'consumimos', 'descontar', 'descontame', 'litro', 'litros', 'lts', 'unidad', 'unidades', 'juego', 'juegos', 'kilo', 'kilos', 'kg', 'del', 'de', 'en', 'para', 'el', 'la', 'los', 'las', 'stock', 'auto']);
  const palabras = resto.split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !ignorar.has(w) && !/^\d/.test(w));
  // Desempata a favor del repuesto cuyo nombre empieza con lo buscado ("aceite" → "Aceite 5W30", no "Filtro de aceite").
  const puntaje = (r: any) => {
    const n = sinAcentos(r.nombre), primera = n.split(/[^a-z0-9]+/)[0];
    const coinciden = palabras.filter(w => n.includes(w) || n.includes(w.replace(/s$/, '')));
    return coinciden.length + (coinciden.some(w => primera === w || primera === w.replace(/s$/, '')) ? 0.5 : 0);
  };
  const L = D.repuestos.filter((r: any) => !r.inactivo).map((r: any) => ({ r, s: puntaje(r) })).filter((x: any) => x.s > 0);
  const max = Math.max(0, ...L.map((x: any) => x.s));
  const cand = L.filter((x: any) => x.s === max).map((x: any) => x.r);
  if (!cand.length) return [txt('No encontré ese repuesto. Los que tenés cargados son:\n' + D.repuestos.filter((r: any) => !r.inactivo).slice(0, 25).map((r: any) => '• ' + r.nombre).join('\n'))];
  const accion = (r: any) => ({ a: 'stock', r: r.id, q: cantidad, c: c ? c.id : '', f: hoy, i: uid() });
  if (cand.length > 1) {
    return [{
      tipo: 'lista', boton: 'Elegir repuesto', texto: 'Encontré varios repuestos. ¿Cuál usaste? Voy a descontar ' + num(cantidad) + (c ? ' en ' + c.patente : '') + '.',
      filas: cand.slice(0, 10).map((r: any) => ({ id: idAccion(accion(r), 200), titulo: r.nombre, desc: 'Quedan ' + num(+r.stockActual || 0) + ' ' + unidad(r, +r.stockActual || 0) })),
    }];
  }
  const r = cand[0], queda = (+r.stockActual || 0) - cantidad;
  const texto = ['¿Descuento del stock?\n', '📦 ' + num(cantidad) + ' ' + unidad(r, cantidad) + ' de ' + r.nombre,
    c ? '🚗 ' + tituloAuto(c) : '🚗 Sin auto',
    'Quedan ' + num(+r.stockActual || 0) + ' → ' + num(queda) + ' ' + unidad(r, queda) + (queda < 0 ? ' ⚠️ quedaría negativo' : queda <= (+r.stockMinimo || 0) ? ' ⚠️ bajo el mínimo' : '')].join('\n');
  return [pedirConfirmacion(texto, accion(r), 'Descontar')];
}
function semanasCorridas(c: any, hoy: string): number {
  if (c.tipo !== 'alquiler' || !c.inicio || !c.monto) return 0;
  const d = dias(c.inicio, hoy);
  return d < 0 ? 0 : Math.floor(d / 7) + 1;
}
function prepararValor(u: Usuario, D: any, t: string, hoy: string): Salida[] {
  if (!puede(u, 'contratos')) return [txt(sinPermiso())];
  const c = buscarAuto(D, t);
  if (!c) return [txt('¿De qué auto? Por ejemplo: *valor AB123CD 120000*')];
  if (c.tipo === 'financiado') return [txt(c.patente + ' está financiado: la cuota se cambia desde la app, en la solapa Contrato.')];
  const nums = leerNumeros(sinPatente(t, c)).filter(n => !n.km);
  if (!nums.length || nums[0].valor <= 0) return [txt('Me faltó el monto. Por ejemplo: *valor ' + c.patente + ' 120000*')];
  const nuevo = nums[0].valor;
  if (c.tipo !== 'alquiler') {
    return [pedirConfirmacion('¿Cambio el valor semanal de referencia?\n\n🚗 ' + tituloAuto(c) + '\n🏷️ ' + (+c.valorSemanal ? pesos(+c.valorSemanal) + ' → ' : '') + '*' + pesos(nuevo) + '* por semana\n\nSe va a proponer cuando le asignes un chofer.', { a: 'valor', c: c.id, m: nuevo, d: 0, i: uid() }, 'Cambiar')];
  }
  if (nuevo === +c.monto) return [txt(c.patente + ' ya tiene un alquiler de ' + pesos(nuevo) + ' por semana.')];
  const semanas = semanasCorridas(c, hoy);
  const texto = ['¿Cambio el alquiler semanal?\n', '🚗 ' + c.patente + ' — ' + nombreChofer(D, c.choferId), '🏷️ ' + pesos(+c.monto) + ' → *' + pesos(nuevo) + '* por semana',
    semanas ? '\n*Desde la próxima*: las ' + semanas + ' semanas ya corridas quedan con el valor anterior (la deuda de hoy no cambia).\n*Corregir todo*: recalcula todas las semanas con el valor nuevo; usalo solo si el monto estaba mal cargado.' : ''].filter(Boolean).join('\n');
  const base = { a: 'valor', c: c.id, m: nuevo, i: uid() };
  if (!semanas) return [pedirConfirmacion(texto, Object.assign({ d: 0 }, base), 'Cambiar')];
  return [botones(texto, [{ id: idAccion(Object.assign({ d: 1 }, base)), titulo: 'Desde la próxima' }, { id: idAccion(Object.assign({ d: 0 }, base)), titulo: 'Corregir todo' }, { id: 'no', titulo: 'Cancelar' }])];
}
function prepararAsignar(u: Usuario, D: any, t: string, hoy: string): Salida[] {
  if (!puede(u, 'contratos')) return [txt(sinPermiso())];
  const c = buscarAuto(D, t);
  if (!c) return [txt('¿Qué auto? Por ejemplo: *asignar AB123CD Juan*')];
  if (c.tipo === 'financiado') return [txt(c.patente + ' está financiado. Los cambios de chofer de un financiado se hacen desde la app.')];
  const resto = sinPatente(t, c);
  const ch = buscarChoferes(D, resto);
  if (!ch.length) return [txt('No encontré ese chofer. Escribí el nombre como está en la app, por ejemplo: *asignar ' + c.patente + ' Juan Pérez*')];
  if (ch.length > 1) return [txt('Encontré varios choferes:\n' + ch.slice(0, 10).map((d: any) => '• ' + d.nombre).join('\n') + '\n\nEscribí el nombre completo.')];
  const d = ch[0];
  if (c.choferId === d.id) return [txt(d.nombre + ' ya tiene asignado ' + c.patente + '.')];
  const nums = leerNumeros(resto).filter(n => !n.km);
  const monto = nums.length ? nums[0].valor : (+c.valorSemanal || +c.monto || 0);
  if (!monto) return [txt(c.patente + ' no tiene valor semanal cargado. Agregá el monto: *asignar ' + c.patente + ' ' + d.nombre.split(' ')[0] + ' 120000*')];
  const anterior = D.cars.find((x: any) => x.choferId === d.id && x.id !== c.id);
  const texto = ['¿Asigno el auto?\n', '🚗 ' + tituloAuto(c), '👤 ' + d.nombre, '🏷️ Alquiler de ' + pesos(monto) + ' por semana, desde hoy (' + DIAS_SEMANA[diaSemana(hoy)] + ')',
    c.choferId ? '\n⚠️ Hoy lo tiene ' + nombreChofer(D, c.choferId) + ': deja de tenerlo.' : '',
    anterior ? '⚠️ ' + d.nombre + ' tiene ' + anterior.patente + ': ese auto queda disponible.' : ''].filter(Boolean).join('\n');
  return [pedirConfirmacion(texto, { a: 'asignar', c: c.id, d: d.id, m: monto, f: hoy }, 'Asignar')];
}
function prepararService(u: Usuario, D: any, t: string, hoy: string): Salida[] {
  if (!puede(u, 'cargar')) return [txt(sinPermiso())];
  const c = buscarAuto(D, t);
  if (!c) return [txt('¿De qué auto? Por ejemplo: *service AB123CD aceite km 123456 45000*')];
  const resto = sinPatente(t, c);
  const item = buscarCat(resto, MANT_ITEMS);
  if (!item) return [txt('¿Qué se le hizo? Por ejemplo: *service ' + c.patente + ' aceite km 123456 45000*\nÍtems: aceite, filtro de aire, habitáculo, frenos, batería, correa, refrigerante, líquido de frenos, bujías, alineación, neumáticos, matafuegos.')];
  const f = leerFecha(resto, hoy);
  const nums = leerNumeros(quitar(resto, f?.texto));
  let km = 0, costo = 0;
  const conKm = nums.find(n => n.km);
  if (conKm) { km = conKm.valor; const otro = nums.find(n => n !== conKm); costo = otro ? otro.valor : 0; }
  else if (nums.length >= 2) { const orden = nums.slice().sort((a, b) => b.valor - a.valor); km = orden[0].valor; costo = orden[1].valor; }
  else if (nums.length === 1) {
    const actual = +c.km || 0;
    if (actual && Math.abs(nums[0].valor - actual) < 20000 && nums[0].valor >= 1000) km = nums[0].valor; else costo = nums[0].valor;
  }
  const plan = (c.mantenimientoPlan || []).find((p: any) => p.item === item[0]);
  const texto = ['¿Registro este service?\n', '🚗 ' + tituloAuto(c), '🔧 ' + ((plan && plan.label) || item[1]),
    '🛣️ ' + (km ? num(km) + ' km' : 'sin km (uso el último: ' + num(+c.km || 0) + ')'),
    '💲 ' + (costo ? pesos(costo) : 'sin costo'), '📅 ' + fecha(f ? f.fecha : hoy)].join('\n');
  return [pedirConfirmacion(texto, { a: 'service', c: c.id, k: item[0], km: Math.round(km), m: costo, f: f ? f.fecha : hoy, i: uid() }, 'Registrar')];
}
function prepararVencimiento(u: Usuario, D: any, t: string, hoy: string, venc: [string, string, string[]]): Salida[] {
  if (!puede(u, 'cargar')) return [txt(sinPermiso())];
  const c = buscarAuto(D, t);
  const f = leerFecha(sinPatente(t, c), hoy);
  if (!c || !f) return [txt('Para marcar un vencimiento renovado escribí el tipo, la patente y la nueva fecha. Por ejemplo: *vtv AB123CD 15/03/2027*')];
  const texto = ['¿Actualizo el vencimiento?\n', '🚗 ' + tituloAuto(c), '📅 ' + venc[1] + ': ' + (c[venc[0]] ? fecha(c[venc[0]]) + ' → ' : '') + '*' + fecha(f.fecha) + '*',
    f.fecha <= hoy ? '\n⚠️ La fecha nueva ya pasó. Revisá que esté bien.' : ''].filter(Boolean).join('\n');
  return [pedirConfirmacion(texto, { a: 'venc', c: c.id, k: venc[0], f: f.fecha }, 'Actualizar')];
}

/* ======================================================================
   Ejecutar una acción confirmada
   ====================================================================== */

async function ejecutar(u: Usuario, a: any): Promise<Salida[]> {
  if (!a || !a.a) return [txt('No entendí ese botón. Volvé a mandar el mensaje.')];
  if (a.ts && ahoraMin() - a.ts > CONFIRMACION_MINUTOS) return [txt('⌛ Esa confirmación venció. Mandá el mensaje de nuevo.')];
  const permiso = a.a === 'cobro' ? 'cobrar' : (a.a === 'valor' || a.a === 'asignar') ? 'contratos' : 'cargar';
  if (!puede(u, permiso)) return [txt(sinPermiso())];
  const D = await cargar();
  const hoy = hoyAR();
  const c = a.c ? D.todos.find((x: any) => x.id === a.c) : null;
  if (a.c && !c) return [txt('No encontré el auto. Puede que lo hayan borrado.')];

  if (a.a === 'cobro') {
    if (D.payments.some((p: any) => p.id === a.i)) return [txt('Ese cobro ya estaba registrado 👍')];
    if (!c.choferId || !esContrato(c)) return [txt(c.patente + ' ya no tiene contrato activo. No registré el cobro.')];
    const files: any[] = [];
    let avisoFoto = '';
    if (a.md) {
      try { const f = await subirMediaWhatsApp(a.md); files.push({ id: f.id, name: 'comprobante-' + c.patente + '-' + a.f + '.' + EXT[f.type], cat: 'comprobante', type: f.type, size: f.size, fecha: hoy }); }
      catch (e) { avisoFoto = '\n⚠️ No pude guardar la foto: ' + (e as Error).message; }
    }
    const pago: any = { id: a.i, carId: c.id, choferId: c.choferId, fecha: a.f, monto: a.m, tipo: a.t === 'seguro' ? 'seguro' : c.tipo === 'alquiler' ? 'alquiler' : 'cuota', metodo: a.me || 'efectivo', parcial: Boolean(a.p), aCuenta: Boolean(a.ac), nota: 'Cargado por WhatsApp', depositado: false, origen: 'whatsapp' };
    if (files.length) pago.files = files;
    await guardar(u, 'payments', pago);
    D.payments.push(pago);
    if (a.t === 'seguro') {
      const pend = seguroPendiente(D, c.choferId);
      return [txt('✅ Pago de seguro registrado: ' + pesos(a.m) + ' de ' + nombreChofer(D, c.choferId) + ' (' + c.patente + ').\n' + (pend > 0 ? 'Todavía debe ' + pesos(pend) + ' de seguro.' : 'El seguro quedó al día ✅') + (files.length ? '\n📎 Comprobante guardado.' : '') + avisoFoto)];
    }
    const mon = monedaDe(c), deuda = calc(D, c, hoy).debt;
    const d = chofer(D, c.choferId);
    const aviso = d && d.tel ? '\n\nAvisale a ' + d.nombre.split(' ')[0] + ':\n' + waLink(d.tel, 'Hola ' + d.nombre.split(' ')[0] + ', te confirmamos que registramos tu pago de ' + mon(a.m) + ' del ' + fecha(a.f) + '. ¡Gracias!') : '';
    return [txt('✅ Cobro registrado: ' + mon(a.m) + ' de ' + (d ? d.nombre : 'el chofer') + ' (' + c.patente + ').\n' + (deuda > 0 ? 'Ahora debe ' + mon(deuda) + '.' : 'Quedó al día ✅') + (files.length ? '\n📎 Comprobante guardado.' : '') + avisoFoto + aviso)];
  }
  if (a.a === 'gasto') {
    if (D.gastos.some((g: any) => g.id === a.i)) return [txt('Ese gasto ya estaba registrado 👍')];
    const g = { id: a.i, carId: a.c || '', categoria: a.k || 'otro', fecha: a.f, costo: a.m, km: '', proveedor: '', descripcion: a.n || '', sinFactura: false, reclamoSeguro: false, reclamoEstado: '', origen: 'whatsapp' };
    await guardar(u, 'gastos', g);
    return [txt('✅ Gasto registrado: ' + pesos(a.m) + ' (' + (GASTO_LABEL[g.categoria] || 'Otro gasto') + ')' + (c ? ' en ' + c.patente : ' como gasto general') + '.')];
  }
  if (a.a === 'km') {
    if ((+c.km || 0) >= a.k) return [txt(c.patente + ' ya tiene ' + num(+c.km) + ' km. No hice cambios.')];
    await guardar(u, 'cars', Object.assign({}, c, { km: a.k, kmHistorial: (c.kmHistorial || []).concat([{ fecha: hoy, km: a.k }]) }));
    const serv = servicePendiente(Object.assign({}, c, { km: a.k }), hoy)[0];
    return [txt('✅ ' + c.patente + ': ' + num(a.k) + ' km.' + (serv ? '\n🔧 Ojo: ' + (serv.p.label || serv.p.item) + ' ' + textoRestante(serv.e) + '.' : ''))];
  }
  if (a.a === 'rec') {
    if (D.recordatorios.some((r: any) => r.id === a.i)) return [txt('Ese recordatorio ya estaba anotado 👍')];
    await guardar(u, 'recordatorios', { id: a.i, texto: a.n, fecha: a.f, hecho: false });
    return [txt('✅ Anotado para el ' + DIAS_SEMANA[diaSemana(a.f)] + ' ' + fecha(a.f) + ': ' + a.n)];
  }
  if (a.a === 'stock') {
    const r = D.repuestos.find((x: any) => x.id === a.r);
    if (!r) return [txt('No encontré ese repuesto. Puede que lo hayan borrado.')];
    if ((r.movimientos || []).some((m: any) => m.id === a.i)) return [txt('Ya lo había descontado 👍')];
    const mov: any = { id: a.i, tipo: 'salida', cantidad: a.q, fecha: a.f || hoy, nota: 'Por WhatsApp' };
    if (a.c) mov.carId = a.c;
    const stockActual = (+r.stockActual || 0) - a.q;
    await guardar(u, 'repuestos', Object.assign({}, r, { stockActual, movimientos: (r.movimientos || []).concat([mov]) }));
    return [txt('✅ Descontado: ' + num(a.q) + ' ' + unidad(r, a.q) + ' de ' + r.nombre + (c ? ' (' + c.patente + ')' : '') + '. Quedan ' + num(stockActual) + ' ' + unidad(r, stockActual) + '.' +
      (stockActual < 0 ? '\n⚠️ Quedó negativo: revisá la carga del stock.' : stockActual <= (+r.stockMinimo || 0) ? '\n⚠️ Está bajo el mínimo: sumalo a la lista de compra.' : ''))];
  }
  if (a.a === 'valor') {
    if (c.tipo !== 'alquiler') {
      await guardar(u, 'cars', Object.assign({}, c, { valorSemanal: a.m }));
      return [txt('✅ Valor semanal de ' + c.patente + ': ' + pesos(a.m) + '.')];
    }
    if ((c.ajustesDeuda || []).some((x: any) => x.id === a.i) || +c.monto === a.m) return [txt(c.patente + ' ya tiene un alquiler de ' + pesos(a.m) + ' por semana.')];
    const anterior = +c.monto || 0;
    const semanas = semanasCorridas(c, hoy);
    const ajustesDeuda = (c.ajustesDeuda || []).slice();
    // La deuda se calcula como semanas × monto actual; para no reescribir las
    // semanas ya corridas se compensa la diferencia con un ajuste (igual que la app).
    if (a.d && semanas) ajustesDeuda.push({ id: a.i, fecha: hoy, monto: semanas * (a.m - anterior), motivo: 'Cambio de alquiler semanal de ' + pesos(anterior) + ' a ' + pesos(a.m) + ': las ' + semanas + ' semanas ya corridas quedan al valor anterior (por WhatsApp)' });
    await guardar(u, 'cars', Object.assign({}, c, { monto: a.m, valorSemanal: a.m, ajustesDeuda, montoHistorial: actualizarHistorialMonto(c, a.m, hoy) }));
    const nuevo = Object.assign({}, c, { monto: a.m, ajustesDeuda });
    return [txt('✅ ' + c.patente + ' pasa a ' + pesos(a.m) + ' por semana' + (a.d && semanas ? ' desde la próxima semana' : '') + '. Deuda actual: ' + pesos(calc(D, nuevo, hoy).debt) + '.')];
  }
  if (a.a === 'asignar') {
    const d = chofer(D, a.d);
    if (!d) return [txt('No encontré el chofer. Puede que lo hayan borrado.')];
    if (c.choferId === d.id) return [txt(d.nombre + ' ya tiene asignado ' + c.patente + ' 👍')];
    const anterior = D.cars.find((x: any) => x.choferId === d.id && x.id !== c.id);
    if (anterior) {
      const valorSemanal = anterior.tipo === 'alquiler' ? (+anterior.monto || +anterior.valorSemanal || 0) : (+anterior.valorSemanal || 0);
      await guardar(u, 'cars', Object.assign({}, anterior, { choferId: '', tipo: 'disponible', valorSemanal, historialChoferes: actualizarHistorialChoferes(anterior, '', hoy) }));
    }
    await guardar(u, 'cars', Object.assign({}, c, {
      choferId: d.id, tipo: 'alquiler', monto: a.m, inicio: a.f || hoy, total: c.total || 0, cuotas: c.cuotas || 0,
      historialChoferes: actualizarHistorialChoferes(c, d.id, hoy), montoHistorial: actualizarHistorialMonto(c, a.m, hoy), valorSemanal: a.m,
    }));
    return [txt('✅ ' + c.patente + ' asignado a ' + d.nombre + ' por ' + pesos(a.m) + ' por semana. Paga ' + losDias(a.f || hoy) + '.' + (anterior ? '\n' + anterior.patente + ' quedó disponible.' : ''))];
  }
  if (a.a === 'service') {
    if (D.mantenimientos.some((m: any) => m.id === a.i)) return [txt('Ese service ya estaba registrado 👍')];
    const item = MANT_ITEMS.find(x => x[0] === a.k);
    const plan = (c.mantenimientoPlan || []).slice();
    const idx = plan.findIndex((p: any) => p.item === a.k);
    const label = idx >= 0 ? (plan[idx].label || a.k) : (item ? item[1] : a.k);
    const km = a.km || +c.km || 0;
    if (idx >= 0) plan[idx] = Object.assign({}, plan[idx], { ultimoKm: km, ultimaFecha: a.f });
    await guardar(u, 'mantenimientos', { id: a.i, carId: c.id, item: a.k, label, tipo: 'preventivo', fecha: a.f, km, marca: '', especificacion: '', proveedorId: '', costo: a.m || 0, checklist: {}, garantiaMeses: 0, garantiaKm: 0, sinFactura: false, notas: 'Cargado por WhatsApp', files: [] });
    const cambios: any = { mantenimientoPlan: plan };
    if (a.km && a.km > (+c.km || 0)) { cambios.km = a.km; cambios.kmHistorial = (c.kmHistorial || []).concat([{ fecha: hoy, km: a.km }]); }
    await guardar(u, 'cars', Object.assign({}, c, cambios));
    return [txt('✅ Service registrado en ' + c.patente + ': ' + label + (a.m ? ' por ' + pesos(a.m) : '') + '.' + (idx < 0 ? '\n(Ese ítem no está en el plan de mantenimiento del auto, así que no cambia el próximo aviso.)' : ''))];
  }
  if (a.a === 'venc') {
    const v = VENC.find(x => x[0] === a.k);
    if (!v) return [txt('No reconozco ese vencimiento.')];
    const previo = c[a.k] || '';
    if (previo === a.f) return [txt(c.patente + ': ' + v[1] + ' ya vence el ' + fecha(a.f) + ' 👍')];
    await guardar(u, 'cars', Object.assign({}, c, { [a.k]: a.f, vencHistorial: (c.vencHistorial || []).concat([{ tipo: a.k, fechaAnterior: previo, fechaNueva: a.f, cambiado: hoy }]) }));
    return [txt('✅ ' + c.patente + ': ' + v[1] + ' vence el ' + fecha(a.f) + ' (' + textoDias(dias(hoy, a.f)) + ').')];
  }
  return [txt('No reconozco esa acción.')];
}

/* ======================================================================
   Fotos y PDF que manda el usuario
   ====================================================================== */

async function recibirArchivo(u: Usuario, m: any): Promise<Salida[]> {
  const media = m.image || m.document;
  if (!media || !media.id) return [txt('No pude leer el archivo.')];
  if (!puede(u, 'cargar')) return [txt(sinPermiso())];
  const caption = String(media.caption || '');
  const t = sinAcentos(caption).trim();
  const D = await cargar();
  const hoy = hoyAR();
  const c = buscarAuto(D, t);
  if (!c) {
    return [txt('📷 Recibí el archivo, pero no sé de qué auto es. Mandalo de nuevo con la patente escrita abajo, por ejemplo:\n• *AB123CD* (fotos del auto)\n• *comprobante AB123CD* (se guarda en el último cobro)\n• *cobré 100000 AB123CD* (registra el cobro con la foto)\n• *seguro AB123CD* (póliza del seguro)')];
  }
  if (/^(cobre|cobro|cobramos|me pago|me pagaron|pago|pagaron|a cuenta)\b/.test(t) && leerNumeros(sinPatente(t, c)).length) return prepararCobro(u, D, t, hoy, media.id);
  if (/\b(comprobante|transferencia|recibo)\b/.test(t)) {
    if (!puede(u, 'cobrar')) return [txt(sinPermiso())];
    const p = D.payments.filter((x: any) => x.carId === c.id).sort((a: any, b: any) => (String(b.fecha) + b.id).localeCompare(String(a.fecha) + a.id))[0];
    if (!p) return [txt(c.patente + ' no tiene cobros. Mandá la foto con *cobré MONTO ' + c.patente + '* para registrar el cobro con el comprobante.')];
    const f = await subirMediaWhatsApp(media.id);
    const files = (p.files || []).concat([{ id: f.id, name: 'comprobante-' + c.patente + '-' + p.fecha + '.' + EXT[f.type], cat: 'comprobante', type: f.type, size: f.size, fecha: hoy }]);
    await guardar(u, 'payments', Object.assign({}, p, { files }));
    return [txt('📎 Guardé el comprobante en el cobro de ' + (p.tipo === 'cuota' ? dolares(+p.monto) : pesos(+p.monto)) + ' del ' + fecha(p.fecha) + ' (' + c.patente + ').')];
  }
  const cat = buscarCat(sinPatente(t, c), DOC_CATS.filter(x => x[0] !== 'fotos')) as any;
  const categoria = cat ? cat[0] : 'fotos';
  if (categoria === 'fotos' && m.document && !String(m.document.mime_type || '').startsWith('image/')) {
    return [txt('Recibí un PDF para ' + c.patente + '. Decime qué es escribiéndolo abajo del archivo: *seguro ' + c.patente + '*, *cedula ' + c.patente + '*, *vtv ' + c.patente + '*, *titulo ' + c.patente + '* o *contrato ' + c.patente + '*.')];
  }
  const f = await subirMediaWhatsApp(media.id);
  const nombre = (m.document && m.document.filename) || ((categoria === 'fotos' ? 'foto' : categoria) + '-' + c.patente + '-' + hoy + '.' + EXT[f.type]);
  const files = (c.files || []).concat([{ id: f.id, name: nombre, cat: categoria, type: f.type, size: f.size, fecha: hoy }]);
  await guardar(u, 'cars', Object.assign({}, c, { files }));
  return [txt(categoria === 'fotos' ? '📷 Guardada en la bitácora de fotos de ' + c.patente + '.' : '📄 Guardado como ' + cat[1].toLowerCase() + ' de ' + c.patente + '.')];
}

/* ======================================================================
   Interpretar mensajes en lenguaje libre con Claude (opcional)
   ====================================================================== */

const ia = IA_KEY ? new Anthropic({ apiKey: IA_KEY, maxRetries: 1, timeout: 25000 }) : null;

const PROMPT_IA = `Sos el intérprete del bot de WhatsApp de LD Rental, una empresa que alquila y financia autos a choferes de aplicaciones de viaje en Argentina.
Tu única tarea es traducir el mensaje del usuario a UNO de los comandos de abajo y llamar a la herramienta "comando" con el texto exacto del comando. No respondas con datos ni cálculos: el bot los saca de la base de datos después.
Si el mensaje no se puede expresar con un comando, o falta un dato imprescindible (un monto, qué auto), no llames a la herramienta: respondé en texto, en una o dos oraciones en castellano rioplatense, pidiendo lo que falta o diciendo qué sí podés hacer. Nunca inventes montos, patentes, fechas ni nombres.
Usá las patentes y los nombres del catálogo de la flota. Si el usuario menciona un auto por su modelo, color, número de flota o chofer ("el Onix blanco", "el de Juan"), usá la patente correspondiente. Si hay más de un auto posible, preguntá cuál.
Las cargas de datos se confirman con un botón antes de guardarse, así que traducí también los pedidos de carga.

Comandos (PATENTE = patente del catálogo; NOMBRE = nombre del chofer como figura en el catálogo; MONTO = número sin puntos; FECHA = dd/mm/aaaa):
- resumen
- cobros hoy | cobros semana | cobros mes
- quien no pago
- deudas | top deudores | deuda PATENTE | deuda NOMBRE
- cuenta NOMBRE   (estado de cuenta del chofer)
- esperado | financiados | tablero | flota | libres | puntualidad | multas | taller
- PATENTE   (ficha del auto)
- NOMBRE   (ficha del chofer)
- historial PATENTE   (choferes que tuvo el auto)
- portal NOMBRE   (link del portal del chofer)
- vencimientos | vencimientos DIAS | vencimientos PATENTE
- service | service PATENTE
- gastos mes | gastos PATENTE | rentabilidad PATENTE | ranking rentabilidad
- stock | lista de compra
- doc PATENTE | doc PATENTE CATEGORIA   (CATEGORIA: cedula, titulo, poliza, credencial, certificado, vtv, patente, contrato, manual, fotos)
- buscar TEXTO   (marca, modelo, color o número de flota)
- cobre MONTO PATENTE [efectivo|transferencia|mp] [FECHA]   (registra un cobro; agregá "a cuenta" o "parcial" si corresponde)
- cobre seguro MONTO PATENTE   (el chofer pagó el seguro del auto, que se cobra aparte en pesos)
- gasto MONTO DESCRIPCION [PATENTE] [FECHA]
- km PATENTE KILOMETROS
- recordame FECHA TEXTO
- use CANTIDAD NOMBRE_DEL_REPUESTO [PATENTE]   (descuenta stock)
- valor PATENTE MONTO   (cambia el alquiler semanal)
- asignar PATENTE NOMBRE [MONTO]
- service PATENTE ITEM km KILOMETROS MONTO   (ITEM: aceite, filtro de aire, habitaculo, frenos, bateria, correa, refrigerante, liquido de frenos, bujias, alineacion, neumaticos, matafuegos)
- vtv|seguro|impuesto|cedula|oblea|hidraulica|habilitacion PATENTE FECHA   (vencimiento renovado)
- ayuda`;

function catalogoIA(D: any, hoy: string): string {
  const autos = D.cars.map((c: any) => '- ' + (c.patente || 'sin patente') + ': ' + [descAuto(c), c.color, c.numeroFlota ? 'flota ' + c.numeroFlota : '', (TIPOS[c.tipo] || c.tipo || '').toLowerCase(), c.choferId ? 'chofer ' + nombreChofer(D, c.choferId) : 'sin chofer'].filter(Boolean).join(', '));
  const choferes = choferesActivos(D).map((d: any) => d.nombre);
  return 'Hoy es ' + DIAS_SEMANA[diaSemana(hoy)] + ' ' + fecha(hoy) + '.\n\nAutos de la flota:\n' + (autos.join('\n') || '(ninguno)') + '\n\nChoferes activos: ' + (choferes.join(', ') || '(ninguno)') +
    '\n\nRepuestos en stock: ' + (D.repuestos.filter((r: any) => !r.inactivo).map((r: any) => r.nombre).join(', ') || '(ninguno)');
}
async function interpretarConIA(D: any, texto: string, hoy: string): Promise<{ comando?: string; respuesta?: string } | null> {
  if (!ia) return null;
  const usaFallback = /^claude-(opus-5|fable-5)/.test(IA_MODEL);
  const params: any = {
    model: IA_MODEL,
    max_tokens: 4000,
    system: [
      { type: 'text', text: PROMPT_IA, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: catalogoIA(D, hoy) },
    ],
    tools: [{
      name: 'comando',
      description: 'Ejecuta un comando del bot de LD Rental. Recibe el comando exacto, con la sintaxis de la lista.',
      strict: true,
      input_schema: { type: 'object', properties: { comando: { type: 'string', description: 'El comando, por ejemplo "deuda AB123CD" o "cobre 100000 AB123CD transferencia".' } }, required: ['comando'], additionalProperties: false },
    }],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: texto }],
  };
  if (!IA_MODEL.includes('haiku')) params.output_config = { effort: 'low' };
  if (usaFallback) { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }
  try {
    const r: any = usaFallback ? await ia.beta.messages.create(params) : await ia.messages.create(params);
    if (r.stop_reason === 'refusal') return null;
    for (const b of r.content || []) if (b.type === 'tool_use' && b.name === 'comando' && b.input && typeof b.input.comando === 'string') return { comando: b.input.comando };
    const respuesta = (r.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    return respuesta ? { respuesta } : null;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) console.log('IA: la clave ANTHROPIC_API_KEY no es válida');
    else if (e instanceof Anthropic.RateLimitError) console.log('IA: límite de uso alcanzado');
    else if (e instanceof Anthropic.APIError) console.log('IA: error ' + e.status + ': ' + e.message);
    else console.log('IA: no se pudo consultar:', String(e));
    return null;
  }
}

/* ======================================================================
   Responder un mensaje de texto
   ====================================================================== */

async function responder(u: Usuario, D: any, texto: string, desdeIA = false): Promise<Salida[]> {
  const hoy = hoyAR();
  const sinSaludo = texto.replace(/^\s*(hola|holis|buenas|buen d[ií]a|buenos d[ií]as|buenas tardes|buenas noches)\b[\s,.!]*/i, '');
  if (sinSaludo.trim().length > 2) texto = sinSaludo;
  const t = limpiarEspacios(sinAcentos(texto).replace(/[¿?¡!]/g, ' '));
  const conFinanzas = (f: () => string) => puede(u, 'finanzas') ? [txt(f())] : [txt(sinPermiso())];

  if (!t || /^(hola|holis|buenas|buen dia|buenos dias|buenas tardes|buenas noches|menu|inicio|opciones|help|comandos|start)\b/.test(t)) return menu(u);
  if (/^ayuda\b/.test(t)) return /cargar|carga/.test(t) ? [txt(ayudaCargar(u))] : menu(u);
  if (/^(como cargo|cargar datos|ayuda cargar|como cargar)\b/.test(t)) return [txt(ayudaCargar(u))];

  // --- Cargas (empiezan con un verbo) ---
  if (/^(registra(r)?\s+)?(un\s+)?(cobre|cobro|cobramos|cobrar|me pago|me pagaron|pago|pagaron|abono|a cuenta|pago a cuenta)\b/.test(t) && leerNumeros(t).length) return prepararCobro(u, D, t, hoy);
  if (/^(gasto|gaste|gastamos|pague|pagamos|compre|compramos)\b/.test(t)) return prepararGasto(u, D, t, texto, hoy);
  if (/^(km|kms|kilometraje|kilometros)\b/.test(t) && buscarAuto(D, t)) return prepararKm(u, D, t);
  if (/^(recordame|recorda|recordar|recordatorio|acordate)\b/.test(t)) return prepararRecordatorio(u, t, texto, hoy);
  if (/^(use|usamos|usaron|saque|sacamos|consumi|consumimos|descontar|descontame|descontá)\b/.test(t)) return prepararStock(u, D, t, hoy);
  if (/^(valor|nuevo valor|alquiler semanal|precio semanal|subir alquiler|subile|bajale)\b/.test(t) && leerNumeros(sinPatente(t, buscarAuto(D, t))).length) return prepararValor(u, D, t, hoy);
  if (/^(asignar|asigna|asignale|asignarle|entregar|entregale)\b/.test(t)) return prepararAsignar(u, D, t, hoy);
  if (/^(service|hice|hicimos|se hizo|cambie|cambiamos|se cambio|cambio de)\b/.test(t)) {
    const c = buscarAuto(D, t);
    if (c && (buscarCat(sinPatente(t, c), MANT_ITEMS) || leerNumeros(sinPatente(t, c)).length)) return prepararService(u, D, t, hoy);
  }
  const vencCmd = VENC.find(v => v[2].some(p => new RegExp('^' + p + 's?\\b').test(t)));
  if (vencCmd) { const c = buscarAuto(D, t); if (c && leerFecha(sinPatente(t, c), hoy)) return prepararVencimiento(u, D, t, hoy, vencCmd); }
  if (/^(doc|docs|documento|documentos|mandame|pasame|enviame)\b/.test(t)) {
    const c = buscarAuto(D, t);
    if (c) return await mandarDocumento(D, c, t);
    if (/^(doc|docs|documento|documentos)\b/.test(t)) return [txt('¿De qué auto? Por ejemplo: *doc AB123CD* o *doc AB123CD seguro*')];
  }

  // --- Consultas ---
  const c = buscarAuto(D, t) || autoUnicoPorTexto(D, t);
  const choferesEn = () => buscarChoferes(D, c ? sinPatente(t, c) : t);
  const unChofer = (f: (d: any) => Salida[] | string): Salida[] => {
    const L = choferesEn();
    if (L.length === 1) { const r = f(L[0]); return typeof r === 'string' ? [txt(r)] : r; }
    if (L.length > 1) return [txt('Encontré varios choferes:\n' + L.slice(0, 10).map((d: any) => '• ' + d.nombre).join('\n') + '\n\nEscribí el nombre completo.')];
    return [];
  };

  if (/^resumen\b/.test(t) || (/como viene|como va|como estamos/.test(t) && !c && !choferesEn().length)) return [txt(resumen(D, hoy))];
  if (/\btop\b|mas deben|debe mas|deben mas|mayores deudores|peores pagadores|los que mas/.test(t)) return [txt(topDeudores(D, hoy))];
  if (/(quien|quienes).*(no pag|falta)|no pag(o|aron)|faltan pagar|falta pagar|pendientes de pago/.test(t)) return [txt(quienNoPago(D, hoy))];
  if (/\bespera(do|mos)?\b|deberia entrar|tendria que entrar|falta cobrar|proyeccion/.test(t)) return [txt(esperado(D, hoy))];
  if (/\bcuenta\b|estado de cuenta|saldo de/.test(t) && !/a cuenta/.test(t)) {
    const r = unChofer(d => estadoDeCuenta(D, d, hoy)); if (r.length) return r;
    if (c && c.choferId) return [txt(estadoDeCuenta(D, chofer(D, c.choferId), hoy))];
  }
  if (/\b(deuda|debe|deben|mora|atrasad|morosos|deudas)/.test(t)) {
    if (c) return [txt(deudaDeAuto(D, c, hoy))];
    const r = unChofer(d => {
      const autos = D.cars.filter((x: any) => x.choferId === d.id && esContrato(x));
      return autos.length ? autos.map((x: any) => deudaDeAuto(D, x, hoy)).join('\n\n') : d.nombre + ' no tiene auto con contrato activo.';
    });
    return r.length ? r : [txt(listaDeudas(D, hoy))];
  }
  if (/\bcobr|\bingres|entro|\brecaud|factur/.test(t)) {
    if (/\bhoy\b/.test(t)) return [txt(cobrosHoy(D, hoy))];
    if (/\bsemana/.test(t)) return [txt(cobrosPeriodo(D, hoy, 'semana'))];
    if (/\bmes\b/.test(t)) return [txt(cobrosPeriodo(D, hoy, 'mes'))];
    return [txt(cobrosGeneral(D, hoy))];
  }
  if (/financiad/.test(t)) return [txt(financiados(D, hoy))];
  if (/tablero/.test(t)) return conFinanzas(() => tablero(D, hoy));
  if (/rentab|ganancia|\brinde\b|rendimiento|mas rentable|\bneto\b/.test(t)) {
    if (!puede(u, 'finanzas')) return [txt(sinPermiso())];
    if (c) return [txt(rentabilidad(D, c, hoy))];
    return [txt(rankingRentabilidad(D, hoy))];
  }
  if (/^flota\b|cuantos autos/.test(t)) return [txt(flota(D))];
  if (/libre|disponib|sin chofer|parados/.test(t)) return [txt(libres(D, hoy))];
  if (/historial|choferes que tuvo|quien lo tuvo/.test(t) && c) return [txt(historialAuto(D, c, hoy))];
  if (/\bportal\b/.test(t)) {
    const r = unChofer(d => linkPortal(d)); if (r.length) return r;
    if (c && c.choferId) return [txt(linkPortal(chofer(D, c.choferId)))];
    return [txt('¿De qué chofer? Por ejemplo: *portal Juan*')];
  }
  if (/puntual/.test(t)) {
    const r = unChofer(d => { const s = puntualidad(D, d.id, hoy); return s == null ? d.nombre + ' todavía no tiene datos de puntualidad.' : '⏱️ Puntualidad de ' + d.nombre + ': ' + s + '/100'; });
    return r.length ? r : [txt(rankingPuntualidad(D, hoy))];
  }
  if (/venc/.test(t)) {
    if (c) return [txt(vencimientos(D, hoy, 0, c))];
    const n = leerNumeros(t)[0];
    return [txt(vencimientos(D, hoy, n && n.valor > 0 && n.valor <= 365 ? Math.round(n.valor) : AVISO_SOFT))];
  }
  if (/service|mantenimiento/.test(t)) return [txt(c ? serviceAuto(c, hoy) : serviceFlota(D, hoy))];
  if (/gasto/.test(t)) return [txt(c ? gastosAuto(D, c, hoy) : gastosMes(D, hoy))];
  if (/lista de compra|que comprar|que hay que comprar|compras/.test(t)) return [txt(listaDeCompra(D))];
  if (/stock|repuesto/.test(t)) return [txt(stock(D))];
  if (/multa/.test(t)) return [txt(multas(D))];
  if (/taller/.test(t)) return [txt(taller(D, hoy))];
  if (/^(buscar|busca|busco|encontrar)\b/.test(t)) {
    const L = buscarAutosPorTexto(D, t);
    if (L.length === 1) return fichaAuto(D, L[0], hoy);
    if (L.length) return [txt('🔎 Encontré ' + L.length + ' autos:\n' + L.slice(0, 20).map((x: any) => '• ' + tituloAuto(x) + (x.color ? ' ' + x.color : '') + (x.choferId ? ' — ' + nombreChofer(D, x.choferId) : '')).join('\n'))];
    return [txt('No encontré autos con "' + t.replace(/^(buscar|busca|busco|encontrar)\s*/, '') + '".')];
  }
  if (/^(whatsapp|wa|chat|telefono|tel)\b/.test(t)) {
    const r = unChofer(d => d.tel ? 'Chat con ' + d.nombre + ': ' + waLink(d.tel) : d.nombre + ' no tiene teléfono cargado.'); if (r.length) return r;
  }

  // --- Fichas ---
  if (c) return fichaAuto(D, c, hoy);
  const ch = choferesEn();
  if (ch.length === 1) return fichaChofer(D, ch[0], hoy, u);
  if (ch.length > 1) return [txt('Encontré varios choferes:\n' + ch.slice(0, 10).map((d: any) => '• ' + d.nombre).join('\n') + '\n\nEscribí el nombre completo.')];
  const porModelo = buscarAutosPorTexto(D, t);
  if (porModelo.length === 1) return fichaAuto(D, porModelo[0], hoy);
  if (porModelo.length > 1 && porModelo.length <= 10 && t.split(' ').length <= 3) {
    return [{ tipo: 'lista', boton: 'Ver autos', texto: 'Encontré ' + porModelo.length + ' autos. ¿Cuál?', filas: porModelo.map((x: any) => ({ id: 'cmd:' + x.patente, titulo: x.patente, desc: [descAuto(x), x.color, x.choferId ? nombreChofer(D, x.choferId) : 'sin chofer'].filter(Boolean).join(' · ') })) }];
  }

  // --- Lenguaje libre ---
  if (!desdeIA && ia) {
    const r = await interpretarConIA(D, texto, hoy);
    if (r && r.comando) {
      const salida = await responder(u, D, r.comando, true);
      if (salida.length) return salida;
    }
    if (r && r.respuesta) return [txt(r.respuesta)];
  }
  return [txt('No te entendí 🤔\nEscribí *menú* para ver las opciones' + (puede(u, 'cargar') ? ' o *ayuda cargar* para ver cómo cargar datos.' : '.'))];
}

/* ======================================================================
   Webhook
   ====================================================================== */

// Meta puede reenviar el mismo mensaje si tardamos: se ignoran los repetidos.
const vistos = new Set<string>();
function yaVisto(id: string): boolean {
  if (!id) return false;
  if (vistos.has(id)) return true;
  vistos.add(id);
  if (vistos.size > 500) vistos.delete(vistos.values().next().value as string);
  return false;
}

async function procesar(m: any): Promise<void> {
  const u = USUARIOS.find(x => x.tel === normTel(m.from));
  if (!u) { console.log('Ignorado, número no autorizado:', m.from); return; }
  if (yaVisto(m.id)) return;
  await marcarLeido(m.id);
  let salidas: Salida[] = [];
  try {
    if (m.type === 'text') {
      salidas = await responder(u, await cargar(), m.text?.body || '');
    } else if (m.type === 'interactive') {
      const r = m.interactive?.button_reply || m.interactive?.list_reply || {};
      const id = String(r.id || '');
      if (id === 'no') salidas = [txt('Cancelado 👍 No guardé nada.')];
      else if (id.startsWith('ok:')) { let a: any = null; try { a = JSON.parse(id.slice(3)); } catch (_) { /* id inválido */ } salidas = await ejecutar(u, a); }
      else if (id.startsWith('cmd:')) salidas = await responder(u, await cargar(), id.slice(4));
      else salidas = [txt('No entendí esa opción. Escribí *menú*.')];
    } else if (m.type === 'button') {
      salidas = await responder(u, await cargar(), m.button?.text || '');
    } else if (m.type === 'image' || m.type === 'document') {
      salidas = await recibirArchivo(u, m);
    } else if (m.type === 'audio') {
      salidas = [txt('Todavía no entiendo audios 🎧 Escribime el mensaje, o *menú* para ver las opciones.')];
    } else {
      salidas = [txt('Por ahora entiendo texto, fotos y PDF. Escribí *menú* para ver las opciones.')];
    }
  } catch (err) {
    console.log('Error respondiendo:', String(err));
    salidas = [txt('Tuve un problema: ' + ((err as Error).message || 'error desconocido') + '. Probá de nuevo en un rato.')];
  }
  for (const s of salidas) await enviar(m.from, s);
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

  // Se responde enseguida a Meta y el trabajo sigue en segundo plano, así Meta
  // no reintenta mientras se consulta la base o la IA.
  const trabajo = (async () => { for (const m of mensajes) await procesar(m); })();
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime && typeof runtime.waitUntil === 'function') runtime.waitUntil(trabajo);
  else await trabajo;
  return new Response('EVENT_RECEIVED', { status: 200 });
});
