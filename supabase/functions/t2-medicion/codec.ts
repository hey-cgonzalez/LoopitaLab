/**
 * Códecs de jSquash en Deno (puerta T2 de la fase 5; ADR 0013, sección 8).
 *
 * El JavaScript de jSquash llega por `npm:` con versión exacta (deno.json). El WebAssembly NO se
 * carga desde el paquete: el despliegue por la API (MCP `deploy_edge_function`) no admite
 * archivos estáticos ("Static files cannot be deployed using the API flag", límites de Edge
 * Functions). Por eso se descarga una vez por instancia desde jsDelivr (que sirve el mismo
 * archivo del paquete de npm) y se verifica su SHA-256 antes de compilarlo: si el hash no
 * coincide, la función falla cerrada. Es solo para medir; la propuesta para producción está en
 * docs/qa-fase-5.md ("Puerta T2").
 */
import { default as decodeJpegRaw, init as initJpeg } from "@jsquash/jpeg/decode.js";
import { decode as decodePngRaw, init as initPngDec } from "@jsquash/png/decode.js";
import { default as encodePngRaw, init as initPngEnc } from "@jsquash/png/encode.js";
import { default as decodeWebpRaw, init as initWebp } from "@jsquash/webp/decode.js";

// El decodificador PNG (wasm-bindgen) construye `ImageData`, que Deno no trae. Los de
// Emscripten (JPEG y WebP) definen el suyo si falta; este es compatible con ambos.
if (typeof (globalThis as { ImageData?: unknown }).ImageData === "undefined") {
  (globalThis as { ImageData?: unknown }).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace = "srgb";
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
}

export interface DecodedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const WASM = {
  jpegDec: {
    url: "https://cdn.jsdelivr.net/npm/@jsquash/jpeg@1.6.0/codec/dec/mozjpeg_dec.wasm",
    sha256: "a7c4b12169817e779ff4af137981393ae924944e167ad1bd95747c9199162d3e",
  },
  png: {
    url: "https://cdn.jsdelivr.net/npm/@jsquash/png@3.1.1/codec/pkg/squoosh_png_bg.wasm",
    sha256: "263d6e658808a74b72a1a99c5cc1d619237e70c150db6e41d5d84d3d117ab9be",
  },
  webpDec: {
    url: "https://cdn.jsdelivr.net/npm/@jsquash/webp@1.5.0/codec/dec/webp_dec.wasm",
    sha256: "30fb52fa2a80166d25ba7debf902218904ba1f05ccce9f959f722beff9e2f344",
  },
} as const;

type WasmName = keyof typeof WASM;

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface WasmLoadTiming {
  name: WasmName;
  bytes: number;
  fetchMs: number;
  hashMs: number;
  compileMs: number;
}

async function loadWasm(name: WasmName): Promise<{ module: WebAssembly.Module; timing: WasmLoadTiming }> {
  const { url, sha256 } = WASM[name];
  const t0 = performance.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`wasm ${name}: HTTP ${res.status}`);
  const bytes = await res.arrayBuffer();
  const t1 = performance.now();
  const digest = hex(await crypto.subtle.digest("SHA-256", bytes));
  const t2 = performance.now();
  if (digest !== sha256) throw new Error(`wasm ${name}: el SHA-256 no coincide`);
  const module = await WebAssembly.compile(bytes);
  const t3 = performance.now();
  return { module, timing: { name, bytes: bytes.byteLength, fetchMs: t1 - t0, hashMs: t2 - t1, compileMs: t3 - t2 } };
}

export interface CodecInit {
  wasm: WasmLoadTiming[];
  instantiateMs: number;
}

let ready: Promise<CodecInit> | null = null;

/** Descarga, verifica y compila los tres WebAssembly una vez por instancia, con sus tiempos. */
export function initCodecs(): Promise<CodecInit> {
  ready ??= (async () => {
    const [jpeg, png, webp] = await Promise.all([loadWasm("jpegDec"), loadWasm("png"), loadWasm("webpDec")]);
    const t0 = performance.now();
    await initJpeg(jpeg.module);
    await initWebp(webp.module);
    // decode.js y encode.js de jSquash PNG comparten el mismo módulo wasm-bindgen: una sola instancia.
    await initPngDec(png.module);
    await initPngEnc(png.module);
    return { wasm: [jpeg.timing, png.timing, webp.timing], instantiateMs: performance.now() - t0 };
  })();
  ready.catch(() => {
    ready = null; // reintenta en la próxima invocación
  });
  return ready;
}

function plain(img: { width: number; height: number; data: Uint8ClampedArray }): DecodedImage {
  return { width: img.width, height: img.height, data: img.data };
}

export async function decodeJpeg(bytes: Uint8Array): Promise<DecodedImage> {
  await initCodecs();
  return plain(await decodeJpegRaw(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer));
}

export async function decodePng(bytes: Uint8Array): Promise<DecodedImage> {
  await initCodecs();
  return plain(await decodePngRaw(bytes));
}

export async function decodeWebp(bytes: Uint8Array): Promise<DecodedImage> {
  await initCodecs();
  return plain(await decodeWebpRaw(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer));
}

export async function encodePng(img: DecodedImage): Promise<Uint8Array> {
  await initCodecs();
  // deno-lint-ignore no-explicit-any
  return new Uint8Array(await encodePngRaw(new (globalThis as any).ImageData(img.data, img.width, img.height)));
}
