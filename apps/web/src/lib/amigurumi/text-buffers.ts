import {
  formatPartLines,
  formatRound,
  isDraftError,
  parsePart,
  parseRound,
  readingModeFor,
  validatePattern,
  type Dialect,
  type Issue,
  type Part,
  type PartRef,
  type ReadingMode,
} from "@loopitalab/pattern-core";
import { deepEqual } from "./equal.ts";
import type { WrittenStore } from "./store.ts";

/*
 * Editor de texto por parte (ADR 0011, sección 7; T14 de la fase 4), fuera de React.
 *
 * - **Fuente de verdad**: el documento. El texto de una parte es `formatPart(part, dialecto)` mientras la usuaria no
 *   escriba; lo que escribe se lee en cada cambio con `parsePart(texto, { mode: readingModeFor(dialecto) })`.
 * - **Si se lee**, se aplica como operaciones (`applyPart`: `replacePartRounds` más los encabezados) y el 3D se
 *   actualiza. El texto queda como lo escribió la usuaria hasta que sale de la línea.
 * - **Si no se lee**, el documento no cambia y el texto queda en este búfer como *sin leer*. También queda *sin
 *   aplicar* si el documento no pudo tomar la parte (un tope duro del núcleo). En los dos casos el texto se conserva
 *   en el respaldo local (`pendingTexts`) y nunca entra al documento (CA4-E9).
 * - **Forma canónica** (decisión 7): al salir de una línea bien leída, `leaveLine` la reescribe en forma canónica
 *   ("pb x6" → "6 pb"). Nunca la línea donde está el cursor.
 * - **Dialecto**: se escribe con `formatPart(part, dialecto)` y se lee con `readingModeFor(dialecto)`. El modo de
 *   lectura nunca se guarda: se deriva del dialecto del perfil.
 */

export type BufferStatus = "synced" | "unread" | "rejected";

export interface PartText {
  readonly partId: string;
  readonly text: string;
  /** `synced`: el texto se leyó y es el documento. `unread`: no se lee. `rejected`: se lee, pero el documento no lo tomó. */
  readonly status: BufferStatus;
  /** Errores de lectura (`PARSE_*`), con `data.line` y `data.column`. */
  readonly errors: readonly Issue[];
  /** Avisos de lectura (por ejemplo `PARSE_COMMENT`, también cuando la lectura falla). */
  readonly warnings: readonly Issue[];
  /** Por qué el documento no tomó la parte (`rejected`): errores estructurales del motor. */
  readonly rejected: readonly Issue[];
  /** `roundLines[j]`: línea (desde 1) de `part.rounds[j]` del documento en `text`. Vacío si el texto no es el documento. */
  readonly roundLines: readonly number[];
  /** Parte del documento con la que se armó este estado. */
  readonly base: Part;
}

export interface InputResult {
  view: PartText;
  /** Piezas que quedaron sin ubicar (bajar la cantidad desde el texto). */
  unplaced: PartRef[];
}

export interface ReadOutcome {
  ok: boolean;
  part?: Part;
  errors: Issue[];
  warnings: Issue[];
}

/** Lee el texto de una parte con el modo del dialecto. El nombre y la lana inicial que falten salen de la parte actual. */
export function readPartText(text: string, base: Part, mode: ReadingMode): ReadOutcome {
  const r = parsePart(text, { id: base.id, name: base.name, startYarn: base.startYarn, mode });
  return r.ok ? { ok: true, part: r.value, errors: [], warnings: r.warnings ?? [] } : { ok: false, errors: r.issues, warnings: r.warnings ?? [] };
}

/** Línea (desde 1) de cada vuelta en un texto que se leyó bien: las líneas que `parseRound` lee, en orden. */
export function roundLinesIn(text: string, mode: ReadingMode): number[] {
  const out: number[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (parseRound(line, i + 1, mode).ok) out.push(i + 1);
  });
  return out;
}

