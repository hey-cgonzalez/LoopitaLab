import {
  addPart,
  addYarn,
  insertItem,
  insertRound,
  moveItem,
  movePart,
  removeItem,
  removePart,
  removeRound,
  removeYarn,
  renamePart,
  reorderYarns,
  clearPlacement,
  setAssembly,
  setPlacement,
  replacePartRounds,
  replaceRound,
  setCopies,
  setPartConstruction,
  setPartFinish,
  setPartStart,
  setPartStartYarn,
  unwrapGroup,
  updateItem,
  validateYarn,
  wrapInGroup,
  type Gauge,
  type Item,
  type ItemPath,
  type Part,
  type PartRef,
  type Placement,
  type Round,
  type WrittenPattern,
  type Yarn,
} from "@loopitalab/pattern-core";
import { gaugeProblems, normalizeTitle, titleProblems } from "@/lib/studio/fields.ts";
import type { FieldResult } from "@/lib/studio/store.ts";
import type { YarnAction, YarnEditStore } from "@/lib/studio/yarn-store.ts";
import { deepEqual } from "./equal.ts";

/*
 * Almacén del documento del estudio amigurumi (T14 de la fase 4; ADR 0011, secciones 6 y 7), fuera de React.
 *
 * Fuente única de verdad (regla de oro 1): el estado es el documento canónico más su historial. El texto de cada
 * parte NO vive aquí: es `formatPart(part, dialecto)`, y lo que no se pudo leer vive en el editor y en el respaldo
 * local (`TextBuffers`). Toda mutación pasa por las operaciones puras de `pattern-core` (`edit.ts` y
 * `edit-written.ts`), que devuelven el MISMO objeto cuando no cambian nada o cuando el cambio rompería un tope duro;
 * en ese caso no hay historial ni aviso. Ningún conteo se calcula aquí.
 *
 * `subscribe` y `getSnapshot` alimentan al editor, a la lista de partes y al visor 3D (`PatternSource`).
 */

export const WRITTEN_HISTORY_LIMIT = 100;

export type WrittenAction =
  | YarnAction
  /** Parte leída del texto (`parsePart`): encabezados, vueltas, cierre y cantidad. */
  | { type: "applyPart"; partId: string; part: Part }
  | { type: "addPart"; part: Part; index?: number }
  | { type: "renamePart"; partId: string; name: string }
  | { type: "movePart"; partId: string; toIndex: number }
  | { type: "removePart"; partId: string }
  | { type: "setCopies"; partId: string; copies: number }
  // Editor de bloques (T15): una acción = un paso de deshacer. Las rutas son `ItemPath` (ADR 0011, T6-4: `to` es la
  // ruta después de mover). Ninguna sabe de la política de la interfaz: eso es de `canEditBlock`.
  | { type: "insertRound"; partId: string; index: number; round: Round }
  | { type: "removeRound"; partId: string; index: number }
  | { type: "replaceRound"; partId: string; index: number; round: Round }
  | { type: "insertItem"; partId: string; roundIndex: number; path: ItemPath; item: Item }
  | { type: "updateItem"; partId: string; roundIndex: number; path: ItemPath; item: Item }
  | { type: "removeItem"; partId: string; roundIndex: number; path: ItemPath }
  | { type: "moveItem"; partId: string; roundIndex: number; from: ItemPath; to: ItemPath }
  | { type: "wrapInGroup"; partId: string; roundIndex: number; from: ItemPath; to: ItemPath; times: number }
  | { type: "unwrapGroup"; partId: string; roundIndex: number; path: ItemPath }
  // Posicionado y armado (T16; ADR 0011, secciones 2 y 9). Un gesto = un paso de deshacer: arrastrar un control de
  // giro va dentro de una ráfaga (`beginStroke`/`endStroke`).
  /** Ubica una copia (reemplaza su ubicación anterior). Sin cambios si dejaría un error estructural (ciclo, topes). */
  | { type: "setPlacement"; placement: Placement }
  /** "Quitar posición": la copia pasa a ubicarse sola. */
  | { type: "clearPlacement"; ref: PartRef }
  /** Pasos de armado que escribe la diseñadora (`assembly`); los vacíos se quitan. */
  | { type: "setAssembly"; steps: readonly string[] }
  /** `null` quita la muestra (las medidas pasan a "supuesto"). */
  | { type: "setGauge"; gauge: Gauge | null };

