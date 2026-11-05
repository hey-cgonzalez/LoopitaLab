"use server";

import { redirect } from "next/navigation";
import { authMessage, passwordProblem, type FormState } from "@/lib/auth-messages";
import { hasRecentEmailProof } from "@/lib/recovery";
import { createClient } from "@/lib/supabase/server";

/**
 * Cambiar la contraseña exige una de dos pruebas:
 *  - haber abierto el enlace de recuperación en los últimos 15 minutos, o
 *  - escribir la contraseña actual.
 * Así, una sesión abierta en un equipo ajeno no basta para tomar la cuenta.
 * Al terminar se cierran las demás sesiones.
 */
export async function updatePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const current = String(form.get("current") ?? "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/ingresar?next=/nueva-clave");

  const fieldErrors: Record<string, string> = {};
  const viaEmail = await hasRecentEmailProof(supabase);
  if (!viaEmail && !current) fieldErrors.current = "Escribe tu contraseña actual.";
  const weak = passwordProblem(password);
  if (weak) fieldErrors.password = weak;
  else if (password !== confirm) fieldErrors.confirm = "Las contraseñas no coinciden.";
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  if (!viaEmail) {
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
    if (error) return { fieldErrors: { current: "La contraseña actual no es correcta." } };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: authMessage(error) };
  await supabase.auth.signOut({ scope: "others" });
  redirect("/proyectos?aviso=clave");
}
