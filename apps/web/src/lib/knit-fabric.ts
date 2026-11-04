/**
 * Dibuja un tejido de jersey con un motivo de colorwork: cada punto es una V formada
 * por dos "hojas". Devuelve un path SVG por color, así el resultado pesa poco.
 * Es decorativo; el render real del producto vivirá en packages/stitch-render.
 */

/** Motivo de flor (filas de abajo hacia arriba no importan aquí: es simétrico). */
const MOTIF = [
  "................",
  "..x.........x...",
  ".xox.......xox..",
  "..x....o....x...",
  "......ooo.......",
  ".....oo.oo......",
  "......ooo.......",
  "..x....o....x...",
  ".xox.......xox..",
  "..x.........x...",
] as const;

/** Colores de la paleta propia (packages/yarn-catalog/data/paleta.json). */
export const FABRIC_COLORS = {
  ".": "#1A2540", // Azul marino
  x: "#CFA02A", // Mostaza
  o: "#EC9DB0", // Rosado
} as const;

export const FABRIC_GAP = "#0F1729";

type Key = keyof typeof FABRIC_COLORS;

export interface Fabric {
  width: number;
  height: number;
  stitchW: number;
  stitchH: number;
  /** Un punto de fondo en el origen, para usar como patrón SVG repetido. */
  baseStitch: string;
  baseColor: string;
  /** Puntos del motivo, un path por color. */
  paths: { color: string; d: string }[];
}

const r = (n: number) => Math.round(n * 10) / 10;

/** Las dos piernas de la V de un punto en (x, y). Se solapan con la fila de arriba como en un tejido real. */
function stitchPath(x: number, y: number, w: number, h: number): string {
  return (
    `M${r(x + 0.1 * w)} ${r(y - 0.15 * h)}Q${r(x + 0.02 * w)} ${r(y + 0.7 * h)} ${r(x + 0.49 * w)} ${r(y + h)}Q${r(x + 0.5 * w)} ${r(y + 0.3 * h)} ${r(x + 0.1 * w)} ${r(y - 0.15 * h)}Z` +
    `M${r(x + 0.9 * w)} ${r(y - 0.15 * h)}Q${r(x + 0.98 * w)} ${r(y + 0.7 * h)} ${r(x + 0.51 * w)} ${r(y + h)}Q${r(x + 0.5 * w)} ${r(y + 0.3 * h)} ${r(x + 0.9 * w)} ${r(y - 0.15 * h)}Z`
  );
}

/** Proporción de un punto real con muestra de 24 puntos × 28 filas: más ancho que alto. */
export function knitFabric(cols: number, rows: number, stitchW = 12, stitchH = 10.3, offsetCol = 0): Fabric {
  const d: Record<Exclude<Key, ".">, string[]> = { x: [], o: [] };
  const motifH = MOTIF.length;
  const motifW = MOTIF[0].length;
  for (let row = 0; row < rows; row++) {
    const line = MOTIF[row % motifH] as string;
    for (let col = 0; col < cols; col++) {
      const k = line[(col + offsetCol) % motifW] as Key;
      if (k === ".") continue;
      d[k].push(stitchPath(col * stitchW, row * stitchH, stitchW, stitchH));
    }
  }
  return {
    width: cols * stitchW,
    height: rows * stitchH,
    stitchW,
    stitchH,
    baseStitch: stitchPath(0, 0.15 * stitchH, stitchW, stitchH * 0.85),
    baseColor: FABRIC_COLORS["."],
    paths: (["x", "o"] as const).map((k) => ({ color: FABRIC_COLORS[k], d: d[k].join("") })),
  };
}
