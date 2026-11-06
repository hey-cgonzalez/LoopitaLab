import { NO_STITCH, newChartPattern, shaping, stitchTotal, dimensionsCm, type ChartPattern, type Issue } from "@loopitalab/pattern-core";
import { describe, expect, it } from "vitest";
import { groupIssues, measures, validateForPanel } from "@/lib/studio/measures.ts";
import { applicableLimitations, diffCharts, planPreview } from "@/lib/studio/preview-plan.ts";
import { compositionSum, newYarnFor, nextYarnId, normalizeNote, withNote, yarnProblems } from "@/lib/studio/yarn-edit.ts";

const yarn = (id: string, hex = "#FFFFFF") => ({ id, weight: 4 as const, composition: [{ fiber: "lana", percent: 100 }], color: { hex } });
function doc(over: Partial<Parameters<typeof newChartPattern>[0]> = {}): ChartPattern {
  return newChartPattern({ id: "d1", title: "T", width: 4, height: 3, repeat: { x: 2, y: 1 }, workedIn: "rounds", renderAs: "tube", direction: "bottom_up", yarns: [yarn("A"), yarn("B", "#BA222C")], ...over });
}
const issue = (code: string, severity: Issue["severity"]): Issue => ({ code, severity, path: "x", message: code });

describe("validación separada por tipo", () => {
  it("errores de tejido, estructurales, advertencias e información", () => {
    const g = groupIssues([issue("CHART_EMPTY", "error"), issue("CHART_ROW_EMPTY_FULL", "error"), issue("SHAPE", "error"), issue("W", "warning"), issue("I", "info")]);
    expect(g.cannotKnit.map((i) => i.code)).toEqual(["CHART_EMPTY", "CHART_ROW_EMPTY_FULL"]);
    expect(g.cannotSave.map((i) => i.code)).toEqual(["SHAPE"]);
    expect(g.warnings).toHaveLength(1);
    expect(g.info).toHaveLength(1);
  });
  it("un diseño vacío impide tejer, no guardar", () => {
    const d = doc();
    const empty = { ...d, chart: { ...d.chart, cells: d.chart.cells.map(() => NO_STITCH) } };
    const g = validateForPanel(empty);
    expect(g.cannotKnit.length).toBeGreaterThan(0);
    expect(g.cannotSave).toHaveLength(0);
  });
});

describe("medidas y muestra supuesta (CA-F4)", () => {
  it("sin muestra usa la supuesta y la marca; con muestra no", () => {
    const d = doc();
    const a = measures(d);
    expect(a.gauge?.assumed).toBe(true);
    expect(a.total).toBe(stitchTotal(d.chart));
    expect(a.dims).toEqual(dimensionsCm(d.chart, a.gauge!.gauge));
    expect(a.dims?.widthIsCircumference).toBe(true);
    const b = measures({ ...d, gauge: { stitchesPer10cm: 20, rowsPer10cm: 28 } });
    expect(b.gauge?.assumed).toBe(false);
    expect(b.gauge?.gauge).toEqual({ stitchesPer10cm: 20, rowsPer10cm: 28 });
  });
  it("sin puntos no hay medidas; el círculo trae puntos por vuelta de pattern-core", () => {
    const d = doc();
    expect(measures({ ...d, chart: { ...d.chart, cells: d.chart.cells.map(() => NO_STITCH) } }).dims).toBeNull();
    const c = doc({ renderAs: "circle" });
    expect(measures(c).rounds?.shaping).toEqual(shaping(c.chart));
    expect(measures(d).rounds).toBeNull();
  });
});

describe("lanas y notas", () => {
  it("normaliza \\r\\n y quita caracteres de control", () => {
    expect(normalizeNote("a\r\nb\rc\u0000d\te\u0007")).toBe("a\nb\ncd\te");
    expect(withNote(yarn("A"), "   ").note).toBe("   ");
    expect("note" in withNote(yarn("A"), "")).toBe(false);
  });
  it("lana nueva: id libre, y composición que no suma 100 es error", () => {
    expect(nextYarnId([yarn("A"), yarn("C")])).toBe("B");
    expect(newYarnFor(doc()).id).toBe("C");
    const y = { ...yarn("A"), composition: [{ fiber: "lana", percent: 60 }, { fiber: "algodon", percent: 30 }] };
    expect(compositionSum(y.composition)).toBe(90);
    expect(yarnProblems(y).errors.map((i) => i.code)).toContain("YARN_COMPOSITION_SUM");
  });
});

describe("vista previa: plan, diferencias y limitaciones", () => {
  it("avisa antes del tope", () => {
    const d = doc({ width: 200, height: 200, repeat: { x: 6, y: 5 } });
    expect(planPreview(d.chart).kind).toBe("too-large");
    expect(planPreview(doc({ width: 200, height: 200, repeat: { x: 2, y: 1 } }).chart).kind).toBe("slow");
    expect(planPreview(doc().chart).kind).toBe("ok");
  });
  it("diffCharts distingue casillas de recalcular", () => {
    const d = doc();
    const cells = d.chart.cells.slice();
    cells[2] = 1;
    expect(diffCharts(d.chart, { ...d.chart, cells }, undefined, undefined)).toEqual({ kind: "cells", cells: [2] });
    expect(diffCharts(d.chart, { ...d.chart, repeat: { x: 3, y: 1 } }, undefined, undefined).kind).toBe("relayout");
    expect(diffCharts(d.chart, d.chart, undefined, undefined).kind).toBe("same");
  });
  it("huecos de sin punto en plano y tubo (CA-F13); el círculo no los lleva", () => {
    const d = doc();
    const holes = { ...d, chart: { ...d.chart, cells: d.chart.cells.map((v, i) => (i === 0 ? NO_STITCH : v)) } };
    expect(applicableLimitations(holes, { distorted: false })).toContain("huecosSinPunto");
    expect(applicableLimitations({ ...holes, chart: { ...holes.chart, renderAs: "circle" } }, { distorted: true })).toEqual(expect.arrayContaining(["deformacionCirculo"]));
    expect(applicableLimitations({ ...holes, chart: { ...holes.chart, renderAs: "circle" } }, { distorted: false })).not.toContain("huecosSinPunto");
    expect(applicableLimitations({ ...d, chart: { ...d.chart, renderAs: "yoke" } }, { distorted: false })).toContain("canesu");
  });
});
