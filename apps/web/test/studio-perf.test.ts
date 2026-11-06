import { newChartPattern, type ChartPattern } from "@loopitalab/pattern-core";
import type { RendererOptions, StitchRenderer } from "@loopitalab/stitch-render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewEngine } from "@/components/studio/preview-engine.ts";
import { AUTOSAVE_DEBOUNCE_MS, Autosave } from "@/lib/studio/autosave.ts";
import { MAX_HOLD_MS, PaintGate, paintGate } from "@/lib/studio/paint-gate.ts";
import { EDIT_TIMEOUT_MS, INPUT_TTL_MS, PerfRecorder, activePerf, insideEditWindows, overlapping, perfSpan, setActivePerf, type PerfDeps } from "@/lib/studio/perf.ts";
import { onlyCellsChanged, selectChart, selectHasRepeats, selectYarns, selectorSnapshot } from "@/lib/studio/select.ts";
import { DocumentStore } from "@/lib/studio/store.ts";

/** Reloj, frames y tareas falsos: `frame()` corre los rAF pendientes; `tasks()` las tareas siguientes. */
function harness() {
  let t = 0;
  let rafs: (() => void)[] = [];
  let posted: (() => void)[] = [];
  const measures: string[] = [];
  const deps: PerfDeps = {
    now: () => t,
    raf: (cb) => void rafs.push(cb),
    postTask: (cb) => void posted.push(cb),
    measure: (name) => void measures.push(name),
  };
  const rec = new PerfRecorder(deps);
  return {
    rec,
    measures,
    at: (ms: number) => void (t = ms),
    frame: () => {
      const q = rafs;
      rafs = [];
      for (const cb of q) cb();
    },
    tasks: () => {
      const q = posted;
      posted = [];
      for (const cb of q) cb();
    },
  };
}

