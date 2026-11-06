/**
 * Lectura y escritura de patrones escritos en texto.
 *
 * Sintaxis (español o inglés US, se pueden mezclar):
 *   V1: 6 pb en AM (6)
 *   V2: aum x6 (12)
 *   V3: [pb, aum] x6 (18)
 *   V4-6: 18 pb (18)
 *   V7: @B, [pb 2, dism] x6 (12)
 *
 * - Prefijo de vuelta: V, Vta, Vuelta, R, Rnd, Round, H, Hilera, F, Fila, Row; rango con "-", "–" o "a".
 * - Punto con cantidad: "6 pb", "pb 6" o "pb x6". Hebra: "pb ht" (trasera) o "sc blo".
 * - Grupo: "[ … ] x6" o "[ … ] 6 veces".
 * - Cambio de lana: "@B" (identificador de la lana).
 * - Conteo declarado al final: "(18)".
 */
import { lookupLoop, lookupStitch, loopAbbrev, stitchAbbrev, type Dialect } from "./stitches.ts";
import type { Issue, Item, Part, PartStart, Round } from "./types.ts";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

const ROUND_RE =
  /^\s*(?:vuelta|vta|v|rnd|round|row|r|hilera|h|fila|f)\s*\.?\s*(\d+)(?:\s*(?:-|–|—|a|to)\s*(?:vuelta|vta|v|rnd|r|hilera|h|fila|f)?\s*(\d+))?\s*:\s*(.*)$/i;
const EXPECTED_RE = /\(\s*(\d+)\s*(?:pts?|puntos|sts?|stitches)?\s*\)\s*$/i;
const INTO_RING_RE = /\s+(?:en|in(?:to)?)\s+(?:el\s+|the\s+)?(?:am|mr|anillo(?:\s+m[aá]gico)?|magic\s+ring)\s*$/i;

function issue(code: string, message: string, line: number, column: number): Issue {
  return { code, severity: "error", path: `texto:${line}:${column}`, message, data: { line, column } };
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

function parseItems(text: string, baseCol: number, line: number, issues: Issue[]): Item[] {
  const pieces = splitTopLevel(text, baseCol);
  if (!Array.isArray(pieces)) {
    issues.push(issue("PARSE_BRACKETS", pieces.error, line, pieces.col + 1));
    return [];
  }
  const items: Item[] = [];
  for (const piece of pieces) {
    if (piece.text === "") {
      issues.push(issue("PARSE_EMPTY_ITEM", "Hay una coma de más o un elemento vacío.", line, piece.col + 1));
      continue;
    }
    const item = parseItem(piece, line, issues);
    if (item) items.push(item);
  }
  return items;
}

function parseItem(piece: Piece, line: number, issues: Issue[]): Item | null {
  const t = piece.text;
  const col = piece.col + 1;

  if (t.startsWith("[")) {
    const close = t.lastIndexOf("]");
    const tail = t.slice(close + 1).trim();
    const m = /^(?:[x×*]\s*(\d+)|(\d+)\s*veces|(\d+)\s*times)$/i.exec(tail);
    const times = m ? Number(m[1] ?? m[2] ?? m[3]) : NaN;
    if (!m || !(times >= 1)) {
      issues.push(issue("PARSE_GROUP_TIMES", `El grupo "${t}" necesita cuántas veces se repite, por ejemplo "x6".`, line, col));
      return null;
    }
    const inner = parseItems(t.slice(1, close), piece.col + 1, line, issues);
    if (inner.length === 0) {
      issues.push(issue("PARSE_EMPTY_GROUP", "El grupo está vacío.", line, col));
      return null;
    }
    return { type: "group", items: inner, times };
  }

  if (t.startsWith("@")) {
    const id = t.slice(1).trim();
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      issues.push(issue("PARSE_COLOR", `"${t}" no es un cambio de lana válido. Usa "@" y el identificador, por ejemplo "@B".`, line, col));
      return null;
    }
    return { type: "color", yarn: id };
  }

  let phrase = t.replace(INTO_RING_RE, "");
  let count = 1;
  let m: RegExpExecArray | null;
  if ((m = /^(\d+)\s+(.+)$/.exec(phrase))) {
    count = Number(m[1]);
    phrase = m[2] ?? "";
  } else if ((m = /^(.+?)\s*[x×]\s*(\d+)$/i.exec(phrase))) {
    phrase = m[1] ?? "";
    count = Number(m[2]);
  } else if ((m = /^(.+?)\s+(\d+)$/.exec(phrase))) {
    phrase = m[1] ?? "";
    count = Number(m[2]);
  }
  if (!(count >= 1)) {
    issues.push(issue("PARSE_COUNT", `La cantidad en "${t}" debe ser 1 o más.`, line, col));
    return null;
  }

  const resolved = resolveStitchPhrase(phrase);
  if (!resolved) {
    issues.push(issue("PARSE_UNKNOWN_STITCH", `No reconozco el punto "${phrase}".`, line, col));
    return null;
  }
  return resolved.loop
    ? { type: "stitch", stitch: resolved.stitch, count, loop: resolved.loop }
    : { type: "stitch", stitch: resolved.stitch, count };
}

