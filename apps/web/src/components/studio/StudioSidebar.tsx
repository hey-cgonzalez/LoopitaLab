"use client";

import { EDIT_LIMITS, yarnLetter, type Chart, type ChartPattern, type Issue } from "@loopitalab/pattern-core";
import { useDeferredValue, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { assumedSampleNote, measureText, repeatsText, shapeName, shapingLine, STUDIO_TEXTS, stitchesPerRoundText, stitchTotalText } from "@/lib/studio-texts.ts";
import { groupIssueLines, type GroupContext } from "@/lib/studio/issue-groups.ts";
import { measures, validateForPanel, type IssueGroups } from "@/lib/studio/measures.ts";
import { paintGate } from "@/lib/studio/paint-gate.ts";
import type { DocumentStore } from "@/lib/studio/store.ts";

const T = STUDIO_TEXTS;
const FIELD = "w-24 rounded-xl border-2 border-linea bg-superficie px-3 py-1.5";
const BTN = "rounded-full border-2 border-marino px-4 py-1.5 text-sm font-bold enabled:hover:bg-marino enabled:hover:text-white disabled:opacity-40";
const SHAPES: Chart["renderAs"][] = ["flat", "tube", "circle", "yoke"];
const SHAPE_HELP: Record<Chart["renderAs"], string> = {
  flat: T.formas.ayudaPlano,
  tube: T.formas.ayudaTubo,
  circle: T.formas.ayudaCirculo,
  yoke: T.formas.ayudaCanesu,
};

function Section({ title, children, defaultOpen = true, testId }: { title: string; children: ReactNode; defaultOpen?: boolean; testId?: string }) {
  return (
    <details open={defaultOpen} className="group border-b-2 border-linea py-3 last:border-b-0" data-testid={testId}>
      <summary className="cursor-pointer font-display text-lg font-bold">{title}</summary>
      <div className="mt-3 grid gap-3">{children}</div>
    </details>
  );
}

/** Campo numérico entero con borrador: solo entra al documento cuando el valor es válido. */
function IntField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit(n: number): void }) {
  const id = useId();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const n = Number(text);
  const valid = text.trim() !== "" && Number.isInteger(n) && n >= min && n <= max;
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="font-bold">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        aria-invalid={valid ? undefined : true}
        aria-describedby={valid ? undefined : `${id}-err`}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isInteger(v) && v >= min && v <= max) onCommit(v);
        }}
        className={`${FIELD} aria-invalid:border-error`}
      />
      {valid ? null : (
        <p id={`${id}-err`} className="text-sm font-bold text-error">
          Escribe un número entero entre {min} y {max}.
        </p>
      )}
    </div>
  );
}

