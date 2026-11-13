import { yarnLetter, type Chart } from "@loopitalab/pattern-core";
import { cellOrigin, columnHasNumber, columnLabel, rowHasNumber, rowSide, valueAt, type Cell, type GridLayout, type RowNumbering } from "@/lib/studio/editor-grid.ts";

/*
 * Dibujo de la cuadrícula del editor en un canvas 2D (T9). Sin React. Convenciones iguales al SVG de pattern-render:
 * fila 1 abajo, flechas y números del lado donde empieza la lectura, rayas diagonales para "sin punto", bordes del
 * motivo en blanco y negro. Se puede dibujar todo (`paintAll`) o solo las casillas que cambiaron (`paintCells`),
 * que es el camino de cada pincelada (CA: respuesta en menos de 100 ms).
 */

const INK = "#1A1A1A";
const GRID = "rgba(26,26,26,0.35)";

export interface DrawParams {
  chart: Chart;
  yarnHex: readonly string[];
  yarnInk: readonly string[];
  layout: GridLayout;
  numbering: RowNumbering;
  mirror: boolean;
  /** 1 = aquí se pierde un punto (`lostStitchMarks`). */
  marks: Uint8Array;
  hatch: CanvasPattern | CanvasGradient | string;
  /** Casilla con foco del teclado, solo si el canvas tiene el foco. */
  focus: Cell | null;
  /** Dibujar los bordes de las repeticiones (vista completa). */
  showRepeats: boolean;
}

/** Textura de "sin punto": blanco con rayas diagonales grises (distinguible sin color). */
export function makeHatch(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const tile = document.createElement("canvas");
  tile.width = 8;
  tile.height = 8;
  const t = tile.getContext("2d");
  if (!t) return null;
  t.fillStyle = "#FFFFFF";
  t.fillRect(0, 0, 8, 8);
  t.strokeStyle = "#7A7A7A";
  t.lineWidth = 1.6;
  t.beginPath();
  t.moveTo(-1, 9);
  t.lineTo(9, -1);
  t.moveTo(-1, 1);
  t.lineTo(1, -1);
  t.moveTo(7, 9);
  t.lineTo(9, 7);
  t.stroke();
  return ctx.createPattern(tile, "repeat");
}

function paintCell(ctx: CanvasRenderingContext2D, p: DrawParams, x: number, y: number): void {
  const { layout: l } = p;
  const s = l.cellPx;
  const o = cellOrigin(l, { x, y });
  const v = valueAt(p.chart, { x, y });
  const isYarn = v >= 0 && v < p.yarnHex.length;
  ctx.fillStyle = isYarn ? (p.yarnHex[v] as string) : p.hatch;
  ctx.fillRect(o.x, o.y, s, s);
  if (s >= 6) {
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.strokeRect(o.x + 0.5, o.y + 0.5, s - 1, s - 1);
  }
  if (isYarn && s >= 12) {
    const letter = yarnLetter(v);
    ctx.fillStyle = p.yarnInk[v] as string;
    ctx.font = `600 ${Math.round(s * (letter.length > 1 ? 0.42 : 0.6))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, o.x + s / 2, o.y + s / 2 + 0.5);
  }
  if (p.marks[y * l.cols + x] === 1) {
    // "Se pierde un punto": triángulo en la esquina superior derecha, sin símbolo de punto.
    const t = Math.max(5, Math.round(s * 0.45));
    ctx.beginPath();
    ctx.moveTo(o.x + s - t, o.y);
    ctx.lineTo(o.x + s, o.y);
    ctx.lineTo(o.x + s, o.y + t);
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function paintFocus(ctx: CanvasRenderingContext2D, p: DrawParams): void {
  if (!p.focus) return;
  const s = p.layout.cellPx;
  const o = cellOrigin(p.layout, p.focus);
  // Doble anillo (oscuro por fuera, claro por dentro) dentro de la casilla: se ve sobre cualquier lana.
  ctx.lineWidth = Math.min(3, Math.max(2, s / 6));
  const w = ctx.lineWidth;
  ctx.strokeStyle = INK;
  ctx.strokeRect(o.x + w / 2, o.y + w / 2, s - w, s - w);
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 1;
  ctx.strokeRect(o.x + w + 0.5, o.y + w + 0.5, Math.max(1, s - 2 * w - 1), Math.max(1, s - 2 * w - 1));
}

/** Bordes de repetición o marco, y foco. Va encima de las casillas. */
function paintOverlay(ctx: CanvasRenderingContext2D, p: DrawParams): void {
  const { layout: l, chart } = p;
  const gridW = l.cols * l.cellPx;
  const gridH = l.rows * l.cellPx;
  ctx.beginPath();
  if (p.showRepeats) {
    for (let k = 0; k <= l.cols / chart.width; k++) {
      const x = l.left + k * chart.width * l.cellPx;
      ctx.moveTo(x, l.top);
      ctx.lineTo(x, l.top + gridH);
    }
    for (let k = 0; k <= l.rows / chart.height; k++) {
      const y = l.top + gridH - k * chart.height * l.cellPx;
      ctx.moveTo(l.left, y);
      ctx.lineTo(l.left + gridW, y);
    }
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    ctx.rect(l.left, l.top, gridW, gridH);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  paintFocus(ctx, p);
}

/** Números de fila con su flecha de lectura (como el SVG) y números de columna. */
function paintMargins(ctx: CanvasRenderingContext2D, p: DrawParams): void {
  const { layout: l, chart, numbering: n } = p;
  const fs = n.fontSize;
  const arrow = Math.max(4, Math.round(fs * 0.55));
  const s = l.cellPx;
  ctx.fillStyle = INK;
  ctx.font = `${fs}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  for (let y = 0; y < l.rows; y++) {
    const cy = l.top + (l.rows - 1 - y) * s + s / 2;
    const side = rowSide(chart, y, p.mirror);
    const numbered = rowHasNumber(n, y, l.rows);
    ctx.beginPath();
    if (side === "right") {
      const ax = l.left + l.cols * s + 2;
      ctx.moveTo(ax, cy);
      ctx.lineTo(ax + arrow, cy - arrow / 2);
      ctx.lineTo(ax + arrow, cy + arrow / 2);
      ctx.closePath();
      ctx.fill();
      if (numbered) {
        ctx.textAlign = "start";
        ctx.fillText(String(y + 1), ax + arrow + 2, cy);
      }
    } else {
      const ax = l.left - 2;
      ctx.moveTo(ax, cy);
      ctx.lineTo(ax - arrow, cy - arrow / 2);
      ctx.lineTo(ax - arrow, cy + arrow / 2);
      ctx.closePath();
      ctx.fill();
      if (numbered) {
        ctx.textAlign = "end";
        ctx.fillText(String(y + 1), ax - arrow - 2, cy);
      }
    }
  }
  ctx.textAlign = "center";
  for (let x = 0; x < l.cols; x++) {
    // Casilla 1 a la derecha (E18); con espejo, a la izquierda.
    const label = columnLabel(x, l.cols, p.mirror);
    if (!columnHasNumber(s, label, l.cols)) continue;
    const cx = l.left + x * s + s / 2;
    ctx.fillText(String(label), cx, l.top / 2);
    ctx.fillText(String(label), cx, l.top + l.rows * s + l.top / 2);
  }
}

/** Dibuja todo el canvas (cambio de tamaño, zoom, forma, lanas, repeticiones, espejo). */
export function paintAll(ctx: CanvasRenderingContext2D, p: DrawParams, dpr: number): void {
  const { layout: l } = p;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, l.width, l.height);
  for (let y = 0; y < l.rows; y++) for (let x = 0; x < l.cols; x++) paintCell(ctx, p, x, y);
  paintOverlay(ctx, p);
  paintMargins(ctx, p);
}

