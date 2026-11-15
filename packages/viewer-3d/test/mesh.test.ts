/**
 * `buildPartMesh`, `colorizePartMesh` y `shapeSignature` (ADR 0010, sección 3): topología por
 * punto con `inc`, `inc3` y `dec` de punto bajo (C-12), hebra trasera sin quebrar la forma
 * (C-7), hueco de `cad` + `saltar` (F4-28), espiral frente a vueltas unidas (F4-10), hileras y
 * borradores que no cuadran.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { concreteRounds, type Item, type Part } from "@loopitalab/pattern-core";
import { LOOP_BACK, LOOP_BOTH, buildPartMesh, colorizePartMesh, shapeSignature, type PartMesh } from "../src/index.ts";
import { allFinite, assertMeshEqual, fixtureAPart, fixtureBPart, profileOf, readPart, roundPieceText } from "./support/fixtures.ts";

const mesh = (part: Part, yarns: readonly string[] = ["A", "B", "C"]): PartMesh => buildPartMesh(part, yarns, profileOf(part));

/** Vértices de la vuelta concreta `c` (los puntos de una vuelta son contiguos). */
function roundVertices(m: PartMesh, c: number): number[] {
  const out = new Set<number>();
  for (let t = 0; t < m.indexCount / 3; t++) {
    const s = m.faceStitch[t]!;
    if (s >= m.roundStart[c]! && s < m.roundStart[c + 1]!) for (let k = 0; k < 3; k++) out.add(m.indices[t * 3 + k]!);
  }
  return [...out].sort((a, b) => a - b);
}

const vertexCountOf = (m: PartMesh, c: number): number => roundVertices(m, c).length;

const angleOf = (m: PartMesh, v: number): number => {
  const a = Math.atan2(m.positions[v * 3 + 1]!, m.positions[v * 3]!);
  return a < -1e-6 ? a + 2 * Math.PI : Math.max(0, a);
};

/** Normal geométrica del triángulo `t` (sin normalizar). */
function faceNormal(m: PartMesh, t: number): [number, number, number] {
  const p = (k: number) => [0, 1, 2].map((i) => m.positions[m.indices[t * 3 + k]! * 3 + i]!) as [number, number, number];
  const [a, b, c] = [p(0), p(1), p(2)];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
}

/**
 * Los triángulos miran hacia el mismo lado que la normal analítica de sus vértices. Se mide por
 * área: con el giro por anillo (`ringPhase`) solo puede quedar alguna astilla casi degenerada
 * donde una vuelta empinada sale del disco del anillo mágico (fixture B: 5e-6 del área; sin el
 * giro era el 1,6 %).
 */
function assertWindingMatchesNormals(m: PartMesh, label: string, maxFlipped = 1e-4): void {
  let total = 0;
  let flipped = 0;
  for (let t = 0; t < m.indexCount / 3; t++) {
    const n = faceNormal(m, t);
    const area = Math.hypot(...n) / 2;
    total += area;
    const v = m.indices[t * 3]!;
    const dot = n[0] * m.normals[v * 3]! + n[1] * m.normals[v * 3 + 1]! + n[2] * m.normals[v * 3 + 2]!;
    if (dot <= 0) flipped += area;
  }
  assert.ok(total > 0, `${label}: sin triángulos`);
  assert.ok(flipped / total <= maxFlipped, `${label}: ${((100 * flipped) / total).toFixed(3)} % del área mira hacia adentro`);
}

const near = (m: PartMesh, v: number, w: number): boolean =>
  Math.hypot(m.positions[v * 3]! - m.positions[w * 3]!, m.positions[v * 3 + 1]! - m.positions[w * 3 + 1]!, m.positions[v * 3 + 2]! - m.positions[w * 3 + 2]!) < 1e-5;

