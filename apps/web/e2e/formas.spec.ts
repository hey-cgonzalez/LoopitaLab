import { chart, expect, focusChart, limitations, nextFrames, openStudio, previewHash, test } from "./support/estudio.ts";

// Formas de la vista (plano, tubo, círculo), avisos de limitación (CA-F13) y numeración de columnas (E18).

test.describe("Formas", () => {
  test("círculo: la casilla sin punto de una disminución anuncia que se pierde un punto", async ({ page }) => {
    await openStudio(page, "forma=circulo");
    await focusChart(page);
    // Copa del estudio de desarrollo: en la vuelta 8 la décima casilla de cada repetición es una disminución.
    for (let k = 0; k < 7; k++) await page.keyboard.press("ArrowUp");
    for (let k = 0; k < 9; k++) await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("cell-announcement")).toHaveText(/se pierde un punto/i);
    await expect(page.getByText("Triángulo: aquí se pierde un punto")).toBeVisible();

    const lim = await limitations(page);
    expect(lim, "en círculo no aplica el aviso de huecos de plano y tubo").not.toContain("huecosSinPunto");
    expect(lim).toContain("colorTrasDisminucion");
    await expect(page.getByTestId("round-counts")).toContainText(/\b(80|72)\b/);
  });

  for (const forma of ["tubo", "plano"] as const) {
    test(`${forma}: un «sin punto» muestra el aviso de huecos (CA-F13) y desaparece al deshacer`, async ({ page }) => {
      await openStudio(page, `forma=${forma}&reps=3`);
      expect(await limitations(page)).not.toContain("huecosSinPunto");
      await focusChart(page);
      await page.keyboard.press("s");
      await page.keyboard.press("Enter");
      await expect(page.locator("[data-limitation=huecosSinPunto]")).toBeVisible();
      await page.keyboard.press("Control+z");
      await expect(page.locator("[data-limitation=huecosSinPunto]")).toHaveCount(0);
    });
  }

  test("las columnas se numeran desde la derecha (E18)", async ({ page }) => {
    await openStudio(page, "forma=plano&reps=3");
    await focusChart(page);
    const ann = page.getByTestId("cell-announcement");
    // La casilla de la izquierda es la 20 y la de la derecha la 1; la fila 1 (por el derecho) se lee de derecha a izquierda.
    await expect(ann).toHaveText(/Fila 1, casilla 20/);
    await expect(ann).toContainText("se lee de derecha a izquierda");
    await page.keyboard.press("End");
    await expect(ann).toHaveText(/Fila 1, casilla 1\b/);
    await page.keyboard.press("Home");
    await expect(ann).toHaveText(/Fila 1, casilla 20/);
    await expect(page.getByText(/lectura en espejo/)).toHaveCount(0);
  });

  test("con ?espejo=1 las columnas se numeran desde la izquierda y se lee en espejo", async ({ page }) => {
    await openStudio(page, "forma=plano&reps=3&espejo=1");
    await focusChart(page);
    const ann = page.getByTestId("cell-announcement");
    await expect(ann).toHaveText(/Fila 1, casilla 1\b/);
    await expect(ann).toContainText("se lee de izquierda a derecha (lectura en espejo, para zurdas)");
    await page.keyboard.press("End");
    await expect(ann).toHaveText(/Fila 1, casilla 20/);
  });

  test("cambiar la forma desde el panel redibuja la vista previa sin errores", async ({ page }) => {
    await openStudio(page, "forma=tubo&reps=3");
    let last = await previewHash(page);
    for (const name of ["Plano", "Círculo", "Tubo"]) {
      // Radio controlado por el documento: se hace clic y se espera a que el estudio lo marque (no `check()`, que
      // exige el cambio en el mismo instante del clic).
      const radio = page.getByRole("radio", { name, exact: true });
      await radio.click();
      await expect(radio).toBeChecked();
      await nextFrames(page, 3);
      await expect(chart(page)).toBeVisible();
      await expect.poll(() => previewHash(page), `la vista previa cambia al pasar a ${name}`).not.toBe(last);
      last = await previewHash(page);
    }
  });
});
