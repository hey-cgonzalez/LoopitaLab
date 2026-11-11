"use client";

import type { ChartPattern } from "@loopitalab/pattern-core";
import { useEffect, useState } from "react";
import type { DocumentStore } from "@/lib/studio/store.ts";
import { LENGTH_SCOPE_NOTE, assumptionText, lengthLabel, swatchAdviceText, yarnLengthReport, type YarnLengthReport } from "@/lib/studio/metraje.ts";
import { paintGate } from "@/lib/studio/paint-gate.ts";
import { perfSpan } from "@/lib/studio/perf.ts";
import { STUDIO_TEXTS } from "@/lib/studio-texts.ts";
import { useSettledDoc } from "./useStoreSelector.ts";

const T = STUDIO_TEXTS.metraje;
/**
 * Quietud que se espera tras el último cambio del documento antes de recalcular. Es más larga que las pausas de una
 * persona que pinta o cambia repeticiones: mientras edita, el panel ni se vuelve a renderizar (medido en ADR 0008,
 * T9: recalcular entre ediciones sumaba 10 a 25 ms al p95 del círculo de 40.000 puntos con CPU ×4).
 */
const LENGTH_SETTLE_MS = 800;

type Idle = (cb: () => void) => () => void;

/** `requestIdleCallback` (con tope) si existe; si no, una tarea corta. Devuelve la cancelación. */
const whenIdle: Idle = (cb) => {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const h = window.requestIdleCallback(cb, { timeout: 500 });
    return () => window.cancelIdleCallback(h);
  }
  const h = setTimeout(cb, 0);
  return () => clearTimeout(h);
};

/**
 * Metraje por lana (sección del panel lateral). Fuera del camino caliente (regla de oro 7): usa el documento
 * "asentado" (`useSettledDoc`: no se vuelve a renderizar mientras se edita) y calcula dentro de `paintGate` y cuando el
 * navegador está ocioso. Los números salen de `pattern-core` y `yarn-catalog` (`yarnLengthReport`).
 */
export function YarnLengthPanel({ store }: { store: DocumentStore }) {
  const doc = useSettledDoc(store, LENGTH_SETTLE_MS);
  const [result, setResult] = useState<{ doc: ChartPattern; report: YarnLengthReport } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cancelIdle: (() => void) | null = null;
    paintGate.run(() => {
      if (cancelled) return;
      cancelIdle = whenIdle(() => {
        if (cancelled) return;
        const report = perfSpan("metraje", () => yarnLengthReport(doc));
        setResult({ doc, report });
      });
    });
    return () => {
      cancelled = true;
      cancelIdle?.();
    };
  }, [doc]);

  if (!result) return <p className="text-sm text-tinta-suave">{T.calculando}</p>;
  return <LengthView report={result.report} pending={result.doc !== doc} />;
}

/** Presentación pura del informe (también se prueba con render estático). */
export function LengthView({ report, pending = false }: { report: YarnLengthReport; pending?: boolean }) {
  const letters = report.rows.map((r) => r.letter);
  return (
    <div className="grid gap-2" data-testid="yarn-length" aria-busy={pending}>
      {pending ? <p className="text-sm text-tinta-suave">{T.calculando}</p> : null}
      {report.noGauge ? <p className="text-sm font-bold">{T.sinMuestra}</p> : null}
      <p className="text-sm text-tinta-suave">{T.seActualiza}</p>
      <ul className="grid gap-1.5" aria-label={T.lista}>
        {report.rows.map((r) => (
          <li key={r.id} data-testid="yarn-length-row" data-yarn={r.letter} className="grid gap-0.5 rounded-xl border-2 border-linea px-2.5 py-1.5 text-sm">
            <span className="flex items-center gap-2 font-bold">
              <span aria-hidden="true" className="inline-block size-4 shrink-0 rounded border-2 border-marino bg-clip-padding" style={{ backgroundColor: r.hex }} />
              {T.lana} {r.letter}
              <span className="font-normal text-tinta-suave">({r.colorName})</span>
            </span>
            <span className="text-tinta-suave">{r.stitches.toLocaleString("es-CL")} {r.stitches === 1 ? STUDIO_TEXTS.unidades.punto : STUDIO_TEXTS.unidades.puntos}</span>
            {r.estimate ? (
              <span data-testid="yarn-length-value" className="font-bold">
                {lengthLabel(r.estimate)}
              </span>
            ) : (
              <span data-testid="yarn-length-none" className="font-bold">
                {report.technique === "crochet" ? T.sinEstimacionCrochet : T.sinEstimacion}
              </span>
            )}
          </li>
        ))}
      </ul>
      {report.total ? (
        <p className="font-bold" data-testid="yarn-length-total">
          {T.total}: {lengthLabel(report.total)}
        </p>
      ) : null}
      {report.assumptions.length > 0 ? (
        <div className="grid gap-1 text-sm">
          <p className="font-bold">{T.supuestos}</p>
          <ul className="grid list-disc gap-1 pl-5" data-testid="yarn-length-assumptions">
            {report.assumptions.map((a) => (
              <li key={a} data-assumption={a}>
                {assumptionText(a)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.technique === "knit" ? (
        <>
          <p className="text-sm text-tinta-suave" data-testid="yarn-length-scope">
            {LENGTH_SCOPE_NOTE}
          </p>
          <p className="text-sm text-tinta-suave" data-testid="yarn-length-advice">
            {swatchAdviceText(letters)}
          </p>
        </>
      ) : (
        <p className="text-sm text-tinta-suave">{swatchAdviceText(letters)}</p>
      )}
    </div>
  );
}
