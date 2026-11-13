import { SCHEMA_VERSION, type ChartPattern, type Part, type WrittenPattern, type Yarn } from "../../src/index.ts";

export const yarnA: Yarn = { id: "A", weight: 3, composition: [{ fiber: "algodon", percent: 100 }], color: { hex: "#E9DDBE", paletteId: "crudo" } };
export const yarnB: Yarn = { id: "B", weight: 3, composition: [{ fiber: "algodon", percent: 100 }], color: { hex: "#BA222C", paletteId: "rojo" } };
export const yarnC: Yarn = {
  id: "C",
  weight: 1,
  composition: [{ fiber: "lana", percent: 75 }, { fiber: "poliamida", percent: 25 }],
  color: { hex: "#1A2540", paletteId: "azul-marino" },
};

/** Bolita clásica de amigurumi, conteos conocidos. */
export const BALL_TEXT = `Parte: Bolita
Inicio: AM
Construcción: espiral
Lana: A
V1: 6 pb en AM (6)
V2: aum x6 (12)
V3: [pb, aum] x6 (18)
V4: [pb 2, aum] x6 (24)
V5-8: 24 pb (24)
V9: [pb 2, dism] x6 (18)
V10: [pb, dism] x6 (12)
V11: dism x6 (6)
Cierre: rellenar y cerrar`;

export function ballPart(): Part {
  return {
    id: "bolita",
    name: "Bolita",
    construction: "spiral",
    start: { type: "magic_ring" },
    startYarn: "A",
    rounds: [
      { number: 1, items: [{ type: "stitch", stitch: "sc", count: 6 }], expected: 6 },
      { number: 2, items: [{ type: "stitch", stitch: "inc", count: 6 }], expected: 12 },
      { number: 3, items: [{ type: "group", times: 6, items: [{ type: "stitch", stitch: "sc", count: 1 }, { type: "stitch", stitch: "inc", count: 1 }] }], expected: 18 },
      { number: 4, items: [{ type: "group", times: 6, items: [{ type: "stitch", stitch: "sc", count: 2 }, { type: "stitch", stitch: "inc", count: 1 }] }], expected: 24 },
      { number: 5, through: 8, items: [{ type: "stitch", stitch: "sc", count: 24 }], expected: 24 },
      { number: 9, items: [{ type: "group", times: 6, items: [{ type: "stitch", stitch: "sc", count: 2 }, { type: "stitch", stitch: "dec", count: 1 }] }], expected: 18 },
      { number: 10, items: [{ type: "group", times: 6, items: [{ type: "stitch", stitch: "sc", count: 1 }, { type: "stitch", stitch: "dec", count: 1 }] }], expected: 12 },
      { number: 11, items: [{ type: "stitch", stitch: "dec", count: 6 }], expected: 6 },
    ],
    finish: "rellenar y cerrar",
  };
}

export function ballPattern(): WrittenPattern {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "p-bolita",
    title: "Bolita",
    technique: "crochet",
    kind: "written",
    yarns: [structuredClone(yarnA)],
    origin: { kind: "manual" },
    parts: [ballPart()],
  };
}

/**
 * Banda de 4 × 3 con dos lanas, en redondo y vista de tubo (sin avisos del validador):
 *   fila 0: A A A A
 *   fila 1: A B A B
 *   fila 2: B B B B
 */
export function smallChart(): ChartPattern {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "p-gorro",
    title: "Copa",
    technique: "knit",
    kind: "chart",
    yarns: [structuredClone(yarnA), structuredClone(yarnB)],
    gauge: { stitchesPer10cm: 24, rowsPer10cm: 28 },
    origin: { kind: "manual" },
    chart: { width: 4, height: 3, cells: [0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1], repeat: { x: 5, y: 2 }, workedIn: "rounds", renderAs: "tube", direction: "bottom_up" },
  };
}
