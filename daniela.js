// Daniela — la secretaria virtual de Blü Bee Technologies.
// Lógica de conversación: estados, intenciones, recados, seguridad y cierres.
// Diseño v2 (2026-11-10, aprobado por Peter): conversación humana, sin menús.
// Flujo: saludo con video → nombre+empresa → cómo dirigirse → datos de
// contacto (correo, teléfono, llamada/WhatsApp) → pregunta abierta → intención.
// Ver chatbot-whatsapp-blu-bee-diseno.md para el diseño completo.

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

// Capitaliza una palabra de nombre propio; los conectores van en minúscula.
function capitalizeNameWord(w) {
  const lower = w.toLowerCase();
  if (['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e'].includes(lower)) return lower;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function capitalizeName(name) {
  return name.split(/\s+/).filter(Boolean).map(capitalizeNameWord).join(' ');
}

function loadState(phone) {
  const defaults = {
    phone,
    stage: 'new',
    name: null,
    company: null,
    preferredName: null, // cómo prefiere que le llamen
    formality: 'usted', // 'usted' por defecto | 'tu'
    email: null,
    contactPhone: null, // número preferido (puede diferir del remitente)
    contactPref: null, // 'llamada' | 'whatsapp'
    needsContact: false, // faltan datos de contacto por capturar
    pendingNeed: null, // intención expresada antes de terminar la captura de datos
    need: null, // resumen corto de lo que necesita (para el resumen y el aviso)
    known: false,
    handedOff: false,
  };
  let st;
  try {
    st = JSON.parse(fs.readFileSync(path.join(STATE_DIR, `${phone}.json`), 'utf8'));
  } catch {
    return defaults;
  }
  const migrated = { ...defaults, ...st };
  // Migración de etapas del flujo viejo (v1) al flujo nuevo (v2).
  const stageMap = {
    awaiting_name: 'awaiting_name_company',
    awaiting_price_contact: 'price_capture',
    demo_company: 'demo_capture',
  };
  if (stageMap[migrated.stage]) migrated.stage = stageMap[migrated.stage];
  return migrated;
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

// ---------- extracción de nombre y empresa ----------

// Palabras que NUNCA forman parte de un nombre: intenciones, saludos, el
// nombre del bot y palabras de contenido. Sirve de guardia para no tomar
// frases como nombre ("Quiero saber", "quiero información", "agendar demo").
const NAME_BLOCK_WORDS = new Set([
  'hola', 'daniela', 'buenas', 'dias', 'tardes', 'noches',
  'quiero', 'necesito', 'busco', 'saber', 'informacion', 'info',
  'demo', 'demostracion', 'precio', 'costo', 'cotizacion', 'agendar',
  'hablar', 'pedro', 'ledesma', 'video', 'ver', 'pasame', 'dame', 'ayuda',
  'soluciones', 'blubee', 'blu', 'bee', 'tecnologias', 'tecnologia',
  'propuesta', 'cita', 'reunion', 'mensaje', 'recado', 'soporte',
  'instalacion', 'ubicacion', 'donde', 'cuanto', 'cuesta', 'cobran',
  'vendo', 'ofrezco', 'proveedor', 'gracias', 'adios', 'luego', 'claro',
  'si', 'no', 'favor', 'llamo', 'nombre', 'es', 'yo', 'soy', 'me',
  'vinedo', 'hotel', 'hospital', 'centro', 'comercial', 'industria',
  'gobierno', 'ciudad', 'inteligente', 'reiniciar',
]);

// Guardia: ¿puede este texto ser un nombre de persona?
// Con afterMarker=true (tras "soy / me llamo / mi nombre es") se permiten
// "Pedro" y "Ledesma": tras un marcador explícito sí son nombres, no la
// intención "hablar con Pedro".
function looksLikeName(candidate, opts = {}) {
  if (!candidate) return false;
  const c = candidate.trim();
  if (!c) return false;
  if (/[\d@]/.test(c)) return false;
  const words = c.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return false;
  if (words.some((w) => !/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ.]+$/.test(w))) return false;
  const normWords = words.map((w) => normalize(w));
  const block = opts.afterMarker ? NAME_BLOCK_WORDS_AFTER_MARKER : NAME_BLOCK_WORDS;
  if (normWords.some((w) => block.has(w))) return false;
  return true;
}

const NAME_BLOCK_WORDS_AFTER_MARKER = new Set(
  [...NAME_BLOCK_WORDS].filter((w) => w !== 'pedro' && w !== 'ledesma')
);

// Palabras genéricas que por sí solas no son una empresa ("mi empresa").
const GENERIC_COMPANY_WORDS = new Set([
  'la', 'el', 'de', 'del', 'los', 'las', 'mi', 'su', 'empresa', 'compania', 'negocio',
]);

// Escapa un texto para usarlo en una expresión regular.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Corta la cola de un nombre de empresa en la primera palabra de intención
// ("La Redonda quiero una demo" -> "La Redonda").
function cleanCompanyTail(cand) {
  const words = cand.split(/\s+/).filter(Boolean);
  const stopIdx = words.findIndex((w) => COMPANY_BLOCK_WORDS.has(normalize(w)));
  const kept = stopIdx === -1 ? words : words.slice(0, stopIdx);
  return kept.join(' ').replace(/[,.;:!?]+$/g, '').trim();
}

// Guardia: ¿puede este texto ser un nombre de empresa?
function looksLikeCompanyName(company) {
  if (!company) return false;
  const c = company.trim();
  if (c.length < 2 || /[\d@]/.test(c)) return false;
  const n = normalize(c);
  if (n.includes('blu bee') || n.includes('blubee')) return false;
  const words = c.split(/\s+/).filter(Boolean);
  if (words.every((w) => GENERIC_COMPANY_WORDS.has(normalize(w)))) return false;
  return true;
}

// Extrae { name, company } de un mensaje. Reglas:
// - Ignora saludos ("hola") y el nombre del bot ("Daniela") en cualquier
//   posición: "hola Daniela soy Ana" -> nombre "Ana" (caso real 2026-11-10).
// - "Soy María González de Hotel Casa Blanca" -> María González / Hotel Casa Blanca.
// - "Me llamo María, de la empresa La Redonda" -> María / La Redonda.
// - "Quiero saber más de Blü Bee Technologies" -> { name: null, company: null }
//   (la guardia rechaza "Quiero saber" como nombre y no guarda "Blü Bee" como empresa).
function parseNameCompany(text) {
  let t = (text || '').trim();
  // 1. Quitar saludos iniciales y el nombre del bot ("Daniela") donde aparezca.
  t = t.replace(/^(hola|buenas|buenos dias|buenas tardes|buenas noches)[,.!]?\s*/i, '');
  t = t.replace(/\bdaniela\b[,.!]?\s*/gi, '');
  t = t.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/, '').trim();
  t = t.replace(/^(hola|buenas|buenos dias|buenas tardes|buenas noches)[,.!]?\s*/i, '').trim();

  // 2. Empresa por marcadores explícitos.
  let company = null;
  let companyFromMarker = false;
  const companyMarkers = /(?:de la empresa|de la compania|empresa|compania|negocio|trabajo en|trabajo para|soy de|del hotel|del vinedo|del hospital|de la clinica)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .&'’-]{2,40})/i;
  const m = t.match(companyMarkers);
  let nameText = t;
  if (m) {
    const cand = cleanCompanyTail(m[1]);
    if (looksLikeCompanyName(cand)) {
      company = cand;
      companyFromMarker = true;
      nameText = t.replace(m[0], '').trim();
    }
  }

  // 3. Empresa por " de " (última ocurrencia): "Soy María González de Hotel
  //    Casa Blanca". No se parte si antes de "de" hay una sola palabra
  //    ("María de los Ángeles" es un nombre) ni si después empieza con
  //    los/las/del/de/la (apellidos como "de la Vega").
  if (!company) {
    const parts = nameText.split(/\s+de\s+/i);
    if (parts.length > 1) {
      const before = parts.slice(0, -1).join(' de ');
      const after = parts[parts.length - 1].replace(/[,.;:!?]+$/g, '').trim();
      const beforeWords = before.split(/\s+/).filter(Boolean).length;
      const afterWords = after.split(/\s+/).filter(Boolean).length;
      if (beforeWords >= 2 && afterWords >= 2 && !/^(los|las|del|de|la)\b/i.test(after)) {
        company = cleanCompanyTail(after);
        nameText = before;
      }
    }
  }

  // 4. Nombre: por marcador ("me llamo / mi nombre es / soy / yo soy") o texto libre.
  let name = null;
  const marker = nameText.match(/^(?:me llamo|mi nombre es|yo soy|soy|mi nombre)\s+(.+)$/i);
  let candidate = null;
  if (marker) {
    const words = marker[1].trim().split(/\s+/);
    const taken = [];
    for (const w of words) {
      const nw = normalize(w.replace(/[,.;:!?]+$/g, ''));
      if (['de', 'del', 'la', 'el', 'en', 'y', 'o', 'con', 'para', 'por', 'que', 'su', 'mi'].includes(nw)) break;
      if (NAME_BLOCK_WORDS_AFTER_MARKER.has(nw)) break;
      taken.push(w.replace(/[,.;:!?]+$/g, ''));
      if (taken.length >= 3) break;
    }
    candidate = taken.join(' ');
    if (looksLikeName(candidate, { afterMarker: true })) name = capitalizeName(candidate);
  } else {
    candidate = nameText.replace(/[,.;:!?]+$/g, '').trim();
    if (looksLikeName(candidate)) name = capitalizeName(candidate);
  }

  // 5. Sin nombre válido, la empresa por " de " no se conserva (evita guardar
  //    "Blü Bee Technologies" como empresa de alguien que solo preguntó algo).
  if (!name && company && !companyFromMarker) company = null;
  if (company && !looksLikeCompanyName(company)) company = null;
  if (company) company = capitalizeName(company);
  return { name, company };
}

