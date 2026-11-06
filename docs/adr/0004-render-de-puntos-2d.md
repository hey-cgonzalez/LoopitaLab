# ADR 0004: Render 2D de puntos y presupuesto de 100 ms

- Estado: aceptado (aprobado por la usuaria el 2026-11-05). Enmendado el 2026-11-06 ([E1 a E8](#enmiendas-tras-t5-y-t6-2026-11-06): contrato tal como quedó implementado en T5 y T6)
- Fecha: 2026-11-05
- Paquete: `packages/stitch-render` (nuevo)
- Relacionado: [ADR 0003](0003-colorwork-en-esquema-v1.md), [ADR 0005](0005-geometria-circulo-y-disminuciones.md)

## Contexto

La regla de oro 7 exige que pintar una celda o cambiar las repeticiones se vea en la vista previa en menos de 100 ms. El objetivo de `render-puntos` es lograrlo en un notebook de gama media con hasta 200 × 200 puntos visibles (40.000 puntos).

La vista previa tiene que:

- dibujar puntos realistas (la V del punto derecho);
- respetar la proporción de la muestra (un punto no es cuadrado);
- dibujar tres formas: plano, tubo y círculo;
- dejar vacías las celdas fuera de forma;
- en fases siguientes:
  - ajustar el aspecto según la fibra;
  - previsualizar un color al pasar el cursor;
  - resaltar la fila actual en el modo tejiendo;
  - generar capturas para miniaturas y PDF.

Hoy existe `apps/web/src/lib/knit-fabric.ts`, decorativo, en SVG.

## Opciones

1. **SVG en el DOM**, como `KnitFabric`.
   - Ventajas: simple, nítido y accesible por elemento.
   - Desventaja: con 40.000 trazados, el diseño de página y el pintado del navegador superan el presupuesto, y la edición incremental es cara.
2. **Canvas 2D con sprites.** Se dibuja un sprite por lana y tamaño una vez, y luego se hace `drawImage` por punto con redibujo incremental.
   - Ventajas: sin dependencias y fácil de probar.
   - Riesgo: el círculo y el tubo exigen una transformación por punto, lo que es más lento.
3. **WebGL2 con instancias**: un solo llamado de dibujo con un atlas de texturas.
   - Ventaja: es la más rápida.
   - Desventajas: más código, pérdida de contexto que manejar y pruebas más difíciles.
4. **Worker con OffscreenCanvas.** Es complementaria a 2 y 3: libera el hilo principal, pero agrega mensajería y copias.

## Decisión

Arquitectura en tres capas, con el **backend reemplazable**. El primer backend es **Canvas 2D (opción 2)**. WebGL2 queda permitido detrás de la misma interfaz si el benchmark lo exige.

### Capa 1: disposición (pura, sin DOM)

Calcula dónde va cada punto. Separa la geometría del color. Así, pintar una celda con otra lana no recalcula la geometría: solo cambia el índice de lana de las instancias de esa celda del motivo.

```ts
import type { Chart, Gauge } from "@loopitalab/pattern-core";

export interface LayoutOptions {
  gauge: Gauge;              // real o supuesta (la interfaz marca el supuesto)
  shape?: Chart["renderAs"]; // por defecto, chart.renderAs ("yoke" se trata como "tube")
  stitchPx?: number;         // ancho del punto en px con zoom 1 (por defecto 12)
  tubeRotation?: number;     // radianes, solo en tubo
}

export interface StitchLayout {
  count: number;
  /** Arreglos de largo `count`: centro, rotación y escala de cada punto. */
  x: Float32Array;
  y: Float32Array;
  angle: Float32Array;
  scaleX: Float32Array;
  scaleY: Float32Array;
  /** 0 a 1: atenuación por perspectiva en el tubo (1 = de frente). */
  shade: Float32Array;
  /** Fila y columna en el gráfico completo, para resaltar e interactuar. */
  row: Uint32Array;
  col: Uint32Array;
  /** Índice de la celda del motivo de cada instancia. */
  motifCell: Uint32Array;
  /** Lana de cada instancia (índice en `yarns`). Se llena con `colorize`. */
  yarn: Uint8Array;
  bounds: { width: number; height: number };
  /** Solo en círculo: deformación angular por anillo (ADR 0005). */
  ringDistortion?: Float32Array;
}

/** Geometría. Se recalcula si cambian tamaño, repeticiones, máscara, forma, muestra o dirección. */
export function layoutGeometry(chart: Chart, opts: LayoutOptions): StitchLayout;
/** Color. Escribe `layout.yarn`. Con `cells`, solo actualiza esas celdas del motivo. */
export function colorize(layout: StitchLayout, chart: Chart, cells?: readonly number[]): Uint32Array; // instancias tocadas
/** Instancia bajo un punto de pantalla (en coordenadas de la disposición), o null. */
export function hitTest(layout: StitchLayout, px: number, py: number): number | null;
```

Pintar con `NO_STITCH`, o quitarlo, cambia la máscara. En plano y tubo basta con colorear (la instancia queda oculta o visible). En círculo hay que recalcular la geometría, porque cambian los conteos por vuelta.

**Dirección**:

- En `bottom_up`, la disposición usa el gráfico tal cual.
- En `top_down`, la pieza se dibuja **rotada 180°**: la celda `(x, y)` del gráfico completo va a la posición `(W − 1 − x, H − 1 − y)`, con `W` y `H` del gráfico completo, y la V se dibuja girada 180°.
- No es un espejo vertical. La correspondencia la da `wornOrientation` de `pattern-core` (ADR 0003); `stitch-render` no la reimplementa.
- En el círculo, la dirección se aplica según el ADR 0005.

**Aspecto de la vista**:

- En plano y tubo, los huecos de `NO_STITCH` no existen en la prenda real. La interfaz lo aclara junto a la vista previa.
- El punto que resulta de una disminución toma el color de la fila `y`. Es una aproximación de v1.
- Los orillos y el desfase de vuelta en redondo (*jog*) no se dibujan.

### Capa 2: aspecto de la lana (pura)

```ts
export interface YarnLook {
  hex: string;
  /** 0 a 1. En la fase 2 valen 0 (aspecto neutro); la fase 3 los deriva de la fibra. */
  halo: number;
  sheen: number;
  definition: number;
}
export function yarnLook(yarn: Yarn, fibers: readonly FiberInfo[]): YarnLook;
```

### Capa 3: backend

```ts
export interface ViewState { zoom: number; panX: number; panY: number }

export interface StitchRenderer {
  setLooks(looks: readonly YarnLook[]): void;
  setLayout(layout: StitchLayout): void;
  /** Redibujo incremental de las instancias tocadas (devueltas por `colorize`). */
  invalidate(instances: Uint32Array): void;
  setView(view: ViewState): void;
  /** Fase 3: vista previa de un color al pasar el cursor, sin tocar el diseño. */
  setPreviewOverride(o: { yarn: number; look: YarnLook } | null): void;
  /** Fase 3 y 6: fila resaltada en el modo tejiendo. */
  setHighlightRow(row: number | null): void;
  /** Dibuja lo pendiente en el próximo frame (agrupa varias llamadas en un solo dibujo). */
  requestRender(): void;
  snapshot(opts: { width: number; height: number }): Promise<Blob>;
  destroy(): void;
}

export function createCanvasRenderer(canvas: HTMLCanvasElement | OffscreenCanvas): StitchRenderer;
```

Implementación de Canvas 2D:

- Cada sprite se dibuja una vez por combinación de lana, aspecto y nivel de zoom, y se guarda en caché.
- El redibujo incremental limpia y vuelve a dibujar el rectángulo de las instancias tocadas, incluidas las vecinas que se solapan, porque la V monta sobre la fila de arriba.
- En plano se usa `drawImage` sin transformación. En tubo y círculo se usa `setTransform` por instancia.

### Reglas de integración (aplicación)

- **Estado y React**:
  - El documento vive en un almacén fuera de React (`useSyncExternalStore`, sin dependencias nuevas).
  - El canvas se actualiza de forma imperativa: una edición nunca vuelve a renderizar un árbol de React proporcional al número de puntos.
- **Validación fuera del camino crítico**: `validatePattern` corre con antirrebote (300 ms sin editar) o en un Worker. Nunca entre la edición y el dibujo.
- **Presupuesto por edición**:

  | Paso | Máximo |
  |---|---|
  | Operación sobre el modelo | 5 ms |
  | `colorize` incremental | 5 ms |
  | Geometría completa de 40.000 puntos | 20 ms |
  | Dibujo incremental | 15 ms |
  | Dibujo completo | 50 ms |

- **Accesibilidad**: el canvas lleva una descripción textual (`describeChart` de `pattern-render`). El editor de motivo es navegable con el teclado. La vista previa es una aproximación y lo dice (regla de oro 8).

### Cómo se mide la regla de oro 7

- **Métrica**: tiempo desde `event.timeStamp` de la entrada (`pointerdown`, o `input` en las repeticiones) hasta el primer frame pintado después del dibujo.
- **Instrumentación**:
  - En desarrollo y pruebas, el estudio marca `performance.mark("edit-start", { startTime: event.timeStamp })`.
  - Después de `requestRender`, en el siguiente `requestAnimationFrame` y una tarea más (`MessageChannel`), marca `edit-painted` y mide `edit-to-paint`.
  - Como verificación cruzada, se registra la duración de la Event Timing API (`PerformanceObserver` de tipo `event`).
- **Escenarios** (Playwright en Chromium):
  - motivo de 20 × 20 con repeticiones de 10 × 10 (40.000 puntos visibles);
  - CPU limitada ×4 por CDP como sustituto del notebook de gama media;
  - formas plano, tubo y círculo.

  | Escenario | Criterio |
  |---|---|
  | Pintar una celda (50 veces) | p95 < 100 ms |
  | Trazo continuo | cada actualización < 100 ms y ≥ 30 fps |
  | Repeticiones de 5 × 5 a 10 × 10 (20 veces) | p95 < 100 ms |
  | Zoom y desplazamiento | ≥ 30 fps |

- **Guardia en el núcleo**: `layoutGeometry` de 40.000 puntos se mide con `node:test`. CI informa el tiempo y falla si supera 3 veces la referencia registrada.
- **Equipo de referencia**: antes de cerrar la fase se mide a mano en uno, con 4 núcleos, 8 GB de RAM, GPU integrada y Chrome estable. El resultado queda en el PR.
- **Criterio para pasar a WebGL2**: si con Canvas 2D el p95 de cualquier escenario supera 100 ms, o el zoom baja de 30 fps, `render-puntos` implementa `createWebGLRenderer` con la misma interfaz. La decisión se registra como enmienda de este ADR.

### Dependencias

`stitch-render` depende solo de `pattern-core` y `yarn-catalog` (tipos y datos), sin paquetes de terceros. La capa de disposición y la de aspecto se prueban con `node:test`, igual que el núcleo (ADR 0002). El backend se prueba con capturas visuales en Playwright, desde `apps/web`.

## Alternativas descartadas

- **SVG para la vista previa**: no cumple el presupuesto con 40.000 puntos. Se mantiene SVG solo para el gráfico de símbolos estático (`pattern-render`), que no se edita en vivo.
- **WebGL2 desde el inicio**: más rápido, pero agrega complejidad antes de saber si hace falta. La interfaz común permite cambiar después sin tocar el estudio.
- **Una librería de canvas o escena** (Pixi, Konva): una dependencia grande para algo acotado. No se justifica mientras Canvas 2D cumpla.
- **Calcular la disposición dentro del componente React**: mezcla dominio y vista, y no se puede probar en Node.

## Consecuencias

- La geometría de las tres formas es una función pura con pruebas de propiedades. Por ejemplo:
  - `count` es igual a `stitchTotal(chart)`;
  - toda instancia tiene la lana de `cellAt`;
  - en el círculo, los ángulos de cada anillo cubren la vuelta completa;
  - en `top_down`, aplicar la rotación dos veces devuelve la disposición de `bottom_up`.
- La previsualización al pasar el cursor (fase 3) y el resaltado de fila (fases 3 y 6) ya tienen lugar en la interfaz: no obligan a rediseñar.
- `render-puntos` entrega la medición como parte del PR de la fase 2.

## Revisión de experto-tejido (2026-11-05)

El estado sigue aceptado. La arquitectura de render y el presupuesto de 100 ms no cambian. Lo corregido:

- **`top_down`**: la pieza se dibuja rotada 180° (`(x, y) → (W − 1 − x, H − 1 − y)`), no espejada en vertical. La correspondencia viene de `wornOrientation` de `pattern-core`.
- **Aproximaciones visibles**: los huecos de `NO_STITCH` en plano y tubo, el color del punto tras una disminución, y los orillos y el *jog* que no se dibujan.
- **Círculo**: el sentido de giro y la orientación de la V se corrigieron en el ADR 0005.

## Enmiendas tras T5 y T6 (2026-11-06)

Revisión de `arquitecto` del paquete tal como lo entregó `render-puntos` (`packages/stitch-render`, README, `src/types.ts`, `src/index.ts`). Todas las desviaciones se **aceptan**; ninguna obliga a cambiar código. Las precisiones de abajo reemplazan lo que contradicen en las secciones anteriores. El detalle de la geometría y del backend está en el [README del paquete](../../packages/stitch-render/README.md).

### E1. Cantidad de instancias: una por casilla en plano y tubo

- **Plano y tubo**: `count = ancho × alto` del gráfico completo. Las casillas `NO_STITCH` existen como instancia con `yarn = HIDDEN` (255) y no se dibujan.
- **Círculo**: `count = stitchTotal(chart)` (solo los puntos que existen, ADR 0005).
- **Por qué**: así pintar o quitar "sin punto" en plano y tubo es solo `colorize`, como ya pedía la sección "Capa 1"; con una instancia por punto habría que recalcular la geometría en cada trazo de "sin punto".
- **Propiedad que reemplaza "`count` es igual a `stitchTotal(chart)`"** (Consecuencias): en todas las formas, la cantidad de instancias con `yarn ≠ HIDDEN` es igual a `stitchTotal(chart)`. `visibleCount(layout)` cuenta además solo las de frente (`shade > 0`): en el tubo es menor que `stitchTotal`, porque la cara trasera no se dibuja (E3).
- **Regla para la interfaz (CA-F2)**: los totales y conteos que se muestran salen de `pattern-core` (`stitchTotal`, `rowStitchCounts`, `shaping`), nunca de `count`, `visibleCount` ni de `layout.geometry` (`perRepeat`, `rowStart`). Esos datos son del render.
- **Límite**: `MAX_LAYOUT_INSTANCES = 1.000.000`. `layoutGeometry` lanza `RangeError` por encima. La interfaz **debe** llamar a `layoutInstanceCount(chart, { shape })` antes de construir la disposición y, si pasa el tope, no dibujar la vista previa y explicarlo. El tope es alcanzable con documentos válidos: `LIMITS.maxRepeat` es 500 por eje, y un motivo de 200 × 200 lo pasa con más de 25 repeticiones en total (por ejemplo, 6 × 5). El estudio prueba ese caso (T10). El tope no se convierte en regla del validador: es un límite del render, no del tejido. El presupuesto de 100 ms se garantiza hasta 40.000 instancias (el escenario medido); entre 40.000 y el tope la vista previa funciona, pero el estudio no promete respuesta instantánea y lo indica.
- `layoutGeometry` lanza `TypeError` o `RangeError` con un gráfico mal formado o una muestra ≤ 0; nunca con un documento `savable` dentro del tope (ADR 0006, E10).

### E2. Tipos y métodos adicionales

- `StitchLayout.geometry: LayoutGeometry` se agrega. Son datos del render (`hitTest`, `colorize`, `needsRelayout`, backend). `apps/web` no los lee.
- `StitchRenderer` agrega:
  - `resize(cssWidth, cssHeight, devicePixelRatio?)`;
  - `flush(): FrameInfo | null`, que dibuja de inmediato (pruebas y benchmark; el estudio usa `requestRender`);
  - `getView(): ViewState`.
- `invalidate` acepta `Uint32Array | readonly number[]`.
- `createCanvasRenderer(canvas, opts?)` acepta `RendererOptions` (fondo, razón de píxeles, desactivar baldosas o búfer). `createRenderer(surface, opts)` trabaja sobre una `Surface` mínima, para probar el backend en Node sin DOM. WebGL2, si llega, implementa la misma `StitchRenderer`.

### E3. Tubo: la cara trasera no se dibuja

En vez de atenuarla, la cara trasera tiene `shade = 0` y no se dibuja; la de frente lleva `shade = 0,55 + 0,45 cos φ`. Es más parecido a mirar una prenda real y ahorra la mitad del dibujo. `hitTest` solo responde en la cara visible. La rotación (`tubeRotation`) muestra la otra cara.

### E4. Aspecto de la lana neutro por defecto

`yarnLook(yarn, fibers, { fiberEffects?: boolean })`: sin la opción, el aspecto es neutro (halo, brillo y definición en 0), como pedía la fase 2. `fiberEffects: true` adelanta la derivación por fibra; la fase 3 decide los valores con `catalogo-lanas` y la activa. `neutralLook(hex)` da el aspecto neutro de un color suelto (por ejemplo, para la vista previa al pasar el cursor).

### E5. API pura adicional

Se aceptan, todas puras y probadas con `node:test`:

| Módulo | Funciones | Uso previsto |
|---|---|---|
| `layout.ts` | `needsRelayout`, `layoutShape`, `layoutInstanceCount`, `visibleCount` | Estudio: decidir entre `colorize` y recalcular; avisar antes del tope |
| `view.ts` | `fitView`, `zoomAt`, `panBy`, `screenToLayout`, `layoutToScreen`, `MIN_ZOOM`, `MAX_ZOOM` | Estudio: zoom, desplazamiento y puntero |
| `regions.ts` | `instanceBounds`, `buildGrid`, `queryGrid`, `queryGridRects`, `dirtyRegions`, `deviceBox`, `tilePlan`, `tileRect`, `tileClass`, `tileRepresentative` | **Internas del backend.** Se exportan para las pruebas y el benchmark |
| `canvas.ts` | constantes `LOD_MIN_PX`, `MAX_TILE_PX`, `QUAD_CHUNK`, `ROTATED_SPRITE_BUDGET`, `SETTLE_MS`, `SHADE_LEVELS`; `paintSprite`, `drawInstances` | Internas del backend |

**Contrato estable para `apps/web`**: las funciones de `layout.ts`, `look.ts` y `view.ts`, `createCanvasRenderer`, los tipos de `types.ts` y `HIDDEN`, `MAX_LAYOUT_INSTANCES`. Lo marcado como interno puede cambiar sin enmienda. Si el estudio (T10) llega a importar algo interno, se mueve a un subpath `@loopitalab/stitch-render/internal` o se promueve aquí; hoy solo lo usa la página de benchmark (`apps/web/src/app/dev/`).

### E6. Optimizaciones del backend Canvas 2D

Se aceptan como detalle de implementación, sin cambio de contrato:

- **Baldosas** en plano y tubo con repeticiones: se dibuja una baldosa por clase (a lo más 9) y la pieza se compone copiándolas.
- **Búfer de la pieza** si cabe en `MAX_TILE_PX` (2048 px por lado).
- **Círculo**: sobre `ROTATED_SPRITE_BUDGET` (15.000) puntos visibles se omite la V y se dibuja solo el color; con menos de `LOD_MIN_PX` (3 px) por punto, lo mismo en todas las formas. Es un nivel de detalle, no un cambio de datos.
- **Zoom**: copia escalada durante el gesto y redibujo nítido `SETTLE_MS` (120 ms) después.
- Corrige la sección "Implementación de Canvas 2D": en el tubo **no** se usa `setTransform` por instancia (la compresión es el ancho de destino del `drawImage`); solo en el círculo.

Riesgo aceptado: en un círculo grande sin zoom la V no se ve. La interfaz no lo anuncia (la vista sigue siendo una aproximación, regla de oro 8); si las tejedoras lo notan, se reconsidera con WebGL2.

### E7. Rendimiento medido y criterio de WebGL2

Medición de `render-puntos` (Chromium sin interfaz, CPU limitada ×4, escenarios de la sección "Cómo se mide"):

- peor p95 de `edit-to-paint`: **87,8 ms** (círculo, cambio de repeticiones; CA-P3);
- zoom y desplazamiento: **≥ 48,5 fps** (CA-P4).

Ningún escenario supera 100 ms ni baja de 30 fps: **el criterio para pasar a WebGL2 no se activó** y Canvas 2D sigue siendo el único backend. El margen del círculo es corto (12 ms): T10 vuelve a medir con el estudio real (almacén, React, paneles), y si el p95 pasa de 100 ms se activa el criterio con una nueva enmienda.

**Pendiente: CA-P6**, la medición manual en el equipo de referencia (4 núcleos, 8 GB, GPU integrada, Chrome estable). Se adjunta al PR de cierre de la fase 2; sin ella la fase no se cierra.

### E8. Lo que `stitch-render` no hace

- **No avisa del rango de repeticiones del círculo.** El aviso es `CHART_CIRCLE_REPEATS` del validador (información fuera de 4 a 12, ADR 0005). Cualquier mención a "5 a 10" está superada.
- **Limitaciones visibles** (pedido de `experto-tejido`, 2026-11-06): la vista previa no dibuja orillos ni el desfase de vuelta (*jog*), el punto tras una disminución toma el color de la fila `y`, y el canesú (`yoke`) se dibuja como tubo. La interfaz las dice junto a la vista previa, además del aviso de prototipo y de los huecos de "sin punto" (CA-F10, CA-F13). Lo implementa `frontend-editor` en T9 con los textos de `documentador` (T12); `stitch-render` no cambia.
