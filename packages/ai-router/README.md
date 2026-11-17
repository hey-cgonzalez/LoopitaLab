# @loopitalab/ai-router

Router de modelos de Claude para los agentes de IA del producto. Decide, por cada llamada, qué modelo usar según el agente, la complejidad estimada, los reintentos fallidos, el plan del usuario y el presupuesto diario. Sin dependencias. Ver [`docs/agentes-runtime.md`](../../docs/agentes-runtime.md).

## Qué hace

| Archivo | Contenido |
|---|---|
| `src/router.config.ts` | Escalera de modelos, políticas por agente, `selectModel`, `ladderAt`, precios (`PRICE_PER_MTOK`, `CACHE_PRICE_PER_MTOK`) y `estimateCostUSD` |
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

## Datos verificados de la API (T3, 2026-11-16)

Verificados el 2026-11-16 con el skill `claude-api` (versión 2.1.325: `shared/models.md`, `shared/model-migration.md`, `shared/prompt-caching.md`, `shared/cost-optimization.md`, `typescript/claude-api/README.md` y `tool-use.md`) y con las páginas oficiales enlazadas, leídas ese mismo día. No se llamó a la API.

### Precios (USD por millón de tokens)

| Modelo | Entrada | Salida | Escritura de caché 5 min | Escritura de caché 1 h | Lectura de caché |
|---|---|---|---|---|---|
| `claude-haiku-5-5` (prompt ≤ 100 K) | 0,10 | 0,50 | 0,125 | 0,20 | 0,01 |
| `claude-haiku-5-5` (prompt > 100 K) | 0,50 | 2,50 | 0,625 | 1,00 | 0,05 |
| `claude-sonnet-5-5` | 2 | 10 | 2,50 | 4 | 0,10 |
| `claude-opus-5-5` | 4 | 20 | 5 | 8 | 0,20 |

