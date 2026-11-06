import { NO_STITCH, type Chart, type Gauge } from "@loopitalab/pattern-core";
import type { Rng } from "./property.ts";

export const GAUGE: Gauge = { stitchesPer10cm: 22, rowsPer10cm: 30 };

/**
 * Gráfico a partir de filas de texto, desde la fila 0 (la primera que se teje):
 * `A`, `B`, `C`… son lanas 0, 1, 2… y `.` es `NO_STITCH`.
 */
export function chartFrom(rows: readonly string[], over: Partial<Chart> = {}): Chart {
  const width = rows[0]?.length ?? 0;
  const cells: number[] = [];
  for (const r of rows) for (const ch of r) cells.push(ch === "." ? NO_STITCH : ch.charCodeAt(0) - 65);
  return {
    width,
    height: rows.length,
    cells,
    repeat: { x: 1, y: 1 },
    workedIn: "rounds",
    renderAs: "flat",
    direction: "bottom_up",
    ...over,
  };
}

/** Cuña de `R` repeticiones que baja de `from` a `to` puntos por repetición, 1 por vuelta (CA-F3). */
export function wedge(R: number, from = 10, to = 1, over: Partial<Chart> = {}): Chart {
  const rows: string[] = [];
  for (let n = from; n >= to; n--) rows.push("A".repeat(n) + ".".repeat(from - n));
  return chartFrom(rows, { repeat: { x: R, y: 1 }, renderAs: "circle", ...over });
}

/** Gráfico aleatorio guardable (puede tener filas vacías o estar vacío: ADR 0003, E10). */
export function randomChart(r: Rng, opts: { maxSide?: number; maxRepeat?: number; noStitch?: number } = {}): Chart {
  const maxSide = opts.maxSide ?? 9;
  const maxRepeat = opts.maxRepeat ?? 4;
  const width = r.int(1, maxSide);
  const height = r.int(1, maxSide);
  const yarns = r.int(1, 4);
  const pNo = opts.noStitch ?? r.pick([0, 0.1, 0.3, 0.7, 1]);
  const cells: number[] = [];
  for (let i = 0; i < width * height; i++) cells.push(r.bool(pNo) ? NO_STITCH : r.int(0, yarns - 1));
  return {
    width,
    height,
    cells,
    repeat: { x: r.int(1, maxRepeat), y: r.int(1, maxRepeat) },
    workedIn: r.pick(["rounds", "rows"] as const),
    renderAs: r.pick(["flat", "tube", "circle", "yoke"] as const),
    direction: r.pick(["bottom_up", "top_down"] as const),
  };
}

export function randomGauge(r: Rng): Gauge {
  return { stitchesPer10cm: r.int(8, 40), rowsPer10cm: r.int(10, 56) };
}
