/**
 * Perfil de las partes de un patrón escrito (ADR 0010, secciones 1 y 2, con las enmiendas
 * C-2 a C-8 y C-12). Derivado puro: lee los conteos del motor (`concreteRounds`) y nunca
 * los recalcula. Lo usan el validador (avisos de crecimiento), las medidas en centímetros
 * y `viewer-3d`.
 */
import { STITCHES } from "./stitches.ts";
import type { Gauge, Item, Part, Round, StitchCode } from "./types.ts";
import { concreteRounds, type ConcreteRound } from "./written.ts";

/** Punto con que se midió la muestra. Solo puntos con cuerpo (enmienda C-3). */
export type GaugeStitch = "sc" | "hdc" | "dc" | "tr";

/**
 * Alto de cada punto relativo al punto bajo (enmienda C-5, F4-17 a F4-26). Que falte el
 * valor es parte del contrato: `slst` y `ch` no tienen una cifra con fuente y quedan fuera
 * del promedio de la vuelta; `sk` no produce. `inc`, `inc3` y `dec` son de punto bajo (C-12).
 * // validar con tejedora (todos los valores; `tr` va de 2,5 a 3 según la fuente)
 */
export const STITCH_HEIGHT_FACTOR: Readonly<Partial<Record<StitchCode, number>>> = Object.freeze({
  sc: 1,
  hdc: 1.5,
  dc: 2,
  tr: 2.5,
  inc: 1,
  inc3: 1,
  dec: 1,
});

/**
 * Holgura del paso radial (enmienda C-5, F4-36 a F4-41): deja plano y sin aviso el disco de
 * punto bajo con 6 aumentos por vuelta (`Δr/s` = 1,146 con 1,2 vueltas por punto) y avisa
 * desde 7. Nunca produce errores, solo información. // validar con tejedora
 */
export const PROFILE_RADIAL_TOLERANCE = 1.25;

/**
 * Margen relativo de redondeo al comparar `|Δr|` con `s × tolerancia`: una vuelta que queda
 * justo en el borde (por ejemplo, volver al conteo de dos vueltas atrás después de un acotado)
 * no se acota por un error de coma flotante, que daría `strain` 1 con el radio acotado.
 */
const CLAMP_EPSILON = 1e-9;

export interface ShapeMetrics {
  /** Ancho de un punto bajo en cm: 10 / gauge.stitchesPer10cm. */
  stitchWidthCm: number;
  /**
   * Alto de una vuelta de punto bajo en cm, convertido desde el punto de la muestra:
   * (10 / gauge.rowsPer10cm) / STITCH_HEIGHT_FACTOR[gaugeStitch] (enmienda C-3).
   */
  roundHeightCm: number;
  /** Punto con que se midió la muestra (se informa junto a las medidas). */
  gaugeStitch: GaugeStitch;
  /** true si la muestra es supuesta (no está en el documento). */
  assumed: boolean;
}

/**
 * Métricas del punto a partir de la muestra. `gaugeStitch` es obligatorio (C-3, F4-43): la
 * muestra del documento se lee como punto bajo (`"sc"`); la supuesta de `suggestedGauge`
 * traduce `assumption` (`"crochet-pb"` → `"sc"`, `"crochet-pa"` → `"dc"`). Supone una
 * muestra válida (puntos y vueltas en 10 cm, finitos y mayores que 0), como la de un
 * documento `savable`; con otra, los valores no tienen sentido (`Infinity` o `NaN`).
 */
export function shapeMetrics(gauge: Gauge, opts: { assumed: boolean; gaugeStitch: GaugeStitch }): ShapeMetrics {
  const factor = STITCH_HEIGHT_FACTOR[opts.gaugeStitch] ?? 1;
  return {
    stitchWidthCm: 10 / gauge.stitchesPer10cm,
    roundHeightCm: 10 / gauge.rowsPer10cm / factor,
    gaugeStitch: opts.gaugeStitch,
    assumed: opts.assumed,
  };
}

