/**
 * Pruebas mínimas del esqueleto de T2. Las de propiedades (IA-P3) y los casos de archivos
 * truncados y políglotas completos son de T7.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fitWithin, resizeArea, sniffImageHeader, type Raster } from "../src/index.ts";
import { CROSS_CASES, crossRaster } from "./support/cross-cases.ts";

const expected = JSON.parse(readFileSync(new URL("./support/cross-expected.json", import.meta.url), "utf8")) as Record<string, string>;

function jpegHeader(width: number, height: number, sof = 0xc0): Uint8Array {
  // SOI, APP0 (JFIF) de 16 bytes, SOF con 3 componentes.
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sofSeg = [0xff, sof, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return Uint8Array.from([0xff, 0xd8, ...app0, ...sofSeg]);
}

function pngHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  b.set([8, 6, 0, 0, 0], 24);
  return b;
}

function webpHeader(kind: "VP8 " | "VP8L" | "VP8X", width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
  b.set([..."WEBP"].map((c) => c.charCodeAt(0)), 8);
  b.set([...kind].map((c) => c.charCodeAt(0)), 12);
  const dv = new DataView(b.buffer);
  if (kind === "VP8 ") {
    b.set([0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a], 20);
    dv.setUint16(26, width, true);
    dv.setUint16(28, height, true);
  } else if (kind === "VP8L") {
    b[20] = 0x2f;
    dv.setUint32(21, ((width - 1) | ((height - 1) << 14)) >>> 0, true);
  } else {
    b.set([(width - 1) & 255, ((width - 1) >> 8) & 255, (width - 1) >> 16, (height - 1) & 255, ((height - 1) >> 8) & 255, (height - 1) >> 16], 24);
  }
  return b;
}

describe("sniffImageHeader (esqueleto T2)", () => {
  it("lee JPEG baseline y progresivo, y rechaza otros SOF", () => {
    assert.deepEqual(sniffImageHeader(jpegHeader(2048, 1536)), { format: "jpeg", width: 2048, height: 1536 });
    assert.deepEqual(sniffImageHeader(jpegHeader(640, 480, 0xc2)), { format: "jpeg", width: 640, height: 480 });
    assert.equal(sniffImageHeader(jpegHeader(640, 480, 0xc3)), null);
    assert.equal(sniffImageHeader(jpegHeader(640, 0)), null);
  });

  it("lee PNG (IHDR) y WebP (VP8, VP8L, VP8X)", () => {
    assert.deepEqual(sniffImageHeader(pngHeader(1024, 768)), { format: "png", width: 1024, height: 768 });
    assert.deepEqual(sniffImageHeader(webpHeader("VP8 ", 300, 200)), { format: "webp", width: 300, height: 200 });
    assert.deepEqual(sniffImageHeader(webpHeader("VP8L", 300, 200)), { format: "webp", width: 300, height: 200 });
    assert.deepEqual(sniffImageHeader(webpHeader("VP8X", 4000, 3000)), { format: "webp", width: 4000, height: 3000 });
  });

  it("devuelve null con encabezados truncados o desconocidos", () => {
    for (const h of [jpegHeader(10, 10), pngHeader(10, 10), webpHeader("VP8 ", 10, 10), webpHeader("VP8X", 10, 10)]) {
      for (let cut = 0; cut < h.length; cut++) assert.equal(sniffImageHeader(h.subarray(0, cut)), null, `corte en ${cut}`);
    }
    assert.equal(sniffImageHeader(new TextEncoder().encode("GIF89a........................")), null);
  });
});

describe("resizeArea (esqueleto T2)", () => {
  it("ajusta el lado mayor y no agranda", () => {
    assert.deepEqual(fitWithin(2048, 2048, 1024), { width: 1024, height: 1024 });
    assert.deepEqual(fitWithin(1999, 1001, 1024), { width: 1024, height: 513 });
    assert.deepEqual(fitWithin(640, 480, 1024), { width: 640, height: 480 });
  });

  it("conserva un color uniforme y promedia exacto en 2:1", () => {
    const r: Raster = { width: 4, height: 2, data: new Uint8ClampedArray([10, 20, 30, 255, 12, 22, 32, 255, 0, 0, 0, 255, 255, 255, 255, 255, 10, 20, 30, 255, 12, 22, 32, 255, 0, 0, 0, 255, 255, 255, 255, 255]) };
    const out = resizeArea(r, 2);
    assert.deepEqual([...out.data], [11, 21, 31, 255, 128, 128, 128, 255]);
  });

  it("pondera el color por el alfa", () => {
    const r: Raster = { width: 2, height: 1, data: new Uint8ClampedArray([200, 0, 0, 255, 0, 0, 255, 0]) };
    assert.deepEqual([...resizeArea(r, 1).data], [200, 0, 0, 128]);
  });

  it("prueba cruzada: los bytes de Node coinciden con los fijados (los mismos que debe dar Deno)", () => {
    for (const c of CROSS_CASES) {
      const out = resizeArea(crossRaster(c), c.maxSide);
      const hash = createHash("sha256").update(out.data).digest("hex");
      assert.equal(`${out.width}x${out.height}:${hash}`, expected[c.name], c.name);
    }
  });
});
