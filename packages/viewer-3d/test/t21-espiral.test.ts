/**
 * Revisión de tejido T21 (fase 4), punto de la "lengüeta plana" de la esfera (fixture B).
 *
 * Causa: en espiral, cada anillo era una hélice que solo subía en altura; el radio y el giro
 * quedaban fijos. En la línea de inicio de vuelta el final de una vuelta (radio rᵢ) no se tocaba
 * con el inicio de la siguiente (radio rᵢ₊₁, otro giro): quedaba una ranura por vuelta, de ancho
 * |Δr|. En el ecuador Δr ≈ 0 y no se notaba; en el cierre de la esfera (Δr cercano al alto de la
 * vuelta, Δz chico) las ranuras de las últimas vueltas formaban una tira plana que se veía por
 * dentro (material de dos caras). No era la última vuelta abierta (F4-35) ni las disminuciones.
 *
 * Arreglo (`ringPoint`): la hélice es continua (radio, altura, giro y normal van del anillo
 * anterior al suyo) y el abanico de cada punto parte del vértice de arriba más cercano a la base
 * corrida, para que los puntos muy sesgados (disminuciones juntas) no se den vuelta.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "@loopitalab/pattern-core";
import { buildPartMesh, type PartMesh } from "../src/index.ts";
import { fixtureAPart, fixtureBPart, forAll, genMetrics, profileOf, readPart, type Rng } from "./support/fixtures.ts";

const YARNS = ["A", "B", "C"];

/** Vértices de arriba (izquierda y derecha) de cada punto producido. */
function topsOf(m: PartMesh): { left: Int32Array; right: Int32Array } {
  const total = m.roundStart[m.roundStart.length - 1]!;
  const left = new Int32Array(total).fill(-1);
  const right = new Int32Array(total).fill(-1);
  for (let t = 0; t < m.indexCount / 3; t++) {
    const s = m.faceStitch[t]!;
    for (let k = 0; k < 3; k++) {
      const v = m.indices[t * 3 + k]!;
      if (m.uvs[v * 2 + 1] !== 1) continue;
      if (m.uvs[v * 2] === 0) left[s] = v;
      else if (m.uvs[v * 2] === 1) right[s] = v;
    }
  }
  return { left, right };
}

const pos = (m: PartMesh, v: number): [number, number, number] => [m.positions[v * 3]!, m.positions[v * 3 + 1]!, m.positions[v * 3 + 2]!];
const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

function triangleArea(m: PartMesh, t: number): { area: number; n: [number, number, number] } {
  const [a, b, c] = [0, 1, 2].map((k) => pos(m, m.indices[t * 3 + k]!));
  const u = [b![0] - a![0], b![1] - a![1], b![2] - a![2]];
  const w = [c![0] - a![0], c![1] - a![1], c![2] - a![2]];
  const n: [number, number, number] = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  return { area: Math.hypot(...n) / 2, n };
}

/** Fracción del área cuyos triángulos miran al revés que la normal analítica de sus vértices. */
function flippedFraction(m: PartMesh): number {
  let total = 0;
  let flipped = 0;
  for (let t = 0; t < m.indexCount / 3; t++) {
    const { area, n } = triangleArea(m, t);
    total += area;
    const v = m.indices[t * 3]!;
    if (n[0] * m.normals[v * 3]! + n[1] * m.normals[v * 3 + 1]! + n[2] * m.normals[v * 3 + 2]! <= 0) flipped += area;
  }
  return total > 0 ? flipped / total : 0;
}

/**
 * Propiedad de la hélice continua: en espiral, el vértice de arriba a la derecha del último punto
 * de cada vuelta coincide con el de arriba a la izquierda del primer punto de la siguiente (desde
 * la V2; la V1 se apoya en el inicio). Devuelve la separación más grande.
 */
function maxSpiralGap(m: PartMesh): number {
  const { left, right } = topsOf(m);
  let worst = 0;
  for (let c = 1; c + 1 < m.roundStart.length - 1; c++) {
    const last = m.roundStart[c + 1]! - 1;
    const first = m.roundStart[c + 1]!;
    if (last < m.roundStart[c]! || first >= m.roundStart[c + 2]!) continue;
    worst = Math.max(worst, dist(pos(m, right[last]!), pos(m, left[first]!)));
  }
  return worst;
}

/**
 * Borde de la última vuelta: sin triángulos degenerados y sin auto-intersecciones (visto desde el
 * eje, el borde de arriba avanza siempre en el mismo sentido y da una sola vuelta).
 */
function assertLastRoundBorder(m: PartMesh, label: string, minArea: number): void {
  const R = m.roundStart.length - 1;
  const from = m.roundStart[R - 1]!;
  const to = m.roundStart[R]!;
  assert.ok(to > from, `${label}: la última vuelta no tiene puntos`);
  for (let t = 0; t < m.indexCount / 3; t++) {
    const s = m.faceStitch[t]!;
    if (s < from || s >= to) continue;
    const { area } = triangleArea(m, t);
    assert.ok(area > minArea, `${label}: triángulo degenerado en el punto ${s - from + 1} de la última vuelta (área ${area})`);
  }
  const { left, right } = topsOf(m);
  let turn = 0;
  for (let s = from; s < to; s++) {
    const a = pos(m, left[s]!);
    const b = pos(m, right[s]!);
    const cross = a[0] * b[1] - a[1] * b[0];
    assert.ok(cross > 0, `${label}: el borde de la última vuelta retrocede en el punto ${s - from + 1}`);
    turn += Math.atan2(cross, a[0] * b[0] + a[1] * b[1]);
  }
  turn /= 2 * Math.PI;
  assert.ok(turn > 0.5 && turn < 1.5, `${label}: el borde de la última vuelta da ${turn.toFixed(3)} vueltas`);
}

