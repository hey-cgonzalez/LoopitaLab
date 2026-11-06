import { NO_STITCH, paintCells, type CellRef, type ChartPattern, type NewChartInput, type Yarn } from "@loopitalab/pattern-core";
import { STUDIO_TEXTS } from "@/lib/studio-texts.ts";

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

/** Puntos por cuña en el borde de la copa y al cerrar. */
const CROWN_WEDGE = 14;
const CROWN_CLOSE = 2;
/** Vueltas de la copa: cada cantidad de puntos por cuña dura 2 vueltas (de 14 a 2: 13 cantidades). */
const CROWN_ROUNDS = (CROWN_WEDGE - CROWN_CLOSE + 1) * 2;

/**
 * Copa de gorro de adulto en 8 cuñas (E18, experto-tejido). Cada cuña empieza con 14 puntos (112 en el borde) y pierde
 * 1 punto cada 2 vueltas hasta quedar en 2 (16 en total), que se cierran pasando la hebra. Las casillas a la derecha de
 * cada cuña quedan "sin punto"; los conteos los calcula pattern-core a partir de esas casillas.
 * Motivo: lunares de contraste en diagonal en las vueltas 3 a 10, uno cada 4 puntos, así ninguna hebra flotante pasa
 * de 3 puntos. // validar con tejedora (ritmo de disminución y tamaño del borde)
 */
export const crownTemplate: Template = {
  id: "crown",
  name: STUDIO_TEXTS.asistente.plantillaCopa,
  description:
    "La copa de un gorro de adulto tejida en redondo: 8 cuñas de 14 puntos (112 en el borde) que pierden 1 punto por cuña cada 2 vueltas hasta quedar 16 puntos, que se cierran pasando la hebra. Lleva lunares de contraste en diagonal. El tamaño final depende de tu muestra.",
  input: {
    title: "Copa de gorro",
    width: CROWN_WEDGE,
    height: CROWN_ROUNDS,
    repeat: { x: 8, y: 1 },
    workedIn: "rounds",
    renderAs: "circle",
    direction: "bottom_up",
    yarns: [BACKGROUND, CONTRAST],
  },
  paint(doc) {
    // La vuelta y (0 = borde) conserva 14 − ⌊y / 2⌋ puntos por cuña: las columnas a partir de ahí quedan sin punto.
    const keep = (y: number) => CROWN_WEDGE - Math.floor(y / 2);
    const none: CellRef[] = [];
    const dots: CellRef[] = [];
    for (let y = 0; y < CROWN_ROUNDS; y++) {
      for (let x = keep(y); x < CROWN_WEDGE; x++) none.push({ x, y });
      if (y >= 2 && y <= 9) for (let x = 0; x < keep(y); x++) if ((x + y) % 4 === 0) dots.push({ x, y });
    }
    return paintAll(paintAll(doc, none, NO_STITCH), dots, 1);
  },
};

export const TEMPLATES: readonly Template[] = [bandTemplate, crownTemplate];

export { BACKGROUND as DEFAULT_BACKGROUND_YARN };
