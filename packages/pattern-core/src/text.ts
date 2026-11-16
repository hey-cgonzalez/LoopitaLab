/**
 * Lectura y escritura de patrones escritos en texto (ADR 0011, sección 7).
 *
 * Sintaxis (español más inglés US en el modo `es-us`, o más inglés UK en `es-uk`):
 *   Parte: Oreja
 *   Cantidad: 2
 *   Inicio: AM
 *   Construcción: espiral
 *   Lana: A
 *   V1: 6 pb en AM (6)
 *   V2: aum x6 (12)
 *   > Coloca un marcador al inicio de la vuelta.
 *   V3: [pb, aum] x6 (18)
 *   V4-6: 18 pb (18)
 *   V7: @B, [pb 2, dism] x6 (12)
 *   Cierre: no rellenar; aplanar y coser abierta.
 *   > Deja una hebra larga para coser.
 *
 * - Prefijo de vuelta: V, Vta, Vuelta, R, Rnd, Round, H, Hilera, F, Fila, Row; rango con "-", "–", "a" o "to".
 *   Se leen también números 0 o negativos ("V0:"), que el validador marca como `ROUND_NUMBERING`
 *   (error de tejido): así un borrador hace la ida y vuelta por texto.
 * - Punto con cantidad: "6 pb", "pb 6" o "pb x6". Hebra: "pb ht" (trasera) o "sc blo".
 * - Grupo: "[ … ] x6" o "[ … ] 6 veces", hasta `LIMITS.maxNesting − 1` grupos uno dentro de otro
 *   (la vuelta y sus grupos son `LIMITS.maxNesting` niveles de ítems, como en el validador).
 * - Cambio de lana: "@B" (identificador de la lana).
 * - Conteo declarado al final: "(18)".
 * - `> texto`: nota de la vuelta anterior, o una línea más del cierre si sigue a "Cierre:".
 * - `# texto`: comentario que no se guarda (aviso `PARSE_COMMENT`).
 * - "Cantidad: N" (se lee también "Hacer", "Piezas" y "Tejer", con o sin dos puntos; en
 *   inglés, "Make"): veces que se teje la parte (`copies`).
 */
import { LIMITS } from "./limits.ts";
import {
  DIALECTS,
  lookupLoop,
  lookupStitch,
  loopAbbrev,
  otherDialectHint,
  stitchAbbrev,
  type Dialect,
  type ReadingMode,
} from "./stitches.ts";
import type { Issue, Item, Part, PartStart, Round } from "./types.ts";

/**
 * Resultado de una lectura. `warnings` (solo si hay) trae avisos que no impiden leer,
 * como `PARSE_COMMENT`; va también cuando la lectura falla.
 */
export type ParseResult<T> =
  | { ok: true; value: T; warnings?: Issue[] }
  | { ok: false; issues: Issue[]; warnings?: Issue[] };

/**
 * Límites de entrada del lector (ADR 0011, sección 7; riesgo R4-7). Protegen las
 * expresiones regulares de entradas desmedidas (texto pegado, IA en la fase 5).
 * `maxTextLength` es por parte (y por texto pegado en `parseWrittenParts`), en unidades
 * UTF-16 (`string.length`).
 */
export const PARSE_LIMITS = Object.freeze({
  maxTextLength: 100_000,
  maxLineLength: 2_000,
});

/** Aviso de las líneas `#` (CA4-E5). */
export const COMMENT_WARNING = "Los comentarios con # no se guardan; usa > para una nota.";

/*
 * Expresiones regulares sin cuantificadores ambiguos uno al lado del otro: con una línea
 * hostil de `PARSE_LIMITS.maxLineLength` caracteres terminan en tiempo lineal.
 */
const ROUND_RE =
  /^\s*(?:vuelta|vta|v|rnd|round|row|r|hilera|h|fila|f)\s*(?:\.\s*)?(-?\d+)(?:\s*(?:-|–|—|a|to)\s*(?:(?:vuelta|vta|v|rnd|r|hilera|h|fila|f)\s*)?(-?\d+))?\s*:([\s\S]*)$/i;
const EXPECTED_RE = /\(\s*(\d+)\s*(?:(?:pts?|puntos|sts?|stitches)\s*)?\)\s*$/i;
const INTO_RING_RE = / (?:en|in|into) (?:el |the )?(?:am|mr|anillo|anillo m[aá]gico|magic ring)$/i;
const HEADER_RE = /^\s*([A-Za-zÁÉÍÓÚáéíóúñÑ]+(?: [A-Za-zÁÉÍÓÚáéíóúñÑ]+)*)\s*:([\s\S]*)$/;
const COPIES_RE = /^\s*(cantidad|hacer|piezas|tejer|make)\b\s*(:?)([\s\S]*)$/i;
const NOTE_RE = /^\s*>/;
const PART_HEADER_RE = /^\s*(?:parte|part)\s*:/i;
const YARN_ID_RE = /^[A-Za-z0-9_-]+$/;
/** Más dígitos que esto ya no es un entero seguro: se rechaza en vez de redondear. */
const MAX_DIGITS = 15;

