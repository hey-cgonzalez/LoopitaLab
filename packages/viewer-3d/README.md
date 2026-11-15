# @loopitalab/viewer-3d

Vista 3D del amigurumi, **parte pura**: malla por punto, escena con copias y anclas, y silueta SVG. Especificación: [ADR 0010](../../docs/adr/0010-geometria-3d-amigurumi.md), secciones 3, 4, 6c y 9, y [ADR 0011](../../docs/adr/0011-posicion-de-partes-y-editor-escrito.md), sección 2 (`layout`, `copies`, `SurfaceAt`). El backend `three` está en la subruta `@loopitalab/viewer-3d/three` (T11, más abajo); el componente r3f vive en `apps/web/src/components/amigurumi/`.

- La parte pura depende solo de `@loopitalab/pattern-core`, sin dependencias de terceros (ADR 0002). La subruta `./three` usa `three` como dependencia par (`>=0.186.1 <0.187.0`; de desarrollo, 0.186.1 y `@types/three` 0.186.0, para probarla en Node sin GPU). TypeScript sin compilar; `exports` apunta a `src/index.ts`.
- **No cuenta nada propio** (regla de oro 2): la forma sale de `partProfile`, los puntos de `concreteRounds` y `expandRound`, y cuánto ocupa cada punto abajo y arriba, de `STITCHES`.
- No importa `stitch-render` ni `yarn-catalog`. `SurfaceLook` tiene la forma de `YarnLook`; lo vigila `apps/web/test/viewer-3d-surface-look.test.ts`.
- Funciones puras que nunca lanzan con documentos `savable` (G10). Sin red, sin reloj, sin almacenamiento.
- **Es una aproximación visual** (regla de oro 8): superficie de revolución sin relleno ni tensión. La interfaz lo dice junto al visor.

## API

```ts
import { buildPartMesh, buildScene, colorizePartMesh, profileToSvg, shapeSignature, surfaceFrame } from "@loopitalab/viewer-3d";
import { partProfile, shapeMetrics } from "@loopitalab/pattern-core";

const metrics = shapeMetrics(pattern.gauge, { assumed: false, gaugeStitch: "sc" });
const mesh = buildPartMesh(part, pattern.yarns.map((y) => y.id), partProfile(part, metrics));

let scene = buildScene({ pattern, metrics: () => metrics });
scene = buildScene({ pattern: editado, metrics: () => metrics, previous: scene.cache }); // solo lo que cambió
```

| Exporta | Qué hace |
|---|---|
| `buildPartMesh(part, yarnIds, profile, opts?)` | `PartMesh`: `positions`, `normals` (analíticas), `uvs` (0 a 1 por punto), `yarn` (índice de lana por vértice), `loop` (hebra por vértice), `indices`, `faceStitch` (punto de cada triángulo), `roundStart`, `ringPhase`, `vertexCount`, `indexCount`, `bounds`. En cm, inicio en el origen, crece hacia +z |
| `opts.limit: { roundsDone, stitchesDone }` | 3D parcial del modo tejiendo (fase 6): corta en `roundStart[roundsDone] + stitchesDone`, en puntos **producidos**. Es un prefijo exacto de la malla completa (G7) |
| `opts.reuse: { mesh, fromRound }` | Copia el prefijo de una malla anterior de la misma parte. `fromRound` es el índice 0-based de la vuelta concreta editada y funciona como cota: la función verifica qué vueltas siguen iguales (contenido, lanas y perfil) y copia solo esas. Siempre da lo mismo que armar desde cero (G12) |
| `opts.lod` | Se acepta por contrato; la malla pura no cambia con el nivel de detalle |
| `colorizePartMesh(mesh, part, yarnIds)` | Reescribe `yarn` en el lugar para una parte con la misma `shapeSignature`. Devuelve `{ from, to }`, los vértices que cambiaron (vacío si ninguno) |
| `shapeSignature(part)` | Construcción, inicio, y puntos, hebras y rangos de cada vuelta, sin lanas. Conservadora ("pb, pb" y "2 pb" dan firmas distintas) |
| `surfaceFrame(profile, round, stitch, { mesh }?)` | `Frame`: posición (centro del borde superior del punto, "entre la V10 y la V11"), `normal`, `tangent`, `meridian` (`tangent × meridian = normal`), la vuelta y el punto usados y `clamped`. Acota fuera de rango sin lanzar (G9). Con `mesh`, usa su `ringPhase` y cae sobre el punto de la malla |
| `buildScene({ pattern, metrics, previous? })` | `{ instances, cache, notes, stitchCount, updates }`. Una malla por parte compartida entre sus copias, una matriz 4 × 4 (cm, columna mayor) por copia. `stitchCount` = Σ `roundStart.at(-1)` por instancia = `sceneStitches` de `recommendedLimitUsage` (G13) |
| `profileToSvg(profile, { widthPx?, fill?, title? })` | Silueta como SVG con relleno de color plano (la lana inicial de la parte, que pasa la aplicación). Para sin WebGL2, contexto perdido y sobre `SCENE_HARD_STITCH_CAP` |
| `AUTO_PLACEMENT_GAP_CM` | 2 cm entre piezas ubicadas de forma automática |
| `LOOP_BOTH`, `LOOP_FRONT`, `LOOP_BACK` | Valores de `PartMesh.loop` (0, 1, 2) |

