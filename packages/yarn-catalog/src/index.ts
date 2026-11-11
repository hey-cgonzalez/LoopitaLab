/**
 * Referencia de lanas sin marcas: grosores CYC 0–7, fibras y paleta propia.
 * Los datos viven en `../data/*.json` (ver fuentes dentro de cada archivo).
 */
import fibrasData from "../data/fibras.json" with { type: "json" };
import grosoresData from "../data/grosores.json" with { type: "json" };
import paletaData from "../data/paleta.json" with { type: "json" };

export interface WeightCategoryInfo {
  cat: number;
  nombre: string;
  ingles: string[];
  alias: string[];
  /** Puntos de jersey en 10 cm [mín, máx]. */
  muestraPalillo: [number, number];
  /** Agujas en mm [mín, máx]; `null` = sin máximo. */
  agujasMm: [number, number | null];
  muestraCrochet: [number, number];
  /** Punto con que se mide la muestra de crochet ("pb" o "pa"). */
  muestraCrochetPunto: string;
  crochetMm: [number, number | null];
  /** Origen (dominio público de referencia) de cada alias atribuido a una tienda. */
  fuentesAlias: Record<string, string>;
}

export interface FiberInfo {
  id: string;
  nombre: string;
  origen: string;
  elasticidad: "baja" | "media" | "alta";
  calidez: "baja" | "media" | "alta";
  definicion: "baja" | "media" | "alta";
  halo: "bajo" | "medio" | "alto";
  brillo: "bajo" | "medio" | "alto";
  afieltra: boolean;
  notas: string;
  usos: string[];
  vistoEn: string[];
}

export interface PaletteColor {
  id: string;
  nombre: string;
  hex: string;
  tono: number;
  familia: string;
}

export const WEIGHTS = grosoresData.categorias as WeightCategoryInfo[];
export const FIBERS = fibrasData.fibras as FiberInfo[];
export const PALETTE: PaletteColor[] = paletaData.familias.flatMap((f) =>
  f.colores.map((c) => ({ id: c.id, nombre: c.nombre, hex: c.hex, tono: c.tono, familia: f.nombre })),
);

export const FIBER_IDS: ReadonlySet<string> = new Set(FIBERS.map((f) => f.id));
export const PALETTE_IDS: ReadonlySet<string> = new Set(PALETTE.map((c) => c.id));

export function weightInfo(cat: number): WeightCategoryInfo | undefined {
  return WEIGHTS.find((w) => w.cat === cat);
}

/** Etiqueta para la interfaz, por ejemplo "Medio (Worsted / Aran)". */
export function weightLabel(cat: number): string {
  const w = weightInfo(cat);
  if (!w) return `Categoría ${cat}`;
  return `${w.nombre} (${w.ingles.slice(0, 2).join(" / ")})`;
}

/**
 * Proporción filas / puntos supuesta por tipo de punto. El CYC solo publica puntos; las filas son un supuesto visible.
 * - `stockinette` 1,35: solo punto jersey a palillo (caso 19, rango 1,2 a 1,5).
 * - `crochet-pb` 1,2 y `crochet-pa` 0,6: SUPUESTOS, validar con tejedora (T1b). El punto alto es mucho más alto que
 *   el bajo, por eso la proporción es menor.
 */
export const ROWS_PER_STITCH_BY_ASSUMPTION = {
  stockinette: 1.35,
  "crochet-pb": 1.2,
  "crochet-pa": 0.6,
} as const;

/** Compatibilidad: proporción del punto jersey a palillo. */
export const ROWS_PER_STITCH_RATIO = ROWS_PER_STITCH_BY_ASSUMPTION.stockinette;

export type GaugeAssumption = "stockinette" | "crochet-pb" | "crochet-pa";

export interface SuggestedGauge {
  /** Puntos en 10 cm: punto medio del rango CYC, o el tope cuando el CYC da solo "X o menos". */
  stitchesPer10cm: number;
  /** Filas en 10 cm: `round(puntos × proporción de ROWS_PER_STITCH_BY_ASSUMPTION[assumption])`. Es un supuesto, no un dato del CYC; en crochet, validar con tejedora. */
  rowsPer10cm: number;
  /** Punto con el que se supone la muestra: jersey (palillo), o pb / pa (crochet). */
  assumption: GaugeAssumption;
  /** true cuando el rango del CYC es solo un tope (categoría 7). */
  lowConfidence: boolean;
}

/** Muestra inicial sugerida (punto medio del rango CYC). La muestra real de la tejedora siempre manda. */
export function suggestedGauge(cat: number, technique: "knit" | "crochet"): SuggestedGauge | undefined {
  const w = weightInfo(cat);
  if (!w) return undefined;
  const isKnit = technique === "knit";
  const [lo, hi] = isKnit ? w.muestraPalillo : w.muestraCrochet;
  const stitchesPer10cm = lo === 0 ? hi : Math.round((lo + hi) / 2);
  const assumption: GaugeAssumption = isKnit ? "stockinette" : w.muestraCrochetPunto === "pa" ? "crochet-pa" : "crochet-pb";
  return {
    stitchesPer10cm,
    rowsPer10cm: Math.round(stitchesPer10cm * ROWS_PER_STITCH_BY_ASSUMPTION[assumption]),
    assumption,
    lowConfidence: lo === 0,
  };
}

