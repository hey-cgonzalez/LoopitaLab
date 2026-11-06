/**
 * Vista (zoom y desplazamiento), pura. px CSS de pantalla = disposición × zoom + pan.
 */
import type { StitchLayout, ViewState } from "./types.ts";

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 16;

const clampZoom = (z: number) => (z < MIN_ZOOM ? MIN_ZOOM : z > MAX_ZOOM ? MAX_ZOOM : z);

/** Vista que muestra toda la pieza centrada en un área de `cssW × cssH`, con `margin` px CSS. */
export function fitView(bounds: StitchLayout["bounds"], cssW: number, cssH: number, margin = 8): ViewState {
  const aw = Math.max(1, cssW - 2 * margin);
  const ah = Math.max(1, cssH - 2 * margin);
  const zoom = clampZoom(Math.min(aw / Math.max(1e-9, bounds.width), ah / Math.max(1e-9, bounds.height)));
  return { zoom, panX: (cssW - bounds.width * zoom) / 2, panY: (cssH - bounds.height * zoom) / 2 };
}

export function screenToLayout(view: ViewState, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - view.panX) / view.zoom, y: (sy - view.panY) / view.zoom };
}

export function layoutToScreen(view: ViewState, x: number, y: number): { x: number; y: number } {
  return { x: x * view.zoom + view.panX, y: y * view.zoom + view.panY };
}

/** Zoom por `factor` manteniendo fijo el punto de pantalla (sx, sy). */
export function zoomAt(view: ViewState, factor: number, sx: number, sy: number): ViewState {
  const zoom = clampZoom(view.zoom * (Number.isFinite(factor) && factor > 0 ? factor : 1));
  const p = screenToLayout(view, sx, sy);
  return { zoom, panX: sx - p.x * zoom, panY: sy - p.y * zoom };
}

export function panBy(view: ViewState, dx: number, dy: number): ViewState {
  return { zoom: view.zoom, panX: view.panX + dx, panY: view.panY + dy };
}
