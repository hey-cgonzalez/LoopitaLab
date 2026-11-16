"use client";

import { LIMITS } from "@loopitalab/pattern-core";
import type { WrittenPlacementDescription } from "@loopitalab/pattern-render";
import { useEffect, useId, useRef, useState } from "react";
import type { WrittenStore } from "@/lib/amigurumi/store.ts";
import { AMIGURUMI_TEXTS } from "@/lib/amigurumi/texts.ts";

const T = AMIGURUMI_TEXTS.armado;
const BTN = "rounded-full border-2 border-marino px-2.5 py-1 text-sm font-bold enabled:hover:bg-marino enabled:hover:text-white disabled:opacity-40";

const EMPTY: readonly string[] = [];
/** `focusIndex` para la última casilla (la nueva). */
const LAST = -1;

interface Props {
  store: WrittenStore;
  assembly: readonly string[] | undefined;
  /**
   * "Dónde va cada pieza" de `describeWritten` (ADR 0011, sección 9; enmienda C-17): una lista derivada de `layout`
   * y del perfil del anfitrión, que NO se copia en `assembly`. `null` si el documento no se puede describir.
   */
  placements: readonly WrittenPlacementDescription[] | null;
  /** Se muestra la lista (hay más de una pieza o hay posiciones). */
  showWhere: boolean;
  /** "Oreja (2 de 2), Brazo (1 de 2)": piezas sin ubicar (`placed: false` de la escena). */
  unplaced: readonly string[];
  announce(text: string): void;
}

/**
 * Armado (T16): "Dónde va cada pieza" (derivado) y los pasos que escribe la diseñadora (`assembly`, con `setAssembly`).
 * Cada paso confirma al salir de su casilla; agregar, borrar y mover son un paso de deshacer cada uno.
 */
export function AssemblyPanel({ store, assembly, placements, showWhere, unplaced, announce }: Props) {
  const uid = useId();
  const steps = assembly ?? EMPTY;
  /*
   * La lista sale del documento (`assembly`); el estado local es solo lo que se está escribiendo (`edits`, por
   * índice) y una casilla nueva todavía vacía (`extra`). Así un cambio del documento (deshacer, otra acción) nunca
   * pisa ni duplica lo que se ve.
   */
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [extra, setExtra] = useState(false);
  const shown = [...steps, ...(extra ? [""] : [])].map((t, i) => edits[i] ?? t);
  const listRef = useRef<HTMLOListElement>(null);
  const focusIndex = useRef<number | null>(null);

  useEffect(() => {
    const i = focusIndex.current;
    if (i === null) return;
    const all = listRef.current?.querySelectorAll<HTMLTextAreaElement>("textarea");
    const el = all?.[i === LAST ? all.length - 1 : i];
    if (!el) return;
    focusIndex.current = null;
    el.focus();
  });

  const commit = (next: readonly string[]) => {
    setEdits({});
    setExtra(false);
    store.run({ type: "setAssembly", steps: next });
  };

  function add() {
    if (shown.length >= LIMITS.maxNotes && !extra) return;
    focusIndex.current = LAST;
    setExtra(true);
  }

  function remove(i: number) {
    commit(shown.filter((_, k) => k !== i));
    announce(`${T.borrar(i + 1)}: hecho.`);
  }

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= shown.length) return;
    const next = [...shown];
    [next[i], next[j]] = [next[j]!, next[i]!];
    focusIndex.current = j;
    commit(next);
  }

  return (
    <section aria-labelledby={`${uid}-title`} className="grid gap-3 rounded-2xl border-2 border-linea bg-superficie p-3 text-sm" data-testid="assembly-panel">
      <h3 id={`${uid}-title`} className="font-display text-base font-bold">
        {T.titulo}
      </h3>

      {unplaced.length > 0 ? (
        <p role="status" className="rounded-lg border-l-4 border-mostaza pl-2 font-bold" data-testid="unplaced-warning">
          {T.sinUbicar(unplaced.join(", "))}
        </p>
      ) : null}

      {showWhere ? (
        <div className="grid gap-1">
          <h4 className="font-bold">{T.dondeVa}</h4>
          <p className="text-tinta-suave">{T.dondeVaAyuda}</p>
          {placements ? (
            <ul className="grid list-disc gap-0.5 pl-5" data-testid="where-list">
              {placements.map((p) => (
                <li key={`${p.part}-${p.copy}`} data-part={p.part} data-copy={p.copy} data-kind={p.kind}>
                  {p.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-tinta-suave">{T.sinDescripcion}</p>
          )}
        </div>
      ) : null}

      <div className="grid gap-2">
        <h4 id={`${uid}-steps`} className="font-bold">
          {T.pasos}
        </h4>
        <p className="text-tinta-suave">{T.pasosAyuda}</p>
        {shown.length > 0 ? (
          <ol ref={listRef} aria-labelledby={`${uid}-steps`} className="grid gap-2" data-testid="assembly-steps">
            {shown.map((text, i) => (
              <li key={i} className="grid gap-1">
                <label htmlFor={`${uid}-step-${i}`} className="font-bold">
                  {T.paso(i + 1)}
                </label>
                <textarea
                  id={`${uid}-step-${i}`}
                  value={text}
                  rows={2}
                  maxLength={LIMITS.maxNoteLength}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEdits((m) => ({ ...m, [i]: value }));
                  }}
                  onBlur={() => {
                    if (edits[i] !== undefined || (extra && i === steps.length)) commit(shown);
                  }}
                  className="rounded-xl border-2 border-borde bg-superficie px-2 py-1"
                  data-testid="assembly-step"
                />
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={`${BTN} px-2`} onClick={() => move(i, -1)} disabled={i === 0} aria-label={T.subir(i + 1)}>
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button type="button" className={`${BTN} px-2`} onClick={() => move(i, 1)} disabled={i === shown.length - 1} aria-label={T.bajar(i + 1)}>
                    <span aria-hidden="true">↓</span>
                  </button>
                  <button type="button" className={BTN} onClick={() => remove(i)} aria-label={T.borrar(i + 1)} data-testid="assembly-remove">
                    Borrar
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BTN} onClick={add} disabled={steps.length >= LIMITS.maxNotes} data-testid="assembly-add">
            {T.agregar}
          </button>
          <span className="text-tinta-suave">
            {T.tope(LIMITS.maxNotes)} {T.largo(LIMITS.maxNoteLength)}
          </span>
        </div>
      </div>
    </section>
  );
}