function resolveStitchPhrase(phrase: string) {
  const clean = phrase.trim();
  const direct = lookupStitch(clean);
  if (direct) return { stitch: direct, loop: undefined };
  // "pb ht", "sc blo", "sc in blo", "pb en ht", "blo sc"
  const words = clean.split(/\s+/);
  for (let cut = 1; cut < words.length; cut++) {
    const head = words.slice(0, cut).join(" ");
    const tail = words.slice(cut).join(" ").replace(/^(?:en|in)\s+/i, "");
    const s1 = lookupStitch(head);
    const l1 = lookupLoop(tail);
    if (s1 && l1) return { stitch: s1, loop: l1 };
    const l2 = lookupLoop(head);
    const s2 = lookupStitch(tail);
    if (l2 && s2) return { stitch: s2, loop: l2 };
  }
  return undefined;
}

/** Lee una línea de vuelta. `line` es el número de línea para los mensajes (1 por defecto). */
export function parseRound(text: string, line = 1): ParseResult<Round> {
  const m = ROUND_RE.exec(text);
  if (!m) {
    return {
      ok: false,
      issues: [issue("PARSE_ROUND_PREFIX", 'Cada vuelta debe empezar con su número, por ejemplo "V3:".', line, 1)],
    };
  }
  const number = Number(m[1]);
  const through = m[2] !== undefined ? Number(m[2]) : undefined;
  let body = m[3] ?? "";
  const bodyCol = text.length - body.length;
  const issues: Issue[] = [];

  let expected: number | undefined;
  const em = EXPECTED_RE.exec(body);
  if (em) {
    expected = Number(em[1]);
    body = body.slice(0, em.index);
  }
  if (through !== undefined && through < number) {
    issues.push(issue("PARSE_RANGE", `El rango ${number}-${through} va hacia atrás.`, line, 1));
  }
  const items = parseItems(body.replace(/[\s,]+$/, ""), bodyCol, line, issues);
  if (issues.length === 0 && items.length === 0) {
    issues.push(issue("PARSE_EMPTY_ROUND", `La vuelta ${number} no tiene puntos.`, line, bodyCol + 1));
  }
  if (issues.length > 0) return { ok: false, issues };

  const round: Round = { number, items };
  if (through !== undefined && through !== number) round.through = through;
  if (expected !== undefined) round.expected = expected;
  return { ok: true, value: round };
}

export interface ParsePartOptions {
  id: string;
  name?: string;
  /** Lana inicial si el texto no la indica. Por defecto "A". */
  startYarn?: string;
}

const HEADER_RE = /^\s*([A-Za-zÁÉÍÓÚáéíóúñÑ ]+?)\s*:\s*(.+?)\s*$/;

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Lee una parte completa: líneas de encabezado opcionales y luego una vuelta por línea.
 *   Parte: Cuerpo
 *   Inicio: AM            (o "cad 10")
 *   Construcción: espiral (espiral | cerrada | hileras)
 *   Lana: A
 * Las líneas vacías y las que empiezan con "#" se ignoran.
 */
