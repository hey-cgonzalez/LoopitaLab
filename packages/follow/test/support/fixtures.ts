import { NO_STITCH, type Chart, type ChartPattern, type Yarn } from "@loopitalab/pattern-core";

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

/** Celdas a partir de filas en texto: `A`, `B`, `C` son lanas y `.` es `NO_STITCH` (convención de casos-dominio-fase-3.md). */
export function cellsFrom(rows: string[]): number[] {
  const out: number[] = [];
  for (const row of rows) for (const ch of row) out.push(ch === "." ? NO_STITCH : ch.charCodeAt(0) - 65);
  return out;
}
