/**
 * `@loopitalab/viewer-3d/three`: backend `three` del visor amigurumi (ADR 0010, secciones 5, 6, 6b y 6c).
 * `three` es dependencia par. Sin React: el componente r3f vive en `apps/web`.
 */
export {
  DEGRADED_PIXEL_RATIO,
  FIBER_DEFINITION_RELIEF,
  FIBER_HALO_FRESNEL_POWER,
  FIBER_HALO_RIM,
  FIBER_HALO_SOFTEN,
  FIBER_SHEEN_ROUGHNESS,
  FIBER_SHEEN_SPECULAR,
  HIGHLIGHT_EMISSIVE,
  LOD_STITCH_BUDGET,
  LOOP_EDGE_SHADE,
  LOOP_EDGE_WIDTH,
  MAX_YARNS,
  PROGRAM_CACHE_KEYS,
  RECOMMENDED_SCENE_STITCHES,
  RELIEF_NORMAL_SCALE,
  RESERVE_GROWTH,
  ROUGHNESS_BASE,
  SCENE_HARD_STITCH_CAP,
  STITCH_NORMAL_MAP_SIZE,
} from "./constants.ts";
export { createBaseMaterial, createFiberMaterial, createYarnTable, writeLooks, type FiberMaterial, type FiberUniforms, type YarnTable } from "./material.ts";
export { createStitchNormalMap, normalsFromHeights, stitchHeightField } from "./normal-map.ts";
export { PartBuffers, type UploadStats } from "./part-buffers.ts";
export { grownCapacity, meshStitches, stitchLocation, vertexRangeOfStitches, viewerMode, viewerPolicy, type ViewerMode, type ViewerPolicy } from "./policy.ts";
export {
  createThreeRenderer,
  type AmigurumiRenderer,
  type HighlightTarget,
  type MaterialVariant,
  type PickResult,
  type RendererScene,
  type RendererStats,
  type ThreeRendererOptions,
} from "./renderer.ts";
