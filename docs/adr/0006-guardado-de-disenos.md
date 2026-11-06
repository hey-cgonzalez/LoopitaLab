# ADR 0006: Guardado de diseños del estudio

- Estado: aceptado (aprobado por la usuaria el 2026-11-05). Enmendado el 2026-11-06 ([E10](#enmienda-e10-2026-11-06-guardar-borradores-con-errores-de-tejido): se guardan borradores con errores de tejido; [E11](#enmienda-e11-2026-11-06-revisión-de-t4): revisión de T4, tope de tamaño y patrones de IA)
- Fecha: 2026-11-05
- Paquetes: `apps/web`, `supabase/`
- Relacionado: [ADR 0001](0001-modelo-canonico.md), [ADR 0003](0003-colorwork-en-esquema-v1.md), [docs/seguridad.md](../seguridad.md)

## Contexto

El estudio de colorwork (fase 2) crea y edita patrones con frecuencia. El esquema actual ya tiene:

- `patterns`, con el `document` completo, columnas de búsqueda que deben coincidir con él, límite de 2 MB y RLS;
- `pattern_versions`, inmutable, que se escribe solo con `snapshot_pattern()` y tiene un tope de 200 versiones.

Hay que decidir:

- cómo se guarda sin perder trabajo ni pisar ediciones de otro dispositivo;
- dónde se valida;
- si hace falta una migración.

## Decisión

### Cabe en el esquema actual

Un diseño de colorwork se guarda como una fila de `patterns` con `kind = 'chart'`, `technique = 'knit'`, `origin = 'manual'` y `visibility = 'private'`. No hacen falta tablas nuevas.

### Una migración menor recomendada

`patterns.title` duplica `document.title` y la restricción de consistencia no los compara. Para respetar la fuente única de verdad, `backend-supabase` agrega `document ->> 'title' = title` a `patterns_document_consistent`.

La migración es segura: hoy la interfaz no crea patrones. Si existiera alguna fila, la migración la alinea antes de recrear la restricción. El validador agrega `TITLE_LENGTH` (ADR 0003).

### Flujo de guardado

1. **Crear**:
   - Server Action `createChartPattern(input)`;
   - `newChartPattern`, luego `validatePattern` en el servidor y luego `insert`;
   - devuelve `id` y `updated_at`.
2. **Autoguardado**: el cliente guarda 2 s después de la última edición, al cambiar de pestaña y antes de salir.
   - Server Action `savePattern(id, document, expectedUpdatedAt)`:
     - pasa el documento por `migratePattern` y `validatePattern`;
     - si hay **errores**, se rechaza el guardado (las advertencias se aceptan). *Desde E10: solo los errores estructurales (`savable: false`); los errores de tejido se aceptan;*
     - si no, hace `update … where id = $id and updated_at = $expectedUpdatedAt`.
   - Si no se actualizó ninguna fila, es un **conflicto** (otro dispositivo o pestaña guardó antes). La interfaz ofrece recargar o sobrescribir; sobrescribir es una acción explícita.
3. **Respaldo local**: el último documento sin guardar se conserva en `localStorage` de la usuaria, para recuperarlo si se pierde la conexión. Se borra al guardar bien.
4. **Versiones**:
   - `snapshot_pattern()` se llama **solo** con "Guardar versión" (con nombre opcional) y, desde la fase 3, al empezar un proyecto, para fijar `projects.pattern_version`;
   - nunca en el autoguardado, para no consumir el tope de 200.
5. **Lectura**: todo documento que se abre pasa por `migratePattern` y `validatePattern`. Los ajenos ya siguen esa regla (B1, `apps/web/src/lib/shared-pattern.ts`).

### Límites y tamaño

- **Tamaño máximo**: en la fase 2, la interfaz limita el motivo a 200 × 200 celdas. `LIMITS.maxCells` (250.000) no cambia, porque protege al validador.
- **Pruebas que hace `backend-supabase`**:
  - el peor caso de documento de la interfaz (200 × 200, 32 lanas, celdas aleatorias) cabe en `pg_column_size(document) <= 2000000` y en el límite del cuerpo de las Server Actions de Next.js;
  - si no cabe, se ajusta el límite del cuerpo o se adelanta la codificación compacta de `cells` (ADR 0003, sección 6).
- **Miniaturas**: en la fase 2, la lista "Mis diseños" muestra título, forma, tamaño y fecha, sin miniatura, porque leer documentos completos en una lista es caro. Las miniaturas serán un derivado regenerable en caché. Su diseño se registra cuando se construyan.

## Alternativas descartadas

- **Versión en cada guardado**: agota el tope de 200 en una tarde de trabajo y llena el almacenamiento.
- **Guardar documentos con errores como borrador**: un documento inválido en `patterns` contamina todas las vistas derivadas. Las operaciones de `edit.ts` no producen errores estructurales; el único caso posible (gráfico sin puntos) se informa sin guardar. *Precisado por E10: se descarta guardar documentos con errores **estructurales**. Los errores de tejido no contaminan los derivados y sí se guardan.*
- **Validar solo en el cliente**: el cliente no es confiable; el servidor siempre valida.
- **Tiempo real o CRDT entre dispositivos**: no se justifica en v1. Basta con la concurrencia optimista con `updated_at`.

## Consecuencias

- Una sola migración menor en la fase 2 (consistencia del título).
- Las Server Actions de guardado pasan por `revisor-seguridad`: validan en el servidor, ponen límites de tamaño y solo permiten guardar patrones propios (RLS).
- El modo tejiendo (fase 3) siempre trabaja sobre una versión fija del patrón. Pendiente para la fase 7: hoy `pattern_versions` y `snapshot_pattern()` solo sirven a la dueña. Un proyecto sobre un patrón público ajeno necesitará otra forma de fijar la versión.

## Enmienda E10 (2026-11-06): guardar borradores con errores de tejido

La decisión de fondo está en la [enmienda E10 del ADR 0003](0003-colorwork-en-esquema-v1.md#e10-errores-estructurales-y-errores-de-tejido). Resumen: `CHART_SHAPING_IMPOSSIBLE` pasa a advertencia (criterio de `experto-tejido`), y `validatePattern` distingue los **errores estructurales** de los **errores de tejido** (`DRAFT_ERROR_CODES`: hoy `CHART_EMPTY` y `CHART_ROW_EMPTY_FULL`). El resultado trae `valid` (sin ningún error) y `savable` (sin errores estructurales).

**Por qué cambia este ADR.** El flujo original rechazaba todo documento con errores. El estado normal de una cuña o de un motivo a medio dibujar (una vuelta vaciada para volver a pintarla) habría dejado el autoguardado bloqueado por minutos, con el trabajo solo en `localStorage`.

### Qué bloquea qué

| Acción | Error estructural | Error de tejido | Advertencia o información |
|---|---|---|---|
| Autoguardado (`savePattern`) | Bloquea | Se guarda | Se guarda |
| Crear (`createChartPattern`) y duplicar | Bloquea | Se guarda (solo al duplicar un borrador; `newChartPattern` no produce errores de tejido) | Se guarda |
| "Guardar versión" (`snapshot_pattern()`) | No ocurre (la fila ya es `savable`) | Se guarda; la lista de versiones la marca "borrador con errores" | Se guarda |
| "Tejer este diseño" (fase 3: proyecto y versión fija) | Bloquea | **Bloquea** | Permite |
| Publicar o compartir por enlace (`visibility ≠ private`, fase 7) | Bloquea | **Bloquea** | Permite |
| Exportar a PDF (fase 7) | Bloquea | **Bloquea** | Permite |
| Aceptar una salida de IA (fase 5, regla de oro 3) | Bloquea | **Bloquea** (se reintenta o se devuelve con advertencias explícitas) | Permite |
| Mostrar un patrón ajeno (`shared-pattern.ts`, B1) | Bloquea | Bloquea (sin cambio: exige `valid`) | Permite |

### Flujo de guardado actualizado

- **`savePattern(id, document, expectedUpdatedAt)`**: la firma no cambia.
  1. `migratePattern`: si `ok` es `false`, rechaza (estructural).
  2. `validatePattern` **sin opciones** (el invariante de E10 garantiza que las opciones no cambian los errores, así que el servidor y el cliente llegan al mismo `savable`).
  3. Si `savable` es `false`, rechaza y devuelve solo los errores estructurales.
  4. Si no, `update … where id = $id and updated_at = $expectedUpdatedAt`, igual que antes.
  5. Devuelve `{ ok: true, updatedAt, draft: !valid }`. `draft` le sirve a la interfaz para el estado del guardado ("Guardado como borrador: tiene errores que impiden tejerlo").
- **`expectedUpdatedAt`**: no cambia. Como el autoguardado ya no se detiene mientras se dibuja, `updated_at` avanza con normalidad y los conflictos entre pestañas o dispositivos se detectan a los 2 s, no al terminar la cuña. Esto reduce el riesgo R7.
- **Respaldo local**: vuelve a ser solo para cortes de conexión y para un rechazo estructural, que no debería ocurrir (las operaciones no los producen). Si ocurre, el estado del guardado dice el motivo, como pedía E3.
- **Las acciones que exigen `valid`** ("Tejer este diseño", publicar, exportar) validan **en el servidor** el documento que van a usar (la versión fijada, en el caso de un proyecto), no confían en `draft` ni en el cliente.
- **Sin columna nueva**: no se guarda `has_errors` en `patterns`. Sería un derivado que se desactualiza cada vez que cambian las reglas del validador. Si "Mis diseños" necesita la marca de borrador, se diseña con la caché de derivados (igual que las miniaturas).

### Cambios requeridos

- **`backend-supabase` (T4)**: `savePattern`, `createChartPattern` y duplicar deciden por `savable`, no por `valid`. Prueba: un documento con solo `CHART_ROW_EMPTY_FULL` se guarda; uno con `CHART_CELL_VALUE` se rechaza; el resultado es el mismo con y sin opciones de validación.
- **`frontend-editor` (T8, T9)**:
  - el autoguardado envía cuando `savable` es `true`; el estado del guardado distingue "guardado" de "guardado como borrador";
  - el panel de validación separa "impide tejer" (errores de tejido) de las advertencias;
  - los campos fuera de `edit.ts` (título, muestra, forma, dirección) solo escriben en el documento valores válidos (título de 1 a 120, muestra mayor que 0): `TITLE_LENGTH` y `GAUGE` son estructurales y bloquearían el guardado. El texto en edición vive en el estado del campo hasta que es válido.
- **`render-puntos` (T5)**: `layoutGeometry` acepta documentos `savable`, incluidos el gráfico vacío y las vueltas sin puntos, sin lanzar.
- **`modo-tejiendo` (fase 3)** y **`ia-pipeline` (fase 5)**: exigen `valid`.
- **`revisor-seguridad` (T15)**: revisa que ninguna acción que exige `valid` confíe en el cliente.
- **Criterio CA-F7** del roadmap: actualizado con esta regla.

## Enmienda E11 (2026-11-06): revisión de T4

Revisión de `arquitecto` de `apps/web/src/app/disenos/actions.ts`, `apps/web/src/lib/designs/` (`prepare.ts`, `types.ts`, `messages.ts`) y `supabase/migrations/20261106100000_consistencia_titulo.sql`. **T4 coincide con este ADR y con E10.** Se aceptan sin cambios de código las precisiones de abajo, que pasan a ser parte del contrato.

### Firmas (confirmadas)

| Server Action | Firma | Resultado correcto |
|---|---|---|
| `createChartPattern` | `(input: Omit<NewChartInput, "id">)` | `{ ok, id, updatedAt, draft }` |
| `savePattern` | `(id, document: unknown, expectedUpdatedAt: string)` | `{ ok, updatedAt, draft }` |
| `savePatternVersion` | `(id, label?)`: etiqueta recortada a 80 puntos de código | `{ ok, version }` |
| `listPatterns` | `()`: hasta 200, sin leer el documento completo | `{ ok, designs }` |
| `duplicatePattern` | `(id)` | `{ ok, id, updatedAt, draft }` |
| `deletePattern` | `(id)` | `{ ok }` |

- Todo fallo es `{ ok: false, code, error, issues?, currentUpdatedAt? }`, con `code` en `DesignErrorCode` y el texto en `messages.ts`. Nunca se devuelve el mensaje de Postgres.
- Guardar decide por `savable` (validación **sin opciones**); `draft = !valid`. `NOT_SAVABLE` devuelve solo los errores estructurales.
- `expectedUpdatedAt` se compara como texto exacto de PostgREST (microsegundos, sin pasar por `Date`). Sin fila actualizada: `NOT_FOUND` si no existe o no es propia, `CONFLICT` con `currentUpdatedAt` si otro guardó antes. Sobrescribir es volver a llamar con `currentUpdatedAt`: acción explícita de la interfaz.
- `savePattern` rechaza un documento cuyo `id` no es el de la fila (`INVALID_REQUEST`).
- `id`, `kind`, `technique`, `origin` y `visibility` los fija el servidor al crear; al guardar solo se escriben `title`, `schema_version` y `document`.

### Título: una sola fuente

`patterns.title = document.title` es **obligatorio**: la restricción `patterns_document_consistent` exige `coalesce(document ->> 'title' = title, false)`, así que un documento sin título no pasa. La columna es una copia para listar e indexar; el servidor la toma siempre de `document.title` (`documentColumns`).

### Tope de tamaño: 1 MB en la base y 750 KB en el servidor

Reemplaza los "2 MB" de las secciones "Límites y tamaño" y "Contexto":

- **Base**: restricción nueva `patterns_document_text_size`, `octet_length(document::text) <= 1.000.000`. La anterior (`pg_column_size <= 2.000.000`) se mantiene, pero no acota el tamaño real porque mide el valor comprimido.
- **Servidor**: `MAX_DOCUMENT_BYTES = 750.000` bytes del JSON compacto, antes de migrar y validar (`TOO_LARGE`). El texto de `jsonb` agrega un espacio después de `:` y `,`, así que mide más que el JSON compacto; el margen hace que el servidor corte antes que la base y dé un error claro.
- **Peor documento medido**: 576.933 bytes de JSON compacto del cliente (lo que acota `MAX_DOCUMENT_BYTES`) y 617.595 bytes de texto de jsonb en la base (lo que acota `patterns_document_text_size`), ambos con caracteres de 4 bytes; con ASCII, 228.573 y 269.235. Son dos medidas del mismo documento, rotuladas así en `prepare.ts`, el roadmap y el check. Cabe con margen en los dos topes y en el límite por defecto del cuerpo de las Server Actions (1 MB).
- **Riesgo cerrado (2026-11-06)**: antes el validador aceptaba claves desconocidas y un documento armado a mano podía pasar los 750 KB del servidor y superar el 1 MB de la base. Con el documento cerrado (ADR 0003, E16) esas claves son `UNKNOWN_KEY` (estructural) y el documento no se envía; el peor documento válido mide 617.595 bytes de texto jsonb, bajo el tope de la base.

### Patrones generados con IA

- **Renombrar un patrón de IA lo marca `ai_edited`.** Como el título vive en el documento, renombrar es editar el documento, y el disparador `patterns_guard_origin` (M1) cambia `origin` y `document.origin.kind` a `ai_edited`, conservando el modelo. Es coherente con la regla de oro 4: lo que la IA generó y la usuaria tocó queda como "generado con IA y editado". Verificado en `supabase/checks/10_rls_check.sql`.
- **Duplicar un patrón de IA devuelve `AI_DUPLICATE_UNSUPPORTED` hasta la fase 5.** La copia tendría que conservar la etiqueta, y solo el servidor con `service_role` puede crear filas con `origin ≠ 'manual'`. Crear la copia como `manual` borraría la etiqueta (prohibido por la regla de oro 4). En la fase 5, `ia-pipeline` con `backend-supabase` agregan la duplicación por el servidor: la copia queda `ai_edited` con los metadatos de origen del original (modelo y versión de prompt).
- La interfaz (T8) muestra el mensaje de `AI_DUPLICATE_UNSUPPORTED` y no ofrece "Duplicar" en los diseños de IA, o lo ofrece deshabilitado con la explicación.

### Cambios requeridos

- ~~`backend-supabase` (baja): unificar la cifra del peor documento~~ Hecho (T15-O1): cada cifra dice qué mide.
- **`backend-supabase`**: aplicar `20261106100000_consistencia_titulo.sql` en el proyecto real (pendiente, como indica T4).
