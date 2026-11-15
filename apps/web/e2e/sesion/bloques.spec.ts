import type { Page } from "@playwright/test";
import { partText, textLines, viewerMeasures } from "../support/amigurumi.ts";
import { expect, expectSaved, stateFile, test } from "./support.ts";

/*
 * Editor de bloques con sesión (T15 de la fase 4). Cuenta: dani.
 * Editar en bloques cambia el texto y el 3D, se guarda y sobrevive a recargar; el documento guardado es el mismo que
 * produciría el texto (CA4-E3, CA4-E6).
 */
test.use({ storageState: stateFile("dani") });

const unique = (base: string) => `${base} ${Date.now().toString(36)}`;
const UUID = /\/disenos\/([0-9a-f-]{36})$/;

async function createAmigurumi(page: Page, title: string): Promise<string> {
  await page.goto("/disenos/nuevo");
  await page.getByRole("radio", { name: /Amigurumi/ }).check();
  await page.getByLabel("Nombre del diseño", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Crear amigurumi" }).click();
  await page.waitForURL(UUID, { timeout: 20_000 });
  await expect(partText(page)).toBeVisible({ timeout: 20_000 });
  return UUID.exec(new URL(page.url()).pathname)?.[1] ?? "";
}

type StoredItem = { type: string; stitch?: string; count?: number; times?: number; items?: StoredItem[] };
type StoredPart = { rounds: Array<{ number: number; items: StoredItem[]; expected?: number }> };

test.describe("Editor de bloques con sesión", () => {
  test("editar en bloques, ver el texto y el 3D, guardar y recargar", async ({ page, admin }) => {
    const id = await createAmigurumi(page, unique("Bloques"));
    const measures = await viewerMeasures(page);

    await page.getByTestId("tab-blocks").click();
    await expect(page.getByTestId("block-editor")).toBeVisible();
    await page.locator('[data-block="0:0"]').getByTestId("block-count").fill("8");
    await page.getByTestId("block-mismatch").getByRole("button", { name: "Declarar 8" }).click();
    await page.locator('[data-round="0"]').getByTestId("block-insert-after").click();
    await expect(page.getByTestId("block-round")).toHaveCount(2);
    await page.locator('[data-block="1:0"]').getByTestId("block-stitch").selectOption("inc");
    await page.locator('[data-block="1:0"]').getByTestId("block-count").fill("8");
    await page.locator('[data-block="1:0"]').getByTestId("block-wrap").click();
    await page.locator('[data-block="1:0"]').getByTestId("block-times").fill("1");
    await expect.poll(() => viewerMeasures(page)).not.toBe(measures);

    // El texto sigue a los bloques.
    await page.getByTestId("tab-text").click();
    await expect.poll(async () => (await textLines(page)).filter((l) => /^V[12]:/.test(l))).toEqual(["V1: 8 pb (8)", "V2: [8 aum] x1"]);

    await expectSaved(page);
    const { data } = await admin.from("patterns").select("document").eq("id", id).single();
    const part = (data!.document as { parts: StoredPart[] }).parts[0]!;
    expect(part.rounds.map((r) => r.number)).toEqual([1, 2]);
    expect(part.rounds[0]).toMatchObject({ items: [{ type: "stitch", stitch: "sc", count: 8 }], expected: 8 });
    expect(part.rounds[1]!.items).toEqual([{ type: "group", times: 1, items: [{ type: "stitch", stitch: "inc", count: 8 }] }]);

    // Recargar: los mismos bloques y el mismo texto.
    await page.reload();
    await expect(partText(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("recovery-banner")).toHaveCount(0);
    await page.getByTestId("tab-blocks").click();
    await expect(page.locator('[data-block="1:0"]')).toHaveAttribute("data-type", "group");
    await expect(page.locator('[data-block="1:0.0"]').getByTestId("block-count")).toHaveValue("8");
    await expect(page.getByTestId("block-round-count").nth(1)).toHaveAttribute("data-produced", "16");

    // Una acción más, un paso de deshacer, y guardar de nuevo.
    await page.locator('[data-block="1:0"]').getByTestId("block-times").fill("3");
    await expect(page.getByTestId("block-round-count").nth(1)).toHaveAttribute("data-produced", "48");
    await page.getByTestId("undo").click();
    await expect(page.getByTestId("block-round-count").nth(1)).toHaveAttribute("data-produced", "16");
    await expectSaved(page);
  });

  test("las líneas sin leer piden elegir antes de pasar a bloques, también con el respaldo recuperado", async ({ page, accounts }) => {
    const id = await createAmigurumi(page, unique("Sin leer"));
    const key = `loopitalab:${accounts.dani.id}:diseno:${id}`;
    await page.getByTestId("part-text").evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    await page.keyboard.type("\nV2: zzz");
    await expect.poll(() => page.evaluate((k) => window.localStorage.getItem(k) ?? "", key)).toContain("V2: zzz");
    await page.getByTestId("tab-blocks").click();
    await expect(page.getByTestId("unread-dialog")).toBeVisible();
    await page.getByTestId("unread-dialog").getByRole("button", { name: "Volver al texto" }).click();
    await expect(partText(page)).toHaveValue(/V2: zzz/);
    await page.getByTestId("tab-blocks").click();
    await page.getByTestId("unread-dialog").getByRole("button", { name: "Descartar las líneas sin leer" }).click();
    await expect(page.getByTestId("block-editor")).toBeVisible();
    await expect.poll(() => page.evaluate((k) => window.localStorage.getItem(k) ?? "", key)).not.toContain("zzz");
  });
});
