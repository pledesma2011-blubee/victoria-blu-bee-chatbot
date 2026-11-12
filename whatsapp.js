// Cliente de la API de WhatsApp Cloud (Meta Graph API).
// Envía textos, videos, audios y botones; sube medios y los reutiliza por ID.
// No contiene lógica de conversación: eso vive en daniela.js.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const GRAPH = `https://graph.facebook.com/${config.graphVersion}`;
const MEDIA_IDS_FILE = path.join(config.stateDir, 'media-ids.json');

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
  const buffer = fs.readFileSync(filePath);
  // La clave incluye el hash del contenido: si el archivo cambia (misma ruta,
  // nuevo contenido), se vuelve a subir en vez de reutilizar el media ID viejo.
  // Antes la clave era solo la ruta, así que reemplazar un archivo mandaba la
  // versión anterior (pasó con la marca de agua el 2026-11-11).
  const hash = crypto.createHash('md5').update(buffer).digest('hex');
  const key = path.resolve(filePath) + ':' + hash;
  if (ids[key]) return ids[key];

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([buffer], { type: mimeType }), path.basename(filePath));
  form.append('type', mimeType);

  const data = await graphPost('/media', form, true);
  ids[key] = data.id;
  saveMediaIds(ids);
  return data.id;
}

// --- Foto de perfil del número de WhatsApp Business ---
// Meta exige subir la imagen por la API de subida reanudable (Resumable
// Upload) para obtener un "handle" y luego referenciarlo en
// /{phone-number-id}/whatsapp_business_profile como profile_picture_handle.
// No se puede pasar una URL ni un media_id de /media.
// Flujo (docs de Meta: Resumable Upload API + WhatsApp Business Profile):
//   1) POST /{app-id}/uploads {file_name, file_length, file_type}
//      -> {id: "upload:<sessionId>"}
//   2) POST /upload:<sessionId> con los bytes, cabecera file_offset: 0 y
//      Authorization: OAuth <token> -> {h: "<handle>"}
//   3) POST /{phone-number-id}/whatsapp_business_profile
//      {profile_picture_handle: "<handle>"} -> {success: true}
// La subida reanudable pertenece a la app, no al número: por eso el paso 1
// usa el App ID de Meta (config.appId) y no phoneNumberId. La foto NO se
// puede poner desde la app de WhatsApp Business (eso volvería a registrar
// el número y rompería el chatbot).

// Crea una sesión de subida reanudable y devuelve su ID ("upload:<...>").
async function createResumableUploadSession(fileName, fileLength, fileType) {
  const url = `${GRAPH}/${config.appId}/uploads`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file_name: fileName, file_length: fileLength, file_type: fileType }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    throw new Error(`No se pudo crear la sesión de subida reanudable (WhatsApp API ${res.status}): ${JSON.stringify(data)}`);
  }
  return data.id;
}

// Sube los bytes del archivo a la sesión y devuelve el handle ("h").
async function uploadResumableFile(uploadSessionId, buffer) {
  const url = `${GRAPH}/${uploadSessionId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${config.accessToken}`,
      'Content-Type': 'application/octet-stream',
      file_offset: '0',
    },
    body: buffer,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.h) {
    throw new Error(`No se pudo subir la foto a la sesión reanudable (WhatsApp API ${res.status}): ${JSON.stringify(data)}`);
  }
  return data.h;
}

// Pone la foto de perfil del número de WhatsApp Business de Blü Bee.
// filePath: imagen JPEG/PNG local (p. ej. media/daniela-foto-perfil.jpg).
// Devuelve la respuesta de la API ({success: true}).
// Errores típicos: el token no tiene el permiso whatsapp_business_management
// (la API responde 403) o la imagen tiene un formato no admitido.
async function setProfilePicture(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe la foto de perfil: ${filePath}`);
  }
  const buffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const mimeType = /\.png$/i.test(fileName) ? 'image/png' : 'image/jpeg';
  const sessionId = await createResumableUploadSession(fileName, buffer.length, mimeType);
  const handle = await uploadResumableFile(sessionId, buffer);
  const data = await graphPost('/whatsapp_business_profile', { messaging_product: 'whatsapp', profile_picture_handle: handle });
  if (data.success !== true) {
    throw new Error(`La API no confirmó el cambio de foto de perfil: ${JSON.stringify(data)}`);
  }
  return data;
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

// Envía una imagen (por ejemplo el logo) por WhatsApp, con pie opcional.
async function sendImage(to, filePath, caption) {
  const mediaId = await uploadMedia(filePath, 'image/jpeg');
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'image',
    image: { id: mediaId },
  };
  if (caption) body.image.caption = caption;
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

// Reacciona a un mensaje con un emoji (por ejemplo ❤️).
async function sendReaction(to, messageId, emoji) {
  return graphPost('/messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'reaction',
    reaction: { message_id: messageId, emoji },
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
  sendImage,
  sendAudio,
  sendButtons,
  sendReaction,
  markRead,
  downloadMedia,
  setProfilePicture,
};
