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

  test("«Abreviaturas de los patrones de amigurumi»: avisa que «dc» cambia, se guarda con teclado, sobrevive a recargar y se anuncia (T17)", async ({ page, admin, accounts }) => {
    const stored = async () => (await admin.from("profiles").select("pattern_dialect").eq("id", accounts.bea.id).single()).data?.pattern_dialect;
    const group = () => page.getByRole("group", { name: "Abreviaturas de los patrones de amigurumi" });
    await page.goto("/cuenta");
    try {
      await expect(group()).toBeVisible();
      await expect(group().getByRole("radio")).toHaveCount(3);
      await expect(group().getByRole("radio", { name: /^Español/ })).toBeChecked();
      // La advertencia de «dc» está enlazada al grupo (la oye quien lo enfoca).
      await expect(group()).toHaveAccessibleDescription(/«dc» es el punto bajo.+«dc» es el punto alto/);
      const save = page.getByRole("button", { name: "Guardar abreviaturas" });
      await expect(save).toBeDisabled(); // sin cambios

      // Con el teclado: el radio elegido se mueve con las flechas y se guarda con Enter en el botón.
      await group().getByRole("radio", { name: /^Español/ }).focus();
      await page.keyboard.press("ArrowDown"); // EE. UU.
      await page.keyboard.press("ArrowDown"); // Reino Unido
      await expect(group().getByRole("radio", { name: /^Inglés británico/ })).toBeChecked();
      await save.focus();
      await page.keyboard.press("Enter");
      const status = page.getByRole("status").filter({ hasText: "Abreviaturas guardadas" });
      await expect(status).toBeVisible();
      expect(await stored()).toBe("uk");

      await page.reload();
      await expect(group().getByRole("radio", { name: /^Inglés británico/ })).toBeChecked();
      await expect(page.getByRole("button", { name: "Guardar abreviaturas" })).toBeDisabled();
    } finally {
      // Deja la cuenta como estaba (otras pruebas usan a bea).
      await admin.from("profiles").update({ pattern_dialect: "es" }).eq("id", accounts.bea.id);
    }
    expect(await stored()).toBe("es");
  });

  test("/cuenta a 320 y 390 px no desplaza en horizontal y el grupo de abreviaturas cabe", async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/cuenta");
      await expect(page.getByRole("group", { name: "Abreviaturas de los patrones de amigurumi" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `/cuenta a ${width} px`).toBe(true);
    }
  });
});

test.describe("Cerrar sesión", () => {
  // cata: cerrar sesión revoca todas sus sesiones, así que no comparte cuenta con otras pruebas.
  test.use({ storageState: stateFile("cata") });

  test("borra los respaldos locales de diseños y el avance de tejido sin enviar (de cualquier cuenta y formato) y nada más", async ({ page, accounts }) => {
    await page.goto("/disenos");
    const uid = accounts.cata.id;
    const keys = [
      `loopitalab:${uid}:diseno:11111111-1111-4111-8111-111111111111`,
      "loopitalab:otra-cuenta:diseno:22222222-2222-4222-8222-222222222222",
      "loopitalab:diseno:viejo",
      // CA3-T7 (QA T16): el avance de "Tejiendo" que no alcanzó a enviarse, de esta cuenta y de otra.
      `loopitalab:${uid}:avance:33333333-3333-4333-8333-333333333333`,
      "loopitalab:otra-cuenta:avance:44444444-4444-4444-8444-444444444444",
    ];
    await page.evaluate((list) => {
      for (const k of list) localStorage.setItem(k, "{}");
      localStorage.setItem("otra-app:preferencia", "se queda");
      localStorage.setItem("loopitalab:tejiendo:pantalla", "0"); // preferencia del dispositivo, sin datos de la cuenta: se queda
    }, keys);

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    const left = await page.evaluate(() => Object.keys(localStorage).sort());
    expect(left.filter((k) => /^loopitalab:(?:[^:]+:)?diseno:/.test(k)), "sin respaldos loopitalab:*:diseno:*").toEqual([]);
    expect(left.filter((k) => /^loopitalab:[^:]+:avance:/.test(k)), "sin avance local loopitalab:*:avance:*").toEqual([]);
    expect(left).toContain("otra-app:preferencia");
    expect(left).toContain("loopitalab:tejiendo:pantalla");

    await page.goto("/disenos");
    await expect(page).toHaveURL(/\/ingresar\?next=%2Fdisenos$/);
  });
});
