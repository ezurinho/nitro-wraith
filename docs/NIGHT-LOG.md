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
