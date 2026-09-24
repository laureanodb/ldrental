export const TIPOS = { alquiler: 'Alquilado', financiado: 'Financiado', disponible: 'Disponible', taller: 'En taller' };
export const DOCS = [['dni', 'DNI (frente y dorso)'], ['lic', 'Licencia profesional'], ['dom', 'Comprobante de domicilio'], ['ant', 'Certificado de antecedentes'], ['app', 'Alta en la app (Uber, Cabify, etc.)'], ['contrato', 'Contrato firmado'], ['garante', 'Garante / aval']];
export const VENC = [['vtv', 'VTV'], ['seguro', 'Seguro'], ['impuesto', 'Impuesto automotor (fecha de vencimiento)'], ['cedula', 'Cédula / tarjeta'], ['gncOblea', 'Oblea GNC'], ['gncHidraulica', 'Prueba hidráulica GNC'], ['habilitacion', 'Licencia / habilitación de transporte']];
export const COLS = ['cars', 'drivers', 'payments', 'gastos', 'proveedores', 'sanciones', 'prospectos', 'inspecciones', 'mantenimientos', 'multas', 'depositos', 'siniestros', 'gastosrecurrentes', 'recordatorios'];

export const CHANGELOG = [
  { v: '2026-09-24', items: [
    'Marcá autos y choferes como favoritos para tenerlos siempre arriba de la lista.',
    'Nuevo: recordatorios de tareas manuales, con aviso en Vencimientos.',
    'Panel personalizable: elegí qué indicadores ver primero desde Ajustes.',
    'Nueva calculadora rápida: financiar vs. alquilar.',
    'Autos: registro de neumáticos, accesorios con garantía y QR para reportar problemas.',
    'Alerta cuando un auto queda disponible mucho tiempo sin asignar.',
  ] },
];

export const ASEGURADORAS = ['Allianz', 'Sancor', 'Mercantil', 'Fed. Pat.', 'Zurich', 'Nación', 'Rivadavia', 'Provincia', 'Mapfre', 'Holando', 'Otro'];
export const COMBUSTIBLES = [['nafta', 'Nafta'], ['diesel', 'Diésel'], ['gnc', 'GNC'], ['electrico', 'Eléctrico'], ['hibrido', 'Híbrido']];
export const RATINGS = [['bueno', 'Cumplidor'], ['regular', 'Regular'], ['malo', 'Problemático']];
export const METODOS_PAGO = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['mercadopago', 'MercadoPago'], ['otro', 'Otro']];
export const GASTO_CATS = [['service', 'Service / mantenimiento'], ['siniestro', 'Siniestro / choque'], ['multa', 'Multa'], ['combustible', 'Combustible'], ['seguro', 'Seguro (cuota)'], ['patente', 'Patente / impuesto automotor'], ['otro', 'Otro gasto']];
export const MOTIVOS_REEMPLAZO = [['km', 'Mucho kilometraje'], ['gasto', 'Mucho gasto de mantenimiento'], ['antiguedad', 'Muy viejo'], ['otro', 'Otro motivo']];
export const INSPECCION_ITEMS = [['carroceria', 'Carrocería sin daños nuevos'], ['limpieza', 'Interior limpio'], ['neumaticos', 'Neumáticos en buen estado'], ['documentos', 'Documentos en el auto'], ['auxilio', 'Rueda de auxilio y herramientas']];

/* Catálogo de mantenimiento: [clave, etiqueta, intervalo en km u null, intervalo en meses u null] */
export const MANTENIMIENTO_ITEMS = [
  ['aceite', 'Aceite y filtro de aceite', 10000, 6],
  ['filtroAire', 'Filtro de aire', 15000, 12],
  ['filtroHabitaculo', 'Filtro de habitáculo', 15000, 12],
  ['frenos', 'Frenos (pastillas y discos)', 20000, 12],
  ['bateria', 'Batería', null, 24],
  ['correaDistribucion', 'Correa de distribución/repartición', 60000, 48],
  ['liquidoRefrigerante', 'Líquido refrigerante', 40000, 24],
  ['liquidoFrenos', 'Líquido de frenos', 40000, 24],
  ['bujias', 'Bujías', 40000, 24],
  ['alineacion', 'Alineación y balanceo', 10000, 6],
  ['neumaticos', 'Neumáticos', 40000, 36],
  ['matafuegos', 'Matafuegos (vencimiento)', null, 12],
];
export const MANTENIMIENTO_CHECKLIST = [['revisado', 'Se revisó el ítem completo'], ['piezaOriginal', 'Repuesto original / de marca'], ['pruebaRuta', 'Prueba de ruta luego del trabajo']];

