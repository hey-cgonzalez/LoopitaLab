import type { Page } from "@playwright/test";
import { blurChart, cellColors, chart, expect, focusChart, nextFrames, openStudio, test, toolButtons, yarnHexes, type Cell } from "./support/estudio.ts";

// Solo teclado (CA-A1, T11). El motivo es de 20 × 20 en tubo (vueltas). El foco de casilla empieza abajo a la
// izquierda (x = 0, vuelta 1); la casilla 1 es la de la derecha (E18), así que la de la izquierda es la 20.

const announcement = (page: Page) => page.getByTestId("cell-announcement");

/** Colores sin el anillo de foco encima (se quita el foco y se vuelve a poner sin mover la casilla enfocada). */
async function colorsUnfocused(page: Page, cells: readonly Cell[]): Promise<string[]> {
  await blurChart(page);
  const c = await cellColors(page, cells);
  await focusChart(page);
  return c;
}

test.describe("Teclado (CA-A1)", () => {
  test("flechas, atajos de herramienta y de lana, Enter y Mayús+flechas", async ({ page }) => {
    await openStudio(page);
    const hex = await yarnHexes(page);
    await focusChart(page);
    await expect(announcement(page)).toHaveText(/Vuelta 1, casilla 20/);

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowUp");
    await expect(announcement(page), "las flechas mueven el foco de casilla").toHaveText(/Vuelta 2, casilla 18/);

    for (const [key, label] of [["r", "Relleno"], ["c", "Cuentagotas"], ["s", "Sin punto"], ["l", "Lápiz"]] as const) {
      await page.keyboard.press(key);
      await expect(toolButtons(page).and(page.locator("[aria-pressed=true]")), `la tecla ${key.toUpperCase()} activa ${label}`).toHaveAccessibleName(label);
    }

    await page.keyboard.press("3");
    await expect(page.getByTestId("active-yarn")).toContainText("Lana C");
    await page.keyboard.press("9"); // no hay lana 9: no cambia
    await expect(page.getByTestId("active-yarn")).toContainText("Lana C");

    // Enter pinta la casilla enfocada (x = 2, vuelta 2) con la lana C.
    await page.keyboard.press("Enter");
    await expect(announcement(page)).toHaveText(/pintada/i);
    expect(await colorsUnfocused(page, [[2, 1]])).toEqual([hex[2]?.hex]);

    // Mayús + flechas: pinta las casillas recorridas con la lana B; todo el recorrido es un solo paso del historial.
    await page.keyboard.press("2");
    const run: Cell[] = [[3, 1], [4, 1], [5, 1], [6, 1]];
    const before = await colorsUnfocused(page, run);
    await page.keyboard.down("Shift");
    for (let k = 0; k < 4; k++) await page.keyboard.press("ArrowRight");
    await page.keyboard.up("Shift");
    await expect(announcement(page)).toHaveText(/pintada/i);
    expect(await colorsUnfocused(page, run)).toEqual(run.map(() => hex[1]?.hex));

    await page.keyboard.press("Control+z");
    await nextFrames(page, 2);
    expect(await colorsUnfocused(page, run), "Ctrl+Z deshace el recorrido de una vez").toEqual(before);
    expect(await colorsUnfocused(page, [[2, 1]]), "y no deshace además el Enter anterior").toEqual([hex[2]?.hex]);

    await page.keyboard.press("Control+Shift+Z");
    await nextFrames(page, 2);
    expect(await colorsUnfocused(page, run), "Ctrl+Mayús+Z rehace").toEqual(run.map(() => hex[1]?.hex));

    await page.keyboard.press("Meta+z");
    await nextFrames(page, 2);
    expect(await colorsUnfocused(page, run), "Cmd+Z deshace").toEqual(before);

    await page.keyboard.press("Control+y");
    await nextFrames(page, 2);
    expect(await colorsUnfocused(page, run), "Ctrl+Y rehace").toEqual(run.map(() => hex[1]?.hex));

    // Dentro de un campo de texto, Ctrl+Z es del campo, no del dibujo.
    await page.getByLabel("Puntos en 10 cm").focus();
    await page.keyboard.press("Control+z");
    await nextFrames(page, 2);
    expect(await cellColors(page, run)).toEqual(run.map(() => hex[1]?.hex));
  });

  test("«Saltar al editor» es lo primero con Tab y lleva el foco a la cuadrícula", async ({ page }) => {
    await openStudio(page);
    await page.keyboard.press("Tab");
    const skip = page.getByTestId("skip-to-editor");
    await expect(skip).toBeFocused();
    await expect(skip).toHaveText("Saltar al editor");
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(chart(page)).toBeFocused();
    // Mayús+Tab sale del editor hacia atrás (no lo atrapa).
    await page.keyboard.press("Shift+Tab");
    await expect(chart(page)).not.toBeFocused();
  });

  test("Tab recorre toda la página sin trampas y pasa por el editor", async ({ page }) => {
    await openStudio(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const seen: string[] = [];
    let reachedEditor = false;
    let left = false;
    for (let k = 0; k < 400; k++) {
      await page.keyboard.press("Tab");
      const id = await page.evaluate(() => {
        const e = document.activeElement;
        if (!e || e === document.body) return "BODY";
        const w = window as unknown as { __e2eIds?: WeakMap<Element, number>; __e2eN?: number };
        w.__e2eIds ??= new WeakMap();
        w.__e2eN ??= 0;
        if (!w.__e2eIds.has(e)) w.__e2eIds.set(e, ++w.__e2eN);
        return `${w.__e2eIds.get(e)}:${e.tagName}:${(e as HTMLElement).dataset.testid ?? ""}:${(e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 30)}`;
      });
      if (id.includes(":chart-canvas:")) reachedEditor = true;
      if (id === "BODY") {
        if (k > 3) {
          left = true;
          break;
        }
        continue;
      }
      // Volver a un control ya visitado antes de salir de la página sería una trampa (o un ciclo).
      expect(seen, `el foco volvió a ${id} sin salir de la página`).not.toContain(id);
      seen.push(id);
    }
    expect(reachedEditor, "Tab llega al editor").toBe(true);
    expect(left, `Tab sale de la página después de ${seen.length} controles`).toBe(true);
    expect(seen.length).toBeGreaterThan(20);
    test.info().annotations.push({ type: "controles enfocables", description: String(seen.length) });
  });
});