export interface WrittenStoreState {
  readonly doc: WrittenPattern;
  readonly revision: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface ActionResult {
  doc: WrittenPattern;
  changed: boolean;
  /** Piezas que quedaron sin ubicar (`removePart` y `setCopies`; CA4-E8). */
  unplaced: PartRef[];
  /**
   * `applyPart`: false si el documento no tomó la parte completa (un tope duro del núcleo lo impidió). La interfaz
   * lo informa y el texto queda como pendiente.
   */
  applied: boolean;
}

type Listener = () => void;

const sameStart = (a: Part["start"], b: Part["start"]) => a.type === b.type && (a.type !== "chain" || (b.type === "chain" && a.count === b.count));
const copiesOf = (p: Part) => (typeof p.copies === "number" ? p.copies : 1);

/**
 * Aplica una parte leída del texto como operaciones de `edit-written.ts` (`replacePartRounds` más los encabezados).
 * Cada operación rechaza un error estructural nuevo, así que el orden importa cuando cambian a la vez el inicio y la
 * construcción (una cadeneta de 1 no vale en hileras): se hace una segunda pasada con lo que faltó. La cantidad va al
 * final con `setCopies`, que quita las posiciones de las copias que dejan de existir.
 */
export function applyPartFromText(doc: WrittenPattern, partId: string, target: Part): { doc: WrittenPattern; unplaced: PartRef[]; applied: boolean } {
  const find = (d: WrittenPattern) => d.parts.find((p) => p.id === partId);
  if (!find(doc)) return { doc, unplaced: [], applied: false };
  let d = doc;
  for (let pass = 0; pass < 2; pass++) {
    const p = find(d) as Part;
    if (p.name !== target.name) d = renamePart(d, partId, target.name);
    if (!sameStart(p.start, target.start)) d = setPartStart(d, partId, target.start);
    if (p.construction !== target.construction) d = setPartConstruction(d, partId, target.construction);
    if (p.startYarn !== target.startYarn) d = setPartStartYarn(d, partId, target.startYarn);
    if (p.finish !== target.finish) d = setPartFinish(d, partId, target.finish);
    if (!deepEqual(p.rounds, target.rounds)) d = replacePartRounds(d, partId, target.rounds);
    if (sameBody(find(d) as Part, target)) break;
  }
  let unplaced: PartRef[] = [];
  const now = find(d) as Part;
  if (copiesOf(now) !== copiesOf(target)) {
    const r = setCopies(d, partId, copiesOf(target));
    d = r.pattern;
    unplaced = r.unplaced;
  }
  const final = find(d) as Part;
  return { doc: d, unplaced, applied: sameBody(final, target) && copiesOf(final) === copiesOf(target) };
}

/** La parte coincide en todo salvo `copies` (que se aplica aparte). */
function sameBody(a: Part, b: Part): boolean {
  const { copies: _a, ...ra } = a;
  const { copies: _b, ...rb } = b;
  return deepEqual(ra, rb);
}

export class WrittenStore implements YarnEditStore {
  #doc: WrittenPattern;
  #past: WrittenPattern[] = [];
  #future: WrittenPattern[] = [];
  #revision = 0;
  #stroke: { pushed: boolean } | null = null;
  #listeners = new Set<Listener>();
  #state: WrittenStoreState;
  readonly #limit: number;

  constructor(doc: WrittenPattern, opts: { historyLimit?: number } = {}) {
    this.#doc = doc;
    this.#limit = Math.max(1, opts.historyLimit ?? WRITTEN_HISTORY_LIMIT);
    this.#state = this.#snapshot();
  }

  // ------------------------------------------------------------------ lectura

  getState = (): WrittenStoreState => this.#state;
  /** Documento actual (`PatternSource` del visor). */
  getSnapshot = (): WrittenPattern => this.#doc;

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  get doc(): WrittenPattern {
    return this.#doc;
  }

  // ------------------------------------------------------------------ ráfagas (un paso de deshacer)

  beginStroke(): void {
    this.#stroke ??= { pushed: false };
  }

  endStroke(): void {
    this.#stroke = null;
  }

  // ------------------------------------------------------------------ edición

  /** Resultado de una acción sin aplicarla (para el diálogo de límites recomendados y el aviso de piezas sin ubicar). */
  simulate(action: WrittenAction): ActionResult {
    return this.#apply(this.#doc, action);
  }

  /** Aplica una acción y devuelve su resultado completo. */
  run(action: WrittenAction): ActionResult {
    const r = this.#apply(this.#doc, action);
    if (r.changed) this.#commit(r.doc);
    return r;
  }

  /** Aplica una acción. Devuelve true si el documento cambió (contrato de `YarnEditStore`). */
  dispatch(action: WrittenAction): boolean {
    return this.run(action).changed;
  }

