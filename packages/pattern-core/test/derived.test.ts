/**
 * Derivados del gráfico (ADR 0003, sección 2, y ADR 0005) y casos de dominio de
 * docs/casos-dominio-colorwork.md que les corresponden: 1 a 7, el caso 8 positivo, 20
 * (medidas sin máscara; el caso completo está en validate-colorwork.test.ts) y 24.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NO_STITCH,
  cellAt,
  dimensionsCm,
  motifCoord,
  readingDirection,
  rowStitchCount,
  rowStitchCounts,
  shaping,
  stitchTotal,
  validatePattern,
  wornOrientation,
  type Chart,
  type ChartPattern,
} from "../src/index.ts";
import { smallChart } from "./support/fixtures.ts";

const A = 0;
const B = 1;
const _ = NO_STITCH;

/** Gráfico a partir de filas escritas desde la fila 0 (la primera que se teje). */
function chartOf(rows: number[][], over: Partial<Chart> = {}): Chart {
  const width = rows[0]?.length ?? 0;
  return {
    width,
    height: rows.length,
    cells: rows.flat(),
    repeat: { x: 1, y: 1 },
    workedIn: "rounds",
    renderAs: "flat",
    direction: "bottom_up",
    ...over,
  };
}

/** Cuña de `top` puntos que pierde uno por vuelta hasta quedar en `bottom` (máscara alineada a la izquierda). */
function wedge(top: number, bottom: number, over: Partial<Chart> = {}): Chart {
  const rows: number[][] = [];
  for (let n = top; n >= bottom; n--) rows.push(Array.from({ length: top }, (_v, x) => (x < n ? A : _)));
  return chartOf(rows, over);
}

function withChart(chart: Chart): ChartPattern {
  return { ...smallChart(), chart };
}

describe("motifCoord", () => {
  it("lleva el gráfico completo al motivo", () => {
    const { chart } = smallChart(); // 4 × 3, repeat 5 × 2
    assert.deepEqual(motifCoord(chart, 0, 0), { x: 0, y: 0 });
    assert.deepEqual(motifCoord(chart, 5, 1), { x: 1, y: 1 });
    assert.deepEqual(motifCoord(chart, 19, 5), { x: 3, y: 2 });
    assert.deepEqual(motifCoord(chart, 8, 3), { x: 0, y: 0 });
  });

  it("con coordenadas negativas también cae dentro del motivo", () => {
    const { chart } = smallChart();
    assert.deepEqual(motifCoord(chart, -1, -1), { x: 3, y: 2 });
  });
});

