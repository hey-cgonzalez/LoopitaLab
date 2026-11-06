import type { Page } from "@playwright/test";
import { chart, expect, openStudio, test } from "./support/estudio.ts";

// 390 px (proyecto "movil"): pestañas Editor / Vista previa / Ajustes y sin desplazamiento horizontal.

async function horizontalOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
}

test.describe("Móvil 390 px @movil", () => {
  test("cada pestaña muestra solo su panel y no hay desplazamiento horizontal", async ({ page }) => {
    await openStudio(page);
    const tabs = page.getByRole("tablist");
    await expect(tabs).toBeVisible();
    for (const name of ["Editor", "Vista previa", "Ajustes"]) {
      const tab = tabs.getByRole("tab", { name, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tabpanel")).toHaveCount(1);
      await expect(page.getByRole("tabpanel")).toBeVisible();
      const o = await horizontalOverflow(page);
      expect(o.scrollWidth, `sin desplazamiento horizontal en ${name}`).toBeLessThanOrEqual(o.clientWidth);
    }
  });

  test("las flechas mueven entre pestañas y «Saltar al editor» vuelve a la cuadrícula", async ({ page }) => {
    await openStudio(page);
    await page.getByRole("tab", { name: "Ajustes", exact: true }).click();
    await page.getByRole("tab", { name: "Ajustes", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    const editorTab = page.getByRole("tab", { name: "Editor", exact: true });
    await expect(editorTab, "desde la última pestaña la flecha vuelve a la primera").toBeFocused();
    await expect(editorTab).toHaveAttribute("aria-selected", "true");

    await page.getByRole("tab", { name: "Vista previa", exact: true }).click();
    await expect(chart(page)).toBeHidden();
    // El enlace es el primer elemento enfocable del estudio (ver teclado.spec.ts); aquí se activa desde otra pestaña.
    const skip = page.getByTestId("skip-to-editor");
    await skip.focus();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(chart(page)).toBeFocused();
    await expect(editorTab).toHaveAttribute("aria-selected", "true");
  });

  test("con el editor de una lana y la confirmación de quitar abiertos, sigue sin desplazamiento horizontal", async ({ page }) => {
    await openStudio(page);
    await page.getByRole("button", { name: "Editar lana A", exact: true }).click();
    await page.getByRole("button", { name: "Quitar lana B", exact: true }).click();
    await expect(page.locator("[data-zone=yarns] select[id^=replace-]")).toBeVisible();
    const o = await horizontalOverflow(page);
    expect(o.scrollWidth).toBeLessThanOrEqual(o.clientWidth);
  });

  test("el aviso de prototipo se ve en el móvil", async ({ page }) => {
    await openStudio(page);
    await expect(page.locator("[data-zone=prototype-notice]")).toBeInViewport();
  });
});
