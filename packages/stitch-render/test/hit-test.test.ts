/**
 * `hitTest` es la inversa exacta de la disposición (ADR 0004).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { colorize, hitTest, layoutGeometry, screenToLayout, layoutToScreen, fitView, zoomAt, type StitchLayout } from "../src/index.ts";
import { forAll } from "./support/property.ts";
import { GAUGE, chartFrom, randomChart, randomGauge } from "./support/fixtures.ts";

const TAU = Math.PI * 2;

function build(chart: Parameters<typeof layoutGeometry>[0], opts: Partial<Parameters<typeof layoutGeometry>[1]> = {}): StitchLayout {
  const l = layoutGeometry(chart, { gauge: GAUGE, ...opts });
  colorize(l, chart);
  return l;
}

/** ¿El punto (px, py) cae en la huella de la instancia i (celda en plano, sector del anillo en círculo)? */
function inFootprint(l: StitchLayout, i: number, px: number, py: number): boolean {
  const g = l.geometry;
  const tol = 1e-3;
  if (g.shape === "flat") {
    return Math.abs(px - (l.x[i] as number)) <= g.stitchW / 2 + tol && Math.abs(py - (l.y[i] as number)) <= g.stitchH / 2 + tol;
  }
  if (g.shape === "tube") {
    // Vertical: la fila. Horizontal: entre las proyecciones de los bordes de la columna.
    return Math.abs(py - (l.y[i] as number)) <= g.stitchH / 2 + tol;
  }
  const r = Math.hypot(px - g.cx, py - g.cy);
  const ri = Math.hypot((l.x[i] as number) - g.cx, (l.y[i] as number) - g.cy);
  if (Math.abs(r - ri) > g.stitchH / 2 + tol) return false;
  const a = Math.atan2(px - g.cx, py - g.cy);
  const b = Math.atan2((l.x[i] as number) - g.cx, (l.y[i] as number) - g.cy);
  let d = Math.abs(a - b) % TAU;
  if (d > Math.PI) d = TAU - d;
  const half = ((l.scaleX[i] as number) * g.stitchW) / ri / 2;
  return d <= half + 1e-4;
}

test("propiedad: hitTest en el centro de cada instancia devuelve esa instancia (plano, tubo de frente y círculo)", () => {
  forAll(
    "centro",
    (r) => ({ chart: randomChart(r), gauge: randomGauge(r), rot: r.next() * TAU }),
    ({ chart, gauge, rot }) => {
      const l = layoutGeometry(chart, { gauge, tubeRotation: rot });
      colorize(l, chart);
      for (let i = 0; i < l.count; i++) {
        if (l.geometry.shape === "tube" && !((l.shade[i] as number) > 0)) continue;
        assert.equal(hitTest(l, l.x[i] as number, l.y[i] as number), i, `instancia ${i}`);
      }
    },
  );
});

test("propiedad: si hitTest devuelve i, el punto está en la huella de i; fuera de la pieza devuelve null", () => {
  forAll(
    "huella",
    (r) => {
      const chart = randomChart(r);
      const pts = Array.from({ length: 60 }, () => [r.next(), r.next()] as const);
      return { chart, pts };
    },
    ({ chart, pts }) => {
      const l = build(chart);
      for (const [u, v] of pts) {
        const px = u * l.bounds.width;
        const py = v * l.bounds.height;
        const i = hitTest(l, px, py);
        if (i === null) continue;
        assert.ok(inFootprint(l, i, px, py), `(${px}, ${py}) → ${i}`);
      }
      assert.equal(hitTest(l, -1, -1), null);
      assert.equal(hitTest(l, l.bounds.width + 1, l.bounds.height + 1), null);
      assert.equal(hitTest(l, Number.NaN, 0), null);
    },
  );
});

test("plano: hitTest cubre toda la pieza sin huecos (cada punto interior cae en alguna celda)", () => {
  const chart = chartFrom(["AB.A", "BBAA", "A..B"], { repeat: { x: 3, y: 2 }, direction: "top_down" });
  const l = build(chart, { shape: "flat" });
  const g = l.geometry;
  for (let px = g.pad + 0.1; px < l.bounds.width - g.pad; px += g.stitchW / 3)
    for (let py = g.pad + 0.1; py < l.bounds.height - g.pad; py += g.stitchH / 3) assert.notEqual(hitTest(l, px, py), null);
});

test("círculo: hitTest de un anillo vacío o fuera del radio exterior es null", () => {
  const chart = chartFrom(["AAAA", "...."], { repeat: { x: 6, y: 1 }, renderAs: "circle" });
  const l = build(chart);
  const g = l.geometry;
  // bottom_up: la fila 1 (vacía) es el anillo 0, al centro.
  assert.equal(hitTest(l, g.cx, g.cy + 0.5 * g.stitchH), null);
  assert.notEqual(hitTest(l, g.cx, g.cy + 1.5 * g.stitchH), null);
  assert.equal(hitTest(l, g.cx, g.cy + 2.01 * g.stitchH), null);
});

test("vista: screenToLayout es la inversa de layoutToScreen y zoomAt mantiene fijo el punto bajo el cursor", () => {
  forAll(
    "vista",
    (r) => ({ zoom: 0.1 + r.next() * 5, panX: r.int(-500, 500), panY: r.int(-500, 500), sx: r.int(0, 800), sy: r.int(0, 600), f: 0.5 + r.next() * 2 }),
    ({ zoom, panX, panY, sx, sy, f }) => {
      const v = { zoom, panX, panY };
      const p = screenToLayout(v, sx, sy);
      const q = layoutToScreen(v, p.x, p.y);
      assert.ok(Math.abs(q.x - sx) < 1e-6 && Math.abs(q.y - sy) < 1e-6);
      const z = zoomAt(v, f, sx, sy);
      const p2 = screenToLayout(z, sx, sy);
      assert.ok(Math.abs(p2.x - p.x) < 1e-6 && Math.abs(p2.y - p.y) < 1e-6);
    },
    200,
  );
  const fit = fitView({ width: 100, height: 50 }, 400, 400, 0);
  assert.equal(fit.zoom, 4);
  assert.equal(fit.panY, 100);
});