function issue(code: string, message: string, line: number, column: number, data?: Record<string, unknown>): Issue {
  return { code, severity: "error", path: `texto:${line}:${column}`, message, data: { line, column, ...data } };
}

function warning(code: string, message: string, line: number, column: number): Issue {
  return { code, severity: "warning", path: `texto:${line}:${column}`, message, data: { line, column } };
}

/** Recorta un texto de la usuaria para citarlo en un mensaje. */
function clip(s: string, max = 40): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Entero de una cadena de dígitos, o `null` si es demasiado grande para leerlo sin redondear. */
function toInt(digits: string): number | null {
  const negative = digits.startsWith("-");
  const d = (negative ? digits.slice(1) : digits).replace(/^0+(?=\d)/, "");
  if (d.length > MAX_DIGITS) return null;
  const n = Number(d);
  // Sin −0: `deepEqual` lo distingue de 0 y la ida y vuelta lo perdería.
  return negative && n !== 0 ? -n : n;
}

/** Quita espacios y comas del final, sin expresiones regulares (lineal). */
function trimEndCommas(s: string): string {
  let end = s.length;
  while (end > 0 && (s[end - 1] === "," || /\s/.test(s[end - 1] as string))) end--;
  return s.slice(0, end);
}

interface Piece {
  text: string;
  /** Columna (0-based) donde empieza el texto recortado dentro de la línea. */
  col: number;
}

/** Separa por comas de primer nivel (fuera de corchetes), guardando la columna de cada trozo. */
function splitTopLevel(text: string, baseCol: number): Piece[] | { error: string; col: number } {
  const pieces: Piece[] = [];
  let depth = 0;
  let start = 0;
  const push = (end: number) => {
    const raw = text.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    pieces.push({ text: raw.trim(), col: baseCol + start + lead });
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth < 0) return { error: "Hay un ']' sin su '['.", col: baseCol + i };
    } else if (ch === "," && depth === 0) {
      push(i);
      start = i + 1;
    }
  }
  if (depth !== 0) return { error: "Falta cerrar un '['.", col: baseCol + text.lastIndexOf("[") };
  push(text.length);
  return pieces;
}

/** Profundidad máxima de corchetes (lineal), para rechazar anidaciones desmedidas antes de leer. */
function bracketDepth(text: string): number {
  let depth = 0;
  let max = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "[") max = Math.max(max, ++depth);
    else if (text[i] === "]") depth--;
  }
  return max;
}

interface Ctx {
  line: number;
  mode: ReadingMode;
  issues: Issue[];
}

function parseItems(text: string, baseCol: number, ctx: Ctx): Item[] {
  const pieces = splitTopLevel(text, baseCol);
  if (!Array.isArray(pieces)) {
    ctx.issues.push(issue("PARSE_BRACKETS", pieces.error, ctx.line, pieces.col + 1));
    return [];
  }
  const items: Item[] = [];
  for (const piece of pieces) {
    if (piece.text === "") {
      ctx.issues.push(issue("PARSE_EMPTY_ITEM", "Hay una coma de más o un elemento vacío.", ctx.line, piece.col + 1));
      continue;
    }
    const item = parseItem(piece, ctx);
    if (item) items.push(item);
  }
  return items;
}

function parseItem(piece: Piece, ctx: Ctx): Item | null {
  const t = piece.text;
  const col = piece.col + 1;
  const { line } = ctx;

  if (t.startsWith("[")) {
    const close = t.lastIndexOf("]");
    const tail = t.slice(close + 1).trim();
    const m = /^(?:[x×*]\s*(\d+)|(\d+)\s*veces|(\d+)\s*times)$/i.exec(tail);
    const times = m ? toInt(m[1] ?? m[2] ?? m[3] ?? "") : NaN;
    if (!m || times === null || !(times >= 1)) {
      ctx.issues.push(issue("PARSE_GROUP_TIMES", `El grupo "${clip(t)}" necesita cuántas veces se repite, por ejemplo "x6".`, line, col));
      return null;
    }
    const inner = parseItems(t.slice(1, close), piece.col + 1, ctx);
    if (inner.length === 0) {
      ctx.issues.push(issue("PARSE_EMPTY_GROUP", "El grupo está vacío.", line, col));
      return null;
    }
    return { type: "group", items: inner, times };
  }

  if (t.startsWith("@")) {
    const id = t.slice(1).trim();
    if (!YARN_ID_RE.test(id)) {
      ctx.issues.push(issue("PARSE_COLOR", `"${clip(t)}" no es un cambio de lana válido. Usa "@" y el identificador, por ejemplo "@B".`, line, col));
      return null;
    }
    return { type: "color", yarn: id };
  }

  // Espacios colapsados: las expresiones de abajo quedan lineales con cualquier entrada.
  let phrase = t.replace(/\s+/g, " ").replace(INTO_RING_RE, "");
  let digits: string | undefined;
  let m: RegExpExecArray | null;
  if ((m = /^(\d+) (.+)$/.exec(phrase))) {
    digits = m[1];
    phrase = m[2] ?? "";
  } else if ((m = /^(.+?) ?[x×] ?(\d+)$/i.exec(phrase))) {
    phrase = m[1] ?? "";
    digits = m[2];
  } else if ((m = /^(.+?) (\d+)$/.exec(phrase))) {
    phrase = m[1] ?? "";
    digits = m[2];
  }
  const count = digits === undefined ? 1 : toInt(digits);
  if (count === null) {
    ctx.issues.push(issue("PARSE_NUMBER", `La cantidad en "${clip(t)}" es demasiado grande.`, line, col));
    return null;
  }
  if (!(count >= 1)) {
    ctx.issues.push(issue("PARSE_COUNT", `La cantidad en "${clip(t)}" debe ser 1 o más.`, line, col));
    return null;
  }

  const resolved = resolveStitchPhrase(phrase, ctx.mode);
  if (!resolved) {
    const hint = hintFor(phrase, ctx.mode);
    const base = `No reconozco el punto "${clip(phrase)}".`;
    ctx.issues.push(issue("PARSE_UNKNOWN_STITCH", hint ? `${base} ${hint}` : base, line, col, hint ? { hint, mode: ctx.mode } : undefined));
    return null;
  }
  return resolved.loop
    ? { type: "stitch", stitch: resolved.stitch, count, loop: resolved.loop }
    : { type: "stitch", stitch: resolved.stitch, count };
}

