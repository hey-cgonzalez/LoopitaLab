/**
 * Propiedades de los derivados con el generador con semilla (ADR 0002):
 *   SEED=12345 node --test test/property.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NO_STITCH,
  fullSize,
  readingDirection,
  stitchTotal,
  validatePattern,
  type ChartPattern,
  type Yarn,
} from "@loopitalab/pattern-core";
import { CHART_SVG_MAX_CELLS, chartToSvg, describeChart, type ChartSvgOptions } from "../src/index.ts";
import { formatInt } from "../src/xml.ts";
import { yarnA, yarnB, yarnC } from "./support/fixtures.ts";
import { forAll, type Rng } from "./support/property.ts";
import { byClass, parseXml } from "./support/xml.ts";

const YARNS: readonly Yarn[] = [yarnA, yarnB, yarnC];
/*
 * Textos difíciles para el escape XML. Desde E16 (ADR 0003) el título no admite caracteres
 * de control (tampoco \t ni \n) y las notas solo \t y \n: los controles sueltos se prueban
 * con `drawChart` en `escape.test.ts`, porque un documento que los trae no es savable.
 */
const NASTY = ["Gorro", `</svg><script>alert(1)</script>`, `a & b "c" 'd' <e>`, "🧶 ñandú"];
const NASTY_NOTES = [...NASTY, "tab\tsalto\nfin"];

/** Documento `savable` al azar: incluye gráficos vacíos, filas sin puntos y cuñas. */
function genPattern(r: Rng): ChartPattern {
  const nYarns = r.int(1, 3);
  const width = r.int(1, 14);
  const height = r.int(1, 12);
  const maskP = r.pick([0, 0.1, 0.5, 1]);
  const cells = Array.from({ length: width * height }, () => (r.bool(maskP) ? NO_STITCH : r.int(0, nYarns - 1)));
  const big = r.bool(0.05);
  return {
    schemaVersion: 1,
    id: r.pick(["p", `id"<>&`]),
    title: r.pick(NASTY),
    technique: r.pick(["knit", "crochet"] as const),
    kind: "chart",
    yarns: YARNS.slice(0, nYarns).map((y) => structuredClone(y)),
    ...(r.bool() ? { gauge: { stitchesPer10cm: r.int(6, 37), rowsPer10cm: r.int(8, 50) } } : {}),
    ...(r.bool(0.2) ? { notes: [r.pick(NASTY_NOTES)] } : {}),
    origin: { kind: "manual" },
    chart: {
      width,
      height,
      cells,
      repeat: big ? { x: r.int(200, 500), y: r.int(20, 50) } : { x: r.int(1, 8), y: r.int(1, 4) },
      workedIn: r.pick(["rounds", "rows"] as const),
      renderAs: r.pick(["flat", "tube", "circle", "yoke"] as const),
      direction: r.pick(["bottom_up", "top_down"] as const),
    },
  };
}

function genOpts(r: Rng): ChartSvgOptions {
  return {
    ...(r.bool() ? { cellPx: r.pick([4, 8, 16, 24, 3, 100, 12.5]) } : {}),
    showRepeats: r.bool(),
    rowNumbers: r.bool(),
    symbols: r.bool(),
    mirror: r.bool(),
  };
}

const gen = (r: Rng) => ({ pattern: genPattern(r), opts: genOpts(r) });

