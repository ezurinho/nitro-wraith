# Deep Research y Auditoría: NITRO WRAITH 8.14.78

> Generado: 2026-11-24 · Profundidad: deep · Fuentes: 33 · Revisión: solo lectura
>
> **Addendum de remediación:** R1 quedó corregido en la rama `fix/release-workflow-injection` con validación semver y paso por entorno; R9 quedó corregido en header, README y documentación. R2 y R3 siguen abiertos. La nota se mantiene en **6.6/10** hasta una nueva auditoría de esos dos críticos.

## TL;DR

NITRO WRAITH 8.14.78 es uno de los usuarioscripts de Nitro Type mejor documentados y probados del ecosistema público, pero la auditoría encuentra tres riesgos críticos: el workflow de release interpreta texto del Gist como shell, el estado no está aislado por cuenta y la exclusión multi-pestaña falla abierta. Su posición competitiva es fuerte en transparencia, interfaz, pruebas y mantenimiento, y débil en adopción, verificación de actualizaciones y garantías reales de concurrencia.

La calificación ponderada es **6.6/10**. No es una nota de funcionalidad vacía: 411/411 comprobaciones Chrome, 18/18 Firefox/WebKit y 24/24 capturas visuales pasan, pero esas suites no cubren los contratos críticos de producción, cambios de cuenta ni fallos de coordinación.

## Executive Summary

La revisión se hizo sobre `main` en el commit `cd05c45` (`release: 8.14.78 [skip ci]`), con el árbol limpio y las fuentes sincronizadas. El artefacto publicado en GitHub y el Gist son byte a byte idénticos: 1.117.809 bytes y SHA-256 `2c51c72353ad390ea45b1d4f725664a993d68afbc538489a9434bb41599aff71`. GreasyFork publica la versión 8.14.78, aunque su archivo instalable tiene una diferencia de 42 bytes correspondiente a los metadatos que la plataforma inyecta [2][3][4].

La fortaleza principal es de ingeniería: 22 fragmentos ordenados, un único IIFE, sin dependencias de ejecución, API local de solo lectura, documentación extensa, CI multi-motor, regresión visual y una disciplina de release poco común en este nicho [25][26][28][29]. Frente a competidores como 536103, 552185 o 591238, Wraith ofrece una superficie funcional mucho más completa: límites de sesión, descansos, cola, TUNE, garage, retos, AFK, resultados y una UI accesible por diseño. La mayoría de esos rivales publican código legible, pero no pruebas ni un ciclo de mantenimiento comparable [5][6][8].

La debilidad principal no está en el aspecto del panel, sino en las fronteras entre módulos. El lease y el Web Lock no son atómicos y fallan abiertos; el estado de historial, sesión, límites y bans no está separado por cuenta; varios caminos de recuperación pueden rearmar el bot después de una parada; y los paquetes de resultados pueden adjuntarse a una carrera posterior. Son fallos con efecto directo: doble tipado, cruce de cuentas, estadísticas divergentes y riesgo de DQ [30][31][32].

La cadena de publicación contiene además un hallazgo crítico: `release.yml` copia la primera línea `@version` del Gist a una salida de GitHub Actions y después la interpola directamente dentro de un script shell. Un Gist comprometido puede introducir sustitución de comandos en un runner con `contents:write`. La sincronización también compara solamente versión, no contenido, y el fallback de actualización acepta una versión superior sin hash, firma ni revisión fijada [27].

El contexto normativo es inequívoco: Nitro Type publicó una política oficial que indica que el botting conlleva una prohibición de por vida inmediata; sus términos prohíben bots y software de automatización, y el soporte describe baneos automáticos con discrecionalidad administrativa [16][17][18]. Ninguna mejora de UI, ritmo humano o concurrencia convierte la automatización en algo permitido. La ventaja defendible de Wraith es la transparencia y la calidad del software, no la promesa de indetectabilidad.

## 1. Estado actual y competidores directos [Confidence: High]

### 1.1 Posición de NITRO WRAITH

El repositorio se creó el 13 de noviembre de 2026 y, al momento de esta revisión, tenía una estrella, ningún fork y ningún watcher. La release 8.14.78 registraba una descarga del userscript y ninguna del metadato; GreasyFork mostraba cero instalaciones y cero valoraciones [1][2][3]. Son cifras de lanzamiento, no una medida de calidad. Sirven para recordar que Wraith todavía no tiene validación social comparable a la de sus rivales.

Donde sí lidera es en superficie y evidencia. El README documenta instalación, actualización, canary, rollback, privacidad, API local, seguridad y desarrollo. `DESIGN.md` convierte reglas de diseño en contrato: tokens, foco visible, movimiento reducido, ausencia de métricas inventadas y cero escrituras DOM en reposo. La suite de Chrome ejecuta 411 comprobaciones; Firefox y WebKit nueve por motor; y la matriz visual 24 capturas [25][26][29].

### 1.2 Competidores directos

**591238 — Auto Typer 109–131 WPM.** Es el rival más cercano en intención: panel arrastrable, WPM y precisión configurables, modo “Legit”, ritmo gaussiano, presupuesto de errores y ajuste según el progreso del rival. Su código acelera hasta 145–169 WPM y, con un 15 % de probabilidad aleatoria, hace una pausa de 3,5–5,5 segundos al 85 % del texto. Esa probabilidad no detecta la posición real; simplemente simula una variación de ritmo. Incluye descansos de 25–50 segundos cada 6–9 carreras y ningún conjunto de pruebas público [5].

**536103 — Auto Typer NEW 2025.** Con 5.141 instalaciones, es el líder de adopción entre los auto-typers inspeccionados. Su configuración exige editar constantes y limpiar `localStorage` desde la consola. Genera secuencias de WPM y precisión, aplica corrección por desviación y recarga la página cuatro segundos después de terminar. No tiene interfaz, límites de sesión, descansos ni pruebas [6].

