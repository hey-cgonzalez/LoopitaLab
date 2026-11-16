/**
 * Renderer imperativo de la escena amigurumi sobre `three` (ADR 0010, secciones 5, 6, 6b y 6c).
 *
 * Recibe el `WebGLRenderer`, la escena y la cámara del lienzo (en la aplicación, los de r3f) y dibuja bajo
 * demanda (`invalidate`). No depende de React ni de r3f; los controles de cámara y los avisos son del
 * componente. Nunca recalcula conteos: dibuja las mallas de `buildScene`.
 */
import * as THREE from "three";
import type { Lod, PartMesh, SceneInstance, SceneUpdate, SurfaceLook } from "../types.ts";
import { MAX_YARNS } from "./constants.ts";
import { createBaseMaterial, createFiberMaterial, createYarnTable, writeLooks, type FiberMaterial } from "./material.ts";
import { createStitchNormalMap } from "./normal-map.ts";
import { PartBuffers } from "./part-buffers.ts";
import { meshStitches, stitchLocation, vertexRangeOfStitches, viewerPolicy, type ViewerPolicy } from "./policy.ts";

/** Lo que el renderer necesita de `buildScene` (`SceneResult` cumple esta forma). */
export interface RendererScene {
  instances: readonly SceneInstance[];
  /** Puntos de la escena; si falta, se suman las mallas de las instancias. */
  stitchCount?: number;
  /** Qué pasó con cada parte: con `kept` no se sube nada; con `recolored`, solo el rango de `yarn`. */
  updates?: readonly SceneUpdate[];
}

export interface PickResult {
  partId: string;
  copy: number;
  /** Punto global de la parte (0 … puntos − 1). */
  stitch: number;
  /** Vuelta concreta 0-based (índice de `roundStart` y de `concreteRounds`). */
  roundIndex: number;
  /** Punto dentro de la vuelta, 0-based. */
  stitchInRound: number;
  /** Punto tocado, en cm, en coordenadas del mundo. */
  point: [number, number, number];
}

export interface HighlightTarget {
  partId: string;
  /** Omitido = todas las copias. */
  copy?: number;
  /** Vuelta concreta 0-based; omitida = toda la parte. */
  roundIndex?: number;
}

/** `"fiber"`: el material del visor. `"base"`: `MeshStandardMaterial` sin extender, solo para el A/B (R4-19). */
export type MaterialVariant = "fiber" | "base";