/** Suma de factores y de puntos producidos con valor, sin expandir las repeticiones. */
function heightSums(items: readonly Item[], acc: { sum: number; n: number }, times: number): void {
  for (const item of items) {
    if (item.type === "stitch") {
      if (!Object.hasOwn(STITCH_HEIGHT_FACTOR, item.stitch)) continue; // slst, ch, sk y códigos fuera de la tabla
      const factor = STITCH_HEIGHT_FACTOR[item.stitch] as number;
      // Se pondera por los puntos que produce cada ítem (`inc` deja 2, `dec` deja 1).
      const produced = STITCHES[item.stitch].produces * item.count * times;
      acc.sum += factor * produced;
      acc.n += produced;
    } else if (item.type === "group") {
      heightSums(item.items, acc, times * item.times);
    }
  }
}

/**
 * Factor de alto de una vuelta (sección 1): promedio de `STITCH_HEIGHT_FACTOR` de sus puntos
 * producidos con valor, ponderado por lo que produce cada uno. Si la vuelta solo produce
 * `slst` o `ch` (o nada), 1. // validar con tejedora
 */
export function roundHeightFactor(round: Round): number {
  const acc = { sum: 0, n: 0 };
  heightSums(round.items, acc, 1);
  return acc.n > 0 ? acc.sum / acc.n : 1;
}

export interface ProfileRing {
  /** Número de vuelta visible; 0 es el inicio (anillo mágico o cadeneta). */
  round: number;
  /** Conteo producido por la vuelta, de `concreteRounds` (el motor; nunca se recalcula). En el anillo 0, la cadeneta (0 con anillo mágico). */
  stitches: number;
  /** Radio efectivo en cm, ya acotado por el alto de la vuelta. */
  radiusCm: number;
  /** Altura del anillo sobre el inicio, en cm. */
  zCm: number;
  /** Alto de la vuelta en cm (sección 1). 0 en el anillo 0. */
  heightCm: number;
  /**
   * Circunferencia pedida (conteo × ancho) / circunferencia efectiva (2π × radio efectivo).
   * 1 = la tela queda lisa; > 1, ondula; < 1, frunce.
   */
  strain: number;
}

export interface RevolutionProfile {
  kind: "revolution";
  spiral: boolean;
  rings: ProfileRing[];
  heightCm: number;
  maxDiameterCm: number;
}

export interface PanelRow {
  row: number;
  stitches: number;
  widthCm: number;
  /** Altura acumulada al terminar la fila (borde superior), en cm. */
  yCm: number;
  heightCm: number;
}

export interface PanelProfile {
  kind: "panel";
  rows: PanelRow[];
  heightCm: number;
  maxWidthCm: number;
}

export type PartProfile = RevolutionProfile | PanelProfile;

/**
 * Paso radial de cada anillo desde el 1 (uso interno: validador). `ratio` es `Δr/s` con
 * signo; `evaluated` es false en la V1 sobre anillo mágico, que no se acota ni avisa (C-6).
 * `change` es la diferencia de conteo con el anillo anterior.
 */
export interface RadialStep {
  round: number;
  sourceIndex: number;
  change: number;
  ratio: number;
  evaluated: boolean;
  /** true si el perfil acotó el radio (tercer tramo). Es exactamente cuándo avisa el validador. */
  clamped: boolean;
  /** Factor de alto de la vuelta (1 = punto bajo). */
  heightFactor: number;
}

/**
 * Perfil de revolución y pasos radiales (sección 2, paso 3; enmienda C-4). `concrete` son las
 * vueltas concretas de la parte si quien llama ya las tiene (el validador, T20-M1); si no, se
 * piden a `concreteRounds`, que cuenta cada vuelta escrita a lo más dos veces.
 */