export const TIPOS_INFRACCION = [['velocidad', 'Exceso de velocidad'], ['estacionamiento', 'Estacionamiento indebido'], ['semaforo', 'Semáforo en rojo'], ['documentacion', 'Documentación / VTV / seguro'], ['carril', 'Carril exclusivo / mal uso de carril'], ['telefono', 'Uso de celular al conducir'], ['otro', 'Otra infracción']];
export const MULTA_ESTADOS = [['pendiente', 'Pendiente de pago'], ['pagada', 'Pagada'], ['vencida', 'Vencida'], ['apelada', 'En descargo / apelada']];
export const PUNTOS_INFRACCION_DEFAULT = { velocidad: 5, estacionamiento: 1, semaforo: 7, documentacion: 3, carril: 2, telefono: 4, otro: 2 };
export const RESULTADO_DESCARGO = [['', 'Sin resolver'], ['rechazado', 'Rechazado (se debe pagar)'], ['aceptado', 'Aceptado (se anula)']];

export const TIPOS_SINIESTRO = [['choque', 'Choque'], ['robo', 'Robo'], ['incendio', 'Incendio'], ['granizo', 'Granizo'], ['vandalismo', 'Vandalismo'], ['otro', 'Otro']];
export const SINIESTRO_ESTADOS = [['abierto', 'Abierto'], ['tramite', 'En trámite con el seguro'], ['cerrado', 'Cerrado']];
export const RESPONSABLE_SINIESTRO = [['', 'Sin determinar'], ['chofer', 'Chofer'], ['tercero', 'Tercero'], ['compartida', 'Responsabilidad compartida']];
export const SCATS = [['foto', 'Foto del siniestro'], ['parte', 'Parte / denuncia policial'], ['presupuesto', 'Presupuesto de reparación'], ['comprobante', 'Comprobante de pago'], ['otro', 'Otro']];

export const ETAPAS_PROSPECTO = [['contacto', 'Contacto inicial'], ['entrevista', 'Entrevista'], ['documentacion', 'Juntando documentación'], ['evaluacion', 'En evaluación'], ['aprobado', 'Aprobado'], ['rechazado', 'Rechazado']];
export const CANALES_PROSPECTO = [['redes', 'Instagram / Facebook'], ['referido', 'Boca a boca / referido'], ['whatsapp', 'WhatsApp / grupo'], ['otro', 'Otro']];
export const ONBOARDING_ITEMS = [['contrato', 'Contrato firmado'], ['induccion', 'Inducción / capacitación realizada'], ['entregaAuto', 'Auto entregado con inspección'], ['appActivada', 'Alta en la app de viajes activada'], ['depositoInicial', 'Primer pago de depósito recibido']];

export function normCar(c) {
  /* corrige autos guardados con un bug anterior: la patente quedó reemplazada por una fecha */
  if (/^\d{4}-\d{2}-\d{2}$/.test(c.patente || '')) { if (!c.impuesto) c.impuesto = c.patente; c.patente = ''; }
  return c;
}

export const DCATS = [...DOCS.map(x => [x[0], x[1].replace(/ \(.*\)/, '')]), ['otro', 'Otro']];
export const CCATS = [['cedula', 'Cédula / tarjeta'], ['titulo', 'Título / boleto de compra'], ['seguro', 'Póliza de seguro'], ['vtv', 'VTV'], ['patente', 'Comprobante de impuesto automotor'], ['contrato', 'Contrato'], ['fotos', 'Fotos del auto'], ['otro', 'Otro']];
export const MCATS = [['factura', 'Factura del taller'], ['foto', 'Foto del trabajo'], ['otro', 'Otro']];
export const TCATS = [['acta', 'Foto del acta/infracción'], ['comprobante', 'Comprobante de pago'], ['otro', 'Otro']];
export const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

export const TRANSMISIONES = [['manual', 'Manual'], ['automatica', 'Automática']];
export const COBERTURAS_SEGURO = [['todo_riesgo', 'Todo riesgo'], ['terceros_completo', 'Terceros completo'], ['terceros_basico', 'Terceros básico']];
export const ELEMENTOS_SEGURIDAD = [['matafuegos', 'Matafuegos'], ['baliza', 'Baliza'], ['botiquin', 'Botiquín'], ['cinturones', 'Cinturones de seguridad']];

export const PANEL_KPIS = [
  ['cobrado', 'Cobrado este mes'], ['esperado', 'Esperado por semana'], ['deuda', 'Deuda de choferes'],
  ['saldoFin', 'Falta cobrar de financiados'], ['autosCalle', 'Autos en la calle'],
  ['vencUrgentes', 'Vencimientos urgentes'], ['autosDisponibles', 'Autos disponibles'],
];