describe("recolector edit-to-paint", () => {
  it("mide desde la entrada hasta la tarea siguiente al frame en que la vista previa y el editor ya dibujaron", () => {
    const h = harness();
    h.rec.input("pointerdown", 100);
    h.at(102);
    h.rec.previewQueued({ change: "cells", editor: true });
    h.at(105);
    h.rec.editorDrawn();
    h.at(116);
    h.rec.previewFrameEnd();
    expect(h.rec.samples).toHaveLength(0); // falta la tarea siguiente (el frame se pinta antes)
    h.at(118);
    h.tasks();
    expect(h.rec.samples).toEqual([{ kind: "paint", t0: 100, queuedAt: 102, end: 118, ms: 18, editorMs: 5, previewMs: 16 }]);
    expect(h.measures).toEqual(["loopita:edit-to-paint:paint"]);
  });

  it("con el hilo saturado, si el próximo frame llega antes que la tarea, cuenta el frame (el anterior ya se pintó)", () => {
    const h = harness();
    h.rec.input("pointermove", 0);
    h.rec.previewQueued({ change: "cells", editor: false });
    h.at(16);
    h.rec.previewFrameEnd();
    h.at(33);
    h.frame();
    h.at(90);
    h.tasks(); // la tarea llegó tarde: no cambia la muestra
    expect(h.rec.samples.map((s) => s.ms)).toEqual([33]);
  });

  it("clasifica: movimiento con botón = trazo; repeticiones; otra geometría", () => {
    const h = harness();
    const one = (type: string, change: "cells" | "repeats" | "relayout", t0: number) => {
      h.rec.input(type, t0);
      h.at(t0 + 1);
      h.rec.previewQueued({ change, editor: false });
      h.rec.previewFrameEnd();
      h.tasks();
    };
    one("pointermove", "cells", 10);
    one("keydown", "cells", 15);
    one("input", "repeats", 20);
    one("change", "relayout", 30);
    expect(h.rec.samples.map((s) => s.kind)).toEqual(["stroke", "paint", "repeats", "relayout"]);
  });

  it("sin una entrada reciente no abre edición (autoguardado, recuperación) y una entrada vale una sola vez", () => {
    const h = harness();
    h.rec.previewQueued({ change: "cells", editor: false });
    h.rec.input("keydown", 0);
    h.at(INPUT_TTL_MS + 1);
    h.rec.previewQueued({ change: "cells", editor: false });
    h.rec.input("keydown", INPUT_TTL_MS + 1);
    h.rec.previewQueued({ change: "cells", editor: false });
    h.rec.previewQueued({ change: "cells", editor: false });
    h.rec.previewFrameEnd();
    h.tasks();
    expect(h.rec.samples).toHaveLength(1);
  });

  it("si el editor termina después del frame de la vista previa, espera al frame siguiente", () => {
    const h = harness();
    h.rec.input("keydown", 0);
    h.rec.previewQueued({ change: "cells", editor: true });
    h.at(16);
    h.rec.previewFrameEnd();
    h.tasks();
    expect(h.rec.samples).toHaveLength(0);
    h.at(20);
    h.rec.editorDrawn();
    h.tasks();
    expect(h.rec.samples).toHaveLength(0);
    h.at(33);
    h.frame();
    h.tasks();
    expect(h.rec.samples[0]?.ms).toBe(33);
  });

  it("una edición que nunca se pinta se descarta y se cuenta", () => {
    const h = harness();
    h.rec.input("pointerdown", 0);
    h.rec.previewQueued({ change: "cells", editor: true });
    h.at(EDIT_TIMEOUT_MS + 1);
    expect(h.rec.summary().dropped).toBe(1);
  });

  it("resume p50 y p95 por tipo y cuenta las validaciones dentro de una ventana de edición (CA-P7)", () => {
    const h = harness();
    for (let k = 0; k < 20; k++) {
      const t0 = k * 100;
      h.rec.input("pointerdown", t0);
      h.at(t0 + 1);
      h.rec.previewQueued({ change: "cells", editor: false });
      h.at(t0 + 10 + k);
      h.rec.previewFrameEnd();
      h.tasks();
    }
    h.rec.span("validate:panel", 50, 60); // entre ediciones: no cuenta
    h.rec.span("validate:autosave", 305, 309); // dentro de la ventana [300, 313]
    const s = h.rec.summary();
    expect(s.edits.paint?.n).toBe(20);
    expect(s.edits.paint?.p50).toBe(19);
    expect(s.edits.paint?.p95).toBe(28); // rango más cercano: el 19.º de 20 (10 a 29 ms)
    expect(s.validations).toMatchObject({ n: 2, insideEditWindow: 1, delayedInput: 0 });
    expect(h.measures).toContain("loopita:validate:autosave");
  });

  it("una validación que ya corría cuando llegó la entrada no es violación: se informa como entrada demorada", () => {
    const h = harness();
    h.rec.span("validate:panel", 95, 104); // empezó antes de la entrada (t0 = 100) y de que se despachara (102)
    h.rec.input("pointerdown", 100);
    h.at(104);
    h.rec.previewQueued({ change: "cells", editor: false });
    h.at(116);
    h.rec.previewFrameEnd();
    h.tasks();
    expect(h.rec.summary().validations).toMatchObject({ insideEditWindow: 0, delayedInput: 1 });
    expect(insideEditWindows([{ name: "v", start: 104, end: 105 }], h.rec.samples)).toHaveLength(1);
  });

  it("overlapping: un tramo que solo toca el borde no se solapa", () => {
    const edits = [{ t0: 10, end: 20 }];
    expect(overlapping([{ name: "v", start: 20, end: 25 }, { name: "v", start: 0, end: 10 }, { name: "v", start: 19, end: 30 }], edits)).toEqual([{ name: "v", start: 19, end: 30 }]);
  });

  it("cuenta frames y el mayor intervalo", () => {
    const h = harness();
    h.rec.startFrames();
    for (const t of [0, 16, 33, 80, 96]) {
      h.at(t);
      h.frame();
    }
    const f = h.rec.stopFrames();
    expect(f.frames).toBe(5);
    expect(f.maxGapMs).toBe(47);
    expect(f.fps).toBeCloseTo((4 * 1000) / 96, 5);
    h.frame(); // detenido: ya no cuenta
    expect(h.rec.stopFrames().frames).toBe(0);
  });
});

