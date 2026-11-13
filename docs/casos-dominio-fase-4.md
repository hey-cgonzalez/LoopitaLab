# Casos de dominio: fase 4 (estudio amigurumi 3D)

Casos de prueba de dominio para `qa-tester`, de la revisión T1 de `experto-tejido` (2026-11-13) sobre los [ADR 0010](adr/0010-geometria-3d-amigurumi.md) y [0011](adr/0011-posicion-de-partes-y-editor-escrito.md). Siguen el estilo de [casos-dominio-fase-3.md](casos-dominio-fase-3.md).

- **Criterio de aceptación**: cada caso tiene una prueba automática (`node:test` en `pattern-core` y `viewer-3d`). Cubre el criterio CA4-M7 de la hoja de ruta.
- **Casos "validar con tejedora"**: la prueba usa el valor actual y lleva el comentario `// validar con tejedora`. Esos valores no son reglas físicas.
- **Fuente frente a criterio**: "Fuente" lleva referencia (sección Fuentes); "Criterio" es criterio de dominio sin fuente pública; "Regla física" no varía; "Convención" puede variar entre patrones o países.
- **Alcance de las fuentes**: solo se abrió la página de abreviaturas del Craft Yarn Council. El resto se conoce por resúmenes de búsqueda, no por lectura completa. Quien implemente no debe tratarlos como validados.

## Convenciones

- `w` = ancho de un punto bajo = 10 / puntos en 10 cm. `s` = alto de una vuelta de punto bajo = 10 / vueltas en 10 cm. `ρ = s⁻¹·w`, es decir vueltas por punto (hoy 1,2 en `crochet-pb`, supuesto).
- **Muestra de referencia de estos casos**: 20 puntos y 24 vueltas en 10 cm. Da `w` = 0,5 cm, `s` = 0,41667 cm y `ρ` = 1,2 exacto.
- `n(Vk)` es el conteo producido por la vuelta `k`. Las vueltas se escriben "V1" y las hileras "H1" (el motor acepta ambas).
- Abreviaturas ES de `stitches.ts`: pb, mpa, pa, pad, pd, cad, aum, aum3, dism, saltar.

## 1. Inicio de la parte

| # | Caso | Esperado |
|---|---|---|
| F4-1 | `Inicio: AM`, espiral, `V1: 6 pb en AM (6)` | `startAvailable` = `null`: la V1 no se compara con nada. `n(V1)` = 6. `partProfile`: `rings[0]` con radio 0 y altura 0. Regla física: el anillo mágico se cierra tirando de la hebra y admite cualquier cantidad de puntos |
| F4-2 | Cantidad de la V1 con anillo mágico: 2, 3, 4, 5, 6, 7, 8, 10, 12, 15 | Se aceptan todas sin error. **Aviso informativo propuesto** `MAGIC_RING_UNUSUAL` solo con V1 de 1 punto, de menos de 3 o de más de 12. **Convención**: 4 a 8 es lo habitual en punto bajo; 6 es lo más común; 10 a 12 aparece con mpa o pa. **Umbral provisional, validar con tejedora**. Nunca error |
| F4-3 | Inicio sin anillo mágico: "cad 2 y 6 pb en la 2.ª cadeneta desde el ganchillo" | **Convención muy difundida** (alternativa al anillo mágico): la V1 tiene cantidad libre, no 2. El modelo actual (`start: chain` con `count: 2` en espiral) pide que la V1 consuma 2 y da `ROUND_CONSUMPTION_MISMATCH` como **error**. **Mejora** (ver "Correcciones", C-9): con `chain` en espiral o cerrada, ese desajuste en la V1 es advertencia y no error, y el mensaje dice que si se trabaja dentro del aro la cantidad es libre. **Validar con tejedora** cuál de las dos formas ofrecer en la interfaz |
| F4-4 | Cadeneta en aro, espiral o cerrada: `Inicio: cad 6`, `V1: 6 pb (6)` | Cuadra: la V1 consume 6 (un pb en cada cadeneta del aro). **Convención**: hay dos lecturas habituales (un punto en cada cadeneta, o los puntos dentro del aro). El modelo adopta la primera. `V1: 12 pb (12)` sobre `cad 6` no cuadra: hoy es error; con la mejora C-9 es advertencia. **Validar con tejedora** |
| F4-5 | Hileras con cadeneta base, solo pb: `Inicio: cad 11`, `Construcción: hileras`, `H1: 10 pb (10)` | Cuadra: `startAvailable` = `count − 1` = 10. Convención (CYC y práctica general): el primer pb va en la 2.ª cadeneta desde el ganchillo, y el nudo corredizo y la primera cadeneta no se cuentan. `H1: 11 pb` da advertencia (en hileras es advertencia, ya implementado) |
| F4-6 | Hileras con cadeneta base y primera hilera en mpa, pa o pad | **Convención que varía**: el primer punto va en la 3.ª (mpa), 4.ª (pa) o 5.ª (pad) cadeneta; las cadenetas saltadas cuentan como primer punto según el patrón. Disponibles = `n − 2`, `n − 3` o `n − 4` si no cuentan, y `n − 1`, `n − 2` o `n − 3` si cuentan. El motor no puede saber cuál: `startAvailable` = `n − 1` solo es regla para pb. Con mpa, pa o pad en la H1, `ROUND_CONSUMPTION_MISMATCH` queda como **advertencia** (ya lo es en hileras) con el texto "Revisa si la cadeneta para girar cuenta como punto". **No se escribe la cadeneta de giro como ítems `cad`** (ver F4-12) |
| F4-7 | Hileras que empiezan con `Inicio: AM` | **Mejora**: advertencia o aviso informativo, "las hileras suelen empezar con cadeneta base". Un panel plano no tiene centro cerrado. El panel (`PanelProfile`) ignora el anillo. Hoy `parsePart` pone anillo mágico por omisión también en hileras |
| F4-8 | Inicio en óvalo (trabajar alrededor de una cadeneta): ver "Decisión 6" | **No entra en la v2** |
| F4-9 | `parsePart` con `Inicio: óvalo 7` | Devuelve `PARSE_START` con mensaje claro ("Usa AM o cad N"); no se interpreta como cadeneta común. Con `Inicio: cad 7` y la V1 de un óvalo escrita (14 puntos) el motor la marca como no cuadra, y es correcto: el modelo no sabe de óvalos |

## 2. Espiral frente a vueltas cerradas

