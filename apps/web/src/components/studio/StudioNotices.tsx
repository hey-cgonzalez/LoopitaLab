"use client";

import type { ChartPattern } from "@loopitalab/pattern-core";
import { useDeferredValue, useEffect, useMemo, useRef, type ReactNode } from "react";
import { noticeReserve } from "@/lib/studio/a11y.ts";
import { applicableLimitations } from "@/lib/studio/preview-plan.ts";
import { STUDIO_TEXTS } from "@/lib/studio-texts.ts";

const T = STUDIO_TEXTS;

/**
 * Aviso fijo de prototipo digital (CA-F10, regla de oro 8): visible en todo el estudio, sin botón para cerrarlo.
 * Mantiene `data-zone="prototype-notice"`.
 *
 * Es la última franja del estudio a pantalla completa: ocupa su propio espacio debajo de las columnas (que desplazan
 * por dentro), así nunca tapa contenido ni el foco (WCAG 2.4.11). `sticky` queda como respaldo cuando la ventana es
 * tan baja que la página sí desplaza; para ese caso su alto real se publica en `--aviso-alto`, que globals.css usa
 * como `scroll-padding-bottom` de la página.
 * `aside`: contenido extra a la derecha (los enlaces legales en escritorio, donde el pie del sitio no se ve).
 */
export function PrototypeNotice({ aside, sticky = true }: { aside?: ReactNode; sticky?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--aviso-alto", noticeReserve(el.getBoundingClientRect().height));
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--aviso-alto");
    };
  }, []);
  return (
    <div ref={ref} data-zone="prototype-notice" className={`${sticky ? "sticky bottom-0 z-10 " : ""}shrink-0 border-t-2 border-mostaza bg-superficie px-4 py-1.5 text-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <p className="min-w-0">
          <strong>{T.prototipo.etiqueta}.</strong> {T.prototipo.aviso}
        </p>
        {aside}
      </div>
    </div>
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
