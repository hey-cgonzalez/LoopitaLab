import {
  addYarn,
  fillRegion,
  paintCells,
  removeYarn,
  reorderYarns,
  resizeMotif,
  setRepeat,
  validateYarn,
  type Anchor,
  type CellRef,
  type Chart,
  type ChartPattern,
  type Gauge,
  type Yarn,
} from "@loopitalab/pattern-core";
import { gaugeProblems, normalizeTitle, titleProblems } from "./fields.ts";

/*
 * Almacén del documento del estudio (capa de aplicación, sin React).
 *
 * Fuente única de verdad (regla de oro 1): el estado es el documento canónico más su historial. No guarda
 * ninguna otra copia del patrón. Toda mutación pasa por las operaciones puras de pattern-core, que devuelven
 * el MISMO objeto cuando no cambian nada; en ese caso no se genera entrada de historial ni se avisa a nadie.
 * Ningún conteo se calcula aquí (CA-F2).
 */

/** Cuántos pasos de deshacer se conservan. Los documentos comparten estructura, pero cada pintado copia `cells` (hasta 40.000 números). */
export const HISTORY_LIMIT = 100;

export type EditAction =
  | { type: "paint"; refs: readonly CellRef[]; value: number }
  | { type: "fill"; start: CellRef; value: number }
  | { type: "resize"; width: number; height: number; anchor: Anchor; fill: number }
  | { type: "repeat"; x: number; y: number }
  | { type: "addYarn"; yarn: Yarn }
  | { type: "updateYarn"; index: number; yarn: Yarn }
  | { type: "removeYarn"; index: number; replaceWith: number }
  | { type: "reorderYarns"; order: readonly number[] }
  | { type: "setShape"; renderAs: Chart["renderAs"] }
  | { type: "setWorkedIn"; workedIn: Chart["workedIn"] }
  | { type: "setDirection"; direction: Chart["direction"] }
  /** `null` quita la muestra: el documento queda sin `gauge` (CA-F4). */
  | { type: "setGauge"; gauge: Gauge | null };

export interface StoreState {
  readonly doc: ChartPattern;
  /** Sube con cada cambio del documento (editar, deshacer, rehacer, reemplazar). Sirve para saber si hay algo sin guardar. */
  readonly revision: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export type FieldResult = { ok: true; changed: boolean } | { ok: false; problems: string[] };

type Listener = () => void;

export class DocumentStore {
  #doc: ChartPattern;
  #past: ChartPattern[] = [];
  #future: ChartPattern[] = [];
  #revision = 0;
  /** Trazo abierto: sus cambios comparten una sola entrada de deshacer. */
  #stroke: { pushed: boolean } | null = null;
  #listeners = new Set<Listener>();
  #state: StoreState;
  readonly #limit: number;

  constructor(doc: ChartPattern, opts: { historyLimit?: number } = {}) {
    this.#doc = doc;
    this.#limit = Math.max(1, opts.historyLimit ?? HISTORY_LIMIT);
    this.#state = this.#snapshot();
  }

  // ------------------------------------------------------------------ lectura (useSyncExternalStore)

  getState = (): StoreState => this.#state;

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  get doc(): ChartPattern {
    return this.#doc;
  }

  // ------------------------------------------------------------------ trazos

  /** Abre un trazo continuo (pincel con el botón apretado): todo lo que se pinte hasta `endStroke` se deshace de una vez. */
  beginStroke(): void {
    this.#stroke ??= { pushed: false };
  }

  endStroke(): void {
    this.#stroke = null;
  }

  // ------------------------------------------------------------------ edición

  /** Aplica una edición. Devuelve true si el documento cambió. */
  dispatch(action: EditAction): boolean {
    return this.#commit(this.#apply(this.#doc, action));
  }

