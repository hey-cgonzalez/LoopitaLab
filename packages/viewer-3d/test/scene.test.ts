/**
 * `buildScene` (ADR 0010, sección 4; ADR 0011, sección 2): copias que comparten malla (F4-58),
 * anclas `SurfaceAt` con `attach` start y end, posiciones libres, ubicación automática, caché
 * (CA4-P6: una edición reconstruye exactamente una malla) y avisos.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shapeMetrics, type Part, type Placement, type WrittenPattern } from "@loopitalab/pattern-core";
import { AUTO_PLACEMENT_GAP_CM, buildPartMesh, buildScene, surfaceFrame, type SceneInstance } from "../src/index.ts";
import { SHAPE_INTENDED, roundsZone } from "../src/scene.ts";
import { METRICS, assertMeshEqual, fixtureAPart, profileOf, readPart, roundPieceText, withYarns } from "./support/fixtures.ts";

const metrics = () => METRICS;

const apply = (m: Float32Array, p: readonly number[]): number[] => [0, 1, 2].map((r) => m[r]! * p[0]! + m[4 + r]! * p[1]! + m[8 + r]! * p[2]! + m[12 + r]!);
const applyDir = (m: Float32Array, p: readonly number[]): number[] => [0, 1, 2].map((r) => m[r]! * p[0]! + m[4 + r]! * p[1]! + m[8 + r]! * p[2]!);
const close = (a: readonly number[], b: readonly number[], eps = 1e-4) => a.every((x, i) => Math.abs(x - b[i]!) < eps);

const head = (): Part => readPart(roundPieceText("Cabeza", 6, 8, 8), "cabeza");
const ear = (): Part => ({ ...readPart(roundPieceText("Oreja", 6, 2, 3), "oreja"), copies: 2 });
const arm = (): Part => readPart(roundPieceText("Brazo", 5, 1, 6), "brazo");

const inst = (s: { instances: SceneInstance[] }, partId: string, copy = 0) => s.instances.find((i) => i.partId === partId && i.copy === copy)!;

describe("copias (F4-58)", () => {
  it("dos copias de la oreja comparten la malla y cambian la matriz", () => {
    const s = buildScene({ pattern: withYarns([head(), ear()]), metrics });
    const [a, b] = [inst(s, "oreja", 0), inst(s, "oreja", 1)];
    assert.equal(a.mesh, b.mesh);
    assert.notDeepEqual(a.matrix, b.matrix);
    assert.equal(s.instances.length, 3);
    assert.equal(s.stitchCount, inst(s, "cabeza").mesh.roundStart.at(-1)! + 2 * a.mesh.roundStart.at(-1)!);
  });
});

describe("ubicación automática", () => {
  it("en fila sobre +x, en el orden de las partes, sin superponerse y con placed = false", () => {
    const s = buildScene({ pattern: withYarns([head(), ear(), arm()]), metrics });
    let prevMax = -Infinity;
    for (const i of s.instances) {
      assert.equal(i.placed, false);
      const b = i.mesh.bounds;
      const lo = b.min[0] + i.matrix[12]!;
      const hi = b.max[0] + i.matrix[12]!;
      if (prevMax > -Infinity) assert.ok(Math.abs(lo - prevMax - AUTO_PLACEMENT_GAP_CM) < 1e-4);
      prevMax = hi;
    }
    assert.ok(Math.abs(s.instances[0]!.matrix[12]! + s.instances[0]!.mesh.bounds.min[0]) < 1e-6);
  });

  it("con una pieza libre, la fila empieza a su derecha", () => {
    const pattern = withYarns([head(), arm()], { layout: { placements: [{ target: { part: "cabeza", copy: 0 }, at: { type: "free", positionCm: [10, 0, 0], rotationDeg: [0, 0, 0] } }] } });
    const s = buildScene({ pattern, metrics });
    const h = inst(s, "cabeza");
    const a = inst(s, "brazo");
    assert.equal(h.placed, true);
    assert.ok(close(apply(h.matrix, [0, 0, 0]), [10, 0, 0]));
    assert.ok(Math.abs(a.matrix[12]! + a.mesh.bounds.min[0] - (10 + h.mesh.bounds.max[0] + AUTO_PLACEMENT_GAP_CM)) < 1e-4);
  });
});

describe("anclas SurfaceAt (ADR 0011)", () => {
  const hostAt = (extra: Record<string, unknown> = {}): WrittenPattern =>
    withYarns([head(), ear()], {
      layout: {
        placements: [
          { target: { part: "cabeza", copy: 0 }, at: { type: "free", positionCm: [0, 0, 0], rotationDeg: [0, 0, 0] } },
          { target: { part: "oreja", copy: 0 }, at: { type: "surface", host: { part: "cabeza", copy: 0 }, round: 14, stitch: 5, attach: "end", rotationDeg: [0, 0, 0], ...extra } as Placement["at"] },
        ],
      },
    });

  it("attach end: la última vuelta de la oreja queda en el ancla y la pieza sale por la normal", () => {
    const s = buildScene({ pattern: hostAt(), metrics });
    const h = inst(s, "cabeza");
    const e = inst(s, "oreja");
    const f = surfaceFrame(profileOf(head()), 14, 5, { mesh: h.mesh });
    const hEar = profileOf(ear()).heightCm;
    assert.equal(e.placed, true);
    assert.ok(close(apply(e.matrix, [0, 0, hEar]), f.position), "el borde abierto en el ancla");
    assert.ok(close(apply(e.matrix, [0, 0, 0]), f.position.map((x, k) => x + f.normal[k]! * hEar)), "el inicio, afuera");
    assert.equal(s.notes.length, 0);
    assert.equal(inst(s, "oreja", 1).placed, false, "la copia sin posición sigue automática");
  });

  it("attach start, separación y giro sobre la normal", () => {
    const s = buildScene({ pattern: hostAt({ attach: "start", offsetCm: 0.5, rotationDeg: [90, 0, 0] }), metrics });
    const f = surfaceFrame(profileOf(head()), 14, 5, { mesh: inst(s, "cabeza").mesh });
    const e = inst(s, "oreja");
    assert.ok(close(apply(e.matrix, [0, 0, 0]), f.position.map((x, k) => x + f.normal[k]! * 0.5)));
    assert.ok(close(applyDir(e.matrix, [0, 0, 1]), f.normal), "crece por la normal; el giro sobre la normal no la mueve");
    assert.ok(close(applyDir(e.matrix, [1, 0, 0]), f.meridian), "90° sobre la normal llevan la tangente al meridiano");
  });

  it("el ancla sigue al anfitrión cuando se mueve", () => {
    const base = hostAt();
    const moved: WrittenPattern = { ...base, layout: { placements: [{ ...base.layout!.placements[0]!, at: { type: "free", positionCm: [5, 2, 1], rotationDeg: [0, 0, 30] } }, base.layout!.placements[1]!] } };
    const a = inst(buildScene({ pattern: base, metrics }), "oreja");
    const sb = buildScene({ pattern: moved, metrics });
    const local = apply(a.matrix, [0, 0, 0]);
    assert.ok(close(apply(inst(sb, "oreja").matrix, [0, 0, 0]), apply(inst(sb, "cabeza").matrix, local)));
  });

  it("una vuelta que ya no existe se acota y se informa (ANCHOR_CLAMPED)", () => {
    const s = buildScene({ pattern: hostAt({ round: 99 }), metrics });
    const note = s.notes.find((n) => n.code === "ANCHOR_CLAMPED");
    assert.ok(note && note.partId === "oreja" && note.copy === 0);
    assert.equal(inst(s, "oreja").placed, true);
  });

  it("un ciclo de anclas (documento armado a mano) no lanza: una pieza queda automática con ANCHOR_UNRESOLVED", () => {
    const pattern = withYarns([head(), arm()], {
      layout: {
        placements: [
          { target: { part: "cabeza", copy: 0 }, at: { type: "surface", host: { part: "brazo", copy: 0 }, round: 3, stitch: 0, attach: "start", rotationDeg: [0, 0, 0] } },
          { target: { part: "brazo", copy: 0 }, at: { type: "surface", host: { part: "cabeza", copy: 0 }, round: 3, stitch: 0, attach: "end", rotationDeg: [0, 0, 0] } },
        ],
      },
    });
    const s = buildScene({ pattern, metrics });
    assert.equal(s.notes.filter((n) => n.code === "ANCHOR_UNRESOLVED").length, 1);
    for (const i of s.instances) assert.ok(i.matrix.every(Number.isFinite));
  });
});

describe("caché (CA4-P6) y actualizaciones", () => {
  const scene = () => withYarns([fixtureAPart(), head(), ear(), arm()]);

  it("sin cambios, ninguna malla se toca y se reutilizan los mismos objetos", () => {
    const p = scene();
    const a = buildScene({ pattern: p, metrics });
    const b = buildScene({ pattern: p, metrics, previous: a.cache });
    assert.ok(b.updates.every((u) => u.kind === "kept"));
    b.instances.forEach((i, k) => assert.equal(i.mesh, a.instances[k]!.mesh));
  });

  it("CA4-P6: editar una vuelta de una parte reconstruye exactamente 1 malla, reutiliza el prefijo y da lo mismo que desde cero", () => {
    const p = scene();
    const a = buildScene({ pattern: p, metrics });
    const body = structuredClone(p.parts[0]!);
    const idx = body.rounds.findIndex((r) => r.number === 33);
    body.rounds[idx] = { ...body.rounds[idx]!, items: [{ type: "stitch", stitch: "sc", count: 42 }], expected: 42 };
    const b = buildScene({ pattern: { ...p, parts: [body, ...p.parts.slice(1)] }, metrics, previous: a.cache });
    const built = b.updates.filter((u) => u.kind === "built");
    assert.equal(built.length, 1);
    assert.equal(built[0]!.partId, "cuerpo");
    assert.ok(built[0]!.kind === "built" && built[0]!.reusedRounds >= 30, "copia las vueltas de antes de la V33");
    assertMeshEqual(inst(b, "cuerpo").mesh, buildPartMesh(body, ["A", "B", "C"], profileOf(body)));
    assert.equal(inst(b, "cabeza").mesh, inst(a, "cabeza").mesh);
  });

  it("cambiar solo una lana recolorea en el lugar (sin reconstruir)", () => {
    const p = scene();
    const a = buildScene({ pattern: p, metrics });
    const body = structuredClone(p.parts[0]!);
    body.rounds[12]!.items = [{ type: "color", yarn: "B" }, ...body.rounds[12]!.items];
    const b = buildScene({ pattern: { ...p, parts: [body, ...p.parts.slice(1)] }, metrics, previous: a.cache });
    const u = b.updates.find((x) => x.partId === "cuerpo")!;
    assert.ok(u.kind === "recolored" && u.to > u.from);
    assert.equal(inst(b, "cuerpo").mesh, inst(a, "cuerpo").mesh);
    assertMeshEqual(inst(b, "cuerpo").mesh, buildPartMesh(body, ["A", "B", "C"], profileOf(body)));
    assert.equal(b.updates.filter((x) => x.kind !== "kept").length, 1);
  });

  it("reordenar las lanas del patrón recolorea todas; cambiar la muestra reconstruye todas", () => {
    const p = scene();
    const a = buildScene({ pattern: p, metrics });
    const b = buildScene({ pattern: { ...p, yarns: [...p.yarns].reverse() }, metrics, previous: a.cache });
    assert.ok(b.updates.every((u) => u.kind === "recolored"));
    const c = buildScene({ pattern: p, metrics: () => shapeMetrics({ stitchesPer10cm: 18, rowsPer10cm: 22 }, { assumed: false, gaugeStitch: "sc" }), previous: b.cache });
    assert.ok(c.updates.every((u) => u.kind === "built" && u.reusedRounds === 0));
  });

  it("quitar una parte la saca de la escena y de la caché", () => {
    const p = scene();
    const a = buildScene({ pattern: p, metrics });
    const b = buildScene({ pattern: { ...p, parts: p.parts.slice(1) }, metrics, previous: a.cache });
    assert.ok(!b.instances.some((i) => i.partId === "cuerpo"));
    const c = buildScene({ pattern: p, metrics, previous: b.cache });
    assert.equal(c.updates.find((u) => u.partId === "cuerpo")!.kind, "built");
  });
});

describe("avisos de la escena", () => {
  it("muestra supuesta (GAUGE_ASSUMED) y ondulación (SHAPE_RUFFLES)", () => {
    const ruffle = readPart(["Parte: Volado", "Inicio: AM", "Construcción: espiral", "Lana: A", "V1: 6 pb (6)", "V2: aum x6 (12)", "V3: aum x12 (24)", "V4: aum x24 (48)"].join("\n"), "volado");
    const s = buildScene({ pattern: withYarns([ruffle]), metrics: () => ({ ...METRICS, assumed: true }) });
    assert.ok(s.notes.some((n) => n.code === "GAUGE_ASSUMED"));
    const r = s.notes.find((n) => n.code === "SHAPE_RUFFLES");
    assert.ok(r && Array.isArray(r.data?.rounds) && (r.data.rounds as number[]).includes(4));
    assert.ok(!s.notes.some((n) => n.code === "SHAPE_GATHERS"));
  });

  it("C3 (T21): la muestra supuesta pide comprobar con la lana y el ganchillo, no con la aguja", () => {
    const s = buildScene({ pattern: withYarns([fixtureAPart()]), metrics: () => ({ ...METRICS, assumed: true }) });
    const g = s.notes.find((n) => n.code === "GAUGE_ASSUMED");
    assert.equal(g?.message, "Las medidas y la forma usan una muestra supuesta. Teje una muestra con tu lana y tu ganchillo para comprobarlas.");
    assert.ok(!/aguja/.test(g!.message));
  });

  it("C4 (T21): la zona agrupa las vueltas con aviso en tramos contiguos", () => {
    assert.equal(roundsZone([4]), "en la vuelta 4");
    assert.equal(roundsZone([3, 4, 5]), "entre la vuelta 3 y la 5");
    assert.equal(roundsZone([3, 5]), "en las vueltas 3 y 5");
    assert.equal(roundsZone([3, 4, 6]), "en las vueltas 3 a 4 y 6");
    assert.equal(roundsZone([2, 3, 4, 7, 9, 10]), "en las vueltas 2 a 4, 7 y 9 a 10");
    assert.equal(roundsZone([5, 3, 3]), "en las vueltas 3 y 5", "ordena y no repite");
    assert.equal(roundsZone([1, 3, 5, 7, 9, 11]), "en las vueltas 1, 3, 5, 7 y 2 tramos más");
    assert.equal(roundsZone([1, 3, 5, 7, 9]), "en las vueltas 1, 3, 5, 7 y 1 tramo más");
    assert.equal(roundsZone([]), "");
  });

  it("C4 (T21): dos zonas que ondulan separadas por una meseta no se nombran como un solo tramo, y los dos avisos cierran con «ignora este aviso»", () => {
    const lines = ["Parte: Volado", "Inicio: AM", "Construcción: espiral", "Lana: A", "V1: 6 pb (6)", "V2: aum x6 (12)", "V3: aum x12 (24)", "V4-9: 24 pb (24)", "V10: aum x24 (48)", "V11-16: 48 pb (48)"];
    const s = buildScene({ pattern: withYarns([readPart(lines.join("\n"), "volado")]), metrics });
    const r = s.notes.find((n) => n.code === "SHAPE_RUFFLES")!;
    const rounds = r.data!.rounds as number[];
    assert.ok(rounds.includes(3) && rounds.includes(10));
    assert.ok(rounds.some((x, i) => i > 0 && x !== rounds[i - 1]! + 1), `se esperaban vueltas no contiguas: ${rounds}`);
    assert.ok(r.message.startsWith(`Volado, ${roundsZone(rounds)}: `));
    assert.ok(r.message.includes("en las vueltas "), r.message);
    assert.ok(!r.message.includes("entre la vuelta"), r.message);
    assert.ok(r.message.endsWith(` ${SHAPE_INTENDED}`));
    assert.equal(SHAPE_INTENDED, "Si es lo que buscas (volante, pétalo, remate), ignora este aviso.");

    const close = readPart(["Parte: Remate", "Inicio: AM", "Construcción: espiral", "Lana: A", "V1: 6 pb (6)", "V2: aum x6 (12)", "V3: [pb, aum] x6 (18)", "V4: dism x9 (9)"].join("\n"), "remate");
    const g = buildScene({ pattern: withYarns([close]), metrics }).notes.find((n) => n.code === "SHAPE_GATHERS")!;
    assert.ok(g, "dism x9 sobre 18 frunce");
    assert.ok(g.message.startsWith("Remate, en la vuelta 4: "), g.message);
    assert.ok(g.message.endsWith(` ${SHAPE_INTENDED}`));
  });

  it("el fixture A no da avisos de forma", () => {
    const s = buildScene({ pattern: withYarns([fixtureAPart()]), metrics });
    assert.deepEqual(s.notes, []);
  });
});
