/**
 * `yarnUsage`: puntos y hebras flotantes por lana (ADR 0008, sección 6 y enmienda T1-1;
 * casos F3-14 a F3-20 de docs/casos-dominio-fase-3.md). Generador con semilla (ADR 0002):
 *   SEED=12345 node --test test/yarn-usage.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_STITCH, SCHEMA_VERSION, fullRow, rowStitchCount, stitchTotal, validatePattern, yarnTotals, yarnUsage, type Chart, type ChartPattern } from "../src/index.ts";
import { yarnA, yarnB, yarnC } from "./support/fixtures.ts";
import { forAll, type Rng } from "./support/property.ts";

const A = 0;
const B = 1;
const C = 2;

function chart(rows: number[][], over: Partial<Chart> = {}): Chart {
  const width = rows[0]!.length;
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

/** Referencia por fuerza bruta: recorre cada fila del gráfico completo con `fullRow`. */
function brute(c: Chart, n: number): { stitches: number[]; floatStitches: number[]; span: number[]; rowsN: number[]; multiK: number[] } {
  const stitches = new Array<number>(n).fill(0);
  const floatStitches = new Array<number>(n).fill(0);
  const span = new Array<number>(n).fill(0);
  const rowsN = new Array<number>(n).fill(0);
  const multiK = new Array<number>(n).fill(0);
  for (let y = 0; y < c.height * c.repeat.y; y++) {
    const row = fullRow(c, y);
    const k = new Map<number, number>();
    const first = new Map<number, number>();
    const last = new Map<number, number>();
    row.forEach((v, i) => {
      if (v < 0 || v >= n) return;
      k.set(v, (k.get(v) ?? 0) + 1);
      if (!first.has(v)) first.set(v, i);
      last.set(v, i);
    });
    for (const [v, kv] of k) stitches[v]! += kv;
    if (k.size < 2) continue;
    for (const [v, kv] of k) {
      const s = c.workedIn === "rounds" ? row.length : last.get(v)! - first.get(v)! + 1;
      floatStitches[v]! += s - kv;
      span[v]! += last.get(v)! - first.get(v)! + 1;
      rowsN[v]! += rowStitchCount(c, y);
      multiK[v]! += kv;
    }
  }
  return { stitches, floatStitches, span, rowsN, multiK };
}

// ------------------------------------------------------------------ Casos

