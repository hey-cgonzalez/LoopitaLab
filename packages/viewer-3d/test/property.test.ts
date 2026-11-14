/**
 * Propiedades G4 a G13 del ADR 0010 (sección 9), con semilla (ADR 0002), sobre documentos v2
 * `savable` al azar del generador de `pattern-core` (aumentos, disminuciones, grupos, rangos,
 * colores, hebras, cadenas, saltos, las tres construcciones, copias y anclas) y muestras al azar.
 * G1 a G3 son de `partProfile` y viven en `pattern-core`.
 *
 *   SEED=7 node --test test/property.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STITCHES, concreteRounds, expandRound, partDimensions, recommendedLimitUsage, type Item, type Part, type StitchCode, type WrittenPattern } from "@loopitalab/pattern-core";
import { buildPartMesh, buildScene, colorizePartMesh, profileToSvg, shapeSignature, surfaceFrame, type PartMesh } from "../src/index.ts";
import { reusedRoundsOf } from "../src/mesh.ts";
import { METRICS, allFinite, assertMeshEqual, assertMeshPrefix, fixtureAPart, fixtureBPart, forAll, genMetrics, genSavable, profileOf, readPart, roundPieceText, type Rng } from "./support/fixtures.ts";

const YARNS = ["A", "B", "C"];
const CODES = Object.keys(STITCHES) as StitchCode[];

interface Case {
  doc: WrittenPattern;
  metrics: ReturnType<typeof genMetrics>;
}

const genCase = (r: Rng): Case => ({ doc: genSavable(r), metrics: genMetrics(r) });

const meshOf = (part: Part, m = METRICS): PartMesh => buildPartMesh(part, YARNS, profileOf(part, m));

const totalProduced = (part: Part): number => concreteRounds(part).reduce((s, c) => s + c.count.produced, 0);

/** Lana (índice en YARNS) de cada punto global, recorriendo `expandRound` como el motor. */
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

function genItems(r: Rng, depth = 0): Item[] {
  const n = r.int(1, 4);
  const items: Item[] = [];
  for (let i = 0; i < n; i++) {
    const roll = r.next();
    if (roll < 0.12) items.push({ type: "color", yarn: r.pick(YARNS) });
    else if (roll < 0.3 && depth < 2) items.push({ type: "group", times: r.int(1, 6), items: genItems(r, depth + 1) });
    else {
      const it: Item = { type: "stitch", stitch: r.pick(CODES), count: r.int(1, 10) };
      if (r.bool(0.15)) it.loop = r.pick(["front", "back"] as const);
      items.push(it);
    }
  }
  return items;
}

/** Cambia solo las lanas: mueve, agrega o quita cambios de color y cambia `startYarn`. */
function recolor(r: Rng, part: Part): Part {
  const strip = (items: Item[]): Item[] =>
    items.flatMap((it): Item[] => {
      if (it.type === "color") return r.bool(0.5) ? [] : [{ type: "color", yarn: r.pick(YARNS) }];
      const out: Item[] = r.bool(0.15) ? [{ type: "color", yarn: r.pick(YARNS) }] : [];
      out.push(it.type === "group" ? { ...it, items: strip(it.items) } : it);
      return out;
    });
  return { ...part, startYarn: r.pick(YARNS), rounds: part.rounds.map((round) => ({ ...round, items: strip(round.items) })) };
}

/** Edita la parte desde la vuelta del documento `k`: otra vuelta, un conteo, agregar o quitar. Devuelve la vuelta concreta editada. */
function editFrom(r: Rng, part: Part): { part: Part; fromRound: number } {
  const rounds = part.rounds.map((x) => structuredClone(x));
  const roll = r.int(0, 3);
  let k = rounds.length === 0 ? 0 : r.int(0, rounds.length - 1);
  if (roll === 0 && rounds.length > 0) rounds[k]!.items = genItems(r);
  else if (roll === 1 && rounds.length > 0) {
    const first = rounds[k]!.items.find((i) => i.type === "stitch");
    if (first && first.type === "stitch") first.count = Math.max(1, first.count + r.pick([-1, 1, 2]));
    else rounds[k]!.items = [...rounds[k]!.items, { type: "stitch", stitch: "sc", count: 1 }];
  } else if (roll === 2) {
    const last = rounds.at(-1);
    const n = (last?.through ?? last?.number ?? 0) + 1;
    rounds.push({ number: n, items: genItems(r) });
    k = rounds.length - 1;
  } else if (rounds.length > 0) {
    rounds.pop();
    k = rounds.length;
  }
  const edited: Part = { ...part, rounds };
  const concrete = concreteRounds(edited);
  const idx = concrete.findIndex((c) => c.sourceIndex >= k);
  return { part: edited, fromRound: idx < 0 ? concrete.length : idx };
}

