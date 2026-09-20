import { BUCKET } from './config.js';
import { sb } from './state.js';
import { uid } from './utils.js';

export function makeStorage() {
  const B = () => sb.storage.from(BUCKET);
  return {
    async upload(blob) {
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' }[blob.type] || 'bin';
      const path = new Date().getFullYear() + '/' + uid() + uid() + '.' + ext;
      const r = await B().upload(path, blob, { contentType: blob.type, upsert: false });
      if (r.error) { throw new Error(r.error.message || 'error'); }
      return { id: path, contentType: blob.type, sizeBytes: blob.size };
    },
    async delete(path) { const r = await B().remove([path]); if (r.error) throw r.error; return { deleted: true }; }
  };
}

export function hydrateThumbs(root) {
  root.querySelectorAll('img[data-path]').forEach(async img => {
    try { const r = await sb.storage.from(BUCKET).createSignedUrl(img.dataset.path, 3600); if (r.data && r.data.signedUrl) img.src = r.data.signedUrl; } catch (e) {}
  });
}
