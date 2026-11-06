import { cellColors, expect, nextFrames, openStudio, setField, test, undoButton, yarnHexes, type Cell } from "./support/estudio.ts";

// Lanas (quitar con reemplazo, T9) y muestra supuesta (CA-F4, regla de oro 6).

test.describe("Lanas", () => {
  test("quitar una lana pide reemplazo, cambia sus casillas y se deshace", async ({ page }) => {
    await openStudio(page);
    const hex = await yarnHexes(page);
    expect(hex.map((y) => y.letter)).toEqual(["A", "B", "C", "D"]);
    const all: Cell[] = [];
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) all.push([x, y]);
    const colors = await cellColors(page, all);
    const bCells = all.filter((_, i) => colors[i] === hex[1]?.hex).slice(0, 5);
    const aCells = all.filter((_, i) => colors[i] === hex[0]?.hex).slice(0, 3);
    expect(bCells.length, "el motivo tiene casillas con la lana B").toBeGreaterThan(0);

    const yarns = page.locator("[data-zone=yarns]");
    const remove = page.getByRole("button", { name: "Quitar lana B", exact: true });
    await expect(remove).toHaveAccessibleName("Quitar lana B");

    // Abrir la confirmación lleva el foco a la lista de reemplazo; Esc la cierra y devuelve el foco al botón.
    await remove.click();
    const select = yarns.locator("select[id^=replace-]");
    await expect(select).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(select).toHaveCount(0);
    await expect(remove).toBeFocused();

    await remove.click();
    await select.selectOption({ label: "Lana C" });
    await page.getByRole("button", { name: "Quitar y reemplazar" }).click();
    await nextFrames(page, 2);

    const after = await yarnHexes(page);
    expect(after.map((y) => y.letter)).toEqual(["A", "B", "C"]);
    expect(after[1]?.hex, "la antigua C pasa a ser la B").toBe(hex[2]?.hex);
    expect(await cellColors(page, bCells), "las casillas que eran B quedan con la antigua C").toEqual(bCells.map(() => hex[2]?.hex));
    expect(await cellColors(page, aCells), "las casillas A no cambian").toEqual(aCells.map(() => hex[0]?.hex));
    await expect(page.getByTestId("yarn-announcement")).toHaveText(/Se quitó la lana B/);

    await undoButton(page).click();
    await nextFrames(page, 2);
    expect((await yarnHexes(page)).map((y) => y.hex)).toEqual(hex.map((y) => y.hex));
    expect(await cellColors(page, bCells)).toEqual(bCells.map(() => hex[1]?.hex));
  });
});

test.describe("Muestra", () => {
  test("sin muestra, el panel, las medidas y la vista previa la marcan como supuesta (CA-F4)", async ({ page }) => {
    await openStudio(page);
    await expect(page.getByTestId("assumed-gauge")).toHaveCount(0);
    await expect(page.getByTestId("preview-assumed")).toHaveCount(0);

    await setField(page.getByLabel("Puntos en 10 cm"), "");
    await setField(page.getByLabel("Filas en 10 cm"), "");

    await expect(page.getByTestId("assumed-gauge")).toContainText("Muestra supuesta");
    await expect(page.getByTestId("preview-assumed")).toBeVisible();
    await expect(page.getByTestId("measures")).toContainText(/supuest/i);
  });
});
