// LD Rental — webhook de WhatsApp Business (Meta).
// Meta exige configurar un webhook para poder usar la API, aunque el
// bot solo mande mensajes salientes (no procesamos conversaciones
// entrantes por ahora). Esta función solo hace dos cosas:
//   1) Responde el "handshake" de verificación que pide Meta al
//      configurar la URL del webhook (GET con hub.challenge).
//   2) Confirma con 200 OK cualquier evento entrante (mensajes,
//      confirmaciones de entrega/lectura) para que Meta no reintente.
// No hace falta invocarla a mano; la llama Meta directamente.
const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || '';

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'POST') {
    try { await req.json(); } catch (e) { /* ignorar payload inválido */ }
    return new Response('EVENT_RECEIVED', { status: 200 });
  }

  return new Response('Method not allowed', { status: 405 });
});
