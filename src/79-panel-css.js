  /* ==========================================================================
   * 12.A HOJA DE ESTILOS DEL PANEL
   * ========================================================================== */
  // Las 767 lineas de CSS del panel, movidas fuera de 80-panel.js para que ese
  // archivo se lea como estructura. El CSS no interpola nada: es el mismo texto
  // que iba dentro del bloque de estilo del shadow root, byte por byte, y se
  // inyecta igual
  // cual. Si algun dia necesita un valor del JS, tiene que entrar por un
  // custom property (los temas ya funcionan asi), no por plantilla.
  // Diferido: la hoja solo se arma cuando existe un panel. En garaje (donde
  // panelCssFrom no se llama nunca) el arranque no paga estos 767 renglones de
  // plantilla; en carrera se arma una vez y se memoiza.
  let panelCssCache = '';
  function panelCss() {
    if (panelCssCache) return panelCssCache;
    panelCssCache = `
        /* ====================================================================
           Panel: una sola pieza de shadow DOM. Paleta de overlay de juego
           (carbon casi negro + verde neon), tipografia pequena y animaciones
           cortas: entrada, tarjetas escalonadas, rail con deslizador, muelle en
           los interruptores y un parpadeo cuando un numero cambia.
           Regla de oro de aqui abajo: el calcado de datos (filas, chips, cajon)
           no cambia, solo la piel. Todo lo que el JS busca sigue existiendo.
           ==================================================================== */
        * { box-sizing: border-box; }

        /* Movimiento reducido (WCAG 2.3.3): quien lo pide en el sistema no
           necesita ver la entrada del panel, el muelle del interruptor ni el
           parpadeo de un numero. El panel se queda quieto y sigue funcionando
           igual: nada de lo de abajo oculta ni retrasa datos. */
        @media (prefers-reduced-motion: reduce) {
          .panel *, .panel *::before, .panel *::after {
            animation-duration: .001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .001ms !important;
            scroll-behavior: auto !important;
          }
        }

        .panel {
          /* Una sola piel se cambia con data-theme: todo lo de abajo es el
             contrato que comparten los seis temas. El borde, el halo y los
             rellenos se derivan del acento con color-mix, asi que un tema nuevo
             solo declara su acento, su segundo color y su fondo. */
          --acc: #35ea86;
          --acc-2: #9bf7c5;
          --acc-dim: color-mix(in srgb, var(--acc) 14%, transparent);
          --line: color-mix(in srgb, var(--acc) 12%, transparent);
          --line-strong: color-mix(in srgb, var(--acc) 26%, transparent);
          --ink: #e9f7ef;
          --ink-2: #cfe9db;
          --dim: #7d9188;
          --dim-2: #7f9389;
          --warn: #ffb340;
          --bad: #ff6f6f;
          --info: #63c8ff;
          /* Tintas de estado: mezclas sobre --ink para que cada tema las entone.
             Ninguna regla escribe un color de estado a mano. */
          --ink-warn: color-mix(in srgb, var(--warn) 30%, var(--ink));
          --ink-warn-hi: color-mix(in srgb, var(--warn) 58%, var(--ink));
          --ink-bad: color-mix(in srgb, var(--bad) 25%, var(--ink));
          --ink-on-acc: #06110b;
          --medal-1: #ffd166;
          --medal-2: #d7dee8;
          --medal-3: #e0a273;
          --card: rgba(255, 255, 255, .028);
          --bg-hi: rgba(12, 17, 14, .985);
          --bg-lo: rgba(5, 8, 6, .995);
          /* Unica declaracion de tipografia del panel: ninguna regla escribe una
             pila de fuentes suelta, asi que un cambio de fuente es una linea. */
          --font-ui: ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif;
          --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          position: relative;
          isolation: isolate;
          display: flex;
          flex-direction: column;
          width: 322px;
          max-width: calc(100vw - 32px);
          max-height: calc(100vh - 32px);
          color: var(--ink);
          background:
            repeating-linear-gradient(0deg, rgba(255, 255, 255, .014) 0 1px, transparent 1px 3px),
            radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--acc) 10%, transparent), transparent 58%),
            radial-gradient(90% 80% at 100% 100%, color-mix(in srgb, var(--acc-2) 8%, transparent), transparent 62%),
            linear-gradient(168deg, var(--bg-hi), var(--bg-lo));
          border: 1px solid var(--line-strong);
          border-radius: 13px;
          box-shadow:
            0 22px 44px -18px rgba(0, 0, 0, .85),
            0 0 0 1px rgba(0, 0, 0, .6),
            0 0 34px -14px color-mix(in srgb, var(--acc) 50%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, .05);
          font: 12px/1.4 var(--font-mono);
          -webkit-font-smoothing: antialiased;
          user-select: none;
          animation: nt-boot .42s cubic-bezier(.2, .9, .25, 1) both;
        }
        @keyframes nt-boot {
          from { opacity: 0; transform: translateY(10px) scale(.97); }
          to   { opacity: 1; transform: none; }
        }

        /* ---------- temas --------------------------------------------------- */
        /* Carbon es la piel de siempre. Las demas solo mueven el acento y el
           fondo: bordes, halos, rellenos y barras salen de --acc con color-mix,
           asi que un tema nuevo no toca ni una regla mas. Los avisos (ambar) y
           los errores (rojo) no cambian: el color sigue significando lo mismo
           en cualquier tema. */
        .panel, .panel[data-theme="carbon"] { color-scheme: dark; }
        .panel[data-theme="aurora"] {
          --acc: #3fe0c5;
          --acc-2: #a78bfa;
          --ink: #e8fbf7;
          --ink-2: #c3ece5;
          --dim: #7c9a98;
          --dim-2: #789693;
          --bg-hi: rgba(7, 19, 20, .985);
          --bg-lo: rgba(4, 10, 13, .995);
        }
        .panel[data-theme="sunset"] {
          --acc: #ff9a5c;
          --acc-2: #ff77b0;
          --ink: #fff3ea;
          --ink-2: #f6d8c7;
          --dim: #a08a80;
          --dim-2: #9c877d;
          --bg-hi: rgba(24, 12, 11, .985);
          --bg-lo: rgba(12, 6, 8, .995);
        }
        .panel[data-theme="ice"] {
          --acc: #66e3ff;
          --acc-2: #d7f7ff;
          --ink: #eefaff;
          --ink-2: #c9e9f6;
          --dim: #7e97a4;
          --dim-2: #7a93a0;
          --bg-hi: rgba(8, 16, 24, .985);
          --bg-lo: rgba(4, 8, 14, .995);
        }
        .panel[data-theme="violet"] {
          --acc: #c08bff;
          --acc-2: #f0a9ff;
          --ink: #f7f0ff;
          --ink-2: #ddcbf2;
          --dim: #93849f;
          --dim-2: #8f809b;
          --bg-hi: rgba(18, 11, 27, .985);
          --bg-lo: rgba(8, 5, 14, .995);
        }
        /* RGB: el acento es un tono HSL registrado con @property, asi que el
           navegador puede interpolarlo. El borde conico y el titulo giran con
           el; sin @property se queda en rojo fijo, que sigue siendo legible.
           La luminosidad es 72%, no 63%: el texto de acento mide 9-10 px y
           al pasar por el azul caia a 3.37:1 sobre las tarjetas. A 72% el
           peor tono mide 4.9:1 y el ciclo sigue vivo de punta a punta. */
        .panel[data-theme="rgb"] {
          --nt-hue: 0;
          --nt-angle: 0deg;
          --acc: hsl(var(--nt-hue) 92% 72%);
          --acc-2: hsl(calc(var(--nt-hue) + 70) 94% 76%);
          --ink: #f6f7ff;
          --ink-2: #d9dcf0;
          --dim: #8d90a6;
          --dim-2: #8a8da3;
          --bg-hi: rgba(11, 11, 19, .985);
          --bg-lo: rgba(5, 5, 10, .995);
          animation:
            nt-boot .42s cubic-bezier(.2, .9, .25, 1) both,
            nt-rgb-hue var(--nt-rgb-hue-duration, 16s) linear infinite;
        }
        @keyframes nt-rgb-hue { to { --nt-hue: 360; } }
        @keyframes nt-rgb-angle { to { --nt-angle: 360deg; } }

        /* La politica de carrera separa el tinte, el borde y el titulo. Static
           congela todo; border conserva solo el giro perimetral; full deja las
           tres capas activas. El usuario decide el coste visual. */
        .panel[data-theme="rgb"][data-state="running"][data-rgb-race="static"],
        .panel[data-theme="rgb"][data-state="running"][data-rgb-race="static"]::after,
        .panel[data-theme="rgb"][data-state="running"][data-rgb-race="static"] .title,
        .panel[data-theme="rgb"][data-state="running"][data-rgb-race="border"],
        .panel[data-theme="rgb"][data-state="running"][data-rgb-race="border"] .title,
        .panel[data-theme="rgb"][data-collapsed="true"],
        .panel[data-theme="rgb"][data-collapsed="true"]::after,
        .panel[data-theme="rgb"][data-collapsed="true"] .title {
          animation-play-state: paused;
        }

        /* El marco arcoiris: una capa conica recortada a 1 px con mask. Solo se
           enciende en RGB; en el resto queda transparente y no cuesta nada. */
        .panel::after {
          content: '';
          position: absolute;
          inset: -1px;
          z-index: 3;
          padding: 1px;
          border-radius: 14px;
          background: conic-gradient(from var(--nt-angle, 0deg),
            var(--nt-rgb-a, #ff5f6d), #ffc371, #47ffa1, #5ad1ff, var(--nt-rgb-b, #b06bff), var(--nt-rgb-a, #ff5f6d));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          display: none;
          opacity: var(--nt-rgb-border-opacity, .9);
          pointer-events: none;
        }
        .panel[data-theme="rgb"]::after {
          display: block;
          animation: nt-rgb-angle var(--nt-rgb-angle-duration, 8s) linear infinite;
        }
        .panel[data-theme="rgb"] .title {
          background: linear-gradient(90deg, var(--nt-rgb-a, #ff5f6d), #ffc371, #47ffa1, #5ad1ff, var(--nt-rgb-b, #b06bff), var(--nt-rgb-a, #ff5f6d));
          background-size: 300% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          text-shadow: none;
          animation: nt-rgb-title var(--nt-rgb-title-duration, 6s) linear infinite;
        }
        @keyframes nt-rgb-title { to { background-position: 300% 0; } }

        /* ---------- cabecera ------------------------------------------------- */
        .head { position: relative; display: flex; align-items: center; gap: 8px; padding: 10px 11px 8px; cursor: grab; touch-action: none; }
        .head::after {
          content: '';
          position: absolute;
          left: 11px; right: 11px; bottom: 0; height: 1px;
          background: var(--line);
          pointer-events: none;
        }
        .head:active { cursor: grabbing; }
        .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--dim-2); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dim-2) 14%, transparent); transition: background .25s ease, box-shadow .25s ease; }
        /* La marca: la W del hero, en un cuadrado de cristal. El punto de estado
           sigue dentro, asi que no se pierde el LED al cambiar el icono. */
        .mark { position: relative; flex: none; display: grid; place-items: center; width: 25px; height: 25px; border-radius: 8px; color: var(--acc); background: linear-gradient(145deg, color-mix(in srgb, var(--acc) 13%, rgba(255, 255, 255, .04)), rgba(255, 255, 255, .015)); border: 1px solid var(--line-strong); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .08), 0 0 16px -9px var(--acc); }
        .mark svg { width: 18px; height: 18px; display: block; filter: drop-shadow(0 0 5px color-mix(in srgb, var(--acc) 55%, transparent)); }
        .mark .dot { position: absolute; right: -2px; top: -2px; width: 5px; height: 5px; box-shadow: 0 0 0 2px var(--bg-hi), 0 0 6px color-mix(in srgb, var(--acc) 70%, transparent); }
        .panel[data-state="running"] .mark .dot { animation: nt-pulse 1.7s ease-in-out infinite; }
        .panel[data-collapsed="true"] .mark { width: 23px; height: 23px; border-radius: 7px; }
        .panel[data-state="running"] .dot { background: var(--acc); box-shadow: 0 0 0 3px var(--acc-dim), 0 0 9px color-mix(in srgb, var(--acc) 75%, transparent); animation: nt-pulse 1.7s ease-in-out infinite; }
        .panel[data-state="paused"] .dot { background: var(--warn); box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn) 16%, transparent), 0 0 9px color-mix(in srgb, var(--warn) 55%, transparent); }
        .panel[data-state="break"] .dot { background: var(--info); box-shadow: 0 0 0 3px color-mix(in srgb, var(--info) 16%, transparent), 0 0 9px color-mix(in srgb, var(--info) 55%, transparent); }
        @keyframes nt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }

        .brand { flex: 1 1 auto; min-width: 0; }
        .title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 800 12.5px/1.15 var(--font-ui); letter-spacing: .13em; text-transform: uppercase; color: var(--ink); text-shadow: 0 0 14px color-mix(in srgb, var(--acc) 35%, transparent); }
        .sub { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; font: 600 8.5px/1 var(--font-ui); letter-spacing: .13em; text-transform: uppercase; color: var(--dim-2); }
        .sub b { color: var(--acc); font-weight: 700; }

        .who { display: none; }
        .ghlink { flex: none; display: inline-flex; align-items: center; gap: 4px; padding: 5px 8px; border-radius: 7px; text-decoration: none; font: 800 8px/1 var(--font-ui); letter-spacing: .08em; text-transform: uppercase; color: var(--acc-2); background: var(--acc-dim); border: 1px solid var(--line-strong); transition: color .15s ease, background .15s ease, border-color .15s ease; }
        .ghlink:hover { color: var(--ink); background: color-mix(in srgb, var(--acc) 20%, transparent); border-color: var(--acc); }
        .ghlink:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
        .ghlink[hidden] { display: none !important; }
        .ghlink svg { width: 10px; height: 10px; display: block; }
        .who i { width: 5px; height: 5px; border-radius: 50%; background: var(--acc); box-shadow: 0 0 7px var(--acc); }
        .iconbtn { all: unset; flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; cursor: pointer; color: var(--dim); background: rgba(255, 255, 255, .04); border: 1px solid var(--line); transition: color .15s ease, background .15s ease, border-color .15s ease, transform .12s ease; }
        .iconbtn:hover { color: var(--acc-2); background: var(--acc-dim); border-color: var(--line-strong); }
        .iconbtn:active { transform: scale(.92); }
        .iconbtn:focus-visible, .pace:focus-visible, .toggle:focus-visible, .stop:focus-visible, .gear:focus-visible, .rail-btn:focus-visible, .act:focus-visible, .sw:focus-visible, .seg-btn:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
        .iconbtn svg { width: 13px; height: 13px; display: block; }

        /* ---------- tira de chips ------------------------------------------- */
        .chips-row { display: flex; align-items: center; gap: 6px; padding: 0 11px 9px; }
        /* Progreso de la carrera visible desde cualquier pestaña. Es una
           linea compositada: scaleX no toca el layout ni el texto de al lado. */
        .race-line { height: 2px; margin: 0 11px; border-radius: 99px; background: rgba(255, 255, 255, .05); overflow: hidden; opacity: 0; transition: opacity .2s ease; }
        .panel[data-state="running"] .race-line, .panel[data-state="paused"] .race-line { opacity: 1; }
        .race-line i { display: block; height: 100%; transform: scaleX(var(--race-fill, 0)); transform-origin: left center; background: linear-gradient(90deg, color-mix(in srgb, var(--acc) 95%, transparent), color-mix(in srgb, var(--acc-2) 95%, transparent)); box-shadow: 0 0 9px color-mix(in srgb, var(--acc) 55%, transparent); }
        .panel[data-collapsed="true"] .race-line { display: none; }
        .pace { all: unset; flex: none; padding: 4px 8px; border-radius: 999px; cursor: pointer; font: 700 8.5px/1 var(--font-ui); letter-spacing: .1em; color: var(--acc-2); background: color-mix(in srgb, var(--acc) 12%, transparent); border: 1px solid color-mix(in srgb, var(--acc) 32%, transparent); transition: filter .15s ease, transform .12s ease, box-shadow .2s ease; }
        .pace:hover { filter: brightness(1.16); box-shadow: 0 0 14px -4px color-mix(in srgb, var(--acc) 70%, transparent); }
        .pace:active { transform: scale(.96); }
        .panel[data-pace-profile="soft"] .pace { color: var(--info); background: color-mix(in srgb, var(--info) 12%, transparent); border-color: color-mix(in srgb, var(--info) 32%, transparent); }
        .panel[data-pace-profile="fast"] .pace { color: var(--ink-warn); background: color-mix(in srgb, var(--warn) 12%, transparent); border-color: color-mix(in srgb, var(--warn) 32%, transparent); }
        /* El chip es un ESTADO, no un interruptor: el bot es siempre AUTO y la
           cola se arma sola. Para parar esta Stop (o Esc / Alt+N). */
        .mode { flex: none; padding: 4px 8px; border-radius: 999px; font: 700 8.5px/1 var(--font-ui); letter-spacing: .1em; color: var(--acc-2); background: var(--acc-dim); border: 1px solid color-mix(in srgb, var(--acc) 30%, transparent); cursor: default; }
        .cap { flex: 1 1 auto; padding: 4px 8px; border-radius: 999px; text-align: center; font: 700 8.5px/1 var(--font-ui); letter-spacing: .1em; color: var(--ink-warn); background: color-mix(in srgb, var(--warn) 10%, transparent); border: 1px solid color-mix(in srgb, var(--warn) 26%, transparent); transition: color .2s ease, background .2s ease, border-color .2s ease; }
        .panel[data-cap-hit="1"] .cap { color: var(--ink-bad); background: color-mix(in srgb, var(--bad) 18%, transparent); border-color: color-mix(in srgb, var(--bad) 45%, transparent); }

        /* ---------- contexto y accion principal ---------------------------- */
        .context-banner {
          --ctx: var(--acc);
          display: grid;
          grid-template-columns: 28px minmax(0, 1fr) auto;
          align-items: center;
          gap: 8px;
          margin: 0 11px 8px;
          padding: 8px 9px;
          border: 1px solid color-mix(in srgb, var(--ctx) 28%, transparent);
          border-radius: 9px;
          background:
            linear-gradient(110deg, color-mix(in srgb, var(--ctx) 13%, transparent), transparent 72%),
            rgba(255, 255, 255, .025);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, .04);
          transition: border-color .2s ease, background .2s ease;
        }
        .context-icon {
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          color: var(--ctx);
          background: color-mix(in srgb, var(--ctx) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--ctx) 24%, transparent);
        }
        .context-icon svg { width: 15px; height: 15px; }
        .context-copy { min-width: 0; }
        .context-copy b {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font: 750 10px/1.25 var(--font-ui);
          letter-spacing: .02em;
          color: var(--ink);
        }
        .context-copy > span {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-top: 2px;
          font: 500 8.5px/1.3 var(--font-ui);
          color: var(--dim);
        }
        .context-pill {
          padding: 3px 6px;
          border-radius: 999px;
          font: 800 7.5px/1 var(--font-ui);
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--ctx);
          background: color-mix(in srgb, var(--ctx) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--ctx) 24%, transparent);
        }
        .context-banner[data-context="running"] { --ctx: var(--acc); }
        .context-banner[data-context="paused"] { --ctx: var(--warn); }
        .context-banner[data-context="break"] { --ctx: var(--info); }
        .context-banner[data-context="stopped"] { --ctx: var(--warn); }
        .context-banner[data-context="error"],
        .context-banner[data-context="banned"] { --ctx: var(--bad); }
        .context-banner[data-context="blocked"] { --ctx: var(--warn); }
        .context-banner[data-context="loading"] { --ctx: var(--info); }
        .panel[data-collapsed="true"] .context-banner { display: none; }

        button:focus-visible, a:focus-visible, input:focus-visible,
        select:focus-visible, textarea:focus-visible, [tabindex]:focus-visible {
          outline: 2px solid var(--acc);
          outline-offset: 2px;
        }

        /* ---------- cuerpo: rail + vistas ----------------------------------- */
        .main { display: flex; flex: 1 1 auto; min-height: 0; align-items: stretch; gap: 0; border-top: 1px solid var(--line); }
        .head, .chips-row, .context-banner, .race-line, .foot, .actions { flex: none; }
        .rail { position: relative; flex: none; display: flex; flex-direction: column; gap: 2px; padding: 9px 6px; border-right: 1px solid var(--line); background: linear-gradient(180deg, rgba(255, 255, 255, .02), transparent); }
        .rail-btn { all: unset; position: relative; z-index: 1; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; cursor: pointer; color: var(--dim-2); transition: color .18s ease, transform .12s ease; }
        .rail-btn:hover { color: var(--acc-2); }
        .rail-btn:active { transform: scale(.9); }
        .rail-btn svg { width: 15px; height: 15px; display: block; }
        /* Etiqueta flotante del rail: aparece solo al apuntar o enfocar, con
           transform y opacity (nada de width ni filtros). */
        .rail-btn::after { content: attr(data-label); position: absolute; left: calc(100% + 7px); top: 50%; z-index: 6; padding: 4px 7px; border-radius: 6px; white-space: nowrap; pointer-events: none; font: 700 8px/1 var(--font-ui); letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); background: var(--bg-hi); border: 1px solid var(--line-strong); box-shadow: 0 8px 18px -12px rgba(0, 0, 0, .9); opacity: 0; transform: translate(-3px, -50%); transition: opacity .16s ease, transform .16s ease; }
        .rail-btn:hover::after, .rail-btn:focus-visible::after { opacity: 1; transform: translate(0, -50%); }
        /* El deslizador del rail: un cuadrado con glow que viaja con muelle. */
        .rail-glide { position: absolute; left: 6px; top: 9px; width: 30px; height: 30px; border-radius: 9px; background: var(--acc-dim); border: 1px solid var(--line-strong); box-shadow: 0 0 16px -6px var(--acc), inset 0 0 12px -6px var(--acc); transition: transform .34s cubic-bezier(.34, 1.4, .5, 1); transition: transform .34s linear(0, 0.32 14%, 0.82 28%, 1.06 44%, 1.02 58%, 0.995 72%, 1); pointer-events: none; }
        .rail[data-index="1"] .rail-glide { transform: translateY(32px); }
        .rail[data-index="2"] .rail-glide { transform: translateY(64px); }
        .rail[data-index="3"] .rail-glide { transform: translateY(96px); }
        .rail[data-index="0"] .rail-btn[data-tab-btn="stats"],
        .rail[data-index="1"] .rail-btn[data-tab-btn="tune"],
        .rail[data-index="2"] .rail-btn[data-tab-btn="log"],
        .rail[data-index="3"] .rail-btn[data-tab-btn="info"] { color: var(--acc); }

        .views { flex: 1 1 auto; min-width: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 10px 11px 11px; }
        .views::-webkit-scrollbar { width: 6px; }
        .views::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--acc) 22%, transparent); border-radius: 99px; }
        .views::-webkit-scrollbar-track { background: transparent; }
        .views { scrollbar-gutter: stable; }
        .view { display: none; }
        /* Cabecera corta de cada vista: dice donde estas sin ocupar una tarjeta. */
        .view-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 2px 8px; margin: 0 1px 8px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
        .view-head span { display: inline-flex; align-items: center; gap: 6px; font: 800 7.5px/1 var(--font-ui); letter-spacing: .18em; text-transform: uppercase; color: var(--acc); }
        .view-head span::before { content: ''; width: 10px; height: 1px; border-radius: 99px; background: var(--acc); box-shadow: 0 0 7px var(--acc); }
        .view-head b { font: 600 8px/1.2 var(--font-ui); letter-spacing: .04em; color: var(--dim-2); text-align: right; }
        .panel[data-tab="stats"] .v-stats,
        .panel[data-tab="tune"] .v-tune,
        .panel[data-tab="log"] .v-log,
        .panel[data-tab="info"] .v-info { display: block; animation: nt-view .28s cubic-bezier(.2, .9, .25, 1) both; }
        @keyframes nt-view { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
        /* TUNE se lee en tres bloques: ritmo, limites y automatizacion. La
           cabecera solo separa; las tarjetas y sus controles siguen igual. */
        .tune-sec { margin: 0 0 11px; }
        .tune-sec:last-child { margin-bottom: 0; }
        /* TUNE tiene muchas filas; el filtro evita recorrerlas todas cuando ya
           se sabe que ajuste se busca. Vive fuera de los bloques para seguir
           visible aunque no quede ninguna tarjeta. */
        .tune-filter { display: flex; align-items: center; gap: 7px; margin: 0 1px 9px; }
        .tune-search { position: relative; display: flex; align-items: center; flex: 1 1 auto; min-width: 0; height: 28px; border: 1px solid var(--line); border-radius: 8px; background: rgba(0, 0, 0, .22); transition: border-color .18s ease, box-shadow .18s ease; }
        .tune-search:focus-within { border-color: var(--line-strong); box-shadow: 0 0 16px -9px var(--acc); }
        .tune-search > svg { flex: none; width: 12px; height: 12px; margin-left: 8px; color: var(--dim-2); }
        .tune-search input { all: unset; flex: 1 1 auto; min-width: 0; padding: 0 5px; font: 600 10px/1 var(--font-ui); color: var(--ink); }
        .tune-search input::placeholder { color: var(--dim-2); }
        .tune-search input::-webkit-search-cancel-button { display: none; }
        .tune-clear { all: unset; flex: none; display: grid; place-items: center; width: 18px; height: 18px; margin-right: 4px; border-radius: 5px; cursor: pointer; font: 700 14px/1 var(--font-ui); color: var(--dim-2); }
        .tune-clear:hover { color: var(--acc); background: var(--acc-dim); }
        .tune-clear:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
        .tune-clear[hidden], .tune-empty[hidden] { display: none; }
        .tune-count { flex: none; font: 700 7.5px/1.2 var(--font-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--dim-2); white-space: nowrap; }
        .tune-empty { margin: -2px 1px 10px; padding: 11px 8px; border: 1px dashed var(--line); border-radius: 8px; text-align: center; font: 500 9.5px/1.4 var(--font-ui); color: var(--dim); }
        .tune-sec-h {
          appearance: none;
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 2px 8px;
          width: 100%;
          margin: 1px 1px 7px;
          padding: 3px 0;
          border: 0;
          background: none;
          color: inherit;
          text-align: left;
          cursor: pointer;
        }
        .tune-sec-h span { display: inline-flex; align-items: center; gap: 6px; font: 800 8px/1 var(--font-ui); letter-spacing: .16em; text-transform: uppercase; color: var(--acc); }
        .tune-sec-h span::before { content: ''; width: 12px; height: 1px; border-radius: 99px; background: var(--acc); box-shadow: 0 0 7px var(--acc); }
        .tune-sec-h b { font: 600 8px/1.2 var(--font-ui); letter-spacing: .04em; color: var(--dim-2); }
        .tune-sec-h i { margin-left: auto; font: 700 12px/1 var(--font-ui); color: var(--dim-2); transition: transform .2s ease; }
        .tune-sec-h:hover span { color: var(--acc-2); }
        .tune-sec-h:focus-visible { outline: 2px solid var(--acc); outline-offset: 3px; border-radius: 5px; }
        .tune-sec[data-open="false"] .tune-sec-h i { transform: rotate(-90deg); }
        .tune-sec[data-open="false"] .tune-sec-body { display: none; }
        .tune-sec-body { display: block; }

        /* ---------- tarjetas ------------------------------------------------- */
        .card { position: relative; contain: layout style; margin-bottom: 9px; padding: 9px 10px 10px; border-radius: 10px; background: linear-gradient(180deg, rgba(255, 255, 255, .035), rgba(255, 255, 255, .012)); border: 1px solid var(--line); transition: border-color .2s ease, box-shadow .25s ease, transform .18s ease; }
        .card:last-child { margin-bottom: 2px; }
        .card:hover { border-color: var(--line-strong); box-shadow: 0 10px 22px -16px rgba(0, 0, 0, .9), 0 0 22px -14px color-mix(in srgb, var(--acc) 65%, transparent); }
        .card::before { content: ''; position: absolute; left: 0; top: 9px; bottom: 9px; width: 2px; border-radius: 99px; background: linear-gradient(180deg, var(--acc), color-mix(in srgb, var(--acc) 12%, transparent)); box-shadow: 0 0 10px color-mix(in srgb, var(--acc) 55%, transparent); opacity: .85; transition: opacity .2s ease; }
        .card:hover::before { opacity: 1; }
        /* Marca de agua: se ve por detras de las filas de arriba, como el icono
           fantasma del panel de referencia. Muy tenue a proposito. */
        .card > .ghost { position: absolute; right: 7px; top: 6px; width: 26px; height: 26px; color: var(--acc); opacity: .07; pointer-events: none; z-index: 0; }
        .card > .ghost svg { width: 100%; height: 100%; }
        /* Lo que se lee siempre por delante del adorno. */
        .card > *:not(.ghost) { position: relative; z-index: 1; }
        /* El titulo manda y el subtitulo va pegado a el; la esquina derecha queda
           libre para el icono fantasma, que si no cae debajo del texto. */
        .card-h { display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 7px; margin-bottom: 7px; }
        .card-t { font: 800 9px/1 var(--font-ui); letter-spacing: .19em; text-transform: uppercase; color: var(--ink-2); }
        .card-s { font: 600 8.5px/1.2 var(--font-ui); letter-spacing: .05em; color: var(--dim-2); }
        /* Edad del dato vivo: se actualiza cuatro veces por segundo y se pone
           ambar cuando la carrera lleva un rato sin aceptar una tecla. */
        .card-age { margin-left: auto; font: 600 8px/1.2 var(--font-mono); font-variant-numeric: tabular-nums; letter-spacing: 0; color: var(--dim-2); }
        .card-age[data-good="0"] { color: var(--warn); }
        /* El punto de la etiqueta live dice si la telemetria se esta moviendo. */
        .v-stats .live-card .card-s[data-field="liveTag"] { display: inline-flex; align-items: center; gap: 5px; }
        .v-stats .live-card .card-s[data-field="liveTag"]::before { content: ''; width: 5px; height: 5px; flex: none; border-radius: 50%; background: currentColor; opacity: .8; }
        .panel[data-state="running"] .v-stats .live-card .card-s[data-field="liveTag"] { color: var(--acc); }
        .panel[data-state="running"] .v-stats .live-card .card-s[data-field="liveTag"]::before { box-shadow: 0 0 6px var(--acc); animation: nt-pulse 1.7s ease-in-out infinite; }
        .panel[data-state="paused"] .v-stats .live-card .card-s[data-field="liveTag"] { color: var(--warn); }
        .panel[data-state="break"] .v-stats .live-card .card-s[data-field="liveTag"] { color: var(--info); }

        /* Aparecen una tras otra, como si el panel se montara delante de ti. */
        .panel[data-fresh="1"] .card { animation: nt-card .40s cubic-bezier(.2, .9, .25, 1) both; }
        .panel[data-fresh="1"] .card:nth-child(2) { animation-delay: .05s; }
        .panel[data-fresh="1"] .card:nth-child(3) { animation-delay: .1s; }
        .panel[data-fresh="1"] .card:nth-child(4) { animation-delay: .15s; }
        @keyframes nt-card { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

        /* ---------- marcador grande ----------------------------------------- */
        .hero { display: grid; grid-template-columns: 1fr 1px 1fr; align-items: center; padding: 8px 2px 9px; }
        .stat { text-align: center; }
        .stat b { display: block; font: 700 26px/1 var(--font-mono); letter-spacing: -.02em; font-variant-numeric: tabular-nums; color: var(--ink); text-shadow: 0 0 18px color-mix(in srgb, var(--acc) 28%, transparent); transition: color .25s ease, text-shadow .25s ease; }
        .stat b[data-good="1"] { color: var(--acc); text-shadow: 0 0 18px color-mix(in srgb, var(--acc) 50%, transparent); }
        .stat b[data-good="0"] { color: var(--warn); text-shadow: 0 0 18px color-mix(in srgb, var(--warn) 45%, transparent); }
        .stat b.bump { animation: nt-bump .32s cubic-bezier(.34, 1.4, .5, 1); }
        @keyframes nt-bump { 0% { transform: scale(1); } 35% { transform: scale(1.11); } 100% { transform: scale(1); } }
        .stat span { display: block; margin-top: 5px; font: 700 8px/1 var(--font-ui); letter-spacing: .17em; text-transform: uppercase; color: var(--dim); }
        .sep { display: block; width: 1px; height: 34px; background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--acc) 25%, transparent), transparent); }

        .prog { position: relative; height: 4px; margin: 2px 2px 0; border-radius: 99px; background: rgba(255, 255, 255, .06); overflow: hidden; opacity: 0; transition: opacity .25s ease; }
        .panel[data-state="running"] .prog, .panel[data-state="paused"] .prog { opacity: 1; }
        .prog i { display: block; width: 100%; height: 100%; border-radius: 99px; background: linear-gradient(90deg, color-mix(in srgb, var(--acc) 95%, transparent), color-mix(in srgb, var(--acc-2) 95%, transparent)); box-shadow: 0 0 10px color-mix(in srgb, var(--acc) 60%, transparent); transform: scaleX(0); transform-origin: 0 50%; transition: transform .18s linear; }
        .season-card .season-prog { opacity: 1; margin: 0 2px 2px; }
        .season-card .season-name { margin: 1px 0 8px; font: 700 13px/1.25 var(--font-ui); color: var(--ink-2); }
        .season-card.is-empty .season-name { color: var(--dim-2); }
        .season-card .season-alert { margin: 8px 2px 0; padding: 6px 8px; border-radius: 7px; font: 600 11px/1.35 var(--font-ui); color: var(--warn); background: color-mix(in srgb, var(--warn) 8%, transparent); border: 1px solid color-mix(in srgb, var(--warn) 28%, transparent); }
        .season-card .season-actions { display: flex; gap: 6px; margin-top: 8px; }
        .season-card .season-actions .act { flex: 0 1 auto; padding: 5px 10px; }
        /* Reflejo que barre la barra mientras escribe: vida sin ruido. */
        .prog::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .35), transparent); transform: translateX(-100%); opacity: 0; }
        .panel[data-state="running"] .prog::after { opacity: 1; animation: nt-sheen 2.1s ease-in-out infinite; }
        @keyframes nt-sheen { 0% { transform: translateX(-100%); } 60%, 100% { transform: translateX(100%); } }

        /* ---------- filas ---------------------------------------------------- */
        .auto-pace {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          width: max-content; max-width: 100%; margin: 5px auto 0; padding: 3px 8px;
          border: 1px solid var(--line); border-radius: 999px;
          background: color-mix(in srgb, var(--acc) 7%, transparent);
          color: var(--acc-2); font: 600 8px/1 var(--font-mono);
          letter-spacing: .08em; text-transform: uppercase; white-space: nowrap;
        }
        .auto-pace::before {
          content: ''; width: 5px; height: 5px; flex: none; border-radius: 50%;
          background: var(--acc); box-shadow: 0 0 8px color-mix(in srgb, var(--acc) 70%, transparent);
        }
        .rows { display: grid; gap: 1px; margin-top: 8px; }
        /* La vista Live ensena lo que se mira de verdad. El resto sigue en el DOM
           (y en los tooltips) para no romper el contrato del panel, pero no
           convierte la tarjeta en una lista de telemetria. */
        .v-stats .live-card .rows .row.secondary { display: none; }
        .row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 2.5px 0; font: 500 10.5px/1.45 var(--font-ui); color: var(--dim); border-bottom: 1px solid rgba(255, 255, 255, .03); }
        .row:last-child { border-bottom: 0; }
        .row span { letter-spacing: .05em; }
        .row b { font: 600 11px/1.45 var(--font-mono); font-variant-numeric: tabular-nums; color: var(--ink-2); }
        .row b[data-good="1"] { color: var(--acc); }
        .row b[data-good="0"] { color: var(--warn); }
        .recent-pair { display: inline-flex; align-items: baseline; }
        .recent-pair i { font-style: normal; }
        .recent-pair .recent-acc::before { content: '·'; margin: 0 5px; color: var(--dim-2); }
        .recent-pair i[data-good="1"] { color: var(--acc); }
        .recent-pair i[data-good="0"] { color: var(--warn); }
        .recent-pair i.bump { animation: nt-bump .32s cubic-bezier(.34, 1.4, .5, 1); }
        .row .num { width: 58px; flex: none; padding: 2px 5px; border-radius: 6px; border: 1px solid var(--line); background: rgba(0, 0, 0, .24); color: var(--ink-2); font: 600 10px/1.4 var(--font-mono); font-variant-numeric: tabular-nums; text-align: right; color-scheme: dark; }
        .row .num:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; border-color: var(--acc); }
        .row .num::placeholder { color: var(--dim-2); }
        .row .num::-webkit-inner-spin-button, .row .num::-webkit-outer-spin-button { opacity: .35; }
        .row .cmp-select { flex: 1 1 auto; min-width: 0; max-width: 100%; padding: 3px 6px; border-radius: 6px; border: 1px solid var(--line); background: rgba(255, 255, 255, .04); color: var(--acc-2); font: 600 9.5px/1.4 var(--font-mono); letter-spacing: 0; text-transform: none; color-scheme: dark; cursor: pointer; }
        .row .cmp-select:focus-visible { outline: 2px solid color-mix(in srgb, var(--acc) 70%, transparent); outline-offset: 1px; }
        .row .cmp-select option { background: var(--bg-lo); color: var(--ink); }
        .cmp-row { gap: 8px; }
        .break-row { display: flex; }
        .panel[data-state="break"] .break-row b { color: var(--info); }
        .dq-row b { color: var(--warn); }
        .limit-row, .prev-row {
          appearance: none;
          display: flex;
          width: 100%;
          margin: 0;
          padding: 2.5px 0;
          border: 0;
          background: none;
          color: inherit;
          font: inherit;
          text-align: left;
          cursor: pointer;
          box-sizing: border-box;
        }
        .limit-row b { color: var(--acc); }
        .limit-row:hover b { text-decoration: underline dotted; }
        .panel[data-limit="on"] .limit-row b { color: var(--acc); }
        .prev-row b { color: var(--ink-2); }
        .prev-row:hover b { text-decoration: underline dotted; }
        .hud-row b, .box-row b { color: var(--acc-2); }
        .guard-row b { color: var(--warn); }
        .panel[data-standby="1"] .guard-row b { color: var(--info); }
        .panel[data-box="ready"] .box-row b { color: var(--acc); }
        .panel[data-box="waiting"] .box-row b { color: var(--dim); }
        .today-row b { color: var(--acc); }
        .today-row b[data-good="0"] { color: var(--warn); }

        /* ---------- historial ------------------------------------------------ */
        .hist { margin-top: 8px; }
        .hist-head, .hist-row { display: grid; grid-template-columns: 34px 34px 46px 1fr 42px; gap: 6px; align-items: center; }
        .hist-head { padding-bottom: 3px; font: 700 8px/1.4 var(--font-ui); letter-spacing: .16em; text-transform: uppercase; color: var(--dim-2); }
        .hist-head span:not(:first-child), .hist-row b { text-align: right; }
        .hist-row { padding: 3px 0; border-radius: 6px; font-variant-numeric: tabular-nums; transition: background .2s ease, transform .2s ease; }
        .hist-row:hover { background: rgba(255, 255, 255, .035); transform: translateX(1px); }
        .hist-row span { font-size: 9.5px; color: var(--dim); }
        .hist-row b { font-size: 11px; font-weight: 600; color: var(--ink-2); }
        .hist-row:first-child b { color: var(--ink); text-shadow: 0 0 12px color-mix(in srgb, var(--acc) 30%, transparent); }
        .hist-row:first-child span { color: var(--acc); }
        .hist-row .dev { font-size: 10px; color: var(--dim-2); }
        .hist-row .dev[data-good="1"] { color: var(--acc); }
        .hist-row .dev[data-good="0"] { color: var(--warn); }
        /* WPM oficial del paquete de meta, pegado al del modelo. Solo aparece
           en las carreras que lo traen; las viejas no inventan el dato. */
        .hist-row .wpm { white-space: nowrap; }
        .hist-row .wpm .model { margin-left: 5px; font: 700 8px/1.4 var(--font-ui); letter-spacing: .08em; text-transform: uppercase; color: var(--dim-2); }
        .hist-row:first-child .wpm .model { color: var(--acc-2); }
        .hist-row .nitro-tag { margin-right: 4px; padding: 0 3px; border-radius: 3px; background: color-mix(in srgb, var(--acc) 18%, transparent); color: var(--acc); font-style: normal; font-size: 9px; letter-spacing: .06em; vertical-align: 1px; }
        .hist-row .place { color: var(--dim); }
        .hist-row .place[data-medal="1"] { color: var(--medal-1); }
        .hist-row .place[data-medal="2"] { color: var(--medal-2); }
        .hist-row .place[data-medal="3"] { color: var(--medal-3); }
        .hist-row .xp { color: var(--acc-2); }
        .hist-empty { padding-top: 2px; font: italic 500 10px/1.4 var(--font-ui); color: var(--dim-2); }
        .hist-foot { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; padding-top: 6px; border-top: 1px dashed color-mix(in srgb, var(--acc) 14%, transparent); font: 700 8.5px/1.4 var(--font-ui); letter-spacing: .13em; text-transform: uppercase; color: var(--dim); }
        .hist-foot b { font: 600 10px/1.4 var(--font-mono); font-variant-numeric: tabular-nums; letter-spacing: 0; color: var(--acc-2); }

        /* ---------- listas del registro -------------------------------------- */
        .log-toolbar { display: flex; align-items: center; gap: 7px; margin: 0 1px 9px; }
        .log-search { position: relative; display: flex; align-items: center; flex: 1 1 auto; min-width: 0; height: 28px;
                      border: 1px solid var(--line); border-radius: 8px; background: rgba(0, 0, 0, .22); }
        .log-search:focus-within { border-color: var(--line-strong); box-shadow: 0 0 16px -9px var(--acc); }
        .log-search > svg { flex: none; width: 12px; height: 12px; margin-left: 8px; color: var(--dim-2); }
        .log-search input { all: unset; flex: 1 1 auto; min-width: 0; padding: 0 5px;
                           font: 600 10px/1 var(--font-ui); color: var(--ink); }
        .log-search input::placeholder { color: var(--dim-2); }
        .log-search input::-webkit-search-cancel-button { display: none; }
        .log-clear { all: unset; flex: none; display: grid; place-items: center; width: 18px; height: 18px; margin-right: 4px;
                     border-radius: 5px; cursor: pointer; font: 700 14px/1 var(--font-ui); color: var(--dim-2); }
        .log-clear:hover { color: var(--acc); background: var(--acc-dim); }
        .log-clear:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
        .log-clear[hidden], .log-empty[hidden] { display: none; }
        .log-filter-count { flex: none; font: 700 7.5px/1.2 var(--font-mono); letter-spacing: .06em;
                            text-transform: uppercase; color: var(--dim-2); white-space: nowrap; }
        .log-empty { margin: 0 1px 9px; padding: 10px 8px; border: 1px dashed var(--line); border-radius: 8px;
                     text-align: center; font: 500 9.5px/1.4 var(--font-ui); color: var(--dim); }
        .log-list { display: grid; gap: 4px; }
        .log-item { display: grid; grid-template-columns: 46px 1fr auto; gap: 7px; align-items: baseline; padding: 4px 6px; border-radius: 7px; background: rgba(255, 255, 255, .022); border: 1px solid rgba(255, 255, 255, .045); font-variant-numeric: tabular-nums; transition: border-color .2s ease, transform .18s ease; }
        .log-item:hover { border-color: var(--line-strong); transform: translateX(1px); }
        .log-item i { font: 600 9px/1.4 var(--font-mono); color: var(--dim-2); font-style: normal; }
        .log-item span { font: 500 10px/1.35 var(--font-ui); color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .log-item b { font: 600 10.5px/1.35 var(--font-mono); color: var(--acc-2); }
        .log-item b[data-good="0"] { color: var(--warn); }
        .log-empty { font: italic 500 10px/1.4 var(--font-ui); color: var(--dim-2); }
        .notice-item { display: grid; grid-template-columns: 44px 1fr; gap: 7px; padding: 3px 0; font: 500 10px/1.4 var(--font-ui); color: var(--ink-2); border-bottom: 1px solid rgba(255, 255, 255, .03); }
        .notice-item:last-child { border-bottom: 0; }
        .notice-item i { font: 600 9px/1.4 var(--font-mono); color: var(--dim-2); font-style: normal; }
        .notice-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* ---------- interruptores y ajustes --------------------------------- */
        .set-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 5px 0; border-bottom: 1px solid rgba(255, 255, 255, .03); }
        .set-row:last-child { border-bottom: 0; }
        .set-lbl { font: 600 10.5px/1.3 var(--font-ui); letter-spacing: .03em; color: var(--ink-2); }
        .set-lbl i { display: block; margin-top: 2px; font: 500 8.5px/1.25 var(--font-ui); font-style: normal; letter-spacing: .04em; color: var(--dim-2); }
        .set-val { display: inline-flex; align-items: center; gap: 8px; }
        .set-val b { font: 600 9px/1 var(--font-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--dim); }
        .set-val b[data-on="1"] { color: var(--acc); }
        .set-val b[data-state="on"] { color: var(--acc); }
        .set-val b[data-state="blocked"] { color: var(--warn); }
        .set-val b[data-state="ready"], .set-val b[data-state="waiting"] { color: var(--dim); }
        .set-val b[data-state="n/a"] { color: var(--warn); }
        .set-row.afk-health-row .set-val { min-width: 0; max-width: 58%; }
        .set-row.afk-health-row .set-val b { white-space: normal; text-align: right; line-height: 1.35; }
        .afk-health-reset { all: unset; flex: none; padding: 2px 5px; border-radius: 5px; cursor: pointer; color: var(--dim); border: 1px solid var(--line); font: 700 7.5px/1 var(--font-ui); letter-spacing: .08em; text-transform: uppercase; }
        .afk-health-reset:hover, .afk-health-reset:focus-visible { color: var(--acc-2); border-color: var(--line-strong); }
        .afk-health-reset:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
        .set-val b[data-field="nitroPreview"] { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: none; letter-spacing: 0; color: var(--ink); }
        .set-val b[data-field="nitroPreview"][data-good="1"] { color: var(--acc); }
        .set-val b[data-field="nitroPreview"][data-good="0"] { color: var(--warn); }
        /* En 320 px el rail deja la fila demasiado estrecha para la etiqueta y
           la palabra a la vez: el valor baja a la segunda linea y se alinea a
           la derecha, en vez de empujar el panel fuera del viewport. */
        .set-row.nitro-target-row { flex-wrap: wrap; }
        .set-row.nitro-target-row .set-val { min-width: 0; max-width: 100%; margin-left: auto; }
        .set-row.nitro-strategy-row { flex-wrap: wrap; }
        .set-row.nitro-strategy-row .set-val { min-width: 0; max-width: 100%; margin-left: auto; }
        .nitro-strategy { max-width: 100%; padding: 4px 6px; border-radius: 7px; cursor: pointer; color: var(--ink-2); background: rgba(0, 0, 0, .32); border: 1px solid var(--line); font: 700 8.5px/1.2 var(--font-mono); letter-spacing: .03em; text-transform: uppercase; }
        .nitro-strategy:hover { color: var(--acc-2); border-color: var(--line-strong); }
        .nitro-strategy:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
        .nitro-strategy option { color: var(--ink); background: var(--bg-lo); }
        .row.nitro-delta-row b[data-good="1"] { color: var(--acc); }
        .row.nitro-delta-row b[data-good="0"] { color: var(--warn); }

        /* Interruptor tipo iOS con muelle: el muelle va en linear() y el
           cubic-bezier queda de repuesto para navegadores viejos. */
        .sw { all: unset; position: relative; flex: none; width: 34px; height: 18px; border-radius: 999px; cursor: pointer; background: rgba(255, 255, 255, .09); border: 1px solid rgba(255, 255, 255, .12); transition: background .25s ease, border-color .25s ease, box-shadow .25s ease; }
        .sw::after { content: ''; position: absolute; top: 1px; left: 1px; width: 14px; height: 14px; border-radius: 50%; background: linear-gradient(180deg, var(--ink), color-mix(in srgb, var(--ink) 76%, var(--dim))); box-shadow: 0 1px 3px rgba(0, 0, 0, .5); transition: transform .32s cubic-bezier(.34, 1.4, .5, 1); transition: transform .32s linear(0, 0.3 14%, 0.84 30%, 1.07 46%, 1.02 60%, 0.998 74%, 1); }
        .sw[data-on="1"] { background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 90%, transparent), rgba(41, 196, 110, .85)); border-color: color-mix(in srgb, var(--acc) 55%, transparent); box-shadow: 0 0 14px -3px color-mix(in srgb, var(--acc) 80%, transparent), inset 0 0 8px -4px rgba(0, 0, 0, .6); }
        .sw[data-on="1"]::after { transform: translateX(16px); }
        .sw:hover { border-color: var(--line-strong); }
        .sw:active::after { width: 17px; }

        .seg { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; padding: 3px; border-radius: 9px; background: rgba(0, 0, 0, .32); border: 1px solid var(--line); }
        .seg-glide { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / 3); border-radius: 7px; background: var(--acc-dim); border: 1px solid var(--line-strong); box-shadow: inset 0 0 12px -6px var(--acc), 0 0 14px -8px var(--acc); transition: transform .32s cubic-bezier(.34, 1.4, .5, 1); transition: transform .32s linear(0, 0.3 14%, 0.84 30%, 1.07 46%, 1.02 60%, .998 74%, 1); }
        .seg[data-index="1"] .seg-glide { transform: translateX(100%); }
        .seg[data-index="2"] .seg-glide { transform: translateX(200%); }
        .seg-btn { all: unset; position: relative; z-index: 1; padding: 5px 0; text-align: center; border-radius: 7px; cursor: pointer; font: 700 9px/1 var(--font-ui); letter-spacing: .12em; text-transform: uppercase; color: var(--dim); transition: color .2s ease; }
        .seg-btn:hover { color: var(--acc-2); }
        .seg[data-index="0"] .seg-btn[data-pace="soft"], .seg[data-index="1"] .seg-btn[data-pace="balanced"], .seg[data-index="2"] .seg-btn[data-pace="fast"] { color: var(--acc); }

        .sld { -webkit-appearance: none; appearance: none; width: 100%; height: 22px; margin: 2px 0 0; background: transparent; cursor: pointer; }
        .sld::-webkit-slider-runnable-track { height: 4px; border-radius: 99px; background: linear-gradient(90deg, var(--acc) 0 var(--fill, 0%), rgba(255, 255, 255, .1) var(--fill, 0%) 100%); }
        .sld::-webkit-slider-thumb { -webkit-appearance: none; width: 13px; height: 13px; margin-top: -4.5px; border-radius: 50%; background: linear-gradient(180deg, var(--ink), var(--acc-2)); border: 1px solid color-mix(in srgb, var(--acc) 80%, transparent); box-shadow: 0 0 12px -2px color-mix(in srgb, var(--acc) 90%, transparent); transition: transform .16s cubic-bezier(.34, 1.5, .5, 1); }
        .sld:active::-webkit-slider-thumb { transform: scale(1.25); }
        .sld:focus-visible { outline: 2px solid var(--acc); outline-offset: 3px; border-radius: 99px; }
        .sld-ends { display: flex; justify-content: space-between; font: 600 8px/1.2 var(--font-mono); letter-spacing: .08em; color: var(--dim-2); }

        .act { all: unset; flex: 1 1 0; padding: 6px 0; text-align: center; border-radius: 8px; cursor: pointer; font: 700 9px/1 var(--font-ui); letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); background: rgba(255, 255, 255, .045); border: 1px solid var(--line); transition: color .18s ease, background .18s ease, border-color .18s ease, transform .12s ease; }
        .act:hover { color: var(--acc); background: var(--acc-dim); border-color: var(--line-strong); }
        .act:active { transform: translateY(1px); }
        .act:disabled { opacity: .38; cursor: not-allowed; color: var(--dim-2); background: transparent; border-color: var(--line); }
        .act[data-act="report"] { color: var(--ink-warn); border-color: color-mix(in srgb, var(--warn) 26%, transparent); }
        .act[data-act="report"]:hover { color: var(--ink-warn-hi); background: color-mix(in srgb, var(--warn) 12%, transparent); border-color: color-mix(in srgb, var(--warn) 45%, transparent); }
        .cfg-text { display: block; width: 100%; height: 46px; margin-top: 7px; padding: 6px 7px; resize: vertical; color: var(--ink); background: rgba(0, 0, 0, .35); border: 1px solid var(--line); border-radius: 8px; font: 500 9.5px/1.35 var(--font-mono); }
        .cfg-text:focus-visible { outline: none; border-color: var(--line-strong); box-shadow: 0 0 16px -8px var(--acc); }
        .cfg-note { margin-top: 6px; font: 500 9px/1.35 var(--font-ui); color: var(--dim); }

        .keys { display: grid; gap: 3px; }
        .key-row { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: baseline; font: 500 10px/1.4 var(--font-ui); color: var(--ink-2); }
        .key-row kbd { padding: 2px 6px; border-radius: 5px; font: 600 9px/1.2 var(--font-mono); color: var(--acc); background: color-mix(in srgb, var(--acc) 10%, transparent); border: 1px solid color-mix(in srgb, var(--acc) 24%, transparent); white-space: nowrap; }
        .about { font: 500 10px/1.5 var(--font-ui); color: var(--dim); }
        .about b { color: var(--acc-2); font-weight: 700; }

        /* ---------- barra de estado y acciones ------------------------------ */
        .foot { padding: 7px 11px 8px; border-top: 1px solid var(--line); background: linear-gradient(180deg, rgba(255, 255, 255, .012), rgba(0, 0, 0, .22)); }
        .status { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 26px; margin-bottom: 6px; font: 500 9.5px/1.35 var(--font-ui); color: var(--dim); }
        .foot-bar { display: flex; align-items: center; flex-wrap: nowrap; min-width: 0; gap: 5px; overflow: hidden; white-space: nowrap; font: 600 8.5px/1 var(--font-mono); font-variant-numeric: tabular-nums; letter-spacing: .05em; text-transform: uppercase; color: var(--dim-2); }
        .led { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--dim-2); box-shadow: 0 0 8px color-mix(in srgb, var(--dim-2) 50%, transparent); transition: background .25s ease, box-shadow .25s ease; }
        .panel[data-state="running"] .led { background: var(--acc); box-shadow: 0 0 10px var(--acc); animation: nt-pulse 1.9s ease-in-out infinite; }
        .panel[data-state="paused"] .led { background: var(--warn); box-shadow: 0 0 10px var(--warn); }
        .panel[data-state="break"] .led { background: var(--info); box-shadow: 0 0 10px var(--info); }
        .foot-bar b { color: color-mix(in srgb, var(--ink) 88%, var(--dim)); font-weight: 700; }
        .foot-bar [data-field="footAcc"] { color: var(--acc-2); }
        .foot-bar .fsep { opacity: .35; }
        .foot-bar .hint { margin-left: auto; color: var(--dim-2); }
        .panel[data-foot="compact"] .foot-bar { gap: 7px; }
        .panel[data-foot="compact"] .foot-bar [data-field="footMode"],
        .panel[data-foot="compact"] .foot-bar [data-field="footCap"],
        .panel[data-foot="compact"] .foot-bar .hint,
        .panel[data-foot="compact"] .foot-bar .fsep { display: none; }
        .panel[data-foot="hidden"] .foot-bar { display: none; }
        .panel[data-standby="1"] .foot-bar .led { background: var(--info); box-shadow: 0 0 10px var(--info); }
        /* Parado (sin modo NORMAL): ambar en la barra y en la etiqueta de la
           tarjeta live. Es un estado, y se tiene que ver de un vistazo. */
        .panel[data-stopped="1"][data-mode="auto"] .foot-bar .led { background: var(--warn); box-shadow: 0 0 10px color-mix(in srgb, var(--warn) 75%, transparent); }
        .panel[data-stopped="1"][data-mode="auto"] .foot-bar b[data-field="footState"] { color: var(--ink-warn-hi); }
        .panel[data-stopped="1"][data-mode="auto"] .card-s[data-field="liveTag"] { color: var(--warn); }

        /* Mini-grafica de model Δ: la linea de puntos es el cero; el area y la
           linea usan el acento del tema y no necesitan ningun canvas. */
        .spark { display: block; width: calc(100% - 22px); height: 24px; margin: 0 11px 6px; overflow: visible; }
        .spark-line { fill: none; stroke: var(--acc); stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; transition: opacity .2s ease; }
        .spark-area { fill: color-mix(in srgb, var(--acc) 16%, transparent); stroke: none; }
        .spark-zero { stroke: color-mix(in srgb, var(--acc) 22%, transparent); stroke-width: .6; stroke-dasharray: 2 3; }
        .spark[data-empty="1"] { display: none; }

        .actions { display: flex; gap: 6px; padding: 0 11px 11px; }
        .toggle { all: unset; flex: 1 1 auto; padding: 9px 0; text-align: center; border-radius: 9px; cursor: pointer; font: 800 9.5px/1 var(--font-ui); letter-spacing: .16em; text-transform: uppercase; color: var(--ink); background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 22%, transparent), color-mix(in srgb, var(--acc) 10%, transparent)); border: 1px solid color-mix(in srgb, var(--acc) 34%, transparent); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .1); transition: filter .15s ease, transform .1s ease, box-shadow .25s ease; }
        .toggle:hover { filter: brightness(1.16); box-shadow: 0 0 20px -8px var(--acc), inset 0 1px 0 rgba(255, 255, 255, .12); }
        .toggle:active { transform: translateY(1px); }
        .panel[data-state="paused"] .toggle { color: var(--ink); background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 30%, transparent), color-mix(in srgb, var(--acc) 14%, transparent)); border-color: color-mix(in srgb, var(--acc) 50%, transparent); }
        .stop { all: unset; flex: none; display: grid; place-items: center; padding: 9px 14px; border-radius: 9px; cursor: pointer; font: 800 9.5px/1 var(--font-ui); letter-spacing: .14em; text-transform: uppercase; color: var(--ink-bad); background: linear-gradient(180deg, color-mix(in srgb, var(--bad) 18%, transparent), color-mix(in srgb, var(--bad) 8%, transparent)); border: 1px solid color-mix(in srgb, var(--bad) 32%, transparent); transition: filter .15s ease, transform .1s ease, color .2s ease, background .2s ease, border-color .2s ease; }
        .stop:hover { filter: brightness(1.16); box-shadow: 0 0 20px -9px var(--bad); }
        .stop:active { transform: translateY(1px); }
        .stop[data-pending="true"] { color: var(--ink-warn); background: linear-gradient(180deg, color-mix(in srgb, var(--warn) 24%, transparent), color-mix(in srgb, var(--warn) 12%, transparent)); border-color: color-mix(in srgb, var(--warn) 42%, transparent); }
        /* Parado no hay nada que parar: el boton se apaga en vez de cerrar una
           tanda ya cerrada. */
        .stop:disabled { opacity: .42; cursor: not-allowed; color: var(--dim); background: rgba(255, 255, 255, .03); border-color: var(--line); }
        .stop:disabled:hover, .stop:disabled:active { filter: none; box-shadow: none; transform: none; }
        .gear { all: unset; flex: none; display: grid; place-items: center; width: 32px; border-radius: 9px; cursor: pointer; color: var(--dim); background: rgba(255, 255, 255, .04); border: 1px solid var(--line); transition: filter .15s ease, color .18s ease, background .18s ease, border-color .18s ease, transform .12s ease; }
        .gear:hover { color: var(--acc); background: var(--acc-dim); border-color: var(--line-strong); }
        .gear:active { transform: scale(.94); }
        .gear[data-open="1"] { color: var(--acc); background: var(--acc-dim); border-color: var(--line-strong); box-shadow: 0 0 18px -8px var(--acc); }
        .gear svg { width: 14px; height: 14px; display: block; }

        /* ---------- acabado simple ----------------------------------------- */
        /* Una segunda pasada, plana y silenciosa: menos adornos, mas aire y una
           sola jerarquia. Las vistas siguen siendo las mismas; solo cambia la
           piel que las contiene. */
        .panel {
          width: 330px;
          background: linear-gradient(180deg, var(--bg-hi), var(--bg-lo));
          border-radius: 12px;
          box-shadow: 0 18px 42px -22px rgba(0, 0, 0, .95), 0 0 0 1px rgba(0, 0, 0, .65);
          font-family: var(--font-ui);
        }
        .head { gap: 7px; padding: 10px 11px 8px; }
        .mark { width: 27px; height: 27px; border-radius: 8px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .08); }
        .mark svg { width: 19px; height: 19px; filter: none; }
        .title { font-size: 13px; letter-spacing: .1em; text-shadow: none; }
        .sub { margin-top: 3px; font-size: 9px; letter-spacing: .08em; color: var(--dim); }
        .chips-row { flex-wrap: wrap; row-gap: 5px; padding: 0 11px 9px; }
        .pace, .mode, .cap { padding: 4px 7px; border-radius: 6px; font-size: 9px; letter-spacing: .08em; }
        .cap { flex: 0 1 auto; }

        .main { border-top-color: var(--line); }
        .rail { padding: 8px 5px; background: transparent; }
        .rail-glide { left: 5px; top: 8px; width: 30px; height: 30px; border-radius: 7px; background: var(--acc-dim); box-shadow: none; }
        .rail-btn { width: 30px; height: 30px; border-radius: 7px; }
        .views { padding: 10px 11px 11px; }
        .view-head { align-items: center; margin-bottom: 9px; padding-bottom: 7px; border-bottom-color: var(--line); }
        .view-head span { gap: 6px; font-size: 9px; letter-spacing: .13em; color: var(--dim); }
        .view-head span::before { width: 5px; height: 5px; border-radius: 2px; box-shadow: none; }
        .view-head b { font-size: 9px; color: var(--dim-2); }

        .card { margin-bottom: 8px; padding: 10px; border-radius: 9px; background: var(--card); border-color: var(--line); transition: none; }
        .card:hover { border-color: var(--line); box-shadow: none; }
        .card::before, .card > .ghost { display: none; }
        .card-h { align-items: center; margin-bottom: 7px; }
        .card-t { font-size: 9px; letter-spacing: .13em; color: var(--ink-2); }
        .card-s { font-size: 9px; color: var(--dim); }
        .hero { padding: 10px 0 9px; }
        .stat b { font-size: 28px; text-shadow: none; }
        .stat b[data-good="1"] { text-shadow: none; }
        .stat b[data-good="0"] { text-shadow: none; }
        .stat span { margin-top: 5px; font-size: 9px; letter-spacing: .13em; color: var(--dim); }
        .auto-pace { margin-top: 3px; padding: 3px 7px; border-color: var(--line); background: transparent; color: var(--dim); font-size: 9px; letter-spacing: .05em; }
        .auto-pace::before { width: 4px; height: 4px; box-shadow: none; }

        /* Las metricas de Live y Season se leen como una cuadricula, no como
           una lista larga: dos columnas, etiqueta arriba y valor debajo. */
        .v-stats .live-card .rows,
        .v-stats .season-card .rows { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; margin-top: 8px; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; background: var(--line); }
        .v-stats .season-card .rows { grid-template-columns: .9fr 1.1fr; }
        .v-stats .live-card .rows .row,
        .v-stats .season-card .rows .row { display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; gap: 2px; min-width: 0; padding: 7px 8px; border: 0; background: rgba(0, 0, 0, .16); }
        .v-stats .live-card .rows .row > span,
        .v-stats .season-card .rows .row > span { font-size: 9px; letter-spacing: .08em; color: var(--dim-2); }
        .v-stats .live-card .rows .row b,
        .v-stats .season-card .rows .row b { width: 100%; text-align: left; white-space: normal; overflow-wrap: anywhere; font-size: 10.5px; line-height: 1.3; color: var(--ink-2); }
        .v-stats .live-card .rows .result-row { grid-column: 1 / -1; }
        .v-stats .season-card .rows .row b { font-size: 9.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .v-stats .live-card .rows .row.secondary { display: none; }

        /* ---------- cuenta ------------------------------------------------- */
        /* La vista Live ya no solo dice el target: ensena la cuenta que se leyo,
           el historico usado y cuando fue la ultima lectura. */
        .account-card .acct-top { display: flex; align-items: center; justify-content: space-between; gap: 7px; margin: -1px 0 6px; }
        .account-card .acct-id { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 700 10px/1.2 var(--font-mono); color: var(--acc-2); }
        .account-card .acct-refresh { flex: 0 0 auto; padding: 4px 8px; font-size: 9px; }
        .account-card .acct-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; overflow: hidden; border: 1px solid var(--line); border-radius: 7px; background: var(--line); }
        .account-card .acct-metrics > div { min-width: 0; padding: 6px 7px; background: rgba(0, 0, 0, .16); }
        .account-card .acct-metrics b { display: block; font: 700 15px/1.1 var(--font-mono); font-variant-numeric: tabular-nums; color: var(--ink); }
        .account-card .acct-metrics span { display: block; margin-top: 2px; font: 700 7px/1.2 var(--font-ui); letter-spacing: .1em; text-transform: uppercase; color: var(--dim-2); }
        .account-card .rows { margin-top: 7px; }
        .account-card .acct-state { font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        .account-card .acct-state[data-state="ready"] { color: var(--acc); }
        .account-card .acct-state[data-state="reading"] { color: var(--info); }
        .account-card .acct-state[data-state="warn"] { color: var(--warn); }
        .account-card .acct-state[data-state="idle"] { color: var(--dim-2); }
        .season-card .season-name { margin: 1px 0 7px; font-size: 13px; }
        .season-card .season-actions { margin-top: 7px; }
        .season-card .season-actions .act { font-size: 9px; padding: 5px 9px; }
        .update-card .season-actions .act { flex: 0 1 auto; }

        .foot { padding: 7px 11px 8px; background: transparent; }
        .status { min-height: 0; margin-bottom: 6px; font-size: 9px; color: var(--dim); }
        .foot-bar { font-size: 9px; letter-spacing: .03em; }
        .actions { padding: 0 11px 11px; }
        .toggle { padding: 9px 0; border-radius: 8px; background: var(--acc-dim); border-color: var(--line-strong); box-shadow: none; }
        .toggle:hover { box-shadow: none; }
        .stop { border-radius: 8px; background: color-mix(in srgb, var(--bad) 12%, transparent); border-color: color-mix(in srgb, var(--bad) 28%, transparent); }
        .stop:hover { box-shadow: none; }
        .gear { border-radius: 8px; }
        .act { border-radius: 7px; text-decoration: none; }
        .theme { border-radius: 7px; }

        /* ---------- selector de tema ---------------------------------------- */
        .themes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 2px; }
        .theme { all: unset; display: flex; flex-direction: column; gap: 4px; padding: 5px 5px 4px; border-radius: 8px; cursor: pointer; border: 1px solid var(--line); background: rgba(255, 255, 255, .022); transition: border-color .18s ease, background .18s ease, box-shadow .22s ease, transform .12s ease; }
        .theme:hover { border-color: var(--line-strong); transform: translateY(-1px); }
        .theme:active { transform: translateY(0) scale(.97); }
        .theme:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
        .theme i { display: block; height: 16px; border-radius: 5px; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .18), 0 2px 8px -4px rgba(0, 0, 0, .9); }
        .theme span { text-align: center; font: 700 7.5px/1 var(--font-ui); letter-spacing: .12em; text-transform: uppercase; color: var(--dim-2); }
        .theme[aria-pressed="true"] { border-color: var(--line-strong); background: var(--acc-dim); box-shadow: 0 0 18px -9px var(--acc), inset 0 0 0 1px var(--line); }
        .theme[aria-pressed="true"] span { color: var(--acc); }
        .theme[aria-pressed="true"] i { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .35), 0 0 12px -3px var(--acc); }
        /* Las muestras no heredan el tema activo: cada tile ensena el suyo. */
        .theme i.sw-carbon { background: linear-gradient(135deg, #0c110e, #35ea86 60%, #9bf7c5); }
        .theme i.sw-aurora { background: linear-gradient(135deg, #071314, #3fe0c5 55%, #a78bfa); }
        .theme i.sw-sunset { background: linear-gradient(135deg, #180c0b, #ff9a5c 55%, #ff77b0); }
        .theme i.sw-ice { background: linear-gradient(135deg, #080f18, #66e3ff 55%, #d7f7ff); }
        .theme i.sw-violet { background: linear-gradient(135deg, #120b1b, #c08bff 55%, #f0a9ff); }
        .theme i.sw-rgb {
          background: conic-gradient(from 0deg, #ff5f6d, #ffc371, #47ffa1, #5ad1ff, #b06bff, #ff5f6d);
        }

        .rgb-lab { display: grid; gap: 7px; margin-top: 8px; padding: 8px; border: 1px solid var(--line); border-radius: 9px; background: rgba(0, 0, 0, .2); }
        .rgb-lab-h { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .rgb-lab-h span { color: var(--ink-2); font: 800 8px/1 var(--font-ui); letter-spacing: .14em; text-transform: uppercase; }
        .rgb-lab-h b { color: var(--dim); font: 600 8px/1 var(--font-ui); }
        .rgb-colors { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .rgb-colors label { display: grid; gap: 4px; color: var(--dim); font: 600 8px/1 var(--font-ui); letter-spacing: .08em; text-transform: uppercase; }
        .rgb-colors input { width: 100%; height: 24px; padding: 2px; border: 1px solid var(--line); border-radius: 6px; background: rgba(255, 255, 255, .03); cursor: pointer; }
        .rgb-speed { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
        .rgb-speed button { all: unset; padding: 5px 0; border: 1px solid var(--line); border-radius: 6px; background: rgba(255, 255, 255, .025); color: var(--dim); text-align: center; cursor: pointer; font: 700 9px/1 var(--font-mono); transition: color .16s ease, border-color .16s ease, background .16s ease; }
        .rgb-speed button[aria-pressed="true"] { color: var(--acc); border-color: var(--line-strong); background: var(--acc-dim); }
        .rgb-range { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 5px; color: var(--dim); font: 600 8px/1 var(--font-ui); letter-spacing: .08em; text-transform: uppercase; }
        .rgb-range output { color: var(--ink-2); font-family: var(--font-mono); }
        .rgb-range input { grid-column: 1 / -1; width: 100%; height: 14px; margin: 0; accent-color: var(--acc); cursor: pointer; }
        .rgb-mode { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--dim); font: 600 8px/1 var(--font-ui); letter-spacing: .08em; text-transform: uppercase; }
        .rgb-mode select { min-width: 0; max-width: 58%; padding: 4px 6px; border: 1px solid var(--line); border-radius: 6px; background: rgba(255, 255, 255, .04); color: var(--ink-2); font: 600 9px/1 var(--font-ui); cursor: pointer; }
        .rgb-lab input:focus-visible, .rgb-lab button:focus-visible, .rgb-lab select:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }

        /* ---------- pantalla ------------------------------------------------- */
        /* Densidad, escala, contraste y foco de carrera son atributos del nodo
           raiz; el modelo vive en visualPrefs y el CSS hace el resto. */
        .focus-strip { display: none; align-items: center; gap: 7px; margin: 3px 0 7px; padding: 5px 7px; border: 1px solid var(--line); border-radius: 7px; background: color-mix(in srgb, var(--acc) 8%, transparent); }
        .panel[data-state="running"][data-focus="on"] .focus-strip { display: flex; }
        .panel[data-state="running"][data-focus="on"] .account-card { display: none; }
        .focus-strip b { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 9.5px/1.2 var(--font-ui); color: var(--ink-2); }
        .focus-state { flex: none; padding: 2px 6px; border-radius: 999px; background: var(--acc); color: var(--ink-on-acc); font: 800 8px/1 var(--font-ui); letter-spacing: .1em; }
        .sr-only { position: absolute !important; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

        .rhythm { margin: 5px 2px 2px; }
        .rhythm[data-ready="0"] { display: none; }
        .rhythm-chart { display: block; width: 100%; height: 34px; overflow: visible; }
        .rhythm-band { fill: color-mix(in srgb, var(--acc) 13%, transparent); }
        .rhythm-target { stroke: color-mix(in srgb, var(--acc) 50%, transparent); stroke-width: .8; stroke-dasharray: 2 2; }
        .rhythm-line { fill: none; stroke: var(--acc); stroke-width: 1.7; stroke-linejoin: round; stroke-linecap: round; }
        .rhythm-note { margin-top: 2px; font: 600 8.5px/1.25 var(--font-ui); letter-spacing: .03em; color: var(--dim); }

        .panel[data-density="compact"] .card { margin-bottom: 6px; padding: 8px; }
        .panel[data-density="compact"] .views { padding: 8px 9px 9px; }
        .panel[data-density="compact"] .hero { padding: 7px 0; }
        .panel[data-density="compact"] .stat b { font-size: 24px; }
        .panel[data-density="compact"] .v-stats .live-card .rows .row,
        .panel[data-density="compact"] .v-stats .season-card .rows .row { padding: 5px 7px; }

        @media (min-width: 361px) {
          .panel[data-scale="115"]:not([data-collapsed="true"]) { width: 380px; }
        }

        .panel[data-contrast="high"] {
          --ink: #ffffff;
          --ink-2: #eef6f1;
          --dim: #bdcbc3;
          --dim-2: #b7c6be;
          --line: rgba(255, 255, 255, .22);
          --line-strong: rgba(255, 255, 255, .4);
        }
        .panel[data-contrast="high"] .card-s,
        .panel[data-contrast="high"] .row > span { color: var(--ink-2); }

        /* ---------- plegado -------------------------------------------------- */
        /* Plegado: cabecera con el LED y el nombre, y los tres botones. Todo lo
           demas fuera, que para eso esta el boton. */
        .panel[data-collapsed="true"] { width: auto; min-width: 210px; }
        .panel[data-collapsed="true"] .main,
        .panel[data-collapsed="true"] .foot,
        .panel[data-collapsed="true"] .chips-row { display: none; }
        .panel[data-collapsed="true"] .head { padding-bottom: 9px; }
        .panel[data-collapsed="true"] .actions { padding-top: 0; }

        /* En una ventana estrecha la cuenta ocupa el sitio del nombre. Se
           retira antes de que el titulo empiece a cortarse. */
        @media (max-width: 360px) {
          :host { left: 12px !important; }
          .panel {
            width: calc(100vw - 24px);
            max-width: calc(100vw - 24px);
          }
          .views { padding-inline: 9px; }
          .context-banner { margin-inline: 9px; }
          .who { display: none; }
        }

        /* En pantallas bajas el panel entero hace scroll interno: la cabecera
           y las acciones nunca quedan fuera del viewport. */
        @media (max-height: 420px) {
          :host { bottom: 8px !important; }
          .panel { max-height: calc(100vh - 16px); }
          .head { padding-top: 7px; padding-bottom: 6px; }
          .chips-row { padding-bottom: 6px; }
          .context-banner { padding-block: 6px; margin-bottom: 6px; }
          .foot { padding-block: 5px; }
          .actions { padding-bottom: 8px; }
        }

        /* 160 CSS px (320 px fisicos al 200 %): el rail lateral y la columna
           de botones ya no caben. El panel se vuelve una columna, el rail pasa
           arriba y las vistas hacen scroll dentro de una altura maxima. */
        @media (max-width: 200px) {
          :host { left: 8px !important; }
          .panel {
            display: flex;
            flex-direction: column;
            width: calc(100vw - 16px);
            max-width: calc(100vw - 16px);
            max-height: calc(100vh - 32px);
          }
          .panel[data-collapsed="true"] { min-width: 0; }
          .head { flex: none; gap: 6px; padding: 8px 8px 6px; }
          .head::after { left: 8px; right: 8px; }
          .head .dot,
          .head .who,
          .head .sub { display: none; }
          .head .ghlink { display: grid; place-items: center; width: 22px; height: 22px; padding: 0; }
          .head .ghlink span { display: none; }
          .title { font-size: 11px; letter-spacing: .08em; }
          .chips-row { flex: none; flex-wrap: wrap; row-gap: 5px; padding: 0 8px 7px; }
          .chips-row > * { flex: 0 1 auto; white-space: nowrap; }
          .set-row { flex-direction: column; align-items: stretch; gap: 4px; }
          .set-row .set-val { justify-content: flex-end; margin-left: auto; }
          .main { flex: 1 1 auto; min-height: 0; flex-direction: column; }
          .rail {
            flex: none;
            flex-direction: row;
            justify-content: space-around;
            padding: 4px;
            border-right: 0;
            border-bottom: 1px solid var(--line);
          }
          .rail-glide { display: none; }
          .rail-btn { width: 24px; height: 24px; border-radius: 7px; }
          .rail-btn svg { width: 13px; height: 13px; }
          .rail-btn::after { display: none; }
          .views { flex: 1 1 auto; min-height: 0; max-height: none; padding: 8px; }
          .foot { display: none; }
          .actions { flex: none; gap: 5px; padding: 0 8px 8px; }
          .actions .gear { display: none; }
          .actions .stop { padding-left: 10px; padding-right: 10px; }
        }

        /* Con el sistema pidiendo menos animacion se van las animaciones de
           entrada (lo grande y decorativo) pero se quedan los cambios de estado
           cortos: el muelle del interruptor y de los deslizadores es informacion
           (dice si algo esta encendido), no adorno. */
        @media (prefers-reduced-motion: reduce) {
          .panel, .panel[data-fresh="1"] .card, .view, .stat b.bump, .recent-pair i.bump, .prog::after,
          .panel .dot, .panel .led, .theme i.sw-rgb, .panel[data-theme="rgb"] .title,
          .panel[data-theme="rgb"], .panel[data-theme="rgb"]::after { animation: none !important; }
        }
      `;
    perfCounters.panelCssBuilds += 1;
    return panelCssCache;
  }
