import { concreteRounds, LIMITS, type FreeAt, type Part, type PartRef, type Placement, type SurfaceAt, type Vec3, type WrittenPattern } from "@loopitalab/pattern-core";
import type { SceneInstance } from "@loopitalab/viewer-3d";

/*
 * Posicionado y armado del estudio amigurumi (T16 de la fase 4; decisión 3; ADR 0011, secciones 2 y 9, enmiendas
 * T10-4a a T10-4e; ADR 0010, T10-2, T10-4 y T11-1). Lógica pura, sin React ni `three`:
 *
 * - **Del toque al documento**: `pick` del visor da la vuelta concreta 0-based (`roundIndex`) y el punto dentro de
 *   ella (`stitchInRound`). `SurfaceAt.round` se guarda como el NÚMERO VISIBLE (`concreteRounds(anfitrión)[roundIndex]
 *   .number`, así "V7" dentro de "V5–8") y `stitch` como `stitchInRound`. Un error de uno movería el ancla una vuelta.
 * - **Marco del ancla**: en `anchor.ts` (importa `viewer-3d`, así no entra en el JS inicial del estudio).
 * - **Topes**: los giros, la separación y la posición libre se acotan a los topes duros de `LIMITS` antes de llegar a
 *   las operaciones (que igual rechazan lo que deje un error estructural).
 *
 * Ningún conteo se calcula aquí: los puntos de cada vuelta vienen de `concreteRounds` (el motor).
 */

export type PlacementMode = "auto" | "free" | "surface";

/** Lo que el visor entrega al tocar (subconjunto de `PickResult`). */
export interface PickedStitch {
  partId: string;
  copy: number;
  roundIndex: number;
  stitchInRound: number;
}

const copiesOf = (p: Part): number => (typeof p.copies === "number" && Number.isInteger(p.copies) && p.copies >= 1 ? p.copies : 1);

export const sameRef = (a: PartRef, b: PartRef): boolean => a.part === b.part && a.copy === b.copy;

/** Todas las piezas del diseño (una por copia), en el orden de `parts`. */
export function pieceRefs(doc: WrittenPattern): PartRef[] {
  const out: PartRef[] = [];
  for (const p of doc.parts) for (let c = 0; c < copiesOf(p); c++) out.push({ part: p.id, copy: c });
  return out;
}

export function placementOf(doc: WrittenPattern, ref: PartRef): Placement | undefined {
  return doc.layout?.placements.find((pl) => sameRef(pl.target, ref));
}

export function modeOf(doc: WrittenPattern, ref: PartRef): PlacementMode {
  const at = placementOf(doc, ref)?.at;
  return at?.type === "free" ? "free" : at?.type === "surface" ? "surface" : "auto";
}

/** Piezas sin entrada en `layout` (respaldo del aviso cuando el visor no armó escena: sin WebGL o siluetas). */
export function unplacedFromLayout(doc: WrittenPattern): PartRef[] {
  return pieceRefs(doc).filter((r) => !placementOf(doc, r));
}

/** Piezas que la escena ubicó de forma automática (`placed: false`: sin posición o con un ancla sin resolver). */
export function unplacedFromScene(instances: readonly Pick<SceneInstance, "partId" | "copy" | "placed">[]): PartRef[] {
  return instances.filter((i) => !i.placed).map((i) => ({ part: i.partId, copy: i.copy }));
}

// ---------------------------------------------------------------- topes duros

/** Grados en [−180, 180] (`LIMITS.maxRotationDeg`): 190 pasa a −170. No finito → 0. */
export function wrapDeg(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const max = LIMITS.maxRotationDeg;
  let d = ((((v + max) % (2 * max)) + 2 * max) % (2 * max)) - max;
  if (d === -max && v > 0) d = max; // 180 queda en 180
  return Math.round(d * 10) / 10;
}

const clamp = (v: number, max: number): number => (!Number.isFinite(v) ? 0 : Math.max(-max, Math.min(max, v)));

/** Separación sobre la normal, en cm, dentro de ±`LIMITS.maxOffsetCm` (en décimas de cm). */
export const clampOffset = (v: number): number => Math.round(clamp(v, LIMITS.maxOffsetCm) * 10) / 10;