**552185 — Nitro Type auto typer.** Es el más pequeño, unos 7 KB. Configura 40–50 WPM de día y 30–40 de noche, 97 % de precisión, pausas y movimiento sintético de ratón. Su API pública se reduce a `start()` y `stop()` en consola. No incluye límites de sesión, UI ni pruebas [8].

**571935 — Auto Type Hack “UNDETECTABLE”.** Su nombre hace una promesa que el código no demuestra. Además, cuando existe `player_token`, sobrescribe los ajustes guardados con valores extremos, lo que explica que sus controles resulten inefectivos para usuarios conectados. Es un ejemplo de por qué marketing y funcionalidad deben separarse [7].

**PrabhakarRai — Nitro Typer 5.5.1.** Su repositorio es público, pero el userscript utiliza dos cargas `eval(atob(...))`, jQuery remoto y permisos GM amplios. La URL de actualización apunta a `/master`, aunque la rama principal es `main`; actualmente el recurso remoto aún respolve, pero esa dependencia implícita es frágil. No publica pruebas ni releases, y su afirmación de “Ban Protection” no es auditable [9].

**UltraTypeBot.** Tiene 39 estrellas y 60 forks, API para extensiones y distribución como userscript y extensión. Sin embargo, el último commit es del 1 de febrero de 2023. El userscript carga `OUT.js` desde RawGit y el núcleo incorpora bibliotecas y un script propietario de estadísticas. Es un referente histórico de API, no un ejemplo actual de mantenimiento o cadena de suministro [10][14].

### 1.3 Matriz comparativa

| Criterio | NITRO WRAITH 8.14.78 | 591238 | 536103 | 552185 | PrabhakarRai | UltraTypeBot |
|---|---|---|---|---|---|---|
| Ritmo adaptativo | Cuenta, techo dinámico, WPM oficial | Rival y desviación | Secuencias y corrección | Día/noche | No verificable | Aleatorio configurable |
| Límites y descansos | Sesión, XP, horas, DQ, calendario | Descanso simple | No | No | No verificable | No |
| UI | Panel, garage, TUNE, LOG, temas | Panel simple | Consola | Consola | Externa/no verificable | Overlay y extensión |
| Pruebas públicas | 411 + 18 + 24 | No encontradas | No | No | No | No |
| Mantenimiento | Release diario, 8.14.78 | 2026-08-14 | 2025-05-15 | 2025-10-10 | 2026-05-02 | 2023-02-01 |
| Transparencia | Fuente completa, MIT, sin runtime deps | Legible, MIT | Legible, MIT | Legible, MIT | Ofuscado, jQuery remoto | Cargador remoto, stats propietario |
| Adopción visible | 0 GreasyFork, 1 estrella | 138 instalaciones | 5.141 | 1.008 | 1 estrella | 39 estrellas/60 forks |

La conclusión no es que Wraith “gane” en categoría de bot. Su ventaja es que comporta el proyecto como software mantenible: documentación, pruebas, release reproducible y límites explícitos. La desventaja es que esa disciplina todavía no se ha traducido en una base de usuarios ni en una verificación independiente suficiente.

## 2. Ecosistema, distribución y mantenimiento [Confidence: High]

### 2.1 Distribución

Wraith está disponible en GitHub, Gist y GreasyFork. El Gist es un espejo mutable, no una firma. GitHub y Gist coinciden byte a byte; GreasyFork coincide en versión y código funcional, con una diferencia de metadatos inyectados por la plataforma [2][3][4]. La redundancia es útil para descubrimiento y recuperación, pero cada canal añade una superficie de actualización que debe verificarse por contenido.

GreasyFork ordena por instalaciones diarias y el directorio de Nitro Type reúne aproximadamente 220 scripts [13]. Wraith entra en desventaja de descubrimiento: cero instalaciones frente a 5.141 de 536103 o 1.008 de 552185. Su README y su ficha son claros, pero necesitan prueba social, capturas actuales y un flujo de feedback visible.

### 2.2 Integración con mods

Mod Menu 570117 es el benchmark más útil del ecosistema. Su versión 4.0.3, actualizada el 16 de noviembre de 2026, tiene 529 instalaciones y un contrato real de integración: cada módulo publica un manifiesto en `ntcfg:manifest:{module-id}`, con secciones, campos tipados, acciones, notas y keymaps. Los cambios se propagan por `ntcfg:change`, almacenamiento reflejado y reinicio global opcional [11].

Wraith ya expone `window.NitroWraith` con snapshots de solo lectura, pero no publica un manifiesto `ntcfg`. La oportunidad es convertir esa API en un adaptador declarativo: exponer pace profile, custom WPM/accuracy, AFK, keep-alive, stickers, notificaciones y movimiento sin entregar setters arbitrarios ni ejecución remota. Sería una diferenciación frente a UltraType, cuya API es imperativa y está documentada principalmente por ejemplos [14].

### 2.3 Mantenimiento

El ciclo de release es automatizado y rápido. El workflow comprueba sincronización, prepara bump, actualiza Gist y publica assets. Es una fortaleza, pero también produce una versión nueva por cada merge que toca `src/`; en una sola jornada se publicaron varias versiones 8.14.x [2]. Para un proyecto con adopción temprana, ese volumen puede dificultar el soporte y el rollback si no existe una política clara de canary y estabilización.

La deuda visible incluye `package-lock.json` en 8.14.74 mientras `package.json` está en 8.14.78. No rompe el runtime, pero impide que “todas las versiones coinciden” sea una afirmación literal. También conviene proteger `main`, fijar acciones por commit SHA y el contenedor de Playwright por digest, y habilitar actualizaciones de seguridad de dependencias.

## 3. Evaluación crítica [Confidence: High]

### 3.1 Correctness y concurrencia — 5.0/10

**Crítico C1 — Estado compartido entre cuentas.** Las claves de historial, sesión, límites, tanda, DQ, caja y preferencias no están separadas por cuenta [31]. `ensureCalibrationAccount()` borra únicamente calibración; el resto del estado sobrevive a un cambio de usuario. Además, las lecturas asíncronas de cuenta no revalidan la identidad después del `await`, y el listener de resultados captura el `userId` una sola vez [31][32].

