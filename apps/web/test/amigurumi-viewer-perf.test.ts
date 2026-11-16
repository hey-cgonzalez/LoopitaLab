import { concreteRounds } from "@loopitalab/pattern-core";
import { describe, expect, it } from "vitest";
import { DEMOS } from "@/app/dev/visor-3d/demo-patterns.ts";
import { afterPaint } from "@/components/amigurumi/controller.ts";
import { keyCanEdit } from "@/components/amigurumi/viewer-perf-probe.ts";
import { sourceIndexByNumber, sourceIndexOfNumber } from "@/lib/amigurumi/rounds.ts";
import { addSpanSink, perfSpan } from "@/lib/studio/perf.ts";
import { FEEDBACK_TIMEOUT_MS, VIEWER_TIMEOUT_MS, ViewerPerfRecorder, activeViewerPerf, setActiveViewerPerf, viewerMeasureName, viewerPerfSpan, type ViewerPerfDeps } from "@/lib/amigurumi/viewer-perf.ts";

/*
 * Recolector del estudio amigurumi (T12 de la fase 4): `edit-to-feedback`, `edit-to-paint-3d` y `hover-to-paint-3d`.
 * Reloj, frames y tareas falsos, como `studio-perf.test.ts`.
 */
function harness() {
  let t = 0;
  let rafs: (() => void)[] = [];
  let posted: (() => void)[] = [];
  const measures: string[] = [];
  const deps: ViewerPerfDeps = {
    now: () => t,
    raf: (cb) => void rafs.push(cb),
    postTask: (cb) => void posted.push(cb),
    measure: (name) => void measures.push(name),
  };
  const rec = new ViewerPerfRecorder(deps);
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

describe("ViewerPerfRecorder", () => {
  it("una tecla del texto da edit-to-feedback y edit-to-paint-3d desde el keydown, no desde su input", () => {
    const h = harness();
    h.rec.input("keydown", 100, "text");
    h.rec.input("input", 102, "text"); // la misma tecla
    h.at(104);
    h.rec.feedbackQueued();
    h.rec.viewerQueued("edit");
    h.at(110);
    h.rec.viewerApplied();
    h.rec.feedbackDrawn(); // commit de React (fuera del frame)
    h.at(120);
    h.frame(); // el rAF del frame: el editor se pinta
    h.rec.viewerFrameEnd(); // r3f dibuja en el mismo frame
    h.at(125);
    h.tasks();
    const s = h.rec.summary();
    expect(s.metrics["edit-to-feedback"]?.text).toMatchObject({ n: 1, p50: 25 });
    expect(s.metrics["edit-to-paint-3d"]?.text).toMatchObject({ n: 1, p50: 25 });
    expect(h.measures).toEqual(["loopita:edit-to-feedback:text", "loopita:edit-to-paint-3d:text"]);
  });

  it("una flecha que no escribe no se atribuye como origen de la edición que viene enseguida", () => {
    const h = harness();
    h.rec.input("keydown", 100, "text", { editable: false }); // ArrowRight
    h.rec.input("input", 120, "text"); // pegar texto: otra acción
    h.at(125);
    h.rec.feedbackQueued();
    h.rec.feedbackDrawn();
    h.at(130);
    h.frame();
    h.tasks();
    expect(h.rec.summary().metrics["edit-to-feedback"]?.text).toMatchObject({ n: 1, p50: 10 });
    expect(keyCanEdit({ key: "ArrowRight", ctrlKey: false, metaKey: false, target: null })).toBe(false);
    expect(keyCanEdit({ key: "a", ctrlKey: false, metaKey: false, target: null })).toBe(true);
    expect(keyCanEdit({ key: "Backspace", ctrlKey: false, metaKey: false, target: null })).toBe(true);
    expect(keyCanEdit({ key: "ArrowUp", ctrlKey: false, metaKey: false, target: { tagName: "INPUT", type: "number" } as unknown as EventTarget })).toBe(true);
    expect(keyCanEdit({ key: "z", ctrlKey: true, metaKey: false, target: null })).toBe(false);
  });

  it("fuera de los límites, el editor se cierra sin esperar al 3D y la edición reemplazada se cierra con el frame de la última", () => {
    const h = harness();
    h.rec.input("keydown", 0, "text");
    h.at(2);
    h.rec.feedbackQueued();
    h.rec.viewerQueued("edit"); // reconstrucción diferida: todavía no llega al renderer
    h.rec.feedbackDrawn();
    h.at(16);
    h.frame();
    h.tasks();
    h.rec.input("keydown", 60, "text");
    h.at(62);
    h.rec.feedbackQueued();
    h.rec.viewerQueued("edit");
    h.rec.feedbackDrawn();
    h.at(70);
    h.frame();
    h.tasks();
    // La reconstrucción toma la última versión y la dibuja.
    h.at(300);
    h.rec.viewerApplied();
    h.at(310);
    h.rec.viewerFrameEnd();
    h.at(312);
    h.tasks();
    const s = h.rec.summary();
    expect(s.metrics["edit-to-feedback"]?.text).toMatchObject({ n: 2, max: 16 });
    expect(s.metrics["edit-to-paint-3d"]?.text).toMatchObject({ n: 2, max: 312 });
    expect(s.coalesced).toBe(1);
    expect(s.dropped).toEqual({ feedback: 0, viewer: 0 });
  });

  it("una vista previa durante una reconstrucción pendiente no cierra la edición pendiente", () => {
    const h = harness();
    h.rec.input("keydown", 0, "text");
    h.at(1);
    h.rec.viewerQueued("edit"); // diferida
    h.rec.input("pointerover", 30, "yarn");
    h.at(31);
    h.rec.viewerQueued("hover");
    h.rec.viewerApplied("latest");
    h.at(40);
    h.rec.viewerFrameEnd();
    h.tasks();
    let s = h.rec.summary();
    expect(s.metrics["hover-to-paint-3d"]?.hover?.n).toBe(1);
    expect(s.metrics["edit-to-paint-3d"]).toBeUndefined();
    h.at(200);
    h.rec.viewerApplied();
    h.rec.viewerFrameEnd();
    h.tasks();
    s = h.rec.summary();
    expect(s.metrics["edit-to-paint-3d"]?.text).toMatchObject({ n: 1, p50: 200 });
  });

  it("pasar el cursor abre una sola vista previa por movimiento; el clic que elige el color no cuenta como vista previa", () => {
    const h = harness();
    h.rec.input("pointerout", 10, "yarn");
    h.rec.input("pointerover", 10, "yarn");
    h.at(11);
    h.rec.viewerQueued("hover"); // salir del color anterior
    h.rec.viewerQueued("hover"); // entrar en el nuevo: la misma medición
    h.rec.viewerApplied();
    h.at(20);
    h.rec.viewerFrameEnd();
    h.tasks();
    h.rec.input("pointerdown", 200, "yarn");
    h.at(205);
    h.rec.viewerQueued("hover"); // quitar la vista previa al elegir
    h.rec.viewerQueued("edit"); // el color nuevo de la lana
    h.rec.viewerApplied();
    h.at(215);
    h.rec.viewerFrameEnd();
    h.tasks();
    const s = h.rec.summary();
    expect(s.metrics["hover-to-paint-3d"]?.hover).toMatchObject({ n: 1, p50: 10 });
    expect(s.metrics["edit-to-paint-3d"]?.yarn).toMatchObject({ n: 1, p50: 15 });
    expect(viewerMeasureName("hover-to-paint-3d", "hover")).toBe("loopita:hover-to-paint-3d");
  });

  it("una entrada débil vieja no se atribuye a una vista previa, ni una débil abre una edición", () => {
    const h = harness();
    h.rec.input("pointerover", 0, "yarn");
    h.at(200);
    h.rec.viewerQueued("hover");
    h.rec.input("pointerover", 300, "yarn");
    h.at(301);
    h.rec.viewerQueued("edit");
    h.rec.feedbackQueued();
    expect(h.rec.summary().metrics).toEqual({});
  });

  it("cuenta las ediciones que no llegan a su frame y las validaciones dentro de una ventana (CA4-P5)", () => {
    const h = harness();
    h.rec.input("keydown", 0, "blocks");
    h.at(1);
    h.rec.feedbackQueued();
    h.rec.viewerQueued("edit");
    h.at(Math.max(FEEDBACK_TIMEOUT_MS, VIEWER_TIMEOUT_MS) + 1);
    expect(h.rec.summary().dropped).toEqual({ feedback: 1, viewer: 1 });

    h.rec.reset();
    h.rec.input("keydown", 10_000, "text");
    h.at(10_001);
    h.rec.feedbackQueued();
    h.rec.span("validate:review", 10_002, 10_004); // dentro: entre la entrada y el frame
    h.rec.feedbackDrawn();
    h.at(10_016);
    h.frame();
    h.rec.span("validate:review", 10_017, 10_018); // después del frame: fuera
    h.tasks();
    const s = h.rec.summary();
    expect(s.spans).toMatchObject({ n: 2, insideFeedbackWindow: 1, insideViewerWindow: 0, byName: { "validate:review": 2 } });
  });

  it("los ganchos no hacen nada sin recolector activo, y `perfSpan` del colorwork también llega al del amigurumi", () => {
    setActiveViewerPerf(null);
    expect(activeViewerPerf()).toBeNull();
    expect(viewerPerfSpan("validate:review", () => 7)).toBe(7);
    const h = harness();
    setActiveViewerPerf(h.rec);
    try {
      expect(viewerPerfSpan("describe", () => 8)).toBe(8);
      const names: string[] = [];
      const off = addSpanSink((name) => names.push(name));
      expect(perfSpan("validate:autosave", () => 9)).toBe(9);
      off();
      perfSpan("validate:autosave", () => 0);
      expect(names).toEqual(["validate:autosave"]);
      expect(h.rec.spans.map((s) => s.name)).toEqual(["describe"]);
    } finally {
      setActiveViewerPerf(null);
    }
  });
});

describe("arreglos de T12 en el camino de la edición", () => {
  it("sourceIndexByNumber da lo mismo que sourceIndexOfNumber para cada número visible (rangos incluidos)", () => {
    for (const key of ["referencia", "limites-60k", "muneco", "panel"]) {
      for (const part of DEMOS.find((d) => d.key === key)!.build().parts) {
        const m = sourceIndexByNumber(part);
        const numbers = new Set(concreteRounds(part).map((c) => c.number));
        expect(m.size).toBe(numbers.size);
        for (const n of numbers) expect(m.get(n)).toBe(sourceIndexOfNumber(part, n));
        expect(m.get(9_999)).toBeUndefined();
      }
    }
  });

  it("afterPaint corre la tarea después del próximo frame, y se puede cancelar", () => {
    const rafs: Array<() => void> = [];
    const g = globalThis as unknown as { requestAnimationFrame?: (cb: () => void) => number; cancelAnimationFrame?: (id: number) => void };
    g.requestAnimationFrame = (cb) => rafs.push(cb);
    g.cancelAnimationFrame = (id) => void (rafs[id - 1] = () => {});
    try {
      const ran: string[] = [];
      afterPaint(() => ran.push("a"));
      const cancel = afterPaint(() => ran.push("b"));
      cancel();
      expect(rafs).toHaveLength(2);
      return new Promise<void>((resolve) => {
        for (const cb of rafs) cb(); // el frame: la tarea se publica, no corre todavía
        expect(ran).toEqual([]);
        setTimeout(() => {
          expect(ran).toEqual(["a"]);
          resolve();
        }, 20);
      });
    } finally {
      delete g.requestAnimationFrame;
      delete g.cancelAnimationFrame;
    }
  });
});
