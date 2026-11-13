import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chartGeom, clickCell, focusChart, strokeThrough, type Cell } from "../support/estudio.ts";
import { contextAs, createFromTemplate, expect, expectSaved, openDesignSection, saveStatus, stateFile, storedPattern, test, waitForStudio } from "./support.ts";

/*
 * "Tejer este diseño" y la pantalla "Tejiendo" con sesión (T12 de la fase 3; ADR 0007 y 0009). Cuenta: fer.
 * La plantilla "Banda en tubo" es un motivo de 8 × 8 repetido 12 veces a lo ancho, en redondo: 8 vueltas.
 */
test.use({ storageState: stateFile("fer") });

const unique = (base: string) => `${base} ${Date.now().toString(36)}`;
const TEJER = /\/proyectos\/([0-9a-f-]{36})\/tejer$/;
const counter = (page: Page) => page.getByTestId("knit-row-counter");
const progressStatus = (page: Page) => page.locator("[data-progress-status]");
const expectProgressSaved = (page: Page) => expect(progressStatus(page)).toHaveAttribute("data-progress-status", "saved", { timeout: 10_000 });

async function storedRound(admin: SupabaseClient, projectId: string): Promise<number | null> {
  const { data, error } = await admin.from("project_progress").select("round_number").eq("project_id", projectId).maybeSingle();
  if (error) throw new Error(`project_progress: ${error.code ?? error.message}`);
  return (data?.round_number as number | undefined) ?? null;
}

/** Desde el estudio abierto: "Tejer este diseño" → pantalla previa → confirmar. Devuelve el id del proyecto. */
async function startFromStudio(page: Page, projectTitle?: string): Promise<string> {
  await openDesignSection(page);
  await page.getByTestId("knit-from-studio").getByRole("button", { name: "Tejer este diseño" }).click();
  const dialog = page.getByTestId("knit-dialog");
  await expect(dialog.getByTestId("knit-preview")).toBeVisible();
  if (projectTitle) await dialog.getByLabel("Nombre del proyecto (opcional)").fill(projectTitle);
  await dialog.getByTestId("knit-confirm").click();
  await page.waitForURL(TEJER, { timeout: 20_000 });
  await expect(counter(page)).toBeVisible();
  return TEJER.exec(new URL(page.url()).pathname)?.[1] ?? "";
}

