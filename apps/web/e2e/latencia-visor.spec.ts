import { expect, test } from "./support/estudio.ts";
import {
  blockEdits,
  colorClicks,
  drawnIsCurrent,
  flatToggles,
  longTasks,
  openAmigurumi,
  perfReset,
  perfSummary,
  pick,
  rng,
  swatchHovers,
  textEdits,
  updatingSeen,
  viewerCounters,
  watchLongTasks,
  watchUpdating,
  yarnChangeEdits,
} from "./support/visor-latencia.ts";

/*
 * Latencia del estudio amigurumi con el visor 3D (T12 de la fase 4; ADR 0010, secciones 6, 6b y 6c, "Medición";
 * CA4-P1 a CA4-P5 y CA4-P8 a CA4-P10). Proyecto `webgl` (WebGL por software con SwiftShader en la CI), sobre
 * `/dev/amigurumi?perf=1` con el recolector `window.__loopitaViewerPerf` (`src/lib/amigurumi/viewer-perf.ts`):
 *
 * - `edit-to-paint-3d`: de la tecla, el clic o el campo al frame del visor que ya dibuja el cambio;
 * - `edit-to-feedback`: de la tecla a que el editor muestra el texto, el conteo y los errores (sin esperar al 3D);
 * - `hover-to-paint-3d`: de pasar el cursor por un color al frame.
 *
 * Siempre con el aspecto por fibra activado; `E2E_FLAT_COLORS=1` mide con "Colores planos" (A/B, solo se informa).
 * Umbrales: `E2E_VIEWER_BUDGET_MS` para el 3D (100 ms por defecto, el de la regla de oro 7; la CI usa el suyo, ver
 * `e2e/README.md`) y 100 ms para `edit-to-feedback` fuera de los límites (CA4-P8; la CI usa `E2E_FEEDBACK_OUT_OF_LIMITS_MS`). CPU: `E2E_CPU_RATE` (1).
 * Los números quedan en la salida (`[latencia-visor]`) y como adjuntos JSON. Corre en orden en un trabajador: con
 * otras pruebas en paralelo, la CPU compartida falsearía las cifras (en local, `--workers=1`).
 */
const BUDGET_MS = Number(process.env.E2E_VIEWER_BUDGET_MS ?? 100);
/** CA4-P8 (edit-to-feedback fuera de los límites recomendados): 100 ms en local y en el equipo de referencia. La CI
 * (SwiftShader en GitHub) usa el suyo por `E2E_FEEDBACK_OUT_OF_LIMITS_MS`. */
const FEEDBACK_MS = Number(process.env.E2E_FEEDBACK_OUT_OF_LIMITS_MS ?? 100);
/** CA4-P8 solo se informa (CI). */
const P8_REPORT_ONLY = process.env.E2E_P8_REPORT_ONLY === "1";
/** CA4-P9 al editar: 500 ms siempre. */
const LONG_TASK_MS = 500;
/** CA4-P9 al cargar la página: 500 ms × CPU por defecto; la CI usa `E2E_LOAD_LONG_TASK_MS`. */
const LOAD_LONG_TASK_MS = Number(process.env.E2E_LOAD_LONG_TASK_MS ?? LONG_TASK_MS);
const CPU_RATE = Number(process.env.E2E_CPU_RATE ?? 1);
const FLAT_COLORS = process.env.E2E_FLAT_COLORS === "1";
const N = 50;

// En orden y en un solo trabajador, pero sin `serial`: si un escenario falla, los demás igual se miden.
test.describe.configure({ mode: "default" });
// Sin traza: grabarla toma instantáneas del DOM en cada acción y falsea la medición (con 60.900 puntos y CPU ×1,
// `edit-to-feedback` daba p50 60–66 ms con traza y 16–17 ms sin ella). Los números quedan en los adjuntos JSON.
test.use({ trace: "off" });

