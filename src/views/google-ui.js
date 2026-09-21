import { googleConfigured, isGoogleConnected, conectarGoogle } from '../google.js';
import { toast } from '../modal.js';
import { render } from '../nav.js';

export function googleCard() {
  if (!googleConfigured()) {
    return '<h2>Google</h2><div class="card small muted">Para conectar Calendar, Sheets y Drive, configurá VITE_GOOGLE_CLIENT_ID en las variables de entorno.</div>';
  }
  const conectado = isGoogleConnected();
  let h = '<h2>Google</h2><div class="card">';
  h += '<div class="row between"><span>' + (conectado ? 'Conectado' : 'Sin conectar') + '</span>' + (conectado ? '' : '<button class="btn sec sm" onclick="conectarGoogleUI()">Conectar con Google</button>') + '</div>';
  if (conectado) {
    h += '<div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px">' +
      '<button class="btn sec sm" onclick="syncCalendarUI()">Sincronizar vencimientos</button>' +
      '<button class="btn sec sm" onclick="syncSheetsUI()">Exportar cobros a Sheets</button>' +
      '<button class="btn sec sm" onclick="syncMultasSheetsUI()">Exportar multas a Sheets</button>' +
      '<button class="btn sec sm" onclick="syncDriveUI()">Backup a Drive</button>' +
      '</div>';
  }
  h += '</div>';
  return h;
}
export async function conectarGoogleUI() {
  const ok = await conectarGoogle();
  if (ok) render();
}