function resolveStitchPhrase(phrase: string, mode: ReadingMode) {
  const clean = phrase.trim();
  const direct = lookupStitch(clean, mode);
  if (direct) return { stitch: direct, loop: undefined };
  // "pb ht", "sc blo", "sc in blo", "pb en ht", "blo sc"
  const words = clean.split(" ");
  if (words.length > 8) return undefined; // ningún punto con hebra tiene tantas palabras
  for (let cut = 1; cut < words.length; cut++) {
    const head = words.slice(0, cut).join(" ");
    const tail = words.slice(cut).join(" ").replace(/^(?:en|in) /i, "");
    const s1 = lookupStitch(head, mode);
    const l1 = lookupLoop(tail, mode);
    if (s1 && l1) return { stitch: s1, loop: l1 };
    const l2 = lookupLoop(head, mode);
    const s2 = lookupStitch(tail, mode);
    if (l2 && s2) return { stitch: s2, loop: l2 };
  }
  return undefined;
}

/** Pista del otro dialecto para la frase completa o para alguna de sus partes ("sc blo"). */
function hintFor(phrase: string, mode: ReadingMode): string | undefined {
  const whole = otherDialectHint(phrase, mode);
  if (whole) return whole;
  const words = phrase.trim().split(" ");
  if (words.length > 8) return undefined;
  for (let cut = 1; cut < words.length; cut++) {
    const h = otherDialectHint(words.slice(0, cut).join(" "), mode) ?? otherDialectHint(words.slice(cut).join(" "), mode);
    if (h) return h;
  }
  return undefined;
}

/** Lee la línea de una vuelta (sin notas). Agrega los errores a `ctx.issues`. */
function parseRoundLine(text: string, ctx: Ctx): Round | null {
  const { line } = ctx;
  const m = ROUND_RE.exec(text);
  if (!m) {
    ctx.issues.push(issue("PARSE_ROUND_PREFIX", 'Cada vuelta debe empezar con su número, por ejemplo "V3:".', line, 1));
    return null;
  }
  const before = ctx.issues.length;
  const number = toInt(m[1] ?? "");
  const through = m[2] !== undefined ? toInt(m[2]) : undefined;
  if (number === null || through === null) {
    ctx.issues.push(issue("PARSE_NUMBER", "El número de la vuelta es demasiado grande.", line, 1));
    return null;
  }
  let body = m[3] ?? "";
  const bodyCol = text.length - body.length;

  let expected: number | undefined;
  const em = EXPECTED_RE.exec(body);
  if (em) {
    const e = toInt(em[1] ?? "");
    if (e === null) {
      ctx.issues.push(issue("PARSE_NUMBER", "El conteo declarado es demasiado grande.", line, bodyCol + em.index + 1));
      return null;
    }
    expected = e;
    body = body.slice(0, em.index);
  }
  if (through !== undefined && through < number) {
    ctx.issues.push(issue("PARSE_RANGE", `El rango ${number}-${through} va hacia atrás.`, line, 1));
  }
  // Como el validador: la vuelta y sus grupos son hasta `LIMITS.maxNesting` niveles de
  // ítems, así que caben `maxNesting − 1` grupos, uno dentro de otro.
  if (bracketDepth(body) >= LIMITS.maxNesting) {
    ctx.issues.push(issue("PARSE_NESTING", `Hay demasiados grupos uno dentro de otro: caben hasta ${LIMITS.maxNesting - 1}.`, line, bodyCol + 1, { max: LIMITS.maxNesting - 1 }));
    return null;
  }
  const items = parseItems(trimEndCommas(body), bodyCol, ctx);
  if (ctx.issues.length === before && items.length === 0) {
    ctx.issues.push(issue("PARSE_EMPTY_ROUND", `La vuelta ${number} no tiene puntos.`, line, bodyCol + 1));
  }
  if (ctx.issues.length > before) return null;

  const round: Round = { number, items };
  if (through !== undefined && through !== number) round.through = through;
  if (expected !== undefined) round.expected = expected;
  return round;
}

