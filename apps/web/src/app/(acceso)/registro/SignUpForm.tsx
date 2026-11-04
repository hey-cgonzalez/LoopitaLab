"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field } from "@/components/Field";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import { signUp, type FormState } from "../actions";

export function SignUpForm() {
  const [state, action] = useActionState<FormState, FormData>(signUp, {});
  if (state.ok) return <FormMessage message={state.ok} tone="ok" />;
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage message={state.error} tone="error" />
      <Field id="name" label="Cómo quieres que te llamemos" autoComplete="given-name" maxLength={80} defaultValue={state.fields?.name} hint="Opcional." />
      <Field id="email" label="Correo" type="email" autoComplete="email" required defaultValue={state.fields?.email} error={state.fieldErrors?.email} />
      <Field
        id="password"
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Al menos 8 caracteres."
        error={state.fieldErrors?.password}
      />
      <SubmitButton pending="Creando tu cuenta…">Crear cuenta</SubmitButton>
      <p className="text-sm">
        ¿Ya tienes cuenta?{" "}
        <Link href="/ingresar" className="font-bold underline underline-offset-4">
          Ingresa aquí
        </Link>
      </p>
    </form>
  );
}
