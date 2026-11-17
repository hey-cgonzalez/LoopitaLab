# ADR 0012: Pipeline imagen → patrón

- Estado: **aceptado (2026-11-16, T0)**. Propuesto el 2026-11-16 por `arquitecto`; la usuaria lo aprobó con las [decisiones de la fase 5](../roadmap.md#decisiones-de-la-fase-5-aprobadas-el-2026-11-16). Ver [Enmiendas por las decisiones de la usuaria](#enmiendas-por-las-decisiones-de-la-usuaria-2026-11-16) y [Enmiendas por el grupo A del hito 1](#enmiendas-por-el-grupo-a-del-hito-1-t1-t2-y-t3-2026-11-16) (T1, T2 y T3). La puerta de viabilidad T2 **pasó** el 2026-11-16, así que la sección 7 queda confirmada.
- Fecha: 2026-11-16
- Paquetes: `packages/ai-router`, `packages/image-chart` (nuevo), `packages/pattern-core`, `packages/yarn-catalog`, `packages/pattern-render`, `supabase/functions` (nuevo), `supabase/migrations`, `apps/web`
- Relacionado: [ADR 0001](0001-modelo-canonico.md) (origen), [ADR 0002](0002-nucleo-sin-dependencias.md), [ADR 0003](0003-colorwork-en-esquema-v1.md), [ADR 0006](0006-guardado-de-disenos.md) (E11: duplicar diseños de IA), [ADR 0010](0010-geometria-3d-amigurumi.md), [ADR 0011](0011-posicion-de-partes-y-editor-escrito.md) (v2, topes T20, `maxRoundItems`), [ADR 0013](0013-subidas-y-storage.md) (subidas), [ADR 0014](0014-costos-y-cuotas-de-ia.md) (costos y cuotas), [docs/agentes-runtime.md](../agentes-runtime.md), [docs/seguridad.md](../seguridad.md), [docs/despliegue-publico.md](../despliegue-publico.md)


> **Verificación de precios y modelos (2026-11-16, orquestador, skill `claude-api`, tabla de modelos del 2026-11-03):** Haiku 5.5 (`claude-haiku-5-5`) USD 0,10 / 0,50 por millón de tokens (prompts de hasta 100 K; 0,50 / 2,50 por encima), Sonnet 5.5 (`claude-sonnet-5-5`) 2 / 10, Opus 5.5 (`claude-opus-5-5`) 4 / 20, Fable 5.2 (`claude-fable-5-2`) 8 / 40. Coinciden con `PRICE_PER_MTOK`, así que las estimaciones de este documento quedan confirmadas. Los cuatro aceptan imágenes y salidas estructuradas (`output_config.format`). Opus 5.5 y Sonnet 5.5 rechazan `tool_choice` forzado (`any`/`tool`): la salida JSON va por salidas estructuradas, no forzando una herramienta. T3 confirmó el 2026-11-16 la regla de tokens de imagen, la caché y el pensamiento ([README de `ai-router`](../../packages/ai-router/README.md#datos-verificados-de-la-api-t3-2026-11-16)).
>
> **Comportamiento de la API que afecta al pipeline** (corregido por T3, [enmienda T3-1](#enmiendas-por-el-grupo-a-del-hito-1-t1-t2-y-t3-2026-11-16)):
> - **Haiku 5.5**: el pensamiento **sí se puede apagar**, con `thinking: { type: "disabled" }` y esfuerzo `low`, `medium` o `high`. Esfuerzo por defecto: `medium`.
> - **Sonnet 5.5**: `disabled` da 400; lo mínimo es `between_tools`, que sin herramientas equivale a no pensar. Esfuerzo por defecto: `high`.
> - **Opus 5.5**: el pensamiento está **siempre activo** (`disabled` y `budget_tokens` dan 400); el control es el esfuerzo. Esfuerzo por defecto: `medium`.
>
> El texto anterior de esta nota decía que el pensamiento no se podía apagar en Haiku 5.5: era un error. Ver la sección 3.

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
| Parámetros | Nada | Ancho en puntos o cm, **grosor** (obligatorio; por omisión 4, con el supuesto `weight_assumed`), muestra (o la muestra supuesta del grosor, marcada), colores máximos, colores por fila, limpieza opcional, vista previa en vivo con `image-chart` (enmiendas E-1 y E-2) |
| Triaje | Modera y clasifica: si se permite, motivos, si hay texto incrustado, si hay personas, si la imagen sirve para la ruta elegida, complejidad 1–5 | Rechaza, avisa o sigue según reglas fijas; la complejidad solo elige el modelo, acotada por el tope por trabajo. En la v1, `identifiable_person` en `reasons` siempre rechaza (decisión 10, enmienda T0-10), y `third_party_ip` también, de forma provisional hasta T1c (E-5). `containsPeople = true` sin `identifiable_person` no rechaza. Las métricas del código pueden bloquear aunque el triaje diga `good`; la IA solo agrava, nunca relaja un bloqueo del código ("el peor de los dos manda", E-4) |
| Ruta plana: procesamiento | Nada | `rasterToChart`: remuestreo con la proporción de la muestra, cuantización determinista en CIELAB, color más cercano de la paleta (`nearestPaletteColor`), simplificación por fila a `maxColorsPerRow` (E-10), limpieza opcional, métricas (E-4) y detección de motivo + repeticiones si es exacta |
| Ruta plana: asistente de paleta | Propone fusiones de colores, color de fondo, y fibras **solo si la usuaria no las eligió**. **No propone el grosor** (E-1) | Acepta una fusión solo si ΔE2000 entre los dos colores es menor que `MERGE_MAX_DELTA_E` (lo fija `catalogo-lanas`; valor sugerido 10, E-9). Fibras de `FIBER_IDS`, con la composición validada. Lo aceptado queda como supuesto |
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
- **Parámetros antes de la IA (regla de oro 6).** La ruta plana pide el ancho (en puntos, o en cm con la muestra), el **grosor**, los colores máximos y los colores por fila. El grosor es obligatorio antes de `chart_compute`, porque fija la muestra supuesta y con ella el alto; si la usuaria no lo elige, vale 4 con el supuesto visible `weight_assumed` (E-1). Si falta la muestra, usa la muestra supuesta del grosor (`suggestedGauge`), rotulada como supuesto; si solo dio los puntos, las filas salen de `ROWS_PER_STITCH_RATIO` con el supuesto `gauge_rows_assumed` (F5-17). La ruta 3D pide el alto objetivo en cm y la lana, o el grosor. Nada de esto lo inventa la IA.
- **Alto del gráfico.** `filas = round(anchoEnPuntos × (altoImagen / anchoImagen) × (filasEn10cm / puntosEn10cm))`. Con la muestra supuesta del grosor 4 el factor es 24 / 18 = 1,333 (F5-14). La fila 0 es la primera que se teje: con `bottom_up` es la fila de abajo de la imagen, y la columna 0 la de la izquierda (el gráfico no se espeja, F5-24).
- **Alto acotado (E-7).** Si las filas pasan de `LIMITS.maxMotifSide` (200), **no se aplasta ni se recorta**: el ancho se reduce para mantener la proporción, a `floor(200 × anchoImagen / altoImagen × puntosEn10cm / filasEn10cm)` (con una imagen cuadrada, `floor(200 × puntos / filas)`: 150 con el grosor 4), y las filas quedan en 200. `ChartFromImage.widthReduced = true` y aparece el supuesto `size_clamped` (F5-19).
- **Fondo y transparencia (E-12).** Un píxel con alfa menor que 128 es **fondo**: pasa al color de fondo, nunca a `NO_STITCH` (en la v1 el gráfico plano es un rectángulo completo). El alfa parcial se compone sobre blanco antes de cuantizar. El color de fondo es el `background` aceptado del asistente de paleta o, si no hay, el color cuantizado con más casillas del borde; se informa con el supuesto `background` (F5-22, F5-23).
- **Colores por fila (E-10).** La v1 genera solo colorwork a hebras. Una fila con más de `maxColorsPerRow` colores (2 por defecto, 3 como opción avanzada con aviso) **se simplifica siempre**: se conservan los `maxColorsPerRow` colores con más casillas de la fila (empate: menor índice) y cada casilla de otro color pasa al conservado más cercano en ΔE2000 (empate: menor índice). Nunca crea una lana nueva. `rowsSimplified` cuenta las filas modificadas y deja el supuesto `rows_simplified` (F5-7 a F5-10).
- **Orden de la conversión**: cuantización a `maxColors` → simplificación por fila → limpieza opcional (`specks` o `floats`) → métricas. Las fusiones del asistente de paleta se aplican después, en la etapa `palette`. Fusionar nunca aumenta los colores de una fila, así que la simplificación sigue valiendo; el código vuelve a aplicar la limpieza elegida y a calcular las métricas sobre el resultado. (La lista de la sección 2 de `casos-dominio-fase-5.md` pone la fusión antes de la simplificación; manda este orden, que es el de las etapas.) Cada paso que cambia algo deja su supuesto, con la cifra que calcula el código.
- **Vista previa en vivo (regla de oro 7).** `image-chart` es puro y corre igual en el navegador y en el servidor, sobre el **mismo raster de trabajo** (PNG sin pérdida que devuelve la subida). Por eso la vista previa y el resultado final son idénticos píxel a píxel (IA-P3). Cambiar el ancho o los colores se refleja en menos de 100 ms, sin llamar a la IA.
- **El asistente de paleta no ve la foto completa**: recibe el gráfico ya cuantizado (una imagen pequeña de la resolución del gráfico), el histograma de colores y la paleta. Así cuesta menos, y el texto incrustado en la foto queda ilegible a esa resolución.
- **El redactor nunca ve la imagen.** Recibe un resumen derivado del documento ya validado y el dialecto de la usuaria (`profiles.pattern_dialect`). El resumen lleva solo etiquetas cualitativas (`lowContrast`, `hasLongFloats`, `manyColors`, `simplified`) y los nombres de color de la paleta, **sin ningún campo numérico** (IA-P1 extendida al resumen, F5-40). **`subject` no se le pasa** (E-6): lo escribió un modelo que vio la foto y es entrada no confiable; solo sirve como título sugerido, después de `checkText` y del filtro de cifras. Lo que el redactor puede y no puede decir está en la sección 8 de [casos-dominio-fase-5.md](../casos-dominio-fase-5.md#8-qué-puede-decir-el-redactor-pregunta-8).
- **Fuera de la v1 de la fase 5**: el explicador de errores, el asistente del editor, el tramado (*dithering*) y las técnicas que el modelo no representa (intarsia, tapestry en el estudio de colorwork).

### 3. Salidas estructuradas

- **Esquemas propios, sin dependencias.** `packages/ai-router/src/schema.ts` es un mini-lenguaje de esquemas, del que salen dos cosas: el validador local y el JSON Schema que se envía a la API. No hay dos definiciones que puedan divergir. Sigue la línea del ADR 0002, aunque `ai-router` no es núcleo.
- **Mecanismo en la API: salida estructurada nativa, `output_config.format`**, con el JSON Schema del agente (enmienda T0-6). No se usa una herramienta forzada: Opus 5.5 y Sonnet 5.5 rechazan `tool_choice` forzado (`any`/`tool`), y conviene un solo mecanismo para toda la escalera. La petición no lleva herramientas. **Manda la validación local**: una garantía del proveedor nunca reemplaza al validador. Un `stop_reason` de corte por tokens o de rechazo cuenta como fallo de esquema.
- **Pensamiento y esfuerzo** (corregido por T3-1). En **Haiku 5.5** el pensamiento se apaga con `thinking: { type: "disabled" }` y esfuerzo ≤ `high`. En **Sonnet 5.5**, `disabled` da 400 y lo mínimo es `between_tools` (sin herramientas, no piensa). En **Opus 5.5** el pensamiento está siempre activo y el esfuerzo por defecto es `medium`. Consecuencias:
  - el pensamiento se cobra como salida y cuenta dentro de `max_tokens`, así que `maxOutputTokens` de cada agente cubre el pensamiento más la respuesta, y la reserva del ADR 0014 se calcula con ese valor: es una cota dura, piense lo que piense el modelo;
  - si el pensamiento agota `max_tokens`, la respuesta llega cortada y cuenta como fallo de forma;
  - el pensamiento nunca se registra ni se muestra: solo vale la salida estructurada;
  - `ModelRequest` lleva un modo de pensamiento abstracto (`"off"` o `"adaptive"`) y el cliente lo traduce por modelo: `"off"` es `disabled` en Haiku y `between_tools` en Sonnet; en Opus no se envía. Al escalar, nunca se reenvía `between_tools` a otro modelo;
  - los esquemas no piden el razonamiento del modelo en ningún campo (evita la categoría de rechazo `reasoning_extraction`, ADR 0014, T3-5).
- **Esfuerzo y `maxOutputTokens` por agente** (T3, aprobados; se confirman con el conjunto de evaluación, R5-22, y en T23):

  | Agente | Base / techo | Pensamiento | Esfuerzo | `maxOutputTokens` | Intentos por etapa |
  |---|---|---|---|---|---|
  | Triaje (`classifier`) | Haiku / Sonnet | Apagado (`disabled` / `between_tools`) | `low` | 600 | 3 |
  | Asistente de paleta | Haiku / Sonnet | Apagado | `low` | 800 | 3 |
  | Redactor, ruta plana | Haiku / Sonnet | Apagado | `low` | 1.500 | 2, después el respaldo |
  | Descomponedor (hito 2) | Sonnet / Opus | Adaptativo (en Opus no se apaga) | `low` | 2.000 | 3 |
  | Redactor 3D (hito 2) | Sonnet / Sonnet | Apagado (`between_tools`) | `low` | 2.000 | 1, después el respaldo |

  - El redactor de la ruta plana y el 3D son **dos agentes distintos** en `AGENT_POLICIES` (hoy hay uno solo, `writer`, con base Sonnet; lo separa T8).
  - Si el conjunto de evaluación muestra que hace falta pensar en el triaje o la paleta, se ajusta en este orden: `maxOutputTokens` **por modelo** (Haiku con más margen cuesta casi nada), después el esfuerzo y al final la composición. Los topes por trabajo no se tocan (ADR 0014, sección 6).
- **Rechazos (`refusal`)**: llegan con HTTP 200, se cobra lo generado y cuentan como fallo de forma. **En la v1 no se usa el respaldo del lado del servidor (`fallbacks`)**: Haiku 5.5 no lo tiene, en Sonnet 5.5 solo cubre categorías que no son de este producto y en Opus 5.5 iría a modelos fuera de la escalera, con un costo que `ai_reserve` no reservó (T3-5).
- **Caché de prompts: apagada en la v1** (T3; ADR 0014, sección 6). Se registran `cache_read_tokens` y `cache_write_tokens` desde el inicio.
- **Imágenes**: `⌈ancho / 28⌉ × ⌈alto / 28⌉` tokens, sin reducción en el servidor del proveedor para los tamaños del pipeline. El cliente envía `transformations: { oversized_image: "error" }` para que una imagen fuera de tamaño falle en vez de reducirse en silencio.
- **Forma de los esquemas.** Enumeraciones cerradas, números con rango, identificadores que se comprueban contra los datos del trabajo, arreglos con tope, textos con tope de largo, `additionalProperties: false`. Ninguno tiene campos de conteo.

```ts
// packages/ai-router/src/agents.ts (contrato; lo implementa ia-pipeline en T8)
export interface TriageOutput {
  allowed: boolean;
  reasons: Array<"sexual" | "violence" | "hate" | "self_harm" | "minor" | "identifiable_person" | "third_party_ip" | "personal_document" | "other">; // ≤ 4; third_party_ip: E-5, provisional hasta T1c
  hasEmbeddedText: boolean;
  containsPeople: boolean;
  fit: "good" | "poor" | "unsuitable";           // para la ruta que eligió la usuaria
  complexity: 1 | 2 | 3 | 4 | 5;
  subject: string;                                // ≤ 60 caracteres, solo para el título sugerido
}

export interface PaletteOutput {
  merges: Array<{ from: number; into: number }>;  // índices de colores del gráfico cuantizado; ≤ 8
  background: number | null;                      // índice de color, o null
  // Sin suggestedWeight (E-1): el grosor es un parámetro previo a chart_compute.
  suggestedFibers: Array<{ fiber: string; percent: number }>; // ids de FIBER_IDS; suma 100; ≤ 3; vacío si no aplica; solo cambia el render
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
  assumptions: string[];                          // ≤ 10 × 200; se suman a los supuestos deterministas (E-11: los de código van primero y mandan)
}
```

### 4. Validación y reintentos con escalamiento

Tres niveles, en este orden:

1. **Forma**: el validador del esquema (tipos, rangos, enumeraciones, largos, claves desconocidas).
2. **Propuesta**: comprobaciones referenciales y de dominio sobre lo que propuso la IA. Por ejemplo, que los índices de color existan, que no haya ciclos en `attach`, que `main` exista, que `aspect` esté en el rango del tipo, y el ΔE de las fusiones. Para el redactor, además, `checkText` y el **filtro de cifras** (E-8), con las seis reglas de la sección 7 de [casos-dominio-fase-5.md](../casos-dominio-fase-5.md#7-filtro-de-cifras-pregunta-7): (1) ningún número, en cifras o en palabras, a menos de 3 palabras de un término de tejido; (2) ninguno junto a una unidad de medida o de cantidad (`cm`, `m`, `g`, `ovillos`, `horas`, `%`, `colores`…); (3) ninguna referencia a una fila o vuelta concreta (ordinales y `V12`, `R5`, `rnd 3`), salvo "primera" y "última" sin número; (4) ninguna cantidad implícita (`doble`, `mitad`, `cada dos`…) junto a un término de tejido; (5) sin URL ni correos; (6) sin marcas. Normaliza antes de comparar (NFKC, minúsculas, sin espacios duros ni de ancho cero). La lista de términos sale de `glossary` en los tres dialectos, más la semilla de T1, y una prueba comprueba que cubre cada entrada (IA-P6). Esos números son del motor (regla de oro 2). El filtro es la segunda barrera: la primera es que el redactor **no ve** los conteos.
3. **Motor**: `validatePrimitivePlan`, `planToWritten` y `validatePattern` del documento armado.

Política (la implementa `selectModel` en T8, que corrige el escalamiento al primer fallo):

- **Fallo de forma** (niveles 1 y 2): un reintento con el mismo modelo, con los códigos del validador como corrección. Si vuelve a fallar, sube un peldaño.
- **Rechazo del motor** (nivel 3): sube un peldaño directamente.
- **Reglas de composición (enmienda T3-2, aprobada)**:
  1. **Como máximo dos intentos con el mismo modelo por etapa.** Si después del segundo la subida pasaría el techo (`ceiling`), la etapa termina agotada: no hay un tercer intento en el mismo modelo.
  2. **Opus una sola vez por etapa.** Un fallo en Opus agota la etapa, sea de forma o del motor. Nunca se baja de peldaño para seguir intentando.
  3. **Redactor 3D: un solo intento** en Sonnet y, si falla, el respaldo determinista (T3-3). El redactor de la ruta plana tiene dos (Haiku, Haiku) y después el respaldo.
- **Topes**: 3 intentos por etapa (2 para el redactor de la ruta plana, 1 para el redactor 3D), `MAX_ESCALATIONS_PER_JOB = 2` (sin cambios) y el **tope de costo por trabajo** del ADR 0014. Una complejidad de 4 o más sube un peldaño desde el inicio, pero no se salta el tope de costo, y así un texto incrustado que infle la complejidad no puede disparar el gasto.
- **Ramas que quedan** (H, S y O son Haiku, Sonnet y Opus): triaje H, H, S; paleta H, H, S (o S, S con complejidad ≥ 4); redactor plano H, H; descomponedor S, S, O (u O con complejidad ≥ 4); redactor 3D S. Con los `maxOutputTokens` de la sección 3, el peor caso es **USD 0,0401 en la ruta plana** (tope 0,05) y **USD 0,1446 en la 3D** (tope 0,15) (ADR 0014, sección 6). `jobCapUSD` recorre todas las ramas y se queda con la mayor (CA5-B9).
- **`ceiling` y `freeCeiling`**: `jobCapUSD` se calcula con `ceiling`, que es la cota superior. Hoy `AGENT_POLICIES` limita en el plan `free` el triaje y la paleta a Haiku y el descomponedor a Sonnet, y el producto no tiene planes pagos. T8 decide qué `plan` pasa `runStage`; si es `free`, las ramas reales son más baratas que las de arriba y Opus no se usa nunca, lo que hay que decir aquí por enmienda.
- **Agotado**: qué se entrega lo fija la decisión 9 de la fase 5, aprobada en su opción (a) (enmienda T0-9):
  - si el documento es `savable` pero no `valid`, se entrega como **borrador con advertencias**, etiquetado, y "Tejer" queda bloqueado hasta que sea `valid` (ADR 0006, E10);
  - si no es `savable`, o la etapa que falló es el triaje o la descomposición, no hay patrón: se devuelve el cupo a la usuaria y se le dice qué cambiar (menos colores, otro recorte, la otra ruta).
- **El redactor nunca bloquea la entrega**: si se agota (o se le niega la reserva), las notas salen de `pattern-render` (`describeWritten` o el resumen del gráfico) con el aviso "Notas generadas sin IA".
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
- **`schemaVersion: 3` mínima (S1).** Agrega solo `Origin.assumptions?: string[]` (≤ 20 × 200 caracteres, revisados por `checkText`), y nada más. La migración v2 → v3 es la identidad más el número; la regla de compatibilidad y las propiedades M1 a M4 son las del ADR 0011, sección 5. `motor-patrones` la implementa en T6b. Despliegue en dos pasos si ya hubo puesta en público (ADR 0011, sección 5). Los supuestos deterministas los escribe el código, no el redactor (E-11). En la ruta plana son los de la tabla de la sección 6 de [casos-dominio-fase-5.md](../casos-dominio-fase-5.md#6-textos-de-los-supuestos-pregunta-6), cada uno con un código estable (`gauge_assumed`, `gauge_rows_assumed`, `gauge_colorwork_note`, `weight_assumed`, `size_target`, `size_clamped`, `colors_reduced`, `colors_merged`, `colors_palette`, `background`, `rows_simplified`, `specks_removed`, `floats_split`, `floats_long`, `worked_in`, `swatch_reminder`, `ai_fibers`), con sus cifras sacadas del resultado del motor, en ese orden y con concordancia de número. El documento guarda solo los textos (`string[]`); los códigos viven en `ChartFromImage.assumptionCodes` y en `ai_jobs.warnings`. Si se pasara el tope de 20, se fusionan primero `worked_in` y `background`, nunca los de muestra ni de simplificación (F5-30). Los del redactor van después y no pueden desplazar a los del código.
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

- **Invocación.** El navegador llama a `https://<proyecto>.supabase.co/functions/v1/<función>` con su token de acceso. Cada función verifica el JWT y además llama a `auth.getUser()`, que es **obligatorio** y no una defensa adicional (E-T2-4): con `verify_jwt = true`, la plataforma deja pasar la clave publicable (`sb_publishable_…`) sin autenticar a nadie ([Authorization headers](https://supabase.com/docs/guides/functions/auth-headers)). Sin un usuario de `auth.getUser()`, 401. Las peticiones con un `Origin` fuera de la lista permitida (`https://loopitalab.cl` y `http://localhost:3000` en desarrollo) se rechazan, y CORS se restringe a la misma lista. `connect-src` de la CSP ya incluye el dominio de Supabase (P3.1).
- **Secretos.** `ANTHROPIC_API_KEY` vive solo en los secretos de las Edge Functions (`supabase secrets set`), nunca en el Worker, en GitHub ni en el repositorio. En la CI no hay clave: se usa `FakeModelClient` (sección 8).
- **Avance por pasos (P1).** `avanzar` toma el arriendo del trabajo (`lease_until`, ADR 0014), ejecuta **una** etapa con a lo más una llamada al modelo (tiempo límite de 90 s por llamada, dentro de los 150 s de reloj), persiste el resultado y devuelve `{ stage, status, progress }`. El navegador vuelve a llamar hasta llegar a un estado terminal. Cerrar la pestaña deja el trabajo en pausa; `ia-mantenimiento` lo vence a los 15 minutos sin avance, libera las reservas y devuelve el cupo. Si la usuaria vuelve antes, lo retoma desde la última etapa guardada.
- **Presupuesto de CPU por invocación**: decodificar el raster PNG de ≤ 1024 px, más `rasterToChart` (≤ 200 × 200 celdas), más `validatePattern`, debe quedar con p99 bajo 500 ms. Eso deja margen de 4 veces sobre los 2 s. **Medido en T2, desplegado: p99 de 81 ms** (con un sustituto de `rasterToChart`; T7 tiene su propia meta de < 30 ms en Node).
- **Puerta de viabilidad T2: pasó (2026-11-16)** ([qa-fase-5.md, Puerta T2](../qa-fase-5.md#puerta-t2)). Los imports del monorepo (`.ts` y JSON con atributos) y los códecs de jSquash funcionan con el empaquetado del servidor, la prueba cruzada Node/Deno de `resizeArea` da los mismos bytes desplegada, y el CPU y los límites caben con margen. No hace falta volver a T0 ni a la opción N.
- **Límites oficiales del plan gratuito** (documentación de Supabase, consultada el 2026-11-16: [Edge Functions limits](https://supabase.com/docs/guides/functions/limits), [pricing](https://supabase.com/docs/guides/functions/pricing) e [invocations](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations)): **2 s de CPU** por petición (sin la E/S asíncrona), **150 s de reloj**, **256 MB de memoria**, **500.000 invocaciones al mes** (cuentan también los errores) y un tamaño de función de **20 MB empaquetada con la CLI y 5 MB empaquetada en el servidor** (API de gestión o MCP). El cuerpo de la petición no está documentado: desplegado, 10 MB pasan y 12,5 MB fallan (ADR 0013, R5-8).
- **Despliegue (E-T2-2).** Las funciones se despliegan con un **paso de empaquetado** (`scripts/t2/empaquetar.ts`, que T11 generaliza a `scripts/empaquetar-funcion.ts`): copia los paquetes del monorepo a `vendor/` con la misma estructura, reemplaza `@loopitalab/*` por rutas relativas y quita tipos y comentarios. El paquete **se prueba en local** con `supabase functions serve --workdir` en un directorio aislado **antes de subirlo**, y la CI puede verificarlo con el edge-runtime en Docker. Se despliega con el MCP o con la API (`functions deploy --use-api`); la alternativa es `supabase functions deploy` desde la CI con un token como secreto de GitHub. Cierra R5-2.

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
  effort: "low" | "medium" | "high";  // por agente (sección 3); T3: "low" en los cinco agentes
  thinking: "off" | "adaptive";       // el cliente lo traduce por modelo (sección 3); en Opus, "off" no se envía
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
  widthStitches: number;              // 8..LIMITS.maxMotifSide (E-2; antes 4); aviso bajo 20 (F5-21)
  gauge: Gauge;                       // real o supuesta del grosor (la marca la pone quien llama)
  weight: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; // obligatorio (E-1); por omisión 4 con weight_assumed, lo decide quien llama
  maxColors: number;                  // 2..8, por omisión 4 (E-2, F5-1); fuera de rango lanza
  maxColorsPerRow: 2 | 3;             // por omisión 2; 3 con aviso (E-2, F5-6); otro valor lanza
  cleanup: "none" | "specks" | "floats"; // por omisión "none"; nunca se activa sola (E-2, sección 3 de T1)
  workedIn: "rows" | "rounds";        // por omisión "rows" (E-2); cambia la hebra que cierra la vuelta (F5-13)
  maxFloatStitches: number;           // de floatLimitStitches (pattern-core); image-chart no duplica la regla (E-3)
  mapToPalette: boolean;              // true: color de la paleta propia; false: hex cuantizado
  direction: "bottom_up" | "top_down";
}
export type AssumptionCode =
  | "gauge_assumed" | "gauge_rows_assumed" | "gauge_colorwork_note" | "weight_assumed"
  | "size_target" | "size_clamped" | "colors_reduced" | "colors_merged" | "colors_palette"
  | "background" | "rows_simplified" | "specks_removed" | "floats_split" | "floats_long"
  | "worked_in" | "swatch_reminder" | "ai_fibers";                       // E-11
export interface ChartFromImage {
  width: number; height: number; cells: number[];  // índices de color, fila 0 = primera que se teje
  colors: Array<{ hex: string; paletteId?: string; deltaE?: number; share: number }>;
  colorsPerRow: number[];             // cada valor ≤ maxColorsPerRow (F5-44)
  background: number;                 // índice del color de fondo (E-12)
  widthReduced: boolean;              // E-7: el alto pasaba de maxMotifSide y se redujo el ancho (antes clampedHeight)
  requestedWidth: number;             // el ancho pedido, para el supuesto size_clamped
  sourceColors: number;               // colores efectivos antes de reducir, para colors_reduced (F5-2)
  metrics: {                          // E-4: las calcula el código, nunca la IA
    noiseRatio: number;               // casillas aisladas / total
    floatRowRatio: number;            // filas con hebra > maxFloatStitches / filas
    rowsSimplified: number;           // filas simplificadas (cantidad; la razón la calcula quien decide)
    quantError: number;               // ΔE2000 medio ponderado por casilla
    cellsChanged: { specks: number; floats: number };
  };
  assumptionCodes: AssumptionCode[];  // en el orden de la tabla de T1; los textos los arma el orquestador
}
export type ChartVerdict = { level: "ok" | "warn" | "block"; reasons: Array<keyof ChartFromImage["metrics"] | "single_color"> };
export function chartVerdict(c: ChartFromImage): ChartVerdict; // umbrales de la sección 1.2 de T1, "validar con tejedora"
export function rasterToChart(r: Raster, p: ChartFromImageParams): ChartFromImage;
export function detectExactRepeat(c: ChartFromImage): { motifWidth: number; motifHeight: number; x: number; y: number } | null;
```

```ts
// packages/pattern-core/src/validate.ts (contrato nuevo, E-3; lo implementa motor-patrones en T7)
// Extrae la fórmula que hoy está en línea en validatePattern:
// max(1, min(floor(maxFloatCm × puntos en 10 cm / 10 + 1e-9), cap)), con cap = 5 y maxFloatCm = 2,5 por omisión.
// validatePattern pasa a usarla, así que el validador y image-chart no pueden divergir.
// No se llama maxFloatStitches para no chocar con la opción homónima de ValidateOptions.
export function floatLimitStitches(gauge: Gauge | null, opts?: Pick<ValidateOptions, "maxFloatStitches" | "maxFloatCm">): number;
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
- **IA-P6.** El filtro de cifras rechaza todo texto generado con "N pb", "N pts", "V12" y similares del glosario, y acepta textos sin cifras de puntos. Para cada término `t` del glosario y cada `n` de 1 a 200, `"{n} {t}"` y `"{t} {n}"` se rechazan (F5-35).
- **IA-P7** (E-3). Con `cleanup: "floats"`, `validatePattern` del documento generado no da `CHART_FLOAT_LONG` en ninguna fila, también con `workedIn: "rounds"`, y el conjunto de colores no cambia (F5-12, F5-13).
- **IA-P3, ampliada** (E-10). Además, todo valor de `colorsPerRow` es ≤ `maxColorsPerRow`, simplificar nunca aumenta `colors.length`, y con `widthReduced` la proporción en cm del gráfico coincide con la de la imagen dentro del redondeo (F5-18, F5-19).

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
| R5-1 | Los límites del plan gratuito de Edge Functions (CPU, reloj, cuerpo de la petición, tareas de fondo) no son los que asume este ADR | **Cerrado (T2, 2026-11-16).** Límites oficiales confirmados (sección 7) y medidos desplegados: CPU p99 de unos 0,24 s en la subida y 81 ms en la etapa, bajo 1 s y 500 ms. Las tareas de fondo no se usan (P1). Queda como vigilancia: T11 y T20 repiten la medición con el código real (CA5-P4) |
| R5-2 | Deno no resuelve los imports del monorepo (`.ts` fuera de `supabase/functions`, JSON con atributos) al desplegar | **Cerrado (T2, 2026-11-16).** El empaquetado en el servidor no sigue rutas fuera de la función, así que se adopta el paso de empaquetado que copia los paquetes, probado en local antes de subir y desplegado con éxito (E-T2-2) |
| R5-3 | Los precios, los ID y la salida estructurada quedaron verificados el 2026-11-16. Quedaba la regla de tokens de imagen, la caché y cuánto pensamiento gasta cada etapa | **Mitigado (T3, 2026-11-16).** Verificados la regla de imagen, la caché (apagada) y el pensamiento: se apaga en Haiku 5.5 (`disabled`) y en Sonnet 5.5 (`between_tools`); en Opus 5.5 está siempre activo. `maxOutputTokens` es la cota dura de la reserva. **Sigue abierto** el pensamiento real por etapa, que no se midió (sin llamadas a la API): conjunto de evaluación (R5-22) y T23 |
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
  - ~~el pensamiento no se puede desactivar en Opus 5.5 ni en Haiku 5.5~~ **(corregido por T3-1)**: el pensamiento se apaga en Haiku 5.5 con `disabled` (esfuerzo ≤ `high`); en Sonnet 5.5 lo mínimo es `between_tools`; en Opus 5.5 está siempre activo y el esfuerzo por defecto es `medium`. `maxOutputTokens` incluye el pensamiento y `ModelRequest` lleva `effort` y `thinking` (secciones 3 y 8);
  - T3 verificó la regla de tokens de imagen, la caché y el pensamiento (enmiendas T3-n). El pensamiento real por etapa se mide en el conjunto de evaluación y en T23.
- **T0-7 (decisión 7, opción a).** `FakeModelClient` en la CI y en el desarrollo; una sola prueba real con un tope total de USD 2, en dos corridas (T23 y T23-3D; ADR 0014, sección 6).
- **T0-9 (decisión 9, opción a).** Lo que se entrega al agotar los reintentos queda como estaba en la sección 4.
- **T0-10 (decisión 10, opción b).** En la v1, el triaje rechaza las imágenes cuyo tema principal es una persona identificable: `identifiable_person` en `reasons` lleva a `rejected`/`moderation` por regla fija, sin importar `allowed`. Hasta la revisión legal (sección 1).
- **T0-11 (decisión 11, opción a).** Solo la lista permitida, al principio solo la cuenta de la usuaria (ADR 0014).
- **T0-12 (decisión 12, opción a).** Duplicar en la fase 5 (T10), detrás de la bandera `LOOPITA_AI_DUPLICATE_ENABLED`, que se enciende con la revisión legal B3 (sección 6).

## Enmiendas por el grupo A del hito 1 (T1, T2 y T3, 2026-11-16)

Registradas por `arquitecto` el 2026-11-16 con los resultados de T1 (`experto-tejido`, [casos-dominio-fase-5.md](../casos-dominio-fase-5.md), commit `417dd2a`), T2 (`devops`, [qa-fase-5.md, Puerta T2](../qa-fase-5.md#puerta-t2), commits `04f8427` y `e3ee051`) y T3 (`ia-pipeline`, [README de `ai-router`](../../packages/ai-router/README.md#datos-verificados-de-la-api-t3-2026-11-16) y ADR 0014, enmiendas T3-1 a T3-5, commit `578985a`). Los ID E-n son los del anexo de `casos-dominio-fase-5.md`; E-13 a E-16 están en el ADR 0013.

### Por T1 (dominio de la ruta plana)

- **E-1. Grosor antes del cálculo.** El grosor es un parámetro **obligatorio** de la ruta plana, decidido **antes** de `chart_compute`, porque fija la muestra supuesta y con ella el alto. Si la usuaria no lo elige, vale **4**, marcado con el supuesto visible `weight_assumed` (regla de oro 6). Se **quita `suggestedWeight` de `PaletteOutput`**: dejarlo en el asistente obligaría a recalcular el gráfico después de la IA. `suggestedFibers` se queda, porque solo cambia el render, y lleva el supuesto `ai_fibers`. Cambian las secciones 1, 2, 3 y 8.
- **E-2. Parámetros nuevos de `ChartFromImageParams`**: `weight` (E-1), `maxColorsPerRow: 2 | 3` (por omisión 2), `cleanup: "none" | "specks" | "floats"` (por omisión `none`), `workedIn: "rows" | "rounds"` (por omisión `rows`) y `maxFloatStitches` (E-3). `widthStitches` va de **8** a 200 (antes 4), con aviso bajo 20. `maxColors` de 2 a 8, por omisión 4. Los valores fuera de rango lanzan; los controles de la interfaz ya los impiden. Sección 8.
- **E-3. `image-chart` no duplica la regla de hebras.** `pattern-core` exporta `floatLimitStitches(gauge, opts)` con la fórmula que hoy vive en línea en `validatePattern`, y el validador pasa a usarla. `image-chart` recibe el resultado como parámetro y sigue sin depender de `pattern-core` en tiempo de ejecución. Se agrega la propiedad **IA-P7**. El nombre propuesto por T1, `maxFloatStitches`, choca con la opción homónima de `ValidateOptions`, y por eso cambia.
- **E-4. Métricas y veredicto.** `ChartFromImage` lleva `metrics` (`noiseRatio`, `floatRowRatio`, `rowsSimplified`, `quantError` y las casillas cambiadas por la limpieza) y `assumptionCodes`. Las calcula el código, nunca la IA. `chartVerdict` aplica los umbrales de aviso y de bloqueo de la sección 1.2 de T1, todos "validar con tejedora" y calibrados con las imágenes de prueba. Regla: **el peor de los dos manda**: el triaje puede agravar (`unsuitable`), nunca relajar un bloqueo del código. Con bloqueo por métricas, la vista previa se muestra igual y "Crear" queda deshabilitado (no se llama a `iniciar`).
- **E-5. Triaje: `third_party_ip`.** Se agrega a `reasons` para logotipos y personajes de marcas o franquicias conocidas. **Decisión provisional de `arquitecto`, hasta la revisión legal T1c**: en la v1 rechaza por regla fija, como `identifiable_person` (`rejected`/`moderation`), con un mensaje neutral. Es la opción conservadora; T1c puede relajarla. `containsPeople = true` sin `identifiable_person` **no** rechaza. **Sobre el cupo**: T1 pidió documentar que `fit: "unsuitable"` lo devuelve, pero el ADR 0014 (sección 1, aprobado por la usuaria) dice que `rejected` **no** lo devuelve, porque la IA sí se usó. Se mantiene el ADR 0014: devolverlo haría gratis e ilimitado el triaje para una usuaria, y el tope diario es global (R5-21). Las métricas del código, que se ven antes de gastar el intento, filtran la mayoría de los casos. Si la usuaria prefiere devolverlo, es una enmienda del ADR 0014.
- **E-6. `subject` no pasa al redactor.** Solo sirve como título sugerido, después de `checkText` y del filtro de cifras (sección 2).
- **E-7. Alto acotado.** Si las filas pasan de 200, se reduce el ancho para mantener la proporción, sin aplastar ni recortar. `clampedHeight` se renombra **`widthReduced`**, con `requestedWidth`, y lleva el supuesto `size_clamped`. La fórmula del anexo de T1, `floor(200 × puntos10cm / filas10cm)`, es la de una imagen cuadrada; la general incluye la proporción de la imagen (sección 2).
- **E-8. Filtro de cifras.** La expresión regular de la sección 4 se reemplaza por las seis reglas de la sección 7 de T1, con normalización Unicode y la lista sacada de `glossary` en los tres dialectos. Mínimo de 40 casos de rechazo y 20 de aceptación (CA5-V4).
- **E-9. `MERGE_MAX_DELTA_E`.** El valor sugerido es **10**, no 2,3 (`NEAR_COLOR_DELTA_E` es la diferencia apenas perceptible entre dos muestras juntas, no la de la tela). Lo fija `catalogo-lanas` en T7 y se valida en T1b (ítem 2).
- **E-10. Simplificación por fila.** `chart_compute` simplifica a `maxColorsPerRow` (regla determinista de F5-7) antes del asistente de paleta, con el supuesto `rows_simplified`. La v1 genera solo colorwork a hebras: 2 por fila por defecto, 3 con aviso, nunca 4 o más. Intarsia sigue fuera de alcance.
- **E-11. Supuestos con código estable.** Lista de 17 códigos de la sección 6 de T1, en ese orden, con cifras del motor, ≤ 20 textos de ≤ 200 caracteres. Los textos son provisionales: los revisa `documentador` (T19) y la ronda T1b.
- **E-12. Fondo.** Alfa menor que 128 es el color de fondo, nunca `NO_STITCH`; el alfa parcial se compone sobre blanco antes de cuantizar.

### Por T2 (puerta de viabilidad)

- **La puerta pasa** (2026-11-16, proyecto desechable en us-west-1, borrado al terminar). En la subida, CPU p99 de unos 0,24 s (criterio < 1 s); en la etapa, p99 de 81 ms (criterio < 500 ms); `validatePattern` de 200 × 200 con p99 de 3 a 6 ms. El cuerpo tolera hasta 10 MB y falla en 12,5 MB. Los imports del monorepo y los códecs de jSquash funcionan con el empaquetado del servidor. Se confirma la opción E (T0-5) sin volver a la usuaria. Cierra R5-1 y R5-2.
- **Límites oficiales del plan gratuito** registrados en la sección 7, con su fuente.
- **E-T2-2. Despliegue con paso de empaquetado**, probado en local con `supabase functions serve --workdir` antes de subir (sección 7).
- **E-T2-4. `auth.getUser()` obligatorio en cada función** (sección 7). Lo revisa `revisor-seguridad` en T21.
- E-T2-1 (el `.wasm` embebido) y E-T2-3 (bucket de 5 MB) están en el ADR 0013.

### Por T3 (datos de la API)

- **T3-1. Corrección del pensamiento.** El pensamiento de Haiku 5.5 **sí se puede apagar** (`disabled` con esfuerzo ≤ `high`). En Sonnet 5.5 lo mínimo es `between_tools`. En Opus 5.5 está siempre activo y el esfuerzo por defecto es `medium`. Corrige la nota del inicio, la sección 3, R5-3 y T0-6.
- **T3-2. Reglas de reintento: aprobadas por `arquitecto`.** Como máximo dos intentos con el mismo modelo por etapa; Opus una sola vez por etapa; el redactor 3D con un intento y después el respaldo determinista (sección 4). Con ellas, el peor caso es USD 0,0401 en la ruta plana y 0,1446 en la 3D, bajo sus topes. **Por qué son coherentes con este ADR**:
  - la primera hace explícito lo que la sección 4 ya decía ("un reintento con el mismo modelo; si vuelve a fallar, sube un peldaño") y cierra el hueco del techo: sin ella, una etapa en su techo podía gastar el tercer intento en el mismo modelo (paleta S, S, S, 0,0539 > 0,05);
  - la segunda no contradice el tope de 3 intentos ni `MAX_ESCALATIONS_PER_JOB`: solo los acota más. Opus solo aparece en el descomponedor (hito 2), donde S, S, O ya respeta los 3 intentos;
  - la tercera respeta "el redactor nunca bloquea la entrega": el respaldo de `pattern-render` siempre existe;
  - las tres son deterministas y verificables por propiedades (CA5-R2, CA5-R4 y CA5-B9), sin tocar los topes aprobados por la usuaria.
  
  **Consecuencia aceptada**: en la ruta 3D con complejidad ≥ 4, el descomponedor empieza en Opus y tiene **un solo intento**. Si falla, no hay patrón y se devuelve el cupo (sección 4, decisión 9). Se mide en T23-3D; si la tasa de fallos es alta, la alternativa es bajar la complejidad que sube de peldaño, no agregar intentos en Opus.
- **T3-3. Redactor 3D en un intento.** Se adopta para `jobCapUSD`. La alternativa de un segundo intento en Haiku (+USD 0,0013) queda para decidir en T1-3D o T8-3D, y no afecta al hito 1.
- **Esfuerzo y `maxOutputTokens` por agente**: tabla de la sección 3. `ModelRequest` lleva `effort` y `thinking` (sección 8).
- **T3-5. Sin respaldo del servidor ante `refusal` en la v1**; `refusal` cuenta como fallo de forma y se liquida por la `usage` real (sección 3).
- **Caché apagada en la v1** (sección 3; ADR 0014, sección 6).
- **Corte externo** (ADR 0014, T3-4): límite de gasto mensual del espacio de trabajo de producción en **USD 5**, igual a `monthly_cap_usd`, y el conjunto de evaluación en **otro espacio de trabajo con su propio límite** (R5-22).
