import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIBERS, PALETTE, WEIGHTS, deltaE2000, hexToLab, nearestPaletteColor, suggestedGauge, weightLabel } from "../src/index.ts";

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
    assert.deepEqual(suggestedGauge(4, "knit"), { stitchesPer10cm: 18 });
    assert.deepEqual(suggestedGauge(7, "knit"), { stitchesPer10cm: 6 });
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