function extractName(text) {
  return parseNameCompany(text).name;
}

function extractCompany(text) {
  return parseNameCompany(text).company;
}

// Palabras que impiden tomar un texto como nombre de empresa en el punto de
// captura ("Quiero agendar una demo" no es una empresa; "Hotel Casa Blanca" sí).
const COMPANY_BLOCK_WORDS = new Set([
  'quiero', 'necesito', 'busco', 'saber', 'informacion', 'info', 'demo',
  'demostracion', 'precio', 'costo', 'cotizacion', 'agendar', 'hablar',
  'pedro', 'ledesma', 'gracias', 'adios', 'hola', 'daniela', 'buenas',
  'video', 'ver', 'pasame', 'dame', 'ayuda', 'mensaje', 'recado', 'propuesta',
  'cita', 'reunion', 'soporte', 'instalacion', 'donde', 'cuanto', 'cuesta',
  'cobran', 'vendo', 'ofrezco', 'proveedor', 'blu', 'bee', 'blubee',
  'tecnologias', 'tecnologia', 'soluciones', 'si', 'no', 'claro', 'favor',
  'empresa', 'compania', 'negocio',
]);

// ¿Parece esto un nombre de empresa? (para capturar la empresa sola cuando
// ya tenemos el nombre pero falta la empresa).
function looksLikeCompany(text) {
  const t = (text || '').trim().replace(/[,.;:!?]+$/g, '');
  if (!t || /[\d@]/.test(t)) return null;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 6) return null;
  const nw = words.map((w) => normalize(w));
  if (nw.some((w) => COMPANY_BLOCK_WORDS.has(w))) return null;
  return capitalizeName(t);
}