describe("topología por punto (ADR 0010, sección 3; C-12)", () => {
  it("fixture A: 1.800 puntos, un triángulo por lo menos por punto y vértices propios", () => {
    const part = fixtureAPart();
    const m = mesh(part);
    assert.equal(m.roundStart.at(-1), 1800);
    assert.equal(m.roundStart.length, concreteRounds(part).length + 1);
    // 6 pb (24 v) · aum x6 (6 × 8) · [k pb, aum] x6 · 60 pb · [k pb, dism] x6 · dism x6 (6 × 5).
    assert.equal(vertexCountOf(m, 0), 24);
    assert.equal(vertexCountOf(m, 1), 48);
    assert.equal(vertexCountOf(m, 2), 6 * (4 + 8));
    assert.equal(vertexCountOf(m, 10), 240);
    assert.equal(vertexCountOf(m, 38), 30);
    const seen = new Uint8Array(1800);
    for (const s of m.faceStitch) seen[s] = 1;
    assert.ok(seen.every((x) => x === 1), "cada punto tiene al menos un triángulo");
    assert.equal(m.vertexCount, m.positions.length / 3);
  });

  it("pb = cuadrilátero; aum = 2 cuadriláteros (abanico 1 → 2); aum3 = 3; dism = pentágono (2 → 1); cad = triángulo", () => {
    const part = readPart(["Parte: T", "Inicio: cad 4", "Construcción: cerrada", "Lana: A", "V1: 4 pb (4)", "V2: aum, aum3, pb, pb (7)", "V3: dism, 5 pb (6)", "V4: cad 2, 6 pb (8)"].join("\n"));
    const m = mesh(part);
    assert.equal(vertexCountOf(m, 0), 16);
    assert.equal(vertexCountOf(m, 1), 8 + 12 + 4 + 4);
    assert.equal(vertexCountOf(m, 2), 5 + 20);
    assert.equal(vertexCountOf(m, 3), 3 + 3 + 24);
    // Triángulos: pb 2, mitad de aum 2, dism 3, cad 1.
    const trisOf = (s: number) => [...m.faceStitch].filter((x) => x === s).length;
    assert.equal(trisOf(0), 2);
    assert.equal(trisOf(m.roundStart[1]!), 2);
    assert.equal(trisOf(m.roundStart[2]!), 3);
    assert.equal(trisOf(m.roundStart[3]!), 1);
    // El aumento comparte el punto medio de la base entre sus dos puntos.
    const s = m.roundStart[1]!;
    const tris = (x: number) => [...m.faceStitch.keys()].filter((t) => m.faceStitch[t] === x).flatMap((t) => [0, 1, 2].map((k) => m.indices[t * 3 + k]!));
    const bottomZ = (vs: number[]) => vs.filter((v) => m.uvs[v * 2 + 1] === 0);
    const aRight = bottomZ(tris(s)).map((v) => angleOf(m, v));
    const bLeft = bottomZ(tris(s + 1)).map((v) => angleOf(m, v));
    assert.ok(Math.abs(Math.max(...aRight) - Math.min(...bLeft)) < 1e-6, "las dos mitades del aum se tocan en la base");
    assert.ok(allFinite(m.positions) && allFinite(m.normals) && allFinite(m.uvs));
  });

  it("la vuelta siguiente cierra contra la anterior: cada vértice de arriba de una vuelta tiene encima un vértice de la base de la siguiente", () => {
    for (const part of [fixtureAPart(), fixtureBPart()]) {
      const m = mesh(part);
      for (let c = 1; c < m.roundStart.length - 1; c++) {
        const top = roundVertices(m, c - 1).filter((v) => m.uvs[v * 2 + 1] === 1);
        const bottom = roundVertices(m, c).filter((v) => m.uvs[v * 2 + 1] === 0);
        for (const w of top) assert.ok(bottom.some((v) => near(m, v, w)), `V${c + 1}: queda una grieta sobre el vértice ${w} de la V${c}`);
      }
    }
  });

  it("los triángulos miran hacia afuera (fixtures A y B, en espiral y unidas)", () => {
    for (const [label, part] of [["A", fixtureAPart()], ["B", fixtureBPart()], ["unida", readPart(roundPieceText("U", 6, 6, 4, { joined: true }))], ["cadeneta", readPart(roundPieceText("C", 8, 3, 3, { chain: true }))]] as const) {
      assertWindingMatchesNormals(mesh(part), label);
    }
  });

  it("normales unitarias", () => {
    const m = mesh(fixtureBPart());
    for (let v = 0; v < m.vertexCount; v++) assert.ok(Math.abs(Math.hypot(m.normals[v * 3]!, m.normals[v * 3 + 1]!, m.normals[v * 3 + 2]!) - 1) < 1e-5);
  });
});