/** Contenido de una línea `>`: lo que sigue al signo, sin el primer espacio. */
function noteContent(raw: string): string {
  const m = NOTE_RE.exec(raw) as RegExpExecArray;
  const rest = raw.slice(m[0].length);
  return rest.startsWith(" ") ? rest.slice(1) : rest;
}

const isComment = (raw: string) => raw.trimStart().startsWith("#");

/** Texto de varias líneas normalizado (ADR 0011, sección 7, regla 5): `\r\n` → `\n` y sin espacios al final de cada línea. */
function normalizeMultiline(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n");
}

/** Revisa los límites de entrada; devuelve el error o `null`. */
function textTooLong(text: string): Issue | null {
  if (text.length > PARSE_LIMITS.maxTextLength) {
    return issue("PARSE_TOO_LONG", `El texto es demasiado largo: hasta ${PARSE_LIMITS.maxTextLength.toLocaleString("es-CL")} caracteres.`, 1, 1, { max: PARSE_LIMITS.maxTextLength });
  }
  return null;
}

function lineTooLong(raw: string, line: number): Issue | null {
  if (raw.length > PARSE_LIMITS.maxLineLength) {
    return issue("PARSE_LINE_TOO_LONG", `La línea es demasiado larga: hasta ${PARSE_LIMITS.maxLineLength.toLocaleString("es-CL")} caracteres.`, line, PARSE_LIMITS.maxLineLength + 1, { max: PARSE_LIMITS.maxLineLength });
  }
  return null;
}

/**
 * Lee una vuelta. `line` es el número de línea para los mensajes (1 por defecto) y `mode`
 * el modo de lectura (por omisión `"es-us"`). El texto puede traer, debajo de la vuelta,
 * líneas `>` con su nota (lo que escribe `formatRound`).
 */
export function parseRound(text: string, line = 1, mode: ReadingMode = "es-us"): ParseResult<Round> {
  if (typeof text !== "string") return { ok: false, issues: [issue("PARSE_TEXT", "El texto no se pudo leer.", line, 1)] };
  const long = textTooLong(text);
  if (long) return { ok: false, issues: [long] };
  const ctx: Ctx = { line, mode: mode === "es-uk" ? "es-uk" : "es-us", issues: [] };
  const lines = text.split(/\r?\n/);
  let round: Round | null = null;
  const note: string[] = [];
  let seen = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] as string;
    ctx.line = line + i;
    const tooLong = lineTooLong(raw, ctx.line);
    if (tooLong) {
      ctx.issues.push(tooLong);
      continue;
    }
    if (!seen) {
      if (raw.trim() === "" && i < lines.length - 1) continue;
      seen = true;
      round = parseRoundLine(raw, ctx);
      continue;
    }
    if (NOTE_RE.test(raw)) note.push(noteContent(raw));
    else if (raw.trim() !== "") ctx.issues.push(issue("PARSE_LINE", "Debajo de la vuelta solo van notas que empiezan con >.", ctx.line, 1));
  }
  if (ctx.issues.length > 0 || !round) return { ok: false, issues: ctx.issues };
  const value = round;
  const n = normalizeMultiline(note.join("\n"));
  if (n.trim() !== "") value.note = n;
  return { ok: true, value };
}

