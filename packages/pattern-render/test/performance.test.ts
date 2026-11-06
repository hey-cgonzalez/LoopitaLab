/**
 * Rendimiento (T7): un motivo de 200 × 200 (el máximo, ADR 0003, E7) con todas las
 * opciones. El SVG es un derivado estático (imprimir, PDF), no el ciclo de pintar en
 * vivo: el tope es holgado y la medición se informa en la salida de la prueba.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_STITCH } from "@loopitalab/pattern-core";
import { chartToSvg, describeChart } from "../src/index.ts";
import { chartPattern, yarnA, yarnB, yarnC } from "./support/fixtures.ts";

/** Tope en milisegundos (mediana de varias corridas, en Node). */
const BUDGET_MS = 500;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

function time(fn: () => void, runs = 5): number {
  fn(); // calentamiento
  const ts: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    ts.push(performance.now() - t0);
  }
  return median(ts);
}

describe("rendimiento", () => {
  const side = 200;
  const cells = Array.from({ length: side * side }, (_, i) => (i % 7 === 0 ? NO_STITCH : i % 3));
  const p = chartPattern({ width: side, height: side, cells, workedIn: "rows", renderAs: "flat" }, [yarnA, yarnB, yarnC]);
  p.gauge = { stitchesPer10cm: 24, rowsPer10cm: 32 };

  it(`chartToSvg de 200 × 200 con todas las opciones en menos de ${BUDGET_MS} ms`, (t) => {
    let size = 0;
    const ms = time(() => {
      size = chartToSvg(p, { rowNumbers: true, symbols: true, showRepeats: true }).length;
    });
    t.diagnostic(`chartToSvg 200 × 200: ${ms.toFixed(1)} ms (mediana), ${(size / 1024 / 1024).toFixed(2)} MB`);
    assert.ok(ms < BUDGET_MS, `tardó ${ms.toFixed(1)} ms`);
  });

  it("describeChart de 200 × 200 en menos de 200 ms", (t) => {
    const ms = time(() => describeChart(p));
    t.diagnostic(`describeChart 200 × 200: ${ms.toFixed(1)} ms (mediana)`);
    assert.ok(ms < 200, `tardó ${ms.toFixed(1)} ms`);
  });
});
