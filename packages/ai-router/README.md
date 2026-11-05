# @loopitalab/ai-router

Router de modelos de Claude para los agentes de IA del producto. Decide, por cada llamada, qué modelo usar según el agente, la complejidad estimada, los reintentos fallidos, el plan del usuario y el presupuesto diario. Sin dependencias. Ver [`docs/agentes-runtime.md`](../../docs/agentes-runtime.md).

## Qué hace

| Archivo | Contenido |
|---|---|
| `src/router.config.ts` | Escalera de modelos, políticas por agente, `selectModel`, `ladderAt`, precios y `estimateCostUSD` |
| `src/index.ts` | Punto de entrada del paquete (reexporta `router.config.ts`) |
| `test/router.test.ts` | Pruebas de `selectModel`, `ladderAt` y `estimateCostUSD` |

## Escalera y reglas

- Escalera: `claude-haiku-5-5` → `claude-sonnet-5-5` → `claude-opus-5-5`.
- Cada agente tiene un modelo base, un techo y un techo para el plan gratuito.
- Complejidad (1-5): si el agente define umbral (`escalateAtComplexity`, normalmente 4) y la complejidad llega a ese valor, sube un peldaño.
- Reintentos: cada intento fallido sube un peldaño, con un máximo de `MAX_ESCALATIONS_PER_JOB` (2). Nunca se pasa del techo.
- Presupuesto: a partir del 80 % (`BUDGET_SAVING_THRESHOLD`) y sin reintentos, se usa el modelo base. Al 100 % `selectModel` lanza error.
- `exhausted` indica que el trabajo debe entregarse con advertencias.

## Uso

```ts
import { selectModel } from "@loopitalab/ai-router";

const { model, maxOutputTokens, reason, exhausted } = selectModel({
  agent: "shapeDecomposer",
  plan: "pro",
  complexity: 4,
  failedAttempts: 0,
  budgetUsed: 0.42,
});
```

## Pruebas

```bash
pnpm --filter @loopitalab/ai-router test
```

Las pruebas usan `node:test` y corren directamente con Node 24 (TypeScript nativo).

## Pendiente

- Los precios son de referencia y deben confirmarse en la página oficial de Anthropic antes de usarlos para cobrar.
- El escalamiento por reintento se hace al primer fallo. CLAUDE.md pide reintentar una vez con el mismo modelo antes de escalar; ver la nota de T3d.
