import { S, ui } from '../state.js';
import { esc, money } from '../utils.js';
import { isContract, calc, vs, driverName, plate, tipoBadge, badge, peorItemMantenimiento } from '../calc.js';
import { VENC, MOTIVOS_REEMPLAZO } from '../constants.js';

export function viewAutos() {
  const nVendidos = S.cars.filter(c => c.vendido).length;
  return '<h1>Autos</h1><p class="sub">' + S.cars.filter(c => !c.vendido).length + ' en total' + (nVendidos ? ' · <span class="tap" style="text-decoration:underline" onclick="ui.showVendidos=!ui.showVendidos;renderList()">' + (ui.showVendidos ? 'ocultar' : 'ver') + ' ' + nVendidos + ' vendidos</span>' : '') + ' · <span class="tap" style="text-decoration:underline" onclick="mapaFlotaView()">ver mapa</span></p>' +
  '<div class="bar"><input type="search" placeholder="Buscar patente, marca o chofer" value="' + esc(ui.qCars) + '" oninput="ui.qCars=this.value;renderList()"><button class="btn" onclick="carForm()">Agregar</button></div>' +
  '<label class="f" style="margin-bottom:10px"><span>Ordenar por</span><select onchange="ui.ordenAutos=this.value;renderList()">' +
  '<option value="patente"' + (ui.ordenAutos === 'patente' ? ' selected' : '') + '>Patente (A-Z)</option>' +
  '<option value="deuda"' + (ui.ordenAutos === 'deuda' ? ' selected' : '') + '>Deuda (mayor primero)</option>' +
  '<option value="monto"' + (ui.ordenAutos === 'monto' ? ' selected' : '') + '>Monto semanal (mayor primero)</option></select></label>' +
  '<div id="list"></div>';
}
export function listAutos() {
  const q = ui.qCars.trim().toLowerCase();
  const L = S.cars.filter(c => (ui.showVendidos || !c.vendido) && (!q || [c.patente, c.marca, c.modelo, driverName(c.choferId)].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => ui.ordenAutos === 'deuda' ? calc(b).debt - calc(a).debt : ui.ordenAutos === 'monto' ? (+b.monto || 0) - (+a.monto || 0) : String(a.patente).localeCompare(String(b.patente)));
  if (!L.length) return '<div class="card empty">' + (S.cars.length ? 'Ningún auto coincide con la búsqueda.' : '<b>Todavía no cargaste autos</b>Tocá "Agregar" para empezar.') + '</div>';
  return L.map(c => {
    const i = calc(c); const al = [...VENC.map(v => vs(c[v[0]])), null].filter(Boolean).sort((a, b) => a.d - b.d)[0];
    let b = '';
    if (c.vendido) b += badge('mute', 'Vendido');
    else if (isContract(c) && i.debt > 0) b += badge('bad', 'Debe ' + money(i.debt));
    else if (isContract(c)) b += badge('ok', 'Al día');
    if (!c.vendido && c.reservado) b += ' ' + badge('info', 'Reservado' + (c.reservadoPara ? ': ' + c.reservadoPara : ''));
    if (!c.vendido && al && al.d <= 30) b += ' ' + badge(al.cls, 'Doc: ' + al.t.replace('Vence ', 'vence '));
    const serv = !c.vendido && peorItemMantenimiento(c);
    if (serv) b += ' ' + badge(serv.cls, serv.t);
    if (c.aReemplazar) b += ' ' + badge('warn', 'A reemplazar: ' + (MOTIVOS_REEMPLAZO.find(x => x[0] === c.motivoReemplazo) || [0, 'motivo'])[1]);
    if (!c.vendido && S.siniestros.some(s => s.carId === c.id && s.estado !== 'cerrado')) b += ' ' + badge('bad', 'Siniestro abierto');
    if (c.files && c.files.length) b += ' ' + badge('mute', c.files.length + (c.files.length === 1 ? ' archivo' : ' archivos'));
    return '<div class="card tap" onclick="carForm(\'' + c.id + '\')"><div class="row between"><div>' + plate(c.patente) + '</div>' + tipoBadge(c.tipo) + '</div>' +
    '<div class="small muted" style="margin-top:6px">' + esc([c.marca, c.modelo, c.anio].filter(Boolean).join(' ')) + '</div>' +
    '<div class="row between" style="margin-top:4px"><div>' + (c.choferId ? esc(driverName(c.choferId)) : '<span class="muted">Sin chofer</span>') + '</div><div class="small muted">' + (isContract(c) ? money(c.monto) + ' por semana' : '') + '</div></div>' +
    (b ? '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">' + b + '</div>' : '') + '</div>';
  }).join('');
}