describe("yarnUsage: casos de dominio", () => {
  const f314 = [A, B, ...new Array<number>(10).fill(A)];

  it("caso F3-14: en redondo, fila de 12 puntos A B + 10 A", () => {
    const u = yarnUsage(chart([f314]), 2);
    assert.deepEqual(u.stitches, [11, 1]);
    assert.deepEqual(u.floatStitches, [1, 11]);
  });

  it("caso F3-15: la misma fila en ida y vuelta (no se cuenta de orillo a orillo)", () => {
    const u = yarnUsage(chart([f314], { workedIn: "rows" }), 2);
    assert.deepEqual(u.stitches, [11, 1]);
    assert.deepEqual(u.floatStitches, [1, 0]);
  });

  it("caso F3-16: ida y vuelta, fila B AAAAA B", () => {
    const u = yarnUsage(chart([[B, A, A, A, A, A, B]], { workedIn: "rows" }), 2);
    assert.deepEqual(u.stitches, [5, 2]);
    assert.deepEqual(u.floatStitches, [0, 5]);
  });

  it("caso F3-16: las casillas NO_STITCH no ocupan posición", () => {
    const u = yarnUsage(chart([[B, NO_STITCH, A, NO_STITCH, A, B]], { workedIn: "rows" }), 2);
    assert.deepEqual(u.floatStitches, [0, 2]);
  });

  it("caso F3-17: una fila de una sola lana no suma flotantes, aunque la otra aparezca en otras filas", () => {
    for (const workedIn of ["rounds", "rows"] as const) {
      const u = yarnUsage(chart([[A, A, A, A], [A, B, B, A]], { workedIn }), 2);
      assert.deepEqual(u.stitches, [6, 2]);
      // Solo la fila 1 (dos lanas) aporta.
      assert.deepEqual(u.floatStitches, workedIn === "rounds" ? [2, 2] : [2, 0]);
      assert.deepEqual(yarnUsage(chart([[A, A, A, A]], { workedIn }), 2).floatStitches, [0, 0]);
    }
  });

  it("caso F3-18: tres lanas en redondo, A B C + 9 A", () => {
    const u = yarnUsage(chart([[A, B, C, ...new Array<number>(9).fill(A)]]), 3);
    assert.deepEqual(u.stitches, [10, 1, 1]);
    assert.deepEqual(u.floatStitches, [2, 11, 11]);
  });

  it("caso F3-19: duplicar repeat.y duplica; repeat.x duplica en redondo y en ida y vuelta cuenta el hueco", () => {
    const base = chart([f314]);
    const u = yarnUsage(base, 2);
    const y2 = yarnUsage({ ...base, repeat: { x: 1, y: 2 } }, 2);
    assert.deepEqual(y2.stitches, u.stitches.map((v) => v * 2));
    assert.deepEqual(y2.floatStitches, u.floatStitches.map((v) => v * 2));
    const x2 = yarnUsage({ ...base, repeat: { x: 2, y: 1 } }, 2);
    assert.deepEqual(x2.stitches, [22, 2]);
    assert.deepEqual(x2.floatStitches, [2, 22]);
    // Ida y vuelta: B en 1 y 13, el hueco entre repeticiones flota (13 − 1 + 1 − 2 = 11).
    const rows = { ...base, workedIn: "rows" as const };
    assert.deepEqual(yarnUsage(rows, 2).floatStitches, [1, 0]);
    assert.deepEqual(yarnUsage({ ...rows, repeat: { x: 2, y: 1 } }, 2).floatStitches, [2, 11]);
  });

  it("caso F3-20: la suma de stitches es yarnTotals y stitchTotal", () => {
    const c = chart([[A, B, C, NO_STITCH], [C, C, A, B]], { repeat: { x: 3, y: 5 } });
    const u = yarnUsage(c, 3);
    assert.deepEqual(u.stitches, yarnTotals(c, 3));
    assert.equal(u.stitches.reduce((a, b) => a + b, 0), stitchTotal(c));
  });

  it("caso F3-21 (conteo): gorro de 112 × 60 en damero A B en redondo da 3.360 puntos y 3.360 flotantes por lana", () => {
    const c = chart([[A, B], [B, A]], { repeat: { x: 56, y: 30 } });
    assert.deepEqual(yarnUsage(c, 2), { stitches: [3360, 3360], floatStitches: [3360, 3360] });
  });

  it("caso F3-22 (conteo): bandas de vuelta completa, sin flotantes", () => {
    const c = chart([[A, A], [B, B]], { repeat: { x: 56, y: 30 } });
    assert.deepEqual(yarnUsage(c, 2), { stitches: [3360, 3360], floatStitches: [0, 0] });
  });

  it("bordes: no lanza y devuelve ceros con gráficos dañados o yarnCount inválido", () => {
    const c = chart([[A, B]]);
    assert.deepEqual(yarnUsage(c, 0), { stitches: [], floatStitches: [] });
    assert.deepEqual(yarnUsage(c, Number.NaN), { stitches: [], floatStitches: [] });
    assert.deepEqual(yarnUsage(c, -1), { stitches: [], floatStitches: [] });
    assert.deepEqual(yarnUsage({ ...c, repeat: { x: 0, y: 1 } }, 2), { stitches: [0, 0], floatStitches: [0, 0] });
    assert.deepEqual(yarnUsage({ ...c, width: 1.5 }, 2), { stitches: [0, 0], floatStitches: [0, 0] });
    assert.deepEqual(yarnUsage({ ...c, cells: [] }, 2), { stitches: [0, 0], floatStitches: [0, 0] });
    // Índice fuera de rango: ocupa posición pero no es lana.
    assert.deepEqual(yarnUsage(chart([[A, 9, A]], { workedIn: "rows" }), 2), { stitches: [2, 0], floatStitches: [0, 0] });
    assert.deepEqual(yarnUsage(chart([[A, 9, B, A]], { workedIn: "rows" }), 2).floatStitches, [2, 0]);
  });
});

