
  /* ==========================================================================
   * 4. FINDING THE TYPING COMPONENT (REACT)
   * ========================================================================== */
  const FIBER_KEY = /^__reactFiber\$/;
  const PROPS_KEY = /^__reactProps\$/;

  function getFiber(node) {
    if (!node) return null;
    const key = Object.keys(node).find((name) => FIBER_KEY.test(name));
    return key ? node[key] : null;
  }

  function isTypingNode(node) {
    return Boolean(
      node
      && typeof node.handleKeyPress === 'function'
      && node.props
      && node.props.lessonContent != null
    );
  }

  function findTypingApp() {
    const container = document.querySelector('div.dash-copyContainer')
      || document.querySelector('[class*="copyContainer"]');
    if (!container) return null;

    // 1) Subir por el arbol de React hasta el componente que sabe escribir.
    //    Es estable entre versiones, a diferencia de Object.values(...)[1].
    let fiber = getFiber(container);
    let depth = 0;
    while (fiber && depth++ < 80) {
      if (isTypingNode(fiber.stateNode)) return fiber.stateNode;
      fiber = fiber.return;
    }

    // 2) Compatibilidad con scripts antiguos: props.children._owner.stateNode.
    for (const key of Object.keys(container)) {
      if (!PROPS_KEY.test(key)) continue;
      const props = container[key];
      const owner = props && props.children && props.children._owner;
      if (owner && isTypingNode(owner.stateNode)) return owner.stateNode;
    }

    return null;
  }

  function getContent(app) {
    const raw = app && app.props && app.props.lessonContent;
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) return raw.join('');
    return '';
  }

  function getIndex(app) {
    if (!app) return -1;
    if (typeof app.typedIndex === 'number') return app.typedIndex;
    if (app.state && typeof app.state.typedIndex === 'number') return app.state.typedIndex;
    if (app.props && typeof app.props.typedIndex === 'number') return app.props.typedIndex;
    return -1;
  }

  function press(app, key) {
    const event = new KeyboardEvent('keypress', {
      key,
      bubbles: true,
      cancelable: true,
    });

    try {
      app.handleKeyPress('character', event);
      return true;
    } catch {
      /* segundo intento con objeto plano */
    }

    try {
      app.handleKeyPress('character', { key });
      return true;
    } catch {
      return false;
    }
  }

  async function waitForIndexChange(app, before, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (getIndex(app) !== before) return true;
      await preciseSleep(30);
    }
    return false;
  }

  function isVisible(el) {
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    if (el.closest('[hidden], [aria-hidden="true"]')) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  // Texto de los modales visibles, con el mismo criterio que `innerText` (lo
  // oculto no cuenta) pero sin recorrer el body entero. Los textos de DQ y de
  // "currently in a race" los pinta el juego dentro de `.modal`; la captcha
  // sigue leyendo `innerText` porque su frase no consta en el bundle.
  function modalText(root = document) {
    const doc = root || document;
    const view = doc.defaultView || window;
    const texts = [];
    const seen = new Set();

    for (const modal of doc.querySelectorAll('.modal, [role="dialog"], [role="alertdialog"]')) {
      if (seen.has(modal)) continue;
      seen.add(modal);
      if (modal.closest('[hidden], [aria-hidden="true"]')) continue;
      const style = view.getComputedStyle(modal);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = modal.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const text = normalize(modal.innerText);
      if (text) texts.push(text);
    }

    return texts.join(' ');
  }

  function clickByText(patterns) {
    const nodes = document.querySelectorAll('button, a, [role="button"]');
    for (const el of nodes) {
      const label = normalize(el.textContent);
      if (!label) continue;
      if (!patterns.some((pattern) => label === pattern)) continue;
      if (!isVisible(el)) continue;
      el.click();
      return true;
    }
    return false;
  }

  /* --------------------------------------------------------------------------
   * CAPTCHA RESUELTO -> CONTINUE
   * --------------------------------------------------------------------------
   * El modal de verificacion del juego (bundle ra) pinta, al quedar validado:
   *
   *   <div class="tc-i">Validated!  Play on.</div>
   *   <button class="btn btn--primary btn--fw">Continue</button>
   *
   * y ese Continue llama a window.__reloadPage(). Sin pulsarlo el bot se queda
   * mirando el modal aunque el captcha ya este resuelto (por el usuario o por
   * una extension que lo resuelve solo).
   *
   * Se comprueba en los dos documentos posibles: la carrera (iframe) y la
   * ventana de arriba. El clic lleva enfriamiento porque el boton recarga la
   * app y, si esa recarga no ocurre, no queremos martillearlo.
   * -------------------------------------------------------------------------- */
  let captchaContinueAt = 0;
  let captchaContinueScanAt = 0;

  // Ultima vez que se vio el modal de descalificacion. Lo refresca un vigilante
  // cada segundo (leer innerText es caro para hacerlo en cada tecla).
  let dqSeenAt = 0;
  let dqBlockedNoted = false;
  // Ultima vez que el vigilante vio el aviso de conexion del servidor de la
  // carrera y ultima salida por el garaje. El aviso lo pinta el juego dentro
  // del marco, asi que se marca aqui y el bucle de carrera lo lee sin volver a
  // mirar el DOM en cada tecla.
  let connErrorSeenAt = 0;
  let lastConnExitAt = 0;

  function clickCaptchaContinue(doc) {
    const target = doc || document;
    const now = Date.now();
    if (!target || now - captchaContinueAt < 4000) return false;
    // El modal no cambia de un latido a otro: una lectura por segundo basta y
    // deja libre el hilo para las teclas. El clic mantiene su enfriamiento de 4 s.
    if (now - captchaContinueScanAt < 1000) return false;
    captchaContinueScanAt = now;
    perfCounters.captchaUiScans += 1;

    let validated = false;
    for (const el of target.querySelectorAll('.tc-i')) {
      if (/validated/i.test(el.textContent || '')) {
        validated = true;
        break;
      }
    }
    if (!validated) return false;

    for (const el of target.querySelectorAll('button, a, [role="button"]')) {
      if (normalize(el.textContent) !== 'continue') continue;
      if (!isVisible(el)) continue;

      captchaContinueAt = Date.now();
      log('CAPTCHA validated: pressing Continue to move on.');
      el.click();
      return true;
    }
    return false;
  }

  /* --------------------------------------------------------------------------
   * AVISO DE SESION ("Logout Warning") -> «Yes, I'm here!»
   * --------------------------------------------------------------------------
   * Cuando la sesion esta a punto de caducar, la app pinta un modal con:
   *
   *   <h3 class="mbxs">Logout Warning</h3>
   *   <p class="mbf">Your session will expire soon. Do you want to stay logged in?</p>
   *   <button type="button" class="btn btn--light btn--thin">Yes, I'm here!</button>
   *
   * y ese boton hace boton.remove() + window.__reloadPage(): quita el modal y
   * RECARGA la app, que es lo que renueva la sesion. Sin pulsarlo, la sesion
   * caduca de verdad y el bot acaba en /login a medias de la tanda (eso corto
   * una sesion de 30 carreras).
   *
   * El aviso puede salir tanto en la carrera (iframe) como en la ventana de
   * arriba, asi que se buscan los dos documentos. El clic se hace en cuanto
   * aparece y no al terminar la carrera: la recarga aborta la carrera en curso,
   * pero esperar solo cambiaria una DQ por un cierre de sesion, que es peor.
   * El enfriamiento vive en window.top para que las dos instancias del script
   * no pulsen el mismo boton a la vez.
   * -------------------------------------------------------------------------- */
  let sessionKickAt = 0;
  let sessionKickTimer = null;

  // Documentos donde puede aparecer el aviso: el propio, la ventana de arriba
  // (misma origen) y los iframes accesibles.
  function candidateDocs() {
    const docs = [];
    const push = (doc) => {
      if (doc && doc.body && !docs.includes(doc)) docs.push(doc);
    };
    push(document);
    try { push(window.top && window.top.document); } catch { /* otro origen */ }
    for (const frame of document.querySelectorAll('iframe')) {
      try { push(frame.contentDocument); } catch { /* otro origen */ }
    }
    return docs;
  }

  function findSessionWarningButton(doc) {
    if (!doc) return null;

    for (const el of doc.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]')) {
      // El boton real puede ser un <input> (el texto vive en `value`) y el
      // apostrofo puede ser tipografico (’): normalize no lo convierte, y sin
      // esto el aviso se quedaba sin pulsar y la sesion caducaba.
      const raw = el.tagName === 'INPUT' ? (el.value || '') : (el.textContent || '');
      const label = normalize(raw).replace(/[\u2018\u2019\u02bc]/g, "'");
      if (!label) continue;
      if (el.disabled === true || el.getAttribute('aria-disabled') === 'true') continue;

      // El texto exacto del sitio es "Yes, I'm here!", pero el boton se busca
      // tambien por el contexto del aviso: si le cambian una coma o el signo,
      // no puede quedarse sin pulsar. El contexto se mira en el modal y, si no
      // hay .modal, en los contenedores cercanos: nunca en todo el body, que
      // este latido pasa cada 500 ms.
      const looksRight = /^yes,?\s*i'?m here!?$/.test(label) || /stay (logged|signed) in/.test(label);
      let inWarning = false;
      if (!looksRight) {
        let scope = el.closest ? el.closest('.modal') : null;
        if (!scope) {
          scope = el;
          for (let i = 0; i < 4 && scope.parentElement; i++) scope = scope.parentElement;
        }
        const context = normalize((scope && scope.textContent) || '');
        inWarning = /logout warning|session will expire|stay logged in/.test(context);
      }
      // El fallback por contexto no puede aceptar un "Continue" cualquiera:
      // exige que el boton siga nombrando el "here" o el "stay logged in".
      const contextual = inWarning
        && (/^yes\b.*\bhere\b/.test(label) || /^stay (logged|signed) in\b/.test(label));
      if (!looksRight && !contextual) continue;

      if (isVisible(el)) return el;
    }
    return null;
  }

  // Gancho inerte del banco: resuelve el boton sin esperar al latido.
  window.__ntaDebug = window.__ntaDebug || {};
  window.__ntaDebug.sessionWarningButton = (doc) => findSessionWarningButton(doc || document);

  // Enfriamiento compartido entre la ventana de arriba y el iframe: el aviso es
  // uno solo, y no queremos dos clics (ni dos recargas) a la vez.
  // El enfriamiento vive siempre en window.top para que lo vean las dos
  // instancias (la de la carrera y la de la ventana de arriba): la marca se
  // escribe y se lee en el mismo sitio, sin depender de quien pulso.
  function sessionKickFresh() {
    const now = Date.now();
    if (now - sessionKickAt < CONFIG.queue.sessionKickCooldownMs) return false;
    try {
      const shared = window.top.__ntaSessionKickAt;
      if (shared && now - shared < CONFIG.queue.sessionKickCooldownMs) return false;
    } catch { /* otro origen */ }
    return true;
  }

  function markSessionKick() {
    sessionKickAt = Date.now();
    try { window.top.__ntaSessionKickAt = sessionKickAt; } catch { /* otro origen */ }
  }

  // Si el aviso desaparece antes del clic, la marca compartida no puede quedarse
  // 15 s bloqueando un aviso nuevo: las dos instancias volverian a mirar y la
  // sesion seguiria cayendose sin que nadie pulse.
  function clearSessionKick() {
    sessionKickAt = 0;
    try { window.top.__ntaSessionKickAt = 0; } catch { /* otro origen */ }
  }

  // Devuelve true si el aviso esta en pantalla (lo haya pulsado o no): mientras
  // se ve, la cola no debe navegar ni abrir carreras por detras.
  let sessionWarningScanAt = 0;

  function handleSessionWarning(force = false) {
    // El aviso espera a que lo veas: escanearlo dos veces por segundo era mas
    // caro que util. Con una carrera viva baja a 1,5 s; parado, a 1 s.
    const now = Date.now();
    const every = typerIsTyping() ? 1500 : 1000;
    if (!force && now - sessionWarningScanAt < every) return false;
    sessionWarningScanAt = now;
    perfCounters.warningScans += 1;

    for (const doc of candidateDocs()) {
      const button = findSessionWarningButton(doc);
      if (!button) continue;

      if (sessionKickTimer || !sessionKickFresh()) return true;

      markSessionKick();
      const delay = randInt(CONFIG.queue.sessionKickDelayMs[0], CONFIG.queue.sessionKickDelayMs[1]);
      const fromTop = doc !== document;

      sessionKickTimer = later(() => {
        sessionKickTimer = null;
        if (!button.isConnected) {
          // El aviso desaparecio solo (o lo pulso la otra instancia): se libera
          // el enfriamiento local y el compartido por si vuelve a salir.
          clearSessionKick();
          return;
        }
        log(`Session warning: pressing «Yes, I'm here!»${fromTop ? ' (top window)' : ''}; the app reloads and the session is renewed.`);
        button.click();
      }, delay);

      log(`Session warning ("Logout Warning"): pressing it in ${(delay / 1000).toFixed(1)}s.`);
      return true;
    }
    return false;
  }

  // Ganchos inertes del banco: programar el aviso sin esperar al latido y ver
  // el enfriamiento local/compartido.
  window.__ntaDebug = window.__ntaDebug || {};
  window.__ntaDebug.sessionWarningHandle = () => handleSessionWarning(true);
  window.__ntaDebug.sessionKick = () => {
    let shared = 0;
    try { shared = Number(window.top.__ntaSessionKickAt) || 0; } catch { /* otro origen */ }
    return { local: sessionKickAt, shared, pending: Boolean(sessionKickTimer) };
  };
  window.__ntaDebug.sessionKickReset = () => {
    if (sessionKickTimer) {
      clearLater(sessionKickTimer);
      sessionKickTimer = null;
    }
    clearSessionKick();
    return window.__ntaDebug.sessionKick();
  };

  // The queue (top window) has no panel: it leaves its notices in localStorage and
  // the typer paints them on boot, so an automatic re-login shows up in the race
  // panel without opening the console.
  function flushQueueNotice() {
    const raw = disk.get('ntQueue:notice');
    if (!raw) return;

    disk.remove('ntQueue:notice');
    try {
      const notice = JSON.parse(raw);
      if (notice && notice.text && Date.now() - notice.at < 600000) log(notice.text);
    } catch { /* aviso corrupto: se ignora */ }
  }
