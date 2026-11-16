"use client";

import { useEffect, useRef } from "react";

/**
 * Un `<dialog>` modal con el foco bien cuidado (WCAG 2.4.3 y 3.2.1; T17 de la fase 4):
 *  - al abrir, el foco pasa al elemento con `data-dialog-initial` (la opción más segura) y, si no hay, al primero;
 *  - mientras está abierto, el foco no sale de él (lo garantiza `showModal`);
 *  - al cerrar, el foco vuelve al elemento que lo tenía antes de abrir, si sigue en la página.
 */
export function useModalDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      d.showModal();
      d.querySelector<HTMLElement>("[data-dialog-initial]")?.focus();
    } else if (!open && d.open) {
      d.close();
      const back = returnTo.current;
      returnTo.current = null;
      if (back && back.isConnected && !back.hasAttribute("disabled")) back.focus();
    }
  }, [open]);

  return ref;
}
