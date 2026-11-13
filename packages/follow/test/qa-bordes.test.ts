/**
 * QA final de la fase 3 (T16): casos límite de `follow` que no tenían prueba (revisión cruzada de T4).
 * Gráfico de 1 × 1, repeticiones 1 y máximas, todo `NO_STITCH` salvo una casilla, 32 lanas, `top_down` + ida y
 * vuelta + espejo, puntero al final y diseño que se acorta. Cada bloque comprueba además las invariantes del
 * ADR 0007 que aplican (Σ tramos × repeatX = puntos, puntero siempre en el dominio).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIMITS, NO_STITCH, rowStitchCounts, stitchTotal, validatePattern, type Yarn } from "@loopitalab/pattern-core";
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
import { cellsFrom, chartPattern, yarnA, yarnB } from "./support/fixtures.ts";

function inDomain(plan: ChartPlan, p: ChartPointer): void {
  assert.deepEqual(clampPointer(plan, p), p, `puntero fuera del dominio: ${JSON.stringify(p)}`);
}

/** Recorre todo el gráfico con `advance` y devuelve cuántas llamadas hicieron falta (con tope). */
function walk(plan: ChartPlan, advance: (plan: ChartPlan, p: ChartPointer) => ChartPointer, cap = 1_000_000): number {
  let p = startPointer();
  let n = 0;
  while (!isFinished(plan, p)) {
    const q = advance(plan, p);
    inDomain(plan, q);
    assert.notDeepEqual(q, p, "avanzar sin terminar siempre cambia el puntero");
    p = q;
    if (++n > cap) assert.fail("no termina");
  }
  return n;
}