Tipos: `PartMesh`, `PartMeshOptions`, `Lod`, `Frame`, `Vec3`, `SurfaceLook`, `SceneInput`, `SceneInstance`, `SceneCache` (opaca), `SceneNote`, `SceneNoteCode`, `SceneResult`, `SceneUpdate`.

## Malla: topología por punto

Se recorre `expandRound` de cada vuelta concreta con un cursor sobre lo consumido (anillo de abajo) y otro sobre lo producido (anillo de arriba). Cada punto producido tiene sus vértices (color nítido por punto):

| Punto | Abajo → arriba | Geometría |
|---|---|---|
| `sc`, `hdc`, `dc`, `tr`, `slst` | 1 → 1 | Cuadrilátero (4 vértices, 2 triángulos) |
| `inc` (de punto bajo, C-12) | 1 → 2 | Abanico: dos cuadriláteros que comparten el medio de la base (8 vértices) |
| `inc3` | 1 → 3 | Tres cuadriláteros (12 vértices) |
| `dec` | 2 → 1 | Pentágono con vértice en la posición intermedia de abajo, sin grieta (5 vértices, 3 triángulos) |
| `ch` dentro de la vuelta | 0 → 1 | Triángulo con base de ancho 0 |
| `sk` | 1 → 0 | Sin geometría: deja un hueco (F4-28) |

- **Desajuste de consumo** (borradores): las posiciones de abajo se reparten en proporción a lo consumido. La malla siempre cierra; el validador informa el error.
- **Espiral**: el anillo es una hélice continua que sube `Δz × k / n` dentro de la vuelta. **Vueltas unidas**: anillos planos. Mismos conteos y mismo perfil en las dos (F4-10).
- **Giro por anillo** (`ringPhase`): cada anillo gira lo necesario para que, en promedio, la base y el tope de los puntos de la vuelta queden alineados. Sin eso, una vuelta con los aumentos juntos ("aum x5, 8 pb", fixture B) se tuerce: el 1,6 % del área del fixture B quedaba invertida, y con el giro queda en 5·10⁻⁶. Como en la tela, el inicio de vuelta se corre.
- **Hebra trasera o delantera**: no cambia la forma (C-7). `loop` la marca por vértice para que el backend dibuje la línea de borde en el relieve.
- **Remate**: la última vuelta queda abierta. Sin relleno ni óvalo (C-13).
- **Hileras**: panel en el plano x–z que mira hacia −y. Las filas impares (índice 0-based) van de derecha a izquierda, para que el color quede donde se tejió. La base de la fila 1 es la propia fila 1.

## Escena

- **Caché**: si la parte es la misma referencia con la misma muestra y las mismas lanas, `kept`. Si cambió pero tiene la misma `shapeSignature` y muestra, `recolored` (en el lugar, con el rango). Si no, `built`, con `reuse` sobre la malla anterior (`reusedRounds`). La muestra se compara por valor (`stitchWidthCm` y `roundHeightCm`). La caché anterior se consume: las mallas recoloreadas se modifican en el lugar.
- **Posiciones**:
  - `FreeAt`: traslación por Euler XYZ (`Rx · Ry · Rz`, como `THREE.Euler` "XYZ").
  - `SurfaceAt`: `anfitrión · T(posición + normal × offsetCm) · [tangente, meridiano, normal] · giro · unión`. El giro `rotationDeg` es `[sobre la normal, sobre la tangente, sobre el meridiano]`, aplicado en ese orden. Con `attach: "start"`, el inicio de la parte va en el ancla y la pieza crece por la normal. Con `"end"`, el borde abierto (centro de la última vuelta) va en el ancla y la pieza sale hacia afuera.
  - Sin posición: en fila sobre +x, en el orden de `parts` y de las copias, separadas por `AUTO_PLACEMENT_GAP_CM`, a la derecha de las piezas libres.
  - Anclas que no se resuelven (anfitrión inexistente, ciclo o cadena de más de `LIMITS.maxLayoutDepth`; solo en documentos que no son `savable`): ubicación automática y aviso.
