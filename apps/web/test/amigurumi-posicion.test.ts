/**
 * Posicionado y armado del estudio amigurumi (T16 de la fase 4; decisión 3; ADR 0011, secciones 2 y 9, enmiendas
 * C-17 y T10-4a a T10-4e; ADR 0010, T10-2, T10-4 y T11-1), sin DOM ni WebGL:
 * - acciones `setPlacement`, `clearPlacement` y `setAssembly` del almacén, con un paso de deshacer por gesto;
 * - del toque (`roundIndex` 0-based y `stitchInRound`) al número visible de `SurfaceAt.round`, con rangos "V5–9";
 * - topes duros de `LIMITS` en giros, separación y posición libre;
 * - **propiedad** (con semilla): un ancla puesta con `pick` vuelve al mismo punto al reconstruir la escena, y el
 *   marco del ancla sale de `surfaceFrame` con la malla del anfitrión (el mismo que usa `buildScene`);
 * - "Dónde va cada pieza" de `describeWritten` dice la misma vuelta que el documento (forma C-17).
 */
import {
  concreteRounds,
  LIMITS,
  parsePart,
  partProfile,
  SCHEMA_VERSION,
  shapeMetrics,
  validatePattern,
  type Part,
  type Placement,
  type WrittenPattern,
  type Yarn,
} from "@loopitalab/pattern-core";
import { describeWritten } from "@loopitalab/pattern-render";
import { buildScene, type SceneInstance } from "@loopitalab/viewer-3d";
import { stitchLocation } from "@loopitalab/viewer-3d/three";
import { describe, expect, it } from "vitest";
import { anchorWorldFrame, targetAnchorFrame } from "@/lib/amigurumi/anchor.ts";
import {
  clampOffset,
  clampPosition,
  freePlacement,
  hostRounds,
  modeOf,
  pieceRefs,
  placementOf,
  surfaceFromPick,
  surfacePlacement,
  unplacedFromLayout,
  unplacedFromScene,
  visibleRoundOf,
  withSurface,
  wrapDeg,
} from "@/lib/amigurumi/placement.ts";
import { WrittenStore } from "@/lib/amigurumi/store.ts";

const GAUGE = { stitchesPer10cm: 20, rowsPer10cm: 24 };
const METRICS = shapeMetrics(GAUGE, { assumed: false, gaugeStitch: "sc" });
const metrics = () => METRICS;
const YARNS: Yarn[] = [
  { id: "A", weight: 3, composition: [{ fiber: "algodon", percent: 100 }], color: { hex: "#E9DDBE", paletteId: "crudo" } },
  { id: "D", weight: 3, composition: [{ fiber: "acrilico", percent: 100 }], color: { hex: "#EC9DB0", paletteId: "rosado" } },
];

function part(text: string, id: string): Part {
  const r = parsePart(text, { id });
  if (!r.ok) throw new Error(`${id}: ${JSON.stringify(r.issues)}`);
  return r.value;
}

function pattern(parts: Part[], extra: Partial<WrittenPattern> = {}): WrittenPattern {
  return { schemaVersion: SCHEMA_VERSION, id: "t16", title: "Armado", technique: "crochet", kind: "written", yarns: YARNS, gauge: { ...GAUGE }, origin: { kind: "manual" }, parts, ...extra };
}

const HEAD = part(
  ["Parte: Cabeza", "Inicio: AM", "Construcción: espiral", "Lana: A", "V1: 6 pb en AM (6)", "V2: aum x6 (12)", "V3: [pb, aum] x6 (18)", "V4: [pb 2, aum] x6 (24)", "V5-9: 24 pb (24)", "V10: [pb 2, dism] x6 (18)", "V11: [pb, dism] x6 (12)", "V12: dism x6 (6)"].join("\n"),
  "cabeza",
);
const EAR = part(["Parte: Oreja", "Cantidad: 2", "Inicio: AM", "Construcción: espiral", "Lana: D", "V1: 6 pb en AM (6)", "V2: aum x6 (12)", "V3-4: 12 pb (12)"].join("\n"), "oreja");
const PANEL = part(["Parte: Panel", "Inicio: cad 13", "Construcción: hileras", "Lana: A", "H1: 12 pb (12)", "H2-8: 12 pb (12)"].join("\n"), "panel");

