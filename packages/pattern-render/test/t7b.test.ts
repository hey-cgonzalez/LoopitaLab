/**
 * T7b: rótulo de numeración alternada con el motivo solo, numeración rala con casillas
 * chicas, prefijo de ids sin JSON.stringify (QA F2) y con colores (QA O2), y letras
 * dobles desde la lana 27 (QA O3).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIMITS, NO_STITCH, fullSize, readingDirection, yarnLetter, type Chart, type ChartPattern, type Yarn } from "@loopitalab/pattern-core";
import { CHART_SVG_MAX_CELLS, ODD_HEIGHT_CAPTION, ROW_NUMBER_MIN_GAP_FACTOR, chartToSvg, isNumberedRow } from "../src/chart-svg.ts";
import { chartPattern, yarnA, yarnB } from "./support/fixtures.ts";
import { forAll, type Rng } from "./support/property.ts";
import { byClass, parseXml, walk, type XmlElement } from "./support/xml.ts";

const text = (root: XmlElement) => walk(root).filter((e) => e.name === "text").map((e) => e.text).join(" ");
const captionText = (root: XmlElement) => (byClass(root, "caption")[0]?.children ?? []).map((t) => t.text).join(" ");
const idPrefix = (svg: string) => /aria-labelledby="(lr-[0-9a-f]{8})-t"/.exec(svg)?.[1];
/** Motivo que no cabe completo: 10 × h con 30 × 20 repeticiones (o `ry`). */
const big = (h: number, workedIn: Chart["workedIn"], ry = 20) =>
  chartPattern({ width: 10, height: h, cells: new Array(10 * h).fill(0), repeat: { x: 30, y: ry }, workedIn, renderAs: workedIn === "rows" ? "flat" : "tube" }, [yarnA]);

describe("T7b: rótulo con el motivo solo y alto impar", () => {
  it("ida y vuelta, alto impar y repeat.y > 1: agrega la advertencia de la numeración alternada", () => {
    const p = big(7, "rows");
    assert.ok(fullSize(p.chart).width * fullSize(p.chart).height > CHART_SVG_MAX_CELLS);
    const root = parseXml(chartToSvg(p, { rowNumbers: true }));
    assert.equal(root.attrs["data-view"], "motif");
    const caption = captionText(root);
    assert.match(caption, /^Motivo: se repite 30 × 20 veces/);
    assert.ok(caption.endsWith(ODD_HEIGHT_CAPTION), caption);
    assert.equal(
      ODD_HEIGHT_CAPTION,
      "Como el motivo tiene un número impar de filas, en cada repetición alterna el lado por el que se teje cada fila (derecho y revés). La numeración de la primera repetición solo vale para esa.",
    );
  });

  it("no la agrega con alto par, en redondo, con repeat.y = 1 ni con el gráfico completo", () => {
    const cases: ChartPattern[] = [
      big(8, "rows"),
      big(7, "rounds"),
      chartPattern({ width: 200, height: 7, cells: new Array(1400).fill(0), repeat: { x: 30, y: 1 }, workedIn: "rows", renderAs: "flat" }, [yarnA]),
      chartPattern({ width: 4, height: 3, cells: new Array(12).fill(0), repeat: { x: 2, y: 2 }, workedIn: "rows", renderAs: "flat" }, [yarnA]),
    ];
    for (const p of cases) assert.ok(!text(parseXml(chartToSvg(p))).includes("número impar"), JSON.stringify(p.chart.repeat));
  });

  it("el SVG es al menos tan ancho como el rótulo estimado (no se corta en un motivo angosto)", () => {
    const p = chartPattern({ width: 1, height: 3, cells: [0, 0, 0], repeat: { x: LIMITS.maxRepeat, y: LIMITS.maxRepeat }, workedIn: "rows", renderAs: "flat" }, [yarnA]);
    const root = parseXml(chartToSvg(p));
    const fontSize = Number(byClass(root, "caption")[0]?.attrs["font-size"]);
    const longest = Math.max(...(byClass(root, "caption")[0]?.children ?? []).map((t) => [...t.text].length));
    assert.ok(Number(root.attrs.width) >= longest * fontSize * 0.5, `${root.attrs.width} < ${longest} × ${fontSize} × 0,5`);
    assert.equal(root.attrs.viewBox, `0 0 ${root.attrs.width} ${root.attrs.height}`);
  });
});

