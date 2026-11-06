/**
 * Cálculo puro de regiones a redibujar y grilla espacial.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, colorize, deviceBox, dirtyRegions, instanceBounds, layoutGeometry, queryGrid, tileClass, tilePlan, tileRect, tileRepresentative } from "../src/index.ts";
import { forAll } from "./support/property.ts";
import { GAUGE, randomChart } from "./support/fixtures.ts";

test("propiedad: queryGrid devuelve exactamente las instancias cuya caja cruza el rectángulo, en orden ascendente", () => {
  forAll(
    "grilla",
    (r) => {
      const chart = randomChart(r);
      const rects = Array.from({ length: 8 }, () => ({ u: r.next(), v: r.next(), w: r.next() * 0.5, h: r.next() * 0.5 }));
      return { chart, rects };
    },
    ({ chart, rects }) => {
      const l = layoutGeometry(chart, { gauge: GAUGE });
      colorize(l, chart);
      const boxes = instanceBounds(l);
      const grid = buildGrid(l, boxes);
      for (const q of rects) {
        const rect = { x: q.u * l.bounds.width, y: q.v * l.bounds.height, w: q.w * l.bounds.width, h: q.h * l.bounds.height };
        const got = [...queryGrid(grid, boxes, rect)];
        const want: number[] = [];
        for (let i = 0; i < l.count; i++) {
          if ((boxes[i * 4] as number) <= rect.x + rect.w && (boxes[i * 4 + 2] as number) >= rect.x && (boxes[i * 4 + 1] as number) <= rect.y + rect.h && (boxes[i * 4 + 3] as number) >= rect.y) want.push(i);
        }
        assert.deepEqual(got, want);
      }
    },
    150,
  );
});

test("propiedad: la caja de cada instancia contiene su celda y las puntas de la V", () => {
  forAll(
    "cajas",
    (r) => randomChart(r),
    (chart) => {
      const l = layoutGeometry(chart, { gauge: GAUGE });
      const boxes = instanceBounds(l);
      const { stitchW, stitchH } = l.geometry;
      for (let i = 0; i < l.count; i++) {
        const cx = l.x[i] as number;
        const cy = l.y[i] as number;
        // El centro siempre adentro; en plano, la celda completa.
        assert.ok((boxes[i * 4] as number) <= cx && (boxes[i * 4 + 2] as number) >= cx);
        assert.ok((boxes[i * 4 + 1] as number) <= cy && (boxes[i * 4 + 3] as number) >= cy);
        if (l.geometry.shape === "flat") {
          assert.ok((boxes[i * 4] as number) <= cx - stitchW / 2 + 1e-4);
          assert.ok((boxes[i * 4 + 3] as number) >= cy + stitchH / 2 - 1e-4);
          // La V monta sobre la fila que sigue: hacia arriba en bottom_up y hacia abajo en top_down.
          if (chart.direction === "bottom_up") assert.ok((boxes[i * 4 + 1] as number) < cy - stitchH / 2 - 1e-3);
          else assert.ok((boxes[i * 4 + 3] as number) > cy + stitchH / 2 + 1e-3);
        }
        // Dentro de los límites de la disposición.
        assert.ok((boxes[i * 4] as number) >= -1e-3 && (boxes[i * 4 + 2] as number) <= l.bounds.width + 1e-3);
        assert.ok((boxes[i * 4 + 1] as number) >= -1e-3 && (boxes[i * 4 + 3] as number) <= l.bounds.height + 1e-3);
      }
    },
    150,
  );
});

test("propiedad: dirtyRegions cubre la parte visible de cada caja tocada, sin regiones solapadas y dentro del canvas", () => {
  forAll(
    "regiones",
    (r) => {
      const chart = randomChart(r);
      return { chart, zoom: 0.3 + r.next() * 4, panX: r.int(-300, 300), panY: r.int(-300, 300), dpr: r.pick([1, 1.5, 2]), pick: r.int(1, 12), seed: r.int(0, 1e6) };
    },
    ({ chart, zoom, panX, panY, dpr, pick, seed }) => {
      const l = layoutGeometry(chart, { gauge: GAUGE });
      const boxes = instanceBounds(l);
      const W = 640;
      const H = 480;
      const touched: number[] = [];
      for (let k = 0; k < Math.min(pick, l.count); k++) touched.push((seed + k * 7919) % l.count);
      const view = { zoom, panX, panY };
      const regions = dirtyRegions(boxes, touched, view, dpr, W, H);
      for (const g of regions) {
        assert.ok(g.x >= 0 && g.y >= 0 && g.x + g.w <= W && g.y + g.h <= H && g.w > 0 && g.h > 0);
      }
      for (let a = 0; a < regions.length; a++)
        for (let b = a + 1; b < regions.length; b++) {
          const p = regions[a]!;
          const q = regions[b]!;
          const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
          assert.ok(!overlap, "regiones solapadas");
        }
      for (const i of touched) {
        const b = deviceBox(boxes, i, view, dpr);
        // Muestreo de la caja recortada al canvas.
        const x0 = Math.max(0, b.x);
        const y0 = Math.max(0, b.y);
        const x1 = Math.min(W - 0.01, b.x + b.w);
        const y1 = Math.min(H - 0.01, b.y + b.h);
        if (x1 < x0 || y1 < y0) continue;
        for (const px of [x0, (x0 + x1) / 2, x1])
          for (const py of [y0, (y0 + y1) / 2, y1])
            assert.ok(regions.some((g) => px >= g.x && px <= g.x + g.w && py >= g.y && py <= g.y + g.h), `(${px}, ${py})`);
      }
    },
    200,
  );
});

test("dirtyRegions: sin instancias o fuera del canvas no hay regiones", () => {
  const chart = randomChart({ next: () => 0.5, int: (a) => a + 1, pick: (x) => x[0] as never, bool: () => false });
  const l = layoutGeometry(chart, { gauge: GAUGE });
  const boxes = instanceBounds(l);
  assert.deepEqual(dirtyRegions(boxes, [], { zoom: 1, panX: 0, panY: 0 }, 1, 100, 100), []);
  assert.deepEqual(dirtyRegions(boxes, [0], { zoom: 1, panX: 10_000, panY: 0 }, 1, 100, 100), []);
});

test("propiedad: las baldosas cubren la pieza sin solaparse y la pieza es periódica (cada baldosa se ve igual que su representante)", () => {
  forAll(
    "baldosas",
    (r) => {
      const chart = { ...randomChart(r, { maxSide: 6, maxRepeat: 6 }), renderAs: r.pick(["flat", "tube"] as const) };
      return chart;
    },
    (chart) => {
      const l = layoutGeometry(chart, { gauge: GAUGE });
      colorize(l, chart);
      const plan = tilePlan(l);
      if (!plan) return;
      // Cobertura: la suma de áreas es el área de la pieza y no hay solapes.
      let area = 0;
      const rects = [];
      for (let j = 0; j < plan.ny; j++) for (let i = 0; i < plan.nx; i++) rects.push(tileRect(l, plan, i, j));
      for (const t of rects) area += t.w * t.h;
      assert.ok(Math.abs(area - l.bounds.width * l.bounds.height) < 1e-6 * l.bounds.width * l.bounds.height);
      // Periodicidad: cada instancia tiene una gemela en la baldosa representante, con la misma
      // posición relativa (respecto del inicio de la baldosa sin margen), lana, escala y sombra.
      const g = l.geometry;
      const px = (g.fullWidth / plan.nx) * g.stitchW;
      const py = (g.fullHeight / plan.ny) * g.stitchH;
      const byPos = new Map<string, number>();
      const key = (x: number, y: number) => `${Math.round(x * 100)}|${Math.round(y * 100)}`;
      for (let i = 0; i < l.count; i++) byPos.set(key(l.x[i] as number, l.y[i] as number), i);
      for (let i = 0; i < l.count; i++) {
        const tx = plan.nx === 1 ? 0 : Math.min(plan.nx - 1, Math.floor(((l.x[i] as number) - g.pad) / px));
        const ty = Math.min(plan.ny - 1, Math.floor(((l.y[i] as number) - g.pad) / py));
        const rx = tileRepresentative(tileClass(tx, plan.nx), plan.nx);
        const ry = tileRepresentative(tileClass(ty, plan.ny), plan.ny);
        const twin = byPos.get(key((l.x[i] as number) + (rx - tx) * (plan.nx === 1 ? 0 : px), (l.y[i] as number) + (ry - ty) * py));
        assert.ok(twin !== undefined, `gemela de ${i}`);
        assert.equal(l.yarn[twin], l.yarn[i]);
        assert.equal(l.scaleX[twin], l.scaleX[i]);
        assert.equal(l.shade[twin], l.shade[i]);
        assert.equal(l.angle[twin], l.angle[i]);
      }
    },
    150,
  );
});

test("tilePlan: no aplica al círculo ni con pocas repeticiones; clases y representantes", () => {
  assert.equal(tileClass(0, 5), 0);
  assert.equal(tileClass(2, 5), 1);
  assert.equal(tileClass(4, 5), 2);
  assert.equal(tileClass(1, 2), 1);
  assert.equal(tileRepresentative(2, 5), 4);
  assert.equal(tileRepresentative(1, 2), 1);
  const base = { width: 4, height: 4, cells: new Array(16).fill(0), workedIn: "rounds" as const, direction: "bottom_up" as const };
  const circle = layoutGeometry({ ...base, repeat: { x: 10, y: 10 }, renderAs: "circle" }, { gauge: GAUGE });
  assert.equal(tilePlan(circle), null);
  const few = layoutGeometry({ ...base, repeat: { x: 1, y: 2 }, renderAs: "flat" }, { gauge: GAUGE });
  assert.equal(tilePlan(few), null);
  const many = layoutGeometry({ ...base, repeat: { x: 10, y: 10 }, renderAs: "flat" }, { gauge: GAUGE });
  assert.deepEqual(tilePlan(many) && { nx: tilePlan(many)!.nx, cx: tilePlan(many)!.cx }, { nx: 10, cx: 3 });
});
