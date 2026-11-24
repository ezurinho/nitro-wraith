
  /* ==========================================================================
   * 3. PROFILE: WPM AND ACCURACY PER SESSION
   * ========================================================================== */
  // localStorage puede estar bloqueado (modo privado, politicas del sitio).
  // Un getItem que lanza no puede tumbar el script entero: se degrada a
  // memoria y todo lo que dependa de el se comporta como recien instalado.
  const disk = {
    get(key, fallback = null) {
      noteStorageRead(key);
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : raw;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
        countReadCache.delete(key);
        if (key === KEYS.calibrationAt) calibrationReadAt = 0;
        if (key === 'persist:nt') clearPersistRaw();
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
        countReadCache.delete(key);
        if (key === KEYS.calibrationAt) calibrationReadAt = 0;
        if (key === 'persist:nt') clearPersistRaw();
        return true;
      } catch {
        return false;
      }
    },
  };

  function readCount(key) {
    const now = Date.now();
    const hit = countReadCache.get(key);
    if (hit && now - hit.at < 500) return hit.value;
    const parsed = parseInt(disk.get(key, '') || '', 10);
    // 0 es un valor valido: es el estado "sin ciclo" y hace que el primer
    // advanceSessions empiece en 1. Un valor corrupto tambien cae a 0; devolver
    // 1 retrasaba el reinicio de la serie hasta que el contador volvia a 1.
    const value = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    countReadCache.set(key, { at: now, value });
    return value;
  }

  // Escribir de verdad, no preguntar si se puede: un almacenamiento bloqueado
  // (modo privado, permisos) es lo primero que hay que descartar cuando la tanda
  // se olvida de todo entre recarga y recarga. Va en el informe de diagnostico.
  function storageUsable() {
    const probe = `${KEYS.session}:probe`;
    try {
      localStorage.setItem(probe, '1');
      const ok = localStorage.getItem(probe) === '1';
      localStorage.removeItem(probe);
      return ok;
    } catch {
      return false;
    }
  }

  // Datos que el propio sitio guarda del jugador en `localStorage.persist:nt`
  // (redux-persist serializa `user` como texto). Los usa el script de
  // estadisticas del juego y son de solo lectura: aqui sirven para el
  // `rewardCountdown` de la Mystery Box y para el nombre/ID del corredor.
  let siteUserAt = 0;
  let siteUserValue = null;
  let siteUserRaw = null;

  // Lectura unica del JWT del sitio. `player_token` puede estar como JWT crudo,
  // con comillas (la app lo guardo con JSON.stringify) o con el prefijo
  // "Bearer": las tres formas se aceptan aqui y en ningun otro sitio. Antes se
  // parseaba en tres funciones y la de la Mystery Box leia el valor crudo, asi
  // que mandaba comillas en la cabecera Authorization.
  function readToken() {
    const raw = disk.get('player_token', '');
    return String(raw || '').replace(/^"|"$/g, '').replace(/^Bearer\s+/i, '');
  }

  function jwtClaims(token = readToken()) {
    const payload = token && token.split('.')[1];
    if (!payload) return null;
    try {
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      const claims = JSON.parse(atob(padded));
      return claims && typeof claims === 'object' ? claims : null;
    } catch {
      return null;   // token ilegible o almacenamiento bloqueado
    }
  }

  // Tiempo que le queda al token de sesion del sitio (`player_token`). Se cachea
  // un segundo: el panel se repinta muchas veces por carrera y el JWT no cambia.
  let sessionExpAt = 0;
  let sessionExpReadAt = 0;
  function sessionExpiryAt() {
    const now = Date.now();
    if (now - sessionExpReadAt < 1000) return sessionExpAt;
    sessionExpReadAt = now;
    sessionExpAt = 0;
    const claims = jwtClaims();
    const exp = Number(claims && claims.exp);
    if (Number.isFinite(exp) && exp > 0) sessionExpAt = exp * 1000;
    return sessionExpAt;
  }

  function siteUser(maxAge = 3000) {
    const now = Date.now();
    if (siteUserAt && now - siteUserAt < maxAge) return siteUserValue;

    try {
      const raw = persistRaw();
      // `persist:nt` puede ser grande. Si el texto no cambio, el objeto cacheado
      // sigue siendo valido: no hay que volver a parsearlo cada pocos segundos.
      if (raw === siteUserRaw) {
        siteUserAt = now;
        return siteUserValue;
      }
      siteUserRaw = raw;
      siteUserValue = null;
      siteUserAt = now;
      const root = raw ? JSON.parse(raw) : null;
      if (!root || !root.user) return siteUserValue;
      const user = typeof root.user === 'string' ? JSON.parse(root.user) : root.user;
      if (user && typeof user === 'object') siteUserValue = user;
    } catch {
      /* almacenamiento corrupto o bloqueado */
    }
    return siteUserValue;
  }

  /* ==========================================================================
   * 3a. PERFIL DE RITMO Y PREFERENCIAS
   * ========================================================================== */
  // Tres perfiles DENTRO del sobre legitimo: los tres gastan la misma cadencia
  // humana y los tres quedan por debajo del techo duro. Lo unico que cambian es
  // el rango del que se sortea el objetivo de cada sesion, para poder bajar el
  // ritmo en una cuenta nueva (soft) o apretar un poco en la tuya (fast, topado a
  // un WPM del techo). No es un modo rapido: el antiguo BLATANT sigue borrado.
  // El perfil del medio se llama BALANCED: es el rango calibrado de la cuenta.
  // Antes se llamaba «normal», y ese nombre se lee todavia como balanced para
  // que una preferencia vieja en disco no caiga al perfil por defecto.
  // Temas del panel. El orden es el de la rejilla de TUNE y el primero es el
  // que se pinta en una instalacion nueva.
  const THEMES = ['carbon', 'aurora', 'sunset', 'ice', 'violet', 'rgb'];
  const THEME_LABELS = {
    carbon: 'Carbon',
    aurora: 'Aurora',
    sunset: 'Sunset',
    ice: 'Ice',
    violet: 'Violet',
    rgb: 'RGB',
  };

  let panelTheme = (() => {
    const saved = disk.get(KEYS.panelTheme, 'carbon');
    return THEMES.includes(saved) ? saved : 'carbon';
  })();

  const VISUAL_DEFAULTS = Object.freeze({
    rgbSpeed: 1,
    rgbColorA: '#ff5f6d',
    rgbColorB: '#b06bff',
    rgbIntensity: 90,
    rgbRaceMode: 'static',
    density: 'comfortable',
    scale: 100,
    highContrast: false,
    raceFocus: true,
    motion: 'full',
  });
  const RGB_SPEEDS = [0.5, 1, 2];
  const RGB_RACE_MODES = ['static', 'border', 'full'];
  const PANEL_DENSITIES = ['comfortable', 'compact'];
  const PANEL_SCALES = [100, 115];
  // Tres niveles de movimiento: calm solo deja transiciones de color, standard
  // conserva entradas y hoveres sin bucles, full anade los bucles ambientales
  // (escáner de la cabecera, anillo del estado, ecualizador de la tarjeta Live).
  // El sistema operativo manda por encima de los tres: prefers-reduced-motion
  // apaga tambien full.
  const PANEL_MOTIONS = ['calm', 'standard', 'full'];

  function normalizeVisualColor(value, fallback) {
    const color = String(value || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(color) ? color : fallback;
  }

  function normalizeVisualPrefs(value) {
    const source = value && typeof value === 'object' ? value : {};
    const speed = RGB_SPEEDS.includes(Number(source.rgbSpeed)) ? Number(source.rgbSpeed) : VISUAL_DEFAULTS.rgbSpeed;
    const intensity = clamp(Math.round(Number(source.rgbIntensity) || VISUAL_DEFAULTS.rgbIntensity), 25, 100);
    const scale = PANEL_SCALES.includes(Number(source.scale)) ? Number(source.scale) : VISUAL_DEFAULTS.scale;
    return {
      rgbSpeed: speed,
      rgbColorA: normalizeVisualColor(source.rgbColorA, VISUAL_DEFAULTS.rgbColorA),
      rgbColorB: normalizeVisualColor(source.rgbColorB, VISUAL_DEFAULTS.rgbColorB),
      rgbIntensity: intensity,
      rgbRaceMode: RGB_RACE_MODES.includes(source.rgbRaceMode) ? source.rgbRaceMode : VISUAL_DEFAULTS.rgbRaceMode,
      density: PANEL_DENSITIES.includes(source.density) ? source.density : VISUAL_DEFAULTS.density,
      scale,
      highContrast: source.highContrast === true,
      raceFocus: source.raceFocus !== false,
      motion: PANEL_MOTIONS.includes(source.motion) ? source.motion : VISUAL_DEFAULTS.motion,
    };
  }

  let visualPrefs = (() => {
    try {
      return normalizeVisualPrefs(JSON.parse(disk.get(KEYS.visuals, '{}')));
    } catch {
      return { ...VISUAL_DEFAULTS };
    }
  })();

  function saveVisualPrefs() {
    disk.set(KEYS.visuals, JSON.stringify(visualPrefs));
  }

  function setVisualPref(key, value, options = {}) {
    const next = normalizeVisualPrefs({ ...visualPrefs, [key]: value });
    if (JSON.stringify(next) === JSON.stringify(visualPrefs)) return false;
    visualPrefs = next;
    if (options.persist !== false) saveVisualPrefs();
    if (typeof paintTheme === 'function') paintTheme();
    if (typeof schedulePanelReclamp === 'function') schedulePanelReclamp();
    return true;
  }

  // @property no se registra dentro de un shadow root: el navegador lo ignora
  // y --nt-hue salta de 0 a 360 en seco, que es quedarse en rojo/amarillo.
  // CSS.registerProperty lo registra en el documento y los dos paneles lo
  // heredan; no depende de inyectar estilos ni del CSP de la pagina.
  function registerThemeProperties() {
    try {
      if (window.__ntaThemeProps || !window.CSS || typeof CSS.registerProperty !== 'function') return;
      CSS.registerProperty({ name: '--nt-hue', syntax: '<number>', inherits: true, initialValue: '160' });
      CSS.registerProperty({ name: '--nt-angle', syntax: '<angle>', inherits: true, initialValue: '0deg' });
      window.__ntaThemeProps = true;
    } catch { /* ya registradas o navegador sin soporte */ }
  }

  const PACE_PROFILES = {
    soft: { min: 98, max: 108 },
    balanced: { min: CONFIG.wpm.min, max: CONFIG.wpm.max },
    fast: { min: 110, max: 119 },
  };
  const PACE_ORDER = ['soft', 'balanced', 'fast'];
  const NITRO_STRATEGIES = ['longest', 'first', 'last'];
  function normalizeNitroStrategy(value) {
    return NITRO_STRATEGIES.includes(value) ? value : 'longest';
  }

  let paceProfile = (() => {
    const saved = disk.get(KEYS.paceProfile);
    const name = saved === 'normal' ? 'balanced' : saved;
    if (!PACE_PROFILES[name]) return 'balanced';
    // La migracion se escribe: lo guardado con el nombre viejo no vuelve a
    // aparecer en una exportacion de la configuracion.
    if (name !== saved) disk.set(KEYS.paceProfile, name);
    return name;
  })();

  // Rango leido del API de stats. `null` = nunca se ha leido y manda el rango
  // escrito a mano en PACE_PROFILES.balanced.
  let calibratedRange = (() => {
    try {
      const raw = JSON.parse(disk.get(KEYS.calibratedRange, 'null'));
      if (raw && Number.isFinite(raw.min) && Number.isFinite(raw.max)) {
        const min = Math.round(raw.min);
        const max = Math.round(raw.max);
        const center = Number(raw.center);
        return {
          min,
          max,
          center: Number.isFinite(center) ? Math.round(center) : Math.round((min + max) / 2),
        };
      }
    } catch { /* preferencia corrupta: se ignora */ }
    return null;
  })();

  // Media de precision leida del API. `null` = nunca se ha leido y manda el
  // 96-98 escrito a mano.
  let accountStats = null;
  // Una cuenta nueva debe leer su historico completo antes de la primera
  // carrera; applyPrefs puede dejar un rango con la media corta de persist:nt,
  // pero el mensual es el que demuestra si la cuenta es de 100 o de 50.
  let calibrationNeedsAccountRead = false;
  // Estado de la ultima lectura de cuenta. Vive aqui, antes de applyPrefs:
  // ensureCalibrationAccount puede limpiar el rango en el arranque.
  let calibrationError = '';
  let calibrationFailures = 0;
  let calibrationRetryAt = 0;
  let calibrationRaceMark = 0;
  // El banco escribe localStorage a mano; la recarga por cambio de cuenta se
  // puede silenciar unos segundos para no cortar una prueba a mitad.
  let accountReloadMutedUntil = 0;

  let calibratedAccuracy = (() => {
    try {
      const raw = JSON.parse(disk.get(KEYS.calibratedAccuracy, 'null'));
      if (raw && Number.isFinite(raw.min) && Number.isFinite(raw.max)) {
        const min = Math.round(raw.min);
        const max = Math.round(raw.max);
        const center = Number(raw.center);
        return {
          min,
          max,
          center: Number.isFinite(center) ? Math.round(center) : Math.round((min + max) / 2),
        };
      }
    } catch { /* preferencia corrupta: se ignora */ }
    return null;
  })();

  // La calibracion de localStorage es del navegador, no de la cuenta. Si en
  // este navegador se entra con otra cuenta, el rango de la anterior no puede
  // seguir mandando: se borra una vez y se vuelve a leer la cuenta actual.
  function readAccountIdentity() {
    const user = siteUser(0) || {};
    const claims = jwtClaims() || {};
    // El token es la sesion que el juego esta usando ahora; `persist:nt`
    // puede seguir unos instantes con el usuario anterior tras un login.
    const id = claims.sub ?? claims.userID ?? claims.userId ?? claims.username
      ?? user.userID ?? user.userId ?? user.user_id ?? user.id
      ?? user.username ?? user.userName;
    return id === undefined || id === null ? '' : String(id).trim().toLowerCase();
  }

  function clearAccountCalibration() {
    for (const key of [
      KEYS.calibratedRange,
      KEYS.calibratedAccuracy,
      KEYS.calibrationAt,
      KEYS.calibrationVersion,
      KEYS.lifetimeWpm,
      KEYS.wpmCeiling,
    ]) disk.remove(key);
    calibratedRange = null;
    calibratedAccuracy = null;
    // El techo vuelve al historico: el de la cuenta anterior no puede seguir
    // mandando sobre esta.
    CONFIG.wpm.hardCap = Number(CONFIG.calibration.ceilingMin) || 120;
    CONFIG.guard.maxWpmLegit = CONFIG.wpm.hardCap;
    accountStats = null;
    calibrationError = '';
    calibrationFailures = 0;
    calibrationRetryAt = 0;
    calibrationRaceMark = 0;
    calibrationReadAt = 0;
    calibrationReadValue = 0;
  }

  // Devuelve true cuando la cuenta guardada no es la actual. En ese caso el
  // arranque no puede aplicar el rango viejo; applyPrefs lee despues
  // `persist:nt` de la cuenta nueva y crea el objetivo correcto.
  function ensureCalibrationAccount() {
    const id = readAccountIdentity();
    if (!id) return false;
    const stored = disk.get(KEYS.calibrationAccount, '');
    if (stored === id) {
      // Tras actualizar el userscript se vuelve a leer el historico completo
      // antes de la siguiente carrera, no solo la media corta del perfil.
      if (calibratedRange && disk.get(KEYS.calibrationVersion, '') !== VERSION) {
        calibrationNeedsAccountRead = true;
      }
      return false;
    }
    clearAccountCalibration();
    calibrationNeedsAccountRead = true;
    disk.set(KEYS.calibrationAccount, id);
    return true;
  }

  function rememberCalibrationAccount() {
    const id = readAccountIdentity();
    if (id) disk.set(KEYS.calibrationAccount, id);
  }

  // Un rango simetrico alrededor de la media real. La mitad crece con el ritmo
  // (2 WPM en una cuenta de 15, 6 a partir de 86) para que la media de los
  // objetivos sea la media de la persona, sin convertir cada carrera en una
  // copia exacta. El techo duro sigue mandando.
  function wpmRangeFor(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;

    const cap = Number.isFinite(CONFIG.wpm.hardCap) ? CONFIG.wpm.hardCap : 120;
    const floor = Math.max(1, Number(CONFIG.calibration.minWpm) || 15);
    const center = clamp(Math.round(number), floor, cap - 1);
    const half = clamp(Math.round(center * 0.14), 2, Math.max(2, CONFIG.calibration.halfWidth | 0));
    let min = clamp(center - half, floor, cap);
    let max = clamp(center + half, floor, cap);
    if (max - min < 6) {
      const middle = (min + max) / 2;
      min = clamp(Math.floor(middle - 3), floor, cap);
      max = clamp(min + 6, floor, cap);
    }
    return { min, max, center };
  }

  // El `avgSpeed` del perfil es una ventana corta. Cuando el bot ha corrido
  // por debajo, esa ventana se queda en 30-40 aunque el top siga en 230. Un
  // objetivo que solo mire esa media se retroalimenta: cada carrera baja la
  // media y la media baja el objetivo. El techo duro nacia de una constante
  // (120) y con el la calibracion era un adorno: `wpmRangeFor` recortaba el
  // centro al techo y una cuenta de 230 escribia a 119 para siempre. Ahora el
  // techo se deriva del top, justo por debajo de la marca de la propia cuenta,
  // y sigue siendo un techo de verdad: el planificador no pasa de el, el
  // gobernador frena la carrera que lo toque y el guardia aborta si el HUD del
  // juego se pasa. Sin cuenta leida manda el 120 historico.
  function ceilingFor(top) {
    const floor = clamp(wpmInt(CONFIG.calibration.ceilingMin) || 120, 120, 400);
    const max = Math.max(floor, wpmInt(CONFIG.calibration.ceilingMax) || 300);
    const best = Number(top);
    if (!Number.isFinite(best) || best <= 0) return floor;
    const share = clamp(Number(CONFIG.calibration.ceilingTopShare) || 0.97, 0.5, 1);
    return clamp(Math.round(best * share), floor, max);
  }

  // Aplica el techo y lo guarda con el top del que salio: al recargar se vuelve
  // a derivar del mismo dato en vez de confiar en un numero suelto que pudo
  // dejar otra cuenta.
  function applyCeiling(top) {
    const previous = wpmInt(CONFIG.wpm.hardCap);
    const cap = ceilingFor(top);
    CONFIG.wpm.hardCap = cap;
    // El guardia compara el HUD del juego con este numero: si el techo sube y el
    // tripwire se queda en 120, la primera carrera rapida aborta sola.
    CONFIG.guard.maxWpmLegit = cap;
    const best = Number(top);
    if (Number.isFinite(best) && best > 0) {
      disk.set(KEYS.wpmCeiling, JSON.stringify({ top: Math.round(best), cap, at: Date.now() }));
    }
    if (cap !== previous) {
      log(`Pace ceiling: ${previous} -> ${cap} WPM (account top ${wpmInt(best)}).`);
    }
    return { cap, previous, changed: cap !== previous };
  }

  // Arranque: el techo guardado se vuelve a derivar de su top. Si el tope cambio
  // de formula, se recalcula; si no hay nada guardado, manda el 120.
  (function restoreCeiling() {
    try {
      const raw = JSON.parse(disk.get(KEYS.wpmCeiling, 'null'));
      if (!raw || !Number.isFinite(Number(raw.top)) || Number(raw.top) <= 0) return;
      const cap = ceilingFor(raw.top);
      CONFIG.wpm.hardCap = cap;
      CONFIG.guard.maxWpmLegit = cap;
    } catch { /* sin techo guardado */ }
  })();

  // Objetivo por top: una fraccion del mejor WPM de la cuenta. El top es el
  // unico dato que dice de lo que una cuenta es capaz cuando su media se ha
  // quedado corta, y es lo que hace que una cuenta de 230 no escriba a 104 y que
  // una de 300 no escriba a 104 tampoco.
  //
  // Todo se compara contra la propia cuenta, no contra un numero fijo: el top
  // entra solo si demuestra margen sobre SU media (`topHeadroomRatio`). Una
  // cuenta que ya escribe a su mejor marca no tiene nada que recuperar, y subirle
  // el objetivo solo la pondria por encima de lo que nunca ha hecho.
  function topPaceTarget(best, average = 0) {
    const top = Number(best);
    const avg = Number(average) > 0 ? Number(average) : 0;
    const floorTop = wpmInt(CONFIG.calibration.topFloorWpm) || 30;
    if (!Number.isFinite(top) || top < floorTop) return 0;
    const headroom = Number(CONFIG.calibration.topHeadroomRatio) || 1.15;
    if (avg > 0 && top < avg * headroom) return 0;
    const share = clamp(Number(CONFIG.calibration.topShare) || 0.85, 0.5, 1);
    const cap = Math.max(16, wpmInt(CONFIG.wpm.hardCap) - 2);
    return clamp(Math.round(top * share), wpmInt(CONFIG.calibration.minWpm) || 15, cap);
  }

  function recoveryPaceFloor(average, top) {
    const avg = Number(average);
    const best = Number(top);
    const minTop = Number(CONFIG.calibration.recoveryTopMin) || 80;
    if (!Number.isFinite(avg) || avg <= 0 || !Number.isFinite(best) || best < minTop) return 0;
    if (best < avg * 1.8) return 0;
    const ratio = Number(CONFIG.calibration.recoveryTopRatio) || 0.48;
    const cap = Number(CONFIG.calibration.recoveryTopCap) || 110;
    const jump = Number(CONFIG.calibration.recoveryTopJumpRatio) || 1.25;
    // El top solo puede recuperar un salto moderado sobre la media; si no,
    // una cuenta de 50 WPM heredaria el 110 de otra cuenta con top alto.
    return Math.min(cap, Math.round(best * ratio), Math.round(avg * jump));
  }

  // La media que de verdad puede sostener el bot: reciente e historica, con el
  // objetivo por top como centro. No incluye el override manual; ese se aplica
  // antes y no se mezcla con la calibracion automatica.
  function effectivePaceCenter(stats) {
    const values = [
      stats && stats.wpm,
      stats && stats.currentWpm,
      stats && stats.lifetimeWpm,
    ].map(Number).filter((value) => Number.isFinite(value) && value > 0);
    const average = values.length ? Math.max(...values) : 0;
    const top = stats && stats.bestWpm;
    const floor = recoveryPaceFloor(average, top);
    const share = topPaceTarget(top, average);
    return { average, center: Math.round(Math.max(average, floor, share)), floor, top: share };
  }

  // El suelo del top solo puede subir el objetivo. Para bajarlo esta el custom
  // o el reset explicito: asi una media corta nunca arrastra la calibracion.
  function applyCalibratedRange(value, options = {}) {
    let range = wpmRangeFor(value);
    if (!range) return { applied: false, range: calibratedRange, blocked: false };
    const previous = calibratedRange && Number.isFinite(calibratedRange.center)
      ? calibratedRange.center : null;
    if (options.allowLower !== true && previous !== null && range.center < previous - 0.5) {
      return { applied: false, range: calibratedRange, blocked: true };
    }
    // Subida por pasos: pasar de 104 a 196 en una carrera pone en el historial
    // de la cuenta un salto que ninguna persona hace. Cada calibracion (cada 30
    // min o 25 carreras) puede subir hasta un 25%, asi que la cuenta llega al
    // objetivo del top en tres lecturas. El override manual va exacto: si el
    // dueno lo escribe, es su decision.
    const maxStep = Number(CONFIG.calibration.maxStepRatio);
    if (options.allowLower !== true && previous !== null
      && Number.isFinite(maxStep) && maxStep > 1 && range.center > previous * maxStep) {
      range = wpmRangeFor(Math.round(previous * maxStep)) || range;
    }
    calibratedRange = range;
    disk.set(KEYS.calibratedRange, JSON.stringify(range));
    return { applied: true, range, blocked: false };
  }

  function accuracyRangeFor(value, maxCenter = 100) {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw < 96) return null;
    const top = clamp(Math.round(maxCenter), 96, 100);
    const center = clamp(Math.round(raw), 96, top);
    return { min: Math.max(96, center - 1), max: Math.min(top, center + 1), center };
  }

  function applyCalibratedAccuracy(value, options = {}) {
    const range = accuracyRangeFor(value, options.maxCenter);
    if (!range) return { applied: false, range: calibratedAccuracy, blocked: false };
    const previous = calibratedAccuracy && Number.isFinite(calibratedAccuracy.center)
      ? calibratedAccuracy.center : null;
    if (options.allowLower !== true && previous !== null && range.center < previous - 0.5) {
      return { applied: false, range: calibratedAccuracy, blocked: true };
    }
    calibratedAccuracy = range;
    CONFIG.accuracy.min = range.min;
    CONFIG.accuracy.max = range.max;
    disk.set(KEYS.calibratedAccuracy, JSON.stringify(range));
    return { applied: true, range, blocked: false };
  }

  function customWpm() {
    const value = Number(CONFIG.calibration.customWpm);
    const cap = Math.max(16, wpmInt(CONFIG.wpm.hardCap) - 1);
    return Number.isFinite(value) && value >= 15 ? clamp(Math.round(value), 15, cap) : 0;
  }

  function customAccuracy() {
    const value = Number(CONFIG.calibration.customAccuracy);
    return Number.isFinite(value) && value >= 96 ? clamp(Math.round(value), 96, 100) : 0;
  }

  function paceRange(name = paceProfile) {
    const cap = Number.isFinite(CONFIG.wpm.hardCap) ? CONFIG.wpm.hardCap : 120;
    const floor = Math.max(1, Number(CONFIG.calibration.minWpm) || 15);

    // Con una media de cuenta, los tres perfiles se mueven alrededor de ELLA:
    // soft baja media anchura, fast sube media anchura y balanced se queda en
    // el centro. Antes soft/fast eran 98-108/110-119 fijos: una cuenta de 43
    // que tocara fast saltaba a 90+ y eso es justo lo que hay que evitar.
    if (CONFIG.calibration.auto && calibratedRange) {
      const width = Math.max(0, calibratedRange.max - calibratedRange.min);
      const shift = name === 'soft'
        ? -Math.round(width / 2)
        : name === 'fast' ? Math.round(width / 2) : 0;
      const max = clamp(calibratedRange.max + shift, floor, cap);
      const min = clamp(calibratedRange.min + shift, floor, max);
      return { min: Math.min(min, max), max };
    }

    const tier = PACE_PROFILES[name] || PACE_PROFILES.balanced;
    const max = clamp(tier.max, floor, cap);
    const min = clamp(tier.min, floor, max);
    return { min: Math.min(min, max), max };
  }

  // Version del objeto autoTyperPrefs. La lectura sigue aceptando objetos sin
  // `schema` (instalaciones antiguas): los campos nuevos se rellenan con su
  // valor seguro y el siguiente guardado ya escribe la version actual.
  const PREFS_SCHEMA = 2;

  // Interruptores que antes vivian solo en CONFIG: apagar uno desde el panel se
  // perdia en la siguiente recarga. Ahora se guardan en autoTyperPrefs.
  function readPrefs() {
    let saved = null;
    try {
      saved = JSON.parse(disk.get(KEYS.prefs) || 'null');
    } catch {
      saved = null;
    }
    if (!saved || typeof saved !== 'object') saved = {};

    const flag = (key) => (typeof saved[key] === 'boolean' ? saved[key] : true);
    return {
      schema: Math.max(1, Number(saved.schema) || 1),
      breaks: flag('breaks'),
      mysteryBox: flag('mysteryBox'),
      stickers: flag('stickers'),
      guard: flag('guard'),
      backgroundFarm: saved.backgroundFarm === true,
      keepAlive: saved.keepAlive === true,
      afkRequireKeepAlive: saved.afkRequireKeepAlive === true,
      // Ausente en instalaciones viejas: se estrena activado porque solo actua
      // ante la correlacion freeze -> DQ, no en una carrera normal.
      afkFreezeGuard: saved.afkFreezeGuard !== false,
      notifications: saved.notifications === true,
      useNitro: flag('useNitro'),
      nitroStrategy: normalizeNitroStrategy(saved.nitroStrategy),
      challenges: flag('challenges'),
      calibration: true,
      customWpm: Number.isFinite(Number(saved.customWpm)) && Number(saved.customWpm) >= 15
        ? clamp(Math.round(Number(saved.customWpm)), 15, Math.max(16, wpmInt(CONFIG.wpm.hardCap) - 1)) : 0,
      customAccuracy: Number.isFinite(Number(saved.customAccuracy)) && Number(saved.customAccuracy) >= 96
        ? clamp(Math.round(Number(saved.customAccuracy)), 96, 100) : 0,
    };
  }

  function savePrefs() {
    disk.set(KEYS.prefs, JSON.stringify({
      schema: PREFS_SCHEMA,
      breaks: CONFIG.breaks.enabled !== false,
      mysteryBox: CONFIG.mysteryBox.enabled !== false,
      stickers: CONFIG.stickers.enabled !== false,
      guard: CONFIG.guard.enabled !== false,
      backgroundFarm: CONFIG.queue.backgroundFarm === true,
      keepAlive: CONFIG.queue.keepAlive === true,
      afkRequireKeepAlive: CONFIG.queue.afkRequireKeepAlive === true,
      afkFreezeGuard: CONFIG.queue.afkFreezeGuard !== false,
      notifications: CONFIG.notifications.enabled === true,
      useNitro: CONFIG.useNitro !== false,
      nitroStrategy: normalizeNitroStrategy(CONFIG.nitroStrategy),
      challenges: CONFIG.challenges.enabled !== false,
      calibration: CONFIG.calibration.auto !== false,
      customWpm: customWpm(),
      customAccuracy: customAccuracy(),
    }));
  }

  // AFK se cambia en el iframe de la carrera (TUNE) o en el garaje (ventana
  // superior). El objeto de prefs puede tener otros ajustes que esta ventana no
  // conoce; se fusiona solo esta clave para no pisarlos.
  function saveQueuePref(key, next) {
    let saved = {};
    try {
      const raw = JSON.parse(disk.get(KEYS.prefs) || '{}');
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) saved = raw;
    } catch {
      saved = {};
    }
    // Se fusiona una sola clave para no pisar ajustes que la otra ventana
    // conoce y esta no. El schema sube al guardar, sin tocar el resto.
    saved.schema = PREFS_SCHEMA;
    saved[key] = next === true;
    try { disk.set(KEYS.prefs, JSON.stringify(saved)); } catch { /* modo privado */ }
  }

  const savePrefFlag = saveQueuePref;

  function saveBackgroundFarmPref(next) {
    saveQueuePref('backgroundFarm', next);
  }

  function saveKeepAlivePref(next) {
    saveQueuePref('keepAlive', next);
  }

  // Se aplica ANTES de que se sortee la serie de WPM: el rango del perfil entra
  // en la firma de la serie, asi que cambiarlo rehace los objetivos solo.
  ensureCalibrationAccount();
  (function applyPrefs() {
    const prefs = readPrefs();
    CONFIG.breaks.enabled = prefs.breaks;
    CONFIG.mysteryBox.enabled = prefs.mysteryBox;
    CONFIG.stickers.enabled = prefs.stickers;
    CONFIG.guard.enabled = prefs.guard;
    CONFIG.queue.backgroundFarm = prefs.backgroundFarm;
    CONFIG.queue.keepAlive = prefs.keepAlive;
    CONFIG.queue.afkRequireKeepAlive = prefs.afkRequireKeepAlive;
    CONFIG.queue.afkFreezeGuard = prefs.afkFreezeGuard;
    CONFIG.notifications.enabled = prefs.notifications;
    CONFIG.useNitro = prefs.useNitro;
    CONFIG.nitroStrategy = prefs.nitroStrategy;
    CONFIG.challenges.enabled = prefs.challenges;
    // La calibracion no es un modo que se pueda apagar: el ritmo SIEMPRE sale
    // de las estadisticas de la cuenta. Se ignora cualquier `false` viejo y se
    // conserva el interruptor guardado solo por compatibilidad.
    CONFIG.calibration.auto = true;
    CONFIG.calibration.customWpm = prefs.customWpm;
    CONFIG.calibration.customAccuracy = prefs.customAccuracy;
    CONFIG.challenges.selector = disk.get(KEYS.challengeSelector, '') || '';

    // Primera foto SIN esperar al fetch: el garaje ya dejo avgSpeed y
    // highestSpeed en persist:nt. El override manual manda; si no hay, la
    // media corta solo puede subir el rango, nunca pisar uno mas alto. Antes
    // esta linea sobreescribia 110-116 con un avgSpeed de 38 en cada recarga.
    if (CONFIG.calibration.auto) {
      const persisted = readPersistedUser();
      // El techo va ANTES del rango: con el techo viejo (120) el centro que sale
      // del top se recortaba y la cuenta volvia a escribir a 119 al recargar.
      if (persisted && persisted.bestWpm) applyCeiling(persisted.bestWpm);
      const manual = customWpm();
      if (manual) {
        applyCalibratedRange(manual, { allowLower: true });
      } else if (persisted) {
        const center = effectivePaceCenter(persisted).center;
        if (center) applyCalibratedRange(center);
        if (!accountStats) accountStats = { ...persisted, targetWpm: center || persisted.wpm };
        // La misma coherencia al recargar: el target que se enseña es el del
        // rango calibrado, no un centro que el trinquete pudo bloquear.
        if (accountStats && calibratedRange
          && (accountStats.targetWpm < calibratedRange.min || accountStats.targetWpm > calibratedRange.max)) {
          accountStats.targetWpm = Math.round((calibratedRange.min + calibratedRange.max) / 2);
        }
      }
    }
    const manualAccuracy = customAccuracy();
    if (manualAccuracy) applyCalibratedAccuracy(manualAccuracy, { allowLower: true });

    const range = paceRange();
    CONFIG.wpm.min = range.min;
    CONFIG.wpm.max = range.max;
  })();

  function series(key, count, min, max, pace = '') {
    // El perfil forma parte de la firma: dos perfiles pueden compartir rango
    // (balanced calibrado y otro futuro), y la serie no debe reutilizarse como
    // si sus objetivos fueran del mismo ritmo.
    const signature = `${pace}:${count}:${min}:${max}`;
    let stored = null;
    try {
      stored = JSON.parse(disk.get(key, 'null'));
    } catch {
      stored = null;
    }

    const valid = disk.get(`${key}:signature`) === signature
      && Array.isArray(stored)
      && stored.length === count
      && stored.every((value) => Number.isInteger(value) && value >= min && value <= max);

    if (valid) return stored;

    const next = Array.from({ length: count }, () => randInt(min, max));
    disk.set(key, JSON.stringify(next));
    disk.set(`${key}:signature`, signature);
    return next;
  }

  const profile = {
    wpm: series(KEYS.wpmSeries, CONFIG.sessions, CONFIG.wpm.min, CONFIG.wpm.max, paceProfile),
    accuracy: series(KEYS.accSeries, CONFIG.sessions, CONFIG.accuracy.min, CONFIG.accuracy.max),

    get wpmSession() {
      return clamp(readCount(KEYS.wpmCount), 1, this.wpm.length);
    },
    get accSession() {
      return clamp(readCount(KEYS.accCount), 1, this.accuracy.length);
    },
    get bufferSession() {
      return clamp(readCount(KEYS.bufferCount), 1, CONFIG.accuracyBuffers.length);
    },
    get targetWPM() {
      return this.wpm[this.wpmSession - 1];
    },
    get targetAccuracy() {
      return this.accuracy[this.accSession - 1];
    },
    get accuracyGoal() {
      // Un custom de 100% no puede terminar en 100.7 por el buffer: el juego no
      // permite pasar de 100 y el objetivo quedaria inalcanzable.
      return Math.min(100, this.targetAccuracy + CONFIG.accuracyBuffers[this.bufferSession - 1]);
    },
  };

  // Ritmo y precision de ESTA carrera. La tanda sortea un objetivo y lo comparte
  // con sus diez carreras; una persona no clava el mismo numero dos veces
  // seguidas, y una velocidad demasiado plana es justo lo que el anti-cheat del
  // sitio mira (docs/RESEARCH.md, seccion 1). El desvio se sortea por carrera
  // dentro de la banda calibrada, asi que la media de la tanda no se mueve.
  function raceWpmAt(base, drift) {
    const value = Number(base);
    if (!Number.isFinite(value)) return 0;
    const min = Math.min(Number(CONFIG.wpm.min) || value, value);
    const max = Math.max(Number(CONFIG.wpm.max) || value, value);
    return clamp(Math.round(value + (Number(drift) || 0)), Math.max(1, min), max);
  }

  // Objetivo de la carrera sin el desvio del dia: centro de la tanda por la
  // curva horaria, recortado a la banda que el panel declara para la cuenta.
  // El recorte importa: de noche la curva pide un 5% menos y sin el la carrera
  // saldria de la banda calibrada, que es justo el numero que el usuario lee.
  function plannedRaceWpmAt(curve = dayCurveAt()) {
    const curved = Math.round(profile.targetWPM * curve);
    const band = wpmRangeFor(profile.targetWPM);
    return band ? clamp(curved, band.min, band.max) : curved;
  }

  function plannedRaceWpm() {
    return plannedRaceWpmAt();
  }

  // La banda manda tambien sobre el desvio: de madrugada el plan ya cae en el
  // suelo de la banda, y un -2 sin recorte sacaba la carrera del rango que el
  // panel muestra.
  function raceWpmInBand(planned, drift) {
    const value = raceWpmAt(planned, drift);
    const band = wpmRangeFor(profile.targetWPM);
    return band ? clamp(value, band.min, band.max) : value;
  }

  function raceWpm() {
    // La hora del dia entra aqui y no en el objetivo de la tanda: la tanda se
    // calibra una vez y la curva cambia cada hora, asi que el centro sigue
    // siendo el de la cuenta y lo que se mueve es lo que se teclea ahora.
    return raceWpmInBand(plannedRaceWpm(), session.raceWpmDrift);
  }

  function raceAccuracyGoal() {
    const drift = Number(session.raceAccDrift) || 0;
    return clamp(profile.accuracyGoal + drift, CONFIG.accuracy.min, 100);
  }

  function rollRaceDrift() {
    // +-2 WPM (1% a 196, 2% a 104) y medio punto de precision: suficiente para
    // que dos carreras no sean la misma foto, pequeño para no mover la tanda.
    session.raceWpmDrift = randInt(-2, 2);
    session.raceAccDrift = randInt(-1, 1) / 2;
    return { wpm: raceWpm(), accuracy: raceAccuracyGoal(), wpmDrift: session.raceWpmDrift, accDrift: session.raceAccDrift };
  }

  function advanceSessions() {
    const bump = (key, max) => {
      const next = readCount(key) + 1;
      const value = next > max ? 1 : next;
      disk.set(key, String(value));
      return value;
    };

    const wpmSession = bump(KEYS.wpmCount, profile.wpm.length);
    bump(KEYS.accCount, profile.accuracy.length);
    bump(KEYS.bufferCount, CONFIG.accuracyBuffers.length);

    // Al cerrar el ciclo se sortean series nuevas.
    if (wpmSession === 1) {
      for (const key of [KEYS.wpmSeries, KEYS.accSeries]) {
        disk.remove(key);
        disk.remove(`${key}:signature`);
      }
      profile.wpm = series(KEYS.wpmSeries, CONFIG.sessions, CONFIG.wpm.min, CONFIG.wpm.max, paceProfile);
      profile.accuracy = series(KEYS.accSeries, CONFIG.sessions, CONFIG.accuracy.min, CONFIG.accuracy.max);
    }
  }

  // Cambio de perfil en caliente: reajusta el rango y vuelve a sortear la serie
  // de objetivos (la firma guardada en disco deja de coincidir y series() la
  // regenera sola). No toca la precision ni el historial.
  function setPaceProfile(name, options = {}) {
    if (!PACE_PROFILES[name]) return false;

    const before = paceProfile;
    paceProfile = name;
    const range = paceRange(name);
    CONFIG.wpm.min = range.min;
    CONFIG.wpm.max = range.max;
    // El perfil va en la firma igual que en la declaracion y en advanceSessions:
    // si no, la serie guardada de otro perfil con el mismo rango se reutilizaba.
    profile.wpm = series(KEYS.wpmSeries, CONFIG.sessions, CONFIG.wpm.min, CONFIG.wpm.max, paceProfile);
    if (options.persist !== false) disk.set(KEYS.paceProfile, name);

    if (before !== name || options.force) {
      log(`Pace profile ${name.toUpperCase()}: target ${CONFIG.wpm.min}-${CONFIG.wpm.max} WPM (ceiling ${CONFIG.wpm.hardCap}).`);
      paintPace();
      paintConfig();
      updatePanel();
    }
    return true;
  }

  // Overrides manuales: 0/empty vuelve a automatico. Un valor manual si puede
  // bajar el objetivo; la calibracion automatica no, para que una media corta
  // no arrastre el ritmo hacia abajo.
  function setCustomWpm(value, options = {}) {
    const raw = Number(value);
    const next = !Number.isFinite(raw) || raw <= 0
      ? 0 : clamp(Math.round(raw), 15, Math.max(16, wpmInt(CONFIG.wpm.hardCap) - 1));
    if (next === customWpm()) return false;

    CONFIG.calibration.customWpm = next;
    if (options.persist !== false) savePrefs();
    if (next) {
      applyCalibratedRange(next, { allowLower: true });
      setPaceProfile(paceProfile, { force: true });
      log(`Custom WPM: ${next} target, range ${CONFIG.wpm.min}-${CONFIG.wpm.max}. Automatic calibration is overridden until you clear it.`);
    } else {
      const source = accountStats || readPersistedUser();
      const center = effectivePaceCenter(source || {}).center;
      if (center && applyCalibratedRange(center, { allowLower: true }).applied) {
        setPaceProfile(paceProfile, { force: true });
        log(`Custom WPM cleared; automatic target ${CONFIG.wpm.min}-${CONFIG.wpm.max} WPM.`);
      } else {
        log('Custom WPM cleared; keeping the current automatic range.');
      }
    }
    paintConfig();
    paintCalibration();
    updatePanel();
    return true;
  }

  function setCustomAccuracy(value, options = {}) {
    const raw = Number(value);
    const next = !Number.isFinite(raw) || raw <= 0 ? 0 : clamp(Math.round(raw), 96, 100);
    if (next === customAccuracy()) return false;

    CONFIG.calibration.customAccuracy = next;
    if (options.persist !== false) savePrefs();
    if (next) {
      applyCalibratedAccuracy(next, { allowLower: true });
      log(`Custom accuracy: ${next}% target, range ${CONFIG.accuracy.min}-${CONFIG.accuracy.max}%. Automatic calibration is overridden until you clear it.`);
    } else {
      const source = accountStats || readPersistedUser();
      const accuracy = Number(source && source.accuracy);
      if (Number.isFinite(accuracy) && accuracy >= 96) {
        applyCalibratedAccuracy(accuracy, { allowLower: true, maxCenter: 99 });
        log(`Custom accuracy cleared; automatic range ${CONFIG.accuracy.min}-${CONFIG.accuracy.max}%.`);
      } else {
        log('Custom accuracy cleared; keeping the current automatic range.');
      }
    }
    profile.accuracy = series(KEYS.accSeries, CONFIG.sessions, CONFIG.accuracy.min, CONFIG.accuracy.max);
    paintConfig();
    paintCalibration();
    updatePanel();
    return true;
  }

  /* --------------------------------------------------------------------------
   * Auto-calibracion del ritmo (API de stats)
   * ------------------------------------------------------------------------ */
  // El API devuelve la media de la cuenta dentro de un objeto con varias capas
  // (`data.stats.wpm`, `data.speed`, etc.). No hay contrato publico del JSON, asi
  // que se busca la primera clave conocida con un valor plausible en vez de
  // clavar una ruta que cambie con el proximo parche.
  function pickAccountStat(value, keys, min, max, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 4) return null;

    for (const key of keys) {
      const number = Number(value[key]);
      // El rango descarta velocidades de coche, niveles y porcentajes.
      if (Number.isFinite(number) && number >= min && number <= max) return number;
    }

    for (const child of Object.values(value)) {
      const found = pickAccountStat(child, keys, min, max, depth + 1);
      if (found) return found;
    }
    return null;
  }

  // El resumen del API no siempre trae las medias: el juego las guarda en
  // `persist:nt`, con el objeto `user` serializado otra vez. Es la misma cifra
  // que el perfil pinta en el garaje, asi que sirve de respaldo cuando el API
  // solo devuelve contadores de carreras.
  function readPersistedUser() {
    try {
      const raw = JSON.parse(persistRaw());
      if (!raw || !raw.user) return null;
      const user = JSON.parse(raw.user);
      const wpm = Number(user.avgSpeed);
      const accuracy = Number(user.avgAcc);
      const bestWpm = Number(user.highestSpeed !== undefined ? user.highestSpeed : user.bestSpeed);
      const races = Number(user.racesPlayed !== undefined ? user.racesPlayed : user.races);
      return {
        wpm: Number.isFinite(wpm) && wpm >= 15 && wpm <= 300 ? wpm : null,
        accuracy: Number.isFinite(accuracy) && accuracy >= 50 && accuracy <= 100 ? accuracy : null,
        bestWpm: Number.isFinite(bestWpm) && bestWpm >= 15 && bestWpm <= 400 ? bestWpm : null,
        races: Number.isFinite(races) && races >= 0 ? Math.round(races) : null,
        source: 'persist:nt',
      };
    } catch {
      return null;
    }
  }

  function accountHeaders() {
    const headers = { accept: 'application/json, text/plain, */*' };
    try {
      const token = readToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        const claims = jwtClaims(token);
        if (claims && claims.sub) headers['x-uid'] = String(claims.sub);
      }
    } catch { /* token ilegible: la cookie sigue valiendo */ }
    return headers;
  }

  function accountRows(body) {
    const candidates = [
      body,
      body && body.data,
      body && body.results,
      body && body.data && body.data.rows,
      body && body.results && body.results.rows,
    ];
    return candidates.find(Array.isArray) || [];
  }

  function readLifetimeCache(races) {
    try {
      const raw = JSON.parse(disk.get(KEYS.lifetimeWpm, 'null'));
      if (!raw || !Number.isFinite(raw.wpm) || !Number.isFinite(raw.at)) return null;
      // Otra cuenta puede tener un total parecido; un cambio grande de carreras
      // invalida la foto para no calibrar una cuenta con la media de otra.
      if (raw.races && races && Math.abs(raw.races - races) > Math.max(500, races * 0.2)) return null;
      return {
        ...raw,
        rows: Number(raw.rows) || 0,
        pages: Number(raw.pages) || 0,
      };
    } catch {
      return null;
    }
  }

  // La media que pinta el perfil es una ventana corta: si el bot corre por
  // debajo, sus propias carreras la empujan hacia abajo y la calibracion se
  // retroalimenta. Los totales mensuales del mismo API dan la media de toda la
  // cuenta; se usa como suelo, nunca como excusa para bajar el ritmo.
  async function fetchLifetimeWpm(races) {
    const cached = readLifetimeCache(races);
    const cacheValue = cached ? {
      wpm: cached.wpm,
      at: cached.at,
      rows: Number(cached.rows) || 0,
      pages: Number(cached.pages) || 0,
      cached: true,
      stale: false,
    } : null;
    const now = Date.now();
    if (cacheValue && now - cached.at < 24 * 60 * 60 * 1000) return cacheValue;

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), CONFIG.calibration.timeoutMs) : null;
    let typed = 0;
    let secs = 0;
    let totalRaces = 0;
    let rowsSeen = 0;
    let pagesSeen = 0;
    let complete = true;

    try {
      const headers = accountHeaders();
      for (let page = 0; page < 12; page++) {
        // Una pagina que falla no invalida todo el historico: se reintenta una
        // vez antes de rendirse. El reintento tambien cubre un corte breve de
        // red; la lectura completa sigue siendo la unica que mueve el objetivo.
        let response = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            response = await fetch(`/api/v2/stats/data/bymonth?page=${page}&limit=30`, {
              method: 'GET',
              credentials: 'include',
              headers,
              signal: controller ? controller.signal : undefined,
            });
            if (response.ok) break;
          } catch (error) {
            if (error && error.name === 'AbortError') throw error;
          }
          if (attempt === 0) await sleep(250);
        }
        if (!response || !response.ok) {
          complete = false;
          break;
        }
        pagesSeen++;
        const body = await response.json();
        const rows = accountRows(body);
        if (!rows.length) break;

        for (const row of rows) {
          const rowTyped = Number(row && (row.typed ?? row.characters ?? row.chars));
          const rowSecs = Number(row && (row.secs ?? row.seconds ?? row.time));
          const rowRaces = Number(row && row.races);
          if (Number.isFinite(rowTyped) && rowTyped > 0
            && Number.isFinite(rowSecs) && rowSecs > 0) {
            typed += rowTyped;
            secs += rowSecs;
            rowsSeen++;
          }
          if (Number.isFinite(rowRaces) && rowRaces > 0) totalRaces += rowRaces;
        }
        if (rows.length < 30) break;
      }

      // Una pagina que falla a mitad deja una foto parcial: usarla como
      // historico bajaria el objetivo sin que el usuario haya empeorado.
      if (!complete) return cacheValue ? { ...cacheValue, stale: true } : null;
      if (!rowsSeen || typed <= 0 || secs <= 0) return cacheValue ? { ...cacheValue, stale: true } : null;
      const wpm = (typed / 5) / (secs / 60);
      if (!Number.isFinite(wpm) || wpm < 15 || wpm > 300) {
        return cacheValue ? { ...cacheValue, stale: true } : null;
      }
      const result = {
        wpm,
        at: now,
        rows: rowsSeen,
        pages: pagesSeen,
        cached: false,
        stale: false,
      };
      disk.set(KEYS.lifetimeWpm, JSON.stringify({
        wpm,
        at: now,
        races: totalRaces || races || 0,
        rows: rowsSeen,
        pages: pagesSeen,
      }));
      return result;
    } catch {
      return cacheValue ? { ...cacheValue, stale: true } : null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function fetchAccountStats() {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), CONFIG.calibration.timeoutMs) : null;
    const failed = (reason) => ({ wpm: null, accuracy: null, reason });

    try {
      let data = null;
      const response = await fetch('/api/v2/stats/summary', {
        method: 'GET',
        credentials: 'include',
        headers: accountHeaders(),
        signal: controller ? controller.signal : undefined,
      });
      if (response.ok) {
        const body = await response.json();
        data = (body && (body.data || body.results)) || body;
      }

      const currentWpm = pickAccountStat(data, ['wpm', 'avgWpm', 'averageWpm', 'avg_wpm', 'average_wpm', 'speed'], 15, 300);
      const accuracy = pickAccountStat(data, ['accuracy', 'acc', 'avgAccuracy', 'averageAccuracy', 'avg_accuracy'], 50, 100);
      // El resumen tampoco tiene un contrato publico estable. Se buscan los
      // nombres que usa el perfil; si faltan, persist:nt los completa.
      const persisted = readPersistedUser();
      const bestWpm = pickAccountStat(data, ['bestWpm', 'highestSpeed', 'highestWpm', 'bestSpeed', 'topWpm', 'topSpeed'], 15, 400)
        || (persisted && persisted.bestWpm) || null;
      const races = pickAccountStat(data, ['racesPlayed', 'totalRaces', 'races'], 0, 100000000)
        || (persisted && persisted.races) || null;
      const lifetime = await fetchLifetimeWpm(races);
      const lifetimeWpm = lifetime ? lifetime.wpm : null;
      const wpm = Number(currentWpm) > 0 || Number(lifetimeWpm) > 0
        ? Math.max(Number(currentWpm) || 0, Number(lifetimeWpm) || 0)
        : null;
      const pace = effectivePaceCenter({ wpm, currentWpm, lifetimeWpm, bestWpm });
      const targetWpm = pace.center || wpm;
      const recovery = {
        average: pace.average || wpm || null,
        top: Number(bestWpm) > 0 ? Number(bestWpm) : null,
        floor: pace.floor || null,
      };

      if (wpm || targetWpm || accuracy) {
        accountStats = {
          wpm, targetWpm, recovery, currentWpm, lifetimeWpm, lifetime,
          accuracy, bestWpm, races, source: 'api',
        };
        return { ...accountStats, reason: null };
      }

      if (persisted && (persisted.wpm || persisted.accuracy)) {
        const persistedCenter = effectivePaceCenter({
          ...persisted,
          currentWpm: persisted.wpm,
          lifetimeWpm,
        });
        accountStats = {
          ...persisted,
          wpm: Number(lifetimeWpm) > Number(persisted.wpm) ? lifetimeWpm : persisted.wpm,
          targetWpm: persistedCenter.center || persisted.wpm,
          recovery: {
            average: persistedCenter.average || persisted.wpm || null,
            top: persisted.bestWpm || null,
            floor: persistedCenter.floor || null,
          },
          currentWpm: persisted.wpm,
          lifetimeWpm,
          lifetime,
        };
        return { ...accountStats, reason: null };
      }
      if (lifetimeWpm) {
        accountStats = {
          wpm: lifetimeWpm,
          targetWpm: lifetimeWpm,
          recovery: { average: lifetimeWpm, top: Number(bestWpm) || null, floor: null },
          currentWpm: null,
          lifetimeWpm,
          lifetime,
          accuracy: null,
          bestWpm,
          races,
          source: 'monthly',
        };
        return { ...accountStats, reason: null };
      }
      return failed(response.ok ? 'no average in the response' : `HTTP ${response.status}`);
    } catch (error) {
      return failed(error && error.name === 'AbortError' ? 'timeout' : 'network');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Coloca el centro del rango balanced en la media real de la cuenta. El
  // ancho lo decide wpmRangeFor; el techo duro se aplica alli. La calibracion
  // automatica solo sube: una media corta no puede borrar un objetivo alto.
  function applyCalibration(stats) {
    // Una lectura completa borra el error anterior y el backoff de reintento.
    calibrationError = '';
    calibrationFailures = 0;
    calibrationRetryAt = 0;
    const beforeWpm = { min: CONFIG.wpm.min, max: CONFIG.wpm.max };
    const beforeAcc = { min: CONFIG.accuracy.min, max: CONFIG.accuracy.max };
    // Primero el techo: el centro que sale del top no puede planificarse contra
    // el techo de la cuenta anterior.
    applyCeiling((stats && stats.bestWpm) || (stats && stats.recovery && stats.recovery.top));
    const manualWpm = customWpm();
    const manualAcc = customAccuracy();
    const pace = effectivePaceCenter(stats || {});
    const target = manualWpm || Number(stats && stats.targetWpm) || pace.center;

    if (target) {
      const applied = applyCalibratedRange(target, { allowLower: manualWpm > 0 });
      if (applied.range) {
        const range = applied.range;
        // El trinquete de subida puede dejar el centro por debajo del que se
        // pidio: la fila tiene que enseñar el target del rango que de verdad se
        // teclea, no el que se calculo antes del paso.
        if (accountStats) accountStats.targetWpm = range.center;
        if (applied.applied) {
          const top = Number(stats.bestWpm) > 0 ? `; top ${Number(stats.bestWpm).toFixed(0)} WPM` : '';
          const recent = Number(stats.currentWpm) || 0;
          const lifetime = Number(stats.lifetimeWpm) || 0;
          const profileAverage = Number(stats.wpm) || Math.max(recent, lifetime) || 0;
          const floor = Number(stats.recovery && stats.recovery.floor) || 0;
          const info = stats.lifetime;
          const provenance = info && info.rows
            ? `; ${info.rows} month${info.rows === 1 ? '' : 's'} / ${info.pages} page${info.pages === 1 ? '' : 's'}${info.stale ? ' cached' : ''}`
            : '';
          const topTarget = Number(pace.top) || 0;
          const source = manualWpm
            ? 'manual override'
            : topTarget > 0 && topTarget >= profileAverage
              ? `${wpmInt(Number(CONFIG.calibration.topShare) * 100)}% of the ${wpmInt(stats.bestWpm)} WPM account top (short average ${wpmInt(profileAverage)})`
              : floor > profileAverage + 0.5
              ? `recovery floor from the ${Number(stats.bestWpm).toFixed(0)} WPM top (short average ${wpmInt(profileAverage)})`
              : lifetime > recent + 0.5
                ? `lifetime ${lifetime.toFixed(1)}; short profile ${recent.toFixed(1)}`
                : 'account average';
          const count = Number(stats.races) > 0 ? `, ${Number(stats.races).toLocaleString()} races` : '';
          log(`Pace auto-calibrated: ${wpmInt(target)} WPM target (${source}${top}${provenance}${count}) -> ${range.min}-${range.max} under a ${CONFIG.wpm.hardCap} WPM ceiling.`);
        } else if (applied.blocked) {
          log(`Pace kept at ${range.min}-${range.max}: the latest data would lower it to ${wpmInt(target)} WPM. Use custom WPM or clear the override to reset it.`);
        }
        setPaceProfile(paceProfile, { force: true });
      }
    }

    // El target visible tiene que ser el del rango que de verdad se usa. Si el
    // trinquete bloquea una bajada, dejar targetWpm en el centro nuevo hacia
    // parecer que el bot apunta a 110 cuando sigue tecleando 117.
    if (!manualWpm && accountStats && calibratedRange
      && (accountStats.targetWpm < calibratedRange.min || accountStats.targetWpm > calibratedRange.max)) {
      accountStats.targetWpm = Math.round((calibratedRange.min + calibratedRange.max) / 2);
    }

    if (manualAcc) {
      const applied = applyCalibratedAccuracy(manualAcc, { allowLower: true });
      if (applied.applied) {
        profile.accuracy = series(KEYS.accSeries, CONFIG.sessions, CONFIG.accuracy.min, CONFIG.accuracy.max);
        log(`Accuracy set manually: ${manualAcc}% -> ${CONFIG.accuracy.min}-${CONFIG.accuracy.max}%.`);
      }
    } else if (stats.accuracy) {
      // 96% es el acantilado de la recompensa: por debajo se cobra $0. Se deja
      // un punto arriba y otro abajo de la media, sin llegar nunca al 100% (que
      // canta en una cuenta normal) ni bajar del suelo.
      if (stats.accuracy < 96) {
        log(`Accuracy calibration skipped: account average ${stats.accuracy.toFixed(1)}% is under the 96% reward floor; keeping ${CONFIG.accuracy.min}-${CONFIG.accuracy.max}%.`);
      } else {
        const applied = applyCalibratedAccuracy(stats.accuracy, { maxCenter: 99 });
        if (applied.applied) {
          profile.accuracy = series(KEYS.accSeries, CONFIG.sessions, CONFIG.accuracy.min, CONFIG.accuracy.max);
          log(`Accuracy auto-calibrated: account average ${stats.accuracy.toFixed(1)}% -> ${CONFIG.accuracy.min}-${CONFIG.accuracy.max}%.`);
        } else if (applied.blocked) {
          log(`Accuracy kept at ${CONFIG.accuracy.min}-${CONFIG.accuracy.max}: the latest average would lower it.`);
        }
      }
    }

    const moved = beforeWpm.min !== CONFIG.wpm.min || beforeWpm.max !== CONFIG.wpm.max
      || beforeAcc.min !== CONFIG.accuracy.min || beforeAcc.max !== CONFIG.accuracy.max;
    if (moved && session && session.races > 0) {
      log(`Calibration changed the target mid-session (race ${session.races}): ${beforeWpm.min}-${beforeWpm.max} -> ${CONFIG.wpm.min}-${CONFIG.wpm.max} WPM, ${beforeAcc.min}-${beforeAcc.max} -> ${CONFIG.accuracy.min}-${CONFIG.accuracy.max}% accuracy. The rest of this session uses the new range.`);
    }

    disk.set(KEYS.calibrationAt, String(Date.now()));
    calibrationNeedsAccountRead = false;
    calibrationRaceMark = session ? session.races : 0;
    rememberCalibrationAccount();
    paintCalibration();
    updatePanel();
    return { wpm: calibratedRange, accuracy: calibratedAccuracy };
  }

  let calibrating = false;
  let calibrationProbeAt = 0;

  async function maybeCalibrate(force = false) {
    if (calibrating) return;
    // No competir con una carrera viva: el fetch espera a que el tipador pare.
    if (session && session.typing) return;

    // El latido llama aqui cada 500 ms; leer `calibrationAt` dos veces por
    // segundo para descubrir que aun faltan 30 min es trabajo inutil. Esta
    // sonda en memoria deja pasar una comprobacion por minuto como maximo.
    const now = Date.now();
    if (!force && now - calibrationProbeAt < 60000) return;
    calibrationProbeAt = now;

    // Al cambiar de version se vuelve a leer aunque la foto anterior sea
    // reciente: asi una release nueva no sigue usando un rango viejo durante
    // media hora. Tras un fallo, el reintento corto salta antes del refresco
    // normal; solo se espera la ventana de 30 min cuando la lectura fue bien.
    const versionChanged = disk.get(KEYS.calibrationVersion, '') !== VERSION;
    const retryDue = calibrationRetryAt > 0 && now >= calibrationRetryAt;
    const last = calibrationStamp();
    if (!force && !versionChanged && !retryDue && now - last < CONFIG.calibration.refreshMs) return;
    if (retryDue) calibrationRetryAt = 0;

    calibrating = true;
    paintCalibration();
    try {
      const result = await fetchAccountStats();
      if (result.wpm || result.accuracy) {
        applyCalibration(result);
        return;
      }
      // Un fallo tambien marca la hora: si no, el latido reintentaria cada
      // 500 ms contra un API que no contesta. El backoff es corto las dos
      // primeras veces y se relaja si el API sigue caido.
      const reason = result.reason || 'no data';
      calibrationError = reason;
      calibrationFailures += 1;
      const retryMs = calibrationFailures >= 3 ? 15 * 60 * 1000 : 2 * 60 * 1000;
      calibrationRetryAt = Date.now() + retryMs;
      disk.set(KEYS.calibrationAt, String(Date.now()));
      if (force || calibrationFailures === 1) {
        log(`Pace calibration: ${reason}; keeping ${CONFIG.wpm.min}-${CONFIG.wpm.max} WPM / ${CONFIG.accuracy.min}-${CONFIG.accuracy.max}%. Retrying in ${Math.round(retryMs / 60000)} min.`);
      }
    } finally {
      disk.set(KEYS.calibrationVersion, VERSION);
      calibrating = false;
      paintCalibration();
    }
  }

  // La calibracion es siempre automatica; este pequeño gesto solo adelanta la
  // lectura. No existe un estado "off" que pueda dejar el ritmo congelado.
  function refreshCalibration() {
    clearPersistRaw();
    log('Pace auto-calibration: refreshing from the account stats.');
    maybeCalibrate(true);
    paintCalibration();
  }

  function paintCalibration() {
    if (!panel.refs || !panel.refs.cal) return;

    if (!accountStats) accountStats = readPersistedUser();
    // Cuando el suelo de recuperacion empuja el objetivo por encima de la
    // media corta, la fila lo dice con las tres cifras juntas. Antes solo
    // enseñaba "38.0 WPM" al lado de un objetivo de 110 y parecia que el bot
    // seguia calibrado a 38.
    const accountAvg = Number(accountStats && accountStats.wpm) || 0;
    const accountTarget = Number(accountStats && accountStats.targetWpm) || 0;
    const accountTop = Number(accountStats && accountStats.bestWpm) || 0;
    const accountRaised = accountTarget > 0 && accountAvg > 0
      && Math.abs(accountTarget - accountAvg) >= 0.5;
    const accountText = accountStats && (accountAvg || accountStats.accuracy)
      ? [
        accountAvg ? `${wpmInt(accountAvg)} ${accountRaised ? 'avg' : 'WPM'}` : '',
        accountRaised ? `${Math.round(accountTarget)} target` : '',
        accountRaised && accountTop > 0 ? `${Math.round(accountTop)} top` : '',
        accountStats.accuracy ? `${accountStats.accuracy.toFixed(1)}%` : '',
      ].filter(Boolean).join(' · ')
      : '—';

    const wpmText = calibratedRange ? `${calibratedRange.min}-${calibratedRange.max}` : '—';
    const accText = calibratedAccuracy ? `${calibratedAccuracy.min}-${calibratedAccuracy.max}%` : '—';
    const at = calibrationStamp();
    const accountId = disk.get(KEYS.calibrationAccount, '') || readAccountIdentity() || '';
    const lifetimeInfo = accountStats && accountStats.lifetime;
    const retryMinutes = calibrationRetryAt > Date.now()
      ? Math.max(1, Math.ceil((calibrationRetryAt - Date.now()) / 60000)) : 0;
    const acctState = calibrating ? 'reading'
      : calibrationError ? 'warn'
        : accountStats ? 'ready' : 'idle';
    const acctLabel = calibrating ? 'reading…'
      : calibrationError ? (retryMinutes ? `retry ${retryMinutes}m` : 'retry soon')
        : !accountStats ? 'waiting'
          : lifetimeInfo && lifetimeInfo.stale ? 'cached fallback'
            : lifetimeInfo && lifetimeInfo.cached ? 'cached 24h'
              : lifetimeInfo && lifetimeInfo.rows ? 'synced'
                : 'profile only';
    const acctHistory = lifetimeInfo && lifetimeInfo.rows
      ? `${lifetimeInfo.rows} mo · ${lifetimeInfo.pages} pg${lifetimeInfo.stale ? ' · stale' : lifetimeInfo.cached ? ' · cached' : ''}`
      : accountStats ? 'profile only' : '—';
    const acctRead = at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'never';
    // Calendario: el plan se pinta en la tarjeta de la cuenta, y cambia con la
    // hora (curva) y con el dia (descanso), asi que entra en la firma.
    const planWin = activeWindow();
    const planRestNow = isRestDay(at || Date.now());
    let planRestText = 'none';
    if (restDaysPerWeek() > 0) {
      if (planRestNow) planRestText = `today · back 00:00`;
      else {
        for (let day = 1; day <= 7; day++) {
          if (isRestDay((at || Date.now()) + day * MS_PER_DAY)) { planRestText = `in ${day}d`; break; }
        }
      }
    }
    const planCurve = dayCurveAt(at || Date.now());
    const planHours = !planWin.on || planWin.allDay
      ? 'all day'
      : `${planWin.startText}–${planWin.endText}`;
    const calSig = [wpmText, accText, accountText, at, accountId, acctState, acctLabel,
      planHours, planRestText, planCurve, localDayKey(at || Date.now()),
      acctHistory, acctRead, calibrating, calibrationError, calibrationRetryAt,
      Number(accountStats && accountStats.targetWpm) || 0,
      Number(accountStats && accountStats.bestWpm) || 0,
      Number(accountStats && accountStats.races) || 0].join('|');
    if (panel.calSig === calSig) {
      paintAccuracyDelta();
      return;
    }
    panel.calSig = calSig;

    setText(panel.refs.cal, 'on');
    setText(panel.refs.calWpm, wpmText);
    setText(panel.refs.calAcc, accText);
    setText(panel.refs.calAccount, accountText);

    // Tarjeta de cuenta de la vista Live: dice de donde salen el objetivo y el
    // historico, no solo el numero final. El boton fuerza una lectura nueva sin
    // tener que abrir TUNE.
    setText(panel.refs.acctId, accountId ? `#${accountId}` : 'not signed in');
    setText(panel.refs.acctAvg, accountStats && Number(accountStats.wpm) > 0
      ? String(wpmInt(accountStats.wpm)) : '—');
    setText(panel.refs.acctTarget, accountStats && Number(accountStats.targetWpm) > 0
      ? String(Math.round(Number(accountStats.targetWpm))) : '—');
    setText(panel.refs.acctTop, accountStats && Number(accountStats.bestWpm) > 0
      ? String(Math.round(Number(accountStats.bestWpm))) : '—');
    setText(panel.refs.acctHistory, acctHistory);
    setText(panel.refs.acctRange, wpmText === '—' ? '—' : `${wpmText} wpm`);
    setText(panel.refs.acctHours, planHours);
    setText(panel.refs.acctRest, planRestText);
    // La curva se ensena como desvio y como objetivo ya corregido: el centro de
    // la tanda no se mueve, lo que se mueve es lo que se teclea a esta hora.
    // Redondeado a por ciento: la curva cambia de a decimas y `−0%` es ruido.
    const curvePct = Math.round((1 - planCurve) * 100);
    setText(panel.refs.acctCurve, curvePct <= 0
      ? `none · ${raceWpm()} wpm`
      : `−${curvePct}% · ${raceWpm()} wpm`);
    setText(panel.refs.acctRead, acctRead);
    if (panel.refs.acctState) {
      setText(panel.refs.acctState, acctLabel);
      if (panel.refs.acctState.dataset.state !== acctState) {
        panel.refs.acctState.dataset.state = acctState;
      }
    }
    if (panel.refs.acctHistory) {
      panel.refs.acctHistory.title = lifetimeInfo && lifetimeInfo.rows
        ? `${lifetimeInfo.rows} monthly rows across ${lifetimeInfo.pages} API pages${lifetimeInfo.cached ? '; cached' : ''}${lifetimeInfo.stale ? '; using the last complete fallback' : ''}.`
        : 'The short profile has average and top; the monthly history adds the lifetime average.';
    }
    if (panel.refs.acctRead) {
      panel.refs.acctRead.title = at
        ? `Last full account read: ${new Date(at).toLocaleString()}.`
        : 'The account has not been read yet.';
    }
    if (panel.refs.acctRefresh) {
      const busy = Boolean(calibrating);
      if (panel.refs.acctRefresh.disabled !== busy) panel.refs.acctRefresh.disabled = busy;
      if (panel.refs.acctRefresh.getAttribute('aria-busy') !== String(busy)) {
        panel.refs.acctRefresh.setAttribute('aria-busy', String(busy));
      }
      panel.refs.acctRefresh.title = busy
        ? 'Reading the signed-in account now…'
        : 'Read the account again now: profile and full monthly history.';
    }

    // La chapa de la vista Live: el usuario ve de donde sale su objetivo sin
    // abrir TUNE. Se muestra el target, no la media corta que puede estar
    // hundida; el tooltip explica ambos numeros y el suelo de recuperacion.
    if (panel.refs.paceSource) {
      const manualWpm = customWpm();
      const average = !manualWpm && accountStats && Number(accountStats.targetWpm) > 0
        ? Math.round(Number(accountStats.targetWpm)) : null;
      const top = accountStats && Number(accountStats.bestWpm) > 0
        ? Math.round(Number(accountStats.bestWpm)) : null;
      const label = manualWpm
        ? `manual · ${manualWpm} wpm${customAccuracy() ? ` · ${customAccuracy()}% acc` : ''}`
        : average
          ? `auto · ${average} target${top ? ` · ${top} top` : ''}`
          : calibratedRange
            ? `auto · ${calibratedRange.min}–${calibratedRange.max} wpm`
            : 'auto · reading account';
      setText(panel.refs.paceSource, label);
      const recent = accountStats && Number(accountStats.currentWpm) > 0
        ? Math.round(Number(accountStats.currentWpm)) : null;
      const lifetime = accountStats && Number(accountStats.lifetimeWpm) > 0
        ? Math.round(Number(accountStats.lifetimeWpm)) : null;
      const profileAverage = accountStats && Number(accountStats.wpm) > 0
        ? Math.round(Number(accountStats.wpm)) : null;
      const lifetimeInfo = accountStats && accountStats.lifetime;
      const provenance = lifetimeInfo && lifetimeInfo.rows
        ? ` ${lifetimeInfo.rows} month${lifetimeInfo.rows === 1 ? '' : 's'} across ${lifetimeInfo.pages} page${lifetimeInfo.pages === 1 ? '' : 's'}${lifetimeInfo.stale ? ' (cached fallback)' : ''}.`
        : '';
      const recovery = accountStats && accountStats.recovery;
      const source = manualWpm
        ? ' Custom WPM is active; clear it to return to automatic calibration.'
        : recovery && recovery.floor && average && profileAverage && average > profileAverage
          ? ` The short profile average is ${profileAverage} WPM, but the ${top} WPM top sets a ${average} WPM recovery floor.${provenance}`
          : lifetime && recent && lifetime > recent
            ? ` The target is anchored to the lifetime monthly average${recent ? ` (${lifetime} WPM); the short profile window is ${recent} WPM` : ''}.${provenance}`
            : provenance;
      panel.refs.paceSource.title = `Pace target ${wpmText} WPM${top ? `; account top ${top} WPM` : ''}. Automatic calibration only raises the target; a short average cannot lower it. Use custom WPM or custom accuracy in TUNE to override it.${source}`;
    }

    // La tarjeta de la vista LOG: cuando se leyo y que rango dejo. Se pinta
    // aqui porque este es el unico sitio que corre al calibrar y al crear el
    // panel; no depende de que la pestana este abierta.
    setText(panel.refs.calLogWhen, at ? new Date(at).toLocaleString() : 'never');
    setText(panel.refs.calLogWpm, calibratedRange ? `${wpmText} WPM` : '—');
    setText(panel.refs.calLogAcc, calibratedAccuracy ? accText : '—');

    if (panel.refs.calRow) {
      panel.refs.calRow.title = `Always automatic from the account average${at ? ` (read ${new Date(at).toLocaleString()})` : ' (not read yet)'}: ${wpmText} WPM / ${accText} accuracy. The lifetime monthly average is used when it is higher than the short profile window. Click: refresh the stats now.`;
    }

    paintAccuracyDelta();
  }

  /* --------------------------------------------------------------------------
   * Popup de Daily Challenge
   * ------------------------------------------------------------------------ */
  let challengeSelectorWarned = false;
  let challengeScanAt = 0;
  let challengeClosedAt = 0;

  // El popup no tiene un HTML publico estable: se busca por lo que dice (la
  // palabra "challenge" y el aviso de completado) y se pulsa el boton de
  // siempre. Un selector puesto en TUNE manda y evita el barrido.
  // La ventana de arriba no comparte `session.typing` con el iframe: el contrato
  // `__ntaFrame` dice si hay tecleo vivo. Sirve para no barrer el DOM caro desde
  // las dos ventanas a la vez.
  function typerIsTyping() {
    if (session.typing) return true;
    try {
      const frame = window.__ntaFrame
        || (window.top !== window ? window.top.__ntaFrame : null);
      return Boolean(frame && Date.now() - frame.at < 5000
        && !frame.stopped && (frame.typing || frame.chars > 0));
    } catch {
      return false;
    }
  }

  function closeChallengePopup() {
    if (CONFIG.challenges.enabled === false) return false;
    if (!document.body) return false;
    // El popup aparece al cerrar la carrera; durante el tecleo no hay nada que
    // cerrar y el barrido de selectores anchos solo compite con el juego.
    if (typerIsTyping()) return false;
    if (Date.now() - challengeClosedAt < CONFIG.challenges.cooldownMs) return false;
    // Sin tecleo, un barrido cada 1,2 s basta: el popup sigue visible varios
    // segundos y no cambia de un tick a otro.
    if (Date.now() - challengeScanAt < 1200) return false;
    challengeScanAt = Date.now();
    perfCounters.challengeScans += 1;

    const selector = String(CONFIG.challenges.selector || '').trim();
    let roots = [];
    if (selector) {
      try {
        roots = Array.from(document.querySelectorAll(selector));
      } catch {
        if (!challengeSelectorWarned) {
          challengeSelectorWarned = true;
          log(`Challenge selector "${selector}" is not valid CSS; using text detection instead.`);
        }
      }
    }
    if (!roots.length) {
      roots = Array.from(document.querySelectorAll(
        '[class*="challenge" i], [id*="challenge" i], [role="dialog"], .modal, .popup, .race-results'
      ));
    }

    for (const root of roots) {
      if (!root || !root.getBoundingClientRect) continue;
      const box = root.getBoundingClientRect();
      if (box.width < 40 || box.height < 20) continue;

      const text = (root.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (!/challenge/i.test(text)) continue;
      if (!/(complete|completed|claim|collect|reward|earned)/i.test(text)) continue;
      // Un modal de DQ o de sesion puede contener "challenge" en un texto
      // secundario; cerrarlo antes de que clearDqModal lo vea seria peor que
      // dejar el popup abierto un latido mas.
      if (/(disqualif|logout warning|session will expire|currently in a race)/i.test(text)) continue;

      const buttons = Array.from(root.querySelectorAll('button, [role="button"], a'))
        .map((candidate) => {
          const rect = candidate.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) return null;
          if (candidate.disabled || candidate.getAttribute('aria-disabled') === 'true') return null;
          const label = (candidate.textContent || candidate.getAttribute('aria-label') || '').trim();
          // Cobrar manda: si el popup ofrece Collect y Continue, se pulsa
          // Collect. Cerrar con el generico dejaria el premio sin reclamar.
          const claim = /^(collect|claim)\b/i.test(label);
          const close = /^(continue|ok|okay|close|next|nice|got it|awesome|great)\b/i.test(label);
          if (!claim && !close) return null;
          return { candidate, label, score: claim ? 2 : 1 };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);
      const pick = buttons[0];
      if (!pick) continue;

      challengeClosedAt = Date.now();
      log(pick.score === 2
        ? `Daily Challenge popup: claiming the reward (${pick.label}).`
        : `Daily Challenge popup: closing it (${pick.label}).`);
      const delay = randInt(CONFIG.challenges.clickDelayMs[0], CONFIG.challenges.clickDelayMs[1]);
      // Con la pestana oculta el setTimeout se clampa; el reloj de fondo sigue
      // el retardo real del humano.
      preciseSleep(delay).then(() => {
        try { pick.candidate.click(); } catch { /* el popup se repinta */ }
      });
      return true;
    }
    return false;
  }

  function paintChallenges() {
    if (!panel.refs || !panel.refs.ch) return;

    const on = CONFIG.challenges.enabled !== false;
    setText(panel.refs.ch, on ? (CONFIG.challenges.selector ? 'on · sel' : 'on') : 'off');

    if (panel.refs.chRow) {
      const title = on
        ? `Daily Challenge popups are claimed/closed automatically${CONFIG.challenges.selector ? ` (selector: ${CONFIG.challenges.selector})` : ' (detected by text)'}. Click: turn off. Shift+click: set a CSS selector`
        : 'Daily Challenge popups are left alone. Click: claim and close them automatically. Shift+click: set a CSS selector';
      if (panel.refs.chRow.title !== title) panel.refs.chRow.title = title;
    }
  }

  // El chip del encabezado: sigue diciendo LEGIT (no hay otro ritmo) y ahora
  // lleva detras el perfil activo. Se pinta tambien al crear el panel.
  function paintPace() {
    if (!panel.refs || !panel.refs.pace) return;

    const tier = paceRange();
    setText(panel.refs.pace, `LEGIT · ${paceProfile}`);
    const paceTitle = `Pace profile: ${paceProfile} (target ${tier.min}-${tier.max} WPM, hard ceiling ${CONFIG.wpm.hardCap}). Click to change; all three keep the human cadence.`;
    if (panel.refs.pace.title !== paceTitle) panel.refs.pace.title = paceTitle;
    if (panel.root && panel.root.dataset.paceProfile !== paceProfile) panel.root.dataset.paceProfile = paceProfile;

    paintCalibration();
    paintChallenges();
  }

