// Pruebas de "Daniela inteligente" (v3, 2026-11-11): base de conocimiento,
// sector, flujo ágil intent-first, contactos personales / temas que no son
// Blü Bee, notas de voz (Whisper) y video de despedida personalizado.
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
function makeFarewellVideo(name) {
  const file = daniela.farewellVideoFileName(name);
  const full = path.join(__dirname, 'media', file);
  fs.mkdirSync(path.join(__dirname, 'media'), { recursive: true });
  fs.writeFileSync(full, 'video de prueba');
  createdVideos.push(full);
  return full;
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
