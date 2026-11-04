/**
 * Ingreso, registro y recuperación corren en el navegador: así Supabase Auth ve la IP real
 * de cada persona y aplica sus límites de intentos por persona (si corrieran en el servidor
 * de Next, todas compartirían la IP del servidor y un solo abuso bloquearía a todas).
 */
import { safeNext } from "@/lib/env";
import { EMAIL_RE, authMessage, passwordProblem, type FormState } from "@/lib/auth-messages";
import { createClient } from "@/lib/supabase/client";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const INVALID_EMAIL = "Escribe un correo válido, por ejemplo nombre@correo.cl.";

/** URL pública para los enlaces de los correos. En el navegador, el origen real de la página. */
function publicOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/+$/, "");
}

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email").toLowerCase();
  const password = String(form.get("password") ?? "");
  const fields = { email };
  const fieldErrors: Record<string, string> = {};
  if (!EMAIL_RE.test(email)) fieldErrors.email = INVALID_EMAIL;
  if (!password) fieldErrors.password = "Escribe tu contraseña.";
  if (Object.keys(fieldErrors).length) return { fields, fieldErrors };

  const { error } = await createClient().auth.signInWithPassword({ email, password });
  if (error) return { fields, error: authMessage(error) };
  // Navegación completa: el servidor lee la cookie de sesión recién creada.
  window.location.assign(safeNext(text(form, "next")));
  return { fields };
}

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name").slice(0, 80);
  const email = text(form, "email").toLowerCase();
  const password = String(form.get("password") ?? "");
  const fields = { name, email };
  const fieldErrors: Record<string, string> = {};
  if (!EMAIL_RE.test(email)) fieldErrors.email = INVALID_EMAIL;
  const weak = passwordProblem(password);
  if (weak) fieldErrors.password = weak;
  if (Object.keys(fieldErrors).length) return { fields, fieldErrors };

  const { data, error } = await createClient().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${publicOrigin()}/auth/callback?next=/proyectos`,
      data: name ? { display_name: name } : {},
    },
  });
  if (error) return { fields, error: authMessage(error) };
  if (data.session) {
    window.location.assign("/proyectos");
    return { fields };
  }
  return { ok: `Listo. Te enviamos un correo a ${email}: abre el enlace para confirmar tu cuenta y entrar.` };
}

export async function requestPasswordReset(_prev: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email").toLowerCase();
  if (!EMAIL_RE.test(email)) return { fields: { email }, fieldErrors: { email: INVALID_EMAIL } };

  const { error } = await createClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${publicOrigin()}/auth/callback?next=/nueva-clave`,
  });
  if (error && (error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit")) {
    return { fields: { email }, error: authMessage(error) };
  }
  // Mismo mensaje exista o no la cuenta, para no revelar qué correos están registrados.
  return { ok: "Si hay una cuenta con ese correo, te llegará un enlace para crear una nueva contraseña." };
}
