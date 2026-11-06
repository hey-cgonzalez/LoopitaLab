"use client";

import { newChartPattern } from "@loopitalab/pattern-core";
import { FIBERS, PALETTE, WEIGHTS, suggestedGauge, weightLabel } from "@loopitalab/yarn-catalog";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Field } from "@/components/Field";
import { FormMessage } from "@/components/FormMessage";
import { TEMPLATES, type NewDesignInput, type Template } from "@/lib/studio/templates.ts";
import { buildWizardInput, DEFAULT_WIZARD, TITLE_MAX, tubeSeamNotice, type WizardForm } from "@/lib/studio/wizard.ts";
import { createChartPattern, savePattern } from "../actions";

const selectClass = "rounded-xl border-2 border-linea bg-superficie px-4 py-3 aria-invalid:border-error";

function Radio<T extends string>({ name, legend, value, options, onChange, error }: { name: string; legend: string; value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; error?: string | undefined }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="font-bold">{legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 py-1">
            <input type="radio" name={name} value={o.value} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} className="size-5 accent-marino" />
            {o.label}
          </label>
        ))}
      </div>
      {error ? <p className="text-sm font-bold text-error">{error}</p> : null}
    </fieldset>
  );
}

export function NewDesignWizard() {
  const router = useRouter();
  const uid = useId();
  const [form, setForm] = useState<WizardForm>(DEFAULT_WIZARD);
  const [errors, setErrors] = useState<Partial<Record<keyof WizardForm, string>>>({});
  const [message, setMessage] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  function setShape(renderAs: WizardForm["renderAs"]) {
    setForm((f) => ({ ...f, renderAs, workedIn: renderAs === "flat" ? "rows" : "rounds" }));
  }

  /** Crea el diseño y, si hay plantilla, guarda encima el dibujo de la plantilla. */
  async function create(input: NewDesignInput, template?: Template) {
    setBusy(true);
    setMessage(undefined);
    try {
      const created = await createChartPattern(input);
      if (!created.ok) {
        setMessage(created.error);
        return;
      }
      if (template) {
        const painted = template.paint(newChartPattern({ id: created.id, ...input }));
        const saved = await savePattern(created.id, painted, created.updatedAt);
        if (!saved.ok) {
          // El diseño existe, en blanco: se abre igual y se avisa en la lista si hace falta.
          router.push(`/disenos/${created.id}`);
          return;
        }
      }
      router.push(`/disenos/${created.id}`);
    } catch {
      setMessage("No pudimos crear el diseño. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const r = buildWizardInput(form);
    if (!r.ok) {
      setErrors(r.errors);
      setMessage("Revisa los campos marcados.");
      return;
    }
    setErrors({});
    void create(r.input);
  }

  function useSuggestedGauge() {
    const g = suggestedGauge(form.weight, "knit");
    if (g) setForm((f) => ({ ...f, gaugeStitches: String(g.stitchesPer10cm), gaugeRows: String(g.rowsPer10cm) }));
  }

  const paletteFamilies = [...new Set(PALETTE.map((c) => c.familia))];

  return (
    <div className="grid gap-10">
      <section aria-labelledby={`${uid}-plantillas`} className="grid gap-4">
        <h2 id={`${uid}-plantillas`} className="font-display text-2xl font-bold">
          Plantillas
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <li key={t.id} className="grid content-between gap-3 rounded-2xl border-2 border-linea bg-superficie p-5">
              <div>
                <h3 className="font-display text-xl font-semibold">{t.name}</h3>
                <p className="mt-1 text-tinta-suave">{t.description}</p>
              </div>
              <button type="button" disabled={busy} onClick={() => void create(t.input, t)} className="justify-self-start rounded-full bg-marino px-5 py-2 font-bold text-white hover:bg-indigo disabled:opacity-60">
                Usar esta plantilla
              </button>
            </li>
          ))}
        </ul>
      </section>

      <form onSubmit={onSubmit} noValidate className="grid gap-6" aria-labelledby={`${uid}-blanco`}>
        <h2 id={`${uid}-blanco`} className="font-display text-2xl font-bold">
          O empieza de cero
        </h2>
        <FormMessage message={message} tone="error" />

        <Field id="title" label="Nombre del diseño" value={form.title} onChange={(e) => set("title", e.target.value)} error={errors.title} maxLength={TITLE_MAX * 2} placeholder="Por ejemplo: gorro de rombos" autoComplete="off" />

        <Radio
          name="renderAs"
          legend="Forma"
          value={form.renderAs}
          onChange={setShape}
          options={[
            { value: "flat", label: "Plano" },
            { value: "tube", label: "Tubo" },
            { value: "circle", label: "Círculo (copa de gorro)" },
          ]}
        />
        <Radio
          name="workedIn"
          legend="Cómo se teje"
          value={form.workedIn}
          onChange={(v) => set("workedIn", v)}
          error={errors.workedIn}
          options={[
            { value: "rounds", label: "En redondo" },
            { value: "rows", label: "Ida y vuelta", disabled: form.renderAs === "circle" },
          ]}
        />
        {tubeSeamNotice(form.renderAs, form.workedIn) ? (
          <p className="text-sm font-bold text-tinta" data-testid="wizard-tube-seam">
            {tubeSeamNotice(form.renderAs, form.workedIn)}
          </p>
        ) : null}
        <Radio
          name="direction"
          legend="Dirección de tejido"
          value={form.direction}
          onChange={(v) => set("direction", v)}
          options={[
            { value: "bottom_up", label: "De abajo hacia arriba" },
            { value: "top_down", label: "De arriba hacia abajo" },
          ]}
        />

        <fieldset className="grid gap-4">
          <legend className="font-bold">Tamaño del motivo y repeticiones</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="width" label="Puntos del motivo" inputMode="numeric" value={form.width} onChange={(e) => set("width", e.target.value)} error={errors.width} />
            <Field id="height" label="Filas del motivo" inputMode="numeric" value={form.height} onChange={(e) => set("height", e.target.value)} error={errors.height} />
            <Field id="repeatX" label="Repeticiones a lo ancho" inputMode="numeric" value={form.repeatX} onChange={(e) => set("repeatX", e.target.value)} error={errors.repeatX} />
            <Field id="repeatY" label="Repeticiones a lo alto" inputMode="numeric" value={form.repeatY} onChange={(e) => set("repeatY", e.target.value)} error={errors.repeatY} />
          </div>
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="font-bold">Lana de fondo</legend>
          <p className="text-sm text-tinta-suave">Es la primera lana; después agregas las demás en el estudio. La composición queda en una sola fibra al 100 %, que puedes cambiar allí.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <label htmlFor="colorId" className="font-bold">
                Color
              </label>
              <select id="colorId" value={form.colorId} onChange={(e) => set("colorId", e.target.value)} aria-invalid={errors.colorId ? true : undefined} className={selectClass}>
                {paletteFamilies.map((fam) => (
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
              <label htmlFor="weight" className="font-bold">
                Grosor
              </label>
              <select id="weight" value={form.weight} onChange={(e) => set("weight", Number(e.target.value))} className={selectClass}>
                {WEIGHTS.map((w) => (
                  <option key={w.cat} value={w.cat}>
                    {w.cat} · {weightLabel(w.cat)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="fiber" className="font-bold">
                Fibra
              </label>
              <select id="fiber" value={form.fiber} onChange={(e) => set("fiber", e.target.value)} className={selectClass}>
                {FIBERS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="font-bold">Muestra (opcional)</legend>
          <p className="text-sm text-tinta-suave">
            Puntos y filas en 10 cm. Si la dejas vacía, las medidas del estudio serán un supuesto hasta que tejas una muestra.
          </p>
          <div className="grid items-end gap-4 sm:grid-cols-3">
            <Field id="gaugeStitches" label="Puntos en 10 cm" inputMode="numeric" value={form.gaugeStitches} onChange={(e) => set("gaugeStitches", e.target.value)} error={errors.gaugeStitches} />
            <Field id="gaugeRows" label="Filas en 10 cm" inputMode="numeric" value={form.gaugeRows} onChange={(e) => set("gaugeRows", e.target.value)} />
            <button type="button" onClick={useSuggestedGauge} className="rounded-full border-2 border-marino px-4 py-3 font-bold hover:bg-marino hover:text-white">
              Usar la sugerida por el grosor
            </button>
          </div>
        </fieldset>

        <button type="submit" disabled={busy} className="justify-self-start rounded-full bg-marino px-8 py-3 font-display text-lg font-semibold text-white hover:bg-indigo disabled:opacity-60">
          {busy ? "Creando…" : "Crear diseño"}
        </button>
      </form>
    </div>
  );
}
