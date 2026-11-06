/**
 * Datos sintéticos y estadística del benchmark de la vista previa (`/dev/render-benchmark`).
 * Puro: se prueba con Vitest. Los conteos de puntos salen de `pattern-core`.
 */
import { NO_STITCH, newChartPattern, type ChartPattern, type Yarn } from "@loopitalab/pattern-core";
import { PALETTE } from "@loopitalab/yarn-catalog";

function paletteHex(id: string, fallback: string): string {
  return PALETTE.find((c) => c.id === id)?.hex ?? fallback;
}

/** Lanas del benchmark: colores de la paleta propia, sin marcas. */
export function benchYarns(): Yarn[] {
  const mk = (id: string, paletteId: string, fallback: string, fiber: string): Yarn => ({
    id,
    weight: 3,
    composition: [{ fiber, percent: 100 }],
    color: { hex: paletteHex(paletteId, fallback), paletteId },
  });
  return [mk("A", "crudo", "#E9DDBE", "lana"), mk("B", "rojo", "#BA222C", "lana"), mk("C", "azul-marino", "#1A2540", "alpaca"), mk("D", "mostaza", "#CFA02A", "seda")];
}

export const BENCH_GAUGE = { stitchesPer10cm: 22, rowsPer10cm: 30 } as const;

/** Motivo de 20 × 20 con rombos en 3 lanas. Con repeticiones de 10 × 10 son 40.000 puntos (CA-P5). */
export function diamondsPattern(repeat = 10, renderAs: "flat" | "tube" | "circle" = "flat"): ChartPattern {
  const p = newChartPattern({
    id: "bench-40k",
    title: "Rombos (benchmark)",
    width: 20,
    height: 20,
    repeat: { x: repeat, y: repeat },
    workedIn: "rounds",
    renderAs,
    direction: "bottom_up",
    yarns: benchYarns(),
    gauge: { ...BENCH_GAUGE },
  });
  const cells = p.chart.cells.slice();
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 20; x++) {
      const d = Math.abs(x - 9.5) + Math.abs(y - 9.5);
      const band = Math.floor(d) % 6;
      cells[y * 20 + x] = y === 0 || y === 19 ? 2 : band === 0 ? 1 : band === 3 ? 2 : band === 5 && (x + y) % 2 === 0 ? 3 : 0;
    }
  return { ...p, chart: { ...p.chart, cells } };
}

/**
 * Copa de gorro en cuña (CA-F3): 8 repeticiones; 6 vueltas rectas de 10 puntos por
 * repetición y luego 1 disminución por repetición en cada vuelta hasta 1 punto.
 */
export function crownPattern(repeats = 8): ChartPattern {
  const w = 10;
  const straight = 6;
  const h = straight + w;
  const p = newChartPattern({
    id: "bench-copa",
    title: "Copa en cuña (benchmark)",
    width: w,
    height: h,
    repeat: { x: repeats, y: 1 },
    workedIn: "rounds",
    renderAs: "circle",
    direction: "bottom_up",
    yarns: benchYarns(),
    gauge: { ...BENCH_GAUGE },
  });
  const cells = p.chart.cells.slice();
  for (let y = 0; y < h; y++) {
    const n = y < straight ? w : w - (y - straight);
    for (let x = 0; x < w; x++) {
      if (x >= n) cells[y * w + x] = NO_STITCH;
      else if (y < 2) cells[y * w + x] = 2;
      else if (y < straight) cells[y * w + x] = (x + y) % 4 === 0 ? 1 : 0;
      else cells[y * w + x] = x === 0 ? 2 : x === n - 1 ? 3 : y % 3 === 0 ? 1 : 0;
    }
  }
  return { ...p, chart: { ...p.chart, cells } };
}

export interface Summary {
  n: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

/** Percentil por el método del rango más cercano (`ceil(p · n)`), como en los criterios CA-P1 a CA-P3. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(p * sorted.length)));
  return sorted[rank - 1] as number;
}

export function summarize(samples: readonly number[]): Summary {
  const s = [...samples].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const mean = s.length ? s.reduce((a, b) => a + b, 0) / s.length : Number.NaN;
  return { n: s.length, p50: percentile(s, 0.5), p95: percentile(s, 0.95), max: s.length ? (s[s.length - 1] as number) : Number.NaN, mean };
}

/** fps a partir de los instantes de cada frame (ms). */
export function fpsFromFrames(times: readonly number[]): number {
  if (times.length < 2) return Number.NaN;
  const span = (times[times.length - 1] as number) - (times[0] as number);
  return span > 0 ? ((times.length - 1) * 1000) / span : Number.NaN;
}
