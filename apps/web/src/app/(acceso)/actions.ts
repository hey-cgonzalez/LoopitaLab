"use server";

import { redirect } from "next/navigation";
import { authMessage, passwordProblem, type FormState } from "@/lib/auth-messages";
import { consumeReauthIntent } from "@/app/api/_lib/reauth";
import { hasRecentEmailProof } from "@/lib/recovery";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Mensaje si la re-autenticación no llegó, ya venció (5 minutos) o ya se usó. */
const REAUTH_EXPIRED = "Por seguridad, vuelve a escribir tu contraseña actual e intenta de nuevo.";

/**
 * Cambiar la contraseña exige una de dos pruebas:
 *  - haber abierto el enlace de recuperación en los últimos 15 minutos, o
 *  - re-autenticación atada a esta acción (app/api/_lib/reauth.ts): NewPasswordForm pide un
 *    intento a POST /api/cuenta/reautenticar, verifica la contraseña actual en el navegador
 *    (signInWithPassword, con CAPTCHA si está activo, para que Supabase Auth vea la IP real) y
 *    aquí se consume el intento. Un ingreso normal reciente no basta. El servidor nunca llama
 *    a signInWithPassword.
 * Así, una sesión abierta en un equipo ajeno no basta para tomar la cuenta.
 * Al terminar se cierran las demás sesiones.
 */
export async function updatePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/ingresar?next=/nueva-clave");

  const fieldErrors: Record<string, string> = {};
  const weak = passwordProblem(password);
  if (weak) fieldErrors.password = weak;
  else if (password !== confirm) fieldErrors.confirm = "Las contraseñas no coinciden.";
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  if (!(await hasRecentEmailProof(supabase))) {
    let admin: ReturnType<typeof createAdminClient>;
    try {
      admin = createAdminClient();
    } catch {
      return { error: "No pudimos guardar la contraseña. Intenta de nuevo en unos minutos." };
    }
    if (!(await consumeReauthIntent(supabase, admin, "change_password"))) return { fieldErrors: { current: REAUTH_EXPIRED } };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: authMessage(error) };
  await supabase.auth.signOut({ scope: "others" });
  redirect("/proyectos?aviso=clave");
}
