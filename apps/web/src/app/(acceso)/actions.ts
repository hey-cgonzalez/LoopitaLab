"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext, siteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  ok?: string;
  fields?: Record<string, string>;
  fieldErrors?: Record<string, string>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** Traduce los errores de Supabase Auth a mensajes que digan qué hacer. */
function authMessage(error: { code?: string | undefined; message: string; status?: number | undefined }): string {
  switch (error.code) {
    case "invalid_credentials":
      return "El correo o la contraseña no coinciden. Revisa ambos e intenta de nuevo.";
    case "email_not_confirmed":
      return "Falta confirmar tu correo. Abre el enlace que te enviamos y vuelve a ingresar.";
    case "weak_password":
      return `La contraseña es muy débil. Usa al menos ${MIN_PASSWORD} caracteres y mezcla letras y números.`;
    case "same_password":
      return "La nueva contraseña debe ser distinta de la anterior.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Hiciste muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.";
    case "signup_disabled":
      return "El registro está cerrado por ahora.";
    default:
      return "No pudimos completar la solicitud. Intenta de nuevo en unos minutos.";
  }
}

async function originUrl() {
  const h = await headers();
  return siteUrl(h.get("origin"));
}

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email").toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(text(form, "next"));
  const fields = { email };

  const fieldErrors: Record<string, string> = {};
  if (!EMAIL_RE.test(email)) fieldErrors.email = "Escribe un correo válido, por ejemplo nombre@correo.cl.";
  if (!password) fieldErrors.password = "Escribe tu contraseña.";
  if (Object.keys(fieldErrors).length) return { fields, fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { fields, error: authMessage(error) };
  redirect(next);
}

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name").slice(0, 80);
  const email = text(form, "email").toLowerCase();
  const password = String(form.get("password") ?? "");
  const fields = { name, email };

  const fieldErrors: Record<string, string> = {};
  if (!EMAIL_RE.test(email)) fieldErrors.email = "Escribe un correo válido, por ejemplo nombre@correo.cl.";
  if (password.length < MIN_PASSWORD) fieldErrors.password = `Usa al menos ${MIN_PASSWORD} caracteres.`;
  if (Object.keys(fieldErrors).length) return { fields, fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await originUrl()}/auth/callback?next=/proyectos`,
      data: name ? { display_name: name } : {},
    },
  });
  if (error) return { fields, error: authMessage(error) };
  if (data.session) redirect("/proyectos");
  return {
    ok: `Listo. Te enviamos un correo a ${email}: abre el enlace para confirmar tu cuenta y entrar.`,
  };
}

export async function requestPasswordReset(_prev: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email").toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { fields: { email }, fieldErrors: { email: "Escribe un correo válido, por ejemplo nombre@correo.cl." } };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await originUrl()}/auth/callback?next=/nueva-clave`,
  });
  if (error && (error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit")) {
    return { fields: { email }, error: authMessage(error) };
  }
  // Mismo mensaje exista o no la cuenta, para no revelar qué correos están registrados.
  return { ok: "Si hay una cuenta con ese correo, te llegará un enlace para crear una nueva contraseña." };
}

export async function updatePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const fieldErrors: Record<string, string> = {};
  if (password.length < MIN_PASSWORD) fieldErrors.password = `Usa al menos ${MIN_PASSWORD} caracteres.`;
  else if (password !== confirm) fieldErrors.confirm = "Las contraseñas no coinciden.";
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: authMessage(error) };
  redirect("/proyectos?aviso=clave");
}
