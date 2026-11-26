
  /* ==========================================================================
   * 12.B GUARDIA: WPM IMPOSIBLE E INSTANCIAS DUPLICADAS
   * ========================================================================== */
  // Los dos fallos que no tienen red, y los dos salieron de la misma prueba: con
  // dos copias del script inyectadas en la misma pestana, las dos mandaban teclas
  // a la vez y el contador del juego se fue a 6696 WPM. Ese numero es justo lo
  // que mira un anti-cheat.
  //
  //  - WPM imposible: se vigilan el HUD del juego (.dash-metrics, el numero que
  //    se lleva el anti-cheat), el avance real de la carrera y lo que ha tecleado
  //    esta copia. Si el que se dispara es el HUD mientras la medida propia es
  //    normal, el aviso apunta a otra copia escribiendo. Si se dispara la medida
  //    propia, la carrera se suelta y se abre un hueco largo (CONFIG.guard).
  //  - Copias duplicadas: cada instancia deja un latido en el window del
  //    documento y la eleccion decide cual escribe (electInstance). Las demas
  //    esperan en silencio y toman el relevo si la primera desaparece. No hay
  //    parada: antes dos copias se apagaban la una a la otra y una parada a mitad
  //    de carrera dejaba la leccion sin teclas (DQ por inactividad).
  //
  // El turno entre tipadores vivos de distintos marcos lo pide la cola con
  // window.top.__ntaStandby: es un prestamo con caducidad, no un apagon.

  const INSTANCE_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const GUARD_REGISTRY = '__ntaInstances';
  const GUARD_STANDBY = '__ntaStandby';
  const TAB_LEASE = 'nta:tabLease';
  const TAB_LEASE_LOCK = 'nta:tab-lease';
  // Un lease recien reclamado no es un lease de garaje: se le da un latido
  // para marcarse como 'typing' antes de que otra carrera viva lo tome.
  const TAB_TAKEOVER_GRACE_MS = 2500;
  const TAB_NAME_PREFIX = 'nta-tab:';
  const TYPING_LOCK = 'nta:typing';
  const TAB_ACTION_LOCK = 'nta:tab-action';
  let tabId = null;            // identidad de ESTE documento/pestaña
  let typingLockHeld = false;  // esta pestaña tiene el Web Lock de tecleo
  let typingLockRelease = null;
  let typingLockPending = null;
  let typingLockEpoch = 0;
  let tabPrimary = false;      // false = el lease aun no se ha reclamado o es de otra pestaña
  let typingRescueUntil = 0;   // ventana en la que una carrera viva recupera el teclado
  let typingRescueAt = 0;      // ultimo rescate, para no repetir el aviso cada tick
  let tabRoleNoted = false;
  let tabLeaseNoted = false;   // esta pestaña estuvo en espera por el lease
  let guardId = null;          // id de esta copia en el registro del documento
  let guardSince = 0;          // cuando se registro (desempate de la eleccion)
  let guardReleased = false;   // solto el mando al pararse; al volver entra como nueva
  let guardLeader = null;      // entrada con el turno ahora mismo (id, since, penSince)
  let penSince = 0;            // cuando esta copia tomo el turno (0 = no lo tiene)
  let primaryRole = true;      // false = otra copia de la misma pagina manda
  let peerCount = 1;           // copias del script vivas en esta pagina
  let roleCheckedAt = 0;       // ultima eleccion consultada (cada 250 ms)
  let hudWarnedAt = 0;         // ultimo aviso de "el HUD no cuadra con lo mio"
  let abandonRace = false;     // el guardia manda: esta carrera se suelta
  let guardLastCheckAt = 0;    // el guardia mira como mucho cada 500 ms
  let guardPaceAtStart = null; // ritmo con el que empezo la carrera en curso
  const guardSamples = [];     // ultimas lecturas de WPM (techo sostenido)

  // Identidad de la pestaña. NO se usa sessionStorage como fuente: Chrome
  // copia su contenido al duplicar una pestaña, asi que dos pestañas podian
  // compartir el mismo id y creerse las dos dueñas del lease. `window.name`
  // sobrevive a la navegacion dentro de la pestaña pero no se copia al
  // duplicarla; el iframe de la carrera comparte el id por window.top.
  function newTabId() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch { /* contexto sin crypto */ }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function tabIdentity() {
    if (tabId) return tabId;

    let id = '';
    try {
      if (window.top && window.top.__ntaTabId) id = String(window.top.__ntaTabId);
    } catch { /* top de otro origen */ }

    if (!id && window.top === window) {
      try {
        const name = String(window.name || '');
        if (name.startsWith(TAB_NAME_PREFIX)) id = name.slice(TAB_NAME_PREFIX.length);
      } catch { /* window.name bloqueado */ }
    }
    if (!id) id = newTabId();

    tabId = id;
    try { if (window.top) window.top.__ntaTabId = id; } catch { /* top de otro origen */ }
    try {
      if (window.top === window) window.name = TAB_NAME_PREFIX + id;
    } catch { /* window.name bloqueado */ }
    return tabId;
  }

  // El token es la prueba de que el lease sigue siendo de esta pestaña. Sin
  // el, dos pestañas pueden leer el mismo hueco y creerse dueñas; con el, la
  // que pierde la carrera atomica ve un token distinto y se aparta.
  function newLeaseToken() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch { /* contexto sin crypto */ }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  // Las dos mitades de una pestaña (cola y iframe) comparten el token por el
  // top, igual que comparten tabId. Dos pestañas distintas no lo comparten.
  function tabLeaseTokenForTab() {
    if (tabLeaseToken) return tabLeaseToken;
    try {
      if (window.top && window.top.__ntaLeaseToken) {
        tabLeaseToken = String(window.top.__ntaLeaseToken);
      }
    } catch { /* top de otro origen */ }
    if (!tabLeaseToken) tabLeaseToken = newLeaseToken();
    try {
      if (window.top) window.top.__ntaLeaseToken = tabLeaseToken;
    } catch { /* top de otro origen */ }
    return tabLeaseToken;
  }

  // Web Locks es la exclusion real entre pestañas: localStorage solo sirve de
  // estado visible y puede perder una carrera read-check-write. El lock se
  // mantiene mientras esta promesa siga pendiente y se libera solo si la
  // pestaña se cierra. Las pestañas que no lo consiguen no mandan teclas.
  function typingLocksAvailable() {
    return Boolean(typeof navigator !== 'undefined' && navigator.locks
      && typeof navigator.locks.request === 'function');
  }

  function acquireTypingLock(options = {}) {
    const steal = options && options.steal === true;
    if (!typingLocksAvailable()) return Promise.resolve(false);
    if (typingLockHeld) return Promise.resolve(true);
    if (typingLockPending) {
      if (!steal) return typingLockPending;
      // Un intento normal que no ha vuelto no puede bloquear el rescate: se
      // invalida y se pide el lock con steal. El callback viejo, si despierta,
      // se suelta solo porque su epoch ya no coincide.
      typingLockEpoch++;
      typingLockPending = null;
    }

    const epoch = ++typingLockEpoch;
    typingLockPending = new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        if (!typingLockHeld) typingLockPending = null;
        resolve(ok);
      };

      try {
        navigator.locks.request(TYPING_LOCK, steal ? { steal: true } : { ifAvailable: true }, async (lock) => {
          // Un release() durante la peticion invalida esta adquisicion: al
          // volver del callback el lock se suelta y no se toca el estado. Hay
          // que resolver la promesa pendiente; si no, raceOnce quedaria
          // esperando para siempre tras un panic/freeze en mitad del request.
          if (epoch !== typingLockEpoch) {
            finish(false);
            return;
          }
          if (!lock) {
            finish(false);
            return;
          }

          typingLockHeld = true;
          finish(true);
          await new Promise((release) => { typingLockRelease = release; });
          if (epoch === typingLockEpoch) {
            typingLockHeld = false;
            typingLockRelease = null;
          }
        }).catch(() => finish(false));
      } catch {
        finish(false);
      }
    });
    return typingLockPending;
  }

  function releaseTypingLock() {
    typingLockEpoch++;
    const release = typingLockRelease;
    typingLockRelease = null;
    typingLockHeld = false;
    typingLockPending = null;
    try { if (release) release(); } catch { /* ya liberado */ }
  }

  // El lease vive en localStorage porque es lo unico que ven todas las
  // pestañas del perfil. No sustituye a la eleccion del window: la complementa.
  // Un tipador de la pestaña A no puede mandar teclas si la pestaña B lo tiene.
  let tabLeaseStorageError = false;
  let tabLeaseToken = '';
  function readTabLease() {
    tabLeaseStorageError = false;
    try {
      const raw = localStorage.getItem(TAB_LEASE);
      if (!raw) return null;
      const lease = JSON.parse(raw);
      const at = Number(lease && lease.at);
      if (!lease || !lease.tab || !Number.isFinite(at)) return null;
      if (Date.now() - at > CONFIG.guard.tabLeaseStaleMs) return null;
      return lease;
    } catch {
      tabLeaseStorageError = true;
      return null;
    }
  }

  function tabLeaseHeldByOther() {
    const lease = readTabLease();
    if (tabLeaseStorageError) return true;
    return Boolean(lease && String(lease.tab) !== tabIdentity());
  }

  // Un lease solo vale mientras su token siga siendo el de esta pestaña. La
  // lectura puede ser vieja; el token es lo que impide que una copia que perdio
  // la carrera siga actuando con el lease de la otra.
  function tabLeaseOwned() {
    const lease = readTabLease();
    if (tabLeaseStorageError || !lease) return false;
    return String(lease.tab) === tabIdentity()
      && Boolean(tabLeaseToken)
      && String(lease.token || '') === tabLeaseToken;
  }

  // true = esta pestaña puede actuar. El Web Lock es el punto de decision, no
  // localStorage: dos pestañas pueden leer la misma clave vacia, pero solo una
  // puede estar dentro de este callback. `ifAvailable` es deliberado: una
  // accion que no consigue el turno ahora se salta y la cola la reintenta, en
  // vez de esperar detras de una pestaña que puede estar ocupada.
  function claimTabLeaseAtomic(reason = '', force = false) {
    if (!typingLocksAvailable()) return Promise.resolve(false);
    let request;
    try {
      request = navigator.locks.request(TAB_LEASE_LOCK, { ifAvailable: true }, (lock) => {
        if (!lock) return false;
        try {
          const now = Date.now();
          const tab = tabIdentity();
          const lease = readTabLease();
          if (tabLeaseStorageError) return false;
          // Una carrera viva puede recuperar el turno de una pestaña de garaje
          // que lo tenia sin estar escribiendo. No se pisa a otra pestaña que ya
          // esta escribiendo (reason 'typing') salvo con force, que es el rescate
          // explicito de una carrera que se quedo sin teclas.
          if (lease && String(lease.tab) !== tab && !force) return false;

          // Las dos mitades de esta pestaña comparten token. Una toma forzada
          // desde otra pestaña recibe uno nuevo para invalidar al dueño anterior.
          let token = tabLeaseTokenForTab();
          if (lease && String(lease.tab) === tab && lease.token && !force) {
            token = String(lease.token);
            tabLeaseToken = token;
            try { if (window.top) window.top.__ntaLeaseToken = token; } catch { /* top bloqueado */ }
          } else if (force) {
            token = newLeaseToken();
            tabLeaseToken = token;
            try { if (window.top) window.top.__ntaLeaseToken = token; } catch { /* top bloqueado */ }
          }

          // Un clic de cola no borra la marca de que esta pestaña es la que
          // teclea: si lo hiciera, otra pestaña con carrera viva podria tomar el
          // lease como si fuera una pestaña de garaje.
          const nextReason = lease && String(lease.tab) === tab
            && String(lease.reason || '') === 'typing'
            ? 'typing'
            : String(reason || '');
          localStorage.setItem(TAB_LEASE, JSON.stringify({
            tab, id: INSTANCE_ID, token, at: now, reason: nextReason,
          }));
          return true;
        } catch {
          // Sin localStorage no se puede coordinar: no se actua ni se escribe.
          return false;
        }
      });
    } catch {
      return Promise.resolve(false);
    }
    return request.catch(() => false);
  }

  // Vista sincrona para diagnostico y para el check fail-closed. No concede
  // nada: solo claimTabLeaseAtomic() escribe un lease nuevo.
  function claimTabLease() {
    return tabLeaseOwned();
  }

  async function runTabAction(reason, action) {
    if (!typingLocksAvailable() || typeof action !== 'function') return false;
    try {
      return await navigator.locks.request(TAB_ACTION_LOCK, { ifAvailable: true }, async (lock) => {
        if (!lock) return false;
        if (!(await claimTabLeaseAtomic(String(reason || ''), false))) return false;
        try {
          return action() === true;
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  }

  // El lease nombra una PESTAÑA, no una mitad: la cola de arriba y el tipador
  // del marco comparten tabId, y cualquiera de las dos puede soltarlo al parar
  // o al cerrarse la pestaña. Antes solo lo borraba la mitad que lo habia
  // escrito; si lo tenia la otra, la pestaña se iba con el lease puesto y la
  // siguiente esperaba los 15 s de caducidad. `force` sigue existiendo para el
  // debug: sin el, una pestaña nunca puede borrar el lease de otra.
  function releaseTabLease(force = false) {
    try {
      const raw = localStorage.getItem(TAB_LEASE);
      if (!raw) return false;
      const lease = JSON.parse(raw);
      if (!lease) return false;
      // La otra mitad de la misma pestaña puede soltar el lease sin token (una
      // instalacion vieja o el harness) o con el token compartido. Una copia
      // parada que ya limpio su token no puede borrar el lease que acaba de
      // reclamar la copia viva de la misma pestaña.
      if (!force) {
        if (String(lease.tab) !== tabIdentity()) return false;
        if (lease.token && String(lease.token) !== tabLeaseToken) return false;
      }
      localStorage.removeItem(TAB_LEASE);
      tabLeaseToken = '';
      try { if (window.top) delete window.top.__ntaLeaseToken; } catch { /* top bloqueado */ }
      return true;
    } catch {
      return false;
    }
  }

  // Renueva el vencimiento sin cambiar de titular: conserva el `id` de la mitad
  // que reclamo el turno y solo mueve `at`. No crea un lease nuevo, asi que una
  // pestaña parada no se queda el turno, y nunca toca el de otra pestaña.
  function renewTabLease() {
    try {
      if (!tabLeaseOwned()) return false;
      const raw = localStorage.getItem(TAB_LEASE);
      if (!raw) return false;
      const lease = JSON.parse(raw);
      if (!lease) return false;
      localStorage.setItem(TAB_LEASE, JSON.stringify({ ...lease, token: tabLeaseToken, at: Date.now() }));
      return true;
    } catch {
      return false;
    }
  }

  function tabLeaseInfo() {
    const lease = readTabLease();
    const tab = tabIdentity();
    return {
      tab,
      owner: lease ? String(lease.tab) : null,
      holder: lease ? String(lease.id || '') : '',
      token: lease ? String(lease.token || '') : '',
      mine: Boolean(lease && String(lease.tab) === tab),
      owned: tabLeaseOwned(),
      at: lease ? Number(lease.at) : 0,
      // Tiempo que le queda al titular antes de que otra pestaña pueda tomar
      // el relevo. Negativo o 0 = ya caducado (readTabLease lo ignora).
      expiresInMs: lease
        ? Math.max(0, CONFIG.guard.tabLeaseStaleMs - (Date.now() - Number(lease.at)))
        : 0,
    };
  }

  // Latido del lease por el reloj Worker. El `setInterval` del panel se frena a
  // 1/min cuando la pestaña lleva un rato oculta y el lease caduca a los 15 s:
  // el farmeo AFK perdia el turno frente a otra pestaña abierta aunque siguiera
  // corriendo. Este latido no se frena; solo renueva el lease que ya es de esta
  // pestaña (ver `renewTabLease`), asi que parada no lo resucita.
  let leaseBeatQueued = false;
  function leaseBeat() {
    if (leaseBeatQueued) return;
    leaseBeatQueued = true;
    preciseSleep(4000).then(() => {
      leaseBeatQueued = false;
      // Una copia parada no reclama el turno: su refreshRole ya lo solto y el
      // latido no debe resucitarlo mientras la copia viva sigue escribiendo.
      if (!session.stopped) {
        if (tabLeaseOwned()) renewTabLease();
        else claimTabLeaseAtomic('lease beat', false);
      }
      leaseBeat();
    });
  }

  // Eleccion entre copias de la misma pagina: una escribe, las demas esperan.
  function refreshRole() {
    // Una copia parada no retiene el mando: se borra del registro y la que
    // sigue viva toma el relevo en su siguiente latido. Al volver entra como
    // la mas nueva, para no quitarle el turno a la que ya estaba escribiendo.
    if (session.stopped) {
      guardReleased = true;
      try {
        const list = Array.isArray(window[GUARD_REGISTRY]) ? window[GUARD_REGISTRY] : [];
        const rest = list.filter((item) => item && item.id !== (guardId || INSTANCE_ID));
        if (rest.length !== list.length) window[GUARD_REGISTRY] = rest;
        peerCount = Math.max(1, rest.length);
      } catch {
        peerCount = 1;
      }
      primaryRole = false;
      tabPrimary = false;
      releaseTabLease();
      penSince = 0;
      return false;
    }

    // Volver de una parada no devuelve el mando por antiguedad: esta copia
    // entra como la mas nueva y la que ya escribia lo conserva. Solo lo retoma
    // cuando la otra desaparece o envejece.
    if (guardReleased) {
      guardReleased = false;
      guardSince = Date.now();
    }

    const previousLeader = guardLeader;
    const { count, primary, leader } = electInstance(
      GUARD_REGISTRY,
      guardId || INSTANCE_ID,
      guardSince || (guardSince = Date.now()),
      CONFIG.guard.instanceStaleMs,
    );
    peerCount = count;

    // Turno entre pestañas: la eleccion local decide QUE copia de esta pestaña
    // escribe; el lease decide SI esta pestaña puede escribir. Las dos mitades
    // de una misma pestaña comparten tabIdentity, asi que no compiten aqui.
    const wasTabPrimary = tabPrimary;
    const lease = readTabLease();
    const ownLease = tabLeaseOwned();
    // Una pestaña con carrera viva manda sobre una pestaña de garaje que solo
    // tiene el lease por haber pulsado Resume/Race Now. Si la otra pestaña ya
    // esta escribiendo, no se toca: solo hay un teclado.
    const leaseAge = lease ? Date.now() - Number(lease.at) : Infinity;
    const liveTakeover = Boolean(primary && !ownLease && raceIsLive()
      && String(lease.reason || '') !== 'typing'
      && leaseAge >= TAB_TAKEOVER_GRACE_MS);
    let tabTurn = false;
    if (primary) {
      tabTurn = ownLease;
      // El claim es atomico y asincrono; el siguiente latido ve el token. Hasta
      // entonces esta copia no teclea ni pulsa nada. Si el lease es nuestro pero
      // un clic de cola le cambio el motivo, se vuelve a marcar como 'typing'
      // para que otra pestaña no lo tome por un lease de garaje.
      if (!tabTurn || String(lease.reason || '') !== 'typing') {
        requestTabLeaseClaim('typing', liveTakeover);
      }
    } else {
      tabTurn = ownLease;
    }
    tabPrimary = tabTurn;
    if (primary && !tabTurn) tabLeaseNoted = true;
    if (tabTurn && !wasTabPrimary && tabLeaseNoted) {
      tabLeaseNoted = false;
      log(`Pen: this copy #${shortId(guardId || INSTANCE_ID)} takes the turn.`);
    }
    // El lock de tecleo pertenece al rol que acaba de decidir esta funcion. Si
    // el turno se fue a otra copia/pestaña, se suelta aqui mismo: esperar al
    // siguiente await del bucle dejaba una ventana en la que la pestaña en
    // standby retenia el lock y la nueva dueña no podia escribir.
    if ((!primary || !tabTurn) && typingLockHeld) releaseTypingLock();
    if (liveTakeover && tabTurn) {
      log('A live race takes the typing turn from the other tab.');
    }

    if (primary && tabTurn !== wasTabPrimary) {
      if (!tabTurn) {
        log('Another tab has the turn; this tab stands by.');
      } else if (tabRoleNoted) {
        log('This tab has the turn again.');
      }
      tabRoleNoted = !tabTurn;
    }

    if (primary !== primaryRole) {
      primaryRole = primary;

      if (!primary) {
        const holder = leader ? `#${shortId(leader.id)}` : 'another copy';
        log(`Pen: ${holder} has the turn; this copy #${shortId(guardId || INSTANCE_ID)} stands by.`);
        beep('standby');
      } else {
        const from = previousLeader && previousLeader.id !== (guardId || INSTANCE_ID)
          ? ` from #${shortId(previousLeader.id)}`
          : '';
        log(`Pen: this copy #${shortId(guardId || INSTANCE_ID)} takes the turn${from}.`);
      }

    }

    // El turno se cuenta desde que esta copia lo tomo, no desde que arranco:
    // una copia vieja que vuelve no puede decir que lleva media hora mandando.
    if (primary && tabTurn) {
      if (!penSince) penSince = Date.now();
    } else {
      penSince = 0;
    }
    guardLeader = leader || null;

    // Se publica en la entrada propia para que la otra copia pueda decir
    // "desde cuando" sin adivinar.
    try {
      const list = Array.isArray(window[GUARD_REGISTRY]) ? window[GUARD_REGISTRY] : [];
      const mine = list.find((item) => item && item.id === (guardId || INSTANCE_ID));
      if (mine) mine.penSince = penSince;
    } catch { /* sin registro */ }

    return primary;
  }

  // El final del id identifica la copia sin llenar la fila con un UUID.
  function shortId(id) {
    return String(id || '').slice(-4) || '????';
  }

  // "this #a1b2 · 5s": que copia tiene el turno y desde cuando. El id corto es
  // el final de INSTANCE_ID; `this` es la copia que pinta el panel.
  function penLabel() {
    if (!guardLeader) return '';

    const short = shortId(guardLeader.id);
    if (!short) return '';

    const since = Number(guardLeader.penSince) || Number(guardLeader.since) || 0;
    const age = since > 0 ? clockSpan(Date.now() - since) : '';
    const who = guardLeader.id === (guardId || INSTANCE_ID) ? 'this' : 'other';
    return `${who} #${short}${age ? ` · ${age}` : ''}`;
  }

  // Turno pedido por la cola cuando ve dos publicadores alternando en la misma
  // pestana (dos tipadores vivos = las teclas se mandan dos veces). Es un aviso
  // con caducidad, no una parada: el que sigue publicando manda, el otro espera,
  // y en cuanto el aviso deja de refrescarse la copia en espera vuelve sola.
  function standbyOrder() {
    try {
      const flag = window[GUARD_STANDBY];
      if (flag && Date.now() - flag.at < CONFIG.guard.standbyHoldMs) return flag;
    } catch { /* sin acceso */ }

    try {
      if (window.top !== window) {
        const flag = window.top[GUARD_STANDBY];
        if (flag && Date.now() - flag.at < CONFIG.guard.standbyHoldMs) return flag;
      }
    } catch { /* marco inaccesible */ }

    return null;
  }

  function requestStandby(keepId, reason) {
    const flag = { keep: keepId || null, reason: reason || '', at: Date.now() };
    try { window[GUARD_STANDBY] = flag; } catch { /* sin acceso */ }
    try { if (window.top !== window) window.top[GUARD_STANDBY] = flag; } catch { /* sin acceso */ }
  }

  // Una carrera viva no puede quedarse esperando a una copia que no escribe.
  // Se reclama el lease y se pide el turno para esta copia durante unos segundos;
  // si la otra copia siguiera tecleando, el indice avanzaria y no se llega aqui.
  function takeTypingTurn(reason) {
    const now = Date.now();
    if (now - typingRescueAt < 1000) return false;
    typingRescueAt = now;
    requestTabLeaseClaim('typing', true).then((ok) => {
      if (!ok) return;
      typingRescueUntil = Date.now() + 6000;
      try {
        const flag = { keep: INSTANCE_ID, reason: reason || 'live race rescue', at: Date.now() };
        window[GUARD_STANDBY] = flag;
        if (window.top !== window) window.top[GUARD_STANDBY] = flag;
      } catch { /* sin acceso */ }
      // No se adelanta tabPrimary: el rescate ya desbloquea standbySnapshot y
      // refreshRole debe ver la transicion para anunciar el relevo en el log.
      log('The live race had no keys for a few seconds; taking the typing turn back.');
    });
    return true;
  }

  // Reclama el lease sin bloquear el latido. Si otro claim de esta pestaña ya
  // esta en vuelo, se comparte; si el lock esta ocupado, el siguiente latido
  // vuelve a intentarlo.
  function requestTabLeaseClaim(reason, force) {
    // No se pinta el rol desde aqui: refreshRole debe ver la transicion
    // false -> true en su siguiente latido para anunciar el relevo. Adelantar
    // tabPrimary borraba el aviso "takes the turn" y dejaba el panel mudo.
    return claimTabLeaseAtomic(reason, force);
  }

  // Esta copia no manda teclas: o la eleccion de esta ventana ha dado el mando a
  // otra copia, o la cola ha pedido el turno para el publicador que sigue vivo.
  // Se vuelve a mirar como mucho cada 250 ms: lo justo para que dos copias
  // recien inyectadas no manden teclas a la vez ni un instante de mas.
  // Lectura pura del estado de standby, sin refreshRole/claimTabLease. La usan
  // el panel y el diagnostico: observar no debe cambiar el rol de la pestaña.
  function standbySnapshot() {
    const now = Date.now();

    // Un rescate reciente manda sobre el lease y sobre el aviso de la cola: la
    // carrera ya esta en marcha y quedarse sin teclas es una DQ segura.
    if (typingRescueUntil > now && raceIsLive()) return false;

    if (!primaryRole || !tabPrimary) return true;

    const flag = standbyOrder();
    return Boolean(flag && flag.keep && flag.keep !== INSTANCE_ID);
  }

  function standbyActive() {
    const now = Date.now();

    if (now - roleCheckedAt > 250) {
      roleCheckedAt = now;
      refreshRole();
    }

    return standbySnapshot();
  }

  // WPM que el propio juego pinta en el HUD de la carrera: es el numero que se
  // lleva el anti-cheat, asi que es el que manda. El HUD es .dash-metrics, con
  // un list-item por metrica (rotulo en un span y valor en un span.h4); el
  // rotulo es "WPM" (o "PPM" en NITROMATH).
  //
  // Hay mas de un .dash-metrics en la pagina: el overlay .race-results de la
  // carrera anterior sigue en el DOM (oculto) con su WPM final. Quedarse con el
  // primero leia ese numero viejo mientras el HUD vivo marcaba otro. Se busca
  // el visible, fuera de resultados y, si existe, dentro del arbol de carrera.
  // El HUD del juego se refresca una vez por segundo y esta funcion fuerza
  // layout (querySelectorAll + getBoundingClientRect + getComputedStyle). Se
  // llamaba hasta cuatro veces por segundo entre el panel y el guardia: ahora
  // la primera lectura del tick vale para todas. La clave incluye el arranque y
  // el cierre de la carrera, asi que un cambio de carrera invalida el memo sin
  // tocar `resetRaceState` (que vive antes en el archivo).
  // El HUD del juego se refresca una vez por segundo. Leerlo con mas frecuencia
  // solo fuerza layout en la carrera sin traer un numero nuevo.
  const HUD_TTL_MS = 1000;
  let hudCacheAt = 0;
  let hudCacheKey = '';
  let hudCacheValue = null;

  function hudWpm(force = false) {
    const now = Date.now();
    const key = `${session.startedAt}:${session.endedAt}`;
    if (!force && key === hudCacheKey && now - hudCacheAt < HUD_TTL_MS) return hudCacheValue;

    hudCacheAt = now;
    hudCacheKey = key;
    hudCacheValue = null;
    perfCounters.hudReads += 1;

    const usable = [...document.querySelectorAll('.dash-metrics')].filter((box) => {
      if (box.closest('.race-results')) return false;
      const rect = box.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      const style = getComputedStyle(box);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05;
    });
    const scoped = usable.filter((box) => box.closest('#raceContainer'));

    for (const box of (scoped.length ? scoped : usable)) {
      for (const item of box.querySelectorAll('.list-item')) {
        const label = item.querySelector('.tsxs');
        const value = item.querySelector('.h4');
        if (!label || !value) continue;

        const name = normalize(label.textContent);
        if (name !== 'wpm' && name !== 'ppm') continue;

        const number = parseFloat(String(value.textContent).replace(/[^0-9.]/g, ''));
        if (Number.isFinite(number)) {
          hudCacheValue = number;
          return number;
        }
      }
    }
    return null;
  }

  // La calibracion del reloj necesita pares (hud, typed) del mismo instante:
  // con el memo de 600 ms y el guardia cada 500 ms, la mitad de las muestras
  // llegarian con el HUD de hace medio segundo y un `typed` fresco, corriendo
  // el arranque estimado. Mientras queden muestras se lee el DOM de verdad; en
  // cuanto `clockDone` se pone, vuelve el memo como en el panel.
  function hudForGuard(typed) {
    return hudWpm(!session.clockDone && Number(typed) >= 50 && !session.endedAt);
  }

  // El reloj del juego arranca en el semaforo; el nuestro, en la primera tecla
  // aceptada. Cuando el bot tarda en arrancar, el panel marca 5-8% de mas. Con
  // varias lecturas del HUD se estima el arranque real y se corrige una sola
  // vez por carrera. Se aplica la mediana para que un HUD rezagado no mande.
  function calibrateRaceClock(now, hud, typed) {
    if (session.clockDone || !session.startedAt || session.endedAt) return;
    if (!Number.isFinite(hud) || hud < 40 || hud > 220) return;
    if (!Number.isFinite(typed) || typed < 50) return;

    const minutes = (typed / 5) / hud;
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const delta = (now - minutes * 60000) - session.startedAt;
    if (!Number.isFinite(delta) || Math.abs(delta) > 6000) return;

    if (!Array.isArray(session.clockSamples)) session.clockSamples = [];
    session.clockSamples.push(delta);
    if (session.clockSamples.length < 8) return;

    const sorted = session.clockSamples.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    session.clockDone = true;
    if (Math.abs(median) < 150) return;

    session.startedAt += median;
    // Marca para que el gobernador sepa que el arranque cambio mientras podia
    // estar esperando: el bucle de teclas recalcula su recorte al despertar.
    session.clockShiftAt = Date.now();
    log(`Race clock aligned to the game: ${median > 0 ? '+' : ''}${Math.round(median)} ms (game ${Math.round(hud)} WPM).`);
  }

  // Techo de WPM: una marca humana dura. Con la 5.0.0 no hay ningun ritmo que
  // pueda superarlo por diseno, asi que este numero es solo una red de
  // seguridad (carrera rota, copia duplicada, contador desbocado).
  function wpmCeiling() {
    return CONFIG.guard.maxWpmLegit;
  }

  // El guardia no puede dejar la carrera viva sin teclas: eso es una DQ segura.
  // Marca el hueco y la carrera se termina al ritmo normal (mas lento por
  // carefulRaces); despues el bucle espera el descanso. Antes ponia
  // abandonRace=true y volvia sin teclear, justo el fallo que buscabamos.
  function guardStop(reason) {
    if (session.breakUntil > Date.now()) return;   // ya hay un hueco abierto

    guardCooldown(reason);
    log('Race flagged by the guard: finishing it at a careful pace, then the break starts.');
  }

  // Cooldown del guardia: se termina la carrera en curso -dejarla sin teclas
  // seria una DQ- y se alarga el hueco entre carreras. Nunca para el bot.
  function guardCooldown(reason) {
    if (session.breakUntil > Date.now()) return;

    const ms = humanDelay(CONFIG.guard.cooldownMs);
    session.breakUntil = Date.now() + ms;
    session.stopAfterRace = true;
    session.carefulRaces = Math.max(session.carefulRaces, 1);
    saveCounters();

    log(`GUARD: ${reason}. Race finished, then a ${Math.round(ms / 1000)} s break; the bot continues on its own.`);
    beep('break');
    updatePanel();
  }

  function guardCheck() {
    if (!CONFIG.guard.enabled) return;

    // El guardia no necesita mas de dos lecturas por segundo: el HUD del juego
    // se refresca una vez por segundo.
    const now = Date.now();
    if (now - guardLastCheckAt < 500) return;
    guardLastCheckAt = now;

    // La orden de espera de la cola (dos publicadores alternando) se aplica en el
    // bucle: aqui no se corta nada, solo se deja de contar la carrera mientras el
    // HUD venga de otra copia.
    if (standbyActive()) {
      guardSamples.length = 0;
      return;
    }

    // Parado el script no escribe: no hay nada que vigilar.
    if (session.stopped) {
      guardSamples.length = 0;
      guardPaceAtStart = null;
      return;
    }

    // Dos copias en la misma pagina: la eleccion decide (una escribe, la otra
    // espera en silencio). Aqui no se para nada; el aviso lo da refreshRole().
    if (!refreshRole()) {
      guardSamples.length = 0;
      guardPaceAtStart = null;
      return;
    }

    // El guardia juzga lo TECLEADO por esta copia. El nitro regala caracteres
    // que no salieron de aqui: contarlos disparaba la media muy por encima del
    // techo y abortaba una carrera buena justo despues de usarlo.
    const typed = Math.max(0, session.chars - session.nitroChars);

    if (!session.startedAt || typed <= 0) {
      guardSamples.length = 0;
      guardPaceAtStart = null;
      return;
    }

    // Nothing is judged in the first instants of a race. Any WPM reading over a
    // window of a few milliseconds is meaningless (one key in half a millisecond
    // divides out to a five figure number), and the game's own HUD can print a
    // wild value until it refreshes. A genuine runaway is still there three
    // seconds later, so the guard loses nothing by waiting that long.
    const earlyMinutes = (now - session.startedAt) / 60000;
    if (earlyMinutes < 0.05 || typed < 8) {
      guardSamples.length = 0;
      return;
    }

    // Ritmo cambiado a mitad de carrera: la media del juego arrastra el ritmo
    // anterior y el HUD se queda por las nubes un buen rato, asi que el guardia
    // no juzga esa carrera. Con un solo ritmo ya no se cambia, pero la
    // proteccion se queda: si algun dia vuelve a haber mas de uno, esto evita
    // un falso positivo.
    if (guardPaceAtStart === null) guardPaceAtStart = session.pace;
    if (guardPaceAtStart !== session.pace) {
      guardSamples.length = 0;
      return;
    }

    const minutes = (now - session.startedAt) / 60000;

    // Lo que ha tecleado ESTA copia desde que arranco el reloj. El indice de la
    // leccion no vale: tras una recarga en mitad de carrera arranca por el medio
    // y dividir ese indice por un tiempo de dos segundos daba un WPM de cinco
    // cifras (fue lo que disparaba el guardia nada mas empezar). Ademas se acota
    // a las teclas que esta copia ha mandado de verdad: la leccion la puede
    // estar moviendo otra copia y eso no es nuestro WPM.
    const elapsedIdx = clamp(session.pos - (session.startIndex | 0), 0, typed);
    const posWpm = minutes > 0.02 && elapsedIdx > 0 ? (elapsedIdx / 5) / minutes : 0;
    const typedWpm = minutes > 0.02 ? ((session.correct - session.nitroChars) / 5) / minutes : 0;
    // Lo que el HUD puede marcar por encima de nosotros sin que haya otra copia:
    // los caracteres del nitro son del juego y tambien entran en su media.
    const nitroWpm = minutes > 0.02 ? (session.nitroChars / 5) / minutes : 0;

    const own = Math.max(typedWpm, posWpm);
    const hud = hudForGuard(typed);
    if (hud !== null && session.typing && !session.endedAt) session.lastHudWpm = hud;
    calibrateRaceClock(now, hud, typed);
    const ceiling = wpmCeiling();

    const readings = [own];
    if (hud !== null) readings.push(hud);
    const values = readings.filter((value) => Number.isFinite(value));
    if (!values.length) return;

    const wpm = Math.max(...values);

    // Testing hook: inert unless a page sets window.__ntaDebug before the script
    // loads. It exposes the last reading (and which metrics produced it) so a bench
    // can tell a real runaway from a bad sample.
    if (window.__ntaDebug) {
      window.__ntaDebug.guard = {
        wpm, ceiling, hud, own, readings: values, samples: guardSamples.slice(),
        minutes, chars: session.chars, correct: session.correct, pos: session.pos, at: Date.now(),
      };
    }

    // El HUD del juego muy por encima del techo con la medida propia dentro: el
    // numero que sube no son las teclas de esta copia. El margen es ancho a
    // proposito: el HUD redondea y arranca su reloj en el semaforo, asi que 121
    // con 112 reales es normal y avisar de eso solo asustaria. Se avisa (una vez
    // cada medio minuto) y se sigue: las teclas de aqui son legales y estan
    // capadas, y cortar la carrera solo dejaria la leccion a medias. Las copias
    // duplicadas de verdad las resuelve la eleccion y el aviso de la cola.
    if (hud !== null && hud > Math.max(ceiling, own + nitroWpm) * 1.15 && own <= ceiling) {
      if (now - hudWarnedAt > 30000) {
        hudWarnedAt = now;
        log(`The game shows ${Math.round(hud)} WPM (ceiling ${Math.round(ceiling)}) while this copy measures ${own.toFixed(1)}: those keys are not this copy's. Check for a second copy of the script.`);
      }
      guardSamples.length = 0;
      return;
    }

    // Lo que se juzga son las cuentas de ESTA copia. El HUD del juego redondea
    // y arranca su reloj en el semaforo, asi que marca 1-3 WPM por encima del
    // trabajo real: usarlo aqui paraba carreras buenas (121 en pantalla con
    // 118 medidos y el techo en 120). El HUD queda para el aviso de arriba, que
    // es donde de verdad aporta.
    guardSamples.push(own);
    if (guardSamples.length > CONFIG.guard.samples) guardSamples.shift();

    // Un valor disparatado del propio reloj para en seco; uno por encima del
    // techo tiene que repetirse en las ultimas muestras.
    if (own >= ceiling * CONFIG.guard.absurdFactor) {
      guardStop(`${own.toFixed(0)} WPM during the race (ceiling ${Math.round(ceiling)} · pace ${session.pace.toUpperCase()})`);
      return;
    }

    if (guardSamples.length >= CONFIG.guard.samples && Math.min(...guardSamples) > ceiling) {
      guardStop(`sustained WPM of ${Math.round(Math.min(...guardSamples))}-${Math.round(own)} (ceiling ${Math.round(ceiling)} · pace ${session.pace.toUpperCase()})`);
    }
  }