describe("lectura y orientación", () => {
  it("caso 1: en redondo, todas las vueltas de derecha a izquierda", () => {
    const chart = chartOf([[A, B], [B, A], [A, A]], { workedIn: "rounds", repeat: { x: 3, y: 2 } });
    for (let y = 0; y < 6; y++) assert.equal(readingDirection(chart, y), "right_to_left");
  });

  it("caso 2: en ida y vuelta, las filas por el derecho de derecha a izquierda y las del revés al revés", () => {
    const chart = chartOf([[A, B], [B, A], [A, A]], { workedIn: "rows" });
    assert.equal(readingDirection(chart, 0), "right_to_left");
    assert.equal(readingDirection(chart, 1), "left_to_right");
    assert.equal(readingDirection(chart, 2), "right_to_left");
  });

  it("caso 3: el espejo invierte los casos 1 y 2 y no cambia el documento", () => {
    const rows = chartOf([[A, B], [B, A], [A, A]], { workedIn: "rows" });
    const rounds = { ...rows, workedIn: "rounds" as const };
    const before = structuredClone(rows);
    assert.equal(readingDirection(rows, 0, { mirror: true }), "left_to_right");
    assert.equal(readingDirection(rows, 1, { mirror: true }), "right_to_left");
    assert.equal(readingDirection(rows, 2, { mirror: true }), "left_to_right");
    for (let y = 0; y < 3; y++) assert.equal(readingDirection(rounds, y, { mirror: true }), "left_to_right");
    // Sin espejo (por ejemplo, una zurda con dominant_hand = 'left' que no lo activa) no cambia nada.
    assert.equal(readingDirection(rows, 0, { mirror: false }), "right_to_left");
    assert.equal(readingDirection(rows, 0, {}), "right_to_left");
    assert.deepEqual(rows, before);
  });

  it("caso 5: top_down es una rotación de 180°, no un espejo vertical", () => {
    // fila 0: A B A · fila 1: A A B
    const chart = chartOf([[A, B, A], [A, A, B]], { direction: "top_down" });
    assert.deepEqual(wornOrientation(chart, 0, 0), { x: 2, y: 1 });
    assert.deepEqual(wornOrientation(chart, 2, 1), { x: 0, y: 0 });
    const seen = (y: number) => [0, 1, 2].map((x) => {
      const s = wornOrientation(chart, x, y);
      return cellAt(chart, s.x, s.y);
    });
    assert.deepEqual(seen(0), [B, A, A]);
    assert.deepEqual(seen(1), [A, B, A]);
    // Un espejo vertical daría A A B en la fila 0 vista.
    assert.notDeepEqual(seen(0), [A, A, B]);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) {
      const once = wornOrientation(chart, x, y);
      assert.deepEqual(wornOrientation(chart, once.x, once.y), { x, y });
    }
  });

  it("bottom_up es la identidad y top_down rota sobre el gráfico completo con repeticiones", () => {
    const chart = chartOf([[A, B, A], [A, A, B]], { repeat: { x: 4, y: 3 } });
    assert.deepEqual(wornOrientation(chart, 5, 4), { x: 5, y: 4 });
    const td = { ...chart, direction: "top_down" as const };
    assert.deepEqual(wornOrientation(td, 0, 0), { x: 11, y: 5 });
    assert.deepEqual(wornOrientation(td, 5, 4), { x: 6, y: 1 });
  });
});

