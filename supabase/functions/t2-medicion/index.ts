/**
 * Función de medición de la puerta T2 (fase 5). DESECHABLE: no es código de producción, no
 * toca la base ni Storage y no guarda nada. Solo cronometra lo que hará `subir-imagen` y una
 * etapa de `ia-trabajo` (ADR 0012, sección 7; ADR 0013, secciones 2 y 8).
 *
 * Casos (`?caso=`):
 *   importar  GET   evalúa pattern-core, yarn-catalog, ai-router e image-chart y usa una función de cada uno
 *   codecs    GET   decodifica JPEG, PNG, WebP con pérdida y WebP sin pérdida con jSquash (muestras.ts)
 *   subida    POST  cuerpo image/jpeg: leer cuerpo → sniffImageHeader → decodificar → resizeArea(1024) → PNG
 *                   (`&salida=png` devuelve el PNG en vez del JSON)
 *   etapa     POST  cuerpo image/png (raster ≤ 1024): decodificar → reducir a 200 → cuantizar (sustituto de
 *                   rasterToChart, que es de T7) → validatePattern
 *   validar   GET   validatePattern de un gráfico de 200 × 200 (`&variante=bloques|ruido`)
 *   cruzada   GET   resizeArea de los casos de la prueba cruzada, con su SHA-256
 *   cuerpo    POST  solo lee el cuerpo y devuelve su largo (riesgo R5-8)
 *
 * Tiempos: `performance.now()` (reloj de pared). El runtime no expone CPU por invocación
 * (`process.cpuUsage()` no está implementado en supabase-edge-runtime 1.77.8), así que `cpuMs` va
 * en null. Las secciones medidas son síncronas (JS y WebAssembly sin E/S), por lo que su tiempo
 * de pared es una cota superior del CPU propio, salvo contención del equipo.
 *
 * Acceso: `verify_jwt = true` en la plataforma. Si existe el secreto T2_TOKEN, además se exige
 * la cabecera `x-t2-token` con ese valor (para que la clave publicable sola no baste).
 */
import { marks } from "./marks/boot.ts";
import { LIMITS, SCHEMA_VERSION, validatePattern, type ChartPattern, type Yarn } from "@loopitalab/pattern-core";
import "./marks/pattern-core.ts";
import { FIBER_IDS, PALETTE, nearestPaletteColor, suggestedGauge } from "@loopitalab/yarn-catalog";
import "./marks/yarn-catalog.ts";
import { MODEL_LADDER, estimateCostUSD } from "@loopitalab/ai-router";
import "./marks/ai-router.ts";
import { fitWithin, resizeArea, sniffImageHeader, type Raster } from "@loopitalab/image-chart";
import { CROSS_CASES, crossRaster } from "@loopitalab/image-chart/cross-cases";
import "./marks/image-chart.ts";
import { decodeJpeg, decodePng, decodeWebp, encodePng, initCodecs } from "./codec.ts";
import "./marks/jsquash.ts";
import { SAMPLES_BASE64, SAMPLE_SIZE } from "./muestras.ts";

const INSTANCE = crypto.randomUUID().slice(0, 8);
const RUNTIME = Deno.version.deno;
let served = 0;

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024; // ADR 0013, sección 2, paso 5
const MAX_PROBE_BYTES = 12 * 1024 * 1024; // caso `cuerpo`: para ver dónde corta la plataforma

function bootMarks(): Record<string, number> {
  const out: Record<string, number> = { boot: round(marks[0]?.[1] ?? 0) };
  for (let i = 1; i < marks.length; i++) {
    const [name, t] = marks[i] ?? ["?", 0];
    out[name] = round(t - (marks[i - 1]?.[1] ?? 0));
  }
  return out;
}

function round(ms: number): number {
  return Math.round(ms * 1000) / 1000;
}

class Timer {
  readonly ms: Record<string, number> = {};
  #t = performance.now();
  #start = this.#t;
  lap(name: string): void {
    const now = performance.now();
    this.ms[name] = round(now - this.#t);
    this.#t = now;
  }
  total(): number {
    return round(performance.now() - this.#start);
  }
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });
}

