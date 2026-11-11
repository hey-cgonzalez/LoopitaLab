# @loopitalab/pattern-core

Modelo canónico de patrones, motor determinista y validador. Sin dependencias: corre igual en el navegador, en Next.js y en las Edge Functions de Supabase. Ver [ADR 0001](../../docs/adr/0001-modelo-canonico.md) y [ADR 0002](../../docs/adr/0002-nucleo-sin-dependencias.md).

## Qué hace

La tabla lista todo lo que exporta `src/index.ts`.

| Módulo | Exporta |
|---|---|
| `types.ts` | Tipos del modelo: `Pattern` (`ChartPattern` o `WrittenPattern`), `Technique`, `WeightCategory` (0 a 7), `Yarn`, `YarnColor`, `FiberShare`, `Gauge`, `Origin`, `Chart`, `RenderShape`, `Part`, `PartStart`, `Round`, `Item` (`StitchItem`, `GroupItem`, `ColorItem`), `StitchCode`, `Loop`, `Issue`, `Severity`. Constantes `SCHEMA_VERSION` (hoy 1) y `NO_STITCH` (−1, casilla sin punto) |
| `stitches.ts` | `STITCHES` (cuánto consume y produce cada punto, abreviaturas en español de Chile e inglés de EE. UU.), `LOOPS` (hebra delantera o trasera), `normalizeTerm` (minúsculas, sin puntos ni espacios extra), `lookupStitch` y `lookupLoop` (término o alias → código, o `undefined`; buscan en un `Map`, así "toString" o "__proto__" no son puntos), `stitchAbbrev` y `loopAbbrev` (código → abreviatura según `"es"` o `"us"`). Tipos `StitchDef` y `Dialect` |
| `written.ts` | `countRound`, `expandRound`, `concreteRounds`, `summarizePart`, `startAvailable` (puntos disponibles para la primera vuelta: `null` con anillo mágico, la cadeneta en vueltas cerradas o espiral, y la cadeneta menos 1 en hileras). Tipos `ExpandedStitch`, `RoundCount`, `ConcreteRound`, `PartSummary` |
| `chart.ts` | `cellIndex`, `motifCell`, `fullSize`, `cellAt`, `fullRow`, `yarnTotals`, `stitchTotal`, `rowFloats`, `yarnUsage`, `dimensionsCm`, `floatLengthCm`; derivados del colorwork: `motifCoord`, `rowStitchCount`, `rowStitchCounts`, `shaping`, `rowShapingColumns`, `readingDirection`, `wornOrientation`. Tipos `RowFloat`, `YarnUsage`, `ChartDimensions`, `RowShaping`, `RowShapingColumns`, `ReadingDirection` |
| `edit.ts` | Operaciones puras de edición: `paintCells`, `fillRegion`, `resizeMotif`, `setRepeat`, `addYarn`, `removeYarn`, `reorderYarns`, `newChartPattern`; `EDIT_LIMITS`, `ANCHORS`. Tipos `CellRef`, `Anchor`, `NewChartInput` |
| `migrate.ts` | `migratePattern` y el tipo `MigrationResult`: camino obligatorio de lectura de todo documento |
| `text.ts` | `parseRound`, `parsePart`, `formatRound`, `formatPart`. Tipos `ParseResult`, `ParsePartOptions` |
| `letters.ts` | `yarnLetter(index)`: letra de la lana según su orden en el documento (A… Z y, desde la 27, AA, AB… como las columnas de una planilla). La usan el validador, el gráfico SVG, la cuadrícula del editor y el modo tejiendo |
| `validate.ts` | `validatePattern`, `parsePattern`, `validateYarn`, `isDraftError`, `DRAFT_ERROR_CODES`, `LIMITS` (definido en `limits.ts`). Tipos `ValidateOptions`, `ValidationResult` |

## Cuándo puede lanzar una excepción

