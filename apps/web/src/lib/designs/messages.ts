/**
 * Mensajes de los diseños guardados (Server Actions de app/disenos/actions.ts).
 * Un solo lugar para el texto en español: el código identifica el caso y la interfaz decide qué hacer
 * (CONFLICT ofrece recargar o sobrescribir, UNAUTHENTICATED manda a ingresar). Nunca se devuelve el
 * mensaje de Postgres ni de PostgREST: puede traer nombres de tablas o de restricciones.
 */

import { maxVersionsText, quotaFullText, STUDIO_TEXTS } from "../studio-texts.ts";

/** Topes que muestran los mensajes; los aplica el servidor (supabase/migrations), aquí solo se citan. */
export const PATTERNS_QUOTA_LIMIT = 500;
export const MAX_VERSIONS_LIMIT = 200;

export type DesignErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_REQUEST"
  | "TOO_LARGE"
  | "NOT_SAVABLE"
  | "CONFLICT"
  | "NOT_FOUND"
  | "MAX_VERSIONS"
  | "HAS_PROJECTS"
  | "QUOTA"
  | "AI_DUPLICATE_UNSUPPORTED"
  | "REJECTED_BY_DATABASE"
  | "DATABASE";

export const DESIGN_MESSAGES: Record<DesignErrorCode, string> = {
  UNAUTHENTICATED: "Tu sesión terminó. Vuelve a ingresar para guardar tu diseño.",
  INVALID_REQUEST: "No pudimos leer el diseño que enviaste. Recarga la página e intenta de nuevo.",
  TOO_LARGE: "El diseño es demasiado grande para guardarlo. Reduce el tamaño del motivo o las notas.",
  NOT_SAVABLE: "El diseño tiene errores que impiden guardarlo. Corrígelos e intenta de nuevo.",
  CONFLICT: STUDIO_TEXTS.guardado.conflicto,
  NOT_FOUND: "No encontramos ese diseño. Puede que lo hayas borrado desde otro dispositivo.",
  // Los textos repetidos en el estudio viven en studio-texts.ts (una sola fuente).
  MAX_VERSIONS: maxVersionsText(MAX_VERSIONS_LIMIT),
  HAS_PROJECTS: "Este diseño tiene proyectos con su avance. Bórralos antes de borrar el diseño; al borrarlos pierdes el avance.",
  QUOTA: quotaFullText(PATTERNS_QUOTA_LIMIT),
  AI_DUPLICATE_UNSUPPORTED: `${STUDIO_TEXTS.misDisenos.duplicarNoIa} Edita el original o empieza uno nuevo.`,
  REJECTED_BY_DATABASE: "No pudimos guardar el diseño porque tiene un carácter que no se puede guardar (por ejemplo, un carácter invisible pegado desde otro programa) o no cumple las reglas de almacenamiento. Revisa el título y las notas, quita lo que hayas pegado y vuelve a intentar.",
  DATABASE: "No pudimos completar la operación. Revisa tu conexión e intenta de nuevo en unos minutos.",
};

export function designMessage(code: DesignErrorCode): string {
  return DESIGN_MESSAGES[code];
}

/**
 * Traduce un error de PostgREST a un código nuestro. `code` es el SQLSTATE o el código PGRST.
 * `op` desambigua 54000: al crear o duplicar es la cuota de diseños (patterns_quota); en cualquier
 * otra operación es el tope de versiones (snapshot_pattern).
 */
export function dbErrorCode(error: { code?: string; details?: string | null; detail?: string | null } | null | undefined, op: "create" | "other" = "other"): DesignErrorCode {
  switch (error?.code) {
    case "23514": // check_violation: título distinto del documento, tamaño, notas privadas en compartidos…
    case "23502": // not_null_violation
    case "22P02": // texto con formato inválido (uuid, timestamp) o sustituto UTF-16 suelto en el JSON
    case "22P05": // jsonb no admite U+0000 ("unsupported Unicode escape sequence")
      return "REJECTED_BY_DATABASE";
    case "42501": // RLS o privilegio: no es suyo
    case "P0002": // snapshot_pattern: patrón no encontrado
      return "NOT_FOUND";
    case "54000": {
      // `detail` estable (migración 20261113010000): patterns | versions_per_pattern | versions_total.
      const detail = error.details ?? error.detail;
      if (detail === "patterns") return "QUOTA";
      if (detail === "versions_per_pattern" || detail === "versions_total") return "MAX_VERSIONS";
      // TRANSITORIO: sin detail (migración aún no aplicada en el proyecto real) se desambigua por `op`. Borrar al aplicarla.
      return op === "create" ? "QUOTA" : "MAX_VERSIONS";
    }
    default:
      return "DATABASE";
  }
}
