/**
 * Tipos y constantes de la vista previa realista (ADR 0004).
 * Unidades: la disposición se expresa en "px de disposición" (zoom 1). La vista
 * (`ViewState`) lleva esas coordenadas a px CSS de la pantalla.
 */
import type { Chart, Gauge } from "@loopitalab/pattern-core";

/** Forma efectiva de la disposición. `yoke` (canesú) se dibuja como tubo en la fase 2. */
export type LayoutShape = "flat" | "tube" | "circle";

export interface LayoutOptions {
  /** Muestra real o supuesta (la interfaz marca el supuesto). La proporción del punto sale de aquí. */
  gauge: Gauge;
  /** Por defecto, `chart.renderAs` (`yoke` se trata como `tube`). */
  shape?: Chart["renderAs"];
  /** Ancho del punto en px con zoom 1 (por defecto 12). El alto sale de la muestra. */
  stitchPx?: number;
  /** Radianes, solo en tubo. 0 deja la columna 0 en el borde izquierdo de la cara visible. */
  tubeRotation?: number;
}

/**
 * Datos de la disposición que no son por instancia. Los usan `hitTest`, `colorize`,
 * `needsRelayout` y el backend; la interfaz no los necesita.
 */
export interface LayoutGeometry {
  shape: LayoutShape;
  /** Ancho y alto de un punto en px de disposición (el alto sale de la muestra). */
  stitchW: number;
  stitchH: number;
  /** Gráfico completo (con repeticiones). */
  fullWidth: number;
  fullHeight: number;
  motifWidth: number;
  motifHeight: number;
  repeatX: number;
  repeatY: number;
  direction: Chart["direction"];
  /** Margen alrededor de la pieza, para que la V que monta sobre la fila vecina no se corte. */
  pad: number;
  /** Centro del tubo (x) o del círculo (x, y). */
  cx: number;
  cy: number;
  /** Radio del tubo o radio exterior del círculo. */
  radius: number;
  tubeRotation: number;
  /** Instancias de la fila `y` del gráfico completo: `[rowStart[y], rowStart[y + 1])`. Largo `fullHeight + 1`. */
  rowStart: Uint32Array;
  /** Solo plano y tubo: instancia en la posición vista (columna, fila desde abajo), `drow * fullWidth + dcol`. */
  displayToInstance: Uint32Array | null;
  /** Solo círculo: puntos de una repetición en cada fila del gráfico completo (`c(y)` del ADR 0005). */
  perRepeat: Uint32Array | null;
  /** Celdas del motivo con punto (1) o `NO_STITCH` (0) con que se calculó la disposición. */
  stitchMask: Uint8Array;
  /** CSR de celda del motivo a instancias: las de la celda `m` son `cellInstances[cellStart[m] .. cellStart[m + 1])`. */
  cellStart: Uint32Array;
  cellInstances: Uint32Array;
}

export interface StitchLayout {
  count: number;
  /** Arreglos de largo `count`: centro, rotación y escala de cada punto. */
  x: Float32Array;
  y: Float32Array;
  /** Radianes, sentido horario en pantalla. 0 = la V abre hacia arriba de la pantalla. */
  angle: Float32Array;
  scaleX: Float32Array;
  scaleY: Float32Array;
  /** 0 a 1: atenuación por perspectiva en el tubo (1 = de frente). 0 = no visible (cara trasera). */
  shade: Float32Array;
  /** Fila y columna en el gráfico completo, para resaltar e interactuar. */
  row: Uint32Array;
  col: Uint32Array;
  /** Índice de la celda del motivo de cada instancia (`y * width + x` del motivo). */
  motifCell: Uint32Array;
  /** Lana de cada instancia (índice en `yarns`), o `HIDDEN`. Se llena con `colorize`. */
  yarn: Uint8Array;
  bounds: { width: number; height: number };
  /** Solo en círculo: deformación angular por anillo (ADR 0005). Índice = anillo `k`. */
  ringDistortion?: Float32Array;
  geometry: LayoutGeometry;
}

/** Valor de `layout.yarn` para una instancia sin punto (`NO_STITCH`): no se dibuja. */
export const HIDDEN = 255;

/** Tope de instancias de una disposición. La interfaz debe avisar antes de llegar (ver `layoutInstanceCount`). */
export const MAX_LAYOUT_INSTANCES = 1_000_000;

/**
 * Silueta del punto en unidades del punto (ancho 1 = `stitchW · scaleX`, alto 1 =
 * `stitchH · scaleY`), en su marco local: el centro de la celda en (0, 0) y la V
 * abierta hacia `-v` (arriba). Las puntas montan `OVERLAP` sobre la fila siguiente.
 */
export const STITCH_OVERLAP = 0.4;
export const STITCH_PAD = 0.08;
export const STITCH_EXTENT = {
  left: -0.5 - STITCH_PAD,
  right: 0.5 + STITCH_PAD,
  top: -0.5 - STITCH_OVERLAP - STITCH_PAD,
  bottom: 0.5 + STITCH_PAD,
} as const;

export interface YarnLook {
  hex: string;
  /** 0 a 1. Por defecto valen 0 (aspecto neutro, fase 2); con `fiberEffects` se derivan de la fibra. */
  halo: number;
  sheen: number;
  definition: number;
}

/** Vista: px CSS de pantalla = coordenada de disposición × `zoom` + `pan`. */
export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface StitchRenderer {
  setLooks(looks: readonly YarnLook[]): void;
  setLayout(layout: StitchLayout): void;
  /** Redibujo incremental de las instancias tocadas (devueltas por `colorize`). */
  invalidate(instances: Uint32Array | readonly number[]): void;
  setView(view: ViewState): void;
  /** Vista previa de un color al pasar el cursor, sin tocar el diseño. */
  setPreviewOverride(o: { yarn: number; look: YarnLook } | null): void;
  /** Fila resaltada en el modo tejiendo. */
  setHighlightRow(row: number | null): void;
  /** Dibuja lo pendiente en el próximo frame (agrupa varias llamadas en un solo dibujo). */
  requestRender(): void;
  snapshot(opts: { width: number; height: number }): Promise<Blob>;
  destroy(): void;
  /** Tamaño del canvas en px CSS y razón de píxeles del dispositivo. Redibuja todo. */
  resize(cssWidth: number, cssHeight: number, devicePixelRatio?: number): void;
  /** Dibuja lo pendiente ahora mismo (pruebas y benchmark). Devuelve lo que se dibujó. */
  flush(): FrameInfo | null;
  getView(): ViewState;
}

export interface FrameInfo {
  /** true si se dibujó todo el canvas. */
  full: boolean;
  /** Rectángulos redibujados (1 en un dibujo completo). */
  regions: number;
  /** Instancias dibujadas (contando repeticiones por solaparse con varias regiones). */
  drawn: number;
  /** Tiempo de dibujo en ms (`performance.now`). */
  ms: number;
}
