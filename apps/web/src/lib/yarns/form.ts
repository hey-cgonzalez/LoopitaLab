import { FIBERS, NEAR_COLOR_DELTA_E, PALETTE, findWeights, nearestPaletteColors, weightInfo, weightLabel, weightQueryHint, type PaletteColor } from "@loopitalab/yarn-catalog";
import { compositionSum } from "../studio/yarn-edit.ts";
import { COMPOSITION_MAX_ITEMS, SAVED_NOTE_MAX, type SavedYarn, type UserYarnInput } from "./saved.ts";

/*
 * Lógica del formulario de `/lanas` (T10). Pura y sin React: se prueba con Vitest. La validación de aquí es solo la
 * ayuda en vivo; la verdad la dan `prepareUserYarn` y la base en el servidor (sus mensajes se muestran tal cual).
 */

export interface DraftFiber {
  key: number;
  fiber: string;
  /** Texto tal como lo escribe la usuaria ("33,5" vale). */
  percent: string;
}

export interface YarnDraft {
  weight: number | null;
  composition: DraftFiber[];
  /** `#RRGGBB` o vacío si aún no elige color. */
  hex: string;
  /** Solo si el hex es exactamente el de ese color de la paleta. */
  paletteId?: string;
  note: string;
}

export type DraftField = "weight" | "composition" | "color" | "note";
export interface DraftProblem {
  field: DraftField;
  message: string;
}

export const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function emptyDraft(): YarnDraft {
  return { weight: null, composition: [{ key: 1, fiber: "lana", percent: "100" }], hex: "", note: "" };
}

export function draftFromSaved(y: SavedYarn): YarnDraft {
  return {
    weight: y.weight,
    composition: y.composition.map((f, i) => ({ key: i + 1, fiber: f.fiber, percent: String(f.percent) })),
    hex: y.color.hex.toUpperCase(),
    ...(y.color.paletteId !== undefined ? { paletteId: y.color.paletteId } : {}),
    note: y.note ?? "",
  };
}

export function parsePercent(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}

export const fiberName = (id: string): string => FIBERS.find((f) => f.id === id)?.nombre ?? id;

export function noteLength(note: string): number {
  return [...note.trim()].length;
}

/** Color de la paleta cuyo hex es exactamente `hex`, si lo hay. */
export function paletteExact(hex: string): PaletteColor | undefined {
  const up = hex.toUpperCase();
  return PALETTE.find((c) => c.hex.toUpperCase() === up);
}

/** Color de la paleta a menos de `NEAR_COLOR_DELTA_E` de un hex personalizado (F3-36). `undefined` si es de la paleta o no hay uno cercano. */
export function nearPaletteMatch(hex: string): { color: PaletteColor; deltaE: number } | undefined {
  if (!HEX_RE.test(hex) || paletteExact(hex)) return undefined;
  const best = nearestPaletteColors(hex, 1)[0];
  return best && best.deltaE < NEAR_COLOR_DELTA_E ? best : undefined;
}

/** Cambia el hex: si coincide exactamente con un color de la paleta lleva su `paletteId`; si no, nunca. */
export function withHex(d: YarnDraft, raw: string): YarnDraft {
  const hex = raw.toUpperCase();
  const { paletteId: _drop, ...rest } = d;
  void _drop;
  const exact = HEX_RE.test(hex) ? paletteExact(hex) : undefined;
  return { ...rest, hex, ...(exact ? { paletteId: exact.id } : {}) };
}

