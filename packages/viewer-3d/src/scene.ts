/**
 * Escena de un patrón escrito (ADR 0010, sección 4; ADR 0011, sección 2): una malla por parte,
 * compartida entre sus copias, y una matriz por copia resuelta desde `layout`.
 *
 * - **Caché**: una parte se reconstruye solo si cambió su referencia y su `shapeSignature`
 *   (las operaciones de `pattern-core` son inmutables). Si solo cambiaron las lanas, se
 *   recolorea en el lugar. Si cambió la muestra, se reconstruye. Al reconstruir, se reutiliza
 *   el prefijo de vueltas que no cambió (`reuse`).
 * - **Posiciones**: `FreeAt` en el mundo; `SurfaceAt` con `surfaceFrame` del anfitrión; las
 *   copias sin posición, en fila sobre +x, separadas, en el orden de `parts`.
 */
import { LIMITS, partProfile, type Part, type PartProfile, type Placement, type ShapeMetrics, type SurfaceAt } from "@loopitalab/pattern-core";
import { surfaceFrame } from "./frame.ts";
import { basis, eulerXYZ, finiteOr, identity, multiply, rotationX, rotationY, rotationZ, transformPoint, translation, type Mat4 } from "./mat4.ts";
import { buildPartMesh, colorizePartMesh, reusedRoundsOf, shapeSignature } from "./mesh.ts";
import type { PartMesh, SceneCache, SceneInput, SceneInstance, SceneNote, SceneResult, SceneUpdate } from "./types.ts";

/** Separación entre piezas ubicadas de forma automática, en cm. */
export const AUTO_PLACEMENT_GAP_CM = 2;

interface Entry {
  part: Part;
  metricsKey: string;
  yarnKey: string;
  signature: string | null;
  profile: PartProfile;
  mesh: PartMesh;
}

const STATE = new WeakMap<SceneCache, Map<string, Entry>>();

const metricsKey = (m: ShapeMetrics): string => `${m?.stitchWidthCm}|${m?.roundHeightCm}`;

/** `copies` como lo entiende el modelo (omitido o inválido = 1), con el tope duro del núcleo. */
const copiesOf = (part: Part): number =>
  typeof part.copies === "number" && Number.isInteger(part.copies) && part.copies >= 1 ? Math.min(part.copies, LIMITS.maxCopies) : 1;

interface Slot {
  part: Part;
  entry: Entry;
  copy: number;
  copies: number;
  placement: Placement | undefined;
  matrix: Mat4 | null;
  placed: boolean;
}

const refKey = (part: string, copy: number): string => `${part}\u0000${copy}`;

const label = (s: Slot): string => (s.copies > 1 ? `${s.part.name} (${s.copy + 1} de ${s.copies})` : s.part.name);

