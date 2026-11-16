import { isDraftError, validatePattern, type Issue, type ValidateOptions, type WeightCategory, type WrittenPattern } from "@loopitalab/pattern-core";
import { FIBER_IDS, PALETTE_IDS, suggestedGauge } from "@loopitalab/yarn-catalog";
import { AMIGURUMI_TEXTS } from "./texts.ts";
import { viewerPerfSpan } from "./viewer-perf.ts";

/*
 * Revisión del patrón escrito en el estudio (ADR 0011, sección 4; ADR 0010, enmienda T5-1). Corre diferida, nunca
 * entre la edición y el dibujo (CA4-P5): el editor da primero el conteo y los errores de lectura.
 */

/**
 * Opciones del validador cuando el documento no trae muestra (regla de oro 6: el supuesto se marca, no se esconde):
 * la muestra de crochet sugerida para el grosor de la lana principal (`suggestedGauge`), con `assumption` traducido
 * al punto de la muestra (`crochet-pa` → `dc`; si no, `sc`). Si `yarn-catalog` no conoce el grosor, `weightCat` y la
 * tabla interna del validador. Con muestra en el documento, ninguna de las dos.
 */
export function writtenValidateOptions(pattern: WrittenPattern): ValidateOptions {
  const base: ValidateOptions = { fibers: FIBER_IDS, paletteIds: PALETTE_IDS };
  if (pattern.gauge) return base;
  const weight = pattern.yarns[0]?.weight;
  if (typeof weight !== "number") return base;
  const s = suggestedGauge(weight, "crochet");
  if (s) return { ...base, assumedGauge: { stitchesPer10cm: s.stitchesPer10cm, rowsPer10cm: s.rowsPer10cm }, assumedGaugeStitch: s.assumption === "crochet-pa" ? "dc" : "sc" };
  return { ...base, weightCat: weight as WeightCategory };
}

export type Hint = "ring" | "join" | "turning_chain";

export interface ReviewItem {
  issue: Issue;
  /** Mensaje del motor sin las pistas del final (van aparte, `data.hints`, enmienda T4-2). */
  message: string;
  hints: Hint[];
  draft: boolean;
}

export interface PartReview {
  /** Por `part.rounds[j]`. */
  byRound: Map<number, ReviewItem[]>;
  /** De la parte, fuera de una vuelta (inicio, lana inicial, nombre…). */
  general: ReviewItem[];
}

export interface WrittenReview {
  valid: boolean;
  savable: boolean;
  byPart: Map<string, PartReview>;
  /** Del documento (lanas, muestra, ubicación…). */
  general: ReviewItem[];
  errors: number;
  warnings: number;
}

const PART_RE = /^parts\[(\d+)\](?:\.rounds\[(\d+)\])?/;

function hintsOf(issue: Issue): Hint[] {
  const h = (issue.data as { hints?: unknown } | undefined)?.hints;
  return Array.isArray(h) ? (h.filter((x) => x === "ring" || x === "join" || x === "turning_chain") as Hint[]) : [];
}

/** Quita del final del mensaje el texto de las pistas, que la interfaz muestra aparte. */
export function stripHints(message: string, hints: readonly Hint[]): string {
  let out = message;
  for (const h of [...hints].reverse()) {
    const text = AMIGURUMI_TEXTS.pistas[h];
    if (out.endsWith(text)) out = out.slice(0, out.length - text.length).trimEnd();
  }
  return out;
}

export function reviewItem(issue: Issue): ReviewItem {
  const hints = hintsOf(issue);
  return { issue, message: stripHints(issue.message, hints), hints, draft: isDraftError(issue) };
}

/** Agrupa los problemas por parte y por vuelta (`parts[i].rounds[j]`). */
export function groupIssues(pattern: WrittenPattern, issues: readonly Issue[]): Omit<WrittenReview, "valid" | "savable"> {
  const byPart = new Map<string, PartReview>();
  const general: ReviewItem[] = [];
  let errors = 0;
  let warnings = 0;
  for (const issue of issues) {
    if (issue.severity === "error") errors++;
    else if (issue.severity === "warning") warnings++;
    const m = PART_RE.exec(issue.path);
    const part = m ? pattern.parts[Number(m[1])] : undefined;
    const item = reviewItem(issue);
    if (!part) {
      general.push(item);
      continue;
    }
    const pr: PartReview = byPart.get(part.id) ?? { byRound: new Map<number, ReviewItem[]>(), general: [] };
    if (m?.[2] !== undefined) {
      const j = Number(m[2]);
      const list = pr.byRound.get(j) ?? [];
      list.push(item);
      pr.byRound.set(j, list);
    } else pr.general.push(item);
    byPart.set(part.id, pr);
  }
  return { byPart, general, errors, warnings };
}

/** Valida con las opciones de la muestra supuesta y agrupa. Se llama diferido. */
export function reviewWritten(pattern: WrittenPattern): WrittenReview {
  const r = viewerPerfSpan("validate:review", () => validatePattern(pattern, writtenValidateOptions(pattern)));
  return { valid: r.valid, savable: r.savable, ...groupIssues(pattern, r.issues) };
}
