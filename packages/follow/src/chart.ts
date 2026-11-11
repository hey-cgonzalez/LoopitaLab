/**
 * Secuencia de filas de un gráfico de colorwork y puntero de avance (ADR 0007).
 *
 * - Paso = fila (o vuelta) del gráfico completo, `y = 0 … H − 1`, siempre en ese orden.
 * - Puntero = `{ rowsDone, stitchesDone }`: lo único que se guarda del avance.
 * - Todo conteo sale de `pattern-core` (regla de oro 2): aquí solo se ordena, se agrupa
 *   en tramos y se suman conteos que ya entrega el motor.
 * - Funciones puras: no mutan, no lanzan, no leen el reloj ni el almacenamiento.
 */
import {
  NO_STITCH,
  cellAt,
  motifCoord,
  readingDirection,
  rowShapingColumns,
  rowStitchCount,
  stitchTotal,
  type ChartPattern,
  type ReadingDirection,
  type Technique,
} from "@loopitalab/pattern-core";

export interface FollowOptions {
  /** Preferencia `mirror_knitting` del perfil. Por defecto false. Nunca se deriva de `dominant_hand`. */
  mirror?: boolean;
}

export interface ChartPlan {
  readonly kind: "chart";
  /** Filas o vueltas del gráfico completo (`height × repeat.y`): la cantidad de pasos. */
  readonly totalRows: number;
  /** `stitchTotal(chart)`, para el avance en puntos. */
  readonly totalStitches: number;
  readonly motifWidth: number;
  readonly motifHeight: number;
  readonly repeatX: number;
  readonly repeatY: number;
  readonly workedIn: "rounds" | "rows";
  /** Copiado de `pattern.technique` (enmienda T1-3). */
  readonly technique: Technique;
  readonly mirror: boolean;
  /** Referencia (no copia) al documento fijado. Los pasos se derivan de él bajo demanda. */
  readonly pattern: ChartPattern;
}

export interface ColorRun {
  /** Índice de la lana en `yarns`. La letra la da `yarnLetter` de pattern-core. */
  yarn: number;
  count: number;
}

export interface ChartStep {
  /** Fila del gráfico completo (0-based). Índice del paso y argumento de `setHighlightRow`. */
  row: number;
  /** Número visible (1-based), el mismo que numera el gráfico. */
  number: number;
  /** Fila del motivo (0-based) y repetición vertical (0-based). */
  motifRow: number;
  verticalRepeat: number;
  /** En redondo siempre "right"; en ida y vuelta, `row` par "right" e impar "wrong". El espejo no lo cambia. */
  side: "right" | "wrong";
  /** De `readingDirection(chart, row, { mirror })`. */
  reading: ReadingDirection;
  /** De `rowStitchCount`: casillas producidas en la fila (enmienda T1-5). */
  stitches: number;
  /** `stitches / repeatX`: puntos de la fila del motivo. */
  stitchesPerRepeat: number;
  /** Cambio respecto de la fila anterior (como `shaping`): negativo = disminuciones. 0 en la fila 0. */
  change: number;
  /** `change / repeatX`. */
  perRepeat: number;
  /** De `rowShapingColumns`: columnas del motivo (ascendentes). */
  decreaseColumns: readonly number[];
  increaseColumns: readonly number[];
  /** Lanas de la fila, en el orden en que aparecen al tejerla (sin repetir). */
  yarns: readonly number[];
  /**
   * Tramos de **una** repetición horizontal, en el orden en que se tejen, sin `NO_STITCH`,
   * con los colores como se ven por el derecho también en filas por el revés (T1-3).
   * No se fusionan entre repeticiones: la fila completa es esta lista `repeatX` veces.
   */
  runs: readonly ColorRun[];
}

export interface ChartPointer {
  /** Filas terminadas, de 0 a `totalRows`. La fila actual es `rowsDone`. `rowsDone === totalRows` = gráfico terminado. */
  rowsDone: number;
  /** Casillas producidas de la fila actual, de 0 a `stitches − 1`. 0 si la fila no tiene puntos o el gráfico está terminado. */
  stitchesDone: number;
}

