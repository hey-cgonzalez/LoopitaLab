/**
 * QA de T5/T6 (bordes): tope de instancias, `hitTest` fuera de la pieza en cada forma y
 * `needsRelayout` como contrato (si dice que no hace falta, la disposición vieja da lo mismo
 * que una nueva).
 * Reproducir un fallo: SEED=<semilla> node --test test/qa-bordes.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_STITCH, paintCells, stitchTotal, type Chart } from "@loopitalab/pattern-core";
import { MAX_LAYOUT_INSTANCES, colorize, hitTest, layoutGeometry, layoutInstanceCount, needsRelayout, visibleCount, type StitchLayout } from "../src/index.ts";
import { forAll } from "./support/property.ts";
import { GAUGE, chartFrom, randomChart } from "./support/fixtures.ts";

function build(chart: Chart, over: Partial<Parameters<typeof layoutGeometry>[1]> = {}): StitchLayout {
  const l = layoutGeometry(chart, { gauge: GAUGE, ...over });
  colorize(l, chart);
  return l;
}

/** Motivo `w × h` de una sola lana con repeticiones `rx × ry`; `holeCols` columnas finales sin punto. */
function solid(w: number, h: number, rx: number, ry: number, renderAs: Chart["renderAs"], holeCols = 0): Chart {
  const cells: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push(x >= w - holeCols ? NO_STITCH : 0);
  return { width: w, height: h, cells, repeat: { x: rx, y: ry }, workedIn: "rounds", renderAs, direction: "bottom_up" };
}

// ---------------------------------------------------------------- tope de 1.000.000

test("MAX_LAYOUT_INSTANCES es 1.000.000: justo en el tope se construye, uno más lanza RangeError", () => {
  assert.equal(MAX_LAYOUT_INSTANCES, 1_000_000);
  // 200 × 200 × 5 × 5 = 1.000.000 exacto en plano.
  const exact = solid(200, 200, 5, 5, "flat");
  assert.equal(layoutInstanceCount(exact), 1_000_000);
  const l = layoutGeometry(exact, { gauge: GAUGE });
  assert.equal(l.count, 1_000_000);
  // 101 × 1 × 9901 × 1 = 1.000.001 (uno más).
  const over = solid(101, 1, 9901, 1, "tube");
  assert.equal(layoutInstanceCount(over), 1_000_001);
  assert.throws(() => layoutGeometry(over, { gauge: GAUGE }), (e: unknown) => e instanceof RangeError && /1000001 puntos superan el máximo/.test((e as Error).message));
});

test("el tope se revisa antes de reservar memoria: el máximo del editor (200 × 200 × 500 × 500) falla en pocos milisegundos", () => {
  const huge = solid(200, 200, 500, 500, "flat");
  const t0 = performance.now();
  assert.throws(() => layoutGeometry(huge, { gauge: GAUGE }), RangeError);
  assert.throws(() => layoutGeometry({ ...huge, renderAs: "circle" }, { gauge: GAUGE }), RangeError);
  assert.ok(performance.now() - t0 < 200, "no debe construir arreglos de 10.000 millones");
});

test("el tope depende de la forma: en círculo cuentan solo los puntos (stitchTotal); en plano y tubo, todas las casillas", () => {
  // 201 × 200 con la última columna sin punto, 5 × 5: 1.005.000 casillas pero 1.000.000 puntos.
  const c = solid(201, 200, 5, 5, "circle", 1);
  assert.equal(stitchTotal(c), 1_000_000);
  assert.equal(layoutInstanceCount(c), 1_000_000);
  assert.equal(layoutGeometry(c, { gauge: GAUGE }).count, 1_000_000);
  assert.equal(layoutInstanceCount(c, { shape: "flat" }), 1_005_000);
  assert.throws(() => layoutGeometry(c, { gauge: GAUGE, shape: "flat" }), RangeError);
  assert.throws(() => layoutGeometry(c, { gauge: GAUGE, shape: "tube" }), RangeError);
});

test("propiedad: layoutInstanceCount predice l.count en toda forma", () => {
  forAll(
    "conteo previsto",
    (r) => ({ chart: randomChart(r), shape: r.pick(["flat", "tube", "circle"] as const) }),
    ({ chart, shape }) => {
      assert.equal(layoutGeometry(chart, { gauge: GAUGE, shape }).count, layoutInstanceCount(chart, { shape }));
    },
  );
});

// ---------------------------------------------------------------- hitTest fuera de la pieza

