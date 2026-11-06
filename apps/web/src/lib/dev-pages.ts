/**
 * Páginas internas de desarrollo (`/dev/*`), como el benchmark de la vista previa.
 *
 * Decisión: en un build de producción responden 404, salvo que el servidor se levante
 * con `LOOPITA_DEV_PAGES=1` (para medir sobre `next build && next start` en local o en
 * el equipo de referencia, CA-P6). Aunque se activen, no exponen nada: usan datos
 * sintéticos, no leen la sesión ni llaman a Supabase y piden `noindex`.
 */
export function devPagesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" || env.LOOPITA_DEV_PAGES === "1";
}
