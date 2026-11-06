/**
 * Capa 2 del ADR 0004: aspecto de la lana (puro).
 *
 * Por defecto el aspecto es neutro (halo, brillo y definición en 0), como pide el ADR
 * para la fase 2. Con `fiberEffects: true` se derivan de la composición, ponderando
 * cada fibra por su porcentaje con las propiedades de `yarn-catalog` (bajo/baja = 0,
 * medio/media = 0,5, alto/alta = 1). Las fibras desconocidas no cuentan; si ninguna se
 * conoce, el aspecto queda neutro (no se inventa).
 */
import type { Yarn } from "@loopitalab/pattern-core";
import type { FiberInfo } from "@loopitalab/yarn-catalog";
import type { YarnLook } from "./types.ts";

const LEVEL: Record<string, number> = { bajo: 0, baja: 0, medio: 0.5, media: 0.5, alto: 1, alta: 1 };

/** Gris medio cuando el color no es un #RRGGBB válido. */
export const FALLBACK_HEX = "#8C8C8C";

export interface YarnLookOptions {
  /** Derivar halo, brillo y definición de la fibra (fase 3). Por defecto, aspecto neutro. */
  fiberEffects?: boolean;
}

export function yarnLook(yarn: Yarn, fibers: readonly FiberInfo[], opts: YarnLookOptions = {}): YarnLook {
  const hex = normalizeHex(yarn?.color?.hex);
  const look: YarnLook = { hex, halo: 0, sheen: 0, definition: 0 };
  if (!opts.fiberEffects || !Array.isArray(yarn?.composition)) return look;
  const byId = new Map(fibers.map((f) => [f.id, f]));
  let weight = 0;
  let halo = 0;
  let sheen = 0;
  let definition = 0;
  for (const share of yarn.composition) {
    const f = byId.get(share?.fiber);
    const p = typeof share?.percent === "number" && share.percent > 0 ? share.percent : 0;
    if (!f || p === 0) continue;
    weight += p;
    halo += p * (LEVEL[f.halo] ?? 0);
    sheen += p * (LEVEL[f.brillo] ?? 0);
    definition += p * (LEVEL[f.definicion] ?? 0);
  }
  if (weight === 0) return look;
  return { hex, halo: clamp01(halo / weight), sheen: clamp01(sheen / weight), definition: clamp01(definition / weight) };
}

/** Aspecto neutro de un color suelto (vista previa al pasar el cursor por la paleta). */
export function neutralLook(hex: string): YarnLook {
  return { hex: normalizeHex(hex), halo: 0, sheen: 0, definition: 0 };
}

export function normalizeHex(hex: unknown): string {
  return typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : FALLBACK_HEX;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex);
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/** Color CSS de `rgb` multiplicado por `k` (0 = negro) y mezclado hacia blanco con `toWhite`. */
export function tone(rgb: readonly [number, number, number], k: number, toWhite = 0, alpha = 1): string {
  const f = (c: number) => Math.round(Math.min(255, Math.max(0, c * k + (255 - c * k) * toWhite)));
  return alpha >= 1 ? `rgb(${f(rgb[0])},${f(rgb[1])},${f(rgb[2])})` : `rgba(${f(rgb[0])},${f(rgb[1])},${f(rgb[2])},${alpha})`;
}

/** Clave estable de un aspecto, para la caché de sprites. */
export function lookKey(l: YarnLook): string {
  return `${l.hex}|${l.halo.toFixed(2)}|${l.sheen.toFixed(2)}|${l.definition.toFixed(2)}`;
}
