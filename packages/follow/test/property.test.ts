/**
 * Propiedades P1 a P16 del ADR 0007 (con la enmienda T1-3) con el generador con semilla
 * (ADR 0002). Documentos `savable` aleatorios: máscaras, cuñas, filas vacías, `repeat`
 * hasta 10 × 10, ida y vuelta y en redondo, con y sin espejo.
 *   SEED=12345 node --test test/property.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NO_STITCH,
  readingDirection,
  rowShapingColumns,
  rowStitchCount,
  rowStitchCounts,
  shaping,
  stitchTotal,
  validatePattern,
  type Chart,
  type ChartPattern,
  type RenderShape,
} from "@loopitalab/pattern-core";
import {
  clampPointer,
  isFinished,
  nextRepeat,
  nextRow,
  planChart,
  position,
  prevRepeat,
  prevRow,
  remapPointer,
  startPointer,
  stepAt,
  type ChartPlan,
  type ChartPointer,
} from "../src/index.ts";
import { chartPattern, yarnA, yarnB, yarnC } from "./support/fixtures.ts";
import { forAll, type Rng } from "./support/property.ts";

const SHAPES: readonly RenderShape[] = ["flat", "tube", "circle", "yoke"];

/** Documento `savable` aleatorio (lo comprueba con el validador). */
function genPattern(r: Rng, maxRepeat = 10): ChartPattern {
  const width = r.int(1, 8);
  const height = r.int(1, 8);
  const yarnCount = r.int(1, 3);
  const mode = r.pick(["random", "mask", "wedge", "bands"] as const);
  const cells: number[] = [];
  for (let y = 0; y < height; y++) {
    const keep = mode === "wedge" ? r.int(0, width) : width;
    const band = r.int(0, yarnCount - 1);
    for (let x = 0; x < width; x++) {
      if (mode === "wedge") cells.push(x < keep ? r.int(0, yarnCount - 1) : NO_STITCH);
      else if (mode === "mask") cells.push(r.bool(0.3) ? NO_STITCH : r.int(0, yarnCount - 1));
      else if (mode === "bands") cells.push(band);
      else cells.push(r.int(0, yarnCount - 1));
    }
  }
  const p = chartPattern(
    {
      width,
      height,
      cells,
      repeat: { x: r.int(1, maxRepeat), y: r.int(1, maxRepeat) },
      workedIn: r.bool() ? "rounds" : "rows",
      renderAs: r.pick(SHAPES),
      direction: r.bool() ? "bottom_up" : "top_down",
    },
    [yarnA, yarnB, yarnC].slice(0, yarnCount),
  );
  if (r.bool(0.3)) p.technique = "crochet";
  const v = validatePattern(p);
  if (!v.savable) throw new Error(`el generador produjo un documento no savable: ${v.issues.map((i) => i.code).join(", ")}`);
  return p;
}

interface Case {
  pattern: ChartPattern;
  mirror: boolean;
}
const genCase = (r: Rng): Case => ({ pattern: genPattern(r), mirror: r.bool() });

/** Puntero aleatorio del dominio (en bordes de repetición o en cualquier casilla). */
function genPointer(r: Rng, plan: ChartPlan, onBoundary: boolean): ChartPointer {
  const rowsDone = r.int(0, plan.totalRows);
  const s = stepAt(plan, rowsDone);
  if (!s || s.stitches === 0) return { rowsDone, stitchesDone: 0 };
  const stitchesDone = onBoundary ? r.int(0, plan.repeatX - 1) * s.stitchesPerRepeat : r.int(0, s.stitches - 1);
  return { rowsDone, stitchesDone };
}

const allRows = (plan: ChartPlan) => Array.from({ length: plan.totalRows }, (_, i) => i);

