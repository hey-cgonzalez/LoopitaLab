import { yarnLetter, yarnUsage, type ChartPattern } from "@loopitalab/pattern-core";
import { YARN_LENGTH_ASSUMPTIONS, estimateYarnLength, type LengthAssumption, type LengthEstimate } from "@loopitalab/yarn-catalog";
import { gaugeInUse, lengthLowConfidence } from "./measures.ts";
import { colorName } from "./yarn-picker.ts";

/*
 * Metraje por lana (T9 de la fase 3, ADR 0008 sección 6 y enmiendas T1-1 y T1-6). La interfaz no calcula nada
 * (regla de oro 2): los puntos y las hebras flotantes salen de `yarnUsage` (pattern-core) y los metros de
 * `estimateYarnLength` (yarn-catalog). Aquí solo se juntan y se rotulan.
 */

export interface YarnLengthRow {
  id: string;
  letter: string;
  hex: string;
  /** Nombre del color de la paleta o "color personalizado". */
  colorName: string;
  /** Puntos de la lana en el gráfico completo (de `yarnUsage`). */
  stitches: number;
  /** `undefined` en crochet: no hay factores validados (F3-25), la interfaz dice "sin estimación". */
  estimate: LengthEstimate | undefined;
}

export interface YarnLengthReport {
  technique: "knit" | "crochet";
  rows: YarnLengthRow[];
  /** La muestra es la supuesta del grosor (no la de la usuaria). */
  gaugeAssumed: boolean;
  /** Suma de las lanas (metros crudos redondeados por lana); `undefined` si alguna lana no tiene estimación. */
  total: { meters: number; low: number; high: number } | undefined;
  /** Supuestos de todas las lanas, sin repetir, en el orden del paquete. */
  assumptions: LengthAssumption[];
  /** No hay muestra utilizable (el grosor de la primera lana no existe): no se estima. */
  noGauge: boolean;
}

export function yarnLengthReport(doc: ChartPattern): YarnLengthReport {
  const technique = doc.technique;
  const use = gaugeInUse(doc);
  const usage = yarnUsage(doc.chart, doc.yarns.length);
  const lows = new Set<LengthAssumption>();
  const rows: YarnLengthRow[] = doc.yarns.map((y, i) => {
    const stitches = usage.stitches[i] ?? 0;
    const floats = usage.floatStitches[i] ?? 0;
    const estimate = use
      ? estimateYarnLength({ stitches, floatStitches: floats }, use.gauge, { technique, gaugeAssumed: use.assumed, lowConfidence: lengthLowConfidence(use, y.weight) })
      : undefined;
    for (const a of estimate?.assumptions ?? []) lows.add(a);
    return { id: y.id, letter: yarnLetter(i), hex: y.color.hex, colorName: colorName(y.color), stitches, estimate };
  });
  const estimated = rows.every((r) => r.estimate !== undefined);
  const total = estimated && rows.length > 0 ? rows.reduce((t, r) => ({ meters: t.meters + r.estimate!.meters, low: t.low + r.estimate!.low, high: t.high + r.estimate!.high }), { meters: 0, low: 0, high: 0 }) : undefined;
  const order: LengthAssumption[] = ["assumed_gauge", "low_confidence_weight", "loop_factor", "float_slack", "waste_margin"];
  return { technique, rows, gaugeAssumed: use?.assumed ?? false, total, assumptions: order.filter((a) => lows.has(a)), noGauge: use === null };
}

// ------------------------------------------------------------------ rótulos (F3-27)

const fmt = (n: number) => n.toLocaleString("es-CL");
const pct = (factor: number) => `${Math.round(factor * 100)} %`;

/** "≈ 105 m (entre 85 y 125 m), estimación": toda cifra lleva el rótulo (F3-27). */
export function lengthLabel(e: { meters: number; low: number; high: number }): string {
  return `≈ ${fmt(e.meters)} m (entre ${fmt(e.low)} y ${fmt(e.high)} m), estimación`;
}

/** Texto de cada supuesto. Los números salen de las constantes de `yarn-catalog`, no se repiten aquí. */
export function assumptionText(a: LengthAssumption): string {
  const A = YARN_LENGTH_ASSUMPTIONS;
  switch (a) {
    case "assumed_gauge":
      return `Muestra supuesta: no ingresaste la tuya, se usó la de referencia del grosor de la lana principal (${yarnLetter(0)}).`;
    case "low_confidence_weight":
      return "Confianza baja: la muestra de referencia de este grosor (categoría 7) es poco precisa.";
    case "loop_factor":
      return `Cada punto jersey gasta unas ${String(A.knitLoopFactor).replace(".", ",")} veces su ancho de hebra (supuesto para lana en punto liso; en colorwork la tensión puede cambiar).`; // validar con tejedora
    case "float_slack":
      return `Las hebras que cruzan por el revés se dejan ${pct(A.floatSlack - 1)} más largas que el ancho que cruzan (supuesto).`;
    case "waste_margin":
      return `Se suma un margen de ${pct(A.wasteMargin)} por colas, uniones y muestra (supuesto).`;
  }
}

/** Aclaración fija de lo que no incluye (F3-27, T1-6). */
export const LENGTH_SCOPE_NOTE = "Solo del gráfico: no incluye elástico, montaje ni remate.";

/** Sugerencia de tejer la muestra con las lanas del diseño ("A y B", "A, B y C"). */
export function swatchAdviceText(letters: readonly string[], technique: "knit" | "crochet" = "knit"): string {
  const list = letters.length <= 1 ? letters.join("") : `${letters.slice(0, -1).join(", ")} y ${letters[letters.length - 1]}`;
  const who = letters.length === 1 ? `la lana ${list}` : `las lanas ${list}`;
  if (technique === "crochet") return `Teje una muestra con ${who} del diseño para comprobar la tensión.`;
  return `Teje una muestra con ${who} del diseño para comprobar la tensión y el metraje, y compra con margen.`;
}
