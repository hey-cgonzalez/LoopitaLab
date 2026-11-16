"use client";

import { useId } from "react";
import { AMIGURUMI_TEXTS } from "@/lib/amigurumi/texts.ts";
import { useModalDialog } from "./useModalDialog.ts";

const T = AMIGURUMI_TEXTS.bloques;

/**
 * Cambiar de texto a bloques con líneas sin leer (ADR 0011, sección 7): no se permite sin elegir. "Volver al texto"
 * (o Escape) las conserva; "Descartar las líneas sin leer" vuelve a escribir la parte como está en el diseño.
 * `<dialog>` modal, como el de los límites recomendados: lleva el foco adentro y lo devuelve al cerrar.
 */
export function UnreadTextDialog({ open, onBack, onDiscard }: { open: boolean; onBack(): void; onDiscard(): void }) {
  const ref = useModalDialog(open);
  const uid = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${uid}-t`}
      aria-describedby={`${uid}-d`}
      onCancel={(e) => {
        e.preventDefault();
        onBack();
      }}
      className="m-auto max-w-md rounded-2xl border-2 border-marino bg-superficie p-5 backdrop:bg-black/40"
      data-testid="unread-dialog"
    >
      {open ? (
        <div className="grid gap-4">
          <h2 id={`${uid}-t`} className="font-display text-lg font-bold">
            {T.sinLeerTitulo}
          </h2>
          <p id={`${uid}-d`}>{T.sinLeerTexto}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onBack} className="rounded-full bg-marino px-4 py-1.5 font-bold text-white hover:bg-indigo" data-dialog-initial data-testid="unread-back">
              {T.volverAlTexto}
            </button>
            <button type="button" onClick={onDiscard} className="rounded-full border-2 border-marino px-4 py-1.5 font-bold hover:bg-marino hover:text-white" data-testid="unread-discard">
              {T.descartar}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