// ------------------------------------------------------------ Color

function lin(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** sRGB (#RRGGBB) a CIELAB (iluminante D65). */
export function hexToLab(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Color inválido: ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => lin(parseInt(h ?? "0", 16))) as [number, number, number];
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Diferencia de color CIEDE2000. */
export function deltaE2000(a: [number, number, number], b: [number, number, number]): number {
  const [L1, a1, b1] = a;
  const [L2, a2, b2] = b;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = (deg(Math.atan2(b1, a1p)) + 360) % 360;
  const h2p = (deg(Math.atan2(b2, a2p)) + 360) % 360;
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dh = h2p - h1p;
  if (C1p * C2p === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dh / 2));
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp: number;
  if (C1p * C2p === 0) hbp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2;
  else hbp = (h1p + h2p - 360) / 2;
  const T =
    1 - 0.17 * Math.cos(rad(hbp - 30)) + 0.24 * Math.cos(rad(2 * hbp)) + 0.32 * Math.cos(rad(3 * hbp + 6)) - 0.2 * Math.cos(rad(4 * hbp - 63));
  const dth = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(rad(2 * dth)) * RC;
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
}

const paletteLab = PALETTE.map((c) => ({ color: c, lab: hexToLab(c.hex) }));

/**
 * Umbral de diferencia CIEDE2000 por debajo del cual un color personalizado se rotula "prácticamente igual" a uno de la
 * paleta: 2,3 es la diferencia apenas perceptible (JND) usual para CIEDE2000 (ADR 0008, F3-36).
 * Un hex que no es de la paleta nunca lleva `paletteId`, aunque quede por debajo del umbral.
 */
export const NEAR_COLOR_DELTA_E = 2.3;

/** Los `k` colores de la paleta más cercanos (CIEDE2000), de menor a mayor diferencia; empates por orden de la paleta. */
export function nearestPaletteColors(hex: string, k: number): { color: PaletteColor; deltaE: number }[] {
  const lab = hexToLab(hex);
  const n = Number.isFinite(k) ? Math.floor(k) : 0;
  if (n <= 0) return [];
  return paletteLab
    .map((p, i) => ({ color: p.color, deltaE: deltaE2000(lab, p.lab), i }))
    .sort((a, b) => a.deltaE - b.deltaE || a.i - b.i)
    .slice(0, n)
    .map(({ color, deltaE }) => ({ color, deltaE }));
}

/** Color de la paleta más cercano a un color cualquiera (usado por imagen → patrón). Es el caso k = 1. */
export function nearestPaletteColor(hex: string): { color: PaletteColor; deltaE: number } {
  return nearestPaletteColors(hex, 1)[0]!;
}

// ------------------------------------------------------------ Búsqueda de grosores (ADR 0008, enmienda T1-8)

export interface WeightMatch {
  cat: number;
  matched: string;
  kind: "name" | "english" | "alias";
  approximate: boolean;
}

export type WeightQueryHint = "too_short" | "ply_varies_by_country";

/** Sin tildes, en minúsculas, paréntesis / barras / guiones como espacios y espacios colapsados. */
function normalizeQuery(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[()/\\\-\u2013\u2014]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MIN_QUERY_LENGTH = 2;
const KIND_RANK = { name: 0, english: 1, alias: 2 } as const;

const searchEntries = WEIGHTS.flatMap((w) => [
  { cat: w.cat, text: w.nombre, kind: "name" as const },
  ...w.ingles.map((text) => ({ cat: w.cat, text, kind: "english" as const })),
  ...w.alias.map((text) => ({ cat: w.cat, text, kind: "alias" as const })),
]).map((e) => ({ ...e, norm: normalizeQuery(e.text) }));

function hasPlyWord(q: string): boolean {
  return q.split(" ").includes("ply");
}

/**
 * Categorías cuyo nombre, nombre en inglés o alias empieza con el texto en alguna palabra (o secuencia de palabras).
 * Una entrada por categoría con su mejor coincidencia; primero las exactas (texto igual a la entrada completa) y luego
 * las parciales, cada grupo por categoría. Toda coincidencia por alias es `approximate`. Cualquier "ply" y menos de 2
 * caracteres devuelven `[]` (ver `weightQueryHint`).
 */
export function findWeights(query: string): WeightMatch[] {
  const q = normalizeQuery(query);
  if (q.length < MIN_QUERY_LENGTH || hasPlyWord(q)) return [];
  const best = new Map<number, { entry: (typeof searchEntries)[number]; exact: boolean }>();
  for (const entry of searchEntries) {
    const exact = entry.norm === q;
    if (!exact && !(entry.norm.startsWith(q) || entry.norm.includes(` ${q}`))) continue;
    const cur = best.get(entry.cat);
    if (!cur || (exact && !cur.exact) || (exact === cur.exact && KIND_RANK[entry.kind] < KIND_RANK[cur.entry.kind])) {
      best.set(entry.cat, { entry, exact });
    }
  }
  return [...best.entries()]
    .sort(([ca, a], [cb, b]) => Number(b.exact) - Number(a.exact) || ca - cb)
    .map(([cat, { entry }]) => ({ cat, matched: entry.text, kind: entry.kind, approximate: entry.kind === "alias" }));
}

/** Ayuda para una búsqueda sin resultados útiles; `undefined` si no hay nada que explicar. */
export function weightQueryHint(query: string): WeightQueryHint | undefined {
  const q = normalizeQuery(query);
  if (q.length < MIN_QUERY_LENGTH) return "too_short";
  if (hasPlyWord(q)) return "ply_varies_by_country";
  return undefined;
}

// ------------------------------------------------------------ Metraje estimado (ADR 0008, sección 6)

/**
 * Supuestos de dominio del metraje. Todos son supuestos, no datos medidos: se rotulan en la interfaz.
 * Pendiente de tejedoras (T1b): comparar con el metraje real de 2 o 3 proyectos terminados.
 */
export const YARN_LENGTH_ASSUMPTIONS = {
  /**
   * Largo de la lazada de un punto jersey ≈ 3,8 × su ancho: Munden Kw = 3,8 (lana, punto liso, seco-relajado;
   * en húmedo-relajado Kw = 4,1). Fuente: Munden, D. L., "The geometry and dimensional properties of plain-knit fabrics",
   * J. Text. Inst. 50(7), 1959, 448-471, citado vía resumen secundario (no se abrió el original).
   * Validar con tejedora: en colorwork a hebras la tensión cambia.
   */
  knitLoopFactor: 3.8,
  /** La hebra flotante se deja un poco floja: 10 % más que el ancho que cruza. Supuesto; validar con tejedora. */
  floatSlack: 1.1,
  /** Margen por colas, uniones y muestra: 10 %. Supuesto; validar con tejedora. */
  wasteMargin: 0.1,
  /** Rango mostrado alrededor de la estimación (sobre los metros crudos). Validar con tejedora. */
  rangeLow: 0.85,
  rangeHigh: 1.2,
  /** Paso del redondeo, en metros: `meters` y `high` hacia arriba, `low` hacia abajo. */
  roundToMeters: 5,
} as const;

export type LengthAssumption = "assumed_gauge" | "low_confidence_weight" | "loop_factor" | "float_slack" | "waste_margin";

export interface LengthEstimate {
  /** Metros estimados (con margen), redondeados hacia arriba a `roundToMeters`. */
  meters: number;
  low: number;
  high: number;
  /** Supuestos usados, para rotularlos. Nunca vacío. `float_slack` solo si hay flotantes. */
  assumptions: LengthAssumption[];
}

const EPS = 1e-9;

/**
 * Convierte puntos y flotantes (en anchos de punto, salida de `yarnUsage`) a metros de una lana. Solo del gráfico: no
 * incluye elástico, montaje ni remate. Nunca gramos ni ovillos. En crochet devuelve `undefined` (sin factores validados).
 */
export function estimateYarnLength(
  usage: { stitches: number; floatStitches: number },
  gauge: { stitchesPer10cm: number },
  opts: { technique: "knit" | "crochet"; gaugeAssumed: boolean; lowConfidence?: boolean },
): LengthEstimate | undefined {
  if (opts.technique === "crochet") return undefined;
  const { stitches, floatStitches } = usage;
  if (!(Number.isFinite(stitches) && stitches >= 0 && Number.isFinite(floatStitches) && floatStitches >= 0)) {
    throw new RangeError("Puntos y flotantes deben ser números finitos no negativos.");
  }
  if (!(Number.isFinite(gauge.stitchesPer10cm) && gauge.stitchesPer10cm > 0)) {
    throw new RangeError("La muestra (puntos en 10 cm) debe ser un número positivo.");
  }
  const A = YARN_LENGTH_ASSUMPTIONS;
  const r = A.roundToMeters;
  const stitchWidthCm = 10 / gauge.stitchesPer10cm;
  const raw = ((stitches * A.knitLoopFactor + floatStitches * A.floatSlack) * stitchWidthCm * (1 + A.wasteMargin)) / 100;

  const assumptions: LengthAssumption[] = [];
  if (opts.gaugeAssumed) assumptions.push("assumed_gauge");
  if (opts.lowConfidence) assumptions.push("low_confidence_weight");
  assumptions.push("loop_factor");
  if (floatStitches > 0) assumptions.push("float_slack");
  assumptions.push("waste_margin");

  if (raw === 0) return { meters: 0, low: 0, high: 0, assumptions };
  return {
    meters: Math.ceil(raw / r - EPS) * r,
    low: Math.max(r, Math.floor((raw * A.rangeLow) / r + EPS) * r),
    high: Math.ceil((raw * A.rangeHigh) / r - EPS) * r,
    assumptions,
  };
}
