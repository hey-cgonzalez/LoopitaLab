import { contextAs, expect, stateFile, test } from "./support.ts";
import { STUDIO_TEXTS } from "../../src/lib/studio-texts.ts";

// Mis lanas (T10, ADR 0008): crear, editar y borrar una lana guardada y aislamiento entre cuentas. Cuenta: ana.
test.use({ storageState: stateFile("ana") });

const unique = (base: string) => `${base} ${Date.now().toString(36)}`;

test.describe("Mis lanas con sesión", () => {
  test("crear, editar y borrar; aislamiento entre ana y bea", async ({ page, browser, watch }) => {
    const note = unique("Compra de ana, lote");
    const edited = unique("Nota editada de ana");

    await page.goto("/lanas");
    await expect(page.getByRole("heading", { name: "Mis lanas", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Mis lanas" })).toBeVisible();
    await expect(page.getByText("Todavía no guardaste ninguna lana")).toBeVisible();

    // Crear
    await page.getByRole("button", { name: "Nueva lana" }).click();
    const form = page.getByRole("form", { name: "Nueva lana" });
    await expect(form.getByRole("heading", { name: "Nueva lana" })).toBeFocused();

    // Guardar vacío: errores asociados, el foco va al primer campo con error y no se envía nada.
    await form.getByRole("button", { name: "Guardar lana" }).click();
    await expect(form.getByText("Elige el grosor de la lana.")).toBeVisible();
    await expect(form.getByText("Elige un color de la paleta")).toBeVisible();

    // Búsqueda de grosor: alias aproximado y ayuda de «ply»
    await form.getByLabel("Buscar por nombre").fill("grueso");
    await expect(form.getByText("equivalencia aproximada").first()).toBeVisible();
    await form.getByLabel("Buscar por nombre").fill("4 ply");
    await expect(form.getByText(/cambia según el país/)).toBeVisible();
    await form.getByLabel("Buscar por nombre").fill("aran");
    await form.getByRole("button", { name: /Medio/ }).click();
    await expect(form.getByRole("radio", { name: /Medio/ })).toBeChecked();
    await expect(form.getByTestId("weight-tools")).toContainText(`${STUDIO_TEXTS.panelLanas.agujas} de`);

    // Composición: 70 / 30 en vivo
    await form.getByLabel("Porcentaje de la fibra 1").fill("70");
    await expect(form.getByTestId("composition-sum")).toContainText("70");
    await form.getByRole("button", { name: "Agregar fibra" }).click();
    await form.getByLabel("Fibra 2", { exact: true }).selectOption("mohair");
    await expect(form.getByLabel("Porcentaje de la fibra 2")).toHaveValue("30");
    await expect(form.getByTestId("composition-sum")).toContainText("completa");

    // Color personalizado y nota
    await form.getByLabel("Color personalizado (#RRGGBB)").fill("#123456");
    await form.getByLabel("Nota privada (opcional)").fill(note);
    await expect(form.getByText(/no se comparte/)).toBeVisible();
    await form.getByRole("button", { name: "Guardar lana" }).click();

    const status = page.getByRole("status").filter({ hasText: "Guardaste la lana" });
    await expect(status).toBeFocused();
    const item = page.getByTestId("yarn-item").filter({ hasText: note });
    await expect(item).toContainText("Medio");
    await expect(item).toContainText("70 % Lana, 30 % Mohair");
    await expect(item).toContainText("personalizado (#123456)");

    // Recargar: viene de la base
    await page.reload();
    await expect(page.getByTestId("yarn-item").filter({ hasText: note })).toHaveCount(1);

    // Bea no la ve
    const { context, page: bea } = await contextAs(browser, "bea", watch);
    try {
      await bea.goto("/lanas");
      await expect(bea.getByRole("heading", { name: "Mis lanas", level: 1 })).toBeVisible();
      await expect(bea.getByText(note)).toHaveCount(0);
      await expect(bea.getByTestId("yarn-count")).toContainText("0 de 500");
    } finally {
      await context.close();
    }

    // Editar
    await page.getByTestId("yarn-item").filter({ hasText: note }).getByRole("button", { name: /^Editar/ }).click();
    const edit = page.getByRole("form", { name: "Editar lana" });
    await expect(edit.getByLabel("Nota privada (opcional)")).toHaveValue(note);
    await edit.getByLabel("Nota privada (opcional)").fill(edited);
    await edit.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Guardaste los cambios" })).toBeFocused();
    await expect(page.getByTestId("yarn-item").filter({ hasText: edited })).toHaveCount(1);
    await expect(page.getByTestId("yarn-item").filter({ hasText: note })).toHaveCount(0);
    await expect(page.getByTestId("yarn-item")).toHaveCount(1);

    // Borrar con confirmación (cancelar primero)
    const target = page.getByTestId("yarn-item").filter({ hasText: edited });
    await target.getByRole("button", { name: /^Borrar/ }).click();
    await target.getByRole("button", { name: "Cancelar" }).click();
    await expect(target).toHaveCount(1);
    await target.getByRole("button", { name: /^Borrar/ }).click();
    await target.getByRole("button", { name: "Sí, borrar" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Borraste la lana" })).toBeFocused();
    await expect(page.getByTestId("yarn-item")).toHaveCount(0);
    await expect(page.getByText("Todavía no guardaste ninguna lana")).toBeVisible();
  });

  test("sin sesión, /lanas lleva a ingresar", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/lanas");
    await expect(page).toHaveURL(/\/ingresar\?next=%2Flanas/);
    await context.close();
  });

  test("móvil: sin scroll horizontal en la lista y el formulario", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/lanas");
    await page.getByRole("button", { name: "Nueva lana" }).click();
    await expect(page.getByRole("form", { name: "Nueva lana" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
