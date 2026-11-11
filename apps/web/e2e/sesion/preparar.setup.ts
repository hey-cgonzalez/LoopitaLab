import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { test as setup, expect } from "@playwright/test";
import { ACCOUNTS_FILE, adminClient, SESSION_ENABLED, SKIP_REASON, stateFile, TEST_EMAIL_DOMAIN, type Accounts, type Who } from "./support.ts";

/*
 * Preparación de las E2E con sesión (equivale a un globalSetup, pero como proyecto de Playwright: solo corre si se
 * elige el proyecto `sesion`). Crea tres cuentas confirmadas con la API admin de la Supabase LOCAL y guarda la sesión
 * de cada una (`storageState`), ingresando por el formulario real de /ingresar:
 *  - ana: diseños, autoguardado, versiones, conflicto, duplicar y borrar;
 *  - bea: aislamiento (no ve lo de ana) y preferencias de la cuenta;
 *  - cata: cerrar sesión (que revoca todas sus sesiones; por eso es una cuenta aparte);
 *  - dani: lanas guardadas usadas desde el estudio (T9 de la fase 3; cuenta aparte porque `lanas.spec.ts` espera que la lista de ana empiece vacía);
 *  - eva: QA del grupo C (tope de 500 lanas, nota de más de 200, Colores planos y autoguardado repetido; `qa-grupo-c.spec.ts`).
 * La limpieza (`limpiar.teardown.ts`) borra todas las cuentas del dominio de prueba.
 */

const NAMES: Record<Who, string> = { ana: "Ana E2E", bea: "Bea E2E", cata: "Cata E2E", dani: "Dani E2E", eva: "Eva E2E" };

setup("crear las cuentas de prueba y sus sesiones", async ({ browser }) => {
  setup.skip(!SESSION_ENABLED, SKIP_REASON);
  const admin = adminClient();
  const run = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const accounts = {} as Accounts;

  for (const who of Object.keys(NAMES) as Who[]) {
    const email = `${who}-${run}@${TEST_EMAIL_DOMAIN}`;
    // Contraseña al azar por corrida (letras y números, como exige config.toml). Vive solo en playwright/.auth/ (ignorada).
    const password = `Clave${randomBytes(9).toString("hex")}1`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: NAMES[who] } });
    expect(error, `crear la cuenta ${who}`).toBeNull();
    accounts[who] = { id: data.user?.id ?? "", email, password };
  }
  mkdirSync(dirname(ACCOUNTS_FILE), { recursive: true });
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), { mode: 0o600 });

  for (const who of Object.keys(NAMES) as Who[]) {
    const context = await browser.newContext({ locale: "es-CL" });
    const page = await context.newPage();
    await page.goto("/ingresar?next=/disenos");
    await page.getByLabel("Correo").fill(accounts[who].email);
    await page.getByLabel("Contraseña").fill(accounts[who].password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL("**/disenos");
    await expect(page.getByRole("heading", { name: "Mis diseños", level: 1 })).toBeVisible();
    await context.storageState({ path: stateFile(who) });
    await context.close();
  }
});
