// LD Rental — lectura de documentos con IA (Claude).
// POST { tipo: 'comprobante'|'poliza'|'factura'|'resumen', path?: string, archivo?: dataURL }
// con el token de sesión del usuario de la app (Authorization: Bearer ...).
// Lee el archivo (del bucket de documentos si viene `path`, o el que manda la
// app en base64) y devuelve los datos que encontró:
// - comprobante: monto, fecha, método, quién pagó, n° de operación.
// - poliza: aseguradora, n° de póliza, patente, cobertura, franquicia,
//   vigencia y premio mensual (sirve para póliza, certificado y credencial).
// - factura: proveedor, fecha, total, concepto y categoría de un gasto.
// - resumen: los movimientos de un resumen de Mercado Pago o del banco en PDF.
// No guarda nada: la app muestra lo leído y el usuario confirma.
// Necesita el secreto ANTHROPIC_API_KEY (el mismo que usa el bot).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const BUCKET = Deno.env.get('DOCUMENTOS_BUCKET') || 'documentos';
const IA_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const IA_MODEL = Deno.env.get('IA_MODEL') || 'claude-opus-5-5';
const MAX_BYTES = 15 * 1024 * 1024;
const IMAGENES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function tipoPorExtension(path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' } as Record<string, string>)[ext] || '';
}
function aBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fechaOk = (f: unknown) => (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : '');
const numOk = (n: unknown) => (typeof n === 'number' && isFinite(n) ? Math.round(n * 100) / 100 : 0);
const txtOk = (t: unknown, max = 200) => (typeof t === 'string' ? t.trim().slice(0, max) : '');

const REGLAS = `Sos un asistente de una empresa argentina que alquila y financia autos a choferes de aplicaciones.
Leés documentos (fotos o PDF) y devolvés solo lo que se ve en el documento, sin inventar.
- Fechas en formato AAAA-MM-DD. En Argentina las fechas se escriben día/mes/año (05/03/2026 es 5 de marzo).
- Montos como número, sin símbolos ni separadores de miles: "$ 150.000,50" es 150000.5.
- Si un dato no aparece o no se lee bien, dejá "" en los textos y 0 en los números.`;

