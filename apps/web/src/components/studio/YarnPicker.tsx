"use client";

import { LIMITS, yarnLetter, type Yarn } from "@loopitalab/pattern-core";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import type { DocumentStore } from "@/lib/studio/store.ts";
import { nextYarnId, normalizeNote, withColor, withNote, yarnProblems } from "@/lib/studio/yarn-edit.ts";
import { applySavedYarn, colorName, newYarnFromSaved } from "@/lib/studio/yarn-picker.ts";
import type { SavedYarn } from "@/lib/yarns/saved.ts";
import { STUDIO_TEXTS, yarnTitle } from "@/lib/studio-texts.ts";
import { previewControls } from "./preview-controls.ts";
import { SavedYarnsTab } from "./SavedYarnsTab.tsx";
import { YarnColorPicker } from "./YarnColorPicker.tsx";
import { YarnCompositionEditor } from "./YarnCompositionEditor.tsx";
import { YarnWeightPicker } from "./YarnWeightPicker.tsx";
import { BTN, FIELD, clearPreview } from "./yarn-picker-ui.ts";

const T = STUDIO_TEXTS;
const S = STUDIO_TEXTS.selectorLanas;
/** Los cambios continuos (arrastrar el color, escribir un porcentaje) se agrupan en un solo paso de deshacer. */
const CHANGE_IDLE_MS = 600;

type Tab = "adjust" | "saved";

interface Props {
  store: DocumentStore;
  index: number;
  yarn: Yarn;
  letter: string;
  technique: "knit" | "crochet";
  /** No hay muestra en el documento (la de referencia es un supuesto visible). */
  gaugeAssumed: boolean;
  canAdd: boolean;
  /** Esc: cierra el selector (la vista previa ya se quitó). */
  onClose(): void;
  /** Texto para la región viva del panel de lanas. */
  announce(text: string): void;
  /** Se agregó una lana nueva desde "Mis lanas". */
  onAdded(id: string): void;
}

/**
 * Selector de lanas de UNA lana del diseño: grosor, composición, color y nota, más la pestaña "Mis lanas". Mantiene un
 * borrador local; solo lo guardable entra al documento (`updateYarn` como operación, con deshacer). Elegir (clic, Enter
 * o toque) escribe un paso de deshacer y quita la vista previa en el mismo manejador; Esc la quita y cierra.
 */
