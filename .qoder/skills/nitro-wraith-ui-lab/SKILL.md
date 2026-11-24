---
name: nitro-wraith-ui-lab
description: Guía especializada para evolucionar la UI de Nitro Wraith sin tocar el motor de carreras. Usar para cambios visuales, RGB y personalización, gráficos SVG, animación, inmersión, accesibilidad, responsive y regresión visual del userscript.
---

# Nitro Wraith UI Lab

## Cuándo usar esta skill

Actívala cuando el usuario pida mejorar el panel, el garaje, los temas, el RGB, la personalización, las gráficas, la animación, la inmersión, la legibilidad o la accesibilidad de Nitro Wraith.

## Fuente de verdad

- Usa `origin/main` como referencia y sincroniza antes de empezar.
- Node >=22; no añadas dependencias.
- Lee `package.json`, `src/README.md` y `tools/build.js`.
- El bundle `nitro-wraith.user.js` y `nitro-wraith.meta.js` son generados. No los edites a mano.

## Mapa de UI

| Archivo | Responsabilidad |
| --- | --- |
| `src/79-panel-css.js` | Estilos del panel, temas, motion y responsive |
| `src/80-panel.js` | Estado del panel, refs, filtros y actualización |
| `src/81-panel-theme.js` | Pintado, ciclos y bridges de tema |
| `src/82-panel-rail.js` | Tabs, montaje de vistas y sliders |
| `src/83-panel-html.js` | Markup del Shadow DOM |
| `src/90-queue.js` | Garaje, cola y presentación de estados |
| `tests/live/run.js` | Pruebas de interacción y estado |
| `tests/live/visual-capture.js` | Capturas reproducibles |
| `tests/visual/baselines/` | Referencias visuales por plataforma |

No modifiques `30-profile.js`, `60-pacing.js`, `70-session.js`, `96-guard.js` ni la lógica de navegación/cola para una tarea visual salvo que exista una prueba que lo exija y el usuario lo apruebe.

## Flujo obligatorio

1. Define el cambio en términos de estado, acción y resultado observable.
2. Escribe primero una prueba live o visual que falle por el comportamiento ausente.
3. Implementa el cambio mínimo en el fragmento correcto.
4. Ejecuta `npm run build`.
5. Ejecuta `npm run check`.
6. Ejecuta `npm run test:live` y `npm run visual`.
7. Revisa los PNG nuevos antes de aceptarlos. Usa `npm run visual:accept` solo para cambios intencionales.
8. Commitea `src/`, pruebas, bundle generado y baselines juntos.

## Guardrails de rendimiento e inmersión

- Anima `transform` y `opacity`; evita `width`, `top`, `left`, `filter` y `transition: all`.
- No introduzcas bucles JS continuos ni librerías de animación.
- Limita la UI a dos capas decorativas animadas y una actualización de gráficos por segundo.
- Pausa efectos con pestaña oculta y respeta `prefers-reduced-motion`.
- No codifiques estados solo con color; conserva etiquetas, iconos o formas.
- No anuncies cifras a 4 Hz a lectores de pantalla; anuncia solo cambios de estado o acción.
- Mantén Pause/Stop visibles durante la carrera.

## Playbooks

### RGB Lab

- Conserva los seis presets y añade `Custom`.
- Ofrece color principal, velocidad `0.5x/1x/2x`, intensidad, zonas y política de carrera `Estático/Borde/Completo`.
- Deja `Estático` como valor seguro durante carreras.
- Guarda los perfiles visuales en `configSnapshot()` para exportarlos.
- Si `CSS.registerProperty` no existe, usa un acento estático.

### Race Focus

- Al correr, prioriza WPM, precisión, progreso, estado y próxima acción.
- Permite fijar hasta dos métricas secundarias.
- Añade densidad `Compact/Comfortable`, escala `100/115%` y alto contraste.
- Ofrece movimiento por teclado: flechas 8 px, Shift+flechas 24 px y Home a una esquina.
- Reclampa posiciones al redimensionar y respeta safe areas.

### Gráficas

- Usa SVG inline y un `<path>` por serie; nada de canvas o dependencias.
- Actualiza a 1 Hz, no por tecla.
- Incluye resumen textual y tabla accesible.
- Oculta la gráfica si no hay suficientes muestras.

### Motion dirigido por eventos

- Anima lanzamiento, Nitro, límite, resultado y guardrails una sola vez.
- Dura 160–240 ms; reduced motion muestra el estado final.
- Reserva partículas o celebración para el resultado, máximo 600 ms y 12 partículas.
- La inmersión debe reforzar significado, no decorar cada frame.

## Definition of Done

- Prueba live nueva y roja antes de implementar.
- `npm run check` y `npm run test:live` en verde.
- `npm run visual` en verde o baselines aceptados tras revisión manual.
- Zoom 200 %, ancho 320 px, reduced motion y alto contraste comprobados.
- Sin cambios en el motor de carreras ni dependencias nuevas.
- Bundle generado y fuente sincronizados.
