import { cellColors, chart, expect, focusChart, nextFrames, openStudio, repeatsX, repeatsY, setField, test, yarnHexes } from "./support/estudio.ts";

// Aviso de prototipo (CA-F10), accesibilidad del editor (T11) y tope de la vista previa (T10).

test.describe("Aviso de prototipo (CA-F10)", () => {
  test("queda visible arriba, al medio y al final de la página y de cada columna, y no se puede cerrar", async ({ page }) => {
    await openStudio(page);
    const notice = page.locator("[data-zone=prototype-notice]");
    await expect(notice).toContainText("Teje una muestra");
    // El estudio ocupa la ventana y cada columna desplaza por dentro (`data-column`): se desplazan la página y las columnas.
    for (const where of ["top", "middle", "bottom"] as const) {
      await page.evaluate((w) => {
        const at = (h: number) => (w === "top" ? 0 : w === "middle" ? h / 2 : h);
        window.scrollTo(0, at(document.documentElement.scrollHeight));
        for (const col of document.querySelectorAll<HTMLElement>("[data-column]")) col.scrollTop = at(col.scrollHeight);
      }, where);
      await nextFrames(page, 2);
      await expect(notice, `visible (${where})`).toBeInViewport();
    }
    await expect(notice.getByRole("button")).toHaveCount(0);
  });

  test("el estudio ocupa la ventana: la página no desplaza y el aviso no tapa las columnas", async ({ page }) => {
    for (const forma of ["tubo", "circulo"]) {
      await openStudio(page, `forma=${forma}&reps=3`);
      const m = await page.evaluate(() => {
        const d = document.documentElement;
        const notice = document.querySelector("[data-zone=prototype-notice]")!.getBoundingClientRect();
        const bottoms = [...document.querySelectorAll<HTMLElement>("[data-column]")].map((c) => c.getBoundingClientRect().bottom);
        return { sh: d.scrollHeight, ih: innerHeight, sw: d.scrollWidth, cw: d.clientWidth, noticeTop: notice.top, maxBottom: Math.max(...bottoms) };
      });
      expect(m.sh, `${forma}: sin desplazamiento vertical de la página`).toBeLessThanOrEqual(m.ih);
      expect(m.sw, `${forma}: sin desplazamiento horizontal`).toBeLessThanOrEqual(m.cw);
      expect(m.maxBottom, `${forma}: las columnas terminan sobre el aviso`).toBeLessThanOrEqual(m.noticeTop);
    }
  });
});

test.describe("Accesibilidad", () => {
  test("el editor es una aplicación con nombre y tamaño, y hay regiones vivas", async ({ page }) => {
    await openStudio(page);
    const editor = page.getByRole("application", { name: /Editor del motivo: 20 puntos de ancho y 20 vueltas de alto/ });
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute("aria-roledescription", "cuadrícula del motivo");
    await expect(editor).toHaveAttribute("tabindex", "0");

    for (const id of ["cell-announcement", "studio-announcement", "yarn-announcement"]) {
      await expect(page.getByTestId(id), `${id} es una región viva`).toHaveAttribute("aria-live", /polite|assertive/);
    }
    // La vista previa es una imagen con nombre.
    await expect(page.getByRole("img", { name: /.+/ }).first()).toBeAttached();
    // Todos los botones visibles tienen nombre accesible.
    const unnamed = await page.getByRole("button").evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).offsetParent !== null && !(e.getAttribute("aria-label") ?? e.textContent ?? "").trim()).map((e) => e.outerHTML.slice(0, 80)),
    );
    expect(unnamed).toEqual([]);
    // Botones de lana con la letra en el nombre.
    for (const name of ["Subir lana B en la lista", "Bajar lana A en la lista", "Editar lana C", "Quitar lana D"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    }
    // En escritorio no hay pestañas (las tres zonas se ven a la vez).
    await expect(page.getByRole("tablist")).toBeHidden();
  });

  test("al enfocar el editor se anuncia la casilla y por dónde se lee", async ({ page }) => {
    await openStudio(page);
    await focusChart(page);
    await expect(page.getByTestId("cell-announcement")).toHaveText(/Vuelta 1, casilla 20, .+\. Esta vuelta se lee de derecha a izquierda\./);
    await page.keyboard.press("2");
    await expect(page.getByTestId("studio-announcement")).toHaveText(/Lana B/);
  });
});

test.describe("Tope de la vista previa", () => {
  test("con repeticiones enormes muestra el aviso, la interfaz sigue respondiendo y vuelve al bajar", async ({ page }) => {
    await openStudio(page);
    await setField(repeatsX(page), "500");
    await setField(repeatsY(page), "500");
    await expect(page.getByTestId("preview-too-large")).toBeVisible();

    // La interfaz sigue viva: pintar con el teclado responde.
    const hex = await yarnHexes(page);
    await focusChart(page);
    await page.keyboard.press("2");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("cell-announcement")).toHaveText(/pintada/i);
    await chart(page).evaluate((e) => (e as HTMLElement).blur());
    await nextFrames(page, 2);
    expect(await cellColors(page, [[1, 0]])).toEqual([hex[1]?.hex]);

    await setField(repeatsX(page), "3");
    await setField(repeatsY(page), "3");
    await expect(page.getByTestId("preview-too-large")).toHaveCount(0);
    await expect(page.getByTestId("preview-canvas")).toHaveCSS("visibility", "visible");
  });
});
