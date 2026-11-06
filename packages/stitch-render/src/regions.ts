/**
 * Cálculo puro de regiones para el redibujo incremental (ADR 0004, capa 3):
 * - la caja de cada instancia (la V monta sobre la fila vecina, por eso no es la celda);
 * - una grilla espacial para saber qué instancias tocan un rectángulo;
 * - las regiones a redibujar, en baldosas, a partir de las instancias tocadas.
 * Sin DOM: se prueba en Node.
 */
import { STITCH_EXTENT, type StitchLayout, type ViewState } from "./types.ts";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Caja (en coordenadas de la disposición) de cada instancia, como
 * `[minX, minY, maxX, maxY]` por instancia: la silueta `STITCH_EXTENT` escalada y rotada.
 */
export function instanceBounds(layout: StitchLayout): Float32Array {
  const out = new Float32Array(layout.count * 4);
  const { stitchW, stitchH } = layout.geometry;
  const E = STITCH_EXTENT;
  for (let i = 0; i < layout.count; i++) {
    const w = stitchW * (layout.scaleX[i] as number);
    const h = stitchH * (layout.scaleY[i] as number);
    const a = layout.angle[i] as number;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < 4; k++) {
      const u = (k & 1 ? E.right : E.left) * w;
      const v = (k & 2 ? E.bottom : E.top) * h;
      // Rotación horaria en pantalla (y hacia abajo), como `setTransform` del canvas.
      const X = u * c - v * s;
      const Y = u * s + v * c;
      if (X < minX) minX = X;
      if (X > maxX) maxX = X;
      if (Y < minY) minY = Y;
      if (Y > maxY) maxY = Y;
    }
    const cx = layout.x[i] as number;
    const cy = layout.y[i] as number;
    out[i * 4] = cx + minX;
    out[i * 4 + 1] = cy + minY;
    out[i * 4 + 2] = cx + maxX;
    out[i * 4 + 3] = cy + maxY;
  }
  return out;
}

export interface SpatialGrid {
  cell: number;
  cols: number;
  rows: number;
  start: Uint32Array;
  items: Uint32Array;
  /** Marca de deduplicación por consulta. */
  stamp: Uint32Array;
  gen: number;
  count: number;
}

/** Grilla uniforme sobre la disposición: cada instancia queda en las celdas que toca su caja. */
export function buildGrid(layout: StitchLayout, boxes: Float32Array): SpatialGrid {
  const { stitchW, stitchH } = layout.geometry;
  const cell = Math.max(stitchW, stitchH) * 2;
  const cols = Math.max(1, Math.ceil(layout.bounds.width / cell));
  const rows = Math.max(1, Math.ceil(layout.bounds.height / cell));
  const n = cols * rows;
  const start = new Uint32Array(n + 1);
  const span = (i: number) => {
    const x0 = clampInt(Math.floor((boxes[i * 4] as number) / cell), 0, cols - 1);
    const y0 = clampInt(Math.floor((boxes[i * 4 + 1] as number) / cell), 0, rows - 1);
    const x1 = clampInt(Math.floor((boxes[i * 4 + 2] as number) / cell), 0, cols - 1);
    const y1 = clampInt(Math.floor((boxes[i * 4 + 3] as number) / cell), 0, rows - 1);
    return [x0, y0, x1, y1] as const;
  };
  for (let i = 0; i < layout.count; i++) {
    const [x0, y0, x1, y1] = span(i);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) start[gy * cols + gx + 1] = (start[gy * cols + gx + 1] as number) + 1;
  }
  for (let k = 0; k < n; k++) start[k + 1] = (start[k + 1] as number) + (start[k] as number);
  const fill = start.slice(0, n);
  const items = new Uint32Array(start[n] as number);
  for (let i = 0; i < layout.count; i++) {
    const [x0, y0, x1, y1] = span(i);
    for (let gy = y0; gy <= y1; gy++)
      for (let gx = x0; gx <= x1; gx++) {
        const k = gy * cols + gx;
        items[fill[k] as number] = i;
        fill[k] = (fill[k] as number) + 1;
      }
  }
  return { cell, cols, rows, start, items, stamp: new Uint32Array(layout.count), gen: 0, count: layout.count };
}

