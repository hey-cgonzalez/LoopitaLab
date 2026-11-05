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

/** Datos del token de acceso, ya validado por Supabase Auth. */
export interface SessionProof {
  userId: string;
  /** Claim session_id: cambia con cada signInWithPassword. */
  sessionId: string | null;
  /** Segundos Unix de la autenticación "password" más reciente del token, o null. */
  passwordAuthAt: number | null;
  amr: AmrEntry[];
}

/**
 * Lee el token de acceso de la sesión. Llama a getUser() primero para que Supabase valide el
 * token; recién entonces se confía en lo que dice. null si no hay sesión válida, o si el token
 * es de otra usuaria que la validada.
 */
export async function readSessionProof(supabase: SupabaseClient): Promise<SessionProof | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  const payload = decodePayload(session.access_token);
  if (!payload || payload.sub !== user.id) return null;
  const amr = (Array.isArray(payload.amr) ? payload.amr : []).filter(
    (a): a is AmrEntry => !!a && typeof a === "object" && typeof (a as AmrEntry).method === "string" && typeof (a as AmrEntry).timestamp === "number",
  );
  const passwordTimes = amr.filter((a) => a.method === "password").map((a) => a.timestamp);
  return {
    userId: user.id,
    sessionId: typeof payload.session_id === "string" ? payload.session_id : null,
    passwordAuthAt: passwordTimes.length ? Math.max(...passwordTimes) : null,
    amr,
  };
}

/** ¿La sesión tiene una autenticación con alguno de estos métodos en los últimos `windowSeconds`? */
export async function hasRecentAuth(supabase: SupabaseClient, methods: readonly string[], windowSeconds: number): Promise<boolean> {
  const proof = await readSessionProof(supabase);
  if (!proof) return false;
  const now = Math.floor(Date.now() / 1000);
  return proof.amr.some((a) => methods.includes(a.method) && now - a.timestamp >= -60 && now - a.timestamp <= windowSeconds);
}

/** ¿La sesión viene de un enlace de recuperación (o código por correo) abierto hace poco? */
export function hasRecentEmailProof(supabase: SupabaseClient): Promise<boolean> {
  return hasRecentAuth(supabase, ["recovery", "otp"], RECOVERY_WINDOW_SECONDS);
}

// La prueba de contraseña para acciones sensibles ya no es "password en los últimos 5 minutos"
// (un ingreso normal también la cumple, F2-M5): está atada a un intento emitido por el servidor.
// Ver apps/web/src/app/api/_lib/reauth.ts.
