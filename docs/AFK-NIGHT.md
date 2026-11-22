# Noche AFK

Dos pistas que no dependen la una de la otra. La A corre el juego en tu
navegador; la B sigue trabajando en el repositorio desde el scheduler de la app.
Si la A se cae, la B sigue; si la B se atasca, la A sigue.

## Arranque (2 min, una sola vez)

| # | Comprobación | Cómo |
|---|---|---|
| 1 | Energía | Ya está: standby, hibernación y disco en `nunca`, monitor en `nunca`, y Windows Update no reinicia con sesión abierta (`NoAutoRebootWithLoggedOnUsers=1`) |
| 2 | Gestor de userscripts | Tampermonkey está instalado en el perfil `Default` de Chrome |
| 3 | El script instalado | **Falta**: `nitro-wraith` no aparece en la base de Tampermonkey. Instalarlo con `pwsh -File tools/afk-night.ps1 -Install` |
| 4 | Sesión del juego | Chrome abierto, `nitrotype.com` con la cuenta cargada. Sin cookie válida el script no arranca solo |
| 5 | Lanzar la ventana | `pwsh -File tools/afk-night.ps1` |

El paso 5 abre Chrome con las banderas que evitan que el navegador duerma la
pestaña (`--disable-background-timer-throttling`,
`--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`,
`CalculateNativeWinOcclusion` y `MemorySaverMode` apagados). Sin ellas el tipador
espera un frame que Chrome no entrega y el juego lo da por inactivo a los 12 s.

Deja la ventana a la vista. Cerrarla termina la noche.

Para confirmar que el script quedo instalado de verdad (Tampermonkey guarda sus
scripts en leveldb, no en un archivo de texto):

```powershell
pwsh -Command "$d = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data\Default\Local Extension Settings\dhdgffkkebhmkfjojejmpbldmpobfkfo'; Select-String -Path (Join-Path $d '*.log') -Pattern 'nitro-wraith' | Select-Object -First 1"
```

## Qué puede parar la pista A

| Parada | Señal en el panel | Remedio |
|---|---|---|
| Sesión del juego caída | `login` en rojo | volver a entrar; el script retoma solo |
| CAPTCHA | `state` pide acción, LOG con el aviso | se resuelve a mano: el script no lo resuelve |
| Congelación del sistema | el guardia dispara (`afkFreezeGuard`) | con la energía ya ajustada no debería; el LOG lo dice |
| Red inestable | DQ por inactividad en el LOG | nada que tocar: el script reintenta |

Los topes diarios son `dailyRaceLimit` y `dailyXpLimit`; en `0` no limitan. Si
quieres una noche sin freno, déjalos en `0` y `raceLimit` en `0` (tanda libre).

## Pista B — el repositorio

Un ciclo cada 10 minutos, en este mismo hilo, con el backlog de abajo: **un
arreglo por ciclo**, `npm test` en verde, un commit y push a `main`. Cada ciclo
anota lo que hizo en `docs/NIGHT-LOG.md`, así que el estado vive en disco y no en
la memoria del chat.

El banco de navegador corre `--headless=new` con un perfil temporal: **no abre
ventana**, así que `npm run check` y `npm run visual` se pueden usar. Lo que no se
abre nunca es un navegador visible, y el userscript no se ejecuta fuera del banco.

Reglas que el ciclo no cruza:

- Nunca `--force`, nunca reescribir historia, nunca tocar otros remotos.
- Nada se commitea con `npm test` en rojo. Si toca `src/`, además `npm run check`.
- No se aceptan baselines visuales para poner el gate verde: primero se comprueba
  que el panel sea correcto, y solo después se regenera con `--only`.
- Si un elemento del backlog falla dos ciclos seguidos, se marca `blocked` en
  `NIGHT-LOG.md` y se pasa al siguiente.
- Sin dependencias nuevas salvo que el ciclo lo justifique por escrito.

Backlog, en orden:

1. ~~Partir el CSS de `src/80-panel.js`~~ — hecho: `src/79-panel-css.js`.
2. Partir el resto de `src/80-panel.js` (~5,5 k líneas).
3. Partir `src/90-queue.js` (5 k líneas).
4. Partir `tests/live/run.js` (~7,9 k líneas).
5. ESLint (`no-undef`, `no-unused-vars`, `eqeqeq`) sobre `tools/` y `tests/`, con
   gate en `npm test`.
6. Job de CI para `npm run visual` en ubuntu, con baselines generadas ahí.
7. Deriva de ~300 px entre corridas en las 6 capturas de tema y en `log · idle`:
   identificar el valor que cambia y congelarlo.

## Mañana

1. `git log --oneline --since="yesterday"` — qué se commiteó.
2. `docs/NIGHT-LOG.md` — qué se intentó y qué quedó bloqueado.
3. Panel del juego, vista LOG — carreras, DQ y cajas de la noche.
4. `npm run check` — 77 + 367 + build en sync.

## Apagar

- Pista A: cerrar la ventana de Chrome.
- Pista B: desactivar la tarea programada en el scheduler de la app (se llama
  `Nitro wraith · ciclo nocturno`). No hay comando para borrarla desde aquí.