describe("conteos y disminuciones", () => {
  it("caso 6: motivo 5 × 3 con R = 8", () => {
    const chart = chartOf(
      [
        [A, A, A, A, A],
        [A, A, A, A, _],
        [A, A, _, _, _],
      ],
      { repeat: { x: 8, y: 1 }, renderAs: "circle" },
    );
    assert.deepEqual(rowStitchCounts(chart), [40, 32, 16]);
    assert.deepEqual(shaping(chart).map((s) => s.change), [0, -8, -16]);
    assert.deepEqual(shaping(chart).map((s) => s.perRepeat), [0, -1, -2]);
    assert.equal(rowStitchCounts(chart).reduce((a, b) => a + b, 0), 88);
    assert.equal(stitchTotal(chart), 88);
    assert.deepEqual(shaping(chart)[1], { row: 1, stitches: 32, change: -8, perRepeat: -1 });
  });

  it("caso 7 (CA-F3): cuña de 10 a 1 por repetición, R = 8, de 80 a 8", () => {
    const chart = wedge(10, 1, { repeat: { x: 8, y: 1 }, renderAs: "circle" });
    assert.deepEqual(rowStitchCounts(chart), [80, 72, 64, 56, 48, 40, 32, 24, 16, 8]);
    const sh = shaping(chart);
    sh.forEach((s, y) => {
      assert.equal(s.stitches, rowStitchCount(chart, y));
      assert.equal(s.change, y === 0 ? 0 : rowStitchCount(chart, y) - rowStitchCount(chart, y - 1));
      assert.equal(s.perRepeat, y === 0 ? 0 : -1);
    });
    // Con las reglas de forma de T2b activas, la cuña de CA-F3 no las dispara: −1 por
    // repetición y por vuelta, y 16 → 8 deja justo la mitad (8 = ceil(16 / 2)).
    const r = validatePattern(withChart(chart));
    const codes = r.issues.map((i) => i.code);
    for (const code of ["CHART_SHAPING_IMPOSSIBLE", "CHART_SHAPING_TOO_FAST", "CHART_SHAPING_STEEP", "CHART_SHAPING_UNEXPECTED", "CHART_CIRCLE_NOT_CLOSED"]) {
      assert.ok(!codes.includes(code), code);
    }
    assert.equal(r.valid, true);
    // Solo queda la lana B sin usar (información).
    assert.deepEqual(r.issues.filter((i) => i.severity !== "info"), []);
  });

  it("caso 8 positivo: la misma cuña con un salto de 80 a 8 dispara la advertencia CHART_SHAPING_IMPOSSIBLE (E10)", () => {
    // Fila 0: 10 por repetición; fila 1: 1 por repetición (R = 8): 80 → 8, y 8 < ceil(80 / 3) = 27.
    const jump = chartOf([Array.from({ length: 10 }, () => A), Array.from({ length: 10 }, (_v, x) => (x < 1 ? A : _))], { repeat: { x: 8, y: 1 }, renderAs: "circle" });
    assert.deepEqual(rowStitchCounts(jump), [80, 8]);
    const r = validatePattern(withChart(jump));
    const impossible = r.issues.filter((i) => i.code === "CHART_SHAPING_IMPOSSIBLE");
    assert.equal(impossible.length, 1);
    // Desde E10 es advertencia: se teje cerrando puntos, dejándolos en espera o pasando la hebra.
    assert.equal(impossible[0]!.severity, "warning");
    assert.equal(r.valid, true);
    assert.equal(r.savable, true);
  });

  it("rowStitchCount repite la fila del motivo y fuera del gráfico vale 0", () => {
    const { chart } = smallChart(); // 4 × 3 sin máscara, repeat 5 × 2
    assert.equal(rowStitchCount(chart, 0), 20);
    assert.equal(rowStitchCount(chart, 5), 20);
    assert.equal(rowStitchCount(chart, 6), 0);
    assert.equal(rowStitchCount(chart, -1), 0);
    assert.equal(rowStitchCounts(chart).length, 6);
  });

  it("shaping marca aumentos con cambio positivo", () => {
    const chart = chartOf([[A, _, _], [A, A, _], [A, A, A]], { repeat: { x: 8, y: 1 }, direction: "top_down" });
    assert.deepEqual(shaping(chart).map((s) => [s.stitches, s.change, s.perRepeat]), [[8, 0, 0], [16, 8, 1], [24, 8, 1]]);
  });

  it("shaping no devuelve -0", () => {
    const { chart } = smallChart();
    for (const s of shaping(chart)) assert.ok(!Object.is(s.perRepeat, -0) && !Object.is(s.change, -0));
  });
});

describe("medidas", () => {
  it("caso 20 (parte de T2): 20 × 20 con repeat 5 × 1 y muestra de 20 × 28 mide 50 × 7,14 cm", () => {
    const chart = chartOf(Array.from({ length: 20 }, () => new Array<number>(20).fill(A)), { repeat: { x: 5, y: 1 } });
    const d = dimensionsCm(chart, { stitchesPer10cm: 20, rowsPer10cm: 28 });
    assert.ok(Math.abs(d.widthCm - 50) < 1e-9);
    assert.ok(Math.abs(d.heightCm - (20 / 28) * 10) < 1e-9);
    assert.equal(Math.round(d.heightCm * 100) / 100, 7.14);
    assert.equal(d.widthIsCircumference, false);
  });
});

describe("caso 24: renderAs no cambia los conteos", () => {
  it("stitchTotal, rowStitchCounts y shaping son iguales en todas las formas", () => {
    const base = wedge(6, 2, { repeat: { x: 8, y: 1 } });
    const ref = { total: stitchTotal(base), counts: rowStitchCounts(base), sh: shaping(base) };
    for (const renderAs of ["flat", "tube", "circle", "yoke"] as const) {
      const c = { ...base, renderAs };
      assert.equal(stitchTotal(c), ref.total);
      assert.deepEqual(rowStitchCounts(c), ref.counts);
      assert.deepEqual(shaping(c), ref.sh);
    }
  });
});
