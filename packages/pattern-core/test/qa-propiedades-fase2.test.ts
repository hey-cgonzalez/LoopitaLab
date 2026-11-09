/**
 * T14 (QA fase 2): propiedades con semilla para las funciones del motor de colorwork que
 * solo tenían pruebas de ejemplo (CLAUDE.md: toda función del motor tiene propiedades).
 *   SEED=12345 node --test test/qa-propiedades-fase2.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EDIT_LIMITS,
  NO_STITCH,
  cellIndex,
  dimensionsCm,
  floatLengthCm,
  motifCell,
  newChartPattern,
  validatePattern,
  validateYarn,
  yarnLetter,
  type Chart,
} from "../src/index.ts";
import { yarnA, yarnB } from "./support/fixtures.ts";
import { forAll, type Rng } from "./support/property.ts";

function randomChart(r: Rng): Chart {
  const width = r.int(1, 24);
  const height = r.int(1, 24);
  return {
    width,
    height,
    cells: Array.from({ length: width * height }, () => (r.bool(0.2) ? NO_STITCH : r.int(0, 2))),
    repeat: { x: r.int(1, 12), y: r.int(1, 6) },
    workedIn: r.pick(["rounds", "rows"] as const),
    renderAs: r.pick(["flat", "tube", "circle"] as const),
    direction: r.pick(["bottom_up", "top_down"] as const),
  };
}

describe("cellIndex", () => {
  it("es una biyección del motivo en 0 … width·height − 1 y coincide con motifCell", () => {
    forAll("cellIndex", randomChart, (c) => {
      const seen = new Set<number>();
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          const i = cellIndex(c, x, y);
          assert.ok(Number.isInteger(i) && i >= 0 && i < c.width * c.height);
          seen.add(i);
          assert.equal(motifCell(c, x, y), c.cells[i]);
        }
      assert.equal(seen.size, c.width * c.height);
    });
  });
});

describe("floatLengthCm", () => {
  it("es lineal en los puntos y coincide con el ancho de dimensionsCm en plano", () => {
    forAll(
      "floatLengthCm",
      (r) => ({ a: r.int(0, 400), b: r.int(0, 400), gauge: { stitchesPer10cm: r.int(5, 40), rowsPer10cm: r.int(6, 60) }, chart: randomChart(r) }),
      ({ a, b, gauge, chart }) => {
        const near = (x: number, y: number) => Math.abs(x - y) < 1e-9 * Math.max(1, Math.abs(y));
        assert.ok(near(floatLengthCm(a + b, gauge), floatLengthCm(a, gauge) + floatLengthCm(b, gauge)));
        assert.equal(floatLengthCm(0, gauge), 0);
        assert.ok(near(floatLengthCm(gauge.stitchesPer10cm, gauge), 10));
        const flat = { ...chart, renderAs: "flat" as const };
        assert.ok(near(dimensionsCm(flat, gauge).widthCm, floatLengthCm(flat.width * flat.repeat.x, gauge)));
      },
    );
  });
});

describe("yarnLetter", () => {
  it("es inyectiva, usa solo A–Z y A … Z para las primeras 26; un índice inválido da '?'", () => {
    forAll(
      "yarnLetter",
      (r) => ({ a: r.int(0, 5000), b: r.int(0, 5000), bad: r.pick([-1, -r.int(1, 99), 0.5, r.int(0, 50) + 0.25, Number.NaN, Infinity]) }),
      ({ a, b, bad }) => {
        const la = yarnLetter(a);
        assert.match(la, /^[A-Z]+$/);
        assert.equal(la === yarnLetter(b), a === b);
        if (a < 26) assert.equal(la, String.fromCharCode(65 + a));
        if (a < b) assert.ok(la.length <= yarnLetter(b).length);
        assert.equal(yarnLetter(bad), "?");
      },
    );
  });
});

describe("newChartPattern", () => {
  it("con un tamaño y repeticiones válidos crea un documento guardable, todo en la lana 0 y sin gauge salvo que se pase", () => {
    forAll(
      "newChartPattern",
      (r) => ({
        width: r.int(1, 60),
        height: r.int(1, 60),
        repeat: { x: r.int(1, 10), y: r.int(1, 10) },
        workedIn: r.pick(["rounds", "rows"] as const),
        renderAs: r.pick(["flat", "tube", "circle"] as const),
        direction: r.pick(["bottom_up", "top_down"] as const),
        withGauge: r.bool(),
      }),
      ({ withGauge, ...input }) => {
        const p = newChartPattern({ id: "n", title: "Nuevo", yarns: [yarnA, yarnB], ...input, ...(withGauge ? { gauge: { stitchesPer10cm: 22, rowsPer10cm: 30 } } : {}) });
        assert.equal(p.chart.cells.length, input.width * input.height);
        assert.ok(p.chart.cells.every((v) => v === 0));
        assert.equal("gauge" in p, withGauge);
        const v = validatePattern(p);
        assert.equal(v.savable, true, JSON.stringify(v.issues.filter((i) => i.severity === "error")));
        assert.ok(input.width <= EDIT_LIMITS.maxMotifWidth && input.height <= EDIT_LIMITS.maxMotifHeight);
      },
      150,
    );
  });
});

describe("validateYarn", () => {
  it("nunca lanza con entradas arbitrarias y siempre devuelve una lista de avisos con código y severidad", () => {
    const junk = (r: Rng): unknown =>
      r.pick<() => unknown>([
        () => null,
        () => undefined,
        () => r.int(-5, 5),
        () => "lana",
        () => [],
        () => ({ ...yarnA, weight: r.int(-2, 10) }),
        () => ({ ...yarnA, composition: [{ fiber: r.pick(["lana", "x", ""]), percent: r.int(-10, 130) }] }),
        () => ({ ...yarnA, color: { hex: r.pick(["#FFF", "#12345G", "#ABCDEF", 3]) } }),
        () => ({ ...yarnA, id: r.pick(["", "A", 7]) }),
      ])();
    forAll("validateYarn", (r) => junk(r), (y) => {
      const issues = validateYarn(y);
      assert.ok(Array.isArray(issues));
      for (const i of issues) {
        assert.equal(typeof i.code, "string");
        assert.ok(["error", "warning", "info"].includes(i.severity));
      }
    });
    assert.deepEqual(validateYarn(yarnA).filter((i) => i.severity === "error"), []);
  });
});