function b64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256(data: Uint8Array | Uint8ClampedArray): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readBody(req: Request, max: number): Promise<Uint8Array | "too_large"> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max) return "too_large";
  const buf = new Uint8Array(await req.arrayBuffer());
  return buf.byteLength > max ? "too_large" : buf;
}

// ------------------------------------------------------------------- gráfico de 200 × 200

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

function yarnsFor(paletteIdx: number[]): Yarn[] {
  return paletteIdx.map((pi, i) => {
    const c = PALETTE[pi % PALETTE.length]!;
    return { id: String.fromCharCode(65 + i), weight: 3, composition: [{ fiber: "lana", percent: 100 }], color: { hex: c.hex, paletteId: c.id } };
  });
}

function chartDoc(width: number, height: number, cells: number[], yarns: Yarn[]): ChartPattern {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "t2-medicion",
    title: "Medición T2",
    technique: "knit",
    kind: "chart",
    yarns,
    gauge: { stitchesPer10cm: 22, rowsPer10cm: 30 },
    origin: { kind: "manual" },
    chart: { width, height, cells, repeat: { x: 1, y: 1 }, workedIn: "rows", renderAs: "flat", direction: "bottom_up" },
  };
}

/** `bloques`: zonas de color como un gráfico salido de una foto. `ruido`: celdas al azar (peor caso de hebras). */
function chart200(variant: "bloques" | "ruido"): ChartPattern {
  const side = LIMITS.maxMotifSide; // 200
  const rnd = mulberry32(variant === "bloques" ? 11 : 12);
  const colors = 6;
  const cells = new Array<number>(side * side);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const n = rnd();
      cells[y * side + x] = variant === "ruido" ? n % colors : (((x >> 3) + (y >> 4) + (n % 17 === 0 ? 1 : 0)) % colors);
    }
  }
  return chartDoc(side, side, cells, yarnsFor([0, 7, 14, 21, 28, 35]));
}

// ------------------------------------------------------------------- casos

async function casoImportar(): Promise<Record<string, unknown>> {
  const t = new Timer();
  const sample = b64(SAMPLES_BASE64.png);
  const uses = {
    patternCore: { maxMotifSide: LIMITS.maxMotifSide, schemaVersion: SCHEMA_VERSION },
    yarnCatalog: { palette: PALETTE.length, fibers: FIBER_IDS.size, nearest: nearestPaletteColor("#B22222").color.id, gauge: suggestedGauge(4, "knit")?.stitchesPer10cm ?? null },
    aiRouter: { ladder: MODEL_LADDER.length, costHaiku: estimateCostUSD("claude-haiku-5-5", 1000, 500) },
    imageChart: { header: sniffImageHeader(sample), fit: fitWithin(2048, 1536, 1024) },
  };
  t.lap("usar");
  return { tiemposMs: t.ms, totalMs: t.total(), uses };
}

async function casoCodecs(): Promise<Record<string, unknown>> {
  const t = new Timer();
  const init = await initCodecs();
  t.lap("initCodecs");
  const results: Record<string, unknown> = {};
  const decoders = { jpeg: decodeJpeg, png: decodePng, webpLossy: decodeWebp, webpLossless: decodeWebp } as const;
  for (const [name, decode] of Object.entries(decoders)) {
    const bytes = b64(SAMPLES_BASE64[name as keyof typeof SAMPLES_BASE64]);
    const header = sniffImageHeader(bytes);
    const img = await decode(bytes);
    const ok = img.width === SAMPLE_SIZE.width && img.height === SAMPLE_SIZE.height && img.data.length === img.width * img.height * 4 && header?.width === img.width && header?.height === img.height;
    t.lap(name);
    results[name] = { ok, header, decoded: { width: img.width, height: img.height }, alphaFirst: img.data[3], alphaLast: img.data[img.data.length - 1] };
  }
  return { tiemposMs: t.ms, totalMs: t.total(), init, results };
}

