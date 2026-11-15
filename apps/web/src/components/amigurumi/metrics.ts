import { partProfile, shapeMetrics, type GaugeStitch, type Part, type PartProfile, type ShapeMetrics, type WrittenPattern } from "@loopitalab/pattern-core";
import { profileToSvg } from "@loopitalab/viewer-3d";
import { suggestedGauge } from "@loopitalab/yarn-catalog";

/*
 * Muestra de cada parte para la forma 3D (ADR 0010, sección 1; enmiendas C-3 y T5-1). La resuelve la aplicación:
 * - la del documento, leída como punto bajo;
 * - si falta, la sugerida para crochet por el grosor de la lana inicial de la parte (`suggestedGauge`), marcada
 *   como supuesta, con `assumption` traducido (`crochet-pa` → `dc`, si no `sc`);
 * - si la lana no tiene un grosor conocido, la del grosor 4 (medio), también supuesta (regla de oro 6: se marca,
 *   no se esconde).
 */

const FALLBACK_WEIGHT = 4;

export function metricsResolver(pattern: WrittenPattern): (part: Part) => ShapeMetrics {
  if (pattern.gauge) {
    const m = shapeMetrics(pattern.gauge, { assumed: false, gaugeStitch: "sc" });
    return () => m;
  }
  const byWeight = new Map<number, ShapeMetrics>();
  const weightOf = (part: Part): number => {
    const y = pattern.yarns.find((x) => x.id === part.startYarn) ?? pattern.yarns[0];
    return typeof y?.weight === "number" ? y.weight : FALLBACK_WEIGHT;
  };
  return (part) => {
    const w = weightOf(part);
    let m = byWeight.get(w);
    if (!m) {
      const s = suggestedGauge(w, "crochet") ?? suggestedGauge(FALLBACK_WEIGHT, "crochet")!;
      const gaugeStitch: GaugeStitch = s.assumption === "crochet-pa" ? "dc" : "sc";
      m = shapeMetrics({ stitchesPer10cm: s.stitchesPer10cm, rowsPer10cm: s.rowsPer10cm }, { assumed: true, gaugeStitch });
      byWeight.set(w, m);
    }
    return m;
  };
}

export interface PartSummary {
  partId: string;
  name: string;
  copies: number;
  heightCm: number;
  widthCm: number;
  assumed: boolean;
  /** Color plano de la lana inicial (para la silueta). */
  hex: string;
}

/**
 * Alto y ancho de la pieza: los mismos campos que lee `partDimensions` del motor (alto; diámetro máximo o ancho
 * máximo del panel). Se leen directo para no sumar esa función al fragmento compartido de `pattern-core`.
 */
const dimensionsOf = (p: PartProfile): { heightCm: number; widthCm: number } => ({ heightCm: p.heightCm, widthCm: p.kind === "revolution" ? p.maxDiameterCm : p.maxWidthCm });

const copiesOf = (part: Part): number => (typeof part.copies === "number" && Number.isInteger(part.copies) && part.copies >= 1 ? part.copies : 1);

/** Medidas estimadas por parte (cuestan lo que las vueltas, no lo que los puntos). */
export function partSummaries(pattern: WrittenPattern, metrics: (part: Part) => ShapeMetrics = metricsResolver(pattern)): PartSummary[] {
  return pattern.parts.map((part) => {
    const m = metrics(part);
    const dims = dimensionsOf(partProfile(part, m));
    const hex = pattern.yarns.find((y) => y.id === part.startYarn)?.color.hex ?? "#8C8C8C";
    return { partId: part.id, name: part.name, copies: copiesOf(part), heightCm: dims.heightCm, widthCm: dims.widthCm, assumed: m.assumed, hex };
  });
}

/** Siluetas (`profileToSvg`) con el color plano de la lana inicial de cada parte: sin WebGL2, contexto perdido o sobre el tope. */
export function silhouettesOf(pattern: WrittenPattern, widthPx = 160): Array<PartSummary & { svg: string }> {
  const metrics = metricsResolver(pattern);
  return pattern.parts.map((part) => {
    const m = metrics(part);
    const profile = partProfile(part, m);
    const dims = dimensionsOf(profile);
    const hex = pattern.yarns.find((y) => y.id === part.startYarn)?.color.hex ?? "#8C8C8C";
    return {
      partId: part.id,
      name: part.name,
      copies: copiesOf(part),
      heightCm: dims.heightCm,
      widthCm: dims.widthCm,
      assumed: m.assumed,
      hex,
      svg: profileToSvg(profile, { widthPx, fill: hex, title: part.name }),
    };
  });
}
