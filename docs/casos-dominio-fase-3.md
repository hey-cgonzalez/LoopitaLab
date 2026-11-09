# Casos de dominio: fase 3 (follow, metraje y lanas)

Casos de prueba de dominio para `qa-tester`, de la revisión T1 de `experto-tejido` (2026-11-09) sobre los [ADR 0007](adr/0007-follow-secuencia-de-colorwork.md), [0008](adr/0008-lanas-selector-aspecto-y-metraje.md) y [0009](adr/0009-tejer-este-diseno-y-proyectos.md). Siguen el estilo de [casos-dominio-colorwork.md](casos-dominio-colorwork.md).

- **Criterio de aceptación**: cada caso tiene una prueba automática. `follow`, `pattern-core` y `yarn-catalog` van con `node:test`.
- **Casos "validar con tejedora"**: la prueba usa el valor actual y lleva el comentario `// validar con tejedora`.
- **Fuente frente a criterio**: lo marcado "Fuente" tiene referencia; lo demás es criterio de dominio.

## Convenciones

- `A`, `B`, `C` son lanas y `.` es `NO_STITCH`. Las filas del motivo se escriben desde la fila 0 (la primera que se teje).
- `R` es `repeat.x`. "Fila" es el índice 0-based del gráfico completo; el "número visible" es fila + 1.
- Muestra supuesta: la de [casos-dominio-colorwork.md](casos-dominio-colorwork.md#muestra-supuesta-por-grosor).
- Ancho del punto `w = 10 / puntos en 10 cm`, en cm.

## Seguimiento (`follow`)

| # | Caso | Esperado |
|---|---|---|
| F3-1 | Motivo 4 × 2, `R = 3`, en redondo: fila 0 `AABA`, fila 1 `ABBA` | `totalRows` = 2. Fila 0: `side` = `right`, `reading` = `right_to_left`, `stitches` = 12, `stitchesPerRepeat` = 4. Tramos de una repetición: `2 A · 1 B · 1 A`. Fila 1: `1 A · 2 B · 1 A`. La suma de `count` por `R` da 12 |
| F3-2 | Mismo gráfico con `mirror: true` | Los tramos de la fila 0 pasan a `1 A · 1 B · 2 A` (mismo contenido, orden inverso). `stitches`, `change`, el conjunto de lanas y las columnas no cambian. `side` sigue `right` |
| F3-3 | Motivo 4 × 3 en ida y vuelta, fila 1 `ABBA` | Fila 0: `right`, `right_to_left`. Fila 1: `wrong`, `left_to_right`. Fila 2: `right`, `right_to_left`. Los tramos de la fila 1 se dan en el orden en que se teje (de izquierda a derecha), con los colores **como se ven por el derecho**. Con `mirror: true`, `reading` se invierte pero `side` se mantiene (fila 1 por el derecho) |
| F3-4 | Diseño `top_down`, motivo 3 × 2, fila 0 `ABA`, fila 1 `AAB`, sin repeticiones | Los pasos son los mismos que en `bottom_up`: el paso 0 es la fila 0. Cambiar `direction` o `renderAs` no cambia ningún paso (P7). **Validar con tejedora**: orientación de la vista en "Tejiendo" para `top_down` |
| F3-5 | Círculo `top_down` con cuña que crece de 8 a 16 puntos con `R = 8` | El paso 0 es el centro (8 puntos). `change` de la fila 1 = +8 y `perRepeat` = +1. `increaseColumns` coincide con `rowShapingColumns`. `workedIn` = `rounds`, todos `right` |
| F3-6 | Cuña de `R = 8` que baja de 80 a 72 puntos (fila 1) | Fila 1: `stitches` = 72, `change` = −8, `perRepeat` = −1, `decreaseColumns` no vacía. Al tejer, `stitchesDone` cuenta casillas producidas, no puntos que salen de la aguja. **Validar con tejedora**: de qué lana es un "2 juntos" de dos lanas distintas (el modelo toma la casilla de la fila actual) |
| F3-7 | Puntero: gráfico de 3 filas. `nextRow` desde el inicio, tres veces | `rowsDone` = 3 = `totalRows`: terminado. Una cuarta llamada no cambia nada. El texto de la interfaz dice "Gráfico terminado", no "Pieza terminada", y avisa que falta rematar o cerrar. Si la última fila tiene N puntos y la forma es `bottom_up`, menciona los N puntos que quedan |
| F3-8 | `R = 4`, fila de 16 puntos (4 por repetición). `nextRepeat` desde el inicio | `stitchesDone` = 4, 8, 12 y luego `{ rowsDone: 1, stitchesDone: 0 }` en la cuarta llamada. Con `mirror: true`, la primera repetición que se resalta es la de la izquierda (P15) |
| F3-9 | Texto de la fila según la forma de trabajo | En redondo se dice "vuelta"; en ida y vuelta, "fila". Aplica también a los mensajes de conflicto y a "terminado". Nunca "vuelta" para una fila plana |
| F3-10 | Fila por el revés en palillo | La interfaz dice "por el revés, de izquierda a derecha" y aclara que los colores del gráfico son los del derecho. No dice que los colores se invierten. En crochet no afirma "punto revés" |
| F3-11 | Puntero dañado: `null`, texto, `NaN`, negativo, enorme | `clampPointer` devuelve un puntero del dominio y no lanza (P12) |
| F3-12 | Cambio de versión fijada: la fila 12 cambia de contenido entre dos planes | `remapPointer` conserva `rowsDone` acotado, `stitchesDone` vuelve a 0, `rowChanged` = true. La interfaz avisa antes de confirmar |
| F3-13 | Gráfico de 200 de ancho: `stepAt` | Tarda menos de 1 ms y `planChart` no recorre las filas del gráfico completo (guardia de rendimiento del ADR 0007) |

## Metraje (`yarnUsage` y `estimateYarnLength`)

Las flotantes siguen la regla corregida (C1 de la revisión T1): en redondo, `N − k`; en ida y vuelta, `(último − primero + 1) − k`. Solo cuentan las filas con 2 o más lanas.

| # | Caso | Esperado |
|---|---|---|
| F3-14 | En redondo, fila de 12 puntos: `A B` + 10 `A` | `floatStitches`: B = 11, A = 1. B tiene 1 punto y A 11 |
| F3-15 | La misma fila en ida y vuelta | B aparece una vez: `floatStitches` de B = 0. A: primer punto en la posición 0 y último en la 11, ocupa 12 posiciones con 11 puntos: flotante 1 (el punto B queda en medio). No se cuenta de orillo a orillo |
| F3-16 | Ida y vuelta, fila `B AAAAA B` | B: primer punto en 0 y último en 6, 2 puntos propios, flotante = 7 − 2 = 5. A: primer punto en 1 y último en 5, 5 puntos, flotante 0 |
| F3-17 | Fila con una sola lana (otra lana ausente) | `floatStitches` = 0 para todas, aunque la lana ausente aparezca en otras filas |
| F3-18 | Fila con 3 lanas en redondo, `A B C` + 9 `A` (12 puntos) | A: 10 puntos, flotante 2; B: 1 punto, flotante 11; C: igual que B. Cada lana suma `N − k` |
| F3-19 | Duplicar `repeat.y`; duplicar `repeat.x` en redondo | Se duplican `stitches` y `floatStitches`. Con `repeat.x` en ida y vuelta la relación es solo monótona (ver nota) |
| F3-20 | Suma de `stitches` de `yarnUsage` | Igual a `yarnTotals` y a `stitchTotal` |
| F3-21 | Gorro de 112 puntos × 60 vueltas, lana cat 4 (18 puntos en 10 cm, supuesta), 2 lanas al 50 %, damero A B A B en redondo | Por lana: 3.360 puntos y 3.360 flotantes. `meters` = 105, rango de 85 a 125 (sobre los metros crudos, 100,6 m: `low` = piso de 0,85 × m a múltiplo de 5 y `high` = techo de 1,2 × m, ADR 0008 enmienda T1-6). Supuestos: `assumed_gauge`, `loop_factor`, `float_slack`, `waste_margin`. Total de las dos lanas: 210 m. **Validar con tejedora** comparando con 2 o 3 gorros terminados |
| F3-22 | Mismo gorro, cada lana en bandas de vuelta completa (sin flotantes) | Por lana: 3.360 puntos y 0 flotantes. `meters` = 80 (78 m crudos, redondeados hacia arriba a 5) |
| F3-23 | Muestra del documento de 22 puntos en 10 cm en vez de la supuesta | `assumed_gauge` ausente. Los metros bajan (punto más angosto) |
| F3-24 | Cat. 7 (Jumbo) | `low_confidence_weight` presente y la cifra rotulada de baja confianza |
| F3-25 | Crochet | `estimateYarnLength` devuelve `undefined`; la interfaz dice "sin estimación" y no inventa |
| F3-26 | Propiedades | Monótona en puntos y flotantes; decrece al subir los puntos en 10 cm; `low ≤ meters ≤ high`; múltiplos de 5; `assumed_gauge` si y solo si la muestra es supuesta; nunca gramos ni ovillos |
| F3-27 | Interfaz | Cada cifra se rotula "≈ N m (entre L y H m), estimación" con los supuestos. Aclara "solo del gráfico: no incluye elástico, montaje ni remate" y sugiere tejer la muestra con las dos lanas |

> Nota F3-19: con `repeat.x` en ida y vuelta, el hueco entre repeticiones de una misma lana cuenta como flotante, así que el aumento puede ser mayor que el doble. La propiedad válida es monotonía, no duplicación exacta, para ida y vuelta. En redondo la duplicación exacta sigue valiendo.

## Lanas

| # | Caso | Esperado |
|---|---|---|
| F3-28 | `findWeights("aran")` | Cat. 4 (nombre en inglés). Sin distinguir tildes ni mayúsculas |
| F3-29 | `findWeights("DK")`, `("fingering")`, `("sport")`, `("chunky")`, `("lace")` | **Primer resultado**: cat. 3, 1, 2, 5 y 0 respectivamente (la búsqueda por prefijo de palabra puede devolver otras categorías después; p. ej. "dk" también da la 2 por el alias aproximado) |
| F3-30 | `findWeights("light")` | Cat. 2 (alias "Fino (Light DK)", aproximada) y cat. 3 ("Light Worsted"). Ambas con el rótulo adecuado. **Validar con tejedora** |
| F3-31 | `findWeights("mediano")`, `("grueso")` | **Primer resultado**: cat. 4 y 5 ("grueso" también da la 6 por "Super Grueso", en segundo lugar), `kind: "alias"`, `approximate: true`. El selector las rotula "equivalencia aproximada" sin nombrar la tienda |
| F3-32 | `findWeights("4 ply")` o `("8 ply")` | Vacío con ayuda: el nombre varía por país. **Pendiente de validar por tejedora**; no se mapea sin fuente |
| F3-33 | Consulta de 1 carácter | Vacía (mínimo 2 caracteres) |
| F3-34 | Catálogo | Ningún JSON de `yarn-catalog` contiene nombres de marcas (CA3-L11). Los alias de tienda viven en `fuentesAlias` |
| F3-35 | Niveles de fibra (mezclas) | 100 % mohair: halo alto, definición baja. 100 % algodón: definición alta, halo bajo. Mezcla 70/30 lana/mohair: valores ponderados, y cambiar a 30/70 cambia el aspecto (clave de `#applyLooks` con porcentajes). Fibra desconocida: neutra. **Validar con tejedora**: la ponderación lineal de pequeños porcentajes de mohair o lurex |
| F3-36 | Color personalizado cercano | A menos de `NEAR_COLOR_DELTA_E` (2,3) del color de la paleta: "prácticamente igual". Un hex que no es de la paleta nunca lleva `paletteId` |

## Tejer este diseño

| # | Caso | Esperado |
|---|---|---|
| F3-37 | Diseño `valid` con `CHART_FLOAT_LONG` (advertencia) | Se puede tejer. La pantalla previa muestra la advertencia con el máximo y la sugerencia de enganchar la hebra |
| F3-38 | Diseño con un error de tejido (por ejemplo una fila sin puntos) | `NOT_KNITTABLE`. El botón explica qué impide tejer |
| F3-39 | Pantalla previa al empezar | Muestra: muestra usada (documento o supuesta, rotulada "supuesto"), metraje por lana con rango y supuestos (solo palillo), advertencias que no bloquean, forma de trabajo (en redondo o ida y vuelta, `bottom_up` o `top_down`, número de filas), lo que no está en el gráfico y el aviso de prototipo digital. Nada se calcula en `apps/web` |
| F3-40 | Tubo o círculo con `rows` | La pantalla previa dice "se teje de ida y vuelta y se cose" (`CHART_ROWS_SHAPE`) |
| F3-41 | Conflicto de avance entre dispositivos | El mensaje dice "fila" en ida y vuelta y "vuelta" en redondo, con las dos posiciones y la hora. No pisa en silencio |
| F3-42 | Versión fijada con una regla nueva que ya no la valida | Se puede seguir tejiendo con un aviso. Si ni siquiera es `savable`, no se muestra y se explica |

## Fuentes

- Munden, D. L., *The geometry and dimensional properties of plain-knit fabrics*, J. Text. Inst. 50(7), 1959, 448-471. Constantes de lana de punto liso: Kw = 3,8 y Kc = 5,0 (seco-relajado), 4,1 y 5,3 (húmedo-relajado). Citado vía resumen secundario: https://journal.uitm.edu.my/ojs/index.php/JOA/article/download/5292/2841 . No se abrió el original.
- Craft Yarn Council, *Standard Yarn Weight System*: https://www.craftyarncouncil.com/standards/yarn-weight-system
- Interweave, hebras flotantes (2,5 cm): https://www.interweave.com/article/knitting/how-to-tack-floats-stranded-colorwork
- Osborn Fiber, *Fair Isle 102* (5 puntos): https://osbornfiber.com/2011/09/30/fair-isle-102-securing-long-floats/

## Pendiente de validar por tejedora

- Orientación de la vista en "Tejiendo" para `top_down` (fila actual abajo o arriba).
- De qué lana se teje un "2 juntos" de dos lanas distintas.
- Tramos "3 A · 2 B" frente a casillas.
- Holgura de las flotantes (1,1), rango del metraje y comparación del metraje con proyectos reales.
- Brillo del acrílico, halo de la lana, definición de la alpaca y ponderación de mezclas con mohair o lurex.
- El alias "Fino (Light DK)" y la búsqueda "light".
- Nombres "4 ply" y "8 ply".
