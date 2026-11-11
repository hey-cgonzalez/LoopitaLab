"use client";

import type { FiberShare } from "@loopitalab/pattern-core";
import { FIBERS } from "@loopitalab/yarn-catalog";
import { useId } from "react";
import { compositionSum, unusedFibers } from "@/lib/studio/yarn-edit.ts";
import { canAddFiberTo, fiberRowProblems } from "@/lib/studio/yarn-picker.ts";
import { STUDIO_TEXTS } from "@/lib/studio-texts.ts";
import { BTN, FIELD } from "./yarn-picker-ui.ts";

const T = STUDIO_TEXTS;

interface Props {
  composition: readonly FiberShare[];
  /** Cambio continuo (escribir un porcentaje): se agrupa en un paso de deshacer. */
  onChange(next: FiberShare[]): void;
  /** Cambio puntual (elegir fibra, agregar, quitar): un paso de deshacer. */
  onCommit(next: FiberShare[]): void;
}

/**
 * Composición de una lana: fibras del catálogo y porcentajes que deben sumar 100, con avisos por fibra (porcentaje
 * fuera de rango, fibra repetida o fuera del catálogo). Solo la composición válida entra al documento; mientras no lo
 * es, el panel lo dice y la lana conserva lo último válido.
 */
export function YarnCompositionEditor({ composition, onChange, onCommit }: Props) {
  const uid = useId();
  const sum = compositionSum(composition);
  const ok = Math.abs(sum - 100) <= 0.01;
  const free = unusedFibers(composition);
  const rows = fiberRowProblems(composition);
  const diff = Math.round((100 - sum) * 100) / 100;
  const fmt = (n: number) => n.toLocaleString("es-CL");

  return (
    <fieldset className="grid gap-2" data-testid="composition-editor" aria-describedby={`${uid}-sum`}>
      <legend className="font-bold">{T.lanas.composicion}</legend>
      {composition.map((f, k) => {
        const problems = rows[k] ?? [];
        const errId = `${uid}-row-${k}`;
        const hasError = problems.some((p) => p.level === "error");
        return (
          <div key={k} className="grid gap-1" data-testid="fiber-row">
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`${uid}-fiber-${k}`}>
                {T.panelLanas.fibra} {k + 1}
              </label>
              <select
                id={`${uid}-fiber-${k}`}
                value={f.fiber}
                onChange={(e) => onCommit(composition.map((x, j) => (j === k ? { ...x, fiber: e.target.value } : x)))}
                aria-describedby={problems.length > 0 ? errId : undefined}
                className={FIELD}
              >
                {!FIBERS.some((x) => x.id === f.fiber) ? <option value={f.fiber}>{f.fiber}</option> : null}
                {FIBERS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor={`${uid}-pct-${k}`}>
                {T.panelLanas.porcentaje} {k + 1}
              </label>
              <input
                id={`${uid}-pct-${k}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="any"
                value={Number.isFinite(f.percent) ? f.percent : ""}
                aria-invalid={hasError ? true : undefined}
                aria-describedby={problems.length > 0 ? errId : undefined}
                onChange={(e) => onChange(composition.map((x, j) => (j === k ? { ...x, percent: e.target.value === "" ? Number.NaN : Number(e.target.value) } : x)))}
                className={`${FIELD} w-24 aria-invalid:border-error`}
              />
              <span aria-hidden="true">%</span>
              <button type="button" onClick={() => onCommit(composition.filter((_, j) => j !== k))} disabled={composition.length <= 1} aria-label={`${T.panelLanas.quitarFibra} ${k + 1}`} className={BTN}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
            {problems.length > 0 ? (
              <ul id={errId} className="grid gap-0.5 text-sm" data-testid="fiber-problems">
                {problems.map((p) => (
                  <li key={p.message} className={p.level === "error" ? "font-bold text-error" : ""}>
                    <span aria-hidden="true">{p.level === "error" ? "× " : "! "}</span>
                    <span className="sr-only">{p.level === "error" ? "Error: " : `${STUDIO_TEXTS.selectorLanas.fibraAviso}: `}</span>
                    {p.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canAddFiberTo(composition)}
          onClick={() => onCommit([...composition, { fiber: free[0] as string, percent: Math.max(0, Math.round((100 - sum) * 100) / 100) }])}
          className={BTN}
        >
          {T.panelLanas.agregarFibra}
        </button>
        <p id={`${uid}-sum`} role="status" data-testid="composition-sum" className={`font-bold ${ok ? "text-exito" : "text-error"}`}>
          <span aria-hidden="true">{ok ? "✓ " : "× "}</span>
          {T.panelLanas.suma}: {fmt(sum)} %{ok ? "" : diff > 0 ? `. Faltan ${fmt(diff)} % para llegar a 100 %.` : `. Sobran ${fmt(-diff)} %. Deben sumar 100 %.`}
        </p>
      </div>
    </fieldset>
  );
}
