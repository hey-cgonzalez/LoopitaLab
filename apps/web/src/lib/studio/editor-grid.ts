import { NO_STITCH, readingDirection, rowShapingColumns, type Chart } from "@loopitalab/pattern-core";
import { CHART_SVG_MAX_CELLS, isNumberedRow } from "@loopitalab/pattern-render";

/*
 * Geometría y teclado de la cuadrícula del editor (T9). Lógica pura, sin DOM ni React.
 *
 * Convenciones (ADR 0003, sección 1): la fila 1 está abajo (y = 0 en el modelo) y x = 0 queda a la izquierda visto
 * por el derecho. Una "casilla" es (x, y) del gráfico que se dibuja: del motivo en la vista "motivo" y del gráfico
 * completo en la vista "completo". En ambos casos el almacén recibe esas coordenadas tal cual: pattern-core las
 * lleva al motivo con `motifCoord`, así que pintar en cualquier repetición pinta el motivo (CA-F1).
 * Aquí no se cuenta ningún punto: los conteos y las columnas de disminución salen de pattern-core (CA-F2).
 */

export interface Cell {
  x: number;
  y: number;
}

export type GridView = "motif" | "full";

/** Qué se dibuja: el gráfico completo si cabe en `CHART_SVG_MAX_CELLS` (igual que el SVG), si no, solo el motivo. */
export function gridSize(chart: Chart, view: GridView): { cols: number; rows: number; view: GridView; forcedMotif: boolean } {
  const fullCols = chart.width * chart.repeat.x;
  const fullRows = chart.height * chart.repeat.y;
  if (view === "full") {
    if (fullCols * fullRows <= CHART_SVG_MAX_CELLS) return { cols: fullCols, rows: fullRows, view: "full", forcedMotif: false };
    return { cols: chart.width, rows: chart.height, view: "motif", forcedMotif: true };
  }
  return { cols: chart.width, rows: chart.height, view: "motif", forcedMotif: false };
}

// ------------------------------------------------------------------ zoom

export const MIN_CELL_PX = 4;
export const MAX_CELL_PX = 48;
export const DEFAULT_CELL_PX = 24;
/** Tope de píxeles del canvas (ancho × alto × dpr²): por encima, algunos navegadores lo vacían. */
export const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_CANVAS_SIDE = 8192;

/** Tamaño de casilla más grande que cabe en un canvas razonable. */
export function maxCellPx(cols: number, rows: number, dpr = 1): number {
  const gutter = 2 * gutterWidth(rows, MAX_CELL_PX) + 8;
  const bySide = Math.floor((MAX_CANVAS_SIDE / dpr - gutter) / Math.max(1, cols));
  const byArea = Math.floor(Math.sqrt(MAX_CANVAS_PIXELS / (dpr * dpr) / Math.max(1, cols * rows)));
  return Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, bySide, byArea));
}

export function clampCellPx(px: number, cols: number, rows: number, dpr = 1): number {
  if (!Number.isFinite(px)) return DEFAULT_CELL_PX;
  return Math.max(MIN_CELL_PX, Math.min(maxCellPx(cols, rows, dpr), Math.round(px)));
}

/** Casilla que hace caber la cuadrícula en el espacio disponible. */
export function fitCellPx(cols: number, rows: number, availW: number, availH: number, dpr = 1): number {
  const gutter = 2 * gutterWidth(rows, 16) + 8;
  const w = (availW - gutter) / Math.max(1, cols);
  const h = (availH - 2 * COLUMN_BAND) / Math.max(1, rows);
  return clampCellPx(Math.floor(Math.min(w, h)), cols, rows, dpr);
}

// ------------------------------------------------------------------ disposición del canvas

/** Alto de la franja de números de columna (arriba y abajo). */
export const COLUMN_BAND = 16;

export function fontSizeFor(cellPx: number): number {
  return Math.max(8, Math.min(14, Math.round(cellPx * 0.7)));
}

/** Ancho de cada margen lateral (flecha + número), como en el SVG. */
export function gutterWidth(rows: number, cellPx: number): number {
  const fs = fontSizeFor(cellPx);
  const arrow = Math.max(4, Math.round(fs * 0.55));
  return Math.ceil(String(rows).length * fs * 0.62 + arrow + 8);
}

export interface GridLayout {
  cols: number;
  rows: number;
  cellPx: number;
  gutter: number;
  /** Esquina superior izquierda de la cuadrícula dentro del canvas. */
  left: number;
  top: number;
  /** Tamaño del canvas en px CSS. */
  width: number;
  height: number;
}

export function gridLayout(cols: number, rows: number, cellPx: number): GridLayout {
  const gutter = gutterWidth(rows, cellPx);
  return {
    cols,
    rows,
    cellPx,
    gutter,
    left: gutter,
    top: COLUMN_BAND,
    width: gutter * 2 + cols * cellPx,
    height: COLUMN_BAND * 2 + rows * cellPx,
  };
}

