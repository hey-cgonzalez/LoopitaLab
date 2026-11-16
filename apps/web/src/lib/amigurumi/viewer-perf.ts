import { summarize, type Summary } from "../render-bench.ts";

/*
 * Instrumentación del estudio amigurumi (T12 de la fase 4; ADR 0010, secciones 6, 6b y 6c, "Medición"; CA4-P1 a
 * CA4-P5, CA4-P8 y CA4-P10). Misma idea que `edit-to-paint` del colorwork (`src/lib/studio/perf.ts`, ADR 0004): desde
 * el evento de entrada (`event.timeStamp`) hasta lo primero que corre después del frame pintado. Tres métricas:
 *
 * - `edit-to-feedback`: hasta que el editor (texto o bloques) muestra el texto, el conteo de la vuelta y los errores
 *   de lectura. NO espera al 3D: es lo que exige CA4-P8 fuera de los límites recomendados.
 * - `edit-to-paint-3d`: hasta el frame del visor que ya dibuja el cambio (texto, bloques, color de una lana,
 *   "Colores planos"). Fuera de los límites, el 3D va en un turno aparte y puede reemplazar ediciones pendientes:
 *   una edición reemplazada se cierra con el frame que dibuja la última (el 3D llega a la última, sin cola).
 * - `hover-to-paint-3d`: vista previa de una lana al pasar el cursor o el foco por un color, hasta el frame.
 *
 * Ganchos: el editor avisa `feedbackQueued` (manejó la entrada) y `feedbackDrawn` (después del commit de React); el
 * controlador del visor avisa `viewerQueued` (le llegó un cambio que va al renderer) y `viewerApplied` (el renderer
 * lo recibió); el visor avisa `viewerFrameEnd` (dentro del frame de r3f). Sin costo en producción: el recolector solo
 * existe con `?perf=1` en `/dev/amigurumi`; los ganchos son `activeViewerPerf()?.…`.
 *
 * Puro: el reloj, el `requestAnimationFrame`, la tarea siguiente y `performance.measure` se inyectan (Vitest).
 */

/** De dónde vino la entrada (lo decide quien instala el recolector mirando `event.target`). */
export type InputOrigin = "text" | "blocks" | "yarn" | "flat" | "other";
export type ViewerMetric = "edit-to-feedback" | "edit-to-paint-3d" | "hover-to-paint-3d";

export interface ViewerPerfDeps {
  now(): number;
  raf(cb: () => void): void;
  /** Tarea siguiente (en el navegador, `MessageChannel`). */
  postTask(cb: () => void): void;
  measure?(name: string, start: number, end: number): void;
}

export interface ViewerSample {
  metric: ViewerMetric;
  origin: InputOrigin | "hover";
  t0: number;
  queuedAt: number;
  /** Fin del frame que lo dibujó (antes de pintarse): las ventanas de CA4-P5 van de `queuedAt` a `frameAt`. */
  frameAt: number;
  end: number;
  ms: number;
}

export interface ViewerSpan {
  name: string;
  start: number;
  end: number;
}

export interface ViewerPerfSummary {
  /** Por métrica y por origen de la entrada. */
  metrics: Partial<Record<ViewerMetric, Partial<Record<InputOrigin | "hover", Summary>>>>;
  /** Ediciones abiertas que no llegaron a su frame (no deberían existir). */
  dropped: { feedback: number; viewer: number };
  /** Ediciones del 3D que se cerraron con el frame de una edición posterior (fuera de los límites, sin cola). */
  coalesced: number;
  /** Validaciones y medidas (`validate*`, `describe`): CA4-P5, ninguna dentro de una ventana de edición. */
  spans: { n: number; p95: number; max: number; insideFeedbackWindow: number; insideViewerWindow: number; byName: Record<string, number> };
}