- **Nunca lanzan y terminan en tiempo acotado** con `null`, valores primitivos ni nada que pueda producir `JSON.parse` (incluidos números como `2^53` o `1e308` y claves como `__proto__`): `validatePattern`, `parsePattern`, `validateYarn`, `migratePattern`, `newChartPattern` y las operaciones de `edit.ts`. Las tres primeras y `migratePattern` tampoco lanzan con objetos armados a mano con getters o `Proxy` que lanzan (try/catch acotado): `validatePattern` informa `SHAPE` y `migratePattern` informa `SCHEMA_VERSION`. El validador acota `number` y `through` de cada vuelta antes de recorrer los rangos.
- **Suponen un documento `savable`** (sin errores estructurales, ADR 0003, E10), no necesariamente `valid`: los derivados de `chart.ts` (y `stitch-render`). Funcionan con `CHART_EMPTY`, con vueltas sin puntos y con cuñas que dan `CHART_SHAPING_IMPOSSIBLE` (propiedad C14). Con un gráfico dañado pueden devolver valores sin sentido (por ejemplo, `NaN` o `Infinity` en `dimensionsCm` con una muestra de 0 puntos), pero `rowStitchCounts` y `shaping` devuelven `[]` si el alto o las repeticiones no son enteros.
- **Suponen un documento validado**: los derivados de `written.ts`, `formatRound` y `formatPart`. Con un patrón escrito dañado (por ejemplo, `part.start` ausente), `startAvailable` y los conteos pueden lanzar `TypeError`: valida antes con `validatePattern`. Aun así, `concreteRounds` y `summarizePart` terminan siempre: omiten vueltas cuyo `number` o `through` no es un entero seguro y nunca despliegan más de `LIMITS.maxRounds` vueltas. `formatPart` escribe el nombre y el cierre en una sola línea (un salto de línea se vuelve espacio, para que no se lea como otra línea del patrón), omite el cierre en blanco y escribe un nombre en blanco como "Parte" (el valor por omisión de `parsePart`).
- `parseRound` y `parsePart` devuelven `{ ok: false, issues }` ante texto inválido; no lanzan con texto.

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

- Con `schemaVersion: 1` es la identidad (devuelve el mismo objeto).
- Con una versión desconocida, futura o ausente, devuelve el documento sin tocar, `ok: false`, `to === from` (`null` si no declara una versión numérica) y un error `SCHEMA_VERSION` en español. El validador también lo informa. Se decide por `ok`, nunca por `to`.
- Es idempotente y nunca lanza. El documento migrado se guarda solo cuando la usuaria guarda.

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

## Qué valida

`validatePattern(input, opts?)` acepta cualquier JSON (por ejemplo, propuesto por la IA) y devuelve `{ valid, savable, issues }`. Cada `Issue` trae `code`, `severity` (`error`, `warning` o `info`), `path`, `message` en español y `data` (con `row`, base 0, cuando corresponde). Los mensajes nunca interpolan un valor de tipo incorrecto (no muestran "undefined", "NaN" ni "[object Object]"): primero se revisa el tipo y, si falla, no se emite el aviso que dependía de él.

**Dos clases de error** (ADR 0003, E10; ADR 0006, E10):

- **Error de tejido**: el documento es sano y todas las vistas derivadas funcionan, pero no se puede tejer tal cual. Son los códigos de `DRAFT_ERROR_CODES` (`CHART_EMPTY` y `CHART_ROW_EMPTY_FULL`); `isDraftError(issue)` los reconoce.
- **Error estructural**: cualquier otro error. El documento no es interpretable o rompe un invariante del que dependen los derivados. La lista es cerrada: un código de error nuevo es estructural hasta que alguien lo agregue a `DRAFT_ERROR_CODES` a propósito.
- `valid` es `true` si no hay ningún error; `savable`, si todos los errores son de tejido. `valid` implica `savable`.
- Qué exige cada flujo: **guardar** (autoguardado, crear, duplicar), `savable`; **tejer, publicar o compartir, exportar y aceptar una salida de IA**, `valid`. `parsePattern` sigue exigiendo `valid`.