export function buildScene(input: SceneInput): SceneResult {
  const pattern = input.pattern;
  const previous = input.previous ? STATE.get(input.previous) : undefined;
  const parts: Part[] = Array.isArray(pattern?.parts) ? pattern.parts : [];
  const yarnIds = (Array.isArray(pattern?.yarns) ? pattern.yarns : []).map((y) => y.id);
  const yarnKey = yarnIds.join("\u0000");
  const next = new Map<string, Entry>();
  const updates: SceneUpdate[] = [];
  const notes: SceneNote[] = [];
  const assumed: string[] = [];

  // 1. Una malla por parte (con caché).
  const entries: Entry[] = parts.map((part) => {
    const metrics = input.metrics(part);
    if (metrics?.assumed) assumed.push(part.id);
    const mKey = metricsKey(metrics);
    const duplicate = next.has(part.id);
    const old = duplicate ? undefined : previous?.get(part.id);
    let entry: Entry;
    if (old && old.part === part && old.metricsKey === mKey && old.yarnKey === yarnKey) {
      entry = old;
      updates.push({ partId: part.id, kind: "kept" });
    } else {
      const signature = shapeSignature(part);
      if (old && old.metricsKey === mKey && (old.signature ?? shapeSignature(old.part)) === signature) {
        const range = colorizePartMesh(old.mesh, part, yarnIds);
        entry = { part, metricsKey: mKey, yarnKey, signature, profile: old.profile, mesh: old.mesh };
        updates.push({ partId: part.id, kind: "recolored", from: range.from, to: range.to });
      } else {
        const profile = partProfile(part, metrics);
        const reuse = old && old.metricsKey === mKey ? { reuse: { mesh: old.mesh, fromRound: Number.MAX_SAFE_INTEGER } } : {};
        const mesh = buildPartMesh(part, yarnIds, profile, reuse);
        entry = { part, metricsKey: mKey, yarnKey, signature, profile, mesh };
        updates.push({ partId: part.id, kind: "built", reusedRounds: reusedRoundsOf(mesh) });
      }
    }
    if (!duplicate) next.set(part.id, entry);
    if (entry.profile.kind === "revolution") strainNotes(part, entry.profile, notes);
    return entry;
  });
  if (assumed.length > 0) {
    notes.unshift({ code: "GAUGE_ASSUMED", message: "Las medidas y la forma usan una muestra supuesta. Teje una muestra con tu lana y tu aguja para comprobarlas.", data: { partIds: assumed } });
  }

  // 2. Una ranura por copia, con su posición del documento si la tiene.
  const slots: Slot[] = [];
  const byRef = new Map<string, Slot>();
  parts.forEach((part, i) => {
    const copies = copiesOf(part);
    for (let copy = 0; copy < copies; copy++) {
      const slot: Slot = { part, entry: entries[i]!, copy, copies, placement: undefined, matrix: null, placed: false };
      slots.push(slot);
      const key = refKey(part.id, copy);
      if (!byRef.has(key)) byRef.set(key, slot);
    }
  });
  const placements = Array.isArray(pattern?.layout?.placements) ? pattern.layout.placements : [];
  for (const pl of placements) {
    const slot = byRef.get(refKey(pl?.target?.part, pl?.target?.copy));
    if (slot && !slot.placement && (pl.at?.type === "free" || pl.at?.type === "surface")) slot.placement = pl;
  }

  // 3. Posiciones libres.
  let rowX = 0;
  let anyFree = false;
  for (const s of slots) {
    if (s.placement?.at.type !== "free") continue;
    const at = s.placement.at;
    const p = at.positionCm ?? [0, 0, 0];
    const r = at.rotationDeg ?? [0, 0, 0];
    s.matrix = multiply(translation(finiteOr(p[0]), finiteOr(p[1]), finiteOr(p[2])), eulerXYZ(finiteOr(r[0]), finiteOr(r[1]), finiteOr(r[2])));
    s.placed = true;
    const maxX = worldMaxX(s.matrix, s.entry.mesh);
    rowX = anyFree ? Math.max(rowX, maxX) : maxX;
    anyFree = true;
  }
  let cursor = anyFree ? rowX + AUTO_PLACEMENT_GAP_CM : 0;
  const autoPlace = (s: Slot): Mat4 => {
    const b = s.entry.mesh.bounds;
    s.matrix = translation(cursor - b.min[0], 0, 0);
    s.placed = false;
    cursor += b.max[0] - b.min[0] + AUTO_PLACEMENT_GAP_CM;
    return s.matrix;
  };

  // 4. Ubicación automática de las copias sin posición.
  for (const s of slots) if (!s.placement) autoPlace(s);

  // 5. Anclas, en orden de dependencia, sin recursión sin tope (ciclo o cadena larga → automática).
  const visiting = new Set<Slot>();
  const resolve = (s: Slot, depth: number): Mat4 => {
    if (s.matrix) return s.matrix;
    const at = s.placement!.at as SurfaceAt;
    const host = byRef.get(refKey(at.host?.part, at.host?.copy));
    const fail = (reason: string): Mat4 => {
      notes.push({ code: "ANCHOR_UNRESOLVED", message: `${label(s)}: no se pudo ubicar donde se cose; el 3D la muestra aparte, a la derecha de las demás piezas.`, partId: s.part.id, copy: s.copy, data: { reason } });
      return autoPlace(s);
    };
    if (!host || host === s) return fail("host");
    if (visiting.has(host)) return fail("cycle");
    if (depth >= LIMITS.maxLayoutDepth) return fail("depth");
    visiting.add(s);
    const hostMatrix = resolve(host, depth + 1);
    visiting.delete(s);
    const frame = surfaceFrame(host.entry.profile, finiteOr(at.round), finiteOr(at.stitch), { mesh: host.entry.mesh });
    if (frame.clamped) {
      notes.push({
        code: "ANCHOR_CLAMPED",
        message: `${label(s)}: la vuelta o el punto donde se cose ya no existe en la pieza «${label(host)}»; el 3D la pone en la vuelta ${frame.round} (la más cercana). Revisa dónde va.`,
        partId: s.part.id,
        copy: s.copy,
        data: { host: { part: host.part.id, copy: host.copy }, round: at.round, stitch: at.stitch, usedRound: frame.round, usedStitch: frame.stitch },
      });
    }
    const offset = finiteOr(at.offsetCm);
    const o = frame.position.map((x, k) => x + frame.normal[k]! * offset);
    const rot = at.rotationDeg ?? [0, 0, 0];
    // Giro en el marco del ancla: [0] sobre la normal, [1] sobre la tangente, [2] sobre el meridiano.
    const local = multiply(multiply(rotationZ(finiteOr(rot[0])), rotationX(finiteOr(rot[1]))), rotationY(finiteOr(rot[2])));
    const attach = at.attach === "start" ? identity() : multiply(rotationX(180), translation(0, 0, -s.entry.profile.heightCm));
    const m = multiply(multiply(multiply(hostMatrix, translation(o[0]!, o[1]!, o[2]!)), multiply(basis(frame.tangent, frame.meridian, frame.normal), local)), attach);
    s.matrix = m;
    s.placed = true;
    return m;
  };
  for (const s of slots) if (!s.matrix) resolve(s, 0);

  // 6. Instancias.
  let stitchCount = 0;
  const instances: SceneInstance[] = slots.map((s) => {
    stitchCount += s.entry.mesh.roundStart[s.entry.mesh.roundStart.length - 1] ?? 0;
    return { partId: s.part.id, copy: s.copy, mesh: s.entry.mesh, matrix: Float32Array.from(s.matrix!), placed: s.placed };
  });

  const cache = Object.freeze({ __sceneCache: true as const });
  STATE.set(cache, next);
  return { instances, cache, notes, stitchCount, updates };
}

