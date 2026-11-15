/**
 * Atributos reservados de una parte (ADR 0010, sección 5): una `BufferGeometry` por parte, compartida por sus
 * copias, con capacidad reservada que crece por `RESERVE_GROWTH` solo cuando la malla no cabe. Una edición
 * copia la malla en los arreglos reservados y marca el rango usado (`addUpdateRange`, `needsUpdate`,
 * `setDrawRange`): no se crean objetos ni búferes de GPU por edición. Un cambio de lana de un punto sube solo
 * el rango del atributo `yarn`. Sin WebGL: se prueba en Node.
 */
import * as THREE from "three";
import type { PartMesh } from "../types.ts";
import { grownCapacity, meshStitches } from "./policy.ts";

export interface UploadStats {
  /** Atributos marcados con `needsUpdate` (incluido el índice). */
  attributes: number;
  /** Bytes del rango marcado. */
  bytes: number;
  /** true si hubo que crecer (geometría nueva: las copias deben apuntar a `geometry`). */
  grew: boolean;
}

interface Attrs {
  position: THREE.BufferAttribute;
  normal: THREE.BufferAttribute;
  uv: THREE.BufferAttribute;
  yarn: THREE.BufferAttribute;
  loop: THREE.BufferAttribute;
  index: THREE.BufferAttribute;
}

function mark(attr: THREE.BufferAttribute, start: number, count: number): number {
  attr.clearUpdateRanges();
  if (count <= 0) return 0;
  attr.addUpdateRange(start, count);
  attr.needsUpdate = true;
  return count * attr.array.BYTES_PER_ELEMENT;
}

export class PartBuffers {
  geometry: THREE.BufferGeometry;
  /** Malla que está subida (referencia: `colorizePartMesh` la reescribe en el lugar). */
  source: PartMesh;
  vertexCapacity = 0;
  indexCapacity = 0;
  growths = 0;
  /** Lo que marcó la última subida (la del constructor incluida). */
  lastUpload: UploadStats;
  private attrs!: Attrs;

  constructor(mesh: PartMesh) {
    this.source = mesh;
    this.geometry = new THREE.BufferGeometry();
    this.allocate(grownCapacity(0, mesh.vertexCount), grownCapacity(0, mesh.indexCount));
    this.lastUpload = this.copyAll(mesh);
  }

  get stitches(): number {
    return meshStitches(this.source);
  }

  private allocate(vertices: number, indices: number): void {
    const v = Math.max(1, vertices);
    const i = Math.max(3, indices);
    const dyn = (a: THREE.BufferAttribute) => a.setUsage(THREE.DynamicDrawUsage);
    this.attrs = {
      position: dyn(new THREE.BufferAttribute(new Float32Array(v * 3), 3)),
      normal: dyn(new THREE.BufferAttribute(new Float32Array(v * 3), 3)),
      uv: dyn(new THREE.BufferAttribute(new Float32Array(v * 2), 2)),
      yarn: dyn(new THREE.BufferAttribute(new Uint8Array(v), 1)),
      loop: dyn(new THREE.BufferAttribute(new Uint8Array(v), 1)),
      index: dyn(new THREE.BufferAttribute(new Uint32Array(i), 1)),
    };
    const g = this.geometry;
    g.setAttribute("position", this.attrs.position);
    g.setAttribute("normal", this.attrs.normal);
    g.setAttribute("uv", this.attrs.uv);
    g.setAttribute("yarn", this.attrs.yarn);
    g.setAttribute("loop", this.attrs.loop);
    g.setIndex(this.attrs.index);
    this.vertexCapacity = v;
    this.indexCapacity = i;
  }

  private copyAll(mesh: PartMesh): UploadStats {
    const a = this.attrs;
    const n = mesh.vertexCount;
    const ix = mesh.indexCount;
    (a.position.array as Float32Array).set(mesh.positions.subarray(0, n * 3));
    (a.normal.array as Float32Array).set(mesh.normals.subarray(0, n * 3));
    (a.uv.array as Float32Array).set(mesh.uvs.subarray(0, n * 2));
    (a.yarn.array as Uint8Array).set(mesh.yarn.subarray(0, n));
    (a.loop.array as Uint8Array).set(mesh.loop.subarray(0, n));
    (a.index.array as Uint32Array).set(mesh.indices.subarray(0, ix));
    let bytes = 0;
    bytes += mark(a.position, 0, n * 3);
    bytes += mark(a.normal, 0, n * 3);
    bytes += mark(a.uv, 0, n * 2);
    bytes += mark(a.yarn, 0, n);
    bytes += mark(a.loop, 0, n);
    bytes += mark(a.index, 0, ix);
    this.geometry.setDrawRange(0, ix);
    this.updateBounds(mesh);
    return { attributes: n > 0 ? 6 : ix > 0 ? 1 : 0, bytes, grew: false };
  }

  private updateBounds(mesh: PartMesh): void {
    const { min, max } = mesh.bounds;
    const center = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
    const ok = [center.x, center.y, center.z, radius].every(Number.isFinite);
    this.geometry.boundingSphere = new THREE.Sphere(ok ? center : new THREE.Vector3(), ok ? radius : 0);
    this.geometry.boundingBox = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
  }

  /** Sube una malla nueva de la parte. Si no cabe, crece por `RESERVE_GROWTH` (geometría nueva, se cuenta). */
  write(mesh: PartMesh): UploadStats {
    this.source = mesh;
    if (mesh.vertexCount > this.vertexCapacity || mesh.indexCount > this.indexCapacity) {
      const old = this.geometry;
      this.geometry = new THREE.BufferGeometry();
      this.allocate(grownCapacity(this.vertexCapacity, mesh.vertexCount), grownCapacity(this.indexCapacity, mesh.indexCount));
      old.dispose();
      this.growths++;
      this.lastUpload = { ...this.copyAll(mesh), grew: true };
      return this.lastUpload;
    }
    this.lastUpload = this.copyAll(mesh);
    return this.lastUpload;
  }

  /** Sube solo `yarn` en `[from, to)` de la malla actual (recoloreada en el lugar). */
  writeYarnRange(from: number, to: number): UploadStats {
    const n = this.source.vertexCount;
    const a = Math.max(0, Math.min(n, Math.floor(from)));
    const b = Math.max(a, Math.min(n, Math.ceil(to)));
    if (b <= a) return { attributes: 0, bytes: 0, grew: false };
    (this.attrs.yarn.array as Uint8Array).set(this.source.yarn.subarray(a, b), a);
    return { attributes: 1, bytes: mark(this.attrs.yarn, a, b - a), grew: false };
  }

  /** Versiones de los atributos (suben con cada `needsUpdate`), para la guardia de rendimiento. */
  versions(): number {
    const a = this.attrs;
    return a.position.version + a.normal.version + a.uv.version + a.yarn.version + a.loop.version + a.index.version;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
