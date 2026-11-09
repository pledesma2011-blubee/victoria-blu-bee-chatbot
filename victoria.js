// Victoria — la secretaria virtual de Blü Bee Technologies.
// Lógica de conversación: estados, intenciones, recados, seguridad y cierres.
// Sigue el diseño en chatbot-whatsapp-blu-bee-diseno.md.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const config = require('./config');
const wa = require('./whatsapp');

const STATE_DIR = config.stateDir;
const LEADS_FILE = path.join(config.stateDir, 'leads.json');

// ---------- utilidades ----------

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¡!¿?.,;:()"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contains(text, words) {
  const t = ` ${normalize(text)} `;
  return words.some((w) => t.includes(` ${normalize(w)} `) || t.includes(normalize(w)));
}

function loadState(phone) {
  const file = path.join(STATE_DIR, `${phone}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { phone, stage: 'new', name: null, company: null, known: false, handedOff: false };
  }
}

function saveState(st) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(STATE_DIR, `${st.phone}.json`), JSON.stringify(st, null, 2));
}

function saveLead(lead) {
  let leads = [];
  try {
    leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  } catch { /* archivo nuevo */ }
  lead.fecha = new Date().toISOString();
  leads.push(lead);
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
  return lead;
}

function extractName(text) {
  let t = (text || '').trim();
  t = t.replace(/^(hola|buenas|buenos dias|buenas tardes|buenas noches)[,.!]?\s*/i, '');
  t = t.replace(/^(me llamo|mi nombre es|soy|yo soy|mi nombre)\s+/i, '');
  t = t.replace(/\s+(de la empresa|de|en)\s+.*$/i, '');
  t = t.replace(/[,.;:!?]+$/g, '').trim();
  const parts = t.split(/\s+/).filter(Boolean).map((p) => p.replace(/[,.;:!?]+$/g, ''));
  if (parts.length === 0) return null;
  const name = parts.slice(0, 2).join(' ');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function extractCompany(text) {
  const m = text.match(/(?:empresa|compania|negocio|trabajo en|soy de)\s+([A-Za-z0-9 .&-]{2,40})/i);
  return m ? m[1].trim() : null;
}

// ---------- seguridad: señales de estafa / extorsión ----------

const SCAM_PATTERNS = [
  'codigo de verificacion', 'codigo de seguridad', 'contrasena', 'password',
  'ganaste', 'premio', 'felicidades ganaste', 'verifica tu cuenta', 'cuenta bloqueada',
  'transfiere', 'transferencia urgente', 'deposita', 'secuestro', 'secuestrado',
  'te vamos a', 'si no pagas', 'amenaza', 'extorsion', 'haz clic aqui',
  'actualiza tus datos bancarios', 'datos bancarios', 'tarjeta de credito',
  'te grabe', 'video intimo', 'difundir',
];

function looksLikeScam(text) {
  const t = normalize(text);
  return SCAM_PATTERNS.some((p) => t.includes(normalize(p)));
}

// ---------- avisos a Pedro ----------

let mailer = null;
async function getMailer() {
  if (mailer) return mailer;
  if (!config.smtpHost || !config.smtpUser) return null;
  const nodemailer = require('nodemailer');
  mailer = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.smtpUser, pass: config.smtpPass },
  });
  return mailer;
}

async function notifyPeter(subject, body) {
  // 1) WhatsApp al número personal de Peter
  try {
    await wa.sendText(config.peterWhatsApp, `🔔 *Victoria — Blü Bee*\n\n${body}`);
  } catch (e) {
    console.error('No se pudo avisar a Pedro por WhatsApp:', e.message);
  }
  // 2) Correo (si hay SMTP configurado)
  try {
    const m = await getMailer();
    if (m) {
      await m.sendMail({
        from: config.smtpFrom,
        to: config.peterEmail,
        subject: `[Victoria] ${subject}`,
        text: body,
      });
    }
  } catch (e) {
    console.error('No se pudo mandar el correo a Pedro:', e.message);
  }
}

// ---------- textos de Victoria ----------

const CIERRE = 'Ha sido un gusto atenderle. En Blü Bee quedamos a sus órdenes. Inteligencia que conecta. ¡Platiquemos!';

const FAQ = {
  iot: 'El Internet de las Cosas (IoT) es conectar el mundo físico con inteligencia digital: saber lo que pasa en tu negocio y convertirlo en información útil en tiempo real.',
  quehace: 'En Blü Bee creamos soluciones de IoT a la medida de cada caso en específico. Cada empresa tiene necesidades distintas y diseñamos la solución para ese caso.',
  precio: 'Los precios son cotizaciones personalizadas según tu caso. Te tomo tus datos y Pedro te prepara una propuesta.',
  donde: 'Estamos en Querétaro, México, y atendemos a todo el país.',
  soporte: 'Sí, damos instalación y soporte local en español.',
};

const SECTOR_INFO = {
  vinedo: 'En un viñedo, creamos una solución para que cada visitante viva su propia historia y se sienta especial, mientras tú sabes qué les gusta, dónde se quedan y qué compran.',
  hotel: 'En un hotel, creamos una solución para entender cómo se mueven los huéspedes y optimizar la operación.',
  hospital: 'En un hospital, creamos una solución para saber dónde está lo importante, en segundos, no en minutos.',
  'centro comercial': 'En centros comerciales creamos soluciones que generan experiencias y valor real.',
  industria: 'En la industria, creamos soluciones para tener control de tus procesos, operaciones y logística, con información en tiempo real.',
  gobierno: 'Para dependencias de gobierno, creamos soluciones para conocer lo que pasa dentro de sus espacios y atender mejor a la gente.',
  ciudad: 'Para ciudades inteligentes, creamos soluciones que conectan espacios, servicios y personas con información en tiempo real.',
};

const MAIN_BUTTONS = [
  { id: 'info', title: 'Quiero información' },
  { id: 'demo', title: 'Agendar demostración' },
  { id: 'pedro', title: 'Hablar con Pedro' },
];

// ---------- cierre de cada chat ----------

async function closeChat(st) {
  const name = st.name ? `, ${st.name}` : '';
  // Cierre oficial en nota de voz (audio pregrabado con la voz de Victoria)
  try {
    if (fs.existsSync(config.media.closingAudio)) {
      await wa.sendAudio(st.phone, config.media.closingAudio);
    } else {
      await wa.sendText(st.phone, CIERRE);
    }
  } catch (e) {
    console.error('Error mandando el cierre:', e.message);
    await wa.sendText(st.phone, CIERRE).catch(() => null);
  }
  // Video del logotipo como cierre de marca
  try {
    if (fs.existsSync(config.media.logoVideo)) {
      await wa.sendVideo(st.phone, config.media.logoVideo);
    }
  } catch (e) {
    console.error('Error mandando el video del logo:', e.message);
  }
  st.stage = 'closed';
  saveState(st);
}

// ---------- transcripción de notas de voz ----------

function transcribeAudio(filePath) {
  return new Promise((resolve) => {
    const [cmd, ...args] = config.transcribeCmd.split(' ');
    execFile(cmd, [...args, filePath], { timeout: 120000 }, (err, stdout) => {
      if (err) return resolve(null);
      resolve((stdout || '').trim() || null);
    });
  });
}

// ---------- el corazón: procesar un mensaje entrante ----------

async function handleMessage(msg) {
  const from = msg.from;
  const st = loadState(from);
  const profileName = msg.profileName || null;

  // Texto del mensaje (o texto del botón que tocó)
  let text = '';
  if (msg.type === 'text') text = msg.text.body || '';
  else if (msg.type === 'interactive' && msg.interactive?.button_reply) {
    text = msg.interactive.button_reply.title || '';
    st.lastButton = msg.interactive.button_reply.id;
  } else if (msg.type === 'audio' || msg.type === 'voice') {
    // Nota de voz: descargarla y transcribirla
    try {
      const tmp = path.join(config.stateDir, `audio-${Date.now()}.ogg`);
      await wa.downloadMedia(msg.audio.id, tmp);
      const transcribed = await transcribeAudio(tmp);
      fs.unlink(tmp, () => {});
      if (!transcribed) {
        await wa.sendText(from, 'Perdón, no pude escuchar bien tu audio. ¿Me lo puedes repetir o escribir, por favor?');
        return;
      }
      text = transcribed;
    } catch (e) {
      console.error('Error con la nota de voz:', e.message);
      await wa.sendText(from, 'Perdón, no pude escuchar bien tu audio. ¿Me lo puedes escribir, por favor?');
      return;
    }
  } else {
    // Imágenes, stickers, etc.: no los procesa; avisa a Pedro si es algo raro
    return;
  }

  const norm = normalize(text);

  // Si ya se le pasó a Pedro, no seguir contestando (salvo que Pedro lo reactive borrando el estado)
  if (st.handedOff) {
    await notifyPeter('Mensaje de contacto en espera', `La persona ${st.name || from} (${from}) escribió de nuevo:\n"${text}"\n\nVictoria no contestó porque ya se le pasó a Pedro.`);
    return;
  }

  // Seguridad: posible estafa o extorsión -> se retira y avisa a Pedro
  if (looksLikeScam(text)) {
    await notifyPeter(
      '⚠️ Mensaje sospechoso',
      `Mensaje sospechoso de un número desconocido (${from}):\n"${text}"\n\nVictoria no siguió la conversación.`
    );
    return; // No contesta
  }

  // --- Primera vez: video de bienvenida + pedir nombre ---
  if (st.stage === 'new') {
    try {
      await wa.sendVideo(from, config.media.welcomeVideo);
    } catch (e) {
      console.error('Error mandando el video de bienvenida:', e.message);
    }
    await wa.sendText(
      from,
      'Hola, soy Victoria, la asistente de Blü Bee Technologies. ¿Me puede decir su nombre y en qué le puedo ayudar?'
    );
    st.stage = 'awaiting_name';
    saveState(st);
    return;
  }

  // --- Esperando el nombre ---
  if (st.stage === 'awaiting_name') {
    const name = extractName(text);
    const company = extractCompany(text);
    if (name && name.length >= 2) {
      st.name = name;
      if (company) st.company = company;
      st.stage = 'main';
      saveState(st);
      await wa.sendText(from, `Mucho gusto, ${name}. ¿En qué le puedo ayudar?`);
      await wa.sendButtons(from, '¿Qué le gustaría hacer?', MAIN_BUTTONS);
    } else {
      await wa.sendText(from, 'Perdón, no entendí su nombre. ¿Me lo puede decir, por favor?');
    }
    return;
  }

  // --- Flujo: agendar demostración ---
  if (st.stage === 'demo_company') {
    st.company = text.trim();
    st.stage = 'demo_when';
    saveState(st);
    await wa.sendText(from, 'Perfecto. ¿Qué día y hora le conviene para la demostración?');
    return;
  }
  if (st.stage === 'demo_when') {
    const when = text.trim();
    saveLead({ tipo: 'demostracion', nombre: st.name, empresa: st.company, telefono: from, diaHora: when });
    await notifyPeter(
      'Nueva demostración agendada',
      `Nueva solicitud de demostración:\n• Nombre: ${st.name || '(sin nombre)'}\n• Empresa: ${st.company || '(sin empresa)'}\n• Teléfono: ${from}\n• Día y hora: ${when}\n\nConfírmale la cita, por favor.`
    );
    await wa.sendText(
      from,
      `Listo, ${st.name || ''}. Ya le pasé sus datos a Pedro, él le confirma la demostración en cuanto pueda.`
    );
    await closeChat(st);
    return;
  }

  // --- Flujo: tomar un recado ---
  if (st.stage === 'taking_message') {
    saveLead({ tipo: 'recado', nombre: st.name, empresa: st.company, telefono: from, mensaje: text });
    await notifyPeter(
      'Nuevo recado',
      `Nuevo recado de ${st.name || '(sin nombre)'} (${from}):\n"${text}"`
    );
    await wa.sendText(from, 'Ya le pasé su mensaje a Pedro, él le responde en cuanto pueda.');
    await closeChat(st);
    return;
  }

  // --- Flujo: después de preguntar por precio, pedir nombre y empresa ---
  if (st.stage === 'awaiting_price_contact') {
    const name = extractName(text);
    const company = extractCompany(text);
    if (name) st.name = name;
    if (company) st.company = company;
    if (st.name) {
      st.stage = 'taking_message';
      saveState(st);
      await wa.sendText(from, `Gracias, ${st.name}. ¿Qué mensaje le dejo a Pedro para su propuesta?`);
    } else {
      await wa.sendText(from, 'Perdón, ¿me puede decir su nombre y su empresa, por favor?');
    }
    return;
  }

  // --- Esperando respuesta a la oferta del video ---
  if (st.stage === 'awaiting_video_answer') {
    if (contains(text, ['si', 'sí', 'claro', 'por favor', 'me gustaria', 'quiero verlo'])) {
      st.stage = 'main';
      saveState(st);
      try {
        await wa.sendVideo(from, config.media.commercialVideo);
      } catch (e) {
        console.error('Error mandando el comercial:', e.message);
        await wa.sendText(from, 'Perdón, no pude mandar el video ahorita. Le paso su recado a Pedro para que se lo comparta.');
      }
      await wa.sendText(from, '¿Le gustaría que Pedro le prepare una propuesta o agendar una demostración?');
      await wa.sendButtons(from, '¿Qué le gustaría hacer?', MAIN_BUTTONS);
    } else {
      st.stage = 'main';
      saveState(st);
      await wa.sendText(from, 'Claro, no hay problema. ¿En qué más le puedo ayudar?');
      await wa.sendButtons(from, '¿Qué le gustaría hacer?', MAIN_BUTTONS);
    }
    return;
  }

  // --- Conversación principal ---
  const name = st.name ? `, ${st.name}` : '';

  // Despedida / agradecimiento -> cierre
  if (contains(text, ['gracias', 'muchas gracias', 'adios', 'hasta luego', 'eso es todo', 'eso seria todo', 'perfecto gracias', 'ya quedo'])) {
    await wa.sendText(from, `Con gusto${name}.`);
    await closeChat(st);
    return;
  }

  // Botón o texto: hablar con Pedro
  if (st.lastButton === 'pedro' || contains(text, ['hablar con pedro', 'quiero hablar con pedro', 'pasame con pedro', 'con una persona', 'con un humano', 'con alguien'])) {
    st.lastButton = null;
    // Formal si pregunta por "Pedro Ledesma"
    if (contains(text, ['pedro ledesma'])) {
      await wa.sendText(from, 'Yo le paso su recado al Sr. Ledesma.');
    } else {
      await wa.sendText(from, 'Claro, te paso con Pedro. Te va a atender personalmente.');
    }
    st.handedOff = true;
    st.stage = 'handed_off';
    saveState(st);
    await notifyPeter(
      'Quieren hablar contigo',
      `${st.name || 'Una persona'} (${from}) pidió hablar contigo.\nEmpresa: ${st.company || '(sin empresa)'}\n\nVictoria dejó de contestar; el chat quedó en tus manos.`
    );
    return;
  }

  // Botón o texto: agendar demostración
  if (st.lastButton === 'demo' || contains(text, ['agendar', 'demostracion', 'demo', 'cita', 'reunion', 'quiero una demo'])) {
    st.lastButton = null;
    st.stage = st.company ? 'demo_when' : 'demo_company';
    saveState(st);
    if (st.company) {
      await wa.sendText(from, '¡Perfecto! La demostración es gratuita. ¿Qué día y hora le conviene?');
    } else {
      await wa.sendText(from, '¡Perfecto! La demostración es gratuita. Para agendarla necesito el nombre de su empresa o negocio.');
    }
    return;
  }

  // Botón o texto: quiero información
  if (st.lastButton === 'info') {
    st.lastButton = null;
    // cae al flujo de información de abajo
  }

  // Pregunta por "Pedro" (ya lo conoce) -> tomar recado
  if (contains(text, ['pedro'])) {
    st.stage = 'taking_message';
    saveState(st);
    await wa.sendText(from, 'Claro. ¿Qué mensaje le dejo a Pedro?');
    return;
  }

  // Proveedor / vende algo -> tomar recado sin comprometerse
  if (contains(text, ['vendo', 'ofrezco', 'proveedor', 'les vendo', 'quiero venderles', 'servicio para ustedes', 'les ofrezco'])) {
    st.stage = 'taking_message';
    saveState(st);
    await wa.sendText(from, 'Con gusto le tomo su mensaje y se lo paso a Pedro. ¿Qué le quiere decir?');
    return;
  }

  // Preguntas frecuentes
  if (contains(text, ['que es iot', 'que es el iot', 'que significa iot'])) {
    await wa.sendText(from, FAQ.iot);
    return;
  }
  if (contains(text, ['cuanto cuesta', 'precio', 'costo', 'cotizacion', 'cuanto cobran'])) {
    await wa.sendText(from, FAQ.precio);
    st.stage = 'awaiting_price_contact';
    saveState(st);
    await wa.sendText(from, '¿Me puede decir su nombre y su empresa para que Pedro le prepare su propuesta?');
    return;
  }
  if (contains(text, ['donde estan', 'donde se encuentran', 'ubicacion', 'direccion', 'donde estan ubicados'])) {
    await wa.sendText(from, FAQ.donde);
    return;
  }
  if (contains(text, ['soporte', 'ayuda tecnica', 'instalacion', 'instalan'])) {
    await wa.sendText(from, FAQ.soporte);
    return;
  }

  // Sectores
  for (const sector of Object.keys(SECTOR_INFO)) {
    if (contains(text, [sector])) {
      await wa.sendText(from, SECTOR_INFO[sector]);
      st.stage = 'awaiting_video_answer';
      saveState(st);
      await wa.sendText(from, '¿Le gustaría ver un breve video de lo que hacemos en Blü Bee?');
      return;
    }
  }

  // Información general de soluciones
  if (
    st.lastButton === 'info' ||
    contains(text, ['informacion', 'info', 'soluciones', 'que hacen', 'que ofrece', 'servicios', 'iot', 'blu bee', 'blubee'])
  ) {
    st.lastButton = null;
    await wa.sendText(
      from,
      'En Blü Bee creamos soluciones basadas en Internet de las Cosas (IoT), diseñadas para cada caso en específico. Cada empresa, hotel, hospital, viñedo o ciudad tiene necesidades distintas, y nosotros creamos la solución para ese caso.\n\n¿Para qué sector lo necesita? (Hotel, hospital, viñedo, centro comercial, industria, gobierno, ciudad inteligente…)'
    );
    return;
  }

  // No es de Blü Bee -> no contesta, avisa a Pedro
  if (
    contains(text, ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches']) &&
    norm.split(' ').length <= 3
  ) {
    await wa.sendText(from, `Hola${name}, soy Victoria, la asistente de Blü Bee Technologies. ¿En qué le puedo ayudar?`);
    return;
  }

  // No entendió / tema fuera de Blü Bee: avisa a Pedro sin contestar
  await notifyPeter(
    'Mensaje que no es de Blü Bee',
    `Mensaje en tu WhatsApp Business que no es de Blü Bee, de ${st.name || from} (${from}):\n"${text}"\n\nVictoria no contestó.`
  );
}

module.exports = { handleMessage, closeChat, notifyPeter };
