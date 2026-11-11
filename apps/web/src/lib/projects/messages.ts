import type { Issue } from "@loopitalab/pattern-core";
import type { ChartPointer } from "@loopitalab/follow";
import { DESIGN_MESSAGES } from "../designs/messages.ts";
import { projectErrorMessage, spaced } from "../project-messages.ts";

/*
 * Errores de los proyectos con versión fijada y del avance (Server Actions de app/proyectos/actions.ts, ADR 0009).
 * El código identifica el caso y la interfaz decide qué hacer; el texto sale de aquí. Nunca se devuelve el mensaje de
 * Postgres ni de PostgREST (puede traer nombres de tablas, funciones o restricciones).
 *
 * Mapa de errores de la base (SQLSTATE de supabase/migrations/20261111031813_tejer_disenos.sql):
 *   PT409 + detail "pattern"   CONFLICT (conflictOn "pattern"): el diseño cambió desde que se validó
 *   PT409 + detail "progress"  CONFLICT (conflictOn "progress"): el avance cambió en otro dispositivo
 *   P0002 / 42501              NOT_FOUND (no se distingue "no existe" de "es de otra persona")
 *   22023                      NOT_A_CHART (argumentos o tipo: solo se tejen gráficos de colorwork)
 *   54000                      QUOTA (1000 proyectos), MAX_VERSIONS (200 por diseño) o VERSIONS_QUOTA (5000 en total)
 *   23514                      REJECTED (título fuera de 1 a 120 caracteres)
 *   23503 (borrar un diseño)   HAS_PROJECTS, en app/disenos/actions.ts
 */

export type ProjectErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "NOT_A_CHART"
  | "NO_DESIGN"
  | "NOT_SAVABLE"
  | "NOT_KNITTABLE"
  | "CONFLICT"
  | "VERSION_CHANGED"
  | "QUOTA"
  | "MAX_VERSIONS"
  | "VERSIONS_QUOTA"
  | "REJECTED"
  | "DATABASE";

export type WorkedIn = "rounds" | "rows";

/** "vuelta" en redondo, "fila" de ida y vuelta (C2, enmienda T1-2 del ADR 0009; igual que `rowWord` del motor). */
export const rowWord = (workedIn: WorkedIn | undefined): "vuelta" | "fila" => (workedIn === "rows" ? "fila" : "vuelta");

/**
 * "la vuelta 40" / "la fila 40" / "el gráfico terminado". `rowsDone` cuenta filas hechas: la actual es `rowsDone + 1`
 * (la misma convención que `round_number`). `totalRows` en 0 (plan sin filas) no se trata como terminado.
 */
export function positionText(workedIn: WorkedIn | undefined, totalRows: number, p: ChartPointer): string {
  if (totalRows > 0 && p.rowsDone >= totalRows) return "el gráfico terminado";
  return `la ${rowWord(workedIn)} ${p.rowsDone + 1}`;
}

export const PROJECT_MESSAGES: Record<Exclude<ProjectErrorCode, "CONFLICT" | "VERSION_CHANGED" | "QUOTA">, string> = {
  UNAUTHENTICATED: "Tu sesión terminó. Vuelve a ingresar para seguir con tu proyecto.",
  INVALID_REQUEST: "No pudimos leer lo que enviaste. Recarga la página e intenta de nuevo.",
  NOT_FOUND: "No encontramos ese proyecto o diseño. Puede que lo hayas borrado desde otro dispositivo.",
  NOT_A_CHART: "Por ahora solo se pueden tejer gráficos de colorwork.",
  NO_DESIGN: "Este proyecto no tiene un diseño asociado, así que no hay un patrón que seguir.",
  NOT_SAVABLE: "El diseño tiene errores que impiden abrirlo. Revísalo en el estudio.",
  NOT_KNITTABLE: "El diseño tiene errores de tejido que impiden tejerlo. Corrígelos en el estudio e intenta de nuevo.",
  MAX_VERSIONS: DESIGN_MESSAGES.MAX_VERSIONS,
  VERSIONS_QUOTA: `Llegaste al máximo de ${spaced(5000)} versiones guardadas entre todos tus diseños. Borra diseños que ya no uses.`,
  REJECTED: "El nombre del proyecto debe tener entre 1 y 120 caracteres.",
  DATABASE: "No pudimos completar la operación. Revisa tu conexión e intenta de nuevo en unos minutos.",
};

export const PATTERN_CONFLICT_MESSAGE = "El diseño cambió mientras preparabas el proyecto. Revisa los datos y vuelve a intentar.";

export const PROGRESS_CONFLICT_FALLBACK = "El avance cambió en otro dispositivo. Recarga para ver dónde vas.";