describe("propiedades de follow (ADR 0007)", () => {
  it("P1: totalRows = height × repeat.y = rowStitchCounts(chart).length", () => {
    forAll("P1", genCase, ({ pattern, mirror }) => {
      const plan = planChart(pattern, { mirror });
      const c = pattern.chart;
      assert.equal(plan.totalRows, c.height * c.repeat.y);
      assert.equal(plan.totalRows, rowStitchCounts(c).length);
      assert.equal(stepAt(plan, plan.totalRows), null);
      assert.equal(stepAt(plan, -1), null);
      assert.equal(stepAt(plan, 0.5), null);
      assert.equal(stepAt(plan, NaN), null);
    });
  });

  it("P2: stitches = rowStitchCount por fila y la suma es stitchTotal = totalStitches", () => {
    forAll("P2", genCase, ({ pattern, mirror }) => {
      const plan = planChart(pattern, { mirror });
      let sum = 0;
      for (const row of allRows(plan)) {
        const s = stepAt(plan, row);
        assert.ok(s);
        assert.equal(s.stitches, rowStitchCount(pattern.chart, row));
        assert.equal(s.row, row);
        assert.equal(s.number, row + 1);
        assert.equal(s.motifRow, row % pattern.chart.height);
        assert.equal(s.verticalRepeat, Math.floor(row / pattern.chart.height));
        assert.equal(s.stitchesPerRepeat * plan.repeatX, s.stitches);
        sum += s.stitches;
      }
      assert.equal(sum, stitchTotal(pattern.chart));
      assert.equal(plan.totalStitches, sum);
    });
  });

  it("P3: Σ runs.count × repeatX = stitches; sin tramos de 0; sin dos tramos seguidos de la misma lana", () => {
    forAll("P3", genCase, ({ pattern, mirror }) => {
      const plan = planChart(pattern, { mirror });
      for (const row of allRows(plan)) {
        const s = stepAt(plan, row)!;
        assert.equal(s.runs.reduce((n, x) => n + x.count, 0) * plan.repeatX, s.stitches);
        s.runs.forEach((x, i) => {
          assert.ok(x.count > 0);
          assert.ok(x.yarn >= 0 && x.yarn < pattern.yarns.length);
          if (i > 0) assert.notEqual(x.yarn, s.runs[i - 1]!.yarn);
        });
        // `yarns`: lanas de los tramos, sin repetir, en orden de aparición.
        assert.deepEqual([...s.yarns], [...new Set(s.runs.map((x) => x.yarn))]);
      }
    });
  });

  it("P4: side y reading según readingDirection y la paridad; en redondo siempre right", () => {
    forAll("P4", genCase, ({ pattern, mirror }) => {
      const plan = planChart(pattern, { mirror });
      for (const row of allRows(plan)) {
        const s = stepAt(plan, row)!;
        assert.equal(s.reading, readingDirection(pattern.chart, row, { mirror }));
        assert.equal(s.side, pattern.chart.workedIn === "rounds" || row % 2 === 0 ? "right" : "wrong");
      }
    });
  });

  it("P5: el espejo invierte los tramos y no cambia stitches, change, el conjunto de lanas, el lado ni las columnas", () => {
    forAll("P5", (r) => genPattern(r), (pattern) => {
      const a = planChart(pattern);
      const b = planChart(pattern, { mirror: true });
      for (const row of allRows(a)) {
        const x = stepAt(a, row)!;
        const y = stepAt(b, row)!;
        assert.deepEqual(y.runs, [...x.runs].reverse());
        assert.equal(y.stitches, x.stitches);
        assert.equal(y.change, x.change);
        assert.equal(y.side, x.side);
        assert.notEqual(y.reading, x.reading);
        assert.deepEqual(new Set(y.yarns), new Set(x.yarns));
        assert.deepEqual(y.decreaseColumns, x.decreaseColumns);
        assert.deepEqual(y.increaseColumns, x.increaseColumns);
      }
    });
  });

  it("P6: change, perRepeat y columnas coinciden con shaping y rowShapingColumns", () => {
    forAll("P6", genCase, ({ pattern, mirror }) => {
      const plan = planChart(pattern, { mirror });
      const sh = shaping(pattern.chart);
      for (const row of allRows(plan)) {
        const s = stepAt(plan, row)!;
        assert.equal(s.change, sh[row]!.change);
        assert.equal(s.perRepeat, sh[row]!.perRepeat);
        const cols = rowShapingColumns(pattern.chart, row);
        assert.deepEqual([...s.decreaseColumns], cols.decreases);
        assert.deepEqual([...s.increaseColumns], cols.increases);
      }
    });
  });

  it("P7 y P16: renderAs, direction y technique no cambian ningún paso; el plan copia technique y workedIn", () => {
    forAll("P7/P16", (r) => ({ ...genCase(r), renderAs: r.pick(SHAPES), direction: r.pick(["bottom_up", "top_down"] as const) }), ({ pattern, mirror, renderAs, direction }) => {
      const plan = planChart(pattern, { mirror });
      assert.equal(plan.technique, pattern.technique);
      assert.equal(plan.workedIn, pattern.chart.workedIn);
      const chart: Chart = { ...pattern.chart, renderAs, direction };
      const other: ChartPattern = { ...pattern, chart, technique: pattern.technique === "knit" ? "crochet" : "knit" };
      const plan2 = planChart(other, { mirror });
      assert.equal(plan2.technique, other.technique);
      assert.equal(plan2.totalRows, plan.totalRows);
      assert.equal(plan2.totalStitches, plan.totalStitches);
      for (const row of allRows(plan)) assert.deepEqual(stepAt(plan2, row), stepAt(plan, row));
    });
  });

  it("P8: nextRow totalRows veces llega a terminado y una vez más no cambia nada", () => {
    forAll("P8", genCase, ({ pattern, mirror }) => {
      const plan = planChart(pattern, { mirror });
      let p = startPointer();
      for (let i = 0; i < plan.totalRows; i++) {
        assert.ok(!isFinished(plan, p));
        p = nextRow(plan, p);
      }
      assert.deepEqual(p, { rowsDone: plan.totalRows, stitchesDone: 0 });
      assert.ok(isFinished(plan, p));
      assert.deepEqual(nextRow(plan, p), p);
      assert.deepEqual(nextRepeat(plan, p), p);
    });
  });

  it("P9: prevRow y nextRow son inversas en el inicio de fila", () => {
    forAll("P9", (r) => {
      const c = genCase(r);
      const plan = planChart(c.pattern, { mirror: c.mirror });
      return { ...c, rowsDone: r.int(0, plan.totalRows) };
    }, ({ pattern, mirror, rowsDone }) => {
      const plan = planChart(pattern, { mirror });
      const p = { rowsDone, stitchesDone: 0 };
      if (rowsDone < plan.totalRows) assert.deepEqual(prevRow(plan, nextRow(plan, p)), p);
      if (rowsDone > 0) assert.deepEqual(nextRow(plan, prevRow(plan, p)), p);
      assert.deepEqual(prevRow(plan, startPointer()), startPointer());
      // Con casillas hechas, prevRow vuelve al inicio de la misma fila.
      const s = stepAt(plan, rowsDone);
      if (s && s.stitches > 1) assert.deepEqual(prevRow(plan, { rowsDone, stitchesDone: s.stitches - 1 }), p);
    });
  });

  it("P10: prevRepeat y nextRepeat son inversas en los bordes de repetición", () => {
    forAll("P10", (r) => {
      const c = genCase(r);
      const plan = planChart(c.pattern, { mirror: c.mirror });
      return { ...c, p: genPointer(r, plan, true) };
    }, ({ pattern, mirror, p }) => {
      const plan = planChart(pattern, { mirror });
      const atStart = p.rowsDone === 0 && p.stitchesDone === 0;
      if (!isFinished(plan, p)) assert.deepEqual(prevRepeat(plan, nextRepeat(plan, p)), p);
      if (!atStart) assert.deepEqual(nextRepeat(plan, prevRepeat(plan, p)), p);
      else assert.deepEqual(prevRepeat(plan, p), p);
    });
  });

  it("P11: nextRepeat llega a terminado en Σ (stitches > 0 ? repeatX : 1) llamadas", () => {
    forAll("P11", (r) => ({ pattern: genPattern(r, 6), mirror: r.bool() }), ({ pattern, mirror }) => {
      const plan = planChart(pattern, { mirror });
      const expected = rowStitchCounts(pattern.chart).reduce((n, s) => n + (s > 0 ? plan.repeatX : 1), 0);
      let p = startPointer();
      let calls = 0;
      while (!isFinished(plan, p)) {
        const q = nextRepeat(plan, p);
        // P13 (monotonía): el avance en puntos nunca baja.
        assert.ok(position(plan, q).stitchesDone >= position(plan, p).stitchesDone);
        p = q;
        calls++;
        assert.ok(calls <= expected, "demasiadas llamadas");
      }
      assert.equal(calls, expected);
    }, 150);
  });

  it("P12: clampPointer es idempotente, acepta cualquier valor y toda operación devuelve punteros del dominio", () => {
    const junk = (r: Rng): unknown => {
      const n = () => r.pick([0, 1, -1, 2.5, NaN, Infinity, -Infinity, 1e308, 2 ** 53, -0, r.int(-50, 500)]);
      return r.pick([null, undefined, "x", 7, true, [], { rowsDone: n() }, { stitchesDone: n() }, { rowsDone: n(), stitchesDone: n() }, { rowsDone: String(n()), stitchesDone: n() }]);
    };
    forAll("P12", (r) => ({ ...genCase(r), input: junk(r) }), ({ pattern, mirror, input }) => {
      const plan = planChart(pattern, { mirror });
      const q = clampPointer(plan, input);
      assert.deepEqual(clampPointer(plan, q), q);
      assert.ok(Number.isInteger(q.rowsDone) && q.rowsDone >= 0 && q.rowsDone <= plan.totalRows);
      for (const op of [nextRow, prevRow, nextRepeat, prevRepeat]) {
        const out = op(plan, input as ChartPointer);
        assert.deepEqual(clampPointer(plan, out), out);
        const out2 = op(plan, q);
        assert.deepEqual(clampPointer(plan, out2), out2);
      }
      const pos = position(plan, input as ChartPointer);
      assert.ok(pos.stitchesDone >= 0 && pos.stitchesDone <= pos.totalStitches);
    });
  });

  it("P13: position.stitchesDone = Σ rowStitchCount de las filas terminadas + stitchesDone, monótona en nextRow", () => {
    forAll("P13", (r) => {
      const c = genCase(r);
      const plan = planChart(c.pattern, { mirror: c.mirror });
      return { ...c, p: genPointer(r, plan, false) };
    }, ({ pattern, mirror, p }) => {
      const plan = planChart(pattern, { mirror });
      let done = 0;
      for (let row = 0; row < p.rowsDone; row++) done += rowStitchCount(pattern.chart, row);
      const pos = position(plan, p);
      assert.equal(pos.stitchesDone, done + p.stitchesDone);
      assert.equal(pos.rowsDone, p.rowsDone);
      assert.equal(pos.finished, p.rowsDone === plan.totalRows);
      assert.ok(position(plan, nextRow(plan, p)).stitchesDone >= pos.stitchesDone);
      assert.ok(position(plan, nextRepeat(plan, p)).stitchesDone >= pos.stitchesDone);
      if (pos.finished) assert.equal(pos.stitchesDone, plan.totalStitches);
      assert.ok(pos.verticalRepeat.index >= 0 && pos.verticalRepeat.index < plan.repeatY);
    });
  });

  it("P14: remapPointer(plan, plan, p) = p; el resultado queda acotado al plan nuevo", () => {
    forAll("P14", (r) => {
      const a = genCase(r);
      const b = genCase(r);
      const plan = planChart(a.pattern, { mirror: a.mirror });
      return { a, b, p: genPointer(r, plan, r.bool()) };
    }, ({ a, b, p }) => {
      const from = planChart(a.pattern, { mirror: a.mirror });
      const to = planChart(b.pattern, { mirror: b.mirror });
      assert.deepEqual(remapPointer(from, from, p), { pointer: p, clamped: false, rowChanged: false });
      // Un plan nuevo del mismo documento es equivalente.
      assert.deepEqual(remapPointer(from, planChart(a.pattern, { mirror: a.mirror }), p).pointer, p);
      const res = remapPointer(from, to, p);
      assert.deepEqual(clampPointer(to, res.pointer), res.pointer);
      assert.equal(res.pointer.rowsDone, Math.min(p.rowsDone, to.totalRows));
      assert.equal(res.clamped, p.rowsDone > to.totalRows);
      if (res.rowChanged) assert.equal(res.pointer.stitchesDone, 0);
    });
  });

  it("P15: horizontalRepeat cubre width columnas; la primera es la de la derecha sin espejo y la de la izquierda con espejo", () => {
    forAll("P15", (r) => {
      const c = genCase(r);
      const plan = planChart(c.pattern, { mirror: c.mirror });
      return { ...c, p: genPointer(r, plan, false) };
    }, ({ pattern, mirror, p }) => {
      const plan = planChart(pattern, { mirror });
      const pos = position(plan, p);
      const s = stepAt(plan, p.rowsDone);
      if (!s || s.stitches === 0) {
        assert.equal(pos.horizontalRepeat, null);
        return;
      }
      const h = pos.horizontalRepeat!;
      const w = pattern.chart.width;
      assert.equal(h.xEnd - h.xStart, w);
      assert.equal(h.xStart % w, 0);
      assert.ok(h.xStart >= 0 && h.xEnd <= w * plan.repeatX);
      assert.equal(h.of, plan.repeatX);
      assert.equal(h.index, Math.floor(p.stitchesDone / s.stitchesPerRepeat));
      const first = position(plan, { rowsDone: p.rowsDone, stitchesDone: 0 }).horizontalRepeat!;
      if (s.reading === "right_to_left") assert.equal(first.xEnd, w * plan.repeatX);
      else assert.equal(first.xStart, 0);
      if (pattern.chart.workedIn === "rounds") assert.equal(first.xStart === 0, mirror || plan.repeatX === 1);
    });
  });

  it("pureza: las operaciones no mutan el documento ni el puntero y son deterministas", () => {
    forAll("pureza", (r) => {
      const c = genCase(r);
      const plan = planChart(c.pattern, { mirror: c.mirror });
      return { ...c, p: genPointer(r, plan, false) };
    }, ({ pattern, mirror, p }) => {
      const before = JSON.stringify(pattern);
      const pBefore = { ...p };
      const plan = planChart(pattern, { mirror });
      for (const op of [nextRow, prevRow, nextRepeat, prevRepeat]) assert.deepEqual(op(plan, p), op(planChart(pattern, { mirror }), p));
      position(plan, p);
      for (const row of allRows(plan)) stepAt(plan, row);
      assert.equal(JSON.stringify(pattern), before);
      assert.deepEqual(p, pBefore);
      assert.ok(Object.isFrozen(plan));
    }, 100);
  });
});