function report(info: import("@playwright/test").TestInfo, name: string, result: Record<string, unknown>) {
  console.log(`[latencia-visor] ${JSON.stringify(result)}`);
  void info.attach(`latencia-visor-${name}.json`, { body: JSON.stringify(result, null, 2), contentType: "application/json" });
}

test("fixture A (escenario de referencia): texto, bloques, lanas y Colores planos bajo el presupuesto (CA4-P1 a CA4-P3, CA4-P5)", async ({ page }, info) => {
  test.setTimeout(CPU_RATE > 1 ? 600_000 : 300_000);
  await openAmigurumi(page, "referencia", { flat: FLAT_COLORS, cpuRate: CPU_RATE });
  await expect(page.getByTestId("visor-3d-lienzo")).toHaveAttribute("data-mode", "full");
  await expect(page.getByTestId("limits-meter")).not.toHaveAttribute("data-tone", "over");
  const rnd = rng(20261115);

  // ---------------------------------------------------------------- CA4-P1: 50 ediciones de una vuelta en el texto
  await perfReset(page);
  const c0 = await viewerCounters(page);
  await textEdits(page, N, rnd);
  await page.waitForTimeout(400);
  const text = await perfSummary(page);
  const c1 = await viewerCounters(page);

  // ---------------------------------------------------------------- CA4-P3 (b): "@B" → "@C", 50 veces (solo recolorear)
  await perfReset(page);
  await yarnChangeEdits(page, N, rnd);
  await page.waitForTimeout(400);
  const yarnChange = await perfSummary(page);
  const c2 = await viewerCounters(page);

  // ---------------------------------------------------------------- CA4-P2: 50 acciones de bloques
  await perfReset(page);
  await blockEdits(page, N, rnd);
  await page.waitForTimeout(400);
  const blocks = await perfSummary(page);
  const c3 = await viewerCounters(page);

  // ---------------------------------------------------------------- CA4-P3 (a): color de una lana y Colores planos
  await perfReset(page);
  await colorClicks(page, N, rnd);
  await page.waitForTimeout(400);
  const colors = await perfSummary(page);
  const c4 = await viewerCounters(page);
  await perfReset(page);
  await flatToggles(page, N, rnd);
  await page.waitForTimeout(400);
  const flat = await perfSummary(page);
  const c5 = await viewerCounters(page);

  const result = {
    escenario: "referencia",
    umbralMs: BUDGET_MS,
    cpu: CPU_RATE,
    coloresPlanos: FLAT_COLORS,
    texto: { paint3d: pick(text, "edit-to-paint-3d", "text"), feedback: pick(text, "edit-to-feedback", "text") },
    bloques: { paint3d: pick(blocks, "edit-to-paint-3d", "blocks"), feedback: pick(blocks, "edit-to-feedback", "blocks") },
    cambioDeLana: { paint3d: pick(yarnChange, "edit-to-paint-3d", "text"), feedback: pick(yarnChange, "edit-to-feedback", "text") },
    color: { paint3d: pick(colors, "edit-to-paint-3d", "yarn"), hover: pick(colors, "hover-to-paint-3d", "hover") },
    planos: { paint3d: pick(flat, "edit-to-paint-3d", "flat") },
    perdidas: [text, yarnChange, blocks, colors, flat].map((s) => s.dropped),
    tramos: [text, yarnChange, blocks, colors, flat].map((s) => s.spans),
    contadores: {
      texto: { buildScene: c1.controller.buildScene - c0.controller.buildScene, partsBuilt: c1.controller.partsBuilt - c0.controller.partsBuilt },
      cambioDeLana: { partsBuilt: c2.controller.partsBuilt - c1.controller.partsBuilt, partsRecolored: c2.controller.partsRecolored - c1.controller.partsRecolored },
      colorYPlanos: { buildScene: c5.controller.buildScene - c3.controller.buildScene, attributesMarked: c5.renderer.attributesMarked - c3.renderer.attributesMarked, looksOnly: c5.controller.looksOnly - c3.controller.looksOnly },
      programas: [c0.renderer.programs, c5.renderer.programs],
    },
  };
  report(info, "referencia", result);
  info.annotations.push({ type: "latencia-visor", description: `referencia: texto p95 ${result.texto.paint3d.p95} ms, bloques ${result.bloques.paint3d.p95}, cambio de lana ${result.cambioDeLana.paint3d.p95}, color ${result.color.paint3d.p95}, planos ${result.planos.paint3d.p95}; umbral ${BUDGET_MS} ms, CPU ×${CPU_RATE}${FLAT_COLORS ? ", Colores planos" : ""}` });

  // Cada edición llegó a su frame (salvo alguna entrada que el navegador agrupe).
  expect(result.texto.paint3d.n, "ediciones de texto medidas").toBeGreaterThanOrEqual(N - 2);
  expect(result.texto.feedback.n, "respuestas del editor medidas").toBeGreaterThanOrEqual(N - 2);
  expect(result.bloques.paint3d.n, "acciones de bloques medidas").toBeGreaterThanOrEqual(N - 2);
  expect(result.cambioDeLana.paint3d.n, "cambios de lana medidos").toBeGreaterThanOrEqual(N - 2);
  expect(result.color.paint3d.n, "colores medidos").toBeGreaterThanOrEqual(N - 2);
  expect(result.planos.paint3d.n, "Colores planos medidos").toBeGreaterThanOrEqual(N - 2);
  for (const s of [text, yarnChange, blocks, colors, flat]) expect(s.dropped.viewer, "ediciones del 3D sin frame").toBe(0);

  // CA4-P1 y CA4-P2: dentro de los límites, cada edición de forma rearma solo la parte editada.
  expect(c1.controller.partsBuilt - c0.controller.partsBuilt).toBeLessThanOrEqual(c1.controller.buildScene - c0.controller.buildScene);
  // CA4-P3: cambiar la lana de un cambio de color recolorea sin armar mallas.
  expect(result.contadores.cambioDeLana.partsBuilt, "CA4-P3: buildPartMesh al cambiar @B ↔ @C").toBe(0);
  expect(result.contadores.cambioDeLana.partsRecolored, "CA4-P3: colorizePartMesh al cambiar @B ↔ @C").toBeGreaterThanOrEqual(N - 2);
  // CA4-P3: color y Colores planos no arman escena ni suben atributos (solo la tabla por lana) y no recompilan.
  expect(result.contadores.colorYPlanos.buildScene, "CA4-P3: buildScene al cambiar color o Colores planos").toBe(0);
  expect(c5.controller.partsRecolored - c3.controller.partsRecolored, "CA4-P3: colorizePartMesh al cambiar color").toBe(0);
  expect(result.contadores.colorYPlanos.attributesMarked, "CA4-P3: atributos subidos").toBe(0);
  expect(c5.renderer.programs, "CA4-P3: programas de shader").toBe(c3.renderer.programs);

  expect.soft(result.texto.paint3d.p95 ?? Infinity, "CA4-P1: p95 de edit-to-paint-3d (texto)").toBeLessThan(BUDGET_MS);
  expect.soft(result.bloques.paint3d.p95 ?? Infinity, "CA4-P2: p95 de edit-to-paint-3d (bloques)").toBeLessThan(BUDGET_MS);
  expect.soft(result.cambioDeLana.paint3d.p95 ?? Infinity, "CA4-P3: p95 al cambiar la lana de un cambio de color").toBeLessThan(BUDGET_MS);
  expect.soft(result.color.paint3d.p95 ?? Infinity, "CA4-P3: p95 al cambiar el color de una lana").toBeLessThan(BUDGET_MS);
  expect.soft(result.planos.paint3d.p95 ?? Infinity, "CA4-P3: p95 de Colores planos").toBeLessThan(BUDGET_MS);
  // CA4-P5: la validación completa y las medidas corren diferidas, nunca dentro de una edición.
  for (const s of [text, yarnChange, blocks, colors, flat]) {
    expect.soft(s.spans.insideViewerWindow, "CA4-P5: validaciones dentro de una edición del 3D").toBe(0);
    expect.soft(s.spans.insideFeedbackWindow, "CA4-P5: validaciones dentro de una respuesta del editor").toBe(0);
  }
  expect(text.spans.n + blocks.spans.n, "la revisión diferida corrió").toBeGreaterThan(0);
});

