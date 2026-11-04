/**
 * Modelo canónico de patrón (ADR 0001). Única fuente de verdad: todas las
 * vistas (gráfico, texto, render, 3D, modo tejiendo, PDF) se derivan de aquí.
 */

export const SCHEMA_VERSION = 1 as const;

export type Technique = "knit" | "crochet";

/** Categoría de grosor del Craft Yarn Council, de 0 (Lace) a 7 (Jumbo). */
export type WeightCategory = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface FiberShare {
  /** Identificador de fibra de `yarn-catalog` (por ejemplo, "lana", "algodon"). */
  fiber: string;
  /** Porcentaje entre 0 y 100. La suma de la composición debe ser 100. */
  percent: number;
}

export interface YarnColor {
  /** Color en sRGB, formato #RRGGBB. */
  hex: string;
  /** Identificador de la paleta propia, si el color viene de ella. */
  paletteId?: string;
}

export interface Yarn {
  /** Identificador corto y único dentro del patrón (A, B, C…). */
  id: string;
  weight: WeightCategory;
  composition: FiberShare[];
  color: YarnColor;
  /** Texto libre privado ("la lana que tengo"). Nunca se publica. */
  note?: string;
}

export interface Gauge {
  /** Puntos en 10 cm. */
  stitchesPer10cm: number;
  /** Filas o vueltas en 10 cm. */
  rowsPer10cm: number;
}

export interface Origin {
  kind: "manual" | "ai" | "ai_edited";
  /** Modelo de IA usado, si corresponde. */
  model?: string;
  promptVersion?: string;
}

interface PatternBase {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  technique: Technique;
  yarns: Yarn[];
  gauge?: Gauge;
  origin: Origin;
  notes?: string[];
}

// ---------------------------------------------------------------- Gráficos

/** Valor de celda sin punto (fuera de forma, por ejemplo en un gráfico en cuña). */
export const NO_STITCH = -1;

export type RenderShape = "flat" | "tube" | "circle" | "yoke";

export interface Chart {
  /** Ancho del motivo en puntos. */
  width: number;
  /** Alto del motivo en filas. */
  height: number;
  /**
   * `width × height` celdas por filas. La fila 0 es la primera que se teje.
   * Cada valor es el índice de la lana en `yarns`, o `NO_STITCH`.
   */
  cells: number[];
  /** Repeticiones del motivo a lo ancho (x) y a lo alto (y). */
  repeat: { x: number; y: number };
  /** En redondo o ida y vuelta: define la lectura y si las hebras se unen al cerrar la vuelta. */
  workedIn: "rounds" | "rows";
  renderAs: RenderShape;
  direction: "bottom_up" | "top_down";
}

export interface ChartPattern extends PatternBase {
  kind: "chart";
  chart: Chart;
}

// ---------------------------------------------------------- Patrón escrito

/** Códigos canónicos de punto (crochet). Ver `stitches.ts`. */
export type StitchCode = "sc" | "hdc" | "dc" | "tr" | "slst" | "ch" | "inc" | "inc3" | "dec" | "sk";

/** Por qué hebra se trabaja el punto. */
export type Loop = "both" | "front" | "back";

export interface StitchItem {
  type: "stitch";
  stitch: StitchCode;
  /** Cuántas veces seguidas se hace el punto (≥ 1). */
  count: number;
  /** Omitido equivale a "both". */
  loop?: Loop;
}

export interface GroupItem {
  type: "group";
  items: Item[];
  /** Repeticiones del grupo (≥ 1). */
  times: number;
}

export interface ColorItem {
  type: "color";
  /** `id` de la lana que pasa a usarse desde este punto. */
  yarn: string;
}

export type Item = StitchItem | GroupItem | ColorItem;

export interface Round {
  /** Número de la vuelta. */
  number: number;
  /** Si existe, la misma vuelta se repite hasta este número inclusive ("V5–8"). */
  through?: number;
  items: Item[];
  /** Conteo que declara el patrón al final de la vuelta, por ejemplo "(18)". */
  expected?: number;
  note?: string;
}

export type PartStart =
  | { type: "magic_ring" }
  | { type: "chain"; count: number };

export interface Part {
  id: string;
  name: string;
  /** spiral: vueltas continuas · joined: vueltas cerradas · flat: hileras de ida y vuelta. */
  construction: "spiral" | "joined" | "flat";
  start: PartStart;
  /** Lana con la que se empieza la parte. */
  startYarn: string;
  rounds: Round[];
  /** Instrucción de cierre o relleno ("rellenar y cerrar"). */
  finish?: string;
}

export interface WrittenPattern extends PatternBase {
  kind: "written";
  parts: Part[];
  assembly?: string[];
}

export type Pattern = ChartPattern | WrittenPattern;

// ---------------------------------------------------------------- Errores

export type Severity = "error" | "warning" | "info";

export interface Issue {
  /** Código estable, en mayúsculas (por ejemplo, "ROUND_COUNT_MISMATCH"). */
  code: string;
  severity: Severity;
  /** Ruta dentro del modelo, por ejemplo "parts[0].rounds[3]". */
  path: string;
  /** Mensaje en español, en lenguaje de tejedora. */
  message: string;
  /** Datos para que la interfaz o la IA expliquen o corrijan el problema. */
  data?: Record<string, unknown>;
}
