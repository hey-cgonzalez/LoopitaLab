/**
 * Decisiones puras del backend `three` (sin GPU ni `three`): nivel de detalle y modo según los puntos de la
 * escena (ADR 0010, secciones 6 y 6c), capacidad reservada de los atributos (sección 5) y búsquedas sobre la
 * malla para la selección y el resaltado. Se prueban con `node:test` sin WebGL.
 */
import type { Lod, PartMesh } from "../types.ts";
import { DEGRADED_PIXEL_RATIO, LOD_STITCH_BUDGET, RECOMMENDED_SCENE_STITCHES, RESERVE_GROWTH, SCENE_HARD_STITCH_CAP } from "./constants.ts";

/**
 * - `full`: dentro del límite recomendado; meta completa (p95 < 100 ms).
 * - `degraded`: sobre el límite recomendado: `"smooth"` forzado, razón de píxeles 1, "Actualizando 3D…".
 * - `silhouettes`: sobre `SCENE_HARD_STITCH_CAP`: no se arma la malla.
 */
export type ViewerMode = "full" | "degraded" | "silhouettes";

export interface ViewerPolicy {
  mode: ViewerMode;
  /** Nivel de detalle que se dibuja. */
  lod: Lod;
  /** true si el nivel de detalle no es el pedido (por puntos, por el modo o por un contexto limitado). */
  lodForced: boolean;
  /** Razón de píxeles máxima (`null` = la del dispositivo, como pida el lienzo). */
  maxPixelRatio: number | null;
}

/** Modo del visor para una escena de `stitches` puntos (sección 6c). Valores no finitos cuentan como 0. */
export function viewerMode(stitches: number): ViewerMode {
  const n = Number.isFinite(stitches) ? stitches : 0;
  if (n > SCENE_HARD_STITCH_CAP) return "silhouettes";
  if (n > RECOMMENDED_SCENE_STITCHES) return "degraded";
  return "full";
}

/**
 * Política completa: `"relief"` solo si la usuaria lo pide, la escena tiene a lo más `LOD_STITCH_BUDGET`
 * puntos visibles, está dentro del límite recomendado y el contexto no es limitado.
 */
export function viewerPolicy(stitches: number, requested: Lod, opts: { limitedContext?: boolean } = {}): ViewerPolicy {
  const mode = viewerMode(stitches);
  const n = Number.isFinite(stitches) ? stitches : 0;
  const mustSmooth = mode !== "full" || n > LOD_STITCH_BUDGET || opts.limitedContext === true;
  const lod: Lod = requested === "relief" && !mustSmooth ? "relief" : "smooth";
  return { mode, lod, lodForced: lod !== requested, maxPixelRatio: mode === "full" ? null : DEGRADED_PIXEL_RATIO };
}

/** Capacidad para `needed` elementos: la actual si alcanza; si no, `needed × RESERVE_GROWTH` (redondeado hacia arriba). */
export function grownCapacity(current: number, needed: number): number {
  if (needed <= current) return current;
  return Math.max(1, Math.ceil(needed * RESERVE_GROWTH));
}

/** Puntos de una malla (`roundStart.at(-1)`). */
export const meshStitches = (mesh: PartMesh): number => mesh.roundStart[mesh.roundStart.length - 1] ?? 0;

/** Vuelta concreta (0-based) y punto dentro de ella de un punto global de la malla; `null` fuera de rango. */
export function stitchLocation(mesh: PartMesh, stitch: number): { roundIndex: number; stitchInRound: number } | null {
  const rs = mesh.roundStart;
  const total = meshStitches(mesh);
  if (!Number.isInteger(stitch) || stitch < 0 || stitch >= total || rs.length < 2) return null;
  let lo = 0;
  let hi = rs.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (rs[mid]! <= stitch) lo = mid;
    else hi = mid - 1;
  }
  return { roundIndex: lo, stitchInRound: stitch - rs[lo]! };
}

/**
 * Rango de vértices `[from, to)` de los puntos `[stitchFrom, stitchTo)` de la malla (para el resaltado por
 * `gl_VertexID`). Cubre todos los vértices de esos puntos: como cada punto tiene vértices propios y la malla
 * los emite en orden, el rango no toca puntos de otras vueltas. Vacío (`from === to`) si no hay triángulos.
 */
export function vertexRangeOfStitches(mesh: PartMesh, stitchFrom: number, stitchTo: number): { from: number; to: number } {
  let from = Infinity;
  let to = -Infinity;
  const tris = Math.floor(mesh.indexCount / 3);
  for (let t = 0; t < tris; t++) {
    const s = mesh.faceStitch[t]!;
    if (s < stitchFrom || s >= stitchTo) continue;
    for (let k = 0; k < 3; k++) {
      const v = mesh.indices[t * 3 + k]!;
      if (v < from) from = v;
      if (v + 1 > to) to = v + 1;
    }
  }
  return from === Infinity ? { from: 0, to: 0 } : { from, to };
}
