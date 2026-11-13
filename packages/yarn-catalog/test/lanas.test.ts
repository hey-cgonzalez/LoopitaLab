import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NEAR_COLOR_DELTA_E, PALETTE, YARN_LENGTH_ASSUMPTIONS, estimateYarnLength, findWeights, hexToLab, deltaE2000,
  nearestPaletteColor, nearestPaletteColors, weightQueryHint,
} from "../src/index.ts";
import { forAll } from "./support/property.ts";
import { readFileSync, readdirSync } from "node:fs";

const first = (q: string) => findWeights(q)[0]?.cat;
const GAUGE18 = { stitchesPer10cm: 18 };
const HAT = { stitches: 3360, floatStitches: 3360 };

describe("metraje (ADR 0008, T1-6)", () => {
  it("caso F3-21: gorro de 2 lanas en damero, cat 4 con muestra supuesta", () => {
    // validar con tejedora: comparar con 2 o 3 gorros terminados
    const e = estimateYarnLength(HAT, GAUGE18, { technique: "knit", gaugeAssumed: true })!;
    assert.equal(e.meters, 105);
    assert.equal(e.low, 85);
    assert.equal(e.high, 125);
    assert.deepEqual([...e.assumptions].sort(), ["assumed_gauge", "float_slack", "loop_factor", "waste_margin"]);
    assert.equal(e.meters * 2, 210);
  });

  it("caso F3-22: bandas sin flotantes", () => {
    const e = estimateYarnLength({ stitches: 3360, floatStitches: 0 }, GAUGE18, { technique: "knit", gaugeAssumed: true })!;
    assert.equal(e.meters, 80); // 78 m crudos
    assert.ok(!e.assumptions.includes("float_slack"));
  });

  it("caso F3-23: muestra del documento de 22 puntos", () => {
    const e = estimateYarnLength(HAT, { stitchesPer10cm: 22 }, { technique: "knit", gaugeAssumed: false })!;
    assert.ok(!e.assumptions.includes("assumed_gauge"));
    assert.ok(e.meters < 105);
  });

  it("caso F3-24: categoría 7 marca baja confianza", () => {
    const e = estimateYarnLength(HAT, { stitchesPer10cm: 6 }, { technique: "knit", gaugeAssumed: true, lowConfidence: true })!;
    assert.ok(e.assumptions.includes("low_confidence_weight"));
  });

  it("caso F3-25: crochet no tiene estimación", () => {
    assert.equal(estimateYarnLength(HAT, GAUGE18, { technique: "crochet", gaugeAssumed: false }), undefined);
  });

  it("sin puntos: todo en 0; con pocos, mínimo un paso en low", () => {
    const z = estimateYarnLength({ stitches: 0, floatStitches: 0 }, GAUGE18, { technique: "knit", gaugeAssumed: false })!;
    assert.deepEqual([z.meters, z.low, z.high], [0, 0, 0]);
    assert.ok(z.assumptions.length > 0);
    const s = estimateYarnLength({ stitches: 1, floatStitches: 0 }, GAUGE18, { technique: "knit", gaugeAssumed: false })!;
    assert.deepEqual([s.low, s.meters, s.high], [5, 5, 5]);
  });

  it("rechaza entradas inválidas", () => {
    assert.throws(() => estimateYarnLength(HAT, { stitchesPer10cm: 0 }, { technique: "knit", gaugeAssumed: false }), RangeError);
    assert.throws(() => estimateYarnLength({ stitches: -1, floatStitches: 0 }, GAUGE18, { technique: "knit", gaugeAssumed: false }), RangeError);
  });

  it("caso F3-26: propiedades", () => {
    const r = YARN_LENGTH_ASSUMPTIONS.roundToMeters;
    const gen = (g: { int(a: number, b: number): number; bool(): boolean }) => ({
      s: g.int(0, 20000), f: g.int(0, 20000), ds: g.int(0, 5000), df: g.int(0, 5000), p: g.int(5, 40), dp: g.int(1, 10), assumed: g.bool(),
    });
    forAll("metraje", gen, ({ s, f, ds, df, p, dp, assumed }) => {
      const o = { technique: "knit" as const, gaugeAssumed: assumed };
      const a = estimateYarnLength({ stitches: s, floatStitches: f }, { stitchesPer10cm: p }, o)!;
      assert.ok(a.low <= a.meters && a.meters <= a.high);
      for (const v of [a.low, a.meters, a.high]) assert.equal(v % r, 0);
      assert.equal(a.assumptions.includes("assumed_gauge"), assumed);
      const more = estimateYarnLength({ stitches: s + ds, floatStitches: f + df }, { stitchesPer10cm: p }, o)!;
      assert.ok(more.meters >= a.meters && more.low >= a.low && more.high >= a.high);
      const tighter = estimateYarnLength({ stitches: s, floatStitches: f }, { stitchesPer10cm: p + dp }, o)!;
      assert.ok(tighter.meters <= a.meters);
    });
  });
});

