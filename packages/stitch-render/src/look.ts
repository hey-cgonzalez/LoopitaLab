/**
 * Capa 2 del ADR 0004: aspecto de la lana (puro).
 *
 * Por defecto el aspecto es neutro (halo, brillo y definición en 0), como pedía el ADR para la fase 2. Con
 * `fiberEffects: true` (por defecto en el estudio desde la fase 3, ADR 0008 §4) se derivan de la composición:
 *
 * - Cada nivel de `yarn-catalog` (`halo`, `brillo`, `definicion`: bajo / medio / alto) vale 0 / 0,5 / 1
 *   (`FIBER_LEVELS`), sin otra escala (ADR 0008 §4: el mapeo se mantiene salvo que la revisión visual pida otro).
 * - Mezclas: promedio ponderado por porcentaje (lineal). **Validar con tejedora**: la ponderación lineal de
 *   porcentajes chicos de mohair o lurex (F3-35).
 * - Fibra desconocida: aporta el aspecto neutro (0) con su porcentaje. No se excluye: suponer que el resto de la
 *   lana se comporta como las fibras conocidas sería inventar (regla de oro 6). Si ninguna fibra se conoce, el
 *   aspecto queda neutro.
 * - El grosor no cambia el aspecto: el tamaño relativo del punto ya sale de la muestra (`layoutGeometry`). No hay
 *   datos para más (regla de oro 6). Igual entra en `lookInputKey`, para que la caché no dependa de esa decisión.
 */
import type { Yarn } from "@loopitalab/pattern-core";
import type { FiberInfo } from "@loopitalab/yarn-catalog";
import type { YarnLook } from "./types.ts";

/** Valor numérico de cada nivel de `fibras.json` (masculino y femenino: "bajo" en halo, "baja" en definición). */
export const FIBER_LEVELS: Readonly<Record<string, number>> = Object.freeze({ bajo: 0, baja: 0, medio: 0.5, media: 0.5, alto: 1, alta: 1 });

/** Gris medio cuando el color no es un #RRGGBB válido. */
export const FALLBACK_HEX = "#8C8C8C";

export interface YarnLookOptions {
  /** Derivar halo, brillo y definición de la fibra. Sin la opción, aspecto neutro ("Colores planos"). */
  fiberEffects?: boolean;
}

/** Lo que `yarnLook` lee de una lana. Admite lanas parciales (vista previa al pasar el cursor). */
export type YarnLookInput = Pick<Yarn, "color" | "composition"> & Partial<Pick<Yarn, "weight">>;

const validPercent = (p: unknown): number => (typeof p === "number" && Number.isFinite(p) && p > 0 ? p : 0);

export function yarnLook(yarn: YarnLookInput, fibers: readonly FiberInfo[], opts: YarnLookOptions = {}): YarnLook {
  const hex = normalizeHex(yarn?.color?.hex);
  const look: YarnLook = { hex, halo: 0, sheen: 0, definition: 0 };
  if (!opts.fiberEffects || !Array.isArray(yarn?.composition)) return look;
  let total = 0;
  let known = 0;
  let halo = 0;
  let sheen = 0;
  let definition = 0;
  for (const share of yarn.composition) {
    const p = validPercent(share?.percent);
    if (p === 0) continue;
    total += p;
    const f = fiberById(fibers, share?.fiber);
    if (!f) continue; // desconocida: suma al total con aspecto neutro
    known += p;
    halo += p * (FIBER_LEVELS[f.halo] ?? 0);
    sheen += p * (FIBER_LEVELS[f.brillo] ?? 0);
    definition += p * (FIBER_LEVELS[f.definicion] ?? 0);
  }
  if (known === 0) return look;
  return { hex, halo: clamp01(halo / total), sheen: clamp01(sheen / total), definition: clamp01(definition / total) };
}

// Búsqueda por id con un índice por arreglo de fibras (el catálogo es el mismo en toda la sesión).
const fiberIndex = new WeakMap<readonly FiberInfo[], Map<string, FiberInfo>>();
function fiberById(fibers: readonly FiberInfo[], id: unknown): FiberInfo | undefined {
  if (typeof id !== "string") return undefined;
  let m = fiberIndex.get(fibers);
  if (!m) {
    m = new Map(fibers.map((f) => [f.id, f]));
    fiberIndex.set(fibers, m);
  }
  return m.get(id);
}

/**
 * Clave de lo que entra a `yarnLook`: color, grosor, fibras **con sus porcentajes** y si los efectos de fibra están
 * activos. Si la clave no cambia, el aspecto tampoco (el estudio no lo recalcula). Cambiar 70/30 a 30/70 la cambia.
 */
export function lookInputKey(yarn: YarnLookInput, opts: YarnLookOptions = {}): string {
  const comp = Array.isArray(yarn?.composition) ? yarn.composition.map((c) => `${String(c?.fiber)}:${validPercent(c?.percent)}`).join("+") : "";
  return `${normalizeHex(yarn?.color?.hex)}|${typeof yarn?.weight === "number" ? yarn.weight : "-"}|${comp}|${opts.fiberEffects ? 1 : 0}`;
}

/** Aspecto neutro de un color suelto. */
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

/**
 * Clave estable de un aspecto (caché de sprites, y para decidir si un cambio de lana cambia lo que se ve).
 * Dos decimales: diferencias menores no se distinguen en el sprite.
 */
export function lookKey(l: YarnLook): string {
  return `${l.hex}|${l.halo.toFixed(2)}|${l.sheen.toFixed(2)}|${l.definition.toFixed(2)}`;
}

/**
 * Relleno del fondo del punto (detrás de la V) y del nivel de detalle sin V, según el aspecto. Con halo, el hueco
 * entre las hojas se llena de pelusa (más claro) y en el nivel de detalle el color se aclara un poco; con brillo, un
 * poco más claro. Un aspecto neutro da exactamente el relleno de la fase 2 (`k = f · 0,6` o `f`, sin blanco).
 * `lod`: nivel de detalle sin V (círculo grande o puntos de menos de `LOD_MIN_PX`).
 */
export function fillTone(look: YarnLook | undefined, f: number, lod: boolean): { k: number; toWhite: number } {
  const halo = look?.halo ?? 0;
  const sheen = look?.sheen ?? 0;
  if (lod) return { k: f, toWhite: 0.1 * halo + 0.05 * sheen };
  return { k: f * (0.6 + 0.25 * halo), toWhite: 0.06 * halo };
}
