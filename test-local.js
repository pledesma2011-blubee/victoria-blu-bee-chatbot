// Prueba local de Victoria SIN llamar a la API de WhatsApp.
// Simula una conversación completa e imprime lo que Victoria mandaría.
// Uso: node test-local.js

// Parchear el cliente de WhatsApp ANTES de cargar victoria.js
const wa = require('./whatsapp');
const sent = [];
wa.sendText = async (to, text) => {
  sent.push({ to, tipo: 'texto', text });
  console.log(`\n📩 A ${to} (texto):\n${text}`);
};
wa.sendVideo = async (to, file, caption) => {
  sent.push({ to, tipo: 'video', file, caption });
  console.log(`\n🎬 A ${to} (video): ${file}${caption ? ` — "${caption}"` : ''}`);
};
wa.sendAudio = async (to, file) => {
  sent.push({ to, tipo: 'audio', file });
  console.log(`\n🎙️ A ${to} (nota de voz): ${file}`);
};
wa.sendButtons = async (to, text, buttons) => {
  sent.push({ to, tipo: 'botones', text, buttons });
  console.log(`\n🔘 A ${to} (botones): ${text}\n   [${buttons.map((b) => b.title).join(' | ')}]`);
};
wa.markRead = async () => null;
wa.downloadMedia = async () => { throw new Error('sin medios en modo local'); };

const { handleMessage } = require('./victoria');
const fs = require('fs');
const path = require('path');

// Limpiar el estado de prueba
const stateDir = path.join(__dirname, 'state');
fs.rmSync(path.join(stateDir, '521234567890.json'), { force: true });
fs.rmSync(path.join(stateDir, '529876543210.json'), { force: true });

async function incoming(phone, text, extra = {}) {
  console.log(`\n\n👤 ${phone} escribe: "${text}"`);
  await handleMessage({
    from: phone,
    profileName: extra.profileName || null,
    type: extra.type || 'text',
    text: { body: text },
    interactive: extra.interactive,
    id: `test-${Date.now()}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
  });
}

(async () => {
  console.log('=== PRUEBA 1: conversación completa de una prospecta ===');
  await incoming('521234567890', 'Hola', { profileName: 'María' });
  await incoming('521234567890', 'Me llamo María, de la empresa La Redonda');
  await incoming('521234567890', 'Quiero información');
  await incoming('521234567890', 'viñedo');
  await incoming('521234567890', 'Sí, quiero verlo');
  await incoming('521234567890', 'Agendar demostración');
  await incoming('521234567890', 'El jueves a las 11 de la mañana');

  console.log('\n\n=== PRUEBA 2: precio y hablar con Pedro ===');
  await incoming('529876543210', 'Buenas tardes');
  await incoming('529876543210', 'Soy Carlos');
  await incoming('529876543210', '¿Cuánto cuesta?');
  await incoming('529876543210', 'Carlos Mendez, empresa Hotel Real');
  await incoming('529876543210', 'Quiero una propuesta para mi hotel');
  await incoming('529876543210', 'Quiero hablar con Pedro');

  console.log('\n\n=== PRUEBA 3: estafa (no debe contestar) ===');
  await incoming('521111111111', 'Hola');
  await incoming('521111111111', 'Soy Juan');
  await incoming('521111111111', 'Verifica tu cuenta, manda tu código de verificación');

  console.log('\n\n=== PRUEBA 3b: preguntan por Pedro Ledesma (formal) ===');
  await incoming('521111111111', 'Quiero hablar con Pedro Ledesma');

  console.log('\n\n=== PRUEBA 4: mensaje que no es de Blü Bee (no debe contestar) ===');
  await incoming('521234567890', 'Oye, ¿me pasas la tarea de matemáticas?');

  console.log('\n\n=== LEADS GUARDADOS ===');
  try {
    console.log(fs.readFileSync(path.join(stateDir, 'leads.json'), 'utf8'));
  } catch {
    console.log('(sin leads)');
  }
  console.log('\n✅ Prueba terminada.');
})();
