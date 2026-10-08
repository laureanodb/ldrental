import './styles.css';

/* Actualizaciones: cuando el service worker nuevo toma el control, se recarga la
   página para no quedarse con la versión vieja guardada en el celular. Si la
   persona está escribiendo algo, en vez de recargar aparece un botón. */
if ('serviceWorker' in navigator) {
  if (navigator.serviceWorker.controller) {
    let hecho = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hecho) return;
      hecho = true;
      const a = document.activeElement;
      const ocupado = document.querySelector('#modal.open') || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.value);
      if (!ocupado) { location.reload(); return; }
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Hay una versión nueva: tocá para actualizar';
      b.style.cssText = 'position:fixed;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:100;padding:12px;border:0;border-radius:10px;background:var(--btn);color:var(--btn-ink);font:600 15px system-ui,sans-serif';
      b.onclick = () => location.reload();
      document.body.appendChild(b);
    });
  }
  // Buscar versión nueva al volver a la app (si quedó abierta de fondo) y cada hora.
  const buscar = () => navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') buscar(); });
  setInterval(buscar, 3600000);
}

/* Punto de entrada liviano: el portal del chofer y el formulario de postulación
   cargan solo lo suyo, sin bajar la app completa del dueño. */
const portalMatch = location.hash.match(/^#\/portal\/([^/]+)\/([^/]+)/);
if (portalMatch) {
  import('./portal.js').then(m => {
    window.toggleTemaPortal = m.toggleTemaPortal;
    m.initPortal(decodeURIComponent(portalMatch[1]), decodeURIComponent(portalMatch[2]));
  });
} else if (location.hash.match(/^#\/postulacion/)) {
  import('./postulacion.js').then(m => m.initPostulacion());
} else {
  import('./app.js');
}