describe("T7b: numeración rala con casillas chicas", () => {
  const rows = (root: XmlElement) =>
    byClass(root, "row").map((g) => ({
      row: Number(g.attrs["data-row"]),
      side: g.attrs["data-side"],
      arrow: g.children.some((c) => c.name === "path"),
      number: g.children.find((c) => c.name === "text")?.text,
    }));

  it("isNumberedRow: la 1, las múltiplos de 5 y la última", () => {
    const n = Array.from({ length: 23 }, (_v, i) => i + 1).filter((r) => isNumberedRow(r, 23));
    assert.deepEqual(n, [1, 5, 10, 15, 20, 23]);
    assert.deepEqual([1, 2, 3].filter((r) => isNumberedRow(r, 3)), [1, 3]);
    assert.ok(ROW_NUMBER_MIN_GAP_FACTOR > 1);
  });

  it("en redondo con casillas de 9 px numera solo 1, 5, 10… y la última, con flecha en todas", () => {
    const p = chartPattern({ width: 3, height: 12, cells: new Array(36).fill(0) });
    const r = rows(parseXml(chartToSvg(p, { rowNumbers: true, cellPx: 9 })));
    assert.equal(r.length, 12);
    assert.ok(r.every((x) => x.arrow && x.side === "right"));
    assert.deepEqual(r.filter((x) => x.number !== undefined).map((x) => x.number), ["1", "5", "10", "12"]);
  });

  it("en redondo con casillas de 10 px (o más) numera todas", () => {
    const p = chartPattern({ width: 3, height: 12, cells: new Array(36).fill(0) });
    for (const cellPx of [10, 16, 64]) {
      const r = rows(parseXml(chartToSvg(p, { rowNumbers: true, cellPx })));
      assert.ok(r.every((x) => x.number === String(x.row)), `cellPx ${cellPx}`);
    }
  });

  it("de ida y vuelta, la distancia entre números del mismo lado es de 2 filas: rala solo con 4 px; cada número en su lado", () => {
    const p = chartPattern({ width: 3, height: 11, cells: new Array(33).fill(0), workedIn: "rows", renderAs: "flat" });
    const sparse = rows(parseXml(chartToSvg(p, { rowNumbers: true, cellPx: 4 })));
    assert.deepEqual(sparse.filter((x) => x.number !== undefined).map((x) => [x.number, x.side]), [["1", "right"], ["5", "right"], ["10", "left"], ["11", "right"]]);
    assert.ok(sparse.every((x) => x.arrow));
    const full = rows(parseXml(chartToSvg(p, { rowNumbers: true, cellPx: 5 })));
    assert.ok(full.every((x) => x.number === String(x.row)));
  });

  /** Propiedad: el umbral, el lado y las flechas, contra la regla escrita aquí sin pasar por chart-svg. */
  const gen = (r: Rng) => {
    const h = r.int(1, 40);
    const p = chartPattern({ width: r.int(1, 6), height: h, cells: [], workedIn: r.pick(["rows", "rounds"] as const), renderAs: "flat" }, [yarnA, yarnB]);
    p.chart.cells = Array.from({ length: p.chart.width * h }, () => (r.bool(0.1) ? NO_STITCH : r.int(0, 1)));
    p.chart.repeat = { x: r.int(1, 3), y: r.int(1, 3) };
    return { p, cellPx: r.int(4, 24), mirror: r.bool() };
  };

  it("propiedad: flecha en cada fila; número en todas o, si los números se tocarían, en la 1, las múltiplos de 5 y la última", () => {
    forAll("numeración rala", gen, ({ p, cellPx, mirror }) => {
      const root = parseXml(chartToSvg(p, { rowNumbers: true, cellPx, mirror }));
      const fontSize = Math.max(8, Math.min(14, Math.round(cellPx * 0.7)));
      const gap = (p.chart.workedIn === "rounds" ? 1 : 2) * cellPx;
      const sparse = gap < 1.2 * fontSize;
      const H = fullSize(p.chart).height;
      const r = rows(root);
      assert.equal(r.length, H);
      r.forEach((x, y) => {
        assert.ok(x.arrow);
        assert.equal(x.side, readingDirection(p.chart, y, { mirror }) === "right_to_left" ? "right" : "left");
        const want = !sparse || y === 0 || y === H - 1 || (y + 1) % 5 === 0;
        assert.equal(x.number, want ? String(y + 1) : undefined, `fila ${y + 1}, sparse ${sparse}`);
      });
    });
  });
});

