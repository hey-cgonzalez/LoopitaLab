import { randomBytes } from "node:crypto";
import { expect, mailUrl, test, TEST_EMAIL_DOMAIN } from "./support.ts";

// Registro e ingreso con correo y contraseña, sin sesión previa, contra la Supabase local.
test.use({ storageState: { cookies: [], origins: [] } });

/** Enlace de confirmación del último correo a `email` en el servidor de correo local (Mailpit). */
async function confirmationLink(email: string): Promise<string> {
  let link = "";
  await expect
    .poll(
      async () => {
        const res = await fetch(`${mailUrl()}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
        if (!res.ok) return "";
        const list = (await res.json()) as { messages?: { ID: string }[] };
        const id = list.messages?.[0]?.ID;
        if (!id) return "";
        const msg = (await (await fetch(`${mailUrl()}/api/v1/message/${id}`)).json()) as { Text?: string; HTML?: string };
        const body = `${msg.Text ?? ""}\n${msg.HTML ?? ""}`;
        link = /https?:\/\/[^\s"'<>()]+\/auth\/v1\/verify[^\s"'<>()]+/.exec(body)?.[0]?.replaceAll("&amp;", "&") ?? "";
        return link;
      },
      { message: "llega el correo de confirmación a Mailpit", timeout: 15_000 },
    )
    .not.toBe("");
  return link;
}

test.describe("Acceso con correo", () => {
  test("registro: el correo de confirmación abre la sesión en /proyectos", async ({ page }) => {
    const email = `registro-${Date.now().toString(36)}${randomBytes(2).toString("hex")}@${TEST_EMAIL_DOMAIN}`;
    await page.goto("/registro");
    await page.getByLabel("Cómo quieres que te llamemos").fill("Dora E2E");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(`Clave${randomBytes(6).toString("hex")}9`);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText(`Te enviamos un correo a ${email}`)).toBeVisible();

    // La confirmación es real (enable_confirmations = true): el enlace pasa por Supabase Auth y vuelve a /auth/callback
    // con un código PKCE que solo sirve en este navegador.
    await page.goto(await confirmationLink(email));
    await page.waitForURL("**/proyectos");
    await page.goto("/cuenta");
    await expect(page.getByText(`Ingresas con ${email}.`)).toBeVisible();
  });

  test("ingreso: una ruta privada pide ingresar y después vuelve a ella", async ({ page, accounts }) => {
    await page.goto("/disenos");
    await expect(page).toHaveURL(/\/ingresar\?next=%2Fdisenos$/);
    await page.getByLabel("Correo").fill(accounts.bea.email);
    await page.getByLabel("Contraseña").fill(accounts.bea.password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL("**/disenos");
    await expect(page.getByRole("heading", { name: "Mis diseños", level: 1 })).toBeVisible();
  });
});
