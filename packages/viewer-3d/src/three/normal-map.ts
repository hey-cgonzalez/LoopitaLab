/**
 * Relieve procedural del punto (ADR 0010, sección 6): un mapa de normales calculado en memoria, sin archivos
 * de imagen ni fotos de lanas (regla de oro 9). Dibuja la "V" de un punto bajo visto de frente: dos lazadas
 * inclinadas con un surco al centro, repetida una vez por punto con las uv de la malla (0 a 1 por punto).
 */
import * as THREE from "three";
import { STITCH_NORMAL_MAP_SIZE } from "./constants.ts";

/** Alturas del relieve (0 a ~2), fila mayor, `size × size`. Pura: se prueba sin GPU. */
export function stitchHeightField(size: number = STITCH_NORMAL_MAP_SIZE): Float32Array {
  const h = new Float32Array(size * size);
  const lobe = (u: number, v: number, cx: number, tilt: number): number => {
    const du = (u - cx - tilt * (v - 0.5)) / 0.2;
    const dv = (v - 0.5) / 0.48;
    return Math.max(0, 1 - du * du - dv * dv);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      h[y * size + x] = Math.sqrt(lobe(u, v, 0.3, 0.35)) + Math.sqrt(lobe(u, v, 0.7, -0.35));
    }
  }
  return h;
}

/** Normales en espacio tangente (RGBA8) a partir de las alturas, con borde que se repite. */
export function normalsFromHeights(h: Float32Array, size: number, strength = 2.5): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number): number => h[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const k = (y * size + x) * 4;
      data[k] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      data[k + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      data[k + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      data[k + 3] = 255;
    }
  }
  return data;
}

export function createStitchNormalMap(size: number = STITCH_NORMAL_MAP_SIZE): THREE.DataTexture {
  const tex = new THREE.DataTexture(normalsFromHeights(stitchHeightField(size), size), size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.name = "loopita-stitch-normal";
  tex.needsUpdate = true;
  return tex;
}
