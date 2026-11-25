# Comparativa verificada · 25 de noviembre de 2026

Esta página compara el HEAD de NITRO WRAITH (8.14.84) con los auto-typers y
herramientas de Nitro Type que se pudieron verificar en fuentes primarias el
25/11/2026. No es un ranking de "mejor bot": mide lo que se puede comprobar
(código, pruebas, mantenimiento, interfaz y modelo de ejecución), no la
intención del autor ni una promesa de indetectabilidad.

## Método y límites

- Fuente de adopción: la ficha pública de GreasyFork y la API de GitHub, con
  la fecha de acceso indicada. Las instalaciones de GreasyFork no son usuarios
  únicos ni equivalen a cuentas activas.
- Fuente de comportamiento: el userscript servido por el propio canal de
  actualización, no un resumen de terceros. En NitroTyper el núcleo es un
  binario cerrado; solo se pudo leer su `race.user.js`.
- "Sin suite pública" significa que no se encontró una suite en la ficha, el
  repositorio o el código publicado. No demuestra que no exista una privada.
- "Input" distingue eventos DOM sintéticos de entrada del sistema. Un
  userscript despacha `KeyboardEvent` con `isTrusted=false`; una app nativa
  que teclea en la ventana enfocada puede producir entrada del sistema, pero
  el vector exacto de NitroTyper no es público.

## Matriz

| Proyecto | Modelo | Tracción verificada | Control | Pruebas públicas | Último mantenimiento | Input |
|---|---|---|---|---|---|---|
| **NITRO WRAITH 8.14.84** | userscript, MIT, sin runtime deps | 1 estrella, 0 forks, 0 issues en GitHub | panel, garage, TUNE, API de solo lectura | **568 checks** (86 + 418 + 31 + 9 + 24) | HEAD `b201955`, 2026-11-25 | DOM sintético (`isTrusted=false`) |
| **NitroTyper** | app nativa + `race.user.js`; acceso por Gumroad | no publica instalaciones; repo con 1 estrella y 1 fork | 5 modos, WPM/accuracy, nitro, escudo de DQ | ninguna del núcleo cerrado | repo 2026-05-02; sitio 2026 | nativo sobre ventana enfocada (inferido) |
| **591238** (PowerScripts) | userscript | 138 instalaciones; 0 ratings | panel, ritmo gaussiano, descansos | ninguna | v2.9.0, 2026-08-14 | DOM sintético |
| **536103** (Anon2004) | userscript | **5.143** instalaciones; 9 ratings 3/3/3 | constantes editadas a mano; sin UI | ninguna | v1.0.0, 2025-05-15 | DOM sintético |
| **552185** (David Bett) | userscript | 1.009 instalaciones; 0 ratings | consola: `start()` / `stop()` | ninguna | v1.0, 2025-10-10 | DOM sintético |
| **571935** (Pot of Greed) | userscript | 636 instalaciones; 0/0/1 ratings | GUI, pero sobrescribe ajustes con sesión | ninguna | v1.0, 2026-03-31 | DOM sintético |
| **UltraTypeBot** | extensión + userscript | 39 estrellas, 60 forks, 3 issues | overlay y API de add-ons | ninguna | último push 2023-02-12 | eventos del navegador |
| **Mod Menu 570117** | suite de mods | 530 instalaciones; 1 rating | manifiesto `ntcfg` | no revisado | v4.0.3, 2026-11-16 | no aplica |

## Lo que cambió respecto a la review anterior

La review de 8.14.84 decía que NitroTyper estaba "cerrado". Es falso: el sitio
sigue publicando una app para Windows, macOS y Linux, un `race.user.js` 5.5.1 y
cinco modos de carrera. Es el competidor de producto más fuerte, no un proyecto
abandonado. También obliga a matizar la frase "todos empatan en la frontera
física": todos los *userscripts* empatan, pero una app nativa que teclea en la
ventana enfocada puede estar en otra frontera. El vector exacto no se pudo
verificar porque el binario no es público.

## Hallazgos por rival

### NitroTyper — el competidor de producto

- La web describe builds nativos, cinco modos (Test, Single, Multi, Advanced,
  Pick-up), WPM y accuracy configurables, nitro automático, recuperación de DQ
  y sesiones largas. Según esa descripción, el `race.user.js` solo lee el texto
  de la carrera; el tecleo lo hace la app y exige la ventana activa.
- El userscript 5.5.1 carga jQuery 3.5.1 desde `code.jquery.com`, arranca con
  `eval(atob(...))` y pide grants amplios de Tampermonkey. Su `@updateURL`
  apunta a `master` aunque la rama por defecto del repo es `main`; hoy ambas
  resuelven, pero es una dependencia frágil.
- No publica suite de pruebas ni el código del núcleo. Es la diferencia
  principal frente a Wraith: producto más maduro en entrada nativa, mucho menos
  auditable en cadena de suministro.

### 536103 — el líder de adopción

