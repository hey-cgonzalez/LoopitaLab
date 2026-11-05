import type { SupabaseClient } from "@supabase/supabase-js";

/** Ventana en la que se puede cambiar la contraseña después de abrir el enlace del correo. */
const RECOVERY_WINDOW_SECONDS = 15 * 60;

interface AmrEntry {
  method: string;
  timestamp: number;
}

function decodePayload(jwt: string): Record<string, unknown> | null {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * ¿La sesión actual viene de un enlace de recuperación (o código por correo) abierto hace poco?
 * Lee el claim `amr` del token de acceso. Llama a getUser() primero para que Supabase valide
 * el token; recién entonces se confía en lo que dice.
 */
export async function hasRecentEmailProof(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return false;
  const payload = decodePayload(session.access_token);
  const amr = Array.isArray(payload?.amr) ? (payload.amr as AmrEntry[]) : [];
  const now = Math.floor(Date.now() / 1000);
  return amr.some((a) => (a.method === "recovery" || a.method === "otp") && now - a.timestamp <= RECOVERY_WINDOW_SECONDS);
}
