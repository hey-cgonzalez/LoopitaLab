import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas E2E. Ver `e2e/README.md`.
 *
 * Sin sesión (proyectos `escritorio`, `movil` y `latencia`, T13): solo `/dev/estudio`, la página interna sin sesión
 * ni Supabase (`src/lib/dev-pages.ts`). Las variables públicas son las de ejemplo de la CI: en local reemplazan a las
 * de `.env.local` (Next no pisa una variable que ya viene del entorno), así la prueba nunca apunta al proyecto real.
 *
 * Con sesión (proyecto `sesion`, T2 de la fase 3): solo con `E2E_SUPABASE=1`, contra la Supabase LOCAL de la CLI
 * (Docker). El servidor de pruebas usa la URL y las claves de desarrollo que imprime `supabase status`; nunca las de
 * `.env.local` ni las del proyecto real. Sin `E2E_SUPABASE=1`, las pruebas con sesión se saltan con un aviso.
 *
 * El servidor es el build de producción (`next build` + `next start`), porque la latencia (CA-P1 a CA-P4) solo vale
 * medida sobre producción.
 */
const CI = !!process.env.CI;
const SESSION = process.env.E2E_SUPABASE === "1";
/** Versión fija de la CLI de Supabase (la misma de la CI, `.github/workflows/ci.yml`). */
export const SUPABASE_CLI_VERSION = "2.122.1";

const PORT = Number(process.env.E2E_PORT ?? (SESSION ? 3200 : 3100));
/*
 * Con sesión, `localhost` y no `127.0.0.1`: Next normaliza 127.0.0.1 a localhost en `request.nextUrl`, así que las
 * redirecciones de /auth/callback y /auth/salir llevarían a otro origen (sin las cookies ni el localStorage de la
 * prueba). Debe coincidir con SUPABASE_AUTH_SITE_URL de la Supabase local (README y ci.yml).
 */
const HOST = SESSION ? "localhost" : "127.0.0.1";
const BASE_URL = process.env.E2E_BASE_URL ?? `http://${HOST}:${PORT}`;

/**
 * URL y claves de la Supabase local. Primero de las variables `E2E_SUPABASE_*` (la CI las exporta desde
 * `supabase status`); si faltan, se le preguntan a la CLI. Se guardan en `process.env` para que los trabajadores de
 * Playwright (procesos hijos) no vuelvan a llamar a la CLI. Falla si la URL no es local.
 */
function localSupabase(): { url: string; publishableKey: string; secretKey: string; mailUrl: string } {
  const env = process.env;
  if (!env.E2E_SUPABASE_URL || !env.E2E_SUPABASE_PUBLISHABLE_KEY || !env.E2E_SUPABASE_SECRET_KEY) {
    const root = fileURLToPath(new URL("../..", import.meta.url));
    const [cmd, ...args] = (env.SUPABASE_CLI ?? `npx --yes supabase@${SUPABASE_CLI_VERSION}`).split(" ");
    let out: string;
    try {
      out = execFileSync(cmd as string, [...args, "status", "-o", "json"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      throw new Error(
        "E2E_SUPABASE=1, pero no hay una Supabase local corriendo. Abre Docker Desktop y corre `npx supabase@" +
          SUPABASE_CLI_VERSION +
          " start` desde la raíz del repositorio (ver apps/web/e2e/README.md), o quita E2E_SUPABASE para correr solo las pruebas sin sesión.",
      );
    }
    const s = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as Record<string, string | undefined>;
    env.E2E_SUPABASE_URL = s.API_URL ?? "";
    env.E2E_SUPABASE_PUBLISHABLE_KEY = s.PUBLISHABLE_KEY ?? s.ANON_KEY ?? "";
    env.E2E_SUPABASE_SECRET_KEY = s.SECRET_KEY ?? s.SERVICE_ROLE_KEY ?? "";
    env.E2E_MAILPIT_URL ??= s.MAILPIT_URL ?? s.INBUCKET_URL ?? "";
  }
  const url = env.E2E_SUPABASE_URL ?? "";
  const host = URL.canParse(url) ? new URL(url).hostname : "";
  // Red de seguridad: las E2E con sesión crean y borran cuentas. Nunca contra un proyecto que no sea el local.
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`E2E_SUPABASE_URL debe ser la Supabase local (127.0.0.1 o localhost), no «${host || url}».`);
  }
  return { url, publishableKey: env.E2E_SUPABASE_PUBLISHABLE_KEY ?? "", secretKey: env.E2E_SUPABASE_SECRET_KEY ?? "", mailUrl: env.E2E_MAILPIT_URL || "http://127.0.0.1:54324" };
}

