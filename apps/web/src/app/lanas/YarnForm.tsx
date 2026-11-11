"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FIBERS, weightInfo, weightLabel, WEIGHTS } from "@loopitalab/yarn-catalog";
import { FormMessage } from "@/components/FormMessage";
import { SAVED_NOTE_MAX, type SavedYarn } from "@/lib/yarns/saved";
import {
  canAddFiber,
  draftFromSaved,
  draftProblems,
  draftToInput,
  emptyDraft,
  fiberName,
  nearPaletteMatch,
  noteLength,
  parsePercent,
  weightSearch,
  withHex,
  HEX_RE,
  type DraftField,
  type YarnDraft,
} from "@/lib/yarns/form";
import { compositionSum, paletteByFamily, toolSuggestion } from "@/lib/studio/yarn-edit";
import { saveUserYarn, updateUserYarn } from "./actions";

const FAMILIES = paletteByFamily();
const input = "rounded-xl border-2 border-linea bg-superficie px-4 py-3 text-marino aria-invalid:border-error";
const btn = "rounded-full border-2 border-marino px-4 py-2 font-bold enabled:hover:bg-marino enabled:hover:text-white disabled:opacity-40";
const comma = (n: number) => String(n).replace(".", ",");

/** Formulario de una lana guardada. Las ayudas en vivo son orientativas: lo que rechaza el servidor se muestra tal cual. */
export function YarnForm({ editing, onSaved, onCancel }: { editing: SavedYarn | null; onSaved: (y: SavedYarn) => void; onCancel: () => void }) {
  const uid = useId();
  const [draft, setDraft] = useState<YarnDraft>(() => (editing ? draftFromSaved(editing) : emptyDraft()));
  const [nextKey, setNextKey] = useState(() => (editing ? editing.composition.length + 1 : 2));
  const [query, setQuery] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => headingRef.current?.focus(), []);

  const problems = draftProblems(draft);
  const byField = (f: DraftField) => problems.filter((p) => p.field === f);
  // Los errores de weight/color/composición se muestran al intentar guardar; la suma y la nota, en vivo.
  const shown = (f: DraftField) => {
    const list = byField(f);
    if (tried) return list;
    if (f === "note") return list;
    return f === "composition" && draft.composition.every((c) => parsePercent(c.percent) !== null) ? list : [];
  };

  const near = nearPaletteMatch(draft.hex);
  const search = weightSearch(query);
  const tools = draft.weight !== null ? toolSuggestion(draft.weight) : null;
  const sum = compositionSum(draft.composition.map((f) => ({ fiber: f.fiber, percent: parsePercent(f.percent) ?? 0 })));
  const set = (patch: Partial<YarnDraft>) => setDraft((d) => ({ ...d, ...patch }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setServerError(null);
    const body = draftToInput(draft);
    if (!body) {
      const first = problems[0]?.field;
      const target = first && document.getElementById(first === "note" ? `${uid}-note` : `${uid}-${first}-group`);
      if (target instanceof HTMLElement) target.focus();
      return;
    }
    setBusy(true);
    try {
      const r = editing ? await updateUserYarn(editing.id, body) : await saveUserYarn(body);
      if (r.ok) onSaved(r.yarn);
      else setServerError([r.error, r.reason, ...(r.issues ?? []).map((i) => i.message)].filter(Boolean).join(" "));
    } catch {
      setServerError("No pudimos guardar la lana. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const errs = (f: DraftField) =>
    shown(f).length > 0 ? (
      <ul id={`${uid}-${f}-error`} className="grid gap-1">
        {shown(f).map((p) => (
          <li key={p.message} className="text-sm font-bold text-error">
            {p.message}
          </li>
        ))}
      </ul>
    ) : null;
  const describedBy = (f: DraftField, extra?: string) => [extra, shown(f).length > 0 ? `${uid}-${f}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby={`${uid}-title`} className="grid gap-6 rounded-2xl border-2 border-marino bg-superficie p-4 sm:p-6">
      <h2 id={`${uid}-title`} ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold">
        {editing ? "Editar lana" : "Nueva lana"}
      </h2>

      {/* Grosor */}
      <fieldset id={`${uid}-weight-group`} tabIndex={-1} aria-describedby={describedBy("weight")} className="grid gap-3">
        <legend className="mb-1 font-bold">Grosor</legend>
        <div className="grid gap-1.5">
          <label htmlFor={`${uid}-q`} className="text-sm text-tinta-suave">
            Buscar por nombre (por ejemplo «aran», «fino» o «worsted»)
          </label>
          <input id={`${uid}-q`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" aria-describedby={`${uid}-q-res`} className={input} />
          <div id={`${uid}-q-res`} aria-live="polite" className="grid gap-2 empty:hidden">
            {search.message ? <p className="text-sm text-tinta-suave">{search.message}</p> : null}
            {search.results.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {search.results.map((r) => (
                  <li key={r.cat}>
                    <button type="button" onClick={() => set({ weight: r.cat })} aria-pressed={draft.weight === r.cat} className={`${btn} text-sm aria-pressed:bg-marino aria-pressed:text-white`}>
                      {r.label}
                      {r.approximate ? <span className="ml-2 rounded-full border border-current px-2 text-xs">equivalencia aproximada</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <div role="radiogroup" aria-label="Todos los grosores" className="grid gap-2 sm:grid-cols-2">
          {WEIGHTS.map((w) => (
            <label key={w.cat} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 border-linea px-3 py-2 has-[:checked]:border-marino has-[:checked]:bg-fondo">
              <input type="radio" name={`${uid}-weight`} checked={draft.weight === w.cat} onChange={() => set({ weight: w.cat })} className="size-5 accent-marino" />
              <span>
                <span className="font-bold">{w.cat}</span> · {weightLabel(w.cat)}
              </span>
            </label>
          ))}
        </div>
        {tools && draft.weight !== null ? (
          <p className="text-sm text-tinta-suave" data-testid="weight-tools">
            {weightInfo(draft.weight)?.nombre}: agujas de {tools.needlesMm}, crochet de {tools.crochetMm}; muestra de {tools.stitchRange} en 10 cm. Es una referencia: teje una muestra para comprobarla.
          </p>
        ) : null}
        {errs("weight")}
      </fieldset>

      {/* Composición */}
      <fieldset id={`${uid}-composition-group`} tabIndex={-1} aria-describedby={describedBy("composition", `${uid}-sum`)} className="grid gap-3">
        <legend className="mb-1 font-bold">Composición</legend>
        <ul className="grid gap-3">
          {draft.composition.map((f, k) => {
            const info = FIBERS.find((x) => x.id === f.fiber);
            const pct = parsePercent(f.percent);
            return (
              <li key={f.key} className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`${uid}-fiber-${f.key}`}>
                    Fibra {k + 1}
                  </label>
                  <select
                    id={`${uid}-fiber-${f.key}`}
                    value={f.fiber}
                    onChange={(e) => set({ composition: draft.composition.map((x) => (x.key === f.key ? { ...x, fiber: e.target.value } : x)) })}
                    className={`${input} min-w-0 flex-1`}
                  >
                    {!info ? <option value={f.fiber}>{f.fiber} (no está en la lista)</option> : null}
                    {FIBERS.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nombre}
                      </option>
                    ))}
                  </select>
                  <label className="sr-only" htmlFor={`${uid}-pct-${f.key}`}>
                    Porcentaje de la fibra {k + 1}
                  </label>
                  <input
                    id={`${uid}-pct-${f.key}`}
                    inputMode="decimal"
                    value={f.percent}
                    onChange={(e) => set({ composition: draft.composition.map((x) => (x.key === f.key ? { ...x, percent: e.target.value } : x)) })}
                    aria-invalid={pct === null || pct <= 0 || pct > 100 ? true : undefined}
                    className={`${input} w-24`}
                  />
                  <span aria-hidden="true">%</span>
                  <button
                    type="button"
                    disabled={draft.composition.length === 1}
                    onClick={() => set({ composition: draft.composition.filter((x) => x.key !== f.key) })}
                    aria-label={`Quitar ${fiberName(f.fiber)}`}
                    className={btn}
                  >
                    Quitar
                  </button>
                </div>
                {!info ? <p className="text-sm text-tinta-suave">«{f.fiber}» no está en nuestra lista de fibras: se guarda igual, pero no ajusta el aspecto en la vista previa.</p> : null}
                {info && info.halo === "alto" ? <p className="text-sm text-tinta-suave">{info.nombre}: {info.notas}</p> : null}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canAddFiber(draft)}
            onClick={() => {
              const free = FIBERS.find((x) => !draft.composition.some((c) => c.fiber === x.id));
              if (!free) return;
              set({ composition: [...draft.composition, { key: nextKey, fiber: free.id, percent: sum < 100 ? comma(Math.round((100 - sum) * 100) / 100) : "" }] });
              setNextKey(nextKey + 1);
            }}
            className={btn}
          >
            Agregar fibra
          </button>
          <p id={`${uid}-sum`} role="status" className={sum === 100 ? "font-bold text-exito" : "font-bold text-tinta-suave"} data-testid="composition-sum">
            Suma: {comma(sum)} % {sum === 100 ? "(completa)" : "(debe ser 100 %)"}
          </p>
        </div>
        {errs("composition")}
      </fieldset>

      {/* Color */}
      <fieldset id={`${uid}-color-group`} tabIndex={-1} aria-describedby={describedBy("color")} className="grid gap-3">
        <legend className="mb-1 font-bold">Color</legend>
        <div className="grid gap-3">
          {FAMILIES.map((fam) => (
            <div key={fam.family} role="group" aria-label={fam.family} className="grid gap-1">
              <p className="text-sm text-tinta-suave">{fam.family}</p>
              <div className="flex flex-wrap gap-2">
                {fam.colors.map((c) => {
                  const on = draft.paletteId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      aria-label={c.nombre}
                      title={c.nombre}
                      onClick={() => setDraft((d) => withHex(d, c.hex))}
                      style={{ backgroundColor: c.hex }}
                      className={`size-11 rounded-full border-2 ${on ? "border-marino outline-3 outline-offset-2 outline-marino" : "border-borde"}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <label htmlFor={`${uid}-hex`} className="font-bold">
              Color personalizado (#RRGGBB)
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`${uid}-hex`}
                value={draft.hex}
                onChange={(e) => setDraft((d) => withHex(d, e.target.value.trim()))}
                spellCheck={false}
                autoComplete="off"
                placeholder="#A63D40"
                aria-invalid={draft.hex !== "" && !HEX_RE.test(draft.hex) ? true : undefined}
                aria-describedby={`${uid}-color-info`}
                className={`${input} w-36 font-mono`}
              />
              <label className="sr-only" htmlFor={`${uid}-picker`}>
                Elegir color con el selector
              </label>
              <input id={`${uid}-picker`} type="color" value={HEX_RE.test(draft.hex) ? draft.hex.toLowerCase() : "#808080"} onChange={(e) => setDraft((d) => withHex(d, e.target.value))} className="size-12 cursor-pointer rounded-xl border-2 border-linea bg-superficie p-1" />
            </div>
          </div>
          <span aria-hidden="true" data-testid="color-sample" style={{ backgroundColor: HEX_RE.test(draft.hex) ? draft.hex : "transparent" }} className="size-12 rounded-xl border-2 border-borde" />
        </div>
        <div id={`${uid}-color-info`} aria-live="polite" className="grid gap-1 empty:hidden">
          {draft.paletteId ? <p className="text-sm text-tinta-suave">Color de la paleta: {FAMILIES.flatMap((f) => f.colors).find((c) => c.id === draft.paletteId)?.nombre}.</p> : null}
          {near ? (
            <p className="text-sm text-tinta-suave" data-testid="near-color">
              Prácticamente igual a «{near.color.nombre}» de la paleta.{" "}
              <button type="button" onClick={() => setDraft((d) => withHex(d, near.color.hex))} className="font-bold underline underline-offset-4">
                Usar el de la paleta
              </button>
            </p>
          ) : null}
        </div>
        {errs("color")}
      </fieldset>

      {/* Nota */}
      <div className="grid gap-1.5">
        <label htmlFor={`${uid}-note`} className="font-bold">
          Nota privada (opcional)
        </label>
        <textarea
          id={`${uid}-note`}
          value={draft.note}
          onChange={(e) => set({ note: e.target.value })}
          rows={3}
          aria-invalid={byField("note").length > 0 ? true : undefined}
          aria-describedby={describedBy("note", `${uid}-note-help`)}
          className={input}
        />
        <p id={`${uid}-note-help`} className="text-sm text-tinta-suave">
          Escribe lo que quieras recordar: dónde la compraste, la marca o el lote. Es solo para ti: no se comparte y no se copia a un diseño salvo que lo marques al usar la lana. {noteLength(draft.note)} de {SAVED_NOTE_MAX} caracteres.
        </p>
        {errs("note")}
      </div>

      <FormMessage message={serverError ?? undefined} tone="error" />

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} aria-disabled={busy} className="rounded-full bg-marino px-6 py-3 font-display text-lg font-semibold text-white hover:bg-indigo disabled:cursor-wait disabled:opacity-70">
          {busy ? "Guardando…" : editing ? "Guardar cambios" : "Guardar lana"}
        </button>
        <button type="button" onClick={onCancel} className={`${btn} py-3`}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
