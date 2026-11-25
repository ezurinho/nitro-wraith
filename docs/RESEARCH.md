# Investigación: qué hace creíble al bot y qué le falta al panel

Documento de trabajo. Cada hallazgo lleva su fuente y el efecto que tuvo en el
código (o el hueco que deja abierto). Lo que no se pudo medir se dice.

> Actualización 2026-11-25: las tablas de las secciones 3 y 4 se contrastaron
> contra HEAD. Los tres huecos de realismo que dejó la primera pasada están
> cerrados; la accesibilidad que figuraba como pendiente también. Lo que sigue
> abierto es la modularidad, no el modelo.

## 1. La política del sitio, dicha por el sitio

- Nitro Type prohíbe el botting **explícitamente** y lo castiga con ban
  permanente, sin aviso: «botting is not allowed and will result in an immediate
  lifetime ban» (`nitrotype.com/news/read/265`, 24/05/2024). La página de soporte
  añade que el sistema anti-cheat «detecta a todos los tramposos y banea sus
  cuentas automáticamente» (`nitrotype.com/support`).
- El patrón que delata, según las guías de la comunidad: **velocidad demasiado
  consistente** y **precisión que nunca fluctúa**. «If your typing speed is too
  consistent or your accuracy never fluctuates, the system flags the account for
  immediate review» (`mechanicaplay.blog/can-you-get-banned-from-nitro-type`).
  El otro síntoma es el *ghosting*: sigues corriendo pero desapareces del ranking.
- Conclusión para el diseño: el riesgo no es ir rápido — es ir **plano**. Un
  objetivo fijo con 10 muestras de ±6 WPM y una precisión clavada en 97% es una
  firma, no una persona.

## 2. Qué es «realista» con números

| Dato | Valor | Fuente |
| --- | --- | --- |
| Media de velocidad al teclear | 51,6 WPM (sd 20,2) | keydrills.com/typing-statistics |
| Top 10% de mecanógrafos | por encima de 78 WPM | keydrills.com/typing-statistics |
| Por encima de 100 WPM | ~1,3% de los usuarios | typelit.io/state-of-typing |
| Por encima de 150 WPM | se trata como *outlier* en los agregados | typelit.io/state-of-typing |
| Error no corregido | 1,17% de los caracteres | keydrills.com/typing-statistics |
| Distribución | log-normal con cola derecha larga | typelit.io/state-of-typing |

Consecuencia: **230 WPM de media no es un número humano** para una cuenta, por
más que su top lo sea (un top sí puede ser una carrera corta y afortunada). Por
eso el script no apunta al top sino al 85% (`topShare`), y el techo al 97%
(`ceilingTopShare`): ambos son datos **de la propia cuenta**, no del script, así
que la misma regla sirve para una cuenta de 45 y para una de 230.

## 3. Lo que ya cubre el código y lo que no

| Rasgo humano | Estado | Implementación |
| --- | --- | --- |
| Cadencia log-logística por tecla (cola derecha) | hecho | `logLogistic` (Gonzalez et al. 2021) |
| Digramas, forma de palabra, pausas de puntuación | hecho | `digraphFactor`, `wordShapeFactor` |
| Fatiga (+2%/h, tope 6%) | hecho | `fatigueFactor` |
| Errores en tecla contigua, 1 error / N correctas | hecho | `KEY_NEIGHBORS` |
| Descansos cortos y largos entre carreras | hecho | `CONFIG.breaks` |
| Rampa de subida (25% por calibración) | hecho | `maxStepRatio` |
| Deriva de precisión carrera a carrera | **hecho** | `rollRaceDrift()`: ±0,5 pts por carrera |
| Variación de ritmo **dentro** de la sesión | **hecho** | `rollRaceDrift()`: ±2 WPM por carrera, recortado a la banda |
| Hora del día / días sin correr | **hecho** | `dayCurveAt()` y `35-calendar.js` (`restDaysPerWeek = 1`) |

