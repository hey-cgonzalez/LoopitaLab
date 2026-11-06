import { describe, expect, it } from "vitest";
import { NO_STITCH, rowStitchCounts, stitchTotal, validatePattern } from "@loopitalab/pattern-core";
import { colorize, layoutGeometry, visibleCount } from "@loopitalab/stitch-render";
import { devPagesEnabled } from "@/lib/dev-pages";
import { BENCH_GAUGE, crownPattern, diamondsPattern, fpsFromFrames, percentile, summarize } from "@/lib/render-bench";

describe("páginas de desarrollo", () => {
  it("en producción responden 404 salvo con LOOPITA_DEV_PAGES=1", () => {
    expect(devPagesEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(devPagesEnabled({ NODE_ENV: "test" })).toBe(true);
    expect(devPagesEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(devPagesEnabled({ NODE_ENV: "production", LOOPITA_DEV_PAGES: "true" })).toBe(false);
    expect(devPagesEnabled({ NODE_ENV: "production", LOOPITA_DEV_PAGES: "1" })).toBe(true);
  });
});

describe("datos del benchmark", () => {
  it("el diseño de rombos con 10 × 10 repeticiones tiene 40.000 puntos y es válido", () => {
    const p = diamondsPattern(10);
    expect(stitchTotal(p.chart)).toBe(40_000);
    expect(validatePattern(p).valid).toBe(true);
    for (const shape of ["flat", "tube", "circle"] as const) {
      const l = layoutGeometry(p.chart, { gauge: BENCH_GAUGE, shape });
      colorize(l, p.chart);
      expect(l.count).toBe(40_000);
      expect(visibleCount(l)).toBeLessThanOrEqual(40_000);
    }
  });

  it("la copa en cuña baja de 80 a 8 puntos con 8 repeticiones (CA-F3)", () => {
    const p = crownPattern(8);
    const counts = rowStitchCounts(p.chart);
    expect(counts.slice(0, 6)).toEqual([80, 80, 80, 80, 80, 80]);
    expect(counts.slice(6)).toEqual([80, 72, 64, 56, 48, 40, 32, 24, 16, 8]);
    expect(p.chart.cells.includes(NO_STITCH)).toBe(true);
    expect(validatePattern(p).savable).toBe(true);
  });

  it("percentiles por rango más cercano y fps", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(percentile([1, 2, 3, 4], 0.95)).toBe(4);
    expect(Number.isNaN(percentile([], 0.5))).toBe(true);
    const s = summarize([5, 1, 3, Number.NaN]);
    expect(s).toMatchObject({ n: 3, p50: 3, max: 5 });
    expect(fpsFromFrames([0, 16, 32, 48])).toBeCloseTo(62.5);
  });
});
