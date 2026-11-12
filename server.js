// Servidor webhook de Daniela — chatbot de WhatsApp de Blü Bee Technologies.
// Recibe los mensajes de WhatsApp Cloud API y se los pasa a daniela.js.

const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const wa = require('./whatsapp');
const { handleMessage, deliverPendingFarewell } = require('./daniela');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Verificación del webhook (Meta la llama una vez al conectar)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === config.verifyToken) {
    console.log('Webhook verificado por Meta.');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Mensajes entrantes
app.post('/webhook', async (req, res) => {
  // Responder rápido a Meta (menos de 20 s) y procesar después
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        for (const msg of value.messages || []) {
          const contact = (value.contacts || []).find((c) => c.wa_id === msg.from);
          await handleMessage({
            from: msg.from,
            profileName: contact?.profile?.name || null,
            type: msg.type,
            text: msg.text,
            audio: msg.audio,
            interactive: msg.interactive,
            id: msg.id,
            timestamp: msg.timestamp,
          }).catch((e) => console.error('Error procesando mensaje:', e));
        }
      }
    }
  } catch (e) {
    console.error('Error en el webhook:', e);
  }
});

// Entrega diferida del video de despedida personalizado (escenario B, v3).
// El proceso que genera el video llama a este endpoint cuando el video ya
// está listo en media/ (despedida-<nombre>.mp4, despedida-<empresa>.mp4 o
// despedida-generica.mp4, según la identidad de la solicitud), con el
// teléfono en el cuerpo:
//   POST /deliver-farewell  { "phone": "521234567890" }
// Si hay una entrega pendiente para ese teléfono y el video ya existe, lo
// envía junto con los enlaces de las redes y limpia el pendiente.
// Si no hay pendiente o el video aún no existe, responde ok:false con el motivo.
// Si FAREWELL_ENDPOINT_TOKEN está configurado, la petición debe incluirlo
// (campo "token" en el cuerpo o cabecera x-farewell-token).
app.post('/deliver-farewell', async (req, res) => {
  const phone = req.body && req.body.phone;
  if (!phone) return res.status(400).json({ ok: false, error: 'falta phone' });
  const token = (req.body && req.body.token) || req.headers['x-farewell-token'];
  if (config.farewellEndpointToken && token !== config.farewellEndpointToken) {
    return res.status(403).json({ ok: false, error: 'token inválido' });
  }
  try {
    const result = await deliverPendingFarewell(String(phone));
    return res.json(result);
  } catch (e) {
    console.error('Error en /deliver-farewell:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Entrega del video de disculpa personalizado para Ricky (autorizado por Peter).
//   POST /deliver-apology  { "phone": "5215519518504" }
// Envía media/daniela-disculpa-ricky-v3.mp4 a Ricky por WhatsApp y le pone
// un ❤️ al video. Solo acepta el número VIP de Ricky, por seguridad.
app.post('/deliver-apology', async (req, res) => {
  try {
    const phone = String((req.body && req.body.phone) || '');
    const ricky = (config.vipRicky && config.vipRicky.phone) || '5215519518504';
    if (phone !== ricky) return res.json({ ok: false, reason: 'not-ricky' });
    const videoPath = path.join(__dirname, 'media', 'daniela-disculpa-ricky-v3.mp4');
    if (!fs.existsSync(videoPath)) {
      return res.json({ ok: false, reason: 'no-video' });
    }
    const sent = await wa.sendVideo(phone, videoPath);
    const messageId = sent && sent.messages && sent.messages[0] && sent.messages[0].id;
    if (messageId) {
      await wa.sendReaction(phone, messageId, '❤️').catch((e) => console.error('Error al poner ❤️:', e.message));
    }
    return res.json({ ok: true, messageId: messageId || null });
  } catch (e) {
    console.error('Error en /deliver-apology:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Entrega del logo oficial (800x800) a Peter por WhatsApp, vía Daniela.
//   POST /deliver-logo  { "phone": "524421447169" }
// Envía media/logo-perfil-800x800.jpg al WhatsApp personal de Peter para
// que lo suba como foto de perfil del canal de YouTube. Solo acepta el
// número de Peter, por seguridad.
app.post('/deliver-logo', async (req, res) => {
  try {
    const phone = String((req.body && req.body.phone) || '');
    const peter = config.peterWhatsApp || '524421447169';
    if (phone !== peter) return res.json({ ok: false, reason: 'not-peter' });
    const imagePath = path.join(__dirname, 'media', 'logo-perfil-800x800.jpg');
    if (!fs.existsSync(imagePath)) {
      return res.json({ ok: false, reason: 'no-image' });
    }
    const sent = await wa.sendImage(
      phone,
      imagePath,
      'Hola Peter, aquí te mando el logo oficial de Blü Bee Technologies en 800×800, listo para subirlo como foto de perfil del canal de YouTube. Lo puedes descargar desde WhatsApp Web en tu MacBook.'
    );
    const messageId = sent && sent.messages && sent.messages[0] && sent.messages[0].id;
    return res.json({ ok: true, messageId: messageId || null });
  } catch (e) {
    console.error('Error en /deliver-logo:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Entrega del banner del canal (2560x1440) a Peter por WhatsApp, vía Daniela.
//   POST /deliver-banner  { "phone": "524421447169" }
// Envía media/banner-2560x1440.jpg al WhatsApp personal de Peter para
// que lo suba como banner del canal de YouTube. Solo acepta el
// número de Peter, por seguridad.
app.post('/deliver-banner', async (req, res) => {
  try {
    const phone = String((req.body && req.body.phone) || '');
    const peter = config.peterWhatsApp || '524421447169';
    if (phone !== peter) return res.json({ ok: false, reason: 'not-peter' });
    const imagePath = path.join(__dirname, 'media', 'banner-2560x1440.jpg');
    if (!fs.existsSync(imagePath)) {
      return res.json({ ok: false, reason: 'no-image' });
    }
    const sent = await wa.sendImage(
      phone,
      imagePath,
      'Hola Peter, aquí te mando el banner del canal de YouTube (2560×1440), listo para subirlo en Personalización del canal. Lo puedes descargar desde WhatsApp Web en tu MacBook.'
    );
    const messageId = sent && sent.messages && sent.messages[0] && sent.messages[0].id;
    return res.json({ ok: true, messageId: messageId || null });
  } catch (e) {
    console.error('Error en /deliver-banner:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Entrega de un texto a Peter por WhatsApp, vía Daniela.
//   POST /deliver-text  { "phone": "524421447169", "text": "..." }
// Para mandarle textos largos (como la descripción del canal) que pueda
// copiar desde WhatsApp Web en su MacBook. Solo acepta el número de Peter.
app.post('/deliver-text', async (req, res) => {
  try {
    const phone = String((req.body && req.body.phone) || '');
    const text = String((req.body && req.body.text) || '');
    const peter = config.peterWhatsApp || '524421447169';
    if (phone !== peter) return res.json({ ok: false, reason: 'not-peter' });
    if (!text) return res.json({ ok: false, reason: 'no-text' });
    const sent = await wa.sendText(phone, text);
    const messageId = sent && sent.messages && sent.messages[0] && sent.messages[0].id;
    return res.json({ ok: true, messageId: messageId || null });
  } catch (e) {
    console.error('Error en /deliver-text:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Salud del servidor
app.get('/health', (req, res) => res.json({ ok: true, bot: 'Daniela', empresa: 'Blü Bee Technologies' }));

app.listen(config.port, () => {
  console.log(`Daniela escuchando en el puerto ${config.port}`);
  console.log(`Webhook: http://localhost:${config.port}/webhook`);
  if (!config.accessToken || !config.phoneNumberId) {
    console.log('⚠️  Falta WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID en .env — el bot no puede mandar mensajes todavía.');
  }
});
