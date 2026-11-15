/**
 * Descripción estructurada y textual de un patrón escrito (amigurumi): partes, vueltas,
 * copias, dónde va cada pieza y medidas estimadas. Texto plano (quien lo inserte en HTML
 * lo escapa). Regla de oro 2: ningún conteo es propio; todo sale de `pattern-core`
 * (`summarizePart`, `concreteRounds`, `partProfile`, `partDimensions`). Nunca lanza.
 */
import {
  concreteRounds,
  formatRound,
  partDimensions,
  partProfile,
  shapeMetrics,
  summarizePart,
  validatePattern,
  type Dialect,
  type GaugeStitch,
  type Part,
  type Placement,
  type WrittenPattern,
} from "@loopitalab/pattern-core";
import { formatDecimal, formatInt } from "./xml.ts";

export interface AssumedGauge {
  stitchesPer10cm: number;
  rowsPer10cm: number;
  /** Punto con que se mide la muestra supuesta (`suggestedGauge`: "sc" o "dc"). */
  gaugeStitch: GaugeStitch;
}

export interface DescribeWrittenOptions {
  /** Dialecto de las abreviaturas de las vueltas. Por omisión `"es"`. */
  dialect?: Dialect;
  /**
   * Muestra supuesta (por ejemplo, de `suggestedGauge` de `yarn-catalog`), usada solo si el
   * documento no trae muestra. Las medidas salen marcadas como supuesto. Sin ella y sin
   * muestra del documento, no hay medidas (regla de oro 6).
   */
  assumedGauge?: AssumedGauge;
  /** Incluir cada vuelta en el texto. Por omisión `true`. */
  includeRounds?: boolean;
}

export interface WrittenRoundDescription {
  number: number;
  /** "V5" (o "H5", "R5" según construcción y dialecto). */
  label: string;
  /** Puntos que produce la vuelta, del motor. */
  produced: number;
  /** Conteo declarado en el texto, si lo hay. */
  expected?: number;
  /** Línea de instrucciones en el dialecto; `null` en las vueltas siguientes de un rango ("V5-8"). */
  instructions: string | null;
}

export type MeasureStatus = "estimate" | "assumed" | "missing";

export interface WrittenMeasures {
  status: MeasureStatus;
  heightCm?: number;
  widthCm?: number;
  /** Frase lista para mostrar. */
  text: string;
}

export interface WrittenPartDescription {
  id: string;
  name: string;
  copies: number;
  /** "Oreja" si se teje una vez; "Oreja (1 de 2)", "Oreja (2 de 2)" si hay copias. */
  copyLabels: string[];
  roundCount: number;
  totalStitches: number;
  finalCount: number;
  rounds: WrittenRoundDescription[];
  measures: WrittenMeasures;
  text: string;
}

export interface WrittenPlacementDescription {
  /** `PartRef` de la copia. */
  part: string;
  copy: number;
  label: string;
  /** "automatic" si la copia no tiene entrada en `layout`. */
  kind: "free" | "surface" | "automatic";
  text: string;
}

export interface WrittenDescription {
  ok: boolean;
  dialect: Dialect;
  parts: WrittenPartDescription[];
  placements: WrittenPlacementDescription[];
  /** De dónde sale la muestra: del documento, supuesta o ausente. */
  gaugeStatus: "document" | "assumed" | "missing";
  text: string;
}

const DIALECT_NAMES: Record<Dialect, string> = { es: "español (Chile)", us: "inglés US", uk: "inglés UK" };

/** Una sola línea, sin saltos ni controles; vacío si no es texto. */
function oneLine(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.split(/[\r\n\u2028\u2029\t]+/).map((s) => s.trim()).filter(Boolean).join(" ");
}

const plural = (n: number, one: string, many: string) => `${formatInt(n)} ${n === 1 ? one : many}`;

function roundPrefix(part: Part, dialect: Dialect): string {
  if (dialect !== "es") return "R";
  return part.construction === "flat" ? "H" : "V";
}

function partName(part: Part, index: number): string {
  return oneLine(part.name) || `Parte ${index + 1}`;
}

function copiesOf(part: Part): number {
  const c = part.copies;
  return typeof c === "number" && Number.isInteger(c) && c >= 1 ? c : 1;
}

function copyLabel(name: string, copies: number, copy: number): string {
  return copies > 1 ? `${name} (${copy + 1} de ${copies})` : name;
}

