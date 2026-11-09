"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { createProject, type ProjectFormState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-full bg-marino px-5 py-2.5 font-bold text-white hover:bg-indigo disabled:opacity-70">
      {pending ? "Creando…" : "Crear proyecto"}
    </button>
  );
}

export function NewProjectForm() {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(createProject, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!pending && !state.error) formRef.current?.reset();
  }, [pending, state]);
  return (
    <form ref={formRef} action={action} className="grid gap-2">
      <label htmlFor="title" className="font-bold">
        Nuevo proyecto
      </label>
      <div className="flex flex-wrap gap-3">
        <input
          id="title"
          name="title"
          required
          maxLength={120}
          placeholder="Por ejemplo: gorro de invierno para Sofía"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "title-error" : undefined}
          className="min-w-0 flex-1 basis-56 rounded-xl border-2 border-borde bg-superficie px-4 py-2.5 aria-invalid:border-error"
        />
        <Submit />
      </div>
      {state.error ? (
        <p id="title-error" role="alert" className="text-sm font-bold text-error">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
