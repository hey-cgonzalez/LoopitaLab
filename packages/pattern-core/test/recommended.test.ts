/**
 * Límites recomendados (ADR 0011, sección 3b; criterio CA4-M8): `RECOMMENDED_WRITTEN_LIMITS`,
 * `recommendedLimitUsage` y `recommendedLimitNotices`. Son puros, no entran a `validatePattern`
 * y nunca lanzan.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RECOMMENDED_WRITTEN_LIMITS,
  STITCHES,
  concreteRounds,
  expandRound,
  recommendedLimitNotices,
  recommendedLimitUsage,
  validatePattern,
  type LimitUsage,
  type Part,
  type WrittenPattern,
} from "../src/index.ts";
import { fixtureAPart, writtenOf } from "./support/amigurumi.ts";
import { ballPattern } from "./support/fixtures.ts";
import { forAll, type Rng } from "./support/property.ts";
import { genWrittenV2 } from "./support/written-gen.ts";

const byLimit = (u: LimitUsage[]) => Object.fromEntries(u.map((x) => [x.limit, x]));

/** Referencia independiente: recorre cada vuelta concreta y cuenta producido punto a punto. */
function reference(d: WrittenPattern) {
  let maxCopies = 0;
  let maxRounds = 0;
  let maxStitches = 0;
  let scene = 0;
  const overRounds: Array<{ partId: string; round: number }> = [];
  for (const p of d.parts) {
    const copies = p.copies ?? 1;
    const rounds = concreteRounds(p);
    maxCopies = Math.max(maxCopies, copies);
    maxRounds = Math.max(maxRounds, rounds.length);
    let total = 0;
    for (const c of rounds) {
      const produced = expandRound(c.round, c.startYarn).stitches.reduce((s, x) => s + STITCHES[x.stitch].produces, 0);
      total += produced;
      maxStitches = Math.max(maxStitches, produced);
      if (produced > RECOMMENDED_WRITTEN_LIMITS.stitchesPerRound) overRounds.push({ partId: p.id, round: c.number });
    }
    scene += total * copies;
  }
  return { parts: d.parts.length, copiesPerPart: maxCopies, roundsPerPart: maxRounds, stitchesPerRound: maxStitches, sceneStitches: scene, overRounds };
}

/** v2 grande al azar: más partes, copias y vueltas, para cruzar los límites con frecuencia. */
function genLarge(r: Rng): WrittenPattern {
  const d = genWrittenV2(r);
  const extra = r.int(0, 24);
  const parts: Part[] = [...d.parts];
  for (let i = 0; i < extra; i++) {
    const w = r.int(2, 260);
    const rows = r.int(1, 130);
    parts.push({
      id: `x${i}`,
      name: `Extra ${i + 1}`,
      construction: "flat",
      start: { type: "chain", count: w + 1 },
      startYarn: "A",
      ...(r.bool(0.5) ? { copies: r.int(1, 14) } : {}),
      rounds: [{ number: 1, ...(rows > 1 ? { through: rows } : {}), items: [{ type: "stitch", stitch: "sc", count: w }] }],
    });
  }
  const { layout: _layout, ...rest } = d;
  return { ...rest, parts: parts.slice(0, 50) };
}

describe("RECOMMENDED_WRITTEN_LIMITS", () => {
  it("tiene los valores confirmados por T1 (C-18) y está congelado", () => {
    // validar con tejedora: estimaciones de orden de magnitud (F4-70 a F4-76).
    assert.deepEqual({ ...RECOMMENDED_WRITTEN_LIMITS }, { parts: 20, copiesPerPart: 10, roundsPerPart: 100, stitchesPerRound: 200, sceneStitches: 40_000 });
    assert.ok(Object.isFrozen(RECOMMENDED_WRITTEN_LIMITS));
  });
});

