import { recommendedLimitUsage, type LimitUsage, type RecommendedLimit, type WrittenPattern } from "@loopitalab/pattern-core";

/*
 * Límites recomendados en la interfaz (ADR 0011, sección 3b; decisión 5 de la fase 4: solo advierten). Todo sale de
 * `recommendedLimitUsage` del motor: la interfaz no cuenta puntos, vueltas ni partes; solo compara lo que el motor
 * informa con lo que el motor recomienda.
 */

/** Desde qué fracción del valor recomendado el medidor avisa con texto ("Cerca del límite recomendado"). */
export const LIMIT_NEAR_RATIO = 0.8;

export type LimitTone = "ok" | "near" | "over";

export interface LimitGauge {
  limit: RecommendedLimit;
  value: number;
  recommended: number;
  tone: LimitTone;
  /** 0 a 1 para la barra (se corta en 1). */
  fill: number;
  over: LimitUsage["over"];
}

export function toneOf(value: number, recommended: number): LimitTone {
  if (value > recommended) return "over";
  if (value >= recommended * LIMIT_NEAR_RATIO) return "near";
  return "ok";
}

export function gaugeOf(u: LimitUsage): LimitGauge {
  return { limit: u.limit, value: u.value, recommended: u.recommended, tone: toneOf(u.value, u.recommended), fill: u.recommended > 0 ? Math.min(1, u.value / u.recommended) : 0, over: u.over };
}

export interface LimitSummary {
  byLimit: Record<RecommendedLimit, LimitGauge>;
  /** Vueltas concretas que superan los puntos por vuelta, por parte (número visible). */
  roundsOver: Map<string, Set<number>>;
  /** Partes que superan las vueltas recomendadas o las veces recomendadas. */
  partsOverRounds: Set<string>;
  partsOverCopies: Set<string>;
}

/** Resumen del uso de los límites recomendados de un documento (todo del motor). */
export function limitSummary(pattern: WrittenPattern): LimitSummary {
  const usage = recommendedLimitUsage(pattern);
  const byLimit = Object.fromEntries(usage.map((u) => [u.limit, gaugeOf(u)])) as Record<RecommendedLimit, LimitGauge>;
  const roundsOver = new Map<string, Set<number>>();
  for (const o of byLimit.stitchesPerRound.over) {
    if (o.round === undefined) continue;
    const set = roundsOver.get(o.partId) ?? new Set<number>();
    set.add(o.round);
    roundsOver.set(o.partId, set);
  }
  return {
    byLimit,
    roundsOver,
    partsOverRounds: new Set(byLimit.roundsPerPart.over.map((o) => o.partId)),
    partsOverCopies: new Set(byLimit.copiesPerPart.over.map((o) => o.partId)),
  };
}

/** Caché por referencia del documento: el medidor, la lista de partes y el editor leen el mismo resumen. */
export function limitSummaryCache(): (p: WrittenPattern) => LimitSummary {
  let last: WrittenPattern | null = null;
  let value: LimitSummary | null = null;
  return (p) => {
    if (p !== last || !value) {
      last = p;
      value = limitSummary(p);
    }
    return value;
  };
}

/**
 * ¿Qué límite recomendado supera una acción puntual (agregar una parte, fijar la cantidad) y todavía no se aceptó en
 * esta sesión? Cuenta un límite si después de la acción está sobre lo recomendado y la acción lo hace crecer. Los
 * límites aceptados ("Seguir igual") no se vuelven a preguntar en la sesión (estado del estudio, nunca del documento).
 */
export function crossedLimit(before: WrittenPattern, after: WrittenPattern, accepted: ReadonlySet<RecommendedLimit>): LimitUsage | null {
  if (before === after) return null;
  const prev = new Map(recommendedLimitUsage(before).map((u) => [u.limit, u.value]));
  for (const u of recommendedLimitUsage(after)) {
    if (accepted.has(u.limit)) continue;
    if (u.value > u.recommended && u.value > (prev.get(u.limit) ?? 0)) return u;
  }
  return null;
}