| # | Caso | Esperado |
|---|---|---|
| F4-10 | Mismo conteo en `spiral` y en `joined` | Los conteos son idénticos (el motor no depende de `construction`). `partProfile` da los mismos anillos, radios y alturas en los dos. Solo cambia la malla: la espiral sube `Δz × k / n` dentro de la vuelta (escalón al empezar cada vuelta) y las cerradas son anillos planos con la unión en el ángulo 0. Propiedad |
| F4-11 | Vuelta cerrada y su unión: `V2: 12 pb` | El **pd de unión** (punto deslizado en el primer punto de la vuelta) y la **cadeneta de subida** no son puntos del modelo, ni se escriben ni cuentan. **Trampa**: `V2: 12 pb, pd` produce 13, no 12. `slst` consume 1 y produce 1 como ítem; la unión real consume 0 y produce 0. El pd como ítem solo es válido si se trabaja realmente un pd en otro punto (cruzar por encima de puntos, F4-26). `formatPart` nunca escribe el pd de unión |
| F4-12 | Cadeneta de subida o de giro como ítem `cad` | **Trampa**: `cad` consume 0 y produce 1. En `joined` o `flat`, "cad 1, 12 pb" produciría 13 y la vuelta siguiente consumiría 12 o 13 según el patrón. En pb la cadeneta de subida **no cuenta como punto**. En pa suele contar como el primer pa (**Convención que varía**, "cad 3 cuenta como pa"). **Criterio**: no se escribe como ítem; va en la nota (`>`). **Mejora** de mensaje, C-10: cuando una vuelta cerrada o una hilera no cuadra por 1 o 2 puntos, el aviso sugiere "¿escribiste la cadeneta de subida o el pd de unión como puntos? No cuentan" |
| F4-13 | Marcador y espiral | En espiral, el inicio de la vuelta lo marca un marcador de puntos que se mueve. **Convención**: la V1 empieza en el anillo; en la espiral el límite entre vueltas se ve como el escalón. Lo muestra el 3D, y la nota "Coloca un marcador al inicio de la vuelta" va en `round.note` |
| F4-14 | Cambio de lana en espiral y en cerradas | En cerradas, el cambio de color en la unión no deja escalón; en espiral sí (el "jog" del color). **Convención**, solo apariencia: el modelo no lo corrige y la vista previa lo dice. El conteo no cambia |
| F4-15 | Vuelta cerrada o espiral con pa en vez de pb | **Validar con tejedora**: la altura de la vuelta con pa cambia el escalón de la espiral y la cadeneta de subida (3 cad contando como pa). El motor cuenta producido y consumido; la altura sale de `STITCH_HEIGHT_FACTOR` |
| F4-16 | Palabra de la interfaz por construcción | Espiral y cerradas: "vuelta". Hileras: "hilera" (el motor acepta también "fila"). Nunca "vuelta" para una hilera (como F3-9). **Validar con tejedora**: "hilera" frente a "fila" |

## 3. Puntos: qué consume y qué produce cada uno

Fuente de los números: `STITCHES` en `stitches.ts`. "Altura" es el `STITCH_HEIGHT_FACTOR` propuesto (sección 5).

| # | Punto (ES / US) | Consume | Produce | Altura (relativa a pb) | Reglas y trampas |
|---|---|---|---|---|---|
| F4-17 | `pb` / `sc` | 1 | 1 | 1 | Referencia. Un cuadrilátero en la malla |
| F4-18 | `aum` / `inc` | 1 | 2 | 1 | 2 pb en el mismo punto (regla física: dos puntos nuevos salen de la misma base). Aplica solo a pb: no existe "aum de mpa" (necesitaría un código nuevo). El texto "aum x6" son 6 aumentos, es decir 6 consumidos y 12 producidos |
| F4-19 | `aum3` / `inc3` | 1 | 3 | 1 | 3 pb en el mismo punto. Abreviatura provisional (no es CYC) |
| F4-20 | `dism` / `dec` (`sc2tog`) | 2 | 1 | 1 | Dos pb juntos. Regla física: dos puntos de base, un punto nuevo. Para el motor, "dism x6" son 12 consumidos y 6 producidos |
| F4-21 | Disminución invisible (alias `invdec`) | 2 | 1 | 1 | **Mismos conteos que `dism`** (fuente: tutoriales de disminución invisible; solo cambia la técnica, que toma solo la hebra delantera de cada uno de los dos puntos). No es lo mismo que `dism hd` (ítem con hebra delantera): ese sería pb en hebra delantera. El 3D no distingue las dos. Se ve igual en la vista (**validar con tejedora** si importa en la vista) |
| F4-22 | `mpa` / `hdc` | 1 | 1 | 1,5 | **Convención de altura, validar**. Un `mpa` consume 1 base y produce 1. No hay aumento ni disminución en mpa en el modelo |
| F4-23 | `pa` / `dc` | 1 | 1 | 2 | Convención de altura, validar. El pa de US es el `tr` de UK (ver sección 8) |
| F4-24 | `pad` / `tr` | 1 | 1 | 2,5 (rango 2,5 a 3) | Convención de altura, validar |
| F4-25 | `pd` / `slst` | 1 | 1 | **sin valor fiable** | Como ítem en medio de una vuelta es un punto que ocupa una base y deja otra. Alto casi nulo, pero **no hay fuente pública con una cifra**: `STITCH_HEIGHT_FACTOR.slst` queda fuera del promedio de la vuelta (ver sección 5). Distinto del pd de unión (F4-11) |
| F4-26 | `cad` / `ch` | 0 | 1 | **sin valor fiable** | Usos en amigurumi: un arco para dejar un hueco (brazos, asas). Queda fuera del promedio de la vuelta. Una cadeneta de un "espacio" que en la vuelta siguiente se trabaja como uno solo no se modela: el motor cuenta cada cadeneta como un punto. Fuera de alcance, **validar con tejedora** |
| F4-27 | `saltar` / `sk` | 1 | 0 | no aplica | Salta una base sin producir. Ancho cero arriba (hueco) |
| F4-28 | Hueco para un brazo: `V4: 5 pb, cad 4, saltar 4, 5 pb (14)` sobre una vuelta de 14 | Consume 5 + 0 + 4 + 5 = 14; produce 5 + 4 + 0 + 5 = 14. Cuadra. La vuelta siguiente, `V5: 5 pb, 4 pb, 5 pb (14)` o `14 pb`, consume 14 y cuadra. El 3D muestra el hueco (ancho cero abajo en la `cad` y arriba en el `saltar`, ADR 0010 sección 3) |

## 4. Conteos por vuelta y reglas de validación

