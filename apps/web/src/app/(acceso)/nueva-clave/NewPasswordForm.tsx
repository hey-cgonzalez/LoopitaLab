"use client";

import { useActionState, useEffect } from "react";
import { Captcha } from "@/components/Captcha";
import { Field } from "@/components/Field";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import { reauthErrorMessage, requestReauthIntent } from "@/lib/account-messages";
import { passwordProblem, type FormState } from "@/lib/auth-messages";
import { CAPTCHA_MISSING, captchaEnabled, captchaOptions, captchaToken, resetCaptcha } from "@/lib/captcha";
import { createClient } from "@/lib/supabase/client";
import { updatePassword } from "../actions";

/**
 * Confirma la contraseña actual en el navegador: Supabase Auth ve la IP real (límites por
 * persona) y el CAPTCHA. Antes pide al servidor un intento de re-autenticación; el
 * signInWithPassword posterior crea la sesión nueva que el servidor exige (F2-M5).
 * Devuelve un estado de error o null si salió bien.
 */
async function confirmCurrentPassword(form: FormData): Promise<FormState | null> {
  const current = String(form.get("current") ?? "");
  if (!current) return { fieldErrors: { current: "Escribe tu contraseña actual." } };
  if (captchaEnabled() && !captchaToken(form)) return { error: CAPTCHA_MISSING };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Tu sesión expiró. Vuelve a ingresar e intenta de nuevo." };

  // El servidor emite el intento ANTES de la contraseña: un ingreso anterior no sirve.
  const intentError = await requestReauthIntent("change_password");
  if (intentError) return { error: intentError };

  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: current, options: captchaOptions(form) });
  resetCaptcha();
  if (!error) return null;
  if (error.code === "invalid_credentials") return { fieldErrors: { current: reauthErrorMessage(error.code) } };
  return { error: reauthErrorMessage(error.code) };
}

export function NewPasswordForm({ needsCurrent }: { needsCurrent: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(async (prev, form) => {
    if (needsCurrent) {
      // Primero lo que se puede revisar sin gastar un intento de ingreso.
      const password = String(form.get("password") ?? "");
      const weak = passwordProblem(password);
      if (weak) return { fieldErrors: { password: weak } };
      if (password !== String(form.get("confirm") ?? "")) return { fieldErrors: { confirm: "Las contraseñas no coinciden." } };
      const failed = await confirmCurrentPassword(form);
      if (failed) return failed;
    }
    form.delete("current"); // la contraseña actual nunca viaja al servidor de Next
    form.delete("cf-turnstile-response");
    return updatePassword(prev, form);
  }, {});
  // El token es de un solo uso: se pide uno nuevo tras cada respuesta del servidor.
  useEffect(() => {
    if (state.error || state.fieldErrors) resetCaptcha();
  }, [state]);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage message={state.error} tone="error" />
      {needsCurrent ? (
        <Field id="current" label="Contraseña actual" type="password" autoComplete="current-password" required error={state.fieldErrors?.current} />
      ) : null}
      <Field id="password" label="Nueva contraseña" type="password" autoComplete="new-password" required minLength={8} hint="Al menos 8 caracteres, con letras y números." error={state.fieldErrors?.password} />
      <Field id="confirm" label="Repite la contraseña" type="password" autoComplete="new-password" required error={state.fieldErrors?.confirm} />
      {needsCurrent ? <Captcha /> : null}
      <SubmitButton pending="Guardando…">Guardar contraseña</SubmitButton>
    </form>
  );
}
