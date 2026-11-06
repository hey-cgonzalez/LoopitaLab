import type { Chart, ChartPattern, Yarn } from "@loopitalab/pattern-core";

export const yarnA: Yarn = { id: "A", weight: 3, composition: [{ fiber: "algodon", percent: 100 }], color: { hex: "#E9DDBE", paletteId: "crudo" } };
export const yarnB: Yarn = { id: "B", weight: 3, composition: [{ fiber: "algodon", percent: 100 }], color: { hex: "#BA222C", paletteId: "rojo" } };
export const yarnC: Yarn = { id: "C", weight: 3, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#1A2540" } };

/** Documento de gráfico a partir de un motivo; `cells` por filas, desde la fila 0. */
export function chartPattern(chart: Partial<Chart> & Pick<Chart, "width" | "height" | "cells">, yarns: Yarn[] = [yarnA, yarnB]): ChartPattern {
  return {
    schemaVersion: 1,
    id: "p-prueba",
    title: "Prueba",
    technique: "knit",
    kind: "chart",
    yarns: yarns.map((y) => structuredClone(y)),
    origin: { kind: "manual" },
    chart: { repeat: { x: 1, y: 1 }, workedIn: "rounds", renderAs: "tube", direction: "bottom_up", ...chart },
  };
}

/**
 * Banda de 4 × 3 con dos lanas, 5 × 2 repeticiones, en redondo:
 *   fila 0: A A A A
 *   fila 1: A B A B
 *   fila 2: B B B B
 */
export function band(): ChartPattern {
  const p = chartPattern({ width: 4, height: 3, cells: [0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1], repeat: { x: 5, y: 2 } });
  p.gauge = { stitchesPer10cm: 24, rowsPer10cm: 28 };
  p.title = "Copa";
  return p;
}
