import { safeNext } from "@/lib/env";

/**
 * Contrato de /auth/callback (lo usan los correos de Supabase y el ingreso con Google/Microsoft).
 *
 * Entrada (query):
 *  - `code`: código PKCE. Se canjea por una sesión.
 *  - `next`: ruta interna de destino; pasa por safeNext (si no es segura, /proyectos).
 *  - `error`, `error_code`, `error_description`: los agrega Supabase Auth cuando el proveedor
 *    falla, la usuaria cancela (p. ej. error=access_denied) o el enlace del correo venció
 *    (error_code=otp_expired). `error_description` NUNCA se refleja en la URL ni en los logs;
 *    de `error_code`/`error` solo se registra un identificador saneado.
 *
 * Salida (redirección, siempre en este mismo sitio):
 *  - Éxito: `next` tal cual (con su query; p. ej. /cuenta?reauth=delete_account).
 *  - Fallo y `next` es la vuelta de una re-autenticación con proveedor (solo /cuenta con
 *    `reauth=delete_account`): `next` + `reauth_error=1`
 *    (p. ej. /cuenta?reauth=delete_account&reauth_error=1). La pantalla avisa y no ejecuta
 *    la acción; el intento del servidor sigue sin consumir hasta que venza.
 *  - Fallo con `error_code=otp_expired` (enlace de correo vencido): /ingresar?error=enlace.
 *  - Otro `error` (proveedor cancelado o con error): /ingresar?error=oauth&next=<next>.
 *  - Sin `error` pero sin código o con canje fallido: /ingresar?error=enlace (comportamiento
 *    anterior, enlaces de correo).
 */

export const REAUTH_ACTIONS = ["delete_account", "change_password"] as const;
/**
 * Rutas que vuelven de una re-autenticación con proveedor, y la única acción que admiten.
 * change_password NO está a propósito: crear o cambiar la contraseña nunca se confirma con
 * Google o Microsoft (hallazgo M1); se hace con la contraseña actual o con el enlace por correo.
 */
const REAUTH_PATHS = new Map<string, (typeof REAUTH_ACTIONS)[number]>([["/cuenta", "delete_account"]]);
const BASE = "http://callback.invalid";

/** ¿`next` (ya pasado por safeNext) es la vuelta de una re-autenticación? */
export function isReauthNext(next: string): boolean {
  const url = new URL(next, BASE);
  const action = url.searchParams.get("reauth");
  return url.origin === BASE && action !== null && REAUTH_PATHS.get(url.pathname) === action;
}

/** Identificador de error apto para un log: solo [a-z0-9_], hasta 64 caracteres. */
export function sanitizeErrorCode(raw: string | null): string {
  return raw && /^[a-z0-9_]{1,64}$/i.test(raw) ? raw.toLowerCase() : "desconocido";
}

export type CallbackOutcome = { kind: "ok" } | { kind: "provider_error"; code: string } | { kind: "exchange_failed" };

/** Ruta interna a la que se redirige según el resultado. */
export function callbackDestination(rawNext: string | null, outcome: CallbackOutcome): string {
  const next = safeNext(rawNext);
  if (outcome.kind === "ok") return next;
  if (isReauthNext(next)) {
    const url = new URL(next, BASE);
    url.searchParams.set("reauth_error", "1");
    return `${url.pathname}${url.search}`;
  }
  if (outcome.kind === "provider_error" && outcome.code !== "otp_expired") {
    return `/ingresar?error=oauth&next=${encodeURIComponent(next)}`;
  }
  return "/ingresar?error=enlace";
}

/** ¿La pantalla puede ofrecer la acción sensible? Solo si volvió de re-autenticar sin error. */
export function isReauthDone(action: (typeof REAUTH_ACTIONS)[number], reauth?: string, reauthError?: string): boolean {
  return reauth === action && reauthError !== "1";
}