describe("T7b: prefijo de ids (QA F2 y O2)", () => {
  const p = chartPattern({ width: 2, height: 2, cells: [0, 1, 1, 0], workedIn: "rows", renderAs: "flat" });

  it("nunca lanza con opciones raras: BigInt, ciclos, null, un Proxy que lanza", () => {
    const cyc: Record<string, unknown> = { rowNumbers: true };
    cyc.self = cyc;
    const hostile = new Proxy({}, { get: () => { throw new Error("x"); } });
    const cases: unknown[] = [{ cellPx: 10n }, cyc, null, 5, "x", hostile, { cellPx: { valueOf: () => 12 } }];
    cases.forEach((o, i) => assert.doesNotThrow(() => parseXml(chartToSvg(p, o as never)), `caso ${i}`));
  });

  it("dos SVG del mismo patrón con colores distintos no comparten ids", () => {
    const q = structuredClone(p);
    q.yarns[1]!.color = { hex: "#00FF00" };
    assert.notEqual(idPrefix(chartToSvg(p)), idPrefix(chartToSvg(q)));
  });

  it("es determinista y cambia con las opciones que cambian el dibujo", () => {
    assert.equal(idPrefix(chartToSvg(p, { symbols: true })), idPrefix(chartToSvg(structuredClone(p), { symbols: true })));
    const ids = new Set([{}, { symbols: true }, { mirror: true }, { cellPx: 20 }, { rowNumbers: true }, { showRepeats: true }].map((o) => idPrefix(chartToSvg(p, o))));
    assert.equal(ids.size, 6);
    // Opciones que se normalizan al mismo valor dan el mismo prefijo.
    assert.equal(idPrefix(chartToSvg(p, { cellPx: 16 })), idPrefix(chartToSvg(p, {})));
    assert.equal(idPrefix(chartToSvg(p, { symbols: "sí" } as never)), idPrefix(chartToSvg(p, {})));
  });
});

describe("T7b: letras desde la lana 27 (QA O3, validar con experto-tejido)", () => {
  it("AA… AF con letra más chica para que quepa; nunca un número", () => {
    const ys: Yarn[] = Array.from({ length: 32 }, (_v, i) => ({ ...structuredClone(yarnA), id: `Y${i}` }));
    const p = chartPattern({ width: 32, height: 1, cells: Array.from({ length: 32 }, (_v, i) => i) }, ys);
    const root = parseXml(chartToSvg(p, { symbols: true, cellPx: 20 }));
    const g = byClass(root, "symbols")[0]!;
    const letters = g.children.map((t) => t.text);
    assert.deepEqual(letters.slice(26), ["AA", "AB", "AC", "AD", "AE", "AF"]);
    assert.ok(letters.every((l, i) => l === yarnLetter(i) && /^[A-Z]+$/.test(l)));
    const groupSize = Number(g.attrs["font-size"]);
    for (const t of g.children) {
      if (t.text.length > 1) assert.ok(Number(t.attrs["font-size"]) < groupSize && Number(t.attrs["font-size"]) >= 3);
      else assert.equal(t.attrs["font-size"], undefined);
    }
  });
});