// ------------------------------------------------------------- Propiedades

const YARNS = [yarnA, yarnB, yarnC];

function genChart(r: Rng): { c: Chart; n: number } {
  const n = r.int(1, 3);
  const width = r.int(1, 12);
  const height = r.int(1, 8);
  const maskP = r.pick([0, 0.1, 0.4]);
  const cells = Array.from({ length: width * height }, () => (r.bool(maskP) ? NO_STITCH : r.int(0, n - 1)));
  return {
    n,
    c: {
      width,
      height,
      cells,
      repeat: { x: r.int(1, 6), y: r.int(1, 4) },
      workedIn: r.pick(["rounds", "rows"] as const),
      renderAs: r.pick(["flat", "tube", "circle", "yoke"] as const),
      direction: r.pick(["bottom_up", "top_down"] as const),
    },
  };
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("yarnUsage: propiedades", () => {
  it("coincide con la referencia por fuerza bruta sobre el gráfico completo", () => {
    forAll("fuerza bruta", genChart, ({ c, n }) => {
      const u = yarnUsage(c, n);
      const b = brute(c, n);
      assert.deepEqual(u.stitches, b.stitches);
      assert.deepEqual(u.floatStitches, b.floatStitches);
    });
  });

  it("stitches es yarnTotals y suma stitchTotal", () => {
    forAll("stitches", genChart, ({ c, n }) => {
      const u = yarnUsage(c, n);
      assert.deepEqual(u.stitches, yarnTotals(c, n));
      assert.equal(sum(u.stitches), stitchTotal(c));
    });
  });

  it("en redondo, float + stitches de las filas con 2 o más lanas = Σ rowStitchCount de esas filas", () => {
    forAll("redondo", genChart, ({ c, n }) => {
      const rc = { ...c, workedIn: "rounds" as const };
      const u = yarnUsage(rc, n);
      const b = brute(rc, n);
      // Puntos de `i` solo en las filas con 2 o más lanas (`multiK`).
      for (let i = 0; i < n; i++) assert.equal(u.floatStitches[i]! + b.multiK[i]!, b.rowsN[i]);
    });
  });

  it("en ida y vuelta, float + stitches de esas filas = Σ (último − primero + 1) y nunca supera a Σ rowStitchCount", () => {
    forAll("ida y vuelta", genChart, ({ c, n }) => {
      const wc = { ...c, workedIn: "rows" as const };
      const u = yarnUsage(wc, n);
      const b = brute(wc, n);
      for (let i = 0; i < n; i++) {
        assert.equal(u.floatStitches[i]! + b.multiK[i]!, b.span[i]);
        assert.ok(b.span[i]! <= b.rowsN[i]!);
      }
    });
  });

  it("el flotante de ida y vuelta nunca supera al de redondo del mismo gráfico, y nunca es negativo", () => {
    forAll("rows <= rounds", genChart, ({ c, n }) => {
      const ro = yarnUsage({ ...c, workedIn: "rounds" }, n).floatStitches;
      const wo = yarnUsage({ ...c, workedIn: "rows" }, n).floatStitches;
      for (let i = 0; i < n; i++) assert.ok(0 <= wo[i]! && wo[i]! <= ro[i]!, `${wo[i]} > ${ro[i]}`);
    });
  });

  it("con una sola lana por fila, floatStitches es 0", () => {
    forAll(
      "una lana por fila",
      (r) => {
        const { c, n } = genChart(r);
        for (let y = 0; y < c.height; y++) {
          const v = r.int(0, n - 1);
          for (let x = 0; x < c.width; x++) if (c.cells[y * c.width + x] !== NO_STITCH) c.cells[y * c.width + x] = v;
        }
        return { c, n };
      },
      ({ c, n }) => assert.ok(yarnUsage(c, n).floatStitches.every((v) => v === 0)),
    );
  });

  it("duplicar repeat.y duplica stitches y floatStitches en los dos modos", () => {
    forAll("repeat.y", genChart, ({ c, n }) => {
      const u = yarnUsage(c, n);
      const d = yarnUsage({ ...c, repeat: { x: c.repeat.x, y: c.repeat.y * 2 } }, n);
      assert.deepEqual(d.stitches, u.stitches.map((v) => v * 2));
      assert.deepEqual(d.floatStitches, u.floatStitches.map((v) => v * 2));
    });
  });

  it("duplicar repeat.x duplica en redondo; en ida y vuelta duplica stitches y floatStitches no decrece (nota F3-19)", () => {
    forAll("repeat.x", genChart, ({ c, n }) => {
      const u = yarnUsage(c, n);
      const d = yarnUsage({ ...c, repeat: { x: c.repeat.x * 2, y: c.repeat.y } }, n);
      assert.deepEqual(d.stitches, u.stitches.map((v) => v * 2));
      if (c.workedIn === "rounds") assert.deepEqual(d.floatStitches, u.floatStitches.map((v) => v * 2));
      else for (let i = 0; i < n; i++) assert.ok(d.floatStitches[i]! >= u.floatStitches[i]!);
    });
  });

  it("no lanza con documentos savable (incluye gráfico vacío y filas vacías)", () => {
    forAll(
      "savable",
      (r): ChartPattern => {
        const { c, n } = genChart(r);
        const mode = r.int(0, 2);
        if (mode === 0) c.cells.fill(NO_STITCH);
        else if (mode === 1) for (let x = 0; x < c.width; x++) c.cells[r.int(0, c.height - 1) * c.width + x] = NO_STITCH;
        return {
          schemaVersion: SCHEMA_VERSION,
          id: "p",
          title: "Prueba",
          technique: "knit",
          kind: "chart",
          yarns: YARNS.slice(0, n).map((y) => structuredClone(y)),
          origin: { kind: "manual" },
          chart: c,
        };
      },
      (p) => {
        assert.equal(validatePattern(p).savable, true);
        const u = yarnUsage(p.chart, p.yarns.length);
        assert.equal(u.stitches.length, p.yarns.length);
        assert.equal(sum(u.stitches), stitchTotal(p.chart));
        assert.ok(u.floatStitches.every((v) => Number.isSafeInteger(v) && v >= 0));
      },
    );
  });
});

describe("yarnUsage: rendimiento", () => {
  it("motivo de 200 × 200 con repeticiones máximas en menos de 50 ms, sin armar el gráfico completo", () => {
    const r = (seed: number) => ((seed * 2654435761) >>> 0) % 32;
    const cells = Array.from({ length: 200 * 200 }, (_, i) => (i % 7 === 0 ? NO_STITCH : r(i)));
    for (const workedIn of ["rounds", "rows"] as const) {
      const c: Chart = { width: 200, height: 200, cells, repeat: { x: 500, y: 500 }, workedIn, renderAs: "tube", direction: "bottom_up" };
      yarnUsage(c, 32);
      const t0 = performance.now();
      const u = yarnUsage(c, 32);
      const ms = performance.now() - t0;
      assert.ok(ms < 50, `tardó ${ms.toFixed(1)} ms`);
      assert.equal(sum(u.stitches), stitchTotal(c));
    }
  });
});