const supabase = SESSION ? localSupabase() : null;
if (!SESSION && !process.env.TEST_WORKER_INDEX && process.argv.some((a) => /sesion/.test(a))) {
  console.warn("[e2e] Pruebas con sesión saltadas: falta E2E_SUPABASE=1 y una Supabase local (`npx supabase@" + SUPABASE_CLI_VERSION + " start`). Ver e2e/README.md.");
}

const SERVER_ENV: Record<string, string> = supabase
  ? {
      LOOPITA_DEV_PAGES: "1",
      // Build propio (no pisa el `.next` de `pnpm build` ni el de las E2E sin sesión).
      LOOPITA_NEXT_DIST_DIR: ".next-e2e-sesion",
      NEXT_PUBLIC_SUPABASE_URL: supabase.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      NEXT_PUBLIC_AUTH_PROVIDERS: "",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
      // Clave secreta de DESARROLLO de la Supabase local (la usan /cuenta y las rutas de cuenta). Solo este servidor.
      SUPABASE_SECRET_KEY: supabase.secretKey,
      NEXT_TELEMETRY_DISABLED: "1",
    }
  : {
      LOOPITA_DEV_PAGES: "1",
      NEXT_PUBLIC_SUPABASE_URL: "https://ejemplo.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ci",
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      NEXT_PUBLIC_AUTH_PROVIDERS: "",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
      // Vacía a propósito: la clave real de `.env.local` no debe llegar a este servidor.
      SUPABASE_SECRET_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
    };

/*
 * `channel: "chromium"`: el Chromium completo en el modo sin interfaz nuevo, no el `chromium-headless-shell` que
 * Playwright usa por defecto. El shell dibuja el canvas mucho más lento (con CPU ×4, el círculo de 40.000 puntos
 * daba p95 de 177 ms al pintar, contra 76 ms con Chromium completo) y no representa lo que ve una usuaria.
 */
const chromium = { ...devices["Desktop Chrome"], channel: "chromium" };
const desktop = { ...chromium, viewport: { width: 1440, height: 900 } };
const SESSION_DIR = /sesion[\\/]/;

const build = process.env.E2E_SKIP_BUILD === "1" ? "" : "pnpm exec next build && ";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // En la CI (2 a 4 núcleos) un solo trabajador: el servidor y Chromium comparten la máquina.
  workers: CI ? 1 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }], ["github"]] : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE_URL,
    locale: "es-CL",
    timezoneId: "America/Santiago",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "escritorio", testIgnore: [/latencia\.spec\.ts/, SESSION_DIR], grepInvert: /@movil/, use: desktop },
    { name: "movil", testIgnore: [/latencia\.spec\.ts/, SESSION_DIR], grep: /@movil/, use: { ...chromium, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    // La latencia corre al final y sola (sin otras pruebas compitiendo por la CPU).
    { name: "latencia", testMatch: /latencia\.spec\.ts/, dependencies: ["escritorio", "movil"], fullyParallel: false, use: desktop },
    // Con sesión (Supabase local): crea las cuentas de prueba y sus sesiones, corre las pruebas y borra las cuentas.
    { name: "sesion-preparar", testMatch: /sesion[\\/]preparar\.setup\.ts/, teardown: "sesion-limpiar", use: desktop },
    { name: "sesion-limpiar", testMatch: /sesion[\\/]limpiar\.teardown\.ts/ },
    { name: "sesion", testMatch: /sesion[\\/].*\.spec\.ts/, dependencies: ["sesion-preparar"], use: desktop },
  ],
  webServer: {
    command: `${build}pnpm exec next start -H ${HOST} -p ${PORT}`,
    url: `${BASE_URL}/dev/estudio`,
    env: SERVER_ENV,
    // Con sesión, nunca se reutiliza un servidor ajeno: podría estar apuntando a otro proyecto de Supabase.
    reuseExistingServer: !CI && !SESSION,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
