# Casos de dominio: colorwork (fase 2)

Casos de prueba de las reglas de tejido del estudio de colorwork, para `qa-tester`.

- **Origen**: revisión de `experto-tejido` del 2026-11-05 sobre los [ADR 0003](adr/0003-colorwork-en-esquema-v1.md), [0004](adr/0004-render-de-puntos-2d.md) y [0005](adr/0005-geometria-circulo-y-disminuciones.md).
- **Criterio de aceptación**: cada caso tiene una prueba automática (CA-F11 del [roadmap](roadmap.md)). Las de `pattern-core` y `yarn-catalog` van con `node:test`; las de `stitch-render`, con `node:test` sobre la capa de disposición.
- **Casos "validar con tejedora"**: la prueba usa el valor actual y lleva un comentario `// validar con tejedora`, para cambiarla si las tejedoras corrigen la regla.

## Convenciones

- `R` es `repeat.x`. "Total" es `rowStitchCount` de la vuelta completa.
- `A`, `B` son lanas y `.` es `NO_STITCH`. Las filas del motivo se escriben desde la fila 0 (la primera que se teje).
- "Nada" significa que no aparece el código evaluado en ese caso. Otros códigos pueden aparecer si el caso lo indica.
- **Umbral de hebras flotantes**: `min(floor(2,5 × puntos en 10 cm / 10), 5)` puntos.
- **Muestra supuesta**: la tabla del final.

## Lectura y orientación

| # | Caso | Esperado |
|---|---|---|
| 1 | `workedIn: "rounds"` | `readingDirection` = `right_to_left` para todo `y` |
| 2 | `workedIn: "rows"` | `y = 0` y `y = 2`: `right_to_left`. `y = 1`: `left_to_right` |
| 3 | `mirror: true` (preferencia `mirror_knitting`) | Invierte el caso 2 y también el caso 1. Con `profiles.dominant_hand = 'left'` y sin espejo, no cambia nada. El documento no cambia en ningún caso |
| 4 | Cualquier gráfico | `readingDirection` depende solo de `workedIn`, de `y` y del espejo; no de `renderAs`, `direction` ni las lanas (propiedad) |
| 5 | `top_down`, motivo 3 × 2: fila 0 `A B A`, fila 1 `A A B`, sin repeticiones | `wornOrientation` aplica `(x, y) → (2 − x, 1 − y)`. La fila 0 vista es `B A A` (de chart(2,1), chart(1,1), chart(0,1)) y la fila 1 vista es `A B A`. Aplicarla dos veces devuelve el original. No es un espejo vertical |

## Conteos y disminuciones

| # | Caso | Esperado |
|---|---|---|
| 6 | Motivo 5 × 3, `R = 8`: `AAAAA` / `AAAA.` / `AA...` | `rowStitchCounts` = [40, 32, 16]. `change` = [0, −8, −16]. `perRepeat` = [0, −1, −2]. La suma (88) es igual a `stitchTotal` |
| 7 | CA-F3: `R = 8`, cuña que baja de 10 a 1 punto por repetición, 1 por vuelta | Totales de 80 a 8 (80, 72, …, 8). `shaping` es coherente con `rowStitchCount` en cada vuelta. Sin `IMPOSSIBLE`, `TOO_FAST` ni `STEEP` |
| 8 | Totales consecutivos, solo códigos `CHART_SHAPING_IMPOSSIBLE` y `CHART_SHAPING_TOO_FAST` | 80 → 8: `IMPOSSIBLE` (error; 8 < ceil(80/3) = 27). 80 → 40: ninguno de los dos (40 = ceil(80/2)). 80 → 30: `TOO_FAST` (advertencia; 27 ≤ 30 < 40). Propiedad: error si y solo si restantes < ceil(n/3); advertencia si y solo si ceil(n/3) ≤ restantes < ceil(n/2). Con `R = 8`, el caso 80 → 40 es −5 por repetición y también da `CHART_SHAPING_STEEP`: es correcto, son reglas distintas |
| 9 | `perRepeat` en una vuelta | −3: `CHART_SHAPING_STEEP`. −2: nada |
| 10 | Cierre en `bottom_up`, total de la última vuelta | 8: nada. 16: nada (info solo si es **mayor** que 16). 20: info. 30: advertencia (mayor que 24). Depende del total, no de `R` (propiedad: mismo total con `R` distinto da lo mismo) |
| 11 | Repeticiones y ancho de cuña en un círculo | `R = 3` o `R = 14`: `CHART_CIRCLE_REPEATS` (info). `R` = 6, 8 o 12: nada. Si el máximo de puntos por cuña es menor que 4: `CHART_WEDGE_TOO_NARROW`. Validar con tejedora |
| 12 | Círculo con `repeat.y > 1` | Si el motivo tiene `NO_STITCH`: `CHART_CIRCLE_REPEAT_Y` (advertencia). Si no tiene: nada |
| 13 | Sentido de la forma | `bottom_up` con aumentos: `CHART_SHAPING_UNEXPECTED`. `top_down` con disminuciones: `CHART_SHAPING_UNEXPECTED`. `top_down` de 8 a 16 con `R = 8`: sin `STEEP` (+1 por repetición) y sin `TOO_FAST` (16 no supera 8 × 2) |
| 14 | Inicio en `top_down`, total de la fila 0 | 3: `CHART_CIRCLE_START` (info). 8: nada. 18: `CHART_CIRCLE_START` (info) |