/** Conflicto de avance: "En otro dispositivo vas en la vuelta 40. Aquí vas en la vuelta 36. ¿Con cuál sigues?". */
export function progressConflictMessage(workedIn: WorkedIn | undefined, totalRows: number, theirs: ChartPointer, yours: ChartPointer | undefined): string {
  const other = positionText(workedIn, totalRows, theirs);
  const finished = totalRows > 0 && theirs.rowsDone >= totalRows;
  if (finished && yours) return `En otro dispositivo ya terminaste el gráfico. Aquí vas en ${positionText(workedIn, totalRows, yours)}. ¿Con cuál sigues?`;
  if (!yours) return `El avance cambió en otro dispositivo: vas en ${other}. Recarga para seguir desde ahí.`;
  return `En otro dispositivo vas en ${other}. Aquí vas en ${positionText(workedIn, totalRows, yours)}. ¿Con cuál sigues?`;
}

/** La versión fijada cambió en otro dispositivo (VERSION_CHANGED): el puntero que se enviaba era de otro plan. */
export function versionChangedMessage(workedIn: WorkedIn | undefined, totalRows: number, current: ChartPointer): string {
  return `Este proyecto cambió de versión del diseño en otro dispositivo. Recarga para seguir desde ${positionText(workedIn, totalRows, current)}. Revisa que la ${rowWord(workedIn)} coincida con tu tejido.`;
}

/** Fallo de una acción de proyectos. `error` es el texto para mostrar; `code` decide qué hace la interfaz. */
export interface ProjectFailure {
  ok: false;
  code: ProjectErrorCode;
  error: string;
  /** NOT_KNITTABLE y NOT_SAVABLE: los errores que lo impiden (los mismos del panel "Impide tejer"). */
  issues?: Issue[];
  /** CONFLICT: de qué es. En "pattern" la pantalla se recalcula; en "progress" se pregunta con cuál se sigue. */
  conflictOn?: "pattern" | "progress";
  /** CONFLICT de avance y VERSION_CHANGED: la posición y la hora que tiene el servidor (null: sin fila de avance). */
  currentPointer?: ChartPointer;
  currentUpdatedAt?: string | null;
  /** Para armar los textos con "vuelta" o "fila" y "terminado". */
  workedIn?: WorkedIn;
  totalRows?: number;
  /** VERSION_CHANGED: la versión fijada ahora. */
  currentVersion?: number;
  currentVersionId?: string;
}

export type ProjectFailureExtra = Partial<Omit<ProjectFailure, "ok" | "code" | "error">>;

export function projectFailure(code: Exclude<ProjectErrorCode, "CONFLICT" | "VERSION_CHANGED" | "QUOTA">, extra: ProjectFailureExtra = {}): ProjectFailure {
  return { ok: false, code, error: PROJECT_MESSAGES[code], ...extra };
}

export function patternConflict(): ProjectFailure {
  return { ok: false, code: "CONFLICT", error: PATTERN_CONFLICT_MESSAGE, conflictOn: "pattern" };
}

export function quotaFailure(): ProjectFailure {
  return { ok: false, code: "QUOTA", error: projectErrorMessage({ code: "54000" }, "project") };
}

/** Error de PostgREST con lo que usamos de él (`details` es el `detail` de Postgres). */
export interface DbError {
  code?: string;
  message?: string;
  details?: string | null;
  detail?: string | null;
}

/**
 * Traduce el error de una consulta o de `start_chart_project` / `repin_project` (ver el mapa arriba). Solo mira
 * `code` y `details`; el texto de `message` se usa únicamente para distinguir cuál de los tres topes de 54000 fue
 * (no se devuelve).
 */
export function mapDbError(error: DbError | null | undefined): ProjectFailure {
  switch (error?.code) {
    case "PT409": {
      const detail = error.details ?? error.detail ?? "";
      // Sin detalle reconocible se trata como conflicto de diseño: lo más seguro es recalcular antes de reintentar.
      return detail === "progress"
        ? { ok: false, code: "CONFLICT", error: PROGRESS_CONFLICT_FALLBACK, conflictOn: "progress" }
        : patternConflict();
    }
    case "P0002":
    case "42501":
      return projectFailure("NOT_FOUND");
    case "22023":
      return projectFailure("NOT_A_CHART");
    case "23514":
      return projectFailure("REJECTED");
    case "54000": {
      const text = error.message ?? "";
      if (/5000/.test(text)) return projectFailure("VERSIONS_QUOTA");
      if (/200/.test(text)) return projectFailure("MAX_VERSIONS");
      if (/proyectos|1000/.test(text)) return quotaFailure();
      return projectFailure("DATABASE");
    }
    default:
      return projectFailure("DATABASE");
  }
}