describe("gráfico de 1 × 1", () => {
  it("sin repeticiones: una fila de un punto; avanzar por fila o por repetición termina en una llamada", () => {
    for (const workedIn of ["rounds", "rows"] as const) {
      const plan = planChart(chartPattern({ width: 1, height: 1, cells: [0], workedIn, renderAs: workedIn === "rows" ? "flat" : "tube" }));
      assert.equal(plan.totalRows, 1);
      assert.equal(plan.totalStitches, 1);
      const s = stepAt(plan, 0)!;
      assert.deepEqual(
        { stitches: s.stitches, per: s.stitchesPerRepeat, change: s.change, perRepeat: s.perRepeat, runs: s.runs, yarns: s.yarns, side: s.side, reading: s.reading, number: s.number, motifRow: s.motifRow, verticalRepeat: s.verticalRepeat },
        { stitches: 1, per: 1, change: 0, perRepeat: 0, runs: [{ yarn: 0, count: 1 }], yarns: [0], side: "right", reading: "right_to_left", number: 1, motifRow: 0, verticalRepeat: 0 },
      );
      assert.equal(stepAt(plan, 1), null);
      assert.equal(stepAt(plan, -1), null);
      const pos = position(plan, startPointer());
      assert.deepEqual(pos.horizontalRepeat, { index: 0, of: 1, xStart: 0, xEnd: 1 });
      assert.deepEqual(pos.verticalRepeat, { index: 0, of: 1 });
      // El único punto: `stitchesDone` solo puede ser 0.
      assert.deepEqual(clampPointer(plan, { rowsDone: 0, stitchesDone: 1 }), { rowsDone: 0, stitchesDone: 0 });
      assert.deepEqual(nextRow(plan, startPointer()), { rowsDone: 1, stitchesDone: 0 });
      assert.deepEqual(nextRepeat(plan, startPointer()), { rowsDone: 1, stitchesDone: 0 });
      assert.deepEqual(prevRow(plan, { rowsDone: 1, stitchesDone: 0 }), startPointer());
      assert.deepEqual(prevRepeat(plan, { rowsDone: 1, stitchesDone: 0 }), startPointer());
      assert.deepEqual(prevRow(plan, startPointer()), startPointer());
      assert.deepEqual(prevRepeat(plan, startPointer()), startPointer());
      const end = position(plan, { rowsDone: 1, stitchesDone: 0 });
      assert.deepEqual({ finished: end.finished, step: end.step, h: end.horizontalRepeat, v: end.verticalRepeat, done: end.stitchesDone, total: end.totalStitches }, { finished: true, step: null, h: null, v: { index: 0, of: 1 }, done: 1, total: 1 });
    }
  });

  it("con las repeticiones máximas (500 × 500) en ida y vuelta: cada repetición es un punto y el lado alterna", () => {
    const R = LIMITS.maxRepeat;
    const plan = planChart(chartPattern({ width: 1, height: 1, cells: [1], repeat: { x: R, y: R }, workedIn: "rows", renderAs: "flat" }));
    assert.equal(plan.totalRows, R);
    assert.equal(plan.totalStitches, R * R);
    const s0 = stepAt(plan, 0)!;
    const s1 = stepAt(plan, 1)!;
    assert.deepEqual({ stitches: s0.stitches, per: s0.stitchesPerRepeat, runs: s0.runs, side: s0.side, reading: s0.reading }, { stitches: R, per: 1, runs: [{ yarn: 1, count: 1 }], side: "right", reading: "right_to_left" });
    assert.deepEqual({ side: s1.side, reading: s1.reading, motifRow: s1.motifRow, verticalRepeat: s1.verticalRepeat }, { side: "wrong", reading: "left_to_right", motifRow: 0, verticalRepeat: 1 });
    // La primera repetición es la de la derecha por el derecho y la de la izquierda por el revés.
    assert.deepEqual(position(plan, startPointer()).horizontalRepeat, { index: 0, of: R, xStart: R - 1, xEnd: R });
    assert.deepEqual(position(plan, { rowsDone: 1, stitchesDone: 0 }).horizontalRepeat, { index: 0, of: R, xStart: 0, xEnd: 1 });
    assert.deepEqual(position(plan, { rowsDone: 0, stitchesDone: R - 1 }).horizontalRepeat, { index: R - 1, of: R, xStart: 0, xEnd: 1 });
    // R llamadas a nextRepeat por fila.
    let p = startPointer();
    for (let i = 1; i < R; i++) {
      p = nextRepeat(plan, p);
      assert.deepEqual(p, { rowsDone: 0, stitchesDone: i });
    }
    assert.deepEqual(nextRepeat(plan, p), { rowsDone: 1, stitchesDone: 0 });
    assert.deepEqual(prevRepeat(plan, { rowsDone: 1, stitchesDone: 0 }), { rowsDone: 0, stitchesDone: R - 1 });
    // Avance total en la última fila, último punto.
    assert.equal(position(plan, { rowsDone: R - 1, stitchesDone: R - 1 }).stitchesDone, R * R - 1);
    assert.equal(walk(plan, nextRow), R);
  });
});

