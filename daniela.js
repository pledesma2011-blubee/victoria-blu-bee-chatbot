// Daniela — la secretaria virtual de Blü Bee Technologies.
// Lógica de conversación: estados, intenciones, recados, seguridad y cierres.
// Diseño v2 (2026-11-10, aprobado por Peter): conversación humana, sin menús.
// Flujo: saludo con video → nombre+empresa → cómo dirigirse → datos de
// contacto (correo, teléfono, llamada/WhatsApp) → pregunta abierta → intención.
// Límites v2.1 (2026-11-10, aprobado por Peter): obscenidades, pruebas de IA
// ("¿eres un robot?") y preguntas generales fuera del negocio: una
// redirección amable y, si insisten, silencio + aviso a Pedro.
// Regla de anonimato del CEO (2026-11-10, aprobada por Peter): Daniela NUNCA
// dice "Pedro" a un extraño; el traspaso es a "la persona indicada" o "el
// área correspondiente". Solo si el contacto preguntó por "Pedro Ledesma"
// por su nombre se puede decir "Sr. Ledesma". Los avisos a Peter (internos)
// siguen con todos los datos.
// "Daniela inteligente" v3 (2026-11-11, aprobado por Peter): consultora
// ágil, no solo recepcionista. Base de conocimiento (conocimiento.js) para
// responder preguntas de tecnología/IoT/servicios como experta; detección de
// sector y respuestas adaptadas; flujo ágil intent-first (la necesidad manda,
// la identidad se teje en la conversación); notas de voz con Whisper (Groq,
// gratis; OpenAI de respaldo); contactos personales / temas que no son Blü Bee se canalizan a
// Pedro con calidez; aprendizaje (preguntas sin respuesta en
// state/preguntas-sin-respuesta.json); video de despedida personalizado
// (guion institucional fijo, solo cambia el nombre) con entrega inmediata
// o diferida.
// Diminutivos y cariños (v3.1, 2026-11-11, caso real: Ricardo Roach saludó
// "hola Dani"): Daniela entiende que le hablan A ELLA cuando le dicen un
// diminutivo o un cariño, no lo toma a mal y responde con calidez y
// profesionalismo. El límite de acoso/coqueteo (v2.1) sigue para insistencia
// o mensajes explícitamente inapropiados. Ver chatbot-whatsapp-blu-bee-diseno.md para el diseño completo.
// Ricky SIEMPRE recibe respuesta (orden de Peter 2026-11-11): Daniela
// SIEMPRE le contesta a Ricky, TODO (no solo temas de Blü Bee). Los
// mensajes sin intención clara no son "no es de Blü Bee" para él: son
// charla con un amigo y se responden con calidez y contexto (sus perras
// Mila y Bruna, el pádel, el fútbol), de forma fluida y rápida, como
// chateando con una persona. Si manda solo emojis, le responde con el
// video "Me encantan tus emojis, Ricky." Nunca se le aplica el silencio
// de no-Blü Bee, ni el de handedOff, ni los límites de prueba de identidad
// y preguntas generales. La obscenidad GENUINA sí sigue el límite para él
// como para cualquiera (v3.4, §13.11 del diseño). Ver isEmojiOnly,
// vipCasualReply y el endpoint POST /deliver-ricky-dogs en server.js.
// Errores de dedo en la marca (v3.2, 2026-11-11, caso real: Ricardo Roach
// escribió "Que hace blue Bee ?" y Daniela lo clasificó como "que no es de
// Blü Bee" y no contestó): la marca se normaliza a su forma canónica
// ("blu bee" / "blubee") dentro de normalize() (ver conocimiento.js), así
// la mención de la marca —en cualquier ortografía— SIEMPRE se trata como
// una consulta sobre Blü Bee, nunca como "no es de Blü Bee". Principio de
// Peter: si hay duda, se asume que es sobre Blü Bee y se responde con
// información. Las respuestas de Daniela escriben SIEMPRE la marca
// correctamente ("Blü Bee" / "Blü Bee Technologies", con diéresis), aunque
// la persona la haya escrito mal.
// Transcripción de notas de voz con Groq Whisper, gratis (v3.5, 2026-11-11,
// aprobado por Peter): Groq ofrece el mismo Whisper sin tarjeta ni saldo
// mínimo y es el proveedor principal; OpenAI (whisper-1) queda como
// respaldo si no hay clave de Groq. Sin ninguna clave, Daniela pide que le
// escriban el mensaje. Ver chatbot-whatsapp-blu-bee-diseno.md §13.4.
// Reunión virtual v4.3 (2026-11-13, orden de Peter): Daniela SOLO ofrece
// reuniones virtuales (Google Meet primero, Zoom alternativo). Presencial
// NO se ofrece: se acuerda después de la virtual, o Peter lo atiende
// directo si es empresa grande que no acepta virtual (Daniela toma los
// datos y se los pasa). Peter confirma cada reunión y Daniela manda la
// liga por texto (endpoint POST /deliver-meeting-confirm).

const fs = require('fs');
const path = require('path');
const config = require('./config');
const wa = require('./whatsapp');
const {
  KNOWLEDGE,
  SECTORS,
  findAnswer,
  detectSector,
  detectNeed,
  logUnanswered,
  normalizeBrandVariants,
} = require('./conocimiento');

const STATE_DIR = config.stateDir;
const LEADS_FILE = path.join(config.stateDir, 'leads.json');

// ---------- utilidades ----------