## Hebras flotantes y lanas

| # | Caso | Esperado |
|---|---|---|
| 15 | En redondo, una fila de 12 puntos: `A B` + 10 `A`. Muestra de 18 puntos (máximo 4) | La hebra de B mide 11, porque cierra la vuelta: `CHART_FLOAT_LONG`. La misma fila de ida y vuelta: nada (B aparece una vez y no flota) |
| 16 | De ida y vuelta: `B AAAAA B` | La hebra de B mide 5. Muestra de 18 puntos (máximo 4): advertencia. Muestra de 37 (máximo 5): nada. Sin muestra, sin `assumedGauge` y sin `weightCat` (máximo 5): nada |
| 17 | Máximo de hebra por categoría 0 a 7 con la muestra supuesta | 5, 5, 5, 5, 4, 3, 2, 1. Nunca crece con la categoría |
| 18 | Documento sin `gauge`, `weightCat: 4` (o `assumedGauge` de la categoría 4) | El validador usa 18 puntos en 10 cm (máximo 4). El documento sigue sin `gauge` |
| 19 | `suggestedGauge(cat, "knit")` | Devuelve la tabla del final. Para toda categoría, filas / puntos está entre 1,2 y 1,5. La categoría 7 viene marcada con baja confianza |
| 20 | Motivo de 20 × 20, `repeat` 5 × 1, muestra de 20 × 28 | `dimensionsCm` = 50 cm × 7,14 cm: 100 puntos / 20 × 10 y 20 filas / 28 × 10. En tubo y círculo, `widthIsCircumference = true`. En el círculo, la circunferencia sale del máximo de `rowStitchCount`, no de `width × repeat.x` |
| 21 | Lanas por fila | 3 lanas en una fila: `CHART_COLORS_PER_ROW` (info). 2: nada |
| 22 | Lanas de categorías 2 y 4 en el mismo diseño | `YARNS_MIXED_WEIGHT` (info) |
| 23 | Forma y forma de trabajo | Tubo o círculo con `rows`: `CHART_ROWS_SHAPE` (advertencia, "se teje de ida y vuelta y se cose"). Plano con `rows`: nada |

## Vistas derivadas

| # | Caso | Esperado |
|---|---|---|
| 24 | Cambiar `renderAs` | No cambia `stitchTotal` ni ningún otro campo del documento (propiedad) |
| 25 | `chartToSvg` con `rowNumbers` | Ida y vuelta: las filas por el derecho se numeran a la derecha y las del revés a la izquierda. En redondo, todas a la derecha. Con `mirror`, se invierten los lados |
| 26 | Círculo, sentido de giro | `bottom_up`: `x` creciente en sentido antihorario visto desde arriba. `top_down`: horario. Invertir `direction` espeja los ángulos. **Validar con tejedora** |
| 27 | Círculo, anillos | En cada anillo, los arcos suman 2π y las instancias son `rowStitchCount(y)`. `bottom_up`: la fila 0 es el anillo exterior. `top_down`: la fila 0 está al centro |

> **Correcciones de `arquitecto` a la lista original**:
> - **Caso 20**: decía 25 cm de ancho. Con 100 puntos y 20 puntos en 10 cm son 50 cm.
> - **Caso 10**: decía "16: info o nada". Se fija "nada", porque la regla es estricta (mayor que 16).
> - **Caso 8**: se aclara que 80 → 40 con `R = 8` también da `STEEP`.
>
> `experto-tejido` debe confirmar estas tres correcciones.

## Muestra supuesta por grosor

Muestra en **punto jersey**, en 10 cm.

- **Puntos**: el punto medio del rango del Craft Yarn Council.
- **Filas**: son un **supuesto visible**, porque el CYC solo publica puntos. Se calculan como `round(puntos × 1,35)`.
  - En colorwork a hebras la proporción suele estar más cerca de 1,25 a 1,3 (validar con tejedora).
- **Máximo de hebra** según la fórmula de arriba.

| Categoría CYC | Puntos | Filas | Máximo de hebra (puntos) | Confianza |
|---|---|---|---|---|
| 0 | 37 | 50 | 5 | Media |
| 1 | 30 | 41 | 5 | Media |
| 2 | 25 | 34 | 5 | Media |
| 3 | 23 | 31 | 5 | Media |
| 4 | 18 | 24 | 4 | Media |
| 5 | 14 | 19 | 3 | Media |
| 6 | 9 | 12 | 2 | Media |
| 7 | 6 | 8 | 1 | Baja: el CYC da un tope ("6 o menos"), no un rango |

La interfaz rotula estos valores como "supuesto". No se escriben en el documento hasta que la usuaria confirma su muestra (regla de oro 6).

## Fuentes

- Interweave, cómo enganchar las hebras flotantes en colorwork a hebras (2,5 cm): https://www.interweave.com/article/knitting/how-to-tack-floats-stranded-colorwork
- Interweave, disminuciones de la coronilla de un gorro (cerrar con 5 a 8 puntos): https://www.interweave.com/article/hat-crown-decreases-explained
- Osborn Fiber, *Fair Isle 102: securing long floats* (5 puntos): https://osbornfiber.com/2011/09/30/fair-isle-102-securing-long-floats/
- Craft Yarn Council, *Standard Yarn Weight System* (rangos de muestra en puntos; la revisión no la abrió directamente): https://www.craftyarncouncil.com/standards/yarn-weight-system
