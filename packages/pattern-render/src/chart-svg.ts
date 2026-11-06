/**
 * Gráfico de colorwork en SVG (T7). Derivado estático del modelo canónico: para
 * imprimir desde el navegador y como base del PDF. Todo conteo y todo orden de lectura
 * sale de `pattern-core`; aquí solo se dibuja.
 *
 * Qué se dibuja (decisión documentada en el README):
 * - El **gráfico completo** (`width × repeat.x` por `height × repeat.y`), con la fila 1
 *   abajo y `x = 0` a la izquierda visto por el derecho, como el editor (ADR 0003,
 *   sección 1). `direction` no rota el gráfico: solo cambia la vista previa.
 * - Si el gráfico completo supera `CHART_SVG_MAX_CELLS` casillas, se dibuja **solo el
 *   motivo** con un rótulo visible "Motivo: se repite N × M veces". El motivo siempre
 *   cabe (200 × 200 = 40 000, ADR 0003, E7).
 *
 * Seguridad: todo texto pasa por `escapeXml` y todo color por `safeHex`. Ningún texto del
 * documento llega crudo al SVG.
 */
import {
  NO_STITCH,
  fullSize,
  readingDirection,
  validatePattern,
  yarnLetter,
  type ChartPattern,
  type ValidationResult,
} from "@loopitalab/pattern-core";
import { describeWith, type DescribeOptions } from "./describe.ts";
import { contrastInk, escapeXml, formatInt, hash32, safeHex } from "./xml.ts";

export interface ChartSvgOptions {
  /** Lado de cada casilla en píxeles. Por defecto 16; se acota entre 4 y 64. */
  cellPx?: number;
  /** Marca los bordes del motivo en el gráfico completo. */
  showRepeats?: boolean;
  /** Ida y vuelta: derecho a la derecha, revés a la izquierda; en redondo, todas a la derecha (ADR 0003). */
  rowNumbers?: boolean;
  /** Letra por lana en cada casilla (daltonismo). */
  symbols?: boolean;
  /** Preferencia `mirror_knitting`: solo cambia la numeración y las flechas de lectura. */
  mirror?: boolean;
}

/** Casillas dibujadas como máximo; si el gráfico completo es mayor, se dibuja solo el motivo. */
export const CHART_SVG_MAX_CELLS = 40_000;

export const DEFAULT_CELL_PX = 16;
const MIN_CELL_PX = 4;
const MAX_CELL_PX = 64;

/**
 * Numeración rala (pedido de `experto-tejido`, T7b): si la distancia vertical entre dos
 * números del mismo lado es menor que este factor por el tamaño de la letra, los números
 * se tocarían. Entonces se numeran solo la fila 1, las múltiplos de 5 y la última; las
 * flechas de lectura se dibujan en todas las filas. La distancia es `cellPx` en redondo
 * (todas las vueltas del mismo lado) y `2 × cellPx` de ida y vuelta (los lados se alternan).
 */
export const ROW_NUMBER_MIN_GAP_FACTOR = 1.2;

/** Ancho aproximado de un carácter del rótulo, en tamaños de letra (system-ui). */
const CAPTION_CHAR_W = 0.56;

/** Rótulo extra del motivo solo, de ida y vuelta, con alto impar y `repeat.y > 1` (T7b). */
export const ODD_HEIGHT_CAPTION =
  "Como el motivo tiene un número impar de filas, en cada repetición alterna el lado por el que se teje cada fila (derecho y revés). La numeración de la primera repetición solo vale para esa.";

/** Colores fijos del dibujo (no vienen del documento). */
const GRID = "#9A9A9A";
const INK = "#1A1A1A";
const NO_STITCH_BG = "#FFFFFF";
const NO_STITCH_HATCH = "#7A7A7A";

function cellSize(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_CELL_PX;
  return Math.min(MAX_CELL_PX, Math.max(MIN_CELL_PX, Math.round(v)));
}

/**
 * SVG del gráfico. Acepta documentos `savable` (incluido un gráfico vacío o con filas
 * sin puntos) y nunca lanza: si el documento tiene errores estructurales devuelve un
 * SVG con el aviso, sin dibujar casillas.
 *
 * `describe` es opcional y se pasa a la descripción del `<desc>` (nombres de la paleta).
 */
