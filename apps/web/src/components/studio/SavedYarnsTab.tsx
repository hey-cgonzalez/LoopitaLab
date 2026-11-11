"use client";

import Link from "next/link";
import { weightLabel } from "@loopitalab/yarn-catalog";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { listUserYarns } from "@/app/lanas/actions";
import { describeComposition } from "@/lib/yarns/form.ts";
import type { SavedYarn } from "@/lib/yarns/saved.ts";
import { colorName } from "@/lib/studio/yarn-picker.ts";
import type { DocumentStore } from "@/lib/studio/store.ts";
import { STUDIO_TEXTS, savedYarnUsedText } from "@/lib/studio-texts.ts";
import { BTN, previewHandlers } from "./yarn-picker-ui.ts";

const S = STUDIO_TEXTS.selectorLanas;

type Load = { kind: "loading" } | { kind: "ok"; yarns: SavedYarn[] } | { kind: "signed-out" } | { kind: "error"; message: string };

interface Props {
  store: DocumentStore;
  index: number;
  letter: string;
  /** Hay lugar para una lana más en el diseño. */
  canAdd: boolean;
  /** Reemplaza la lana por la guardada (un paso de deshacer). Devuelve un mensaje si no se pudo escribir. */
  onUse(saved: SavedYarn, copyNote: boolean): string | null;
  onAdd(saved: SavedYarn, copyNote: boolean): string | null;
}

/**
 * Pestaña "Mis lanas" del selector: usa una lana guardada en la cuenta. Copia por valor (grosor, composición y color);
 * la nota privada solo se copia si la usuaria lo marca. Al pasar el cursor o el foco se previsualiza con su color y su
 * composición. Sin sesión, invita a ingresar. Solo carga al abrirse la pestaña.
 */
export function SavedYarnsTab({ store, index, letter, canAdd, onUse, onAdd }: Props) {
  const uid = useId();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [copyNote, setCopyNote] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    setLoad({ kind: "loading" });
    try {
      const r = await listUserYarns();
      if (!alive.current) return;
      if (r.ok) setLoad({ kind: "ok", yarns: r.yarns });
      else if (r.code === "UNAUTHENTICATED") setLoad({ kind: "signed-out" });
      else setLoad({ kind: "error", message: r.error });
    } catch {
      if (alive.current) setLoad({ kind: "error", message: "No pudimos cargar tus lanas. Revisa tu conexión e intenta de nuevo." });
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);

  function run(saved: SavedYarn, add: boolean) {
    const keptNote = !add && Boolean(store.doc.yarns[index]?.note) && !(copyNote && saved.note);
    const problem = (add ? onAdd : onUse)(saved, copyNote);
    setMessage(problem ? { tone: "error", text: `${S.noValida} ${problem}` } : { tone: "ok", text: savedYarnUsedText(letter, keptNote) });
  }

  return (
    <div className="grid gap-2" data-testid="saved-yarns">
      <p className="text-sm text-tinta-suave">{S.misLanasIntro}</p>
      {load.kind === "loading" ? <p role="status" className="text-sm">{S.misLanasCargando}</p> : null}
      {load.kind === "signed-out" ? (
        <p className="text-sm font-bold" data-testid="saved-signed-out">
          {S.misLanasSinSesion} <Link href="/ingresar" className="underline">Ingresar</Link>
        </p>
      ) : null}
      {load.kind === "error" ? (
        <p role="alert" className="text-sm font-bold text-error">
          {load.message}
        </p>
      ) : null}
      {load.kind === "ok" ? (
        <>
          <div className="grid gap-0.5">
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={copyNote} onChange={(e) => setCopyNote(e.target.checked)} aria-describedby={`${uid}-note-help`} data-testid="copy-note" className="size-5 accent-marino" />
              {S.copiarNota(letter)}
            </label>
            <p id={`${uid}-note-help`} className="text-sm text-tinta-suave">
              {S.copiarNotaAyuda}
            </p>
          </div>
          {load.yarns.length === 0 ? <p className="text-sm">{S.misLanasVacia}</p> : null}
          <ul className="grid gap-1.5" aria-label={S.pestanaMisLanas}>
            {load.yarns.map((s) => {
              const desc = `${weightLabel(s.weight)}, ${describeComposition(s.composition)}, ${colorName(s.color)}`;
              const handlers = previewHandlers(store, index, { color: s.color, composition: s.composition });
              return (
                <li key={s.id} data-testid="saved-yarn" className="grid gap-1 rounded-xl border-2 border-linea p-2 text-sm" {...handlers}>
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="inline-block size-6 shrink-0 rounded border-2 border-marino bg-clip-padding" style={{ backgroundColor: s.color.hex }} />
                    <span className="font-bold">{weightLabel(s.weight)}</span>
                  </span>
                  <span>{describeComposition(s.composition)}</span>
                  <span className="text-tinta-suave">
                    {colorName(s.color)} ({s.color.hex.toUpperCase()})
                  </span>
                  {s.note ? <span className="text-tinta-suave">Nota: {s.note}</span> : null}
                  <span className="flex flex-wrap gap-2">
                    <button type="button" data-act="use-saved" aria-label={`${S.usarEn} ${letter}: ${desc}`} onClick={() => run(s, false)} className={BTN}>
                      {S.usarEn} {letter}
                    </button>
                    <button type="button" data-act="add-saved" disabled={!canAdd} aria-label={`${S.agregarNueva}: ${desc}`} onClick={() => run(s, true)} className={BTN}>
                      {S.agregarNueva}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm font-bold ${message.tone === "error" ? "text-error" : "text-exito"}`}>
          {message.text}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3 text-sm">
        <button type="button" onClick={() => void refresh()} className={BTN}>
          {S.misLanasActualizar}
        </button>
        <Link href="/lanas" className="py-1 font-bold underline">
          {S.misLanasIrA}
        </Link>
      </div>
    </div>
  );
}
