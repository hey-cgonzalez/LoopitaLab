import { NO_STITCH, shaping, type Chart, type ChartPattern, type Gauge } from "@loopitalab/pattern-core";
import { MAX_LAYOUT_INSTANCES, layoutInstanceCount } from "@loopitalab/stitch-render";

/*
 * Decisiones de la vista previa que no dependen del DOM (T9; T10 las puede reemplazar o ajustar).
 */

/** Sobre este número de puntos la respuesta ya no es instantánea (ADR 0004, E1): se avisa. */
export const SLOW_PREVIEW_STITCHES = 40_000;
export const TOO_LARGE_PREVIEW_STITCHES = MAX_LAYOUT_INSTANCES;

export type PreviewPlan = { kind: "ok"; count: number } | { kind: "slow"; count: number } | { kind: "too-large"; count: number };

/** ¿Se puede dibujar? Consulta `layoutInstanceCount` antes de `layoutGeometry` (que lanza RangeError sobre el tope). */
export function planPreview(chart: Chart): PreviewPlan {
  const count = layoutInstanceCount(chart);
  if (count > TOO_LARGE_PREVIEW_STITCHES) return { kind: "too-large", count };
  if (count > SLOW_PREVIEW_STITCHES) return { kind: "slow", count };
  return { kind: "ok", count };
}

/**
 * Cambios entre dos gráficos para actualizar la vista de forma incremental:
 *  - `same`: nada que dibujar.
 *  - `cells`: solo cambiaron casillas del motivo (índices en `cells`), mismas dimensiones y opciones.
 *  - `relayout`: cambió la forma, las repeticiones, el tamaño, la dirección o la muestra: hay que recalcular.
 */
export type ChartDiff = { kind: "same" } | { kind: "cells"; cells: number[] } | { kind: "relayout" };

export function diffCharts(prev: Chart, next: Chart, prevGauge: Gauge | undefined, nextGauge: Gauge | undefined): ChartDiff {
  if (prev === next && prevGauge === nextGauge) return { kind: "same" };
  if (
    prev.width !== next.width ||
    prev.height !== next.height ||
    prev.repeat.x !== next.repeat.x ||
    prev.repeat.y !== next.repeat.y ||
    prev.renderAs !== next.renderAs ||
    prev.direction !== next.direction ||
    prev.workedIn !== next.workedIn ||
    prevGauge?.stitchesPer10cm !== nextGauge?.stitchesPer10cm ||
    prevGauge?.rowsPer10cm !== nextGauge?.rowsPer10cm
  ) {
    return { kind: "relayout" };
  }
  if (prev.cells === next.cells) return { kind: "same" };
  const cells: number[] = [];
  for (let i = 0; i < next.cells.length; i++) if (prev.cells[i] !== next.cells[i]) cells.push(i);
  return cells.length === 0 ? { kind: "same" } : { kind: "cells", cells };
}

/** Umbrales de deformación del círculo (mismos que el benchmark de render-puntos): fuera de [0,6; 1,6] se avisa. */
export const RING_DISTORTION_MIN = 0.6;
export const RING_DISTORTION_MAX = 1.6;

export function isRingDistorted(ringDistortion: ArrayLike<number> | undefined): boolean {
  if (!ringDistortion) return false;
  for (let i = 0; i < ringDistortion.length; i++) {
    const d = ringDistortion[i] as number;
    if (d > 0 && (d < RING_DISTORTION_MIN || d > RING_DISTORTION_MAX)) return true;
  }
  return false;
}

export type LimitationKey = "orillos" | "jog" | "colorTrasDisminucion" | "canesu" | "huecosSinPunto" | "deformacionCirculo";

/** Limitaciones de la vista que aplican a este diseño (ADR 0004, E8; CA-F10, CA-F13). */
export function applicableLimitations(doc: ChartPattern, opts: { distorted: boolean }): LimitationKey[] {
  const { chart } = doc;
  const out: LimitationKey[] = ["orillos"];
  if (chart.workedIn === "rounds") out.push("jog");
  if (shaping(chart).some((r) => r.change !== 0)) out.push("colorTrasDisminucion");
  if (chart.renderAs === "yoke") out.push("canesu");
  if ((chart.renderAs === "flat" || chart.renderAs === "tube" || chart.renderAs === "yoke") && chart.cells.includes(NO_STITCH)) out.push("huecosSinPunto");
  if (chart.renderAs === "circle" && opts.distorted) out.push("deformacionCirculo");
  return out;
}
