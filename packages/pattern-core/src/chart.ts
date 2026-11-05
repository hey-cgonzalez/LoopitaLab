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
 */
export function rowFloats(chart: Chart, y: number): RowFloat[] {
  const row = fullRow(chart, y);
  const n = row.length;
  const positions = new Map<number, number[]>();
  row.forEach((v, i) => {
    const list = positions.get(v);
    if (list) list.push(i);
    else positions.set(v, [i]);
  });
  if (positions.size < 2) return [];
  const out: RowFloat[] = [];
  for (const [yarn, pos] of positions) {
    let longest = 0;
    for (let i = 1; i < pos.length; i++) longest = Math.max(longest, (pos[i] ?? 0) - (pos[i - 1] ?? 0) - 1);
    if (chart.workedIn === "rounds") {
      const first = pos[0] ?? 0;
      const last = pos.at(-1) ?? 0;
      longest = Math.max(longest, n - 1 - last + first);
    }
    out.push({ row: y, yarn, length: longest });
  }
  return out;
}

/** Medidas aproximadas del gráfico completo según la muestra. */
export function dimensionsCm(chart: Chart, gauge: Gauge): { widthCm: number; heightCm: number } {
  const { width, height } = fullSize(chart);
  return {
    widthCm: (width / gauge.stitchesPer10cm) * 10,
    heightCm: (height / gauge.rowsPer10cm) * 10,
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
 * Coordenada del motivo que corresponde a una celda del gráfico completo:
 * `(x mod width, y mod height)`. Editar esa celda edita todas las repeticiones.
 */
export function motifCoord(chart: Chart, x: number, y: number): { x: number; y: number } {
  return { x: mod(x, chart.width), y: mod(y, chart.height) };
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

/** Puntos de cada fila del gráfico completo, de la fila 0 a la última. Su suma es `stitchTotal`. */
export function rowStitchCounts(chart: Chart): number[] {
  const perMotifRow: number[] = [];
  for (let my = 0; my < chart.height; my++) perMotifRow.push(motifRowStitches(chart, my) * chart.repeat.x);
  const total = chart.height * chart.repeat.y;
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
 */
export function readingDirection(chart: Chart, y: number, opts: { mirror?: boolean } = {}): ReadingDirection {
  const rightToLeft = chart.workedIn === "rounds" || mod(y, 2) === 0;
  return rightToLeft !== (opts.mirror === true) ? "right_to_left" : "left_to_right";
}

/**
 * Celda del gráfico completo que se ve en la posición (x, y) de la pieza terminada,
 * como se usa. En `bottom_up` es la identidad; en `top_down` es una rotación de 180°,
 * `(x, y) → (W − 1 − x, H − 1 − y)` sobre el gráfico completo (no un espejo vertical).
 * Aplicarla dos veces devuelve la coordenada original. Solo afecta la vista.
 */
export function wornOrientation(chart: Chart, x: number, y: number): { x: number; y: number } {
  if (chart.direction !== "top_down") return { x, y };
  const { width, height } = fullSize(chart);
  return { x: width - 1 - x, y: height - 1 - y };
}
