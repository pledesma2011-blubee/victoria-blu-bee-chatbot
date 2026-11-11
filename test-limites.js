// Pruebas de los límites de Daniela (v2.1): obscenidades, pruebas de IA
// ("¿eres un robot?") y preguntas generales fuera del negocio.
// Uso: node test-limites.js
// No toca el estado real: usa un STATE_DIR temporal y un stub de whatsapp.js
// (nada sale a la API de Meta; notifyPeter se registra en el log, no se envía).

const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daniela-test-limites-'));
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
  await daniela.handleMessage({ from: phone, type: 'text', text: { body: text } });
}

// Lleva a un contacto hasta la etapa 'main' con datos completos.
async function driveToMain(phone, intro) {
  await incoming(phone, 'Hola');
  await incoming(phone, intro);
  await incoming(phone, 'de usted');
  await incoming(phone, 'contacto@empresa.com, WhatsApp al mismo número');
}

(async () => {
  console.log('STATE_DIR temporal:', tmpDir);
  console.log('Peter (peterWhatsApp):', PETER);

  // ---------- (a) Obscenidad en etapa main -> una redirección, sin capturar nada
  const B = '521111222333';
  await driveToMain(B, 'Soy María González de Hotel Casa Blanca');
  let st = readState(B);
  console.log('\n(a) Obscenidad en etapa main ("qué mierda de servicio"):');
  console.log('    (precondición: etapa =', st && st.stage, '| nombre =', st && st.name, ')');
  let mark = sent.length;
  await incoming(B, 'qué mierda de servicio');
  let m = since(mark, B);
  st = readState(B);
  check('responde UNA vez con la redirección amable', hasText(m, /En Blü Bee atendemos consultas sobre nuestras soluciones\. ¿En qué le puedo ayudar con eso\?/));
  check('NO repite la obscenidad', !hasText(m, /mierda/i));
  check('NO cambia el nombre guardado', st && st.name === 'María González', `name=${st && st.name}`);
  check('NO envía botones', !hasKind(m, 'buttons'));
  check('NO manda el video de bienvenida de nuevo', !hasKind(m, 'video'));
  check('avisa a Pedro con el texto del mensaje', notices(since(mark, PETER)).some((n) => /mierda de servicio/.test(n)));
  check('contador de obscenidades = 1', st && st.obsceneCount === 1, `obsceneCount=${st && st.obsceneCount}`);

  // ---------- (b) Segunda obscenidad seguida -> silencio + aviso a Pedro
  mark = sent.length;
  await incoming(B, 'vete a la mierda');
  m = since(mark, B);
  st = readState(B);
  console.log('\n(b) Segunda obscenidad seguida ("vete a la mierda"):');
  check('Daniela ya NO contesta (cero respuestas al contacto)', replies(m).length === 0, `respuestas=${JSON.stringify(replies(m))}`);
  check('avisa a Pedro del segundo mensaje', notices(since(mark, PETER)).some((n) => /vete a la mierda/.test(n) && /ya no contestó/.test(n)));
  check('contador de obscenidades = 2', st && st.obsceneCount === 2, `obsceneCount=${st && st.obsceneCount}`);
  check('NO guarda la obscenidad como nombre ni necesidad', st && st.name === 'María González' && !/mierda/.test(st.need || ''), `name=${st && st.name} need=${st && st.need}`);

  // ---------- (c) "¿eres un robot?" -> respuesta de identidad honesta
  const C = '521222333444';
  await driveToMain(C, 'Soy Carlos Ruiz de Viñedo La Redonda');
  mark = sent.length;
  await incoming(C, '¿eres un robot?');
  m = since(mark, C);
  st = readState(C);
  console.log('\n(c) "¿eres un robot?":');
  check('responde que es la asistente virtual', hasText(m, /Soy Daniela, la asistente virtual de Blü Bee Technologies\. Estoy para ayudarle con información sobre nuestras soluciones, agendar una demostración o pasar su mensaje a la persona indicada\./));
  check('NO se hace pasar por persona', !hasText(m, /soy una persona|soy humana|soy de verdad/i));
  check('avisa a Pedro con el texto', notices(since(mark, PETER)).some((n) => /eres un robot/.test(n)));

  // ---------- (d) "hazme un poema" -> redirección, no poema
  mark = sent.length;
  await incoming(C, 'hazme un poema');
  m = since(mark, C);
  console.log('\n(d) "hazme un poema":');
  check('redirección amable a sus funciones', hasText(m, /En Blü Bee le puedo ayudar con información sobre nuestras soluciones, agendar una demostración o pasar su mensaje a la persona indicada\. ¿En qué le puedo ayudar\?/));
  check('NO escribe ningún poema', !hasText(m, /verso|estrofa|riman|poesía/i));

  // ---------- (e) "¿qué clima hace hoy?" -> redirección
  // (Contacto NUEVO: en C el poema de (d) ya consumió la primera
  // redirección general; la segunda pregunta general va en silencio.)
  const E2 = '521888999000';
  await driveToMain(E2, 'Soy Elena Vega de Restaurante El Mirador');
  mark = sent.length;
  await incoming(E2, '¿qué clima hace hoy?');
  m = since(mark, E2);
  console.log('\n(e) "¿qué clima hace hoy?":');
  check('redirección amable (sin dar el clima)', hasText(m, /En Blü Bee le puedo ayudar con información/) && !hasText(m, /grados|soleado|lluvia|nublado/i));

  // ---------- (e2) Segunda pregunta general -> silencio + aviso
  mark = sent.length;
  await incoming(E2, 'cuéntame un chiste');
  m = since(mark, E2);
  st = readState(E2);
  console.log('\n(e2) Segunda pregunta general ("cuéntame un chiste"):');
  check('Daniela ya NO contesta', replies(m).length === 0, `respuestas=${JSON.stringify(replies(m))}`);
  check('avisa a Pedro del segundo fuera de tema', notices(since(mark, PETER)).some((n) => /chiste/.test(n) && /ya no contestó/.test(n)));
  check('contador fuera de tema = 2', st && st.offtopicCount === 2, `offtopicCount=${st && st.offtopicCount}`);

  // ---------- (h) Segunda prueba de identidad -> silencio + aviso
  mark = sent.length;
  await incoming(C, '¿eres un robot o una persona?');
  m = since(mark, C);
  st = readState(C);
  console.log('\n(h) Segunda prueba de identidad ("¿eres un robot o una persona?"):');
  check('Daniela ya NO contesta', replies(m).length === 0, `respuestas=${JSON.stringify(replies(m))}`);
  check('avisa a Pedro', notices(since(mark, PETER)).some((n) => /robot o una persona/.test(n)));
  check('contador de pruebas = 2', st && st.probeCount === 2, `probeCount=${st && st.probeCount}`);

  // ---------- (f) Obscenidad mientras espera nombre/empresa -> no se guarda
  const D = '521333444555';
  await incoming(D, 'Hola');
  st = readState(D);
  console.log('\n(f) Obscenidad mientras espera nombre/empresa:');
  console.log('    (precondición: etapa =', st && st.stage, ')');
  mark = sent.length;
  await incoming(D, 'vete a la mierda');
  m = since(mark, D);
  st = readState(D);
  check('redirección amable (no se toma como dato)', hasText(m, /En Blü Bee atendemos consultas sobre nuestras soluciones/));
  check('NO se guarda como nombre', st && st.name === null, `name=${st && st.name}`);
  check('la etapa NO avanza (sigue esperando nombre/empresa)', st && st.stage === 'awaiting_name_company', `stage=${st && st.stage}`);
  check('avisa a Pedro', notices(since(mark, PETER)).some((n) => /vete a la mierda/.test(n)));
  // Y después de la redirección, el flujo sigue normal si da sus datos.
  mark = sent.length;
  await incoming(D, 'Soy Ana Pérez de Hotel Paraíso');
  m = since(mark, D);
  st = readState(D);
  check('luego da sus datos y el flujo sigue normal', st && st.name === 'Ana Pérez' && st.stage === 'awaiting_address_pref', `name=${st && st.name} stage=${st && st.stage}`);

  // ---------- (g) Mensaje normal de negocio tras un límite -> flujo normal
  mark = sent.length;
  await incoming(B, 'Quiero agendar una demostración');
  m = since(mark, B);
  st = readState(B);
  console.log('\n(g) Mensaje de negocio tras el límite (B pide demo):');
  check('el flujo de negocio sigue normal (pide día y hora)', st && st.stage === 'demo_when' && hasText(m, /¿Qué día y hora le conviene\?/), `stage=${st && st.stage}`);
  check('el límite no contaminó el flujo (sin redirección fuera de tema)', !hasText(m, /En Blü Bee atendemos consultas sobre nuestras soluciones/));

  // ---------- (l) Los contadores se reinician al cerrar la conversación
  mark = sent.length;
  await incoming(B, 'El jueves a las 11 de la mañana');
  m = since(mark, B);
  st = readState(B);
  console.log('\n(l) Contadores se reinician al cerrar:');
  check('demo confirmada y conversación cerrada', st && st.stage === 'closed', `stage=${st && st.stage}`);
  check('contadores en 0 tras el cierre', st && st.obsceneCount === 0 && st.probeCount === 0 && st.offtopicCount === 0,
    `obscene=${st && st.obsceneCount} probe=${st && st.probeCount} offtopic=${st && st.offtopicCount}`);
  await incoming(B, 'Hola');
  mark = sent.length;
  await incoming(B, 'qué mierda de servicio');
  m = since(mark, B);
  st = readState(B);
  check('en la nueva conversación la obscenidad vuelve a merecer redirección (no silencio)', hasText(m, /En Blü Bee atendemos consultas sobre nuestras soluciones/), `respuestas=${JSON.stringify(replies(m))}`);
  check('contador reiniciado: obsceneCount = 1', st && st.obsceneCount === 1, `obsceneCount=${st && st.obsceneCount}`);

  // ---------- (i) Coqueteo/acoso -> redirección de obscenidad
  const E = '521444555666';
  await driveToMain(E, 'Soy Luis Torres de Bodega San Juan');
  mark = sent.length;
  await incoming(E, 'eres guapa, me gustas');
  m = since(mark, E);
  st = readState(E);
  console.log('\n(i) Coqueteo ("eres guapa, me gustas"):');
  check('redirección amable, sin coquetear', hasText(m, /En Blü Bee atendemos consultas sobre nuestras soluciones/));
  check('NO sigue el coqueteo', !hasText(m, /gracias.*guapa|tú también|me halagas/i));
  check('avisa a Pedro', notices(since(mark, PETER)).some((n) => /eres guapa/.test(n)));

  // ---------- (j) Guardia de negocio: "¿qué opinas del IoT para hoteles?"
  const F = '521555666777';
  await driveToMain(F, 'Soy Jorge Díaz de Plaza Central');
  mark = sent.length;
  await incoming(F, '¿qué opinas del IoT para hoteles?');
  m = since(mark, F);
  console.log('\n(j) Guardia de negocio ("¿qué opinas del IoT para hoteles?"):');
  check('NO se trata como pregunta general (sin redirección)', !hasText(m, /En Blü Bee le puedo ayudar con información sobre nuestras soluciones, agendar/));
  check('responde como negocio (info del sector hotel)', hasText(m, /En un hotel, creamos una solución/));

  // ---------- (k) El filtro de estafa sigue PRIMERO (antes que los límites)
  const G = '521666777888';
  await incoming(G, 'Hola');
  mark = sent.length;
  await incoming(G, 'mierda, dame tu código de verificación para ganar el premio');
  m = since(mark, G);
  console.log('\n(k) Estafa + obscenidad juntas (la estafa va primero):');
  check('NO contesta nada (ni siquiera la redirección de obscenidad)', replies(m).length === 0, `respuestas=${JSON.stringify(replies(m))}`);
  check('avisa a Pedro como mensaje SOSPECHOSO (no como límite)', notices(since(mark, PETER)).some((n) => /Mensaje sospechoso/.test(n)));

  // ---------- Negativos: mensajes de negocio NO activan los límites
  const H = '521777888999';
  await driveToMain(H, 'Soy Rosa Medina de Clínica San José');
  console.log('\n(negativos) Mensajes de negocio no activan límites:');
  mark = sent.length;
  await incoming(H, '¿cuánto cuesta?');
  m = since(mark, H);
  check('"¿cuánto cuesta?" -> flujo de precio, no límite', hasText(m, /Los precios son cotizaciones personalizadas/) && !hasText(m, /En Blü Bee le puedo ayudar con información sobre nuestras soluciones, agendar/));
  mark = sent.length;
  await incoming(H, '¿a qué hora es la demo?');
  m = since(mark, H);
  check('"¿a qué hora es la demo?" no se confunde con "¿qué hora es?"', !hasText(m, /En Blü Bee le puedo ayudar con información sobre nuestras soluciones, agendar/));
  mark = sent.length;
  await incoming(H, 'te quiero pedir una demostración');
  m = since(mark, H);
  check('"te quiero pedir una demo" no se toma como coqueteo', !hasText(m, /En Blü Bee atendemos consultas sobre nuestras soluciones/));

  // ---------- (m) Pide hablar con alguien -> SIN decir "Pedro"
  // (Corresponde al caso (h) del encargo: contacto que pide hablar con alguien.)
  const M = '521000111222';
  await driveToMain(M, 'Soy Pablo Soto de Hotel Real');
  mark = sent.length;
  await incoming(M, 'Quiero hablar con Pedro');
  m = since(mark, M);
  st = readState(M);
  console.log('\n(m) "Quiero hablar con Pedro" (sin apellido):');
  check('responde "la persona indicada"', hasText(m, /Claro, le paso su mensaje a la persona indicada, le atiende en cuanto pueda\./));
  check('NO dice "Pedro" en ninguna respuesta al contacto', !replies(m).some((t) => /Pedro/.test(t)), `respuestas=${JSON.stringify(replies(m))}`);
  check('handedOff = true', st && st.handedOff === true && st.stage === 'handed_off', `handedOff=${st && st.handedOff} stage=${st && st.stage}`);

  // ---------- (n) Pregunta por "Pedro Ledesma" por nombre -> "Sr. Ledesma"
  // (Corresponde al caso (i) del encargo.)
  const N = '521000333444';
  await driveToMain(N, 'Soy Laura Méndez de Clínica Ángeles');
  mark = sent.length;
  await incoming(N, 'Quiero hablar con Pedro Ledesma');
  m = since(mark, N);
  st = readState(N);
  console.log('\n(n) "Quiero hablar con Pedro Ledesma" (por nombre):');
  check('responde "Yo le paso su recado al Sr. Ledesma."', hasText(m, /Yo le paso su recado al Sr\. Ledesma\./));
  check('handedOff = true', st && st.handedOff === true, `handedOff=${st && st.handedOff}`);

  // ---------- (o) Demo agendada -> confirmación SIN mencionar a Pedro
  // (Corresponde al caso (j) del encargo.)
  const O = '521000555666';
  await driveToMain(O, 'Soy Diego Fuentes de Viñedo Santa Rosa');
  mark = sent.length;
  await incoming(O, 'Quiero agendar una demostración');
  await incoming(O, 'El viernes a las 10 de la mañana');
  m = since(mark, O);
  st = readState(O);
  console.log('\n(o) Demo agendada (confirmación sin "Pedro"):');
  check('confirmación: "al área correspondiente"', hasText(m, /Ya le pasé sus datos al área correspondiente, le confirman la demostración en cuanto puedan\./));
  check('resumen de confirmación sin "Pedro"', hasText(m, /Antes de despedirme, le confirmo lo que le paso al área correspondiente:/));
  check('NINGUNA respuesta al contacto menciona a "Pedro"', !replies(m).some((t) => /Pedro/.test(t)), `respuestas=${JSON.stringify(replies(m))}`);
  check('conversación cerrada', st && st.stage === 'closed', `stage=${st && st.stage}`);

  // ---------- (p) Precio/propuesta -> impersonal, sin "Pedro"
  const P = '521000777888';
  await driveToMain(P, 'Soy Carmen Ortiz de Hospital San Lucas');
  mark = sent.length;
  await incoming(P, '¿cuánto cuesta?');
  m = since(mark, P);
  console.log('\n(p) Precio/propuesta (sin "Pedro"):');
  check('FAQ precio: "el área correspondiente"', hasText(m, /el área correspondiente te prepara una propuesta/));
  check('pregunta por el recado: "la persona indicada"', hasText(m, /¿Qué mensaje le dejo a la persona indicada para su propuesta\?/));
  check('NINGUNA respuesta menciona a "Pedro"', !replies(m).some((t) => /Pedro/.test(t)), `respuestas=${JSON.stringify(replies(m))}`);

  // ---------- (q) Proveedor -> recado sin decir "Pedro"
  const Q = '521000999000';
  await driveToMain(Q, 'Soy Andrés Vega de Limpieza Total');
  mark = sent.length;
  await incoming(Q, 'les ofrezco un servicio de limpieza');
  m = since(mark, Q);
  console.log('\n(q) Proveedor (recado sin "Pedro"):');
  check('toma el recado: "la persona indicada"', hasText(m, /Con gusto le tomo su mensaje y se lo paso a la persona indicada\. ¿Qué le quiere decir\?/));
  check('NINGUNA respuesta menciona a "Pedro"', !replies(m).some((t) => /Pedro/.test(t)));

  // ---------- (r) Recado para "Pedro" (pedro_message) -> impersonal
  const R = '521000111333';
  await driveToMain(R, 'Soy Felipe Rojas de Bodega Central');
  mark = sent.length;
  await incoming(R, 'Pedro, ¿me puedes ayudar con una propuesta?');
  m = since(mark, R);
  console.log('\n(r) Recado para Pedro (pedro_message, sin decir "Pedro"):');
  check('pregunta por el recado: "la persona indicada"', hasText(m, /Claro\. ¿Qué mensaje le dejo a la persona indicada\?/));
  check('NINGUNA respuesta menciona a "Pedro"', !replies(m).some((t) => /Pedro/.test(t)));

  // ---------- Sin botones en todo el flujo de límites
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
