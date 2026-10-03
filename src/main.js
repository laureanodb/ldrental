import './styles.css';

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
