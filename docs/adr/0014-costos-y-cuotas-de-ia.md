# ADR 0014: Costos, cuotas y estados de los trabajos de IA

- Estado: **propuesto** (2026-11-16, agente `arquitecto`). Lo aprueba la usuaria en T0 de la fase 5 (decisiones 3 y 6). Las cifras de la sección 6 se recalculan en T3, con datos verificados, y en T23, con un trabajo real.
- Fecha: 2026-11-16
- Paquetes: `supabase/migrations`, `supabase/functions`, `packages/ai-router`, `apps/web`
- Relacionado: [ADR 0012](0012-pipeline-imagen-a-patron.md), [ADR 0013](0013-subidas-y-storage.md), [docs/agentes-runtime.md](../agentes-runtime.md), [docs/seguridad.md](../seguridad.md) (T15 B-2: cupo de patrones), `packages/ai-router/src/router.config.ts`


> **Verificación de precios y modelos (2026-11-16, orquestador, skill `claude-api`, tabla de modelos del 2026-11-03):** Haiku 5.5 (`claude-haiku-5-5`) USD 0,10 / 0,50 por millón de tokens (prompts de hasta 100 K; 0,50 / 2,50 por encima), Sonnet 5.5 (`claude-sonnet-5-5`) 2 / 10, Opus 5.5 (`claude-opus-5-5`) 4 / 20, Fable 5.2 (`claude-fable-5-2`) 8 / 40. Coinciden con `PRICE_PER_MTOK`, así que las estimaciones de este documento quedan confirmadas. Los cuatro aceptan imágenes y salidas estructuradas (`output_config.format`). Opus 5.5 y Sonnet 5.5 rechazan `tool_choice` forzado (`any`/`tool`): la salida JSON va por salidas estructuradas, no forzando una herramienta. T3 sigue confirmando la regla de tokens de imagen y la caché antes de escribir código.

## Contexto

- Hosting sin costo (Workers Free y Supabase Free). La API de Anthropic es el único gasto inevitable, y la usuaria pide verlo con cifras y con un tope.
- `ai_jobs` tiene un estado grueso (`queued | running | succeeded | failed | cancelled`) y una sola fila de modelo, tokens y costo: no alcanza para registrar varios intentos con modelos distintos.
- `rate_events` es una bitácora de solo inserción, que ni `service_role` edita ni borra; la purga diaria la vacía a los 30 días. `begin_operation` cobra el intento y toma el candado `operation_locks`, pero hoy solo conoce `upload` y `export`.
- `selectModel` lanza un error con `budgetUsed >= 1` y baja al modelo base desde el 80 %. Pero nadie calcula `budgetUsed`, y el tope no es atómico entre invocaciones simultáneas.
- Los patrones que crea `service_role` también cuentan para el tope de 500 por usuaria (T15 B-2).
- **Precios.** `PRICE_PER_MTOK` del repositorio dice "fuente secundaria, noviembre de 2026; confirmar". En esta planificación **no hubo acceso al skill `claude-api`**, así que esas cifras no se pudieron verificar. Se usan aquí solo para dimensionar, y T3 las confirma.

## Opciones

### Corte por presupuesto

- **K1. Reserva antes de cada llamada, en Postgres.** Una función atómica reserva el costo máximo posible de la llamada (entrada estimada + `maxOutputTokens`) y la rechaza si pasaría el tope del día, del mes o del trabajo. Al volver la respuesta se liquida con el costo real.
- **K2. Sumar después.** Se registra el costo al terminar y se corta cuando la suma pasa el tope. Con llamadas en paralelo, el tope se puede pasar por el costo de varias llamadas.
- **K3. Solo el tope del proveedor** (créditos prepagados o límite de gasto en la consola). No distingue usuarias, no avisa antes y corta de golpe, a mitad de un trabajo.

### Cuota por usuaria

- **Q1. Trabajos por ventana**, contados en `rate_events`: N por día y M cada 30 días, y uno a la vez.
- **Q2. Créditos en dólares por usuaria.** Es más justo con las rutas caras, pero las tejedoras no razonan en dólares y exige una interfaz de saldo.

## Decisión

**K1 + K3 como segunda capa, y Q1.**

### 1. Máquina de estados de `ai_jobs`

`status` se conserva (grueso, para la interfaz) y se agrega `stage` (fino, para el orquestador). Las transiciones las impone una función de Postgres. No hay otra forma de cambiar `stage`: `service_role` no tiene UPDATE directo sobre esas columnas.

