import type { Page } from "@playwright/test";
import type { PerfSummary } from "../src/lib/studio/perf.ts";
import { cellPoint, chartGeom, expect, nextFrames, openStudio, test } from "./support/estudio.ts";

/*
 * Latencia `edit-to-paint` del estudio real (CA-P1, CA-P3, CA-P7; T10, ADR 0004 "Cómo se mide").
 * Usa el recolector de `/dev/estudio?perf=1` (`window.__loopitaPerf`, `src/lib/studio/perf.ts`): desde el evento de
 * entrada hasta el frame pintado del editor y de la vista previa.
 *
 * Umbral: `E2E_LATENCY_BUDGET_MS` (100 ms por defecto, el de CA-P1 y CA-P3). Los runners de GitHub (sin GPU, 4 vCPU
 * compartidas) son más lentos que el equipo de referencia: la CI usa un umbral mayor, documentado en `e2e/README.md`.
 * CA-P7 (ninguna validación dentro de una ventana de edición) no depende de la máquina y se exige siempre.
 * Los números quedan en la salida y como adjunto `latencia-<escenario>.json` del reporte.
 * Corre en Chromium completo (`channel: "chromium"` en playwright.config.ts): el `headless-shell` dibuja el canvas
 * mucho más lento y no representa lo que ve una usuaria.
 */
const BUDGET_MS = Number(process.env.E2E_LATENCY_BUDGET_MS ?? 100);
/** CPU limitada por CDP (`Emulation.setCPUThrottlingRate`). `E2E_CPU_RATE=4` reproduce las condiciones del ADR 0004. */
const CPU_RATE = Number(process.env.E2E_CPU_RATE ?? 1);

const SCENARIOS = [
  { name: "plano", query: "forma=plano&reps=10&perf=1", fields: ["A lo ancho", "A lo alto"] },
  { name: "tubo", query: "forma=tubo&reps=10&perf=1", fields: ["A lo ancho", "A lo alto"] },
  { name: "circulo-rombos", query: "forma=circulo&motivo=rombos&reps=10&perf=1", fields: ["A lo ancho", "A lo alto"] },
  { name: "circulo-copa", query: "forma=circulo&perf=1", fields: ["A lo ancho"] },
] as const;

// Pseudoaleatorio con semilla (mismas casillas y pausas en cada corrida).
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

const summary = (page: Page) => page.evaluate(() => (window as unknown as { __loopitaPerf: { summary(): PerfSummary } }).__loopitaPerf.summary());
const reset = (page: Page) => page.evaluate(() => (window as unknown as { __loopitaPerf: { reset(): void } }).__loopitaPerf.reset());

const round = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? null : Math.round(n * 10) / 10);

// Sin `mode: "serial"`: si un escenario falla, los demás igual se miden. El proyecto `latencia` no es `fullyParallel`,
// así que los escenarios corren uno tras otro en un solo trabajador.

for (const s of SCENARIOS) {
  test(`latencia ${s.name}: pintar y cambiar repeticiones bajo ${BUDGET_MS} ms (p95) sin validar dentro de la edición`, async ({ page }, info) => {
    test.setTimeout(CPU_RATE > 1 ? 400_000 : 180_000);
    if (CPU_RATE > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
    }
    await openStudio(page, s.query);
    await page.waitForFunction(() => "__loopitaPerf" in window);
    const rnd = rng(20261106);

    // ---------------------------------------------------------------- CA-P1: pintar (clics y teclado)
    const g = await chartGeom(page);
    await page.waitForTimeout(300);
    await reset(page);
    for (let k = 0; k < 40; k++) {
      await page.keyboard.press(String((k % 4) + 1)); // elegir lana no es una edición
      const p = cellPoint(g, [Math.floor(rnd() * g.cols), Math.floor(rnd() * g.rows)]);
      await page.mouse.click(p.x, p.y);
      // Pausas variadas: algunas dejan correr la validación diferida entre ediciones.
      await page.waitForTimeout(80 + Math.floor(rnd() * 500));
    }
    for (let k = 0; k < 10; k++) {
      await page.keyboard.press(String(((k + 1) % 4) + 1));
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(120 + Math.floor(rnd() * 300));
    }
    await nextFrames(page, 3);
    const paint = await summary(page);

    // ---------------------------------------------------------------- CA-P3: repeticiones de 5 × 5 a 10 × 10
    await reset(page);
    for (let k = 0; k < 20; k++) {
      for (const label of s.fields) await page.getByLabel(label, { exact: true }).fill(k % 2 === 0 ? "5" : "10");
      await page.waitForTimeout(250 + Math.floor(rnd() * 400));
    }
    await nextFrames(page, 3);
    const repeats = await summary(page);

    const result = {
      escenario: s.name,
      umbralMs: BUDGET_MS,
      cpu: CPU_RATE,
      pintar: { n: paint.edits.paint?.n, p50: round(paint.edits.paint?.p50), p95: round(paint.edits.paint?.p95), max: round(paint.edits.paint?.max), editorP95: round(paint.edits.paint?.editorP95), vistaP95: round(paint.edits.paint?.previewP95) },
      repeticiones: { n: repeats.edits.repeats?.n, p50: round(repeats.edits.repeats?.p50), p95: round(repeats.edits.repeats?.p95), max: round(repeats.edits.repeats?.max), vistaP95: round(repeats.edits.repeats?.previewP95) },
      validaciones: { pintar: paint.validations, repeticiones: repeats.validations },
      descartadas: { pintar: paint.dropped, repeticiones: repeats.dropped },
    };
    console.log(`[latencia] ${JSON.stringify(result)}`);
    await info.attach(`latencia-${s.name}.json`, { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    info.annotations.push({ type: "latencia", description: `${s.name}: pintar p95 ${result.pintar.p95} ms (n ${result.pintar.n}), repeticiones p95 ${result.repeticiones.p95} ms (n ${result.repeticiones.n}), umbral ${BUDGET_MS} ms, CPU ×${CPU_RATE}` });

    // Ninguna edición quedó sin pintarse. Pintar una casilla con la lana que ya tiene no es una edición (no se mide):
    // de las 50 entradas, con la semilla fija, cambian entre 30 y 40 según el motivo.
    expect(paint.edits.paint?.n ?? 0, "ediciones de pintar medidas").toBeGreaterThanOrEqual(25);
    expect(repeats.edits.repeats?.n ?? 0, "cambios de repeticiones medidos").toBeGreaterThanOrEqual(20 * s.fields.length - 2);
    expect(paint.dropped + repeats.dropped, "ediciones que no llegaron a pintarse").toBe(0);

    expect.soft(paint.edits.paint?.p95 ?? Infinity, `CA-P1 ${s.name}: p95 de pintar`).toBeLessThan(BUDGET_MS);
    expect.soft(repeats.edits.repeats?.p95 ?? Infinity, `CA-P3 ${s.name}: p95 de repeticiones`).toBeLessThan(BUDGET_MS);
    expect.soft(paint.validations.insideEditWindow, `CA-P7 ${s.name}: validaciones dentro de una edición (pintar)`).toBe(0);
    expect.soft(repeats.validations.insideEditWindow, `CA-P7 ${s.name}: validaciones dentro de una edición (repeticiones)`).toBe(0);
  });
}