async function casoSubida(req: Request, url: URL): Promise<Response | Record<string, unknown>> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const t = new Timer();
  const init = await initCodecs(); // carga del WebAssembly: espera de red y compilación, fuera de la cuenta de la subida
  t.lap("initCodecs");
  const body = await readBody(req, MAX_UPLOAD_BYTES);
  if (body === "too_large") return json(413, { error: "payload_too_large" });
  t.lap("leerCuerpo");
  const header = sniffImageHeader(body);
  t.lap("sniff");
  if (!header || header.format !== "jpeg") return json(415, { error: "unsupported_type" });
  if (Math.max(header.width, header.height) > 2048 || header.width * header.height > 4_194_304 || Math.min(header.width, header.height) < 64) {
    return json(413, { error: "dimensions_out_of_range" });
  }
  const decoded = await decodeJpeg(body);
  t.lap("decodificar");
  if (decoded.width !== header.width || decoded.height !== header.height) return json(415, { error: "unreadable_image" });
  const raster = resizeArea(decoded, 1024);
  t.lap("resizeArea");
  const png = await encodePng(raster);
  t.lap("codificarPng");
  const { initCodecs: _i, ...cpuish } = t.ms;
  const procesoMs = round(Object.values(cpuish).reduce((a, b) => a + b, 0));
  if (url.searchParams.get("salida") === "png") {
    return new Response(png, { status: 200, headers: { "content-type": "image/png", "x-t2-tiempos": JSON.stringify({ ...t.ms, procesoMs }) } });
  }
  return { tiemposMs: t.ms, procesoMs, totalMs: t.total(), init: served === 1 ? init : undefined, entrada: { bytes: body.byteLength, ...header }, salida: { width: raster.width, height: raster.height, pngBytes: png.byteLength } };
}

/** Sustituto mínimo de `rasterToChart` (T7): popularidad en 4 bits por canal, color más cercano en RGB y mapeo a la paleta. */
function quantizeStandIn(r: Raster, maxColors: number): { cells: number[]; paletteIdx: number[] } {
  const hist = new Map<number, number>();
  for (let i = 0; i < r.data.length; i += 4) {
    const key = ((r.data[i]! >> 4) << 8) | ((r.data[i + 1]! >> 4) << 4) | (r.data[i + 2]! >> 4);
    hist.set(key, (hist.get(key) ?? 0) + 1);
  }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, maxColors).map(([k]) => [((k >> 8) & 15) * 17, ((k >> 4) & 15) * 17, (k & 15) * 17] as const);
  const cells = new Array<number>(r.width * r.height);
  for (let p = 0, i = 0; i < r.data.length; i += 4, p++) {
    let best = 0, bestD = Infinity;
    for (let c = 0; c < top.length; c++) {
      const [cr, cg, cb] = top[c]!;
      const d = (r.data[i]! - cr) ** 2 + (r.data[i + 1]! - cg) ** 2 + (r.data[i + 2]! - cb) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    cells[p] = best;
  }
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  const paletteIdx = top.map(([cr, cg, cb]) => PALETTE.indexOf(nearestPaletteColor(`#${toHex(cr)}${toHex(cg)}${toHex(cb)}`).color));
  return { cells, paletteIdx };
}

