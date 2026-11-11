# Daniela — chatbot de WhatsApp de Blü Bee Technologies

## Qué es

Daniela es la secretaria virtual de Blü Bee Technologies en WhatsApp Business
(442 461 0323). Recibe a quien escribe con un video de bienvenida, pregunta su
nombre y qué necesita, toma recados, agenda demostraciones y le pasa todo a Pedro.
Solo da información de la empresa cuando se la piden. Nunca habla de hardware.
Si no sabe algo, no inventa: toma el recado y se lo pasa a Pedro.

El diseño completo está en `chatbot-whatsapp-blu-bee-diseno.md`.

## Archivos

- `server.js` — servidor webhook (Express). Recibe los mensajes de WhatsApp.
- `daniela.js` — la lógica de conversación de Daniela (estados, intenciones,
  recados, seguridad, cierres).
- `whatsapp.js` — cliente de la API de WhatsApp Cloud (enviar texto, video,
  audio, botones; subir medios).
- `config.js` — configuración por variables de entorno (los secretos NUNCA van
  en el código).
- `transcribe.py` — transcribe notas de voz con faster-whisper.
- `state/` — estado por contacto (`<telefono>.json`), recados (`leads.json`) y
  IDs de medios subidos (`media-ids.json`). Se crea solo.
- `media/` — video del logotipo (cierre de marca) y el audio del cierre oficial
  (se genera aparte, ver abajo).

## Videos y audios que usa

| Uso | Archivo |
|---|---|
| Video de bienvenida | `../daniela-saludo-final.mp4` (10 s, vertical) |
| Saludo personalizado con nombre | `../daniela-saludo-personalizado-plantilla.mp4` (8.2 s) — solo cuando Pedro lo autoriza |
| Comercial (solo si lo piden) | `../blu-bee-anuncio-musica4-epic-v3-ligero.mp4` (58 s) |
| Video del logotipo (cierre) | `media/logo-video.mp4` (8 s) |
| Cierre en voz | `media/cierre-oficial.ogg` (se genera aparte con la voz de Daniela) |

## Instalación

```bash
cd chatbot
npm install
cp .env.example .env   # luego llenar los valores (ver abajo)
node server.js
```

## Configuración (.env)

```bash
# WhatsApp Cloud API — se consiguen en developers.facebook.com (app de Meta)
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=        # token permanente (no el temporal de 24 h)
WHATSAPP_VERIFY_TOKEN=victoria-blu-bee   # debe coincidir con el de Meta

# Pedro
PETER_WHATSAPP=524421447169
PETER_EMAIL=pledesma@blubeetech.com.mx

# Correo para los recados (opcional; sin esto, los recados solo se guardan
# en state/leads.json y se avisan por WhatsApp a Pedro)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=Daniela <daniela@blubeetech.com.mx>

# Transcripción de notas de voz (opcional)
# Principal: Groq (gratis, sin tarjeta) — clave en console.groq.com (API Keys).
# Respaldo: OpenAI (whisper-1) — solo se usa si no hay clave de Groq.
GROQ_API_KEY=
OPENAI_API_KEY=
TRANSCRIBE_CMD=python3 transcribe.py
```

## Conexión con WhatsApp (pasos en Meta)

1. En [developers.facebook.com](https://developers.facebook.com) crear una app
   y agregarle el producto **WhatsApp**.
2. En la app, ir a **WhatsApp > Configuración de la API** y agregar el número
   Business **442 461 0323** (o usar el número de prueba de Meta para probar).
3. Copiar el **ID del número de teléfono** y generar un **token permanente**
   (en la app: Herramientas > Tokens de acceso, o con un usuario del sistema).
4. En **WhatsApp > Configuración > Webhook**, poner la URL pública del servidor
   (`https://tu-servidor/webhook`) y el token de verificación
   (`WHATSAPP_VERIFY_TOKEN`). Suscribirse a los eventos `messages`.
5. Poner los valores en `.env` y arrancar el servidor.

## Probar sin conectar (modo local)

```bash
node test-local.js
```

Simula una conversación completa (bienvenida, nombre, información, video,
demo, recado, cierre) sin llamar a la API de WhatsApp: imprime lo que Daniela
mandaría. Sirve para revisar la lógica antes de conectar el número real.

## Notas

- El servidor tiene que estar prendido siempre y en una URL pública (HTTPS)
  para que Meta le mande los mensajes. Opciones comunes: Render, Railway,
  Fly.io o un VPS. Ver la sección de hosting en el diseño.
- Los recados se guardan en `state/leads.json` aunque falle el correo o el
  WhatsApp a Pedro.
- Para desconectar el bot: borrar el webhook en Meta o apagar el servidor.
  El número, los chats y los contactos quedan intactos.
- Daniela no contesta mensajes que no son de Blü Bee ni mensajes sospechosos
  (estafa/extorsión): solo avisa a Pedro.
