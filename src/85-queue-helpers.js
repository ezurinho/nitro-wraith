  /* ==========================================================================
   * 13b. QUEUE HELPERS
   * ==========================================================================
  */

  // Lo que `runQueue` usa y no lee nada suyo. Salieron de dentro de la cola
  // porque `node tools/panel-map.js 90-queue.js --nested` los marcaba con cero
  // cierres: no tocan ni una variable de `runQueue`, solo cosas de modulo
  // (`CONFIG`, `normalize`, `siteUser`, `disk`). Al vivir fuera, cualquier otro
  // modulo puede usarlos y la cola se queda sin 200 lineas de ancho sin cambiar
  // una linea de comportamiento.
  function usable(el) {
    if (!el || el.disabled === true || el.getAttribute('aria-disabled') === 'true') return false;
    if (el.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.pointerEvents !== 'none';
  }

  function findButton(matches) {
    for (const el of document.querySelectorAll('button, a, [role="button"]')) {
      const label = normalize(el.textContent);
      if (label && matches(label) && usable(el)) return el;
    }
    return null;
  }

  function fire(el, type, buttons) {
    const base = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, buttons };
    let event;
    try {
      event = (type.startsWith('pointer') && typeof PointerEvent === 'function')
        ? new PointerEvent(type, { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true, width: 1, height: 1 })
        : new MouseEvent(type, base);
    } catch {
      event = new MouseEvent(type, base);
    }
    el.dispatchEvent(event);
  }

  function boxBanner() {
    const el = document.querySelector('.mysteryBox-arrival');
    return el ? normalize(el.textContent) : '';
  }

  function boxRewardText(reward) {
    if (!reward) return 'reward received';
    if (reward.type === 'money') return `$${Number(reward.value).toLocaleString()}`;
    if (reward.type === 'nitros') return `${Number(reward.value).toLocaleString()} nitros`;
    if (reward.type === 'car') return `car #${reward.value}`;
    return String(reward.type || 'reward received');
  }

  function shortWait(ms) {
    const min = Math.max(0, Math.round(ms / 60000));
    if (min < 1) return 'less than a minute';
    if (min < 60) return `${min} min`;
    return `${Math.round(min / 60)} h`;
  }

  // Tiempo que le queda al token de sesion. Sale del mismo `exp` que usa la
  // renovacion proactiva, asi que lo que dice el panel y lo que hace la cola
  // no pueden discrepar.
  function sessionClockText(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    return `${seconds}s`;
  }

  // Portapapeles: `navigator.clipboard` necesita gesto y puede fallar dentro de
  // marcos; el respaldo con textarea funciona en cualquier sitio. Si tampoco,
  // el informe queda igualmente en la consola.
  function fallbackCopy(text) {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
      document.body.appendChild(area);
      area.select();
      const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
      area.remove();
      return Boolean(ok);
    } catch {
      return false;
    }
  }

  function garagePanelRoute() {
    const path = location.pathname;
    return path === '/' || path === '/garage' || path.startsWith('/garage/');
  }

  // Amigos y Equipo comparten el panel pequeno, pero en modo de solo lectura.
  // La ruta se mantiene separada de garagePanelRoute(): solo el garaje puede
  // armar la cola o pulsar «Race Now».
  function socialPanelRoute() {
    const path = location.pathname;
    return path === '/friends' || path.startsWith('/friends/')
      || path === '/team' || path.startsWith('/team/');
  }

  function socialPageLabel() {
    const path = location.pathname;
    return path === '/team' || path.startsWith('/team/') ? 'team' : 'friends';
  }

  // El perfil que el sitio ya guardo es el respaldo inmediato: el panel tiene
  // algo que enseñar antes de que contesten las tres peticiones de lectura.
  function persistedSocial() {
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

  // El sitio guarda la sesion en un JWT (`player_token` en localStorage) y la
  // app lo valida por su `exp`: cuando vence, la pantalla que aparece es
  // /login. El aviso "Yes, I'm here!" solo recarga la pagina para que el
  // servidor emita otro token, asi que se hace lo mismo un poco antes, y solo
  // entre carreras: recargar con el tipador vivo es justo lo que se quiere
  // evitar. Si el token no esta o no trae `exp`, no se toca nada.
  function tokenExpiryAt() {
    const claims = jwtClaims();
    const exp = Number(claims && claims.exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
  }

  // El SSO puede venir como <button>, <a> o <input type="button|submit">.
  // `textContent` de un input esta vacio: su etiqueta es `value`.
  function controlLabel(el) {
    if (!el) return '';
    return normalize(el.tagName === 'INPUT' ? el.value : el.textContent);
  }

  // El hash de timeout trae varios numeros: #timeout-1800-<inicio>-<fin>.
  // Para el LOG solo importa el motivo, no los timestamps.
  function loginReasonFromHash(hash) {
    let raw = String(hash || '').replace(/^#/, '');
    try { raw = decodeURIComponent(raw); } catch { /* conserva el hash crudo */ }
    raw = raw.trim();
    if (!raw) return '';
    if (/^timeout(?:-\d+)*$/i.test(raw)) return 'timeout';
    return raw.replace(/-[0-9]+$/, '');
  }

  // Castigo por racha de DQ ("Too Many Disqualifications … wait a few
  // minutes"): ni el garaje ni «Race Now» lo arreglan, y cada vuelta gasta un
  // intento de los que el sitio cuenta. Vive en la cola porque este aviso sale
  // en la ventana principal: el vigilante del tipador solo ve el iframe de la
  // carrera. La espera dobla con cada bloqueo seguido (15 -> 30 -> 60 -> 90
  // min) y una carrera que llega al final la devuelve al minimo.
  function blockUntil() {
    return Number(disk.get(DQ_BLOCK_UNTIL, 0)) || 0;
  }
