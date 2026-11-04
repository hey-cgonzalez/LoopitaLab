import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_STITCH, cellAt, dimensionsCm, fullRow, fullSize, rowFloats, stitchTotal, yarnTotals, type Chart } from "../src/index.ts";
import { smallChart } from "./support/fixtures.ts";

describe("gráfico con repeticiones", () => {
  it("calcula tamaño, celdas y totales", () => {
    const { chart } = smallChart();
    assert.deepEqual(fullSize(chart), { width: 20, height: 6 });
    assert.equal(cellAt(chart, 5, 1), 1); // x=5 → 1 del motivo, fila 1: A B A B
    assert.equal(cellAt(chart, 4, 4), 0); // y=4 → fila 1 del motivo, x=0 → A
    assert.equal(stitchTotal(chart), 12 * 10);
    // motivo: A=6, B=6 → ×10
    assert.deepEqual(yarnTotals(chart, 2), [60, 60]);
  });

  it("ignora las celdas fuera de forma", () => {
    const chart: Chart = { ...smallChart().chart, cells: [0, 0, 0, NO_STITCH, 0, 1, NO_STITCH, NO_STITCH, 1, 1, 1, 1], repeat: { x: 2, y: 1 } };
    assert.deepEqual(fullRow(chart, 1), [0, 1, 0, 1]);
    assert.equal(stitchTotal(chart), 9 * 2);
  });

  it("mide medidas según la muestra", () => {
    const { chart, gauge } = smallChart();
    const d = dimensionsCm(chart, gauge!);
    assert.ok(Math.abs(d.widthCm - (20 / 24) * 10) < 1e-9);
    assert.ok(Math.abs(d.heightCm - (6 / 28) * 10) < 1e-9);
  });
});

describe("hebras flotantes", () => {
  const base: Chart = { width: 8, height: 1, cells: [0, 1, 1, 1, 1, 1, 1, 0], repeat: { x: 1, y: 1 }, workedIn: "rows", renderAs: "flat", direction: "bottom_up" };

  it("en hileras solo cuenta los tramos interiores", () => {
    const f = rowFloats(base, 0);
    assert.deepEqual(f.find((x) => x.yarn === 0)?.length, 6);
    assert.deepEqual(f.find((x) => x.yarn === 1)?.length, 0);
  });

  it("en redondo une el final con el inicio", () => {
    const f = rowFloats({ ...base, workedIn: "rounds" }, 0);
    assert.equal(f.find((x) => x.yarn === 0)?.length, 6);
    assert.equal(f.find((x) => x.yarn === 1)?.length, 2);
  });

  it("las repeticiones acortan o alargan la hebra según el dibujo", () => {
    // A B B B en redondo, repetido 3 veces: A queda suelta 3 puntos entre repeticiones.
    const chart: Chart = { ...base, width: 4, cells: [0, 1, 1, 1], repeat: { x: 3, y: 1 }, workedIn: "rounds" };
    assert.equal(rowFloats(chart, 0).find((x) => x.yarn === 0)?.length, 3);
  });

  it("una fila de un solo color no tiene hebras flotantes", () => {
    assert.deepEqual(rowFloats({ ...base, cells: [0, 0, 0, 0, 0, 0, 0, 0] }, 0), []);
  });
});
