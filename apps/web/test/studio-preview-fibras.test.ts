import { newChartPattern, type ChartPattern, type Yarn } from "@loopitalab/pattern-core";
import { lookKey, type RendererOptions, type StitchRenderer, type YarnLook } from "@loopitalab/stitch-render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FLAT_COLORS_STORAGE_KEY, PreviewControls, previewControls } from "@/components/studio/preview-controls.ts";
import { PreviewEngine } from "@/components/studio/preview-engine.ts";
import { paintGate } from "@/lib/studio/paint-gate.ts";
import { PerfRecorder, WEAK_INPUT_SHADOW_MS, WEAK_INPUT_TTL_MS, measureName, setActivePerf, type PerfDeps } from "@/lib/studio/perf.ts";
import { DocumentStore } from "@/lib/studio/store.ts";

/*
 * T8 de la fase 3 (ADR 0008 §3 y §4): aspecto por fibra activado por defecto, "Colores planos", clave de aspectos con
 * grosor y porcentajes, `previewYarn` (vista previa al pasar el cursor) sin tocar el documento (CA3-P4) y la
 * instrumentación `hover-to-paint` / `row-to-paint`.
 */

const lana = (percent = 100) => ({ fiber: "lana", percent });
function doc(yarns?: Yarn[]): ChartPattern {
  return newChartPattern({
    id: "d1",
    title: "T",
    width: 4,
    height: 3,
    repeat: { x: 2, y: 2 },
    workedIn: "rounds",
    renderAs: "tube",
    direction: "bottom_up",
    yarns: yarns ?? [
      { id: "A", weight: 4, composition: [lana()], color: { hex: "#FFFFFF" } },
      { id: "B", weight: 4, composition: [{ fiber: "mohair", percent: 100 }], color: { hex: "#BA222C" } },
    ],
    gauge: { stitchesPer10cm: 22, rowsPer10cm: 30 },
  });
}

