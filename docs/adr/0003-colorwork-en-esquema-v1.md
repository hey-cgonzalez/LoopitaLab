# ADR 0003: Estudio de colorwork sobre el esquema v1

- Estado: propuesto (requiere aprobación de la usuaria)
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

Lo marcado con (ET) debe confirmarlo `experto-tejido` antes de implementarse.

- **Coordenadas**:
  - `(x, y)`, con `y = 0` como la primera fila o vuelta que se teje (ya estaba en ADR 0001);
  - `x = 0` es la columna de la izquierda **vista desde el derecho de la labor**, igual que en un gráfico impreso.
  - El documento siempre describe la labor como se ve por el derecho. Nunca se guarda espejada.
- **Orden de lectura (derivado, no guardado)** (ET):
  - en redondo, todas las vueltas de derecha a izquierda;
  - en ida y vuelta, las filas por el derecho (`y` par) de derecha a izquierda y las del revés de izquierda a derecha.
  - Para zurdas (`profiles.dominant_hand = 'left'`) se espeja el orden de lectura en el modo tejiendo y en la ayuda, nunca en el documento.
- **`direction`** (ET):
  - Solo afecta la vista previa, que muestra la pieza como se usa.
  - `bottom_up`: la fila 0 queda abajo.
  - `top_down`: la fila 0 queda arriba y el punto se dibuja invertido.
  - El editor de motivo siempre muestra la fila 1 abajo, como es convención en los gráficos.
  - En el círculo, `direction` decide si la fila 0 es el anillo exterior o el centro (ADR 0005).
- **Repeticiones**:
  - El gráfico completo mide `width × repeat.x` por `height × repeat.y`.
  - Pintar una celda del gráfico completo escribe la celda del motivo `(x mod width, y mod height)`: editar una repetición edita todas.
- **`NO_STITCH`**:
  - Significa que en esa fila no hay punto en esa posición.
  - No es un color de fondo: en plano y tubo se dibuja vacío.
  - El conteo de puntos de una fila es la cantidad de celdas distintas de `NO_STITCH`.
  - La herramienta "sin punto" es distinta del borrador que pinta la lana de fondo.
- **`renderAs`**:
  - Solo afecta la vista; los conteos nunca dependen de él.
  - `yoke` sigue siendo un valor válido por compatibilidad, pero su geometría no está definida.
  - En la fase 2, el editor no ofrece canesú. La vista previa de un documento `yoke` se dibuja como tubo, con un aviso visible.
- **`gauge`**:
  - Sigue siendo opcional.
  - Si falta, las vistas usan una **muestra supuesta**, derivada del grosor de la lana principal (`yarn-catalog`), y la interfaz la marca como "supuesto" (regla de oro 6).
  - La muestra supuesta no se escribe en el documento hasta que la usuaria la confirma.

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

/** Orden de lectura de una fila (ver semántica). */
export function readingDirection(chart: Chart, y: number): "right_to_left" | "left_to_right";
```

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
| `CHART_ROWS_SHAPE` | advertencia | Tubo o círculo con `workedIn: "rows"`: la pieza lleva costura |
| `CHART_ROW_EMPTY_FULL` | advertencia | Una fila del gráfico completo sin puntos (hoy solo se revisa el motivo) |
| Reglas del círculo | ver ADR 0005 | Disminuciones, repeticiones y sentido |

### 5. Migraciones desde el día uno

- Nuevo `migrate.ts`:

  ```ts
  export function migratePattern(input: unknown): { document: unknown; from: number | null; to: number };
  ```

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
