// Pruebas del flujo nuevo de Daniela (sin menú de 3 botones).
// Uso: node test-nuevo-flujo.js
// No toca el estado real: usa un STATE_DIR temporal y un stub de whatsapp.js
// (nada sale a la API de Meta; notifyPeter se registra en el log, no se envía).
// El test-local.js del repo es del flujo v1 (con botones) y quedó obsoleto.

const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daniela-test-'));
process.env.STATE_DIR = tmpDir;

const wa = require('./whatsapp');
const sent = []; // { to, kind, body }
wa.sendText = async (to, body) => { sent.push({ to, kind: 'text', body }); return { ok: true }; };
wa.sendVideo = async (to, file) => { sent.push({ to, kind: 'video', body: String(file) }); return { ok: true }; };
wa.sendAudio = async (to, file) => { sent.push({ to, kind: 'audio', body: String(file) }); return { ok: true }; };
wa.sendButtons = async (to, body) => { sent.push({ to, kind: 'buttons', body }); return { ok: true }; };
wa.markRead = async () => {};
wa.downloadMedia = async () => null;

const daniela = require('./daniela');
const config = require('./config');
const PETER = config.peterWhatsApp; // 524421447169
const PETER_REAL = '5214421447169'; // mismo número como lo manda Meta (con el "1" de móvil)

let pass = 0;
let fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? `  <-- ${detail}` : ''}`); }
}

function readState(phone) {
  const f = path.join(tmpDir, `${phone}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
