"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field } from "@/components/Field";
import { Captcha } from "@/components/Captcha";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import type { FormState } from "@/lib/auth-messages";
import { requestPasswordReset } from "../client-actions";

export function ResetForm() {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordReset, {});
  if (state.ok) return <FormMessage message={state.ok} tone="ok" />;
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage message={state.error} tone="error" />
      <Field id="email" label="Correo de tu cuenta" type="email" autoComplete="email" required defaultValue={state.fields?.email} error={state.fieldErrors?.email} />
      <Captcha />
      <SubmitButton pending="Enviando…">Enviar enlace</SubmitButton>
      <Link href="/ingresar" className="text-sm underline underline-offset-4">
        Volver a ingresar
      </Link>
    </form>
  );
}
