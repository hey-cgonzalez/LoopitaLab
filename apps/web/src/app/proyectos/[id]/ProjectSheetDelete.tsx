"use client";

import { browserProgressStorage, clearProjectProgress } from "@/lib/projects/progress-queue.ts";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { deleteProject } from "@/app/proyectos/actions";
import { PROJECT_TEXTS } from "@/lib/projects/texts.ts";

const T = PROJECT_TEXTS;

/** Borrar proyecto con confirmación (irreversible; se pierde el avance). */
export function ProjectSheetDelete({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      const r = await deleteProject(id);
      if (r.ok || r.code === "NOT_FOUND") {
        clearProjectProgress(browserProgressStorage(), id); // T17, B1: el avance local de un proyecto borrado no queda
        router.push("/proyectos");
        router.refresh();
        return;
      }
      setError(r.error);
    } catch {
      setError(T.tejer.sinRed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      {error ? (
        <p role="alert" className="font-bold text-error">
          {error}
        </p>
      ) : null}
      {confirming ? (
        <div role="group" aria-label={T.proyectos.confirmarBorradoDe(title)} className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-error p-4">
          <p className="min-w-0 flex-1 font-bold">{T.proyectos.borrarPregunta(title)}</p>
          <button type="button" onClick={onDelete} disabled={busy} className="min-h-12 rounded-full bg-error px-5 font-bold text-white hover:opacity-90 disabled:opacity-60">
            {T.proyectos.borrarConfirmar}
          </button>
          {/* Mismo manejo de foco que la ficha: empieza en «Cancelar» (irreversible) y vuelve a «Borrar» al cancelar. */}
          <button
            type="button"
            autoFocus
            onClick={() => {
              setConfirming(false);
              setTimeout(() => deleteButton.current?.focus(), 0);
            }}
            disabled={busy}
            className="min-h-12 rounded-full border-2 border-marino px-5 font-bold hover:bg-marino hover:text-white"
          >
            {T.tejer.cancelar}
          </button>
        </div>
      ) : (
        <button ref={deleteButton} type="button" onClick={() => setConfirming(true)} className="min-h-12 justify-self-start rounded-full border-2 border-error px-5 py-2 font-bold text-error hover:bg-error hover:text-white" data-testid="project-delete">
          {T.proyectos.borrar}
        </button>
      )}
    </div>
  );
}
