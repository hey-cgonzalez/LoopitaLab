import { type ChartPattern, type Gauge, type Yarn } from "@loopitalab/pattern-core";
import { FIBERS } from "@loopitalab/yarn-catalog";
import {
  colorize,
  createCanvasRenderer,
  fitView,
  layoutGeometry,
  lookInputKey,
  lookKey,
  needsRelayout,
  yarnLook,
  type RendererOptions,
  type YarnLook,
  type StitchLayout,
  type StitchRenderer,
} from "@loopitalab/stitch-render";
import { gaugeInUse } from "@/lib/studio/measures.ts";
import { paintGate } from "@/lib/studio/paint-gate.ts";
import { activePerf, type PreviewChange } from "@/lib/studio/perf.ts";
import { diffCharts, isRingDistorted, planPreview, type PreviewPlan } from "@/lib/studio/preview-plan.ts";
import type { DocumentStore } from "@/lib/studio/store.ts";
import type { PreviewTarget, YarnCandidate } from "./preview-controls.ts";

/*
 * PUNTO DE INTEGRACIÓN con `render-puntos` (T10).
 *
 * El motor de la vista previa vive fuera de React: el documento llega por `update(doc, gauge)` y el canvas se actualiza
 * sin volver a renderizar un árbol proporcional al número de puntos (ADR 0004, reglas de integración). Camino de cada edición:
 *
 *   store.subscribe → engine.connect → engine.update      (sin pasar por React, T10)
 *      ├─ solo casillas: colorize(layout, chart, celdas) → renderer.invalidate → requestRender   (camino rápido)
 *      └─ forma / repeticiones / tamaño / dirección / muestra / máscara del círculo: layoutGeometry → setLayout
 *
 * Contrato estable usado (ADR 0004 E5): createCanvasRenderer, layoutInstanceCount (vía `planPreview`), layoutGeometry,
 * colorize, needsRelayout, yarnLook, fitView, zoomAt/panBy (en el componente). Nada interno.
 * Errores: RangeError (sobre el tope o muestra inválida) y TypeError (gráfico mal formado) se capturan y se informan;
 * la interfaz sigue viva.
 *
 * Agrupación por frame (T10): `update` es síncrono y barato en el camino rápido (`colorize` de las casillas cambiadas);
 * el dibujo se agrupa con `requestRender`, así varias pinceladas dentro de un mismo frame se pintan una vez.
 * Instrumentación `edit-to-paint` (solo con el recolector activo, `?perf=1`): `previewQueued` al encolar un cambio y
 * `previewFrameEnd` al terminar cada frame del renderer (opción `schedule`, contrato de `RendererOptions`).
 *
 * Fase 3 (T8, ADR 0008 §3 y §4):
 * - Aspecto por fibra activado por defecto (`yarnLook(..., { fiberEffects: true })`); "Colores planos" lo apaga
 *   (`setFlatColors`, preferencia de vista, no del documento).
 * - El aspecto se recalcula si cambia `lookInputKey` (color, grosor, fibras y porcentajes) y solo se vuelve a dibujar
 *   si cambia el aspecto resultante (`lookKey`): cambiar 70/30 a 30/70 lana/mohair se ve; cambiar el grosor, no.
 * - `previewYarn(i, candidato)`: vista previa al pasar el cursor (`setPreviewOverride`), sin tocar el documento, con
 *   instrumentación `hover-to-paint`.
 * - `setHighlightRow(fila)`: fila resaltada del modo tejiendo, con instrumentación `row-to-paint` (CA3-P3).
 */

export type EngineStatus =
  | { kind: "ok"; slow: boolean; count: number; distorted: boolean }
  | { kind: "too-large"; count: number }
  | { kind: "error"; message: string };

const BACKGROUND = "#EFE9DF";
const FIT_MARGIN = 12;

