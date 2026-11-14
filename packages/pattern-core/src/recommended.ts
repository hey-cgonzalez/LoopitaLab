/**
 * Límites recomendados de un patrón escrito (ADR 0011, sección 3b; decisión 5 de la fase 4).
 *
 * No son reglas del tejido sino de la fluidez de la herramienta: dentro de ellos, la vista
 * previa responde a tiempo (regla de oro 7). **No pasan por `validatePattern`**: un patrón
 * que los supera sigue siendo `valid` y la usuaria decide si sigue. Los topes duros, que sí
 * son errores, están en `LIMITS`.
 *
 * Valores confirmados por T1 (enmienda C-18, F4-70 a F4-76). Estimaciones propias de orden
 * de magnitud. // validar con tejedora
 */
import { LIMITS } from "./limits.ts";
import type { Part, WrittenPattern } from "./types.ts";
import { countRound } from "./written.ts";

export const RECOMMENDED_WRITTEN_LIMITS = Object.freeze({
  /** Partes distintas del patrón (las copias no cuentan como partes). */
  parts: 20,
  /** Veces que se teje una parte (`Part.copies`). */
  copiesPerPart: 10,
  /** Vueltas concretas de una parte (los rangos cuentan cada vuelta). */
  roundsPerPart: 100,
  /** Puntos que deja una vuelta (`count.produced`). */
  stitchesPerRound: 200,
  /** Puntos de toda la escena: Σ (Σ produced de la parte) × copies. */
  sceneStitches: 40_000,
} as const);

export type RecommendedLimit = keyof typeof RECOMMENDED_WRITTEN_LIMITS;

/** Orden estable en que se informan los límites. */
const LIMIT_ORDER: readonly RecommendedLimit[] = Object.freeze(["parts", "copiesPerPart", "roundsPerPart", "stitchesPerRound", "sceneStitches"]);

export interface LimitUsage {
  limit: RecommendedLimit;
  /** Valor actual; en los límites por parte o por vuelta, el máximo encontrado. */
  value: number;
  recommended: number;
  /**
   * Dónde se supera, para mostrarlo junto a la parte o la vuelta. Vacío si no se supera.
   * - `parts`: las partes que pasan del límite (de la 21 en adelante, en orden del documento);
   * - `copiesPerPart` y `roundsPerPart`: las partes que lo superan;
   * - `stitchesPerRound`: cada vuelta concreta que lo supera (`round` es su número visible);
   * - `sceneStitches`: todas las partes que aportan puntos a la escena.
   */
  over: Array<{ partId: string; round?: number }>;
}

/** `copies` como lo entiende el modelo: omitido (o inválido, que ya es error) = 1. */
const copiesOf = (part: Part): number =>
  typeof part.copies === "number" && Number.isInteger(part.copies) && part.copies >= 1 ? part.copies : 1;

/**
 * Uso de cada límite recomendado, en el orden de `RECOMMENDED_WRITTEN_LIMITS`. Los conteos
 * salen del motor (`countRound`, con las reglas de `concreteRounds`); tiempo lineal en las vueltas (sin
 * expandir sus puntos). Nunca lanza: con un documento que no es `savable`, las partes o
 * vueltas que no se pueden leer no suman.
 */
export function recommendedLimitUsage(pattern: WrittenPattern): LimitUsage[] {
  try {
    return usageOf(pattern);
  } catch {
    // Solo con objetos armados a mano (getters o Proxy que lanzan); JSON.parse no los produce.
    return LIMIT_ORDER.map((limit) => ({ limit, value: 0, recommended: RECOMMENDED_WRITTEN_LIMITS[limit], over: [] }));
  }
}

function usageOf(pattern: WrittenPattern): LimitUsage[] {
  const R = RECOMMENDED_WRITTEN_LIMITS;
  const parts: unknown[] = isObject(pattern) && Array.isArray(pattern.parts) ? pattern.parts : [];
  const usage: Record<RecommendedLimit, LimitUsage> = {
    parts: { limit: "parts", value: parts.length, recommended: R.parts, over: [] },
    copiesPerPart: { limit: "copiesPerPart", value: 0, recommended: R.copiesPerPart, over: [] },
    roundsPerPart: { limit: "roundsPerPart", value: 0, recommended: R.roundsPerPart, over: [] },
    stitchesPerRound: { limit: "stitchesPerRound", value: 0, recommended: R.stitchesPerRound, over: [] },
    sceneStitches: { limit: "sceneStitches", value: 0, recommended: R.sceneStitches, over: [] },
  };
  const contributors: Array<{ partId: string }> = [];

  parts.forEach((raw, index) => {
    if (!isObject(raw)) return;
    const part = raw as unknown as Part;
    const partId = typeof part.id === "string" ? part.id : "";
    if (index >= R.parts) usage.parts.over.push({ partId });

    const copies = copiesOf(part);
    usage.copiesPerPart.value = Math.max(usage.copiesPerPart.value, copies);
    if (copies > R.copiesPerPart) usage.copiesPerPart.over.push({ partId });

    const rounds = safeConcreteRounds(part);
    usage.roundsPerPart.value = Math.max(usage.roundsPerPart.value, rounds.length);
    if (rounds.length > R.roundsPerPart) usage.roundsPerPart.over.push({ partId });

    let total = 0;
    for (const r of rounds) {
      const produced = r.produced;
      total += produced;
      usage.stitchesPerRound.value = Math.max(usage.stitchesPerRound.value, produced);
      if (produced > R.stitchesPerRound) usage.stitchesPerRound.over.push({ partId, round: r.number });
    }
    // Con la V1 contada (F4-76). Las copias comparten conteo: se multiplica, no se recorre.
    usage.sceneStitches.value += total * copies;
    if (total > 0) contributors.push({ partId });
  });

  if (usage.sceneStitches.value > R.sceneStitches) usage.sceneStitches.over = contributors;

  return LIMIT_ORDER.map((k) => usage[k]);
}

/** Solo los límites superados (`value > recommended`): los que llevan advertencia. */
export function recommendedLimitNotices(pattern: WrittenPattern): LimitUsage[] {
  return recommendedLimitUsage(pattern).filter((u) => u.value > u.recommended);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Número y conteo producido de cada vuelta concreta, con las mismas reglas que
 * `concreteRounds` (omite números que no son enteros seguros y nunca despliega más de
 * `LIMITS.maxRounds` vueltas). El conteo producido no depende de la lana, así que cada
 * vuelta del documento se cuenta una sola vez aunque sea un rango ("V11–30"). Una parte que
 * no se puede contar (un documento dañado; nunca uno `savable`) no aporta vueltas.
 */
function safeConcreteRounds(part: Part): Array<{ number: number; produced: number }> {
  const out: Array<{ number: number; produced: number }> = [];
  try {
    if (!Array.isArray(part.rounds)) return out;
    for (const round of part.rounds) {
      if (!isObject(round) || !Array.isArray(round.items)) continue;
      const first = round.number;
      const last = round.through ?? first;
      if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) continue;
      if (first > last || out.length >= LIMITS.maxRounds) continue;
      const produced = countRound(round, "").produced;
      const safe = Number.isFinite(produced) ? produced : 0;
      for (let n = first; n <= last && out.length < LIMITS.maxRounds; n++) out.push({ number: n, produced: safe });
    }
  } catch {
    return [];
  }
  return out;
}
