import { STUDIO_TEXTS } from "../../src/lib/studio-texts.ts";
import { createFromTemplate, expect, stateFile, test } from "./support.ts";

// Preferencias de la cuenta y cierre de sesión.

test.describe("Cuenta", () => {
  test.use({ storageState: stateFile("bea") });

  test("«Tejer en espejo» se guarda, sobrevive a recargar y llega al estudio", async ({ page, admin, accounts }) => {
    const mirror = () => page.getByRole("checkbox", { name: "Tejer en espejo" });
    const save = async () => {
      await page.getByRole("button", { name: "Guardar preferencias" }).click();
      await expect(page.getByText("Preferencias guardadas.")).toBeVisible();
    };
    const stored = async () => (await admin.from("profiles").select("mirror_knitting").eq("id", accounts.bea.id).single()).data?.mirror_knitting;

    await page.goto("/cuenta");
    await expect(mirror()).not.toBeChecked();
    await mirror().check();
    await save();
    expect(await stored()).toBe(true);
    await page.reload();
    await expect(mirror()).toBeChecked();

    await createFromTemplate(page, `Espejo ${Date.now().toString(36)}`);
    await expect(page.getByText(STUDIO_TEXTS.editor.espejo)).toBeVisible();

    // Deja la cuenta como estaba (otras pruebas usan a bea).
    await page.goto("/cuenta");
    await mirror().uncheck();
    await save();
    expect(await stored()).toBe(false);
  });
});

test.describe("Cerrar sesión", () => {
  // cata: cerrar sesión revoca todas sus sesiones, así que no comparte cuenta con otras pruebas.
  test.use({ storageState: stateFile("cata") });

  test("borra los respaldos locales de diseños (de cualquier cuenta y formato) y nada más", async ({ page, accounts }) => {
    await page.goto("/disenos");
    const uid = accounts.cata.id;
    const keys = [`loopitalab:${uid}:diseno:11111111-1111-4111-8111-111111111111`, "loopitalab:otra-cuenta:diseno:22222222-2222-4222-8222-222222222222", "loopitalab:diseno:viejo"];
    await page.evaluate((list) => {
      for (const k of list) localStorage.setItem(k, "{}");
      localStorage.setItem("otra-app:preferencia", "se queda");
    }, keys);

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    const left = await page.evaluate(() => Object.keys(localStorage).sort());
    expect(left.filter((k) => /^loopitalab:(?:[^:]+:)?diseno:/.test(k)), "sin respaldos loopitalab:*:diseno:*").toEqual([]);
    expect(left).toContain("otra-app:preferencia");

    await page.goto("/disenos");
    await expect(page).toHaveURL(/\/ingresar\?next=%2Fdisenos$/);
  });
});
