import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIBERS, PALETTE, ROWS_PER_STITCH_RATIO, WEIGHTS, deltaE2000, hexToLab, nearestPaletteColor, suggestedGauge, weightLabel } from "../src/index.ts";

describe("datos de referencia", () => {
  it("tiene las 8 categorías de grosor en orden", () => {
    assert.deepEqual(WEIGHTS.map((w) => w.cat), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.equal(weightLabel(4), "Medio (Worsted / Aran)");
  });

  it("identificadores únicos en fibras y paleta", () => {
    assert.equal(new Set(FIBERS.map((f) => f.id)).size, FIBERS.length);
    assert.equal(PALETTE.length, 48);
    assert.equal(new Set(PALETTE.map((c) => c.id)).size, 48);
  });

  it("sugiere una muestra inicial dentro del rango", () => {
    assert.equal(suggestedGauge(4, "knit")?.stitchesPer10cm, 18);
    assert.equal(suggestedGauge(7, "knit")?.stitchesPer10cm, 6);
    assert.equal(suggestedGauge(99, "knit"), undefined);
  });

  it("caso 19: puntos y filas de jersey por categoría (filas supuestas con 1,35)", () => {
    const expected: [number, number][] = [
      [37, 50], [30, 41], [25, 34], [23, 31], [18, 24], [14, 19], [9, 12], [6, 8],
    ];
    expected.forEach(([stitches, rows], cat) => {
      assert.deepEqual(suggestedGauge(cat, "knit"), {
        stitchesPer10cm: stitches,
        rowsPer10cm: rows,
        assumption: "stockinette",
        lowConfidence: cat === 7,
      });
    });
  });

  it("caso 19: filas / puntos entre 1,2 y 1,5 en toda categoría (solo palillo)", () => {
    for (const w of WEIGHTS) {
      const g = suggestedGauge(w.cat, "knit")!;
      const ratio = g.rowsPer10cm / g.stitchesPer10cm;
      assert.ok(ratio >= 1.2 && ratio <= 1.5, `categoría ${w.cat}: ${ratio.toFixed(3)}`);
    }
  });

  it("categoría 7 marcada con baja confianza y el resto no", () => {
    assert.equal(suggestedGauge(7, "knit")?.lowConfidence, true);
    assert.equal(suggestedGauge(7, "crochet")?.lowConfidence, true);
    for (let cat = 0; cat <= 6; cat++) assert.equal(suggestedGauge(cat, "knit")?.lowConfidence, false);
  });

  it("crochet devuelve la misma forma y declara el punto supuesto", () => {
    assert.deepEqual(suggestedGauge(0, "crochet"), {
      stitchesPer10cm: 37,
      rowsPer10cm: 22,
      assumption: "crochet-pa",
      lowConfidence: false,
    });
    assert.equal(suggestedGauge(4, "crochet")?.assumption, "crochet-pb");
    assert.equal(ROWS_PER_STITCH_RATIO, 1.35);
  });

  it("crochet: puntos y filas supuestas (pb 1,2; pa 0,6; validar con tejedora)", () => {
    const expected: [number, number, number][] = [
      [0, 37, 22], [1, 27, 32], [2, 18, 22], [3, 15, 18], [4, 13, 16], [5, 10, 12], [6, 8, 10], [7, 6, 7],
    ];
    for (const [cat, stitches, rows] of expected) {
      const g = suggestedGauge(cat, "crochet")!;
      assert.equal(g.stitchesPer10cm, stitches, `categoría ${cat} puntos`);
      assert.equal(g.rowsPer10cm, rows, `categoría ${cat} filas`);
      assert.equal(g.assumption, cat === 0 ? "crochet-pa" : "crochet-pb");
    }
  });
});

describe("alias y fuentes", () => {
  it("ningún alias lleva nombre de tienda", () => {
    const tiendas = ["Orquídea", "Revés Derecho", "Modista"];
    for (const w of WEIGHTS) {
      for (const alias of w.alias) {
        for (const t of tiendas) assert.ok(!alias.includes(t), `categoría ${w.cat}: "${alias}" contiene "${t}"`);
      }
    }
  });

  it('no existen "Baby" ni "Roving" en alias ni en equivalencias en inglés', () => {
    for (const w of WEIGHTS) {
      for (const term of [...w.alias, ...w.ingles]) {
        assert.notEqual(term, "Baby", `categoría ${w.cat}`);
        assert.notEqual(term, "Roving", `categoría ${w.cat}`);
      }
    }
  });

  it("cada alias con origen atribuido es un alias de su categoría y el origen es un dominio", () => {
    for (const w of WEIGHTS) {
      for (const [alias, origen] of Object.entries(w.fuentesAlias)) {
        assert.ok(w.alias.includes(alias), `categoría ${w.cat}: "${alias}" no está en alias`);
        assert.match(origen, /^[a-z0-9-]+\.[a-z.]+$/, `categoría ${w.cat}: origen "${origen}"`);
      }
    }
  });
});

describe("color", () => {
  it("CIEDE2000 coincide con los datos de prueba de Sharma, Wu y Dalal (2005)", () => {
    // Pares 1, 7 y 17 de la tabla publicada.
    const cases: [[number, number, number], [number, number, number], number][] = [
      [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
      [[50, 0, 0], [50, -1, 2], 2.3669],
      [[50, 2.5, 0], [56, -27, -3], 31.903],
    ];
    for (const [a, b, expected] of cases) assert.ok(Math.abs(deltaE2000(a, b) - expected) < 1e-3, `${expected}`);
  });

  it("cada color de la paleta es su propio vecino más cercano", () => {
    for (const c of PALETTE) {
      const n = nearestPaletteColor(c.hex);
      assert.equal(n.color.id, c.id);
      assert.ok(n.deltaE < 1e-9);
    }
  });

  it("los tonos de una misma familia se distinguen (ΔE2000 ≥ 10)", () => {
    const families = new Map<string, typeof PALETTE>();
    for (const c of PALETTE) families.set(c.familia, [...(families.get(c.familia) ?? []), c]);
    for (const [fam, colors] of families) {
      for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) {
        const d = deltaE2000(hexToLab(colors[i]!.hex), hexToLab(colors[j]!.hex));
        assert.ok(d >= 10, `${fam}: ${colors[i]!.nombre} vs ${colors[j]!.nombre} = ${d.toFixed(1)}`);
      }
    }
  });
});
