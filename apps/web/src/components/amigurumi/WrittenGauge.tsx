"use client";

import type { WrittenPattern } from "@loopitalab/pattern-core";
import { assumedGaugeOfPart } from "@/lib/amigurumi/assumed-gauge.ts";
import { useEffect, useId, useState } from "react";
import type { WrittenStore } from "@/lib/amigurumi/store.ts";
import { AMIGURUMI_TEXTS } from "@/lib/amigurumi/texts.ts";

const T = AMIGURUMI_TEXTS.muestra;
const FIELD = "w-24 rounded-xl border-2 border-borde bg-superficie px-3 py-1.5";
const BTN = "rounded-full border-2 border-marino px-3 py-1 text-sm font-bold hover:bg-marino hover:text-white";

/**
 * Muestra del amigurumi (puntos y vueltas en 10 cm, en punto bajo; ADR 0010, sección 1 y enmienda C-3). Sin muestra,
 * se dice cuál se supone (la de crochet para el grosor de la lana A, `suggestedGauge`) y que las medidas son un
 * supuesto (regla de oro 6). La muestra supuesta nunca se escribe en el documento.
 */
export function WrittenGauge({ store, doc }: { store: WrittenStore; doc: WrittenPattern }) {
  const uid = useId();
  const g = doc.gauge;
  const [st, setSt] = useState(g ? String(g.stitchesPer10cm) : "");
  const [rw, setRw] = useState(g ? String(g.rowsPer10cm) : "");
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    setSt(g ? String(g.stitchesPer10cm) : "");
    setRw(g ? String(g.rowsPer10cm) : "");
    setProblem(null);
  }, [g?.stitchesPer10cm, g?.rowsPer10cm]); // eslint-disable-line react-hooks/exhaustive-deps

  function commit(a: string, b: string) {
    if (a.trim() === "" && b.trim() === "") {
      setProblem(null);
      store.setGauge(null);
      return;
    }
    const x = Number(a.replace(",", "."));
    const y = Number(b.replace(",", "."));
    if (a.trim() === "" || b.trim() === "" || !Number.isFinite(x) || !Number.isFinite(y)) {
      setProblem(T.incompleta);
      return;
    }
    const r = store.setGauge({ stitchesPer10cm: x, rowsPer10cm: y });
    setProblem(r.ok ? null : (r.problems[0] ?? T.incompleta));
  }

  // Muestra supuesta de cada parte (lana inicial de la parte, `assumedGaugeOfPart`); si difieren, se muestran por parte.
  const perPart = !g ? doc.parts.map((p) => ({ name: p.name, ...assumedGaugeOfPart(doc, p) })) : [];
  const assumed = perPart[0];
  const differ = perPart.some((x) => x.stitchesPer10cm !== assumed?.stitchesPer10cm || x.rowsPer10cm !== assumed?.rowsPer10cm);
  return (
    <section aria-labelledby={`${uid}-t`} className="grid gap-2 rounded-2xl border-2 border-linea bg-superficie p-3" data-testid="written-gauge">
      <h2 id={`${uid}-t`} className="font-display text-base font-bold">
        {T.titulo}
      </h2>
      <div className="flex flex-wrap gap-4">
        <div className="grid gap-1">
          <label htmlFor={`${uid}-st`} className="text-sm font-bold">
            {T.puntos}
          </label>
          <input id={`${uid}-st`} type="text" inputMode="decimal" value={st} placeholder={assumed ? String(assumed.stitchesPer10cm) : undefined} onChange={(e) => (setSt(e.target.value), commit(e.target.value, rw))} className={FIELD} />
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${uid}-rw`} className="text-sm font-bold">
            {T.vueltas}
          </label>
          <input id={`${uid}-rw`} type="text" inputMode="decimal" value={rw} placeholder={assumed ? String(assumed.rowsPer10cm) : undefined} onChange={(e) => (setRw(e.target.value), commit(st, e.target.value))} className={FIELD} />
        </div>
      </div>
      {problem ? (
        <p role="alert" className="text-sm font-bold text-error">
          {problem}
        </p>
      ) : null}
      <p className="text-sm text-tinta-suave">{T.ayuda}</p>
      {g ? (
        <button type="button" onClick={() => store.setGauge(null)} className={`${BTN} justify-self-start`}>
          {T.quitar}
        </button>
      ) : assumed ? (
        <div className="grid gap-0.5 text-sm" data-testid="written-assumed-gauge">
          <p className="font-bold">{T.supuesta(assumed.stitchesPer10cm, assumed.rowsPer10cm)}</p>
          {differ ? (
            <ul className="list-disc pl-5">
              {perPart.map((x, i) => (
                <li key={i}>{T.supuestaPorParte(x.name, x.stitchesPer10cm, x.rowsPer10cm)}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-tinta-suave">{T.supuestaAyuda}</p>
        </div>
      ) : (
        <p className="text-sm text-tinta-suave">{T.supuestaAyuda}</p>
      )}
    </section>
  );
}
