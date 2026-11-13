# ADR 0010: Geometría 3D del amigurumi derivada de las vueltas y paquete `viewer-3d`

- Estado: **aceptado** (2026-11-13, T0 de la fase 4), con las enmiendas de las [decisiones de la fase 4](../roadmap.md#decisiones-de-la-fase-4-aprobadas-el-2026-11-13) (ver [Enmiendas por las decisiones de la usuaria](#enmiendas-por-las-decisiones-de-la-usuaria-2026-11-13)): límites recomendados solo como advertencia (decisión 5) y aspecto por fibra en el 3D desde la fase 4 (decisión 10). Las reglas marcadas "validar con `experto-tejido`" se confirman en T1 de la fase 4 antes de implementarse; lo marcado "validar con tejedora", en T1b.
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
export interface ShapeMetrics {
  /** Ancho de un punto bajo en cm: 10 / gauge.stitchesPer10cm. */
  stitchWidthCm: number;
  /** Alto de una vuelta de punto bajo en cm: 10 / gauge.rowsPer10cm. */
  roundHeightCm: number;
  /** true si la muestra es supuesta (no está en el documento). */
  assumed: boolean;
}
export function shapeMetrics(gauge: Gauge, assumed: boolean): ShapeMetrics;
```

- **La muestra viene del documento** (`pattern.gauge`). Si falta, la capa de aplicación usa `suggestedGauge(grosor, "crochet")` de `yarn-catalog` con la lana inicial de la parte y marca `assumed: true` (regla de oro 6). La interfaz rotula las medidas como "supuesto" y nunca escribe esa muestra en el documento (como CA-F4 y CA3-L7).
- **Lo que define la forma es la proporción** entre alto y ancho del punto; la muestra solo fija la escala en centímetros. Hoy `yarn-catalog` supone 1,2 vueltas por punto en punto bajo (`ROWS_PER_STITCH_BY_ASSUMPTION["crochet-pb"]`), **pendiente de validar con tejedora** (glosario pendiente, "Filas en crochet").
- **Alto por tipo de punto**: `STITCH_HEIGHT_FACTOR: Record<StitchCode, number>` en `stitches.ts`, relativo al punto bajo (`sc = 1`). `inc`, `inc3` y `dec` valen lo mismo que `sc`, porque en la v1 se entienden en punto bajo. Los valores de `hdc`, `dc`, `tr`, `slst` y `ch` los fija `experto-tejido` en T1: **no se implementan sin ese dato** (validar con `experto-tejido`).
- **Alto de una vuelta**: el promedio de `STITCH_HEIGHT_FACTOR` de sus puntos producidos, por `roundHeightCm`. En la v1 no se modela que puntos de distinto alto en la misma vuelta deformen el anillo.

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
   - Con cadeneta, la cadeneta se une en un aro de `count` puntos, con radio `count × ancho / 2π`. Es la misma lectura que hace hoy `startAvailable`: la primera vuelta consume `count` puntos.
   - El inicio en óvalo (trabajar alrededor de la cadeneta por los dos lados) **no se puede expresar en el modelo actual**. Ver el ADR 0011, sección 2, y T1.
2. **Radio pedido** de la vuelta `i`: `r*ᵢ = nᵢ × ancho / 2π`, con `nᵢ = count.produced` de `concreteRounds`.
3. **Paso radial** `Δr = r*ᵢ − rᵢ₋₁`, con el alto de la vuelta `s = heightCmᵢ`.
   - Si `|Δr| ≤ s × PROFILE_RADIAL_TOLERANCE`, el anillo queda en `rᵢ = r*ᵢ` y sube `Δz = √(max(s² − Δr², 0))`.
   - Si no, el radio se acota a `rᵢ₋₁ ± s × PROFILE_RADIAL_TOLERANCE`, `Δz = 0`, y `strain = r*ᵢ / rᵢ` informa la ondulación o el fruncido.
4. **La pieza siempre crece hacia +z.** Un disco que crece al ritmo de la tela queda plano (`Δz ≈ 0`); con el conteo constante sube vertical (`Δz = s`); al disminuir, se cierra. Así salen las esferas, los cilindros y las gotas habituales sin formas predefinidas.

**Calibración** (`PROFILE_RADIAL_TOLERANCE`, constante con nombre):

- El modelo simple con 1,2 vueltas por punto marcaría como ondulado un disco de punto bajo con 6 aumentos por vuelta, que en la práctica queda plano. Por eso la tolerancia se calibra con casos de `experto-tejido`.
- Criterio de calibración propuesto (validar con `experto-tejido`): un disco de punto bajo de 6, 12, 18… queda plano y sin aviso; uno que aumenta claramente más rápido (por ejemplo, 12 por vuelta en punto bajo) ondula.
- Las cifras exactas las da T1. Mientras tanto, la constante no se usa para errores, solo para información.

**Hileras (`flat`)**:

- Se dibujan como un **panel plano**: fila `j` de ancho `nⱼ × ancho`, centrada, a la altura acumulada.
- Las filas impares se recorren en sentido inverso al asignar puntos. Así, el color por punto queda donde se tejió.
- No se pliega ni se curva en la v1.

**Avisos derivados** (validador de `pattern-core`, severidad `info`):

- `ROUND_GROWS_FAST` y `ROUND_SHRINKS_FAST` cuando `strain` sale de la tolerancia, con la vuelta y el valor.
- Usan la muestra del documento o `assumedGauge` y `weightCat` de `ValidateOptions`, igual que las hebras flotantes del colorwork.
- Respetan el invariante de opciones (ADR 0003, E10): solo informan y nunca son errores.
- Los textos los valida `experto-tejido` ("esta vuelta crece más rápido de lo que la tela puede quedar plana: en la realidad ondula").

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

**Topología por punto** (la clave para aumentos y disminuciones sin heurísticas):

- Se recorre `expandRound` de cada vuelta concreta con dos cursores: uno sobre el anillo anterior (puntos **consumidos**) y otro sobre el anillo actual (puntos **producidos**).
- Cada punto ocupa `consumes` posiciones abajo y `produces` arriba, según `STITCHES`. Es la misma tabla del motor: la malla no decide cuántos puntos hay.
  - Un `sc` es un cuadrilátero.
  - Un `inc` es un abanico de una posición abajo a dos arriba; un `inc3`, de una a tres.
  - Un `dec` va de dos posiciones abajo a una arriba.
  - Una `ch` dentro de la vuelta tiene base de ancho 0.
  - Un `sk` tiene tope de ancho 0: es un hueco.
- **Desajuste de consumo** (borradores): si lo consumido por la vuelta no coincide con lo que dejó la anterior, las posiciones de abajo se reparten en proporción. La malla siempre cierra y el validador informa el error.
- **Vértices propios por punto**: cada punto tiene sus vértices (no se comparten), para que el color sea nítido por punto. Las normales salen del perfil de forma analítica, para que la superficie se vea lisa aunque los vértices no se compartan.
- **Espiral**: dentro de la vuelta, el punto `k` sube `Δz × k / nᵢ`. Se ve el escalón al empezar cada vuelta, como en la tela real.
- **Vueltas unidas**: cada anillo es plano y la unión queda en el ángulo 0. El punto deslizado de unión y la cadeneta para subir no son puntos del modelo (ADR 0001) y no se dibujan.
- **Hebra trasera o delantera** (`loop`): no cambia la forma en la v1. Con el relieve, se dibuja una línea de borde en el anillo (deseable; validar con `experto-tejido` si la vuelta en hebra trasera debe quebrar el perfil).
- **Color**: cada vértice lleva el índice de la lana del punto (`expandRound` → `yarn`). El color y el aspecto de cada lana los pone el backend desde una tabla por lana (sección 6b): la malla nunca guarda colores.
- **Remate**: la última vuelta queda abierta, como se teje. Cerrar o rellenar son pasos de terminación que el modelo v1 guarda como texto (`finish`). La v2 puede agregar el relleno (ADR 0011, sección 2).
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

- **Componente de r3f en `apps/web`** (`components/amigurumi/`), no en el paquete. El paquete no depende de React y el estudio de colorwork no carga `three`.
  - Se carga con `next/dynamic` y `ssr: false`, solo en el estudio amigurumi.
  - `<Canvas frameloop="demand">`: dibuja solo cuando algo cambia (`invalidate()`), no 60 veces por segundo. Ahorra batería en "Tejiendo".
  - El documento vive en el almacén fuera de React (ADR 0004). El componente se suscribe y llama a `setScene` de forma imperativa. Una edición nunca vuelve a renderizar un árbol de React proporcional a la cantidad de puntos.
  - Controles orbitales de `three/addons/controls/OrbitControls.js`, con teclado: las flechas giran, `+` y `−` acercan, `0` restablece.
  - Luz hemisférica más una direccional, sin sombras en la v1. Fondo neutro.

### 6. Rendimiento y nivel de detalle

**Meta (regla de oro 7)**: editar una vuelta de una pieza de 40 vueltas se ve en el 3D en menos de 100 ms (p95), con CPU ×4 en Chromium, igual que el ADR 0004, **con el aspecto por fibra activado** (sección 6b). La meta se exige **dentro de los límites recomendados** (sección 6c); fuera de ellos rige el comportamiento degradado de esa sección.

**Escenario de referencia** (fixture de `qa-tester`, revisado por `experto-tejido` en T1):

- **cuerpo**: esfera de punto bajo con anillo mágico de 6, aumentos hasta 60, 20 vueltas de 60 y disminuciones hasta 6, unas 40 vueltas y unos 1.900 puntos;
- **otras 9 partes** de entre 10 y 25 vueltas, con 2 copias en orejas, brazos y piernas;
- **3 lanas** y cambios de color en 5 vueltas.

**Presupuesto por edición**:

| Paso | Máximo |
|---|---|
| Leer la línea editada (`parseRound`) y aplicar la operación | 3 ms |
| `concreteRounds` y `partProfile` de la parte | 3 ms |
| `buildPartMesh` de la parte (≈ 2.000 puntos) | 10 ms |
| `buildScene` (anclas, matrices y caché) | 3 ms |
| Subir atributos a la GPU | 5 ms |
| Dibujo del frame | 30 ms |
| Validación completa | Fuera del camino: antirrebote de 300 ms (ADR 0004) |

**Por qué alcanza**:

- Una pieza de 40 vueltas con 60 puntos son unos 2.000 puntos y unos 10.000 vértices. Es tres órdenes de magnitud menos que el colorwork de 40.000 puntos.
- El riesgo no es la cantidad de puntos: es reconstruir de más (todas las partes en cada tecla), crear objetos por edición o volver a renderizar React. La caché, los atributos reservados y el almacén fuera de React lo evitan.

**Nivel de detalle**:

- `"relief"` (por defecto): color por lana más un mapa de normales procedural del punto, con las uv de cada punto, y el aspecto por fibra completo (sección 6b). La textura se dibuja una vez en un canvas: no hay archivos de imágenes.
- `"smooth"`: sin mapa de normales. El color y los términos baratos del aspecto por fibra (rugosidad y borde, sección 6b) se mantienen. Se usa si la escena supera `LOD_STITCH_BUDGET` puntos visibles (constante con nombre, calibrada en T3b y T12 de la fase 4), si el contexto WebGL es limitado, siempre por encima de los límites recomendados (sección 6c), o si la usuaria lo elige.
- No hay mallas simplificadas por distancia en la v1. Dentro de los límites recomendados no hacen falta; por encima, la sección 6c define la degradación. Si T12 muestra que no alcanza, se agregan con una enmienda.

### 6b. Aspecto por fibra en el 3D (decisión 10)

**Qué se reutiliza**: el mismo `yarnLook(yarn, FIBERS, { fiberEffects })` de `stitch-render` que usa el estudio de colorwork (ADR 0008, sección 4, y sus enmiendas de T8), con los niveles de `yarn-catalog` (`halo`, `brillo`, `definicion` → `FIBER_LEVELS` 0 / 0,5 / 1, mezclas lineales por porcentaje, fibra desconocida neutra). **No hay una segunda fórmula de aspecto**: el 2D y el 3D de una misma lana parten del mismo `YarnLook`.

**Límite entre paquetes**:

- `viewer-3d` (puro y `./three`) **no depende** de `stitch-render` ni de `yarn-catalog`. Define `SurfaceLook` (sección 5), con la misma forma que `YarnLook`.
- La capa de aplicación (`apps/web`) calcula `pattern.yarns.map((y) => yarnLook(y, FIBERS, { fiberEffects: !coloresPlanos }))` y lo pasa a `setScene` o `setLooks`. Usa `lookInputKey` y `lookKey` para no recalcular ni volver a subir aspectos que no cambiaron, igual que `PreviewEngine`.
- Una prueba de tipos en `apps/web` asegura que `YarnLook` se puede asignar a `SurfaceLook` y al revés. Si `stitch-render` agrega un campo, la prueba avisa.
- **Sin texturas de marcas ni fotos de lanas** (regla de oro 9): todo el aspecto sale de tres números por lana y de texturas procedurales dibujadas en un canvas.

**Cómo se aplica a la malla** (backend `three`):

- **Tabla por lana**: dos arreglos de uniformes de largo `LIMITS.maxYarns` (32): `uYarnColor[32]` (color lineal) y `uYarnLook[32]` (`halo`, `sheen`, `definition`). El atributo `yarn` de cada vértice indexa la tabla. Si el contexto no admite esos uniformes, `visor-3d` usa una textura de datos de 32 × 2 con el mismo contrato (lo decide T3b).
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
- **Sin WebGL**, o con el contexto perdido: las siluetas (`profileToSvg`) se rellenan con el color plano de la lana inicial de cada parte. El aspecto por fibra no se muestra, y la interfaz lo dice ("el halo y el brillo solo se ven en la vista 3D").

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
| Más de `SCENE_HARD_STITCH_CAP` puntos (constante con nombre, del orden de 10 veces el recomendado, calibrada en T12) | El visor no arma la malla, para no colgar la pestaña: muestra las siluetas (`profileToSvg`, cuesta lo que las vueltas, no lo que los puntos) y el mensaje correspondiente. Editar y guardar siguen igual |

- **Reconstrucción desde la vuelta editada** (deseable; obligatoria si CA4-P8 falla): editar la vuelta `k` no cambia el perfil ni la malla de las vueltas anteriores a `k`. `buildPartMesh(part, yarnIds, profile, { reuse: { mesh, fromRound: k } })` copia el prefijo y arma el resto. Propiedad G12: el resultado es igual a armar la malla desde cero. Se apoya en G7 (la malla parcial es un prefijo exacto).
- Las copias comparten la malla (sección 4): 10 copias de una oreja no cuestan 10 mallas, solo 10 matrices.

**Medición** (para las secciones 6, 6b y 6c):

- La misma instrumentación del ADR 0004: `performance.mark("edit-start", { startTime: event.timeStamp })` y `edit-painted` después del frame, con la métrica `edit-to-paint-3d`. Se agregan `edit-to-feedback` (hasta que el editor muestra el conteo y los errores de lectura, sin esperar al 3D; sección 6c) y `hover-to-paint-3d` (sección 6b).
- En la CI, Playwright en Chromium con WebGL por software (SwiftShader) y CPU ×4. Ese entorno castiga el dibujo, así que la medición en el equipo de referencia (decisión 4 de la fase 2) es la que decide.
- **Guardia en Node**: `buildPartMesh` y `partProfile` del fixture se miden con `node:test`. La CI falla si superan 3 veces la referencia registrada.

### 7. Aviso de prototipo digital (regla de oro 8)

- Junto al visor, siempre visible y sin poder cerrarse, va un aviso como este: "Vista aproximada. La forma y el tamaño reales dependen de tu tensión, la lana y el relleno. El halo y el brillo de la fibra son una aproximación visual. Teje una muestra para comprobar". El texto final lo redacta `documentador` y lo valida `experto-tejido`.
- **Medidas**: "≈ 12 cm de alto, ≈ 8 cm de ancho, estimación", con "supuesto" si la muestra es supuesta.
- La captura (`snapshot`) para miniaturas lleva el aviso en el pie cuando se muestre fuera del estudio (PDF y vista pública, fase 7).

### 8. Accesibilidad

- **Lienzo**: enfocable, con `aria-label` y una descripción textual derivada del modelo (partes, vueltas, conteo final, medidas estimadas y posición relativa). `describeWritten` vive en `pattern-render`, como `describeChart`.
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

Misma convención que `follow` y `stitch-render`: TypeScript sin compilar, `exports` con `"."` y `"./three"`, job en la CI ("Núcleo" para la parte pura) y `transpilePackages` en `apps/web`.

**Propiedades obligatorias** (con semilla, sobre partes `savable` aleatorias con aumentos, disminuciones, grupos, rangos, colores y las tres construcciones):

| # | Propiedad |
|---|---|
| G1 | En revolución, `rings.length === concreteRounds(part).length + 1` y `rings[i].stitches === concreteRounds(part)[i − 1].count.produced`; en panel, `rows.length === concreteRounds(part).length` con el mismo conteo por fila |
| G2 | `zCm` es no decreciente; `radiusCm ≥ 0`; con anillo mágico, `rings[0].radiusCm === 0` |
| G3 | Con `|Δr| ≤ s × tolerancia`, la distancia entre anillos sobre el meridiano es el alto de la vuelta (± 1e−6) y `strain === 1` |
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
  - el PR verifica la versión compatible con React 19.2 y Next 16, y el `transpilePackages` necesario. No se fija aquí una versión de memoria.
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
- `pattern-core` gana `shapeMetrics`, `partProfile`, `partDimensions`, `STITCH_HEIGHT_FACTOR`, `PROFILE_RADIAL_TOLERANCE` y dos avisos informativos. No cambia la forma del documento por este ADR (la v2 viene del ADR 0011).
- La forma es de revolución: un hocico o una barriga hechos con aumentos en un solo lado se ven simétricos en la v1. El aviso de prototipo lo cubre; si las tejedoras lo piden, la distribución angular de los aumentos se puede usar después sin cambiar el contrato.
- La CI necesita WebGL por software para las pruebas E2E del visor (T3).
- Los valores de `STITCH_HEIGHT_FACTOR` y `PROFILE_RADIAL_TOLERANCE`, el criterio del disco plano y los textos de los avisos dependen de T1. Hasta entonces, T5 no empieza.
- El 2D y el 3D comparten el aspecto por fibra y la preferencia "Colores planos". Un cambio en `yarnLook` o en `fibras.json` cambia los dos, y las capturas de los dos se revisan juntas.
- La regla de oro 7 se garantiza dentro de los límites recomendados. Fuera de ellos, el editor sigue inmediato y el 3D se degrada de forma visible (sección 6c); por encima de `SCENE_HARD_STITCH_CAP`, el 3D pasa a siluetas.

## Enmiendas por las decisiones de la usuaria (2026-11-13)

La usuaria aprobó el ADR con la [opción (a) de la decisión 1](../roadmap.md#decisiones-de-la-fase-4-aprobadas-el-2026-11-13). Dos decisiones cambian el texto propuesto:

- **Decisión 5 (límites solo como advertencia)**: nueva sección 6c. La meta de 100 ms se exige dentro de los límites recomendados; fuera de ellos, nivel de detalle `"smooth"` forzado, editor que nunca espera al 3D, indicador "Actualizando 3D…" y siluetas sobre `SCENE_HARD_STITCH_CAP`. Se agregan `buildScene().stitchCount`, `PartMeshOptions.reuse` y las propiedades G12 y G13. Los topes duros del núcleo no cambian.
- **Decisión 10 (aspecto por fibra en el 3D desde la fase 4, opción b)**: nueva sección 6b. `AmigurumiRenderer.setScene` recibe `SurfaceLook[]` en vez de `yarnHex`, y se agregan `setLooks` y `setPreviewOverride`. El material usa una tabla por lana en uniformes; el cambio de color o de composición no reconstruye la malla ni sube atributos. "Colores planos" es la misma preferencia de la fase 3. Guardia de rendimiento con contadores, programas de shader y latencia A/B. Calibración visual en la tarea T11c.
- **Decisiones 3, 6, 7, 8 y 9**: sin cambios en este ADR (aplican al ADR 0011 y a la hoja de ruta).
