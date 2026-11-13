import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
 * Ayudas de las E2E con sesión (T2 de la fase 3). Corren SOLO contra la Supabase local de la CLI (Docker):
 * `playwright.config.ts` deja en `E2E_SUPABASE_*` la URL y las claves de desarrollo que imprime `supabase status`,
 * y falla si la URL no es 127.0.0.1 o localhost. Sin `E2E_SUPABASE=1`, todo se salta con un aviso.
 */

export const SESSION_ENABLED = process.env.E2E_SUPABASE === "1";
export const SKIP_REASON =
  "Pruebas con sesión saltadas: necesitan la Supabase local (Docker Desktop + `npx supabase@2.122.1 start`) y E2E_SUPABASE=1. Ver apps/web/e2e/README.md.";

/** Dominio de todas las cuentas de prueba. La limpieza borra cualquier cuenta con este dominio. */
export const TEST_EMAIL_DOMAIN = "e2e.loopitalab.test";

const AUTH_DIR = fileURLToPath(new URL("../../playwright/.auth/", import.meta.url));
export const ACCOUNTS_FILE = `${AUTH_DIR}cuentas.json`;
export const stateFile = (who: Who) => `${AUTH_DIR}${who}.json`;

export type Who = "ana" | "bea" | "cata" | "dani" | "eva" | "fer";
export interface Account {
  id: string;
  email: string;
  password: string;
}
export type Accounts = Record<Who, Account>;

export function readAccounts(): Accounts {
  return JSON.parse(readFileSync(ACCOUNTS_FILE, "utf8")) as Accounts;
}

/** Cliente con la clave secreta de la Supabase LOCAL (se salta RLS). Solo para preparar y comprobar en la base. */
export function adminClient(): SupabaseClient {
  const url = process.env.E2E_SUPABASE_URL ?? "";
  const key = process.env.E2E_SUPABASE_SECRET_KEY ?? "";
  const host = URL.canParse(url) ? new URL(url).hostname : "";
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error("adminClient: solo contra la Supabase local.");
  if (!key) throw new Error("adminClient: falta E2E_SUPABASE_SECRET_KEY (la define playwright.config.ts).");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export const mailUrl = () => process.env.E2E_MAILPIT_URL || "http://127.0.0.1:54324";

/**
 * `test` de las pruebas con sesión: se salta sin `E2E_SUPABASE=1` y falla si en la página hubo un `console.error` o
 * una excepción no capturada, salvo los que la prueba declara esperados (`allowConsole`, p. ej. el 404 de un
 * diseño ajeno). Da también las cuentas y el cliente admin local.
 */
export const test = base.extend<{ sessionGate: void; allowConsole: RegExp[]; pageProblems: string[]; accounts: Accounts; admin: SupabaseClient; watch: (page: Page) => void }>({
  sessionGate: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      testInfo.skip(!SESSION_ENABLED, SKIP_REASON);
      await use();
    },
    { auto: true },
  ],
  allowConsole: [[], { option: true }],
  accounts: async ({ sessionGate }, use) => {
    void sessionGate;
    await use(readAccounts());
  },
  admin: async ({ sessionGate }, use) => {
    void sessionGate;
    await use(adminClient());
  },
  pageProblems: [
    async ({ sessionGate, allowConsole }, use) => {
      void sessionGate;
      const problems: string[] = [];
      await use(problems);
      const unexpected = problems.filter((p) => !allowConsole.some((re) => re.test(p)));
      expect(unexpected, "sin console.error ni excepciones no capturadas").toEqual([]);
    },
    { auto: true },
  ],
  watch: [
    async ({ pageProblems, page }, use) => {
      const watch = (p: Page) => {
        p.on("console", (m) => {
          if (m.type() === "error") pageProblems.push(`console.error: ${m.text()} (${m.location().url})`);
        });
        p.on("pageerror", (e) => pageProblems.push(`excepción no capturada: ${e.message}`));
      };
      watch(page);
      await use(watch);
    },
    { auto: true },
  ],
});

export { expect };

/** Otra sesión (otra cuenta o una pestaña aparte) con la guardia de consola puesta. */
export async function contextAs(browser: Browser, who: Who, watch: (p: Page) => void): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: stateFile(who), locale: "es-CL", timezoneId: "America/Santiago", viewport: { width: 1440, height: 900 } });
  context.on("page", watch);
  const page = await context.newPage();
  return { context, page };
}

/** Indicador del guardado del estudio (`SaveIndicator`, atributo `data-save-status`). */
export const saveStatus = (page: Page) => page.locator("[data-save-status]");

export async function expectSaved(page: Page, timeout = 10_000): Promise<void> {
  await expect(saveStatus(page)).toHaveAttribute("data-save-status", "saved", { timeout });
}

const UUID = /\/disenos\/([0-9a-f-]{36})$/;

/**
 * Crea un diseño desde la plantilla "Banda en tubo" (8 × 8, rombos rojos sobre crudo), espera al estudio, le pone
 * `title` (único por prueba) y espera a que se guarde. Devuelve el id.
 */
export async function createFromTemplate(page: Page, title: string, template = "Banda en tubo"): Promise<string> {
  await page.goto("/disenos/nuevo");
  await page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: template, exact: true }) }).getByRole("button", { name: "Usar esta plantilla" }).click();
  await page.waitForURL(UUID, { timeout: 20_000 });
  const id = UUID.exec(new URL(page.url()).pathname)?.[1] ?? "";
  await waitForStudio(page);
  await page.getByLabel("Nombre del diseño", { exact: true }).fill(title);
  await expect(saveStatus(page)).not.toHaveAttribute("data-save-status", "saved");
  await expectSaved(page);
  return id;
}

/** Espera a que el editor del estudio esté dibujado. */
export async function waitForStudio(page: Page): Promise<void> {
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => Number((document.querySelector("[data-testid=chart-canvas]") as HTMLElement | null)?.dataset.cellPx) > 0);
}

/** Documento guardado en la base (lectura con la clave secreta local, sin RLS). */
export async function storedPattern(admin: SupabaseClient, id: string): Promise<{ title: string; updated_at: string; document: { chart: { width: number; cells: number[] } } } | null> {
  const { data, error } = await admin.from("patterns").select("title, updated_at, document").eq("id", id).maybeSingle();
  if (error) throw new Error(`patterns: ${error.code ?? error.message}`);
  return data as never;
}

export async function versionCount(admin: SupabaseClient, id: string): Promise<number> {
  const { count, error } = await admin.from("pattern_versions").select("id", { count: "exact", head: true }).eq("pattern_id", id);
  if (error) throw new Error(`pattern_versions: ${error.code ?? error.message}`);
  return count ?? 0;
}

/** Abre la sección «Diseño» del panel lateral (un `<details>`), donde está «Guardar versión». */
export async function openDesignSection(page: Page): Promise<void> {
  const details = page.locator("details", { has: page.locator("summary", { hasText: /^Diseño$/ }) });
  if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
  await expect(page.getByRole("button", { name: "Guardar versión", exact: true })).toBeVisible();
}
