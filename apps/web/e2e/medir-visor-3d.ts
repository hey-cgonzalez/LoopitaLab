/*
 * Medición del visor 3D real (T11 de la fase 4; ADR 0010, secciones 6, 6b y 6c; riesgo R4-19). NO es una prueba: no
 * termina en `.spec.ts`, así que Playwright no la recoge y no corre en la CI. Reemplaza a `medir-visor.ts` del
 * prototipo T3b. T12 la extiende con la instrumentación `edit-to-paint-3d`, `edit-to-feedback` y `hover-to-paint-3d`.
 *
 *   # 1. Servidor de producción con las páginas internas (en otra terminal):
 *   pnpm exec next build && LOOPITA_DEV_PAGES=1 pnpm exec next start -p 3150
 *   # 2. Medición (Node 24 ejecuta TypeScript directamente):
 *   node e2e/medir-visor-3d.ts [baseUrl=http://127.0.0.1:3150] [salida.json]
 *
 * Variables: `CPU_RATE` (4), `HEADED=1` (ventana visible: GPU real), `GL=swiftshader` (como la CI), `DPR` (1),
 * `N` (repeticiones, 30), `SCENES` (puntos de las escenas grandes, por defecto 20000,40000,60000).
 *
 * A/B del material (R4-19): `fiber` (material extendido, aspecto por fibra), `flat` (extendido con "Colores planos",
 * como `E2E_FLAT_COLORS=1`) y `base` (`MeshStandardMaterial` sin extender). Mide el costo de un frame síncrono
 * (render + `readPixels` de 1 px, que espera a la GPU) y los fps al girar.
 */
import { writeFileSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import type { Visor3dDevApi } from "../src/app/dev/visor-3d/VisorDemo.tsx";

const base = process.argv[2] ?? "http://127.0.0.1:3150";
const outFile = process.argv[3];
const CPU_RATE = Number(process.env.CPU_RATE ?? 4);
const HEADED = process.env.HEADED === "1";
const DPR = Number(process.env.DPR ?? 1);
const N = Number(process.env.N ?? 30);
const GL = process.env.GL ?? "";
const SCENES = (process.env.SCENES ?? "20000,40000,60000").split(",").map(Number);

type W = Window & { __loopitaVisor3d: Visor3dDevApi };
const r2 = (n: number) => Math.round(n * 100) / 100;
const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (f: number) => s[Math.min(s.length - 1, Math.floor(f * s.length))] ?? NaN;
  return { n: s.length, p50: r2(q(0.5)), p95: r2(q(0.95)), max: r2(s.at(-1) ?? NaN) };
};
const api = <T>(page: Page, src: string, arg?: unknown) =>
  page.evaluate(({ s, a }) => (0, eval)(`(${s})`)((window as unknown as W).__loopitaVisor3d, a), { s: src, a: arg }) as Promise<T>;
async function repeat<T>(page: Page, n: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    out.push(await fn(i));
    await page.waitForTimeout(20);
  }
  return out;
}

const browser = await chromium.launch({
  channel: "chromium",
  headless: !HEADED,
  args: ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", ...(GL === "swiftshader" ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [])],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
await page.goto(`${base}/dev/visor-3d`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => (window as unknown as W).__loopitaVisor3d?.ready === true, null, { timeout: 120_000 });
await page.waitForTimeout(500);
const renderer = await page.evaluate(() => {
  const c = document.createElement("canvas").getContext("webgl2");
  const d = c?.getExtension("WEBGL_debug_renderer_info");
  return d && c ? String(c.getParameter(d.UNMASKED_RENDERER_WEBGL)) : "";
});
const report: Record<string, unknown> = { cpuRate: CPU_RATE, headed: HEADED, dpr: DPR, gl: GL || "default", renderer, n: N };
console.log("WebGL:", renderer);

// ---------------------------------------------------------------- Fixture A (1.800 puntos): camino de la edición
await api(page, "(a) => a.select('fixture-a')");
await api(page, "(a) => a.flatToPaint(false)");
const edit = await repeat(page, N, () => api<{ ms: number }>(page, "(a) => a.editToPaint()"));
const recolor = await repeat(page, N, () => api<{ ms: number }>(page, "(a) => a.recolorToPaint()"));
const fibers = ["acrilico", "lana-mohair", "seda", "algodon"];
const looks = await repeat(page, N, (i) => api<{ ms: number }>(page, "(a, f) => a.looksToPaint(f)", fibers[i % fibers.length]));
const hover = await repeat(page, N, (i) => api<{ ms: number }>(page, "(a, h) => a.hoverToPaint(h)", i % 2 ? "#25A8A6" : "#EB6E5E"));
await api(page, "(a) => a.hoverToPaint(null)");
report.fixtureA = {
  editToPaint: stats(edit.map((r) => r.ms)),
  recolorToPaint: stats(recolor.map((r) => r.ms)),
  looksToPaint: stats(looks.map((r) => r.ms)),
  hoverToPaint: stats(hover.map((r) => r.ms)),
  stats: await api(page, "(a) => a.stats()"),
};
console.log("fixture A:", JSON.stringify(report.fixtureA, (k, v) => (k === "stats" ? undefined : v)));

// ---------------------------------------------------------------- A/B del material (R4-19)
async function ab(label: string) {
  const out: Record<string, unknown> = {};
  for (const lod of ["relief", "smooth"] as const) {
    await api(page, "(a, l) => a.setLod(l)", lod);
    for (const variant of ["fiber", "flat", "base"] as const) {
      await api(page, "(a, f) => a.flatToPaint(f)", variant === "flat");
      await api(page, "(a, v) => a.setVariant(v)", variant === "base" ? "base" : "fiber");
      await page.waitForTimeout(100);
      const frame = await api<{ p50: number; p95: number }>(page, "(a, k) => a.renderCost(k)", 60);
      const orbit = await api<{ fps: number; p95: number }>(page, "(a, ms) => a.orbit(ms)", 2000);
      out[`${lod}-${variant}`] = { frame: { p50: r2(frame.p50), p95: r2(frame.p95) }, fps: r2(orbit.fps), frameP95: r2(orbit.p95) };
    }
  }
  await api(page, "(a) => a.setVariant('fiber')");
  await api(page, "(a) => a.flatToPaint(false)");
  await api(page, "(a) => a.setLod('relief')");
  console.log(`A/B ${label}:`, JSON.stringify(out));
  return out;
}
const abResults: Record<string, unknown> = { fixtureA: await ab("fixture A") };
for (const n of SCENES) {
  const built = await api<{ ms: number; stitches: number }>(page, "(a, n) => a.sceneOfStitches(n)", n);
  await page.waitForTimeout(300);
  const st = await api<{ visor: { lod: string; mode: string } }>(page, "(a) => a.stats()");
  abResults[`scene${n}`] = { buildToPaintMs: r2(built.ms), stitches: built.stitches, lod: st.visor.lod, mode: st.visor.mode, ...(await ab(`${n} puntos`)) };
}
report.ab = abResults;
report.final = await api(page, "(a) => a.stats()");
if (outFile) writeFileSync(outFile, JSON.stringify(report, null, 1));
await browser.close();
