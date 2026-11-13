'use strict';

/*
 * Un Chrome de mentira para probar `npm run live` sin cuenta.
 *
 * Habla lo justo del protocolo: `/json/version`, `/json/list` y un WebSocket
 * que responde a `Runtime.enable`, `Page.enable` y `Runtime.evaluate`, además
 * de emitir eventos `Runtime.consoleAPICalled`. Nada de DOM ni de Nitro Type:
 * lo que se prueba es el cableado de live.js (descubrir la pestaña, leer la
 * sesión, pulsar Race Now, escuchar la línea de precisión y comparar muestras),
 * no el juego.
 *
 * Sin dependencias: el WebSocket se arma a mano sobre `http` (handshake RFC
 * 6455 y frames de texto), que es todo lo que necesita el cliente de Node 22.
 */

const http = require('http');
const crypto = require('crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PAGE_URL = 'https://www.nitrotype.com/garage';

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

// Servidor -> cliente: frames de texto sin mascara (el protocolo solo exige
// mascara en el sentido cliente -> servidor).
function encodeFrame(text) {
  const payload = Buffer.from(String(text), 'utf8');
  const length = payload.length;
  let header;

  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  header[0] = 0x81;
  return Buffer.concat([header, payload]);
}

function decodeFrames(socket, onText) {
  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 2) {
      const opcode = buffer[0] & 0x0f;
      const masked = (buffer[1] & 0x80) !== 0;
      let length = buffer[1] & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskLength = masked ? 4 : 0;
      if (buffer.length < offset + maskLength + length) return;

      const mask = masked ? buffer.subarray(offset, offset + 4) : null;
      offset += maskLength;

      const payload = Buffer.from(buffer.subarray(offset, offset + length));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];

      buffer = buffer.subarray(offset + length);

      if (opcode === 0x8) {
        try { socket.end(); } catch { /* ya cerrado */ }
        return;
      }
      if (opcode === 0x9) {
        try { socket.write(Buffer.concat([Buffer.from([0x8a, 0x00])])); } catch { /* cerrado */ }
        continue;
      }
      if (opcode === 0x1) onText(payload.toString('utf8'));
    }
  });
}

const DEFAULTS = {
  session: { username: 'TestRacer' },   // null = pestaña sin sesión
  racing: false,                        // ya hay una carrera abierta
  raceNow: true,                        // existe el botón Race Now
  samples: 1,                           // líneas "Accuracy model" de la carrera
  missingProgress: false,               // el update no trae typed/skipped/errors
  baseSamples: 1,                       // muestras que ya había antes de la carrera
  sampleDelayMs: 250,
  panel: null,                          // lo que "vería" live.js del panel, si hay
  deltas: [0],                          // un delta por carrera, en ciclo
  history: [],                          // filas de autoTyperRaceHistory (WPM oficial)
  scriptVersion: '7.37.0',              // null = userscript ausente
};

