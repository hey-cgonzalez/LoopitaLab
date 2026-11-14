import { STITCHES, stitchAbbrev } from "@loopitalab/pattern-core";
import type { Dialect, StitchCode } from "@loopitalab/pattern-core";
import { TERMS } from "./terms.ts";
import type { GlossaryLocale, TermEntry, TermKey, TermStatus } from "./terms.ts";

export { TERMS } from "./terms.ts";
export type { GlossaryLocale, TermEntry, TermKey, TermStatus, TermText } from "./terms.ts";

/** Idioma del glosario que corresponde a un dialecto de escritura. */
export function localeFor(dialect: Dialect): GlossaryLocale {
  return dialect === "uk" ? "en-GB" : dialect === "us" ? "en-US" : "es";
}

/**
 * Nombres completos en inglés de cada punto (US y UK). El nombre en español sale de
 * `STITCHES[code].nameEs`; las abreviaturas, de `pattern-core`. Tabla "U.S. vs. U.K.
 * Terminology" del Craft Yarn Council. TODO(verificar): nombres de `inc`, `inc3`, `dec`
 * y `sk` con una tejedora.
 */
const STITCH_NAMES_EN: Record<StitchCode, { us: string; uk: string }> = {
  sc: { us: "single crochet", uk: "double crochet" },
  hdc: { us: "half double crochet", uk: "half treble crochet" },
  dc: { us: "double crochet", uk: "treble crochet" },
  tr: { us: "treble crochet", uk: "double treble crochet" },
  slst: { us: "slip stitch", uk: "slip stitch" },
  ch: { us: "chain", uk: "chain" },
  inc: { us: "increase (2 single crochet in the same stitch)", uk: "increase (2 double crochet in the same stitch)" },
  inc3: { us: "triple increase (3 single crochet in the same stitch)", uk: "triple increase (3 double crochet in the same stitch)" },
  dec: { us: "decrease (2 single crochet together)", uk: "decrease (2 double crochet together)" },
  sk: { us: "skip", uk: "miss" },
};

export interface StitchLabel {
  /** Abreviatura con que se escribe el punto en el dialecto (la de `pattern-core`). */
  abbrev: string;
  /** Nombre completo en el dialecto. */
  name: string;
  /** Siempre "pendiente" hasta que una tejedora lo valide (T1b). */
  status: TermStatus;
}

/** Abreviatura y nombre completo de un punto en un dialecto. */
export function stitchLabel(code: StitchCode, dialect: Dialect): StitchLabel {
  const def = STITCHES[code];
  const names = STITCH_NAMES_EN[code];
  const name = dialect === "es" ? def.nameEs : dialect === "us" ? names.us : names.uk;
  return { abbrev: stitchAbbrev(code, dialect), name, status: "pendiente" };
}

/** Todos los puntos con su rótulo en un dialecto, en el orden de `STITCHES`. */
export function stitchLabels(dialect: Dialect): Array<{ code: StitchCode } & StitchLabel> {
  return (Object.keys(STITCHES) as StitchCode[]).map((code) => ({ code, ...stitchLabel(code, dialect) }));
}

const BY_KEY: ReadonlyMap<TermKey, TermEntry> = new Map(TERMS.map((t) => [t.key, t]));

/** Entrada completa de un término, o `undefined` si la clave no existe. */
export function termEntry(key: TermKey): TermEntry | undefined {
  return BY_KEY.get(key);
}

/**
 * Nombre de un término en el idioma pedido. Con `plural: true` devuelve el plural si el
 * término lo tiene; si no, el singular. Con una clave desconocida devuelve la clave.
 */
export function term(key: TermKey, locale: GlossaryLocale, opts?: { plural?: boolean }): string {
  const t = BY_KEY.get(key)?.texts[locale];
  if (t === undefined) return key;
  return opts?.plural === true && t.plural !== undefined ? t.plural : t.name;
}

/** Definición breve de un término en el idioma pedido, o `undefined` si la clave no existe. */
export function termDefinition(key: TermKey, locale: GlossaryLocale): string | undefined {
  return BY_KEY.get(key)?.texts[locale].definition;
}

/**
 * Palabra con que se nombra cada recorrido: "vuelta" en espiral y vueltas cerradas
 * (`"rounds"`), "fila" en ida y vuelta (`"flat"` o `"rows"`).
 */
export function roundWord(
  construction: "spiral" | "joined" | "flat" | "rounds" | "rows",
  locale: GlossaryLocale,
  opts?: { plural?: boolean },
): string {
  const key: TermKey = construction === "flat" || construction === "rows" ? "row" : "round";
  return term(key, locale, opts);
}
