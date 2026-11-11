import type { Page } from "@playwright/test";
import type { PerfSummary } from "../src/lib/studio/perf.ts";
import { expect, nextFrames, openStudio, previewHash, test, undoButton, yarnHexes } from "./support/estudio.ts";

/*
 * QA del grupo C de la fase 3 (T8 y T9) sin sesión, sobre `/dev/estudio`:
 *  - el selector de lanas se usa entero con el teclado (CA3-A2, CA3-L3, CA3-L5): abrir, pestañas con flechas, grosor,
 *    paleta con foco itinerante (una sola parada de Tab), elegir con Enter, Esc, y un paso de deshacer por elección;
 *  - en táctil (proyecto `movil`), tocar una muestra elige sin vista previa (0 mediciones `hover`) y se deshace;
 *  - "Colores planos" sobrevive a recargar (localStorage).
 */

const picker = (page: Page) => page.getByTestId("yarn-picker");
const swatches = (page: Page) => page.locator("[data-testid=color-picker] [data-swatch]");
const focusedSwatch = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.swatch ?? null);

async function perfSummary(page: Page): Promise<PerfSummary> {
  return page.evaluate(() => (window as unknown as { __loopitaPerf: { summary(): PerfSummary } }).__loopitaPerf.summary());
}

/** Cuántos pasos de deshacer hay (los recorre con el botón y los rehace para dejar todo como estaba). */
async function undoDepth(page: Page): Promise<number> {
  let n = 0;
  while (await undoButton(page).isEnabled()) {
    await undoButton(page).click();
    n++;
    if (n > 50) break;
  }
  for (let i = 0; i < n; i++) await page.getByRole("button", { name: "Rehacer", exact: true }).click();
  return n;
}

test.describe("Selector de lanas con teclado (QA grupo C)", () => {
  test("abrir, pestañas, grosor, paleta y elegir solo con teclado; Esc devuelve el foco; un paso por elección", async ({ page }) => {
    await openStudio(page);
    const hexA = (await yarnHexes(page))[0]!.hex;
    const edit = page.getByRole("button", { name: "Editar lana A", exact: true });
    await edit.focus();
    await page.keyboard.press("Enter");
    await expect(picker(page)).toBeVisible();

    // Pestañas: flechas mueven el foco y la selección; Home vuelve a la primera.
    const adjust = page.getByRole("tab", { name: "Ajustar la lana" });
    const saved = page.getByRole("tab", { name: "Mis lanas" });
    await adjust.focus();
    await page.keyboard.press("ArrowRight");
    await expect(saved).toBeFocused();
    await expect(saved).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home");
    await expect(adjust).toBeFocused();
    await expect(adjust).toHaveAttribute("aria-selected", "true");
    // Solo la pestaña activa es parada de Tab (patrón de pestañas).
    expect(await page.getByRole("tab").evaluateAll((els) => els.filter((e) => (e as HTMLElement).tabIndex === 0).length)).toBe(1);

    // Grosor: escribir y elegir con Enter desde el teclado.
    await page.getByTestId("weight-search").focus();
    await page.keyboard.type("aran");
    const first = page.locator("[data-testid=weight-list] button").first();
    await expect(first).toHaveAttribute("data-weight", "4");
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("yarn-announcement")).toHaveText(/grosor 4/);

    // Paleta: una sola parada de Tab (foco itinerante), 48 muestras con nombre.
    await expect(swatches(page)).toHaveCount(48);
    expect(await swatches(page).evaluateAll((els) => els.filter((e) => (e as HTMLElement).tabIndex === 0).length)).toBe(1);
    expect(await swatches(page).evaluateAll((els) => els.every((e) => (e.getAttribute("aria-label") ?? "").length > 0))).toBe(true);
    // Llegar a la paleta con Tab desde el campo de búsqueda (sin ratón).
    await page.getByTestId("weight-search").focus();
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = (await focusedSwatch(page)) !== null;
    }
    expect(reached, "Tab llega a la paleta").toBe(true);
    const start = await focusedSwatch(page);
    const base = await previewHash(page);
    await page.keyboard.press("ArrowRight");
    const right = await focusedSwatch(page);
    expect(right).not.toBe(start);
    await page.keyboard.press("ArrowDown");
    const down = await focusedSwatch(page);
    expect(down).not.toBe(right);
    await nextFrames(page, 2);
    expect(await previewHash(page), "el foco con teclado previsualiza").not.toBe(base);
    expect((await yarnHexes(page))[0]!.hex, "previsualizar no escribe").toBe(hexA);
    await page.keyboard.press("End");
    await page.keyboard.press("Home");
    const home = await focusedSwatch(page);
    expect(home).not.toBeNull();

    // Elegir con Enter: escribe y queda marcado sin depender del color (aria-pressed y ✓).
    await page.keyboard.press("Enter");
    const chosen = page.locator(`[data-swatch="${home}"]`);
    await expect(chosen).toHaveAttribute("aria-pressed", "true");
    await expect(chosen).toContainText("✓");
    await nextFrames(page, 2);
    expect((await yarnHexes(page))[0]!.hex).not.toBe(hexA);
    await expect(page.getByTestId("yarn-announcement")).toHaveText(/color/);

    // Esc cierra y el foco vuelve a "Editar lana A".
    await page.keyboard.press("Escape");
    await expect(picker(page)).toHaveCount(0);
    await expect(edit).toBeFocused();

    // Dos elecciones (grosor y color): exactamente dos pasos de deshacer; recorrer la paleta no agregó ninguno.
    expect(await undoDepth(page)).toBe(2);
  });

  test("Colores planos sobrevive a recargar (localStorage) y vuelve a apagarse", async ({ page }) => {
    await openStudio(page);
    await page.getByTestId("flat-colors").click();
    await expect(page.getByTestId("flat-colors")).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await openStudio(page);
    await expect(page.getByTestId("flat-colors")).toHaveAttribute("aria-pressed", "true");
    await expect(undoButton(page), "la preferencia no es un paso del documento").toBeDisabled();
    await page.getByTestId("flat-colors").click();
    await expect(page.getByTestId("flat-colors")).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => localStorage.getItem("loopita:vista:colores-planos"))).toBe("0");
  });
});

