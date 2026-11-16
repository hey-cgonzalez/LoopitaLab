"use client";

import { LIMITS, summarizePart, type Part, type PartRef, type WrittenPattern } from "@loopitalab/pattern-core";
import { useEffect, useId, useRef, useState } from "react";
import type { LimitSummary } from "@/lib/amigurumi/limits.ts";
import type { ActionResult, WrittenAction, WrittenStore } from "@/lib/amigurumi/store.ts";
import { AMIGURUMI_TEXTS } from "@/lib/amigurumi/texts.ts";
import { LimitLine } from "./LimitsMeter.tsx";

const T = AMIGURUMI_TEXTS.partes;
const BTN = "rounded-full border-2 border-marino px-2.5 py-1 text-sm font-bold enabled:hover:bg-marino enabled:hover:text-white disabled:opacity-40";
const FIELD = "rounded-xl border-2 border-borde bg-superficie px-3 py-1.5";

const copiesOf = (p: Part) => (typeof p.copies === "number" ? p.copies : 1);

/** "Oreja (1 de 2)" de cada pieza sin ubicar (F4-62). */
export function unplacedLabels(doc: WrittenPattern, refs: readonly PartRef[]): string[] {
  return refs.map((r) => {
    const p = doc.parts.find((x) => x.id === r.part);
    return p ? T.pieza(p.name, r.copy + 1, copiesOf(p)) : r.part;
  });
}

/** Parte nueva: como la del documento nuevo (V1 de 6 pb en anillo mágico), con la primera lana. Id y nombre libres. */
export function newPartFor(doc: WrittenPattern): Part {
  const ids = new Set(doc.parts.map((p) => p.id));
  const names = new Set(doc.parts.map((p) => p.name));
  let k = doc.parts.length + 1;
  while (ids.has(`p${k}`)) k++;
  const id = `p${k}`;
  let m = doc.parts.length + 1;
  while (names.has(T.nombreNueva(m))) m++;
  return {
    id,
    name: T.nombreNueva(m),
    construction: "spiral",
    start: { type: "magic_ring" },
    startYarn: doc.yarns[0]?.id ?? "A",
    rounds: [{ number: 1, items: [{ type: "stitch", stitch: "sc", count: 6 }], expected: 6 }],
  };
}

interface Props {
  store: WrittenStore;
  doc: WrittenPattern;
  selectedId: string;
  onSelect(id: string): void;
  limits: LimitSummary;
  /** Acción puntual con el diálogo de límites recomendados (ADR 0011, sección 3b). */
  guard(action: WrittenAction, done?: (r: ActionResult) => void): void;
  announce(text: string): void;
}

