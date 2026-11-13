/*
 * Medición del prototipo del visor 3D (T3b de la fase 4; ADR 0010, secciones 6, 6b y 6c). NO es una prueba: no
 * termina en `.spec.ts`, así que Playwright no la recoge y no corre en la CI. Se corre a mano:
 *
 *   # 1. Servidor de producción con las páginas internas (en otra terminal), con su propia carpeta de build:
 *   LOOPITA_NEXT_DIST_DIR=.next-t3b pnpm exec next build
 *   LOOPITA_NEXT_DIST_DIR=.next-t3b LOOPITA_DEV_PAGES=1 pnpm exec next start -p 3150
 *   # 2. Medición (Node 24 ejecuta TypeScript directamente):
 *   node e2e/medir-visor.ts [baseUrl=http://127.0.0.1:3150] [salida.json]
 *
 * Variables: `CPU_RATE` (4 por defecto, `Emulation.setCPUThrottlingRate`), `HEADED=1` (ventana visible: usa la GPU
 * real del equipo; sin interfaz, Chromium puede caer en SwiftShader), `DPR` (razón de píxeles, 1 por defecto),
 * `SCENES` (lista de puntos, por defecto 5000,10000,20000,40000,60000), `N` (repeticiones por métrica, 40),
 * `GL=swiftshader` (WebGL por software, como la CI) y `UNCAPPED=1` (sin tope de vsync, para ver la holgura de fps).
 */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { FrameStats, VisorApi, VisorInfo } from "../src/app/dev/visor/engine.ts";

const base = process.argv[2] ?? "http://127.0.0.1:3150";
const outFile = process.argv[3];
const CPU_RATE = Number(process.env.CPU_RATE ?? 4);
const HEADED = process.env.HEADED === "1";
const DPR = Number(process.env.DPR ?? 1);
const N = Number(process.env.N ?? 40);
const GL = process.env.GL ?? "";
const UNCAPPED = process.env.UNCAPPED === "1";
const SCENES = (process.env.SCENES ?? "5000,10000,20000,40000,60000").split(",").map(Number);

type W = Window & { __loopitaVisor: VisorApi };

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (f: number) => s[Math.min(s.length - 1, Math.floor(f * s.length))] ?? NaN;
  const r = (n: number) => Math.round(n * 100) / 100;
  return { n: s.length, p50: r(q(0.5)), p95: r(q(0.95)), max: r(s.at(-1) ?? NaN) };
};

async function repeat<T>(page: Page, n: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    out.push(await fn(i));
    await page.waitForTimeout(30);
  }
  return out;
}

const info = (page: Page) => page.evaluate(() => (window as unknown as W).__loopitaVisor.info()) as Promise<VisorInfo>;
const renderCost = (page: Page, k: number) => page.evaluate((n) => (window as unknown as W).__loopitaVisor.renderCost(n), k);
const orbit = (page: Page, ms: number) => page.evaluate((m) => (window as unknown as W).__loopitaVisor.orbit(m), ms) as Promise<FrameStats>;

const browser = await chromium.launch({ channel: "chromium", headless: !HEADED, args: [
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    ...(GL === "swiftshader" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : []),
    ...(UNCAPPED ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : []),
  ],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR });
const page = await context.newPage();

// Bytes de JS: al cargar la página (antes del import dinámico) y los que trae el import dinámico.
const js: { url: string; bytes: number; phase: "inicial" | "dinamico" }[] = [];
let phase: "inicial" | "dinamico" = "inicial";
page.on("response", async (res) => {
  if (!res.url().endsWith(".js")) return;
  const p = phase;
  const body = await res.body().catch(() => null);
  js.push({ url: res.url().replace(base, ""), bytes: Number(res.headers()["content-length"] ?? body?.length ?? 0), phase: p });
});

const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });

const tNav = Date.now();
await page.goto(`${base}/dev/visor`, { waitUntil: "domcontentloaded" });
phase = "dinamico";
await page.waitForFunction(() => !!(window as unknown as W).__loopitaVisor, null, { timeout: 120_000 });
const mountMs = Date.now() - tNav;
await page.waitForTimeout(1000);

const report: Record<string, unknown> = { cpuRate: CPU_RATE, headed: HEADED, dpr: DPR, n: N, gl: GL || "default", uncapped: UNCAPPED, mountMs };
const atMount = await info(page);
report.atMount = atMount;
console.log("WebGL:", atMount.renderer, "| WebGL2:", atMount.webgl2, "| programas al montar:", atMount.programs, atMount.programNames);

