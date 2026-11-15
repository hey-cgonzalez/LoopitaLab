"use client";

import { useMemo, useSyncExternalStore } from "react";
import { onlyCellsChanged, selectorSnapshot } from "@/lib/studio/select.ts";
import type { DocumentStore, StoreState } from "@/lib/studio/store.ts";

/**
 * Lee una parte del almacén y vuelve a renderizar solo cuando esa parte cambia (T10).
 * `select` debe ser una función estable (las de `@/lib/studio/select.ts`).
 */
export function useStoreSelector<T>(store: DocumentStore, select: (s: StoreState) => T, isEqual?: (a: T, b: T) => boolean): T {
  const get = useMemo(() => selectorSnapshot(store.getState, select, isEqual), [store, select, isEqual]);
  return useSyncExternalStore(store.subscribe, get, get);
}

/**
 * Documento que se actualiza solo cuando la edición se detiene `ms` milisegundos (descripción para lectores de
 * pantalla, limitaciones de la vista): nada de eso corre entre la edición y el dibujo (CA-P7).
 */
export function useSettledDoc<D = DocumentStore["doc"]>(store: { readonly doc: D; subscribe(l: () => void): () => void }, ms: number): D {
  const get = useMemo(() => {
    let settled = store.doc;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const subscribe = (notify: () => void) => {
      const off = store.subscribe(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          if (settled === store.doc) return;
          settled = store.doc;
          notify();
        }, ms);
      });
      return () => {
        if (timer) clearTimeout(timer);
        timer = null;
        off();
      };
    };
    return { subscribe, snapshot: () => settled };
  }, [store, ms]);
  return useSyncExternalStore(get.subscribe, get.snapshot, get.snapshot);
}

/**
 * Documento para el panel lateral (T10). Cambios de forma, repeticiones, muestra, lanas o título llegan de inmediato
 * (los campos y opciones del panel los muestran). Si solo cambiaron casillas (pincelada, trazo), espera a que la
 * edición se detenga `settleMs`: medidas y revisión no se recalculan en medio de un trazo, y la revisión diferida del
 * panel no vence entre una pincelada y su frame (CA-P7).
 */
export function useSidebarDoc(store: DocumentStore, settleMs: number) {
  const api = useMemo(() => {
    let current = store.doc;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const subscribe = (notify: () => void) => {
      const off = store.subscribe(() => {
        const next = store.doc;
        if (next === current) return;
        if (timer) clearTimeout(timer);
        timer = null;
        if (onlyCellsChanged(current, next)) {
          timer = setTimeout(() => {
            timer = null;
            current = store.doc;
            notify();
          }, settleMs);
          return;
        }
        current = next;
        notify();
      });
      return () => {
        if (timer) clearTimeout(timer);
        timer = null;
        off();
      };
    };
    return { subscribe, snapshot: () => current };
  }, [store, settleMs]);
  return useSyncExternalStore(api.subscribe, api.snapshot, api.snapshot);
}