describe("todo NO_STITCH salvo una casilla", () => {
  // Motivo 4 × 3; la única casilla con punto es (2, 1), de la lana B. Savable, no valid (filas sin puntos).
  const doc = chartPattern({ width: 4, height: 3, cells: cellsFrom(["....", "..B.", "...."]), repeat: { x: 3, y: 2 } });
  const plan = planChart(doc);

  it("el documento no es valid pero el plan existe y nada lanza", () => {
    const v = validatePattern(doc);
    assert.equal(v.valid, false);
    assert.equal(plan.totalRows, 6);
    assert.equal(plan.totalStitches, 6);
    assert.equal(plan.totalStitches, stitchTotal(doc.chart));
  });

  it("las filas vacías dan 0 puntos y sin tramos; la fila con la casilla, un tramo de 1 por repetición", () => {
    const counts = rowStitchCounts(doc.chart);
    for (let y = 0; y < plan.totalRows; y++) {
      const s = stepAt(plan, y)!;
      assert.equal(s.stitches, counts[y]);
      assert.equal(s.runs.reduce((a, r) => a + r.count, 0) * plan.repeatX, s.stitches);
      if (y % 3 === 1) {
        assert.deepEqual({ stitches: s.stitches, per: s.stitchesPerRepeat, runs: s.runs, yarns: s.yarns }, { stitches: 3, per: 1, runs: [{ yarn: 1, count: 1 }], yarns: [1] });
      } else {
        assert.deepEqual({ stitches: s.stitches, per: s.stitchesPerRepeat, runs: s.runs, yarns: s.yarns }, { stitches: 0, per: 0, runs: [], yarns: [] });
      }
    }
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((y) => stepAt(plan, y)!.change), [0, 3, -3, 0, 3, -3]);
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((y) => stepAt(plan, y)!.perRepeat), [0, 1, -1, 0, 1, -1]);
  });

  it("en una fila vacía no hay repetición resaltada y `stitchesDone` solo puede ser 0", () => {
    assert.equal(position(plan, startPointer()).horizontalRepeat, null);
    assert.deepEqual(clampPointer(plan, { rowsDone: 0, stitchesDone: 5 }), startPointer());
    assert.deepEqual(clampPointer(plan, { rowsDone: 1, stitchesDone: 5 }), { rowsDone: 1, stitchesDone: 2 });
    // La repetición resaltada de la fila con punto cubre el motivo entero (4 columnas), aunque tenga 1 punto.
    assert.deepEqual(position(plan, { rowsDone: 1, stitchesDone: 0 }).horizontalRepeat, { index: 0, of: 3, xStart: 8, xEnd: 12 });
    assert.deepEqual(position(plan, { rowsDone: 1, stitchesDone: 2 }).horizontalRepeat, { index: 2, of: 3, xStart: 0, xEnd: 4 });
  });

  it("por repetición: las filas vacías se saltan de una vez y la fila con puntos toma repeatX llamadas", () => {
    // 4 filas vacías (1 llamada) + 2 filas con puntos (3 llamadas): P11.
    assert.equal(walk(plan, nextRepeat), 4 + 2 * 3);
    assert.equal(walk(plan, nextRow), 6);
    // Ida y vuelta por repetición desde el final vuelve al inicio sin salir del dominio.
    let p: ChartPointer = { rowsDone: 6, stitchesDone: 0 };
    let n = 0;
    while (p.rowsDone > 0 || p.stitchesDone > 0) {
      p = prevRepeat(plan, p);
      inDomain(plan, p);
      if (++n > 100) assert.fail("no vuelve al inicio");
    }
    assert.equal(n, 4 + 2 * 3);
  });

  it("el avance total solo cuenta casillas con punto", () => {
    assert.equal(position(plan, { rowsDone: 1, stitchesDone: 0 }).stitchesDone, 0);
    assert.equal(position(plan, { rowsDone: 2, stitchesDone: 0 }).stitchesDone, 3);
    assert.equal(position(plan, { rowsDone: 4, stitchesDone: 2 }).stitchesDone, 5);
    assert.equal(position(plan, { rowsDone: 6, stitchesDone: 0 }).stitchesDone, 6);
  });
});

