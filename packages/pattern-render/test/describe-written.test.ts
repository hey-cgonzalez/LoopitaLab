/** T9: describeWritten. Propiedades con el generador con semilla (ADR 0002). */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { concreteRounds, summarizePart, type Dialect, type Part, type WrittenPattern } from "@loopitalab/pattern-core";
import { describeWritten } from "../src/index.ts";
import { fixtureAPart, fixtureBPart, writtenOf } from "../../pattern-core/test/support/amigurumi.ts";
import { forAll, type Rng } from "./support/property.ts";

const earPart = (copies?: number): Part => ({
  id: "oreja",
  name: "Oreja",
  construction: "spiral",
  start: { type: "magic_ring" },
  startYarn: "A",
  ...(copies === undefined ? {} : { copies }),
  rounds: [
    { number: 1, items: [{ type: "stitch", stitch: "sc", count: 6 }], expected: 6 },
    { number: 2, items: [{ type: "stitch", stitch: "inc", count: 6 }], expected: 12 },
  ],
});

function withEars(round = 10, extra: Partial<WrittenPattern["layout"] & object> = {}): WrittenPattern {
  const head = { ...fixtureAPart(), id: "cabeza", name: "Cabeza" };
  const p = writtenOf([head, earPart(2)]);
  p.layout = {
    placements: [
      { target: { part: "cabeza", copy: 0 }, at: { type: "free", positionCm: [0, 0, 0], rotationDeg: [0, 0, 0] } },
      { target: { part: "oreja", copy: 0 }, at: { type: "surface", host: { part: "cabeza", copy: 0 }, round, stitch: 4, attach: "end", rotationDeg: [0, 0, 0] } },
    ],
    ...extra,
  };
  return p;
}

describe("describeWritten: fixtures", () => {
  it("fixture A: partes, conteos del motor y medidas con la muestra del documento", () => {
    const part = fixtureAPart();
    const d = describeWritten(writtenOf([part]));
    assert.equal(d.ok, true);
    assert.equal(d.gaugeStatus, "document");
    const s = summarizePart(part);
    assert.equal(s.rounds, 39);
    assert.equal(d.parts[0]?.roundCount, 39);
    assert.equal(d.parts[0]?.totalStitches, 1800);
    assert.equal(d.parts[0]?.finalCount, 6);
    assert.match(d.text, /39 vueltas, 1800 puntos en total; termina con 6 puntos/);
    assert.match(d.text, /≈ [\d,]+ cm de alto/);
    assert.match(d.text, /estimación/);
    assert.doesNotMatch(d.text, /supuesto/);
    assert.match(d.text, /V1: 6 pb \(6\)/);
  });

  it("fixture B: los conteos por vuelta son los del motor", () => {
    const part = fixtureBPart();
    const d = describeWritten(writtenOf([part]));
    assert.deepEqual(d.parts[0]?.rounds.map((r) => r.produced), concreteRounds(part).map((r) => r.count.produced));
    assert.equal(d.parts[0]?.roundCount, 36);
  });

  it("sin muestra: dice que falta y no da cm", () => {
    const p = writtenOf([fixtureAPart()]);
    delete p.gauge;
    const d = describeWritten(p);
    assert.equal(d.gaugeStatus, "missing");
    assert.equal(d.parts[0]?.measures.status, "missing");
    assert.match(d.text, /Falta la muestra/);
    assert.doesNotMatch(d.text, /≈/);
  });

  it("muestra supuesta: medidas marcadas con 'estimación' y 'supuesto'", () => {
    const p = writtenOf([fixtureAPart()]);
    delete p.gauge;
    const d = describeWritten(p, { assumedGauge: { stitchesPer10cm: 18, rowsPer10cm: 22, gaugeStitch: "sc" } });
    assert.equal(d.gaugeStatus, "assumed");
    assert.equal(d.parts[0]?.measures.status, "assumed");
    assert.match(d.text, /≈/);
    assert.match(d.text, /estimación/);
    assert.match(d.text, /supuesto/);
  });

  it("la muestra del documento gana sobre la supuesta", () => {
    const d = describeWritten(writtenOf([fixtureAPart()]), { assumedGauge: { stitchesPer10cm: 5, rowsPer10cm: 5, gaugeStitch: "sc" } });
    assert.equal(d.parts[0]?.measures.status, "estimate");
  });

  it("oreja con 2 copias anclada a la cabeza (forma de C-17)", () => {
    const d = describeWritten(withEars(10));
    assert.deepEqual(d.parts[1]?.copyLabels, ["Oreja (1 de 2)", "Oreja (2 de 2)"]);
    assert.match(d.text, /Se teje 2 veces/);
    assert.equal(d.placements.find((x) => x.part === "oreja" && x.copy === 0)?.text, "Oreja (1 de 2): se cose a la pieza «Cabeza», entre la V10 y la V11, contando desde el anillo mágico.");
    assert.equal(d.placements.find((x) => x.part === "oreja" && x.copy === 1)?.kind, "automatic");
    // Sin distancia en puntos desde el inicio de la vuelta.
    assert.doesNotMatch(d.text, /a \d+ puntos del inicio|stitch/);
  });

  it("vuelta final del anfitrión, attach start y dialecto", () => {
    const last = describeWritten(withEars(39));
    assert.match(last.placements[1]?.text ?? "", /sobre la V39, la última/);
    const p = withEars(10);
    const at = p.layout?.placements[1]?.at;
    if (at?.type === "surface") at.attach = "start";
    assert.match(describeWritten(p).placements[1]?.text ?? "", /por el centro de su inicio/);
    const us = describeWritten(withEars(10), { dialect: "us" });
    assert.match(us.placements[1]?.text ?? "", /entre la R10 y la R11/);
    assert.match(us.text, /R1: 6 sc \(6\)/);
    assert.match(us.text, /inglés US/);
  });

  it("documento con errores: mensaje, sin lanzar", () => {
    const bad = { ...writtenOf([fixtureAPart()]), parts: "no" } as unknown as WrittenPattern;
    const d = describeWritten(bad);
    assert.equal(d.ok, false);
    assert.match(d.text, /No se puede describir/);
  });
});

