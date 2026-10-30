import { S } from '../state.js';
import { val, uid, iso, today, esc } from '../utils.js';
import { TIPOS } from '../constants.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { carForm } from './car.js';
import { driverForm } from './driver.js';
import { botonTituloAuto, adjuntarTituloPendiente, descartarTituloPendiente, datosTituloPendiente, normalizarCilindrada } from './titulo-auto.js';

export function altaRapidaAutoForm() {
  const drivers = S.drivers.filter(d => !d.inactivo && !d.prospecto).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  descartarTituloPendiente();
  const h = '<h3>Nuevo auto</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Cargá lo básico y creá el auto. El resto (documentación, seguro, mantenimiento...) lo completás después en la ficha.</div>' +
  botonTituloAuto(null, 'nr') +
  '<label class="f"><span>Patente</span><input id="nr_patente" autocapitalize="characters"></label>' +
  '<div class="two"><label class="f"><span>Marca</span><input id="nr_marca" placeholder="ej: Chevrolet"></label>' +
  '<label class="f"><span>Modelo</span><input id="nr_modelo" placeholder="ej: Onix LT"></label></div>' +
  '<div class="two"><label class="f"><span>Año</span><input id="nr_anio" inputmode="numeric" placeholder="ej: 2021"></label>' +
  '<label class="f"><span>Cilindrada <small>en litros</small></span><input id="nr_cilindrada" inputmode="decimal" placeholder="ej: 1.4"></label></div>' +
  '<label class="f"><span>Estado</span><select id="nr_tipo" onchange="onAltaRapidaAutoTipo()">' + Object.keys(TIPOS).map(k => '<option value="' + k + '">' + TIPOS[k] + '</option>').join('') + '</select></label>' +
  '<div id="nr_choferBox" style="display:none"><label class="f"><span>Chofer</span><select id="nr_chofer"><option value="">Elegir chofer</option>' + drivers.map(d => '<option value="' + d.id + '">' + esc(d.nombre) + '</option>').join('') + '</select></label></div>' +
  '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="guardarAltaRapidaAuto()">Crear auto</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>';
  openModal(h);
  onAltaRapidaAutoTipo();
}
export function onAltaRapidaAutoTipo() {
  const t = val('nr_tipo');
  const box = document.getElementById('nr_choferBox'); if (!box) return;
  box.style.display = (t === 'alquiler' || t === 'financiado') ? '' : 'none';
}
let sinCilindradaOk = false;
export async function guardarAltaRapidaAuto() {
  const patente = val('nr_patente').toUpperCase();
  if (!patente) { toast('Falta la patente'); return; }
  if (S.cars.some(x => String(x.patente || '').toUpperCase() === patente)) { toast('Ya existe un auto con esa patente'); return; }
  const marca = val('nr_marca').trim(), modelo = val('nr_modelo').trim(), anioTxt = val('nr_anio').trim(), cilindrada = normalizarCilindrada(val('nr_cilindrada'));
  if (!marca || !modelo) { toast('Completá la marca y el modelo'); return; }
  const anio = +anioTxt;
  if (!anioTxt || !Number.isInteger(anio) || anio < 1950 || anio > new Date().getFullYear() + 1) { toast('Poné el año del auto (ej: 2021)'); return; }
  // La cilindrada se pide, pero si no la sabés se puede seguir tocando de nuevo.
  if (!cilindrada && !sinCilindradaOk) {
    sinCilindradaOk = true; setTimeout(() => { sinCilindradaOk = false; }, 6000);
    const el = document.getElementById('nr_cilindrada'); if (el) { el.style.outline = '2px solid var(--warn)'; el.focus(); }
    toast('Falta la cilindrada. Si no la sabés, tocá "Crear auto" otra vez'); return;
  }
  sinCilindradaOk = false;
  const tipo = val('nr_tipo');
  const choferId = (tipo === 'alquiler' || tipo === 'financiado') ? val('nr_chofer') : '';
  const o = {
    ...datosTituloPendiente(),
    id: uid(), patente, marca, modelo, anio: String(anio), cilindrada, tipo, choferId,
    inicio: choferId ? iso(today()) : '', monto: 0,
    historialChoferes: choferId ? [{ choferId, desde: iso(today()), hasta: null }] : [],
  };
  if (await save('cars', o)) { await adjuntarTituloPendiente(o); toast('Auto creado. Completá el resto cuando quieras'); carForm(o.id); }
}

export function altaRapidaChoferForm() {
  const h = '<h3>Nuevo chofer</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Cargá lo básico y creá el chofer. El resto (DNI, licencia, contacto de emergencia...) lo completás después en la ficha.</div>' +
  '<label class="f"><span>Nombre y apellido</span><input id="nr_nombre"></label>' +
  '<label class="f"><span>Teléfono <small>con código de país, ej: +5491155551234</small></span><input id="nr_tel" type="tel"></label>' +
  '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="guardarAltaRapidaChofer()">Crear chofer</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>';
  openModal(h);
}
export async function guardarAltaRapidaChofer() {
  const nombre = val('nr_nombre').trim();
  if (!nombre) { toast('Falta el nombre'); return; }
  const tel = val('nr_tel').trim();
  if (tel && !/^\+?[\d\s()-]{6,}$/.test(tel)) { toast('El teléfono no parece válido. Usá solo números, espacios, +, - o paréntesis'); return; }
  if (tel && S.drivers.some(x => String(x.tel || '').trim() === tel)) { toast('Ya existe un chofer con ese teléfono'); return; }
  const o = { id: uid(), nombre, tel, docs: {} };
  if (await save('drivers', o)) { toast('Chofer creado. Completá el resto cuando quieras'); driverForm(o.id); }
}
