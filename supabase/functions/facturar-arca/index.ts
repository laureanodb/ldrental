// LD Rental — facturación electrónica con ARCA (ex AFIP): web services WSAA + WSFEv1.
//
// Todo se configura desde la app (Más → Facturación electrónica), sin comandos:
//   1. accion 'generar_csr': crea la clave privada (queda guardada acá, nunca sale) y
//      devuelve el pedido de certificado (CSR) para pegar en la web de ARCA.
//   2. accion 'guardar_certificado': guarda el certificado que da ARCA.
//   3. accion 'estado': prueba la conexión y trae el último número emitido.
//   4. accion 'facturar' { paymentId }: emite la factura de un cobro y la guarda en el cobro.
//
// La clave, el certificado y el ticket de acceso se guardan en la tabla arca_config, que
// no se puede leer desde la app (solo con la clave de servicio de esta función).
// Por defecto trabaja en HOMOLOGACIÓN (pruebas). Producción: ajuste "modo" en la app.
import { createClient } from 'npm:@supabase/supabase-js@2';
import forge from 'npm:node-forge@1.3.1';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const URLS = {
  homologacion: { wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms', wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx' },
  produccion: { wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms', wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx' },
};
type Modo = keyof typeof URLS;
const fechaAR = (d = new Date()) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const aaaammdd = (iso: string) => iso.replace(/-/g, '').slice(0, 8);
const xmlEsc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const desEsc = (s: string) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (xml: string, t: string) => { const m = new RegExp('<(?:\\w+:)?' + t + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?' + t + '>').exec(xml); return m ? m[1].trim() : ''; };
const tags = (xml: string, t: string) => [...xml.matchAll(new RegExp('<(?:\\w+:)?' + t + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?' + t + '>', 'g'))].map(m => m[1]);
const soloDig = (s: unknown) => String(s || '').replace(/\D/g, '');
const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Configuración guardada ----------
async function leerCfg(sb: any, id: string) {
  const r = await sb.from('arca_config').select('data').eq('id', id).maybeSingle();
  if (r.error) throw new Error('Falta crear la tabla arca_config (sql/fase_profesional.sql).');
  return (r.data && r.data.data) || null;
}
async function guardarCfg(sb: any, id: string, data: unknown) {
  const r = await sb.from('arca_config').upsert({ id, data, updated_at: new Date().toISOString() });
  if (r.error) throw new Error(r.error.message);
}

// ---------- WSAA: ticket de acceso ----------
function firmarTRA(tra: string, certPem: string, keyPem: string) {
  const cert = forge.pki.certificateFromPem(certPem), key = forge.pki.privateKeyFromPem(keyPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, 'utf8');
  p7.addCertificate(cert);
  p7.addSigner({
    key, certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: new Date() as any }],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}
async function ticket(sb: any, modo: Modo, cred: any) {
  const ta = await leerCfg(sb, 'ta-' + modo);
  if (ta && ta.token && new Date(ta.vence).getTime() - Date.now() > 10 * 60000) return ta;
  const ahora = Date.now();
  const tra = '<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>' + Math.floor(ahora / 1000) + '</uniqueId>' +
    '<generationTime>' + new Date(ahora - 10 * 60000).toISOString() + '</generationTime><expirationTime>' + new Date(ahora + 10 * 60000).toISOString() + '</expirationTime></header><service>wsfe</service></loginTicketRequest>';
  const cms = firmarTRA(tra, cred.certificado, cred.clave);
  const body = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>' + cms + '</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>';
  const r = await fetch(URLS[modo].wsaa, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' }, body });
  const txt = await r.text();
  if (!r.ok) {
    const f = tag(txt, 'faultstring');
    // ARCA no da un ticket nuevo si ya hay uno vigente: usar el guardado aunque falte poco.
    if (/ya posee un TA valido/i.test(f) && ta && ta.token && new Date(ta.vence).getTime() > Date.now()) return ta;
    throw new Error('ARCA (acceso): ' + (f || 'error ' + r.status));
  }
  const resp = desEsc(tag(txt, 'loginCmsReturn'));
  const nuevo = { token: tag(resp, 'token'), sign: tag(resp, 'sign'), vence: tag(resp, 'expirationTime') };
  if (!nuevo.token) throw new Error('ARCA no devolvió el ticket de acceso.');
  await guardarCfg(sb, 'ta-' + modo, nuevo);
  return nuevo;
}

// ---------- WSFEv1 ----------
async function wsfe(modo: Modo, metodo: string, cuerpo: string) {
  const body = '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soap:Body><ar:' + metodo + '>' + cuerpo + '</ar:' + metodo + '></soap:Body></soap:Envelope>';
  const r = await fetch(URLS[modo].wsfe, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: 'http://ar.gov.afip.dif.FEV1/' + metodo }, body });
  const txt = await r.text();
  if (!r.ok) throw new Error('ARCA (facturación): ' + (tag(txt, 'faultstring') || 'error ' + r.status));
  return txt;
}
const auth = (ta: any, cuit: string) => '<ar:Auth><ar:Token>' + ta.token + '</ar:Token><ar:Sign>' + ta.sign + '</ar:Sign><ar:Cuit>' + cuit + '</ar:Cuit></ar:Auth>';
const errores = (xml: string) => tags(xml, 'Err').map(e => tag(e, 'Code') + ': ' + desEsc(tag(e, 'Msg'))).concat(tags(xml, 'Obs').map(o => tag(o, 'Code') + ': ' + desEsc(tag(o, 'Msg'))));

async function ultimoNumero(modo: Modo, ta: any, cuit: string, ptoVta: number, tipo: number) {
  const x = await wsfe(modo, 'FECompUltimoAutorizado', auth(ta, cuit) + '<ar:PtoVta>' + ptoVta + '</ar:PtoVta><ar:CbteTipo>' + tipo + '</ar:CbteTipo>');
  const errs = errores(tag(x, 'Errors'));
  if (errs.length) throw new Error('ARCA: ' + errs.join(' · '));
  return +tag(x, 'CbteNro') || 0;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    // Solo administradores y supervisores con sesión.
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await sb.auth.getUser(jwt);
    if (!u || !u.user) return json({ ok: false, error: 'Tenés que iniciar sesión' }, 401);
    const { data: yo } = await sb.from('profiles').select('rol,activo').eq('id', u.user.id).maybeSingle();
    if (yo && (yo.activo === false || !['admin', 'supervisor'].includes(yo.rol))) return json({ ok: false, error: 'Tu usuario no puede facturar' }, 403);
    const esAdmin = !yo || yo.rol === 'admin';

    const body = await req.json().catch(() => ({}));
    const accion = String(body.accion || '');
    const cuit = soloDig(body.cuit);
    const modo: Modo = body.modo === 'produccion' ? 'produccion' : 'homologacion';

    if (accion === 'generar_csr') {
      if (!esAdmin) return json({ ok: false, error: 'Solo el administrador' }, 403);
      if (cuit.length !== 11) return json({ ok: false, error: 'Falta el CUIT de la empresa (11 números)' }, 400);
      // Clave RSA 2048 con la criptografía nativa (rápida) y pedido de certificado con forge.
      const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
      const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', par.privateKey));
      const der = forge.util.binary.raw.encode(pkcs8);
      const priv = forge.pki.privateKeyFromAsn1(forge.asn1.fromDer(der)) as forge.pki.rsa.PrivateKey; // acepta el formato PKCS#8
      const pub = forge.pki.setRsaPublicKey(priv.n, priv.e);
      const csr = forge.pki.createCertificationRequest();
      csr.publicKey = pub;
      const nombre = String(body.nombre || 'ldrental').replace(/[^A-Za-z0-9 ]/g, '').slice(0, 40) || 'ldrental';
      csr.setSubject([{ name: 'countryName', value: 'AR' }, { name: 'organizationName', value: nombre }, { name: 'commonName', value: 'ldrental' }, { type: '2.5.4.5', value: 'CUIT ' + cuit }]);
      csr.sign(priv, forge.md.sha256.create());
      const ant = (await leerCfg(sb, 'credenciales-' + modo)) || {};
      await guardarCfg(sb, 'credenciales-' + modo, { ...ant, clave: forge.pki.privateKeyToPem(priv), certificado: '', cuit, csrCreado: new Date().toISOString() });
      return json({ ok: true, csr: forge.pki.certificationRequestToPem(csr) });
    }

    const cred = await leerCfg(sb, 'credenciales-' + modo);

    if (accion === 'guardar_certificado') {
      if (!esAdmin) return json({ ok: false, error: 'Solo el administrador' }, 403);
      if (!cred || !cred.clave) return json({ ok: false, error: 'Primero generá el pedido de certificado (paso 1).' }, 400);
      const pem = String(body.certificado || '').trim();
      let cert;
      try { cert = forge.pki.certificateFromPem(pem); } catch (_) { return json({ ok: false, error: 'Eso no parece un certificado. Pegá el texto completo, desde -----BEGIN CERTIFICATE-----.' }, 400); }
      const priv = forge.pki.privateKeyFromPem(cred.clave);
      if ((cert.publicKey as any).n.compareTo(priv.n) !== 0) return json({ ok: false, error: 'Ese certificado no corresponde al último pedido generado acá. Generá uno nuevo o subí el certificado correcto.' }, 400);
      await guardarCfg(sb, 'credenciales-' + modo, { ...cred, certificado: pem, vence: cert.validity.notAfter.toISOString() });
      await guardarCfg(sb, 'ta-' + modo, {});
      return json({ ok: true, vence: cert.validity.notAfter.toISOString().slice(0, 10) });
    }

    if (!cred || !cred.clave || !cred.certificado) return json({ ok: false, error: 'sin_certificado', modo });
    const cuitEmisor = cred.cuit;
    const ptoVta = Math.max(1, Math.round(+body.ptoVta || 0));
    const emisorRI = body.condicion === 'ri';

    if (accion === 'estado') {
      const ta = await ticket(sb, modo, cred);
      const tipo = emisorRI ? 6 : 11;
      const ultimo = await ultimoNumero(modo, ta, cuitEmisor, ptoVta, tipo);
      return json({ ok: true, modo, cuit: cuitEmisor, ptoVta, tipo, ultimo, certificadoVence: (cred.vence || '').slice(0, 10) });
    }

    if (accion === 'facturar') {
      const paymentId = String(body.paymentId || '');
      const pr = await sb.from('payments').select('id,data').eq('id', paymentId).maybeSingle();
      if (pr.error || !pr.data) return json({ ok: false, error: 'No encontré el cobro' }, 404);
      const p = pr.data.data || {};
      if (p.factura && p.factura.cae) return json({ ok: true, factura: p.factura, yaEstaba: true });
      const pesos = p.tipo === 'cuota' ? r2((+p.monto || 0) * (+p.cotizacionDia || 0)) : r2(+p.monto || 0);
      if (!(pesos > 0)) return json({ ok: false, error: p.tipo === 'cuota' ? 'El cobro en dólares no tiene guardada la cotización del día' : 'El cobro no tiene monto' }, 400);
      const dr = p.choferId ? await sb.from('drivers').select('data').eq('id', p.choferId).maybeSingle() : { data: null };
      const d = (dr.data && dr.data.data) || {};
      const cuitRec = soloDig(d.cuit), dni = soloDig(d.dni);
      const condRec = +d.condicionIva || (cuitRec.length === 11 ? 6 : 5); // 1 RI · 6 Monotributo · 5 Consumidor final · 4 Exento
      const docTipo = cuitRec.length === 11 ? 80 : dni ? 96 : 99, docNro = cuitRec.length === 11 ? cuitRec : dni || '0';
      const tipo = emisorRI ? (condRec === 1 ? 1 : 6) : 11;
      const fecha = fechaAR();
      const desde = String(body.desde || p.fecha || fecha), hasta = String(body.hasta || p.fecha || fecha);
      let neto = pesos, iva = 0;
      if (emisorRI) { neto = r2(pesos / 1.21); iva = r2(pesos - neto); }
      const ta = await ticket(sb, modo, cred);
      // Hasta 2 intentos por si otro emitió justo el mismo número.
      for (let intento = 0; intento < 2; intento++) {
        const n = (await ultimoNumero(modo, ta, cuitEmisor, ptoVta, tipo)) + 1;
        const det = '<ar:FECAEDetRequest><ar:Concepto>2</ar:Concepto><ar:DocTipo>' + docTipo + '</ar:DocTipo><ar:DocNro>' + docNro + '</ar:DocNro>' +
          '<ar:CbteDesde>' + n + '</ar:CbteDesde><ar:CbteHasta>' + n + '</ar:CbteHasta><ar:CbteFch>' + aaaammdd(fecha) + '</ar:CbteFch>' +
          '<ar:ImpTotal>' + pesos.toFixed(2) + '</ar:ImpTotal><ar:ImpTotConc>0</ar:ImpTotConc><ar:ImpNeto>' + neto.toFixed(2) + '</ar:ImpNeto><ar:ImpOpEx>0</ar:ImpOpEx><ar:ImpTrib>0</ar:ImpTrib><ar:ImpIVA>' + iva.toFixed(2) + '</ar:ImpIVA>' +
          '<ar:FchServDesde>' + aaaammdd(desde) + '</ar:FchServDesde><ar:FchServHasta>' + aaaammdd(hasta) + '</ar:FchServHasta><ar:FchVtoPago>' + aaaammdd(fecha) + '</ar:FchVtoPago>' +
          '<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz><ar:CondicionIVAReceptorId>' + condRec + '</ar:CondicionIVAReceptorId>' +
          (emisorRI ? '<ar:Iva><ar:AlicIva><ar:Id>5</ar:Id><ar:BaseImp>' + neto.toFixed(2) + '</ar:BaseImp><ar:Importe>' + iva.toFixed(2) + '</ar:Importe></ar:AlicIva></ar:Iva>' : '') +
          '</ar:FECAEDetRequest>';
        const x = await wsfe(modo, 'FECAESolicitar', auth(ta, cuitEmisor) + '<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>' + ptoVta + '</ar:PtoVta><ar:CbteTipo>' + tipo + '</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq>' + det + '</ar:FeDetReq></ar:FeCAEReq>');
        const resultado = tag(tag(x, 'FECAEDetResponse'), 'Resultado') || tag(x, 'Resultado');
        const cae = tag(x, 'CAE');
        if (resultado === 'A' && cae) {
          const factura = { tipo, ptoVta, numero: n, cae, caeVto: tag(x, 'CAEFchVto'), fecha, total: pesos, neto, iva, docTipo, docNro, condRec, cuitEmisor, modo, receptor: d.nombre || '', desde, hasta };
          const fresco = await sb.from('payments').select('data').eq('id', paymentId).maybeSingle();
          await sb.from('payments').update({ data: { ...((fresco.data && fresco.data.data) || p), factura }, updated_at: new Date().toISOString() }).eq('id', paymentId);
          await sb.from('audit_log').insert({ user_id: u.user.id, user_email: u.user.email, accion: 'factura_arca(' + tipo + '-' + ptoVta + '-' + n + ')', tabla: 'payments', registro_id: paymentId }).then(() => {}, () => {});
          return json({ ok: true, factura });
        }
        const errs = errores(x);
        if (intento === 0 && errs.some(e => /^10016:/.test(e))) continue; // número ya usado: reintentar con el siguiente
        return json({ ok: false, error: 'ARCA rechazó la factura: ' + (errs.join(' · ') || 'sin detalle') });
      }
      return json({ ok: false, error: 'ARCA rechazó la factura (número repetido). Probá de nuevo.' });
    }
    return json({ ok: false, error: 'Acción inválida' }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e).slice(0, 400) }, 500);
  }
});
