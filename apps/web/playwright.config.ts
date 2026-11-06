import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas E2E del estudio (T13). Alcance: solo `/dev/estudio`, la página interna sin sesión ni Supabase
 * (`src/lib/dev-pages.ts`). Ver `e2e/README.md`.
 *
 * El servidor es el build de producción (`next build` + `next start`) con `LOOPITA_DEV_PAGES=1`, porque la latencia
 * (CA-P1 a CA-P4) solo vale medida sobre producción. Las variables públicas son las de ejemplo de la CI: en local
 * reemplazan a las de `.env.local` (Next no pisa una variable que ya viene del entorno), así la prueba nunca apunta
 * al proyecto Supabase real.
 */
const CI = !!process.env.CI;
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

const SERVER_ENV: Record<string, string> = {
  LOOPITA_DEV_PAGES: "1",
  NEXT_PUBLIC_SUPABASE_URL: "https://ejemplo.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ci",
  NEXT_PUBLIC_SITE_URL: BASE_URL,
  NEXT_PUBLIC_AUTH_PROVIDERS: "",
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
    { name: "escritorio", testIgnore: /latencia\.spec\.ts/, grepInvert: /@movil/, use: desktop },
    { name: "movil", testIgnore: /latencia\.spec\.ts/, grep: /@movil/, use: { ...chromium, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    // La latencia corre al final y sola (sin otras pruebas compitiendo por la CPU).
    { name: "latencia", testMatch: /latencia\.spec\.ts/, dependencies: ["escritorio", "movil"], fullyParallel: false, use: desktop },
  ],
  webServer: {
    command: process.env.E2E_SKIP_BUILD === "1" ? `pnpm exec next start -H 127.0.0.1 -p ${PORT}` : `pnpm exec next build && pnpm exec next start -H 127.0.0.1 -p ${PORT}`,
    url: `${BASE_URL}/dev/estudio`,
    env: SERVER_ENV,
    reuseExistingServer: !CI,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