describe("32 lanas (máximo del modelo)", () => {
  const N = LIMITS.maxYarns;
  const yarns: Yarn[] = Array.from({ length: N }, (_, i) => ({ ...structuredClone(i % 2 ? yarnB : yarnA), id: `Y${i}` }));

  it("una casilla por lana: 32 tramos de 1, en el orden en que se teje; el espejo los invierte", () => {
    const cells = Array.from({ length: N }, (_, i) => i);
    const doc = chartPattern({ width: N, height: 1, cells, repeat: { x: 2, y: 1 } }, yarns);
    assert.equal(N, 32);
    const s = stepAt(planChart(doc), 0)!;
    assert.equal(s.runs.length, N);
    assert.deepEqual(s.runs.map((r) => r.yarn), [...cells].reverse());
    assert.ok(s.runs.every((r) => r.count === 1));
    assert.deepEqual(s.yarns, [...cells].reverse());
    assert.equal(s.stitches, 2 * N);
    const m = stepAt(planChart(doc, { mirror: true }), 0)!;
    assert.deepEqual(m.runs.map((r) => r.yarn), cells);
    assert.deepEqual([...m.yarns].sort((a, b) => a - b), [...s.yarns].sort((a, b) => a - b));
  });

  it("lanas que se repiten en la fila: `yarns` no las repite y los tramos no se fusionan entre repeticiones", () => {
    // 64 de ancho: 0 0 1 1 … 31 31. La fila empieza y termina con lanas distintas; con 31 … 0 0 … 31 también se prueba el borde.
    const pairs = Array.from({ length: 2 * N }, (_, i) => Math.floor(i / 2));
    const s = stepAt(planChart(chartPattern({ width: 2 * N, height: 1, cells: pairs, repeat: { x: 3, y: 1 } }, yarns)), 0)!;
    assert.equal(s.runs.length, N);
    assert.ok(s.runs.every((r) => r.count === 2));
    assert.equal(s.yarns.length, N);
    // Motivo que empieza y termina con la misma lana: los tramos de una repetición NO se fusionan con la siguiente.
    const edge = stepAt(planChart(chartPattern({ width: 4, height: 1, cells: [31, 0, 0, 31], repeat: { x: 3, y: 1 } }, yarns)), 0)!;
    assert.deepEqual(edge.runs, [{ yarn: 31, count: 1 }, { yarn: 0, count: 2 }, { yarn: 31, count: 1 }]);
    assert.deepEqual(edge.yarns, [31, 0]);
    assert.equal(edge.runs.reduce((a, r) => a + r.count, 0) * 3, edge.stitches);
  });
});

describe("top_down + ida y vuelta + espejo", () => {
  const rows = ["AAB", "ABB", "BAA"];
  const make = (direction: "top_down" | "bottom_up", renderAs: "flat" | "circle") => chartPattern({ width: 3, height: 3, cells: cellsFrom(rows), repeat: { x: 2, y: 1 }, workedIn: "rows", renderAs, direction });

  it("el paso 0 es la fila 0 (lo primero que se teje) y `direction` no cambia ningún paso (P7), tampoco con espejo", () => {
    for (const mirror of [false, true]) {
      const a = planChart(make("top_down", "flat"), { mirror });
      const b = planChart(make("bottom_up", "flat"), { mirror });
      const c = planChart(make("top_down", "circle"), { mirror });
      for (let y = 0; y < 3; y++) {
        assert.deepEqual(stepAt(a, y), stepAt(b, y));
        assert.deepEqual(stepAt(a, y), stepAt(c, y));
      }
    }
  });

  it("con espejo: el lado no cambia, el sentido se invierte y los tramos van en el orden en que se teje", () => {
    const plan = planChart(make("top_down", "flat"), { mirror: true });
    const s = [0, 1, 2].map((y) => stepAt(plan, y)!);
    assert.deepEqual(s.map((x) => x.side), ["right", "wrong", "right"]);
    assert.deepEqual(s.map((x) => x.reading), ["left_to_right", "right_to_left", "left_to_right"]);
    // Fila 0 `AAB` de izquierda a derecha; fila 1 `ABB` de derecha a izquierda; fila 2 `BAA` de izquierda a derecha.
    assert.deepEqual(s[0]!.runs, [{ yarn: 0, count: 2 }, { yarn: 1, count: 1 }]);
    assert.deepEqual(s[1]!.runs, [{ yarn: 1, count: 2 }, { yarn: 0, count: 1 }]);
    assert.deepEqual(s[2]!.runs, [{ yarn: 1, count: 1 }, { yarn: 0, count: 2 }]);
    // P15 con espejo: por el derecho empieza la repetición de la izquierda; por el revés, la de la derecha.
    assert.deepEqual(position(plan, { rowsDone: 0, stitchesDone: 0 }).horizontalRepeat, { index: 0, of: 2, xStart: 0, xEnd: 3 });
    assert.deepEqual(position(plan, { rowsDone: 1, stitchesDone: 0 }).horizontalRepeat, { index: 0, of: 2, xStart: 3, xEnd: 6 });
    assert.deepEqual(position(plan, { rowsDone: 1, stitchesDone: 3 }).horizontalRepeat, { index: 1, of: 2, xStart: 0, xEnd: 3 });
  });

  it("sin espejo es exactamente el orden inverso de los tramos, fila por fila", () => {
    const plain = planChart(make("top_down", "flat"));
    const mirrored = planChart(make("top_down", "flat"), { mirror: true });
    for (let y = 0; y < 3; y++) {
      assert.deepEqual(stepAt(plain, y)!.runs, [...stepAt(mirrored, y)!.runs].reverse());
      assert.equal(stepAt(plain, y)!.side, stepAt(mirrored, y)!.side);
      assert.equal(stepAt(plain, y)!.stitches, stepAt(mirrored, y)!.stitches);
    }
  });
});

