import { partProfile, type Part, type PartRef, type ShapeMetrics, type Vec3, type WrittenPattern } from "@loopitalab/pattern-core";
import { surfaceFrame, type Frame, type PartMesh, type SceneInstance } from "@loopitalab/viewer-3d";
import { placementOf } from "./placement.ts";

/*
 * Marco de un ancla en la escena (T16 de la fase 4; ADR 0010, T10-2): siempre `surfaceFrame(perfil, vuelta, punto,
 * { mesh })` con la MALLA del anfitrión, como `buildScene`. Sin la malla, el marco no cae sobre el punto. Lo usan el
 * controlador del visor (vista previa del ancla) y las pruebas; vive aparte de `placement.ts` porque importa
 * `viewer-3d`, que solo se carga con el visor.
 */

// ---------------------------------------------------------------- marco del ancla en el mundo

export interface WorldFrame extends Frame {
  /** Punto donde va la pieza: `position` más la separación sobre la normal. */
  anchor: Vec3;
}

/** Punto por una matriz 4 × 4 en columna mayor. */
function transformPoint(m: ArrayLike<number>, p: readonly number[]): Vec3 {
  const [x = 0, y = 0, z = 0] = p;
  return [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
}

function transformDir(m: ArrayLike<number>, d: readonly number[]): Vec3 {
  const [x = 0, y = 0, z = 0] = d;
  const v: Vec3 = [m[0]! * x + m[4]! * y + m[8]! * z, m[1]! * x + m[5]! * y + m[9]! * z, m[2]! * x + m[6]! * y + m[10]! * z];
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Marco de un ancla en coordenadas de la escena (las de `SceneInstance.matrix`, antes del giro de la raíz del
 * renderer), con el perfil y la MALLA del anfitrión: el mismo cálculo que `buildScene` (T10-2).
 */
export function anchorWorldFrame(
  doc: WrittenPattern,
  metrics: (part: Part) => ShapeMetrics,
  instances: readonly Pick<SceneInstance, "partId" | "copy" | "mesh" | "matrix">[],
  spec: { host: PartRef; round: number; stitch: number; offsetCm?: number },
): WorldFrame | null {
  const hostPart = doc.parts.find((p) => p.id === spec.host.part);
  const inst = instances.find((i) => i.partId === spec.host.part && i.copy === spec.host.copy);
  if (!hostPart || !inst) return null;
  const frame = surfaceFrame(partProfile(hostPart, metrics(hostPart)), spec.round, spec.stitch, { mesh: inst.mesh as PartMesh });
  const position = transformPoint(inst.matrix, frame.position);
  const normal = transformDir(inst.matrix, frame.normal);
  const offset = Number.isFinite(spec.offsetCm) ? (spec.offsetCm as number) : 0;
  return {
    ...frame,
    position,
    normal,
    tangent: transformDir(inst.matrix, frame.tangent),
    meridian: transformDir(inst.matrix, frame.meridian),
    anchor: [position[0] + normal[0] * offset, position[1] + normal[1] * offset, position[2] + normal[2] * offset],
  };
}

/** Marco del ancla de `target` según su ubicación cosida actual; null si no está cosida o falta el anfitrión. */
export function targetAnchorFrame(
  doc: WrittenPattern,
  metrics: (part: Part) => ShapeMetrics,
  instances: readonly Pick<SceneInstance, "partId" | "copy" | "mesh" | "matrix">[],
  target: PartRef,
): WorldFrame | null {
  const at = placementOf(doc, target)?.at;
  if (at?.type !== "surface") return null;
  return anchorWorldFrame(doc, metrics, instances, { host: at.host, round: at.round, stitch: at.stitch, ...(at.offsetCm !== undefined ? { offsetCm: at.offsetCm } : {}) });
}
