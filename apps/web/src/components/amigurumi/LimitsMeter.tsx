"use client";

import type { LimitUsage } from "@loopitalab/pattern-core";
import { useEffect, useId, useRef, useState } from "react";
import type { LimitGauge, LimitSummary } from "@/lib/amigurumi/limits.ts";
import { AMIGURUMI_TEXTS } from "@/lib/amigurumi/texts.ts";
import { useModalDialog } from "./useModalDialog.ts";

const T = AMIGURUMI_TEXTS.limites;
const A = AMIGURUMI_TEXTS.a11y;

/** Texto del tono (no solo el color, ADR 0011, sección 3b): desde el 80 % avisa, sobre el valor dice qué pasa. */
function toneText(g: LimitGauge): string | null {
  return g.tone === "over" ? T.sobre : g.tone === "near" ? T.cerca : null;
}

/** Una línea "N de M …" con su tono en texto. */
export function LimitLine({ gauge, text, testId }: { gauge: LimitGauge; text: string; testId: string }) {
  const tone = toneText(gauge);
  return (
    <p className={`text-sm ${gauge.tone === "ok" ? "text-tinta-suave" : "font-bold"}`} data-testid={testId} data-tone={gauge.tone}>
      {text}
      {tone ? <span> {tone}</span> : null}
    </p>
  );
}

/**
 * Medidor de puntos de la escena y ayuda de los límites recomendados, visibles desde el inicio (CA4-E12; decisión 5).
 * Los valores son de `recommendedLimitUsage` del motor.
 */
export function LimitsMeter({ limits }: { limits: LimitSummary }) {
  const uid = useId();
  const g = limits.byLimit.sceneStitches;
  const tone = toneText(g);
  // Anuncio `polite` solo cuando el estado CAMBIA (cerca, sobre, de vuelta en rango), nunca por cada punto agregado.
  const lastTone = useRef(g.tone);
  const [spoken, setSpoken] = useState("");
  useEffect(() => {
    if (lastTone.current === g.tone) return;
    lastTone.current = g.tone;
    setSpoken(toneText(g) ?? A.medidorVolvio);
  }, [g]);
  return (
    <section aria-label="Límites recomendados" className="grid gap-1.5 rounded-xl border-2 border-linea bg-superficie px-3 py-2" data-testid="limits-meter" data-tone={g.tone}>
      <p id={`${uid}-label`} className={`text-sm ${g.tone === "ok" ? "" : "font-bold"}`} data-testid="scene-stitches">
        {T.medidor(g.value)}
      </p>
      <div
        role="meter"
        aria-labelledby={`${uid}-label`}
        aria-valuemin={0}
        aria-valuemax={g.recommended}
        aria-valuenow={Math.min(g.value, g.recommended)}
        aria-valuetext={A.medidorValor(T.medidor(g.value), tone)}
        className="h-2.5 w-full overflow-hidden rounded-full border border-borde bg-fondo"
      >
        <div className={`h-full ${g.tone === "over" ? "bg-error" : g.tone === "near" ? "bg-mostaza" : "bg-marino"}`} style={{ width: `${Math.round(g.fill * 100)}%` }} />
      </div>
      {tone ? (
        <p className="text-sm font-bold" data-testid="scene-stitches-tone">
          <span aria-hidden="true">{g.tone === "over" ? "▲ " : "• "}</span>
          {tone}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only" data-testid="limits-announcement">
        {spoken}
      </p>
      <details className="text-sm" data-testid="limits-help">
        <summary className="cursor-pointer font-bold underline underline-offset-2">{T.ayudaTitulo}</summary>
        <div className="mt-1 grid gap-1 text-tinta-suave">
          {T.ayuda.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </details>
    </section>
  );
}

/**
 * Diálogo "Seguir igual" o "Cancelar" al superar un límite recomendado con una acción puntual (ADR 0011, sección 3b).
 * `<dialog>` modal: lleva el foco adentro, Esc cancela y el foco vuelve a donde estaba.
 */
export function LimitDialog({ usages, onConfirm, onCancel }: { usages: readonly LimitUsage[] | null; onConfirm(): void; onCancel(): void }) {
  const ref = useModalDialog(usages !== null && usages.length > 0);
  const uid = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${uid}-t`}
      aria-describedby={`${uid}-d`}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto max-w-md rounded-2xl border-2 border-marino bg-superficie p-5 backdrop:bg-black/40"
      data-testid="limit-dialog"
    >
      {usages && usages.length > 0 ? (
        <div className="grid gap-4">
          <h2 id={`${uid}-t`} className="font-display text-lg font-bold">
            {T.dialogoTitulo}
          </h2>
          <p id={`${uid}-d`} data-limit={usages.map((u) => u.limit).join(" ")}>
            {T.dialogoVarios(usages)}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-full border-2 border-marino px-4 py-1.5 font-bold hover:bg-marino hover:text-white" data-dialog-initial data-testid="limit-cancel">
              {T.cancelar}
            </button>
            <button type="button" onClick={onConfirm} className="rounded-full bg-marino px-4 py-1.5 font-bold text-white hover:bg-indigo">
              {T.seguir}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
