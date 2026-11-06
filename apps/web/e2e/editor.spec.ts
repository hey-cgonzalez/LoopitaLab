import { blurChart, cellColors, chartGeom, clickCell, expect, focusChart, nextFrames, openStudio, previewHash, redoButton, repeatsX, repeatsY, setField, strokeThrough, test, undoButton, yarnHexes, type Cell } from "./support/estudio.ts";

// Editor del motivo (T9): historial, repeticiones (CA-F1) y vista previa.

test.describe("Editor del motivo", () => {
  test("un trazo de lápiz se deshace de una vez y Rehacer lo vuelve a aplicar", async ({ page }) => {
    await openStudio(page);
    const g = await chartGeom(page);
    const cells: Cell[] = Array.from({ length: 10 }, (_, k) => [k + 2, 10] as const);
    const before = await cellColors(page, cells);
    const yarns = await yarnHexes(page);
    const d = yarns[3]?.hex;
    await expect(undoButton(page)).toBeDisabled();

    await focusChart(page);
    await page.keyboard.press("4"); // lana D
    await strokeThrough(page, g, cells);
    expect(await cellColors(page, cells)).toEqual(cells.map(() => d));

    await undoButton(page).click();
    await nextFrames(page, 2);
    expect(await cellColors(page, cells), "un solo Deshacer revierte el trazo completo").toEqual(before);
    await expect(undoButton(page), "el trazo era un único paso del historial").toBeDisabled();

    await redoButton(page).click();
    await nextFrames(page, 2);
    expect(await cellColors(page, cells)).toEqual(cells.map(() => d));
    await expect(redoButton(page)).toBeDisabled();
  });

  test("pintar una casilla en una repetición la pinta en todas (CA-F1)", async ({ page }) => {
    await openStudio(page);
    await page.getByRole("group", { name: "Vista del gráfico" }).getByRole("button", { name: "Con repeticiones" }).click();
    await nextFrames(page, 2);
    const g = await chartGeom(page);
    const w = 20; // los rombos del estudio de desarrollo miden 20 × 20
    const h = 20;
    expect(g.cols).toBe(3 * w);
    expect(g.rows).toBe(3 * h);
    // Una casilla del motivo y la misma posición en las nueve repeticiones (3 × 3).
    const [mx, my] = [5, 7];
    const same: Cell[] = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) same.push([mx + i * w, my + j * h]);
    const yarns = await yarnHexes(page);
    const before = (await cellColors(page, same))[0];
    const target = yarns.find((y) => y.hex !== before)?.hex;
    const idx = yarns.findIndex((y) => y.hex === target);
    await focusChart(page);
    await page.keyboard.press(String(idx + 1));
    // Pinta en la repetición central (2.ª a lo ancho y a lo alto).
    await clickCell(page, g, [mx + w, my + h]);
    await blurChart(page); // el anillo de foco tapa la esquina de la casilla enfocada
    expect(await cellColors(page, same)).toEqual(same.map(() => target));
    // La casilla vecina, en cualquier repetición, no cambió.
    const neighbour: Cell[] = [[mx + 1, my], [mx + 1 + 2 * w, my + 2 * h]];
    const nb = await cellColors(page, neighbour);
    expect(nb[0]).toBe(nb[1]);
  });

  test("cambiar las repeticiones actualiza la vista previa y el total de puntos", async ({ page }) => {
    await openStudio(page);
    const total = page.getByTestId("stitch-total");
    const t0 = await total.textContent();
    const h0 = await previewHash(page);

    await setField(repeatsX(page), "6");
    await expect(total).not.toHaveText(t0 ?? "");
    await expect.poll(() => previewHash(page)).not.toBe(h0);
    const t1 = await total.textContent();
    const h1 = await previewHash(page);
    // Motivo de 20 × 20: 3 × 3 repeticiones = 3.600 puntos; 6 × 3 = 7.200.
    expect(t0).toMatch(/3[.\s\u00a0]?600/);
    expect(t1).toMatch(/7[.\s\u00a0]?200/);

    await setField(repeatsY(page), "1");
    await expect.poll(() => previewHash(page)).not.toBe(h1);
    await expect(total).toHaveText(/2[.\s\u00a0]?400/); // 6 × 1 repeticiones
  });
});
