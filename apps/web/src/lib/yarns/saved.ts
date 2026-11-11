import { validateYarn, type FiberShare, type Issue, type WeightCategory, type Yarn } from "@loopitalab/pattern-core";
import { FIBER_IDS, PALETTE, PALETTE_IDS } from "@loopitalab/yarn-catalog";
import { normalizeNote } from "../studio/yarn-edit.ts";

/*
 * Lanas guardadas de la usuaria (`user_yarns`, ADR 0008 sección 5). Lógica pura: valida lo que entra, arma la fila y
 * copia por valor entre la lista y el diseño. El documento nunca guarda el id de `user_yarns` y la nota privada no
 * viaja al diseño salvo que la usuaria lo pida.
 */

/** Tope de la nota de `user_yarns` (columna `note`, CHECK `char_length(note) <= 200`). */
export const SAVED_NOTE_MAX = 200;
/** Tope de lanas guardadas por usuaria (`user_yarns_quota`). */
export const SAVED_YARNS_LIMIT = 500;
/** Largo del nombre de fibra (`composition_is_valid`) y número de fibras. */
export const FIBER_NAME_MAX = 40;
export const COMPOSITION_MAX_ITEMS = 10;

export interface UserYarnInput {
  weight: number;
  composition: { fiber: string; percent: number }[];
  color: { hex: string; paletteId?: string };
  /** Nota privada ("la lana que tengo", marca o tienda). Texto libre; nunca se publica. */
  note?: string;
}

export interface SavedYarn {
  id: string;
  weight: WeightCategory;
  composition: FiberShare[];
  color: { hex: string; paletteId?: string };
  note?: string;
  createdAt: string;
}

/** Columnas escribibles de `user_yarns` (grants de la base: `weight, composition, color_hex, palette_id, note`). */
export interface UserYarnRow {
  weight: number;
  composition: FiberShare[];
  color_hex: string;
  palette_id: string | null;
  note: string | null;
}

export type PreparedYarn =
  | { ok: true; row: UserYarnRow; warnings: Issue[] }
  | { ok: false; code: "INVALID_YARN" | "NOTE_TOO_LONG"; issues: Issue[]; reason?: string };

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const invalid = (reason: string, issues: Issue[] = []): PreparedYarn => ({ ok: false, code: "INVALID_YARN", issues, reason });

/**
 * Valida con `validateYarn` (con el catálogo de fibras y la paleta) más las reglas de la base. Una fibra desconocida
 * avisa y no bloquea (E11 del ADR 0003); un `paletteId` que no existe, o que no corresponde al hex, sí bloquea (la base
 * tiene una clave foránea a la paleta y un hex que no es de la paleta nunca lleva `paletteId`). Una composición con una
 * fibra repetida se rechaza. Una nota de más de 200 caracteres se rechaza, salvo `truncateNote` (la usuaria confirmó).
 */
