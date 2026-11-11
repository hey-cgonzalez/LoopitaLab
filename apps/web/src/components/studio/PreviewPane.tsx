"use client";

import { describeChart } from "@loopitalab/pattern-render";
import { PALETTE } from "@loopitalab/yarn-catalog";
import { panBy, zoomAt } from "@loopitalab/stitch-render";
import { memo, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { selectAssumedGauge, selectRenderAs } from "@/lib/studio/select.ts";
import type { DocumentStore } from "@/lib/studio/store.ts";
import { SLOW_PREVIEW_STITCHES, TOO_LARGE_PREVIEW_STITCHES } from "@/lib/studio/preview-plan.ts";
import { previewTooLargeText, slowPreviewText, STUDIO_TEXTS } from "@/lib/studio-texts.ts";
import { previewControls, type PreviewControls } from "./preview-controls.ts";
import { PreviewEngine, type EngineStatus } from "./preview-engine.ts";
import { PreviewLimitations } from "./StudioNotices.tsx";
import { useSettledDoc, useStoreSelector } from "./useStoreSelector.ts";

const T = STUDIO_TEXTS;
const BTN = "rounded-full border-2 border-marino px-3 py-1.5 text-sm font-bold hover:bg-marino hover:text-white";

const DESCRIBE_DEBOUNCE_MS = 300;

/** Descripción del motivo para lectores de pantalla: con el documento asentado, nunca entre la edición y el dibujo (CA-P7). */
function PreviewDescription({ store, id }: { store: DocumentStore; id: string }) {
  const doc = useSettledDoc(store, DESCRIBE_DEBOUNCE_MS);
  const text = useMemo(() => describeChart(doc, { paletteName: (pid) => PALETTE.find((c) => c.id === pid)?.nombre }), [doc]);
  return (
    <p id={id} className="sr-only">
      {text}
    </p>
  );
}

/** Limitaciones que aplican al diseño, con el documento asentado. */
const SettledLimitations = memo(function SettledLimitations({ store, distorted }: { store: DocumentStore; distorted: boolean }) {
  const doc = useSettledDoc(store, DESCRIBE_DEBOUNCE_MS);
  return <PreviewLimitations doc={doc} distorted={distorted} />;
});

/** 48 colores de la paleta y 2 personalizados: los 50 de CA3-P1. */
const BENCH_COLORS: readonly string[] = [...PALETTE.map((c) => c.hex), "#FF00AA", "#00C2A8"];
const BENCH_MIX = [
  { fiber: "lana", percent: 30 },
  { fiber: "mohair", percent: 70 },
];
const benchCandidate = (hex: string, i: number) => (i % 3 === 2 ? { color: { hex }, composition: BENCH_MIX } : { color: { hex } });

/**
 * Banco de medición (solo `/dev/estudio?perf=1`, herramienta de desarrollo, sin glosario): 50 muestras que llaman
 * `previewYarn` de la lana A al pasar el cursor o el foco (CA3-P1; una de cada tres también con otra composición, como
 * una lana guardada) y un botón que avanza la fila resaltada como el modo tejiendo (CA3-P3).
 */
function PreviewBench({ store, controls, engineRef }: { store: DocumentStore; controls: PreviewControls; engineRef: { current: PreviewEngine | null } }) {
  const advance = (d: number) => {
    const e = engineRef.current;
    if (!e) return;
    const c = store.doc.chart;
    const rows = c.height * c.repeat.y;
    const cur = e.highlightRow;
    e.setHighlightRow(cur === null ? (d > 0 ? 0 : rows - 1) : (cur + d + rows) % rows);
  };
  return (
    <div data-testid="preview-bench" className="rounded-xl border-2 border-dashed border-linea p-2 text-xs">
      <p className="font-bold">Banco de medición (desarrollo): hover-to-paint y row-to-paint</p>
      <div className="mt-1 flex flex-wrap gap-1" onPointerLeave={() => controls.previewYarn(0, null)}>
        {BENCH_COLORS.map((hex, i) => (
          <button
            key={`${hex}-${i}`}
            type="button"
            data-testid="bench-swatch"
            aria-label={`Probar ${hex} en la lana A`}
            className="size-5 rounded border border-marino"
            style={{ background: hex }}
            onPointerEnter={() => controls.previewYarn(0, benchCandidate(hex, i))}
            onFocus={() => controls.previewYarn(0, benchCandidate(hex, i))}
            onBlur={() => controls.previewYarn(0, null)}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-2">
        <button type="button" className={BTN} onClick={() => advance(-1)}>
          Fila anterior
        </button>
        <button type="button" data-testid="bench-row-next" className={BTN} onClick={() => advance(1)}>
          Fila siguiente
        </button>
      </div>
    </div>
  );
}

/**
 * Vista previa (zona `preview`). Monta el motor de `render-puntos` (`PreviewEngine`, ver su cabecera para el contrato)
 * y lo conecta directo al almacén (T10): una pincelada llega al canvas sin volver a renderizar este componente.
 * React solo lee la forma y si la muestra es supuesta (marcada).
 *
 * "Colores planos" y la vista previa al pasar el cursor son estado de la vista (`previewControls(store)`), no del
 * documento (ADR 0008 §3 y §4). `devBench`: banco de medición de `/dev/estudio?perf=1`.
 */
export function PreviewPane({ store, devBench = false }: { store: DocumentStore; devBench?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PreviewEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus>({ kind: "ok", slow: false, count: 0, distorted: false });
  const [rotation, setRotation] = useState(0);
  /** Dedo o lápiz: apagado, desplazan la página; encendido, mueven la vista previa (touch-action: none). */
  const [touchMove, setTouchMove] = useState(false);
  const uid = useId();
  const controls = previewControls(store);
  const flat = useSyncExternalStore(controls.subscribe, controls.getFlatColors, () => false);
  const renderAs = useStoreSelector(store, selectRenderAs);
  const assumed = useStoreSelector(store, selectAssumedGauge);

  // Monta y desmonta el motor (una vez).
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const engine = new PreviewEngine();
    engine.onStatus = setStatus;
    engine.attach(canvas);
    engineRef.current = engine;

    const ro = new ResizeObserver(() => engine.resize(host.clientWidth, host.clientHeight));
    ro.observe(host);
    engine.resize(host.clientWidth, host.clientHeight);
    const disconnect = engine.connect(store);
    const unbind = previewControls(store).bind(engine);

    // Rueda: zoom hacia el cursor. Arrastre: desplazar.
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = engine.renderer;
      if (!r) return;
      const rect = canvas.getBoundingClientRect();
      engine.markUserView();
      r.setView(zoomAt(r.getView(), Math.exp(-ev.deltaY * 0.0015), ev.clientX - rect.left, ev.clientY - rect.top));
      r.requestRender();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      unbind();
      disconnect();
      canvas.removeEventListener("wheel", onWheel);
      ro.disconnect();
      engine.detach();
      engineRef.current = null;
    };
  }, [store]);

  useEffect(() => engineRef.current?.setTubeRotation(rotation), [rotation]);

  const drag = useRef<{ x: number; y: number } | null>(null);
  const zoomBy = (f: number) => {
    const e = engineRef.current;
    const r = e?.renderer;
    const host = hostRef.current;
    if (!e || !r || !host) return;
    e.markUserView();
    r.setView(zoomAt(r.getView(), f, host.clientWidth / 2, host.clientHeight / 2));
    r.requestRender();
  };

  const isTube = renderAs === "tube" || renderAs === "yoke";
  const hidden = status.kind !== "ok";

  return (
    <section aria-label={T.vistaPrevia.titulo} data-zone="preview" className="flex min-h-full flex-col gap-3 rounded-2xl border-2 border-linea bg-superficie p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold">{T.vistaPrevia.titulo}</h2>
        <div role="group" aria-label={T.herramientas.zoom} className="flex gap-2">
          <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label={T.vistaPrevia.alejar} className={BTN}>
            <span aria-hidden="true">−</span>
          </button>
          <button type="button" onClick={() => zoomBy(1.25)} aria-label={T.vistaPrevia.acercar} className={BTN}>
            <span aria-hidden="true">+</span>
          </button>
          <button type="button" onClick={() => engineRef.current?.fit()} className={BTN}>
            {T.vistaPrevia.ajustar}
          </button>
        </div>
      </div>
      <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 [@media(any-pointer:coarse)]:flex">
        <button type="button" aria-pressed={touchMove} aria-describedby={`${uid}-touch`} onClick={() => setTouchMove((v) => !v)} className={`justify-self-start ${BTN} ${touchMove ? "bg-marino text-white" : ""}`}>
          {T.vistaPrevia.moverConDedo}
        </button>
        <details className="text-sm">
          <summary className="cursor-pointer py-1 font-bold underline-offset-4 hover:underline">{T.editor.dedoAyudaTitulo}</summary>
          <p id={`${uid}-touch`} className="text-tinta-suave">
            {T.vistaPrevia.moverConDedoAyuda}
          </p>
        </details>
      </div>
      {assumed ? (
        <p className="text-sm font-bold" data-testid="preview-assumed">
          {T.vistaPrevia.muestraSupuesta}
        </p>
      ) : null}
      <div ref={hostRef} className="relative min-h-64 flex-1 basis-0 overflow-hidden rounded-xl border-2 border-linea bg-[#EFE9DF]" data-testid="preview-host">
        <canvas
          ref={canvasRef}
          data-testid="preview-canvas"
          role="img"
          aria-label={T.accesibilidad.vistaPreviaEtiqueta}
          aria-describedby={`${uid}-desc`}
          // Con el modo apagado, el dedo desplaza la página (pan-y) y solo los arrastres horizontales mueven la vista.
          style={{ touchAction: touchMove ? "none" : "pan-y pinch-zoom", visibility: hidden ? "hidden" : "visible" }}
          className="absolute inset-0 size-full cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            const eng = engineRef.current;
            const r = eng?.renderer;
            if (!d || !eng || !r) return;
            eng.markUserView();
            r.setView(panBy(r.getView(), e.clientX - d.x, e.clientY - d.y));
            r.requestRender();
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        />
        {status.kind === "too-large" ? (
          <p role="alert" className="absolute inset-0 grid place-items-center p-6 text-center font-bold" data-testid="preview-too-large">
            {previewTooLargeText(TOO_LARGE_PREVIEW_STITCHES)}
          </p>
        ) : null}
        {status.kind === "error" ? (
          <p role="alert" className="absolute inset-0 grid place-items-center p-6 text-center font-bold text-error">
            {T.vistaPrevia.error}
          </p>
        ) : null}
      </div>
      <PreviewDescription store={store} id={`${uid}-desc`} />
      {status.kind === "ok" && status.slow ? (
        <p className="text-sm font-bold" data-testid="preview-slow">
          {slowPreviewText(SLOW_PREVIEW_STITCHES)}
        </p>
      ) : null}
      {isTube ? (
        <div className="flex items-center gap-3">
          <label htmlFor={`${uid}-rot`} className="font-bold">
            {T.vistaPrevia.rotacion}
          </label>
          <input id={`${uid}-rot`} type="range" min={0} max={Math.round(Math.PI * 2 * 100)} value={Math.round(rotation * 100)} onChange={(e) => setRotation(Number(e.target.value) / 100)} className="h-6 flex-1 accent-marino" />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" aria-pressed={flat} aria-describedby={`${uid}-flat`} data-testid="flat-colors" onClick={() => controls.setFlatColors(!flat)} className={`${BTN} ${flat ? "bg-marino text-white" : ""}`}>
          {T.vistaPrevia.coloresPlanos}
        </button>
        <p id={`${uid}-flat`} className="text-sm text-tinta-suave">
          {flat ? T.vistaPrevia.coloresPlanosAyuda : `${T.vistaPrevia.aspectoFibra} ${T.vistaPrevia.coloresPlanosAyuda}`}
        </p>
      </div>
      {devBench ? <PreviewBench store={store} controls={controls} engineRef={engineRef} /> : null}
      <SettledLimitations store={store} distorted={status.kind === "ok" && status.distorted} />
    </section>
  );
}
