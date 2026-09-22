import { googleFetch } from './google.js';
import { S } from './state.js';
import { COLS } from './constants.js';
import { iso, today } from './utils.js';
import { toast } from './modal.js';

const FOLDER_KEY = 'flota-drive-folder-id';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

async function obtenerCarpeta() {
  let id = null;
  try { id = localStorage.getItem(FOLDER_KEY); } catch (e) {}
  if (id) {
    try { await googleFetch(DRIVE_FILES + '/' + id + '?fields=id'); return id; } catch (e) { /* ya no existe, se crea otra */ }
  }
  const creada = await googleFetch(DRIVE_FILES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'LD Rental — Backups', mimeType: 'application/vnd.google-apps.folder' }),
  });
  try { localStorage.setItem(FOLDER_KEY, creada.id); } catch (e) {}
  return creada.id;
}

async function subirArchivo(folderId, filename, jsonString) {
  const boundary = 'flota_boundary_' + Date.now();
  const metadata = { name: filename, parents: [folderId], mimeType: 'application/json' };
  const body =
    '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: application/json\r\n\r\n' +
    jsonString + '\r\n' +
    '--' + boundary + '--';
  return googleFetch(DRIVE_UPLOAD + '?uploadType=multipart', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body,
  });
}

export async function syncDriveUI() {
  try {
    const folderId = await obtenerCarpeta();
    const data = { app: 'mi-flota', version: 1, fecha: new Date().toISOString() };
    COLS.forEach(c => { data[c] = S[c]; });
    const filename = 'copia-flota-' + iso(today()) + '.json';
    await subirArchivo(folderId, filename, JSON.stringify(data));
    toast('Backup subido a Drive: ' + filename);
  } catch (e) {
    toast('No se pudo subir a Drive: ' + e.message);
  }
}
