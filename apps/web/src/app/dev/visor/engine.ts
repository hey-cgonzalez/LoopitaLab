import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createFiberMaterials, createStitchNormalMap, createYarnTable, MAX_YARNS, writeLooks, type Lod, type SurfaceLook } from "./fiber-material.ts";
import { allocBuffers, fillMesh, meshSize, REFERENCE_SPHERE, sphereCounts, type MeshBuffers, type SphereSpec } from "./synthetic-mesh.ts";

/**
 * Motor imperativo del prototipo T3b (lo que en T11 será `createThreeRenderer` de `viewer-3d/three`).
 * React solo lo monta: ninguna edición pasa por un render de React.
 *
 * Todo lo que mide lo expone en `window.__loopitaVisor` (ver `VisorApi`), para el script de medición
 * `apps/web/e2e/medir-visor.ts` (no corre en la CI).
 */

/** 32 lanas sintéticas: las primeras 3 son las del escenario de referencia; el resto, tonos repartidos. */
export function syntheticLooks(fiber: boolean): SurfaceLook[] {
  const fixed: SurfaceLook[] = [
    { hex: "#e8c9a0", halo: 0, sheen: 0.5, definition: 1 }, // algodón
    { hex: "#7a4b8c", halo: 1, sheen: 0.5, definition: 0 }, // mohair con seda
    { hex: "#3f7f6a", halo: 0.5, sheen: 0, definition: 0.5 }, // lana
  ];
  const looks: SurfaceLook[] = [];
  for (let i = 0; i < MAX_YARNS; i++) {
    const base = fixed[i] ?? { hex: `#${new THREE.Color().setHSL((i * 0.137) % 1, 0.45, 0.55, THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace)}`, halo: (i % 3) / 2, sheen: (i % 2) * 0.5, definition: ((i + 1) % 3) / 2 };
    looks.push(fiber ? base : { hex: base.hex, halo: 0, sheen: 0, definition: 0 });
  }
  return looks;
}

interface Piece {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  buffers: MeshBuffers;
  attrs: { position: THREE.BufferAttribute; normal: THREE.BufferAttribute; uv: THREE.BufferAttribute; yarn: THREE.BufferAttribute; index: THREE.BufferAttribute };
  spec: SphereSpec;
  counts: number[];
  roundVertexStart: number[];
  vertexCount: number;
  indexCount: number;
  stitches: number;
  offset: [number, number, number];
  edits: number;
}

export interface Timing {
  fillMs: number;
  uploadDrawMs: number;
}

export interface FrameStats {
  frames: number;
  fps: number;
  p50: number;
  p95: number;
  max: number;
}

export interface VisorInfo {
  programs: number;
  programNames: string[];
  renderer: string;
  webgl2: boolean;
  maxVertexUniformVectors: number;
  maxFragmentUniformVectors: number;
  stitches: number;
  vertices: number;
  pieces: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
  drawingBuffer: [number, number];
  lod: Lod;
  fiber: boolean;
  capacityGrowths: number;
  heapMB: number | null;
}

export interface VisorApi {
  ready: true;
  /** Arma una escena de unos `stitches` puntos: 1 pieza si es ≤ 2.500, si no, varias esferas de 2.448 puntos. */
  setScene(stitches: number): { buildMs: number; uploadDrawMs: number; stitches: number; vertices: number; pieces: number };
  /** Edita una vuelta de la pieza `piece` (cambia las vueltas rectas) y reescribe sus atributos en el lugar. */
  editRound(piece?: number): Timing;
  /** Igual que `editRound`, pero hasta el frame pintado por r3f (`frameloop="demand"`): `edit-to-paint-3d`. */
  editToPaint(piece?: number): Promise<{ fillMs: number; paintMs: number }>;
  /** Cambia la lana de los puntos de una vuelta: solo el rango del atributo `yarn` (`colorizePartMesh`). */
  recolorToPaint(piece?: number): Promise<{ fillMs: number; paintMs: number; uploadedBytes: number }>;
  /** `setLooks`: solo la tabla de uniformes. Devuelve el tiempo de escribirla y hasta el frame pintado. */
  setLooksToPaint(fiber: boolean, shift?: number): Promise<{ setLooksMs: number; paintMs: number; attributesMarked: number }>;
  hoverToPaint(yarn: number, hex: string): Promise<{ ms: number; paintMs: number }>;
  setLod(lod: Lod): void;
  setPixelRatio(pr: number): void;
  /** Gira la cámara durante `ms` pidiendo un frame en cada `requestAnimationFrame` y mide los intervalos. */
  orbit(ms: number): Promise<FrameStats>;
  /** Costo de `k` frames síncronos (render + `readPixels` de 1 px, que espera a la GPU), sin el tope del vsync. */
  renderCost(k: number): { p50: number; p95: number };
  info(): VisorInfo;
}

