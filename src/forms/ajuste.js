import { val, uid, iso, today, esc } from '../utils.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save } from '../data.js';
import { carById } from '../calc.js';
import { carForm } from './car.js';

export function ajusteForm(carId) {
  const c = carById(carId);
  if (!c) { toast('Auto no encontrado'); return; }
  const h = '<h3>Ajustar deuda — ' + esc(c.patente) + '</h3>' +
  '<div class="small muted" style="margin-bottom:12px">Un monto positivo reduce la deuda calculada (condonación, descuento, error a favor del chofer).</div>' +
  '<div class="two"><label class="f"><span>Monto a descontar</span><input id="aj_monto" inputmode="decimal"></label>' +
  '<label class="f"><span>Fecha</span><input id="aj_fecha" type="date" value="' + iso(today()) + '"></label></div>' +
  '<label class="f"><span>Motivo</span><textarea id="aj_motivo"></textarea></label>' +
  '<div class="row"><button class="btn grow" onclick="saveAjuste(\'' + c.id + '\')">Guardar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function saveAjuste(carId) {
  const monto = +val('aj_monto');
  if (!monto || monto <= 0) { toast('Poné el monto a descontar'); return; }
  const c = carById(carId); if (!c) return;
  const ajuste = { id: uid(), fecha: val('aj_fecha') || iso(today()), monto, motivo: val('aj_motivo') };
  const ajustesDeuda = (c.ajustesDeuda || []).concat([ajuste]);
  if (await save('cars', Object.assign({}, c, { ajustesDeuda }))) { closeModal(); toast('Ajuste registrado'); }
}
export async function delAjuste(carId, ajusteId) {
  const c = carById(carId); if (!c) return;
  const ajustesDeuda = (c.ajustesDeuda || []).filter(x => x.id !== ajusteId);
  if (await save('cars', Object.assign({}, c, { ajustesDeuda }))) { toast('Ajuste eliminado'); carForm(carId); }
}