export function draftProblems(d: YarnDraft): DraftProblem[] {
  const out: DraftProblem[] = [];
  if (d.weight === null || !weightInfo(d.weight)) out.push({ field: "weight", message: "Elige el grosor de la lana." });

  if (d.composition.length < 1) out.push({ field: "composition", message: "Agrega al menos una fibra." });
  const parsed = d.composition.map((f) => parsePercent(f.percent));
  if (parsed.some((p) => p === null || p <= 0 || p > 100)) {
    out.push({ field: "composition", message: "Cada porcentaje debe ser un número mayor que 0 y hasta 100 (por ejemplo 70 o 33,5)." });
  } else if (d.composition.length > 0) {
    const sum = compositionSum(parsed.map((p, i) => ({ fiber: d.composition[i]!.fiber, percent: p as number })));
    if (sum !== 100) {
      const txt = String(sum).replace(".", ",");
      out.push({ field: "composition", message: sum < 100 ? `Los porcentajes suman ${txt} %: faltan ${String(Math.round((100 - sum) * 100) / 100).replace(".", ",")} % para llegar a 100 %.` : `Los porcentajes suman ${txt} %: sobran ${String(Math.round((sum - 100) * 100) / 100).replace(".", ",")} %. Deben sumar 100 %.` });
    }
  }
  if (new Set(d.composition.map((f) => f.fiber)).size !== d.composition.length) out.push({ field: "composition", message: "Hay una fibra repetida: junta sus porcentajes en una sola fila." });

  if (d.hex === "") out.push({ field: "color", message: "Elige un color de la paleta o escribe uno personalizado." });
  else if (!HEX_RE.test(d.hex)) out.push({ field: "color", message: "El color debe tener el formato #RRGGBB, por ejemplo #A63D40." });

  if (noteLength(d.note) > SAVED_NOTE_MAX) out.push({ field: "note", message: `La nota tiene ${noteLength(d.note)} caracteres y el máximo es ${SAVED_NOTE_MAX}. Acórtala.` });
  return out;
}

/** Entrada de `saveUserYarn` / `updateUserYarn`. `null` si el borrador aún no se puede convertir (hay problemas en vivo). */
export function draftToInput(d: YarnDraft): UserYarnInput | null {
  if (draftProblems(d).length > 0 || d.weight === null) return null;
  const note = d.note.trim();
  return {
    weight: d.weight,
    composition: d.composition.map((f) => ({ fiber: f.fiber, percent: parsePercent(f.percent) as number })),
    color: { hex: d.hex.toUpperCase(), ...(d.paletteId !== undefined ? { paletteId: d.paletteId } : {}) },
    ...(note ? { note } : {}),
  };
}

export function canAddFiber(d: YarnDraft): boolean {
  return d.composition.length < COMPOSITION_MAX_ITEMS && FIBERS.some((f) => !d.composition.some((x) => x.fiber === f.id));
}

export interface WeightSearchResult {
  results: { cat: number; label: string; matched: string; approximate: boolean }[];
  /** Mensaje de ayuda o de "sin resultados"; `undefined` si hay resultados o no se escribió nada. */
  message?: string;
}

/** Búsqueda de grosor por nombre o alias (ADR 0008, T1-8). El resultado por alias se rotula aproximado. */
export function weightSearch(query: string): WeightSearchResult {
  if (query.trim() === "") return { results: [] };
  const hint = weightQueryHint(query);
  if (hint === "too_short") return { results: [], message: "Escribe al menos 2 letras para buscar un grosor." };
  if (hint === "ply_varies_by_country") {
    return {
      results: [],
      message: "Lo que significa «ply» cambia según el país, así que no podemos asegurar a qué grosor corresponde. Búscalo por nombre (por ejemplo «fino» o «aran») o elígelo en la lista de abajo.",
    };
  }
  const results = findWeights(query).map((m) => ({ cat: m.cat, label: weightLabel(m.cat), matched: m.matched, approximate: m.approximate }));
  if (results.length === 0) return { results, message: "No encontramos un grosor con ese nombre. Prueba con otro nombre o elígelo en la lista de abajo." };
  return { results };
}

/** "70 % Lana, 30 % Mohair". */
export function describeComposition(c: readonly { fiber: string; percent: number }[]): string {
  return c.map((f) => `${String(f.percent).replace(".", ",")} % ${fiberName(f.fiber)}`).join(", ");
}
