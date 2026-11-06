import type { ChartPattern } from "@loopitalab/pattern-core";
import { gridSize } from "./editor-grid.ts";
import { gaugeInUse } from "./measures.ts";
import type { StoreState } from "./store.ts";

/*
 * Selectores del almacén para `useSyncExternalStore` (T10).
 *
 * Una pincelada cambia el documento, pero casi ningún componente depende de las casillas: cada uno lee solo lo que
 * muestra, y React vuelve a renderizarlo solo si eso cambió. Así una pincelada vuelve a renderizar el editor y nada
 * más (la vista previa no pasa por React, ver `PreviewEngine.connect`).
 */

/**
 * Lectura memoizada de `select(getState())`: con el mismo estado devuelve el mismo valor sin recalcular, y si el valor
 * nuevo es igual (`isEqual`) al anterior devuelve el anterior, para que `useSyncExternalStore` no vuelva a renderizar.
 * `select` debe ser estable (definido fuera del componente) y puro.
 */
export function selectorSnapshot<S, T>(getState: () => S, select: (s: S) => T, isEqual: (a: T, b: T) => boolean = Object.is): () => T {
  let has = false;
  let lastState: S;
  let lastValue: T;
  return () => {
    const s = getState();
    if (has && s === lastState) return lastValue;
    const v = select(s);
    lastState = s;
    if (has && isEqual(lastValue, v)) return lastValue;
    has = true;
    lastValue = v;
    return v;
  };
}

export const selectDoc = (s: StoreState): ChartPattern => s.doc;
export const selectChart = (s: StoreState) => s.doc.chart;
export const selectYarns = (s: StoreState) => s.doc.yarns;
export const selectCanUndo = (s: StoreState) => s.canUndo;
export const selectCanRedo = (s: StoreState) => s.canRedo;
/** ¿Se editó algo en esta sesión? (aviso de recuperación) */
export const selectEdited = (s: StoreState) => s.revision > 0;
export const selectIsAi = (s: StoreState) => s.doc.origin.kind !== "manual";
export const selectTechnique = (s: StoreState) => s.doc.technique;
export const selectHasRepeats = (s: StoreState) => s.doc.chart.repeat.x * s.doc.chart.repeat.y > 1;
/** La vista completa no se puede mostrar (demasiadas casillas): el editor queda en el motivo. */
export const selectFullDisabled = (s: StoreState) => gridSize(s.doc.chart, "full").forcedMotif;
export const selectRenderAs = (s: StoreState) => s.doc.chart.renderAs;
/** La vista previa usa la muestra supuesta (CA-F4). */
export const selectAssumedGauge = (s: StoreState) => gaugeInUse(s.doc)?.assumed ?? false;

/**
 * ¿De `a` a `b` solo cambiaron casillas del gráfico? (pincelada, trazo o relleno). Lo usa el panel lateral para no
 * volver a renderizarse ni revalidar en medio de un trazo: las casillas solo cambian medidas y revisión.
 */
export function onlyCellsChanged(a: ChartPattern, b: ChartPattern): boolean {
  if (a === b || a.chart === b.chart) return false;
  for (const k of Object.keys(b) as (keyof ChartPattern)[]) if (k !== "chart" && a[k] !== b[k]) return false;
  if (Object.keys(a).length !== Object.keys(b).length) return false;
  const ca = a.chart;
  const cb = b.chart;
  for (const k of Object.keys(cb) as (keyof typeof cb)[]) if (k !== "cells" && ca[k] !== cb[k]) return false;
  return Object.keys(ca).length === Object.keys(cb).length;
}
