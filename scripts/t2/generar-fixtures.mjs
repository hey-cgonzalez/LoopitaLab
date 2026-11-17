// Genera los fixtures de la puerta T2 (fase 5). Se corre una vez; los archivos quedan en el repo.
//
//   node scripts/t2/generar-fixtures.mjs
//
// Usa `sharp` de apps/web solo porque ya está instalado (T11 lo retira; después de eso este
// script deja de funcionar, pero los fixtures generados siguen sirviendo). Es .mjs para que
// el typecheck de la raíz no tenga que resolver `sharp`.
//
// Salidas:
//   scripts/t2/fixtures/foto-2048.jpg   JPEG de 2048 × 2048, calidad 90, 4:2:0, sin EXIF,
//                                       sintético con aspecto de foto (degradados, figuras, ruido)
//   supabase/functions/t2-medicion/muestras.ts
//                                       imágenes de 48 × 32 en JPEG, PNG con alfa, WebP con
//                                       pérdida (VP8) y WebP sin pérdida (VP8L), en base64, para
//                                       comprobar los tres decodificadores en Deno
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const sharp = require("sharp");

const root = new URL("../../", import.meta.url);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function photoLike(w, h, seed) {
  const rnd = mulberry32(seed);
  const buf = Buffer.alloc(w * h * 3);
  const blobs = Array.from({ length: 40 }, () => ({
    x: rnd() * w, y: rnd() * h, r: (0.03 + rnd() * 0.18) * w,
    c: [rnd() * 255, rnd() * 255, rnd() * 255],
  }));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // cielo/fondo en degradado
      let r = 90 + (110 * y) / h, g = 120 + (60 * x) / w, b = 170 - (80 * y) / h;
      for (const bl of blobs) {
        const d = Math.hypot(x - bl.x, y - bl.y) / bl.r;
        if (d < 1) {
          const k = Math.min(1, (1 - d) * 3); // borde suave
          const shade = 0.75 + 0.25 * Math.cos(d * 3);
          r = r * (1 - k) + bl.c[0] * shade * k;
          g = g * (1 - k) + bl.c[1] * shade * k;
          b = b * (1 - k) + bl.c[2] * shade * k;
        }
      }
      // textura fina (tela, lana) y ruido de sensor
      const tex = 10 * Math.sin(x * 0.9) * Math.sin(y * 0.7);
      const n = (rnd() - 0.5) * 24;
      const p = (y * w + x) * 3;
      buf[p] = Math.max(0, Math.min(255, r + tex + n));
      buf[p + 1] = Math.max(0, Math.min(255, g + tex + n));
      buf[p + 2] = Math.max(0, Math.min(255, b + tex + n));
    }
  }
  return buf;
}

mkdirSync(new URL("scripts/t2/fixtures/", root), { recursive: true });
const big = photoLike(2048, 2048, 2026);
const jpeg = await sharp(big, { raw: { width: 2048, height: 2048, channels: 3 } })
  .jpeg({ quality: 90, chromaSubsampling: "4:2:0", mozjpeg: false })
  .toBuffer();
writeFileSync(new URL("scripts/t2/fixtures/foto-2048.jpg", root), jpeg);
console.log(`foto-2048.jpg: ${jpeg.length} bytes`);

const sw = 48, sh = 32;
const small = photoLike(sw, sh, 7);
const rgba = Buffer.alloc(sw * sh * 4);
for (let i = 0; i < sw * sh; i++) {
  rgba[i * 4] = small[i * 3];
  rgba[i * 4 + 1] = small[i * 3 + 1];
  rgba[i * 4 + 2] = small[i * 3 + 2];
  rgba[i * 4 + 3] = i % sw < 8 ? 0 : 255; // franja transparente a la izquierda
}
const raw3 = { raw: { width: sw, height: sh, channels: 3 } };
const raw4 = { raw: { width: sw, height: sh, channels: 4 } };
const samples = {
  jpeg: await sharp(small, raw3).jpeg({ quality: 90 }).toBuffer(),
  png: await sharp(rgba, raw4).png().toBuffer(),
  webpLossy: await sharp(small, raw3).webp({ quality: 80 }).toBuffer(),
  webpLossless: await sharp(rgba, raw4).webp({ lossless: true }).toBuffer(),
};
const lines = [
  "// Generado por scripts/t2/generar-fixtures.mjs: no editar a mano.",
  `// Imágenes de ${sw} × ${sh} para comprobar los decodificadores de jSquash en Deno (puerta T2).`,
  `export const SAMPLE_SIZE = { width: ${sw}, height: ${sh} } as const;`,
  "export const SAMPLES_BASE64 = {",
  ...Object.entries(samples).map(([k, v]) => `  ${k}: "${v.toString("base64")}",`),
  "} as const;",
  "",
];
writeFileSync(new URL("supabase/functions/t2-medicion/muestras.ts", root), lines.join("\n"));
for (const [k, v] of Object.entries(samples)) console.log(`${k}: ${v.length} bytes`);
