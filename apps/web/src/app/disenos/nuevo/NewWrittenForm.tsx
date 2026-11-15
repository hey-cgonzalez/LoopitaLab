"use client";

import { FIBERS, PALETTE, WEIGHTS, weightLabel } from "@loopitalab/yarn-catalog";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field } from "@/components/Field";
import { FormMessage } from "@/components/FormMessage";
import { normalizeTitle } from "@/lib/studio/fields.ts";
import { TITLE_MAX } from "@/lib/studio/wizard.ts";
import { createWrittenPattern } from "../actions";

const selectClass = "rounded-xl border-2 border-linea bg-superficie px-4 py-3 aria-invalid:border-error";

/** Nuevo amigurumi: nombre y lana inicial. La parte inicial (V1 de 6 pb en anillo mágico) la pone `newWrittenPattern`. */
export function NewWrittenForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [colorId, setColorId] = useState(PALETTE[0]?.id ?? "");
  const [weight, setWeight] = useState(4);
  const [fiber, setFiber] = useState("algodon");
  const [titleError, setTitleError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const families = [...new Set(PALETTE.map((c) => c.familia))];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = normalizeTitle(title);
    if (clean === "" || [...clean].length > TITLE_MAX) {
      setTitleError(`Escribe un nombre de 1 a ${TITLE_MAX} caracteres.`);
      setMessage("Revisa los campos marcados.");
      return;
    }
    const color = PALETTE.find((c) => c.id === colorId);
    if (!color) {
      setMessage("Elige un color.");
      return;
    }
    setTitleError(undefined);
    setBusy(true);
    setMessage(undefined);
    try {
      const created = await createWrittenPattern({
        title: clean,
        yarns: [{ id: "A", weight: weight as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7, composition: [{ fiber, percent: 100 }], color: { hex: color.hex, paletteId: color.id } }],
      });
      if (!created.ok) {
        setMessage(created.error);
        return;
      }
      router.push(`/disenos/${created.id}`);
    } catch {
      setMessage("No pudimos crear el diseño. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-2xl gap-5" aria-label="Nuevo amigurumi" data-testid="new-written-form">
      <FormMessage message={message} tone="error" />
      <Field id="written-title" label="Nombre del diseño" value={title} onChange={(e) => setTitle(e.target.value)} error={titleError} maxLength={TITLE_MAX * 2} placeholder="Por ejemplo: osito" autoComplete="off" />
      <fieldset className="grid gap-4">
        <legend className="font-bold">Lana inicial</legend>
        <p className="text-sm text-tinta-suave">Es la primera lana; después agregas las demás en el estudio. La composición queda en una sola fibra al 100 %.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <label htmlFor="written-color" className="font-bold">
              Color
            </label>
            <select id="written-color" value={colorId} onChange={(e) => setColorId(e.target.value)} className={selectClass}>
              {families.map((fam) => (
                <optgroup key={fam} label={fam}>
                  {PALETTE.filter((c) => c.familia === fam).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="written-weight" className="font-bold">
              Grosor
            </label>
            <select id="written-weight" value={weight} onChange={(e) => setWeight(Number(e.target.value))} className={selectClass}>
              {WEIGHTS.map((w) => (
                <option key={w.cat} value={w.cat}>
                  {w.cat} · {weightLabel(w.cat)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="written-fiber" className="font-bold">
              Fibra
            </label>
            <select id="written-fiber" value={fiber} onChange={(e) => setFiber(e.target.value)} className={selectClass}>
              {FIBERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>
      <button type="submit" disabled={busy} className="justify-self-start rounded-full bg-marino px-8 py-3 font-display text-lg font-semibold text-white hover:bg-indigo disabled:opacity-60">
        {busy ? "Creando…" : "Crear amigurumi"}
      </button>
    </form>
  );
}