describe("G4 a G7 y G10: malla de cada parte", () => {
  it("G4: puntos de la malla = Σ produced; cada triángulo apunta a un punto y a vértices existentes; G10: nunca lanza ni da NaN", () => {
    forAll("G4/G10", genCase, ({ doc, metrics }) => {
      for (const part of doc.parts) {
        const m = buildPartMesh(part, YARNS, profileOf(part, metrics));
        const total = totalProduced(part);
        assert.equal(m.roundStart.at(-1), total);
        assert.equal(m.roundStart.length, concreteRounds(part).length + 1);
        assert.equal(m.faceStitch.length, m.indexCount / 3);
        assert.equal(m.positions.length, m.vertexCount * 3);
        const covered = new Uint8Array(total);
        for (const s of m.faceStitch) {
          assert.ok(s < total, `faceStitch ${s} fuera de ${total}`);
          covered[s] = 1;
        }
        assert.ok(covered.every((x) => x === 1), "todo punto producido tiene al menos un triángulo");
        for (const i of m.indices) assert.ok(i < m.vertexCount);
        assert.ok(allFinite(m.positions) && allFinite(m.normals) && allFinite(m.uvs), "sin NaN ni infinitos");
        for (let k = 0; k < 3; k++) assert.ok(Number.isFinite(m.bounds.min[k]!) && Number.isFinite(m.bounds.max[k]!));
      }
    });
  });

  it("G5: todo vértice lleva la lana de su punto según expandRound", () => {
    forAll("G5", genCase, ({ doc, metrics }) => {
      for (const part of doc.parts) {
        const m = buildPartMesh(part, YARNS, profileOf(part, metrics));
        const yarns = stitchYarns(part);
        for (let t = 0; t < m.indexCount / 3; t++) {
          const y = yarns[m.faceStitch[t]!];
          for (let k = 0; k < 3; k++) assert.equal(m.yarn[m.indices[t * 3 + k]!], y);
        }
      }
    });
  });

  it("G6: si solo cambian las lanas (misma shapeSignature), colorizePartMesh deja la malla igual a armarla desde cero", () => {
    forAll("G6", (r) => ({ ...genCase(r), seed: r.int(0, 1e9) }), ({ doc, metrics, seed }) => {
      const r = rngFrom(seed);
      for (const part of doc.parts) {
        const other = recolor(r, part);
        assert.equal(shapeSignature(other), shapeSignature(part));
        const m = buildPartMesh(part, YARNS, profileOf(part, metrics));
        const before = m.positions;
        colorizePartMesh(m, other, YARNS);
        assert.equal(m.positions, before);
        assertMeshEqual(m, buildPartMesh(other, YARNS, profileOf(other, metrics)), "G6");
      }
    });
  });

  it("G7: la malla parcial con `limit` es un prefijo exacto de la completa, cortada en roundStart[roundsDone] + stitchesDone", () => {
    forAll("G7", (r) => ({ ...genCase(r), a: r.int(-2, 45), b: r.int(-3, 90) }), ({ doc, metrics, a, b }) => {
      for (const part of doc.parts) {
        const profile = profileOf(part, metrics);
        const full = buildPartMesh(part, YARNS, profile);
        const partial = buildPartMesh(part, YARNS, profile, { limit: { roundsDone: a, stitchesDone: b } });
        assertMeshPrefix(partial, full, "G7");
        const rounds = full.roundStart.length - 1;
        const rd = Math.min(Math.max(a, 0), rounds);
        const produced = rd < rounds ? full.roundStart[rd + 1]! - full.roundStart[rd]! : 0;
        const sd = Math.min(Math.max(b, 0), produced);
        assert.equal(partial.roundStart.at(-1), full.roundStart[rd]! + sd);
        assert.deepEqual([...partial.roundStart.subarray(0, rd + 1)], [...full.roundStart.subarray(0, rd + 1)]);
      }
    });
  });

  it("G7: el límite completo y el límite cero", () => {
    const part = fixtureAPart();
    const profile = profileOf(part);
    const full = buildPartMesh(part, YARNS, profile);
    assertMeshEqual(buildPartMesh(part, YARNS, profile, { limit: { roundsDone: 39, stitchesDone: 0 } }), full);
    const none = buildPartMesh(part, YARNS, profile, { limit: { roundsDone: 0, stitchesDone: 0 } });
    assert.equal(none.vertexCount, 0);
    // "1/60 pb": el primer punto de la V11.
    const one = buildPartMesh(part, YARNS, profile, { limit: { roundsDone: 10, stitchesDone: 1 } });
    assert.equal(one.roundStart.at(-1), full.roundStart[10]! + 1);
    const upTo10 = buildPartMesh(part, YARNS, profile, { limit: { roundsDone: 10, stitchesDone: 0 } });
    assert.equal(one.vertexCount, upTo10.vertexCount + 4, "un pb más: un cuadrilátero");
    assertMeshPrefix(one, full);
  });
});

