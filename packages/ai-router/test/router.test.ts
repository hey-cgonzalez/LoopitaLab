import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGENT_POLICIES,
  BUDGET_SAVING_THRESHOLD,
  MAX_ESCALATIONS_PER_JOB,
  MODEL_LADDER,
  estimateCostUSD,
  ladderAt,
  selectModel,
  type AgentName,
  type ModelId,
  type Plan,
  type RoutingContext,
} from "../src/index.ts";

const HAIKU = "claude-haiku-5-5";
const SONNET = "claude-sonnet-5-5";
const OPUS = "claude-opus-5-5";

/** Complejidad baja (1-2), media (3) y alta (4-5), según la escala del clasificador. */
const LOW = 1;
const MEDIUM = 3;
const HIGH = 5;

const ctx = (over: Partial<RoutingContext> & Pick<RoutingContext, "agent">): RoutingContext => ({
  plan: "pro",
  failedAttempts: 0,
  budgetUsed: 0,
  ...over,
});

const rank = (m: ModelId) => MODEL_LADDER.indexOf(m);

describe("escalera de modelos", () => {
  it("va de menor a mayor capacidad: haiku, sonnet, opus", () => {
    assert.deepEqual([...MODEL_LADDER], [HAIKU, SONNET, OPUS]);
  });

  it("ladderAt devuelve el peldaño exacto dentro del rango", () => {
    assert.equal(ladderAt(0), HAIKU);
    assert.equal(ladderAt(1), SONNET);
    assert.equal(ladderAt(2), OPUS);
  });

  it("ladderAt acota índices fuera de rango al primero o al último peldaño", () => {
    assert.equal(ladderAt(-1), HAIKU);
    assert.equal(ladderAt(3), OPUS);
    assert.equal(ladderAt(99), OPUS);
  });

  it("ladderAt trunca índices no enteros", () => {
    assert.equal(ladderAt(1.9), SONNET);
  });

  it("toda política tiene base <= techo y techo gratuito <= techo", () => {
    for (const [name, p] of Object.entries(AGENT_POLICIES)) {
      assert.ok(rank(p.base) <= rank(p.ceiling), `${name}: base por encima del techo`);
      assert.ok(rank(p.freeCeiling) <= rank(p.ceiling), `${name}: techo gratuito por encima del techo`);
    }
  });
});

describe("selectModel por complejidad", () => {
  it("agentes sin umbral de complejidad usan el modelo base sin importar la complejidad", () => {
    for (const c of [LOW, MEDIUM, HIGH]) {
      assert.equal(selectModel(ctx({ agent: "classifier", complexity: c })).model, HAIKU);
    }
  });

  it("paletteAssistant (base haiku, umbral 4): baja y media quedan en haiku, alta sube a sonnet", () => {
    assert.equal(selectModel(ctx({ agent: "paletteAssistant", complexity: LOW })).model, HAIKU);
    assert.equal(selectModel(ctx({ agent: "paletteAssistant", complexity: MEDIUM })).model, HAIKU);
    assert.equal(selectModel(ctx({ agent: "paletteAssistant", complexity: HIGH })).model, SONNET);
  });

  it("shapeDecomposer (base sonnet, umbral 4): baja y media quedan en sonnet, alta sube a opus", () => {
    assert.equal(selectModel(ctx({ agent: "shapeDecomposer", complexity: LOW })).model, SONNET);
    assert.equal(selectModel(ctx({ agent: "shapeDecomposer", complexity: MEDIUM })).model, SONNET);
    assert.equal(selectModel(ctx({ agent: "shapeDecomposer", complexity: HIGH })).model, OPUS);
  });

  it("el umbral se cumple exactamente en 4", () => {
    assert.equal(selectModel(ctx({ agent: "editorAssistant", complexity: 3 })).model, HAIKU);
    assert.equal(selectModel(ctx({ agent: "editorAssistant", complexity: 4 })).model, SONNET);
  });

  it("sin complejidad informada no hay escalamiento por complejidad", () => {
    assert.equal(selectModel(ctx({ agent: "shapeDecomposer" })).model, SONNET);
  });

  it("writer (base y techo sonnet) nunca sube a opus por complejidad", () => {
    assert.equal(selectModel(ctx({ agent: "writer", complexity: HIGH })).model, SONNET);
  });
});