export interface ChartPosition {
  /** null si el gráfico está terminado. */
  step: ChartStep | null;
  finished: boolean;
  /**
   * Repetición horizontal en curso (0-based, en el orden de lectura) y su rango de columnas
   * del gráfico completo `[xStart, xEnd)` (`xEnd` exclusivo: `xEnd − xStart === motifWidth`).
   * null si está terminado o si la fila no tiene puntos.
   */
  horizontalRepeat: { index: number; of: number; xStart: number; xEnd: number } | null;
  /** Repetición vertical de la fila actual; terminado, la de la última fila. */
  verticalRepeat: { index: number; of: number };
  rowsDone: number;
  totalRows: number;
  /** Del gráfico completo: puntos de las filas terminadas + `stitchesDone` de la fila actual. */
  stitchesDone: number;
  totalStitches: number;
}

export interface RemapResult {
  pointer: ChartPointer;
  /** La fila quedó fuera del plan nuevo y se acotó. */
  clamped: boolean;
  /** La fila actual cambió de contenido (tramos, puntos, forma, lado o sentido) entre los dos planes. */
  rowChanged: boolean;
}

// ------------------------------------------------------------------ Plan

const isPosInt = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 1;

/**
 * Plan de un gráfico. O(motivo): no recorre las filas del gráfico completo (no depende
 * de `repeat.y`). Acepta todo documento `savable`; con dimensiones dañadas el plan
 * tiene 0 filas (terminado desde el inicio) y nunca lanza.
 */
export function planChart(pattern: ChartPattern, opts: FollowOptions = {}): ChartPlan {
  const chart = pattern.chart;
  const ok = isPosInt(chart.width) && isPosInt(chart.height) && isPosInt(chart.repeat.x) && isPosInt(chart.repeat.y);
  const total = ok ? chart.height * chart.repeat.y : 0;
  const totalRows = Number.isSafeInteger(total) ? total : 0;
  const plan: ChartPlan = {
    kind: "chart",
    totalRows,
    totalStitches: totalRows > 0 ? stitchTotal(chart) : 0,
    motifWidth: ok ? chart.width : 0,
    motifHeight: ok ? chart.height : 0,
    repeatX: ok ? chart.repeat.x : 1,
    repeatY: ok ? chart.repeat.y : 1,
    workedIn: chart.workedIn,
    technique: pattern.technique,
    mirror: opts.mirror === true,
    pattern,
  };
  return Object.freeze(plan);
}

/**
 * Suma acumulada de `rowStitchCount` por fila del motivo (para `position`), calculada una
 * vez por plan. `prefix[i]` = puntos de las filas del motivo 0 … i − 1.
 */
const prefixCache = new WeakMap<ChartPlan, number[]>();
function motifPrefix(plan: ChartPlan): number[] {
  let prefix = prefixCache.get(plan);
  if (prefix) return prefix;
  prefix = [0];
  const chart = plan.pattern.chart;
  for (let my = 0; my < plan.motifHeight; my++) prefix.push((prefix[my] ?? 0) + rowStitchCount(chart, my));
  prefixCache.set(plan, prefix);
  return prefix;
}

/** Puntos de las filas `0 … rows − 1` del gráfico completo, sin recorrerlas. */
function stitchesBefore(plan: ChartPlan, rows: number): number {
  if (rows <= 0 || plan.motifHeight === 0) return 0;
  const prefix = motifPrefix(plan);
  const h = plan.motifHeight;
  const full = Math.floor(rows / h);
  return full * (prefix[h] ?? 0) + (prefix[rows - full * h] ?? 0);
}

// ----------------------------------------------------------------- Pasos

const stepCache = new WeakMap<ChartPlan, Map<number, ChartStep>>();

/** Paso de la fila `row` del gráfico completo. O(ancho del motivo). null fuera de rango; nunca lanza. */
export function stepAt(plan: ChartPlan, row: number): ChartStep | null {
  if (!Number.isInteger(row) || row < 0 || row >= plan.totalRows) return null;
  let cache = stepCache.get(plan);
  const hit = cache?.get(row);
  if (hit) return hit;
  const step = buildStep(plan, row);
  if (!cache) stepCache.set(plan, (cache = new Map()));
  if (cache.size > 64) cache.clear(); // la vista solo consulta unas pocas filas cercanas
  cache.set(row, step);
  return step;
}

