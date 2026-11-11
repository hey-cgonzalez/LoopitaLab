"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { clampPointer, nextRepeat, nextRow, planChart, position, prevRepeat, prevRow, stepAt, type ChartPointer } from "@loopitalab/follow";
import type { ChartPattern, Issue } from "@loopitalab/pattern-core";
import { loadProject, saveProgress, setProjectStatus } from "@/app/proyectos/actions";
import { LegalLinks } from "@/components/SiteFooter";
import { isTextTarget, knitKeyAction, type KnitKeyAction } from "@/lib/projects/knit-keys.ts";
import { ProgressQueue, type ProgressStorage } from "@/lib/projects/progress-queue.ts";
import { PROJECT_TEXTS, conflictQuestionText, positionText, rowAnnouncement } from "@/lib/projects/texts.ts";
import type { LoadedProject } from "@/lib/projects/types.ts";
import { readWakeLockPreference, requestWakeLock, wakeLockSupported, writeWakeLockPreference, type WakeLockSentinelLike } from "@/lib/projects/wake-lock.ts";
import { DocumentStore } from "@/lib/studio/store.ts";
import { PreviewPane } from "../studio/PreviewPane";
import { PrototypeNotice } from "../studio/StudioNotices";
import { KnitChart } from "./KnitChart";
import { KnitRowCard } from "./KnitRowCard";
import { ProgressStatusView } from "./ProgressStatusView";

const T = PROJECT_TEXTS.tejiendo;

export interface KnitScreenProps {
  project: LoadedProject;
  document: ChartPattern;
  valid: boolean;
  issues: Issue[];
  mirror: boolean;
  pointer: ChartPointer;
  progressUpdatedAt: string | null;
  newerVersionAvailable: boolean;
  ownerId: string;
}

function localStorageOrNull(): ProgressStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const BIG = "min-h-16 flex-1 rounded-2xl px-4 text-xl font-bold disabled:opacity-40";
const MID = "min-h-12 flex-1 rounded-full border-2 border-marino px-3 font-bold enabled:hover:bg-marino enabled:hover:text-white disabled:opacity-40";

/**
 * Pantalla "Tejiendo" (T12; ADR 0007 y 0009). La secuencia sale de `follow` (`planChart` sobre la versión fijada con
 * el espejo de la cuenta): aquí no se cuenta nada. El puntero es optimista (la fila cambia al instante) y se guarda con
 * la cola local (`ProgressQueue`): debounce, reintentos, conflicto explícito y `VERSION_CHANGED` con recarga.
 * Usable con una mano: botones grandes, teclado y pasapáginas Bluetooth (`knit-keys.ts`), pantalla encendida
 * (Wake Lock) por defecto con interruptor. La fila actual se resalta en el gráfico (`KnitChart`) y en la vista previa
 * (`PreviewPane` → `setHighlightRow`, medición `row-to-paint`).
 */
