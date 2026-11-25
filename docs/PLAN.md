# Plan maestro · de "AFK que no se cae" a "AFK que parece una persona"

Horizonte: **2026-11-23 12:00 (-06:00)**. Estado en disco, no en memoria de chat: este archivo es la
cola de trabajo y `docs/NIGHT-LOG.md` es el diario de lo que se hizo. Cada fase se cierra con un
commit propio y los tres gates en verde.

Regla de oro del plan: **nada de números absolutos como regla**. Todo se deriva de la cuenta que
instale el script o del reloj, nunca de la cuenta del autor ni de una constante elegida a ojo. Es la
misma lección que dejó el portón de 80 WPM: un umbral fijo es o un techo para el que corre rápido o
una invitación a bans para el que corre lento.

---

## Fase 0 · hecha

| Qué | Commit | Evidencia |
| --- | --- | --- |
| Gates offline + banco CDP + capturas visuales | — | 80/80 · 373/373 · 15/15 |
| Suelo tipográfico, movimiento reducido, estado anunciado | `363d13b` | contraste medido, 12 reglas < 9 px eliminadas |
| Ritmo derivado de la cuenta (top con margen sobre su media) | `be8b979` | 45/50 → 45 · 83/230 → 196 · 180/300 → 255 |
| Variación por carrera (±2 WPM, ±0,5 puntos) | `6b5b1e4` | 60 sorteos en 5 escalones de WPM y 3 de precisión |
| Investigación con fuentes | `e19ec3a` | `docs/RESEARCH.md` |

## Fase 1 · hecha

| Qué | Commit | Evidencia |
| --- | --- | --- |
| Día de descanso (1 de cada 7, por hash de la fecha) | `00163fb` | 365 días → 46 descansos; estable dentro del día |
| Curva diurna (1.0 a las 13:30, 0.95 a las 01:30) | `00163fb` | recortada a la banda: 182 fuera → 187 dentro |
| La tarjeta de cuenta dice horas, descanso y curva | `1a52485` | `hours all day · rest in 3d · curve −0% · 140 wpm` |
| `paceSample` mide el motor, no la sesión | `00163fb` | 4% de error a 2 000 teclas → 1-3% a 40 000 |


---

## Fase 1 · actividad humana (realismo de calendario)

**Por qué.** La firma más fuerte hoy no es la velocidad: es correr 24/7 durante semanas. Los modelos
de actividad humana tienen cola larga, picos periódicos y **días de descanso**; un patrón sin
descanso ni ventana horaria es de los primeros rasgos que separan bot de humano
(Frontiers 2020, RSC/ACM 2015 — ver `docs/RESEARCH.md` §4).

**Qué.**

1. **Día de descanso determinista**: se deriva de la fecha local con un hash, no de `Math.random`.
   Mismo día → misma respuesta en cualquier pestaña, y el test es fijo. Por defecto **1 de cada 7**
   días; `CONFIG.calendar.restDaysPerWeek = 0` lo apaga.
2. **Curva diurna**: el objetivo se multiplica por un factor suave según la hora (mínimo de noche,
   máximo al mediodía), con el rango tomado de la literatura: menos del 5% de diferencia, que es lo
   que se mide entre mañana y tarde en tecleo real (PLOS One 2020; BiAffect 2020).

**Criterio de aceptación.** El gate `rest` aparece en `activeGates` el día que toca y desaparece al
día siguiente; 365 días dan 52 ± 3 descansos; `dayCurve(3) < dayCurve(12)` y el factor se queda en
[0.94, 1]; el objetivo de carrera se mueve con la hora y el de la tanda no.

**Riesgo.** Un descanso mal llevado cuesta 24 h de XP. Por eso es determinista, visible en el panel
(`rest day · back 00:00`) y se puede apagar desde `CONFIG`.

---

## Fase 2 · el input que ve el juego

**Por qué.** El bot llama a `app.handleKeyPress('character', event)`: el DOM nunca ve un `keydown`
para las letras. Cualquier detector de dinámica de tecleo mide *dwell time* (cuánto se mantiene la
tecla, ~90-100 ms en humanos) y *flight time* (190-230 ms); aquí no hay ni uno ni otro.

**Qué.** Medir primero en el banco: ¿el juego procesa un `keydown` sintético despachado en
`document`? Si sí, escribir la letra con `keydown` + `keyup` separados por un dwell modelado y
retirar la llamada directa; si no, dejarlo documentado como límite real del vector.