const EAR0 = { part: "oreja", copy: 0 };
const EAR1 = { part: "oreja", copy: 1 };
const HEAD0 = { part: "cabeza", copy: 0 };

const surface = (target = EAR0, round = 10, stitch = 3): Placement => ({ target, at: { type: "surface", host: HEAD0, round, stitch, attach: "end", rotationDeg: [0, 0, 0] } });

describe("acciones de posición y armado del almacén", () => {
  it("setPlacement, clearPlacement y setAssembly son un paso de deshacer cada uno", () => {
    const s = new WrittenStore(pattern([HEAD, EAR]));
    expect(s.dispatch({ type: "setPlacement", placement: surface() })).toBe(true);
    expect(placementOf(s.doc, EAR0)?.at).toMatchObject({ type: "surface", round: 10, stitch: 3 });
    const cleared = s.run({ type: "clearPlacement", ref: EAR0 });
    expect(cleared.changed).toBe(true);
    expect(cleared.unplaced).toEqual([EAR0]);
    expect(s.doc.layout).toBeUndefined();
    expect(s.dispatch({ type: "setAssembly", steps: ["  Cose las orejas.  ", "", "Rellena."] })).toBe(true);
    expect(s.doc.assembly).toEqual(["Cose las orejas.", "Rellena."]);

    s.undo();
    expect(s.doc.assembly).toBeUndefined();
    s.undo();
    expect(placementOf(s.doc, EAR0)?.at.type).toBe("surface");
    s.undo();
    expect(s.doc.layout).toBeUndefined();
    expect(s.getState().canUndo).toBe(false);
  });

  it("sin cambios no hay historial: quitar una posición que no existe, los mismos pasos, la misma ubicación", () => {
    const s = new WrittenStore(pattern([HEAD, EAR], { assembly: ["Uno."] }));
    expect(s.run({ type: "clearPlacement", ref: EAR0 })).toMatchObject({ changed: false, unplaced: [] });
    expect(s.dispatch({ type: "setAssembly", steps: ["Uno."] })).toBe(false);
    s.dispatch({ type: "setPlacement", placement: surface() });
    expect(s.dispatch({ type: "setPlacement", placement: surface() })).toBe(false);
    s.undo();
    expect(s.getState().canUndo).toBe(false);
  });

  it("una ubicación que dejaría un error estructural no entra (ciclo, anfitrión inexistente, giro fuera de tope)", () => {
    const s = new WrittenStore(pattern([HEAD, EAR]));
    s.dispatch({ type: "setPlacement", placement: surface(EAR0) });
    // La cabeza cosida a la oreja que está cosida a ella: ciclo.
    const cycle: Placement = { target: HEAD0, at: { type: "surface", host: EAR0, round: 2, stitch: 0, attach: "end", rotationDeg: [0, 0, 0] } };
    expect(s.dispatch({ type: "setPlacement", placement: cycle })).toBe(false);
    expect(s.dispatch({ type: "setPlacement", placement: { ...surface(EAR1), at: { ...(surface(EAR1).at as object), host: { part: "nada", copy: 0 } } as Placement["at"] } })).toBe(false);
    expect(s.dispatch({ type: "setPlacement", placement: { ...surface(EAR1), at: { ...(surface(EAR1).at as object), rotationDeg: [400, 0, 0] } as Placement["at"] } })).toBe(false);
  });

  it("un gesto (arrastrar un giro) es un solo paso de deshacer", () => {
    const s = new WrittenStore(pattern([HEAD, EAR]));
    s.dispatch({ type: "setPlacement", placement: surface() });
    s.beginStroke();
    for (const deg of [5, 10, 15, 20, 25]) s.dispatch({ type: "setPlacement", placement: withSurface(placementOf(s.doc, EAR0)!, { rotationDeg: [deg, 0, 0] }) });
    s.endStroke();
    expect(placementOf(s.doc, EAR0)?.at.rotationDeg).toEqual([25, 0, 0]);
    s.undo();
    expect(placementOf(s.doc, EAR0)?.at.rotationDeg).toEqual([0, 0, 0]);
  });
});

