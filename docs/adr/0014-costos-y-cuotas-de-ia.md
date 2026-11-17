# ADR 0014: Costos, cuotas y estados de los trabajos de IA

- Estado: **aceptado (2026-11-16, T0)**. Propuesto el 2026-11-16 por `arquitecto`; la usuaria lo aprobó con las [decisiones de la fase 5](../roadmap.md#decisiones-de-la-fase-5-aprobadas-el-2026-11-16), con un presupuesto de USD 5 al mes (decisión 3, opción a, no la recomendada). Ver [Enmiendas por las decisiones de la usuaria](#enmiendas-por-las-decisiones-de-la-usuaria-2026-11-16). Las cifras de la sección 6 se ajustan en T3, con los tokens de pensamiento medidos, y en T23, con trabajos reales.
- Fecha: 2026-11-16
- Paquetes: `supabase/migrations`, `supabase/functions`, `packages/ai-router`, `apps/web`
- Relacionado: [ADR 0012](0012-pipeline-imagen-a-patron.md), [ADR 0013](0013-subidas-y-storage.md), [docs/agentes-runtime.md](../agentes-runtime.md), [docs/seguridad.md](../seguridad.md) (T15 B-2: cupo de patrones), `packages/ai-router/src/router.config.ts`


> **Verificación de precios y modelos (2026-11-16, orquestador, skill `claude-api`, tabla de modelos del 2026-11-03):** Haiku 5.5 (`claude-haiku-5-5`) USD 0,10 / 0,50 por millón de tokens (prompts de hasta 100 K; 0,50 / 2,50 por encima), Sonnet 5.5 (`claude-sonnet-5-5`) 2 / 10, Opus 5.5 (`claude-opus-5-5`) 4 / 20, Fable 5.2 (`claude-fable-5-2`) 8 / 40. Coinciden con `PRICE_PER_MTOK`, así que las estimaciones de este documento quedan confirmadas. Los cuatro aceptan imágenes y salidas estructuradas (`output_config.format`). Opus 5.5 y Sonnet 5.5 rechazan `tool_choice` forzado (`any`/`tool`): la salida JSON va por salidas estructuradas, no forzando una herramienta. T3 sigue confirmando la regla de tokens de imagen y la caché antes de escribir código.

> **Quién paga la IA.** El costo de la API de Anthropic lo paga la dueña de la plataforma (la usuaria de este proyecto), en su propia cuenta de Anthropic y con crédito prepagado. No es un costo por tejedora: las usuarias de LoopitaLab no pagan nada ni necesitan una cuenta de Anthropic. La cuota por usuaria de la sección 3 (2 trabajos por día y 10 cada 30 días) solo reparte ese presupuesto entre ellas para que nadie lo agote; no es un cobro. La usuaria lo preguntó al aprobar este ADR (decisión 3).

## Contexto

- Hosting sin costo (Workers Free y Supabase Free). La API de Anthropic es el único gasto inevitable, y la usuaria pide verlo con cifras y con un tope.
- `ai_jobs` tiene un estado grueso (`queued | running | succeeded | failed | cancelled`) y una sola fila de modelo, tokens y costo: no alcanza para registrar varios intentos con modelos distintos.
- `rate_events` es una bitácora de solo inserción, que ni `service_role` edita ni borra; la purga diaria la vacía a los 30 días. `begin_operation` cobra el intento y toma el candado `operation_locks`, pero hoy solo conoce `upload` y `export`.
- `selectModel` lanza un error con `budgetUsed >= 1` y baja al modelo base desde el 80 %. Pero nadie calcula `budgetUsed`, y el tope no es atómico entre invocaciones simultáneas.
- Los patrones que crea `service_role` también cuentan para el tope de 500 por usuaria (T15 B-2).
- **Precios.** Los de `PRICE_PER_MTOK` del repositorio quedaron verificados por el orquestador el 2026-11-16 con el skill `claude-api` (nota del inicio). T3 actualiza el comentario de fuente en `router.config.ts`.

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
- **Valores aprobados** (decisión 3, opción a; enmienda T0-3): **2 trabajos por día y 10 cada 30 días**, de cualquiera de las dos rutas, con uno a la vez. La ventana de 30 días coincide con la purga de `rate_events`.

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
- **Corte externo (K3)**: crédito prepagado en la consola de Anthropic de la usuaria, **sin recarga automática**, por el monto mensual decidido (USD 5). El crédito no se renueva cada mes: la usuaria lo recarga a mano, así que el corte mensual lo hace el interno (`monthly_cap_usd`), y el crédito es la red de seguridad. Además, si T3 confirma que existe, un límite de gasto del espacio de trabajo. Se usa una clave de API exclusiva de producción en un espacio de trabajo propio. Si el corte interno fallara, el proveedor corta igual.
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

- **Precios**: `PRICE_PER_MTOK` del repositorio, en USD por millón de tokens de entrada y de salida, verificados el 2026-11-16 (nota del inicio): Haiku 5.5 a 0,1 y 0,5; Sonnet 5.5 a 2 y 10; Opus 5.5 a 4 y 20. Ninguna llamada pasa de 100 K tokens de prompt, así que el recargo de Haiku no aplica.
- **Tokens de imagen**: alrededor de ancho × alto / 750, la regla publicada para las familias anteriores; T3 la confirma para la 5.5. Eso da unos 600 tokens para 768 × 576 y unos 1.050 para 1024 × 768.
- **Tokens de texto**: estimados por agente (sistema, esquema y entrada).
- **Pensamiento: no está incluido en la tabla.** No se puede apagar en Haiku 5.5 ni en Opus 5.5, y se cobra como salida; en Sonnet 5.5 se usa `between_tools`. T3 lo mide por etapa (enmienda T0-6).

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

**Lo que cubre el presupuesto aprobado** (decisión 3, opción a: USD 5 al mes y USD 0,25 al día; enmienda T0-3):

| Trabajo | Costo (USD) | En el mes (USD 5) | En el día (USD 0,25) |
|---|---|---|---|
| Ruta plana, típico | 0,0015 | unos 3.300 | unos 160 |
| Ruta plana, peor caso (tope 0,05) | 0,049 | unos 100 | 5 |
| Ruta 3D, típico | 0,040 | unos 125 | 6 |
| Ruta 3D, complejidad ≥ 4 | 0,061 | unos 80 | 4 |
| Ruta 3D, peor caso (tope 0,15) | 0,144 | unos 34 | **1** |

- **Alertas** (sección 5): 50 % del mes = USD 2,50; 80 % = USD 4,00; 100 % = USD 5,00, con corte. 100 % del día = USD 0,25, con corte. El modo ahorro empieza al 80 % del día (USD 0,20).
- **El tope diario deja pasar un trabajo 3D en el peor caso**: en un día sin gasto previo, 0,15 ≤ 0,25, con USD 0,10 de margen, porque la reserva de un trabajo nunca pasa de su `job_cap_usd`. También caben un plano y un 3D en el peor caso el mismo día (0,20). **No caben dos 3D en el peor caso** (0,30): el segundo se corta con `failed`/`budget` y se devuelve el cupo (R5-15). Dos 3D típicos (0,08) o uno típico y uno en el peor caso (0,184) sí caben.
- **Por usuaria**: el peor día, con la cuota de 2, cuesta USD 0,30 y se corta en el tope diario (USD 0,25, el 5 % del mes). El peor mes, con la cuota de 10, cuesta 10 × 0,15 = USD 1,50, el 30 % del presupuesto. Con solo la cuenta de la usuaria en la lista permitida (decisión 11), el tope mensual no se alcanza con el uso del producto.
- **Con más cuentas**: una beta de 20 tejedoras con la cuota completa (200 trabajos al mes, 30 % de la ruta 3D) gastaría unos USD 2,61 al mes (140 × 0,0015 + 60 × 0,040), dentro del mes. Pero **el tope diario es global**: con 0,25 al día caben unos 6 trabajos 3D típicos o 1 en el peor caso entre todas, y la IA quedaría "en pausa hasta mañana" con frecuencia (riesgo R5-21 del roadmap). Abrir la lista exige revisar el tope diario con las cifras de T23.

**Sensibilidad y pensamiento.** Los topes por trabajo **no se escriben a mano**: `ai-router` exporta `jobCapUSD(route)`, que calcula el peor caso desde `PRICE_PER_MTOK` y `AGENT_POLICIES` (con `maxOutputTokens`, que **incluye el pensamiento**), y la migración de T9 escribe los valores aprobados. El peor caso estimado deja muy poco margen dentro de cada tope: USD 0,001 en la ruta plana (0,049 de 0,05) y USD 0,006 en la 3D (0,144 de 0,15). Por ejemplo, 1.000 tokens de pensamiento por llamada suman 0,0005 por llamada de Haiku y 0,02 por llamada de Opus: con dos intentos de Opus, el peor caso 3D pasaría a unos 0,18. Si T3 mide que el pensamiento no cabe, **se ajustan los `maxOutputTokens` o el esfuerzo por agente** (por ejemplo, el del descomponedor en Opus), no los topes. Subir un tope por trabajo lo decide la usuaria; el de la ruta 3D no puede pasar de USD 0,25 sin dejar de caber en el tope diario. Una llamada cortada por `max_tokens` cuenta como fallo de forma (ADR 0012, sección 3). CA5-B9 lo verifica.

**La prueba real (T23 y T23-3D) va aparte.** Tiene su propio tope total de USD 2, en un script de evaluación con un libro de presupuesto en memoria (roadmap, R5-22): con 2 trabajos al día, el conjunto de evaluación no cabría en la cuota del producto. Ese gasto no pasa por `ai_reserve`, pero sí por el crédito prepagado. Para que el corte externo no quede por debajo del interno, conviene cargar esos USD 2 aparte.

**Caché de prompts: apagada en la v1.** Con el volumen previsto (unos pocos trabajos por hora como mucho), casi ninguna llamada encontraría la caché vigente, y escribir en caché cuesta más que una entrada normal según la documentación de las familias anteriores (a confirmar en T3). Se registran `cache_read_tokens` y `cache_write_tokens` desde el inicio, y se reevalúa con datos (más de 30 trabajos por hora). Tampoco se usa el procesamiento por lotes: el flujo es interactivo.

### 7. Interfaz de cuota y presupuesto

- Antes de subir la foto se ve "Te quedan N de 2 hoy y M de 10 este mes", y el cupo de patrones (T15 B-2).
- Si el presupuesto del día se agotó: "La creación con IA está en pausa hasta mañana (00:00 UTC, las HH:MM en Chile)". No se sube nada.
- Durante el trabajo, la etapa actual en texto ("Revisando la imagen", "Armando el gráfico", "Redactando las notas"), con un anuncio `aria-live` educado y "Cancelar".
- Al terminar, en "Detalles", el modelo y el costo aproximado del trabajo, desde las filas propias de `ai_job_calls`.

## Consecuencias

- **Positivas**: el corte es exacto y atómico; el peor caso por trabajo está acotado; hay un segundo corte en el proveedor; las cifras quedan registradas por llamada para ajustar los topes con datos; no hay costos de hosting.
- **Negativas**: más tablas y funciones `security definer` que revisar; la reserva por el máximo de salida corta un poco antes que el gasto real (conservador); el día y el mes son UTC, no la hora de Chile.

## Riesgos abiertos

| ID | Riesgo | Mitigación |
|---|---|---|
| R5-12 | Los precios quedaron verificados (2026-11-16), pero los tokens de pensamiento, que no se pueden apagar en Haiku 5.5 ni en Opus 5.5, pueden llevar el peor caso por encima de los topes por trabajo | T3 mide el pensamiento por etapa; `jobCapUSD` con `maxOutputTokens` que lo incluye; se ajustan los `maxOutputTokens` o el esfuerzo, no los topes (CA5-B9); crédito prepagado como corte externo || R5-13 | La cuenta del proveedor no permite crédito prepagado sin recarga ni límite de gasto | Queda solo el corte interno, que es atómico; la usuaria revisa la consola en T23 |
| R5-14 | Una invocación muere después de que el proveedor cobró y antes de liquidar | Liquidación por lo reservado al vencer (cota superior); `request_id` para conciliar con la consola |
| R5-15 | El 100 % del día corta a una usuaria a mitad de un trabajo | La reserva se hace por llamada; el redactor tiene respaldo determinista; las otras etapas devuelven el cupo con un mensaje claro |

## Enmiendas por las decisiones de la usuaria (2026-11-16)

La usuaria aprobó el ADR el 2026-11-16 ([decisiones de la fase 5](../roadmap.md#decisiones-de-la-fase-5-aprobadas-el-2026-11-16)). Cambios al texto propuesto:

- **T0-3 (decisión 3, opción a, no la recomendada).** USD 5 al mes y USD 0,25 al día; 2 trabajos por día y 10 cada 30 días por usuaria, uno a la vez; tope por trabajo de USD 0,05 (plana) y USD 0,15 (3D); crédito prepagado sin recarga automática. Cambian la sección 3 (valores de la cuota), la 4 (corte externo), la 6 (lo que cubre el presupuesto, alertas y la comprobación del peor caso 3D) y la 7 (texto de la cuota). Se agrega la nota "Quién paga la IA" al inicio. Valores iniciales de `ai_settings` para T9: `daily_cap_usd = 0.25`, `monthly_cap_usd = 5`, `job_cap_chart_usd = 0.05`, `job_cap_amigurumi_usd = 0.15`, `jobs_per_day = 2`, `jobs_per_30d = 10`, `saving_threshold = 0.80` y `allowlist_only = true`. Criterio nuevo CA5-B9 en el roadmap.
- **T0-6 (decisión 6, opción a).** Los precios quedan verificados (nota del inicio); se quitan los rótulos de "no verificado" del contexto y de la sección 6. Se agrega a la sección 6 que el pensamiento no está en la tabla, porque no se puede apagar en Haiku 5.5 ni en Opus 5.5, y se cobra como salida. `jobCapUSD` lo incluye por `maxOutputTokens`, y T3 lo mide. Fable 5.2 queda fuera.
- **T0-7 (decisión 7, opción a).** La prueba real se hace en dos corridas (T23 y T23-3D), con un tope total de USD 2 fuera del libro del producto (sección 6).
- **T0-11 (decisión 11, opción a).** `allowlist_only = true`, con solo la cuenta de la usuaria. El tope diario es global, así que abrir la lista obliga a revisarlo.
- **Decisión 2 (dos hitos).** La migración de T9 crea todos los estados de `stage`, también los de la ruta 3D, en el hito 1; el hito 2 no necesita otra migración. Hasta el hito 2, `ai_job_begin` (o `iniciar`) rechaza `p_kind = 'amigurumi'` con el detalle `route_disabled`, **antes** de insertar el `rate_events`, así que no cobra cupo.