describe("propiedades de chartToSvg", () => {
  it("todo documento generado es savable (precondición del generador)", () => {
    forAll("savable", gen, ({ pattern }) => assert.equal(validatePattern(pattern).savable, true));
  });

  it("el SVG es XML bien formado y dibuja tantas casillas como el tamaño del gráfico", () => {
    forAll("bien formado y casillas", gen, ({ pattern, opts }) => {
      const svg = chartToSvg(pattern, opts);
      const root = parseXml(svg);
      assert.equal(root.name, "svg");
      assert.equal(svg.includes("<script"), false);
      const full = fullSize(pattern.chart);
      const fits = full.width * full.height <= CHART_SVG_MAX_CELLS;
      const w = fits ? full.width : pattern.chart.width;
      const h = fits ? full.height : pattern.chart.height;
      const cells = byClass(root, "c");
      assert.equal(cells.length, w * h);
      // Las casillas con punto coinciden con el conteo de pattern-core.
      const stitches = cells.filter((c) => !(c.attrs.class ?? "").split(" ").includes("ns")).length;
      const expected = fits ? stitchTotal(pattern.chart) : stitchTotal({ ...pattern.chart, repeat: { x: 1, y: 1 } });
      assert.equal(stitches, expected);
      // Todo color en un atributo `fill` es un hex o la textura de "sin punto".
      for (const c of cells) assert.match(c.attrs.fill ?? "", /^(#[0-9A-F]{6}|url\(#lr-[0-9a-f]{8}-ns\))$/);
      if (opts.symbols) assert.equal(byClass(root, "symbols")[0]?.children.length ?? 0, stitches);
    });
  });

  it("la numeración tiene una etiqueta por fila, del lado donde empieza la lectura (caso 25)", () => {
    forAll("numeración", gen, ({ pattern, opts }) => {
      const root = parseXml(chartToSvg(pattern, { ...opts, rowNumbers: true }));
      const labels = byClass(root, "row");
      const full = fullSize(pattern.chart);
      const fits = full.width * full.height <= CHART_SVG_MAX_CELLS;
      assert.equal(labels.length, fits ? full.height : pattern.chart.height);
      labels.forEach((g, y) => {
        assert.equal(g.attrs["data-row"], String(y + 1));
        const dir = readingDirection(pattern.chart, y, { mirror: opts.mirror === true });
        assert.equal(g.attrs["data-side"], dir === "right_to_left" ? "right" : "left");
        // Regla directa del ADR 0003, sin pasar por readingDirection.
        const rightSide = (pattern.chart.workedIn === "rounds" || y % 2 === 0) !== (opts.mirror === true);
        assert.equal(g.attrs["data-side"], rightSide ? "right" : "left");
      });
    });
  });

  it("mirror no cambia las casillas ni las letras (solo numeración y flechas)", () => {
    forAll("mirror", gen, ({ pattern, opts }) => {
      const strip = (svg: string) => {
        const root = parseXml(svg);
        const cells = byClass(root, "c");
        const x0 = Math.min(...cells.map((c) => Number(c.attrs.x)));
        const fill = (f = "") => (f.startsWith("url(") ? "ns" : f);
        const letters = byClass(root, "symbols")[0]?.children.map((t) => t.text) ?? [];
        return { cells: cells.map((c) => [Number(c.attrs.x) - x0, c.attrs.y, fill(c.attrs.fill)]), letters };
      };
      const a = strip(chartToSvg(pattern, { ...opts, mirror: false }));
      const b = strip(chartToSvg(pattern, { ...opts, mirror: true }));
      assert.deepEqual(b, a);
    }, 100);
  });

  it("es determinista y no modifica el documento", () => {
    forAll("determinista", gen, ({ pattern, opts }) => {
      const before = structuredClone(pattern);
      assert.equal(chartToSvg(pattern, opts), chartToSvg(pattern, opts));
      assert.deepEqual(pattern, before);
    }, 100);
  });
});

describe("propiedades de describeChart", () => {
  it("nunca lanza, nombra el total de pattern-core y usa vuelta o fila según workedIn", () => {
    forAll("describe", gen, ({ pattern }) => {
      const text = describeChart(pattern);
      assert.ok(text.includes(`${formatInt(stitchTotal(pattern.chart))} punto`));
      const rows = fullSize(pattern.chart).height;
      const word = pattern.chart.workedIn === "rounds" ? (rows === 1 ? "vuelta" : "vueltas") : rows === 1 ? "fila" : "filas";
      assert.ok(text.includes(`${formatInt(rows)} ${word} y `), text);
      // Cada lana aparece con su letra.
      pattern.yarns.forEach((_, i) => assert.ok(text.includes(`${String.fromCharCode(65 + i)}, `)));
    });
  });
});