export function KnitScreen(props: KnitScreenProps) {
  const { project, document: doc, mirror, ownerId } = props;
  const plan = useMemo(() => planChart(doc, { mirror }), [doc, mirror]);
  const [pointer, setPointer] = useState<ChartPointer>(() => clampPointer(plan, props.pointer));
  const [store] = useState(() => new DocumentStore(doc));
  const [queue] = useState(
    () =>
      new ProgressQueue({
        projectId: project.id,
        ownerId,
        versionId: project.versionId,
        initialPointer: clampPointer(plan, props.pointer),
        initialUpdatedAt: props.progressUpdatedAt,
        save: saveProgress,
        storage: localStorageOrNull(),
      }),
  );
  const queueState = useSyncExternalStore(queue.subscribe, queue.getState, queue.getState);
  const [announce, setAnnounce] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [wakeOn, setWakeOn] = useState(true);
  const [wakeSupported, setWakeSupported] = useState(true);
  const sentinel = useRef<WakeLockSentinelLike | null>(null);
  const uid = useId();
  const nextButton = useRef<HTMLButtonElement>(null);

  const pos = useMemo(() => position(plan, pointer), [plan, pointer]);
  const step = pos.step;
  const lastRowStitches = useMemo(() => stepAt(plan, plan.totalRows - 1)?.stitches ?? null, [plan]);

  // ---------------------------------------------------------------- avanzar y retroceder
  const move = useCallback(
    (action: KnitKeyAction) => {
      setPointer((p) => {
        const q = action === "next-row" ? nextRow(plan, p) : action === "prev-row" ? prevRow(plan, p) : action === "next-repeat" ? nextRepeat(plan, p) : prevRepeat(plan, p);
        if (q.rowsDone === p.rowsDone && q.stitchesDone === p.stitchesDone) return p;
        queue.set(q);
        const s = stepAt(plan, q.rowsDone);
        setAnnounce(s ? rowAnnouncement(plan.workedIn, s.number, plan.totalRows, s.runs) : T.graficoTerminado);
        return q;
      });
    },
    [plan, queue],
  );

  // ---------------------------------------------------------------- pantalla encendida
  const reacquire = useCallback(async () => {
    if (!wakeOn || window.document.visibilityState !== "visible") return;
    if (sentinel.current && !sentinel.current.released) return;
    const s = await requestWakeLock(navigator);
    if (s) {
      sentinel.current = s;
      s.addEventListener?.("release", () => {
        if (sentinel.current === s) sentinel.current = null;
      });
    }
  }, [wakeOn]);

  // ---------------------------------------------------------------- cola del avance: ciclo de vida
  useEffect(() => {
    queue.onPointer = (p) => {
      const q = clampPointer(plan, p);
      setPointer(q);
      const s = stepAt(plan, q.rowsDone);
      setAnnounce(s ? rowAnnouncement(plan.workedIn, s.number, plan.totalRows, s.runs) : T.graficoTerminado);
    };
    queue.start();
    const onOnline = () => void queue.retryNow();
    const onHide = () => void queue.flushNow();
    const onVisibility = () => {
      if (window.document.visibilityState === "hidden") {
        void queue.flushNow();
        return;
      }
      void reacquire();
      // Al volver: si no hay nada pendiente, se relee el avance (otro dispositivo pudo avanzar). Con pendientes, la
      // escritura normal detecta el conflicto.
      if (queue.hasPending || queue.getState().kind !== "saved") return;
      void loadProject(project.id).then((r) => {
        if (!r.ok) return;
        if (r.project.versionId !== project.versionId) {
          setNotice(T.versionCambio);
          return;
        }
        if (queue.adoptServer(r.pointer, r.progressUpdatedAt)) setNotice(T.actualizadoDesdeOtro(positionText(plan.workedIn, plan.totalRows, clampPointer(plan, r.pointer))));
      });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", onHide);
    window.document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onHide);
      window.document.removeEventListener("visibilitychange", onVisibility);
      queue.stop();
      queue.onPointer = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, plan, project.id, project.versionId]);

  // El foco empieza en "Siguiente": un toque o Enter avanza sin buscar nada (usable con una mano).
  useEffect(() => {
    nextButton.current?.focus({ preventScroll: true });
  }, []);

  // Cuenta regresiva del reintento (solo mientras está sin conexión).
  useEffect(() => {
    if (queueState.kind !== "offline") return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [queueState]);

  // ---------------------------------------------------------------- teclado y pasapáginas
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return; // mantener una tecla apretada no debe recorrer el patrón
      const el = e.target as HTMLElement | null;
      if (isTextTarget(el?.tagName, el?.isContentEditable === true)) return;
      if (queueState.kind === "conflict" || queueState.kind === "version-changed") return;
      // Un botón con foco ya recibe Enter y Espacio como clic: no se duplica el avance.
      if ((e.key === "Enter" || e.key === " ") && el && (el.tagName === "BUTTON" || el.tagName === "A" || el.tagName === "SUMMARY")) return;
      const a = knitKeyAction(e.key, { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey });
      if (!a) return;
      e.preventDefault();
      move(a);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, queueState.kind]);

  useEffect(() => {
    setWakeSupported(wakeLockSupported(navigator));
    setWakeOn(readWakeLockPreference(localStorageOrNull()));
  }, []);

  useEffect(() => {
    if (wakeOn) void reacquire();
    else {
      void sentinel.current?.release().catch(() => undefined);
      sentinel.current = null;
    }
    return () => {
      void sentinel.current?.release().catch(() => undefined);
      sentinel.current = null;
    };
  }, [wakeOn, reacquire]);

  function toggleWake() {
    const next = !wakeOn;
    setWakeOn(next);
    writeWakeLockPreference(localStorageOrNull(), next);
  }

  // ---------------------------------------------------------------- vista
  const conflict = queueState.kind === "conflict" ? queueState : null;
  const finished = pos.finished;
  const canRepeat = plan.repeatX > 1;

  return (
    <div data-studio data-knit className="flex min-h-[30rem] min-w-0 flex-1 flex-col">
      <div className="shrink-0 border-b-2 border-linea bg-superficie">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 sm:px-4">
          <Link href={`/proyectos/${project.id}`} className="py-1 text-sm underline underline-offset-4">
            {T.volver}
          </Link>
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold">
            {T.titulo}: {project.title}
          </h1>
          <ProgressStatusView state={queueState} now={now} />
          <button
            type="button"
            role="switch"
            aria-checked={wakeOn}
            aria-describedby={`${uid}-wake`}
            onClick={toggleWake}
            disabled={!wakeSupported}
            className={`min-h-10 rounded-full border-2 border-marino px-3 text-sm font-bold disabled:opacity-50 ${wakeOn ? "bg-marino text-white" : ""}`}
            data-testid="wake-lock-toggle"
          >
            {T.pantallaEncendida}
          </button>
          <span id={`${uid}-wake`} className="sr-only">
            {wakeSupported ? T.pantallaEncendidaAyuda : T.pantallaNoSoportada}
          </span>
        </div>
      </div>

      {queueState.kind === "version-changed" || notice === T.versionCambio ? (
        <section role="alert" className="shrink-0 border-b-2 border-error bg-superficie px-4 py-2">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1">{queueState.kind === "version-changed" ? queueState.message : T.versionCambio}</p>
            <button type="button" onClick={() => window.location.reload()} className="min-h-12 rounded-full bg-marino px-5 font-bold text-white hover:bg-indigo">
              {T.recargar}
            </button>
          </div>
        </section>
      ) : null}

      {conflict ? (
        <section role="alertdialog" aria-labelledby={`${uid}-conflict`} aria-describedby={`${uid}-conflict-q`} className="shrink-0 border-b-2 border-error bg-superficie px-4 py-3" data-testid="progress-conflict">
          <h2 id={`${uid}-conflict`} className="font-bold text-error">
            {PROJECT_TEXTS.avance.conflicto}
          </h2>
          <p id={`${uid}-conflict-q`} className="mt-1">
            {conflictQuestionText(conflict.workedIn ?? plan.workedIn, conflict.totalRows ?? plan.totalRows, conflict.theirs, conflict.theirsAt, conflict.yours, now)}
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <button type="button" onClick={() => void queue.keepMine()} className="min-h-12 rounded-full bg-marino px-5 font-bold text-white hover:bg-indigo" data-testid="conflict-keep-mine">
              {PROJECT_TEXTS.avance.seguirAqui}
            </button>
            <button type="button" onClick={() => queue.takeTheirs()} className="min-h-12 rounded-full border-2 border-marino px-5 font-bold hover:bg-marino hover:text-white" data-testid="conflict-take-theirs">
              {PROJECT_TEXTS.avance.seguirOtro}
            </button>
          </div>
        </section>
      ) : null}

      {notice && notice !== T.versionCambio ? (
        <p role="status" className="shrink-0 border-b-2 border-mostaza bg-superficie px-4 py-2" data-testid="knit-notice">
          {notice}
        </p>
      ) : null}

      {!props.valid ? (
        <p role="status" className="shrink-0 border-b-2 border-mostaza bg-superficie px-4 py-2 text-sm" data-testid="knit-invalid-version">
          {PROJECT_TEXTS.proyectos.versionNoValida}
        </p>
      ) : null}

      {props.newerVersionAvailable ? (
        <p className="shrink-0 border-b-2 border-linea bg-superficie px-4 py-1.5 text-sm">
          {PROJECT_TEXTS.proyectos.hayMasNueva}{" "}
          <Link href={`/proyectos/${project.id}`} className="underline underline-offset-4">
            {PROJECT_TEXTS.repin.boton}
          </Link>
        </p>
      ) : null}

      {/* Móvil y tableta: una columna que desplaza entera (nada se contrae: `shrink-0`). Escritorio: dos columnas que desplazan por dentro. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden" data-testid="knit-layout">
        <div className="flex min-w-0 shrink-0 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
          <div className="shrink-0">
            <KnitRowCard plan={plan} position={pos} pointer={pointer} yarns={doc.yarns} direction={doc.chart.direction} lastRowStitches={lastRowStitches} />
          </div>

          <div className="grid shrink-0 gap-2" role="group" aria-label="Avanzar en el patrón">
            <div className="flex gap-3">
              <button type="button" onClick={() => move("prev-row")} disabled={pos.rowsDone === 0 && pointer.stitchesDone === 0} className={`${BIG} border-2 border-marino enabled:hover:bg-marino enabled:hover:text-white`} data-testid="knit-prev">
                {T.anterior}
              </button>
              <button ref={nextButton} type="button" onClick={() => move("next-row")} disabled={finished} className={`${BIG} bg-marino text-white enabled:hover:bg-indigo`} data-testid="knit-next">
                {T.siguiente}
              </button>
            </div>
            {canRepeat ? (
              <div className="flex gap-3">
                <button type="button" onClick={() => move("prev-repeat")} disabled={pos.rowsDone === 0 && pointer.stitchesDone === 0} className={MID} data-testid="knit-prev-repeat">
                  {T.repeticionAnterior}
                </button>
                <button type="button" onClick={() => move("next-repeat")} disabled={finished} className={MID} data-testid="knit-next-repeat">
                  {T.repeticionSiguiente}
                </button>
              </div>
            ) : null}
            <p className="text-sm text-tinta-suave">{T.atajos}</p>
          </div>

          {finished && project.status !== "finished" ? (
            <form action={setProjectStatus} className="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border-2 border-linea bg-superficie p-3" data-testid="knit-finish-form">
              <input type="hidden" name="id" value={project.id} />
              <input type="hidden" name="status" value="finished" />
              <p className="min-w-0 flex-1 text-sm">{PROJECT_TEXTS.proyectos.terminadoPropuesta}</p>
              <button type="submit" className="min-h-12 rounded-full border-2 border-marino px-5 font-bold hover:bg-marino hover:text-white">
                {PROJECT_TEXTS.proyectos.marcarTerminado}
              </button>
            </form>
          ) : null}

          <section aria-label={T.grafico} className="flex min-h-96 shrink-0 flex-col rounded-2xl lg:flex-1 border-2 border-linea bg-superficie p-3">
            <h2 className="mb-2 font-display text-base font-bold">{T.grafico}</h2>
            <KnitChart chart={doc.chart} yarns={doc.yarns} mirror={mirror} highlightRow={step?.row ?? null} motifRow={step?.motifRow ?? null} repeat={pos.horizontalRepeat ? { xStart: pos.horizontalRepeat.xStart, xEnd: pos.horizontalRepeat.xEnd } : null} label={step ? `${T.grafico}: ${rowAnnouncement(plan.workedIn, step.number, plan.totalRows, step.runs)}` : `${T.grafico}: ${T.graficoTerminado}`} />
          </section>
        </div>
        <div className="flex min-h-[28rem] min-w-0 shrink-0 flex-col lg:min-h-0 lg:overflow-y-auto">
          <PreviewPane store={store} highlightRow={step?.row ?? null} />
        </div>
      </div>

      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="knit-announcement">
        {announce}
      </div>

      <PrototypeNotice aside={<LegalLinks />} />
    </div>
  );
}
