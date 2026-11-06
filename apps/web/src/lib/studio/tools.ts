import { NO_STITCH, type Chart } from "@loopitalab/pattern-core";
import type { Cell } from "./editor-grid.ts";
import { valueAt } from "./editor-grid.ts";
import type { DocumentStore } from "./store.ts";

/*
 * Herramientas del editor sobre el almacén (T9). Toda edición es una operación de pattern-core; el trazo continuo
 * del lápiz comparte una sola entrada de deshacer con `beginStroke` / `endStroke`.
 */

export type Tool = "pencil" | "fill" | "eyedropper" | "nostitch";

export const TOOLS: readonly Tool[] = ["pencil", "fill", "eyedropper", "nostitch"];

/** Tecla de una letra → herramienta (solo con el foco en la cuadrícula). */
export function toolForKey(key: string): Tool | null {
  switch (key.toLowerCase()) {
    case "l":
      return "pencil";
    case "r":
      return "fill";
    case "c":
      return "eyedropper";
    case "s":
      return "nostitch";
    default:
      return null;
  }
}

/** Tecla "1".."9" → índice de lana (0..8) si existe. */
export function yarnIndexForKey(key: string, yarnCount: number): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  const i = Number(key) - 1;
  return i < yarnCount ? i : null;
}

/** Casillas de un segmento entre dos casillas (Bresenham), incluidos ambos extremos: un trazo rápido no deja huecos. */
export function lineCells(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    out.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

export type ToolResult =
  | { kind: "edit"; changed: boolean }
  /** Cuentagotas: `yarn` es el índice de la lana de la casilla, o `NO_STITCH` (el editor pasa a "sin punto"). */
  | { kind: "pick"; yarn: number };

/** Valor que escribe cada herramienta de pintura. */
export function paintValue(tool: Tool, activeYarn: number): number {
  return tool === "nostitch" ? NO_STITCH : activeYarn;
}

/** Aplica una herramienta en una casilla (un clic, o Enter/Espacio). */
export function applyTool(store: DocumentStore, tool: Tool, cell: Cell, activeYarn: number): ToolResult {
  switch (tool) {
    case "pencil":
    case "nostitch":
      return { kind: "edit", changed: store.dispatch({ type: "paint", refs: [cell], value: paintValue(tool, activeYarn) }) };
    case "fill":
      return { kind: "edit", changed: store.dispatch({ type: "fill", start: cell, value: activeYarn }) };
    case "eyedropper":
      return { kind: "pick", yarn: valueAt(store.doc.chart as Chart, cell) };
  }
}

/** Pinta un tramo del trazo (puede traer varias casillas) con una sola operación. */
export function paintCellsOf(store: DocumentStore, tool: Tool, cells: readonly Cell[], activeYarn: number): boolean {
  if (tool !== "pencil" && tool !== "nostitch") return false;
  return store.dispatch({ type: "paint", refs: cells, value: paintValue(tool, activeYarn) });
}