- **Avisos** (`notes`, nunca errores): `ANCHOR_CLAMPED`, `ANCHOR_UNRESOLVED`, `GAUGE_ASSUMED`, `SHAPE_RUFFLES` y `SHAPE_GATHERS` (anillos con `strain` distinto de 1). Mensajes provisionales; la redacción final es de `documentador`.
- `copies` se lee como en `recommendedLimitUsage` (omitido o inválido = 1), acotado a `LIMITS.maxCopies`.

## Backend `three` (`@loopitalab/viewer-3d/three`)

ADR 0010, secciones 5, 6, 6b y 6c, con las enmiendas V-1 a V-5. Sin React: recibe el `WebGLRenderer`, la escena y la cámara del lienzo (en la aplicación, los de r3f) y dibuja bajo demanda.

```ts
import { createThreeRenderer } from "@loopitalab/viewer-3d/three";

const r = createThreeRenderer({ gl, scene, camera, invalidate, setPixelRatio: (max) => setDpr(max ?? 2) });
const policy = r.setScene(buildScene({ pattern, metrics, previous }), looks); // SceneResult cumple RendererScene
r.setLooks(looks);                                   // solo la tabla por lana (uniformes)
r.setPreviewOverride({ yarn: 0, look });             // vista previa al pasar el cursor
r.setLod("smooth");                                  // pedido; la política puede forzar "smooth"
r.pick(ndcX, ndcY);                                  // { partId, copy, stitch, roundIndex, stitchInRound, point }
r.setHighlight({ partId, copy, roundIndex });        // resaltado por gl_VertexID, sin otro programa
await r.snapshot({ width: 640, height: 480, footer: "Vista aproximada…" });
r.dispose();
```

| Exporta | Qué hace |
|---|---|
| `createThreeRenderer(opts)` | `AmigurumiRenderer`: `setScene`, `setLooks`, `setPreviewOverride`, `setLod`, `policy`, `pick`, `setHighlight`, `bounds`, `snapshot`, `setMaterialVariant` (A/B), `stats`/`resetStats` (contadores del modo de medición), `renderNow`, `dispose` |
| `PartBuffers` | Atributos reservados de una parte (capacidad × `RESERVE_GROWTH`), copia en el lugar con `addUpdateRange`, `setDrawRange`; `writeYarnRange` sube solo el rango de `yarn` |
| `createFiberMaterial`, `createYarnTable`, `writeLooks` | Material extendido (`onBeforeCompile`) con la tabla por lana en uniformes leída en el sombreador de vértices, *varyings* `flat`, `customProgramCacheKey` explícito (`loopita-fiber-relief` y `-smooth`) |
| `createBaseMaterial` | `MeshStandardMaterial` sin extender, solo para el A/B (R4-19) y la prueba "neutro = base" |
| `createStitchNormalMap`, `stitchHeightField` | Relieve procedural del punto (sin archivos de imagen) |
| `viewerMode`, `viewerPolicy`, `grownCapacity`, `stitchLocation`, `vertexRangeOfStitches` | Decisiones puras (sin GPU) |
| Constantes | `LOD_STITCH_BUDGET = 20_000`, `SCENE_HARD_STITCH_CAP = 200_000`, `RECOMMENDED_SCENE_STITCHES` (de `pattern-core`), `DEGRADED_PIXEL_RATIO = 1`, `RESERVE_GROWTH = 1.5`; aspecto: `ROUGHNESS_BASE`, `FIBER_SHEEN_ROUGHNESS`, `FIBER_SHEEN_SPECULAR`, `FIBER_HALO_RIM`, `FIBER_HALO_SOFTEN`, `FIBER_DEFINITION_RELIEF`, `FIBER_HALO_FRESNEL_POWER`; relieve: `RELIEF_NORMAL_SCALE`, `LOOP_EDGE_SHADE`, `LOOP_EDGE_WIDTH`, `HIGHLIGHT_EMISSIVE`. **Valores iniciales**: T12 calibra los de rendimiento y T11c los del aspecto |

