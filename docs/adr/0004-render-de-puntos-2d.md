# ADR 0004: Render 2D de puntos y presupuesto de 100 ms

- Estado: propuesto (requiere aprobación de la usuaria)
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
  - en el círculo, los ángulos de cada anillo cubren la vuelta completa.
- La previsualización al pasar el cursor (fase 3) y el resaltado de fila (fases 3 y 6) ya tienen lugar en la interfaz: no obligan a rediseñar.
- `render-puntos` entrega la medición como parte del PR de la fase 2.