function stubRenderer() {
  const frames: (() => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => (frames.push(cb), frames.length));
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  let opts: RendererOptions = {};
  let scheduled = false;
  const r = {
    setLayout: vi.fn(),
    invalidate: vi.fn(),
    setLooks: vi.fn<(l: readonly YarnLook[]) => void>(),
    setPreviewOverride: vi.fn<(o: { yarn: number; look: YarnLook } | null) => void>(),
    setHighlightRow: vi.fn<(row: number | null) => void>(),
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

function setup(d = doc()) {
  const s = stubRenderer();
  const store = new DocumentStore(d);
  const engine = new PreviewEngine(s.make);
  engine.attach({} as HTMLCanvasElement);
  engine.connect(store);
  s.frame();
  return { ...s, store, engine };
}

const lastLooks = (r: ReturnType<typeof stubRenderer>["r"]) => r.setLooks.mock.calls.at(-1)?.[0] ?? [];

afterEach(() => {
  vi.unstubAllGlobals();
  setActivePerf(null);
});

describe("aspecto por fibra en el estudio", () => {
  it("está activado por defecto: el mohair lleva halo; Colores planos lo apaga sin tocar el documento", () => {
    const { r, store, engine, frame } = setup();
    expect(lastLooks(r)[1]?.halo).toBe(1);
    expect(lastLooks(r)[0]?.halo).toBe(0);
    const before = store.doc;
    const st = store.getState();
    engine.setFlatColors(true);
    expect(engine.flatColors).toBe(true);
    expect(lastLooks(r).map((l) => l.halo + l.sheen + l.definition)).toEqual([0, 0]);
    frame();
    expect(store.doc).toBe(before);
    expect(store.getState()).toBe(st);
    engine.setFlatColors(false);
    expect(lastLooks(r)[1]?.halo).toBe(1);
  });

  it("F3-35: cambiar 70/30 a 30/70 lana/mohair vuelve a pasar los aspectos; cambiar solo el grosor no redibuja", () => {
    const yarns = (comp: Yarn["composition"], weight: Yarn["weight"] = 4): Yarn[] => [{ id: "A", weight, composition: comp, color: { hex: "#336699" } }];
    const { r, store } = setup(doc(yarns([lana(70), { fiber: "mohair", percent: 30 }])));
    const calls = r.setLooks.mock.calls.length;
    store.dispatch({ type: "updateYarn", index: 0, yarn: yarns([lana(30), { fiber: "mohair", percent: 70 }])[0] as Yarn });
    expect(r.setLooks.mock.calls.length).toBe(calls + 1);
    expect(lastLooks(r)[0]?.halo).toBeCloseTo(0.7);
    store.dispatch({ type: "updateYarn", index: 0, yarn: yarns([lana(30), { fiber: "mohair", percent: 70 }], 6)[0] as Yarn });
    expect(r.setLooks.mock.calls.length).toBe(calls + 1); // el grosor no cambia el aspecto (la proporción sale de la muestra)
  });
});

describe("previewYarn (vista previa al pasar el cursor)", () => {
  it("CA3-P4: ninguna secuencia de vistas previas cambia el documento, el historial ni avisa al almacén", () => {
    const { r, store, engine, frame } = setup();
    const before = store.doc;
    const st = store.getState();
    const listener = vi.fn();
    store.subscribe(listener);
    const held = vi.spyOn(paintGate, "editQueued");
    for (let i = 0; i < 50; i++) {
      engine.previewYarn(i % 2, i % 3 === 0 ? { color: { hex: `#00${(i * 5).toString(16).padStart(2, "0")}00` }, composition: [{ fiber: "seda", percent: 100 }] } : { color: { hex: `#${(i * 5).toString(16).padStart(2, "0")}0000` } });
      if (i % 7 === 0) engine.previewYarn(0, null);
      frame();
    }
    engine.previewYarn(0, null);
    frame();
    expect(store.doc).toBe(before);
    expect(store.getState()).toBe(st);
    expect(store.getState().canUndo).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    // Cada vista previa cierra la compuerta hasta su frame (CA3-P5: la validación diferida no corre dentro).
    expect(held.mock.calls.length).toBeGreaterThan(40);
    expect(r.setPreviewOverride.mock.calls.at(-1)?.[0]).toBeNull();
  });

  it("usa la lana del documento con el color del candidato y, si trae, su composición; mismo aspecto, sin redibujo", () => {
    const { r, engine } = setup();
    engine.previewYarn(1, { color: { hex: "#00ff00" } });
    const o = r.setPreviewOverride.mock.calls.at(-1)?.[0];
    expect(o?.yarn).toBe(1);
    expect(o?.look).toMatchObject({ hex: "#00FF00", halo: 1 }); // conserva el mohair de la lana B
    engine.previewYarn(1, { color: { hex: "#00FF00" } });
    expect(r.setPreviewOverride).toHaveBeenCalledTimes(1);
    engine.previewYarn(1, { color: { hex: "#00FF00" }, composition: [{ fiber: "algodon", percent: 100 }] });
    expect(r.setPreviewOverride.mock.calls.at(-1)?.[0]?.look).toMatchObject({ halo: 0, definition: 1 });
    engine.setFlatColors(true);
    expect(lookKey(r.setPreviewOverride.mock.calls.at(-1)?.[0]?.look as YarnLook)).toBe("#00FF00|0.00|0.00|0.00");
  });

  it("un índice fuera de rango o inválido no dibuja nada; quitar una lana quita su vista previa", () => {
    const { r, store, engine } = setup();
    engine.previewYarn(5, { color: { hex: "#00FF00" } });
    engine.previewYarn(-1, { color: { hex: "#00FF00" } });
    engine.previewYarn(0.5, { color: { hex: "#00FF00" } });
    expect(r.setPreviewOverride).not.toHaveBeenCalled();
    engine.previewYarn(1, { color: { hex: "#00FF00" } });
    expect(r.setPreviewOverride).toHaveBeenCalledTimes(1);
    expect(store.dispatch({ type: "removeYarn", index: 1, replaceWith: 0 })).toBe(true);
    expect(store.doc.yarns).toHaveLength(1);
    expect(r.setPreviewOverride.mock.calls.at(-1)?.[0]).toBeNull();
  });

  it("instrumentación: una entrada de cursor y la vista previa dan una muestra `hover` con su medida hover-to-paint", () => {
    const { engine, frame } = setup();
    let t = 0;
    const tasks: (() => void)[] = [];
    const measures: string[] = [];
    const deps: PerfDeps = { now: () => t, raf: (cb) => void requestAnimationFrame(cb), postTask: (cb) => void tasks.push(cb), measure: (n) => void measures.push(n) };
    const rec = new PerfRecorder(deps);
    setActivePerf(rec);
    rec.input("pointerover", 10);
    t = 12;
    engine.previewYarn(0, { color: { hex: "#123456" } });
    t = 30;
    frame();
    t = 31;
    for (const cb of tasks.splice(0)) cb();
    expect(rec.samples.map((s) => [s.kind, s.ms])).toEqual([["hover", 21]]);
    expect(measures).toEqual(["loopita:hover-to-paint"]);
  });

  it("fila resaltada: la pasa al renderer, se mide como `row` y vuelve tras volver a montar", () => {
    const { r, engine } = setup();
    engine.setHighlightRow(3);
    engine.setHighlightRow(3);
    expect(r.setHighlightRow.mock.calls).toEqual([[3]]);
    engine.setHighlightRow(-2);
    expect(r.setHighlightRow.mock.calls.at(-1)).toEqual([null]);
    engine.setHighlightRow(4);
    engine.detach();
    engine.attach({} as HTMLCanvasElement);
    expect(r.setHighlightRow.mock.calls.at(-1)).toEqual([4]);
    expect(measureName("row")).toBe("loopita:row-to-paint");
  });
});

describe("PreviewControls (estado de la vista, no del documento)", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it("Colores planos se recuerda en el navegador y llega al motor al registrarse y al cambiar", () => {
    const st = memory();
    const c = new PreviewControls(st);
    expect(c.flatColors).toBe(false);
    const target = { previewYarn: vi.fn(), setFlatColors: vi.fn() };
    const unbind = c.bind(target);
    expect(target.setFlatColors).toHaveBeenLastCalledWith(false);
    const l = vi.fn();
    c.subscribe(l);
    c.setFlatColors(true);
    expect(target.setFlatColors).toHaveBeenLastCalledWith(true);
    expect(l).toHaveBeenCalledTimes(1);
    expect(st.m.get(FLAT_COLORS_STORAGE_KEY)).toBe("1");
    expect(new PreviewControls(st).flatColors).toBe(true);
    unbind();
    c.previewYarn(0, { color: { hex: "#FFFFFF" } });
    expect(target.previewYarn).not.toHaveBeenCalled();
  });

  it("la vista previa activa pasa al motor que se registra después; un almacenamiento bloqueado no rompe", () => {
    const c = new PreviewControls({
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    });
    c.previewYarn(1, { color: { hex: "#000000" } });
    const target = { previewYarn: vi.fn(), setFlatColors: vi.fn() };
    c.bind(target);
    expect(target.previewYarn).toHaveBeenCalledWith(1, { color: { hex: "#000000" } });
    expect(() => c.setFlatColors(true)).not.toThrow();
    c.previewYarn(1, null);
    expect(c.preview).toBeNull();
  });

  it("un estudio, unos controles: el mismo almacén da el mismo objeto", () => {
    const s = new DocumentStore(doc());
    expect(previewControls(s)).toBe(previewControls(s));
    expect(previewControls(new DocumentStore(doc()))).not.toBe(previewControls(s));
  });
});

describe("recolector: entradas débiles (pointerover, focusin)", () => {
  it("un focusin provocado por una tecla no reemplaza a la tecla (la medición empieza en la tecla)", () => {
    let t = 0;
    const tasks: (() => void)[] = [];
    const rafs: (() => void)[] = [];
    const r = new PerfRecorder({ now: () => t, raf: (cb) => void rafs.push(cb), postTask: (cb) => void tasks.push(cb) });
    r.input("keydown", 100);
    r.input("focusin", 100 + WEAK_INPUT_SHADOW_MS - 1);
    t = 110;
    r.previewQueued({ change: "hover", editor: false });
    t = 130;
    r.previewFrameEnd();
    for (const cb of tasks.splice(0)) cb();
    expect(r.samples[0]?.t0).toBe(100);
  });

  it("pasado el margen, o si la entrada fuerte ya se usó, una entrada débil abre su propia medición", () => {
    let t = 0;
    const tasks: (() => void)[] = [];
    const r = new PerfRecorder({ now: () => t, raf: () => undefined, postTask: (cb) => void tasks.push(cb) });
    const paintOne = () => {
      r.previewQueued({ change: "hover", editor: false });
      r.previewFrameEnd();
      for (const cb of tasks.splice(0)) cb();
    };
    r.input("keydown", 0);
    t = WEAK_INPUT_SHADOW_MS + 1;
    r.input("pointerover", t);
    paintOne();
    t = 200;
    r.input("pointerover", t); // la anterior ya se usó
    paintOne();
    expect(r.samples.map((x) => x.t0)).toEqual([WEAK_INPUT_SHADOW_MS + 1, 200]);
    expect(r.samples.map((x) => x.kind)).toEqual(["hover", "hover"]);
  });

  it("React entra desde el pointerout: esa entrada abre la medición y el pointerover del mismo movimiento no abre otra", () => {
    let t = 0;
    const tasks: (() => void)[] = [];
    const r = new PerfRecorder({ now: () => t, raf: () => undefined, postTask: (cb) => void tasks.push(cb) });
    t = 103;
    r.input("pointerout", 100);
    r.previewQueued({ change: "hover", editor: false }); // onPointerEnter sintetizado desde el pointerout
    r.input("pointerover", 100);
    t = 120;
    r.previewFrameEnd();
    for (const cb of tasks.splice(0)) cb();
    t = 400;
    r.previewQueued({ change: "hover", editor: false }); // sin entrada nueva: no se mide
    r.previewFrameEnd();
    for (const cb of tasks.splice(0)) cb();
    expect(r.samples.map((x) => [x.kind, x.t0, x.ms])).toEqual([["hover", 100, 20]]);
  });

  it("una entrada débil vieja (vista hace más de WEAK_INPUT_TTL_MS) o un cambio que no es vista previa no se le atribuyen", () => {
    let t = 0;
    const r = new PerfRecorder({ now: () => t, raf: () => undefined, postTask: () => undefined });
    r.input("pointerover", 0);
    t = WEAK_INPUT_TTL_MS + 1;
    r.previewQueued({ change: "hover", editor: false });
    r.input("focusin", t);
    r.previewQueued({ change: "cells", editor: true });
    r.previewFrameEnd();
    expect(r.samples).toHaveLength(0);
    expect(r.summary().dropped).toBe(0);
  });
});