function startFakeCdp(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const state = { evaluations: [], connects: 0, emitted: 0, scripts: [] };
  const sockets = new Set();
  let base = config.baseSamples;

  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    const url = `ws://127.0.0.1:${server.address().port}/devtools/page/FAKE`;

    if (pathname === '/json/version') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ Browser: 'FakeCDP/1.0', webSocketDebuggerUrl: url }));
      return;
    }
    if (pathname === '/json/list') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify([{
        id: 'FAKE',
        type: 'page',
        title: 'Nitro Type',
        url: PAGE_URL,
        webSocketDebuggerUrl: url,
      }]));
      return;
    }
    res.writeHead(404).end('not found');
  });

  server.on('upgrade', (req, socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n'
      + 'Upgrade: websocket\r\n'
      + 'Connection: Upgrade\r\n'
      + `Sec-WebSocket-Accept: ${acceptKey(req.headers['sec-websocket-key'])}\r\n\r\n`,
    );
    state.connects++;

    let sampleReads = 0;
    let emittedRaces = 0;

    const emitConsole = (text) => {
      state.emitted++;
      socket.write(encodeFrame(JSON.stringify({
        method: 'Runtime.consoleAPICalled',
        params: {
          type: 'log',
          args: [
            { type: 'string', value: '[NTAuto]' },
            { type: 'string', value: text },
          ],
          timestamp: Date.now() / 1000,
        },
      })));
    };

    const emitRace = () => {
      if (config.missingProgress) {
        emitConsole('Accuracy delta: no progress in the update event');
        return;
      }
      emittedRaces++;
      const value = Number(config.deltas[(emittedRaces - 1) % config.deltas.length]) || 0;
      const ours = (98 + value).toFixed(1);
      for (let i = 0; i < config.samples; i++) {
        emitConsole(`Accuracy model (progress): ours ${ours}% vs game 98.0% -> ${value >= 0 ? '+' : ''}${value.toFixed(1)} pts.`);
      }
    };

    decodeFrames(socket, (raw) => {
      let message;
      try { message = JSON.parse(raw); } catch { return; }
      if (!message.id) return;

      const reply = (result) => socket.write(encodeFrame(JSON.stringify({ id: message.id, result })));

      if (message.method === 'Page.addScriptToEvaluateOnNewDocument') {
        state.scripts.push(String(message.params.source || ''));
        reply({ identifier: String(state.scripts.length) });
        return;
      }

      if (message.method === 'Runtime.enable' || message.method === 'Page.enable') {
        reply({});
        return;
      }

      if (message.method !== 'Runtime.evaluate') {
        reply({});
        return;
      }

      const expression = String(message.params.expression || '');
      state.evaluations.push(expression);

      // Handshake del userscript: el dry-run pide la version.
      if (expression.includes('__ntaVersion')) {
        const value = config.scriptVersion
          ? { version: config.scriptVersion, panel: false, panelVersion: '' }
          : { version: '', panel: false, panelVersion: '' };
        reply({ result: { type: 'object', value } });
        return;
      }

      // Sesión: live.js lee `persist:nt` y espera { ok, username }.
      if (expression.includes('persist:nt')) {
        const session = config.session;
        const name = session && (session.username || session.userID);
        const guest = Boolean(session && (session.loggedIn === false || /^g0\./i.test(String(name || ''))));
        const value = session
          ? {
            ok: Boolean(name && !guest),
            guest,
            username: name,
            reason: guest ? 'la pestaña está como invitado' : 'sin usuario con sesión',
          }
          : { ok: false, guest: false, reason: 'no hay persist:nt en esta pestaña' };
        reply({ result: { type: 'object', value } });
        return;
      }

      if (expression.includes("pathname.includes('/race')")) {
        reply({ result: { type: 'boolean', value: config.racing } });
        return;
      }

      // El clic en Race Now: la expresion trae el texto del boton.
      if (expression.includes('Race Now') || expression.includes('race again')) {
        const value = config.raceNow
          ? { ok: true, text: 'Race Now' }
          : { ok: false, buttons: ['Garage', 'Friends', 'Settings'] };
        reply({ result: { type: 'object', value } });

        // Solo un clic real arranca una carrera; el probe del dry-run no debe
        // emitir nada. El clic lleva `el.click()` en la expresion.
        if (config.raceNow && expression.includes('.click()')) {
          setTimeout(emitRace, config.sampleDelayMs);
        }
        return;
      }

      // Lectura del panel en el marco de la carrera (opcional).
      if (expression.includes('nt-autotyper-panel')) {
        reply({ result: { type: 'object', value: config.panel } });
        return;
      }

      if (expression.includes('autoTyperAccDeltas')) {
        sampleReads++;
        // El userscript recorta a 20: el CDP falso imita ese tope para que
        // live.js vea el mismo array lleno que veria en una cuenta real.
        const total = Math.min(base + emittedRaces, 20);
        const list = Array.from({ length: total }, (_, i) => ({ stamp: i + 1, delta: 0 }));
        reply({ result: { type: 'string', value: JSON.stringify(list) } });

        // Sin clic previo (ya habia una carrera abierta) el evento se emite
        // despues de la primera lectura.
        if (config.racing && sampleReads === 1) setTimeout(emitRace, config.sampleDelayMs);
        return;
      }

      // Historial de carreras: live.js lo lee al final para comparar el WPM
      // oficial (`serverWpm`) con el modelo. Cada escenario trae sus filas.
      if (expression.includes('autoTyperRaceHistory')) {
        reply({ result: { type: 'string', value: JSON.stringify(config.history) } });
        return;
      }

      reply({ result: { type: 'undefined' } });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        state,
        close() {
          for (const socket of sockets) {
            try { socket.destroy(); } catch { /* ya cerrado */ }
          }
          return new Promise((done) => server.close(done));
        },
      });
    });
  });
}

module.exports = { startFakeCdp };

if (require.main === module) {
  startFakeCdp().then((fake) => {
    console.log(`fake CDP on ${fake.port}`);
    process.on('SIGINT', () => fake.close().then(() => process.exit(0)));
  });
}