/**
 * Pieza redonda al azar con aumentos y disminuciones **juntos** ("aum x d, pb …", como el fixture
 * B) o repartidos ("[pb k, aum] x d"): crece, meseta y cierra.
 */
function genRoundPiece(r: Rng): { part: Part; text: string } {
  const b = r.int(4, 8);
  const lines = ["Parte: Bola", "Inicio: AM", `Construcción: ${r.bool(0.8) ? "espiral" : "cerrada"}`, "Lana: A", `V1: ${b} pb en AM (${b})`];
  let prev = b;
  let n = 2;
  const push = (body: string, count: number) => {
    lines.push(`V${n}: ${body} (${count})`);
    prev = count;
    n++;
  };
  const shaping = (kind: "aum" | "dism", d: number): void => {
    const rest = kind === "aum" ? prev - d : prev - 2 * d;
    const count = kind === "aum" ? prev + d : prev - d;
    const spread = rest > 0 && rest % d === 0 && r.bool(0.4);
    if (spread) push(`[${rest / d === 1 ? "pb" : `pb ${rest / d}`}, ${kind}] x${d}`, count);
    else push([`${kind} x${d}`, rest > 0 ? `${rest} pb` : ""].filter(Boolean).join(", "), count);
  };
  const grow = r.int(2, 8);
  for (let i = 0; i < grow; i++) shaping("aum", r.int(1, Math.min(prev, 12)));
  const plateau = r.int(0, 4);
  for (let i = 0; i < plateau; i++) push(`${prev} pb`, prev);
  while (prev > b && n < 40) shaping("dism", r.int(1, Math.max(1, Math.min(Math.floor(prev / 2), prev - b))));
  const text = lines.join("\n");
  return { part: readPart(text, "bola"), text };
}

describe("T21: espiral continua (la lengüeta de la esfera)", () => {
  it("fixture B: el final de cada vuelta se toca con el inicio de la siguiente y ningún triángulo mira hacia adentro", () => {
    const part = fixtureBPart();
    const m = buildPartMesh(part, YARNS, profileOf(part));
    assert.ok(maxSpiralGap(m) < 1e-5, `ranura de ${maxSpiralGap(m)} cm en la línea de inicio de vuelta`);
    assert.ok(flippedFraction(m) < 1e-9, `${flippedFraction(m)} del área mira hacia adentro`);
    assertLastRoundBorder(m, "B", 1e-6);
  });

  it("fixture A: igual, y la última vuelta (dism x6) queda abierta con un escalón del alto de esa vuelta (F4-35)", () => {
    const part = fixtureAPart();
    const profile = profileOf(part);
    assert.ok(profile.kind === "revolution");
    const m = buildPartMesh(part, YARNS, profile);
    assert.ok(maxSpiralGap(m) < 1e-5);
    assert.ok(flippedFraction(m) < 1e-9);
    assertLastRoundBorder(m, "A", 1e-6);
    // La última vuelta es una rampa: empieza a la altura del anillo anterior y termina en el suyo.
    const { left, right } = topsOf(m);
    const R = m.roundStart.length - 1;
    const z0 = pos(m, left[m.roundStart[R - 1]!]!)[2];
    const z1 = pos(m, right[m.roundStart[R]! - 1]!)[2];
    const rings = profile.rings;
    assert.ok(Math.abs(z0 - rings[rings.length - 2]!.zCm) < 1e-5 && Math.abs(z1 - rings[rings.length - 1]!.zCm) < 1e-5);
  });

  it("en vueltas unidas cada vuelta es un anillo cerrado: el último punto se toca con el primero de la misma vuelta", () => {
    const part: Part = { ...fixtureBPart(), construction: "joined" };
    const m = buildPartMesh(part, YARNS, profileOf(part));
    const { left, right } = topsOf(m);
    for (let c = 0; c < m.roundStart.length - 1; c++) {
      const a = pos(m, left[m.roundStart[c]!]!);
      const b = pos(m, right[m.roundStart[c + 1]! - 1]!);
      assert.ok(dist(a, b) < 1e-5, `V${c + 1} no cierra`);
    }
    assert.ok(flippedFraction(m) < 1e-9);
  });

  // Sin la propiedad de triángulos al revés: con aumentos o disminuciones extremos (la tela ondula o frunce,
  // el perfil se acota) la superficie de revolución se pliega, antes y después de T21.
  it("propiedad: piezas redondas al azar (aumentos y disminuciones juntos o repartidos, muestras al azar)", () => {
    forAll(
      "espiral continua y borde final sin cruces ni triángulos degenerados",
      (r) => ({ ...genRoundPiece(r), metrics: genMetrics(r) }),
      ({ part, metrics }) => {
        const profile = profileOf(part, metrics);
        assert.ok(profile.kind === "revolution");
        const m = buildPartMesh(part, YARNS, profile);
        if (part.construction === "spiral") assert.ok(maxSpiralGap(m) < 1e-4, `ranura de ${maxSpiralGap(m)} cm`);
        const w = metrics.stitchWidthCm;
        assertLastRoundBorder(m, part.construction, 1e-6 * w * w);
      },
      200,
    );
  });
});