const ESQUEMAS: Record<string, { instruccion: string; schema: any; maxTokens: number }> = {
  comprobante: {
    instruccion: 'Es un comprobante de pago (transferencia, Mercado Pago, depósito o recibo). Sacá el monto pagado, la fecha del pago, el medio, quién pagó, a quién y el número de operación. Si no es un comprobante de pago, poné es_comprobante en false.',
    maxTokens: 4000,
    schema: {
      type: 'object',
      properties: {
        es_comprobante: { type: 'boolean' },
        monto: { type: 'number' },
        moneda: { type: 'string', enum: ['ARS', 'USD'] },
        fecha: { type: 'string', description: 'AAAA-MM-DD o ""' },
        metodo: { type: 'string', enum: ['transferencia', 'mercadopago', 'efectivo', 'otro'] },
        pagador: { type: 'string', description: 'Nombre de quien paga' },
        destinatario: { type: 'string', description: 'Nombre de quien recibe' },
        referencia: { type: 'string', description: 'Número de operación o comprobante' },
        observaciones: { type: 'string', description: 'Algo raro que convenga revisar, o ""' },
      },
      required: ['es_comprobante', 'monto', 'moneda', 'fecha', 'metodo', 'pagador', 'destinatario', 'referencia', 'observaciones'],
      additionalProperties: false,
    },
  },
  poliza: {
    instruccion: 'Es un documento de seguro de auto: póliza, certificado de cobertura o credencial / tarjeta de circulación. Sacá la aseguradora, el número de póliza, la patente, la cobertura, la franquicia, la vigencia y el premio (lo que se paga) por mes. Si el premio figura por un período más largo o en cuotas, calculá cuánto es por mes. Cobertura: todo_riesgo (todo riesgo, con o sin franquicia), terceros_completo (terceros completo / premium, incluye robo, incendio, granizo o cristales), terceros_basico (solo responsabilidad civil), o desconocida.',
    maxTokens: 4000,
    schema: {
      type: 'object',
      properties: {
        tipo_documento: { type: 'string', enum: ['poliza', 'certificado', 'credencial', 'otro'] },
        aseguradora: { type: 'string' },
        poliza_numero: { type: 'string' },
        patente: { type: 'string' },
        cobertura: { type: 'string', enum: ['todo_riesgo', 'terceros_completo', 'terceros_basico', 'desconocida'] },
        franquicia: { type: 'number' },
        vigencia_desde: { type: 'string', description: 'AAAA-MM-DD o ""' },
        vigencia_hasta: { type: 'string', description: 'AAAA-MM-DD o ""' },
        premio_mensual: { type: 'number' },
        observaciones: { type: 'string', description: 'Algo que convenga revisar, o ""' },
      },
      required: ['tipo_documento', 'aseguradora', 'poliza_numero', 'patente', 'cobertura', 'franquicia', 'vigencia_desde', 'vigencia_hasta', 'premio_mensual', 'observaciones'],
      additionalProperties: false,
    },
  },
  factura: {
    instruccion: 'Es una factura, ticket o recibo de un gasto de un auto (taller, repuestos, combustible, gomería, seguro, patente, etc.). Sacá el proveedor, su CUIT, la fecha, el número de comprobante, el total pagado, un concepto corto (qué se compró o qué trabajo se hizo, en pocas palabras), la categoría del gasto, la patente y el kilometraje si figuran, y el tipo de comprobante. Categorías: service (mano de obra, service, alineación, gomería, chapa y pintura), repuestos (repuestos, lubricantes, cubiertas, baterías), combustible, seguro, patente (patente o impuesto automotor), multa, siniestro, otro. Si no es un comprobante de un gasto, poné es_factura en false.',
    maxTokens: 4000,
    schema: {
      type: 'object',
      properties: {
        es_factura: { type: 'boolean' },
        proveedor: { type: 'string' },
        cuit: { type: 'string' },
        fecha: { type: 'string', description: 'AAAA-MM-DD o ""' },
        numero: { type: 'string' },
        total: { type: 'number' },
        concepto: { type: 'string' },
        categoria: { type: 'string', enum: ['service', 'repuestos', 'combustible', 'seguro', 'patente', 'multa', 'siniestro', 'otro'] },
        patente: { type: 'string' },
        km: { type: 'number' },
        tipo_comprobante: { type: 'string', enum: ['factura_a', 'factura_b', 'factura_c', 'ticket', 'recibo', 'presupuesto', 'otro'] },
        observaciones: { type: 'string', description: 'Algo que convenga revisar, o ""' },
      },
      required: ['es_factura', 'proveedor', 'cuit', 'fecha', 'numero', 'total', 'concepto', 'categoria', 'patente', 'km', 'tipo_comprobante', 'observaciones'],
      additionalProperties: false,
    },
  },
  resumen: {
    instruccion: 'Es un resumen de cuenta o reporte de actividad de Mercado Pago o de un banco. Listá todos los movimientos en orden, con la fecha, el monto (positivo si entró plata a la cuenta, negativo si salió), la descripción tal como figura (incluí el nombre de quien mandó la plata si aparece) y el número de operación si está.',
    maxTokens: 32000,
    schema: {
      type: 'object',
      properties: {
        movimientos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fecha: { type: 'string', description: 'AAAA-MM-DD' },
              monto: { type: 'number' },
              descripcion: { type: 'string' },
              referencia: { type: 'string' },
            },
            required: ['fecha', 'monto', 'descripcion', 'referencia'],
            additionalProperties: false,
          },
        },
        observaciones: { type: 'string' },
      },
      required: ['movimientos', 'observaciones'],
      additionalProperties: false,
    },
  },
};

