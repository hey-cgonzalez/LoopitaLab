import { NO_STITCH, newChartPattern, validatePattern, type ChartPattern, type Yarn } from "@loopitalab/pattern-core";
import { describe, expect, it, vi } from "vitest";
import { DocumentStore, HISTORY_LIMIT } from "@/lib/studio/store.ts";

const yarnA: Yarn = { id: "A", weight: 4, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#F4EBD9" } };
const yarnB: Yarn = { id: "B", weight: 4, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#BA222C" } };

function base(over: Partial<Parameters<typeof newChartPattern>[0]> = {}): ChartPattern {
  return newChartPattern({
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    title: "Gorro",
    width: 4,
    height: 3,
    repeat: { x: 2, y: 1 },
    workedIn: "rounds",
    renderAs: "tube",
    direction: "bottom_up",
    yarns: [yarnA, yarnB],
    ...over,
  });
}

describe("almacén del documento: historial", () => {
  it("pintar genera una entrada; deshacer y rehacer restauran el mismo documento", () => {
    const s = new DocumentStore(base());
    const before = s.doc;
    expect(s.dispatch({ type: "paint", refs: [{ x: 1, y: 1 }], value: 1 })).toBe(true);
    const painted = s.doc;
    expect(painted).not.toBe(before);
    expect(s.getState().canUndo).toBe(true);
    expect(s.undo()).toBe(true);
    expect(s.doc).toBe(before);
    expect(s.getState().canRedo).toBe(true);
    expect(s.redo()).toBe(true);
    expect(s.doc).toBe(painted);
    expect(s.redo()).toBe(false);
  });

  it("un trazo continuo es una sola entrada de deshacer", () => {
    const s = new DocumentStore(base());
    const before = s.doc;
    s.beginStroke();
    for (let x = 0; x < 4; x++) s.dispatch({ type: "paint", refs: [{ x, y: 0 }], value: 1 });
    s.endStroke();
    s.dispatch({ type: "paint", refs: [{ x: 0, y: 2 }], value: 1 });
    s.undo(); // solo el último pintado
    expect(s.doc.chart.cells.slice(0, 4)).toEqual([1, 1, 1, 1]);
    s.undo(); // el trazo entero
    expect(s.doc).toBe(before);
    expect(s.getState().canUndo).toBe(false);
  });

  it("un trazo sin cambios no deja entrada, y el siguiente trazo vuelve a agrupar", () => {
    const s = new DocumentStore(base());
    s.beginStroke();
    s.dispatch({ type: "paint", refs: [{ x: 0, y: 0 }], value: 0 }); // ya es 0
    s.endStroke();
    expect(s.getState().canUndo).toBe(false);
    s.beginStroke();
    s.dispatch({ type: "paint", refs: [{ x: 0, y: 0 }], value: 1 });
    s.endStroke();
    s.beginStroke();
    s.dispatch({ type: "paint", refs: [{ x: 1, y: 0 }], value: 1 });
    s.endStroke();
    s.undo();
    expect(s.doc.chart.cells[0]).toBe(1);
    expect(s.doc.chart.cells[1]).toBe(0);
  });

  it("las operaciones que no cambian nada no generan historial ni avisan", () => {
    const s = new DocumentStore(base());
    const listener = vi.fn();
    s.subscribe(listener);
    const rev = s.getState().revision;
    const state = s.getState();
    expect(s.dispatch({ type: "paint", refs: [{ x: 0, y: 0 }], value: 0 })).toBe(false); // mismo valor
    expect(s.dispatch({ type: "paint", refs: [{ x: 99, y: 99 }], value: 1 })).toBe(false); // fuera de rango
    expect(s.dispatch({ type: "paint", refs: [{ x: 0, y: 0 }], value: 7 })).toBe(false); // lana inexistente
    expect(s.dispatch({ type: "fill", start: { x: 0, y: 0 }, value: 0 })).toBe(false);
    expect(s.dispatch({ type: "resize", width: 4, height: 3, anchor: "center", fill: 0 })).toBe(false);
    expect(s.dispatch({ type: "repeat", x: 2, y: 1 })).toBe(false);
    expect(s.dispatch({ type: "repeat", x: 0, y: 1 })).toBe(false);
    expect(s.dispatch({ type: "addYarn", yarn: yarnA })).toBe(false); // id repetido
    expect(s.dispatch({ type: "removeYarn", index: 0, replaceWith: 0 })).toBe(false);
    expect(s.dispatch({ type: "reorderYarns", order: [0, 1] })).toBe(false);
    expect(s.dispatch({ type: "setShape", renderAs: "tube" })).toBe(false);
    expect(s.dispatch({ type: "setDirection", direction: "bottom_up" })).toBe(false);
    expect(s.dispatch({ type: "setWorkedIn", workedIn: "rounds" })).toBe(false);
    expect(s.dispatch({ type: "setGauge", gauge: null })).toBe(false); // ya no tiene
    expect(listener).not.toHaveBeenCalled();
    expect(s.getState()).toBe(state);
    expect(s.getState().revision).toBe(rev);
    expect(s.getState().canUndo).toBe(false);
  });

  it("el historial tiene un límite", () => {
    expect(HISTORY_LIMIT).toBeGreaterThanOrEqual(50);
    const s = new DocumentStore(base({ width: 10, height: 10 }), { historyLimit: 3 });
    for (let i = 0; i < 6; i++) s.dispatch({ type: "paint", refs: [{ x: i, y: 0 }], value: 1 });
    let undone = 0;
    while (s.undo()) undone++;
    expect(undone).toBe(3);
    // Los 3 primeros pintados no se pudieron deshacer.
    expect(s.doc.chart.cells.slice(0, 6)).toEqual([1, 1, 1, 0, 0, 0]);
  });

  it("una edición nueva descarta lo que se podía rehacer", () => {
    const s = new DocumentStore(base());
    s.dispatch({ type: "paint", refs: [{ x: 0, y: 0 }], value: 1 });
    s.undo();
    expect(s.getState().canRedo).toBe(true);
    s.dispatch({ type: "paint", refs: [{ x: 1, y: 0 }], value: 1 });
    expect(s.getState().canRedo).toBe(false);
  });

  it("deshacer y rehacer cubren todo lo de CA-F9", () => {
    const s = new DocumentStore(base());
    const steps: Array<[string, () => void]> = [
      ["pintar", () => s.dispatch({ type: "paint", refs: [{ x: 1, y: 1 }], value: 1 })],
      ["rellenar", () => s.dispatch({ type: "fill", start: { x: 0, y: 2 }, value: 1 })],
      ["sin punto", () => s.dispatch({ type: "paint", refs: [{ x: 3, y: 0 }], value: NO_STITCH })],
      ["tamaño", () => s.dispatch({ type: "resize", width: 5, height: 4, anchor: "bottom_left", fill: 0 })],
      ["repeticiones", () => s.dispatch({ type: "repeat", x: 3, y: 2 })],
      ["agregar lana", () => s.dispatch({ type: "addYarn", yarn: { ...yarnB, id: "C" } })],
      ["editar lana", () => s.dispatch({ type: "updateYarn", index: 2, yarn: { ...yarnB, id: "C", color: { hex: "#112233" } } })],
      ["reordenar lanas", () => s.dispatch({ type: "reorderYarns", order: [1, 0, 2] })],
      ["quitar lana", () => s.dispatch({ type: "removeYarn", index: 2, replaceWith: 0 })],
      ["forma", () => s.dispatch({ type: "setShape", renderAs: "flat" })],
      ["dirección", () => s.dispatch({ type: "setDirection", direction: "top_down" })],
      ["en redondo / ida y vuelta", () => s.dispatch({ type: "setWorkedIn", workedIn: "rows" })],
      ["muestra", () => void s.setGauge({ stitchesPer10cm: 20, rowsPer10cm: 28 })],
      ["quitar muestra", () => void s.setGauge(null)],
    ];
    const snapshots: ChartPattern[] = [s.doc];
    for (const [name, run] of steps) {
      run();
      expect(s.doc, name).not.toBe(snapshots[snapshots.length - 1]);
      snapshots.push(s.doc);
    }
    for (let i = snapshots.length - 1; i > 0; i--) {
      expect(s.undo()).toBe(true);
      expect(s.doc, `deshacer paso ${i}`).toBe(snapshots[i - 1]);
    }
    expect(s.undo()).toBe(false);
    for (let i = 1; i < snapshots.length; i++) {
      expect(s.redo()).toBe(true);
      expect(s.doc, `rehacer paso ${i}`).toBe(snapshots[i]);
    }
    expect(validatePattern(s.doc).savable).toBe(true);
  });

  it("updateYarn solo acepta lanas válidas y con el mismo id", () => {
    const s = new DocumentStore(base());
    expect(s.dispatch({ type: "updateYarn", index: 0, yarn: { ...yarnA, id: "Z" } })).toBe(false);
    expect(s.dispatch({ type: "updateYarn", index: 0, yarn: { ...yarnA, composition: [{ fiber: "lana", percent: 50 }] } })).toBe(false);
    expect(s.dispatch({ type: "updateYarn", index: 5, yarn: yarnA })).toBe(false);
    expect(s.dispatch({ type: "updateYarn", index: 0, yarn: yarnA })).toBe(false); // igual
  });

  it("replace() es un paso de deshacer; con resetHistory empieza de cero", () => {
    const s = new DocumentStore(base());
    const before = s.doc;
    const other = base({ title: "Otro" });
    s.replace(other);
    expect(s.doc).toBe(other);
    s.undo();
    expect(s.doc.title).toBe("Otro"); // el título no se revierte
    expect(s.doc.chart).toBe(before.chart);
    s.replace(other, { resetHistory: true });
    expect(s.getState().canUndo).toBe(false);
  });
});

describe("almacén del documento: título y muestra solo entran si son válidos", () => {
  it("rechaza títulos vacíos, de solo espacios, demasiado largos o con caracteres de control", () => {
    const s = new DocumentStore(base());
    const doc = s.doc;
    const listener = vi.fn();
    s.subscribe(listener);
    for (const bad of ["", "   ", "x".repeat(121), "a\u0000b", "a\u0007b"]) {
      const r = s.setTitle(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.problems.length).toBeGreaterThan(0);
      expect(s.doc).toBe(doc);
    }
    expect(listener).not.toHaveBeenCalled();
    expect(validatePattern(s.doc).savable).toBe(true);
  });

  it("acepta un título válido (sin espacios sobrantes, 120 caracteres como máximo) y es idempotente", () => {
    const s = new DocumentStore(base());
    expect(s.setTitle("  Gorro nuevo  ")).toEqual({ ok: true, changed: true });
    expect(s.doc.title).toBe("Gorro nuevo");
    expect(s.setTitle("Gorro nuevo")).toEqual({ ok: true, changed: false });
    expect(s.setTitle("ñ".repeat(120)).ok).toBe(true);
    expect(s.setTitle("🧶".repeat(120)).ok).toBe(true); // 120 puntos de código
    expect(s.setTitle("🧶".repeat(121)).ok).toBe(false);
    expect(validatePattern(s.doc).savable).toBe(true);
  });

  it("deshacer el dibujo no revierte el título", () => {
    const s = new DocumentStore(base());
    s.dispatch({ type: "paint", refs: [{ x: 0, y: 0 }], value: 1 });
    s.setTitle("Nuevo nombre");
    s.undo();
    expect(s.doc.title).toBe("Nuevo nombre");
    s.redo();
    expect(s.doc.title).toBe("Nuevo nombre");
  });

  it("rechaza muestras no positivas o no numéricas y deja el documento sin gauge", () => {
    const s = new DocumentStore(base());
    const doc = s.doc;
    for (const bad of [
      { stitchesPer10cm: 0, rowsPer10cm: 28 },
      { stitchesPer10cm: 20, rowsPer10cm: -1 },
      { stitchesPer10cm: Number.NaN, rowsPer10cm: 28 },
      { stitchesPer10cm: Infinity, rowsPer10cm: 28 },
    ]) {
      const r = s.setGauge(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      expect(s.doc).toBe(doc);
    }
    expect("gauge" in s.doc).toBe(false);
    expect(s.dispatch({ type: "setGauge", gauge: { stitchesPer10cm: 0, rowsPer10cm: 5 } })).toBe(false); // tampoco entra por el despacho directo
  });

  it("sin muestra el documento no tiene gauge; al quitarla, la clave desaparece (CA-F4)", () => {
    const s = new DocumentStore(base());
    expect("gauge" in s.doc).toBe(false);
    expect(s.setGauge({ stitchesPer10cm: 22, rowsPer10cm: 30 })).toEqual({ ok: true, changed: true });
    expect(s.doc.gauge).toEqual({ stitchesPer10cm: 22, rowsPer10cm: 30 });
    expect(s.setGauge(null)).toEqual({ ok: true, changed: true });
    expect("gauge" in s.doc).toBe(false);
    expect(validatePattern(s.doc).savable).toBe(true);
  });
});