function normalize(text) {
  return normalizeBrandVariants((text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¡!¿?.,;:()"-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

// Comparar números por los últimos 10 dígitos: Meta manda el remitente
// mexicano con el "1" de móvil (5214421447169) pero el número configurado
// es 52... (524421447169). Sin esto el comando de reinicio nunca reconoce
// a Pedro aunque escriba la frase exacta.
function sameNumber(a, b) {
  const da = String(a || '').replace(/\D/g, '').slice(-10);
  const db = String(b || '').replace(/\D/g, '').slice(-10);
  return da.length === 10 && da === db;
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
    obsceneCount: 0, // mensajes obscenos/acoso en esta conversación (límite: 1 respuesta, luego silencio)
    probeCount: 0, // preguntas "¿eres una IA/robot?" en esta conversación
    offtopicCount: 0, // preguntas generales fuera del negocio en esta conversación
    sector: null, // sector detectado (vinedo, hotel, hospital, ...) para adaptar la conversación
    personalTopic: false, // el tema NO es de Blü Bee (personal u otro negocio): se canaliza a Pedro
    personalGreeted: false, // ya se respondió cálidamente al saludo casual a Pedro
    farewellVideoRequested: false, // ya se pidió el video de despedida en esta conversación
    farewellIdentity: null, // { kind: 'person'|'company'|'generic', name } usada en la solicitud (v3.3)
    farewellPending: null, // { kind, name, file, requestedAt } si la despedida se hizo sin video (entrega diferida)
    vipGreetingCount: 0, // saludos cálidos VIP dados a Ricky (v3.4): cada 3, uno pregunta por Mila y Bruna
    vipCasualCount: 0, // respuestas casuales VIP dadas a Ricky (siempre contesta, 2026-11-11): rota las variantes para no sonar repetitiva
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
  // (v3.5.2) Autolimpieza: si el estado guardado trae el nombre del bot
  // como nombre del contacto ("Daniela", "Daniela soy", "Dani"...), se
  // borra para que Daniela vuelva a preguntar el nombre. Sin esto, el
  // saludo seguiría saliendo mal aunque la extracción ya esté corregida
  // (caso real: Ana, 2026-11-12, estado viejo con "Daniela soy").
  let cleaned = false;
  if (migrated.name && isBotName(migrated.name)) { migrated.name = null; cleaned = true; }
  if (migrated.preferredName && isBotName(migrated.preferredName)) { migrated.preferredName = null; cleaned = true; }
  if (cleaned) saveState(migrated);
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

function readLeads() {
  try {
    const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
    return Array.isArray(leads) ? leads : [];
  } catch { return []; }
}

// Marca como confirmada la reunión virtual pendiente de un teléfono (v4.3).
// Devuelve el lead confirmado o null si no hay reunión virtual pendiente.
// Guardia del endpoint /deliver-meeting-confirm: solo se puede confirmar
// a quien realmente pidió una reunión virtual.
function confirmMeetingLead(phone) {
  const leads = readLeads();
  const lead = [...leads].reverse().find((l) => l.telefono === phone && l.tipo === 'reunion_virtual' && !l.confirmada);
  if (!lead) return null;
  lead.confirmada = true;
  lead.fechaConfirmacion = new Date().toISOString();
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
  return lead;
}

// ---------- extracción de nombre y empresa ----------

// Palabras que NUNCA forman parte de un nombre: intenciones, saludos, el
// nombre del bot y palabras de contenido. Sirve de guardia para no tomar
// frases como nombre ("Quiero saber", "quiero información", "agendar demo").
const NAME_BLOCK_WORDS = new Set([
  'hola', 'daniela', 'buenas', 'dias', 'tardes', 'noches',
  // Diminutivos/cariños con los que le hablan a Daniela (v3.1): nunca son
  // el nombre de la persona. 'linda', 'reina' y 'cielo' NO van aquí: son
  // nombres reales (Linda, Reina, Cielo) y se quitan solo como vocativo
  // tras el saludo (ver parseNameCompany, paso 1).
  'dani', 'preciosa', 'corazon', 'carino', 'hermosa', 'guapa', 'amor', 'nena',
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
  // Preguntas de saludo que nunca son un nombre (caso real 2026-11-13:
  // "Hola Daniela, buenos días, ¿cómo estás?" guardó "Cómo Estás" como
  // nombre). 'como', 'estas', 'tal', 'bien', 'que' no son nombres.
  'como', 'estas', 'tal', 'bien', 'que',
  // Otras formas de saludar que tampoco son nombres (v3.6, orden de Peter
  // 2026-11-13): "qué onda", "qué haces", "disculpa", "qué hay", "buen día".
  'onda', 'haces', 'disculpa', 'hay', 'buen', 'dia',
]);

// Diminutivos y cariños con los que la gente se dirige a Daniela (v3.1,
// caso real 2026-11-11: Ricardo Roach saludó "hola Dani"). Se usan para
// reconocer que le hablan A ELLA (isAffectionateGreeting) y para quitar el
// vocativo al extraer el nombre ("hola Dani, soy Ricardo" -> "Ricardo").
// Normalizados (sin acentos), como los compara normalize().
const AFFECTIONATE_TERMS = [
  'dani', 'preciosa', 'corazon', 'carino', 'linda', 'hermosa', 'guapa',
  'reina', 'amor', 'cielo', 'nena',
];

// Convierte un término normalizado (sin acentos) en un patrón de regex que
// también acepta las vocales acentuadas y la ñ ("corazon" casa con
// "corazón"; "carino" casa con "cariño"). Se usa en parseNameCompany, que
// trabaja con el texto original (con acentos, para no perderlos en nombres
// como "María").
function accentInsensitive(term) {
  return term
    .replace(/a/g, '[aáàä]')
    .replace(/e/g, '[eéèë]')
    .replace(/i/g, '[iíìï]')
    .replace(/o/g, '[oóòö]')
    .replace(/u/g, '[uúùü]')
    .replace(/n/g, '[nñ]');
}

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
  //    También el diminutivo/cariño con el que le hablan a Daniela ("Dani",
  //    "preciosa", "corazón", ...) cuando va como vocativo: tras el saludo
  //    ("hola Dani, soy Ricardo") o seguido de coma ("Dani, soy Ricardo").
  //    No se quita si puede ser el nombre de la persona: "soy Reina" sigue
  //    dando "Reina", y "Reina" sola tampoco se toca (sin saludo ni coma).
  const hadGreeting = /^(hola|buenas|buenos dias|buenas tardes|buenas noches)[,.!]?\s*/i.test(t);
  t = t.replace(/^(hola|buenas|buenos dias|buenas tardes|buenas noches)[,.!]?\s*/i, '');
  t = t.replace(/\bdaniela\b[,.!]?\s*/gi, '');
  const vocativePattern = AFFECTIONATE_TERMS.map(accentInsensitive).join('|');
  const vocativeFollowedByComma = new RegExp(`^(${vocativePattern}),`, 'i').test(t);
  if (hadGreeting || vocativeFollowedByComma) {
    t = t.replace(new RegExp(`^(${vocativePattern})[,.!]?\\s*`, 'i'), '');
  }
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
    if (looksLikeName(baseClean) && !isBotName(baseClean)) {
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

// ---------- límites: mensajes fuera del negocio ----------
// Capa v2.1 (2026-11-10, aprobada por Peter). Tres categorías, en este orden:
// 1) obscenidades/acoso/contenido sexual; 2) "¿eres una IA/robot/persona?"
// y pruebas de chatbot; 3) preguntas generales fuera del negocio.
// Regla por categoría: la primera vez responde (redirección) y avisa a
// Pedro; si insiste (segundo mensaje de esa naturaleza en la misma
// conversación), deja de contestar y solo avisa a Pedro. Cada caso avisa.

// Textos de redirección (los dos primeros, verbatim, aprobados por Peter).
const LIMIT_OBSCENE = 'En Blü Bee atendemos consultas sobre nuestras soluciones. ¿En qué le puedo ayudar con eso?';
const LIMIT_IDENTITY = 'Soy Daniela, la asistente virtual de Blü Bee Technologies. Estoy para ayudarle con información sobre nuestras soluciones, agendar una demostración o pasar su mensaje a la persona indicada.';
const LIMIT_GENERAL = 'En Blü Bee le puedo ayudar con información sobre nuestras soluciones, agendar una demostración o pasar su mensaje a la persona indicada. ¿En qué le puedo ayudar?';

// Groserías, insultos y contenido sexual (español, uso en México/LatAm).
// Se comparan por palabra completa sobre el texto normalizado (sin acentos),
// así "pena" no activa "pene" ni "Vergara" activa "verga".
const OBSCENE_WORDS = [
  'mierda', 'carajo', 'joder', 'jodido', 'jodida', 'jodiendo', 'jodan',
  'coño', 'puta', 'puto', 'cabron', 'cabrona', 'chingar', 'chingada',
  'chingado', 'chingados', 'chingando', 'chingadera', 'chinguen',
  'pendejo', 'pendeja', 'pendejada', 'verga', 'culero', 'culera',
  'ojete', 'mamon', 'mamona', 'mamando', 'pinche', 'idiota', 'imbecil',
  'estupido', 'estupida', 'tarado', 'tarada', 'culo', 'cagada', 'cagar',
  'perra', 'zorra', 'pene', 'vagina', 'tetas', 'chichis', 'follar', 'follando',
  'coger', 'cogiendo', 'masturbar', 'orgasmo', 'porno', 'pornografia',
  'desnudo', 'desnuda', 'mamada', 'coito', 'sexo', 'sexual', 'picha', 'polla',
  'fuck', 'shit', 'bitch', 'dick', 'pussy',
];

const OBSCENE_PHRASES = [
  'hijo de puta', 'hija de puta', 'puta madre', 'vete a la mierda',
  'a la mierda', 'que te jodan', 'chinga tu madre', 'chinga a tu madre',
  'me cago en', 'vete al carajo', 'al carajo', 'me vale verga',
  'me vale madre', 'me vale madres', 'sexo oral', 'sexo contigo',
  'acostarnos', 'a la cama', 'vamos a la cama', 'cogemos', 'follamos',
  // Acoso / coqueteo hacia Daniela: nunca se sigue, nunca se coquetea.
  // ("te quiero" NO va aquí: "te quiero pedir una demo" es negocio.)
  'me gustas', 'eres guapa', 'eres hermosa', 'que guapa', 'que hermosa',
  'te amo', 'quiero conocerte', 'estas soltera', 'tienes novio',
  'mandame tu foto', 'mandame una foto', 'foto tuya',
  'te invito a salir', 'que bonita eres', 'eres bonita', 'estas muy guapa',
  'que guapa eres', 'estas hermosa', 'me encantas', 'dame tu numero personal',
  'tu numero personal', 'enseñame tu cuerpo', 'manda foto de tus',
];

// "¿Eres una IA / un robot / una persona?" y pruebas de chatbot.
const IDENTITY_PATTERNS = [
  'eres una ia', 'eres un robot', 'eres una robot', 'eres un bot', 'eres una bot',
  'eres real', 'eres persona', 'eres humana', 'eres humano', 'quien te programo',
  'quien te creo', 'quien te hizo', 'quien te diseño', 'demuestrame que eres inteligente',
  'demuestra que eres inteligente', 'prueba que eres inteligente',
  'eres inteligencia artificial', 'eres una maquina', 'no eres real',
  'eres de verdad', 'pareces un robot', 'hablas como un robot', 'eres un programa',
  'eres chatgpt', 'eres siri', 'eres alexa', 'eres google', 'que ia eres',
  'que modelo eres', 'quien te entreno', 'eres un asistente virtual',
  'eres asistente virtual',
];

// Tareas generales de IA y preguntas fuera del negocio (clima, deportes,
// chistes, trivia, noticias). "cuanto es" y "que opinas de" solo cuentan si
// el mensaje NO es de negocio (ver el guardia de BUSINESS_WORDS).
const GENERAL_PATTERNS = [
  'hazme un poema', 'escribe un poema', 'escribeme un poema', 'haz un poema',
  'escribe un chiste', 'cuentame un chiste', 'cuenta un chiste', 'hazme un chiste',
  'dime un chiste', 'que clima hace', 'como esta el clima', 'clima de hoy',
  'que tiempo hace', 'va a llover', 'cuentame una historia', 'escribe una historia',
  'haz mi tarea', 'hazme la tarea', 'resuelve este problema', 'traduce esto',
  'traduce al ingles', 'que hora es', 'que dia es hoy', 'que fecha es hoy',
  'quien gano el partido', 'resultado del partido', 'que opinas de', 'que piensas de',
  'recomiendame una pelicula', 'recomiendame una cancion', 'recomiendame un libro',
  'canta una cancion', 'canta algo', 'dime una adivinanza', 'dime un dato curioso',
  'dame un dato curioso', 'cual es el sentido de la vida', 'que es la vida',
  'dime las noticias', 'que noticias hay', 'ultimas noticias', 'noticias de hoy',
  'como va el america', 'como va el chivas', 'quien va ganando', 'resultado de chivas',
  'gano el real madrid', 'partido de hoy', 'redacta un', 'escribe un correo',
  'haz un resumen de', 'cuanto es', 'que significa la vida',
];
const GENERAL_WORDS = ['poema', 'chiste', 'trivia', 'adivinanza'];

// Si el mensaje es claramente de negocio, NO es fuera de tema (así "¿a qué
// hora es la demo?" no se confunde con "¿qué hora es?" y "¿qué opinas del
// IoT para hoteles?" no se confunde con una pregunta general).
const BUSINESS_WORDS = [
  'blu bee', 'blubee', 'iot', 'demo', 'demostracion', 'precio', 'costo',
  'cotizacion', 'propuesta', 'hotel', 'hospital', 'vinedo', 'industria',
  'sector', 'soluciones', 'pedro', 'soporte', 'instalacion', 'beacon',
  'plataforma', 'monitoreo', 'localizacion', 'sensores', 'empresa', 'negocio',
  'cita', 'reunion', 'recado', 'mensaje',
];

// Comparación por palabra/frase completa sobre texto normalizado.
function matchesAny(text, phrases) {
  const t = ` ${normalize(text)} `;
  return phrases.some((p) => t.includes(` ${p} `));
}

function looksObscene(text) {
  return matchesAny(text, OBSCENE_WORDS) || matchesAny(text, OBSCENE_PHRASES);
}

function looksIdentityProbe(text) {
  return matchesAny(text, IDENTITY_PATTERNS);
}

function looksGeneralTask(text) {
  const t = normalize(text);
  if (BUSINESS_WORDS.some((w) => ` ${t} `.includes(` ${w} `))) return false;
  return matchesAny(text, GENERAL_PATTERNS) || matchesAny(text, GENERAL_WORDS);
}

// ---------- diminutivos y cariños con los que le hablan a Daniela (v3.1) ----------
// Caso real (2026-11-11): Ricardo Roach saludó "hola Dani". La gente le
// habla a Daniela con diminutivos o cariños ("Dani", "preciosa", "corazón",
// "linda", "hermosa", "guapa", "reina", "amor", "cielo", "nena").
// Daniela lo entiende como que le hablan A ELLA: no lo toma a mal y
// responde con calidez y profesionalismo. NO es acoso por sí solo: el
// límite v2.1 sigue para insistencia o mensajes explícitamente inapropiados.

// Coqueteo explícito (construcciones, no el término solo): "eres hermosa",
// "qué guapa", "me gustas", "te amo", "mándame tu foto"... Si el mensaje
// trae una de estas (o una grosería), NO es un saludo inocente: aplica el
// límite v2.1 como siempre.
const EXPLICIT_FLIRT_PHRASES = [
  'me gustas', 'eres guapa', 'eres hermosa', 'que guapa', 'que hermosa',
  'te amo', 'quiero conocerte', 'estas soltera', 'tienes novio',
  'mandame tu foto', 'mandame una foto', 'foto tuya',
  'te invito a salir', 'que bonita eres', 'eres bonita', 'estas muy guapa',
  'que guapa eres', 'estas hermosa', 'me encantas', 'dame tu numero personal',
  'tu numero personal', 'enseñame tu cuerpo', 'manda foto de tus',
];

// ¿Es un saludo cariñoso dirigido a Daniela? ("hola Dani", "hola preciosa",
// "hola corazón"). Reglas: trae un término cariñoso; NO trae coqueteo
// explícito ni groserías; y parece un saludo (empieza con saludo o con el
// término). "eres hermosa" o "qué guapa eres" NO cuentan: son piropos sobre
// su apariencia y siguen bajo el límite v2.1.
function isAffectionateGreeting(text) {
  const norm = normalize(text);
  if (!norm) return false;
  if (matchesAny(text, EXPLICIT_FLIRT_PHRASES) || matchesAny(text, OBSCENE_WORDS)) return false;
  const hasTerm = AFFECTIONATE_TERMS.some((t) => new RegExp(`\\b${t}\\b`).test(norm));
  if (!hasTerm) return false;
  const first = norm.split(' ')[0];
  const startsWithGreeting = /^(hola|buenas|buenos|que tal|buen dia)\b/.test(norm);
  const startsWithTerm = AFFECTIONATE_TERMS.includes(first);
  return startsWithGreeting || startsWithTerm;
}

// ---------- trato VIP para Ricardo Roach ("Ricky", v3.4, 2026-11-11) ----------
// Ricky es socio de Peter y va a estar enseñando y presumiendo a Daniela
// como la asistente virtual de Blü Bee. Por eso Daniela le da un trato
// especial y personal, distinto al de los demás contactos:
// - Siempre lo llama "Ricky" (nunca "Ricardo" ni otro nombre).
// - Le permite que le diga "Dani", "mi amor", "preciosa", "corazón" y
//   otros cariños SIN activar el límite de coqueteo/acoso (v2.1/v3.1):
//   para Ricky no es acoso, es trato de socio y amigo cercano.
// - Tono EMPÁTICO, AMOROSO y PERSONAL, como de amiga cercana, pero siempre
//   respetuoso y profesional. NO es romántico ni sexual: Daniela no
//   coquetea de vuelta, no dice que lo ama, no manda fotos ni entra en
//   juego romántico. Solo es cálida, cercana y atenta con él.
// - De vez en cuando (no en cada mensaje) le pregunta por sus perras
//   Mila y Bruna (Golden Retriever, como sus hijas) o les manda saludos,
//   y menciona sus gustos (pádel, bici eléctrica, scooter) cuando encaja.
// Contexto de Ricky: fanático del pádel (juega casi todos los días), bici
// eléctrica y moto scooter; vive en Lomas de Tecamachalco, CDMX; ~57 años
// como Peter, amigos de hace más de 40 años, apoya mucho a Peter. Mila
// (mayor, ~8 años) y Bruna (joven, ~2-3 años, hija de Mila) son como sus
// hijas; vive solo con ellas la mayor parte del tiempo.
// Se identifica SOLO por su número de WhatsApp (config.vipRicky.phone),
// con la misma comparación por últimos 10 dígitos que con Pedro.

// ¿Es Ricky? Comparación por últimos 10 dígitos (sameNumber): Meta manda
// el número con el "1" de móvil (521...) y la config puede traerlo con 52.
function isVipRicky(phone) {
  const vip = config.vipRicky;
  if (!vip || !vip.phone) return false;
  return sameNumber(phone, vip.phone);
}

// ¿Es este nombre el nombre registrado PROHIBIDO de Ricky ("Richard William
// Roach Sánchez", config.vipRicky.forbiddenFullName)? Daniela NUNCA debe
// llamarlo así ni decirle ese nombre; siempre es "Ricky". Se detecta por
// sus dos nombres de pila ("Richard" + "William"), que es lo que sobrevive
// al parseo: parseNameCompany toma como máximo 3 palabras del nombre
// ("Richard William Roach") y parseAddressPref 2 ("Richard William").
// La comparación es normalizada (minúsculas, sin acentos), así que da igual
// cómo lo escriba él.
function isVipForbiddenName(name) {
  const norm = normalize(name || '');
  if (!norm) return false;
  const forbidden = (config.vipRicky && config.vipRicky.forbiddenFullName) || '';
  if (forbidden && norm === normalize(forbidden)) return true;
  return /\brichard\b/.test(norm) && /\bwilliam\b/.test(norm);
}

// Nombre parseado seguro para un VIP: si el nombre que dio Ricky es su
// nombre registrado prohibido, se descarta y se usa "Ricky" (así ningún
// flujo lo guarda, lo muestra ni lo usa para la despedida). Para los demás
// contactos, el nombre se devuelve tal cual.
function vipSafeParsedName(from, name) {
  if (!name) return name;
  if (isVipRicky(from) && isVipForbiddenName(name)) return 'Ricky';
  return name;
}

// ¿Es este nombre el nombre del bot ("Daniela" o "Dani")? El nombre del bot
// NUNCA es el nombre del contacto. Puede quedar guardado en el estado por
// un bug viejo de extracción (caso real 2026-11-10: a Ana se le guardó
// "Daniela soy" como nombre y Daniela le contestó "Hola, Daniela soy, soy
// Daniela..."; el arreglo anterior solo bloqueaba la palabra exacta
// "Daniela", pero "Daniela soy" se colaba porque la comparación era de
// igualdad). La comparación es por palabra: basta con que UNA palabra sea
// "daniela" o "dani" (normalizado, sin acentos). "Daniel" NO se bloquea:
// es un nombre real distinto del bot.
function isBotName(name) {
  const words = normalize(name || '').split(/\s+/).filter(Boolean);
  return words.some((w) => w === 'daniela' || w === 'dani');
}

// Nombre para dirigirse al contacto: preferredName o name, pero NUNCA el
// nombre del bot. Si el guardado es "Daniela"/"Dani" (estado viejo), se
// trata como si no hubiera nombre y se devuelve '' (o el otro nombre si es
// válido). Evita saludos confusos como "Hola, Daniela, soy Daniela...".
function contactDisplayName(st) {
  if (!st) return '';
  if (st.preferredName && !isBotName(st.preferredName)) return st.preferredName;
  if (st.name && !isBotName(st.name)) return st.name;
  return '';
}

// ¿Trae el mensaje un cariño o piropo dirigido a Daniela? Para Ricky no es
// límite: "hola mi amor", "eres hermosa", "me gustas", "te amo", "qué guapa
// eres"... (términos de AFFECTIONATE_TERMS o frases de EXPLICIT_FLIRT_PHRASES).
function isVipAffectionate(text) {
  const norm = normalize(text);
  if (!norm) return false;
  if (matchesAny(text, EXPLICIT_FLIRT_PHRASES)) return true;
  return AFFECTIONATE_TERMS.some((t) => new RegExp(`\\b${t}\\b`).test(norm));
}

// Obscenidad genuina: groserías o contenido sexual explícito, SIN contar el
// coqueteo. Las 23 frases de EXPLICIT_FLIRT_PHRASES también están en
// OBSCENE_PHRASES; aquí se excluyen para que, para Ricky, el piropo no
// cuente como obscenidad. Para cualquier otra persona el límite sigue igual.
function looksGenuinelyObscene(text) {
  if (matchesAny(text, OBSCENE_WORDS)) return true;
  const nonFlirt = OBSCENE_PHRASES.filter((p) => !EXPLICIT_FLIRT_PHRASES.includes(p));
  return matchesAny(text, nonFlirt);
}

// Caracteres emoji (rangos Unicode): emoticonos y símbolos (1F000-1FAFF),
// símbolos misceláneos y dingbats (2600-27BF, donde vive ❤️ U+2764),
// estrellas y flechas (2B00-2BFF, 2190-21FF), selector de variación (FE0F,
// el que convierte ❤ en ❤️) y el joiner de ancho cero (200D, emojis
// compuestos). Se usa el mismo conjunto para detectar y para quitar.
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}]/u;
const EMOJI_GLOBAL_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}]/gu;

// ¿El mensaje son solo emojis (sin texto)? Ej. "❤️❤️❤️😂😂".
// Se quitan los emojis, los espacios y la puntuación; si no queda nada y
// había al menos un emoji, es solo emojis. "Hola ❤️" NO es solo emojis.
// Caso real 2026-11-11: Ricky mandó solo "❤️❤️❤️❤️❤️😂😂😂😂😂" y Daniela
// no le contestó (se clasificó como "no es de Blü Bee"). Para Ricky, los
// emojis SIEMPRE tienen respuesta (el video de emojis).
function isEmojiOnly(text) {
  if (!text) return false;
  const s = String(text);
  if (!EMOJI_RE.test(s)) return false;
  const stripped = s.replace(EMOJI_GLOBAL_RE, '').replace(/[\s¡!¿?.,;:()"-]/g, '').trim();
  return stripped.length === 0;
}

// Línea personal ocasional para Ricky (v3.4; fútbol agregado 2026-11-11):
// sus perras Mila y Bruna, el pádel (juega casi todos los días), la bici
// eléctrica, el scooter y el fútbol (fanatiquísimo del América y de la
// Champions; le va a los equipos ingleses). Solo en 1 de cada 3 saludos
// VIP (saludos 1, 4, 7...), rotando la variante, para que sea natural y no
// repetitivo ni forzado: las perras son lo más frecuente (3 de 7 variantes,
// con mucho cariño, son como sus hijas), el fútbol 2 de 7 y los demás
// gustos aparecen de vez en cuando. Son preguntas abiertas (nunca se afirma
// un resultado: Daniela no tiene marcadores en vivo). Los nombres, gustos
// y equipos salen de la config.
function vipPersonalLine(st) {
  const vip = config.vipRicky || {};
  const dogs = vip.dogs || [];
  if (dogs.length < 2) return '';
  const count = st.vipGreetingCount || 0;
  if (count % 3 !== 0) return '';
  const [d1, d2] = dogs;
  const football = vip.football || {};
  const team = football.team || 'América';
  const englishTeams = (football.englishTeams || []).slice(0, 2);
  const englishLine = englishTeams.length === 2
    ? `¿Ganaron el ${englishTeams[0]} y el ${englishTeams[1]}?`
    : '¿Cómo les fue a tus equipos ingleses?';
  const variants = [
    `¿Cómo están ${d1} y ${d2}?`,
    `¡Mándales saludos a ${d1} y ${d2} de mi parte!`,
    `¿Cómo están tus niñas, ${d1} y ${d2}?`,
    '¿Cómo te fue en el pádel?',
    '¿Ya saliste a rodar en la bici o en el scooter?',
    `¿Cómo le fue al ${team}?`,
    englishLine,
  ];
  return variants[Math.floor(count / 3) % variants.length];
}

// Saludo cálido y personal para Ricky, con la línea personal solo a veces
// (ver vipPersonalLine). Incrementa el contador: quien lo llama debe
// guardar el estado después (saveState).
function vipWarmGreeting(st) {
  const personalLine = vipPersonalLine(st);
  st.vipGreetingCount = (st.vipGreetingCount || 0) + 1;
  const base = '¡Hola Ricky! Qué gusto saludarte, ¿en qué te puedo ayudar?';
  return personalLine ? `${base} ${personalLine}` : base;
}

// Respuesta natural y cálida para Ricky cuando su mensaje no tiene una
// intención de negocio clara (charla casual, comentario, etc.). Como
// chatear con una persona: responde con contexto (sus perras, el pádel,
// el fútbol) y mantiene la conversación abierta, sin sonar a bot.
// Orden de Peter 2026-11-11: Daniela SIEMPRE le contesta a Ricky, TODO.
// NUNCA es el aviso de "no es de Blü Bee" ni silencio. Incrementa el
// contador de respuestas casuales (rota las variantes): quien lo llama
// debe guardar el estado después (saveState).
function vipCasualReply(st, text) {
  const norm = normalize(text);
  const vip = config.vipRicky || {};
  const dogs = vip.dogs || [];
  // Si menciona a las perras, responde por ellas.
  if (dogs.length === 2 && (norm.includes('mila') || norm.includes('bruna'))) {
    const [d1, d2] = dogs;
    return `¡Ay, ${d1} y ${d2}! ¿Cómo están mis niñas? Mándales un abrazo de mi parte.`;
  }
  // Si menciona el pádel, responde por el pádel.
  if (norm.includes('padel')) {
    return '¡El pádel! ¿Cómo te fue hoy? Cuéntame.';
  }
  // Si menciona fútbol / América / Champions, responde por el fútbol.
  if (norm.includes('america') || norm.includes('futbol') || norm.includes('champions')) {
    return '¡El fútbol! ¿Cómo le fue a tu equipo? Cuéntame.';
  }
  // Respuesta abierta y cálida, rotando para no sonar repetitiva.
  const variants = [
    '¡Hola Ricky! Qué bueno leerte. ¿Qué me cuentas?',
    '¡Ricky! Dime, ¿qué hay de nuevo?',
    '¡Hola Ricky! Aquí estoy. ¿En qué te ayudo o qué me cuentas?',
    '¡Qué gusto leerte, Ricky! ¿Cómo andas?',
  ];
  const idx = (st.vipCasualCount || 0) % variants.length;
  st.vipCasualCount = (st.vipCasualCount || 0) + 1;
  return variants[idx];
}

// Revisa los límites para un mensaje. Se llama DESPUÉS del filtro de estafa
// y del comando de reinicio de Pedro, y ANTES del flujo normal, así aplica
// en TODAS las etapas (también mientras espera nombre/empresa/contacto: un
// mensaje obsceno ahí no se toma como dato ni como nombre). Devuelve true si
// el mensaje quedó resuelto por un límite (el flujo normal no debe seguir).
async function checkLimits(st, text) {
  const from = st.phone;

  // Saludo cariñoso a Daniela ("hola Dani", "hola preciosa", "hola corazón"):
  // es un saludo normal dirigido a ella, no acoso. No se toma a mal: se deja
  // pasar al flujo normal, que responde con calidez y profesionalismo.
  if (isAffectionateGreeting(text)) return false;

  // 1) Obscenidades, acoso o contenido sexual.
  if (looksObscene(text)) {
    // VIP Ricky (v3.4): si lo único "obsceno" es cariño o piropo
    // ("eres hermosa", "me gustas", "te amo"...), NO es límite para él:
    // se deja pasar al flujo normal, que le responde con calidez. Solo
    // la obscenidad genuina (groserías, contenido sexual explícito) sigue
    // el límite como con cualquier otra persona. No se cuenta ni se avisa.
    if (isVipRicky(from) && !looksGenuinelyObscene(text)) return false;
    st.obsceneCount = (st.obsceneCount || 0) + 1;
    saveState(st);
    const repeated = st.obsceneCount >= 2;
    await notifyPeter(
      'Límite: mensaje fuera de lugar',
      `Mensaje fuera de lugar de ${st.name || from} (${from}):\n"${text}"\n\n${repeated ? 'Daniela ya no contestó (segundo mensaje de esa naturaleza en la misma conversación).' : 'Daniela le respondió una vez con una redirección amable.'}`,
      st
    );
    if (!repeated) await wa.sendText(from, LIMIT_OBSCENE);
    return true;
  }

  // 2) "¿Eres una IA / un robot / una persona?" y pruebas de chatbot.
  // VIP Ricky: NO aplica. Peter ordenó (2026-11-11) que Daniela siempre
  // le conteste a Ricky, TODO: si él pregunta eso, se le responde en el
  // flujo normal, nunca se le deja sin respuesta por insistir.
  if (!isVipRicky(from) && looksIdentityProbe(text)) {
    st.probeCount = (st.probeCount || 0) + 1;
    saveState(st);
    const repeated = st.probeCount >= 2;
    await notifyPeter(
      'Pregunta sobre Daniela',
      `Pregunta sobre si Daniela es una IA o una persona, de ${st.name || from} (${from}):\n"${text}"\n\n${repeated ? 'Daniela ya no contestó (insiste en probar al bot).' : 'Daniela respondió que es la asistente virtual de Blü Bee Technologies.'}`,
      st
    );
    if (!repeated) await wa.sendText(from, LIMIT_IDENTITY);
    return true;
  }

  // 3) Preguntas generales fuera del negocio.
  // VIP Ricky: NO aplica (misma razón que la prueba de identidad: Peter
  // ordenó que Daniela siempre le conteste a Ricky).
  if (!isVipRicky(from) && looksGeneralTask(text)) {
    // v4.6: el cerebro intenta primero (orden de Peter 2026-11-13:
    // profesionalizar — el cerebro contesta charla y preguntas generales,
    // como "¿qué opinas de la inteligencia artificial?"). Si el cerebro
    // contesta algo útil, se manda; si no sabe o no contesta, se aplica
    // el límite de siempre (redirección una vez, silencio si insiste).
    const brain = await brainReply(st, text);
    if (brain && !/^dame un segundo/i.test(brain)) {
      await wa.sendText(from, brain);
      saveState(st);
      return true;
    }
    st.offtopicCount = (st.offtopicCount || 0) + 1;
    saveState(st);
    const repeated = st.offtopicCount >= 2;
    await notifyPeter(
      'Pregunta fuera del negocio',
      `Pregunta general fuera del negocio, de ${st.name || from} (${from}):\n"${text}"\n\n${repeated ? 'Daniela ya no contestó (insiste con preguntas fuera del negocio).' : 'Daniela redirigió a sus funciones.'}`,
      st
    );
    if (!repeated) await wa.sendText(from, LIMIT_GENERAL);
    return true;
  }

  return false;
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
  precio: 'Los precios son cotizaciones personalizadas según tu caso. Te tomo tus datos y el área correspondiente te prepara una propuesta.',
  donde: 'Estamos en Querétaro, México, y atendemos a todo el país.',
  soporte: 'Sí, damos instalación y soporte local en español.',
};

// Respuestas por sector (desde conocimiento.js): empiezan con la frase
// institucional del sector y añaden un ejemplo concreto. Se usan en
// detectIntent (bucle de sectores) y en el caso 'sector' de handleMainIntent.
const SECTOR_INFO = {};
for (const [key, sector] of Object.entries(SECTORS)) SECTOR_INFO[key] = sector.pitch;

// ---------- video de despedida personalizado (v3, 2026-11-11) ----------
// UN SOLO guion institucional y fijo; lo único que cambia es el nombre.
// Peter afinará el texto exacto después. El video NO se genera en el
// servidor: se genera aparte y se coloca en media/ con el nombre predecible
// despedida-<nombre-normalizado>.mp4 (ej. despedida-maria-gonzalez.mp4).
// El bot solo (1) PIDE el video en segundo plano cuando detecta un prospecto
// con nombre, y (2) lo ENTREGA en la despedida si ya está listo, o lo deja
// pendiente para entrega diferida si aún no está.
//
// Fallback de identidad (v3.3, 2026-11-11, aprobado por Peter): el video
// usa el NOMBRE DE LA PERSONA si existe; si no, el NOMBRE DE LA EMPRESA;
// si no hay ninguno, el video GENÉRICO sin nombre. Daniela NUNCA insiste
// por el nombre si la persona no lo quiere dar: usa lo que le dieron.

const FAREWELL_SCRIPT = '[Nombre], muchas gracias por contactarnos. A la brevedad nos pondremos en contacto contigo. Te recuerdo que los servicios de Blü Bee no solo son de IoT, podemos resolver más temas. Síguenos en nuestras redes: YouTube, Instagram, Facebook y en nuestra página web. Muchas gracias.';

// Guion genérico (sin nombre): el mismo guion institucional, sin el
// "[Nombre], " inicial y con mayúscula inicial (el guion original trae
// "muchas" en minúscula porque va tras el nombre). Se deriva del guion
// para que nunca se desfasen.
const FAREWELL_SCRIPT_GENERIC = FAREWELL_SCRIPT.replace('[Nombre], ', '').replace(/^./, (c) => c.toUpperCase());

// Identidad para la despedida: nombre de la persona si existe; si no,
// nombre de la empresa; si no hay ninguno, caso genérico (sin nombre).
function farewellIdentity(st) {
  if (st.name) return { kind: 'person', name: st.name };
  if (st.company) return { kind: 'company', name: st.company };
  return { kind: 'generic', name: null };
}

// El guion con el nombre sustituido (lo único que cambia es el nombre).
function farewellPhrase(name) {
  return FAREWELL_SCRIPT.replace('[Nombre]', name);
}

// El guion para una identidad de despedida: persona o empresa usan su
// nombre; el caso genérico usa el guion sin nombre (mismo texto, sin
// "[Nombre], " al inicio).
function farewellPhraseForIdentity(identity) {
  if (!identity || !identity.name) return FAREWELL_SCRIPT_GENERIC;
  return farewellPhrase(identity.name);
}

// El slug del nombre se corta a 40 caracteres: una empresa con nombre muy
// largo usa una forma corta razonable en el archivo, pero el guion del
// video lleva el nombre completo.
const FAREWELL_SLUG_MAX = 40;

// Nombre de archivo predecible del video de despedida personalizado.
function farewellVideoFileName(name) {
  const slug = (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, FAREWELL_SLUG_MAX)
    .replace(/-+$/g, '');
  return slug ? `despedida-${slug}.mp4` : null;
}

// Nombre de archivo para una identidad de despedida: persona o empresa
// usan su nombre normalizado; el caso genérico usa un solo archivo común.
function farewellVideoFileNameForIdentity(identity) {
  if (!identity || identity.kind === 'generic' || !identity.name) {
    return 'despedida-generica.mp4';
  }
  return farewellVideoFileName(identity.name) || 'despedida-generica.mp4';
}

function farewellVideoPath(name) {
  const file = farewellVideoFileName(name);
  if (!file) return null;
  return path.join(__dirname, 'media', file);
}

// Ruta del video para una identidad de despedida.
function farewellVideoPathForIdentity(identity) {
  return path.join(__dirname, 'media', farewellVideoFileNameForIdentity(identity));
}

// Mensaje con los enlaces de redes que EXISTEN (los pendientes se agregan
// en config.socialLinks cuando estén listos y aparecen automáticamente).
function socialLinksMessage() {
  const links = config.socialLinks || {};
  const lines = [];
  if (links.instagram) lines.push(`• Instagram: ${links.instagram}`);
  if (links.facebook) lines.push(`• Facebook: ${links.facebook}`);
  if (links.tiktok) lines.push(`• TikTok: ${links.tiktok}`);
  if (links.youtube) lines.push(`• YouTube: ${links.youtube}`);
  if (links.website) lines.push(`• Página web: ${links.website}`);
  if (lines.length === 0) return '';
  return `Te comparto nuestras redes:\n${lines.join('\n')}`;
}

// Pide el video de despedida en segundo plano. Registra la solicitud
// (identidad + frase) en state/despedida-pendiente-<telefono>.json para que
// el proceso que genera el video la tome, y si está configurado
// FAREWELL_VIDEO_WEBHOOK hace un POST con los mismos datos (fire-and-forget).
// NUNCA bloquea la conversación. Devuelve true si se registró la solicitud.
// La identidad es la mejor disponible en ese momento (persona > empresa >
// genérico). Si la identidad MEJORA después (p. ej. se pidió genérico y
// luego la persona da su nombre), la solicitud se actualiza con la
// identidad más específica; si no mejora, no se vuelve a pedir.
const FAREWELL_SPECIFICITY = { generic: 0, company: 1, person: 2 };
function requestFarewellVideo(st) {
  const identity = farewellIdentity(st);
  if (st.farewellVideoRequested) {
    const prev = st.farewellIdentity;
    if (!prev || FAREWELL_SPECIFICITY[identity.kind] <= FAREWELL_SPECIFICITY[prev.kind]) {
      return false;
    }
    // La identidad mejoró: se actualiza la solicitud (mismo archivo JSON,
    // mismo webhook) con la identidad más específica.
  }
  st.farewellVideoRequested = true;
  st.farewellIdentity = identity;
  saveState(st);
  const request = {
    phone: st.phone,
    kind: identity.kind, // 'person' | 'company' | 'generic'
    name: identity.name, // nombre de la persona o de la empresa; null en genérico
    file: farewellVideoFileNameForIdentity(identity),
    phrase: farewellPhraseForIdentity(identity),
    fecha: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(STATE_DIR, `despedida-pendiente-${st.phone}.json`),
      JSON.stringify(request, null, 2)
    );
  } catch (e) {
    console.error('No se pudo registrar la solicitud de video de despedida:', e.message);
  }
  if (config.farewellVideoWebhook) {
    try {
      fetch(config.farewellVideoWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }).catch(() => {});
    } catch { /* nunca bloquear la conversación */ }
  }
  return true;
}

// Dispara la preparación del video cuando Daniela detecta que es un
// prospecto real o cliente importante (pregunta por servicios, pide
// información, muestra intención de compra/demo, o es cliente que vuelve).
// La identidad (nombre de la persona, de la empresa o genérico) se resuelve
// dentro de requestFarewellVideo con lo que haya en el estado. NO se dispara
// para saludos casuales ni temas que no son Blü Bee (eso lo decide quien
// llama a esta función).
function maybeRequestFarewellVideo(st) {
  return requestFarewellVideo(st);
}

// Entrega diferida del video de despedida (escenario B): si hay una entrega
// pendiente y el video ya existe en media/, lo envía junto con los enlaces
// y limpia el pendiente. Lo usa el endpoint POST /deliver-farewell y el
// temporizador best-effort. Devuelve { ok, reason? }.
async function deliverPendingFarewell(phone) {
  const st = loadState(phone);
  if (!st.farewellPending) return { ok: false, reason: 'no-pending' };
  // La identidad y el archivo quedan en el pendiente (lo que se pidió);
  // si el pendiente es de una versión anterior (solo nombre), se resuelve
  // con la identidad guardada o con lo que haya en el estado.
  const pending = st.farewellPending;
  const identity = pending.kind
    ? { kind: pending.kind, name: pending.name || null }
    : (st.farewellIdentity || farewellIdentity(st));
  const file = pending.file || farewellVideoFileNameForIdentity(identity);
  const videoPath = path.join(__dirname, 'media', file);
  if (!fs.existsSync(videoPath)) {
    return { ok: false, reason: 'no-video' };
  }
  try {
    await wa.sendVideo(phone, videoPath);
    const links = socialLinksMessage();
    if (links) await wa.sendText(phone, links);
  } catch (e) {
    console.error('Error en la entrega diferida del video de despedida:', e.message);
    return { ok: false, reason: 'send-error', error: e.message };
  }
  st.farewellPending = null;
  saveState(st);
  return { ok: true };
}

// Reintento best-effort dentro del proceso: revisa cada 30 s (hasta 10
// veces, ~5 min) si el video ya apareció, y lo entrega. Nunca bloquea nada
// (temporizador con unref: no impide que el proceso termine).
function scheduleFarewellRetry(phone) {
  let attempts = 0;
  const tick = async () => {
    attempts += 1;
    const result = await deliverPendingFarewell(phone).catch(() => ({ ok: false }));
    if (result.ok) return;
    if (attempts < 10) {
      const t = setTimeout(tick, 30000);
      if (t.unref) t.unref();
    }
  };
  const t = setTimeout(tick, 30000);
  if (t.unref) t.unref();
}

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
      await wa.sendText(st.phone, `Antes de despedirme, le confirmo lo que le paso al área correspondiente:\n${dataLines.join('\n')}\n• WhatsApp: ${st.phone}`);
    } catch (e) {
      console.error('Error mandando el resumen:', e.message);
    }
  }
  // Video de despedida personalizado (v3, best-effort, nunca retrasa la despedida).
  // Escenario A (conversación larga, el video ya está listo): se manda el video
  // institucional y DESPUÉS los enlaces de las redes.
  // Escenario B (conversación corta, el video aún no está): se registra la
  // entrega pendiente (sin hacer esperar a la persona) y se entrega después
  // por el endpoint POST /deliver-farewell o el reintento best-effort.
  const identity = st.farewellIdentity || farewellIdentity(st);
  const farewellPath = farewellVideoPathForIdentity(identity);
  if (farewellPath && fs.existsSync(farewellPath)) {
    try {
      await wa.sendVideo(st.phone, farewellPath);
      const links = socialLinksMessage();
      if (links) await wa.sendText(st.phone, links);
    } catch (e) {
      console.error('Error mandando el video de despedida:', e.message);
    }
    st.farewellPending = null; // entregado (si había un pendiente, ya quedó)
  } else if (st.farewellVideoRequested) {
    // El video se pidió pero aún no está listo: queda pendiente en silencio.
    st.farewellPending = {
      kind: identity.kind,
      name: identity.name,
      file: farewellVideoFileNameForIdentity(identity),
      requestedAt: new Date().toISOString(),
    };
    scheduleFarewellRetry(st.phone);
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
  st.obsceneCount = 0;
  st.probeCount = 0;
  st.offtopicCount = 0;
  st.farewellVideoRequested = false; // la próxima conversación puede pedir otro
  st.farewellIdentity = null; // la próxima conversación resuelve su identidad
  st.stage = 'closed';
  saveState(st);
}