describe("F4-28: hueco para un brazo (cad 4, saltar 4)", () => {
  const part = readPart(["Parte: Cuerpo", "Inicio: AM", "Construcción: espiral", "Lana: A", "V1: 7 pb en AM (7)", "V2: aum x7 (14)", "V3: 14 pb (14)", "V4: 5 pb, cad 4, saltar 4, 5 pb (14)", "V5: 14 pb (14)"].join("\n"));
  const m = mesh(part);

  it("la vuelta cuadra y produce 14: las 4 cad son puntos (base de ancho 0) y saltar no tiene geometría", () => {
    assert.equal(m.roundStart[4]! - m.roundStart[3]!, 14);
    for (let k = 5; k < 9; k++) {
      const s = m.roundStart[3]! + k;
      const tris = [...m.faceStitch.keys()].filter((t) => m.faceStitch[t] === s);
      assert.equal(tris.length, 1, "una cad dentro de la vuelta es un triángulo");
    }
  });

  it("ningún punto de la V4 se apoya dentro del tramo saltado: queda el hueco", () => {
    const step = (2 * Math.PI) / 14;
    const bottom = roundVertices(m, 3).filter((v) => m.uvs[v * 2 + 1] === 0).map((v) => angleOf(m, v));
    const inside = bottom.filter((a) => a > 5 * step + 1e-4 && a < 9 * step - 1e-4);
    assert.deepEqual(inside, []);
    // Las cad se apoyan en la posición 5, donde termina el último pb.
    const chBases = [5, 6, 7, 8].map((k) => roundVertices(m, 3).find((v) => m.faceStitch.includes(m.roundStart[3]! + k) && m.uvs[v * 2] === 0.5 && m.uvs[v * 2 + 1] === 0));
    for (const v of chBases) assert.ok(v !== undefined && Math.abs(angleOf(m, v) - 5 * step) < 1e-5);
  });
});

describe("F4-10: mismo conteo en espiral y en vueltas unidas", () => {
  const spiral = readPart(roundPieceText("S", 6, 5, 3));
  const joined: Part = { ...spiral, construction: "joined" };

  it("el perfil es el mismo; la malla en espiral sube Δz × k / n dentro de la vuelta y las unidas son anillos planos", () => {
    const ps = profileOf(spiral);
    const pj = profileOf(joined);
    assert.ok(ps.kind === "revolution" && pj.kind === "revolution");
    assert.deepEqual(ps.rings, pj.rings);
    const ms = buildPartMesh(spiral, ["A"], ps);
    const mj = buildPartMesh(joined, ["A"], pj);
    assert.equal(ms.vertexCount, mj.vertexCount);
    assert.deepEqual(ms.indices, mj.indices);
    const zs = new Set(pj.rings.map((r) => Math.fround(r.zCm)));
    for (let v = 0; v < mj.vertexCount; v++) assert.ok(zs.has(mj.positions[v * 3 + 2]!), "en vueltas unidas, cada vértice está a la altura de su anillo");
    // En espiral, el tope del primer punto de la V7 está a la altura del anillo 6 y el del último, en el 7.
    const c = 6;
    const tops = roundVertices(ms, c).filter((v) => ms.uvs[v * 2 + 1] === 1);
    const z = tops.map((v) => ms.positions[v * 3 + 2]!);
    const dz = ps.rings[c + 1]!.zCm - ps.rings[c]!.zCm;
    assert.ok(dz > 0);
    assert.ok(Math.abs(Math.min(...z) - ps.rings[c]!.zCm) < 1e-5, "empieza en la altura del anillo anterior");
    assert.ok(Math.abs(Math.max(...z) - ps.rings[c + 1]!.zCm) < 1e-5, "termina en la altura de su anillo");
    // Las posiciones xy coinciden: solo cambia la altura.
    for (let v = 0; v < ms.vertexCount; v++) {
      assert.ok(Math.abs(ms.positions[v * 3]! - mj.positions[v * 3]!) < 1e-6 && Math.abs(ms.positions[v * 3 + 1]! - mj.positions[v * 3 + 1]!) < 1e-6);
    }
  });
});