function buildStep(plan: ChartPlan, row: number): ChartStep {
  const chart = plan.pattern.chart;
  const reading = readingDirection(chart, row, { mirror: plan.mirror });
  const stitches = rowStitchCount(chart, row);
  const change = row === 0 ? 0 : stitches - rowStitchCount(chart, row - 1);
  const columns = rowShapingColumns(chart, row);
  const w = plan.motifWidth;
  const runs: ColorRun[] = [];
  const yarns: number[] = [];
  for (let i = 0; i < w; i++) {
    const x = reading === "right_to_left" ? w - 1 - i : i;
    const v = cellAt(chart, x, row);
    if (v === NO_STITCH) continue;
    const last = runs[runs.length - 1];
    if (last && last.yarn === v) last.count++;
    else {
      runs.push({ yarn: v, count: 1 });
      if (!yarns.includes(v)) yarns.push(v);
    }
  }
  for (const r of runs) Object.freeze(r);
  return Object.freeze({
    row,
    number: row + 1,
    motifRow: motifCoord(chart, 0, row).y,
    verticalRepeat: Math.floor(row / plan.motifHeight),
    side: plan.workedIn === "rows" && row % 2 === 1 ? "wrong" : "right",
    reading,
    stitches,
    // `+ 0` evita -0.
    stitchesPerRepeat: stitches / plan.repeatX + 0,
    change: change + 0,
    perRepeat: change / plan.repeatX + 0,
    decreaseColumns: Object.freeze(columns.decreases),
    increaseColumns: Object.freeze(columns.increases),
    yarns: Object.freeze(yarns),
    runs: Object.freeze(runs),
  });
}

// --------------------------------------------------------------- Puntero

export function startPointer(): ChartPointer {
  return { rowsDone: 0, stitchesDone: 0 };
}

/** Lee un campo sin lanzar (getters o `Proxy` que lanzan) y lo lleva a un entero ≥ 0, o 0. */
function readInt(input: unknown, key: string): number {
  let v: unknown;
  try {
    v = (input as Record<string, unknown>)[key];
  } catch {
    return 0;
  }
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return 0;
  return Math.min(Math.floor(v), Number.MAX_SAFE_INTEGER);
}

/**
 * Lleva cualquier valor (de la base, del almacenamiento local, dañado) a un puntero del
 * dominio del plan. Idempotente; nunca lanza. Los decimales se truncan; lo negativo, `NaN`
 * o lo que no es número vale 0; lo enorme se acota.
 */
export function clampPointer(plan: ChartPlan, input: unknown): ChartPointer {
  if (input === null || typeof input !== "object") return startPointer();
  const rowsDone = Math.min(readInt(input, "rowsDone"), plan.totalRows);
  const step = stepAt(plan, rowsDone);
  const max = step ? Math.max(step.stitches - 1, 0) : 0;
  return { rowsDone, stitchesDone: Math.min(readInt(input, "stitchesDone"), max) };
}

/** "Terminado" es del gráfico, no de la pieza (enmienda T1-4). */
export function isFinished(plan: ChartPlan, p: ChartPointer): boolean {
  return clampPointer(plan, p).rowsDone === plan.totalRows;
}

/** Datos derivados del puntero para la vista. Nada de esto se guarda. */
export function position(plan: ChartPlan, p: ChartPointer): ChartPosition {
  const q = clampPointer(plan, p);
  const step = stepAt(plan, q.rowsDone);
  let horizontalRepeat: ChartPosition["horizontalRepeat"] = null;
  if (step && step.stitches > 0) {
    const index = Math.floor(q.stitchesDone / step.stitchesPerRepeat);
    // En el orden de lectura, la primera repetición es la de la derecha si se lee de
    // derecha a izquierda (sin espejo) y la de la izquierda con espejo.
    const slot = step.reading === "right_to_left" ? plan.repeatX - 1 - index : index;
    const xStart = slot * plan.motifWidth;
    horizontalRepeat = { index, of: plan.repeatX, xStart, xEnd: xStart + plan.motifWidth };
  }
  const lastRow = Math.max(Math.min(q.rowsDone, plan.totalRows - 1), 0);
  return {
    step,
    finished: step === null,
    horizontalRepeat,
    verticalRepeat: { index: plan.motifHeight > 0 ? Math.floor(lastRow / plan.motifHeight) : 0, of: plan.repeatY },
    rowsDone: q.rowsDone,
    totalRows: plan.totalRows,
    stitchesDone: stitchesBefore(plan, q.rowsDone) + q.stitchesDone,
    totalStitches: plan.totalStitches,
  };
}