describe("selectModel por reintentos", () => {
  it("cada reintento fallido escala un peldaño", () => {
    assert.equal(selectModel(ctx({ agent: "shapeDecomposer", failedAttempts: 1 })).model, OPUS);
    assert.equal(selectModel(ctx({ agent: "classifier", failedAttempts: 1 })).model, SONNET);
  });

  it("nunca pasa del techo del agente aunque haya más reintentos", () => {
    const r = selectModel(ctx({ agent: "classifier", failedAttempts: 2 }));
    assert.equal(r.model, SONNET);
    assert.equal(r.exhausted, true);
    assert.match(r.reason, /limitado a claude-sonnet-5-5/);
  });

  it("los reintentos se topan en MAX_ESCALATIONS_PER_JOB aunque sean más", () => {
    assert.equal(MAX_ESCALATIONS_PER_JOB, 2);
    const many = selectModel(ctx({ agent: "shapeDecomposer", failedAttempts: 9 }));
    const two = selectModel(ctx({ agent: "shapeDecomposer", failedAttempts: 2 }));
    assert.equal(many.model, OPUS);
    assert.equal(many.model, two.model);
    assert.equal(many.exhausted, true);
  });

  it("nunca devuelve un modelo por encima del último peldaño", () => {
    for (let f = 0; f <= 10; f++) {
      for (const agent of Object.keys(AGENT_POLICIES) as AgentName[]) {
        const r = selectModel(ctx({ agent, failedAttempts: f, complexity: HIGH }));
        assert.ok(rank(r.model) <= rank(OPUS));
        assert.ok(MODEL_LADDER.includes(r.model));
      }
    }
  });

  it("exhausted es falso mientras queda un escalón por subir", () => {
    const r = selectModel(ctx({ agent: "classifier", failedAttempts: 1 }));
    assert.equal(r.exhausted, false);
  });

  it("exhausted es verdadero cuando el reintento pide subir por encima del techo", () => {
    const r = selectModel(ctx({ agent: "shapeDecomposer", complexity: HIGH, failedAttempts: 1 }));
    assert.equal(r.model, OPUS);
    assert.equal(r.exhausted, true);
  });

  it("tras un fallo en el techo sin otra subida pendiente, exhausted sigue en falso (comportamiento actual)", () => {
    // Se pinta el comportamiento actual de `exhausted`: solo se activa cuando un
    // reintento exigiría subir por encima del techo. Ver informe de T3d.
    const r = selectModel(ctx({ agent: "shapeDecomposer", failedAttempts: 1 }));
    assert.equal(r.model, OPUS);
    assert.equal(r.exhausted, false);
  });

  it("la complejidad alta y un reintento suman y se topan en el techo", () => {
    const r = selectModel(ctx({ agent: "paletteAssistant", complexity: HIGH, failedAttempts: 1 }));
    assert.equal(r.model, SONNET);
    assert.equal(r.exhausted, true);
  });
});

describe("selectModel por plan", () => {
  it("plan gratuito limita el techo al freeCeiling de la política", () => {
    const r = selectModel(ctx({ agent: "writer", plan: "free" }));
    assert.equal(r.model, HAIKU);
    assert.match(r.reason, /limitado a claude-haiku-5-5/);
  });

  it("plan gratuito no permite escalar por encima del techo gratuito", () => {
    const r = selectModel(ctx({ agent: "writer", plan: "free", failedAttempts: 1 }));
    assert.equal(r.model, HAIKU);
    assert.equal(r.exhausted, true);
  });

  it("plan gratuito en shapeDecomposer sí permite sonnet y no opus", () => {
    const r = selectModel(ctx({ agent: "shapeDecomposer", plan: "free", complexity: HIGH }));
    assert.equal(r.model, SONNET);
    assert.equal(selectModel(ctx({ agent: "shapeDecomposer", plan: "free", failedAttempts: 1 })).model, SONNET);
  });

  it("plan pro usa el techo completo de la política", () => {
    assert.equal(selectModel(ctx({ agent: "writer", plan: "pro" })).model, SONNET);
    assert.equal(selectModel(ctx({ agent: "shapeDecomposer", plan: "pro", complexity: HIGH })).model, OPUS);
  });

  it("para cualquier plan el modelo está dentro del techo que le corresponde", () => {
    const plans: Plan[] = ["free", "pro"];
    for (const plan of plans) {
      for (const agent of Object.keys(AGENT_POLICIES) as AgentName[]) {
        const p = AGENT_POLICIES[agent];
        const cap = plan === "free" && rank(p.freeCeiling) < rank(p.ceiling) ? p.freeCeiling : p.ceiling;
        for (const f of [0, 1, 2, 3]) {
          const r = selectModel(ctx({ agent, plan, failedAttempts: f, complexity: HIGH }));
          assert.ok(rank(r.model) <= rank(cap), `${agent}/${plan}/f=${f} excede el techo`);
        }
      }
    }
  });
});

