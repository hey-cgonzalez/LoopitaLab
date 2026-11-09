/**
 * T14 (QA fase 2): propiedades con semilla para las funciones del contrato de stitch-render
 * que solo tenían pruebas de ejemplo o ninguna: panBy, fitView, normalizeHex y layoutShape.
 *   SEED=12345 node --test test/qa-propiedades-vista.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { FALLBACK_HEX, MAX_ZOOM, MIN_ZOOM, fitView, layoutShape, layoutToScreen, normalizeHex, panBy, screenToLayout } from "../src/index.ts";
import { randomChart } from "./support/fixtures.ts";
import { forAll } from "./support/property.ts";

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

test("panBy: suma los desplazamientos, se deshace con el opuesto y no cambia el zoom", () => {
  forAll(
    "panBy",
    (r) => ({ view: { zoom: MIN_ZOOM + r.next() * (MAX_ZOOM - MIN_ZOOM), panX: (r.next() - 0.5) * 2000, panY: (r.next() - 0.5) * 2000 }, a: [(r.next() - 0.5) * 500, (r.next() - 0.5) * 500], b: [(r.next() - 0.5) * 500, (r.next() - 0.5) * 500] }),
    ({ view, a, b }) => {
      const [ax, ay] = a as [number, number];
      const [bx, by] = b as [number, number];
      const ab = panBy(panBy(view, ax, ay), bx, by);
      const once = panBy(view, ax + bx, ay + by);
      assert.ok(near(ab.panX, once.panX) && near(ab.panY, once.panY));
      assert.equal(ab.zoom, view.zoom);
      const back = panBy(panBy(view, ax, ay), -ax, -ay);
      assert.ok(near(back.panX, view.panX) && near(back.panY, view.panY));
      // Un punto de la labor se mueve en pantalla exactamente lo desplazado.
      const p = { x: 13.5, y: -7.25 };
      const s0 = layoutToScreen(view, p.x, p.y);
      const s1 = layoutToScreen(panBy(view, ax, ay), p.x, p.y);
      assert.ok(near(s1.x - s0.x, ax, 1e-4) && near(s1.y - s0.y, ay, 1e-4));
    },
  );
});

test("fitView: la labor completa cabe centrada en el lienzo, salvo cuando el zoom queda en un tope", () => {
  forAll(
    "fitView",
    (r) => ({ w: 1 + r.next() * 4000, h: 1 + r.next() * 4000, cssW: r.int(40, 2000), cssH: r.int(40, 2000), margin: r.int(0, 16) }),
    ({ w, h, cssW, cssH, margin }) => {
      const v = fitView({ width: w, height: h }, cssW, cssH, margin);
      assert.ok(v.zoom >= MIN_ZOOM && v.zoom <= MAX_ZOOM);
      // Centrada: el centro de la labor cae en el centro del lienzo.
      const c = layoutToScreen(v, w / 2, h / 2);
      assert.ok(near(c.x, cssW / 2, 1e-6) && near(c.y, cssH / 2, 1e-6));
      const clamped = v.zoom === MIN_ZOOM || v.zoom === MAX_ZOOM;
      if (!clamped) {
        assert.ok(w * v.zoom <= cssW - 2 * margin + 1e-6 && h * v.zoom <= cssH - 2 * margin + 1e-6);
        // Y la llena en al menos un eje.
        assert.ok(near(w * v.zoom, cssW - 2 * margin, 1e-6) || near(h * v.zoom, cssH - 2 * margin, 1e-6));
      }
      // screenToLayout es la inversa de layoutToScreen.
      const p = screenToLayout(v, c.x, c.y);
      assert.ok(near(p.x, w / 2, 1e-6) && near(p.y, h / 2, 1e-6));
    },
  );
});

test("normalizeHex: siempre devuelve #RRGGBB en mayúsculas, es idempotente y conserva los hex válidos", () => {
  const HEX = "0123456789abcdefABCDEF";
  forAll(
    "normalizeHex",
    (r) => {
      const hex = "#" + Array.from({ length: 6 }, () => HEX[r.int(0, HEX.length - 1)]).join("");
      return r.pick([hex, hex.slice(0, 4), hex.slice(1), hex + "0", hex.replace(/.$/, "g"), 0xffffff, null, undefined, {}, ""] as const);
    },
    (input) => {
      const out = normalizeHex(input);
      assert.match(out, /^#[0-9A-F]{6}$/);
      assert.equal(normalizeHex(out), out);
      if (typeof input === "string" && /^#[0-9a-fA-F]{6}$/.test(input)) assert.equal(out, input.toUpperCase());
      else assert.equal(out, FALLBACK_HEX);
    },
  );
});

test("layoutShape: siempre plano, tubo o círculo; la opción manda sobre renderAs y el canesú se dibuja como tubo", () => {
  forAll(
    "layoutShape",
    (r) => ({ chart: { ...randomChart(r), renderAs: r.pick(["flat", "tube", "circle", "yoke"] as const) }, shape: r.pick([undefined, "flat", "tube", "circle"] as const) }),
    ({ chart, shape }) => {
      const s = layoutShape(chart, shape === undefined ? {} : { shape });
      assert.ok(["flat", "tube", "circle"].includes(s));
      const expected = shape ?? (chart.renderAs === "yoke" ? "tube" : chart.renderAs);
      assert.equal(s, expected);
    },
  );
});