test.describe("Selector de lanas táctil @movil", () => {
  test("tocar una muestra elige sin vista previa (0 mediciones hover) y se puede deshacer", async ({ page }) => {
    await openStudio(page, "forma=tubo&reps=3&perf=1");
    await page.waitForFunction(() => "__loopitaPerf" in window);
    await page.getByRole("tab", { name: "Editor", exact: true }).tap();
    await page.getByRole("button", { name: "Editar lana A", exact: true }).tap();
    await expect(picker(page)).toBeVisible();
    const hexA = (await yarnHexes(page))[0]!.hex;
    await page.evaluate(() => (window as unknown as { __loopitaPerf: { reset(): void } }).__loopitaPerf.reset());

    const target = swatches(page).nth(20);
    await target.scrollIntoViewIfNeeded();
    await target.tap();
    await nextFrames(page, 3);
    await expect(target).toHaveAttribute("aria-pressed", "true");
    const after = (await yarnHexes(page))[0]!.hex;
    expect(after, "tocar elige").not.toBe(hexA);

    const s = await perfSummary(page);
    expect(s.edits.hover?.n ?? 0, "con el dedo no hay vista previa al pasar").toBe(0);

    // Un segundo toque en otra muestra tampoco previsualiza; Deshacer vuelve de a un paso.
    await swatches(page).nth(5).tap();
    await nextFrames(page, 2);
    expect((await perfSummary(page)).edits.hover?.n ?? 0).toBe(0);
    await undoButton(page).tap();
    await nextFrames(page, 2);
    expect((await yarnHexes(page))[0]!.hex).toBe(after);
    await undoButton(page).tap();
    await nextFrames(page, 2);
    expect((await yarnHexes(page))[0]!.hex).toBe(hexA);
  });
});