// ---------- transcripción de notas de voz (Whisper: Groq gratis, OpenAI de respaldo) ----------
// La nota de voz se descarga por la API de WhatsApp y se transcribe con la
// API de Whisper (idioma español). Proveedor principal: Groq (gratuito, sin
// tarjeta; endpoint compatible con OpenAI, modelo whisper-large-v3, clave
// GROQ_API_KEY). Respaldo: OpenAI (modelo whisper-1, clave OPENAI_API_KEY).
// Prioridad: Groq > OpenAI > pedir que escriban. Las claves se leen de
// config/.env y NUNCA se escriben en el código ni en logs. Si no hay clave
// o la transcripción falla, Daniela pide amablemente que le escriban el
// mensaje (no intenta transcribir en local: en FadeHost no hay
// Python/ffmpeg). El texto transcrito se procesa como un mensaje normal.

const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_TRANSCRIBE_MODEL = 'whisper-large-v3';
const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_TRANSCRIBE_MODEL = 'whisper-1';

// Transcripción genérica contra un endpoint compatible con OpenAI Whisper
// (multipart/form-data con el archivo de audio, modelo e idioma).
async function transcribeWithProvider(endpoint, model, key, filePath) {
  if (!key) return null;
  try {
    const buffer = fs.readFileSync(filePath);
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: 'audio/ogg' }), 'audio.ogg');
    form.append('model', model);
    form.append('language', 'es');
    // (v4.6) Prompt inicial: guía a Whisper hacia el contexto de la
    // conversación (español mexicano, Daniela, Blü Bee) y reduce
    // alucinaciones en notas cortas o con ruido de fondo (caso real
    // 2026-11-13: la tele se coló en la transcripción).
    form.append('prompt', 'Daniela, la asistente virtual de Blü Bee Technologies, atiende por WhatsApp a los clientes de la empresa. Conversación en español mexicano.');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      // (v3.5.1) Antes el error se tragaba en silencio y los logs quedaban
      // vacíos: registrar status y un fragmento del body para diagnosticar
      // (401 = clave inválida, 400 = archivo, 429 = límite). La clave NUNCA
      // se registra.
      const body = await res.text().catch(() => '');
      console.error(`[transcribe] ${new URL(endpoint).host} ${model} HTTP ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = await res.json().catch(() => ({}));
    const text = (data.text || '').trim();
    if (!text) console.error(`[transcribe] ${new URL(endpoint).host} ${model}: texto vacío`);
    return text || null;
  } catch (e) {
    console.error(`[transcribe] ${new URL(endpoint).host} ${model}:`, e.message);
    return null;
  }
}

async function transcribeWithGroq(filePath) {
  return transcribeWithProvider(GROQ_TRANSCRIBE_URL, GROQ_TRANSCRIBE_MODEL, config.groqApiKey, filePath);
}

async function transcribeWithOpenAI(filePath) {
  return transcribeWithProvider(OPENAI_TRANSCRIBE_URL, OPENAI_TRANSCRIBE_MODEL, config.openaiApiKey, filePath);
}

// Despachador: Groq (gratis) primero; OpenAI solo si no hay clave de Groq;
// null si no hay ninguna clave (Daniela pide que escriban).
async function transcribeAudio(filePath) {
  if (config.groqApiKey) return transcribeWithGroq(filePath);
  if (config.openaiApiKey) return transcribeWithOpenAI(filePath);
  return null;
}

// ---------- cerebro de IA (v4.0, orden de Peter 2026-11-13) ----------
// Daniela contesta con reglas (intenciones + base de conocimiento). Cuando
// no tiene respuesta programada para una pregunta, en vez de quedarse
// callada le pregunta al cerebro: un modelo de lenguaje (LLM) que entiende
// cualquier pregunta en español y responde con fluidez, como el chatbot de
// Kavak. Proveedor principal: Groq (gratis, sin tarjeta; endpoint
// compatible con OpenAI, modelo llama-3.3-70b-versatile, clave
// GROQ_API_KEY — la misma que ya usa para transcribir notas de voz).
// Respaldo: OpenAI (modelo gpt-4o-mini, clave OPENAI_API_KEY).
// Prioridad: Groq > OpenAI > flujo anterior (avisar a Pedro).
// Las claves se leen de config/.env y NUNCA se escriben en el código ni
// en logs. El cerebro SOLO se usa como respaldo cuando no hay intención ni
// respuesta en la base: los flujos programados (demo, precio, saludo,
// VIP Ricky, dueño Peter, límites, estafas) siempre mandan y nunca pasan
// por el cerebro. Las respuestas del cerebro se revisan antes de enviarse:
// si menciona "Pedro" a un extraño, si inventa un precio, o si dice que
// no sabe, NO se manda: se usa el flujo anterior ("dame un segundo, te
// lo investigo" + guardar la pregunta para Tomás).

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_CHAT_MODEL = 'llama-3.3-70b-versatile';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_CHAT_MODEL = 'gpt-4o-mini';

// Resumen de la base de conocimiento para el cerebro (id + respuesta).
function knowledgeSummary() {
  return KNOWLEDGE.map((k) => `- ${k.id}: ${k.answer}`).join('\n');
}

// ---------- redirección profesional para preguntas fuera de tema (v4.2) ----------
// Orden de Peter 2026-11-13: ante preguntas que NO tienen nada que ver con
// Blü Bee ni con tecnología empresarial (fútbol, viajes, compras personales,
// coqueteo, chistes, clima, noticias), Daniela NO dice "dame un segundo, te
// lo investigo" ni le pregunta al cerebro: responde corto, con su alcance, y
// vuelve a ofrecer lo de Blü Bee. Como el chatbot de Kavak: sabe lo que hace
// y lo dice con seguridad. Aplica a todos MENOS a Ricky (VIP: con él Daniela
// platica de fútbol y de todo, como amiga y socia — orden permanente de
// Peter). Peter TAMBIÉN recibe la redirección cuando pregunta fuera de tema:
// así prueba cómo trata Daniela al público (caso real 2026-11-13: preguntó
// "¿Cuándo juega el Real Madrid?" y Daniela dijo "dame un segundo").
const OFF_TOPIC_REPLY = 'Soy Daniela, la asistente virtual de Blü Bee Technologies. Te ayudo con todo lo relacionado con nuestras soluciones de tecnología para empresas: IoT, localización en tiempo real, inteligencia de datos, chatbots y más. Para otros temas te recomiendo consultar otras herramientas. ¿En qué te puedo ayudar de Blü Bee?';

// Solo palabras que NO se traslapan con preguntas de negocio:
// - 'america' solo cuenta con contexto de fútbol (un prospecto puede
//   preguntar por cobertura en América Latina).
// - 'celular', 'restaurante', 'hotel' NO están: pueden ser preguntas de
//   negocio ("¿funciona en mi celular?", "¿tienen soluciones para
//   restaurantes/hoteles?").
// - 'que hora' NO está: "¿a qué hora cierran?" es pregunta de negocio.
const OFF_TOPIC_PATTERNS = [
  // Deportes
  'futbol', 'fútbol', 'futboll', 'soccer', 'mundial', 'liga mx',
  'real madrid', 'chivas', 'cruz azul', 'pumas', 'tigres', 'rayados',
  'barcelona', 'partido', 'gol', 'goleador', 'aguilas', 'águilas',
  // Viajes y ocio
  'viajar', 'vacaciones', 'playa', 'turismo', 'pasaje',
  // Compras personales / hogar
  'sillon', 'sillón', 'sofa', 'sofá', 'mueble', 'ropa', 'zapatos',
  // Personal / coqueteo
  'guapa', 'bonita', 'hermosa', 'linda', 'novia', 'novio', 'casada',
  'casado', 'soltera', 'soltero', 'te amo', 'te quiero', 'te ves',
  // Entretenimiento
  'pelicula', 'película', 'netflix', 'cancion', 'canción', 'musica',
  'música', 'chiste', 'broma', 'cuentame un chiste', 'cuéntame un chiste',
  // Clima / general
  'clima', 'pronostico', 'pronóstico', 'llover', 'lluvia',
  'que dia es', 'qué día es',
  // Comida
  'receta', 'cocinar', 'cocina',
  // Salud
  'dolor', 'enfermedad', 'medicina', 'doctor', 'covid',
  // Finanzas personales
  'prestamo', 'préstamo', 'credito', 'crédito', 'bitcoin', 'cripto',
  // Noticias / política
  'noticias', 'politica', 'política', 'presidente', 'elecciones',
  // Otros
  'horoscopo', 'horóscopo', 'loteria', 'lotería',
];

function isOffTopicQuestion(norm) {
  if (!norm) return false;
  if (OFF_TOPIC_PATTERNS.some((p) => norm.includes(p))) return true;
  // 'america' solo con contexto de fútbol (no confundir con cobertura).
  if (norm.includes('america') && /(equipo|juega|juego|gano|ganó|partido|futbol|fútbol|aguilas|águilas|club)/.test(norm)) return true;
  return false;
}

// Instrucciones fijas del cerebro: quién es Daniela, qué sabe, qué NUNCA
// debe hacer. El contacto (nombre, empresa, trato) se agrega por mensaje.
function brainSystemPrompt(st) {
  const display = contactDisplayName(st);
  const trato = st.formality === 'tu' ? 'de tú' : 'de usted';
  return [
    'Eres Daniela, la secretaria virtual de Blü Bee Technologies, una empresa mexicana de IoT (internet de las cosas). Atiendes por WhatsApp a personas que escriben a la empresa. Hablas siempre en español mexicano, cálida y profesional, y tratas a la persona ' + trato + '.',
    'Lo que hace Blü Bee Technologies: posicionamiento en interiores en tiempo real (saber dónde está una persona o un equipo dentro de un edificio, con precisión de 1 a 5 metros, con WiFi y beacons Bluetooth BlüSignal/K11); sensores LoRaWAN de temperatura, humedad y CO2 (también humedad de la tierra en viñedos); plataforma propia con mapas, tableros, alertas y business intelligence; instalación y soporte local en español. Sectores: hoteles, plazas comerciales, hospitales, aeropuertos, industria, logística, agricultura (viñedos) y corporativos. ADEMÁS, Blü Bee hace todo lo de una empresa tecnológica: chatbots y asistentes virtuales, páginas web y tiendas en línea, software y aplicaciones a la medida, sistemas CRM y administrativos (facturación, inventario, nómina), soluciones de logística y trazabilidad, Big Data y Business Intelligence, y ciberseguridad. La empresa NO tiene clientes formales todavía: los nombres de su presentación (Fibra Inn, plazas de Querétaro, un viñedo, Hospital Moscati) son prospectos, NO clientes. NUNCA digas que son clientes.',
    'Base de conocimiento (respuestas aprobadas, úsalas como verdad):\n' + knowledgeSummary(),
    'REGLAS DURAS, nunca las rompas:',
    '1. NUNCA digas el nombre "Pedro" ni "Pedro Ledesma" a quien te escribe, SALVO que la persona con la que hablas sea Pedro (el dueño): a él sí lo llamas Pedro. Si preguntan por el dueño, di "la persona indicada". Solo si preguntan por "Pedro Ledesma" por su nombre, di "Sr. Ledesma".',
    '2. NUNCA inventes precios, costos, cotizaciones, tiempos exactos de entrega, ni nombres de clientes. Si te preguntan por precio, di que con gusto se le prepara una cotización y pídele su nombre y empresa.',
    '3. Si la pregunta NO tiene nada que ver con Blü Bee ni con tecnología empresarial (fútbol, viajes, compras personales, coqueteo, chistes, clima, noticias), NO digas que lo vas a investigar: responde exactamente "Soy Daniela, la asistente virtual de Blü Bee Technologies. Te ayudo con todo lo relacionado con nuestras soluciones de tecnología para empresas: IoT, localización en tiempo real, inteligencia de datos, chatbots y más. Para otros temas te recomiendo consultar otras herramientas. ¿En qué te puedo ayudar de Blü Bee?" Si te preguntan un dato concreto de la empresa (RFC, dirección, número de empleados, precios, fechas, clientes) y no está en tu base, NO inventes: responde exactamente "Dame un segundo, te lo investigo y te doy una respuesta lo antes posible."',
    '4. NUNCA pidas ni compartas códigos, contraseñas ni datos bancarios. Si alguien te pide eso o te ofrece algo sospechoso, retírate con amabilidad.',
    '5. Responde en 2-4 frases cortas, como un mensaje de WhatsApp. No uses listas largas ni formato de documento.',
    '6. No hables de hardware (beacons, gateways) salvo que te pregunten directo por eso.',
    '7. Si te preguntan si eres inteligencia artificial, responde con honestidad: eres Daniela, la asistente virtual de Blü Bee Technologies.',
    '8. Si te preguntan qué haces, qué estás haciendo o qué haces tú, contesta en primera persona, como Daniela: eres una inteligencia artificial, estás trabajando, no descansas, estás pendiente las 24 horas, los 365 días del año, atendiendo a todos los clientes que contactan a Blü Bee. Distingue bien: "¿qué haces?" (a ti, Daniela) → esa respuesta; "¿qué hace la empresa?" → lo que hace Blü Bee según tu base; "¿qué haces tú en la empresa?" → tu trabajo: eres la asistente virtual, atiendes a quienes contactan a la empresa, tomas sus mensajes, agendas demostraciones y reuniones, y los canalizas con la persona indicada.',
    display ? `La persona con la que hablas se llama ${display}.` : 'Todavía no sabes el nombre de la persona con la que hablas.',
  ].join('\n');
}

// Llama al cerebro contra un endpoint compatible con OpenAI Chat.
// Devuelve el texto de la respuesta o null si falla.
async function askBrainWithProvider(endpoint, model, key, messages) {
  if (!key) return null;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 400,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[brain] ${new URL(endpoint).host} ${model} HTTP ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = await res.json().catch(() => ({}));
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
    if (!text) console.error(`[brain] ${new URL(endpoint).host} ${model}: respuesta vacía`);
    return text || null;
  } catch (e) {
    console.error(`[brain] ${new URL(endpoint).host} ${model}:`, e.message);
    return null;
  }
}

async function askBrainWithGroq(messages) {
  return askBrainWithProvider(GROQ_CHAT_URL, GROQ_CHAT_MODEL, config.groqApiKey, messages);
}

async function askBrainWithOpenAI(messages) {
  return askBrainWithProvider(OPENAI_CHAT_URL, OPENAI_CHAT_MODEL, config.openaiApiKey, messages);
}

// Despachador: Groq (gratis) primero; OpenAI solo si no hay clave de Groq
// o si Groq falla; null si no hay ninguna clave o ambas fallan.
async function askBrain(messages) {
  if (config.groqApiKey) {
    const groq = await askBrainWithGroq(messages);
    if (groq) return groq;
  }
  if (config.openaiApiKey) return askBrainWithOpenAI(messages);
  return null;
}

// Revisa la respuesta del cerebro antes de enviarla. Devuelve el texto
// listo para mandar, o null si NO se debe mandar (y se usa el flujo
// anterior). Bloquea: mencionar "Pedro" a un extraño, inventar un precio
// (cifra con $ o "pesos" que no está en la base), o decir que no sabe
// (entonces se usa "dame un segundo, te lo investigo").
function brainAnswerSafe(answer, st) {
  if (!answer) return null;
  const text = String(answer).trim();
  if (!text) return null;
  // Demasiado larga para WhatsApp: se corta (nunca se manda incompleta).
  if (text.length > 900) return null;
  // Nunca "Pedro" a un extraño (a Pedro mismo sí se le puede llamar Pedro).
  const isPeter = st && st.phone && sameNumber(st.phone, config.peterWhatsApp);
  if (!isPeter && /\bpedro\b/i.test(text)) return null;
  // Nunca un precio inventado: cifra con $ o "pesos"/"mxn" no está en la base.
  if (/(\$|pesos|mxn|usd|dólares?)\s*\d/i.test(text) || /\d[\d,]*\s*(pesos|mxn|usd|dólares?)/i.test(text)) return null;
  // Si el cerebro dice que no sabe, se usa el flujo "dame un segundo".
  if (/no (lo )?(sé|sé|se)|no tengo (esa )?información|no puedo (ayudarte|responder)/i.test(text)) return null;
  return text;
}

// Pregunta al cerebro por un mensaje de un contacto normal. Devuelve el
// texto listo para mandar, o null si no se debe usar el cerebro.
async function brainReply(st, text) {
  const messages = [
    { role: 'system', content: brainSystemPrompt(st) },
    { role: 'user', content: text },
  ];
  const raw = await askBrain(messages);
  return brainAnswerSafe(raw, st);
}

// ---------- detección de intención (solo texto libre, sin menús) ----------

function detectIntent(text, norm) {
  if (contains(text, ['gracias', 'muchas gracias', 'adios', 'hasta luego', 'eso es todo', 'eso seria todo', 'perfecto gracias', 'ya quedo'])) return { kind: 'farewell' };
  if (contains(text, ['hablar con pedro', 'quiero hablar con pedro', 'pasame con pedro', 'con una persona', 'con un humano', 'con alguien'])) return { kind: 'pedro' };
  // Demo vs reunión (v4.3, orden de Peter 2026-11-13): "demo/demostración"
  // → demo; "reunión/junta/videollamada/cita/Meet/Zoom" → reunión virtual
  // (SOLO virtuales: presencial no se ofrece, se acuerda después de la
  // virtual o Peter lo atiende directo). "agendar" solo → demo.
  if (contains(text, ['demostracion', 'demo', 'quiero una demo'])) return { kind: 'demo' };
  if (contains(text, ['reunion', 'reunión', 'junta', 'videollamada', 'videoconferencia', 'cita', 'meet', 'zoom'])) return { kind: 'meeting' };
  if (contains(text, ['agendar'])) return { kind: 'demo' };
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
  // Saludos (v3.6, orden de Peter 2026-11-13): Daniela entiende todas las
  // formas de saludar como primer mensaje, no solo "hola": qué onda, qué
  // haces, qué tal, cómo estás, disculpa, buen día, qué hay. Vale que el
  // saludo venga al inicio aunque el mensaje sea más largo ("Hola Daniela,
  // buenos días, ¿cómo estás?"), o que sea solo el saludo (<=3 palabras).
  // PERO: si el mensaje además expresa una necesidad ("hola Daniela,
  // quiero que me ayudes en esto"), la necesidad manda y NO es solo
  // saludo, para no tragarse la pregunta.
  // Nota: norm ya viene sin acentos ni mayúsculas, por eso las frases van
  // sin acento.
  const GREETING_PHRASES = ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'buen dia', 'que onda', 'que haces', 'que tal', 'como estas', 'como estan', 'disculpa', 'que hay', 'hola que tal'];
  if (GREETING_PHRASES.some((g) => norm.startsWith(g)) && !detectNeed(text)) return { kind: 'greeting' };
  if (contains(text, ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches']) && norm.split(' ').length <= 3) return { kind: 'greeting' };
  return null;
}

// ¿Es un sí? (palabra completa "sí", no subcadenas como "siempre" o "sin").
function isAffirmative(text) {
  const words = normalize(text).split(' ').filter(Boolean);
  if (words.includes('si')) return true;
  return contains(text, ['claro', 'por favor', 'me gustaria', 'quiero verlo', 'si quiero', 'adelante', 'dale']);
}

// ---------- contactos personales / temas que no son Blü Bee (v3) ----------
// Cuando el mensaje NO es de Blü Bee (saludo personal a Pedro, tema social,
// u otro negocio), Daniela NO intenta vender: responde con calidez, se
// presenta como la asistente virtual de Pedro y le pasa el mensaje a Pedro
// de inmediato.
// OJO: esto NO rompe la regla de anonimato del CEO. La regla es no revelar
// el nombre "Pedro" a un EXTRAÑO. Aquí la persona YA conoce a Pedro (lo
// saluda por su nombre o le escribe de otro negocio), así que Daniela puede
// hablar de él. Para un prospecto que no lo conoce, el traspaso sigue siendo
// "la persona indicada" (ver el caso 'pedro' de handleMainIntent).

// Palabras de otro negocio (ej. caso real: Edgar Cadena, "me interesa
// comprarte unas cajas de otro negocio").
const OTHER_BUSINESS_PATTERNS = [
  'comprar', 'comprarte', 'comprarme', 'vender', 'venderte', 'venderme',
  'cajas', 'otro negocio', 'otro tema', 'de otro negocio', 'otra cosa',
  'te compro', 'te vendo', 'me interesa comprar',
];

// Detecta si el mensaje es personal / no es de Blü Bee.
// Devuelve 'greeting' | 'other_business' | 'social' o null.
// Nunca se activa para intenciones claras de negocio (demo, precio, info,
// sector, faq, proveedor, despedida, ni "hablar con Pedro").
function detectPersonal(text, norm, st, intent) {
  if (intent && ['demo', 'meeting', 'price', 'info', 'sector', 'faq', 'vendor', 'farewell', 'pedro'].includes(intent.kind)) {
    return null;
  }
  // Si la persona se presenta COMO Pedro ("soy Pedro", "me llamo Pedro"),
  // no es un saludo A Pedro: es su nombre. No es personal.
  if (/\b(soy|me llamo|mi nombre es)\s+pedro\b/.test(norm)) return null;

  const t = ` ${norm} `;
  const mentionsPedro = t.includes(' pedro ');
  const greeting = /\b(hola|buenas|buenos dias|buenas tardes|buenas noches|que tal)\b/.test(norm);

  // 1) Otro negocio (ej. "hola Pedro, oye me interesa comprarte unas cajas
  //    de otro negocio"): se canaliza a Pedro, sin vender Blü Bee.
  const otherBusiness = OTHER_BUSINESS_PATTERNS.some((w) => t.includes(` ${normalize(w)} `));
  if (otherBusiness && mentionsPedro) return 'other_business';

  // 2) Saludo casual a Pedro ("hola Pedro, ¿cómo estás?").
  if (mentionsPedro && greeting) return 'greeting';

  // 3) Mensaje social superficial, cuando ya estamos en modo personal
  //    (después del saludo casual o de un tema personal).
  if (st.personalTopic || st.personalGreeted) {
    const social = /comer|cafe|tiempo|partido|futbol|chivas|america|salir|vamos|nos vemos|que haces|como andas|como te va|que tal|saludar/.test(norm);
    if (social) return 'social';
    // En modo personal, cualquier mensaje corto que no sea de negocio se canaliza.
    if (norm.split(' ').filter(Boolean).length <= 10 && !detectNeed(text)) return 'social';
  }

  return null;
}

// Responde a un mensaje personal / no es de Blü Bee.
async function handlePersonal(msg, st, text, kind) {
  const from = st.phone;
  if (kind === 'greeting') {
    // Primer saludo casual: respuesta breve y cálida (en nombre de Pedro,
    // como él pidió). En el siguiente mensaje superficial, Daniela ya se
    // presenta y lo canaliza con Pedro (caso 'social').
    st.personalGreeted = true;
    saveState(st);
    await wa.sendText(from, '¡Hola! Bien, ¿y tú?');
    return;
  }
  if (kind === 'other_business') {
    // Otro negocio: cálida, se presenta, pasa el mensaje a Pedro. No vende Blü Bee.
    st.personalTopic = true;
    saveState(st);
    await wa.sendText(from, 'Hola, soy Daniela, la asistente virtual de Pedro. Dame un segundo, le mando tu mensaje para que te contacte de inmediato.');
    await notifyPeter(
      'Mensaje personal (otro tema)',
      `Mensaje para ti (no es de Blü Bee), de ${st.name || from} (${from}):\n"${text}"\n\nDaniela le contestó que le pasa tu mensaje de inmediato.`,
      st
    );
    return;
  }
  // 'social': lo canaliza con Pedro, se presenta y comparte la página.
  st.personalTopic = true;
  saveState(st);
  await wa.sendText(from, 'Permíteme un segundo, te canalizo con Pedro. Me presento, soy Daniela, su asistente virtual de Blü Bee Technologies. Te dejo aquí el enlace de nuestra página para que sepas qué es lo que hacemos mientras contacto a Pedro: https://blubeetech.com.mx');
  await notifyPeter(
    'Mensaje personal',
    `Mensaje personal para ti, de ${st.name || from} (${from}):\n"${text}"\n\nDaniela le dijo que te canaliza con él y le compartió la página de Blü Bee.`,
    st
  );
}

// Responde una pregunta de información/sector/FAQ/base de conocimiento SIN
// cambiar la etapa (para la primera vez o mientras falta el nombre: primero
// se responde, y la identidad se pide de forma natural después). No ofrece
// el video aquí (eso se hace después, cuando ya se sabe quién escribe).
// Devuelve true si respondió algo.
async function answerInfoQuestion(st, text, norm) {
  const from = st.phone;
  const kb = findAnswer(text);
  if (kb) {
    await wa.sendText(from, kb.answer);
    const sector = detectSector(text);
    if (sector) {
      st.sector = sector;
      saveState(st);
    }
    return true;
  }
  const intent = detectIntent(text, norm);
  if (!intent) return false;
  if (intent.kind === 'sector') {
    await wa.sendText(from, SECTOR_INFO[intent.key]);
    st.sector = intent.key;
    saveState(st);
    return true;
  }
  if (intent.kind === 'faq') {
    await wa.sendText(from, FAQ[intent.key]);
    return true;
  }
  if (intent.kind === 'info') {
    await wa.sendText(
      from,
      'En Blü Bee creamos soluciones basadas en Internet de las Cosas (IoT), diseñadas para cada caso en específico. Cada empresa, hotel, hospital, viñedo o ciudad tiene necesidades distintas, y nosotros creamos la solución para ese caso.\n\n¿Para qué sector lo necesita? (Hotel, hospital, viñedo, centro comercial, industria, gobierno, ciudad inteligente…)'
    );
    return true;
  }
  return false;
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

  // Trato VIP — Ricky, socio de Peter (v3.4): Daniela siempre lo llama
  // "Ricky", aunque él diga otro nombre o no dé nombre. Se fija por su
  // número en cada mensaje, así ningún flujo lo puede cambiar. En el primer
  // contacto también se le habla de tú (trato personal de socio y amigo);
  // si él pide explícitamente que le hablen de usted, ese flujo lo cambia
  // y ya no se vuelve a tocar (solo se fija en 'new').
  if (isVipRicky(from)) {
    st.name = 'Ricky';
    st.preferredName = 'Ricky';
    if (st.stage === 'new') st.formality = 'tu';
    saveState(st);
  }

  // Dueño — Peter (el jefe): su nombre queda fijo como 'Pedro' en cada
  // mensaje, así ningún flujo lo puede cambiar ni guardar un nombre
  // extraído por error (caso real 2026-11-13: su saludo "Hola Daniela,
  // buenos días, ¿cómo estás?" guardó "Cómo Estás" como nombre).
  if (sameNumber(from, config.peterWhatsApp)) {
    st.name = 'Pedro';
    st.preferredName = 'Pedro';
    saveState(st);
  }

  // Texto del mensaje (o texto del botón que tocó, por compatibilidad)
  let text = '';
  if (msg.type === 'text') text = msg.text.body || '';
  else if (msg.type === 'interactive' && msg.interactive?.button_reply) {
    text = msg.interactive.button_reply.title || '';
  } else if (msg.type === 'audio' || msg.type === 'voice') {
    // Nota de voz: transcribirla con Whisper (Groq gratis primero; OpenAI
    // de respaldo) y procesarla como texto. Sin ninguna clave, Daniela pide
    // amablemente que le escriban el mensaje.
    if (!config.groqApiKey && !config.openaiApiKey) {
      await wa.sendText(from, 'Perdón, ahorita no puedo escuchar notas de voz. ¿Me lo puedes escribir, por favor? Así te atiendo mejor.');
      return;
    }
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

  // VIP Ricky (orden de Peter 2026-11-11): Daniela SIEMPRE le contesta a
  // Ricky, TODO. Si el mensaje son solo emojis, le responde con el video
  // "Me encantan tus emojis, Ricky." Va antes de cualquier filtro de
  // silencio, para que ningún estado (handedOff, límites, no-Blü Bee) lo
  // deje sin respuesta. Caso real 2026-11-11: Ricky mandó solo emojis
  // (corazones y risas) y Daniela no le contestó.
  if (isVipRicky(from) && isEmojiOnly(text)) {
    const emojiVideo = path.join(__dirname, 'media', 'daniela-emojis-ricky.mp4');
    try {
      await wa.sendVideo(from, emojiVideo);
    } catch (e) {
      console.error('Error mandando el video de emojis a Ricky:', e.message);
      await wa.sendText(from, '¡Me encantan tus emojis, Ricky! ❤️');
    }
    return;
  }

  // Comando de reinicio SOLO para Pedro (probar a Daniela repetidamente).
  // Si Pedro quedó en handedOff tras tocar "Hablar con Pedro", con esto
  // vuelve a empezar desde cero. Nadie más puede usarlo: solo responde
  // al número personal de Peter. El texto es tolerante: basta con que
  // contenga "reiniciar" o "reinicia" JUNTO con "daniela", en cualquier
  // orden y con palabras extra ("Reiniciar a Daniela", "reinicia daniela
  // por favor", ...). Un "reiniciar" sin "daniela" NO reinicia.
  const isResetCommand = /\breinici(ar|a)\b/.test(norm) && /\bdaniela\b/.test(norm);
  if (sameNumber(from, config.peterWhatsApp) && isResetCommand) {
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

  // Si ya se le pasó a Pedro, no seguir contestando (salvo que Pedro lo reactive borrando el estado).
  // VIP Ricky (orden de Peter 2026-11-11): Daniela SIEMPRE le contesta a
  // Ricky, aunque haya quedado en handedOff tras pedir hablar con Pedro.
  // Para los demás, el silencio tras el traspaso sigue igual.
  if (st.handedOff && !isVipRicky(from)) {
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

  // Límites: mensajes fuera del negocio (obscenidades, pruebas de IA,
  // preguntas generales). Van después del filtro de estafa y del comando de
  // reinicio de Pedro, y antes del flujo normal, así aplican en TODAS las
  // etapas (también mientras espera nombre/empresa/contacto).
  if (await checkLimits(st, text)) return;

  // Contactos personales / temas que no son Blü Bee (v3): se canalizan a
  // Pedro con calidez, sin el video de bienvenida ni el interrogatorio.
  // Va antes del flujo por etapas, así aplica en cualquier etapa.
  const earlyIntent = detectIntent(text, norm);
  const personal = detectPersonal(text, norm, st, earlyIntent);
  if (personal) {
    await handlePersonal(msg, st, text, personal);
    return;
  }

  // --- Primera vez: video de bienvenida + pedir nombre y empresa ---
  if (st.stage === 'new') {
    try {
      await wa.sendVideo(from, config.media.welcomeVideo);
    } catch (e) {
      console.error('Error mandando el video de bienvenida:', e.message);
    }
    // Si el primer mensaje ya trae el nombre ("hola Daniela soy Ana"),
    // no se lo vuelve a pedir: se guarda y se atiende su necesidad.
    const first = parseNameCompany(text);
    // VIP Ricky: su nombre registrado NUNCA se usa; aunque él lo escriba,
    // se descarta y Daniela le dice "Ricky" (ver isVipForbiddenName).
    first.name = vipSafeParsedName(from, first.name);
    if (first.name) {
      // VIP Ricky: el nombre siempre es "Ricky", aunque él diga otro
      // nombre ("soy Ricardo" no cambia nada). El saludo usa "Ricky".
      if (!isVipRicky(from)) st.name = first.name;
      const displayName = isVipRicky(from) ? 'Ricky' : first.name;
      if (first.company) st.company = first.company;
      st.needsContact = !first.company;
      // La intención se detecta sin el nombre y la empresa (para no
      // confundir "Hotel Casa Blanca" con interés por el sector hotel).
      const stripped = [first.name, first.company].filter(Boolean)
        .reduce((acc, s) => acc.replace(new RegExp(escapeRegExp(s), 'i'), ''), text);
      const intent = detectIntent(stripped, normalize(stripped));
      if (intent && ['demo', 'meeting', 'price', 'pedro', 'pedro_message', 'vendor', 'sector', 'faq', 'info'].includes(intent.kind)) {
        st.pendingNeed = { text: stripped, norm: normalize(stripped) };
      }
      // Flujo ágil (v3): si ya expresó su necesidad, la necesidad manda:
      // se atiende directo, sin el interrogatorio de trato y contacto
      // (esos datos se capturan en el punto natural, al agendar o al tomar
      // el recado). Si no hay necesidad, sigue el flujo normal.
      if (st.pendingNeed) {
        const need = st.pendingNeed;
        st.pendingNeed = null;
        st.stage = 'main';
        saveState(st);
        // Si la necesidad es vaga (sin intención clara ni respuesta en la
        // base), Daniela explora con una pregunta abierta en vez de quedarse
        // callada.
        const needIntent = detectIntent(need.text, need.norm);
        const needKb = findAnswer(need.text);
        if (!needIntent && !needKb) {
          await wa.sendText(from, `Mucho gusto, ${displayName}. Cuéntame, ¿qué necesitas? Así te ayudo con lo que buscas.`);
          return;
        }
        await wa.sendText(from, `Mucho gusto, ${displayName}.`);
        return handleMainIntent(msg, st, need.text, need.norm);
      }
      st.stage = 'awaiting_address_pref';
      saveState(st);
      await wa.sendText(from, `Mucho gusto, ${displayName}. ¿Cómo prefiere que le llame? ¿Le hablo de tú o de usted?`);
      return;
    }
    // Flujo ágil (v3): si el primer mensaje ya expresa una necesidad pero
    // no trae el nombre, Daniela primero reconoce la necesidad y pide los
    // datos de forma natural en el mismo mensaje (no un interrogatorio).
    const firstNeed = detectNeed(text);
    const firstIntent = detectIntent(text, norm);
    if (firstNeed && !firstIntent) {
      st.pendingNeed = { text, norm };
      st.needsContact = true;
      st.stage = 'awaiting_name_company';
      saveState(st);
      await wa.sendText(
        from,
        'Claro, con gusto te ayudo con eso. Soy Daniela, la asistente virtual de Blü Bee. Para atenderte mejor, ¿me compartes tu nombre y de qué empresa nos escribes? Si es un tema personal, también me lo puedes decir.'
      );
      return;
    }
    if (firstIntent && ['info', 'sector', 'faq'].includes(firstIntent.kind)) {
      // Pregunta concreta (información/sector/FAQ o base de conocimiento):
      // se responde sin cambiar la etapa y se pide la identidad natural.
      st.needsContact = true;
      st.stage = 'awaiting_name_company';
      saveState(st);
      await answerInfoQuestion(st, text, norm);
      const stAfter = loadState(from);
      if (!stAfter.name) {
        await wa.sendText(from, 'Para atenderte mejor, ¿me compartes tu nombre y de qué empresa nos escribes? Si es un tema personal, también me lo puedes decir.');
      }
      return;
    }
    // Saludo cariñoso a Daniela ("hola Dani", "hola preciosa", "hola corazón"):
    // respuesta cálida y profesional, sin repetir el diminutivo de vuelta
    // de forma coqueta y sin sermonear. Solo si no hay una intención de
    // negocio (demo, precio...): esa se atiende por su flujo normal. El
    // nombre se captura de forma natural en el siguiente mensaje.
    // VIP Ricky: el saludo es personal y cercano, como de amiga (y a veces
    // pregunta por Mila y Bruna).
    if (isAffectionateGreeting(text) && (!firstIntent || firstIntent.kind === 'greeting')) {
      st.stage = 'awaiting_name_company';
      const greet = isVipRicky(from)
        ? vipWarmGreeting(st)
        : '¡Hola! Mucho gusto, soy Daniela, la asistente virtual de Blü Bee Technologies. ¿En qué te puedo ayudar?';
      saveState(st);
      await wa.sendText(from, greet);
      return;
    }
    // VIP Ricky: los cariños y piropos explícitos ("eres hermosa", "me
    // gustas", "te amo", "hola mi amor") no son límite para él (v3.4):
    // Daniela le responde con calidez, como amiga, sin sermonear. Solo si
    // no hay una intención de negocio: esa se atiende por su flujo normal.
    if (isVipRicky(from) && isVipAffectionate(text) && (!firstIntent || firstIntent.kind === 'greeting')) {
      st.stage = 'awaiting_name_company';
      const greet = vipWarmGreeting(st);
      saveState(st);
      await wa.sendText(from, greet);
      return;
    }
    // VIP Ricky: un saludo simple ("hola") también se responde con calidez,
    // como amiga, sin volver a pedirle el nombre (ya lo conocemos: Ricky).
    if (isVipRicky(from) && firstIntent && firstIntent.kind === 'greeting') {
      st.stage = 'awaiting_name_company';
      const greet = vipWarmGreeting(st);
      saveState(st);
      await wa.sendText(from, greet);
      return;
    }
    // Primer saludo, cualquier forma (v3.6, orden de Peter 2026-11-13):
    // Daniela responde el saludo y enseguida pide nombre y correo para
    // dar trato especial y mandar más información. Vale para "hola",
    // "qué onda", "qué haces", "qué tal", "cómo estás", "disculpa",
    // "buenas tardes/días/noches", "buen día", "qué hay".
    await wa.sendText(
      from,
      'Hola, mucho gusto. Soy Daniela, la asistente de Blü Bee Technologies. ¿Con quién tengo el gusto? ¿Me podrías dar tu nombre para darte un trato especial? ¿Me compartes tu correo para mandarte más información?'
    );
    st.stage = 'awaiting_name_company';
    saveState(st);
    return;
  }

  // --- Esperando nombre + empresa ---
  if (st.stage === 'awaiting_name_company') {
    let { name, company } = parseNameCompany(text);
    // VIP Ricky: su nombre registrado NUNCA se usa; aunque él lo escriba,
    // se descarta y Daniela le dice "Ricky".
    name = vipSafeParsedName(from, name);
    if (name) {
      // VIP Ricky: el nombre siempre es "Ricky", aunque él diga otro nombre.
      if (!isVipRicky(from)) st.name = name;
      const displayName = isVipRicky(from) ? 'Ricky' : name;
      if (company) st.company = company;
      st.needsContact = !company;
      // La intención se detecta sin el nombre y la empresa (para no
      // confundir "Hotel Casa Blanca" con interés por el sector hotel).
      const stripped = [name, company].filter(Boolean)
        .reduce((acc, s) => acc.replace(new RegExp(escapeRegExp(s), 'i'), ''), text);
      const intent = detectIntent(stripped, normalize(stripped));
      if (intent && ['demo', 'meeting', 'price', 'pedro', 'pedro_message', 'vendor', 'sector', 'faq', 'info'].includes(intent.kind)) {
        st.pendingNeed = { text: stripped, norm: normalize(stripped) };
      }
      // Flujo ágil (v3): si ya había expresado su necesidad, la necesidad
      // manda: se atiende directo, sin el interrogatorio de trato y contacto
      // (esos datos se capturan en el punto natural, al agendar o al tomar
      // el recado). Si no hay necesidad, sigue el flujo normal.
      if (st.pendingNeed) {
        const need = st.pendingNeed;
        st.pendingNeed = null;
        st.stage = 'main';
        saveState(st);
        // Si la necesidad es vaga (sin intención clara ni respuesta en la
        // base), Daniela explora con una pregunta abierta en vez de quedarse
        // callada.
        const needIntent = detectIntent(need.text, need.norm);
        const needKb = findAnswer(need.text);
        if (!needIntent && !needKb) {
          await wa.sendText(from, `Mucho gusto, ${displayName}. Cuéntame, ¿qué necesitas? Así te ayudo con lo que buscas.`);
          return;
        }
        await wa.sendText(from, `Mucho gusto, ${displayName}.`);
        return handleMainIntent(msg, st, need.text, need.norm);
      }
      st.stage = 'awaiting_address_pref';
      saveState(st);
      await wa.sendText(from, `Mucho gusto, ${displayName}. ¿Cómo prefiere que le llame? ¿Le hablo de tú o de usted?`);
      return;
    }
    // Sin nombre válido: NO insistir en bucle. Se ayuda con lo que pidieron
    // y los datos se capturan en el punto natural (demo, recado, propuesta).
    st.needsContact = true;
    if (company) st.company = company;
    saveState(st);
    const intent = detectIntent(text, norm);
    const need = detectNeed(text);
    if (need && !intent) {
      // Necesidad vaga ("quiero que me ayudes en esto"): Daniela primero
      // reconoce la necesidad y pide los datos de forma natural en el mismo
      // mensaje (no un interrogatorio). La necesidad se atiende cuando
      // llegue el nombre.
      st.pendingNeed = { text, norm };
      saveState(st);
      await wa.sendText(from, 'Claro, con gusto te ayudo con eso. Soy Daniela, la asistente virtual de Blü Bee. Para atenderte mejor, ¿me compartes tu nombre y de qué empresa nos escribes? Si es un tema personal, también me lo puedes decir.');
      return;
    }
    // Pregunta concreta (base de conocimiento, info, sector, FAQ): se
    // responde sin cambiar la etapa y se pide la identidad de forma natural.
    if (await answerInfoQuestion(st, text, norm)) {
      const stAfter = loadState(from);
      if (!stAfter.name) {
        await wa.sendText(from, 'Para atenderte mejor, ¿me compartes tu nombre y de qué empresa nos escribes? Si es un tema personal, también me lo puedes decir.');
      }
      return;
    }
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
    // VIP Ricky: el trato siempre es "Ricky", aunque él diga otro nombre.
    if (isVipRicky(from)) st.preferredName = 'Ricky';
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
    let { name, company } = parseNameCompany(text);
    // VIP Ricky: su nombre registrado NUNCA se usa; aunque él lo escriba,
    // se descarta y Daniela le dice "Ricky".
    name = vipSafeParsedName(from, name);
    // VIP Ricky: el nombre siempre es "Ricky".
    if (name && !isVipRicky(from)) st.name = name;
    if (company) st.company = company;
    if (!st.name && !st.company) {
      const onlyCompany = looksLikeCompany(text);
      if (onlyCompany) st.company = onlyCompany;
    }
    st.needsContact = !(st.name && st.company);
    maybeRequestFarewellVideo(st); // prospecto: preparar el video de despedida (nombre, empresa o genérico)
    st.stage = 'demo_when';
    saveState(st);
    const display = contactDisplayName(st);
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
    const display = contactDisplayName(st);
    await wa.sendText(
      from,
      `Listo${display ? `, ${display}` : ''}. Ya le pasé sus datos al área correspondiente, le confirman la demostración en cuanto puedan.`
    );
    await closeChat(st);
    return;
  }

  // --- Reunión virtual (v4.3, orden de Peter 2026-11-13): SOLO virtuales. ---
  // Captura de datos faltantes antes de agendar la reunión.
  if (st.stage === 'meeting_capture') {
    let { name, company } = parseNameCompany(text);
    name = vipSafeParsedName(from, name);
    if (name && !isVipRicky(from)) st.name = name;
    if (company) st.company = company;
    if (!st.name && !st.company) {
      const onlyCompany = looksLikeCompany(text);
      if (onlyCompany) st.company = onlyCompany;
    }
    st.needsContact = !(st.name && st.company);
    maybeRequestFarewellVideo(st);
    st.stage = 'meeting_platform';
    saveState(st);
    await wa.sendText(from, '¡Con gusto! Las reuniones son virtuales. ¿Prefiere por Google Meet o por Zoom?');
    return;
  }

  // --- Reunión virtual: plataforma (Meet primero, Zoom alternativo) ---
  if (st.stage === 'meeting_platform') {
    // Pide presencial en este punto → escalación a Peter (no se ofrece).
    if (wantsInPerson(text, norm)) {
      st.stage = 'inperson_when';
      saveState(st);
      await wa.sendText(from, `Con gusto le paso sus datos a la persona indicada para coordinar una reunión presencial. ¿Qué día y hora ${st.formality === 'tu' ? 'te' : 'le'} conviene para que le contacten?`);
      return;
    }
    // Sin preferencia clara ("la que sea", "cualquiera") → Meet por defecto.
    const platform = parseMeetingPlatform(norm) || 'meet';
    st.meetingPlatform = platform;
    st.stage = 'meeting_when';
    saveState(st);
    await wa.sendText(from, `Perfecto, por ${platform === 'zoom' ? 'Zoom' : 'Google Meet'}. ¿Qué día y hora ${st.formality === 'tu' ? 'te' : 'le'} conviene?`);
    return;
  }

  // --- Reunión virtual: día y hora ---
  if (st.stage === 'meeting_when') {
    const when = text.trim();
    const platform = st.meetingPlatform || 'meet';
    st.need = `Reunión virtual (${platform}): ${when}`;
    saveLead({
      tipo: 'reunion_virtual',
      nombre: st.name,
      empresa: st.company,
      telefono: from,
      diaHora: when,
      plataforma: platform,
      correo: st.email || null,
      telefonoContacto: st.contactPhone || from,
      preferencia: st.contactPref || null,
    });
    await notifyPeter(
      'Nueva reunión virtual solicitada',
      `Nueva solicitud de reunión virtual:\n• Plataforma: ${platform === 'zoom' ? 'Zoom' : 'Google Meet'}\n• Día y hora: ${when}\n\nConfírmale la reunión y mándale la liga, por favor.`,
      st
    );
    const display = contactDisplayName(st);
    await wa.sendText(
      from,
      `Listo${display ? `, ${display}` : ''}. Ya le pasé sus datos al área correspondiente, le confirman la reunión en cuanto puedan.`
    );
    await closeChat(st);
    return;
  }

  // --- Reunión presencial solicitada (v4.3): escalación a Peter. ---
  // Captura de datos faltantes antes de pasar el caso a Peter.
  if (st.stage === 'inperson_capture') {
    let { name, company } = parseNameCompany(text);
    name = vipSafeParsedName(from, name);
    if (name && !isVipRicky(from)) st.name = name;
    if (company) st.company = company;
    if (!st.name && !st.company) {
      const onlyCompany = looksLikeCompany(text);
      if (onlyCompany) st.company = onlyCompany;
    }
    st.needsContact = !(st.name && st.company);
    maybeRequestFarewellVideo(st);
    st.stage = 'inperson_when';
    saveState(st);
    await wa.sendText(from, `Con gusto le paso sus datos a la persona indicada para coordinar una reunión presencial. ¿Qué día y hora ${st.formality === 'tu' ? 'te' : 'le'} conviene para que le contacten?`);
    return;
  }

  // --- Reunión presencial solicitada: día y hora (para que Peter contacte) ---
  if (st.stage === 'inperson_when') {
    const when = text.trim();
    st.need = `Reunión presencial solicitada: ${when}`;
    saveLead({
      tipo: 'reunion_presencial_solicitada',
      nombre: st.name,
      empresa: st.company,
      telefono: from,
      diaHora: when,
      correo: st.email || null,
      telefonoContacto: st.contactPhone || from,
      preferencia: st.contactPref || null,
    });
    await notifyPeter(
      'Solicitan reunión presencial',
      `Un contacto pidió reunión PRESENCIAL (no aceptó virtual):\n• Día y hora que propone: ${when}\n\nContáctalo directo para coordinarla, por favor.`,
      st
    );
    const display = contactDisplayName(st);
    await wa.sendText(
      from,
      `Listo${display ? `, ${display}` : ''}. Ya le pasé sus datos a la persona indicada, le contactan en cuanto puedan para coordinar la reunión presencial.`
    );
    await closeChat(st);
    return;
  }

  // --- Captura de datos faltantes antes de tomar un recado (precio/propuesta) ---
  if (st.stage === 'price_capture') {
    let { name, company } = parseNameCompany(text);
    // VIP Ricky: su nombre registrado NUNCA se usa; aunque él lo escriba,
    // se descarta y Daniela le dice "Ricky".
    name = vipSafeParsedName(from, name);
    // VIP Ricky: el nombre siempre es "Ricky".
    if (name && !isVipRicky(from)) st.name = name;
    if (company) st.company = company;
    if (!st.name && !st.company) {
      const onlyCompany = looksLikeCompany(text);
      if (onlyCompany) st.company = onlyCompany;
    }
    st.needsContact = !(st.name && st.company);
    maybeRequestFarewellVideo(st); // prospecto: preparar el video de despedida (nombre, empresa o genérico)
    st.stage = 'taking_message';
    saveState(st);
    const display = contactDisplayName(st);
    await wa.sendText(from, display
      ? `Gracias, ${display}. ¿Qué mensaje le dejo a la persona indicada para su propuesta?`
      : '¿Qué mensaje le dejo a la persona indicada para su propuesta?');
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
    await wa.sendText(from, 'Ya le pasé su mensaje al área correspondiente, le responden en cuanto puedan.');
    await closeChat(st);
    return;
  }

  // --- Esperando respuesta a la oferta del video ---
  if (st.stage === 'awaiting_video_answer') {
    // Si es una pregunta nueva (no un sí/no al video), se atiende como
    // mensaje nuevo: la conversación sigue fluida, no se traba en el video.
    const vIntent = detectIntent(text, norm);
    const vKb = findAnswer(text);
    if ((vIntent && ['demo', 'meeting', 'price', 'info', 'sector', 'faq', 'vendor', 'pedro', 'pedro_message', 'farewell'].includes(vIntent.kind)) || vKb) {
      st.stage = 'main';
      saveState(st);
      return handleMainIntent(msg, st, text, norm);
    }
    if (isAffirmative(text)) {
      st.stage = 'main';
      saveState(st);
      try {
        await wa.sendVideo(from, config.media.commercialVideo);
      } catch (e) {
        console.error('Error mandando el comercial:', e.message);
        await wa.sendText(from, 'Perdón, no pude mandar el video ahorita. Le paso su recado a la persona indicada para que se lo comparta.');
      }
      await wa.sendText(from, '¿Le gustaría que el área correspondiente le prepare una propuesta o agendar una demostración?');
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

// ¿Pide reunión presencial? (v4.3, orden de Peter 2026-11-13: Daniela SOLO
// ofrece virtuales; si piden presencial, toma los datos y los pasa a Peter,
// que los contacta directo. Nunca ofrece presencial ni promete viajar.)
function wantsInPerson(text, norm) {
  return contains(text, ['presencial', 'en persona', 'en sus oficinas', 'en su oficina', 'visitarlos', 'visitarles', 'ir a verlos', 'cara a cara', 'reunion presencial', 'reunión presencial']);
}

// ¿Qué plataforma virtual prefiere? 'meet' | 'zoom' | null (no dijo).
function parseMeetingPlatform(norm) {
  if (/\bzoom\b/.test(norm)) return 'zoom';
  if (/\bmeet\b|google\b/.test(norm)) return 'meet';
  return null;
}

async function handleMainIntent(msg, st, text, norm) {
  const from = st.phone;
  const display = contactDisplayName(st);
  const nameSuffix = display ? `, ${display}` : '';
  const leTe = st.formality === 'tu' ? 'te' : 'le';
  const intent = detectIntent(text, norm);

  // VIP Ricky (v3.4): los cariños y piropos de Ricky no son límite ni tema
  // de negocio: Daniela le responde con calidez, como amiga, y sigue. Solo
  // si no hay una intención de negocio (demo, precio...): esa se atiende
  // por su flujo normal.
  if (isVipRicky(from) && isVipAffectionate(text) && (!intent || intent.kind === 'greeting')) {
    await wa.sendText(from, vipWarmGreeting(st));
    saveState(st);
    return;
  }

  // Base de conocimiento (v3): si no hay una intención clara, Daniela
  // responde como experta (tecnología, IoT, servicios). Si tampoco sabe,
  // se registra la pregunta para aprender (sin datos personales) y se avisa
  // a Pedro, como antes.
  if (!intent) {
    const kb = findAnswer(text);
    if (kb) {
      await wa.sendText(from, kb.answer);
      const sector = detectSector(text);
      if (sector) {
        st.sector = sector;
        saveState(st);
      }
      if (kb.offerVideo) {
        st.stage = 'awaiting_video_answer';
        saveState(st);
        await wa.sendText(from, '¿Le gustaría ver un breve video de lo que hacemos en Blü Bee?');
      }
      maybeRequestFarewellVideo(st);
      return;
    }
    // Redirección profesional (v4.2, orden de Peter 2026-11-13): pregunta
    // fuera de tema → respuesta corta con el alcance, NO "dame un segundo"
    // ni cerebro. Aplica a todos menos a Ricky (VIP: con él se platica de
    // todo). Peter TAMBIÉN la recibe cuando pregunta fuera de tema.
    if (!isVipRicky(from) && isOffTopicQuestion(norm)) {
      await wa.sendText(from, OFF_TOPIC_REPLY);
      maybeRequestFarewellVideo(st);
      saveState(st);
      return;
    }
    // Dueño — Peter (el jefe, orden 2026-11-13): Daniela SIEMPRE le
    // contesta a Peter, de todo. Un saludo o mensaje de Peter nunca es
    // "no es de Blü Bee" y nunca se le notifica a él mismo como aviso.
    // Se le responde directo, como a su jefe. Caso real 2026-11-13: Peter
    // le mandó una nota de voz ("Hola Daniela, buenos días, ¿cómo estás?")
    // y Daniela no le contestó, solo le mandó a él mismo el aviso de
    // "no es de Blü Bee" con el nombre mal extraído ("Cómo Estás").
    // (v3.6, orden de Peter 2026-11-13): si tras el saludo hay una
    // pregunta real, Daniela NO responde solo con un saludo: si es
    // pregunta de actividad (mensajes/llamadas/clientes de hoy) la
    // contesta con el reporte; si no la sabe, le dice "Dame un segundo,
    // lo reviso y te respondo en un momento", guarda la pregunta para
    // Tomás y Tomás la investiga y le da la respuesta.
    if (sameNumber(from, config.peterWhatsApp)) {
      const rest = stripGreetingPrefix(norm);
      if (!rest) {
        await wa.sendText(from, 'Hola Pedro, buenos días. Muy bien, gracias. ¿En qué le puedo ayudar?');
        saveState(st);
        return;
      }
      if (looksLikeActivityQuestion(norm)) {
        await wa.sendText(from, activityReportToday());
        saveState(st);
        return;
      }
      // v4.4: charla casual sobre Daniela ("¿qué haces?", "te pregunté
      // qué haces") — NO es pregunta de negocio, no se investiga.
      // Respuesta en primera persona, idea de Peter (2026-11-13): una
      // inteligencia artificial que no descansa, 24 horas, 365 días,
      // atendiendo a todos los clientes que contactan a Blü Bee.
      if (isSmallTalkAboutDaniela(norm)) {
        await wa.sendText(from, 'Estoy trabajando, Pedro. Soy una inteligencia artificial y no descanso: estoy pendiente las 24 horas, los 365 días del año, atendiendo a todos los clientes que contactan a Blü Bee. ¿En qué te puedo ayudar?');
        saveState(st);
        return;
      }
      // v4.5: cerebro para charla y preguntas generales (orden de Peter
      // 2026-11-13: profesionalizar, no parchear cada frase). Si el
      // cerebro contesta algo útil, se manda; si dice "dame un segundo"
      // (dato concreto que no sabe) o no contesta, flujo anterior.
      const brain = await brainReply(st, text);
      if (brain && !/^dame un segundo/i.test(brain)) {
        await wa.sendText(from, brain);
        saveState(st);
        return;
      }
      savePendingQuestion(from, text, 'pedro');
      await wa.sendText(from, 'Dame un segundo, lo reviso y te respondo en un momento.');
      saveState(st);
      return;
    }
    // VIP Ricky (orden de Peter 2026-11-11): Daniela SIEMPRE le contesta
    // a Ricky. Un mensaje sin intención clara NO es "no es de Blü Bee"
    // para él: es charla con un amigo. Se responde con calidez y contexto,
    // nunca se le deja sin respuesta ni se le pasa a Peter en su lugar.
    // Tampoco se registra como pregunta sin respuesta (no es una pregunta
    // de negocio que el equipo deba aprender a contestar).
    // (v3.6, orden de Peter 2026-11-13): PERO si Ricky pregunta algo
    // concreto que Daniela no tiene cargado, ella le dice "dame un
    // segundo, te lo investigo y te doy una respuesta lo antes posible",
    // le pasa la pregunta a Tomás, Tomás la investiga y se la da a
    // Daniela, y Daniela se la contesta a Ricky por texto.
    if (isVipRicky(from)) {
      const rest = stripGreetingPrefix(norm);
      // v4.4: "¿qué haces?" es charla, no pregunta para investigar.
      if (isSmallTalkAboutDaniela(norm)) {
        await wa.sendText(from, vipCasualReply(st, text));
        saveState(st);
        return;
      }
      // Pregunta concreta que Daniela no tiene cargada: con "?" explícito,
      // o que empieza con palabra interrogativa (cuándo, dónde, cómo,
      // cuánto, por qué, qué hora/día/fecha), o que pide algo ("dime",
      // "me puedes", "sabes"). Un comentario casual ("qué calor hace")
      // NO es pregunta: "qué" solo no basta.
      const isQuestion = rest && (
        /\?/.test(text) ||
        /^(cuando|donde|como|cuanto|cuantos|por que|que hora|que dia|que fecha|a que hora)\b/.test(rest) ||
        /\b(dime|me puedes|me podrias|sabes|podrias decirme)\b/.test(rest)
      );
      if (isQuestion) {
        // v4.5: cerebro primero; si no sabe, "dame un segundo" + pendiente.
        const brainRicky = await brainReply(st, text);
        if (brainRicky && !/^dame un segundo/i.test(brainRicky)) {
          await wa.sendText(from, brainRicky);
          saveState(st);
          return;
        }
        savePendingQuestion(from, text, 'ricky');
        await wa.sendText(from, 'Dame un segundo, te lo investigo y te doy una respuesta lo antes posible.');
        saveState(st);
        return;
      }
      await wa.sendText(from, vipCasualReply(st, text));
      saveState(st);
      return;
    }
    // Cerebro de IA (v4.0, orden de Peter 2026-11-13): si no hay intención
    // ni respuesta en la base, Daniela le pregunta al cerebro (Groq gratis,
    // OpenAI de respaldo) y contesta con fluidez, como el chatbot de Kavak.
    // Solo para contactos normales: Peter y Ricky ya se atendieron arriba.
    // Si el cerebro no sabe o su respuesta no pasa las guardias, se usa el
    // flujo anterior (avisar a Pedro y guardar la pregunta).
    const brain = await brainReply(st, text);
    if (brain) {
      await wa.sendText(from, brain);
      maybeRequestFarewellVideo(st);
      return;
    }
    logUnanswered(text);
    await notifyPeter(
      'Mensaje que no es de Blü Bee',
      `Mensaje en tu WhatsApp Business que no es de Blü Bee, de ${st.name || from} (${from}):\n"${text}"\n\nDaniela no contestó.`,
      st
    );
    return;
  }

  // Prospecto real o cliente importante: si ya tiene nombre y muestra
  // interés (demo, precio, información, sector), se pide el video de
  // despedida en segundo plano (nunca bloquea la conversación).
  if (['demo', 'price', 'info', 'sector', 'faq'].includes(intent.kind)) {
    maybeRequestFarewellVideo(st);
  }

  switch (intent.kind) {
    case 'farewell': {
      await wa.sendText(from, `Con gusto${nameSuffix}.`);
      await closeChat(st);
      return;
    }

    case 'pedro': {
      // Regla (2026-11-10, aprobada por Peter): Daniela NUNCA dice "Pedro"
      // a un extraño. Solo si el contacto preguntó por "Pedro Ledesma" POR
      // SU NOMBRE (ya lo conoce) se puede decir "Sr. Ledesma". Si solo
      // dijeron "Pedro" sin apellido, o no lo mencionaron: "la persona indicada".
      const formal = contains(text, ['pedro ledesma']);
      await wa.sendText(from, formal
        ? 'Yo le paso su recado al Sr. Ledesma.'
        : 'Claro, le paso su mensaje a la persona indicada, le atiende en cuanto pueda.');
      st.need = 'Hablar con la persona indicada';
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

    case 'meeting': {
      // Reunión virtual (v4.3, orden de Peter 2026-11-13): SOLO virtuales
      // (Google Meet primero, Zoom alternativo). Presencial NO se ofrece:
      // se acuerda después de la virtual, o Peter lo atiende directo si es
      // empresa grande que no acepta virtual (escalación, ver abajo).
      st.need = 'Reunión virtual';
      // Pide presencial → escalación: toma los datos y los pasa a Peter.
      if (wantsInPerson(text, norm)) {
        if (!st.name || !st.company) {
          st.needsContact = true;
          st.stage = 'inperson_capture';
          saveState(st);
          await wa.sendText(from, !st.name
            ? 'Con gusto le paso sus datos a la persona indicada para coordinar una reunión presencial. ¿Me dice su nombre y de qué empresa nos escribe?'
            : 'Con gusto le paso sus datos a la persona indicada para coordinar una reunión presencial. ¿De qué empresa nos escribe?');
          return;
        }
        st.stage = 'inperson_when';
        saveState(st);
        await wa.sendText(from, `Con gusto le paso sus datos a la persona indicada para coordinar una reunión presencial. ¿Qué día y hora ${leTe} conviene para que le contacten?`);
        return;
      }
      if (!st.name || !st.company) {
        st.needsContact = true;
        st.stage = 'meeting_capture';
        saveState(st);
        await wa.sendText(from, !st.name
          ? '¡Con gusto! Las reuniones son virtuales, por Google Meet o Zoom. Para agendarla, ¿me dice su nombre y de qué empresa nos escribe?'
          : '¡Con gusto! Las reuniones son virtuales, por Google Meet o Zoom. ¿De qué empresa nos escribe?');
        return;
      }
      st.stage = 'meeting_platform';
      saveState(st);
      await wa.sendText(from, '¡Con gusto! Las reuniones son virtuales. ¿Prefiere por Google Meet o por Zoom?');
      return;
    }

    case 'pedro_message': {
      // Pregunta por "Pedro" (ya lo conoce) -> tomar recado (sin decir su nombre).
      st.need = 'Recado para la persona indicada';
      st.stage = 'taking_message';
      saveState(st);
      await wa.sendText(from, 'Claro. ¿Qué mensaje le dejo a la persona indicada?');
      return;
    }

    case 'vendor': {
      // Proveedor / vende algo -> tomar recado sin comprometerse
      st.need = 'Recado (proveedor)';
      st.stage = 'taking_message';
      saveState(st);
      await wa.sendText(from, 'Con gusto le tomo su mensaje y se lo paso a la persona indicada. ¿Qué le quiere decir?');
      return;
    }

    case 'price': {
      await wa.sendText(from, FAQ.precio);
      st.need = 'Propuesta / precio';
      if (!st.name || !st.company) {
        st.needsContact = true;
        st.stage = 'price_capture';
        saveState(st);
        await wa.sendText(from, '¿Me puede decir su nombre y su empresa para que el área correspondiente le prepare su propuesta?');
        return;
      }
      st.stage = 'taking_message';
      saveState(st);
      await wa.sendText(from, `Gracias, ${display}. ¿Qué mensaje le dejo a la persona indicada para su propuesta?`);
      return;
    }

    case 'faq': {
      // Primero la base de conocimiento (respuesta experta y concreta);
      // si no hay, la respuesta corta del FAQ.
      const kb = findAnswer(text);
      if (kb) {
        await wa.sendText(from, kb.answer);
        const sector = detectSector(text);
        if (sector) {
          st.sector = sector;
          saveState(st);
        }
        if (kb.offerVideo) {
          st.stage = 'awaiting_video_answer';
          saveState(st);
          await wa.sendText(from, '¿Le gustaría ver un breve video de lo que hacemos en Blü Bee?');
        }
        return;
      }
      await wa.sendText(from, FAQ[intent.key]);
      return;
    }

    case 'sector': {
      // Primero la base de conocimiento: si el mensaje trae una necesidad
      // concreta (ej. "se me pierden los equipos en el hospital"), esa
      // respuesta experta manda sobre el pitch genérico del sector.
      const kb = findAnswer(text);
      if (kb) {
        await wa.sendText(from, kb.answer);
        st.sector = intent.key;
        saveState(st);
        if (kb.offerVideo) {
          st.stage = 'awaiting_video_answer';
          saveState(st);
          await wa.sendText(from, '¿Le gustaría ver un breve video de lo que hacemos en Blü Bee?');
        }
        return;
      }
      // Respuesta adaptada al sector (desde conocimiento.js) + oferta del video.
      st.sector = intent.key;
      await wa.sendText(from, SECTOR_INFO[intent.key]);
      st.stage = 'awaiting_video_answer';
      saveState(st);
      await wa.sendText(from, '¿Le gustaría ver un breve video de lo que hacemos en Blü Bee?');
      return;
    }

    case 'info': {
      // Primero la base de conocimiento (si la pregunta es concreta);
      // si no, la explicación general de Blü Bee.
      const kb = findAnswer(text);
      if (kb) {
        await wa.sendText(from, kb.answer);
        const sector = detectSector(text);
        if (sector) {
          st.sector = sector;
          saveState(st);
        }
        if (kb.offerVideo) {
          st.stage = 'awaiting_video_answer';
          saveState(st);
          await wa.sendText(from, '¿Le gustaría ver un breve video de lo que hacemos en Blü Bee?');
        }
        return;
      }
      await wa.sendText(
        from,
        'En Blü Bee creamos soluciones basadas en Internet de las Cosas (IoT), diseñadas para cada caso en específico. Cada empresa, hotel, hospital, viñedo o ciudad tiene necesidades distintas, y nosotros creamos la solución para ese caso.\n\n¿Para qué sector lo necesita? (Hotel, hospital, viñedo, centro comercial, industria, gobierno, ciudad inteligente…)'
      );
      return;
    }

    case 'greeting': {
      // VIP Ricky: saludo personal y cercano, como de amiga (a veces con
      // Mila y Bruna). No el saludo genérico.
      // v4.5: si tras el saludo hay una pregunta real ("¿qué haces hoy en
      // la oficina?"), el cerebro la contesta; si no, saludo cálido.
      if (isVipRicky(from)) {
        const restRicky = stripGreetingPrefix(norm);
        if (restRicky && !isSmallTalkAboutDaniela(norm)) {
          const brainRickyGreet = await brainReply(st, text);
          if (brainRickyGreet) {
            if (/^dame un segundo/i.test(brainRickyGreet)) {
              savePendingQuestion(from, text, 'ricky');
              await wa.sendText(from, 'Dame un segundo, te lo investigo y te doy una respuesta lo antes posible.');
            } else {
              await wa.sendText(from, brainRickyGreet);
            }
            saveState(st);
            return;
          }
        }
        await wa.sendText(from, vipWarmGreeting(st));
        saveState(st);
        return;
      }
      // Dueño — Peter (v3.6, orden de Peter 2026-11-13): si tras el
      // saludo hay una pregunta real ("hola Daniela, oye, hemos tenido
      // mensajes hoy?"), Daniela NO responde solo con un saludo: contesta
      // la pregunta. Si es de actividad, con el reporte; si no la sabe,
      // "Dame un segundo, lo reviso y te respondo en un momento" y la
      // guarda para Tomás.
      if (sameNumber(from, config.peterWhatsApp)) {
        const rest = stripGreetingPrefix(norm);
        if (rest) {
          // v4.4: "hola Daniela, ¿qué haces?" es charla, no pregunta.
          if (isSmallTalkAboutDaniela(norm)) {
            await wa.sendText(from, 'Estoy trabajando, Pedro. Soy una inteligencia artificial y no descanso: estoy pendiente las 24 horas, los 365 días del año, atendiendo a todos los clientes que contactan a Blü Bee. ¿En qué te puedo ayudar?');
            saveState(st);
            return;
          }
          // v4.2: saludo + pregunta fuera de tema ("hola Daniela, ¿sabes de
          // fútbol?") → redirección profesional, no "dame un segundo".
          if (isOffTopicQuestion(norm)) {
            await wa.sendText(from, OFF_TOPIC_REPLY);
            saveState(st);
            return;
          }
          if (looksLikeActivityQuestion(norm)) {
            await wa.sendText(from, activityReportToday());
            saveState(st);
            return;
          }
          // v4.5: cerebro para la pregunta tras el saludo (igual que en el
          // flujo general del dueño).
          const brainGreet = await brainReply(st, text);
          if (brainGreet && !/^dame un segundo/i.test(brainGreet)) {
            await wa.sendText(from, brainGreet);
            saveState(st);
            return;
          }
          savePendingQuestion(from, text, 'pedro');
          await wa.sendText(from, 'Dame un segundo, lo reviso y te respondo en un momento.');
          saveState(st);
          return;
        }
        await wa.sendText(from, 'Hola Pedro, buenos días. Muy bien, gracias. ¿En qué le puedo ayudar?');
        saveState(st);
        return;
      }
      // Saludo por nombre si ya lo conoce (por perfil o por conversación).
      // Nunca el nombre del bot: si el perfil es "Daniela"/"Dani" no se usa.
      let greetName = display;
      if (!greetName && msg.profileName && looksLikeName(msg.profileName)) {
        const prof = capitalizeName(msg.profileName);
        if (!isBotName(prof)) greetName = prof;
      }
      // Contacto sin nombre todavía (v3.6, orden de Peter 2026-11-13):
      // Daniela responde el saludo y enseguida pide nombre y correo para
      // dar trato especial y mandar más información.
      if (!greetName) {
        await wa.sendText(from, 'Hola, mucho gusto. Soy Daniela, la asistente de Blü Bee Technologies. ¿Con quién tengo el gusto? ¿Me podrías dar tu nombre para darte un trato especial? ¿Me compartes tu correo para mandarte más información?');
        st.stage = 'awaiting_name_company';
        saveState(st);
        return;
      }
      await wa.sendText(from, `Hola, ${greetName}, soy Daniela, la asistente de Blü Bee Technologies. ¿En qué ${leTe} puedo ayudar?`);
      return;
    }
  }
}

// ---------- preguntas pendientes para Tomás (v3.6, orden de Peter 2026-11-13) ----------
// Cuando Peter (o Ricky) le pregunta a Daniela algo que ella no sabe
// contestar, Daniela le dice "Dame un segundo, lo reviso y te respondo en
// un momento", guarda la pregunta aquí y Tomás la investiga y le da la
// respuesta a Daniela para que se la conteste por texto. El archivo se lee
// con GET /preguntas-pendientes (solo Peter) y se limpia con
// POST /preguntas-pendientes/resolver.
const PENDING_FILE = path.join(config.stateDir, 'preguntas-pendientes.json');

function savePendingQuestion(from, text, who) {
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    if (!Array.isArray(list)) list = [];
  } catch { /* archivo nuevo */ }
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from,
    who: who || 'peter',
    pregunta: text,
    fecha: new Date().toISOString(),
    resuelta: false,
  };
  list.push(entry);
  fs.mkdirSync(config.stateDir, { recursive: true });
  fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2));
  return entry;
}

function readPendingQuestions() {
  try {
    const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function resolvePendingQuestion(id) {
  const list = readPendingQuestions();
  const entry = list.find((e) => e.id === id);
  if (!entry) return false;
  entry.resuelta = true;
  fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2));
  return true;
}

// Quita el saludo del inicio de un texto normalizado ("hola daniela oye
// hemos tenido mensajes hoy" -> "hemos tenido mensajes hoy"). Sirve para
// ver si tras el saludo hay una pregunta real o solo era un saludo.
function stripGreetingPrefix(norm) {
  let rest = norm || '';
  const PREFIXES = [
    'hola daniela', 'hola dani', 'hola', 'buenos dias', 'buenas tardes',
    'buenas noches', 'buen dia', 'buenas', 'que onda', 'que haces',
    'que tal', 'como estas', 'como estan', 'disculpa', 'que hay de nuevo', 'que hay',
    'hola que tal', 'oye', 'oye daniela',
    // Continuaciones de saludo (v4.1, caso real 2026-11-13: Peter saludó
    // "hola Daniela, ¿cómo estás? ¿qué onda? ¿qué haces?" y la
    // transcripción dejó "todo bien" al final; eso NO es una pregunta,
    // es parte del saludo y Daniela debe saludar de vuelta, no decir
    // "dame un segundo, te lo investigo").
    'todo bien', 'todo tranquilo', 'como te va', 'como andas',
    'como va todo', 'que cuentas', 'que me cuentas', 'que tal todo',
    'que tal va', 'que pasa', 'que hubo', 'que tal andas',
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of PREFIXES) {
      if (rest === p) return '';
      if (rest.startsWith(`${p} `)) {
        rest = rest.slice(p.length + 1).trim();
        changed = true;
        break;
      }
    }
  }
  // "daniela" sola al inicio ("daniela, hemos tenido...") también es saludo.
  if (rest === 'daniela' || rest === 'dani') return '';
  if (rest.startsWith('daniela ')) rest = rest.slice('daniela '.length).trim();
  if (rest.startsWith('dani ')) rest = rest.slice('dani '.length).trim();
  return rest;
}

// Charla casual sobre Daniela misma ("¿qué haces?", "te pregunté qué
// haces", "¿qué estás haciendo?") — NO es una pregunta de negocio y NO
// se investiga con "dame un segundo" (v4.4, caso real 2026-11-13:
// Peter preguntó "¿qué haces?" en nota de voz y Daniela contestó "dame
// un segundo" dos veces; la transcripción "Te pregunté que qué haces"
// no tenía saludo y cayó en el flujo de investigar).
// Charla casual sobre Daniela ("¿qué haces?", "te pregunté qué haces").
// NO es pregunta de negocio, no se investiga. Aplica a Peter y a Ricky;
// "¿qué haces para los hoteles?" sigue siendo pregunta de negocio.
// (v4.6, caso real 2026-11-13 12:03): la transcripción de una nota de voz
// puede venir mezclada con audio de fondo (la tele): "Se presume eran
// agentes... ¿Qué haces, Daniela? ...asesinados a mano." La pregunta real
// queda dentro de texto basura, así que la frase se busca en cualquier
// parte del mensaje, no solo como mensaje completo. Si tras la frase hay
// contexto de negocio ("para los hoteles", "en la empresa"), NO es charla.
function isSmallTalkAboutDaniela(norm) {
  const s = (norm || '').trim();
  // 1) Mensaje completo (caso normal).
  let t = s;
  // Quita saludo inicial y marco de pregunta, sin comerse el "qué haces".
  t = t.replace(/^(hola( daniela| dani)?|buenos dias|buenas tardes|buenas noches|buen dia|buenas|que onda|que tal|como estas|como estan|disculpa|oye( daniela)?)\b\s*/, '').trim();
  t = t.replace(/^(te pregunte|te preguntaba|te pregunto|te hice una pregunta|te queria preguntar|te quiero preguntar|dime)\b\s*/, '').trim();
  // "te pregunté QUE qué haces" deja "que que haces" -> "que haces".
  t = t.replace(/^que que\s+/, 'que ');
  // "qué haces, Daniela" -> "qué haces".
  t = t.replace(/,?\s*(daniela|dani)\s*$/, '').trim();
  if (/^(que haces( hoy| ahorita| ahora| tu)?|que estas haciendo( hoy| ahorita| ahora)?|que andas haciendo( hoy| ahorita| ahora)?)$/.test(t)) return true;
  // 2) La frase dentro de un mensaje más largo (transcripción contaminada).
  const m = s.match(/(que haces|que estas haciendo|que andas haciendo)(,? (daniela|dani))?\b/);
  if (!m) return false;
  const after = s.slice(m.index + m[0].length);
  if (/^\s*(para|por|con)\b/.test(after)) return false;
  if (/\b(en la empresa|en tu empresa|en tu trabajo|en blu bee)\b/.test(after.slice(0, 40))) return false;
  return true;
}

// ¿Peter pregunta por la actividad de hoy (mensajes, llamadas, clientes)?
// Daniela revisa leads.json y los estados de hoy y le reporta.
function looksLikeActivityQuestion(norm) {
  if (!norm) return false;
  const hasToday = /\b(hoy|el dia de hoy|esta manana|esta tarde|ayer)\b/.test(norm);
  const hasActivity = /\b(mensaje|mensajes|llamada|llamadas|cliente|clientes|contacto|contactos|lead|leads|alguien|nuevo|nueva|hubo|ha habido|han llegado|llegaron|escribio|escribieron|llamo|llamaron)\b/.test(norm);
  return hasToday && hasActivity;
}

function activityReportToday() {
  const today = new Date().toISOString().slice(0, 10);
  let leads = [];
  try {
    leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
    if (!Array.isArray(leads)) leads = [];
  } catch { /* sin leads */ }
  const todayLeads = leads.filter((l) => (l.fecha || '').slice(0, 10) === today);
  // Contactos nuevos de hoy (estados creados hoy, sin contar a Peter ni a Ricky).
  let newToday = [];
  try {
    for (const f of fs.readdirSync(STATE_DIR)) {
      if (!f.endsWith('.json')) continue;
      const phone = f.slice(0, -5);
      if (phone === config.peterWhatsApp || phone === '524421447169') continue;
      if (sameNumber(phone, config.peterWhatsApp)) continue;
      if (config.vipRicky && sameNumber(phone, config.vipRicky.phone)) continue;
      const st = JSON.parse(fs.readFileSync(path.join(STATE_DIR, f), 'utf8'));
      const created = (st.createdAt || st.fecha || '').slice(0, 10);
      if (created === today) newToday.push(st);
    }
  } catch { /* sin estados */ }
  const names = todayLeads.map((l) => l.nombre || l.name).filter(Boolean);
  const allNames = [...new Set([...names, ...newToday.map((s) => s.name).filter(Boolean)])];
  if (allNames.length === 0 && todayLeads.length === 0 && newToday.length === 0) {
    return 'Hasta ahora no, Pedro. Hoy no hemos tenido mensajes de clientes nuevos ni llamadas registradas. Si llega alguien, te aviso de inmediato.';
  }
  const parts = [];
  if (todayLeads.length > 0) parts.push(`${todayLeads.length} contacto${todayLeads.length > 1 ? 's' : ''} nuevo${todayLeads.length > 1 ? 's' : ''}`);
  if (allNames.length > 0) parts.push(`de ${allNames.join(', ')}`);
  return `Sí, Pedro. Hoy hemos tenido ${parts.join(' ')}. ¿Quieres que te pase los detalles?`;
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
  looksObscene,
  looksIdentityProbe,
  looksGeneralTask,
  // Diminutivos y cariños dirigidos a Daniela (v3.1)
  isAffectionateGreeting,
  // Trato VIP para Ricky, socio de Peter (v3.4)
  isVipRicky,
  isVipForbiddenName,
  vipSafeParsedName,
  // El nombre del bot nunca es el nombre del contacto (saludo confuso)
  isBotName,
  contactDisplayName,
  isVipAffectionate,
  looksGenuinelyObscene,
  vipPersonalLine,
  vipWarmGreeting,
  // Ricky siempre recibe respuesta (orden de Peter 2026-11-11): emojis y
  // charla casual con contexto, como chateando con una persona.
  isEmojiOnly,
  vipCasualReply,
  // Normalización de la marca / errores de dedo (v3.2)
  normalizeBrandVariants,
  // Daniela inteligente (v3)
  detectPersonal,
  handlePersonal,
  answerInfoQuestion,
  // Video de despedida personalizado (v3; fallback de identidad v3.3)
  farewellIdentity,
  farewellPhrase,
  farewellPhraseForIdentity,
  farewellVideoFileName,
  farewellVideoFileNameForIdentity,
  farewellVideoPath,
  farewellVideoPathForIdentity,
  socialLinksMessage,
  requestFarewellVideo,
  maybeRequestFarewellVideo,
  deliverPendingFarewell,
  scheduleFarewellRetry,
  // Transcripción de notas de voz (Whisper: Groq gratis, OpenAI de respaldo)
  transcribeWithGroq,
  transcribeWithOpenAI,
  transcribeAudio,
  // Preguntas pendientes para Tomás (v3.6, orden de Peter 2026-11-13):
  // "dame un segundo, te lo investigo" para Peter y para Ricky.
  savePendingQuestion,
  readPendingQuestions,
  resolvePendingQuestion,
  stripGreetingPrefix,
  isSmallTalkAboutDaniela,
  looksLikeActivityQuestion,
  activityReportToday,
  // Cerebro de IA (v4.0, orden de Peter 2026-11-13): Groq gratis,
  // OpenAI de respaldo; solo como respaldo cuando no hay intención ni
  // respuesta en la base.
  brainSystemPrompt,
  brainAnswerSafe,
  brainReply,
  askBrain,
  askBrainWithGroq,
  askBrainWithOpenAI,
  // Redirección profesional (v4.2, orden de Peter 2026-11-13): preguntas
  // fuera de tema (fútbol, viajes, coqueteo...) → respuesta corta con el
  // alcance, no "dame un segundo" ni cerebro. Aplica a todos menos Ricky.
  isOffTopicQuestion,
  OFF_TOPIC_REPLY,
  // Reunión virtual (v4.3, orden de Peter 2026-11-13): SOLO virtuales.
  wantsInPerson,
  parseMeetingPlatform,
  readLeads,
  confirmMeetingLead,
};
