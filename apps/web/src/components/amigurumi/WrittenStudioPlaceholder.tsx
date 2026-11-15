"use client";

import type { Issue, WrittenPattern } from "@loopitalab/pattern-core";
import Link from "next/link";
import { useMemo } from "react";
import { writtenIssueMessage } from "@/lib/designs/messages.ts";
import { PreviewControls } from "@/components/studio/preview-controls.ts";
import { AmigurumiViewerLoader } from "./AmigurumiViewerLoader.tsx";

/** Aviso de la decisión 8 de la fase 4 ("Tejer" amigurumi llega en la fase 6). */
export const KNIT_WRITTEN_NOTICE = "Seguir un amigurumi punto a punto llega en una próxima versión.";

/**
 * Marcador de lugar del estudio amigurumi (T13). El estudio real (almacén, editor de texto, bloques) es T14: aquí
 * solo se muestra el título, el estado de borrador y el visor 3D de solo lectura sobre el documento guardado.
 */
export function WrittenStudioPlaceholder({ document, issues }: { document: WrittenPattern; issues: Issue[] }) {
  // Fuente fija (el documento no cambia en este marcador): el visor la lee con `useSyncExternalStore`.
  const source = useMemo(() => ({ getSnapshot: () => document, subscribe: () => () => undefined }), [document]);
  const controls = useMemo(() => new PreviewControls(null), []);
  const errors = issues.filter((i) => i.severity === "error");

  return (
    <main className="mx-auto grid w-full max-w-5xl content-start gap-5 px-4 py-6 sm:px-6 lg:py-8" data-testid="written-studio">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl" data-testid="written-title">
          {document.title}
        </h1>
        <p className="mt-1 text-tinta-suave">Amigurumi (crochet, escrito). El estudio para editarlo llega pronto: por ahora puedes verlo.</p>
      </div>

      {errors.length > 0 ? (
        <section role="status" className="grid gap-2 rounded-2xl border-2 border-mostaza px-4 py-3" data-testid="written-draft">
          <h2 className="font-display text-xl font-semibold">Borrador con vueltas que no cuadran</h2>
          <p>Está guardado, pero no se puede tejer hasta corregirlo.</p>
          <ul className="list-disc pl-6">
            {errors.slice(0, 8).map((i, k) => (
              <li key={`${i.code}-${i.path}-${k}`}>{writtenIssueMessage(i)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="rounded-2xl border-2 border-linea px-4 py-3 text-tinta-suave" data-testid="knit-written-notice">
        {KNIT_WRITTEN_NOTICE}
      </p>

      <AmigurumiViewerLoader source={source} controls={controls} />

      <p className="text-sm text-tinta-suave">La vista 3D es una aproximación: teje una muestra para comprobar la medida y las proporciones.</p>
      <p>
        <Link href="/disenos" className="underline underline-offset-4">
          Volver a Mis diseños
        </Link>
      </p>
    </main>
  );
}