/** Dibuja solo estas casillas y vuelve a dibujar bordes y foco encima. */
export function paintCells(ctx: CanvasRenderingContext2D, p: DrawParams, dpr: number, cells: readonly Cell[]): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const c of cells) if (c.x >= 0 && c.x < p.layout.cols && c.y >= 0 && c.y < p.layout.rows) paintCell(ctx, p, c.x, c.y);
  paintOverlay(ctx, p);
}

/**
 * Casillas de la cuadrícula dibujada que corresponden a una celda del motivo (índice en `cells`): una por repetición,
 * y la de arriba de cada una, porque la marca de "se pierde un punto" de la fila siguiente depende de esta.
 */
export function cellsOfMotifIndex(chart: Chart, cols: number, rows: number, index: number): Cell[] {
  const mx = index % chart.width;
  const my = (index - mx) / chart.width;
  const out: Cell[] = [];
  for (let ky = 0; ky * chart.height < rows; ky++) {
    for (let kx = 0; kx * chart.width < cols; kx++) {
      const x = mx + kx * chart.width;
      const y = my + ky * chart.height;
      out.push({ x, y });
      if (y + 1 < rows) out.push({ x, y: y + 1 });
    }
  }
  return out;
}

/**
 * Resaltado del modo tejiendo (T12): un marco sobre la fila `row` (base 0, fila 1 abajo) y, si se da, un marco más
 * grueso sobre la repetición en curso `[xStart, xEnd)` (columnas del gráfico dibujado). Va encima de todo lo demás;
 * se dibuja con `paintAll` previo, así avanzar una fila repinta la cuadrícula entera (O(casillas), muy por debajo de
 * los 100 ms en los tamaños que caben en la vista completa).
 */
export function paintRowHighlight(ctx: CanvasRenderingContext2D, l: GridLayout, dpr: number, row: number, repeat: { xStart: number; xEnd: number } | null): void {
  if (!Number.isInteger(row) || row < 0 || row >= l.rows) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = l.cellPx;
  const y = l.top + (l.rows - 1 - row) * s;
  const w = l.cols * s;
  // Velo sobre las filas que no son la actual: la fila en curso queda con sus colores intactos.
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  if (y > l.top) ctx.fillRect(l.left, l.top, w, y - l.top);
  if (y + s < l.top + l.rows * s) ctx.fillRect(l.left, y + s, w, l.top + l.rows * s - (y + s));
  // Marco de la fila: blanco por fuera y marino por dentro (se ve sobre cualquier lana).
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#FFFFFF";
  ctx.strokeRect(l.left - 2.5, y - 2.5, w + 5, s + 5);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.strokeRect(l.left - 1.5, y - 1.5, w + 3, s + 3);
  if (repeat && repeat.xEnd > repeat.xStart && repeat.xStart >= 0 && repeat.xEnd <= l.cols) {
    const x = l.left + repeat.xStart * s;
    const rw = (repeat.xEnd - repeat.xStart) * s;
    // Marco de la repetición: borde blanco por fuera y tinta discontinua por dentro. No depende del color de la lana
    // (se ve sobre lanas claras y oscuras) ni del color en sí: se distingue del marco de la fila por ser discontinuo.
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#FFFFFF";
    ctx.strokeRect(x + 2.5, y + 2.5, rw - 5, s - 5);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x + 2.5, y + 2.5, rw - 5, s - 5);
    ctx.setLineDash([]);
  }
}
