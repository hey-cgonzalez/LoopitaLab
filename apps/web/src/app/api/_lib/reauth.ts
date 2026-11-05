import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasPassword } from "@/lib/password-status";
import { readSessionProof, type SessionProof } from "@/lib/recovery";

/**
 * Re-autenticación atada a la acción (F2-M5).
 *
 * 1. Antes de pedir la contraseña, el navegador llama a POST /api/cuenta/reautenticar con la
 *    acción. El servidor registra un intento (public.begin_reauth: usuaria, session_id actual,
 *    hora) y guarda el nonce en una cookie httpOnly, SameSite=Strict, de 5 minutos.
 * 2. La usuaria vuelve a autenticarse en el navegador, de una de dos formas:
 *    - signInWithPassword (IP real y CAPTCHA en Supabase Auth), o
 *    - signInWithOAuth con Google o Microsoft, solo para eliminar una cuenta SIN contraseña, con
 *      redirectTo a /auth/callback?next=<ruta>; el callback canjea el código PKCE.
 *    Ambas crean una sesión NUEVA, con otro session_id y una marca "password" u "oauth" en el amr.
 * 3. Al ejecutar la acción, el servidor elige qué marca vale (política de abajo) y consume el
 *    intento (public.consume_reauth), que exige misma usuaria y acción, menos de 5 minutos,
 *    autenticación posterior al intento y session_id distinto del que lo pidió. Se consume en el
 *    primer uso, salga bien o mal.
 *
 * Política por acción (revisión de seguridad de OAuth, A1 y M1):
 *  - change_password: solo "password". Un ingreso con proveedor nunca sirve para crear ni cambiar
 *    la contraseña: en un equipo compartido, Google (prompt=select_account) no pide clave y
 *    permitiría tomar la cuenta. Las cuentas sin contraseña crean la primera por el enlace del
 *    correo (hasRecentEmailProof en updatePassword).
 *  - delete_account: si la cuenta tiene contraseña (public.user_has_password, lib/password-status.ts),
 *    solo "password" y con la hora de ESE ingreso, aunque haya un "oauth" más reciente. Si no la
 *    tiene, vale "password" u "oauth". Si no se puede saber, falla cerrado.
 *
 * Un ingreso normal reciente no basta (no hay intento previo) y una cookie robada tampoco
 * (hace falta volver a autenticarse después del intento). Los métodos por correo ("recovery",
 * "otp", "magiclink") no cuentan aquí (ver SessionProof en lib/recovery.ts).
 *
 * El comentario SQL de public.consume_reauth (migración 20261105133225, ya aplicada) habla de
 * "autenticación fuerte" sin distinguir métodos: la función solo compara horas y sesiones, y la
 * elección del método por acción vive aquí, no en la base.
 *
 * Límite conocido de "oauth": la marca es la hora del ingreso en Supabase, no prueba que la
 * usuaria haya escrito su contraseña en Google o Microsoft si ya tenía sesión abierta allí
 * (docs/seguridad.md, "Acceso con proveedores"). Por eso solo vale para eliminar cuentas sin
 * contraseña, que no tienen otra forma de re-autenticarse.
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
  if (!proof || !proof.sessionId) return false;
  const authAt = await acceptedAuthAt(admin, proof, action);
  if (authAt === null) return false;

  const { data, error } = await admin.rpc("consume_reauth", {
    p_owner: proof.userId,
    p_nonce: nonce,
    p_action: action,
    p_session: proof.sessionId,
    p_auth_time: new Date(authAt * 1000).toISOString(),
  });
  if (error) {
    console.error("reautenticar: no se pudo consumir el intento", error.message);
    return false;
  }
  return data === true;
}

/**
 * Hora (segundos Unix) de la re-autenticación que vale para esta acción, o null si ninguna vale.
 * Ver la política al inicio del archivo.
 */
async function acceptedAuthAt(admin: SupabaseClient, proof: SessionProof, action: ReauthAction): Promise<number | null> {
  if (action === "change_password") return proof.passwordAuthAt;
  if (proof.passwordAuthAt === null && proof.oauthAuthAt === null) return null;
  const withPassword = await hasPassword(admin, proof.userId);
  if (withPassword === null) return null; // falla cerrado
  if (withPassword) return proof.passwordAuthAt;
  if (proof.passwordAuthAt === null) return proof.oauthAuthAt;
  if (proof.oauthAuthAt === null) return proof.passwordAuthAt;
  return Math.max(proof.passwordAuthAt, proof.oauthAuthAt);
}
