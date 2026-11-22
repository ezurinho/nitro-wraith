# Noche AFK

Una sola pista: el repositorio. Un ciclo cada 10 minutos en este hilo que coge
el siguiente elemento del backlog, lo implementa, lo verifica, lo commitea, lo
sube y anota lo que hizo en `docs/NIGHT-LOG.md`.

No hay nada que arrancar a mano y nada que el usuario tenga que dejar abierto
salvo la app. `tools/afk-night.ps1` existe para lanzar el userscript en un
navegador de verdad, pero no forma parte de esta noche: aquí solo se trabaja el
código.

## El ciclo

1. Lee este archivo y `docs/NIGHT-LOG.md`. El estado vive en disco, no en el chat.
2. Coge el siguiente elemento del backlog. Si el anterior quedó a medias, lo
   termina antes de abrir otro.
3. Un solo arreglo acotado. Si no cabe en un commit coherente, reduce el alcance.
4. Verifica: `npm test` en verde siempre; `npm run check` si tocó `src/`;
   `npm run visual` 15/15 si tocó la UI. El banco corre `--headless=new` con un
   perfil temporal, así que no abre ventana.
5. Commit (`Conventional Commits`, inglés, un arreglo por commit) y push a `main`.
6. Entrada en `docs/NIGHT-LOG.md` con hora, elemento, verificación con números
   reales, hash y siguiente.

Reglas que el ciclo no cruza:

- Nunca `--force`, nunca reescribir historia, nunca otros remotos.
- Nada se commitea con `npm test` en rojo.
- No se aceptan baselines visuales para poner el gate verde: primero se comprueba
  que el panel sea correcto, y solo después se regenera con `--only`.
- Nunca un navegador visible, nunca el userscript en un navegador real, nunca el
  perfil de Chrome del usuario.
- Dos fallos seguidos en el mismo elemento: `blocked` en `NIGHT-LOG.md` y a por
  el siguiente. `git checkout -- .` antes de terminar el ciclo.
- Si al empezar el árbol tiene cambios sin commitear que no vienen de una entrada
  de `NIGHT-LOG.md` (un ciclo cortado a mitad por un reinicio de la app), no se
  commitean a ciegas: `git stash push -m "ciclo cortado HH:MM"`, se anota en el
  registro y se sigue con el siguiente elemento. Un árbol sucio al arrancar es la
  forma más fácil de que la noche se descarrile en silencio.

## Backlog, en orden

1. ~~Partir el CSS de `src/80-panel.js`~~ — hecho: `src/79-panel-css.js`, CSS
   idéntico byte a byte.
2. Partir el resto de `src/80-panel.js` (~5,5 k líneas) por vistas: garaje, TUNE,
   LOG, salud y controles.
3. Partir `src/90-queue.js` (~5 k líneas).
4. Partir `tests/live/run.js` (~7,9 k líneas).
5. ESLint (`no-undef`, `no-unused-vars`, `eqeqeq`) sobre `tools/` y `tests/`, con
   gate en `npm test`.
6. Job de CI para `npm run visual` en ubuntu, con baselines generadas ahí: hoy
   esas 15 fotos solo las mira quien las pide a mano.
7. Deriva de ~300 px entre corridas en las 6 capturas de tema y en `log · idle`:
   identificar el valor que cambia y congelarlo.

## Mañana

1. `git log --oneline --since="yesterday"` — qué se commiteó.
2. `docs/NIGHT-LOG.md` — qué se intentó y qué quedó bloqueado.
3. `npm run check` — build en sync, 77 checks offline, 367 en el banco, 15/15
   visuales.

## Apagar

Desactivar la tarea `Nitro wraith · ciclo nocturno` en el scheduler de la app. No
hay comando para borrarla desde el chat.
