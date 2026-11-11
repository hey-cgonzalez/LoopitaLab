import { blurChart, cellColors, chartGeom, clickCell, focusChart, strokeThrough, yarnHexes, type Cell } from "../support/estudio.ts";
import { createFromTemplate, expect, expectSaved, openDesignSection, saveStatus, stateFile, storedPattern, test, versionCount, waitForStudio } from "./support.ts";

// Diseños con sesión (ADR 0006): crear desde plantilla, autoguardado y recarga (CA-F6), versiones (CA-F8),
// borrador con error de tejido (E10), duplicar y borrar. Cuenta: ana.
test.use({ storageState: stateFile("ana") });

const unique = (base: string) => `${base} ${Date.now().toString(36)}`;
/** La casilla de abajo a la izquierda de la "Banda en tubo" es de fondo (lana A); la fila 1 es la de abajo. */
const CORNER: Cell = [0, 0];

/** Pinta `cell` con la lana B y devuelve el color de B. */
async function paintWithB(page: import("@playwright/test").Page, cell: Cell): Promise<string> {
  const g = await chartGeom(page);
  const b = (await yarnHexes(page))[1]?.hex ?? "";
  await focusChart(page);
  await page.keyboard.press("2"); // lana B
  await clickCell(page, g, cell);
  return b;
}

test.describe("Diseños con sesión", () => {
  test("crear desde plantilla abre el estudio; el cambio se guarda solo en ≤ 2 s y sobrevive a recargar (CA-F6)", async ({ page, admin }) => {
    const title = unique("Autoguardado");
    const id = await createFromTemplate(page, title);
    const stored = await storedPattern(admin, id);
    expect(stored?.title).toBe(title);
    expect(stored?.document.chart.cells[0], "la plantilla deja la esquina en la lana A").toBe(0);

    const action = page.waitForRequest((r) => r.method() === "POST" && r.headers()["next-action"] !== undefined, { timeout: 5_000 });
    const t0 = Date.now();
    const b = await paintWithB(page, CORNER);
    await action;
    const sentAfter = Date.now() - t0;
    expect(sentAfter, `el autoguardado se envía a los ${sentAfter} ms del cambio (tope de CA-F6: 2 s)`).toBeLessThanOrEqual(2_000);
    await expectSaved(page, 5_000);
    await expect.poll(async () => (await storedPattern(admin, id))?.document.chart.cells[0], { message: "la base tiene la lana B en la esquina" }).toBe(1);

    await page.reload();
    await waitForStudio(page);
    await blurChart(page);
    expect(await cellColors(page, [CORNER])).toEqual([b]);
    await expect(page.getByLabel("Nombre del diseño", { exact: true })).toHaveValue(title);
  });

  test("«Guardar versión» crea exactamente una versión; el autoguardado no crea ninguna (CA-F8)", async ({ page, admin }) => {
    const id = await createFromTemplate(page, unique("Versiones"));
    expect(await versionCount(admin, id), "crear y autoguardar no crean versiones").toBe(0);

    await paintWithB(page, CORNER);
    await openDesignSection(page);
    // Sin esperar el autoguardado: "Guardar versión" guarda primero lo pendiente y después toma la instantánea.
    await page.getByRole("button", { name: "Guardar versión", exact: true }).click();
    await expect(page.getByText("Versión 1 guardada.")).toBeVisible();
    expect(await versionCount(admin, id)).toBe(1);
    const { data } = await admin.from("pattern_versions").select("version, document").eq("pattern_id", id);
    expect(data?.map((v) => v.version)).toEqual([1]);
    expect((data?.[0]?.document as { chart: { cells: number[] } }).chart.cells[0], "la versión incluye el cambio recién hecho").toBe(1);

    await expectSaved(page);
    expect(await versionCount(admin, id), "sin clics de más, sigue habiendo una sola").toBe(1);
  });

  test("un diseño con un error de tejido (una vuelta sin puntos) se guarda como borrador", async ({ page, admin }) => {
    const id = await createFromTemplate(page, unique("Borrador"));
    const g = await chartGeom(page);
    await focusChart(page);
    await page.keyboard.press("s"); // herramienta "sin punto"
    const row: Cell[] = Array.from({ length: g.cols }, (_, x) => [x, 0] as const);
    await strokeThrough(page, g, row);

    await expect(saveStatus(page)).toHaveAttribute("data-save-status", "saved", { timeout: 10_000 });
    await expect(saveStatus(page)).toContainText("Guardado como borrador");
    await expect
      .poll(async () => (await storedPattern(admin, id))?.document.chart.cells.slice(0, g.cols), { message: "la vuelta 1 quedó sin puntos en la base" })
      .toEqual(row.map(() => -1));
  });

  test("duplicar y borrar en Mis diseños", async ({ page, admin }) => {
    const title = unique("Para duplicar");
    const id = await createFromTemplate(page, title);
    await page.goto("/disenos");
    await page.getByRole("button", { name: `Duplicar ${title}`, exact: true }).click();
    await page.waitForURL((u) => /\/disenos\/[0-9a-f-]{36}$/.test(u.pathname) && !u.pathname.endsWith(id));
    const copyId = new URL(page.url()).pathname.split("/").pop() ?? "";
    await waitForStudio(page);
    const copy = await storedPattern(admin, copyId);
    expect(copy?.title).toBe(`Copia de ${title}`);
    expect(copy?.document.chart.cells, "la copia tiene el mismo dibujo").toEqual((await storedPattern(admin, id))?.document.chart.cells);

    await page.goto("/disenos");
    await page.getByRole("button", { name: `Borrar Copia de ${title}`, exact: true }).click();
    await page.getByRole("group", { name: `Confirmar borrado de Copia de ${title}` }).getByRole("button", { name: "Sí, borrar" }).click();
    await expect(page.getByText(`Borraste «Copia de ${title}».`)).toBeVisible();
    await expect(page.getByRole("link", { name: `Copia de ${title}`, exact: true })).toHaveCount(0);
    expect(await storedPattern(admin, copyId)).toBeNull();
    expect(await storedPattern(admin, id), "el original sigue").not.toBeNull();
  });
});
