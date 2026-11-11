import { newChartPattern, type ChartPattern, type Yarn } from "@loopitalab/pattern-core";
import { PALETTE, WEIGHTS } from "@loopitalab/yarn-catalog";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LengthView } from "@/components/studio/YarnLengthPanel.tsx";
import { YarnCompositionEditor } from "@/components/studio/YarnCompositionEditor.tsx";
import { YarnColorPicker } from "@/components/studio/YarnColorPicker.tsx";
import { YarnPicker } from "@/components/studio/YarnPicker.tsx";
import { YarnWeightPicker } from "@/components/studio/YarnWeightPicker.tsx";
import { LENGTH_SCOPE_NOTE, assumptionText, lengthLabel, swatchAdviceText, yarnLengthReport } from "@/lib/studio/metraje.ts";
import { DocumentStore } from "@/lib/studio/store.ts";
import { applySavedYarn, customColorInfo, fiberRowProblems, newYarnFromSaved, paletteNavigate, parseHexInput, weightOptions } from "@/lib/studio/yarn-picker.ts";
import type { SavedYarn } from "@/lib/yarns/saved.ts";

/*
 * T9 de la fase 3 (ADR 0008 §2 a §6; casos F3-21 a F3-36): lógica pura del selector de lanas, informe de metraje y
 * render estático de los componentes (nombres accesibles, rótulos, sin gramos ni ovillos).
 */

const yarn = (id: string, over: Partial<Yarn> = {}): Yarn => ({ id, weight: 4, composition: [{ fiber: "lana", percent: 100 }], color: { hex: id === "A" ? "#FFFFFF" : "#BA222C" }, ...over });

/** Gorro de 112 puntos × 60 vueltas con dos lanas (F3-21: damero; F3-22: bandas de vuelta completa). */
function hat(pattern: "checker" | "bands", over: Partial<ChartPattern> = {}): ChartPattern {
  const d = newChartPattern({ id: "d1", title: "Gorro", width: 112, height: 60, repeat: { x: 1, y: 1 }, workedIn: "rounds", renderAs: "tube", direction: "bottom_up", yarns: [yarn("A"), yarn("B")] });
  const cells = d.chart.cells.map((_, i) => {
    const x = i % 112;
    const y = Math.floor(i / 112);
    return pattern === "checker" ? (x + y) % 2 : y % 2;
  });
  return { ...d, ...over, chart: { ...d.chart, cells } };
}

describe("metraje por lana (F3-21 a F3-27)", () => {
  it("F3-21: damero de dos lanas con muestra supuesta de la categoría 4", () => {
    const r = yarnLengthReport(hat("checker"));
    expect(r.rows.map((x) => x.stitches)).toEqual([3360, 3360]);
    for (const row of r.rows) expect(row.estimate).toMatchObject({ meters: 105, low: 85, high: 125 });
    expect(r.total).toEqual({ meters: 210, low: 170, high: 250 });
    expect(r.gaugeAssumed).toBe(true);
    expect(r.assumptions).toEqual(["assumed_gauge", "loop_factor", "float_slack", "waste_margin"]);
  });

  it("F3-22: bandas completas no tienen flotantes (sin su supuesto) y gastan menos", () => {
    const r = yarnLengthReport(hat("bands"));
    expect(r.rows.map((x) => x.estimate?.meters)).toEqual([80, 80]);
    expect(r.assumptions).not.toContain("float_slack");
  });

  it("F3-23: con la muestra del documento no hay 'muestra supuesta' y los metros bajan con más puntos en 10 cm", () => {
    const assumed = yarnLengthReport(hat("checker"));
    const own = yarnLengthReport(hat("checker", { gauge: { stitchesPer10cm: 22, rowsPer10cm: 30 } }));
    expect(own.gaugeAssumed).toBe(false);
    expect(own.assumptions).not.toContain("assumed_gauge");
    expect(own.rows[0]!.estimate!.meters).toBeLessThan(assumed.rows[0]!.estimate!.meters);
  });

  it("F3-24: la categoría 7 marca baja confianza", () => {
    const d = hat("checker");
    const r = yarnLengthReport({ ...d, yarns: d.yarns.map((y) => ({ ...y, weight: 7 as const })) });
    expect(r.assumptions).toContain("low_confidence_weight");
  });

  it("F3-25: en crochet no hay estimación (no se inventa) pero sí los puntos del motor", () => {
    const r = yarnLengthReport({ ...hat("checker"), technique: "crochet" });
    expect(r.rows.every((x) => x.estimate === undefined)).toBe(true);
    expect(r.rows.map((x) => x.stitches)).toEqual([3360, 3360]);
    expect(r.total).toBeUndefined();
    const html = renderToStaticMarkup(createElement(LengthView, { report: r }));
    expect(html).toContain("Sin estimación en crochet");
    expect(html).not.toContain("≈");
  });

  it("F3-27: el rótulo, los supuestos, el alcance y la sugerencia de tejer la muestra con las lanas", () => {
    expect(lengthLabel({ meters: 105, low: 85, high: 125 })).toBe("≈ 105 m (entre 85 y 125 m), estimación");
    const html = renderToStaticMarkup(createElement(LengthView, { report: yarnLengthReport(hat("checker")) }));
    expect(html).toContain("≈ 105 m (entre 85 y 125 m), estimación");
    expect(html).toContain(LENGTH_SCOPE_NOTE);
    expect(html).toContain("no incluye elástico, montaje ni remate");
    expect(html).toContain("Teje una muestra con las lanas A y B del diseño");
    expect(html).toContain("Muestra supuesta");
    expect(html).not.toMatch(/gramos|ovillo/i);
    expect(swatchAdviceText(["A"])).toContain("la lana A");
    expect(swatchAdviceText(["A", "B", "C"])).toContain("A, B y C");
  });

  it("los textos de supuestos salen de las constantes del catálogo (no se repiten números)", () => {
    expect(assumptionText("loop_factor")).toContain("3,8");
    expect(assumptionText("float_slack")).toContain("10 %");
    expect(assumptionText("waste_margin")).toContain("10 %");
  });

  it("un diseño sin lanas o sin puntos no revienta", () => {
    const d = hat("checker");
    const empty = yarnLengthReport({ ...d, chart: { ...d.chart, cells: d.chart.cells.map(() => -1) } });
    expect(empty.rows.every((r) => r.stitches === 0 && r.estimate?.meters === 0)).toBe(true);
  });
});

