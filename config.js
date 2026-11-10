// Configuración de Daniela — chatbot de WhatsApp de Blü Bee Technologies
// Los secretos (tokens, contraseñas) NUNCA van en este archivo.
// Se leen de variables de entorno o del archivo .env (que no se comparte).
// Ver README.md para la lista completa.

require('dotenv').config();
const path = require('path');

const config = {
  // WhatsApp Cloud API (Meta)
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '', // ID del número Business 442 461 0323
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',      // Token permanente de la app de Meta
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'victoria-blu-bee', // Lo eliges tú; debe coincidir con Meta
  graphVersion: process.env.WHATSAPP_GRAPH_VERSION || 'v21.0',

  // Pedro — a dónde llegan los recados y avisos
  peterWhatsApp: process.env.PETER_WHATSAPP || '524421447169', // Personal de Peter (442 1447169, con código de país 52)
  peterEmail: process.env.PETER_EMAIL || 'pledesma@blubeetech.com.mx',

  // Correo para mandar los recados (SMTP). Si no está configurado, el recado se guarda en leads.json
  // y se avisa por WhatsApp a Pedro, pero no se manda correo.
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || 'Daniela <daniela@blubeetech.com.mx>',

  // Transcripción de notas de voz: comando que recibe la ruta del audio y devuelve el texto.
  // Por defecto usa el helper transcribe.py con faster-whisper (ver README).
  transcribeCmd: process.env.TRANSCRIBE_CMD || 'python3 transcribe.py',

  // Archivos de medios (rutas relativas a la carpeta chatbot/)
  media: {
    welcomeVideo: process.env.MEDIA_WELCOME || './media/welcome-video.mp4',
    personalizedVideo: process.env.MEDIA_PERSONALIZED || './media/personalized-video.mp4',
    commercialVideo: process.env.MEDIA_COMMERCIAL || './media/commercial-video.mp4',
    logoVideo: process.env.MEDIA_LOGO || './media/logo-video.mp4',
    closingAudio: process.env.MEDIA_CLOSING_AUDIO || './media/cierre-oficial.ogg',
  },

  // Estado (conversaciones y recados): carpeta con permisos de escritura.
  // En local es ./state. En hosting con archivos de solo lectura (p. ej. FadeHost),
  // pon STATE_DIR=/data/state para que el estado sobreviva a los despliegues.
  stateDir: process.env.STATE_DIR || path.join(__dirname, 'state'),

  // Servidor
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
};

module.exports = config;
