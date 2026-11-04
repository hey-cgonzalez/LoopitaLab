/** Variables públicas de Supabase. Next las reemplaza en el build, por eso se leen una por una. */
export function supabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copia apps/web/.env.example a apps/web/.env.local y complétalo.",
    );
  }
  return { url, key };
}

/** URL pública del sitio para los enlaces que llegan por correo. */
export function siteUrl(fallbackOrigin?: string | null): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  return (fromEnv || fallbackOrigin || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Solo acepta rutas internas simples ("/proyectos", "/cuenta?x=1"), para que un enlace
 * manipulado no pueda redirigir a otro sitio después de iniciar sesión. Se usa una lista
 * de caracteres permitidos porque el parser de URL ignora tabulaciones y saltos de línea
 * ("/\t/otro.sitio" terminaría siendo "//otro.sitio").
 */
const SAFE_PATH_RE = /^\/(?![\/])[A-Za-z0-9\-._~\/?=&%]*$/;

export function safeNext(next: string | null | undefined, fallback = "/proyectos"): string {
  return next && SAFE_PATH_RE.test(next) ? next : fallback;
}