describe("del toque al número visible (roundIndex 0-based → SurfaceAt.round)", () => {
  it("con un rango V5–9: cada vuelta concreta da su número visible", () => {
    // Vueltas concretas: V1, V2, V3, V4, V5…V9 (índices 4 a 8), V10, V11, V12.
    expect([0, 3, 4, 5, 8, 9, 11].map((i) => visibleRoundOf(HEAD, i))).toEqual([1, 4, 5, 6, 9, 10, 12]);
    expect(visibleRoundOf(HEAD, 12)).toBeNull();
    expect(visibleRoundOf(HEAD, -1)).toBeNull();
    expect(visibleRoundOf(HEAD, 1.5)).toBeNull();
    // Igual que `concreteRounds` del motor.
    concreteRounds(HEAD).forEach((c, i) => expect(visibleRoundOf(HEAD, i)).toBe(c.number));
  });

  it("surfaceFromPick guarda el número visible y stitchInRound tal cual; conserva el extremo, el giro y la separación", () => {
    const doc = pattern([HEAD, EAR]);
    const pl = surfaceFromPick(doc, EAR0, { partId: "cabeza", copy: 0, roundIndex: 6, stitchInRound: 17 });
    expect(pl).toEqual({ target: EAR0, at: { type: "surface", host: HEAD0, round: 7, stitch: 17, attach: "end", rotationDeg: [0, 0, 0] } });
    const base: Placement = { target: EAR0, at: { type: "surface", host: HEAD0, round: 2, stitch: 0, attach: "start", rotationDeg: [30, -10, 5], offsetCm: -0.2 } };
    expect(surfaceFromPick(doc, EAR0, { partId: "cabeza", copy: 0, roundIndex: 9, stitchInRound: 2 }, base)?.at).toEqual({
      type: "surface",
      host: HEAD0,
      round: 10,
      stitch: 2,
      attach: "start",
      rotationDeg: [30, -10, 5],
      offsetCm: -0.2,
    });
  });

  it("no se cose a sí misma, ni a una copia o vuelta que no existe", () => {
    const doc = pattern([HEAD, EAR]);
    expect(surfaceFromPick(doc, EAR0, { partId: "oreja", copy: 0, roundIndex: 1, stitchInRound: 0 })).toBeNull();
    expect(surfaceFromPick(doc, EAR0, { partId: "oreja", copy: 1, roundIndex: 1, stitchInRound: 0 })?.at).toMatchObject({ host: EAR1, round: 2 });
    expect(surfaceFromPick(doc, EAR0, { partId: "cabeza", copy: 0, roundIndex: 40, stitchInRound: 0 })).toBeNull();
    expect(surfacePlacement(doc, EAR0, { part: "cabeza", copy: 1 }, 3, 0)).toBeNull();
    expect(surfacePlacement(doc, EAR0, { part: "nada", copy: 0 }, 3, 0)).toBeNull();
  });

  it("hostRounds da el número visible y los puntos de cada vuelta concreta (del motor)", () => {
    const r = hostRounds(HEAD);
    expect(r.length).toBe(12);
    expect(r[6]).toEqual({ number: 7, stitches: 24 });
    expect(r.at(-1)).toEqual({ number: 12, stitches: 6 });
    expect(hostRounds(PANEL)[0]).toEqual({ number: 1, stitches: 12 });
  });
});

