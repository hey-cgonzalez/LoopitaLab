# @loopitalab/pattern-core

Modelo canónico de patrones, motor determinista y validador. Sin dependencias: corre igual en el navegador, en Next.js y en las Edge Functions de Supabase. Ver [ADR 0001](../../docs/adr/0001-modelo-canonico.md) y [ADR 0002](../../docs/adr/0002-nucleo-sin-dependencias.md).

## Qué hace

La tabla lista todo lo que exporta `src/index.ts`.

| Módulo | Exporta |
|---|---|
| `types.ts` | Tipos del modelo: `Pattern` (`ChartPattern` o `WrittenPattern`), `Technique`, `WeightCategory` (0 a 7), `Yarn`, `YarnColor`, `FiberShare`, `Gauge`, `Origin`, `Chart`, `RenderShape`, `Part` (con `copies` desde la v2), `PartStart`, `Round`, `Item` (`StitchItem`, `GroupItem`, `ColorItem`), `StitchCode`, `Loop`, `Issue`, `Severity`; posición de las partes (v2): `Layout`, `Placement`, `PartRef`, `FreeAt`, `SurfaceAt`, `Vec3`. Constantes `SCHEMA_VERSION` (hoy 2) y `NO_STITCH` (−1, casilla sin punto) |
| `stitches.ts` | `STITCHES` (cuánto consume y produce cada punto, abreviaturas `es` de Chile, `us` y `uk` del Craft Yarn Council, y alias de lectura por dialecto), `LOOPS` (hebra delantera o trasera), `normalizeTerm` (minúsculas, sin puntos ni espacios extra), `lookupStitch(term, mode?)` y `lookupLoop(term, mode?)` (término o alias → código en el modo de lectura, por omisión `"es-us"`, o `undefined`; buscan en un `Map`, así "toString" o "__proto__" no son puntos), `stitchAbbrev` y `loopAbbrev` (código → abreviatura en `"es"`, `"us"` o `"uk"`), `DIALECTS`, `READING_MODES`, `readingModeFor(dialect)`, `stitchAliases(mode)` y `loopAliases(mode)` (pares alias → código que carga cada modo; para RT5 y `glossary`), `otherDialectHint(term, mode)`. Tipos `StitchDef`, `LoopDef`, `DialectAliases`, `Dialect` y `ReadingMode` |
| `written.ts` | `countRound`, `expandRound`, `concreteRounds`, `summarizePart`, `startAvailable` (puntos disponibles para la primera vuelta: `null` con anillo mágico, la cadeneta en vueltas cerradas o espiral, y la cadeneta menos 1 en hileras); trabajo de expansión (T20-A1): `roundExpansionWork`, `partExpansionWork` y `exceedsExpansionLimits` (nodos por vuelta, trabajo por vuelta y por parte; aritméticos, nunca lanzan; defensa de los derivados con datos sin validar). Tipos `ExpandedStitch`, `RoundCount`, `ConcreteRound`, `PartSummary` |
| `chart.ts` | `cellIndex`, `motifCell`, `fullSize`, `cellAt`, `fullRow`, `yarnTotals`, `stitchTotal`, `rowFloats`, `yarnUsage`, `dimensionsCm`, `floatLengthCm`; derivados del colorwork: `motifCoord`, `rowStitchCount`, `rowStitchCounts`, `shaping`, `rowShapingColumns`, `readingDirection`, `wornOrientation`. Tipos `RowFloat`, `YarnUsage`, `ChartDimensions`, `RowShaping`, `RowShapingColumns`, `ReadingDirection` |
| `edit.ts` | Operaciones puras de edición: `paintCells`, `fillRegion`, `resizeMotif`, `setRepeat`, `addYarn`, `removeYarn`, `reorderYarns` (estas tres, para gráficos y patrones escritos: `<P extends Pattern>(pattern: P, …) => P`), `newChartPattern`; `EDIT_LIMITS`, `ANCHORS`. Tipos `CellRef`, `Anchor`, `NewChartInput` |
| `edit-written.ts` | Operaciones puras de edición de patrones escritos (ADR 0011, sección 6; ver [Patrón escrito: edición](#patrón-escrito-edición)): `newWrittenPattern`; partes (`addPart`, `renamePart`, `movePart`, `setPartConstruction`, `setPartStart`, `setPartStartYarn`, `setPartFinish`, `setCopies`, `removePart`); vueltas (`replacePartRounds`, `insertRound`, `removeRound`, `replaceRound`); ítems por ruta a profundidad completa (`insertItem`, `updateItem`, `removeItem`, `moveItem`, `wrapInGroup`, `unwrapGroup`); posición (`setPlacement`, `clearPlacement`); armado (`setAssembly`); `replaceYarnRefs`. Tipos `ItemPath`, `NewWrittenInput`, `UnplaceResult` |
| `migrate.ts` | `migratePattern` y el tipo `MigrationResult`: camino obligatorio de lectura de todo documento. Tipos de la v1 (`PatternV1`, `ChartPatternV1`, `WrittenPatternV1`, `PartV1`), solo para las pruebas de migración |
| `recommended.ts` | Límites recomendados de un patrón escrito (ADR 0011, sección 3b): `RECOMMENDED_WRITTEN_LIMITS`, `recommendedLimitUsage`, `recommendedLimitNotices`. Tipos `RecommendedLimit` y `LimitUsage`. No pasan por el validador |
| `text.ts` | `parseRound(text, line?, mode?)`, `parsePart(text, { id, mode? })`, `parseWrittenParts(text, { partId, mode? })`, `formatRound`, `formatPart`, `formatPartLines` (texto y línea de cada vuelta), `formattedPartLength(part, dialect?)` (largo exacto de `formatPart` sin armar el texto; sin dialecto, el del más largo), `normalizePart`, `PARSE_LIMITS`, `COMMENT_WARNING`. Tipos `ParseResult` (con `warnings` opcional), `ParsePartOptions`, `ParseWrittenPartsOptions`, `FormattedPart` |
| `letters.ts` | `yarnLetter(index)`: letra de la lana según su orden en el documento (A… Z y, desde la 27, AA, AB… como las columnas de una planilla). La usan el validador, el gráfico SVG, la cuadrícula del editor y el modo tejiendo |
| `profile.ts` | Perfil de las partes de un patrón escrito (ADR 0010, secciones 1 y 2): `shapeMetrics`, `partProfile`, `partDimensions`, `roundHeightFactor`, `STITCH_HEIGHT_FACTOR`, `PROFILE_RADIAL_TOLERANCE`. Tipos `GaugeStitch`, `ShapeMetrics`, `ProfileRing`, `RevolutionProfile`, `PanelRow`, `PanelProfile`, `PartProfile`. Ver [Perfil de las partes](#perfil-de-las-partes-patrón-escrito) |
| `validate.ts` | `validatePattern`, `parsePattern`, `validateYarn`, `isDraftError`, `DRAFT_ERROR_CODES`, `LIMITS` (definido en `limits.ts`; topes duros, incluidos los de la v2). Tipos `ValidateOptions`, `ValidationResult` |

## Cuándo puede lanzar una excepción

- **Nunca lanzan y terminan en tiempo acotado** con `null`, valores primitivos ni nada que pueda producir `JSON.parse` (incluidos números como `2^53` o `1e308` y claves como `__proto__`): `validatePattern`, `parsePattern`, `validateYarn`, `migratePattern`, `newChartPattern`, las operaciones de `edit.ts` y de `edit-written.ts` (incluido `newWrittenPattern`), `normalizePart`, `recommendedLimitUsage` y `recommendedLimitNotices` (estas dos, también con getters que lanzan: devuelven los cinco límites en 0). Las tres primeras y `migratePattern` tampoco lanzan con objetos armados a mano con getters o `Proxy` que lanzan (try/catch acotado): `validatePattern` informa `SHAPE` y `migratePattern` informa `SCHEMA_VERSION`. El validador acota `number` y `through` de cada vuelta antes de recorrer los rangos.
- **Suponen un documento `savable`** (sin errores estructurales, ADR 0003, E10), no necesariamente `valid`: los derivados de `chart.ts` (y `stitch-render`). Funcionan con `CHART_EMPTY`, con vueltas sin puntos y con cuñas que dan `CHART_SHAPING_IMPOSSIBLE` (propiedad C14). Con un gráfico dañado pueden devolver valores sin sentido (por ejemplo, `NaN` o `Infinity` en `dimensionsCm` con una muestra de 0 puntos), pero `rowStitchCounts` y `shaping` devuelven `[]` si el alto o las repeticiones no son enteros.
- **Suponen un documento `savable`** también en los patrones escritos (ADR 0011, sección 4): los derivados de `written.ts`, `formatRound` y `formatPart` funcionan con vueltas que no cuadran, numeración rota y anclas fuera del anfitrión, que son errores de tejido o advertencias. Con un documento que no es `savable`, ver el punto siguiente.
- **Suponen un documento validado**: los derivados de `written.ts`, `formatRound` y `formatPart`. Con un patrón escrito dañado (por ejemplo, `part.start` ausente), `startAvailable` y los conteos pueden lanzar `TypeError`: valida antes con `validatePattern`. Aun así, `concreteRounds` y `summarizePart` terminan siempre: omiten vueltas cuyo `number` o `through` no es un entero seguro y nunca despliegan más de `LIMITS.maxRounds` vueltas. `concreteRounds` cuenta cada vuelta escrita a lo más dos veces (T20-M1): las vueltas de un rango que empiezan con la misma lana comparten el mismo `count`, que es de solo lectura. `expandRound` recorre una sola vez un grupo sin puntos (solo cambios de lana, T20-A1); con un grupo que sí tiene puntos, el trabajo lo acota el validador (`LIMITS.maxExpansionWork`): con datos sin validar, mira antes `exceedsExpansionLimits`. `formatPart` escribe el nombre en una sola línea (un salto de línea se vuelve espacio, para que no se lea como otra línea del patrón), escribe el cierre y las notas de vuelta en varias líneas con `>` (desde T6), omite el cierre en blanco y escribe un nombre en blanco como "Parte" (el valor por omisión de `parsePart`).
- **Perfil** (`profile.ts`): `partProfile`, `partDimensions` y `roundHeightFactor` suponen un documento `savable` y no lanzan con él, sin `NaN` ni infinitos (G10); `shapeMetrics` supone una muestra válida (con 0 puntos da `Infinity`).
- `parseRound`, `parsePart` y `parseWrittenParts` devuelven `{ ok: false, issues }` ante texto inválido y **nunca lanzan**, con cualquier valor (RT6). Texto de hasta `PARSE_LIMITS.maxTextLength` (100.000 caracteres; más es `PARSE_TOO_LONG`) y líneas de hasta `PARSE_LIMITS.maxLineLength` (2.000; más es `PARSE_LINE_TOO_LONG`). Las expresiones regulares son lineales: una línea hostil de 2.000 caracteres se lee en menos de 5 ms (en la prueba, el peor caso queda bajo 0,5 ms).

## Leer un documento: siempre migrar y después validar

Todo documento que se lee (de la base, de un archivo, de otra usuaria o de la IA) pasa por `migratePattern` y después por `validatePattern` ([ADR 0003](../../docs/adr/0003-colorwork-en-esquema-v1.md), sección 5 y enmienda E1):

```ts
const m = migratePattern(json); // MigrationResult, discriminado por `ok`
if (!m.ok) return m.issues;     // versión desconocida: error SCHEMA_VERSION
const r = validatePattern(m.document);
```

```ts
type MigrationResult =
  | { ok: true;  document: unknown; from: number;        to: number;        issues: Issue[] } // to === SCHEMA_VERSION; issues vacío
  | { ok: false; document: unknown; from: number | null; to: number | null; issues: Issue[] }; // to === from; un error SCHEMA_VERSION
```

- Con `schemaVersion: 2` (la actual) es la identidad: devuelve el mismo objeto (M2).
- Con `schemaVersion: 1` aplica `STEPS[1]`: devuelve una **copia superficial** con `schemaVersion: 2`, sin mutar la entrada ni transformar nada más (notas, cierres de varias líneas y `loop: "both"` explícito se conservan). Los objetos internos se comparten con la entrada. La v1 no tenía `layout` ni `copies`, y su omisión en la v2 equivale a la v1: una copia por parte y ubicación automática.
- Con una versión desconocida, futura o ausente, devuelve el documento sin tocar, `ok: false`, `to === from` (`null` si no declara una versión numérica) y un error `SCHEMA_VERSION` en español. El validador también lo informa. Se decide por `ok`, nunca por `to`.
- Es idempotente y nunca lanza. El documento migrado se guarda solo cuando la usuaria guarda. `validatePattern` **no migra**: un v1 sin migrar da `SCHEMA_VERSION`.

**Propiedades de la migración** (ADR 0011, sección 5; `test/migrate.test.ts`, criterio CA4-M1):

| # | Propiedad |
|---|---|
| M1 | Un v1 `valid` (o `savable`) migrado es v2 `valid` (o `savable`), con los mismos errores (código y ruta) salvo `SCHEMA_VERSION`. Advertencias e información solo pueden sumar `PART_START_RING_SHORT`, `PART_START_FLAT_RING`, `MAGIC_RING_UNUSUAL` (y, desde T5, `ROUND_GROWS_FAST` y `ROUND_SHRINKS_FAST`); `ROUND_CONSUMPTION_MISMATCH` de la V1 con cadeneta en aro pasa de error a advertencia. Se compara contra el validador v1 congelado (`test/support/validate-v1.ts`) con los fixtures del paquete y documentos v1 al azar. Excepciones deliberadas: los topes de T4-4 y de T20 (un v1 hostil `savable` deja de serlo con un `LIMIT`; ver [Pruebas](#pruebas)) |
| M2 | Idempotente: migrar un v2 devuelve el mismo objeto (`===`) |
| M3 | Los derivados no cambian: `stitchTotal`, `rowStitchCounts` y `yarnUsage` en gráficos; `concreteRounds` y `summarizePart` en escritos. Los pasos de `planChart` se comprueban en `follow` |
| M4 | Nunca lanza, con cualquier entrada |

**Lectores del documento** (todos migran antes de validar; riesgo R4-5 de la hoja de ruta):

- `apps/web/src/lib/designs/prepare.ts` (`prepareDocument`: crear y guardar diseños);
- `apps/web/src/app/disenos/actions.ts` (duplicar) y `apps/web/src/app/disenos/[id]/page.tsx` (abrir un diseño propio);
- `apps/web/src/lib/shared-pattern.ts` (patrones compartidos o públicos);
- `apps/web/src/lib/projects/server.ts` (empezar un proyecto y leer la versión fijada de `pattern_versions`, que puede ser v1 para siempre);
- `apps/web/src/lib/studio/backup-recovery.ts` (respaldo local del estudio);
- `packages/follow`, `packages/pattern-render` y `packages/stitch-render` no leen JSON: reciben documentos ya migrados y validados por la aplicación.

## Gráficos de colorwork: derivados

Convenciones (ADR 0003): `(x, y)` con `y = 0` la primera fila que se teje y `x = 0` la columna izquierda vista por el derecho. La fila 1 siempre es por el derecho. Las coordenadas son del gráfico completo (con repeticiones) salvo que se diga "motivo".

| Función | Qué devuelve |
|---|---|
| `motifCoord(chart, x, y)` | Celda del motivo `(x mod width, y mod height)`. Cualquier entero cae dentro del motivo |
| `rowStitchCount(chart, y)` | Puntos de la fila `y` (celdas distintas de `NO_STITCH`); 0 fuera del gráfico o con `y` no entero |
| `rowStitchCounts(chart)` | Puntos de cada fila; su suma es `stitchTotal` |
| `shaping(chart)` | `RowShaping[]`: por fila, `{ row, stitches, change, perRepeat }`. `change < 0` son disminuciones; en la fila 0 vale 0. `perRepeat = change / repeat.x`, siempre entero (ADR 0005) |
| `rowShapingColumns(chart, y)` | `RowShapingColumns`: `{ row, decreases, increases }`, columnas del **motivo** (ascendentes) donde se pierde un punto (`NO_STITCH` en `y`, punto en `y − 1`) o se gana. La fila anterior se lee en el gráfico completo. Vacías en la fila 0 y fuera del gráfico. Cumple `shaping(chart)[y].change === repeat.x × (increases.length − decreases.length)` (E8). La columna es la del punto que desaparece, no necesariamente donde se teje la disminución |
| `readingDirection(chart, y, { mirror })` | `ReadingDirection`: `"right_to_left"` o `"left_to_right"`. En redondo, todas de derecha a izquierda; en ida y vuelta, `y` par de derecha a izquierda e impar al revés. `mirror` (preferencia `mirror_knitting`) invierte el resultado. Depende solo de `workedIn`, `y` y `mirror` |
| `wornOrientation(chart, x, y)` | Celda del gráfico que se ve en `(x, y)` de la pieza terminada: identidad en `bottom_up`, rotación de 180° en `top_down` (`(W − 1 − x, H − 1 − y)`). Dos veces es la identidad |
| `dimensionsCm(chart, gauge)` | `ChartDimensions`: `{ widthCm, heightCm, widthIsCircumference }`. En tubo, círculo y canesú, `widthIsCircumference` es `true` y la interfaz rotula "circunferencia". En el círculo, el ancho sale del máximo de `rowStitchCount`; en plano y tubo, de `width × repeat.x` aunque haya máscara |
| `rowFloats(chart, y)` | Hebra flotante más larga de cada lana en la fila; en redondo cuenta el tramo que cierra la vuelta. Se calcula sobre el motivo, sin armar la fila completa |
| `yarnUsage(chart, yarnCount)` | `YarnUsage`: `{ stitches, floatStitches }` por lana en el gráfico completo, en anchos de punto (ADR 0008, enmienda T1-1). `stitches` es igual a `yarnTotals` y suma `stitchTotal`. Las flotantes solo suman en filas con 2 o más lanas y para las lanas presentes: en redondo `N − k` (toda la vuelta); en ida y vuelta `(último − primero + 1) − k`, en puntos tejidos (sin `NO_STITCH`) y a lo ancho de todas las repeticiones. Costo `O(celdas del motivo)`: por fila del motivo, con `último = (R − 1) × s + último_motivo` y multiplicado por `repeat.y`. Nunca lanza (gráfico dañado o `yarnCount` inválido dan ceros). No convierte a metros: eso es `estimateYarnLength` de `yarn-catalog` |

**Contrato de bordes** (coordenadas que no son enteras: `NaN`, `±Infinity`, `1,5`):

- `motifCoord` y `wornOrientation` devuelven `{ x: −1, y: −1 }`, fuera del motivo. `motifCell` en esa celda da `NO_STITCH`, igual que `rowStitchCount` da 0.
- `readingDirection` trata ese `y` como una fila por el derecho (`"right_to_left"` sin espejo). Un `y` entero negativo sigue la paridad.
- `wornOrientation` con enteros fuera del gráfico aplica la misma fórmula y sigue siendo involutiva.

`renderAs` nunca cambia los conteos. La interfaz no calcula conteos: usa estas funciones, `stitchTotal` y `dimensionsCm`.

## Gráficos de colorwork: edición

Operaciones puras (ADR 0003, sección 3 y enmiendas E2 a E9). Nunca mutan la entrada ni lanzan excepciones. Si un parámetro no es válido, o la operación no cambia nada, devuelven **el mismo objeto**, así el historial para deshacer puede descartar los no-ops. Cada operación crea a lo más un arreglo `cells` nuevo.

```ts
paintCells(chart, refs: CellRef[], value, yarnCount): Chart          // un trazo completo; pinta el motivo (todas las repeticiones)
fillRegion(chart, start: CellRef, value, yarnCount): Chart           // contigüidad con 4 vecinos dentro del motivo, sin envolver bordes
resizeMotif(chart, width, height, anchor: Anchor, fill, yarnCount): Chart // 1 a LIMITS.maxMotifSide (200) por lado
setRepeat(chart, x, y): Chart                                        // 1 a LIMITS.maxRepeat
addYarn(pattern, yarn): ChartPattern                                 // al final; rechaza lanas con errores de validateYarn o con id repetido
removeYarn(pattern, index, replaceWith): ChartPattern                // replaceWith: índice actual de otra lana (no NO_STITCH)
reorderYarns(pattern, order): ChartPattern                           // order[i] = índice anterior de la lana en la posición i
newChartPattern(input: NewChartInput): ChartPattern                  // palillo, origen manual, todo en la primera lana (fondo)
```

- **`yarnCount` es obligatorio** (E2): la cantidad de lanas del patrón (`pattern.yarns.length`). `value` y `fill` son válidos si son `NO_STITCH` (herramienta "sin punto", distinta del borrador que pinta el fondo) o un entero de `0` a `yarnCount − 1`. Si no, o si `yarnCount` no es un entero de 1 o más, se devuelve el mismo objeto. Así ninguna operación produce `CHART_CELL_VALUE`.
- `ANCHORS` es la lista congelada de anclajes (`bottom_left`, `bottom_center`, `bottom_right`, `center`), en las coordenadas del editor (fila 1 abajo, izquierda vista por el derecho). El centro se trunca hacia cero, así agrandar y achicar en N devuelve el motivo original (E5).
- `EDIT_LIMITS` deriva de `LIMITS` (`maxMotifWidth` y `maxMotifHeight` = `LIMITS.maxMotifSide`, `maxRepeat`, `maxYarns`). Los campos numéricos de la interfaz se limitan con él.
- **La interfaz no usa el resultado de una operación para mostrar errores** (E9): los evita antes con `EDIT_LIMITS`, `ANCHORS` y un selector de lana que solo ofrece índices existentes. El formulario de lana usa `validateYarn` para explicar el problema; el id repetido y el tope de lanas los revisa con `pattern.yarns` y `EDIT_LIMITS.maxYarns`.
- `removeYarn` y `reorderYarns` **comparten los objetos de lana** con la entrada (no los copian): el modelo es inmutable por convención. `addYarn` y `newChartPattern` sí guardan copias.
- **Gráfico sin puntos y autoguardado** (E10, reemplaza a E3): pintar todo el motivo o una fila con `NO_STITCH` es una edición legítima y deja `CHART_EMPTY` o `CHART_ROW_EMPTY_FULL`. Son **errores de tejido**: el documento no es `valid` pero sí `savable`, así que el autoguardado lo envía y el servidor lo guarda como borrador; el panel de validación los muestra y bloquean tejer, publicar, exportar y aceptar una salida de IA. Las operaciones de `edit.ts` nunca producen errores estructurales (propiedad C13). `paintCells`, `fillRegion` y `resizeMotif` (al vaciar o achicar una cuña) y `setRepeat` (por el borde entre repeticiones verticales: una cuña de 80 a 8 vuelve de 8 a 80) pueden producir la advertencia `CHART_SHAPING_IMPOSSIBLE`, que no bloquea nada.
- `newChartPattern` no inventa la muestra: solo la incluye si viene. Con un tamaño fuera de 1 a 200 devuelve el documento sin celdas y el validador informa el motivo real (`CHART_SIZE` o `CHART_MOTIF_TOO_LARGE`). Con `null` u otra entrada que no es un objeto devuelve un documento que el validador rechaza.

## Sintaxis del patrón escrito

```
Parte: Bolita
Inicio: AM
Construcción: espiral
Lana: A
V1: 6 pb en AM (6)
V2: aum x6 (12)
V3: [pb, aum] x6 (18)
V4: [pb 2, aum] x6 (24)
V5-8: 24 pb (24)
V9: @B, [pb 2, dism] x6 (18)
```

- Cantidades: `6 pb`, `pb 6` o `pb x6`.
- Grupos: `[ … ] x6` o `[ … ] 6 veces`, y se pueden anidar.
- Cambio de lana: `@B`.
- Hebra trasera o delantera: `pb ht` / `sc blo`, `pb hd` / `sc flo`.
- Conteo declarado: `(18)` al final de la vuelta.
- También acepta inglés (`R3: [sc, inc] x6 (18)`) y mezclas de ambos.
- `Inicio:` acepta `AM` o `cad N`. Si falta, se lee anillo mágico (también en hileras, donde aparece la información `PART_START_FLAT_RING`). `Inicio: óvalo N` es `PARSE_START` con "Usa AM o cad N" (enmienda C-13, F4-9): no se lee como cadeneta común. La cadeneta de subida, la de giro y el pd de unión no se escriben como puntos: no cuentan (F4-11, F4-12).
- Números de vuelta 0 o negativos (`V0:`) se leen, para que un borrador con `ROUND_NUMBERING` haga la ida y vuelta. Un número de más de 15 cifras es `PARSE_NUMBER` (nunca se redondea).
- Grupos: hasta `LIMITS.maxNesting − 1` (5) uno dentro de otro; la vuelta y sus grupos son `LIMITS.maxNesting` (6) niveles de ítems, igual que en el validador. Uno más es `PARSE_NESTING`.

**Sintaxis de la v2** (T6; ADR 0011, sección 7):

```
Parte: Oreja
Cantidad: 2
Inicio: AM
Construcción: espiral
Lana: A
V1: 6 pb (6)
V2: 6 aum (12)
> Coloca un marcador al inicio de la vuelta.
V3-5: 12 pb (12)
Cierre: no rellenar; aplanar y coser abierta.
> Deja una hebra larga para coser.
```

- **`> texto`** es la nota de la vuelta anterior (`round.note`), o una línea más del cierre si sigue a `Cierre:`. Varias líneas `>` forman una nota de varias líneas; `>` sola es una línea vacía; se quita un espacio después de `>` y se conservan los demás. Una `>` antes de toda vuelta es `PARSE_NOTE`. Dos `Cierre:` se juntan, línea por línea.
- **`# texto`** es un comentario que no se guarda: la lectura sigue y deja el aviso `PARSE_COMMENT` (severidad `warning`, en `warnings`, también si la lectura falla) con el texto `COMMENT_WARNING`: "Los comentarios con # no se guardan; usa > para una nota." (CA4-E5).
- **`Cantidad: N`** (`copies`, enmienda C-14): `formatPart` lo escribe solo si `N > 1` (en inglés, `Make: N`). Se lee también `Hacer`, `Piezas`, `Tejer` y `Make`, con o sin dos puntos y sin distinguir mayúsculas ("Hacer 2", "Piezas: 2"). Fuera de 1 a `LIMITS.maxCopies` (50) es `PARSE_COPIES`. El término queda "validar con tejedora".
- **Forma canónica** (lo que escribe `formatPart`): Parte, Cantidad, Inicio, Construcción, Lana, cada vuelta con sus notas y el cierre. "pb x6" pasa a "6 pb"; no se fusionan puntos seguidos ni se reordena nada.
- **`normalizePart(part)`** deja la parte como la dejan `parsePart` y toda operación: sin `loop: "both"`, sin `through` igual a `number`, sin `copies: 1`, nombre y cierre recortados, `\r\n` → `\n` y sin espacios al final de cada línea en notas y cierres, y sin notas ni cierres vacíos (o solo con espacios).
- **`formatPartLines(part, dialect)`** devuelve `{ text, roundLine }`: `roundLine[j]` es la línea (desde 1) de `part.rounds[j]`, para mostrar ahí los errores del validador. `formatPart` es su `text`.
- **`parseWrittenParts(text, { partId, mode? })`** lee un patrón pegado con varias partes: corta en cada `Parte:` (o `Part:`) y da a la parte `i` el id `partId(i)`. Lo que va antes de la primera `Parte:` es otra parte si tiene algo además de comentarios. Los mensajes llevan la línea del texto completo. Hasta `LIMITS.maxParts` partes (`PARSE_TOO_MANY_PARTS`).
- **Precondición de RT1**: la ida y vuelta vale para partes cuyas líneas escritas caben en `PARSE_LIMITS` (una vuelta de unos 500 ítems separados por coma ya no cabe en 2.000 caracteres; "500 pb" sí).

**Dialectos y modos de lectura** (ADR 0011, sección 8; enmiendas C-15 y C-16). Se **escribe** en un `Dialect` (`"es"`, `"us"` o `"uk"`) y se **lee** en un `ReadingMode` (`"es-us"`, por omisión, o `"es-uk"`). El español se lee en los dos modos; el inglés, en US o en UK según el modo. Nunca se adivina: "dc" es punto alto en `es-us` y punto bajo en `es-uk` (F4-63).

| Código | `es` | `us` (escribe) | `uk` (escribe) | Se lee en `es-us` | Se lee en `es-uk` |
|---|---|---|---|---|---|
| `sc` | pb | sc | dc | pb, sc, single crochet | pb, dc |
| `hdc` | mpa | hdc | htr | mpa, hdc | mpa, htr |
| `dc` | pa | dc | tr | pa, dc | pa, tr |
| `tr` | pad | tr | dtr | pad, tr | pad, dtr |
| `slst` | pd | sl st | ss | pd, sl st, slst | pd, ss |
| `ch` | cad | ch | ch | cad, cadeneta, ch | cad, cadeneta, ch |
| `inc` | aum | inc | inc | aum, inc | aum, inc |
| `inc3` | aum3 | inc3 | inc3 | aum3, inc3 | aum3, inc3 |
| `dec` | dism | dec | dec | dism, dec, invdec, sc2tog | dism, dec, dc2tog |
| `sk` | saltar | sk | miss | saltar, sk, skip | saltar, miss |
| hebra trasera | ht | blo | blo | ht, hebra trasera, blo | ht, hebra trasera, blo |
| hebra delantera | hd | flo | flo | hd, hebra delantera, flo | hd, hebra delantera, flo |
| anillo mágico (`Inicio:`) | AM | MR | MR | AM, anillo mágico, MR, magic ring | igual |

- **Pista del otro dialecto** (F4-64, F4-66): `sc`, `single crochet`, `hdc` y `sc2tog` en `es-uk`, y `htr` y `dtr` en `es-us`, dan `PARSE_UNKNOWN_STITCH` con una pista en el mensaje ("sc es US; en UK el punto bajo se llama dc.") y en `data.hint` y `data.mode`. Los demás términos del otro modo (`ss`, `miss`, `dc2tog` en `es-us`) son desconocidos sin pista.
- **RT5**: en cada modo, ningún alias corresponde a dos puntos. Solo `dc` y `tr` están en los dos modos con significado distinto, porque cada modo los carga de su propia tabla.
- **Sin variantes regionales del español** hasta que T1b las respalde (F4-69): "medio punto", "pma", "punto raso" (y su abreviatura "pr", que se leía hasta T6), "punto pasado" y "punto bajísimo" no se leen.
- **De la preferencia del perfil al modo de lectura**: `profiles.pattern_dialect` guarda un `Dialect` (`'es'`, `'us'` o `'uk'`). La interfaz escribe con `formatPart(part, dialect)` y lee lo que la usuaria escribe con `parsePart(text, { id, mode: readingModeFor(dialect) })`: `uk` → `"es-uk"`; `es` y `us` → `"es-us"`. Así lo que se escribe en un dialecto se lee igual (RT1). El modo `es-uk` solo se usa si la usuaria eligió UK (CA4-G2).

**Ida y vuelta** (propiedades con semilla en `test/property-texto.test.ts`; CA4-M5, parte RT):

| # | Propiedad |
|---|---|
| RT1 | Para toda parte normalizada de un documento `savable` y todo dialecto `d`: `parsePart(formatPart(p, d), { id: p.id, mode: readingModeFor(d) })` es `p` (`deepEqual`), con notas, cierres de varias líneas, cantidad, rangos y grupos hasta `LIMITS.maxNesting` |
| RT2 | Si un texto se lee, escribirlo y volver a leerlo da la misma parte, y la forma canónica es un punto fijo |
| RT3 | Toda secuencia de operaciones de bloques (`wrapInGroup`, `unwrapGroup`, `insertItem`, `updateItem`, `removeItem`, `moveItem` entre niveles, `insertRound`, `replaceRound`, `removeRound`) deja un documento `savable` que cumple RT1. Llega a la profundidad completa de `LIMITS.maxNesting` y comprueba que agrupar más allá se rechaza |
| RT4 | `countRound` de cada vuelta y de su ida y vuelta dan lo mismo |
| RT5 | En todo modo, ningún alias corresponde a dos puntos |
| RT6 | `parsePart`, `parseRound` y `parseWrittenParts` nunca lanzan, con cualquier texto de hasta `PARSE_LIMITS.maxTextLength` (y con valores que no son texto) |

## Patrón escrito: edición

Operaciones puras de `edit-written.ts` (ADR 0011, sección 6), con la misma convención de `edit.ts`: nunca mutan la entrada ni lanzan, devuelven **el mismo objeto** si un parámetro no es válido, una ruta no existe o nada cambia, y dejan las partes normalizadas (`normalizePart`).

- **Topes duros sí, recomendados nunca**: una operación que dejaría un error estructural que la entrada no tenía (pasar de `LIMITS.maxNesting`, `maxItemCount`, `maxGroupTimes`, `maxRoundStitches`, `maxRounds`, `maxParts`, `maxCopies`, `maxPlacements`, `maxNotes`; un grupo o una vuelta vacíos; una lana inexistente; un ciclo de anclas) devuelve la entrada. Por eso, si la entrada era `savable`, la salida también. Los errores de tejido (conteos, numeración) se permiten: son borradores. Los límites recomendados (`RECOMMENDED_WRITTEN_LIMITS`) no se miran: superarlos lo decide la usuaria en la interfaz.
- **Cómo se revisa**: las operaciones de una parte validan solo esa parte (un documento con ella sola); las de documento (`addPart`, `setCopies`, `removePart`, `setPlacement`, `setAssembly`), el documento completo. El costo es el de `validatePattern` de lo que se revisa.
- **Profundidad completa** (decisión 2): `ItemPath = readonly number[]`, de la vuelta hacia adentro (`[i]` es `round.items[i]`; `[i, j]`, el ítem `j` del grupo `i`), hasta `LIMITS.maxNesting` índices. El tope de 2 niveles del editor de bloques v1 vive solo en la interfaz (`BlockEditPolicy`); en `pattern-core` no hay ninguno.

```ts
newWrittenPattern({ id, title, yarns, gauge?, parts?, partId?, partName? }): WrittenPattern // crochet, origen manual; sin `parts`, una V1 de 6 pb en AM
addPart(p, part, index?) · renamePart(p, partId, name) · movePart(p, partId, toIndex)
setPartConstruction(p, partId, c) · setPartStart(p, partId, start) · setPartStartYarn(p, partId, yarnId) · setPartFinish(p, partId, finish | undefined)
setCopies(p, partId, n): UnplaceResult    // 1 a LIMITS.maxCopies; quita las ubicaciones de las copias que dejan de existir y las anclas a ellas
removePart(p, partId): UnplaceResult      // quita la parte, sus ubicaciones y las anclas que dependían de ella; nunca la única parte
replacePartRounds(p, partId, rounds)      // editor de texto: conserva los números escritos
insertRound(p, partId, index, round) · removeRound(p, partId, index) · replaceRound(p, partId, index, round) // renumeran las siguientes y conservan los rangos
insertItem(p, partId, roundIndex, path, item) · updateItem(…, path, item) · removeItem(…, path)
moveItem(p, partId, roundIndex, from, to) // `to` es la ruta del ítem después de moverlo; entre hermanos, grupos y niveles
wrapInGroup(p, partId, roundIndex, from, to, times) // hermanos de `from` a `to` (misma lista) en un grupo
unwrapGroup(p, partId, roundIndex, path)  // los ítems quedan repetidos `times` veces: la vuelta teje lo mismo
setPlacement(p, placement) · clearPlacement(p, ref) · setAssembly(p, steps)
interface UnplaceResult { pattern: WrittenPattern; unplaced: PartRef[] } // piezas que quedaron sin ubicar (CA4-E8, F4-62)
```

- `insertRound` y `replaceRound` ignoran el `number` recibido: la vuelta toma su lugar en la numeración y conserva su rango (`through − number`). `removeRound` no quita la única vuelta; `removeItem` y `moveItem` no dejan un grupo vacío.
- "Subir" y "bajar" son `moveItem` con el último índice de `to` en −1 o +1. Arrastrar y soltar usará la misma operación.
- Sin ubicaciones, `layout` se omite (`setCopies`, `removePart`, `clearPlacement`); sin pasos, `assembly` también.
- `addYarn`, `removeYarn` y `reorderYarns` de `edit.ts` valen para patrones escritos: quitar una lana reemplaza sus `@id` y los `startYarn` que la usan por la lana de reemplazo (`replaceYarnRefs`).

## Qué valida

`validatePattern(input, opts?)` acepta cualquier JSON (por ejemplo, propuesto por la IA) y devuelve `{ valid, savable, issues }`. Cada `Issue` trae `code`, `severity` (`error`, `warning` o `info`), `path`, `message` en español y `data` (con `row`, base 0, cuando corresponde). Los mensajes nunca interpolan un valor de tipo incorrecto (no muestran "undefined", "NaN" ni "[object Object]"): primero se revisa el tipo y, si falla, no se emite el aviso que dependía de él.

**Dos clases de error** (ADR 0003, E10; ADR 0006, E10):

- **Error de tejido**: el documento es sano y todas las vistas derivadas funcionan, pero no se puede tejer tal cual. Son los códigos de `DRAFT_ERROR_CODES`: en gráficos, `CHART_EMPTY` y `CHART_ROW_EMPTY_FULL`; en patrones escritos (ADR 0011, sección 4), `ROUND_CONSUMPTION_MISMATCH`, `ROUND_COUNT_MISMATCH`, `ROUND_ZERO`, `ROUND_RANGE_CHANGES` y `ROUND_NUMBERING`. `isDraftError(issue)` los reconoce. Un patrón escrito con una vuelta a medio escribir que no cuadra se guarda como borrador (`savable: true`, `valid: false`) y se ve en 3D.
- **Error estructural**: cualquier otro error. El documento no es interpretable o rompe un invariante del que dependen los derivados. La lista es cerrada: un código de error nuevo es estructural hasta que alguien lo agregue a `DRAFT_ERROR_CODES` a propósito.
- `valid` es `true` si no hay ningún error; `savable`, si todos los errores son de tejido. `valid` implica `savable`.
- Qué exige cada flujo: **guardar** (autoguardado, crear, duplicar), `savable`; **tejer, publicar o compartir, exportar y aceptar una salida de IA**, `valid`. `parsePattern` sigue exigiendo `valid`.

- **Errores estructurales**:
  - `number` o `through` sobre `LIMITS.maxRounds`, `number` bajo `−LIMITS.maxRounds` (además de `ROUND_NUMBERING`), o rangos que juntos superan ese tope (`LIMIT`); una vuelta que deja o que trabaja más de `LIMITS.maxRoundStitches` puntos (`LIMIT`, revisado en la estructura de cada vuelta: ningún error de tejido lo salta, y acota `expandRound`);
  - topes de T20 (enmienda T20-x del ADR 0011), todos `LIMIT` estructural con `data.limit`, calculados de forma aritmética al revisar los ítems (sin repetir grupos ni rangos):
    - `maxRoundWork`: el **trabajo de expansión** de una vuelta (Σ sobre sus nodos del producto de los `times` que los envuelven: lo que recorre `expandRound`) pasa `LIMITS.maxRoundStitches`. Cierra la bomba de grupos que solo cambian de lana (T20-A1);
    - `maxExpansionWork`: el trabajo de todo el documento (Σ sobre las vueltas concretas de todas las partes que no pasan su propio tope; las copias no suman) pasa `LIMITS.maxExpansionWork` (2.000.000). Ruta `parts`;
    - `maxRoundStitches`: `expected` (ruta `….expected`) o la cadeneta inicial (`….start.count`) sobre `LIMITS.maxRoundStitches`: nunca cuadrarían (hueco 1; una cadeneta de `1e300` ya no es `valid`);
    - `maxRoundItems`: más de `LIMITS.maxRoundItems` (100) nodos en una vuelta, contando puntos, cambios de lana y grupos en todos los niveles (hueco 2). Con 100, la peor vuelta cabe en una línea del lector en los tres dialectos (1.769 caracteres en `es`);
    - `maxTextLength`: el texto canónico de la parte, en el dialecto más largo (`formattedPartLength`), pasa `PARSE_LIMITS.maxTextLength`. Ruta `parts[i]`. Así toda parte `savable` se puede abrir en el editor de texto (hueco 2);
  - **tope de 20 por código y por parte** en los errores estructurales de los ítems y de cada vuelta (`SHAPE`, `STITCH_UNKNOWN`, `ITEM_COUNT`, `STITCH_LOOP`, `GROUP_TIMES`, `GROUP_EMPTY`, `COLOR_UNKNOWN_YARN` y los `LIMIT` de la vuelta; T20-B5). El último que se guarda de un código lleva `data.omitted` con cuántos se omitieron. `savable` no cambia: de cada código queda al menos uno;
  - `PART_COPIES`: `copies` debe ser un entero de 1 a `LIMITS.maxCopies` (50);
  - `layout` (ADR 0011, sección 3): `LAYOUT_TARGET_UNKNOWN` y `LAYOUT_HOST_UNKNOWN` (la parte no existe), `LAYOUT_COPY_RANGE` (`copy` fuera de 0 a `copies − 1`), `LAYOUT_DUPLICATE` (dos entradas para la misma copia), `LAYOUT_CYCLE` (una pieza cosida a sí misma o un ciclo de anclas; se informa una vez por ciclo), `LAYOUT_DEPTH` (cadena de más de `LIMITS.maxLayoutDepth` anclas, 16; se informa donde se pasa el tope), `LIMIT` (más de `LIMITS.maxPlacements` ubicaciones, 2.500; posiciones fuera de ±`LIMITS.maxPositionCm`, 1.000 cm; giros fuera de −180 a 180; separación fuera de ±`LIMITS.maxOffsetCm`, 100 cm; `round` fuera de 1 a `maxRounds`; `stitch` fuera de 0 a `maxRoundStitches − 1`; `copy` no entero; números no finitos) y `SHAPE` (forma). Ciclo y profundidad se revisan en tiempo lineal y sin recursión. Cada código de `layout` se informa hasta 20 veces por documento, también el `LIMIT` y el `TEXT_CONTROL_CHAR` de los identificadores `target.part` y `host.part` (hueco 3 de T20);
  - lanas inexistentes; composición que no suma 100 %; grosor fuera de 0–7; colores mal escritos; `paletteId` que no es texto (`SHAPE`, con o sin `paletteIds`);
  - puntos desconocidos (`STITCH_UNKNOWN`; los nombres heredados de `Object.prototype`, como `toString`, también lo son);
  - `TITLE_LENGTH`: título de 1 a 120 caracteres (puntos de código, como `char_length` de la columna `patterns.title`);
  - textos libres (F5): `parts[i].name`, `parts[i].finish`, `rounds[j].note`, `yarns[i].note`, `origin.model` y `origin.promptVersion` deben ser texto, y `notes` y `assembly`, listas de textos (`SHAPE` con la ruta exacta, con cualquier origen). Los topes de largo, en puntos de código, están en `limits.ts` (`maxPartNameLength` 80, `maxRoundNoteLength`, `maxFinishLength` y `maxYarnNoteLength` 500, `maxNoteLength` 2000 por nota o paso, `maxNotes` 50 elementos por lista, `maxOriginFieldLength` 100, `maxIdLength` 64 para `id`, `parts[i].id`, `fiber` y `paletteId`); excederlos es `LIMIT`. La nota de la lana es privada: nunca se cita en un mensaje;
  - `PART_NAME`: el nombre de una parte no puede estar en blanco ni tener saltos de línea. Mientras el nombre no sea válido, los mensajes llaman a la parte "Parte N" (su posición);
  - `UNKNOWN_KEY` (**documento cerrado**, ADR 0003, E16): cada objeto del esquema v1 admite solo sus claves, incluidas las opcionales; cualquier otra es error estructural, con la ruta de la clave (`yarns[0].brand`) y la clave en `data.key`. La clave se recorta a 40 caracteres y se limpia de caracteres de control en la ruta y en el mensaje. Se informan hasta 20 por documento. Claves permitidas:
    - raíz: `schemaVersion`, `id`, `title`, `technique`, `yarns`, `gauge`, `origin`, `notes`, `kind` y, según `kind`, `chart` (gráfico) o `parts` y `assembly` (escrito); con un `kind` desconocido (ya es `KIND`) se aceptan las tres;
    - `chart`: `width`, `height`, `cells`, `repeat`, `workedIn`, `renderAs`, `direction`; `chart.repeat`: `x`, `y`; `gauge`: `stitchesPer10cm`, `rowsPer10cm`; `origin`: `kind`, `model`, `promptVersion`;
    - `yarns[i]`: `id`, `weight`, `composition`, `color`, `note`; `color`: `hex`, `paletteId`; `composition[k]`: `fiber`, `percent`;
    - raíz de un escrito, desde la v2: también `layout`;
    - `parts[i]`: `id`, `name`, `construction`, `start`, `startYarn`, `rounds`, `finish`, `copies` (v2); `start`: `type` (anillo mágico) o `type` y `count` (cadeneta); `rounds[j]`: `number`, `through`, `items`, `expected`, `note`. **`stuffing` no existe en la v2** (enmienda C-13): da `UNKNOWN_KEY`;
    - `layout`: `placements`; `placements[k]`: `target`, `at`; `target` y `at.host`: `part`, `copy`; `at` libre: `type`, `positionCm`, `rotationDeg`; `at` en la superficie: `type`, `host`, `round`, `stitch`, `attach`, `rotationDeg`, `offsetCm`;
    - ítems: punto `type`, `stitch`, `count`, `loop`; grupo `type`, `items`, `times`; color `type`, `yarn` (un ítem de tipo desconocido ya es `SHAPE`).

    `validateYarn` también la aplica, así que `addYarn` no agrega una lana con claves de más;
  - `TEXT_CONTROL_CHAR` (ADR 0003, E16): ningún texto admite caracteres de control `\p{Cc}` (U+0000 a U+001F y U+007F a U+009F; Postgres rechaza U+0000 en jsonb) ni sustitutos UTF-16 sueltos (también los rechaza jsonb; `data.surrogate: true`). Se admiten el salto de línea (`\n`) y la tabulación (`\t`) solo en los textos de varias líneas: `notes[i]`, `assembly[i]`, `parts[i].finish`, `rounds[j].note` y `yarns[i].note`. En el título, los identificadores, los nombres de parte, `fiber`, `paletteId` y `origin`, ninguno (tampoco `\r`: la interfaz normaliza `\r\n` a `\n`). `data.codePoint` dice cuál es ("U+0000") y `data.index` dónde está. Los mensajes que citan un texto de la usuaria reemplazan esos caracteres por "�";
  - `CHART_CELL_VALUE`, `CHART_SIZE`, `CHART_MOTIF_TOO_LARGE` (motivo de más de 200 × 200 casillas; el mensaje dice cuánto mide) y entradas desmedidas (`LIMIT`).
- **Errores de tejido (no impiden guardar el borrador)**:
  - `ROUND_COUNT_MISMATCH`: conteo declarado distinto del real;
  - `ROUND_CONSUMPTION_MISMATCH`: una vuelta trabaja sobre más o menos puntos de los que dejó la anterior (en espiral y vueltas cerradas, desde la V2);
  - `ROUND_ZERO`: una vuelta que no es la última no deja puntos;
  - `ROUND_RANGE_CHANGES`: un rango ("V5–8") que no mantiene el conteo; el mensaje sugiere escribir cada vuelta por separado (F4-84);
  - `ROUND_NUMBERING`: numeración que no empieza en 1 o salta. Con un número entre −1.000 y 0 la vuelta se sigue revisando y contando;
  - **pistas** (ADR 0011, sección 4; C-10): en vueltas cerradas e hileras, si `ROUND_CONSUMPTION_MISMATCH` o `ROUND_COUNT_MISMATCH` difieren en 1 o 2 puntos, el mensaje agrega "¿Escribiste la cadeneta de subida o el pd de unión como puntos? No cuentan." Cada pista va también en `data.hints` (`"ring"`, `"join"`, `"turning_chain"`) para que la interfaz la muestre aparte;
  - `CHART_EMPTY`: el gráfico no tiene ningún punto;
  - `CHART_ROW_EMPTY_FULL`: vueltas del gráfico completo sin puntos. Una sola, con las filas del gráfico completo en `data.rows` (hasta 50) y las del motivo en `data.motifRows`, para resaltarlas. Es el único aviso por esa causa: desde T2d ya no se emite `CHART_EMPTY_ROW`.
- **Advertencias**:
  - `CHART_SHAPING_IMPOSSIBLE` (todas las formas): en una vuelta quedan menos de `ceil(anterior / 3)` puntos, así que **no se alcanza solo disminuyendo** de a 2 o 3 juntos. El mensaje nombra las alternativas: cerrar puntos, dejarlos en espera, tejer 4 o más juntos o pasar la hebra por todos. El código conserva su nombre por compatibilidad;
  - `CHART_SHAPING_TOO_FAST` (todas las formas): disminución que deja menos de `ceil(anterior / 2)` (exige disminuir de a 3 juntos o más y la tela se frunce), o aumento a más de `anterior × 2`. Una transición dispara una sola de `IMPOSSIBLE` y `TOO_FAST`;
  - `CHART_FLOAT_LONG`: hebra flotante de más de `max(1, min(floor(2,5 × puntos en 10 cm / 10), tope))` puntos, con tope 5 por defecto. La muestra sale del documento; si no tiene, de `opts.assumedGauge`; si no, de `opts.weightCat` (tabla supuesta del ADR 0003: 5, 5, 5, 5, 4, 3, 2 y 1 puntos por categoría 0 a 7). Sin ninguna, el máximo es el tope y no se informan cm. El mensaje nombra la lana por su letra (`yarnLetter`: "la lana B (#BA222C)"; desde la 27, "la lana AA"), nunca por el id interno ni por la nota privada, y dice "enganchar la hebra";
  - en el círculo: `CHART_SHAPING_STEEP` (más de 2 puntos por repetición en una vuelta), `CHART_SHAPING_UNEXPECTED` (aumentos en `bottom_up` o disminuciones en `top_down`), `CHART_CIRCLE_REPEAT_Y` (`repeat.y > 1` con máscara: cada repetición vuelve a abrir la forma) y `CHART_CIRCLE_NOT_CLOSED` sobre 24 puntos en la última vuelta con puntos ("lo habitual es cerrar con 8 a 16 puntos pasando la hebra por todos");
  - `CHART_ROWS_SHAPE` (tubo o círculo de ida y vuelta: "la pieza queda abierta y hay que coserla");
  - `ROUND_CONSUMPTION_MISMATCH` en hileras (con la pista "Revisa si la cadeneta para girar cuenta como punto") y en la **primera vuelta sobre una cadeneta en aro** (espiral o cerradas; C-9), con la pista "Si trabajas dentro del aro, la cantidad de la primera vuelta es libre";
  - `PART_START_RING_SHORT`: cadeneta en aro de 1 (espiral o cerradas): "necesita al menos 2". Advertencia y no error, para no romper M1;
  - `LAYOUT_ANCHOR_RANGE`: la vuelta o el punto del ancla ya no existen en el anfitrión (por ejemplo, después de borrar vueltas). El 3D acota y lo dice; editar el anfitrión nunca impide guardar;
  - patrones de IA sin el modelo registrado.
- **Información de forma** (ADR 0010, sección 2; enmiendas C-4 y C-6), en espiral y vueltas cerradas: `ROUND_GROWS_FAST` ("esta vuelta aumenta más de lo que la tela puede abrir en plano (+N puntos; una vuelta de pb queda plana con unos 6)…"; sin la cifra si la vuelta no es de punto bajo) y `ROUND_SHRINKS_FAST` ("esta vuelta disminuye más de lo que la pieza puede cerrarse en curva (−N puntos)…"). Salen cuando el perfil acota el radio (`|Δr/s| > PROFILE_RADIAL_TOLERANCE`) **y** la vuelta cambia el conteo en ese sentido; una vez por vuelta escrita; nunca en la V1 sobre anillo mágico. `data`: `round`, `change` (±N), `ratio` (`Δr/s`, 3 decimales) y `tolerance`. La muestra sale del documento (leída en punto bajo), de `assumedGauge` (con `assumedGaugeStitch`) o de `weightCat` (copia de `suggestedGauge(cat, "crochet")`, con la categoría 0 en punto alto); sin ninguna, no hay avisos de forma.
- **Información** de patrones escritos: `PART_START_FLAT_RING` (hileras con anillo mágico: "las filas suelen empezar con una cadeneta base"; C-19) y `MAGIC_RING_UNUSUAL` (primera vuelta sobre anillo mágico, en espiral o cerradas, con 1 o 2 puntos o más de 12; umbral provisional, C-20). Ninguno de los avisos nuevos cambia qué es `valid` ni `savable`.
- **Información**: `CHART_COLORS_PER_ROW` (más de 2 lanas en una fila), `YARNS_MIXED_WEIGHT` (grosores distintos en un gráfico), `CHART_RENDER_UNSUPPORTED` (`yoke`, que se dibuja como tubo), en el círculo `CHART_CIRCLE_REPEATS` (fuera de 4 a 12), `CHART_WEDGE_TOO_NARROW` (cuña de menos de 4 puntos), `CHART_CIRCLE_NOT_CLOSED` sobre 16 y `CHART_CIRCLE_START` (`top_down` con menos de 4 o más de 16 puntos en la primera vuelta con puntos; el texto depende de la técnica: anillo mágico de 6 a 12 en crochet, montaje inicial de 8 a 12 en palillo); vueltas sin conteo declarado y lanas que no se usan.
- Las reglas de forma comparan vueltas seguidas del gráfico completo (incluido el borde entre repeticiones verticales) y no se miden contra una vuelta sin puntos (que ya es error de tejido). `CHART_CIRCLE_NOT_CLOSED` y `CHART_CIRCLE_START` miden la última o la primera vuelta **con puntos**: una fila vacía en el borde no las silencia.
- Los mensajes dicen "vuelta" en redondo y "fila" de ida y vuelta, "casilla" (también para ubicar una columna) y "hebras flotantes" (glosario pendiente del roadmap).

`ValidateOptions`: `fibers` y `paletteIds` (avisos de fibras o colores desconocidos), `assumedGauge` y `weightCat` (muestra supuesta; nunca se escribe en el documento), `assumedGaugeStitch` (punto con que se midió `assumedGauge` en un patrón escrito: `"sc"` por omisión, `"dc"` si `suggestedGauge` dice `"crochet-pa"`), `maxFloatCm` (2,5 por defecto) y `maxFloatStitches`: tope entero ≥ 1 que se aplica siempre, con o sin muestra; cualquier otro valor (0, −1, 4,5, `NaN`) usa el 5 por defecto. **Invariante**: ninguna opción cambia el conjunto de errores; solo agrega o ajusta advertencias e información, así el cliente y el servidor llegan al mismo `valid` y `savable` (propiedad C15).

`validateYarn(input, path = "yarn", opts?: Pick<ValidateOptions, "fibers" | "paletteIds">)` revisa una lana suelta con las mismas reglas y prefija las rutas con `path`. Las opciones solo agregan advertencias (fibra o color desconocidos); `addYarn` la llama sin opciones. No revisa el id repetido ni el tope de lanas.

## Límites recomendados (patrón escrito)

Valores de la decisión 5, confirmados por T1 (C-18). No son reglas del tejido: dentro de ellos la vista previa responde a tiempo. **No pasan por `validatePattern`**: un patrón que los supera sigue siendo `valid`, y la usuaria decide si sigue (ADR 0011, sección 3b).

```ts
RECOMMENDED_WRITTEN_LIMITS = { parts: 20, copiesPerPart: 10, roundsPerPart: 100, stitchesPerRound: 200, sceneStitches: 40_000 }
recommendedLimitUsage(pattern): LimitUsage[]   // los cinco, en ese orden
recommendedLimitNotices(pattern): LimitUsage[] // solo los superados (value > recommended)
interface LimitUsage { limit; value; recommended; over: Array<{ partId: string; round?: number }> }
```

- `value`: en `parts`, la cantidad de partes (las copias no cuentan); en `copiesPerPart`, `roundsPerPart` y `stitchesPerRound`, el máximo encontrado; en `sceneStitches`, Σ (Σ `produced` de la parte, con la V1) × `copies`.
- `over`: dónde se supera, vacío si no se supera. Partes de la 21 en adelante; partes con más copias o vueltas; cada vuelta concreta de más de 200 puntos (con su número); y, en la escena, las partes que aportan puntos.
- Los conteos salen de `countRound` con las reglas de `concreteRounds`. Tiempo lineal en las vueltas: un rango se cuenta una vez. Nunca lanzan.
- Los topes duros (errores) siguen en `LIMITS`, bastante más arriba (por ejemplo, 50 copias frente a 10 recomendadas).

## Perfil de las partes (patrón escrito)

Derivado puro del modelo (ADR 0010, secciones 1 y 2, enmiendas C-2 a C-8 y C-12). Lee los conteos de `concreteRounds` y nunca los recalcula. Funciona con todo documento `savable`, también con vueltas que no cuadran (usa siempre el conteo producido).

```ts
shapeMetrics(gauge, { assumed, gaugeStitch }): ShapeMetrics // { stitchWidthCm, roundHeightCm, gaugeStitch, assumed }
partProfile(part, metrics): PartProfile                      // RevolutionProfile (spiral, joined) o PanelProfile (flat)
partDimensions(profile): { heightCm; widthCm }               // siempre una estimación
roundHeightFactor(round): number                             // promedio de STITCH_HEIGHT_FACTOR de la vuelta
```

- **Métricas** (C-3): `stitchWidthCm = 10 / stitchesPer10cm`; `roundHeightCm = (10 / rowsPer10cm) / STITCH_HEIGHT_FACTOR[gaugeStitch]`, el alto de una vuelta de punto bajo. `gaugeStitch` es obligatorio: la muestra del documento se lee como `"sc"`; la supuesta de `suggestedGauge` traduce `"crochet-pa"` → `"dc"` (si no, la categoría 0 sale el doble de alta, F4-43). Supone una muestra válida.
- **Alto de cada punto** (C-5): `STITCH_HEIGHT_FACTOR` = `sc` 1, `hdc` 1,5, `dc` 2, `tr` 2,5, `inc`/`inc3`/`dec` 1 (de punto bajo, C-12). `slst`, `ch` y `sk` no tienen valor (`Partial<Record<StitchCode, number>>`). El alto de una vuelta es el promedio de los factores de sus puntos producidos con valor, ponderado por lo que produce cada uno, por `roundHeightCm`; si solo produce `slst` o `ch`, 1.
- **Revolución**: el anillo 0 es el inicio (radio 0 con anillo mágico; aro de `count × ancho / 2π` con cadeneta). Para cada vuelta, `r* = n × ancho / 2π`, `Δr = r* − r(anterior)` y `s` el alto de la vuelta (C-4):
  - `|Δr| ≤ s`: radio `r*`, sube `√(s² − Δr²)`, `strain` 1;
  - `s < |Δr| ≤ s × PROFILE_RADIAL_TOLERANCE` (1,25): radio `r*`, no sube, `strain` 1 (holgura del disco de 6 aumentos de pb, que queda plano);
  - por encima: radio acotado a `r(anterior) ± s × 1,25` (nunca bajo 0), no sube, `strain = r* / r` (> 1 ondula, < 1 frunce). El borde exacto se compara con un margen relativo de 1e−9 para que el redondeo no acote una vuelta que cae justo en él.
  - La V1 sobre anillo mágico no se acota ni se evalúa: radio `r*₁`, sube `√max(s² − r*₁², 0)` (C-6). Sobre cadeneta en aro, la V1 se evalúa como las demás.
- **Panel** (hileras): una fila por hilera, de ancho `n × ancho`, con `yCm` el alto acumulado al terminar la fila.
- `PROFILE_RADIAL_TOLERANCE`, `STITCH_HEIGHT_FACTOR` y la lectura de la muestra del documento en punto bajo son "validar con tejedora" (T1b). Con la muestra de los casos (20 × 24, `ρ` = 1,2): el fixture A da un tambor de 9,55 cm de diámetro y 8,33 cm de alto; el fixture B, una esfera de 9,55 cm por 10,13 cm (razón 1,06).

## Pruebas

```
node --test "test/**/*.test.ts"
```

Requiere Node 24 LTS (mínimo 22.18, que ejecuta TypeScript directamente). Incluye pruebas de propiedades con semilla: si una falla, el mensaje indica `SEED=…` para reproducirla. Desde la raíz: `pnpm --filter @loopitalab/pattern-core test`.

- `test/derived.test.ts`: derivados y casos de dominio 1 a 7, el caso 8 positivo, 20 (medidas sin máscara) y 24 de [casos-dominio-colorwork.md](../../docs/casos-dominio-colorwork.md).
- `test/validate-colorwork.test.ts`: validaciones de T2b (casos 8 a 18 y 21 a 23, `TITLE_LENGTH`, `CHART_MOTIF_TOO_LARGE`…), los cambios C1 a C11 del ADR 0003 (`savable`, `DRAFT_ERROR_CODES`, `isDraftError`, `CHART_SHAPING_IMPOSSIBLE` como advertencia, `CHART_ROW_EMPTY_FULL` como error de tejido, `validateYarn` con `opts`), los textos de T2d, `rowShapingColumns` (propiedad E8), `yarnCount` (propiedad: nunca `CHART_CELL_VALUE`), el caso 20 completo y los contratos de bordes O4 a O6.
- `test/edit.test.ts` y `test/migrate.test.ts`: operaciones de edición y migraciones.
- `test/edges-colorwork.test.ts`: bordes de derivados, edición y migración (motivo 1 × 1, 200 × 200 con repeticiones máximas, máscara completa, índices fuera de rango, NaN, Infinity y no enteros, documentos congelados).
- `test/property-colorwork.test.ts`: propiedades de derivados, edición y migración; C13 (desde un documento `valid`, toda secuencia de `paintCells`, `fillRegion`, `resizeMotif`, `setRepeat`, `addYarn`, `removeYarn` y `reorderYarns` deja uno `savable`), C14 (los derivados no lanzan con documentos `savable`, incluidos `CHART_EMPTY`, filas vacías e `IMPOSSIBLE`; `rowStitchCounts` suma `stitchTotal` y `shaping` es consistente) y C15 (las opciones no cambian los errores), y la guardia de rendimiento (300 × 300 en menos de 200 ms).
- `test/closed-document.test.ts`: documento cerrado y caracteres prohibidos (E16): `UNKNOWN_KEY` en cada objeto del esquema, `TEXT_CONTROL_CHAR` por campo, `yarnLetter`, y la propiedad "con JSON arbitrario, si es `savable` no tiene claves desconocidas ni caracteres prohibidos y `JSON.stringify` no contiene `\u0000`".
- `test/yarn-usage.test.ts`: `yarnUsage`, casos F3-14 a F3-20 (y los conteos de F3-21 y F3-22) de [casos-dominio-fase-3.md](../../docs/casos-dominio-fase-3.md); propiedades contra una referencia por fuerza bruta, las de la enmienda T1-1 del ADR 0008, "no lanza con documentos `savable`" y rendimiento (200 × 200 con repeticiones 500 × 500).
- `test/migrate.test.ts`: `STEPS[1]` y las propiedades M1 a M4 (CA4-M1), con el validador v1 congelado en `test/support/validate-v1.ts`. **Excepciones deliberadas de M1**: el tope de lo que trabaja una vuelta (T4-4) y los topes de T20 (`data.limit` en `maxRoundWork`, `maxExpansionWork`, `maxRoundStitches`, `maxRoundItems` y `maxTextLength`): un v1 hostil que era `savable` deja de serlo. Una prueba muestra cada caso (la bomba, la cadeneta de `1e300` en hileras, 101 nodos y un texto de más de 100.000 caracteres). Ningún documento real cambia: la base no tiene patrones escritos (auditoría T2).
- `test/t20-topes.test.ts` (T20): los topes de T20 en sus bordes (trabajo de 50.000 y 50.001 por vuelta, 2.000.000 y 2.000.001 por documento, `expected` y cadeneta de 50.000, 100 y 101 nodos, texto de 100.000 y 100.001 caracteres), RT1 en esos bordes, los topes de 20 por código (`layout` y ítems, con `data.omitted`), propiedades con grupos de solo color (`expandRound` y `countRound` contra una expansión ingenua; el trabajo aritmético es lo que recorre esa expansión; el validador da `LIMIT` justo cuando se pasa el tope), `concreteRounds` contra contar cada vuelta desde cero, `formattedPartLength` contra `formatPart`, y la **guardia de tiempos** con los documentos hostiles de la revisión (`test/support/hostile.ts`): `validatePattern` (con y sin `weightCat`) y `partProfile` en menos de 50 ms (100 en CI; `T20_TIME_FACTOR` lo cambia).
- `test/validate-v2.test.ts`: `PART_COPIES`, cada código de `layout`, documentos hostiles (ciclos, 10.000 anclas, `NaN`, `1e308`, 50 partes con 51 copias) en menos de 50 ms (CA4-M3), borradores escritos (CA4-M4) y la propiedad "los derivados funcionan con todo documento v2 `savable`".
- `test/recommended.test.ts`: límites recomendados (CA4-M8): coinciden con una referencia que expande cada vuelta, nunca lanzan, no aparecen en `validatePattern` y son lineales.
- `test/casos-dominio-fase4.test.ts`: casos F4-1 a F4-7, F4-11, F4-12, F4-29 a F4-34, los conteos de los fixtures A y B (F4-45, F4-48, F4-49, F4-51) y F4-58, F4-70 de [casos-dominio-fase-4.md](../../docs/casos-dominio-fase-4.md). Los fixtures están en `test/support/amigurumi.ts` (texto y parte leída por el motor). La forma (perfil, alto, diámetro) está en `test/profile.test.ts`.
- `test/profile.test.ts`: perfil de las partes (T5): constantes, `shapeMetrics` (F4-43), `roundHeightFactor`, los tres tramos, la V1 sobre anillo mágico, cadeneta en aro, paneles y borradores; casos F4-36 a F4-41 (disco plano, 7 avisa, 12 ondula, `ROUND_SHRINKS_FAST`, sensibilidad a `ρ`), la forma de los fixtures A y B (F4-46, F4-47, F4-50, F4-51), la guardia de rendimiento (fixture A en menos de 3 ms), las propiedades G1, G2, G3, G10 y la parte del perfil de G11, "los avisos salen justo donde el perfil acota" y el invariante de opciones.
- `test/text-v2.test.ts` (T6): `normalizePart`, notas `>` y cierres de varias líneas (CA4-E4), aviso de `#` (CA4-E5), "Cantidad" y sus alias (F4-61), `Inicio: óvalo` (F4-9), `formatPartLines`, `parseWrittenParts`, `PARSE_LIMITS` (con la línea hostil de 2.000 caracteres en menos de 5 ms) y dialectos: tabla C-15, F4-63 a F4-69 y CA4-G2.
- `test/edit-written.test.ts` (T6): cada operación de `edit-written.ts`, profundidad completa, `moveItem` entre niveles, topes duros sí y recomendados no, `setCopies` y `removePart` sin referencias colgando, lanas generalizadas y entradas dañadas.
- `test/property-texto.test.ts` (T6): RT1 a RT6 (RT3 a profundidad completa) y las propiedades de la sección 6 (toda operación deja un documento `savable`; `removePart` y `setCopies` no dejan referencias colgando).
- `test/qa-bordes-colorwork.test.ts`: umbrales exactos de cada regla en sus bordes, "nunca lanza y termina" con JSON arbitrario (mutaciones de documentos válidos, sin acotar `number` ni `through`), las correcciones F1 a F4 de T2d (números de vuelta desmedidos, claves heredadas de `Object.prototype`, rangos sin tope, mensajes sin "undefined", "NaN" ni "[object Object]") y el peor caso de rendimiento (menos de 100 ms).

## Limitaciones conocidas

- Los patrones escritos son solo de crochet; el palillo se diseña con gráfico.
- `aum`, `aum3` y `dism` cuentan igual con cualquier punto, pero el render los dibuja como punto bajo.
- Inicio en óvalo (trabajar ambos lados de la cadeneta) y relleno (`stuffing`) quedan fuera de la v2 (enmienda C-13). Las bases ovaladas se escriben con `Inicio: AM` y la V1 con sus puntos.
- `MAGIC_RING_UNUSUAL` (3 a 12), la lectura de la cadeneta en aro (un punto en cada cadeneta), las pistas de los mensajes y los cinco límites recomendados quedan "validar con tejedora" (T1b).
- Abreviaturas provisionales pendientes de validar con tejedoras: `aum3`/`inc3`, `ht`/`hd` (hebra trasera o delantera), `saltar`, `miss` (UK) y `mr`. Las pistas del otro dialecto y "Cantidad" también son "validar con tejedora".
- `invdec`, `sk` y `skip` se leen solo en `es-us` (la enmienda C-16 no los lista entre los alias compartidos), aunque significan lo mismo en UK.
- Gráficos: el tipo y la inclinación de cada disminución, y el color del punto que resulta de ella, no se expresan en v1 (ADR 0005). `rowShapingColumns` marca la columna del punto que desaparece, no dónde se teje la disminución.
- En plano y tubo, `dimensionsCm` usa `width × repeat.x` aunque haya máscara (ADR 0003); solo el círculo usa la vuelta más ancha.