describe("selectModel por presupuesto", () => {
  it("lanza error cuando el presupuesto diario está agotado", () => {
    assert.throws(() => selectModel(ctx({ agent: "classifier", budgetUsed: 1 })), /Presupuesto diario de IA agotado/);
    assert.throws(() => selectModel(ctx({ agent: "classifier", budgetUsed: 1.2 })), /Presupuesto diario de IA agotado/);
  });

  it("no lanza error justo por debajo del agotamiento", () => {
    assert.doesNotThrow(() => selectModel(ctx({ agent: "classifier", budgetUsed: 0.999 })));
  });

  it("sobre el umbral de ahorro, sin reintentos, vuelve al modelo base aunque la complejidad sea alta", () => {
    const r = selectModel(ctx({ agent: "shapeDecomposer", complexity: HIGH, budgetUsed: BUDGET_SAVING_THRESHOLD }));
    assert.equal(r.model, SONNET);
    assert.match(r.reason, /modo ahorro de presupuesto/);
  });

  it("bajo el umbral de ahorro la complejidad alta sí escala", () => {
    const r = selectModel(ctx({ agent: "shapeDecomposer", complexity: HIGH, budgetUsed: BUDGET_SAVING_THRESHOLD - 0.01 }));
    assert.equal(r.model, OPUS);
    assert.doesNotMatch(r.reason, /modo ahorro/);
  });

  it("en modo ahorro un reintento sí escala (el ahorro solo aplica sin fallos)", () => {
    const r = selectModel(ctx({ agent: "shapeDecomposer", complexity: HIGH, budgetUsed: 0.9, failedAttempts: 1 }));
    assert.equal(r.model, OPUS);
  });

  it("en modo ahorro nunca baja de la base del agente", () => {
    for (const agent of Object.keys(AGENT_POLICIES) as AgentName[]) {
      const r = selectModel(ctx({ agent, budgetUsed: 0.95, complexity: HIGH }));
      assert.equal(r.model, AGENT_POLICIES[agent].base, `${agent} en modo ahorro`);
    }
  });
});

describe("selectModel: parámetros y motivo", () => {
  it("devuelve maxOutputTokens de la política del agente", () => {
    for (const agent of Object.keys(AGENT_POLICIES) as AgentName[]) {
      assert.equal(selectModel(ctx({ agent })).maxOutputTokens, AGENT_POLICIES[agent].maxOutputTokens);
    }
  });

  it("el motivo siempre incluye el modelo base", () => {
    const r = selectModel(ctx({ agent: "paletteAssistant" }));
    assert.match(r.reason, /^base claude-haiku-5-5/);
  });

  it("en pro, el modelo nunca queda por debajo de la base cuando no hay ahorro", () => {
    for (const agent of Object.keys(AGENT_POLICIES) as AgentName[]) {
      for (const c of [LOW, MEDIUM, HIGH]) {
        for (const f of [0, 1, 2]) {
          const r = selectModel(ctx({ agent, complexity: c, failedAttempts: f }));
          assert.ok(rank(r.model) >= rank(AGENT_POLICIES[agent].base));
        }
      }
    }
  });
});

describe("estimateCostUSD", () => {
  it("usa precios por millón de tokens de entrada y salida", () => {
    assert.equal(estimateCostUSD(HAIKU, 1_000_000, 0), 0.1);
    assert.equal(estimateCostUSD(SONNET, 0, 1_000_000), 10);
    assert.equal(estimateCostUSD(OPUS, 1_000_000, 1_000_000), 24);
  });

  it("sin tokens el costo es cero", () => {
    assert.equal(estimateCostUSD(OPUS, 0, 0), 0);
  });

  it("es proporcional al número de tokens", () => {
    const one = estimateCostUSD(SONNET, 1234, 567);
    const two = estimateCostUSD(SONNET, 2468, 1134);
    assert.ok(Math.abs(two - 2 * one) < 1e-12);
  });
});
