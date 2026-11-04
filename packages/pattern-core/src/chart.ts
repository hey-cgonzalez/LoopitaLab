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