const HEADERS: Array<{ re: RegExp; write: (p: Part, es: boolean) => string | null }> = [
  { re: /^\s*(?:parte|part)\s*:/i, write: (p, es) => `${es ? "Parte" : "Part"}: ${p.name}` },
  { re: /^\s*(?:cantidad|hacer|piezas|tejer|make)\b/i, write: (p, es) => `${es ? "Cantidad" : "Make"}: ${p.copies ?? 1}` },
  {
    re: /^\s*(?:inicio|start)\s*:/i,
    write: (p, es) => `${es ? "Inicio" : "Start"}: ${p.start.type === "magic_ring" ? (es ? "AM" : "MR") : `${es ? "cad" : "ch"} ${p.start.count}`}`,
  },
  {
    re: /^\s*(?:construcci[oó]n|construction)\s*:/i,
    write: (p, es) => `${es ? "Construcción" : "Construction"}: ${es ? { spiral: "espiral", joined: "cerrada", flat: "hileras" }[p.construction] : p.construction}`,
  },
  { re: /^\s*(?:lana|yarn)\s*:/i, write: (p, es) => `${es ? "Lana" : "Yarn"}: ${p.startYarn}` },
  {
    re: /^\s*(?:cierre|terminaci[oó]n|finish)\s*:/i,
    write: () => null, // se arma con el valor de la propia línea (un cierre puede seguir en líneas ">")
  },
];

/**
 * Forma canónica de UNA línea de un texto que se leyó bien (`part` es lo que se leyó). `null` si la línea no tiene
 * forma propia (vacía o comentario) o no se reconoce.
 */
export function canonicalLine(line: string, part: Part, dialect: Dialect, mode: ReadingMode): string | null {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return null;
  const es = dialect === "es";
  if (trimmed.startsWith(">")) {
    const rest = line.trimStart().slice(1);
    const content = (rest.startsWith(" ") ? rest.slice(1) : rest).trimEnd();
    return content === "" ? ">" : `> ${content}`;
  }
  const round = parseRound(line, 1, mode);
  if (round.ok) return formatRound(round.value, dialect).split("\n")[0] ?? null;
  for (const h of HEADERS) {
    if (!h.re.test(line)) continue;
    const written = h.write(part, es);
    if (written !== null) return written;
    const value = line.slice(line.indexOf(":") + 1).trim();
    return `${es ? "Cierre" : "Finish"}: ${value}`;
  }
  return null;
}

type Listener = () => void;

export class TextBuffers {
  readonly #store: WrittenStore;
  readonly #dialect: Dialect;
  readonly #mode: ReadingMode;
  #buffers = new Map<string, PartText>();
  /** Parte que se está aplicando desde el texto: mientras tanto, su búfer no se regenera desde el documento. */
  #applying: string | null = null;
  #listeners = new Set<Listener>();
  #version = 0;

  constructor(store: WrittenStore, dialect: Dialect) {
    this.#store = store;
    this.#dialect = dialect;
    this.#mode = readingModeFor(dialect);
  }

  get dialect(): Dialect {
    return this.#dialect;
  }

  /** Modo de lectura derivado del dialecto (nunca se guarda). */
  get mode(): ReadingMode {
    return this.#mode;
  }

  subscribe = (l: Listener): (() => void) => {
    this.#listeners.add(l);
    return () => {
      this.#listeners.delete(l);
    };
  };

  /** Sube con cada cambio de un texto (lo escrito, la forma canónica, descartar). */
  getVersion = (): number => this.#version;

