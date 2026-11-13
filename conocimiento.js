// Base de conocimiento de Daniela — "Daniela inteligente" (2026-11-11).
// Respuestas de experta sobre tecnología, IoT y los servicios de Blü Bee.
//
// PARA AGREGAR UNA RESPUESTA NUEVA:
//   1. Añade una entrada a KNOWLEDGE con:
//      - id: un nombre corto y único (ej. 'beacons').
//      - patterns: frases/palabras que la persona puede escribir (en minúsculas,
//        sin acentos; la comparación normaliza el texto igual que aquí).
//        Usa frases específicas ("qué es un beacon") o palabras distintivas
//        ("lorawan"). Evita palabras genéricas ("precio", "costo") que ya
//        maneja el flujo de precio/demo, para no pelear con él.
//      - answer: la respuesta, cálida y experta, en español mexicano, 2-3 frases.
//        Tono "usted" (formal por defecto). Si la respuesta es de un sector,
//        conviene ofrecer el video después: pon offerVideo: true.
//      - offerVideo: true si después de responder conviene ofrecer el video
//        comercial (solo para temas de sector/servicios).
//   2. Corre las pruebas (node test-daniela-inteligente.js) para verificar.
//
// Las preguntas que Daniela NO supo responder se guardan en
// state/preguntas-sin-respuesta.json (solo la pregunta y la fecha, SIN datos
// personales: ni teléfono ni nombre), para que Peter y Raúl las revisen y le
// enseñen nuevas respuestas. Ver logUnanswered() y readUnanswered() abajo.

const fs = require('fs');
const path = require('path');
const config = require('./config');

