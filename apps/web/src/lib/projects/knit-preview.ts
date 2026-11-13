import { planChart } from "@loopitalab/follow";
import { yarnUsage, type ChartPattern } from "@loopitalab/pattern-core";
import { estimateYarnLength, type LengthEstimate } from "@loopitalab/yarn-catalog";
import { gaugeInUse, lengthLowConfidence, validateForPanel } from "../studio/measures.ts";
import type { KnitPreview, KnitPreviewYarn, NotInChartKey } from "./types.ts";

/**
 * Documento de la versión fijada tal como lo recibe el navegador en "Tejiendo" y en la ficha (T17, B3): sin las notas
 * privadas que esas pantallas no muestran (`yarns[*].note`, texto libre de la usuaria, y `notes` del patrón). No muta
 * el original. Así esas notas no viajan en el HTML ni en la carga de React aunque la pantalla no las pinte.
 */
export function knitDocument(doc: ChartPattern): ChartPattern {
  const { notes: _notes, ...rest } = doc;
  void _notes;
  return {
    ...rest,
    yarns: doc.yarns.map((y) => {
      const { note: _note, ...yarn } = y;
      void _note;
      return yarn;
    }),
  };
}

/**
 * Lo que el gráfico no incluye según la técnica y la forma de trabajo (T18, M1). Palillo: montaje, elástico o borde,
 * forma previa, cierre y armado. Crochet: cadeneta base o anillo, cadeneta de vuelta (solo en filas), forma previa,
 * remate y armado. // validar con tejedora
 */
export function notInChartFor(technique: "knit" | "crochet", workedIn: "rounds" | "rows"): NotInChartKey[] {
  if (technique === "crochet") return ["foundation", ...(workedIn === "rows" ? (["turning_chain"] as const) : []), "prior_shaping", "fasten_off", "assembly"];
  return ["cast_on", "edging", "prior_shaping", "bind_off", "assembly"];
}

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
    return { id: y.id, hex: y.color.hex, weight: y.weight, ...u, length: lengthOf(doc, u, gauge, y.weight) };
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
    notInChart: notInChartFor(doc.technique, doc.chart.workedIn),
  };
}

function lengthOf(doc: ChartPattern, usage: { stitches: number; floatStitches: number }, gauge: ReturnType<typeof gaugeInUse>, weight: number): LengthEstimate | null {
  if (!gauge) return null;
  try {
    return (
      estimateYarnLength(usage, { stitchesPer10cm: gauge.gauge.stitchesPer10cm }, { technique: doc.technique, gaugeAssumed: gauge.assumed, lowConfidence: lengthLowConfidence(gauge, weight) }) ?? null
    );
  } catch {
    // Muestra no utilizable: sin estimación, nunca un número inventado.
    return null;
  }
}