describe("ganchos sin recolector (producción)", () => {
  afterEach(() => setActivePerf(null));

  it("perfSpan solo ejecuta la función si no hay recolector", () => {
    expect(activePerf()).toBeNull();
    expect(perfSpan("validate", () => 42)).toBe(42);
  });

  it("con recolector activo registra el tramo, también si la función lanza", () => {
    const h = harness();
    setActivePerf(h.rec);
    expect(perfSpan("validate:x", () => 1)).toBe(1);
    expect(() => perfSpan("validate:y", () => { throw new Error("x"); })).toThrow("x");
    expect(h.rec.spans.map((s) => s.name)).toEqual(["validate:x", "validate:y"]);
  });
});

function doc(): ChartPattern {
  return newChartPattern({
    id: "d1",
    title: "T",
    width: 4,
    height: 3,
    repeat: { x: 2, y: 2 },
    workedIn: "rounds",
    renderAs: "tube",
    direction: "bottom_up",
    yarns: [
      { id: "A", weight: 4, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#FFFFFF" } },
      { id: "B", weight: 4, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#BA222C" } },
    ],
    gauge: { stitchesPer10cm: 22, rowsPer10cm: 30 },
  });
}

describe("selectores del almacén", () => {
  it("con el mismo estado no recalcula; con un valor igual devuelve el anterior (no vuelve a renderizar)", () => {
    const store = new DocumentStore(doc());
    const select = vi.fn(selectHasRepeats);
    const get = selectorSnapshot(store.getState, select);
    expect(get()).toBe(true);
    expect(get()).toBe(true);
    expect(select).toHaveBeenCalledTimes(1);
    store.dispatch({ type: "paint", refs: [{ x: 0, y: 0 }], value: 1 });
    expect(get()).toBe(true);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("una pincelada cambia el gráfico pero no las lanas; el título no cambia ninguno de los dos", () => {
    const store = new DocumentStore(doc());
    const chart = selectorSnapshot(store.getState, selectChart);
    const yarns = selectorSnapshot(store.getState, selectYarns);
    const c0 = chart();
    const y0 = yarns();
    store.dispatch({ type: "paint", refs: [{ x: 1, y: 1 }], value: 1 });
    expect(chart()).not.toBe(c0);
    expect(yarns()).toBe(y0);
    const c1 = chart();
    store.setTitle("Otro nombre");
    expect(chart()).toBe(c1);
    expect(yarns()).toBe(y0);
  });

  it("con un comparador propio conserva la referencia anterior si es igual", () => {
    let state = { v: [1, 2] };
    const get = selectorSnapshot(() => state, (s) => s.v.slice(), (a, b) => a.join() === b.join());
    const first = get();
    state = { v: [1, 2] };
    expect(get()).toBe(first);
    state = { v: [1, 3] };
    expect(get()).toEqual([1, 3]);
  });
});

describe("PreviewEngine.connect (vista previa directa del almacén)", () => {
  it("actualiza al conectar y en cada cambio que dibuja; no con el título ni con un no-op", () => {
    const store = new DocumentStore(doc());
    const engine = new PreviewEngine();
    const update = vi.spyOn(engine, "update");
    const off = engine.connect(store);
    expect(update).toHaveBeenCalledTimes(1);
    store.setTitle("Nuevo");
    expect(update).toHaveBeenCalledTimes(1);
    store.dispatch({ type: "paint", refs: [{ x: 0, y: 0 }], value: 0 }); // ya era 0: no-op
    expect(update).toHaveBeenCalledTimes(1);
    store.dispatch({ type: "paint", refs: [{ x: 0, y: 0 }], value: 1 });
    store.dispatch({ type: "repeat", x: 3, y: 2 });
    store.setGauge({ stitchesPer10cm: 20, rowsPer10cm: 28 });
    expect(update).toHaveBeenCalledTimes(4);
    expect(update.mock.calls[3]?.[1]).toEqual({ stitchesPer10cm: 20, rowsPer10cm: 28 });
    off();
    store.dispatch({ type: "paint", refs: [{ x: 1, y: 0 }], value: 1 });
    expect(update).toHaveBeenCalledTimes(4);
  });
});

describe("compuerta después del frame (CA-P7)", () => {
  afterEach(() => vi.useRealTimers());

  it("sin edición en vuelo corre de inmediato; con una, en la tarea siguiente al frame", () => {
    vi.useFakeTimers();
    const g = new PaintGate({ setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) });
    const ran: string[] = [];
    g.run(() => ran.push("a"));
    expect(ran).toEqual(["a"]);
    g.editQueued();
    g.run(() => ran.push("b"));
    expect(ran).toEqual(["a"]);
    g.painted();
    expect(ran).toEqual(["a"]); // todavía dentro del frame
    vi.advanceTimersByTime(0);
    expect(ran).toEqual(["a", "b"]);
    expect(g.inFlight).toBe(false);
  });

  it("si el frame no llega, se abre sola a los MAX_HOLD_MS: nunca retiene un guardado", () => {
    vi.useFakeTimers();
    const g = new PaintGate({ setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) });
    const fn = vi.fn();
    g.editQueued();
    g.run(fn);
    vi.advanceTimersByTime(MAX_HOLD_MS - 1);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("el autoguardado no valida mientras una edición espera su frame", async () => {
    vi.useFakeTimers();
    const store = new DocumentStore(doc());
    const validate = vi.fn(() => ({ savable: true, issues: [] }));
    const save = vi.fn().mockResolvedValue({ ok: true, updatedAt: "2026-11-06T10:00:05.000000+00:00", draft: false });
    const a = new Autosave(store, { patternId: store.doc.id, initialUpdatedAt: "2026-11-06T10:00:00.000000+00:00", save, validate, storage: null });
    a.start();
    store.dispatch({ type: "paint", refs: [{ x: 0, y: 0 }], value: 1 });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 10);
    paintGate.editQueued(); // justo antes de vencer el antirrebote, la vista previa encoló una edición que aún no se pinta
    await vi.advanceTimersByTimeAsync(10);
    expect(validate).not.toHaveBeenCalled();
    paintGate.painted();
    await vi.advanceTimersByTimeAsync(0);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    a.stop();
  });
});

describe("onlyCellsChanged (panel lateral fuera del trazo)", () => {
  it("pincelada y relleno: sí; repeticiones, forma, muestra, lanas o título: no", () => {
    const store = new DocumentStore(doc());
    const d0 = store.doc;
    store.dispatch({ type: "paint", refs: [{ x: 0, y: 0 }], value: 1 });
    expect(onlyCellsChanged(d0, store.doc)).toBe(true);
    const d1 = store.doc;
    store.dispatch({ type: "fill", start: { x: 3, y: 2 }, value: 1 });
    expect(onlyCellsChanged(d1, store.doc)).toBe(true);
    expect(onlyCellsChanged(d1, d1)).toBe(false);
    const cases: ((s: DocumentStore) => unknown)[] = [
      (s) => s.dispatch({ type: "repeat", x: 3, y: 2 }),
      (s) => s.dispatch({ type: "setShape", renderAs: "circle" }),
      (s) => s.setGauge({ stitchesPer10cm: 18, rowsPer10cm: 24 }),
      (s) => s.setTitle("Otro"),
      (s) => s.dispatch({ type: "updateYarn", index: 1, yarn: { ...s.doc.yarns[1]!, color: { hex: "#112233" } } }),
    ];
    for (const act of cases) {
      const before = store.doc;
      act(store);
      expect(store.doc).not.toBe(before);
      expect(onlyCellsChanged(before, store.doc)).toBe(false);
    }
  });
});

describe("Event Timing (verificación cruzada)", () => {
  it("resume la duración por tipo de evento y se limpia con reset", () => {
    const h = harness();
    for (const d of [16, 24, 32, 40]) h.rec.eventTiming("pointerdown", d);
    h.rec.eventTiming("input", 48);
    expect(h.rec.summary().eventTiming.pointerdown).toMatchObject({ n: 4, p50: 24, p95: 40 });
    expect(h.rec.summary().eventTiming.input?.n).toBe(1);
    h.rec.reset();
    expect(h.rec.summary().eventTiming).toEqual({});
  });
});

describe("PreviewEngine: geometría agrupada por frame", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubRenderer() {
    const frames: (() => void)[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => (frames.push(cb), frames.length));
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    let opts: RendererOptions = {};
    let scheduled = false;
    const r = {
      setLayout: vi.fn(),
      invalidate: vi.fn(),
      setLooks: vi.fn(),
      setView: vi.fn(),
      getView: () => ({ zoom: 1, panX: 0, panY: 0 }),
      resize: vi.fn(),
      destroy: vi.fn(),
      flush: vi.fn(() => null),
      requestRender: vi.fn(() => {
        if (scheduled) return;
        scheduled = true;
        opts.schedule?.(() => {
          scheduled = false;
          r.flush();
        });
      }),
    };
    const make = (_c: HTMLCanvasElement, o: RendererOptions) => ((opts = o), r as unknown as StitchRenderer);
    const frame = () => {
      const q = frames.splice(0);
      for (const cb of q) cb();
    };
    return { r, make, frame };
  }

  it("ancho y alto en el mismo frame calculan la disposición una vez; una pincelada pendiente no colorea la vieja", () => {
    const { r, make, frame } = stubRenderer();
    const store = new DocumentStore(doc());
    const engine = new PreviewEngine(make);
    engine.attach({} as HTMLCanvasElement);
    engine.connect(store);
    frame();
    expect(r.setLayout).toHaveBeenCalledTimes(1);
    expect(r.flush).toHaveBeenCalledTimes(1);

    store.dispatch({ type: "repeat", x: 5, y: 2 });
    store.dispatch({ type: "repeat", x: 5, y: 5 });
    store.dispatch({ type: "paint", refs: [{ x: 0, y: 0 }], value: 1 });
    expect(r.setLayout).toHaveBeenCalledTimes(1); // nada se calcula fuera del frame
    expect(r.invalidate).not.toHaveBeenCalled();
    frame();
    expect(r.setLayout).toHaveBeenCalledTimes(2);
    expect(r.flush).toHaveBeenCalledTimes(2); // el mismo frame dibuja la geometría nueva
    const layout = r.setLayout.mock.calls[1]?.[0] as { count: number; yarn: Uint8Array };
    expect(layout.count).toBe(4 * 3 * 25);
    expect(layout.yarn[0]).toBe(1); // la pincelada entró al recálculo

    store.dispatch({ type: "paint", refs: [{ x: 1, y: 0 }], value: 1 });
    expect(r.invalidate).toHaveBeenCalledTimes(1); // sin geometría pendiente: camino rápido
    frame();
    expect(r.setLayout).toHaveBeenCalledTimes(2);
  });

  it("si el recálculo lanza un error inesperado, el frame igual dibuja y el renderer sigue vivo", () => {
    const { r, make, frame } = stubRenderer();
    const store = new DocumentStore(doc());
    const engine = new PreviewEngine(make);
    engine.attach({} as HTMLCanvasElement);
    engine.connect(store);
    frame();
    r.setLayout.mockImplementationOnce(() => {
      throw new Error("inesperado");
    });
    store.dispatch({ type: "repeat", x: 3, y: 3 });
    expect(() => frame()).toThrow("inesperado");
    expect(r.flush).toHaveBeenCalledTimes(2);
    store.dispatch({ type: "repeat", x: 4, y: 3 });
    frame();
    expect(r.setLayout).toHaveBeenCalledTimes(3);
  });
});
