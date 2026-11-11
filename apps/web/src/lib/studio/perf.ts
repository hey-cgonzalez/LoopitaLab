import { fpsFromFrames, summarize, type Summary } from "../render-bench.ts";

/*
 * Instrumentación `edit-to-paint` del estudio (T10; ADR 0004, "Cómo se mide"; CA-P1 a CA-P4, CA-P7).
 *
 * Mide desde el evento de entrada (`event.timeStamp` del puntero, teclado o campo) hasta el frame pintado de la vista
 * previa Y del editor: el editor avisa cuando dibujó (`editorDrawn`), la vista previa cuando terminó su frame
 * (`previewFrameEnd`, dentro del `requestAnimationFrame` del renderer), y el fin es lo primero que corra después de
 * pintar ese frame: la tarea siguiente (`MessageChannel`, como el benchmark de T6) o el próximo `requestAnimationFrame`.
 *
 * Sin costo en producción: el recolector solo existe si se activa (`?perf=1` en `/dev/estudio`). Los ganchos del camino
 * caliente son `activePerf()?.…`, una lectura de variable y una comparación con `null`.
 *
 * Validación (CA-P7): `perfSpan("validate", fn)` registra cada validación; el resumen cuenta las que se solaparon con
 * una ventana de edición (desde la entrada hasta el frame). Debe ser 0.
 *
 * Puro: el reloj, el `requestAnimationFrame`, la tarea siguiente y `performance.measure` se inyectan (Vitest).
 */

/**
 * `hover`: vista previa de una lana al pasar el cursor o el foco (`hover-to-paint`, ADR 0008 §3, CA3-P1).
 * `row`: avance de la fila resaltada del modo tejiendo (`row-to-paint`, CA3-P3). Los dos no tocan el documento.
 */
export type EditKind = "paint" | "stroke" | "repeats" | "relayout" | "looks" | "hover" | "row";

/** Lo que la vista previa sabe del cambio que acaba de encolar. */
export interface PreviewChange {
  /**
   * `cells`: solo casillas; `repeats`: cambiaron las repeticiones; `relayout`: otra geometría; `looks`: solo lanas
   * (o "Colores planos"); `hover`: vista previa de una lana (`previewYarn`); `row`: fila resaltada.
   */
  change: "cells" | "repeats" | "relayout" | "looks" | "hover" | "row";
  /** ¿Cambió algo que el editor dibuja (casillas, lanas, tamaño)? Si no, no se espera al editor. */
  editor: boolean;
}

export interface PerfDeps {
  now(): number;
  raf(cb: () => void): void;
  /** Tarea siguiente (en el navegador, `MessageChannel`): corre después de que el frame se pinta. */
  postTask(cb: () => void): void;
  measure?(name: string, start: number, end: number): void;
}

interface OpenEdit {
  kind: EditKind;
  t0: number;
  /** Cuando la edición llegó a la vista previa (después del manejador de la entrada). */
  queuedAt: number;
  needEditor: boolean;
  editorAt: number | null;
  previewAt: number | null;
  closing: boolean;
}

export interface EditSample {
  kind: EditKind;
  t0: number;
  queuedAt: number;
  end: number;
  ms: number;
  /** ms desde la entrada hasta que el editor dibujó (null si no tenía que dibujar). */
  editorMs: number | null;
  /** ms desde la entrada hasta el fin del frame de la vista previa. */
  previewMs: number;
}

export interface Span {
  name: string;
  start: number;
  end: number;
}

export interface FramesResult {
  frames: number;
  fps: number;
  maxGapMs: number;
}