export interface ParsePartOptions {
  id: string;
  name?: string;
  /** Lana inicial si el texto no la indica. Por defecto "A". */
  startYarn?: string;
  /** Modo de lectura (ADR 0011, sección 8). Por omisión `"es-us"`. Ver `readingModeFor`. */
  mode?: ReadingMode;
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Lee las líneas de una parte. `firstLine` es el número de la primera línea (para los mensajes). */
function parseLines(lines: readonly string[], firstLine: number, opts: ParsePartOptions): ParseResult<Part> {
  const mode: ReadingMode = opts.mode === "es-uk" ? "es-uk" : "es-us";
  const issues: Issue[] = [];
  const warnings: Issue[] = [];
  const ctx: Ctx = { line: firstLine, mode, issues };
  let name = typeof opts.name === "string" && opts.name.trim() !== "" ? opts.name : "Parte";
  let construction: Part["construction"] = "spiral";
  let start: PartStart | undefined;
  let startYarn = typeof opts.startYarn === "string" ? opts.startYarn : "A";
  let copies: number | undefined;
  const finish: string[] = [];
  const rounds: Round[] = [];
  const notes = new Map<Round, string[]>();
  /** A qué se pegan las líneas `>`: la última vuelta, el cierre, nada (error) o nada en silencio (la vuelta no se leyó). */
  let target: Round | "finish" | "none" | "skip" = "none";

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] as string;
    const line = firstLine + i;
    ctx.line = line;
    const tooLong = lineTooLong(raw, line);
    if (tooLong) {
      issues.push(tooLong);
      target = "skip";
      continue;
    }
    if (raw.trim() === "") continue;
    if (isComment(raw)) {
      warnings.push(warning("PARSE_COMMENT", COMMENT_WARNING, line, raw.length - raw.trimStart().length + 1));
      continue;
    }
    if (NOTE_RE.test(raw)) {
      const content = noteContent(raw);
      if (target === "finish") finish.push(content);
      else if (target === "none") issues.push(issue("PARSE_NOTE", "Una nota con > va debajo de una vuelta o del cierre.", line, 1));
      else if (target !== "skip") notes.get(target)?.push(content);
      continue;
    }
    if (ROUND_RE.test(raw)) {
      const r = parseRoundLine(raw, ctx);
      if (r) {
        rounds.push(r);
        notes.set(r, []);
        target = r;
        if (!start && rounds.length === 1 && /\b(?:am|mr|anillo|magic ring)\b/i.test(raw)) start = { type: "magic_ring" };
      } else target = "skip";
      continue;
    }
    const cm = COPIES_RE.exec(raw);
    if (cm) {
      target = "none";
      const value = (cm[3] ?? "").trim();
      const n = /^\d+$/.test(value) ? toInt(value) : null;
      if (n === null || n < 1 || n > LIMITS.maxCopies) {
        const word = (cm[1] ?? "").trim();
        issues.push(issue("PARSE_COPIES", `"${clip(word)}" va con las veces que se teje la parte: un número de 1 a ${LIMITS.maxCopies}, por ejemplo "Cantidad: 2".`, line, 1, { max: LIMITS.maxCopies }));
      } else copies = n;
      continue;
    }
    const h = HEADER_RE.exec(raw);
    if (!h) {
      issues.push(issue("PARSE_LINE", `No entiendo la línea "${clip(raw)}".`, line, 1));
      target = "none";
      continue;
    }
    const key = fold(h[1] ?? "");
    const value = (h[2] ?? "").trim();
    const v = fold(value);
    target = "none";
    if (key === "cierre" || key === "terminacion" || key === "finish") {
      finish.push(value);
      target = "finish";
      continue;
    }
    if (value === "") {
      issues.push(issue("PARSE_HEADER", `Falta el valor de "${clip(h[1] ?? "")}".`, line, 1));
      continue;
    }
    if (key === "parte" || key === "part") name = value;
    else if (key === "lana" || key === "yarn") {
      const id = value.replace(/^@+/, "");
      if (YARN_ID_RE.test(id)) startYarn = id;
      else issues.push(issue("PARSE_YARN", `"${clip(value)}" no es una lana. Usa su identificador, por ejemplo "Lana: A".`, line, 1));
    } else if (key === "construccion" || key === "construction") {
      if (["espiral", "spiral"].includes(v)) construction = "spiral";
      else if (["cerrada", "cerradas", "unida", "joined"].includes(v)) construction = "joined";
      else if (["hileras", "plano", "flat", "rows"].includes(v)) construction = "flat";
      else issues.push(issue("PARSE_CONSTRUCTION", `Construcción "${clip(value)}" desconocida. Usa espiral, cerrada o hileras.`, line, 1));
    } else if (key === "inicio" || key === "start") {
      const chain = /^(?:cad|ch|cadeneta) ?(\d+)$|^(\d+) ?(?:cad|ch)$/.exec(v.replace(/\s+/g, " "));
      if (["am", "anillo magico", "mr", "magic ring"].includes(v)) start = { type: "magic_ring" };
      else if (chain) {
        const count = toInt(chain[1] ?? chain[2] ?? "");
        if (count === null) issues.push(issue("PARSE_NUMBER", "La cadeneta inicial es demasiado larga.", line, 1));
        else start = { type: "chain", count };
      } else if (v.includes("oval")) {
        // Fuera de la v2 (enmienda C-13, F4-9): no se lee como cadeneta común.
        issues.push(issue("PARSE_START", `El inicio en óvalo todavía no está disponible. Usa AM o cad N y escribe la V1 con todos sus puntos.`, line, 1));
      } else issues.push(issue("PARSE_START", `Inicio "${clip(value)}" desconocido. Usa AM o cad N (por ejemplo, "cad 10").`, line, 1));
    } else {
      issues.push(issue("PARSE_HEADER", `Encabezado "${clip(h[1] ?? "")}" desconocido.`, line, 1));
    }
  }

  if (issues.length === 0 && rounds.length === 0) {
    issues.push(issue("PARSE_NO_ROUNDS", "La parte no tiene vueltas.", firstLine, 1));
  }
  const w = warnings.length > 0 ? { warnings } : {};
  if (issues.length > 0) return { ok: false, issues, ...w };

  for (const r of rounds) {
    const n = (notes.get(r) as string[]).join("\n");
    if (n !== "") r.note = n;
  }
  // El nombre va en una sola línea, como lo escribe `formatPart` (RT2).
  const part: Part = { id: opts.id, name: oneLine(name) || "Parte", construction, start: start ?? { type: "magic_ring" }, startYarn, rounds };
  if (finish.length > 0) part.finish = finish.join("\n");
  if (copies !== undefined) part.copies = copies;
  return { ok: true, value: normalizePart(part), ...w };
}