```
received ─► triaged ─┬─► [plana] chart_computed ─► palette_done ─┐
   │           │     └─► [3D]   decomposed ─► plan_computed ──────┤
   │           │                                                  ▼
   │           │                                               validated ─► drafted ─► delivered
   │           └─► rejected        (moderación o "unsuitable")
   └─(cualquiera no terminal)─► cancelled | expired | failed
```

| `stage` | `status` | Terminal | Notas |
|---|---|---|---|
| `received` | `queued` | No | Creado por `iniciar`, con la cuota y el cupo de patrones ya comprobados |
| `triaged`, `chart_computed`, `palette_done`, `decomposed`, `plan_computed`, `validated`, `drafted` | `running` | No | Un paso por llamada a `avanzar` (ADR 0012, P1) |
| `delivered` | `succeeded` | Sí | `outcome`: `ok` o `warnings` (borrador `savable` sin `valid`); `result_pattern_id` puesto |
| `rejected` | `failed` | Sí | `outcome`: `moderation` o `unsuitable`. **No** devuelve el cupo (sí se gastó IA) |
| `failed` | `failed` | Sí | `outcome`: `invalid`, `budget`, `provider`, `job_cap` o `internal`. Devuelve el cupo, salvo con `internal` repetido (registro para revisar) |
| `cancelled` | `cancelled` | Sí | Lo pide la usuaria; se detiene en el borde de la etapa siguiente. Devuelve el cupo si no hubo llamadas al modelo |
| `expired` | `failed` | Sí | `ia-mantenimiento`: 15 min sin avance. Liquida las reservas pendientes y devuelve el cupo |

- **`ai_job_advance(p_job, p_owner, p_from, p_to, p_patch jsonb)`**: `security definer`, `search_path` vacío, solo para `service_role`. Compara y fija: si `stage ≠ p_from`, da error `PT409`. Comprueba que `(p_from, p_to)` esté en la tabla de transiciones, que es la misma tabla pura de `ai-router` (`JOB_TRANSITIONS`), con una prueba que compara las dos. Escribe `status`, `outcome`, `warnings`, `params_hash` y `finished_at`.
- **Arriendo**: `ai_job_lease(p_job, p_owner)` fija `lease_until = now() + 120 s` si el trabajo no es terminal y no hay otro arriendo vigente. Es un paso a la vez por trabajo, aunque la usuaria abra dos pestañas.
- **Un trabajo a la vez por usuaria**: `operation_locks` con la operación nueva `ai_job` (amplía el CHECK) y un plazo de 20 min, renovado en cada `avanzar`.
- **Idempotencia**: cada llamada al modelo tiene su fila en `ai_job_calls`, creada **antes** de la llamada con la reserva. Si la invocación muere a mitad, la fila queda `pending`. Al vencer, se **liquida por lo reservado**: es la cota conservadora, porque el proveedor pudo cobrar igual.

### 2. Columnas y tablas (migración de T9; boceto para `backend-supabase`)

