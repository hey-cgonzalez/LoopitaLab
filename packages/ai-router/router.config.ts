/**
 * Router de modelos del producto.
 *
 * Elige automáticamente el modelo de Claude para cada agente según
 * la complejidad, los reintentos, el plan del usuario y el presupuesto.
 *
 * IMPORTANTE: los IDs de modelo y los precios deben verificarse en la
 * documentación oficial de Anthropic antes de producción:
 * https://platform.claude.com/docs/en/models/overview
 */

export type ModelId = "claude-haiku-5-5" | "claude-sonnet-5-5" | "claude-opus-5-5";

export type AgentName =
  | "moderator"
  | "classifier"
  | "paletteAssistant"
  | "shapeDecomposer"
  | "writer"
  | "errorExplainer"
  | "editorAssistant";

export type Plan = "free" | "pro";

/** Orden de escalamiento: de menor a mayor capacidad y costo. */
export const MODEL_LADDER: readonly ModelId[] = [
  "claude-haiku-5-5",
  "claude-sonnet-5-5",
  "claude-opus-5-5",
] as const;

/**
 * Precios de referencia en USD por millón de tokens (entrada / salida).
 * Fuente secundaria consultada en noviembre de 2026; confirmar en la
 * página oficial de precios antes de usarlos para cobrar o presupuestar.
 * Haiku tiene un precio mayor sobre 100K tokens de prompt.
 */
export const PRICE_PER_MTOK: Record<ModelId, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

interface AgentPolicy {
  /** Modelo inicial. */
  base: ModelId;
  /** Modelo máximo al que puede escalar. */
  ceiling: ModelId;
  /** Modelo máximo permitido en plan gratuito. */
  freeCeiling: ModelId;
  /** Complejidad (1-5) desde la cual se parte un escalón más arriba. */
  escalateAtComplexity?: number;
  /** Límite de tokens de salida. */
  maxOutputTokens: number;
}

export const AGENT_POLICIES: Record<AgentName, AgentPolicy> = {
  moderator:        { base: "claude-haiku-5-5",  ceiling: "claude-sonnet-5-5", freeCeiling: "claude-sonnet-5-5", maxOutputTokens: 300 },
  classifier:       { base: "claude-haiku-5-5",  ceiling: "claude-sonnet-5-5", freeCeiling: "claude-haiku-5-5",  maxOutputTokens: 500 },
  paletteAssistant: { base: "claude-haiku-5-5",  ceiling: "claude-sonnet-5-5", freeCeiling: "claude-haiku-5-5",  escalateAtComplexity: 4, maxOutputTokens: 800 },
  shapeDecomposer:  { base: "claude-sonnet-5-5", ceiling: "claude-opus-5-5",   freeCeiling: "claude-sonnet-5-5", escalateAtComplexity: 4, maxOutputTokens: 2000 },
  writer:           { base: "claude-sonnet-5-5", ceiling: "claude-sonnet-5-5", freeCeiling: "claude-haiku-5-5",  maxOutputTokens: 3000 },
  errorExplainer:   { base: "claude-haiku-5-5",  ceiling: "claude-sonnet-5-5", freeCeiling: "claude-haiku-5-5",  maxOutputTokens: 600 },
  editorAssistant:  { base: "claude-haiku-5-5",  ceiling: "claude-sonnet-5-5", freeCeiling: "claude-haiku-5-5",  escalateAtComplexity: 4, maxOutputTokens: 1000 },
};

/** Máximo de escalamientos por trabajo antes de entregar con advertencias. */
export const MAX_ESCALATIONS_PER_JOB = 2;

/** Sobre esta fracción del presupuesto diario, se usa el modelo más barato permitido. */
export const BUDGET_SAVING_THRESHOLD = 0.8;

export interface RoutingContext {
  agent: AgentName;
  plan: Plan;
  /** Complejidad estimada por el clasificador (1-5). */
  complexity?: number;
  /** Intentos fallidos previos en este paso (esquema inválido o rechazo del motor). */
  failedAttempts: number;
  /** Fracción del presupuesto diario ya consumida (0-1). */
  budgetUsed: number;
}

export interface RoutingDecision {
  model: ModelId;
  maxOutputTokens: number;
  reason: string;
  /** true si ya no se puede escalar más y debe entregarse con advertencias. */
  exhausted: boolean;
}

const rank = (m: ModelId) => MODEL_LADDER.indexOf(m);

export function selectModel(ctx: RoutingContext): RoutingDecision {
  const policy = AGENT_POLICIES[ctx.agent];
  const ceiling = ctx.plan === "free" ? lower(policy.ceiling, policy.freeCeiling) : policy.ceiling;

  if (ctx.budgetUsed >= 1) {
    throw new Error("Presupuesto diario de IA agotado");
  }

  let level = rank(policy.base);
  const reasons: string[] = [`base ${policy.base}`];

  if (policy.escalateAtComplexity && (ctx.complexity ?? 0) >= policy.escalateAtComplexity) {
    level += 1;
    reasons.push(`complejidad ${ctx.complexity}`);
  }

  const escalations = Math.min(ctx.failedAttempts, MAX_ESCALATIONS_PER_JOB);
  if (escalations > 0) {
    level += escalations;
    reasons.push(`${escalations} intento(s) fallido(s)`);
  }

  if (ctx.budgetUsed >= BUDGET_SAVING_THRESHOLD && ctx.failedAttempts === 0) {
    level = rank(policy.base);
    reasons.push("modo ahorro de presupuesto");
  }

  const capped = Math.min(level, rank(ceiling));
  if (capped < level) reasons.push(`limitado a ${ceiling}`);

  return {
    model: MODEL_LADDER[capped],
    maxOutputTokens: policy.maxOutputTokens,
    reason: reasons.join(", "),
    exhausted: ctx.failedAttempts > MAX_ESCALATIONS_PER_JOB || (ctx.failedAttempts > 0 && capped === rank(ceiling) && level > rank(ceiling)),
  };
}

function lower(a: ModelId, b: ModelId): ModelId {
  return rank(a) <= rank(b) ? a : b;
}

export function estimateCostUSD(model: ModelId, inputTokens: number, outputTokens: number): number {
  const p = PRICE_PER_MTOK[model];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
