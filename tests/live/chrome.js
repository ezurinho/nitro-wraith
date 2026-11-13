'use strict';

/*
 * Abre Chrome con el puerto de depuracion y un perfil dedicado.
 *
 * `npm run live` no lanza nada: se conecta a un Chrome ya abierto. Este comando
 * prepara ese Chrome sin tocar el perfil de todos los dias. La primera vez hay
 * que iniciar sesion en la ventana que aparece; despues la sesion vive en
 * `.live-profile/`.
 *
 *   npm run live:chrome
 *   npm run live:chrome -- --dry-run
 *   CDP_PORT=9333 npm run live:chrome
 *   LIVE_PROFILE=/ruta/al/perfil npm run live:chrome
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PROFILE = path.resolve(process.env.LIVE_PROFILE || path.join(ROOT, '.live-profile'));
const PORT = Number(process.env.CDP_PORT || 9222);
const LOGIN_URL = 'https://www.nitrotype.com/login';
const READY_MS = 20000;

function findChrome() {
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);

  if (process.platform === 'win32') {
    candidates.push(
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    );
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  }

  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function buildArgs({ port = PORT, profile = PROFILE, loginUrl = LOGIN_URL } = {}) {
  return [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    // Una carrera en segundo plano no puede depender de que Chrome decida
    // despertar los timers: el tecleo va en milisegundos.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    // Este Chrome es solo del harness: que no suene nunca, ni con anuncios.
    '--mute-audio',
    loginUrl,
  ];
}

// null si el puerto no responde o no habla DevTools.
function portInfo(port = PORT, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: timeoutMs }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });

    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

async function waitForPort(port, ms) {
  const until = Date.now() + ms;

  while (Date.now() < until) {
    const info = await portInfo(port);
    if (info) return info;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return null;
}

function quote(arg) {
  return /\s/.test(arg) ? `"${arg}"` : arg;
}

async function main() {
  const chrome = findChrome();
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log(`Chrome: ${chrome || '(no encontrado)'}`);
    console.log(`Perfil: ${PROFILE}`);
    console.log(`Comando: ${[chrome || 'chrome', ...buildArgs()].map(quote).join(' ')}`);
    return 0;
  }

  const running = await portInfo(PORT);
  if (running) {
    console.log(`El puerto ${PORT} ya esta abierto (${running.Browser || 'Chrome'}).`);
    console.log('Usa esa ventana o cierrala antes de abrir otra.');
    return 0;
  }

  if (!chrome) {
    console.error('No encontre Chrome. Define CHROME_PATH con la ruta al ejecutable.');
    return 1;
  }

  fs.mkdirSync(PROFILE, { recursive: true });

  let child;
  try {
    child = spawn(chrome, buildArgs(), { detached: true, stdio: 'ignore' });
  } catch (error) {
    console.error(`No pude abrir Chrome: ${error.message}`);
    return 1;
  }
  child.on('error', (error) => { console.error(`Chrome: ${error.message}`); });
  child.unref();

  const info = await waitForPort(PORT, READY_MS);
  if (!info) {
    console.error(`Chrome no abrio el puerto ${PORT} en ${READY_MS / 1000}s.`);
    console.error('Si ya habia un Chrome con este perfil, cierralo y vuelve a intentarlo.');
    return 1;
  }

  console.log(`Chrome abierto en el puerto ${PORT}${info.Browser ? ` · ${info.Browser}` : ''}`);
  console.log(`Perfil: ${PROFILE}`);
  console.log('');
  console.log('Inicia sesion en la ventana que se abrio. Solo hace falta una vez:');
  console.log('el perfil guarda la sesion para las proximas pasadas.');
  console.log('Despues, con esa ventana abierta:');
  console.log('');
  console.log('  npm run live');
  return 0;
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`live:chrome: ${error.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = { buildArgs, findChrome, portInfo, PROFILE, PORT };
