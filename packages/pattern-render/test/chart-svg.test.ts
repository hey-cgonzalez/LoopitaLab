import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_STITCH, fullSize, stitchTotal, validatePattern, yarnLetter } from "@loopitalab/pattern-core";
import { CHART_SVG_MAX_CELLS, DEFAULT_CELL_PX, chartToSvg } from "../src/index.ts";
import { band, chartPattern, yarnA, yarnB } from "./support/fixtures.ts";
import { byClass, parseXml, walk, type XmlElement } from "./support/xml.ts";

const cellsOf = (root: XmlElement) => byClass(root, "c");
const rowLabels = (root: XmlElement) => byClass(root, "row").map((g) => ({ row: Number(g.attrs["data-row"]), side: g.attrs["data-side"] }));

describe("chartToSvg: estructura", () => {
  it("es un SVG accesible: role img, <title> y <desc> enlazados", () => {
    const root = parseXml(chartToSvg(band()));
    assert.equal(root.name, "svg");
    assert.equal(root.attrs.xmlns, "http://www.w3.org/2000/svg");
    assert.equal(root.attrs.role, "img");
    const title = root.children.find((c) => c.name === "title");
    const desc = root.children.find((c) => c.name === "desc");
    assert.ok(title && desc);
    assert.equal(title.text, "Gráfico: Copa");
    assert.equal(root.attrs["aria-labelledby"], title.attrs.id);
    assert.equal(root.attrs["aria-describedby"], desc.attrs.id);
    assert.match(desc.text, /Gráfico de colores a palillo/);
  });

  it("dibuja el gráfico completo: una casilla por punto del gráfico completo", () => {
    const p = band();
    const root = parseXml(chartToSvg(p));
    const { width, height } = fullSize(p.chart);
    assert.equal(cellsOf(root).length, width * height);
    assert.equal(root.attrs["data-view"], "full");
    assert.equal(root.attrs["data-cols"], String(width));
    assert.equal(root.attrs["data-rows"], String(height));
  });

  it("la fila 1 queda abajo y x = 0 a la izquierda", () => {
    // Motivo 2 × 2: fila 0 = A B, fila 1 = B B.
    const p = chartPattern({ width: 2, height: 2, cells: [0, 1, 1, 1] });
    const cells = cellsOf(parseXml(chartToSvg(p)));
    const at = (fill: string) => cells.filter((c) => c.attrs.fill === fill).map((c) => ({ x: Number(c.attrs.x), y: Number(c.attrs.y) }));
    const a = at(yarnA.color.hex);
    assert.equal(a.length, 1);
    const maxY = Math.max(...cells.map((c) => Number(c.attrs.y)));
    const minX = Math.min(...cells.map((c) => Number(c.attrs.x)));
    assert.equal(a[0]?.y, maxY, "la fila 0 es la de abajo");
    assert.equal(a[0]?.x, minX, "x = 0 es la columna izquierda");
  });

  it("direction top_down no rota el gráfico (solo cambia la vista previa)", () => {
    const p = band();
    const q = structuredClone(p);
    q.chart.direction = "top_down";
    const a = cellsOf(parseXml(chartToSvg(p))).map((c) => c.attrs);
    const b = cellsOf(parseXml(chartToSvg(q))).map((c) => c.attrs);
    assert.deepEqual(b, a);
  });

  it("usa el color de cada lana en mayúsculas y cellPx por defecto 16", () => {
    const p = band();
    p.yarns[1]!.color.hex = "#ba222c";
    const cells = cellsOf(parseXml(chartToSvg(p)));
    assert.ok(cells.some((c) => c.attrs.fill === "#BA222C"));
    assert.ok(cells.every((c) => c.attrs.width === String(DEFAULT_CELL_PX) && c.attrs.height === String(DEFAULT_CELL_PX)));
  });

  it("acota cellPx entre 4 y 64 y usa 16 si no es un número finito", () => {
    const size = (cellPx: number) => cellsOf(parseXml(chartToSvg(band(), { cellPx })))[0]?.attrs.width;
    assert.equal(size(1), "4");
    assert.equal(size(1000), "64");
    assert.equal(size(Number.NaN), "16");
    assert.equal(size(Number.POSITIVE_INFINITY), "16");
    assert.equal(size(10.4), "10");
  });

  it('"sin punto" usa una textura propia, distinta de cualquier color de lana', () => {
    const p = chartPattern({ width: 3, height: 2, cells: [0, 0, 0, NO_STITCH, 1, NO_STITCH], workedIn: "rows", renderAs: "flat" });
    const root = parseXml(chartToSvg(p, { symbols: true }));
    const ns = byClass(root, "ns");
    assert.equal(ns.length, 2);
    const pattern = walk(root).find((e) => e.name === "pattern");
    assert.ok(pattern);
    for (const c of ns) assert.equal(c.attrs.fill, `url(#${pattern.attrs.id})`);
    // Ninguna casilla de lana usa la textura, y las "sin punto" no llevan letra.
    for (const c of cellsOf(root)) if (!(c.attrs.class ?? "").includes("ns")) assert.match(c.attrs.fill ?? "", /^#[0-9A-F]{6}$/);
    assert.equal(byClass(root, "symbols")[0]?.children.length, 4);
  });

  it("acepta un gráfico vacío (savable) y lo dibuja todo como sin punto", () => {
    const p = chartPattern({ width: 3, height: 2, cells: new Array(6).fill(NO_STITCH) });
    const r = validatePattern(p);
    assert.equal(r.savable, true);
    assert.equal(r.valid, false);
    const root = parseXml(chartToSvg(p, { rowNumbers: true, symbols: true, showRepeats: true }));
    assert.equal(byClass(root, "ns").length, 6);
    assert.equal(byClass(root, "symbols").length, 0);
  });

  it("con errores estructurales devuelve un aviso sin casillas y sin lanzar", () => {
    const p = band();
    (p.chart as { cells: number[] }).cells = [0, 1];
    const svg = chartToSvg(p);
    const root = parseXml(svg);
    assert.equal(cellsOf(root).length, 0);
    assert.match(svg, /No se puede dibujar el gráfico/);
    assert.doesNotThrow(() => chartToSvg(null as never));
    assert.doesNotThrow(() => chartToSvg({ kind: "written" } as never));
  });
});

describe("chartToSvg: letras por lana (symbols)", () => {
  it("cada casilla con punto lleva la letra de su lana, en el orden del documento", () => {
    const p = band();
    const root = parseXml(chartToSvg(p, { symbols: true }));
    const letters = byClass(root, "symbols")[0]?.children.map((t) => t.text) ?? [];
    assert.equal(letters.length, stitchTotal(p.chart));
    assert.deepEqual([...new Set(letters)].sort(), ["A", "B"]);
    // Sin `symbols` no hay letras.
    assert.equal(byClass(parseXml(chartToSvg(p)), "symbols").length, 0);
  });

  it("la letra contrasta con el fondo (negro sobre claro, blanco sobre oscuro)", () => {
    const light = { ...structuredClone(yarnA), color: { hex: "#FFFFFF" } };
    const dark = { ...structuredClone(yarnB), color: { hex: "#000000" } };
    const p = chartPattern({ width: 2, height: 1, cells: [0, 1] }, [light, dark]);
    const texts = byClass(parseXml(chartToSvg(p, { symbols: true })), "symbols")[0]?.children ?? [];
    assert.equal(texts[0]?.attrs.fill, "#000000");
    assert.equal(texts[1]?.attrs.fill, "#FFFFFF");
  });

  it("desde la lana 27 usa dos letras (AA, AB…), como el validador: nunca un número que se confunda con la fila", () => {
    const yarns = Array.from({ length: 28 }, (_, i) => ({ ...structuredClone(yarnA), id: `Y${i}` }));
    const cells = Array.from({ length: 28 }, (_, i) => i);
    const p = chartPattern({ width: 28, height: 1, cells }, yarns);
    const letters = byClass(parseXml(chartToSvg(p, { symbols: true })), "symbols")[0]?.children.map((t) => t.text);
    assert.equal(letters?.[0], "A");
    assert.equal(letters?.[25], "Z");
    assert.equal(letters?.[26], "AA");
    assert.equal(letters?.[27], "AB");
    for (let i = 0; i < 28; i++) assert.equal(letters?.[i], yarnLetter(i));
  });
});

describe("chartToSvg: bordes del motivo (showRepeats)", () => {
  it("marca repeat.x + 1 líneas verticales y repeat.y + 1 horizontales", () => {
    const p = band();
    const root = parseXml(chartToSvg(p, { showRepeats: true }));
    const g = byClass(root, "repeats")[0];
    assert.ok(g);
    const d = g.children[0]?.attrs.d ?? "";
    assert.equal((d.match(/V/g) ?? []).length, p.chart.repeat.x + 1);
    assert.equal((d.match(/H/g) ?? []).length, p.chart.repeat.y + 1);
    assert.equal(byClass(parseXml(chartToSvg(p)), "repeats").length, 0);
  });
});

describe("chartToSvg: numeración (caso 25 y regla 1 de la revisión de experto-tejido, ADR 0003)", () => {
  const flat = () => chartPattern({ width: 3, height: 4, cells: new Array(12).fill(0), workedIn: "rows", renderAs: "flat" }, [yarnA]);

  it("ida y vuelta: las filas por el derecho a la derecha y las del revés a la izquierda", () => {
    const labels = rowLabels(parseXml(chartToSvg(flat(), { rowNumbers: true })));
    assert.deepEqual(labels, [
      { row: 1, side: "right" },
      { row: 2, side: "left" },
      { row: 3, side: "right" },
      { row: 4, side: "left" },
    ]);
  });

  it("en redondo, todas las vueltas a la derecha", () => {
    const p = band();
    const labels = rowLabels(parseXml(chartToSvg(p, { rowNumbers: true })));
    assert.equal(labels.length, fullSize(p.chart).height);
    assert.ok(labels.every((l) => l.side === "right"));
    assert.deepEqual(
      labels.map((l) => l.row),
      Array.from({ length: labels.length }, (_, i) => i + 1),
    );
  });

  it("con mirror se invierten los lados, en ida y vuelta y en redondo", () => {
    const flatMirror = rowLabels(parseXml(chartToSvg(flat(), { rowNumbers: true, mirror: true })));
    assert.deepEqual(
      flatMirror.map((l) => l.side),
      ["left", "right", "left", "right"],
    );
    const roundMirror = rowLabels(parseXml(chartToSvg(band(), { rowNumbers: true, mirror: true })));
    assert.ok(roundMirror.every((l) => l.side === "left"));
  });

  it("los números quedan en la fila que numeran (fila 1 abajo)", () => {
    const root = parseXml(chartToSvg(flat(), { rowNumbers: true }));
    const ys = byClass(root, "row").map((g) => Number(g.children.find((c) => c.name === "text")?.attrs.y));
    for (let i = 1; i < ys.length; i++) assert.ok((ys[i] ?? 0) < (ys[i - 1] ?? 0), "cada fila siguiente está más arriba");
  });

  it("la flecha apunta hacia el gráfico, en el sentido de lectura", () => {
    const root = parseXml(chartToSvg(flat(), { rowNumbers: true }));
    for (const g of byClass(root, "row")) {
      const d = g.children.find((c) => c.name === "path")?.attrs.d ?? "";
      // Desde la punta, el triángulo se abre hacia afuera: +x a la derecha, −x a la izquierda.
      const dx = Number(/l(-?[\d.]+)/.exec(d)?.[1]);
      assert.equal(Math.sign(dx), g.attrs["data-side"] === "right" ? 1 : -1);
    }
  });

  it("mirror solo cambia la numeración y las flechas, nunca las casillas", () => {
    const p = flat();
    p.chart.cells = [0, NO_STITCH, 0, 0, 0, 0, NO_STITCH, 0, 0, 0, 0, 0];
    const a = parseXml(chartToSvg(p, { rowNumbers: true, symbols: true }));
    const b = parseXml(chartToSvg(p, { rowNumbers: true, symbols: true, mirror: true }));
    // Las casillas pueden quedar desplazadas si cambia el lado de la numeración: se comparan relativas al gráfico.
    const rel = (root: XmlElement) => {
      const cells = cellsOf(root);
      const x0 = Math.min(...cells.map((c) => Number(c.attrs.x)));
      return cells.map((c) => ({ x: Number(c.attrs.x) - x0, y: c.attrs.y, fill: c.attrs.fill?.startsWith("url(") ? "ns" : c.attrs.fill }));
    };
    assert.deepEqual(rel(b), rel(a));
  });

  it("sin rowNumbers no hay numeración", () => {
    assert.equal(byClass(parseXml(chartToSvg(flat())), "row").length, 0);
  });
});

describe("chartToSvg: gráfico completo demasiado grande", () => {
  it(`por encima de ${CHART_SVG_MAX_CELLS} casillas dibuja solo el motivo, con un rótulo visible`, () => {
    const p = chartPattern({ width: 10, height: 10, cells: new Array(100).fill(0), repeat: { x: 30, y: 20 } }, [yarnA]);
    assert.ok(fullSize(p.chart).width * fullSize(p.chart).height > CHART_SVG_MAX_CELLS);
    const svg = chartToSvg(p, { rowNumbers: true, showRepeats: true });
    const root = parseXml(svg);
    assert.equal(root.attrs["data-view"], "motif");
    assert.equal(cellsOf(root).length, 100);
    assert.equal(byClass(root, "row").length, 10);
    assert.match(svg, /Motivo: se repite 30 × 20 veces/);
  });

  it(`con exactamente ${CHART_SVG_MAX_CELLS} casillas todavía dibuja el gráfico completo`, () => {
    const p = chartPattern({ width: 10, height: 10, cells: new Array(100).fill(0), repeat: { x: 20, y: 20 } }, [yarnA]);
    const root = parseXml(chartToSvg(p));
    assert.equal(root.attrs["data-view"], "full");
    assert.equal(cellsOf(root).length, CHART_SVG_MAX_CELLS);
  });
});
