/**
 * Guardia de rendimiento en Node (CA-P5, ADR 0004): `layoutGeometry` con 40.000 puntos
 * (motivo de 20 × 20 con repeticiones de 10 × 10), en las tres formas.
 *
 * - Se informa la mediana de 9 corridas (después de calentar) con `t.diagnostic`.
 * - Falla si supera 3 veces la referencia registrada.
 * - Referencia: medida el 2026-11-06 en un Apple M1 (8 núcleos, 8 GB, Node 24): plano
 *   0,9 ms, tubo 1,7 ms y círculo 2,1 ms. Se registra el doble, para un equipo de gama
 *   media o un runner de CI: 2, 3,5 y 4,5 ms. El presupuesto del ADR (20 ms para la
 *   geometría completa) queda holgado incluso al triple.
 * - Para ajustar la tolerancia en un equipo lento sin tocar la referencia:
 *   `STITCH_RENDER_PERF_FACTOR=5 node --test test/perf.test.ts`.
 * - En CI (variable `CI` definida, como en GitHub Actions) el factor por omisión es 6: los
 *   runners compartidos son más lentos y ruidosos que un M1 y las medianas están por debajo de
 *   2 ms. Medido en QA (2026-11-06) con `taskpolicy -b` (núcleos de eficiencia del M1): 6 a 9 ms
 *   en plano, 10 a 13 en tubo y 15 a 20 en círculo; con 3 falla siempre, con 6 pasa. Sigue
 *   detectando un algoritmo cuadrático (40.000² operaciones serían segundos).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Chart } from "@loopitalab/pattern-core";
import { buildGrid, colorize, instanceBounds, layoutGeometry } from "../src/index.ts";
import { GAUGE } from "./support/fixtures.ts";

export const REFERENCE_MS = { flat: 2, tube: 3.5, circle: 4.5 } as const;
const FACTOR = Number(process.env.STITCH_RENDER_PERF_FACTOR ?? (process.env.CI ? 6 : 3));

function chart40k(renderAs: Chart["renderAs"]): Chart {
  return {
    width: 20,
    height: 20,
    cells: Array.from({ length: 400 }, (_, i) => (i * 7) % 3),
    repeat: { x: 10, y: 10 },
    workedIn: "rounds",
    renderAs,
    direction: "bottom_up",
  };
}

function median(fn: () => void, runs = 9, warmup = 4): number {
  for (let i = 0; i < warmup; i++) fn();
  const ts: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    ts.push(performance.now() - t);
  }
  ts.sort((a, b) => a - b);
  return ts[ts.length >> 1] as number;
}

for (const shape of ["flat", "tube", "circle"] as const) {
  test(`CA-P5: layoutGeometry de 40.000 puntos en ${shape} no supera ${FACTOR} × ${REFERENCE_MS[shape]} ms`, (t) => {
    const chart = chart40k(shape);
    const l = layoutGeometry(chart, { gauge: GAUGE });
    assert.equal(l.count, 40_000);
    const ms = median(() => layoutGeometry(chart, { gauge: GAUGE }));
    const colorMs = median(() => colorize(l, chart));
    const cellMs = median(() => colorize(l, chart, [37]));
    const indexMs = median(() => buildGrid(l, instanceBounds(l)), 5, 2);
    t.diagnostic(`${shape}: layoutGeometry ${ms.toFixed(2)} ms (referencia ${REFERENCE_MS[shape]} ms) · colorize completo ${colorMs.toFixed(2)} ms · colorize de 1 celda ${cellMs.toFixed(3)} ms · índice espacial ${indexMs.toFixed(2)} ms`);
    assert.ok(ms <= REFERENCE_MS[shape] * FACTOR, `layoutGeometry tardó ${ms.toFixed(2)} ms; el máximo es ${(REFERENCE_MS[shape] * FACTOR).toFixed(1)} ms`);
    // Presupuesto de colorize incremental del ADR 0004: 5 ms.
    assert.ok(cellMs < 5, `colorize incremental tardó ${cellMs.toFixed(2)} ms`);
  });
}