Los tres huecos que dejó la primera pasada están cerrados. La carrera ya no es
la misma foto: el objetivo de tanda se mantiene, pero cada carrera se mueve ±2
WPM y ±0,5 puntos de precisión, y el calendario apaga el bot un día por semana
por defecto. Eso rompe la firma plana sin mover la media calibrada.

## 4. El panel contra WCAG 2.2

Aplicable a un overlay de juego con texto pequeño y controles densos:

- **2.5.8 Target Size (mínimo)**: 24×24 px CSS por objetivo, o espaciado
  suficiente (`w3.org/WAI/WCAG22/Understanding/target-size-minimum`).
- **2.4.11 Focus Not Obscured** y **2.4.13 Focus Appearance**: el foco no puede
  quedar tapado por contenido propio ni desaparecer (`w3.org/TR/WCAG22`).
- **2.3.3 / prefers-reduced-motion**: la animación no esencial debe poder
  apagarse (`123designstudio.com/craft/wcag-accessibility-checklist`).
- **aria-live**: los números que cambian solos (WPM, precisión) tienen que
  anunciarse de forma educada, no en cada fotograma.

### Auditoría medida en este repo

Contraste calculado sobre el fondo efectivo `#0c110e` (script de contraste, no
una impresión):

| Token | Color | Contraste | AA texto normal (4,5:1) |
| --- | --- | --- | --- |
| `--ink` | `#e9f7ef` | 17,25:1 | pasa |
| `--ink-2` | `#cfe9db` | 14,82:1 | pasa |
| `--dim` | `#7d9188` | 5,70:1 | pasa |
| `--dim-2` | `#7f9389` | 5,84:1 | pasa |
| `--acc` | `#35ea86` | 12,04:1 | pasa |
| `--warn` | `#ffb340` | 10,68:1 | pasa |
| `--bad` | `#ff6f6f` | 7,04:1 | pasa |
| `--info` | `#63c8ff` | 10,19:1 | pasa |

Cierre de esa lista contra HEAD (2026-11-25):

| Medida | Estado actual |
| --- | --- |
| Tamaño de fuente mínimo | 7,5 px es el suelo del sistema en `DESIGN.md`; no hay texto por debajo. No se sube a 9/10 px porque el panel vive en 322 px y el cambio ya se evaluó con las 24 capturas. |
| `.gear` | 32 px de ancho; el objetivo de 24×24 de 2.5.8 se cumple. |
| `.sw` (bolita del interruptor) | La fila entera es clicable; la bolita de 13 px no es el único objetivo. Queda documentado, no es un fallo. |
| `prefers-reduced-motion` | Media query presente en `79-panel-css.js` y en el garaje; apaga las animaciones no esenciales. |
| `aria-live` en WPM/precisión | Presente en la región LIVE y en el estado del panel; los números se anuncian por tramos. |
| Focus visible | Reglas `:focus-visible` instantáneas en todos los controles; el banco conserva el foco tras una acción. |

## 5. Backlog derivado, en orden de retorno

1. **Partir `80-panel.js` y `90-queue.js`** (modularidad): es la deuda que
   queda; `tools/panel-map.js --nested` ya marca las funciones sin cierres que
   se pueden extraer sin tocar su cuerpo.
2. **Manifiesto `ntcfg` de solo lectura** (integración): Mod Menu 570117 ya
   publica `ntcfg:manifest:{id}` y propaga cambios por `ntcfg:change`. Wraith
   tiene `window.NitroWraith`, pero no ese contrato declarativo. Es una ventaja
   de ecosistema, no una mejora de tecleo.
3. **Input nativo** (fuera de alcance): exigiría un binario cerrado o
   `chrome.debugger`; no se persigue. Se documenta como límite, no como promesa.
4. **Adopción y feedback** (producto): 1 estrella/0 forks frente a 5.143
   instalaciones de 536103. No se arregla con código; pide capturas actuales,
   ficha clara y un canal de issues visible.
