/**
 * Soporte de pruebas de `viewer-3d`. Reutiliza los fixtures A y B, el generador de documentos v2
 * y las propiedades con semilla de `pattern-core` (como `pattern-render`), para que las dos
 * suites prueben sobre los mismos documentos.
 *
 * Semilla: `SEED=7 node --test "test/**\/*.test.ts"` (por omisión, 20261103).
 */
import assert from "node:assert/strict";
import { parsePart, partProfile, shapeMetrics, validatePattern, type Part, type PartProfile, type ShapeMetrics, type WrittenPattern } from "@loopitalab/pattern-core";
import { FIXTURE_GAUGE, fixtureAPart, fixtureBPart, writtenOf } from "../../../pattern-core/test/support/amigurumi.ts";
import { yarnA, yarnB, yarnC } from "../../../pattern-core/test/support/fixtures.ts";
import { forAll, rng, type Rng } from "../../../pattern-core/test/support/property.ts";
import { genWrittenV2 } from "../../../pattern-core/test/support/written-gen.ts";
import type { PartMesh } from "../../src/index.ts";

export { FIXTURE_GAUGE, fixtureAPart, fixtureBPart, forAll, genWrittenV2, rng, writtenOf, yarnA, yarnB, yarnC, type Rng };

/** Muestra de los fixtures (20 puntos y 24 vueltas en 10 cm), en punto bajo. */
export const METRICS: ShapeMetrics = shapeMetrics(FIXTURE_GAUGE, { assumed: false, gaugeStitch: "sc" });

export const profileOf = (part: Part, m: ShapeMetrics = METRICS): PartProfile => partProfile(part, m);

export function readPart(text: string, id = "p"): Part {
  const r = parsePart(text, { id });
  if (!r.ok) throw new Error(`No se lee: ${JSON.stringify(r.issues)}`);
  return r.value;
}

/** Documento v2 `savable` al azar (los que no lo son se descartan y se vuelve a generar). */
export function genSavable(r: Rng): WrittenPattern {
  for (let i = 0; i < 50; i++) {
    const d = genWrittenV2(r);
    if (validatePattern(d).savable) return d;
  }
  throw new Error("El generador no dio un documento savable en 50 intentos.");
}

/** Muestra al azar razonable (puntos 8 a 30 y vueltas 8 a 36 en 10 cm). */
export function genMetrics(r: Rng): ShapeMetrics {
  return shapeMetrics({ stitchesPer10cm: r.int(8, 30), rowsPer10cm: r.int(8, 36) }, { assumed: r.bool(0.3), gaugeStitch: r.pick(["sc", "sc", "hdc", "dc", "tr"] as const) });
}

const ARRAYS = ["positions", "normals", "uvs", "yarn", "loop", "indices", "faceStitch", "roundStart"] as const;

/** Igualdad exacta de dos mallas (los mismos bytes). */
export function assertMeshEqual(a: PartMesh, b: PartMesh, msg = ""): void {
  assert.equal(a.vertexCount, b.vertexCount, `${msg} vertexCount`);
  assert.equal(a.indexCount, b.indexCount, `${msg} indexCount`);
  for (const k of ARRAYS) assert.deepEqual(a[k], b[k], `${msg} ${k}`);
  assert.deepEqual(a.bounds, b.bounds, `${msg} bounds`);
}

/** `a` es un prefijo exacto de `b` (mismos vértices, en el mismo orden; G7). */
export function assertMeshPrefix(a: PartMesh, b: PartMesh, msg = ""): void {
  const v = a.vertexCount;
  const ix = a.indexCount;
  assert.ok(v <= b.vertexCount && ix <= b.indexCount, `${msg} más grande que la completa`);
  assert.deepEqual(a.positions, b.positions.subarray(0, v * 3), `${msg} positions`);
  assert.deepEqual(a.normals, b.normals.subarray(0, v * 3), `${msg} normals`);
  assert.deepEqual(a.uvs, b.uvs.subarray(0, v * 2), `${msg} uvs`);
  assert.deepEqual(a.yarn, b.yarn.subarray(0, v), `${msg} yarn`);
  assert.deepEqual(a.loop, b.loop.subarray(0, v), `${msg} loop`);
  assert.deepEqual(a.indices, b.indices.subarray(0, ix), `${msg} indices`);
  assert.deepEqual(a.faceStitch, b.faceStitch.subarray(0, ix / 3), `${msg} faceStitch`);
}

export const allFinite = (xs: ArrayLike<number>): boolean => {
  for (let i = 0; i < xs.length; i++) if (!Number.isFinite(xs[i]!)) return false;
  return true;
};

/** Pieza redonda que cuadra: base b, aumentos hasta b·m, meseta y cierre. */
export function roundPieceText(name: string, b: number, m: number, plateau: number, opts: { joined?: boolean; chain?: boolean } = {}): string {
  const lines = [`Parte: ${name}`, opts.chain ? `Inicio: cad ${b}` : "Inicio: AM", `Construcción: ${opts.joined ? "cerrada" : "espiral"}`, "Lana: A", `V1: ${b} pb (${b})`];
  let n = 2;
  for (let i = 2; i <= m; i++, n++) lines.push(i === 2 ? `V${n}: aum x${b} (${2 * b})` : `V${n}: [${i - 2} pb, aum] x${b} (${b * i})`);
  if (plateau > 0) {
    lines.push(plateau > 1 ? `V${n}-${n + plateau - 1}: ${b * m} pb (${b * m})` : `V${n}: ${b * m} pb (${b * m})`);
    n += plateau;
  }
  for (let i = m; i >= 2; i--, n++) lines.push(i === 2 ? `V${n}: dism x${b} (${b})` : `V${n}: [${i - 2} pb, dism] x${b} (${b * (i - 1)})`);
  return lines.join("\n");
}

export { writtenOf as patternOf };

/** Patrón con varias lanas, para los cambios de color. */
export function withYarns(parts: Part[], extra: Partial<WrittenPattern> = {}): WrittenPattern {
  return writtenOf(parts, { yarns: [structuredClone(yarnA), structuredClone(yarnB), structuredClone(yarnC)], ...extra });
}