export interface PerfSummary {
  edits: Partial<Record<EditKind, Summary & { editorP95: number; previewP95: number }>>;
  /** Ediciones que no llegaron a pintarse en `EDIT_TIMEOUT_MS` (no deberían existir). */
  dropped: number;
  /**
   * Verificación cruzada con la Event Timing API (ADR 0004, "Cómo se mide"): `duration` de cada evento de entrada
   * hasta el frame siguiente, según el navegador (redondeada a 8 ms; solo eventos de 16 ms o más).
   */
  eventTiming: Record<string, Summary>;
  validations: {
    n: number;
    p95: number;
    max: number;
    /** Validaciones que empezaron entre la edición (ya despachada) y el frame pintado. CA-P7: debe ser 0. */
    insideEditWindow: number;
    /**
     * Validaciones que ya estaban corriendo cuando llegó la entrada (la entrada esperó detrás, sin que la edición
     * las disparara). No violan CA-P7, pero se informan: su duración se suma a la latencia de esa entrada.
     */
    delayedInput: number;
  };
}

/** Una entrada vale como origen de una edición hasta este tiempo. */
export const INPUT_TTL_MS = 1000;
/**
 * Entradas "débiles" (`pointerout`, `pointerover`, `focusin`), las de pasar el cursor o el foco (`hover-to-paint`):
 *
 * - Las puede provocar otra entrada (mover el foco con una flecha, un clic que enfoca). No reemplazan una entrada
 *   fuerte sin usar de hace menos de `WEAK_INPUT_SHADOW_MS`: la medición empieza en la tecla o el clic que originó el
 *   cambio, no después de su manejador (no se subestima la latencia).
 * - React sintetiza `onPointerEnter` desde el `pointerout` del elemento anterior, antes del `pointerover`: por eso
 *   `pointerout` también cuenta (tiene la misma marca de tiempo del movimiento).
 * - Llegan a montones (cada movimiento entre elementos). Valen solo para un cambio encolado dentro de
 *   `WEAK_INPUT_TTL_MS` desde que el recolector las vio (en el mismo despacho del evento): una entrada débil vieja no
 *   se atribuye a un cambio que no provocó.
 */
export const WEAK_INPUT_SHADOW_MS = 50;
export const WEAK_INPUT_TTL_MS = 50;
const WEAK_INPUTS: ReadonlySet<string> = new Set(["pointerout", "pointerover", "focusin"]);
/** Nombre de la medida de `performance.measure` por tipo: `hover-to-paint` y `row-to-paint` tienen nombre propio. */
export function measureName(kind: EditKind): string {
  return kind === "hover" ? "loopita:hover-to-paint" : kind === "row" ? "loopita:row-to-paint" : `loopita:edit-to-paint:${kind}`;
}
/** Una edición abierta que no se pinta en este tiempo se descarta y se cuenta. */
export const EDIT_TIMEOUT_MS = 2000;
const MAX_SAMPLES = 5000;

export class PerfRecorder {
  readonly #d: PerfDeps;
  #input: { type: string; ts: number; used: boolean; seenAt: number } | null = null;
  #open: OpenEdit[] = [];
  #samples: EditSample[] = [];
  #spans: Span[] = [];
  #dropped = 0;
  #inFrame = false;
  #frames: number[] | null = null;
  #eventTiming = new Map<string, number[]>();

  constructor(deps: PerfDeps) {
    this.#d = deps;
  }

  // ------------------------------------------------------------------ entradas

  /** Evento de entrada (puntero apretado, tecla, campo). `ts` es `event.timeStamp`, en el reloj de `now()`. */
  input(type: string, ts: number): void {
    const cur = this.#input;
    if (WEAK_INPUTS.has(type) && cur && !cur.used && !WEAK_INPUTS.has(cur.type) && ts >= cur.ts && ts - cur.ts < WEAK_INPUT_SHADOW_MS) return;
    // Un `pointerover` justo después del `pointerout` que ya abrió la medición (mismo movimiento) no abre otra.
    if (WEAK_INPUTS.has(type) && cur && cur.used && WEAK_INPUTS.has(cur.type) && cur.ts === ts) return;
    this.#input = { type, ts, used: false, seenAt: this.#d.now() };
  }

