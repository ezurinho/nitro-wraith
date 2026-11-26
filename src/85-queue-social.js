  /* ==========================================================================
   * 12.3 QUEUE SOCIAL PANEL
   * ========================================================================== */
  // Amigos y Equipo comparten el panel pequeno, pero en modo de solo lectura.
  // La ruta se mantiene separada de garagePanelRoute(): solo el garaje puede
  // armar la cola o pulsar «Race Now».
  //
  // El estado vive en esta fabrica y no en runQueue(): asi el bucle de la cola
  // no comparte una cache que solo usa esta vista. Las dependencias entran por
  // `deps` y el panel se consulta con un getter porque se crea mas tarde.
  function createQueueSocial(deps) {
    const {
      panel, paint, signedIn, onlineNow, shortWait, siteUser, jwtClaims, readToken,
    } = deps;
    let cache = { at: 0, data: null, pending: null, failedAt: 0, owner: '' };
    let routeSeen = '';
    let wakeAt = 0;
    // Lectura social: no es informacion que cambie al segundo y son tres GET
    // por refresco. Dos minutos de cache bajan el trafico sin dejar la vista
    // congelada; al abrir la pestana social se fuerza una lectura fresca.
    const TTL_MS = 120000;
    const RETRY_MS = 120000;
    const TIMEOUT_MS = 12000;

    function route() {
      const path = location.pathname;
      return path === '/friends' || path.startsWith('/friends/')
        || path === '/team' || path.startsWith('/team/');
    }

    function pageLabel() {
      const path = location.pathname;
      return path === '/team' || path.startsWith('/team/') ? 'team' : 'friends';
    }

    // El perfil que el sitio ya guardo es el respaldo inmediato: el panel tiene
    // algo que enseñar antes de que contesten las tres peticiones de lectura.
    function persisted() {
      const user = siteUser(0) || {};
      const listed = Array.isArray(user.friends)
        ? user.friends.length
        : (user.friends && typeof user.friends === 'object' ? Object.keys(user.friends).length : null);
      const total = Number(user.totalFriends);
      const friends = Number.isFinite(listed) ? listed : (Number.isFinite(total) ? total : null);
      const tag = String(user.tag || user.teamTag || '').trim();
      const role = String(user.teamRole || user.teamRoleName || '').trim();
      const owner = String(user.userID || user.id || user.username || '').trim();
      return {
        friends: Number.isFinite(friends) ? friends : null,
        teamTag: tag || null,
        teamRole: role || null,
        owner,
      };
    }

    // La cache social no puede sobrevivir a un cambio de cuenta sin recargar:
    // los contadores del usuario anterior no son del usuario nuevo. El token
    // cubre el caso en el que el perfil aun no se ha escrito en persist:nt.
    function ownerOf(profile = persisted()) {
      if (profile.owner) return profile.owner;
      const claims = jwtClaims();
      return claims && claims.sub ? String(claims.sub) : '';
    }

    function countText(value, pending = cache.pending) {
      if (Number.isFinite(value)) return String(value);
      return pending ? '…' : '—';
    }

    function statusText(current = cache) {
      if (current.pending) return 'Refreshing now.';
      const last = current.at
        ? `Last checked ${shortWait(Math.max(1000, Date.now() - current.at))} ago.`
        : 'Not checked yet.';
      return current.failedAt ? `${last} The latest read failed; retrying.` : last;
    }

    function snapshot() {
      const profile = persisted();
      const owner = ownerOf(profile);
      const current = cache.owner === owner;
      // Si la cuenta cambio, se enseña el respaldo del perfil nuevo y se
      // ignoran los contadores de la cuenta anterior hasta la siguiente GET.
      const cached = current ? (cache.data || {}) : {};
      return {
        current,
        pending: current && Boolean(cache.pending),
        friends: Number.isFinite(cached.friends) ? cached.friends : profile.friends,
        online: Number.isFinite(cached.online) ? cached.online : null,
        requests: Number.isFinite(cached.requests) ? cached.requests : null,
        teamTag: profile.teamTag,
        teamRole: profile.teamRole,
      };
    }

    function setSocialText(el, value) {
      if (el && el.textContent !== value) el.textContent = value;
    }

    function setSocialTitle(el, value) {
      if (el && el.title !== value) el.title = value;
    }

    function paintRows(visible) {
      const refs = panel();
      if (!refs) return;
      const state = snapshot();
      const rows = [
        [refs.socialFriendsRow, refs.socialFriends],
        [refs.socialOnlineRow, refs.socialOnline],
        [refs.socialRequestsRow, refs.socialRequests],
        [refs.socialTeamRow, refs.socialTeam],
        [refs.socialUpdatedRow, refs.socialUpdated],
      ];
      for (const [row] of rows) {
        if (row) row.hidden = !visible;
      }
      if (!visible) return;

      const current = state.current
        ? cache
        : { at: 0, pending: null, failedAt: 0 };
      setSocialText(refs.socialFriends, countText(state.friends, state.pending));
      setSocialText(refs.socialOnline, countText(state.online, state.pending));
      setSocialText(refs.socialRequests, countText(state.requests, state.pending));
      setSocialText(refs.socialTeam, state.teamTag
        ? `[${state.teamTag}]${state.teamRole ? ` · ${state.teamRole}` : ''}`
        : (signedIn() ? 'none' : '—'));
      const age = current.at
        ? `${shortWait(Math.max(1000, Date.now() - current.at))} ago`
        : '';
      setSocialText(refs.socialUpdated, state.pending
        ? 'refreshing…'
        : (current.failedAt ? (age ? `${age} · retry` : 'failed') : (age || '—')));

      const status = statusText(current);
      setSocialTitle(refs.socialFriendsRow,
        `Friends on this account. Read-only: the panel never adds or removes friends. ${status}`);
      setSocialTitle(refs.socialOnlineRow,
        `Friends online right now. Read-only; the panel does not invite or message anyone. ${status}`);
      setSocialTitle(refs.socialRequestsRow,
        `Pending friend requests. Read-only; the panel never accepts or denies them. ${status}`);
      setSocialTitle(refs.socialTeamRow,
        `Team tag and role from your profile. Read-only; the panel never invites, applies or leaves. ${status}`);
      setSocialTitle(refs.socialUpdatedRow,
        `Last read status for the three GET requests. ${status}`);
    }

    // Tres GET sin efectos: total de amigos, amigos online y solicitudes. El
    // panel no tiene ningun camino hacia accept/deny/invite/send. Si una
    // peticion falla, se conserva el respaldo del perfil y se reintenta luego.
    async function refresh(force = false) {
      if (!route()) return;
      // Las tres GET se reintentan al volver online; offline solo llenarian
      // la cache de fallos y dejarian el panel en «retry» sin motivo.
      if (!onlineNow()) return;
      const now = Date.now();
      const profile = persisted();
      const owner = ownerOf(profile);
      if (cache.owner !== owner) {
        // La peticion vieja puede seguir viva, pero su resultado se descarta
        // al ver que el owner ya no coincide. Se suelta el pending para que
        // la cuenta nueva no espere los 12 s de la anterior.
        cache = { at: 0, data: null, pending: null, failedAt: 0, owner };
      }
      if (document.hidden && !force) return;
      if (cache.pending) return cache.pending;
      if (!force && cache.data && now - cache.at < TTL_MS) return;
      if (!force && cache.failedAt && now - cache.failedAt < RETRY_MS) return;

      if (!cache.data) {
        cache.data = { friends: profile.friends, online: null, requests: null };
      }

      const pending = (async () => {
        const token = readToken();
        // Un GET colgado no puede dejar el panel en «refreshing» para siempre.
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
        const headers = { accept: 'application/json, text/plain, */*' };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
          const claims = jwtClaims(token);
          if (claims && claims.sub) headers['x-uid'] = String(claims.sub);
        }

        const stamp = Date.now();
        const read = async (url) => {
          try {
            const response = await fetch(url, {
              method: 'GET',
              credentials: 'include',
              headers,
              cache: 'no-store',
              signal: controller ? controller.signal : undefined,
            });
            if (!response.ok) return null;
            return await response.json();
          } catch {
            return null;
          }
        };

        let all;
        let online;
        let requests;
        try {
          [all, online, requests] = await Promise.all([
            read(`/api/v2/friends?_=${stamp}`),
            read(`/api/v2/friends?online=1&_=${stamp}`),
            read(`/api/v2/friend-requests?r=${stamp}`),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }

        const countValues = (body) => {
          const results = body && body.results;
          return Array.isArray(results && results.values) ? results.values.length : null;
        };
        const countRequests = (body) => {
          const results = body && body.results;
          if (Array.isArray(results && results.requests)) return results.requests.length;
          const total = Number(results && results.totalRecords);
          return Number.isFinite(total) ? total : null;
        };

        // Una respuesta de una cuenta que ya no esta activa no puede
        // reemplazar los contadores de la cuenta nueva.
        if (cache.owner !== owner) return;

        const next = {
          friends: countValues(all),
          online: countValues(online),
          requests: countRequests(requests),
        };
        if (next.friends === null && next.online === null && next.requests === null) {
          cache.failedAt = Date.now();
        } else {
          cache.data = next;
          cache.at = Date.now();
          cache.failedAt = 0;
        }
      })();

      cache.pending = pending;
      try {
        await pending;
      } catch {
        // Un error inesperado no debe quedar como rechazo sin manejar en una
        // llamada fire-and-forget desde el latido.
        if (cache.owner === owner) cache.failedAt = Date.now();
      } finally {
        if (cache.pending === pending) cache.pending = null;
        if (route()) paint();
      }
    }

    function wake() {
      if (!route()) return;
      const now = Date.now();
      if (now - wakeAt < 1500) return;
      wakeAt = now;
      refresh(true).catch(() => {});
    }

    function setRoute(path) {
      routeSeen = path;
    }

    function resetRoute() {
      routeSeen = '';
    }

    return {
      route,
      pageLabel,
      snapshot,
      paintRows,
      refresh,
      wake,
      setRoute,
      resetRoute,
      routeSeen: () => routeSeen,
    };
  }