function Radios<V extends string>({ legend, name, value, options, onChange }: { legend: string; name: string; value: V; options: { value: V; label: string }[]; onChange(v: V): void }) {
  return (
    <fieldset className="grid gap-1">
      <legend className="font-bold">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-2">
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="size-5 accent-marino" />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

interface Props {
  store: DocumentStore;
  doc: ChartPattern;
  /** Contenido de la sección «Diseño» (nombre de versión, etiqueta de IA…). */
  design: ReactNode;
}

/** Panel lateral (zona `sidebar`): diseño, cuadrícula, muestra, medidas y revisión. */
export function StudioSidebar({ store, doc, design }: Props) {
  const uid = useId();
  // Medidas y revisión salen del camino del dibujo: se calculan con el valor diferido.
  const deferred = useDeferredValue(doc);
  const chart = doc.chart;
  const m = useMemo(() => measures(deferred), [deferred]);

  const [motifW, setMotifW] = useState(String(chart.width));
  const [motifH, setMotifH] = useState(String(chart.height));
  useEffect(() => setMotifW(String(chart.width)), [chart.width]);
  useEffect(() => setMotifH(String(chart.height)), [chart.height]);
  const mw = Number(motifW);
  const mh = Number(motifH);
  const sizeValid = [mw, mh].every((n) => Number.isInteger(n) && n >= 1 && n <= EDIT_LIMITS.maxMotifWidth);

  return (
    <aside aria-label={T.panel.titulo} data-zone="sidebar" className="rounded-2xl border-2 border-linea bg-superficie px-4 py-2">
      <Section title={T.panel.diseno} testId="section-design">
        {design}
      </Section>

      <Section title={T.panel.cuadricula} testId="section-grid">
        <p className="text-sm text-tinta-suave">{repeatsText(chart.repeat.x, chart.repeat.y)}</p>
        <div className="flex flex-wrap gap-4">
          <IntField label={T.repeticiones.ancho} value={chart.repeat.x} min={1} max={EDIT_LIMITS.maxRepeat} onCommit={(x) => store.dispatch({ type: "repeat", x, y: store.doc.chart.repeat.y })} />
          <IntField label={T.repeticiones.alto} value={chart.repeat.y} min={1} max={EDIT_LIMITS.maxRepeat} onCommit={(y) => store.dispatch({ type: "repeat", x: store.doc.chart.repeat.x, y })} />
        </div>
        <p className="text-sm text-tinta-suave">{T.repeticiones.ayuda}</p>

        <Radios
          legend={T.formas.titulo}
          name={`${uid}-shape`}
          value={chart.renderAs}
          options={SHAPES.map((s) => ({ value: s, label: shapeName(s) }))}
          onChange={(renderAs) => store.dispatch({ type: "setShape", renderAs })}
        />
        <p className="text-sm text-tinta-suave">{SHAPE_HELP[chart.renderAs]}</p>
        {chart.renderAs === "circle" ? <p className="text-sm text-tinta-suave">{T.panel.repeticionesRango}</p> : null}

        <Radios
          legend={T.tejido.titulo}
          name={`${uid}-worked`}
          value={chart.workedIn}
          options={[
            { value: "rounds", label: T.tejido.rounds },
            { value: "rows", label: T.tejido.rows },
          ]}
          onChange={(workedIn) => store.dispatch({ type: "setWorkedIn", workedIn })}
        />
        <p className="text-sm text-tinta-suave">{chart.workedIn === "rounds" ? T.tejido.ayudaRedondo : T.tejido.ayudaIdaYVuelta}</p>

        <Radios
          legend={T.direccion.titulo}
          name={`${uid}-dir`}
          value={chart.direction}
          options={[
            { value: "bottom_up", label: T.direccion.bottom_up },
            { value: "top_down", label: T.direccion.top_down },
          ]}
          onChange={(direction) => store.dispatch({ type: "setDirection", direction })}
        />
        <p className="text-sm text-tinta-suave">{chart.direction === "bottom_up" ? T.direccion.ayudaBottomUp : T.direccion.ayudaTopDown}</p>

        <fieldset className="grid gap-2">
          <legend className="font-bold">{T.panel.motivoTamano}</legend>
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-1">
              <label htmlFor={`${uid}-mw`}>{T.panel.puntosMotivo}</label>
              <input id={`${uid}-mw`} type="number" inputMode="numeric" min={1} max={EDIT_LIMITS.maxMotifWidth} value={motifW} onChange={(e) => setMotifW(e.target.value)} className={FIELD} />
            </div>
            <div className="grid gap-1">
              <label htmlFor={`${uid}-mh`}>{T.panel.filasMotivo}</label>
              <input id={`${uid}-mh`} type="number" inputMode="numeric" min={1} max={EDIT_LIMITS.maxMotifHeight} value={motifH} onChange={(e) => setMotifH(e.target.value)} className={FIELD} />
            </div>
            <button type="button" disabled={!sizeValid || (mw === chart.width && mh === chart.height)} onClick={() => store.dispatch({ type: "resize", width: mw, height: mh, anchor: "bottom_left", fill: 0 })} className={BTN}>
              {T.panel.aplicarTamano}
            </button>
          </div>
          <p className="text-sm text-tinta-suave">{T.panel.tamanoAyuda}</p>
        </fieldset>
      </Section>

      <Section title={T.panel.muestraSeccion} testId="section-gauge">
        <GaugeFields store={store} doc={doc} m={m} />
      </Section>

      <Section title={T.panel.medidasSeccion} testId="section-measures">
        <MeasuresView doc={deferred} m={m} />
      </Section>

      <Section title={T.panel.validacionSeccion} testId="section-validation">
        <ValidationList doc={doc} />
      </Section>
    </aside>
  );
}

function GaugeFields({ store, doc, m }: { store: DocumentStore; doc: ChartPattern; m: ReturnType<typeof measures> }) {
  const uid = useId();
  const g = doc.gauge;
  const [st, setSt] = useState(g ? String(g.stitchesPer10cm) : "");
  const [rw, setRw] = useState(g ? String(g.rowsPer10cm) : "");
  const [problems, setProblems] = useState<string[]>([]);
  // Deshacer, rehacer o recuperar cambian la muestra desde fuera: el campo la sigue.
  useEffect(() => {
    setSt(g ? String(g.stitchesPer10cm) : "");
    setRw(g ? String(g.rowsPer10cm) : "");
    setProblems([]);
  }, [g?.stitchesPer10cm, g?.rowsPer10cm]); // eslint-disable-line react-hooks/exhaustive-deps

  function commit(nextSt: string, nextRw: string) {
    const bothEmpty = nextSt.trim() === "" && nextRw.trim() === "";
    if (bothEmpty) {
      setProblems([]);
      store.setGauge(null);
      return;
    }
    const a = Number(nextSt.replace(",", "."));
    const b = Number(nextRw.replace(",", "."));
    if (nextSt.trim() === "" || nextRw.trim() === "" || !Number.isFinite(a) || !Number.isFinite(b)) {
      setProblems(["Escribe los puntos y las filas en 10 cm."]);
      return;
    }
    const r = store.setGauge({ stitchesPer10cm: a, rowsPer10cm: b });
    setProblems(r.ok ? [] : r.problems);
  }

  const assumed = m.gauge?.assumed ? m.gauge : null;
  return (
    <>
      <div className="flex flex-wrap gap-4">
        <div className="grid gap-1">
          <label htmlFor={`${uid}-st`} className="font-bold">
            {T.panel.puntosEn10}
          </label>
          <input id={`${uid}-st`} type="text" inputMode="decimal" value={st} placeholder={assumed ? String(assumed.gauge.stitchesPer10cm) : undefined} onChange={(e) => (setSt(e.target.value), commit(e.target.value, rw))} className={FIELD} />
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${uid}-rw`} className="font-bold">
            {T.panel.filasEn10}
          </label>
          <input id={`${uid}-rw`} type="text" inputMode="decimal" value={rw} placeholder={assumed ? String(assumed.gauge.rowsPer10cm) : undefined} onChange={(e) => (setRw(e.target.value), commit(st, e.target.value))} className={FIELD} />
        </div>
      </div>
      {problems.length > 0 ? (
        <p role="alert" className="text-sm font-bold text-error">
          {problems[0]}
        </p>
      ) : null}
      {assumed ? (
        <div className="grid gap-1 text-sm" data-testid="assumed-gauge">
          <p className="font-bold">
            {T.muestra.supuestoEtiqueta}: {assumed.gauge.stitchesPer10cm} puntos y {assumed.gauge.rowsPer10cm} filas en 10 cm
          </p>
          <p className="text-tinta-suave">{T.panel.muestraAyudaVacia}</p>
          <p className="text-tinta-suave">{assumedSampleNote(assumed.lowConfidence)}</p>
        </div>
      ) : (
        <div className="grid gap-2 text-sm">
          <p className="text-tinta-suave">{T.prototipo.ayudaMuestra}</p>
          <button type="button" onClick={() => store.setGauge(null)} className={`${BTN} justify-self-start`}>
            {T.muestra.usarSupuesta}
          </button>
        </div>
      )}
    </>
  );
}

function MeasuresView({ doc, m }: { doc: ChartPattern; m: ReturnType<typeof measures> }) {
  const assumed = m.gauge?.assumed ?? false;
  const label = m.dims?.widthIsCircumference ? "circunferencia" : "ancho";
  return (
    <div className="grid gap-2" data-testid="measures">
      {m.dims ? (
        <>
          <p>{measureText(label, m.dims.widthCm, assumed)}</p>
          <p>{measureText("alto", m.dims.heightCm, assumed)}</p>
        </>
      ) : (
        <>
          <p>
            {T.medidas.ancho}: {T.panel.sinMedidas}
          </p>
          <p>
            {T.medidas.alto}: {T.panel.sinMedidas}
          </p>
          {m.total === 0 ? <p className="text-sm text-tinta-suave">{T.panel.sinPuntos}</p> : null}
        </>
      )}
      {m.dims?.widthIsCircumference ? <p className="text-sm text-tinta-suave">{T.medidas.ayudaCircunferencia}</p> : null}
      {assumed ? <p className="text-sm text-tinta-suave">{T.medidas.ayudaSupuesto}</p> : null}
      <p className="font-bold" data-testid="stitch-total">
        {T.medidas.total}: {m.total === 0 ? T.panel.sinMedidas : stitchTotalText(m.total)}
      </p>
      {m.rounds && m.total > 0 ? (
        <div>
          <h3 className="font-bold">{T.medidas.porVuelta}</h3>
          <ol className="mt-1 max-h-48 overflow-auto rounded-lg border-2 border-linea p-2 text-sm" data-testid="round-counts">
            {m.rounds.shaping
              .filter((r, i) => i === 0 || r.change !== 0 || i === m.rounds!.shaping.length - 1)
              .map((r) => (
                <li key={r.row}>{r.row === 0 ? `${T.unidades.vuelta} 1: ${stitchesPerRoundText(r.stitches)}` : shapingLine(r.row + 1, r.stitches, r.change, r.perRepeat)}</li>
              ))}
          </ol>
          <p className="mt-1 text-sm text-tinta-suave">{T.disminuciones.tipoPendiente}</p>
        </div>
      ) : null}
      <p className="sr-only">{doc.title}</p>
    </div>
  );
}

function groupCtx(doc: ChartPattern): GroupContext {
  return {
    workedIn: doc.chart.workedIn,
    yarnLabel: (i) => {
      const y = doc.yarns[i];
      return `la lana ${yarnLetter(i)}${y?.color?.hex ? ` (${y.color.hex.toUpperCase()})` : ""}`;
    },
  };
}

const VALIDATION_DEBOUNCE_MS = 300;

/** Revisión del diseño. Corre diferida (300 ms después del último cambio): nunca entre la edición y el dibujo (CA-P7). */
function ValidationList({ doc }: { doc: ChartPattern }) {
  const [result, setResult] = useState<{ doc: ChartPattern; groups: IssueGroups } | null>(null);
  useEffect(() => {
    // paintGate: si hay una edición en vuelo, la revisión espera a que se pinte (CA-P7).
    let cancelled = false;
    const t = setTimeout(
      () => paintGate.run(() => {
        if (!cancelled) setResult({ doc, groups: validateForPanel(doc) });
      }),
      VALIDATION_DEBOUNCE_MS,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [doc]);

  if (!result) return <p className="text-sm text-tinta-suave">{T.panel.revisando}</p>;
  const g = result.groups;
  const pending = result.doc !== doc;
  const ctx = groupCtx(result.doc);
  const empty = g.cannotKnit.length + g.cannotSave.length + g.warnings.length + g.info.length === 0;
  return (
    <div className="grid gap-3" data-testid="validation" aria-busy={pending}>
      {pending ? <p className="text-sm text-tinta-suave">{T.panel.revisando}</p> : null}
      {empty && !pending ? <p className="text-exito">{T.panel.todoBien}</p> : null}
      <IssueList title={T.validacion.impideTejer} help={T.validacion.impideTejerAyuda} issues={g.cannotKnit} ctx={ctx} tone="error" testId="issues-cannot-knit" />
      <IssueList title={T.validacion.impideGuardar} issues={g.cannotSave} ctx={ctx} tone="error" testId="issues-cannot-save" />
      <IssueList title={T.validacion.advertencias} issues={g.warnings} ctx={ctx} tone="warn" testId="issues-warnings" />
      <IssueList title={T.validacion.informacion} issues={g.info} ctx={ctx} tone="info" testId="issues-info" />
    </div>
  );
}

const ISSUE_MARK = { error: "×", warn: "!", info: "i" } as const;

function IssueList({ title, help, issues, tone, testId, ctx }: { title: string; help?: string; issues: Issue[]; tone: keyof typeof ISSUE_MARK; testId: string; ctx: GroupContext }) {
  const lines = useMemo(() => groupIssueLines(issues, ctx), [issues, ctx]);
  if (issues.length === 0) return null;
  return (
    <section aria-label={title} data-testid={testId}>
      <h3 className={`font-bold ${tone === "error" ? "text-error" : ""}`}>
        <span aria-hidden="true" className="mr-1.5 inline-block w-4 text-center">
          {ISSUE_MARK[tone]}
        </span>
        {title} ({issues.length})
      </h3>
      {help ? <p className="text-sm text-tinta-suave">{help}</p> : null}
      <ul className="mt-1 grid list-disc gap-2 pl-5 text-sm">
        {lines.map((l) => (
          <li key={l.key} data-issue-code={l.code}>
            {l.text}
            {l.count > 1 ? (
              <details className="mt-1">
                <summary className="cursor-pointer font-bold">
                  {T.validacion.verDetalle} ({l.count})
                </summary>
                <ul className="mt-1 grid list-disc gap-1 pl-5">
                  {l.details.slice(0, 100).map((i, k) => (
                    <li key={`${i.path}-${k}`}>{i.message}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
