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
  appId: process.env.META_APP_ID || '1148884670839349',      // ID de la app de Meta "Blü Bee Technologies" (para la subida reanudable: la foto de perfil se sube a la app, no al número)
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'victoria-blu-bee', // Lo eliges tú; debe coincidir con Meta
  graphVersion: process.env.WHATSAPP_GRAPH_VERSION || 'v21.0',

  // Pedro — a dónde llegan los recados y avisos
  peterWhatsApp: process.env.PETER_WHATSAPP || '524421447169', // Personal de Peter (442 1447169, con código de país 52)
  peterEmail: process.env.PETER_EMAIL || 'pledesma@blubeetech.com.mx',

  // Contacto VIP — Ricardo Roach ("Ricky"), socio de Peter (2026-11-11).
  // Daniela le da un trato especial y personal, distinto al de los demás:
  // siempre lo llama "Ricky", le permite que le diga "Dani", "mi amor" y
  // otros cariños sin activar el límite de coqueteo, y de vez en cuando le
  // pregunta por sus perras Mila y Bruna (Golden Retriever, como sus hijas)
  // o por sus gustos (pádel, bici eléctrica, scooter). Se identifica por su
  // número de WhatsApp (comparación por últimos 10 dígitos, como con el
  // número de Peter).
  // Contexto de Ricky (para el trato empático y personal): fanático del
  // pádel (juega casi todos los días), le gusta andar en bici eléctrica y
  // en su moto scooter, vive en Lomas de Tecamachalco, Ciudad de México,
  // tiene unos 57 años como Peter, son amigos de hace más de 40 años y está
  // apoyando mucho a Peter. Mila (la mayor, ~8 años) y Bruna (la más joven,
  // ~2-3 años, hija de Mila) son como sus hijas; vive solo con ellas la
  // mayor parte del tiempo (tiene novia, pero vive solo).
  // Fútbol (2026-11-11): fanatiquísimo de Las Águilas del América (México)
  // y muy fiel seguidor de la Champions. De origen escocés (papá escocés,
  // mamá mexicana), ama todo lo de Inglaterra y le va a la mayoría de los
  // equipos ingleses (Manchester United, Tottenham). Respeta al Real Madrid
  // y al Barcelona, pero es más afín a la liga inglesa.
  // REGLA DURA: su nombre registrado es "Richard William Roach Sánchez".
  // Daniela NUNCA debe llamarlo así ni decirle ese nombre bajo ninguna
  // circunstancia; siempre es "Ricky" (ver isVipForbiddenName en daniela.js).
  vipRicky: {
    phone: process.env.VIP_RICKY_WHATSAPP || '5215519518504',
    name: 'Ricky',
    forbiddenFullName: 'Richard William Roach Sánchez',
    dogs: ['Mila', 'Bruna'],
    interests: ['pádel', 'bici eléctrica', 'scooter'],
    football: {
      team: 'América',
      competition: 'Champions',
      englishTeams: ['Manchester United', 'Tottenham'],
    },
    city: 'Lomas de Tecamachalco, Ciudad de México',
  },

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

  // Clave de Groq para transcribir notas de voz con Whisper GRATIS.
  // Groq (console.groq.com) ofrece el mismo modelo Whisper sin tarjeta y
  // sin saldo mínimo; es el proveedor PRINCIPAL (v3.5, 2026-11-11, aprobado
  // por Peter: el tráfico de WhatsApp Business es bajo y el plan gratuito
  // alcanza). Se lee de la variable de entorno GROQ_API_KEY (o del .env).
  // NUNCA se escribe en el código ni en los logs.
  groqApiKey: process.env.GROQ_API_KEY || '',

  // Clave de OpenAI para transcribir notas de voz con la API de Whisper.
  // Es el RESPALDO: solo se usa si NO hay clave de Groq configurada.
  // Se lee de la variable de entorno OPENAI_API_KEY (o del .env).
  // NUNCA se escribe en el código ni en los logs. Si no está configurada
  // ninguna de las dos claves, Daniela pide amablemente que le escriban el
  // mensaje (no intenta transcribir en local: en FadeHost no hay
  // Python/ffmpeg).
  openaiApiKey: process.env.OPENAI_API_KEY || '',

  // Webhook opcional para pedir el video de despedida personalizado.
  // Si está configurado, al detectar un prospecto se hace un POST con
  // { phone, name, phrase, fecha }. Si no está configurado, la solicitud
  // solo se registra en state/despedida-pendiente-<telefono>.json para que
  // el proceso que genera el video la tome de ahí.
  farewellVideoWebhook: process.env.FAREWELL_VIDEO_WEBHOOK || '',

  // Token opcional para el endpoint POST /deliver-farewell (entrega diferida
  // del video de despedida). Si está configurado, la petición debe incluirlo
  // (campo "token" en el cuerpo o cabecera x-farewell-token). Si no está
  // configurado, no se exige.
  farewellEndpointToken: process.env.FAREWELL_ENDPOINT_TOKEN || '',

  // Redes sociales de Blü Bee (para la despedida con el video de despedida).
  // Solo se comparten los enlaces que existen; los pendientes se agregan aquí
  // cuando estén listos y aparecerán automáticamente en el mensaje.
  socialLinks: {
    website: 'https://blubeetech.com.mx',
    instagram: 'https://www.instagram.com/blubee_2026', // existe: @blubee_2026
    facebook: '', // PENDIENTE: la página de Facebook se está construyendo
    tiktok: '',   // PENDIENTE: Peter la crea en la app
    youtube: '',  // PENDIENTE: el canal de YouTube se está construyendo
  },

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