Efecto: cambiar de cuenta puede heredar carreras, XP, límites, rachas, bans, cajas y objetivos de otra persona. Una calibración de A puede terminar aplicada a B. En un navegador compartido, el historial también puede filtrar rendimiento previo.

**Crítico C2 — Exclusión multi-pestaña no atómica y fail-open.** `acquireTypingLock()` devuelve éxito cuando Web Locks no está disponible. `claimTabLease()` hace lectura, comprobación y escritura separadas, y devuelve éxito si falla `localStorage`. La renovación y liberación del lease no validan un token de propietario completo. La comprobación del lock ocurre antes de esperar, pero no inmediatamente antes de enviar cada tecla [30][32].

Efecto: dos pestañas pueden creer dueñas, escribir a la vez, reclamar cajas o navegar simultáneamente. Un fallo de almacenamiento desactiva silenciosamente la exclusión. Un hermano obsoleto puede borrar el lease de uno nuevo.

**Importante I1 — La parada no es durable en todos los caminos.** `runAuto()` limpia `session.stopped` y el boot lo llama sin consultar una parada persistente. La recuperación de login también rearma la cola, y algunos reintentos de “Race Again” pulsan antes de la siguiente comprobación de stop [32].

Efecto: una recarga completa o una recuperación puede reanudar el bot cuando el usuario esperaba que siguiera detenido.

**Importante I2 — Paquetes de resultado no están ligados a una carrera.** `pendingResult` y `pendingServerWpm` se adjuntan a la siguiente fila disponible. `clearHistory()` no los limpia. Una fusión con `Object.assign` puede sobrescribir dinero o XP con cero. El WPM oficial corrige historial y tanda, pero no todos los agregados diarios o cerrados [32].

Efecto: resultados tardíos pueden contaminar otra carrera, borrar recompensas o producir medias divergentes entre session, día y tanda.

**Importante I3 — Algunos fallos en carrera liberan la protección.** Ciertos timeouts de CAPTCHA o carreras estancadas llaman `panic()`, que libera lock y lease mientras la carrera sigue viva [32].

Efecto: otra pestaña puede tomar el control o la cuenta puede recibir un DQ por inactividad justo cuando el sistema intentaba protegerla.

**Menor M1 — Precisión 100 % con presupuesto mínimo de un error.** El modelo de errores usa un piso de uno. Un objetivo de 100 % puede inducir intencionalmente una equivocación [32].

**Menor M2 — Selección de nitro O(n²).** `nitroTarget()` recorre todas las palabras antes de comprobar si está desactivado o agotado, y se invoca por tecla. En carreras largas el trabajo acumulado es innecesario [32].

### 3.2 Seguridad y cadena de suministro — 4.5/10

**Crítico C3 — Inyección de shell desde el Gist en release CI.** `release.yml` lee la primera línea `@version` del Gist y la guarda sin validación. Después inserta `${{ steps.gist.outputs.GIST_VERSION }}` directamente dentro de un script shell [27]. Un atacante con control del Gist puede incluir sustitución de comandos en ese valor y ejecutar código en un runner con `contents:write`.

Efecto: compromiso del canal de usuarioscript escala a compromiso del repositorio y de las releases. La confirmación de Tampermonkey no protege el runner.

**Importante I4 — Fallback mutable sin autenticidad.** El updater acepta una versión superior desde el Gist sin digest, firma, revisión fijada ni hash esperado. La auto-actualización está activada por defecto y navega al archivo tras una cuenta atrás [27].

Efecto: una cuenta o token de Gist comprometido puede servir código arbitrario con versión superior. Tampermonkey pide confirmación, pero no autentica el contenido.

**Importante I5 — Sincronización solo por versión.** El workflow considera el Gist sincronizado si `@version` coincide. Actualiza Gist antes de publicar GitHub y reutiliza tags existentes sin comprobar que apunten al HEAD verificado [27].

Efecto: contenido malicioso o corrupto con la misma versión puede aceptarse como válido; un fallo parcial deja canales mezclados; un tag reutilizado puede falsear procedencia.

**Importante I6 — Metadato de seguridad contradice el techo real.** El header y el README dicen “hard 120 WPM ceiling”, pero `ceilingFor()` deriva un techo de hasta 300 WPM según el top de la cuenta [31]. Las pruebas esperan explícitamente 223 y 300.

Efecto: el usuario recibe una promesa de límite que no coincide con el comportamiento. Esto es material para riesgo de cuenta y confianza.

**Menor M3 — Documentación de actualización imprecisa.** `SECURITY.md` dice que las comprobaciones abren una pestaña nueva y nunca instalan automáticamente; el código usa `location.assign` en la misma pestaña tras la cuenta atrás, aunque Tampermonkey todavía confirma.

**Menor M4 — Endurecimiento de CI incompleto.** `main` no está protegido; las acciones usan tags mayores mutables; el contenedor no está fijado por digest; Dependabot de seguridad está desactivado; y el lockfile conserva una versión anterior.

### 3.3 Pruebas y CI — 8.5/10

La suite oficial pasa: build sincronizado, 2/2 paleta, 25/25 cola, 86/86 CLI, 411/411 Chrome, 9/9 Firefox, 9/9 WebKit y 24/24 visuales. Es una base excelente y superior a todos los competidores inspeccionados.

La limitación es de contrato, no de cantidad. `tests/live/run.js` y `tests/browsers/smoke.js` sirven HTML y API simulados. No existe un canary de solo lectura contra producción que verifique campos reales, cambios de DOM, autenticación, rate limits o comportamiento de resultados. Las pruebas multi-pestaña tampoco cubren fallos de Web Locks, almacenamiento bloqueado ni cambios de cuenta durante awaits.

### 3.4 UI/UX y accesibilidad — 7.5/10

