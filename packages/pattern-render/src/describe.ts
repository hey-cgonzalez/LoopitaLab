/**
 * Descripción en español de un gráfico de colorwork, para lectores de pantalla y como
 * `<desc>` del SVG. Texto plano (no HTML): quien lo inserte en HTML o SVG lo escapa.
 * Todo conteo sale de `pattern-core`.
 */
import {
  NO_STITCH,
  dimensionsCm,
  fullSize,
  rowStitchCounts,
  stitchTotal,
  validatePattern,
  yarnLetter,
  yarnTotals,
  type ChartPattern,
  type Issue,
  type ValidationResult,
} from "@loopitalab/pattern-core";
import { formatDecimal, formatInt, isHex } from "./xml.ts";

export interface DescribeOptions {
  /**
   * Nombre del color de la paleta propia a partir de `color.paletteId` (por ejemplo, con
   * `PALETTE` de `yarn-catalog`). Sin esta función, la descripción usa solo el código
   * `#RRGGBB`: `pattern-render` no depende de `yarn-catalog`.
   */
  paletteName?: (paletteId: string) => string | undefined;
}

/** Cantidad máxima de avisos (errores de tejido y advertencias) que se citan textualmente. */
export const DESCRIBE_MAX_ISSUES = 3;

const SHAPE_NAMES: Record<string, string> = {
  flat: "plano",
  tube: "tubo",
  circle: "círculo",
  yoke: "canesú (por ahora se dibuja como tubo)",
};

const plural = (n: number, one: string, many: string) => `${formatInt(n)} ${n === 1 ? one : many}`;

/** Descripción en español para lectores de pantalla. Acepta documentos `savable` (incluido un gráfico vacío) y nunca lanza. */
export function describeChart(pattern: ChartPattern, opts: DescribeOptions = {}): string {
  return describeWith(pattern, validatePattern(pattern), opts);
}

/** Igual que `describeChart`, con una validación ya hecha (la usa `chartToSvg` para no validar dos veces). */
export function describeWith(pattern: ChartPattern, validation: ValidationResult, opts: DescribeOptions = {}): string {
  if (!validation.savable) {
    return "No se puede describir el gráfico: el documento tiene errores que impiden leerlo. Corrígelos en el editor.";
  }
  const { chart } = pattern;
  const rounds = chart.workedIn === "rounds";
  const word = rounds ? "vuelta" : "fila";
  const words = rounds ? "vueltas" : "filas";
  const full = fullSize(chart);
  const technique = pattern.technique === "crochet" ? "a crochet" : "a palillo";
  const parts: string[] = [];

  parts.push(`Gráfico de colores ${technique}: «${oneLine(pattern.title)}».`);

  // Tamaño y repeticiones.
  const motif = `Motivo de ${formatInt(chart.width)} × ${formatInt(chart.height)} casillas (ancho × alto)`;
  if (chart.repeat.x === 1 && chart.repeat.y === 1) parts.push(`${motif}, sin repeticiones.`);
  else {
    parts.push(
      `${motif}, repetido ${plural(chart.repeat.x, "vez", "veces")} a lo ancho y ${plural(chart.repeat.y, "vez", "veces")} a lo alto: ` +
        `gráfico completo de ${formatInt(full.width)} × ${formatInt(full.height)} casillas.`,
    );
  }

  // Puntos (de pattern-core).
  const total = stitchTotal(chart);
  const counts = rowStitchCounts(chart);
  // Sin `Math.min(...lista)`: el gráfico completo puede tener hasta 100 000 filas.
  let min = Infinity;
  let max = 0;
  for (const n of counts) {
    if (n > 0 && n < min) min = n;
    if (n > max) max = n;
  }
  let perRow = "";
  if (max > 0) {
    perRow = min === max ? `; cada ${word} tiene ${plural(min, "punto", "puntos")}` : `; entre ${formatInt(min)} y ${formatInt(max)} puntos por ${word}`;
  }
  parts.push(`${plural(full.height, word, words)} y ${plural(total, "punto", "puntos")} en total${perRow}.`);

  let masked = 0;
  for (const v of chart.cells) if (v === NO_STITCH) masked++;
  if (masked > 0) parts.push(`El motivo tiene ${plural(masked, "casilla sin punto", "casillas sin punto")}.`);

  // Forma de trabajo y vista.
  const how = rounds ? "en redondo" : "de ida y vuelta";
  const dir = chart.direction === "top_down" ? "de arriba hacia abajo" : "de abajo hacia arriba";
  parts.push(`Se teje ${how}, ${dir}. Vista: ${SHAPE_NAMES[chart.renderAs] ?? "plano"}.`);

  // Muestra y medidas.
  if (pattern.gauge) {
    const g = pattern.gauge;
    const d = dimensionsCm(chart, g);
    const width = d.widthIsCircumference ? "de circunferencia" : "de ancho";
    parts.push(
      `Muestra: ${formatDecimal(g.stitchesPer10cm)} puntos y ${formatDecimal(g.rowsPer10cm)} ${words} en 10 cm; ` +
        `mide aproximadamente ${formatDecimal(d.widthCm)} cm ${width} y ${formatDecimal(d.heightCm)} cm de alto.`,
    );
  } else {
    parts.push("Sin muestra: las medidas no se pueden calcular.");
  }

  // Lanas por letra.
  const totals = yarnTotals(chart, pattern.yarns.length);
  const yarns = pattern.yarns.map((y, i) => {
    const name = y.color.paletteId !== undefined ? opts.paletteName?.(y.color.paletteId) : undefined;
    const hex = isHex(y.color.hex) ? y.color.hex.toUpperCase() : "sin color";
    const color = name ? `${oneLine(name)} (${hex})` : hex;
    const n = totals[i] ?? 0;
    return `${yarnLetter(i)}, ${color}, ${n === 0 ? "sin usar" : plural(n, "punto", "puntos")}`;
  });
  parts.push(`${pattern.yarns.length === 1 ? "1 lana" : `${pattern.yarns.length} lanas`}: ${yarns.join("; ")}.`);

  // Avisos relevantes: errores de tejido y advertencias (la información se omite).
  const relevant = validation.issues.filter((i: Issue) => i.severity === "error" || i.severity === "warning");
  if (relevant.length > 0) {
    const shown = relevant.slice(0, DESCRIBE_MAX_ISSUES).map((i) => oneLine(i.message));
    const rest = relevant.length - shown.length;
    parts.push(`Avisos: ${shown.join(" ")}${rest > 0 ? ` Y ${plural(rest, "aviso más", "avisos más")}.` : ""}`);
  }

  return parts.join(" ");
}

/** Texto en una sola línea, sin espacios repetidos. */
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