/**
 * Lee una parte completa: líneas de encabezado opcionales y luego una vuelta por línea.
 *   Parte: Cuerpo
 *   Cantidad: 2           (o "Hacer 2", "Piezas: 2", "Tejer 2"; en inglés, "Make 2")
 *   Inicio: AM            (o "cad 10"; "óvalo N" no se lee: PARSE_START)
 *   Construcción: espiral (espiral | cerrada | hileras)
 *   Lana: A
 * Las líneas vacías se ignoran; las que empiezan con "#" también, con el aviso
 * `PARSE_COMMENT` en `warnings`. La parte leída sale normalizada (`normalizePart`).
 * Nunca lanza, con cualquier texto.
 */
export function parsePart(text: string, opts: ParsePartOptions): ParseResult<Part> {
  if (typeof text !== "string") return { ok: false, issues: [issue("PARSE_TEXT", "El texto no se pudo leer.", 1, 1)] };
  const long = textTooLong(text);
  if (long) return { ok: false, issues: [long] };
  return parseLines(text.split(/\r?\n/), 1, typeof opts === "object" && opts !== null ? opts : ({ id: "" } as ParsePartOptions));
}

export interface ParseWrittenPartsOptions {
  /** Identificador de la parte `index` (0-based) del texto. Debe dar ids distintos. */
  partId: (index: number) => string;
  startYarn?: string;
  mode?: ReadingMode;
}

/**
 * Lee un texto con varias partes (por ejemplo, un patrón pegado): corta en cada línea
 * "Parte:" (o "Part:") y lee cada trozo con `parsePart`. Lo que va antes de la primera
 * "Parte:" es una parte más si tiene algo además de comentarios. Los mensajes llevan la
 * línea del texto completo. Hasta `LIMITS.maxParts` partes y `PARSE_LIMITS.maxTextLength`
 * caracteres en total. Nunca lanza.
 */
export function parseWrittenParts(text: string, opts: ParseWrittenPartsOptions): ParseResult<Part[]> {
  if (typeof text !== "string") return { ok: false, issues: [issue("PARSE_TEXT", "El texto no se pudo leer.", 1, 1)] };
  const long = textTooLong(text);
  if (long) return { ok: false, issues: [long] };
  const partId = typeof opts?.partId === "function" ? opts.partId : (i: number) => `p${i + 1}`;
  const lines = text.split(/\r?\n/);
  const starts: number[] = [];
  lines.forEach((raw, i) => {
    if (raw.length <= PARSE_LIMITS.maxLineLength && PART_HEADER_RE.test(raw)) starts.push(i);
  });
  // Un preámbulo con solo líneas vacías o comentarios se suma a la primera parte.
  const preamble = starts.length > 0 ? lines.slice(0, starts[0]) : [];
  if (starts.length === 0 || preamble.some((l) => l.trim() !== "" && !isComment(l))) starts.unshift(0);
  else starts[0] = 0;
  if (starts.length > LIMITS.maxParts) {
    return { ok: false, issues: [issue("PARSE_TOO_MANY_PARTS", `El texto tiene ${starts.length} partes; el máximo es ${LIMITS.maxParts}.`, 1, 1, { max: LIMITS.maxParts })] };
  }
  const parts: Part[] = [];
  const issues: Issue[] = [];
  const warnings: Issue[] = [];
  starts.forEach((from, k) => {
    const to = starts[k + 1] ?? lines.length;
    const o: ParsePartOptions = { id: partId(k) };
    if (typeof opts?.startYarn === "string") o.startYarn = opts.startYarn;
    if (opts?.mode !== undefined) o.mode = opts.mode;
    const r = parseLines(lines.slice(from, to), from + 1, o);
    if (r.warnings) warnings.push(...r.warnings);
    if (r.ok) parts.push(r.value);
    else issues.push(...r.issues);
  });
  const w = warnings.length > 0 ? { warnings } : {};
  if (issues.length > 0) return { ok: false, issues, ...w };
  return { ok: true, value: parts, ...w };
}

// ---------------------------------------------------------- Normalización

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

function normalizeItems(items: Item[]): Item[] {
  return items.map((item) => {
    if (typeof item !== "object" || item === null) return item;
    if (item.type === "stitch") {
      const out = { ...item };
      if (out.loop === "both" || out.loop === undefined) delete out.loop;
      return out;
    }
    if (item.type === "group") return Array.isArray(item.items) ? { ...item, items: normalizeItems(item.items) } : { ...item };
    return { ...item };
  });
}

