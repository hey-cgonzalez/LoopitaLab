"use client";

import type { ChartPattern } from "@loopitalab/pattern-core";
import { useDeferredValue, useMemo } from "react";
import { applicableLimitations } from "@/lib/studio/preview-plan.ts";
import { STUDIO_TEXTS } from "@/lib/studio-texts.ts";

const T = STUDIO_TEXTS;

/**
 * Aviso fijo de prototipo digital (CA-F10, regla de oro 8): visible en todo el estudio, sin botón para cerrarlo.
 * Mantiene `data-zone="prototype-notice"`.
 */
export function PrototypeNotice() {
  return (
    <>
      {/* WCAG 2.4.11: el aviso queda pegado abajo, en el flujo (al final de la página no tapa nada). Mientras se navega con
          teclado, el navegador deja este margen libre al desplazar el elemento enfocado. */}
      <style>{"html{scroll-padding-bottom:6rem}"}</style>
      <p data-zone="prototype-notice" className="sticky bottom-0 z-10 shrink-0 border-t-2 border-mostaza bg-superficie px-4 py-2 text-xs sm:text-sm">
        <span className="mx-auto block max-w-[1600px]">
          <strong>{T.prototipo.etiqueta}.</strong> {T.prototipo.aviso}
        </span>
      </p>
    </>
  );
}

/** Limitaciones de la vista previa que aplican a este diseño, junto a la vista (ADR 0004 E8; CA-F10, CA-F13). */
export function PreviewLimitations({ doc, distorted }: { doc: ChartPattern; distorted: boolean }) {
  const deferred = useDeferredValue(doc);
  const keys = useMemo(() => applicableLimitations(deferred, { distorted }), [deferred, distorted]);
  return (
    <section aria-label={T.limitaciones.titulo} data-testid="limitations" className="rounded-xl border-2 border-mostaza px-3 py-2">
      <p className="font-bold">{T.prototipo.etiqueta}</p>
      <p className="text-sm">{T.prototipo.ayudaMuestra}</p>
      <h3 className="mt-2 text-sm font-bold">{T.limitaciones.titulo}</h3>
      <ul className="mt-1 grid list-disc gap-1 pl-5 text-sm">
        {keys.map((k) => (
          <li key={k} data-limitation={k}>
            {T.limitaciones[k]}
          </li>
        ))}
      </ul>
    </section>
  );
}