describe("puntero al final", () => {
  const plan = planChart(chartPattern({ width: 4, height: 2, cells: cellsFrom(["AABA", "ABBA"]), repeat: { x: 3, y: 2 } }));
  const end: ChartPointer = { rowsDone: 4, stitchesDone: 0 };

  it("terminado: `stitchesDone` vale 0 y lo que pasa del final se acota", () => {
    assert.deepEqual(clampPointer(plan, { rowsDone: 4, stitchesDone: 7 }), end);
    assert.deepEqual(clampPointer(plan, { rowsDone: 5, stitchesDone: 0 }), end);
    assert.deepEqual(clampPointer(plan, { rowsDone: Number.MAX_SAFE_INTEGER, stitchesDone: Number.MAX_SAFE_INTEGER }), end);
    assert.deepEqual(clampPointer(plan, { rowsDone: Infinity, stitchesDone: 1 }), { rowsDone: 0, stitchesDone: 1 });
    assert.ok(isFinished(plan, end));
    assert.ok(!isFinished(plan, { rowsDone: 3, stitchesDone: 11 }));
  });

  it("avanzar desde terminado no cambia nada; retroceder vuelve a la última fila", () => {
    assert.deepEqual(nextRow(plan, end), end);
    assert.deepEqual(nextRepeat(plan, end), end);
    assert.deepEqual(prevRow(plan, end), { rowsDone: 3, stitchesDone: 0 });
    assert.deepEqual(prevRepeat(plan, end), { rowsDone: 3, stitchesDone: 8 });
    // Último punto de la última fila: una repetición más termina.
    assert.deepEqual(nextRepeat(plan, { rowsDone: 3, stitchesDone: 11 }), end);
    assert.deepEqual(nextRow(plan, { rowsDone: 3, stitchesDone: 11 }), end);
  });

  it("la posición terminada informa el total, la última repetición vertical y ninguna fila", () => {
    const pos = position(plan, end);
    assert.deepEqual(
      { step: pos.step, finished: pos.finished, h: pos.horizontalRepeat, v: pos.verticalRepeat, rowsDone: pos.rowsDone, totalRows: pos.totalRows, done: pos.stitchesDone, total: pos.totalStitches },
      { step: null, finished: true, h: null, v: { index: 1, of: 2 }, rowsDone: 4, totalRows: 4, done: 48, total: 48 },
    );
  });
});

