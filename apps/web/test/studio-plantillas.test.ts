import { rowStitchCounts, stitchTotal, validatePattern, type ChartPattern } from "@loopitalab/pattern-core";
import { STUDIO_TEXTS } from "@/lib/studio-texts.ts";
import { describe, expect, it } from "vitest";
import { newChartPattern } from "@loopitalab/pattern-core";
import { TEMPLATES } from "@/lib/studio/templates.ts";
import { buildWizardInput, DEFAULT_WIZARD } from "@/lib/studio/wizard.ts";

const ID = "aaaaaaaa-0000-4000-8000-000000000001";

describe("plantillas", () => {
  for (const t of TEMPLATES) {
    it(`${t.name}: queda guardable, sin errores, y usa la lana de contraste`, () => {
      const doc: ChartPattern = t.paint(newChartPattern({ id: ID, ...t.input }));
      const r = validatePattern(doc);
      expect(r.savable).toBe(true);
      expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
      expect(doc.chart.cells).toContain(1);
      expect(stitchTotal(doc.chart)).toBeGreaterThan(0);
      expect("gauge" in doc).toBe(false);
    });
  }

  it("la copa tiene casillas fuera de forma y 8 repeticiones", () => {
    const crown = TEMPLATES.find((t) => t.id === "crown");
    const doc = crown?.paint(newChartPattern({ id: ID, ...crown.input }));
    expect(doc?.chart.cells).toContain(-1);
    expect(doc?.chart.repeat.x).toBe(8);
    expect(doc?.chart.renderAs).toBe("circle");
  });

  it("la copa es de adulto: 112 puntos en el borde, −8 cada 2 vueltas, cierra con 16 (conteos de pattern-core)", () => {
    const crown = TEMPLATES.find((t) => t.id === "crown")!;
    const doc = crown.paint(newChartPattern({ id: ID, ...crown.input }));
    const counts = rowStitchCounts(doc.chart);
    expect(counts[0]).toBe(112);
    expect(counts.at(-1)).toBe(16);
    for (let y = 1; y < counts.length; y++) expect((counts[y - 1] as number) - (counts[y] as number)).toBe(y % 2 === 0 ? 8 : 0);
    const r = validatePattern(doc);
    expect(r.valid).toBe(true);
    // Hebras flotantes razonables: sin avisos de hebra larga ni de más de 2 lanas por vuelta.
    expect(r.issues.filter((i) => i.code === "CHART_FLOAT_LONG" || i.code === "CHART_COLORS_PER_ROW")).toEqual([]);
    // La descripción lo dice y no promete un tamaño exacto en cm.
    expect(crown.description).toContain("112");
    expect(crown.description).toContain("16");
    expect(crown.description).toContain("depende de tu muestra");
    expect(crown.description).not.toMatch(/\d\s*cm/);
    expect(crown.name).toBe(STUDIO_TEXTS.asistente.plantillaCopa);
    expect(crown.name).toContain("cuñas");
  });
});

describe("asistente de nuevo diseño", () => {
  const form = { ...DEFAULT_WIZARD, title: "Mi gorro" };

  it("con datos válidos arma la entrada y no inventa la muestra", () => {
    const r = buildWizardInput(form);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect("gauge" in r.input).toBe(false);
      const doc = newChartPattern({ id: ID, ...r.input });
      expect(validatePattern(doc).valid).toBe(true);
      expect(doc.yarns[0]?.color.paletteId).toBe("crudo");
    }
  });

  it("incluye la muestra solo si está completa y es válida", () => {
    const r = buildWizardInput({ ...form, gaugeStitches: "20", gaugeRows: "28" });
    expect(r.ok && r.input.gauge).toEqual({ stitchesPer10cm: 20, rowsPer10cm: 28 });
    for (const [s, f] of [["20", ""], ["", "28"], ["0", "28"], ["-3", "28"], ["abc", "28"]] as const) {
      const bad = buildWizardInput({ ...form, gaugeStitches: s, gaugeRows: f });
      expect(bad.ok, `${s}/${f}`).toBe(false);
    }
  });

  it("rechaza título inválido, tamaños fuera de rango y círculo ida y vuelta", () => {
    expect(buildWizardInput({ ...form, title: "" }).ok).toBe(false);
    expect(buildWizardInput({ ...form, title: "x".repeat(121) }).ok).toBe(false);
    expect(buildWizardInput({ ...form, width: "0" }).ok).toBe(false);
    expect(buildWizardInput({ ...form, height: "201" }).ok).toBe(false);
    expect(buildWizardInput({ ...form, repeatX: "501" }).ok).toBe(false);
    expect(buildWizardInput({ ...form, width: "4.5" }).ok).toBe(false);
    expect(buildWizardInput({ ...form, renderAs: "circle", workedIn: "rows" }).ok).toBe(false);
    expect(buildWizardInput({ ...form, colorId: "no-existe" }).ok).toBe(false);
    expect(buildWizardInput({ ...form, fiber: "marca-x" }).ok).toBe(false);
  });
});