```sql
-- ai_jobs: columnas nuevas (todas escritas solo por funciones security definer)
alter table public.ai_jobs
  add column stage text not null default 'received' check (stage in ('received','triaged','chart_computed','palette_done','decomposed','plan_computed','validated','drafted','delivered','rejected','failed','cancelled','expired')),
  add column outcome text check (outcome in ('ok','warnings','moderation','unsuitable','invalid','budget','provider','job_cap','internal','cancelled','expired')),
  add column params jsonb not null default '{}'::jsonb,  -- ruta, ancho, colores, muestra, alto objetivo; sin datos personales; ≤ 4 KB (CHECK)
  add column warnings jsonb not null default '[]'::jsonb, -- solo códigos, ≤ 2 KB
  add column prompt_version text check (char_length(prompt_version) <= 100),
  add column escalations smallint not null default 0 check (escalations between 0 and 2),
  add column cost_reserved_usd numeric(10,6) not null default 0,
  add column job_cap_usd numeric(10,6) not null,
  add column lease_until timestamptz,
  add column cancel_requested boolean not null default false,
  add column last_progress_at timestamptz not null default now();
-- model, input_tokens, output_tokens y cost_usd quedan como totales del trabajo (suma de ai_job_calls).

create table public.ai_job_calls (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_jobs (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  stage text not null, agent text not null, attempt smallint not null check (attempt between 1 and 3),
  model text not null,
  input_tokens integer, output_tokens integer, cache_read_tokens integer, cache_write_tokens integer,
  cost_reserved_usd numeric(10,6) not null, cost_usd numeric(10,6),
  latency_ms integer,
  outcome text not null default 'pending' check (outcome in ('pending','ok','schema_invalid','proposal_invalid','engine_rejected','refusal','max_tokens','timeout','provider_error','budget_denied')),
  request_id text check (char_length(request_id) <= 100),   -- id de la petición del proveedor, para soporte
  created_at timestamptz not null default now(), settled_at timestamptz
);
-- RLS: la dueña lee las suyas (transparencia: qué modelo y cuánto costó); nadie del cliente escribe.

create table public.ai_settings (                          -- una sola fila (id = 1)
  id smallint primary key check (id = 1),
  enabled boolean not null default false,                  -- interruptor general
  daily_cap_usd numeric(10,4) not null,
  monthly_cap_usd numeric(10,4) not null,
  job_cap_chart_usd numeric(10,4) not null,
  job_cap_amigurumi_usd numeric(10,4) not null,
  saving_threshold numeric(3,2) not null default 0.80,
  jobs_per_day smallint not null, jobs_per_30d smallint not null,
  allowlist_only boolean not null default true             -- decisión 11: solo cuentas de la lista hasta T4
);
create table public.ai_allowlist (owner_id uuid primary key references auth.users (id) on delete cascade);
create table public.ai_spend_days (                        -- día UTC, como la facturación del proveedor (a confirmar en T3)
  day date primary key, reserved_usd numeric(12,6) not null default 0, spent_usd numeric(12,6) not null default 0
);
create table public.ai_alerts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('monthly_50','monthly_80','monthly_100','daily_100','job_cap_hit','provider_down','purge_stale','job_internal')),
  period text not null,                                    -- '2026-11' o '2026-11-16'; único por (kind, period)
  created_at timestamptz not null default now(), sent_at timestamptz,
  unique (kind, period)
);
-- rate_events.kind: se agregan 'ai_job' y 'ai_job_refund'. operation_locks.operation: se agrega 'ai_job'.
-- Ninguna de las tablas nuevas tiene permisos para anon ni authenticated, salvo SELECT propio en ai_job_calls.
```

### 3. Cuota por usuaria (Q1)

- **`ai_job_begin(p_owner, p_kind, p_params)`**: `security definer`, solo para `service_role`. La llama `iniciar`. En una sola transacción, con `pg_advisory_xact_lock` por usuaria:
  1. `ai_settings.enabled` y, si `allowlist_only`, que la usuaria esté en `ai_allowlist`; si no, `P0001` con el detalle `disabled`;
  2. el candado `ai_job` (`55P03` si ya hay uno);
  3. la cuota: `count(ai_job) − count(ai_job_refund)` en 24 h < `jobs_per_day` y en 30 días < `jobs_per_30d`; si no, `54000` con el detalle `ai_daily` o `ai_monthly`;
  4. el **cupo de patrones** (T15 B-2): que la usuaria tenga lugar para uno más bajo el tope de 500; si no, `54000` con el detalle `patterns`. La interfaz lo muestra **antes** de subir la foto;
  5. el presupuesto del día por encima de `saving_threshold` se informa (no se rechaza);
  6. inserta el `rate_events` `ai_job` y la fila de `ai_jobs` con `job_cap_usd` de la ruta.
- **Devolver el cupo** es insertar `ai_job_refund`, nunca borrar: `rate_events` sigue siendo de solo inserción.
- **Valores recomendados** (decisión 3): 3 trabajos por día y 20 cada 30 días, de cualquiera de las dos rutas, con uno a la vez. La ventana de 30 días coincide con la purga de `rate_events`.

### 4. Presupuesto con corte automático (K1)

- **`ai_reserve(p_job, p_call, p_usd)`**, atómica (bloquea la fila del día y la del trabajo). Devuelve `ok` o el motivo:
  - `disabled`: `ai_settings.enabled = false`;
  - `job_cap`: `ai_jobs.cost_usd + cost_reserved_usd + p_usd > job_cap_usd`;
  - `daily_cap`: `reserved + spent` del día UTC `+ p_usd > daily_cap_usd`;
  - `monthly_cap`: la suma del mes UTC `+ p_usd > monthly_cap_usd`.
  Si todo pasa, suma la reserva al día y al trabajo. **Sin `ok` no se llama al modelo.** La etapa termina con `budget_denied`; el trabajo pasa a `failed`/`budget` (o a `delivered` con el respaldo determinista, si la etapa era la del redactor) y se devuelve el cupo.
