/**
 * Operaciones puras de edición del gráfico (ADR 0003, sección 3).
 *
 * Reglas comunes:
 * - Devuelven un objeto nuevo y nunca mutan la entrada.
 * - Nunca lanzan excepciones.
 * - Las coordenadas fuera de rango se ignoran.
 * - Si un parámetro no es válido, o la operación no cambia nada, devuelven el mismo
 *   objeto (misma referencia). Así el historial para deshacer puede descartar no-ops.
 * - Cada operación crea a lo más un arreglo `cells` nuevo, aunque pinte muchas celdas.
 *
 * Las operaciones sobre `Chart` no conocen la cantidad de lanas: quien llama debe pasar
 * un índice de lana existente (o `NO_STITCH`). El validador lo revisa al guardar.
 */
import { fullSize, motifCoord } from "./chart.ts";
import { NO_STITCH, SCHEMA_VERSION, type Chart, type ChartPattern, type Gauge, type Yarn } from "./types.ts";
import { LIMITS, validatePattern } from "./validate.ts";

/** Límites de edición. El motivo hasta 200 × 200 protege el ciclo instantáneo y el tamaño del documento (roadmap, R2). */
export const EDIT_LIMITS = {
  maxMotifWidth: 200,
  maxMotifHeight: 200,
  maxRepeat: LIMITS.maxRepeat,
  maxYarns: LIMITS.maxYarns,
} as const;

/** Coordenadas del gráfico completo (con repeticiones). */
export interface CellRef {
  x: number;
  y: number;
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Un valor de celda aceptable: índice de lana (≥ 0) o `NO_STITCH`. */
const isCellValue = (v: unknown): v is number => isInt(v) && v >= NO_STITCH;

/** Revisión estructural mínima, para no lanzar con entradas dañadas. */
function isWellFormed(chart: Chart): boolean {
  return (
    typeof chart === "object" &&
    chart !== null &&
    isInt(chart.width) &&
    isInt(chart.height) &&
    chart.width >= 1 &&
    chart.height >= 1 &&
    Array.isArray(chart.cells) &&
    chart.cells.length === chart.width * chart.height &&
    typeof chart.repeat === "object" &&
    chart.repeat !== null &&
    isInt(chart.repeat.x) &&
    isInt(chart.repeat.y) &&
    chart.repeat.x >= 1 &&
    chart.repeat.y >= 1
  );
}

function isChartPattern(p: ChartPattern): boolean {
  return typeof p === "object" && p !== null && p.kind === "chart" && Array.isArray(p.yarns) && isWellFormed(p.chart);
}

/**
 * Pinta celdas del gráfico completo con `value` (índice de lana o `NO_STITCH`).
 * Cada celda escribe la del motivo `(x mod width, y mod height)`: editar una
 * repetición edita todas. Un trazo completo es una sola operación.
 */
export function paintCells(chart: Chart, refs: readonly CellRef[], value: number): Chart {
  if (!isWellFormed(chart) || !isCellValue(value) || !Array.isArray(refs)) return chart;
  const { width, height } = fullSize(chart);
  let cells: number[] | null = null;
  for (const ref of refs) {
    if (!ref || !isInt(ref.x) || !isInt(ref.y) || ref.x < 0 || ref.y < 0 || ref.x >= width || ref.y >= height) continue;
    const m = motifCoord(chart, ref.x, ref.y);
    const i = m.y * chart.width + m.x;
    if ((cells ?? chart.cells)[i] === value) continue;
    cells ??= chart.cells.slice();
    cells[i] = value;
  }
  return cells ? { ...chart, cells } : chart;
}

/**
 * Relleno por contigüidad dentro del motivo: 4 vecinos, sin envolver los bordes.
 * `start` está en coordenadas del gráfico completo y se lleva al motivo. Rellena la
 * región del mismo valor que la celda inicial (también una región `NO_STITCH`).
 */
export function fillRegion(chart: Chart, start: CellRef, value: number): Chart {
  if (!isWellFormed(chart) || !isCellValue(value) || !start || !isInt(start.x) || !isInt(start.y)) return chart;
  const full = fullSize(chart);
  if (start.x < 0 || start.y < 0 || start.x >= full.width || start.y >= full.height) return chart;
  const { width: w, height: h } = chart;
  const s = motifCoord(chart, start.x, start.y);
  const first = s.y * w + s.x;
  const target = chart.cells[first];
  if (target === value) return chart;
  const cells = chart.cells.slice();
  // Pila explícita: sin recursión, para motivos grandes.
  const stack = [first];
  cells[first] = value;
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0 && cells[i - 1] === target) (cells[i - 1] = value), stack.push(i - 1);
    if (x < w - 1 && cells[i + 1] === target) (cells[i + 1] = value), stack.push(i + 1);
    if (y > 0 && cells[i - w] === target) (cells[i - w] = value), stack.push(i - w);
    if (y < h - 1 && cells[i + w] === target) (cells[i + w] = value), stack.push(i + w);
  }
  return { ...chart, cells };
}