describe("grosor: búsqueda y lista (T1-8, F3-28 a F3-33)", () => {
  it("sin búsqueda están las 8 categorías; con búsqueda, las que coinciden", () => {
    expect(weightOptions("").options).toHaveLength(WEIGHTS.length);
    expect(weightOptions("aran").options.map((o) => o.cat)).toEqual([4]);
    const dk = weightOptions("DK").options;
    expect(dk[0]!.cat).toBe(3);
    expect(dk.find((o) => o.cat === 2)?.approximate).toBe(true);
    expect(weightOptions("dk").options).toEqual(weightOptions("DK").options);
  });
  it("'ply' y las búsquedas cortas explican en vez de adivinar", () => {
    const ply = weightOptions("4 ply");
    expect(ply.options).toEqual([]);
    expect(ply.message).toContain("cambia según el país");
    expect(weightOptions("a").message).toContain("al menos 2 letras");
  });
});

describe("color: paleta, foco itinerante y personalizado", () => {
  const rows = [{ length: 6 }, { length: 6 }, { length: 6 }];
  it("las flechas no dan la vuelta y arriba/abajo conservan la columna", () => {
    expect(paletteNavigate(rows, { row: 0, col: 0 }, "ArrowLeft")).toEqual({ row: 0, col: 0 });
    expect(paletteNavigate(rows, { row: 0, col: 5 }, "ArrowRight")).toEqual({ row: 0, col: 5 });
    expect(paletteNavigate(rows, { row: 1, col: 3 }, "ArrowDown")).toEqual({ row: 2, col: 3 });
    expect(paletteNavigate(rows, { row: 2, col: 3 }, "ArrowDown")).toEqual({ row: 2, col: 3 });
    expect(paletteNavigate(rows, { row: 0, col: 3 }, "ArrowUp")).toEqual({ row: 0, col: 3 });
    expect(paletteNavigate(rows, { row: 1, col: 3 }, "Home")).toEqual({ row: 1, col: 0 });
    expect(paletteNavigate(rows, { row: 1, col: 3 }, "End")).toEqual({ row: 1, col: 5 });
  });
  it("hex: acepta con o sin #, rechaza lo incompleto", () => {
    expect(parseHexInput("a63d40")).toBe("#A63D40");
    expect(parseHexInput(" #a63d40 ")).toBe("#A63D40");
    expect(parseHexInput("#12")).toBeNull();
    expect(parseHexInput("")).toBeNull();
  });
  it("F3-36: 'prácticamente igual' solo bajo el umbral; un color de la paleta es exacto", () => {
    const c = PALETTE[0]!;
    expect(customColorInfo(c.hex).exact?.id).toBe(c.id);
    const near = `#${c.hex.slice(1, 5)}${(Math.min(255, parseInt(c.hex.slice(5), 16) + 1)).toString(16).padStart(2, "0")}`;
    const info = customColorInfo(near);
    expect(info.nearest?.color.id).toBe(c.id);
    expect(info.practicallySame).toBe(true);
    expect(customColorInfo("#00FF00").practicallySame).toBe(false);
    expect(customColorInfo("#zzz").nearest).toBeUndefined();
  });
});

