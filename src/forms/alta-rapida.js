import { S } from '../state.js';
import { val, uid, iso, today, esc } from '../utils.js';
import { TIPOS } from '../constants.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { carForm } from './car.js';
import { driverForm } from './driver.js';

export function altaRapidaAutoForm() {
  const drivers = S.drivers.filter(d => !d.inactivo && !d.prospecto).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  const h = '<h3>Nuevo auto</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Cargá lo básico y creá el auto. El resto (documentación, seguro, mantenimiento...) lo completás después en la ficha.</div>' +
  '<label class="f"><span>Patente</span><input id="nr_patente" autocapitalize="characters"></label>' +
  '<div class="two"><label class="f"><span>Marca</span><input id="nr_marca"></label>' +
  '<label class="f"><span>Modelo</span><input id="nr_modelo"></label></div>' +
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
export async function guardarAltaRapidaAuto() {
  const patente = val('nr_patente').toUpperCase();
  if (!patente) { toast('Falta la patente'); return; }
  if (S.cars.some(x => String(x.patente || '').toUpperCase() === patente)) { toast('Ya existe un auto con esa patente'); return; }
  const tipo = val('nr_tipo');
  const choferId = (tipo === 'alquiler' || tipo === 'financiado') ? val('nr_chofer') : '';
  const o = {
    id: uid(), patente, marca: val('nr_marca'), modelo: val('nr_modelo'), tipo, choferId,
    inicio: choferId ? iso(today()) : '', monto: 0,
    historialChoferes: choferId ? [{ choferId, desde: iso(today()), hasta: null }] : [],
  };
  if (await save('cars', o)) { toast('Auto creado. Completá el resto cuando quieras'); carForm(o.id); }
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
  if (tel && S.drivers.some(x => String(x.tel || '').trim() === tel)) { toast('Ya existe un chofer con ese teléfono'); return; }
  const o = { id: uid(), nombre, tel, docs: {} };
  if (await save('drivers', o)) { toast('Chofer creado. Completá el resto cuando quieras'); driverForm(o.id); }
}