function describeMeasures(part: Part, pattern: WrittenPattern, opts: DescribeWrittenOptions): WrittenMeasures {
  const doc = pattern.gauge;
  const assumed = !doc && opts.assumedGauge ? opts.assumedGauge : undefined;
  const gauge = doc ?? assumed;
  if (!gauge) {
    return { status: "missing", text: "Sin muestra: no se pueden dar medidas en cm. Indica la muestra para verlas." };
  }
  try {
    const metrics = shapeMetrics(
      { stitchesPer10cm: gauge.stitchesPer10cm, rowsPer10cm: gauge.rowsPer10cm },
      { assumed: assumed !== undefined, gaugeStitch: assumed ? assumed.gaugeStitch : "sc" },
    );
    const { heightCm, widthCm } = partDimensions(partProfile(part, metrics));
    if (!Number.isFinite(heightCm) || !Number.isFinite(widthCm)) throw new Error("medida no finita");
    const body = `≈ ${formatDecimal(heightCm)} cm de alto y ≈ ${formatDecimal(widthCm)} cm de ${part.construction === "flat" ? "ancho" : "diámetro"}`;
    if (assumed) {
      return {
        status: "assumed",
        heightCm,
        widthCm,
        text: `Mide ${body}. Es una estimación con una muestra supuesta (${formatInt(gauge.stitchesPer10cm)} puntos y ${formatInt(gauge.rowsPer10cm)} vueltas en 10 cm): es un supuesto, teje una muestra para comprobarla.`,
      };
    }
    return { status: "estimate", heightCm, widthCm, text: `Mide ${body}. Es una estimación a partir de la muestra del patrón.` };
  } catch {
    return { status: "missing", text: "No se pudieron calcular las medidas de esta parte." };
  }
}

function describePart(part: Part, index: number, pattern: WrittenPattern, opts: DescribeWrittenOptions, dialect: Dialect): WrittenPartDescription {
  const name = partName(part, index);
  const copies = copiesOf(part);
  const summary = summarizePart(part);
  const prefix = roundPrefix(part, dialect);
  const firstOfSource = new Set<number>();
  const rounds: WrittenRoundDescription[] = concreteRounds(part).map((r) => {
    const first = !firstOfSource.has(r.sourceIndex);
    firstOfSource.add(r.sourceIndex);
    const { note: _note, ...noNote } = r.round;
    const line = formatRound(noNote, dialect);
    const out: WrittenRoundDescription = {
      number: r.number,
      label: `${prefix}${r.number}`,
      produced: r.count.produced,
      instructions: first ? line : null,
    };
    if (r.round.expected !== undefined) out.expected = r.round.expected;
    return out;
  });
  const measures = describeMeasures(part, pattern, opts);
  const copyLabels = Array.from({ length: copies }, (_, i) => copyLabel(name, copies, i));
  const word = part.construction === "flat" ? ["hilera", "hileras"] : ["vuelta", "vueltas"];
  const lines = [
    `${name}: ${plural(summary.rounds, word[0] as string, word[1] as string)}, ${plural(summary.totalStitches, "punto", "puntos")} en total; termina con ${plural(summary.finalCount, "punto", "puntos")}.`,
  ];
  if (copies > 1) lines.push(`Se teje ${copies} veces: ${copyLabels.join(", ")}. Todas son iguales, sin espejo.`);
  lines.push(measures.text);
  const startWord = part.start.type === "magic_ring" ? (dialect === "es" ? "anillo mágico (AM)" : "anillo mágico (MR)") : `${formatInt(part.start.count)} cadenetas (${dialect === "es" ? "cad" : "ch"})`;
  lines.push(`Empieza con ${startWord}.`);
  if (opts.includeRounds !== false) {
    // Un rango ("V11-30") se escribe una vez; el conteo de cada vuelta está en `rounds`.
    for (const r of rounds) if (r.instructions !== null) lines.push(r.instructions);
  }
  return {
    id: String(part.id),
    name,
    copies,
    copyLabels,
    roundCount: summary.rounds,
    totalStitches: summary.totalStitches,
    finalCount: summary.finalCount,
    rounds,
    measures,
    text: lines.join("\n"),
  };
}

