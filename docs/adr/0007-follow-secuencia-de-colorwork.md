# ADR 0007: `packages/follow`, secuencia de filas de un gráfico y puntero de avance

- Estado: propuesto (2026-11-09, `arquitecto`). Requiere la aprobación de la usuaria (T0 de la fase 3) y la revisión de dominio de `experto-tejido` (T1) antes de implementarse.
- Fecha: 2026-11-09
- Paquete: `packages/follow` (nuevo)
- Relacionado: [ADR 0001](0001-modelo-canonico.md) (el progreso es un puntero), [ADR 0003](0003-colorwork-en-esquema-v1.md) (orden de lectura, espejo, `top_down`, E10, E18), [ADR 0004](0004-render-de-puntos-2d.md) (`setHighlightRow`), [ADR 0009](0009-tejer-este-diseno-y-proyectos.md) (persistencia del puntero)

## Contexto

La fase 3 adelanta el seguimiento de colorwork fila a fila (decisión de la usuaria del 2026-11-05). El ADR 0001 fija que el progreso de un proyecto **no** está en el patrón: es un puntero sobre una secuencia derivada. Falta definir:

- qué es un "paso" en un gráfico y en qué orden se recorren;
- cómo se representa el puntero, con qué dominio, y cómo se guarda sin redundancia;
- qué datos de cada fila ve la tejedora (lado, sentido de lectura, puntos, cambios de color, disminuciones) sin que la interfaz cuente nada (regla de oro 2, CA-F2);
- qué pasa si cambia la versión fijada del patrón o las reglas del validador;
- cómo se extiende en la fase 6 al amigurumi punto a punto sin rediseñar.

Hechos del código que condicionan la decisión:

- `pattern-core` ya deriva todo lo necesario por fila: `rowStitchCount(s)`, `shaping`, `rowShapingColumns`, `readingDirection(chart, y, { mirror })`, `cellAt`, `fullSize`, `yarnLetter`.
- `chart.cells` guarda la fila 0 como **la primera que se teje** (ADR 0001). `direction` solo cambia la vista (ADR 0003, sección 1): en `top_down` la pieza se ve rotada 180°, pero se teje igual desde la fila 0.
- `stitch-render` resalta por fila del **gráfico completo** (`StitchLayout.row`, `setHighlightRow`), y aplica él mismo la orientación de uso. No hace falta convertir coordenadas.
- El gráfico completo puede tener hasta `200 × 500 = 100.000` filas y hasta `200 × 500 = 100.000` puntos por fila (`LIMITS.maxMotifSide`, `LIMITS.maxRepeat`). La secuencia no se puede materializar entera.
- `project_progress` ya tiene `part_id`, `round_number (≥ 1)` y `stitch_index (≥ 0)`.

## Opciones

### Qué es un paso

1. **Una fila (o vuelta) del gráfico completo.** Pasos = `height × repeat.y`.
2. **Una fila del motivo**, con un contador aparte de repeticiones verticales.
3. **Un punto** (como el amigurumi de la fase 6).

### Cómo se representa el puntero

- **A. Índice de fila del gráfico completo** más un subcontador de puntos tejidos en esa fila.
- **B. Fila del motivo + repetición vertical + repetición horizontal**, guardadas por separado.
- **C. Copia de la fila actual** (lanas y conteos) junto al puntero.

## Decisión

Paso = **opción 1**; puntero = **opción A**. Paquete puro, sin I/O, que depende solo de `pattern-core`.

### 1. Secuencia

- Los pasos son las filas del gráfico completo, `y = 0 … H − 1`, con `H = height × repeat.y`. **Siempre en ese orden**, también en `top_down` y en el círculo: `direction` y `renderAs` cambian la vista, nunca la secuencia (propiedad P7).
- Cada paso se deriva bajo demanda (`stepAt`), en `O(width)` del motivo, sin armar la fila completa. El plan no copia el documento: guarda una referencia al `ChartPattern` y las opciones.
- **Lado** (`side`): en redondo, siempre `"right"`; en ida y vuelta, `y` par es `"right"` y `y` impar es `"wrong"` (ADR 0003: la fila 1 es por el derecho).
- **Sentido de lectura**: `readingDirection(chart, y, { mirror })` de `pattern-core`. No se reimplementa.
- **Espejo**: viene de la preferencia `profiles.mirror_knitting` (desactivada por defecto). Nunca de `dominant_hand`. Cambia el sentido de lectura y el orden de los tramos de color, nunca los conteos (propiedad P5).
- **Tramos de color** (`runs`): la fila **de una repetición horizontal** del motivo, en el orden en que se teje (de derecha a izquierda o al revés, según el sentido), sin las casillas `NO_STITCH`, agrupada en tramos `{ yarn, count }`. La interfaz los muestra como "3 A · 2 B · 3 A, 8 veces". Los tramos **no se fusionan** entre repeticiones (si el motivo empieza y termina con la misma lana, la tejedora ve el borde de la repetición, que es como se lee un gráfico). Pendiente de `experto-tejido`: confirmar esa presentación (T1).
- **Forma**: `stitches`, `change` y `perRepeat` salen de `rowStitchCount` y `shaping`; las columnas donde se pierde o se gana un punto, de `rowShapingColumns`. `follow` no cuenta nada que `pattern-core` ya cuente.
- **Filas sin puntos**: un proyecto solo empieza con un documento `valid` (ADR 0009), así que no debería haberlas. Si una regla nueva del validador hace inválida una versión ya fijada, `follow` igual funciona: acepta todo documento `savable` (como los derivados, ADR 0003, E10) y un paso de 0 puntos se informa con `stitches: 0`.

