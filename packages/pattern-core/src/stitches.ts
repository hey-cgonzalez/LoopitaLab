import type { Loop, StitchCode } from "./types.ts";

/**
 * Dialecto con que se **escribe** un patrón (ADR 0011, sección 8): español de Chile,
 * inglés de EE. UU. o inglés del Reino Unido. Es el valor de `profiles.pattern_dialect`.
 */
export type Dialect = "es" | "us" | "uk";

/** Dialectos, en el orden en que la interfaz los ofrece. */
export const DIALECTS: readonly Dialect[] = Object.freeze(["es", "us", "uk"] as const);

/**
 * Modo de **lectura** del texto (ADR 0011, sección 8; enmienda C-16). El español se lee
 * siempre; el inglés, en US o en UK según el modo. Nunca se adivina: "dc" es punto alto en
 * US y punto bajo en UK. Por omisión, `"es-us"`.
 */
export type ReadingMode = "es-us" | "es-uk";

export const READING_MODES: readonly ReadingMode[] = Object.freeze(["es-us", "es-uk"] as const);

/**
 * Modo de lectura que corresponde a un dialecto de escritura: `uk` se lee en `es-uk`; `es`
 * y `us`, en `es-us`. Así `parsePart(formatPart(p, d), { mode: readingModeFor(d) })` lee lo
 * que se escribió (RT1). Con un valor desconocido, `"es-us"`.
 */
export function readingModeFor(dialect: Dialect): ReadingMode {
  return dialect === "uk" ? "es-uk" : "es-us";
}

/** Alias de lectura de un punto o una hebra, separados por dialecto (se cargan por modo). */
export interface DialectAliases {
  es: readonly string[];
  us: readonly string[];
  uk: readonly string[];
}

export interface StitchDef {
  code: StitchCode;
  /** Puntos que consume de la vuelta anterior. */
  consumes: number;
  /** Puntos que deja para la vuelta siguiente. */
  produces: number;
  /** Abreviatura canónica en español (Chile). */
  es: string;
  /** Abreviatura canónica en inglés (US, Craft Yarn Council). */
  us: string;
  /** Abreviatura canónica en inglés (UK, tabla "U.S. vs. U.K. Terminology" del CYC). */
  uk: string;
  /** Nombre completo en español. */
  nameEs: string;
  /**
   * Formas aceptadas al leer, por dialecto. `es-us` carga `es` y `us`; `es-uk`, `es` y `uk`
   * (RT5: en un modo, ningún alias corresponde a dos puntos). La abreviatura canónica de
   * cada dialecto está siempre entre sus alias.
   */
  aliases: DialectAliases;
}

/**
 * Tabla de puntos de crochet. Los números consume/produce son la base de todo
 * conteo del motor. En la v1, `inc`, `inc3` y `dec` se entienden en punto bajo.
 *
 * Abreviaturas: enmienda C-15 del ADR 0011 (CYC). Sin variantes regionales del español
 * hasta que T1b las respalde (F4-69): ni "medio punto", ni "pma", ni "punto raso" ("pr").
 *
 * TODO(experto-tejido): validar abreviaturas marcadas como provisionales
 * (aum3/inc3, ht/hd para hebra trasera/delantera, "saltar", "miss" y "mr").
 */
export const STITCHES: Record<StitchCode, StitchDef> = {
  sc: {
    code: "sc", consumes: 1, produces: 1, es: "pb", us: "sc", uk: "dc", nameEs: "punto bajo",
    aliases: { es: ["pb"], us: ["sc", "single crochet"], uk: ["dc"] },
  },
  hdc: {
    code: "hdc", consumes: 1, produces: 1, es: "mpa", us: "hdc", uk: "htr", nameEs: "medio punto alto",
    aliases: { es: ["mpa"], us: ["hdc"], uk: ["htr"] },
  },
  dc: {
    code: "dc", consumes: 1, produces: 1, es: "pa", us: "dc", uk: "tr", nameEs: "punto alto",
    aliases: { es: ["pa"], us: ["dc"], uk: ["tr"] },
  },
  tr: {
    code: "tr", consumes: 1, produces: 1, es: "pad", us: "tr", uk: "dtr", nameEs: "punto alto doble",
    aliases: { es: ["pad"], us: ["tr"], uk: ["dtr"] },
  },
  slst: {
    code: "slst", consumes: 1, produces: 1, es: "pd", us: "sl st", uk: "ss", nameEs: "punto deslizado",
    aliases: { es: ["pd"], us: ["sl st", "slst"], uk: ["ss"] },
  },
  ch: {
    code: "ch", consumes: 0, produces: 1, es: "cad", us: "ch", uk: "ch", nameEs: "cadeneta",
    aliases: { es: ["cad", "cadeneta"], us: ["ch"], uk: ["ch"] },
  },
  inc: {
    code: "inc", consumes: 1, produces: 2, es: "aum", us: "inc", uk: "inc", nameEs: "aumento (2 pb en el mismo punto)",
    aliases: { es: ["aum"], us: ["inc"], uk: ["inc"] },
  },
  inc3: {
    code: "inc3", consumes: 1, produces: 3, es: "aum3", us: "inc3", uk: "inc3", nameEs: "aumento triple (3 pb en el mismo punto)",
    aliases: { es: ["aum3"], us: ["inc3"], uk: ["inc3"] },
  },
  dec: {
    code: "dec", consumes: 2, produces: 1, es: "dism", us: "dec", uk: "dec", nameEs: "disminución (2 pb juntos)",
    // "sc2tog" solo en US: en UK la disminución de pb es "dc2tog", que en US sería de pa (C-16).
    aliases: { es: ["dism"], us: ["dec", "invdec", "sc2tog"], uk: ["dec", "dc2tog"] },
  },
  sk: {
    code: "sk", consumes: 1, produces: 0, es: "saltar", us: "sk", uk: "miss", nameEs: "saltar un punto",
    aliases: { es: ["saltar"], us: ["sk", "skip"], uk: ["miss"] },
  },
};