/** Rng a partir de una semilla (para derivar cambios dentro de una propiedad). */
function rngFrom(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (min, max) => min + Math.floor(next() * (max - min + 1)), pick: (xs) => xs[Math.floor(next() * xs.length)] as never, bool: (p = 0.5) => next() < p };
}

describe("G8: escena independiente del orden, del título y de las notas", () => {
  it("reordenar partes o cambiar el título o las notas no cambia ninguna malla (con o sin caché)", () => {
    forAll("G8", (r) => ({ ...genCase(r), seed: r.int(0, 1e9) }), ({ doc, metrics, seed }) => {
      const r = rngFrom(seed);
      const parts = [...doc.parts];
      for (let i = parts.length - 1; i > 0; i--) {
        const j = r.int(0, i);
        [parts[i], parts[j]] = [parts[j]!, parts[i]!];
      }
      const other: WrittenPattern = { ...doc, parts, title: `${doc.title} 2`, notes: ["otra nota"] };
      const a = buildScene({ pattern: doc, metrics: () => metrics });
      const b = buildScene({ pattern: other, metrics: () => metrics });
      const byPart = (s: typeof a) => new Map(s.instances.map((i) => [i.partId, i.mesh]));
      const ma = byPart(a);
      for (const [id, mesh] of byPart(b)) assertMeshEqual(mesh, ma.get(id)!, `G8 ${id}`);
      const c = buildScene({ pattern: other, metrics: () => metrics, previous: a.cache });
      assert.ok(c.updates.every((u) => u.kind === "kept"), "con la caché, ninguna malla se toca");
      for (const inst of c.instances) assert.equal(inst.mesh, ma.get(inst.partId));
    });
  });
});

describe("G9: surfaceFrame", () => {
  it("normal unitaria y perpendicular a la tangente y al meridiano; acota sin lanzar; con la malla, cae sobre el punto", () => {
    forAll("G9", (r) => ({ ...genCase(r), round: r.pick([r.int(-5, 60), NaN, Infinity, 1e9, -1e9, 0]), stitch: r.pick([r.int(-5, 100), NaN, -Infinity, 1e12, 0.5]) }), ({ doc, metrics, round, stitch }) => {
      for (const part of doc.parts) {
        const profile = profileOf(part, metrics);
        const mesh = buildPartMesh(part, YARNS, profile);
        for (const f of [surfaceFrame(profile, round, stitch), surfaceFrame(profile, round, stitch, { mesh })]) {
          const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
          assert.ok(Math.abs(Math.hypot(...f.normal) - 1) < 1e-9, "normal unitaria");
          assert.ok(Math.abs(Math.hypot(...f.tangent) - 1) < 1e-9, "tangente unitaria");
          assert.ok(Math.abs(dot(f.normal, f.tangent)) < 1e-9, "normal ⊥ tangente");
          assert.ok(Math.abs(dot(f.normal, f.meridian)) < 1e-9, "normal ⊥ meridiano");
          assert.ok(f.position.every(Number.isFinite));
          const rows = profile.kind === "revolution" ? profile.rings.map((x) => x.round) : [0, ...profile.rows.map((x) => x.row)];
          if (!rows.includes(round)) assert.equal(f.clamped, true, "una vuelta que no existe se acota");
          assert.ok(rows.length === 0 || rows.includes(f.round));
        }
      }
    });
  });

  it("con la malla, el marco está sobre el borde superior del punto pedido", () => {
    for (const part of [fixtureAPart(), fixtureBPart(), readPart(roundPieceText("U", 6, 5, 3, { joined: true }))]) {
      const profile = profileOf(part);
      const mesh = buildPartMesh(part, YARNS, profile);
      assert.ok(profile.kind === "revolution");
      const pairs = ([[4, 0], [10, 7], [20, 33], [profile.rings.length - 2, 2]] as const).filter(([c, k]) => c + 1 < profile.rings.length && k < profile.rings[c + 1]!.stitches);
      assert.ok(pairs.length >= 3);
      for (const [c, k] of pairs) {
        const ring = profile.rings[c + 1]!;
        const f = surfaceFrame(profile, ring.round, k, { mesh });
        assert.equal(f.clamped, false);
        const s = mesh.roundStart[c]! + k;
        // Centro del borde de arriba del punto s: promedio de sus dos vértices de tope.
        const tops = new Set<number>();
        for (let t = 0; t < mesh.indexCount / 3; t++) if (mesh.faceStitch[t] === s) for (let q = 0; q < 3; q++) tops.add(mesh.indices[t * 3 + q]!);
        const top = [...tops].filter((v) => mesh.uvs[v * 2 + 1] === 1);
        assert.equal(top.length, 2);
        const mid = [0, 1, 2].map((q) => (mesh.positions[top[0]! * 3 + q]! + mesh.positions[top[1]! * 3 + q]!) / 2);
        const angle = (p: readonly number[]) => Math.atan2(p[1]!, p[0]!);
        let d = Math.abs(angle(mid) - angle(f.position));
        if (d > Math.PI) d = 2 * Math.PI - d;
        assert.ok(d < 1e-5, `ángulo del ancla ${angle(f.position)} frente a ${angle(mid)}`);
        assert.ok(Math.abs(Math.hypot(f.position[0], f.position[1]) - ring.radiusCm) < 1e-9);
        assert.ok(Math.abs(f.position[2] - mid[2]!) <= ring.heightCm, "a la altura del tope (± el alto de una vuelta en espiral)");
      }
    }
  });
});

