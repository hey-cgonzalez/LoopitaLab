import type { FiberShare, Yarn } from "@loopitalab/pattern-core";
import { FIBERS, NEAR_COLOR_DELTA_E, PALETTE, WEIGHTS, nearestPaletteColors, suggestedGauge, weightInfo, weightLabel, type PaletteColor, type SuggestedGauge } from "@loopitalab/yarn-catalog";
import { HEX_RE, nearPaletteMatch, paletteExact, weightSearch } from "../yarns/form.ts";
import { COMPOSITION_MAX_ITEMS, yarnFromSaved, type SavedYarn } from "../yarns/saved.ts";
import { toolSuggestion, unusedFibers, yarnProblems } from "./yarn-edit.ts";

/*
 * Lógica pura del selector de lanas del estudio (T9 de la fase 3, ADR 0008 secciones 2 a 5). Sin React: se prueba con
 * Vitest. Reutiliza lo del formulario de `/lanas` (`weightSearch`, `nearPaletteMatch`) y lo del panel (`yarnProblems`).
 * No calcula conteos ni metros (regla de oro 2): solo elige, valida y rotula.
 */

// ------------------------------------------------------------------ grosor

export interface WeightOption {
  cat: number;
  /** "Medio (Worsted / Aran)": nombre de LoopitaLab con los nombres en inglés. */
  label: string;
  /** Lo que coincidió con la búsqueda (vacío sin búsqueda). */
  matched: string;
  /** Coincidencia por alias de tienda: se rotula "equivalencia aproximada" (sin nombrar la tienda). */
  approximate: boolean;
}

export interface WeightOptions {
  options: WeightOption[];
  /** Ayuda o "sin resultados"; `undefined` si no hay nada que explicar. */
  message?: string;
  /** Hay una búsqueda activa (la lista está filtrada). */
  filtered: boolean;
}

/** Categorías que se muestran en la lista: las 8 sin búsqueda; con búsqueda, las que coinciden (T1-8). */
export function weightOptions(query: string): WeightOptions {
  if (query.trim() === "") {
    return { options: WEIGHTS.map((w) => ({ cat: w.cat, label: weightLabel(w.cat), matched: "", approximate: false })), filtered: false };
  }
  const r = weightSearch(query);
  return {
    options: r.results.map((x) => ({ cat: x.cat, label: x.label, matched: x.matched, approximate: x.approximate })),
    ...(r.message ? { message: r.message } : {}),
    filtered: true,
  };
}

export interface WeightChoiceInfo {
  tools: { needlesMm: string; crochetMm: string; stitchRange: string } | null;
  /** Muestra supuesta del grosor para la técnica del diseño. Siempre "supuesto" hasta que la usuaria ingrese la suya. */
  gauge: SuggestedGauge | undefined;
  /** Categoría 7: la muestra de referencia es poco precisa. */
  lowConfidence: boolean;
}

export function weightChoiceInfo(cat: number, technique: "knit" | "crochet"): WeightChoiceInfo {
  const gauge = suggestedGauge(cat, technique);
  return { tools: toolSuggestion(cat), gauge, lowConfidence: gauge?.lowConfidence ?? weightInfo(cat)?.muestraPalillo[0] === 0 };
}

// ------------------------------------------------------------------ composición

export interface FiberRowProblem {
  /** `error` impide escribir la lana en el documento; `warning` solo avisa (fibra desconocida, E11 del ADR 0003). */
  level: "error" | "warning";
  message: string;
}

/** Avisos por fibra (uno o más por fila): porcentaje fuera de rango, fibra repetida o fuera del catálogo. */
export function fiberRowProblems(composition: readonly FiberShare[]): FiberRowProblem[][] {
  return composition.map((f, k) => {
    const out: FiberRowProblem[] = [];
    if (!Number.isFinite(f.percent)) out.push({ level: "error", message: "Escribe el porcentaje de esta fibra." });
    else if (f.percent <= 0) out.push({ level: "error", message: "El porcentaje debe ser mayor que 0. Si no lleva esta fibra, quítala." });
    else if (f.percent > 100) out.push({ level: "error", message: "El porcentaje no puede pasar de 100." });
    if (composition.findIndex((x) => x.fiber === f.fiber) !== k) out.push({ level: "error", message: "Esta fibra ya está en la lista: junta sus porcentajes en una sola fila." });
    if (!FIBERS.some((x) => x.id === f.fiber)) out.push({ level: "warning", message: "Esta fibra no está en la lista de LoopitaLab: el aspecto en la vista previa será neutro." });
    return out;
  });
}

/** Se puede agregar otra fibra: quedan fibras del catálogo sin usar y no se llegó al tope de la base. */
export function canAddFiberTo(composition: readonly FiberShare[]): boolean {
  return composition.length < COMPOSITION_MAX_ITEMS && unusedFibers(composition).length > 0;
}

