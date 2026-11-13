/**
 * Casos de dominio F3-1 a F3-13 de docs/casos-dominio-fase-3.md (revisión T1 de experto-tejido).
 * Los casos de texto de la interfaz (F3-7, F3-9, F3-10) se prueban aquí en los datos que
 * `follow` entrega para armarlos (`workedIn`, `side`, `technique`, `stitches` de la última
 * fila); los textos mismos los prueba la interfaz.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_STITCH, rowShapingColumns } from "@loopitalab/pattern-core";
import {
  clampPointer,
  isFinished,
  nextRepeat,
  nextRow,
  planChart,
  position,
  remapPointer,
  startPointer,
  stepAt,
  type ChartPlan,
  type ChartStep,
} from "../src/index.ts";
import { cellsFrom, chartPattern, yarnA, yarnB, yarnC } from "./support/fixtures.ts";

const A = 0;
const B = 1;

function step(plan: ChartPlan, row: number): ChartStep {
  const s = stepAt(plan, row);
  assert.ok(s, `la fila ${row} existe`);
  return s;
}
const runs = (s: ChartStep) => s.runs.map((r) => ({ ...r }));

describe("casos de dominio de follow (fase 3)", () => {
  const f31 = () => chartPattern({ width: 4, height: 2, cells: cellsFrom(["AABA", "ABBA"]), repeat: { x: 3, y: 1 }, workedIn: "rounds" });

  it("caso F3-1: motivo 4 × 2, R = 3, en redondo", () => {
    const plan = planChart(f31());
    assert.equal(plan.totalRows, 2);
    const s0 = step(plan, 0);
    assert.equal(s0.side, "right");
    assert.equal(s0.reading, "right_to_left");
    assert.equal(s0.stitches, 12);
    assert.equal(s0.stitchesPerRepeat, 4);
    // validar con tejedora: presentación "3 A · 2 B" frente a casillas.
    // Las filas del caso se escriben con x = 0 a la izquierda (convención de pattern-core);
    // "AABA" leído de derecha a izquierda, como se teje en redondo, da 1 A · 1 B · 2 A.
    assert.deepEqual(runs(s0), runsOf("AABA", "right_to_left"));
    assert.deepEqual(runs(s0), [{ yarn: A, count: 1 }, { yarn: B, count: 1 }, { yarn: A, count: 2 }]);
    assert.deepEqual(runs(step(plan, 1)), [{ yarn: A, count: 1 }, { yarn: B, count: 2 }, { yarn: A, count: 1 }]);
    for (const s of [s0, step(plan, 1)]) assert.equal(s.runs.reduce((n, r) => n + r.count, 0) * plan.repeatX, 12);
  });

  it("caso F3-1 (tramos): el contenido es 2 A · 1 B · 1 A en el orden de las casillas del gráfico", () => {
    // El caso escribe "2 A · 1 B · 1 A" (orden de las casillas, de izquierda a derecha).
    // El ADR 0007 fija los tramos en el orden en que se tejen: sin espejo, de derecha a
    // izquierda. Duda abierta para experto-tejido (ver README); el contenido coincide.
    const s0 = step(planChart(f31()), 0);
    assert.deepEqual([...runs(s0)].reverse(), [{ yarn: A, count: 2 }, { yarn: B, count: 1 }, { yarn: A, count: 1 }]);
  });

  it("caso F3-2: con espejo, los tramos de la fila 0 se invierten y nada más cambia", () => {
    const plain = planChart(f31());
    const mirror = planChart(f31(), { mirror: true });
    const a = step(plain, 0);
    const b = step(mirror, 0);
    assert.deepEqual(runs(b), [...runs(a)].reverse());
    // Con espejo la vuelta se lee de izquierda a derecha: 2 A · 1 B · 1 A, como en el gráfico.
    assert.deepEqual(runs(b), [{ yarn: A, count: 2 }, { yarn: B, count: 1 }, { yarn: A, count: 1 }]);
    assert.equal(b.stitches, a.stitches);
    assert.equal(b.change, a.change);
    assert.deepEqual(new Set(b.yarns), new Set(a.yarns));
    assert.deepEqual(b.decreaseColumns, a.decreaseColumns);
    assert.deepEqual(b.increaseColumns, a.increaseColumns);
    assert.equal(b.side, "right");
    assert.equal(b.reading, "left_to_right");
  });

  it("caso F3-3: ida y vuelta, lado y sentido; colores por el derecho en la fila por el revés", () => {
    const p = chartPattern({ width: 4, height: 3, cells: cellsFrom(["AAAB", "ABBA", "BAAA"]), workedIn: "rows", renderAs: "flat" });
    const plan = planChart(p);
    assert.deepEqual([0, 1, 2].map((r) => [step(plan, r).side, step(plan, r).reading]), [
      ["right", "right_to_left"],
      ["wrong", "left_to_right"],
      ["right", "right_to_left"],
    ]);
    // Fila 1 "ABBA" de izquierda a derecha, con las lanas del gráfico (no se invierten).
    assert.deepEqual(runs(step(plan, 1)), [{ yarn: A, count: 1 }, { yarn: B, count: 2 }, { yarn: A, count: 1 }]);
    // Fila 0 "AAAB" de derecha a izquierda: primero B.
    assert.deepEqual(runs(step(plan, 0)), [{ yarn: B, count: 1 }, { yarn: A, count: 3 }]);
    const m = planChart(p, { mirror: true });
    assert.equal(step(m, 1).side, "wrong");
    assert.equal(step(m, 1).reading, "right_to_left");
    assert.equal(step(m, 0).side, "right");
    assert.equal(step(m, 0).reading, "left_to_right");
  });

  it("caso F3-4: top_down no cambia los pasos (P7)", () => {
    // validar con tejedora: orientación de la vista en "Tejiendo" para top_down.
    const base = { width: 3, height: 2, cells: cellsFrom(["ABA", "AAB"]) };
    const up = planChart(chartPattern({ ...base, direction: "bottom_up" }));
    const variants = [
      chartPattern({ ...base, direction: "top_down" }),
      chartPattern({ ...base, direction: "top_down", renderAs: "circle" }),
      chartPattern({ ...base, renderAs: "flat" }),
    ];
    assert.deepEqual(runs(step(up, 0)), [{ yarn: A, count: 1 }, { yarn: B, count: 1 }, { yarn: A, count: 1 }]);
    for (const v of variants) {
      const plan = planChart(v);
      assert.equal(plan.totalRows, up.totalRows);
      for (let r = 0; r < up.totalRows; r++) assert.deepEqual(stepAt(plan, r), stepAt(up, r));
    }
  });

  it("caso F3-5: círculo top_down de 8 a 16 puntos con R = 8", () => {
    const p = chartPattern({ width: 2, height: 2, cells: cellsFrom(["A.", "AA"]), repeat: { x: 8, y: 1 }, renderAs: "circle", direction: "top_down" }, [yarnA]);
    const plan = planChart(p);
    assert.equal(plan.workedIn, "rounds");
    assert.equal(step(plan, 0).stitches, 8);
    const s1 = step(plan, 1);
    assert.equal(s1.stitches, 16);
    assert.equal(s1.change, 8);
    assert.equal(s1.perRepeat, 1);
    assert.deepEqual(s1.increaseColumns, rowShapingColumns(p.chart, 1).increases);
    assert.deepEqual(s1.increaseColumns, [1]);
    for (let r = 0; r < plan.totalRows; r++) assert.equal(step(plan, r).side, "right");
  });

  it("caso F3-6: cuña de R = 8 que baja de 80 a 72; stitchesDone cuenta casillas", () => {
    // validar con tejedora: de qué lana es un "2 juntos" de dos lanas distintas (el modelo toma la casilla de la fila actual).
    const p = chartPattern({ width: 10, height: 2, cells: cellsFrom(["AAAAABBBBB", "AAAAABBBB."]), repeat: { x: 8, y: 1 }, renderAs: "circle" });
    const plan = planChart(p);
    assert.equal(step(plan, 0).stitches, 80);
    const s1 = step(plan, 1);
    assert.equal(s1.stitches, 72);
    assert.equal(s1.change, -8);
    assert.equal(s1.perRepeat, -1);
    assert.ok(s1.decreaseColumns.length > 0);
    assert.deepEqual(s1.decreaseColumns, [9]);
    // En la fila 1 el puntero avanza por casillas producidas: 9 por repetición, nunca 72 o más.
    let ptr = { rowsDone: 1, stitchesDone: 0 };
    const seen: number[] = [];
    for (let i = 0; i < 7; i++) seen.push((ptr = nextRepeat(plan, ptr)).stitchesDone);
    assert.deepEqual(seen, [9, 18, 27, 36, 45, 54, 63]);
    assert.deepEqual(nextRepeat(plan, ptr), { rowsDone: 2, stitchesDone: 0 });
    assert.equal(clampPointer(plan, { rowsDone: 1, stitchesDone: 79 }).stitchesDone, 71);
  });

  it("caso F3-7: tres veces nextRow termina el gráfico; una cuarta no cambia nada", () => {
    const p = chartPattern({ width: 4, height: 3, cells: cellsFrom(["AAAA", "ABAB", "BB.."]), repeat: { x: 2, y: 1 }, workedIn: "rows", renderAs: "flat" });
    const plan = planChart(p);
    let ptr = startPointer();
    for (let i = 0; i < 3; i++) ptr = nextRow(plan, ptr);
    assert.deepEqual(ptr, { rowsDone: 3, stitchesDone: 0 });
    assert.equal(ptr.rowsDone, plan.totalRows);
    assert.ok(isFinished(plan, ptr));
    assert.deepEqual(nextRow(plan, ptr), ptr);
    const pos = position(plan, ptr);
    assert.equal(pos.finished, true);
    assert.equal(pos.step, null);
    // "Gráfico terminado": la interfaz menciona los N puntos que quedan con este dato (bottom_up).
    assert.equal(step(plan, plan.totalRows - 1).stitches, 4);
  });

  it("caso F3-8: R = 4, fila de 16 puntos; nextRepeat y repetición resaltada", () => {
    const p = chartPattern({ width: 4, height: 2, cells: cellsFrom(["ABBA", "AAAA"]), repeat: { x: 4, y: 1 } });
    const plan = planChart(p);
    let ptr = startPointer();
    const seen = [];
    for (let i = 0; i < 4; i++) seen.push((ptr = nextRepeat(plan, ptr)));
    assert.deepEqual(seen, [
      { rowsDone: 0, stitchesDone: 4 },
      { rowsDone: 0, stitchesDone: 8 },
      { rowsDone: 0, stitchesDone: 12 },
      { rowsDone: 1, stitchesDone: 0 },
    ]);
    assert.deepEqual(position(plan, startPointer()).horizontalRepeat, { index: 0, of: 4, xStart: 12, xEnd: 16 });
    const m = planChart(p, { mirror: true });
    assert.deepEqual(position(m, startPointer()).horizontalRepeat, { index: 0, of: 4, xStart: 0, xEnd: 4 });
  });

  it("caso F3-9: el plan entrega workedIn para decir vuelta o fila", () => {
    const rounds = planChart(chartPattern({ width: 2, height: 2, cells: cellsFrom(["AB", "BA"]) }));
    const rows = planChart(chartPattern({ width: 2, height: 2, cells: cellsFrom(["AB", "BA"]), workedIn: "rows", renderAs: "flat" }));
    assert.equal(rounds.workedIn, "rounds");
    assert.equal(rows.workedIn, "rows");
    // Con `rows` hay filas por el revés; en redondo nunca.
    assert.equal(step(rows, 1).side, "wrong");
    assert.equal(step(rounds, 1).side, "right");
  });

  it("caso F3-10: fila por el revés; follow entrega side y technique, no el tipo de punto", () => {
    const knit = chartPattern({ width: 3, height: 2, cells: cellsFrom(["AAB", "ABB"]), workedIn: "rows", renderAs: "flat" });
    const crochet = { ...knit, technique: "crochet" as const };
    const k = planChart(knit);
    const c = planChart(crochet);
    assert.equal(k.technique, "knit");
    assert.equal(c.technique, "crochet");
    assert.equal(step(k, 1).side, "wrong");
    assert.equal(step(k, 1).reading, "left_to_right");
    // Colores del derecho, sin invertir: "ABB" de izquierda a derecha.
    assert.deepEqual(runs(step(k, 1)), [{ yarn: A, count: 1 }, { yarn: B, count: 2 }]);
    assert.deepEqual(stepAt(c, 1), stepAt(k, 1));
  });

  it("caso F3-11: punteros dañados", () => {
    const plan = planChart(f31());
    const bad: unknown[] = [
      null,
      undefined,
      "texto",
      42,
      NaN,
      {},
      { rowsDone: NaN, stitchesDone: NaN },
      { rowsDone: -5, stitchesDone: -1 },
      { rowsDone: 1e308, stitchesDone: 1e308 },
      { rowsDone: Infinity, stitchesDone: 3 },
      { rowsDone: "1", stitchesDone: "2" },
      { rowsDone: 0.7, stitchesDone: 2.9 },
      JSON.parse('{"__proto__": {"rowsDone": 1}}'),
      new Proxy({}, { get: () => { throw new Error("trampa"); } }),
      Object.defineProperty({}, "rowsDone", { get: () => { throw new Error("getter"); } }),
    ];
    for (const input of bad) {
      const q = clampPointer(plan, input);
      assert.ok(Number.isInteger(q.rowsDone) && q.rowsDone >= 0 && q.rowsDone <= plan.totalRows);
      const s = stepAt(plan, q.rowsDone);
      assert.ok(Number.isInteger(q.stitchesDone) && q.stitchesDone >= 0 && q.stitchesDone <= Math.max((s?.stitches ?? 0) - 1, 0));
      assert.deepEqual(clampPointer(plan, q), q);
    }
    assert.deepEqual(clampPointer(plan, { rowsDone: 1e308, stitchesDone: 5 }), { rowsDone: 2, stitchesDone: 0 });
    assert.deepEqual(clampPointer(plan, { rowsDone: 0.7, stitchesDone: 2.9 }), { rowsDone: 0, stitchesDone: 2 });
  });

  it("caso F3-12: la fila 12 cambia de contenido entre dos versiones", () => {
    const rows = Array.from({ length: 20 }, () => "AAAA");
    const v1 = chartPattern({ width: 4, height: 20, cells: cellsFrom(rows) }, [yarnA, yarnB, yarnC]);
    const v2rows = [...rows];
    v2rows[12] = "ABCA";
    const v2 = chartPattern({ width: 4, height: 20, cells: cellsFrom(v2rows) }, [yarnA, yarnB, yarnC]);
    const from = planChart(v1);
    const to = planChart(v2);
    const r = remapPointer(from, to, { rowsDone: 12, stitchesDone: 3 });
    assert.deepEqual(r, { pointer: { rowsDone: 12, stitchesDone: 0 }, clamped: false, rowChanged: true });
    // Una fila que no cambió conserva todo.
    assert.deepEqual(remapPointer(from, to, { rowsDone: 5, stitchesDone: 3 }), { pointer: { rowsDone: 5, stitchesDone: 3 }, clamped: false, rowChanged: false });
    // Versión más corta: se acota.
    const short = planChart(chartPattern({ width: 4, height: 10, cells: cellsFrom(rows.slice(0, 10)) }));
    const c = remapPointer(from, short, { rowsDone: 12, stitchesDone: 1 });
    assert.deepEqual(c, { pointer: { rowsDone: 10, stitchesDone: 0 }, clamped: true, rowChanged: true });
  });

  it("caso F3-13: stepAt en 200 de ancho en menos de 1 ms; planChart no recorre las filas", () => {
    const side = 200;
    const cells = Array.from({ length: side * side }, (_, i) => (i % 11 === 0 ? NO_STITCH : i % 3));
    const big = chartPattern({ width: side, height: side, cells, repeat: { x: 500, y: 500 }, workedIn: "rows", renderAs: "flat" }, [yarnA, yarnB, yarnC]);
    const plan = planChart(big);
    assert.equal(plan.totalRows, 100_000);
    // Guardia robusta frente a CPU cargada (QA T16): calentamiento y mediana de varias tandas. El criterio no
    // se relaja (CA3-P6: menos de 1 ms por `stepAt`); una pausa del planificador o del recolector en una tanda
    // no decide el resultado. Filas distintas en cada llamada para no medir la caché de pasos (64 entradas).
    let k = 0;
    const batch = (n: number) => {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) stepAt(plan, (k++ * 7919) % plan.totalRows);
      return (performance.now() - t0) / n;
    };
    batch(300); // calentamiento (JIT)
    const batches = Array.from({ length: 9 }, () => batch(200)).sort((x, y) => x - y);
    const perStep = batches[4]!;
    assert.ok(perStep < 1, `stepAt tardó ${perStep.toFixed(3)} ms (mediana de 9 tandas; peor tanda ${batches[8]!.toFixed(3)} ms)`);
    // planChart con repeat.y = 1 y = 500 tarda lo mismo (orden de magnitud): no depende de repeat.y.
    // Se compara el mínimo de 5 mediciones de cada uno (el mínimo es la medida menos sensible a la carga).
    const one = chartPattern({ ...big.chart, repeat: { x: 500, y: 1 } }, [yarnA, yarnB, yarnC]);
    const time = (p: typeof big) => {
      const t = performance.now();
      for (let i = 0; i < 20; i++) position(planChart(p), { rowsDone: 99_999, stitchesDone: 0 });
      return (performance.now() - t) / 20;
    };
    time(one);
    time(big);
    const best = (p: typeof big) => Math.min(...Array.from({ length: 5 }, () => time(p)));
    const a = best(one);
    const b = best(big);
    assert.ok(b < Math.max(a * 5, 5), `planChart + position: ${a.toFixed(3)} ms con repeat.y = 1 y ${b.toFixed(3)} ms con 500`);
    console.log(`stepAt 200 de ancho: ${perStep.toFixed(4)} ms; planChart + position: ${a.toFixed(3)} / ${b.toFixed(3)} ms`);
  });
});

/** Tramos esperados de una fila en texto, leída en `reading` (ayuda para F3-1). */
function runsOf(row: string, reading: "right_to_left" | "left_to_right") {
  const chars = [...row];
  if (reading === "right_to_left") chars.reverse();
  const out: { yarn: number; count: number }[] = [];
  for (const ch of chars) {
    if (ch === ".") continue;
    const yarn = ch.charCodeAt(0) - 65;
    const last = out[out.length - 1];
    if (last && last.yarn === yarn) last.count++;
    else out.push({ yarn, count: 1 });
  }
  return out;
}