/** Componente de una posición libre, en cm, dentro de ±`LIMITS.maxPositionCm` (en décimas de cm). */
export const clampPosition = (v: number): number => Math.round(clamp(v, LIMITS.maxPositionCm) * 10) / 10;

const vec = (v: readonly number[] | undefined, f: (x: number) => number): Vec3 => [f(v?.[0] ?? 0), f(v?.[1] ?? 0), f(v?.[2] ?? 0)];

// ---------------------------------------------------------------- vueltas del anfitrión

/** Vueltas concretas del anfitrión: número visible y puntos que produce (del motor). */
export function hostRounds(host: Part): Array<{ number: number; stitches: number }> {
  return concreteRounds(host).map((c) => ({ number: c.number, stitches: c.count.produced }));
}

/** Número visible de la vuelta concreta `roundIndex` (0-based) del anfitrión; null si no existe. */
export function visibleRoundOf(host: Part, roundIndex: number): number | null {
  if (!Number.isInteger(roundIndex) || roundIndex < 0) return null;
  return concreteRounds(host)[roundIndex]?.number ?? null;
}

// ---------------------------------------------------------------- construir ubicaciones

const DEFAULT_SURFACE = { attach: "end" as const, rotationDeg: [0, 0, 0] as Vec3 };

/**
 * Ancla de `target` sobre la vuelta (número visible) y el punto (0-based) del anfitrión. Conserva el extremo, el
 * giro y la separación de la ubicación anterior si era cosida. null si el anfitrión no existe o es la misma pieza.
 */
export function surfacePlacement(doc: WrittenPattern, target: PartRef, host: PartRef, round: number, stitch: number, base?: Placement): Placement | null {
  if (sameRef(target, host)) return null;
  const hostPart = doc.parts.find((p) => p.id === host.part);
  if (!hostPart || !Number.isInteger(host.copy) || host.copy < 0 || host.copy >= copiesOf(hostPart)) return null;
  if (!Number.isInteger(round) || !Number.isInteger(stitch) || stitch < 0) return null;
  const prev = base?.at.type === "surface" ? base.at : undefined;
  const at: SurfaceAt = {
    type: "surface",
    host: { part: host.part, copy: host.copy },
    round,
    stitch,
    attach: prev?.attach ?? DEFAULT_SURFACE.attach,
    rotationDeg: vec(prev?.rotationDeg ?? DEFAULT_SURFACE.rotationDeg, wrapDeg),
  };
  if (prev?.offsetCm !== undefined) at.offsetCm = clampOffset(prev.offsetCm);
  return { target: { part: target.part, copy: target.copy }, at };
}

/** Del toque del visor a la ubicación: número visible con `concreteRounds` y `stitchInRound` tal cual. */
export function surfaceFromPick(doc: WrittenPattern, target: PartRef, pick: PickedStitch, base?: Placement): Placement | null {
  const host = doc.parts.find((p) => p.id === pick.partId);
  if (!host) return null;
  const round = visibleRoundOf(host, pick.roundIndex);
  if (round === null) return null;
  return surfacePlacement(doc, target, { part: pick.partId, copy: pick.copy }, round, pick.stitchInRound, base);
}

/** Pieza libre (la principal): posición en cm y giro en Euler XYZ, acotados. */
export function freePlacement(target: PartRef, positionCm: readonly number[], rotationDeg: readonly number[]): Placement {
  const at: FreeAt = { type: "free", positionCm: vec(positionCm, clampPosition), rotationDeg: vec(rotationDeg, wrapDeg) };
  return { target: { part: target.part, copy: target.copy }, at };
}

/** Cambia el giro, el extremo o la separación de una ubicación cosida (acotados). */
export function withSurface(pl: Placement, patch: { rotationDeg?: readonly number[]; attach?: SurfaceAt["attach"]; offsetCm?: number }): Placement {
  if (pl.at.type !== "surface") return pl;
  const at: SurfaceAt = { ...pl.at, rotationDeg: vec(patch.rotationDeg ?? pl.at.rotationDeg, wrapDeg) };
  if (patch.attach) at.attach = patch.attach;
  if (patch.offsetCm !== undefined) {
    const o = clampOffset(patch.offsetCm);
    if (o === 0) delete at.offsetCm;
    else at.offsetCm = o;
  }
  return { target: pl.target, at };
}