describe("composición: avisos por fibra", () => {
  it("porcentaje fuera de rango, fibra repetida y fibra desconocida", () => {
    const p = fiberRowProblems([
      { fiber: "lana", percent: 0 },
      { fiber: "lana", percent: 50 },
      { fiber: "inventada", percent: 150 },
      { fiber: "algodon", percent: Number.NaN },
    ]);
    expect(p[0]!.map((x) => x.level)).toContain("error");
    expect(p[1]!.some((x) => x.message.includes("ya está en la lista"))).toBe(true);
    expect(p[2]!.some((x) => x.level === "warning")).toBe(true);
    expect(p[2]!.some((x) => x.level === "error" && x.message.includes("100"))).toBe(true);
    expect(p[3]![0]!.message).toContain("Escribe");
    expect(fiberRowProblems([{ fiber: "lana", percent: 100 }])[0]).toEqual([]);
  });
});

describe("Mis lanas: usar una lana guardada (copia por valor, nota solo si se pide)", () => {
  const saved: SavedYarn = { id: "u1", weight: 5, composition: [{ fiber: "lana", percent: 70 }, { fiber: "mohair", percent: 30 }], color: { hex: PALETTE[3]!.hex, paletteId: PALETTE[3]!.id }, note: "la del cajón, tienda del centro", createdAt: "2026-11-01T00:00:00Z" };
  it("no copia la nota por defecto y conserva la nota propia de la lana del diseño", () => {
    const target = yarn("B", { note: "para el borde" });
    const r = applySavedYarn(target, saved);
    expect(r.errors).toEqual([]);
    expect(r.yarn).toMatchObject({ id: "B", weight: 5, note: "para el borde" });
    expect(JSON.stringify(r.yarn)).not.toContain("cajón");
    const c = applySavedYarn(target, saved, { copyNote: true });
    expect(c.yarn.note).toBe(saved.note);
    // Copia por valor: editar el resultado no toca la lana guardada.
    r.yarn.composition[0]!.percent = 1;
    expect(saved.composition[0]!.percent).toBe(70);
  });
  it("solo se escribe lo guardable: una lana guardada inválida no entra", () => {
    const bad: SavedYarn = { ...saved, composition: [{ fiber: "lana", percent: 90 }] };
    expect(applySavedYarn(yarn("A"), bad).errors.length).toBeGreaterThan(0);
    expect(newYarnFromSaved("C", bad).errors.length).toBeGreaterThan(0);
    expect(newYarnFromSaved("C", saved).yarn.id).toBe("C");
  });
});

describe("render estático del selector", () => {
  const store = new DocumentStore(hat("checker"));
  const noop = () => {};

  it("paleta: una muestra por color con nombre accesible, foco itinerante y estado que no depende del color", () => {
    const c = PALETTE[5]!;
    const html = renderToStaticMarkup(createElement(YarnColorPicker, { store, index: 0, color: { hex: c.hex, paletteId: c.id }, onPick: noop, onCustom: noop }));
    expect((html.match(/data-swatch=/g) ?? []).length).toBe(PALETTE.length);
    for (const p of PALETTE) expect(html).toContain(`aria-label="${p.nombre}"`);
    expect((html.match(/tabindex="0"/g) ?? []).length, "un solo botón de la paleta en el orden de tabulación").toBeGreaterThanOrEqual(1);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("✓");
  });

  it("grosor: el nombre en inglés, la muestra supuesta y la categoría 7 con baja confianza", () => {
    const html = renderToStaticMarkup(createElement(YarnWeightPicker, { weight: 7, technique: "knit", gaugeAssumed: true, onPick: noop }));
    expect(html).toContain("Medio (Worsted / Aran)");
    expect(html).toContain("Muestra supuesta");
    expect(html).toContain("Confianza baja");
    expect(html).toContain("Sobre los nombres de los grosores");
    expect(html).not.toMatch(/orquidea|revesderecho|modista/i);
  });

  it("composición: suma visible con ✓ o ×, y avisos por fibra", () => {
    const ok = renderToStaticMarkup(createElement(YarnCompositionEditor, { composition: [{ fiber: "lana", percent: 100 }], onChange: noop, onCommit: noop }));
    expect(ok).toContain("Suma: 100 %");
    const bad = renderToStaticMarkup(createElement(YarnCompositionEditor, { composition: [{ fiber: "lana", percent: 70 }, { fiber: "lana", percent: 20 }], onChange: noop, onCommit: noop }));
    expect(bad).toContain("Faltan 10 %");
    expect(bad).toContain("ya está en la lista");
  });

  it("selector completo: pestañas con roles, nota privada y Esc anunciado", () => {
    const html = renderToStaticMarkup(createElement(YarnPicker, { store, index: 0, yarn: store.doc.yarns[0]!, letter: "A", technique: "knit", gaugeAssumed: false, canAdd: true, onClose: noop, announce: noop, onAdded: noop }));
    expect(html).toContain('role="tablist"');
    expect(html).toContain("Ajustar la lana");
    expect(html).toContain("Mis lanas");
    expect(html).toContain("Mi lana (opcional)");
    expect(html).toContain("Esc cierra el selector");
  });
});