### 2. Puntero

```ts
/** Puntero de un gráfico. Es todo lo que se guarda del avance (ADR 0001). */
export interface ChartPointer {
  /** Filas terminadas, de 0 a `totalRows`. La fila actual es `rowsDone` (0-based). `rowsDone === totalRows` = terminado. */
  rowsDone: number;
  /** Puntos tejidos de la fila actual, de 0 a `stitches − 1`. Siempre 0 cuando la fila tiene 0 puntos o el proyecto está terminado. */
  stitchesDone: number;
}
```

- **Un entero por eje, sin redundancia.** La fila del motivo, la repetición vertical y la repetición horizontal en curso se **derivan** (`position`), no se guardan: guardarlas duplicaría datos que se pueden contradecir (opción B descartada).
- **Dominio cerrado**: `rowsDone ∈ [0, totalRows]` y `stitchesDone ∈ [0, max(stitches − 1, 0)]`. Completar la última repetición de una fila no deja `stitchesDone = stitches`: pasa a `{ rowsDone + 1, 0 }`. Así cada posición tiene una sola representación.
- **"Terminado"** es `rowsDone === totalRows`. No se agrega un estado aparte. Llegar ahí **propone** marcar el proyecto como `finished` (`projects.status`), no lo fuerza: son datos distintos (la usuaria puede tejer dos piezas iguales con el mismo gráfico).
- **Fase 3**: la interfaz avanza por fila y, opcionalmente, por repetición horizontal (un toque = una repetición). `stitchesDone` siempre queda en múltiplos de `stitchesPerRepeat`. **Fase 6**: el mismo campo permite avanzar punto a punto sin cambiar el tipo.
- **Datos no confiables**: todo puntero que viene de la base o del almacenamiento local pasa por `clampPointer`, que nunca lanza y devuelve un puntero del dominio. Un puntero dañado solo afecta la vista de su dueña (ADR 0009).

### 3. API (contrato que implementa `modo-tejiendo`)

