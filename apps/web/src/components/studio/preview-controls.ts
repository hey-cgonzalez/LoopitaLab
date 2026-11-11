import type { Yarn } from "@loopitalab/pattern-core";
import type { DocumentStore } from "@/lib/studio/store.ts";

/*
 * Controles de la vista previa que NO son del documento (regla de oro 1; ADR 0008 §3 y §4), por estudio:
 *
 * - `previewYarn(i, candidato)`: vista previa de la lana `i` con otro color (y, en una lana guardada, otra composición)
 *   al pasar el cursor o el foco, sin tocar el almacén ni el historial. El selector de lanas (T9) la llama; el motor
 *   la dibuja en el mismo camino directo de T10.
 * - `flatColors` ("Colores planos"): preferencia de vista que apaga el halo y el brillo por fibra. Se recuerda en este
 *   navegador (`localStorage`), nunca en el documento.
 *
 * Está asociado al `DocumentStore` (un estudio = un almacén), así el selector del panel lateral y la vista previa se
 * encuentran sin pasar por React ni por el documento. El motor se registra con `bind` al montarse.
 */

/** Lo que se puede previsualizar de una lana: color y, opcionalmente, composición (lana guardada). */
export type YarnCandidate = Pick<Yarn, "color"> & Partial<Pick<Yarn, "composition">>;

export interface PreviewTarget {
  previewYarn(index: number, candidate: YarnCandidate | null): void;
  setFlatColors(flat: boolean): void;
}

export const FLAT_COLORS_STORAGE_KEY = "loopita:vista:colores-planos";

type Listener = () => void;

export class PreviewControls {
  #target: PreviewTarget | null = null;
  #flat: boolean;
  #listeners = new Set<Listener>();
  #preview: { index: number; candidate: YarnCandidate } | null = null;
  readonly #storage: Pick<Storage, "getItem" | "setItem"> | null;

  constructor(storage: Pick<Storage, "getItem" | "setItem"> | null = defaultStorage()) {
    this.#storage = storage;
    let flat = false;
    try {
      flat = storage?.getItem(FLAT_COLORS_STORAGE_KEY) === "1";
    } catch {
      flat = false; // almacenamiento bloqueado: se usa el valor por defecto
    }
    this.#flat = flat;
  }

  /** "Colores planos" activo (aspecto neutro, sin halo ni brillo). */
  get flatColors(): boolean {
    return this.#flat;
  }

  /** Para `useSyncExternalStore`. */
  subscribe = (l: Listener): (() => void) => {
    this.#listeners.add(l);
    return () => this.#listeners.delete(l);
  };

  getFlatColors = (): boolean => this.#flat;

  setFlatColors(flat: boolean): void {
    if (flat === this.#flat) return;
    this.#flat = flat;
    try {
      this.#storage?.setItem(FLAT_COLORS_STORAGE_KEY, flat ? "1" : "0");
    } catch {
      // Sin almacenamiento: la preferencia vale solo en esta visita.
    }
    this.#target?.setFlatColors(flat);
    for (const l of this.#listeners) l();
  }

  /** Vista previa actual (para pruebas y para el motor al montarse). */
  get preview(): { index: number; candidate: YarnCandidate } | null {
    return this.#preview;
  }

  /** Vista previa de la lana `index` con otro aspecto; `null` la quita. No toca el documento. */
  previewYarn(index: number, candidate: YarnCandidate | null): void {
    this.#preview = candidate && Number.isInteger(index) && index >= 0 ? { index, candidate } : null;
    this.#target?.previewYarn(index, this.#preview ? candidate : null);
  }

  /** El motor de la vista previa se registra al montarse. Devuelve la baja. */
  bind(target: PreviewTarget): () => void {
    this.#target = target;
    target.setFlatColors(this.#flat);
    if (this.#preview) target.previewYarn(this.#preview.index, this.#preview.candidate);
    return () => {
      if (this.#target === target) this.#target = null;
    };
  }
}

function defaultStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

const registry = new WeakMap<DocumentStore, PreviewControls>();

/** Controles de la vista previa del estudio de `store` (se crean al primer uso). */
export function previewControls(store: DocumentStore): PreviewControls {
  let c = registry.get(store);
  if (!c) {
    c = new PreviewControls();
    registry.set(store, c);
  }
  return c;
}