Fuente: [Pricing](https://platform.claude.com/docs/en/about-claude/pricing). Fable 5.2 (8 / 40) existe, pero está fuera de la escalera (decisión 6). Los tokens de pensamiento se cobran como salida, aunque su texto no se devuelva, y cuentan dentro de `max_tokens` ([Thinking](https://platform.claude.com/docs/en/build-with-claude/thinking)). La respuesta los separa en `usage.output_tokens_details.thinking_tokens` (skill, `shared/cost-optimization.md`).

### Imágenes

- Costo: `⌈ancho / 28⌉ × ⌈alto / 28⌉` tokens de entrada ([Vision](https://platform.claude.com/docs/en/build-with-claude/vision), sección "Resolution and token cost").
- Los tres modelos 5.5 son del nivel de alta resolución ("Claude 4.7 and later"): lado largo de hasta 2.576 px y hasta 4.784 tokens. Una imagen mayor se reduce en el servidor, sin error. Límites duros: 8.000 × 8.000 px y 10 MB en base64 por imagen.
- El raster de trabajo (≤ 1024 px) nunca se reduce: 1024 × 1024 = 1.369 tokens; 1024 × 768 = 1.036; 768 × 768 = 784; 768 × 576 = 588.
- Asistente de paleta: el gráfico reducido, ampliado por un factor entero sin suavizado hasta un lado largo de ≤ 448 px, cuesta ≤ 256 tokens. Por debajo de 200 px la documentación advierte más errores.
- Para que una imagen fuera de tamaño falle en vez de reducirse en silencio existe `transformations: { oversized_image: "error" }` en el bloque de imagen ([Vision coordinates](https://platform.claude.com/docs/en/build-with-claude/vision-coordinates)).

### Salida estructurada (`output_config.format`) y `stop_reason`

Fuente: [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), sección "Invalid outputs".

- `refusal`: HTTP 200. La salida puede no respetar el esquema. Se cobran los tokens generados. Un rechazo previo a cualquier salida solo se cobra en las categorías `bio`, `frontier_llm` y `reasoning_extraction` ([Refusals and fallback](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback#how-refusals-are-billed)).
- `max_tokens`: la salida puede quedar incompleta y no cumplir el esquema. Con pensamiento activo, el corte puede llegar antes de cualquier texto.
- En los dos casos, `runStage` lo trata como fallo de forma, sin leer el contenido (ADR 0012, sección 3).
- La API **rechaza con 400** estos elementos del JSON Schema: `minimum`, `maximum`, `multipleOf`, `minLength`, `maxLength`, `minItems` distinto de 0 o 1, `maxItems`, esquemas recursivos y `additionalProperties` distinto de `false`. `schema.ts` (T8) no puede enviarlos: los rangos y los largos los revisa solo el validador local. Los rangos chicos se pueden expresar como `enum`.
- Topes por petición: 24 parámetros opcionales y 16 con unión (`["string", "null"]` cuenta) entre todos los esquemas estrictos.
- El esquema compilado queda en caché 24 h desde el último uso. La primera petición con un esquema nuevo tarda más.
- La API agrega un prompt de sistema propio, que se cobra como entrada.
- Las mayúsculas de los valores de `enum` no están garantizadas: compararlos sin distinguir mayúsculas.
- La gramática no se aplica al pensamiento.

### Pensamiento y esfuerzo

Fuentes: [Effort](https://platform.claude.com/docs/en/build-with-claude/effort), [Thinking](https://platform.claude.com/docs/en/build-with-claude/thinking) y skill, `shared/model-migration.md` (secciones de Haiku 5.5, Sonnet 5.5 y Opus 5.5).

| Modelo | Pensamiento por defecto | ¿Se puede apagar? | Esfuerzo por defecto |
|---|---|---|---|
| Haiku 5.5 | Adaptativo | **Sí**: `thinking: { type: "disabled" }` con esfuerzo `low`, `medium` o `high` (400 con `xhigh` o `max`) | `medium` |
| Sonnet 5.5 | Adaptativo | `disabled` da 400. El mínimo es `thinking: { type: "between_tools" }`, con esfuerzo ≤ `high`, sin otros campos y solo en Sonnet 5.5 | `high` |
| Opus 5.5 | Adaptativo, siempre | No: `disabled` y `budget_tokens` dan 400 con cualquier esfuerzo. El control es el esfuerzo | `medium` |

- Los niveles son `low`, `medium`, `high`, `xhigh` y `max` en los tres. Indicar el esfuerzo por defecto equivale a omitirlo.
- Corrección al plan: **el pensamiento de Haiku 5.5 sí se puede apagar**. El roadmap y los ADR 0012 y 0014 dicen que no.
- El cliente (T8) traduce un modo `"off"` según el modelo: `disabled` en Haiku y `between_tools` en Sonnet. En Opus no lo envía. Al escalar, nunca reenvía `between_tools` a otro modelo.
- Con el pensamiento apagado, un cambio de esfuerzo por mensaje da 400. El pipeline no lo usa: es una sola petición por etapa.
- `max_tokens` es el único tope duro. El esfuerzo es una señal, no un presupuesto.

### Esfuerzo y `maxOutputTokens` propuestos por agente

| Agente | Modelo base / techo | Pensamiento | Esfuerzo | `maxOutputTokens` | Salida esperada |
|---|---|---|---|---|---|
| Triaje (`classifier`) | Haiku / Sonnet | Apagado (`disabled` / `between_tools`) | `low` | 600 | ≈ 150 tokens |
| Asistente de paleta | Haiku / Sonnet | Apagado | `low` | 800 | ≈ 250 tokens |
| Redactor, ruta plana (lo separa T8) | Haiku / Sonnet | Apagado | `low` | 1.500 | ≤ 3.800 caracteres en el esquema, ≈ 1.200 tokens |
| Descomponedor | Sonnet / Opus | Adaptativo (en Opus no se apaga) | `low` | 2.000 | ≈ 800 de JSON + pensamiento |
| Redactor 3D (`writer` hoy) | Sonnet / Sonnet | Apagado (`between_tools`) | `low` | 2.000 | ≤ 7.400 caracteres en el esquema |

- Con estos valores, el peor caso es de USD 0,0401 en la ruta plana (tope 0,05) y de 0,1446 en la 3D (tope 0,15).
- La 3D solo cabe con dos reglas nuevas: Opus una sola vez por etapa y el redactor 3D con un intento. Ver el ADR 0014, sección 6, enmienda T3-2.
- El pensamiento apagado en Haiku y Sonnet es una propuesta sin medir: no hubo llamadas en T3.
- El conjunto de evaluación (R5-22) compara `disabled` con adaptativo en `low` para el triaje y la paleta. Si gana el adaptativo, Haiku necesita más `maxOutputTokens` (unos 2.000). Eso solo cabe si T8 permite `maxOutputTokens` por modelo, no solo por agente.

### Caché de prompts

- Mínimo cacheable: 512 tokens en los tres modelos. Duración: 5 min por defecto (o 1 h), contada desde el inicio de la petición. Cada lectura la renueva sin costo.
- La caché se aísla por espacio de trabajo. Cambiar el pensamiento o el esfuerzo la invalida.
- Fuentes: [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) y skill, `shared/prompt-caching.md`.
- En la v1 sigue apagada (ADR 0014, sección 6): con pocos trabajos por hora no hay aciertos entre trabajos.
- Ganaría solo en el reintento con el mismo modelo. Pero el peor caso tendría que reservar la escritura a 1,25 ×, que sube el tope.

### Facturación y límites de gasto

- Crédito prepagado: el uso se paga con créditos comprados antes. Sin crédito, la API deja de responder. La recarga automática es opcional y se apaga en "Manage auto-reload". Los créditos vencen al año y no se reembolsan ([How do I pay for my Claude API usage](https://support.claude.com/en/articles/8977456-how-do-i-pay-for-my-claude-api-usage)).
- Límite de gasto **mensual** por espacio de trabajo, en la consola: `platform.claude.com/settings/spend-limits` → "Workspace limits" → "Monthly spend limit", con alertas por correo opcionales ([Workspaces](https://platform.claude.com/docs/en/manage-claude/workspaces#workspace-limits)).
  - No se puede poner en el espacio de trabajo por defecto: hay que crear uno propio para producción.
  - Al alcanzarlo, la API responde 400 `invalid_request_error`, con un mensaje que empieza por "You have reached your specified workspace API usage limits" ([Rate limits](https://platform.claude.com/docs/en/api/rate-limits#setting-your-own-spend-limit)).
  - Configurarlo por la API (`/v1/organizations/spend_limits`) está en acceso anticipado. Desde la consola no.
- **No hay límite diario** en el proveedor: el tope diario es solo el interno (`ai_spend_days`).
- Día y mes en UTC: el tope mensual del nivel se renueva "a las 00:00 UTC del primer día del mes siguiente" (misma página de Rate limits). Los informes de uso y costo usan intervalos UTC ([Usage and Cost Analytics API](https://platform.claude.com/docs/en/manage-claude/usage-cost-analytics-api)).
  - La documentación no dice explícitamente en qué zona horaria se renueva el límite propio del espacio de trabajo: el mensaje de error informa cuándo vuelve el acceso.

### Rechazos y respaldo del lado del servidor

- Haiku 5.5 no tiene respaldo del lado del servidor ni crédito de respaldo: con `fallbacks` el rechazo se mantiene o la petición da 400.
- En Sonnet 5.5, `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) reintenta en Sonnet 5 solo los rechazos `cyber` y `frontier_llm`.
- En Opus 5.5, los destinos permitidos se leen en `allowed_fallback_models` (se esperan Opus 5 y Opus 4.8). Fuentes: skill, `shared/model-migration.md`, y [Refusals and fallback](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback).
- **Propuesta: no usarlo en la v1.**
  - El reintento correría en un modelo fuera de la escalera, con un costo que `ai_reserve` no reservó.
  - Las categorías que reintenta (`cyber`, `frontier_llm`) no corresponden a fotos de tejido.
  - Un `refusal` queda como resultado propio en `ai_job_calls` (`outcome = 'refusal'`).

## Pruebas

```bash
pnpm --filter @loopitalab/ai-router test
```

Las pruebas usan `node:test` y corren directamente con Node 24 (TypeScript nativo).

## Pendiente

- El escalamiento por reintento se hace al primer fallo. CLAUDE.md pide reintentar una vez con el mismo modelo antes de escalar: lo corrige T8.
- `AGENT_POLICIES` no tiene todavía el esfuerzo ni el modo de pensamiento, ni separa el redactor plano del 3D: lo hace T8 con la tabla de arriba.
- Medir el pensamiento real por etapa (no hubo llamadas en T3): conjunto de evaluación (R5-22) y T23.