| # | Caso | Esperado |
|---|---|---|
| F4-29 | Conteo declarado: `V2: aum x6 (12)` | `produced` = 12, cuadra. `V2: aum x6 (13)` da `ROUND_COUNT_MISMATCH` (**borrador**, `savable`, no `valid`). Sin conteo declarado: aviso informativo `ROUND_NO_EXPECTED` (ya existe) |
| F4-30 | Vuelta que no consume lo que dejó la anterior: `V3: [pb, aum] x5 (15)` sobre 12 | Consume 10 y produce 15; la anterior dejó 12. `ROUND_CONSUMPTION_MISMATCH` (error de tejido, **borrador**, ADR 0011 sección 4). La malla igual cierra repartiendo las bases en proporción (ADR 0010 sección 3) |
| F4-31 | Rango que no mantiene el conteo: `V11-30: 12 aum` sobre 60 | `ROUND_RANGE_CHANGES` (**borrador**). Un rango de vueltas iguales solo sirve si consume lo mismo que produce |
| F4-32 | Vuelta que no deja puntos (que no es la última) | `ROUND_ZERO` (**borrador**). La última vuelta puede terminar en cualquier conteo (el cierre se anota en `finish`) |
| F4-33 | Errores que **no** son borrador | `STITCH_UNKNOWN`, `COLOR_UNKNOWN_YARN`, `ITEM_COUNT`, `GROUP_*` y `SHAPE`: errores estructurales (ADR 0011 sección 4). Un patrón con alguno no se guarda |
| F4-34 | Vuelta de 201 puntos o más | No es error ni aviso del validador. `recommendedLimitNotices` la lista (límite recomendado de 200 por vuelta). `valid` sigue en true. Tope duro: `LIMITS.maxRoundStitches` |
| F4-35 | Cierre de la última vuelta | La última vuelta queda abierta en el 3D. El cierre (pasar la hebra por la hebra delantera de los puntos y tirar) va en `finish` como texto. **Convención de cierre**: nada de eso se modela en la v2 (ver "Decisión 6") |

## 5. Forma: `STITCH_HEIGHT_FACTOR` y calibración del disco plano

**Regla física**: en un disco plano, la circunferencia crece `2π` veces la distancia que sube el borde. Para un anillo de radio `r = n·w/2π`, un aumento de `Δn` puntos por vuelta pide `Δr = Δn·w/2π`. Queda plano si `Δr ≈ s`, es decir `Δn ≈ 2π·s/w = 2π/ρ`. Con `ρ = 1,2`, eso es 5,24 puntos por vuelta. Es una razón de ondulación, no una cifra de un punto.

**Convención** de las tejedoras ("regla del círculo"): se aumentan tantos puntos por vuelta como puntos tiene la primera vuelta. Los resúmenes consultados dan: pb 6; mpa 8 o 9 (se dividen: algunos dicen 8, otros 9 por ser más exacto); pa 12; pad 15, y otro resumen sugiere "6, 9, 12, 15" como guía aproximada. Esto es coherente con 1 / 1,5 / 2 / 2,5. Fuente en la sección Fuentes.

**Valores propuestos** de `STITCH_HEIGHT_FACTOR` (relativos a pb = 1):

| Punto | Valor | Qué es |
|---|---|---|
| `sc` | 1 | Referencia |
| `inc`, `inc3`, `dec` | 1 | Se entienden en pb (ADR 0010 sección 1, sin cambios) |
| `hdc` | 1,5 | Convención. Un resumen de calculadora de alturas usa 1,5; coherente con la regla del círculo 9 (o 8) |
| `dc` | 2 | Convención. Coherente con 12 aumentos y con `ROWS_PER_STITCH_BY_ASSUMPTION` (1,2 vueltas por pb y 0,6 por pa, relación 2:1) |
| `tr` | 2,5; rango 2,5 a 3 | **Las fuentes discrepan** (2,5 en la calculadora, "unas 3 veces" en otra). Validar con tejedora |
| `slst`, `ch` | sin valor fiable | No se inventa. Queda **fuera del promedio** de la vuelta y no cuenta en el alto. Si una vuelta solo tiene `slst` o `ch`, se usa 1. **Validar con tejedora** |

Alto de una vuelta = promedio de los factores de los puntos producidos con cuerpo (`sc`, `hdc`, `dc`, `tr`, `inc`, `inc3`, `dec`), por `roundHeightCm`.

| # | Caso | Esperado |
|---|---|---|
| F4-36 | Disco de pb con 6 aumentos por vuelta (6, 12, 18 … 60), `ρ` = 1,2 | `Δr/s` = (6/2π)/0,8333 = **1,146**. Debe quedar **plano y sin aviso**: `Δz = 0` para todas las vueltas y ningún `ROUND_GROWS_FAST`. **Fijar `PROFILE_RADIAL_TOLERANCE` = 1,25** (vale cualquier valor entre 1,15 y 1,3; 1,25 deja un 9 % de margen). Convención: sin tolerancia, el modelo con 1,2 vueltas por punto marcaría ondulado un disco que en la práctica queda plano. **Validar con tejedora**: si 6 aumentos de pb quedan realmente planos con la tensión de amigurumi |
| F4-37 | Mismo disco con 7 aumentos por vuelta | `Δr/s` = 1,337 > 1,25. Aviso informativo `ROUND_GROWS_FAST` con vuelta y valor. Umbral: con 1,25, el máximo plano es 6,54 puntos por vuelta |
| F4-38 | Mismo disco con 12 aumentos por vuelta (`aum` x12 sobre 12, 24, 36 …) | `Δr/s` = 2,29: `ROUND_GROWS_FAST`. Radio acotado a `r(i−1) + 1,25·s` y `strain > 1` (ondula) |
| F4-39 | Disco con mpa con 8 aumentos | No se puede escribir en el modelo (no hay aumento de mpa). **Fuera de alcance**; ver C-14. La cuenta para cuando exista: factor 1,5, `s` = 1,25·w y `Δn` plano = 7,85; 8 da 1,019 |
| F4-40 | Disminución rápida: 12 disminuciones por vuelta sobre 24 | `ROUND_SHRINKS_FAST` informativo. El cierre habitual `dism x6` sobre 12 (6 por vuelta) no avisa |
| F4-41 | Sensibilidad a la proporción: `Δr/s` de 6 aumentos de pb según `ρ` | `ρ` = 1,0 → 0,955; 1,1 → 1,05; 1,2 → 1,146; 1,3 → 1,24; 1,4 → 1,34. Con `ρ` ≥ 1,31 el disco de 6 aumentos avisa. Propiedad. **Validar con tejedora**: medir en 5 piezas reales el ancho del punto y el alto de la vuelta en espiral (puede que `ρ` de amigurumi sea más cercano a 1,05 que a 1,2) |
| F4-42 | Vuelta en hebra trasera (`ht` / `blo`) | **Convención de técnica, validar**. No cambia el conteo ni el alto. Produce una arista visible y permite doblar 90° (por ejemplo, la base plana contra la pared). El perfil **no se quiebra** en la v2; solo una línea de borde en el relieve (deseable) |
| F4-43 | Escala por `shapeMetrics` con la muestra supuesta de `suggestedGauge` (cat. 0 con `crochet-pa`) | **Error de dominio**: `shapeMetrics` entiende `rowsPer10cm` como vueltas de pb (ADR 0010 línea 59), pero `suggestedGauge` entrega vueltas de pa en la categoría 0. Con 0,6 vueltas por punto, `roundHeightCm` sale el doble de alto. Corrección: `shapeMetrics` recibe el punto de la muestra y convierte (`s_pb = s_medida / factor`); ver C-3 |
| F4-44 | Muestra del patrón y tensión de amigurumi | **Convención difundida, validar**: el amigurumi se teje más apretado que una muestra plana, con una aguja más chica que la que sugiere la etiqueta. La muestra supuesta de los grosores es de una tela plana del CYC, así que las medidas "≈ N cm" saldrán más grandes que la pieza real. El texto "estimación" y "supuesto" ya lo cubre; agregar la advertencia (ver sección 12) |

