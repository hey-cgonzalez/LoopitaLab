import type { Loop, StitchCode } from "./types.ts";

export interface StitchDef {
  code: StitchCode;
  /** Puntos que consume de la vuelta anterior. */
  consumes: number;
  /** Puntos que deja para la vuelta siguiente. */
  produces: number;
  /** Abreviatura canónica en español (Chile). */
  es: string;
  /** Abreviatura canónica en inglés (US). */
  us: string;
  /** Nombre completo en español. */
  nameEs: string;
  /** Otras formas aceptadas al leer texto. */
  aliases: string[];
}

/**
 * Tabla de puntos de crochet. Los números consume/produce son la base de todo
 * conteo del motor. En la v1, `inc`, `inc3` y `dec` se entienden en punto bajo.
 *
 * TODO(experto-tejido): validar abreviaturas regionales marcadas como provisionales
 * (aum3, ht/hd para hebra trasera/delantera, "saltar").
 */
export const STITCHES: Record<StitchCode, StitchDef> = {
  sc: { code: "sc", consumes: 1, produces: 1, es: "pb", us: "sc", nameEs: "punto bajo", aliases: ["pb", "sc", "single crochet"] },
  hdc: { code: "hdc", consumes: 1, produces: 1, es: "mpa", us: "hdc", nameEs: "medio punto alto", aliases: ["mpa", "hdc"] },
  dc: { code: "dc", consumes: 1, produces: 1, es: "pa", us: "dc", nameEs: "punto alto", aliases: ["pa", "dc"] },
  tr: { code: "tr", consumes: 1, produces: 1, es: "pad", us: "tr", nameEs: "punto alto doble", aliases: ["pad", "tr"] },
  slst: { code: "slst", consumes: 1, produces: 1, es: "pd", us: "slst", nameEs: "punto deslizado", aliases: ["pd", "pr", "slst", "sl st", "ss"] },
  ch: { code: "ch", consumes: 0, produces: 1, es: "cad", us: "ch", nameEs: "cadeneta", aliases: ["cad", "cadeneta", "ch"] },
  inc: { code: "inc", consumes: 1, produces: 2, es: "aum", us: "inc", nameEs: "aumento (2 pb en el mismo punto)", aliases: ["aum", "inc"] },
  inc3: { code: "inc3", consumes: 1, produces: 3, es: "aum3", us: "inc3", nameEs: "aumento triple (3 pb en el mismo punto)", aliases: ["aum3", "inc3"] },
  dec: { code: "dec", consumes: 2, produces: 1, es: "dism", us: "dec", nameEs: "disminución (2 pb juntos)", aliases: ["dism", "dec", "invdec", "sc2tog"] },
  sk: { code: "sk", consumes: 1, produces: 0, es: "saltar", us: "sk", nameEs: "saltar un punto", aliases: ["saltar", "sk", "skip"] },
};

export const LOOPS: Record<Exclude<Loop, "both">, { es: string; us: string; aliases: string[] }> = {
  back: { es: "ht", us: "blo", aliases: ["blo", "ht", "hebra trasera"] },
  front: { es: "hd", us: "flo", aliases: ["flo", "hd", "hebra delantera"] },
};

export type Dialect = "es" | "us";

/** Normaliza un término para buscarlo en las tablas: minúsculas, sin puntos ni espacios extra. */
export function normalizeTerm(raw: string): string {
  return raw.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

const stitchIndex = new Map<string, StitchCode>();
for (const def of Object.values(STITCHES)) {
  for (const alias of def.aliases) stitchIndex.set(normalizeTerm(alias), def.code);
}

const loopIndex = new Map<string, Exclude<Loop, "both">>();
for (const [loop, def] of Object.entries(LOOPS) as [Exclude<Loop, "both">, (typeof LOOPS)["back"]][]) {
  for (const alias of def.aliases) loopIndex.set(normalizeTerm(alias), loop);
}

export function lookupStitch(term: string): StitchCode | undefined {
  return stitchIndex.get(normalizeTerm(term));
}

export function lookupLoop(term: string): Exclude<Loop, "both"> | undefined {
  return loopIndex.get(normalizeTerm(term));
}

/*
 * Las búsquedas por texto de la usuaria pasan por los `Map` de arriba, nunca por `in` ni
 * por índice sobre los objetos: así "toString", "constructor" o "__proto__" no se
 * confunden con un punto o una hebra. Para revisar un código ya leído, `Object.hasOwn`.
 */

export function stitchAbbrev(code: StitchCode, dialect: Dialect): string {
  return STITCHES[code][dialect];
}

export function loopAbbrev(loop: Exclude<Loop, "both">, dialect: Dialect): string {
  return LOOPS[loop][dialect];
}