test("hitTest fuera de la pieza devuelve null en plano, tubo y círculo (márgenes, infinitos, lejos)", () => {
  const rows = ["AB.A", "BBAA", "A..B"];
  for (const renderAs of ["flat", "tube", "circle"] as const) {
    for (const direction of ["bottom_up", "top_down"] as const) {
      const l = build(chartFrom(rows, { repeat: { x: 3, y: 2 }, renderAs, direction }));
      const { width: W, height: H } = l.bounds;
      const g = l.geometry;
      const outside: [number, number][] = [
        [-1e6, H / 2], [W / 2, -1e6], [1e6, H / 2], [W / 2, 1e6], [-0.001, -0.001], [W + 0.001, H + 0.001],
        [Number.POSITIVE_INFINITY, 0], [0, Number.NEGATIVE_INFINITY], [Number.NaN, Number.NaN],
      ];
      // Dentro del rectángulo de la pieza pero en el margen (pad): fuera de toda casilla.
      if (renderAs === "flat") outside.push([g.pad / 2, H / 2], [W / 2, g.pad / 2], [W - g.pad / 2, H / 2], [W / 2, H - g.pad / 2]);
      // Tubo: a los lados del cilindro (|x − cx| > radio).
      if (renderAs === "tube") outside.push([g.cx - g.radius - 0.01, H / 2], [g.cx + g.radius + 0.01, H / 2]);
      // Círculo: esquinas del rectángulo envolvente (fuera del radio exterior).
      if (renderAs === "circle") outside.push([0.01, 0.01], [W - 0.01, H - 0.01]);
      for (const [px, py] of outside) assert.equal(hitTest(l, px, py), null, `${renderAs}/${direction} (${px}, ${py})`);
    }
  }
});

test("hitTest en un gráfico vacío (todo sin punto): en círculo siempre null; en plano devuelve la casilla oculta, que se puede volver a pintar", () => {
  const empty = chartFrom(["...", "..."], { repeat: { x: 2, y: 2 } });
  const circle = build({ ...empty, renderAs: "circle" });
  assert.equal(circle.count, 0);
  for (let px = 0; px <= circle.bounds.width; px += 1) assert.equal(hitTest(circle, px, circle.bounds.height / 2), null);
  const flat = build({ ...empty, renderAs: "flat" });
  assert.equal(visibleCount(flat), 0);
  assert.notEqual(hitTest(flat, flat.bounds.width / 2, flat.bounds.height / 2), null);
});

// ---------------------------------------------------------------- needsRelayout

test("propiedad: si needsRelayout dice false tras pintar, colorize sobre la disposición vieja equivale a una disposición nueva", () => {
  forAll(
    "relayout",
    (r) => {
      const chart = randomChart(r);
      const n = r.int(1, 6);
      const refs = Array.from({ length: n }, () => ({ x: r.int(0, chart.width * chart.repeat.x - 1), y: r.int(0, chart.height * chart.repeat.y - 1) }));
      const value = r.bool(0.3) ? NO_STITCH : r.int(0, 3);
      return { chart, refs, value, shape: r.pick(["flat", "tube", "circle"] as const) };
    },
    ({ chart, refs, value, shape }) => {
      const old = build(chart, { shape });
      const next = paintCells(chart, refs, value, 4);
      const touched: number[] = [];
      for (let i = 0; i < chart.cells.length; i++) if (chart.cells[i] !== next.cells[i]) touched.push(i);
      const full = needsRelayout(old, next);
      // La versión incremental coincide con la completa cuando se le pasan las celdas tocadas.
      assert.equal(needsRelayout(old, next, touched), full);
      if (full) {
        assert.equal(shape, "circle", "en plano y tubo pintar nunca cambia la geometría");
        return;
      }
      const fresh = build(next, { shape });
      colorize(old, next);
      assert.equal(old.count, fresh.count);
      assert.deepEqual([...old.yarn], [...fresh.yarn]);
      assert.equal(visibleCount(old), visibleCount(fresh));
    },
  );
});

test("needsRelayout en plano y tubo: quitar o poner 'sin punto' no exige geometría nueva; cambiar tamaño, repeticiones o dirección sí", () => {
  for (const renderAs of ["flat", "tube"] as const) {
    const chart = chartFrom(["AB", "BA"], { repeat: { x: 2, y: 2 }, renderAs });
    const l = build(chart);
    assert.equal(needsRelayout(l, paintCells(chart, [{ x: 0, y: 0 }], NO_STITCH, 2)), false);
    assert.equal(needsRelayout(l, { ...chart, repeat: { x: 3, y: 2 } }), true);
    assert.equal(needsRelayout(l, { ...chart, repeat: { x: 2, y: 3 } }), true);
    assert.equal(needsRelayout(l, { ...chart, direction: "top_down" }), true);
    assert.equal(needsRelayout(l, chartFrom(["ABA", "BAB"], { repeat: { x: 2, y: 2 }, renderAs })), true);
  }
});

test("needsRelayout con celdas: ignora índices fuera de rango o no enteros (no lanza ni da falsos positivos)", () => {
  const chart = chartFrom(["AAAA", "AAA."], { repeat: { x: 6, y: 1 }, renderAs: "circle" });
  const l = build(chart);
  assert.equal(needsRelayout(l, chart, [-1, 8, 1e9, 1.5, Number.NaN]), false);
  const hole = paintCells(chart, [{ x: 1, y: 0 }], NO_STITCH, 2);
  assert.equal(needsRelayout(l, hole, [-1, 1e9]), false, "solo revisa las celdas que se le indican");
  assert.equal(needsRelayout(l, hole, [-1, 1]), true);
});
