/**
 * Revisión de seguridad T20 (fase 4): `buildScene` con los documentos hostiles de la revisión.
 *
 * - Guardia de tiempos: cada documento se arma en menos de 50 ms (antes, la bomba 40⁵ en V2-10
 *   tardaba 6,4 s y el de 25.000 colores en V2-1000, 7,9 s).
 * - T20-A1: una parte que pasa los topes de expansión se arma vacía con el aviso
 *   `PART_TOO_LARGE`; al corregirla se vuelve a armar (no se reutiliza la malla vacía).
 * - T20-M1: una vuelta escrita se expande a lo más una vez por lana inicial; las vueltas de un
 *   rango dan la misma malla que si se escribieran una por una.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIMITS, shapeMetrics, validatePattern, type Item, type Part, type Round, type WrittenPattern } from "@loopitalab/pattern-core";
import { colorBomb, hostileDocuments } from "../../pattern-core/test/support/hostile.ts";
import { buildPartMesh, buildScene } from "../src/index.ts";
import { METRICS, profileOf, withYarns } from "./support/fixtures.ts";

/**
 * Presupuesto de la guardia de tiempos (T20): 50 ms, el criterio de la revisión, medido como la
 * mejor de 3 corridas después de calentar. En CI (variable `CI`) se dobla, como el factor de
 * CA4-P6, para que un runner lento no dé falsos negativos (T20-I5); `T20_TIME_FACTOR` lo ajusta.
 */
const BUDGET_MS = 50 * Number(process.env.T20_TIME_FACTOR ?? (process.env.CI ? 2 : 1));

const metrics = shapeMetrics({ stitchesPer10cm: 13, rowsPer10cm: 16 }, { assumed: false, gaugeStitch: "sc" });

function best(fn: () => unknown, runs = 3): number {
  fn();
  let min = Infinity;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    min = Math.min(min, performance.now() - t);
  }
  return min;
}

const sc = (count: number): Item => ({ type: "stitch", stitch: "sc", count });
const part = (rounds: Round[], id = "p"): Part => ({ id, name: id === "p" ? "Bolita" : id, construction: "spiral", start: { type: "magic_ring" }, startYarn: "A", rounds });

describe("T20: buildScene con documentos hostiles", () => {
  for (const { name, doc } of hostileDocuments()) {
    it(`${name}: en menos de ${BUDGET_MS} ms`, (t) => {
      const ms = best(() => buildScene({ pattern: doc, metrics: () => metrics }));
      const scene = buildScene({ pattern: doc, metrics: () => metrics });
      t.diagnostic(`buildScene ${ms.toFixed(2)} ms · ${scene.stitchCount} puntos · avisos ${scene.notes.map((n) => n.code).join(", ") || "ninguno"}`);
      assert.ok(ms < BUDGET_MS, `buildScene tardó ${ms.toFixed(1)} ms`);
    });
  }

  it("la bomba se arma vacía con PART_TOO_LARGE; corregida, se vuelve a armar", () => {
    const bomb: WrittenPattern = withYarns([part([{ number: 1, items: [sc(6)] }, { number: 2, through: 10, items: [colorBomb(40, 5), sc(6)] }])]);
    assert.equal(validatePattern(bomb).savable, false);
    const first = buildScene({ pattern: bomb, metrics: () => METRICS });
    assert.equal(first.stitchCount, 0);
    const note = first.notes.find((n) => n.code === "PART_TOO_LARGE");
    assert.equal(note?.partId, "p");
    assert.match(note?.message ?? "", /^Bolita: sus repeticiones se despliegan en más pasos de los que el motor acepta/);
    // Misma referencia: sigue vacía (no se "conserva" una malla de antes del tope).
    const again = buildScene({ pattern: bomb, metrics: () => METRICS, previous: first.cache });
    assert.equal(again.stitchCount, 0);
    // Corregida (misma forma de puntos, sin la bomba): se arma de nuevo, no se recolorea la malla vacía.
    const fixed: WrittenPattern = { ...bomb, parts: [part([{ number: 1, items: [sc(6)] }, { number: 2, through: 10, items: [{ type: "color", yarn: "A" }, sc(6)] }])] };
    const next = buildScene({ pattern: fixed, metrics: () => METRICS, previous: again.cache });
    assert.equal(next.stitchCount, 60);
    assert.deepEqual(next.updates.map((u) => u.kind), ["built"]);
    assert.ok(!next.notes.some((n) => n.code === "PART_TOO_LARGE"));
  });

  it("el tope del documento: las partes que lo pasan se arman vacías, las demás se dibujan", () => {
    // Cada parte: V1 (1) + 499 vueltas de 2.002 = 998.999; la tercera pasa los 2.000.000.
    const v2: Round = { number: 2, through: 500, items: [{ type: "group", times: 40, items: [{ type: "group", times: 49, items: [{ type: "color", yarn: "A" }] }] }, sc(6)] };
    const doc = withYarns(["a", "b", "c"].map((id) => part([{ number: 1, items: [sc(6)] }, v2], id)));
    const scene = buildScene({ pattern: doc, metrics: () => METRICS });
    assert.deepEqual(scene.notes.filter((n) => n.code === "PART_TOO_LARGE").map((n) => n.partId), ["c"]);
    assert.equal(scene.stitchCount, 2 * 500 * 6);
    assert.ok(LIMITS.maxExpansionWork < 3 * 998_999);
  });

  it("T20-M1: un rango da la misma malla que sus vueltas escritas una por una", () => {
    const items: Item[] = [{ type: "color", yarn: "B" }, sc(6), { type: "color", yarn: "A" }, sc(6)];
    const ranged = part([{ number: 1, items: [sc(12)] }, { number: 2, through: 8, items }]);
    const single = part([{ number: 1, items: [sc(12)] }, ...Array.from({ length: 7 }, (_, i) => ({ number: i + 2, items }))]);
    const a = buildPartMesh(ranged, ["A", "B"], profileOf(ranged));
    const b = buildPartMesh(single, ["A", "B"], profileOf(single));
    assert.deepEqual(a, b);
  });
});
