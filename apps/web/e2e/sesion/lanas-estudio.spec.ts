import type { SupabaseClient } from "@supabase/supabase-js";
import { nextFrames, previewHash, undoButton, yarnHexes } from "../support/estudio.ts";
import { createFromTemplate, expect, expectSaved, stateFile, test } from "./support.ts";

// Usar una lana guardada desde el selector del estudio (T9 de la fase 3, ADR 0008 §5). Cuenta: dani (aparte, para no
// tocar la lista vacía que espera `lanas.spec.ts`).
test.use({ storageState: stateFile("dani") });
test.describe.configure({ mode: "serial" });

const unique = (base: string) => `${base} ${Date.now().toString(36)}`;
const NOTE = "Marca X, comprada en la feria";

async function seedYarn(admin: SupabaseClient, owner: string): Promise<void> {
  await admin.from("user_yarns").delete().eq("owner_id", owner);
  const { error } = await admin.from("user_yarns").insert({
    owner_id: owner,
    weight: 5,
    composition: [{ fiber: "lana", percent: 70 }, { fiber: "mohair", percent: 30 }],
    color_hex: "#123456",
    palette_id: null,
    note: NOTE,
  });
  expect(error, "sembrar la lana guardada").toBeNull();
}

async function storedYarns(admin: SupabaseClient, id: string): Promise<{ id: string; weight: number; composition: { fiber: string; percent: number }[]; color: { hex: string }; note?: string }[]> {
  const { data } = await admin.from("patterns").select("document").eq("id", id).single();
  return (data as { document: { yarns: never[] } }).document.yarns;
}

test.describe("Mis lanas dentro del estudio", () => {
  test("usar una lana guardada: copia grosor, composición y color; la nota no viaja; se guarda y se deshace", async ({ page, admin, accounts }) => {
    await seedYarn(admin, accounts.dani.id);
    const id = await createFromTemplate(page, unique("Con lana guardada"));
    const before = (await yarnHexes(page))[0]!.hex;

    await page.getByRole("button", { name: "Editar lana A", exact: true }).click();
    await page.getByRole("tab", { name: "Mis lanas" }).click();
    const item = page.getByTestId("saved-yarn");
    await expect(item).toHaveCount(1);
    await expect(item).toContainText("70 % Lana, 30 % Mohair");

    // Pasar el cursor: la vista previa la muestra, el documento no cambia.
    const base = await previewHash(page);
    await item.getByRole("button", { name: /^Usar en la lana A/ }).hover();
    await nextFrames(page, 2);
    expect(await previewHash(page)).not.toBe(base);
    expect((await yarnHexes(page))[0]!.hex).toBe(before);

    await item.getByRole("button", { name: /^Usar en la lana A/ }).click();
    await nextFrames(page, 2);
    expect((await yarnHexes(page))[0]!.hex).toBe("#123456");
    await expect(page.getByTestId("yarn-announcement")).toHaveText(/lana guardada/);
    await expectSaved(page);
    await expect.poll(async () => (await storedYarns(admin, id))[0]?.color.hex).toBe("#123456");
    const [stored] = await storedYarns(admin, id);
    expect(stored).toMatchObject({ weight: 5, composition: [{ fiber: "lana", percent: 70 }, { fiber: "mohair", percent: 30 }] });
    expect(JSON.stringify(stored), "la nota privada no viaja al diseño").not.toContain("Marca X");

    // Un solo paso de deshacer.
    await undoButton(page).click();
    await nextFrames(page, 2);
    expect((await yarnHexes(page))[0]!.hex).toBe(before);
  });

  test("con la casilla marcada, la nota se copia; también se puede agregar como lana nueva", async ({ page, admin, accounts }) => {
    await seedYarn(admin, accounts.dani.id);
    const id = await createFromTemplate(page, unique("Con nota copiada"));
    await page.getByRole("button", { name: "Editar lana A", exact: true }).click();
    await page.getByRole("tab", { name: "Mis lanas" }).click();
    await page.getByTestId("copy-note").check();
    await page.getByTestId("saved-yarn").getByRole("button", { name: /^Usar en la lana A/ }).click();
    await expectSaved(page);
    await expect.poll(async () => (await storedYarns(admin, id))[0]?.note).toBe(NOTE);

    const count = (await storedYarns(admin, id)).length;
    await page.getByTestId("saved-yarn").getByRole("button", { name: /^Agregar como lana nueva/ }).click();
    await expect(page.getByTestId("yarn-announcement")).toHaveText(/Se agregó la lana/);
    await expectSaved(page);
    await expect.poll(async () => (await storedYarns(admin, id)).length).toBe(count + 1);
    const yarns = await storedYarns(admin, id);
    expect(yarns[count]?.note, "la casilla seguía marcada al agregar").toBe(NOTE);
  });

  test("sin lanas guardadas, la pestaña lo dice y enlaza a Mis lanas", async ({ page, admin, accounts }) => {
    await admin.from("user_yarns").delete().eq("owner_id", accounts.dani.id);
    await createFromTemplate(page, unique("Sin lanas"));
    await page.getByRole("button", { name: "Editar lana A", exact: true }).click();
    await page.getByRole("tab", { name: "Mis lanas" }).click();
    await expect(page.getByText("Todavía no guardaste lanas.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Administrar mis lanas" })).toHaveAttribute("href", "/lanas");
  });
});