/**
 * Punto de anclaje al cambiar el tamaño del motivo. "bottom" es la fila 0 (la primera
 * que se teje, que el editor muestra abajo); "left" es `x = 0` visto por el derecho.
 */
export type Anchor = "bottom_left" | "bottom_center" | "bottom_right" | "center";

/** Desplazamiento del contenido anterior en el motivo nuevo. Se trunca hacia cero para que agrandar y achicar se deshagan exactamente. */
function anchorOffset(anchor: Anchor, oldW: number, oldH: number, newW: number, newH: number): { dx: number; dy: number } {
  const dw = newW - oldW;
  const dh = newH - oldH;
  switch (anchor) {
    case "bottom_left":
      return { dx: 0, dy: 0 };
    case "bottom_center":
      return { dx: Math.trunc(dw / 2), dy: 0 };
    case "bottom_right":
      return { dx: dw, dy: 0 };
    case "center":
      return { dx: Math.trunc(dw / 2), dy: Math.trunc(dh / 2) };
  }
}

const ANCHORS: readonly Anchor[] = ["bottom_left", "bottom_center", "bottom_right", "center"];

/**
 * Cambia el tamaño del motivo (de 1 a 200 por lado). Las celdas que quedan dentro se
 * conservan según el anclaje; las nuevas toman `fill` (índice de lana o `NO_STITCH`)
 * y las que quedan fuera se recortan. Las repeticiones no cambian.
 */
export function resizeMotif(chart: Chart, width: number, height: number, anchor: Anchor, fill: number): Chart {
  if (!isWellFormed(chart) || !isCellValue(fill) || !ANCHORS.includes(anchor)) return chart;
  if (!isInt(width) || !isInt(height) || width < 1 || height < 1) return chart;
  if (width > EDIT_LIMITS.maxMotifWidth || height > EDIT_LIMITS.maxMotifHeight) return chart;
  if (width === chart.width && height === chart.height) return chart;
  const { dx, dy } = anchorOffset(anchor, chart.width, chart.height, width, height);
  const cells = new Array<number>(width * height).fill(fill);
  for (let y = 0; y < height; y++) {
    const oy = y - dy;
    if (oy < 0 || oy >= chart.height) continue;
    for (let x = 0; x < width; x++) {
      const ox = x - dx;
      if (ox < 0 || ox >= chart.width) continue;
      cells[y * width + x] = chart.cells[oy * chart.width + ox] ?? fill;
    }
  }
  return { ...chart, width, height, cells };
}

/** Cambia las repeticiones a lo ancho (`x`) y a lo alto (`y`), enteros de 1 a `LIMITS.maxRepeat`. */
export function setRepeat(chart: Chart, x: number, y: number): Chart {
  if (!isWellFormed(chart)) return chart;
  if (!isInt(x) || !isInt(y) || x < 1 || y < 1 || x > EDIT_LIMITS.maxRepeat || y > EDIT_LIMITS.maxRepeat) return chart;
  if (x === chart.repeat.x && y === chart.repeat.y) return chart;
  return { ...chart, repeat: { x, y } };
}

/**
 * La lana es válida por sí misma: se revisa con el mismo validador, sobre un
 * documento mínimo, para no duplicar las reglas.
 */
function yarnIsValid(yarn: Yarn): boolean {
  const probe = {
    schemaVersion: SCHEMA_VERSION,
    id: "probe",
    title: "probe",
    technique: "knit",
    kind: "chart",
    origin: { kind: "manual" },
    yarns: [yarn],
    chart: { width: 1, height: 1, cells: [0], repeat: { x: 1, y: 1 }, workedIn: "rounds", renderAs: "flat", direction: "bottom_up" },
  };
  return validatePattern(probe).valid;
}

