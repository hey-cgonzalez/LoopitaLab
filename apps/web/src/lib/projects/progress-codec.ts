import { clampPointer, startPointer, type ChartPlan, type ChartPointer } from "@loopitalab/follow";

/*
 * Códec del puntero del modo tejiendo (ADR 0009, sección 3): `ChartPointer` de `follow` <-> columnas de
 * `project_progress`. Es la única capa que conoce las dos formas; `follow` no sabe de la base.
 *
 *   round_number = rowsDone + 1   (1 a totalRows + 1; totalRows + 1 = gráfico terminado)
 *   stitch_index = stitchesDone
 *   part_id      = null en gráficos (lo usará la fase 6)
 *
 * Al leer: `clampPointer(plan, decode(fila))`. Una fila sin avance (proyecto anterior a la fase 3) es `startPointer()`.
 * Pura: sin reloj, sin red y sin `server-only` (la usan también las pruebas y, más adelante, la interfaz).
 */

/** Cotas generales de la base (CHECK de `project_progress`), por `LIMITS`: 200 × 500 filas y 100 000 puntos. */
export const MAX_ROW_NUMBER = 100_001;
export const MAX_STITCH_INDEX = 100_000;

export interface ProgressColumns {
  round_number: number;
  stitch_index: number;
}

/**
 * Valida un puntero que llega del cliente (Server Action): objeto plano con dos enteros dentro de las cotas
 * generales. `null` si algo no cuadra. NO lo acota al plan (el servidor no lee el documento en cada guardado):
 * el recorte exacto lo hace `clampPointer` al leer.
 */
export function parseClientPointer(input: unknown): ChartPointer | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const { rowsDone, stitchesDone } = input as Record<string, unknown>;
  if (!Number.isSafeInteger(rowsDone) || !Number.isSafeInteger(stitchesDone)) return null;
  const r = rowsDone as number;
  const s = stitchesDone as number;
  if (r < 0 || r > MAX_ROW_NUMBER - 1 || s < 0 || s > MAX_STITCH_INDEX) return null;
  return { rowsDone: r, stitchesDone: s };
}

/** Puntero -> columnas. El puntero debe haber pasado por `parseClientPointer` o `clampPointer`. */
export function pointerToColumns(p: ChartPointer): ProgressColumns {
  return { round_number: p.rowsDone + 1, stitch_index: p.stitchesDone };
}

/**
 * Columnas -> puntero del dominio, acotado al plan. Sin fila (o con columnas nulas o dañadas) es el inicio.
 * Idempotente con `pointerToColumns` para todo puntero que ya esté dentro del plan (ida y vuelta).
 */
export function columnsToPointer(plan: ChartPlan, row: ProgressLike): ChartPointer {
  return clampPointer(plan, columnsToRawPointer(row));
}

type ProgressLike = { round_number?: unknown; stitch_index?: unknown } | null | undefined;

/** Columnas -> puntero SIN acotar al plan (solo para mensajes cuando la versión no se pudo leer). */
export function columnsToRawPointer(row: ProgressLike): ChartPointer {
  if (!row) return startPointer();
  const round = row.round_number;
  const stitch = row.stitch_index;
  const rowsDone = typeof round === "number" && Number.isFinite(round) && round >= 1 ? round - 1 : 0;
  const stitchesDone = typeof stitch === "number" && Number.isFinite(stitch) && stitch >= 0 ? stitch : 0;
  return { rowsDone, stitchesDone };
}
