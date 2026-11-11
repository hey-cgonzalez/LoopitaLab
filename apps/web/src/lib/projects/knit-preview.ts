import { planChart } from "@loopitalab/follow";
import { yarnUsage, type ChartPattern } from "@loopitalab/pattern-core";
import { estimateYarnLength, type LengthEstimate } from "@loopitalab/yarn-catalog";
import { gaugeInUse, validateForPanel } from "../studio/measures.ts";
import type { KnitPreview, KnitPreviewYarn } from "./types.ts";

/**
 * Datos de la pantalla previa a "Tejer este diseño" (ADR 0009, T1-7; caso F3-39). Nada se calcula aquí: la muestra
 * sale de `gaugeInUse`, el metraje de `yarnUsage` + `estimateYarnLength` (solo palillo), las advertencias de
 * `validatePattern` (con la muestra supuesta, como el panel del estudio) y las filas de `planChart`. Función pura.
 */
export function buildKnitPreview(doc: ChartPattern, patternUpdatedAt: string): KnitPreview {
  const gauge = gaugeInUse(doc);
  const plan = planChart(doc);
  const usage = yarnUsage(doc.chart, doc.yarns.length);
  const groups = validateForPanel(doc);

  const yarns: KnitPreviewYarn[] = doc.yarns.map((y, i) => {
    const u = { stitches: usage.stitches[i] ?? 0, floatStitches: usage.floatStitches[i] ?? 0 };
    return { id: y.id, hex: y.color.hex, weight: y.weight, ...u, length: lengthOf(doc, u, gauge) };
  });

  return {
    patternUpdatedAt,
    title: doc.title,
    technique: doc.technique,
    gauge: gauge ? { stitchesPer10cm: gauge.gauge.stitchesPer10cm, rowsPer10cm: gauge.gauge.rowsPer10cm, assumed: gauge.assumed, lowConfidence: gauge.lowConfidence } : null,
    shape: {
      workedIn: doc.chart.workedIn,
      renderAs: doc.chart.renderAs,
      direction: doc.chart.direction,
      totalRows: plan.totalRows,
      totalStitches: plan.totalStitches,
      motif: { width: doc.chart.width, height: doc.chart.height },
      repeat: { x: doc.chart.repeat.x, y: doc.chart.repeat.y },
      flatAndSewn: (doc.chart.renderAs === "tube" || doc.chart.renderAs === "circle") && doc.chart.workedIn === "rows",
    },
    yarns,
    lengthScope: "chart_only",
    warnings: groups.warnings,
    info: groups.info,
    notInChart: ["cast_on", "edging", "bind_off", "assembly"],
  };
}

function lengthOf(doc: ChartPattern, usage: { stitches: number; floatStitches: number }, gauge: ReturnType<typeof gaugeInUse>): LengthEstimate | null {
  if (!gauge) return null;
  try {
    return (
      estimateYarnLength(usage, { stitchesPer10cm: gauge.gauge.stitchesPer10cm }, { technique: doc.technique, gaugeAssumed: gauge.assumed, lowConfidence: gauge.lowConfidence }) ?? null
    );
  } catch {
    // Muestra no utilizable: sin estimación, nunca un número inventado.
    return null;
  }
}