describe("topes duros de LIMITS", () => {
  it("giros en [−180, 180], separación y posición acotadas", () => {
    expect(wrapDeg(190)).toBe(-170);
    expect(wrapDeg(-190)).toBe(170);
    expect(wrapDeg(180)).toBe(180);
    expect(wrapDeg(-180)).toBe(-180);
    expect(wrapDeg(540)).toBe(180);
    expect(wrapDeg(Number.NaN)).toBe(0);
    expect(clampOffset(500)).toBe(LIMITS.maxOffsetCm);
    expect(clampOffset(-0.26)).toBe(-0.3);
    expect(clampPosition(-5000)).toBe(-LIMITS.maxPositionCm);
    expect(freePlacement(HEAD0, [1, 2, 3000], [0, 200, 0]).at).toEqual({ type: "free", positionCm: [1, 2, LIMITS.maxPositionCm], rotationDeg: [0, -160, 0] });
    expect(withSurface(surface(), { offsetCm: 0 }).at).not.toHaveProperty("offsetCm");
    expect(withSurface(surface(), { offsetCm: 1000, attach: "start" }).at).toMatchObject({ offsetCm: LIMITS.maxOffsetCm, attach: "start" });
    const doc = pattern([HEAD, EAR]);
    for (const p of [freePlacement(HEAD0, [9999, 0, 0], [999, 0, 0]), withSurface(surface(), { rotationDeg: [721, -999, 3], offsetCm: 1e9 })]) {
      expect(validatePattern(pattern([HEAD, EAR], { layout: { placements: [p] } })).savable, JSON.stringify(p)).toBe(true);
    }
    expect(doc.layout).toBeUndefined();
  });

  it("modos y piezas sin ubicar (de la escena y, sin escena, del layout)", () => {
    const doc = pattern([HEAD, EAR], { layout: { placements: [freePlacement(HEAD0, [0, 0, 0], [0, 0, 0]), surface(EAR0)] } });
    expect(pieceRefs(doc)).toEqual([HEAD0, EAR0, EAR1]);
    expect([HEAD0, EAR0, EAR1].map((r) => modeOf(doc, r))).toEqual(["free", "surface", "auto"]);
    expect(unplacedFromLayout(doc)).toEqual([EAR1]);
    const scene = buildScene({ pattern: doc, metrics });
    expect(unplacedFromScene(scene.instances)).toEqual([EAR1]);
    // Un ancla sin resolver (anfitrión que no existe, documento no `savable`) también queda sin ubicar.
    const broken = { ...doc, layout: { placements: [...doc.layout!.placements, { ...surface(EAR1), at: { ...(surface(EAR1).at as object), host: { part: "nada", copy: 0 } } } as Placement] } };
    expect(unplacedFromScene(buildScene({ pattern: broken, metrics }).instances)).toEqual([EAR1]);
  });
});

// ---------------------------------------------------------------- propiedad: el ancla vuelve al mismo punto

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Parte en espiral al azar, con aumentos, disminuciones y rangos ("V5-8"). El motor la lee y la cuenta. */
function randomSpiral(rand: () => number, id: string): Part {
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  let prev = int(5, 8);
  const lines = [`Parte: Pieza ${id}`, "Inicio: AM", "Construcción: espiral", "Lana: A", `V1: ${prev} pb en AM (${prev})`];
  let n = 2;
  const rounds = int(4, 14);
  for (let k = 0; k < rounds; k++) {
    const op = rand();
    if (op < 0.4 && prev < 60) {
      const d = int(1, Math.min(prev, 8));
      lines.push(`V${n}: ${[`aum x${d}`, prev - d > 0 ? `${prev - d} pb` : ""].filter(Boolean).join(", ")} (${prev + d})`);
      prev += d;
      n++;
    } else if (op < 0.65 && prev >= 8) {
      const d = int(1, Math.min(Math.floor(prev / 2), prev - 6));
      lines.push(`V${n}: ${[`dism x${d}`, prev - 2 * d > 0 ? `${prev - 2 * d} pb` : ""].filter(Boolean).join(", ")} (${prev - d})`);
      prev -= d;
      n++;
    } else {
      const len = int(1, 4);
      lines.push(len === 1 ? `V${n}: ${prev} pb (${prev})` : `V${n}-${n + len - 1}: ${prev} pb (${prev})`);
      n += len;
    }
  }
  return part(lines.join("\n"), id);
}

/**
 * Centro (en el mundo de la escena) del borde superior de cada punto de una vuelta concreta del anfitrión: los
 * vértices del punto con v = 1 (`PartMesh.uvs`: 0 abajo, 1 arriba). `Frame.position` es ese centro.
 */
