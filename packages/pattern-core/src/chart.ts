import { NO_STITCH, type Chart, type Gauge } from "./types.ts";

/** Índice en `cells` de la celda (x, y) del motivo. Fila 0 = primera que se teje. */
export function cellIndex(chart: Chart, x: number, y: number): number {
  return y * chart.width + x;
}

/** Valor de la celda del motivo. */
export function motifCell(chart: Chart, x: number, y: number): number {
  return chart.cells[cellIndex(chart, x, y)] ?? NO_STITCH;
}

/** Tamaño del gráfico completo con repeticiones. */
export function fullSize(chart: Chart): { width: number; height: number } {
  return { width: chart.width * chart.repeat.x, height: chart.height * chart.repeat.y };
}

/** Celda del gráfico completo (con repeticiones) en la posición (x, y). */
export function cellAt(chart: Chart, x: number, y: number): number {
  return motifCell(chart, x % chart.width, y % chart.height);
}

/** Fila del gráfico completo como lista de lanas, sin las celdas fuera de forma. */
export function fullRow(chart: Chart, y: number): number[] {
  const row: number[] = [];
  const { width } = fullSize(chart);
  for (let x = 0; x < width; x++) {
    const v = cellAt(chart, x, y);
    if (v !== NO_STITCH) row.push(v);
  }
  return row;
}

/** Puntos por lana (índice en `yarns`) en el gráfico completo. */
export function yarnTotals(chart: Chart, yarnCount: number): number[] {
  const motif = new Array<number>(yarnCount).fill(0);
  for (const v of chart.cells) if (v >= 0 && v < yarnCount) motif[v] = (motif[v] ?? 0) + 1;
  const times = chart.repeat.x * chart.repeat.y;
  return motif.map((n) => n * times);
}

/** Total de puntos del gráfico completo (sin contar celdas fuera de forma). */
export function stitchTotal(chart: Chart): number {
  let n = 0;
  for (const v of chart.cells) if (v !== NO_STITCH) n++;
  return n * chart.repeat.x * chart.repeat.y;
}

export interface RowFloat {
  /** Fila del gráfico completo (0 = primera que se teje). */
  row: number;
  yarn: number;
  /** Hebra flotante más larga de esa lana en la fila, en puntos. */
  length: number;
}

/**
 * Hebra flotante más larga de cada lana en una fila de colorwork.
 * Una hebra flota mientras se tejen puntos de otro color. En redondo, la fila es
 * circular: el tramo entre el último y el primer uso de la lana también cuenta.
 *
 * Se calcula sobre la fila del motivo (sin `NO_STITCH`), sin armar la fila completa:
 * entre dos repeticiones seguidas, y al cerrar la vuelta en redondo, el tramo es el
 * mismo (`puntos − 1 − último + primero`). El resultado es igual al de recorrer
 * `fullRow`, en el orden en que cada lana aparece por primera vez.
 */
export function rowFloats(chart: Chart, y: number): RowFloat[] {
  if (!Number.isInteger(y)) return [];
  const my = y % chart.height;
  if (!(my >= 0)) return [];
  const row: number[] = [];
  const start = my * chart.width;
  for (let x = 0; x < chart.width; x++) {
    const v = chart.cells[start + x] ?? NO_STITCH;
    if (v !== NO_STITCH) row.push(v);
  }
  const k = row.length;
  const first = new Map<number, number>();
  const last = new Map<number, number>();
  const longest = new Map<number, number>();
  for (let i = 0; i < k; i++) {
    const v = row[i] as number;
    const prev = last.get(v);
    if (prev === undefined) {
      first.set(v, i);
      longest.set(v, 0);
    } else longest.set(v, Math.max(longest.get(v) ?? 0, i - prev - 1));
    last.set(v, i);
  }
  if (first.size < 2) return [];
  // El tramo cíclico existe entre repeticiones (repeat.x > 1) o al cerrar la vuelta.
  const cyclic = chart.workedIn === "rounds" || chart.repeat.x > 1;
  const out: RowFloat[] = [];
  for (const [yarn, f] of first) {
    let length = longest.get(yarn) ?? 0;
    if (cyclic) length = Math.max(length, k - 1 - (last.get(yarn) ?? 0) + f);
    out.push({ row: y, yarn, length });
  }
  return out;
}

export interface ChartDimensions {
  /** Ancho en cm; en tubo, círculo y canesú es la circunferencia (`widthIsCircumference`). */
  widthCm: number;
  heightCm: number;
  /** true en tubo, círculo y canesú: la interfaz rotula el ancho como "circunferencia". */
  widthIsCircumference: boolean;
}

