import { LIMITS, validateYarn, yarnLetter, type FiberShare, type Issue, type Yarn } from "@loopitalab/pattern-core";
import { FIBER_IDS, FIBERS, PALETTE, PALETTE_IDS, weightInfo, type PaletteColor } from "@loopitalab/yarn-catalog";

/*
 * Edición de lanas (T9). Lógica pura. La lana que entra al documento ya es válida (`updateYarn` del almacén la
 * rechaza si no); mientras la usuaria escribe, el panel guarda un borrador local y muestra qué falta.
 */

/**
 * Nota de lana: `\r\n` y `\r` pasan a `\n` (ADR 0003, E17), se quitan los demás caracteres de control (salvo `\n` y
 * `\t`) y los sustitutos UTF-16 sueltos (E16, `TEXT_CONTROL_CHAR`), y se corta en `maxYarnNoteLength` puntos de código.
 */
export function normalizeNote(raw: string): string {
  const unified = raw.replace(/\r\n?/g, "\n");
  const out: string[] = [];
  for (const ch of unified) {
    if (ch === "\n" || ch === "\t") out.push(ch);
    else if (/^\p{Cc}$/u.test(ch)) continue;
    else if (ch.length === 1 && /[\uD800-\uDFFF]/.test(ch)) continue; // sustituto suelto
    else out.push(ch);
  }
  return out.slice(0, LIMITS.maxYarnNoteLength).join("");
}

/** Lana con la nota normalizada; una nota vacía quita el campo (el documento es cerrado, no guarda `note: ""`). */
export function withNote(yarn: Yarn, raw: string): Yarn {
  const { note: _old, ...rest } = yarn;
  const note = normalizeNote(raw);
  return note.length > 0 ? { ...rest, note } : rest;
}

/** Primera letra libre (A, B, C…, AA…) como identificador de una lana nueva. */
export function nextYarnId(yarns: readonly Yarn[]): string {
  const used = new Set(yarns.map((y) => y.id));
  for (let i = 0; i < 1000; i++) {
    const id = yarnLetter(i);
    if (!used.has(id)) return id;
  }
  return `L${yarns.length + 1}`;
}

/** Colores de la paleta agrupados por familia, en el orden de `yarn-catalog`. */
export function paletteByFamily(): { family: string; colors: PaletteColor[] }[] {
  const map = new Map<string, PaletteColor[]>();
  for (const c of PALETTE) {
    const list = map.get(c.familia) ?? [];
    list.push(c);
    map.set(c.familia, list);
  }
  return [...map].map(([family, colors]) => ({ family, colors }));
}

/** Lana nueva: grosor y composición de la primera lana, y el primer color de la paleta que el diseño aún no usa. */
export function newYarnFor(doc: { readonly yarns: readonly Yarn[] }): Yarn {
  const used = new Set(doc.yarns.map((y) => y.color.hex.toUpperCase()));
  const pick = PALETTE.find((c) => !used.has(c.hex.toUpperCase())) ?? PALETTE[0];
  const base = doc.yarns[0];
  return {
    id: nextYarnId(doc.yarns),
    weight: base?.weight ?? 4,
    composition: base ? base.composition.map((f) => ({ ...f })) : [{ fiber: "lana", percent: 100 }],
    color: pick ? { hex: pick.hex, paletteId: pick.id } : { hex: "#808080" },
  };
}

/** Color de la paleta con su `paletteId`, o personalizado (sin `paletteId`). Un hex que no es de la paleta nunca lleva `paletteId`. */
export function withColor(yarn: Yarn, color: { hex: string; paletteId?: string }): Yarn {
  const hex = color.hex.toUpperCase();
  return { ...yarn, color: color.paletteId ? { hex, paletteId: color.paletteId } : { hex } };
}

export function compositionSum(composition: readonly FiberShare[]): number {
  return Math.round(composition.reduce((s, f) => s + (Number.isFinite(f.percent) ? f.percent : 0), 0) * 100) / 100;
}

/** Fibras que aún no están en la composición, para ofrecerlas al agregar. */
export function unusedFibers(composition: readonly FiberShare[]): string[] {
  const used = new Set(composition.map((f) => f.fiber));
  return FIBERS.map((f) => f.id).filter((id) => !used.has(id));
}

export interface YarnProblems {
  /** Impiden guardar la lana (errores): la lana no entra al documento. */
  errors: Issue[];
  /** Avisos (fibra repetida o desconocida…): la lana entra igual. */
  warnings: Issue[];
}

export function yarnProblems(yarn: Yarn): YarnProblems {
  const issues = validateYarn(yarn, "yarn", { fibers: FIBER_IDS, paletteIds: PALETTE_IDS });
  return { errors: issues.filter((i) => i.severity === "error"), warnings: issues.filter((i) => i.severity !== "error") };
}

/** Sugerencia de agujas y crochet para el grosor (rótulo de `yarn-catalog`). `null` si la categoría no existe. */
export function toolSuggestion(weight: number): { needlesMm: string; crochetMm: string; stitchRange: string } | null {
  const w = weightInfo(weight);
  if (!w) return null;
  const range = (r: [number, number | null]) => (r[1] === null ? `${fmt(r[0])} mm o más` : `${fmt(r[0])} a ${fmt(r[1])} mm`);
  const [lo, hi] = w.muestraPalillo;
  return { needlesMm: range(w.agujasMm), crochetMm: range(w.crochetMm), stitchRange: lo === 0 ? `${hi} puntos o menos` : `${lo} a ${hi} puntos` };
}

const fmt = (n: number) => String(n).replace(".", ",");
