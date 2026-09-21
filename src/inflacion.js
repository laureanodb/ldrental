const API_URL = 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion';
let cache = null;

async function obtenerSerie() {
  if (cache) return cache;
  const r = await fetch(API_URL);
  if (!r.ok) throw new Error('el servicio de inflación no respondió');
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error('respuesta inesperada del servicio de inflación');
  cache = data;
  return cache;
}

export async function inflacionAcumulada(desdeISO) {
  const serie = await obtenerSerie();
  const desde = new Date(desdeISO + 'T00:00:00');
  const relevantes = serie.filter(x => x.fecha && new Date(x.fecha + 'T00:00:00') >= desde);
  const factor = relevantes.reduce((a, x) => a * (1 + (+x.valor || 0) / 100), 1);
  return { factor, meses: relevantes.length };
}
