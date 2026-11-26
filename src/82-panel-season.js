  /* ==========================================================================
   * 12.2 SEASON TRACKER
   * ========================================================================== */

  /* --------------------------------------------------------------------------
   * Season tracker
   *
   * La pagina /season renderiza el tier activo en React. El estado no viaja en
   * el HTML (es un shell), asi que la foto se toma ALLI, donde el DOM ya esta
   * hidratado, y se guarda para que el panel de la carrera la lea despues. El
   * XP exacto sale de las props del componente; si React cambia de forma, el
   * parser se queda con el tier y el porcentaje visibles en vez de inventar.
   * ------------------------------------------------------------------------ */
  function seasonClean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function seasonFiberProps(node) {
    if (!node) return null;
    let fiber = null;
    try {
      const key = Object.keys(node).find((name) => name.startsWith('__reactFiber$'));
      fiber = key ? node[key] : null;
    } catch {
      return null;
    }
    for (let depth = 0; depth < 30 && fiber; depth++) {
      const props = fiber.memoizedProps;
      if (props && typeof props === 'object'
        && props.userSeasonExperience !== null && props.userSeasonExperience !== undefined
        && Number.isFinite(Number(props.userSeasonExperience))) {
        return props;
      }
      fiber = fiber.return;
    }
    return null;
  }

  function seasonDateRange(text, now = Date.now()) {
    const match = String(text || '').match(/([A-Z][a-z]{2})\s+(\d{1,2})\s*[-–]\s*([A-Z][a-z]{2})\s+(\d{1,2})/);
    if (!match) return { endsAt: null, endsText: '' };
    const year = new Date(now).getFullYear();
    const start = Date.parse(`${match[1]} ${match[2]}, ${year} 00:00:00`);
    let endsAt = Date.parse(`${match[3]} ${match[4]}, ${year} 23:59:59`);
    if (!Number.isFinite(start) || !Number.isFinite(endsAt)) return { endsAt: null, endsText: '' };
    if (endsAt < start) endsAt = Date.parse(`${match[3]} ${match[4]}, ${year + 1} 23:59:59`);
    return {
      endsAt: Number.isFinite(endsAt) ? endsAt : null,
      endsText: `${match[3]} ${match[4]}`,
    };
  }

  function parseSeasonPage(root = document) {
    const scope = root && typeof root.querySelector === 'function' ? root : document;
    const card = scope.querySelector('.seasonReward.is-selected, .seasonReward--free.is-selected');
    if (!card) return null;

    const tier = Number(seasonClean((card.querySelector('.seasonReward-tier') || {}).textContent));
    if (!Number.isFinite(tier) || tier <= 0) return null;

    const fill = card.querySelector('.prog-barFill') || card.querySelector('.prog-points');
    const rawProgress = fill ? (fill.style.width || fill.style.left || '') : '';
    const progress = Number.parseFloat(rawProgress);
    const props = seasonFiberProps(card.querySelector('.prog-points') || card) || {};

    const rawXp = props.userSeasonExperience;
    const xp = rawXp !== null && rawXp !== undefined && Number.isFinite(Number(rawXp))
      ? Math.max(0, Math.round(Number(rawXp)))
      : null;
    const rawNext = props.experience;
    const nextXp = rawNext !== null && rawNext !== undefined && Number.isFinite(Number(rawNext))
      ? Math.max(0, Math.round(Number(rawNext)))
      : null;
    const season = props.season && typeof props.season === 'object' ? props.season : {};
    const seasonID = season.seasonID !== null && season.seasonID !== undefined && Number.isFinite(Number(season.seasonID))
      ? Number(season.seasonID)
      : null;

    const nameNode = scope.querySelector('.season-header h1, .season-head h1, h1');
    const seasonName = seasonClean(nameNode && nameNode.textContent)
      || seasonClean((scope.querySelector('.seasonTeaser') || {}).textContent)
      || 'Season';
    const teaser = scope.querySelector('.seasonTeaser');
    const dates = seasonDateRange(teaser && teaser.textContent);

    const boot = seasonBoot();
    const levels = boot.levels || SEASON_LEVELS_DEFAULT;
    const totalRewards = Math.max(1, Math.floor(Number(boot.active && boot.active.totalRewards) || 35));
    const computed = xp !== null ? seasonTierForXp(xp, levels, totalRewards) : null;
    return {
      v: 2,
      at: Date.now(),
      auto: false,
      source: 'page',
      seasonID,
      seasonName,
      // El premio seleccionado es el SIGUIENTE, no el tier actual: con 76.701
      // XP la pagina marca T7 a 90.000 y el nivel actual es T6 (70.000).
      tier: computed ? computed.tier : Math.max(1, tier - 1),
      nextTier: computed ? computed.nextTier : tier,
      progress: computed
        ? Math.round(computed.progress)
        : (Number.isFinite(progress)
          ? Math.max(0, Math.min(100, progress))
          : Math.max(0, Math.min(100, Number(props.progress) || 0))),
      xp,
      currentXp: computed ? computed.currentXp : null,
      nextXp: computed ? computed.nextXp : nextXp,
      levels,
      totalRewards,
      endsAt: dates.endsAt,
      endsText: dates.endsText,
    };
  }

  const SEASON_LEVELS_DEFAULT = {
    startingLevels: 3,
    experiencePerStartingLevel: 10000,
    experiencePerAchievementLevel: 20000,
    experiencePerExtraLevels: 40000,
    extraLevelReward: 100000,
  };
  let seasonUserAt = 0;

  // La config de niveles y la temporada activa ya vienen en el bootstrap de
  // cualquier pagina de Nitro Type. El marco de la carrera tambien lo tiene,
  // asi que no hace falta abrir /season para conocer los umbrales.
  function seasonBoot() {
    try {
      if (typeof window.NTBOOTSTRAP !== 'function') return {};
      const data = window.NTBOOTSTRAP();
      if (!data || typeof data !== 'object') return {};
      const list = Array.isArray(data.ACTIVE_SEASONS) ? data.ACTIVE_SEASONS : [];
      const now = Date.now() / 1000;
      const active = list.find((item) => item
        && Number(item.startStamp) <= now && Number(item.endStamp) > now) || list[0] || null;
      return {
        active,
        levels: data.SEASON_LEVELS && typeof data.SEASON_LEVELS === 'object' ? data.SEASON_LEVELS : null,
      };
    } catch {
      return {};
    }
  }

  // XP del umbral de un nivel. Con la config real: 1=0, 2=10k, 3=20k, 4=30k,
  // 5=50k, 6=70k, 7=90k... que es exactamente lo que pinta la pagina.
  function seasonLevelXp(level, levels = SEASON_LEVELS_DEFAULT) {
    const start = Math.max(1, Math.floor(Number(levels.startingLevels) || 3));
    const startCost = Math.max(0, Number(levels.experiencePerStartingLevel) || 10000);
    const achCost = Math.max(0, Number(levels.experiencePerAchievementLevel) || 20000);
    const n = Math.max(1, Math.floor(Number(level) || 1));
    if (n <= start) return (n - 1) * startCost;
    return start * startCost + (n - start - 1) * achCost;
  }

  function seasonTierForXp(xp, levels = SEASON_LEVELS_DEFAULT, totalRewards = 35) {
    const value = Math.max(0, Math.floor(Number(xp) || 0));
    const max = Math.max(1, Math.floor(Number(totalRewards) || 35));
    let tier = 1;
    while (tier < max && value >= seasonLevelXp(tier + 1, levels)) tier += 1;

    const currentXp = seasonLevelXp(tier, levels);
    const nextXp = tier < max ? seasonLevelXp(tier + 1, levels) : null;
    const span = nextXp === null ? 0 : nextXp - currentXp;
    const progress = span > 0
      ? Math.max(0, Math.min(100, ((value - currentXp) / span) * 100))
      : 100;
    return { tier, nextTier: nextXp === null ? null : tier + 1, currentXp, nextXp, progress };
  }

  function seasonEndText(stamp) {
    const value = Number(stamp);
    if (!Number.isFinite(value) || value <= 0) return '';
    try {
      return new Date(value * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  // El XP de temporada que el juego persiste en `persist:nt`. No es
  // playerExperience (de por vida): es el `experience` que el servidor usa
  // para el premio activo. Puede venir como objeto o como JSON anidado en
  // `user`.
  // `persist:nt` es el estado entero del sitio (decenas o cientos de KB). Un
  // JSON.parse cada 5 s se nota en el hilo principal y el panel solo necesita
  // saber si el XP cambio. Se cachea por el texto crudo, igual que la foto de
  // temporada: si el juego escribe otra vez, el texto cambia y se relee.
  let userCacheRaw = null;
  let userCacheXp = null;

  function parseNtUserXp(raw) {
    let root;
    try { root = JSON.parse(raw); } catch { return null; }

    const seen = new Set();
    const queue = [root];
    while (queue.length) {
      const value = queue.shift();
      if (!value) continue;
      if (typeof value === 'string') {
        if (!/^[\[{]/.test(value.trim())) continue;
        try { queue.push(JSON.parse(value)); } catch { /* no era JSON */ }
        continue;
      }
      if (typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);

      if (Number.isFinite(Number(value.experience))
        && value.experience !== null && value.experience !== '') {
        return Math.max(0, Math.round(Number(value.experience)));
      }
      for (const child of Object.values(value)) {
        if (child && typeof child === 'object') queue.push(child);
        else if (typeof child === 'string' && /^[\[{]/.test(child.trim())) queue.push(child);
      }
    }
    return null;
  }

  function seasonUserXp() {
    const raw = disk.get(KEYS.ntUser, '');
    if (raw === userCacheRaw) return userCacheXp;
    userCacheRaw = raw;
    perfCounters.userParses += raw ? 1 : 0;
    userCacheXp = raw ? parseNtUserXp(raw) : null;
    return userCacheXp;
  }

  // La tarjeta se repinta cada 500 ms y esto hacia JSON.parse en cada tick. Se
  // cachea por el texto crudo de localStorage: si la foto cambia (otra pestana,
  // seasonRefreshFromUser) el texto cambia y se vuelve a leer sola.
  let seasonCacheRaw = null;
  let seasonCacheSnap = null;

  function seasonRead() {
    try {
      const raw = disk.get(KEYS.season, '');
      if (raw === seasonCacheRaw) return seasonCacheSnap;
      seasonCacheRaw = raw;
      if (!raw) {
        seasonCacheSnap = null;
        return null;
      }
      const snap = JSON.parse(raw);
      if (!snap || typeof snap !== 'object' || !Number.isFinite(Number(snap.tier))) {
        seasonCacheSnap = null;
        return null;
      }

      // Las fotos de 7.51.0 guardaban el tier del premio seleccionado (el
      // siguiente). Se normalizan al nivel actual sin pedir otra visita, y la
      // migracion se guarda para no repetir el calculo en cada tick.
      let migrated = false;
      if (!Number.isFinite(Number(snap.nextTier)) && Number.isFinite(Number(snap.xp))) {
        const levels = snap.levels && typeof snap.levels === 'object'
          ? snap.levels : SEASON_LEVELS_DEFAULT;
        const total = Math.max(1, Math.floor(Number(snap.totalRewards) || 35));
        const computed = seasonTierForXp(snap.xp, levels, total);
        snap.tier = computed.tier;
        snap.nextTier = computed.nextTier;
        snap.progress = Math.round(computed.progress);
        snap.currentXp = computed.currentXp;
        if (computed.nextXp !== null) snap.nextXp = computed.nextXp;
        migrated = true;
      }
      if (migrated) {
        const text = JSON.stringify(snap);
        disk.set(KEYS.season, text);
        seasonCacheRaw = text;
      }
      seasonCacheSnap = snap;
      return snap;
    } catch {
      seasonCacheRaw = null;
      seasonCacheSnap = null;
      return null;
    }
  }

  // Actualiza la tarjeta con el XP que el juego ya guarda tras cada carrera,
  // sin iframe, sin pestaña y sin esperar a que alguien abra Season.
  function seasonRefreshFromUser(force = false) {
    const now = Date.now();
    if (!force && now - seasonUserAt < 5000) return seasonRead();
    seasonUserAt = now;

    const xp = seasonUserXp();
    if (xp === null) return seasonRead();

    const boot = seasonBoot();
    const active = boot.active;
    let snap = seasonRead();

    // Una temporada nueva resetea el XP: la foto vieja no puede mandar.
    if (snap && active && snap.seasonID && Number(snap.seasonID) !== Number(active.seasonID)) snap = null;
    // Si el almacenamiento va por detras de la foto, no se retrocede el XP.
    if (!force && snap && Number.isFinite(Number(snap.xp)) && xp < Number(snap.xp)) return snap;

    const levels = boot.levels || (snap && snap.levels) || SEASON_LEVELS_DEFAULT;
    const totalRewards = Math.max(1, Math.floor(
      Number(active && active.totalRewards) || Number(snap && snap.totalRewards) || 35,
    ));
    const computed = seasonTierForXp(xp, levels, totalRewards);
    const seasonID = Number(active && active.seasonID) || Number(snap && snap.seasonID) || null;
    const seasonName = (active && active.name) || (snap && snap.seasonName) || 'Season';
    const endsAt = Number(active && active.endStamp)
      ? Number(active.endStamp) * 1000
      : (snap && snap.endsAt) || null;
    const endsText = (active && seasonEndText(active.endStamp)) || (snap && snap.endsText) || '';

    const next = {
      v: 2,
      at: now,
      auto: true,
      source: 'user',
      seasonID,
      seasonName,
      tier: computed.tier,
      nextTier: computed.nextTier,
      progress: Math.round(computed.progress),
      xp,
      currentXp: computed.currentXp,
      nextXp: computed.nextXp,
      levels,
      totalRewards,
      endsAt,
      endsText,
    };

    if (snap && snap.auto && snap.tier === next.tier && snap.nextTier === next.nextTier
      && snap.xp === next.xp && snap.seasonName === next.seasonName
      && snap.endsAt === next.endsAt) {
      return snap;
    }

    if (!disk.set(KEYS.season, JSON.stringify(next))) return snap || next;
    if (panel && panel.refs) panel.seasonSig = '';
    return next;
  }

  function seasonXpText(value) {
    return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))).toLocaleString() : '—';
  }

  // "1.2k" / "950": el ritmo y la proyeccion caben en una fila del panel.
  function seasonXpShort(value) {
    const n = Math.max(0, Math.round(Number(value) || 0));
    if (n < 1000) return String(n);
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
  }

  // XP por dia activo de la ultima semana. El dia en curso no cuenta: a media
  // tarde su XP esta a medias y hundiria la media. Solo si no hay ningun dia
  // cerrado se usa el de hoy. Sin XP devuelve null y la fila no inventa nada.
  function seasonDailyXp(days = 7) {
    const cutoff = Date.now() - Math.max(1, days) * 86400000;
    const todayDate = todayKey();
    const byDate = new Map();
    for (const day of dayHistoryRead()) {
      const at = Date.parse(`${day.date}T12:00:00`);
      if (!Number.isFinite(at) || at < cutoff || !(Number(day.xp) > 0)) continue;
      if (day.date === todayDate) continue;
      byDate.set(day.date, Number(day.xp));
    }
    if (!byDate.size) {
      const today = todayRead();
      // El dia en curso solo vale como dia completo si lleva al menos 4 h: con
      // 10 minutos de carrera sobreestimaria el ritmo y diria que el premio
      // esta mas cerca de lo que esta.
      const first = Number(today.firstAt) || 0;
      const age = first > 0 ? Date.now() - first : 0;
      if (Number(today.xp) > 0 && age >= 4 * 3600000) byDate.set(today.date, Number(today.xp));
    }
    if (!byDate.size) return null;
    const total = [...byDate.values()].reduce((sum, value) => sum + value, 0);
    return { days: byDate.size, xp: total, perDay: Math.round(total / byDate.size) };
  }

  // Proyeccion al cierre de temporada con el ritmo real. `needed` es el XP
  // diario minimo para llegar al siguiente premio antes de que acabe.
  function seasonPace(snap, now = Date.now()) {
    if (!snap || !Number.isFinite(Number(snap.xp)) || !Number.isFinite(Number(snap.nextXp))) return null;
    const left = Math.max(0, Number(snap.nextXp) - Number(snap.xp));
    if (left <= 0) {
      return { status: 'done', left: 0, daysLeft: null, perDay: null, projected: null, needed: 0, short: 0 };
    }
    if (!Number.isFinite(Number(snap.endsAt)) || Number(snap.endsAt) <= 0) {
      return { status: 'unknown', left, daysLeft: null, perDay: null, projected: null, needed: 0, short: 0 };
    }

    const daysLeft = Math.max(0, Math.ceil((Number(snap.endsAt) - now) / 86400000));
    if (daysLeft <= 0) {
      return { status: 'over', left, daysLeft: 0, perDay: null, projected: 0, needed: 0, short: left };
    }

    const daily = seasonDailyXp();
    if (!daily) {
      return {
        status: 'unknown', left, daysLeft, perDay: null, projected: null,
        needed: Math.ceil(left / daysLeft), short: 0,
      };
    }

    const projected = Math.round(daily.perDay * daysLeft);
    return {
      status: projected >= left ? 'ontrack' : 'short',
      left,
      daysLeft,
      perDay: daily.perDay,
      projected,
      needed: Math.ceil(left / daysLeft),
      short: Math.max(0, left - projected),
    };
  }

  // XP medio por carrera de las ultimas diez: la unica base honesta para decir
  // cuantas carreras faltan. Sin historial cae al resumen de hoy.
  function seasonXpPerRace() {
    let list = [];
    try { list = JSON.parse(disk.get(KEYS.history, '[]')); } catch { list = []; }
    const xp = (Array.isArray(list) ? list : [])
      .map((race) => Number(race && race.xp))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (xp.length) return Math.max(1, Math.round(xp.reduce((sum, value) => sum + value, 0) / xp.length));
    const today = todayRead();
    if (today.races > 0 && today.xp > 0) return Math.max(1, Math.round(today.xp / today.races));
    return null;
  }

  // Las mismas frases para la tarjeta y para el garaje: un solo sitio decide
  // cuando hay prisa (tres dias o menos, menos de 5k XP o ritmo corto).
  function seasonAlertText(snap) {
    if (!snap) return [];
    const alerts = [];
    const xp = Number(snap.xp);
    const nextXp = Number(snap.nextXp);
    const left = Number.isFinite(xp) && Number.isFinite(nextXp) ? Math.max(0, nextXp - xp) : null;
    let daysLeft = null;
    if (Number.isFinite(Number(snap.endsAt)) && Number(snap.endsAt) > 0) {
      daysLeft = Math.ceil((Number(snap.endsAt) - Date.now()) / 86400000);
    }
    if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 3) {
      alerts.push(daysLeft === 0 ? 'Season ends today' : `Season ends in ${daysLeft}d`);
    }
    if (left !== null && left > 0 && left < 5000) {
      alerts.push(`${left.toLocaleString()} XP to next reward`);
    }
    const pace = seasonPace(snap);
    if (pace && pace.status === 'short' && pace.daysLeft >= 1 && pace.needed > 0) {
      alerts.push(`≈ ${seasonXpShort(pace.needed)} XP/day to reach T${Number(snap.nextTier) || 'next'}`);
    }
    return alerts;
  }

  let seasonPaintAt = 0;

  function paintSeason(force = false) {
    if (!panel.refs || !panel.refs.seasonName) return;
    const snap = seasonRead();
    // La firma barata evita calcular el ritmo y leer el historial en cada tick
    // del panel. Con datos iguales basta con refrescar cada 15 s (el ritmo
    // diario no cambia de un tick a otro); si llega XP nuevo, `snap.at` cambia
    // y la tarjeta se repinta en el acto.
    const baseSig = snap
      ? `${snap.at}|${snap.tier}|${snap.nextTier}|${snap.progress}|${snap.xp}|${snap.nextXp}|${snap.endsAt}`
      : 'empty';
    const now = Date.now();
    if (!force && panel.seasonBaseSig === baseSig && now - seasonPaintAt < 15000) return;
    panel.seasonBaseSig = baseSig;
    seasonPaintAt = now;

    const pace = seasonPace(snap);
    const perRace = seasonXpPerRace();
    const leftToNext = snap && Number.isFinite(Number(snap.xp)) && Number.isFinite(Number(snap.nextXp))
      ? Math.max(0, Number(snap.nextXp) - Number(snap.xp))
      : null;
    const racesLeft = leftToNext !== null && perRace ? Math.ceil(leftToNext / perRace) : null;
    const sig = snap
      ? `${snap.at}|${snap.tier}|${snap.nextTier}|${snap.progress}|${snap.xp}|${snap.nextXp}|${snap.endsAt}|${pace ? `${pace.status}:${pace.perDay}` : '-'}|${racesLeft}`
      : 'empty';
    if (panel.seasonSig === sig) return;
    panel.seasonSig = sig;

    if (panel.refs.seasonAlert) {
      panel.refs.seasonAlert.style.display = 'none';
      panel.refs.seasonAlert.textContent = '';
    }

    const empty = !snap;
    if (panel.refs.seasonCard) panel.refs.seasonCard.classList.toggle('is-empty', empty);
    if (empty) {
      setText(panel.refs.seasonTag, 'no snapshot');
      setText(panel.refs.seasonName, 'Season');
      setText(panel.refs.seasonTier, '—');
      setText(panel.refs.seasonXp, '—');
      setText(panel.refs.seasonNext, '—');
      setText(panel.refs.seasonRaces, '—');
      setText(panel.refs.seasonPace, '—');
      setText(panel.refs.seasonEnds, '—');
      setText(panel.refs.seasonNote, 'Waiting for your account XP...');
      if (panel.refs.seasonFill) panel.refs.seasonFill.style.width = '0%';
      return;
    }

    const progress = Math.max(0, Math.min(100, Number(snap.progress) || 0));
    const xp = snap.xp !== null && snap.xp !== undefined && Number.isFinite(Number(snap.xp)) ? Number(snap.xp) : null;
    const nextXp = snap.nextXp !== null && snap.nextXp !== undefined && Number.isFinite(Number(snap.nextXp)) ? Number(snap.nextXp) : null;
    const tier = Number(snap.tier);

    setText(panel.refs.seasonTag, `T${tier} · ${Math.round(progress)}%`);
    setText(panel.refs.seasonName, snap.seasonName || 'Season');
    setText(panel.refs.seasonTier, `T${tier}`);
    setText(panel.refs.seasonXp, xp !== null && nextXp !== null
      ? `${seasonXpText(xp)} / ${seasonXpText(nextXp)} XP`
      : (xp !== null ? `${seasonXpText(xp)} XP` : '—'));

    const left = xp !== null && nextXp !== null ? Math.max(0, nextXp - xp) : null;
    setText(panel.refs.seasonNext, left !== null
      ? `${seasonXpText(left)} XP to go`
      : (nextXp !== null ? `at ${seasonXpText(nextXp)} XP` : '—'));

    // Cuantas carreras caen a ese ritmo de XP, con la media de las ultimas
    // diez. Sin historial no se inventa: deja un guion.
    setText(panel.refs.seasonRaces, racesLeft !== null ? `≈ ${racesLeft} races` : '—');
    if (panel.refs.seasonRaces) {
      panel.refs.seasonRaces.title = racesLeft !== null
        ? `${seasonXpText(left)} XP left at about ${seasonXpText(perRace)} XP per race in the last races.`
        : 'Run a race to estimate how many races the next reward needs.';
    }

    // El ritmo real de la semana, proyectado a los dias que quedan: dice si el
    // siguiente premio esta al alcance y cuanto falta por dia si no lo esta.
    let paceText = '—';
    let paceTitle = 'No daily XP yet: run a few races to project the season.';
    if (pace && pace.status === 'done') {
      paceText = 'max tier';
      paceTitle = 'Every reward of this season is already unlocked.';
    } else if (pace && pace.status === 'over') {
      paceText = 'season over';
      paceTitle = 'The season already ended; this card keeps the last snapshot.';
    } else if (pace && pace.status === 'ontrack') {
      paceText = `${seasonXpShort(pace.perDay)}/day · on pace`;
      paceTitle = `${seasonXpShort(pace.perDay)} XP/day over ${pace.daysLeft}d projects ${seasonXpShort(pace.projected)} XP: the next reward is in reach.`;
    } else if (pace && pace.status === 'short') {
      paceText = `${seasonXpShort(pace.perDay)}/day · ${seasonXpShort(pace.short)} short`;
      paceTitle = `${seasonXpShort(pace.left)} XP left in ${pace.daysLeft}d: ${seasonXpShort(pace.perDay)}/day projects ${seasonXpShort(pace.projected)}, ${seasonXpShort(pace.short)} short of the next reward.`;
    }
    setText(panel.refs.seasonPace, paceText);
    if (panel.refs.seasonPace) panel.refs.seasonPace.title = paceTitle;

    let ends = snap.endsText ? `ends ${snap.endsText}` : '—';
    let daysLeft = null;
    if (snap.endsAt !== null && snap.endsAt !== undefined && Number.isFinite(Number(snap.endsAt))) {
      daysLeft = Math.ceil((Number(snap.endsAt) - Date.now()) / 86400000);
      if (daysLeft <= 0) ends = 'ended';
      else if (daysLeft <= 30) ends += ` · ${daysLeft}d`;
    }
    setText(panel.refs.seasonEnds, ends);
    setText(panel.refs.seasonNote, snap.auto
      ? 'auto · account XP'
      : `snapshot ${elapsedText(snap.at, true)} · open Season to refresh`);
    if (panel.refs.seasonFill) panel.refs.seasonFill.style.width = `${progress}%`;

    // Solo avisa cuando de verdad hay prisa: tres dias o menos de temporada,
    // menos de 5.000 XP para el siguiente premio o un ritmo que no alcanza.
    const alerts = seasonAlertText(snap);
    if (panel.refs.seasonAlert) {
      panel.refs.seasonAlert.textContent = alerts.join(' · ');
      panel.refs.seasonAlert.style.display = alerts.length ? '' : 'none';
    }
  }

  function captureSeasonPage() {
    let saved = false;
    const take = () => {
      const snap = parseSeasonPage(document);
      if (!snap) return false;
      try {
        disk.set(KEYS.season, JSON.stringify(snap));
      } catch {
        return false;
      }
      if (!saved) {
        saved = true;
        log(`Season captured: ${snap.seasonName}, T${snap.tier}${snap.nextTier ? ` (next T${snap.nextTier})` : ''}, ${snap.xp === null ? 'XP unknown' : `${snap.xp.toLocaleString()} XP`}.`);
      }
      return true;
    };

    if (take()) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (take() || tries >= 20) clearInterval(timer);
    }, 500);
    setTimeout(() => clearInterval(timer), 12000);
  }