// ---------- cómo dirigirse (trato preferido) ----------

function parseAddressPref(text, fallbackName) {
  const norm = normalize(text);
  let formality = 'usted';
  if (/\btu\b/.test(norm) && !/\busted\b/.test(norm)) formality = 'tu';
  else if (/\busted\b/.test(norm)) formality = 'usted';

  let preferredName = null;
  const nick = text.match(/(?:llamame|llámame|dime|me dicen|me llamo|soy)\s+((?:Lic\.?|Ing\.?|Dr\.?|Dra\.?|Sr\.?|Sra\.?)\s+)?([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)?)/i);
  if (nick) {
    const title = nick[1] ? nick[1].trim().replace(/^(lic|ing|dr|dra|sr|sra)$/i, (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() + '.') : '';
    const base = nick[2].trim();
    const baseClean = base.replace(/^(Lic|Ing|Dr|Dra|Sr|Sra)\.?\s*/i, '').trim();
    if (looksLikeName(baseClean)) {
      preferredName = title ? `${title} ${capitalizeName(base)}` : capitalizeName(base);
    }
  }
  if (!preferredName) preferredName = fallbackName;
  return { formality, preferredName };
}

// ---------- datos de contacto ----------

function parseContact(text, from) {
  const emailMatch = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  const email = emailMatch ? emailMatch[0] : null;

  let phone = null;
  const groups = text.match(/\d[\d\s\-()]{7,}\d/g) || [];
  for (const g of groups) {
    const d = g.replace(/\D/g, '');
    if (d.length >= 10 && d.length <= 13) { phone = d; break; }
  }

  const norm = normalize(text);
  let pref = null;
  if (/\bllamada\b/.test(norm) || /\bllamarme\b/.test(norm) || /\bllamen\b/.test(norm) || /\bllama\b/.test(norm)) pref = 'llamada';
  if (/\bwhatsapp\b/.test(norm) || /\bwhats\b/.test(norm)) pref = 'whatsapp';
  if (/\b(mismo numero|este numero|al mismo|este mismo)\b/.test(norm)) {
    phone = from; // "al mismo número": el remitente de WhatsApp
  }

  const declined = !email && !phone && !pref && (
    /(no tengo|no quiero|prefiero no|sin correo|no es necesario|no tengo correo|no me gusta dar)/.test(norm)
    || (norm.split(' ').filter(Boolean).length <= 2 && /\bno\b/.test(norm))
  );
  return { email, phone, pref, declined };
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

// Bloque con TODOS los datos capturados, para que Pedro guarde el contacto
// de inmediato (su teléfono rechaza llamadas de números no registrados).
function contactBlock(st) {
  if (!st) return '';
  const lines = [];
  if (st.name) {
    lines.push(st.preferredName && st.preferredName !== st.name
      ? `• Nombre: ${st.name} (le gusta que le llamen ${st.preferredName})`
      : `• Nombre: ${st.name}`);
  }
  if (st.company) lines.push(`• Empresa: ${st.company}`);
  if (st.email) lines.push(`• Correo: ${st.email}`);
  lines.push(`• WhatsApp: ${st.phone}`);
  if (st.contactPhone && st.contactPhone !== st.phone) lines.push(`• Teléfono de contacto: ${st.contactPhone}`);
  if (st.contactPref) lines.push(`• Prefiere: ${st.contactPref === 'llamada' ? 'llamada' : 'WhatsApp'}`);
  if (st.preferredName) lines.push(`• Trato: ${st.preferredName}, de ${st.formality === 'tu' ? 'tú' : 'usted'}`);
  if (st.need) lines.push(`• Necesidad: ${st.need}`);
  return lines.length ? `\n\nDatos capturados:\n${lines.join('\n')}` : '';
}

async function notifyPeter(subject, body, st) {
  const fullBody = st ? `${body}${contactBlock(st)}` : body;
  // 1) WhatsApp al número personal de Peter
  try {
    await wa.sendText(config.peterWhatsApp, `🔔 *Daniela — Blü Bee*\n\n${fullBody}`);
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
        subject: `[Daniela] ${subject}`,
        text: fullBody,
      });
    }
  } catch (e) {
    console.error('No se pudo mandar el correo a Pedro:', e.message);
  }
}

