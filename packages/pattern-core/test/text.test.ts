import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPart, formatRound, lookupStitch, parsePart, parseRound, type Round } from "../src/index.ts";
import { BALL_TEXT, ballPart } from "./support/fixtures.ts";

function ok(text: string): Round {
  const r = parseRound(text);
  if (!r.ok) assert.fail(`No se pudo leer "${text}": ${r.issues.map((i) => i.message).join("; ")}`);
  return r.value;
}

describe("abreviaturas", () => {
  it("reconoce español e inglés", () => {
    assert.equal(lookupStitch("pb"), "sc");
    assert.equal(lookupStitch("SC"), "sc");
    assert.equal(lookupStitch("aum."), "inc");
    assert.equal(lookupStitch("dism"), "dec");
    assert.equal(lookupStitch("invdec"), "dec");
    assert.equal(lookupStitch("cad"), "ch");
    assert.equal(lookupStitch("sl st"), "slst");
    assert.equal(lookupStitch("mpa"), "hdc");
    assert.equal(lookupStitch("xyz"), undefined);
  });
});

describe("parseRound", () => {
  it("lee las formas de cantidad", () => {
    assert.deepEqual(ok("V1: 6 pb en AM (6)"), { number: 1, items: [{ type: "stitch", stitch: "sc", count: 6 }], expected: 6 });
    assert.deepEqual(ok("V2: aum x6 (12)").items, [{ type: "stitch", stitch: "inc", count: 6 }]);
    assert.deepEqual(ok("V2: aum ×6").items, [{ type: "stitch", stitch: "inc", count: 6 }]);
    assert.deepEqual(ok("V3: pb 6").items, [{ type: "stitch", stitch: "sc", count: 6 }]);
    assert.deepEqual(ok("Rnd 1: 6 sc in MR (6)").items, [{ type: "stitch", stitch: "sc", count: 6 }]);
  });

  it("lee grupos, anidados y con 'veces'", () => {
    assert.deepEqual(ok("V3: [pb, aum] x6 (18)").items, [
      { type: "group", times: 6, items: [{ type: "stitch", stitch: "sc", count: 1 }, { type: "stitch", stitch: "inc", count: 1 }] },
    ]);
    const nested = ok("V4: [pb, [pb 2, aum] x2] 3 veces");
    assert.equal(nested.items[0]?.type, "group");
    assert.deepEqual(nested.items, [
      {
        type: "group",
        times: 3,
        items: [
          { type: "stitch", stitch: "sc", count: 1 },
          { type: "group", times: 2, items: [{ type: "stitch", stitch: "sc", count: 2 }, { type: "stitch", stitch: "inc", count: 1 }] },
        ],
      },
    ]);
  });

  it("lee rangos, hebras y cambios de lana", () => {
    const r = ok("V5-8: @B, 24 pb ht (24)");
    assert.equal(r.number, 5);
    assert.equal(r.through, 8);
    assert.deepEqual(r.items, [{ type: "color", yarn: "B" }, { type: "stitch", stitch: "sc", count: 24, loop: "back" }]);
    assert.equal(ok("Vuelta 5 a 8: 24 pb").through, 8);
    assert.deepEqual(ok("R2: sc blo x3").items, [{ type: "stitch", stitch: "sc", count: 3, loop: "back" }]);
    assert.deepEqual(ok("R2: 3 sc in flo").items, [{ type: "stitch", stitch: "sc", count: 3, loop: "front" }]);
  });

  it("informa errores con columna", () => {
    const r = parseRound("V3: [pb, aum x6 (18)");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.issues[0]?.code, "PARSE_BRACKETS");

    const u = parseRound("V3: pb, zz 3, aum");
    assert.equal(u.ok, false);
    if (!u.ok) {
      assert.equal(u.issues[0]?.code, "PARSE_UNKNOWN_STITCH");
      assert.equal(u.issues[0]?.data?.column, 9);
    }

    const g = parseRound("V3: [pb, aum]");
    assert.equal(g.ok, false);
    if (!g.ok) assert.equal(g.issues[0]?.code, "PARSE_GROUP_TIMES");

    assert.equal(parseRound("pb x6").ok, false);
    assert.equal(parseRound("V2: ").ok, false);
    assert.equal(parseRound("V2: pb,, aum").ok, false);
  });
});

describe("formatRound", () => {
  it("escribe en español y en inglés", () => {
    const r = ok("V3: [pb, aum] x6 (18)");
    assert.equal(formatRound(r, "es"), "V3: [pb, aum] x6 (18)");
    assert.equal(formatRound(r, "us"), "R3: [sc, inc] x6 (18)");
    assert.equal(formatRound(ok("V5-8: @B, 24 pb ht (24)"), "es"), "V5-8: @B, 24 pb ht (24)");
  });
});

describe("parsePart / formatPart", () => {
  it("lee la bolita completa igual que el modelo de referencia", () => {
    const r = parsePart(BALL_TEXT, { id: "bolita" });
    if (!r.ok) assert.fail(r.issues.map((i) => i.message).join("; "));
    assert.deepEqual(r.value, ballPart());
  });

  it("ida y vuelta en ambos dialectos", () => {
    for (const dialect of ["es", "us"] as const) {
      const text = formatPart(ballPart(), dialect);
      const back = parsePart(text, { id: "bolita" });
      if (!back.ok) assert.fail(back.issues.map((i) => i.message).join("; "));
      assert.deepEqual(back.value, ballPart());
    }
  });

  it("detecta el anillo mágico sin encabezado y lee cadeneta inicial", () => {
    const r = parsePart("V1: 6 pb en AM (6)\nV2: aum x6 (12)", { id: "x" });
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.value.start, { type: "magic_ring" });
    const c = parsePart("Inicio: cad 11\nConstrucción: hileras\nH1: 10 pb (10)", { id: "y" });
    assert.ok(c.ok);
    if (c.ok) {
      assert.deepEqual(c.value.start, { type: "chain", count: 11 });
      assert.equal(c.value.construction, "flat");
    }
  });

  it("rechaza líneas que no entiende", () => {
    const r = parsePart("Inicio: AM\nhola mundo\nV1: 6 pb", { id: "x" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.issues[0]?.code, "PARSE_LINE");
  });
});
