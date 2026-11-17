/**
 * `image-chart`: raster de trabajo → gráfico de colorwork (ADR 0012, sección 8; ADR 0013).
 *
 * ESQUELETO DE LA PUERTA T2 (fase 5). Solo trae lo que T2 necesita medir en Deno y en Node:
 * `sniffImageHeader` (tipo y dimensiones sin decodificar) y `resizeArea` (promedio por área,
 * determinista). `rasterToChart`, `detectExactRepeat`, las pruebas de propiedades IA-P3 y el
 * README son de T7, que puede reescribir este archivo respetando el contrato del ADR 0012.
 *
 * Puro y sin dependencias: corre igual en el navegador, en Node y en Deno (Edge Functions).
 */

/** Raster RGBA de 8 bits, fila 0 arriba (como `ImageData`). */
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface ImageHeader {
  format: "jpeg" | "png" | "webp";
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function ascii(b: Uint8Array, at: number, text: string): boolean {
  if (at + text.length > b.length) return false;
  for (let i = 0; i < text.length; i++) if (b[at + i] !== text.charCodeAt(i)) return false;
  return true;
}

function u8(b: Uint8Array, i: number): number {
  return b[i] ?? 0;
}

function sniffJpeg(b: Uint8Array): ImageHeader | null {
  // SOI ya verificado por quien llama. Recorre los segmentos hasta SOF0, SOF1 o SOF2.
  let i = 2;
  while (i < b.length) {
    if (u8(b, i) !== 0xff) return null;
    while (i < b.length && u8(b, i) === 0xff) i++; // bytes de relleno
    if (i >= b.length) return null;
    const marker = u8(b, i);
    i++;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // sin longitud
    if (marker === 0xd8 || marker === 0xd9 || marker === 0xda) return null; // SOI repetido, EOI o SOS antes del SOF
    if (i + 2 > b.length) return null;
    const segLen = (u8(b, i) << 8) | u8(b, i + 1);
    if (segLen < 2 || i + segLen > b.length) return null;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (segLen < 8) return null;
      const height = (u8(b, i + 3) << 8) | u8(b, i + 4);
      const width = (u8(b, i + 5) << 8) | u8(b, i + 6);
      if (width === 0 || height === 0) return null; // alto 0 = definido por DNL: no se admite
      return { format: "jpeg", width, height };
    }
    // Otros SOF (sin pérdida, aritmético, jerárquico): no se admiten. C4 (DHT), C8 (JPG) y CC (DAC) no son SOF.
    if (marker >= 0xc3 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return null;
    i += segLen;
  }
  return null;
}

function sniffPng(b: Uint8Array): ImageHeader | null {
  if (b.length < 33) return null; // firma + IHDR completo con CRC
  const len = ((u8(b, 8) << 24) | (u8(b, 9) << 16) | (u8(b, 10) << 8) | u8(b, 11)) >>> 0;
  if (len !== 13 || !ascii(b, 12, "IHDR")) return null;
  const width = ((u8(b, 16) << 24) | (u8(b, 17) << 16) | (u8(b, 18) << 8) | u8(b, 19)) >>> 0;
  const height = ((u8(b, 20) << 24) | (u8(b, 21) << 16) | (u8(b, 22) << 8) | u8(b, 23)) >>> 0;
  if (width === 0 || height === 0 || width > 0x7fffffff || height > 0x7fffffff) return null;
  return { format: "png", width, height };
}

function sniffWebp(b: Uint8Array): ImageHeader | null {
  if (ascii(b, 12, "VP8 ")) {
    if (b.length < 30) return null;
    if ((u8(b, 20) & 1) !== 0) return null; // no es cuadro clave
    if (u8(b, 23) !== 0x9d || u8(b, 24) !== 0x01 || u8(b, 25) !== 0x2a) return null;
    const width = (u8(b, 26) | (u8(b, 27) << 8)) & 0x3fff;
    const height = (u8(b, 28) | (u8(b, 29) << 8)) & 0x3fff;
    if (width === 0 || height === 0) return null;
    return { format: "webp", width, height };
  }
  if (ascii(b, 12, "VP8L")) {
    if (b.length < 25 || u8(b, 20) !== 0x2f) return null;
    const bits = (u8(b, 21) | (u8(b, 22) << 8) | (u8(b, 23) << 16) | (u8(b, 24) << 24)) >>> 0;
    return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (ascii(b, 12, "VP8X")) {
    if (b.length < 30) return null;
    const width = 1 + (u8(b, 24) | (u8(b, 25) << 8) | (u8(b, 26) << 16));
    const height = 1 + (u8(b, 27) | (u8(b, 28) << 8) | (u8(b, 29) << 16));
    return { format: "webp", width, height };
  }
  return null;
}

/**
 * Tipo real y dimensiones leyendo solo el encabezado, sin decodificar (ADR 0013, sección 2,
 * paso 7). JPEG: SOF0 a SOF2. PNG: IHDR. WebP: VP8, VP8L o VP8X. Cualquier otra cosa, o un
 * encabezado truncado o incoherente, da `null`.
 */
export function sniffImageHeader(bytes: Uint8Array): ImageHeader | null {
  if (bytes.length >= 4 && u8(bytes, 0) === 0xff && u8(bytes, 1) === 0xd8 && u8(bytes, 2) === 0xff) return sniffJpeg(bytes);
  if (PNG_SIGNATURE.every((v, i) => u8(bytes, i) === v)) return sniffPng(bytes);
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return sniffWebp(bytes);
  return null;
}

/** Dimensiones de salida de `resizeArea`: el lado mayor queda en `maxSide`, redondeo mitad hacia arriba. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (Math.max(width, height) <= maxSide) return { width, height };
  if (width >= height) return { width: maxSide, height: Math.max(1, Math.floor((2 * height * maxSide + width) / (2 * width))) };
  return { width: Math.max(1, Math.floor((2 * width * maxSide + height) / (2 * height))), height: maxSide };
}

interface AxisWeights {
  /** `start[o]..start[o+1]` son los índices en `src`/`w` de la salida `o`. */
  start: Int32Array;
  src: Int32Array;
  w: Int32Array;
}

/**
 * Pesos enteros de un eje. Se mide en unidades de 1/(srcLen·dstLen): cada píxel de origen ocupa
 * `dstLen` unidades y cada píxel de salida, `srcLen`. El peso es el traslape, siempre entero, y
 * los pesos de una salida suman `srcLen`.
 */
function axisWeights(srcLen: number, dstLen: number): AxisWeights {
  const start = new Int32Array(dstLen + 1);
  const src: number[] = [];
  const w: number[] = [];
  for (let o = 0; o < dstLen; o++) {
    start[o] = src.length;
    const a = o * srcLen;
    const b = a + srcLen;
    const i0 = Math.floor(a / dstLen);
    const i1 = Math.floor((b - 1) / dstLen);
    for (let i = i0; i <= i1; i++) {
      const overlap = Math.min(b, (i + 1) * dstLen) - Math.max(a, i * dstLen);
      if (overlap > 0) {
        src.push(i);
        w.push(overlap);
      }
    }
  }
  start[dstLen] = src.length;
  return { start, src: Int32Array.from(src), w: Int32Array.from(w) };
}

/**
 * Reduce un raster RGBA para que su lado mayor quede en `maxSide` (nunca agranda), con promedio
 * por área exacto: pesos enteros, sumas exactas en doble precisión (< 2^53 para rasters de hasta
 * 2^37 píxeles) y un único redondeo final mitad hacia arriba. El color se promedia ponderado por
 * el alfa (premultiplicado), para que el fondo transparente no oscurezca los bordes. El mismo
 * raster da los mismos bytes en el navegador, en Node y en Deno (prueba cruzada de T2, IA-P3).
 */
export function resizeArea(r: Raster, maxSide: number): Raster {
  const { width: sw, height: sh, data } = r;
  if (!Number.isInteger(sw) || !Number.isInteger(sh) || sw < 1 || sh < 1) throw new RangeError("resizeArea: dimensiones inválidas");
  if (data.length !== sw * sh * 4) throw new RangeError("resizeArea: el largo de data no es width × height × 4");
  if (!Number.isInteger(maxSide) || maxSide < 1) throw new RangeError("resizeArea: maxSide inválido");
  const { width: dw, height: dh } = fitWithin(sw, sh, maxSide);
  if (dw === sw && dh === sh) return { width: sw, height: sh, data: new Uint8ClampedArray(data) };

  const xs = axisWeights(sw, dw);
  const ys = axisWeights(sh, dh);
  const total = sw * sh; // suma de los pesos 2D de cada píxel de salida
  const out = new Uint8ClampedArray(dw * dh * 4);
  const acc = new Float64Array(dw * 4);
  const row = new Float64Array(dw * 4); // sumas horizontales de la fila de origen `rowY`
  let rowY = -1;

  for (let oy = 0; oy < dh; oy++) {
    acc.fill(0);
    const ky1 = ys.start[oy + 1] ?? 0;
    for (let ky = ys.start[oy] ?? 0; ky < ky1; ky++) {
      const y = ys.src[ky] ?? 0;
      const wy = ys.w[ky] ?? 0;
      if (y !== rowY) {
        // Una fila de origen se comparte entre a lo más dos filas de salida consecutivas.
        const base = y * sw * 4;
        for (let ox = 0; ox < dw; ox++) {
          let sa = 0, sr = 0, sg = 0, sb = 0;
          const kx1 = xs.start[ox + 1] ?? 0;
          for (let kx = xs.start[ox] ?? 0; kx < kx1; kx++) {
            const p = base + (xs.src[kx] ?? 0) * 4;
            const wa = (xs.w[kx] ?? 0) * (data[p + 3] ?? 0);
            sa += wa;
            sr += wa * (data[p] ?? 0);
            sg += wa * (data[p + 1] ?? 0);
            sb += wa * (data[p + 2] ?? 0);
          }
          const q = ox * 4;
          row[q] = sa;
          row[q + 1] = sr;
          row[q + 2] = sg;
          row[q + 3] = sb;
        }
        rowY = y;
      }
      for (let q = 0; q < acc.length; q++) acc[q] = (acc[q] ?? 0) + wy * (row[q] ?? 0);
    }
    const ob = oy * dw * 4;
    for (let ox = 0; ox < dw; ox++) {
      const q = ox * 4;
      const sa = acc[q] ?? 0;
      const o = ob + q;
      if (sa > 0) {
        out[o] = Math.round((acc[q + 1] ?? 0) / sa);
        out[o + 1] = Math.round((acc[q + 2] ?? 0) / sa);
        out[o + 2] = Math.round((acc[q + 3] ?? 0) / sa);
      }
      out[o + 3] = Math.round(sa / total);
    }
  }
  return { width: dw, height: dh, data: out };
}
