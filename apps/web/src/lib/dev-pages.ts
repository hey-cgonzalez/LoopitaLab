/**
 * Páginas internas de desarrollo (`/dev/*`), como el benchmark de la vista previa.
 *
 * Decisión: en un build de producción responden 404, salvo que el servidor se levante
 * con `LOOPITA_DEV_PAGES=1` (para medir sobre `next build && next start` en local o en
 * el equipo de referencia, CA-P6). Aunque se activen, no exponen nada: usan datos
 * sintéticos, no leen la sesión ni llaman a Supabase y piden `noindex`.
 *
 * El despliegue real nunca las activa (seguridad, MEDIO-2): si el entorno es el de producción
 * (`VERCEL_ENV=production` o `LOOPITA_ENV=production`), `LOOPITA_DEV_PAGES=1` hace fallar el build
 * y el arranque (`assertDevPagesSafe`, llamado desde `next.config.ts`) y, por si acaso, se ignora.
 */
type Env = Record<string, string | undefined>;

/** ¿Es el despliegue real (no un `next start` local para medir)? */
export function isDeployedProduction(env: Env = process.env): boolean {
  return env.VERCEL_ENV === "production" || env.LOOPITA_ENV === "production";
}

export function devPagesEnabled(env: Env = process.env): boolean {
  if (env.NODE_ENV !== "production") return true;
  return env.LOOPITA_DEV_PAGES === "1" && !isDeployedProduction(env);
}

export const DEV_PAGES_IN_PRODUCTION_ERROR =
  "LOOPITA_DEV_PAGES=1 no se permite en el despliegue de producción (VERCEL_ENV o LOOPITA_ENV = production). Quita la variable del entorno.";

/** Lanza si se intenta activar las páginas de desarrollo en el despliegue real. */
export function assertDevPagesSafe(env: Env = process.env): void {
  if (env.NODE_ENV === "production" && env.LOOPITA_DEV_PAGES === "1" && isDeployedProduction(env)) {
    throw new Error(DEV_PAGES_IN_PRODUCTION_ERROR);
  }
}
