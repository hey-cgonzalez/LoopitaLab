/**
 * QA de T7: documentos `savable` raros (1 × 1, máscara completa, 32 lanas, motivo diminuto
 * con repeticiones enormes) y `cellPx` en los bordes del intervalo.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIMITS, NO_STITCH, fullSize, stitchTotal, validatePattern, type Yarn } from "@loopitalab/pattern-core";
import { CHART_SVG_MAX_CELLS, DEFAULT_CELL_PX, chartToSvg, describeChart } from "../src/index.ts";
import { chartPattern, yarnA } from "./support/fixtures.ts";
import { byClass, parseXml, walk } from "./support/xml.ts";

const ALL_OPTS = { rowNumbers: true, symbols: true, showRepeats: true } as const;

/** Las 32 lanas con colores distintos (#000000, #080808…). */
function yarns32(): Yarn[] {
  return Array.from({ length: LIMITS.maxYarns }, (_v, i) => {
    const h = (i * 8).toString(16).padStart(2, "0").toUpperCase();
    return { ...structuredClone(yarnA), id: `Y${i}`, color: { hex: `#${h}${h}${h}` } };
  });
}

/** Ningún id duplicado y toda referencia url(#…) / aria-* apunta a un id existente. */
function assertIdsConsistent(svg: string) {
  const root = parseXml(svg);
  const ids = walk(root).map((e) => e.attrs.id).filter((v): v is string => v !== undefined);
  assert.equal(new Set(ids).size, ids.length, "ids duplicados");
  for (const ref of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(ref[1] as string), `url(#${ref[1]}) sin destino`);
  for (const k of ["aria-labelledby", "aria-describedby"]) assert.ok(ids.includes(root.attrs[k] as string), `${k} sin destino`);
}

describe("documentos savable raros", () => {
  it("1 × 1 sin repetir: una casilla, número de fila 1, sin errores", () => {
    const p = chartPattern({ width: 1, height: 1, cells: [1], workedIn: "rows", renderAs: "flat" });
    assert.equal(validatePattern(p).savable, true);
    const svg = chartToSvg(p, ALL_OPTS);
    const root = parseXml(svg);
    assert.equal(byClass(root, "c").length, 1);
    assert.equal(byClass(root, "row").length, 1);
    assert.equal(root.attrs["data-view"], "full");
    assert.ok(Number(root.attrs.width) > 0 && Number(root.attrs.height) > 0);
    assertIdsConsistent(svg);
    assert.match(describeChart(p), /1 × 1|1 punto|1 fila/);
  });

  it("1 × 1 con 500 × 500 repeticiones: no cabe completo, dibuja el motivo con el rótulo", () => {
    const p = chartPattern({ width: 1, height: 1, cells: [0], repeat: { x: LIMITS.maxRepeat, y: LIMITS.maxRepeat } });
    assert.equal(validatePattern(p).savable, true);
    const t0 = performance.now();
    const svg = chartToSvg(p, ALL_OPTS);
    assert.ok(performance.now() - t0 < 200, "no debe recorrer las 250.000 casillas");
    const root = parseXml(svg);
    assert.equal(root.attrs["data-view"], "motif");
    assert.equal(byClass(root, "c").length, 1);
    assert.match(svg, /Motivo: se repite 500 × 500 veces/);
    assertIdsConsistent(svg);
  });

  it("justo en CHART_SVG_MAX_CELLS dibuja completo; una casilla más, solo el motivo", () => {
    const exact = chartPattern({ width: 200, height: 1, cells: Array(200).fill(0), repeat: { x: 1, y: CHART_SVG_MAX_CELLS / 200 } });
    const { width, height } = fullSize(exact.chart);
    assert.equal(width * height, CHART_SVG_MAX_CELLS);
    assert.equal(parseXml(chartToSvg(exact)).attrs["data-view"], "full");
    const over = chartPattern({ width: 1, height: 1, cells: [0], repeat: { x: 201, y: 200 } });
    assert.ok(201 * 200 > CHART_SVG_MAX_CELLS);
    assert.equal(parseXml(chartToSvg(over)).attrs["data-view"], "motif");
  });

  it("máscara completa (todo 'sin punto', gráfico vacío pero guardable): todas las casillas rayadas, sin letras", () => {
    const p = chartPattern({ width: 3, height: 2, cells: Array(6).fill(NO_STITCH), repeat: { x: 2, y: 3 }, workedIn: "rounds", renderAs: "circle" });
    const v = validatePattern(p);
    assert.equal(v.savable, true);
    assert.equal(stitchTotal(p.chart), 0);
    const svg = chartToSvg(p, ALL_OPTS);
    const root = parseXml(svg);
    const cells = byClass(root, "c");
    assert.equal(cells.length, 6 * 6);
    assert.ok(cells.every((c) => (c.attrs.class ?? "").includes("ns")));
    assert.equal(byClass(root, "symbols").length, 0);
    assertIdsConsistent(svg);
    assert.doesNotThrow(() => describeChart(p));
  });

  it("32 lanas (el máximo): cada una con su color y su símbolo, todos distintos", () => {
    const ys = yarns32();
    const cells = Array.from({ length: 32 }, (_v, i) => i);
    const p = chartPattern({ width: 8, height: 4, cells, workedIn: "rows", renderAs: "flat" }, ys);
    assert.equal(validatePattern(p).savable, true);
    const svg = chartToSvg(p, ALL_OPTS);
    const root = parseXml(svg);
    const fills = byClass(root, "c").map((c) => c.attrs.fill);
    assert.equal(new Set(fills).size, 32);
    const letters = walk(root).filter((e) => e.name === "text" && byClass(root, "symbols")[0]?.children.includes(e)).map((e) => e.text);
    assert.equal(letters.length, 32);
    assert.equal(new Set(letters).size, 32, `símbolos repetidos: ${letters.join(" ")}`);
    assertIdsConsistent(svg);
    // La descripción accesible menciona las 32 lanas sin lanzar.
    assert.ok(describeChart(p).length > 0);
  });

  it("33 lanas no es guardable: SVG de error sin texto del documento", () => {
    const ys = [...yarns32(), { ...structuredClone(yarnA), id: "Y32", color: { hex: "#123456" } }];
    const p = chartPattern({ width: 1, height: 1, cells: [0] }, ys);
    p.title = "NO-DEBE-APARECER";
    if (validatePattern(p).savable) return; // si el límite cambiara, esta prueba no aplica
    const svg = chartToSvg(p);
    assert.doesNotMatch(svg, /NO-DEBE-APARECER/);
    assert.match(svg, /No se puede dibujar el gráfico/);
  });
});

