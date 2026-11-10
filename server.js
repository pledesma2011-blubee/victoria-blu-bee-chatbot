// Servidor webhook de Daniela — chatbot de WhatsApp de Blü Bee Technologies.
// Recibe los mensajes de WhatsApp Cloud API y se los pasa a daniela.js.

const express = require('express');
const config = require('./config');
const { handleMessage } = require('./daniela');

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

// Salud del servidor
app.get('/health', (req, res) => res.json({ ok: true, bot: 'Daniela', empresa: 'Blü Bee Technologies' }));

app.listen(config.port, () => {
  console.log(`Daniela escuchando en el puerto ${config.port}`);
  console.log(`Webhook: http://localhost:${config.port}/webhook`);
  if (!config.accessToken || !config.phoneNumberId) {
    console.log('⚠️  Falta WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID en .env — el bot no puede mandar mensajes todavía.');
  }
});