- 5.143 instalaciones y 9 valoraciones repartidas 3 buenas / 3 OK / 3 malas.
  Es el número que Wraith no tiene; no es una medida de calidad.
- Se configura editando constantes y limpiando `localStorage`; no hay panel,
  límites de sesión, descansos ni pruebas. Sin cambios desde mayo de 2025.

### 552185 — pequeño y explícito

- 1.009 instalaciones, 7,09 KB, API de consola `start()` / `stop()`, horario
  día/noche, pausas y movimiento de ratón simulado.
- No tiene UI, límites ni pruebas; sigue congelado en octubre de 2025. Su
  ventaja real es el ratón, no la ingeniería.

### 571935 — la promesa que el código contradice

- La ficha promete "UNDETECTABLE" y controles de velocidad/precisión. El
  código, cuando existe `player_token`, escribe `WPM_VALUE: 100000` y
  `ACCURACY_VALUE: 100` en `typingBotConfig`; eso explica el 600+ WPM al 100% y
  que los controles no cambien nada en una sesión real.
- 636 instalaciones y una única valoración, mala. No es un rival técnico; es
  un ejemplo de por qué la ficha no sustituye al código.

### 591238 — el rival de interfaz

- 138 instalaciones, panel, ritmo gaussiano, presupuesto de errores y descansos
  cada 6–9 carreras; 0 ratings. Es el competidor más cercano en intención, pero
  su adopción es 37 veces menor que la de 536103 y no publica pruebas.

### UltraTypeBot — referencia histórica

- 39 estrellas, 60 forks, 3 issues abiertas y último push el 12/02/2023. No
  tiene release reciente. Su API de add-ons sigue siendo una buena referencia
  de diseño, no un competidor mantenido.

### Mod Menu 570117 — el ecosistema, no el bot

- 530 instalaciones, 4.0.3 del 16/11/2026, 388 KB y licencia personal. Su
  contrato `ntcfg:manifest:{id}` con secciones, campos tipados y `ntcfg:change`
  es el estándar de integración que Wraith todavía no publica. No compite en
  tecleo; compite por ser el centro de la configuración.

## Lectura competitiva

Wraith no gana en adopción: 1 estrella y 0 forks frente a 5.143 instalaciones
de 536103. Gana en lo que se puede auditar y mantener: 568 checks, cero
dependencias de ejecución, licencia MIT, releases automáticas, documentación y
límites explícitos. NitroTyper demuestra que existe un mercado para un producto
de pago con entrada nativa; Wraith no debe copiar el binario cerrado, pero sí
puede cerrar la brecha de integración con un manifiesto `ntcfg` de solo lectura
y seguir midiendo su propia frontera de input sin prometer lo que no puede.

La nota absoluta no cambia por esta comparación: sigue en **8,5/10 (A−)**. Lo
que cambia es la afirmación sobre el rival y la frase "todos empatan": ahora
está dicho con la precisión que el resto del review exige.

## Fuentes

- [GreasyFork 536103](https://greasyfork.org/en/scripts/536103-auto-typer-for-nitro-type-new-2025) (v1.0.0, actualizado 2025-05-15; acceso 2026-11-25).
- [GreasyFork 552185](https://greasyfork.org/en/scripts/552185-nitro-type-auto-typer) (v1.0, actualizado 2025-10-10; acceso 2026-11-25).
- [GreasyFork 571935](https://greasyfork.org/en/scripts/571935-auto-type-hack-undetectable) y su [código](https://update.greasyfork.org/scripts/571935/Nitro%20Type%20-%20Auto%20Type%20Hack%20%28UNDETECTABLE%29.user.js) (v1.0, 2026-03-31; acceso 2026-11-25).
- [GreasyFork 591238](https://greasyfork.org/en/scripts/591238) (v2.9.0, 2026-08-14; acceso 2026-11-25).
- [GreasyFork 570117 Mod Menu](https://greasyfork.org/en/scripts/570117-mod-menu) (v4.0.3, actualizado 2026-11-16; acceso 2026-11-25).
- [NitroTyper](https://nitrotyper.org/) y su [race.user.js 5.5.1](https://raw.githubusercontent.com/PrabhakarRai/nitro-type-autotyper-bot/main/race.user.js) (acceso 2026-11-25).
- [GitHub API: PrabhakarRai/nitro-type-autotyper-bot](https://api.github.com/repos/PrabhakarRai/nitro-type-autotyper-bot) (último push 2026-05-02; acceso 2026-11-25).
- [GitHub API: wwwg/UltraTypeBot](https://api.github.com/repos/wwwg/UltraTypeBot) (39 estrellas, 60 forks, último push 2023-02-12; acceso 2026-11-25).
- [GitHub API: ezurinho/nitro-wraith](https://api.github.com/repos/ezurinho/nitro-wraith) (1 estrella, 0 forks, push 2026-11-25; acceso 2026-11-25).
- [MDN: Event.isTrusted](https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted) (consultado 2026-11-25).
