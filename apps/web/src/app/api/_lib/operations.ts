import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError } from "./request";

export type Operation = "upload" | "export";

/** Candado tomado: el token identifica a este proceso (F2-B11). */
export interface OperationLock {
  userId: string;
  operation: Operation;
  token: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Toma el candado de la operación y cobra el intento en la base (public.begin_operation, solo
 * con la clave secreta). Devuelve el candado, o la respuesta de error:
 *   409 operation_in_progress: ya hay una en curso para esta usuaria.
 *   429 daily_limit: se llegó al tope de 24 h.
 */
export async function beginOperation(admin: SupabaseClient, userId: string, operation: Operation): Promise<OperationLock | Response> {
  const { data, error } = await admin.rpc("begin_operation", { p_owner: userId, p_operation: operation });
  if (!error && typeof data === "string" && UUID_RE.test(data)) return { userId, operation, token: data };
  if (error?.code === "55P03") return jsonError(409, "operation_in_progress", { "Retry-After": "30" });
  if (error?.code === "54000") return jsonError(429, "daily_limit", { "Retry-After": "3600" });
  console.error(`${operation}: no se pudo iniciar la operación`, error?.message ?? "sin token");
  return jsonError(500, "quota_check_failed");
}

/** Latido: renueva el candado. false si ya no es de este proceso (venció y otro lo tomó). */
export async function renewOperation(admin: SupabaseClient, lock: OperationLock): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("renew_operation", {
      p_owner: lock.userId,
      p_operation: lock.operation,
      p_token: lock.token,
    });
    if (error) console.error(`${lock.operation}: no se pudo renovar el candado`, error.message);
    return !error && data === true;
  } catch (e) {
    console.error(`${lock.operation}: no se pudo renovar el candado`, e instanceof Error ? e.message : e);
    return false;
  }
}

/** Suelta el candado, solo si sigue siendo de este proceso. Si falla, vence solo. */
export async function endOperation(admin: SupabaseClient, lock: OperationLock): Promise<void> {
  try {
    const { error } = await admin.rpc("end_operation", { p_owner: lock.userId, p_operation: lock.operation, p_token: lock.token });
    if (error) console.error(`${lock.operation}: no se pudo soltar el candado`, error.message);
  } catch (e) {
    console.error(`${lock.operation}: no se pudo soltar el candado`, e instanceof Error ? e.message : e);
  }
}
