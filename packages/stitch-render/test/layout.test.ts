/**
 * Propiedades de la disposición (ADR 0004, "Consecuencias"; ADR 0005, "Pruebas de propiedades").
 * Reproducir un fallo: SEED=<semilla> node --test test/layout.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_STITCH, cellAt, cellIndex, fullSize, motifCoord, paintCells, rowStitchCount, stitchTotal, wornOrientation, type Chart } from "@loopitalab/pattern-core";
import { HIDDEN, colorize, hitTest, layoutGeometry, layoutInstanceCount, needsRelayout, visibleCount, type StitchLayout } from "../src/index.ts";
import { forAll } from "./support/property.ts";
import { GAUGE, chartFrom, randomChart, randomGauge } from "./support/fixtures.ts";

const TAU = Math.PI * 2;
const EPS = 1e-3;

function build(chart: Chart, over: Partial<Parameters<typeof layoutGeometry>[1]> = {}): StitchLayout {
  const l = layoutGeometry(chart, { gauge: GAUGE, ...over });
  colorize(l, chart);
  return l;
}

const near = (a: number, b: number, eps = EPS) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
const normAngle = (a: number) => ((a % TAU) + TAU) % TAU;

test("propiedad: las instancias visibles son stitchTotal en toda forma; plano y tubo tienen una instancia por casilla", () => {
  forAll(
    "conteo",
    (r) => ({ chart: randomChart(r), gauge: randomGauge(r) }),
    ({ chart, gauge }) => {
      const l = layoutGeometry(chart, { gauge });
      colorize(l, chart);
      let withStitch = 0;
      for (let i = 0; i < l.count; i++) if (l.yarn[i] !== HIDDEN) withStitch++;
      assert.equal(withStitch, stitchTotal(chart));
      assert.equal(l.count, layoutInstanceCount(chart));
      const { width, height } = fullSize(chart);
      if (chart.renderAs === "circle") assert.equal(l.count, stitchTotal(chart));
      else assert.equal(l.count, width * height);
    },
  );
});

test("propiedad: cambiar la forma nunca cambia los puntos visibles (= stitchTotal)", () => {
  forAll(
    "forma",
    (r) => randomChart(r),
    (chart) => {
      for (const shape of ["flat", "tube", "circle", "yoke"] as const) {
        const l = build(chart, { shape });
        let n = 0;
        for (let i = 0; i < l.count; i++) if (l.yarn[i] !== HIDDEN) n++;
        assert.equal(n, stitchTotal(chart), shape);
      }
    },
    150,
  );
});

test("propiedad: toda instancia tiene la lana de cellAt y la celda del motivo de motifCoord", () => {
  forAll(
    "lana",
    (r) => randomChart(r),
    (chart) => {
      const l = build(chart);
      for (let i = 0; i < l.count; i++) {
        const x = l.col[i] as number;
        const y = l.row[i] as number;
        const v = cellAt(chart, x, y);
        assert.equal(l.yarn[i], v === NO_STITCH ? HIDDEN : v);
        const m = motifCoord(chart, x, y);
        assert.equal(l.motifCell[i], cellIndex(chart, m.x, m.y));
      }
    },
  );
});

test("propiedad: el alto del punto sale de la muestra (alto/ancho = puntos/filas)", () => {
  forAll(
    "proporción",
    (r) => ({ chart: randomChart(r), gauge: randomGauge(r), px: r.int(4, 30) }),
    ({ chart, gauge, px }) => {
      const l = layoutGeometry(chart, { gauge, stitchPx: px });
      assert.ok(near(l.geometry.stitchW, px));
      assert.ok(near(l.geometry.stitchH / l.geometry.stitchW, gauge.stitchesPer10cm / gauge.rowsPer10cm));
    },
    100,
  );
});

test("propiedad: en plano, cada casilla ocupa su celda de la grilla vista según wornOrientation", () => {
  forAll(
    "plano",
    (r) => randomChart(r),
    (chart) => {
      const l = build(chart, { shape: "flat" });
      const { stitchW: sw, stitchH: sh, pad } = l.geometry;
      const { width: W, height: H } = fullSize(chart);
      for (let i = 0; i < l.count; i++) {
        const p = wornOrientation(chart, l.col[i] as number, l.row[i] as number);
        assert.ok(near(l.x[i] as number, pad + (p.x + 0.5) * sw));
        assert.ok(near(l.y[i] as number, pad + (H - 1 - p.y + 0.5) * sh));
        assert.equal(l.angle[i], chart.direction === "top_down" ? Math.fround(Math.PI) : 0);
      }
      assert.ok(near(l.bounds.width, W * sw + 2 * pad));
    },
  );
});

test("propiedad: en top_down, aplicar la rotación de 180° a la disposición devuelve la de bottom_up (plano y tubo)", () => {
  forAll(
    "rotación",
    (r) => ({ chart: randomChart(r), shape: r.pick(["flat", "tube"] as const) }),
    ({ chart, shape }) => {
      const bu = build({ ...chart, direction: "bottom_up" }, { shape });
      const td = build({ ...chart, direction: "top_down" }, { shape });
      const { width: W, height: H } = fullSize(chart);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          // La celda (x, y) en top_down se ve donde bottom_up muestra (W−1−x, H−1−y).
          const j = (H - 1 - y) * W + (W - 1 - x);
          assert.ok(near(td.x[i] as number, bu.x[j] as number), `x ${x},${y}`);
          assert.ok(near(td.y[i] as number, bu.y[j] as number), `y ${x},${y}`);
          if (shape === "flat") {
            // Rotar 180° alrededor del centro de la pieza devuelve la posición de bottom_up.
            assert.ok(near(td.bounds.width - (td.x[i] as number), bu.x[i] as number));
            assert.ok(near(td.bounds.height - (td.y[i] as number), bu.y[i] as number));
          }
        }
    },
    150,
  );
});

test("caso 5: top_down 3 × 2, la fila 0 vista es B A A y la fila 1 vista es A B A (no es un espejo vertical)", () => {
  const chart = chartFrom(["ABA", "AAB"], { direction: "top_down", renderAs: "flat" });
  const l = build(chart);
  const rowsOnScreen = new Map<number, { x: number; yarn: number }[]>();
  for (let i = 0; i < l.count; i++) {
    const key = Math.round(l.y[i] as number);
    const list = rowsOnScreen.get(key) ?? [];
    list.push({ x: l.x[i] as number, yarn: l.yarn[i] as number });
    rowsOnScreen.set(key, list);
  }
  const ys = [...rowsOnScreen.keys()].sort((a, b) => b - a); // de abajo hacia arriba en pantalla
  const seen = ys.map((y) => (rowsOnScreen.get(y) ?? []).sort((a, b) => a.x - b.x).map((s) => "ABC"[s.yarn]).join(""));
  assert.deepEqual(seen, ["BAA", "ABA"]);
  // Aplicar wornOrientation dos veces devuelve el original.
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 3; x++) {
      const p = wornOrientation(chart, x, y);
      assert.deepEqual(wornOrientation(chart, p.x, p.y), { x, y });
    }
  // La V gira 180°: abre hacia abajo, hacia donde crece la labor en la vista.
  for (let i = 0; i < l.count; i++) assert.equal(l.angle[i], Math.fround(Math.PI));
});

test("tubo: la cara trasera no se ve (shade 0), la de frente se comprime con cos φ y la rotación desplaza las columnas", () => {
  forAll(
    "tubo",
    (r) => ({ chart: randomChart(r, { maxSide: 12 }), rot: r.next() * TAU }),
    ({ chart, rot }) => {
      const l = build(chart, { shape: "tube", tubeRotation: rot });
      const g = l.geometry;
      for (let i = 0; i < l.count; i++) {
        const s = l.shade[i] as number;
        const sx = l.scaleX[i] as number;
        assert.ok(s === 0 || (s > 0.55 - 1e-6 && s <= 1 + 1e-6));
        assert.ok(sx >= 0 && sx <= 1 + 1e-6);
        assert.equal(s === 0, sx === 0);
        assert.ok(Math.abs((l.x[i] as number) - g.cx) <= g.radius * (1 + 1e-5));
      }
    },
    150,
  );
});

// ------------------------------------------------------------- Círculo (ADR 0005)

function polar(l: StitchLayout, i: number) {
  const dx = (l.x[i] as number) - l.geometry.cx;
  const dy = (l.y[i] as number) - l.geometry.cy;
  return { r: Math.hypot(dx, dy), dx, dy };
}

test("caso 27: en cada anillo los arcos suman 2π y las instancias son rowStitchCount(y); bottom_up deja la fila 0 afuera y top_down al centro", () => {
  forAll(
    "anillos",
    (r) => ({ chart: { ...randomChart(r), renderAs: "circle" as const }, gauge: randomGauge(r) }),
    ({ chart, gauge }) => {
      const l = layoutGeometry(chart, { gauge });
      const g = l.geometry;
      const H = g.fullHeight;
      for (let y = 0; y < H; y++) {
        const a = g.rowStart[y] as number;
        const b = g.rowStart[y + 1] as number;
        assert.equal(b - a, rowStitchCount(chart, y));
        const k = chart.direction === "top_down" ? y : H - 1 - y;
        let arcs = 0;
        for (let i = a; i < b; i++) {
          const { r } = polar(l, i);
          assert.ok(near(r, (k + 0.5) * g.stitchH), "radio del anillo");
          assert.equal(l.row[i], y);
          arcs += ((l.scaleX[i] as number) * g.stitchW) / r;
        }
        if (b > a) assert.ok(near(arcs, TAU), `arcos de la fila ${y}: ${arcs}`);
      }
      // Fila 0: anillo exterior en bottom_up, centro en top_down.
      if (rowStitchCount(chart, 0) > 0) {
        const r0 = polar(l, 0).r;
        const expected = chart.direction === "top_down" ? 0.5 * g.stitchH : (H - 0.5) * g.stitchH;
        assert.ok(near(r0, expected));
      }
    },
  );
});

test("CA-F3: cuña de 8 repeticiones de 10 a 1 punto: 80 → 8 puntos por vuelta, sin huecos radiales", () => {
  const rows: string[] = [];
  for (let n = 10; n >= 1; n--) rows.push("A".repeat(n) + ".".repeat(10 - n));
  const chart = chartFrom(rows, { repeat: { x: 8, y: 1 }, renderAs: "circle" });
  const l = build(chart);
  const g = l.geometry;
  const perRing: number[] = [];
  for (let y = 0; y < g.fullHeight; y++) {
    const a = g.rowStart[y] as number;
    const b = g.rowStart[y + 1] as number;
    perRing.push(b - a);
    // Ángulos uniformes: el punto j de la vuelta está en (j + 0,5)·2π/n; arcos contiguos sin huecos.
    const n = b - a;
    for (let j = 0; j < n; j++) {
      const { dx, dy } = polar(l, a + j);
      const theta = normAngle(Math.atan2(dx, dy)); // bottom_up: antihorario
      assert.ok(near(theta, ((j + 0.5) * TAU) / n, 1e-4), `vuelta ${y}, punto ${j}`);
    }
  }
  assert.deepEqual(perRing, [80, 72, 64, 56, 48, 40, 32, 24, 16, 8]);
  assert.equal(l.count, stitchTotal(chart));
});

test("caso 26: bottom_up gira antihorario visto desde arriba, top_down horario; invertir direction espeja los ángulos (validar con tejedora)", () => {
  // validar con tejedora: sentido de giro del círculo (caso 26, T1b). Si las tejedoras lo corrigen, cambiar los signos esperados.
  forAll(
    "sentido",
    (r) => ({ ...randomChart(r), renderAs: "circle" as const }),
    (chart) => {
      const bu = build({ ...chart, direction: "bottom_up" });
      const td = build({ ...chart, direction: "top_down" });
      for (const [l, sign] of [[bu, -1], [td, 1]] as const) {
        const g = l.geometry;
        for (let y = 0; y < g.fullHeight; y++) {
          const a = g.rowStart[y] as number;
          const b = g.rowStart[y + 1] as number;
          if (b - a < 3) continue;
          // Producto cruz en pantalla (y hacia abajo): negativo = antihorario a la vista.
          const p = polar(l, a);
          const q = polar(l, a + 1);
          const cross = p.dx * q.dy - p.dy * q.dx;
          assert.equal(Math.sign(cross), sign, `fila ${y}`);
        }
      }
      // Espejo: para la misma celda, el ángulo de pantalla cambia de signo.
      for (let i = 0; i < bu.count; i++) {
        assert.equal(bu.col[i], td.col[i]);
        const a = polar(bu, i);
        const b = polar(td, i);
        const ta = Math.atan2(a.dx, a.dy);
        const tb = Math.atan2(b.dx, b.dy);
        assert.ok(near(normAngle(ta + tb + 1e-9) , 0, 1e-4) || near(normAngle(ta + tb), TAU, 1e-4), `instancia ${i}`);
      }
    },
    150,
  );
});

test("círculo: la V es radial y abre hacia donde crece la labor (centro en bottom_up, afuera en top_down)", () => {
  forAll(
    "orientación V",
    (r) => ({ ...randomChart(r), renderAs: "circle" as const }),
    (chart) => {
      const l = build(chart);
      for (let i = 0; i < l.count; i++) {
        const { dx, dy, r } = polar(l, i);
        const a = l.angle[i] as number;
        // Dirección hacia donde abre la V en pantalla.
        const ux = Math.sin(a);
        const uy = -Math.cos(a);
        const dot = (ux * -dx + uy * -dy) / r; // contra el vector al centro
        if (chart.direction === "top_down") assert.ok(dot < -0.999, `afuera ${dot}`);
        else assert.ok(dot > 0.999, `centro ${dot}`);
      }
    },
    150,
  );
});

test("círculo: ringDistortion es el arco disponible sobre el ancho del punto, por anillo", () => {
  const rows = ["AAAAAAAA", "AAAAAA..", "AAAA....", "AA......"];
  const chart = chartFrom(rows, { repeat: { x: 6, y: 1 }, renderAs: "circle" });
  const l = build(chart);
  const g = l.geometry;
  assert.ok(l.ringDistortion);
  for (let y = 0; y < g.fullHeight; y++) {
    const k = g.fullHeight - 1 - y;
    const c = rowStitchCount(chart, y) / 6;
    const expected = (TAU * (k + 0.5) * g.stitchH) / (6 * c) / g.stitchW;
    assert.ok(near(l.ringDistortion[k] as number, expected));
  }
});

test("gráfico vacío (CHART_EMPTY, guardable por E10): no lanza; en plano todo queda oculto y en círculo no hay instancias", () => {
  const chart = chartFrom(["...", "..."]);
  const flat = build(chart, { shape: "flat" });
  assert.equal(flat.count, 6);
  assert.equal(visibleCount(flat), 0);
  const circle = build(chart, { shape: "circle" });
  assert.equal(circle.count, 0);
  assert.equal(hitTest(circle, circle.geometry.cx, circle.geometry.cy), null);
});

test("muestra o stitchPx inválidos lanzan RangeError", () => {
  const chart = chartFrom(["AB"]);
  assert.throws(() => layoutGeometry(chart, { gauge: { stitchesPer10cm: 0, rowsPer10cm: 30 } }), RangeError);
  assert.throws(() => layoutGeometry(chart, { gauge: { stitchesPer10cm: 22, rowsPer10cm: Number.NaN } }), RangeError);
  assert.throws(() => layoutGeometry(chart, { gauge: GAUGE, stitchPx: -1 }), RangeError);
});

// ------------------------------------------------------------- Color incremental

test("propiedad: colorize incremental tras paintCells deja lo mismo que un colorize completo, y devuelve todas las instancias de esas celdas", () => {
  forAll(
    "colorize",
    (r) => {
      const chart = { ...randomChart(r), renderAs: r.pick(["flat", "tube"] as const) };
      const { width, height } = fullSize(chart);
      const refs = Array.from({ length: r.int(1, 5) }, () => ({ x: r.int(0, width - 1), y: r.int(0, height - 1) }));
      const value = r.bool(0.2) ? NO_STITCH : r.int(0, 3);
      return { chart, refs, value };
    },
    ({ chart, refs, value }) => {
      const l = build(chart);
      const next = paintCells(chart, refs, value, 4);
      assert.equal(needsRelayout(l, next), false, "en plano y tubo la máscara no cambia la geometría");
      const cells = refs.map((p) => {
        const m = motifCoord(chart, p.x, p.y);
        return cellIndex(chart, m.x, m.y);
      });
      const touched = colorize(l, next, cells);
      const ref = build(next);
      assert.deepEqual([...l.yarn], [...ref.yarn]);
      const expected = new Set<number>();
      for (let i = 0; i < l.count; i++) if (cells.includes(l.motifCell[i] as number)) expected.add(i);
      assert.deepEqual(new Set(touched), expected);
      assert.equal(touched.length, expected.size, "sin duplicados");
    },
  );
});

test("needsRelayout: en el círculo, pintar o quitar 'sin punto' exige geometría nueva; cambiar de lana no", () => {
  const chart = chartFrom(["AAAA", "AAA."], { repeat: { x: 6, y: 1 }, renderAs: "circle" });
  const l = build(chart);
  const recolor = paintCells(chart, [{ x: 0, y: 0 }], 1, 2);
  assert.equal(needsRelayout(l, recolor), false);
  assert.equal(needsRelayout(l, recolor, [0]), false);
  const hole = paintCells(chart, [{ x: 1, y: 0 }], NO_STITCH, 2);
  assert.equal(needsRelayout(l, hole), true);
  assert.equal(needsRelayout(l, hole, [1]), true);
  const restore = paintCells(chart, [{ x: 3, y: 1 }], 0, 2);
  assert.equal(needsRelayout(l, restore, [7]), true);
  assert.equal(needsRelayout(l, { ...chart, repeat: { x: 8, y: 1 } }), true);
  assert.equal(needsRelayout(l, { ...chart, direction: "top_down" }), true);
});