/** Casilla bajo un punto del canvas (px CSS), o `null` si cae fuera de la cuadrícula. La fila 1 está abajo. */
export function pointToCell(l: GridLayout, px: number, py: number): Cell | null {
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  const cx = Math.floor((px - l.left) / l.cellPx);
  const cyTop = Math.floor((py - l.top) / l.cellPx);
  if (cx < 0 || cx >= l.cols || cyTop < 0 || cyTop >= l.rows) return null;
  return { x: cx, y: l.rows - 1 - cyTop };
}

/** Esquina superior izquierda de una casilla en el canvas. */
export function cellOrigin(l: GridLayout, c: Cell): { x: number; y: number } {
  return { x: l.left + c.x * l.cellPx, y: l.top + (l.rows - 1 - c.y) * l.cellPx };
}

// ------------------------------------------------------------------ teclado

export const PAGE_STEP = 5;

/** Mueve la casilla enfocada según la tecla. Devuelve la misma casilla si la tecla no mueve o ya está en el borde. */
export function moveFocus(cell: Cell, key: string, cols: number, rows: number): Cell {
  let { x, y } = cell;
  switch (key) {
    case "ArrowLeft":
      x -= 1;
      break;
    case "ArrowRight":
      x += 1;
      break;
    case "ArrowUp": // arriba en pantalla = fila con número mayor
      y += 1;
      break;
    case "ArrowDown":
      y -= 1;
      break;
    case "Home":
      x = 0;
      break;
    case "End":
      x = cols - 1;
      break;
    case "PageUp":
      y += PAGE_STEP;
      break;
    case "PageDown":
      y -= PAGE_STEP;
      break;
    default:
      return cell;
  }
  x = Math.max(0, Math.min(cols - 1, x));
  y = Math.max(0, Math.min(rows - 1, y));
  return x === cell.x && y === cell.y ? cell : { x, y };
}

// ------------------------------------------------------------------ numeración (igual que el SVG)

/** Factor del SVG: si la distancia entre números del mismo lado es menor que esto por el tamaño de la letra, la numeración es rala. */
export const ROW_NUMBER_MIN_GAP_FACTOR = 1.2; // mismo valor que pattern-render (no está exportado todavía)

export interface RowNumbering {
  fontSize: number;
  /** true con casillas chicas: solo la fila 1, los múltiplos de 5 y la última llevan número (`isNumberedRow`). */
  sparse: boolean;
}

export function rowNumbering(chart: Chart, cellPx: number): RowNumbering {
  const fontSize = fontSizeFor(cellPx);
  const gap = (chart.workedIn === "rounds" ? 1 : 2) * cellPx;
  return { fontSize, sparse: gap < ROW_NUMBER_MIN_GAP_FACTOR * fontSize };
}

/** ¿La fila `y` (base 0) lleva número? */
export function rowHasNumber(n: RowNumbering, y: number, rows: number): boolean {
  return !n.sparse || isNumberedRow(y + 1, rows);
}

/** Lado de la fila donde empieza la lectura (donde van el número y la flecha). Sale de `readingDirection`. */
export function rowSide(chart: Chart, y: number, mirror: boolean): "left" | "right" {
  return readingDirection(chart, y, { mirror }) === "right_to_left" ? "right" : "left";
}

/**
 * Número de la columna `x` (base 0, x = 0 a la izquierda) de una cuadrícula de `width` casillas (E18, ADR 0003).
 * Por convención el gráfico se lee por el derecho de derecha a izquierda: la casilla 1 queda a la derecha.
 * Con "tejer en espejo" (preferencia de la cuenta, para zurdas) se numera de izquierda a derecha.
 * La usan los números dibujados, los anuncios y las notas: siempre la misma numeración. // validar con tejedora
 */
export function columnLabel(x: number, width: number, mirror: boolean): number {
  return mirror ? x + 1 : width - x;
}

/** Columnas con número (base 1, ya con `columnLabel`) con la misma regla rala que las filas. */
export function columnHasNumber(cellPx: number, col1: number, cols: number): boolean {
  if (cellPx >= 22) return true;
  return isNumberedRow(col1, cols);
}

// ------------------------------------------------------------------ "se pierde un punto"

/**
 * Casillas donde se pierde un punto, en la cuadrícula dibujada (`rowShapingColumns` de pattern-core). La columna
 * es la del motivo; en la vista completa se marca en cada repetición horizontal. `1` = marcada.
 */
export function lostStitchMarks(chart: Chart, view: GridView): Uint8Array {
  const { cols, rows } = gridSize(chart, view);
  const marks = new Uint8Array(cols * rows);
  const repeatsX = cols / chart.width;
  for (let y = 0; y < rows; y++) {
    const { decreases } = rowShapingColumns(chart, y);
    for (const mx of decreases) for (let k = 0; k < repeatsX; k++) marks[y * cols + mx + k * chart.width] = 1;
  }
  return marks;
}

/** Valor de la casilla (x, y) de la cuadrícula dibujada. */
export function valueAt(chart: Chart, c: Cell): number {
  return chart.cells[(c.y % chart.height) * chart.width + (c.x % chart.width)] ?? NO_STITCH;
}