describe("recommendedLimitUsage", () => {
  it("devuelve los cinco límites en orden, con el valor y lo recomendado, y nada por encima en la bolita", () => {
    const u = recommendedLimitUsage(ballPattern());
    assert.deepEqual(u, [
      { limit: "parts", value: 1, recommended: 20, over: [] },
      { limit: "copiesPerPart", value: 1, recommended: 10, over: [] },
      { limit: "roundsPerPart", value: 11, recommended: 100, over: [] },
      { limit: "stitchesPerRound", value: 24, recommended: 200, over: [] },
      { limit: "sceneStitches", value: 6 + 12 + 18 + 24 * 5 + 18 + 12 + 6, recommended: 40_000, over: [] },
    ]);
    assert.deepEqual(recommendedLimitNotices(ballPattern()), []);
  });

  it("en el borde exacto no hay aviso; uno más, sí (value > recommended)", () => {
    const panel = (id: string, w: number, rows: number, copies = 1): Part => ({
      id, name: id, construction: "flat", start: { type: "chain", count: w + 1 }, startYarn: "A",
      ...(copies > 1 ? { copies } : {}),
      rounds: [{ number: 1, ...(rows > 1 ? { through: rows } : {}), items: [{ type: "stitch", stitch: "sc", count: w }] }],
    });
    const atEdge = writtenOf([...Array.from({ length: 19 }, (_, i) => panel(`p${i}`, 1, 1)), panel("grande", 200, 100, 2)]);
    // 19 + 200 × 100 × 2 = 40.019: solo la escena pasa.
    assert.deepEqual(recommendedLimitNotices(atEdge).map((u) => u.limit), ["sceneStitches"]);
    const exact = writtenOf([panel("a", 200, 100, 2)]);
    assert.deepEqual(recommendedLimitNotices(exact), []);
    assert.equal(byLimit(recommendedLimitUsage(exact)).sceneStitches!.value, 40_000);
    const over = writtenOf([...Array.from({ length: 21 }, (_, i) => panel(`p${i}`, 201, 101, 11))]);
    const n = byLimit(recommendedLimitNotices(over));
    assert.deepEqual(n.parts!.over, [{ partId: "p20" }]);
    assert.equal(n.copiesPerPart!.over.length, 21);
    assert.equal(n.roundsPerPart!.value, 101);
    assert.equal(n.stitchesPerRound!.over.length, 21 * 101);
    assert.deepEqual(n.stitchesPerRound!.over[0], { partId: "p0", round: 1 });
    assert.equal(n.sceneStitches!.value, 21 * 201 * 101 * 11);
    assert.equal(n.sceneStitches!.over.length, 21);
  });

  it("propiedad (CA4-M8): coincide con concreteRounds y copies en documentos al azar", () => {
    let notices = 0;
    forAll("límites recomendados", genLarge, (d) => {
      const u = byLimit(recommendedLimitUsage(d));
      const ref = reference(d);
      assert.equal(u.parts!.value, ref.parts);
      assert.equal(u.copiesPerPart!.value, ref.copiesPerPart);
      assert.equal(u.roundsPerPart!.value, ref.roundsPerPart);
      assert.equal(u.stitchesPerRound!.value, ref.stitchesPerRound);
      assert.equal(u.sceneStitches!.value, ref.sceneStitches);
      assert.deepEqual(u.stitchesPerRound!.over, ref.overRounds);
      for (const x of Object.values(u)) {
        assert.equal(x.recommended, RECOMMENDED_WRITTEN_LIMITS[x.limit]);
        assert.equal(x.over.length > 0, x.value > x.recommended && x.value > 0, x.limit);
      }
      const n = recommendedLimitNotices(d);
      assert.deepEqual(n, Object.values(u).filter((x) => x.value > x.recommended));
      notices += n.length;
    }, 150);
    assert.ok(notices > 50, `se cruzaron ${notices} límites`);
  });

  it("propiedad (CA4-M8): no aparecen en validatePattern ni cambian valid", () => {
    const codes = new Set(["parts", "copiesPerPart", "roundsPerPart", "stitchesPerRound", "sceneStitches"].map((s) => s.toUpperCase()));
    forAll("límites fuera del validador", genLarge, (d) => {
      const r = validatePattern(d);
      for (const i of r.issues) {
        assert.ok(!codes.has(i.code) && !/RECOMMENDED/.test(i.code), i.code);
      }
    }, 100);
  });

  it("el total de la escena suma la V1 y multiplica por copies (F4-76); G13 con buildScene queda para viewer-3d (T10)", () => {
    const body = fixtureAPart();
    const d = writtenOf([body, { ...fixtureAPart(), id: "b", copies: 3 }]);
    assert.equal(byLimit(recommendedLimitUsage(d)).sceneStitches!.value, 1800 * 4);
  });

  it("nunca lanza, con documentos savable, dañados o que no son objetos", () => {
    const junk: unknown[] = [null, undefined, 3, "x", [], {}, { parts: null }, { parts: [null, 3, { rounds: "x" }, { rounds: [{ number: 1, items: null }] }] }, { parts: [{ id: 1, copies: "7", rounds: [{ number: 1e308, items: [] }] }] }];
    for (const j of junk) {
      const u = recommendedLimitUsage(j as WrittenPattern);
      assert.equal(u.length, 5);
      for (const x of u) assert.ok(Number.isFinite(x.value));
      recommendedLimitNotices(j as WrittenPattern);
    }
    const evil = Object.defineProperty({}, "parts", { get() { throw new Error("boom"); } });
    assert.equal(recommendedLimitUsage(evil as WrittenPattern).length, 5);
    forAll("nunca lanza con savable", genWrittenV2, (d) => {
      if (validatePattern(d).savable) recommendedLimitUsage(d);
    }, 200);
  });

  it("es lineal en las vueltas: 50 partes de 1.000 vueltas con grupos repetidos en menos de 50 ms", () => {
    const part = (i: number): Part => ({
      id: `p${i}`, name: `P${i}`, construction: "spiral", start: { type: "magic_ring" }, startYarn: "A", copies: 50,
      rounds: [{ number: 1, through: 1000, items: [{ type: "group", times: 500, items: [{ type: "group", times: 100, items: [{ type: "stitch", stitch: "sc", count: 1 }] }] }] }],
    });
    const d = writtenOf(Array.from({ length: 50 }, (_, i) => part(i)));
    recommendedLimitUsage(d); // calentamiento
    let ms = Number.POSITIVE_INFINITY;
    let u = byLimit(recommendedLimitUsage(d));
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      u = byLimit(recommendedLimitUsage(d));
      ms = Math.min(ms, performance.now() - t0);
    }
    assert.equal(u.stitchesPerRound!.value, 50_000);
    assert.equal(u.sceneStitches!.value, 50 * 1000 * 50_000 * 50);
    assert.ok(ms < 50, `${ms} ms`);
  });
});
