"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field } from "@/components/Field";
import { Captcha } from "@/components/Captcha";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import type { FormState } from "@/lib/auth-messages";
import { signUp } from "../client-actions";

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
        hint="Al menos 8 caracteres, con letras y números."
        error={state.fieldErrors?.password}
      />
      <Captcha />
      <SubmitButton pending="Creando tu cuenta…">Crear cuenta</SubmitButton>
      <p className="text-sm text-tinta-suave">
        Al crear tu cuenta aceptas los{" "}
        <Link href="/terminos" className="font-bold underline underline-offset-4">
          Términos
        </Link>{" "}
        y la{" "}
        <Link href="/privacidad" className="font-bold underline underline-offset-4">
          Política de privacidad
        </Link>
        .
      </p>
      <p className="text-sm">
        ¿Ya tienes cuenta?{" "}
        <Link href="/ingresar" className="font-bold underline underline-offset-4">
          Ingresa aquí
        </Link>
      </p>
    </form>
  );
}
