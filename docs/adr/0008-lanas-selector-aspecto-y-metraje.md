# ADR 0008: Lanas del diseño: selector, vista previa al pasar el cursor, aspecto por fibra, lanas guardadas y metraje estimado

- Estado: aceptado (aprobado por la usuaria el 2026-11-09 con las decisiones recomendadas 2 a 8 del roadmap). Las constantes de dominio (factores de metraje, niveles por fibra, umbral de color cercano) se confirman con `experto-tejido` (T1) y `catalogo-lanas` antes de implementarse. Revisión T1 hecha el 2026-11-09: ver [Enmiendas tras la revisión de dominio T1](#enmiendas-tras-la-revisión-de-dominio-t1-2026-11-09) y los casos F3-14 a F3-36 de [casos-dominio-fase-3.md](../casos-dominio-fase-3.md); los niveles por fibra siguen a cargo de `catalogo-lanas` en T6.
- Fecha: 2026-11-09
- Paquetes: `packages/yarn-catalog`, `packages/pattern-core`, `packages/stitch-render`, `apps/web`, `supabase/`
- Relacionado: [ADR 0001](0001-modelo-canonico.md) (modelo de `yarns`), [ADR 0002](0002-nucleo-sin-dependencias.md), [ADR 0003](0003-colorwork-en-esquema-v1.md) (muestra supuesta, `validateYarn`, E11, E16), [ADR 0004](0004-render-de-puntos-2d.md) (E4: `fiberEffects`; `setPreviewOverride`; presupuesto de 100 ms)

## Contexto

En la fase 2 el estudio tiene un editor de lanas mínimo (`YarnPanel.tsx`): color de la paleta en un `<select>`, color personalizado con `<input type="color">`, grosor, composición validada con `validateYarn` y nota privada. La fase 3 completa la modalidad 3 de `CLAUDE.md`. Hechos del código:

- **Modelo**: `Yarn = { id, weight (0–7), composition: {fiber, percent}[], color: {hex, paletteId?}, note? }`. El documento es cerrado (ADR 0003, E16): no admite campos nuevos sin `schemaVersion: 2`.
- **`yarn-catalog`**: `WEIGHTS` (con `nombre`, `ingles`, `alias` y `fuentesAlias`), `FIBERS` (con `halo`, `brillo`, `definicion` en bajo/medio/alto), `PALETTE` (48 colores en 8 familias de 6), `suggestedGauge`, `hexToLab`, `deltaE2000`, `nearestPaletteColor`. Sin dependencias.
- **`stitch-render`**: `yarnLook(yarn, fibers, { fiberEffects })` ya deriva halo, brillo y definición ponderados por porcentaje, y el backend Canvas 2D ya los dibuja. **Está apagado** (E4 del ADR 0004): el estudio llama `yarnLook(y, FIBERS)` sin la opción. `setPreviewOverride` ya existe e invalida solo las instancias de la lana afectada.
- **Detalle encontrado**: `PreviewEngine.#applyLooks` decide si cambió el aspecto con una clave de color y fibras, **sin porcentajes ni grosor**. Con `fiberEffects` activado, cambiar 70/30 a 30/70 no actualizaría el aspecto.
- **`user_yarns`** ya existe: `weight`, `composition` (validada por `composition_is_valid`, fibra de 1 a 40 caracteres), `color_hex`, `palette_id` (FK a la paleta), `note` (≤ 200), tope de 500 por usuaria, RLS de dueña. No tiene `updated_at` ni nombre.
- **Margen de latencia**: el peor p95 medido es 89,2 a 91,2 ms con CPU ×4 (QA de la fase 2, ADR 0004 E7). Cualquier costo nuevo en el camino de dibujo se mide.

## Decisión

### 1. Sin cambios al documento

Todo lo de esta fase cabe en `Yarn` tal como está: `schemaVersion` sigue en 1. No se agregan nombre de lana, marca, metros por ovillo ni enlaces a `user_yarns` en el documento.

### 2. Selector de lanas (dominio en `yarn-catalog`, interfaz en `apps/web`)

- **Grosor**:
  - Muestra las 8 categorías con el nombre en español rotulado como "nombre de LoopitaLab" (glosario pendiente), los nombres en inglés y los alias.
  - Los alias con entrada en `fuentesAlias` (tomados de una tienda) se muestran como **equivalencia aproximada**, sin nombrar la tienda en el selector (regla de oro 9: las tiendas son solo referencia de terminología; la fuente queda en la ayuda "Sobre los nombres de los grosores"). El glosario pendiente pide no tratar "Mediano", "Grueso" y "Súper Grueso" como sinónimos exactos.
  - Búsqueda por cualquier nombre o alias ("aran", "dk", "mediano", "fingering"), sin distinguir tildes ni mayúsculas. Función pura nueva en `yarn-catalog`:

    ```ts
    export interface WeightMatch { cat: number; matched: string; kind: "name" | "english" | "alias"; approximate: boolean }
    /** Categorías que coinciden con el texto (normalizado sin tildes ni mayúsculas), ordenadas por categoría. Reglas precisadas en la enmienda T1-8. */
    export function findWeights(query: string): WeightMatch[];
    ```
  - Al elegir el grosor se muestran agujas y crochet sugeridos (`agujasMm`, `crochetMm`) y la muestra inicial (`suggestedGauge`), siempre marcada "supuesto" hasta que la usuaria ingrese la suya (CA-F4 de la fase 2 sigue vigente: la muestra supuesta nunca se escribe en el documento). La categoría 7 mantiene el aviso de baja confianza.
- **Composición**: lista de fibras del catálogo con porcentaje, validada con `validateYarn` (suma 100 ± 0,01, porcentajes mayores que 0, hasta 10 fibras como en `composition_is_valid`). La interfaz no deja agregar una fibra repetida. Las fibras desconocidas avisan, no bloquean (E11 del ADR 0003). Una composición inválida nunca entra al documento ni a `user_yarns` (el borrador vive en el estado del formulario, como en la fase 2).
- **Color**:
  - **Paleta propia 8 × 6** como cuadrícula de muestras (una fila por familia), con nombre accesible por muestra, navegación con flechas (foco itinerante) y estado seleccionado que no depende solo del color (borde y marca).
  - **Personalizado**: selector de color más campo hexadecimal. Debajo, el color de la paleta más cercano (`nearestPaletteColor`, CIEDE2000) con su nombre y la diferencia, y el botón "Usar {nombre}". Si la diferencia es menor que `NEAR_COLOR_DELTA_E` (propuesta 2,3, la diferencia apenas perceptible; constante con nombre en `yarn-catalog`), se rotula "prácticamente igual".
  - Un hex que no es de la paleta nunca lleva `paletteId` (`withColor`, sin cambio).

  ```ts
  // yarn-catalog
  export const NEAR_COLOR_DELTA_E = 2.3;
  /** Los `k` colores de la paleta más cercanos, de menor a mayor diferencia. `nearestPaletteColor` es el caso k = 1. */
  export function nearestPaletteColors(hex: string, k: number): { color: PaletteColor; deltaE: number }[];
  ```

### 3. Vista previa al pasar el cursor

- **Qué**: al pasar el cursor (o el foco del teclado) por una muestra de la paleta, por el color más cercano o por una lana guardada, la vista previa realista muestra la lana `i` del diseño con ese color (y, en una lana guardada, también con su composición), **sin tocar el documento**.
- **Cómo**: `PreviewEngine` agrega un método fuera de React, en el mismo camino directo de T10:

  ```ts
  /** Vista previa de la lana `index` con otro aspecto, sin tocar el documento. `null` la quita. */
  previewYarn(index: number, candidate: Pick<Yarn, "color" | "composition"> | null): void;
  ```

  Calcula `yarnLook({ ...yarn, ...candidate }, FIBERS, { fiberEffects })` y llama `renderer.setPreviewOverride({ yarn: index, look })` y `requestRender()`. Instrumentación `hover-to-paint` con el mismo recolector de `edit-to-paint` (`?perf=1`).
- **Reglas**:
  - No pasa por el almacén ni por el historial; no dispara autoguardado ni validación (propiedad: el documento es el mismo objeto antes y después de cualquier secuencia de vistas previas).
  - Se quita al salir del control, al perder el foco, con Esc y al cerrar el selector. Elegir (clic, Enter o toque) confirma con **un** paso de deshacer (`updateYarn`) y quita la vista previa.
  - En pantallas táctiles no hay "pasar el cursor" (`pointerType === "touch"`): tocar elige directamente, y se puede deshacer.
  - La cuadrícula del editor de motivo también puede mostrar el color en vista previa (es un canvas barato); es deseable, no obligatorio.
- **Presupuesto**: p95 de `hover-to-paint` < 100 ms en el escenario de la fase 2 (40.000 puntos, plano, tubo, círculo y copa, CPU ×4), **con `fiberEffects` activado**. Si no se cumple en el círculo, aplica el criterio de WebGL2 del ADR 0004 con una enmienda.

### 4. Aspecto por fibra

- `fiberEffects: true` pasa a ser el **valor por defecto del estudio y de la pantalla "Tejiendo"** cuando `render-puntos` y `catalogo-lanas` calibren los niveles y se cumplan los presupuestos. Hasta entonces sigue apagado.
- **Calibración**: los niveles bajo / medio / alto de `fibras.json` (halo, brillo, definición) los revisan `catalogo-lanas` y `experto-tejido`. El mapeo a 0 / 0,5 / 1 de `look.ts` se mantiene salvo que la revisión visual pida otro. Las fibras desconocidas siguen neutras (no se inventa).
- **Corrección necesaria**: la clave de `#applyLooks` debe incluir grosor, fibras **y porcentajes** (o comparar los `YarnLook` resultantes con `lookKey`), para que un cambio de porcentaje actualice el aspecto.
- **Interruptor "Colores planos"** (deseable): vuelve al aspecto neutro para quien necesite ver el color sin halo (baja visión, daltonismo, comparar con la tarjeta de colores). Es una preferencia de vista, no del documento.
- El aviso de prototipo digital (regla de oro 8) sigue fijo: el halo y el brillo son una aproximación.

### 5. Lanas guardadas (`user_yarns`)

- **Sin migración de esquema** para los datos (la tabla ya tiene lo necesario). `backend-supabase` revisa si conviene agregar `updated_at` para ordenar y para concurrencia; no es requisito.
- **Copia por valor, nunca por referencia**:
  - "Guardar en mis lanas" copia grosor, composición, color (`color_hex`, `palette_id`) y nota de una lana del diseño a `user_yarns`.
  - "Usar en este diseño" copia grosor, composición y color de una lana guardada a una lana del diseño (agregar o reemplazar), como un paso de deshacer. **La nota no se copia por defecto** (casilla "copiar también la nota", desmarcada): la nota suele llevar la marca o dónde se compró, y es de la lana de la usuaria, no del diseño.
  - Editar una lana guardada no cambia ningún diseño. El documento no guarda el id de `user_yarns` (seguiría siendo un campo nuevo, y el documento es cerrado).
- **Regla de oro 9**: la marca solo existe como texto libre privado en la nota (`user_yarns.note`, `yarns[].note`). El catálogo nunca tiene marcas. La nota de `user_yarns` no aparece en ninguna vista pública (la tabla solo la lee su dueña) y la de `yarns[].note` ya está impedida al compartir (`patterns_shared_without_private_notes`). Los mensajes del validador no citan notas (E14).
- **Largo de la nota**: `user_yarns.note` admite 200 caracteres y `yarns[].note` 500. Al guardar en "Mis lanas" una nota más larga, la interfaz avisa y la recorta solo con confirmación. Se normaliza igual que en el estudio (`normalizeNote`: sin caracteres de control, `\r\n` a `\n`).
- **Servidor**: Server Actions `listUserYarns`, `saveUserYarn`, `updateUserYarn` y `deleteUserYarn`, que validan con `validateYarn` (con el catálogo de fibras y la paleta) además de las restricciones de la base, y traducen el 54000 (tope de 500) a un mensaje claro. El mapeo fila ↔ `Yarn` vive en la capa de aplicación de `apps/web` (`lib/yarns/`), no en el núcleo.
- **Dónde**: pestaña "Mis lanas" dentro del selector del estudio y una página `/lanas` para ver, editar y borrar.

### 6. Metraje estimado

**Quién calcula qué** (regla de oro 2, y sin que `pattern-core` dependa de `yarn-catalog`):

| Capa | Calcula | Por qué ahí |
|---|---|---|
| `pattern-core` | Conteos: puntos por lana y largo de hebras flotantes **en anchos de punto** | Son conteos del gráfico: los hace el motor determinista |
| `yarn-catalog` | Conversión a metros con factores de dominio sobre la lana (largo de la lazada por punto, holgura de las hebras, margen) | Son supuestos sobre la lana y la técnica; el catálogo ya guarda la muestra supuesta. Recibe números, no tipos de `pattern-core`, y sigue sin dependencias |
| `apps/web` | Nada: muestra lo que devuelven los dos paquetes | CA-F2 |

```ts
// pattern-core (chart.ts)
export interface YarnUsage {
  /** Puntos por lana en el gráfico completo. Igual a `yarnTotals`. */
  stitches: number[];
  /** Hebras flotantes por lana en el gráfico completo, en anchos de punto (ver la regla abajo). */
  floatStitches: number[];
}
export function yarnUsage(chart: Chart, yarnCount: number): YarnUsage;

// yarn-catalog
export const YARN_LENGTH_ASSUMPTIONS = {
  /** Largo de la lazada de un punto jersey ≈ 3,8 × su ancho: Munden Kw = 3,8 (lana, punto liso, seco-relajado). Supuesto; fuente en la enmienda T1-6. */
  knitLoopFactor: 3.8,
  /** La hebra flotante se deja un poco floja: 10 % más que el ancho que cruza. Supuesto. */
  floatSlack: 1.1,
  /** Margen por colas, uniones y muestra: 10 %. Supuesto. */
  wasteMargin: 0.1,
  /** Rango que se muestra alrededor de la estimación. */
  rangeLow: 0.85,
  rangeHigh: 1.2,
  /** Paso del redondeo, en metros: `meters` y `high` hacia arriba, `low` hacia abajo (enmienda T1-6). */
  roundToMeters: 5,
} as const;
export type LengthAssumption = "assumed_gauge" | "low_confidence_weight" | "loop_factor" | "float_slack" | "waste_margin";
export interface LengthEstimate {
  /** Metros estimados (con margen), redondeados hacia arriba a `roundToMeters`. */
  meters: number;
  low: number;
  high: number;
  /** Qué supuestos se usaron, para rotularlos en la interfaz. Nunca vacío. */
  assumptions: LengthAssumption[];
}
/** `undefined` en crochet: no hay factores validados (no se inventan, regla de oro 6). */
export function estimateYarnLength(
  usage: { stitches: number; floatStitches: number },
  gauge: { stitchesPer10cm: number },
  opts: { technique: "knit" | "crochet"; gaugeAssumed: boolean; lowConfidence?: boolean },
): LengthEstimate | undefined;
```

**Fórmula** (por lana; `w = 10 / stitchesPer10cm` es el ancho de un punto en cm):

```
cm = (puntos × knitLoopFactor × w + flotantes × floatSlack × w) × (1 + wasteMargin)
metros = ceil(cm / 100 / roundToMeters) × roundToMeters
```

(Rango `low` y `high`: ver la enmienda T1-6.)

- **Regla de las hebras flotantes** (`yarnUsage`): ~~en cada fila del gráfico completo donde hay **dos o más** lanas, cada lana presente en esa fila viaja a lo ancho de toda la fila; su flotante es `rowStitchCount(fila) − sus puntos en la fila`.~~ **Corregida en la enmienda T1-1**: la regla depende de `workedIn` (en redondo, toda la vuelta; en ida y vuelta, del primer al último punto de la lana). Una lana ausente de la fila no suma (se sube por el revés o se corta). Se calcula sobre las filas del motivo multiplicadas por las repeticiones, en `O(celdas del motivo)`.
- **Siempre "estimación"**: la interfaz rotula cada cifra "≈ N m (entre L y H m), estimación" y lista los supuestos (`assumptions`): muestra supuesta si el documento no tiene `gauge`, factor de la lazada, holgura de las hebras, margen y, en la categoría 7, baja confianza. Nunca se muestran gramos ni ovillos: dependen de metros por gramo de una lana concreta (dato de etiqueta) que el modelo no tiene.
- **Muestra usada**: la del documento o la supuesta (`gaugeInUse`), igual que las medidas.
- **Fuera del camino caliente**: se calcula diferido, dentro de `paintGate` (como la validación, CA-P7).
- **Pendiente de `experto-tejido` (T1)** (resuelto en las enmiendas T1-1 y T1-6; lo que queda para tejedoras está al final): el factor 3,8 en colorwork a hebras (la tensión cambia), la holgura del 10 %, el margen, si en ida y vuelta las hebras viajan de orillo a orillo, y el rango mostrado. Pendiente de tejedoras (T1b de la fase 3): comparar con el metraje real de 2 o 3 proyectos terminados.

**Propiedades** (`pattern-core` y `yarn-catalog`):

- `yarnUsage(chart, n).stitches` es igual a `yarnTotals(chart, n)`; su suma es `stitchTotal`.
- Con una sola lana por fila, `floatStitches` es 0 en todas las lanas.
- ~~`floatStitches[i] + stitches[i]` de las filas donde aparece `i` (con dos o más lanas) es igual a la suma de `rowStitchCount` de esas filas.~~ Vale solo en redondo; en ida y vuelta se reemplaza (enmienda T1-1).
- ~~Duplicar `repeat.x` o `repeat.y` duplica `stitches` y `floatStitches`.~~ Precisada en la enmienda T1-1: `repeat.y` duplica siempre; `repeat.x` duplica en redondo y es monótona en ida y vuelta.
- `estimateYarnLength` es monótona en puntos y flotantes, decrece al subir `stitchesPer10cm`, cumple `low ≤ meters ≤ high`, devuelve múltiplos de `roundToMeters` e incluye `"assumed_gauge"` si y solo si `gaugeAssumed`.

## Alternativas descartadas

- **Guardar el nombre o la marca de la lana en el documento**: rompe la regla de oro 9 y exige `schemaVersion: 2`. La nota privada ya cubre el uso.
- **Enlazar la lana del diseño con `user_yarns` por id**: un campo nuevo en un documento cerrado, y un diseño compartido apuntaría a datos privados de otra persona.
- **Vista previa al pasar el cursor como edición con deshacer automático**: ensucia el historial, dispara autoguardado y validación, y cuesta más que cambiar un aspecto en el backend.
- **Calcular el metraje en `apps/web`**: viola CA-F2 y la regla de oro 2.
- **Metraje entero en `pattern-core`**: obliga a poner en el motor supuestos sobre la lana (factor de la lazada) o a depender de `yarn-catalog`. El motor cuenta; el catálogo convierte.
- **Metraje entero en `yarn-catalog`**: tendría que recorrer el gráfico, o sea depender de `pattern-core` y repetir sus reglas de hebras.
- **Metros por ovillo y ovillos necesarios**: requiere un dato de etiqueta por lana que no existe en el modelo ni en `user_yarns`. Se evalúa en la fase 6 o 7, como dato privado del proyecto, no del diseño.
- **`fiberEffects` activado sin medir**: el margen de latencia ya es de unos 10 ms.

## Consecuencias

- `catalogo-lanas` implementa `findWeights`, `nearestPaletteColors`, `NEAR_COLOR_DELTA_E`, `YARN_LENGTH_ASSUMPTIONS` y `estimateYarnLength`, con las primeras pruebas de propiedades de `yarn-catalog` (copia de `test/support/property.ts`, como en los otros paquetes).
- `motor-patrones` implementa `yarnUsage` con sus propiedades y lo documenta en el README.
- `render-puntos` calibra y mide `fiberEffects` y la vista previa al pasar el cursor; corrige la clave de aspectos de `PreviewEngine` junto con `frontend-editor`.
- `frontend-editor` construye el selector, la pestaña "Mis lanas" y el panel de metraje; `backend-supabase` las Server Actions de `user_yarns`.
- `revisor-seguridad` revisa las acciones de `user_yarns` (validación en el servidor, notas privadas, tope).
- La ayuda del estudio explica que el metraje es una estimación y que conviene comprar con margen y tejer una muestra.

## Enmiendas tras la revisión de dominio T1 (2026-11-09)

Revisión de `experto-tejido`; los casos de prueba están en [casos-dominio-fase-3.md](../casos-dominio-fase-3.md) (F3-14 a F3-36). Se mantienen el reparto de capas (el motor cuenta, el catálogo convierte, `apps/web` muestra), la holgura de 1,1, el margen del 10 %, el rango 0,85 a 1,2, `NEAR_COLOR_DELTA_E = 2,3` y los alias de tienda como equivalencia aproximada. Lo que cambia:

### T1-1. Hebras flotantes según el modo de trabajo (C1, casos F3-14 a F3-20)

La hebra de una lana no siempre recorre la fila entera. Regla corregida de `yarnUsage`, por fila del gráfico completo, para cada lana `i` presente en ella con `k_i` puntos:

- **Solo filas con 2 o más lanas**. En una fila de una sola lana, `floatStitches` no suma para ninguna (F3-17).
- **En redondo** (`workedIn: "rounds"`): `floatStitches[i] += N − k_i`, con `N = rowStitchCount(fila)`. La hebra da la vuelta completa.
- **En ida y vuelta** (`workedIn: "rows"`): `floatStitches[i] += (último_i − primero_i + 1) − k_i`, donde `primero_i` y `último_i` son las posiciones del primer y el último punto de `i` en la fila, **contadas en puntos tejidos** (sin las casillas `NO_STITCH`) y a lo ancho de todas las repeticiones horizontales. La hebra no viaja de orillo a orillo: queda donde se usó por última vez.
- **Cálculo** en `O(celdas del motivo)`: por fila del motivo y lana, `k`, `primero` y `último` dentro de la repetición (en puntos tejidos, con `s` = puntos de la fila del motivo); en la fila completa con `R = repeat.x`, `primero = primero_motivo` y `último = (R − 1) × s + último_motivo`. Multiplicado por `repeat.y`.

**Propiedades** (reemplazan la tercera y la cuarta de la sección 6):

- En redondo: `floatStitches[i] + stitches[i]`, sumados sobre las filas con 2 o más lanas donde aparece `i`, es igual a la suma de `rowStitchCount` de esas filas.
- En ida y vuelta: esa misma suma es igual a `Σ (último_i − primero_i + 1)` de esas filas, y nunca supera a `Σ rowStitchCount` de esas filas.
- Para toda lana y fila, `0 ≤` flotante de la fila `≤ N − k_i` (la de ida y vuelta nunca supera a la de redondo).
- Duplicar `repeat.y` duplica `stitches` y `floatStitches` en los dos modos.
- Duplicar `repeat.x` duplica `stitches` en los dos modos y `floatStitches` en redondo. En ida y vuelta `floatStitches` es **monótona** (no decrece), pero puede crecer más que el doble: el hueco entre repeticiones de una misma lana cuenta como flotante (nota de F3-19).

El contrato `YarnUsage` no cambia de forma. `yarnUsage` lee `chart.workedIn`.

### T1-6. Constante de la lazada, redondeo y rótulo (casos F3-21 a F3-27)

- **Cita**: `knitLoopFactor = 3,8` es **Munden Kw = 3,8 (lana, punto liso, seco-relajado)**. Fuente: Munden, D. L., *The geometry and dimensional properties of plain-knit fabrics*, J. Text. Inst. 50(7), 1959, 448-471, citado vía resumen secundario (https://journal.uitm.edu.my/ojs/index.php/JOA/article/download/5292/2841; no se abrió el original). En húmedo-relajado Kw = 4,1. El README de `yarn-catalog` y el comentario de la constante citan la fuente así.
- **Redondeo** (precisa la fórmula de la sección 6), con `m` = metros crudos con margen (`cm / 100`) y `r = roundToMeters`:
  - `meters = ceil(m / r) × r`;
  - `low = floor(m × rangeLow / r) × r`, con un mínimo de `r` cuando `m > 0`;
  - `high = ceil(m × rangeHigh / r) × r`;
  - si `m = 0` (la lana no tiene puntos), los tres son 0.
  - Los tres son múltiplos de `r` y se cumple `low ≤ meters ≤ high`. El rango se calcula sobre `m`, no sobre `meters` (sin doble redondeo).
- **Rótulo**: además de "≈ N m (entre L y H m), estimación" y los supuestos, la interfaz aclara **"solo del gráfico: no incluye elástico, montaje ni remate"** y sugiere tejer la muestra con las lanas del diseño (F3-27).
- Propiedad nueva: `low`, `meters` y `high` son múltiplos de `roundToMeters` (además de `low ≤ meters ≤ high`).

### T1-8. Búsqueda de grosores (casos F3-28 a F3-33)

Reglas de `findWeights` (sin cambio de firma):

- **Normalización**: sin tildes (NFD), minúsculas, sin espacios al inicio o al final, espacios repetidos a uno, y paréntesis, barras y guiones como espacios.
- **Mínimo 2 caracteres** tras normalizar; con menos, devuelve `[]` (F3-33).
- **Coincidencia**: el texto es prefijo de alguna palabra (o de una secuencia de palabras) del nombre, de un nombre en inglés o de un alias. Una entrada por categoría, con la mejor coincidencia (`name` antes que `english` antes que `alias`). Orden: primero las coincidencias exactas del término completo y después las parciales; dentro de cada grupo, por categoría. Así "dk" da primero la cat. 3 ("DK") y después la cat. 2 ("Fino (Light DK)", aproximada), y "grueso" da primero la cat. 5 y después la 6.
- **`approximate: true` en toda coincidencia por alias** (`kind: "alias"`), tenga o no entrada en `fuentesAlias`. El selector rotula "equivalencia aproximada" sin nombrar la tienda. Los nombres en inglés del CYC y el nombre de LoopitaLab no son aproximados.
- **"light"** devuelve la cat. 2 (alias "Fino (Light DK)", aproximada) y la cat. 3 ("Light Worsted", nombre en inglés), cada una con su rótulo (F3-30, validar con tejedora).
- **"4 ply" y "8 ply"** (y cualquier texto con la palabra "ply") devuelven `[]`: el nombre varía por país y no se mapea sin fuente (F3-32, pendiente de tejedora). La ayuda la da una función aparte, para no cambiar la firma de `findWeights`:

  ```ts
  // yarn-catalog
  export type WeightQueryHint = "too_short" | "ply_varies_by_country";
  /** Ayuda para una búsqueda sin resultados útiles. `undefined` si no hay nada que explicar. */
  export function weightQueryHint(query: string): WeightQueryHint | undefined;
  ```

  La interfaz traduce el código a texto ("Los nombres en 'ply' cambian según el país: busca por el nombre del grosor o por la muestra") con el glosario.
- **Propiedades**: `findWeights` no distingue tildes ni mayúsculas (`findWeights(q)` igual a `findWeights(variante de q)`); nunca devuelve dos entradas de la misma categoría; toda entrada con `kind: "alias"` tiene `approximate: true` y toda otra, `false`; con menos de 2 caracteres normalizados, `[]`.

### Pendiente de validar por tejedora (sin cambio de contrato)

Holgura de las flotantes (1,1), rango del metraje y comparación con 2 o 3 proyectos terminados; brillo del acrílico, halo de la lana, definición de la alpaca y ponderación de mezclas con mohair o lurex; el alias "Fino (Light DK)" y la búsqueda "light"; los nombres "4 ply" y "8 ply".
