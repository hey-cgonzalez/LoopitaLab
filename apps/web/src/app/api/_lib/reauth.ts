import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSessionProof } from "@/lib/recovery";

/**
 * Re-autenticación atada a la acción (F2-M5).
 *
 * 1. Antes de pedir la contraseña, el navegador llama a POST /api/cuenta/reautenticar con la
 *    acción. El servidor registra un intento (public.begin_reauth: usuaria, session_id actual,
 *    hora) y guarda el nonce en una cookie httpOnly, SameSite=Strict, de 5 minutos.
 * 2. El navegador llama a signInWithPassword (IP real y CAPTCHA en Supabase Auth): eso crea
 *    una sesión NUEVA, con otro session_id y una marca "password" en el amr.
 * 3. Al ejecutar la acción, el servidor consume el intento (public.consume_reauth), que exige
 *    misma usuaria y acción, menos de 5 minutos, password posterior al intento y session_id
 *    distinto del que lo pidió. Se consume en el primer uso, salga bien o mal.
 *
 * Un ingreso normal reciente no basta (no hay intento previo) y una cookie robada tampoco
 * (hace falta la contraseña después del intento).
 */

export type ReauthAction = "delete_account" | "change_password";

export const REAUTH_MAX_AGE_SECONDS = 5 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const reauthCookieName = (action: ReauthAction) => `lla-reauth-${action}`;

export type IssueResult = "ok" | "unauthenticated" | "rate_limited" | "error";

/** Paso 1: emite el intento y deja el nonce en la cookie. */
export async function issueReauthIntent(supabase: SupabaseClient, admin: SupabaseClient, action: ReauthAction): Promise<IssueResult> {
  const proof = await readSessionProof(supabase);
  if (!proof) return "unauthenticated";
  // Sin session_id no se puede exigir después "otra sesión": falla cerrado (F2-B17).
  if (!proof.sessionId) {
    console.error("reautenticar: el token no trae session_id");
    return "error";
  }
  const { data, error } = await admin.rpc("begin_reauth", {
    p_owner: proof.userId,
    p_session: proof.sessionId,
    p_action: action,
  });
  if (error) {
    if (error.code === "54000") return "rate_limited";
    console.error("reautenticar: no se pudo emitir el intento", error.message);
    return "error";
  }
  if (typeof data !== "string" || !UUID_RE.test(data)) return "error";
  const store = await cookies();
  store.set(reauthCookieName(action), data, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REAUTH_MAX_AGE_SECONDS,
  });
  return "ok";
}

/** Paso 3: consume el intento. true solo si la re-autenticación vale para esta acción. */
export async function consumeReauthIntent(supabase: SupabaseClient, admin: SupabaseClient, action: ReauthAction): Promise<boolean> {
  const store = await cookies();
  const name = reauthCookieName(action);
  const nonce = store.get(name)?.value ?? "";
  // La cookie se borra siempre: el intento es de un solo uso.
  if (nonce) store.delete(name);
  if (!UUID_RE.test(nonce)) return false;

  const proof = await readSessionProof(supabase);
  if (!proof || proof.passwordAuthAt === null || !proof.sessionId) return false;

  const { data, error } = await admin.rpc("consume_reauth", {
    p_owner: proof.userId,
    p_nonce: nonce,
    p_action: action,
    p_session: proof.sessionId,
    p_auth_time: new Date(proof.passwordAuthAt * 1000).toISOString(),
  });
  if (error) {
    console.error("reautenticar: no se pudo consumir el intento", error.message);
    return false;
  }
  return data === true;
}