La UI es visualmente consistente, temática, responsive en anchos normales y con foco visible. Los tokens comparten paleta entre panel y garage, y el contrato de diseño exige cero escrituras DOM en reposo. La revisión visual y el smoke multi-motor pasan.

**Importante I7 — Movimiento “calm” no cubre todo.** RGB hue, border, title y pulsos continúan animándose con `data-motion="calm"` o `"standard"`. El garage no recibe la misma política de movimiento. `prefers-reduced-motion` sí funciona a nivel de SO, pero la preferencia dentro de la app no es equivalente [33].

**Importante I8 — Garage roto en viewport corto/estrecho.** A 160×450 CSS px, el panel medía aproximadamente 128×649 px, con la cabecera fuera de pantalla y el botón de plegado fuera del viewport. `max-height` es `none` y `overflow-y` está oculto [33].

**Importante I9 — Semántica de pace incompleta.** El control segmentado actualiza `data-active`, pero no expone `aria-pressed` ni `radiogroup`. Un lector de pantalla no puede determinar el perfil seleccionado [33].

**Importante I10 — Teclado y foco en garage.** Arrastrar es solo con puntero; “Next race” se implementa sobre un `<b>` no enfocable; plegar llama `blur()` y pierde el foco. No hay paridad de teclado [33].

**Importante I11 — Escala 115 % no escala tipografía.** La opción promete ensanchar panel y texto, pero solo cambia ancho. Una carrera estancada también mantiene WPM/precisión acumulados y puede seguir pareciendo “LIVE” salvo por una etiqueta pequeña [33].

**Menor M5 — Docs y capturas obsoletas.** README y DESIGN hablan de 322 px/bottom-right; la implementación usa 330 px/bottom-left. Las capturas públicas muestran versiones y límites antiguos.

### 3.5 Arquitectura y rendimiento — 8.0/10

La arquitectura de 22 fragmentos en un IIFE es simple, desplegable y sin dependencias. La UI se monta por vistas, usa Shadow DOM para aislamiento y compara antes de escribir. El panel y el garage tienen pruebas de cero mutaciones en reposo.

La deuda está en trabajos repetidos y ciclo de vida: selección de nitro O(n²), heartbeat Worker perpetuo incluso sin lease, timers Worker que no se cancelan realmente y guardados de preferencias que pueden pisar cambios de otra pestaña. No son fallos visibles de un solo uso, pero acumulan CPU, wakeups y riesgo de estado.

### 3.6 Release y mantenimiento — 8.5/10

El release está automatizado, los assets existen, el tag apunta al commit correcto y los tres canales publican 8.14.78. El README, CHANGELOG y badge se actualizan. GreasyFork ya está enlazado y el perfil público usa `ezur`, sin nombre real ni email visible.

Las mejoras pendientes son publicación por digest, verificación post-release, protección de `main`, fijado de acciones/contenedor, sincronización del lockfile y una política de versiones que no confunda frecuencia con estabilidad. La adopción sigue siendo baja: cero instalaciones GreasyFork, una estrella GitHub y ningún fork.

## 4. Calificación ponderada

| Categoría | Peso | Nota | Justificación |
|---|---:|---:|---|
| Correctness y concurrencia | 25 % | 5.0 | Cuentas no aisladas, lease fail-open, stop no durable, resultados no ligados a carrera |
| Seguridad y supply chain | 20 % | 4.5 | Privacidad runtime fuerte, pero inyección en release CI y fallback mutable sin integridad |
| Pruebas y CI | 20 % | 8.5 | 411 + 18 + 24 verdes; falta canary de producción y pruebas de fallos multi-pestaña |
| UI/UX y accesibilidad | 15 % | 7.5 | UI sólida; movimiento, garage estrecho, ARIA y teclado pendientes |
| Arquitectura y rendimiento | 10 % | 8.0 | Modular, sin deps, cero DOM idle; timers y O(n²) nitro |
| Release y mantenimiento | 10 % | 8.5 | Releases y canales sincronizados; endurecimiento y adopción pendientes |
| **Total** | **100 %** | **6.6/10** | Producto fuerte con tres bloqueantes críticos |

La nota no borra el trabajo previo: significa que la barra de “production-safe” es más alta que la barra de “demo impresionante”. Wraith ya está muy cerca del primer grupo en presentación y pruebas; los críticos actuales están concentrados en coordinación, cuentas y publicación.

## 5. Plan de acción verificable

### Quick wins — 1–2 días

- [ ] Validar `GIST_VERSION` con una expresión estricta de versión semver y pasar valores remotos por entorno, nunca por interpolación de shell.
- [ ] Corregir el metadato de 120 WPM o documentar el techo dinámico con precisión; regenerar capturas públicas.
- [ ] Hacer que Web Locks no disponible y errores de almacenamiento fallen cerrados: pausar, avisar y no enviar teclas.
- [ ] Revalidar lease, standby y lock inmediatamente antes de cada tecla, navegación y acción de caja.
- [ ] Respetar `session.stopped` antes de boot, login recovery, reload, reintentos y acciones diferidas.
- [ ] Añadir `aria-pressed`/`radiogroup` al selector de pace y convertir “Next race” en botón real.
- [ ] Aplicar `data-motion` al garage y suprimir RGB/pulsos en calm/standard.
- [ ] Sincronizar `package-lock.json` y proteger `main` con checks requeridos.

### Trabajo estructural — 3–7 días

- [ ] Separar por cuenta: historial, contadores, límites, DQ, ban, caja, tanda y calibración; revalidar identidad después de cada await.
- [ ] Ligar resultados y WPM oficial a un `raceId` con TTL; ignorar sobrescrituras con cero; reconciliar todos los agregados.
- [ ] Reescribir lease/lock como una sección crítica con token de propietario, timeout y revalidación tras adquisición.
- [ ] Añadir pruebas de estrés con dos pestañas, Web Locks bloqueado, `localStorage` bloqueado, cambio de cuenta y recarga.
- [ ] Publicar hashes SHA-256 y un manifiesto de release; verificar GitHub, Gist y GreasyFork por digest.
- [ ] Añadir un canario de producción de solo lectura que valide DOM/API reales sin automatizar carreras.

