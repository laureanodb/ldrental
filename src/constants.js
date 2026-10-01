export const TIPOS = { alquiler: 'Alquilado', financiado: 'Financiado', disponible: 'Disponible', taller: 'En taller' };
export const DOCS = [['dni', 'DNI (frente y dorso)'], ['lic', 'Licencia profesional'], ['dom', 'Comprobante de domicilio'], ['ant', 'Certificado de antecedentes'], ['app', 'Alta en la app (Uber, Cabify, etc.)'], ['contrato', 'Contrato firmado'], ['garante', 'Garante / aval']];
export const VENC = [['vtv', 'VTV'], ['seguro', 'Seguro'], ['impuesto', 'Impuesto automotor (fecha de vencimiento)'], ['cedula', 'Cédula / tarjeta'], ['gncOblea', 'Oblea GNC'], ['gncHidraulica', 'Prueba hidráulica GNC'], ['habilitacion', 'Licencia / habilitación de transporte']];
export const COLS = ['cars', 'drivers', 'payments', 'gastos', 'proveedores', 'sanciones', 'prospectos', 'inspecciones', 'mantenimientos', 'multas', 'depositos', 'siniestros', 'gastosrecurrentes', 'recordatorios', 'encuestas', 'repuestos'];

export const CHANGELOG = [
  { v: '2026-10-01b', items: [
    'Dólar del día: la deuda de los financiados se ve también en pesos, y al cobrar una cuota que te pagan en pesos la app la pasa a dólares. Se configura en Ajustes.',
    'Portal del chofer: "Cómo pagar" con tu alias y CBU para copiar y el monto que tiene que pagar esa semana (en dólares y en pesos).',
    'Gastos y mantenimiento: sacale una foto a la factura o el ticket y la IA carga monto, fecha, proveedor y concepto. La factura queda adjunta.',
  ] },
  { v: '2026-10-01', items: [
    'Cuenta corriente del chofer (ficha → Financiación): todos los cargos y pagos con el saldo, deuda total en pesos y en dólares, y PDF.',
    'Plan de pagos: repartí la deuda en cuotas semanales y la app avisa si el chofer se atrasa. El chofer también lo ve en su portal.',
    'Firma del contrato desde el portal: mandalo a firmar y el chofer lo lee y firma desde el celular. Después descargás el PDF firmado.',
    'Entrega y devolución con fotos guiadas (frente, laterales, interior, tablero, baúl) y comparación lado a lado con la entrega.',
    'Portal del chofer: ve cuándo vencen su licencia y antecedentes y sube la nueva. Vos la revisás y actualizás la fecha con un toque.',
  ] },
  { v: '2026-09-30', items: [
    'Registrar cobro: subí la foto o el PDF del comprobante y la IA completa monto, fecha y método. Avisa si el comprobante ya se usó o si lo pagó otra persona.',
    'Solapa Seguro: al subir la póliza o el certificado, la IA completa aseguradora, n° de póliza, cobertura, vencimiento y monto mensual. Avisa si la patente no coincide.',
    'Renovación del seguro: cuánto pagaste en el último año, cotizaciones para comparar (se pueden leer con IA) y aviso 30 días antes del vencimiento.',
    'Cruce con Mercado Pago o el banco (en Más): subí el resumen y ves qué cobros entraron, cuáles faltan registrar y cuáles no aparecen.',
    'Portal del chofer: puede descargar la credencial de circulación y el certificado del seguro.',
  ] },
  { v: '2026-09-25', items: [
    'Fondo de autoseguro: registrá aportes y pagos de siniestros, con comparación contra una aseguradora externa.',
    'Adelantos y devoluciones a choferes, con vínculo opcional a una cuota de financiación.',
    'Socios inversores por auto: reparto automático de la rentabilidad neta acumulada.',
    'Desafíos del mes: ahora podés tener varios activos a la vez (puntualidad, sin siniestros, sin multas, satisfacción).',
    'Contratos: quedan guardados en PDF y podés renovarlos cuando vencen.',
    'Botón flotante configurable en Ajustes: elegí tus 3 accesos rápidos favoritos.',
    'Búsqueda: los filtros inteligentes que más usás quedan a un toque de distancia.',
    'Flujo de caja: ahora se puede ver por auto y en dólares para los financiados.',
  ] },
  { v: '2026-09-24', items: [
    'Marcá autos y choferes como favoritos para tenerlos siempre arriba de la lista.',
    'Nuevo: recordatorios de tareas manuales, con aviso en Vencimientos.',
    'Panel personalizable: elegí qué indicadores ver primero desde Ajustes.',
    'Nueva calculadora rápida: financiar vs. alquilar.',
    'Autos: registro de neumáticos, accesorios con garantía y QR para reportar problemas.',
    'Alerta cuando un auto queda disponible mucho tiempo sin asignar.',
  ] },
];

