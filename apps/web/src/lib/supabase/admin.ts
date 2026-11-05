import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase con la clave secreta (sb_secret_...). Se salta RLS: usarlo solo en
 * Route Handlers después de verificar la sesión, y siempre acotado a la usuaria de esa sesión.
 *
 * `import "server-only"` hace fallar el build si algún componente de cliente lo importa, así la
 * clave nunca termina en el navegador. La variable no lleva prefijo NEXT_PUBLIC_, por lo que
 * Next tampoco la incluiría en el bundle del cliente.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en el entorno del servidor.");
  }
  if (key.startsWith("sb_publishable_")) {
    throw new Error("SUPABASE_SECRET_KEY tiene una clave publicable; usa la clave secreta (sb_secret_...).");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Bucket privado de imágenes (supabase/migrations/20261104010200_storage_subidas.sql). */
export const UPLOADS_BUCKET = "uploads";