  /**
   * La vista previa encoló un cambio del documento. Si hay una entrada reciente sin usar, abre una edición.
   * Si no (cambio que no viene de una entrada: autoguardado, recuperación), no se mide.
   */
  previewQueued(c: PreviewChange): void {
    const now = this.#d.now();
    this.#expire(now);
    const inp = this.#input;
    if (!inp || inp.used || now - inp.ts > INPUT_TTL_MS || now < inp.ts) return;
    // Una entrada débil solo origina vistas previas (`hover`), y solo si es reciente.
    if (WEAK_INPUTS.has(inp.type) && (c.change !== "hover" || now - inp.seenAt > WEAK_INPUT_TTL_MS)) return;
    inp.used = true;
    const kind: EditKind = c.change === "cells" ? (inp.type === "pointermove" ? "stroke" : "paint") : c.change;
    this.#open.push({ kind, t0: inp.ts, queuedAt: now, needEditor: c.editor, editorAt: null, previewAt: null, closing: false });
  }

  /** El editor terminó de dibujar (después del commit de React). */
  editorDrawn(): void {
    const now = this.#d.now();
    for (const e of this.#open) {
      if (e.closing || e.editorAt !== null) continue;
      e.editorAt = now;
      this.#maybeClose(e);
    }
  }

  /** Terminó un frame de la vista previa (dentro del `requestAnimationFrame` del renderer, dibujara o no). */
  previewFrameEnd(): void {
    const now = this.#d.now();
    this.#inFrame = true;
    try {
      for (const e of this.#open) {
        if (e.closing || e.previewAt !== null) continue;
        e.previewAt = now;
        this.#maybeClose(e);
      }
    } finally {
      this.#inFrame = false;
    }
  }

  // ------------------------------------------------------------------ tramos (validación)

