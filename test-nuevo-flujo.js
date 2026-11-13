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
  check('responde el saludo', hasText(m, /Hola Pedro, buenos días\. Muy bien, gracias\. ¿En qué le puedo ayudar\?/));
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
  mark = sent.length;
  await incoming(PETER_OWNER, 'oye Daniela, ¿cuál es el pronóstico del clima para mañana en Querétaro?');
  m = since(mark, PETER_OWNER);
  console.log('\n(k-c) Peter: pregunta que Daniela no sabe:');
  check('dice que lo revisa y responde en un momento', hasText(m, /Dame un segundo, lo reviso y te respondo en un momento\./));
  check('guarda la pregunta para Tomás', daniela.readPendingQuestions().some((q) => q.who === 'pedro' && /pronóstico del clima/.test(q.pregunta)));

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
