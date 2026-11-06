/** Operaciones de edición (ADR 0003, sección 3). */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EDIT_LIMITS,
  NO_STITCH,
  addYarn,
  cellAt,
  fillRegion,
  newChartPattern,
  paintCells,
  removeYarn,
  reorderYarns,
  resizeMotif,
  setRepeat,
  validatePattern,
  yarnTotals,
  type Chart,
  type ChartPattern,
  type NewChartInput,
} from "../src/index.ts";
import { smallChart, yarnA, yarnB, yarnC } from "./support/fixtures.ts";

const _ = NO_STITCH;

function frozen<T>(v: T): T {
  // Congela en profundidad: cualquier mutación lanza en modo estricto.
  if (typeof v === "object" && v !== null) {
    for (const k of Object.keys(v)) frozen((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}

const motif = (c: Chart) => Array.from({ length: c.height }, (_v, y) => c.cells.slice(y * c.width, (y + 1) * c.width));

describe("paintCells", () => {
  it("pintar una celda del gráfico completo pinta todas sus repeticiones", () => {
    const p = frozen(smallChart());
    const out = paintCells(p.chart, [{ x: 9, y: 3 }], 1, 3); // motivo (1, 0)
    assert.equal(out.cells[1], 1);
    for (let rx = 0; rx < 5; rx++) for (let ry = 0; ry < 2; ry++) assert.equal(cellAt(out, rx * 4 + 1, ry * 3), 1);
    assert.equal(p.chart.cells[1], 0);
  });

  it("un trazo largo crea un solo arreglo nuevo y conserva el resto del gráfico", () => {
    const { chart } = frozen(smallChart());
    const out = paintCells(chart, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }], 1, 3);
    assert.deepEqual(motif(out)[0], [1, 1, 1, 0]);
    assert.equal(out.repeat, chart.repeat);
  });

  it("ignora coordenadas fuera de rango y devuelve el mismo objeto si nada cambia", () => {
    const { chart } = frozen(smallChart());
    assert.equal(paintCells(chart, [{ x: -1, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 6 }, { x: 1.5, y: 0 }], 1, 3), chart);
    assert.equal(paintCells(chart, [{ x: 0, y: 0 }], 0, 3), chart);
    assert.equal(paintCells(chart, [], 1, 3), chart);
  });

  it("rechaza valores de celda inválidos", () => {
    const { chart } = frozen(smallChart());
    for (const v of [-2, 0.5, Number.NaN]) assert.equal(paintCells(chart, [{ x: 0, y: 0 }], v, 3), chart);
  });

  it("la herramienta sin punto escribe NO_STITCH", () => {
    const { chart } = frozen(smallChart());
    assert.equal(paintCells(chart, [{ x: 3, y: 0 }], NO_STITCH, 3).cells[3], NO_STITCH);
  });

  it("no lanza con un gráfico dañado", () => {
    const bad = { ...smallChart().chart, cells: [0] };
    assert.equal(paintCells(bad, [{ x: 0, y: 0 }], 1, 3), bad);
  });
});

describe("fillRegion", () => {
  const base = (): Chart => ({
    width: 4,
    height: 3,
    // fila 0: A A B A · fila 1: A B B A · fila 2: B A A A
    cells: [0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0],
    repeat: { x: 3, y: 2 },
    workedIn: "rounds",
    renderAs: "flat",
    direction: "bottom_up",
  });

  it("rellena por contigüidad con 4 vecinos, sin diagonales", () => {
    const c = frozen(base());
    const out = fillRegion(c, { x: 0, y: 0 }, 1, 3);
    // La región de A que empieza en (0,0) es (0,0), (1,0), (0,1). (3,*) y la fila 2 no se tocan.
    assert.deepEqual(motif(out), [[1, 1, 1, 0], [1, 1, 1, 0], [1, 0, 0, 0]]);
  });

  it("no envuelve los bordes del motivo", () => {
    // A en (0,0) y (3,0) son vecinas solo si se envuelve; no deben unirse.
    const c = frozen({ ...base(), cells: [0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1] });
    const out = fillRegion(c, { x: 0, y: 0 }, _, 3);
    assert.deepEqual(motif(out)[0], [_, 1, 1, 0]);
  });

  it("acepta un inicio en otra repetición del gráfico completo", () => {
    const c = frozen(base());
    assert.deepEqual(fillRegion(c, { x: 8, y: 3 }, 1, 3), fillRegion(c, { x: 0, y: 0 }, 1, 3));
  });

  it("rellena regiones sin punto y devuelve el mismo objeto si no hay cambio", () => {
    const c = frozen({ ...base(), cells: [_, _, 0, 0, _, 0, 0, 0, 0, 0, 0, 0] });
    assert.deepEqual(motif(fillRegion(c, { x: 0, y: 0 }, 0, 3)), [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    assert.equal(fillRegion(c, { x: 2, y: 0 }, 0, 3), c);
    assert.equal(fillRegion(c, { x: 99, y: 0 }, 1, 3), c);
    assert.equal(fillRegion(c, { x: 0, y: 0 }, -5, 3), c);
  });

  it("rellena un motivo de 200 × 200 sin desbordar la pila", () => {
    const c: Chart = { ...base(), width: 200, height: 200, cells: new Array<number>(40_000).fill(0) };
    const out = fillRegion(c, { x: 100, y: 100 }, 1, 3);
    assert.ok(out.cells.every((v) => v === 1));
  });
});

describe("resizeMotif", () => {
  const c3 = (): Chart => ({
    width: 3,
    height: 2,
    // fila 0: A B A · fila 1: B B A
    cells: [0, 1, 0, 1, 1, 0],
    repeat: { x: 2, y: 2 },
    workedIn: "rounds",
    renderAs: "flat",
    direction: "bottom_up",
  });

  it("agranda con anclaje abajo a la izquierda", () => {
    const out = resizeMotif(frozen(c3()), 5, 3, "bottom_left", _, 3);
    assert.deepEqual(motif(out), [[0, 1, 0, _, _], [1, 1, 0, _, _], [_, _, _, _, _]]);
    assert.deepEqual(out.repeat, { x: 2, y: 2 });
  });

  it("agranda con anclaje abajo a la derecha y abajo al centro", () => {
    assert.deepEqual(motif(resizeMotif(c3(), 5, 2, "bottom_right", 2, 3)), [[2, 2, 0, 1, 0], [2, 2, 1, 1, 0]]);
    assert.deepEqual(motif(resizeMotif(c3(), 5, 2, "bottom_center", 2, 3)), [[2, 0, 1, 0, 2], [2, 1, 1, 0, 2]]);
  });

  it("achica recortando según el anclaje", () => {
    assert.deepEqual(motif(resizeMotif(c3(), 2, 1, "bottom_left", 0, 3)), [[0, 1]]);
    assert.deepEqual(motif(resizeMotif(c3(), 2, 1, "bottom_right", 0, 3)), [[1, 0]]);
    assert.deepEqual(motif(resizeMotif(c3(), 1, 2, "center", 0, 3)), [[1], [1]]);
  });

  it("al centro reparte en los dos ejes", () => {
    assert.deepEqual(motif(resizeMotif(c3(), 5, 4, "center", _, 3)), [
      [_, _, _, _, _],
      [_, 0, 1, 0, _],
      [_, 1, 1, 0, _],
      [_, _, _, _, _],
    ]);
  });

  it("respeta el límite de 200 × 200 y rechaza parámetros inválidos", () => {
    const c = frozen(c3());
    assert.equal(resizeMotif(c, EDIT_LIMITS.maxMotifWidth + 1, 2, "bottom_left", 0, 3), c);
    assert.equal(resizeMotif(c, 3, EDIT_LIMITS.maxMotifHeight + 1, "bottom_left", 0, 3), c);
    assert.equal(resizeMotif(c, 0, 2, "bottom_left", 0, 3), c);
    assert.equal(resizeMotif(c, 2.5, 2, "bottom_left", 0, 3), c);
    assert.equal(resizeMotif(c, 4, 2, "top_left" as never, 0, 3), c);
    assert.equal(resizeMotif(c, 4, 2, "bottom_left", -2, 3), c);
    assert.equal(resizeMotif(c, 3, 2, "center", 0, 3), c);
    assert.equal(resizeMotif(c, 200, 200, "center", 0, 3).cells.length, 40_000);
  });
});

describe("setRepeat", () => {
  it("cambia las repeticiones y valida el rango", () => {
    const { chart } = frozen(smallChart());
    assert.deepEqual(setRepeat(chart, 8, 1).repeat, { x: 8, y: 1 });
    assert.equal(setRepeat(chart, 8, 1).cells, chart.cells);
    assert.equal(setRepeat(chart, 5, 2), chart);
    for (const [x, y] of [[0, 1], [1, 0], [1.5, 1], [EDIT_LIMITS.maxRepeat + 1, 1]]) assert.equal(setRepeat(chart, x!, y!), chart);
    assert.deepEqual(setRepeat(chart, EDIT_LIMITS.maxRepeat, 1).repeat, { x: EDIT_LIMITS.maxRepeat, y: 1 });
  });
});

describe("lanas", () => {
  it("addYarn agrega al final una copia y el documento sigue siendo válido", () => {
    const p = frozen(smallChart());
    const out = addYarn(p, yarnC);
    assert.equal(out.yarns.length, 3);
    assert.deepEqual(out.yarns[2], yarnC);
    assert.notEqual(out.yarns[2], yarnC);
    assert.equal(validatePattern(out).valid, true);
  });

  it("addYarn rechaza identificadores repetidos, lanas inválidas y más del máximo", () => {
    const p = frozen(smallChart());
    assert.equal(addYarn(p, { ...yarnC, id: "A" }), p);
    assert.equal(addYarn(p, { ...yarnC, id: "D", weight: 9 as never }), p);
    assert.equal(addYarn(p, { ...yarnC, id: "D", color: { hex: "rojo" } }), p);
    assert.equal(addYarn(p, { ...yarnC, id: "D", composition: [{ fiber: "lana", percent: 50 }] }), p);
    assert.equal(addYarn(p, { ...yarnC, id: "con espacio" }), p);
    const full: ChartPattern = { ...smallChart(), yarns: Array.from({ length: EDIT_LIMITS.maxYarns }, (_v, i) => ({ ...yarnA, id: `Y${i}` })) };
    assert.equal(addYarn(full, yarnC), full);
  });

  it("removeYarn pasa las celdas a la lana de reemplazo y remapea los índices", () => {
    const p: ChartPattern = frozen({ ...smallChart(), yarns: [yarnA, yarnB, yarnC], chart: { ...smallChart().chart, cells: [0, 1, 2, _, 2, 2, 1, 0, 0, 0, 0, 0] } });
    const out = removeYarn(p, 1, 2); // quita B; sus celdas pasan a C, que queda en el índice 1
    assert.deepEqual(out.yarns.map((y) => y.id), ["A", "C"]);
    assert.deepEqual(out.chart.cells, [0, 1, 1, _, 1, 1, 1, 0, 0, 0, 0, 0]);
    const out2 = removeYarn(p, 0, 1); // quita A; sus celdas pasan a B (índice 0)
    assert.deepEqual(out2.yarns.map((y) => y.id), ["B", "C"]);
    assert.deepEqual(out2.chart.cells, [0, 0, 1, _, 1, 1, 0, 0, 0, 0, 0, 0]);
    assert.equal(validatePattern(out2).valid, true);
  });

  it("removeYarn rechaza índices inválidos y no deja quitar la única lana", () => {
    const p = frozen(smallChart());
    for (const [i, r] of [[0, 0], [2, 0], [0, 2], [-1, 0], [0, NO_STITCH]]) assert.equal(removeYarn(p, i!, r!), p);
    const one: ChartPattern = frozen({ ...smallChart(), yarns: [yarnA], chart: { ...smallChart().chart, cells: new Array<number>(12).fill(0) } });
    assert.equal(removeYarn(one, 0, 0), one);
  });

  it("reorderYarns reordena las lanas sin cambiar el dibujo", () => {
    const p: ChartPattern = frozen({ ...smallChart(), yarns: [yarnA, yarnB, yarnC], chart: { ...smallChart().chart, cells: [0, 1, 2, _, 2, 2, 1, 0, 0, 0, 0, 0] } });
    const out = reorderYarns(p, [2, 0, 1]); // C, A, B
    assert.deepEqual(out.yarns.map((y) => y.id), ["C", "A", "B"]);
    for (let i = 0; i < 12; i++) {
      const before = p.chart.cells[i]!;
      const after = out.chart.cells[i]!;
      assert.equal(before === _ ? _ : p.yarns[before]!.id, after === _ ? _ : out.yarns[after]!.id);
    }
    assert.equal(reorderYarns(p, [0, 1, 2]), p);
    for (const bad of [[0, 1], [0, 0, 1], [0, 1, 3], [0, 1, 1.5]]) assert.equal(reorderYarns(p, bad), p);
  });

  it("yarnTotals se permuta igual que las lanas", () => {
    const p: ChartPattern = { ...smallChart(), yarns: [yarnA, yarnB, yarnC], chart: { ...smallChart().chart, cells: [0, 1, 2, _, 2, 2, 1, 0, 0, 0, 0, 0] } };
    const order = [1, 2, 0];
    const before = yarnTotals(p.chart, 3);
    assert.deepEqual(yarnTotals(reorderYarns(p, order).chart, 3), order.map((o) => before[o]));
  });
});

describe("newChartPattern", () => {
  const input = (): NewChartInput => ({
    id: "nuevo",
    title: "Copa en cuña",
    width: 10,
    height: 12,
    repeat: { x: 8, y: 1 },
    workedIn: "rounds",
    renderAs: "circle",
    direction: "bottom_up",
    yarns: [yarnA, yarnB],
  });

  it("crea un documento válido, todo en la lana de fondo y de origen manual", () => {
    const p = newChartPattern(frozen(input()));
    assert.equal(p.schemaVersion, 1);
    assert.equal(p.kind, "chart");
    assert.equal(p.technique, "knit");
    assert.deepEqual(p.origin, { kind: "manual" });
    assert.equal(p.chart.cells.length, 120);
    assert.ok(p.chart.cells.every((v) => v === 0));
    assert.equal(p.gauge, undefined);
    assert.ok(!("gauge" in p));
    const r = validatePattern(p);
    assert.equal(r.valid, true, JSON.stringify(r.issues));
  });

  it("incluye la muestra solo si viene y copia las lanas", () => {
    const i = input();
    const p = newChartPattern({ ...i, gauge: { stitchesPer10cm: 24, rowsPer10cm: 28 } });
    assert.deepEqual(p.gauge, { stitchesPer10cm: 24, rowsPer10cm: 28 });
    assert.notEqual(p.yarns[0], i.yarns[0]);
    assert.notEqual(p.chart.repeat, i.repeat);
  });

  it("con un tamaño fuera de 1 a 200 no lanza y el validador lo informa", () => {
    for (const [w, h] of [[0, 5], [201, 5], [5, 1e9], [2.5, 3]]) {
      const p = newChartPattern({ ...input(), width: w!, height: h! });
      assert.deepEqual(p.chart.cells, []);
      assert.equal(validatePattern(p).valid, false);
    }
  });
});
