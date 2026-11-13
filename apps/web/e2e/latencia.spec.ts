import type { Page } from "@playwright/test";
import type { PerfSummary } from "../src/lib/studio/perf.ts";
import { cellPoint, chartGeom, expect, nextFrames, openStudio, test } from "./support/estudio.ts";

/*
 * Latencia `edit-to-paint` del estudio real (CA-P1, CA-P3, CA-P7; T10, ADR 0004 "Cómo se mide"), y desde la fase 3
 * (T8, ADR 0008 §3) `hover-to-paint` (CA3-P1: 50 colores al pasar el cursor) y `row-to-paint` (CA3-P3: 50 avances de
 * la fila resaltada), con el aspecto por fibra activado (CA3-P2: las mismas mediciones de la fase 2, sin regresión).
 * Hover y fila usan el banco de medición de la vista previa (`PreviewBench`, solo con `?perf=1`).
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
/**
 * `E2E_FLAT_COLORS=1` mide con "Colores planos" (sin aspecto por fibra), para comparar A/B cuánto cuesta el aspecto
 * por fibra (CA3-P2). Por defecto se mide con el aspecto por fibra activado, que es lo que exige el criterio.
 */
const FLAT_COLORS = process.env.E2E_FLAT_COLORS === "1";

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
  test(`latencia ${s.name}: pintar, repeticiones, hover y fila bajo ${BUDGET_MS} ms (p95) sin validar dentro de la edición`, async ({ page }, info) => {
    test.setTimeout(CPU_RATE > 1 ? 400_000 : 180_000);
    if (CPU_RATE > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
    }
    if (FLAT_COLORS) await page.addInitScript(() => localStorage.setItem("loopita:vista:colores-planos", "1"));
    await openStudio(page, s.query);
    await page.waitForFunction(() => "__loopitaPerf" in window);
    if (FLAT_COLORS) await expect(page.getByTestId("flat-colors")).toHaveAttribute("aria-pressed", "true");
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

    // ---------------------------------------------------------------- CA3-P1: pasar el cursor por 50 colores
    const bench = page.getByTestId("preview-bench");
    await bench.scrollIntoViewIfNeeded();
    const rowNext = page.getByTestId("bench-row-next");
    const swatches = await page.getByTestId("bench-swatch").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }),
    );
    expect(swatches.length, "muestras del banco").toBe(50);
    await page.mouse.move(swatches[0]!.x, swatches[0]!.y - 40);
    await page.waitForTimeout(300);
    await reset(page);
    for (const p of swatches) {
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(120 + Math.floor(rnd() * 300));
    }
    await nextFrames(page, 3);
    const hover = await summary(page);

    // ---------------------------------------------------------------- CA3-P3: 50 avances de la fila resaltada
    await rowNext.hover();
    await page.waitForTimeout(300);
    await reset(page);
    for (let k = 0; k < 50; k++) {
      await rowNext.click();
      await page.waitForTimeout(80 + Math.floor(rnd() * 250));
    }
    await nextFrames(page, 3);
    const rows = await summary(page);

    const result = {
      escenario: s.name,
      umbralMs: BUDGET_MS,
      cpu: CPU_RATE,
      coloresPlanos: FLAT_COLORS,
      pintar: { n: paint.edits.paint?.n, p50: round(paint.edits.paint?.p50), p95: round(paint.edits.paint?.p95), max: round(paint.edits.paint?.max), editorP95: round(paint.edits.paint?.editorP95), vistaP95: round(paint.edits.paint?.previewP95) },
      repeticiones: { n: repeats.edits.repeats?.n, p50: round(repeats.edits.repeats?.p50), p95: round(repeats.edits.repeats?.p95), max: round(repeats.edits.repeats?.max), vistaP95: round(repeats.edits.repeats?.previewP95) },
      hover: { n: hover.edits.hover?.n, p50: round(hover.edits.hover?.p50), p95: round(hover.edits.hover?.p95), max: round(hover.edits.hover?.max) },
      fila: { n: rows.edits.row?.n, p50: round(rows.edits.row?.p50), p95: round(rows.edits.row?.p95), max: round(rows.edits.row?.max) },
      validaciones: { pintar: paint.validations, repeticiones: repeats.validations, hover: hover.validations, fila: rows.validations },
      descartadas: { pintar: paint.dropped, repeticiones: repeats.dropped, hover: hover.dropped, fila: rows.dropped },
    };
    console.log(`[latencia] ${JSON.stringify(result)}`);
    await info.attach(`latencia-${s.name}.json`, { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    info.annotations.push({ type: "latencia", description: `${s.name}: pintar p95 ${result.pintar.p95} ms (n ${result.pintar.n}), repeticiones p95 ${result.repeticiones.p95} ms (n ${result.repeticiones.n}), hover p95 ${result.hover.p95} ms (n ${result.hover.n}), fila p95 ${result.fila.p95} ms (n ${result.fila.n}), umbral ${BUDGET_MS} ms, CPU ×${CPU_RATE}` });

    // Ninguna edición quedó sin pintarse. Pintar una casilla con la lana que ya tiene no es una edición (no se mide):
    // de las 50 entradas, con la semilla fija, cambian entre 30 y 40 según el motivo.
    expect(paint.edits.paint?.n ?? 0, "ediciones de pintar medidas").toBeGreaterThanOrEqual(25);
    expect(repeats.edits.repeats?.n ?? 0, "cambios de repeticiones medidos").toBeGreaterThanOrEqual(20 * s.fields.length - 2);
    // Cada muestra es otro color: las 50 se miden (salvo alguna entrada que el navegador agrupe).
    expect(hover.edits.hover?.n ?? 0, "vistas previas al pasar el cursor medidas").toBeGreaterThanOrEqual(45);
    expect(rows.edits.row?.n ?? 0, "avances de fila medidos").toBeGreaterThanOrEqual(48);
    expect(paint.dropped + repeats.dropped + hover.dropped + rows.dropped, "ediciones que no llegaron a pintarse").toBe(0);

    expect.soft(paint.edits.paint?.p95 ?? Infinity, `CA-P1 ${s.name}: p95 de pintar`).toBeLessThan(BUDGET_MS);
    expect.soft(repeats.edits.repeats?.p95 ?? Infinity, `CA-P3 ${s.name}: p95 de repeticiones`).toBeLessThan(BUDGET_MS);
    expect.soft(paint.validations.insideEditWindow, `CA-P7 ${s.name}: validaciones dentro de una edición (pintar)`).toBe(0);
    expect.soft(repeats.validations.insideEditWindow, `CA-P7 ${s.name}: validaciones dentro de una edición (repeticiones)`).toBe(0);
    expect.soft(hover.edits.hover?.p95 ?? Infinity, `CA3-P1 ${s.name}: p95 de hover-to-paint`).toBeLessThan(BUDGET_MS);
    expect.soft(rows.edits.row?.p95 ?? Infinity, `CA3-P3 ${s.name}: p95 de row-to-paint`).toBeLessThan(BUDGET_MS);
    // CA3-P5: nada valida dentro de la ventana de una vista previa o de un avance de fila. (Que la vista previa no
    // toque el documento ni dispare validación, CA3-P4, lo prueba Vitest: aquí puede correr la validación diferida
    // de las repeticiones anteriores, fuera de las ventanas.)
    expect.soft(hover.validations.insideEditWindow, `CA3-P5 ${s.name}: validaciones dentro de una vista previa`).toBe(0);
    expect.soft(rows.validations.insideEditWindow, `CA3-P5 ${s.name}: validaciones dentro de un avance de fila`).toBe(0);
  });
}