**Criterio de aceptación.** El índice avanza exactamente 1 por tecla (ni 0 ni 2) en 500 teclas, y el
dwell medido cae en [50, 200] ms con desviación no nula.

**Bloqueo conocido.** `isTrusted` siempre será `false`: ningún evento sintético lo evita. Esto se
documenta, no se disimula.

**Estado: BLOQUEADA (2026-11-23 00:30).** El banco no simula el juego real: usa stubs
(`{ typedIndex, handleKeyPress }`) y páginas falsas, así que no puede responder si el juego
procesa un `keydown` despachado en `document`. Medirlo exige abrir Nitro Type de verdad, y eso
está fuera de las reglas de esta noche (nada de navegador real, nada del perfil del dueño).
Implementarlo a ciegas puede duplicar cada carácter —un DQ garantizado—, que es exactamente lo
que este plan existe para evitar. Se queda como está hasta que haya una sesión de navegador
real con una cuenta de prueba.

---

## Fase 3 · vigilante de cuenta

**Por qué.** El riesgo real de "AFK toda la noche" es no enterarse: el servidor deja de acreditar
carreras (ghosting) y el bot sigue tecleando ocho horas para nada, o acumula DQ por inactividad.

**Qué.** Comparar lo que el cliente cree con lo que el perfil del sitio devuelve. Si N carreras
seguidas no mueven `racesPlayed` del servidor, parar con razón explícita y no reintentar solo.

**Criterio de aceptación.** Con un perfil sembrado que no avanza, la cola para en la tercera carrera
con `account not crediting races`; con un perfil que avanza, no para.

---

## Fase 4 · el panel dice qué va a pasar

**Por qué.** Hoy el panel cuenta lo que pasó. Con calendario, curva y descanso hace falta que cuente
lo que *va* a pasar: es la diferencia entre mirar una telemetría y pilotar.

**Qué.** Vista **PLAN**: ventana activa, próximo descanso, horas restantes de la ventana, objetivo de
esta hora frente al de la tanda, y el motivo del gate activo si lo hay.

**Criterio de aceptación.** Captura nueva con baseline propia; el texto del plan coincide con
`activeGates` y con `raceWpm()` en el mismo instante.

**Estado: HECHA la parte que el usuario lee (2026-11-23 00:45).** Las tres filas (`hours`,
`rest`, `curve`) viven en la tarjeta de cuenta de la vista Live, que es la que se mira. Una
pestaña propia no añade información: el rail ya tiene cuatro y la quinta solo esconde el
mismo dato un clic más allá.

---

## Fase 5 · infraestructura

1. **CI de `npm run visual`** — cerrado: corre en `windows.yml`, el unico runner
   que resuelve las pilas del sistema igual que la maquina de capturas; Ubuntu
   mueve las quince capturas. Un cambio de layout o de tema falla en el PR y las
   capturas suben como artefacto.
2. **ESLint real** — cerrado: `npm run lint` corre `no-undef` sobre el
   artefacto concatenado (el unico sitio donde se ven los nombres de todos los
   fragmentos), `tools/` y `tests/`; `no-unused-vars` corre sobre el artefacto.
   Encontro
   cuatro llamadas a `paintGaragePanel` fuera de su scope, escondidas tras
   `typeof`: el garaje no se repintaba al volver de un freeze ni al cambiar AFK.
   Cerrado con un puente `postMessage` + gancho en `runQueue`, cubierto por el
   banco (418 checks). `no-unused-vars` no encontro residuos en HEAD, pero deja
   la puerta cerrada a la siguiente extraccion.
3. **`90-queue.js`**: quedan ~115 funciones con cierres. La herramienta (`tools/panel-map.js
   --nested`) ya dice cuáles no leen nada del cuerpo; esas salen sin cambios de cuerpo.

---

## Fase 6 · documentación

`README.md` que explique qué hace y qué no, `docs/ARCHITECTURE.md` con el mapa de módulos y el
contrato de cada uno, y un `CHANGELOG.md` que el usuario pueda leer sin abrir git.

---

## Cómo se ejecuta esto sin que yo esté despierto

El ciclo programado (`tools/afk-night.ps1`, cada 10 minutos, tarea
`scheduled-task:df1daf81-7efc-4c1f-b0ca-f4e094cef71a`) lee este archivo, toma la primera fase sin
cerrar, ejecuta **un** paso verificable, lo commitea y lo anota en `docs/NIGHT-LOG.md`. Si un gate se
pone rojo, no commitea: arregla o revierte y lo deja escrito.