function normalize(text) {
  return normalizeBrandVariants((text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¡!¿?.,;:()"-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

// Normalización de la marca (v3.2, 2026-11-11, caso real: Ricardo Roach
// escribió "Que hace blue Bee ?" y Daniela lo clasificó como "que no es de
// Blü Bee" y no contestó). La gente escribe la marca con errores de dedo
// ("Blue Bee", "Bluebee", "Blu Be", "Blube"...). Todas las variantes se
// normalizan a la forma canónica ("blu bee" / "blubee") ANTES de clasificar,
// así la mención de la marca —en cualquier ortografía— SIEMPRE se trata
// como una consulta sobre Blü Bee, nunca como "no es de Blü Bee". Principio
// general de Peter: si hay duda, se asume que es sobre Blü Bee y se
// responde con información.
// Se aplica dentro de normalize(), así TODO el matching (base de
// conocimiento, sectores, intenciones, límites) ve la forma canónica.
// No se toca "blue" solo: es una palabra común en inglés y no es la marca.
// El guion también se vuelve espacio ("Blu-Bee" -> "blu bee").
function normalizeBrandVariants(text) {
  return (text || '')
    .replace(/\bblue bee technologies\b/g, 'blu bee technologies')
    .replace(/\bbluebee technologies\b/g, 'blubee technologies')
    .replace(/\bblue bee\b/g, 'blu bee')
    .replace(/\bbluebee\b/g, 'blubee')
    .replace(/\bblue be\b/g, 'blu bee')
    .replace(/\bblu be\b/g, 'blu bee')
    .replace(/\bblube\b/g, 'blubee')
    .replace(/\bblueb\b/g, 'blubee');
}

// ¿Aparece el patrón (palabra o frase completa) en el texto normalizado?
function matchesPattern(normText, pattern) {
  const p = normalize(pattern);
  if (!p) return false;
  return ` ${normText} `.includes(` ${p} `);
}

// ---------- base de conocimiento: preguntas y respuestas ----------

const KNOWLEDGE = [
  {
    id: 'posicionamiento',
    patterns: [
      'posicionamiento en interiores', 'localizacion en interiores',
      'posicionamiento indoor', 'indoor positioning',
      'como funciona el posicionamiento', 'posicionamiento',
      'localizacion', 'localización',
    ],
    answer: 'El posicionamiento en interiores sirve para saber dónde está una persona o un equipo dentro de un edificio, en un mapa y en tiempo real. Funciona con la señal WiFi y con beacons Bluetooth: el celular calcula su posición ahí mismo, sin necesidad de estar conectado todo el tiempo, con una precisión de 1 a 5 metros. Así puede guiar a un visitante con rutas paso a paso hasta donde necesita llegar.',
    offerVideo: true,
  },
  {
    id: 'beacons',
    patterns: [
      'beacon', 'beacons', 'blusignal', 'k11',
      'como funciona un beacon', 'que es un beacon',
      'como funcionan los beacons', 'que son los beacons',
    ],
    answer: 'Un beacon es un dispositivo pequeño que emite una señal Bluetooth; el celular la capta y con eso calcula dónde está. Los nuestros son los BlüSignal (K11): se colocan en la pared o el techo, a una altura de 1.5 a 2.2 metros, en un lugar despejado —nunca debajo de una mesa o un mostrador, porque se tapa la señal—. Funcionan con batería y nosotros los monitoreamos para cambiarla cuando se acaba.',
  },
  {
    id: 'lorawan',
    patterns: [
      'lorawan', 'lora', 'que es lorawan',
      'que miden los sensores', 'sensores de temperatura',
      'sensores de humedad', 'sensor de co2',
      'humedad de la tierra', 'humedad del suelo', 'sensores',
    ],
    answer: 'LoRaWAN es una tecnología inalámbrica de largo alcance para sensores. Con ella medimos temperatura, humedad, CO2 y hasta la humedad de la tierra en un viñedo, sin necesidad de WiFi. Es ideal para lugares grandes: en un viñedo de 300 hectáreas, los sensores mandan sus datos solos. LoRaWAN no se usa para saber dónde está alguien —para eso es el posicionamiento con WiFi, beacons o GPS—; se usa para medir el ambiente.',
  },
  {
    id: 'precision',
    patterns: [
      'precision', 'que tan preciso', 'margen de error',
      'que tan exacto', 'que precision tiene', 'precision tiene',
    ],
    answer: 'Con buena señal y los beacons bien colocados, la precisión es de 1 a 5 metros. En zonas muy grandes donde no hay dónde colocar beacons, puede ser de 3 a 7 metros o más. Por eso en cada proyecto revisamos el lugar y colocamos los beacons donde den la mejor señal.',
  },
  {
    id: 'instalacion',
    patterns: [
      'como se instala', 'instalacion', 'que se necesita para instalar',
      'cuanto tarda la instalacion', 'como lo instalan',
      'cuanto tarda instalar',
    ],
    answer: 'Nosotros hacemos la instalación: colocamos los beacons y el gateway, calibramos el mapa caminando el edificio con nuestra herramienta, y dejamos la plataforma lista. Para una prueba de concepto solo necesitamos el plano del lugar en PDF y que haya cobertura WiFi. El tiempo depende del tamaño del edificio, pero una prueba chica se hace en un día.',
  },
  {
    id: 'poc',
    patterns: [
      'que es una poc', 'prueba de concepto', 'poc',
      'prueba piloto', 'piloto', 'como es la prueba',
    ],
    answer: 'Una prueba de concepto (PoC) es una prueba chica para demostrarle que la tecnología sí funciona en su edificio, antes de comprometerse a un proyecto completo. Tomamos su plano en PDF, hacemos el mapa, calibramos una zona y le enseñamos el posicionamiento en vivo. La primera prueba es gratis —es nuestro tiempo—; si quiere algo más completo, se cotiza el viaje y los días de calibración.',
    offerVideo: true,
  },
  {
    id: 'tablero',
    patterns: [
      'tablero', 'plataforma', 'dashboard',
      'que se ve en el tablero', 'como es el tablero',
      'que se ve en la plataforma', 'mapa en vivo',
      'que se ve en el mapa',
    ],
    answer: 'El tablero es un mapa en vivo de su edificio: ahí ve dónde están las personas y los equipos, los datos de los sensores (temperatura, humedad, CO2), las alertas y los reportes por zona. También se pueden sacar los datos para analizarlos en Power BI o en su herramienta de reportes.',
  },
  {
    id: 'panico',
    patterns: [
      'boton de panico', 'panico', 'emergencia',
      'man-down', 'hombre caido', 'alerta de emergencia',
      'boton de emergencia',
    ],
    answer: 'Sí, tenemos botón de pánico: desde la app o con un botón físico, la persona manda una alerta con su ubicación exacta, para que la atiendan de inmediato. También tenemos detección de hombre caído y rutas de evacuación a la salida. Es de lo que más usan los hospitales y la industria.',
  },
  {
    id: 'geofence',
    patterns: [
      'geofence', 'geocerca', 'geocercas',
      'promociones por proximidad', 'promocion', 'promociones',
      'notificacion al entrar', 'notificaciones push', 'notificaciones',
    ],
    answer: 'Con las geocercas marcamos zonas virtuales en el mapa: cuando alguien entra o sale de una zona, el sistema lo registra y puede mandarle una notificación o una promoción. También sirve para analítica: saber cuántas personas visitaron una zona, cuánto tiempo se quedaron y qué rutas usaron más.',
  },
  {
    id: 'privacidad',
    patterns: [
      'privacidad', 'datos personales', 'me van a rastrear',
      'es legal', 'proteccion de datos', 'me van a seguir',
      'saben donde estoy', 'me rastrean',
    ],
    answer: 'La privacidad es importante: solo identificamos a una persona si ella da su permiso en la app. Sin permiso, el sistema solo ve un código anónimo que cambia, así que nunca sabríamos que esa persona nos visitó varias veces. Y la posición solo se manda a nuestros servidores cuando hay conexión. Es el mismo modelo que usan las apps que regalan WiFi a cambio de su autorización.',
  },
  {
    id: 'gps',
    patterns: [
      'gps', 'exterior', 'afuera', 'aire libre',
      'vinedo grande', 'campo', 'hectareas',
    ],
    answer: 'Para exteriores usamos GPS: marcamos una geocerca alrededor de toda la propiedad y el celular sabe dónde está dentro de ella. En un viñedo grande no hacen falta beacons afuera; con el GPS basta para guiar al visitante. Y para medir el campo, los sensores LoRaWAN mandan la humedad de la tierra, la temperatura y más.',
  },
  {
    id: 'activos',
    patterns: [
      'se me pierden', 'se me pierde', 'se pierden los equipos',
      'localizar equipos', 'donde estan los equipos',
      'rastrear', 'rastreo de activos', 'activos',
      'no encuentro', 'encontrar equipos', 'equipos perdidos',
    ],
    answer: 'Justo para eso es el rastreo de activos: con beacons en los equipos, usted ve en el mapa dónde está cada uno, en segundos, no en minutos. Así ya no se pierden las camillas, los carritos o la herramienta. ¿Qué tipo de equipos se les pierden más?',
  },
  {
    id: 'visitantes',
    patterns: [
      'por donde andan', 'donde andan', 'visitantes',
      'donde estan mis visitantes', 'que les gusta',
      'donde se quedan', 'que compran',
    ],
    answer: 'Con el posicionamiento y la analítica, usted sabe por dónde andan sus visitantes, en qué zonas se quedan más tiempo y qué les interesa. Si el visitante da su permiso en la app, hasta puede saber que vino dos veces al mes y qué compró. Es la manera de conocer a su cliente y darle una mejor experiencia.',
  },
  {
    id: 'iot',
    patterns: [
      'que es el internet de las cosas', 'internet de las cosas',
      'que es iot',
    ],
    answer: 'El Internet de las Cosas (IoT) es conectar el mundo físico con inteligencia digital: saber lo que pasa en su negocio y convertirlo en información útil en tiempo real. En Blü Bee creamos soluciones de IoT a la medida de cada caso: cada empresa, hotel, hospital o viñedo tiene necesidades distintas, y diseñamos la solución para ese caso.',
    offerVideo: true,
  },
  {
    id: 'quehace',
    // Qué hace Blü Bee (v3.2, 2026-11-11, caso real: "Que hace blue Bee ?").
    // Patrones SOLO con la marca, para no robar preguntas específicas:
    // "¿qué hace un beacon?" sigue siendo de 'beacons', no de aquí.
    // La normalización de la marca (normalizeBrandVariants) ya convirtió
    // "blue Bee"/"Bluebee" en "blu bee"/"blubee" antes de buscar.
    patterns: [
      'que hace blu bee', 'que hace blubee', 'que hacen blu bee', 'que hacen blubee',
      'que es blu bee', 'que es blubee',
      'que hace blu bee technologies', 'que hace blubee technologies',
      'a que se dedica blu bee', 'a que se dedica blubee',
      'que ofrece blu bee', 'que ofrece blubee',
    ],
    answer: 'En Blü Bee creamos soluciones basadas en Internet de las Cosas (IoT), diseñadas para cada caso en específico. Localizamos personas, activos y espacios con beacons, monitoreamos temperatura, humedad y CO2 con sensores, y lo convertimos todo en tableros, mapas y alertas en tiempo real. Además, hacemos todo lo de una empresa tecnológica: chatbots, páginas web, software a la medida, CRM, sistemas administrativos, logística, Big Data y ciberseguridad. Cada empresa, hotel, hospital, viñedo o ciudad tiene necesidades distintas, y nosotros creamos la solución para ese caso.',
    offerVideo: true,
  },
  {
    id: 'kiosco',
    patterns: ['kiosco', 'kiosko', 'quiosco', 'totem', 'pantalla'],
    answer: 'Sí, también hacemos kioscos: una pantalla o una página web con el mapa y las rutas, para que el visitante se guíe sin instalar nada. Le muestra las indicaciones paso a paso y con un código QR se lleva la ruta a su celular. Es una buena forma de empezar sin una app completa.',
  },
  {
    id: 'carro',
    patterns: [
      'find my car', 'donde deje el carro', 'donde esta mi carro',
      'estacionamiento', 'como llego', 'como llegar', 'ruta',
    ],
    answer: 'La app lo guía con rutas paso a paso hasta donde necesita llegar, como un GPS pero dentro del edificio. Y también recuerda dónde dejó el carro en el estacionamiento (Find My Car), para que lo encuentre sin dar vueltas.',
  },
  {
    id: 'bateria',
    patterns: [
      'bateria', 'cuanto dura la bateria', 'se acaba la pila',
      'pila', 'cuando se acaba',
    ],
    answer: 'Los beacons funcionan con batería. Nosotros los monitoreamos desde el tablero: cuando a uno se le acaba la batería, lo reponemos con los mismos identificadores, para que nada se desconfigure. Es parte del servicio de mantenimiento.',
  },
  // ---------- portafolio amplio de servicios (v4.2, orden de Peter 2026-11-13) ----------
  // Blü Bee no solo hace IoT con beacons: hace todo lo de una empresa
  // tecnológica (chatbots, páginas web, software, CRM, logística,
  // administración, Big Data, ciberseguridad). Peter lo va a subir al
  // portafolio de servicios. Cada tema responde con lo que se hace y ofrece
  // preparar una propuesta. OJO con los plurales: el matching exige la
  // palabra completa, así que van singular Y plural ("chatbot"/"chatbots").
  {
    id: 'chatbot',
    patterns: [
      'chatbot', 'chatbots', 'hacen chatbots', 'hacen chatbot',
      'quiero un chatbot', 'hacer un chatbot', 'asistente virtual',
      'asistente de whatsapp', 'bot de whatsapp', 'chatbot para mi empresa',
    ],
    answer: 'Sí, también creamos chatbots y asistentes virtuales como yo: atienden a sus clientes por WhatsApp, responden preguntas, toman mensajes y agendan citas, 24 horas al día. Si le interesa uno para su empresa, con gusto le preparamos una propuesta.',
  },
  {
    id: 'paginaweb',
    patterns: [
      'pagina web', 'paginas web', 'sitio web', 'sitios web',
      'hacen paginas web', 'hacen pagina web', 'quiero una pagina web',
      'desarrollo web', 'tienda en linea', 'ecommerce', 'e-commerce',
    ],
    answer: 'Sí, también desarrollamos páginas web y tiendas en línea a la medida de cada empresa: informativas, con catálogo y contacto por WhatsApp, para vender o atender a sus clientes en internet. Si le interesa, con gusto le preparamos una propuesta.',
  },
  {
    id: 'ciberseguridad',
    patterns: [
      'ciberseguridad', 'hacen ciberseguridad', 'seguridad informatica',
      'seguridad de la informacion', 'proteccion de datos', 'hackeo',
    ],
    answer: 'Sí, también trabajamos ciberseguridad: protegemos la información y los sistemas de su empresa contra accesos no autorizados y pérdidas de datos. Si le interesa una revisión de seguridad, con gusto le preparamos una propuesta.',
  },
  {
    id: 'software',
    patterns: [
      'desarrollo de software', 'desarrollan software', 'hacen software',
      'programacion', 'software a la medida', 'sistema a la medida',
      'sistemas a la medida', 'aplicacion', 'aplicaciones',
      'hacen aplicaciones', 'app para mi empresa',
    ],
    answer: 'Sí, también desarrollamos software y aplicaciones a la medida: sistemas, aplicaciones móviles y herramientas para que su empresa trabaje mejor. Si nos cuenta qué necesita, con gusto le preparamos una propuesta.',
  },
  {
    id: 'crm',
    patterns: [
      'crm', 'tienen crm', 'hacen crm', 'un crm',
      'gestion de clientes', 'administracion de clientes',
    ],
    answer: 'Sí, también implementamos sistemas CRM para administrar a sus clientes: contactos, seguimiento, ventas y atención, todo en un solo lugar. Si le interesa, con gusto le preparamos una propuesta.',
  },
  {
    id: 'logistica',
    patterns: [
      'logistica', 'hacen logistica', 'rastrear envios',
      'seguimiento de envios', 'flotilla', 'flota de vehiculos',
    ],
    answer: 'Sí, también hacemos soluciones de logística: seguimiento de vehículos y envíos en tiempo real, con mapas, alertas y reportes. Si le interesa para su empresa, con gusto le preparamos una propuesta.',
  },
  {
    id: 'administracion',
    patterns: [
      'sistema administrativo', 'sistemas administrativos',
      'sistemas de administracion', 'administracion', 'facturacion',
      'sistema de facturacion', 'inventario', 'control de inventario',
      'nomina',
    ],
    answer: 'Sí, también implementamos sistemas administrativos: facturación, inventario, nómina y control de su empresa, todo en un solo lugar. Si le interesa, con gusto le preparamos una propuesta.',
  },
  {
    id: 'bigdata',
    patterns: [
      'big data', 'hacen big data', 'business intelligence',
      'inteligencia de negocios', 'analisis de datos', 'tableros de datos',
    ],
    answer: 'Sí, también trabajamos con Big Data y Business Intelligence: convertimos los datos de su empresa en tableros, reportes y alertas para que tome mejores decisiones. Si le interesa, con gusto le preparamos una propuesta.',
  },
  {
    id: 'trazabilidad',
    patterns: [
      'trazabilidad', 'hacen trazabilidad', 'deteccion',
      'monitoreo en tiempo real', 'seguimiento en tiempo real',
    ],
    answer: 'Sí, también hacemos soluciones de trazabilidad y detección: seguimiento en tiempo real de personas, equipos, vehículos o productos, con alertas cuando algo sale de lo esperado. Si le interesa para su empresa, con gusto le preparamos una propuesta.',
  },
];

// Busca la mejor respuesta de la base de conocimiento para un mensaje.
// Devuelve la entrada { id, answer, offerVideo } o null si no hay coincidencia.
// Gana la entrada con más puntos; en empate, la primera. Las frases
// específicas pesan 2 puntos y una palabra suelta 1: así una pregunta sobre
// otra cosa que menciona "beacon" de pasada ("¿tienen beacons de color
// rosa?") no dispara la respuesta genérica. Hace falta un mínimo de 2 puntos:
// una sola palabra suelta no basta para responder.
function findAnswer(text) {
  const norm = normalize(text);
  if (!norm) return null;
  let best = null;
  let bestScore = 0;
  for (const entry of KNOWLEDGE) {
    let score = 0;
    for (const p of entry.patterns) {
      if (matchesPattern(norm, p)) {
        score += normalize(p).includes(' ') ? 2 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return bestScore >= 2 ? best : null;
}

// ---------- sectores: respuestas adaptadas por sector ----------
// Los textos empiezan con la frase institucional del sector (la misma que
// ya usaba Daniela), y añaden un ejemplo concreto de lo que se hace ahí.
// Así la respuesta es corta, concreta y experta, no un folleto.

const SECTORS = {
  vinedo: {
    patterns: ['vinedo', 'viñedo', 'vinedos', 'viñedos', 'vino', 'vinicola', 'vinícola', 'uva', 'vendimia'],
    pitch: 'En un viñedo, creamos una solución para que cada visitante viva su propia historia y se sienta especial, mientras tú sabes qué les gusta, dónde se quedan y qué compran. Por ejemplo, los sensores LoRaWAN miden la humedad de la tierra y el GPS exterior guía a los visitantes por toda la propiedad.',
  },
  hotel: {
    patterns: ['hotel', 'hoteles', 'huesped', 'huésped', 'huespedes', 'huéspedes', 'habitacion', 'habitación', 'habitaciones', 'resort'],
    pitch: 'En un hotel, creamos una solución para entender cómo se mueven los huéspedes y optimizar la operación. Por ejemplo, localizar los carritos de limpieza y los equipos en segundos, o avisarle al huésped cuando su habitación está lista.',
  },
  hospital: {
    patterns: ['hospital', 'hospitales', 'clinica', 'clínica', 'clinicas', 'clínicas', 'paciente', 'pacientes', 'medico', 'médico'],
    pitch: 'En un hospital, creamos una solución para saber dónde está lo importante, en segundos, no en minutos. Por ejemplo, localizar una camilla o un equipo al instante, y el botón de pánico para que el personal pida ayuda con su ubicación exacta.',
  },
  'centro comercial': {
    patterns: ['centro comercial', 'plaza', 'plazas', 'mall', 'tienda', 'tiendas'],
    pitch: 'En centros comerciales creamos soluciones que generan experiencias y valor real. Por ejemplo, promociones por proximidad cuando alguien pasa frente a una tienda, y saber qué zonas se visitan más y cuánto tiempo se quedan.',
  },
  industria: {
    patterns: ['industria', 'industrial', 'fabrica', 'fábrica', 'fabricas', 'fábricas', 'logistica', 'logística', 'almacen', 'almacén', 'bodega', 'bodegas'],
    pitch: 'En la industria, creamos soluciones para tener control de tus procesos, operaciones y logística, con información en tiempo real. Por ejemplo, localizar montacargas y mercancía en el almacén, y monitorear temperatura y humedad.',
  },
  corporativo: {
    patterns: ['corporativo', 'oficina', 'oficinas', 'edificio corporativo'],
    pitch: 'En un corporativo, creamos una solución para saber cómo se usan los espacios y optimizar la operación. Por ejemplo, encontrar salas libres, localizar equipos, y saber qué áreas se usan más.',
  },
  gobierno: {
    patterns: ['gobierno', 'dependencia', 'municipio', 'ayuntamiento'],
    pitch: 'Para dependencias de gobierno, creamos soluciones para conocer lo que pasa dentro de sus espacios y atender mejor a la gente.',
  },
  ciudad: {
    patterns: ['ciudad inteligente', 'ciudad', 'smart city'],
    pitch: 'Para ciudades inteligentes, creamos soluciones que conectan espacios, servicios y personas con información en tiempo real.',
  },
};

// Detecta el sector del que habla la persona (con sinónimos).
// Devuelve la clave del sector o null.
function detectSector(text) {
  const norm = normalize(text);
  if (!norm) return null;
  let best = null;
  let bestScore = 0;
  for (const [key, sector] of Object.entries(SECTORS)) {
    let score = 0;
    for (const p of sector.patterns) {
      if (matchesPattern(norm, p)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return bestScore > 0 ? best : null;
}

// ---------- necesidad expresada (flujo ágil intent-first) ----------
// La persona expresa una necesidad o un problema ANTES de dar sus datos:
// "quiero que me ayudes en esto", "se me pierden los equipos",
// "quiero saber por dónde andan mis visitantes". Daniela primero reconoce
// la necesidad y la explora; la identidad se pide de forma natural dentro
// del mismo mensaje, no como interrogatorio.

const NEED_PATTERNS = [
  'quiero que me ayudes', 'necesito', 'me interesa', 'busco',
  'quiero saber', 'quiero una', 'quiero que', 'ayudame', 'ayuda',
  'se me pierden', 'se me pierde', 'no encuentro',
  'me gustaria', 'quisiera', 'quiero ver', 'me urge',
  'tengo un problema', 'quiero informacion', 'quiero info',
  'quiero una demo', 'quiero agendar',
];

function detectNeed(text) {
  const norm = normalize(text);
  if (!norm) return false;
  return NEED_PATTERNS.some((p) => matchesPattern(norm, p));
}

// ---------- aprendizaje: preguntas sin respuesta ----------
// Se guarda solo la pregunta y la fecha (SIN teléfono ni nombre: sin datos
// personales). Peter y Raúl revisan este archivo para ver qué preguntan los
// prospectos y enseñarle nuevas respuestas a Daniela.

const UNANSWERED_FILE = path.join(config.stateDir, 'preguntas-sin-respuesta.json');
const UNANSWERED_MAX = 200;

function readUnanswered() {
  try {
    const data = JSON.parse(fs.readFileSync(UNANSWERED_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function logUnanswered(question) {
  const q = (question || '').trim().slice(0, 200);
  if (!q) return;
  try {
    const list = readUnanswered();
    list.push({ fecha: new Date().toISOString(), pregunta: q });
    const trimmed = list.slice(-UNANSWERED_MAX);
    fs.mkdirSync(path.dirname(UNANSWERED_FILE), { recursive: true });
    fs.writeFileSync(UNANSWERED_FILE, JSON.stringify(trimmed, null, 2));
  } catch (e) {
    console.error('No se pudo guardar la pregunta sin respuesta:', e.message);
  }
}

module.exports = {
  KNOWLEDGE,
  SECTORS,
  findAnswer,
  detectSector,
  detectNeed,
  logUnanswered,
  readUnanswered,
  normalize,
  normalizeBrandVariants,
};