### Deuda que requiere caracterización

- [ ] Medir el costo real de `nitroTarget()` y cachear por carrera.
- [ ] Inventariar y cancelar timers Worker cuando no hay lease o la sesión está detenida.
- [ ] Unificar guardados de preferencias con merge/compare bajo lock para evitar pérdida de actualizaciones.
- [ ] Definir una matriz de movimiento para seis temas, tres niveles, dos paneles y `prefers-reduced-motion`.
- [ ] Diseñar un adaptador `ntcfg:manifest` de solo lectura/alcance limitado para Mod Menu.

### Criterios verificables para 10/10

1. Ningún hallazgo Critical o Important abierto.
2. Prueba A/B demuestra aislamiento total al cambiar de cuenta, incluso durante calibración y resultados asíncronos.
3. Estrés multi-pestaña demuestra como máximo una tecla, navegación, DQ o caja simultánea, incluso con fallos de lock/storage.
4. La parada sobrevive reload, bfcache, login recovery y callbacks diferidos.
5. Resultados ligados a carrera no contaminan otras filas ni producen agregados divergentes.
6. Actualizaciones verificadas por digest, con tags y assets inmutables y publicación post-verificada.
7. Matrix de accesibilidad y viewport 160/200/300/360 px y 300/450 px sin clipping ni controles inaccesibles.
8. Canary de producción valida contratos reales sin ejecutar automatización.
9. Suite oficial verde y evidencia publicada de rendimiento, memoria y cero DOM idle.

## 6. Preguntas abiertas y caveats

- No se encontró una fuente oficial que defina criterios de DQ por cheating; la política oficial sí prohibe bots y anuncia ban de por vida, pero no detección instantánea garantizada [16][17][18].
- Las cifras de instalaciones, estrellas y descargas son fotografías puntuales; no equivalen a usuarios activos ni satisfacción.
- La acusación de criptominería contra UltraType en issues no está verificada y no debe tratarse como hecho.
- No se ejecutó una prueba de explotación contra CI ni se modificó el Gist; el hallazgo de shell se basa en el flujo de datos y reproducción local inofensiva.
- La revisión de UI usó probes adicionales en Firefox, pero no una sesión completa de lector de pantalla.
- El informe no autoriza ni recomienda eludir la política de Nitro Type. Su propósito es evaluar software y riesgo.

## 7. Metodología

Profundidad deep. Se realizaron cuatro retrieval agents en paralelo para competidores, política, ingeniería de userscripts y ecosistema; un verification agent comprobó nueve afirmaciones de alto impacto; un gap-fill agent recuperó la URL canónica de la política oficial de botting; y un synthesis agent preparó la narrativa comparativa. Tres agentes de revisión inspeccionaron correctness/concurrencia, seguridad/supply chain y UI/accesibilidad.

La suite oficial se ejecutó localmente: `npm run check` terminó en 411/411; `npm run visual` en 24/24; `npm run test:browsers` en 9/9 por motor. La revisión de GitHub/Gist/GreasyFork verificó versión y hashes. No se editaron archivos del proyecto durante la auditoría; este informe es el único artefacto nuevo.

Correcciones de citas: la política oficial usa la URL canónica `/news/read/265/keeping-nitro-safe--fair-for-all`; 536103 tenía 5.141 instalaciones, no 5.140; la pausa del 15 % de 591238 es aleatoria, no detección de posición; `/master` de PrabhakarRai actualmente resuelve, por lo que se describe como fragilidad, no como enlace roto; GreasyFork no es byte a byte idéntico por sus metadatos inyectados.

## Bibliography

[1] ezurinho — nitro-wraith repository — https://github.com/ezurinho/nitro-wraith — accessed 2026-11-24 — Tier 1.

[2] ezurinho — NITRO WRAITH v8.14.78 release — https://github.com/ezurinho/nitro-wraith/releases/tag/v8.14.78 — accessed 2026-11-24 — Tier 1.

[3] ezur — NITRO WRAITH on Greasy Fork, script 607114 — https://greasyfork.org/en/scripts/607114-nitro-wraith — accessed 2026-11-24 — Tier 1.

[4] ezurinho — NITRO WRAITH Gist mirror — https://gist.github.com/ezurinho/88f8b25546f8bb0ea588291bab8ffa58 — accessed 2026-11-24 — Tier 1.

[5] PowerScripts/Anon2004 — Auto Typer 109–131 WPM + Adaptive Lead/Lag — https://greasyfork.org/en/scripts/591238-auto-typer-for-nitro-type-109-131-wpm-adaptive-lead-lag-control/code — accessed 2026-11-24 — Tier 2.

[6] Anon2004 — Auto Typer for Nitro Type NEW 2025 — https://greasyfork.org/en/scripts/536103-auto-typer-for-nitro-type-new-2025/code — accessed 2026-11-24 — Tier 2.

[7] Pot of Greed — Nitro Type Auto Type Hack UNDETECTABLE — https://greasyfork.org/en/scripts/571935-nitro-type-auto-type-hack-undetectable/code — accessed 2026-11-24 — Tier 2 for code, Tier 3 for safety claims.

[8] King’s group/David Bett — Nitro Type auto typer — https://greasyfork.org/en/scripts/552185-nitro-type-auto-typer/code — accessed 2026-11-24 — Tier 2.

[9] PrabhakarRai — nitro-type-autotyper-bot — https://github.com/PrabhakarRai/nitro-type-autotyper-bot — accessed 2026-11-24 — Tier 1 repository, code opacity noted.

[10] wwwg — UltraTypeBot — https://github.com/wwwg/UltraTypeBot — accessed 2026-11-24 — Tier 1 repository, stale maintenance noted.

[11] Captain.Loveridge — Nitro Type Mod Menu 570117 — https://greasyfork.org/en/scripts/570117-nitro-type-mod-menu — accessed 2026-11-24 — Tier 1.