test("vista previa de una lana al pasar el cursor (CA4-P10)", async ({ page }, info) => {
  test.setTimeout(CPU_RATE > 1 ? 400_000 : 180_000);
  await openAmigurumi(page, "referencia", { flat: FLAT_COLORS, cpuRate: CPU_RATE });
  const rnd = rng(20261116);
  const doc0 = await page.evaluate(() => JSON.stringify((window as unknown as { __loopitaAmigurumi: { store: { doc: unknown } } }).__loopitaAmigurumi.store.doc));
  const c0 = await viewerCounters(page);
  await swatchHovers(page, 4, rnd); // calentamiento
  await perfReset(page);
  await swatchHovers(page, N, rnd);
  await page.waitForTimeout(400);
  const s = await perfSummary(page);
  const c1 = await viewerCounters(page);
  const hover = pick(s, "hover-to-paint-3d", "hover");
  const result = { escenario: "referencia", umbralMs: BUDGET_MS, cpu: CPU_RATE, coloresPlanos: FLAT_COLORS, hover, perdidas: s.dropped, tramos: s.spans, buildScene: c1.controller.buildScene - c0.controller.buildScene };
  report(info, "hover", result);
  info.annotations.push({ type: "latencia-visor", description: `hover p95 ${hover.p95} ms (n ${hover.n}), umbral ${BUDGET_MS} ms` });
  expect(hover.n, "vistas previas medidas").toBeGreaterThanOrEqual(N - 5);
  expect(s.dropped.viewer).toBe(0);
  expect(result.buildScene, "la vista previa no arma escena").toBe(0);
  expect(await page.evaluate(() => JSON.stringify((window as unknown as { __loopitaAmigurumi: { store: { doc: unknown } } }).__loopitaAmigurumi.store.doc)), "la vista previa no toca el documento").toBe(doc0);
  expect.soft(hover.p95 ?? Infinity, "CA4-P10: p95 de hover-to-paint-3d").toBeLessThan(BUDGET_MS);
  expect.soft(s.spans.insideViewerWindow, "CA4-P5: validaciones dentro de una vista previa").toBe(0);
});

