/** Pruebas unitarias y de bordes de `follow` para gráficos. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_STITCH, validatePattern } from "@loopitalab/pattern-core";
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
} from "../src/index.ts";
import { cellsFrom, chartPattern } from "./support/fixtures.ts";

describe("planChart", () => {
  it("copia los datos del documento sin copiarlo y queda congelado", () => {
    const p = chartPattern({ width: 4, height: 3, cells: cellsFrom(["AAAA", "ABAB", "BBBB"]), repeat: { x: 5, y: 2 } });
    const plan = planChart(p);
    assert.equal(plan.kind, "chart");
    assert.equal(plan.pattern, p);
    assert.deepEqual(
      { ...plan, pattern: null },
      { kind: "chart", totalRows: 6, totalStitches: 120, motifWidth: 4, motifHeight: 3, repeatX: 5, repeatY: 2, workedIn: "rounds", technique: "knit", mirror: false, pattern: null },
    );
    assert.ok(Object.isFrozen(plan));
    assert.equal(planChart(p, { mirror: true }).mirror, true);
  });

  it("con dimensiones dañadas el plan tiene 0 filas y nada lanza", () => {
    for (const bad of [{ height: 0 }, { height: 1.5 }, { width: NaN }, { repeat: { x: 0, y: 1 } }, { repeat: { x: 1, y: Infinity } }]) {
      const p = chartPattern({ width: 2, height: 2, cells: [0, 0, 0, 0], ...bad });
      const plan = planChart(p);
      assert.equal(plan.totalRows, 0);
      assert.equal(stepAt(plan, 0), null);
      assert.ok(isFinished(plan, startPointer()));
      assert.deepEqual(nextRow(plan, startPointer()), startPointer());
      assert.deepEqual(prevRepeat(plan, startPointer()), startPointer());
      assert.equal(position(plan, startPointer()).finished, true);
    }
  });
});

describe("filas sin puntos (documento savable, no valid)", () => {
  const p = chartPattern({ width: 3, height: 3, cells: cellsFrom(["ABA", "...", "BBB"]), repeat: { x: 2, y: 1 } });

  it("el documento es savable y la fila vacía se informa con stitches 0", () => {
    const v = validatePattern(p);
    assert.equal(v.savable, true);
    assert.equal(v.valid, false);
    const s = stepAt(planChart(p), 1)!;
    assert.equal(s.stitches, 0);
    assert.deepEqual(s.runs, []);
    assert.equal(s.change, -6);
    assert.deepEqual(s.decreaseColumns, [0, 1, 2]);
  });

  it("nextRepeat y prevRepeat saltan la fila vacía de una vez; no hay repetición resaltada", () => {
    const plan = planChart(p);
    assert.deepEqual(nextRepeat(plan, { rowsDone: 1, stitchesDone: 0 }), { rowsDone: 2, stitchesDone: 0 });
    assert.deepEqual(prevRepeat(plan, { rowsDone: 2, stitchesDone: 0 }), { rowsDone: 1, stitchesDone: 0 });
    assert.deepEqual(prevRepeat(plan, { rowsDone: 1, stitchesDone: 0 }), { rowsDone: 0, stitchesDone: 3 });
    assert.equal(position(plan, { rowsDone: 1, stitchesDone: 0 }).horizontalRepeat, null);
    assert.equal(clampPointer(plan, { rowsDone: 1, stitchesDone: 5 }).stitchesDone, 0);
  });

  it("gráfico sin ningún punto (CHART_EMPTY): las filas existen con 0 puntos", () => {
    const empty = chartPattern({ width: 2, height: 2, cells: [NO_STITCH, NO_STITCH, NO_STITCH, NO_STITCH] });
    const plan = planChart(empty);
    assert.equal(plan.totalRows, 2);
    assert.equal(plan.totalStitches, 0);
    let ptr = startPointer();
    ptr = nextRepeat(plan, nextRepeat(plan, ptr));
    assert.ok(isFinished(plan, ptr));
  });
});

describe("puntero", () => {
  const p = chartPattern({ width: 4, height: 2, cells: cellsFrom(["ABBA", "AAAA"]), repeat: { x: 3, y: 2 } });
  const plan = planChart(p);

  it("prevRepeat desde terminado vuelve a la última repetición de la última fila", () => {
    assert.deepEqual(prevRepeat(plan, { rowsDone: 4, stitchesDone: 0 }), { rowsDone: 3, stitchesDone: 8 });
    assert.deepEqual(prevRow(plan, { rowsDone: 4, stitchesDone: 0 }), { rowsDone: 3, stitchesDone: 0 });
  });

  it("un puntero entre bordes (fase 6) avanza y retrocede al borde más cercano", () => {
    assert.deepEqual(nextRepeat(plan, { rowsDone: 0, stitchesDone: 5 }), { rowsDone: 0, stitchesDone: 8 });
    assert.deepEqual(prevRepeat(plan, { rowsDone: 0, stitchesDone: 5 }), { rowsDone: 0, stitchesDone: 4 });
    assert.deepEqual(nextRepeat(plan, { rowsDone: 0, stitchesDone: 9 }), { rowsDone: 1, stitchesDone: 0 });
  });

  it("position: avance total, repeticiones vertical y horizontal", () => {
    const pos = position(plan, { rowsDone: 3, stitchesDone: 4 });
    assert.equal(pos.stitchesDone, 36 + 4);
    assert.equal(pos.totalStitches, 48);
    assert.deepEqual(pos.verticalRepeat, { index: 1, of: 2 });
    assert.deepEqual(pos.horizontalRepeat, { index: 1, of: 3, xStart: 4, xEnd: 8 });
    assert.equal(pos.step?.row, 3);
    const end = position(plan, { rowsDone: 4, stitchesDone: 0 });
    assert.deepEqual(end.verticalRepeat, { index: 1, of: 2 });
    assert.equal(end.stitchesDone, 48);
    assert.equal(end.horizontalRepeat, null);
  });

  it("en ida y vuelta la fila por el revés empieza por la repetición de la izquierda", () => {
    const rows = planChart({ ...p, chart: { ...p.chart, workedIn: "rows", renderAs: "flat" } });
    assert.deepEqual(position(rows, { rowsDone: 0, stitchesDone: 0 }).horizontalRepeat, { index: 0, of: 3, xStart: 8, xEnd: 12 });
    assert.deepEqual(position(rows, { rowsDone: 1, stitchesDone: 0 }).horizontalRepeat, { index: 0, of: 3, xStart: 0, xEnd: 4 });
  });

  it("remapPointer: cambiar el espejo cambia el sentido, así que la fila cuenta como cambiada", () => {
    const r = remapPointer(plan, planChart(p, { mirror: true }), { rowsDone: 1, stitchesDone: 4 });
    assert.deepEqual(r, { pointer: { rowsDone: 1, stitchesDone: 0 }, clamped: false, rowChanged: true });
  });

  it("remapPointer: desde terminado hacia una versión más larga", () => {
    const longer = planChart({ ...p, chart: { ...p.chart, repeat: { x: 3, y: 3 } } });
    assert.deepEqual(remapPointer(plan, longer, { rowsDone: 4, stitchesDone: 0 }), { pointer: { rowsDone: 4, stitchesDone: 0 }, clamped: false, rowChanged: true });
  });

  it("los pasos se devuelven congelados", () => {
    const s = stepAt(plan, 0)!;
    assert.ok(Object.isFrozen(s) && Object.isFrozen(s.runs) && Object.isFrozen(s.runs[0]));
  });
});