## 6. Fixtures de referencia

Muestra de los fixtures: 20 puntos y 24 vueltas en 10 cm (`w` = 0,5 cm, `s` = 0,41667 cm). Una sola lana (A). Anillo mágico, espiral. Todas las vueltas llevan su conteo declarado.

### Fixture A: "esfera" del ADR 0010 (39 vueltas, 1.800 puntos)

Es el escenario que el ADR 0010 llama esfera (sección 6): anillo mágico de 6, aumentos hasta 60, 20 vueltas de 60 y disminuciones hasta 6.

**Regla**: crecimiento V1 a V10: `n(Vk)` = 6k (+6 por vuelta, con `[pb (k−2), aum] x6`). Meseta: V11 a V30, 60 pb. Cierre: V31 a V39, `n` = 60 − 6(k − 30), con `[pb (39−k), dism] x6`, y V39 es `dism x6`. En cada vuelta de aumento, `consume = n(k−1)` y `produce = n(k−1) + 6`. En cada disminución, `consume = n(k−1)` y `produce = n(k−1) − 6`.

| Vuelta | Texto | Consume | Produce | Acumulado |
|---|---|---|---|---|
| V1 | `6 pb en AM (6)` | (libre) | 6 | 6 |
| V2 | `aum x6 (12)` | 6 | 12 | 18 |
| V3 | `[pb, aum] x6 (18)` | 12 | 18 | 36 |
| V4 | `[pb 2, aum] x6 (24)` | 18 | 24 | 60 |
| V5 | `[pb 3, aum] x6 (30)` | 24 | 30 | 90 |
| V6 | `[pb 4, aum] x6 (36)` | 30 | 36 | 126 |
| V7 | `[pb 5, aum] x6 (42)` | 36 | 42 | 168 |
| V8 | `[pb 6, aum] x6 (48)` | 42 | 48 | 216 |
| V9 | `[pb 7, aum] x6 (54)` | 48 | 54 | 270 |
| V10 | `[pb 8, aum] x6 (60)` | 54 | 60 | 330 |
| V11–30 | `60 pb (60)` | 60 | 60 (cada una) | 1.530 al final de V30 |
| V31 | `[pb 8, dism] x6 (54)` | 60 | 54 | 1.584 |
| V32 | `[pb 7, dism] x6 (48)` | 54 | 48 | 1.632 |
| V33 | `[pb 6, dism] x6 (42)` | 48 | 42 | 1.674 |
| V34 | `[pb 5, dism] x6 (36)` | 42 | 36 | 1.710 |
| V35 | `[pb 4, dism] x6 (30)` | 36 | 30 | 1.740 |
| V36 | `[pb 3, dism] x6 (24)` | 30 | 24 | 1.764 |
| V37 | `[pb 2, dism] x6 (18)` | 24 | 18 | 1.782 |
| V38 | `[pb, dism] x6 (12)` | 18 | 12 | 1.794 |
| V39 | `dism x6 (6)` | 12 | 6 | **1.800** |

| # | Caso | Esperado |
|---|---|---|
| F4-45 | Fixture A completo | `concreteRounds` da 39 vueltas, la V11–30 se despliega en 20. `validatePattern`: `valid`, sin errores ni avisos. `summarizePart`: `rounds` = 39, `totalStitches` = **1.800**, `finalCount` = 6. **El ADR 0010 dice "unos 1.900 puntos"; corregir a 1.800** (C-1) |
| F4-46 | Forma del fixture A con `ρ` = 1,2 y `PROFILE_RADIAL_TOLERANCE` = 1,25 | Las V1 a V10 crecen `Δr/s` = 1,146 ≤ 1,25: `Δz = 0` (disco plano). Las 20 vueltas de 60 suben `s` cada una: 8,33 cm. Las V31 a V39 son planas. Diámetro máximo = 60 × 0,5 / π = **9,55 cm**; alto ≈ **8,33 cm** (razón alto/diámetro ≈ 0,87). **Error de dominio en el ADR 0010** (sección 2, paso 4, y sección 6): esto no es una esfera sino un **tambor de tapas planas**. Aumentar 6 por vuelta en pb da un disco plano, no una cúpula: una esfera necesita crecer más despacio que el límite plano. La tabla real de una esfera de 60 puntos está en el fixture B. Mantener el fixture A para la prueba de rendimiento y cambiar el nombre a "cuerpo de 39 vueltas" |
| F4-47 | Strain del fixture A | `strain` = 1 en todos los anillos: ninguna advertencia, ningún `ROUND_GROWS_FAST` ni `ROUND_SHRINKS_FAST` |
| F4-48 | Propiedad de las sumas | Para toda vuelta del fixture, `consume(Vk) = produce(Vk−1)` y `produce` coincide con el conteo declarado. Duplicar la meseta (V11–32) da 41 vueltas y 1.920 puntos |

### Fixture B: esfera de perfil (36 vueltas, 1.384 puntos)

**Regla**: para una esfera de circunferencia máxima `C = 60` puntos, con `ρ` = 1,2, el largo de un meridiano (de polo a polo) es `C/2 = 30 w`. Las vueltas están separadas `s = 0,8333 w`, así que 30/0,8333 = **36 vueltas exactas**. El conteo ideal es `n(Vi) = 60·sen(π(i − 0,5)/36)`, redondeado al entero más cercano, con un mínimo de 6 (V1) y simétrico (`n(Vi) = n(V(37−i))`).

Conteos (V1 a V18; V19 a V36 son el espejo):

`6, 8, 13, 18, 23, 28, 32, 37, 41, 44, 48, 51, 53, 55, 57, 59, 59, 60`

Segunda mitad (V19 a V36): `60, 59, 59, 57, 55, 53, 51, 48, 44, 41, 37, 32, 28, 23, 18, 13, 8, 6`.

Suma: 2 × 692 = **1.384** puntos.

**Cómo se escribe cada vuelta** (para que `qa-tester` genere el texto): con `d = |n(Vk) − n(Vk−1)|`: si crece, `aum x d, pb (n(Vk−1) − d)`; si disminuye, `dism x d, pb (n(Vk−1) − 2d)`; si no cambia, `n pb`. La V1 es `6 pb en AM`. El motor cuenta igual con cualquier distribución. **Los aumentos escalonados entre vueltas son solo texto y vista, nunca conteos**.

