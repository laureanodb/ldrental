export const TIPOS = { alquiler: 'Alquilado', financiado: 'Financiado', disponible: 'Disponible', taller: 'En taller' };
export const DOCS = [['dni', 'DNI (frente y dorso)'], ['lic', 'Licencia profesional'], ['dom', 'Comprobante de domicilio'], ['ant', 'Certificado de antecedentes'], ['app', 'Alta en la app (Uber, Cabify, etc.)'], ['contrato', 'Contrato firmado'], ['garante', 'Garante / aval']];
export const VENC = [['vtv', 'VTV'], ['seguro', 'Seguro'], ['impuesto', 'Impuesto automotor (fecha de vencimiento)'], ['cedula', 'Cédula / tarjeta']];
export const COLS = ['cars', 'drivers', 'payments'];

export function normCar(c) {
  /* corrige autos guardados con un bug anterior: la patente quedó reemplazada por una fecha */
  if (/^\d{4}-\d{2}-\d{2}$/.test(c.patente || '')) { if (!c.impuesto) c.impuesto = c.patente; c.patente = ''; }
  return c;
}

export const DCATS = [...DOCS.map(x => [x[0], x[1].replace(/ \(.*\)/, '')]), ['otro', 'Otro']];
export const CCATS = [['cedula', 'Cédula / tarjeta'], ['titulo', 'Título / boleto de compra'], ['seguro', 'Póliza de seguro'], ['vtv', 'VTV'], ['patente', 'Comprobante de impuesto automotor'], ['contrato', 'Contrato'], ['fotos', 'Fotos del auto'], ['otro', 'Otro']];
export const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
