/**
 * `@loopitalab/viewer-3d`, parte pura (ADR 0010, secciones 3, 4 y 9). Depende solo de
 * `@loopitalab/pattern-core`. El backend `three` irá en `./three` (T11).
 */
export { buildPartMesh, colorizePartMesh, shapeSignature } from "./mesh.ts";
export { surfaceFrame } from "./frame.ts";
export { AUTO_PLACEMENT_GAP_CM, buildScene } from "./scene.ts";
export { SILHOUETTE_FALLBACK_HEX, profileToSvg, type ProfileSvgOptions } from "./svg.ts";
export {
  LOOP_BACK,
  LOOP_BOTH,
  LOOP_FRONT,
  type Frame,
  type Lod,
  type PartMesh,
  type PartMeshOptions,
  type SceneCache,
  type SceneInput,
  type SceneInstance,
  type SceneNote,
  type SceneNoteCode,
  type SceneResult,
  type SceneUpdate,
  type SurfaceLook,
  type Vec3,
} from "./types.ts";