- **`ai_settle(p_call, p_usd)`**: mueve la reserva a gastado con el costo real (`estimateCostUSD` con la `usage` de la respuesta, incluidos los tokens de caché, que T3 confirma si se cobran distinto). Si al liquidar se cruza el 50, 80 o 100 % del mes, o el 100 % del día, inserta en `ai_alerts` (único por periodo).
- **La reserva de cada llamada** = `entrada estimada × precio de entrada + maxOutputTokens × precio de salida`. La entrada estimada es la del sistema y el esquema (medida una vez por versión de prompt), más la imagen (por la regla de tokens que confirme T3) y la entrada JSON.
- **Modo ahorro**: con `budgetUsed ≥ saving_threshold` del día (la función devuelve la fracción), `selectModel` usa el modelo base y no sube por complejidad. Sí sube por reintento, dentro del tope del trabajo (regla actual del router).
- **Tope por trabajo** (`job_cap_*`): es la cota que impide que un texto incrustado o una cadena de reintentos gaste de más. Se fija con la cifra del peor caso de la sección 6, redondeada hacia arriba.
- **Corte externo (K3)**: crédito prepagado en la consola de Anthropic **sin recarga automática**, por el monto mensual decidido. Además, si T3 confirma que existe, un límite de gasto del espacio de trabajo. Se usa una clave de API exclusiva de producción en un espacio de trabajo propio. Si el corte interno fallara, el proveedor corta igual.
- **Interruptor**: `ai_settings.enabled` (lo cambia la usuaria con SQL desde el panel) y el secreto `LOOPITA_AI_ENABLED` de las funciones. La interfaz oculta "Crear desde una imagen" si cualquiera de los dos está apagado (lo lee una Server Action).

### 5. Registro y alertas

- **Por llamada** (`ai_job_calls`): agente, etapa, intento, modelo, tokens de entrada, salida y caché, costo reservado y real, latencia, resultado e id de la petición del proveedor. **Nunca** el prompt, la respuesta, la imagen ni texto de la usuaria. La salida validada vive en el trabajo (`params`, `warnings`) y en el patrón.
- **Por trabajo** (`ai_jobs`): totales, modelo de la etapa generativa, versión de prompt, `escalations`, `outcome` y advertencias.
- **Retención**: `ai_job_calls` y `ai_jobs` 180 días; después, `purge_expired_data` los borra. `ai_spend_days` y `ai_alerts` no tienen datos personales y se conservan. Se declara en `/privacidad` (T4).
- **Alertas sin servicios pagos**: `ia-mantenimiento` (pg_cron, cada 15 min) envía las filas de `ai_alerts` con `sent_at` nulo por correo a la dirección de la responsable (secreto `LOOPITA_ALERT_EMAIL`), con Resend, que ya es el SMTP del plan (100 correos al día). También detecta:
  - `provider_down`: 3 llamadas seguidas con `provider_error` o `timeout` en 10 min;
  - `job_cap_hit`;
  - `purge_stale`: más de 2 h sin purga (ADR 0013, R5-10);
  - `job_internal`.
  El correo lleva solo el tipo, el periodo y las cifras agregadas, sin identificadores de usuarias.
- **Panel**: la vista `ai_spend_summary` (solo `service_role`) con el gasto por día y por mes, los trabajos por resultado y el costo por ruta, que se consulta desde el editor SQL. No hay pantalla de administración en la v1.

### 6. Estimación de costo por trabajo

**Supuestos, a medir en T23.**

- **Precios**: `PRICE_PER_MTOK` del repositorio, en USD por millón de tokens de entrada y de salida: Haiku 5.5 a 0,1 y 0,5; Sonnet 5.5 a 2 y 10; Opus 5.5 a 4 y 20. Son de **fuente secundaria y no verificados** (R5-3).
- **Tokens de imagen**: alrededor de ancho × alto / 750, la regla publicada para las familias anteriores; T3 la confirma para la 5.5. Eso da unos 600 tokens para 768 × 576 y unos 1.050 para 1024 × 768.
- **Tokens de texto**: estimados por agente (sistema, esquema y entrada).

| Llamada | Modelo | Entrada | Salida | Costo (USD) |
|---|---|---|---|---|
| Triaje (imagen de 768 px) | Haiku | 1.600 | 200 | 0,00026 |
| Asistente de paleta (gráfico reducido) | Haiku | 2.600 | 600 | 0,00056 |
| Asistente de paleta, escalado | Sonnet | 2.600 | 600 | 0,0112 |
| Redactor, ruta plana | Haiku | 2.300 | 800 | 0,00063 |
| Redactor, ruta plana, escalado | Sonnet | 2.300 | 800 | 0,0126 |
| Descomponedor (imagen de 1024 px) | Sonnet | 3.200 | 1.500 | 0,0214 |
| Descomponedor, escalado o con complejidad ≥ 4 | Opus | 3.200 | 1.500 | 0,0428 |
| Redactor, ruta 3D (armado) | Sonnet | 3.000 | 1.200 | 0,018 |