[12] Greasy Fork — Mod Menu 570117 stats — https://greasyfork.org/en/scripts/570117-nitro-type-mod-menu/stats — accessed 2026-11-24 — Tier 1.

[13] Greasy Fork — scripts for nitrotype.com — https://greasyfork.org/en/scripts/by-site/nitrotype.com — accessed 2026-11-24 — Tier 1.

[14] UltraType — API README — https://github.com/wwwg/UltraTypeBot/blob/master/api/README.md — accessed 2026-11-24 — Tier 1 repository documentation, stale.

[15] UltraTypeBot — public issues — https://github.com/wwwg/UltraTypeBot/issues — accessed 2026-11-24 — Tier 3 community reports.

[16] Nitro Type — Keeping Nitro Safe & Fair for All — https://www.nitrotype.com/news/read/265/keeping-nitro-safe--fair-for-all — published 2024-05-26 — Tier 1.

[17] Nitro Type — Terms of Service — https://www.nitrotype.com/support/tos — accessed 2026-11-24 — Tier 1.

[18] Nitro Type — Support FAQ — https://www.nitrotype.com/support — accessed 2026-11-24 — Tier 1.

[19] Greasy Fork — Rules for posted scripts — https://greasyfork.org/en/help/code-rules — accessed 2026-11-24 — Tier 1.

[20] Tampermonkey — FAQ Q300, page access and security — https://www.tampermonkey.net/faq.php?q=Q300 — accessed 2026-11-24 — Tier 1.

[21] Tampermonkey — Documentation index — https://www.tampermonkey.net/documentation.php?locale=en — accessed 2026-11-24 — Tier 1 index, detailed bodies not verified.

[22] Chrome for Developers — Improving security in Manifest V3 — https://developer.chrome.com/docs/extensions/develop/migrate/improve-security — accessed 2026-11-24 — Tier 1.

[23] MDN — Using shadow DOM — https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM — accessed 2026-11-24 — Tier 1/2.

[24] MDN — Web Locks API — https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API — accessed 2026-11-24 — Tier 1.

[25] NITRO WRAITH — README.md — local `README.md` — reviewed 2026-11-24 — Tier 1 project documentation.

[26] NITRO WRAITH — DESIGN.md — local `DESIGN.md` — reviewed 2026-11-24 — Tier 1 project contract.

[27] NITRO WRAITH — `.github/workflows/release.yml` — local lines 81–105, 124–181 — reviewed 2026-11-24 — Tier 1 primary code.

[28] NITRO WRAITH — `src/README.md` — local module map — reviewed 2026-11-24 — Tier 1 project documentation.

[29] NITRO WRAITH — `tests/live/run.js`, `tests/browsers/smoke.js`, `tests/visual/` — local test sources — reviewed 2026-11-24 — Tier 1 primary code.

[30] NITRO WRAITH — `src/96-guard.js:96–281` — local lock/lease implementation — reviewed 2026-11-24 — Tier 1 primary code.

[31] NITRO WRAITH — `src/30-profile.js:325–427`, `src/10-config.js:850–886`, `src/50-state.js` — local account/calibration/storage implementation — reviewed 2026-11-24 — Tier 1 primary code.

[32] NITRO WRAITH — `src/72-results.js:63–205,715–750,779–794,905–970`, `src/32-history.js`, `src/70-session.js`, `src/60-pacing.js` — local results/session/pacing implementation — reviewed 2026-11-24 — Tier 1 primary code.

[33] NITRO WRAITH — `src/79-panel-css.js:167–249,348–388,1069–1071`, `src/83-panel-html.js`, `src/90-queue.js:1873–1917,1975–1978,2180–2235,2303–2672` — local UI implementation — reviewed 2026-11-24 — Tier 1 primary code.

## Source Extracts

### [1]–[4] NITRO WRAITH distribution

- **Summary:** Repositorio nuevo, Release 8.14.78 automatizada, Gist idéntico al asset de GitHub y ficha GreasyFork en la misma versión.
- **Key data:** 1 estrella, 0 forks, 0 instalaciones GreasyFork; SHA-256 del userscript `2c51c72353ad390ea45b1d4f725664a993d68afbc538489a9434bb41599aff71`.
- **Source type:** primary project/platform evidence.
- **Credibility tier:** 1.

### [5] 591238

- **Summary:** Panel simple, pacing gaussiano, errores presupuestados y ajuste por progreso del rival.
- **Key quotes:** `const surgeWpm = Math.floor(Math.random() * 25) + 145;`; `this.isSecondPlaceRace = Math.random() < 0.15;`.
- **Limit:** La pausa final es aleatoria; no demuestra posición real ni “anti-ban”.
- **Credibility tier:** 2 for code, 3 for marketing.

### [6] 536103

- **Summary:** Configuración por constantes y consola, secuencias de 100–125 WPM y recarga tras carrera.
- **Key quotes:** `const MIN_WPM = 100;`; `const MAX_WPM = 125;`; `setTimeout(() => window.location.reload(), 4000);`.
- **Credibility tier:** 2.

### [7] 571935

- **Summary:** Código legible pero inconsistente; con `player_token` sobrescribe ajustes por valores extremos.
- **Key quote:** `WPM_VALUE: parseInt(100000), ACCURACY_VALUE: parseInt(100)`.
- **Limit:** “Undetectable” no está respaldado por evidencia.
- **Credibility tier:** 2 for code, 3 for claims.

### [8] 552185

- **Summary:** Implementación compacta de 7 KB, ritmo día/noche y pausas, sin UI ni topes.
- **Key quotes:** `wpmDayMin: 40, wpmDayMax: 50`; `accuracyPercent: 97`; `pausePerRace: 5 + Math.floor(Math.random()*3)`.
- **Credibility tier:** 2.

### [9] PrabhakarRai

