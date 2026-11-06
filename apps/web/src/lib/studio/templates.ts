import { NO_STITCH, paintCells, type CellRef, type ChartPattern, type NewChartInput, type Yarn } from "@loopitalab/pattern-core";

/*
 * Plantillas de "Nuevo diseño" (T8). Solo dibujan celdas con las operaciones de pattern-core; no calculan
 * conteos. Los colores salen de la paleta propia (ids de yarn-catalog) y la composición es una fibra al 100 %:
 * es un punto de partida editable, no un dato de la usuaria.
 */

export type NewDesignInput = Omit<NewChartInput, "id">;

export interface Template {
  id: "band" | "crown" | "blank";
  name: string;
  description: string;
  input: NewDesignInput;
  /** Celdas por pintar sobre el documento recién creado (todo empieza en la lana de fondo). */
  paint(doc: ChartPattern): ChartPattern;
}

const yarn = (id: string, hex: string, paletteId: string): Yarn => ({
  id,
  weight: 4,
  composition: [{ fiber: "lana", percent: 100 }],
  color: { hex, paletteId },
});

const BACKGROUND = yarn("A", "#E9DDBE", "crudo");
const CONTRAST = yarn("B", "#A62B30", "rojo");

function paintAll(doc: ChartPattern, refs: CellRef[], value: number): ChartPattern {
  const chart = paintCells(doc.chart, refs, value, doc.yarns.length);
  return chart === doc.chart ? doc : { ...doc, chart };
}

/** Banda en tubo: rombos de contraste sobre fondo. Motivo de 8 × 8 repetido 12 veces a lo ancho. */
export const bandTemplate: Template = {
  id: "band",
  name: "Banda en tubo",
  description: "Rombos de dos colores en redondo, para el borde de un gorro o de un cuello. Motivo de 8 × 8 que se repite 12 veces.",
  input: {
    title: "Banda de rombos",
    width: 8,
    height: 8,
    repeat: { x: 12, y: 1 },
    workedIn: "rounds",
    renderAs: "tube",
    direction: "bottom_up",
    yarns: [BACKGROUND, CONTRAST],
  },
  paint(doc) {
    // Rombo centrado: |x - 3,5| + |y - 3,5| <= 3,5, es decir, dos columnas centrales y se abre/cierra de a una.
    const refs: CellRef[] = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (Math.abs(x - 3.5) + Math.abs(y - 3.5) <= 3.5) refs.push({ x, y });
    return paintAll(doc, refs, 1);
  },
};

/**
 * Copa en cuña: 8 repeticiones, cada una con un punto menos por vuelta (de 10 a 1) y un
 * lunar de contraste. Las casillas a la derecha de la cuña quedan "sin punto".
 */
export const crownTemplate: Template = {
  id: "crown",
  name: "Copa en cuña de 8 repeticiones",
  description: "La copa de un gorro tejida en redondo, con 8 cuñas que disminuyen hacia la punta. Cada cuña tiene un lunar de contraste.",
  input: {
    title: "Copa en cuña",
    width: 10,
    height: 10,
    repeat: { x: 8, y: 1 },
    workedIn: "rounds",
    renderAs: "circle",
    direction: "bottom_up",
    yarns: [BACKGROUND, CONTRAST],
  },
  paint(doc) {
    // La vuelta y (0 = borde) conserva 10 − y puntos por cuña: las columnas x ≥ 10 − y quedan sin punto.
    const none: CellRef[] = [];
    for (let y = 0; y < 10; y++) for (let x = 10 - y; x < 10; x++) none.push({ x, y });
    const withShape = paintAll(doc, none, NO_STITCH);
    return paintAll(withShape, [{ x: 3, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 3 }], 1);
  },
};

export const TEMPLATES: readonly Template[] = [bandTemplate, crownTemplate];

export { BACKGROUND as DEFAULT_BACKGROUND_YARN };