export function prepareUserYarn(input: unknown, opts: { truncateNote?: boolean } = {}): PreparedYarn {
  if (!isObj(input)) return invalid("La lana no se pudo leer.");
  const { weight, composition, color, note } = input;
  if (!Array.isArray(composition) || composition.length < 1 || composition.length > COMPOSITION_MAX_ITEMS) {
    return invalid(`La composición lleva de 1 a ${COMPOSITION_MAX_ITEMS} fibras.`);
  }
  if (!isObj(color) || typeof color.hex !== "string") return invalid("La lana necesita un color en formato #RRGGBB.");
  if (color.paletteId !== undefined && typeof color.paletteId !== "string") return invalid("El color indica la paleta con un valor que no es texto.");
  if (note !== undefined && note !== null && typeof note !== "string") return invalid("La nota debe ser texto.");

  // Se copian solo los campos conocidos: nada más entra a la fila ni al validador.
  const fibers: FiberShare[] = [];
  for (const f of composition) {
    if (!isObj(f) || typeof f.fiber !== "string" || typeof f.percent !== "number") return invalid("Cada fibra necesita su nombre y su porcentaje.");
    if ([...f.fiber].length < 1 || [...f.fiber].length > FIBER_NAME_MAX) return invalid(`El nombre de una fibra mide de 1 a ${FIBER_NAME_MAX} caracteres.`);
    fibers.push({ fiber: f.fiber, percent: f.percent });
  }
  if (new Set(fibers.map((f) => f.fiber)).size !== fibers.length) return invalid("Hay una fibra repetida en la composición.");

  const hex = color.hex.toUpperCase();
  const paletteId = color.paletteId;
  const yarn = { id: "A", weight, composition: fibers, color: { hex, ...(paletteId !== undefined ? { paletteId } : {}) } };
  const issues = validateYarn(yarn, "yarn", { fibers: FIBER_IDS, paletteIds: PALETTE_IDS });
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length > 0 || !HEX_RE.test(hex)) return invalid("La lana tiene datos que no son válidos.", errors);

  if (paletteId !== undefined) {
    const entry = PALETTE.find((c) => c.id === paletteId);
    if (!entry || entry.hex.toUpperCase() !== hex) return invalid("El color no corresponde a la paleta.");
  }

  let cleanNote: string | null = null;
  if (typeof note === "string") {
    const normalized = normalizeNote(note).trim();
    if ([...normalized].length > SAVED_NOTE_MAX) {
      if (!opts.truncateNote) return { ok: false, code: "NOTE_TOO_LONG", issues: [] };
      cleanNote = [...normalized].slice(0, SAVED_NOTE_MAX).join("").trim() || null;
    } else cleanNote = normalized || null;
  }

  return {
    ok: true,
    row: { weight: weight as number, composition: fibers, color_hex: hex, palette_id: paletteId ?? null, note: cleanNote },
    warnings: issues.filter((i) => i.severity !== "error"),
  };
}

/** Fila de la base -> lana guardada. `null` si la fila no tiene la forma esperada (no debería pasar: la base la valida). */
export function savedYarnFromRow(row: unknown): SavedYarn | null {
  if (!isObj(row)) return null;
  const { id, weight, composition, color_hex, palette_id, note, created_at } = row;
  if (typeof id !== "string" || !Number.isInteger(weight) || (weight as number) < 0 || (weight as number) > 7) return null;
  if (!Array.isArray(composition) || typeof color_hex !== "string" || typeof created_at !== "string") return null;
  const fibers: FiberShare[] = [];
  for (const f of composition) {
    if (!isObj(f) || typeof f.fiber !== "string" || typeof f.percent !== "number") return null;
    fibers.push({ fiber: f.fiber, percent: f.percent });
  }
  return {
    id,
    weight: weight as WeightCategory,
    composition: fibers,
    color: { hex: color_hex, ...(typeof palette_id === "string" ? { paletteId: palette_id } : {}) },
    ...(typeof note === "string" && note !== "" ? { note } : {}),
    createdAt: created_at,
  };
}

/**
 * "Usar en este diseño": copia por valor grosor, composición y color a una lana del documento con el id dado. La nota
 * NO se copia salvo `copyNote` (suele llevar la marca o dónde se compró: es de la lana de la usuaria, no del diseño).
 */
export function yarnFromSaved(saved: SavedYarn, id: string, opts: { copyNote?: boolean } = {}): Yarn {
  return {
    id,
    weight: saved.weight,
    composition: saved.composition.map((f) => ({ fiber: f.fiber, percent: f.percent })),
    color: { hex: saved.color.hex, ...(saved.color.paletteId !== undefined ? { paletteId: saved.color.paletteId } : {}) },
    ...(opts.copyNote && saved.note ? { note: saved.note } : {}),
  };
}

/** "Guardar en mis lanas": entrada de `saveUserYarn` a partir de una lana del diseño (copia por valor, con su nota). */
export function inputFromYarn(yarn: Yarn): UserYarnInput {
  return {
    weight: yarn.weight,
    composition: yarn.composition.map((f) => ({ fiber: f.fiber, percent: f.percent })),
    color: { hex: yarn.color.hex, ...(yarn.color.paletteId !== undefined ? { paletteId: yarn.color.paletteId } : {}) },
    ...(yarn.note ? { note: yarn.note } : {}),
  };
}