describe("G10: ninguna función lanza con documentos savable", () => {
  it("buildScene, profileToSvg y colorizePartMesh con documentos y muestras al azar", () => {
    forAll("G10", genCase, ({ doc, metrics }) => {
      const s = buildScene({ pattern: doc, metrics: () => metrics });
      for (const i of s.instances) assert.ok(allFinite(i.matrix), "matriz finita");
      buildScene({ pattern: doc, metrics: () => metrics, previous: s.cache });
      for (const part of doc.parts) {
        const profile = profileOf(part, metrics);
        const svg = profileToSvg(profile, { fill: "#112233", title: part.name });
        assert.ok(svg.startsWith("<svg") && !svg.includes("NaN"));
        colorizePartMesh(buildPartMesh(part, YARNS, profile), part, ["C", "B", "A"]);
      }
    });
  });
});

describe("G11: partDimensions coincide con bounds (± el alto de una vuelta)", () => {
  function check(part: Part, m = METRICS): void {
    const profile = profileOf(part, m);
    const mesh = buildPartMesh(part, YARNS, profile);
    const dims = partDimensions(profile);
    const s = profile.kind === "revolution" ? Math.max(0, ...profile.rings.map((x) => x.heightCm)) : Math.max(0, ...profile.rows.map((x) => x.heightCm));
    const { min, max } = mesh.bounds;
    assert.ok(Math.abs(max[2] - min[2] - dims.heightCm) <= s + 1e-5, `alto ${max[2] - min[2]} frente a ${dims.heightCm}`);
    if (profile.kind === "panel") {
      assert.ok(Math.abs(max[0] - min[0] - dims.widthCm) <= 1e-5);
      return;
    }
    // Diámetro: el radio de los vértices llega al máximo del perfil; la caja, salvo el muestreo del polígono.
    let maxR = 0;
    for (let v = 0; v < mesh.vertexCount; v++) maxR = Math.max(maxR, Math.hypot(mesh.positions[v * 3]!, mesh.positions[v * 3 + 1]!));
    assert.ok(Math.abs(2 * maxR - dims.widthCm) <= 1e-4, `diámetro ${2 * maxR} frente a ${dims.widthCm}`);
    const widest = profile.rings.reduce((a, b) => (b.radiusCm > a.radiusCm ? b : a));
    const sampling = widest.radiusCm * (1 - Math.cos(Math.PI / Math.max(1, widest.stitches)));
    const box = Math.max(max[0] - min[0], max[1] - min[1]);
    assert.ok(box <= dims.widthCm + 1e-4 && box >= dims.widthCm - sampling - s - 1e-4, `caja ${box} frente a ${dims.widthCm}`);
  }

  it("fixtures A y B, piezas redondas al azar y paneles", () => {
    check(fixtureAPart());
    check(fixtureBPart());
    forAll("G11", (r) => ({ b: r.int(3, 9), m: r.int(1, 8), p: r.int(0, 12), joined: r.bool(), chain: r.bool(0.3), metrics: genMetrics(r) }), ({ b, m, p, joined, chain, metrics }) => {
      check(readPart(roundPieceText("R", b, m, p, { joined, chain })), metrics);
      check(readPart(`Parte: P\nInicio: cad ${b * m + 1}\nConstrucción: hileras\nLana: A\nH1-${p + 1}: ${b * m} pb (${b * m})`), metrics);
    });
  });
});