describe("diseño que se acorta (remapPointer)", () => {
  const rows12: string[] = Array.from({ length: 12 }, (_, i) => (i % 2 ? "ABBA" : "AABA"));
  const plan = (rows: string[], repeat = { x: 2, y: 1 }) => planChart(chartPattern({ width: 4, height: rows.length, cells: cellsFrom(rows), repeat }));
  const from = plan(rows12);

  it("más corto que el avance: se acota a terminado, con aviso", () => {
    assert.deepEqual(remapPointer(from, plan(rows12.slice(0, 6)), { rowsDone: 9, stitchesDone: 5 }), { pointer: { rowsDone: 6, stitchesDone: 0 }, clamped: true, rowChanged: true });
    // Desde terminado hacia una versión más corta: sigue terminado.
    assert.deepEqual(remapPointer(from, plan(rows12.slice(0, 6)), { rowsDone: 12, stitchesDone: 0 }), { pointer: { rowsDone: 6, stitchesDone: 0 }, clamped: true, rowChanged: true });
  });

  it("más corto pero el avance cabe: se conserva la fila y las casillas si la fila se teje igual", () => {
    assert.deepEqual(remapPointer(from, plan(rows12.slice(0, 6)), { rowsDone: 3, stitchesDone: 5 }), { pointer: { rowsDone: 3, stitchesDone: 5 }, clamped: false, rowChanged: false });
  });

  it("se acorta justo hasta la fila en curso: el resultado es terminado y la fila cuenta como cambiada", () => {
    // Iba en la fila 11 de 12 (rowsDone = 10) y la versión nueva tiene 10 filas: esa fila ya no existe.
    const r = remapPointer(from, plan(rows12.slice(0, 10)), { rowsDone: 10, stitchesDone: 3 });
    assert.deepEqual(r.pointer, { rowsDone: 10, stitchesDone: 0 });
    assert.equal(r.rowChanged, true);
    assert.ok(isFinished(plan(rows12.slice(0, 10)), r.pointer));
    // Observación de QA (docs/qa-fase-3.md, O-F3-2): aquí `clamped` es false, así que la ficha dice "se teje
    // distinto" y no "la versión nueva es más corta". Se fija el valor actual; validar con tejedora // validar con tejedora
    assert.equal(r.clamped, false);
  });

  it("menos repeticiones a lo alto o a lo ancho: fila acotada, o fila cambiada por tener menos puntos", () => {
    const tall = plan(rows12.slice(0, 4), { x: 2, y: 3 }); // 12 filas
    const lower = plan(rows12.slice(0, 4), { x: 2, y: 1 }); // 4 filas
    assert.deepEqual(remapPointer(tall, lower, { rowsDone: 7, stitchesDone: 2 }), { pointer: { rowsDone: 4, stitchesDone: 0 }, clamped: true, rowChanged: true });
    assert.deepEqual(remapPointer(tall, lower, { rowsDone: 2, stitchesDone: 2 }), { pointer: { rowsDone: 2, stitchesDone: 2 }, clamped: false, rowChanged: false });
    const narrow = plan(rows12.slice(0, 4), { x: 1, y: 3 }); // misma altura, la mitad de puntos por fila
    assert.deepEqual(remapPointer(tall, narrow, { rowsDone: 7, stitchesDone: 6 }), { pointer: { rowsDone: 7, stitchesDone: 0 }, clamped: false, rowChanged: true });
  });

  it("hacia un plan dañado (0 filas): terminado, acotado, sin lanzar", () => {
    const broken = planChart(chartPattern({ width: 4, height: 0, cells: [] }));
    assert.equal(broken.totalRows, 0);
    assert.deepEqual(remapPointer(from, broken, { rowsDone: 5, stitchesDone: 2 }), { pointer: startPointer(), clamped: true, rowChanged: true });
    assert.deepEqual(remapPointer(from, broken, startPointer()), { pointer: startPointer(), clamped: false, rowChanged: true });
  });

  it("una casilla que pasa a NO_STITCH en la fila en curso: la fila cambió y las casillas vuelven a 0", () => {
    const edited = [...rows12];
    edited[5] = "A.BA";
    const to = plan(edited);
    assert.deepEqual(remapPointer(from, to, { rowsDone: 5, stitchesDone: 7 }), { pointer: { rowsDone: 5, stitchesDone: 0 }, clamped: false, rowChanged: true });
    // La fila siguiente también cambia de forma (su `change` ya no es 0) aunque sus casillas sean las mismas.
    assert.equal(remapPointer(from, to, { rowsDone: 6, stitchesDone: 7 }).rowChanged, true);
    // Una fila lejana no cambia.
    assert.deepEqual(remapPointer(from, to, { rowsDone: 2, stitchesDone: 7 }), { pointer: { rowsDone: 2, stitchesDone: 7 }, clamped: false, rowChanged: false });
  });
});