/** Una entrada vale como origen de una edición hasta este tiempo. */
export const VIEWER_INPUT_TTL_MS = 1000;
/** Una entrada fuerte (tecla, puntero, campo) no se reemplaza por otra de la misma acción dentro de este tiempo. */
export const STRONG_INPUT_SHADOW_MS = 50;
/** Entradas débiles (`pointerover`, `pointerout`, `focusin`): no tapan una fuerte reciente y caducan enseguida. */
export const VIEWER_WEAK_SHADOW_MS = 50;
export const VIEWER_WEAK_TTL_MS = 50;
/** El editor tiene que responder en este tiempo; si no, la edición se cuenta como perdida. */
export const FEEDBACK_TIMEOUT_MS = 3000;
/** El 3D puede tardar más fuera de los límites (reconstrucción diferida): se espera hasta este tiempo. */
export const VIEWER_TIMEOUT_MS = 8000;
const MAX_SAMPLES = 5000;
const WEAK = new Set(["pointerover", "pointerout", "focusin"]);

/** Nombre de `performance.measure`: `loopita:edit-to-feedback:text`, `loopita:edit-to-paint-3d:blocks`, `loopita:hover-to-paint-3d`. */
export function viewerMeasureName(metric: ViewerMetric, origin: InputOrigin | "hover"): string {
  return metric === "hover-to-paint-3d" ? "loopita:hover-to-paint-3d" : `loopita:${metric}:${origin}`;
}

interface Input {
  type: string;
  ts: number;
  origin: InputOrigin;
  weak: boolean;
  /** ¿Puede esta entrada cambiar el documento? (una flecha en un cuadro de texto, no). */
  editable: boolean;
  seenAt: number;
  usedFeedback: boolean;
  used3d: boolean;
  /** La misma entrada (salir de un color y entrar en otro) es una sola vista previa. */
  usedHover: boolean;
}

interface Open {
  metric: ViewerMetric;
  origin: InputOrigin | "hover";
  t0: number;
  queuedAt: number;
  /** Feedback: el editor dibujó. 3D: el renderer recibió el cambio. */
  readyAt: number | null;
  closing: boolean;
}

export class ViewerPerfRecorder {
  readonly #d: ViewerPerfDeps;
  #input: Input | null = null;
  #feedback: Open[] = [];
  #viewer: Open[] = [];
  #samples: ViewerSample[] = [];
  #spans: ViewerSpan[] = [];
  #dropped = { feedback: 0, viewer: 0 };
  #coalesced = 0;
  #inFrame = false;
  /** La edición del 3D que abrió el último `viewerQueued` (null si no abrió ninguna). */
  #lastQueued: Open | null = null;

  constructor(deps: ViewerPerfDeps) {
    this.#d = deps;
  }

  // ------------------------------------------------------------------ entradas

  /**
   * Entrada de la usuaria. `editable: false` para una tecla que no escribe (flechas, Mayús, Inicio): no tapa la
   * entrada que viene después, que es otra acción (una flecha y enseguida pegar texto).
   */
  input(type: string, ts: number, origin: InputOrigin, opts: { editable?: boolean } = {}): void {
    const weak = WEAK.has(type);
    const cur = this.#input;
    const unused = cur !== null && !cur.usedFeedback && !cur.used3d && !cur.usedHover;
    if (cur && unused && !cur.weak && ts >= cur.ts) {
      // La tecla y su `input`, el puntero y su `click`: la medición empieza en la primera.
      if (!weak && cur.editable && ts - cur.ts < STRONG_INPUT_SHADOW_MS) return;
      // Una entrada débil provocada por otra (el foco que se mueve con una flecha) no la tapa.
      if (weak && ts - cur.ts < VIEWER_WEAK_SHADOW_MS) return;
    }
    // `pointerout` y `pointerover` del mismo movimiento: la segunda no abre otra medición.
    if (weak && cur && cur.weak && cur.ts === ts) return;
    this.#input = { type, ts, origin, weak, editable: opts.editable !== false, seenAt: this.#d.now(), usedFeedback: false, used3d: false, usedHover: false };
  }

  // ------------------------------------------------------------------ editor