describe("G12: reuse desde la vuelta editada es igual a armar desde cero", () => {
  it("editar, agregar o quitar vueltas y reconstruir con reuse da la misma malla", () => {
    let applied = 0;
    let cases = 0;
    forAll("G12", (r) => ({ ...genCase(r), seed: r.int(0, 1e9) }), ({ doc, metrics, seed }) => {
      const r = rngFrom(seed);
      for (const part of doc.parts) {
        const old = buildPartMesh(part, YARNS, profileOf(part, metrics));
        const { part: edited, fromRound } = editFrom(r, part);
        const profile = profileOf(edited, metrics);
        const scratch = buildPartMesh(edited, YARNS, profile);
        const reused = buildPartMesh(edited, YARNS, profile, { reuse: { mesh: old, fromRound } });
        assertMeshEqual(reused, scratch, "G12 fromRound");
        cases++;
        if (reusedRoundsOf(reused) > 0) applied++;
        // Una cota de más no cambia el resultado: se verifica qué vueltas siguen iguales.
        assertMeshEqual(buildPartMesh(edited, YARNS, profile, { reuse: { mesh: old, fromRound: 1e9 } }), scratch, "G12 cota de más");
        // Con `limit`, también.
        const limit = { roundsDone: r.int(0, 30), stitchesDone: r.int(0, 20) };
        assertMeshEqual(buildPartMesh(edited, YARNS, profile, { limit, reuse: { mesh: old, fromRound } }), buildPartMesh(edited, YARNS, profile, { limit }), "G12 limit");
      }
    });
    // La propiedad tiene que ejercitar la copia del prefijo, no solo el camino que la ignora.
    assert.ok(applied >= cases / 4, `reuse se aplicó en ${applied} de ${cases} casos`);
  });

  it("si reuse no es aplicable (otra parte, otra muestra, otras lanas, fromRound fuera de rango), se ignora", () => {
    const a = fixtureAPart();
    const b = fixtureBPart();
    const pa = profileOf(a);
    const scratch = buildPartMesh(a, YARNS, pa);
    const big = profileOf(a, { ...METRICS, stitchWidthCm: METRICS.stitchWidthCm * 1.1 });
    for (const reuse of [
      { mesh: buildPartMesh(b, YARNS, profileOf(b)), fromRound: 20 },
      { mesh: buildPartMesh(a, YARNS, big), fromRound: 20 },
      { mesh: buildPartMesh(a, ["B", "A"], pa), fromRound: 20 },
      { mesh: scratch, fromRound: -3 },
      { mesh: scratch, fromRound: NaN },
      { mesh: structuredClone(scratch), fromRound: 20 },
    ]) {
      assertMeshEqual(buildPartMesh(a, YARNS, pa, { reuse }), scratch);
    }
  });

  it("editar la V35 del fixture A copia las vueltas de antes", () => {
    const a = fixtureAPart();
    const old = buildPartMesh(a, YARNS, profileOf(a));
    const edited: Part = structuredClone(a);
    const idx = edited.rounds.findIndex((x) => x.number === 35);
    edited.rounds[idx]!.items = [{ type: "color", yarn: "B" }, ...edited.rounds[idx]!.items];
    const p = profileOf(edited);
    const c = concreteRounds(edited).findIndex((x) => x.number === 35);
    const reused = buildPartMesh(edited, YARNS, p, { reuse: { mesh: old, fromRound: c } });
    assertMeshEqual(reused, buildPartMesh(edited, YARNS, p));
    assert.equal(reusedRoundsOf(reused), c, "copia todas las vueltas anteriores a la V35");
    // Las vueltas de antes son las mismas: la malla nueva comparte sus bytes con la vieja hasta la V34.
    assert.deepEqual(reused.positions.subarray(0, 100), old.positions.subarray(0, 100));
  });
});

describe("G13: stitchCount de buildScene = sceneStitches de recommendedLimitUsage", () => {
  it("con copias, anclas y documentos al azar", () => {
    forAll("G13", genCase, ({ doc, metrics }) => {
      const s = buildScene({ pattern: doc, metrics: () => metrics });
      const usage = recommendedLimitUsage(doc).find((u) => u.limit === "sceneStitches")!;
      assert.equal(s.stitchCount, usage.value);
      assert.equal(s.stitchCount, s.instances.reduce((acc, i) => acc + i.mesh.roundStart.at(-1)!, 0));
      assert.equal(s.instances.length, doc.parts.reduce((acc, p) => acc + (p.copies ?? 1), 0));
    });
  });
});
