"use client";

import { EDIT_LIMITS, yarnLetter, type Yarn } from "@loopitalab/pattern-core";
import { weightLabel } from "@loopitalab/yarn-catalog";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { selectAssumedGauge, selectTechnique } from "@/lib/studio/select.ts";
import type { DocumentStore } from "@/lib/studio/store.ts";
import { newYarnFor } from "@/lib/studio/yarn-edit.ts";
import { STUDIO_TEXTS, yarnAddedText, yarnButtonLabel, yarnMovedText, yarnRemovedText, yarnTitle } from "@/lib/studio-texts.ts";
import { YarnPicker } from "./YarnPicker.tsx";
import { FIELD } from "./yarn-picker-ui.ts";
import { useStoreSelector } from "./useStoreSelector.ts";

const T = STUDIO_TEXTS;
const BTN = "rounded-full border-2 border-marino px-2.5 py-1 text-sm font-bold enabled:hover:bg-marino enabled:hover:text-white disabled:opacity-40";
const [QUITAR_VERBO, ...QUITAR_REST] = T.lanas.quitar.split(" ");
const QUITAR_RESTO = QUITAR_REST.join(" ");

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
  const technique = useStoreSelector(store, selectTechnique);
  const gaugeAssumed = useStoreSelector(store, selectAssumedGauge);

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

  /** Esc en el selector: se cierra y el foco vuelve al botón "Editar" de esa lana. */
  function closeEditor(id: string) {
    setOpenId(null);
    window.requestAnimationFrame(() => {
      const item = Array.from(listRef.current?.children ?? []).find((el) => (el as HTMLElement).dataset.yarnId === id);
      item?.querySelector<HTMLElement>('[data-act="edit"]')?.focus();
    });
  }

  return (
    <section aria-label={T.lanas.titulo} data-zone="yarns" className="@container grid shrink-0 gap-2 rounded-2xl border-2 border-linea bg-superficie p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold">{T.lanas.titulo}</h2>
        <button ref={addRef} type="button" onClick={add} disabled={atMax} className={BTN}>
          {T.lanas.agregar}
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only" data-testid="yarn-announcement">
        {spoken}
      </p>
      {atMax ? <p className="text-sm text-tinta-suave">{T.panelLanas.maximo}</p> : null}
      <p className="text-sm text-tinta-suave">{T.lanas.ayuda}</p>
      <ul ref={listRef} className="grid gap-1.5">
        {yarns.map((y, i) => {
          const letter = yarnLetter(i);
          const active = y.id === activeId;
          return (
            <li key={y.id} data-yarn={letter} data-yarn-id={y.id} className={`rounded-xl border-2 ${active ? "border-marino" : "border-linea"}`}>
              <div className="flex flex-wrap items-center gap-1 p-1.5 @sm:gap-1.5">
                <button
                  type="button"
                  onClick={() => onActiveChange(y.id)}
                  aria-pressed={active}
                  className={`flex items-center gap-2 rounded-full border-2 px-2 py-0.5 font-bold ${active ? "border-marino bg-marino text-white" : "border-borde hover:border-marino"}`}
                >
                  <span aria-hidden="true" className="inline-block size-6 rounded border-2 border-marino bg-clip-padding" style={{ backgroundColor: y.color.hex }} />
                  <span aria-hidden="true" className="min-w-5 text-center">
                    {letter}
                  </span>
                  <span className="sr-only">{T.panelLanas.activa}: {yarnTitle(letter)}</span>
                  {active ? (
                    <span aria-hidden="true" className="hidden text-xs font-normal @md:inline">
                      ({T.panelLanas.activaEstado})
                    </span>
                  ) : null}
                </button>
                {/* En un contenedor angosto (columna lateral) el grosor se ve al editar la lana: así la fila no se parte en dos. */}
                <span className="hidden min-w-0 flex-1 truncate text-sm text-tinta-suave @sm:block">{weightLabel(y.weight)}</span>
                <span aria-hidden="true" className="flex-1 @sm:hidden" />
                <button type="button" data-act="up" onClick={() => move(i, -1)} disabled={i === 0} aria-label={yarnButtonLabel(T.panelLanas.subir, letter, " en la lista")} className={`${BTN} px-2`}>
                  <span aria-hidden="true">↑</span>
                </button>
                <button type="button" data-act="down" onClick={() => move(i, 1)} disabled={i === yarns.length - 1} aria-label={yarnButtonLabel(T.panelLanas.bajar, letter, " en la lista")} className={`${BTN} px-2`}>
                  <span aria-hidden="true">↓</span>
                </button>
                <button
                  type="button"
                  data-act="edit"
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
                  className="rounded-full border-2 border-error px-2 py-1 text-sm font-bold text-error enabled:hover:bg-error enabled:hover:text-white disabled:opacity-40"
                >
                  {/* Visible: "Quitar" en angosto. El nombre accesible sigue completo ("Quitar lana B", incluye el texto visible). */}
                  {QUITAR_VERBO}
                  <span className="hidden @md:inline"> {QUITAR_RESTO}</span>
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
              {openId === y.id ? (
                <YarnPicker
                  store={store}
                  index={i}
                  yarn={y}
                  letter={letter}
                  technique={technique}
                  gaugeAssumed={gaugeAssumed}
                  canAdd={!atMax}
                  announce={setSpoken}
                  onAdded={onActiveChange}
                  onClose={() => closeEditor(y.id)}
                />
              ) : null}
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
