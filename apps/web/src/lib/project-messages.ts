/**
 * Mensajes de los proyectos y sus notas (Server Actions de app/proyectos/actions.ts).
 * Los topes los aplica la base (supabase/migrations/20261107010000_cuotas_proyectos_lanas.sql,
 * error 54000): aquí solo se citan. Nunca se devuelve el mensaje de Postgres ni de PostgREST.
 */

/** Tope de proyectos por usuaria (projects_quota). */
export const PROJECTS_LIMIT = 1000;
/** Tope de notas por usuaria, entre todos sus proyectos (project_notes_quota). */
export const NOTES_LIMIT = 10000;

/** Qué se intentó guardar: desambigua el 54000 (cada tope tiene su texto). */
export type ProjectWriteKind = "project" | "note";

/** 10000 -> "10 000" (separador de miles en español, sin depender de la configuración regional). */
export function spaced(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

const GENERIC: Record<ProjectWriteKind, string> = {
  project: "No pudimos crear el proyecto. Revisa tu conexión e intenta de nuevo.",
  note: "No pudimos guardar la nota. Revisa tu conexión e intenta de nuevo.",
};

/**
 * Traduce un error de PostgREST al texto que se muestra. Solo mira `code`: el 54000 es el tope
 * (proyectos o notas, según `kind`); cualquier otro código recibe el mensaje genérico.
 */
export function projectErrorMessage(
  error: { code?: string; message?: string } | null | undefined,
  kind: ProjectWriteKind = "project",
): string {
  if (error?.code === "54000") {
    return kind === "note"
      ? `Llegaste al tope de ${spaced(NOTES_LIMIT)} notas en tus proyectos. No podemos guardar otra por ahora.`
      : `Llegaste al tope de ${PROJECTS_LIMIT} proyectos. No podemos crear otro por ahora.`;
  }
  return GENERIC[kind];
}