function readLeads() {
  const f = path.join(tmpDir, 'leads.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
}
// Mensajes enviados a un número desde el marcador `mark` (índice en `sent`).
function since(mark, phone) {
  return sent.slice(mark).filter((s) => s.to === phone);
}
function texts(msgs) { return msgs.filter((m) => m.kind === 'text').map((m) => m.body); }
function hasText(msgs, re) { return texts(msgs).some((b) => re.test(b)); }
function hasKind(msgs, kind) { return msgs.some((m) => m.kind === kind); }
// Avisos a Pedro (notifyPeter) llegan como texto a PETER con el prefijo 🔔.
function notices(msgs) { return texts(msgs).filter((b) => b.startsWith('🔔')); }
function replies(msgs) { return texts(msgs).filter((b) => !b.startsWith('🔔')); }

async function incoming(phone, text) {
  // handleMessage recibe el mensaje completo como llega del webhook de Meta:
  // { from, type: 'text', text: { body } }
  await daniela.handleMessage({ from: phone, type: 'text', text: { body: text } });
}

(async () => {
  console.log('STATE_DIR temporal:', tmpDir);
  console.log('Peter (peterWhatsApp):', PETER);

  // ---------- (a) Contacto nuevo: "Hola" -> video + pregunta nombre/empresa
  const A = '521234567890';
  let mark = sent.length;
  await incoming(A, 'Hola');
  let m = since(mark, A);
  let st = readState(A);
  console.log('\n(a) Contacto nuevo "Hola":');
  check('manda el video de bienvenida', hasKind(m, 'video'));
  check('pregunta nombre y correo (v3.6, orden de Peter 2026-11-13)', hasText(m, /¿Con quién tengo el gusto\? ¿Me podrías dar tu nombre para darte un trato especial\? ¿Me compartes tu correo para mandarte más información\?/));
  check('etapa = awaiting_name_company', st && st.stage === 'awaiting_name_company', `stage=${st && st.stage}`);

  // ---------- (b) "Quiero saber más de Blü Bee Technologies" -> NO es nombre
  mark = sent.length;
  await incoming(A, 'Quiero saber más de Blü Bee Technologies');
  m = since(mark, A);
  st = readState(A);
  console.log('\n(b) "Quiero saber más de Blü Bee Technologies":');
  check('NO saluda a "Quiero saber"', !hasText(m, /Mucho gusto, Quiero/));
  check('NO guarda nombre', st && st.name === null, `name=${st && st.name}`);
  check('NO guarda "Blü Bee" como empresa', st && (st.company === null || st.company === undefined), `company=${st && st.company}`);
  check('marca needsContact=true', st && st.needsContact === true);
  check('responde con la información pedida', hasText(m, /soluciones basadas en Internet de las Cosas/));

  // ---------- (c) "Soy María González de Hotel Casa Blanca"
  const B = '521111222333';
  await incoming(B, 'Hola');
  mark = sent.length;
  await incoming(B, 'Soy María González de Hotel Casa Blanca');
  m = since(mark, B);
  st = readState(B);
  console.log('\n(c) "Soy María González de Hotel Casa Blanca":');
  check('nombre capturado', st && st.name === 'María González', `name=${st && st.name}`);
  check('empresa capturada', st && st.company === 'Hotel Casa Blanca', `company=${st && st.company}`);
  check('etapa = awaiting_address_pref', st && st.stage === 'awaiting_address_pref', `stage=${st && st.stage}`);
  check('pregunta cómo dirigirse', hasText(m, /Mucho gusto, María González\. ¿Cómo prefiere que le llame\? ¿Le hablo de tú o de usted\?/));

  // ---------- (d) "de tú, llámame Mari"
  mark = sent.length;
  await incoming(B, 'de tú, llámame Mari');
  m = since(mark, B);
  st = readState(B);
  console.log('\n(d) "de tú, llámame Mari":');
  check('formality = tu', st && st.formality === 'tu', `formality=${st && st.formality}`);
  check('preferredName = Mari', st && st.preferredName === 'Mari', `preferredName=${st && st.preferredName}`);
  check('etapa = awaiting_contact', st && st.stage === 'awaiting_contact', `stage=${st && st.stage}`);
  check('pide correo y teléfono', hasText(m, /¿Me comparte su correo y el número donde prefiere que le contactemos\?/));

  // ---------- (e) "mari@hotel.com, WhatsApp al mismo número"
  mark = sent.length;
  await incoming(B, 'mari@hotel.com, WhatsApp al mismo número');
  m = since(mark, B);
  st = readState(B);
  console.log('\n(e) "mari@hotel.com, WhatsApp al mismo número":');
  check('email guardado', st && st.email === 'mari@hotel.com', `email=${st && st.email}`);
  check('preferencia = whatsapp', st && st.contactPref === 'whatsapp', `contactPref=${st && st.contactPref}`);
  check('contactPhone = número del remitente', st && st.contactPhone === B, `contactPhone=${st && st.contactPhone}`);
  check('etapa = main', st && st.stage === 'main', `stage=${st && st.stage}`);
  check('pregunta abierta en tú', hasText(m, /¿En qué te puedo ayudar\?/));

  // ---------- (f) Pedir demo -> día/hora -> resumen + notificación
  mark = sent.length;
  await incoming(B, 'Quiero agendar una demostración');
  m = since(mark, B);
  st = readState(B);
  console.log('\n(f) Pedir demo (datos ya completos):');
  check('pide día y hora (sin pedir datos de nuevo)', st && st.stage === 'demo_when' && hasText(m, /¿Qué día y hora te conviene\?/), `stage=${st && st.stage}`);

  mark = sent.length;
  await incoming(B, 'El jueves a las 11 de la mañana');
  m = since(mark, B);
  st = readState(B);
  const leads = readLeads();
  const lead = leads.find((l) => l.tipo === 'demostracion' && l.nombre === 'María González');
  console.log('    (demo confirmada):');
  check('lead guardado con nombre y empresa', !!lead && lead.empresa === 'Hotel Casa Blanca' && /jueves/i.test(lead.diaHora || ''), JSON.stringify(lead));
  check('etapa = closed', st && st.stage === 'closed', `stage=${st && st.stage}`);
  check('resumen de confirmación enviado', hasText(m, /Antes de despedirme, le confirmo lo que le paso al área correspondiente:/));
  check('resumen incluye empresa y correo', hasText(m, /Hotel Casa Blanca/) && hasText(m, /mari@hotel\.com/));
  check('cierre oficial: audio enviado', hasKind(m, 'audio'));
  check('cierre oficial: video del logo enviado', hasKind(m, 'video'));
  const note = notices(since(mark, PETER));
  check('notifyPeter: aviso a Pedro', note.length > 0);
  check('aviso incluye bloque de datos completo',
    note.length > 0 && /María González/.test(note[0]) && /Hotel Casa Blanca/.test(note[0])
    && /mari@hotel\.com/.test(note[0]) && /WhatsApp/.test(note[0]),
    note[0] ? note[0].slice(0, 200) : '(sin aviso)');

  // ---------- (g) Contacto que vuelve con nombre guardado
  mark = sent.length;
  await incoming(B, 'Hola');
  m = since(mark, B);
  st = readState(B);
  console.log('\n(g) Contacto que vuelve (nombre guardado):');
  check('saluda por preferredName ("Hola, Mari")', hasText(m, /Hola, Mari, soy Daniela, la asistente de Blü Bee Technologies\. ¿En qué te puedo ayudar\?/));
  check('NO repite el video de bienvenida', !hasKind(m, 'video'));
  check('NO vuelve a pedir nombre/empresa', !hasText(m, /¿me dice su nombre y de qué empresa/));
  check('etapa = main', st && st.stage === 'main', `stage=${st && st.stage}`);

  // ---------- Ana: "hola Daniela soy Ana" (caso real 2026-11-10)
  const ANA = '521555000111';
  await incoming(ANA, 'Hola');
  mark = sent.length;
  await incoming(ANA, 'hola Daniela soy Ana');
  m = since(mark, ANA);
  st = readState(ANA);
  console.log('\n(Ana) "hola Daniela soy Ana":');
  check('nombre extraído = Ana', st && st.name === 'Ana', `name=${st && st.name}`);
  check('NO toma "Daniela" como nombre', !hasText(m, /Mucho gusto, Daniela/));
  check('saluda "Mucho gusto, Ana"', hasText(m, /Mucho gusto, Ana\./));

  const ANA2 = '521555000222';
  mark = sent.length;
  await incoming(ANA2, 'hola Daniela soy Ana');
  m = since(mark, ANA2);
  st = readState(ANA2);
  console.log('    (Ana, como primer mensaje):');
  check('video de bienvenida enviado', hasKind(m, 'video'));
  check('nombre extraído = Ana', st && st.name === 'Ana', `name=${st && st.name}`);
  check('etapa = awaiting_address_pref', st && st.stage === 'awaiting_address_pref', `stage=${st && st.stage}`);

  // Lleva a Peter a handedOff (misma secuencia que en (h)): saludo ->
  // nombre -> usted -> sin correo -> pedir hablar con Pedro.
  async function peterToHandedOff() {
    await incoming(PETER, 'Hola');
    await incoming(PETER, 'Soy Pedro');
    await incoming(PETER, 'usted');
    await incoming(PETER, 'No tengo correo');
    await incoming(PETER, 'Quiero hablar con Pedro');
    const s = readState(PETER);
    check('preparación: handedOff', s && s.handedOff === true && s.stage === 'handed_off', `handedOff=${s && s.handedOff} stage=${s && s.stage}`);
  }

  // ---------- (h) Reinicio SOLO para Pedro, tras handedOff
  console.log('\n(h) "reiniciar daniela" desde el número de Peter:');
  await incoming(PETER, 'Hola');
  await incoming(PETER, 'Soy Pedro');
  st = readState(PETER);
  check('nombre "Pedro" aceptado tras "Soy"', st && st.name === 'Pedro', `name=${st && st.name}`);
  await incoming(PETER, 'usted');
  mark = sent.length;
  await incoming(PETER, 'No tengo correo');
  m = since(mark, PETER);
  st = readState(PETER);
  check('rechazo elegante, sin bloquear', hasText(m, /Sin problema, con su número de WhatsApp es suficiente\./) && st.stage === 'main', `stage=${st && st.stage}`);
  await incoming(PETER, 'Quiero hablar con Pedro');
  st = readState(PETER);
  check('handedOff tras pedir hablar con Pedro', st && st.handedOff === true && st.stage === 'handed_off', `handedOff=${st && st.handedOff} stage=${st && st.stage}`);
  mark = sent.length;
  await incoming(PETER, 'Hola');
  m = since(mark, PETER);
  check('en handedOff ya NO contesta (solo aviso interno a Pedro)', replies(m).length === 0, `respuestas=${JSON.stringify(replies(m))}`);
  mark = sent.length;
  await incoming(PETER, 'reiniciar daniela');
  m = since(mark, PETER);
  st = readState(PETER);
  check('reinicia: etapa = awaiting_name_company', st && st.stage === 'awaiting_name_company', `stage=${st && st.stage}`);
  check('reinicia: sin nombre ni handedOff', st && st.name === null && st.handedOff === false, `name=${st && st.name} handedOff=${st && st.handedOff}`);
  check('reinicia: manda video + saludo', hasKind(m, 'video') && hasText(m, /Para atenderle como se merece, ¿me dice su nombre y de qué empresa nos escribe\?/));

  // ---------- (h2) Reinicio tolerante: "a", "reinicia", palabras extra
  // (caso real 2026-11-10 15:01: Peter escribió "Reiniciar a Daniela"
  // y el comando exacto no coincidió -> solo se reenvió el aviso)
  console.log('\n(h2) Reinicio tolerante (variantes desde el número de Peter):');
  for (const variant of ['Reiniciar a Daniela', 'reinicia daniela', 'Reiniciar a Daniela por favor']) {
    await peterToHandedOff();
    mark = sent.length;
    await incoming(PETER, variant);
    m = since(mark, PETER);
    st = readState(PETER);
    console.log(`    variante "${variant}":`);
    check('reinicia: etapa = awaiting_name_company', st && st.stage === 'awaiting_name_company', `stage=${st && st.stage}`);
    check('reinicia: sin nombre ni handedOff', st && st.name === null && st.handedOff === false, `name=${st && st.name} handedOff=${st && st.handedOff}`);
    check('reinicia: manda video + saludo', hasKind(m, 'video') && hasText(m, /Para atenderle como se merece, ¿me dice su nombre y de qué empresa nos escribe\?/));
  }

  // ---------- (h4) El número REAL como lo manda Meta: 5214421447169
  // (caso real 2026-11-10 15:05: Peter escribió "Reiniciar Daniela"
  // exacto y TAMPOCO se reinició: from=521... != config 52...).
  console.log('\n(h4) "Reiniciar Daniela" desde 5214421447169 (formato real de Meta):');
  await incoming(PETER_REAL, 'Hola');
  await incoming(PETER_REAL, 'Soy Pedro');
  await incoming(PETER_REAL, 'usted');
  await incoming(PETER_REAL, 'No tengo correo');
  await incoming(PETER_REAL, 'Quiero hablar con Pedro');
  st = readState(PETER_REAL);
  check('preparación: handedOff', st && st.handedOff === true && st.stage === 'handed_off', `handedOff=${st && st.handedOff} stage=${st && st.stage}`);
  mark = sent.length;
  await incoming(PETER_REAL, 'Reiniciar Daniela');
  m = since(mark, PETER_REAL);
  st = readState(PETER_REAL);
  check('reinicia: etapa = awaiting_name_company', st && st.stage === 'awaiting_name_company', `stage=${st && st.stage}`);
  check('reinicia: sin nombre ni handedOff', st && st.name === null && st.handedOff === false, `name=${st && st.name} handedOff=${st && st.handedOff}`);
  check('reinicia: manda video + saludo', hasKind(m, 'video') && hasText(m, /Para atenderle como se merece, ¿me dice su nombre y de qué empresa nos escribe\?/));

  // ---------- (h3) "reiniciar" SOLO (sin "daniela") NO reinicia
  await peterToHandedOff();
  mark = sent.length;
  await incoming(PETER, 'reiniciar');
  m = since(mark, PETER);
  st = readState(PETER);
  console.log('\n(h3) "reiniciar" solo (sin "daniela"):');
  check('NO reinicia: sigue en handedOff', st && st.handedOff === true && st.stage === 'handed_off', `handedOff=${st && st.handedOff} stage=${st && st.stage}`);
  check('NO contesta (solo aviso interno a Pedro)', replies(m).length === 0, `respuestas=${JSON.stringify(replies(m))}`);

  // ---------- (i) "reiniciar daniela" desde OTRO número: NO reinicia
  const C = '521999888777';
  await incoming(C, 'Hola');
  const before = readState(C);
  mark = sent.length;
  await incoming(C, 'reiniciar daniela');
  m = since(mark, C);
  st = readState(C);
  console.log('\n(i) "reiniciar daniela" desde OTRO número:');
  check('NO vuelve a etapa new', st && st.stage !== 'new', `stage=${st && st.stage}`);
  check('NO manda el video de bienvenida', !hasKind(m, 'video'));
  check('NO toma "reiniciar" como nombre', st && st.name === null, `name=${st && st.name}`);
  check('se trata como mensaje normal (sin reinicio)', st && st.stage === (before && before.stage), `antes=${before && before.stage} ahora=${st && st.stage}`);

  mark = sent.length;
  await incoming(C, 'Reiniciar a Daniela');
  m = since(mark, C);
  st = readState(C);
  console.log('    ("Reiniciar a Daniela" desde OTRO número):');
  check('NO vuelve a etapa new', st && st.stage !== 'new', `stage=${st && st.stage}`);
  check('NO manda el video de bienvenida', !hasKind(m, 'video'));
  check('NO toma "Daniela" como nombre', st && st.name === null, `name=${st && st.name}`);
  check('se trata como mensaje normal (sin reinicio)', st && st.stage === (before && before.stage), `antes=${before && before.stage} ahora=${st && st.stage}`);

  // ---------- (j) Saludos variados (v3.6, orden de Peter 2026-11-13):
  // Daniela entiende todas las formas de saludar como primer mensaje
  // ("qué onda", "qué haces", "qué tal", "cómo estás", "disculpa",
  // "buenas tardes", "buen día", "qué hay"), responde el saludo y pide
  // nombre + correo. Y un saludo con necesidad NO se traga la necesidad.
  const GREET_VARIANTS = [
    ['qué onda', '521111000100'],
    ['qué haces', '521111000101'],
    ['qué tal', '521111000102'],
    ['cómo estás', '521111000103'],
    ['disculpa', '521111000104'],
    ['buenas tardes', '521111000105'],
    ['buen día', '521111000106'],
    ['qué hay', '521111000107'],
    ['Hola Daniela, buenos días, ¿cómo estás?', '521111000108'],
  ];
  for (const [greet, phone] of GREET_VARIANTS) {
    mark = sent.length;
    await incoming(phone, greet);
    m = since(mark, phone);
    st = readState(phone);
    console.log(`\n(j) Primer saludo "${greet}":`);
    check('responde el saludo y pide nombre + correo', hasText(m, /Hola, mucho gusto\. Soy Daniela, la asistente de Blü Bee Technologies\. ¿Con quién tengo el gusto\? ¿Me podrías dar tu nombre para darte un trato especial\? ¿Me compartes tu correo para mandarte más información\?/));
    check('etapa = awaiting_name_company', st && st.stage === 'awaiting_name_company', `stage=${st && st.stage}`);
    check('NO guarda el saludo como nombre', st && st.name === null, `name=${st && st.name}`);
  }

  // (j2) Saludo + necesidad: la necesidad manda, no se traga la pregunta.
  const NEED = '521111000109';
  mark = sent.length;
  await incoming(NEED, 'hola Daniela, quiero que me ayudes en esto');
  m = since(mark, NEED);
  st = readState(NEED);
  console.log('\n(j2) "hola Daniela, quiero que me ayudes en esto":');
  check('reconoce la necesidad y pide los datos', hasText(m, /Claro, con gusto te ayudo con eso\. Soy Daniela, la asistente virtual de Blü Bee\. Para atenderte mejor, ¿me compartes tu nombre y de qué empresa nos escribes\?/));
  check('la necesidad queda guardada (pendingNeed)', !!st && !!st.pendingNeed, `pendingNeed=${st && JSON.stringify(st.pendingNeed)}`);

  // (j3) detectIntent directo: cada variante es 'greeting', y un saludo
  // con necesidad NO es solo saludo.
  console.log('\n(j3) detectIntent directo:');
  for (const [greet] of GREET_VARIANTS) {
    const intent = daniela.detectIntent(greet, greet.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¡!¿?.,;:()"-]/g, ' ').replace(/\s+/g, ' ').trim());
    check(`"${greet}" -> greeting`, intent && intent.kind === 'greeting', `intent=${intent && intent.kind}`);
  }
  const needIntent = daniela.detectIntent('hola Daniela, quiero que me ayudes en esto', 'hola daniela quiero que me ayudes en esto');
  check('"hola Daniela, quiero que me ayudes" NO es solo greeting', !needIntent || needIntent.kind !== 'greeting', `intent=${needIntent && needIntent.kind}`);

  // ---------- (k) "Dame un segundo, te lo investigo" para Peter (v3.6,
  // orden de Peter 2026-11-13): cuando Peter pregunta algo que Daniela no
  // sabe, ella NO responde solo con un saludo: dice que lo revisa y
  // guarda la pregunta para Tomás. Y si pregunta por la actividad de hoy
  // (mensajes/llamadas/clientes), le contesta con el reporte.
  const PETER_OWNER = '524421447169';
  // Resetea el estado de Peter a 'main' (las secciones (h)/(i) lo dejan
  // en handedOff, y en handedOff Daniela ya no le contesta).
  fs.writeFileSync(path.join(tmpDir, `${PETER_OWNER}.json`), JSON.stringify({
    phone: PETER_OWNER, stage: 'main', name: 'Pedro', preferredName: 'Pedro',
    formality: 'usted', handedOff: false,
  }, null, 2));
  // Resetea el estado de Ricky a 'main' con su nombre (para (k-d)/(k-e)).
  const RICKY_OWNER = '5215519518504';
  fs.writeFileSync(path.join(tmpDir, `${RICKY_OWNER}.json`), JSON.stringify({
    phone: RICKY_OWNER, stage: 'main', name: 'Ricky', preferredName: 'Ricky',
    formality: 'tu', handedOff: false,
  }, null, 2));
  // (k-a) Saludo simple de Peter: saludo de vuelta, sin pregunta pendiente.
  mark = sent.length;
  await incoming(PETER_OWNER, 'Hola Daniela, buenos días, ¿cómo estás?');
  m = since(mark, PETER_OWNER);
  st = readState(PETER_OWNER);
  console.log('\n(k-a) Peter: "Hola Daniela, buenos días, ¿cómo estás?":');
  check('responde el saludo', hasText(m, /Hola Pedro, (buenos días|buenas tardes|buenas noches)\. Muy bien, gracias\. ¿En qué le puedo ayudar\?/));
  check('NO guarda pregunta pendiente', !daniela.readPendingQuestions().some((q) => q.who === 'pedro' && /cómo estás/.test(q.pregunta)));
  check('nombre fijado a Pedro', st && st.name === 'Pedro', `name=${st && st.name}`);

  // (k-b) Peter pregunta por la actividad de hoy: reporte (sin clientes hoy).
  mark = sent.length;
  await incoming(PETER_OWNER, 'hola Daniela, oye, hemos tenido mensajes de texto hoy, o alguna llamada, o algún contacto de algún cliente?');
  m = since(mark, PETER_OWNER);
  console.log('\n(k-b) Peter: "hemos tenido mensajes de texto hoy...?":');
  check('NO responde solo con el saludo', !hasText(m, /^Hola Pedro, buenos días\. Muy bien, gracias\. ¿En qué le puedo ayudar\?$/));
  check('da el reporte de actividad de hoy', hasText(m, /Hoy no hemos tenido mensajes de clientes nuevos ni llamadas registradas|Hoy hemos tenido/));
  check('NO guarda pregunta pendiente (la contestó ella)', !daniela.readPendingQuestions().some((q) => q.who === 'pedro' && /mensajes de texto hoy/.test(q.pregunta)));

  // (k-c) Peter pregunta algo que Daniela no sabe: "dame un segundo" y
  // guarda la pregunta para Tomás.
  // (v4.2: antes era el pronóstico del clima, pero el clima ahora es
  // pregunta fuera de tema y va a la redirección profesional; para probar
  // el flujo "dame un segundo" se usa una pregunta DE negocio que no sabe.)
  mark = sent.length;
  await incoming(PETER_OWNER, 'oye Daniela, ¿cuántos empleados tienen?');
  m = since(mark, PETER_OWNER);
  console.log('\n(k-c) Peter: pregunta que Daniela no sabe:');
  check('dice que lo revisa y responde en un momento', hasText(m, /Dame un segundo, lo reviso y te respondo en un momento\./));
  check('guarda la pregunta para Tomás', daniela.readPendingQuestions().some((q) => q.who === 'pedro' && /empleados/.test(q.pregunta)));

  // (k-d) Ricky pregunta algo concreto que Daniela no tiene: "dame un
  // segundo, te lo investigo".
  mark = sent.length;
  await incoming(RICKY_OWNER, '¿cuándo juega el América?');
  m = since(mark, RICKY_OWNER);
  console.log('\n(k-d) Ricky: "¿cuándo juega el América?":');
  check('dice que lo investiga', hasText(m, /Dame un segundo, te lo investigo y te doy una respuesta lo antes posible\./));
  check('guarda la pregunta para Tomás', daniela.readPendingQuestions().some((q) => q.who === 'ricky' && /cuándo juega el América/.test(q.pregunta)));

  // (k-e) Ricky charla casual ("qué calor hace"): NO se trata como
  // pregunta, sigue siendo charla cálida.
  mark = sent.length;
  await incoming(RICKY_OWNER, 'qué calor hace');
  m = since(mark, RICKY_OWNER);
  console.log('\n(k-e) Ricky: "qué calor hace" (charla casual):');
  check('NO dice que lo investiga', !hasText(m, /Dame un segundo, te lo investigo/));
  check('responde con calidez (menciona a Ricky)', hasText(m, /Ricky/));

  // (k-f) stripGreetingPrefix: quita el saludo y deja la pregunta.
  console.log('\n(k-f) stripGreetingPrefix:');
  check('"hola daniela oye hemos tenido mensajes hoy" -> "hemos tenido mensajes hoy"', daniela.stripGreetingPrefix('hola daniela oye hemos tenido mensajes hoy') === 'hemos tenido mensajes hoy');
  check('"hola daniela buenos dias como estas" -> ""', daniela.stripGreetingPrefix('hola daniela buenos dias como estas') === '');
  check('"que onda" -> ""', daniela.stripGreetingPrefix('que onda') === '');
  // (k-f2) Continuaciones de saludo (v4.1, caso real 2026-11-13): Peter
  // saludó "hola Daniela, ¿cómo estás? ¿qué onda? ¿qué haces?" y la
  // transcripción dejó "todo bien" al final; eso NO es una pregunta.
  check('"...que haces todo bien" -> ""', daniela.stripGreetingPrefix('hola daniela como estas que onda que haces todo bien') === '');
  check('"...que haces como te va" -> ""', daniela.stripGreetingPrefix('hola daniela como estas que onda que haces como te va') === '');
  check('"que onda que hay de nuevo" -> ""', daniela.stripGreetingPrefix('hola daniela que onda que hay de nuevo') === '');
  check('pregunta real tras el saludo NO se borra', daniela.stripGreetingPrefix('hola daniela como estas que onda que haces cual es el pronostico del clima') === 'cual es el pronostico del clima');

  // (k-g) Peter saluda con continuación ("todo bien"): Daniela saluda de
  // vuelta, NO dice "dame un segundo".
  mark = sent.length;
  await incoming(PETER_OWNER, 'hola Daniela, ¿cómo estás? ¿qué onda? ¿qué haces? ¿todo bien?');
  m = since(mark, PETER_OWNER);
  console.log('\n(k-g) Peter: saludo con "¿todo bien?" al final:');
  check('responde el saludo', hasText(m, /Hola Pedro, (buenos días|buenas tardes|buenas noches)\. Muy bien, gracias\. ¿En qué le puedo ayudar\?/));
  check('NO dice "dame un segundo"', !hasText(m, /Dame un segundo/));
  check('NO guarda pregunta pendiente', !daniela.readPendingQuestions().some((q) => q.who === 'pedro' && /todo bien/.test(q.pregunta)));

  // (k-h) Charla casual sobre Daniela (v4.4, caso real 2026-11-13):
  // Peter preguntó "¿qué haces?" en nota de voz y Daniela contestó
  // "dame un segundo" dos veces. La transcripción "Te pregunté que qué
  // haces" NO es pregunta de negocio: Daniela contesta con calidez y
  // NO guarda pregunta pendiente.
  console.log('\n(k-h) isSmallTalkAboutDaniela:');
  check('"te pregunte que que haces" -> true', daniela.isSmallTalkAboutDaniela('te pregunte que que haces') === true);
  check('"que haces" -> true', daniela.isSmallTalkAboutDaniela('que haces') === true);
  check('"hola daniela que haces" -> true', daniela.isSmallTalkAboutDaniela('hola daniela que haces') === true);
  check('"que haces hoy" -> true', daniela.isSmallTalkAboutDaniela('que haces hoy') === true);
  check('"que estas haciendo" -> true', daniela.isSmallTalkAboutDaniela('que estas haciendo') === true);
  check('"que haces para los hoteles" -> false', daniela.isSmallTalkAboutDaniela('que haces para los hoteles') === false);
  check('"cual es el precio" -> false', daniela.isSmallTalkAboutDaniela('cual es el precio') === false);

  mark = sent.length;
  await incoming(PETER_OWNER, 'Te pregunté que qué haces.');
  m = since(mark, PETER_OWNER);
  console.log('\n(k-h2) Peter: "Te pregunté que qué haces.":');
  check('NO dice "dame un segundo"', !hasText(m, /Dame un segundo/));
  check('contesta con calidez', hasText(m, /Estoy trabajando, Pedro\. Soy una inteligencia artificial y no descanso/));
  check('NO guarda pregunta pendiente', !daniela.readPendingQuestions().some((q) => q.who === 'pedro' && /que haces/.test(q.pregunta)));

  mark = sent.length;
  await incoming(PETER_OWNER, 'Hola Daniela, ¿qué haces?');
  m = since(mark, PETER_OWNER);
  console.log('\n(k-h3) Peter: "Hola Daniela, ¿qué haces?":');
  check('NO dice "dame un segundo"', !hasText(m, /Dame un segundo/));
  // stripGreetingPrefix lo deja en saludo puro, así que saluda de vuelta.
  check('saluda de vuelta', hasText(m, /Hola Pedro, (buenos días|buenas tardes|buenas noches)\. Muy bien, gracias\. ¿En qué le puedo ayudar\?/));
  check('NO guarda pregunta pendiente', !daniela.readPendingQuestions().some((q) => q.who === 'pedro' && /que haces/.test(q.pregunta)));

  // ---------- (l) Cerebro de IA (v4.0, orden de Peter 2026-11-13):
  // cuando no hay intención ni respuesta en la base, Daniela le pregunta
  // al cerebro (Groq) y contesta con fluidez. Las respuestas del cerebro
  // se revisan: si menciona "Pedro" a un extraño, si inventa un precio,
  // o si dice que no sabe, NO se mandan y se usa el flujo anterior.
  // En el entorno de pruebas no hay clave de Groq, así que se pone una
  // falsa y se simula fetch para controlar lo que responde el cerebro.
  console.log('\n(l) Cerebro de IA:');
  const realFetch = global.fetch;
  const realGroqKey = config.groqApiKey;
  config.groqApiKey = 'test-fake-key';
  function mockBrain(content) {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content } }] }),
    });
  }
  function mockBrainFail() {
    global.fetch = async () => { throw new Error('red caída'); };
  }
  function restoreBrain() {
    global.fetch = realFetch;
  }
  // Contacto normal en etapa main, sin nombre, para probar el cerebro.
  const BRAIN = '521111000200';
  function resetBrainState() {
    fs.writeFileSync(path.join(tmpDir, `${BRAIN}.json`), JSON.stringify({
      phone: BRAIN, stage: 'main', name: null, preferredName: null,
      formality: 'usted', handedOff: false,
    }, null, 2));
  }
  resetBrainState();

  // (l-a) El cerebro responde una pregunta sin intención ni base: Daniela
  // manda la respuesta del cerebro y NO avisa a Pedro.
  mockBrain('La inteligencia artificial es un programa que aprende de datos y ayuda a automatizar tareas. En Blü Bee la usamos para que Daniela atienda por WhatsApp.');
  resetBrainState();
  mark = sent.length;
  await incoming(BRAIN, '¿qué es la inteligencia artificial?');
  m = since(mark, BRAIN);
  console.log('  (l-a) Cerebro responde pregunta sin base:');
  check('manda la respuesta del cerebro', hasText(m, /La inteligencia artificial es un programa que aprende/));
  check('NO avisa a Pedro', notices(since(mark, PETER)).length === 0, JSON.stringify(notices(since(mark, PETER))));

  // (l-b) El cerebro menciona "Pedro" a un extraño: bloqueado, avisa a Pedro.
  mockBrain('Pedro es el dueño de Blü Bee y le puede atender personalmente.');
  resetBrainState();
  mark = sent.length;
  await incoming(BRAIN, '¿quién es el dueño de la empresa?');
  m = since(mark, BRAIN);
  console.log('  (l-b) Cerebro menciona "Pedro" a un extraño:');
  check('NO manda la respuesta del cerebro', !hasText(m, /Pedro es el dueño/));
  check('avisa a Pedro (flujo anterior)', notices(since(mark, PETER)).length > 0);

  // (l-c) El cerebro inventa un precio: bloqueado, avisa a Pedro.
  mockBrain('La instalación cuesta $50,000 pesos y tarda 2 semanas.');
  resetBrainState();
  mark = sent.length;
  await incoming(BRAIN, '¿cuánto tiempo llevan en el mercado?');
  m = since(mark, BRAIN);
  console.log('  (l-c) Cerebro inventa un precio:');
  check('NO manda el precio inventado', !hasText(m, /\$50,000/));
  check('avisa a Pedro (flujo anterior)', notices(since(mark, PETER)).length > 0);

  // (l-d) El cerebro dice que no sabe: no se manda, avisa a Pedro.
  mockBrain('No tengo esa información, lo siento.');
  resetBrainState();
  mark = sent.length;
  await incoming(BRAIN, '¿cuál es la capital de Australia?');
  m = since(mark, BRAIN);
  console.log('  (l-d) Cerebro dice que no sabe:');
  check('NO manda el "no sé" del cerebro', !hasText(m, /No tengo esa información/));
  check('avisa a Pedro (flujo anterior)', notices(since(mark, PETER)).length > 0);

  // (l-e) El cerebro falla (red caída): no se rompe nada, avisa a Pedro.
  mockBrainFail();
  resetBrainState();
  mark = sent.length;
  await incoming(BRAIN, '¿qué es un sensor?');
  m = since(mark, BRAIN);
  console.log('  (l-e) El cerebro falla:');
  check('no se cae (avisa a Pedro)', notices(since(mark, PETER)).length > 0);

  // (l-f) brainAnswerSafe directo: reglas de guardia.
  console.log('  (l-f) brainAnswerSafe directo:');
  const stBrain = { formality: 'usted', name: null, preferredName: null };
  check('respuesta normal pasa', daniela.brainAnswerSafe('Claro, con gusto le ayudo.', stBrain) === 'Claro, con gusto le ayudo.');
  check('"Pedro" bloqueado', daniela.brainAnswerSafe('Pedro te atiende.', stBrain) === null);
  check('precio inventado bloqueado', daniela.brainAnswerSafe('Cuesta $10,000 pesos.', stBrain) === null);
  check('"no sé" bloqueado', daniela.brainAnswerSafe('No sé la respuesta.', stBrain) === null);
  check('respuesta vacía bloqueada', daniela.brainAnswerSafe('', stBrain) === null);
  check('respuesta muy larga bloqueada', daniela.brainAnswerSafe('x'.repeat(901), stBrain) === null);

  // (l-g) El sistema del cerebro nunca revela a Pedro ni inventa clientes.
  console.log('  (l-g) brainSystemPrompt:');
  const sysPrompt = daniela.brainSystemPrompt({ formality: 'usted', name: 'Ana', preferredName: 'Ana' });
  check('dice quién es Daniela', /secretaria virtual de Blü Bee Technologies/.test(sysPrompt));
  check('prohíbe decir Pedro', /NUNCA digas el nombre "Pedro"/.test(sysPrompt));
  check('prohíbe inventar precios', /NUNCA inventes precios/.test(sysPrompt));
  check('prohíbe inventar clientes', /NO tiene clientes formales|son prospectos, NO clientes/.test(sysPrompt));
  check('incluye el nombre del contacto', /Ana/.test(sysPrompt));
  // (l-h) Modelo del cerebro (v4.8): Groq retiró llama-3.3-70b-versatile
  // el 16 ago 2026 y el cerebro daba 404 en vivo sin que nadie lo notara.
  // El modelo debe ser el reemplazo recomendado por Groq, no un llama-3.x.
  console.log('  (l-h) Modelo del cerebro:');
  check('modelo no es llama-3.x (familia retirada por Groq)', !/^llama-3\./.test(daniela.GROQ_CHAT_MODEL));
  check('modelo es openai/gpt-oss-120b (reemplazo recomendado por Groq)', daniela.GROQ_CHAT_MODEL === 'openai/gpt-oss-120b');
  restoreBrain();
  config.groqApiKey = realGroqKey;
  // 2026-11-13): profesionalizar — el cerebro ya NO se salta para Peter
  // ni Ricky. Charla y preguntas generales las contesta el cerebro; solo
  // los datos concretos que no sabe van a "dame un segundo" + pendiente.
  // Caso real: Peter preguntó "¿qué haces?" y Daniela dijo "dame un
  // segundo" porque la ruta del dueño nunca llegaba al cerebro.
  console.log('\n(m) Cerebro para Peter y Ricky (v4.5):');
  // (m-a) El sistema del cerebro ya distingue las tres preguntas.
  const sysPeter = daniela.brainSystemPrompt({ phone: PETER_OWNER, formality: 'tu', name: 'Pedro', preferredName: 'Pedro' });
  check('regla de identidad: 24 horas, 365 días', /24 horas.*365 días/.test(sysPeter));
  check('distingue las tres preguntas', /¿qué haces\?.*¿qué hace la empresa\?.*¿qué haces tú en la empresa\?/s.test(sysPeter));
  check('a Pedro sí se le puede llamar Pedro', /SALVO que la persona con la que hablas sea Pedro/.test(sysPeter));
  check('dato concreto que no sabe -> "dame un segundo"', /RFC, dirección, número de empleados/.test(sysPeter));
  // (m-b) brainAnswerSafe: "Pedro" permitido para Pedro, bloqueado para extraños.
  const stPeter = { phone: PETER_OWNER, formality: 'tu', name: 'Pedro', preferredName: 'Pedro' };
  const stStranger = { phone: BRAIN, formality: 'usted', name: null, preferredName: null };
  check('"Pedro" permitido para Pedro', daniela.brainAnswerSafe('Hola Pedro, estoy trabajando.', stPeter) === 'Hola Pedro, estoy trabajando.');
  check('"Pedro" bloqueado para un extraño', daniela.brainAnswerSafe('Pedro te atiende.', stStranger) === null);
  // (m-c) Peter, charla sin base ("¿qué opinas de la inteligencia
  // artificial?"): el cerebro contesta, NO "dame un segundo", NO pendiente.
  config.groqApiKey = 'test-fake-key';
  mockBrain('La inteligencia artificial es un programa que aprende de datos y ayuda a automatizar tareas. En Blü Bee la usamos para que Daniela atienda por WhatsApp.');
  mark = sent.length;
  await incoming(PETER_OWNER, '¿qué opinas de la inteligencia artificial?');
  m = since(mark, PETER_OWNER);
  console.log('  (m-c) Peter: charla vía cerebro:');
  check('manda la respuesta del cerebro', hasText(m, /La inteligencia artificial es un programa que aprende/));
  check('NO dice "dame un segundo"', !hasText(m, /Dame un segundo/));
  check('NO guarda pregunta pendiente', !daniela.readPendingQuestions().some((q) => q.who === 'pedro' && /inteligencia/.test(q.pregunta)));
  // (m-d) Peter, dato concreto ("¿cuál es el RFC de la empresa?"): el
  // cerebro dice "dame un segundo" → se guarda pendiente y se manda ese texto.
  mockBrain('Dame un segundo, te lo investigo y te doy una respuesta lo antes posible.');
  mark = sent.length;
  await incoming(PETER_OWNER, '¿cuál es el RFC de la empresa?');
  m = since(mark, PETER_OWNER);
  console.log('  (m-d) Peter: dato concreto vía cerebro:');
  check('dice "dame un segundo"', hasText(m, /Dame un segundo/));
  check('guarda pregunta pendiente', daniela.readPendingQuestions().some((q) => q.who === 'pedro' && /RFC/.test(q.pregunta)));
  // (m-e) Ricky, charla ("¿qué opinas de la inteligencia artificial?"):
  // el cerebro contesta, NO "dame un segundo", NO pendiente.
  mockBrain('La inteligencia artificial es un programa que aprende de datos y ayuda a automatizar tareas. En Blü Bee la usamos para que Daniela atienda por WhatsApp.');
  mark = sent.length;
  await incoming(RICKY_OWNER, '¿qué opinas de la inteligencia artificial?');
  m = since(mark, RICKY_OWNER);
  console.log('  (m-e) Ricky: charla vía cerebro:');
  check('manda la respuesta del cerebro', hasText(m, /La inteligencia artificial es un programa que aprende/));
  check('NO dice "dame un segundo"', !hasText(m, /Dame un segundo/));
  check('NO guarda pregunta pendiente', !daniela.readPendingQuestions().some((q) => q.who === 'ricky' && /inteligencia/.test(q.pregunta)));
  restoreBrain();
  config.groqApiKey = realGroqKey;

  // ---------- (n) Transcripción contaminada (v4.6, caso real de Peter
  // 2026-11-13 12:03): su nota de voz "Daniela, ¿qué haces?" llegó
  // transcrita mezclada con audio de fondo (la tele): "Se presume eran
  // agentes... ¿Qué haces, Daniela? ...asesinados a mano." Daniela dijo
  // "dame un segundo" porque ningún patrón veía la pregunta dentro del
  // texto basura. Ahora isSmallTalkAboutDaniela busca la frase en
  // cualquier parte del mensaje. SIN cerebro simulado (fetch restaurado,
  // sin clave): la charla debe contestarse aunque el cerebro falle.
  console.log('\n(n) Transcripción contaminada (v4.6):');
  check('texto con tele: "Se presume eran agentes... ¿Qué haces, Daniela? ...asesinados a mano." es charla', daniela.isSmallTalkAboutDaniela('se presume eran agentes que haces daniela asesinados a mano'));
  check('"¿qué haces tú en la empresa?" NO es charla (es su trabajo)', !daniela.isSmallTalkAboutDaniela('que haces tu en la empresa'));
  check('"¿qué haces para los hoteles?" sigue sin ser charla', !daniela.isSmallTalkAboutDaniela('que haces para los hoteles'));
  mark = sent.length;
  await incoming(PETER_OWNER, 'Se presume eran agentes... ¿Qué haces, Daniela? ...asesinados a mano.');
  m = since(mark, PETER_OWNER);
  console.log('  (n-a) Peter: nota de voz transcrita con tele:');
  check('contesta en primera persona', hasText(m, /Estoy trabajando, Pedro\. Soy una inteligencia artificial y no descanso/));
  check('NO dice "dame un segundo"', !hasText(m, /Dame un segundo/));
  check('NO guarda pregunta pendiente', !daniela.readPendingQuestions().some((q) => q.who === 'pedro' && /asesinados/.test(q.pregunta)));

  // ---------- (o) Redirección profesional para preguntas fuera de tema (v4.2,
  // orden de Peter 2026-11-13): fútbol, viajes, coqueteo, chistes... →
  // respuesta corta con el alcance, NO "dame un segundo" ni cerebro.
  // Caso real: Peter preguntó "¿Cuándo juega el Real Madrid?" (10:22) y
  // Daniela dijo "dame un segundo".
  console.log('\n(o) Redirección profesional (v4.2):');
  // (o-a) isOffTopicQuestion directo.
  check('"¿Sabés de fútbol?" es fuera de tema', daniela.isOffTopicQuestion('sabes de futbol'));
  check('"¿Cuándo juega el Real Madrid?" es fuera de tema', daniela.isOffTopicQuestion('cuando juega el real madrid'));
  check('"¿a dónde puedo viajar?" es fuera de tema', daniela.isOffTopicQuestion('a donde puedo viajar'));
  check('"¿qué sillón compro?" es fuera de tema', daniela.isOffTopicQuestion('que sillon compro'));
  check('"¿estás guapa?" es fuera de tema', daniela.isOffTopicQuestion('estas guapa'));
  check('"¿qué hay de nuevo?" NO es fuera de tema (saludo)', !daniela.isOffTopicQuestion('que hay de nuevo'));
  check('"¿tienen cobertura en América Latina?" NO es fuera de tema', !daniela.isOffTopicQuestion('tienen cobertura en america latina'));
  check('"¿funciona en mi celular?" NO es fuera de tema', !daniela.isOffTopicQuestion('funciona en mi celular'));
  check('"¿a qué hora cierran?" NO es fuera de tema', !daniela.isOffTopicQuestion('a que hora cierran'));
  check('"¿tienen soluciones para restaurantes?" NO es fuera de tema', !daniela.isOffTopicQuestion('tienen soluciones para restaurantes'));
  check('"¿quién ganó el América?" es fuera de tema', daniela.isOffTopicQuestion('quien gano el america'));
  // (o-b) Extraño pregunta de fútbol: redirección, NO "dame un segundo".
  mark = sent.length;
  await incoming(BRAIN, '¿Cuándo juega el Real Madrid?');
  m = since(mark, BRAIN);
  console.log('  (o-b) Extraño: "¿Cuándo juega el Real Madrid?":');
  check('responde la redirección profesional', hasText(m, /Soy Daniela, la asistente virtual de Blü Bee Technologies/));
  check('NO dice "dame un segundo"', !hasText(m, /Dame un segundo/));
  check('NO guarda pregunta pendiente', !daniela.readPendingQuestions().some((q) => /Real Madrid/.test(q.pregunta)));
  // (o-c) Peter pregunta de fútbol: TAMBIÉN redirección (así prueba al público).
  mark = sent.length;
  await incoming(PETER_OWNER, '¿Sabés de fútbol?');
  m = since(mark, PETER_OWNER);
  console.log('  (o-c) Peter: "¿Sabés de fútbol?":');
  check('responde la redirección profesional', hasText(m, /Soy Daniela, la asistente virtual de Blü Bee Technologies/));
  check('NO dice "dame un segundo"', !hasText(m, /Dame un segundo/));
  // (o-d) Peter saluda + pregunta de fútbol: redirección, no "dame un segundo".
  mark = sent.length;
  await incoming(PETER_OWNER, 'hola Daniela, ¿sabes de fútbol?');
  m = since(mark, PETER_OWNER);
  console.log('  (o-d) Peter: "hola Daniela, ¿sabes de fútbol?":');
  check('responde la redirección profesional', hasText(m, /Soy Daniela, la asistente virtual de Blü Bee Technologies/));
  check('NO dice "dame un segundo"', !hasText(m, /Dame un segundo/));
  // (o-e) Ricky pregunta de fútbol: EXENTO (VIP: con él se platica de todo).
  mark = sent.length;
  await incoming(RICKY_OWNER, '¿Cuándo juega el América?');
  m = since(mark, RICKY_OWNER);
  console.log('  (o-e) Ricky: "¿Cuándo juega el América?" (VIP exento):');
  check('NO recibe la redirección profesional', !hasText(m, /Soy Daniela, la asistente virtual de Blü Bee Technologies/));
  // (o-f) Pregunta de negocio de Peter: sigue yendo a "dame un segundo".
  mark = sent.length;
  await incoming(PETER_OWNER, '¿cuál es el RFC de la empresa?');
  m = since(mark, PETER_OWNER);
  console.log('  (o-f) Peter: pregunta de negocio que no sabe:');
  check('dice "dame un segundo"', hasText(m, /Dame un segundo, lo reviso/));
  // (o-g) El cerebro también lleva la regla de redirección.
  check('brainSystemPrompt incluye la redirección fuera de tema', /Para otros temas te recomiendo consultar otras herramientas/.test(sysPrompt));
  check('brainSystemPrompt incluye el portafolio amplio', /chatbots y asistentes virtuales/.test(sysPrompt));

  // ---------- (p) Reunión virtual (v4.3, orden de Peter 2026-11-13):
  // SOLO virtuales (Meet primero, Zoom alternativo). Presencial NO se
  // ofrece: se acuerda después de la virtual, o Peter lo atiende directo.
  console.log('\n(p) Reunión virtual (v4.3):');
  // (p-a) Helpers directos.
  check('wantsInPerson("reunión presencial")', daniela.wantsInPerson('quiero una reunion presencial', 'quiero una reunion presencial'));
  check('wantsInPerson("en persona")', daniela.wantsInPerson('mejor en persona', 'mejor en persona'));
  check('wantsInPerson("quiero una reunión") es falso', !daniela.wantsInPerson('quiero una reunion', 'quiero una reunion'));
  check('parseMeetingPlatform("por Zoom") = zoom', daniela.parseMeetingPlatform('por zoom') === 'zoom');
  check('parseMeetingPlatform("por Meet") = meet', daniela.parseMeetingPlatform('por meet') === 'meet');
  check('parseMeetingPlatform("la que sea") = null', daniela.parseMeetingPlatform('la que sea') === null);
  // (p-b) Contacto nuevo C: saludo y datos, luego pide reunión virtual.
  const MC = '5215500000003';
  await incoming(MC, 'Hola');
  mark = sent.length;
  await incoming(MC, 'Soy Carlos Ruiz de Grupo Andares');
  m = since(mark, MC);
  st = readState(MC);
  console.log('  (p-b) Contacto nuevo C, nombre+empresa:');
  check('nombre capturado', st && st.name === 'Carlos Ruiz', `name=${st && st.name}`);
  check('empresa capturada', st && st.company === 'Grupo Andares', `company=${st && st.company}`);
  mark = sent.length;
  await incoming(MC, 'de usted');
  m = since(mark, MC);
  mark = sent.length;
  await incoming(MC, 'carlos@andares.com, WhatsApp al mismo número');
  m = since(mark, MC);
  st = readState(MC);
  check('etapa = main', st && st.stage === 'main', `stage=${st && st.stage}`);
  mark = sent.length;
  await incoming(MC, 'Quiero agendar una reunión');
  m = since(mark, MC);
  st = readState(MC);
  console.log('  (p-b) C: "Quiero agendar una reunión":');
  check('pregunta Meet o Zoom', hasText(m, /¿Prefiere por Google Meet o por Zoom\?/));
  check('dice que son virtuales', hasText(m, /Las reuniones son virtuales/));
  check('etapa = meeting_platform', st && st.stage === 'meeting_platform', `stage=${st && st.stage}`);
  // (p-c) Elige Zoom → pide día/hora → lead guardado, aviso a Peter.
  mark = sent.length;
  await incoming(MC, 'Por Zoom');
  m = since(mark, MC);
  st = readState(MC);
  check('pregunta día y hora', hasText(m, /¿Qué día y hora le conviene\?/));
  check('confirma Zoom', hasText(m, /por Zoom/));
  check('etapa = meeting_when', st && st.stage === 'meeting_when', `stage=${st && st.stage}`);
  mark = sent.length;
  await incoming(MC, 'mañana a las 10');
  m = since(mark, MC);
  st = readState(MC);
  const leadMeeting = readLeads().find((l) => l.tipo === 'reunion_virtual' && l.nombre === 'Carlos Ruiz');
  console.log('  (p-c) C: "mañana a las 10" (Zoom):');
  check('lead reunion_virtual guardado', !!leadMeeting && leadMeeting.plataforma === 'zoom' && /mañana/i.test(leadMeeting.diaHora || ''), JSON.stringify(leadMeeting));
  check('etapa = closed', st && st.stage === 'closed', `stage=${st && st.stage}`);
  check('confirmación enviada', hasText(m, /Ya le pasé sus datos al área correspondiente, le confirman la reunión/));
  const noteMeeting = notices(since(mark, PETER));
  check('notifyPeter: aviso a Pedro', noteMeeting.length > 0);
  check('aviso dice Zoom y día/hora', noteMeeting.length > 0 && /Zoom/.test(noteMeeting[0]) && /mañana a las 10/.test(noteMeeting[0]));
  // (p-d) Sin preferencia de plataforma → Meet por defecto.
  const MD = '5215500000004';
  await incoming(MD, 'Hola');
  await incoming(MD, 'Soy Laura Méndez de Plaza Querétaro');
  await incoming(MD, 'de tú');
  await incoming(MD, 'laura@plaza.com, WhatsApp al mismo número');
  mark = sent.length;
  await incoming(MD, 'Quiero una videollamada');
  m = since(mark, MD);
  st = readState(MD);
  console.log('  (p-d) D: "Quiero una videollamada":');
  check('pregunta Meet o Zoom', hasText(m, /¿Prefiere por Google Meet o por Zoom\?/));
  mark = sent.length;
  await incoming(MD, 'la que sea');
  m = since(mark, MD);
  st = readState(MD);
  check('Meet por defecto', hasText(m, /por Google Meet/));
  check('etapa = meeting_when', st && st.stage === 'meeting_when', `stage=${st && st.stage}`);
  mark = sent.length;
  await incoming(MD, 'el viernes a las 3');
  m = since(mark, MD);
  const leadMeet = readLeads().find((l) => l.tipo === 'reunion_virtual' && l.nombre === 'Laura Méndez');
  check('lead guardado con plataforma meet', !!leadMeet && leadMeet.plataforma === 'meet', JSON.stringify(leadMeet));
  // (p-e) Presencial: escalación a Peter, NO se ofrece.
  const ME = '5215500000005';
  await incoming(ME, 'Hola');
  await incoming(ME, 'Soy Jorge Salinas de Constructora del Bajío');
  await incoming(ME, 'de usted');
  await incoming(ME, 'jorge@constructora.com, WhatsApp al mismo número');
  mark = sent.length;
  await incoming(ME, 'Quiero una reunión presencial');
  m = since(mark, ME);
  st = readState(ME);
  console.log('  (p-e) E: "Quiero una reunión presencial":');
  check('NO ofrece presencial, pasa a la persona indicada', hasText(m, /Con gusto le paso sus datos a la persona indicada para coordinar una reunión presencial/));
  check('NO pregunta Meet o Zoom', !hasText(m, /Google Meet o por Zoom/));
  check('etapa = inperson_when', st && st.stage === 'inperson_when', `stage=${st && st.stage}`);
  mark = sent.length;
  await incoming(ME, 'el lunes a las 9');
  m = since(mark, ME);
  st = readState(ME);
  const leadInperson = readLeads().find((l) => l.tipo === 'reunion_presencial_solicitada' && l.nombre === 'Jorge Salinas');
  console.log('  (p-e) E: "el lunes a las 9":');
  check('lead reunion_presencial_solicitada guardado', !!leadInperson && /lunes/i.test(leadInperson.diaHora || ''), JSON.stringify(leadInperson));
  check('etapa = closed', st && st.stage === 'closed', `stage=${st && st.stage}`);
  const noteInperson = notices(since(mark, PETER));
  check('aviso a Pedro dice PRESENCIAL', noteInperson.length > 0 && /PRESENCIAL/.test(noteInperson[0]));
  // (p-f) Presencial en la etapa de plataforma: también escala.
  const MF = '5215500000006';
  await incoming(MF, 'Hola');
  await incoming(MF, 'Soy Ana Torres de Corporativo Andares');
  await incoming(MF, 'de tú');
  await incoming(MF, 'ana@andares.com, WhatsApp al mismo número');
  await incoming(MF, 'Quiero agendar una cita');
  mark = sent.length;
  await incoming(MF, 'presencial');
  m = since(mark, MF);
  st = readState(MF);
  console.log('  (p-f) F: responde "presencial" a Meet/Zoom:');
  check('escala a la persona indicada', hasText(m, /Con gusto le paso sus datos a la persona indicada para coordinar una reunión presencial/));
  check('etapa = inperson_when', st && st.stage === 'inperson_when', `stage=${st && st.stage}`);
  // (p-g) confirmMeetingLead: confirma el lead de C, segunda vez null.
  const confirmed = daniela.confirmMeetingLead(MC);
  check('confirmMeetingLead confirma el lead de C', !!confirmed && confirmed.confirmada === true, JSON.stringify(confirmed));
  check('segunda confirmación = null', daniela.confirmMeetingLead(MC) === null);
  check('sin reunión pendiente = null', daniela.confirmMeetingLead('521999999999') === null);
  // (p-h) Regresión: "quiero una demo" sigue siendo demo, no reunión.
  mark = sent.length;
  await incoming(B, 'Quiero una demo');
  m = since(mark, B);
  st = readState(B);
  console.log('  (p-h) Regresión demo:');
  check('demo: pide día/hora de demostración', hasText(m, /¿Qué día y hora te conviene\?/) && st && st.stage === 'demo_when', `stage=${st && st.stage}`);
  check('demo: NO menciona reunión virtual', !hasText(m, /reuniones son virtuales|Google Meet o por Zoom/));

  // ---------- (q) Nota de voz con otra voz metida (v4.7, orden de Peter
  // 2026-11-13): si se mete la tele u otra persona y el texto no queda
  // claro, Daniela pide que se lo repitan, no dice "dame un segundo" ni
  // guarda pregunta pendiente. La transcripción se simula con fetch
  // (Groq Whisper) y downloadMedia escribe un audio falso.
  console.log('\n(q) Voz con ruido de fondo (v4.7):');
  const realFetchQ = global.fetch;
  const realGroqKeyQ = config.groqApiKey;
  const realDownloadQ = wa.downloadMedia;
  config.groqApiKey = 'test-fake-key';
  wa.downloadMedia = async (id, dest) => { fs.writeFileSync(dest, Buffer.from('audio-falso')); };
  async function incomingVoice(phone, transcribed) {
    global.fetch = async () => ({ ok: true, json: async () => ({ text: transcribed }) });
    await daniela.handleMessage({ from: phone, type: 'audio', audio: { id: 'voz-prueba' } });
  }
  // (q-a) Voz contaminada sin pregunta reconocible: pide repetir.
  check('texto con tele y sin pregunta clara es confuso', daniela.looksGarbledTranscription('Se presume eran agentes... asesinados a mano... y el clima estará nublado mañana.', 'se presume eran agentes asesinados a mano y el clima estara nublado manana'));
  check('texto con "¿qué haces?" dentro NO es confuso', !daniela.looksGarbledTranscription('Se presume eran agentes... ¿Qué haces, Daniela? ...asesinados a mano.', 'se presume eran agentes que haces daniela asesinados a mano'));
  mark = sent.length;
  await incomingVoice(PETER_OWNER, 'Se presume eran agentes... asesinados a mano... y el clima estará nublado mañana.');
  m = since(mark, PETER_OWNER);
  console.log('  (q-a) Peter: voz con tele, sin pregunta clara:');
  check('pide que se lo repita', hasText(m, /no le escuché bien.*repetir/i));
  check('NO dice "dame un segundo"', !hasText(m, /Dame un segundo/));
  check('NO guarda pregunta pendiente', !daniela.readPendingQuestions().some((q) => q.who === 'pedro' && /asesinados/.test(q.pregunta)));
  // (q-b) Voz contaminada CON "¿qué haces?" dentro: se contesta, no se pide repetir.
  mark = sent.length;
  await incomingVoice(PETER_OWNER, 'Se presume eran agentes... ¿Qué haces, Daniela? ...asesinados a mano.');
  m = since(mark, PETER_OWNER);
  console.log('  (q-b) Peter: voz con tele pero con "¿qué haces?":');
  check('contesta en primera persona', hasText(m, /Estoy trabajando, Pedro\. Soy una inteligencia artificial/));
  check('NO pide repetir', !hasText(m, /repetir/));
  // (q-c) Voz clara (sin "..."): flujo normal, no pide repetir.
  mark = sent.length;
  await incomingVoice(PETER_OWNER, '¿Cuál es el RFC de la empresa?');
  m = since(mark, PETER_OWNER);
  console.log('  (q-c) Peter: voz clara, pregunta de negocio:');
  check('NO pide repetir', !hasText(m, /repetir/));
  check('dice "dame un segundo" (se investiga)', hasText(m, /Dame un segundo/));
  global.fetch = realFetchQ;
  config.groqApiKey = realGroqKeyQ;
  wa.downloadMedia = realDownloadQ;

  // (r) Saludo por hora y "¿qué hora es?" (v4.9, caso real 2026-11-13):
  // Peter escribió "Buenas tardes" a las 5:43 p. m. y Daniela contestó
  // "buenos días" dos veces; luego "Que hora es?" y le llegó la
  // presentación institucional.
  console.log('\n(r) Saludo por hora del día y "¿qué hora es?" (v4.9):');
  // (r-a) greetingByTime devuelve un saludo válido según la hora.
  const g = daniela.greetingByTime();
  check('greetingByTime es un saludo válido', /^(buenos días|buenas tardes|buenas noches)$/.test(g), `greeting=${g}`);
  // (r-b) isTimeQuestion distingue la hora actual de la hora de la demo.
  check('"que hora es" -> true', daniela.isTimeQuestion('que hora es') === true);
  check('"que horas son" -> true', daniela.isTimeQuestion('que horas son') === true);
  check('"a que hora es la demo" -> false', daniela.isTimeQuestion('a que hora es la demo') === false);
  check('"a que hora cierran" -> false', daniela.isTimeQuestion('a que hora cierran') === false);
  check('"que hora es la demo" -> false', daniela.isTimeQuestion('que hora es la demo') === false);
  // (r-c) timeReply contesta la hora en Ciudad de México.
  const tr = daniela.timeReply();
  check('timeReply dice la hora de CDMX', /(Es la|Son las) \d{1,2}:\d{2}/.test(tr) && /hora de la Ciudad de México/.test(tr), `reply=${tr}`);
  // (r-d) ownerGreetingReply saluda con la hora del día correcta.
  const og = daniela.ownerGreetingReply();
  check('ownerGreetingReply usa la hora del día', /Hola Pedro, (buenos días|buenas tardes|buenas noches)\. Muy bien, gracias/.test(og), `greeting=${og}`);
  // (r-e) Peter pregunta "Que hora es?" en vivo: Daniela contesta la hora,
  // NO la presentación institucional.
  mark = sent.length;
  await incoming(PETER_OWNER, 'Que hora es?');
  m = since(mark, PETER_OWNER);
  console.log('  (r-e) Peter: "Que hora es?":');
  check('contesta la hora', hasText(m, /(Es la|Son las) \d{1,2}:\d{2}/));
  check('NO contesta con la presentación institucional', !hasText(m, /Soy Daniela, la asistente virtual de Blü Bee Technologies/));
  check('NO dice "dame un segundo"', !hasText(m, /Dame un segundo/));

  // ---------- Sin botones en todo el flujo
  const buttons = sent.filter((s) => s.kind === 'buttons');
  console.log('\n(verificación global):');
  check('menú de 3 botones NUNCA enviado (0 sendButtons)', buttons.length === 0, `${buttons.length} botones enviados`);

  console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
  console.log('Estado temporal en:', tmpDir);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ERROR en las pruebas:', e);
  process.exit(2);
});
