import { concreteRounds, startAvailable, type Item, type ItemPath, type Loop, type Part, type Round, type StitchCode } from "@loopitalab/pattern-core";
import type { ActionResult, WrittenAction, WrittenStore } from "./store.ts";

/*
 * Editor de bloques (T15 de la fase 4; ADR 0011, sección 7), fuera de React.
 *
 * - **Derivado, no guardado**: el árbol (`blockTree`) se calcula desde `round.items` del documento y no copia nada.
 *   Cada acción es una operación de `edit-written.ts` sobre el almacén, así que el texto que se ve al cambiar de
 *   pestaña es siempre `formatPart` del documento y cada acción es un paso de deshacer.
 * - **Un solo lugar del tope**: `BlockEditPolicy` y `canEditBlock`. Ningún otro código de la interfaz compara una
 *   profundidad con un número (una prueba lo revisa). Pasar a la versión completa es cambiar la política.
 * - **Profundidad en niveles de ítems** (enmienda T6-1): 1 = ítems de la vuelta; `LIMITS.maxNesting` (6) son 5 grupos
 *   anidados; una `ItemPath` llega a 6 índices.
 * - **Rutas, no posiciones en pantalla**: la selección y el foco son `{ partId, roundIndex, path }`.
 * - Ningún conteo se calcula aquí: salen del motor (`concreteRounds`, `countRound`).
 */

// ------------------------------------------------------------------ política

export interface BlockEditPolicy {
  /** Hasta qué nivel de ítems se edita (1 = ítems de la vuelta). v1: 2; versión completa: `LIMITS.maxNesting`. */
  maxEditDepth: number;
  /** Arrastrar y soltar. v1: no (los botones "subir" y "bajar" son la alternativa). */
  dragAndDrop: boolean;
}

export const BLOCK_EDIT_POLICY_V1: BlockEditPolicy = Object.freeze({ maxEditDepth: 2, dragAndDrop: false });

/**
 * ¿Se puede editar el bloque de esta ruta? Es el ÚNICO lugar donde se compara una profundidad con un tope. Las demás
 * preguntas ("¿se puede agrupar?", "¿se puede agregar adentro?") se responden preguntándole a esta función por la
 * ruta que quedaría.
 */
export function canEditBlock(path: ItemPath, policy: BlockEditPolicy): boolean {
  return path.length >= 1 && path.length <= policy.maxEditDepth;
}

/** ¿Se pueden editar los hijos de este grupo? (agregar adentro, agrupar un ítem: sus hijos quedan un nivel abajo). */
export function canEditChildrenOf(path: ItemPath, policy: BlockEditPolicy): boolean {
  return canEditBlock([...path, 0], policy);
}

// ------------------------------------------------------------------ árbol

export interface BlockNode {
  /** Ruta en la vuelta; es la identidad del bloque. */
  path: ItemPath;
  /** El ítem del documento, sin copiar. */
  item: Item;
  /** 0 = ítems de la vuelta (ADR 0011, sección 7). Igual a `path.length − 1`. */
  depth: number;
  /** Posición entre sus hermanos y cuántos hermanos hay (para "subir" y "bajar"). */
  index: number;
  siblings: number;
  /** `canEditBlock(path, policy)`. */
  editable: boolean;
  /** Si es un grupo. */
  children?: BlockNode[];
}

/** Árbol recursivo de bloques de una vuelta, sin límite de profundidad. */
export function blockTree(round: Round, policy: BlockEditPolicy): BlockNode[] {
  const build = (items: readonly Item[], parent: ItemPath): BlockNode[] =>
    items.map((item, index) => {
      const path: ItemPath = [...parent, index];
      const node: BlockNode = { path, item, depth: parent.length, index, siblings: items.length, editable: canEditBlock(path, policy) };
      if (item.type === "group") node.children = build(item.items, path);
      return node;
    });
  return build(round.items, []);
}

/** Bloques en el orden en que se ven (para las flechas del teclado). */
export function flattenBlocks(nodes: readonly BlockNode[]): BlockNode[] {
  const out: BlockNode[] = [];
  const visit = (list: readonly BlockNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children) visit(n.children);
    }
  };
  visit(nodes);
  return out;
}

export const pathKey = (path: ItemPath): string => path.join(".");
export const parentOf = (path: ItemPath): ItemPath => path.slice(0, -1);
export const samePath = (a: ItemPath, b: ItemPath): boolean => a.length === b.length && a.every((k, i) => k === b[i]);

/** La lista de ítems que contiene `parent` (`[]` = la de la vuelta), o `undefined` si la ruta no llega a un grupo. */
export function listAt(items: readonly Item[], parent: ItemPath): readonly Item[] | undefined {
  let list = items;
  for (const k of parent) {
    const it = list[k];
    if (it?.type !== "group") return undefined;
    list = it.items;
  }
  return list;
}