- **Summary:** Userscript público con doble `eval(atob(...))`, jQuery remoto y permisos GM amplios.
- **Key quotes:** `@require https://code.jquery.com/jquery-3.5.1.min.js`; `eval(atob(`.
- **Limit:** La URL `/master` responde actualmente, pero la rama principal es `main`.
- **Credibility tier:** 1 repository, opacity limits audit.

### [10] UltraTypeBot

- **Summary:** API y extensión con tracción histórica, pero último commit en 2023 y cargador remoto.
- **Key quote:** `var OUT = "https://rawgit.com/ultratype/UltraTypeBot/master/OUT/OUT.js";`.
- **Credibility tier:** 1 repository, stale and remote-code caveats.

### [11]–[13] Mod Menu y directorio

- **Summary:** Mod Menu aporta un contrato `ntcfg:manifest` real, 529 instalaciones y actualizaciones recientes.
- **Key quotes:** “The mod menu discovers modules via manifests stored under `ntcfg:manifest:{your-module-id}`”; “Register its manifest on load”; “Listen for `ntcfg:change` events”.
- **Credibility tier:** 1.

### [16]–[18] Política oficial

- **Summary:** Nitro Type prohíbe bots y anuncia ban de por vida inmediata; ToS y soporte permiten sanciones discrecionales.
- **Key quotes:** “botting is not allowed and will result in an immediate lifetime ban”; “use of cheats, bots, automation software, hacks, or any third-party software designed to interfere with the Services”; “a ban removal is at the discretion of the admins in all cases”.
- **Credibility tier:** 1.

### [19]–[24] Reglas y primitivas de seguridad

- **Summary:** GreasyFork exige código primario en plataforma, sin ofuscación y con actualizaciones como máximo diarias. Tampermonkey advierte riesgo. Chrome desaconseja código remoto. Shadow DOM no es seguridad. Web Locks ofrece exclusividad, liberación automática y `AbortSignal`.
- **Key quotes:** “The primary functionality of a script must be within the code on Greasy Fork”; “Code posted to Greasy Fork must not be obfuscated or minified”; “The default mode is ‘exclusive’”; “you should not consider this a strong security mechanism”.
- **Credibility tier:** 1/2.

### [27] Release workflow

- **Summary:** La versión del Gist se copia sin validación y se interpola en shell; la sincronización compara versión, no bytes.
- **Key lines:** `release.yml:81–84`, `release.yml:97–105`, `release.yml:124–181`.
- **Effect:** compromiso del Gist puede escalar a ejecución en CI con escritura de contenidos.
- **Credibility tier:** 1 primary code.

### [30]–[33] Runtime crítico

- **Summary:** Lock/lease fail-open, estado de cuenta no aislado, resultados no ligados a carrera y brechas de UI en movimiento, teclado y viewport estrecho.
- **Key lines:** `src/96-guard.js:96–104,187–210,219–248`; `src/30-profile.js:339–381,421–427`; `src/72-results.js:63–110,715–750,905–970`; `src/79-panel-css.js:348–388`; `src/90-queue.js:1975–1978,2303–2672`.
- **Credibility tier:** 1 primary code.

## Appendix A — Risk register priorizado

| ID | Severidad | Hallazgo | Evidencia | Efecto | Coste de corrección |
|---|---|---|---|---|---|
| R1 | Critical | Versión del Gist interpolada en shell de release | `release.yml:81–105` [27] | Ejecución de comandos en runner con `contents:write` | Bajo |
| R2 | Critical | Estado no aislado por cuenta | `10-config.js:850–886`, `30-profile.js:339–381`, `50-state.js` [31] | Cruce de historial, límites, bans y calibración | Alto |
| R3 | Critical | Lock/lease fail-open y no atómico | `96-guard.js:96–104,187–248`, `72-results.js:715–750` [30][32] | Doble tipado, navegación o caja simultánea | Alto |
| R4 | Important | Parada no durable | `72-results.js:511–530,951–970`, `90-queue.js:4510–4551`, `97-boot.js:261` [32] | Reanudación inesperada | Medio |
| R5 | Important | Resultados no ligados a carrera | `32-history.js:27–105`, `72-results.js:63–205` [32] | Estadísticas y recompensas incorrectas | Medio |
| R6 | Important | Fallo en carrera libera lock/lease | `72-results.js:779–794`, `70-session.js:555–592` [32] | DQ o toma de control por otra pestaña | Medio |
| R7 | Important | Gist mutable sin integridad | `10-config.js:385–388,558–786` [27] | Descarga de código no autenticado | Medio |
| R8 | Important | Sincronización solo por versión | `release.yml:97–181` [27] | Canales corruptos o procedencia falsa | Medio |
| R9 | Important | Promesa de 120 WPM contradice techo dinámico | `30-profile.js:421–427`, header y README [31] | Riesgo mal comunicado | Bajo |
| R10 | Important | Movimiento calm/standard incompleto | `79-panel-css.js:348–388`, `90-queue.js:2180–2235` [33] | Distracción y GPU/paint innecesario | Bajo |
| R11 | Important | Garage roto a 160×450 | `90-queue.js:1975–1978`, test coverage [33] | Controles inaccesibles | Medio |
| R12 | Important | Pace sin estado ARIA y teclado incompleto | `83-panel-html.js:215–220`, `90-queue.js:2303–2672` [33] | Uso imposible con lector/teclado | Bajo |
| R13 | Important | Sin canary de contrato de producción | `tests/live/run.js:98–154`, `tests/browsers/smoke.js:45–77` [29] | Cambios reales de Nitro Type pasan desapercibidos | Medio |
| R14 | Minor | Precisión 100 % con error mínimo | `60-pacing.js:260–281` [32] | Objetivo incumplido | Bajo |
| R15 | Minor | Nitro O(n²) | `60-pacing.js:351–400`, `72-results.js:826` [32] | CPU acumulativo | Bajo |
| R16 | Minor | Heartbeat y timers perpetuos | `20-utils.js:108–136`, `96-guard.js:273–281` [30] | Wakeups y memoria | Bajo |
| R17 | Minor | Lockfile desactualizado | `package-lock.json:3,9` | Deriva de versión | Bajo |
| R18 | Minor | Capturas y docs obsoletos | README/DESIGN/previews [25][26][33] | Confianza y soporte | Bajo |