test.describe("Tejer este diseño", () => {
  test("pantalla previa, crear el proyecto, avanzar con botones y teclado, y conservar el avance al recargar", async ({ page, admin }) => {
    const title = unique("Tejer");
    const patternId = await createFromTemplate(page, title);
    await openDesignSection(page);
    await page.getByTestId("knit-from-studio").getByRole("button", { name: "Tejer este diseño" }).click();

    // Pantalla previa (F3-39): forma de trabajo, muestra supuesta, metraje, lo que no está en el gráfico y prototipo.
    const dialog = page.getByTestId("knit-dialog");
    await expect(dialog.getByTestId("knit-preview-shape")).toHaveText("En redondo, de abajo hacia arriba: 8 vueltas en total (tubo).");
    await expect(dialog.getByTestId("knit-preview-gauge")).toContainText("(supuesta)");
    await expect(dialog.getByTestId("knit-preview-yarn")).toHaveCount(2);
    await expect(dialog.getByTestId("knit-preview-yarn").first()).toContainText(/≈ .* m \(entre .* y .* m\), estimación/);
    // Palillo (T18, M1): montaje, elástico o borde, forma previa, cierre y armado.
    await expect(dialog.getByTestId("knit-preview-not-in-chart").getByRole("listitem")).toHaveCount(5);
    await expect(dialog.getByTestId("knit-preview-motif")).toHaveText("Motivo de 8 × 8, repetido 12 veces a lo ancho y sin repetir a lo alto.");
    await expect(dialog.getByTestId("knit-preview-prototype")).toContainText("Teje una muestra");
    const projectTitle = `${title} (proyecto)`;
    await dialog.getByLabel("Nombre del proyecto (opcional)").fill(projectTitle);
    await dialog.getByTestId("knit-confirm").click();
    await page.waitForURL(TEJER, { timeout: 20_000 });
    const projectId = TEJER.exec(new URL(page.url()).pathname)?.[1] ?? "";

    const { data: project } = await admin.from("projects").select("title, status, pattern_id, pattern_version_id").eq("id", projectId).single();
    expect(project).toMatchObject({ title: projectTitle, status: "in_progress", pattern_id: patternId });
    expect(project?.pattern_version_id, "versión fijada").toBeTruthy();
    expect(await storedRound(admin, projectId)).toBe(1);

    // Tejiendo: fila actual, lado y sentido, tramos y repetición.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`Tejiendo: ${projectTitle}`);
    await expect(counter(page)).toHaveText("Vuelta 1 de 8");
    await expect(page.getByTestId("knit-row-side")).toHaveText("por el derecho, de derecha a izquierda");
    await expect(page.getByTestId("knit-runs").getByRole("listitem").first()).toBeVisible();
    await expect(page.getByTestId("knit-repeat")).toContainText("repetición 1 de 12");
    await expect(page.getByTestId("knit-chart")).toHaveAttribute("data-highlight-row", "0");
    await expect(page.getByTestId("preview-canvas")).toBeVisible();
    await expect(page.getByTestId("knit-next")).toBeFocused();

    // Botones.
    await page.getByTestId("knit-next").click();
    await expect(counter(page)).toHaveText("Vuelta 2 de 8");
    await expect(page.getByTestId("knit-announcement")).toContainText("Vuelta 2 de 8");
    await expect(page.getByTestId("knit-chart")).toHaveAttribute("data-highlight-row", "1");
    await page.getByTestId("knit-next-repeat").click();
    await expect(page.getByTestId("knit-repeat")).toContainText("repetición 2 de 12");
    await page.getByTestId("knit-prev").click(); // con casillas hechas, vuelve al inicio de la vuelta
    await expect(page.getByTestId("knit-repeat")).toContainText("repetición 1 de 12");
    await expect(counter(page)).toHaveText("Vuelta 2 de 8");

    // Teclado y pasapáginas Bluetooth (flechas y Re Pág/Av Pág). El foco fuera de los botones: las teclas son globales.
    await page.getByRole("heading", { level: 1 }).click();
    await page.keyboard.press("ArrowRight");
    await expect(counter(page)).toHaveText("Vuelta 3 de 8");
    await page.keyboard.press("PageDown");
    await expect(counter(page)).toHaveText("Vuelta 4 de 8");
    await page.keyboard.press("Space");
    await expect(counter(page)).toHaveText("Vuelta 5 de 8");
    await page.keyboard.press("Enter");
    await expect(counter(page)).toHaveText("Vuelta 6 de 8");
    await page.keyboard.press("Backspace");
    await expect(counter(page)).toHaveText("Vuelta 5 de 8");
    await page.keyboard.press("PageUp");
    await expect(counter(page)).toHaveText("Vuelta 4 de 8");
    await page.keyboard.press("ArrowLeft");
    await expect(counter(page)).toHaveText("Vuelta 3 de 8");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByTestId("knit-repeat")).toContainText("repetición 2 de 12");
    // Enter sobre el botón con foco avanza una sola vez (no clic + tecla).
    await page.getByTestId("knit-next").focus();
    await page.keyboard.press("Enter");
    await expect(counter(page)).toHaveText("Vuelta 4 de 8");

    // Se guarda solo (≤ 2 s de pausa) y sobrevive a recargar.
    await expectProgressSaved(page);
    await expect.poll(() => storedRound(admin, projectId)).toBe(4);
    await page.reload();
    await expect(counter(page)).toHaveText("Vuelta 4 de 8");
    await expect(page.getByTestId("knit-chart")).toHaveAttribute("data-highlight-row", "3");

    // row-to-paint: del clic a dos frames pintados, bajo 100 ms (p95 de 20 avances y retrocesos).
    const times = await page.evaluate(async () => {
      const out: number[] = [];
      const next = document.querySelector<HTMLButtonElement>("[data-testid=knit-next]")!;
      const prev = document.querySelector<HTMLButtonElement>("[data-testid=knit-prev]")!;
      for (let k = 0; k < 20; k++) {
        const t0 = performance.now();
        (k % 2 === 0 ? next : prev).click();
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        out.push(performance.now() - t0);
        await new Promise((r) => setTimeout(r, 60));
      }
      return out.sort((a, b) => a - b);
    });
    const p95 = times[Math.floor(times.length * 0.95) - 1] ?? Infinity;
    test.info().annotations.push({ type: "latencia", description: `row-to-paint en Tejiendo: p95 ${Math.round(p95)} ms (n ${times.length})` });
    expect.soft(p95, "row-to-paint p95").toBeLessThan(Number(process.env.E2E_LATENCY_BUDGET_MS ?? 100));
    await expect(counter(page)).toHaveText("Vuelta 4 de 8");

    // Hasta el final: "Gráfico terminado" (nunca "Pieza terminada"), con lo que falta.
    for (let k = 0; k < 5; k++) await page.getByTestId("knit-next").click();
    await expect(page.getByTestId("knit-finished")).toContainText("Gráfico terminado");
    await expect(page.getByTestId("knit-finished")).toContainText("Tejiste todas las vueltas del gráfico. Quedan 96 puntos: ciérralos.");
    await expect(page.getByText("Pieza terminada")).toHaveCount(0);
    await expect(page.getByTestId("knit-next")).toBeDisabled();
    await expectProgressSaved(page);
    await expect.poll(() => storedRound(admin, projectId)).toBe(9);

    // La lista muestra el avance y la versión fijada.
    await page.goto("/proyectos");
    const card = page.getByTestId("project-card").filter({ hasText: projectTitle });
    await expect(card.getByTestId("project-progress")).toHaveText("Gráfico terminado");
    await expect(card).toContainText("versión 1");

    // 390 px: sin desplazamiento horizontal, botones de al menos 48 px.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/proyectos/${projectId}/tejer`);
    await page.getByTestId("knit-prev").click();
    await expect(counter(page)).toHaveText("Vuelta 8 de 8");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const id of ["knit-prev", "knit-next", "knit-prev-repeat", "knit-next-repeat"]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box?.height ?? 0, `${id}: alto táctil`).toBeGreaterThanOrEqual(48);
    }
    await expectProgressSaved(page);
  });

  test("pantalla encendida: activada por defecto, con interruptor que se recuerda", async ({ page }) => {
    await createFromTemplate(page, unique("Pantalla"));
    await startFromStudio(page);
    const toggle = page.getByTestId("wake-lock-toggle");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    if (await toggle.isEnabled()) {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      expect(await page.evaluate(() => localStorage.getItem("loopitalab:tejiendo:pantalla"))).toBe("0");
      await page.reload();
      await expect(page.getByTestId("wake-lock-toggle")).toHaveAttribute("aria-checked", "false");
      await page.getByTestId("wake-lock-toggle").click();
      expect(await page.evaluate(() => localStorage.getItem("loopitalab:tejiendo:pantalla"))).toBe("1");
    }
  });

  test("conflicto entre dos dispositivos: pregunta con las dos posiciones y nunca pisa en silencio (F3-41)", async ({ page, browser, admin, watch }) => {
    await createFromTemplate(page, unique("Conflicto avance"));
    const projectId = await startFromStudio(page);
    const { context, page: other } = await contextAs(browser, "fer", watch);
    await other.goto(`/proyectos/${projectId}/tejer`);
    await expect(counter(other)).toHaveText("Vuelta 1 de 8");

    // Dispositivo 1 avanza a la vuelta 4 y guarda.
    for (let k = 0; k < 3; k++) await page.getByTestId("knit-next").click();
    await expectProgressSaved(page);
    await expect.poll(() => storedRound(admin, projectId)).toBe(4);

    // Dispositivo 2 tenía el avance viejo: avanza a la vuelta 2 y choca.
    await other.getByTestId("knit-next").click();
    const conflict = other.getByTestId("progress-conflict");
    await expect(conflict).toBeVisible({ timeout: 10_000 });
    await expect(conflict).toContainText(/En otro dispositivo vas en la vuelta 4 \((recién|hace \d+ min)\)\. Aquí vas en la vuelta 2\. ¿Con cuál sigues\?/);
    expect(await storedRound(admin, projectId), "el conflicto no escribió nada").toBe(4);

    // "Seguir con la del otro dispositivo": adopta la vuelta 4.
    await other.getByTestId("conflict-take-theirs").click();
    await expect(counter(other)).toHaveText("Vuelta 4 de 8");
    await expect(conflict).toHaveCount(0);
    await expectProgressSaved(other);
    expect(await storedRound(admin, projectId)).toBe(4);

    // Ahora el 2 avanza a la 6; el 1 (desactualizado) retrocede a la 3 y elige "seguir con la de aquí".
    await other.getByTestId("knit-next").click();
    await other.getByTestId("knit-next").click();
    await expectProgressSaved(other);
    await expect.poll(() => storedRound(admin, projectId)).toBe(6);
    await page.getByTestId("knit-prev").click();
    const conflict1 = page.getByTestId("progress-conflict");
    await expect(conflict1).toContainText("En otro dispositivo vas en la vuelta 6");
    await expect(conflict1).toContainText("Aquí vas en la vuelta 3.");
    await conflict1.getByTestId("conflict-keep-mine").click();
    await expectProgressSaved(page);
    await expect.poll(() => storedRound(admin, projectId)).toBe(3);
    await expect(counter(page)).toHaveText("Vuelta 3 de 8");
    await context.close();
  });

  test("pasar a la versión actual tras editar el diseño: avisa qué cambia antes de confirmar (F3-12)", async ({ page, admin }) => {
    const title = unique("Repin");
    const patternId = await createFromTemplate(page, title);
    const projectId = await startFromStudio(page);
    await page.getByTestId("knit-next").click();
    await page.getByTestId("knit-next").click();
    await expectProgressSaved(page);
    const before = (await admin.from("projects").select("pattern_version_id").eq("id", projectId).single()).data?.pattern_version_id;

    // Sin cambios en el diseño, la ficha no ofrece pasar de versión.
    await page.goto(`/proyectos/${projectId}`);
    await expect(page.getByTestId("project-progress")).toContainText("Vuelta 3 de 8");
    await expect(page.getByTestId("project-version")).toHaveText("versión 1");
    await expect(page.getByTestId("repin-open")).toHaveCount(0);

    // Se edita la vuelta 3 del diseño (la fila en la que va el proyecto).
    await page.goto(`/disenos/${patternId}`);
    await waitForStudio(page);
    const g = await chartGeom(page);
    await focusChart(page);
    await page.keyboard.press("2");
    const cell: Cell = [0, 2];
    await clickCell(page, g, cell);
    await expect(saveStatus(page)).not.toHaveAttribute("data-save-status", "saved");
    await expectSaved(page);
    expect((await storedPattern(admin, patternId))?.document.chart.cells[2 * 8]).toBe(1);

    // El proyecto sigue en su versión fijada; la ficha avisa y muestra qué cambia antes de confirmar.
    await page.goto(`/proyectos/${projectId}`);
    await expect(page.getByTestId("project-version")).toContainText("Hay una versión más nueva del diseño");
    await page.getByTestId("repin-open").click();
    const details = page.getByTestId("repin-details");
    await expect(details).toContainText("Tu avance ahora: la vuelta 3. Después del cambio: la vuelta 3.");
    await expect(details).toContainText("La vuelta en la que vas se teje distinto en la versión nueva");
    expect((await admin.from("projects").select("pattern_version_id").eq("id", projectId).single()).data?.pattern_version_id, "ver el detalle no cambia nada").toBe(before);
    await page.getByTestId("repin-confirm").click();
    await expect(page.getByTestId("repin-done")).toHaveText("Listo: el proyecto ahora sigue la versión 2.");
    await expect(page.getByTestId("project-version")).toHaveText("versión 2");
    const after = (await admin.from("projects").select("pattern_version_id").eq("id", projectId).single()).data?.pattern_version_id;
    expect(after).not.toBe(before);
    expect(await storedRound(admin, projectId), "el avance conserva la vuelta").toBe(3);

    await page.getByTestId("project-knit").click();
    await page.waitForURL(TEJER);
    await expect(counter(page)).toHaveText("Vuelta 3 de 8");
  });

  test("empezar desde Mis diseños, borrar el proyecto con confirmación y recién entonces el diseño", async ({ page, admin }) => {
    const title = unique("Borrar proyecto");
    const patternId = await createFromTemplate(page, title);
    await page.goto("/disenos");
    await page.getByRole("button", { name: `Tejer ${title}`, exact: true }).click();
    await expect(page.getByTestId("knit-dialog").getByTestId("knit-preview")).toBeVisible();
    await page.getByTestId("knit-confirm").click();
    await page.waitForURL(TEJER, { timeout: 20_000 });
    const projectId = TEJER.exec(new URL(page.url()).pathname)?.[1] ?? "";
    await expect(counter(page)).toHaveText("Vuelta 1 de 8");

    // Con un proyecto, el diseño no se borra y el mensaje remite a los proyectos.
    await page.goto("/disenos");
    await page.getByRole("button", { name: `Borrar ${title}`, exact: true }).click();
    await page.getByRole("group", { name: `Confirmar borrado de ${title}` }).getByRole("button", { name: "Sí, borrar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Este diseño tiene 1 proyecto" })).toBeVisible();
    expect(await storedPattern(admin, patternId)).not.toBeNull();
    await page.getByRole("link", { name: "Ir a tus proyectos" }).click();
    await page.waitForURL("**/proyectos");

    // Borrar el proyecto: la confirmación dice que se pierde el avance; cancelar no borra.
    const card = page.getByTestId("project-card").filter({ hasText: title });
    await expect(card.getByTestId("project-progress")).toHaveText("Vuelta 1 de 8");
    await card.getByRole("button", { name: `Borrar ${title}`, exact: true }).click();
    const confirm = page.getByRole("group", { name: `Confirmar borrado de ${title}` });
    await expect(confirm).toContainText("Se pierde el avance guardado y no se puede deshacer.");
    await confirm.getByRole("button", { name: "Cancelar" }).click();
    expect((await admin.from("projects").select("id").eq("id", projectId)).data).toHaveLength(1);
    await card.getByRole("button", { name: `Borrar ${title}`, exact: true }).click();
    await confirm.getByRole("button", { name: "Sí, borrar" }).click();
    await expect(page.getByText(`Borraste «${title}».`)).toBeVisible();
    await expect(card).toHaveCount(0);
    expect((await admin.from("projects").select("id").eq("id", projectId)).data).toHaveLength(0);
    expect((await admin.from("project_progress").select("project_id").eq("project_id", projectId)).data).toHaveLength(0);

    // Ahora sí se borra el diseño.
    await page.goto("/disenos");
    await page.getByRole("button", { name: `Borrar ${title}`, exact: true }).click();
    await page.getByRole("group", { name: `Confirmar borrado de ${title}` }).getByRole("button", { name: "Sí, borrar" }).click();
    await expect(page.getByText(`Borraste «${title}».`)).toBeVisible();
    expect(await storedPattern(admin, patternId)).toBeNull();
  });

  test("si el diseño cambia con la pantalla previa abierta, se recalcula y pide confirmar de nuevo (ADR 0009, T1-7)", async ({ page, admin }) => {
    const title = unique("Cambia mientras");
    const patternId = await createFromTemplate(page, title);
    await page.goto("/disenos");
    await page.getByRole("button", { name: `Tejer ${title}`, exact: true }).click();
    await expect(page.getByTestId("knit-preview")).toBeVisible();
    // Otra pestaña guarda el diseño (el disparador avanza `updated_at`).
    const before = (await storedPattern(admin, patternId))?.updated_at;
    const { error } = await admin.from("patterns").update({ visibility: "private" }).eq("id", patternId);
    expect(error).toBeNull();
    expect((await storedPattern(admin, patternId))?.updated_at).not.toBe(before);

    await page.getByTestId("knit-confirm").click();
    await expect(page.getByTestId("knit-recalculated")).toContainText("El diseño cambió mientras esta pantalla estaba abierta");
    expect((await admin.from("projects").select("id").eq("pattern_id", patternId)).data, "no se creó nada todavía").toHaveLength(0);
    await page.getByTestId("knit-confirm").click();
    await page.waitForURL(TEJER, { timeout: 20_000 });
    expect((await admin.from("projects").select("id").eq("pattern_id", patternId)).data).toHaveLength(1);
  });

  test("un diseño con un error de tejido no se puede tejer: explica qué lo impide y enlaza al estudio (F3-38)", async ({ page, admin }) => {
    const title = unique("No tejible");
    const patternId = await createFromTemplate(page, title);
    const g = await chartGeom(page);
    await focusChart(page);
    await page.keyboard.press("s"); // herramienta "sin punto"
    await strokeThrough(page, g, Array.from({ length: g.cols }, (_, x) => [x, 0] as const));
    await expect(saveStatus(page)).toContainText("Guardado como borrador", { timeout: 10_000 });

    await page.goto("/disenos");
    await page.getByRole("button", { name: `Tejer ${title}`, exact: true }).click();
    const blocked = page.getByTestId("knit-not-knittable");
    await expect(blocked).toContainText("errores de tejido que impiden tejerlo");
    await expect(blocked.getByRole("listitem").first()).toBeVisible();
    await expect(page.getByTestId("knit-confirm")).toHaveCount(0);
    expect((await admin.from("projects").select("id").eq("pattern_id", patternId)).data, "no se creó ningún proyecto").toHaveLength(0);
    await blocked.getByRole("link", { name: "Abrir en el estudio" }).click();
    await page.waitForURL(`**/disenos/${patternId}`);
    await waitForStudio(page);

    // Desde el estudio, lo mismo (el servidor decide).
    await openDesignSection(page);
    await page.getByTestId("knit-from-studio").getByRole("button", { name: "Tejer este diseño" }).click();
    await expect(page.getByTestId("knit-not-knittable")).toBeVisible();
  });
});
