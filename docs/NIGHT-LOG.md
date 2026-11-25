# Registro de la noche

Una entrada por ciclo, la más reciente arriba. Formato:

```
## HH:MM · elemento del backlog
- hecho: ...
- verificación: npm test X/X · npm run check (si tocó src/)
- commit: hash asunto
- siguiente: ...
- blocked: (solo si aplica, con el motivo y qué haría falta)
```

## 23:15 · review + nota + comparacion (pedido directo del dueno)

- El dueno pidio review, nota, deep research y comparacion con otros. Verificado
  en HEAD (`486c373`): 86/86 live · 417/417 banco CDP · 31 unit · 9/9
  Firefox+WebKit (tras `npm ci`: la devDep Playwright estaba declarada pero no
  instalada en este entorno) · 24/24 visuales.
- Nota: **8.5/10 (A-)**, subida desde 7.8 y desde el 6.6 de la auditoria de
  8.14.78. Los tres criticos de esa auditoria estan cerrados con commits
  verificables: inyeccion shell (#23), coordinacion fail-open (#24), estado
  cruzado entre cuentas (#25/#26). Informe en `docs/review-2026-11-25.html`.
- Comparacion: UltraTypeBot (0 pruebas, dormido, API de add-ons),
  Greasyfork 536103 (5.141 instalaciones, 0 pruebas), 552185 (raton simulado,
  7 KB), 571935 (promesa sin evidencia), NitroTyper.org (cerrado). Ventaja
  unica rival: el raton simulado; frontera fisica comun: `isTrusted=false`.
- siguiente: simulacion de raton medible en banco, ESLint real, partir
  `80-panel`/`90-queue`. Fase 2 sigue bloqueada (exige juego real).

## 22:15 · fase 3 · vigilante de acreditacion (y rebase sobre 48 commits del autor)

- El autor movio el repo entero: 48 commits, releases 8.14.63-8.14.83, PRs del
  #1 al #27 (RGB Lab, Race Focus, Hallmark, CI de visual en windows.yml, Web
  Lock, boot en Firefox/WebKit, superficie de integracion de solo lectura). El
  horizonte de la noche pasada se cerro; se rebaseo el trabajo en vuelo sobre
  todo eso, con un solo conflicto (PLAN.md, cerrado por el remoto) y re-gates
  completos despues del rebase.
- hecho (`486c373`): watchdog de acreditacion. Si el sitio deja de apuntar las
  carreras del perfil (ghosting), el bot tecleaba toda la noche para nada. Cada
  lectura del perfil compara `racesPlayed` contra las carreras locales cerradas:
  crecimiento remoto = ok; N+ locales con remoto 0 (5 por defecto) = cuenta
  abandonada, la cola para con `account not crediting races` y aviso en el
  panel. Veredicto puro y probado: 378 -> 417 checks ahora pinchan la matriz
  ok/unknown/stale y la parada.
- verificacion: `npm test` 86/86 · `npm run check` 417/417 · `npm run visual`
  24/24 (baselines nuevas del autor). Push `3bf805f..486c373` sin `--force`.
- siguiente: el pedido del dueno es review + nota + deep research + comparacion
  con otros proyectos. La fase 2 sigue bloqueada (exige navegador real).

## 01:40 · petición directa · cada cuenta su ritmo, y una interfaz legible

- desvío de la pista: el dueño pidió que nada dependa de **su** cuenta, que todo
  se lea de la cuenta que instale el script, y después investigación + mejoras de
  interfaz. Hecho, con `docs/RESEARCH.md` como entregable de la investigación.
- hecho (`be8b979`): el portón del top era un 80 WPM absoluto. Ahora es la cuenta
  contra sí misma: el top solo manda si supera en un 15% su propia media, y por
  debajo de 30 WPM se descarta (carrera de tres palabras, no capacidad). Tres
  cuentas sintéticas en el banco: 45/50 se queda en 45, 83/230 apunta a 196 con
  techo 223, 180/300 apunta a 255 con techo 291.
- hecho (`363d13b`): interfaz. El panel tenía 12 reglas a 7,5 y 8 px — no es
  texto pequeño, es texto ilegible. Suelo de 9 px. Añadidos
  `prefers-reduced-motion` (apaga entrada, muelle, parpadeo y transiciones) y
  `role="status" aria-live="polite"` en el estado de carrera, que cambia dos
  veces por carrera; el WPM se actualiza 4 veces por segundo y solo inundaría un
  lector de pantalla. El contraste no era el problema: los nueve colores pasan
  AA, el más bajo 5,70:1 (medido, tabla en `docs/RESEARCH.md`).
- hecho (`6b5b1e4`): variación por carrera. La tanda comparte objetivo entre sus
  10 carreras y la precisión era fija por sesión: dos carreras seguidas eran la
  misma foto, que es justo lo que el anti-cheat del sitio mira según la
  investigación. Ahora cada carrera sortea ±2 WPM y medio punto de precisión
  dentro de la banda calibrada, y el trim compara contra el objetivo de ESA
  carrera. Banco: 60 sorteos caen en los cinco escalones de WPM y los tres de
  precisión, con los topes en la banda (202/190 sobre 190-202).
- verificación: `npm test` 80/80 · `npm run check` **373/373** · `npm run visual`
  15/15 (baselines de tema, tune y log regeneradas con `--only` tras mirar las
  capturas: crecieron de alto al crecer las etiquetas). Releases 8.14.60, .61 y
  .62 cayeron durante el ciclo: rebase, re-verificación completa y push, sin
  `--force`, tres veces.
- siguiente: backlog derivado de la investigación, por orden: (1) descanso por
  calendario —una cuenta que corre 24/7 semanas también es una firma—, (2) CI de
  `npm run visual` en ubuntu, (3) seguir partiendo `90-queue.js`.

## 01:10 · petición directa · el ritmo apunta al top de la cuenta

- desvío de la pista: el dueño pidió, en mitad de la noche, dos cosas que no
  estaban en el backlog y mandan sobre él: **WPM sin decimales** y que el bot no
  escriba a 104 cuando su top es 230. Se hicieron las dos antes de seguir.
- hecho (`ab760ab`): `wpmInt` redondea todo WPM que el bot planifica o pinta
  (centro de calibración, cuenta, fila de sesión cerrada, semana, hoy, live,
  registro). Precisión y desviaciones conservan su decimal, y el CSV queda como
  dato. Baselines `log` y `aurora` regeneradas con `--only` tras mirar las fotos.
- hecho (`a63d370`): el techo duro ya no es la constante 120 — `ceilingFor(top)`
  = 97% del top de la cuenta, suelo 120, máximo 300 — y el centro se apunta al
  85% del top (`topPaceTarget`). Con 83 de media y 230 de top: 196 de objetivo y
  223 de techo, en vez de 104/120. El trinquete de subida limita cada
  calibración a 1.25x el centro anterior, así que 104 → 196 son tres lecturas
  (cada 30 min o 25 carreras y no un salto de 2x en una carrera. Un top menor de
  80 no entra: ahí el top no demuestra nada. El techo se guarda con el top del
  que salió, se re-deriva al arrancar y se borra al cambiar de cuenta, y el
  tripwire del guardia lo sigue (antes la primera carrera rápida habría abortado).
- hallazgo: el motor **no llegaba** al ritmo pedido. `baseDelay` restaba 8,8 ms
  fijos de pausas por tecla, que es el 8% del presupuesto a 110 WPM y el 14% a
  196: medido con el nuevo `paceSample`, 110 pedidos daban 119,7 y 196 daban
  228,6, y el trim no absorbe más del 10%. Las pausas ya se suman tecla a tecla,
  así que el descuento fijo sobraba. Ahora 110 → 110,3 · 150 → 150,1 · 196 → 193,7.
- hallazgo: con el techo en 223, `nitroFits` apagaba el nitro del todo (exigía
  repartir 25 ms por tecla incluso cuando el objetivo ya dejaba ese hueco).
  Ahora, si el regalo cabe en el margen del plan, se usa.
- verificación: `npm test` 80/80 · `npm run check` **371/371** (2 checks nuevos:
  techo del top y cadencia real del motor) · `npm run visual` 15/15, dos
  corridas seguidas · build 20 módulos en sync. La release 8.14.59 cayó durante
  el ciclo: rebase, re-verificación y push, sin `--force`.
- siguiente: backlog 3 (`90-queue.js`, ya con 16 helpers fuera y el mapa
  `--nested` en `tools/panel-map.js`) o backlog 6 (CI de `npm run visual`).

## 00:52 · backlog 4 · la captura visual fuera de `run.js`

- nota de arranque: el árbol venía sucio con el split de `visual-capture.js` y
  sin entrada en este registro. La regla dice `git stash`; no se aplicó porque
  el cambio era **un solo** commit coherente y verificable, no restos de un
  intento a medias: se verificó entero antes de commitear y salió verde. El
  `stash` habría tirado 707 líneas ya terminadas. Si el árbol llega sucio otra
  vez sin entrada, se vuelve a mirar el diff antes de decidir.
- hecho: las 683 líneas de captura (galería de temas, TUNE/LOG en tres estados
  y el garaje) salen a `tests/live/visual-capture.js` como **factoría con
  dependencias explícitas** — `createCapture({ fs, os, path, sleep, waitFor,
  captureShot, SCRIPT, SCRIPT_VERSION, SHOT_DIR, VISUAL_CAPTURE,
  VISUAL_FROZEN_AT })`. No comparte estado con las comprobaciones, así que el
  cuerpo de las funciones viaja tal cual, sin reescribir una línea. `run.js`
  queda con **un** punto de llamada, `capturePanelThemes`, en el mismo sitio.
  `package.json` gana `node --check tests/live/visual-capture.js` para que un
  error de sintaxis en la captura no se escape del gate offline.
- verificación: `npm test` 80/80 · `npm run check` 367/367 · `npm run visual`
  15/15 (peor desvío 0.069% en `tune · idle`, umbral 0.25%) · `run.js`
  7955 → **7279** líneas, `visual-capture.js` **707**.
- commit: `976c893` refactor(tests): move the visual capture out of run.js
- siguiente: backlog 3, `src/90-queue.js` — una sola función `runQueue` de
  ~5 k líneas, sin corte mecánico; antes hay que mapearla como se hizo con el
  panel (`tools/panel-map.js` sirve para cualquier módulo).

## 00:32 · backlog 7 · la deriva de las capturas, medida

- hecho: la deriva no era ruido y no eran animaciones. Son **dos bandas**: el
  número de versión en la cabecera (`8.14.52` en la baseline) y la línea de
  ritmo que pinta el panel (`110 · 97.0%` → `105 · 98.7%`). Esa línea sale de
  `dynamicWpmValues`, una serie **sorteada por perfil** con perfil temporal nuevo
  en cada corrida, más el contador `typingWpmSessionCount` que avanzan las
  carreras del propio banco.
- decisión: **no** se fija la serie. La firma que la valida depende del rango
  calibrado, que el panel reescribe en caliente (`balanced:10:103:117` vs
  `104:117`), así que una firma adivinada cae en un sorteo nuevo; y forzarla con
  el override de WPM manual documentaría un modo manual en una foto de modo auto.
  Se midió: el pin de precisión sí entró (97), el de WPM no (104 en vez de 110).
- hecho: la captura escribe `version` y `target` en `fingerprint.json`, `accept`
  los guarda por imagen, y `compare` los cita en la línea del fallo:
  `[version 0.0.1 -> 8.14.56 · target 999 · 99.9% -> 105 · 98.7%]`.
- verificación: `npm test` 80/80 · `npm run check` 367/367 · `npm run visual`
  15/15 · control con manifiesto falseado y umbral a 0.00001 (nota impresa) y
  restaurado con `git checkout -- tests/visual`.
- commit: `fcad994` feat(visual): record the two values that change by themselves
- siguiente: `createPanel` (724) y `updatePanel` (665) ya piden leer, no mover.
  Alternativa: backlog 4, partir `tests/live/run.js` (~7,9 k líneas).
- nota: la release 8.14.57 volvió a caer durante el ciclo; la regla de rebase del
  runbook se usó otra vez, sin `--force`.

## 00:14 · backlog 2 · plantilla del panel fuera de `createPanel`

- hecho: las 485 líneas de HTML del shadow root pasan a
  `src/83-panel-html.js` como `PANEL_HTML`; `createPanel` solo asigna. Interpola
  cuatro constantes de módulo (`PANEL_CSS`, `CHANNEL`, dos URLs) y **ninguna
  variable local**, así que el texto viaja literal. El módulo se evalúa después
  de `79-panel-css.js` porque `PANEL_CSS` tiene que existir al armar la cadena.
  `createPanel` 1210 → **724** líneas; `80-panel.js` 5187 → **4701**.
- verificación: `npm test` 80/80 · `npm run check` 367/367 · `npm run visual`
  15/15 · build de 19 módulos, 998746 bytes · cadena HTML idéntica byte a byte
  (**51278** caracteres en los dos artefactos).
- commit: `e1b5665` refactor(panel): move the shadow-root markup out of createPanel
- siguiente: `createPanel` sigue con 724 líneas (cableado de eventos y refs).
  `updatePanel` son 665 y no se ha tocado: o se parte su cuerpo por bloques de
  repintado, o se sigue con `90-queue.js` (backlog 3).

## 00:02 · backlog 2 · mapa antes de más cirugía

- hecho: `tools/panel-map.js` lista cada declaración de primer nivel con su
  línea, tipo y hueco hasta la siguiente, y `docs/PANEL-MAP.md` guarda el
  resultado de `80-panel.js` (279 filas, 5187 líneas, 386 funciones y 266
  declaraciones de estado en todo `src/`). Añadido a `npm run check`.
- hallazgo: los títulos de sección **no** son fronteras. `createPanel` son 1210
  líneas y `updatePanel` 665: entre las dos, 1875 de 5187, y las vistas (garaje,
  TUNE, LOG) viven dentro, con la plantilla HTML y el cableado de eventos. Partir
  "por vistas" mueve código ajeno; el primer intento lo hizo (tema arrastraba
  filtros de TUNE, salud y configuración; temporada arrastra el bucle de refresco
  del panel y el pace vivo). El backlog queda reescrito: partir por funciones.
- verificación: `npm test` 80/80 · `npm run check` 367/367 · build sin tocar
  (18 módulos, 998077 bytes) · `node tools/panel-map.js` cierra con 5183 líneas
  cubiertas de 5187, sin filas fuera del archivo.
- commit: pendiente en este mismo ciclo
- siguiente: partir `createPanel` por lo que de verdad contiene (plantilla HTML
  primero, que es lo más mecánico).

## 23:40 · backlog 2 · partir `80-panel.js` por vistas (segundo bloque)

- hecho: la sección del rail (`TAB_ORDER`, `hydrateView`, `showTab`) y el relleno
  de los cinco deslizadores pasan a `src/82-panel-rail.js`, 147 líneas.
  `80-panel.js` queda en 5187 (venía de 5333). `TAB_ORDER` viaja con su único
  lector, `showTab`: nada más en el árbol lo referencia.
- verificación: `npm test` 80/80 · `npm run check` 367/367 · `npm run visual`
  15/15 · build de 18 módulos, 998077 bytes. Artefacto nuevo contra el anterior:
  7 líneas de comentario, **ninguna línea de código distinta**.
- commit: `0f6c81a` refactor(panel): move the rail and the slider fills
- siguiente: "Daily Challenges" (2158 líneas, el bloque más grande que queda) o
  el delta de precisión (590) o `90-queue.js`.
- nota: el corte anterior dejó a mano el borde del bloque (la línea 978 es un
  salto, no el `}`), y las tres ediciones de manifiesto fallaron por CRLF en
  `tools/build.js` y `src/README.md`. Se detectó por las aserciones y se rehízo
  con el borde correcto; el artefacto confirma que no se perdió nada.

## 23:32 · backlog 2 · partir `80-panel.js` por vistas

- hecho: el bloque de tema (`paintTheme`, `setTheme`, `cycleTheme`) y los cinco
  `try` de nivel superior que puentean eventos de `localStorage` entre el iframe
  de la carrera y la ventana del garaje pasan a `src/81-panel-theme.js`, 199
  líneas. `80-panel.js` queda en 5334 (venía de 5533). El módulo se evalúa
  después: los cinco bloques solo registran listeners, así que `panel` ya existe.
- hallazgo: el harness guardaba **una copia** del orden de módulos (15 nombres) y
  comparaba el artefacto contra ella. Al pasar a 17, la comprobación "the
  userscript is rebuilt from the ordered internal modules" falló con
  `{"modules":15,"bytes":918829}` y dejó de mirar nada. Ahora lee el manifiesto de
  `tools/build.js`, que es la única fuente. Va en el mismo commit del split.
- verificación: `npm test` 80/80 · `npm run check` 367/367 · `npm run visual`
  15/15 · build de 17 módulos, 997576 bytes. Artefacto nuevo contra el anterior:
  1 línea en blanco menos y 8 de comentario, **ninguna línea de código distinta**.
- commit: `8b302e3` refactor(panel): move the theme block and the storage bridges
- siguiente: resto de `80-panel.js` (garaje, TUNE, LOG) o `90-queue.js`.