function genPattern(r: Rng): WrittenPattern {
  const parts: Part[] = [];
  const n = r.int(1, 3);
  for (let i = 0; i < n; i++) {
    const base = r.bool() ? fixtureAPart(r.int(11, 20)) : fixtureBPart();
    const part: Part = { ...base, id: `p${i}`, name: r.pick(["Cuerpo", "Oreja", "Cabeza"]) + i };
    if (r.bool(0.5)) part.copies = r.int(1, 4);
    parts.push(part);
  }
  const p = writtenOf(parts);
  if (r.bool(0.3)) delete p.gauge;
  if (r.bool(0.5) && n > 1) {
    p.layout = {
      placements: [
        { target: { part: "p1", copy: 0 }, at: { type: "surface", host: { part: "p0", copy: 0 }, round: r.int(1, 36), stitch: r.int(0, 5), attach: r.pick(["end", "start"] as const), rotationDeg: [0, 0, 0] } },
      ],
    };
  }
  return p;
}

describe("describeWritten: propiedades", () => {
  it("los conteos coinciden con los del motor, para cada dialecto", () => {
    forAll("conteos", (r) => ({ p: genPattern(r), d: r.pick(["es", "us", "uk"] as Dialect[]) }), ({ p, d }) => {
      const out = describeWritten(p, { dialect: d });
      assert.equal(out.ok, true);
      assert.equal(out.parts.length, p.parts.length);
      p.parts.forEach((part, i) => {
        const s = summarizePart(part);
        const o = out.parts[i];
        assert.equal(o?.roundCount, s.rounds);
        assert.equal(o?.totalStitches, s.totalStitches);
        assert.equal(o?.finalCount, s.finalCount);
        assert.deepEqual(o?.rounds.map((x) => x.produced), concreteRounds(part).map((x) => x.count.produced));
        assert.equal(o?.copyLabels.length, part.copies ?? 1);
      });
      assert.equal(out.placements.length, p.parts.reduce((a, x) => a + (x.copies ?? 1), 0));
      assert.equal(out.gaugeStatus, p.gauge ? "document" : "missing");
      if (!p.gauge) assert.doesNotMatch(out.text, /≈/);
    });
  });

  it("es determinista, no modifica el documento y nunca lanza con basura", () => {
    forAll("determinista", genPattern, (p) => {
      const copy = structuredClone(p);
      assert.deepEqual(describeWritten(p), describeWritten(p));
      assert.deepEqual(p, copy);
    }, 100);
    for (const junk of [null, undefined, 1, "x", [], {}, { kind: "written" }, { kind: "written", parts: [null] }]) {
      assert.doesNotThrow(() => describeWritten(junk as never));
      assert.doesNotThrow(() => describeWritten(junk as never, null as never));
    }
  });
});