function limpiar(tipo: string, d: any) {
  if (tipo === 'comprobante') {
    return {
      esComprobante: Boolean(d.es_comprobante), monto: numOk(d.monto), moneda: d.moneda === 'USD' ? 'USD' : 'ARS', fecha: fechaOk(d.fecha),
      metodo: ['transferencia', 'mercadopago', 'efectivo'].includes(d.metodo) ? d.metodo : 'otro',
      pagador: txtOk(d.pagador), destinatario: txtOk(d.destinatario), referencia: txtOk(d.referencia, 80), observaciones: txtOk(d.observaciones, 300),
    };
  }
  if (tipo === 'poliza') {
    return {
      tipoDocumento: ['poliza', 'certificado', 'credencial'].includes(d.tipo_documento) ? d.tipo_documento : 'otro',
      aseguradora: txtOk(d.aseguradora, 80), polizaNumero: txtOk(d.poliza_numero, 60), patente: txtOk(d.patente, 12).toUpperCase().replace(/[\s-]/g, ''),
      cobertura: ['todo_riesgo', 'terceros_completo', 'terceros_basico'].includes(d.cobertura) ? d.cobertura : '',
      franquicia: numOk(d.franquicia), vigenciaDesde: fechaOk(d.vigencia_desde), vigenciaHasta: fechaOk(d.vigencia_hasta),
      premioMensual: numOk(d.premio_mensual), observaciones: txtOk(d.observaciones, 300),
    };
  }
  if (tipo === 'factura') {
    return {
      esFactura: Boolean(d.es_factura), proveedor: txtOk(d.proveedor, 80), cuit: txtOk(d.cuit, 20).replace(/\D/g, ''), fecha: fechaOk(d.fecha), numero: txtOk(d.numero, 40),
      total: numOk(d.total), concepto: txtOk(d.concepto, 120), categoria: ['service', 'repuestos', 'combustible', 'seguro', 'patente', 'multa', 'siniestro'].includes(d.categoria) ? d.categoria : 'otro',
      patente: txtOk(d.patente, 12).toUpperCase().replace(/[\s-]/g, ''), km: Math.round(numOk(d.km)), tipoComprobante: txtOk(d.tipo_comprobante, 20), observaciones: txtOk(d.observaciones, 300),
    };
  }
  return {
    movimientos: (Array.isArray(d.movimientos) ? d.movimientos : []).map((m: any) => ({ fecha: fechaOk(m.fecha), monto: numOk(m.monto), descripcion: txtOk(m.descripcion), referencia: txtOk(m.referencia, 80) }))
      .filter((m: any) => m.fecha && m.monto),
    observaciones: txtOk(d.observaciones, 300),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método inválido' }, 405);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    // Solo usuarios de la app con sesión y acceso activo.
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await sb.auth.getUser(jwt);
    if (!u || !u.user) return json({ ok: false, error: 'Tenés que iniciar sesión' }, 401);
    const { data: perfil, error: errPerfil } = await sb.from('profiles').select('activo').eq('id', u.user.id).maybeSingle();
    if (!errPerfil && perfil && perfil.activo === false) return json({ ok: false, error: 'Tu usuario no tiene acceso' }, 403);

    if (!IA_KEY) return json({ ok: false, error: 'sin_ia' });
    const body = await req.json().catch(() => ({}));
    const tipo = String(body.tipo || '');
    const esq = ESQUEMAS[tipo];
    if (!esq) return json({ ok: false, error: 'Tipo inválido' }, 400);

    let mediaType = '', datos = '';
    if (body.path) {
      const path = String(body.path);
      const { data: blob, error } = await sb.storage.from(BUCKET).download(path);
      if (error || !blob) return json({ ok: false, error: 'No se encontró el archivo' }, 404);
      if (blob.size > MAX_BYTES) return json({ ok: false, error: 'El archivo es muy pesado para leerlo' }, 400);
      mediaType = IMAGENES.includes(blob.type) || blob.type === 'application/pdf' ? blob.type : tipoPorExtension(path);
      datos = aBase64(new Uint8Array(await blob.arrayBuffer()));
    } else {
      const m = String(body.archivo || '').match(/^data:([\w/+.-]+);base64,(.+)$/);
      if (!m) return json({ ok: false, error: 'Falta el archivo' }, 400);
      mediaType = m[1]; datos = m[2];
      if (datos.length * 0.75 > MAX_BYTES) return json({ ok: false, error: 'El archivo es muy pesado para leerlo' }, 400);
    }
    if (!IMAGENES.includes(mediaType) && mediaType !== 'application/pdf') return json({ ok: false, error: 'Solo se pueden leer fotos (JPG, PNG, WEBP) o PDF' }, 400);

    const adjunto = mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: datos } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: datos } };
    const usaFallback = /^claude-(opus-5|fable-5|sonnet-5-5)/.test(IA_MODEL);
    const params: any = {
      model: IA_MODEL,
      max_tokens: esq.maxTokens,
      system: REGLAS,
      messages: [{ role: 'user', content: [adjunto, { type: 'text', text: esq.instruccion }] }],
      output_config: { format: { type: 'json_schema', schema: esq.schema } },
    };
    if (!IA_MODEL.includes('haiku')) params.output_config.effort = 'low';
    if (usaFallback) { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }

    const ia = new Anthropic({ apiKey: IA_KEY });
    let r: any;
    try {
      r = usaFallback ? await ia.beta.messages.stream(params).finalMessage() : await ia.messages.stream(params).finalMessage();
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) return json({ ok: false, error: 'La clave ANTHROPIC_API_KEY no es válida' });
      if (e instanceof Anthropic.RateLimitError) return json({ ok: false, error: 'Se alcanzó el límite de uso de la IA, probá en un rato' });
      if (e instanceof Anthropic.APIError) return json({ ok: false, error: 'La IA respondió con un error (' + e.status + ')' });
      throw e;
    }
    if (r.stop_reason === 'refusal') return json({ ok: false, error: 'La IA no pudo leer este documento' });
    if (r.stop_reason === 'max_tokens') return json({ ok: false, error: 'El documento es muy largo para leerlo de una vez' });
    const texto = (r.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    let d: any;
    try { d = JSON.parse(texto); } catch (e) { return json({ ok: false, error: 'No se pudo interpretar la respuesta de la IA' }); }
    return json({ ok: true, datos: limpiar(tipo, d) });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
