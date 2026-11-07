// Aviso de km raros: compara el último tramo de km de cada auto con lo que hace
// normalmente (la mediana de sus tramos anteriores), con o sin GPS. Marca si hizo
// muchos más o muchos menos km de lo habitual, o si el kilometraje bajó (error de carga).
import { S } from '../state.js';
import { parse, days, fdate } from '../utils.js';
import { isContract } from '../calc.js';
import { isSnoozed } from '../snooze.js';

const MIN_DIAS = 3; // tramos más cortos se juntan con el siguiente, para no comparar ruido
const fmt = n => Math.round(n).toLocaleString('es-AR');

// Tramos entre cargas: { desde, hasta, dias, km, porSemana }.
export function tramosKm(c) {
  const H = (c.kmHistorial || []).filter(h => h.fecha && +h.km > 0).slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || a.km - b.km);
  const out = [];
  let ini = H[0];
  for (let i = 1; i < H.length; i++) {
    const h = H[i];
    if (+h.km < +ini.km) { out.push({ desde: ini, hasta: h, dias: days(parse(ini.fecha), parse(h.fecha)), km: +h.km - +ini.km, baja: true }); ini = h; continue; }
    const d = days(parse(ini.fecha), parse(h.fecha));
    if (d < MIN_DIAS && i < H.length - 1) continue;
    if (d <= 0) continue;
    out.push({ desde: ini, hasta: h, dias: d, km: +h.km - +ini.km, porSemana: (+h.km - +ini.km) / d * 7 });
    ini = h;
  }
  return out;
}
const mediana = L => { const s = L.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function kmRaro(c) {
  const T = tramosKm(c);
  if (!T.length) return null;
  const ult = T[T.length - 1];
  if (ult.baja) return { tipo: 'baja', ult, texto: 'El km bajó de ' + fmt(ult.desde.km) + ' a ' + fmt(ult.hasta.km) + ' (' + fdate(ult.hasta.fecha) + '). ¿Se cargó mal?' };
  if (ult.dias >= 2 && ult.porSemana > 5000) return { tipo: 'salto', ult, texto: 'Hizo ' + fmt(ult.km) + ' km en ' + ult.dias + ' días (' + fmt(ult.porSemana) + ' por semana). ¿Se cargó mal?' };
  const prev = T.slice(0, -1).filter(t => !t.baja && t.porSemana != null).slice(-8);
  if (prev.length < 2 || ult.dias < MIN_DIAS) return null;
  const normal = mediana(prev.map(t => t.porSemana));
  if (normal < 50) return null;
  if (ult.porSemana > normal * 1.8 && ult.porSemana - normal > 300)
    return { tipo: 'mucho', ult, normal, texto: fmt(ult.porSemana) + ' km por semana entre el ' + fdate(ult.desde.fecha) + ' y el ' + fdate(ult.hasta.fecha) + '; lo normal de este auto es ' + fmt(normal) + '.' };
  if (isContract(c) && c.choferId && ult.porSemana < normal * 0.4 && normal - ult.porSemana > 300)
    return { tipo: 'poco', ult, normal, texto: 'Solo ' + fmt(ult.porSemana) + ' km por semana entre el ' + fdate(ult.desde.fecha) + ' y el ' + fdate(ult.hasta.fecha) + '; lo normal de este auto es ' + fmt(normal) + '. ¿Está parado o no anda el odómetro?' };
  return null;
}

const SUB = { baja: 'Km que bajó', salto: 'Km imposible', mucho: 'Muchos más km que lo normal', poco: 'Muchos menos km que lo normal' };
export function alertasKmRaros() {
  return S.cars.filter(c => !c.vendido).map(c => {
    const r = kmRaro(c); if (!r) return null;
    const key = 'kmraro:' + c.id + ':' + r.ult.hasta.fecha;
    if (isSnoozed(key)) return null;
    return { who: c.patente || 'Auto', sub: SUB[r.tipo], kind: 'car', id: c.id, key, d: 8, cls: r.tipo === 'poco' ? 'soft' : 'warn', t: r.texto };
  }).filter(Boolean);
}