```ts
import type { ChartPattern, ReadingDirection } from "@loopitalab/pattern-core";

export interface FollowOptions {
  /** Preferencia `mirror_knitting` del perfil. Por defecto false. */
  mirror?: boolean;
}

export interface ChartPlan {
  readonly kind: "chart";
  /** Filas o vueltas del gráfico completo (`height × repeat.y`): la cantidad de pasos. */
  readonly totalRows: number;
  /** `stitchTotal(chart)`, para el avance en puntos. */
  readonly totalStitches: number;
  readonly motifHeight: number;
  readonly repeatX: number;
  readonly repeatY: number;
  readonly workedIn: "rounds" | "rows";
  readonly mirror: boolean;
}

export interface ColorRun {
  /** Índice de la lana en `yarns`. La letra la da `yarnLetter` de pattern-core. */
  yarn: number;
  count: number;
}

export interface ChartStep {
  /** Fila del gráfico completo (0-based). Es el índice del paso y el argumento de `setHighlightRow`. */
  row: number;
  /** Número visible (1-based), el mismo que numera el gráfico. */
  number: number;
  /** Fila del motivo (0-based) y repetición vertical (0-based). */
  motifRow: number;
  verticalRepeat: number;
  side: "right" | "wrong";
  reading: ReadingDirection;
  /** De `rowStitchCount`. */
  stitches: number;
  /** `stitches / repeatX`: puntos de la fila del motivo. */
  stitchesPerRepeat: number;
  /** De `shaping`: cambio respecto de la fila anterior y por repetición. */
  change: number;
  perRepeat: number;
  /** De `rowShapingColumns`: columnas del motivo (ascendentes). */
  decreaseColumns: readonly number[];
  increaseColumns: readonly number[];
  /** Lanas de la fila, en el orden en que aparecen al tejerla. */
  yarns: readonly number[];
  /** Tramos de una repetición horizontal, en el orden en que se tejen. */
  runs: readonly ColorRun[];
}

export interface ChartPosition {
  step: ChartStep | null;      // null si está terminado
  finished: boolean;
  /** Repetición horizontal en curso (0-based) y su rango de columnas del gráfico completo, para resaltarla en la cuadrícula. */
  horizontalRepeat: { index: number; of: number; xStart: number; xEnd: number } | null;
  verticalRepeat: { index: number; of: number };
  rowsDone: number;
  totalRows: number;
  stitchesDone: number;        // del proyecto completo: filas terminadas + puntos de la fila actual
  totalStitches: number;
}

export function planChart(pattern: ChartPattern, opts?: FollowOptions): ChartPlan;
export function stepAt(plan: ChartPlan, row: number): ChartStep | null; // null fuera de rango; nunca lanza
export function startPointer(): ChartPointer;                           // { rowsDone: 0, stitchesDone: 0 }
export function clampPointer(plan: ChartPlan, input: unknown): ChartPointer;
export function isFinished(plan: ChartPlan, p: ChartPointer): boolean;
export function position(plan: ChartPlan, p: ChartPointer): ChartPosition;

export function nextRow(plan: ChartPlan, p: ChartPointer): ChartPointer;    // { rowsDone + 1, 0 }, tope en terminado
export function prevRow(plan: ChartPlan, p: ChartPointer): ChartPointer;    // con stitchesDone > 0 vuelve al inicio de la fila; si no, { rowsDone − 1, 0 }
export function nextRepeat(plan: ChartPlan, p: ChartPointer): ChartPointer; // suma stitchesPerRepeat; la última repetición pasa a la fila siguiente
export function prevRepeat(plan: ChartPlan, p: ChartPointer): ChartPointer;

export interface RemapResult {
  pointer: ChartPointer;
  /** La fila quedó fuera del plan nuevo y se acotó. */
  clamped: boolean;
  /** La fila actual cambió de contenido (tramos, puntos o lado) entre los dos planes. */
  rowChanged: boolean;
}
/** Lleva un puntero de un plan a otro (cambio de versión fijada). Conserva `rowsDone` acotado; `stitchesDone` vuelve a 0. */
export function remapPointer(from: ChartPlan, to: ChartPlan, p: ChartPointer): RemapResult;
```

- **Todas puras**: no mutan, no lanzan, no leen el reloj ni el almacenamiento.
- **Lo que no está en `follow`**: el códec a columnas de la base (`round_number`, `stitch_index`) vive en la capa de aplicación de `apps/web` (ADR 0009), porque el dominio no conoce nombres de columnas. Los textos ("Vuelta 12, por el derecho, de derecha a izquierda") los arma la interfaz con el glosario; `follow` entrega datos.
- **Dependencias**: solo `@loopitalab/pattern-core`. Sin `yarn-catalog` (los nombres de color los inyecta quien llama, como `DescribeOptions` en `pattern-render`). Misma convención que el núcleo: TypeScript sin compilar, `exports` a `src/index.ts`, `node:test`, generador de propiedades con semilla (ADR 0002). `apps/web` lo agrega a `transpilePackages`.

### 4. Propiedades obligatorias (CLAUDE.md: toda función de `follow` tiene propiedades)

Con documentos `savable` aleatorios (incluidas máscaras, cuñas, `repeat` hasta 10 × 10, ida y vuelta y en redondo, con y sin espejo):

| # | Propiedad |
|---|---|
| P1 | `plan.totalRows === height × repeat.y === rowStitchCounts(chart).length` |
| P2 | Para toda fila, `stepAt(plan, r).stitches === rowStitchCount(chart, r)`, y la suma es `stitchTotal(chart) === plan.totalStitches` |
| P3 | `Σ runs.count × repeatX === stitches`; ningún tramo tiene `count = 0`; dos tramos seguidos nunca tienen la misma lana |
| P4 | `side` y `reading` coinciden con `readingDirection` y la paridad de `y` (ADR 0003); en redondo, `side` siempre es `"right"` |
| P5 | Con espejo, los tramos son los mismos en orden inverso; `stitches`, `change`, `yarns` como conjunto y las columnas no cambian |
| P6 | `change`, `perRepeat`, `decreaseColumns` e `increaseColumns` coinciden con `shaping` y `rowShapingColumns` |
| P7 | Cambiar `renderAs` o `direction` no cambia ningún paso |
| P8 | Desde `startPointer()`, `nextRow` aplicado `totalRows` veces llega a terminado, y una vez más no cambia nada |
| P9 | `prevRow(nextRow(p)) === p` para todo `p` con `stitchesDone = 0` y no terminado; `nextRow(prevRow(p)) === p` para todo `p` con `stitchesDone = 0` y `rowsDone > 0` |
| P10 | `prevRepeat(nextRepeat(p)) === p` y `nextRepeat(prevRepeat(p)) === p` en los bordes de repetición (fuera del inicio y del final) |
| P11 | Desde el inicio, `nextRepeat` llega a terminado en exactamente `Σ_filas (stitches > 0 ? repeatX : 1)` llamadas |
| P12 | `clampPointer` es idempotente, acepta cualquier valor (`null`, texto, `NaN`, negativos, enormes) y toda operación devuelve punteros que `clampPointer` deja igual |
| P13 | `position(plan, p).stitchesDone` es la suma de `rowStitchCount` de las filas terminadas más `p.stitchesDone`, y es monótona en `nextRow` y `nextRepeat` |
| P14 | `remapPointer(plan, plan, p)` devuelve `p` sin cambios; el resultado siempre está acotado al plan nuevo |
| P15 | `horizontalRepeat` cubre exactamente `width` columnas del gráfico completo y, en el orden de lectura, la primera repetición es la de la derecha sin espejo y la de la izquierda con espejo |