  span(name: string, start: number, end: number): void {
    this.#spans.push({ name, start, end });
    if (this.#spans.length > MAX_SAMPLES) this.#spans.shift();
    this.#d.measure?.(`loopita:${name}`, start, end);
  }

  /** Entrada de la Event Timing API (`PerformanceObserver` de tipo `event`). */
  eventTiming(name: string, duration: number): void {
    const l = this.#eventTiming.get(name) ?? [];
    l.push(duration);
    if (l.length > MAX_SAMPLES) l.shift();
    this.#eventTiming.set(name, l);
  }

  // ------------------------------------------------------------------ fps

  /** Empieza a contar frames (zoom, desplazamiento, trazo). */
  startFrames(): void {
    const frames: number[] = [];
    this.#frames = frames;
    const tick = () => {
      if (this.#frames !== frames) return;
      frames.push(this.#d.now());
      this.#d.raf(tick);
    };
    this.#d.raf(tick);
  }

  stopFrames(): FramesResult {
    const f = this.#frames ?? [];
    this.#frames = null;
    let maxGap = 0;
    for (let i = 1; i < f.length; i++) maxGap = Math.max(maxGap, (f[i] as number) - (f[i - 1] as number));
    return { frames: f.length, fps: fpsFromFrames(f), maxGapMs: maxGap };
  }

  // ------------------------------------------------------------------ resultados

  get samples(): readonly EditSample[] {
    return this.#samples;
  }

  get spans(): readonly Span[] {
    return this.#spans;
  }

  reset(): void {
    this.#samples = [];
    this.#spans = [];
    this.#open = [];
    this.#dropped = 0;
    this.#input = null;
    this.#eventTiming.clear();
  }

  summary(): PerfSummary {
    this.#expire(this.#d.now());
    const edits: PerfSummary["edits"] = {};
    const kinds = new Set(this.#samples.map((s) => s.kind));
    for (const k of kinds) {
      const of = this.#samples.filter((s) => s.kind === k);
      const editorP95 = summarize(of.map((s) => s.editorMs ?? Number.NaN)).p95;
      edits[k] = { ...summarize(of.map((s) => s.ms)), editorP95, previewP95: summarize(of.map((s) => s.previewMs)).p95 };
    }
    const vals = this.#spans.filter((s) => s.name.startsWith("validate"));
    const vs = summarize(vals.map((s) => s.end - s.start));
    const inside = insideEditWindows(vals, this.#samples);
    const delayed = overlapping(vals, this.#samples).filter((v) => !inside.includes(v));
    const eventTiming = Object.fromEntries([...this.#eventTiming].map(([k, v]) => [k, summarize(v)]));
    return { edits, dropped: this.#dropped, eventTiming, validations: { n: vals.length, p95: vs.p95, max: vs.max, insideEditWindow: inside.length, delayedInput: delayed.length } };
  }

  // ------------------------------------------------------------------ interno

  #maybeClose(e: OpenEdit): void {
    if (e.previewAt === null || (e.needEditor && e.editorAt === null)) return;
    e.closing = true;
    let done = false;
    const record = () => {
      if (done) return;
      done = true;
      {
        const end = this.#d.now();
        this.#open = this.#open.filter((x) => x !== e);
        const s: EditSample = { kind: e.kind, t0: e.t0, queuedAt: e.queuedAt, end, ms: end - e.t0, editorMs: e.editorAt === null ? null : e.editorAt - e.t0, previewMs: (e.previewAt as number) - e.t0 };
        this.#samples.push(s);
        if (this.#samples.length > MAX_SAMPLES) this.#samples.shift();
        this.#d.measure?.(measureName(e.kind), e.t0, end);
      }
    };
    // Desde dentro del frame, tanto la tarea siguiente como el próximo `requestAnimationFrame` corren después de que
    // ese frame se pintó: vale el primero que llegue. Con el hilo saturado (trazo largo) el planificador posterga la
    // tarea detrás de las entradas y los frames, y medir solo con ella sumaría esa espera aunque el frame ya se vio.
    const afterThisFrame = () => {
      this.#d.postTask(record);
      this.#d.raf(record);
    };
    // Fuera del frame (el editor terminó último), lo que dibujó se pinta en el próximo.
    if (this.#inFrame) afterThisFrame();
    else this.#d.raf(afterThisFrame);
  }

  #expire(now: number): void {
    const keep: OpenEdit[] = [];
    for (const e of this.#open) {
      if (!e.closing && now - e.t0 > EDIT_TIMEOUT_MS) this.#dropped += 1;
      else keep.push(e);
    }
    this.#open = keep;
  }
}

/** Tramos que se solapan con alguna ventana de edición (desde la entrada hasta el frame pintado). */
export function overlapping(spans: readonly Span[], edits: readonly Pick<EditSample, "t0" | "end">[]): Span[] {
  return spans.filter((s) => edits.some((e) => s.start < e.end && s.end > e.t0));
}

/**
 * Tramos que empezaron después de despachar una edición y antes de que terminara el frame de la vista previa que la
 * pintó (`t0 + previewMs`; violación de CA-P7). No se compara con `end` (el cierre de la muestra, en la tarea o el
 * frame siguiente): lo que la compuerta libera justo después de ese frame ya no demora la edición.
 */
export function insideEditWindows(spans: readonly Span[], edits: readonly Pick<EditSample, "queuedAt" | "t0" | "previewMs">[]): Span[] {
  return spans.filter((s) => edits.some((e) => s.start >= e.queuedAt && s.start < e.t0 + e.previewMs));
}

// ------------------------------------------------------------------ recolector activo (ganchos del camino caliente)

let active: PerfRecorder | null = null;

/** El recolector activo, o `null` (siempre en producción). */
export function activePerf(): PerfRecorder | null {
  return active;
}

export function setActivePerf(r: PerfRecorder | null): void {
  active = r;
}

/** Ejecuta `fn` y, si hay recolector activo, registra cuánto tardó (validación, CA-P7). */
export function perfSpan<T>(name: string, fn: () => T): T {
  const r = active;
  if (!r) return fn();
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const start = now();
  try {
    return fn();
  } finally {
    r.span(name, start, now());
  }
}