/** El ítem de una ruta, o `undefined`. */
export function itemAt(items: readonly Item[], path: ItemPath): Item | undefined {
  const last = path[path.length - 1];
  return last === undefined ? undefined : listAt(items, parentOf(path))?.[last];
}

// ------------------------------------------------------------------ selección

/** Selección y foco del editor: por rutas, nunca por posición en pantalla. `path: null` = la vuelta entera. */
export interface BlockSelection {
  partId: string;
  roundIndex: number;
  path: ItemPath | null;
}

export const sameSelection = (a: BlockSelection | null, b: BlockSelection | null): boolean =>
  a === b || (a !== null && b !== null && a.partId === b.partId && a.roundIndex === b.roundIndex && (a.path === null || b.path === null ? a.path === b.path : samePath(a.path, b.path)));

/** Ruta a la que pasa la selección después de quitar el bloque `path`: el hermano anterior, el siguiente o el grupo. */
export function selectionAfterRemove(round: Round, path: ItemPath): ItemPath | null {
  const parent = parentOf(path);
  const idx = path[path.length - 1] as number;
  const list = listAt(round.items, parent);
  const left = idx - 1;
  if (list && left >= 0) return [...parent, left];
  if (list && list.length > 1) return [...parent, 0];
  return parent.length ? parent : null;
}

// ------------------------------------------------------------------ vueltas nuevas

/**
 * Vuelta que se inserta en `index`: un punto bajo por cada punto de la vuelta anterior (el motor da cuántos deja),
 * o 6 si es la primera y el inicio no fija la cantidad. No declara conteo (`expected`): no se inventa (regla de oro 6).
 */
export function newRoundAt(part: Part, index: number): Round {
  let count = startAvailable(part) ?? 6;
  if (index > 0) {
    const prev = concreteRounds(part)
      .filter((c) => c.sourceIndex === index - 1)
      .at(-1);
    if (prev && prev.count.produced > 0) count = prev.count.produced;
  }
  return { number: 1, items: [{ type: "stitch", stitch: "sc", count: Math.max(1, count) }] };
}

/** Conteo del motor de una vuelta del documento (vuelta concreta, la primera si es un rango). */
export function roundCountOf(part: Part, sourceIndex: number): { produced: number; consumed: number; perRound: boolean } | null {
  const found = concreteRounds(part).filter((c) => c.sourceIndex === sourceIndex);
  const first = found[0];
  if (!first) return null;
  return { produced: first.count.produced, consumed: first.count.consumed, perRound: found.length > 1 };
}

// ------------------------------------------------------------------ acciones

export type GuardFn = (action: WrittenAction, done?: (r: ActionResult) => void) => void;

export interface BlockActionsDeps {
  store: WrittenStore;
  policy: BlockEditPolicy;
  /** Acción con aviso de límites recomendados (`WrittenStudio.guard`). Sin ella, se aplica directo. */
  guard?: GuardFn;
}

/**
 * Acciones del editor de bloques sobre el almacén. Cada una es UNA acción del almacén (un paso de deshacer) y
 * rechaza (devuelve `false`/`null`) un bloque que la política no deja editar, además de lo que ya rechaza el núcleo.
 * Las rutas que devuelven son las de la selección que queda.
 */
export class BlockActions {
  readonly #store: WrittenStore;
  readonly #policy: BlockEditPolicy;
  readonly #guard: GuardFn | undefined;

  constructor(deps: BlockActionsDeps) {
    this.#store = deps.store;
    this.#policy = deps.policy;
    this.#guard = deps.guard;
  }

  get policy(): BlockEditPolicy {
    return this.#policy;
  }

