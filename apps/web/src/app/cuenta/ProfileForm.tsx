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
  mirrorKnitting: boolean;
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

export function ProfileForm({ displayName, terminology, units, dominantHand, mirrorKnitting }: Props) {
  const [state, action] = useActionState<ProfileFormState, FormData>(updateProfile, {});
  return (
    <form action={action} className="grid gap-6">
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
      <div className="grid gap-1">
        <label className="flex items-center gap-3 font-bold">
          <input type="checkbox" name="mirror_knitting" defaultChecked={mirrorKnitting} aria-describedby="mirror-help" className="size-5 accent-marino" />
          Tejer en espejo
        </label>
        <p id="mirror-help" className="pl-8 text-tinta-suave">
          Muestra los gráficos invertidos de izquierda a derecha. No cambia tu patrón y es independiente de ser zurda.
        </p>
      </div>
      <div className="max-w-xs">
        <SubmitButton pending="Guardando…">Guardar preferencias</SubmitButton>
      </div>
    </form>
  );
}