test("fuera de los límites recomendados (60.900 puntos): el editor responde bajo 100 ms y el 3D llega a la última edición (CA4-P8)", async ({ page }, info) => {
  test.setTimeout(CPU_RATE > 1 ? 600_000 : 300_000);
  await openAmigurumi(page, "limites-60k", { flat: FLAT_COLORS, cpuRate: CPU_RATE });
  await expect(page.getByTestId("limits-meter")).toHaveAttribute("data-tone", "over");
  await expect(page.getByTestId("scene-stitches-tone")).toContainText("Supera el límite recomendado");
  await expect(page.getByTestId("visor-3d-lienzo")).toHaveAttribute("data-mode", "degraded");
  const c0 = await viewerCounters(page);
  expect(c0.policy).toMatchObject({ mode: "degraded", lod: "smooth", maxPixelRatio: 1 });
  await expect(page.getByTestId("editor-part-name")).toHaveText("Grande");
  await watchUpdating(page);
  const rnd = rng(20261117);
  await perfReset(page);
  await textEdits(page, N, rnd);
  await expect(page.getByTestId("visor-3d-actualizando")).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(400);
  const s = await perfSummary(page);
  const c1 = await viewerCounters(page);
  const result = {
    escenario: "limites-60k",
    cpu: CPU_RATE,
    coloresPlanos: FLAT_COLORS,
    feedback: pick(s, "edit-to-feedback", "text"),
    paint3d: pick(s, "edit-to-paint-3d", "text"),
    reemplazadas: s.coalesced,
    actualizandoVisto: await updatingSeen(page),
    contadores: { buildScene: c1.controller.buildScene - c0.controller.buildScene, deferred: c1.controller.deferred - c0.controller.deferred, superseded: c1.controller.superseded - c0.controller.superseded },
    perdidas: s.dropped,
    tramos: s.spans,
  };
  report(info, "limites-60k", result);
  info.annotations.push({ type: "latencia-visor", description: `fuera de los límites: edit-to-feedback p95 ${result.feedback.p95} ms (umbral ${FEEDBACK_MS}), edit-to-paint-3d p95 ${result.paint3d.p95} ms (solo se informa)` });
  expect(result.feedback.n, "respuestas del editor medidas").toBeGreaterThanOrEqual(N - 2);
  expect(s.dropped.feedback + s.dropped.viewer, "ediciones perdidas").toBe(0);
  // El 3D llegó a la última edición, sin cola: una reconstrucción por turno, y "Actualizando 3D…" se mostró.
  expect(await drawnIsCurrent(page), "el 3D dibuja la última edición").toBe(true);
  expect(result.contadores.deferred, "ediciones que pasaron por la reconstrucción diferida").toBeGreaterThanOrEqual(N - 2);
  expect(result.contadores.buildScene, "reconstrucciones (nunca más que las ediciones)").toBeLessThanOrEqual(result.contadores.deferred);
  expect(result.actualizandoVisto, "«Actualizando 3D…» visible mientras tanto").toBeGreaterThan(0);
  expect(c1.policy).toMatchObject({ mode: "degraded", lod: "smooth" });
  // En la CI (SwiftShader en runners compartidos) el p95 varió entre 126 y 243 ms con el mismo código: ahí solo se
  // informa (`E2E_P8_REPORT_ONLY=1`). En local y en el equipo de referencia se exige.
  if (P8_REPORT_ONLY) {
    if ((result.feedback.p95 ?? Infinity) >= FEEDBACK_MS) info.annotations.push({ type: "aviso", description: `CA4-P8 sobre ${FEEDBACK_MS} ms en la CI: p95 ${result.feedback.p95} ms (solo se informa)` });
  } else {
    expect.soft(result.feedback.p95 ?? Infinity, "CA4-P8: p95 de edit-to-feedback fuera de los límites").toBeLessThan(FEEDBACK_MS);
  }
  expect.soft(s.spans.insideFeedbackWindow, "CA4-P5: validaciones dentro de una respuesta del editor").toBe(0);
});