/** Termina la fila actual: `{ rowsDone + 1, 0 }`, con tope en terminado. */
export function nextRow(plan: ChartPlan, p: ChartPointer): ChartPointer {
  const q = clampPointer(plan, p);
  if (q.rowsDone >= plan.totalRows) return q;
  return { rowsDone: q.rowsDone + 1, stitchesDone: 0 };
}

/** Con casillas hechas, vuelve al inicio de la fila; si no, a la fila anterior. */
export function prevRow(plan: ChartPlan, p: ChartPointer): ChartPointer {
  const q = clampPointer(plan, p);
  if (q.stitchesDone > 0) return { rowsDone: q.rowsDone, stitchesDone: 0 };
  return { rowsDone: Math.max(q.rowsDone - 1, 0), stitchesDone: 0 };
}

/**
 * Avanza hasta el próximo borde de repetición horizontal (suma `stitchesPerRepeat` desde
 * un borde). La última repetición pasa a la fila siguiente; una fila sin puntos se salta
 * de una vez.
 */
export function nextRepeat(plan: ChartPlan, p: ChartPointer): ChartPointer {
  const q = clampPointer(plan, p);
  const step = stepAt(plan, q.rowsDone);
  if (!step) return q;
  if (step.stitches === 0) return { rowsDone: q.rowsDone + 1, stitchesDone: 0 };
  const per = step.stitchesPerRepeat;
  const next = (Math.floor(q.stitchesDone / per) + 1) * per;
  return next >= step.stitches ? { rowsDone: q.rowsDone + 1, stitchesDone: 0 } : { rowsDone: q.rowsDone, stitchesDone: next };
}

/** Retrocede al borde de repetición anterior; desde el inicio de una fila, a la última repetición de la fila anterior. */
export function prevRepeat(plan: ChartPlan, p: ChartPointer): ChartPointer {
  const q = clampPointer(plan, p);
  if (q.stitchesDone > 0) {
    const per = stepAt(plan, q.rowsDone)?.stitchesPerRepeat ?? 1;
    return { rowsDone: q.rowsDone, stitchesDone: (Math.ceil(q.stitchesDone / per) - 1) * per };
  }
  if (q.rowsDone === 0) return q;
  const prev = stepAt(plan, q.rowsDone - 1);
  if (!prev || prev.stitches === 0) return { rowsDone: q.rowsDone - 1, stitchesDone: 0 };
  return { rowsDone: q.rowsDone - 1, stitchesDone: prev.stitches - prev.stitchesPerRepeat };
}

function sameRuns(a: readonly ColorRun[], b: readonly ColorRun[]): boolean {
  return a.length === b.length && a.every((r, i) => r.yarn === b[i]?.yarn && r.count === b[i]?.count);
}
function sameList(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** true si los dos pasos se tejen igual (contenido, forma, lado y sentido). */
function sameStep(a: ChartStep | null, b: ChartStep | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.stitches === b.stitches &&
    a.change === b.change &&
    a.side === b.side &&
    a.reading === b.reading &&
    a.stitchesPerRepeat === b.stitchesPerRepeat &&
    sameRuns(a.runs, b.runs) &&
    sameList(a.decreaseColumns, b.decreaseColumns) &&
    sameList(a.increaseColumns, b.increaseColumns)
  );
}

/**
 * Lleva un puntero a otro plan (cambio explícito de versión fijada, ADR 0007 §5). Conserva
 * el número de fila acotado; no busca "la misma fila" por contenido. `stitchesDone` vuelve
 * a 0 si la fila cambió o se acotó; si la fila se teje igual en los dos planes se conserva
 * (así `remapPointer(plan, plan, p)` devuelve `p`, propiedad P14).
 */
export function remapPointer(from: ChartPlan, to: ChartPlan, p: ChartPointer): RemapResult {
  const q = clampPointer(from, p);
  const clamped = q.rowsDone > to.totalRows;
  const rowsDone = Math.min(q.rowsDone, to.totalRows);
  const rowChanged = clamped || !sameStep(stepAt(from, q.rowsDone), stepAt(to, rowsDone));
  const pointer = rowChanged ? { rowsDone, stitchesDone: 0 } : clampPointer(to, { rowsDone, stitchesDone: q.stitchesDone });
  return { pointer, clamped, rowChanged };
}