/**
 * Medidas aproximadas del gráfico completo según la muestra (ADR 0003, sección 1).
 * - Plano: el ancho es `width × repeat.x` puntos, aunque haya `NO_STITCH`.
 * - Tubo (y canesú, que en la fase 2 se dibuja como tubo): el mismo ancho, rotulado
 *   como circunferencia.
 * - Círculo: la circunferencia sale de la vuelta con más puntos (máximo de
 *   `rowStitchCount`), no del ancho del gráfico: las casillas `NO_STITCH` no existen
 *   en la prenda.
 * El alto siempre es la cantidad de filas o vueltas del gráfico completo. No valida la
 * muestra: con 0 puntos en 10 cm da `Infinity` (el validador rechaza esa muestra).
 */
export function dimensionsCm(chart: Chart, gauge: Gauge): ChartDimensions {
  const { width, height } = fullSize(chart);
  const round = chart.renderAs === "tube" || chart.renderAs === "circle" || chart.renderAs === "yoke"; // validar con experto-tejido (canesú)
  let stitches = width;
  if (chart.renderAs === "circle") {
    stitches = 0;
    for (let my = 0; my < chart.height; my++) stitches = Math.max(stitches, motifRowStitches(chart, my) * chart.repeat.x);
  }
  return {
    widthCm: (stitches / gauge.stitchesPer10cm) * 10,
    heightCm: (height / gauge.rowsPer10cm) * 10,
    widthIsCircumference: round,
  };
}

/** Largo en cm de una hebra flotante según la muestra. */
export function floatLengthCm(stitches: number, gauge: Gauge): number {
  return (stitches / gauge.stitchesPer10cm) * 10;
}

// ------------------------------------------------- Derivados (ADR 0003 y 0005)

/** Módulo siempre positivo, para coordenadas negativas. */
const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * Coordenada fuera del motivo que devuelven `motifCoord` y `wornOrientation` cuando
 * `x` o `y` no son enteros (NaN, Infinity, 1,5…). Leer esa celda con `motifCell` da
 * `NO_STITCH`, igual que `rowStitchCount` da 0 fuera del gráfico.
 */
const NOWHERE = { x: -1, y: -1 } as const;
const isIntCoord = (x: number, y: number) => Number.isInteger(x) && Number.isInteger(y);

/**
 * Coordenada del motivo que corresponde a una celda del gráfico completo:
 * `(x mod width, y mod height)`. Editar esa celda edita todas las repeticiones.
 *
 * Contrato de bordes: cualquier entero (negativo o mayor que el gráfico) cae dentro del
 * motivo. Si `x` o `y` no son enteros (NaN, ±Infinity, no enteros) devuelve
 * `{ x: -1, y: -1 }`, que está fuera del motivo.
 */
export function motifCoord(chart: Chart, x: number, y: number): { x: number; y: number } {
  if (!isIntCoord(x, y)) return { ...NOWHERE };
  // `+ 0` evita -0.
  return { x: mod(x, chart.width) + 0, y: mod(y, chart.height) + 0 };
}

/** Puntos de una fila del motivo (celdas distintas de `NO_STITCH`). */
function motifRowStitches(chart: Chart, my: number): number {
  let n = 0;
  const start = my * chart.width;
  for (let x = 0; x < chart.width; x++) if ((chart.cells[start + x] ?? NO_STITCH) !== NO_STITCH) n++;
  return n;
}

/**
 * Puntos de la fila `y` del gráfico completo (sin `NO_STITCH`). Es `repeat.x` por
 * los puntos de la fila del motivo. Fuera del gráfico completo devuelve 0.
 * Nunca depende de `renderAs` (ADR 0003).
 */
export function rowStitchCount(chart: Chart, y: number): number {
  if (!Number.isInteger(y) || y < 0 || y >= chart.height * chart.repeat.y) return 0;
  return motifRowStitches(chart, y % chart.height) * chart.repeat.x;
}

/**
 * Puntos de cada fila del gráfico completo, de la fila 0 a la última. Su suma es `stitchTotal`.
 * Con un alto o repeticiones que no son enteros de 1 o más (gráfico dañado) devuelve `[]`.
 */
export function rowStitchCounts(chart: Chart): number[] {
  const total = chart.height * chart.repeat.y;
  if (!Number.isSafeInteger(total) || total < 1 || !Number.isInteger(chart.height)) return [];
  const perMotifRow: number[] = [];
  for (let my = 0; my < chart.height; my++) perMotifRow.push(motifRowStitches(chart, my) * chart.repeat.x);
  const out = new Array<number>(total);
  for (let y = 0; y < total; y++) out[y] = perMotifRow[y % chart.height] ?? 0;
  return out;
}

export interface RowShaping {
  /** Fila del gráfico completo. */
  row: number;
  stitches: number;
  /** Diferencia con la fila anterior (negativo = disminuciones). En la fila 0 es 0. */
  change: number;
  /** `change / repeat.x`: disminuciones o aumentos por repetición. */
  perRepeat: number;
}

