/**
 * QA de la fase 4 (T19, `qa-tester`): huecos de las propiedades G de `viewer-3d` (T10 y T11).
 *
 * `property.test.ts` genera grupos hasta 2 niveles y muestras de 8 a 30 puntos y 8 a 36 vueltas en 10 cm. Aquí:
 * - G4, G5, G10 y G12 con grupos a toda la profundidad de `LIMITS.maxNesting` (6 niveles), como RT3 en el texto;
 * - las mismas propiedades con muestras extremas (1 a 200 puntos y vueltas en 10 cm) y con partes mínimas (una sola
 *   vuelta, cadeneta inicial de 1, vueltas solo de `ch` o de `sk`, la última vuelta en 0);
 * - G7 con `limit` en cada punto de una vuelta con grupos anidados (el corte nunca cae dentro de un punto).
 *
 *   SEED=7 node --test test/qa-fase4.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIMITS, STITCHES, concreteRounds, expandRound, parsePart, shapeMetrics, validatePattern, type Item, type Part, type StitchCode, type WrittenPattern } from "@loopitalab/pattern-core";
import { buildPartMesh, buildScene, colorizePartMesh, shapeSignature } from "../src/index.ts";
import { reusedRoundsOf } from "../src/mesh.ts";
import { allFinite, assertMeshEqual, assertMeshPrefix, forAll, profileOf, rng as rngFrom, withYarns, type Rng } from "./support/fixtures.ts";

const YARNS = ["A", "B", "C"];
const SHAPE_CODES: StitchCode[] = ["sc", "sc", "sc", "inc", "dec", "hdc", "dc", "tr", "slst", "ch", "sk", "inc3"];

/** Ítems con grupos hasta `levels` niveles de listas; conteos chicos para que la vuelta no explote al repetir. */
function genDeep(r: Rng, levels: number): Item[] {
  const items: Item[] = [];
  for (let i = r.int(1, 2); i > 0; i--) {
    const roll = r.next();
    if (roll < 0.15) items.push({ type: "color", yarn: r.pick(YARNS) });
    else if (roll < 0.6 && levels > 1) items.push({ type: "group", times: r.int(1, 2), items: genDeep(r, levels - 1) });
    else {
      const it: Item = { type: "stitch", stitch: r.pick(SHAPE_CODES), count: r.int(1, 3) };
      if (r.bool(0.15)) it.loop = r.pick(["front", "back"] as const);
      items.push(it);
    }
  }
  return items;
}

/** Profundidad de una lista de ítems (1 = sin grupos). */
const depth = (items: Item[], level = 1): number => Math.max(level, ...items.map((it) => (it.type === "group" ? depth(it.items, level + 1) : level)));

/** Parte de 1 a 8 vueltas con al menos una vuelta a 6 niveles; las tres construcciones y los dos inicios. */
function genDeepPart(r: Rng): Part {
  const construction = r.pick(["spiral", "joined", "flat"] as const);
  const chain = construction === "flat" || r.bool(0.3);
  const rounds = Array.from({ length: r.int(1, 8) }, (_v, i) => ({ number: i + 1, items: genDeep(r, r.int(1, LIMITS.maxNesting)) }));
  const deepest = r.int(0, rounds.length - 1);
  rounds[deepest]!.items = genDeep(r, LIMITS.maxNesting);
  // Garantiza al menos una vuelta a 6 niveles: un grupo de grupos con un punto al fondo.
  let nested: Item[] = [{ type: "stitch", stitch: "sc", count: r.int(1, 3) }];
  for (let k = 1; k < LIMITS.maxNesting; k++) nested = [{ type: "group", times: 1, items: nested }];
  rounds[deepest]!.items.push(...nested);
  return {
    id: "deep",
    name: "Profunda",
    construction,
    start: chain ? { type: "chain", count: r.int(1, 12) } : { type: "magic_ring" },
    startYarn: r.pick(YARNS),
    rounds,
  };
}

const docOf = (part: Part): WrittenPattern => withYarns([part]);