function stitchCentroids(inst: SceneInstance, roundIndex: number): Array<[number, number, number]> {
  const mesh = inst.mesh;
  const from = mesh.roundStart[roundIndex]!;
  const to = mesh.roundStart[roundIndex + 1]!;
  const sum = Array.from({ length: to - from }, () => [0, 0, 0, 0]);
  const seen = new Set<number>();
  for (let t = 0; t < mesh.indexCount / 3; t++) {
    const s = mesh.faceStitch[t]!;
    if (s < from || s >= to) continue;
    for (let k = 0; k < 3; k++) {
      const v = mesh.indices[t * 3 + k]!;
      if (seen.has(v)) continue;
      seen.add(v);
      if (Math.abs(mesh.uvs[v * 2 + 1]! - 1) > 1e-6) continue;
      const acc = sum[s - from]!;
      acc[0]! += mesh.positions[v * 3]!;
      acc[1]! += mesh.positions[v * 3 + 1]!;
      acc[2]! += mesh.positions[v * 3 + 2]!;
      acc[3]! += 1;
    }
  }
  const m = inst.matrix;
  return sum.map(([x = 0, y = 0, z = 0, c = 1]) => {
    const p = [x / c, y / c, z / c];
    return [m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!, m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!, m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!];
  });
}

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

function transform(m: Float32Array, p: readonly number[]): [number, number, number] {
  return [m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!, m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!, m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!];
}

describe("propiedad: un ancla puesta con pick vuelve al mismo punto al reconstruir la escena (semilla)", () => {
  const SEEDS = Array.from({ length: 60 }, (_, i) => 0x7160 + i);

  it.each(SEEDS)("semilla %i", (seed) => {
    const rand = mulberry32(seed);
    const host = seed % 7 === 0 ? PANEL : randomSpiral(rand, "anfitrion");
    const hostRef = { part: host.id, copy: 0 };
    const store = new WrittenStore(pattern([host, EAR]));
    expect(validatePattern(store.doc).savable).toBe(true);
    let scene = buildScene({ pattern: store.doc, metrics });
    const hostInst = scene.instances.find((i) => i.partId === host.id)!;

    // "Tocar": un triángulo al azar del anfitrión, como `renderer.pick` después del rayo.
    const tris = hostInst.mesh.indexCount / 3;
    const tri = Math.floor(rand() * tris);
    const loc = stitchLocation(hostInst.mesh, hostInst.mesh.faceStitch[tri]!)!;
    const target = rand() < 0.5 ? EAR0 : EAR1;
    const attach = rand() < 0.5 ? "end" : "start";
    const offsetCm = Math.round((rand() * 2 - 0.5) * 10) / 10;
    const base: Placement = { target, at: { type: "surface", host: hostRef, round: 1, stitch: 0, attach, rotationDeg: [wrapDeg(rand() * 360), wrapDeg(rand() * 360), 0], ...(offsetCm !== 0 ? { offsetCm } : {}) } };
    const pl = surfaceFromPick(store.doc, target, { partId: host.id, copy: 0, ...loc }, base)!;
    expect(pl.at.type).toBe("surface");
    if (pl.at.type !== "surface") return;
    const number = concreteRounds(host)[loc.roundIndex]!.number;
    expect(pl.at.round).toBe(number);
    expect(pl.at.stitch).toBe(loc.stitchInRound);
    expect(store.dispatch({ type: "setPlacement", placement: pl })).toBe(true);

    // Reconstruir: desde cero y con la caché anterior. El ancla es la misma.
    const fresh = buildScene({ pattern: store.doc, metrics });
    scene = buildScene({ pattern: store.doc, metrics, previous: scene.cache });
    for (const sc of [fresh, scene]) {
      const f = targetAnchorFrame(store.doc, metrics, sc.instances, target)!;
      expect(f.clamped).toBe(false);
      expect(f.round).toBe(number);
      expect(f.stitch).toBe(loc.stitchInRound);
      // El marco cae sobre el punto tocado: de los puntos de esa vuelta, el más cercano es el tocado.
      const centroids = stitchCentroids(sc.instances.find((i) => i.partId === host.id)!, loc.roundIndex);
      const nearest = centroids.reduce((best, c, k) => (dist(c, f.position) < dist(centroids[best]!, f.position) ? k : best), 0);
      expect(nearest, `semilla ${seed}: vuelta ${number}, punto ${loc.stitchInRound}`).toBe(loc.stitchInRound);
      // La pieza va donde dice el ancla: su extremo cosido (inicio u borde abierto) cae en el ancla.
      const inst = sc.instances.find((i) => i.partId === target.part && i.copy === target.copy)!;
      expect(inst.placed).toBe(true);
      const height = partProfile(EAR, METRICS).heightCm;
      const attached = transform(inst.matrix, attach === "start" ? [0, 0, 0] : [0, 0, height]);
      expect(dist(attached, f.anchor)).toBeLessThan(1e-3);
    }
    const a = targetAnchorFrame(store.doc, metrics, fresh.instances, target)!;
    const b = targetAnchorFrame(store.doc, metrics, scene.instances, target)!;
    expect(dist(a.anchor, b.anchor)).toBeLessThan(1e-9);

    // "Dónde va cada pieza" dice la misma vuelta que el documento (forma C-17, sin distancia en puntos).
    const where = describeWritten(store.doc).placements.find((p) => p.part === target.part && p.copy === target.copy)!;
    const prefix = host.construction === "flat" ? "H" : "V";
    const last = concreteRounds(host).at(-1)!.number;
    expect(where.text).toContain(number >= last ? `sobre la ${prefix}${number}, la última` : `entre la ${prefix}${number} y la ${prefix}${number + 1}`);
    expect(where.text).toContain(host.construction === "flat" ? "contando desde la cadeneta base" : "contando desde el anillo mágico");
    expect(where.text).not.toMatch(/a \d+ puntos?|desde el inicio de la vuelta/);
  });

  it("en una vuelta torcida (aumentos juntos, giro por anillo), el marco con la malla del anfitrión cae sobre el punto (T10-2)", () => {
    // Testigo: la vuelta con todos los aumentos juntos gira su anillo; con la malla, el marco sigue al punto.
    const lopsided = part(["Parte: Torcida", "Inicio: AM", "Construcción: espiral", "Lana: A", "V1: 6 pb en AM (6)", "V2: aum x6 (12)", "V3: aum x5, 7 pb (17)", "V4: 17 pb (17)"].join("\n"), "torcida");
    const doc = pattern([lopsided, EAR]);
    const scene = buildScene({ pattern: doc, metrics });
    const inst = scene.instances.find((i) => i.partId === "torcida")!;
    const withMesh = anchorWorldFrame(doc, metrics, scene.instances, { host: { part: "torcida", copy: 0 }, round: 3, stitch: 8 })!;
    const centroids = stitchCentroids(inst, 2);
    const nearest = centroids.reduce((best, c, k) => (dist(c, withMesh.position) < dist(centroids[best]!, withMesh.position) ? k : best), 0);
    expect(nearest).toBe(8);
  });
});

