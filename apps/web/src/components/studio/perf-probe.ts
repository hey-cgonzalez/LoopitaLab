import { PerfRecorder, setActivePerf, type PerfSummary } from "@/lib/studio/perf.ts";

/*
 * Conexión del recolector `edit-to-paint` con el navegador (solo `/dev/estudio?perf=1`; T10).
 * Escucha las entradas en fase de captura (sin tocar los manejadores del estudio) y expone `window.__loopitaPerf`
 * para la medición automática por CDP y para mirarla a mano en la consola.
 */

export interface LoopitaPerfApi {
  summary(): PerfSummary;
  reset(): void;
  startFrames(): void;
  stopFrames(): ReturnType<PerfRecorder["stopFrames"]>;
  recorder: PerfRecorder;
}

declare global {
  interface Window {
    __loopitaPerf?: LoopitaPerfApi;
  }
}

const INPUTS = ["pointerdown", "pointermove", "keydown", "input", "change"] as const;

export function installPerfProbe(): () => void {
  const channel = new MessageChannel();
  const queue: (() => void)[] = [];
  channel.port1.onmessage = () => queue.shift()?.();
  const rec = new PerfRecorder({
    now: () => performance.now(),
    raf: (cb) => void requestAnimationFrame(() => cb()),
    postTask: (cb) => {
      queue.push(cb);
      channel.port2.postMessage(0);
    },
    measure: (name, start, end) => {
      try {
        performance.measure(name, { start, end });
      } catch {
        // Navegador sin `measure` con opciones: el número queda igual en el recolector.
      }
    },
  });
  const onInput = (e: Event) => {
    // Un movimiento sin botón apretado no edita: no reemplaza la entrada que abrió el trazo.
    if (e.type === "pointermove" && (e as PointerEvent).buttons === 0) return;
    rec.input(e.type, e.timeStamp);
  };
  for (const t of INPUTS) window.addEventListener(t, onInput, { capture: true, passive: true });
  // Verificación cruzada: lo que el navegador mide de cada entrada hasta el frame (Event Timing API).
  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === "pointerdown" || e.name === "pointermove" || e.name === "keydown" || e.name === "input") rec.eventTiming(e.name, e.duration);
    });
    observer.observe({ type: "event", durationThreshold: 16, buffered: false } as PerformanceObserverInit);
  } catch {
    observer = null; // navegador sin Event Timing: queda solo el recolector propio
  }
  setActivePerf(rec);
  window.__loopitaPerf = { summary: () => rec.summary(), reset: () => rec.reset(), startFrames: () => rec.startFrames(), stopFrames: () => rec.stopFrames(), recorder: rec };
  return () => {
    for (const t of INPUTS) window.removeEventListener(t, onInput, { capture: true });
    observer?.disconnect();
    setActivePerf(null);
    delete window.__loopitaPerf;
    channel.port1.close();
  };
}