| # | Caso | Esperado |
|---|---|---|
| F4-49 | Fixture B completo | `valid`, 36 vueltas, `totalStitches` = 1.384, `finalCount` = 6. Ninguna vuelta crece más de 5 puntos |
| F4-50 | Forma del fixture B con `ρ` = 1,2 | Diámetro máximo 9,55 cm. Alto ≈ **10,1 cm** (calculado a mano con la fórmula del ADR 0010, sección 2, ±0,1; `qa-tester` debe recalcular con `partProfile`). Criterio: razón alto/diámetro entre **0,95 y 1,15**. Es una esfera aproximada, a diferencia del fixture A. Todos los `Δr/s` ≤ 1,25: sin avisos. **Validar con tejedora**: que una pieza real con estos conteos, rellena, sea redonda |
| F4-51 | Comparación A frente a B | La razón alto/diámetro de B es mayor que la de A. Misma circunferencia máxima y un alto de ~10 frente a ~8 cm. Es la prueba de que el perfil distingue dos patrones distintos con el mismo máximo (ADR 0010, opción A frente a C) |

## 7. Relleno (`stuffing`) e inicio en óvalo: decisión 6

### Relleno

| # | Caso | Esperado |
|---|---|---|
| F4-52 | Propuesta de `Part.stuffing: "stuffed" | "unstuffed"` | **No hay regla suficiente. Recomendación: dejarlo fuera de la v2** (ver "Decisión 6" más abajo) |
| F4-53 | Pieza sin relleno, por ejemplo una oreja ("aplanar y coser abierta") | Se anota en `finish` ("no rellenar; aplanar y coser abierta") y en `note`. **No hay regla de forma**: un tubo aplanado pasa de circunferencia `C` a un ancho de `C/2` aproximado, pero la posición de los dobleces y el grosor dependen de cómo se aplana, y la oreja plana tiene dos capas. No hay fuente pública con una regla |
| F4-54 | El efecto del relleno en la forma real | Redondea y abomba la pieza, y aumenta sus medidas; no hay cifra pública. Es el motivo por el que el fixture A (tambor) y el B (esfera) se ven distintos hasta con relleno. El aviso de prototipo debe decir "el relleno redondea la pieza" |

### Óvalo

| # | Caso | Esperado |
|---|---|---|
| F4-55 | Óvalo de pb con una cadeneta de `n` | **Convención que varía**: la receta más difundida (de dos tutoriales) es "pb en la 2.ª cadeneta desde el ganchillo, `n − 3` pb, 3 pb en la última cadeneta, `n − 3` pb por el otro lado y 2 pb en la primera cadeneta", que da **2n** (n = 7 → 14; n = 10 → 20). Otras recetas hacen 2 o 3 puntos en cada extremo y la cantidad cambia. No hay una regla única de consumo de la V1 |
| F4-56 | Geometría del óvalo | Un óvalo no es de revolución: el perfil de `partProfile` (ADR 0010) es axisimétrico y lo dibujaría como un círculo. La malla no lo puede representar |
| F4-57 | Consecuencia | **Recomendación: fuera de la v2**. No agregar el campo de óvalo; queda para una v3 con su ADR (regla de consumo más un perfil que no sea de revolución). Mientras tanto, los patrones con base ovalada se escriben con `Inicio: AM` y la V1 con los puntos finales, **sin que el 3D los dibuje ovalados**, o quedan como borrador |

## 8. Copias de partes, sin espejo

| # | Caso | Esperado |
|---|---|---|
| F4-58 | `copies: 2` en la oreja | Una sola parte, dos copias idénticas punto por punto (mismas vueltas, mismas lanas). Las dos comparten malla; cambia la matriz. `recommendedLimitUsage` multiplica los puntos de la parte por `copies` |
| F4-59 | Sin espejo | Regla física: una pieza de crochet no tiene espejo (el punto tiene una inclinación, pero la pieza se puede cambiar de lado al coserla). La oreja izquierda y la derecha se tejen igual y se ubican girándolas. Un espejo mostraría una pieza que no existe. En hileras, el derecho y el revés se ven distintos: la copia se cose con el derecho hacia afuera sin espejo |
| F4-60 | Piezas que sí son distintas | Un brazo con el pulgar a un lado, o una pieza con colores distintos, son dos partes y no copias. `copies` no admite variantes |
| F4-61 | Término del encabezado | **Convención de las patronistas**: "Hacer 2" es lo más usual; "Cantidad: 2" es la propuesta del ADR 0011. Aceptar `Cantidad`, `Hacer`, `Piezas` y `Tejer`. Mostrar "Cantidad: 2" (**validar con tejedora**). En la interfaz, evitar "copias" (es un término de software) y decir "se teje 2 veces" |
| F4-62 | Mensajes de la lista de partes | "Oreja (1 de 2)", "Oreja (2 de 2)". Al bajar de 3 copias a 2, avisar qué piezas quedaron sin ubicar (CA4-E8) |

## 9. Abreviaturas ES, US y UK

**Fuente**: tabla "U.S. vs. U.K. Terminology" de la página de abreviaturas del Craft Yarn Council (abierta el 2026-11-13) y resúmenes de guías secundarias. La tabla ES es la de `stitches.ts` (Chile) más las variantes que aparecen en las fuentes. Las variantes ES son **pendiente de validar por tejedora**.

| Código | ES (motor, Chile) | US (CYC) | UK (CYC) | Trampas |
|---|---|---|---|---|
| `sc` | pb, punto bajo | sc, single crochet | **dc**, double crochet | **La misma abreviatura "dc" es punto bajo en UK y punto alto en US.** Nunca se adivina |
| `hdc` | mpa, medio punto alto | hdc | **htr**, half treble | "htr" no se confunde con "ht" (hebra trasera). Variante ES: "pma" (punto medio alto) |
| `dc` | pa, punto alto | **dc**, double crochet | **tr**, treble | "tr" en UK es el pa; "tr" en US es el pad. Misma abreviatura, distinto punto |
| `tr` | pad, punto alto doble | **tr**, treble | **dtr**, double treble | UK tiene además `trtr`. Sin código en el motor |
| `slst` | pd, punto deslizado | sl st | ss, slip stitch | Variante ES: "punto raso" (pr). Hoy US sale como "slst"; el CYC escribe "sl st" |
| `ch` | cad, cadeneta | ch | ch | Igual en los dos |
| `inc` | aum | inc | inc | Igual. Abreviatura de aumento de pb |
| `inc3` | aum3 | inc3 | inc3 | No es CYC; provisional |
| `dec` | dism | dec / sc2tog | dec / **dc2tog** | En UK la disminución de pb se llama "dc2tog". En US "dc2tog" es de pa |
| `sk` | saltar | sk | **miss** | UK dice "miss". Provisional |
| hebra trasera | ht | blo | blo | CYC: "BL o BLO". "ht" y "hd" son provisionales |
| hebra delantera | hd | flo | flo | CYC: "FL o FLO" |
| anillo mágico | AM | mr (también "magic ring") | mr | "mr" en la página del CYC no aparece como tal. Provisional |
| presilla (yo) | — | yo | **yoh** | No está en el motor |

