"use client";

import { useActionState } from "react";
import { Field } from "@/components/Field";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import type { FormState } from "@/lib/auth-messages";
import { updatePassword } from "../actions";

export function NewPasswordForm({ needsCurrent }: { needsCurrent: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(updatePassword, {});
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage message={state.error} tone="error" />
      {needsCurrent ? (
        <Field id="current" label="Contraseña actual" type="password" autoComplete="current-password" required error={state.fieldErrors?.current} />
      ) : null}
      <Field id="password" label="Nueva contraseña" type="password" autoComplete="new-password" required minLength={8} hint="Al menos 8 caracteres, con letras y números." error={state.fieldErrors?.password} />
      <Field id="confirm" label="Repite la contraseña" type="password" autoComplete="new-password" required error={state.fieldErrors?.confirm} />
      <SubmitButton pending="Guardando…">Guardar contraseña</SubmitButton>
    </form>
  );
}