export class PreviewEngine implements PreviewTarget {
  #renderer: StitchRenderer | null = null;
  #layout: StitchLayout | null = null;
  #doc: ChartPattern | null = null;
  #gauge: Gauge | null = null;
  /** Clave de entrada de los aspectos (`lookInputKey` de cada lana) y claves de los aspectos dibujados. */
  #yarnsKey = "";
  #lookKeys: string[] = [];
  /** "Colores planos": aspecto neutro (sin halo, brillo ni definición por fibra). */
  #flat = false;
  /** Vista previa al pasar el cursor, y la clave del aspecto que se le pasó al renderer (`""` = ninguno). */
  #preview: { index: number; candidate: YarnCandidate } | null = null;
  #previewKey = "";
  #highlightRow: number | null = null;
  #cssW = 0;
  #cssH = 0;
  #tubeRotation = 0;
  #status: EngineStatus = { kind: "ok", slow: false, count: 0, distorted: false };
  /** Recálculo de la geometría pendiente para el próximo frame (`refit`: reencuadrar al terminar). */
  #pendingRelayout: { refit: boolean } | null = null;
  /** El usuario movió o acercó la vista: un cambio de casillas no la reencuadra. */
  #userView = false;
  onStatus: ((s: EngineStatus) => void) | null = null;
  onFrame: ((ms: number) => void) | null = null;

  /** `makeRenderer` existe para las pruebas (un doble de `StitchRenderer`); el estudio usa Canvas 2D. */
  readonly #makeRenderer: (canvas: HTMLCanvasElement, opts: RendererOptions) => StitchRenderer;
  constructor(makeRenderer: (canvas: HTMLCanvasElement, opts: RendererOptions) => StitchRenderer = createCanvasRenderer) {
    this.#makeRenderer = makeRenderer;
  }

