import type { Page } from "@playwright/test";
import { blurChart, cellColors, chartGeom, clickCell, focusChart, yarnHexes, type Cell } from "../support/estudio.ts";
import { createFromTemplate, expect, expectSaved, saveStatus, stateFile, storedPattern, test, waitForStudio } from "./support.ts";

// Conflicto entre dos pestañas del mismo diseño (ADR 0006, concurrencia optimista): la segunda que guarda recibe el
// aviso y elige. Nunca se sobrescribe en silencio. Cuenta: ana.
test.use({ storageState: stateFile("ana") });

// Tres casillas de fondo (lana A) de la fila 1 de la "Banda en tubo".
const FIRST: Cell = [0, 0];
const SECOND: Cell = [7, 0];
const THIRD: Cell = [1, 0];
const idx = ([x, y]: Cell) => y * 8 + x;

async function paintB(page: Page, cell: Cell): Promise<void> {
  await page.bringToFront();
  const g = await chartGeom(page);
  await focusChart(page);
  await page.keyboard.press("2");
  await clickCell(page, g, cell);
}

const conflict = (page: Page) => page.getByRole("alert", { name: "Conflicto al guardar" });

test("conflicto entre dos pestañas: aviso, «Sobrescribir» y «Recargar»", async ({ page, context, admin, watch }) => {
  const id = await createFromTemplate(page, `Conflicto ${Date.now().toString(36)}`);
  const other = await context.newPage();
  watch(other);
  await other.goto(`/disenos/${id}`);
  await waitForStudio(other);

  // Pestaña 1 guarda primero.
  await paintB(page, FIRST);
  await expectSaved(page);

  // Pestaña 2 todavía tiene el updated_at viejo: su guardado choca.
  await paintB(other, SECOND);
  await expect(conflict(other)).toBeVisible({ timeout: 10_000 });
  await expect(conflict(other)).toContainText("Este diseño se cambió en otra pestaña o dispositivo.");
  await expect(conflict(other).getByRole("button", { name: "Recargar la versión guardada" })).toBeVisible();
  const before = await storedPattern(admin, id);
  expect(before?.document.chart.cells[idx(FIRST)], "el conflicto no escribió nada").toBe(1);
  expect(before?.document.chart.cells[idx(SECOND)]).toBe(0);

  // Sobrescribir: queda la versión de la pestaña 2 (sin el cambio de la pestaña 1).
  await conflict(other).getByRole("button", { name: "Sobrescribir con mi versión" }).click();
  await expectSaved(other);
  await expect(conflict(other)).toHaveCount(0);
  const after = await storedPattern(admin, id);
  expect(after?.document.chart.cells[idx(SECOND)]).toBe(1);
  expect(after?.document.chart.cells[idx(FIRST)], "sobrescribir reemplaza lo guardado desde la otra pestaña").toBe(0);

  // Ahora la pestaña 1 es la desactualizada: recargar trae la versión guardada y descarta su cambio.
  await paintB(page, THIRD);
  await expect(conflict(page)).toBeVisible({ timeout: 10_000 });
  await conflict(page).getByRole("button", { name: "Recargar la versión guardada" }).click();
  await page.waitForLoadState("load");
  await waitForStudio(page);
  await expect(conflict(page)).toHaveCount(0);
  await expect(saveStatus(page)).toHaveAttribute("data-save-status", "saved");
  await blurChart(page);
  const [a, b] = (await yarnHexes(page)).map((y) => y.hex);
  expect(await cellColors(page, [FIRST, SECOND, THIRD])).toEqual([a, b, a]);
  expect((await storedPattern(admin, id))?.document.chart.cells[idx(THIRD)], "recargar no guardó el cambio descartado").toBe(0);
});
