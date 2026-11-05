import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ¿La cuenta tiene contraseña? Consulta public.user_has_password (migración
 * 20261105180000_estado_contrasena.sql), que solo puede ejecutar la clave secreta y solo devuelve
 * un booleano (nunca el hash). No depende de la lista de identidades (B5): una cuenta creada con
 * Google que después definió contraseña, o una con contraseña y Google vinculado, se ve igual.
 *
 * `admin` debe ser el cliente de lib/supabase/admin.ts (createAdminClient()).
 * Devuelve null si la consulta falla: quien la use debe fallar cerrado (por ejemplo,
 * consumeReauthIntent no acepta la re-autenticación).
 */
export async function hasPassword(admin: SupabaseClient, userId: string): Promise<boolean | null> {
  try {
    const { data, error } = await admin.rpc("user_has_password", { p_user: userId });
    if (error) {
      // Sin datos personales: ni el id de la usuaria ni el correo.
      console.error("estado de contraseña: no se pudo consultar", error.code ?? "", error.message);
      return null;
    }
    return typeof data === "boolean" ? data : null;
  } catch (e) {
    console.error("estado de contraseña: no se pudo consultar", e instanceof Error ? e.message : "error desconocido");
    return null;
  }
}
