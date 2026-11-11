"use client";

import { weightLabel } from "@loopitalab/yarn-catalog";
import { useId, useMemo, useState } from "react";
import { weightChoiceInfo, weightOptions } from "@/lib/studio/yarn-picker.ts";
import { STUDIO_TEXTS } from "@/lib/studio-texts.ts";
import { FIELD } from "./yarn-picker-ui.ts";

const T = STUDIO_TEXTS;
const S = STUDIO_TEXTS.selectorLanas;

interface Props {
  weight: number;
  technique: "knit" | "crochet";
  /** No hay muestra en el documento: la de referencia es un supuesto visible (CA-F4). */
  gaugeAssumed: boolean;
  onPick(cat: number): void;
}

/**
 * Grosor de una lana: búsqueda por nombre o alias (`findWeights`, T1-8) y la lista de categorías CYC 0 a 7 con el
 * nombre en español y el inglés. Elegir sugiere agujas, crochet y la muestra de referencia (siempre "supuesto").
 */
export function YarnWeightPicker({ weight, technique, gaugeAssumed, onPick }: Props) {
  const uid = useId();
  const [query, setQuery] = useState("");
  const { options, message, filtered } = useMemo(() => weightOptions(query), [query]);
  const info = weightChoiceInfo(weight, technique);
  const tools = info.tools;
  const status = !filtered ? "" : options.length === 0 ? "" : options.length === 1 ? "1 grosor coincide." : `${options.length} grosores coinciden.`;

  return (
    <fieldset className="grid gap-2" data-testid="weight-picker">
      <legend className="font-bold">{T.lanas.grosor}</legend>
      <div className="grid gap-1">
        <label htmlFor={`${uid}-q`} className="text-sm font-bold">
          {S.buscarGrosor}
        </label>
        <input
          id={`${uid}-q`}
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-describedby={`${uid}-q-help ${uid}-q-res`}
          data-testid="weight-search"
          className={FIELD}
        />
        <p id={`${uid}-q-help`} className="text-sm text-tinta-suave">
          {S.buscarGrosorAyuda}
        </p>
        <div id={`${uid}-q-res`} aria-live="polite" className="empty:hidden">
          {message ? <p className="text-sm font-bold">{message}</p> : null}
          <p className="sr-only">{status}</p>
        </div>
      </div>
      <ul className="grid gap-1" aria-label={S.grosorLista} data-testid="weight-list">
        {options.map((o) => {
          const selected = o.cat === weight;
          return (
            <li key={o.cat}>
              <button
                type="button"
                aria-pressed={selected}
                data-weight={o.cat}
                onClick={() => onPick(o.cat)}
                className={`flex w-full flex-wrap items-center gap-x-2 rounded-xl border-2 px-2.5 py-1 text-left text-sm ${selected ? "border-marino bg-marino text-white" : "border-borde hover:border-marino"}`}
              >
                <span aria-hidden="true" className="w-4 text-center">
                  {selected ? "✓" : ""}
                </span>
                <span className="font-bold">
                  {o.cat} · {o.label}
                </span>
                {o.approximate ? (
                  <span className="text-xs">
                    ({S.aproximada}
                    {o.matched ? `: «${o.matched}»` : ""})
                  </span>
                ) : null}
                {selected ? <span className="sr-only">, {S.seleccionado}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-sm" data-testid="weight-chosen">
        <span className="font-bold">{weightLabel(weight)}</span>
        {tools ? (
          <>
            . {T.panelLanas.sugerencia}: {T.panelLanas.agujas} {tools.needlesMm}; {T.panelLanas.crochet} {tools.crochetMm}.
          </>
        ) : null}
      </p>
      {info.gauge ? (
        <p className="text-sm text-tinta-suave" data-testid="weight-gauge">
          {T.panelLanas.muestraCyc}: {info.gauge.stitchesPer10cm} puntos en 10 cm.{" "}
          {gaugeAssumed ? (
            <strong>
              {S.muestraSupuesta} ({S.muestraSupuestaAyuda}).
            </strong>
          ) : null}
        </p>
      ) : technique === "crochet" ? (
        <p className="text-sm text-tinta-suave">{T.muestra.supuestoCrochet}</p>
      ) : null}
      {info.lowConfidence ? (
        <p className="text-sm font-bold" data-testid="weight-low-confidence">
          {T.muestra.confianzaBaja}
        </p>
      ) : null}
      <details className="text-sm">
        <summary className="cursor-pointer py-1 font-bold underline-offset-4 hover:underline">{S.nombresAyudaTitulo}</summary>
        <p className="text-tinta-suave">{S.nombresAyuda}</p>
      </details>
    </fieldset>
  );
}