| # | Caso | Esperado |
|---|---|---|
| F4-63 | `parseRound("R3: 12 dc", ...)` en modo `es-us` frente a `es-uk` | `es-us`: 12 `dc` (punto alto). `es-uk`: 12 `sc` (punto bajo). Mismo texto, conteos de puntos iguales pero código distinto, y alto distinto en el 3D. Nunca se adivina el modo |
| F4-64 | `sc` en modo `es-uk` | `sc` no es un término UK. **Mejora**: error de lectura con la pista "sc es US; en UK el punto bajo se llama dc". Hoy `lookupStitch` lo aceptaría como `sc` |
| F4-65 | `tr` en cada modo | `es-us`: `tr` (pad, 2,5). `es-uk`: `dc` (pa, 2) |
| F4-66 | `htr` y `dtr` en modo `es-uk` | `htr` = `hdc`; `dtr` = `tr`. En `es-us` son desconocidos: `PARSE_UNKNOWN_STITCH` |
| F4-67 | Propiedad RT5 | En todo modo, ningún alias corresponde a dos puntos distintos. Los alias deben cargarse por modo (un alias compartido entre modos solo si significa lo mismo: `pb`, `mpa`, `pa`, `pad`, `pd`, `cad`, `aum`, `dism`, `ch`, `inc`) |
| F4-68 | `formatPart` en UK | Escribe `dc` para el punto bajo. Ida y vuelta (RT1) sin pérdida por modo |
| F4-69 | Variantes del español regional | **Pendiente de validar por tejedora**; no se agregan sin respaldo. Las fuentes consultadas muestran: "medio punto" como sinónimo de pb en algunas fuentes latinoamericanas (riesgo: se confunde con "medio punto alto"), "pma" junto a "mpa" para el mpa, "punto raso" y "punto pasado" para el pd, y "punto bajísimo" (p.bjs) sin una equivalencia que pudiera confirmar. **No agregar alias hasta T1b** |

## 10. Límites recomendados

Estimaciones propias de orden de magnitud, **sin fuente pública, validar con tejedora**. Con la muestra de los fixtures (4,8 puntos por cm²), una muñeca de 30 cm tiene del orden de 10.000 puntos de superficie. Con un grosor más grueso, menos.

| # | Caso | Esperado |
|---|---|---|
| F4-70 | Escenario del ADR 0010 (cuerpo de 1.800 puntos, 9 partes de 10 a 25 vueltas, 6 de ellas con 2 copias) | Del orden de 7.000 puntos en la escena: dentro de los 40.000. 10 partes, 1 con 2 copias: dentro de todo |
| F4-71 | 20 partes | Cubre con holgura los amigurumi habituales (un muñeco típico tiene de 8 a 15 partes distintas, contando ropa y accesorios). Una pieza con mucha ropa puede pasar; es solo advertencia. **Mantener 20** |
| F4-72 | 10 copias | Cubre brazos, piernas, orejas, pétalos de 5 a 8 y patas de pulpo o araña de 8. Puede quedarse corto en un ciempiés o un gusano con 15 a 20 segmentos iguales. Solo advertencia. **Mantener 10** (decisión de la usuaria) |
| F4-73 | 100 vueltas por parte | Cubre una parte grande (una pelota de 60 vueltas; un peluche grande con 80). Un cuerpo alargado (serpiente) puede pasar. **Mantener 100** |
| F4-74 | 200 puntos por vuelta | Cubre un peluche de 40 a 60 cm. Un cojín o un peluche gigante (más de 80 cm) lo supera. **Mantener 200** |
| F4-75 | 40.000 puntos | Cubre casi todo hasta unos 80 cm de alto con muestra fina. Con lana gruesa, un peluche de más de 1 m pasaría los 40.000. **Mantener** |
| F4-76 | Conteo del total de la escena | Σ por parte de (Σ `produced`) × `copies`, con la V1 contada. Es lo que usa `recommendedLimitUsage` (propiedad G13) |

**Conclusión**: los cinco límites recomendados cubren los amigurumi habituales con holgura; no hace falta ajustarlos antes de T4.

## 11. Terminología: términos de amigurumi para el glosario pendiente (todos "pendiente")

| Término | Propuesta | Notas |
|---|---|---|
| Anillo mágico | "anillo mágico" (AM) | Alias: "anillo ajustable". En inglés "magic ring" o "magic loop" (el último también es un método de tejido en redondo a palillo, no es lo mismo) |
| Cadeneta base | "cadeneta inicial" o "base de cadenetas" | |
| Espiral | "en espiral" | Vueltas que se trabajan una tras otra sin cerrar; se usa un marcador de puntos |
| Vueltas cerradas | "vueltas cerradas" (unidas) | Cada vuelta se cierra con un pd |
| Aumento | "aumento" (aum) | 2 pb en el mismo punto |
| Disminución | "disminución" (dism) | 2 pb juntos |
| Disminución invisible | "disminución invisible" | |
| Relleno | "relleno" | Fuera de la v2 |
| Cantidad | "cantidad" o "hacer N" | Copias |
| Cierre | "cierre" o "remate" | |
| Pieza, parte | "parte" en el estudio; "pieza" en el armado | |

## 12. Textos propuestos en los ADR: revisión

| # | Texto | Revisión |
|---|---|---|
| F4-77 | ADR 0010, sección 2: `ROUND_GROWS_FAST` "esta vuelta crece más rápido de lo que la tela puede quedar plana: en la realidad ondula" | Correcto en lo físico. Puede asustar cuando es intencional (volantes, pétalos). **Propuesta**: "Esta vuelta aumenta más de lo que la tela puede abrir en plano (+N puntos; una vuelta de pb queda plana con unos 6). Si la tejes así, la pieza tiende a ondularse. Puede ser lo que buscas." |
| F4-78 | `ROUND_SHRINKS_FAST` (no tiene texto en el ADR) | **Propuesta**: "Esta vuelta disminuye más de lo que la pieza puede cerrarse en curva (−N puntos). Si la tejes así, la pieza se frunce o se cierra en copa. Puede ser lo que buscas (por ejemplo, el remate)." |
| F4-79 | ADR 0010, sección 7: aviso de prototipo | Correcto. **Agregar**: "el relleno redondea la pieza y puede cambiar sus medidas" y "amigurumi se teje más apretado que una muestra plana; teje una muestra con tu aguja" (F4-44). Sin poder cerrarse: bien |
| F4-80 | ADR 0011, sección 9: "Oreja (1 de 2): cabeza, entre la V10 y la V11, a 4 puntos del inicio de la vuelta" | **Problema**: en una espiral "el inicio de la vuelta" es donde puso el marcador la tejedora y se mueve; "a 4 puntos" no se puede seguir. **Propuesta**: omitir la distancia en puntos o usar "a la derecha del centro de la cara". Aclarar de dónde se cuenta: "contando desde el anillo mágico" (desde el inicio de la pieza, no desde el cuello). "Cose" o "une" |
| F4-81 | ADR 0011, sección 7: aviso de `#` ("Los comentarios con # no se guardan; usa > para una nota") | Correcto |
| F4-82 | ADR 0011, sección 3b: "Esto supera el límite recomendado de 20 partes. La vista previa puede ir más lenta. ¿Seguir igual?" | Correcto. Aclarar en la ayuda que las copias no cuentan como partes y que no es un límite del tejido |
| F4-83 | `ROUND_CONSUMPTION_MISMATCH` en `validate.ts` (línea 900) | Mensaje correcto. **Mejora**: agregar la pista de F4-12 (cadeneta de subida y pd de unión) y, con `chain` y espiral o cerrada, la pista del aro (F4-3 y F4-4) |
| F4-84 | `ROUND_RANGE_CHANGES` | Correcto. Para el aumento por rango ("V5–8"), sugerir escribir cada vuelta |