- **Dos programas** compilados al montar (`gl.compile` con una malla de sonda y las luces reales). El resaltado usa materiales con la misma clave y los mismos parámetros: comparten el programa. El A/B con `"base"` agrega sus programas (solo en la página de medición).
- **Neutro = base**: con halo, brillo y definición en 0, sin hebra suelta y sin resaltado, cada término suma 0 o multiplica por 1. El E2E compara los píxeles con `MeshStandardMaterial` (0 píxeles distintos en SwiftShader).
- **Política** (sección 6c): `full` (≤ 40.000 puntos; `"relief"` si se pide y hay ≤ `LOD_STITCH_BUDGET`), `degraded` (`"smooth"` y razón de píxeles 1) y `silhouettes` (sobre `SCENE_HARD_STITCH_CAP`: no sube nada). La reconstrucción única en curso y "Actualizando 3D…" son del controlador de la aplicación.
- `setScene` usa `updates` de `buildScene`: `kept` no sube nada; `recolored` sube solo el rango de `yarn`; `built` copia la malla en los búferes reservados.

## Pruebas

```sh
node --test "test/**/*.test.ts"
SEED=7 node --test "test/**/*.test.ts"
SEED=99999 node --test "test/**/*.test.ts"
```

- `mesh.test.ts`: topología, F4-10, F4-28, C-7, hileras, borradores, `colorizePartMesh` y `shapeSignature`.
- `property.test.ts`: G4 a G13 con los documentos v2 al azar del generador de `pattern-core` y muestras al azar. G12 exige que la copia del prefijo se aplique en al menos un cuarto de los casos.
- `scene.test.ts`: F4-58, anclas, ubicación automática, caché (CA4-P6) y avisos.
- `svg.test.ts`: siluetas.
- `three.test.ts`: backend `three` sin GPU (política, capacidad, atributos en el lugar, tabla por lana, parche del material, relieve procedural, límites entre paquetes).
- `perf.test.ts`: guardia CA4-P6. Falla si `partProfile`, `buildPartMesh` (fixture A) o `buildScene` (escenario de referencia, completa y con una parte editada) superan 3 veces la referencia (6 en CI; `VIEWER_3D_PERF_FACTOR` la cambia).

### Referencia de rendimiento (R4-19)

Medida el 2026-11-14 en un Apple M1 (8 núcleos, 8 GB) con Node 24.16. Son medianas de 15 corridas, en 3 ejecuciones.

| Paso | Medido | Registrado (× 2) | Presupuesto del ADR |
|---|---|---|---|
| `partProfile`, fixture A | 0,045 ms | 0,1 ms | 3 ms (con `concreteRounds`) |
| `buildPartMesh`, fixture A (1.800 puntos, 7.254 vértices, 3.654 triángulos) | 0,72 a 0,90 ms | 1,8 ms | 10 ms |
| `buildScene` completa (14 instancias, 4.036 puntos) | 1,6 a 1,75 ms | 3,5 ms | — |
| `buildScene` con una parte editada (1 malla reconstruida, prefijo reutilizado) | 0,41 a 0,50 ms | 1 ms | 3 ms |

## Limitaciones conocidas

- Superficie de revolución: un hocico o una barriga con aumentos de un solo lado se ven simétricos. No hay relleno ni aplanado, y una oreja "sin rellenar" se ve como un tubo abierto.
- Vueltas con puntos de distinto alto no deforman el anillo (sección 1 del ADR).
- `surfaceFrame` sin `{ mesh }` no conoce `ringPhase`: queda sobre la superficie, pero no necesariamente sobre el punto pedido. `buildScene` siempre pasa la malla del anfitrión.
- Con un desajuste grande de consumo o con aumentos muy concentrados en vueltas empinadas, puede quedar alguna astilla de triángulo casi degenerada con la cara invertida (fixture B: 5·10⁻⁶ del área).
- **Backend `three`**: `pick` devuelve la vuelta concreta (0-based), no el número visible; la aplicación lo traduce con `concreteRounds`. La captura (`snapshot`) dibuja el lienzo actual escalado (no un render a otra resolución). El resaltado cubre el rango de vértices de la vuelta. El costo con GPU real lo confirma T12 en el equipo de referencia.
- `limit` es por parte. Armar una escena parcial (piezas terminadas, la actual a medias y las siguientes ocultas) queda para la fase 6.
