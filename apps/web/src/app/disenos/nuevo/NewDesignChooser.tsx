"use client";

import { useId, useState } from "react";
import { NewDesignWizard } from "./NewDesignWizard";
import { NewWrittenForm } from "./NewWrittenForm";

type Kind = "chart" | "written";

const OPTIONS: { value: Kind; label: string; help: string }[] = [
  { value: "chart", label: "Colorwork (palillo)", help: "Un motivo en una cuadrícula que se repite, con vista previa de puntos." },
  { value: "written", label: "Amigurumi (crochet, escrito)", help: "Un patrón escrito por partes, con vista 3D." },
];

/** Elección del tipo de diseño (T13). Colorwork es el tipo por omisión: el asistente de siempre queda igual. */
export function NewDesignChooser() {
  const uid = useId();
  const [kind, setKind] = useState<Kind>("chart");
  return (
    <div className="grid gap-8">
      <fieldset className="grid gap-2">
        <legend className="font-bold">Tipo de diseño</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((o) => (
            <label key={o.value} htmlFor={`${uid}-${o.value}`} className={`grid cursor-pointer gap-1 rounded-2xl border-2 p-4 ${kind === o.value ? "border-marino bg-superficie" : "border-linea"}`}>
              <span className="flex items-center gap-2 font-display text-lg font-semibold">
                <input id={`${uid}-${o.value}`} type="radio" name="design-kind" value={o.value} checked={kind === o.value} onChange={() => setKind(o.value)} className="size-5 accent-marino" />
                {o.label}
              </span>
              <span className="text-tinta-suave">{o.help}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {kind === "chart" ? <NewDesignWizard /> : <NewWrittenForm />}
    </div>
  );
}