// ---------------------------------------------------------------- Pieza de referencia (1.920 puntos, ~8.200 vértices)
await page.evaluate(() => (window as unknown as W).__loopitaVisor.setScene(2448));
const sync = await repeat(page, N, () => page.evaluate(() => (window as unknown as W).__loopitaVisor.editRound()));
const e2p = await repeat(page, N, () => page.evaluate(() => (window as unknown as W).__loopitaVisor.editToPaint()));
const recolor = await repeat(page, N, () => page.evaluate(() => (window as unknown as W).__loopitaVisor.recolorToPaint()));
const programsBeforeLooks = (await info(page)).programs;
const looks = await repeat(page, N, (i) => page.evaluate((k) => (window as unknown as W).__loopitaVisor.setLooksToPaint(k % 2 === 0, k % 7), i));
const hover = await repeat(page, N, (i) => page.evaluate((k) => (window as unknown as W).__loopitaVisor.hoverToPaint(k % 3, k % 2 ? "#d04040" : "#4060d0"), i));
await page.evaluate(() => (window as unknown as W).__loopitaVisor.setLod("smooth"));
await page.evaluate(() => (window as unknown as W).__loopitaVisor.setLod("relief"));
const programsAfterLooks = (await info(page)).programs;
const piece = await info(page);
report.piece = {
  stitches: piece.stitches,
  vertices: piece.vertices,
  editRound_fill: stats(sync.map((r) => r.fillMs)),
  editRound_uploadDraw_sync: stats(sync.map((r) => r.uploadDrawMs)),
  editToPaint: stats(e2p.map((r) => r.paintMs)),
  recolorToPaint: stats(recolor.map((r) => r.paintMs)),
  setLooks_js: stats(looks.map((r) => r.setLooksMs)),
  setLooksToPaint: stats(looks.map((r) => r.paintMs)),
  setLooks_attributesMarked: looks.reduce((s, r) => s + r.attributesMarked, 0),
  hoverToPaint: stats(hover.map((r) => r.paintMs)),
  programsBeforeLooks,
  programsAfterLooksAndLod: programsAfterLooks,
  capacityGrowths: piece.capacityGrowths,
};

// A/B del aspecto por fibra y nivel de detalle: fps al girar.
const fpsPiece: Record<string, FrameStats & { syncFrame?: { p50: number; p95: number } }> = {};
for (const lod of ["relief", "smooth"] as const) {
  for (const fiber of [true, false]) {
    await page.evaluate(([l, f]) => {
      const a = (window as unknown as W).__loopitaVisor;
      a.setLod(l);
      return a.setLooksToPaint(f);
    }, [lod, fiber] as const);
    fpsPiece[`${lod}-${fiber ? "fibra" : "plano"}`] = { ...(await orbit(page, 3000)), syncFrame: await renderCost(page, 60) };
  }
}
report.fpsPiece = fpsPiece;
console.log("pieza:", JSON.stringify(report.piece));
console.log("fps pieza:", JSON.stringify(fpsPiece));

// ---------------------------------------------------------------- Escenas grandes (SCENE_HARD_STITCH_CAP, LOD_STITCH_BUDGET)
const scenes: unknown[] = [];
for (const target of SCENES) {
  await page.evaluate(() => (window as unknown as W).__loopitaVisor.setLooksToPaint(true));
  await page.evaluate(() => (window as unknown as W).__loopitaVisor.setLod("relief"));
  const built = await page.evaluate((n) => (window as unknown as W).__loopitaVisor.setScene(n), target);
  await page.waitForTimeout(300);
  const relief = await orbit(page, 2500);
  const reliefSync = await renderCost(page, 30);
  const editRelief = await repeat(page, Math.min(N, 15), () => page.evaluate(() => (window as unknown as W).__loopitaVisor.editToPaint(0)));
  const looksRelief = await repeat(page, Math.min(N, 15), (i) => page.evaluate((k) => (window as unknown as W).__loopitaVisor.setLooksToPaint(true, (k % 7) + 1), i));
  await page.evaluate(() => (window as unknown as W).__loopitaVisor.setLod("smooth"));
  const smooth = await orbit(page, 2500);
  const smoothSync = await renderCost(page, 30);
  const smoothFlat = await (async () => {
    await page.evaluate(() => (window as unknown as W).__loopitaVisor.setLooksToPaint(false));
    return orbit(page, 2500);
  })();
  const editSmooth = await repeat(page, Math.min(N, 15), () => page.evaluate(() => (window as unknown as W).__loopitaVisor.editToPaint(0)));
  const i = await info(page);
  const row = {
    target,
    ...built,
    buildMs: Math.round(built.buildMs * 10) / 10,
    uploadDrawMs: Math.round(built.uploadDrawMs * 10) / 10,
    fpsRelief: relief,
    fpsSmooth: smooth,
    fpsSmoothPlano: smoothFlat,
    syncFrameRelief: reliefSync,
    syncFrameSmooth: smoothSync,
    editToPaintRelief: stats(editRelief.map((r) => r.paintMs)),
    editToPaintSmooth: stats(editSmooth.map((r) => r.paintMs)),
    setLooksToPaintRelief: stats(looksRelief.map((r) => r.paintMs)),
    calls: i.calls,
    triangles: i.triangles,
    programs: i.programs,
    heapMB: i.heapMB,
  };
  scenes.push(row);
  console.log(`escena ${target}:`, JSON.stringify(row));
}
report.scenes = scenes;
report.final = await info(page);
report.js = {
  inicialKB: Math.round(js.filter((r) => r.phase === "inicial").reduce((s, r) => s + r.bytes, 0) / 102.4) / 10,
  dinamico: js.filter((r) => r.phase === "dinamico"),
};
console.log("JS:", JSON.stringify(report.js));
console.log("programas al final:", (report.final as VisorInfo).programs);
if (outFile) writeFileSync(outFile, JSON.stringify(report, null, 1));
await browser.close();