/** Contadores del modo de medición (`?perf=1`; sección 6b, "Guardia de rendimiento"). Acumulados desde `resetStats`. */
export interface RendererStats {
  setSceneCalls: number;
  setLooksCalls: number;
  previewCalls: number;
  /** Partes subidas completas, recoloreadas (rango de `yarn`) y sin tocar. */
  partsUploaded: number;
  partsRecolored: number;
  partsKept: number;
  /** Atributos marcados con `needsUpdate` y bytes de esos rangos. */
  attributesMarked: number;
  bytesMarked: number;
  /** Entradas de la tabla por lana que cambiaron. */
  lookEntriesChanged: number;
  capacityGrowths: number;
  // Estado actual (no acumulado):
  programs: number;
  programNames: string[];
  parts: number;
  meshes: number;
  stitches: number;
  vertices: number;
  lod: Lod;
  mode: ViewerPolicy["mode"];
  variant: MaterialVariant;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export interface AmigurumiRenderer {
  /** Escena completa con sus aspectos. Devuelve la política aplicada (modo, nivel de detalle, razón de píxeles). */
  setScene(scene: RendererScene, looks: readonly SurfaceLook[]): ViewerPolicy;
  /** Cambia color o aspecto de las lanas sin tocar geometría ni atributos: solo la tabla por lana. */
  setLooks(looks: readonly SurfaceLook[]): void;
  /** Vista previa de una lana (al pasar el cursor), sin tocar el documento ni los atributos. */
  setPreviewOverride(o: { yarn: number; look: SurfaceLook } | null): void;
  /** Nivel de detalle pedido por la usuaria; la política puede forzar `"smooth"`. */
  setLod(lod: Lod): void;
  readonly policy: ViewerPolicy;
  pick(ndcX: number, ndcY: number): PickResult | null;
  setHighlight(target: HighlightTarget | null): void;
  /** Esfera que envuelve la escena, en coordenadas del mundo (para encuadrar la cámara); `null` si está vacía. */
  bounds(): { center: [number, number, number]; radius: number } | null;
  snapshot(opts: { width: number; height: number; footer?: string }): Promise<Blob>;
  setMaterialVariant(variant: MaterialVariant): void;
  stats(): RendererStats;
  resetStats(): void;
  /** Dibuja ya (sin esperar al próximo frame) y espera a la GPU: para medir. Devuelve ms. */
  renderNow(sync?: boolean): number;
  dispose(): void;
}

export interface ThreeRendererOptions {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Pide un frame (r3f `invalidate`). */
  invalidate: () => void;
  /** Aplica la razón de píxeles máxima de la política (`null` = la del lienzo). Por omisión, `gl.setPixelRatio`. */
  setPixelRatio?: (max: number | null) => void;
  /** Contexto limitado (por ejemplo, sin `OES_texture_float_linear` o pocos uniformes): `"smooth"` siempre. */
  limitedContext?: boolean;
  /** Color de fondo #RRGGBB. */
  background?: string;
}

interface PartEntry {
  buffers: PartBuffers;
  meshes: THREE.Mesh[];
}

const ROOT_NAME = "loopita-amigurumi";

export function createThreeRenderer(opts: ThreeRendererOptions): AmigurumiRenderer {
  const { gl, scene, camera, invalidate } = opts;
  const table = createYarnTable();
  const normalMap = createStitchNormalMap();
  const fiber: Record<Lod, FiberMaterial> = { relief: createFiberMaterial(table, "relief", normalMap), smooth: createFiberMaterial(table, "smooth", normalMap) };
  // Resaltado: mismos parámetros y misma clave de programa que `fiber` (comparten programa), otros uniformes.
  const highlighted: Record<Lod, FiberMaterial> = { relief: createFiberMaterial(table, "relief", normalMap), smooth: createFiberMaterial(table, "smooth", normalMap) };
  let base: Record<Lod, THREE.MeshStandardMaterial> | null = null;

  const root = new THREE.Group();
  root.name = ROOT_NAME;
  root.rotation.x = -Math.PI / 2; // la pieza crece hacia +z; se muestra de pie (+y)
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb8a99a, 1.1);
  const dir = new THREE.DirectionalLight(0xffffff, 1.6);
  dir.position.set(3, 4, 6);
  camera.add(dir); // la luz sigue a la cámara
  if (!camera.parent) scene.add(camera);
  scene.add(hemi, root);
  const previousBackground = scene.background;
  scene.background = new THREE.Color(opts.background ?? "#F3EFE9");

  const parts = new Map<string, PartEntry>();
  let looks: readonly SurfaceLook[] = [];
  let override: { yarn: number; look: SurfaceLook } | null = null;
  let requestedLod: Lod = "relief";
  let variant: MaterialVariant = "fiber";
  let lastStitches = 0;
  let policy: ViewerPolicy = viewerPolicy(0, requestedLod, { limitedContext: opts.limitedContext === true });
  let appliedPixelRatio: number | null | undefined;
  let highlight: HighlightTarget | null = null;
  let disposed = false;
  const counters = { setSceneCalls: 0, setLooksCalls: 0, previewCalls: 0, partsUploaded: 0, partsRecolored: 0, partsKept: 0, attributesMarked: 0, bytesMarked: 0, lookEntriesChanged: 0, capacityGrowths: 0 };

