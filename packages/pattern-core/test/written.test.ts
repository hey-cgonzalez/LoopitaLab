import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { concreteRounds, countRound, expandRound, summarizePart, type Round } from "../src/index.ts";
import { ballPart } from "./support/fixtures.ts";

describe("conteo de vueltas", () => {
  it("cuenta la bolita vuelta a vuelta", () => {
    const counts = concreteRounds(ballPart()).map((r) => [r.number, r.count.consumed, r.count.produced]);
    assert.deepEqual(counts, [
      [1, 6, 6],
      [2, 6, 12],
      [3, 12, 18],
      [4, 18, 24],
      [5, 24, 24],
      [6, 24, 24],
      [7, 24, 24],
      [8, 24, 24],
      [9, 24, 18],
      [10, 18, 12],
      [11, 12, 6],
    ]);
  });

  it("resume la parte", () => {
    const s = summarizePart(ballPart());
    assert.equal(s.rounds, 11);
    assert.equal(s.finalCount, 6);
    assert.equal(s.totalStitches, 6 + 12 + 18 + 24 * 5 + 18 + 12 + 6);
    assert.deepEqual(s.stitchesByYarn, { A: s.totalStitches });
  });

  it("sigue los cambios de lana dentro de grupos repetidos", () => {
    // [@B, pb, @A, pb] x3 empezando en A: cada pasada teje 1 B y 1 A.
    const round: Round = {
      number: 1,
      items: [
        {
          type: "group",
          times: 3,
          items: [
            { type: "color", yarn: "B" },
            { type: "stitch", stitch: "sc", count: 1 },
            { type: "color", yarn: "A" },
            { type: "stitch", stitch: "sc", count: 1 },
          ],
        },
      ],
    };
    const c = countRound(round, "A");
    assert.deepEqual(c.producedByYarn, { B: 3, A: 3 });
    assert.equal(c.endYarn, "A");
  });

  it("la lana de la primera pasada de un grupo depende de la lana inicial", () => {
    // [pb, @B, pb] x2 desde A: A, B, B, B
    const round: Round = {
      number: 1,
      items: [{ type: "group", times: 2, items: [{ type: "stitch", stitch: "sc", count: 1 }, { type: "color", yarn: "B" }, { type: "stitch", stitch: "sc", count: 1 }] }],
    };
    assert.deepEqual(countRound(round, "A").producedByYarn, { A: 1, B: 3 });
    assert.deepEqual(
      expandRound(round, "A").stitches.map((s) => s.yarn),
      ["A", "B", "B", "B"],
    );
  });

  it("la lana pasa de una vuelta a la siguiente", () => {
    const part = ballPart();
    part.rounds[1]!.items = [{ type: "color", yarn: "B" }, { type: "stitch", stitch: "inc", count: 6 }];
    const rounds = concreteRounds(part);
    assert.equal(rounds[1]?.startYarn, "A");
    assert.equal(rounds[2]?.startYarn, "B");
    assert.deepEqual(rounds[2]?.count.producedByYarn, { B: 18 });
  });
});