// ------------------------------------------------------------------ color

export interface PaletteFamily {
  family: string;
  colors: PaletteColor[];
}

export type NavKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

/**
 * Foco itinerante de la cuadrícula de la paleta (una fila por familia). Izquierda y derecha recorren la fila; arriba y
 * abajo cambian de familia en la misma columna; Inicio y Fin van a los extremos de la fila. No da la vuelta.
 */
export function paletteNavigate(rows: readonly { length: number }[], pos: { row: number; col: number }, key: NavKey): { row: number; col: number } {
  const last = (r: number) => Math.max(0, (rows[r]?.length ?? 1) - 1);
  const row = Math.min(Math.max(pos.row, 0), rows.length - 1);
  const col = Math.min(Math.max(pos.col, 0), last(row));
  switch (key) {
    case "ArrowLeft":
      return { row, col: Math.max(0, col - 1) };
    case "ArrowRight":
      return { row, col: Math.min(last(row), col + 1) };
    case "ArrowUp": {
      const r = Math.max(0, row - 1);
      return { row: r, col: Math.min(col, last(r)) };
    }
    case "ArrowDown": {
      const r = Math.min(rows.length - 1, row + 1);
      return { row: r, col: Math.min(col, last(r)) };
    }
    case "Home":
      return { row, col: 0 };
    case "End":
      return { row, col: last(row) };
  }
}

/** Posición (fila, columna) del color de la paleta con ese hex, si es de la paleta. */
export function palettePosition(families: readonly PaletteFamily[], hex: string): { row: number; col: number } | null {
  const up = hex.toUpperCase();
  for (let row = 0; row < families.length; row++) {
    const col = families[row]!.colors.findIndex((c) => c.hex.toUpperCase() === up);
    if (col >= 0) return { row, col };
  }
  return null;
}

/** Acepta "a63d40", "#A63D40" y espacios; devuelve `#RRGGBB` en mayúsculas o `null` si no es un hex completo. */
export function parseHexInput(text: string): string | null {
  const t = text.trim().replace(/^#?/, "#").toUpperCase();
  return HEX_RE.test(t) ? t : null;
}

export interface CustomColorInfo {
  /** El color es exactamente uno de la paleta. */
  exact: PaletteColor | undefined;
  /** Color de la paleta más cercano (CIEDE2000) y su diferencia. */
  nearest: { color: PaletteColor; deltaE: number } | undefined;
  /** Diferencia menor que `NEAR_COLOR_DELTA_E`: "prácticamente igual" (F3-36). */
  practicallySame: boolean;
}

export function customColorInfo(hex: string): CustomColorInfo {
  if (!HEX_RE.test(hex)) return { exact: undefined, nearest: undefined, practicallySame: false };
  const exact = paletteExact(hex);
  if (exact) return { exact, nearest: undefined, practicallySame: false };
  const nearest = nearestPaletteColors(hex, 1)[0];
  return { exact: undefined, nearest, practicallySame: nearPaletteMatch(hex) !== undefined };
}

export { NEAR_COLOR_DELTA_E };

/** Nombre del color para rótulos: el de la paleta o "color personalizado". */
export function colorName(color: { hex: string; paletteId?: string }): string {
  const c = color.paletteId ? PALETTE.find((p) => p.id === color.paletteId) : undefined;
  return c ? c.nombre : "color personalizado";
}

// ------------------------------------------------------------------ Mis lanas

export interface UseSavedResult {
  yarn: Yarn;
  /** Errores del validador: la lana no se escribe (solo se escribe lo guardable). */
  errors: string[];
}

/**
 * "Usar en este diseño": copia por valor grosor, composición y color de la lana guardada sobre la lana `target`
 * (mismo `id`, así las casillas no cambian de lana). La nota NO se copia salvo `copyNote`; si no se copia, la lana
 * conserva su propia nota (es de la usuaria y de este diseño, no de la lana guardada).
 */
export function applySavedYarn(target: Yarn, saved: SavedYarn, opts: { copyNote?: boolean } = {}): UseSavedResult {
  const copy = yarnFromSaved(saved, target.id, { copyNote: opts.copyNote === true });
  const yarn: Yarn = copy.note === undefined && target.note ? { ...copy, note: target.note } : copy;
  return { yarn, errors: yarnProblems(yarn).errors.map((i) => i.message) };
}

/** Lana nueva a partir de una guardada (agregar): misma regla de la nota. */
export function newYarnFromSaved(id: string, saved: SavedYarn, opts: { copyNote?: boolean } = {}): UseSavedResult {
  const yarn = yarnFromSaved(saved, id, { copyNote: opts.copyNote === true });
  return { yarn, errors: yarnProblems(yarn).errors.map((i) => i.message) };
}