  attach(canvas: HTMLCanvasElement): void {
    this.#renderer = this.#makeRenderer(canvas, {
      background: BACKGROUND,
      onFrame: (f) => this.onFrame?.(f.ms),
      // El dibujo se agrupa por frame (`requestRender`); al terminar cada frame se avisa al recolector `edit-to-paint`,
      // haya dibujado o no (`flush` no dibuja si no hay nada sucio).
      schedule: (cb) =>
        void requestAnimationFrame(() => {
          // La geometría nueva se calcula aquí, justo antes de dibujar: varios cambios en un mismo frame
          // (ancho y alto de las repeticiones, la rotación del tubo arrastrada) calculan la disposición una sola vez.
          try {
            this.#runPendingRelayout();
          } finally {
            // Aunque el recálculo falle con un error inesperado, el renderer dibuja y sigue programando frames.
            cb();
            // Primero se marca el fin del frame (CA-P7): `painted()` libera trabajo diferido (validación), y si el
            // recolector marcara después, ese trabajo quedaría contado dentro de la ventana de la edición.
            activePerf()?.previewFrameEnd();
            paintGate.painted();
          }
        }),
    });
    if (this.#cssW > 0) this.#renderer.resize(this.#cssW, this.#cssH, window.devicePixelRatio || 1);
    this.#previewKey = "";
    this.#applyLooks(true);
    if (this.#highlightRow !== null) this.#renderer.setHighlightRow(this.#highlightRow);
    if (this.#doc && this.#gauge) {
      const d = this.#doc;
      const g = this.#gauge;
      this.#doc = null;
      this.update(d, g);
    }
  }

  detach(): void {
    this.#pendingRelayout = null;
    this.#renderer?.destroy();
    this.#renderer = null;
    this.#layout = null;
  }

  get renderer(): StitchRenderer | null {
    return this.#renderer;
  }

  get status(): EngineStatus {
    return this.#status;
  }

  resize(cssW: number, cssH: number): void {
    if (cssW <= 0 || cssH <= 0) return;
    this.#cssW = cssW;
    this.#cssH = cssH;
    this.#renderer?.resize(cssW, cssH, window.devicePixelRatio || 1);
    if (!this.#userView) this.fit();
    else this.#renderer?.requestRender();
  }

  fit(): void {
    this.#userView = false;
    if (!this.#layout || !this.#renderer || this.#cssW <= 0) return;
    this.#renderer.setView(fitView(this.#layout.bounds, this.#cssW, this.#cssH, FIT_MARGIN));
    this.#renderer.requestRender();
  }

  markUserView(): void {
    this.#userView = true;
  }

  /**
   * Conecta el motor directo al almacén (T10): cada cambio del documento llega a `update` sin pasar por React,
   * así una pincelada no espera a que se vuelva a renderizar ningún componente. Devuelve la desconexión.
   * Solo reacciona si cambió algo que la vista dibuja (gráfico, lanas o muestra en uso); el título, por ejemplo, no.
   */
  connect(store: DocumentStore): () => void {
    let lastChart: unknown = null;
    let lastYarns: unknown = null;
    let lastSt = Number.NaN;
    let lastRw = Number.NaN;
    const sync = () => {
      const doc = store.doc;
      const use = gaugeInUse(doc);
      if (!use) return;
      const g = use.gauge;
      if (doc.chart === lastChart && doc.yarns === lastYarns && g.stitchesPer10cm === lastSt && g.rowsPer10cm === lastRw) return;
      lastChart = doc.chart;
      lastYarns = doc.yarns;
      lastSt = g.stitchesPer10cm;
      lastRw = g.rowsPer10cm;
      this.update(doc, g);
    };
    sync();
    return store.subscribe(sync);
  }

  setTubeRotation(rad: number): void {
    if (rad === this.#tubeRotation) return;
    this.#tubeRotation = rad;
    if (this.#doc && this.#gauge && this.#doc.chart.renderAs !== "flat" && this.#doc.chart.renderAs !== "circle") this.#requestRelayout(false);
  }

  /** "Colores planos" activo. */
  get flatColors(): boolean {
    return this.#flat;
  }

  /** "Colores planos" (ADR 0008 §4): preferencia de la vista; el documento no cambia. */
  setFlatColors(flat: boolean): void {
    if (flat === this.#flat) return;
    this.#flat = flat;
    if (!this.#doc || !this.#renderer) return;
    try {
      const changed = this.#applyLooks();
      const previewChanged = this.#applyPreview();
      if (changed || previewChanged) this.#queued({ change: "looks", editor: false });
      this.#renderer.requestRender();
    } catch (e) {
      this.#fail(e);
    }
  }

  #lookOf(y: Pick<Yarn, "color" | "composition"> & Partial<Pick<Yarn, "weight">>): YarnLook {
    return yarnLook(y, FIBERS, { fiberEffects: !this.#flat });
  }

  /**
   * Vista previa de la lana `index` con otro aspecto, sin tocar el documento (ADR 0008 §3). `null` la quita.
   * No pasa por el almacén ni por el historial: no dispara autoguardado ni validación (CA3-P4).
   */
  previewYarn(index: number, candidate: YarnCandidate | null): void {
    this.#preview = candidate && Number.isInteger(index) && index >= 0 ? { index, candidate } : null;
    if (!this.#doc || !this.#renderer) return;
    try {
      if (this.#applyPreview()) {
        this.#queued({ change: "hover", editor: false });
        this.#renderer.requestRender();
      }
    } catch (e) {
      this.#fail(e);
    }
  }

  /** Fila resaltada (modo tejiendo), en filas del gráfico completo; `null` la quita. */
  setHighlightRow(row: number | null): void {
    const r = row !== null && Number.isInteger(row) && row >= 0 ? row : null;
    if (r === this.#highlightRow) return;
    this.#highlightRow = r;
    if (!this.#renderer) return;
    this.#renderer.setHighlightRow(r);
    this.#queued({ change: "row", editor: false });
    this.#renderer.requestRender();
  }

  get highlightRow(): number | null {
    return this.#highlightRow;
  }

  /** Pasa la vista previa al renderer si cambió su aspecto. Devuelve true si cambió lo que se ve. */
  #applyPreview(): boolean {
    const r = this.#renderer;
    const doc = this.#doc;
    if (!r || !doc) return false;
    const p = this.#preview;
    const base = p ? doc.yarns[p.index] : undefined;
    if (!p || !base) {
      if (this.#previewKey === "") return false;
      this.#previewKey = "";
      r.setPreviewOverride(null);
      return true;
    }
    const look = this.#lookOf({ ...base, color: p.candidate.color, composition: p.candidate.composition ?? base.composition });
    const key = `${p.index}|${lookKey(look)}`;
    if (key === this.#previewKey) return false;
    this.#previewKey = key;
    r.setPreviewOverride({ yarn: p.index, look });
    return true;
  }

  /** Devuelve true si cambió el aspecto de alguna lana (o la vista previa al pasar el cursor, que depende de ellas). */
  #applyLooks(force = false): boolean {
    if (!this.#doc || !this.#renderer) return false;
    const fx = { fiberEffects: !this.#flat };
    const key = this.#doc.yarns.map((y) => lookInputKey(y, fx)).join(",");
    if (!force && key === this.#yarnsKey) return false;
    this.#yarnsKey = key;
    // La vista previa se arma sobre la lana del documento (composición, si el candidato no trae): puede cambiar.
    const previewChanged = this.#applyPreview();
    const looks = this.#doc.yarns.map((y) => this.#lookOf(y));
    const keys = looks.map(lookKey);
    if (!force && keys.length === this.#lookKeys.length && keys.every((k, i) => k === this.#lookKeys[i])) return previewChanged;
    this.#lookKeys = keys;
    this.#renderer.setLooks(looks);
    return true;
  }

  /** Cambio encolado: cierra la compuerta hasta el frame y avisa al recolector `edit-to-paint` (si está activo). */
  #queued(c: PreviewChange): void {
    // La compuerta retiene el trabajo diferido (validación del autoguardado) hasta que este cambio se pinte (CA-P7).
    paintGate.editQueued();
    activePerf()?.previewQueued(c);
  }

  #set(status: EngineStatus): void {
    const p = this.#status;
    this.#status = status;
    // Sin aviso si no cambió nada que la interfaz muestre: evita volver a renderizar el panel en cada recálculo.
    if (JSON.stringify(p) === JSON.stringify(status)) return;
    this.onStatus?.(status);
  }

  /** Actualiza la vista con el documento. Nunca lanza. */
  update(doc: ChartPattern, gauge: Gauge): void {
    const prev = this.#doc;
    const prevGauge = this.#gauge;
    this.#doc = doc;
    this.#gauge = gauge;
    if (!this.#renderer) return;
    try {
      const looksChanged = this.#applyLooks();
      const diff = prev && this.#layout ? diffCharts(prev.chart, doc.chart, prevGauge ?? undefined, gauge) : ({ kind: "relayout" } as const);
      const editor = !prev || prev.chart !== doc.chart || prev.yarns !== doc.yarns;
      const repeats = !!prev && (prev.chart.repeat.x !== doc.chart.repeat.x || prev.chart.repeat.y !== doc.chart.repeat.y);
      if (this.#pendingRelayout) {
        // Ya hay una geometría nueva en camino: se calculará con este documento (la disposición actual es vieja,
        // no se colorea). Se agrupa con la pendiente.
        if (diff.kind !== "same" || looksChanged) this.#queued({ change: diff.kind === "cells" ? "cells" : repeats ? "repeats" : diff.kind === "same" ? "looks" : "relayout", editor });
        this.#requestRelayout(diff.kind === "relayout");
        return;
      }
      if (diff.kind === "same") {
        if (looksChanged) this.#queued({ change: "looks", editor });
        this.#renderer.requestRender();
        return;
      }
      if (diff.kind === "cells" && this.#layout && !needsRelayout(this.#layout, doc.chart, diff.cells)) {
        this.#queued({ change: "cells", editor });
        this.#renderer.invalidate(colorize(this.#layout, doc.chart, diff.cells));
        this.#renderer.requestRender();
        return;
      }
      this.#queued({ change: diff.kind === "cells" ? "cells" : repeats ? "repeats" : "relayout", editor });
      this.#requestRelayout(!prev || diff.kind === "relayout");
    } catch (e) {
      this.#fail(e);
    }
  }

  #requestRelayout(refit: boolean): void {
    if (!this.#renderer) return;
    this.#pendingRelayout = { refit: refit || (this.#pendingRelayout?.refit ?? false) };
    this.#renderer.requestRender();
  }

  #runPendingRelayout(): void {
    const p = this.#pendingRelayout;
    if (!p) return;
    this.#pendingRelayout = null;
    this.#relayout(p.refit);
  }

  #relayout(refit: boolean): void {
    const doc = this.#doc;
    const gauge = this.#gauge;
    const renderer = this.#renderer;
    if (!doc || !gauge || !renderer) return;
    const plan: PreviewPlan = planPreview(doc.chart);
    if (plan.kind === "too-large") {
      // No se dibuja: layoutGeometry lanzaría RangeError. La interfaz muestra el aviso.
      this.#layout = null;
      this.#set({ kind: "too-large", count: plan.count });
      return;
    }
    try {
      const layout = layoutGeometry(doc.chart, { gauge, tubeRotation: this.#tubeRotation });
      colorize(layout, doc.chart);
      this.#layout = layout;
      renderer.setLayout(layout);
      if (refit && !this.#userView) this.fit();
      renderer.requestRender();
      this.#set({ kind: "ok", slow: plan.kind === "slow", count: plan.count, distorted: isRingDistorted(layout.ringDistortion) });
    } catch (e) {
      this.#fail(e);
    }
  }

  #fail(e: unknown): void {
    if (e instanceof RangeError || e instanceof TypeError) {
      this.#layout = null;
      this.#set({ kind: "error", message: e.message });
      return;
    }
    throw e;
  }
}