function normalizeRound(round: Round): Round {
  if (typeof round !== "object" || round === null) return round;
  const out: Round = { ...round };
  if (Array.isArray(out.items)) out.items = normalizeItems(out.items);
  if (out.through === undefined || out.through === out.number) delete out.through;
  if (out.expected === undefined) delete out.expected;
  if (typeof out.note === "string") {
    const n = normalizeMultiline(out.note);
    if (n.trim() === "") delete out.note;
    else out.note = n;
  } else if (out.note === undefined) delete out.note;
  return out;
}

/**
 * Forma normal de una parte (ADR 0011, sección 7). Es como la dejan `parsePart` y toda
 * operación de `edit-written.ts`:
 * 1. `loop: "both"` se omite;
 * 2. `through` igual a `number` se omite;
 * 3. `copies: 1` se omite;
 * 4. `name` y `finish` sin espacios al inicio ni al final;
 * 5. en notas y cierres, `\r\n` pasa a `\n` y se quitan los espacios al final de cada línea;
 * 6. `note` y `finish` vacíos (o solo con espacios) se omiten.
 * No fusiona puntos seguidos ni reordena nada. Pura: devuelve objetos nuevos y nunca lanza
 * con una parte que sea un objeto; con otro valor lo devuelve tal cual.
 */
export function normalizePart(part: Part): Part {
  if (typeof part !== "object" || part === null) return part;
  const out: Part = { ...part };
  if (typeof out.name === "string") out.name = out.name.trim();
  if (Array.isArray(out.rounds)) out.rounds = out.rounds.map(normalizeRound);
  if (out.copies === 1 || out.copies === undefined) delete out.copies;
  if (typeof out.finish === "string") {
    const f = normalizeMultiline(out.finish).trim();
    if (f === "") delete out.finish;
    else out.finish = f;
  } else if (out.finish === undefined) delete out.finish;
  if (typeof out.start === "object" && out.start !== null) out.start = { ...out.start };
  return out;
}

// ------------------------------------------------------------- Escritura

function formatItems(items: Item[], dialect: Dialect): string {
  return items
    .map((item) => {
      if (item.type === "color") return `@${item.yarn}`;
      if (item.type === "group") return `[${formatItems(item.items, dialect)}] x${item.times}`;
      const abbr = stitchAbbrev(item.stitch, dialect);
      const loop = item.loop && item.loop !== "both" ? ` ${loopAbbrev(item.loop, dialect)}` : "";
      return item.count === 1 ? `${abbr}${loop}` : `${item.count} ${abbr}${loop}`;
    })
    .join(", ");
}

/** Líneas de un texto de varias líneas, normalizado; `[]` si no es texto o está en blanco. */
function textLines(v: unknown, trimStart = false): string[] {
  if (typeof v !== "string") return [];
  let n = normalizeMultiline(v);
  if (trimStart) n = n.trim();
  return n.trim() === "" ? [] : n.split("\n");
}

const noteLine = (l: string) => (l === "" ? ">" : `> ${l}`);

/** Línea de la vuelta (sin notas). */
function roundLine(round: Round, dialect: Dialect): string {
  const prefix = dialect === "es" ? "V" : "R";
  const range = round.through !== undefined && round.through !== round.number ? `-${round.through}` : "";
  const expected = round.expected !== undefined ? ` (${round.expected})` : "";
  return `${prefix}${round.number}${range}: ${formatItems(round.items, dialect)}${expected}`;
}

/**
 * Escribe una vuelta: su línea y, si tiene nota, una línea `>` por cada línea de la nota.
 * `parseRound` lee el resultado (con el modo de `readingModeFor(dialect)`).
 */
export function formatRound(round: Round, dialect: Dialect = "es"): string {
  return [roundLine(round, dialect), ...textLines(round.note).map(noteLine)].join("\n");
}

/**
 * Texto libre en una sola línea para el nombre: un salto de línea se convertiría en otra
 * línea del patrón al volver a leerlo. Devuelve "" si no es texto o está en blanco
 * (documento sin validar: `validatePattern` los rechaza).
 */
function oneLine(v: unknown): string {
  if (typeof v !== "string") return "";
  // Sin `\s*[saltos]+\s*` en una sola expresión: con muchos espacios seguidos sería cuadrática.
  return v
    .split(/[\r\n\u2028\u2029]+/)
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .join(" ");
}

export interface FormattedPart {
  text: string;
  /** `roundLine[j]` es la línea (desde 1) de `part.rounds[j]` en `text`: ahí se muestran sus errores. */
  roundLine: number[];
}

/**
 * Escribe una parte en el dialecto (por omisión `"es"`) y dice en qué línea quedó cada
 * vuelta. Forma canónica: Parte, Cantidad (solo si se teje más de una vez), Inicio,
 * Construcción, Lana, las vueltas con sus notas `>` y el cierre (sus líneas siguientes, con `>`).
 */
