// El garaje es un documento HTML/CSS estatico con una sola interpolacion: el
// tema guardado. Vive en su propio fragmento, como el panel de carrera en
// 83-panel-html.js, para que runQueue() sea logica de cola y no 400 lineas de
// marcado.
function garagePanelHtml(panelTheme) {
  return `
        <style>
          * { box-sizing: border-box; }

          /* La misma piel que el panel grande: carbon con un verde de fondo,
             lineas de un pixel, numeros en mono y un filo de luz arriba. Los dos
             paneles se reconocen como la misma herramienta. */
          .p {
            --acc: #35ea86;
            --acc-2: #9bf7c5;
            --acc-dim: color-mix(in srgb, var(--acc) 14%, transparent);
            --line: color-mix(in srgb, var(--acc) 12%, transparent);
            --line-strong: color-mix(in srgb, var(--acc) 26%, transparent);
            --ink: #e9f7ef;
            --ink-2: #cfe9db;
            --dim: #8ea49a;
            --dim-2: #7f9389;
            --warn: #ffb340;
            --bad: #ff6f6f;
            --info: #63c8ff;
            --ink-warn: color-mix(in srgb, var(--warn) 30%, var(--ink));
            --ink-bad: color-mix(in srgb, var(--bad) 25%, var(--ink));
            --bg-hi: rgba(12, 17, 14, .985);
            --bg-lo: rgba(5, 8, 6, .995);
            --font-ui: ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif;
            --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            position: relative;
            width: 292px;
            max-width: calc(100vw - 32px);
            border-radius: 14px;
            overflow: hidden;
            color: var(--ink);
            background:
              repeating-linear-gradient(0deg, rgba(255, 255, 255, .014) 0 1px, transparent 1px 3px),
              radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--acc) 10%, transparent), transparent 58%),
            radial-gradient(90% 80% at 100% 100%, color-mix(in srgb, var(--acc-2) 8%, transparent), transparent 62%),
              linear-gradient(168deg, var(--bg-hi), var(--bg-lo));
            border: 1px solid var(--line-strong);
            box-shadow:
              0 22px 44px -18px rgba(0, 0, 0, .85),
              0 0 0 1px rgba(0, 0, 0, .6),
              0 0 34px -14px color-mix(in srgb, var(--acc) 50%, transparent),
              inset 0 1px 0 rgba(255, 255, 255, .05);
            font: 12px/1.4 var(--font-ui);
            font-variant-numeric: tabular-nums;
            color-scheme: dark;
            animation: nt-qp-boot .4s cubic-bezier(.2, .9, .25, 1) both;
          }
          @keyframes nt-qp-boot {
            from { opacity: 0; transform: translateY(8px) scale(.985); }
            to   { opacity: 1; transform: none; }
          }

          .h { position: relative; display: flex; align-items: center; gap: 9px; padding: 11px 12px 9px;
               cursor: grab; user-select: none; touch-action: none;
               background: linear-gradient(180deg, rgba(255, 255, 255, .025), transparent);
               border-bottom: 1px solid var(--line);
               transition: background .15s ease; }
          .h::after {
            content: '';
            position: absolute;
            left: 12px; right: 12px; bottom: -1px; height: 1px;
            background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--acc) 55%, transparent), transparent);
            pointer-events: none;
          }
          .h:hover { background: rgba(255, 255, 255, .035); }
          .h:active { cursor: grabbing; }
          /* Plegado: la cabecera queda como una pastilla y el garaje recupera
             la pantalla. El estado se guarda, no se pierde al recargar. */
          .p[data-fold="1"] .rows,
          .p[data-fold="1"] .season,
          .p[data-fold="1"] .why,
          .p[data-fold="1"] .acts { display: none; }
          .p[data-fold="1"] .h { border-bottom-color: transparent; }
          /* Social view: no queue controls and no rows that suggest an action.
             The five read-only rows are the whole panel on /friends and /team. */
          .p[data-social="1"] .rows > .r:not(.social),
          .p[data-social="1"] .season,
          .p[data-social="1"] .why,
          .p[data-social="1"] .acts { display: none; }

          .dot { flex: none; width: 8px; height: 8px; border-radius: 50%;
                 background: var(--dim-2); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dim-2) 14%, transparent);
                 transition: background .25s ease, box-shadow .25s ease; }
          .mark { position: relative; flex: none; display: grid; place-items: center;
                  width: 23px; height: 23px; border-radius: 7px; color: var(--acc);
                  background: linear-gradient(145deg, color-mix(in srgb, var(--acc) 13%, rgba(255, 255, 255, .04)), rgba(255, 255, 255, .015));
                  border: 1px solid var(--line-strong);
                  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .08), 0 0 14px -8px var(--acc); }
          .mark svg { width: 16px; height: 16px; display: block;
                      filter: drop-shadow(0 0 5px color-mix(in srgb, var(--acc) 55%, transparent)); }
          .mark .dot { position: absolute; right: -2px; top: -2px; width: 5px; height: 5px;
                       box-shadow: 0 0 0 2px var(--bg-hi), 0 0 6px color-mix(in srgb, var(--acc) 70%, transparent); }
          /* El LED dice si corre o espera; el chip ya no tiene estado OFF. */
          .p[data-armed="1"] .dot { background: var(--acc);
                 box-shadow: 0 0 0 3px var(--acc-dim), 0 0 9px color-mix(in srgb, var(--acc) 75%, transparent); }
          .p[data-armed="0"] .dot { background: var(--warn);
                 box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn) 16%, transparent), 0 0 9px color-mix(in srgb, var(--warn) 55%, transparent); }

          .t { display: block; font-weight: 800; font-size: 12px; line-height: 1.15;
               letter-spacing: .13em; text-transform: uppercase; color: var(--ink);
               text-shadow: 0 0 14px color-mix(in srgb, var(--acc) 35%, transparent); }
          .s { display: block; margin-top: 3px; font-weight: 600; font-size: 8px;
               line-height: 1; letter-spacing: .13em; text-transform: uppercase;
               color: var(--dim-2); }

          .mode { margin-left: auto; flex: none; padding: 5px 10px; border-radius: 999px;
                  cursor: default;
                  font: 800 9px/1 var(--font-ui);
                  letter-spacing: .1em; text-transform: uppercase;
                  color: var(--acc-2); background: var(--acc-dim);
                  border: 1px solid color-mix(in srgb, var(--acc) 30%, transparent);
                  transition: color .2s ease, background .2s ease, border-color .2s ease; }
          .fold { all: unset; flex: none; display: grid; place-items: center;
                  width: 22px; height: 22px; border-radius: 7px; cursor: pointer;
                  font: 800 13px/1 var(--font-mono); color: var(--dim);
                  background: rgba(255, 255, 255, .04); border: 1px solid var(--line);
                  transition: color .15s ease, background .15s ease, border-color .15s ease, transform .12s ease; }
          .fold:hover { color: var(--acc-2); background: var(--acc-dim); border-color: var(--line-strong); }
          .fold:active { transform: scale(.92); }
          .fold:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
          /* Acceso compacto al update cuando el panel esta plegado. No ocupa
             sitio en la cabecera normal porque ahi ya manda el boton grande. */
          .hupd { all: unset; flex: none; display: none; place-items: center;
                  width: 22px; height: 22px; border-radius: 7px; cursor: pointer;
                  color: var(--acc-2); background: var(--acc-dim);
                  border: 1px solid color-mix(in srgb, var(--acc) 30%, transparent);
                  transition: color .15s ease, background .15s ease, border-color .15s ease, transform .12s ease; }
          .hupd[hidden] { display: none !important; }
          .p[data-fold="1"] .hupd:not([hidden]) { display: grid; }
          .hupd:hover { color: var(--ink); background: color-mix(in srgb, var(--acc) 20%, transparent); border-color: var(--acc); }
          .hupd:active { transform: scale(.92); }
          .hupd:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
          .hupd svg { width: 12px; height: 12px; display: block; }

          .garage-context {
            --ctx: var(--acc);
            display: grid;
            grid-template-columns: 26px minmax(0, 1fr) auto;
            align-items: center;
            gap: 8px;
            margin: 8px 12px 2px;
            padding: 7px 8px;
            border: 1px solid color-mix(in srgb, var(--ctx) 26%, transparent);
            border-radius: 9px;
            background:
              linear-gradient(110deg, color-mix(in srgb, var(--ctx) 12%, transparent), transparent 74%),
              rgba(255, 255, 255, .025);
          }
          .garage-context[data-context="stopped"],
          .garage-context[data-context="signin"],
          .garage-context[data-context="cleared"] { --ctx: var(--warn); }
          .garage-context[data-context="banned"],
          .garage-context[data-context="offline"] { --ctx: var(--bad); }
          .garage-context[data-context="gate"],
          .garage-context[data-context="retry"] { --ctx: var(--info); }
          .garage-context[data-context="reward"],
          .garage-context[data-context="ready"] { --ctx: var(--acc); }
          .gc-icon { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 8px;
                     color: var(--ctx); background: color-mix(in srgb, var(--ctx) 12%, transparent);
                     border: 1px solid color-mix(in srgb, var(--ctx) 24%, transparent); }
          .gc-icon svg { width: 14px; height: 14px; }
          .gc-copy { min-width: 0; }
          .gc-copy b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                       font: 750 10px/1.25 var(--font-ui); color: var(--ink); }
          .gc-copy > span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                           margin-top: 2px; font: 500 8.5px/1.3 var(--font-ui); color: var(--dim); }
          .garage-context > i { padding: 3px 6px; border-radius: 999px; font: 800 7.5px/1 var(--font-ui);
                               letter-spacing: .1em; text-transform: uppercase; color: var(--ctx);
                               background: color-mix(in srgb, var(--ctx) 10%, transparent);
                               border: 1px solid color-mix(in srgb, var(--ctx) 24%, transparent); }
          .p[data-fold="1"] .garage-context,
          .p[data-social="1"] .garage-context { display: none; }

          .rows { display: grid; padding: 8px 12px 6px; }
          .r { display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
               padding: 3px 0; font-weight: 500; font-size: 10.5px; line-height: 1.45;
               color: var(--dim); border-bottom: 1px solid rgba(255, 255, 255, .03); }
          .r:last-child { border-bottom: 0; }
          .r > span { flex: 0 0 auto; letter-spacing: .05em; }
          /* El valor puede ser largo ("next check in 21 h"): se le deja encoger y
             partir en dos lineas en vez de salirse por el borde del panel. */
          .r b { flex: 1 1 auto; min-width: 0; font: 600 11px/1.45 var(--font-mono);
                 font-variant-numeric: tabular-nums; color: var(--ink-2); text-align: right;
                 overflow-wrap: break-word; }
          .r b.race { cursor: pointer; }
          .r b.race[data-cancel="1"] { color: var(--warn); text-decoration: underline dotted; }
          /* La cuenta atras de Race Now, dibujada sobre el borde de la fila:
             dice cuanto falta sin añadir otra barra ni otro numero. */
          .r[data-f="raceRow"] { position: relative; }
          .r[data-f="raceRow"]::after {
            content: '';
            position: absolute;
            left: 0; bottom: -1px; height: 1px;
            width: 100%;
            transform: scaleX(calc(var(--race-progress, 0) / 100));
            transform-origin: left center;
            background: linear-gradient(90deg, transparent, var(--acc));
            box-shadow: 0 0 8px color-mix(in srgb, var(--acc) 60%, transparent);
            pointer-events: none;
            transition: transform .2s linear;
          }
          .r[hidden] { display: none; }
          .r b[data-warn="1"] { color: var(--warn); }
          .r b[data-warn="2"] { color: var(--bad); }

          /* Aviso de temporada, el mismo de la tarjeta Season: una franja al
             pie para no tener que abrir una carrera para verlo. */
          .season { margin: 2px 12px 8px; padding: 6px 8px; border-radius: 8px;
                    font-weight: 600; font-size: 9.5px; line-height: 1.35; color: var(--warn);
                    background: color-mix(in srgb, var(--warn) 8%, transparent);
                    border: 1px solid color-mix(in srgb, var(--warn) 22%, transparent); }
          .season[hidden] { display: none; }

          /* La fila de tema es un control, no una metrica: se ve clicable y
             lleva un punto del acento para reconocer la piel activa. */
          .r .theme { all: unset; flex: 1 1 auto; min-width: 0; cursor: pointer;
               font: 600 11px/1.45 var(--font-mono);
               font-variant-numeric: tabular-nums; color: var(--acc); text-align: right;
               border-radius: 5px; }
          .r .theme::before { content: ''; display: inline-block; width: 7px; height: 7px;
               margin-right: 6px; border-radius: 50%; vertical-align: 1px;
               background: var(--acc); box-shadow: 0 0 8px color-mix(in srgb, var(--acc) 70%, transparent); }
          .r .theme:hover { text-decoration: underline dotted; }
          .r .theme:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }

          /* Las mismas seis pieles, otra vez: cada shadow root tiene su propio
             CSS y no hereda la paleta del panel grande. */
          .p[data-theme="aurora"] { --acc: #3fe0c5; --acc-2: #a78bfa; --ink: #e8fbf7; --ink-2: #c3ece5; --dim: #7c9a98; --dim-2: #789693; --bg-hi: rgba(7, 19, 20, .985); --bg-lo: rgba(4, 10, 13, .995); }
          .p[data-theme="sunset"] { --acc: #ff9a5c; --acc-2: #ff77b0; --ink: #fff3ea; --ink-2: #f6d8c7; --dim: #a08a80; --dim-2: #9c877d; --bg-hi: rgba(24, 12, 11, .985); --bg-lo: rgba(12, 6, 8, .995); }
          .p[data-theme="ice"] { --acc: #66e3ff; --acc-2: #d7f7ff; --ink: #eefaff; --ink-2: #c9e9f6; --dim: #7e97a4; --dim-2: #7a93a0; --bg-hi: rgba(8, 16, 24, .985); --bg-lo: rgba(4, 8, 14, .995); }
          .p[data-theme="violet"] { --acc: #c08bff; --acc-2: #f0a9ff; --ink: #f7f0ff; --ink-2: #ddcbf2; --dim: #93849f; --dim-2: #8f809b; --bg-hi: rgba(18, 11, 27, .985); --bg-lo: rgba(8, 5, 14, .995); }
          .p[data-theme="rgb"] {
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
              nt-qp-boot .4s cubic-bezier(.2, .9, .25, 1) both,
              nt-rgb-hue var(--nt-rgb-hue-duration, 16s) linear infinite;
          }
          @keyframes nt-rgb-hue { to { --nt-hue: 360; } }
          @keyframes nt-rgb-angle { to { --nt-angle: 360deg; } }

          .p[data-theme="rgb"]::after {
            content: '';
            position: absolute;
            inset: 0;
            z-index: 5;
            padding: 1px;
            border-radius: 14px;
            background: conic-gradient(from var(--nt-angle, 0deg),
              var(--nt-rgb-a, #ff5f6d), #ffc371, #47ffa1, #5ad1ff, var(--nt-rgb-b, #b06bff), var(--nt-rgb-a, #ff5f6d));
            -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
            -webkit-mask-composite: xor;
            mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
            mask-composite: exclude;
            opacity: var(--nt-rgb-border-opacity, .9);
            animation: nt-rgb-angle var(--nt-rgb-angle-duration, 8s) linear infinite;
            pointer-events: none;
          }

          /* El mismo titulo arcoiris que el panel grande, para que el garaje no
             parezca otra herramienta cuando el tema es RGB. */
          .p[data-theme="rgb"] .t {
            background: linear-gradient(90deg, var(--nt-rgb-a, #ff5f6d), #ffc371, #47ffa1, #5ad1ff, var(--nt-rgb-b, #b06bff), var(--nt-rgb-a, #ff5f6d));
            background-size: 300% 100%;
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            text-shadow: none;
            animation: nt-rgb-title var(--nt-rgb-title-duration, 6s) linear infinite;
          }
          @keyframes nt-rgb-title { to { background-position: 300% 0; } }

          .p[data-theme="rgb"][data-state="running"][data-rgb-race="static"],
          .p[data-theme="rgb"][data-state="running"][data-rgb-race="static"]::after,
          .p[data-theme="rgb"][data-state="running"][data-rgb-race="static"] .t,
          .p[data-theme="rgb"][data-state="running"][data-rgb-race="border"],
          .p[data-theme="rgb"][data-state="running"][data-rgb-race="border"] .t {
            animation-play-state: paused;
          }

          /* La espera no es una metrica: es la respuesta a «por que no corre».
             Va en ambar y se separa de la lista, no compite con ella. */
          .r[data-f="waitRow"] { margin: 4px 0; padding: 5px 8px; border-radius: 8px;
               border: 1px solid color-mix(in srgb, var(--warn) 22%, transparent);
               background: color-mix(in srgb, var(--warn) 8%, transparent); color: var(--ink-warn); font-size: 10px; }
          .r[data-f="waitRow"] b { font-size: 10px; color: var(--warn); }

          /* Pie: el motivo, con la misma linea de separacion que el panel grande
             usa para su barra de estado. */
          .why { margin-top: 2px; padding: 8px 12px 0; border-top: 1px solid var(--line);
                 font-weight: 500; font-size: 9.5px; line-height: 1.35; color: var(--dim); }
          .why b { font-weight: 500; color: color-mix(in srgb, var(--ink) 88%, var(--dim)); }
          .why[hidden] { display: none; }

          .acts { display: flex; flex-wrap: wrap; gap: 7px; padding: 9px 12px 12px; }
          .act { flex: 1 1 auto; min-width: 0; padding: 9px 0; text-align: center;
                 border-radius: 9px; cursor: pointer;
                 font: 800 9.5px/1 var(--font-ui);
                 letter-spacing: .14em; text-transform: uppercase; color: var(--ink);
                 background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 22%, transparent), color-mix(in srgb, var(--acc) 10%, transparent));
                 border: 1px solid color-mix(in srgb, var(--acc) 34%, transparent);
                 box-shadow: inset 0 1px 0 rgba(255, 255, 255, .1);
                 transition: filter .15s ease, box-shadow .25s ease, transform .1s ease; }
          .act:hover:not(:disabled) { filter: brightness(1.16);
                 box-shadow: 0 0 20px -8px var(--acc), inset 0 1px 0 rgba(255, 255, 255, .12); }
          .act.primary { flex-basis: 100%; border-color: color-mix(in srgb, var(--acc) 58%, transparent);
                         background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 30%, transparent), color-mix(in srgb, var(--acc) 12%, transparent));
                         box-shadow: 0 0 20px -10px var(--acc), inset 0 1px 0 rgba(255, 255, 255, .14); }
          .act.primary:hover:not(:disabled) { box-shadow: 0 0 24px -8px var(--acc), inset 0 1px 0 rgba(255, 255, 255, .16); }
          .act:active:not(:disabled) { transform: translateY(1px); }
          /* Deshabilitado se lee: el color propio del boton se queda, baja el
             peso y se apaga el brillo. Texto gris a .38 hacia que "RACE NOW"
             pareciera roto en vez de en espera. */
          .act:disabled { opacity: .55; cursor: not-allowed;
                 background: rgba(255, 255, 255, .02); border-color: var(--line); box-shadow: none; }
          .act.ghost { color: var(--ink-2); background: rgba(255, 255, 255, .045);
                 border-color: var(--line); box-shadow: none; }
          .act.ghost:hover:not(:disabled) { color: var(--acc); background: var(--acc-dim);
                 border-color: var(--line-strong); }
          /* Stop comparte sitio con las acciones normales, pero su color no
             invita a pulsarlo: parar es una salida, no el siguiente paso. */
          .act.danger { color: var(--ink-bad);
                 background: linear-gradient(180deg, color-mix(in srgb, var(--bad) 18%, transparent), color-mix(in srgb, var(--bad) 8%, transparent));
                 border-color: color-mix(in srgb, var(--bad) 32%, transparent);
                 box-shadow: inset 0 1px 0 rgba(255, 255, 255, .08); }
          .act.danger:hover:not(:disabled) { color: var(--ink);
                 background: color-mix(in srgb, var(--bad) 22%, transparent);
                 border-color: color-mix(in srgb, var(--bad) 55%, transparent);
                 box-shadow: 0 0 20px -9px var(--bad), inset 0 1px 0 rgba(255, 255, 255, .12); }
          /* «Copy» es una herramienta, no una accion de carrera: se queda
             compacto para no apretar los dos botones que se usan de verdad. */
          .act.tool { flex: 0 0 auto; padding: 9px 12px; color: var(--dim); }
          .act.tool:hover:not(:disabled) { color: var(--acc); }
          /* Update lleva su propio icono y el numero de version: se centra en
             una linea y no se deja partir cuando el panel esta estrecho. */
          .act.update { display: inline-flex; align-items: center; justify-content: center;
                 gap: 6px; white-space: nowrap; }
          .act.update svg { width: 12px; height: 12px; flex: none; }
          .act.update[hidden] { display: none; }
          .act:focus-visible, .mode:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }

          @media (prefers-reduced-motion: reduce) {
            .p, .p *, .p::before, .p::after { animation: none !important; transition: none !important; }
          }
        </style>
        <div class="p" data-mode="auto" data-theme="${panelTheme}">
          <div class="h" tabindex="0" role="group" aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home" aria-label="Garage panel header. Drag or use the arrow keys to move it; Home puts it back in the corner." title="Drag to move · arrow keys move · Home resets · double-click to put it back in the corner">
            <span class="mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="14" stroke-opacity=".2" stroke-width="1.5" stroke-dasharray="1.1 3.4"/><path d="M7 9.5 11.2 22.5 16 13.6 20.8 22.5 25 9.5" stroke-width="2.4"/></svg>
              <i class="dot"></i>
            </span>
            <span><b class="t">NITRO WRAITH</b><span class="s" data-f="sub">garage · queue</span></span>
            <span class="mode" role="status" aria-live="polite" title="Always AUTO: it starts and re-arms by itself. To stop it, use Stop / Esc in the race.">AUTO</span>
            <button class="hupd" type="button" data-f="updateCompact" hidden title="A newer NITRO WRAITH is available; click to download the userscript" aria-label="Update available. Download the new userscript.">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M8 11l4 4 4-4M5 20h14"/></svg>
            </button>
            <button class="fold" type="button" data-f="fold" aria-expanded="true" aria-label="Fold the garage panel" title="Fold the garage panel (Alt+G)">−</button>
          </div>
          <div class="garage-context" data-context="waiting" role="status" aria-live="polite" aria-atomic="true">
            <span class="gc-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h4l2-5 4 10 2-5h2"/></svg>
            </span>
            <span class="gc-copy">
              <b data-f="contextTitle">Queue ready</b>
              <span data-f="contextDetail">The next race will start automatically.</span>
            </span>
            <i data-f="contextPill">AUTO</i>
          </div>
          <div class="rows">
            <div class="r social" data-f="socialFriendsRow" hidden><span>friends</span><b data-f="socialFriends" aria-live="polite" aria-atomic="true">—</b></div>
            <div class="r social" data-f="socialOnlineRow" hidden><span>online</span><b data-f="socialOnline" aria-live="polite" aria-atomic="true">—</b></div>
            <div class="r social" data-f="socialRequestsRow" hidden><span>requests</span><b data-f="socialRequests" aria-live="polite" aria-atomic="true">—</b></div>
            <div class="r social" data-f="socialTeamRow" hidden><span>team</span><b data-f="socialTeam" aria-live="polite" aria-atomic="true">—</b></div>
            <div class="r social" data-f="socialUpdatedRow" hidden><span>updated</span><b data-f="socialUpdated">—</b></div>
            <div class="r"><span>state</span><b data-f="state">—</b></div>
            <div class="r" data-f="afkRow"><span>afk</span><b data-f="afk">—</b></div>
            <div class="r" data-f="keepAliveRow"><span>keep-alive</span><b data-f="keepAlive">—</b></div>
            <div class="r" data-f="retryRow" hidden><span>login retry</span><b data-f="loginRetry">—</b></div>
            <div class="r"><span>login</span><b data-f="login">—</b></div>
            <div class="r"><span>mystery box</span><b data-f="box">—</b></div>
            <div class="r"><span>session</span><b data-f="session">—</b></div>
            <div class="r" data-f="challengeRow" hidden><span>challenges</span><b data-f="challenges">—</b></div>
            <div class="r" data-f="nextRow" hidden><span>next</span><b data-f="next">—</b></div>
            <div class="r"><span>theme</span><button class="theme" type="button" data-f="theme" aria-live="polite" aria-label="Panel theme: ${THEME_LABELS[panelTheme] || panelTheme}. Activate to cycle." title="Click to cycle the panel theme: carbon, aurora, sunset, ice, violet, rgb. The race panel follows it.">${THEME_LABELS[panelTheme] || panelTheme}</button></div>
            <div class="r" data-f="renewedRow" hidden><span>renewed</span><b data-f="renewed">—</b></div>
            <div class="r" data-f="waitRow" hidden><span>waiting on</span><b data-f="wait">—</b></div>
            <div class="r" data-f="stopRow" hidden><span data-f="stopLabel">last stop</span><b data-f="lastStop">—</b></div>
            <div class="r" data-f="stopHistoryRow" hidden><span>recent stops</span><b data-f="stopHistory">—</b></div>
            <div class="r" data-f="raceRow"><span>next race</span><b class="race" data-f="race" title="Automatic start: click the value to cancel it (the bot stays armed and offers it again a little later)">—</b></div>
            <div class="r" data-f="dayRow" hidden><span>races</span><b data-f="dayRaces">—</b></div>
            <div class="r" data-f="budgetRow" hidden><span>day left</span><b data-f="dayBudget">—</b></div>
            <div class="r" data-f="boxesRow" hidden><span>boxes</span><b data-f="dayBoxes">—</b></div>
            <div class="r" data-f="alertsRow" hidden><span>alerts</span><b data-f="dayAlerts">—</b></div>
          </div>
          <div class="season" data-f="seasonRow" hidden><b data-f="seasonAlert">—</b></div>
          <div class="why" data-f="whyRow" hidden><b data-f="why">—</b></div>
          <div class="acts">
            <button class="act ghost" type="button" data-act="afk" data-f="afkBtn" title="AFK farming is off: races only start while this tab is visible. Turn it on to keep the queue running hidden; a frozen tab can still end a race in a DQ.">AFK off</button>
            <button class="act" type="button" data-act="box">Claim box</button>
            <button class="act ghost" type="button" data-act="race">Race now</button>
            <button class="act danger" type="button" data-act="stop" title="Stop the bot; mid-race it waits for the current race to end (same as Alt+S)">Stop</button>
            <button class="act ghost" type="button" data-act="resume" title="Clear a stop and start now; with a live race this sends the same Alt+A">Resume</button>
            <button class="act ghost" type="button" data-act="retry" hidden title="Advance the next sign-in retry without waiting for the countdown">Retry login</button>
            <button class="act ghost tool" type="button" data-act="diag" title="Copy a diagnostic of the queue: mode, state, active waits, last decision, last failure, today and budgets">Copy</button>
            <button class="act update" type="button" data-act="update" data-f="update" hidden title="A newer NITRO WRAITH is available; click to download the userscript">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M8 11l4 4 4-4M5 20h14"/></svg><span>Update</span>
            </button>
          </div>
        </div>`;
}
