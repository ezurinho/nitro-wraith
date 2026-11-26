// Panel shell: the shadow root, its markup and the bindings for every
// control. It is separated from the TUNE/support logic so 80-panel.js stays a
// readable size; the fragments share one scope, so this is still createPanel().

  function createPanel() {
    if (document.getElementById(PANEL_ID) || !document.body) return;

    // Un panel nuevo trae nodos nuevos: las firmas del anterior ya no valen.
    panel.calSig = '';
    panel.accSig = null;
    panel.updateHealthAt = 0;

    registerThemeProperties();

    const host = document.createElement('div');
    host.id = PANEL_ID;
    host.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483000;';

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        /* ====================================================================
           Panel: una sola pieza de shadow DOM. Paleta de overlay de juego
           (carbon casi negro + verde neon), tipografia pequena y animaciones
           cortas: entrada, tarjetas escalonadas, rail con deslizador, muelle en
           los interruptores y un parpadeo cuando un numero cambia.
           Regla de oro de aqui abajo: el calcado de datos (filas, chips, cajon)
           no cambia, solo la piel. Todo lo que el JS busca sigue existiendo.
           ==================================================================== */
        * { box-sizing: border-box; }

        /* Foco visible en todos los controles, no solo en las tabs del rail. */
        :focus-visible { outline: 2px solid var(--acc, #35ea86); outline-offset: 2px; }

        /* Respetar la preferencia del sistema: sin entrada, sin escalonado y sin
           RGB animado; el panel sigue siendo el mismo. */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
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
          --card: rgba(255, 255, 255, .028);
          --bg-hi: rgba(12, 17, 14, .985);
          --bg-lo: rgba(5, 8, 6, .995);
          position: relative;
          isolation: isolate;
          width: 322px;
          max-width: calc(100vw - 32px);
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
          font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
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
           el; sin @property se queda en rojo fijo, que sigue siendo legible. */
        .panel[data-theme="rgb"] {
          --nt-hue: 0;
          --nt-angle: 0deg;
          --acc: hsl(var(--nt-hue) 92% 63%);
          --acc-2: hsl(calc(var(--nt-hue) + 70) 94% 76%);
          --ink: #f6f7ff;
          --ink-2: #d9dcf0;
          --dim: #8d90a6;
          --dim-2: #8a8da3;
          --bg-hi: rgba(11, 11, 19, .985);
          --bg-lo: rgba(5, 5, 10, .995);
          animation:
            nt-boot .42s cubic-bezier(.2, .9, .25, 1) both,
            nt-rgb-hue 16s linear infinite,
            nt-rgb-angle 8s linear infinite;
        }
        @keyframes nt-rgb-hue { to { --nt-hue: 360; } }
        @keyframes nt-rgb-angle { to { --nt-angle: 360deg; } }

        /* Con una carrera viva no se animan propiedades registradas del panel:
           cada frame obligaria a recalcular todos los color-mix y el borde
           conico, y el juego necesita ese tiempo. Al terminar la carrera los
           colores vuelven a girar solos. */
        .panel[data-theme="rgb"][data-state="running"] {
          animation-play-state: paused;
        }
        .panel[data-theme="rgb"][data-state="running"] .title,
        .panel[data-theme="rgb"][data-collapsed="true"],
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
            #ff5f6d, #ffc371, #47ffa1, #5ad1ff, #b06bff, #ff5f6d);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          display: none;
          opacity: .9;
          pointer-events: none;
        }
        .panel[data-theme="rgb"]::after { display: block; }
        .panel[data-theme="rgb"] .title {
          background: linear-gradient(90deg, #ff5f6d, #ffc371, #47ffa1, #5ad1ff, #b06bff, #ff5f6d);
          background-size: 300% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          text-shadow: none;
          animation: nt-rgb-title 6s linear infinite;
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
        .mark .dot { position: absolute; right: -2px; top: -2px; width: 5px; height: 5px; box-shadow: 0 0 0 2px var(--bg-hi), 0 0 7px color-mix(in srgb, var(--acc) 70%, transparent); }
        .panel[data-state="running"] .mark .dot { animation: nt-pulse 1.7s ease-in-out infinite; }
        .panel[data-collapsed="true"] .mark { width: 23px; height: 23px; border-radius: 7px; }
        .panel[data-state="running"] .dot { background: var(--acc); box-shadow: 0 0 0 3px var(--acc-dim), 0 0 12px color-mix(in srgb, var(--acc) 80%, transparent); animation: nt-pulse 1.7s ease-in-out infinite; }
        .panel[data-state="paused"] .dot { background: var(--warn); box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn) 16%, transparent), 0 0 12px color-mix(in srgb, var(--warn) 60%, transparent); }
        .panel[data-state="break"] .dot { background: var(--info); box-shadow: 0 0 0 3px color-mix(in srgb, var(--info) 16%, transparent), 0 0 12px color-mix(in srgb, var(--info) 60%, transparent); }
        @keyframes nt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }

        .brand { flex: 1 1 auto; min-width: 0; }
        .title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 800 12.5px/1.15 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .13em; text-transform: uppercase; color: var(--ink); text-shadow: 0 0 14px color-mix(in srgb, var(--acc) 35%, transparent); }
        .sub { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; font: 600 8.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .13em; text-transform: uppercase; color: var(--dim-2); }
        .sub b { color: var(--acc); font-weight: 700; }

        .who { display: none; }
        .ghlink { flex: none; display: inline-flex; align-items: center; gap: 4px; padding: 5px 8px; border-radius: 7px; text-decoration: none; font: 800 8px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--acc-2); background: var(--acc-dim); border: 1px solid var(--line-strong); transition: color .15s ease, background .15s ease, border-color .15s ease; }
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
        .pace { all: unset; flex: none; padding: 4px 8px; border-radius: 999px; cursor: pointer; font: 700 8.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .1em; color: var(--acc-2); background: color-mix(in srgb, var(--acc) 12%, transparent); border: 1px solid color-mix(in srgb, var(--acc) 32%, transparent); transition: filter .15s ease, transform .12s ease, box-shadow .2s ease; }
        .pace:hover { filter: brightness(1.16); box-shadow: 0 0 14px -4px color-mix(in srgb, var(--acc) 70%, transparent); }
        .pace:active { transform: scale(.96); }
        .panel[data-pace-profile="soft"] .pace { color: var(--info); background: color-mix(in srgb, var(--info) 12%, transparent); border-color: color-mix(in srgb, var(--info) 32%, transparent); }
        .panel[data-pace-profile="fast"] .pace { color: #ffe3b8; background: color-mix(in srgb, var(--warn) 12%, transparent); border-color: color-mix(in srgb, var(--warn) 32%, transparent); }
        /* El chip es un ESTADO, no un interruptor: el bot es siempre AUTO y la
           cola se arma sola. Para parar esta Stop (o Esc / Alt+N). */
        .mode { flex: none; padding: 4px 8px; border-radius: 999px; font: 700 8.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .1em; color: var(--acc-2); background: var(--acc-dim); border: 1px solid color-mix(in srgb, var(--acc) 30%, transparent); cursor: default; }
        .cap { flex: 1 1 auto; padding: 4px 8px; border-radius: 999px; text-align: center; font: 700 8.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .1em; color: #ffe0b0; background: color-mix(in srgb, var(--warn) 10%, transparent); border: 1px solid color-mix(in srgb, var(--warn) 26%, transparent); transition: color .2s ease, background .2s ease, border-color .2s ease; }
        .panel[data-cap-hit="1"] .cap { color: #ffd6d6; background: color-mix(in srgb, var(--bad) 18%, transparent); border-color: color-mix(in srgb, var(--bad) 45%, transparent); }


        /* ---------- cuerpo: rail + vistas ----------------------------------- */
        .main { display: flex; align-items: stretch; gap: 0; border-top: 1px solid var(--line); }
        .rail { position: relative; flex: none; display: flex; flex-direction: column; gap: 2px; padding: 9px 6px; border-right: 1px solid var(--line); background: linear-gradient(180deg, rgba(255, 255, 255, .02), transparent); }
        .rail-btn { all: unset; position: relative; z-index: 1; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; cursor: pointer; color: var(--dim-2); transition: color .18s ease, transform .12s ease; }
        .rail-btn:hover { color: var(--acc-2); }
        .rail-btn:active { transform: scale(.9); }
        .rail-btn svg { width: 15px; height: 15px; display: block; }
        /* Etiqueta flotante del rail: aparece solo al apuntar o enfocar, con
           transform y opacity (nada de width ni filtros). */
        .rail-btn::after { content: attr(data-label); position: absolute; left: calc(100% + 7px); top: 50%; z-index: 6; padding: 4px 7px; border-radius: 6px; white-space: nowrap; pointer-events: none; font: 700 8px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); background: var(--bg-hi); border: 1px solid var(--line-strong); box-shadow: 0 8px 18px -12px rgba(0, 0, 0, .9); opacity: 0; transform: translate(-3px, -50%); transition: opacity .16s ease, transform .16s ease; }
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

        .views { flex: 1 1 auto; min-width: 0; max-height: 62vh; overflow-y: auto; overscroll-behavior: contain; padding: 10px 11px 11px; }
        .views::-webkit-scrollbar { width: 6px; }
        .views::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--acc) 22%, transparent); border-radius: 99px; }
        .views::-webkit-scrollbar-track { background: transparent; }
        .views { scrollbar-gutter: stable; }
        .view { display: none; }
        /* Cabecera corta de cada vista: dice donde estas sin ocupar una tarjeta. */
        .view-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 2px 8px; margin: 0 1px 8px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
        .view-head span { display: inline-flex; align-items: center; gap: 6px; font: 800 7.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .18em; text-transform: uppercase; color: var(--acc); }
        .view-head span::before { content: ''; width: 10px; height: 1px; border-radius: 99px; background: var(--acc); box-shadow: 0 0 7px var(--acc); }
        .view-head b { font: 600 8px/1.2 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .04em; color: var(--dim-2); text-align: right; }
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
        .tune-search input { all: unset; flex: 1 1 auto; min-width: 0; padding: 0 5px; font: 600 10px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--ink); }
        .tune-search input::placeholder { color: var(--dim-2); }
        .tune-search input::-webkit-search-cancel-button { display: none; }
        .tune-clear { all: unset; flex: none; display: grid; place-items: center; width: 18px; height: 18px; margin-right: 4px; border-radius: 5px; cursor: pointer; font: 700 14px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--dim-2); }
        .tune-clear:hover { color: var(--acc); background: var(--acc-dim); }
        .tune-clear:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
        .tune-clear[hidden], .tune-empty[hidden] { display: none; }
        .tune-count { flex: none; font: 700 7.5px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .06em; text-transform: uppercase; color: var(--dim-2); white-space: nowrap; }
        .tune-empty { margin: -2px 1px 10px; padding: 11px 8px; border: 1px dashed var(--line); border-radius: 8px; text-align: center; font: 500 9.5px/1.4 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--dim); }
        .tune-sec-h { display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 8px; margin: 1px 1px 7px; }
        .tune-sec-h span { display: inline-flex; align-items: center; gap: 6px; font: 800 7.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .18em; text-transform: uppercase; color: var(--acc); }
        .tune-sec-h span::before { content: ''; width: 12px; height: 1px; border-radius: 99px; background: var(--acc); box-shadow: 0 0 7px var(--acc); }
        .tune-sec-h b { font: 600 8px/1.2 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .04em; color: var(--dim-2); }
        .tune-sec-h::after { content: ''; flex: 1 1 20px; min-width: 12px; height: 1px; align-self: center; background: linear-gradient(90deg, var(--line), transparent); }

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
        .card-t { font: 800 9px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .19em; text-transform: uppercase; color: var(--ink-2); }
        .card-s { font: 600 8.5px/1.2 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .05em; color: var(--dim-2); }
        /* Edad del dato vivo: se actualiza cuatro veces por segundo y se pone
           ambar cuando la carrera lleva un rato sin aceptar una tecla. */
        .card-age { margin-left: auto; font: 600 8px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; letter-spacing: 0; color: var(--dim-2); }
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
        .stat b { display: block; font: 700 26px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: -.02em; font-variant-numeric: tabular-nums; color: var(--ink); text-shadow: 0 0 18px color-mix(in srgb, var(--acc) 28%, transparent); transition: color .25s ease, text-shadow .25s ease; }
        .stat b[data-good="1"] { color: var(--acc); text-shadow: 0 0 18px color-mix(in srgb, var(--acc) 50%, transparent); }
        .stat b[data-good="0"] { color: var(--warn); text-shadow: 0 0 18px color-mix(in srgb, var(--warn) 45%, transparent); }
        .stat b.bump { animation: nt-bump .32s cubic-bezier(.34, 1.4, .5, 1); }
        @keyframes nt-bump { 0% { transform: scale(1); } 35% { transform: scale(1.11); } 100% { transform: scale(1); } }
        .stat span { display: block; margin-top: 5px; font: 700 8px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .17em; text-transform: uppercase; color: var(--dim); }
        .sep { display: block; width: 1px; height: 34px; background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--acc) 25%, transparent), transparent); }

        .prog { position: relative; height: 4px; margin: 2px 2px 0; border-radius: 99px; background: rgba(255, 255, 255, .06); overflow: hidden; opacity: 0; transition: opacity .25s ease; }
        .panel[data-state="running"] .prog, .panel[data-state="paused"] .prog { opacity: 1; }
        .prog i { display: block; width: 0; height: 100%; border-radius: 99px; background: linear-gradient(90deg, color-mix(in srgb, var(--acc) 95%, transparent), color-mix(in srgb, var(--acc-2) 95%, transparent)); box-shadow: 0 0 10px color-mix(in srgb, var(--acc) 60%, transparent); transition: width .18s linear; }
        .season-card .season-prog { opacity: 1; margin: 0 2px 2px; }
        .season-card .season-name { margin: 1px 0 8px; font: 700 13px/1.25 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--ink-2); }
        .season-card.is-empty .season-name { color: var(--dim-2); }
        .season-card .season-alert { margin: 8px 2px 0; padding: 6px 8px; border-radius: 7px; font: 600 11px/1.35 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--warn, #ffcf6e); background: rgba(255, 190, 90, .08); border: 1px solid rgba(255, 190, 90, .28); }
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
          color: var(--acc-2); font: 600 8px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
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
        .row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 2.5px 0; font: 500 10.5px/1.45 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--dim); border-bottom: 1px solid rgba(255, 255, 255, .03); }
        .row:last-child { border-bottom: 0; }
        .row span { letter-spacing: .05em; }
        .row b { font: 600 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; color: var(--ink-2); }
        .row b[data-good="1"] { color: var(--acc); }
        .row b[data-good="0"] { color: var(--warn); }
        .recent-pair { display: inline-flex; align-items: baseline; }
        .recent-pair i { font-style: normal; }
        .recent-pair .recent-acc::before { content: '·'; margin: 0 5px; color: var(--dim-2); }
        .recent-pair i[data-good="1"] { color: var(--acc); }
        .recent-pair i[data-good="0"] { color: var(--warn); }
        .recent-pair i.bump { animation: nt-bump .32s cubic-bezier(.34, 1.4, .5, 1); }
        .row .num { width: 58px; flex: none; padding: 2px 5px; border-radius: 6px; border: 1px solid var(--line); background: rgba(0, 0, 0, .24); color: var(--ink-2); font: 600 10px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; text-align: right; color-scheme: dark; }
        .row .num:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; border-color: var(--acc); }
        .row .num::placeholder { color: var(--dim-2); }
        .row .num::-webkit-inner-spin-button, .row .num::-webkit-outer-spin-button { opacity: .35; }
        .row .cmp-select { flex: 1 1 auto; min-width: 0; max-width: 100%; padding: 3px 6px; border-radius: 6px; border: 1px solid var(--line); background: rgba(255, 255, 255, .04); color: var(--acc-2); font: 600 9.5px/1.4 ui-monospace, monospace; letter-spacing: 0; text-transform: none; color-scheme: dark; cursor: pointer; }
        .row .cmp-select:focus-visible { outline: 2px solid color-mix(in srgb, var(--acc) 70%, transparent); outline-offset: 1px; }
        .row .cmp-select option { background: #0b0f0d; color: var(--ink); }
        .cmp-row { gap: 8px; }
        .break-row { display: flex; }
        .panel[data-state="break"] .break-row b { color: var(--info); }
        .dq-row b { color: var(--warn); }
        .limit-row { cursor: pointer; }
        .limit-row b { color: var(--acc); }
        .limit-row:hover b { text-decoration: underline dotted; }
        .panel[data-limit="on"] .limit-row b { color: var(--acc); }
        .prev-row { cursor: pointer; }
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
        .hist-head { padding-bottom: 3px; font: 700 8px/1.4 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: var(--dim-2); }
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
        .hist-row .wpm .model { margin-left: 5px; font: 700 8px/1.4 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--dim-2); }
        .hist-row:first-child .wpm .model { color: var(--acc-2); }
        .hist-row .nitro-tag { margin-right: 4px; padding: 0 3px; border-radius: 3px; background: color-mix(in srgb, var(--acc) 18%, transparent); color: var(--acc); font-style: normal; font-size: 7.5px; letter-spacing: .06em; vertical-align: 1px; }
        .hist-row .place { color: var(--dim); }
        .hist-row .place[data-medal="1"] { color: #ffd166; }
        .hist-row .place[data-medal="2"] { color: #d7dee8; }
        .hist-row .place[data-medal="3"] { color: #e0a273; }
        .hist-row .xp { color: var(--acc-2); }
        .hist-empty { padding-top: 2px; font: italic 500 10px/1.4 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--dim-2); }
        .hist-foot { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; padding-top: 6px; border-top: 1px dashed color-mix(in srgb, var(--acc) 14%, transparent); font: 700 8.5px/1.4 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .13em; text-transform: uppercase; color: var(--dim); }
        .hist-foot b { font: 600 10px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; letter-spacing: 0; color: var(--acc-2); }

        /* ---------- listas del registro -------------------------------------- */
        .log-list { display: grid; gap: 4px; }
        .log-item { display: grid; grid-template-columns: 46px 1fr auto; gap: 7px; align-items: baseline; padding: 4px 6px; border-radius: 7px; background: rgba(255, 255, 255, .022); border: 1px solid rgba(255, 255, 255, .045); font-variant-numeric: tabular-nums; transition: border-color .2s ease, transform .18s ease; }
        .log-item:hover { border-color: var(--line-strong); transform: translateX(1px); }
        .log-item i { font: 600 9px/1.4 ui-monospace, monospace; color: var(--dim-2); font-style: normal; }
        .log-item span { font: 500 10px/1.35 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .log-item b { font: 600 10.5px/1.35 ui-monospace, monospace; color: var(--acc-2); }
        .log-item b[data-good="0"] { color: var(--warn); }
        .log-empty { font: italic 500 10px/1.4 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--dim-2); }
        .notice-item { display: grid; grid-template-columns: 44px 1fr; gap: 7px; padding: 3px 0; font: 500 10px/1.4 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--ink-2); border-bottom: 1px solid rgba(255, 255, 255, .03); }
        .notice-item:last-child { border-bottom: 0; }
        .notice-item i { font: 600 9px/1.4 ui-monospace, monospace; color: var(--dim-2); font-style: normal; }
        .notice-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* ---------- interruptores y ajustes --------------------------------- */
        .set-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 5px 0; border-bottom: 1px solid rgba(255, 255, 255, .03); }
        .set-row:last-child { border-bottom: 0; }
        .set-lbl { font: 600 10.5px/1.3 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .03em; color: var(--ink-2); }
        .set-lbl i { display: block; margin-top: 2px; font: 500 8.5px/1.25 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; font-style: normal; letter-spacing: .04em; color: var(--dim-2); }
        .set-val { display: inline-flex; align-items: center; gap: 8px; }
        .set-val b { font: 600 9px/1 ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase; color: var(--dim); }
        .set-val b[data-on="1"] { color: var(--acc); }
        .set-val b[data-state="on"] { color: var(--acc); }
        .set-val b[data-state="blocked"] { color: var(--warn); }
        .set-val b[data-state="ready"], .set-val b[data-state="waiting"] { color: var(--dim); }
        .set-val b[data-state="n/a"] { color: var(--warn); }
        .set-row.afk-health-row .set-val { min-width: 0; max-width: 58%; }
        .set-row.afk-health-row .set-val b { white-space: normal; text-align: right; line-height: 1.35; }
        .afk-health-reset { all: unset; flex: none; padding: 2px 5px; border-radius: 5px; cursor: pointer; color: var(--dim); border: 1px solid var(--line); font: 700 7.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
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
        .nitro-strategy { max-width: 100%; padding: 4px 6px; border-radius: 7px; cursor: pointer; color: var(--ink-2); background: rgba(0, 0, 0, .32); border: 1px solid var(--line); font: 700 8.5px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .03em; text-transform: uppercase; }
        .nitro-strategy:hover { color: var(--acc-2); border-color: var(--line-strong); }
        .nitro-strategy:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
        .nitro-strategy option { color: #111; background: #fff; }
        .row.nitro-delta-row b[data-good="1"] { color: var(--acc); }
        .row.nitro-delta-row b[data-good="0"] { color: var(--warn); }

        /* Interruptor tipo iOS con muelle: el muelle va en linear() y el
           cubic-bezier queda de repuesto para navegadores viejos. */
        .sw { all: unset; position: relative; flex: none; width: 34px; height: 18px; border-radius: 999px; cursor: pointer; background: rgba(255, 255, 255, .09); border: 1px solid rgba(255, 255, 255, .12); transition: background .25s ease, border-color .25s ease, box-shadow .25s ease; }
        .sw::after { content: ''; position: absolute; top: 1px; left: 1px; width: 14px; height: 14px; border-radius: 50%; background: linear-gradient(180deg, var(--ink), #b9cfc2); box-shadow: 0 1px 3px rgba(0, 0, 0, .5); transition: transform .32s cubic-bezier(.34, 1.4, .5, 1); transition: transform .32s linear(0, 0.3 14%, 0.84 30%, 1.07 46%, 1.02 60%, 0.998 74%, 1); }
        .sw[data-on="1"] { background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 90%, transparent), rgba(41, 196, 110, .85)); border-color: color-mix(in srgb, var(--acc) 55%, transparent); box-shadow: 0 0 14px -3px color-mix(in srgb, var(--acc) 80%, transparent), inset 0 0 8px -4px rgba(0, 0, 0, .6); }
        .sw[data-on="1"]::after { transform: translateX(16px); }
        .sw:hover { border-color: var(--line-strong); }
        .sw:active::after { width: 17px; }

        .seg { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; padding: 3px; border-radius: 9px; background: rgba(0, 0, 0, .32); border: 1px solid var(--line); }
        .seg-glide { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / 3); border-radius: 7px; background: var(--acc-dim); border: 1px solid var(--line-strong); box-shadow: inset 0 0 12px -6px var(--acc), 0 0 14px -8px var(--acc); transition: transform .32s cubic-bezier(.34, 1.4, .5, 1); transition: transform .32s linear(0, 0.3 14%, 0.84 30%, 1.07 46%, 1.02 60%, .998 74%, 1); }
        .seg[data-index="1"] .seg-glide { transform: translateX(100%); }
        .seg[data-index="2"] .seg-glide { transform: translateX(200%); }
        .seg-btn { all: unset; position: relative; z-index: 1; padding: 5px 0; text-align: center; border-radius: 7px; cursor: pointer; font: 700 9px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); transition: color .2s ease; }
        .seg-btn:hover { color: var(--acc-2); }
        .seg[data-index="0"] .seg-btn[data-pace="soft"], .seg[data-index="1"] .seg-btn[data-pace="balanced"], .seg[data-index="2"] .seg-btn[data-pace="fast"] { color: var(--acc); }

        .sld { -webkit-appearance: none; appearance: none; width: 100%; height: 22px; margin: 2px 0 0; background: transparent; cursor: pointer; }
        .sld::-webkit-slider-runnable-track { height: 4px; border-radius: 99px; background: linear-gradient(90deg, var(--acc) 0 var(--fill, 0%), rgba(255, 255, 255, .1) var(--fill, 0%) 100%); }
        .sld::-webkit-slider-thumb { -webkit-appearance: none; width: 13px; height: 13px; margin-top: -4.5px; border-radius: 50%; background: linear-gradient(180deg, #ffffff, var(--acc-2)); border: 1px solid color-mix(in srgb, var(--acc) 80%, transparent); box-shadow: 0 0 12px -2px color-mix(in srgb, var(--acc) 90%, transparent); transition: transform .16s cubic-bezier(.34, 1.5, .5, 1); }
        .sld:active::-webkit-slider-thumb { transform: scale(1.25); }
        .sld:focus-visible { outline: 2px solid var(--acc); outline-offset: 3px; border-radius: 99px; }
        .sld-ends { display: flex; justify-content: space-between; font: 600 8px/1.2 ui-monospace, monospace; letter-spacing: .08em; color: var(--dim-2); }

        .act { all: unset; flex: 1 1 0; padding: 6px 0; text-align: center; border-radius: 8px; cursor: pointer; font: 700 9px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); background: rgba(255, 255, 255, .045); border: 1px solid var(--line); transition: color .18s ease, background .18s ease, border-color .18s ease, transform .12s ease; }
        .act:hover { color: var(--acc); background: var(--acc-dim); border-color: var(--line-strong); }
        .act:active { transform: translateY(1px); }
        .act:disabled { opacity: .38; cursor: default; }
        .act[data-act="report"] { color: #ffe3b8; border-color: color-mix(in srgb, var(--warn) 26%, transparent); }
        .act[data-act="report"]:hover { color: #ffcf88; background: color-mix(in srgb, var(--warn) 12%, transparent); border-color: color-mix(in srgb, var(--warn) 45%, transparent); }
        .cfg-text { display: block; width: 100%; height: 46px; margin-top: 7px; padding: 6px 7px; resize: vertical; color: var(--ink); background: rgba(0, 0, 0, .35); border: 1px solid var(--line); border-radius: 8px; font: 500 9.5px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; transition: border-color .2s ease, box-shadow .2s ease; }
        .cfg-text:focus-visible { outline: none; border-color: var(--line-strong); box-shadow: 0 0 16px -8px var(--acc); }
        .cfg-note { margin-top: 6px; font: 500 9px/1.35 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--dim); }

        .keys { display: grid; gap: 3px; }
        .key-row { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: baseline; font: 500 10px/1.4 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--ink-2); }
        .key-row kbd { padding: 2px 6px; border-radius: 5px; font: 600 9px/1.2 ui-monospace, monospace; color: var(--acc); background: color-mix(in srgb, var(--acc) 10%, transparent); border: 1px solid color-mix(in srgb, var(--acc) 24%, transparent); white-space: nowrap; }
        .about { font: 500 10px/1.5 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--dim); }
        .about b { color: var(--acc-2); font-weight: 700; }

        /* ---------- barra de estado y acciones ------------------------------ */
        .foot { padding: 7px 11px 8px; border-top: 1px solid var(--line); background: linear-gradient(180deg, rgba(255, 255, 255, .012), rgba(0, 0, 0, .22)); }
        .status { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 26px; margin-bottom: 6px; font: 500 9.5px/1.35 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--dim); }
        .foot-bar { display: flex; align-items: center; flex-wrap: nowrap; min-width: 0; gap: 5px; overflow: hidden; white-space: nowrap; font: 600 8.5px/1 ui-monospace, monospace; font-variant-numeric: tabular-nums; letter-spacing: .05em; text-transform: uppercase; color: var(--dim-2); }
        .led { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--dim-2); box-shadow: 0 0 8px color-mix(in srgb, var(--dim-2) 50%, transparent); transition: background .25s ease, box-shadow .25s ease; }
        .panel[data-state="running"] .led { background: var(--acc); box-shadow: 0 0 10px var(--acc); animation: nt-pulse 1.9s ease-in-out infinite; }
        .panel[data-state="paused"] .led { background: var(--warn); box-shadow: 0 0 10px var(--warn); }
        .panel[data-state="break"] .led { background: var(--info); box-shadow: 0 0 10px var(--info); }
        .foot-bar b { color: #cfe6d8; font-weight: 700; }
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
        .panel[data-stopped="1"][data-mode="auto"] .foot-bar b[data-field="footState"] { color: #ffcf7a; }
        .panel[data-stopped="1"][data-mode="auto"] .card-s[data-field="liveTag"] { color: var(--warn); }

        /* Mini-grafica de model Δ: la linea de puntos es el cero; el area y la
           linea usan el acento del tema y no necesitan ningun canvas. */
        .spark { display: block; width: calc(100% - 22px); height: 24px; margin: 0 11px 6px; overflow: visible; }
        .spark-line { fill: none; stroke: var(--acc); stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; transition: opacity .2s ease; }
        .spark-area { fill: color-mix(in srgb, var(--acc) 16%, transparent); stroke: none; }
        .spark-zero { stroke: color-mix(in srgb, var(--acc) 22%, transparent); stroke-width: .6; stroke-dasharray: 2 3; }
        .spark[data-empty="1"] { display: none; }

        .actions { display: flex; gap: 6px; padding: 0 11px 11px; }
        .toggle { all: unset; flex: 1 1 auto; padding: 9px 0; text-align: center; border-radius: 9px; cursor: pointer; font: 800 9.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: var(--ink); background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 22%, transparent), color-mix(in srgb, var(--acc) 10%, transparent)); border: 1px solid color-mix(in srgb, var(--acc) 34%, transparent); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .1); transition: filter .15s ease, transform .1s ease, box-shadow .25s ease; }
        .toggle:hover { filter: brightness(1.16); box-shadow: 0 0 20px -8px var(--acc), inset 0 1px 0 rgba(255, 255, 255, .12); }
        .toggle:active { transform: translateY(1px); }
        .panel[data-state="paused"] .toggle { color: var(--ink); background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 30%, transparent), color-mix(in srgb, var(--acc) 14%, transparent)); border-color: color-mix(in srgb, var(--acc) 50%, transparent); }
        .stop { all: unset; flex: none; display: grid; place-items: center; padding: 9px 14px; border-radius: 9px; cursor: pointer; font: 800 9.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #ffd0d0; background: linear-gradient(180deg, color-mix(in srgb, var(--bad) 18%, transparent), color-mix(in srgb, var(--bad) 8%, transparent)); border: 1px solid color-mix(in srgb, var(--bad) 32%, transparent); transition: filter .15s ease, transform .1s ease, color .2s ease, background .2s ease, border-color .2s ease; }
        .stop:hover { filter: brightness(1.16); box-shadow: 0 0 20px -9px var(--bad); }
        .stop:active { transform: translateY(1px); }
        .stop[data-pending="true"] { color: #ffe6b8; background: linear-gradient(180deg, color-mix(in srgb, var(--warn) 24%, transparent), color-mix(in srgb, var(--warn) 12%, transparent)); border-color: color-mix(in srgb, var(--warn) 42%, transparent); }
        /* Parado no hay nada que parar: el boton se apaga en vez de cerrar una
           tanda ya cerrada. */
        .stop:disabled { opacity: .42; cursor: default; }
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
          font-family: ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif;
        }
        .head { gap: 7px; padding: 10px 11px 8px; }
        .mark { width: 27px; height: 27px; border-radius: 8px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .08); }
        .mark svg { width: 19px; height: 19px; filter: none; }
        .title { font-size: 13px; letter-spacing: .1em; text-shadow: none; }
        .sub { margin-top: 3px; font-size: 8px; letter-spacing: .08em; color: var(--dim); }
        .chips-row { flex-wrap: wrap; row-gap: 5px; padding: 0 11px 9px; }
        .pace, .mode, .cap { padding: 4px 7px; border-radius: 6px; font-size: 8px; letter-spacing: .08em; }
        .cap { flex: 0 1 auto; }

        .main { border-top-color: var(--line); }
        .rail { padding: 8px 5px; background: transparent; }
        .rail-glide { left: 5px; top: 8px; width: 30px; height: 30px; border-radius: 7px; background: var(--acc-dim); box-shadow: none; }
        .rail-btn { width: 30px; height: 30px; border-radius: 7px; }
        .views { padding: 10px 11px 11px; }
        .view-head { align-items: center; margin-bottom: 9px; padding-bottom: 7px; border-bottom-color: var(--line); }
        .view-head span { gap: 6px; font-size: 8px; letter-spacing: .13em; color: var(--dim); }
        .view-head span::before { width: 5px; height: 5px; border-radius: 2px; box-shadow: none; }
        .view-head b { font-size: 8px; color: var(--dim-2); }

        .card { margin-bottom: 8px; padding: 10px; border-radius: 9px; background: var(--card); border-color: var(--line); transition: none; }
        .card:hover { border-color: var(--line); box-shadow: none; }
        .card::before, .card > .ghost { display: none; }
        .card-h { align-items: center; margin-bottom: 7px; }
        .card-t { font-size: 9px; letter-spacing: .13em; color: var(--ink-2); }
        .card-s { font-size: 8px; color: var(--dim); }
        .hero { padding: 10px 0 9px; }
        .stat b { font-size: 28px; text-shadow: none; }
        .stat b[data-good="1"] { text-shadow: none; }
        .stat b[data-good="0"] { text-shadow: none; }
        .stat span { margin-top: 5px; font-size: 7.5px; letter-spacing: .13em; color: var(--dim); }
        .auto-pace { margin-top: 3px; padding: 3px 7px; border-color: var(--line); background: transparent; color: var(--dim); font-size: 7.5px; letter-spacing: .05em; }
        .auto-pace::before { width: 4px; height: 4px; box-shadow: none; }

        /* Las metricas de Live y Season se leen como una cuadricula, no como
           una lista larga: dos columnas, etiqueta arriba y valor debajo. */
        .v-stats .live-card .rows,
        .v-stats .season-card .rows { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; margin-top: 8px; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; background: var(--line); }
        .v-stats .season-card .rows { grid-template-columns: .9fr 1.1fr; }
        .v-stats .live-card .rows .row,
        .v-stats .season-card .rows .row { display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; gap: 2px; min-width: 0; padding: 7px 8px; border: 0; background: rgba(0, 0, 0, .16); }
        .v-stats .live-card .rows .row > span,
        .v-stats .season-card .rows .row > span { font-size: 7.5px; letter-spacing: .08em; color: var(--dim-2); }
        .v-stats .live-card .rows .row b,
        .v-stats .season-card .rows .row b { width: 100%; text-align: left; white-space: normal; overflow-wrap: anywhere; font-size: 10.5px; line-height: 1.3; color: var(--ink-2); }
        .v-stats .live-card .rows .result-row { grid-column: 1 / -1; }
        .v-stats .season-card .rows .row b { font-size: 9.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .v-stats .live-card .rows .row.secondary { display: none; }

        /* ---------- cuenta ------------------------------------------------- */
        /* La vista Live ya no solo dice el target: ensena la cuenta que se leyo,
           el historico usado y cuando fue la ultima lectura. */
        .account-card .acct-top { display: flex; align-items: center; justify-content: space-between; gap: 7px; margin: -1px 0 6px; }
        .account-card .acct-id { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 700 10px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--acc-2); }
        .account-card .acct-refresh { flex: 0 0 auto; padding: 4px 8px; font-size: 8px; }
        .account-card .acct-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; overflow: hidden; border: 1px solid var(--line); border-radius: 7px; background: var(--line); }
        .account-card .acct-metrics > div { min-width: 0; padding: 6px 7px; background: rgba(0, 0, 0, .16); }
        .account-card .acct-metrics b { display: block; font: 700 15px/1.1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; color: var(--ink); }
        .account-card .acct-metrics span { display: block; margin-top: 2px; font: 700 7px/1.2 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .1em; text-transform: uppercase; color: var(--dim-2); }
        .account-card .rows { margin-top: 7px; }
        .account-card .acct-state { font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        .account-card .acct-state[data-state="ready"] { color: var(--acc); }
        .account-card .acct-state[data-state="reading"] { color: var(--info); }
        .account-card .acct-state[data-state="warn"] { color: var(--warn); }
        .account-card .acct-state[data-state="idle"] { color: var(--dim-2); }
        .season-card .season-name { margin: 1px 0 7px; font-size: 13px; }
        .season-card .season-actions { margin-top: 7px; }
        .season-card .season-actions .act { font-size: 8px; padding: 5px 9px; }
        .update-card .season-actions .act { flex: 0 1 auto; }

        .foot { padding: 7px 11px 8px; background: transparent; }
        .status { min-height: 0; margin-bottom: 6px; font-size: 9px; color: var(--dim); }
        .foot-bar { font-size: 8px; letter-spacing: .03em; }
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
        .theme span { text-align: center; font: 700 7.5px/1 ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--dim-2); }
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

        /* ---------- plegado -------------------------------------------------- */
        /* Plegado: cabecera con el LED y el nombre, y los tres botones. Todo lo
           demas fuera, que para eso esta el boton. */
        .panel[data-collapsed="true"] { width: auto; min-width: 210px; }
        .panel[data-collapsed="true"] .main,
        .panel[data-collapsed="true"] .foot,
        .panel[data-collapsed="true"] .chips-row { display: none; }
        .panel[data-collapsed="true"] .head { padding-bottom: 9px; }
        .panel[data-collapsed="true"] .actions { padding-top: 0; }

        /* ---------- lectura y jerarquia ------------------------------------- */
        /* Ultima pasada: superficies mas limpias, mas aire entre bloques y una
           cabecera de seccion que acompana al recorrer TUNE. No cambia el
           marcado ni los controles; solo la piel que los contiene. */

        .panel {
          width: 336px;
          border-radius: 14px;
          background:
            radial-gradient(130% 76% at 50% -20%, color-mix(in srgb, var(--acc) 9%, transparent), transparent 64%),
            linear-gradient(180deg, var(--bg-hi), var(--bg-lo));
        }

        .head { gap: 9px; padding: 12px 13px 9px; }
        .head::after { left: 13px; right: 13px; background: linear-gradient(90deg, transparent, var(--line-strong), transparent); }
        .mark { width: 29px; height: 29px; border-radius: 9px; }
        .title { font-size: 13.5px; letter-spacing: .11em; }
        .sub { margin-top: 4px; font-size: 8.5px; letter-spacing: .09em; color: var(--dim); }
        .chips-row { gap: 5px; padding: 0 13px 10px; }
        .pace, .mode, .cap { display: inline-flex; align-items: center; height: 21px; padding: 0 9px; border-radius: 999px; font-size: 8px; letter-spacing: .07em; }

        .views { padding: 12px 13px 13px; }
        .view-head { margin-bottom: 10px; padding-bottom: 8px; }
        .view-head span { font-size: 8px; letter-spacing: .16em; }
        .view-head b { font-size: 8px; }

        .card {
          padding: 11px 12px 12px;
          border-radius: 11px;
          border-color: var(--line);
          background: linear-gradient(180deg, rgba(255, 255, 255, .048), rgba(255, 255, 255, .016));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, .04);
        }
        .card-h { margin-bottom: 9px; }
        .card-t { font-size: 9px; letter-spacing: .16em; }
        .card-s { font-size: 8.5px; }

        /* Marcador: un panel interior muy tenue separa los dos numeros del
           resto de la tarjeta sin competir con ellos. */
        .v-stats .live-card .hero {
          margin: 0 -2px 2px;
          padding: 13px 4px 12px;
          border: 1px solid var(--line);
          border-radius: 9px;
          background:
            radial-gradient(120% 130% at 50% 0%, color-mix(in srgb, var(--acc) 7%, transparent), transparent 72%),
            rgba(0, 0, 0, .14);
        }
        .stat b { font-size: 30px; }
        .stat span { margin-top: 6px; font-size: 8px; letter-spacing: .14em; }
        .sep { height: 38px; }
        .auto-pace { margin-top: 8px; }
        .v-stats .live-card .spark { width: calc(100% - 4px); margin: 0 2px 8px; }

        /* Cuadricula de metricas: mas aire y la sesion junto al watchdog, que
           es la pareja que se mira durante una carrera. */
        .v-stats .live-card .rows .row,
        .v-stats .season-card .rows .row { padding: 8px 9px; }
        .v-stats .live-card .rows .row > span,
        .v-stats .season-card .rows .row > span { font-size: 8px; letter-spacing: .07em; }

        .account-card .acct-top { margin-bottom: 8px; }
        .account-card .acct-metrics b { font-size: 16px; }
        .account-card .acct-metrics span { font-size: 7.5px; }
        .season-card .season-name { font-size: 14px; }
        .hist-row:nth-child(even) { background: rgba(255, 255, 255, .018); }

        /* TUNE: la cabecera de cada bloque se queda arriba mientras se recorre
           su contenido. El filtro sigue siendo lo primero y no se pega. */
        .tune-sec { margin-bottom: 13px; }
        .v-tune .tune-sec-h {
          position: sticky;
          top: 0;
          z-index: 2;
          margin: 0 -2px 8px;
          padding: 8px 2px 7px;
          background: linear-gradient(180deg, var(--bg-hi) 80%, color-mix(in srgb, var(--bg-hi) 90%, transparent));
          box-shadow: 0 8px 12px -12px rgba(0, 0, 0, .9);
        }
        .v-tune .tune-sec-h span { font-size: 8.5px; letter-spacing: .16em; }
        .v-tune .tune-sec-h b { font-size: 8px; }
        .tune-filter { margin-bottom: 10px; }

        .theme { padding: 6px; border-radius: 9px; }
        .theme i { height: 18px; border-radius: 6px; }
        .theme span { font-size: 8px; letter-spacing: .1em; }

        /* Las filas de acciones se reparten en tres columnas: con siete botones
           el flex anterior empujaba "versions" fuera de la tarjeta. */
        .btn-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
        .btn-row .act { padding: 7px 4px; }
        .btn-row .act[data-act="channel"] { grid-column: 1 / -1; }

        .views::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--acc) 14%, transparent); }
        .views::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--acc) 26%, transparent); }
        .v-stats .live-card .rows .watch-row b { font-size: 9.5px; }
        .spark-area { fill: color-mix(in srgb, var(--acc) 10%, transparent); }

        .foot { padding: 9px 13px 10px; background: linear-gradient(180deg, rgba(255, 255, 255, .014), rgba(0, 0, 0, .2)); }
        .status { font-size: 9.5px; }
        .actions { padding: 0 13px 12px; }
        .act { padding: 7px 0; font-size: 8.5px; }
        .toggle { padding: 10px 0; letter-spacing: .14em; }

        /* En una ventana estrecha la cuenta ocupa el sitio del nombre. Se
           retira antes de que el titulo empiece a cortarse. */
        @media (max-width: 340px) {
          .who { display: none; }
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
          .panel .dot, .panel .led, .theme i.sw-rgb, .panel[data-theme="rgb"] .title { animation: none !important; }
          /* El ciclo de tono no mueve nada: es color, no adorno. Se conserva
             para que RGB siga cambiando aunque el sistema pida menos animacion;
             el marco conico y el titulo si se quedan quietos. */
          .panel[data-theme="rgb"] { animation: nt-rgb-hue 16s linear infinite !important; }
        }
      </style>
      <div class="panel" role="region" aria-label="Nitro Wraith control panel" data-state="waiting" data-mode="auto" data-pace="legit" data-cfg="0" data-collapsed="false" data-tab="stats" data-fresh="1" data-theme="carbon">
        <div class="head">
          <span class="mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="14" stroke-opacity=".22"/><path d="M6.5 9.5 11 23l5-9 5 9 4.5-13.5"/></svg>
            <i class="dot"></i>
          </span>
          <span class="brand">
            <b class="title" data-field="title">NITRO WRAITH</b>
            <span class="sub">human pace · <b data-field="ver">v7.0.0</b></span>
          </span>
          <a class="ghlink" href="${UPDATE_GITHUB_URL}" target="_blank" rel="noopener noreferrer" hidden title="Download the latest NITRO WRAITH userscript from GitHub" aria-label="Download the latest NITRO WRAITH userscript from GitHub">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M8 11l4 4 4-4M5 20h14"/></svg><span>Update</span>
          </a>
          <button class="iconbtn collapse" type="button" data-act="expand" aria-label="Collapse panel" aria-expanded="true" title="Collapse / expand the panel">−</button>
        </div>
        <div class="chips-row">
          <button class="pace" type="button">LEGIT · balanced</button>
          <span class="mode" role="status" aria-live="polite" title="Always AUTO: the bot starts by itself. Stop stops it; it comes back on the next garage visit.">AUTO</span>
          <span class="cap" data-field="cap" title="Hard ceiling: no race is ever allowed above this WPM">≤ 120 wpm</span>
        </div>
        <div class="race-line" aria-hidden="true"><i></i></div>
        <div class="main">
          <div class="rail" data-index="0" role="tablist" aria-label="Panel views">
            <i class="rail-glide"></i>
            <button class="rail-btn" type="button" role="tab" aria-selected="true" aria-controls="nt-view-stats" aria-label="Live" data-tab-btn="stats" data-label="Live">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17a9 9 0 1 1 18 0"/><path d="M12 13l4-3"/><circle cx="12" cy="13" r="1.4" fill="currentColor" stroke="none"/></svg>
            </button>
            <button class="rail-btn" type="button" role="tab" aria-selected="false" aria-controls="nt-view-tune" aria-label="Tune" data-tab-btn="tune" data-label="Tune" tabindex="-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h9M17 6h3M4 18h3M11 18h9M4 12h13M20 12h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="18" r="2"/><circle cx="18" cy="12" r="2"/></svg>
            </button>
            <button class="rail-btn" type="button" role="tab" aria-selected="false" aria-controls="nt-view-log" aria-label="Log" data-tab-btn="log" data-label="Log" tabindex="-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h11M8 12h11M8 18h11"/><circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none"/></svg>
            </button>
            <button class="rail-btn" type="button" role="tab" aria-selected="false" aria-controls="nt-view-info" aria-label="Info" data-tab-btn="info" data-label="Info" tabindex="-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none"/></svg>
            </button>
          </div>
          <div class="views">
            <!-- ------------------------------ STATS ------------------------- -->
            <section class="view v-stats" id="nt-view-stats" role="tabpanel" aria-label="Live">
              <div class="view-head"><span>Live</span><b>race telemetry</b></div>
              <div class="card live-card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 17a9 9 0 1 1 18 0"/><path d="M12 13l4-3"/></svg></span>
                <div class="card-h"><span class="card-t">Live</span><span class="card-s" data-field="liveTag">waiting</span><span class="card-age" data-field="liveAge" title="Data age: seconds since the game accepted the last key. Refreshed four times per second; amber means the race has gone quiet.">—</span></div>
                <div class="hero">
                  <div class="stat"><b data-field="live">—</b><span>live wpm</span></div>
                  <i class="sep"></i>
                  <div class="stat"><b data-field="acc">—</b><span>accuracy</span></div>
                </div>
                <div class="auto-pace" data-field="paceSource">auto · reading account</div>
                <div class="prog"><i data-field="progfill"></i></div>
                <svg class="spark" data-field="accSpark" viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label="Accuracy model delta history: no samples yet.">
                  <line class="spark-zero" x1="0" y1="12" x2="100" y2="12"></line>
                  <path class="spark-area" data-field="accSparkArea" d=""></path>
                  <polyline class="spark-line" data-field="accSparkLine" points=""></polyline>
                </svg>
                <div class="rows">
                  <div class="row"><span>target</span><b data-field="target">—</b></div>
                  <div class="row" title="Recent pace and accuracy: WPM and accuracy over the last 6 seconds of accepted keys, independent of the session averages"><span>recent</span><b class="recent-pair"><i data-field="liveNow">—</i><i class="recent-acc" data-field="liveNowAcc">—</i></b></div>
                  <div class="row race-row secondary" title="Race progress"><span>race</span><b data-field="progress">—</b></div>
                  <div class="row"><span>races</span><b data-field="races">0</b></div>
                  <div class="row day-xp-row" title="XP the game awarded today, read from the same daily summary as the 7-day card"><span>today</span><b data-field="dayXp">—</b></div>
                  <div class="row tanda-row" title="Average of every measured race in this session, not just the ones in the list"><span>session</span><b data-field="tanda">—</b></div>
                  <div class="row watch-row" title="Real-time race watchdog: phase, which tab holds the typing lease and how long the game has gone without accepting a key"><span>watch</span><b data-field="watch">—</b></div>
                  <div class="row secondary" title="Which WPM calibration sample is active"><span>set</span><b data-field="session">—</b></div>
                  <div class="row rate-row secondary" title="XP per hour at the current session pace"><span>rate</span><b data-field="rate">—</b></div>
                  <div class="row nitro-row secondary" title="Nitro this session: races that used it, characters the game typed for you and the time they would have taken at the planned pace"><span>nitro</span><b data-field="nitro">—</b></div>
                  <div class="row nitro-delta-row secondary" title="Nitro WPM check: races with nitro minus races without it, over the last 10 measured races. Zero or below means the nitro is not lifting the average; positive is a warning"><span>nitro Δ</span><b data-field="nitroDelta">—</b></div>
                  <div class="row cycle-row secondary" title="Dead time between races: median and best gap from the end of one race to the first key of the next"><span>cycle</span><b data-field="cycle">—</b></div>
                  <div class="row xp-break-row secondary" title="Last race XP split into place, speed, accuracy and session or other bonuses"><span>xp/race</span><b data-field="xpBreak">—</b></div>
                  <div class="row session-row" style="display:none" title="Site session token: time left before it expires. The queue renews it on the garage, between races"><span>login</span><b data-field="sessionLeft">—</b></div>
                  <div class="row trim-row" style="display:none"><span>trim</span><b data-field="trim">—</b></div>
                  <div class="row hud-row" style="display:none" title="The WPM Nitro Type itself is printing right now, next to the hard ceiling"><span>game</span><b data-field="hud">—</b></div>
                  <div class="row result-row" style="display:none" title="Place and prize of the last race, read from the game's own race result"><span>result</span><b data-field="result">—</b></div>
                  <div class="row clock-row" style="display:none" title="The precise clock could not start (the site's CSP blocked the Worker). In a background tab the browser slows page timers down and typing can stall long enough for a disqualification."><span>clock</span><b data-field="clock">page</b></div>
                  <div class="row guard-row" style="display:none" title="Why the bot is waiting: a guard break, duplicate copies of the script or a site block"><span>guard</span><b data-field="guard">—</b></div>
                  <div class="row box-row" style="display:none" title="Daily Mystery Box in the garage"><span>box</span><b data-field="box">—</b></div>
                  <div class="row break-row secondary"><span>break</span><b data-field="break">—</b></div>
                  <div class="row dq-row" style="display:none"><span>dq streak</span><b data-field="dq">×0</b></div>
                </div>
              </div>
              <div class="card account-card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0M4 4h3M4 4v3M20 4h-3M20 4v3"/></svg></span>
                <div class="card-h"><span class="card-t">Account</span><span class="card-s acct-state" data-field="acctState" data-state="idle" role="status" aria-live="polite">waiting</span></div>
                <div class="acct-top">
                  <b class="acct-id" data-field="acctId">—</b>
                  <button class="act acct-refresh" type="button" data-field="acctRefresh" title="Read the signed-in account now: profile and full monthly history">refresh</button>
                </div>
                <div class="acct-metrics">
                  <div><b data-field="acctAvg">—</b><span>avg</span></div>
                  <div><b data-field="acctTarget">—</b><span>live</span></div>
                  <div><b data-field="acctAcc">—</b><span>acc</span></div>
                </div>
                <div class="rows">
                  <div class="row"><span>history</span><b data-field="acctHistory">—</b></div>
                  <div class="row"><span>range</span><b data-field="acctRange">—</b></div>
                  <div class="row"><span>read</span><b data-field="acctRead">never</b></div>
                </div>
              </div>
              <div class="card season-card" data-field="seasonCard">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 4h10v3a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 12v5M8 21h8"/></svg></span>
                <div class="card-h"><span class="card-t">Season</span><span class="card-s" data-field="seasonTag">no snapshot</span></div>
                <div class="season-name" data-field="seasonName">Season</div>
                <div class="prog season-prog"><i data-field="seasonFill"></i></div>
                <div class="rows">
                  <div class="row"><span>tier</span><b data-field="seasonTier">—</b></div>
                  <div class="row"><span>xp</span><b data-field="seasonXp">—</b></div>
                  <div class="row"><span>to next</span><b data-field="seasonNext">—</b></div>
                  <div class="row" title="How many races the next reward needs at the XP per race of the last races"><span>races</span><b data-field="seasonRaces">—</b></div>
                  <div class="row season-pace-row" title="XP per active day over the last week, projected to the season end at that pace"><span>pace</span><b data-field="seasonPace">—</b></div>
                  <div class="row"><span>ends</span><b data-field="seasonEnds">—</b></div>
                </div>
                <div class="season-alert" data-field="seasonAlert" role="status" style="display:none"></div>
                <div class="season-actions">
                  <button class="act" type="button" data-act="season" data-field="seasonOpen" title="Open Nitro Type's Season page; the script captures the tier and XP for this card">open season</button>
                </div>
                <div class="cfg-note" data-field="seasonNote">Open Season once to capture the tier and XP.</div>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg></span>
                <div class="card-h"><span class="card-t">Last 10 races</span><span class="card-s">place · xp · wpm</span></div>
                <div class="hist">
                  <div class="hist-head"><span>time</span><span>place</span><span>xp</span><span>wpm</span><span>dev</span></div>
                  <div data-field="history"></div>
                  <div class="hist-foot" data-field="foot" style="display:none">
                    <span>avg <b data-field="avg">—</b></span>
                    <span>best <b data-field="best">—</b></span>
                  </div>
                </div>
              </div>
            </section>

            <!-- Las vistas que no estan activas se montan al abrirlas. Asi el
                 primer segundo solo cuesta la vista Live, no las cuatro. -->
            <template data-view="tune">
            <section class="view v-tune cfg" id="nt-view-tune" role="tabpanel" aria-label="Tune">
              <div class="view-head"><span>Tune</span><b>rhythm · limits · automation</b></div>
              <div class="tune-filter">
                <label class="tune-search" title="Filter settings by name, section or description">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
                  <input type="search" data-field="tuneSearch" placeholder="Filter settings…" autocomplete="off" spellcheck="false" aria-label="Filter settings by name, section or description">
                  <button class="tune-clear" type="button" data-field="tuneClear" aria-label="Clear settings filter" title="Clear filter" hidden>×</button>
                </label>
                <span class="tune-count" data-field="tuneCount" aria-live="polite">settings</span>
              </div>
              <div class="tune-empty" data-field="tuneEmpty" role="status" hidden></div>
              <div class="tune-sec" role="group" aria-labelledby="tune-health-label">
                <div class="tune-sec-h"><span id="tune-health-label">Health</span><b>account · AFK · update</b></div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 12h4l2-5 4 10 2-5h6"/><path d="M4 20h16"/></svg></span>
                  <div class="card-h"><span class="card-t">Health center</span><span class="card-s" data-field="healthSummary">checking</span></div>
                  <div class="rows">
                    <div class="row" title="Account calibration source and freshness"><span>account</span><b data-field="healthAccount">—</b></div>
                    <div class="row" title="AFK farming, keep-alive and the strict interlock; the same values as the AFK rows below"><span>AFK gate</span><b data-field="healthAfk">—</b></div>
                    <div class="row" title="Last update check result and age"><span>update</span><b data-field="healthUpdate">—</b></div>
                    <div class="row" title="Page Lifecycle freezes recorded in this browser"><span>freezes</span><b data-field="healthFreeze">—</b></div>
                  </div>
                  <div class="cfg-note" data-field="healthNote">One place to see what needs attention.</div>
                  <button class="act" type="button" data-act="report" title="Copy the full diagnostic report, including the recent flight recorder, to paste when something is off">copy report</button>
                  <button class="act" type="button" data-act="support" title="Copy a redacted support bundle: version, environment, flight recorder and state, with tokens, account names and identifiers removed">support</button>
                </div>
              </div>
              <div class="tune-sec" role="group" aria-labelledby="tune-rhythm-label">
                <div class="tune-sec-h"><span id="tune-rhythm-label">Rhythm</span><b>pace and calibration</b></div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6h9M17 6h3M4 18h3M11 18h9"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="18" r="2"/></svg></span>
                  <div class="card-h"><span class="card-t">Pace</span><span class="card-s">all under the ceiling</span></div>
                  <div class="seg" data-index="1">
                    <i class="seg-glide"></i>
                    <button class="seg-btn" type="button" data-pace="soft" title="A little below the account average, for an easier session">soft</button>
                    <button class="seg-btn" type="button" data-pace="balanced" title="The account's own average and calibrated range">balanced</button>
                    <button class="seg-btn" type="button" data-pace="fast" title="A little above the account average, still under the ceiling">fast</button>
                  </div>
                  <div class="rows">
                    <div class="row"><span>ceiling</span><b data-field="tuneCap">≤ 120 wpm</b></div>
                    <div class="row"><span>range</span><b data-field="tuneRange">—</b></div>
                    <div class="row cal-row" data-field="calRow" title="Always automatic: reads the account average from the site profile and the stats API, and centres the balanced range on it. Click to refresh now."><span>auto</span><b data-field="cal">on</b></div>
                    <div class="row"><span>calibrated</span><b data-field="calWpm">—</b></div>
                    <div class="row"><span>accuracy</span><b data-field="calAcc">—</b></div>
                    <div class="row"><span>account</span><b data-field="calAccount">—</b></div>
                    <div class="row custom-row" title="Manual WPM target. Leave empty or 0 for automatic calibration. A manual value overrides the account average and the top-based recovery floor."><span>custom wpm</span><input class="num" type="number" inputmode="numeric" min="15" max="119" step="1" placeholder="auto" data-field="customWpm" aria-label="Custom WPM target; empty or 0 uses automatic calibration"></div>
                    <div class="row custom-row" title="Manual accuracy target from 96% to 100%. Leave empty or 0 for automatic calibration. Below 96% the game pays no accuracy bonus."><span>custom acc</span><input class="num" type="number" inputmode="numeric" min="96" max="100" step="1" placeholder="auto" data-field="customAcc" aria-label="Custom accuracy target; empty or 0 uses automatic calibration"></div>
                    <div class="cfg-note">Custom values override auto. Empty or 0 returns to automatic.</div>
                  </div>
                </div>
              </div>
              <div class="tune-sec" role="group" aria-labelledby="tune-limits-label">
                <div class="tune-sec-h"><span id="tune-limits-label">Limits</span><b>session, day and hours</b></div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8h16M4 16h16"/><circle cx="9" cy="8" r="2"/><circle cx="15" cy="16" r="2"/></svg></span>
                  <div class="card-h"><span class="card-t">Session limit</span><span class="card-s">the bot stops on its own</span></div>
                  <div class="limit-row row" data-field="raceLimitRow" title="Click: races per session (free, 25, 50, 100). 25 is where the session bonus reaches its 250 XP per race cap">
                    <span>races</span><b data-field="limit">free</b>
                  </div>
                  <input class="sld" type="range" min="0" max="3" step="1" value="0" data-field="limitSlider" aria-label="Races per session" title="Races per session: free, 25, 50 or 100">
                  <div class="sld-ends"><span>free</span><span>25</span><span>50</span><span>100</span></div>
                  <div class="limit-row row time-row" data-field="timeLimitRow" title="Click: minutes per session (free, 15, 30, 60, 120). The clock starts with the first race of the session">
                    <span>time</span><b data-field="timeLimit">free</b>
                  </div>
                  <input class="sld" type="range" min="0" max="4" step="1" value="0" data-field="timeSlider" aria-label="Minutes per session" title="Minutes per session: free, 15, 30, 60 or 120">
                  <div class="sld-ends"><span>free</span><span>15m</span><span>30m</span><span>1h</span><span>2h</span></div>
                  <div class="limit-row row xp-row" data-field="xpLimitRow" title="Click: XP per session (free, 5k, 10k, 25k, 50k). Counts the XP the game itself awards in each race">
                    <span>xp</span><b data-field="xpLimit">free</b>
                  </div>
                  <input class="sld" type="range" min="0" max="4" step="1" value="0" data-field="xpSlider" aria-label="XP per session" title="XP per session: free, 5k, 10k, 25k or 50k">
                  <div class="sld-ends"><span>free</span><span>5k</span><span>10k</span><span>25k</span><span>50k</span></div>
                  <div class="rows">
                    <div class="row"><span>left</span><b data-field="etaLeft">—</b></div>
                    <div class="row time-left-row" data-field="timeLeftRow" style="display:none"><span>time left</span><b data-field="timeLeft">—</b></div>
                    <div class="row xp-left-row" data-field="xpRow" style="display:none"><span>xp</span><b data-field="xpTotal">—</b></div>
                  </div>
                </div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 18V6M4 18h16"/><path d="M8 14v-3M12 14V7M16 14v-5"/></svg></span>
                  <div class="card-h"><span class="card-t">Daily budget</span><span class="card-s">stop before tomorrow</span></div>
                  <div class="limit-row row" data-field="dailyRaceRow" title="Click: races per day (free, 100, 200, 300). Counts the races the game recorded today">
                    <span>races/day</span><b data-field="dailyRaces">free</b>
                  </div>
                  <input class="sld" type="range" min="0" max="3" step="1" value="0" data-field="dailyRaceSlider" aria-label="Races per day" title="Races per day: free, 100, 200 or 300">
                  <div class="sld-ends"><span>free</span><span>100</span><span>200</span><span>300</span></div>
                  <div class="limit-row row xp-row" data-field="dailyXpRow" title="Click: XP per day (free, 50k, 100k, 200k). Counts the XP the game paid today">
                    <span>xp/day</span><b data-field="dailyXp">free</b>
                  </div>
                  <input class="sld" type="range" min="0" max="3" step="1" value="0" data-field="dailyXpSlider" aria-label="XP per day" title="XP per day: free, 50k, 100k or 200k">
                  <div class="sld-ends"><span>free</span><span>50k</span><span>100k</span><span>200k</span></div>
                  <div class="rows">
                    <div class="row" data-field="dailyLeftRow" title="Budget left today; both counters reset at midnight"><span>left</span><b data-field="dailyLeft">—</b></div>
                  </div>
                </div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg></span>
                  <div class="card-h"><span class="card-t">Active hours</span><span class="card-s">races only in this window</span></div>
                  <div class="limit-row row" data-field="activeRow" title="Click: turn the active window on/off. Shift+click resets 08:00–23:00">
                    <span>window</span><b data-field="activeState">off</b>
                  </div>
                  <div class="limit-row row" data-field="activeStartRow" title="Click: start hour +1 (Shift+click: −1). The window can cross midnight">
                    <span>from</span><b data-field="activeStart">08:00</b>
                  </div>
                  <input class="sld" type="range" min="0" max="23" step="1" value="8" data-field="activeStartSlider" aria-label="Active window start hour" title="Start of the active window">
                  <div class="sld-ends"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
                  <div class="limit-row row" data-field="activeEndRow" title="Click: end hour +1 (Shift+click: −1). An end before the start crosses midnight">
                    <span>to</span><b data-field="activeEnd">23:00</b>
                  </div>
                  <input class="sld" type="range" min="0" max="23" step="1" value="23" data-field="activeEndSlider" aria-label="Active window end hour" title="End of the active window">
                  <div class="sld-ends"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
                  <div class="rows">
                    <div class="row" data-field="activeNowRow" title="Local time. Races only start while the window is open"><span>now</span><b data-field="activeNow">always</b></div>
                  </div>
                </div>
              </div>
              <div class="tune-sec" role="group" aria-labelledby="tune-automation-label">
                <div class="tune-sec-h"><span id="tune-automation-label">Automation</span><b>behavior, panel and tools</b></div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg></span>
                  <div class="card-h"><span class="card-t">Switches</span><span class="card-s">saved on this browser</span></div>
                  <div class="set-row">
                    <span class="set-lbl">Breaks<i>human pauses between races</i></span>
                    <span class="set-val"><b data-sw-txt="breaks" data-on="1">on</b><button class="sw" type="button" role="switch" aria-checked="true" data-toggle="breaks" data-on="1" title="Human pauses between races (9-16 races apart, 20-90 s, 15% of them 3-10 min)"></button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">Mystery Box<i>free garage reward, every ~21 h</i></span>
                    <span class="set-val"><b data-sw-txt="mysteryBox" data-on="1">on</b><button class="sw" type="button" role="switch" aria-checked="true" data-toggle="mysteryBox" data-on="1" title="Claim the free garage reward roughly every 21 h"></button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">Stickers<i>one in every race</i></span>
                    <span class="set-val"><b data-sw-txt="stickers" data-on="1">on</b><button class="sw" type="button" role="switch" aria-checked="true" data-toggle="stickers" data-on="1" title="Send one sticker in every race"></button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">AFK farming<i>race while this tab is hidden</i></span>
                    <span class="set-val"><b data-sw-txt="backgroundFarm" data-on="0">off</b><button class="sw" type="button" role="switch" aria-checked="false" data-toggle="backgroundFarm" data-on="0" title="Off by default. Chrome can freeze a hidden tab, and a race with no keys ends in a disqualification. Turn it on only if you accept that risk."></button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">AFK keep-alive<i>near-silent audio holds the tab</i></span>
                    <span class="set-val"><b data-sw-txt="keepAlive" data-on="0">off</b><button class="sw" type="button" role="switch" aria-checked="false" data-toggle="keepAlive" data-on="0" title="Optional and off by default. Near-silent audio makes Chrome treat this tab as active while AFK farming is on. It needs one click to unlock audio and cannot guarantee that the tab will not freeze. Muting the tab can disable it."></button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">AFK interlock<i>hidden races need keep-alive running</i></span>
                    <span class="set-val"><b data-sw-txt="afkRequireKeepAlive" data-on="0">off</b><button class="sw" type="button" role="switch" aria-checked="false" data-toggle="afkRequireKeepAlive" data-on="0" title="Recommended with AFK farming: a hidden tab cannot open a race unless the keep-alive reports a running AudioContext. A suspended or blocked keep-alive holds the queue instead of risking a DQ."></button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">AFK safety guard<i>DQ after a freeze turns AFK off</i></span>
                    <span class="set-val"><b data-sw-txt="afkFreezeGuard" data-on="1">on</b><button class="sw" type="button" role="switch" aria-checked="true" data-toggle="afkFreezeGuard" data-on="1" title="On by default. If a disqualification happens within 15 minutes of a recorded freeze while AFK farming is on, AFK is turned off and a notice is kept. It does not undo the DQ."></button></span>
                  </div>
                  <div class="set-row afk-health-row" title="Live AFK state, keep-alive state and freeze events recorded by this browser">
                    <span class="set-lbl">AFK health<i>hidden state · freeze count</i></span>
                    <span class="set-val"><b data-field="afkHealth" data-state="off" role="status" aria-live="polite">off · visible-only</b><button class="afk-health-reset" type="button" data-act="afkFreezeReset" title="Clear the freeze history recorded in this browser">reset</button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">Auto nitro<i>skips one long word per race</i></span>
                    <span class="set-val"><b data-sw-txt="useNitro" data-on="1">on</b><button class="sw" type="button" role="switch" aria-checked="true" data-toggle="useNitro" data-on="1" title="Auto nitro: press Enter once per race to skip one word chosen by the nitro strategy. It does not raise WPM; the saved time is paid back over the rest of the lesson"></button></span>
                  </div>
                  <div class="set-row nitro-strategy-row">
                    <span class="set-lbl">Nitro strategy<i>which word Enter skips</i></span>
                    <span class="set-val"><select class="nitro-strategy" data-field="nitroStrategy" aria-label="Nitro strategy"><option value="longest">longest</option><option value="first">first</option><option value="last">last</option></select></span>
                  </div>
                  <div class="set-row nitro-target-row" title="The word the nitro strategy would skip on the current lesson. It updates live and clears after the nitro is spent.">
                    <span class="set-lbl">Nitro target<i>the word Enter would skip</i></span>
                    <span class="set-val"><b data-field="nitroPreview">—</b></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">Guard<i>stops on an impossible reading</i></span>
                    <span class="set-val"><b data-sw-txt="guard" data-on="1">on</b><button class="sw" type="button" role="switch" aria-checked="true" data-toggle="guard" data-on="1" title="Safety guard: ends the race and opens a long break if the measured WPM goes past the ceiling. Turn it off only if you know what you are doing"></button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">Sound<i>discreet tone when the bot waits</i></span>
                    <span class="set-val"><b data-sw-txt="sound" data-on="0">off</b><button class="sw" type="button" role="switch" aria-checked="false" data-toggle="sound" data-on="0" title="Sound alerts: a short tone on long breaks, duplicate copies and site blocks"></button></span>
                  </div>
                  <div class="set-row">
                    <span class="set-lbl">Desktop alerts<i>DQ and site blocks, with permission</i></span>
                    <span class="set-val"><b data-sw-txt="notifications" data-on="0">off</b><button class="sw" type="button" role="switch" aria-checked="false" data-toggle="notifications" data-on="0" title="Desktop alerts: permission is requested on the first click. Only disqualifications, site blocks and the AFK safety guard use them; the panel and sound settings are unchanged."></button></span>
                  </div>
                </div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3a9 9 0 1 0 0 18h1.6a1.7 1.7 0 0 0 1.2-2.9l-.5-.5a1.7 1.7 0 0 1 1.2-2.9H18a3 3 0 0 0 3-3 9 9 0 0 0-9-8.7Z"/><circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7.2" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="8.3" r="1.1" fill="currentColor" stroke="none"/></svg></span>
                  <div class="card-h"><span class="card-t">Theme</span><span class="card-s" data-field="themeName">Carbon</span></div>
                  <div class="themes" data-field="themes" role="group" aria-label="Panel theme">
                    <button class="theme" type="button" data-theme-btn="carbon" aria-pressed="true" title="Carbon: green on carbon, the classic"><i class="sw-carbon"></i><span>Carbon</span></button>
                    <button class="theme" type="button" data-theme-btn="aurora" aria-pressed="false" title="Aurora: teal fading into violet"><i class="sw-aurora"></i><span>Aurora</span></button>
                    <button class="theme" type="button" data-theme-btn="sunset" aria-pressed="false" title="Sunset: warm orange and pink"><i class="sw-sunset"></i><span>Sunset</span></button>
                    <button class="theme" type="button" data-theme-btn="ice" aria-pressed="false" title="Ice: cold cyan on deep blue"><i class="sw-ice"></i><span>Ice</span></button>
                    <button class="theme" type="button" data-theme-btn="violet" aria-pressed="false" title="Violet: purple neon"><i class="sw-violet"></i><span>Violet</span></button>
                    <button class="theme" type="button" data-theme-btn="rgb" aria-pressed="false" title="RGB: animated rainbow border and title"><i class="sw-rgb"></i><span>RGB</span></button>
                  </div>
                </div>
                <div class="card">
                  <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 5h14v14H5z"/><path d="M8 9h8M8 13h5"/></svg></span>
                  <div class="card-h"><span class="card-t">Config</span><span class="card-s">carry it anywhere</span></div>
                  <div class="rows btn-row" style="margin:0 0 2px">
                    <button class="act" type="button" data-act="export" title="Copy this configuration (profile, limit, sound, switches) so it can be pasted in another browser or account">copy</button>
                    <button class="act" type="button" data-act="import" title="Apply whatever config is pasted in the box below">apply</button>
                    <button class="act" type="button" data-act="report" title="Copy a diagnostic report (version, profile, counters, last races, recent notices, flight recorder, environment) to paste when something is off">report</button>
                    <button class="act" type="button" data-act="support" title="Copy a redacted support bundle for an issue: tokens, account names and identifiers are removed">support</button>
                    <button class="act" type="button" data-act="csv" title="Download the closed sessions as a CSV (date, races, WPM, target, deviation, accuracy, DQ, reason) for a spreadsheet">csv</button>
                    <button class="act" type="button" data-act="releases" title="Open the GitHub release history to install a previous version if the newest one misbehaves">versions</button>
                    <button class="act" type="button" data-act="channel" title="${CHANNEL === 'canary' ? 'Download the stable release and go back to the normal channel' : 'Install the canary test build; it updates itself from the canary release and never changes the stable one'}">${CHANNEL === 'canary' ? 'stable' : 'canary'}</button>
                  </div>
                  <div class="rows">
                    <div class="row up-row" data-field="upRow" title="Auto-update check: the last result, its error and when it will retry"><span>update</span><b data-field="up">—</b></div>
                    <div class="row ch-row" data-field="chRow" title="Daily Challenge popup: close it automatically. Shift+click sets a CSS selector"><span>challenge</span><b data-field="ch">on</b></div>
                  </div>
                  <textarea class="cfg-text" data-field="cfgText" spellcheck="false" placeholder="Paste a copied config here and press apply."></textarea>
                  <div class="cfg-note" data-field="cfgNote">Pace and switches are saved on this browser and survive reloads.</div>
                </div>
              </div>
            </section>
            </template>

            <!-- ------------------------------ LOG --------------------------- -->
            <template data-view="log">
            <section class="view v-log" id="nt-view-log" role="tabpanel" aria-label="Log">
              <div class="view-head"><span>Log</span><b>sessions · challenges</b></div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/></svg></span>
                <div class="card-h"><span class="card-t" data-field="prevLabel">prev</span><span class="card-s">click for the table</span></div>
                <div class="prev-row row" style="display:none" title="The last session that closed: races, average WPM and deviation from target">
                  <span>session</span><b data-field="prev">—</b>
                </div>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg></span>
                <div class="card-h"><span class="card-t">Closed sessions</span><span class="card-s" data-field="logCount">0</span></div>
                <div class="log-list" data-field="closedList"></div>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20V9M10 20V4M16 20v-6M22 20H2"/></svg></span>
                <div class="card-h"><span class="card-t">Last 7 days</span><span class="card-s" data-field="weekTotal">empty</span></div>
                <div class="log-list" data-field="weekList"></div>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6h16M4 12h16M4 18h10"/></svg></span>
                <div class="card-h"><span class="card-t">Daily Challenges</span><span class="card-s" data-field="chCount">no data</span></div>
                <div class="log-list" data-field="chList"></div>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/></svg></span>
                <div class="card-h"><span class="card-t">Calibration</span><span class="card-s">account average</span></div>
                <div class="rows">
                  <div class="row"><span>when</span><b data-field="calLogWhen">never</b></div>
                  <div class="row"><span>wpm</span><b data-field="calLogWpm">—</b></div>
                  <div class="row"><span>accuracy</span><b data-field="calLogAcc">—</b></div>
                  <div class="row" title="Our accuracy model minus the one the game printed, averaged over the last 20 races"><span>model Δ</span><b data-field="calDelta">—</b></div>
                </div>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 19V5M4 19h16"/><path d="M8 15l3-4 3 2 4-6"/></svg></span>
                <div class="card-h"><span class="card-t">Live passes</span><span class="card-s" data-field="liveCount">none</span></div>
                <div class="rows btn-row" style="margin:0 0 2px">
                  <button class="act" type="button" data-field="liveLoad" title="Load tests/live/live-history.csv or live-history.json (the files npm run live writes) to compare the last passes">load file</button>
                  <button class="act" type="button" data-field="liveClear" title="Forget the loaded passes; the CSV on disk is untouched">clear</button>
                  <button class="act" type="button" data-field="livePickExport" disabled title="Download the selected A/B comparison as live-compare-*.csv">export A/B</button>
                </div>
                <input type="file" accept=".csv,.json,text/csv,application/json" data-field="liveFile" style="display:none" aria-label="Load the live pass CSV or JSON">
                <div class="today-row row" data-field="liveDriftRow" style="display:none" title="Latest pass mean vs the average of the previous passes"><span>trend</span><b data-field="liveDrift">—</b></div>
                <div class="today-row row" data-field="liveCompareRow" style="display:none" title="The last two passes, side by side (mean model Δ)"><span>last two</span><b data-field="liveCompare">—</b></div>
                <div class="rows" data-field="livePickRow" style="display:none">
                  <div class="row cmp-row" title="First pass; the difference is B minus A"><span>A</span><select class="cmp-select" data-field="livePickA" aria-label="First live pass"></select></div>
                  <div class="row cmp-row" title="Second pass; the difference is B minus A"><span>B</span><select class="cmp-select" data-field="livePickB" aria-label="Second live pass"></select></div>
                  <div class="row" title="Mean model Δ of B minus A"><span>diff</span><b data-field="livePickResult">—</b></div>
                </div>
                <div class="today-row row" data-field="liveStreakRow" style="display:none" title="Two or more passes in a row drifted past the band"><span>streak</span><b data-field="liveStreak">—</b></div>
                <div class="today-row row" data-field="liveSpreadRow" style="display:none" title="Latest block of 10+ races: model Δ spread (sd); above 0.10 pts means the block is too scattered"><span>spread</span><b data-field="liveSpread">—</b></div>
                <div class="log-list" data-field="liveList"></div>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 8h12M6 12h12M6 16h8"/></svg></span>
                <div class="card-h"><span class="card-t">Today</span><span class="card-s">resets at midnight</span></div>
                <div class="today-row row" data-field="todayRow" style="display:none" title="Today: races · average WPM · Mystery Boxes claimed · disqualifications"><span>summary</span><b data-field="today">—</b></div>
                <div class="log-list" data-field="noticeList"></div>
              </div>
            </section>
            </template>

            <!-- ------------------------------ INFO -------------------------- -->
            <template data-view="info">
            <section class="view v-info" id="nt-view-info" role="tabpanel" aria-label="Info">
              <div class="view-head"><span>Info</span><b>keys · guardrails</b></div>
              <div class="card update-card">
                <div class="card-h"><span class="card-t">Updates</span><span class="card-s">GitHub releases</span></div>
                <div class="rows">
                  <div class="row" title="Last public update check. A newer build is downloaded from GitHub, never installed without your click."><span>check</span><b data-field="upInfo">—</b></div>
                </div>
                <div class="season-actions">
                  <a class="act" href="${UPDATE_PAGE_URL}" target="_blank" rel="noopener noreferrer" title="Open the latest release on GitHub">open GitHub</a>
                  <button class="act" type="button" data-act="updateCheck" title="Check the public Gist for a newer version now">check now</button>
                </div>
                <div class="cfg-note">The Gist meta is checked every 5 minutes, when you return to the tab and when the connection comes back; if the Gist is down, the latest GitHub release asset is used. The installed copy changes only when you download a release.</div>
              </div>
              <div class="card">
                <div class="card-h"><span class="card-t">About</span><span class="card-s" data-field="aboutVer">v7.0.0</span></div>
                <p class="about">Human-paced racer for one account: calibrated typing inside the account's own envelope, human breaks, a queue that recovers the garage, reloads, CAPTCHAs and re-logins, and a guard that stops everything on an impossible reading. <b>There is no fast mode.</b></p>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6h9M17 6h3M4 18h3M11 18h9"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="18" r="2"/></svg></span>
                <div class="card-h"><span class="card-t">Keys</span><span class="card-s">any time</span></div>
                <div class="keys">
                  <div class="key-row"><kbd>MODE chip</kbd><span>status only: always AUTO, it starts by itself</span></div>
                  <div class="key-row"><kbd>Alt+A</kbd><span>resume, from anywhere and even while typing</span></div>
                  <div class="key-row"><kbd>Alt+N / Stop</kbd><span>stop it (the chip never turns it off)</span></div>
                  <div class="key-row"><kbd>Alt+R</kbd><span>clear the race history</span></div>
                  <div class="key-row"><kbd>Alt+Shift+C</kbd><span>clear the accuracy trend (model Δ)</span></div>
                  <div class="key-row"><kbd>Alt+H</kbd><span>closed sessions, table in the console</span></div>
                  <div class="key-row"><kbd>Alt+T</kbd><span>cycle the panel theme (saved)</span></div>
                  <div class="key-row"><kbd>Alt+G</kbd><span>fold / unfold the garage panel</span></div>
                  <div class="key-row"><kbd>Alt+M</kbd><span>footer HUD: full / compact / hidden</span></div>
                  <div class="key-row"><kbd>Alt+S / Esc</kbd><span>stop (mid-race it waits for the race to end)</span></div>
                </div>
              </div>
              <div class="card">
                <span class="ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l8 4v6c0 5-3.4 7.4-8 8-4.6-.6-8-3-8-8V7z"/></svg></span>
                <div class="card-h"><span class="card-t">Guard</span><span class="card-s">two failures, no excuses</span></div>
                <div class="keys">
                  <div class="key-row"><kbd>ceiling</kbd><span>no race may average above <b data-field="infoCap">120</b> WPM</span></div>
                  <div class="key-row"><kbd>copies</kbd><span>two copies alive: one types, the rest wait</span></div>
                  <div class="key-row"><kbd>report</kbd><span>TUNE → report copies a full diagnostic</span></div>
                </div>
              </div>
            </section>
            </template>
          </div>
        </div>
        <div class="foot">
          <div class="status" data-field="status" role="status" aria-live="polite">waiting…</div>
          <div class="foot-bar">
            <span class="led"></span>
            <b data-field="footState">idle</b>
            <span class="fsep">|</span>
            <span data-field="footMode">auto</span>
            <span class="fsep">|</span>
            <span data-field="footWpm">— wpm</span>
            <span class="fsep">|</span>
            <span data-field="footAcc" title="Live accuracy">— acc</span>
            <span class="fsep">|</span>
            <span data-field="footClock" title="Race clock">0:00</span>
            <span class="fsep">|</span>
            <span data-field="footCap">cap 120</span>
            <span class="hint" data-field="footHint">Alt+S stop</span>
          </div>
        </div>
        <div class="actions">
          <button class="toggle" type="button">Pause</button>
          <button class="gear" type="button" data-open="0" title="Settings: pace profile, switches, session limit and export/import of the config">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>
          </button>
          <button class="stop" type="button" title="Stop after the current race · Alt+S">Stop</button>
        </div>
      </div>
    `;

    // Las vistas inactivas viven en <template>: sus nodos se parsean, pero no
    // entran en el arbol del documento ni en el layout. `pick` las encuentra
    // para que el codigo que ya las pinta siga funcionando, y `hydrateView`
    // las mueve a su sitio la primera vez que se abre la pestana.
    const templates = [...shadow.querySelectorAll('template[data-view]')];
    const pick = (selector) => {
      const found = shadow.querySelector(selector);
      if (found) return found;
      for (const template of templates) {
        const node = template.content.querySelector(selector);
        if (node) return node;
      }
      return null;
    };

    document.body.appendChild(host);
    perfCounters.panelNodes = shadow.querySelectorAll('*').length;
    panel.host = host;
    panel.mountedViews = new Set(['stats']);

    panel.root = pick('.panel');
    panel.refs = {
      mode: pick('.mode'),
      pace: pick('.pace'),
      cap: pick('[data-field="cap"]'),
      hudRow: pick('.hud-row'),
      hud: pick('[data-field="hud"]'),
      clockRow: pick('.clock-row'),
      clock: pick('[data-field="clock"]'),
      resultRow: pick('.result-row'),
      result: pick('[data-field="result"]'),
      guardRow: pick('.guard-row'),
      guard: pick('[data-field="guard"]'),
      watchRow: pick('.watch-row'),
      watch: pick('[data-field="watch"]'),
      todayRow: pick('[data-field="todayRow"]'),
      today: pick('[data-field="today"]'),
      boxRow: pick('.box-row'),
      box: pick('[data-field="box"]'),
      target: pick('[data-field="target"]'),
      live: pick('[data-field="live"]'),
      acc: pick('[data-field="acc"]'),
      paceSource: pick('[data-field="paceSource"]'),
      session: pick('[data-field="session"]'),
      sessionRow: pick('.session-row'),
      sessionLeft: pick('[data-field="sessionLeft"]'),
      breakLeft: pick('[data-field="break"]'),
      dqRow: pick('.dq-row'),
      dq: pick('[data-field="dq"]'),
      status: pick('[data-field="status"]'),
      trimRow: pick('.trim-row'),
      trim: pick('[data-field="trim"]'),
      history: pick('[data-field="history"]'),
      progress: pick('[data-field="progress"]'),
      progFill: pick('[data-field="progfill"]'),
      races: pick('[data-field="races"]'),
      dayXp: pick('[data-field="dayXp"]'),
      rate: pick('[data-field="rate"]'),
      nitro: pick('[data-field="nitro"]'),
      nitroDelta: pick('[data-field="nitroDelta"]'),
      cycle: pick('[data-field="cycle"]'),
      xpBreak: pick('[data-field="xpBreak"]'),
      tanda: pick('[data-field="tanda"]'),
      raceLimitRow: pick('[data-field="raceLimitRow"]'),
      limit: pick('[data-field="limit"]'),
      prevRow: pick('.prev-row'),
      prevLabel: pick('[data-field="prevLabel"]'),
      prev: pick('[data-field="prev"]'),
      // --- rediseno v7: rail, cabecera, ajustes y barra de estado ---
      title: pick('[data-field="title"]'),
      ver: pick('[data-field="ver"]'),
      update: pick('.ghlink'),
      rail: pick('.rail'),
      views: pick('.views'),
      liveTag: pick('[data-field="liveTag"]'),
      liveAge: pick('[data-field="liveAge"]'),
      liveNow: pick('[data-field="liveNow"]'),
      liveNowAcc: pick('[data-field="liveNowAcc"]'),
      footState: pick('[data-field="footState"]'),
      footMode: pick('[data-field="footMode"]'),
      footWpm: pick('[data-field="footWpm"]'),
      footAcc: pick('[data-field="footAcc"]'),
      footClock: pick('[data-field="footClock"]'),
      footCap: pick('[data-field="footCap"]'),
      footHint: pick('[data-field="footHint"]'),
      seg: pick('.seg'),
      themes: pick('[data-field="themes"]'),
      themeName: pick('[data-field="themeName"]'),
      tuneCap: pick('[data-field="tuneCap"]'),
      tuneRange: pick('[data-field="tuneRange"]'),
      healthSummary: pick('[data-field="healthSummary"]'),
      healthAccount: pick('[data-field="healthAccount"]'),
      healthAfk: pick('[data-field="healthAfk"]'),
      healthUpdate: pick('[data-field="healthUpdate"]'),
      healthFreeze: pick('[data-field="healthFreeze"]'),
      healthNote: pick('[data-field="healthNote"]'),
      tuneSearch: pick('[data-field="tuneSearch"]'),
      tuneClear: pick('[data-field="tuneClear"]'),
      tuneCount: pick('[data-field="tuneCount"]'),
      tuneEmpty: pick('[data-field="tuneEmpty"]'),
      limitSlider: pick('[data-field="limitSlider"]'),
      etaLeft: pick('[data-field="etaLeft"]'),
      timeLimitRow: pick('[data-field="timeLimitRow"]'),
      timeLimit: pick('[data-field="timeLimit"]'),
      timeSlider: pick('[data-field="timeSlider"]'),
      timeLeftRow: pick('[data-field="timeLeftRow"]'),
      timeLeft: pick('[data-field="timeLeft"]'),
      xpLimitRow: pick('[data-field="xpLimitRow"]'),
      xpLimit: pick('[data-field="xpLimit"]'),
      xpSlider: pick('[data-field="xpSlider"]'),
      xpRow: pick('[data-field="xpRow"]'),
      xpTotal: pick('[data-field="xpTotal"]'),
      dailyRaceRow: pick('[data-field="dailyRaceRow"]'),
      dailyRaces: pick('[data-field="dailyRaces"]'),
      dailyRaceSlider: pick('[data-field="dailyRaceSlider"]'),
      dailyXpRow: pick('[data-field="dailyXpRow"]'),
      dailyXp: pick('[data-field="dailyXp"]'),
      dailyXpSlider: pick('[data-field="dailyXpSlider"]'),
      dailyLeft: pick('[data-field="dailyLeft"]'),
      activeRow: pick('[data-field="activeRow"]'),
      activeState: pick('[data-field="activeState"]'),
      activeStartRow: pick('[data-field="activeStartRow"]'),
      activeStart: pick('[data-field="activeStart"]'),
      activeStartSlider: pick('[data-field="activeStartSlider"]'),
      activeEndRow: pick('[data-field="activeEndRow"]'),
      activeEnd: pick('[data-field="activeEnd"]'),
      activeEndSlider: pick('[data-field="activeEndSlider"]'),
      activeNow: pick('[data-field="activeNow"]'),
      calRow: pick('[data-field="calRow"]'),
      cal: pick('[data-field="cal"]'),
      calWpm: pick('[data-field="calWpm"]'),
      calAcc: pick('[data-field="calAcc"]'),
      calAccount: pick('[data-field="calAccount"]'),
      acctId: pick('[data-field="acctId"]'),
      acctState: pick('[data-field="acctState"]'),
      acctAvg: pick('[data-field="acctAvg"]'),
      acctTarget: pick('[data-field="acctTarget"]'),
      acctAcc: pick('[data-field="acctAcc"]'),
      acctHistory: pick('[data-field="acctHistory"]'),
      acctRange: pick('[data-field="acctRange"]'),
      acctRead: pick('[data-field="acctRead"]'),
      acctRefresh: pick('[data-field="acctRefresh"]'),
      customWpm: pick('[data-field="customWpm"]'),
      customAcc: pick('[data-field="customAcc"]'),
      calDelta: pick('[data-field="calDelta"]'),
      accSpark: pick('[data-field="accSpark"]'),
      accSparkLine: pick('[data-field="accSparkLine"]'),
      accSparkArea: pick('[data-field="accSparkArea"]'),
      liveCount: pick('[data-field="liveCount"]'),
      liveLoad: pick('[data-field="liveLoad"]'),
      liveFile: pick('[data-field="liveFile"]'),
      liveList: pick('[data-field="liveList"]'),
      liveClear: pick('[data-field="liveClear"]'),
      liveDriftRow: pick('[data-field="liveDriftRow"]'),
      liveDrift: pick('[data-field="liveDrift"]'),
      liveCompareRow: pick('[data-field="liveCompareRow"]'),
      liveCompare: pick('[data-field="liveCompare"]'),
      livePickRow: pick('[data-field="livePickRow"]'),
      livePickA: pick('[data-field="livePickA"]'),
      livePickB: pick('[data-field="livePickB"]'),
      livePickResult: pick('[data-field="livePickResult"]'),
      livePickExport: pick('[data-field="livePickExport"]'),
      liveStreakRow: pick('[data-field="liveStreakRow"]'),
      liveStreak: pick('[data-field="liveStreak"]'),
      liveSpreadRow: pick('[data-field="liveSpreadRow"]'),
      liveSpread: pick('[data-field="liveSpread"]'),
      chCount: pick('[data-field="chCount"]'),
      chList: pick('[data-field="chList"]'),
      calLogWhen: pick('[data-field="calLogWhen"]'),
      calLogWpm: pick('[data-field="calLogWpm"]'),
      calLogAcc: pick('[data-field="calLogAcc"]'),
      chRow: pick('[data-field="chRow"]'),
      ch: pick('[data-field="ch"]'),
      weekList: pick('[data-field="weekList"]'),
      weekTotal: pick('[data-field="weekTotal"]'),
      closedList: pick('[data-field="closedList"]'),
      logCount: pick('[data-field="logCount"]'),
      noticeList: pick('[data-field="noticeList"]'),
      aboutVer: pick('[data-field="aboutVer"]'),
      infoCap: pick('[data-field="infoCap"]'),
      gear: pick('.gear'),
      cfg: pick('.cfg'),
      cfgText: pick('[data-field="cfgText"]'),
      cfgNote: pick('[data-field="cfgNote"]'),
      up: pick('[data-field="up"]'),
      upInfo: pick('[data-field="upInfo"]'),
      updateCheck: pick('[data-act="updateCheck"]'),
      afkFreezeReset: pick('[data-act="afkFreezeReset"]'),
      nitroStrategy: pick('[data-field="nitroStrategy"]'),
      nitroPreview: pick('[data-field="nitroPreview"]'),
      foot: pick('[data-field="foot"]'),
      avg: pick('[data-field="avg"]'),
      best: pick('[data-field="best"]'),
      toggle: pick('.toggle'),
      stop: pick('.stop'),
      collapse: pick('.collapse'),
      seasonCard: pick('[data-field="seasonCard"]'),
      seasonTag: pick('[data-field="seasonTag"]'),
      seasonName: pick('[data-field="seasonName"]'),
      seasonFill: pick('[data-field="seasonFill"]'),
      seasonTier: pick('[data-field="seasonTier"]'),
      seasonXp: pick('[data-field="seasonXp"]'),
      seasonNext: pick('[data-field="seasonNext"]'),
      seasonRaces: pick('[data-field="seasonRaces"]'),
      seasonPace: pick('[data-field="seasonPace"]'),
      seasonEnds: pick('[data-field="seasonEnds"]'),
      seasonAlert: pick('[data-field="seasonAlert"]'),
      seasonNote: pick('[data-field="seasonNote"]'),
      seasonOpen: pick('[data-field="seasonOpen"]'),
    };

    // El ultimo aviso importante se pinta aqui desde ya: si el panel se crea
    // despues de una DQ, la razon no se pierde.
    statusEl = panel.refs.status;
    if (statusEl) setText(statusEl, lastStatus || 'waiting…');

    panel.refs.toggle.title = 'Pause or resume sending keys (inside a race the pause resumes by itself after 6 s)';
    // El chip del ritmo sigue siendo LEGIT (no hay otro tipo de ritmo) y ahora
    // cicla el perfil: soft, normal, fast, todos con la misma cadencia humana.
    paintPace();
    paintTheme();

    // Cabecera: version. No cambia en caliente, se pinta una vez.
    const versionLabel = `v${VERSION}${CHANNEL === 'canary' ? ' · canary' : ''}`;
    setText(panel.refs.ver, versionLabel);
    setText(panel.refs.aboutVer, versionLabel);
    if (!panel.mountedViews || panel.mountedViews.has('log')) {
      paintLogLists();
      paintChallengeList();
    } else {
      readChallengeProgress();
    }
    if (panel.refs.cap) {
      const cap = CONFIG.wpm.hardCap;
      setText(panel.refs.cap, Number.isFinite(cap) ? `≤ ${cap} wpm` : 'no cap');
    }

    if (panel.refs.raceLimitRow) {
      panel.refs.raceLimitRow.addEventListener('click', (event) => {
        event.stopPropagation();
        const next = LIMIT_STEPS.find((value) => value > session.raceLimit);
        setRaceLimit(next === undefined ? 0 : next);
      });
    }

    // La fila del tope por tiempo cicla igual que la de carreras, con sus
    // propios escalones: libre, 15 min, 30 min, 1 h, 2 h.
    if (panel.refs.timeLimitRow) {
      panel.refs.timeLimitRow.addEventListener('click', (event) => {
        event.stopPropagation();
        const next = TIME_LIMIT_STEPS.find((value) => value > session.timeLimit);
        setTimeLimit(next === undefined ? 0 : next);
      });
    }

    // Y el tercero, en XP: mismos escalones que se pintan en sld-ends.
    if (panel.refs.xpLimitRow) {
      panel.refs.xpLimitRow.addEventListener('click', (event) => {
        event.stopPropagation();
        const next = XP_LIMIT_STEPS.find((value) => value > session.xpLimit);
        setXpLimit(next === undefined ? 0 : next);
      });
    }

    // La tarjeta Season no adivina: abre la pagina oficial y deja que su propia
    // pestana escriba la foto que este panel leera al volver.
    if (panel.refs.afkFreezeReset) {
      panel.refs.afkFreezeReset.addEventListener('click', (event) => {
        event.stopPropagation();
        resetAfkFreezeStats();
        log('AFK freeze history cleared for this browser.');
        paintConfig();
        if (typeof paintGaragePanel === 'function') paintGaragePanel();
      });
    }

    if (panel.refs.updateCheck) {
      panel.refs.updateCheck.addEventListener('click', async (event) => {
        event.stopPropagation();
        const button = panel.refs.updateCheck;
        if (button.disabled) return;
        button.disabled = true;
        setText(button, 'checking…');
        const ok = await checkForUpdate(true);
        setText(button, ok ? 'check now' : 'retry');
        paintUpdateHealth(true);
        setTimeout(() => {
          if (!button.isConnected) return;
          setText(button, 'check now');
          button.disabled = false;
        }, 1400);
      });
    }

    if (panel.refs.seasonOpen) {
      panel.refs.seasonOpen.addEventListener('click', (event) => {
        event.stopPropagation();
        try {
          window.open('https://www.nitrotype.com/season', '_blank', 'noopener');
          setText(panel.refs.seasonNote, 'Season opened. This card refreshes when that tab finishes loading.');
        } catch {
          location.href = '/season';
        }
      });
    }

    // La fila de la ultima tanda cerrada abre la misma tabla que Alt+H: el
    // detalle de cada sesion, sin tener que recordar el atajo.
    if (panel.refs.prevRow) {
      panel.refs.prevRow.addEventListener('click', (event) => {
        event.stopPropagation();
        showTandaLog();
      });
    }

    // Rail: cada icono abre su vista. El cuadrado verde que viaja lo mueve el
    // data-index del contenedor, con muelle, desde el CSS.
    if (panel.refs.rail) {
      panel.refs.rail.addEventListener('click', (event) => {
        const btn = event.target && event.target.closest ? event.target.closest('[data-tab-btn]') : null;
        if (!btn) return;
        event.stopPropagation();
        showTab(btn.dataset.tabBtn);
        btn.blur();
      });

      // Patron tablist: flechas, Home y End mueven la vista y el foco. No toca
      // el teclado del juego porque solo se activa con el foco dentro del rail.
      panel.refs.rail.addEventListener('keydown', (event) => {
        const btn = event.target && event.target.closest ? event.target.closest('[data-tab-btn]') : null;
        if (!btn) return;
        const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        const buttons = Array.from(panel.refs.rail.querySelectorAll('[data-tab-btn]'));
        const current = buttons.indexOf(btn);
        if (current < 0) return;
        let next = current;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = buttons.length - 1;
        else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (current + 1) % buttons.length;
        else next = (current - 1 + buttons.length) % buttons.length;
        event.preventDefault();
        event.stopPropagation();
        showTab(buttons[next].dataset.tabBtn);
        buttons[next].focus();
      });
    }

    // Tope de tanda con deslizador: los mismos escalones que el clic en la fila
    // (libre, 10, 20, 50, 100). El relleno verde lo pinta paintLimitSlider.
    if (panel.refs.limitSlider) {
      panel.refs.limitSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        const index = clamp(parseInt(panel.refs.limitSlider.value, 10) || 0, 0, LIMIT_STEPS.length - 1);
        setRaceLimit(LIMIT_STEPS[index]);
      });
      paintLimitSlider();
    }

    // Mismo deslizador, otro reloj: el relleno verde lo pinta paintTimeSlider.
    if (panel.refs.timeSlider) {
      panel.refs.timeSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        const index = clamp(parseInt(panel.refs.timeSlider.value, 10) || 0, 0, TIME_LIMIT_STEPS.length - 1);
        setTimeLimit(TIME_LIMIT_STEPS[index]);
      });
      paintTimeSlider();
    }

    if (panel.refs.xpSlider) {
      panel.refs.xpSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        const index = clamp(parseInt(panel.refs.xpSlider.value, 10) || 0, 0, XP_LIMIT_STEPS.length - 1);
        setXpLimit(XP_LIMIT_STEPS[index]);
      });
      paintXpSlider();
    }

    // Presupuesto diario: mismos dos controles (fila + deslizador) que los
    // topes de tanda, pero guardados en sus propias claves.
    if (panel.refs.dailyRaceRow) {
      panel.refs.dailyRaceRow.addEventListener('click', (event) => {
        event.stopPropagation();
        const next = DAILY_RACE_STEPS.find((value) => value > session.dailyRaceLimit);
        setDailyRaceLimit(next === undefined ? 0 : next);
      });
    }
    if (panel.refs.dailyRaceSlider) {
      panel.refs.dailyRaceSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        const index = clamp(parseInt(panel.refs.dailyRaceSlider.value, 10) || 0, 0, DAILY_RACE_STEPS.length - 1);
        setDailyRaceLimit(DAILY_RACE_STEPS[index]);
      });
      paintDailyRaceSlider();
    }
    if (panel.refs.dailyXpRow) {
      panel.refs.dailyXpRow.addEventListener('click', (event) => {
        event.stopPropagation();
        const next = DAILY_XP_STEPS.find((value) => value > session.dailyXpLimit);
        setDailyXpLimit(next === undefined ? 0 : next);
      });
    }
    if (panel.refs.dailyXpSlider) {
      panel.refs.dailyXpSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        const index = clamp(parseInt(panel.refs.dailyXpSlider.value, 10) || 0, 0, DAILY_XP_STEPS.length - 1);
        setDailyXpLimit(DAILY_XP_STEPS[index]);
      });
      paintDailyXpSlider();
    }

    // Horas activas: la fila enciende/apaga y los dos deslizadores eligen la
    // hora exacta. Shift en las filas mueve al reves (o resetea el rango).
    if (panel.refs.activeRow) {
      panel.refs.activeRow.addEventListener('click', (event) => {
        event.stopPropagation();
        if (event.shiftKey) {
          setActiveHour('start', 8, true);
          setActiveHour('end', 23, true);
          setActiveOn(true);
          return;
        }
        setActiveOn(!session.activeOn);
      });
    }
    if (panel.refs.activeStartRow) {
      panel.refs.activeStartRow.addEventListener('click', (event) => {
        event.stopPropagation();
        setActiveHour('start', (session.activeStart + (event.shiftKey ? 23 : 1)) % 24);
      });
    }
    if (panel.refs.activeEndRow) {
      panel.refs.activeEndRow.addEventListener('click', (event) => {
        event.stopPropagation();
        setActiveHour('end', (session.activeEnd + (event.shiftKey ? 23 : 1)) % 24);
      });
    }
    if (panel.refs.activeStartSlider) {
      panel.refs.activeStartSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        setActiveHour('start', parseInt(panel.refs.activeStartSlider.value, 10) || 0, true);
        paintActiveSlider('start');
      });
      paintActiveSlider('start');
    }
    if (panel.refs.activeEndSlider) {
      panel.refs.activeEndSlider.addEventListener('input', (event) => {
        event.stopPropagation();
        setActiveHour('end', parseInt(panel.refs.activeEndSlider.value, 10) || 0, true);
        paintActiveSlider('end');
      });
      paintActiveSlider('end');
    }

    // Buscador de TUNE: filtra por texto de la tarjeta y por el titulo del
    // bloque. Los ajustes ocultos siguen existiendo; solo dejan de ocupar sitio.
    if (panel.refs.tuneSearch) {
      panel.refs.tuneSearch.addEventListener('input', () => filterTune());
      panel.refs.tuneSearch.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
      });
    }
    if (panel.refs.tuneClear) {
      panel.refs.tuneClear.addEventListener('click', (event) => {
        event.stopPropagation();
        if (panel.refs.tuneSearch) panel.refs.tuneSearch.value = '';
        filterTune();
        if (panel.refs.tuneSearch) panel.refs.tuneSearch.focus();
      });
    }
    filterTune();

    // Fila de auto-calibracion: no hay apagado; el clic solo fuerza una lectura
    // nueva para que el rango se mueva ya con la media mas reciente.
    if (panel.refs.calRow) {
      panel.refs.calRow.addEventListener('click', (event) => {
        event.stopPropagation();
        refreshCalibration();
      });
    }

    if (panel.refs.acctRefresh) {
      panel.refs.acctRefresh.addEventListener('click', (event) => {
        event.stopPropagation();
        refreshCalibration();
        panel.refs.acctRefresh.blur();
      });
    }

    // Overrides manuales de WPM y precision. `change` evita aplicar cada tecla
    // a medias; Enter confirma sin tener que pulsar fuera del campo.
    if (panel.refs.customWpm) {
      panel.refs.customWpm.addEventListener('change', (event) => {
        event.stopPropagation();
        setCustomWpm(panel.refs.customWpm.value);
      });
      panel.refs.customWpm.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        panel.refs.customWpm.blur();
      });
    }
    if (panel.refs.customAcc) {
      panel.refs.customAcc.addEventListener('change', (event) => {
        event.stopPropagation();
        setCustomAccuracy(panel.refs.customAcc.value);
      });
      panel.refs.customAcc.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        panel.refs.customAcc.blur();
      });
    }

    // Fila del popup de challenges: clic normal enciende/apaga; Mayus+clic pide
    // el selector CSS para cuando el barrido por texto no baste.
    if (panel.refs.chRow) {
      panel.refs.chRow.addEventListener('click', (event) => {
        event.stopPropagation();
        if (event.shiftKey) {
          const next = prompt('CSS selector for the Daily Challenge popup (empty = detect by text):', CONFIG.challenges.selector || '');
          if (next !== null) {
            CONFIG.challenges.selector = next.trim();
            disk.set(KEYS.challengeSelector, CONFIG.challenges.selector);
            log(CONFIG.challenges.selector ? `Challenge selector set: ${CONFIG.challenges.selector}` : 'Challenge selector cleared: text detection.');
            paintChallenges();
          }
          return;
        }
        CONFIG.challenges.enabled = !CONFIG.challenges.enabled;
        savePrefs();
        log(CONFIG.challenges.enabled ? 'Daily Challenge popups: auto-close on.' : 'Daily Challenge popups: auto-close off.');
        paintChallenges();
      });
    }

    // El panel es nuevo: hay que repintar el historial y la temporada aunque
    // los datos no hayan cambiado (si no, quedan vacios hasta el proximo cambio).
    panel.historySig = '';
    panel.seasonSig = '';
    panel.seasonBaseSig = '';
    seasonPaintAt = 0;

    applyCollapsed(disk.get(KEYS.panelCollapsed) === '1');
    applyFootMode();
    restorePosition();
    makeDraggable(shadow);

    panel.refs.toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      setPaused(!session.paused);
      panel.refs.toggle.blur();
    });

    panel.refs.stop.addEventListener('click', (event) => {
      event.stopPropagation();
      // Parado no hay nada que parar: el mismo boton vuelve a arrancar. Hace
      // lo mismo que Alt+A, con las mismas puertas (tope diario y horas).
      if (session.stopped) resumeAuto();
      else requestStop();
      panel.refs.stop.blur();
    });

    panel.refs.collapse.addEventListener('click', (event) => {
      event.stopPropagation();
      const collapsed = panel.root.dataset.collapsed !== 'true';
      applyCollapsed(collapsed);
      restorePosition();
      if (!collapsed) updatePanel(true);
      panel.refs.collapse.blur();
    });

    // El chip del modo no es un interruptor: dice AUTO y nada mas. Parar es
    // cosa de Stop / Esc, y la cola se rearma sola.

    // El chip LEGIT cambia de perfil al pulsarlo: soft -> balanced -> fast.
    if (panel.refs.pace) {
      panel.refs.pace.addEventListener('click', (event) => {
        event.stopPropagation();
        const index = PACE_ORDER.indexOf(paceProfile);
        setPaceProfile(PACE_ORDER[(index + 1) % PACE_ORDER.length]);
        panel.refs.pace.blur();
      });
    }

    // Tema: un solo escuchador para las seis muestras. El CSS hace el resto.
    if (panel.refs.themes) {
      panel.refs.themes.addEventListener('click', (event) => {
        const chip = event.target && event.target.closest ? event.target.closest('[data-theme-btn]') : null;
        if (!chip) return;
        event.stopPropagation();
        setTheme(chip.dataset.themeBtn);
        chip.blur();
      });
    }

    // ⚙ lleva a la vista de ajustes (y vuelve): es el mismo cajon de siempre,
    // ahora como una pestaña mas del rail.
    if (panel.refs.gear) {
      panel.refs.gear.addEventListener('click', (event) => {
        event.stopPropagation();
        showTab(panel.root.dataset.tab === 'tune' ? 'stats' : 'tune');
        panel.refs.gear.blur();
      });
    }

    // Los chips del cajon: perfil, interruptores y exportar/importar. Un solo
    // escuchador para todos, que el cajon se repinta entero y no hay que
    // reenganchar nada al cambiar de perfil.
    if (panel.refs.cfg) {
      panel.refs.cfg.addEventListener('click', (event) => {
        const target = event.target;
        const chip = target && target.closest ? target.closest('button') : null;
        if (!chip) return;
        event.stopPropagation();

        if (chip.dataset.pace) {
          setPaceProfile(chip.dataset.pace);
        } else if (chip.dataset.toggle === 'useNitro') {
          setUseNitro(CONFIG.useNitro === false);
        } else if (chip.dataset.toggle === 'backgroundFarm') {
          setBackgroundFarm(CONFIG.queue.backgroundFarm !== true);
        } else if (chip.dataset.toggle === 'keepAlive') {
          setKeepAlive(CONFIG.queue.keepAlive !== true);
        } else if (chip.dataset.toggle === 'afkRequireKeepAlive') {
          setAfkRequireKeepAlive(CONFIG.queue.afkRequireKeepAlive !== true);
        } else if (chip.dataset.toggle === 'afkFreezeGuard') {
          setAfkFreezeGuard(CONFIG.queue.afkFreezeGuard === false);
        } else if (chip.dataset.toggle === 'notifications') {
          setNotifications(CONFIG.notifications.enabled !== true);
        } else if (chip.dataset.toggle === 'sound') {
          // El click ya es gesto valido para el audio: al encenderlo suena.
          setSfx(!sfxOn);
        } else if (chip.dataset.toggle && CONFIG[chip.dataset.toggle]) {
          const key = chip.dataset.toggle;
          CONFIG[key].enabled = CONFIG[key].enabled === false;
          savePrefs();
          paintConfig();
          log(`${key} ${CONFIG[key].enabled === false ? 'off' : 'on'}.`);
        } else if (chip.dataset.act === 'export') {
          exportConfig();
        } else if (chip.dataset.act === 'import') {
          importConfig();
        } else if (chip.dataset.act === 'report') {
          exportDiagnostics();
        } else if (chip.dataset.act === 'support') {
          exportSupportBundle();
        } else if (chip.dataset.act === 'csv') {
          exportSessionsCsv();
        } else if (chip.dataset.act === 'releases') {
          try { window.open(UPDATE_RELEASES_URL, '_blank', 'noopener,noreferrer'); } catch { /* bloqueado */ }
        } else if (chip.dataset.act === 'channel') {
          // En canary el boton vuelve al Gist estable; en estable abre el build
          // de prueba. Ninguno de los dos cambia la release estable por si solo.
          const url = CHANNEL === 'canary' ? UPDATE_STABLE_URL : UPDATE_CANARY_URL;
          try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* bloqueado */ }
        }

        chip.blur();
      });
    }

    if (panel.refs.nitroStrategy) {
      panel.refs.nitroStrategy.addEventListener('change', (event) => {
        event.stopPropagation();
        setNitroStrategy(panel.refs.nitroStrategy.value);
      });
    }

    // Pasadas del banco live: el boton abre el selector y el CSV se queda
    // guardado. La tarjeta vive en LOG y no depende de la consola.
    if (panel.refs.liveLoad && panel.refs.liveFile) {
      panel.refs.liveLoad.addEventListener('click', (event) => {
        event.stopPropagation();
        panel.refs.liveFile.click();
        panel.refs.liveLoad.blur();
      });
      panel.refs.liveFile.addEventListener('change', () => {
        const file = panel.refs.liveFile.files && panel.refs.liveFile.files[0];
        if (file) loadLiveCsv(file);
        panel.refs.liveFile.value = '';
      });
    }

    if (panel.refs.liveClear) {
      panel.refs.liveClear.addEventListener('click', (event) => {
        event.stopPropagation();
        clearLivePasses();
        panel.refs.liveClear.blur();
      });
    }
    for (const select of [panel.refs.livePickA, panel.refs.livePickB]) {
      if (select) select.addEventListener('change', paintLivePick);
    }
    if (panel.refs.livePickExport) {
      panel.refs.livePickExport.addEventListener('click', (event) => {
        event.stopPropagation();
        downloadLiveCompareCsv();
        panel.refs.livePickExport.blur();
      });
    }
    renderLivePasses();

    paintConfig();
    updatePanel();
  }
