"use client";

import { EDIT_LIMITS, LIMITS, yarnLetter, type Yarn } from "@loopitalab/pattern-core";
import { FIBERS, PALETTE, WEIGHTS, weightLabel } from "@loopitalab/yarn-catalog";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { DocumentStore } from "@/lib/studio/store.ts";
import { compositionSum, newYarnFor, normalizeNote, paletteByFamily, toolSuggestion, unusedFibers, withColor, withNote, yarnProblems } from "@/lib/studio/yarn-edit.ts";
import { STUDIO_TEXTS, yarnAddedText, yarnButtonLabel, yarnMovedText, yarnRemovedText, yarnTitle } from "@/lib/studio-texts.ts";

const T = STUDIO_TEXTS;
const BTN = "rounded-full border-2 border-marino px-3 py-1.5 text-sm font-bold enabled:hover:bg-marino enabled:hover:text-white disabled:opacity-40";
const FIELD = "rounded-xl border-2 border-borde bg-superficie px-3 py-1.5";
const FAMILIES = paletteByFamily();
/** El editor agrupa los cambios continuos (arrastrar el color, escribir un porcentaje) en un solo paso de deshacer. */
const CHANGE_IDLE_MS = 600;

interface PanelProps {
  store: DocumentStore;
  /** Lanas del documento (el panel no necesita el resto: así una pincelada no lo vuelve a renderizar). */
  yarns: readonly Yarn[];
  /** `id` de la lana activa (las celdas se pintan con ella). */
  activeId: string;
  onActiveChange(id: string): void;
}

