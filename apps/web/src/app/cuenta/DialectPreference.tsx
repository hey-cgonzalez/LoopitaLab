"use client";

import { useId, useState, useTransition } from "react";
import { FormMessage } from "@/components/FormMessage";
import { PATTERN_DIALECTS, type PatternDialect } from "@/lib/profile/dialect";
import { updatePatternDialect } from "./actions";

/*
 * Abreviaturas de los patrones escritos de amigurumi (`profiles.pattern_dialect`; ADR 0011, sección 8; T17 de la fase 4).
 * Es un formulario aparte del de las demás preferencias: guarda con `updatePatternDialect`, que valida en el servidor.
 * Los radios son controlados (React 19 devuelve los no controlados a su valor inicial después de enviar un formulario).
 * Terminología pendiente de validación con tejedoras (regla de oro 5).
 */

const OPTIONS: Record<PatternDialect, { label: string; help: string }> = {
  es: { label: "Español (pb, aum, dism)", help: "Punto bajo se escribe «pb»; aumento, «aum»; disminución, «dism»." },
  us: { label: "Inglés de EE. UU. (sc, inc, dec)", help: "Punto bajo se escribe «sc» y punto alto, «dc»." },
  uk: { label: "Inglés británico (dc, inc, dec)", help: "Punto bajo se escribe «dc» y punto alto, «tr»." },
};

export function DialectPreference({ initial, loadError }: { initial: PatternDialect; loadError?: string | undefined }) {
  const uid = useId();
  const [value, setValue] = useState<PatternDialect>(initial);
  const [saved, setSaved] = useState<PatternDialect>(initial);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(loadError ? { tone: "error", text: loadError } : null);
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await updatePatternDialect(value);
      if (r.error) setMessage({ tone: "error", text: r.error });
      else {
        setSaved(value);
        setMessage({ tone: "ok", text: "Abreviaturas guardadas. Se usan al abrir tus patrones de amigurumi." });
      }
    });
  }

  return (
    <form onSubmit={save} className="grid gap-3" data-testid="dialect-form">
      <FormMessage message={message?.text} tone={message?.tone ?? "ok"} />
      <fieldset className="grid gap-2" aria-describedby={`${uid}-help`}>
        <legend className="mb-1 font-bold">Abreviaturas de los patrones de amigurumi</legend>
        {PATTERN_DIALECTS.map((d) => (
          <label key={d} className="flex items-start gap-3">
            <input type="radio" name="pattern_dialect" value={d} checked={value === d} onChange={() => setValue(d)} className="mt-0.5 size-5 shrink-0 accent-marino" />
            <span>
              {OPTIONS[d].label}
              <span className="block text-sm text-tinta-suave">{OPTIONS[d].help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p id={`${uid}-help`} className="text-tinta-suave" data-testid="dialect-help">
        Ojo: en el inglés británico «dc» es el punto bajo, y en el de EE. UU. «dc» es el punto alto. Elige el que usa tu patrón. Se leen también las abreviaturas en español. Terminología pendiente de validación.
      </p>
      <div className="max-w-xs">
        <button
          type="submit"
          disabled={pending || value === saved}
          className="w-full rounded-full bg-marino px-6 py-3 font-display text-lg font-semibold text-white transition-colors hover:bg-indigo disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? "Guardando…" : "Guardar abreviaturas"}
        </button>
      </div>
    </form>
  );
}
