// Pruebas de "Daniela inteligente" (v3, 2026-11-11): base de conocimiento,
// sector, flujo ágil intent-first, contactos personales / temas que no son
// Blü Bee, notas de voz (Whisper: Groq gratis, OpenAI de respaldo, v3.5),
// video de despedida personalizado y trato VIP para Ricky (v3.4).
// Uso: node test-daniela-inteligente.js
// No toca el estado real: usa un STATE_DIR temporal y un stub de whatsapp.js
// (nada sale a la API de Meta; notifyPeter se registra en el log, no se envía).
// Los videos de despedida de prueba son archivos vacíos en media/ que se
// crean y se borran dentro de la prueba (ver createdVideos).

const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daniela-inteligente-'));
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
const conocimiento = require('./conocimiento');
const config = require('./config');
const PETER = config.peterWhatsApp; // 524421447169

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
function readFarewellRequest(phone) {
  const f = path.join(tmpDir, `despedida-pendiente-${phone}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
function readUnanswered() {
  const f = path.join(tmpDir, 'preguntas-sin-respuesta.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
}
// Mensajes enviados a un número desde el marcador `mark` (índice en `sent`).
function since(mark, phone) {
  return sent.slice(mark).filter((s) => s.to === phone);
}
function texts(msgs) { return msgs.filter((m) => m.kind === 'text').map((m) => m.body); }
function hasText(msgs, re) { return texts(msgs).some((b) => re.test(b)); }
function hasKind(msgs, kind) { return msgs.some((m) => m.kind === kind); }
function videoFiles(msgs) { return msgs.filter((m) => m.kind === 'video').map((m) => m.body); }
// Avisos a Pedro (notifyPeter) llegan como texto a PETER con el prefijo 🔔.
function notices(msgs) { return texts(msgs).filter((b) => b.startsWith('🔔')); }
function replies(msgs) { return texts(msgs).filter((b) => !b.startsWith('🔔')); }

async function incoming(phone, text) {
  await daniela.handleMessage({ from: phone, type: 'text', text: { body: text } });
}
async function incomingAudio(phone) {
  await daniela.handleMessage({ from: phone, type: 'audio', audio: { id: 'test-audio-123' } });
}

// Lleva a un contacto hasta la etapa 'main' con datos completos.
async function driveToMain(phone, intro) {
  await incoming(phone, 'Hola');
  await incoming(phone, intro);
  await incoming(phone, 'de usted');
  await incoming(phone, 'contacto@empresa.com, WhatsApp al mismo número');
}

// Videos de despedida de prueba (archivos vacíos en media/, se borran al final).
const createdVideos = [];
function makeFarewellVideoFile(file) {
  const full = path.join(__dirname, 'media', file);
  fs.mkdirSync(path.join(__dirname, 'media'), { recursive: true });
  fs.writeFileSync(full, 'video de prueba');
  createdVideos.push(full);
  return full;
}
function makeFarewellVideo(name) {
  return makeFarewellVideoFile(daniela.farewellVideoFileName(name));
}
function cleanupVideos() {
  for (const f of createdVideos) {
    try { fs.unlinkSync(f); } catch { /* ya borrado */ }
  }
}

(async () => {
  console.log('STATE_DIR temporal:', tmpDir);
  try {
    // ---------- (a) Base de conocimiento: preguntas de tecnología/IoT/servicios
    const A = '521111000001';
    await driveToMain(A, 'Soy María González de Hotel Casa Blanca');
    let st = readState(A);
    console.log('\n(a) Base de conocimiento:');
    console.log('    (precondición: etapa =', st && st.stage, '| nombre =', st && st.name, ')');

    let mark = sent.length;
    await incoming(A, '¿qué es un beacon?');
    let m = since(mark, A);
    console.log('    "¿qué es un beacon?":');
    check('responde como experta (BlüSignal/K11)', hasText(m, /BlüSignal \(K11\)/));
    check('incluye la altura 1.5 a 2.2 metros', hasText(m, /1\.5 a 2\.2 metros/));
    check('NO es la respuesta genérica de siempre', !hasText(m, /soluciones basadas en Internet de las Cosas, diseñadas para cada caso en específico\. Cada empresa, hotel, hospital, viñedo o ciudad tiene necesidades distintas/));

    mark = sent.length;
    await incoming(A, '¿qué es LoRaWAN y qué miden los sensores?');
    m = since(mark, A);
    console.log('    "¿qué es LoRaWAN?":');
    check('explica LoRaWAN (largo alcance)', hasText(m, /largo alcance/));
    check('menciona temperatura, humedad, CO2', hasText(m, /temperatura, humedad, CO2/));
    check('aclara que NO se usa para posicionar', hasText(m, /no se usa para saber dónde está alguien/));

    mark = sent.length;
    await incoming(A, '¿qué precisión tiene el posicionamiento?');
    m = since(mark, A);
    console.log('    "¿qué precisión tiene?":');
    check('responde 1 a 5 metros', hasText(m, /1 a 5 metros/));

    mark = sent.length;
    await incoming(A, '¿qué es una PoC?');
    m = since(mark, A);
    console.log('    "¿qué es una PoC?":');
    check('explica la prueba de concepto', hasText(m, /prueba de concepto/));
    check('dice que la primera es gratis', hasText(m, /primera prueba es gratis/));

    mark = sent.length;
    await incoming(A, 'se me pierden los equipos en el hospital');
    m = since(mark, A);
    console.log('    "se me pierden los equipos":');
    check('responde rastreo de activos', hasText(m, /rastreo de activos/));
    check('pregunta de exploración (qué equipos)', hasText(m, /¿Qué tipo de equipos se les pierden más\?/));

    mark = sent.length;
    await incoming(A, '¿qué es el posicionamiento en interiores?');
    m = since(mark, A);
    console.log('    "¿qué es el posicionamiento en interiores?":');
    check('explica el posicionamiento (WiFi + beacons)', hasText(m, /WiFi y con beacons Bluetooth/));

    // Pregunta que NO sabe: se registra para aprender (sin datos personales).
    // (Contacto nuevo, en 'main', para que no se confunda con la oferta del video.)
    const A2 = '521111000021';
    await driveToMain(A2, 'Soy Luis Torres de Bodega San Juan');
    mark = sent.length;
    await incoming(A2, '¿tienen beacons de color rosa con brillitos?');
    m = since(mark, A2);
    const unanswered = readUnanswered();
    console.log('    "¿tienen beacons de color rosa con brillitos?" (no la sabe):');
    check('NO inventa una respuesta (avisa a Pedro, sin contestar)', replies(m).length === 0 && notices(since(mark, PETER)).length > 0, `respuestas=${JSON.stringify(replies(m))}`);
    check('la pregunta queda en el log de aprendizaje', unanswered.some((u) => /color rosa con brillitos/.test(u.pregunta)), JSON.stringify(unanswered.slice(-2)));
    check('el log NO guarda teléfono ni nombre', !unanswered.some((u) => u.telefono || u.nombre || u.phone));

    // ---------- (b) Detección de sector y respuestas adaptadas
    console.log('\n(b) Sector:');
    mark = sent.length;
    await incoming(A, 'tengo un viñedo en Querétaro');
    m = since(mark, A);
    console.log('    "tengo un viñedo":');
    check('responde del viñedo (historia del visitante)', hasText(m, /En un viñedo, creamos una solución para que cada visitante viva su propia historia/));
    check('menciona LoRaWAN / humedad de la tierra', hasText(m, /humedad de la tierra/));
    st = readState(A);
    check('sector guardado = vinedo', st && st.sector === 'vinedo', `sector=${st && st.sector}`);

    mark = sent.length;
    await incoming(A, '¿qué hacen para hospitales?');
    m = since(mark, A);
    console.log('    "¿qué hacen para hospitales?":');
    check('responde del hospital (en segundos, no en minutos)', hasText(m, /En un hospital, creamos una solución para saber dónde está lo importante, en segundos, no en minutos/));
    check('menciona el botón de pánico', hasText(m, /botón de pánico/));

    const B = '521111000002';
    await driveToMain(B, 'Soy Jorge Díaz de Plaza Central');
    mark = sent.length;
    await incoming(B, '¿qué opinas del IoT para hoteles?');
    m = since(mark, B);
    console.log('    "¿qué opinas del IoT para hoteles?" (guardia de negocio):');
    check('responde como negocio (info del sector hotel)', hasText(m, /En un hotel, creamos una solución/));
    check('NO se trata como pregunta general', !hasText(m, /En Blü Bee le puedo ayudar con información sobre nuestras soluciones, agendar/));

    // ---------- (c) Flujo ágil intent-first: la necesidad manda
    const C = '521111000003';
    mark = sent.length;
    await incoming(C, 'hola Daniela, quiero que me ayudes en esto');
    m = since(mark, C);
    st = readState(C);
    console.log('\n(c) Intent-first: "hola Daniela, quiero que me ayudes en esto" (primer mensaje):');
    check('manda el video de bienvenida', hasKind(m, 'video'));
    check('reconoce la necesidad y pide los datos en el MISMO mensaje', hasText(m, /Claro, con gusto te ayudo con eso\. Soy Daniela, la asistente virtual de Blü Bee\. Para atenderte mejor, ¿me compartes tu nombre y de qué empresa nos escribes\? Si es un tema personal, también me lo puedes decir\./));
    check('NO es un interrogatorio fijo (sin "¿Cómo prefiere que le llame?")', !hasText(m, /¿Cómo prefiere que le llame\?/));
    check('etapa = awaiting_name_company', st && st.stage === 'awaiting_name_company', `stage=${st && st.stage}`);
    check('la necesidad queda guardada (pendingNeed)', !!st && !!st.pendingNeed, `pendingNeed=${st && JSON.stringify(st.pendingNeed)}`);

    mark = sent.length;
    await incoming(C, 'Soy María González de Hotel Casa Blanca');
    m = since(mark, C);
    st = readState(C);
    console.log('    (luego da su nombre):');
    check('nombre capturado', st && st.name === 'María González', `name=${st && st.name}`);
    check('va directo a la necesidad (etapa = main, sin trato ni contacto)', st && st.stage === 'main', `stage=${st && st.stage}`);
    check('NO pregunta cómo dirigirse', !hasText(m, /¿Cómo prefiere que le llame\?/));
    check('NO pide correo/teléfono todavía', !hasText(m, /¿Me comparte su correo/));
    check('explora con pregunta abierta (vaga)', hasText(m, /Mucho gusto, María González\. Cuéntame, ¿qué necesitas\? Así te ayudo con lo que buscas\./));

    // Necesidad concreta: "se me pierden los equipos" -> se responde tras el nombre.
    const C2 = '521111000004';
    await incoming(C2, 'se me pierden los equipos');
    mark = sent.length;
    await incoming(C2, 'Soy Carlos Ruiz de Bodega Central');
    m = since(mark, C2);
    st = readState(C2);
    console.log('    ("se me pierden los equipos" -> da su nombre):');
    check('nombre capturado', st && st.name === 'Carlos Ruiz', `name=${st && st.name}`);
    check('etapa = main (sin interrogatorio)', st && st.stage === 'main', `stage=${st && st.stage}`);
    check('responde la necesidad (rastreo de activos)', hasText(m, /rastreo de activos/));
    check('NO pregunta cómo dirigirse', !hasText(m, /¿Cómo prefiere que le llame\?/));

    // ---------- (d) "hola Daniela soy Ana" sigue dando nombre "Ana"
    const ANA = '521555000111';
    await incoming(ANA, 'Hola');
    mark = sent.length;
    await incoming(ANA, 'hola Daniela soy Ana');
    m = since(mark, ANA);
    st = readState(ANA);
    console.log('\n(d) "hola Daniela soy Ana":');
    check('nombre extraído = Ana', st && st.name === 'Ana', `name=${st && st.name}`);
    check('NO toma "Daniela" como nombre', !hasText(m, /Mucho gusto, Daniela/));

    // ---------- (e) Otro negocio (Edgar Cadena / cajas) -> canaliza a Pedro, sin vender
    const EDGAR = '521111000005';
    mark = sent.length;
    await incoming(EDGAR, 'hola Pedro, oye me interesa comprarte unas cajas de otro negocio');
    m = since(mark, EDGAR);
    st = readState(EDGAR);
    console.log('\n(e) Otro negocio (Edgar Cadena, "comprarte unas cajas de otro negocio"):');
    check('NO manda el video de bienvenida', !hasKind(m, 'video'));
    check('se presenta como Daniela, asistente virtual de Pedro', hasText(m, /Hola, soy Daniela, la asistente virtual de Pedro\./));
    check('dice que le pasa el mensaje de inmediato', hasText(m, /le mando tu mensaje para que te contacte de inmediato/));
    check('NO intenta vender Blü Bee (sin soluciones/demo/IoT)', !hasText(m, /soluciones|IoT|demostraci[oó]n|Blü Bee Technologies/));
    check('avisa a Pedro con el mensaje', notices(since(mark, PETER)).some((n) => /cajas de otro negocio/.test(n) && /no es de Blü Bee/.test(n)));
    check('marca el tema como personal', st && st.personalTopic === true, `personalTopic=${st && st.personalTopic}`);

    // ---------- (f) Saludo casual -> cálido, luego canalización con enlace
    const SALUDO = '521111000006';
    mark = sent.length;
    await incoming(SALUDO, 'hola Pedro, ¿cómo estás?');
    m = since(mark, SALUDO);
    st = readState(SALUDO);
    console.log('\n(f) Saludo casual "hola Pedro, ¿cómo estás?":');
    check('NO manda el video de bienvenida', !hasKind(m, 'video'));
    check('responde breve y cálido ("¡Hola! Bien, ¿y tú?")', hasText(m, /¡Hola! Bien, ¿y tú\?/));
    check('NO pide nombre/empresa (no es un prospecto)', !hasText(m, /¿me dice su nombre y de qué empresa/));
    check('marca saludo personal', st && st.personalGreeted === true, `personalGreeted=${st && st.personalGreeted}`);

    mark = sent.length;
    await incoming(SALUDO, 'nos vemos para comer');
    m = since(mark, SALUDO);
    console.log('    (sigue: "nos vemos para comer"):');
    check('dice que lo canaliza con Pedro', hasText(m, /Permíteme un segundo, te canalizo con Pedro\./));
    check('se presenta como su asistente virtual de Blü Bee Technologies', hasText(m, /Me presento, soy Daniela, su asistente virtual de Blü Bee Technologies\./));
    check('comparte el enlace de la página', hasText(m, /https:\/\/blubeetech\.com\.mx/));
    check('avisa a Pedro', notices(since(mark, PETER)).some((n) => /nos vemos para comer/.test(n)));

    mark = sent.length;
    await incoming(SALUDO, '¿viste el partido?');
    m = since(mark, SALUDO);
    console.log('    (sigue: "¿viste el partido?"):');
    check('también lo canaliza (no es tema de Blü Bee)', hasText(m, /te canalizo con Pedro/));

    // "Soy Pedro" (presentarse COMO Pedro) NO es un saludo A Pedro.
    const SOYPEDRO = '521111000007';
    mark = sent.length;
    await incoming(SOYPEDRO, 'Hola');
    await incoming(SOYPEDRO, 'Soy Pedro');
    m = since(mark, SOYPEDRO);
    st = readState(SOYPEDRO);
    console.log('    ("Soy Pedro" es su nombre, no un saludo a Pedro):');
    check('nombre "Pedro" aceptado tras "Soy"', st && st.name === 'Pedro', `name=${st && st.name}`);
    check('NO lo trata como saludo casual a Pedro', !hasText(m, /¡Hola! Bien, ¿y tú\?/));

    // ---------- (g) Nota de voz sin clave de OpenAI -> pide escribir
    config.openaiApiKey = ''; // sin clave: Daniela pide que escriban
    const VOZ = '521111000008';
    await incoming(VOZ, 'Hola');
    mark = sent.length;
    await incomingAudio(VOZ);
    m = since(mark, VOZ);
    console.log('\n(g) Nota de voz sin clave de OpenAI:');
    check('pide amablemente que escriban el mensaje', hasText(m, /Perdón, ahorita no puedo escuchar notas de voz\. ¿Me lo puedes escribir, por favor\? Así te atiendo mejor\./));
    check('NO intenta transcribir ni se queda callada', replies(m).length > 0);

    // ---------- (fv-a) Prospecto con nombre + interés -> se registra el video
    const FV = '521111000009';
    await driveToMain(FV, 'Soy María González de Hotel Casa Blanca');
    mark = sent.length;
    await incoming(FV, '¿qué es un beacon?');
    m = since(mark, FV);
    st = readState(FV);
    const req = readFarewellRequest(FV);
    console.log('\n(fv-a) Prospecto con nombre + interés ("¿qué es un beacon?"):');
    check('responde la pregunta (base de conocimiento)', hasText(m, /BlüSignal \(K11\)/));
    check('se registra la solicitud de video de despedida', !!req, `request=${req ? 'sí' : 'no'}`);
    check('la solicitud trae el nombre', !!req && req.name === 'María González', `name=${req && req.name}`);
    check('la solicitud trae la frase institucional con el nombre', !!req && /María González, muchas gracias por contactarnos/.test(req.phrase || ''));
    check('la solicitud NO trae disculpas ni explica retrasos', !!req && !/perdón|disculpa|retraso|tarde/.test(req.phrase || ''));
    check('estado: farewellVideoRequested = true', st && st.farewellVideoRequested === true, `farewellVideoRequested=${st && st.farewellVideoRequested}`);

    // ---------- (fv-b) Saludo casual / tema no Blü Bee -> NO se dispara
    const FV2 = '521111000010';
    await incoming(FV2, 'hola Pedro, ¿cómo estás?');
    await incoming(FV2, 'nos vemos para comer');
    console.log('\n(fv-b) Saludo casual / tema no Blü Bee:');
    check('NO se registra solicitud de video', readFarewellRequest(FV2) === null);
    const stFv2 = readState(FV2);
    check('NO se marca farewellVideoRequested', !stFv2 || stFv2.farewellVideoRequested !== true, `farewellVideoRequested=${stFv2 && stFv2.farewellVideoRequested}`);

    // ---------- (fv-c / a2) Despedida con video listo -> video + enlaces
    const FVC = '521111000011';
    await driveToMain(FVC, 'Soy María González de Hotel Casa Blanca');
    await incoming(FVC, '¿qué es un beacon?'); // dispara la solicitud
    makeFarewellVideo('María González');
    mark = sent.length;
    await incoming(FVC, 'gracias, adiós');
    m = since(mark, FVC);
    st = readState(FVC);
    console.log('\n(fv-c/a2) Despedida con video listo:');
    check('envía el video de despedida personalizado', videoFiles(m).some((f) => /despedida-maria-gonzalez\.mp4$/.test(f)), JSON.stringify(videoFiles(m)));
    check('después del video manda los enlaces de redes', hasText(m, /Te comparto nuestras redes:/));
    check('los enlaces incluyen Instagram (@blubee_2026)', hasText(m, /https:\/\/www\.instagram\.com\/blubee_2026/));
    check('los enlaces incluyen la página web', hasText(m, /https:\/\/blubeetech\.com\.mx/));
    check('NO incluye redes pendientes (Facebook/TikTok/YouTube)', !hasText(m, /Facebook: https|TikTok: https|YouTube: https/));
    check('también hace el cierre oficial (audio)', hasKind(m, 'audio'));
    check('también manda el video del logo', videoFiles(m).some((f) => /logo-video\.mp4$/.test(f)));
    check('conversación cerrada', st && st.stage === 'closed', `stage=${st && st.stage}`);

    // ---------- (fv-d / b2) Despedida sin video -> texto y queda pendiente
    const FVD = '521111000012';
    await driveToMain(FVD, 'Soy Carlos Ruiz de Bodega Central');
    await incoming(FVD, '¿qué es un beacon?'); // dispara la solicitud
    mark = sent.length;
    await incoming(FVD, 'gracias, adiós');
    m = since(mark, FVD);
    st = readState(FVD);
    console.log('\n(fv-d/b2) Despedida sin video (conversación corta):');
    check('NO envía video de despedida (aún no está)', !videoFiles(m).some((f) => /despedida-/.test(f)), JSON.stringify(videoFiles(m)));
    check('la despedida estándar sí se hace (cierre oficial: audio)', hasKind(m, 'audio'));
    check('la despedida estándar sí se hace (video del logo)', videoFiles(m).some((f) => /logo-video\.mp4$/.test(f)));
    check('queda la entrega pendiente registrada', !!st && !!st.farewellPending && st.farewellPending.name === 'Carlos Ruiz', `farewellPending=${st && JSON.stringify(st.farewellPending)}`);
    check('conversación cerrada (sin esperar el video)', st && st.stage === 'closed', `stage=${st && st.stage}`);

    // ---------- (fv-c2) Entrega diferida con video ya presente
    makeFarewellVideo('Carlos Ruiz');
    mark = sent.length;
    const delivered = await daniela.deliverPendingFarewell(FVD);
    m = since(mark, FVD);
    st = readState(FVD);
    console.log('\n(fv-c2) Entrega diferida (video ya presente, vía deliverPendingFarewell):');
    check('deliverPendingFarewell devuelve ok:true', delivered && delivered.ok === true, JSON.stringify(delivered));
    check('envía el video de despedida personalizado', videoFiles(m).some((f) => /despedida-carlos-ruiz\.mp4$/.test(f)), JSON.stringify(videoFiles(m)));
    check('envía los enlaces de redes', hasText(m, /Te comparto nuestras redes:/));
    check('limpia el pendiente', !st || st.farewellPending === null, `farewellPending=${st && JSON.stringify(st.farewellPending)}`);

    // Sin pendiente, la entrega diferida no hace nada.
    const delivered2 = await daniela.deliverPendingFarewell(FVD);
    console.log('    (sin pendiente):');
    check('sin pendiente devuelve ok:false (no-pending)', delivered2 && delivered2.ok === false && delivered2.reason === 'no-pending', JSON.stringify(delivered2));

    // ---------- (fv-d2) El guión no cambia salvo el nombre
    console.log('\n(fv-d2) Guión institucional fijo (solo cambia el nombre):');
    const phraseAna = daniela.farewellPhrase('Ana');
    const phraseCarlos = daniela.farewellPhrase('Carlos');
    check('el guión con otro nombre es idéntico salvo el nombre', phraseAna.replace('Ana', 'Carlos') === phraseCarlos);
    check('el guión dice "muchas gracias por contactarnos"', /muchas gracias por contactarnos/.test(phraseAna));
    check('el guión recuerda que no solo es IoT', /no solo son de IoT, podemos resolver más temas/.test(phraseAna));
    check('el guión menciona las redes', /YouTube, Instagram, Facebook y en nuestra página web/.test(phraseAna));
    check('el guión NO pide disculpas ni explica retrasos', !/perdón|disculpa|retraso/.test(phraseAna));
    check('el nombre del archivo es predecible', daniela.farewellVideoFileName('María González') === 'despedida-maria-gonzalez.mp4', daniela.farewellVideoFileName('María González'));
    check('los enlaces solo incluyen los que existen', (() => {
      const links = daniela.socialLinksMessage();
      return /Instagram: https:\/\/www\.instagram\.com\/blubee_2026/.test(links)
        && /Página web: https:\/\/blubeetech\.com\.mx/.test(links)
        && !/Facebook: https/.test(links) && !/TikTok: https/.test(links) && !/YouTube: https/.test(links);
    })(), daniela.socialLinksMessage().replace(/\n/g, ' | '));

    // ---------- (h) Diminutivos y cariños con los que le hablan a Daniela (v3.1)
    // Caso real: Ricardo Roach saludó "hola Dani".
    // Avisos a Pedro (notifyPeter) llegan como texto a PETER con el prefijo 🔔.
    function peterNoticesSince(mark2) {
      return sent.slice(mark2).filter((s) => s.to === PETER && s.body.startsWith('🔔'));
    }
    console.log('\n(h) Diminutivos y cariños dirigidos a Daniela:');
    check('isAffectionateGreeting("hola Dani") = true', daniela.isAffectionateGreeting('hola Dani') === true);
    check('isAffectionateGreeting("hola preciosa") = true', daniela.isAffectionateGreeting('hola preciosa') === true);
    check('isAffectionateGreeting("hola corazón") = true', daniela.isAffectionateGreeting('hola corazón') === true);
    check('isAffectionateGreeting("hola linda") = true', daniela.isAffectionateGreeting('hola linda') === true);
    check('isAffectionateGreeting("Dani, soy Ricardo") = true', daniela.isAffectionateGreeting('Dani, soy Ricardo') === true);
    check('isAffectionateGreeting("eres hermosa") = false (piropo, sigue el límite)', daniela.isAffectionateGreeting('eres hermosa') === false);
    check('isAffectionateGreeting("hola, qué guapa") = false (piropo)', daniela.isAffectionateGreeting('hola, qué guapa') === false);
    check('isAffectionateGreeting("me gustas") = false (coqueteo explícito)', daniela.isAffectionateGreeting('me gustas') === false);
    check('isAffectionateGreeting("hola, ¿qué es un beacon?") = false (sin cariño)', daniela.isAffectionateGreeting('hola, ¿qué es un beacon?') === false);
    check('parseNameCompany("hola Dani, soy Ricardo").name = "Ricardo"', daniela.parseNameCompany('hola Dani, soy Ricardo').name === 'Ricardo');
    check('parseNameCompany("Dani, soy Ricardo").name = "Ricardo"', daniela.parseNameCompany('Dani, soy Ricardo').name === 'Ricardo');
    check('parseNameCompany("hola preciosa, soy María").name = "María"', daniela.parseNameCompany('hola preciosa, soy María').name === 'María');
    check('parseNameCompany("soy Reina").name = "Reina" (nombre real, no se quita)', daniela.parseNameCompany('soy Reina').name === 'Reina');
    check('parseNameCompany("Reina").name = "Reina" (sola, sin saludo ni coma)', daniela.parseNameCompany('Reina').name === 'Reina');
    check('parseNameCompany("hola, soy Cielo").name = "Cielo"', daniela.parseNameCompany('hola, soy Cielo').name === 'Cielo');
    check('parseNameCompany("hola Daniela soy Ana").name sigue = "Ana"', daniela.parseNameCompany('hola Daniela soy Ana').name === 'Ana');

    // (h-a) "hola Dani" -> saludo normal, cálido y profesional, NO acoso.
    const HD = '521111000030';
    mark = sent.length;
    await incoming(HD, 'hola Dani');
    m = since(mark, HD);
    st = readState(HD);
    console.log('\n(h-a) "hola Dani" (primer mensaje):');
    check('responde con calidez ("Mucho gusto, soy Daniela")', hasText(m, /¡Hola! Mucho gusto, soy Daniela, la asistente virtual de Blü Bee Technologies\. ¿En qué te puedo ayudar\?/));
    check('NO es la redirección de acoso', !hasText(m, /En Blü Bee atendemos consultas sobre nuestras soluciones/));
    check('NO incrementa obsceneCount', !st || st.obsceneCount === 0, `obsceneCount=${st && st.obsceneCount}`);
    check('NO avisa a Pedro por límite', peterNoticesSince(mark).length === 0, JSON.stringify(peterNoticesSince(mark)));

    // (h-b) "hola Dani, soy Ricardo" -> nombre "Ricardo".
    const HR = '521111000031';
    mark = sent.length;
    await incoming(HR, 'hola Dani, soy Ricardo');
    m = since(mark, HR);
    st = readState(HR);
    console.log('\n(h-b) "hola Dani, soy Ricardo":');
    check('el nombre es "Ricardo" (no "Dani")', st && st.name === 'Ricardo', `name=${st && st.name}`);
    check('lo saluda por su nombre', hasText(m, /Mucho gusto, Ricardo/));
    check('NO toma "Dani" como nombre', !/Mucho gusto, Dani/.test(texts(m).join(' ')));

    // (h-c) "hola preciosa, ¿me ayudas?" -> respuesta profesional, sin tomar a mal.
    const HP = '521111000032';
    mark = sent.length;
    await incoming(HP, 'hola preciosa, ¿me ayudas?');
    m = since(mark, HP);
    st = readState(HP);
    console.log('\n(h-c) "hola preciosa, ¿me ayudas?":');
    check('responde (no se queda callada)', replies(m).length > 0);
    check('NO es la redirección de acoso', !hasText(m, /En Blü Bee atendemos consultas sobre nuestras soluciones/));
    check('NO incrementa obsceneCount', !st || st.obsceneCount === 0, `obsceneCount=${st && st.obsceneCount}`);
    check('NO avisa a Pedro por límite', peterNoticesSince(mark).length === 0, JSON.stringify(peterNoticesSince(mark)));
    check('NO coquetea de vuelta ni repite el cariño', !hasText(m, /preciosa/i));

    // (h-d) "hola corazón" -> saludo normal.
    const HC = '521111000033';
    mark = sent.length;
    await incoming(HC, 'hola corazón');
    m = since(mark, HC);
    st = readState(HC);
    console.log('\n(h-d) "hola corazón":');
    check('responde con calidez ("Mucho gusto, soy Daniela")', hasText(m, /¡Hola! Mucho gusto, soy Daniela/));
    check('NO es la redirección de acoso', !hasText(m, /En Blü Bee atendemos consultas sobre nuestras soluciones/));
    check('NO incrementa obsceneCount', !st || st.obsceneCount === 0, `obsceneCount=${st && st.obsceneCount}`);
    check('NO avisa a Pedro por límite', peterNoticesSince(mark).length === 0, JSON.stringify(peterNoticesSince(mark)));

    // (h-e) Coqueteo insistente/explícito sigue activando el límite v2.1.
    const HF = '521111000034';
    mark = sent.length;
    await incoming(HF, 'eres hermosa');
    m = since(mark, HF);
    st = readState(HF);
    console.log('\n(h-e) Coqueteo explícito ("eres hermosa" y luego "me gustas"):');
    check('primera vez: redirección amable (LIMIT_OBSCENE)', hasText(m, /En Blü Bee atendemos consultas sobre nuestras soluciones\. ¿En qué le puedo ayudar con eso\?/));
    check('primera vez: avisa a Pedro', peterNoticesSince(mark).length > 0);
    check('obsceneCount = 1', st && st.obsceneCount === 1, `obsceneCount=${st && st.obsceneCount}`);
    mark = sent.length;
    await incoming(HF, 'me gustas');
    m = since(mark, HF);
    st = readState(HF);
    check('segunda vez: silencio (no contesta)', replies(m).length === 0, JSON.stringify(replies(m)));
    check('segunda vez: avisa a Pedro', peterNoticesSince(mark).length > 0);
    check('obsceneCount = 2', st && st.obsceneCount === 2, `obsceneCount=${st && st.obsceneCount}`);

    // ---------- (i) Errores de dedo y faltas de ortografía de la marca (v3.2)
    // Caso real: Ricardo Roach escribió "Que hace blue Bee ?" y Daniela lo
    // clasificó como "que no es de Blü Bee" y no contestó. Principio de
    // Peter: la mención de la marca, en cualquier ortografía, SIEMPRE se
    // trata como una consulta sobre Blü Bee, nunca como "no es de Blü Bee".
    console.log('\n(i) Errores de dedo en la marca:');
    check('normalize("Que hace blue Bee ?") = "que hace blu bee"', conocimiento.normalize('Que hace blue Bee ?') === 'que hace blu bee', conocimiento.normalize('Que hace blue Bee ?'));
    check('normalize("qué es Bluebee Technologies") = "que es blubee technologies"', conocimiento.normalize('qué es Bluebee Technologies') === 'que es blubee technologies', conocimiento.normalize('qué es Bluebee Technologies'));
    check('normalize("Blu-Bee") = "blu bee"', conocimiento.normalize('Blu-Bee') === 'blu bee', conocimiento.normalize('Blu-Bee'));
    check('normalize("que hace Blube?") = "que hace blubee"', conocimiento.normalize('que hace Blube?') === 'que hace blubee', conocimiento.normalize('que hace Blube?'));
    check('findAnswer("Que hace blue Bee ?") = quehace', conocimiento.findAnswer('Que hace blue Bee ?') && conocimiento.findAnswer('Que hace blue Bee ?').id === 'quehace', JSON.stringify(conocimiento.findAnswer('Que hace blue Bee ?') && conocimiento.findAnswer('Que hace blue Bee ?').id));
    check('findAnswer("qué es Bluebee Technologies") = quehace', conocimiento.findAnswer('qué es Bluebee Technologies') && conocimiento.findAnswer('qué es Bluebee Technologies').id === 'quehace');
    check('findAnswer("¿qué es Blu Bee?") = quehace (sin diéresis)', conocimiento.findAnswer('¿qué es Blu Bee?') && conocimiento.findAnswer('¿qué es Blu Bee?').id === 'quehace');
    check('findAnswer("¿qué hace un beacon?") NO es quehace (no roba lo específico)', !conocimiento.findAnswer('¿qué hace un beacon?') || conocimiento.findAnswer('¿qué hace un beacon?').id !== 'quehace', JSON.stringify(conocimiento.findAnswer('¿qué hace un beacon?') && conocimiento.findAnswer('¿qué hace un beacon?').id));

    // (i-a) "Que hace blue Bee ?" en 'main' -> responde qué hace Blü Bee.
    const MB1 = '521111000040';
    await driveToMain(MB1, 'Soy María González de Hotel Casa Blanca');
    mark = sent.length;
    await incoming(MB1, 'Que hace blue Bee ?');
    m = since(mark, MB1);
    console.log('\n(i-a) "Que hace blue Bee ?" (en main):');
    check('responde qué hace Blü Bee (base de conocimiento)', hasText(m, /En Blü Bee creamos soluciones basadas en Internet de las Cosas \(IoT\)/));
    check('la respuesta escribe "Blü Bee" correctamente', hasText(m, /Blü Bee/));
    check('la respuesta NO repite la falta ("blue Bee")', !hasText(m, /blue bee/i));
    check('NO se clasifica como "no es de Blü Bee" (sin aviso a Pedro)', peterNoticesSince(mark).length === 0, JSON.stringify(peterNoticesSince(mark)));

    // (i-b) "qué es Bluebee Technologies" -> responde.
    const MB2 = '521111000041';
    await driveToMain(MB2, 'Soy Jorge Díaz de Plaza Central');
    mark = sent.length;
    await incoming(MB2, 'qué es Bluebee Technologies');
    m = since(mark, MB2);
    console.log('\n(i-b) "qué es Bluebee Technologies":');
    check('responde qué hace Blü Bee (base de conocimiento)', hasText(m, /En Blü Bee creamos soluciones basadas en Internet de las Cosas \(IoT\)/));
    check('la respuesta escribe "Blü Bee" correctamente', hasText(m, /Blü Bee/));
    check('NO se clasifica como "no es de Blü Bee"', peterNoticesSince(mark).length === 0, JSON.stringify(peterNoticesSince(mark)));

    // (i-c) "Blu Bee" sin diéresis -> lo entiende.
    const MB3 = '521111000042';
    await driveToMain(MB3, 'Soy Ana Pérez de Clínica San José');
    mark = sent.length;
    await incoming(MB3, '¿qué es Blu Bee?');
    m = since(mark, MB3);
    console.log('\n(i-c) "¿qué es Blu Bee?" (sin diéresis):');
    check('responde qué hace Blü Bee (base de conocimiento)', hasText(m, /En Blü Bee creamos soluciones basadas en Internet de las Cosas \(IoT\)/));
    check('NO se clasifica como "no es de Blü Bee"', peterNoticesSince(mark).length === 0, JSON.stringify(peterNoticesSince(mark)));

    // (i-d) Primer mensaje (escenario Ricky): "Que hace blue Bee ?" como
    // primer mensaje -> responde con la base y luego pide la identidad.
    const MR = '521111000043';
    mark = sent.length;
    await incoming(MR, 'Que hace blue Bee ?');
    m = since(mark, MR);
    st = readState(MR);
    console.log('\n(i-d) "Que hace blue Bee ?" como primer mensaje (escenario Ricky):');
    check('manda el video de bienvenida', hasKind(m, 'video'));
    check('responde qué hace Blü Bee (base de conocimiento)', hasText(m, /En Blü Bee creamos soluciones basadas en Internet de las Cosas \(IoT\)/));
    check('la respuesta escribe "Blü Bee" correctamente', hasText(m, /Blü Bee/));
    check('la respuesta NO repite la falta ("blue Bee")', !hasText(m, /blue bee/i));
    check('NO se clasifica como "no es de Blü Bee"', peterNoticesSince(mark).length === 0, JSON.stringify(peterNoticesSince(mark)));
    check('después pide la identidad de forma natural', hasText(m, /Para atenderte mejor, ¿me compartes tu nombre y de qué empresa nos escribes\?/));
    check('etapa = awaiting_name_company', st && st.stage === 'awaiting_name_company', `stage=${st && st.stage}`);

    // ---------- (j) Fallback de identidad del video de despedida (v3.3, 2026-11-11)
    // Aprobado por Peter: persona > empresa > genérico. Daniela NUNCA
    // insiste por el nombre: usa lo que le dieron.

    // (j-a) Solo empresa (sin nombre de persona) -> video con la empresa.
    const FJ1 = '521111000050';
    await incoming(FJ1, 'Hola');
    await incoming(FJ1, 'Quiero agendar una demo');
    mark = sent.length;
    await incoming(FJ1, 'Hotel Casa Blanca');
    m = since(mark, FJ1);
    st = readState(FJ1);
    let reqJ = readFarewellRequest(FJ1);
    console.log('\n(j-a) Solo empresa ("Hotel Casa Blanca", sin nombre):');
    check('la empresa queda guardada', st && st.company === 'Hotel Casa Blanca', `company=${st && st.company}`);
    check('NO hay nombre de persona', !st || !st.name, `name=${st && st.name}`);
    check('se registra la solicitud de video', !!reqJ, `request=${reqJ ? 'sí' : 'no'}`);
    check('la solicitud es tipo empresa', !!reqJ && reqJ.kind === 'company', `kind=${reqJ && reqJ.kind}`);
    check('la solicitud trae la empresa', !!reqJ && reqJ.name === 'Hotel Casa Blanca', `name=${reqJ && reqJ.name}`);
    check('la solicitud trae el archivo de la empresa', !!reqJ && reqJ.file === 'despedida-hotel-casa-blanca.mp4', `file=${reqJ && reqJ.file}`);
    check('la frase usa la empresa', !!reqJ && /^Hotel Casa Blanca, muchas gracias por contactarnos/.test(reqJ.phrase || ''), reqJ && reqJ.phrase);
    check('pregunta día/hora (no vuelve a pedir el nombre)', hasText(m, /¿Qué día y hora le conviene para la demostración\?/));
    check('NO vuelve a pedir el nombre', !hasText(m, /nombre/i), JSON.stringify(texts(m)));
    // Despedida sin video -> queda pendiente con la empresa.
    await incoming(FJ1, 'mañana a las 10');
    st = readState(FJ1);
    console.log('    (despedida sin video listo):');
    check('queda la entrega pendiente con la empresa', !!st && !!st.farewellPending && st.farewellPending.kind === 'company' && st.farewellPending.name === 'Hotel Casa Blanca', `farewellPending=${st && JSON.stringify(st.farewellPending)}`);
    check('el pendiente trae el archivo de la empresa', !!st && !!st.farewellPending && st.farewellPending.file === 'despedida-hotel-casa-blanca.mp4', `file=${st && st.farewellPending && st.farewellPending.file}`);
    check('conversación cerrada', st && st.stage === 'closed', `stage=${st && st.stage}`);
    // Entrega diferida con el video de la empresa.
    makeFarewellVideo('Hotel Casa Blanca');
    mark = sent.length;
    const deliveredJ1 = await daniela.deliverPendingFarewell(FJ1);
    m = since(mark, FJ1);
    st = readState(FJ1);
    console.log('    (entrega diferida con el video de la empresa):');
    check('deliverPendingFarewell devuelve ok:true', deliveredJ1 && deliveredJ1.ok === true, JSON.stringify(deliveredJ1));
    check('envía el video de la empresa', videoFiles(m).some((f) => /despedida-hotel-casa-blanca\.mp4$/.test(f)), JSON.stringify(videoFiles(m)));
    check('envía los enlaces de redes', hasText(m, /Te comparto nuestras redes:/));
    check('limpia el pendiente', !st || st.farewellPending === null, `farewellPending=${st && JSON.stringify(st.farewellPending)}`);

    // (j-b) Sin nombre ni empresa -> video genérico.
    const FJ2 = '521111000051';
    await incoming(FJ2, 'Hola');
    await incoming(FJ2, 'Quiero agendar una demo');
    mark = sent.length;
    await incoming(FJ2, 'No quiero dar mis datos, solo quiero la demo');
    m = since(mark, FJ2);
    st = readState(FJ2);
    reqJ = readFarewellRequest(FJ2);
    console.log('\n(j-b) Sin nombre ni empresa ("No quiero dar mis datos"):');
    check('NO hay nombre de persona', !st || !st.name, `name=${st && st.name}`);
    check('NO hay empresa', !st || !st.company, `company=${st && st.company}`);
    check('se registra la solicitud de video (genérica)', !!reqJ, `request=${reqJ ? 'sí' : 'no'}`);
    check('la solicitud es tipo genérico', !!reqJ && reqJ.kind === 'generic', `kind=${reqJ && reqJ.kind}`);
    check('la solicitud NO trae nombre', !!reqJ && reqJ.name === null, `name=${reqJ && reqJ.name}`);
    check('la solicitud trae el archivo genérico', !!reqJ && reqJ.file === 'despedida-generica.mp4', `file=${reqJ && reqJ.file}`);
    check('la frase genérica NO lleva nombre', !!reqJ && /^Muchas gracias por contactarnos\./.test(reqJ.phrase || ''), reqJ && reqJ.phrase);
    check('la frase genérica es el guion sin "[Nombre], "', !!reqJ && reqJ.phrase === daniela.farewellPhrase('X').replace('X, muchas', 'Muchas'), reqJ && reqJ.phrase);
    check('pregunta día/hora (no vuelve a pedir el nombre)', hasText(m, /¿Qué día y hora le conviene para la demostración\?/));
    check('NO vuelve a pedir el nombre', !hasText(m, /nombre/i), JSON.stringify(texts(m)));
    // Despedida sin video -> queda pendiente genérico.
    await incoming(FJ2, 'mañana a las 11');
    st = readState(FJ2);
    console.log('    (despedida sin video listo):');
    check('queda la entrega pendiente genérica', !!st && !!st.farewellPending && st.farewellPending.kind === 'generic' && st.farewellPending.name === null, `farewellPending=${st && JSON.stringify(st.farewellPending)}`);
    check('el pendiente trae el archivo genérico', !!st && !!st.farewellPending && st.farewellPending.file === 'despedida-generica.mp4', `file=${st && st.farewellPending && st.farewellPending.file}`);
    // Entrega diferida con el video genérico.
    makeFarewellVideoFile('despedida-generica.mp4');
    mark = sent.length;
    const deliveredJ2 = await daniela.deliverPendingFarewell(FJ2);
    m = since(mark, FJ2);
    st = readState(FJ2);
    console.log('    (entrega diferida con el video genérico):');
    check('deliverPendingFarewell devuelve ok:true', deliveredJ2 && deliveredJ2.ok === true, JSON.stringify(deliveredJ2));
    check('envía el video genérico', videoFiles(m).some((f) => /despedida-generica\.mp4$/.test(f)), JSON.stringify(videoFiles(m)));
    check('envía los enlaces de redes', hasText(m, /Te comparto nuestras redes:/));
    check('limpia el pendiente', !st || st.farewellPending === null, `farewellPending=${st && JSON.stringify(st.farewellPending)}`);

    // (j-c) Escenario A con empresa: el video ya está listo al despedirse.
    const FJ3 = '521111000052';
    await incoming(FJ3, 'Hola');
    await incoming(FJ3, 'Quiero agendar una demo');
    await incoming(FJ3, 'Hotel Casa Blanca');
    makeFarewellVideo('Hotel Casa Blanca');
    mark = sent.length;
    await incoming(FJ3, 'mañana a las 10');
    m = since(mark, FJ3);
    st = readState(FJ3);
    console.log('\n(j-c) Despedida con video de empresa listo (escenario A):');
    check('envía el video de la empresa', videoFiles(m).some((f) => /despedida-hotel-casa-blanca\.mp4$/.test(f)), JSON.stringify(videoFiles(m)));
    check('después del video manda los enlaces de redes', hasText(m, /Te comparto nuestras redes:/));
    check('NO queda pendiente', !st || st.farewellPending === null, `farewellPending=${st && JSON.stringify(st.farewellPending)}`);
    check('también hace el cierre oficial (audio)', hasKind(m, 'audio'));
    check('conversación cerrada', st && st.stage === 'closed', `stage=${st && st.stage}`);

    // (j-d) Funciones de identidad (unitarias).
    console.log('\n(j-d) Funciones de identidad:');
    check('farewellIdentity con nombre -> persona', JSON.stringify(daniela.farewellIdentity({ name: 'Ana', company: 'Hotel X' })) === JSON.stringify({ kind: 'person', name: 'Ana' }), JSON.stringify(daniela.farewellIdentity({ name: 'Ana', company: 'Hotel X' })));
    check('farewellIdentity sin nombre, con empresa -> empresa', JSON.stringify(daniela.farewellIdentity({ name: null, company: 'Hotel Casa Blanca' })) === JSON.stringify({ kind: 'company', name: 'Hotel Casa Blanca' }));
    check('farewellIdentity sin nombre ni empresa -> genérico', JSON.stringify(daniela.farewellIdentity({ name: null, company: null })) === JSON.stringify({ kind: 'generic', name: null }));
    check('farewellPhraseForIdentity empresa usa la empresa', /^Hotel Casa Blanca, muchas gracias por contactarnos/.test(daniela.farewellPhraseForIdentity({ kind: 'company', name: 'Hotel Casa Blanca' })));
    check('farewellPhraseForIdentity genérico NO lleva nombre', /^Muchas gracias por contactarnos\./.test(daniela.farewellPhraseForIdentity({ kind: 'generic', name: null })));
    check('el guion genérico es el institucional sin el nombre', daniela.farewellPhraseForIdentity({ kind: 'generic', name: null }) === daniela.farewellPhrase('X').replace('X, muchas', 'Muchas'));
    check('farewellVideoFileNameForIdentity persona', daniela.farewellVideoFileNameForIdentity({ kind: 'person', name: 'Ana' }) === 'despedida-ana.mp4', daniela.farewellVideoFileNameForIdentity({ kind: 'person', name: 'Ana' }));
    check('farewellVideoFileNameForIdentity empresa', daniela.farewellVideoFileNameForIdentity({ kind: 'company', name: 'Hotel Casa Blanca' }) === 'despedida-hotel-casa-blanca.mp4', daniela.farewellVideoFileNameForIdentity({ kind: 'company', name: 'Hotel Casa Blanca' }));
    check('farewellVideoFileNameForIdentity genérico', daniela.farewellVideoFileNameForIdentity({ kind: 'generic', name: null }) === 'despedida-generica.mp4', daniela.farewellVideoFileNameForIdentity({ kind: 'generic', name: null }));
    check('farewellVideoPathForIdentity genérico apunta al archivo común', /despedida-generica\.mp4$/.test(daniela.farewellVideoPathForIdentity({ kind: 'generic', name: null })), daniela.farewellVideoPathForIdentity({ kind: 'generic', name: null }));
    const longCompany = 'Grupo Industrial de Servicios de Logística del Bajío S.A. de C.V.';
    const longFile = daniela.farewellVideoFileName(longCompany);
    console.log('    (empresa con nombre muy largo):');
    check('el archivo usa forma corta (slug ≤ 40 caracteres)', /^despedida-[a-z0-9-]{1,40}\.mp4$/.test(longFile) && !/-+\.mp4$/.test(longFile), longFile);
    check('el guion lleva el nombre completo de la empresa', daniela.farewellPhraseForIdentity({ kind: 'company', name: longCompany }).startsWith(`${longCompany}, muchas gracias por contactarnos`));
    check('farewellVideoFileName("") sigue siendo null', daniela.farewellVideoFileName('') === null);

    // (j-e) La identidad mejora en la misma conversación: genérico -> persona.
    // 'claro' llega a 'main' sin nombre (palabra de asentimiento); ahí una
    // pregunta dispara la solicitud genérica, y al dar su nombre en la demo
    // la solicitud se actualiza a persona.
    const FJ4 = '521111000053';
    await incoming(FJ4, 'Hola');
    await incoming(FJ4, 'claro');
    st = readState(FJ4);
    console.log('\n(j-e) La identidad mejora (genérico -> persona):');
    check('llega a main sin nombre', st && st.stage === 'main' && !st.name, `stage=${st && st.stage} name=${st && st.name}`);
    await incoming(FJ4, '¿qué es un beacon?');
    reqJ = readFarewellRequest(FJ4);
    check('primero se pide genérico', !!reqJ && reqJ.kind === 'generic' && reqJ.file === 'despedida-generica.mp4', `kind=${reqJ && reqJ.kind} file=${reqJ && reqJ.file}`);
    await incoming(FJ4, 'quiero agendar una demo');
    await incoming(FJ4, 'Soy Laura Méndez de Hotel Casa Blanca');
    reqJ = readFarewellRequest(FJ4);
    check('al dar su nombre, la solicitud se actualiza a persona', !!reqJ && reqJ.kind === 'person' && reqJ.name === 'Laura Méndez', `kind=${reqJ && reqJ.kind} name=${reqJ && reqJ.name}`);
    check('el archivo se actualiza al de la persona', !!reqJ && reqJ.file === 'despedida-laura-mendez.mp4', `file=${reqJ && reqJ.file}`);
    check('la frase se actualiza con su nombre', !!reqJ && /^Laura Méndez, muchas gracias por contactarnos/.test(reqJ.phrase || ''));
    await incoming(FJ4, 'mañana a las 10');
    st = readState(FJ4);
    check('el pendiente queda como persona', !!st && !!st.farewellPending && st.farewellPending.kind === 'person' && st.farewellPending.name === 'Laura Méndez', `farewellPending=${st && JSON.stringify(st.farewellPending)}`);

    // ---------- (k) Trato VIP para Ricardo Roach ("Ricky", v3.4, 2026-11-11)
    // Socio de Peter: siempre "Ricky", los cariños y piropos no activan el
    // límite, tono personal y cercano, y de vez en cuando (1 de cada 3
    // saludos) pregunta por Mila y Bruna, el pádel, la bici/scooter o el
    // fútbol (América, Champions, equipos ingleses). Su nombre registrado
    // ("Richard William Roach Sánchez") NUNCA se usa: aunque él lo escriba,
    // Daniela le dice "Ricky".
    // Avisos a Pedro (notifyPeter) llegan como texto a PETER con el prefijo 🔔.
    function kNoticesSince(mark2) {
      return sent.slice(mark2).filter((s) => s.to === PETER && s.body.startsWith('🔔'));
    }
    const RICKY = '5215519518504'; // número real de Ricky (config.vipRicky.phone)
    console.log('\n(k) Trato VIP para Ricky:');
    check('isVipRicky("5215519518504") = true', daniela.isVipRicky('5215519518504') === true);
    check('isVipRicky("5519518504") = true (solo últimos 10 dígitos)', daniela.isVipRicky('5519518504') === true);
    check('isVipRicky("5215519518505") = false', daniela.isVipRicky('5215519518505') === false);
    check('isVipRicky("521111000001") = false', daniela.isVipRicky('521111000001') === false);
    check('isVipAffectionate("hola mi amor") = true', daniela.isVipAffectionate('hola mi amor') === true);
    check('isVipAffectionate("eres hermosa") = true', daniela.isVipAffectionate('eres hermosa') === true);
    check('isVipAffectionate("me gustas") = true', daniela.isVipAffectionate('me gustas') === true);
    check('isVipAffectionate("te amo") = true', daniela.isVipAffectionate('te amo') === true);
    check('isVipAffectionate("qué guapa eres") = true', daniela.isVipAffectionate('qué guapa eres') === true);
    check('isVipAffectionate("hola, ¿qué es un beacon?") = false', daniela.isVipAffectionate('hola, ¿qué es un beacon?') === false);
    check('looksGenuinelyObscene("eres hermosa") = false (piropo, no obscenidad)', daniela.looksGenuinelyObscene('eres hermosa') === false);
    check('looksGenuinelyObscene("me gustas") = false', daniela.looksGenuinelyObscene('me gustas') === false);
    check('looksGenuinelyObscene("te amo") = false', daniela.looksGenuinelyObscene('te amo') === false);
    check('looksGenuinelyObscene("eres un pendejo") = true', daniela.looksGenuinelyObscene('eres un pendejo') === true);
    check('looksGenuinelyObscene("hijo de puta") = true', daniela.looksGenuinelyObscene('hijo de puta') === true);
    check('looksGenuinelyObscene("vamos a la cama") = true', daniela.looksGenuinelyObscene('vamos a la cama') === true);
    check('looksGenuinelyObscene("hola mi amor") = false', daniela.looksGenuinelyObscene('hola mi amor') === false);
    check('vipPersonalLine(count 0) pregunta por Mila y Bruna', /Mila y Bruna/.test(daniela.vipPersonalLine({ vipGreetingCount: 0 })), daniela.vipPersonalLine({ vipGreetingCount: 0 }));
    check('vipPersonalLine(count 1) = "" (no en cada saludo)', daniela.vipPersonalLine({ vipGreetingCount: 1 }) === '');
    check('vipPersonalLine(count 2) = ""', daniela.vipPersonalLine({ vipGreetingCount: 2 }) === '');
    check('vipPersonalLine(count 3) saluda a Mila y Bruna', /Mila y Bruna/.test(daniela.vipPersonalLine({ vipGreetingCount: 3 })), daniela.vipPersonalLine({ vipGreetingCount: 3 }));
    check('vipPersonalLine(count 6) pregunta por sus niñas', /tus niñas, Mila y Bruna/.test(daniela.vipPersonalLine({ vipGreetingCount: 6 })), daniela.vipPersonalLine({ vipGreetingCount: 6 }));
    check('vipPersonalLine(count 9) pregunta por el pádel', /pádel/.test(daniela.vipPersonalLine({ vipGreetingCount: 9 })), daniela.vipPersonalLine({ vipGreetingCount: 9 }));
    check('vipPersonalLine(count 12) pregunta por la bici o el scooter', /bici| scooter/.test(daniela.vipPersonalLine({ vipGreetingCount: 12 })), daniela.vipPersonalLine({ vipGreetingCount: 12 }));
    check('vipPersonalLine(count 15) pregunta por el América (fútbol)', /América/.test(daniela.vipPersonalLine({ vipGreetingCount: 15 })), daniela.vipPersonalLine({ vipGreetingCount: 15 }));
    check('vipPersonalLine(count 18) pregunta por el Manchester United y el Tottenham (fútbol inglés)', /Manchester United/.test(daniela.vipPersonalLine({ vipGreetingCount: 18 })) && /Tottenham/.test(daniela.vipPersonalLine({ vipGreetingCount: 18 })), daniela.vipPersonalLine({ vipGreetingCount: 18 }));
    check('vipPersonalLine(count 21) vuelve a las perras (rotación, 7 variantes)', /Mila y Bruna/.test(daniela.vipPersonalLine({ vipGreetingCount: 21 })), daniela.vipPersonalLine({ vipGreetingCount: 21 }));
    check('vipWarmGreeting(count 15) menciona al América', /América/.test(daniela.vipWarmGreeting({ vipGreetingCount: 15 })), daniela.vipWarmGreeting({ vipGreetingCount: 15 }));
    check('vipWarmGreeting(count 18) menciona a los equipos ingleses', /Manchester United/.test(daniela.vipWarmGreeting({ vipGreetingCount: 18 })) && /Tottenham/.test(daniela.vipWarmGreeting({ vipGreetingCount: 18 })), daniela.vipWarmGreeting({ vipGreetingCount: 18 }));

    // (k-a) Ricky "hola Dani" (primer mensaje): saludo VIP con su nombre y
    // las perras (saludo #1, con línea personal), sin límite ni aviso.
    mark = sent.length;
    await incoming(RICKY, 'hola Dani');
    m = since(mark, RICKY);
    st = readState(RICKY);
    console.log('\n(k-a) Ricky "hola Dani" (primer mensaje):');
    check('lo saluda como Ricky ("¡Hola Ricky! Qué gusto saludarte")', hasText(m, /¡Hola Ricky! Qué gusto saludarte, ¿en qué te puedo ayudar\?/));
    check('saludo #1 pregunta por Mila y Bruna', hasText(m, /Mila y Bruna/));
    check('el nombre es "Ricky"', st && st.name === 'Ricky', `name=${st && st.name}`);
    check('el trato es "Ricky"', st && st.preferredName === 'Ricky', `preferredName=${st && st.preferredName}`);
    check('le habla de tú (trato personal)', st && st.formality === 'tu', `formality=${st && st.formality}`);
    check('contador de saludos VIP = 1', st && st.vipGreetingCount === 1, `vipGreetingCount=${st && st.vipGreetingCount}`);
    check('NO es la redirección de acoso', !hasText(m, /En Blü Bee atendemos consultas sobre nuestras soluciones/));
    check('NO incrementa obsceneCount', !st || st.obsceneCount === 0, `obsceneCount=${st && st.obsceneCount}`);
    check('NO avisa a Pedro por límite', kNoticesSince(mark).length === 0, JSON.stringify(kNoticesSince(mark)));

    // (k-e) Cadencia: saludos #2..#10 con un simple "hola". La línea
    // personal solo aparece en 1 de cada 3 (saludos #4, #7 y #10) y rota:
    // #4 y #7 son las perras, #10 es el pádel. Los demás, solo el saludo.
    const greetings = [];
    for (let i = 2; i <= 10; i += 1) {
      mark = sent.length;
      await incoming(RICKY, 'hola');
      greetings.push(texts(since(mark, RICKY)).join(' '));
    }
    st = readState(RICKY);
    const hasPersonal = (s) => /Mila|Bruna|pádel|bici|scooter/.test(s);
    console.log('\n(k-e) Cadencia de la línea personal (saludos #2..#10):');
    check('los 9 saludos son cálidos y personales', greetings.every((g) => /¡Hola Ricky! Qué gusto saludarte/.test(g)), JSON.stringify(greetings));
    check('saludo #4 saluda a Mila y Bruna', hasPersonal(greetings[2]) && /Mila y Bruna/.test(greetings[2]), greetings[2]);
    check('saludo #7 pregunta por sus niñas', /tus niñas, Mila y Bruna/.test(greetings[5]), greetings[5]);
    check('saludo #10 pregunta por el pádel', /pádel/.test(greetings[8]), greetings[8]);
    check('saludos #2, #3, #5, #6, #8 y #9 NO llevan línea personal', [0, 1, 3, 4, 6, 7].every((idx) => !hasPersonal(greetings[idx])), JSON.stringify(greetings));
    check('contador de saludos VIP = 10', st && st.vipGreetingCount === 10, `vipGreetingCount=${st && st.vipGreetingCount}`);

    // (k-b) Ricky dice otro nombre ("hola Dani, soy Ricardo"): sigue siendo
    // "Ricky" para Daniela, en el estado y en el saludo.
    mark = sent.length;
    await incoming(RICKY, 'hola Dani, soy Ricardo');
    m = since(mark, RICKY);
    st = readState(RICKY);
    console.log('\n(k-b) Ricky dice otro nombre ("hola Dani, soy Ricardo"):');
    check('el nombre sigue siendo "Ricky" (no "Ricardo")', st && st.name === 'Ricky', `name=${st && st.name}`);
    check('lo saluda como Ricky', hasText(m, /Mucho gusto, Ricky/));
    check('NO lo saluda como Ricardo', !hasText(m, /Mucho gusto, Ricardo/));
    // Llevarlo a 'main' para las pruebas de coqueteo y negocio.
    await incoming(RICKY, 'de tú');
    await incoming(RICKY, 'rroach@medicabiozone.com, WhatsApp al mismo número');
    st = readState(RICKY);
    check('llega a main con el nombre "Ricky"', st && st.stage === 'main' && st.name === 'Ricky', `stage=${st && st.stage} name=${st && st.name}`);

    // (k-c) Cariños y piropos de Ricky en 'main': respuesta cálida, sin
    // límite y sin aviso a Pedro. La rotación sigue: "me gustas" es el
    // saludo #13 y trae la línea de la bici/scooter.
    console.log('\n(k-c) Cariños y piropos de Ricky ("hola mi amor", "eres hermosa", "me gustas"):');
    mark = sent.length;
    await incoming(RICKY, 'hola mi amor');
    m = since(mark, RICKY);
    st = readState(RICKY);
    check('"hola mi amor": responde cálida como Ricky', hasText(m, /¡Hola Ricky! Qué gusto saludarte/));
    check('"hola mi amor": NO es la redirección de acoso', !hasText(m, /En Blü Bee atendemos consultas sobre nuestras soluciones/));
    check('"hola mi amor": NO avisa a Pedro', kNoticesSince(mark).length === 0);
    check('"hola mi amor": NO incrementa obsceneCount', !st || st.obsceneCount === 0, `obsceneCount=${st && st.obsceneCount}`);
    mark = sent.length;
    await incoming(RICKY, 'eres hermosa');
    m = since(mark, RICKY);
    st = readState(RICKY);
    check('"eres hermosa": responde cálida como Ricky', hasText(m, /¡Hola Ricky! Qué gusto saludarte/));
    check('"eres hermosa": NO es la redirección de acoso', !hasText(m, /En Blü Bee atendemos consultas sobre nuestras soluciones/));
    check('"eres hermosa": NO avisa a Pedro', kNoticesSince(mark).length === 0);
    check('"eres hermosa": NO incrementa obsceneCount', !st || st.obsceneCount === 0, `obsceneCount=${st && st.obsceneCount}`);
    mark = sent.length;
    await incoming(RICKY, 'me gustas');
    m = since(mark, RICKY);
    st = readState(RICKY);
    check('"me gustas": responde cálida como Ricky', hasText(m, /¡Hola Ricky! Qué gusto saludarte/));
    check('"me gustas": saludo #13 trae la línea de la bici/scooter', hasText(m, /bici| scooter/));
    check('"me gustas": NO es la redirección de acoso', !hasText(m, /En Blü Bee atendemos consultas sobre nuestras soluciones/));
    check('"me gustas": NO avisa a Pedro', kNoticesSince(mark).length === 0);
    check('"me gustas": NO incrementa obsceneCount', !st || st.obsceneCount === 0, `obsceneCount=${st && st.obsceneCount}`);

    // (k-f) El negocio sigue igual con Ricky: base de conocimiento, demo y
    // video de despedida con "Ricky".
    console.log('\n(k-f) El negocio sigue igual con Ricky:');
    mark = sent.length;
    await incoming(RICKY, '¿qué es un beacon?');
    m = since(mark, RICKY);
    check('responde la pregunta de tecnología (beacons)', hasText(m, /beacon/i));
    check('NO avisa a Pedro por una pregunta de negocio', kNoticesSince(mark).length === 0, JSON.stringify(kNoticesSince(mark)));
    mark = sent.length;
    await incoming(RICKY, 'quiero agendar una demo');
    m = since(mark, RICKY);
    check('la demo pide la empresa (no el nombre, que ya es Ricky)', hasText(m, /¿De qué empresa nos escribe\?/));
    check('NO vuelve a pedir el nombre', !hasText(m, /nombre/i), JSON.stringify(texts(m)));
    mark = sent.length;
    await incoming(RICKY, 'Soy Ricky de la empresa Medicabiozone');
    m = since(mark, RICKY);
    st = readState(RICKY);
    const reqK = readFarewellRequest(RICKY);
    check('la empresa queda guardada', st && st.company === 'Medicabiozone', `company=${st && st.company}`);
    check('el nombre sigue siendo "Ricky"', st && st.name === 'Ricky', `name=${st && st.name}`);
    check('pregunta día/hora como Ricky', hasText(m, /Gracias, Ricky\. ¿Qué día y hora te conviene para la demostración\?/));
    check('la solicitud de video es para "Ricky"', !!reqK && reqK.kind === 'person' && reqK.name === 'Ricky', `request=${reqK && JSON.stringify(reqK)}`);
    check('el archivo del video es despedida-ricky.mp4', !!reqK && reqK.file === 'despedida-ricky.mp4', `file=${reqK && reqK.file}`);
    await incoming(RICKY, 'mañana a las 10');
    st = readState(RICKY);
    check('el pendiente de despedida es para "Ricky"', !!st && !!st.farewellPending && st.farewellPending.kind === 'person' && st.farewellPending.name === 'Ricky', `farewellPending=${st && JSON.stringify(st.farewellPending)}`);

    // (k-d) Control: las mismas frases de OTRA persona SÍ activan el límite
    // como antes; y la obscenidad genuina de Ricky TAMBIÉN activa el límite.
    const OTHER = '521111000060';
    mark = sent.length;
    await incoming(OTHER, 'eres hermosa');
    m = since(mark, OTHER);
    st = readState(OTHER);
    console.log('\n(k-d) Control: otra persona y obscenidad genuina de Ricky:');
    check('otra persona "eres hermosa": redirección (LIMIT_OBSCENE)', hasText(m, /En Blü Bee atendemos consultas sobre nuestras soluciones\. ¿En qué le puedo ayudar con eso\?/));
    check('otra persona "eres hermosa": avisa a Pedro', kNoticesSince(mark).length > 0);
    check('otra persona: obsceneCount = 1', st && st.obsceneCount === 1, `obsceneCount=${st && st.obsceneCount}`);
    mark = sent.length;
    await incoming(OTHER, 'me gustas');
    m = since(mark, OTHER);
    st = readState(OTHER);
    check('otra persona "me gustas": silencio (segunda vez)', replies(m).length === 0, JSON.stringify(replies(m)));
    check('otra persona "me gustas": avisa a Pedro', kNoticesSince(mark).length > 0);
    check('otra persona: obsceneCount = 2', st && st.obsceneCount === 2, `obsceneCount=${st && st.obsceneCount}`);
    mark = sent.length;
    await incoming(RICKY, 'eres un pendejo');
    m = since(mark, RICKY);
    st = readState(RICKY);
    check('Ricky "eres un pendejo": SÍ activa el límite (obscenidad genuina)', hasText(m, /En Blü Bee atendemos consultas sobre nuestras soluciones\. ¿En qué le puedo ayudar con eso\?/));
    check('Ricky "eres un pendejo": avisa a Pedro', kNoticesSince(mark).length > 0);
    check('Ricky: obsceneCount = 1', st && st.obsceneCount === 1, `obsceneCount=${st && st.obsceneCount}`);
    check('Ricky sigue siendo "Ricky" tras el límite', st && st.name === 'Ricky', `name=${st && st.name}`);

    // (k-g) Fútbol: la rotación incluye al América y a los equipos ingleses.
    // Ricky está en 'main' tras (k-d). Se lleva el contador hasta el
    // siguiente saludo con línea de fútbol (variante 5 = América, count ≡ 15
    // mod 21; variante 6 = equipos ingleses, count ≡ 18 mod 21) y se
    // comprueba que el saludo real menciona el fútbol. Son preguntas
    // abiertas: Daniela nunca afirma un resultado (no tiene marcadores).
    console.log('\n(k-g) Fútbol: el saludo menciona al América y a los equipos ingleses:');
    async function advanceVipCountTo(target) {
      let cur = (readState(RICKY) || {}).vipGreetingCount || 0;
      while (cur < target) {
        await incoming(RICKY, 'hola');
        cur = (readState(RICKY) || {}).vipGreetingCount || 0;
      }
    }
    let targetAmerica = (readState(RICKY) || {}).vipGreetingCount || 0;
    while (targetAmerica % 21 !== 15) targetAmerica += 1;
    await advanceVipCountTo(targetAmerica);
    mark = sent.length;
    await incoming(RICKY, 'hola');
    m = since(mark, RICKY);
    check('el saludo con línea de fútbol pregunta por el América', hasText(m, /¿Cómo le fue al América\?/), JSON.stringify(texts(m)));
    check('el saludo de fútbol sigue siendo cálido ("¡Hola Ricky!")', hasText(m, /¡Hola Ricky! Qué gusto saludarte/));
    let targetEnglish = (readState(RICKY) || {}).vipGreetingCount || 0;
    while (targetEnglish % 21 !== 18) targetEnglish += 1;
    await advanceVipCountTo(targetEnglish);
    mark = sent.length;
    await incoming(RICKY, 'hola');
    m = since(mark, RICKY);
    check('el saludo con línea de fútbol pregunta por el Manchester United y el Tottenham', hasText(m, /¿Ganaron el Manchester United y el Tottenham\?/), JSON.stringify(texts(m)));
    check('el saludo de fútbol inglés sigue siendo cálido ("¡Hola Ricky!")', hasText(m, /¡Hola Ricky! Qué gusto saludarte/));

    // (k-h) Nombre completo prohibido: "Richard William Roach Sánchez"
    // NUNCA se usa para dirigirse a Ricky, aunque él lo escriba. Daniela
    // siempre le dice "Ricky". Se prueba a nivel unitario (isVipForbiddenName
    // y vipSafeParsedName) y en los tres puntos de captura del nombre
    // (primer mensaje, 'awaiting_name_company' y 'demo_capture').
    console.log('\n(k-h) Nombre completo prohibido ("Richard William Roach Sánchez"):');
    check('isVipForbiddenName("Richard William Roach Sánchez") = true', daniela.isVipForbiddenName('Richard William Roach Sánchez') === true);
    check('isVipForbiddenName("Richard William Roach") = true (parseo a 3 palabras)', daniela.isVipForbiddenName('Richard William Roach') === true);
    check('isVipForbiddenName("Richard William") = true (parseo a 2 palabras)', daniela.isVipForbiddenName('Richard William') === true);
    check('isVipForbiddenName("Ricardo") = false', daniela.isVipForbiddenName('Ricardo') === false);
    check('isVipForbiddenName("Ricardo Roach") = false', daniela.isVipForbiddenName('Ricardo Roach') === false);
    check('isVipForbiddenName("Ricky") = false', daniela.isVipForbiddenName('Ricky') === false);
    check('isVipForbiddenName("") = false', daniela.isVipForbiddenName('') === false);
    check('isVipForbiddenName(null) = false', daniela.isVipForbiddenName(null) === false);
    check('vipSafeParsedName(RICKY, "Richard William Roach") = "Ricky"', daniela.vipSafeParsedName(RICKY, 'Richard William Roach') === 'Ricky');
    check('vipSafeParsedName(RICKY, "Ricardo") = "Ricardo" (solo se reemplaza el prohibido)', daniela.vipSafeParsedName(RICKY, 'Ricardo') === 'Ricardo');
    check('vipSafeParsedName(OTHER, "Richard William Roach") no cambia (solo aplica a Ricky)', daniela.vipSafeParsedName(OTHER, 'Richard William Roach') === 'Richard William Roach');
    check('config.vipRicky.forbiddenFullName = "Richard William Roach Sánchez"', config.vipRicky && config.vipRicky.forbiddenFullName === 'Richard William Roach Sánchez');
    check('config.vipRicky.football.team = "América"', config.vipRicky && config.vipRicky.football && config.vipRicky.football.team === 'América');
    check('config.vipRicky.football.englishTeams incluye Manchester United y Tottenham', config.vipRicky && config.vipRicky.football && Array.isArray(config.vipRicky.football.englishTeams) && config.vipRicky.football.englishTeams.includes('Manchester United') && config.vipRicky.football.englishTeams.includes('Tottenham'));

    // Resetea la conversación de Ricky (borra su estado y su solicitud de
    // despedida): vuelve a 'new' con el contador en 0.
    function resetRickyState() {
      const f = path.join(tmpDir, `${RICKY}.json`);
      if (fs.existsSync(f)) fs.unlinkSync(f);
      const req = path.join(tmpDir, `despedida-pendiente-${RICKY}.json`);
      if (fs.existsSync(req)) fs.unlinkSync(req);
    }

    // Escenario 1: primer mensaje con el nombre completo.
    resetRickyState();
    mark = sent.length;
    await incoming(RICKY, 'Hola, soy Richard William Roach Sánchez');
    m = since(mark, RICKY);
    st = readState(RICKY);
    check('primer mensaje con el nombre completo: lo saluda como Ricky', hasText(m, /Mucho gusto, Ricky/));
    check('primer mensaje con el nombre completo: NO dice "Richard"', !hasText(m, /Richard/));
    check('primer mensaje con el nombre completo: NO dice "William"', !hasText(m, /William/));
    check('primer mensaje con el nombre completo: NO dice "Roach"', !hasText(m, /Roach/));
    check('primer mensaje con el nombre completo: el nombre es "Ricky"', st && st.name === 'Ricky', `name=${st && st.name}`);
    check('primer mensaje con el nombre completo: el trato es "Ricky"', st && st.preferredName === 'Ricky', `preferredName=${st && st.preferredName}`);

    // Escenario 2: en 'awaiting_name_company' ("Me llamo Richard William
    // Roach Sánchez").
    resetRickyState();
    await incoming(RICKY, 'hola Dani');
    st = readState(RICKY);
    check('preparación: tras "hola Dani" está en awaiting_name_company', st && st.stage === 'awaiting_name_company', `stage=${st && st.stage}`);
    mark = sent.length;
    await incoming(RICKY, 'Me llamo Richard William Roach Sánchez');
    m = since(mark, RICKY);
    st = readState(RICKY);
    check('"Me llamo Richard William Roach Sánchez": lo saluda como Ricky', hasText(m, /Mucho gusto, Ricky/));
    check('"Me llamo Richard William Roach Sánchez": NO dice "Richard"', !hasText(m, /Richard/));
    check('"Me llamo Richard William Roach Sánchez": NO dice "William"', !hasText(m, /William/));
    check('"Me llamo Richard William Roach Sánchez": el nombre es "Ricky"', st && st.name === 'Ricky', `name=${st && st.name}`);

    // Escenario 3: en 'demo_capture' ("Richard William Roach Sánchez").
    // Se llega por el flujo normal: 'de tú' → correo → 'quiero agendar
    // una demo' (pide la empresa) → el nombre completo.
    await incoming(RICKY, 'de tú');
    await incoming(RICKY, 'rroach@medicabiozone.com, WhatsApp al mismo número');
    mark = sent.length;
    await incoming(RICKY, 'quiero agendar una demo');
    m = since(mark, RICKY);
    check('preparación: la demo pide la empresa (no el nombre)', hasText(m, /¿De qué empresa nos escribe\?/));
    mark = sent.length;
    await incoming(RICKY, 'Richard William Roach Sánchez');
    m = since(mark, RICKY);
    st = readState(RICKY);
    check('"Richard William Roach Sánchez" en demo_capture: le agradece como Ricky', hasText(m, /Gracias, Ricky\. ¿Qué día y hora te conviene para la demostración\?/));
    check('"Richard William Roach Sánchez" en demo_capture: NO dice "Richard"', !hasText(m, /Richard/));
    check('"Richard William Roach Sánchez" en demo_capture: NO dice "William"', !hasText(m, /William/));
    check('"Richard William Roach Sánchez" en demo_capture: el nombre es "Ricky"', st && st.name === 'Ricky', `name=${st && st.name}`);

    // ---------- (l) Notas de voz con Groq Whisper gratis (v3.5, 2026-11-11)
    // Prioridad: Groq > OpenAI > pedir que escriban. Se espía global.fetch
    // (sin red real) y se hace que downloadMedia sí cree el archivo temporal,
    // para que la transcripción llegue a llamar al proveedor.
    const realFetch = global.fetch;
    const fetchCalls = [];
    global.fetch = async (url, opts) => {
      fetchCalls.push({
        url,
        model: opts && opts.body && typeof opts.body.get === 'function' ? opts.body.get('model') : null,
        language: opts && opts.body && typeof opts.body.get === 'function' ? opts.body.get('language') : null,
        auth: opts && opts.headers ? opts.headers.Authorization : null,
      });
      return { ok: true, json: async () => ({ text: 'Hola' }) };
    };
    const realDownloadMedia = wa.downloadMedia;
    wa.downloadMedia = async (id, dest) => { fs.writeFileSync(dest, Buffer.from('audio de prueba')); return dest; };

    // (l-a) Con clave de Groq (aunque también haya de OpenAI) -> usa Groq.
    config.groqApiKey = 'gsk_test_groq_123';
    config.openaiApiKey = 'sk-test-openai-456';
    const GROQ = '521111000013';
    mark = sent.length;
    await incomingAudio(GROQ);
    m = since(mark, GROQ);
    console.log('\n(l) Notas de voz con Groq (v3.5):');
    check('con Groq: llama al endpoint de Groq', fetchCalls.some((c) => c.url === 'https://api.groq.com/openai/v1/audio/transcriptions'), JSON.stringify(fetchCalls.map((c) => c.url)));
    check('con Groq: usa el modelo whisper-large-v3', fetchCalls.some((c) => c.model === 'whisper-large-v3'), JSON.stringify(fetchCalls.map((c) => c.model)));
    check('con Groq: idioma español', fetchCalls.some((c) => c.language === 'es'));
    check('con Groq: autoriza con la clave de Groq', fetchCalls.some((c) => c.auth === 'Bearer gsk_test_groq_123'), JSON.stringify(fetchCalls.map((c) => c.auth)));
    check('con Groq: NO llama a OpenAI aunque haya clave', !fetchCalls.some((c) => c.url === 'https://api.openai.com/v1/audio/transcriptions'));
    check('con Groq: procesa el texto transcrito (saludo de Daniela)', hasText(m, /soy Daniela/i), JSON.stringify(texts(m)));
    check('con Groq: NO pide que escriban', !hasText(m, /no puedo escuchar notas de voz/));

    // (l-b) Sin Groq pero con OpenAI -> usa OpenAI (whisper-1) como antes.
    fetchCalls.length = 0;
    config.groqApiKey = '';
    config.openaiApiKey = 'sk-test-openai-456';
    const OAI = '521111000014';
    mark = sent.length;
    await incomingAudio(OAI);
    m = since(mark, OAI);
    console.log('    (sin Groq, con OpenAI):');
    check('sin Groq: llama al endpoint de OpenAI', fetchCalls.some((c) => c.url === 'https://api.openai.com/v1/audio/transcriptions'), JSON.stringify(fetchCalls.map((c) => c.url)));
    check('sin Groq: usa el modelo whisper-1', fetchCalls.some((c) => c.model === 'whisper-1'), JSON.stringify(fetchCalls.map((c) => c.model)));
    check('sin Groq: autoriza con la clave de OpenAI', fetchCalls.some((c) => c.auth === 'Bearer sk-test-openai-456'));
    check('sin Groq: NO llama a Groq', !fetchCalls.some((c) => c.url === 'https://api.groq.com/openai/v1/audio/transcriptions'));
    check('sin Groq: procesa el texto transcrito (saludo de Daniela)', hasText(m, /soy Daniela/i));
    check('sin Groq: NO pide que escriban', !hasText(m, /no puedo escuchar notas de voz/));

    // (l-c) Sin ninguna clave -> pide que escriban y NO llama a ningún proveedor.
    fetchCalls.length = 0;
    config.groqApiKey = '';
    config.openaiApiKey = '';
    const SIN = '521111000015';
    mark = sent.length;
    await incomingAudio(SIN);
    m = since(mark, SIN);
    console.log('    (sin ninguna clave):');
    check('sin claves: pide amablemente que escriban', hasText(m, /Perdón, ahorita no puedo escuchar notas de voz\. ¿Me lo puedes escribir, por favor\? Así te atiendo mejor\./));
    check('sin claves: NO llama a ningún proveedor', fetchCalls.length === 0, `${fetchCalls.length} llamadas`);
    check('sin claves: sí responde (no se queda callada)', replies(m).length > 0);

    // Restaurar stubs y claves.
    global.fetch = realFetch;
    wa.downloadMedia = realDownloadMedia;
    config.groqApiKey = '';
    config.openaiApiKey = '';

    // ---------- (m) El nombre del bot nunca es el nombre del contacto
    // Caso real 2026-11-11: Ana le escribió "Hola" a Daniela y Daniela le
    // contestó "Hola, Daniela, soy Daniela, la asistente de Blü Bee
    // Technologies. ¿En qué le puedo ayudar?" La causa: el estado guardado
    // de Ana traía name="Daniela" (bug de extracción del 2026-11-10, cuando
    // "hola Daniela soy Ana" le guardó "Daniela" como nombre) y el saludo
    // por nombre lo insertaba tal cual. El saludo debe tratar "Daniela" /
    // "Dani" como si no hubiera nombre (ver contactDisplayName).
    console.log('\n(m) El nombre del bot nunca es el nombre del contacto:');
    check('isBotName("Daniela") = true', daniela.isBotName('Daniela') === true);
    check('isBotName("Dani") = true', daniela.isBotName('Dani') === true);
    check('isBotName("dAnIeLa") = true (sin importar mayúsculas)', daniela.isBotName('dAnIeLa') === true);
    check('isBotName("Ana") = false', daniela.isBotName('Ana') === false);
    check('isBotName("") = false', daniela.isBotName('') === false);
    check('contactDisplayName ignora name="Daniela"', daniela.contactDisplayName({ name: 'Daniela' }) === '');
    check('contactDisplayName ignora preferredName="Daniela" y usa name', daniela.contactDisplayName({ preferredName: 'Daniela', name: 'Ana' }) === 'Ana');
    check('contactDisplayName ignora ambos si son el bot', daniela.contactDisplayName({ preferredName: 'Dani', name: 'Daniela' }) === '');
    check('contactDisplayName usa un nombre válido', daniela.contactDisplayName({ preferredName: 'Mari', name: 'María' }) === 'Mari');

    // (m-a) Contacto que vuelve con nombre guardado "Daniela" dice "Hola".
    const STALE = '521111000016';
    await driveToMain(STALE, 'Soy Ana de la empresa La Esquina');
    // Simula el estado viejo en vivo (bug del 2026-11-10): el contacto solo
    // se conoce como "Daniela" (nombre y preferredName). Ambos se sobre-
    // escriben: driveToMain deja preferredName="Ana" y hay que taparlo.
    const staleFile = path.join(tmpDir, `${STALE}.json`);
    const staleSt = JSON.parse(fs.readFileSync(staleFile, 'utf8'));
    staleSt.name = 'Daniela';
    staleSt.preferredName = 'Daniela';
    fs.writeFileSync(staleFile, JSON.stringify(staleSt, null, 2));
    mark = sent.length;
    await incoming(STALE, 'Hola');
    m = since(mark, STALE);
    console.log('    (nombre guardado "Daniela", dice "Hola"):');
    check('saludo limpio: "Hola, soy Daniela, la asistente..."', hasText(m, /Hola, soy Daniela, la asistente de Blü Bee Technologies\. ¿En qué le puedo ayudar\?/));
    check('NO duplica el nombre ("Hola, Daniela, soy Daniela")', !hasText(m, /Hola, Daniela, soy Daniela/));
    check('NO dice "Mucho gusto, Daniela"', !hasText(m, /Mucho gusto, Daniela/));

    // (m-b) preferredName "Daniela" se ignora y se usa el name válido ("Ana").
    const STALE2 = '521111000017';
    await driveToMain(STALE2, 'Soy Ana de la empresa La Esquina');
    const staleFile2 = path.join(tmpDir, `${STALE2}.json`);
    const staleSt2 = JSON.parse(fs.readFileSync(staleFile2, 'utf8'));
    staleSt2.preferredName = 'Daniela';
    fs.writeFileSync(staleFile2, JSON.stringify(staleSt2, null, 2));
    mark = sent.length;
    await incoming(STALE2, 'Hola');
    m = since(mark, STALE2);
    console.log('    (preferredName "Daniela", name "Ana", dice "Hola"):');
    check('saludo por el name válido: "Hola, Ana, soy Daniela..."', hasText(m, /Hola, Ana, soy Daniela, la asistente de Blü Bee Technologies\. ¿En qué le puedo ayudar\?/));
    check('NO duplica el nombre', !hasText(m, /Hola, Daniela, soy Daniela/));

    // (m-c) Control: nombre válido "Ana" sí se usa en el saludo por nombre.
    const OKNAME = '521111000018';
    await driveToMain(OKNAME, 'Soy Ana de la empresa La Esquina');
    mark = sent.length;
    await incoming(OKNAME, 'Hola');
    m = since(mark, OKNAME);
    console.log('    (nombre guardado "Ana", dice "Hola"):');
    check('saludo por nombre: "Hola, Ana, soy Daniela..."', hasText(m, /Hola, Ana, soy Daniela, la asistente de Blü Bee Technologies\. ¿En qué le puedo ayudar\?/));

    // (m-d) Perfil de WhatsApp "Daniela" no se usa como nombre del contacto.
    const PROF = '521111000019';
    fs.writeFileSync(path.join(tmpDir, `${PROF}.json`), JSON.stringify({
      phone: PROF, stage: 'main', name: null, preferredName: null, formality: 'usted',
    }, null, 2));
    mark = sent.length;
    await daniela.handleMessage({ from: PROF, type: 'text', text: { body: 'Hola' }, profileName: 'Daniela' });
    m = since(mark, PROF);
    console.log('    (perfil de WhatsApp "Daniela", dice "Hola"):');
    check('saludo limpio (sin duplicar)', hasText(m, /Hola, soy Daniela, la asistente de Blü Bee Technologies\. ¿En qué le puedo ayudar\?/));
    check('NO duplica el nombre', !hasText(m, /Hola, Daniela, soy Daniela/));

    // ---------- Sin botones en todo el flujo inteligente
    const buttons = sent.filter((s) => s.kind === 'buttons');
    console.log('\n(verificación global):');
    check('menú de 3 botones NUNCA enviado (0 sendButtons)', buttons.length === 0, `${buttons.length} botones enviados`);

    console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
    console.log('Estado temporal en:', tmpDir);
    cleanupVideos(); // process.exit no ejecuta el finally: limpiar aquí
    process.exit(fail === 0 ? 0 : 1);
  } finally {
    cleanupVideos();
  }
})().catch((e) => {
  cleanupVideos();
  console.error('ERROR en las pruebas:', e);
  process.exit(2);
});