export function formatPartLines(part: Part, dialect: Dialect = "es"): FormattedPart {
  const es = dialect === "es";
  // Un nombre vacío se escribe como "Parte", el mismo valor por omisión de `parsePart`.
  const name = oneLine(part.name) || (es ? "Parte" : "Part");
  const construction = es
    ? { spiral: "espiral", joined: "cerrada", flat: "hileras" }[part.construction]
    : part.construction;
  const start =
    part.start.type === "magic_ring"
      ? es ? "AM" : "MR"
      : `${es ? "cad" : "ch"} ${part.start.count}`;
  const lines = [`${es ? "Parte" : "Part"}: ${name}`];
  if (isInt(part.copies) && part.copies > 1) lines.push(`${es ? "Cantidad" : "Make"}: ${part.copies}`);
  lines.push(`${es ? "Inicio" : "Start"}: ${start}`, `${es ? "Construcción" : "Construction"}: ${construction}`, `${es ? "Lana" : "Yarn"}: ${part.startYarn}`);
  const roundLines: number[] = [];
  for (const r of part.rounds) {
    roundLines.push(lines.length + 1);
    lines.push(roundLine(r, dialect), ...textLines(r.note).map(noteLine));
  }
  const finish = textLines(part.finish, true);
  if (finish.length > 0) {
    lines.push(`${es ? "Cierre" : "Finish"}: ${finish[0]}`, ...finish.slice(1).map(noteLine));
  }
  return { text: lines.join("\n"), roundLine: roundLines };
}

export function formatPart(part: Part, dialect: Dialect = "es"): string {
  return formatPartLines(part, dialect).text;
}

// ------------------------------------------------- Largo del texto (T20-B3)

/** Largo de `${v}` en un texto armado (igual que la interpolación de plantilla). */
const strLen = (v: unknown): number => String(v).length;

function itemsLength(items: Item[], dialect: Dialect): number {
  let n = 0;
  items.forEach((item, i) => {
    if (i > 0) n += 2; // ", "
    if (item.type === "color") n += 1 + strLen(item.yarn);
    else if (item.type === "group") n += 1 + itemsLength(item.items, dialect) + 3 + strLen(item.times); // "[" … "] x" N
    else {
      n += stitchAbbrev(item.stitch, dialect).length;
      if (item.loop && item.loop !== "both") n += 1 + loopAbbrev(item.loop, dialect).length;
      if (item.count !== 1) n += strLen(item.count) + 1;
    }
  });
  return n;
}

/** Largo de las líneas `>` de un texto de varias líneas, con sus saltos de línea delante. */
function noteLinesLength(lines: string[]): number {
  let n = 0;
  for (const l of lines) n += 1 + (l === "" ? 1 : 2 + l.length);
  return n;
}

function partLength(part: Part, dialect: Dialect): number {
  const es = dialect === "es";
  const name = oneLine(part.name) || (es ? "Parte" : "Part");
  const construction = es ? { spiral: "espiral", joined: "cerrada", flat: "hileras" }[part.construction] : part.construction;
  const start = part.start.type === "magic_ring" ? 2 : (es ? 3 : 2) + 1 + strLen(part.start.count);
  // Cada encabezado mide "Título: valor"; las líneas se unen con "\n".
  let n = (es ? 5 : 4) + 2 + name.length;
  if (isInt(part.copies) && part.copies > 1) n += 1 + (es ? 8 : 4) + 2 + strLen(part.copies);
  n += 1 + (es ? 6 : 5) + 2 + start;
  n += 1 + 12 + 2 + strLen(construction); // "Construcción" y "Construction" miden 12
  n += 1 + 4 + 2 + strLen(part.startYarn); // "Lana" y "Yarn" miden 4
  for (const r of part.rounds) {
    const range = r.through !== undefined && r.through !== r.number ? 1 + strLen(r.through) : 0;
    const expected = r.expected !== undefined ? 3 + strLen(r.expected) : 0;
    n += 1 + 1 + strLen(r.number) + range + 2 + itemsLength(r.items, dialect) + expected;
    n += noteLinesLength(textLines(r.note));
  }
  const finish = textLines(part.finish, true);
  if (finish.length > 0) n += 1 + 6 + 2 + (finish[0] as string).length + noteLinesLength(finish.slice(1)); // "Cierre" y "Finish" miden 6
  return n;
}

/**
 * Largo exacto (en unidades UTF-16, como `PARSE_LIMITS.maxTextLength`) de `formatPart(part,
 * dialect)`, sin armar el texto: tiempo lineal en el tamaño de la parte. Sin `dialect`, el
 * del dialecto más largo. El validador lo usa para que toda parte `savable` se pueda abrir en
 * el editor de texto (hueco 2 de T20). Como `formatPart`, espera una parte con la forma del
 * modelo (las vueltas e ítems revisados por el validador).
 */
export function formattedPartLength(part: Part, dialect?: Dialect): number {
  if (dialect !== undefined) return partLength(part, dialect);
  let max = 0;
  for (const d of DIALECTS) max = Math.max(max, partLength(part, d));
  return max;
}