- **Errores estructurales**:
  - conteo declarado distinto del real; una vuelta que trabaja sobre más o menos puntos de los que dejó la anterior (en espiral y vueltas cerradas); numeración de vueltas (desde 1); `number` o `through` sobre `LIMITS.maxRounds`, o rangos que juntos superan ese tope (`LIMIT`);
  - lanas inexistentes; composición que no suma 100 %; grosor fuera de 0–7; colores mal escritos; `paletteId` que no es texto (`SHAPE`, con o sin `paletteIds`);
  - puntos desconocidos (`STITCH_UNKNOWN`; los nombres heredados de `Object.prototype`, como `toString`, también lo son);
  - `TITLE_LENGTH`: título de 1 a 120 caracteres (puntos de código, como `char_length` de la columna `patterns.title`);
  - textos libres (F5): `parts[i].name`, `parts[i].finish`, `rounds[j].note`, `yarns[i].note`, `origin.model` y `origin.promptVersion` deben ser texto, y `notes` y `assembly`, listas de textos (`SHAPE` con la ruta exacta, con cualquier origen). Los topes de largo, en puntos de código, están en `limits.ts` (`maxPartNameLength` 80, `maxRoundNoteLength`, `maxFinishLength` y `maxYarnNoteLength` 500, `maxNoteLength` 2000 por nota o paso, `maxNotes` 50 elementos por lista, `maxOriginFieldLength` 100, `maxIdLength` 64 para `id`, `parts[i].id`, `fiber` y `paletteId`); excederlos es `LIMIT`. La nota de la lana es privada: nunca se cita en un mensaje;
  - `PART_NAME`: el nombre de una parte no puede estar en blanco ni tener saltos de línea. Mientras el nombre no sea válido, los mensajes llaman a la parte "Parte N" (su posición);
  - `UNKNOWN_KEY` (**documento cerrado**, ADR 0003, E16): cada objeto del esquema v1 admite solo sus claves, incluidas las opcionales; cualquier otra es error estructural, con la ruta de la clave (`yarns[0].brand`) y la clave en `data.key`. La clave se recorta a 40 caracteres y se limpia de caracteres de control en la ruta y en el mensaje. Se informan hasta 20 por documento. Claves permitidas:
    - raíz: `schemaVersion`, `id`, `title`, `technique`, `yarns`, `gauge`, `origin`, `notes`, `kind` y, según `kind`, `chart` (gráfico) o `parts` y `assembly` (escrito); con un `kind` desconocido (ya es `KIND`) se aceptan las tres;
    - `chart`: `width`, `height`, `cells`, `repeat`, `workedIn`, `renderAs`, `direction`; `chart.repeat`: `x`, `y`; `gauge`: `stitchesPer10cm`, `rowsPer10cm`; `origin`: `kind`, `model`, `promptVersion`;
    - `yarns[i]`: `id`, `weight`, `composition`, `color`, `note`; `color`: `hex`, `paletteId`; `composition[k]`: `fiber`, `percent`;
    - `parts[i]`: `id`, `name`, `construction`, `start`, `startYarn`, `rounds`, `finish`; `start`: `type` (anillo mágico) o `type` y `count` (cadeneta); `rounds[j]`: `number`, `through`, `items`, `expected`, `note`;
    - ítems: punto `type`, `stitch`, `count`, `loop`; grupo `type`, `items`, `times`; color `type`, `yarn` (un ítem de tipo desconocido ya es `SHAPE`).

    `validateYarn` también la aplica, así que `addYarn` no agrega una lana con claves de más;
  - `TEXT_CONTROL_CHAR` (ADR 0003, E16): ningún texto admite caracteres de control `\p{Cc}` (U+0000 a U+001F y U+007F a U+009F; Postgres rechaza U+0000 en jsonb) ni sustitutos UTF-16 sueltos (también los rechaza jsonb; `data.surrogate: true`). Se admiten el salto de línea (`\n`) y la tabulación (`\t`) solo en los textos de varias líneas: `notes[i]`, `assembly[i]`, `parts[i].finish`, `rounds[j].note` y `yarns[i].note`. En el título, los identificadores, los nombres de parte, `fiber`, `paletteId` y `origin`, ninguno (tampoco `\r`: la interfaz normaliza `\r\n` a `\n`). `data.codePoint` dice cuál es ("U+0000") y `data.index` dónde está. Los mensajes que citan un texto de la usuaria reemplazan esos caracteres por "�";
  - `CHART_CELL_VALUE`, `CHART_SIZE`, `CHART_MOTIF_TOO_LARGE` (motivo de más de 200 × 200 casillas; el mensaje dice cuánto mide) y entradas desmedidas (`LIMIT`).
- **Errores de tejido (no impiden guardar el borrador)**:
  - `CHART_EMPTY`: el gráfico no tiene ningún punto;
  - `CHART_ROW_EMPTY_FULL`: vueltas del gráfico completo sin puntos. Una sola, con las filas del gráfico completo en `data.rows` (hasta 50) y las del motivo en `data.motifRows`, para resaltarlas. Es el único aviso por esa causa: desde T2d ya no se emite `CHART_EMPTY_ROW`.
- **Advertencias**:
  - `CHART_SHAPING_IMPOSSIBLE` (todas las formas): en una vuelta quedan menos de `ceil(anterior / 3)` puntos, así que **no se alcanza solo disminuyendo** de a 2 o 3 juntos. El mensaje nombra las alternativas: cerrar puntos, dejarlos en espera, tejer 4 o más juntos o pasar la hebra por todos. El código conserva su nombre por compatibilidad;
  - `CHART_SHAPING_TOO_FAST` (todas las formas): disminución que deja menos de `ceil(anterior / 2)` (exige disminuir de a 3 juntos o más y la tela se frunce), o aumento a más de `anterior × 2`. Una transición dispara una sola de `IMPOSSIBLE` y `TOO_FAST`;
  - `CHART_FLOAT_LONG`: hebra flotante de más de `max(1, min(floor(2,5 × puntos en 10 cm / 10), tope))` puntos, con tope 5 por defecto. La muestra sale del documento; si no tiene, de `opts.assumedGauge`; si no, de `opts.weightCat` (tabla supuesta del ADR 0003: 5, 5, 5, 5, 4, 3, 2 y 1 puntos por categoría 0 a 7). Sin ninguna, el máximo es el tope y no se informan cm. El mensaje nombra la lana por su letra (`yarnLetter`: "la lana B (#BA222C)"; desde la 27, "la lana AA"), nunca por el id interno ni por la nota privada, y dice "enganchar la hebra";
  - en el círculo: `CHART_SHAPING_STEEP` (más de 2 puntos por repetición en una vuelta), `CHART_SHAPING_UNEXPECTED` (aumentos en `bottom_up` o disminuciones en `top_down`), `CHART_CIRCLE_REPEAT_Y` (`repeat.y > 1` con máscara: cada repetición vuelve a abrir la forma) y `CHART_CIRCLE_NOT_CLOSED` sobre 24 puntos en la última vuelta con puntos ("lo habitual es cerrar con 8 a 16 puntos pasando la hebra por todos");
  - `CHART_ROWS_SHAPE` (tubo o círculo de ida y vuelta: "la pieza queda abierta y hay que coserla");
  - descuadres en piezas en hileras; patrones de IA sin el modelo registrado.