const RESERVE_GROWTH = 1.5;

export class PrototypeEngine {
  private readonly table = createYarnTable();
  private readonly normalMap = createStitchNormalMap();
  private readonly materials = createFiberMaterials(this.table, this.normalMap);
  private readonly root = new THREE.Group();
  private readonly controls: OrbitControls;
  private pieces: Piece[] = [];
  private lod: Lod = "relief";
  private fiber = true;
  private looks = syntheticLooks(true);
  private capacityGrowths = 0;
  private painted: (() => void) | null = null;
  private readonly channel = new MessageChannel();
  private readonly lights: THREE.Light[];

  constructor(
    private readonly gl: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly invalidate: () => void,
  ) {
    scene.background = new THREE.Color("#f3efe9");
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb8a99a, 1.1);
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(3, -4, 6);
    camera.add(dir); // la luz sigue a la cámara
    scene.add(camera);
    this.lights = [hemi, dir];
    scene.add(hemi, this.root);
    this.root.rotation.x = -Math.PI / 2; // la pieza crece hacia +z; se muestra de pie
    this.controls = new OrbitControls(camera, gl.domElement);
    this.controls.addEventListener("change", invalidate);
    // Fin de frame para la medición: lo primero que corre después de que r3f dibujó (como `perf.ts` de la fase 2).
    scene.onAfterRender = () => {
      const done = this.painted;
      if (!done) return;
      this.painted = null;
      let fired = false;
      const fire = () => {
        if (fired) return;
        fired = true;
        done();
      };
      this.channel.port1.onmessage = fire;
      this.channel.port2.postMessage(0);
      requestAnimationFrame(fire);
    };
    writeLooks(this.table, this.looks);
    this.setScene(2448);
    // Los dos programas (relief y smooth) se compilan al montar, para que el primer cambio de nivel no se note.
    this.precompile();
  }

  private precompile() {
    const probe = this.pieces[0]?.mesh;
    if (!probe) return;
    const keep = probe.material;
    for (const lod of ["relief", "smooth"] as const) {
      probe.material = this.materials[lod];
      this.gl.compile(this.scene, this.camera);
    }
    probe.material = keep;
  }

  private nextPaint(): Promise<number> {
    return new Promise((resolve) => {
      this.painted = () => resolve(performance.now());
      this.invalidate();
    });
  }

  private syncRender(): number {
    const t = performance.now();
    this.gl.render(this.scene, this.camera);
    const px = new Uint8Array(4);
    const ctx = this.gl.getContext();
    ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px); // espera a la GPU
    return performance.now() - t;
  }

  private yarnOf(pieceIndex: number, edits: number) {
    // 3 lanas y cambios de color en 5 vueltas (escenario de referencia); en las escenas grandes, las 32 lanas.
    return (round: number, stitch: number) => {
      if (pieceIndex > 0) return (pieceIndex + round) % MAX_YARNS;
      if (round >= 12 && round < 17) return (round + edits) % 2 === 0 ? 1 : 2;
      return stitch % 30 === 0 && round > 20 ? 2 : 0;
    };
  }

  private makePiece(spec: SphereSpec, offset: [number, number, number], index: number): Piece {
    const counts = sphereCounts(spec);
    const size = meshSize(counts);
    const capV = Math.ceil(size.vertices * RESERVE_GROWTH);
    const capI = Math.ceil(size.indices * RESERVE_GROWTH);
    const buffers = allocBuffers(capV, capI);
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(buffers.positions, 3).setUsage(THREE.DynamicDrawUsage);
    const normal = new THREE.BufferAttribute(buffers.normals, 3).setUsage(THREE.DynamicDrawUsage);
    const uv = new THREE.BufferAttribute(buffers.uvs, 2).setUsage(THREE.DynamicDrawUsage);
    const yarn = new THREE.BufferAttribute(buffers.yarn, 1).setUsage(THREE.DynamicDrawUsage);
    const indexAttr = new THREE.BufferAttribute(buffers.indices, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", position);
    geometry.setAttribute("normal", normal);
    geometry.setAttribute("uv", uv);
    geometry.setAttribute("yarn", yarn);
    geometry.setIndex(indexAttr);
    const mesh = new THREE.Mesh(geometry, this.materials[this.lod]);
    const piece: Piece = { mesh, buffers, attrs: { position, normal, uv, yarn, index: indexAttr }, spec, counts, roundVertexStart: [], vertexCount: 0, indexCount: 0, stitches: 0, offset, edits: 0 };
    this.fill(piece, index);
    return piece;
  }

  /** Llena los arreglos reservados y marca el rango usado. Crece por 1,5 si no alcanza (no pasa en la medición). */
  private fill(piece: Piece, index: number) {
    const size = meshSize(piece.counts);
    if (size.vertices > piece.attrs.yarn.count || size.indices > piece.attrs.index.count) {
      // Crecer = nuevos arreglos y nuevo búfer de GPU (evento raro; se cuenta).
      this.capacityGrowths++;
      const old = piece.mesh;
      old.geometry.dispose();
      const fresh = this.makePiece(piece.spec, piece.offset, index);
      old.parent?.add(fresh.mesh);
      old.parent?.remove(old);
      Object.assign(piece, { ...fresh, edits: piece.edits });
      return;
    }
    const res = fillMesh(piece.buffers, piece.counts, piece.spec, this.yarnOf(index, piece.edits), piece.offset);
    piece.roundVertexStart = res.roundVertexStart;
    piece.vertexCount = res.vertexCount;
    piece.indexCount = res.indexCount;
    piece.stitches = res.stitches;
    for (const [attr, n] of [
      [piece.attrs.position, res.vertexCount * 3],
      [piece.attrs.normal, res.vertexCount * 3],
      [piece.attrs.uv, res.vertexCount * 2],
      [piece.attrs.yarn, res.vertexCount],
      [piece.attrs.index, res.indexCount],
    ] as const) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n);
      attr.needsUpdate = true;
    }
    const g = piece.mesh.geometry;
    g.setDrawRange(0, res.indexCount);
    const [ox, oy, oz] = piece.offset;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(ox, oy, oz + res.height / 2), Math.hypot(res.radius, res.height / 2));
  }

  setScene(target: number) {
    for (const p of this.pieces) {
      this.root.remove(p.mesh);
      p.mesh.geometry.dispose();
    }
    this.pieces = [];
    const t0 = performance.now();
    if (target <= 2500) {
      this.pieces.push(this.makePiece({ ...REFERENCE_SPHERE }, [0, 0, 0], 0));
    } else {
      const per = meshSize(sphereCounts(REFERENCE_SPHERE)).stitches;
      const k = Math.max(1, Math.round(target / per));
      const cols = Math.ceil(Math.sqrt(k));
      for (let i = 0; i < k; i++) {
        const offset: [number, number, number] = [((i % cols) - (cols - 1) / 2) * 11, (Math.floor(i / cols) - (cols - 1) / 2) * 11, 0];
        this.pieces.push(this.makePiece({ ...REFERENCE_SPHERE }, offset, i));
      }
    }
    const buildMs = performance.now() - t0;
    for (const p of this.pieces) this.root.add(p.mesh);
    this.frame();
    const uploadDrawMs = this.syncRender();
    this.invalidate();
    const i = this.info();
    return { buildMs, uploadDrawMs, stitches: i.stitches, vertices: i.vertices, pieces: i.pieces };
  }

  private frame() {
    const box = new THREE.Box3().setFromObject(this.root);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = sphere.radius / Math.sin((this.camera.fov * Math.PI) / 360);
    this.controls.target.copy(sphere.center);
    this.camera.position.set(sphere.center.x, sphere.center.y + dist * 0.25, sphere.center.z + dist * 1.05);
    this.camera.near = Math.max(0.01, dist / 100);
    this.camera.far = dist * 10;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private edit(pieceIndex: number) {
    const piece = this.pieces[pieceIndex] ?? this.pieces[0]!;
    piece.edits++;
    // Editar una vuelta del medio: alterna entre 20 y 21 vueltas rectas (cambia conteos, vértices y todo lo de arriba).
    piece.spec = { ...piece.spec, flat: REFERENCE_SPHERE.flat + (piece.edits % 2) };
    piece.counts = sphereCounts(piece.spec);
    const t = performance.now();
    this.fill(piece, this.pieces.indexOf(piece));
    return performance.now() - t;
  }

  editRound(pieceIndex = 0): Timing {
    const fillMs = this.edit(pieceIndex);
    return { fillMs, uploadDrawMs: this.syncRender() };
  }

  async editToPaint(pieceIndex = 0) {
    const t0 = performance.now();
    const fillMs = this.edit(pieceIndex);
    const end = await this.nextPaint();
    return { fillMs, paintMs: end - t0 };
  }

  async recolorToPaint(pieceIndex = 0) {
    const piece = this.pieces[pieceIndex] ?? this.pieces[0]!;
    const t0 = performance.now();
    piece.edits++;
    const round = 14;
    const from = piece.roundVertexStart[round] ?? 0;
    const to = piece.roundVertexStart[round + 1] ?? from;
    const yarn = 1 + (piece.edits % 2);
    piece.buffers.yarn.fill(yarn, from, to);
    const a = piece.attrs.yarn;
    a.clearUpdateRanges();
    a.addUpdateRange(from, to - from);
    a.needsUpdate = true;
    const fillMs = performance.now() - t0;
    const end = await this.nextPaint();
    return { fillMs, paintMs: end - t0, uploadedBytes: to - from };
  }

  private attributeVersions(): number {
    let s = 0;
    for (const p of this.pieces) for (const a of Object.values(p.attrs)) s += a.version;
    return s;
  }

  async setLooksToPaint(fiber: boolean, shift = 0) {
    const before = this.attributeVersions();
    const t0 = performance.now();
    this.fiber = fiber;
    const looks = syntheticLooks(fiber);
    // `shift` rota los colores para que cada llamada cambie de verdad la tabla (la GPU recibe uniformes nuevos).
    this.looks = shift ? looks.map((l, i) => ({ ...l, hex: looks[(i + shift) % looks.length]!.hex })) : looks;
    writeLooks(this.table, this.looks);
    const setLooksMs = performance.now() - t0;
    const end = await this.nextPaint();
    return { setLooksMs, paintMs: end - t0, attributesMarked: this.attributeVersions() - before };
  }

  async hoverToPaint(yarn: number, hex: string) {
    const t0 = performance.now();
    const look = this.looks[yarn];
    writeLooks(this.table, this.looks, look ? { yarn, look: { ...look, hex } } : null);
    const ms = performance.now() - t0;
    const end = await this.nextPaint();
    return { ms, paintMs: end - t0 };
  }

  setLod(lod: Lod) {
    this.lod = lod;
    for (const p of this.pieces) p.mesh.material = this.materials[lod];
    this.invalidate();
  }

  setPixelRatio(pr: number) {
    this.gl.setPixelRatio(pr);
    const size = this.gl.getSize(new THREE.Vector2());
    this.gl.setSize(size.x, size.y, false);
    this.invalidate();
  }

  orbit(ms: number): Promise<FrameStats> {
    return new Promise((resolve) => {
      const deltas: number[] = [];
      const start = performance.now();
      let last = start;
      const r0 = this.camera.position.clone().sub(this.controls.target);
      const step = () => {
        const now = performance.now();
        if (now !== last) deltas.push(now - last);
        last = now;
        const angle = ((now - start) / 4000) * Math.PI * 2;
        const p = r0.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        this.camera.position.copy(this.controls.target).add(p);
        this.camera.lookAt(this.controls.target);
        this.invalidate();
        if (now - start < ms) requestAnimationFrame(step);
        else {
          deltas.shift(); // el primero incluye el arranque
          const sorted = [...deltas].sort((a, b) => a - b);
          const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))] ?? 0;
          const total = deltas.reduce((a, b) => a + b, 0);
          resolve({ frames: deltas.length, fps: total ? (deltas.length * 1000) / total : 0, p50: q(0.5), p95: q(0.95), max: sorted.at(-1) ?? 0 });
        }
      };
      requestAnimationFrame(step);
    });
  }

  renderCost(k: number) {
    const xs: number[] = [];
    const r0 = this.camera.position.clone().sub(this.controls.target);
    for (let i = 0; i < k; i++) {
      const p = r0.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (i / k) * Math.PI * 2);
      this.camera.position.copy(this.controls.target).add(p);
      this.camera.lookAt(this.controls.target);
      xs.push(this.syncRender());
    }
    this.invalidate();
    xs.sort((a, b) => a - b);
    return { p50: xs[Math.floor(k * 0.5)] ?? 0, p95: xs[Math.min(k - 1, Math.floor(k * 0.95))] ?? 0 };
  }

  info(): VisorInfo {
    const ctx = this.gl.getContext();
    const dbg = ctx.getExtension("WEBGL_debug_renderer_info");
    const programs = this.gl.info.programs ?? [];
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return {
      programs: programs.length,
      programNames: programs.map((p) => p.name),
      renderer: dbg ? String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(ctx.getParameter(ctx.RENDERER)),
      webgl2: typeof WebGL2RenderingContext !== "undefined" && ctx instanceof WebGL2RenderingContext,
      maxVertexUniformVectors: Number(ctx.getParameter(ctx.MAX_VERTEX_UNIFORM_VECTORS)),
      maxFragmentUniformVectors: Number(ctx.getParameter(ctx.MAX_FRAGMENT_UNIFORM_VECTORS)),
      stitches: this.pieces.reduce((s, p) => s + p.stitches, 0),
      vertices: this.pieces.reduce((s, p) => s + p.vertexCount, 0),
      pieces: this.pieces.length,
      calls: this.gl.info.render.calls,
      triangles: this.gl.info.render.triangles,
      geometries: this.gl.info.memory.geometries,
      textures: this.gl.info.memory.textures,
      pixelRatio: this.gl.getPixelRatio(),
      drawingBuffer: [ctx.drawingBufferWidth, ctx.drawingBufferHeight],
      lod: this.lod,
      fiber: this.fiber,
      capacityGrowths: this.capacityGrowths,
      heapMB: mem ? Math.round(mem.usedJSHeapSize / 1e5) / 10 : null,
    };
  }

  api(): VisorApi {
    return {
      ready: true,
      setScene: (n) => this.setScene(n),
      editRound: (i) => this.editRound(i),
      editToPaint: (i) => this.editToPaint(i),
      recolorToPaint: (i) => this.recolorToPaint(i),
      setLooksToPaint: (f, s) => this.setLooksToPaint(f, s),
      hoverToPaint: (y, h) => this.hoverToPaint(y, h),
      setLod: (l) => this.setLod(l),
      setPixelRatio: (pr) => this.setPixelRatio(pr),
      orbit: (ms) => this.orbit(ms),
      renderCost: (k) => this.renderCost(k),
      info: () => this.info(),
    };
  }

  dispose() {
    this.controls.dispose();
    for (const p of this.pieces) p.mesh.geometry.dispose();
    this.materials.relief.dispose();
    this.materials.smooth.dispose();
    this.normalMap.dispose();
    for (const l of this.lights) l.dispose();
    this.channel.port1.close();
    this.scene.onAfterRender = () => {};
  }
}