## Decisión 6 (resumen para el ADR)

- **Relleno (`stuffing`): fuera de la v2.** No hay regla de forma con fuente: aplanado y relleno dependen de la tensión, la cantidad de relleno y cómo se aplana, y no hay cifra pública. El campo no se agrega. El texto libre (`finish`, `note`) cubre "no rellenar". La simulación de relleno ya está fuera del alcance (ADR 0010, alternativas descartadas).
- **Óvalo: fuera de la v2.** La regla de consumo de la V1 no es única (F4-55). Además, la malla de revolución no puede dibujarlo (F4-56). Queda para una v3 con su ADR.
- **Consecuencia**: la v2 queda con `layout` y `copies`. Si se retoman, el ADR de la v3 debe traer reglas validadas por tejedoras.

## Correcciones para las enmiendas de los ADR

### ADR 0010 (clasificadas)

| ID | Clase | Dónde | Corrección |
|---|---|---|---|
| C-1 | Error de dominio | Línea 293 | El escenario de referencia dice "unas 40 vueltas y unos 1.900 puntos"; son **39 vueltas y 1.800 puntos** (F4-45). Con 22 vueltas de 60: 41 vueltas y 1.920 |
| C-2 | Error de dominio | Líneas 132 y 293 | La "esfera" con +6 por vuelta es un **tambor de tapas planas** (F4-46): 6 aumentos por vuelta en pb dan un disco plano. Una esfera necesita crecer más despacio (fixture B). Reescribir "Así salen las esferas, los cilindros y las gotas habituales" y dar el fixture B como esfera; renombrar el A como "cuerpo de 39 vueltas" |
| C-3 | Error de dominio | Línea 59 y sección 1 | `roundHeightCm = 10 / rowsPer10cm` se entiende como pb, pero `suggestedGauge` da vueltas de pa en la categoría 0 (F4-43). `shapeMetrics` debe recibir el punto de la muestra y convertir (pa = 2) |
| C-4 | Error de dominio | Líneas 439 (G3) y 130 a 131 | G3 dice que con `|Δr| ≤ s × tolerancia` la distancia sobre el meridiano es el alto de la vuelta y `strain = 1`. Con `s < |Δr| ≤ 1,25·s`, el anillo sube `Δz = 0` y la distancia es `Δr ≠ s`. Reescribir G3: "con `|Δr| ≤ s`, la distancia es `s`; con `s < |Δr| ≤ s·tolerancia`, `Δz = 0` y `strain = 1`" |
| C-5 | Mejora | Líneas 68 y 134 a 138 | Fijar `STITCH_HEIGHT_FACTOR` (sc 1; hdc 1,5; dc 2; tr 2,5, rango 2,5 a 3; inc, inc3 y dec 1) y `PROFILE_RADIAL_TOLERANCE` = 1,25 (sección 5). `slst` y `ch` sin valor: fuera del promedio de la vuelta. Todo "validar con tejedora" |
| C-6 | Mejora | Líneas 151 y 146 a 151 | Reemplazar los textos de los avisos por F4-77 y F4-78. Definir el umbral informativo por crecimiento por vuelta (`Δr/s`), no solo por `strain`, que en anillos pequeños sube de forma engañosa |
| C-7 | Mejora | Línea 213 | La vuelta en hebra trasera no quiebra el perfil en la v2 (F4-42). Solo línea de borde |
| C-8 | Mejora | Línea 67 | El 1,2 vueltas por punto sigue "validar con tejedora": medir el ancho del punto y el alto de la vuelta en espiral en 5 piezas reales (F4-41). Puede que el valor de amigurumi sea ~1,05 |
| C-9 | Mejora | Línea 126 y `validate.ts` líneas 890 a 901 | Con `chain` en espiral o cerrada, el desajuste de la V1 pasa de error a advertencia, con la pista del aro (F4-3 y F4-4). También `validate.ts` línea 789: una cadeneta de aro de 1 no tiene sentido; mínimo 2 |
| C-10 | Mejora | Líneas 212 y `validate.ts` | Agregar a los mensajes de desajuste la pista de la cadeneta de subida y del pd de unión (F4-11 y F4-12) |
| C-11 | Ambigüedad | Línea 411 | Aviso de prototipo: agregar el relleno y la tensión de amigurumi (F4-79) |
| C-12 | Mejora | Sección 3 | `STITCHES` no tiene aumento de mpa o pa; documentar que "aum" y "dism" son en pb (F4-39) |

### ADR 0011 (clasificadas)

| ID | Clase | Dónde | Corrección |
|---|---|---|---|
| C-13 | Error de dominio | Líneas 63 y 64 | Resolver las condicionales: **`stuffing` y óvalo quedan fuera de la v2** (decisión 6; sección 7 de este documento) |
| C-14 | Mejora | Línea 286 | Encabezado de copias: aceptar `Cantidad`, `Hacer`, `Piezas` y `Tejer`; mostrar "Cantidad" (F4-61). Evitar "copias" en la interfaz |
| C-15 | Ambigüedad terminológica | Línea 389 | Tabla UK confirmada con el CYC (sección 9): `sc` = dc, `hdc` = htr, `dc` = tr, `tr` = dtr, `slst` = ss, `sk` = miss (provisional). `sc` en `es-uk` debe dar error de lectura con pista (F4-64) |
| C-16 | Ambigüedad terminológica | `stitches.ts` líneas 23 a 25 y 44 | `Dialect` agrega `uk`. Cargar los alias por modo (RT5). US sale como "sl st" (CYC), no "slst". Quitar o marcar el alias `sc2tog` en UK (allí es `dc2tog`) |
| C-17 | Mejora | Línea 421 | Reemplazar el ejemplo de "Dónde va cada pieza" (F4-80): sin distancia en puntos desde "el inicio de la vuelta"; aclarar que se cuenta desde el anillo mágico |
| C-18 | Mejora | Líneas 159 y 164 a 170 | Mantener los cinco límites (F4-70 a F4-76) |
| C-19 | Mejora | `text.ts` línea 231 y `validate.ts` línea 789 | Hileras con anillo mágico: aviso informativo (F4-7) |
| C-20 | Mejora | `text.ts` | Aviso informativo `MAGIC_RING_UNUSUAL` (F4-2) |
| C-21 | Ambigüedad terminológica | Glosario | "Cadeneta de subida", "pd de unión", "cadeneta de giro" como términos del glosario con la advertencia de que no cuentan como puntos (F4-11 y F4-12) |

