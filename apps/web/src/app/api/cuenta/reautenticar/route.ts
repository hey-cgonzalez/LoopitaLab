import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { issueReauthIntent, type ReauthAction } from "../../_lib/reauth";
import { isSameSite, jsonError, jsonOk, readBody } from "../../_lib/request";

/**
 * Emite un intento de re-autenticación para una acción sensible (F2-M5). Llamar justo antes
 * de pedir la contraseña en el navegador. POST JSON { action: "delete_account" | "change_password" }.
 * Respuestas: 201 { ok: true } con la cookie httpOnly del intento, 400 invalid_action,
 * 401, 403 cross_site, 413, 429 rate_limited (20 por hora), 500.
 */

const ACTIONS: readonly ReauthAction[] = ["delete_account", "change_password"];

export async function POST(request: NextRequest) {
  if (!isSameSite(request)) return jsonError(403, "cross_site");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthenticated");

  const raw = await readBody(request, 1024, 10_000);
  if (raw === "too_large") return jsonError(413, "too_large");
  if (raw === "timeout") return jsonError(408, "body_timeout");
  let action: unknown;
  try {
    action = raw ? (JSON.parse(new TextDecoder().decode(raw)) as { action?: unknown } | null)?.action : undefined;
  } catch {
    action = undefined;
  }
  if (!ACTIONS.includes(action as ReauthAction)) return jsonError(400, "invalid_action");

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error("reautenticar: falta configuración", e instanceof Error ? e.message : e);
    return jsonError(500, "server_misconfigured");
  }

  const result = await issueReauthIntent(supabase, admin, action as ReauthAction);
  if (result === "unauthenticated") return jsonError(401, "unauthenticated");
  if (result === "rate_limited") return jsonError(429, "rate_limited", { "Retry-After": "600" });
  if (result === "error") return jsonError(500, "reauth_failed");
  return jsonOk({ ok: true }, 201);
}