describe("C-7: la hebra trasera no cambia la forma, solo marca el borde", () => {
  it("mismas posiciones y normales; `loop` = LOOP_BACK en los vértices de esa vuelta", () => {
    const base = fixtureAPart();
    const back: Part = structuredClone(base);
    const idx = back.rounds.findIndex((r) => r.number === 11);
    const setLoop = (items: Item[]): void => items.forEach((it) => (it.type === "stitch" ? (it.loop = "back") : it.type === "group" ? setLoop(it.items) : undefined));
    setLoop(back.rounds[idx]!.items);
    const a = mesh(base);
    const b = buildPartMesh(back, ["A", "B", "C"], profileOf(back));
    assert.deepEqual(profileOf(back), profileOf(base));
    assert.deepEqual(b.positions, a.positions);
    assert.deepEqual(b.normals, a.normals);
    assert.notEqual(shapeSignature(back), shapeSignature(base), "la hebra es parte de la forma de los puntos");
    const c = concreteRounds(back).findIndex((r) => r.number === 11);
    for (const v of roundVertices(b, c)) assert.equal(b.loop[v], LOOP_BACK);
    for (const v of roundVertices(b, c - 1)) assert.equal(b.loop[v], LOOP_BOTH);
  });
});

describe("inicio y remate", () => {
  it("anillo mágico: la V1 sale del centro; la última vuelta queda abierta", () => {
    const m = mesh(fixtureAPart());
    const bottoms = roundVertices(m, 0).filter((v) => m.uvs[v * 2 + 1] === 0);
    for (const v of bottoms) assert.equal(Math.hypot(m.positions[v * 3]!, m.positions[v * 3 + 1]!), 0);
    const last = roundVertices(m, 38).filter((v) => m.uvs[v * 2 + 1] === 1);
    assert.ok(last.every((v) => Math.hypot(m.positions[v * 3]!, m.positions[v * 3 + 1]!) > 0.1), "la V39 de 6 puntos deja un agujero (sin cerrar)");
  });

  it("cadeneta en aro: el anillo 0 tiene el radio de la cadeneta", () => {
    const part = readPart(roundPieceText("C", 10, 2, 2, { chain: true }));
    const p = profileOf(part);
    assert.ok(p.kind === "revolution");
    const m = buildPartMesh(part, ["A"], p);
    const bottoms = roundVertices(m, 0).filter((v) => m.uvs[v * 2 + 1] === 0);
    for (const v of bottoms) assert.ok(Math.abs(Math.hypot(m.positions[v * 3]!, m.positions[v * 3 + 1]!) - p.rings[0]!.radiusCm) < 1e-5);
  });
});

describe("hileras (panel plano)", () => {
  const part = readPart(["Parte: Panel", "Inicio: cad 6", "Construcción: hileras", "Lana: A", "H1: @B, pb, @A, 4 pb (5)", "H2: @C, pb, @A, 4 pb (5)", "H3: 5 pb (5)"].join("\n"));
  const m = mesh(part);

  it("filas centradas a la altura acumulada, mirando hacia −y", () => {
    const p = profileOf(part);
    assert.ok(p.kind === "panel");
    for (let v = 0; v < m.vertexCount; v++) {
      assert.equal(m.positions[v * 3 + 1], 0);
      assert.deepEqual([...m.normals.subarray(v * 3, v * 3 + 3)], [0, -1, 0]);
    }
    assert.ok(Math.abs(m.bounds.max[2] - p.heightCm) < 1e-6);
    assert.ok(Math.abs(m.bounds.max[0] - m.bounds.min[0] - p.maxWidthCm) < 1e-6);
    assertWindingMatchesNormals(m, "panel");
  });

  it("las filas impares van de derecha a izquierda: el primer punto de cada fila queda donde se tejió", () => {
    const xOfStitch = (s: number) => {
      const t = [...m.faceStitch.keys()].find((k) => m.faceStitch[k] === s)!;
      const vs = [0, 1, 2].map((k) => m.indices[t * 3 + k]!);
      return vs.reduce((acc, v) => acc + m.positions[v * 3]!, 0) / 3;
    };
    assert.ok(xOfStitch(m.roundStart[0]!) < 0, "H1 empieza a la izquierda (lana B)");
    assert.ok(xOfStitch(m.roundStart[1]!) > 0, "H2 empieza a la derecha (lana C)");
    assert.equal(m.yarn[roundVertices(m, 0)[0]!], 1);
    assert.equal(m.yarn[roundVertices(m, 1)[0]!], 2);
  });
});