test("sobre SCENE_HARD_STITCH_CAP (270.000 puntos): siluetas, ninguna tarea de más de 500 ms y el diseño se sigue editando (CA4-P9)", async ({ page }, info) => {
  test.setTimeout(CPU_RATE > 1 ? 400_000 : 180_000);
  await watchLongTasks(page);
  await openAmigurumi(page, "tope", { cpuRate: CPU_RATE });
  await expect(page.getByTestId("visor-3d-siluetas")).toBeVisible();
  await expect(page.getByTestId("visor-3d-siluetas")).toContainText("demasiados puntos para armar el 3D");
  const c0 = await viewerCounters(page);
  expect(c0.renderer.mode).toBe("silhouettes");
  const atLoad = (await longTasks(page)).length;
  const docJson = () => page.evaluate(() => JSON.stringify((window as unknown as { __loopitaAmigurumi: { store: { doc: unknown } } }).__loopitaAmigurumi.store.doc));
  const doc0 = await docJson();
  const rnd = rng(20261118);
  await perfReset(page);
  await textEdits(page, 20, rnd);
  await page.waitForTimeout(1_500); // revisión y descripción diferidas, y el autoguardado
  const s = await perfSummary(page);
  const c1 = await viewerCounters(page);
  const tasks = await longTasks(page);
  const worst = tasks.reduce((m, t) => Math.max(m, t.duration), 0);
  const ms = (list: typeof tasks) => list.map((t) => Math.round(t.duration));
  const result = { escenario: "tope", cpu: CPU_RATE, feedback: pick(s, "edit-to-feedback", "text"), tareasLargas: tasks.length, peorTareaMs: Math.round(worst), tareasAlCargar: ms(tasks.slice(0, atLoad)), tareasAlEditar: ms(tasks.slice(atLoad)), buildScene: c1.controller.buildScene - c0.controller.buildScene, tramos: s.spans };
  report(info, "tope", result);
  info.annotations.push({ type: "latencia-visor", description: `sobre el tope: peor tarea ${result.peorTareaMs} ms, edit-to-feedback p95 ${result.feedback.p95} ms` });
  expect(result.buildScene, "sobre el tope no se arma ninguna malla").toBe(0);
  expect(c1.renderer.stitches, "sin puntos en la GPU").toBe(0);
  await expect(page.getByTestId("visor-3d-siluetas")).toBeVisible();
  // El diseño se sigue editando: el documento cambió y el texto está leído; la revisión diferida corrió.
  // 20 ediciones en ciclos de 4 terminan en el texto inicial: se agrega una más para ver que el documento cambia.
  await textEdits(page, 1, rnd);
  await expect.poll(docJson, { message: "el documento cambió" }).not.toBe(doc0);
  await expect(page.getByTestId("part-text-editor")).toHaveAttribute("data-status", "synced");
  expect(s.spans.byName["validate:review"] ?? 0, "la revisión del validador corrió").toBeGreaterThan(0);
  expect(result.feedback.n).toBeGreaterThanOrEqual(18);
  // Mientras se edita la escena sobre el tope: ninguna tarea de más de 500 ms. Al cargar la página, el JS del
  // estudio y del visor cuesta lo mismo con cualquier escena (con CPU ×4 y SwiftShader, el escenario de referencia,
  // de 4.036 puntos, también tiene tareas de 600 ms o más al cargar): ahí el umbral escala con la CPU limitada.
  const editing = tasks.slice(atLoad).reduce((m, t) => Math.max(m, t.duration), 0);
  const loading = tasks.slice(0, atLoad).reduce((m, t) => Math.max(m, t.duration), 0);
  expect(editing, `CA4-P9: ninguna tarea de más de ${LONG_TASK_MS} ms al editar`).toBeLessThan(LONG_TASK_MS);
  expect(loading, `CA4-P9: ninguna tarea de más de ${LOAD_LONG_TASK_MS} ms × CPU al cargar`).toBeLessThan(LOAD_LONG_TASK_MS * CPU_RATE);
});