  /** Título: fuera del historial, como en el colorwork. Solo entra si es válido. */
  setTitle(raw: string): FieldResult {
    const problems = titleProblems(raw);
    if (problems.length > 0) return { ok: false, problems };
    const title = normalizeTitle(raw);
    if (title === this.#doc.title) return { ok: true, changed: false };
    this.#doc = { ...this.#doc, title };
    this.#bump();
    return { ok: true, changed: true };
  }

  /** Muestra: solo entra si los dos valores son válidos. Entra al historial. */
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

  /** Reemplaza el documento (recuperar un respaldo): un paso de deshacer, o desde cero con `resetHistory`. */
  replace(doc: WrittenPattern, opts: { resetHistory?: boolean } = {}): void {
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

  #apply(doc: WrittenPattern, a: WrittenAction): ActionResult {
    const same = (next: WrittenPattern, unplaced: PartRef[] = []): ActionResult => ({ doc: next, changed: next !== doc, unplaced, applied: true });
    switch (a.type) {
      case "applyPart": {
        const r = applyPartFromText(doc, a.partId, a.part);
        return { doc: r.doc, changed: r.doc !== doc, unplaced: r.unplaced, applied: r.applied };
      }
      case "addPart":
        return same(addPart(doc, a.part, a.index));
      case "renamePart":
        return same(renamePart(doc, a.partId, a.name));
      case "movePart":
        return same(movePart(doc, a.partId, a.toIndex));
      case "removePart": {
        const r = removePart(doc, a.partId);
        return same(r.pattern, r.unplaced);
      }
      case "setCopies": {
        const r = setCopies(doc, a.partId, a.copies);
        return same(r.pattern, r.unplaced);
      }
      case "insertRound":
        return same(insertRound(doc, a.partId, a.index, a.round));
      case "removeRound":
        return same(removeRound(doc, a.partId, a.index));
      case "replaceRound":
        return same(replaceRound(doc, a.partId, a.index, a.round));
      case "insertItem":
        return same(insertItem(doc, a.partId, a.roundIndex, a.path, a.item));
      case "updateItem":
        return same(updateItem(doc, a.partId, a.roundIndex, a.path, a.item));
      case "removeItem":
        return same(removeItem(doc, a.partId, a.roundIndex, a.path));
      case "moveItem":
        return same(moveItem(doc, a.partId, a.roundIndex, a.from, a.to));
      case "wrapInGroup":
        return same(wrapInGroup(doc, a.partId, a.roundIndex, a.from, a.to, a.times));
      case "unwrapGroup":
        return same(unwrapGroup(doc, a.partId, a.roundIndex, a.path));
      case "addYarn":
        return same(addYarn(doc, a.yarn));
      case "removeYarn":
        return same(removeYarn(doc, a.index, a.replaceWith));
      case "reorderYarns":
        return same(reorderYarns(doc, a.order));
      case "updateYarn":
        return same(updateYarn(doc, a.index, a.yarn));
      case "setPlacement":
        return same(setPlacement(doc, a.placement));
      case "clearPlacement": {
        const next = clearPlacement(doc, a.ref);
        return same(next, next !== doc ? [{ part: a.ref.part, copy: a.ref.copy }] : []);
      }
      case "setAssembly":
        return same(setAssembly(doc, a.steps));
      case "setGauge":
        return same(withGauge(doc, a.gauge));
    }
  }

  #commit(next: WrittenPattern): void {
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
  }

  #push(doc: WrittenPattern): void {
    this.#past.push(doc);
    if (this.#past.length > this.#limit) this.#past.shift();
  }

  #keepTitle(doc: WrittenPattern): WrittenPattern {
    return doc.title === this.#doc.title ? doc : { ...doc, title: this.#doc.title };
  }

  #snapshot(): WrittenStoreState {
    return { doc: this.#doc, revision: this.#revision, canUndo: this.#past.length > 0, canRedo: this.#future.length > 0 };
  }

  #bump(): void {
    this.#revision += 1;
    this.#state = this.#snapshot();
    for (const l of [...this.#listeners]) l();
  }
}

/** El id no cambia (los `@id` y `startYarn` apuntan por id). Solo lanas válidas. */
function updateYarn(doc: WrittenPattern, index: number, yarn: Yarn): WrittenPattern {
  const current = doc.yarns[index];
  if (!current || yarn.id !== current.id) return doc;
  if (validateYarn(yarn).some((i) => i.severity === "error")) return doc;
  if (deepEqual(current, yarn)) return doc;
  return { ...doc, yarns: doc.yarns.map((y, i) => (i === index ? structuredClone(yarn) : y)) };
}

function withGauge(doc: WrittenPattern, gauge: Gauge | null): WrittenPattern {
  if (gauge === null) {
    if (doc.gauge === undefined) return doc;
    const { gauge: _removed, ...rest } = doc;
    return rest;
  }
  if (gaugeProblems(gauge).length > 0) return doc;
  const g = doc.gauge;
  if (g && g.stitchesPer10cm === gauge.stitchesPer10cm && g.rowsPer10cm === gauge.rowsPer10cm) return doc;
  return { ...doc, gauge: { stitchesPer10cm: gauge.stitchesPer10cm, rowsPer10cm: gauge.rowsPer10cm } };
}