export function revolutionProfile(part: Part, metrics: ShapeMetrics, concrete: readonly ConcreteRound[] = concreteRounds(part)): { profile: RevolutionProfile; steps: RadialStep[] } {
  const w = metrics.stitchWidthCm;
  const tol = PROFILE_RADIAL_TOLERANCE;
  const ring = part.start.type === "magic_ring";
  const startCount = part.start.type === "chain" ? part.start.count : 0;
  const r0 = (startCount * w) / (2 * Math.PI);
  const rings: ProfileRing[] = [{ round: 0, stitches: startCount, radiusCm: r0, zCm: 0, heightCm: 0, strain: 1 }];
  const steps: RadialStep[] = [];
  let prevR = r0;
  let prevN = startCount;
  let z = 0;
  let maxR = r0;
  let factorIndex = -1;
  let factor = 1;
  concrete.forEach((c, i) => {
    if (c.sourceIndex !== factorIndex) {
      factor = roundHeightFactor(c.round);
      factorIndex = c.sourceIndex;
    }
    const s = factor * metrics.roundHeightCm;
    const n = c.count.produced;
    const target = (n * w) / (2 * Math.PI);
    const dr = target - prevR;
    let r = target;
    let dz: number;
    let strain = 1;
    const evaluated = !(i === 0 && ring);
    const limit = s * tol;
    let clamped = false;
    if (!evaluated) {
      // V1 sobre anillo mágico: el anillo se cierra tirando de la hebra (F4-1, F4-2).
      dz = Math.sqrt(Math.max(s * s - target * target, 0));
    } else if (Math.abs(dr) <= s) {
      dz = Math.sqrt(s * s - dr * dr);
    } else if (Math.abs(dr) - limit <= CLAMP_EPSILON * limit) {
      dz = 0;
    } else {
      dz = 0;
      clamped = true;
      r = dr > 0 ? prevR + limit : Math.max(prevR - limit, 0);
      strain = r > 0 ? target / r : 1;
    }
    z += dz;
    if (r > maxR) maxR = r;
    rings.push({ round: c.number, stitches: n, radiusCm: r, zCm: z, heightCm: s, strain });
    steps.push({ round: c.number, sourceIndex: c.sourceIndex, change: n - prevN, ratio: s > 0 ? dr / s : 0, evaluated, clamped, heightFactor: factor });
    prevR = r;
    prevN = n;
  });
  return { profile: { kind: "revolution", spiral: part.construction === "spiral", rings, heightCm: z, maxDiameterCm: 2 * maxR }, steps };
}

function panelProfile(part: Part, metrics: ShapeMetrics): PanelProfile {
  const rows: PanelRow[] = [];
  let y = 0;
  let maxW = 0;
  let factorIndex = -1;
  let factor = 1;
  for (const c of concreteRounds(part)) {
    if (c.sourceIndex !== factorIndex) {
      factor = roundHeightFactor(c.round);
      factorIndex = c.sourceIndex;
    }
    const h = factor * metrics.roundHeightCm;
    const width = c.count.produced * metrics.stitchWidthCm;
    y += h;
    if (width > maxW) maxW = width;
    rows.push({ row: c.number, stitches: c.count.produced, widthCm: width, yCm: y, heightCm: h });
  }
  return { kind: "panel", rows, heightCm: y, maxWidthCm: maxW };
}

/**
 * Perfil de una parte. En espiral y vueltas unidas, superficie de revolución con los tres
 * tramos del paso radial (C-4); en hileras, panel plano. Usa siempre el conteo producido y
 * funciona con todo documento `savable` (también con vueltas que no cuadran).
 */
export function partProfile(part: Part, metrics: ShapeMetrics): PartProfile {
  return part.construction === "flat" ? panelProfile(part, metrics) : revolutionProfile(part, metrics).profile;
}

/** Alto y diámetro (o ancho) máximo, para "mide ≈ 12 cm de alto". Siempre es una estimación. */
export function partDimensions(profile: PartProfile): { heightCm: number; widthCm: number } {
  return profile.kind === "revolution"
    ? { heightCm: profile.heightCm, widthCm: profile.maxDiameterCm }
    : { heightCm: profile.heightCm, widthCm: profile.maxWidthCm };
}
