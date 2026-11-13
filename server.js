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

// Entrega del video de Daniela preguntando por Bruna y Mila a Ricky.
//   POST /deliver-ricky-dogs  { "phone": "5215519518504" }
// Envía media/daniela-bruna-mila-ricky.mp4 a Ricky por WhatsApp (Daniela
// le pregunta "Hola Ricky, ¿cómo están Bruna y Mila?"). Solo acepta el
// número VIP de Ricky, por seguridad. Lo llama el proceso que autoriza
// Peter cuando quiere que Daniela le pregunte a Ricky por sus perras.
app.post('/deliver-ricky-dogs', async (req, res) => {
  try {
    const phone = String((req.body && req.body.phone) || '');
    const ricky = (config.vipRicky && config.vipRicky.phone) || '5215519518504';
    if (phone !== ricky) return res.json({ ok: false, reason: 'not-ricky' });
    const videoPath = path.join(__dirname, 'media', 'daniela-bruna-mila-ricky.mp4');
    if (!fs.existsSync(videoPath)) {
      return res.json({ ok: false, reason: 'no-video' });
    }
    const sent = await wa.sendVideo(phone, videoPath);
    const messageId = sent && sent.messages && sent.messages[0] && sent.messages[0].id;
    return res.json({ ok: true, messageId: messageId || null });
  } catch (e) {
    console.error('Error en /deliver-ricky-dogs:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Entrega del saludo de viernes a Ricky por WhatsApp (Daniela le desea
// un excelente fin de semana y saluda a Mila y a Bruna).
//   POST /deliver-friday-ricky  { "phone": "5215519518504" }
// Envía media/daniela-viernes-ricky-v2.mp4 a Ricky por WhatsApp. Solo
// acepta el número VIP de Ricky, por seguridad. Lo llama el proceso que
// autoriza Peter cuando quiere que Daniela le mande el saludo de viernes.
app.post('/deliver-friday-ricky', async (req, res) => {
  try {
    const phone = String((req.body && req.body.phone) || '');
    const ricky = (config.vipRicky && config.vipRicky.phone) || '5215519518504';
    if (phone !== ricky) return res.json({ ok: false, reason: 'not-ricky' });
    const videoPath = path.join(__dirname, 'media', 'daniela-viernes-ricky-v2.mp4');
    if (!fs.existsSync(videoPath)) {
      return res.json({ ok: false, reason: 'no-video' });
    }
    const sent = await wa.sendVideo(phone, videoPath);
    const messageId = sent && sent.messages && sent.messages[0] && sent.messages[0].id;
    return res.json({ ok: true, messageId: messageId || null });
  } catch (e) {
    console.error('Error en /deliver-friday-ricky:', e.message);
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

// Entrega de la abeja (marca de agua del canal) a Peter por WhatsApp, vía Daniela.
//   POST /deliver-watermark  { "phone": "524421447169" }
// Envía media/abeja-marca-agua.png al WhatsApp personal de Peter para
// que la suba como marca de agua en Personalización del canal. Solo acepta
// el número de Peter, por seguridad.
app.post('/deliver-watermark', async (req, res) => {
  try {
    const phone = String((req.body && req.body.phone) || '');
    const peter = config.peterWhatsApp || '524421447169';
    if (phone !== peter) return res.json({ ok: false, reason: 'not-peter' });
    const imagePath = path.join(__dirname, 'media', 'abeja-marca-agua.png');
    if (!fs.existsSync(imagePath)) {
      return res.json({ ok: false, reason: 'no-image' });
    }
    const sent = await wa.sendImage(
      phone,
      imagePath,
      'Hola Peter, aquí te mando la abeja dorada para la marca de agua del canal de YouTube. Descárgala desde WhatsApp Web en tu MacBook y súbela en Personalización del canal, en la parte de Marca de agua de los videos, con el botón Subir.'
    );
    const messageId = sent && sent.messages && sent.messages[0] && sent.messages[0].id;
    return res.json({ ok: true, messageId: messageId || null });
  } catch (e) {
    console.error('Error en /deliver-watermark:', e.message);
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

// Pone la foto de perfil de WhatsApp del número de Blü Bee (442 461 0323).
//   POST /set-profile-photo  { "phone": "524421447169" }
// Sube media/daniela-foto-perfil.jpg por la API de subida reanudable de
// Meta y la pone como foto de perfil del número con
// POST /{phone-number-id}/whatsapp_business_profile. Solo acepta el número
// de Peter, por seguridad. La foto NO se puede poner desde la app de
// WhatsApp Business (eso volvería a registrar el número y rompería el
// chatbot). Si el token no tiene el permiso whatsapp_business_management,
// la API responde 403 y el error se devuelve tal cual.
app.post('/set-profile-photo', async (req, res) => {
  try {
    const phone = String((req.body && req.body.phone) || '');
    const peter = config.peterWhatsApp || '524421447169';
    if (phone !== peter) return res.json({ ok: false, reason: 'not-peter' });
    const imagePath = path.join(__dirname, 'media', 'daniela-foto-perfil.jpg');
    if (!fs.existsSync(imagePath)) {
      return res.json({ ok: false, reason: 'no-image' });
    }
    const result = await wa.setProfilePicture(imagePath);
    return res.json({ ok: true, result });
  } catch (e) {
    console.error('Error en /set-profile-photo:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Preguntas pendientes para Tomás (v3.6, orden de Peter 2026-11-13).
// Daniela guarda aquí las preguntas de Peter y de Ricky que no supo
// contestar ("Dame un segundo, lo reviso y te respondo en un momento").
// Tomás las revisa, las investiga y les da la respuesta a Daniela para
// que se las conteste por texto. Sin autenticación externa: solo se
// exponen las preguntas (sin datos de otros contactos) y el marcado de
// resueltas; el envío de la respuesta usa /deliver-answer.
app.get('/preguntas-pendientes', (req, res) => {
  try {
    const all = daniela.readPendingQuestions();
    const pending = all.filter((e) => !e.resuelta);
    return res.json({ ok: true, pendientes: pending, total: pending.length });
  } catch (e) {
    console.error('Error en /preguntas-pendientes:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/preguntas-pendientes/resolver', async (req, res) => {
  try {
    const id = String((req.body && req.body.id) || '');
    if (!id) return res.json({ ok: false, reason: 'no-id' });
    const done = daniela.resolvePendingQuestion(id);
    return res.json({ ok: done });
  } catch (e) {
    console.error('Error en /preguntas-pendientes/resolver:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Manda la respuesta investigada por Tomás a Peter o a Ricky por texto.
//   POST /deliver-answer  { "phone": "524421447169" | "5215519518504", "text": "...", "preguntaId": "..." }
// Solo acepta el número de Peter o el de Ricky (VIP). Si trae preguntaId,
// marca esa pregunta como resuelta.
app.post('/deliver-answer', async (req, res) => {
  try {
    const phone = String((req.body && req.body.phone) || '');
    const text = String((req.body && req.body.text) || '');
    const preguntaId = String((req.body && req.body.preguntaId) || '');
    const peter = config.peterWhatsApp || '524421447169';
    const ricky = (config.vipRicky && config.vipRicky.phone) || '5215519518504';
    const isPeter = phone === peter;
    const isRicky = phone === ricky;
    if (!isPeter && !isRicky) return res.json({ ok: false, reason: 'not-allowed' });
    if (!text) return res.json({ ok: false, reason: 'no-text' });
    const sent = await wa.sendText(phone, text);
    const messageId = sent && sent.messages && sent.messages[0] && sent.messages[0].id;
    if (preguntaId) daniela.resolvePendingQuestion(preguntaId);
    return res.json({ ok: true, messageId: messageId || null });
  } catch (e) {
    console.error('Error en /deliver-answer:', e.message);
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