/*
 * R4-20 (ADR 0010, sección 6c): cerca de `SCENE_HARD_STITCH_CAP`, cada edición de la parte grande (120.000 puntos,
 * sin copias) la rearma entera en el hilo principal. Se informa `edit-to-feedback` y lo que dura cada reconstrucción
 * (tareas largas); con `E2E_R420_STRICT=1` se exige además CA4-P8 (p95 < 100 ms) en este escenario.
 */
test("R4-20: cerca del tope, rearmar una parte grande no traba al editor (informa)", async ({ page }, info) => {
  test.setTimeout(CPU_RATE > 1 ? 600_000 : 300_000);
  await watchLongTasks(page);
  await openAmigurumi(page, "cerca-del-tope", { flat: FLAT_COLORS, cpuRate: CPU_RATE });
  await expect(page.getByTestId("visor-3d-lienzo")).toHaveAttribute("data-mode", "degraded");
  await expect(page.getByTestId("editor-part-name")).toHaveText("Grande");
  const before = (await longTasks(page)).length;
  const c0 = await viewerCounters(page);
  const rnd = rng(20261119);
  await perfReset(page);
  await textEdits(page, 30, rnd);
  await expect(page.getByTestId("visor-3d-actualizando")).toHaveCount(0, { timeout: 60_000 });
  await page.waitForTimeout(400);
  const s = await perfSummary(page);
  const c1 = await viewerCounters(page);
  const tasks = (await longTasks(page)).slice(before).map((t) => Math.round(t.duration));
  const sorted = [...tasks].sort((a, b) => a - b);
  const result = {
    escenario: "cerca-del-tope",
    cpu: CPU_RATE,
    feedback: pick(s, "edit-to-feedback", "text"),
    paint3d: pick(s, "edit-to-paint-3d", "text"),
    reemplazadas: s.coalesced,
    reconstrucciones: c1.controller.buildScene - c0.controller.buildScene,
    tareasLargas: { n: tasks.length, p50: sorted[Math.floor(sorted.length / 2)] ?? null, max: sorted.at(-1) ?? null },
    perdidas: s.dropped,
  };
  report(info, "cerca-del-tope", result);
  info.annotations.push({ type: "latencia-visor", description: `R4-20: edit-to-feedback p95 ${result.feedback.p95} ms, reconstrucción p50 ${result.tareasLargas.p50} ms (máx. ${result.tareasLargas.max})` });
  expect(await drawnIsCurrent(page), "el 3D dibuja la última edición").toBe(true);
  expect(s.dropped.feedback, "respuestas del editor perdidas").toBe(0);
  if (process.env.E2E_R420_STRICT === "1") expect.soft(result.feedback.p95 ?? Infinity, "R4-20: p95 de edit-to-feedback cerca del tope").toBeLessThan(FEEDBACK_MS);
});