export function YarnPicker({ store, index, yarn, letter, technique, gaugeAssumed, canAdd, onClose, announce, onAdded }: Props) {
  const uid = useId();
  const [tab, setTab] = useState<Tab>("adjust");
  const [draft, setDraft] = useState<Yarn>(yarn);
  const [noteText, setNoteText] = useState(yarn.note ?? "");
  const sent = useRef(JSON.stringify(yarn));
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controls = previewControls(store);
  const flat = useSyncExternalStore(controls.subscribe, controls.getFlatColors, () => false);

  // Un cambio que no vino de aquí (deshacer, rehacer, recuperar) reemplaza el borrador.
  useEffect(() => {
    const now = JSON.stringify(yarn);
    if (now !== sent.current) {
      sent.current = now;
      setDraft(yarn);
      setNoteText(yarn.note ?? "");
    }
  }, [yarn]);

  // Al cerrar o desmontar, ninguna vista previa queda pegada.
  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
      clearPreview(store, index);
    },
    [store, index],
  );

  function closeChange() {
    if (idle.current) clearTimeout(idle.current);
    idle.current = null;
    store.endStroke();
  }

  /** Cambio continuo: al borrador y, si la lana es guardable, al documento (un paso de deshacer por ráfaga). */
  function change(next: Yarn) {
    setDraft(next);
    if (yarnProblems(next).errors.length > 0) return;
    store.beginStroke();
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(closeChange, CHANGE_IDLE_MS);
    sent.current = JSON.stringify(next);
    store.dispatch({ type: "updateYarn", index, yarn: next });
  }

  /** Elección puntual: un paso de deshacer propio, y la vista previa se quita en el mismo manejador. */
  function commit(next: Yarn, spoken?: string) {
    closeChange();
    setDraft(next);
    setNoteText(next.note ?? "");
    clearPreview(store, index);
    if (yarnProblems(next).errors.length > 0) return;
    sent.current = JSON.stringify(next);
    store.dispatch({ type: "updateYarn", index, yarn: next });
    if (spoken) announce(spoken);
  }

  function applyFromSaved(saved: SavedYarn, copyNote: boolean): string | null {
    const target = store.doc.yarns[index] ?? yarn;
    const r = applySavedYarn(target, saved, { copyNote });
    if (r.errors.length > 0) return r.errors[0] ?? "";
    commit(r.yarn, `Lana ${letter}: se usó una lana guardada (${colorName(saved.color)}).`);
    return null;
  }

  function addSaved(saved: SavedYarn, copyNote: boolean): string | null {
    const r = newYarnFromSaved(nextYarnId(store.doc.yarns), saved, { copyNote });
    if (r.errors.length > 0) return r.errors[0] ?? "";
    closeChange();
    clearPreview(store, index);
    if (store.dispatch({ type: "addYarn", yarn: r.yarn })) {
      onAdded(r.yarn.id);
      announce(`Se agregó la lana ${yarnLetter(store.doc.yarns.length - 1)} desde tus lanas guardadas.`);
    }
    return null;
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    clearPreview(store, index);
    closeChange();
    onClose();
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next: Tab = e.key === "ArrowLeft" || e.key === "Home" ? "adjust" : "saved";
    setTab(next);
    document.getElementById(`${uid}-tab-${next}`)?.focus();
  }

  const problems = yarnProblems(draft);

  return (
    <div className="grid gap-3 border-t-2 border-linea p-3" onBlur={closeChange} onKeyDown={onKeyDown} data-testid="yarn-picker" data-yarn-picker={letter} role="group" aria-label={`${S.pestanas}: ${yarnTitle(letter)}`}>
      <div role="tablist" aria-label={S.pestanas} className="flex flex-wrap gap-2">
        {(["adjust", "saved"] as const).map((t) => (
          <button
            key={t}
            id={`${uid}-tab-${t}`}
            type="button"
            role="tab"
            aria-selected={tab === t}
            aria-controls={`${uid}-panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            onKeyDown={onTabKey}
            className={`${BTN} ${tab === t ? "bg-marino text-white" : ""}`}
          >
            {t === "adjust" ? S.pestanaAjustar : S.pestanaMisLanas}
          </button>
        ))}
      </div>
      <p className="text-sm text-tinta-suave">Esc cierra el selector y quita la vista previa.</p>
      {flat ? (
        <p className="text-sm" data-testid="picker-flat-note">
          {S.coloresPlanosActivo}{" "}
          <button type="button" onClick={() => controls.setFlatColors(false)} className="font-bold underline">
            {S.coloresPlanosApagar}
          </button>
        </p>
      ) : null}

      {tab === "adjust" ? (
        <div id={`${uid}-panel-adjust`} role="tabpanel" aria-labelledby={`${uid}-tab-adjust`} className="grid gap-4">
          <YarnWeightPicker weight={draft.weight} technique={technique} gaugeAssumed={gaugeAssumed} onPick={(cat) => commit({ ...draft, weight: cat as Yarn["weight"] }, `Lana ${letter}: grosor ${cat}.`)} />
          <YarnCompositionEditor
            composition={draft.composition}
            onChange={(composition) => change({ ...draft, composition })}
            onCommit={(composition) => commit({ ...draft, composition })}
          />
          <YarnColorPicker
            store={store}
            index={index}
            color={draft.color}
            onPick={(c) => commit(withColor(draft, c), `Lana ${letter}: color ${colorName(c)}.`)}
            onCustom={(hex) => change(withColor(draft, { hex }))}
          />

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
                // El texto se normaliza al guardarlo; el campo conserva lo escrito.
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
        </div>
      ) : (
        <div id={`${uid}-panel-saved`} role="tabpanel" aria-labelledby={`${uid}-tab-saved`}>
          <SavedYarnsTab store={store} index={index} letter={letter} canAdd={canAdd} onUse={applyFromSaved} onAdd={addSaved} />
        </div>
      )}
      <p className="sr-only">{yarnTitle(letter)}</p>
    </div>
  );
}