export function chartToSvg(pattern: ChartPattern, opts: ChartSvgOptions = {}, describe: DescribeOptions = {}): string {
  let validation: ValidationResult;
  try {
    validation = validatePattern(pattern);
  } catch {
    validation = { valid: false, savable: false, issues: [] };
  }
  if (!validation.savable || (pattern as { kind?: unknown }).kind !== "chart") return errorSvg();
  try {
    return drawChart(pattern, opts, validation, describe);
  } catch {
    // Solo con opciones armadas a mano (getters o Proxy que lanzan): nunca lanza.
    return errorSvg();
  }
}

/** Opciones normalizadas: solo números finitos y booleanos, nunca valores del llamador sin revisar. */
interface DrawOptions {
  cell: number;
  showRepeats: boolean;
  rowNumbers: boolean;
  symbols: boolean;
  mirror: boolean;
}

function normalizeOptions(opts: unknown): DrawOptions {
  const o = typeof opts === "object" && opts !== null ? (opts as Record<string, unknown>) : {};
  return {
    cell: cellSize(o.cellPx),
    showRepeats: o.showRepeats === true,
    rowNumbers: o.rowNumbers === true,
    symbols: o.symbols === true,
    mirror: o.mirror === true,
  };
}

/** Filas que llevan número con la numeración rala: la 1, las múltiplos de 5 y la última. */
export function isNumberedRow(rowNumber: number, rows: number): boolean {
  return rowNumber === 1 || rowNumber === rows || rowNumber % 5 === 0;
}

/** SVG de reemplazo cuando el documento no se puede dibujar. Sin ningún texto del documento. */
function errorSvg(): string {
  const id = "lr-error";
  const msg = "No se puede dibujar el gráfico: el documento tiene errores.";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="40" viewBox="0 0 320 40" role="img" aria-labelledby="${id}-t">` +
    `<title id="${id}-t">${escapeXml(msg)}</title>` +
    `<rect x="0.5" y="0.5" width="319" height="39" fill="#FFFFFF" stroke="${INK}"/>` +
    `<text x="160" y="20" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle" dominant-baseline="central" fill="${INK}">${escapeXml(msg)}</text>` +
    `</svg>`
  );
}

/**
 * Dibuja un documento que ya se sabe `savable`. Exportado solo para pruebas (no está en
 * `index.ts`): permite comprobar las defensas del dibujo (colores, textos) aunque el
 * validador ya las garantice.
 */
