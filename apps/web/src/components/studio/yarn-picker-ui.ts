import type { PointerEvent as ReactPointerEvent, FocusEvent as ReactFocusEvent } from "react";
import type { DocumentStore } from "@/lib/studio/store.ts";
import { previewControls, type YarnCandidate } from "./preview-controls.ts";

/** Estilos compartidos del selector de lanas (los mismos del panel de lanas). */
export const BTN = "rounded-full border-2 border-marino px-2.5 py-1 text-sm font-bold enabled:hover:bg-marino enabled:hover:text-white disabled:opacity-40";
export const FIELD = "rounded-xl border-2 border-borde bg-superficie px-3 py-1.5";

/**
 * Vista previa al pasar el cursor o el foco (ADR 0008 §3). Va directo a `previewControls(store)`: nada pasa por React
 * ni por el documento. No se previsualiza con el dedo (`pointerType === "touch"`: tocar elige) ni con el foco del
 * ratón (solo `:focus-visible`, o sea el teclado). Elegir llama `commit()` en el mismo manejador que la edición.
 */
export interface PreviewHandlers {
  onPointerEnter(e: ReactPointerEvent): void;
  onPointerLeave(): void;
  onFocus(e: ReactFocusEvent<HTMLElement>): void;
  onBlur(): void;
}

export function previewHandlers(store: DocumentStore, index: number, candidate: YarnCandidate): PreviewHandlers {
  const c = previewControls(store);
  return {
    onPointerEnter: (e) => {
      if (e.pointerType !== "touch") c.previewYarn(index, candidate);
    },
    onPointerLeave: () => c.previewYarn(index, null),
    onFocus: (e) => {
      if (e.currentTarget.matches(":focus-visible")) c.previewYarn(index, candidate);
    },
    onBlur: () => c.previewYarn(index, null),
  };
}

export function clearPreview(store: DocumentStore, index: number): void {
  previewControls(store).previewYarn(index, null);
}