function worldMaxX(m: Mat4, mesh: PartMesh): number {
  const { min, max } = mesh.bounds;
  let best = -Infinity;
  for (let i = 0; i < 8; i++) {
    const p = transformPoint(m, [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]);
    if (p[0] > best) best = p[0];
  }
  return best;
}

const STRAIN_EPS = 1e-9;

function strainNotes(part: Part, profile: Extract<PartProfile, { kind: "revolution" }>, notes: SceneNote[]): void {
  const ruffled: number[] = [];
  const gathered: number[] = [];
  for (const ring of profile.rings) {
    if (ring.strain > 1 + STRAIN_EPS) ruffled.push(ring.round);
    else if (ring.strain < 1 - STRAIN_EPS) gathered.push(ring.round);
  }
  // Una sola frase por zona (T18): el detalle vuelta por vuelta lo da el validador del patrón, y esta nota no lo repite.
  // Textos de las notas del 3D: validar con tejedora (T1b, sección "Textos de T18").
  const zone = (r: number[]) => (r[0] === r[r.length - 1] ? `en la vuelta ${r[0]}` : `entre la vuelta ${r[0]} y la ${r[r.length - 1]}`);
  if (ruffled.length > 0) {
    notes.push({ code: "SHAPE_RUFFLES", message: `${part.name}, ${zone(ruffled)}: la pieza aumenta más de lo que la tela puede abrir en plano. El 3D la dibuja lisa; tejida, puede ondularse. Las vueltas con aviso están en la revisión del patrón.`, partId: part.id, data: { rounds: ruffled } });
  }
  if (gathered.length > 0) {
    notes.push({ code: "SHAPE_GATHERS", message: `${part.name}, ${zone(gathered)}: la pieza disminuye más de lo que puede cerrarse en curva. El 3D la dibuja lisa; tejida, puede fruncirse. Las vueltas con aviso están en la revisión del patrón.`, partId: part.id, data: { rounds: gathered } });
  }
}