/** Lista de partes (CA4-E8): agregar, renombrar, ordenar, fijar cuántas veces se teje y borrar. */
export function PartsPanel({ store, doc, selectedId, onSelect, limits, guard, announce }: Props) {
  const uid = useId();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nameText, setNameText] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiesText, setCopiesText] = useState<Record<string, string>>({});
  const listRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<{ id: string; act: string } | null>(null);

  useEffect(() => {
    const f = focusAfter.current;
    focusAfter.current = null;
    if (!f) return;
    if (f.id === "") {
      addRef.current?.focus();
      return;
    }
    const item = Array.from(listRef.current?.children ?? []).find((el) => (el as HTMLElement).dataset.partId === f.id);
    const btn = item?.querySelector<HTMLElement>(`[data-act="${f.act}"]`);
    (btn && !(btn as HTMLButtonElement).disabled ? btn : item?.querySelector<HTMLElement>('[data-act="open"]'))?.focus();
  }, [doc.parts]);

  const atMax = doc.parts.length >= LIMITS.maxParts;
  const partsGauge = limits.byLimit.parts;

  function add() {
    if (atMax) {
      setNotice(T.topePartes(LIMITS.maxParts));
      return;
    }
    const part = newPartFor(store.doc);
    guard({ type: "addPart", part }, (r) => {
      if (!r.changed) {
        setNotice(T.topePartes(LIMITS.maxParts));
        return;
      }
      setNotice(null);
      onSelect(part.id);
      announce(T.agregada(part.name));
    });
  }

  function move(p: Part, i: number, d: -1 | 1) {
    if (store.dispatch({ type: "movePart", partId: p.id, toIndex: i + d })) {
      focusAfter.current = { id: p.id, act: d < 0 ? "up" : "down" };
      announce(T.movida(p.name, i + d + 1, doc.parts.length));
    }
  }

  function startRename(p: Part) {
    setRenaming(p.id);
    setNameText(p.name);
    setNameError(null);
  }

  function commitRename(p: Part) {
    const name = nameText.trim();
    if (name === p.name) {
      setRenaming(null);
      return;
    }
    const r = store.run({ type: "renamePart", partId: p.id, name });
    if (!r.changed) {
      setNameError(T.nombreInvalido);
      return;
    }
    setRenaming(null);
    setNameError(null);
    focusAfter.current = { id: p.id, act: "rename" };
  }

  function setCopies(p: Part, n: number) {
    setCopiesText((m) => ({ ...m, [p.id]: String(n) }));
    if (!Number.isInteger(n) || n < 1 || n > LIMITS.maxCopies) {
      setNotice(T.topeCopias(LIMITS.maxCopies));
      return;
    }
    guard({ type: "setCopies", partId: p.id, copies: n }, (r) => {
      setCopiesText((m) => {
        const { [p.id]: _drop, ...rest } = m;
        return rest;
      });
      if (r.unplaced.length > 0) setNotice(T.sinUbicar(unplacedLabels(store.doc, r.unplaced).join(", ")));
      else setNotice(null);
    });
  }

  function confirmRemove(p: Part) {
    // El foco va a la parte siguiente, o a la anterior, o a "Agregar parte" si no queda ninguna (WCAG 2.4.3).
    const at = store.doc.parts.findIndex((q) => q.id === p.id);
    const neighbour = store.doc.parts[at + 1] ?? store.doc.parts[at - 1];
    const r = store.run({ type: "removePart", partId: p.id });
    setRemoving(null);
    if (!r.changed) return;
    focusAfter.current = { id: neighbour?.id ?? "", act: "open" };
    const next = store.doc.parts[0];
    if (selectedId === p.id && next) onSelect(next.id);
    setNotice(r.unplaced.length > 0 ? T.sinUbicar(unplacedLabels(store.doc, r.unplaced).join(", ")) : null);
    announce(T.borrada(p.name));
  }

  return (
    <section aria-labelledby={`${uid}-title`} className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-2xl border-2 border-linea bg-superficie p-3" data-testid="parts-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${uid}-title`} className="font-display text-base font-bold">
          {T.titulo}
        </h2>
        <button ref={addRef} type="button" onClick={add} disabled={atMax} className={BTN} data-testid="add-part">
          {T.agregar}
        </button>
      </div>
      <LimitLine gauge={partsGauge} text={AMIGURUMI_TEXTS.limites.partes(partsGauge.value)} testId="parts-limit" />
      {atMax ? <p className="text-sm text-tinta-suave">{T.topePartes(LIMITS.maxParts)}</p> : null}
      {notice ? (
        <p role="status" className="rounded-lg border-l-4 border-mostaza pl-2 text-sm" data-testid="parts-notice">
          {notice}
        </p>
      ) : null}

      <ul ref={listRef} className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
        {doc.parts.map((p, i) => {
          const selected = p.id === selectedId;
          const copies = copiesOf(p);
          const rounds = summarizePart(p).rounds;
          const overRounds = limits.partsOverRounds.has(p.id);
          const overCopies = limits.partsOverCopies.has(p.id);
          const placed = new Set((doc.layout?.placements ?? []).filter((pl) => pl.target.part === p.id).map((pl) => pl.target.copy));
          const removeRefs = removing === p.id ? store.simulate({ type: "removePart", partId: p.id }).unplaced : [];
          return (
            <li key={p.id} data-part-id={p.id} className={`grid grid-cols-[minmax(0,1fr)] gap-1.5 rounded-xl border-2 p-2 ${selected ? "border-marino" : "border-linea"}`} data-testid="part-item">
              <div className="flex flex-wrap items-center gap-1.5">
                {renaming === p.id ? (
                  <span className="grid min-w-0 flex-1 gap-1">
                    <label htmlFor={`${uid}-name-${p.id}`} className="sr-only">
                      {T.renombrar}
                    </label>
                    <input
                      id={`${uid}-name-${p.id}`}
                      autoFocus
                      value={nameText}
                      maxLength={LIMITS.maxPartNameLength * 2}
                      onChange={(e) => setNameText(e.target.value)}
                      onBlur={() => commitRename(p)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitRename(p);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setRenaming(null);
                          setNameError(null);
                          focusAfter.current = { id: p.id, act: "rename" };
                        }
                      }}
                      aria-invalid={nameError ? true : undefined}
                      className={`${FIELD} min-w-0`}
                      data-testid="part-name-input"
                    />
                  </span>
                ) : (
                  <button
                    type="button"
                    data-act="open"
                    onClick={() => onSelect(p.id)}
                    aria-current={selected ? "true" : undefined}
                    aria-label={T.abrir(p.name)}
                    className={`min-w-0 flex-1 rounded-full border-2 px-3 py-1 text-left font-bold break-words ${selected ? "border-marino bg-marino text-white" : "border-borde hover:border-marino"}`}
                    data-testid="part-open"
                  >
                    {p.name}
                    {copies > 1 ? <span className="font-normal"> (× {copies})</span> : null}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" data-act="up" onClick={() => move(p, i, -1)} disabled={i === 0} aria-label={`${T.subir} «${p.name}»`} className={`${BTN} px-2`}>
                  <span aria-hidden="true">↑</span>
                </button>
                <button type="button" data-act="down" onClick={() => move(p, i, 1)} disabled={i === doc.parts.length - 1} aria-label={`${T.bajar} «${p.name}»`} className={`${BTN} px-2`}>
                  <span aria-hidden="true">↓</span>
                </button>
                <button type="button" data-act="rename" onClick={() => startRename(p)} aria-label={`${T.renombrar}: «${p.name}»`} className={BTN} data-testid="part-rename">
                  Renombrar
                </button>
                <button
                  type="button"
                  data-act="remove"
                  onClick={() => setRemoving(removing === p.id ? null : p.id)}
                  disabled={doc.parts.length <= 1}
                  aria-expanded={removing === p.id}
                  aria-label={`${T.borrar} «${p.name}»`}
                  className="rounded-full border-2 border-error px-2.5 py-1 text-sm font-bold text-error enabled:hover:bg-error enabled:hover:text-white disabled:opacity-40"
                  data-testid="part-remove"
                >
                  {T.borrar}
                </button>
              </div>
              {renaming === p.id && nameError ? (
                <p role="alert" className="text-sm font-bold text-error">
                  {nameError}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <label htmlFor={`${uid}-copies-${p.id}`}>{T.seTeje}</label>
                  <button type="button" onClick={() => setCopies(p, copies - 1)} disabled={copies <= 1} aria-label={`Una vez menos «${p.name}»`} className={`${BTN} px-2`}>
                    <span aria-hidden="true">−</span>
                  </button>
                  <input
                    id={`${uid}-copies-${p.id}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={LIMITS.maxCopies}
                    value={copiesText[p.id] ?? String(copies)}
                    onChange={(e) => setCopiesText((m) => ({ ...m, [p.id]: e.target.value }))}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== copies) setCopies(p, v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const v = Number(e.currentTarget.value);
                        if (v !== copies) setCopies(p, v);
                      }
                    }}
                    aria-describedby={`${uid}-copies-help`}
                    className={`${FIELD} w-16 py-0.5 text-center`}
                    data-testid="part-copies"
                  />
                  <button type="button" onClick={() => setCopies(p, copies + 1)} disabled={copies >= LIMITS.maxCopies} aria-label={`Una vez más «${p.name}»`} className={`${BTN} px-2`}>
                    <span aria-hidden="true">+</span>
                  </button>
                  <span>{T.veces(copies)}</span>
                </span>
                <span className={overRounds ? "font-bold" : "text-tinta-suave"} data-testid="part-rounds">
                  {T.vueltas(rounds)}
                </span>
                {selected ? <span className="text-tinta-suave">({T.seleccionada})</span> : null}
              </div>
              {overCopies ? <p className="text-sm font-bold">{AMIGURUMI_TEXTS.editor.limiteCopias}</p> : null}

              {copies > 1 ? (
                <ul className="grid gap-0.5 pl-3 text-sm" aria-label={`Piezas de «${p.name}»`} data-testid="part-pieces">
                  {Array.from({ length: copies }, (_, c) => (
                    <li key={c}>
                      {T.pieza(p.name, c + 1, copies)}: <span className="text-tinta-suave">{placed.has(c) ? T.ubicada : T.ubicacionAutomatica}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {removing === p.id ? (
                <div
                  role="group"
                  aria-label={`${T.borrar} «${p.name}»`}
                  className="grid gap-2 border-t-2 border-linea pt-2"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setRemoving(null);
                      focusAfter.current = { id: p.id, act: "remove" };
                    }
                  }}
                >
                  <p className="text-sm">{T.borrarPregunta(p.name)}</p>
                  {removeRefs.length > 0 ? (
                    <p className="text-sm font-bold" data-testid="remove-unplaced">
                      {T.sinUbicarBorrar(unplacedLabels(store.doc, removeRefs).join(", "))}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" autoFocus onClick={() => confirmRemove(p)} className="rounded-full bg-error px-4 py-1.5 text-sm font-bold text-white hover:opacity-90" data-testid="part-remove-confirm">
                      {T.borrarConfirmar}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRemoving(null);
                        focusAfter.current = { id: p.id, act: "remove" };
                      }}
                      className={BTN}
                    >
                      {T.cancelar}
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p id={`${uid}-copies-help`} className="text-sm text-tinta-suave">
        {T.vecesAyuda}
      </p>
      {doc.parts.length <= 1 ? <p className="text-sm text-tinta-suave">{T.unicaNoSeBorra}</p> : null}
    </section>
  );
}
