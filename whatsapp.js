// Cliente de la API de WhatsApp Cloud (Meta Graph API).
// Envía textos, videos, audios y botones; sube medios y los reutiliza por ID.
// No contiene lógica de conversación: eso vive en victoria.js.

const fs = require('fs');
const path = require('path');
const config = require('./config');

const GRAPH = `https://graph.facebook.com/${config.graphVersion}`;
const MEDIA_IDS_FILE = path.join(__dirname, 'state', 'media-ids.json');

function loadMediaIds() {
  try {
    return JSON.parse(fs.readFileSync(MEDIA_IDS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveMediaIds(ids) {
  fs.mkdirSync(path.dirname(MEDIA_IDS_FILE), { recursive: true });
  fs.writeFileSync(MEDIA_IDS_FILE, JSON.stringify(ids, null, 2));
}

async function graphPost(endpoint, body, isForm = false) {
  const url = `${GRAPH}/${config.phoneNumberId}${endpoint}`;
  const headers = { Authorization: `Bearer ${config.accessToken}` };
  let payload;
  if (isForm) {
    payload = body; // FormData ya lleva su propio content-type
  } else {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method: 'POST', headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`WhatsApp API ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// Sube un archivo de medios a WhatsApp y devuelve su media_id.
// El ID se guarda en state/media-ids.json para no volver a subir el mismo archivo.
async function uploadMedia(filePath, mimeType) {
  const ids = loadMediaIds();
  const key = path.resolve(filePath);
  if (ids[key]) return ids[key];

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  const buffer = fs.readFileSync(filePath);
  form.append('file', new Blob([buffer], { type: mimeType }), path.basename(filePath));
  form.append('type', mimeType);

  const data = await graphPost('/media', form, true);
  ids[key] = data.id;
  saveMediaIds(ids);
  return data.id;
}

// Descarga un medio de WhatsApp (por ejemplo una nota de voz) a un archivo local.
async function downloadMedia(mediaId, destPath) {
  const infoRes = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  const info = await infoRes.json();
  if (!info.url) throw new Error(`No se pudo obtener la URL del medio ${mediaId}: ${JSON.stringify(info)}`);
  const fileRes = await fetch(info.url, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buffer);
  return destPath;
}

async function sendText(to, text) {
  return graphPost('/messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: text },
  });
}

async function sendVideo(to, filePath, caption) {
  const mediaId = await uploadMedia(filePath, 'video/mp4');
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'video',
    video: { id: mediaId },
  };
  if (caption) body.video.caption = caption;
  return graphPost('/messages', body);
}

async function sendAudio(to, filePath) {
  const mediaId = await uploadMedia(filePath, 'audio/ogg');
  return graphPost('/messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'audio',
    audio: { id: mediaId },
  });
}

// Botones de respuesta rápida (máx. 3, texto máx. 20 caracteres cada uno).
async function sendButtons(to, text, buttons) {
  return graphPost('/messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text },
      action: {
        buttons: buttons.map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  });
}

// Marca el mensaje como leído (las dos palomitas azules).
async function markRead(messageId) {
  return graphPost('/messages', {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  }).catch(() => null);
}

module.exports = {
  sendText,
  sendVideo,
  sendAudio,
  sendButtons,
  markRead,
  downloadMedia,
};
