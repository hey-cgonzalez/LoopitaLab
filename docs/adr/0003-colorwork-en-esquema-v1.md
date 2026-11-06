# ADR 0003: Estudio de colorwork sobre el esquema v1

- Estado: aceptado (aprobado por la usuaria el 2026-11-05). Enmendado el 2026-11-06 tras implementar T2 (ver [Enmiendas](#enmiendas-tras-la-implementación-de-t2-2026-11-06)) y tras T2b y T2c (ver [E10 a E13](#enmiendas-tras-t2b-y-t2c-2026-11-06))
- Fecha: 2026-11-05
- Paquete: `packages/pattern-core`
- Relacionado: [ADR 0001](0001-modelo-canonico.md), [ADR 0005](0005-geometria-circulo-y-disminuciones.md)

## Contexto

La fase 2 construye el estudio de colorwork a palillo (ver [roadmap](../roadmap.md)). Necesita motivo, repeticiones a lo ancho y a lo alto, muestra, dirección de tejido, celdas fuera de forma para gráficos en cuña y forma de render plano, tubo y círculo.

El esquema v1 (ADR 0001) ya tiene casi todo:

- `chart.width`, `chart.height` y `chart.cells`;
- `chart.repeat`;
- `chart.workedIn`, `chart.renderAs` y `chart.direction`;
- `NO_STITCH` para las celdas fuera de forma;
- `gauge` en la raíz.

Falta precisar varias cosas:

- **Semántica**:
  - qué columna es `x = 0`;
  - cómo se lee cada fila;
  - cómo afecta `direction` a la vista;
  - qué significa `yoke` si no tiene geometría.
- **Operaciones**: no hay operaciones puras de edición. El remapeo de lanas que menciona ADR 0001 tampoco está implementado.
- **Migraciones**: no hay un punto de entrada para migrar documentos.
- **Datos que v1 no tiene**: el principio del modelo pide tallas, y tampoco hay secciones (banda + copa) ni símbolos de punto (revés, tipo de disminución).

## Opciones

- **A. Mantener `schemaVersion: 1` sin cambiar la forma del documento.** Se precisa la semántica y se agregan funciones derivadas, operaciones de edición y validaciones.
- **B. Pasar a `schemaVersion: 2` ahora.** Se agregan `sections[]` (banda + copa en un mismo diseño), tallas y una capa de símbolos por celda.
- **C. v2 mínima solo con símbolos de disminución por celda.**

## Decisión

Opción **A**. La fase 2 no cambia la forma del documento. Lo que falta para B y C se diseña en un ADR propio cuando haya una necesidad confirmada por tejedoras, con su migración.

### 1. Semántica precisada (sin cambio de forma)

Esta sección ya incorpora la revisión de `experto-tejido` (ver la sección al final). Lo marcado "validar con tejedora" se confirma con tejedoras reales antes de cerrar la fase 2.

- **Coordenadas**:
  - `(x, y)`, con `y = 0` como la primera fila o vuelta que se teje (ya estaba en ADR 0001);
  - `x = 0` es la columna de la izquierda **vista desde el derecho de la labor**, igual que en un gráfico impreso.
  - El documento siempre describe la labor como se ve por el derecho. Nunca se guarda espejada.
  - **Convención**: la fila 1 (`y = 0`) se teje por el derecho. La v1 no permite declarar lo contrario.
- **Orden de lectura (derivado, no guardado)**:
  - en redondo, todas las vueltas de derecha a izquierda;
  - en ida y vuelta, las filas por el derecho (`y` par) de derecha a izquierda y las del revés (`y` impar) de izquierda a derecha.
  - En las filas por el revés, los puntos de colorwork se tejen al revés. El gráfico siempre muestra el aspecto por el derecho.
  - **Numeración del gráfico** (`pattern-render`, `rowNumbers`): en ida y vuelta, las filas por el derecho se numeran a la derecha y las del revés a la izquierda; en redondo, todas a la derecha.
- **Tejido en espejo (`mirror_knitting`)**:
  - No se espeja por `profiles.dominant_hand = 'left'`: la mayoría de las zurdas teje igual que las diestras.
  - Hay una preferencia aparte en el perfil, `mirror_knitting`, desactivada por defecto.
  - Con espejo activado:
    - las filas por el derecho se leen de izquierda a derecha y las del revés de derecha a izquierda;
    - en redondo se invierte el sentido;
    - en el futuro, se intercambian las inclinaciones de las disminuciones (capa de símbolos).
  - El espejo afecta el modo tejiendo, la numeración y la ayuda, **nunca el documento**.
- **`direction`**:
  - Solo afecta la vista previa, que muestra la pieza como se usa.
  - `bottom_up`: la fila 0 queda abajo.
  - `top_down`: la pieza terminada se ve **rotada 180°** respecto del gráfico, `(x, y) → (W − 1 − x, H − 1 − y)` sobre el gráfico completo. No es un espejo vertical: el punto queda invertido y la columna izquierda pasa a la derecha. Aplicar la rotación dos veces devuelve el original.
  - El editor de motivo siempre muestra la fila 1 abajo, como es convención en los gráficos.
  - En el círculo, `direction` decide si la fila 0 es el anillo exterior o el centro, y el sentido de giro (ADR 0005).
- **Repeticiones**:
  - El gráfico completo mide `width × repeat.x` por `height × repeat.y`.
  - Pintar una celda del gráfico completo escribe la celda del motivo `(x mod width, y mod height)`: editar una repetición edita todas.
- **`NO_STITCH`**:
  - Significa que en esa fila no hay punto en esa posición.
  - No es un color de fondo: en plano y tubo se dibuja vacío.
  - El conteo de puntos de una fila es la cantidad de celdas distintas de `NO_STITCH`.
  - La herramienta "sin punto" es distinta del borrador que pinta la lana de fondo.
  - **Matices**:
    - El color del punto que resulta de una disminución no se puede expresar en v1. La vista usa el color de la fila `y`. Es una limitación visible.
    - En plano y tubo se ven huecos que la prenda real no tiene, porque los puntos se juntan. La interfaz lo dice.
    - `dimensionsCm` usa `width × repeat.x` aunque haya `NO_STITCH`. Se corrige así:
      - en tubo y círculo, el ancho se rotula "circunferencia";
      - en el círculo, la circunferencia sale del máximo de `rowStitchCount`, no del ancho del gráfico.
- **`renderAs`**:
  - Solo afecta la vista; los conteos nunca dependen de él.
  - `yoke` sigue siendo un valor válido por compatibilidad, pero su geometría no está definida.
  - En la fase 2, el editor no ofrece canesú. La vista previa de un documento `yoke` se dibuja como tubo, con un aviso visible.
- **`gauge`**:
  - Sigue siendo opcional.
  - Si falta, las vistas usan una **muestra supuesta**, derivada del grosor de la lana principal (`yarn-catalog`), y la interfaz la marca como "supuesto" (regla de oro 6).
  - **Puntos**: el punto medio del rango del Craft Yarn Council.
  - **Filas**: el CYC solo publica puntos. Las filas son un supuesto visible: `rowsPer10cm = round(puntos × 1,35)`, medido en punto jersey.
    - En colorwork a hebras la proporción suele estar más cerca de 1,25 a 1,3 (validar con tejedora).
  - **Tabla supuesta** (muestra en punto jersey, en 10 cm):

    | Cat. | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
    |---|---|---|---|---|---|---|---|---|
    | Puntos | 37 | 30 | 25 | 23 | 18 | 14 | 9 | 6 |
    | Filas | 50 | 41 | 34 | 31 | 24 | 19 | 12 | 8 |

    - La categoría 7 es un tope ("6 o menos"), así que su supuesto tiene **baja confianza** y la interfaz lo indica.
  - La muestra supuesta no se escribe en el documento hasta que la usuaria la confirma.
  - El validador también la usa: el umbral de hebras flotantes necesita una muestra aunque el documento no la tenga (`assumedGauge`, sección 4).

### 2. Funciones derivadas nuevas (puras, en `chart.ts`)

```ts
/** Coordenada del motivo que corresponde a una celda del gráfico completo. */
export function motifCoord(chart: Chart, x: number, y: number): { x: number; y: number };
/** Puntos de la fila `y` del gráfico completo (sin NO_STITCH). */
export function rowStitchCount(chart: Chart, y: number): number;
/** Puntos de cada fila del gráfico completo, de la fila 0 a la última. */
export function rowStitchCounts(chart: Chart): number[];

export interface RowShaping {
  /** Fila del gráfico completo. */
  row: number;
  stitches: number;
  /** Diferencia con la fila anterior (negativo = disminuciones). En la fila 0 es 0. */
  change: number;
  /** `change / repeat.x`: disminuciones o aumentos por repetición. */
  perRepeat: number;
}
export function shaping(chart: Chart): RowShaping[];

/** Orden de lectura de una fila. Depende solo de `workedIn`, de `y` y del espejo. */
export function readingDirection(
  chart: Chart,
  y: number,
  opts?: { mirror?: boolean }, // preferencia mirror_knitting
): "right_to_left" | "left_to_right";

/** Celda que se ve en (x, y) de la pieza terminada: identidad en bottom_up, rotación de 180° en top_down. */
export function wornOrientation(chart: Chart, x: number, y: number): { x: number; y: number };

/** Medidas: en tubo y círculo, `widthCm` es la circunferencia; en el círculo sale del máximo de rowStitchCount. */
export function dimensionsCm(chart: Chart, gauge: Gauge): { widthCm: number; heightCm: number; widthIsCircumference: boolean };
```

`dimensionsCm` ya existe. Cambia su contrato: agrega `widthIsCircumference` y corrige el cálculo cuando hay máscara.

### 3. Operaciones de edición (puras, en `edit.ts` nuevo)

Las operaciones devuelven un objeto nuevo, nunca mutan el original y nunca lanzan excepciones. Las coordenadas fuera de rango se ignoran. Si un parámetro no es válido, devuelven el mismo objeto sin cambios. Cada operación crea a lo más un arreglo `cells` nuevo, aunque pinte muchas celdas (un trazo completo es una sola operación).

```ts
export interface CellRef { x: number; y: number } // coordenadas del gráfico completo

export function paintCells(chart: Chart, refs: readonly CellRef[], value: number): Chart;
/** Relleno por contigüidad dentro del motivo (4 vecinos, sin envolver bordes). */
export function fillRegion(chart: Chart, start: CellRef, value: number): Chart;
export type Anchor = "bottom_left" | "bottom_center" | "bottom_right" | "center";
export function resizeMotif(chart: Chart, width: number, height: number, anchor: Anchor, fill: number): Chart;
export function setRepeat(chart: Chart, x: number, y: number): Chart;

export function addYarn(pattern: ChartPattern, yarn: Yarn): ChartPattern;
/** Quita la lana `index`; sus celdas pasan a `replaceWith` y se remapean los índices. */
export function removeYarn(pattern: ChartPattern, index: number, replaceWith: number): ChartPattern;
/** `order[i]` = índice anterior de la lana que queda en la posición i. */
export function reorderYarns(pattern: ChartPattern, order: readonly number[]): ChartPattern;

export interface NewChartInput {
  id: string;
  title: string;
  width: number;
  height: number;
  repeat: { x: number; y: number };
  workedIn: Chart["workedIn"];
  renderAs: Exclude<Chart["renderAs"], "yoke">;
  direction: Chart["direction"];
  yarns: Yarn[]; // la primera es el fondo
  gauge?: Gauge;
}
export function newChartPattern(input: NewChartInput): ChartPattern;
```

### 4. Validaciones nuevas en `validatePattern`

| Código | Severidad | Regla |
|---|---|---|
| `TITLE_LENGTH` | error | Título de 1 a 120 caracteres, igual que la columna `patterns.title` |
| `CHART_RENDER_UNSUPPORTED` | info | `renderAs: "yoke"`: la vista previa todavía no lo dibuja |
| `CHART_ROWS_SHAPE` | advertencia | Tubo o círculo con `workedIn: "rows"`. Mensaje: "se teje de ida y vuelta y se cose". El plano con ida y vuelta no avisa |
| `CHART_ROW_EMPTY_FULL` | advertencia; **error de tejido desde E10** | Una fila del gráfico completo sin puntos (hoy solo se revisa el motivo) |
| `CHART_FLOAT_LONG` (ya existe, se corrige) | advertencia | Ver "Umbral de hebras flotantes" abajo |
| `CHART_COLORS_PER_ROW` (ya existe) | info | Más de 2 lanas en una fila |
| `YARNS_MIXED_WEIGHT` | info | Las lanas del diseño tienen distinto grosor CYC |
| Reglas del círculo | ver ADR 0005 | Disminuciones, repeticiones, cierre e inicio |

**Umbral de hebras flotantes**:

- El máximo en puntos es `min(floor(2,5 cm × puntos en 10 cm / 10), 5)`.
  - Fuentes: Interweave (2,5 cm) y Osborn Fiber (5 puntos).
- Con la muestra supuesta de la tabla, por categoría 0 a 7 queda en 5, 5, 5, 5, 4, 3, 2 y 1. El valor nunca crece con el grosor.
- El estudio guarda sin `gauge` mientras la usuaria no confirme la muestra. Sin un dato extra, el validador siempre usaría 5 fijo, así que `ValidateOptions` agrega dos opciones:

  ```ts
  /** Muestra supuesta (de yarn-catalog) cuando el documento no tiene `gauge`. No se escribe en el documento. */
  assumedGauge?: Gauge;
  /** Alternativa: grosor CYC de la lana principal, para que el validador derive el umbral sin depender de yarn-catalog. */
  weightCat?: WeightCategory;
  ```

  - Prioridad: `gauge` del documento, después `assumedGauge`, después `weightCat`. Si no hay ninguno, el máximo es 5 puntos y no se informan cm.
- El mensaje dice "conviene **enganchar** la hebra" (no "atraparla"), según el glosario pendiente del [roadmap](../roadmap.md#glosario-pendiente).

**Aproximaciones** que la vista y la ayuda nombran pero no modelan en v1:

- los orillos en ida y vuelta;
- el desfase entre el final y el inicio de la vuelta en redondo (*jog*);
- el plano tejido en redondo con *steek* (corte), que es legítimo. Reconocerlo es una mejora sugerida, no una validación de la fase 2.

### 5. Migraciones desde el día uno

- Nuevo `migrate.ts`:

  ```ts
  export function migratePattern(input: unknown): { document: unknown; from: number | null; to: number };
  ```

  La firma final es la unión discriminada de la enmienda E1.

  - Hoy es la identidad para `schemaVersion: 1`.
  - Si la versión es desconocida, devuelve el documento sin tocar y el validador informa `SCHEMA_VERSION`.
- Todo documento que se lee (propio o ajeno) pasa por `migratePattern` y luego por `validatePattern`.
- Un documento migrado se reescribe en la base solo cuando la usuaria guarda. No hay migraciones masivas silenciosas.

### 6. Diferido a un ADR futuro (posible `schemaVersion: 2`)

- **Secciones**: varios gráficos en un diseño (por ejemplo, banda en tubo + copa en círculo).
- **Tallas**: repeticiones o anchos por talla.
- **Capa de símbolos por celda**: revés, tipo e inclinación de la disminución.
- **Geometría de canesú**.
- **Codificación compacta de `cells`**: RLE o base64, si los tamaños lo exigen (ver [ADR 0006](0006-guardado-de-disenos.md)).

## Alternativas descartadas

- **B. v2 ahora**:
  - Obliga a diseñar tallas y secciones sin haber validado el estudio con tejedoras.
  - Retrasa el ciclo instantáneo, que es el gancho del producto.
  - El costo de migrar después es bajo, porque ya existe `migratePattern`.
- **C. Símbolos de disminución ya**: los conteos y las columnas de las disminuciones se derivan de la máscara (ADR 0005). El tipo y la inclinación son un refinamiento que no bloquea el estudio.
- **Guardar la muestra supuesta en el documento**: rompe la regla de oro 6, porque un supuesto parecería un dato de la usuaria.

## Consecuencias

- La fase 2 no requiere migrar documentos. Los documentos v1 existentes siguen siendo válidos.
- **Limitación visible**: en v1 no se puede expresar "disminución inclinada a la izquierda" en una celda. La interfaz muestra el conteo por vuelta y las columnas donde se pierde un punto, no el tipo de disminución.
- La interfaz nunca calcula conteos: usa `rowStitchCounts`, `shaping`, `stitchTotal` y `dimensionsCm`.
- `motor-patrones` implementa las secciones 2 a 5, con pruebas de propiedades. Por ejemplo:
  - `paintCells` seguido de `cellAt` devuelve el valor pintado en todas las repeticiones;
  - `removeYarn` nunca deja índices fuera de rango;
  - `reorderYarns` con una permutación conserva `yarnTotals` permutado.
- Los casos de dominio para QA están en [docs/casos-dominio-colorwork.md](../casos-dominio-colorwork.md).

## Revisión de experto-tejido (2026-11-05)

El estado sigue aceptado. La revisión corrigió reglas sin cambiar la opción elegida (A):

- **Lectura**: se confirmó `x = 0` y el orden de lectura. Se agregó la convención de que la fila 1 es por el derecho y la regla de numeración del gráfico.
- **Zurdas**: ya no se espeja por `dominant_hand = 'left'`. Se agrega la preferencia `mirror_knitting`, desactivada por defecto, que requiere un campo nuevo en el perfil (tarea de `backend-supabase`).
- **`top_down`**: es una rotación de 180°, `(x, y) → (W − 1 − x, H − 1 − y)`, no un espejo vertical. Se agrega `wornOrientation`.
- **Muestra supuesta**: las filas se derivan con la proporción 1,35 como supuesto visible, con la tabla por grosor. La categoría 7 tiene baja confianza.
- **`NO_STITCH`**: se agregan los matices sobre el color tras la disminución, los huecos en plano y tubo, y la circunferencia en `dimensionsCm`.
- **Hebras flotantes**: el umbral queda con tope de 5 puntos. Se agregan `assumedGauge` y `weightCat` en `ValidateOptions`, el mensaje "enganchar", `CHART_FLOAT_LONG` y `CHART_COLORS_PER_ROW` en la tabla, y `YARNS_MIXED_WEIGHT`.
- **`CHART_ROWS_SHAPE`**: se precisa el mensaje. Se mencionan como aproximaciones el *steek*, los orillos y el *jog*.

## Enmiendas tras la implementación de T2 (2026-11-06)

`motor-patrones` implementó T2 (`chart.ts`, `edit.ts`, `migrate.ts`) y dejó nueve decisiones de contrato abiertas. `arquitecto` las resuelve aquí. La opción elegida (A) y `schemaVersion: 1` no cambian. Ninguna enmienda cambia la forma del documento. Hoy `apps/web` no usa estas funciones, así que cambiar las firmas no tiene costo de migración.

### E1. `migratePattern`: resultado discriminado, sin centinela 0

**Decisión: cambiar.** Se aceptan `ok` e `issues`. Se rechaza `to = 0` cuando la entrada no declara versión: 0 parece una versión real, es falso en un `if (to)` y no describe el documento devuelto. El resultado pasa a ser una unión discriminada por `ok`. Cuando `ok` es `false`, `to` es igual a `from`: el documento sigue en la versión que traía, o en ninguna.

```ts
export type MigrationResult =
  | { ok: true;  document: unknown; from: number;        to: number;        issues: Issue[] } // to === SCHEMA_VERSION; issues vacío
  | { ok: false; document: unknown; from: number | null; to: number | null; issues: Issue[] }; // to === from; un error SCHEMA_VERSION
export function migratePattern(input: unknown): MigrationResult;
```

- La sección 5 queda con esta firma en vez de `{ document, from, to }`.
- Quien llama decide por `ok`, nunca por `to`.
- Se mantiene: identidad (mismo objeto) en v1, idempotente, nunca lanza.

**Descartado**: `to: number | null` sin unión. Es más simple, pero el tipo no dice que `to` siempre es `SCHEMA_VERSION` cuando `ok` es `true`.

### E2. Operaciones sobre `Chart`: reciben la cantidad de lanas

**Decisión: cambiar.** El primer argumento sigue siendo `Chart`, no `ChartPattern`. El trazo es el camino caliente del ciclo de 100 ms y no debe copiar ni recorrer `yarns`. Pero se agrega un parámetro **obligatorio** `yarnCount`, para que las operaciones nunca escriban un índice inexistente. Así se cumple lo que afirma el [ADR 0006](0006-guardado-de-disenos.md): las operaciones de `edit.ts` no producen errores estructurales. Hoy `paintCells(chart, refs, 7)`, con 2 lanas, deja un documento que el servidor rechaza (`CHART_CELL_VALUE`), y la interfaz no lo sabe hasta que guarda.

Un valor es válido si es `NO_STITCH` o un entero en `0 … yarnCount − 1`. Si no es válido, se devuelve el mismo objeto (E9). `yarnCount` tiene que ser un entero ≥ 1; si no, también se devuelve el mismo objeto.

```ts
// antes
paintCells(chart: Chart, refs: readonly CellRef[], value: number): Chart;
fillRegion(chart: Chart, start: CellRef, value: number): Chart;
resizeMotif(chart: Chart, width: number, height: number, anchor: Anchor, fill: number): Chart;
// después
paintCells(chart: Chart, refs: readonly CellRef[], value: number, yarnCount: number): Chart;
fillRegion(chart: Chart, start: CellRef, value: number, yarnCount: number): Chart;
resizeMotif(chart: Chart, width: number, height: number, anchor: Anchor, fill: number, yarnCount: number): Chart;
```

- `setRepeat` no cambia: no escribe celdas.
- Se descarta recibir `ChartPattern`: acopla las operaciones de celdas a la lista de lanas y obliga a reconstruir el patrón en cada `pointermove`.
- Se descarta un `yarnCount` opcional: si se olvida, vuelve a aparecer el error que se quiere evitar. Obligatorio, lo revisa `tsc`.

### E3. Pintar todo con `NO_STITCH`

**Decisión: aprobar tal cual.** Es una edición legítima en pleno trazo (por ejemplo, vaciar y volver a dibujar una cuña) y el historial debe poder registrarla. El documento queda con `CHART_EMPTY`:

- el panel de validación lo muestra;
- el autoguardado **no** lo envía (el servidor lo rechazaría, CA-F7), lo deja en el respaldo local y el estado del guardado dice por qué no se guarda;
- se guarda en cuanto vuelva a haber un punto.

Es el único error que las operaciones pueden producir (ADR 0006). Las filas sin puntos (`CHART_ROW_EMPTY_FULL`) son errores de tejido desde E10 y no impiden guardar el borrador (E10, E14).

> **Reemplazado en parte por E10.** `CHART_EMPTY` no era el único error que producían las operaciones (también `CHART_SHAPING_IMPOSSIBLE`, que E10 pasa a advertencia). Desde E10, `CHART_EMPTY` y `CHART_ROW_EMPTY_FULL` (que pasa a error) son errores de tejido: no impiden el autoguardado, pero sí tejer y publicar. Lo que sigue vigente de E3: la edición es legítima, el historial la registra y el panel de validación la muestra.

### E4. `removeYarn(pattern, index, replaceWith)`

**Decisión: aprobar tal cual.** `replaceWith` es el índice **actual**, antes de quitar, de otra lana del diseño. No acepta `NO_STITCH`. Quitar una lana es un cambio de color; pasar sus celdas a "sin punto" cambiaría los conteos por vuelta, las disminuciones y la forma de la cuña sin que la usuaria lo pida. Si la quiere así, lo hace en dos pasos explícitos (pintar con "sin punto" y luego quitar), y los dos se pueden deshacer. Tampoco se puede quitar la única lana.

### E5. Anclajes de `resizeMotif`

**Decisión: aprobar tal cual.**

- Los anclajes se expresan en las coordenadas del **editor**, que siempre muestra la fila 1 abajo (sección 1): "bottom" es la fila 0 y "left" es `x = 0` visto por el derecho. No dependen de `direction` ni del espejo.
- El centro se trunca hacia cero (`Math.trunc(Δ / 2)`). Así, agrandar en N y achicar en N devuelve exactamente el motivo original (prueba de propiedades). Con un Δ impar, la columna o fila sobrante queda a la derecha o arriba.
- La interfaz rotula los anclajes según lo que ve la usuaria ("abajo a la izquierda"…), no con "fila 0".
- Se exporta la lista `ANCHORS` (hoy es interna), para que la interfaz no la duplique.

### E6. `newChartPattern` con tamaño fuera de rango

**Decisión: aprobar tal cual**, porque nunca lanza y el servidor siempre valida antes de insertar (ADR 0006). Con E7, el validador informa el motivo real (`CHART_SIZE` o `CHART_MOTIF_TOO_LARGE`), no solo `CHART_CELLS_LENGTH`, que por sí solo confunde. El asistente `/disenos/nuevo` limita los campos con `EDIT_LIMITS` y no debería llegar a ese caso.

### E7. Límite de 200 × 200 también en el validador

**Decisión: cambiar.** Una sola constante con nombre en el validador, y los límites de edición derivan de ella:

```ts
// validate.ts
export const LIMITS = { /* … */ maxMotifSide: 200, maxCells: 250_000, /* … */ } as const;
// edit.ts
export const EDIT_LIMITS = {
  maxMotifWidth: LIMITS.maxMotifSide,
  maxMotifHeight: LIMITS.maxMotifSide,
  maxRepeat: LIMITS.maxRepeat,
  maxYarns: LIMITS.maxYarns,
} as const;
```

| Código | Severidad | Regla |
|---|---|---|
| `CHART_MOTIF_TOO_LARGE` | error | `chart.width` o `chart.height` mayor que `LIMITS.maxMotifSide` (200). Mensaje: "El motivo puede medir hasta 200 × 200 casillas." |

- **Por qué error y no advertencia**: R2 (tamaño del documento y del cuerpo de las Server Actions) se probó con 200 × 200. Un documento más grande que llega por otra vía (importación, IA en la fase 5, una llamada directa a la Server Action) no está cubierto por esa prueba.
- **Por qué ahora**: subir el límite más adelante es compatible (todo documento guardado sigue siendo válido). Bajarlo después invalidaría documentos ya guardados y exigiría una migración.
- `LIMITS.maxCells` (250.000) se mantiene como protección general del validador.
- Va en T2b. La IA de la fase 5 genera gráficos dentro de este límite.
- **Pendiente de `experto-tejido`**: confirmar que 200 puntos por lado alcanzan para gráficos sin repetición a lo ancho (por ejemplo, una manta o un cuerpo de suéter con un dibujo único). Si no alcanza, se sube la constante y se repite la prueba del peor tamaño (T4).

### E8. Columnas donde se pierde o se gana un punto

**Decisión: agregar a la API, en T2b.** La sección "Consecuencias" y el ADR 0005 piden mostrar las columnas, y la interfaz no puede calcularlas (regla de oro 2, CA-F2). Nueva función pura en `chart.ts`:

```ts
export interface RowShapingColumns {
  /** Fila del gráfico completo. */
  row: number;
  /** Columnas del motivo (0 … width − 1, ascendentes) con NO_STITCH en `row` y punto en `row − 1`. */
  decreases: number[];
  /** Columnas del motivo con punto en `row` y NO_STITCH en `row − 1`. */
  increases: number[];
}
/** En la fila 0, o fuera del gráfico, las dos listas van vacías. */
export function rowShapingColumns(chart: Chart, y: number): RowShapingColumns;
```

- La fila anterior se lee en el gráfico completo (`motifCoord(chart, x, y − 1)`), así que en el borde entre dos repeticiones verticales se compara con la última fila del motivo.
- Devuelve columnas del **motivo**. La interfaz las marca en cada repetición con `motifCoord`, sin contar.
- **Propiedad**: `shaping(chart)[y].change === repeat.x × (increases.length − decreases.length)`, para todo `y`.
- **Pendiente de `experto-tejido`**: la columna marcada es la del punto que desaparece, no necesariamente donde se teje la disminución (un "2 juntos" toma esa columna y una vecina). Hay que decidir cómo lo presenta la interfaz y la ayuda ("aquí se pierde un punto" en vez de "aquí se disminuye") y validarlo con tejedoras (T1b).

### E9. Mismo objeto para "inválido" y "sin cambio"

**Decisión: aprobar tal cual para las operaciones**, y agregar dos ayudas para que la interfaz explique los errores sin duplicar reglas:

- Las operaciones siguen sin devolver un resultado con motivo. `paintCells` corre en cada `pointermove` y no debe asignar objetos extra. Además, el historial solo necesita saber si cambió la referencia.
- La interfaz **no** debe usar el resultado de una operación para mostrar errores. Debe evitarlos antes de llamarla:
  - los campos numéricos (tamaño, repeticiones) se limitan con `EDIT_LIMITS`;
  - los anclajes salen de `ANCHORS` (E5);
  - el selector de lana solo ofrece índices existentes (E2).
- El formulario de lana sí necesita el motivo (por ejemplo, una composición que no suma 100 %). Se expone el validador de lanas que hoy `addYarn` usa por dentro con un documento de prueba:

  ```ts
  // validate.ts
  /** Revisa una lana suelta con las mismas reglas de validatePattern. `path` prefija las rutas de los Issue (por defecto "yarn"). */
  export function validateYarn(input: unknown, path?: string): Issue[];
  ```

  `addYarn` pasa a usarla (una lana es aceptable si `validateYarn` no devuelve errores). El identificador repetido y el tope de 32 lanas los revisa la interfaz con `pattern.yarns` y `EDIT_LIMITS.maxYarns`.

### Cambios que aplica `motor-patrones` (en T2b)

| # | Archivo | Antes | Después |
|---|---|---|---|
| C1 | `migrate.ts` | `interface MigrationResult { document; from: number \| null; to: number; ok: boolean; issues: Issue[] }`, con `to = from ?? 0` si falla | `type MigrationResult` discriminada por `ok` (E1). Si falla, `to = from` (puede ser `null`). Actualizar pruebas y README |
| C2 | `edit.ts` | `paintCells(chart, refs, value)` | `paintCells(chart, refs, value, yarnCount)` (E2) |
| C3 | `edit.ts` | `fillRegion(chart, start, value)` | `fillRegion(chart, start, value, yarnCount)` (E2) |
| C4 | `edit.ts` | `resizeMotif(chart, width, height, anchor, fill)` | `resizeMotif(chart, width, height, anchor, fill, yarnCount)` (E2) |
| C5 | `edit.ts` | `const ANCHORS` interna | `export const ANCHORS: readonly Anchor[]` (E5) |
| C6 | `validate.ts`, `edit.ts` | `EDIT_LIMITS.maxMotifWidth/Height: 200` literales; el validador no limita el lado | `LIMITS.maxMotifSide = 200`; `EDIT_LIMITS` deriva de él; error `CHART_MOTIF_TOO_LARGE` (E7) |
| C7 | `chart.ts` | (no existe) | `rowShapingColumns(chart, y): RowShapingColumns`, con la propiedad de E8 |
| C8 | `validate.ts`, `edit.ts` | `yarnIsValid` interna con un documento de prueba | `export function validateYarn(input, path?): Issue[]`; `addYarn` la usa (E9) |
| C9 | `README.md` | — | Firmas nuevas, `ANCHORS`, `rowShapingColumns`, `validateYarn`, `CHART_MOTIF_TOO_LARGE` y el flujo de `CHART_EMPTY` en el autoguardado (E3) |

Pruebas de propiedades nuevas o ajustadas:

- con `yarnCount = n`, ninguna secuencia de `paintCells`, `fillRegion` y `resizeMotif` produce `CHART_CELL_VALUE`;
- un valor `≥ yarnCount` devuelve el mismo objeto;
- la propiedad de `rowShapingColumns` con `shaping` (E8);
- `migratePattern` con `ok: false` cumple `to === from`.

## Enmiendas tras T2b y T2c (2026-11-06)

`motor-patrones` aplicó C1 a C9 y las validaciones de T2b y T2c. La revisión encontró un conflicto de contrato (E10) y tres decisiones del implementador que no estaban en el ADR (E11 a E13). La opción A y `schemaVersion: 1` no cambian. Ninguna enmienda cambia la forma del documento.

### E10. Errores estructurales y errores de tejido

**Problema.** E3 y el [ADR 0006](0006-guardado-de-disenos.md) afirman que `CHART_EMPTY` es el único error que pueden producir las operaciones de `edit.ts`. No es cierto: pintar casillas "sin punto" puede producir `CHART_SHAPING_IMPOSSIBLE` (error en el ADR 0005). También lo producen `resizeMotif` (achicar una cuña) y `setRepeat`: con `repeat.y > 1`, el borde entre la última fila del motivo y la primera de la repetición siguiente se compara, y una cuña `top_down` de 8 a 80 puntos pasa de 80 a 8 en ese borde. Ese estado intermedio es lo **normal** mientras se dibuja una cuña (por ejemplo, vaciar primero la última vuelta y después las intermedias) y puede durar minutos. Con el contrato actual, el servidor rechaza esos documentos y el autoguardado queda bloqueado justo en el flujo central de HU-03.

**Criterio de `experto-tejido` (2026-11-06).** Pasar de 80 a menos de 27 puntos en una vuelta **sí se puede tejer**: cerrando o rematando puntos (sisas, escote), dejando puntos en espera con hebra de desecho (pulgar de un mitón), tejiendo 4 o más juntos, o pasando la hebra por todos los puntos (cierre de coronilla). Lo único cierto es que, disminuyendo de a 2 o 3 juntos, un tercio es el piso. Recomienda advertencia en todas las formas, sin cambiar el código, y reservar el error para lo que de verdad no se teje: una vuelta sin puntos.

**Opciones.**

- **(a) Bajar `CHART_SHAPING_IMPOSSIBLE` a advertencia.** **Elegida en parte**, por la razón de dominio de arriba, no por la de persistencia. Por sí sola no resuelve el contrato: `CHART_EMPTY` y una vuelta sin puntos siguen siendo errores de lo realmente no tejible, y siguen siendo estados normales mientras se dibuja.
- **(b) Mantener los errores y guardar solo en el respaldo local**, como E3 hacía con `CHART_EMPTY`. El trabajo de varios minutos queda solo en `localStorage` de un dispositivo, `updated_at` no avanza y los conflictos con otra pestaña se descubren tarde, con más trabajo en juego. **Descartada**: el respaldo local es para cortes de conexión, no para el flujo normal de dibujo.
- **(c) Distinguir dos clases de error.** **Elegida**, junto con (a).

**Decisión: (a) + (c).**

1. `CHART_SHAPING_IMPOSSIBLE` pasa a **advertencia** en todas las formas. El código no cambia (no se rompen pruebas ni consumidores). El mensaje dice que no se alcanza **solo disminuyendo** y nombra las alternativas, por ejemplo: "En la vuelta 12 se pasa de 80 a 8 puntos: disminuyendo de a 2 o 3 juntos quedan como mínimo 27. Para llegar a 8 hay que cerrar puntos, dejarlos en espera, tejer 4 o más juntos o pasar la hebra por todos." `CHART_SHAPING_TOO_FAST` se mantiene como regla aparte (entre un tercio y la mitad). Una transición dispara una sola de las dos.
2. `CHART_ROW_EMPTY_FULL` (una vuelta del gráfico completo sin puntos) pasa de advertencia a **error de tejido**: es lo que la experta reserva para error, y el modo tejiendo no puede ofrecer un paso de 0 puntos. `CHART_EMPTY_ROW` ya no se emite (E14): `CHART_ROW_EMPTY_FULL` es el único aviso por fila y su `data` incluye `motifRows` para resaltar las filas del motivo.
3. Se distinguen dos clases de error. La severidad `error` se mantiene (`valid: false`), y se agrega una clasificación:

- **Error estructural**: el documento no es interpretable o rompe un invariante del que dependen las vistas derivadas (índices de lana inexistentes, `cells` de largo distinto a ancho × alto, tamaño o repeticiones fuera de límite, muestra inválida, título fuera de 1 a 120, versión desconocida…). **Bloquea guardar.**
- **Error de tejido**: el documento es estructuralmente sano y todas las vistas derivadas funcionan, pero el patrón no se puede tejer tal cual. **No bloquea guardar el borrador.** Bloquea empezar un proyecto, publicar o compartir, exportar y aceptar una salida de IA.

La clasificación es una **lista cerrada de códigos tolerados en borrador**, en `pattern-core` (única fuente). Todo código que no está en la lista es estructural, así que un error nuevo bloquea guardar hasta que alguien lo clasifique a propósito.

```ts
// validate.ts
/** Errores de tejido: el documento es sano y se puede guardar como borrador, pero no tejer, publicar ni aceptar de la IA (ADR 0003, E10). */
export const DRAFT_ERROR_CODES: readonly string[] = Object.freeze(["CHART_EMPTY", "CHART_ROW_EMPTY_FULL"]);
export function isDraftError(issue: Issue): boolean; // severity === "error" && code ∈ DRAFT_ERROR_CODES

export interface ValidationResult {
  /** true si no hay ningún error. Requisito para tejer, publicar, exportar y aceptar salida de IA. */
  valid: boolean;
  /** true si todos los errores son de tejido (o no hay errores). Requisito para guardar. `valid` implica `savable`. */
  savable: boolean;
  issues: Issue[];
}
```

- `parsePattern` no cambia: sigue exigiendo `valid`.
- `CHART_EMPTY` y `CHART_ROW_EMPTY_FULL` forman la lista. Ninguno rompe un derivado (`stitchTotal` es 0 o positivo, `rowStitchCounts` da ceros en esas filas, `dimensionsCm` en el círculo da ancho 0 si todo está vacío), y vaciar una vuelta o todo el motivo para volver a dibujar es un estado normal del editor. Así desaparece el camino especial de E3 (solo respaldo local) y queda una sola regla.
- Las operaciones de `edit.ts` **nunca producen errores estructurales** (garantía de E2, ahora con prueba de propiedades). Sí pueden producir errores de tejido y advertencias (`CHART_SHAPING_IMPOSSIBLE`, `CHART_SHAPING_TOO_FAST`).
- Con (a), la cuña a medio dibujar ya no es error. La clase "error de tejido" sigue siendo necesaria por las vueltas sin puntos, y prepara la fase 4 (abajo).
- **Invariante de opciones**: ninguna opción de `ValidateOptions` cambia el conjunto de errores; solo agrega o ajusta advertencias e información. Así el cliente y el servidor llegan al mismo `valid` y `savable` aunque pasen opciones distintas (catálogo de fibras, muestra supuesta).
- **Contrato de los derivados**: los derivados de `chart.ts` (y `stitch-render`) se pueden llamar con cualquier documento `savable`, no solo con uno `valid`.
- El flujo de guardado, lo que bloquea cada clase y el impacto en `expectedUpdatedAt` y en las Server Actions de T4 están en la [enmienda E10 del ADR 0006](0006-guardado-de-disenos.md#enmienda-e10-2026-11-06-guardar-borradores-con-errores-de-tejido).
- **Patrones escritos** (fase 4): los descuadres de conteo (`ROUND_COUNT_MISMATCH`, `ROUND_CONSUMPTION_MISMATCH`, `ROUND_ZERO`, `ROUND_RANGE_CHANGES`, `ROUND_NUMBERING`) son candidatos naturales a error de tejido, porque al escribir un amigurumi vuelta a vuelta el documento descuadra todo el tiempo. Se clasifican en el ADR de la fase 4, no ahora.

**Validar con tejedora (T1b)**: el texto del mensaje de `CHART_SHAPING_IMPOSSIBLE` y que una vuelta sin puntos sea error. Si cambia la severidad de una regla, basta con cambiarla en `validate.ts` y, si corresponde, en `DRAFT_ERROR_CODES`; el contrato del guardado no cambia.

**Nota sobre el nombre**: "IMPOSSIBLE" ya no describe la regla ("no se alcanza solo disminuyendo"). Se mantiene para no romper pruebas, casos de dominio ni `data` consumida por la interfaz. Si se renombra, será con un alias en una versión mayor del validador, no en la fase 2.

**Descartado también**: un campo `blocksSave` en cada `Issue`. Cambia un tipo que viaja a la interfaz y a `ai_jobs`, y repite la clasificación en cada problema en vez de tenerla en un solo lugar.

### E11. `validateYarn(input, path = "yarn", opts?)`

**Decisión: aprobar, con el tipo acotado.** Pasar el catálogo de fibras y la paleta es útil para que el formulario de lana avise "No conozco la fibra…" igual que el panel de validación. Solo agrega advertencias, así que cumple el invariante de opciones de E10, y `addYarn` sigue llamándola sin opciones (una fibra desconocida no impide agregar la lana). Pero las demás opciones de `ValidateOptions` (muestra, hebras flotantes) no tienen sentido para una lana suelta:

```ts
export function validateYarn(input: unknown, path?: string, opts?: Pick<ValidateOptions, "fibers" | "paletteIds">): Issue[];
```

Es compatible: quien pase un `ValidateOptions` completo sigue compilando.

### E12. `maxFloatStitches` como tope que se aplica siempre

**Decisión: aprobar.** Es la fórmula de la sección 4, `min(floor(maxFloatCm × puntos en 10 cm / 10), tope)`, con el 5 parametrizado. El sentido anterior ("umbral solo cuando no hay muestra") hacía que el mismo número significara cosas distintas según el documento tuviera o no `gauge`, y permitía que una muestra gruesa subiera el umbral por encima de 5, lo que la sección 4 prohíbe ("el valor nunca crece con el grosor").

- **Impacto en la web**: ninguno. `apps/web` no pasa `maxFloatStitches` ni `maxFloatCm`, y el estudio de la fase 2 no los expone (usa los valores por defecto). Una opción futura de "umbral personal" se diseña como tope, con este sentido.
- **Ajuste**: hoy se acepta cualquier número `≥ 0`, incluidos 0 y valores no enteros (con 0, toda hebra flotante avisa; con 4,5, `data.max` sale con decimales). Debe aceptar solo **enteros ≥ 1**; si no, se usa el 5 por defecto.

### E13. `dimensionsCm` devuelve `ChartDimensions`

**Decisión: confirmado, coincide con el contrato de T2c** (sección 2 y caso 20): `{ widthCm, heightCm, widthIsCircumference }`, con nombre de tipo exportado.

- En el círculo, el ancho sale del máximo de `rowStitchCount`; en plano y tubo, de `width × repeat.x` aunque haya máscara, como dice la sección 1.
- `yoke` devuelve `widthIsCircumference: true`. Es coherente con dibujarlo como tubo en la fase 2. Queda marcado "validar con `experto-tejido`" en el código; se revisa cuando exista la geometría de canesú.
- Un documento `CHART_EMPTY` (ahora guardable, E10) da `widthCm = 0` en el círculo. La interfaz muestra "—" en vez de "0 cm" cuando `stitchTotal` es 0.

### E14. Ajustes aprobados al implementar T2d (2026-11-06)

Aprobados por el orquestador a partir de los pedidos de `experto-tejido` y `qa-tester`:

1. **Un solo aviso por fila vacía.** `CHART_EMPTY_ROW` deja de emitirse. `CHART_ROW_EMPTY_FULL` (error de tejido, uno solo con la lista de filas) trae `data: { count, rows, motifRows }`, con hasta 50 filas del gráfico completo y del motivo. Reemplaza el punto 2 de E10 en lo que respecta a `CHART_EMPTY_ROW`.
2. **`paletteId` que no es texto es error estructural** (`SHAPE` en `yarns[i].color.paletteId`), se pasen o no `paletteIds`. Antes validaba y producía un mensaje con "[object Object]" (QA F4). Cumple el invariante de E10: las opciones no cambian los errores.
3. **Vueltas fuera de rango.** `number` y `through` se validan antes de recorrer los rangos (QA F1 y F3): menor que 1 da `ROUND_NUMBERING`; mayor que `LIMITS.maxRounds`, o rangos que suman más, da `LIMIT`. `LIMITS` vive en `src/limits.ts` (se reexporta desde `validate.ts`; la API no cambia).
4. **Mensajes con la lana.** `CHART_FLOAT_LONG` nombra la lana por su letra según el orden del documento y su color (no por el id interno ni por la nota privada, que no debe aparecer en patrones compartidos).

### E15. Textos libres con tipo y tope (QA F5, 2026-11-06)

Aprobado por el orquestador. Regla de oro 3: una salida de IA con campos de texto mal tipados ya no pasa el validador.

1. `parts[i].name`, `parts[i].finish`, `rounds[j].note`, `yarns[i].note`, `notes[]`, `assembly[]`, `origin.model` y `origin.promptVersion` se revisan por tipo (`SHAPE` con la ruta exacta), con cualquier `origin`.
2. Topes en `src/limits.ts` (puntos de código, como el título): `maxIdLength` 64 (id del patrón, de las partes, `fiber`, `paletteId`; los ids del catálogo miden hasta 20), nombre de parte 80, nota de vuelta, cierre y nota de lana 500, cada nota y paso de armado 2000, hasta 50 elementos por lista, campos de `origin` 100. Exceder da `LIMIT`.
3. Código nuevo `PART_NAME` (estructural): una parte con nombre en blanco o con salto de línea no se guarda. La interfaz (T9) no debe permitir dejarlo vacío.
4. `formatPart` escribe nombre y cierre en una sola línea (un salto de línea pasa a espacio), para que el texto no se reinterprete como otra vuelta al volver a leerlo.
5. Solo `title` tiene restricción en la base (`char_length` 1..120). Los demás topes viven dentro de `document` (jsonb) y los impone el validador en el servidor al guardar (T4); no hace falta replicarlos en columnas.

### Cambios que aplica `motor-patrones` (T2d)

| # | Archivo | Cambio |
|---|---|---|
| C10 | `validate.ts` | `DRAFT_ERROR_CODES`, `isDraftError` y `ValidationResult.savable` (E10). `valid` y `parsePattern` no cambian |
| C10b | `validate.ts` | `CHART_SHAPING_IMPOSSIBLE` pasa a advertencia, con el mensaje nuevo de E10 (alternativas: cerrar, dejar en espera, 4 o más juntos, pasar la hebra). `CHART_ROW_EMPTY_FULL` pasa a error. Quitar el comentario "validar con experto-tejido" de la regla que salta las vueltas sin puntos: queda confirmado (ya hay error por la vuelta vacía) |
| C10c | pruebas | Ajustar las que esperan `valid: false` por 80 → 8 (por ejemplo, `validate-colorwork.test.ts`, caso 8) y las que esperan `CHART_ROW_EMPTY_FULL` como advertencia. Propiedad del caso 8: advertencia `IMPOSSIBLE` si y solo si restantes < ceil(n/3) |
| C11 | `validate.ts` | `validateYarn(input, path?, opts?: Pick<ValidateOptions, "fibers" \| "paletteIds">)` (E11) |
| C12 | `validate.ts` | `maxFloatStitches` solo se acepta si es entero ≥ 1; si no, 5 (E12). Prueba con 0, −1, 4,5 y `NaN` |
| C13 | pruebas | Propiedad: desde un documento `valid`, cualquier secuencia de `paintCells`, `fillRegion`, `resizeMotif`, `setRepeat`, `addYarn`, `removeYarn` y `reorderYarns` deja un documento `savable` (reemplaza a "nunca `CHART_CELL_VALUE`") |
| C14 | pruebas | Propiedad: para todo documento `savable`, los derivados de `chart.ts` no lanzan, `rowStitchCounts` suma `stitchTotal` y `shaping` es consistente. Incluye `CHART_EMPTY`, vueltas sin puntos y cuñas con `CHART_SHAPING_IMPOSSIBLE` |
| C15 | pruebas | Propiedad: los errores de `validatePattern(p, opts)` son los mismos que los de `validatePattern(p)` para opciones aleatorias (invariante de E10) |
| C16 | `README.md` | Ver la lista de diferencias del README abajo |

**Diferencias del README de `pattern-core` con la API final** (las aplica `motor-patrones`; el README es parte del paquete):

1. "Qué valida": `validatePattern` devuelve `{ valid, savable, issues }`. Explicar las dos clases de error, `DRAFT_ERROR_CODES` e `isDraftError`, y qué exige cada flujo (guardar: `savable`; tejer, publicar, exportar e IA: `valid`).
2. En "Qué valida": marcar `CHART_EMPTY` y `CHART_ROW_EMPTY_FULL` como "errores de tejido (no impiden guardar el borrador)"; mover `CHART_SHAPING_IMPOSSIBLE` de errores a advertencias, con su regla ("no se alcanza solo disminuyendo") y sacar `CHART_ROW_EMPTY_FULL` de la lista de advertencias.
3. "Gráfico sin puntos y autoguardado" (hoy dice que `CHART_SHAPING_IMPOSSIBLE` es error y "tiene el mismo tratamiento"): reemplazar el párrafo de E3 (respaldo local y "no lo envía") por la regla de E10. Las filas sin puntos ya no son "advertencias que no impiden guardar": son error de tejido, que tampoco impide guardar. Mencionar que `paintCells`, `resizeMotif` y `setRepeat` pueden producir la advertencia `CHART_SHAPING_IMPOSSIBLE` (en `setRepeat`, por el borde entre repeticiones verticales).
4. "Cuándo puede lanzar": los derivados suponen un documento **`savable`** (sin errores estructurales), no necesariamente `valid`.
5. `ValidateOptions`: `maxFloatStitches` es un tope entero ≥ 1 que se aplica siempre, con o sin muestra. Agregar el invariante: ninguna opción cambia los errores.
6. `validateYarn`: firma con `opts?: Pick<ValidateOptions, "fibers" | "paletteIds">`; solo agrega advertencias.
7. Pruebas: actualizar la descripción de `validate-colorwork.test.ts` y `property-colorwork.test.ts` con C13 a C15.
8. Menor: la tabla de módulos no lista `ParseResult`, `ParsePartOptions`, `Dialect`, `StitchDef`, `ExpandedStitch`, `RoundCount`, `ConcreteRound` ni `PartSummary`, que se exportan. Agregarlos o aclarar que la tabla muestra solo lo principal.

El resto del README coincide con el código: firmas de `edit.ts` con `yarnCount`, `ANCHORS`, `EDIT_LIMITS` derivado de `LIMITS`, `MigrationResult` discriminado, `rowShapingColumns`, `ChartDimensions`, `CHART_MOTIF_TOO_LARGE` y la tabla de validaciones de T2b.