describe("búsqueda de grosores (ADR 0008, T1-8)", () => {
  it("caso F3-28: aran es la categoría 4 por nombre en inglés", () => {
    const m = findWeights("Aran");
    assert.equal(m[0]?.cat, 4);
    assert.equal(m[0]?.kind, "english");
    assert.deepEqual(findWeights("ÁRAN"), m);
  });

  it("caso F3-29: primer resultado de DK, fingering, sport, chunky, lace", () => {
    assert.deepEqual(["DK", "fingering", "sport", "chunky", "lace"].map(first), [3, 1, 2, 5, 0]);
    assert.deepEqual(findWeights("dk").map((m) => m.cat), [3, 2]);
    assert.equal(findWeights("dk")[1]?.approximate, true);
  });

  it("caso F3-30: light da la 2 (alias aproximado) y la 3", () => {
    // validar con tejedora
    const m = findWeights("light");
    assert.deepEqual(m.map((x) => [x.cat, x.kind, x.approximate]), [[2, "alias", true], [3, "english", false]]);
  });

  it("caso F3-31: mediano y grueso son alias aproximados", () => {
    const med = findWeights("mediano")[0]!;
    assert.deepEqual([med.cat, med.kind, med.approximate], [4, "alias", true]);
    const g = findWeights("grueso");
    assert.deepEqual(g.map((x) => x.cat), [5, 6]);
    assert.ok(g.every((x) => x.kind === "alias" && x.approximate));
  });

  it("caso F3-32: ply da vacío con ayuda", () => {
    // validar con tejedora (el documento lo deja "pendiente de validar por tejedora": no se mapea sin fuente)
    for (const q of ["4 ply", "8 ply", "Ply"]) {
      assert.deepEqual(findWeights(q), []);
      assert.equal(weightQueryHint(q), "ply_varies_by_country");
    }
    assert.equal(weightQueryHint("aran"), undefined);
  });

  it("caso F3-33: un carácter da vacío con too_short", () => {
    assert.deepEqual(findWeights("d"), []);
    assert.deepEqual(findWeights("  "), []);
    assert.equal(weightQueryHint("d"), "too_short");
  });

  it("propiedades: idempotente, insensible a tildes y mayúsculas, una por categoría", () => {
    const words = ["aran", "DK", "súper", "Super Grueso", "fino", "ligero", "abultado", "(dk", "sock", "x", "medio aran", "encaje", "jumbo"];
    forAll("búsqueda", (g) => g.pick(words), (q) => {
      const r = findWeights(q);
      assert.deepEqual(findWeights(q), r);
      assert.deepEqual(findWeights(q.toUpperCase()), r);
      assert.deepEqual(findWeights(q.normalize("NFD")), r);
      assert.equal(new Set(r.map((m) => m.cat)).size, r.length);
      assert.ok(r.every((m) => m.approximate === (m.kind === "alias")));
    });
    assert.equal(findWeights("super").length > 0, true);
    assert.deepEqual(findWeights("súper"), findWeights("super"));
  });
});

describe("color más cercano", () => {
  it("caso F3-36: un color de la paleta está a 0 de sí mismo y los demás están más lejos", () => {
    const p = PALETTE[5]!;
    const n = nearestPaletteColors(p.hex, 3);
    assert.equal(n[0]!.color.id, p.id);
    assert.ok(n[0]!.deltaE < NEAR_COLOR_DELTA_E);
    assert.ok(n[0]!.deltaE <= n[1]!.deltaE && n[1]!.deltaE <= n[2]!.deltaE);
    assert.equal(NEAR_COLOR_DELTA_E, 2.3);
  });

  it("nearestPaletteColor es el caso k = 1; k acotado", () => {
    assert.deepEqual(nearestPaletteColor("#123456"), nearestPaletteColors("#123456", 1)[0]);
    assert.equal(nearestPaletteColors("#123456", 0).length, 0);
    assert.equal(nearestPaletteColors("#123456", 999).length, PALETTE.length);
  });

  it("CIEDE2000 con caso conocido (Sharma 2005, par 1: 2,0425)", () => {
    const d = deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]);
    assert.ok(Math.abs(d - 2.0425) < 1e-3);
    assert.ok(deltaE2000(hexToLab("#ffffff"), hexToLab("#ffffff")) < 1e-9);
  });
});

describe("catálogo sin marcas", () => {
  it("caso F3-34: los JSON no contienen nombres de marcas conocidas", () => {
    const brands = /\b(lion brand|drops|katia|malabrigo|cascade|rowan|paons|ovejita|lanas gato|red heart|bernat|caron|patons|sirdar)\b/i;
    for (const f of readdirSync(new URL("../data/", import.meta.url))) {
      assert.ok(!brands.test(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8")), f);
    }
  });
});