export const FEATURES_TOGGLEABLES = [
  ['autoseguro', 'Fondo de autoseguro'],
  ['socios', 'Socios inversores'],
  ['adelantos', 'Adelantos a choferes'],
  ['desafios', 'Desafíos del mes'],
  ['fab', 'Botón flotante de acceso rápido'],
];
export const ASEGURADORAS =['Allianz', 'Sancor', 'Mercantil', 'Fed. Pat.', 'Zurich', 'Nación', 'Rivadavia', 'Provincia', 'Mapfre', 'Holando', 'Otro'];
export const COMBUSTIBLES = [['nafta', 'Nafta'], ['diesel', 'Diésel'], ['gnc', 'GNC'], ['electrico', 'Eléctrico'], ['hibrido', 'Híbrido']];
export const RATINGS = [['bueno', 'Cumplidor'], ['regular', 'Regular'], ['malo', 'Problemático']];
export const METODOS_PAGO = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['mercadopago', 'MercadoPago'], ['credito', 'Tarjeta de crédito'], ['otro', 'Otro']];
export const GASTO_CATS = [['service', 'Service / mantenimiento'], ['siniestro', 'Siniestro / choque'], ['multa', 'Multa'], ['combustible', 'Combustible'], ['seguro', 'Seguro (cuota)'], ['patente', 'Patente / impuesto automotor'], ['repuestos', 'Repuestos y consumibles'], ['otro', 'Otro gasto']];
export const STOCK_CATEGORIAS = [['aceite', 'Aceite'], ['filtros', 'Filtros'], ['bujias', 'Bujías'], ['frenos', 'Frenos (pastillas, discos)'], ['neumaticos', 'Neumáticos'], ['bateria', 'Batería'], ['liquidos', 'Líquidos (freno, refrigerante)'], ['correas', 'Correas / cadenas'], ['otro', 'Otro']];
export const STOCK_UNIDADES = [['unidad', 'Unidad'], ['litro', 'Litro'], ['kg', 'Kilogramo'], ['juego', 'Juego']];
export const MOTIVOS_REEMPLAZO = [['km', 'Mucho kilometraje'], ['gasto', 'Mucho gasto de mantenimiento'], ['antiguedad', 'Muy viejo'], ['otro', 'Otro motivo']];
// Fotos guiadas de la entrega y la devolución, en el orden en que se recorre el auto.
export const PASOS_FOTOS = [['frente', 'Frente'], ['izquierdo', 'Lado izquierdo'], ['trasera', 'Trasera'], ['derecho', 'Lado derecho'], ['interiorDel', 'Interior adelante'], ['interiorTras', 'Interior atrás'], ['tablero', 'Tablero (km y nafta)'], ['baul', 'Baúl y rueda de auxilio']];
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
export const CCATS = [['cedula', 'Cédula / tarjeta'], ['titulo', 'Título / boleto de compra'], ['seguro', 'Póliza de seguro'], ['seguroCredencial', 'Credencial de circulación del seguro'], ['seguroCertificado', 'Certificado de cobertura del seguro'], ['vtv', 'VTV'], ['patente', 'Comprobante de impuesto automotor'], ['contrato', 'Contrato'], ['manual', 'Manual del auto'], ['fotos', 'Fotos del auto'], ['otro', 'Otro']];
export const MCATS = [['factura', 'Factura del taller'], ['foto', 'Foto del trabajo'], ['otro', 'Otro']];
export const TCATS = [['acta', 'Foto del acta/infracción'], ['comprobante', 'Comprobante de pago'], ['otro', 'Otro']];
export const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

export const RECLAMO_SEGURO_ESTADOS = [['pendiente', 'Pendiente de presentar'], ['presentado', 'Presentado a la aseguradora'], ['aprobado', 'Aprobado'], ['rechazado', 'Rechazado']];
export const COMUNICACION_TIPOS = [['llamada', 'Llamada'], ['mensaje', 'Mensaje / WhatsApp'], ['reunion', 'Reunión presencial'], ['otro', 'Otro']];
export const CUMPLIMIENTO_NORMATIVO_ITEMS = [['vtv', 'VTV vigente'], ['seguro', 'Seguro vigente'], ['habilitacion', 'Habilitación de transporte tramitada'], ['cedula', 'Cédula verde/azul al día'], ['titulo', 'Título de propiedad en regla']];
export const TRANSMISIONES = [['manual', 'Manual'], ['automatica', 'Automática']];
export const COBERTURAS_SEGURO = [['todo_riesgo', 'Todo riesgo'], ['terceros_completo', 'Terceros completo'], ['terceros_basico', 'Terceros básico']];
export const ELEMENTOS_SEGURIDAD = [['matafuegos', 'Matafuegos'], ['baliza', 'Baliza'], ['botiquin', 'Botiquín'], ['cinturones', 'Cinturones de seguridad']];

export const PANEL_KPIS = [
  ['cobrado', 'Cobrado este mes'], ['esperado', 'Esperado por semana'], ['deuda', 'Deuda de choferes'],
  ['saldoFin', 'Falta cobrar de financiados'], ['autosCalle', 'Autos en la calle'],
  ['vencUrgentes', 'Vencimientos urgentes'], ['autosDisponibles', 'Autos disponibles'],
  ['gastosFijos', 'Gastos fijos mensuales (seguro/patente)'],
];
