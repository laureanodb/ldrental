import { googleFetch } from './google.js';
import { alerts } from './calc.js';
import { toast } from './modal.js';
import { today, iso } from './utils.js';

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export async function syncCalendarUI() {
  const A = alerts();
  if (!A.length) { toast('No hay vencimientos para sincronizar'); return; }
  toast('Sincronizando ' + A.length + ' vencimientos con Calendar…');
  let creados = 0, actualizados = 0, fallidos = 0;
  for (const a of A) {
    try {
      const d = today(); d.setDate(d.getDate() + a.d);
      const fecha = iso(d);
      const buscar = new URL(EVENTS_URL);
      buscar.searchParams.set('privateExtendedProperty', 'flotaKey=' + a.key);
      buscar.searchParams.set('maxResults', '1');
      const found = await googleFetch(buscar.toString());
      const body = JSON.stringify({
        summary: 'Vencimiento: ' + a.who + ' — ' + a.sub,
        start: { date: fecha },
        end: { date: fecha },
        extendedProperties: { private: { flotaKey: a.key } },
      });
      if (found && found.items && found.items.length) {
        await googleFetch(EVENTS_URL + '/' + found.items[0].id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
        actualizados++;
      } else {
        await googleFetch(EVENTS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        creados++;
      }
    } catch (e) { fallidos++; }
  }
  toast('Calendar: ' + creados + ' nuevos, ' + actualizados + ' actualizados' + (fallidos ? ', ' + fallidos + ' con error' : ''));
}