/**
 * Forma derivada de la máscara (ADR 0005): por fila, puntos, cambio respecto de la
 * fila anterior y cambio por repetición. Como cada fila tiene `repeat.x` veces los
 * puntos de la fila del motivo, `perRepeat` siempre es entero.
 */
export function shaping(chart: Chart): RowShaping[] {
  const counts = rowStitchCounts(chart);
  return counts.map((stitches, row) => {
    const change = row === 0 ? 0 : stitches - (counts[row - 1] ?? 0);
    // `+ 0` evita -0 cuando no hay cambio.
    return { row, stitches, change, perRepeat: change / chart.repeat.x + 0 };
  });
}

export type ReadingDirection = "right_to_left" | "left_to_right";

/**
 * Orden de lectura de la fila `y` (ADR 0003). Depende solo de `workedIn`, de `y` y del
 * espejo; nunca de `renderAs`, `direction` ni las lanas.
 * - En redondo, todas las vueltas de derecha a izquierda.
 * - En ida y vuelta, `y` par (por el derecho) de derecha a izquierda e `y` impar
 *   (por el revés) de izquierda a derecha. La fila 1 (`y = 0`) siempre es por el derecho.
 * - `mirror` (preferencia `mirror_knitting` del perfil) invierte el resultado. Es solo
 *   una vista: el documento nunca cambia. No se deriva de `dominant_hand`.
 * - Si `y` no es entero, se trata como una fila por el derecho (`right_to_left` sin
 *   espejo). Nunca lanza y siempre devuelve uno de los dos valores.
 */
export function readingDirection(chart: Chart, y: number, opts: { mirror?: boolean } = {}): ReadingDirection {
  // Contrato de bordes: un `y` que no es entero (NaN, ±Infinity, 1,5) se lee como una
  // fila por el derecho, igual que la fila 1. Un entero negativo sigue la paridad.
  const rightToLeft = chart.workedIn === "rounds" || !Number.isInteger(y) || mod(y, 2) === 0;
  return rightToLeft !== (opts.mirror === true) ? "right_to_left" : "left_to_right";
}

/**
 * Celda del gráfico completo que se ve en la posición (x, y) de la pieza terminada,
 * como se usa. En `bottom_up` es la identidad; en `top_down` es una rotación de 180°,
 * `(x, y) → (W − 1 − x, H − 1 − y)` sobre el gráfico completo (no un espejo vertical).
 * Aplicarla dos veces devuelve la coordenada original. Solo afecta la vista.
 *
 * Contrato de bordes: con enteros fuera del gráfico aplica la misma fórmula (sigue
 * siendo involutiva). Si `x` o `y` no son enteros devuelve `{ x: -1, y: -1 }`, como
 * `motifCoord`.
 */
export function wornOrientation(chart: Chart, x: number, y: number): { x: number; y: number } {
  if (!isIntCoord(x, y)) return { ...NOWHERE };
  if (chart.direction !== "top_down") return { x, y };
  const { width, height } = fullSize(chart);
  return { x: width - 1 - x, y: height - 1 - y };
}

export interface RowShapingColumns {
  /** Fila del gráfico completo. */
  row: number;
  /** Columnas del motivo (0 … width − 1, ascendentes) con `NO_STITCH` en `row` y punto en `row − 1`. */
  decreases: number[];
  /** Columnas del motivo con punto en `row` y `NO_STITCH` en `row − 1`. */
  increases: number[];
}

/**
 * Columnas donde se pierde o se gana un punto en la fila `y` del gráfico completo
 * (ADR 0003, enmienda E8). La fila anterior se lee en el gráfico completo, así que en
 * el borde entre dos repeticiones verticales se compara con la última fila del motivo.
 * Devuelve columnas del **motivo**: la interfaz las marca en cada repetición con
 * `motifCoord`, sin contar.
 *
 * En la fila 0, fuera del gráfico o con `y` no entero, las dos listas van vacías.
 * Cumple `shaping(chart)[y].change === repeat.x × (increases.length − decreases.length)`.
 *
 * La columna marcada es la del punto que desaparece, no necesariamente donde se teje la
 * disminución (un "2 juntos" toma esa columna y una vecina).
 */
export function rowShapingColumns(chart: Chart, y: number): RowShapingColumns {
  const out: RowShapingColumns = { row: y, decreases: [], increases: [] };
  const { width: w, height: h } = chart;
  if (!Number.isInteger(y) || y <= 0 || y >= h * chart.repeat.y) return out;
  const cur = (y % h) * w;
  const prev = ((y - 1) % h) * w;
  for (let x = 0; x < w; x++) {
    const now = (chart.cells[cur + x] ?? NO_STITCH) !== NO_STITCH;
    const before = (chart.cells[prev + x] ?? NO_STITCH) !== NO_STITCH;
    if (before && !now) out.decreases.push(x);
    else if (!before && now) out.increases.push(x);
  }
  return out;
}