describe("cellPx en los bordes", () => {
  const p = chartPattern({ width: 2, height: 2, cells: [0, 1, 1, 0], workedIn: "rows", renderAs: "flat" });
  const size = (cellPx: unknown) => byClass(parseXml(chartToSvg(p, { cellPx } as never)), "c")[0]?.attrs.width;

  it("redondea y acota a [4, 64]", () => {
    const cases: [number, string][] = [
      [4, "4"], [3.5, "4"], [3.49, "4"], [4.49, "4"], [4.5, "5"], [0, "4"], [-0, "4"], [-50, "4"], [Number.MIN_VALUE, "4"],
      [64, "64"], [64.49, "64"], [64.5, "64"], [63.5, "64"], [Number.MAX_VALUE, "64"],
    ];
    for (const [v, want] of cases) assert.equal(size(v), want, `cellPx = ${v}`);
  });

  it("valores no numéricos o no finitos usan el tamaño por defecto", () => {
    for (const v of [undefined, null, "32", Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, {}]) {
      assert.equal(size(v), String(DEFAULT_CELL_PX), `cellPx = ${String(v)}`);
    }
  });

  // Hallazgo de QA (T7): chartToSvg documenta que nunca lanza, pero el prefijo de ids hace
  // JSON.stringify(opts) y una opción BigInt (o un objeto cíclico) lanza TypeError. Solo un
  // llamador sin tipos puede pasarla. Corregido en T7b: el hash usa opciones normalizadas.
  it("opciones no serializables (BigInt, ciclo) no hacen lanzar a chartToSvg", () => {
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    assert.doesNotThrow(() => chartToSvg(p, { cellPx: 10n } as never));
    assert.doesNotThrow(() => chartToSvg(p, cyc as never));
  });

  it("con cellPx 4 y 64 el SVG sigue siendo coherente: tamaño = casillas × lado + márgenes, letras legibles (≥ 3 px)", () => {
    for (const cellPx of [4, 64]) {
      const svg = chartToSvg(p, { ...ALL_OPTS, cellPx });
      const root = parseXml(svg);
      for (const c of byClass(root, "c")) assert.equal(c.attrs.width, String(cellPx));
      const sym = byClass(root, "symbols")[0];
      assert.ok(sym && Number(sym.attrs["font-size"]) >= 3);
      assert.ok(Number(root.attrs.width) >= 2 * cellPx && Number(root.attrs.height) >= 2 * cellPx);
      assert.equal(root.attrs.viewBox, `0 0 ${root.attrs.width} ${root.attrs.height}`);
      assertIdsConsistent(svg);
    }
  });
});
