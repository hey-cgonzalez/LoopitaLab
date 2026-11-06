import { newChartPattern, validatePattern, type ChartPattern, type Gauge } from "@loopitalab/pattern-core";

/*
 * Validación de los campos que no pasan por `edit.ts`: título y muestra (ADR 0006, E10).
 * `TITLE_LENGTH`, `TEXT_CONTROL_CHAR` y `GAUGE` son errores estructurales: si entraran al documento,
 * el autoguardado se bloquearía. Para no copiar las reglas, se pregunta al validador de pattern-core con
 * un documento mínimo (1 × 1): así la interfaz y el servidor nunca discrepan, y cuesta microsegundos.
 */

const PROBE: ChartPattern = newChartPattern({
  id: "probe",
  title: "Prueba",
  width: 1,
  height: 1,
  repeat: { x: 1, y: 1 },
  workedIn: "rounds",
  renderAs: "tube",
  direction: "bottom_up",
  yarns: [{ id: "A", weight: 4, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#FFFFFF" } }],
});

function errorsAt(candidate: ChartPattern, path: "title" | "gauge"): string[] {
  return validatePattern(candidate)
    .issues.filter((i) => i.severity === "error" && (i.path === path || i.path.startsWith(`${path}.`)))
    .map((i) => i.message);
}

/** Título tal como se guarda: sin espacios en los extremos. */
export const normalizeTitle = (raw: string): string => raw.trim();

/** Mensajes de error del título (vacío si es válido). Sirve para el aviso junto al campo. */
export function titleProblems(raw: string): string[] {
  return errorsAt({ ...PROBE, title: normalizeTitle(raw) }, "title");
}

/** Mensajes de error de la muestra (vacío si es válida). */
export function gaugeProblems(gauge: Gauge): string[] {
  return errorsAt({ ...PROBE, gauge }, "gauge");
}