- **Información**: `CHART_COLORS_PER_ROW` (más de 2 lanas en una fila), `YARNS_MIXED_WEIGHT` (grosores distintos en un gráfico), `CHART_RENDER_UNSUPPORTED` (`yoke`, que se dibuja como tubo), en el círculo `CHART_CIRCLE_REPEATS` (fuera de 4 a 12), `CHART_WEDGE_TOO_NARROW` (cuña de menos de 4 puntos), `CHART_CIRCLE_NOT_CLOSED` sobre 16 y `CHART_CIRCLE_START` (`top_down` con menos de 4 o más de 16 puntos en la primera vuelta con puntos; el texto depende de la técnica: anillo mágico de 6 a 12 en crochet, montaje inicial de 8 a 12 en palillo); vueltas sin conteo declarado y lanas que no se usan.
- Las reglas de forma comparan vueltas seguidas del gráfico completo (incluido el borde entre repeticiones verticales) y no se miden contra una vuelta sin puntos (que ya es error de tejido). `CHART_CIRCLE_NOT_CLOSED` y `CHART_CIRCLE_START` miden la última o la primera vuelta **con puntos**: una fila vacía en el borde no las silencia.
- Los mensajes dicen "vuelta" en redondo y "fila" de ida y vuelta, "casilla" (también para ubicar una columna) y "hebras flotantes" (glosario pendiente del roadmap).

`ValidateOptions`: `fibers` y `paletteIds` (avisos de fibras o colores desconocidos), `assumedGauge` y `weightCat` (muestra supuesta; nunca se escribe en el documento), `maxFloatCm` (2,5 por defecto) y `maxFloatStitches`: tope entero ≥ 1 que se aplica siempre, con o sin muestra; cualquier otro valor (0, −1, 4,5, `NaN`) usa el 5 por defecto. **Invariante**: ninguna opción cambia el conjunto de errores; solo agrega o ajusta advertencias e información, así el cliente y el servidor llegan al mismo `valid` y `savable` (propiedad C15).

`validateYarn(input, path = "yarn", opts?: Pick<ValidateOptions, "fibers" | "paletteIds">)` revisa una lana suelta con las mismas reglas y prefija las rutas con `path`. Las opciones solo agregan advertencias (fibra o color desconocidos); `addYarn` la llama sin opciones. No revisa el id repetido ni el tope de lanas.

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
- `test/qa-bordes-colorwork.test.ts`: umbrales exactos de cada regla en sus bordes, "nunca lanza y termina" con JSON arbitrario (mutaciones de documentos válidos, sin acotar `number` ni `through`), las correcciones F1 a F4 de T2d (números de vuelta desmedidos, claves heredadas de `Object.prototype`, rangos sin tope, mensajes sin "undefined", "NaN" ni "[object Object]") y el peor caso de rendimiento (menos de 100 ms).

## Limitaciones conocidas (v1)

- Los patrones escritos son solo de crochet; el palillo se diseña con gráfico.
- `aum`, `aum3` y `dism` cuentan igual con cualquier punto, pero el render los dibuja como punto bajo.
- Inicio en óvalo (trabajar ambos lados de la cadeneta) todavía no tiene regla de consumo propia.
- Abreviaturas provisionales pendientes de validar con tejedoras: `aum3`, `ht`/`hd` (hebra trasera o delantera) y `saltar`.
- Gráficos: el tipo y la inclinación de cada disminución, y el color del punto que resulta de ella, no se expresan en v1 (ADR 0005). `rowShapingColumns` marca la columna del punto que desaparece, no dónde se teje la disminución.
- En plano y tubo, `dimensionsCm` usa `width × repeat.x` aunque haya máscara (ADR 0003); solo el círculo usa la vuelta más ancha.
