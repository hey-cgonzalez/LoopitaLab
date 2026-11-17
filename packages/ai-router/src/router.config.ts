/**
 * Router de modelos del producto.
 *
 * Elige automáticamente el modelo de Claude para cada agente según
 * la complejidad, los reintentos, el plan del usuario y el presupuesto.
 *
 * IDs de modelo, precios, pensamiento y esfuerzo verificados el 2026-11-16
 * (fase 5, T3) con el skill `claude-api` (`shared/models.md`,
 * `shared/model-migration.md`) y con la documentación oficial:
 * https://platform.claude.com/docs/en/about-claude/pricing
 * https://platform.claude.com/docs/en/build-with-claude/effort
 * https://platform.claude.com/docs/en/build-with-claude/thinking
 * Detalle y tabla en el README del paquete.
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
 * Precios en USD por millón de tokens (entrada / salida), sin caché ni lotes.
 *
 * Fuente: https://platform.claude.com/docs/en/about-claude/pricing (tabla
 * "Model pricing"), consultada el 2026-11-16 (T3), y skill `claude-api`,
 * `shared/models.md` (misma fecha). Coinciden con la verificación del
 * orquestador del 2026-11-16.
 *
 * - Los tokens de pensamiento se cobran como salida y cuentan dentro de
 *   `max_tokens` (https://platform.claude.com/docs/en/build-with-claude/thinking).
 * - Haiku 5.5 cobra 0,50 / 2,50 si el prompt pasa de 100.000 tokens (se
 *   cuentan también los de caché). Ninguna llamada del pipeline se acerca a
 *   ese tamaño, así que aquí va solo la tarifa de hasta 100 K.
 * - Las imágenes se cobran como entrada: ⌈ancho / 28⌉ × ⌈alto / 28⌉ tokens
 *   (https://platform.claude.com/docs/en/build-with-claude/vision).
 * - `inference_geo: "us"` multiplica todo por 1,1; el pipeline no lo usa.
 */
export const PRICE_PER_MTOK: Record<ModelId, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

/**
 * Precios de caché en USD por millón de tokens, de la misma fuente y fecha que
 * `PRICE_PER_MTOK`: escritura con duración de 5 minutos (1,25 × la entrada),
 * escritura de 1 hora (2 ×) y lectura (0,1 × en Haiku 5.5; 0,05 × en Sonnet
 * 5.5 y Opus 5.5). La caché está apagada en la v1 (ADR 0014, sección 6); la
 * constante sirve para liquidar `cache_read_tokens` y `cache_write_tokens` si
 * algún día aparecen en `usage`. Mínimo cacheable: 512 tokens en los tres.
 */
export const CACHE_PRICE_PER_MTOK: Record<ModelId, { write5m: number; write1h: number; read: number }> = {
  "claude-haiku-5-5": { write5m: 0.125, write1h: 0.2, read: 0.01 },
  "claude-sonnet-5-5": { write5m: 2.5, write1h: 4, read: 0.1 },
  "claude-opus-5-5": { write5m: 5, write1h: 8, read: 0.2 },
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
  /**
   * Límite de tokens de salida (`max_tokens`): pensamiento + respuesta. Es un
   * tope duro, así que la reserva del ADR 0014 lo usa como peor caso.
   */
  maxOutputTokens: number;
}

/**
 * `maxOutputTokens` propuestos en T3 (2026-11-16) para que los peores casos
 * queden bajo los topes por trabajo del ADR 0014 (USD 0,05 y 0,15), con el
 * esfuerzo y el modo de pensamiento de la tabla del README:
 * - classifier (triaje): 600, sin pensamiento en Haiku y Sonnet, esfuerzo `low`;
 * - paletteAssistant: 800, sin pensamiento, esfuerzo `low`;
 * - shapeDecomposer: 2000, pensamiento adaptativo, esfuerzo `low` (en Opus 5.5
 *   el pensamiento no se apaga);
 * - writer: 2000 para el redactor 3D (Sonnet, sin pensamiento, un intento). El
 *   redactor de la ruta plana (Haiku) lo separa T8, con 1500.
 * Los valores se confirman con el conjunto de evaluación (R5-22) y con T23.
 */
export const AGENT_POLICIES: Record<AgentName, AgentPolicy> = {
  moderator:        { base: "claude-haiku-5-5",  ceiling: "claude-sonnet-5-5", freeCeiling: "claude-sonnet-5-5", maxOutputTokens: 300 },
  classifier:       { base: "claude-haiku-5-5",  ceiling: "claude-sonnet-5-5", freeCeiling: "claude-haiku-5-5",  maxOutputTokens: 600 },
  paletteAssistant: { base: "claude-haiku-5-5",  ceiling: "claude-sonnet-5-5", freeCeiling: "claude-haiku-5-5",  escalateAtComplexity: 4, maxOutputTokens: 800 },
  shapeDecomposer:  { base: "claude-sonnet-5-5", ceiling: "claude-opus-5-5",   freeCeiling: "claude-sonnet-5-5", escalateAtComplexity: 4, maxOutputTokens: 2000 },
  writer:           { base: "claude-sonnet-5-5", ceiling: "claude-sonnet-5-5", freeCeiling: "claude-haiku-5-5",  maxOutputTokens: 2000 },
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

/**
 * Devuelve el peldaño en `index`, acotado al rango válido de la escalera.
 * Con `noUncheckedIndexedAccess` el acceso directo es `ModelId | undefined`;
 * acotar el índice garantiza un valor, así que el `undefined` es inalcanzable.
 */
export function ladderAt(index: number): ModelId {
  const last = MODEL_LADDER.length - 1;
  const clamped = Math.min(Math.max(Math.trunc(index), 0), last);
  const model = MODEL_LADDER[clamped];
  if (model === undefined) {
    throw new Error(`Escalera de modelos vacía o mal configurada (índice ${index})`);
  }
  return model;
}

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
    model: ladderAt(capped),
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
