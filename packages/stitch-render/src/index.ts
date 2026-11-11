/**
 * @loopitalab/stitch-render: vista previa realista de puntos 2D (ADR 0004 y 0005).
 * Capa 1 (disposición) y capa 2 (aspecto) son puras; la capa 3 es el backend Canvas 2D.
 */
export * from "./types.ts";
export { colorize, hitTest, layoutGeometry, layoutInstanceCount, layoutShape, needsRelayout, visibleCount } from "./layout.ts";
export { FALLBACK_HEX, FIBER_LEVELS, fillTone, lookInputKey, lookKey, neutralLook, normalizeHex, yarnLook, type YarnLookInput, type YarnLookOptions } from "./look.ts";
export { buildGrid, deviceBox, dirtyRegions, instanceBounds, queryGrid, queryGridRects, tileClass, tilePlan, tileRect, tileRepresentative, type Rect, type SpatialGrid, type TilePlan } from "./regions.ts";
export { MAX_ZOOM, MIN_ZOOM, fitView, layoutToScreen, panBy, screenToLayout, zoomAt } from "./view.ts";
export { LOD_MIN_PX, MAX_TILE_PX, QUAD_CHUNK, ROTATED_SPRITE_BUDGET, SETTLE_MS, SHADE_LEVELS, createCanvasRenderer, createRenderer, type Ctx2D, type GradientLike, type RendererOptions, type Surface } from "./canvas.ts";