/** Muestra extrema: de 1 a 200 puntos y vueltas en 10 cm, en cualquier punto de la muestra. */
function genExtremeMetrics(r: Rng) {
  const pick = () => (r.bool(0.4) ? r.pick([1, 2, 200, 199]) : r.int(1, 200));
  return shapeMetrics({ stitchesPer10cm: pick(), rowsPer10cm: pick() }, { assumed: r.bool(), gaugeStitch: r.pick(["sc", "hdc", "dc", "tr"] as const) });
}

const totalProduced = (part: Part): number => concreteRounds(part).reduce((s, c) => s + c.count.produced, 0);

function stitchYarns(part: Part): number[] {
  const out: number[] = [];
  for (const c of concreteRounds(part)) {
    for (const s of expandRound(c.round, c.startYarn).stitches) {
      if (!Object.hasOwn(STITCHES, s.stitch)) continue;
      for (let j = 0; j < STITCHES[s.stitch].produces; j++) out.push(Math.max(0, YARNS.indexOf(s.yarn)));
    }
  }
  return out;
}

/** G4, G5 y G10 sobre una malla. */
function checkMesh(part: Part, metrics: ReturnType<typeof genExtremeMetrics>): void {
  const m = buildPartMesh(part, YARNS, profileOf(part, metrics));
  const total = totalProduced(part);
  assert.equal(m.roundStart.at(-1), total, "G4: puntos de la malla = Σ produced");
  assert.equal(m.roundStart.length, concreteRounds(part).length + 1);
  assert.equal(m.faceStitch.length, m.indexCount / 3);
  const covered = new Uint8Array(total);
  for (const s of m.faceStitch) {
    assert.ok(s < total);
    covered[s] = 1;
  }
  assert.ok(covered.every((x) => x === 1), "G4: todo punto tiene al menos un triángulo");
  for (const i of m.indices) assert.ok(i < m.vertexCount);
  assert.ok(allFinite(m.positions) && allFinite(m.normals) && allFinite(m.uvs), "G10: sin NaN ni infinitos");
  const yarns = stitchYarns(part);
  for (let t = 0; t < m.indexCount / 3; t++) {
    const y = yarns[m.faceStitch[t]!];
    for (let k = 0; k < 3; k++) assert.equal(m.yarn[m.indices[t * 3 + k]!], y, "G5");
  }
}

describe("G4, G5 y G10 a toda la profundidad de LIMITS.maxNesting", () => {
  it("propiedad: partes con grupos a 6 niveles, en las tres construcciones", () => {
    let deepest = 0;
    forAll(
      "G-profundidad",
      (r) => ({ part: genDeepPart(r), metrics: genExtremeMetrics(r) }),
      ({ part, metrics }) => {
        if (!validatePattern(docOf(part)).savable) return;
        deepest = Math.max(deepest, ...part.rounds.map((x) => depth(x.items)));
        checkMesh(part, metrics);
        // G10 también para la escena entera.
        const scene = buildScene({ pattern: docOf(part), metrics: () => metrics });
        assert.equal(scene.stitchCount, totalProduced(part));
        assert.ok(scene.instances.every((i) => i.matrix.every(Number.isFinite)));
      },
      250,
    );
    assert.equal(deepest, LIMITS.maxNesting, "el generador llegó a la profundidad completa");
  });

  it("propiedad: muestras extremas y partes mínimas (una vuelta, cad 1, vueltas solo de ch o de sk, última en 0)", () => {
    const MINIMAL = [
      "Inicio: AM\nV1: 1 pb (1)",
      "Inicio: cad 1\nV1: 1 pb (1)",
      "Inicio: cad 1\nConstrucción: cerrada\nV1: 1 pb (1)\nV2: 3 cad (3)",
      "Inicio: cad 2\nConstrucción: hileras\nH1: 1 pb (1)\nH2: 1 saltar (0)",
      "Inicio: AM\nV1: 6 pb (6)\nV2: 6 saltar (0)",
      "Inicio: AM\nV1: 3 cad (3)\nV2: 3 cad, 3 saltar (3)",
      "Inicio: AM\nV1: 6 pb (6)\nV2: [[[[[pb] x1] x1] x1] x1] x6 (6)",
    ];
    forAll(
      "G-extremos",
      (r) => ({ text: r.pick(MINIMAL), construction: r.pick([undefined, "spiral", "joined"] as const), metrics: genExtremeMetrics(r) }),
      ({ text, construction, metrics }) => {
        const r = parsePartOk(text);
        const part = construction && r.construction !== "flat" ? { ...r, construction } : r;
        assert.equal(validatePattern(docOf(part)).savable, true, text);
        checkMesh(part, metrics);
      },
      200,
    );
  });
});

