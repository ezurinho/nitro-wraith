# Investigación: qué hace creíble al bot y qué le falta al panel

Documento de trabajo. Cada hallazgo lleva su fuente y el efecto que tuvo en el
código (o el hueco que deja abierto). Lo que no se pudo medir se dice.

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

| Rasgo humano | Estado |
| --- | --- |
| Cadencia log-logística por tecla (cola derecha) | hecho (`logLogistic`, Gonzalez et al. 2021) |
| Digramas, forma de palabra, pausas de puntuación | hecho (`digraphFactor`, `wordShapeFactor`) |
| Fatiga (+2%/h, tope 6%) | hecho (`fatigueFactor`) |
| Errores en tecla contigua, 1 error / N correctas | hecho (`KEY_NEIGHBORS`) |
| Descansos cortos y largos entre carreras | hecho (`CONFIG.breaks`) |
| Rampa de subida (25% por calibración) | hecho (`maxStepRatio`) |
| Deriva de precisión carrera a carrera | **falta**: la precisión se sortea por sesión |
| Variación de ritmo **dentro** de la sesión | **falta**: 10 carreras comparten objetivo |
| Hora del día / días sin correr | **falta**: el bot no descansa por calendario |

Los dos huecos de la tabla son los que el anti-cheat mira según la sección 1: una
tanda de 10 carreras a exactamente 196 WPM y 97,4% es más plana que cualquier
persona.

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

Lo que sí falla:

| Medida | Valor actual | Norma | Acción |
| --- | --- | --- | --- |
| Tamaño de fuente mínimo | **7,5 px** (4 usos), 8 px (8 usos) | legibilidad, sin mínimo legal | suelo de 9 px para etiquetas, 10 px para datos |
| `.gear` | 22×22 px | 2.5.8: 24×24 | a 24×24 |
| `.sw` (bolita del interruptor) | 13 px | 2.5.8 si el área clicable es solo la bolita | área clicable es la fila entera: se documenta |
| `prefers-reduced-motion` | ausente | 2.3.3 | media query que apaga las animaciones no esenciales |
| `aria-live` en WPM/precisión | ausente | anuncio de cambios | `polite` en el bloque LIVE |
| Focus visible | 13 reglas `:focus-visible` | 2.4.13 | ya cubierto |

## 5. Backlog derivado, en orden de retorno

1. **Variación dentro de la tanda** (realismo): que dos carreras seguidas no
   compartan objetivo exacto ni precisión exacta, sin mover la media de la tanda
   del centro calibrado y sin pasar del techo.
2. **Suelo tipográfico y reduced-motion** (interfaz): 9 px mínimo, animaciones
   apagables, `aria-live` en los números vivos, `.gear` a 24 px.
3. **Descanso por calendario** (realismo): una cuenta que corre 24/7 durante
   semanas también es una firma. Requiere decidir si el AFK manda sobre esto.
4. **CI de `npm run visual`** (backlog 6 de la noche): hoy las 15 fotos solo las
   mira quien las pide a mano.
