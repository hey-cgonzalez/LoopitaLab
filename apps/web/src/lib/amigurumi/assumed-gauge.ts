import { gaugeWeightOf, type GaugeStitch, type Part, type WrittenPattern } from "@loopitalab/pattern-core";
import { suggestedGauge } from "@loopitalab/yarn-catalog";

/*
 * Muestra supuesta de una parte (revisión T21, C1; BUG-QA4-1). Única fuente para el validador, la descripción
 * accesible, el panel de la muestra y la forma 3D: la lana con que empieza la parte (`gaugeWeightOf`; si no hay
 * grosor conocido, el grosor 4, medio) y la muestra de crochet que `yarn-catalog` sugiere para ese grosor, con
 * `assumption` traducido al punto (`crochet-pa` → `dc`; si no, `sc`). Siempre es un supuesto (regla de oro 6).
 */

export const FALLBACK_WEIGHT = 4;

export interface AssumedPartGauge {
  stitchesPer10cm: number;
  rowsPer10cm: number;
  gaugeStitch: GaugeStitch;
  /** Grosor CYC usado (el de la lana inicial de la parte o el de respaldo). */
  weight: number;
}

export function assumedGaugeOfPart(pattern: Pick<WrittenPattern, "yarns">, part: Pick<Part, "startYarn">): AssumedPartGauge {
  const weight = gaugeWeightOf(pattern, part) ?? FALLBACK_WEIGHT;
  const s = suggestedGauge(weight, "crochet") ?? suggestedGauge(FALLBACK_WEIGHT, "crochet")!;
  return { stitchesPer10cm: s.stitchesPer10cm, rowsPer10cm: s.rowsPer10cm, gaugeStitch: s.assumption === "crochet-pa" ? "dc" : "sc", weight };
}
