# ADR 0011: Posición de las partes, `schemaVersion: 2`, editor de texto y bloques, y glosario

- Estado: **aceptado** (2026-11-13, T0 de la fase 4), con las enmiendas de las [decisiones de la fase 4](../roadmap.md#decisiones-de-la-fase-4-aprobadas-el-2026-11-13) (ver [Enmiendas por las decisiones de la usuaria](#enmiendas-por-las-decisiones-de-la-usuaria-2026-11-13)): editor de bloques básico preparado para la versión completa (decisión 2) y límites recomendados solo como advertencia (decisión 5). **Enmendado el 2026-11-13** con la revisión de dominio T1 ([casos de dominio de la fase 4](../casos-dominio-fase-4.md), correcciones C-13 a C-21, y las de validación C-9 y C-10 compartidas con el ADR 0010); ver [Enmiendas por T1](#enmiendas-por-t1-2026-11-13). Lo que T1 dejó "validar con tejedora" se confirma en T1b. **Enmendado el 2026-11-13** con la implementación del grupo B: T4 (commit `e4db73e`, enmiendas T4-1 a T4-7), T6 (commit `29b1cde`, T6-1 a T6-6) y T8 (commit `18a0f02`, T8-1); ver [Enmiendas por la implementación del grupo B](#enmiendas-por-la-implementación-del-grupo-b-2026-11-13).
- Fecha: 2026-11-13
- Paquetes: `packages/pattern-core` (esquema v2, migración, validador, texto, operaciones), `packages/glossary` (nuevo), `packages/viewer-3d` (resuelve las posiciones), `apps/web`, `supabase/` (preferencia de dialecto)
- Relacionado: [ADR 0001](0001-modelo-canonico.md), [ADR 0002](0002-nucleo-sin-dependencias.md), [ADR 0003](0003-colorwork-en-esquema-v1.md) (sección 5, `migratePattern`; E10, errores de tejido; E16, documento cerrado), [ADR 0006](0006-guardado-de-disenos.md) (guardado, `savable`), [ADR 0007](0007-follow-secuencia-de-colorwork.md) (sección 5, migración de punteros), [ADR 0010](0010-geometria-3d-amigurumi.md) (geometría)

## Contexto

El estudio amigurumi de la fase 4 necesita:

1. **Ubicar las partes** (orejas sobre la cabeza, brazos al cuerpo) para ver el muñeco armado.
2. **Partes que se tejen varias veces** ("orejas: hacer 2"). El modelo v1 no lo puede expresar: habría que duplicar la parte, con dos fuentes de verdad para el mismo tejido.
3. **Un editor con texto y con bloques** que produzcan el mismo documento, sin pérdida al ir y volver.
4. **Terminología** ES, US y UK (paquete `glossary`), validada después con tejedoras (regla de oro 5).

Restricciones del código actual:

- **El documento es cerrado** (ADR 0003, E16). Cualquier clave nueva es `UNKNOWN_KEY`, un error estructural. Ubicar partes o agregar "copias" **exige `schemaVersion: 2`**: no hay forma compatible de hacerlo en la v1.
- **`migratePattern`** existe y es el camino obligatorio de lectura. Hoy no tiene pasos: la v1 es la primera.
- **La base no fija la versión**: `patterns.schema_version smallint` solo tiene que coincidir con `document.schemaVersion` (`patterns_document_consistent`). `prepareDocument` ya migra antes de validar.
- **No hay editor de patrones escritos** en `apps/web` ni operaciones de edición escritas en `pattern-core` (`edit.ts` es solo de gráficos). Es probable que no haya documentos `kind = 'written'` en la base real; T2 lo comprueba.
- **La ida y vuelta texto ↔ documento hoy pierde datos**:
  - `formatRound` no escribe `round.note` y `parsePart` no lo lee;
  - `formatPart` junta en una línea un `finish` de varias líneas;
  - `loop: "both"` explícito se lee como omitido;
  - las líneas `#` se descartan.
- **Los errores de conteo de un patrón escrito son estructurales**. `DRAFT_ERROR_CODES` solo tiene los dos del gráfico, así que un patrón escrito con una vuelta a medio escribir que no cuadra no se puede guardar. Para un editor en vivo, eso no sirve.
- **`stitches.ts` tiene abreviaturas `es` y `us`**. En UK, "dc" es el punto bajo y en US es el punto alto: leer US y UK mezclados es ambiguo.

## Opciones

### Dónde se guarda la posición

- **A. Fuera del documento** (tabla `pattern_layouts`). No exige v2, pero las versiones fijadas, la exportación y la IA no la verían, y el diseño queda en dos lugares.
- **B. Dentro de cada parte** (`Part.placement`). Mezcla datos de tejido con datos de vista: mover una oreja cambiaría la parte, y su firma de forma y la secuencia de `follow` se verían afectadas.
- **C. Sección propia del documento** (`WrittenPattern.layout`), separada de `parts`. Mover una pieza no toca el tejido.

### Cómo se expresa la posición

- **1. Libre**: posición y rotación en cm y grados, en el mundo.
- **2. Anclada a la superficie**: vuelta y punto del anfitrión, más una rotación local. Sigue al anfitrión cuando cambia de tamaño y se traduce a lenguaje de tejedora ("entre la V10 y la V11").
- **3. Mixta**: anclada para las piezas que se cosen y libre para la pieza principal o las sueltas.

### Editor

- **I. Solo texto.** **II. Solo bloques.** **III. Texto y bloques como dos vistas del mismo documento.** **IV. Texto como fuente y bloques derivados del texto** (contra la regla de oro 1).

### Glosario

- **ADR propio** o **sección de este ADR**.

## Decisión

Posición **C** (sección `layout`) con expresión **3** (mixta). **`schemaVersion: 2`** en la fase 4, con un paso de migración trivial. Editor **III**. El glosario va como **sección de este ADR** (sección 8): su único contrato difícil es el límite entre las abreviaturas que lee el motor y los nombres que muestra la interfaz, y eso es parte del editor de texto. El resto es vocabulario que validan las tejedoras, no arquitectura.

### 1. Qué entra en `schemaVersion: 2`

| Campo | Entra | Por qué |
|---|---|---|
| `WrittenPattern.layout` | Sí | Ubicar las partes (sección 2) |
| `Part.copies` | Sí | Partes que se tejen N veces, sin duplicarlas. En el texto, encabezado "Cantidad" (enmienda C-14) |
| `Part.stuffing` | **No (fuera de la v2)** | Decisión 6 resuelta por T1 (enmienda C-13): no hay regla de forma con fuente para una pieza rellena o aplanada; depende de la tensión, la cantidad de relleno y cómo se aplana (F4-52 a F4-54). "No rellenar; aplanar y coser abierta" va como texto en `finish` o `note`. Queda para una v3 con su ADR y reglas validadas por tejedoras |
| `PartStart` de cadeneta en óvalo | **No (fuera de la v2)** | Decisión 6 resuelta por T1 (enmienda C-13): la regla de consumo de la V1 no es única (las recetas dan 2n o variantes, F4-55) y la superficie de revolución del ADR 0010 no puede dibujarlo (F4-56). `Inicio: óvalo N` es un error de lectura con mensaje claro (F4-9). Queda para una v3 con su ADR |
| Secciones banda + copa, tallas, símbolos por casilla (ADR 0003, sección 6) | No | Sin necesidad confirmada por tejedoras. Irán en una v3 con su propio ADR |
| Ojos de seguridad, bordados y accesorios | No | No son tejido; se anotan en `assembly`. Se reevalúan después de la fase 6 |

Los gráficos (`kind: "chart"`) no cambian: solo sube su `schemaVersion`.

### 2. Tipos v2 (contrato que implementa `motor-patrones`)

```ts
export const SCHEMA_VERSION = 2 as const;

export type Vec3 = [number, number, number];

/** Una copia concreta de una parte. `copy` va de 0 a `copies − 1`. */
export interface PartRef {
  part: string; // Part.id
  copy: number;
}

/** Pieza principal o suelta: posición y rotación en el mundo (cm y grados, ángulos de Euler XYZ). */
export interface FreeAt {
  type: "free";
  positionCm: Vec3;
  rotationDeg: Vec3;
}

/** Pieza cosida a otra: punto de la superficie del anfitrión. */
export interface SurfaceAt {
  type: "surface";
  host: PartRef;
  /** Número de vuelta visible del anfitrión (como en el texto: V10 es 10). */
  round: number;
  /** Punto dentro de esa vuelta, 0-based desde el inicio de la vuelta. */
  stitch: number;
  /** Qué extremo de la parte se cose: "end" (última vuelta abierta) o "start" (el centro del inicio). */
  attach: "end" | "start";
  /** Giro en el marco local del ancla (normal, tangente a la vuelta, meridiano), en grados. */
  rotationDeg: Vec3;
  /** Separación sobre la normal en cm; negativa, la pieza se hunde un poco. Omitido = 0. */
  offsetCm?: number;
}

export interface Placement {
  target: PartRef;
  at: FreeAt | SurfaceAt;
}

export interface Layout {
  /** Una entrada por copia ubicada. Las copias sin entrada se ubican de forma automática (ADR 0010, sección 4). */
  placements: Placement[];
}

export interface Part {
  // … campos v1 sin cambios …
  /** Cuántas veces se teje la parte. Omitido = 1. Todas las copias son idénticas (sin variantes ni espejo). */
  copies?: number;
  // Sin `stuffing` en la v2 (enmienda C-13).
}

export interface WrittenPattern extends PatternBase {
  kind: "written";
  parts: Part[];
  assembly?: string[];
  layout?: Layout;
}
```

- **Unidades**: cm y grados. Las posiciones libres no siguen a la muestra, pero las ancladas sí. Por eso lo normal es anclar, y libre queda solo la pieza principal.
- **Sin espejo**: la segunda oreja se teje igual que la primera y se gira. Un espejo mostraría una pieza que no existe (confirmado por T1, F4-59). Piezas que difieren en algo (un pulgar a un lado, otros colores) son partes distintas, no copias (F4-60).
- **`SurfaceAt` también vale sobre partes en hileras**: `round` es la fila y `stitch` el punto de la fila (`surfaceFrame` del ADR 0010).
- **No guarda medidas derivadas** (radios ni posiciones resueltas). Se calculan siempre.
- **Los tipos v1** quedan como `PatternV1` en `migrate.ts`, solo para las pruebas de migración.

### 3. Validación v2

Claves nuevas en `SCHEMA_KEYS`: `layout`, `placement`, `partRef`, `freeAt` y `surfaceAt`; en `part`, `copies`. `stuffing` no entra (enmienda C-13): un documento con esa clave da `UNKNOWN_KEY`.

| Código | Severidad | Regla |
|---|---|---|
| `PART_COPIES` | error estructural | `copies` es entero entre 1 y `LIMITS.maxCopies` |
| `LAYOUT_TARGET_UNKNOWN`, `LAYOUT_HOST_UNKNOWN` | error estructural | La parte no existe |
| `LAYOUT_COPY_RANGE` | error estructural | `copy` fuera de 0 a `copies − 1` |
| `LAYOUT_DUPLICATE` | error estructural | Dos entradas para la misma copia |
| `LAYOUT_CYCLE` | error estructural | Una pieza anclada a sí misma o un ciclo de anclas |
| `LAYOUT_DEPTH` | error estructural | Cadena de anclas de más de `LIMITS.maxLayoutDepth` |
| `LIMIT` | error estructural | Números no finitos o fuera de cota: posiciones de ±`LIMITS.maxPositionCm`, rotaciones de ±`LIMITS.maxRotationDeg` (180), separación de ±`LIMITS.maxOffsetCm` y `round`, `stitch` y `placements.length` (hasta `LIMITS.maxPlacements`, 2.500) acotados (enmienda T4-6) |
| `LAYOUT_ANCHOR_RANGE` | advertencia | La vuelta o el punto ya no existen en el anfitrión (por ejemplo, después de borrar vueltas). El 3D acota y lo dice. Es advertencia para que editar el anfitrión nunca impida guardar |

- **Los errores estructurales de `layout` no pueden aparecer editando**: las operaciones de la sección 6 limpian las referencias. Solo llegan con documentos armados a mano o generados por IA (fase 5), y ahí el validador es la barrera.
- **El ciclo y la profundidad** se revisan en tiempo lineal, sin recursión sin tope (`revisor-seguridad`, T20).
- **Topes duros nuevos en `LIMITS`** (errores estructurales; protegen al motor, no son la recomendación de la sección 3b): `maxCopies: 50`, `maxLayoutDepth: 16`, `maxPositionCm: 1000`, `maxOffsetCm: 100`; desde T4 también `maxRotationDeg: 180` y `maxPlacements: 2500` (`maxParts × maxCopies`; enmienda T4-6). Son holgados a propósito: con la decisión 5, la usuaria puede pasar los límites recomendados, así que el tope duro tiene que quedar bastante más arriba (10 copias recomendadas, 50 como tope). `motor-patrones` puede ajustarlos en T4 con su razón, como enmienda de este ADR; subirlos después es compatible, bajarlos no.

### 3b. Límites recomendados (decisión 5: solo advertencia)

Son los valores de la opción (a) de la decisión 5: **20 partes, 10 copias por parte, 100 vueltas por parte, 200 puntos por vuelta y 40.000 puntos en la escena**. T1 los **confirma sin cambios** (enmienda C-18, F4-70 a F4-76): cubren con holgura los amigurumi habituales (8 a 15 partes, hasta 8 copias, una pelota de 60 vueltas, peluches de 40 a 60 cm). Los casos que los pasan (ciempiés, serpientes, cojines, peluches de más de 80 cm) son raros y solo reciben la advertencia. Estimaciones propias, validar con tejedora. No bloquean nada: si se superan, la interfaz advierte y la usuaria decide si sigue. Qué hace el 3D fuera de ellos está en el ADR 0010, sección 6c.

**Contrato** (`pattern-core`, puro; los conteos salen del motor):

```ts
export const RECOMMENDED_WRITTEN_LIMITS = {
  parts: 20,
  copiesPerPart: 10,
  roundsPerPart: 100,      // vueltas concretas (los rangos cuentan cada vuelta)
  stitchesPerRound: 200,   // count.produced
  sceneStitches: 40_000,   // Σ (Σ produced de la parte) × copies
} as const;

export type RecommendedLimit = keyof typeof RECOMMENDED_WRITTEN_LIMITS;

export interface LimitUsage {
  limit: RecommendedLimit;
  /** Valor actual; en los límites por parte o por vuelta, el máximo encontrado. */
  value: number;
  recommended: number;
  /** Dónde se supera (parte y vuelta), para mostrarlo junto a ella. Vacío si no se supera. */
  over: Array<{ partId: string; round?: number }>;
}

/** Uso de cada límite recomendado. Nunca lanza con documentos `savable`; tiempo lineal en las vueltas (sin expandir puntos). */
export function recommendedLimitUsage(pattern: WrittenPattern): LimitUsage[];
/** Solo los límites superados (los que llevan advertencia). */
export function recommendedLimitNotices(pattern: WrittenPattern): LimitUsage[];
```

- **No pasan por `validatePattern`**: no dicen nada del tejido, sino de la fluidez de la herramienta. Así un patrón grande sigue siendo `valid`, la IA (fase 5) no los confunde con errores y el validador queda libre de reglas de producto. La IA puede usar `RECOMMENDED_WRITTEN_LIMITS` como meta al proponer, sin que sea una regla de validez.
- **Propiedades**: `recommendedLimitUsage` coincide con `concreteRounds` y `copies` en documentos aleatorios; el total de la escena es igual a `stitchCount` de `buildScene` (G13 del ADR 0010); nunca lanza.

**Comunicación en la interfaz** ("déjalo claro desde el inicio"):

- **Antes de alcanzarlos**: el estudio muestra siempre los límites recomendados, no solo al superarlos.
  - Un medidor junto al visor: "12.400 de 40.000 puntos recomendados en la escena".
  - En la lista de partes: "6 de 20 partes recomendadas" y, por parte, sus vueltas frente a 100.
  - Una ayuda visible ("¿Por qué hay límites recomendados?") que explica los cinco valores, que no son límites del tejido y que pasarlos solo puede hacer más lenta la vista previa.
  - El medidor cambia de tono al acercarse (desde el 80 %), con texto y no solo con color.
- **Al superarlos**:
  - **Acciones puntuales** (agregar una parte, fijar copias, insertar una vuelta en bloques): un diálogo "Esto supera el límite recomendado de 20 partes. La vista previa puede ir más lenta. ¿Seguir igual?" con "Seguir igual" y "Cancelar". Si elige seguir, no se vuelve a preguntar por ese mismo límite en ese diseño durante la sesión (estado del estudio, nunca del documento).
  - **Texto que se escribe** (una vuelta de 240 puntos): sin diálogo, para no cortar la escritura. Una advertencia junto a la vuelta y en el medidor; el documento cambia como siempre y se puede deshacer.
  - En los dos casos, el aviso dice qué límite, el valor actual y que la vista previa puede ir más lenta.
- **Los textos** los redacta `documentador` (T18) y los revisa `ux-accesibilidad` (T17). El anuncio por `aria-live` es educado (`polite`) y no se repite en cada tecla.

### 4. Errores de tejido en patrones escritos (como E10 del ADR 0003)

Se agregan a `DRAFT_ERROR_CODES`: `ROUND_CONSUMPTION_MISMATCH`, `ROUND_COUNT_MISMATCH`, `ROUND_ZERO`, `ROUND_RANGE_CHANGES` y `ROUND_NUMBERING`.

- **Un patrón escrito con una vuelta que no cuadra se guarda como borrador** (`savable: true`, `valid: false`) y se ve en 3D (ADR 0010, sección 2). Siguen siendo estructurales `STITCH_UNKNOWN`, `COLOR_UNKNOWN_YARN`, `ITEM_COUNT`, `GROUP_*`, `SHAPE`, `LIMIT` y los de `layout`.
- **Invariante**: todo derivado (conteos, texto, perfil, malla y, en la fase 6, `follow`) funciona con cualquier documento `savable` y nunca lanza (propiedad G10 del ADR 0010 y RT6 de abajo).
- **Tejer un patrón escrito** (fase 6) exige `valid`, verificado en el servidor, como el gráfico (ADR 0009).
- **No cambia la forma del documento**, pero sí lo que se acepta guardar. Registrado como [enmienda E12 del ADR 0006](0006-guardado-de-disenos.md#enmienda-e12-2026-11-13-borradores-de-patrones-escritos-fase-4-t4) (T4, enmienda T4-1).

**Ajustes de T1 a la validación de patrones escritos** (enmiendas C-9, C-10, C-19 y C-20; los implementa T4 en `validate.ts`; los textos finales, `documentador`; todo "validar con tejedora"):

| Código | Severidad | Regla |
|---|---|---|
| `ROUND_CONSUMPTION_MISMATCH` en la V1 con `start: chain` y `spiral` o `joined` | **advertencia** (antes error) | Pista: "Si trabajas dentro del aro, la cantidad de la primera vuelta es libre". En hileras ya era advertencia (F4-3, F4-4 y F4-6). Desde la V2, sigue siendo error de borrador |
| `PART_START_RING_SHORT` (nuevo) | advertencia | `start: chain` con `count` 1 en `spiral` o `joined`: "una cadeneta en aro necesita al menos 2". No es error para no romper M1 (C-9) |
| `PART_START_FLAT_RING` (nuevo) | info | Hileras (`flat`) con `start: magic_ring`: "las hileras suelen empezar con una cadeneta base". El panel ignora el anillo (F4-7, C-19). `parsePart` sigue poniendo anillo mágico por omisión cuando falta `Inicio:` (no cambia lo que se lee, RT2); en hileras, eso hace aparecer este aviso |
| `MAGIC_RING_UNUSUAL` (nuevo) | info | V1 sobre anillo mágico con menos de 3 o más de 12 puntos, **solo en espiral y vueltas cerradas** (en hileras ya está `PART_START_FLAT_RING`; enmienda T4-3). Nunca error. Umbral provisional (F4-2, C-20) |
| Pista de subida y unión | (en el mensaje y en `data.hints`, enmienda T4-2) | `ROUND_CONSUMPTION_MISMATCH` y `ROUND_COUNT_MISMATCH` en vueltas cerradas o hileras con diferencia de 1 o 2 puntos agregan: "¿Escribiste la cadeneta de subida o el pd de unión como puntos? No cuentan" (F4-11, F4-12, C-10) |
| `ROUND_RANGE_CHANGES` | (en el mensaje) | Sugiere escribir cada vuelta cuando un rango aumenta o disminuye (F4-84) |

- Los nuevos códigos son advertencias o información: **no cambian qué es `valid` ni qué es `savable`**, salvo que la V1 con cadeneta en aro deja de ser error.
- `PARSE_START` también para `Inicio: óvalo N` ("Usa AM o cad N"), sin interpretarlo como cadeneta (F4-9).

### 5. Migración v1 → v2 y compatibilidad

**Paso de migración** (`STEPS[1]` en `migrate.ts`): devuelve una copia con `schemaVersion: 2`. Todos los campos nuevos son opcionales y sus valores por omisión equivalen a la v1: `copies` omitido es 1 y sin `layout` la ubicación es automática. **No transforma datos**: las notas y los cierres de varias líneas se conservan, porque la sintaxis de texto nueva los admite (sección 7).

**Propiedades de la migración** (con los fixtures v1 del repositorio y documentos v1 aleatorios):

| # | Propiedad |
|---|---|
| M1 | Un v1 `valid` (o `savable`) migrado es v2 `valid` (o `savable`), con los mismos códigos de **error** salvo `SCHEMA_VERSION`. Advertencias e información pueden sumar **solo** los códigos nuevos de la v2 (`PART_START_RING_SHORT`, `PART_START_FLAT_RING`, `MAGIC_RING_UNUSUAL`, `ROUND_GROWS_FAST`, `ROUND_SHRINKS_FAST`), y `ROUND_CONSUMPTION_MISMATCH` de la V1 con cadeneta en aro puede pasar de error a advertencia (sección 4; enmienda de T1). Se prueba contra un validador v1 congelado (enmienda T4-7). Excepción deliberada: el tope de lo que trabaja una vuelta (enmienda T4-4) |
| M2 | Es idempotente: migrar un v2 devuelve el mismo objeto (`===`) |
| M3 | Los derivados no cambian: en gráficos, `stitchTotal`, `rowStitchCounts`, `yarnUsage` y todos los pasos de `planChart`; en escritos, `concreteRounds` y `summarizePart` |
| M4 | Nunca lanza, con cualquier entrada (como hoy) |

**Compatibilidad**:

| Qué | Comportamiento |
|---|---|
| Documentos v1 en `patterns` | Se leen migrados en memoria. Se escriben como v2 solo cuando la usuaria guarda. No hay migración masiva (ADR 0003, sección 5) |
| `pattern_versions` (inmutable) | Las versiones fijadas siguen siendo v1 para siempre. Toda lectura pasa por `migratePattern`; M3 garantiza que el plan de `follow` es el mismo, así que **no hace falta `migratePointer`** (ADR 0007, sección 5) |
| Base de datos | **Sin migración SQL de `patterns`**: el CHECK compara documento y columna, y `documentColumns` ya copia `schemaVersion`. T2 verifica que ninguna función (`snapshot_pattern`, `start_chart_project`, `repin_project`, las RPC de patrones compartidos) suponga `schema_version = 1` |
| Servidor | `prepareDocument` ya migra antes de validar: acepta v1 y v2 y guarda v2 |
| Pestaña abierta antes del despliegue (código viejo) | Con un v1, sigue como hoy. Con un v2, muestra el error `SCHEMA_VERSION` existente y no guarda. Si guarda un v1 sobre un diseño que otra pestaña ya guardó como v2, la concurrencia por `updated_at` (ADR 0006, E11) da conflicto y no lo pisa en silencio |
| Vista compartida (`shared-pattern.ts`) | Ya migra antes de validar |
| IA (fase 5) | Produce v2 y pasa por el validador v2 |
| Reversión | No hay paso v2 → v1. Antes de la puesta en público (hoy), un problema se arregla hacia adelante. **Desde la puesta en público**, todo cambio de versión del esquema se despliega en dos pasos: primero un lector que acepta la versión nueva y después el escritor |
| Pruebas | Los fixtures que escriben `schemaVersion: 1` a mano pasan a `SCHEMA_VERSION`, salvo los de migración, que son v1 a propósito. `supabase/checks/10_rls_check.sql` puede seguir insertando v1: la base no valida el contenido |

**Consecuencia para la fase 6**: con `copies`, la secuencia de un patrón escrito recorre parte × copia. `WrittenPointer` (ADR 0007, sección 6) pasa a `{ partId, copy, rowsDone, stitchesDone }`, y `project_progress` necesitará la copia (en la migración de la fase 6). Los documentos v1 tienen una copia por parte, así que no cambia nada para ellos.

### 6. Operaciones de edición (`pattern-core/src/edit-written.ts`)

Puras, inmutables y con salida normalizada (sección 7), con la misma convención de `edit.ts`: nunca lanzan, y con una entrada fuera de rango devuelven el documento sin cambios.

- **Documento**: `newWrittenPattern`.
- **Lanas**: `addYarn`, `removeYarn` y `reorderYarns` se generalizan a `Pattern`. En escritos, quitar una lana reemplaza sus `@id` y `startYarn` por la lana de reemplazo.
- **Partes**:
  - `addPart`, `renamePart`, `movePart`, `setPartConstruction`, `setPartStart`, `setPartStartYarn` y `setPartFinish`;
  - `setCopies(pattern, partId, n)` quita las posiciones de las copias que dejan de existir y las anclas que apuntaban a ellas;
  - `removePart(pattern, partId)` quita la parte, sus posiciones y las anclas que dependían de ella. Las dos devuelven `{ pattern, unplaced: PartRef[] }` para que la interfaz avise qué piezas quedaron sin ubicar.
- **Vueltas**:
  - `replacePartRounds(pattern, partId, rounds)` la usa el editor de texto y conserva los números que escribió la usuaria;
  - `insertRound`, `removeRound` y `replaceRound` los usa el editor de bloques y **renumeran** las vueltas siguientes (conservan los rangos).
- **Ítems** (bloques), con una ruta `ItemPath = number[]` dentro de la vuelta: `insertItem`, `updateItem`, `removeItem`, `moveItem`, `wrapInGroup(desde, hasta, veces)` y `unwrapGroup`.
  - **Profundidad completa** (decisión 2): las operaciones aceptan rutas de cualquier profundidad hasta `LIMITS.maxNesting` (6). El tope de 2 niveles del editor v1 es **solo de la interfaz** (sección 7) y no existe en `pattern-core`. Una operación que dejaría la anidación por encima de `LIMITS.maxNesting` devuelve el documento sin cambios, como toda entrada fuera de rango.
  - `moveItem(pattern, partId, roundIndex, from: ItemPath, to: ItemPath)` es general: mueve entre grupos y niveles distintos. `to` es la ruta **después** de mover (enmienda T6-4). La v1 lo usa solo para "subir" y "bajar" entre hermanos; arrastrar y soltar usará la misma operación.
  - "Profundidad" se cuenta en niveles de ítems: `LIMITS.maxNesting` (6) son 6 niveles, o sea la vuelta y 5 grupos anidados, y una `ItemPath` tiene hasta 6 índices (enmienda T6-1).
- **Límites**: las operaciones respetan los topes duros de `LIMITS` (devuelven el documento sin cambios si se pasarían), **nunca los recomendados** de la sección 3b: superar un recomendado lo decide la usuaria en la interfaz.
- **Posición**: `setPlacement(pattern, placement)`, `clearPlacement(pattern, ref)`.
- **Armado**: `setAssembly(pattern, steps)`.

Propiedades: toda operación deja un documento `savable` si la entrada lo era; RT3 (sección 7); `removePart` y `setCopies` nunca dejan referencias colgando en `layout`.

Calcular la posición en el mundo de una pieza (por ejemplo, para convertir un ancla en posición libre) necesita geometría. Lo hace la capa de aplicación con `viewer-3d` y luego llama a `setPlacement`: `pattern-core` no depende de la geometría 3D.

### 7. Editor: texto y bloques como dos vistas del mismo documento

**Fuente de verdad**: el documento. El texto es `formatPart(part, dialecto)` y los bloques dibujan `part.rounds`. Ninguna vista guarda su copia (regla de oro 1).

**Normalización** (`normalizePart`, pura). Es la forma en que toda operación y todo `parsePart` dejan la parte:

1. `loop: "both"` se omite.
2. `through` igual a `number` se omite.
3. `copies: 1` se omite.
4. `name` y `finish` sin espacios al inicio ni al final.
5. En notas y cierres, `\r\n` pasa a `\n` y se quitan los espacios al final de cada línea.
6. `note` y `finish` vacíos se omiten.

No se fusionan puntos seguidos ("pb, pb" no pasa a "2 pb") ni se reordena nada: eso cambiaría lo que escribió la usuaria sin que lo pida.

**Sintaxis nueva** (v2; términos revisados por `experto-tejido` en T1):

```
Parte: Oreja
Cantidad: 2
Inicio: AM
Construcción: espiral
Lana: A
V1: 6 pb (6)
V2: aum x6 (12)
> Coloca un marcador al inicio de la vuelta.
V3-5: 12 pb (12)
Cierre: no rellenar; aplanar y coser abierta.
> Deja una hebra larga para coser.
```

- **Una línea `> texto`** es la nota de la vuelta anterior, o una línea más del cierre si sigue a "Cierre:". Varias líneas `>` forman una nota de varias líneas, así que nada se pierde.
- **Las líneas `#`** siguen siendo comentarios que no se guardan. El editor avisa: "Los comentarios con # no se guardan; usa > para una nota".
- **Encabezado de copias** (enmienda C-14, F4-61): `formatPart` escribe siempre **"Cantidad: N"** (solo si `N > 1`) en `es`, y **"Make: N"** en `us` y `uk` (enmienda T6-2). `parsePart` acepta también **"Hacer"**, **"Piezas"** y **"Tejer"** (lo más usual entre patronistas es "Hacer 2"), con o sin dos puntos ("Hacer 2" y "Hacer: 2"), sin distinguir mayúsculas. Leer un alias y volver a escribir da "Cantidad" (RT2: forma canónica estable). En la interfaz se evita la palabra "copias", que es de software: "se teje 2 veces", y en la lista de partes "Oreja (1 de 2)" (F4-62). El término queda "validar con tejedora".
- **Sin encabezado de relleno**: `stuffing` no entra en la v2 (enmienda C-13). "Relleno:" no es un encabezado; "no rellenar" se escribe en `Cierre:` o en una nota `>`.

**Ida y vuelta sin pérdida** (propiedades con semilla en `pattern-core`; criterio de salida de la fase 4):

| # | Propiedad |
|---|---|
| RT1 | Para toda parte normalizada `savable` `p` y todo dialecto `d`: `parsePart(formatPart(p, d), { id: p.id, mode })` es igual a `p` (`deepEqual`) |
| RT2 | Para todo texto que se lee, `parsePart(formatPart(parsePart(t)))` es igual a `parsePart(t)`: la forma canónica es estable |
| RT3 | Para toda secuencia de operaciones de bloques, el resultado cumple RT1 |
| RT4 | `countRound` de una vuelta y de su ida y vuelta por texto dan lo mismo |
| RT5 | En todo modo de lectura, ningún alias corresponde a dos puntos distintos (sección 8) |
| RT6 | `parsePart` nunca lanza, con cualquier texto de hasta `PARSE_LIMITS.maxTextLength` |

El documento completo no pasa por texto: el texto es por parte. `layout`, `yarns`, `gauge`, `notes` y `assembly` se editan en sus propios campos, así que la ida y vuelta por partes es la del documento.

**Editor de texto** (`frontend-editor`):

- **Un texto por parte.** Cada cambio vuelve a leer la parte completa: unas 40 líneas tardan bastante menos de 1 ms.
- **Si la parte se lee**, se aplica `replacePartRounds` más los encabezados, y el 3D se actualiza.
- **Si no se lee**, el documento no cambia, el 3D queda como estaba y el error se marca en su línea y columna (`texto:línea:columna`). El texto sin leer vive en el estado del editor y en el respaldo local de la sesión (como T15 de la fase 2), **no en el documento**.
- **Errores del validador por vuelta**: `formatPartLines(part, d)` devuelve `{ text, roundLine: number[] }`, que traduce `parts[i].rounds[j]` a una línea. El error se muestra junto a esa vuelta.
- **Forma canónica**: al salir de una línea que se leyó bien, el editor la reescribe en forma canónica ("pb x6" → "6 pb"). Nunca mientras se escribe, para que el cursor no salte ([decisión 7](../roadmap.md#decisiones-de-la-fase-4-aprobadas-el-2026-11-13), aprobada).
- **Pegar un patrón con varias partes**: `parseWrittenParts(text)` corta en cada "Parte:" y crea partes nuevas (deseable en la fase 4).
- **Límites de entrada** (`PARSE_LIMITS`): texto de hasta 100 KB por parte y líneas de hasta 2.000 caracteres. Protegen las expresiones regulares de `text.ts` de entradas desmedidas (T20).

**Editor de bloques** (`frontend-editor`; alcance en la [decisión 2](../roadmap.md#decisiones-de-la-fase-4-aprobadas-el-2026-11-13): edición básica, preparada para la versión completa):

- **Muestra cualquier parte `savable`**: puntos con su cantidad y su hebra, grupos con sus veces (anidados hasta `LIMITS.maxNesting`), cambios de lana con la letra y el color, y el conteo de cada vuelta, que sale del motor (`countRound`).
- **Cada acción es una operación de la sección 6.** Por eso el texto que se ve al cambiar de pestaña es siempre `formatPart` del documento.
- **Cambiar de texto a bloques con líneas sin leer**: no se permite sin elegir. "Volver al texto" o "Descartar las líneas sin leer".

**Alcance de la v1 (edición básica)**: se edita punto, cantidad, hebra, cambio de lana, grupos hasta 2 niveles (crear, cambiar las veces, deshacer el grupo), insertar y borrar vueltas, y mover ítems con botones "subir" y "bajar". Todo lo demás se ve.

**Fuera de la v1, y por qué** (registro pedido por la usuaria):

| Queda fuera | Por qué | Qué se puede hacer en la v1 |
|---|---|---|
| Editar grupos de 3 a 6 niveles (la anidación completa del núcleo) | Son raros en amigurumi (validar con tejedora en T1b). Editarlos con bloques necesita sangrías, foco y anuncios de lector de pantalla por nivel, que en 390 px no caben sin un diseño propio. El costo de interfaz y de accesibilidad es alto para casos raros | Se ven en bloques, en solo lectura, con "Editar en el texto". El texto los edita sin límite |
| Arrastrar y soltar | Es el mayor costo de accesibilidad (WCAG 2.2, 2.5.7: todo arrastre necesita una alternativa con un solo toque, que igual hay que construir), táctil y de pruebas E2E. Los botones "subir" y "bajar" son esa alternativa y cubren lo habitual | Mover con botones o con el teclado |

**Preparado para la versión completa** (que la v1 no cierre la puerta):

1. **Operaciones con profundidad completa** (sección 6): `pattern-core` no sabe del tope de 2 niveles. RT3 se prueba con secuencias de operaciones de bloques a **toda** la profundidad de `LIMITS.maxNesting`, no solo a 2.
2. **Árbol de bloques recursivo**: el modelo de la vista es un árbol derivado de `round.items` sin límite de profundidad:

   ```ts
   // apps/web, derivado (no se guarda): se recalcula desde el documento
   export interface BlockNode {
     path: ItemPath;              // ruta en la vuelta; identidad del bloque
     item: Item;                  // el ítem del documento (`Item` de pattern-core), sin copiar
     depth: number;               // 0 = nivel de la vuelta
     editable: boolean;           // canEditBlock(path, policy)
     children?: BlockNode[];      // si es un grupo
   }
   export function blockTree(round: Round, policy: BlockEditPolicy): BlockNode[];
   ```

   Un solo componente recursivo dibuja cualquier nivel. Los niveles no editables se dibujan con el mismo componente, en solo lectura.
3. **Una sola política de interfaz**:

   ```ts
   export interface BlockEditPolicy {
     maxEditDepth: number;   // v1: 2; versión completa: LIMITS.maxNesting (niveles de ítems, enmienda T6-1)
     dragAndDrop: boolean;   // v1: false
   }
   export const BLOCK_EDIT_POLICY_V1: BlockEditPolicy = { maxEditDepth: 2, dragAndDrop: false };
   export function canEditBlock(path: ItemPath, policy: BlockEditPolicy): boolean;
   ```

   Ningún otro lugar del código compara la profundidad con un número. Pasar a la versión completa es cambiar la política y agregar la interfaz de arrastre, sin tocar las operaciones, el árbol ni el almacén.
4. **Estado del editor por rutas, no por posición en pantalla**: la selección y el foco son `{ partId, roundIndex, path }`. Mover con botones ya llama a `moveItem` con una ruta de destino, igual que hará el arrastre.
5. **Deshacer por acción**: cada acción es un paso de deshacer en el almacén, sea un botón hoy o un arrastre después.

**Verificación** (CA4-E11 de la hoja de ruta): una prueba de Vitest monta el editor con `{ maxEditDepth: LIMITS.maxNesting, dragAndDrop: false }` y edita un ítem a 6 niveles de profundidad sin cambiar otro código; una búsqueda en la revisión de código confirma que no hay comparaciones de profundidad fuera de `canEditBlock`; y RT3 corre con profundidad completa.

La versión completa (anidación de 6 niveles y arrastrar y soltar) queda en la hoja de ruta como fase futura, después de que T1b diga si las tejedoras usan los bloques.

### 8. Terminología y paquete `packages/glossary`

**Límite entre paquetes**:

- **Las abreviaturas con que se lee y se escribe un patrón** (`es`, `us` y, nueva, `uk`) viven **solo** en `pattern-core/src/stitches.ts`. El lector es parte del motor y no puede depender de otro paquete (ADR 0002).
- **`glossary` las importa** y agrega lo que es solo de la interfaz: nombres completos, términos ("vuelta" o "fila", "casilla", "muestra"), variantes regionales y el estado de validación de cada término.

**Dialectos y modos de lectura**:

- `Dialect` pasa a `"es" | "us" | "uk"`.
- `parseRound` y `parsePart` reciben `mode: "es-us" | "es-uk"`. Por omisión es `"es-us"`, que es lo que hacen hoy.
- **Nunca se adivina el dialecto**: "dc" es punto bajo en UK y punto alto en US. RT5 lo garantiza.
- **Tabla de abreviaturas** (enmienda C-15, confirmada por T1 con la tabla "U.S. vs. U.K. Terminology" del Craft Yarn Council; F4-63 a F4-68). Las variantes ES son las de `stitches.ts` (Chile):

  | Código | `es` | `us` (escribe) | `uk` (escribe) | Notas |
  |---|---|---|---|---|
  | `sc` | pb | sc | **dc** | "dc" significa otro punto en US |
  | `hdc` | mpa | hdc | **htr** | |
  | `dc` | pa | **dc** | **tr** | |
  | `tr` | pad | **tr** | **dtr** | |
  | `slst` | pd | **sl st** | **ss** | US pasa a escribir "sl st" como el CYC (enmienda C-16); "slst" se sigue leyendo en `es-us` |
  | `ch` | cad | ch | ch | |
  | `inc` | aum | inc | inc | De punto bajo |
  | `inc3` | aum3 | inc3 | inc3 | No es CYC; provisional |
  | `dec` | dism | dec (alias `sc2tog`) | dec (alias **`dc2tog`**) | En US, "dc2tog" sería de punto alto: no se lee en `es-us` |
  | `sk` | saltar | sk | **miss** | "miss" provisional |
  | hebra trasera / delantera | ht / hd | blo / flo | blo / flo | |
  | anillo mágico | AM | mr | mr | "mr" provisional (no está en la página del CYC) |

- **Alias por modo** (enmienda C-16, RT5): cada modo de lectura carga su propia tabla de alias. `es-us` = alias `es` más `us`; `es-uk` = alias `es` más `uk`. Un alias compartido entre modos solo si significa lo mismo en los dos (`pb`, `mpa`, `pa`, `pad`, `pd`, `cad`, `aum`, `dism`, `ch`, `inc`, `dec`, `blo`, `flo`). En concreto:
  - en `es-uk`, `dc` = `sc`, `tr` = `dc`, `htr` = `hdc`, `dtr` = `tr`, `ss` = `slst`, `miss` = `sk`, `dc2tog` = `dec`; **`sc2tog` no es alias** en `es-uk`;
  - en `es-us`, `htr`, `dtr`, `ss`, `miss` y `dc2tog` son desconocidos (`PARSE_UNKNOWN_STITCH`);
  - **términos del otro dialecto con pista**: `sc`, `hdc` y `sc2tog` en `es-uk` dan error de lectura con la pista "sc es US; en UK el punto bajo se llama dc" (o la equivalente), en vez de aceptarse en silencio (F4-64). `htr` y `dtr` en `es-us` dan la pista inversa.
- **Variantes regionales del español** ("medio punto", "pma", "punto raso", "punto bajísimo"): **no se agregan como alias** hasta que T1b las respalde (F4-69). "Medio punto" en particular se confunde con "medio punto alto".

**Contrato** (puro, sin dependencias de terceros; depende solo de `pattern-core`):

```ts
export type GlossaryLocale = "es" | "en-US" | "en-GB";
export type TermStatus = "pendiente" | "validado";

export interface TermEntry {
  key: TermKey;               // "round_in_rounds", "row_flat", "cell", "gauge", "stitch.sc"…
  es: string;
  aliasesEs: readonly string[];
  enUS?: string;
  enGB?: string;
  status: TermStatus;         // todo "pendiente" hasta T1b (regla de oro 5)
  note?: string;
}

export function term(key: TermKey, locale: GlossaryLocale, opts?: { plural?: boolean }): string;
export function stitchLabel(code: StitchCode, dialect: Dialect): { abbrev: string; name: string; status: TermStatus };
export function roundWord(construction: Part["construction"] | "rounds" | "rows", locale: GlossaryLocale): string;
export const TERMS: readonly TermEntry[];
```

- **Datos**: los del [glosario pendiente](../roadmap.md#glosario-pendiente) más los de amigurumi de T1 ([casos de dominio](../casos-dominio-fase-4.md), sección 11: anillo mágico, cadeneta base, espiral, vueltas cerradas, aumento, disminución, disminución invisible, cantidad, cierre, parte y pieza). **"Cadeneta de subida", "pd de unión" y "cadeneta de giro"** entran como términos con la nota de que **no cuentan como puntos** y no se escriben como ítems (enmienda C-21, F4-11 y F4-12). "Relleno" entra como término, aunque no sea un campo del modelo. **Las variantes regionales del español** (Chile como base; otras) se cargan solo con lo que entregue `experto-tejido`, en estado "pendiente". No se inventan.
- **Pruebas**: cada código de `STITCHES` tiene entrada en los tres dialectos; ninguna clave falta en `es`; los datos no tienen marcas ni nombres de tienda (como CA3-L11).
- **Preferencia de la usuaria**: el dialecto con que ve y escribe los patrones se guarda en `profiles.pattern_dialect` (`'es' | 'us' | 'uk'`, por omisión `'es'`), con una migración pequeña y RLS de la propia fila ([decisión 4](../roadmap.md#decisiones-de-la-fase-4-aprobadas-el-2026-11-13), aprobada). Implementado en T8 (enmienda T8-1): la columna guarda el **dialecto de escritura**, no el modo de lectura; la interfaz lee con `readingModeFor(dialect)`.
- **Alcance**: la interfaz sigue en español. `glossary` es la terminología de los patrones, no la traducción de la aplicación.

### 9. Armado

- **`assembly: string[]` no cambia**. Son los pasos que escribe la diseñadora.
- **"Dónde va cada pieza"**: junto al armado, el estudio muestra una lista derivada de `layout` y del perfil del anfitrión. **No se copia** en `assembly`: sería una segunda fuente que se desincroniza.
- **Texto** (enmienda C-17, F4-80):
  - forma: "Oreja (1 de 2): se cose a la cabeza, entre la V10 y la V11, contando desde el anillo mágico". Con cadeneta inicial, "contando desde la cadeneta inicial"; en hileras, "entre la H10 y la H11, contando desde la cadeneta base"; con `attach: "start"`, "se cose por el centro del inicio";
  - **sin distancia en puntos** desde "el inicio de la vuelta": en espiral ese inicio es el marcador, que se mueve, y "a 4 puntos" no se puede seguir. `SurfaceAt.stitch` se sigue guardando para el 3D, pero el texto no lo usa;
  - una referencia a la cara ("a la derecha del centro de la cara") necesitaría saber dónde está el frente de la pieza, que el modelo no guarda: queda fuera de la v2;
  - el verbo ("se cose" o "se une") y la redacción final quedan "validar con tejedora"; `documentador` la redacta.
- El PDF de la fase 7 incluye las dos cosas: los pasos escritos y la lista derivada.

## Alternativas descartadas

- **Posición fuera del documento (A)**: las versiones fijadas, la exportación y la IA no la verían. Además, el diseño quedaría en dos lugares (regla de oro 1).
- **Posición dentro de la parte (B)**: mover una oreja cambiaría la parte. Invalidaría la caché de su malla y mezclaría vista con tejido.
- **Solo posición libre (1)**: cuando la cabeza crece, la oreja queda flotando o hundida. Además, no se puede decir "entre la V10 y la V11".
- **Solo anclas (2)**: la pieza principal necesita un lugar en el mundo, y una pieza suelta (una bufanda) no se cose a nada.
- **Duplicar la parte en vez de `copies`**: dos fuentes para el mismo tejido. Editar una oreja no cambiaría la otra.
- **Espejo de piezas**: muestra una pieza que no se teje así.
- **Seguir en v1 con `UNKNOWN_KEY` relajado**: rompe el documento cerrado (E16), que protege de datos basura de la IA.
- **Texto como fuente (IV)**: dos verdades, y los bloques tendrían que volver a interpretar texto.
- **Guardar el texto tal como lo escribió la usuaria**: sería otra copia del patrón. Se conserva solo mientras no se lee, en el estado del editor.
- **Fusionar puntos al normalizar**: cambia lo escrito sin que se pida.
- **Detectar el dialecto automáticamente**: "dc" y "tr" son ambiguos entre US y UK. Un error ahí cambia el conteo sin que se note.
- **ADR propio para `glossary`**: su contrato técnico es la sección 8; lo demás son datos que validan las tejedoras.
- **Bloques completos en la fase 4** (opción b de la decisión 2): anidación de 6 niveles y arrastrar y soltar. Mucho trabajo de interfaz y accesibilidad para casos raros. Queda preparado (sección 7) y en la hoja de ruta como fase futura.
- **Tope de 2 niveles en las operaciones de `pattern-core`**: sería lo más simple, pero obligaría a cambiar el núcleo y sus propiedades para la versión completa, y dejaría al editor de bloques sin poder representar lo que el texto sí acepta.
- **Límites recomendados como topes duros en la interfaz** (lectura original de la opción a de la decisión 5): la usuaria pidió que sean solo advertencia y que ella decida.
- **Límites recomendados como avisos del validador**: mezclarían la fluidez de la herramienta con la corrección del tejido, y la IA los trataría como problemas del patrón.
- **Diálogo de confirmación también al escribir texto**: cortaría la escritura en cada tecla que cruza un límite. En el texto la advertencia va junto a la vuelta, sin diálogo.

## Consecuencias

- `SCHEMA_VERSION` pasa a 2. Todo el código que escribe `schemaVersion: 1` a mano (pruebas y fixtures) se actualiza en una tarea mecánica.
- Los patrones escritos se pueden guardar como borrador con errores de conteo (enmienda E12 del ADR 0006, T4).
- `follow` (fase 6) recorre parte × copia, y `project_progress` necesitará la copia.
- La interfaz deja de reescribir lo que la usuaria tipea mientras escribe, pero sí al salir de la línea. Es una decisión visible ([decisión 7](../roadmap.md#decisiones-de-la-fase-4-aprobadas-el-2026-11-13)).
- Los campos condicionales (`stuffing` y el inicio en óvalo) **quedan fuera de la v2** (T1, enmienda C-13). La v2 tiene solo `layout` y `copies`. Si se retoman, van en una v3 con su ADR y reglas validadas por tejedoras.
- La preferencia de dialecto agrega una columna a `profiles`. Pasa por `revisor-seguridad`.
- Los límites recomendados no impiden nada: un diseño puede tener 30 partes y seguir siendo `valid`. La regla de oro 7 se garantiza dentro de ellos (ADR 0010, sección 6c), y la interfaz lo dice desde el inicio.
- El editor de bloques v1 es básico, pero el núcleo, el árbol de bloques y el almacén ya soportan la profundidad completa. La versión completa es trabajo de interfaz, no de modelo.

## Enmiendas por las decisiones de la usuaria (2026-11-13)

La usuaria aprobó el ADR, `schemaVersion: 2` y el posicionado anclado ([decisiones 1 y 3](../roadmap.md#decisiones-de-la-fase-4-aprobadas-el-2026-11-13), opción a). Cambios al texto propuesto:

- **Decisión 2 (editor de bloques básico, preparado para la versión completa)**: sección 7, con el alcance de la v1, la tabla de lo que queda fuera y por qué (anidación de 6 niveles, arrastrar y soltar), y lo que la deja preparada: operaciones con profundidad completa (sección 6), árbol `BlockNode` recursivo, `BlockEditPolicy` como único lugar del tope de 2 niveles, estado por rutas y deshacer por acción. Se verifica con CA4-E11. La versión completa queda como fase futura en la hoja de ruta.
- **Decisión 5 (límites solo como advertencia)**: nueva sección 3b con `RECOMMENDED_WRITTEN_LIMITS`, `recommendedLimitUsage` y `recommendedLimitNotices`, fuera del validador, y cómo la interfaz los informa antes de alcanzarlos y al superarlos. Topes duros nuevos de `LIMITS` en la sección 3 (`maxCopies: 50`, `maxLayoutDepth: 16`, `maxPositionCm: 1000`, `maxOffsetCm: 100`). Las operaciones respetan solo los topes duros (sección 6).
- **Decisión 4 (glosario ES, US y UK con preferencia en el perfil)**, **6 (campos condicionales solo con reglas de T1 antes de T4)** y **7 (forma canónica al salir de la línea)**: aprobadas tal como estaban; solo se actualizan los enlaces.
- **Decisión 9**: todo lo marcado "validar con tejedora" en este ADR queda pendiente de T1b, que se suma a la ronda de las fases 2 y 3.

## Enmiendas por T1 (2026-11-13)

Registradas por `arquitecto` a partir de la revisión T1 de `experto-tejido` ([casos de dominio de la fase 4](../casos-dominio-fase-4.md), "Decisión 6" y "Correcciones para las enmiendas de los ADR"). Los números C-* son los de ese documento; C-9 y C-10 se comparten con el ADR 0010.

| ID | Clase | Sección | Enmienda |
|---|---|---|---|
| C-9 | Mejora | 4 y 5 (M1) | La V1 con cadeneta en aro (`spiral` o `joined`) que no consume `count` es **advertencia** con la pista del aro. Advertencia nueva `PART_START_RING_SHORT` para una cadeneta en aro de 1. M1 enmendada: un v1 migrado conserva sus códigos de error y solo puede sumar las advertencias e informaciones nuevas de la v2 |
| C-10 | Mejora | 4 | Pista "¿escribiste la cadeneta de subida o el pd de unión como puntos? No cuentan" en los desajustes de 1 o 2 puntos en vueltas cerradas e hileras |
| C-13 | Error de dominio | 1, 2, 3, 5, 7 y consecuencias | **Decisión 6 resuelta: `stuffing` y el inicio en óvalo quedan fuera de la v2.** La v2 tiene solo `layout` y `copies`. `stuffing` no está en los tipos ni en `SCHEMA_KEYS`; `Inicio: óvalo N` es `PARSE_START` con mensaje claro. Si se retoman, van en una v3 con su ADR |
| C-14 | Mejora | 7 | Encabezado de copias: se escribe "Cantidad: N"; se leen también "Hacer", "Piezas" y "Tejer", con o sin dos puntos. En la interfaz, "se teje N veces" y no "copias" |
| C-15 | Ambigüedad terminológica | 8 | Tabla UK confirmada con el CYC: `sc` = dc, `hdc` = htr, `dc` = tr, `tr` = dtr, `slst` = ss, `dec` = dec o dc2tog, `sk` = miss (provisional). `sc` en `es-uk` es error de lectura con pista |
| C-16 | Ambigüedad terminológica | 8 | `Dialect` agrega `uk`. Alias cargados por modo (RT5). US escribe "sl st". `sc2tog` no es alias en `es-uk` (allí la disminución de pb es `dc2tog`). Extensión de `arquitecto`: también `hdc` en `es-uk`, y `htr` y `dtr` en `es-us`, dan la pista del otro dialecto |
| C-17 | Mejora | 9 | "Dónde va cada pieza" sin distancia en puntos desde el inicio de la vuelta, y aclarando que se cuenta desde el anillo mágico (o la cadeneta inicial) |
| C-18 | Mejora | 3b | Se mantienen los cinco límites recomendados (20, 10, 100, 200 y 40.000) |
| C-19 | Mejora | 4 | Hileras con anillo mágico: información `PART_START_FLAT_RING` |
| C-20 | Mejora | 4 | Información `MAGIC_RING_UNUSUAL` con una V1 de menos de 3 o más de 12 puntos sobre anillo mágico (umbral provisional) |
| C-21 | Ambigüedad terminológica | 8 | "Cadeneta de subida", "pd de unión" y "cadeneta de giro" entran al glosario con la advertencia de que no cuentan como puntos |

**Lo que no cambia**: la posición C con expresión mixta, `schemaVersion: 2` con migración trivial, el editor III, los topes duros de `LIMITS`, RT1 a RT6 y las propiedades de la sección 6.

**Riesgos abiertos**:

- Los códigos nuevos (`PART_START_RING_SHORT`, `PART_START_FLAT_RING`, `MAGIC_RING_UNUSUAL`) son propuestos por `arquitecto` a partir de C-9, C-19 y C-20; `motor-patrones` puede renombrarlos en T4 si choca con la convención de `validate.ts`, actualizando esta tabla.
- El umbral de `MAGIC_RING_UNUSUAL` (3 a 12), la lectura de la cadeneta en aro (un punto en cada cadeneta) y el término "Cantidad" son "validar con tejedora" (T1b). Cambiarlos no cambia el documento.
- Con el óvalo fuera, los patrones con base ovalada se escriben con `Inicio: AM` y la V1 con sus puntos finales, y el 3D los dibuja redondos (F4-57). El aviso de prototipo lo cubre, pero puede confundir: la ayuda de la sintaxis lo dice.

## Enmiendas por la implementación del grupo B (2026-11-13)

Registradas por `arquitecto` a partir de T4 (commit `e4db73e`), T6 (commit `29b1cde`) y T8 (commit `18a0f02`) de la fase 4. Cada punto se verificó contra `packages/pattern-core/src/` (`validate.ts`, `limits.ts`, `text.ts`, `stitches.ts`, `edit-written.ts`), `packages/pattern-core/test/support/validate-v1.ts` y `supabase/migrations/20261113180000_perfil_dialecto.sql`. Las enmiendas de T5 (forma) están en el [ADR 0010](0010-geometria-3d-amigurumi.md#enmiendas-por-la-implementación-de-t5-2026-11-13).

### T4: esquema v2 y validador

| ID | Clase | Sección | Enmienda |
|---|---|---|---|
| T4-1 | Cambio de contrato | 4 | Los cinco códigos (`ROUND_CONSUMPTION_MISMATCH`, `ROUND_COUNT_MISMATCH`, `ROUND_ZERO`, `ROUND_RANGE_CHANGES`, `ROUND_NUMBERING`) están en `DRAFT_ERROR_CODES`: el documento se guarda como borrador (`savable`); tejer, publicar, exportar y aceptar una salida de IA siguen exigiendo `valid`. Registrado como [E12 del ADR 0006](0006-guardado-de-disenos.md#enmienda-e12-2026-11-13-borradores-de-patrones-escritos-fase-4-t4) |
| T4-2 | Contrato nuevo | 4 | **Pistas en `data.hints`** (`Array<"ring" \| "join" \| "turning_chain">`), además del texto al final del mensaje, para que la interfaz las muestre aparte. `ring`: `ROUND_CONSUMPTION_MISMATCH` en la V1 sobre cadeneta en aro (advertencia, C-9). `turning_chain`: `ROUND_CONSUMPTION_MISMATCH` en hileras, con cualquier diferencia (advertencia; "revisa si la cadeneta para girar cuenta como punto", F4-6). `join`: `ROUND_CONSUMPTION_MISMATCH` y `ROUND_COUNT_MISMATCH` en vueltas cerradas o hileras con 1 o 2 puntos de diferencia (C-10); nunca en espiral. Sin pistas, `data` no lleva la clave `hints`. Textos provisionales (`documentador`, T18) |
| T4-3 | Precisión | 4 | `MAGIC_RING_UNUSUAL` sale **solo en espiral y vueltas cerradas**, no en hileras (ahí ya está `PART_START_FLAT_RING`). Además exige que la V1 produzca más de 0 puntos |
| T4-4 | Endurecimiento deliberado | 3 y 5 (M1) | **Tope de lo que trabaja una vuelta**: `LIMIT` (estructural) cuando `consumed` supera `LIMITS.maxRoundStitches`, además del tope de lo que produce (si las dos se pasan, se informa solo el de `produced`). Acota `expandRound` ante una vuelta de `saltar` desmedida. **Rompe M1 a propósito**: un v1 hostil que era `savable` deja de serlo. Ningún documento real cambia (la base no tiene patrones escritos, auditoría T2) |
| T4-5 | Precisión | 4 | `ROUND_NUMBERING` con un número entre −`LIMITS.maxRounds` y 0 (−1000 a 0): la vuelta se sigue revisando y contando (error de tejido). **Bajo −`maxRounds`** da además `LIMIT` (estructural) y no se cuenta: desde −1e308, `n++` no avanza. Sobre `maxRounds`, solo `LIMIT` |
| T4-6 | Contrato nuevo | 3 | `LIMITS` agrega **`maxRotationDeg: 180`** y **`maxPlacements: 2500`** (`maxParts × maxCopies`). Los códigos que emite el validador de `layout` se informan **como máximo 20 veces cada uno** (`MAX_LAYOUT_ISSUES_PER_CODE`). Ver la diferencia con el código en "Lo que no coincide" |
| T4-7 | Precisión | 5 (M1) | **M1 se prueba contra un validador v1 congelado** (`packages/pattern-core/test/support/validate-v1.ts`), copia de `validate.ts` anterior a T4. Es solo de pruebas y no se actualiza: si cambiara, M1 dejaría de comparar con la v1 real |

### T6: texto y operaciones

| ID | Clase | Sección | Enmienda |
|---|---|---|---|
| T6-1 | Precisión de contrato | 6 y 7 | **Anidación del lector alineada con el validador**: `LIMITS.maxNesting` (6) son **6 niveles de ítems**, es decir, la vuelta y **5 grupos anidados**. `parseRound` da `PARSE_NESTING` desde 6 corchetes anidados, y una `ItemPath` llega a **6 índices**. **`BlockEditPolicy.maxEditDepth` y `canEditBlock` de T15 usan esta misma definición** (niveles de ítems, con 1 = ítems de la vuelta), y CA4-E11 ("editar un ítem a 6 niveles") también |
| T6-2 | Desvío | 7 | **Encabezados en inglés**: en `us` y `uk`, `formatPart` escribe `Make: N` (y también `Part:`, `Start:`, `Construction:`, `Yarn:`, `Finish:`, con el prefijo de vuelta `R`). `parsePart` lee `Make` en los dos modos, junto con "Cantidad", "Hacer", "Piezas" y "Tejer" |
| T6-3 | Ambigüedad terminológica | 8 | **Alias**: se quita "pr" (punto raso, variante regional sin respaldo, F4-69); "ss" no se lee en `es-us` (solo `es-uk`); **`invdec`, `sk` y `skip` quedan solo en `es-us`** (lectura estricta de C-16: en `es-uk` la disminución es `dec` o `dc2tog` y saltar es `miss`). **Pendiente de `experto-tejido`** (T21) |
| T6-4 | Semántica de operaciones | 6 y 7 | `moveItem`: `to` es la ruta **después** de mover (se quita de `from` y se inserta en `to` sobre la vuelta ya sin el ítem). `unwrapGroup` repite los ítems `times` veces (el conteo no cambia). `insertRound` y `replaceRound` **ignoran `number`** del argumento y renumeran (conservan el largo del rango). Se leen `V0:` y vueltas negativas (dan `ROUND_NUMBERING`, error de tejido, así un borrador hace la ida y vuelta). Dos líneas `Cierre:` se juntan en un cierre de varias líneas. Una nota o cierre que solo tiene espacios se omite (regla 6 de `normalizePart`). **Una operación que agregaría un error estructural que la entrada no tenía devuelve la entrada sin cambios** (misma referencia) |
| T6-5 | API real | 7 y 8 | `Dialect = "es" \| "us" \| "uk"`; `ReadingMode = "es-us" \| "es-uk"`; `readingModeFor(dialect)` (`uk` → `es-uk`; `es` y `us` → `es-us`); `PARSE_LIMITS = { maxTextLength: 100_000, maxLineLength: 2_000 }` (unidades UTF-16). Códigos `PARSE_*` que este ADR no nombraba y pasan a ser contrato (la interfaz y `documentador` los usan): `PARSE_TOO_LONG` y `PARSE_LINE_TOO_LONG` (los dos topes de `PARSE_LIMITS`), `PARSE_TOO_MANY_PARTS` (`parseWrittenParts`, más de `LIMITS.maxParts`), `PARSE_NESTING` (más de 5 grupos anidados), `PARSE_COPIES` (encabezado de copias sin un número de 1 a `LIMITS.maxCopies`), `PARSE_NOTE` (línea `>` sin vuelta ni cierre encima) y `PARSE_COMMENT` (advertencia, en `warnings`, también cuando la lectura falla). `PARSE_UNKNOWN_STITCH` lleva `data.hint` y `data.mode` cuando hay pista del otro dialecto; `PARSE_START` cubre el óvalo |
| T6-6 | Huecos abiertos | 3, 7 y RT1 | Ver "Huecos para T20" abajo |

**Huecos para T20 (propuestas, no decididas)**:

- **`start.count` y `expected` no tienen tope superior.** El validador solo pide un entero (≥ 1 o ≥ 2 en `start.count`, ≥ 0 en `expected`). Un `expected` de 1e20 es `savable`, pero el texto no lo representa: `formatPart` lo escribe y `parsePart` lo rechaza (`PARSE_NUMBER`), así que RT1 no se cumple para ese documento. **Propuesta**: `expected` ≤ `LIMITS.maxRoundStitches` y `start.count` ≤ `LIMITS.maxRoundStitches` (o un tope propio de la cadeneta), como `LIMIT` estructural. Hay que verificar que no rompa M1 con documentos reales (la base no tiene escritos).
- **No hay tope de ítems por vuelta** distinto de `LIMITS.maxItemCount` (que acota la cantidad de un punto, no la cantidad de ítems), así que una vuelta `savable` puede escribirse en una línea de más de 2.000 caracteres, que `parsePart` rechaza (`PARSE_LINE_TOO_LONG`): RT1 tampoco se cumple. **Propuesta**: un tope de ítems por vuelta (por ejemplo, `LIMITS.maxRoundItems`, contando los de todos los grupos), calibrado para que la peor vuelta formateada quepa en `PARSE_LIMITS.maxLineLength`, o que `formatPart` corte la vuelta en varias líneas.
- **Tope de 20 por código en `layout`** (ver "Lo que no coincide").
- Los decide `revisor-seguridad` en T20 con `motor-patrones`; `qa-tester` agrega en T19 las pruebas de RT1 en el borde.

### T8: preferencia de dialecto

| ID | Clase | Sección | Enmienda |
|---|---|---|---|
| T8-1 | Confirmación | 8 | `profiles.pattern_dialect text not null default 'es'` con `check (pattern_dialect in ('es', 'us', 'uk'))` (`20261113180000_perfil_dialecto.sql`), permiso de UPDATE por columna para la propia fila y Server Action. Coincide con la sección 8. Guarda el dialecto de escritura; **T14 lo traduce con `readingModeFor`** para leer. **Falta aplicar la migración y repetir `10_rls_check.sql` en el proyecto real** |

### Lo que no coincide con el código

- **Tope de 20 por código en `layout` (T4-6)**: el tope solo vale para los códigos que pasan por el emisor de `validateLayout` (`SHAPE`, `LIMIT` de números, `LAYOUT_*`). Dos caminos no lo respetan:
  - `UNKNOWN_KEY` tiene su propio tope de 20, pero **por documento** (`MAX_UNKNOWN_KEY_ISSUES`), no por `layout`;
  - la revisión de texto del identificador de parte en `target` y `host` (`checkText`: `LIMIT` por largo y `TEXT_CONTROL_CHAR`) escribe directo en la lista **sin tope**. Con 2.500 ubicaciones, un documento hostil produce hasta unos 5.000 problemas. Queda para T20: pasar esa revisión por el emisor con tope.

**Lo que no cambia**: la posición C con expresión mixta, `schemaVersion: 2` con migración trivial, el editor III, RT1 a RT6 (salvo los huecos de arriba, que piden topes nuevos) y los límites recomendados.
