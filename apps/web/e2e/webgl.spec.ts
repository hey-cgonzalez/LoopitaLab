import { expect, test } from "@playwright/test";

/*
 * WebGL por software en la CI (T3, fase 4): comprueba que Chromium (con los flags de SwiftShader del proyecto
 * `webgl` de playwright.config.ts) entrega un contexto y dibuja. Es la base del E2E del visor 3D; no usa three.
 */
test("Chromium entrega un contexto WebGL y dibuja un triángulo", async ({ page }) => {
  await page.goto("/dev/webgl");
  const probe = page.getByTestId("webgl-probe");
  await expect(probe).toHaveAttribute("data-ready", "true");
  const context = await probe.getAttribute("data-context");
  const renderer = await probe.getAttribute("data-renderer");
  // El renderer queda en la salida: en la CI debe ser SwiftShader/SwANGLE; en local puede ser la GPU o Metal.
  console.log(`[webgl] contexto=${context} renderer=${renderer || "(no informado)"}`);
  test.info().annotations.push({ type: "renderer", description: renderer || "(no informado)" });
  expect(["webgl2", "webgl"]).toContain(context);
  // En la CI no hay GPU: si el renderer no es SwiftShader, los flags no se aplicaron y las mediciones del visor mentirían.
  if (process.env.CI) expect(renderer ?? "").toMatch(/swiftshader/i);
  await expect(probe).toHaveAttribute("data-drawn", "true");
});