/** Panel de lanas (zona `yarns`): lista A, B, C…, editor mínimo, agregar, quitar con reemplazo y reordenar. */
export function YarnPanel({ store, yarns, activeId, onActiveChange }: PanelProps) {
  const [removing, setRemoving] = useState<number | null>(null);
  const [replacement, setReplacement] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  /** Mensaje para el lector de pantalla tras reordenar, agregar o quitar (cambian las letras de las lanas). */
  const [spoken, setSpoken] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  /** Dónde va el foco cuando las lanas ya se dibujaron con el cambio (el botón que se usó puede cambiar de lugar o desaparecer). */
  const pendingFocus = useRef<{ kind: "move"; id: string; dir: -1 | 1 } | { kind: "editor"; id: string } | { kind: "add" } | null>(null);
  const atMax = yarns.length >= EDIT_LIMITS.maxYarns;

  useEffect(() => {
    const p = pendingFocus.current;
    pendingFocus.current = null;
    if (!p) return;
    if (p.kind === "add") {
      addRef.current?.focus();
      return;
    }
    const item = Array.from(listRef.current?.children ?? []).find((el) => (el as HTMLElement).dataset.yarnId === p.id);
    if (!item) return;
    if (p.kind === "editor") {
      item.querySelector<HTMLElement>("select, input")?.focus();
      return;
    }
    // Si el botón que se usó ya no puede seguir moviendo (llegó al borde), el foco pasa al otro sentido.
    const first = item.querySelector<HTMLButtonElement>(`[data-act="${p.dir === -1 ? "up" : "down"}"]`);
    const other = item.querySelector<HTMLButtonElement>(`[data-act="${p.dir === -1 ? "down" : "up"}"]`);
    (first && !first.disabled ? first : other)?.focus();
  }, [yarns]);

  function add() {
    store.endStroke();
    const yarn = newYarnFor(store.doc);
    if (store.dispatch({ type: "addYarn", yarn })) {
      onActiveChange(yarn.id);
      setOpenId(yarn.id);
      pendingFocus.current = { kind: "editor", id: yarn.id };
      setSpoken(yarnAddedText(yarnLetter(store.doc.yarns.length - 1)));
    }
  }

  function move(index: number, delta: -1 | 1) {
    const order = yarns.map((_, i) => i);
    const j = index + delta;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j] as number, order[index] as number];
    store.endStroke();
    const id = yarns[index]?.id;
    if (store.dispatch({ type: "reorderYarns", order }) && id) {
      pendingFocus.current = { kind: "move", id, dir: delta };
      setSpoken(yarnMovedText(yarnLetter(index), yarnLetter(j)));
    }
  }

  function confirmRemove(index: number) {
    const target = yarns[replacement];
    store.endStroke();
    if (store.dispatch({ type: "removeYarn", index, replaceWith: replacement })) {
      if (yarns[index]?.id === activeId && target) onActiveChange(target.id);
      setRemoving(null);
      pendingFocus.current = { kind: "add" };
      setSpoken(yarnRemovedText(yarnLetter(index), yarnLetter(replacement > index ? replacement - 1 : replacement), index < yarns.length - 1));
    }
  }

  /** Cancelar la confirmación (botón o Esc): el foco vuelve al botón "Quitar lana" que la abrió. */
  function cancelRemove(id: string) {
    setRemoving(null);
    window.requestAnimationFrame(() => {
      const item = Array.from(listRef.current?.children ?? []).find((el) => (el as HTMLElement).dataset.yarnId === id);
      item?.querySelector<HTMLElement>('[data-act="remove"]')?.focus();
    });
  }

  return (
    <section aria-label={T.lanas.titulo} data-zone="yarns" className="grid gap-3 rounded-2xl border-2 border-linea bg-superficie p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">{T.lanas.titulo}</h2>
        <button ref={addRef} type="button" onClick={add} disabled={atMax} className={BTN}>
          {T.lanas.agregar}
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only" data-testid="yarn-announcement">
        {spoken}
      </p>
      {atMax ? <p className="text-sm text-tinta-suave">{T.panelLanas.maximo}</p> : null}
      <p className="text-sm text-tinta-suave">{T.lanas.ayuda}</p>
      <ul ref={listRef} className="grid gap-2">
        {yarns.map((y, i) => {
          const letter = yarnLetter(i);
          const active = y.id === activeId;
          return (
            <li key={y.id} data-yarn={letter} data-yarn-id={y.id} className={`rounded-xl border-2 ${active ? "border-marino" : "border-linea"}`}>
              <div className="flex flex-wrap items-center gap-2 p-2">
                <button
                  type="button"
                  onClick={() => onActiveChange(y.id)}
                  aria-pressed={active}
                  className={`flex items-center gap-2 rounded-full border-2 px-2 py-1 font-bold ${active ? "border-marino bg-marino text-white" : "border-borde hover:border-marino"}`}
                >
                  <span aria-hidden="true" className="inline-block size-6 rounded border-2 border-marino bg-clip-padding" style={{ backgroundColor: y.color.hex }} />
                  <span aria-hidden="true" className="min-w-5 text-center">
                    {letter}
                  </span>
                  <span className="sr-only">{T.panelLanas.activa}: {yarnTitle(letter)}</span>
                  {active ? (
                    <span aria-hidden="true" className="text-xs font-normal">
                      ({T.panelLanas.activaEstado})
                    </span>
                  ) : null}
                </button>
                <span className="min-w-0 flex-1 truncate text-sm text-tinta-suave">{weightLabel(y.weight)}</span>
                <button type="button" data-act="up" onClick={() => move(i, -1)} disabled={i === 0} aria-label={yarnButtonLabel(T.panelLanas.subir, letter, " en la lista")} className={BTN}>
                  <span aria-hidden="true">↑</span>
                </button>
                <button type="button" data-act="down" onClick={() => move(i, 1)} disabled={i === yarns.length - 1} aria-label={yarnButtonLabel(T.panelLanas.bajar, letter, " en la lista")} className={BTN}>
                  <span aria-hidden="true">↓</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOpenId(openId === y.id ? null : y.id)}
                  aria-expanded={openId === y.id}
                  aria-label={yarnButtonLabel(openId === y.id ? T.panelLanas.cerrar : T.panelLanas.editar, letter)}
                  className={BTN}
                >
                  {openId === y.id ? T.panelLanas.cerrar : T.panelLanas.editar}
                </button>
                <button
                  type="button"
                  data-act="remove"
                  onClick={() => {
                    setRemoving(i);
                    setReplacement(i === 0 ? 1 : 0);
                  }}
                  disabled={yarns.length <= 1}
                  aria-label={yarnButtonLabel(T.lanas.quitar, letter)}
                  className="rounded-full border-2 border-error px-3 py-1.5 text-sm font-bold text-error enabled:hover:bg-error enabled:hover:text-white disabled:opacity-40"
                >
                  {T.lanas.quitar}
                </button>
              </div>
              {yarns.length <= 1 && i === 0 ? <p className="px-3 pb-2 text-sm text-tinta-suave">{T.lanas.noSeQuitaLaUnica}</p> : null}
              {removing === i ? (
                <RemoveConfirm label={yarnButtonLabel(T.lanas.quitar, letter)} onCancel={() => cancelRemove(y.id)}>
                  <label className="font-bold" htmlFor={`replace-${y.id}`}>
                    {T.panelLanas.reemplazoPregunta}
                  </label>
                  <select id={`replace-${y.id}`} value={replacement} onChange={(e) => setReplacement(Number(e.target.value))} className={FIELD}>
                    {yarns.map((o, j) => (j === i ? null : <option key={o.id} value={j}>{yarnTitle(yarnLetter(j))}</option>))}
                  </select>
                  <button type="button" onClick={() => confirmRemove(i)} className="rounded-full bg-error px-4 py-1.5 text-sm font-bold text-white hover:opacity-90">
                    {T.panelLanas.reemplazoConfirmar}
                  </button>
                  <button type="button" data-cancel onClick={() => cancelRemove(y.id)} className={BTN}>
                    {T.panelLanas.cancelar}
                  </button>
                  <p className="basis-full text-sm text-tinta-suave">{T.lanas.eligeReemplazo}</p>
                </RemoveConfirm>
              ) : null}
              {openId === y.id ? <YarnEditor store={store} index={i} yarn={y} letter={letter} /> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Confirmación de quitar una lana: al abrirse lleva el foco a la lista de reemplazo, y Esc la cierra. */
function RemoveConfirm({ label, onCancel, children }: { label: string; onCancel(): void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("select")?.focus();
  }, []);
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className="flex flex-wrap items-center gap-2 border-t-2 border-linea p-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      {children}
    </div>
  );
}

function YarnEditor({ store, index, yarn, letter }: { store: DocumentStore; index: number; yarn: Yarn; letter: string }) {
  const uid = useId();
  const [draft, setDraft] = useState<Yarn>(yarn);
  const [noteText, setNoteText] = useState(yarn.note ?? "");
  const sent = useRef(JSON.stringify(yarn));
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Un cambio que no vino de aquí (deshacer, rehacer, recuperar) reemplaza el borrador.
  useEffect(() => {
    const now = JSON.stringify(yarn);
    if (now !== sent.current) {
      sent.current = now;
      setDraft(yarn);
      setNoteText(yarn.note ?? "");
    }
  }, [yarn]);

  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
    },
    [],
  );

  function closeChange() {
    if (idle.current) clearTimeout(idle.current);
    idle.current = null;
    store.endStroke();
  }

  /** Aplica un cambio al borrador y, si la lana es válida, al documento (un paso de deshacer por ráfaga de cambios). */
  function change(next: Yarn) {
    setDraft(next);
    if (yarnProblems(next).errors.length > 0) return;
    store.beginStroke();
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(closeChange, CHANGE_IDLE_MS);
    sent.current = JSON.stringify(next);
    store.dispatch({ type: "updateYarn", index, yarn: next });
  }

  const problems = yarnProblems(draft);
  const sum = compositionSum(draft.composition);
  const suggestion = toolSuggestion(draft.weight);
  const free = unusedFibers(draft.composition);
  const paletteValue = draft.color.paletteId && PALETTE.some((c) => c.id === draft.color.paletteId) ? draft.color.paletteId : "";

  return (
    <div className="grid gap-4 border-t-2 border-linea p-3" onBlur={closeChange}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <label htmlFor={`${uid}-palette`} className="font-bold">
            {T.lanas.colorPaleta}
          </label>
          <select
            id={`${uid}-palette`}
            value={paletteValue}
            onChange={(e) => {
              const c = PALETTE.find((p) => p.id === e.target.value);
              if (c) change(withColor(draft, { hex: c.hex, paletteId: c.id }));
              else change(withColor(draft, { hex: draft.color.hex }));
            }}
            className={FIELD}
          >
            <option value="">{T.panelLanas.paletaVacia}</option>
            {FAMILIES.map((f) => (
              <optgroup key={f.family} label={f.family}>
                {f.colors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${uid}-custom`} className="font-bold">
            {T.lanas.colorPersonalizado}
          </label>
          <div className="flex items-center gap-2">
            <input id={`${uid}-custom`} type="color" value={draft.color.hex.toLowerCase()} onChange={(e) => change(withColor(draft, { hex: e.target.value }))} className="h-10 w-16 cursor-pointer rounded-lg border-2 border-borde bg-superficie p-0.5" />
            <span className="font-mono text-sm">{draft.color.hex.toUpperCase()}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-1">
        <label htmlFor={`${uid}-weight`} className="font-bold">
          {T.lanas.grosor}
        </label>
        <select id={`${uid}-weight`} value={draft.weight} onChange={(e) => change({ ...draft, weight: Number(e.target.value) as Yarn["weight"] })} className={FIELD}>
          {WEIGHTS.map((w) => (
            <option key={w.cat} value={w.cat}>
              {w.cat} · {weightLabel(w.cat)}
            </option>
          ))}
        </select>
        {suggestion ? (
          <p className="text-sm text-tinta-suave">
            {T.panelLanas.sugerencia}: {T.panelLanas.agujas} {suggestion.needlesMm}; {T.panelLanas.crochet} {suggestion.crochetMm}. {T.panelLanas.muestraCyc}: {suggestion.stitchRange} en 10 cm.
          </p>
        ) : null}
      </div>

      <fieldset className="grid gap-2">
        <legend className="font-bold">{T.lanas.composicion}</legend>
        {draft.composition.map((f, k) => (
          <div key={k} className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`${uid}-fiber-${k}`}>
              {T.panelLanas.fibra} {k + 1}
            </label>
            <select
              id={`${uid}-fiber-${k}`}
              value={f.fiber}
              onChange={(e) => change({ ...draft, composition: draft.composition.map((x, j) => (j === k ? { ...x, fiber: e.target.value } : x)) })}
              className={FIELD}
            >
              {!FIBERS.some((x) => x.id === f.fiber) ? <option value={f.fiber}>{f.fiber}</option> : null}
              {FIBERS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor={`${uid}-pct-${k}`}>
              {T.panelLanas.porcentaje} {k + 1}
            </label>
            <input
              id={`${uid}-pct-${k}`}
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="any"
              value={Number.isFinite(f.percent) ? f.percent : ""}
              onChange={(e) => change({ ...draft, composition: draft.composition.map((x, j) => (j === k ? { ...x, percent: e.target.value === "" ? Number.NaN : Number(e.target.value) } : x)) })}
              className={`${FIELD} w-24`}
            />
            <span aria-hidden="true">%</span>
            <button type="button" onClick={() => change({ ...draft, composition: draft.composition.filter((_, j) => j !== k) })} disabled={draft.composition.length <= 1} aria-label={`${T.panelLanas.quitarFibra} ${k + 1}`} className={BTN}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={free.length === 0}
            onClick={() => change({ ...draft, composition: [...draft.composition, { fiber: free[0] as string, percent: Math.max(0, Math.round((100 - sum) * 100) / 100) }] })}
            className={BTN}
          >
            {T.panelLanas.agregarFibra}
          </button>
          <p role="status" className={`font-bold ${Math.abs(sum - 100) > 0.01 ? "text-error" : "text-exito"}`}>
            <span aria-hidden="true">{Math.abs(sum - 100) > 0.01 ? "× " : "✓ "}</span>
            {T.panelLanas.suma}: {sum.toLocaleString("es-CL")} %
          </p>
        </div>
      </fieldset>

      {problems.errors.length > 0 ? (
        <div role="alert" className="grid gap-1 text-sm font-bold text-error">
          <ul className="list-disc pl-5">
            {problems.errors.slice(0, 4).map((i) => (
              <li key={`${i.code}-${i.path}`}>{i.message}</li>
            ))}
          </ul>
          <p>{T.panelLanas.noSeGuarda}</p>
        </div>
      ) : null}
      {problems.warnings.length > 0 ? (
        <ul className="list-disc pl-5 text-sm">
          {problems.warnings.slice(0, 4).map((i) => (
            <li key={`${i.code}-${i.path}`}>{i.message}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-1">
        <label htmlFor={`${uid}-note`} className="font-bold">
          {T.panelLanas.notaEtiqueta}
        </label>
        <textarea
          id={`${uid}-note`}
          rows={2}
          value={noteText}
          maxLength={LIMITS.maxYarnNoteLength}
          onChange={(e) => {
            // El texto se normaliza al guardarlo (\\r\\n → \\n, sin caracteres de control); el campo conserva lo escrito.
            setNoteText(e.target.value);
            change(withNote(draft, e.target.value));
          }}
          onBlur={() => setNoteText(normalizeNote(noteText))}
          aria-describedby={`${uid}-note-help`}
          className={FIELD}
        />
        <p id={`${uid}-note-help`} className="text-sm text-tinta-suave">
          <strong>{T.panelLanas.notaTitulo}.</strong> {T.panelLanas.notaAyuda}
        </p>
      </div>
      <p className="sr-only">{yarnTitle(letter)}</p>
    </div>
  );
}
