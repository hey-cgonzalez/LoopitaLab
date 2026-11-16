/**
 * Guardia de rendimiento en Node (CA4-P6, ADR 0010, sección 6c; R4-19): `partProfile` y
 * `buildPartMesh` del cuerpo (fixture A, 39 vueltas, 1.800 puntos) y `buildScene` del escenario
 * de referencia (cuerpo más 9 partes, con 2 copias en orejas, brazos y piernas; 3 lanas).
 *
 * - Se informa la mediana de 15 corridas (después de calentar) con `t.diagnostic`.
 * - Falla si supera `FACTOR` veces la referencia registrada.
 * - Referencia (R4-19): medida el 2026-11-14 en el equipo de desarrollo (Apple M1, 8 núcleos,
 *   8 GB, Node 24.16), medianas de 3 corridas de esta prueba: partProfile 0,045 ms,
 *   buildPartMesh 0,72 a 0,94 ms (7.254 vértices, 3.654 triángulos), buildScene completa del
 *   escenario 1,6 a 1,75 ms (14 instancias, 4.036 puntos) y buildScene con una parte editada
 *   0,41 a 0,50 ms. Se registra el doble, como en `stitch-render`, para un equipo de gama media
 *   o un runner de CI. Los presupuestos del ADR (10 ms para la malla, 3 ms para la escena)
 *   quedan holgados incluso al triple.
 * - Para ajustar la tolerancia en un equipo lento sin tocar la referencia:
 *   `VIEWER_3D_PERF_FACTOR=5 node --test test/perf.test.ts`. En CI (variable `CI`), 6.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { partProfile, type Part, type WrittenPattern } from "@loopitalab/pattern-core";
import { buildPartMesh, buildScene } from "../src/index.ts";
import { METRICS, fixtureAPart, readPart, roundPieceText, withYarns } from "./support/fixtures.ts";

export const REFERENCE_MS = { profile: 0.1, mesh: 1.8, scene: 3.5, sceneEdit: 1 } as const;
const FACTOR = Number(process.env.VIEWER_3D_PERF_FACTOR ?? (process.env.CI ? 6 : 3));

function median(fn: () => void, runs = 15, warmup = 5): number {
  for (let i = 0; i < warmup; i++) fn();
  const ts: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    ts.push(performance.now() - t);
  }
  ts.sort((a, b) => a - b);
  return ts[ts.length >> 1] as number;
}

/** Escenario de referencia (ADR 0010, sección 6): cuerpo + 9 partes de 10 a 25 vueltas, 3 lanas, cambios de color en 5 vueltas. */
function referenceScene(): WrittenPattern {
  const body = fixtureAPart();
  for (const n of [5, 12, 20, 28, 34]) {
    const i = body.rounds.findIndex((r) => r.number <= n && (r.through ?? r.number) >= n);
    body.rounds[i] = { ...body.rounds[i]!, items: [{ type: "color", yarn: n % 2 ? "B" : "C" }, ...body.rounds[i]!.items] };
  }
  const piece = (id: string, b: number, m: number, p: number, copies = 1): Part => ({ ...readPart(roundPieceText(id, b, m, p), id), ...(copies > 1 ? { copies } : {}) });
  return withYarns([
    body,
    piece("cabeza", 6, 8, 9),
    piece("hocico", 6, 3, 4),
    piece("oreja", 6, 3, 5, 2),
    piece("brazo", 5, 2, 14, 2),
    piece("pierna", 6, 2, 12, 2),
    piece("cola", 4, 2, 8),
    piece("ojo", 6, 2, 0, 2),
    piece("nariz", 5, 2, 1),
    piece("panza", 6, 4, 4),
  ]);
}

test(`CA4-P6: partProfile y buildPartMesh del fixture A (1.800 puntos) no superan ${FACTOR} × la referencia`, (t) => {
  const part = fixtureAPart();
  const profile = partProfile(part, METRICS);
  const profileMs = median(() => partProfile(part, METRICS));
  const meshMs = median(() => buildPartMesh(part, ["A", "B", "C"], profile));
  const mesh = buildPartMesh(part, ["A", "B", "C"], profile);
  t.diagnostic(`partProfile ${profileMs.toFixed(3)} ms (referencia ${REFERENCE_MS.profile}) · buildPartMesh ${meshMs.toFixed(3)} ms (referencia ${REFERENCE_MS.mesh}) · ${mesh.vertexCount} vértices, ${mesh.indexCount / 3} triángulos`);
  assert.equal(mesh.roundStart.at(-1), 1800);
  assert.ok(profileMs <= REFERENCE_MS.profile * FACTOR, `partProfile tardó ${profileMs.toFixed(3)} ms`);
  assert.ok(meshMs <= REFERENCE_MS.mesh * FACTOR, `buildPartMesh tardó ${meshMs.toFixed(3)} ms`);
});

test(`CA4-P6: buildScene del escenario de referencia y con una parte editada (1 malla reconstruida) no superan ${FACTOR} × la referencia`, (t) => {
  const pattern = referenceScene();
  const metrics = () => METRICS;
  const first = buildScene({ pattern, metrics });
  const sceneMs = median(() => buildScene({ pattern, metrics }));
  // Edición: cambiar el conteo de la V33 del cuerpo, con la caché anterior (mismas referencias en las demás partes).
  const edit = (k: number): WrittenPattern => {
    const body = { ...pattern.parts[0]! };
    body.rounds = body.rounds.map((r) => (r.number === 33 ? { ...r, items: [{ type: "stitch", stitch: "sc", count: 40 + (k % 5) }] } : r));
    return { ...pattern, parts: [body, ...pattern.parts.slice(1)] };
  };
  let cache = first.cache;
  let k = 0;
  let rebuilt = 0;
  const editMs = median(() => {
    const s = buildScene({ pattern: edit(k++), metrics, previous: cache });
    cache = s.cache;
    rebuilt = s.updates.filter((u) => u.kind === "built").length;
  });
  t.diagnostic(`buildScene completa ${sceneMs.toFixed(3)} ms (referencia ${REFERENCE_MS.scene}; ${first.instances.length} instancias, ${first.stitchCount} puntos) · con una parte editada ${editMs.toFixed(3)} ms (referencia ${REFERENCE_MS.sceneEdit})`);
  assert.equal(rebuilt, 1, "una edición reconstruye exactamente una malla");
  assert.ok(sceneMs <= REFERENCE_MS.scene * FACTOR, `buildScene tardó ${sceneMs.toFixed(3)} ms`);
  assert.ok(editMs <= REFERENCE_MS.sceneEdit * FACTOR, `buildScene con una edición tardó ${editMs.toFixed(3)} ms`);
});
