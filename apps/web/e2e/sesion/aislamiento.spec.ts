import { contextAs, createFromTemplate, expect, stateFile, test } from "./support.ts";

// Aislamiento entre cuentas (RLS de verdad, no stubs): bea no puede abrir ni ver el diseño de ana.
test.use({
  storageState: stateFile("ana"),
  // El documento del 404 se registra en la consola como recurso fallido: es lo esperado aquí.
  allowConsole: [/status of 404/],
});

test("la cuenta B recibe 404 al abrir el diseño de A y no lo ve en su lista", async ({ page, browser, watch }) => {
  const title = `Privado de Ana ${Date.now().toString(36)}`;
  const id = await createFromTemplate(page, title);

  const { context, page: bea } = await contextAs(browser, "bea", watch);
  try {
    const res = await bea.goto(`/disenos/${id}`);
    expect(res?.status()).toBe(404);
    await expect(bea.getByTestId("chart-canvas")).toHaveCount(0);
    await expect(bea.getByText(title)).toHaveCount(0);

    await bea.goto("/disenos");
    await expect(bea.getByRole("heading", { name: "Mis diseños", level: 1 })).toBeVisible();
    await expect(bea.getByRole("link", { name: title, exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