// ---------- textos de Daniela ----------

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

// ---------- cierre de cada chat ----------

async function closeChat(st) {
  // Resumen de confirmación con todos los datos capturados, antes del cierre.
  const dataLines = [];
  if (st.name) {
    dataLines.push(st.preferredName && st.preferredName !== st.name
      ? `• Nombre: ${st.name} (le gusta que le llamen ${st.preferredName})`
      : `• Nombre: ${st.name}`);
  }
  if (st.company) dataLines.push(`• Empresa: ${st.company}`);
  if (st.email) dataLines.push(`• Correo: ${st.email}`);
  if (st.contactPhone && st.contactPhone !== st.phone) dataLines.push(`• Teléfono de contacto: ${st.contactPhone}`);
  if (st.contactPref) dataLines.push(`• Prefiere: ${st.contactPref === 'llamada' ? 'llamada' : 'WhatsApp'}`);
  if (st.preferredName) dataLines.push(`• Trato: ${st.preferredName}, de ${st.formality === 'tu' ? 'tú' : 'usted'}`);
  if (st.need) dataLines.push(`• Necesidad: ${st.need}`);
  if (dataLines.length > 0) {
    try {
      await wa.sendText(st.phone, `Antes de despedirme, le confirmo lo que le paso a Pedro:\n${dataLines.join('\n')}\n• WhatsApp: ${st.phone}`);
    } catch (e) {
      console.error('Error mandando el resumen:', e.message);
    }
  }
  // Cierre oficial en nota de voz (audio pregrabado con la voz de Daniela)
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

// ---------- detección de intención (solo texto libre, sin menús) ----------

function detectIntent(text, norm) {
  if (contains(text, ['gracias', 'muchas gracias', 'adios', 'hasta luego', 'eso es todo', 'eso seria todo', 'perfecto gracias', 'ya quedo'])) return { kind: 'farewell' };
  if (contains(text, ['hablar con pedro', 'quiero hablar con pedro', 'pasame con pedro', 'con una persona', 'con un humano', 'con alguien'])) return { kind: 'pedro' };
  if (contains(text, ['agendar', 'demostracion', 'demo', 'cita', 'reunion', 'quiero una demo'])) return { kind: 'demo' };
  if (contains(text, ['pedro'])) return { kind: 'pedro_message' };
  if (contains(text, ['vendo', 'ofrezco', 'proveedor', 'les vendo', 'quiero venderles', 'servicio para ustedes', 'les ofrezco'])) return { kind: 'vendor' };
  if (contains(text, ['que es iot', 'que es el iot', 'que significa iot'])) return { kind: 'faq', key: 'iot' };
  if (contains(text, ['cuanto cuesta', 'precio', 'costo', 'cotizacion', 'cuanto cobran'])) return { kind: 'price' };
  if (contains(text, ['donde estan', 'donde se encuentran', 'ubicacion', 'direccion', 'donde estan ubicados'])) return { kind: 'faq', key: 'donde' };
  if (contains(text, ['soporte', 'ayuda tecnica', 'instalacion', 'instalan'])) return { kind: 'faq', key: 'soporte' };
  for (const sector of Object.keys(SECTOR_INFO)) {
    if (contains(text, [sector])) return { kind: 'sector', key: sector };
  }
  if (contains(text, ['informacion', 'info', 'soluciones', 'que hacen', 'que ofrece', 'servicios', 'iot', 'blu bee', 'blubee'])) return { kind: 'info' };
  if (contains(text, ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches']) && norm.split(' ').length <= 3) return { kind: 'greeting' };
  return null;
}

// ¿Es un sí? (palabra completa "sí", no subcadenas como "siempre" o "sin").
function isAffirmative(text) {
  const words = normalize(text).split(' ').filter(Boolean);
  if (words.includes('si')) return true;
  return contains(text, ['claro', 'por favor', 'me gustaria', 'quiero verlo', 'si quiero', 'adelante', 'dale']);
}

// ---------- el corazón: procesar un mensaje entrante ----------

async function handleMessage(msg) {
  const from = msg.from;
  const st = loadState(from);
  // Una conversación cerrada que vuelve empieza de nuevo en 'main': saludo
  // por nombre, sin repetir el video ni volver a pedir datos.
  if (st.stage === 'closed') {
    st.stage = 'main';
    saveState(st); // si no, el archivo queda en 'closed' aunque ya esté activa
  }

  // Texto del mensaje (o texto del botón que tocó, por compatibilidad)
  let text = '';
  if (msg.type === 'text') text = msg.text.body || '';
  else if (msg.type === 'interactive' && msg.interactive?.button_reply) {
    text = msg.interactive.button_reply.title || '';
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

  // Comando de reinicio SOLO para Pedro (probar a Daniela repetidamente).
  // Si Pedro quedó en handedOff tras tocar "Hablar con Pedro", con esto
  // vuelve a empezar desde cero. Nadie más puede usarlo: solo responde
  // al número personal de Peter y al texto exacto "reiniciar daniela".
  if (from === config.peterWhatsApp && norm === 'reiniciar daniela') {
    try {
      fs.unlinkSync(path.join(STATE_DIR, `${from}.json`));
    } catch { /* no había estado guardado */ }
    const fresh = loadState(from); // valores por defecto, etapa 'new'
    try {
      await wa.sendVideo(from, config.media.welcomeVideo);
    } catch (e) {
      console.error('Error mandando el video de bienvenida:', e.message);
    }
    await wa.sendText(
      from,
      'Hola, soy Daniela, la asistente de Blü Bee Technologies. Para atenderle como se merece, ¿me dice su nombre y de qué empresa nos escribe?'
    );
    fresh.stage = 'awaiting_name_company';
    saveState(fresh);
    return;
  }

  // Si ya se le pasó a Pedro, no seguir contestando (salvo que Pedro lo reactive borrando el estado)
  if (st.handedOff) {
    await notifyPeter('Mensaje de contacto en espera', `La persona ${st.name || from} (${from}) escribió de nuevo:\n"${text}"\n\nDaniela no contestó porque ya se le pasó a Pedro.`, st);
    return;
  }

  // Seguridad: posible estafa o extorsión -> se retira y avisa a Pedro
  if (looksLikeScam(text)) {
    await notifyPeter(
      '⚠️ Mensaje sospechoso',
      `Mensaje sospechoso de un número desconocido (${from}):\n"${text}"\n\nDaniela no siguió la conversación.`,
      st
    );
    return; // No contesta
  }

  // --- Primera vez: video de bienvenida + pedir nombre y empresa ---
  if (st.stage === 'new') {
    try {
      await wa.sendVideo(from, config.media.welcomeVideo);
    } catch (e) {
      console.error('Error mandando el video de bienvenida:', e.message);
    }
    // Si el primer mensaje ya trae el nombre ("hola Daniela soy Ana"),
    // no se lo vuelve a pedir: se guarda y se pasa a cómo dirigirse.
    const first = parseNameCompany(text);
    if (first.name) {
      st.name = first.name;
      if (first.company) st.company = first.company;
      st.needsContact = !first.company;
      // La intención se detecta sin el nombre y la empresa (para no
      // confundir "Hotel Casa Blanca" con interés por el sector hotel).
      const stripped = [first.name, first.company].filter(Boolean)
        .reduce((acc, s) => acc.replace(new RegExp(escapeRegExp(s), 'i'), ''), text);
      const intent = detectIntent(stripped, normalize(stripped));
      if (intent && ['demo', 'price', 'pedro', 'pedro_message', 'vendor', 'sector', 'faq', 'info'].includes(intent.kind)) {
        st.pendingNeed = { text: stripped, norm: normalize(stripped) };
      }
      st.stage = 'awaiting_address_pref';
      saveState(st);
      await wa.sendText(from, `Mucho gusto, ${first.name}. ¿Cómo prefiere que le llame? ¿Le hablo de tú o de usted?`);
      return;
    }
    await wa.sendText(
      from,
      'Hola, soy Daniela, la asistente de Blü Bee Technologies. Para atenderle como se merece, ¿me dice su nombre y de qué empresa nos escribe?'
    );
    st.stage = 'awaiting_name_company';
    saveState(st);
    return;
  }

  // --- Esperando nombre + empresa ---
  if (st.stage === 'awaiting_name_company') {
    const { name, company } = parseNameCompany(text);
    if (name) {
      st.name = name;
      if (company) st.company = company;
      st.needsContact = !company;
      // La intención se detecta sin el nombre y la empresa (para no
      // confundir "Hotel Casa Blanca" con interés por el sector hotel).
      const stripped = [name, company].filter(Boolean)
        .reduce((acc, s) => acc.replace(new RegExp(escapeRegExp(s), 'i'), ''), text);
      const intent = detectIntent(stripped, normalize(stripped));
      if (intent && ['demo', 'price', 'pedro', 'pedro_message', 'vendor', 'sector', 'faq', 'info'].includes(intent.kind)) {
        st.pendingNeed = { text: stripped, norm: normalize(stripped) };
      }
      st.stage = 'awaiting_address_pref';
      saveState(st);
      await wa.sendText(from, `Mucho gusto, ${name}. ¿Cómo prefiere que le llame? ¿Le hablo de tú o de usted?`);
      return;
    }
    // Sin nombre válido: NO insistir en bucle. Se ayuda con lo que pidieron
    // y los datos se capturan en el punto natural (demo, recado, propuesta).
    st.needsContact = true;
    if (company) st.company = company;
    saveState(st);
    const intent = detectIntent(text, norm);
    if (!intent) {
      const ackWords = ['ok', 'va', 'perfecto', 'claro', 'entendido', 'entiendo', 'bien', 'vale', 'sale', 'de acuerdo'];
      if (ackWords.includes(norm)) {
        st.stage = 'main';
        saveState(st);
        await wa.sendText(from, '¿En qué le puedo ayudar?');
        return;
      }
    }
    return handleMainIntent(msg, st, text, norm);
  }

  // --- Esperando cómo dirigirse ---
  if (st.stage === 'awaiting_address_pref') {
    const { formality, preferredName } = parseAddressPref(text, st.name);
    st.formality = formality;
    st.preferredName = preferredName;
    st.stage = 'awaiting_contact';
    saveState(st);
    await wa.sendText(from, 'Perfecto. ¿Me comparte su correo y el número donde prefiere que le contactemos? ¿Prefiere llamada o WhatsApp?');
    return;
  }

  // --- Esperando datos de contacto ---
  if (st.stage === 'awaiting_contact') {
    const parsed = parseContact(text, from);
    if (parsed.email) st.email = parsed.email;
    if (parsed.phone) st.contactPhone = parsed.phone;
    if (parsed.pref) st.contactPref = parsed.pref;
    st.stage = 'main';
    saveState(st);
    if (parsed.declined) {
      await wa.sendText(from, 'Sin problema, con su número de WhatsApp es suficiente.');
    } else if (parsed.email || parsed.phone || parsed.pref) {
      const got = [];
      if (parsed.email) got.push('su correo');
      if (parsed.phone) got.push('su número');
      if (parsed.pref) got.push(parsed.pref === 'llamada' ? 'que prefiere llamada' : 'que prefiere WhatsApp');
      await wa.sendText(from, `Perfecto, ya anoté ${got.join(', ')}.`);
    }
    // Si ya habían expresado su necesidad, atenderla ahora.
    if (st.pendingNeed) {
      const need = st.pendingNeed;
      st.pendingNeed = null;
      saveState(st);
      return handleMainIntent(msg, st, need.text, need.norm);
    }
    // Si en este mismo mensaje expresan una necesidad (sin el correo de por
    // medio), atenderla; si no, pregunta abierta.
    const restText = parsed.email ? text.replace(parsed.email, '') : text;
    const intent = detectIntent(restText, normalize(restText));
    if (intent && intent.kind !== 'greeting') {
      return handleMainIntent(msg, st, restText, normalize(restText));
    }
    await wa.sendText(from, `¿En qué ${st.formality === 'tu' ? 'te' : 'le'} puedo ayudar?`);
    return;
  }

  // --- Captura de datos faltantes antes de agendar la demo ---
  if (st.stage === 'demo_capture') {
    const { name, company } = parseNameCompany(text);
    if (name) st.name = name;
    if (company) st.company = company;
    if (!st.name && !st.company) {
      const onlyCompany = looksLikeCompany(text);
      if (onlyCompany) st.company = onlyCompany;
    }
    st.needsContact = !(st.name && st.company);
    st.stage = 'demo_when';
    saveState(st);
    const display = st.preferredName || st.name;
    await wa.sendText(from, display
      ? `Gracias, ${display}. ¿Qué día y hora ${st.formality === 'tu' ? 'te' : 'le'} conviene para la demostración?`
      : 'Gracias. ¿Qué día y hora le conviene para la demostración?');
    return;
  }

  // --- Agendar demostración: día y hora ---
  if (st.stage === 'demo_when') {
    const when = text.trim();
    st.need = `Demostración: ${when}`;
    saveLead({
      tipo: 'demostracion',
      nombre: st.name,
      empresa: st.company,
      telefono: from,
      diaHora: when,
      correo: st.email || null,
      telefonoContacto: st.contactPhone || from,
      preferencia: st.contactPref || null,
    });
    await notifyPeter(
      'Nueva demostración agendada',
      `Nueva solicitud de demostración:\n• Día y hora: ${when}\n\nConfírmale la cita, por favor.`,
      st
    );
    const display = st.preferredName || st.name;
    await wa.sendText(
      from,
      `Listo${display ? `, ${display}` : ''}. Ya le pasé sus datos a Pedro, él le confirma la demostración en cuanto pueda.`
    );
    await closeChat(st);
    return;
  }

  // --- Captura de datos faltantes antes de tomar un recado (precio/propuesta) ---
  if (st.stage === 'price_capture') {
    const { name, company } = parseNameCompany(text);
    if (name) st.name = name;
    if (company) st.company = company;
    if (!st.name && !st.company) {
      const onlyCompany = looksLikeCompany(text);
      if (onlyCompany) st.company = onlyCompany;
    }
    st.needsContact = !(st.name && st.company);
    st.stage = 'taking_message';
    saveState(st);
    const display = st.preferredName || st.name;
    await wa.sendText(from, display
      ? `Gracias, ${display}. ¿Qué mensaje le dejo a Pedro para su propuesta?`
      : '¿Qué mensaje le dejo a Pedro para su propuesta?');
    return;
  }

  // --- Tomar un recado ---
  if (st.stage === 'taking_message') {
    st.need = `Recado: ${text.length > 100 ? `${text.slice(0, 100)}…` : text}`;
    saveLead({
      tipo: 'recado',
      nombre: st.name,
      empresa: st.company,
      telefono: from,
      mensaje: text,
      correo: st.email || null,
      telefonoContacto: st.contactPhone || from,
      preferencia: st.contactPref || null,
    });
    await notifyPeter(
      'Nuevo recado',
      `Nuevo recado de ${st.name || '(sin nombre)'} (${from}):\n"${text}"`,
      st
    );
    await wa.sendText(from, 'Ya le pasé su mensaje a Pedro, él le responde en cuanto pueda.');
    await closeChat(st);
    return;
  }

  // --- Esperando respuesta a la oferta del video ---
  if (st.stage === 'awaiting_video_answer') {
    if (isAffirmative(text)) {
      st.stage = 'main';
      saveState(st);
      try {
        await wa.sendVideo(from, config.media.commercialVideo);
      } catch (e) {
        console.error('Error mandando el comercial:', e.message);
        await wa.sendText(from, 'Perdón, no pude mandar el video ahorita. Le paso su recado a Pedro para que se lo comparta.');
      }
      await wa.sendText(from, '¿Le gustaría que Pedro le prepare una propuesta o agendar una demostración?');
    } else {
      st.stage = 'main';
      saveState(st);
      await wa.sendText(from, 'Claro, no hay problema. ¿En qué más le puedo ayudar?');
    }
    return;
  }

  // --- Conversación principal (texto libre, sin menús) ---
  return handleMainIntent(msg, st, text, norm);
}

// ---------- conversación principal: solo intención por texto libre ----------

async function handleMainIntent(msg, st, text, norm) {
  const from = st.phone;
  const display = st.preferredName || st.name || '';
  const nameSuffix = display ? `, ${display}` : '';
  const leTe = st.formality === 'tu' ? 'te' : 'le';
  const intent = detectIntent(text, norm);

  // Sin intención clara y fuera de tema: no contesta, avisa a Pedro.
  if (!intent) {
    await notifyPeter(
      'Mensaje que no es de Blü Bee',
      `Mensaje en tu WhatsApp Business que no es de Blü Bee, de ${st.name || from} (${from}):\n"${text}"\n\nDaniela no contestó.`,
      st
    );
    return;
  }

  switch (intent.kind) {
    case 'farewell': {
      await wa.sendText(from, `Con gusto${nameSuffix}.`);
      await closeChat(st);
      return;
    }

    case 'pedro': {
      // Formal si pregunta por "Pedro Ledesma"
      const formal = contains(text, ['pedro ledesma']);
      await wa.sendText(from, formal
        ? 'Yo le paso su recado al Sr. Ledesma.'
        : 'Claro, te paso con Pedro. Te va a atender personalmente.');
      st.need = 'Hablar con Pedro';
      st.handedOff = true;
      st.stage = 'handed_off';
      saveState(st);
      await notifyPeter(
        'Quieren hablar contigo',
        `${st.name || 'Una persona'} (${from}) pidió hablar contigo.`,
        st
      );
      return;
    }

    case 'demo': {
      st.need = 'Agendar demostración';
      if (!st.name || !st.company) {
        st.needsContact = true;
        st.stage = 'demo_capture';
        saveState(st);
        await wa.sendText(from, !st.name
          ? '¡Perfecto! La demostración es gratuita. Para agendarla, ¿me dice su nombre y de qué empresa nos escribe?'
          : '¡Perfecto! La demostración es gratuita. ¿De qué empresa nos escribe?');
        return;
      }
      st.stage = 'demo_when';
      saveState(st);
      await wa.sendText(from, `¡Perfecto! La demostración es gratuita. ¿Qué día y hora ${leTe} conviene?`);
      return;
    }

    case 'pedro_message': {
      // Pregunta por "Pedro" (ya lo conoce) -> tomar recado
      st.need = 'Recado para Pedro';
      st.stage = 'taking_message';
      saveState(st);
      await wa.sendText(from, 'Claro. ¿Qué mensaje le dejo a Pedro?');
      return;
    }

    case 'vendor': {
      // Proveedor / vende algo -> tomar recado sin comprometerse
      st.need = 'Recado (proveedor)';
      st.stage = 'taking_message';
      saveState(st);
      await wa.sendText(from, 'Con gusto le tomo su mensaje y se lo paso a Pedro. ¿Qué le quiere decir?');
      return;
    }

    case 'price': {
      await wa.sendText(from, FAQ.precio);
      st.need = 'Propuesta / precio';
      if (!st.name || !st.company) {
        st.needsContact = true;
        st.stage = 'price_capture';
        saveState(st);
        await wa.sendText(from, '¿Me puede decir su nombre y su empresa para que Pedro le prepare su propuesta?');
        return;
      }
      st.stage = 'taking_message';
      saveState(st);
      await wa.sendText(from, `Gracias, ${display}. ¿Qué mensaje le dejo a Pedro para su propuesta?`);
      return;
    }

    case 'faq': {
      await wa.sendText(from, FAQ[intent.key]);
      return;
    }

    case 'sector': {
      await wa.sendText(from, SECTOR_INFO[intent.key]);
      st.stage = 'awaiting_video_answer';
      saveState(st);
      await wa.sendText(from, '¿Le gustaría ver un breve video de lo que hacemos en Blü Bee?');
      return;
    }

    case 'info': {
      await wa.sendText(
        from,
        'En Blü Bee creamos soluciones basadas en Internet de las Cosas (IoT), diseñadas para cada caso en específico. Cada empresa, hotel, hospital, viñedo o ciudad tiene necesidades distintas, y nosotros creamos la solución para ese caso.\n\n¿Para qué sector lo necesita? (Hotel, hospital, viñedo, centro comercial, industria, gobierno, ciudad inteligente…)'
      );
      return;
    }

    case 'greeting': {
      // Saludo por nombre si ya lo conoce (por perfil o por conversación).
      let greetName = display;
      if (!greetName && msg.profileName && looksLikeName(msg.profileName)) {
        greetName = capitalizeName(msg.profileName);
      }
      await wa.sendText(from, greetName
        ? `Hola, ${greetName}, soy Daniela, la asistente de Blü Bee Technologies. ¿En qué ${leTe} puedo ayudar?`
        : `Hola, soy Daniela, la asistente de Blü Bee Technologies. ¿En qué ${leTe} puedo ayudar?`);
      return;
    }
  }
}

module.exports = {
  handleMessage,
  closeChat,
  notifyPeter,
  extractName,
  extractCompany,
  parseNameCompany,
  looksLikeName,
  looksLikeCompany,
  parseAddressPref,
  parseContact,
  detectIntent,
};
