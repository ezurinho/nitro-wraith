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