  /** Título: solo entra al documento si es válido (1 a 120 caracteres, sin control). Si no, devuelve los motivos y el documento no cambia. */
  setTitle(raw: string): FieldResult {
    const problems = titleProblems(raw);
    if (problems.length > 0) return { ok: false, problems };
    const title = normalizeTitle(raw);
    // El título no entra al historial: el campo de texto tiene su propio deshacer, y deshacer el dibujo no debe revertir el nombre.
    if (title === this.#doc.title) return { ok: true, changed: false };
    this.#doc = { ...this.#doc, title };
    this.#bump();
    return { ok: true, changed: true };
  }

  /** Muestra: solo entra si ambos valores son mayores que cero. Entra al historial (CA-F9). */
  setGauge(gauge: Gauge | null): FieldResult {
    if (gauge !== null) {
      const problems = gaugeProblems(gauge);
      if (problems.length > 0) return { ok: false, problems };
    }
    return { ok: true, changed: this.dispatch({ type: "setGauge", gauge }) };
  }

  // ------------------------------------------------------------------ historial

  undo(): boolean {
    this.#stroke = null;
    const prev = this.#past.pop();
    if (!prev) return false;
    this.#future.push(this.#doc);
    this.#doc = this.#keepTitle(prev);
    this.#bump();
    return true;
  }

  redo(): boolean {
    this.#stroke = null;
    const next = this.#future.pop();
    if (!next) return false;
    this.#past.push(this.#doc);
    this.#doc = this.#keepTitle(next);
    this.#bump();
    return true;
  }

  /**
   * Reemplaza el documento entero (recuperar un respaldo local). Es un solo paso de deshacer.
   * Con `resetHistory` empieza de cero (recargar la versión del servidor).
   */
  replace(doc: ChartPattern, opts: { resetHistory?: boolean } = {}): void {
    this.#stroke = null;
    if (opts.resetHistory) {
      this.#past = [];
      this.#future = [];
    } else {
      this.#push(this.#doc);
      this.#future = [];
    }
    this.#doc = doc;
    this.#bump();
  }

  // ------------------------------------------------------------------ interno

  #apply(doc: ChartPattern, a: EditAction): ChartPattern {
    const chartOp = (chart: Chart): ChartPattern => (chart === doc.chart ? doc : { ...doc, chart });
    switch (a.type) {
      case "paint":
        return chartOp(paintCells(doc.chart, a.refs, a.value, doc.yarns.length));
      case "fill":
        return chartOp(fillRegion(doc.chart, a.start, a.value, doc.yarns.length));
      case "resize":
        return chartOp(resizeMotif(doc.chart, a.width, a.height, a.anchor, a.fill, doc.yarns.length));
      case "repeat":
        return chartOp(setRepeat(doc.chart, a.x, a.y));
      case "addYarn":
        return addYarn(doc, a.yarn);
      case "removeYarn":
        return removeYarn(doc, a.index, a.replaceWith);
      case "reorderYarns":
        return reorderYarns(doc, a.order);
      case "updateYarn": {
        // El id no cambia (las celdas apuntan por posición, pero el id lo usan las letras y el texto). Solo lanas válidas.
        const current = doc.yarns[a.index];
        if (!current || a.yarn.id !== current.id) return doc;
        if (validateYarn(a.yarn).some((i) => i.severity === "error")) return doc;
        if (JSON.stringify(current) === JSON.stringify(a.yarn)) return doc;
        return { ...doc, yarns: doc.yarns.map((y, i) => (i === a.index ? structuredClone(a.yarn) : y)) };
      }
      case "setShape":
        if (a.renderAs !== "flat" && a.renderAs !== "tube" && a.renderAs !== "circle" && a.renderAs !== "yoke") return doc;
        return a.renderAs === doc.chart.renderAs ? doc : chartOp({ ...doc.chart, renderAs: a.renderAs });
      case "setWorkedIn":
        if (a.workedIn !== "rounds" && a.workedIn !== "rows") return doc;
        return a.workedIn === doc.chart.workedIn ? doc : chartOp({ ...doc.chart, workedIn: a.workedIn });
      case "setDirection":
        if (a.direction !== "bottom_up" && a.direction !== "top_down") return doc;
        return a.direction === doc.chart.direction ? doc : chartOp({ ...doc.chart, direction: a.direction });
      case "setGauge": {
        if (a.gauge === null) {
          if (doc.gauge === undefined) return doc;
          const { gauge: _removed, ...rest } = doc;
          return rest;
        }
        // La muestra inválida (GAUGE) es un error estructural: nunca entra al documento, tampoco por esta vía.
        if (gaugeProblems(a.gauge).length > 0) return doc;
        const g = doc.gauge;
        if (g && g.stitchesPer10cm === a.gauge.stitchesPer10cm && g.rowsPer10cm === a.gauge.rowsPer10cm) return doc;
        // Se copian solo los dos campos: el documento es cerrado (ADR 0003, E16).
        return { ...doc, gauge: { stitchesPer10cm: a.gauge.stitchesPer10cm, rowsPer10cm: a.gauge.rowsPer10cm } };
      }
    }
  }

  #commit(next: ChartPattern): boolean {
    if (next === this.#doc) return false; // no-op: sin historial, sin aviso
    if (this.#stroke) {
      if (!this.#stroke.pushed) {
        this.#push(this.#doc);
        this.#stroke.pushed = true;
      }
    } else {
      this.#push(this.#doc);
    }
    this.#future = [];
    this.#doc = next;
    this.#bump();
    return true;
  }

  #push(doc: ChartPattern): void {
    this.#past.push(doc);
    if (this.#past.length > this.#limit) this.#past.shift();
  }

  /** Deshacer y rehacer restauran el dibujo, las lanas y la muestra, pero conservan el título actual. */
  #keepTitle(doc: ChartPattern): ChartPattern {
    return doc.title === this.#doc.title ? doc : { ...doc, title: this.#doc.title };
  }

  #snapshot(): StoreState {
    return { doc: this.#doc, revision: this.#revision, canUndo: this.#past.length > 0, canRedo: this.#future.length > 0 };
  }

  #bump(): void {
    this.#revision += 1;
    this.#state = this.#snapshot();
    for (const l of [...this.#listeners]) l();
  }
}
