import { addSpanSink } from "@/lib/studio/perf.ts";
import { ViewerPerfRecorder, setActiveViewerPerf, type InputOrigin, type ViewerPerfSummary } from "@/lib/amigurumi/viewer-perf.ts";

/*
 * Conexión del recolector del estudio amigurumi con el navegador (solo `/dev/amigurumi?perf=1`; T12 de la fase 4).
 * Escucha las entradas en fase de captura (sin tocar los manejadores del estudio), decide su origen por el elemento
 * (texto, bloques, lanas, "Colores planos") y expone `window.__loopitaViewerPerf` para las E2E y la consola.
 * Las validaciones del autoguardado (`perfSpan` del colorwork) también se registran, para CA4-P5.
 */

export interface LoopitaViewerPerfApi {
  summary(): ViewerPerfSummary;
  reset(): void;
  recorder: ViewerPerfRecorder;
}

declare global {
  interface Window {
    __loopitaViewerPerf?: LoopitaViewerPerfApi;
  }
}

const INPUTS = ["pointerdown", "click", "keydown", "input", "change", "pointerout", "pointerover", "focusin"] as const;

export function inputOrigin(target: EventTarget | null): InputOrigin {
  const el = target instanceof Element ? target : null;
  if (!el) return "other";
  if (el.closest('[data-testid="part-text-editor"]')) return "text";
  if (el.closest('[data-testid="block-editor"]')) return "blocks";
  if (el.closest('[data-testid="visor-3d-colores-planos"]')) return "flat";
  if (el.closest('[data-testid="color-picker"], [data-zone="yarns"]')) return "yarn";
  return "other";
}

const EDIT_KEYS = new Set(["Backspace", "Delete", "Enter"]);
const SPIN_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown"]);

/**
 * ¿Esta tecla puede escribir? Las que escriben un carácter, borrar e Intro; en un campo numérico, también las flechas
 * arriba y abajo (cambian la cantidad de un bloque). Las demás (flechas en el texto, Mayús, Inicio) solo mueven.
 */
export function keyCanEdit(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "target">): boolean {
  if (e.key.length === 1) return !e.ctrlKey && !e.metaKey;
  if (EDIT_KEYS.has(e.key)) return true;
  const t = e.target as { tagName?: string; type?: string } | null;
  return SPIN_KEYS.has(e.key) && t?.tagName === "INPUT" && t.type === "number";
}

export function installViewerPerfProbe(): () => void {
  const channel = new MessageChannel();
  const queue: (() => void)[] = [];
  channel.port1.onmessage = () => queue.shift()?.();
  const rec = new ViewerPerfRecorder({
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
  const onInput = (e: Event) => rec.input(e.type, e.timeStamp, inputOrigin(e.target), e.type === "keydown" ? { editable: keyCanEdit(e as KeyboardEvent) } : {});
  for (const t of INPUTS) window.addEventListener(t, onInput, { capture: true, passive: true });
  const removeSink = addSpanSink((name, start, end) => rec.span(name, start, end));
  setActiveViewerPerf(rec);
  window.__loopitaViewerPerf = { summary: () => rec.summary(), reset: () => rec.reset(), recorder: rec };
  return () => {
    for (const t of INPUTS) window.removeEventListener(t, onInput, { capture: true });
    removeSink();
    setActiveViewerPerf(null);
    delete window.__loopitaViewerPerf;
    channel.port1.close();
  };
}