  const applyPixelRatio = (max: number | null) => {
    if (appliedPixelRatio === max) return;
    appliedPixelRatio = max;
    if (opts.setPixelRatio) return opts.setPixelRatio(max);
    const device = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    gl.setPixelRatio(max === null ? Math.min(device, 2) : Math.min(device, max));
  };

  const materialFor = (partId: string, copy: number): THREE.Material => {
    const lod = policy.lod;
    if (variant === "base") {
      base ??= { relief: createBaseMaterial("relief", normalMap, looks[0]?.hex ?? "#8C8C8C"), smooth: createBaseMaterial("smooth", normalMap, looks[0]?.hex ?? "#8C8C8C") };
      return base[lod];
    }
    if (highlight && highlight.partId === partId && (highlight.copy === undefined || highlight.copy === copy)) return highlighted[lod];
    return fiber[lod];
  };

  const refreshMaterials = () => {
    for (const [partId, entry] of parts) entry.meshes.forEach((m, copy) => (m.material = materialFor(partId, copy)));
  };

  const refreshHighlightRange = () => {
    const u = [highlighted.relief.userData.fiber.uHighlight.value, highlighted.smooth.userData.fiber.uHighlight.value];
    const entry = highlight ? parts.get(highlight.partId) : undefined;
    let range = { from: 0, to: 0 };
    if (entry && highlight) {
      const mesh = entry.buffers.source;
      if (highlight.roundIndex === undefined) range = { from: 0, to: mesh.vertexCount };
      else {
        const r = Math.floor(highlight.roundIndex);
        const s0 = mesh.roundStart[r];
        const s1 = mesh.roundStart[r + 1];
        if (s0 !== undefined && s1 !== undefined) range = vertexRangeOfStitches(mesh, s0, s1);
      }
    }
    for (const v of u) v.set(range.from, range.to, range.to > range.from ? 1 : 0);
  };

  const clearParts = () => {
    for (const entry of parts.values()) {
      for (const m of entry.meshes) root.remove(m);
      entry.buffers.dispose();
    }
    parts.clear();
  };

  const syncLooks = () => {
    counters.lookEntriesChanged += writeLooks(table, looks, override);
  };