describe("CA4-V3 en el modelo: la oreja cosida en la V10 sigue en la V10 al agregar 4 vueltas a la cabeza", () => {
  it("el documento y el texto dicen la misma vuelta antes y después", () => {
    const s = new WrittenStore(pattern([HEAD, EAR], { layout: { placements: [surface(EAR0, 10, 4)] } }));
    const text = () => describeWritten(s.doc).placements.find((p) => p.part === "oreja" && p.copy === 0)!.text;
    expect(text()).toBe("Oreja (1 de 2): se cose a la pieza «Cabeza», entre la V10 y la V11, contando desde el anillo mágico.");
    for (let k = 0; k < 4; k++) {
      const n = concreteRounds(s.doc.parts[0]!).at(-1)!.number + 1;
      s.dispatch({ type: "insertRound", partId: "cabeza", index: s.doc.parts[0]!.rounds.length, round: { number: n, items: [{ type: "stitch", stitch: "sc", count: 6 }], expected: 6 } });
    }
    expect(concreteRounds(s.doc.parts[0]!).length).toBe(16);
    expect(placementOf(s.doc, EAR0)?.at).toMatchObject({ round: 10, stitch: 4 });
    expect(text()).toBe("Oreja (1 de 2): se cose a la pieza «Cabeza», entre la V10 y la V11, contando desde el anillo mágico.");
    const f = targetAnchorFrame(s.doc, metrics, buildScene({ pattern: s.doc, metrics }).instances, EAR0)!;
    expect([f.round, f.stitch, f.clamped]).toEqual([10, 4, false]);
  });
});
