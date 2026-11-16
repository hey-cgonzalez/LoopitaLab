/**
 * Revisión de tejido T21 (fase 4) en `describeWritten`: muestra supuesta por parte (C1,
 * BUG-QA4-1) y "ganchillo" en el aviso de prototipo (C3). Propiedades con semilla (ADR 0002).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gaugeWeightOf, partDimensions, partProfile, shapeMetrics, type Part, type WrittenPattern, type Yarn } from "@loopitalab/pattern-core";
import { describeWritten, type AssumedGauge } from "../src/index.ts";
import { fixtureAPart, fixtureBPart, writtenOf } from "../../pattern-core/test/support/amigurumi.ts";
import { yarnA } from "../../pattern-core/test/support/fixtures.ts";
import { forAll, type Rng } from "./support/property.ts";

const yarn = (id: string, weight: number): Yarn => ({ ...structuredClone(yarnA), id, weight: weight as Yarn["weight"] });
const BIG: AssumedGauge = { stitchesPer10cm: 8, rowsPer10cm: 10, gaugeStitch: "sc" };
const SMALL: AssumedGauge = { stitchesPer10cm: 27, rowsPer10cm: 32, gaugeStitch: "sc" };

function twoParts(): WrittenPattern {
  const body: Part = { ...fixtureAPart(), startYarn: "A" };
  const eye: Part = { ...fixtureBPart(), id: "ojo", name: "Ojo", startYarn: "B" };
  const d = writtenOf([body, eye], { yarns: [yarn("A", 6), yarn("B", 1)] });
  delete d.gauge;
  return d;
}
const byWeight = (d: WrittenPattern) => (p: Part) => (gaugeWeightOf(d, p) === 6 ? BIG : SMALL);
const expected = (part: Part, g: AssumedGauge) => partDimensions(partProfile(part, shapeMetrics(g, { assumed: true, gaugeStitch: g.gaugeStitch })));

describe("T21 C1: describeWritten con assumedGaugeOf", () => {
  it("cada parte mide con la muestra de su lana inicial", () => {
    const d = twoParts();
    const out = describeWritten(d, { assumedGaugeOf: byWeight(d) });
    assert.equal(out.ok, true);
    assert.equal(out.gaugeStatus, "assumed");
    const [body, eye] = out.parts;
    assert.equal(body?.measures.status, "assumed");
    assert.equal(eye?.measures.status, "assumed");
    assert.deepEqual([body?.measures.heightCm, body?.measures.widthCm], Object.values(expected(d.parts[0]!, BIG)));
    assert.deepEqual([eye?.measures.heightCm, eye?.measures.widthCm], Object.values(expected(d.parts[1]!, SMALL)));
    assert.match(body!.measures.text, /muestra supuesta \(8 puntos y 10 vueltas en 10 cm\)/);
    assert.match(eye!.measures.text, /muestra supuesta \(27 puntos y 32 vueltas en 10 cm\)/);
  });

  it("prioridad: la muestra del documento manda; después assumedGaugeOf; después assumedGauge", () => {
    const d = twoParts();
    d.gauge = { stitchesPer10cm: 20, rowsPer10cm: 24 };
    let calls = 0;
    const doc = describeWritten(d, { assumedGaugeOf: () => (calls++, BIG), assumedGauge: SMALL });
    assert.equal(calls, 0);
    assert.equal(doc.gaugeStatus, "document");
    assert.ok(doc.parts.every((p) => p.measures.status === "estimate"));

    delete d.gauge;
    const mixed = describeWritten(d, { assumedGaugeOf: (p) => (p.id === "ojo" ? undefined : BIG), assumedGauge: SMALL });
    assert.equal(mixed.parts[0]?.measures.heightCm, expected(d.parts[0]!, BIG).heightCm);
    assert.equal(mixed.parts[1]?.measures.heightCm, expected(d.parts[1]!, SMALL).heightCm);
  });

  it("sin respaldo, una parte sin muestra queda sin medidas; gaugeStatus es assumed si alguna la tuvo", () => {
    const d = twoParts();
    const out = describeWritten(d, { assumedGaugeOf: (p) => (p.id === "ojo" ? SMALL : undefined) });
    assert.equal(out.parts[0]?.measures.status, "missing");
    assert.equal(out.parts[1]?.measures.status, "assumed");
    assert.equal(out.gaugeStatus, "assumed");
    const none = describeWritten(d, { assumedGaugeOf: () => undefined });
    assert.equal(none.gaugeStatus, "missing");
    assert.match(none.text, /Falta la muestra/);
  });

  it("una muestra inválida o una excepción equivalen a no darla; nunca lanza", () => {
    const d = twoParts();
    const base = describeWritten(d, { assumedGauge: SMALL });
    const bad = [
      () => {
        throw new Error("x");
      },
      () => ({ stitchesPer10cm: 0, rowsPer10cm: 10, gaugeStitch: "sc" }),
      () => ({ stitchesPer10cm: Infinity, rowsPer10cm: 10, gaugeStitch: "sc" }),
      () => ({ stitchesPer10cm: "8", rowsPer10cm: 10 }),
      () => null,
      () => 7,
    ] as unknown as Array<(p: Part) => AssumedGauge | undefined>;
    for (const f of bad) assert.deepEqual(describeWritten(d, { assumedGauge: SMALL, assumedGaugeOf: f }), base);
    // gaugeStitch desconocido se lee como punto bajo.
    const odd = describeWritten(d, { assumedGaugeOf: () => ({ ...BIG, gaugeStitch: "zz" as "sc" }) });
    assert.equal(odd.parts[0]?.measures.heightCm, expected(d.parts[0]!, BIG).heightCm);
  });

  it("propiedad: con la misma muestra para todas, assumedGaugeOf da lo mismo que assumedGauge", () => {
    forAll(
      "T21-C1 describeWritten",
      (r: Rng) => ({
        g: { stitchesPer10cm: r.int(5, 40), rowsPer10cm: r.int(5, 50), gaugeStitch: r.pick(["sc", "hdc", "dc", "tr"] as const) },
        dialect: r.pick(["es", "us", "uk"] as const),
      }),
      ({ g, dialect }) => {
        const d = twoParts();
        assert.deepEqual(describeWritten(d, { dialect, assumedGaugeOf: () => g }), describeWritten(d, { dialect, assumedGauge: g }));
      },
      60,
    );
  });
});

describe("T21 C3: aviso de prototipo en crochet", () => {
  it('dice "ganchillo", no "aguja"', () => {
    const out = describeWritten(writtenOf([fixtureBPart()]));
    assert.match(out.text, /teje una muestra con tu lana y tu ganchillo para comprobar/);
    assert.doesNotMatch(out.text, /aguja/);
  });
});
