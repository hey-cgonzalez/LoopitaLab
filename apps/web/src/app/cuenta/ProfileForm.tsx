"use client";

import { useActionState } from "react";
import { Field } from "@/components/Field";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import { updateProfile, type ProfileFormState } from "./actions";

interface Props {
  displayName: string;
  terminology: string;
  units: string;
  dominantHand: string;
}

function Choice({ name, legend, value, options }: { name: string; legend: string; value: string; options: [string, string][] }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 font-bold">{legend}</legend>
      {options.map(([v, label]) => (
        <label key={v} className="flex items-center gap-3">
          <input type="radio" name={name} value={v} defaultChecked={value === v} className="size-5 accent-marino" />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

export function ProfileForm({ displayName, terminology, units, dominantHand }: Props) {
  const [state, action] = useActionState<ProfileFormState, FormData>(updateProfile, {});
  return (
    <form action={action} className="grid gap-8">
      <FormMessage message={state.error} tone="error" />
      <FormMessage message={state.ok} tone="ok" />
      <Field id="display_name" label="Nombre visible" defaultValue={displayName} maxLength={80} autoComplete="given-name" />
      <Choice
        name="terminology"
        legend="Abreviaturas en los patrones"
        value={terminology}
        options={[
          ["es", "Español (pb, aum, dism)"],
          ["us", "Inglés de EE. UU. (sc, inc, dec)"],
          ["uk", "Inglés británico (dc, inc, dec)"],
        ]}
      />
      <Choice
        name="units"
        legend="Unidades"
        value={units}
        options={[
          ["metric", "Centímetros y milímetros"],
          ["imperial", "Pulgadas"],
        ]}
      />
      <Choice
        name="dominant_hand"
        legend="Con qué mano tejes"
        value={dominantHand}
        options={[
          ["right", "Derecha"],
          ["left", "Izquierda (los gráficos se muestran espejados)"],
        ]}
      />
      <div className="max-w-xs">
        <SubmitButton pending="Guardando…">Guardar preferencias</SubmitButton>
      </div>
    </form>
  );
}