/** Agrega una lana al final. No acepta lanas inválidas, identificadores repetidos ni pasar de `LIMITS.maxYarns`. */
export function addYarn(pattern: ChartPattern, yarn: Yarn): ChartPattern {
  if (!isChartPattern(pattern) || typeof yarn !== "object" || yarn === null) return pattern;
  if (pattern.yarns.length >= EDIT_LIMITS.maxYarns) return pattern;
  if (pattern.yarns.some((y) => y.id === yarn.id)) return pattern;
  if (!yarnIsValid(yarn)) return pattern;
  return { ...pattern, yarns: [...pattern.yarns, structuredClone(yarn)] };
}

/**
 * Quita la lana `index`; sus celdas pasan a `replaceWith` y se remapean los índices.
 * `replaceWith` es el índice **actual** (antes de quitar) de otra lana del diseño.
 * No se puede quitar la única lana.
 */
export function removeYarn(pattern: ChartPattern, index: number, replaceWith: number): ChartPattern {
  if (!isChartPattern(pattern)) return pattern;
  const n = pattern.yarns.length;
  if (!isInt(index) || !isInt(replaceWith) || index < 0 || index >= n || replaceWith < 0 || replaceWith >= n || replaceWith === index) {
    return pattern;
  }
  const target = replaceWith > index ? replaceWith - 1 : replaceWith;
  const cells = pattern.chart.cells.map((v) => (v === index ? target : v > index ? v - 1 : v));
  return {
    ...pattern,
    yarns: pattern.yarns.filter((_, i) => i !== index),
    chart: { ...pattern.chart, cells },
  };
}

/**
 * Reordena las lanas: `order[i]` es el índice anterior de la lana que queda en la
 * posición i. Debe ser una permutación de `0 … n − 1`. Las celdas se remapean, así que
 * el dibujo no cambia.
 */
export function reorderYarns(pattern: ChartPattern, order: readonly number[]): ChartPattern {
  if (!isChartPattern(pattern) || !Array.isArray(order)) return pattern;
  const n = pattern.yarns.length;
  if (order.length !== n) return pattern;
  const newIndex = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const old = order[i];
    if (!isInt(old) || old < 0 || old >= n || newIndex[old] !== -1) return pattern;
    newIndex[old] = i;
  }
  if (order.every((old, i) => old === i)) return pattern;
  const cells = pattern.chart.cells.map((v) => (v === NO_STITCH ? v : (newIndex[v] ?? v)));
  return {
    ...pattern,
    yarns: order.map((old) => pattern.yarns[old] as Yarn),
    chart: { ...pattern.chart, cells },
  };
}

export interface NewChartInput {
  id: string;
  title: string;
  width: number;
  height: number;
  repeat: { x: number; y: number };
  workedIn: Chart["workedIn"];
  renderAs: Exclude<Chart["renderAs"], "yoke">;
  direction: Chart["direction"];
  /** La primera es el fondo: todas las celdas empiezan con ella. */
  yarns: Yarn[];
  gauge?: Gauge;
}

/**
 * Documento nuevo de colorwork a palillo, con todas las celdas en la lana de fondo
 * (la primera) y origen manual. No inventa la muestra: solo la incluye si viene.
 *
 * Nunca lanza. Si el ancho o el alto no son enteros de 1 a 200, el documento sale sin
 * celdas y `validatePattern` informa el problema (no hay un objeto anterior que devolver).
 */
export function newChartPattern(input: NewChartInput): ChartPattern {
  const { width, height } = input;
  const sizeOk = isInt(width) && isInt(height) && width >= 1 && height >= 1 && width <= EDIT_LIMITS.maxMotifWidth && height <= EDIT_LIMITS.maxMotifHeight;
  const pattern: ChartPattern = {
    schemaVersion: SCHEMA_VERSION,
    id: input.id,
    title: input.title,
    technique: "knit",
    kind: "chart",
    yarns: Array.isArray(input.yarns) ? input.yarns.map((y) => structuredClone(y)) : [],
    origin: { kind: "manual" },
    chart: {
      width,
      height,
      cells: sizeOk ? new Array<number>(width * height).fill(0) : [],
      repeat: { x: input.repeat?.x, y: input.repeat?.y },
      workedIn: input.workedIn,
      renderAs: input.renderAs,
      direction: input.direction,
    },
  };
  if (input.gauge !== undefined) pattern.gauge = { ...input.gauge };
  return pattern;
}
