import { expect, stateFile, test } from "./support.ts";

// T13: diseños escritos (amigurumi) con sesión. Crear desde /disenos/nuevo, borrador con una vuelta que no cuadra,
// recarga y "Tejer" fuera (decisión 8 de la fase 4; CA4-M4 y CA4-V7). Cuenta: ana.
test.use({ storageState: stateFile("ana") });

const unique = (base: string) => `${base} ${Date.now().toString(36)}`;

test.describe("Diseños escritos con sesión", () => {
  test("crear un amigurumi, dejarlo como borrador con una vuelta que no cuadra, recargar y ver que no se puede tejer", async ({ page, admin }) => {
    const title = unique("Osito");
    await page.goto("/disenos/nuevo");
    await page.getByRole("radio", { name: /Amigurumi/ }).check();
    await page.getByLabel("Nombre del diseño", { exact: true }).fill(title);
    await page.getByRole("button", { name: "Crear amigurumi" }).click();
    await page.waitForURL(/\/disenos\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const id = /\/disenos\/([0-9a-f-]{36})$/.exec(new URL(page.url()).pathname)?.[1] ?? "";
    await expect(page.getByTestId("written-title")).toHaveText(title);

    const { data: row } = await admin.from("patterns").select("kind, technique, schema_version, origin, document").eq("id", id).single();
    expect(row).toMatchObject({ kind: "written", technique: "crochet", schema_version: 2, origin: "manual" });
    await expect(page.getByTestId("written-draft")).toHaveCount(0);

    // Sin el editor (T14), la vuelta que no cuadra se escribe en la base: V2 de 12 pb sobre 6 puntos.
    const document = row!.document as { parts: { rounds: unknown[] }[] };
    document.parts[0]!.rounds.push({ number: 2, items: [{ type: "stitch", stitch: "sc", count: 12 }], expected: 12 });
    const { error } = await admin.from("patterns").update({ document }).eq("id", id);
    expect(error).toBeNull();

    await page.reload();
    await expect(page.getByTestId("written-title")).toHaveText(title);
    await expect(page.getByTestId("written-draft")).toBeVisible();
    await expect(page.getByTestId("knit-written-notice")).toContainText("llega en una próxima versión");
    await expect(page.getByRole("button", { name: /Tejer/ })).toHaveCount(0);
    await expect(page.getByTestId("knit-start")).toHaveCount(0);

    // La lista muestra el tipo y no ofrece "Tejer" para el escrito.
    await page.goto("/disenos");
    const card = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: title, exact: true }) });
    await expect(card.getByTestId("design-kind")).toHaveText("Amigurumi (escrito)");
    await expect(card.getByTestId("knit-start")).toHaveCount(0);
  });
});