| Trabajo | Composición | Costo (USD) |
|---|---|---|
| Ruta plana, típico | Triaje + paleta + redactor, todo en Haiku | **≈ 0,0015** |
| Ruta plana, peor caso | Triaje ×2, paleta Haiku + Sonnet ×2, redactor Haiku + Sonnet ×2 | **≈ 0,049** → tope por trabajo **0,05** |
| Ruta 3D, típico | Triaje + descomponedor Sonnet + redactor Sonnet | **≈ 0,040** |
| Ruta 3D, complejidad ≥ 4 | Triaje + descomponedor Opus + redactor Sonnet | **≈ 0,061** |
| Ruta 3D, peor caso | Triaje ×2, descomponedor Sonnet + Opus ×2, redactor Sonnet ×2 | **≈ 0,144** → tope por trabajo **0,15** |

**Lo que cubre un presupuesto mensual de USD 10** (recomendado, decisión 3):

- unos 6.600 trabajos típicos de la ruta plana;
- unos 250 típicos de la ruta 3D;
- unos 69 de la ruta 3D en el peor caso.

Una beta de 20 tejedoras con 3 trabajos por semana cada una (unos 260 al mes, 30 % de la ruta 3D) gastaría unos USD 3,4 al mes con estas cifras: 182 × 0,0015 + 78 × 0,040. **Tope diario recomendado: USD 0,50.** Así un día de abuso no consume más del 5 % del mes, y el peor caso de una sola usuaria es de 3 × 0,15 = USD 0,45 al día.

**Sensibilidad.** Si los precios reales de Haiku fueran 10 veces los del repositorio, el trabajo típico de la ruta plana costaría unos USD 0,015, y los 10 dólares seguirían cubriendo unos 660. Por eso los topes por trabajo **no se escriben a mano**: `ai-router` exporta `jobCapUSD(route)`, que calcula el peor caso desde `PRICE_PER_MTOK` y `AGENT_POLICIES`, y la migración de T9 escribe el valor que da T3. Cambiar un precio es una enmienda de este ADR.

**Caché de prompts: apagada en la v1.** Con el volumen previsto (unos pocos trabajos por hora como mucho), casi ninguna llamada encontraría la caché vigente, y escribir en caché cuesta más que una entrada normal según la documentación de las familias anteriores (a confirmar en T3). Se registran `cache_read_tokens` y `cache_write_tokens` desde el inicio, y se reevalúa con datos (más de 30 trabajos por hora). Tampoco se usa el procesamiento por lotes: el flujo es interactivo.

### 7. Interfaz de cuota y presupuesto

- Antes de subir la foto se ve "Te quedan N de 3 hoy y M de 20 este mes", y el cupo de patrones (T15 B-2).
- Si el presupuesto del día se agotó: "La creación con IA está en pausa hasta mañana (00:00 UTC, las HH:MM en Chile)". No se sube nada.
- Durante el trabajo, la etapa actual en texto ("Revisando la imagen", "Armando el gráfico", "Redactando las notas"), con un anuncio `aria-live` educado y "Cancelar".
- Al terminar, en "Detalles", el modelo y el costo aproximado del trabajo, desde las filas propias de `ai_job_calls`.

## Consecuencias

- **Positivas**: el corte es exacto y atómico; el peor caso por trabajo está acotado; hay un segundo corte en el proveedor; las cifras quedan registradas por llamada para ajustar los topes con datos; no hay costos de hosting.
- **Negativas**: más tablas y funciones `security definer` que revisar; la reserva por el máximo de salida corta un poco antes que el gasto real (conservador); el día y el mes son UTC, no la hora de Chile.

## Riesgos abiertos

| ID | Riesgo | Mitigación |
|---|---|---|
| R5-12 | Los precios reales difieren de los del repositorio | T3 con el skill `claude-api`; topes calculados por `jobCapUSD`; crédito prepagado como corte externo |
| R5-13 | La cuenta del proveedor no permite crédito prepagado sin recarga ni límite de gasto | Queda solo el corte interno, que es atómico; la usuaria revisa la consola en T23 |
| R5-14 | Una invocación muere después de que el proveedor cobró y antes de liquidar | Liquidación por lo reservado al vencer (cota superior); `request_id` para conciliar con la consola |
| R5-15 | El 100 % del día corta a una usuaria a mitad de un trabajo | La reserva se hace por llamada; el redactor tiene respaldo determinista; las otras etapas devuelven el cupo con un mensaje claro |
