# ADR 0011: Posición de las partes, `schemaVersion: 2`, editor de texto y bloques, y glosario

- Estado: **aceptado** (2026-11-13, T0 de la fase 4), con las enmiendas de las [decisiones de la fase 4](../roadmap.md#decisiones-de-la-fase-4-aprobadas-el-2026-11-13) (ver [Enmiendas por las decisiones de la usuaria](#enmiendas-por-las-decisiones-de-la-usuaria-2026-11-13)): editor de bloques básico preparado para la versión completa (decisión 2) y límites recomendados solo como advertencia (decisión 5). Lo marcado "validar con `experto-tejido`" se confirma en T1 de la fase 4 antes de implementarse; lo marcado "validar con tejedora", en T1b.
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
| `Part.copies` | Sí | Partes que se tejen N veces, sin duplicarlas (validar el término con `experto-tejido`) |
| `Part.stuffing` | **Condicional** | Relleno o pieza plana (una oreja sin relleno se aplasta en el 3D). Entra solo si T1 confirma sus valores y su efecto antes de que empiece T4 ([decisión 6](../roadmap.md#decisiones-de-la-fase-4-aprobadas-el-2026-11-13), aprobada) |
| `PartStart` de cadeneta en óvalo | **Condicional** | Bases ovaladas (trabajar alrededor de la cadeneta). Hoy `startAvailable` supone una cadeneta cerrada en aro. Entra solo si T1 da la regla de consumo de la primera vuelta antes de que empiece T4 (decisión 6). Si no llega, los dos campos quedan para una v3 con su ADR |
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
  /** Cuántas veces se teje la parte. Omitido = 1. */
  copies?: number;
  /** Condicional (sección 1). */
  stuffing?: "stuffed" | "unstuffed";
}

export interface WrittenPattern extends PatternBase {
  kind: "written";
  parts: Part[];
  assembly?: string[];
  layout?: Layout;
}
```

- **Unidades**: cm y grados. Las posiciones libres no siguen a la muestra, pero las ancladas sí. Por eso lo normal es anclar, y libre queda solo la pieza principal.
- **Sin espejo**: la segunda oreja se teje igual que la primera y se gira. Un espejo mostraría una pieza que no existe.
- **`SurfaceAt` también vale sobre partes en hileras**: `round` es la fila y `stitch` el punto de la fila (`surfaceFrame` del ADR 0010).
- **No guarda medidas derivadas** (radios ni posiciones resueltas). Se calculan siempre.
- **Los tipos v1** quedan como `PatternV1` en `migrate.ts`, solo para las pruebas de migración.

### 3. Validación v2

Claves nuevas en `SCHEMA_KEYS`: `layout`, `placement`, `partRef`, `freeAt` y `surfaceAt`; en `part`, `copies` (y `stuffing` si entra).

| Código | Severidad | Regla |
|---|---|---|
| `PART_COPIES` | error estructural | `copies` es entero entre 1 y `LIMITS.maxCopies` |
| `LAYOUT_TARGET_UNKNOWN`, `LAYOUT_HOST_UNKNOWN` | error estructural | La parte no existe |
| `LAYOUT_COPY_RANGE` | error estructural | `copy` fuera de 0 a `copies − 1` |
| `LAYOUT_DUPLICATE` | error estructural | Dos entradas para la misma copia |
| `LAYOUT_CYCLE` | error estructural | Una pieza anclada a sí misma o un ciclo de anclas |
| `LAYOUT_DEPTH` | error estructural | Cadena de anclas de más de `LIMITS.maxLayoutDepth` |
| `LIMIT` | error estructural | Números no finitos o fuera de cota: posiciones de ±`LIMITS.maxPositionCm`, rotaciones de −180 a 180, separación de ±`LIMITS.maxOffsetCm` y `round`, `stitch` y `placements.length` acotados |
| `LAYOUT_ANCHOR_RANGE` | advertencia | La vuelta o el punto ya no existen en el anfitrión (por ejemplo, después de borrar vueltas). El 3D acota y lo dice. Es advertencia para que editar el anfitrión nunca impida guardar |

- **Los errores estructurales de `layout` no pueden aparecer editando**: las operaciones de la sección 6 limpian las referencias. Solo llegan con documentos armados a mano o generados por IA (fase 5), y ahí el validador es la barrera.
- **El ciclo y la profundidad** se revisan en tiempo lineal, sin recursión sin tope (`revisor-seguridad`, T20).
- **Topes duros nuevos en `LIMITS`** (errores estructurales; protegen al motor, no son la recomendación de la sección 3b): `maxCopies: 50`, `maxLayoutDepth: 16`, `maxPositionCm: 1000`, `maxOffsetCm: 100`; `placements.length` hasta `maxParts × maxCopies`. Son holgados a propósito: con la decisión 5, la usuaria puede pasar los límites recomendados, así que el tope duro tiene que quedar bastante más arriba (10 copias recomendadas, 50 como tope). `motor-patrones` puede ajustarlos en T4 con su razón, como enmienda de este ADR; subirlos después es compatible, bajarlos no.

### 3b. Límites recomendados (decisión 5: solo advertencia)

Son los valores de la opción (a) de la decisión 5: **20 partes, 10 copias por parte, 100 vueltas por parte, 200 puntos por vuelta y 40.000 puntos en la escena**. No bloquean nada: si se superan, la interfaz advierte y la usuaria decide si sigue. Qué hace el 3D fuera de ellos está en el ADR 0010, sección 6c.

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
- **No cambia la forma del documento**, pero sí lo que se acepta guardar. Se registra como enmienda del ADR 0006 cuando T4 lo implemente.

### 5. Migración v1 → v2 y compatibilidad

**Paso de migración** (`STEPS[1]` en `migrate.ts`): devuelve una copia con `schemaVersion: 2`. Todos los campos nuevos son opcionales y sus valores por omisión equivalen a la v1: `copies` omitido es 1, sin `layout` la ubicación es automática y sin `stuffing` la pieza se ve rellena. **No transforma datos**: las notas y los cierres de varias líneas se conservan, porque la sintaxis de texto nueva los admite (sección 7).

**Propiedades de la migración** (con los fixtures v1 del repositorio y documentos v1 aleatorios):

| # | Propiedad |
|---|---|
| M1 | Un v1 `valid` (o `savable`) migrado es v2 `valid` (o `savable`), con los mismos códigos de problemas salvo `SCHEMA_VERSION` |
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
  - `moveItem(pattern, partId, roundIndex, from: ItemPath, to: ItemPath)` es general: mueve entre grupos y niveles distintos. La v1 lo usa solo para "subir" y "bajar" entre hermanos; arrastrar y soltar usará la misma operación.
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

**Sintaxis nueva** (v2; los términos los valida `experto-tejido` en T1):

```
Parte: Oreja
Cantidad: 2                # término a validar ("Hacer: 2", "Piezas: 2"…)
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
- **Con `stuffing`** (si entra), un encabezado "Relleno: sí | no" (validar con `experto-tejido`).

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
     maxEditDepth: number;   // v1: 2; versión completa: LIMITS.maxNesting
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
- La tabla UK (por ejemplo, `sc` = "dc", `hdc` = "htr", `dc` = "tr", `tr` = "dtr") la confirma `experto-tejido` en T1 (validar con `experto-tejido`).

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

- **Datos**: los del [glosario pendiente](../roadmap.md#glosario-pendiente) más los de amigurumi de T1. **Las variantes regionales del español** (Chile como base; otras) se cargan solo con lo que entregue `experto-tejido`, en estado "pendiente". No se inventan.
- **Pruebas**: cada código de `STITCHES` tiene entrada en los tres dialectos; ninguna clave falta en `es`; los datos no tienen marcas ni nombres de tienda (como CA3-L11).
- **Preferencia de la usuaria**: el dialecto con que ve y escribe los patrones se guarda en `profiles.pattern_dialect` (`'es' | 'us' | 'uk'`, por omisión `'es'`), con una migración pequeña y RLS de la propia fila ([decisión 4](../roadmap.md#decisiones-de-la-fase-4-aprobadas-el-2026-11-13), aprobada).
- **Alcance**: la interfaz sigue en español. `glossary` es la terminología de los patrones, no la traducción de la aplicación.

### 9. Armado

- **`assembly: string[]` no cambia**. Son los pasos que escribe la diseñadora.
- **"Dónde va cada pieza"**: junto al armado, el estudio muestra una lista derivada de `layout` y del perfil del anfitrión. Por ejemplo, "Oreja (1 de 2): cabeza, entre la V10 y la V11, a 4 puntos del inicio de la vuelta". **No se copia** en `assembly`: sería una segunda fuente que se desincroniza. El texto exacto lo valida `experto-tejido`.
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
- Los patrones escritos se pueden guardar como borrador con errores de conteo (enmienda del ADR 0006 en T4).
- `follow` (fase 6) recorre parte × copia, y `project_progress` necesitará la copia.
- La interfaz deja de reescribir lo que la usuaria tipea mientras escribe, pero sí al salir de la línea. Es una decisión visible ([decisión 7](../roadmap.md#decisiones-de-la-fase-4-aprobadas-el-2026-11-13)).
- Los campos condicionales (`stuffing` y el inicio en óvalo) dependen de T1. Si no llegan antes de T4, quedan para una v3 con su ADR.
- La preferencia de dialecto agrega una columna a `profiles`. Pasa por `revisor-seguridad`.
- Los límites recomendados no impiden nada: un diseño puede tener 30 partes y seguir siendo `valid`. La regla de oro 7 se garantiza dentro de ellos (ADR 0010, sección 6c), y la interfaz lo dice desde el inicio.
- El editor de bloques v1 es básico, pero el núcleo, el árbol de bloques y el almacén ya soportan la profundidad completa. La versión completa es trabajo de interfaz, no de modelo.

## Enmiendas por las decisiones de la usuaria (2026-11-13)

La usuaria aprobó el ADR, `schemaVersion: 2` y el posicionado anclado ([decisiones 1 y 3](../roadmap.md#decisiones-de-la-fase-4-aprobadas-el-2026-11-13), opción a). Cambios al texto propuesto:

- **Decisión 2 (editor de bloques básico, preparado para la versión completa)**: sección 7, con el alcance de la v1, la tabla de lo que queda fuera y por qué (anidación de 6 niveles, arrastrar y soltar), y lo que la deja preparada: operaciones con profundidad completa (sección 6), árbol `BlockNode` recursivo, `BlockEditPolicy` como único lugar del tope de 2 niveles, estado por rutas y deshacer por acción. Se verifica con CA4-E11. La versión completa queda como fase futura en la hoja de ruta.
- **Decisión 5 (límites solo como advertencia)**: nueva sección 3b con `RECOMMENDED_WRITTEN_LIMITS`, `recommendedLimitUsage` y `recommendedLimitNotices`, fuera del validador, y cómo la interfaz los informa antes de alcanzarlos y al superarlos. Topes duros nuevos de `LIMITS` en la sección 3 (`maxCopies: 50`, `maxLayoutDepth: 16`, `maxPositionCm: 1000`, `maxOffsetCm: 100`). Las operaciones respetan solo los topes duros (sección 6).
- **Decisión 4 (glosario ES, US y UK con preferencia en el perfil)**, **6 (campos condicionales solo con reglas de T1 antes de T4)** y **7 (forma canónica al salir de la línea)**: aprobadas tal como estaban; solo se actualizan los enlaces.
- **Decisión 9**: todo lo marcado "validar con tejedora" en este ADR queda pendiente de T1b, que se suma a la ronda de las fases 2 y 3.