export interface LoopDef {
  es: string;
  us: string;
  uk: string;
  aliases: DialectAliases;
}

export const LOOPS: Record<Exclude<Loop, "both">, LoopDef> = {
  back: { es: "ht", us: "blo", uk: "blo", aliases: { es: ["ht", "hebra trasera"], us: ["blo"], uk: ["blo"] } },
  front: { es: "hd", us: "flo", uk: "flo", aliases: { es: ["hd", "hebra delantera"], us: ["flo"], uk: ["flo"] } },
};

/** Normaliza un término para buscarlo en las tablas: minúsculas, sin puntos ni espacios extra. */
export function normalizeTerm(raw: string): string {
  return raw.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

/** Dialectos cuyos alias carga cada modo de lectura. */
const MODE_DIALECTS: Record<ReadingMode, readonly Dialect[]> = { "es-us": ["es", "us"], "es-uk": ["es", "uk"] };

/** Pares (alias normalizado, código) que carga un modo. Para las pruebas de RT5 y para el glosario. */
export function stitchAliases(mode: ReadingMode): Array<[alias: string, code: StitchCode]> {
  const out: Array<[string, StitchCode]> = [];
  for (const d of MODE_DIALECTS[mode] ?? MODE_DIALECTS["es-us"]) {
    for (const def of Object.values(STITCHES)) for (const a of def.aliases[d]) out.push([normalizeTerm(a), def.code]);
  }
  return out;
}

/** Pares (alias normalizado, hebra) que carga un modo. */
export function loopAliases(mode: ReadingMode): Array<[alias: string, loop: Exclude<Loop, "both">]> {
  const out: Array<[string, Exclude<Loop, "both">]> = [];
  for (const d of MODE_DIALECTS[mode] ?? MODE_DIALECTS["es-us"]) {
    for (const [loop, def] of Object.entries(LOOPS) as [Exclude<Loop, "both">, LoopDef][]) for (const a of def.aliases[d]) out.push([normalizeTerm(a), loop]);
  }
  return out;
}

const stitchIndex = new Map<ReadingMode, Map<string, StitchCode>>();
const loopIndex = new Map<ReadingMode, Map<string, Exclude<Loop, "both">>>();
for (const mode of READING_MODES) {
  stitchIndex.set(mode, new Map(stitchAliases(mode)));
  loopIndex.set(mode, new Map(loopAliases(mode)));
}

const modeOrDefault = (mode: unknown): ReadingMode => (mode === "es-uk" ? "es-uk" : "es-us");

/** Código del punto que nombra `term` en el modo de lectura (por omisión `"es-us"`), o `undefined`. */
export function lookupStitch(term: string, mode: ReadingMode = "es-us"): StitchCode | undefined {
  return stitchIndex.get(modeOrDefault(mode))?.get(normalizeTerm(term));
}

export function lookupLoop(term: string, mode: ReadingMode = "es-us"): Exclude<Loop, "both"> | undefined {
  return loopIndex.get(modeOrDefault(mode))?.get(normalizeTerm(term));
}

/*
 * Las búsquedas por texto de la usuaria pasan por los `Map` de arriba, nunca por `in` ni
 * por índice sobre los objetos: así "toString", "constructor" o "__proto__" no se
 * confunden con un punto o una hebra. Para revisar un código ya leído, `Object.hasOwn`.
 */

/**
 * Términos del otro dialecto que no se aceptan en silencio (F4-64, F4-66; enmienda C-16):
 * en `es-uk`, los nombres US del punto bajo, del medio punto alto y de su disminución; en
 * `es-us`, `htr` y `dtr`, que son de UK. Dan `PARSE_UNKNOWN_STITCH` con esta pista.
 * Textos provisionales: los redacta `documentador`. // validar con tejedora
 */
const OTHER_DIALECT_HINTS: Record<ReadingMode, ReadonlyMap<string, string>> = {
  "es-uk": new Map([
    ["sc", "sc es US; en UK el punto bajo se llama dc."],
    ["single crochet", "single crochet es US; en UK el punto bajo se llama dc."],
    ["hdc", "hdc es US; en UK el medio punto alto se llama htr."],
    ["sc2tog", "sc2tog es US; en UK la disminución de punto bajo se llama dc2tog."],
  ]),
  "es-us": new Map([
    ["htr", "htr es UK (medio punto alto; en US, hdc). Si el patrón está en terminología UK, elige UK al leerlo."],
    ["dtr", "dtr en UK es el punto alto doble (en US, tr). Si el patrón está en terminología UK, elige UK al leerlo."],
  ]),
};

/** Pista del otro dialecto para un término que no se leyó, o `undefined`. */
export function otherDialectHint(term: string, mode: ReadingMode = "es-us"): string | undefined {
  return OTHER_DIALECT_HINTS[modeOrDefault(mode)].get(normalizeTerm(term));
}

export function stitchAbbrev(code: StitchCode, dialect: Dialect): string {
  const def = STITCHES[code];
  return dialect === "uk" ? def.uk : dialect === "us" ? def.us : def.es;
}

export function loopAbbrev(loop: Exclude<Loop, "both">, dialect: Dialect): string {
  const def = LOOPS[loop];
  return dialect === "uk" ? def.uk : dialect === "us" ? def.us : def.es;
}