/*
 * CA4-P7: el estudio de colorwork no carga `three` (el visor va solo por `next/dynamic` en el amigurumi), y se informa
 * el tamaño con gzip del fragmento del visor. Sin sesión: `/dev/estudio` monta el mismo estudio de colorwork que
 * `/disenos/[id]`. El fragmento de `three` se reconoce por `isWebGLRenderer`, que el minificador no renombra.
 */
test("el estudio de colorwork no pide el fragmento de three; el amigurumi sí, y se informa su tamaño (CA4-P7)", async ({ page }, info) => {
  const { gzipSync } = await import("node:zlib");
  const scripts: Array<{ url: string; body: Buffer }> = [];
  page.on("response", async (r) => {
    if (r.request().resourceType() !== "script" || !r.ok()) return;
    try {
      scripts.push({ url: r.url(), body: await r.body() });
    } catch {
      // Respuesta sin cuerpo (redirección o navegación interrumpida).
    }
  });
  const withThree = () => scripts.filter((s) => s.body.includes("isWebGLRenderer"));
  await page.goto("/dev/estudio");
  await expect(page.getByTestId("preview-host")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(withThree().map((s) => s.url), "fragmentos de three en el estudio de colorwork").toEqual([]);
  const colorworkScripts = scripts.length;
  scripts.length = 0;
  await openAmigurumi(page, "referencia");
  const three = withThree();
  expect(three.length, "el estudio amigurumi carga el visor").toBeGreaterThan(0);
  const sizes = three.map((s) => ({ archivo: s.url.split("/").pop(), kb: Math.round(s.body.length / 1024), gzipKb: Math.round(gzipSync(s.body).length / 1024) }));
  report(info, "fragmento-visor", { colorworkScripts, fragmentos: sizes });
  info.annotations.push({ type: "fragmento-visor", description: sizes.map((s) => `${s.archivo}: ${s.gzipKb} KB con gzip`).join("; ") });
});