Rendimiento (guardia en Node, como CA-P5): `stepAt` en un motivo de 200 de ancho tarda menos de 1 ms, y `planChart` no depende de `repeat.y` (no recorre las filas del gráfico completo).

### 5. Versión fijada y cambios del modelo

- **La versión fijada no cambia**: `pattern_versions` es inmutable. El proyecto sigue la versión que fijó al empezar (ADR 0009). Editar el diseño después no mueve el puntero ni cambia los pasos.
- **Pasar a otra versión** es una acción explícita de la usuaria (ADR 0009). `remapPointer` conserva el número de fila (acotado) y vuelve `stitchesDone` a 0. Si la fila actual cambió de contenido o se acotó, la interfaz lo dice antes de confirmar. No se intenta "encontrar la misma fila" por contenido: sería heurístico y podría saltar filas sin que se note.
- **Reglas del validador que cambian**: la versión fijada se vuelve a validar al abrir el proyecto. Si ya no es `valid` (por una regla nueva), se puede seguir tejiendo con un aviso; si no es `savable` (no debería ocurrir), no se muestra y se explica.
- **Migraciones del esquema** (`schemaVersion` 2 en adelante): toda migración de `migratePattern` que cambie la secuencia de pasos de un documento (por ejemplo, secciones banda + copa) **debe** venir con su migración de puntero en `follow` (`migratePointer(fromVersion, toVersion, plan, p)`), con prueba de propiedades. Una migración que no cambia la secuencia no necesita nada.

### 6. Extensión en la fase 6 (sin implementar ahora)

- `WrittenPlan` y `WrittenPointer { partId, rowsDone, stitchesDone }` para patrones escritos, derivados de `expandRound`. `Plan = ChartPlan | WrittenPlan` discriminado por `kind`.
- El puntero de un gráfico no cambia de forma: `stitchesDone` ya admite avanzar punto a punto.

## Alternativas descartadas

- **Paso = fila del motivo (opción 2)**: obliga a guardar y sincronizar dos contadores, y la numeración ya no coincide con la del gráfico completo que imprime `pattern-render`. La fila del motivo se muestra igual, como dato derivado.
- **Paso = punto (opción 3) en la fase 3**: una fila de colorwork puede tener 100.000 puntos; avanzar punto a punto no es el uso real del colorwork y triplica la frecuencia de escritura. El campo `stitchesDone` lo deja abierto para la fase 6.
- **Puntero con repeticiones guardadas (opción B)**: redundante y contradecible.
- **Copia de la fila en el progreso (opción C)**: viola la regla de oro 1 y el ADR 0001.
- **Recorrer las filas en el orden de la vista en `top_down`**: confunde "cómo se ve" con "cómo se teje"; el ADR 0001 fija que la fila 0 es la primera que se teje.
- **Fusionar tramos entre repeticiones**: da números que no se ven en el gráfico ("5 A" donde el gráfico muestra 2 + 3) y complica la propiedad P3. Si las tejedoras lo piden, se agrega como opción de presentación sin cambiar el contrato.
- **Generar la secuencia completa en un arreglo**: hasta 100.000 pasos por proyecto en cada carga, sin necesidad.

## Consecuencias

- La pantalla "Tejiendo" resalta la misma fila en la cuadrícula y en la vista previa (`setHighlightRow(step.row)`), sin conversiones.
- Ningún conteo del modo tejiendo se calcula en `apps/web` (extiende CA-F2).
- `modo-tejiendo` implementa el paquete con las propiedades P1 a P15; `qa-tester` las revisa con opus (complejidad alta).
- `experto-tejido` revisa (T1) y aprueba (cierre): orden de lectura con y sin espejo, presentación de los tramos por repetición, la regla de "terminado", y los textos de lado y sentido. Las tejedoras lo validan (T1b de la fase 3).