describe("G12 y G7 a toda la profundidad", () => {
  it("propiedad: editar una vuelta anidada y reconstruir con reuse da lo mismo que armar desde cero", () => {
    let applied = 0;
    let cases = 0;
    forAll(
      "G12-profundidad",
      (r) => ({ part: genDeepPart(r), metrics: genExtremeMetrics(r), seed: r.int(0, 1e9) }),
      ({ part, metrics, seed }) => {
        if (!validatePattern(docOf(part)).savable) return;
        const r = rngFrom(seed);
        const old = buildPartMesh(part, YARNS, profileOf(part, metrics));
        const k = r.int(0, part.rounds.length - 1);
        const rounds = part.rounds.map((x) => structuredClone(x));
        rounds[k]!.items = genDeep(r, LIMITS.maxNesting);
        const edited: Part = { ...part, rounds };
        if (!validatePattern(docOf(edited)).savable) return;
        const profile = profileOf(edited, metrics);
        const fromRound = concreteRounds(edited).findIndex((c) => c.sourceIndex >= k);
        const scratch = buildPartMesh(edited, YARNS, profile);
        const reused = buildPartMesh(edited, YARNS, profile, { reuse: { mesh: old, fromRound: fromRound < 0 ? 0 : fromRound } });
        assertMeshEqual(reused, scratch, "G12");
        cases++;
        if (reusedRoundsOf(reused) > 0) applied++;
      },
      250,
    );
    assert.ok(cases > 50 && applied > 0, `reuse se aplicó en ${applied} de ${cases} casos`);
  });

  it("propiedad: G7, el corte con limit en cada punto de la última vuelta es un prefijo exacto de la malla completa", () => {
    forAll(
      "G7-profundidad",
      (r) => ({ part: genDeepPart(r), metrics: genExtremeMetrics(r) }),
      ({ part, metrics }) => {
        if (!validatePattern(docOf(part)).savable) return;
        const profile = profileOf(part, metrics);
        const full = buildPartMesh(part, YARNS, profile);
        const concrete = concreteRounds(part);
        const last = concrete.length - 1;
        const produced = concrete[last]!.count.produced;
        for (let s = 0; s <= produced; s++) {
          const cut = buildPartMesh(part, YARNS, profile, { limit: { roundsDone: last, stitchesDone: s } });
          assert.equal(cut.roundStart.at(-1), full.roundStart[last]! + s, `limit ${s}`);
          assertMeshPrefix(cut, full, `limit ${s}`);
        }
      },
      120,
    );
  });

  it("propiedad: G6 a profundidad completa: recolorear la malla anidada es igual a armarla desde cero", () => {
    forAll(
      "G6-profundidad",
      (r) => ({ part: genDeepPart(r), metrics: genExtremeMetrics(r), seed: r.int(0, 1e9) }),
      ({ part, metrics, seed }) => {
        if (!validatePattern(docOf(part)).savable) return;
        const r = rngFrom(seed);
        const swap = (items: Item[]): Item[] => items.map((it) => (it.type === "color" ? { type: "color", yarn: r.pick(YARNS) } : it.type === "group" ? { ...it, items: swap(it.items) } : it));
        const recolored: Part = { ...part, startYarn: r.pick(YARNS), rounds: part.rounds.map((x) => ({ ...x, items: swap(x.items) })) };
        assert.equal(shapeSignature(recolored), shapeSignature(part));
        const profile = profileOf(part, metrics);
        const mesh = buildPartMesh(part, YARNS, profile);
        colorizePartMesh(mesh, recolored, YARNS);
        assertMeshEqual(mesh, buildPartMesh(recolored, YARNS, profileOf(recolored, metrics)), "G6");
      },
      150,
    );
  });
});


function parsePartOk(text: string): Part {
  const r = parsePart(text, { id: "min" });
  if (!r.ok) throw new Error(`No se lee: ${text}\n${JSON.stringify(r.issues)}`);
  return r.value;
}