export function drawChart(pattern: ChartPattern, opts: ChartSvgOptions, validation: ValidationResult, describe: DescribeOptions = {}): string {
  const { chart } = pattern;
  const o = normalizeOptions(opts);
  const cell = o.cell;
  const full = fullSize(chart);
  const fullFits = full.width * full.height <= CHART_SVG_MAX_CELLS;
  const drawW = fullFits ? full.width : chart.width;
  const drawH = fullFits ? full.height : chart.height;
  const mirror = o.mirror;
  const rowNumbers = o.rowNumbers;

  const fontSize = Math.max(8, Math.min(14, Math.round(cell * 0.7)));
  const digitW = fontSize * 0.62;
  const arrow = Math.max(4, Math.round(fontSize * 0.55));
  const pad = 2;

  // Lados de la numeración: el lado donde empieza la lectura de cada fila (pattern-core).
  const side = (y: number) => (readingDirection(chart, y, { mirror }) === "right_to_left" ? "right" : "left");
  let numLeft = false;
  let numRight = false;
  if (rowNumbers) {
    for (let y = 0; y < Math.min(drawH, 2); y++) {
      if (side(y) === "left") numLeft = true;
      else numRight = true;
    }
  }
  const numCol = Math.ceil(String(drawH).length * digitW + arrow + 8);
  // Numeración rala con casillas chicas: ver ROW_NUMBER_MIN_GAP_FACTOR.
  const numberGap = (chart.workedIn === "rounds" ? 1 : 2) * cell;
  const sparse = numberGap < ROW_NUMBER_MIN_GAP_FACTOR * fontSize;

  // Rótulo del motivo solo: una línea por oración, para que quepa en el ancho del dibujo.
  const captionLines: string[] = [];
  if (!fullFits) {
    captionLines.push(`Motivo: se repite ${formatInt(chart.repeat.x)} × ${formatInt(chart.repeat.y)} veces (el gráfico completo es demasiado grande para dibujarlo).`);
    if (chart.workedIn === "rows" && chart.height % 2 === 1 && chart.repeat.y > 1) {
      captionLines.push(...ODD_HEIGHT_CAPTION.split(/(?<=\.) /));
    }
  }
  const lineH = fontSize + 4;
  const captionH = captionLines.length > 0 ? captionLines.length * lineH + 4 : 0;
  const captionW = Math.ceil(Math.max(0, ...captionLines.map((l) => [...l].length)) * fontSize * CAPTION_CHAR_W);

  const left = pad + (numLeft ? numCol : 0);
  const top = pad + captionH;
  const gridW = drawW * cell;
  const gridH = drawH * cell;
  const svgW = Math.max(left + gridW + (numRight ? numCol : 0) + pad, captionW > 0 ? left + captionW + pad : 0);
  const svgH = top + gridH + pad;

  const yarnFill = pattern.yarns.map((y) => safeHex(y.color?.hex));
  const yarnInk = yarnFill.map((hex) => contrastInk(hex));
  const yarnCount = pattern.yarns.length;

  const title = `Gráfico: ${pattern.title}`;
  const desc = describeWith(pattern, validation, describe);
  // Prefijo de ids: hash de lo que cambia el dibujo, con valores ya normalizados (números
  // finitos, booleanos, colores `safeHex` y textos del documento validado). Nunca hace
  // JSON.stringify de la entrada del llamador (QA F2) e incluye los colores de las lanas
  // (QA O2: dos SVG del mismo patrón con colores distintos no comparten ids).
  const flags = [o.showRepeats, o.rowNumbers, o.symbols, o.mirror].map((b) => (b ? "1" : "0")).join("");
  const pfx = `lr-${hash32(
    [
      String(pattern.id),
      String(pattern.title),
      `${chart.width}x${chart.height}x${chart.repeat.x}x${chart.repeat.y}`,
      `${chart.workedIn}|${chart.renderAs}|${chart.direction}`,
      chart.cells.join(","),
      yarnFill.join(","),
      `${cell}|${flags}`,
      desc,
    ].join("\u0000"),
  )}`;

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" role="img" ` +
      `aria-labelledby="${pfx}-t" aria-describedby="${pfx}-d" data-cols="${drawW}" data-rows="${drawH}" data-view="${fullFits ? "full" : "motif"}">`,
  );
  out.push(`<title id="${pfx}-t">${escapeXml(title)}</title>`);
  out.push(`<desc id="${pfx}-d">${escapeXml(desc)}</desc>`);
  // "Sin punto": blanco con rayas diagonales grises. Una textura, no un color plano: se
  // distingue de cualquier lana, también en blanco y negro y con daltonismo.
  out.push(
    `<defs><pattern id="${pfx}-ns" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<rect width="6" height="6" fill="${NO_STITCH_BG}"/><rect width="2" height="6" fill="${NO_STITCH_HATCH}"/></pattern></defs>`,
  );
  out.push(`<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#FFFFFF"/>`);

  if (captionLines.length > 0) {
    out.push(`<g class="caption" font-family="system-ui, sans-serif" font-size="${fontSize}" dominant-baseline="central" fill="${INK}">`);
    captionLines.forEach((line, i) => out.push(`<text x="${left}" y="${pad + 2 + i * lineH + lineH / 2}">${escapeXml(line)}</text>`));
    out.push(`</g>`);
  }

  // Casillas: una por posición, fila 1 abajo. En el motivo se lee la celda directamente.
  const cells = chart.cells;
  const cw = chart.width;
  const ch = chart.height;
  const symbols = o.symbols;
  // Desde la lana 27 la letra es doble (AA, AB…): se achica para que quepa en la casilla.
  const letterSize = Math.max(3, Math.round(cell * 0.6));
  const doubleSize = Math.max(3, Math.round(cell * 0.42));
  const letters: string[] = [];
  out.push(`<g class="cells" stroke="${GRID}" stroke-width="0.5" shape-rendering="crispEdges">`);
  for (let y = 0; y < drawH; y++) {
    const sy = top + (drawH - 1 - y) * cell;
    const rowStart = (y % ch) * cw;
    for (let x = 0; x < drawW; x++) {
      const v = cells[rowStart + (x % cw)] ?? NO_STITCH;
      const sx = left + x * cell;
      if (v === NO_STITCH || !(v >= 0 && v < yarnCount)) {
        out.push(`<rect class="c ns" x="${sx}" y="${sy}" width="${cell}" height="${cell}" fill="url(#${pfx}-ns)"/>`);
      } else {
        out.push(`<rect class="c" x="${sx}" y="${sy}" width="${cell}" height="${cell}" fill="${yarnFill[v]}"/>`);
        if (symbols) {
          const l = yarnLetter(v);
          const size = l.length > 1 ? ` font-size="${doubleSize}"` : "";
          letters.push(`<text x="${sx + cell / 2}" y="${sy + cell / 2}" fill="${yarnInk[v]}"${size}>${escapeXml(l)}</text>`);
        }
      }
    }
  }
  out.push(`</g>`);

  if (symbols && letters.length > 0) {
    out.push(
      `<g class="symbols" font-family="system-ui, sans-serif" font-size="${letterSize}" font-weight="600" text-anchor="middle" dominant-baseline="central" aria-hidden="true">`,
    );
    for (const l of letters) out.push(l);
    out.push(`</g>`);
  }

  // Bordes del motivo: línea blanca debajo y negra encima, visible sobre cualquier lana.
  if (o.showRepeats && fullFits) {
    const lines: string[] = [];
    for (let k = 0; k <= chart.repeat.x; k++) {
      const x = left + k * cw * cell;
      lines.push(`M${x} ${top}V${top + gridH}`);
    }
    for (let k = 0; k <= chart.repeat.y; k++) {
      const y = top + gridH - k * ch * cell;
      lines.push(`M${left} ${y}H${left + gridW}`);
    }
    const d = lines.join("");
    out.push(
      `<g class="repeats" fill="none" aria-hidden="true"><path d="${d}" stroke="#FFFFFF" stroke-width="3"/><path d="${d}" stroke="${INK}" stroke-width="1.5"/></g>`,
    );
  } else {
    // Marco exterior.
    out.push(`<rect x="${left}" y="${top}" width="${gridW}" height="${gridH}" fill="none" stroke="${INK}" stroke-width="1"/>`);
  }

  // Numeración y flechas de lectura: el número va del lado donde empieza la fila, y la
  // flecha apunta hacia el gráfico (el sentido en que se lee). Depende de `mirror`.
  if (rowNumbers) {
    // Con casillas chicas (`sparse`), el número solo en la fila 1, las múltiplos de 5 y la
    // última, cada una de su lado; la flecha va en todas las filas.
    out.push(
      `<g class="row-numbers" font-family="system-ui, sans-serif" font-size="${fontSize}" fill="${INK}" dominant-baseline="central"${sparse ? ' data-sparse="true"' : ""}>`,
    );
    for (let y = 0; y < drawH; y++) {
      const cy = top + (drawH - 1 - y) * cell + cell / 2;
      const s = side(y);
      const numbered = !sparse || isNumberedRow(y + 1, drawH);
      const n = escapeXml(String(y + 1));
      if (s === "right") {
        const ax = left + gridW + 2;
        out.push(
          `<g class="row" data-row="${y + 1}" data-side="right"><path d="M${ax} ${cy}l${arrow} ${-arrow / 2}v${arrow}z"/>` +
            (numbered ? `<text x="${ax + arrow + 2}" y="${cy}" text-anchor="start">${n}</text>` : "") +
            `</g>`,
        );
      } else {
        const ax = left - 2;
        out.push(
          `<g class="row" data-row="${y + 1}" data-side="left"><path d="M${ax} ${cy}l${-arrow} ${-arrow / 2}v${arrow}z"/>` +
            (numbered ? `<text x="${ax - arrow - 2}" y="${cy}" text-anchor="end">${n}</text>` : "") +
            `</g>`,
        );
      }
    }
    out.push(`</g>`);
  }

  out.push(`</svg>`);
  return out.join("");
}
