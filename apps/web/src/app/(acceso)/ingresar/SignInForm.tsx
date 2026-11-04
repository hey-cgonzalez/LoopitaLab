"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field } from "@/components/Field";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import { signIn, type FormState } from "../actions";

export function SignInForm({ next, notice }: { next: string; notice?: string | undefined }) {
  const [state, action] = useActionState<FormState, FormData>(signIn, {});
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage message={state.error ?? notice} tone="error" />
      <input type="hidden" name="next" value={next} />
      <Field id="email" label="Correo" type="email" autoComplete="email" required defaultValue={state.fields?.email} error={state.fieldErrors?.email} />
      <Field id="password" label="Contraseña" type="password" autoComplete="current-password" required error={state.fieldErrors?.password} />
      <SubmitButton pending="Ingresando…">Ingresar</SubmitButton>
      <div className="flex flex-wrap justify-between gap-3 text-sm">
        <Link href="/recuperar" className="underline underline-offset-4">
          Olvidé mi contraseña
        </Link>
        <Link href="/registro" className="font-bold underline underline-offset-4">
          Crear una cuenta
        </Link>
      </div>
    </form>
  );
}