  /** El editor manejó una entrada (cambió el texto, una acción de bloques). */
  feedbackQueued(): void {
    const now = this.#d.now();
    this.#expire(now);
    const inp = this.#input;
    if (!inp || inp.weak || inp.usedFeedback || now < inp.ts || now - inp.ts > VIEWER_INPUT_TTL_MS) return;
    inp.usedFeedback = true;
    this.#feedback.push({ metric: "edit-to-feedback", origin: inp.origin, t0: inp.ts, queuedAt: now, readyAt: null, closing: false });
  }

  /** El editor terminó de dibujar (después del commit de React). Lo que dibujó se ve en el próximo frame. */
  feedbackDrawn(): void {
    const now = this.#d.now();
    for (const e of this.#feedback) {
      if (e.closing || e.readyAt !== null) continue;
      e.readyAt = now;
      e.closing = true;
      this.#closeAfterNextFrame(e, this.#inFrame);
    }
  }

  // ------------------------------------------------------------------ visor

  /**
   * Al controlador le llegó un cambio que va al renderer. `hover` (vista previa de una lana) se abre con una entrada
   * débil reciente o con una tecla (mover el foco por la paleta); el clic que elige un color quita la vista previa
   * antes de cambiar el documento, y esa llamada no cuenta como vista previa. `edit`, solo con una entrada fuerte.
   */
  viewerQueued(kind: "edit" | "hover"): void {
    const now = this.#d.now();
    this.#expire(now);
    this.#lastQueued = null;
    const inp = this.#input;
    if (!inp || now < inp.ts || now - inp.ts > VIEWER_INPUT_TTL_MS) return;
    if (kind === "edit" ? inp.weak || inp.used3d : inp.usedHover || (inp.weak ? now - inp.seenAt > VIEWER_WEAK_TTL_MS : inp.type !== "keydown")) return;
    if (kind === "edit") inp.used3d = true;
    else inp.usedHover = true;
    const e: Open = { metric: kind === "hover" ? "hover-to-paint-3d" : "edit-to-paint-3d", origin: kind === "hover" ? "hover" : inp.origin, t0: inp.ts, queuedAt: now, readyAt: null, closing: false };
    this.#viewer.push(e);
    this.#lastQueued = e;
  }