  // Los dos programas (relief y smooth) se compilan al montar (sección 6b), con las luces reales de la escena.
  const precompile = () => {
    const probeMesh: PartMesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
      yarn: new Uint8Array(3),
      loop: new Uint8Array(3),
      indices: new Uint32Array([0, 1, 2]),
      faceStitch: new Uint32Array(1),
      roundStart: new Uint32Array([0, 1]),
      ringPhase: new Float64Array(2),
      vertexCount: 3,
      indexCount: 3,
      bounds: { min: [0, 0, 0], max: [1, 1, 0] },
    };
    const probe = new PartBuffers(probeMesh);
    const mesh = new THREE.Mesh(probe.geometry, fiber.relief);
    root.add(mesh);
    try {
      for (const lod of ["relief", "smooth"] as const) {
        mesh.material = fiber[lod];
        gl.compile(scene, camera);
      }
    } finally {
      root.remove(mesh);
      probe.dispose();
    }
  };

  syncLooks();
  precompile();

  const renderer: AmigurumiRenderer = {
    get policy() {
      return policy;
    },

    setScene(input, nextLooks) {
      counters.setSceneCalls++;
      const instances = Array.isArray(input?.instances) ? input.instances : [];
      const stitches = Number.isFinite(input?.stitchCount) ? (input.stitchCount as number) : instances.reduce((s, i) => s + meshStitches(i.mesh), 0);
      lastStitches = stitches;
      policy = viewerPolicy(stitches, requestedLod, { limitedContext: opts.limitedContext === true });
      looks = nextLooks;
      syncLooks();
      if (policy.mode === "silhouettes") {
        // Sobre SCENE_HARD_STITCH_CAP no se arma ni se sube nada: la aplicación muestra las siluetas.
        clearParts();
        applyPixelRatio(policy.maxPixelRatio);
        invalidate();
        return policy;
      }
      const updates = new Map<string, SceneUpdate>();
      for (const u of input.updates ?? []) updates.set(u.partId, u);
      const byPart = new Map<string, SceneInstance[]>();
      for (const inst of instances) {
        const list = byPart.get(inst.partId);
        if (list) list.push(inst);
        else byPart.set(inst.partId, [inst]);
      }
      for (const [partId, entry] of parts) {
        if (byPart.has(partId)) continue;
        for (const m of entry.meshes) root.remove(m);
        entry.buffers.dispose();
        parts.delete(partId);
      }
      for (const [partId, list] of byPart) {
        const mesh = list[0]!.mesh;
        let entry = parts.get(partId);
        if (!entry) {
          const buffers = new PartBuffers(mesh);
          entry = { buffers, meshes: [] };
          parts.set(partId, entry);
          counters.partsUploaded++;
          counters.attributesMarked += buffers.lastUpload.attributes;
          counters.bytesMarked += buffers.lastUpload.bytes;
        } else if (entry.buffers.source !== mesh) {
          const st = entry.buffers.write(mesh);
          counters.partsUploaded++;
          counters.attributesMarked += st.attributes;
          counters.bytesMarked += st.bytes;
          if (st.grew) {
            counters.capacityGrowths++;
            for (const m of entry.meshes) m.geometry = entry.buffers.geometry;
          }
        } else {
          const u = updates.get(partId);
          if (u?.kind === "recolored") {
            const st = entry.buffers.writeYarnRange(u.from, u.to);
            counters.partsRecolored++;
            counters.attributesMarked += st.attributes;
            counters.bytesMarked += st.bytes;
          } else if (u === undefined) {
            // Sin `updates` no se sabe si la malla se recoloreó en el lugar: se sube `yarn` entero (barato).
            const st = entry.buffers.writeYarnRange(0, mesh.vertexCount);
            counters.partsRecolored++;
            counters.attributesMarked += st.attributes;
            counters.bytesMarked += st.bytes;
          } else counters.partsKept++;
        }
        // Una malla de three por copia, todas con la misma geometría.
        while (entry.meshes.length > list.length) root.remove(entry.meshes.pop()!);
        list.forEach((inst, k) => {
          let m = entry.meshes[k];
          if (!m) {
            m = new THREE.Mesh(entry.buffers.geometry, fiber[policy.lod]);
            m.matrixAutoUpdate = false;
            m.name = `${partId}#${inst.copy}`;
            entry.meshes.push(m);
            root.add(m);
          }
          m.geometry = entry.buffers.geometry;
          m.userData = { partId, copy: inst.copy };
          m.matrix.fromArray(inst.matrix);
          m.matrixWorldNeedsUpdate = true;
        });
      }
      refreshHighlightRange();
      refreshMaterials();
      applyPixelRatio(policy.maxPixelRatio);
      invalidate();
      return policy;
    },

    setLooks(next) {
      counters.setLooksCalls++;
      looks = next;
      syncLooks();
      invalidate();
    },

    setPreviewOverride(o) {
      counters.previewCalls++;
      override = o && Number.isInteger(o.yarn) && o.yarn >= 0 && o.yarn < MAX_YARNS ? o : null;
      syncLooks();
      invalidate();
    },

    setLod(lod) {
      requestedLod = lod;
      policy = viewerPolicy(lastStitches, requestedLod, { limitedContext: opts.limitedContext === true });
      refreshMaterials();
      invalidate();
    },

    pick(ndcX, ndcY) {
      if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;
      root.updateMatrixWorld(true);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const targets: THREE.Mesh[] = [];
      for (const e of parts.values()) targets.push(...e.meshes);
      const hit = ray.intersectObjects(targets, false).find((h) => h.faceIndex !== undefined && h.faceIndex !== null);
      if (!hit) return null;
      const { partId, copy } = hit.object.userData as { partId: string; copy: number };
      const entry = parts.get(partId);
      if (!entry) return null;
      const stitch = entry.buffers.source.faceStitch[hit.faceIndex!];
      if (stitch === undefined) return null;
      const loc = stitchLocation(entry.buffers.source, stitch);
      if (!loc) return null;
      return { partId, copy, stitch, ...loc, point: [hit.point.x, hit.point.y, hit.point.z] };
    },

    setHighlight(target) {
      const next = target && typeof target.partId === "string" ? { ...target } : null;
      // El mismo resaltado no pide otro frame (T12): el estudio lo vuelve a fijar en cada edición y en cada
      // movimiento del cursor. `setScene` recalcula el rango si cambió la malla.
      if (next?.partId === highlight?.partId && next?.copy === highlight?.copy && next?.roundIndex === highlight?.roundIndex) return;
      highlight = next;
      refreshHighlightRange();
      refreshMaterials();
      invalidate();
    },

    bounds() {
      if (parts.size === 0) return null;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3();
      for (const e of parts.values()) {
        const local = e.buffers.geometry.boundingBox;
        if (!local) continue;
        for (const m of e.meshes) box.union(local.clone().applyMatrix4(m.matrixWorld));
      }
      if (box.isEmpty()) return null;
      const s = box.getBoundingSphere(new THREE.Sphere());
      return { center: [s.center.x, s.center.y, s.center.z], radius: s.radius };
    },

    async snapshot({ width, height, footer }) {
      gl.render(scene, camera);
      const src = gl.domElement;
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(width));
      out.height = Math.max(1, Math.round(height));
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("Sin contexto 2D para la captura.");
      const footerPx = footer ? Math.max(14, Math.round(out.height * 0.06)) : 0;
      const availH = out.height - footerPx * 1.6;
      const scale = Math.min(out.width / src.width, availH / src.height);
      const w = src.width * scale;
      const h = src.height * scale;
      ctx.fillStyle = opts.background ?? "#F3EFE9";
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(src, (out.width - w) / 2, (availH - h) / 2, w, h); // mismo turno que el render
      if (footer) {
        ctx.fillStyle = "#3A332D";
        ctx.font = `${footerPx}px system-ui, sans-serif`;
        ctx.textBaseline = "bottom";
        ctx.fillText(footer, footerPx * 0.5, out.height - footerPx * 0.3, out.width - footerPx);
      }
      return new Promise<Blob>((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo crear la captura."))), "image/png"));
    },

    setMaterialVariant(v) {
      variant = v;
      if (base && v === "base") {
        const hex = looks[0]?.hex ?? "#8C8C8C";
        base.relief.color.set(hex);
        base.smooth.color.set(hex);
      }
      refreshMaterials();
      invalidate();
    },

    stats() {
      const programs = gl.info.programs ?? [];
      let vertices = 0;
      let meshes = 0;
      for (const e of parts.values()) {
        vertices += e.buffers.source.vertexCount * e.meshes.length;
        meshes += e.meshes.length;
      }
      return {
        ...counters,
        programs: programs.length,
        programNames: programs.map((p) => p.name),
        parts: parts.size,
        meshes,
        stitches: policy.mode === "silhouettes" ? 0 : lastStitches,
        vertices,
        lod: policy.lod,
        mode: policy.mode,
        variant,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
      };
    },

    resetStats() {
      for (const k of Object.keys(counters) as (keyof typeof counters)[]) counters[k] = 0;
    },

    renderNow(sync = true) {
      const t = performance.now();
      gl.render(scene, camera);
      if (sync) {
        const ctx = gl.getContext();
        ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array(4)); // espera a la GPU
      }
      return performance.now() - t;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      clearParts();
      scene.remove(root, hemi);
      camera.remove(dir);
      scene.background = previousBackground;
      for (const m of [fiber.relief, fiber.smooth, highlighted.relief, highlighted.smooth, base?.relief, base?.smooth]) m?.dispose();
      normalMap.dispose();
      hemi.dispose();
      dir.dispose();
    },
  };
  return renderer;
}