## Hoja para validar con tejedoras (T1b)

1. ¿Se lee y se escribe fácil la sintaxis (`V3: [pb, aum] x6 (18)`, `aum x6`, `@B`, `>`)? ¿Les sirven los bloques?
2. **Anillo mágico**: ¿de 4 a 8 puntos es lo habitual, y 10 a 12 con mpa o pa? ¿Prefieren ver "cad 2" como alternativa de inicio (F4-3)?
3. **Cadeneta en aro**: ¿trabajan un punto en cada cadeneta o dentro del aro (F4-4)?
4. **Hileras**: ¿cuentan la cadeneta de giro en mpa y pa como punto (F4-6, F4-12)? ¿"Hilera" o "fila"?
5. **Pd de unión y cadeneta de subida** en vueltas cerradas: ¿nunca se cuentan en pb, y en pa sí (F4-11, F4-12, F4-15)?
6. **Disminución invisible**: ¿les importa que la vista no la distinga de la común (F4-21)?
7. **Altura de los puntos** (`STITCH_HEIGHT_FACTOR`): mpa 1,5; pa 2; pad 2,5 a 3 (F4-22 a F4-24). ¿Y el pd (F4-25) y la cadeneta (F4-26)?
8. **Disco plano**: ¿6 aumentos por vuelta de pb quedan planos con su tensión de amigurumi? ¿Desde cuántos ondula (F4-36, F4-37)? Medir el ancho del punto y el alto de la vuelta en espiral en 5 piezas (F4-41).
9. **Hebra trasera**: ¿forma una arista que permite doblar la pieza (F4-42)?
10. **Esfera**: ¿una pieza real con los conteos del fixture B queda redonda al rellenarla? ¿Y el fixture A queda como tambor (F4-46, F4-50)?
11. **Relleno y óvalo** (decisión 6): ¿les parece bien dejarlos para después? ¿Cuál receta de óvalo usan: 2n (F4-55)?
12. **Tensión de amigurumi**: ¿cuánto más apretado que la muestra de la etiqueta? ¿Las medidas estimadas quedan grandes (F4-44)?
13. **Copias**: ¿"Cantidad", "Hacer 2" u otro? ¿Alguna vez necesitan una copia en espejo o con otro color (F4-59 a F4-61)?
14. **Nombres ES, US y UK** y variantes regionales (F4-69): mpa frente a pma; "medio punto" (¿pb o mpa?); pd frente a "punto raso"; "punto bajísimo" (¿qué punto es?). Las **variantes por país**, de dónde son.
15. **Grupos de más de 2 niveles**: ¿los usan? ¿Echan de menos arrastrar y soltar (decide el editor de bloques completo)?
16. **Parecido del 3D** con 2 o 3 piezas propias, incluido el aspecto por fibra (algodón, acrílico y una mezcla con halo).
17. **Límites recomendados** (F4-70 a F4-76): ¿los tamaños típicos que arman caben?
18. **Textos**: avisos F4-77 a F4-80, "Dónde va cada pieza" (¿se entiende "entre la V10 y la V11"?).

## Fuentes

- Craft Yarn Council, abreviaturas y terminología US/UK (**abierta**): https://www.craftyarncouncil.com/standards/crochet-abbreviations . Fuente de sc, hdc, dc, tr, sl st / ss, dec, inc, ch, sc2tog, BLO y FLO, y de la tabla "U.S. vs. U.K. Terminology". "mr" no aparece en esa página.
- Craft Yarn Council, *Standard Yarn Weight System*: https://www.craftyarncouncil.com/standards/yarn-weight-system
- Regla del círculo (6, 8 o 9, 12; "6, 9, 12, 15" como guía aproximada). **Solo por resumen de búsqueda, no abiertas**: https://justbcrafty.com/?p=83967 , https://bhookedcrochet.com/?p=6502 , https://zeroonecrochet.pages.dev/2025/04/10/the-math-of-a-flat-circle
- Alturas relativas de los puntos (1 / 1,5 / 2 / 2,5; "tr unas 3 veces"; cadenetas de giro 1, 2, 3, 4). **Solo por resumen, no abierta**: https://knitcalcs.pages.dev/crochet/stitch-height-calculator
- Inicio en óvalo (recetas con resultado 2n y variantes). **Solo por resumen, no abiertas**: https://thecaffeinatedsnail.com/how-to-crochet-an-oval/ , https://www.shinyhappyworld.com/2018/02/how-to-crochet-oval-amigurumi.html
- Disminución invisible (mismo conteo que la común, solo cambia la técnica). **Solo por resumen, no abiertas**: https://www.supergurumi.com/crochet-normal-decrease-and-invisible-decrease , https://allaboutami.com/invisibledecrease
- Terminología en español (pb, pa, pad, "medio punto", "pma", "punto raso"). Fuentes dispersas y en parte latinoamericanas; no confirman el uso chileno. **Solo por resumen**: https://www.garnstudio.com/dictionary.php?lang=es , https://manualidades.facilisimo.com/ganchillo-iii-abreviaturas-crochet-iii-abbreviations_2204664.html
- Estimaciones de límites (F4-70 a F4-76), la regla de ondulación (F4-36 a F4-41), los fixtures A y B, y la tolerancia 1,25: **cálculo propio** de `experto-tejido`; las cifras se pueden recalcular con las fórmulas del ADR 0010.

## Pendiente de validar por tejedora

- Cantidad habitual de puntos del anillo mágico y umbral de `MAGIC_RING_UNUSUAL`.
- Lectura de la cadeneta en aro (cada cadeneta o dentro del aro).
- Cadeneta de giro en hileras con mpa y pa.
- Altura relativa de mpa, pa, pad, pd y cadeneta; proporción de vueltas por punto en espiral.
- Disco plano con 6 aumentos de pb con tensión de amigurumi.
- Hebra trasera como arista.
- Esfera redonda con los conteos del fixture B.
- Tensión de amigurumi frente a la muestra de la etiqueta.
- Término de copias ("Cantidad" u otro).
- Variantes ES regionales: mpa o pma, "medio punto", "punto raso", "punto bajísimo".
- Tabla UK: `miss`, y los alias `sc2tog` y `dc2tog`.