La prioridad no depende de lo visible que sea el fallo. R1 es el primer quick win porque puede comprometer el repositorio, aunque el usuario nunca vea el síntoma. R2 y R3 son estructurales porque afectan exactamente a los escenarios en que un usuario confía en que “una sola copia” y “una sola cuenta” significan algo verificable. R4–R6 deben cerrarse antes de ampliar la base de usuarios, porque un reanudación inesperada o un resultado cruzado genera pérdida de confianza inmediata.

## Appendix B — Evidencia de verificación ejecutada

La revisión no se limitó a leer el diff. Se ejecutó `npm run check`, que encadena sincronización del build, comprobaciones de sintaxis, README, release, pruebas unitarias, CLI y Chrome. El resultado final fue **411/411 checks passed**. Después se ejecutó `npm run visual`: **24/24 shots within the threshold**. Por último, `npm run test:browsers`: **9/9 Firefox**, **9/9 WebKit**, sin errores de página no capturados.

También se verificó la procedencia de los artefactos. La release `v8.14.78` apunta a `cd05c45`; el asset `nitro-wraith.user.js` pesa 1.117.809 bytes y coincide con el Gist. La ficha de GreasyFork declara 8.14.78 y contiene la API `window.NitroWraith`. Esta comprobación demuestra coherencia puntual, no autenticidad futura: el workflow actual no verifica hashes ni firma el contenido.

Las pruebas de UI adicionales encontraron que una sesión Firefox con RGB + calm + running mantenía `nt-rgb-hue`, `nt-rgb-angle`, `nt-rgb-title` y `nt-pulse`. El garage a 160×450 CSS px quedó con la cabecera por encima del viewport y el botón de plegado fuera de la pantalla. El selector de pace no expuso `aria-pressed` antes ni después de cambiar a “fast”. Plegar el garage dejó `shadowRoot.activeElement` en `null`. Estos probes son reproducibles y no dependen de preferencias personales.

No se ejecutó una explotación real contra GitHub Actions. La reproducción del hallazgo R1 fue inofensiva y local: demostró que una salida con sintaxis de sustitución de comandos se evalúa cuando se inserta en un bloque `run:`. La conclusión se apoya en el flujo de datos del workflow y en los permisos declarados, no en una prueba destructiva.

## Appendix C — Por qué la nota no es 10/10

Una nota alta en pruebas no compensa un fallo de exclusión. Si dos pestañas escriben la misma carrera, el resultado no es una regresión cosmética: puede producir doble entrada, recompensas dudosas, DQ y pérdida de cuenta. Del mismo modo, una inyección en release CI no se compensa con 24 capturas perfectas. La ponderación del skill refleja esa prioridad: correctness y seguridad suman el 45 % de la nota.

Wraith tampoco obtiene 10/10 en UI por ser bonito. El contrato de accesibilidad exige comportamiento verificable en teclado, lector de pantalla, movimiento reducido y viewports estrechos. La base visual es excelente, pero “calm” que no calma, un garage que se sale de la pantalla y un selector sin estado accesible son deuda funcional, no gusto.

Finalmente, 10/10 requiere que las promesas públicas correspondan al código. El header dice 120 WPM y el motor puede llegar a 300; la documentación dice bottom-right y el panel está bottom-left; las capturas muestran versiones antiguas. En un userscript que automatiza una cuenta, la precisión del disclosure es parte de la seguridad.

## Appendix D — Cómo repetir la comparación

Cada trimestre conviene repetir una matriz mínima con fecha y evidencia: versión, última actualización, instalaciones, estrellas/forks, presencia de UI, límites de sesión, manejo de DQ, dependencias remotas, legibilidad del código, pruebas/CI, canal de actualización y licencia. Los contadores deben registrarse como fotografías puntuales, nunca como usuarios activos.

Para Wraith, la revisión debe además comprobar cuatro invariantes: (1) GitHub, Gist y GreasyFork tienen el mismo digest o una diferencia de metadatos documentada; (2) el tag apunta al commit fuente; (3) el header y la UI describen el techo real; (4) ninguna credencial o nombre personal aparece en perfiles, logs o reportes. Estos invariantes son más útiles que una calificación subjetiva aislada.

La comparación con UltraType y Mod Menu debe separar API de seguridad. Una API pública puede ser valiosa sin ser una puerta trasera: snapshots de solo lectura, eventos versionados y manifiestos declarativos son preferibles a setters arbitrarios o carga remota. La integración `ntcfg` es una oportunidad concreta, pero debe mantener el principio de que Wraith no ejecuta código de terceros ni expone tokens.

## Appendix E — Benchmarks recomendados

Antes de afirmar que Wraith es “más rápido” o “más ligero”, publicar una metodología reproducible. Medir tiempo de boot hasta panel interactivo, escrituras DOM por minuto en reposo, allocaciones durante una carrera, CPU del hilo principal, latencia entre teclas y memoria retenida tras diez carreras. Ejecutar Chrome, Firefox y WebKit con el mismo fixture y reportar mediana, p95 y desviación.

Para concurrencia, crear un escenario de dos pestañas que compitan por el lock, un caso con `localStorage` bloqueado, un caso sin Web Locks y un caso de pestaña congelada. El criterio de éxito no es “el bot continúa”, sino “como máximo una pestaña actúa y la otra espera o se detiene de forma visible”.

Para accounts, sembrar dos usuarios con historial, límites y calibración distintos; cambiar de cuenta antes, durante y después de un `await`; verificar que ninguna respuesta de A modifica B. Para resultados, retrasar paquetes deliberadamente y demostrar que un resultado viejo no se adjunta a una carrera nueva.

Estos benchmarks convertirían la ventaja de Wraith —disciplina de pruebas— en evidencia pública. Hoy la suite demuestra regresión controlada; con estos escenarios demostraría robustez real.