/**
 * Instancias cuya caja se cruza con `r` (coordenadas de la disposición), en orden
 * ascendente (= orden de dibujo).
 */
export function queryGrid(grid: SpatialGrid, boxes: Float32Array, r: Rect): Uint32Array {
  return queryGridRects(grid, boxes, [r]);
}

/** Unión de `queryGrid` para varios rectángulos, sin repetidos y en orden ascendente. */
export function queryGridRects(grid: SpatialGrid, boxes: Float32Array, rects: readonly Rect[]): Uint32Array {
  grid.gen = (grid.gen + 1) >>> 0;
  if (grid.gen === 0) {
    grid.stamp.fill(0);
    grid.gen = 1;
  }
  const gen = grid.gen;
  const found: number[] = [];
  for (const r of rects) {
    const x0 = clampInt(Math.floor(r.x / grid.cell), 0, grid.cols - 1);
    const y0 = clampInt(Math.floor(r.y / grid.cell), 0, grid.rows - 1);
    const x1 = clampInt(Math.floor((r.x + r.w) / grid.cell), 0, grid.cols - 1);
    const y1 = clampInt(Math.floor((r.y + r.h) / grid.cell), 0, grid.rows - 1);
    const rx1 = r.x + r.w;
    const ry1 = r.y + r.h;
    for (let gy = y0; gy <= y1; gy++)
      for (let gx = x0; gx <= x1; gx++) {
        const k = gy * grid.cols + gx;
        for (let p = grid.start[k] as number; p < (grid.start[k + 1] as number); p++) {
          const i = grid.items[p] as number;
          if (grid.stamp[i] === gen) continue;
          if ((boxes[i * 4] as number) <= rx1 && (boxes[i * 4 + 2] as number) >= r.x && (boxes[i * 4 + 1] as number) <= ry1 && (boxes[i * 4 + 3] as number) >= r.y) {
            grid.stamp[i] = gen;
            found.push(i);
          }
        }
      }
  }
  const out = Uint32Array.from(found);
  out.sort();
  return out;
}

