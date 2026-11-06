import { EDIT_LIMITS, LIMITS, type Chart, type Gauge, type WeightCategory } from "@loopitalab/pattern-core";
import { PALETTE, FIBER_IDS } from "@loopitalab/yarn-catalog";
import { gaugeProblems, normalizeTitle, titleProblems } from "./fields.ts";
import type { NewDesignInput } from "./templates.ts";

/** Respuestas del asistente "Nuevo diseño", tal como las escribe la usuaria (texto en los números). */
export interface WizardForm {
  title: string;
  renderAs: "flat" | "tube" | "circle";
  workedIn: Chart["workedIn"];
  direction: Chart["direction"];
  width: string;
  height: string;
  repeatX: string;
  repeatY: string;
  /** id de la paleta propia de la lana de fondo. */
  colorId: string;
  weight: number;
  fiber: string;
  /** Muestra opcional: vacía = sin muestra (el documento no tendrá `gauge`). */
  gaugeStitches: string;
  gaugeRows: string;
}

export type WizardResult = { ok: true; input: NewDesignInput } | { ok: false; errors: Partial<Record<keyof WizardForm, string>> };

/** Valores por omisión: forma de tubo en redondo, el caso más común. */
export const DEFAULT_WIZARD: WizardForm = {
  title: "",
  renderAs: "tube",
  workedIn: "rounds",
  direction: "bottom_up",
  width: "8",
  height: "8",
  repeatX: "10",
  repeatY: "1",
  colorId: "crudo",
  weight: 4,
  fiber: "lana",
  gaugeStitches: "",
  gaugeRows: "",
};

const toInt = (s: string): number | null => (/^\d{1,4}$/.test(s.trim()) ? Number(s.trim()) : null);

/** Validación del asistente. Los límites vienen de pattern-core; el título y la muestra, del validador (fields.ts). */
export function buildWizardInput(f: WizardForm): WizardResult {
  const errors: Partial<Record<keyof WizardForm, string>> = {};

  const tp = titleProblems(f.title);
  if (tp.length > 0) errors.title = tp[0] as string;

  const size = (key: "width" | "height" | "repeatX" | "repeatY", max: number, what: string) => {
    const n = toInt(f[key]);
    if (n === null || n < 1 || n > max) errors[key] = `${what}: un número entero de 1 a ${max}.`;
    return n;
  };
  const width = size("width", EDIT_LIMITS.maxMotifWidth, "Puntos del motivo");
  const height = size("height", EDIT_LIMITS.maxMotifHeight, "Filas del motivo");
  const repeatX = size("repeatX", EDIT_LIMITS.maxRepeat, "Repeticiones a lo ancho");
  const repeatY = size("repeatY", EDIT_LIMITS.maxRepeat, "Repeticiones a lo alto");

  const color = PALETTE.find((c) => c.id === f.colorId);
  if (!color) errors.colorId = "Elige un color de la paleta.";
  if (!Number.isInteger(f.weight) || f.weight < 0 || f.weight > 7) errors.weight = "Elige un grosor.";
  if (!FIBER_IDS.has(f.fiber)) errors.fiber = "Elige una fibra.";
  if (f.renderAs === "circle" && f.workedIn === "rows") errors.workedIn = "El círculo se teje en redondo.";

  let gauge: Gauge | undefined;
  const gs = f.gaugeStitches.trim();
  const gr = f.gaugeRows.trim();
  if (gs !== "" || gr !== "") {
    const sts = toInt(gs);
    const rows = toInt(gr);
    if (sts === null || rows === null) {
      errors.gaugeStitches = "Anota puntos y filas en 10 cm (números enteros), o deja los dos vacíos para tejer una muestra después.";
    } else {
      const gp = gaugeProblems({ stitchesPer10cm: sts, rowsPer10cm: rows });
      if (gp.length > 0) errors.gaugeStitches = gp[0] as string;
      else gauge = { stitchesPer10cm: sts, rowsPer10cm: rows };
    }
  }

  if (Object.keys(errors).length > 0 || !color || width === null || height === null || repeatX === null || repeatY === null) return { ok: false, errors };

  const input: NewDesignInput = {
    title: normalizeTitle(f.title),
    width,
    height,
    repeat: { x: repeatX, y: repeatY },
    workedIn: f.workedIn,
    renderAs: f.renderAs,
    direction: f.direction,
    yarns: [{ id: "A", weight: f.weight as WeightCategory, composition: [{ fiber: f.fiber, percent: 100 }], color: { hex: color.hex, paletteId: color.id } }],
  };
  if (gauge) input.gauge = gauge;
  return { ok: true, input };
}

/** Límite de texto para el campo de título del asistente y del estudio. */
export const TITLE_MAX = LIMITS.maxTitleLength;