  /**
   * El renderer recibió los cambios (`setScene`, `setLooks` o `setPreviewOverride`). `latest`: solo la edición que se
   * acaba de abrir (la vista previa o el aspecto que se aplican en el mismo turno); sin él, todas las pendientes (la
   * reconstrucción diferida dibuja la última versión del documento).
   */
  viewerApplied(scope: "all" | "latest" = "all"): void {
    const now = this.#d.now();
    if (scope === "latest") {
      const e = this.#lastQueued;
      this.#lastQueued = null;
      if (e && !e.closing && e.readyAt === null) e.readyAt = now;
      return;
    }
    for (const e of this.#viewer) if (!e.closing && e.readyAt === null) e.readyAt = now;
  }

  /** Terminó un frame del visor (dentro del `requestAnimationFrame` de r3f). */
  viewerFrameEnd(): void {
    this.#inFrame = true;
    try {
      const ready = this.#viewer.filter((e) => !e.closing && e.readyAt !== null);
      if (ready.length > 1) this.#coalesced += ready.length - 1;
      for (const e of ready) {
        e.closing = true;
        this.#closeAfterNextFrame(e, true);
      }
    } finally {
      this.#inFrame = false;
    }
  }

  // ------------------------------------------------------------------ tramos

  span(name: string, start: number, end: number): void {
    this.#spans.push({ name, start, end });
    if (this.#spans.length > MAX_SAMPLES) this.#spans.shift();
    this.#d.measure?.(`loopita:${name}`, start, end);
  }

  // ------------------------------------------------------------------ resultados

  get samples(): readonly ViewerSample[] {
    return this.#samples;
  }

  get spans(): readonly ViewerSpan[] {
    return this.#spans;
  }

  reset(): void {
    this.#samples = [];
    this.#spans = [];
    this.#feedback = [];
    this.#viewer = [];
    this.#dropped = { feedback: 0, viewer: 0 };
    this.#coalesced = 0;
    this.#input = null;
    this.#lastQueued = null;
  }

  summary(): ViewerPerfSummary {
    this.#expire(this.#d.now());
    const metrics: ViewerPerfSummary["metrics"] = {};
    for (const s of this.#samples) {
      const m = (metrics[s.metric] ??= {});
      m[s.origin] ??= summarize([]);
    }
    for (const metric of Object.keys(metrics) as ViewerMetric[]) {
      const m = metrics[metric]!;
      for (const origin of Object.keys(m) as (InputOrigin | "hover")[]) m[origin] = summarize(this.#samples.filter((s) => s.metric === metric && s.origin === origin).map((s) => s.ms));
    }
    const durations = summarize(this.#spans.map((s) => s.end - s.start));
    const inside = (metric: ViewerMetric | "3d") =>
      this.#spans.filter((sp) => this.#samples.some((e) => (metric === "3d" ? e.metric !== "edit-to-feedback" : e.metric === metric) && sp.start >= e.queuedAt && sp.start < e.frameAt)).length;
    const byName: Record<string, number> = {};
    for (const s of this.#spans) byName[s.name] = (byName[s.name] ?? 0) + 1;
    return {
      metrics,
      dropped: { ...this.#dropped },
      coalesced: this.#coalesced,
      spans: { n: this.#spans.length, p95: durations.p95, max: durations.max, insideFeedbackWindow: inside("edit-to-feedback"), insideViewerWindow: inside("3d"), byName },
    };
  }

  // ------------------------------------------------------------------ interno

  /**
   * Desde dentro de un frame, la tarea siguiente y el próximo `requestAnimationFrame` corren después de que ese frame
   * se pintó: vale el primero que llegue (como el colorwork). Fuera del frame, lo dibujado se pinta en el próximo.
   * Si el hilo está ocupado (una reconstrucción larga del 3D), el frame se atrasa y la espera queda en la medición.
   */
  #closeAfterNextFrame(e: Open, inFrame: boolean): void {
    let done = false;
    let frameAt = this.#d.now();
    const record = () => {
      if (done) return;
      done = true;
      const end = this.#d.now();
      if (e.metric === "edit-to-feedback") this.#feedback = this.#feedback.filter((x) => x !== e);
      else this.#viewer = this.#viewer.filter((x) => x !== e);
      this.#samples.push({ metric: e.metric, origin: e.origin, t0: e.t0, queuedAt: e.queuedAt, frameAt, end, ms: end - e.t0 });
      if (this.#samples.length > MAX_SAMPLES) this.#samples.shift();
      this.#d.measure?.(viewerMeasureName(e.metric, e.origin), e.t0, end);
    };
    const afterThisFrame = () => {
      frameAt = this.#d.now();
      this.#d.postTask(record);
      this.#d.raf(record);
    };
    if (inFrame) afterThisFrame();
    else this.#d.raf(afterThisFrame);
  }

  #expire(now: number): void {
    const keepF: Open[] = [];
    for (const e of this.#feedback) {
      if (!e.closing && now - e.t0 > FEEDBACK_TIMEOUT_MS) this.#dropped.feedback += 1;
      else keepF.push(e);
    }
    this.#feedback = keepF;
    const keepV: Open[] = [];
    for (const e of this.#viewer) {
      if (!e.closing && now - e.t0 > VIEWER_TIMEOUT_MS) this.#dropped.viewer += 1;
      else keepV.push(e);
    }
    this.#viewer = keepV;
  }
}

// ------------------------------------------------------------------ recolector activo (ganchos del camino caliente)

let active: ViewerPerfRecorder | null = null;

/** El recolector activo, o `null` (siempre en producción). */
export function activeViewerPerf(): ViewerPerfRecorder | null {
  return active;
}

export function setActiveViewerPerf(r: ViewerPerfRecorder | null): void {
  active = r;
}

/** Ejecuta `fn` y, si hay recolector activo, registra cuánto tardó (validación y medidas, CA4-P5). */
export function viewerPerfSpan<T>(name: string, fn: () => T): T {
  const r = active;
  if (!r) return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    r.span(name, start, performance.now());
  }
}
