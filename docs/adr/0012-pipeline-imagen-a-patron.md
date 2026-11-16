# ADR 0012: Pipeline imagen → patrón

- Estado: **aceptado (2026-11-16, T0)**. Propuesto el 2026-11-16 por `arquitecto`; la usuaria lo aprobó con las [decisiones de la fase 5](../roadmap.md#decisiones-de-la-fase-5-aprobadas-el-2026-11-16). Ver [Enmiendas por las decisiones de la usuaria](#enmiendas-por-las-decisiones-de-la-usuaria-2026-11-16). La sección 7 (dónde corre cada parte) queda sujeta a la puerta de viabilidad T2.
- Fecha: 2026-11-16
- Paquetes: `packages/ai-router`, `packages/image-chart` (nuevo), `packages/pattern-core`, `packages/yarn-catalog`, `packages/pattern-render`, `supabase/functions` (nuevo), `supabase/migrations`, `apps/web`
- Relacionado: [ADR 0001](0001-modelo-canonico.md) (origen), [ADR 0002](0002-nucleo-sin-dependencias.md), [ADR 0003](0003-colorwork-en-esquema-v1.md), [ADR 0006](0006-guardado-de-disenos.md) (E11: duplicar diseños de IA), [ADR 0010](0010-geometria-3d-amigurumi.md), [ADR 0011](0011-posicion-de-partes-y-editor-escrito.md) (v2, topes T20, `maxRoundItems`), [ADR 0013](0013-subidas-y-storage.md) (subidas), [ADR 0014](0014-costos-y-cuotas-de-ia.md) (costos y cuotas), [docs/agentes-runtime.md](../agentes-runtime.md), [docs/seguridad.md](../seguridad.md), [docs/despliegue-publico.md](../despliegue-publico.md)


> **Verificación de precios y modelos (2026-11-16, orquestador, skill `claude-api`, tabla de modelos del 2026-11-03):** Haiku 5.5 (`claude-haiku-5-5`) USD 0,10 / 0,50 por millón de tokens (prompts de hasta 100 K; 0,50 / 2,50 por encima), Sonnet 5.5 (`claude-sonnet-5-5`) 2 / 10, Opus 5.5 (`claude-opus-5-5`) 4 / 20, Fable 5.2 (`claude-fable-5-2`) 8 / 40. Coinciden con `PRICE_PER_MTOK`, así que las estimaciones de este documento quedan confirmadas. Los cuatro aceptan imágenes y salidas estructuradas (`output_config.format`). Opus 5.5 y Sonnet 5.5 rechazan `tool_choice` forzado (`any`/`tool`): la salida JSON va por salidas estructuradas, no forzando una herramienta. T3 sigue confirmando la regla de tokens de imagen y la caché antes de escribir código.
>
> **Comportamiento de la API que afecta al pipeline** (misma verificación): el pensamiento **no se puede desactivar** en Opus 5.5 ni en Haiku 5.5; en Sonnet 5.5 se usa `between_tools`. El esfuerzo por defecto es `medium` en Opus 5.5 y en Haiku 5.5. Ver la sección 3 y la [enmienda T0-6](#enmiendas-por-las-decisiones-de-la-usuaria-2026-11-16).

## Contexto

La fase 5 abre la modalidad 5 de `CLAUDE.md`: de una foto a un gráfico de colorwork (ruta plana) o a un amigurumi aproximado (ruta 3D), que se abre en el estudio correspondiente, editable y etiquetado "Generado con IA". En este ADR, "T*n*" son las tareas de la fase 5 ([roadmap](../roadmap.md#fase-5-en-detalle)). Hechos de partida:

- **Reglas de oro 2, 3, 4 y 6.** Los LLM nunca calculan conteos de puntos. Toda salida de IA pasa por el validador. Todo lo generado o modificado con IA queda etiquetado. No se inventan datos: si falta algo, se pide o se marca como supuesto visible.
- **Hosting.** La web corre en Cloudflare Workers Free con vinext ([despliegue-publico.md](../despliegue-publico.md), D1). El límite duro es **10 ms de CPU por petición**, sin contar las esperas de red. Decodificar una foto, re-codificarla o cuantizarla no cabe en 10 ms. Esperar la respuesta de la API de Anthropic sí cabe, porque es espera de red, pero la validación del documento resultante más el armado del prompt ya rozan el límite: `validatePattern` con `yarnUsage` tarda unos 14 ms en un motivo de 200 × 200.
- **Subidas hoy.** `POST /api/subidas` existe y está apagada (`LOOPITA_UPLOADS_ENABLED`). Usa `sharp` con `runtime = "nodejs"`. `sharp` usa binarios nativos de libvips, y workerd no ejecuta módulos nativos, así que esa ruta no puede correr en el hosting elegido. Las subidas se deciden en el ADR 0013.
- **`packages/ai-router`.** Ya es paquete del workspace (`package.json`, `src/index.ts`, `src/router.config.ts` y `test/router.test.ts`; el resumen de la fase 5 del roadmap estaba desactualizado). Tiene la escalera Haiku → Sonnet → Opus de la familia 5.5, políticas por agente, `selectModel`, `estimateCostUSD` y precios que el código rotula de "fuente secundaria" (verificados después, el 2026-11-16: ver la nota del inicio). No tiene esquemas de salida, prompts, cliente de API ni orquestador. `selectModel` escala en el **primer** fallo; `docs/agentes-runtime.md` dice que se escala cuando la salida no valida contra el esquema **dos** veces, o cuando el motor la rechaza.
- **Base.** `ai_jobs` existe (estado `queued | running | succeeded | failed | cancelled`, modelo, tokens y costo en una sola fila) y la usuaria solo la lee. `patterns.origin` (`manual | ai | ai_edited`) está protegido por el disparador `patterns_guard_origin` (M1): el cliente no crea patrones de IA ni les quita la etiqueta, y editarlos los marca `ai_edited`. `rate_events` y `begin_operation` cobran los intentos antes de procesar.
- **Topes del motor.** T20-A1 y T20-M1 están corregidos (`cd6c02a`): un documento `valid` tiene acotado el trabajo de expansión (`LIMITS.maxExpansionWork`) y el costo del validador. Era requisito para aceptar documentos generados por IA. `LIMITS.maxRoundItems` es 100, y T21 pidió subirlo a 200, con `PARSE_LIMITS.maxLineLength` en 4.000, antes de la fase 5.
- **Modelo canónico.** `Origin` es `{ kind, model?, promptVersion? }`. El documento es cerrado (ADR 0003, E16): no hay dónde guardar los supuestos que introduce la generación, como el tamaño objetivo o los colores fusionados.

## Opciones

### Reparto entre IA y código

- **A. La IA describe y el motor calcula.** La IA devuelve estructuras sin conteos: categorías, proporciones relativas, referencias a colores e identificadores. El código hace todo lo numérico.
- **B. La IA escribe el patrón** (vueltas, gráfico) y el validador lo corrige o lo rechaza. Viola la regla de oro 2, que la IA nunca calcula conteos. Además, el texto de patrón generado por un LLM suele no cuadrar, así que los reintentos se multiplicarían.

### Dónde corre el pipeline

- **W. Todo en el Worker**: Route Handler con la llamada a la IA y el procesamiento de imagen. No cabe en 10 ms de CPU, y `sharp` no corre en workerd.
- **E. Supabase Edge Functions** (Deno), que se invocan desde el navegador con la sesión de la usuaria. Según la documentación de Supabase, el plan gratuito da 2 s de CPU por invocación, unos 150 s de reloj, 256 MB de memoria y 500.000 invocaciones al mes. **Son valores a confirmar en T2.** Corren TypeScript con imports `.ts` y WebAssembly.
- **N. Servidor Node** (Vercel Hobby, con `sharp`). Funciona sin cambios en la ruta de subidas, pero el plan prohíbe el uso comercial y obliga a mover todo el hosting (D1 de despliegue).
- **B. Solo en el navegador**: el procesamiento y la llamada a la IA desde el cliente. La clave de API quedaría expuesta, y no hay re-codificación en el servidor (M3). Descartada.
- **Q. Cola de Cloudflare o un *worker* de fondo pagado.** No se asume ningún plan pago, y no se confirmó que Queues esté en Workers Free.

### Cómo avanza un trabajo largo (de 15 a 90 s)

- **P1. Avance por pasos dirigido por el navegador.** Cada llamada a `ia-trabajo/avanzar` ejecuta **una** etapa, con a lo más una llamada al modelo, y devuelve el estado nuevo. El servidor decide la etapa siguiente desde la base, con un arriendo (*lease*) por trabajo. Si la pestaña se cierra, el trabajo queda en pausa y vence.
- **P2. Encadenado en el servidor.** Al terminar una etapa, la función se invoca a sí misma (`EdgeRuntime.waitUntil`) y un barrido de pg_cron retoma los trabajos atascados. Sigue aunque se cierre la pestaña, pero depende del comportamiento de las tareas de fondo del plan gratuito, que no está verificado, y gasta presupuesto aunque nadie mire.
- **P3. Una sola invocación larga** con todas las etapas. Pasa los 150 s con reintentos de Opus, y no se puede reanudar.

### Moderación y clasificación

- **M1. Una sola llamada de triaje** que modera y clasifica, con una salida estructurada. La imagen se envía una vez.
- **M2. Dos llamadas**, como en `docs/agentes-runtime.md`. Duplica los tokens de imagen y la latencia, sin ganar aislamiento real: las dos ven la misma imagen.

### Dónde quedan los supuestos de la generación

- **S1. `origin.assumptions` en el documento, con `schemaVersion: 3`.** Viajan con el diseño (versiones fijadas, duplicar, PDF de la fase 7).
- **S2. En `notes`, con un prefijo.** No hay migración, pero se mezclan con las notas de la usuaria y se pierden al editarlas.
- **S3. Solo en `ai_jobs`.** No viajan al duplicar ni a las versiones, y la vista pública no los ve.

## Decisión

**A + E + P1 + M1 + S1.** La IA describe y el motor calcula. El pipeline corre en Supabase Edge Functions, que el navegador invoca con su sesión. El trabajo avanza por pasos dirigidos por el navegador, con el estado autoritativo en la base. Moderación y clasificación van en una sola llamada. Los supuestos viajan en el documento (v3 mínima).

### 1. Principio: la IA propone, el motor decide

Ninguna salida de un modelo contiene un número que termine siendo un conteo de puntos, de filas o de vueltas. Los esquemas de salida (sección 3) **no tienen ningún campo de conteo**. Una prueba de los esquemas lo verifica (IA-P1).

| Etapa | Qué hace la IA | Qué hace el código |
|---|---|---|
| Preparación (navegador) | Nada | Recorte elegido por la usuaria, reducción a ≤ 2048 px, aviso de derechos, ruta elegida por la usuaria |
| Subida | Nada | Tipo real, límites, decodificación, re-codificación sin metadatos, raster de trabajo (ADR 0013) |
| Parámetros | Nada | Ancho en puntos o cm, muestra (o la muestra supuesta del grosor, marcada), colores máximos, vista previa en vivo con `image-chart` |
| Triaje | Modera y clasifica: si se permite, motivos, si hay texto incrustado, si hay personas, si la imagen sirve para la ruta elegida, complejidad 1–5 | Rechaza, avisa o sigue según reglas fijas; la complejidad solo elige el modelo, acotada por el tope por trabajo. En la v1, `identifiable_person` en `reasons` siempre rechaza (decisión 10, enmienda T0-10) |
| Ruta plana: procesamiento | Nada | `rasterToChart`: remuestreo con la proporción de la muestra, cuantización determinista en CIELAB, color más cercano de la paleta (`nearestPaletteColor`), detección de motivo + repeticiones si es exacta |
| Ruta plana: asistente de paleta | Propone fusiones de colores, color de fondo, y grosor y fibras **solo si la usuaria no los eligió** | Acepta una fusión solo si ΔE2000 entre los dos colores es menor que `MERGE_MAX_DELTA_E` (lo fija `catalogo-lanas`). Grosor de 0 a 7 y fibras de `FIBER_IDS`, con la composición validada. Lo aceptado queda como supuesto |
| Ruta 3D: descomposición | Describe el objeto como primitivas del conjunto que fije T1: tipo, proporción alto/ancho, ancho relativo a la pieza principal, lana, uniones y región de unión, copias | `validatePrimitivePlan` y `planToWritten`: vueltas, aumentos y disminuciones con fórmulas geométricas deterministas según la muestra y el alto objetivo que da la usuaria. Anclas de `layout` calculadas por el motor |
| Validación | Nada | `validatePattern` sin opciones (`valid` o `savable`), más los avisos de dominio |
| Redacción | Notas, pasos de armado (3D) y supuestos en español, con el glosario de la usuaria | Revisión de texto (`checkText`: controles, bidireccionales, largos), **rechazo de cifras de puntos** en el texto libre (sección 4) y respaldo determinista con `pattern-render` si falla |
| Entrega | Nada | Inserta el patrón con `service_role`, `origin.kind = "ai"`, y enlaza `ai_jobs.result_pattern_id` |

### 2. Etapas y rutas

```
navegador: elegir ruta → elegir archivo → recortar → aviso de derechos → reducir (≤ 2048 px)
  → subir-imagen (ADR 0013) → raster de trabajo PNG ≤ 1024 px
  → parámetros con vista previa en vivo (image-chart en el navegador, < 100 ms)
  → ia-trabajo/iniciar (cuota, presupuesto, cupo de patrones) → trabajo "received"
  → bucle: ia-trabajo/avanzar  (una etapa por llamada)
       triage ─► [plana]  chart_compute ─► palette ─► validate ─► draft ─► deliver
              └► [3D]     decompose ─► plan_compute ─► validate ─► draft ─► deliver
  → abrir /disenos/[id] (estudio de colorwork o amigurumi), con la etiqueta de IA
```

- **La ruta la elige la usuaria**, no el clasificador. El triaje solo dice si la imagen sirve para esa ruta (`fit`). Si no sirve, la interfaz lo explica y ofrece la otra ruta, sin cambiarla sola. Así un texto incrustado en la imagen no puede desviar el flujo.
- **El recorte lo hace la usuaria** antes de subir. Se quita `cropSuggestion` del clasificador: la IA ya no lo necesita, y solo se sube la región que interesa.
- **Parámetros antes de la IA (regla de oro 6).** La ruta plana pide el ancho (en puntos, o en cm con la muestra) y los colores máximos. Si falta la muestra, usa la muestra supuesta del grosor (`suggestedGauge`), rotulada como supuesto. La ruta 3D pide el alto objetivo en cm y la lana, o el grosor. Nada de esto lo inventa la IA.
- **Alto del gráfico.** `filas = round(anchoEnPuntos × (altoImagen / anchoImagen) × (filasEn10cm / puntosEn10cm))`, acotado a `LIMITS.maxMotifSide`. La fila 0 es la primera que se teje: con `bottom_up` es la fila de abajo de la imagen. La fórmula es geometría. Cuál es la proporción de la muestra supuesta lo confirma `experto-tejido` en T1.
- **Vista previa en vivo (regla de oro 7).** `image-chart` es puro y corre igual en el navegador y en el servidor, sobre el **mismo raster de trabajo** (PNG sin pérdida que devuelve la subida). Por eso la vista previa y el resultado final son idénticos píxel a píxel (IA-P3). Cambiar el ancho o los colores se refleja en menos de 100 ms, sin llamar a la IA.
- **El asistente de paleta no ve la foto completa**: recibe el gráfico ya cuantizado (una imagen pequeña de la resolución del gráfico), el histograma de colores y la paleta. Así cuesta menos, y el texto incrustado en la foto queda ilegible a esa resolución.
- **El redactor nunca ve la imagen.** Recibe un resumen derivado del documento ya validado (partes, dimensiones, lanas, supuestos) y el dialecto de la usuaria (`profiles.pattern_dialect`).
- **Fuera de la v1 de la fase 5**: el explicador de errores, el asistente del editor, el tramado (*dithering*) y las técnicas que el modelo no representa (intarsia, tapestry en el estudio de colorwork).

### 3. Salidas estructuradas

- **Esquemas propios, sin dependencias.** `packages/ai-router/src/schema.ts` es un mini-lenguaje de esquemas, del que salen dos cosas: el validador local y el JSON Schema que se envía a la API. No hay dos definiciones que puedan divergir. Sigue la línea del ADR 0002, aunque `ai-router` no es núcleo.
- **Mecanismo en la API: salida estructurada nativa, `output_config.format`**, con el JSON Schema del agente (enmienda T0-6). No se usa una herramienta forzada: Opus 5.5 y Sonnet 5.5 rechazan `tool_choice` forzado (`any`/`tool`), y conviene un solo mecanismo para toda la escalera. La petición no lleva herramientas. **Manda la validación local**: una garantía del proveedor nunca reemplaza al validador. Un `stop_reason` de corte por tokens o de rechazo cuenta como fallo de esquema.
- **Pensamiento y esfuerzo.** El pensamiento no se puede desactivar en Opus 5.5 ni en Haiku 5.5, y en Sonnet 5.5 se usa `between_tools`. El esfuerzo por defecto es `medium` en Opus 5.5 y en Haiku 5.5. Consecuencias:
  - el pensamiento se cobra como salida, así que `maxOutputTokens` de cada agente debe cubrir el pensamiento más la respuesta, y la reserva del ADR 0014 se calcula con ese valor;
  - si el pensamiento agota `max_tokens`, la respuesta llega cortada y cuenta como fallo de forma;
  - el pensamiento nunca se registra ni se muestra: solo vale la salida estructurada;
  - T3 mide cuánto piensa cada etapa con el esfuerzo por defecto y con uno menor, y propone el `effort` y los `maxOutputTokens` por agente para que `jobCapUSD` quede dentro de los topes aprobados (ADR 0014, sección 6).
- **Lo que sigue verificando T3**: la regla de tokens de imagen, la caché y `stop_reason` con `output_config.format`.
- **Forma de los esquemas.** Enumeraciones cerradas, números con rango, identificadores que se comprueban contra los datos del trabajo, arreglos con tope, textos con tope de largo, `additionalProperties: false`. Ninguno tiene campos de conteo.

```ts
// packages/ai-router/src/agents.ts (contrato; lo implementa ia-pipeline en T8)
export interface TriageOutput {
  allowed: boolean;
  reasons: Array<"sexual" | "violence" | "hate" | "self_harm" | "minor" | "identifiable_person" | "personal_document" | "other">; // ≤ 4
  hasEmbeddedText: boolean;
  containsPeople: boolean;
  fit: "good" | "poor" | "unsuitable";           // para la ruta que eligió la usuaria
  complexity: 1 | 2 | 3 | 4 | 5;
  subject: string;                                // ≤ 60 caracteres, solo para el título sugerido
}

export interface PaletteOutput {
  merges: Array<{ from: number; into: number }>;  // índices de colores del gráfico cuantizado; ≤ 8
  background: number | null;                      // índice de color, o null
  suggestedWeight: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | null; // solo si la usuaria no eligió
  suggestedFibers: Array<{ fiber: string; percent: number }>; // ids de FIBER_IDS; suma 100; ≤ 3; vacío si no aplica
}

export type PrimitiveKind = "sphere" | "ellipsoid" | "cylinder" | "cone" | "disc"; // candidato: lo confirma T1
export interface DecomposerOutput {
  main: string;                                   // id de la pieza principal
  parts: Array<{
    id: string;                                   // [a-z0-9-]{1,16}
    name: string;                                 // ≤ 40, en español
    kind: PrimitiveKind;
    aspect: number;                               // alto/ancho de la pieza terminada; rango por tipo (T1)
    relativeWidth: number;                        // ancho relativo a la principal, en (0, 1.5]
    color: number;                                // índice de la paleta del trabajo
    copies: 1 | 2 | 3 | 4;
    attach: null | { to: string; region: "top" | "bottom" | "front" | "back" | "left" | "right"; heightFraction: number /* 0..1 */ };
  }>;                                             // ≤ RECOMMENDED_WRITTEN_LIMITS.parts
}

export interface WriterOutput {
  notes: string[];                                // ≤ 6 × 300
  assemblyInstructions: string[];                 // solo 3D; ≤ 12 × 300
  assumptions: string[];                          // ≤ 10 × 200; se suman a los supuestos deterministas
}
```

### 4. Validación y reintentos con escalamiento

Tres niveles, en este orden:

1. **Forma**: el validador del esquema (tipos, rangos, enumeraciones, largos, claves desconocidas).
2. **Propuesta**: comprobaciones referenciales y de dominio sobre lo que propuso la IA. Por ejemplo, que los índices de color existan, que no haya ciclos en `attach`, que `main` exista, que `aspect` esté en el rango del tipo, y el ΔE de las fusiones. Para el redactor, además, `checkText` y el **filtro de cifras**: se rechaza un texto con una cifra junto a una abreviatura o un nombre de punto (`\d+\s*(pb|pts?|puntos|aum|dism|sc|inc|dec|…)`, con la lista sacada de `glossary`), o con una referencia a una vuelta concreta, porque esos números son del motor (regla de oro 2). También se rechazan URL y direcciones de correo.
3. **Motor**: `validatePrimitivePlan`, `planToWritten` y `validatePattern` del documento armado.

Política (la implementa `selectModel` en T8, que corrige el escalamiento al primer fallo):

- **Fallo de forma** (niveles 1 y 2): un reintento con el mismo modelo, con los códigos del validador como corrección. Si vuelve a fallar, sube un peldaño.
- **Rechazo del motor** (nivel 3): sube un peldaño directamente.
- **Topes**: 3 intentos por etapa (2 para el redactor), `MAX_ESCALATIONS_PER_JOB = 2` (sin cambios) y el **tope de costo por trabajo** del ADR 0014. Una complejidad de 4 o más sube un peldaño desde el inicio, pero no se salta el tope de costo, y así un texto incrustado que infle la complejidad no puede disparar el gasto.
- **Agotado**: qué se entrega lo fija la decisión 9 de la fase 5, aprobada en su opción (a) (enmienda T0-9):
  - si el documento es `savable` pero no `valid`, se entrega como **borrador con advertencias**, etiquetado, y "Tejer" queda bloqueado hasta que sea `valid` (ADR 0006, E10);
  - si no es `savable`, o la etapa que falló es el triaje o la descomposición, no hay patrón: se devuelve el cupo a la usuaria y se le dice qué cambiar (menos colores, otro recorte, la otra ruta).
- **El redactor nunca bloquea la entrega**: si se agota, las notas salen de `pattern-render` (`describeWritten` o el resumen del gráfico) con el aviso "Notas generadas sin IA".
- Cada intento queda en `ai_job_calls` con su resultado (ADR 0014).

### 5. Defensa ante inyección por texto en la imagen

1. **La imagen es dato.** El sistema de cada agente dice que todo texto visible en la imagen es parte del contenido y nunca una instrucción. El mensaje de usuaria lleva solo la imagen y los parámetros, armados por código; no hay texto libre de la usuaria en la v1.
2. **Sin herramientas con efectos.** El modelo solo puede responder con la estructura del esquema. No navega, no ejecuta y no ve otras herramientas, datos de otras usuarias ni secretos.
3. **Sin datos personales en el prompt**: ni correo, ni `display_name`, ni identificadores de la usuaria. Los identificadores del trabajo no se envían.
4. **Superficie mínima.** La ruta la elige la usuaria. El asistente de paleta ve solo el gráfico reducido y el redactor no ve la imagen, así que solo el triaje y el descomponedor ven la foto, y sus salidas son enumeraciones y números con rango.
5. **Lo que el texto incrustado podría lograr está acotado**: un rechazo (la usuaria lo ve y puede reintentar), un `fit` malo (solo informa), una complejidad alta (acotada por el tope de costo) o proporciones raras (acotadas por los rangos de T1, y el motor valida). Nunca un conteo, un cambio de etiqueta ni una acción en la base.
6. **`hasEmbeddedText`** se registra en `ai_jobs.warnings` y se muestra a la usuaria ("La imagen tiene texto; lo tratamos como parte del dibujo").
7. **Texto libre de salida** (`subject`, `name`, notas): `checkText`, topes de largo, filtro de cifras, URL y correos. En la interfaz es texto plano, nunca HTML (React escapa; no hay `dangerouslySetInnerHTML`).
8. **Conjunto de evaluación con imágenes hostiles** (T14): texto que pide ignorar instrucciones, cambiar la ruta, poner conteos, insertar URL o sacar la etiqueta. Corre con el modelo real en T23, con un tope de costo, y como respuestas grabadas en la CI.

### 6. Etiquetado (regla de oro 4)

- El patrón lo crea **solo** la Edge Function con `service_role`, con `origin = { kind: "ai", model, promptVersion, assumptions }`. El disparador `patterns_guard_origin` ya impide que el cliente lo cree, lo falsifique o le quite la etiqueta, y editarlo lo marca `ai_edited`.
- `origin.model` es el modelo de la etapa generativa: el asistente de paleta en la ruta plana y el descomponedor en la 3D. El detalle completo, con todas las llamadas y modelos, vive en `ai_job_calls`.
- `origin.promptVersion` es la versión del conjunto de prompts del pipeline, por ejemplo `"img2chart/1.0.0"` o `"img2amigurumi/1.0.0"`, dentro de `LIMITS.maxOriginFieldLength`. Cada versión de prompt es un archivo inmutable en `packages/ai-router/prompts/`; cambiar un prompt es subir la versión.
- **`schemaVersion: 3` mínima (S1).** Agrega solo `Origin.assumptions?: string[]` (≤ 20 × 200 caracteres, revisados por `checkText`), y nada más. La migración v2 → v3 es la identidad más el número; la regla de compatibilidad y las propiedades M1 a M4 son las del ADR 0011, sección 5. `motor-patrones` la implementa en T6b. Despliegue en dos pasos si ya hubo puesta en público (ADR 0011, sección 5). Los supuestos deterministas (muestra supuesta, tamaño objetivo, fusiones aceptadas, grosor y fibras sugeridos) los escribe el código, no el redactor.
- **Interfaz**: insignia "Generado con IA" (o "Generado con IA y editado") que no se puede cerrar, en el estudio, en `/disenos`, en "Tejiendo" y, en la fase 7, en el PDF y en la vista pública. En la ruta 3D, además, "Aproximación". Hay un panel "Supuestos" con `origin.assumptions`, y se recuerda tejer una muestra (regla de oro 8).
- **Duplicar un patrón de IA** (ADR 0006, E11): una función `duplicate_ai_pattern(p_owner, p_pattern)` (`security definer`, que solo ejecuta `service_role`) copia el documento con `origin.kind = "ai_edited"`, el modelo, la versión de prompt y los supuestos. La llama una Server Action con el cliente admin; en el Worker es solo espera de red. Queda detrás de la bandera `LOOPITA_AI_DUPLICATE_ENABLED`, apagada en el proyecto real hasta que la revisión legal B3 lo apruebe (decisión 12, enmienda T0-12). Con la bandera apagada, `AI_DUPLICATE_UNSUPPORTED` se mantiene.

### 7. Dónde corre cada parte

| Parte | Dónde | Por qué |
|---|---|---|
| Recorte, reducción a ≤ 2048 px, vista previa de parámetros | Navegador | Instantáneo (regla de oro 7); la foto original no sale del equipo |
| `subir-imagen` (ADR 0013) | Edge Function | Decodificar y re-codificar no cabe en 10 ms de CPU; WebAssembly sí corre en Deno |
| `ia-trabajo/iniciar`, `avanzar` y `cancelar` | Edge Function | Las llamadas a la API son espera de red, pero el procesamiento y `validatePattern` cuestan CPU, y la clave de Anthropic queda fuera del Worker |
| `ia-mantenimiento` (purga de Storage, vencimiento de trabajos, alertas) | Edge Function invocada por pg_cron con pg_net | Borrar en Storage exige la API de Storage, no SQL; pg_cron ya está activo (purga diaria) |
| Páginas, abrir el resultado, Server Action de duplicar | Worker (vinext) | Solo lecturas y llamadas a la base |
| Cuotas, presupuesto y transiciones de estado | Postgres (funciones `security definer`) | Atómico y concurrente; es la única barrera común a todas las invocaciones (ADR 0014) |

- **Invocación.** El navegador llama a `https://<proyecto>.supabase.co/functions/v1/<función>` con su token de acceso. Cada función verifica el JWT y además llama a `auth.getUser()`. Las peticiones con un `Origin` fuera de la lista permitida (`https://loopitalab.cl` y `http://localhost:3000` en desarrollo) se rechazan, y CORS se restringe a la misma lista. `connect-src` de la CSP ya incluye el dominio de Supabase (P3.1).
- **Secretos.** `ANTHROPIC_API_KEY` vive solo en los secretos de las Edge Functions (`supabase secrets set`), nunca en el Worker, en GitHub ni en el repositorio. En la CI no hay clave: se usa `FakeModelClient` (sección 8).
- **Avance por pasos (P1).** `avanzar` toma el arriendo del trabajo (`lease_until`, ADR 0014), ejecuta **una** etapa con a lo más una llamada al modelo (tiempo límite de 90 s por llamada, dentro de los 150 s de reloj), persiste el resultado y devuelve `{ stage, status, progress }`. El navegador vuelve a llamar hasta llegar a un estado terminal. Cerrar la pestaña deja el trabajo en pausa; `ia-mantenimiento` lo vence a los 15 minutos sin avance, libera las reservas y devuelve el cupo. Si la usuaria vuelve antes, lo retoma desde la última etapa guardada.
- **Presupuesto de CPU por invocación** (lo mide T2): decodificar el raster PNG de ≤ 1024 px, más `rasterToChart` (≤ 200 × 200 celdas), más `validatePattern`, debe quedar con p99 bajo 500 ms. Eso deja margen de 4 veces sobre los 2 s.
- **Puerta de viabilidad T2**, como P1a del despliegue: importar `pattern-core`, `yarn-catalog`, `image-chart` y `ai-router` desde Deno (imports `.ts` y JSON con atributos), el códec WebAssembly elegido en el ADR 0013, el CPU medido y los límites reales del plan gratuito. **Si T2 falla**, se vuelve a decidir con la usuaria entre N (Node con `sharp`) y una variante de E que lleve el procesamiento de imagen al navegador, dejando en el servidor solo la verificación y la re-codificación mínima. Las dos cambian este ADR por enmienda.

### 8. Capas y contratos

- **Dominio (puro, sin I/O, probado con `node:test`)**:
  - `pattern-core`, con `primitives.ts` nuevo: `validatePrimitivePlan` y `planToWritten`;
  - `image-chart` (nuevo): raster → celdas, encabezados de imagen, repeticiones;
  - `yarn-catalog`;
  - `ai-router`: `selectModel`, esquemas, validadores de salidas, filtro de cifras, precios, tabla de transiciones y cálculo de reservas.
- **Aplicación (pura, con puertos)**: `packages/ai-router/src/pipeline/`, con `runStage(job, ports)`, que decide la etapa siguiente, arma las entradas, valida, escala y registra. Se prueba en Node con dobles de los puertos.
- **Infraestructura**: `supabase/functions/` (Deno). Implementa los puertos: Supabase (con `service_role`), el cliente de Anthropic sobre `fetch` y el códec WebAssembly. No tiene lógica de negocio.

```ts
// packages/ai-router/src/pipeline/ports.ts (contrato; lo implementa ia-pipeline en T8 y T12)
export interface ModelRequest {
  agent: AgentName; model: ModelId; system: string; promptVersion: string;
  image?: { mediaType: "image/png"; base64: string; widthPx: number; heightPx: number };
  input: unknown;                     // JSON armado por código
  outputSchema: JsonSchema;           // derivado de schema.ts; va en output_config.format
  maxOutputTokens: number;            // pensamiento + respuesta (enmienda T0-6)
  effort?: "low" | "medium" | "high"; // por agente; los valores admitidos y los elegidos los fija T3
  timeoutMs: number;
}
export interface ModelResponse {
  ok: boolean; output?: unknown;      // sin validar: lo valida runStage
  stopReason: "end" | "max_tokens" | "refusal" | "tool" | "other";
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
  requestId?: string; latencyMs: number; error?: "timeout" | "http_4xx" | "http_5xx" | "network";
}
export interface ModelClient { call(req: ModelRequest): Promise<ModelResponse>; }

export interface BudgetLedger {      // ADR 0014; funciones de Postgres
  reserve(jobId: string, callId: string, usd: number): Promise<"ok" | "daily_cap" | "monthly_cap" | "job_cap" | "disabled">;
  settle(callId: string, usd: number): Promise<void>;
}
export interface JobStore {
  lease(jobId: string, ownerId: string): Promise<JobSnapshot | "busy" | "not_found" | "terminal">;
  advance(jobId: string, from: Stage, to: Stage, patch: JobPatch): Promise<"ok" | "conflict">;
  recordCall(call: CallRecord): Promise<void>;
}
export interface RasterStore { read(uploadId: string, ownerId: string): Promise<Raster>; }

export function runStage(job: JobSnapshot, ports: { model: ModelClient; budget: BudgetLedger; jobs: JobStore; rasters: RasterStore; clock: () => number }): Promise<StageResult>;
```

```ts
// packages/image-chart/src/index.ts (contrato; lo implementa motor-patrones en T7)
export interface Raster { width: number; height: number; data: Uint8ClampedArray } // RGBA
export interface ImageHeader { format: "jpeg" | "png" | "webp"; width: number; height: number }
export function sniffImageHeader(bytes: Uint8Array): ImageHeader | null;  // sin decodificar
export function resizeArea(r: Raster, maxSide: number): Raster;           // promedio por área, determinista
export interface ChartFromImageParams {
  widthStitches: number;              // 4..LIMITS.maxMotifSide
  gauge: Gauge;                       // real o supuesta (la marca la pone quien llama)
  maxColors: number;                  // 2..8 (lo confirma T1)
  mapToPalette: boolean;              // true: color de la paleta propia; false: hex cuantizado
  direction: "bottom_up" | "top_down";
}
export interface ChartFromImage {
  width: number; height: number; cells: number[];  // índices de color, fila 0 = primera que se teje
  colors: Array<{ hex: string; paletteId?: string; share: number }>;
  colorsPerRow: number[];
  clampedHeight: boolean;             // el alto se acotó a maxMotifSide
}
export function rasterToChart(r: Raster, p: ChartFromImageParams): ChartFromImage;
export function detectExactRepeat(c: ChartFromImage): { motifWidth: number; motifHeight: number; x: number; y: number } | null;
```

```ts
// packages/pattern-core/src/primitives.ts (contrato; lo implementa motor-patrones en T6, con las reglas de T1)
export interface PrimitivePlan {
  main: string; targetHeightCm: number;               // el alto lo da la usuaria, no la IA
  yarns: Yarn[];                                      // armadas por código desde la paleta
  parts: Array<DecomposerOutput["parts"][number] & { yarn: string }>;
}
export interface PrimitiveBuildOptions { gauge: Gauge; gaugeAssumed: boolean; stitch: "sc" }
export function validatePrimitivePlan(plan: unknown): ValidationProblem[];
export function planToWritten(plan: PrimitivePlan, opts: PrimitiveBuildOptions):
  | { ok: true; pattern: WrittenPattern; assumptions: string[] }
  | { ok: false; problems: ValidationProblem[] };
```

## Propiedades exigidas (con semilla, `node:test`)

- **IA-P1.** Ningún esquema de salida tiene un campo numérico cuyo nombre o descripción sea un conteo (`count`, `stitches`, `rounds`, `rows`, `expected`). La prueba recorre `schema.ts`.
- **IA-P2.** Para todo plan válido, `planToWritten` es determinista y su documento es `valid`. El conteo de cada vuelta coincide con la suma de sus instrucciones (lo verifica `validatePattern`) y queda dentro de `LIMITS` (T20) y de `RECOMMENDED_WRITTEN_LIMITS`, o lleva su aviso.
- **IA-P3.** `rasterToChart` es determinista: el mismo raster y los mismos parámetros dan las mismas celdas en Node y en Deno (prueba cruzada en T2). Además, `colors.length ≤ maxColors`, todo índice de `cells` está en rango y `height ≤ LIMITS.maxMotifSide`.
- **IA-P4.** Monotonía: más ancho en puntos da un alto igual o mayor; un alto objetivo mayor da vueltas con igual o más puntos como máximo.
- **IA-P5.** Las salidas que no validan nunca llegan a `planToWritten` ni al documento. Con un `FakeModelClient` que devuelve basura aleatoria, el pipeline termina siempre en un estado terminal sin lanzar, en ≤ 3 intentos por etapa, sin pasar el tope de costo.
- **IA-P6.** El filtro de cifras rechaza todo texto generado con "N pb", "N pts", "V12" y similares del glosario, y acepta textos sin cifras de puntos.

## Consecuencias

- **Positivas**:
  - la regla de oro 2 se cumple por construcción, porque no hay dónde poner un conteo;
  - la regla de oro 7 se cumple porque la vista previa de parámetros no espera a la IA;
  - el Worker no carga CPU ni secretos de IA;
  - la CI prueba todo el pipeline sin cuenta de Anthropic;
  - el costo baja: el triaje es una sola llamada y el asistente de paleta ve una imagen pequeña.
- **Negativas**:
  - aparece un segundo entorno de ejecución (Deno en Edge Functions), con su despliegue y sus pruebas;
  - el trabajo depende de que la pestaña siga abierta (P1);
  - hay que mantener una v3 del esquema;
  - la ruta 3D depende de un algoritmo nuevo del motor (T6) y de las reglas de T1.
- **Cambios a documentos**: `docs/agentes-runtime.md` (triaje en una llamada, sin `cropSuggestion`, ruta elegida por la usuaria, redactor sin imagen) y el resumen de la fase 5 del roadmap (estado real de `ai-router`). Los actualiza T24.

## Riesgos abiertos

| ID | Riesgo | Mitigación |
|---|---|---|
| R5-1 | Los límites del plan gratuito de Edge Functions (CPU, reloj, cuerpo de la petición, tareas de fondo) no son los que asume este ADR | Puerta T2 con mediciones; sin T2 en verde no empieza T11 ni T12 |
| R5-2 | Deno no resuelve los imports del monorepo (`.ts` fuera de `supabase/functions`, JSON con atributos) al desplegar | T2 lo prueba con `supabase functions deploy` en un proyecto desechable. Alternativa: un paso de *bundle* en la CI que copie los paquetes |
| R5-3 | Los precios, los ID y la salida estructurada quedaron verificados el 2026-11-16. Quedan la regla de tokens de imagen, la caché y cuánto pensamiento gasta cada etapa, que no se puede apagar en Haiku 5.5 ni en Opus 5.5 | T3 los verifica con el skill antes de T8, y cualquier diferencia es una enmienda del ADR 0014. Los topes se calculan desde `PRICE_PER_MTOK` y `maxOutputTokens` con el pensamiento, no a mano |
| R5-4 | El descomponedor propone formas que el motor no puede tejer de forma honesta | Conjunto de primitivas y rangos fijados por T1; `validatePrimitivePlan` rechaza lo demás; "Aproximación" visible |
| R5-5 | El filtro de cifras rechaza textos legítimos o deja pasar cifras con otra forma | Lista sacada de `glossary` en los tres dialectos; conjunto de casos en T14; respaldo determinista |
| R5-6 | La moderación es probabilística | Aviso de derechos obligatorio (ADR 0013), denuncias de la fase 7 y registro de `reasons` |
| R5-7 | La usuaria cierra la pestaña a mitad y pierde el trabajo | El trabajo se retoma si vuelve antes de 15 minutos; se devuelve el cupo; la interfaz lo avisa al empezar |

## Enmiendas por las decisiones de la usuaria (2026-11-16)

La usuaria aprobó el ADR el 2026-11-16 ([decisiones de la fase 5](../roadmap.md#decisiones-de-la-fase-5-aprobadas-el-2026-11-16)). Cambios al texto propuesto:

- **T0-1 (decisión 1, opción a).** Se aprueba S1: `schemaVersion: 3` con solo `origin.assumptions` (sección 6). Sin cambios.
- **T0-2 (decisión 2, opción c): dos hitos.**
  - El **hito 1** es la ruta plana y se entrega sola, con su PR. Incluye todo lo común: la tabla `JOB_TRANSITIONS` completa (con los estados 3D), `jobCapUSD` de las dos rutas, las subidas, `ia-trabajo` y la etiqueta. La ruta 3D queda **apagada en el servidor**: `iniciar` con `route = "amigurumi"` responde `route_disabled`, sin cobrar cupo; la interfaz no la ofrece.
  - El **hito 2** es la ruta 3D: `primitives.ts` (T6), el esquema `DecomposerOutput` y las etapas 3D de `runStage` (T8-3D), y la ruta en `ia-trabajo` (T13). Empieza con su propia revisión de dominio (T1-3D), que fija `PrimitiveKind` y los rangos de la sección 3, y se activa solo con la aprobación de T22-3D y T21-3D.
  - Los contratos de la sección 8 no cambian; solo se reparte su implementación.
- **T0-5 (decisión 5, opción a).** Se confirma E (Supabase Edge Functions), sujeta a la puerta T2 (sección 7).
- **T0-6 (decisión 6, opción a).** Triaje y asistente de paleta en Haiku 5.5 (techo Sonnet 5.5); descomponedor en Sonnet 5.5 (techo Opus 5.5); redactor en Haiku 5.5 en la ruta plana y en Sonnet 5.5 en la 3D (techo Sonnet 5.5). Fable 5.2 queda fuera. Además:
  - los precios y los ID quedan verificados (nota del inicio; R5-3 actualizado);
  - **la salida estructurada va por `output_config.format`**, porque Opus 5.5 y Sonnet 5.5 rechazan `tool_choice` forzado: se quita la alternativa de la herramienta forzada de la sección 3;
  - **el pensamiento no se puede desactivar en Opus 5.5 ni en Haiku 5.5** (en Sonnet 5.5, `between_tools`), y el esfuerzo por defecto es `medium` en Opus 5.5 y Haiku 5.5: `maxOutputTokens` lo incluye y `ModelRequest` lleva `effort` (secciones 3 y 8);
  - T3 sigue verificando la regla de tokens de imagen, la caché y el pensamiento por etapa.
- **T0-7 (decisión 7, opción a).** `FakeModelClient` en la CI y en el desarrollo; una sola prueba real con un tope total de USD 2, en dos corridas (T23 y T23-3D; ADR 0014, sección 6).
- **T0-9 (decisión 9, opción a).** Lo que se entrega al agotar los reintentos queda como estaba en la sección 4.
- **T0-10 (decisión 10, opción b).** En la v1, el triaje rechaza las imágenes cuyo tema principal es una persona identificable: `identifiable_person` en `reasons` lleva a `rejected`/`moderation` por regla fija, sin importar `allowed`. Hasta la revisión legal (sección 1).
- **T0-11 (decisión 11, opción a).** Solo la lista permitida, al principio solo la cuenta de la usuaria (ADR 0014).
- **T0-12 (decisión 12, opción a).** Duplicar en la fase 5 (T10), detrás de la bandera `LOOPITA_AI_DUPLICATE_ENABLED`, que se enciende con la revisión legal B3 (sección 6).