  /**
   * Estado del texto de una parte. Estable: devuelve el mismo objeto mientras no cambien el texto ni la parte del
   * documento (sirve como `getSnapshot`). Si la parte cambió desde fuera (deshacer, renombrar en la lista, quitar una
   * lana), el texto se vuelve a escribir desde el documento, salvo que tenga líneas sin leer: esas se conservan.
   */
  view(partId: string): PartText | null {
    const part = this.#store.doc.parts.find((p) => p.id === partId);
    const b = this.#buffers.get(partId);
    if (!part) return b ?? null;
    if (b && (b.base === part || this.#applying === partId)) return b;
    if (b && b.status !== "synced") {
      const kept: PartText = { ...b, base: part };
      this.#buffers.set(partId, kept);
      return kept;
    }
    const f = formatPartLines(part, this.#dialect);
    const fresh: PartText = { partId, text: f.text, status: "synced", errors: [], warnings: [], rejected: [], roundLines: f.roundLine, base: part };
    this.#buffers.set(partId, fresh);
    return fresh;
  }

  /** La usuaria escribió: se lee y, si se lee, se aplica al documento. */
  input(partId: string, text: string): InputResult | null {
    const part = this.#store.doc.parts.find((p) => p.id === partId);
    if (!part) return null;
    const prev = this.#buffers.get(partId);
    const read = readPartText(text, part, this.#mode);
    if (!read.ok || !read.part) {
      const view: PartText = { partId, text, status: "unread", errors: read.errors, warnings: read.warnings, rejected: [], roundLines: [], base: part };
      this.#set(partId, view, prev);
      return { view, unplaced: [] };
    }
    this.#applying = partId;
    let result;
    try {
      // El búfer se fija antes de aplicar: los que escuchan al almacén leen el texto nuevo, no uno regenerado.
      this.#buffers.set(partId, { partId, text, status: "synced", errors: [], warnings: read.warnings, rejected: [], roundLines: [], base: part });
      result = this.#store.run({ type: "applyPart", partId, part: read.part });
    } finally {
      this.#applying = null;
    }
    const now = this.#store.doc.parts.find((p) => p.id === partId) ?? part;
    const view: PartText = result.applied
      ? { partId, text, status: "synced", errors: [], warnings: read.warnings, rejected: [], roundLines: this.#roundLines(text, now), base: now }
      : { partId, text, status: "rejected", errors: [], warnings: read.warnings, rejected: rejectionReasons(this.#store.doc.parts, partId, read.part, this.#store.doc), roundLines: [], base: now };
    this.#set(partId, view, prev);
    return { view, unplaced: result.unplaced };
  }

  /**
   * La usuaria salió de la línea `lineIndex` (desde 0). Si el texto está leído, esa línea pasa a su forma canónica.
   * Devuelve el texto nuevo y cuántos caracteres cambió la línea (para mover el cursor si estaba después), o `null`.
   */
  leaveLine(partId: string, lineIndex: number): { text: string; delta: number } | null {
    const b = this.view(partId);
    if (!b || b.status !== "synced") return null;
    const lines = b.text.split("\n");
    const line = lines[lineIndex];
    if (line === undefined) return null;
    const canon = canonicalLine(line, b.base, this.#dialect, this.#mode);
    if (canon === null || canon === line) return null;
    lines[lineIndex] = canon;
    const text = lines.join("\n");
    // Red de seguridad: la forma canónica tiene que leerse igual (RT2). Si no, no se toca la línea.
    const again = readPartText(text, b.base, this.#mode);
    if (!again.ok || !again.part || !deepEqual(again.part, b.base)) return null;
    const view: PartText = { ...b, text, warnings: again.warnings, roundLines: this.#roundLines(text, b.base) };
    this.#set(partId, view, b);
    return { text, delta: canon.length - line.length };
  }

  /** Vuelve a escribir la parte desde el documento ("Descartar las líneas sin leer"). */
  discard(partId: string): void {
    const prev = this.#buffers.get(partId);
    this.#buffers.delete(partId);
    if (prev) this.#bump();
  }

  /** Texto sin leer o sin aplicar, por parte existente (para el respaldo local). */
  pendingTexts(): Record<string, string> {
    const ids = new Set(this.#store.doc.parts.map((p) => p.id));
    const out: Record<string, string> = {};
    for (const [id, b] of this.#buffers) if (b.status !== "synced" && ids.has(id)) out[id] = b.text;
    return out;
  }

  /** Devuelve al editor el texto sin leer de un respaldo (se vuelve a leer: si ahora se lee, se aplica). */
  restore(map: Readonly<Record<string, string>>): void {
    for (const [id, text] of Object.entries(map)) this.input(id, text);
  }

  #roundLines(text: string, part: Part): number[] {
    const f = formatPartLines(part, this.#dialect);
    return f.text === text ? f.roundLine : roundLinesIn(text, this.#mode);
  }

  /**
   * Siempre avisa: aunque el documento no cambie (una línea en blanco, un comentario), el texto sí, y el campo
   * controlado tiene que mostrarlo.
   */
  #set(partId: string, view: PartText, prev: PartText | undefined): void {
    this.#buffers.set(partId, view);
    if (prev !== view) this.#bump();
  }

  #bump(): void {
    this.#version++;
    for (const l of [...this.#listeners]) l();
  }
}

/** Errores estructurales que tendría el documento con la parte leída (por qué no se pudo aplicar). */
function rejectionReasons(parts: readonly Part[], partId: string, part: Part, doc: Parameters<typeof validatePattern>[0]): Issue[] {
  const i = parts.findIndex((p) => p.id === partId);
  if (i < 0) return [];
  const candidate = { ...(doc as object), parts: parts.map((p, k) => (k === i ? part : p)) };
  return validatePattern(candidate)
    .issues.filter((x) => x.severity === "error" && !isDraftError(x) && x.path.startsWith(`parts[${i}]`))
    .slice(0, 5);
}