  #round(partId: string, roundIndex: number): Round | undefined {
    return this.#store.doc.parts.find((p) => p.id === partId)?.rounds[roundIndex];
  }

  #update(partId: string, roundIndex: number, path: ItemPath, change: (item: Item) => Item | null): boolean {
    if (!canEditBlock(path, this.#policy)) return false;
    const round = this.#round(partId, roundIndex);
    const item = round ? itemAt(round.items, path) : undefined;
    if (!item) return false;
    const next = change(item);
    if (!next) return false;
    return this.#store.dispatch({ type: "updateItem", partId, roundIndex, path, item: next });
  }

  /** Cambia el punto (se conserva la cantidad y la hebra). */
  setStitch(partId: string, roundIndex: number, path: ItemPath, stitch: StitchCode): boolean {
    return this.#update(partId, roundIndex, path, (it) => (it.type === "stitch" ? { ...it, stitch } : null));
  }

  setCount(partId: string, roundIndex: number, path: ItemPath, count: number): boolean {
    return this.#update(partId, roundIndex, path, (it) => (it.type === "stitch" && Number.isInteger(count) ? { ...it, count } : null));
  }

  /** `"both"` quita la hebra. */
  setLoop(partId: string, roundIndex: number, path: ItemPath, loop: Loop): boolean {
    return this.#update(partId, roundIndex, path, (it) => {
      if (it.type !== "stitch") return null;
      const { loop: _old, ...rest } = it;
      return loop === "both" ? rest : { ...rest, loop };
    });
  }

  /** Cambio de lana (`@B`): a qué lana pasa. */
  setYarn(partId: string, roundIndex: number, path: ItemPath, yarn: string): boolean {
    return this.#update(partId, roundIndex, path, (it) => (it.type === "color" ? { ...it, yarn } : null));
  }

  /** Veces de un grupo. */
  setTimes(partId: string, roundIndex: number, path: ItemPath, times: number): boolean {
    return this.#update(partId, roundIndex, path, (it) => (it.type === "group" && Number.isInteger(times) ? { ...it, times } : null));
  }

  /** Agrega un ítem al final de la lista de `parent` (`[]` = la vuelta). Devuelve la ruta del ítem nuevo. */
  addItem(partId: string, roundIndex: number, parent: ItemPath, item: Item): ItemPath | null {
    const round = this.#round(partId, roundIndex);
    if (!round) return null;
    const list = listAt(round.items, parent);
    if (!list) return null;
    const path: ItemPath = [...parent, list.length];
    if (!canEditBlock(path, this.#policy)) return null;
    return this.#store.dispatch({ type: "insertItem", partId, roundIndex, path, item }) ? path : null;
  }

  removeItem(partId: string, roundIndex: number, path: ItemPath): { changed: boolean; select: ItemPath | null } {
    const round = this.#round(partId, roundIndex);
    if (!round || !canEditBlock(path, this.#policy)) return { changed: false, select: path };
    const select = selectionAfterRemove(round, path);
    return this.#store.dispatch({ type: "removeItem", partId, roundIndex, path }) ? { changed: true, select } : { changed: false, select: path };
  }

  /** "Subir" (`-1`) y "bajar" (`+1`): `moveItem` con `to` = la ruta después de mover (T6-4). Devuelve la ruta nueva. */
  moveBy(partId: string, roundIndex: number, path: ItemPath, delta: -1 | 1): ItemPath | null {
    if (!canEditBlock(path, this.#policy)) return null;
    const to: ItemPath = [...parentOf(path), (path[path.length - 1] as number) + delta];
    if ((to[to.length - 1] as number) < 0) return null;
    return this.#store.dispatch({ type: "moveItem", partId, roundIndex, from: path, to }) ? to : null;
  }

  /** Agrupa los hermanos de `from` a `to` en un grupo de `times` veces. Devuelve la ruta del grupo. */
  wrap(partId: string, roundIndex: number, from: ItemPath, to: ItemPath, times: number): ItemPath | null {
    if (!canEditBlock(from, this.#policy) || !canEditChildrenOf(from, this.#policy)) return null;
    return this.#store.dispatch({ type: "wrapInGroup", partId, roundIndex, from, to, times }) ? from : null;
  }

  /** Deshace un grupo: sus ítems quedan en su lugar, repetidos (el conteo no cambia). */
  unwrap(partId: string, roundIndex: number, path: ItemPath): boolean {
    if (!canEditBlock(path, this.#policy)) return false;
    return this.#store.dispatch({ type: "unwrapGroup", partId, roundIndex, path });
  }

  /** Inserta una vuelta nueva antes de `index` (con `index` = número de vueltas, al final). Usa `guard` de límites. */
  insertRound(partId: string, index: number, done?: (inserted: boolean) => void): void {
    const part = this.#store.doc.parts.find((p) => p.id === partId);
    if (!part) return done?.(false);
    const action: WrittenAction = { type: "insertRound", partId, index, round: newRoundAt(part, index) };
    if (this.#guard) this.#guard(action, (r) => done?.(r.changed));
    else done?.(this.#store.dispatch(action));
  }

  removeRound(partId: string, index: number): boolean {
    return this.#store.dispatch({ type: "removeRound", partId, index });
  }

  /** Declara como conteo de la vuelta el que da el motor (arregla "no cuadra" sin tocar los puntos). */
  useEngineCount(partId: string, roundIndex: number): boolean {
    const part = this.#store.doc.parts.find((p) => p.id === partId);
    const round = part?.rounds[roundIndex];
    const count = part ? roundCountOf(part, roundIndex) : null;
    if (!round || !count) return false;
    return this.#store.dispatch({ type: "replaceRound", partId, index: roundIndex, round: { ...round, expected: count.produced } });
  }
}
