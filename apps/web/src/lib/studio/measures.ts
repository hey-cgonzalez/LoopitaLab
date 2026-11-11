import {
  dimensionsCm,
  rowStitchCounts,
  shaping,
  stitchTotal,
  validatePattern,
  type ChartDimensions,
  type ChartPattern,
  type Gauge,
  type Issue,
  type RowShaping,
  type WeightCategory,
  isDraftError,
} from "@loopitalab/pattern-core";
import { FIBER_IDS, PALETTE_IDS, suggestedGauge, type SuggestedGauge } from "@loopitalab/yarn-catalog";
import { perfSpan } from "./perf.ts";

/*
 * Datos derivados del panel lateral (T9). Cada número sale de pattern-core (CA-F2): aquí solo se elige la muestra
 * (la del documento o la supuesta, marcada como tal, CA-F4) y se junta lo que el panel muestra.
 */

/** Muestra supuesta según el grosor de la primera lana (la lana principal) y la técnica del documento. */
export function assumedGaugeOf(doc: ChartPattern): SuggestedGauge | undefined {
  const cat = doc.yarns[0]?.weight;
  if (cat === undefined) return undefined;
  return suggestedGauge(cat, doc.technique);
}

export interface GaugeUse {
  gauge: Gauge;
  /** true cuando no hay muestra en el documento y se usa la supuesta (CA-F4). */
  assumed: boolean;
  lowConfidence: boolean;
}

/** Muestra con que se calculan medidas y vista previa. `null` solo si el grosor de la lana principal no existe. */
export function gaugeInUse(doc: ChartPattern): GaugeUse | null {
  if (doc.gauge) return { gauge: doc.gauge, assumed: false, lowConfidence: false };
  const s = assumedGaugeOf(doc);
  if (!s) return null;
  return { gauge: { stitchesPer10cm: s.stitchesPer10cm, rowsPer10cm: s.rowsPer10cm }, assumed: true, lowConfidence: s.lowConfidence };
}

/**
 * Regla única de confianza baja del metraje (panel del estudio y pantalla previa): solo con muestra supuesta, y
 * cuando la referencia del grosor principal es poco precisa o la lana en cuestión es de categoría 7.
 */
export function lengthLowConfidence(use: GaugeUse, yarnWeight: number): boolean {
  return use.assumed && (use.lowConfidence || yarnWeight === 7);
}

export interface Measures {
  total: number;
  gauge: GaugeUse | null;
  /** `null` si no hay puntos (la interfaz muestra "—") o no hay muestra utilizable. */
  dims: ChartDimensions | null;
  /** Solo círculo: puntos por vuelta y cambios. */
  rounds: { counts: number[]; shaping: RowShaping[] } | null;
}

export function measures(doc: ChartPattern): Measures {
  const chart = doc.chart;
  const total = stitchTotal(chart);
  const gauge = gaugeInUse(doc);
  const dims = total > 0 && gauge ? dimensionsCm(chart, gauge.gauge) : null;
  const rounds = chart.renderAs === "circle" ? { counts: rowStitchCounts(chart), shaping: shaping(chart) } : null;
  return { total, gauge, dims, rounds };
}

// ------------------------------------------------------------------ validación

export interface IssueGroups {
  /** Errores de tejido: se guarda como borrador, pero no se teje ni se publica. */
  cannotKnit: Issue[];
  /** Errores estructurales (no deberían llegar: la interfaz los evita). */
  cannotSave: Issue[];
  warnings: Issue[];
  info: Issue[];
}

export function groupIssues(issues: readonly Issue[]): IssueGroups {
  const g: IssueGroups = { cannotKnit: [], cannotSave: [], warnings: [], info: [] };
  for (const i of issues) {
    if (i.severity === "error") (isDraftError(i) ? g.cannotKnit : g.cannotSave).push(i);
    else if (i.severity === "warning") g.warnings.push(i);
    else g.info.push(i);
  }
  return g;
}

/** Valida con la muestra supuesta y el grosor, sin cambiar los errores (ADR 0003, E10). Corre diferido, nunca en el camino del dibujo (CA-P7). */
export function validateForPanel(doc: ChartPattern): IssueGroups {
  const assumed = assumedGaugeOf(doc);
  const weightCat: WeightCategory | undefined = doc.yarns[0]?.weight;
  const result = perfSpan("validate:panel", () => validatePattern(doc, {
    fibers: FIBER_IDS,
    paletteIds: PALETTE_IDS,
    ...(assumed ? { assumedGauge: { stitchesPer10cm: assumed.stitchesPer10cm, rowsPer10cm: assumed.rowsPer10cm } } : {}),
    ...(weightCat !== undefined ? { weightCat } : {}),
  }));
  return groupIssues(result.issues);
}
