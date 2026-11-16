# ADR 0010: Geometría 3D del amigurumi derivada de las vueltas y paquete `viewer-3d`

- Estado: **aceptado** (2026-11-13, T0 de la fase 4), con las enmiendas de las [decisiones de la fase 4](../roadmap.md#decisiones-de-la-fase-4-aprobadas-el-2026-11-13) (ver [Enmiendas por las decisiones de la usuaria](#enmiendas-por-las-decisiones-de-la-usuaria-2026-11-13)): límites recomendados solo como advertencia (decisión 5) y aspecto por fibra en el 3D desde la fase 4 (decisión 10). **Enmendado el 2026-11-13** con la revisión de dominio T1 ([casos de dominio de la fase 4](../casos-dominio-fase-4.md), correcciones C-1 a C-12) y el prototipo T3b (enmiendas V-1 a V-5); ver [Enmiendas por T1 y T3b](#enmiendas-por-t1-y-t3b-2026-11-13). Lo que T1 dejó "validar con tejedora" se confirma en T1b. **Enmendado el 2026-11-13** con la implementación de T5 (commit `ca96b46`, enmiendas T5-1 a T5-6); ver [Enmiendas por la implementación de T5](#enmiendas-por-la-implementación-de-t5-2026-11-13). **Enmendado el 2026-11-14** con la implementación de T10 (commit `f803e9c`, enmiendas T10-1 a T10-9) y T11 (commit `d7595ac`, enmiendas T11-1 a T11-9); ver [Enmiendas por la implementación de T10 y T11](#enmiendas-por-la-implementación-de-t10-y-t11-2026-11-14). **Enmendado el 2026-11-16** con T12 (commit `be03aa7`, enmiendas T12-1 a T12-8, propuestas por `visor-3d`): instrumentación, reconstrucción diferida después de pintar, constantes confirmadas en el M1, R4-20 medido y presupuesto de la CI; ver [Enmiendas por la implementación de T12](#enmiendas-por-la-implementación-de-t12-2026-11-16). **Enmendado el 2026-11-16** con el grupo E (enmiendas G-E1 a G-E5): espiral continua y abanico por punto ajustado (`c4ab055`, revisión T21), avisos de forma por tramos, `PART_TOO_LARGE` (`cd6c02a`, T20) y una cifra nueva de `buildPartMesh`. La sección 3 queda corregida en lo del escalón de la espiral. Ver [Enmiendas por la implementación del grupo E](#enmiendas-por-la-implementación-del-grupo-e-2026-11-16).
- Fecha: 2026-11-13
- Paquetes: `packages/viewer-3d` (nuevo), `packages/pattern-core` (perfil por vuelta, límites recomendados), `packages/stitch-render` (`yarnLook`, sin cambios de contrato), `apps/web`
- Relacionado: [ADR 0001](0001-modelo-canonico.md) (modelo escrito), [ADR 0002](0002-nucleo-sin-dependencias.md) (núcleo sin dependencias), [ADR 0004](0004-render-de-puntos-2d.md) (capas puras y backend reemplazable, cómo se mide la regla de oro 7), [ADR 0005](0005-geometria-circulo-y-disminuciones.md) (geometría en el render, reglas en el validador), [ADR 0007](0007-follow-secuencia-de-colorwork.md) (puntero; fase 6), [ADR 0011](0011-posicion-de-partes-y-editor-escrito.md) (posición de las partes, `schemaVersion: 2`)

## Contexto

La fase 4 agrega el estudio amigurumi: un patrón escrito por partes (`kind: "written"`, crochet) con un modelo 3D que se actualiza en vivo. Lo que ya existe:

- **Modelo** (ADR 0001): cada parte tiene `construction` (`spiral`, `joined` o `flat`), `start` (`magic_ring` o `chain` con su cantidad), `startYarn` y `rounds[]`. Cada vuelta tiene `items` (puntos, grupos y cambios de lana) y un `expected` opcional.
- **Motor** (`written.ts`): `countRound` cuenta sin expandir, `expandRound` da la lista de puntos con su lana y su hebra, y `concreteRounds` despliega los rangos ("V5–8"). Los conteos salen solo de la tabla consume/produce de `stitches.ts`.
- **Validador**: revisa que cada vuelta consuma lo que dejó la anterior y que el conteo coincida con el declarado.
- **No existe** ninguna vista 3D, ni un editor de patrones escritos en `apps/web`, ni dependencias de terceros para gráficos.

La regla de oro 7 exige que editar una vuelta se vea en menos de 100 ms. La fase 4 lo mide con una pieza de 40 vueltas. La regla de oro 8 exige recordar que el 3D es una aproximación. La regla de oro 2 prohíbe que nadie fuera del motor calcule conteos: la geometría **lee** los conteos del motor y no los recalcula.

Hay que decidir:

1. cómo se obtiene la forma de cada parte a partir de los conteos y la muestra;
2. cómo se arma la malla, con aumentos, disminuciones y color por punto;
3. qué vive en `pattern-core` y qué en `viewer-3d`, y qué se prueba con `node:test`;
4. cómo se cumple el presupuesto de 100 ms y qué nivel de detalle se usa;
5. qué dependencias se agregan (`three`, `@react-three/fiber` y, quizás, `drei`).

## Opciones

### Forma de la pieza

- **A. Superficie de revolución con largo de meridiano fijo.** Cada vuelta es un anillo con radio igual a su circunferencia (conteo × ancho del punto) dividida por 2π. La distancia entre dos anillos medida sobre la tela es el alto de la vuelta. La altura entre anillos sale de esas dos medidas.
- **B. Simulación física** (resortes, presión del relleno). Es más realista, pero es iterativa, no determinista entre plataformas y cara de recalcular en cada edición.
- **C. Formas predefinidas** (esfera, cilindro, cono) ajustadas al conteo. Es barata, pero no sigue el patrón real: dos patrones distintos se verían iguales.

### Dónde vive el perfil

- **A. En `pattern-core`**, como derivado puro (`partProfile`). Lo usan el validador (avisos de crecimiento), las medidas en centímetros y `viewer-3d`.
- **B. En `viewer-3d`**. El validador y las medidas tendrían que duplicar el cálculo o depender del visor.

### Biblioteca 3D

- **A. `three` con `@react-three/fiber`** (el stack de `CLAUDE.md`).
- **B. `three` sin r3f**, imperativo dentro de un `useEffect`.
- **C. WebGL2 propio**, sin dependencias.
- **D. Babylon.js u otro motor completo.**

## Decisión

Forma **A** (superficie de revolución), perfil **A** (en `pattern-core`) y biblioteca **A** (`three` y `@react-three/fiber`, **sin `drei`** en la v1). La geometría se separa en capas, como en el ADR 0004: el perfil y la malla son funciones puras que se prueban en Node; el backend `three` es reemplazable y no conoce el patrón.

### 1. Métricas del punto

```ts
// pattern-core
/** Punto con que se midió la muestra. Solo puntos con cuerpo (enmienda C-3). */
export type GaugeStitch = "sc" | "hdc" | "dc" | "tr";

export interface ShapeMetrics {
  /** Ancho de un punto bajo en cm: 10 / gauge.stitchesPer10cm. */
  stitchWidthCm: number;
  /**
   * Alto de una vuelta de punto bajo en cm, convertido desde el punto de la muestra:
   * (10 / gauge.rowsPer10cm) / STITCH_HEIGHT_FACTOR[gaugeStitch] (enmienda C-3).
   */
  roundHeightCm: number;
  /** Punto con que se midió la muestra (se informa junto a las medidas). */
  gaugeStitch: GaugeStitch;
  /** true si la muestra es supuesta (no está en el documento). */
  assumed: boolean;
}
export function shapeMetrics(gauge: Gauge, opts: { assumed: boolean; gaugeStitch: GaugeStitch }): ShapeMetrics;
```

- **La muestra viene del documento** (`pattern.gauge`). Si falta, la capa de aplicación usa `suggestedGauge(grosor, "crochet")` de `yarn-catalog` con la lana inicial de la parte y marca `assumed: true` (regla de oro 6). La interfaz rotula las medidas como "supuesto" y nunca escribe esa muestra en el documento (como CA-F4 y CA3-L7).
- **Punto de la muestra** (enmienda C-3, F4-43): `suggestedGauge` entrega vueltas de punto alto en la categoría 0 (`assumption: "crochet-pa"`) y de punto bajo en las demás. Si `shapeMetrics` tomara siempre las vueltas como de punto bajo, la categoría 0 saldría el doble de alta. Por eso `gaugeStitch` es **obligatorio** (sin valor por omisión que esconda el error):
  - con la muestra supuesta, la aplicación traduce `assumption`: `"crochet-pb"` → `"sc"`, `"crochet-pa"` → `"dc"`. `pattern-core` no depende de `yarn-catalog` (ADR 0002);
  - con la muestra del documento, `Gauge` no dice con qué punto se midió. En un patrón escrito de crochet se lee como **punto bajo** (`"sc"`), y el campo de la muestra en el estudio amigurumi lo dice ("muestra en punto bajo"). Agregar `Gauge.stitch` al documento queda fuera de la v2 (riesgo abierto, ver las enmiendas).
- **Lo que define la forma es la proporción** entre alto y ancho del punto; la muestra solo fija la escala en centímetros. Hoy `yarn-catalog` supone 1,2 vueltas por punto en punto bajo (`ROWS_PER_STITCH_BY_ASSUMPTION["crochet-pb"]`), **pendiente de validar con tejedora** (glosario pendiente, "Filas en crochet"). T1b mide el ancho del punto y el alto de la vuelta en espiral en 5 piezas reales: el valor de amigurumi podría estar más cerca de 1,05 (enmienda C-8, F4-41).
- **Alto por tipo de punto** (enmienda C-5): `STITCH_HEIGHT_FACTOR` en `profile.ts` (enmienda T5-2; antes decía `stitches.ts`), relativo al punto bajo. Todos los valores son **convención, validar con tejedora** (F4-17 a F4-26):

  | Código | Factor | Nota |
  |---|---|---|
  | `sc` | 1 | Referencia |
  | `inc`, `inc3`, `dec` | 1 | En la v2 se entienden en punto bajo (enmienda C-12) |
  | `hdc` | 1,5 | Coherente con la regla del círculo (8 o 9 aumentos) |
  | `dc` | 2 | Coherente con 12 aumentos y con la relación 1,2 / 0,6 de `yarn-catalog` |
  | `tr` | 2,5 | Las fuentes dan de 2,5 a 3 |
  | `slst`, `ch` | sin valor | No hay cifra con fuente: **quedan fuera del promedio** de la vuelta |
  | `sk` | no aplica | No produce |

  El tipo es `Partial<Record<StitchCode, number>>` (o un `Record` con `null` en `slst`, `ch` y `sk`; lo elige `motor-patrones`): que falte el valor es parte del contrato, no un descuido.
- **Alto de una vuelta**: el promedio de `STITCH_HEIGHT_FACTOR` de sus puntos producidos **con valor** (`sc`, `hdc`, `dc`, `tr`, `inc`, `inc3`, `dec`), por `roundHeightCm`. Si la vuelta solo produce `slst` o `ch`, el factor es 1. En la v2 no se modela que puntos de distinto alto en la misma vuelta deformen el anillo.

### 2. Perfil de una parte (`pattern-core`, puro)

```ts
export interface ProfileRing {
  /** Número de vuelta visible; 0 es el inicio (anillo mágico o cadeneta). */
  round: number;
  /** Conteo producido por la vuelta, de `concreteRounds` (el motor; nunca se recalcula). */
  stitches: number;
  /** Radio efectivo en cm, ya acotado por el alto de la vuelta. */
  radiusCm: number;
  /** Altura del anillo sobre el inicio, en cm. */
  zCm: number;
  /** Alto de la vuelta en cm (sección 1). */
  heightCm: number;
  /**
   * Circunferencia pedida (conteo × ancho) / circunferencia efectiva (2π × radio efectivo).
   * 1 = la tela queda lisa; > 1, ondula (crece más rápido de lo que la tela permite); < 1, frunce.
   */
  strain: number;
}

export interface RevolutionProfile {
  kind: "revolution"; // construction "spiral" o "joined"
  spiral: boolean;
  rings: ProfileRing[];
  heightCm: number;
  maxDiameterCm: number;
}

export interface PanelRow {
  row: number;
  stitches: number;
  widthCm: number;
  yCm: number;
  heightCm: number;
}

export interface PanelProfile {
  kind: "panel"; // construction "flat" (hileras de ida y vuelta)
  rows: PanelRow[];
  heightCm: number;
  maxWidthCm: number;
}

export type PartProfile = RevolutionProfile | PanelProfile;

export function partProfile(part: Part, metrics: ShapeMetrics): PartProfile;
/** Alto y diámetro o ancho máximo, para "mide ≈ 12 cm de alto" (siempre como estimación). */
export function partDimensions(profile: PartProfile): { heightCm: number; widthCm: number };
```

**Algoritmo** (en espiral y en vueltas unidas):

1. **Inicio.**
   - Con anillo mágico, el anillo 0 tiene radio 0 y altura 0: el centro queda cerrado.
   - Con cadeneta, la cadeneta se une en un aro de `count` puntos, con radio `count × ancho / 2π`. Es la misma lectura que hace hoy `startAvailable`: la primera vuelta consume `count` puntos (un punto en cada cadeneta, F4-4). Si la tejedora trabaja dentro del aro, la cantidad de la V1 es libre: por eso ese desajuste en la V1 es advertencia (enmienda C-9).
   - El inicio en óvalo (trabajar alrededor de la cadeneta por los dos lados) **queda fuera de la v2** (decisión 6 resuelta por T1, enmienda C-13 del ADR 0011): la regla de consumo de la V1 no es única (F4-55) y una superficie de revolución no puede dibujarlo (F4-56). Queda para una v3 con su ADR.
2. **Radio pedido** de la vuelta `i`: `r*ᵢ = nᵢ × ancho / 2π`, con `nᵢ = count.produced` de `concreteRounds`.
3. **Paso radial** `Δr = r*ᵢ − rᵢ₋₁`, con el alto de la vuelta `s = heightCmᵢ` (enmienda C-4):
   - Si `|Δr| ≤ s`, el anillo queda en `rᵢ = r*ᵢ` y sube `Δz = √(s² − Δr²)`: la distancia sobre el meridiano es `s` y `strain = 1`.
   - Si `s < |Δr| ≤ s × PROFILE_RADIAL_TOLERANCE`, el anillo queda en `rᵢ = r*ᵢ` con `Δz = 0`: la distancia sobre el meridiano es `|Δr|` (no `s`) y `strain = 1`. Es la holgura que deja plano un disco que en la práctica queda plano.
   - Si `|Δr| > s × PROFILE_RADIAL_TOLERANCE`, el radio se acota a `rᵢ₋₁ ± s × PROFILE_RADIAL_TOLERANCE`, `Δz = 0`, y `strain = r*ᵢ / rᵢ` informa la ondulación (> 1) o el fruncido (< 1).
4. **La pieza siempre crece hacia +z.** Un disco que crece al ritmo de la tela queda plano (`Δz = 0`); con el conteo constante sube vertical (`Δz = s`); al disminuir, se cierra. Así salen discos, cilindros, tambores, esferas y gotas sin formas predefinidas (enmienda C-2):
   - **6 aumentos por vuelta en punto bajo dan un disco plano, no una cúpula** (F4-36). Un cuerpo de 6 → 60, 20 vueltas de 60 y 60 → 6 es un **tambor de tapas planas** (fixture A, F4-46), no una esfera.
   - Una **esfera** crece más despacio que el límite plano: conteos de `60 · sen(π(i − 0,5)/36)` en 36 vueltas (fixture B, F4-49 y F4-50). Que el perfil distinga A de B con el mismo máximo es la prueba de que la forma sigue al patrón (opción A frente a C).

**Calibración** (`PROFILE_RADIAL_TOLERANCE = 1,25`, constante con nombre; enmienda C-5, F4-36 a F4-41):

- Con `ρ = 1,2` vueltas por punto, un disco de punto bajo con 6 aumentos por vuelta da `Δr/s = 1,146`. Sin holgura se marcaría ondulado, y en la práctica queda plano.
- **1,25** deja plano y sin aviso el disco de 6 por vuelta (9 % de margen) y avisa desde 7 por vuelta (`Δr/s = 1,337`; el máximo plano es 6,54 puntos por vuelta). 12 por vuelta (`Δr/s = 2,29`) ondula con el radio acotado. Cualquier valor entre 1,15 y 1,3 cumple los casos; 1,25 es el elegido.
- **Sensibilidad**: con `ρ ≥ 1,31`, el disco de 6 aumentos pasa a avisar (F4-41). Si T1b mide otro `ρ`, se recalibra la tolerancia en la misma enmienda.
- Valor y criterio quedan **"validar con tejedora"** (¿6 aumentos de pb quedan planos con la tensión de amigurumi?, ¿desde cuántos ondula?). La constante nunca produce errores, solo información.

**Hileras (`flat`)**:

- Se dibujan como un **panel plano**: fila `j` de ancho `nⱼ × ancho`, centrada, a la altura acumulada.
- Las filas impares se recorren en sentido inverso al asignar puntos. Así, el color por punto queda donde se tejió.
- No se pliega ni se curva en la v1.

**Avisos derivados** (validador de `pattern-core`, severidad `info`):

- `ROUND_GROWS_FAST` y `ROUND_SHRINKS_FAST` con la vuelta, el cambio de conteo (`+N` o `−N`) y `Δr/s` en `data`.
- **Umbral por crecimiento por vuelta** (enmienda C-6): el aviso sale cuando `Δr / s > PROFILE_RADIAL_TOLERANCE` (crece) o `−Δr / s > PROFILE_RADIAL_TOLERANCE` (disminuye), es decir, en el mismo caso en que el perfil acota el radio. **No se decide por `strain`**: en los anillos pequeños `strain` sube de forma engañosa con pocos puntos de diferencia. `strain` queda como dato de la geometría (malla y `notes` de la escena).
- **La V1 sobre anillo mágico no se evalúa ni se acota**: el anillo se cierra tirando de la hebra y admite cualquier cantidad (F4-1 y F4-2). Con `ρ = 1,2`, una V1 de 8 daría `Δr/s = 1,53` y avisaría sin motivo. El anillo 1 queda en `r*₁` con `Δz = √(max(s² − r*₁², 0))`, y lo único que puede salir es `MAGIC_RING_UNUSUAL` (ADR 0011, enmienda C-20). Sobre cadeneta en aro, la V1 sí se evalúa como las demás. Validar con tejedora.
- El cierre habitual (`dism x6` sobre 12) no avisa; 12 disminuciones sobre 24, sí (F4-40).
- Usan la muestra del documento o `assumedGauge` y `weightCat` de `ValidateOptions`, igual que las hebras flotantes del colorwork, con el `gaugeStitch` de la sección 1 (`ValidateOptions.assumedGaugeStitch`, enmienda T5-1). Sin ninguna muestra, no hay avisos de forma (enmienda T5-5).
- Además del radio acotado, la vuelta tiene que cambiar el conteo en el mismo sentido; un aviso como máximo por vuelta escrita (enmienda T5-3).
- Respetan el invariante de opciones (ADR 0003, E10): solo informan y nunca son errores.
- **Textos** (enmienda C-6, F4-77 y F4-78; redacción final de `documentador`, "validar con tejedora"):
  - `ROUND_GROWS_FAST`: "Esta vuelta aumenta más de lo que la tela puede abrir en plano (+N puntos; una vuelta de pb queda plana con unos 6). Si la tejes así, la pieza tiende a ondularse. Puede ser lo que buscas."
  - `ROUND_SHRINKS_FAST`: "Esta vuelta disminuye más de lo que la pieza puede cerrarse en curva (−N puntos). Si la tejes así, la pieza se frunce o se cierra en copa. Puede ser lo que buscas (por ejemplo, el remate)."
  - "unos 6" es el valor del punto bajo; con otro punto el texto no da cifra, porque no hay aumento de mpa ni de pa en el modelo (enmienda C-12).

**Documentos borrador**:

- `partProfile` funciona con todo documento `savable`, también con vueltas que no consumen lo que dejó la anterior (ADR 0011, sección 4).
- Usa siempre el conteo **producido**. El desajuste lo informa el validador; la geometría no lo corrige.

### 3. Malla de una parte (`viewer-3d`, puro)

```ts
export interface PartMeshOptions {
  /** Hasta dónde se construye, para el 3D parcial del modo tejiendo (fase 6). Omitido = la parte completa. */
  limit?: { roundsDone: number; stitchesDone: number };
  lod?: Lod;
  /** Reutiliza el prefijo de una malla anterior de la misma parte hasta la vuelta concreta `fromRound` (sección 6c, G12). */
  reuse?: { mesh: PartMesh; fromRound: number };
}

export type Lod = "smooth" | "relief";

export interface PartMesh {
  /** xyz por vértice, en cm, con el inicio de la parte en el origen y la pieza creciendo hacia +z. */
  positions: Float32Array;
  normals: Float32Array;
  /** uv por vértice: 0 a 1 dentro de cada punto, para el relieve. */
  uvs: Float32Array;
  /** Índice de la lana (en `pattern.yarns`) de cada vértice. `colorizePartMesh` lo reescribe. */
  yarn: Uint8Array;
  indices: Uint32Array;
  /** Punto global (0 … totalStitches − 1) de cada triángulo, para elegir con el puntero. */
  faceStitch: Uint32Array;
  /** Primer punto global de cada vuelta concreta (largo = vueltas + 1). */
  roundStart: Uint32Array;
  vertexCount: number;
  indexCount: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

export function buildPartMesh(part: Part, yarnIds: readonly string[], profile: PartProfile, opts?: PartMeshOptions): PartMesh;
/** Firma de la forma: conteos y puntos de cada vuelta, sin lanas. Si no cambia, basta con recolorear. */
export function shapeSignature(part: Part): string;
/** Reescribe `mesh.yarn` sin tocar posiciones. Devuelve el rango de vértices tocados. */
export function colorizePartMesh(mesh: PartMesh, part: Part, yarnIds: readonly string[]): { from: number; to: number };
/** Superficie en una vuelta y un punto (posición, normal, tangente), para anclar otras partes (ADR 0011). */
export function surfaceFrame(profile: PartProfile, round: number, stitch: number): Frame;
/** Perfil como SVG (silueta), para cuando no hay WebGL y para la descripción accesible. */
export function profileToSvg(profile: PartProfile, opts?: { widthPx: number }): string;
```

> Contrato implementado en T10: `PartMesh` agrega `loop` y `ringPhase` (enmienda T10-1), `surfaceFrame` recibe `{ mesh }` opcional (T10-2), `reuse.fromRound` es una cota (T10-5), `limit` es solo por parte (T10-6) y `profileToSvg` acepta `{ widthPx?, fill?, title? }` (T10-9).

**Topología por punto** (la clave para aumentos y disminuciones sin heurísticas):

- Se recorre `expandRound` de cada vuelta concreta con dos cursores: uno sobre el anillo anterior (puntos **consumidos**) y otro sobre el anillo actual (puntos **producidos**).
- Cada punto ocupa `consumes` posiciones abajo y `produces` arriba, según `STITCHES`. Es la misma tabla del motor: la malla no decide cuántos puntos hay. `inc`, `inc3` y `dec` son **de punto bajo**: `STITCHES` no tiene aumento ni disminución de mpa o pa, y agregarlos exigiría códigos nuevos con su ADR (enmienda C-12, F4-18 y F4-39). La disminución invisible tiene el mismo conteo que `dec` y se ve igual (F4-21).
  - Un `sc` es un cuadrilátero.
  - Un `inc` es un abanico de una posición abajo a dos arriba; un `inc3`, de una a tres.
  - Un `dec` va de dos posiciones abajo a una arriba.
  - Una `ch` dentro de la vuelta tiene base de ancho 0.
  - Un `sk` tiene tope de ancho 0: es un hueco.
- **Desajuste de consumo** (borradores): si lo consumido por la vuelta no coincide con lo que dejó la anterior, las posiciones de abajo se reparten en proporción. La malla siempre cierra y el validador informa el error.
- **Vértices propios por punto**: cada punto tiene sus vértices (no se comparten), para que el color sea nítido por punto. Las normales salen del perfil de forma analítica, para que la superficie se vea lisa aunque los vértices no se compartan.
- **Espiral**: dentro de la vuelta, el punto `k` sube `Δz × k / nᵢ`. ~~Se ve el escalón al empezar cada vuelta, como en la tela real.~~ **Enmienda G-E1 (2026-11-16)**: desde la V2, la hélice es continua: radio, altura, giro y normal van del anillo anterior al suyo (`ringPoint`). El final de cada vuelta se toca con el inicio de la siguiente, y **solo se ve el escalón del final de la última vuelta**, que queda abierta.
- **Vueltas unidas**: cada anillo es plano y la unión queda en el ángulo 0. El punto deslizado de unión y la cadeneta para subir no son puntos del modelo (ADR 0001) y no se dibujan. Si la usuaria los escribe como ítems (`pd`, `cad 1`), sí cuentan, y el validador lo sugiere al no cuadrar (enmienda C-10, F4-11 y F4-12).
- **Hebra trasera o delantera** (`loop`): no cambia la forma ni el conteo ni el alto, y **el perfil no se quiebra en la v2** (enmienda C-7, F4-42). Con el relieve, se dibuja una línea de borde en el anillo (deseable). Que en la tela real permita doblar 90° queda "validar con tejedora".
- **Color**: cada vértice lleva el índice de la lana del punto (`expandRound` → `yarn`). El color y el aspecto de cada lana los pone el backend desde una tabla por lana (sección 6b): la malla nunca guarda colores.
- **Remate**: la última vuelta queda abierta, como se teje. Cerrar o rellenar son pasos de terminación que el modelo guarda como texto (`finish`, `note`). **El relleno queda fuera de la v2** (decisión 6 resuelta por T1, enmienda C-13 del ADR 0011): no hay regla de forma con fuente para una pieza rellena o aplanada (F4-52 a F4-54). Una oreja "sin rellenar, aplanada" se ve como tubo abierto, y el aviso de prototipo lo cubre (sección 7).
- **Parcial** (`limit`, fase 6): la malla se corta en `roundStart[roundsDone] + stitchesDone`. Es el mismo recorrido y no hay una segunda implementación.

### 4. Escena

```ts
export interface SceneInput {
  pattern: WrittenPattern;
  metrics: (part: Part) => ShapeMetrics;        // la aplicación resuelve la muestra real o supuesta
  previous?: SceneCache;                         // para reconstruir solo lo que cambió
}
export interface SceneInstance {
  partId: string;
  copy: number;
  mesh: PartMesh;          // compartida entre las copias de una misma parte
  matrix: Float32Array;    // 4 × 4, en cm, columna mayor
  placed: boolean;         // false = ubicación automática (no tiene posición en el documento)
}
export interface SceneCache { /* privado: perfiles y mallas por parte, con su firma */ }
export function buildScene(input: SceneInput): {
  instances: SceneInstance[];
  cache: SceneCache;
  notes: SceneNote[];
  /** Puntos de la escena: Σ de los puntos de la malla de cada instancia (decide el nivel de detalle y la sección 6c). */
  stitchCount: number;
};
```

- **Las copias de una parte comparten la malla** y solo cambia su matriz.
- Las posiciones salen de `layout` (ADR 0011), resueltas con `surfaceFrame` del anfitrión. Las partes sin posición se ubican de forma automática y determinista: en fila, separadas por su ancho, en el orden de `parts`.
- **Caché**: una parte se reconstruye solo si cambió su referencia (las operaciones de `pattern-core` son inmutables) y su `shapeSignature`. Si solo cambiaron los colores, se usa `colorizePartMesh`. Si cambió la muestra, se reconstruyen todas.
- `notes` informa lo que la escena aproximó: anclas fuera de rango (acotadas), muestra supuesta y ondulación. La interfaz las muestra como avisos y no como errores.
- Implementado en T10: `SceneResult` agrega `updates` por parte (enmienda T10-3); las convenciones de `SurfaceAt`, `FreeAt` y la ubicación automática quedan fijadas en T10-4, y los códigos de `notes` en T10-7.

### 5. Backend `three` (reemplazable) y componente

- **`@loopitalab/viewer-3d/three`** (subruta del mismo paquete):
  - convierte `PartMesh` en `THREE.BufferGeometry` con capacidad reservada, que crece por 1,5 cuando hace falta;
  - actualiza los atributos en el lugar (`needsUpdate`, `addUpdateRange`) y usa `setDrawRange` para no crear objetos por edición;
  - crea **un solo material** para toda la escena: el color y el aspecto por fibra salen de una tabla por lana indexada por el atributo `yarn` (sección 6b), más el relieve con un mapa de normales procedural;
  - libera todo de forma explícita (`dispose`).
  - Interfaz (enmendada por la decisión 10: `yarnHex` pasa a `SurfaceLook[]`):

    ```ts
    /** Aspecto de una lana en el 3D. Misma forma que `YarnLook` de `stitch-render` (sección 6b). */
    export interface SurfaceLook {
      hex: string;        // #RRGGBB
      halo: number;       // 0 a 1
      sheen: number;      // 0 a 1
      definition: number; // 0 a 1
    }

    export interface AmigurumiRenderer {
      setScene(instances: readonly SceneInstance[], looks: readonly SurfaceLook[]): void;
      /** Cambia color o aspecto de las lanas sin tocar geometría ni atributos: solo la tabla por lana. */
      setLooks(looks: readonly SurfaceLook[]): void;
      /** Vista previa de una lana al pasar el cursor (ADR 0008, sección 3), sin tocar el documento. */
      setPreviewOverride(o: { yarn: number; look: SurfaceLook } | null): void;
      setLod(lod: Lod): void;
      pick(ndcX: number, ndcY: number): { partId: string; copy: number; stitch: number } | null;
      setHighlight(target: { partId: string; copy?: number; round?: number } | null): void; // edición y fase 6
      snapshot(opts: { width: number; height: number }): Promise<Blob>;
      dispose(): void;
    }
    ```

    La interfaz implementada en T11 difiere: `setScene` recibe el resultado de `buildScene` y devuelve la política, `pick` y `setHighlight` usan `roundIndex` 0-based, y se agregan `policy`, `bounds`, `setMaterialVariant`, `stats`, `resetStats` y `renderNow` (enmienda T11-1). Las luces las pone el renderer (T11-2).

- **Componente de r3f en `apps/web`** (`components/amigurumi/`), no en el paquete. El paquete no depende de React y el estudio de colorwork no carga `three`.
  - Se carga con `next/dynamic` y `ssr: false`, solo en el estudio amigurumi.
  - `<Canvas frameloop="demand">`: dibuja solo cuando algo cambia (`invalidate()`), no 60 veces por segundo. Ahorra batería en "Tejiendo".
  - El documento vive en el almacén fuera de React (ADR 0004). El componente se suscribe y llama a `setScene` de forma imperativa. Una edición nunca vuelve a renderizar un árbol de React proporcional a la cantidad de puntos.
  - Controles orbitales de `three/addons/controls/OrbitControls.js`, con teclado: las flechas giran, `+` y `−` acercan, `0` restablece.
  - Luz hemisférica más una direccional, sin sombras en la v1. Fondo neutro. Las crea el renderer de `./three`, no el componente (enmienda T11-2).

### 6. Rendimiento y nivel de detalle

**Meta (regla de oro 7)**: editar una vuelta de una pieza de unas 40 vueltas (el cuerpo del escenario de referencia tiene 39) se ve en el 3D en menos de 100 ms (p95), con CPU ×4 en Chromium, igual que el ADR 0004, **con el aspecto por fibra activado** (sección 6b). La meta se exige **dentro de los límites recomendados** (sección 6c); fuera de ellos rige el comportamiento degradado de esa sección.

**Escenario de referencia** (fixture de `qa-tester`, revisado por `experto-tejido` en T1; enmiendas C-1 y C-2):

- **cuerpo**: el **fixture A, "cuerpo de 39 vueltas"** (F4-45): punto bajo con anillo mágico de 6, aumentos de 6 por vuelta hasta 60 (V1 a V10), 20 vueltas de 60 (V11 a V30) y disminuciones hasta 6 (V31 a V39): **39 vueltas y 1.800 puntos**. Es un tambor de tapas planas, no una esfera (sección 2); sirve igual para el rendimiento. Con 22 vueltas de 60 serían 41 vueltas y 1.920 puntos (F4-48). La forma de esfera se prueba con el **fixture B** (36 vueltas, 1.384 puntos; F4-49);
- **otras 9 partes** de entre 10 y 25 vueltas, con 2 copias en orejas, brazos y piernas;
- **3 lanas** y cambios de color en 5 vueltas.

**Presupuesto por edición**:

| Paso | Máximo |
|---|---|
| Leer la línea editada (`parseRound`) y aplicar la operación | 3 ms |
| `concreteRounds` y `partProfile` de la parte | 3 ms |
| `buildPartMesh` de la parte (1.800 puntos, fixture A) | 10 ms |
| `buildScene` (anclas, matrices y caché) | 3 ms |
| Subir atributos a la GPU | 5 ms |
| Dibujo del frame | 30 ms |
| Validación completa | Fuera del camino: antirrebote de 300 ms (ADR 0004) |

**Medición del prototipo T3b** (enmienda V-3; `apps/web/src/app/dev/visor/`, borrado en T11 y reemplazado por `/dev/visor-3d`, enmienda T11-4; malla sintética de 2.448 puntos, CPU ×4, GPU real; p95):

| Paso medido | p95 | Presupuesto de la tabla |
|---|---|---|
| Actualizar atributos en el lugar | 2,8 ms | 5 ms (subir atributos) |
| Subir y dibujar el frame | 6,4 ms | 5 + 30 ms |
| Recolorear (`yarn`) hasta el frame | 2,2 ms | — |
| `setLooks` (solo uniformes), tiempo de JS | 0,7 ms | — |

- Siguen siendo **2 programas** (`relief` y `smooth`), compilados al montar, y cambiar aspectos no recompila.
- **Con SwiftShader** (CI), subir y dibujar da p50 21 ms y p95 43 ms: la CI tiene **su propio presupuesto** (`E2E_VIEWER_BUDGET_MS`, provisional en 400 ms, T3) y solo informa. El equipo de referencia decide (sección "Medición").
- **Límites de la medición**: la malla es sintética, así que el `buildPartMesh` real (con `expandRound` y la topología por punto) será más lento, y su costo no está en estas cifras (lo mide T10 con la guardia de Node). Tampoco se midió el costo de la extensión del material frente a `MeshStandardMaterial` sin extender (riesgo abierto, lo mide T11 con el A/B de `E2E_FLAT_COLORS`). **Cerrados**: la malla real la midió T10 (enmienda T10-8) y el A/B del material, T11 (enmienda T11-5).

**Por qué alcanza**:

- Una pieza de 39 vueltas con un máximo de 60 puntos son 1.800 puntos y unos 10.000 vértices. Es tres órdenes de magnitud menos que el colorwork de 40.000 puntos.
- El riesgo no es la cantidad de puntos: es reconstruir de más (todas las partes en cada tecla), crear objetos por edición o volver a renderizar React. La caché, los atributos reservados y el almacén fuera de React lo evitan.

**Nivel de detalle**:

- `"relief"` (por defecto): color por lana más un mapa de normales procedural del punto, con las uv de cada punto, y el aspecto por fibra completo (sección 6b). La textura se dibuja una vez en un canvas: no hay archivos de imágenes.
- `"smooth"`: sin mapa de normales. El color y los términos baratos del aspecto por fibra (rugosidad y borde, sección 6b) se mantienen. Se usa si la escena supera `LOD_STITCH_BUDGET` puntos visibles, si el contexto WebGL es limitado, siempre por encima de los límites recomendados (sección 6c), o si la usuaria lo elige.
- **`LOD_STITCH_BUDGET = 20_000`** (constante con nombre en `viewer-3d/three`; enmienda V-4). Es la primera calibración de T3b. T12 la confirma con esta regla: en el equipo de referencia, con razón de píxeles 2, una escena de 20.000 puntos en `"relief"` con el aspecto por fibra activado gira a **≥ 30 fps**. Si no lo alcanza, baja a **10.000** (enmienda en T12, sin cambiar el contrato).
- No hay mallas simplificadas por distancia en la v1. Dentro de los límites recomendados no hacen falta; por encima, la sección 6c define la degradación. Si T12 muestra que no alcanza, se agregan con una enmienda.

### 6b. Aspecto por fibra en el 3D (decisión 10)

**Qué se reutiliza**: el mismo `yarnLook(yarn, FIBERS, { fiberEffects })` de `stitch-render` que usa el estudio de colorwork (ADR 0008, sección 4, y sus enmiendas de T8), con los niveles de `yarn-catalog` (`halo`, `brillo`, `definicion` → `FIBER_LEVELS` 0 / 0,5 / 1, mezclas lineales por porcentaje, fibra desconocida neutra). **No hay una segunda fórmula de aspecto**: el 2D y el 3D de una misma lana parten del mismo `YarnLook`.

**Límite entre paquetes**:

- `viewer-3d` (puro y `./three`) **no depende** de `stitch-render` ni de `yarn-catalog`. Define `SurfaceLook` (sección 5), con la misma forma que `YarnLook`.
- La capa de aplicación (`apps/web`) calcula `pattern.yarns.map((y) => yarnLook(y, FIBERS, { fiberEffects: !coloresPlanos }))` y lo pasa a `setScene` o `setLooks`. Usa `lookInputKey` y `lookKey` para no recalcular ni volver a subir aspectos que no cambiaron, igual que `PreviewEngine`.
- Una prueba de tipos en `apps/web` asegura que `YarnLook` se puede asignar a `SurfaceLook` y al revés. Si `stitch-render` agrega un campo, la prueba avisa.
- **Sin texturas de marcas ni fotos de lanas** (regla de oro 9): todo el aspecto sale de tres números por lana y de texturas procedurales dibujadas en un canvas.

**Cómo se aplica a la malla** (backend `three`):

- **Tabla por lana**: dos arreglos de uniformes de largo `LIMITS.maxYarns` (32): `uYarnColor[32]` (color lineal) y `uYarnLook[32]` (`halo`, `sheen`, `definition`). El atributo `yarn` de cada vértice indexa la tabla. **Siempre en uniformes, sin alternativa de textura de datos** (enmienda V-2): son 64 `vec3`, y WebGL2 garantiza al menos 256 vectores de uniformes en el sombreador de vértices (`MAX_VERTEX_UNIFORM_VECTORS`), así que alcanza con holgura junto a los de `three`.
- **Dónde se lee la tabla** (enmienda V-2, como en el prototipo T3b): en el **sombreador de vértices**, con el atributo `yarn` como índice. El color y el aspecto pasan al de fragmentos con *varyings* `flat` (`vYarnColor`, `vYarnLook`): sin interpolar, así el color de un punto no se mezcla con el del vecino. Los *varyings* `flat` y la indexación de arreglos por un valor de vértice exigen GLSL ES 3.00, es decir, WebGL2.
- **Caché de programas**: el material fija `customProgramCacheKey` explícito por nivel de detalle (`loopita-fiber-relief`, `loopita-fiber-smooth`), para que `three` no confunda los programas extendidos con `onBeforeCompile` ni compile uno nuevo por material.
- **Material**: `MeshStandardMaterial` extendido con `onBeforeCompile` (conserva las luces y el espacio de color de `three`). En el fragmento:
  - **brillo** (`sheen`): baja la rugosidad, `roughness = ROUGHNESS_BASE − FIBER_SHEEN_ROUGHNESS × sheen`, y aclara un poco la luz especular;
  - **halo** (`halo`): un borde difuso según el ángulo de vista (término de Fresnel), `color += FIBER_HALO_RIM × halo × fresnel × (blanco − color)`, y suaviza el relieve, `normalScale × (1 − FIBER_HALO_SOFTEN × halo)`: el mohair difumina el punto, como en el 2D;
  - **definición** (`definition`): aumenta el relieve, `normalScale × (1 + FIBER_DEFINITION_RELIEF × definition)`: el algodón marca el punto.
- **Aspecto neutro = material base**: con `halo = sheen = definition = 0`, el resultado es exactamente el material sin fibra (como `fillTone` en el 2D). Esa es la propiedad que fija la forma de las fórmulas.
- **Constantes con nombre** (`ROUGHNESS_BASE`, `FIBER_SHEEN_ROUGHNESS`, `FIBER_HALO_RIM`, `FIBER_HALO_SOFTEN`, `FIBER_DEFINITION_RELIEF`) en `viewer-3d/three`. Las calibra `visor-3d` con capturas que revisan `catalogo-lanas` y `experto-tejido` (T11c). El parecido con lanas reales queda "validar con tejedora" (T1b), como el 2D.
- **Sin pelos ni capas de pelaje** (*shell fur*) en la v1: multiplican el dibujo por la cantidad de capas y romperían el presupuesto. Si las tejedoras lo piden para el mohair, se evalúa con una enmienda y su medición.

**Presupuesto de 100 ms**:

| Cambio | Qué se toca | Qué no se toca |
|---|---|---|
| Color de una lana, su composición o "Colores planos" | `setLooks`: 32 uniformes | Malla, atributos, programa del shader |
| Vista previa al pasar el cursor por un color | `setPreviewOverride`: 1 entrada de la tabla | Documento, malla, atributos |
| Cambiar la lana de un punto o de un cambio de color (`@B` → `@C`) | `colorizePartMesh`: rango del atributo `yarn` | Posiciones, normales, uv |
| Editar una vuelta | Malla de esa parte (sección 4, caché) | Malla de las demás partes, tabla por lana |

- **El cambio de color o de lana nunca reconstruye la malla**, y el cambio de color o de composición ni siquiera sube atributos: es lo más barato del visor.
- **Un solo programa de shader**: el aspecto va en uniformes, no en `defines`. Cambiar el aspecto, activar "Colores planos" o cambiar de lana no recompila. El cambio de nivel de detalle sí puede usar otro programa: se compilan los dos al montar el visor (`renderer.compile`), para que el primer cambio no se note.

**"Colores planos"** (como en la fase 3, ADR 0008, sección 4):

- Es **la misma preferencia de vista** del estudio de colorwork, en `localStorage` (`loopita:vista:colores-planos`), nunca en el documento. Activarla en un estudio la activa en el otro.
- Con "Colores planos", la aplicación pasa aspectos neutros (`fiberEffects: false`): el 3D queda con el color y el relieve base, sin halo ni brillo. No hay otro camino de código en el visor.
- El interruptor está junto al visor, con el texto de la fase 3 ("Muestra cada lana solo con su color, sin el halo ni el brillo de la fibra. No cambia el diseño.").
- El aviso de prototipo (sección 7) recuerda que el halo y el brillo son una aproximación.

**Nivel de detalle y sin WebGL**:

- `"relief"`: los tres términos de fibra.
- `"smooth"`: sin mapa de normales, así que `definition` y el suavizado del halo no tienen dónde actuar. Se mantienen el brillo (rugosidad) y el borde del halo: cuestan unas pocas operaciones por fragmento, independientes de la cantidad de puntos.
- **Sin WebGL** (que en este ADR significa **sin WebGL2**: un contexto que solo ofrece WebGL1 cuenta como sin WebGL; enmienda V-2), o con el contexto perdido: las siluetas (`profileToSvg`) se rellenan con el color plano de la lana inicial de cada parte. El aspecto por fibra no se muestra, y la interfaz lo dice ("el halo y el brillo solo se ven en la vista 3D").

**Guardia de rendimiento**:

- Contadores en el modo de medición (`?perf=1`): al cambiar color, composición o "Colores planos", 0 llamadas a `buildPartMesh` y a `colorizePartMesh`, y 0 atributos marcados con `needsUpdate`. Al cambiar la lana de un punto, 0 llamadas a `buildPartMesh`.
- `renderer.info.programs.length` no crece al cambiar aspectos ni "Colores planos" (E2E).
- Latencia A/B como en la fase 3: `E2E_FLAT_COLORS=1` mide con "Colores planos". El criterio se cumple con el aspecto por fibra **activado**; la diferencia se informa en el PR.
- `hover-to-paint-3d` (vista previa al pasar el cursor) con p95 < 100 ms.
- Giro y acercamiento ≥ 30 fps con el aspecto activado en el equipo de referencia.

### 6c. Límites recomendados y comportamiento fuera de ellos (decisión 5)

**Valores** (solo advertencia; la usuaria decide si sigue):

| Límite recomendado | Valor | Se cuenta con |
|---|---|---|
| Partes | 20 | `parts.length` |
| Copias por parte | 10 | `Part.copies` |
| Vueltas por parte | 100 | `concreteRounds(part).length` |
| Puntos por vuelta | 200 | `count.produced` de cada vuelta concreta |
| Puntos en la escena | 40.000 | Σ por parte de (Σ `produced`) × `copies` |

- Viven en `pattern-core` como `RECOMMENDED_WRITTEN_LIMITS`, con las funciones puras `recommendedLimitUsage(pattern)` y `recommendedLimitNotices(pattern)` (contrato en el ADR 0011, sección 3b). **Los conteos salen del motor** (regla de oro 2); ni la interfaz ni el visor los recalculan.
- **No son errores ni avisos del validador**: un patrón de 300 puntos por vuelta no está mal tejido. Son advertencias de la herramienta sobre la fluidez de la vista previa.
- **Los topes duros del núcleo no cambian** (`LIMITS`: 50 partes, 1000 vueltas por parte, 50.000 puntos por vuelta, más los nuevos de la v2 en el ADR 0011). Siguen siendo errores estructurales, la barrera ante la IA y ante JSON manipulados.

**Comportamiento del 3D**:

| Escena | Comportamiento |
|---|---|
| Hasta 40.000 puntos y dentro de los demás límites | Meta completa: p95 < 100 ms, `"relief"` o `"smooth"` según `LOD_STITCH_BUDGET`, aspecto por fibra |
| Fuera de los límites de partes, copias, vueltas o puntos por vuelta, con la escena en 40.000 puntos o menos | Solo la advertencia: el costo del 3D lo fija la cantidad de puntos de la escena, así que el visor sigue igual que en la fila anterior |
| Más de 40.000 puntos en la escena | Advertencia visible ("la vista previa puede ir más lenta"). `"smooth"` forzado, razón de píxeles 1, brillo y borde del halo se mantienen. El editor (texto, bloques, conteo y errores de lectura) **sigue respondiendo en menos de 100 ms**: nunca espera al 3D. El 3D se actualiza con la última edición (como mucho una reconstrucción en curso; la siguiente reemplaza a las pendientes, sin cola) y muestra "Actualizando 3D…" mientras tanto |
| Más de `SCENE_HARD_STITCH_CAP` puntos (constante con nombre; **200.000 al inicio**, 5 veces el recomendado, enmienda V-1; T12 la recalibra) | El visor no arma la malla, para no colgar la pestaña: muestra las siluetas (`profileToSvg`, cuesta lo que las vueltas, no lo que los puntos) y el mensaje correspondiente. Editar y guardar siguen igual |

- **Calibración de `SCENE_HARD_STITCH_CAP`** (enmienda V-1): el valor es **la escena más grande que se arma completa (`buildScene` más subir y dibujar el primer frame) en ≤ 1 s con CPU ×4** en el equipo de referencia. 200.000 es el punto de partida de T3b; T12 lo mide con la malla real y lo ajusta como enmienda. Subirlo o bajarlo no cambia el documento ni lo que se puede guardar.
- **El editor no espera ese segundo**: armar la escena completa (al abrir, al cambiar la muestra) puede tardar hasta 1 s cerca del tope, pero en esa franja una edición reconstruye **una sola parte** (sección 4). Si T12 encuentra que la reconstrucción de una parte grande bloquea el hilo principal lo suficiente para romper CA4-P8 (`edit-to-feedback`), `reuse` pasa a obligatorio y, si no alcanza, se evalúa armar la malla en un *worker* con una enmienda (riesgo abierto). **T12 lo midió** (enmiendas T12-2, T12-5 y T12-6): la reconstrucción diferida corre después de pintar, el tope queda en 200.000 con una segunda condición y el *worker* queda propuesto, condicionado al equipo de referencia.
- **Reconstrucción desde la vuelta editada** (deseable; obligatoria si CA4-P8 falla): editar la vuelta `k` no cambia el perfil ni la malla de las vueltas anteriores a `k`. `buildPartMesh(part, yarnIds, profile, { reuse: { mesh, fromRound: k } })` copia el prefijo y arma el resto. Propiedad G12: el resultado es igual a armar la malla desde cero. Se apoya en G7 (la malla parcial es un prefijo exacto).
- Las copias comparten la malla (sección 4): 10 copias de una oreja no cuestan 10 mallas, solo 10 matrices.

**Medición** (para las secciones 6, 6b y 6c):

- La misma instrumentación del ADR 0004: `performance.mark("edit-start", { startTime: event.timeStamp })` y `edit-painted` después del frame, con la métrica `edit-to-paint-3d`. Se agregan `edit-to-feedback` (hasta que el editor muestra el conteo y los errores de lectura, sin esperar al 3D; sección 6c) y `hover-to-paint-3d` (sección 6b).
- En la CI, Playwright en Chromium con WebGL por software (SwiftShader) y CPU ×4: proyecto Playwright `webgl`, con las opciones de SwANGLE (T3), y presupuesto propio en `E2E_VIEWER_BUDGET_MS` (provisional en 400 ms; T12 lo fija con las corridas reales). **Desde T12**: 150 ms (enmienda T12-7), y la CI corre con CPU ×1, no ×4 (ver "Lo que no coincide" de T12). Ese entorno castiga el dibujo (T3b: p95 de 43 ms solo en subir y dibujar), así que la medición en el equipo de referencia (decisión 4 de la fase 2) es la que decide.
- **Guardia en Node**: `buildPartMesh` y `partProfile` del fixture se miden con `node:test`. La CI falla si superan 3 veces la referencia registrada. T10 agrega `buildScene` y usa un factor de 6 en la CI (enmienda T10-8).

### 7. Aviso de prototipo digital (regla de oro 8)

- Junto al visor, siempre visible y sin poder cerrarse, va un aviso como este: "Vista aproximada. La forma y el tamaño reales dependen de tu tensión, la lana y el relleno. El relleno redondea la pieza y puede cambiar sus medidas. El amigurumi se teje más apretado que una muestra plana: teje una muestra con tu aguja para comprobar. El halo y el brillo de la fibra son una aproximación visual." (enmienda C-11, F4-44, F4-54 y F4-79). El texto final lo redacta `documentador` y lo valida `experto-tejido`.
- **Medidas**: "≈ 12 cm de alto, ≈ 8 cm de ancho, estimación", con "supuesto" si la muestra es supuesta.
- La captura (`snapshot`) para miniaturas lleva el aviso en el pie cuando se muestre fuera del estudio (PDF y vista pública, fase 7).

### 8. Accesibilidad

- **Lienzo**: enfocable, con `aria-label` y una descripción textual derivada del modelo (partes, vueltas, conteo final, medidas estimadas y posición relativa). `describeWritten` vive en `pattern-render`, como `describeChart`. En T11 el visor usa una descripción propia y más corta; la completa la suma T14 (enmienda T11-9).
- **Sin WebGL**: o si se pierde el contexto y no se recupera, se muestra la silueta de cada parte con `profileToSvg`, más la descripción. El estudio sigue usable.
- **Movimiento**: `prefers-reduced-motion` desactiva la rotación automática y las transiciones de cámara.
- **Daltonismo**: el visor no es la única forma de saber qué lana lleva un punto. El editor muestra la letra de la lana en cada bloque y en el texto (`@B`).
- **Baja visión**: "Colores planos" (sección 6b) quita el halo y el brillo para ver el color sin efectos, con la misma preferencia que el estudio de colorwork.

### 9. Paquete `packages/viewer-3d`: contrato y dependencias

| Parte | Qué contiene | Depende de | Se prueba con |
|---|---|---|---|
| `@loopitalab/viewer-3d` (`src/`) | `buildPartMesh`, `shapeSignature`, `colorizePartMesh`, `surfaceFrame`, `buildScene`, `profileToSvg`, tipos | Solo `@loopitalab/pattern-core`. Sin terceros | `node:test` y propiedades con semilla (ADR 0002) |
| `@loopitalab/viewer-3d/three` (`src/three/`) | `createThreeRenderer`, materiales, textura procedural, selección con el puntero | `three` (dependencia par, *peer*) | `node:test` con `three` como dependencia de desarrollo (geometría y atributos sin WebGL); capturas en Playwright |
| `apps/web/src/components/amigurumi/` | Componente r3f, controles, aviso, conexión con el almacén | `@react-three/fiber`, `three`, `viewer-3d` | Vitest y Playwright |

Misma convención que `follow` y `stitch-render`: TypeScript sin compilar, `exports` con `"."` y `"./three"`, job en la CI ("Núcleo" para la parte pura) y `@loopitalab/viewer-3d` en `transpilePackages` de `apps/web`. **`three` y `@react-three/fiber` no van en `transpilePackages`**: el prototipo T3b compila y carga sin eso (enmienda V-5).

**Propiedades obligatorias** (con semilla, sobre partes `savable` aleatorias con aumentos, disminuciones, grupos, rangos, colores y las tres construcciones):

| # | Propiedad |
|---|---|
| G1 | En revolución, `rings.length === concreteRounds(part).length + 1` y `rings[i].stitches === concreteRounds(part)[i − 1].count.produced`; en panel, `rows.length === concreteRounds(part).length` con el mismo conteo por fila |
| G2 | `zCm` es no decreciente; `radiusCm ≥ 0`; con anillo mágico, `rings[0].radiusCm === 0` |
| G3 | (Enmienda C-4.) Con `|Δr| ≤ s`, la distancia entre anillos sobre el meridiano es `s` (± 1e−6) y `strain === 1`. Con `s < |Δr| ≤ s × tolerancia`, `Δz === 0`, `radiusCm === r*` y `strain === 1`. Con `|Δr| > s × tolerancia`, `Δz === 0`, `|rᵢ − rᵢ₋₁| === s × tolerancia` (± 1e−6; o `radiusCm === 0` si el acotado bajaría de 0) y `strain !== 1`. La V1 sobre anillo mágico no se acota (sección 2) |
| G4 | La cantidad de puntos de la malla es `Σ produced` (`roundStart.at(-1)`), y cada triángulo apunta a un punto existente (`faceStitch`) |
| G5 | Todo vértice lleva la lana de su punto según `expandRound` |
| G6 | Si solo cambian las lanas (`shapeSignature` igual), `colorizePartMesh` deja la malla igual a `buildPartMesh` desde cero |
| G7 | La malla parcial con `limit` es un prefijo exacto de la completa (mismos vértices y mismo orden) |
| G8 | Reordenar las partes, cambiar el título o las notas no cambia ninguna malla |
| G9 | `surfaceFrame` devuelve una normal unitaria y perpendicular a la tangente; acota la vuelta y el punto fuera de rango sin lanzar |
| G10 | Ninguna función lanza con documentos `savable`; `positions` no tiene `NaN` ni infinitos |
| G11 | `partDimensions` coincide con `bounds` de la malla completa (± el alto de una vuelta) |
| G12 | Con `reuse: { mesh, fromRound: k }`, donde `mesh` es la malla de una parte que coincide con la nueva en las vueltas anteriores a `k`, el resultado es igual a `buildPartMesh` desde cero (sección 6c). Si `reuse` no es aplicable (otra firma de forma en el prefijo, `k` fuera de rango), se ignora |
| G13 | El uso `sceneStitches` de `recommendedLimitUsage` (ADR 0011, sección 3b) es igual a `stitchCount` de `buildScene` (Σ de `roundStart.at(-1)` por instancia) |

**Dependencias nuevas** (se justifican en el PR, como pide `CLAUDE.md`):

- **`three`**:
  - geometría, materiales con mapa de normales, cámaras, selección por rayos y controles orbitales (`three/addons`);
  - escribir eso sobre WebGL2 (opción C) son miles de líneas sin valor de producto;
  - es dependencia par de `viewer-3d` y dependencia directa de `apps/web`, con la versión fijada en el *lockfile*;
  - se carga solo en el estudio amigurumi (`next/dynamic`). El PR informa cuánto crece el paquete de esa ruta.
- **`@react-three/fiber`**:
  - es el stack fijado en `CLAUDE.md`;
  - aporta el ciclo de vida ligado a React (montar, desmontar y liberar), el cambio de tamaño, los eventos de puntero con selección por rayos y el dibujo bajo demanda. Sin r3f (opción B) habría que escribir y mantener todo eso;
  - el riesgo de r3f (re-renderizar React por punto) se evita con la regla de la sección 5: la malla se actualiza de forma imperativa;
  - **versiones confirmadas por T3b** (enmienda V-5), fijadas en el *lockfile*: `three` **0.186.1**, `@react-three/fiber` **9.8.2** (pide `react >=19 <19.4`) y `@types/three` **0.186.0** (desarrollo). Funcionan con React 19.2 y Next 16 sin `transpilePackages` para `three` ni r3f.
  - **riesgo de rango**: `apps/web` declara `react ^19.2.0`, que admite React 19.4 y saldría del rango de r3f 9.8.2. `devops` decide si acota `react` a `>=19.2 <19.4` (o lo fija) o vigila la actualización con r3f; hasta entonces, subir React a 19.4 exige subir r3f a la vez.
- **Tamaño**: el fragmento del visor del prototipo pesa **246 KB con gzip** y se carga **solo** por `next/dynamic` (T3b). CA4-P7 comprueba que el estudio de colorwork no lo pide.
- **`drei`: no en la v1.**
  - Lo que se usaría de `drei` (controles orbitales, centrar la cámara, etiquetas) está en `three/addons` o es poco código propio;
  - `drei` arrastra muchas dependencias transitivas para usar dos componentes.
  - Se reevalúa si aparece una necesidad concreta (por ejemplo, un control de transformación con manijas) y se registra como enmienda.

## Alternativas descartadas

- **Simulación física (forma B)**: no es determinista entre dispositivos, es cara en cada tecla y no se puede probar con propiedades simples. Si las tejedoras piden más realismo (relleno que abomba), se evalúa como una capa opcional de "inflado" sobre la forma A, sin cambiar el contrato.
- **Formas predefinidas (forma C)**: no siguen el patrón y esconderían errores de conteo, que son justamente lo que el 3D ayuda a ver.
- **Perfil en `viewer-3d` (perfil B)**: el validador (avisos de crecimiento) y las medidas en centímetros necesitan el mismo cálculo. Duplicarlo arriesga que el aviso y el 3D no coincidan; depender del visor rompería el ADR 0002. La malla, las normales y el nivel de detalle sí son del visor.
- **`three` sin r3f (biblioteca B)**: menos dependencias, pero obliga a reimplementar el ciclo de vida, los eventos y el dibujo bajo demanda. Va contra el stack fijado.
- **WebGL2 propio (biblioteca C)**: mucho código y pruebas difíciles para una escena de pocos miles de puntos.
- **Babylon.js (biblioteca D)**: es más pesado y no es el stack del proyecto.
- **Vértices compartidos entre puntos**: la malla es más liviana, pero el color de un punto se mezcla con el del vecino y el color por punto deja de ser nítido.
- **Reconstruir toda la escena en cada edición**: es simple, pero con 10 partes multiplica el costo por 10 sin necesidad.
- **Componente r3f dentro de `viewer-3d`**: obligaría al paquete a depender de React y de r3f, y mezcla dominio con vista.
- **Sin aspecto por fibra en el 3D de la fase 4** (opción recomendada de la decisión 10): la usuaria eligió tenerlo desde ya. El costo se acota con la tabla por lana en uniformes.
- **`viewer-3d` dependiente de `stitch-render` o de `yarn-catalog`**: acoplaría el visor 3D al render 2D y al catálogo. `SurfaceLook` con la misma forma y el cálculo en la aplicación dan lo mismo sin el acoplamiento.
- **Una fórmula de aspecto propia del 3D** (otra lectura de `fibras.json`): el 2D y el 3D de la misma lana podrían contradecirse. Se reutiliza `yarnLook`.
- **Color por vértice como atributo** (`color` de `three`, reescrito al cambiar una lana): cambiar el color de una lana obligaría a recorrer y subir todos sus vértices. Con la tabla por lana es un uniforme.
- **Aspecto en `defines` del shader** (un programa por combinación): cada cambio de lana o de "Colores planos" recompilaría, con pausas de decenas de milisegundos.
- **Pelaje por capas** (*shell fur*) para el halo, o `MeshPhysicalMaterial` con `sheen`: más realistas, pero multiplican el dibujo o el costo por fragmento. Se reevalúan con medición si las tejedoras lo piden.
- **Texturas fotográficas de lanas**: pesan, no siguen al color elegido y podrían venir de productos de marcas (regla de oro 9).
- **Límites recomendados como topes duros** (opción a original de la decisión 5): la usuaria pidió que sean solo advertencia. Garantizar la regla de oro 7 en todo tamaño no es posible; se garantiza dentro de los límites y se degrada de forma explícita fuera.

## Consecuencias

- Un error de conteo se **ve**: una vuelta con aumentos de más ondula y una con disminuciones de más frunce, siempre con el aviso del validador al lado.
- El 3D parcial de la fase 6 es `limit` sobre la misma malla. `follow` entrega el puntero y `viewer-3d` no cuenta nada.
- `pattern-core` gana `shapeMetrics` (con `gaugeStitch`), `partProfile`, `partDimensions`, `STITCH_HEIGHT_FACTOR`, `PROFILE_RADIAL_TOLERANCE` y dos avisos informativos. No cambia la forma del documento por este ADR (la v2 viene del ADR 0011).
- La forma es de revolución: un hocico o una barriga hechos con aumentos en un solo lado se ven simétricos en la v1. El aviso de prototipo lo cubre; si las tejedoras lo piden, la distribución angular de los aumentos se puede usar después sin cambiar el contrato.
- La CI necesita WebGL por software para las pruebas E2E del visor (T3).
- Los valores de `STITCH_HEIGHT_FACTOR` y `PROFILE_RADIAL_TOLERANCE`, el criterio del disco plano y los textos de los avisos los fijó T1 (enmiendas C-4 a C-6): T5 puede empezar. Siguen siendo "validar con tejedora", así que T1b puede moverlos con una enmienda; las pruebas los llevan con el comentario `// validar con tejedora`.
- El 2D y el 3D comparten el aspecto por fibra y la preferencia "Colores planos". Un cambio en `yarnLook` o en `fibras.json` cambia los dos, y las capturas de los dos se revisan juntas.
- La regla de oro 7 se garantiza dentro de los límites recomendados. Fuera de ellos, el editor sigue inmediato y el 3D se degrada de forma visible (sección 6c); por encima de `SCENE_HARD_STITCH_CAP`, el 3D pasa a siluetas.

## Enmiendas por las decisiones de la usuaria (2026-11-13)

La usuaria aprobó el ADR con la [opción (a) de la decisión 1](../roadmap.md#decisiones-de-la-fase-4-aprobadas-el-2026-11-13). Dos decisiones cambian el texto propuesto:

- **Decisión 5 (límites solo como advertencia)**: nueva sección 6c. La meta de 100 ms se exige dentro de los límites recomendados; fuera de ellos, nivel de detalle `"smooth"` forzado, editor que nunca espera al 3D, indicador "Actualizando 3D…" y siluetas sobre `SCENE_HARD_STITCH_CAP`. Se agregan `buildScene().stitchCount`, `PartMeshOptions.reuse` y las propiedades G12 y G13. Los topes duros del núcleo no cambian.
- **Decisión 10 (aspecto por fibra en el 3D desde la fase 4, opción b)**: nueva sección 6b. `AmigurumiRenderer.setScene` recibe `SurfaceLook[]` en vez de `yarnHex`, y se agregan `setLooks` y `setPreviewOverride`. El material usa una tabla por lana en uniformes; el cambio de color o de composición no reconstruye la malla ni sube atributos. "Colores planos" es la misma preferencia de la fase 3. Guardia de rendimiento con contadores, programas de shader y latencia A/B. Calibración visual en la tarea T11c.
- **Decisiones 3, 6, 7, 8 y 9**: sin cambios en este ADR (aplican al ADR 0011 y a la hoja de ruta).

## Enmiendas por T1 y T3b (2026-11-13)

Registradas por `arquitecto`. Las de dominio (C-*) vienen de la revisión T1 de `experto-tejido` ([casos de dominio de la fase 4](../casos-dominio-fase-4.md), "Correcciones para las enmiendas de los ADR"); los números C-* son los de ese documento. Las del visor (V-*) vienen del prototipo T3b de `visor-3d` (`apps/web/src/app/dev/visor/`, borrado en T11; hoy `/dev/visor-3d`, enmienda T11-4). Todo lo marcado "validar con tejedora" se confirma en T1b.

### Dominio (T1)

| ID | Clase | Sección | Enmienda |
|---|---|---|---|
| C-1 | Error de dominio | 6 | El cuerpo del escenario de referencia tiene **39 vueltas y 1.800 puntos**, no "unas 40 y unos 1.900" (F4-45) |
| C-2 | Error de dominio | 2 (paso 4) y 6 | El cuerpo de +6 por vuelta es un **tambor de tapas planas**, no una esfera (F4-46). Pasa a llamarse **fixture A, "cuerpo de 39 vueltas, 1.800 puntos"**, y se usa para el rendimiento. La esfera es el **fixture B** (36 vueltas, 1.384 puntos, conteos `60 · sen(π(i − 0,5)/36)`; F4-49 a F4-51) |
| C-3 | Error de dominio | 1 | `shapeMetrics(gauge, { assumed, gaugeStitch })`: recibe el punto de la muestra y convierte el alto a punto bajo (`/ STITCH_HEIGHT_FACTOR[gaugeStitch]`). La aplicación traduce `assumption` de `suggestedGauge` (`crochet-pa` → `dc`); la muestra del documento se lee como punto bajo (F4-43) |
| C-4 | Error de dominio | 2 (paso 3) y 9 (G3) | Tres tramos: `|Δr| ≤ s` (distancia `s`, `strain = 1`); `s < |Δr| ≤ s × tolerancia` (`Δz = 0`, distancia `|Δr|`, `strain = 1`); por encima, radio acotado y `strain ≠ 1`. G3 reescrita |
| C-5 | Mejora | 1 y 2 | `STITCH_HEIGHT_FACTOR`: `sc` 1, `hdc` 1,5, `dc` 2, `tr` 2,5 (rango 2,5 a 3), `inc`/`inc3`/`dec` 1; `slst` y `ch` sin valor y fuera del promedio de la vuelta. `PROFILE_RADIAL_TOLERANCE = 1,25`. Todo "validar con tejedora" |
| C-6 | Mejora | 2 (avisos) | Textos de `ROUND_GROWS_FAST` y `ROUND_SHRINKS_FAST` de F4-77 y F4-78. El umbral se decide por `Δr/s` frente a la tolerancia, no por `strain`. La V1 sobre anillo mágico no se evalúa (decisión de `arquitecto` sobre F4-1 y F4-2, para no avisar con una V1 habitual de 8) |
| C-7 | Mejora | 3 | La vuelta en hebra trasera no quiebra el perfil en la v2; solo línea de borde con relieve (F4-42) |
| C-8 | Mejora | 1 | 1,2 vueltas por punto sigue "validar con tejedora": T1b mide 5 piezas reales; si `ρ` cambia, se recalibra la tolerancia (F4-41) |
| C-9 | Mejora | 2 (paso 1); validador | Con `start: chain` y construcción `spiral` o `joined`, `ROUND_CONSUMPTION_MISMATCH` **en la V1** pasa de error a **advertencia**, con la pista "si trabajas dentro del aro, la cantidad de la primera vuelta es libre" (F4-3 y F4-4). Una cadeneta de aro de 1 no tiene sentido: con `chain` en `spiral` o `joined` y `count` 1, **advertencia** nueva `PART_START_RING_SHORT` ("la cadeneta en aro necesita al menos 2"). Es advertencia y no error para no romper la propiedad M1 de la migración (un v1 `valid` sigue `valid`). Los códigos nuevos y M1 enmendada están en el ADR 0011 (secciones 4 y 5) |
| C-10 | Mejora | 3; validador | Cuando una vuelta cerrada o una hilera no cuadra por 1 o 2 puntos, el mensaje de `ROUND_CONSUMPTION_MISMATCH` (y de `ROUND_COUNT_MISMATCH`) agrega: "¿escribiste la cadeneta de subida o el pd de unión como puntos? No cuentan" (F4-11, F4-12 y F4-83) |
| C-11 | Ambigüedad | 7 | El aviso de prototipo agrega el relleno ("redondea la pieza y puede cambiar sus medidas") y la tensión de amigurumi ("se teje más apretado que una muestra plana; teje una muestra con tu aguja") (F4-44, F4-79) |
| C-12 | Mejora | 1 y 3 | `inc`, `inc3` y `dec` son de punto bajo. No hay aumento ni disminución de mpa o pa; agregarlos exige códigos nuevos y su ADR (F4-39) |

Lo que **no** cambia: la forma A (revolución), la topología por punto, las propiedades G1, G2 y G4 a G13 y los cinco límites recomendados de la sección 6c (confirmados por T1, F4-70 a F4-76; ver el ADR 0011, enmienda C-18).

### Visor (T3b)

| ID | Sección | Enmienda |
|---|---|---|
| V-1 | 6c | `SCENE_HARD_STITCH_CAP = 200_000` al inicio (5 veces el recomendado, no "del orden de 10 veces"). T12 lo recalibra con la regla "la escena más grande que se arma completa en ≤ 1 s con CPU ×4" en el equipo de referencia |
| V-2 | 6b | Se quita la alternativa de la textura de datos: la tabla por lana va **siempre en uniformes** (64 `vec3` frente a los 256 que garantiza WebGL2). Se lee en el sombreador de vértices y pasa al de fragmentos con *varyings* `flat`; `customProgramCacheKey` explícito por nivel de detalle. "Sin WebGL" significa "sin WebGL2" |
| V-3 | 6 | Mediciones del prototipo (2.448 puntos, CPU ×4, GPU real, p95): atributos en el lugar 2,8 ms; subir y dibujar 6,4 ms; recolorear hasta el frame 2,2 ms; `setLooks` 0,7 ms de JS; 2 programas compilados al montar, sin recompilar al cambiar aspectos. Con SwiftShader, subir y dibujar p50 21 ms y p95 43 ms: la CI usa su propio presupuesto (`E2E_VIEWER_BUDGET_MS`) |
| V-4 | 6 | `LOD_STITCH_BUDGET = 20_000` como primera calibración. T12 confirma ≥ 30 fps en `"relief"` con 20.000 puntos en el equipo de referencia con razón de píxeles 2; si no se alcanza, baja a 10.000 |
| V-5 | 9 | Versiones: `three` 0.186.1, `@react-three/fiber` 9.8.2 (pide `react >=19 <19.4`), `@types/three` 0.186.0. Sin `drei`. Sin `transpilePackages` para `three` ni r3f: solo `@loopitalab/viewer-3d` lo necesita. Fragmento del visor: 246 KB con gzip, solo por `next/dynamic` |

### Riesgos abiertos

- **Rango de React** (V-5): `apps/web` pide `react ^19.2.0`; React 19.4 saldría del rango de r3f 9.8.2. Decisión para `devops`: acotar o fijar el rango de `react`, o vigilar la actualización y subir r3f a la vez.
- **Costo de la extensión del material** frente a `MeshStandardMaterial` sin extender: no se midió en T3b. Lo mide T11 (A/B con `E2E_FLAT_COLORS` y con el material base) antes de T12.
- **Malla sintética**: el `buildPartMesh` real será más lento que el prototipo. Las cifras de V-3 son del lado de la GPU y de los atributos; el armado de la malla lo mide la guardia de Node de T10 (CA4-P6).
- **Bloqueo del hilo principal cerca del tope** (V-1): una escena que tarda hasta 1 s en armarse completa no rompe CA4-P8 solo si cada edición reconstruye una sola parte y esa parte se arma rápido. Si T12 lo contradice, `reuse` pasa a obligatorio y se evalúa un *worker* (sección 6c).
- **Punto de la muestra del documento** (C-3): `Gauge` no guarda con qué punto se midió; se supone punto bajo en los patrones escritos. Si las tejedoras miden en otro punto, hará falta `Gauge.stitch` en una versión futura del esquema (no en la v2).
- **Valores "validar con tejedora"** (C-5, C-6, C-8): `STITCH_HEIGHT_FACTOR`, la tolerancia de 1,25 y `ρ = 1,2` pueden moverse con T1b. Las pruebas los llevan como valores actuales, no como reglas físicas.

## Enmiendas por la implementación de T5 (2026-11-13)

Registradas por `arquitecto` a partir de T5 de la fase 4 (commit `ca96b46`), verificadas contra `packages/pattern-core/src/profile.ts` y `validate.ts`. Son desvíos del texto de este ADR o contratos que el ADR no fijaba.

| ID | Clase | Sección | Enmienda |
|---|---|---|---|
| T5-1 | Contrato nuevo | 1 y 2 (avisos) | **`ValidateOptions.assumedGaugeStitch?: GaugeStitch`**, por omisión `"sc"`: punto con que se midió `assumedGauge`. La aplicación lo traduce desde `assumption` de `suggestedGauge` (`"crochet-pb"` → `"sc"`, `"crochet-pa"` → `"dc"`). Un valor que no sea `hdc`, `dc` ni `tr` se lee como `"sc"`. La muestra del documento se lee siempre como punto bajo (C-3). Con `weightCat`, el validador usa una **tabla interna de muestra de crochet por categoría** (`ASSUMED_CROCHET_GAUGE`: puntos, vueltas en 10 cm y punto de la muestra, `"dc"` en la categoría 0 y `"sc"` en las demás). Es una copia de `suggestedGauge(cat, "crochet")` de `yarn-catalog`, porque el núcleo no depende de él (ADR 0002). Prioridad: `gauge` del documento, después `assumedGauge` y después `weightCat`. Respeta el invariante de opciones (ADR 0003, E10): solo cambia información |
| T5-2 | Desvío | 1 | **`STITCH_HEIGHT_FACTOR` vive en `profile.ts`**, no en `stitches.ts`, junto a `PROFILE_RADIAL_TOLERANCE`, `shapeMetrics`, `roundHeightFactor`, `partProfile` y `partDimensions`. El tipo es `Readonly<Partial<Record<StitchCode, number>>>`: `slst`, `ch` y `sk` no tienen entrada. `index.ts` exporta la API pública del perfil; `revolutionProfile` y `RadialStep` son internos (los usa el validador) |
| T5-3 | Regla más estricta | 2 (avisos) | **`ROUND_GROWS_FAST` y `ROUND_SHRINKS_FAST` exigen, además del radio acotado** (`Δr/s` en valor absoluto mayor que `PROFILE_RADIAL_TOLERANCE`), que **la vuelta misma cambie el conteo en el mismo sentido** (aumenta para `GROWS`, disminuye para `SHRINKS`). Motivo: tras una vuelta acotada, el perfil sigue abriéndose o cerrándose en las vueltas siguientes sin que cambien el conteo, y un aviso con "+0 puntos" no ayuda. **Un aviso como máximo por vuelta escrita** (un rango "V5–8" cuenta como una; si cambia el conteo, ya es `ROUND_RANGE_CHANGES`). La V1 sobre anillo mágico no se evalúa (sin cambio). Solo en espiral y en vueltas unidas; en hileras no hay avisos de forma. **Validar con `experto-tejido`** (T21): es más estricto que el texto de C-6 |
| T5-4 | Precisión | 2 (paso 3) | **`CLAMP_EPSILON = 1e-9`**, interno (no se exporta): margen relativo al comparar `Δr` en valor absoluto con `s × tolerancia`. Una vuelta justo en el borde (por ejemplo, volver al conteo de dos vueltas atrás después de un acotado) no se acota por un error de coma flotante. G3 se prueba con ese margen |
| T5-5 | Precisión (regla de oro 6) | 2 (avisos) | **Sin muestra** (ni `gauge` en el documento, ni `assumedGauge`, ni `weightCat` en las opciones) **no hay avisos de forma**. El validador no inventa una muestra |
| T5-6 | Precisión | 2 (textos) | Los textos de los avisos llevan antes **"<nombre de la parte>, vuelta N:"** (por ejemplo, "Cabeza, vuelta 7: esta vuelta aumenta…"), como los demás mensajes del validador escrito. `data` trae `round`, `change`, `ratio` (redondeado a 3 decimales) y `tolerance`. "unos 6" solo aparece si la vuelta es de punto bajo (factor de alto 1) |

**Riesgos abiertos**:

- **Tabla de muestra de crochet duplicada** (T5-1): si `yarn-catalog` cambia `fibras.json`, los grosores o `ROWS_PER_STITCH_BY_ASSUMPTION`, la copia del validador se desalinea sin que nada falle. Falta una **prueba cruzada** fuera del núcleo (en `apps/web` o en un paquete de pruebas que importe los dos) que compare, para las categorías 0 a 7, `suggestedGauge(cat, "crochet")` con lo que usa el validador. Hoy la tabla es una constante privada de `validate.ts`: la prueba necesita que se exporte (por ejemplo, como `ASSUMED_CROCHET_GAUGE` de solo lectura) o que compare por comportamiento (mismos avisos con `weightCat` que con `assumedGauge` más `assumedGaugeStitch`). Se asigna a T19.
- **Regla de T5-3**: si `experto-tejido` prefiere avisar también en las vueltas que siguen a una acotada, el cambio es una enmienda del validador; no cambia el documento ni el perfil.

## Enmiendas por la implementación de T10 y T11 (2026-11-14)

Registradas por `arquitecto` a partir de T10 (commit `f803e9c`, `packages/viewer-3d`, parte pura) y T11 (commit `d7595ac`, subruta `@loopitalab/viewer-3d/three` y `apps/web/src/components/amigurumi/`). Se verificaron contra `packages/viewer-3d/src/` (`types.ts`, `mesh.ts`, `frame.ts`, `scene.ts`, `mat4.ts`, `three/renderer.ts`, `three/material.ts`), `test/perf.test.ts`, el README del paquete y `apps/web/src/components/amigurumi/` (`controller.ts`, `AmigurumiViewer.tsx`, `AmigurumiViewerLoader.tsx`). Las cifras de T11-5 a T11-7 vienen del informe de T11: no quedaron escritas en el repositorio (ver "Lo que no coincide"). Las convenciones de posición (T10-4) precisan el ADR 0011, sección 2; allí se enlazan desde [Enmiendas por T10](0011-posicion-de-partes-y-editor-escrito.md#enmiendas-por-t10-2026-11-14).

### T10: parte pura (`@loopitalab/viewer-3d`)

| ID | Clase | Sección | Enmienda |
|---|---|---|---|
| T10-1 | Contrato nuevo | 3 | **`PartMesh` agrega dos campos.** `loop: Uint8Array` es la hebra de cada vértice (`LOOP_BOTH` 0, `LOOP_FRONT` 1, `LOOP_BACK` 2, exportadas); con ella el backend dibuja la línea de borde del relieve que pide la enmienda C-7, sin cambiar la forma. `ringPhase: Float64Array` es el giro de cada anillo del perfil, en vueltas (0 a 1). Su largo es la cantidad de vueltas concretas más 1, y en hileras vale 0 (T10-2) |
| T10-2 | Desvío y contrato nuevo | 3 y 4 | **Giro por anillo.** Cada anillo gira lo necesario para que, en promedio, la base y el tope de los puntos de la vuelta queden alineados. Sin ese giro, una vuelta con los aumentos juntos ("aum x5, 8 pb") se tuerce: en el fixture B, el 1,6 % del área quedaba invertida, y con el giro queda en 5·10⁻⁶. Como en la tela, el inicio de vuelta se corre. Por eso la firma pasa a ser **`surfaceFrame(profile, round, stitch, { mesh }?)`**: con la malla del anfitrión, el marco usa su `ringPhase` y cae sobre el punto de la malla. Sin `mesh`, el marco queda sobre la superficie pero no necesariamente sobre el punto pedido. **`buildScene` siempre pasa la malla, y T16 también debe pasarla** (el modo "Posicionar" y la vista previa de un ancla). `Frame` es `{ position, normal, tangent, meridian, round, stitch, clamped }`: `position` es el centro del borde superior del punto ("entre la V10 y la V11"), se cumple `tangent × meridian = normal`, `round` es el número visible ya acotado y `stitch` es 0-based |
| T10-3 | Contrato nuevo | 4 | **`SceneResult.updates: SceneUpdate[]`**, con una entrada por parte: `{ kind: "kept" }` cuando son la misma referencia, la misma muestra y las mismas lanas, y no se toca nada; `{ kind: "recolored", from, to }` cuando la forma es la misma y `colorizePartMesh` reescribió `yarn` en el lugar, en `[from, to)`; `{ kind: "built", reusedRounds }` cuando la malla es nueva y se copiaron `reusedRounds` vueltas de la anterior. El backend lo usa para no subir de más (T11-1), y la guardia CA4-P6 para contar. Precisiones: la muestra se compara por valor (`stitchWidthCm` y `roundHeightCm`); **la caché anterior se consume** (las mallas recoloreadas se modifican en el lugar), así que `previous` no se reutiliza dos veces; `SceneCache` es opaca y su estado vive en un `WeakMap` |
| T10-4 | Precisión de contrato | 4 (y ADR 0011, sección 2) | **Convenciones de posición**: <ul><li>`SurfaceAt.rotationDeg` es `[sobre la normal, sobre la tangente, sobre el meridiano]`, en ese orden. Se aplica en el marco del ancla, con la base `[tangente, meridiano, normal]` como ejes x, y, z: `Rz(r₀) · Rx(r₁) · Ry(r₂)`.</li><li>`FreeAt.rotationDeg` usa Euler XYZ como `THREE.Euler` con orden `"XYZ"`: `Rx · Ry · Rz`.</li><li>Con `attach: "start"`, el inicio de la parte va en el ancla y la pieza crece por la normal. Con `"end"`, el borde abierto (el centro de la última vuelta, a `profile.heightCm`) va en el ancla, y la pieza se da vuelta y sale hacia afuera.</li><li>En hileras, la tangente es siempre +x, el meridiano +z y la normal −y: el panel mira hacia −y.</li><li>La ubicación automática va en fila sobre +x, en el orden de `parts` y de las copias, separada por `AUTO_PLACEMENT_GAP_CM = 2` (exportada) y **a la derecha de las piezas libres** (después del mayor x de las piezas con `FreeAt`).</li><li>Las anclas que no se resuelven (el anfitrión no existe o es la misma copia, hay un ciclo, o la cadena es más profunda que `LIMITS.maxLayoutDepth`) se ubican de forma automática y dan `ANCHOR_UNRESOLVED` con `data.reason` (`host`, `cycle` o `depth`). Solo pasa en documentos que no son `savable`.</li><li>`copies` se lee como en `recommendedLimitUsage` (omitido o inválido es 1) y se acota a `LIMITS.maxCopies`.</li></ul> |
| T10-5 | Precisión | 3 y 6c (G12) | **`reuse.fromRound` es una cota, no una promesa.** Es el índice 0-based de la vuelta concreta editada (el de `roundStart`). La función verifica con metadatos privados de cada malla (un `WeakMap` por `PartMesh`, no un campo público) qué vueltas siguen iguales en contenido, inicio, lanas y anillos del perfil, y copia solo esas. Si nada coincide, arma desde cero. **Rearma también la vuelta anterior a la editada**: la vuelta `c` usa los anillos `c` y `c + 1`, y en revolución también la subida del anillo `c` y la normal del anillo `c + 1`, que mira al `c + 2`. Editar la vuelta `k` mueve el anillo `k + 1`, así que la vuelta `k − 1` no se puede copiar. `buildScene` no sabe qué vuelta cambió: pasa `fromRound: Number.MAX_SAFE_INTEGER` y deja que decida la verificación. G12 se prueba exigiendo que la copia del prefijo se aplique en al menos un cuarto de los casos |
| T10-6 | Alcance | 3 | **`limit` es solo por parte**: corta en `roundStart[roundsDone] + stitchesDone`, en puntos **producidos** (un `aum` cuenta 2), y acota los valores fuera de rango. Armar una escena parcial, con las piezas terminadas, la actual a medias y las siguientes ocultas, **queda para la fase 6** (`follow` y `modo-tejiendo`). `buildScene` no recibe `limit` |
| T10-7 | Contrato nuevo | 4 | **`SceneNoteCode`** = `ANCHOR_CLAMPED` (vuelta o punto del ancla acotados; `data` con el anfitrión, lo pedido y lo usado), `ANCHOR_UNRESOLVED` (T10-4), `GAUGE_ASSUMED` (uno solo por escena, primero en la lista, con `data.partIds`), `SHAPE_RUFFLES` y `SHAPE_GATHERS` (anillos con `strain` mayor o menor que 1, con `data.rounds`; el mensaje nombra hasta 5 vueltas). `SceneNote` es `{ code, message, partId?, copy?, data? }`. **Los textos son provisionales y los revisa T18** (`documentador`, con `experto-tejido`) |
| T10-8 | Medición (R4-19) | 6 y "Medición" | **Referencia real en Node** (Apple M1 de 8 núcleos y 8 GB, Node 24.16; medianas en 3 ejecuciones): `partProfile` del fixture A, 0,045 ms; `buildPartMesh` del fixture A (1.800 puntos, 7.254 vértices y 3.654 triángulos), de 0,72 a 0,90 ms; `buildScene` completa del escenario de referencia (14 instancias y 4.036 puntos), de 1,6 a 1,75 ms; `buildScene` con una parte editada (1 malla reconstruida y el prefijo reutilizado), de 0,41 a 0,50 ms. **Se registra el doble** (`REFERENCE_MS` en `test/perf.test.ts`: 0,1, 1,8, 3,5 y 1 ms), como en `stitch-render`. La guardia falla a **3 veces lo registrado, y a 6 en la CI** (variable `CI`; `VIEWER_3D_PERF_FACTOR` lo cambia). Queda muy por debajo del presupuesto de la sección 6 (10 ms para la malla, 3 ms para la escena). Cierra la parte de Node de R4-19 |
| T10-9 | Precisión de firmas | 3 | `profileToSvg(profile, { widthPx?, fill?, title? })`: `fill` es el color plano de la lana inicial, que pasa la aplicación. `opts.lod` se acepta, pero la malla pura no cambia con el nivel de detalle. `colorizePartMesh` devuelve un rango vacío si no cambió ningún vértice. `shapeSignature` es conservadora: "pb, pb" y "2 pb" dan firmas distintas, así que puede reconstruir de más, nunca de menos |

### T11: backend `three` y componente (`apps/web`)

| ID | Clase | Sección | Enmienda |
|---|---|---|---|
| T11-1 | Cambio de contrato | 5 | **API real de `createThreeRenderer(opts)`**. `opts` es `{ gl, scene, camera, invalidate, setPixelRatio?, limitedContext?, background? }`: recibe los objetos del lienzo de r3f y no depende de React. El `AmigurumiRenderer` resultante tiene: <ul><li>`setScene(scene: RendererScene, looks): ViewerPolicy`, que recibe el `SceneResult` de `buildScene` (`instances`, `stitchCount?` y `updates?`) en lugar de `instances` sueltas. Con `kept` no sube nada, con `recolored` sube solo el rango de `yarn` y con `built` copia la malla en los búferes reservados. Devuelve la política aplicada.</li><li>`setLooks`, `setPreviewOverride` y `setLod`, como en la sección 5. `setLod` es un pedido: la política puede forzar `"smooth"`.</li><li>`policy` (solo lectura).</li><li>`pick(ndcX, ndcY)`, que devuelve `{ partId, copy, stitch, roundIndex, stitchInRound, point }`: `roundIndex` es la vuelta **concreta** 0-based (no el número visible), `stitchInRound` es 0-based y `point` está en cm, en coordenadas del mundo.</li><li>`setHighlight({ partId, copy?, roundIndex? } \| null)`, con **`roundIndex` en lugar de `round`**: sin `copy` resalta todas las copias, y sin `roundIndex`, toda la parte.</li><li>`bounds()`, la esfera que envuelve la escena, para encuadrar la cámara.</li><li>`snapshot({ width, height, footer? })`.</li><li>`setMaterialVariant("fiber" \| "base")`, solo para el A/B.</li><li>`stats()` y `resetStats()`, los contadores del modo de medición `?perf=1`.</li><li>`renderNow(sync?)`, que dibuja ya y espera a la GPU, para medir.</li><li>`dispose()`.</li></ul>El modelo crece hacia +z y el renderer lo muestra de pie: la raíz de la escena gira −90° sobre x |
| T11-2 | Desvío | 5 y 6b | **Las luces las pone el renderer** (hemisférica más direccional), no el componente, para que la precompilación de los dos programas (`gl.compile` con una malla de sonda) vea las luces reales y el primer frame no recompile. **El resaltado usa `gl_VertexID`** contra un rango de vértices en un uniforme (`uHighlight`), en materiales gemelos con la misma `customProgramCacheKey` y los mismos parámetros: comparten programa y **no agregan un tercero**. Siguen siendo 2 programas. La variante `"base"` agrega los suyos solo en la página de medición |
| T11-3 | Contrato nuevo | 5 y 6c | **Controlador fuera de React** (`ViewerController`, `apps/web/src/components/amigurumi/controller.ts`). Recibe cada versión del documento y **decide el modo con `recommendedLimitUsage` (`sceneStitches`) y `viewerMode` antes de armar las mallas**. Dentro del límite recomendado, `buildScene` y `setScene` van en el mismo turno. Sobre el límite hay como mucho una reconstrucción pendiente, en un turno nuevo por `MessageChannel`: la edición siguiente reemplaza a la anterior, sin cola, con "Actualizando 3D…". Sobre `SCENE_HARD_STITCH_CAP` no arma mallas (`setScene` con la escena vacía) y el componente muestra siluetas. Si solo cambiaron los aspectos (las mismas referencias de `parts`, `layout` y `gauge`, y los mismos ids de lanas en el mismo orden), llama solo a `setLooks`. **Las siluetas también se cargan por `next/dynamic`**, igual que el visor, así que **sin WebGL2 no se descarga `three`** y el perfil y el SVG no entran en el JS inicial de la ruta |
| T11-4 | Cambio de ruta | 6 y "Medición" | **`/dev/visor-3d` reemplaza a `/dev/visor`**: el prototipo sintético de T3b se borró. La página usa `viewer-3d/three` y r3f con patrones de demostración leídos por el motor. `apps/web/e2e/medir-visor-3d.ts` reemplaza a `medir-visor.ts`. No es una prueba: Playwright no lo recoge y no corre en la CI, y T12 lo extiende con `edit-to-paint-3d`, `edit-to-feedback` y `hover-to-paint-3d`. Las referencias a `/dev/visor` de este ADR y de la hoja de ruta quedan como históricas, con la nota del reemplazo |
| T11-5 | Medición (R4-19) | 6 y 6b | **A/B del material extendido frente a `MeshStandardMaterial` sin extender** (variantes `fiber`, `flat` y `base` de `medir-visor-3d.ts`): **no hay costo medible** ni en el M1 con GPU real ni en SwiftShader. Además, con el aspecto neutro, el E2E compara los píxeles con el material base y da 0 píxeles distintos en SwiftShader ("neutro = base"). **Cierra la parte del material de R4-19.** Queda la confirmación en el equipo de referencia (T12) |
| T11-6 | Medición | 6 y 6b | **Edición con CPU ×4, fixture A, p95** (del evento al frame). En el M1: editar una vuelta, 24,7 ms; recolorear, 12,1 ms; `setLooks`, 12,4 ms; vista previa al pasar el cursor, 11,8 ms. En SwiftShader: 22,3, 11,7, 11,4 y 12,6 ms. Todo queda por debajo de 100 ms con margen. No reemplaza a CA4-P1 a CA4-P5, que mide T12 con la instrumentación `edit-to-paint-3d` en el E2E y en el equipo de referencia |
| T11-7 | Tamaño | 9 | **El fragmento del visor pesa 255 KB con gzip** (246 KB en T3b), y sigue cargándose solo por `next/dynamic`. **Las rutas que usan `pattern-core` crecen 0,8 KB con gzip**, porque `recommendedLimitUsage` entra al fragmento compartido al importarlo el controlador. **Se acepta**: T14 lo necesita igual para el medidor de límites recomendados |
| T11-8 | Límites conocidos | 5, 6c y 7 | La pieza que ondula (`strain > 1`) **se dibuja lisa**, y solo el aviso `SHAPE_RUFFLES` lo dice; no hay geometría ondulada en la v1. **`snapshot` escala el lienzo actual**, no hace un render a otra resolución: una miniatura más grande que el lienzo pierde nitidez. `pick` da la vuelta concreta, y la aplicación la traduce a número visible con `concreteRounds`. El resaltado cubre el rango de vértices de la vuelta |
| T11-9 | Desvío | 8 | **La descripción accesible del visor es propia** (partes, copias y medidas estimadas del motor, con `aria-describedby` en el lienzo) y **no usa `describeWritten`**, para que el fragmento del visor no cargue `pattern-render`. **T14 puede sumar la descripción completa**, con vueltas, conteo final y posiciones en la forma de C-17, desde el estudio, que ya carga `pattern-render` |

### Lo que no coincide

- **Cifras de T11 sin respaldo en el repositorio** (T11-5 a T11-7): la medición A/B, las latencias de edición y los tamaños del fragmento salen del informe de T11. No están en `packages/viewer-3d/README.md`, ni en `apps/web/e2e/README.md`, ni en otro documento versionado, y `medir-visor-3d.ts` escribe su salida a un JSON que no se guarda. Hace falta que T12 (o el PR de T11) las deje en `docs/qa-fase-4.md` junto con la salida del script. **Cerrado por T12**: están en [`docs/qa-fase-4.md`](../qa-fase-4.md), sección "Cifras de T11", con una repetición en T12.
- **Cantidad de corridas de la referencia de Node** (T10-8): el README del paquete dice "medianas de 15 corridas, en 3 ejecuciones" y el comentario de `perf.test.ts` dice "medianas de 3 corridas". Las cifras coinciden; falta unificar la descripción.
- **Dos lecturas del crecimiento rápido**: el validador avisa `ROUND_GROWS_FAST` o `ROUND_SHRINKS_FAST` solo en la vuelta que cambia el conteo (T5-3), pero las notas `SHAPE_RUFFLES` y `SHAPE_GATHERS` de la escena listan todos los anillos con `strain` distinto de 1, también los que siguen a una vuelta acotada. Las dos cosas son correctas por diseño (C-6: `strain` es dato de la geometría), pero la usuaria puede ver "V7, V8, V9" en el 3D y un solo aviso en la V7 del validador. Lo revisan T18 (textos) y T21 (`experto-tejido`).
- **Profundidad de anclas en la escena** (T10-4): en documentos que no son `savable`, qué copia de una cadena de más de `LIMITS.maxLayoutDepth` queda sin resolver depende del orden de `parts`. La escena cuenta la profundidad desde la copia por la que empieza a resolver. Con documentos `savable` (16 anclas como máximo, `LAYOUT_DEPTH`) nunca se activa. No hace falta cambiarlo.

### Riesgos abiertos

- **T16 sin `{ mesh }`**: si el modo "Posicionar" llama a `surfaceFrame` sin la malla del anfitrión, el ancla que muestra no coincide con la que dibuja `buildScene` (T10-2). La revisión de T16 lo verifica.
- **Índices 0-based frente a números visibles** (T11-1 y T11-8): `pick` y `setHighlight` hablan en vueltas concretas 0-based, y `SurfaceAt.round` y el texto, en números visibles. La traducción la hace la aplicación con `concreteRounds`, y un error de uno en T14 o T16 movería el resaltado o el ancla una vuelta. QA (T19) lo prueba con una parte que tenga rangos ("V5–8").
- **Confirmación en el equipo de referencia** (R4-19): las cifras de T10-8, T11-5 y T11-6 son del M1 y de SwiftShader. La decisión la toma la medición de T12 en el equipo de referencia, como CA-P6.

## Enmiendas por la implementación de T12 (2026-11-16)

Propuestas por `visor-3d` (con `devops` para la CI) y registradas por `arquitecto` a partir de T12 de la fase 4 (commit `be03aa7`). Se verificaron contra `apps/web/src/lib/amigurumi/viewer-perf.ts`, `apps/web/src/components/amigurumi/controller.ts` (`afterPaint`, `backgroundTask`, `nextTask`), `packages/viewer-3d/src/three/renderer.ts` (`setHighlight`), `packages/viewer-3d/src/three/constants.ts`, `apps/web/e2e/latencia-visor.spec.ts`, `apps/web/e2e/README.md`, `apps/web/playwright.config.ts`, `.github/workflows/ci.yml` y las cifras de [`docs/qa-fase-4.md`](../qa-fase-4.md). Todas las cifras son del M1 (8 núcleos, 8 GB) y de SwiftShader. **El equipo de referencia todavía no se midió**: la guía está en `docs/qa-fase-4.md`, sección "Medición en el equipo de referencia". La medición dejó además un arreglo de la aplicación que no toca ningún contrato: `sourceIndexByNumber` (`apps/web/src/lib/amigurumi/rounds.ts`) quita una búsqueda cuadrática de `PartTextEditor` que costaba 30,8 ms por tecla con una parte de 449 vueltas.

| ID | Clase | Sección | Enmienda |
|---|---|---|---|
| T12-1 | Contrato nuevo (medición) | 6, 6b, 6c y "Medición" | **Instrumentación con `ViewerPerfRecorder`** (`apps/web/src/lib/amigurumi/viewer-perf.ts`). Se activa solo con `?perf=1` en `/dev/amigurumi`: `viewer-perf-probe.ts` escucha las entradas en fase de captura y expone `window.__loopitaViewerPerf`. En producción, cada gancho es una comparación con `null`. Cada medida va de `event.timeStamp` de la entrada a lo primero que corre después del frame pintado, como en el ADR 0004, y queda como `performance.measure`: <ul><li>**`loopita:edit-to-paint-3d:<origen>`**: hasta el frame del visor que ya dibuja el cambio. Fuera de los límites, una edición reemplazada se cierra con el frame que dibuja la última.</li><li>**`loopita:edit-to-feedback:<origen>`**: hasta que el editor de texto o de bloques muestra el texto, el conteo y los errores, sin esperar al 3D.</li><li>**`loopita:hover-to-paint-3d`**: desde `pointerover`, `pointerout` o `focusin` hasta el frame.</li></ul>El origen es `text`, `blocks`, `yarn`, `flat` u `other`. Para CA4-P5 se registran como tramos `validate:review`, `describe` y `validate:autosave`, y el resumen cuenta los que empiezan dentro de una ventana de edición. **Las E2E (`latencia-visor.spec.ts`) editan solo con teclado y puntero y no graban traza** (`trace: "off"`): con la traza activada, el mismo escenario pasaba de p50 16 a 66 ms |
| T12-2 | Desvío | 6c (y T11-3) | **La reconstrucción diferida corre después de pintar, no en un `MessageChannel`.** Sobre el límite recomendado, `ViewerController` programa la reconstrucción con `afterPaint`: el próximo `requestAnimationFrame` y, desde ahí, una tarea de prioridad baja (`scheduler.postTask` con `priority: "background"` donde existe, como en Chromium; si no, `setTimeout(0)`). `nextTask` (`MessageChannel`) queda solo para cuando no hay `requestAnimationFrame` (Node). **Motivo**: el mensaje de `MessageChannel` corría antes de que el navegador pintara, y el editor esperaba a la reconstrucción (`edit-to-feedback` daba lo mismo que `edit-to-paint-3d`; con 60.900 puntos en SwiftShader y CPU ×1, p95 72,8 frente a 84,6 ms). **Lo que no cambia**: como mucho una reconstrucción en curso, la siguiente reemplaza a las pendientes sin cola, y se muestra "Actualizando 3D…". **Costo**: fuera de los límites, el 3D espera a que pasen las teclas y React (60.900 puntos en SwiftShader con CPU ×4: `edit-to-paint-3d` p50 de 76 a 108 ms). Es lo que pide esta sección: el editor nunca espera al 3D. En una pestaña oculta, el 3D espera a que se vuelva a mostrar |
| T12-3 | Contrato precisado | 5 (y T11-1) | **`setHighlight` no vuelve a dibujar si el objetivo es el mismo** (mismo `partId`, `copy` y `roundIndex`). El estudio vuelve a fijar el resaltado en cada edición y en cada movimiento del cursor. Con SwiftShader, cada frame de más ocupaba el proceso de la GPU, que también compone la página: con 60.900 puntos y CPU ×1, `edit-to-feedback` bajó de p95 163 a 55–60 ms. `setScene` sigue recalculando el rango si cambió la malla |
| T12-4 | Calibración (V-4) | 6 | **`LOD_STITCH_BUDGET = 20_000`, confirmado en el M1**: 19.800 puntos en `"relief"`, con el aspecto por fibra, razón de píxeles 2 y CPU ×4, giran a 60 fps (frame p95 de 18,1 ms), el tope de la pantalla. SwiftShader da 22 fps y solo se informa (CA4-P4). **Lo confirma el equipo de referencia**; si no llega a 30 fps, baja a 10.000 (V-4 no cambia) |
| T12-5 | Calibración y regla nueva (V-1) | 6c | **`SCENE_HARD_STITCH_CAP` queda en 200.000.** La regla de V-1 se completa así: "la escena más grande que se arma completa en ≤ 1 s con CPU ×4 **y la parte más grande que admite se rearma en ≤ 100 ms con CPU ×4**". **Solo se sube junto con un *worker*** (T12-6). Con la primera condición sola, el M1 aceptaría unos 700.000 puntos (993 ms con 50 partes distintas), pero el tope también acota la parte más grande que se rearma en el hilo principal con cada edición. Con el tope actual, 200.000 puntos se arman en 295 ms en el M1. Ver la diferencia con las cifras en "Lo que no coincide" |
| T12-6 | Medición (R4-20) y propuesta | 6c | **R4-20 está medido** (escenario `cerca-del-tope`: una parte de 120.000 puntos y 449 vueltas, más el fixture A con 41 copias, 193.800 puntos). <ul><li>**En el M1 con GPU se cumple**: `edit-to-feedback` p95 de 40 ms (39,8) con CPU ×4.</li><li>**En SwiftShader no se cumple**: p95 de 230 a 310 ms (231 a 254 con CPU ×4, 277 a 310 con CPU ×1), por la subida de la malla entera (`PartBuffers.write`, 481.694 vértices, unos 17 MB) en el frame. Ahí solo se informa; `E2E_R420_STRICT=1` lo exige.</li><li>**`reuse` ya es obligatorio en los hechos**: `buildScene` siempre lo pasa (T10-5), y no hace falta cambiar el contrato. Tampoco alcanza solo: una edición cerca del inicio de la parte la rearma casi entera.</li><li>**Propuesta, no implementada**: si en el equipo de referencia `edit-to-feedback` da p95 ≥ 100 ms cerca del tope, se pasa `buildPartMesh` a un *worker* en modo degradado y se sube a la GPU solo desde el primer vértice que cambió. Aplicarla cambia el contrato de `setScene`/`PartBuffers` (rango de subida) y necesita su propia enmienda, con `revisor-seguridad` si el *worker* recibe el documento.</li></ul> |
| T12-7 | Calibración de la CI | "Medición" | **`E2E_VIEWER_BUDGET_MS = 150` en la CI** (`.github/workflows/ci.yml`; era 400 provisional). Cubre el p95 de `edit-to-paint-3d` (CA4-P1 a CA4-P3) y de `hover-to-paint-3d` (CA4-P10). Se fijó sin una corrida de GitHub: el peor p95 local con SwiftShader y CPU ×4 (65 ms, bloques), por 1,4 (la mayor razón entre la CI y el local que se vio en el colorwork), por 1,5 de margen, da unos 137 ms, que se redondean a 150. **Con los primeros datos de la CI se recalibra a 1,5 veces su peor p95.** `edit-to-feedback` fuera de los límites (CA4-P8) usa 100 ms fijos, también en la CI. Es una guardia de regresiones: los 100 ms de la regla de oro 7 se exigen en el equipo de referencia |
| T12-8 | Lo que no coincide | — | Ver la lista de abajo |

### Lo que no coincide (T12-8)

- **CA4-P8 con 100 ms fijos es frágil en la CI.** En una de las tres corridas con el valor final, el primer intento dio `edit-to-feedback` p95 de 318,5 ms (máximo 792) con el equipo cargado por procesos ajenos, y el reintento, 27,9 ms. Con CPU ×4 en local, el p95 llega a 57–58 ms, unos 81 ms esperados en GitHub. Si falla en la CI sin cambios de código, hay que mirar primero la duración de la corrida. T19 decide si se mantiene así.
- **CA4-P9 con CPU ×4**: al cargar la página hay tareas de más de 500 ms con cualquier escena (573 y 462 ms en el escenario sobre el tope; de 600 a 2.271 ms en el de referencia, por el primer armado y la compilación de los programas en SwiftShader). La spec exige **500 ms al editar y 500 × la limitación de CPU al cargar** (`LONG_TASK_MS * CPU_RATE`). El criterio de la hoja de ruta dice "ninguna tarea larga de más de 500 ms", sin separar carga y edición: T19 lo ajusta o lo acepta.
- **CA4-P7 falta verlo en `/disenos/[id]` con sesión**: T12 lo comprobó en `/dev/estudio`, que monta el mismo estudio de colorwork, pero el criterio nombra la ruta real. Queda para T19 (E2E con sesión).
- **`latencia.spec.ts` (colorwork) graba traza**: no fija `trace: "off"` y hereda `trace: "retain-on-failure"` de `playwright.config.ts`, que graba siempre. Puede inflar sus cifras (ver T12-1). Queda para T19, con `render-puntos`.
- **Encontrado al verificar (arquitecto)**:
  - **La regla de T12-5 y las cifras no cuadran en el M1.** Con CPU ×4, cada reconstrucción de la parte de 120.000 puntos es una tarea larga de 140 a 210 ms (unos 150 ms), y `LIMITS` deja que una sola parte llegue al tope (1.000 vueltas de hasta 50.000 puntos). Leída como "la tarea de reconstrucción dura ≤ 100 ms", la segunda condición ya no se cumple con 200.000. Leída como "`edit-to-feedback` < 100 ms con esa parte", sí se cumple en el M1 con GPU (T12-6). **Propuesta**: fijar la segunda lectura, que es la que mide el E2E, y que la decida el equipo de referencia.
  - **La CI corre con CPU ×1, no ×4.** Las secciones 6 y "Medición" dicen "SwiftShader y CPU ×4" para la CI. `ci.yml` no fija `E2E_CPU_RATE`, y las tres corridas de `docs/qa-fase-4.md` "como la CI" son con CPU ×1 (como el colorwork desde la fase 2). Lo que vale es lo que hace el código; el texto de este ADR queda como histórico.
  - `docs/qa-fase-4.md` dice "con los cambios de T12 (sin commit)"; ya están en `be03aa7`.

### Riesgos abiertos

- **Equipo de referencia sin medir**: T12-4, T12-5 y T12-6 son del M1. Si el equipo de referencia no llega, `LOD_STITCH_BUDGET` baja a 10.000 o se aplica la propuesta del *worker* (T12-6). Las dos cosas son enmiendas sin tocar el documento.
- **Presupuesto de la CI sin una corrida real** (T12-7): 150 ms viene de un sustituto local. Cuando llegue la primera corrida de GitHub, se recalibra.
- **Prioridad `background` fuera de Chromium** (T12-2): sin `scheduler.postTask`, `setTimeout(0)` corre detrás de los mensajes de React, pero no detrás de las entradas. En Firefox y Safari el comportamiento fuera de los límites no está medido.

## Enmiendas por la implementación del grupo E (2026-11-16)

Registradas por `arquitecto` (T22) a partir de dos commits:

- `c4ab055`: T21 en el visor (espiral continua, avisos por tramos y capturas de CA4-V2);
- `cd6c02a`: T20 en el núcleo (topes contra documentos hostiles).

Se verificaron contra `packages/viewer-3d/src/geometry.ts` (`ringPoint`, `ringTurn`, `ringZ`), `mesh.ts`, `frame.ts` y `scene.ts` (`roundsZone`, `SHAPE_INTENDED`, `PART_TOO_LARGE`). También contra `test/t21-espiral.test.ts`, `test/scene.test.ts`, el README del paquete y [`docs/capturas/fase-4/visor-3d/README.md`](../capturas/fase-4/visor-3d/README.md). Los topes del validador están en el [ADR 0011, enmiendas T20-1 a T20-5](0011-posicion-de-partes-y-editor-escrito.md#enmiendas-por-la-implementación-del-grupo-e-2026-11-16), y la muestra supuesta por parte, en T21-1, T21-2 y T21-8 del mismo ADR. Esas enmiendas cierran T14-5 y precisan T5-1 de este ADR: la muestra supuesta de los avisos de forma y la del 3D salen de la misma regla.

| ID | Clase | Sección | Enmienda |
|---|---|---|---|
| G-E1 | Corrección de geometría | 3 | **Espiral continua** (revisión T21: la "lengüeta" plana de la esfera). <ul><li>**Antes**: cada anillo era una hélice que solo subía en altura, con el radio y el giro fijos. En la línea de inicio de vuelta quedaba una ranura de ancho \|Δr\| por vuelta, de hasta 1,05 cm en el fixture B. En el cierre de la esfera, esas ranuras formaban una tira por la que se veía el interior.</li><li>**Ahora**: desde el anillo 2, `ringPoint(g, phase, j, f)` interpola el radio, la altura, el giro (`ringTurn`, con el paso de giro llevado a [−0,5; 0,5)) y la normal del anillo anterior (`f = 0`) al suyo (`f = 1`). El anillo 1 (la V1) no interpola el radio. **La malla y el marco de las anclas (`surfaceFrame`) usan la misma función**, así que un ancla sigue cayendo sobre la malla (T10-2).</li><li>**La sección 3 decía** "Se ve el escalón al empezar cada vuelta". **Ahora solo se ve el final de la última vuelta**, que queda abierta (F4-35): una rampa que termina en un escalón del alto de esa vuelta.</li><li>Prueba: `test/t21-espiral.test.ts`.</li></ul> |
| G-E2 | Corrección de geometría | 3 | **Abanico por punto ajustado.** El abanico de triángulos de cada punto parte del vértice de arriba a la izquierda, o del de la derecha si la base quedó corrida hacia adelante (el de arriba más cercano a la base corrida). Así, los puntos muy sesgados, como las disminuciones juntas, no se dan vuelta, y no queda área invertida en los fixtures A y B. La cantidad de triángulos por punto no cambia (`mesh.test.ts`) |
| G-E3 | Texto y precisión | 4 (T10-7) | **Avisos de forma por tramos.** `SHAPE_RUFFLES` y `SHAPE_GATHERS` nombran la zona con `roundsZone(rounds)`, exportada. Agrupa las vueltas en tramos contiguos: "en la vuelta 4", "entre la vuelta 3 y la 5", "en las vueltas 3 y 5", "en las vueltas 2 a 4, 7 y 9 a 10". Después de 4 tramos, dice "y N tramos más". Antes usaba solo la primera y la última vuelta, así que [3, 5] incluía la 4 (corrección C4 de T21). **Los dos textos cierran con "Si es lo que buscas (volante, pétalo, remate), ignora este aviso."** (`SHAPE_INTENDED`), la frase de F4-77 y F4-78, para que el cierre habitual de una pieza no parezca un error. Siguen marcados "validar con tejedora" |
| G-E4 | Contrato nuevo (defensa) | 4 y 9 | **`PART_TOO_LARGE`** (`SceneNoteCode`, commit `cd6c02a`). Una parte que pasa los topes de expansión del validador se arma **vacía** (sin vueltas), con este aviso y `data: { work, max }`. Hay dos casos: <ul><li>la parte misma pasa los topes (`exceedsExpansionLimits`);</li><li>su trabajo pasa lo que queda del presupuesto `LIMITS.maxExpansionWork` del documento.</li></ul>Solo pasa con documentos que no son `savable` (dañados, hostiles o sin validar): la vista no se cuelga, y cuesta lo que el texto de la parte. Al corregir la parte se vuelve a armar: nunca se recolorea ni se conserva la malla vacía. Junto con T20-2 del ADR 0011, `buildPartMesh` y `colorizePartMesh` expanden cada vuelta escrita como mucho una vez por lana inicial |
| G-E5 | Medición (R4-19) | 6 y "Medición" (T10-8) | **Cifra nueva de `buildPartMesh`** con el fixture A (1.800 puntos), después de G-E1 y G-E2: **unos 0,94 ms** en Node en el M1, frente a 0,72 a 0,90 ms en T10-8. Sigue bajo lo registrado (`REFERENCE_MS.mesh = 1,8`) y muy bajo el presupuesto de 10 ms de la sección 6. No hace falta cambiar la guardia CA4-P6. La cifra viene del informe de `visor-3d` de `c4ab055` (ver "Lo que no coincide") |

### Lo que no coincide

- **La cifra de G-E5 no está en el repositorio.** El comentario de `packages/viewer-3d/test/perf.test.ts` sigue diciendo "buildPartMesh 0,72 a 0,90 ms". Conviene que `visor-3d` lo actualice, junto con la diferencia entre "3 corridas" y "15 corridas en 3 ejecuciones" que ya anotó T10-8.
- **La sección 3 sigue diciendo** que un `inc` es "un abanico de una posición abajo a dos arriba". Es correcto, pero el vértice de partida ahora depende del corrimiento (G-E2). El detalle está en el README del paquete.
- **Propuestas de T21 sin implementar** (`docs/capturas/fase-4/visor-3d/README.md`, "Propuesta para mostrar mejor la última vuelta abierta"): <ul><li>marcar en el visor el borde abierto de la última vuelta, con una nota si la parte tiene `finish`;</li><li>el mismo borde como punto actual en el modo tejiendo (fase 6);</li><li>no tocar el perfil de la última vuelta sin T1b.</li></ul>Quedan como pendientes de la fase 4 que no son código (hoja de ruta, "Estado al cierre de la fase 4"). Lo mismo pasa con el destello no lineal del lurex y el relieve del pb (revisión T21, punto 6).
- **Anillos claros cerca del centro del disco plano** (`ondula.png`): son astillas de triángulos plegados por el perfil acotado con aumentos juntos. Ya estaban antes de T21 y están en "Limitaciones" del README del paquete. `experto-tejido` decide en la revisión de las capturas si hay que corregirlos antes de publicar.

### Riesgos abiertos

- **CA4-V2 sin la revisión visual de `experto-tejido`.** Las 7 capturas que pidió T21 están en `docs/capturas/fase-4/visor-3d/`, pero la revisión final la hace `experto-tejido` sobre esas imágenes, y está pendiente.
- **Equipo de referencia sin medir** (sigue de T12): G-E5 y las cifras de T12 son del M1.
