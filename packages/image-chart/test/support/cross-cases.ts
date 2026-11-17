/**
 * Casos de la prueba cruzada Node/Deno de `resizeArea` (puerta T2 de la fase 5; IA-P3).
 * El mismo módulo lo importan la prueba de Node (`test/cross.test.ts`) y la función de medición
 * en Deno (`supabase/functions/t2-medicion`), así que la entrada es idéntica por construcción.
 * Sin dependencias ni APIs de un entorno: solo aritmética entera.
 */
import type { Raster } from "../../src/index.ts";

export interface CrossCase {
  name: string;
  width: number;
  height: number;
  maxSide: number;
  seed: number;
  /** Con zonas transparentes y semitransparentes. */
  alpha: boolean;
}

export const CROSS_CASES: readonly CrossCase[] = [
  { name: "2048x2048->1024", width: 2048, height: 2048, maxSide: 1024, seed: 1, alpha: false },
  { name: "2048x1536->1024", width: 2048, height: 1536, maxSide: 1024, seed: 2, alpha: false },
  { name: "1999x1001->1024", width: 1999, height: 1001, maxSide: 1024, seed: 3, alpha: true },
  { name: "777x2048->1024", width: 777, height: 2048, maxSide: 1024, seed: 4, alpha: true },
  { name: "1025x64->1024", width: 1025, height: 64, maxSide: 1024, seed: 5, alpha: false },
  { name: "2048x2048->768", width: 2048, height: 2048, maxSide: 768, seed: 6, alpha: true },
  { name: "1024x1024->200", width: 1024, height: 1024, maxSide: 200, seed: 7, alpha: false },
  { name: "640x480->1024 (sin cambio)", width: 640, height: 480, maxSide: 1024, seed: 8, alpha: true },
];

/** mulberry32: generador de 32 bits, determinista en cualquier motor de JavaScript. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** Raster parecido a una foto: degradados, bloques de color, ruido y (opcional) alfa. */
export function crossRaster(c: CrossCase): Raster {
  const rnd = mulberry32(c.seed);
  const data = new Uint8ClampedArray(c.width * c.height * 4);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const p = (y * c.width + x) * 4;
      const n = rnd();
      const block = ((x >> 5) + (y >> 5)) & 3;
      data[p] = ((x * 255) / c.width + (n & 31) + block * 40) & 255;
      data[p + 1] = ((y * 255) / c.height + ((n >>> 5) & 31)) & 255;
      data[p + 2] = (((x ^ y) & 255) + ((n >>> 10) & 15)) & 255;
      let a = 255;
      if (c.alpha) {
        const zone = (x * 7 + y * 3) % 97;
        a = zone < 20 ? 0 : zone < 30 ? (n >>> 16) & 255 : 255;
      }
      data[p + 3] = a;
    }
  }
  return { width: c.width, height: c.height, data };
}