describe("borradores (ADR 0011, sección 4)", () => {
  it("una vuelta que no consume lo que dejó la anterior reparte la base en proporción y cierra", () => {
    const part = readPart(["Parte: B", "Inicio: AM", "Construcción: espiral", "Lana: A", "V1: 6 pb (6)", "V2: aum x6 (12)", "V3: 8 pb (8)", "V4: 10 pb"].join("\n"));
    const m = mesh(part);
    assert.equal(m.roundStart.at(-1), 6 + 12 + 8 + 10);
    const bottoms = roundVertices(m, 2).filter((v) => m.uvs[v * 2 + 1] === 0).map((v) => angleOf(m, v));
    assert.ok(Math.abs(Math.max(...bottoms) - 2 * Math.PI) < 1e-5 || bottoms.some((a) => a === 0), "la V3 se apoya en toda la vuelta");
    assert.ok(allFinite(m.positions) && allFinite(m.normals));
  });

  it("una vuelta de 0 puntos y una vuelta solo de cadenas no lanzan ni dan NaN", () => {
    const part = readPart(["Parte: Z", "Inicio: AM", "Construcción: espiral", "Lana: A", "V1: 6 pb (6)", "V2: saltar 6", "V3: cad 5", "V4: 5 pb"].join("\n"));
    const m = mesh(part);
    assert.equal(m.roundStart.at(-1), 6 + 0 + 5 + 5);
    assert.ok(allFinite(m.positions) && allFinite(m.normals) && allFinite(m.uvs));
  });

  it("una parte sin vueltas da una malla vacía", () => {
    const part: Part = { id: "v", name: "Vacía", construction: "spiral", start: { type: "magic_ring" }, startYarn: "A", rounds: [] };
    const m = mesh(part);
    assert.equal(m.vertexCount, 0);
    assert.deepEqual([...m.roundStart], [0]);
    assert.deepEqual(m.bounds, { min: [0, 0, 0], max: [0, 0, 0] });
  });
});

describe("colorizePartMesh y shapeSignature", () => {
  it("cambiar solo la lana deja la firma igual y recolorea en el lugar, con el rango de lo que cambió", () => {
    const a = readPart(roundPieceText("P", 6, 5, 4));
    const b: Part = structuredClone(a);
    b.rounds[3]!.items = [{ type: "color", yarn: "B" }, ...b.rounds[3]!.items];
    assert.equal(shapeSignature(a), shapeSignature(b));
    const m = mesh(a);
    const positions = m.positions;
    const range = colorizePartMesh(m, b, ["A", "B", "C"]);
    assert.equal(m.positions, positions, "no toca las posiciones");
    assertMeshEqual(m, mesh(b));
    const firstB = roundVertices(m, 3)[0]!;
    assert.equal(range.from, firstB, "empieza en la vuelta del cambio de color");
    assert.equal(range.to, m.vertexCount, "la lana sigue hasta el final");
    assert.deepEqual(colorizePartMesh(m, b, ["A", "B", "C"]), { from: 0, to: 0 }, "sin cambios, rango vacío");
  });

  it("reordenar las lanas recolorea sin cambiar la forma", () => {
    const a = readPart(roundPieceText("P", 6, 4, 2));
    const m = mesh(a, ["A", "B"]);
    assert.ok(m.yarn.every((y) => y === 0));
    colorizePartMesh(m, a, ["B", "A"]);
    assert.ok(m.yarn.every((y) => y === 1));
  });

  it("cambiar un conteo, la construcción o el inicio cambia la firma", () => {
    const a = readPart(roundPieceText("P", 6, 4, 2));
    assert.notEqual(shapeSignature({ ...a, construction: "joined" }), shapeSignature(a));
    assert.notEqual(shapeSignature({ ...a, start: { type: "chain", count: 6 } }), shapeSignature(a));
    const b = structuredClone(a);
    b.rounds[0]!.items = [{ type: "stitch", stitch: "sc", count: 7 }];
    assert.notEqual(shapeSignature(b), shapeSignature(a));
  });
});