export function parsePart(text: string, opts: ParsePartOptions): ParseResult<Part> {
  const issues: Issue[] = [];
  let name = opts.name ?? "Parte";
  let construction: Part["construction"] = "spiral";
  let start: PartStart | undefined;
  let startYarn = opts.startYarn ?? "A";
  let finish: string | undefined;
  const rounds: Round[] = [];

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (raw.trim() === "" || raw.trim().startsWith("#")) return;
    if (ROUND_RE.test(raw)) {
      const r = parseRound(raw, line);
      if (r.ok) {
        rounds.push(r.value);
        if (!start && rounds.length === 1 && /\b(?:am|mr|anillo|magic ring)\b/i.test(raw)) {
          start = { type: "magic_ring" };
        }
      } else issues.push(...r.issues);
      return;
    }
    const h = HEADER_RE.exec(raw);
    if (!h) {
      issues.push(issue("PARSE_LINE", `No entiendo la línea "${raw.trim()}".`, line, 1));
      return;
    }
    const key = fold(h[1] ?? "");
    const value = (h[2] ?? "").trim();
    const v = fold(value);
    if (key === "parte" || key === "part") name = value;
    else if (key === "lana" || key === "yarn") startYarn = value.replace(/^@/, "");
    else if (key === "cierre" || key === "terminacion" || key === "finish") finish = value;
    else if (key === "construccion" || key === "construction") {
      if (["espiral", "spiral"].includes(v)) construction = "spiral";
      else if (["cerrada", "cerradas", "unida", "joined"].includes(v)) construction = "joined";
      else if (["hileras", "plano", "flat", "rows"].includes(v)) construction = "flat";
      else issues.push(issue("PARSE_CONSTRUCTION", `Construcción "${value}" desconocida. Usa espiral, cerrada o hileras.`, line, 1));
    } else if (key === "inicio" || key === "start") {
      const cm = /^(?:cad|ch|cadeneta)\s*(\d+)$|^(\d+)\s*(?:cad|ch)$/.exec(v);
      if (["am", "anillo magico", "mr", "magic ring"].includes(v)) start = { type: "magic_ring" };
      else if (cm) start = { type: "chain", count: Number(cm[1] ?? cm[2]) };
      else issues.push(issue("PARSE_START", `Inicio "${value}" desconocido. Usa "AM" o "cad 10".`, line, 1));
    } else {
      issues.push(issue("PARSE_HEADER", `Encabezado "${h[1]}" desconocido.`, line, 1));
    }
  });

  if (issues.length === 0 && rounds.length === 0) {
    issues.push(issue("PARSE_NO_ROUNDS", "La parte no tiene vueltas.", 1, 1));
  }
  if (issues.length > 0) return { ok: false, issues };

  const part: Part = { id: opts.id, name, construction, start: start ?? { type: "magic_ring" }, startYarn, rounds };
  if (finish !== undefined) part.finish = finish;
  return { ok: true, value: part };
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

export function formatRound(round: Round, dialect: Dialect = "es"): string {
  const prefix = dialect === "es" ? "V" : "R";
  const range = round.through !== undefined && round.through !== round.number ? `-${round.through}` : "";
  const expected = round.expected !== undefined ? ` (${round.expected})` : "";
  return `${prefix}${round.number}${range}: ${formatItems(round.items, dialect)}${expected}`;
}

/**
 * Texto libre en una sola línea para los encabezados: un salto de línea dentro del nombre
 * o del cierre se convertiría en otra línea del patrón al volver a leerlo. Devuelve "" si
 * no es texto o está en blanco (documento sin validar: `validatePattern` los rechaza).
 */
function oneLine(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s*[\r\n\u2028\u2029]+\s*/g, " ").trim() : "";
}

export function formatPart(part: Part, dialect: Dialect = "es"): string {
  const es = dialect === "es";
  // Un nombre vacío se escribe como "Parte", el mismo valor por omisión de `parsePart`.
  const name = oneLine(part.name) || (es ? "Parte" : "Part");
  const finish = oneLine(part.finish);
  const construction = es
    ? { spiral: "espiral", joined: "cerrada", flat: "hileras" }[part.construction]
    : part.construction;
  const start =
    part.start.type === "magic_ring"
      ? es ? "AM" : "MR"
      : `${es ? "cad" : "ch"} ${part.start.count}`;
  const lines = [
    `${es ? "Parte" : "Part"}: ${name}`,
    `${es ? "Inicio" : "Start"}: ${start}`,
    `${es ? "Construcción" : "Construction"}: ${construction}`,
    `${es ? "Lana" : "Yarn"}: ${part.startYarn}`,
    ...part.rounds.map((r) => formatRound(r, dialect)),
  ];
  if (finish !== "") lines.push(`${es ? "Cierre" : "Finish"}: ${finish}`);
  return lines.join("\n");
}