/** Frase de posición con la forma de C-17: sin distancia en puntos desde el inicio de la vuelta. */
function describePlacement(pl: Placement, pattern: WrittenPattern, dialect: Dialect): WrittenPlacementDescription {
  const parts = Array.isArray(pattern.parts) ? pattern.parts : [];
  const idx = parts.findIndex((p) => p.id === pl.target.part);
  const target = idx >= 0 ? (parts[idx] as Part) : undefined;
  const name = target ? partName(target, idx) : oneLine(pl.target.part) || "Parte";
  const label = copyLabel(name, target ? copiesOf(target) : 1, pl.target.copy);
  const at = pl.at;
  if (at.type === "free") {
    return { part: pl.target.part, copy: pl.target.copy, label, kind: "free", text: `${label}: pieza principal, ubicada libremente en el espacio.` };
  }
  const hostIdx = parts.findIndex((p) => p.id === at.host.part);
  const host = hostIdx >= 0 ? (parts[hostIdx] as Part) : undefined;
  if (!host) {
    return { part: pl.target.part, copy: pl.target.copy, label, kind: "surface", text: `${label}: se cose a una pieza que no está en el patrón.` };
  }
  const hostName = copyLabel(partName(host, hostIdx), copiesOf(host), at.host.copy);
  const prefix = roundPrefix(host, dialect);
  const origin = host.start.type === "magic_ring" ? "el anillo mágico" : host.construction === "flat" ? "la cadeneta base" : "la cadeneta inicial";
  const lastRound = concreteRounds(host).at(-1)?.number;
  const r = at.round;
  let where: string;
  if (!Number.isInteger(r) || r < 1) where = `en el inicio, junto a ${origin}`;
  else if (lastRound !== undefined && r >= lastRound) where = `sobre la ${prefix}${r}, la última, contando desde ${origin}`;
  else where = `entre la ${prefix}${r} y la ${prefix}${r + 1}, contando desde ${origin}`;
  const start = at.attach === "start" ? " por el centro de su inicio" : "";
  return {
    part: pl.target.part,
    copy: pl.target.copy,
    label,
    kind: "surface",
    text: `${label}: se cose a la pieza «${hostName}»${start}, ${where}.`,
  };
}

/** Descripción del patrón escrito. Acepta cualquier documento: nunca lanza. */
export function describeWritten(pattern: WrittenPattern, options: DescribeWrittenOptions = {}): WrittenDescription {
  const opts: DescribeWrittenOptions = typeof options === "object" && options !== null ? options : {};
  const dialect: Dialect = opts.dialect === "us" || opts.dialect === "uk" ? opts.dialect : "es";
  const empty = (text: string): WrittenDescription => ({ ok: false, dialect, parts: [], placements: [], gaugeStatus: "missing", text });
  try {
    if (!validatePattern(pattern).savable) {
      return empty("No se puede describir el patrón: el documento tiene errores que impiden leerlo. Corrígelos en el editor.");
    }
    const gaugeStatus = pattern.gauge ? "document" : opts.assumedGauge ? "assumed" : "missing";
    const parts = pattern.parts.map((p, i) => describePart(p, i, pattern, opts, dialect));
    const placements: WrittenPlacementDescription[] = [];
    const layout = pattern.layout?.placements ?? [];
    for (const [i, part] of pattern.parts.entries()) {
      for (let c = 0; c < copiesOf(part); c++) {
        const pl = layout.find((x) => x.target.part === part.id && x.target.copy === c);
        if (pl) placements.push(describePlacement(pl, pattern, dialect));
        else {
          const label = copyLabel(partName(part, i), copiesOf(part), c);
          placements.push({ part: part.id, copy: c, label, kind: "automatic", text: `${label}: sin ubicar; el 3D la acomoda sola.` });
        }
      }
    }
    const technique = pattern.technique === "crochet" ? "a crochet" : "a palillo";
    const head = [
      `Patrón escrito ${technique}: «${oneLine(pattern.title)}». ${plural(parts.length, "parte", "partes")}. Abreviaturas: ${DIALECT_NAMES[dialect]}.`,
    ];
    if (gaugeStatus === "missing") head.push("Falta la muestra: sin ella no hay medidas en cm.");
    const sections = [head.join(" "), ...parts.map((p) => p.text)];
    if (pattern.layout) sections.push(["Dónde va cada pieza:", ...placements.map((p) => p.text)].join("\n"));
    sections.push("Prototipo digital: las medidas son aproximadas; teje una muestra con tu lana y tu aguja para comprobar las medidas y las proporciones.");
    return { ok: true, dialect, parts, placements, gaugeStatus, text: sections.join("\n\n") };
  } catch {
    return empty("No se pudo describir el patrón.");
  }
}
