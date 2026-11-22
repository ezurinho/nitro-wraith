
  /* ==========================================================================
   * 15. STICKERS (INSIDE THE RACE)
   * ========================================================================== */
  // Un sticker por carrera, con el reloj corriendo y una sola vez. `chance`
  // queda en 100 por peticion expresa; el reto diario ya no necesita boost,
  // pero se conserva para cuentas que tengan una configuracion antigua.
  // Si el chat no esta montado cuando toca, el siguiente tick reintenta.
  function stickerChallengePending() {
    if (CONFIG.stickers.challengeBoost === false) return null;
    try {
      return challengeProgressAll().find((item) => item
        && Number(item.goal) > 0
        && Number(item.progress) < Number(item.goal)
        && /sticker/i.test(`${item.short || ''} ${item.title || ''}`)) || null;
    } catch {
      return null;
    }
  }

  // El garaje puede tardar en escribir `user.challenges`; mientras tanto el
  // contador se queda en 0 aunque el reto ya tenga carreras. Sin un tope, el
  // boost mandaria stickers en todas las carreras del dia. El libro vive en la
  // ventana de arriba (sobrevive a la recarga de cada carrera) y apunta el
  // progreso visto al empezar y los envios hechos: al llegar a la meta se
  // apaga aunque el progreso siga a 0.
  const localStickerBoost = {};

  function stickerBoostLedger() {
    try {
      const top = window.top;
      if (top && (!top.__ntaStickerBoost || typeof top.__ntaStickerBoost !== 'object')) {
        top.__ntaStickerBoost = {};
      }
      if (top && top.__ntaStickerBoost) return top.__ntaStickerBoost;
    } catch { /* otro origen */ }
    return localStickerBoost;
  }

  function stickerBoostPlan(challenge, ledger = stickerBoostLedger()) {
    if (!challenge || !ledger) return { boost: false, remaining: 0, entry: null };
    const key = String(challenge.key || challenge.title || 'sticker');
    const goal = Math.max(0, Number(challenge.goal) || 0);
    const progress = Math.max(0, Number(challenge.progress) || 0);
    let entry = ledger[key];
    if (!entry || !Number.isFinite(Number(entry.baseline))) {
      entry = { baseline: progress, sent: 0, at: Date.now() };
      ledger[key] = entry;
    }
    const used = Math.max(0, Number(entry.baseline) || 0) + Math.max(0, Number(entry.sent) || 0);
    const remaining = Math.max(0, goal - used);
    return { boost: remaining > 0, remaining, entry, key };
  }

  function noteStickerBoostSent(plan) {
    if (!plan || !plan.entry) return;
    plan.entry.sent = Math.max(0, Number(plan.entry.sent) || 0) + 1;
    plan.entry.at = Date.now();
  }

  window.__ntaDebug = window.__ntaDebug || {};
  window.__ntaDebug.stickerChallengePending = () => Boolean(stickerChallengePending());
  window.__ntaDebug.stickerBoostPlan = () => {
    const challenge = stickerChallengePending();
    return challenge ? stickerBoostPlan(challenge) : null;
  };
  window.__ntaDebug.stickerBoostSent = () => {
    const challenge = stickerChallengePending();
    if (!challenge) return false;
    noteStickerBoostSent(stickerBoostPlan(challenge));
    return true;
  };

  function initStickers() {
    let sentThisRace = false;
    let pending = false;
    let challengeNoted = false;

    // El chat puede estar cerrado: si hay opciones visibles se usan esas y, si
    // no, las ocultas (que es lo que hacia el script original).
    const options = () => {
      const all = [...document.querySelectorAll('.raceChat-pickerOpt')];
      if (!all.length) return [];
      const shown = all.filter(isVisible);
      return shown.length ? shown : all;
    };

    let lastIndex = -1;

    function send() {
      // La espera pudo terminar con el turno ya cedido a otra copia.
      if (standbyActive()) return false;
      const opts = options();
      if (!opts.length) return false;

      let index;
      if (CONFIG.stickers.choice > 0) {
        index = Math.min(CONFIG.stickers.choice, opts.length) - 1;
      } else {
        index = Math.floor(Math.random() * opts.length);

        // Repetir el mismo sticker dos carreras seguidas canta mas que variar:
        // con mas de una opcion se evita el anterior.
        if (opts.length > 1 && index === lastIndex) {
          index = (index + 1 + Math.floor(Math.random() * (opts.length - 1))) % opts.length;
        }
      }

      lastIndex = index;
      const target = opts[index].firstElementChild || opts[index];
      target.click();
      log(`Sticker ${index + 1}/${opts.length} sent.`);
      return true;
    }

    setInterval(() => {
      // Los stickers son automatizacion: parado no se manda nada, y apagarlos
      // en TUNE debe surtir efecto sin recargar la pagina.
      if (!CONFIG.stickers.enabled) return;
      if (session.stopped) return;
      // Otra copia lleva el teclado: un sticker desde la copia en espera es una
      // accion duplicada y delata que hay dos instancias.
      if (standbyActive()) return;

      // Carrera nueva: la sesion vuelve a cero y se permite otro sticker.
      if (session.chars === 0) {
        sentThisRace = false;
        return;
      }
      if (sentThisRace || pending) return;
      if (!options().length) return;

      // Se decide una sola vez por carrera, no en cada tick. `sentThisRace`
      // solo se marca cuando el clic salio de verdad: si el chat aun no estaba
      // montado, el siguiente tick reintenta en vez de perder la carrera.
      const challenge = stickerChallengePending();
      const plan = challenge ? stickerBoostPlan(challenge) : null;
      const boost = Boolean(plan && plan.boost);
      if (boost && !challengeNoted) {
        challengeNoted = true;
        log('Daily Challenge: sticker challenge pending; sending a sticker in every race until it is complete.');
      } else if (!boost) {
        challengeNoted = false;
      }
      if (!boost && CONFIG.stickers.chance < 100
        && Math.random() * 100 >= CONFIG.stickers.chance) return;

      pending = true;
      const [min, max] = CONFIG.stickers.delayMs;
      preciseSleep(min + Math.random() * (max - min)).then(() => {
        pending = false;
        if (session.chars > 0 && session.typing && !session.stopped) {
          const sent = send();
          if (sent) {
            sentThisRace = true;
            if (boost) noteStickerBoostSent(plan);
          }
        }
      });
    }, 700);
  }