/** Caja de la instancia `i` en px del dispositivo, para la vista y la razón de píxeles dadas. */
export function deviceBox(boxes: Float32Array, i: number, view: ViewState, dpr: number): Rect {
  const k = view.zoom * dpr;
  const x0 = (boxes[i * 4] as number) * k + view.panX * dpr;
  const y0 = (boxes[i * 4 + 1] as number) * k + view.panY * dpr;
  const x1 = (boxes[i * 4 + 2] as number) * k + view.panX * dpr;
  const y1 = (boxes[i * 4 + 3] as number) * k + view.panY * dpr;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Regiones a redibujar (px del dispositivo) para las instancias tocadas: se marcan las
 * baldosas de `tile` px que tocan sus cajas (con 1 px de margen por el antialias) y se
 * unen en tramos horizontales. Las baldosas fuera del canvas se descartan. Toda
 * instancia que se cruce con una región se vuelve a dibujar completa en orden, así las
 * vecinas que se solapan quedan bien.
 */
export function dirtyRegions(
  boxes: Float32Array,
  instances: ArrayLike<number>,
  view: ViewState,
  dpr: number,
  canvasW: number,
  canvasH: number,
  tile = 32,
): Rect[] {
  const tx = Math.max(1, Math.ceil(canvasW / tile));
  const ty = Math.max(1, Math.ceil(canvasH / tile));
  const marks = new Uint8Array(tx * ty);
  let any = false;
  for (let n = 0; n < instances.length; n++) {
    const b = deviceBox(boxes, instances[n] as number, view, dpr);
    const x0 = Math.floor((b.x - 1) / tile);
    const y0 = Math.floor((b.y - 1) / tile);
    const x1 = Math.floor((b.x + b.w + 1) / tile);
    const y1 = Math.floor((b.y + b.h + 1) / tile);
    if (x1 < 0 || y1 < 0 || x0 >= tx || y0 >= ty) continue;
    for (let gy = Math.max(0, y0); gy <= Math.min(ty - 1, y1); gy++)
      for (let gx = Math.max(0, x0); gx <= Math.min(tx - 1, x1); gx++) {
        marks[gy * tx + gx] = 1;
        any = true;
      }
  }
  if (!any) return [];
  const out: Rect[] = [];
  for (let gy = 0; gy < ty; gy++) {
    let gx = 0;
    while (gx < tx) {
      if (!marks[gy * tx + gx]) {
        gx++;
        continue;
      }
      const s = gx;
      while (gx < tx && marks[gy * tx + gx]) gx++;
      const x = s * tile;
      const y = gy * tile;
      out.push({ x, y, w: Math.min(gx * tile, canvasW) - x, h: Math.min((gy + 1) * tile, canvasH) - y });
    }
  }
  return out;
}

function clampInt(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

// ------------------------------------------------------------------ Baldosas

/**
 * Plan de baldosas para plano y tubo: la pieza es periódica (el motivo se repite), así
 * que basta dibujar una baldosa por clase (primera, del medio y última en cada eje, a
 * lo más 9) y componer la pieza copiándolas. Cada baldosa de clase se dibuja desde la
 * disposición real (con sus vecinas), así las V que montan sobre la baldosa vecina y
 * los bordes de la pieza quedan exactos.
 *
 * - Plano: periódico en x (si `repeatX ≥ 2`) y en y (si `repeatY ≥ 2`).
 * - Tubo: solo en y (la compresión del tubo cambia con la columna).
 * - Círculo: no aplica (`null`).
 */
export interface TilePlan {
  nx: number;
  ny: number;
  /** Clases por eje: `min(n, 3)`. */
  cx: number;
  cy: number;
  /** Instancias (aprox.) que se dibujan para todas las baldosas de clase. */
  cost: number;
}

export function tilePlan(layout: StitchLayout): TilePlan | null {
  const g = layout.geometry;
  if (g.shape === "circle") return null;
  const nx = g.shape === "flat" && g.repeatX >= 2 ? g.repeatX : 1;
  const ny = g.repeatY >= 2 ? g.repeatY : 1;
  if (nx * ny < 4) return null;
  const cx = Math.min(nx, 3);
  const cy = Math.min(ny, 3);
  // Instancias por baldosa, más las vecinas que se solapan (una fila y una columna de cada lado).
  // En el tubo solo se dibuja la cara visible (la mitad de las columnas).
  const tileCols = (g.shape === "tube" ? g.fullWidth / 2 : g.fullWidth / nx) + 2;
  const tileRows = g.fullHeight / ny + 2;
  const cost = cx * cy * tileCols * tileRows;
  if (cost > layout.count / 3) return null;
  return { nx, ny, cx, cy, cost };
}

/** Clase (0, 1 o 2) de la baldosa `i` de `n` en un eje. */
export function tileClass(i: number, n: number): number {
  if (n === 1 || i === 0) return 0;
  if (i === n - 1) return n === 2 ? 1 : 2;
  return 1;
}

/** Baldosa real que representa a la clase `c` en un eje de `n` baldosas. */
export function tileRepresentative(c: number, n: number): number {
  return c === 0 ? 0 : c === 1 ? 1 : n - 1;
}

/**
 * Rectángulo (coordenadas de la disposición) de la baldosa (i, j), contando j desde
 * arriba de la pantalla. Las baldosas del borde incluyen el margen de la pieza. Las
 * baldosas de un plan cubren `bounds` sin solaparse.
 */
export function tileRect(layout: StitchLayout, plan: TilePlan, i: number, j: number): Rect {
  const g = layout.geometry;
  const px = (g.fullWidth / plan.nx) * g.stitchW;
  const py = (g.fullHeight / plan.ny) * g.stitchH;
  const x0 = plan.nx === 1 || i === 0 ? 0 : g.pad + i * px;
  const x1 = plan.nx === 1 || i === plan.nx - 1 ? layout.bounds.width : g.pad + (i + 1) * px;
  const y0 = j === 0 ? 0 : g.pad + j * py;
  const y1 = j === plan.ny - 1 ? layout.bounds.height : g.pad + (j + 1) * py;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