async function casoEtapa(req: Request): Promise<Response | Record<string, unknown>> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const t = new Timer();
  await initCodecs();
  t.lap("initCodecs");
  const body = await readBody(req, MAX_UPLOAD_BYTES);
  if (body === "too_large") return json(413, { error: "payload_too_large" });
  t.lap("leerCuerpo");
  const header = sniffImageHeader(body);
  if (!header || header.format !== "png" || Math.max(header.width, header.height) > 1024) return json(415, { error: "unsupported_type" });
  const raster = await decodePng(body);
  t.lap("decodificarPng");
  // Remuestreo a 200 de ancho (rasterToChart además corrige por la proporción de la muestra).
  const small = resizeArea(raster, 200);
  t.lap("reducirA200");
  const q = quantizeStandIn(small, 6);
  t.lap("cuantizarSustituto");
  const doc = chartDoc(small.width, small.height, q.cells, yarnsFor(q.paletteIdx));
  const result = validatePattern(doc);
  t.lap("validatePattern");
  const { initCodecs: _i, leerCuerpo: _l, ...cpuish } = t.ms;
  return { tiemposMs: t.ms, procesoMs: round(Object.values(cpuish).reduce((a, b) => a + b, 0)), totalMs: t.total(), grafico: { width: small.width, height: small.height, colores: q.paletteIdx.length }, validacion: { valid: result.valid, savable: result.savable, issues: result.issues.length } };
}

function casoValidar(url: URL): Record<string, unknown> {
  const variant = url.searchParams.get("variante") === "ruido" ? "ruido" : "bloques";
  const t = new Timer();
  const doc = chart200(variant);
  t.lap("armarDocumento");
  const result = validatePattern(doc);
  t.lap("validatePattern");
  const codes = [...new Set(result.issues.map((i) => i.code))].slice(0, 8);
  return { tiemposMs: t.ms, totalMs: t.total(), variante: variant, celdas: doc.chart.width * doc.chart.height, validacion: { valid: result.valid, savable: result.savable, issues: result.issues.length, codes } };
}

async function casoCruzada(): Promise<Record<string, unknown>> {
  const t = new Timer();
  const hashes: Record<string, string> = {};
  for (const c of CROSS_CASES) {
    const out = resizeArea(crossRaster(c), c.maxSide);
    hashes[c.name] = `${out.width}x${out.height}:${await sha256(out.data)}`;
  }
  t.lap("todos");
  return { tiemposMs: t.ms, totalMs: t.total(), hashes };
}

async function casoCuerpo(req: Request): Promise<Response | Record<string, unknown>> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const t = new Timer();
  const body = await readBody(req, MAX_PROBE_BYTES);
  if (body === "too_large") return json(413, { error: "payload_too_large" });
  t.lap("leerCuerpo");
  return { tiemposMs: t.ms, totalMs: t.total(), bytes: body.byteLength, sha256: await sha256(body) };
}

// ------------------------------------------------------------------- servidor

Deno.serve(async (req) => {
  const token = Deno.env.get("T2_TOKEN");
  if (token && req.headers.get("x-t2-token") !== token) return json(401, { error: "unauthorized" });
  const url = new URL(req.url);
  const caso = url.searchParams.get("caso") ?? "importar";
  served++;
  const frio = served === 1;
  try {
    let out: Response | Record<string, unknown>;
    switch (caso) {
      case "importar": out = await casoImportar(); break;
      case "codecs": out = await casoCodecs(); break;
      case "subida": out = await casoSubida(req, url); break;
      case "etapa": out = await casoEtapa(req); break;
      case "validar": out = casoValidar(url); break;
      case "cruzada": out = await casoCruzada(); break;
      case "cuerpo": out = await casoCuerpo(req); break;
      default: return json(400, { error: "unknown_case" });
    }
    if (out instanceof Response) return out;
    // Memoria de la instancia al responder: montón de V8 y memoria externa (ArrayBuffer y WebAssembly).
    const mem = Deno.memoryUsage();
    const memoriaMB = { heapUsed: round(mem.heapUsed / 1048576), external: round(mem.external / 1048576) };
    return json(200, { caso, frio, instancia: INSTANCE, runtime: RUNTIME, invocacionesEnInstancia: served, cpuMs: null, memoriaMB, importacionMs: bootMarks(), ...out });
  } catch (e) {
    // Solo el tipo de error: sin bytes ni datos de la petición.
    console.error(`t2-medicion ${caso}: ${(e as Error).name}: ${(e as Error).message}`);
    return json(500, { error: "internal", caso, detalle: (e as Error).message.slice(0, 200) });
  }
});
