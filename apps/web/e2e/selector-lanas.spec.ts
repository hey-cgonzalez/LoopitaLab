import type { Page } from "@playwright/test";
import type { PerfSummary } from "../src/lib/studio/perf.ts";
import { chartGeom, strokeThrough, expect, nextFrames, openStudio, previewHash, setField, test, undoButton, yarnHexes } from "./support/estudio.ts";

/*
 * Selector de lanas completo y metraje (T9 de la fase 3, ADR 0008 §2 a §6; casos F3-21 a F3-36). Sobre `/dev/estudio`
 * (sin sesión). "Mis lanas" con sesión está en `sesion/lanas.spec.ts`.
 */

const picker = (page: Page) => page.getByTestId("yarn-picker");
const openPicker = async (page: Page, letter = "A") => {
  await page.getByRole("button", { name: `Editar lana ${letter}`, exact: true }).click();
  await expect(picker(page)).toBeVisible();
};
const swatch = (page: Page, i: number) => page.locator("[data-testid=color-picker] [data-swatch]").nth(i);
const lengthValues = (page: Page) => page.getByTestId("yarn-length-value").allTextContents();
/** El documento de desarrollo trae muestra; se la quita para trabajar con la supuesta (como lanas-muestra.spec.ts). */
const clearGauge = async (page: Page) => {
  await setField(page.getByLabel("Puntos en 10 cm"), "");
  await setField(page.getByLabel("Filas en 10 cm"), "");
  await expect(page.getByTestId("assumed-gauge")).toBeVisible();
  await expect(page.locator("[data-assumption=assumed_gauge]")).toBeVisible(); // el metraje ya se recalculó
};
const lengthReady = async (page: Page) => {
  await expect(page.getByTestId("yarn-length-row").first()).toBeVisible();
  await expect(page.getByTestId("yarn-length")).toHaveAttribute("aria-busy", "false");
};

test.describe("Selector de lanas", () => {
  test("grosor: la búsqueda filtra por nombre y alias, 'ply' explica, elegir cambia la muestra supuesta y el metraje", async ({ page }) => {
    await openStudio(page);
    await clearGauge(page);
    await lengthReady(page);
    const before = await lengthValues(page);
    await openPicker(page);

    // Sin búsqueda están las 8 categorías.
    await expect(page.locator("[data-testid=weight-list] button")).toHaveCount(8);
    await page.getByTestId("weight-search").fill("aran");
    await expect(page.locator("[data-testid=weight-list] button")).toHaveCount(1);
    await expect(page.locator("[data-testid=weight-list] button").first()).toHaveAttribute("data-weight", "4");

    // "dk": primero la categoría 3; la 2 llega por alias, rotulada como aproximada y sin nombrar tienda.
    await page.getByTestId("weight-search").fill("DK");
    const buttons = page.locator("[data-testid=weight-list] button");
    await expect(buttons.first()).toHaveAttribute("data-weight", "3");
    await expect(page.getByTestId("weight-list")).toContainText("equivalencia aproximada");

    // "4 ply": no se mapea; ayuda y lista vacía.
    await page.getByTestId("weight-search").fill("4 ply");
    await expect(page.locator("[data-testid=weight-list] button")).toHaveCount(0);
    await expect(picker(page)).toContainText("cambia según el país");

    // Elegir la 4: un paso de deshacer, muestra supuesta visible y el metraje se recalcula.
    // El documento de desarrollo trae lanas de categoría 3; se cambia la A a la 4 (aran).
    await page.getByTestId("weight-search").fill("aran");
    await buttons.first().click();
    await expect(buttons.first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("weight-gauge")).toContainText("Muestra supuesta");
    await expect(page.getByTestId("yarn-announcement")).toHaveText(/grosor 4/);
    await expect.poll(async () => (await lengthValues(page)).join("|"), { timeout: 5000 }).not.toBe(before.join("|"));
    await undoButton(page).click();
    await expect.poll(async () => (await lengthValues(page)).join("|"), { timeout: 5000 }).toBe(before.join("|"));
  });

  test("categoría 7: aviso de baja confianza en el selector y en el metraje", async ({ page }) => {
    await openStudio(page);
    await openPicker(page);
    await page.getByTestId("weight-search").fill("jumbo");
    await page.locator("[data-testid=weight-list] button").first().click();
    await expect(page.getByTestId("weight-low-confidence")).toBeVisible();
    await expect(page.locator("[data-assumption=low_confidence_weight]")).toBeVisible();
  });

  test("composición: avisos por fibra, suma a 100 y solo se guarda lo válido", async ({ page }) => {
    await openStudio(page);
    await openPicker(page);
    const editor = page.getByTestId("composition-editor");
    await expect(page.getByTestId("composition-sum")).toContainText("Suma: 100 %");
    await editor.getByRole("button", { name: "Agregar fibra" }).click();
    // La fibra nueva parte en 0 %: aviso en su fila y la suma sigue en 100.
    await expect(page.getByTestId("fiber-problems")).toContainText("mayor que 0");
    await expect(picker(page).getByRole("alert")).toContainText("no se guardan");
    await setField(page.getByLabel("Porcentaje 1", { exact: true }), "80");
    await expect(page.getByTestId("composition-sum")).toContainText("Faltan 20 %");
    await setField(page.getByLabel("Porcentaje 2", { exact: true }), "20");
    await expect(page.getByTestId("composition-sum")).toContainText("Suma: 100 %");
    await expect(page.getByTestId("fiber-problems")).toHaveCount(0);
    await expect(picker(page).getByRole("alert")).toHaveCount(0);
    // Ahora sí entró al documento: Deshacer queda disponible.
    await expect(undoButton(page)).toBeEnabled();
    // No se puede repetir una fibra: el aviso es por fibra.
    const second = page.getByLabel("Fibra 2", { exact: true });
    await second.selectOption({ index: 0 });
    await page.getByLabel("Fibra 1", { exact: true }).selectOption({ index: 0 });
    await expect(page.getByTestId("fiber-problems").first()).toContainText("ya está en la lista");
  });

  test("color: pasar el cursor previsualiza sin tocar el documento, elegir escribe un paso, Esc quita y cierra", async ({ page }) => {
    await openStudio(page);
    await openPicker(page);
    const base = await previewHash(page);
    const hexA = (await yarnHexes(page))[0]!.hex;

    const target = swatch(page, 20);
    await target.hover();
    await nextFrames(page, 2);
    const hovered = await previewHash(page);
    expect(hovered, "la vista previa muestra el color").not.toBe(base);
    expect((await yarnHexes(page))[0]!.hex, "el documento no cambió").toBe(hexA);
    await expect(undoButton(page)).toBeDisabled();

    // Al salir del control se quita.
    await page.getByRole("heading", { name: "Lanas del diseño" }).hover();
    await nextFrames(page, 2);
    expect(await previewHash(page)).toBe(base);

    // Con el teclado: el foco de las flechas también previsualiza.
    await swatch(page, 3).focus();
    await page.keyboard.press("ArrowRight");
    await nextFrames(page, 2);
    expect(await previewHash(page)).not.toBe(base);
    // Esc: quita la vista previa y cierra el selector, y el foco vuelve a "Editar".
    await page.keyboard.press("Escape");
    await expect(picker(page)).toHaveCount(0);
    await nextFrames(page, 2);
    expect(await previewHash(page)).toBe(base);
    await expect(page.getByRole("button", { name: "Editar lana A", exact: true })).toBeFocused();

    // Elegir: un solo paso de deshacer; la vista previa queda con el color elegido.
    await openPicker(page);
    await swatch(page, 20).click();
    await nextFrames(page, 2);
    expect((await yarnHexes(page))[0]!.hex).not.toBe(hexA);
    await expect(swatch(page, 20)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("yarn-announcement")).toHaveText(/color/);
    await undoButton(page).click();
    await nextFrames(page, 2);
    expect((await yarnHexes(page))[0]!.hex).toBe(hexA);
  });

  test("color personalizado: 'prácticamente igual' a un color de la paleta y botón para usarlo", async ({ page }) => {
    await openStudio(page);
    await openPicker(page);
    const first = swatch(page, 0);
    const name = (await first.getAttribute("aria-label")) ?? "";
    const hex = await first.evaluate((el) => {
      const m = (el as HTMLElement).style.backgroundColor.match(/\d+/g)!.map(Number);
      return m.slice(0, 3);
    });
    // Un tono casi idéntico (un paso en el canal azul).
    const near = `#${[hex[0]!, hex[1]!, Math.min(255, hex[2]! + 1)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    await page.getByTestId("custom-hex").fill(near);
    await expect(page.getByTestId("near-color")).toContainText(name);
    await expect(page.getByTestId("near-color")).toContainText("prácticamente igual");
    await page.getByTestId("use-nearest").click();
    await expect(swatch(page, 0)).toHaveAttribute("aria-pressed", "true");
    // Un código mal escrito avisa y no cambia la lana.
    await page.getByTestId("custom-hex").fill("#12");
    await expect(picker(page).getByRole("alert")).toContainText("#RRGGBB");
  });

  test("Colores planos: el selector lo avisa y la vista previa sigue respondiendo", async ({ page }) => {
    await openStudio(page);
    await page.getByTestId("flat-colors").click();
    await expect(page.getByTestId("flat-colors")).toHaveAttribute("aria-pressed", "true");
    await openPicker(page);
    await expect(page.getByTestId("picker-flat-note")).toContainText("Colores planos");
    const base = await previewHash(page);
    await swatch(page, 20).hover();
    await nextFrames(page, 2);
    expect(await previewHash(page)).not.toBe(base);
    await page.getByRole("button", { name: "Apagar colores planos" }).click();
    await expect(page.getByTestId("flat-colors")).toHaveAttribute("aria-pressed", "false");
  });

  test("hover-to-paint con el selector real: p95 bajo 100 ms", async ({ page }) => {
    await openStudio(page, "forma=tubo&reps=3&perf=1");
    await page.waitForFunction(() => "__loopitaPerf" in window);
    await openPicker(page);
    await page.evaluate(() => (window as unknown as { __loopitaPerf: { reset(): void } }).__loopitaPerf.reset());
    for (let i = 0; i < 24; i++) {
      await swatch(page, i * 2).hover();
      await page.waitForTimeout(40);
    }
    await page.getByRole("heading", { name: "Lanas del diseño" }).hover();
    await nextFrames(page, 3);
    const s = await page.evaluate(() => (window as unknown as { __loopitaPerf: { summary(): PerfSummary } }).__loopitaPerf.summary());
    const hover = s.edits.hover;
    expect(hover?.n ?? 0).toBeGreaterThan(10);
    expect(hover!.p95, `hover p95 ${hover!.p95} ms`).toBeLessThan(Number(process.env.E2E_LATENCY_BUDGET_MS ?? 100));
    expect(s.validations.insideEditWindow).toBe(0);
  });

  test("sin sesión, Mis lanas invita a ingresar", async ({ page }) => {
    await openStudio(page);
    await openPicker(page);
    await page.getByRole("tab", { name: "Mis lanas" }).click();
    await expect(page.getByTestId("saved-signed-out")).toContainText("Inicia sesión");
    await page.getByRole("tab", { name: "Ajustar la lana" }).click();
    await expect(page.getByTestId("weight-picker")).toBeVisible();
  });
});

test.describe("Metraje por lana", () => {
  test("cada cifra se rotula como estimación, con supuestos, alcance y la sugerencia de tejer la muestra", async ({ page }) => {
    await openStudio(page);
    await lengthReady(page);
    await expect(page.locator("[data-assumption=assumed_gauge]")).toHaveCount(0); // el documento de desarrollo trae su muestra
    await clearGauge(page);
    await lengthReady(page);
    const rows = page.getByTestId("yarn-length-row");
    await expect(rows).toHaveCount(4);
    for (const v of await lengthValues(page)) expect(v).toMatch(/^≈ [\d.]+ m \(entre [\d.]+ y [\d.]+ m\), estimación$/);
    await expect(page.getByTestId("yarn-length-total")).toContainText("estimación");
    await expect(page.locator("[data-assumption=assumed_gauge]")).toBeVisible();
    await expect(page.locator("[data-assumption=loop_factor]")).toBeVisible();
    await expect(page.locator("[data-assumption=waste_margin]")).toBeVisible();
    await expect(page.getByTestId("yarn-length-scope")).toHaveText("Solo del gráfico: no incluye elástico, montaje ni remate.");
    await expect(page.getByTestId("yarn-length-advice")).toContainText("Teje una muestra con las lanas A, B, C y D");
    await expect(page.getByTestId("yarn-length")).not.toContainText(/gramos|ovillo/i);
  });

  test("con la muestra de la usuaria desaparece 'muestra supuesta' y los metros bajan con más puntos en 10 cm", async ({ page }) => {
    await openStudio(page);
    await clearGauge(page);
    await lengthReady(page);
    const assumedMeters = (await lengthValues(page)).map((t) => Number(t.match(/≈ ([\d.]+) m/)![1]!.replace(".", "")));
    await setField(page.getByLabel("Puntos en 10 cm"), "30");
    await setField(page.getByLabel("Filas en 10 cm"), "40");
    await expect(page.locator("[data-assumption=assumed_gauge]")).toHaveCount(0);
    await expect.poll(async () => (await lengthValues(page)).map((t) => Number(t.match(/≈ ([\d.]+) m/)![1]!.replace(".", ""))).reduce((a, b) => a + b, 0)).toBeLessThan(assumedMeters.reduce((a, b) => a + b, 0));
  });

  test("pintar una celda recalcula el metraje después del frame, sin bloquear el dibujo", async ({ page }) => {
    await openStudio(page);
    await lengthReady(page);
    const before = (await page.getByTestId("yarn-length-row").allTextContents()).join("|");
    const g = await chartGeom(page);
    await page.keyboard.press("4");
    await strokeThrough(page, g, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]);
    await expect.poll(async () => (await page.getByTestId("yarn-length-row").allTextContents()).join("|"), { timeout: 5000 }).not.toBe(before);
  });

  test("crochet: sin estimación y sin inventar una cifra", async ({ page }) => {
    await openStudio(page, "forma=tubo&reps=3&tecnica=crochet");
    await expect(page.getByTestId("yarn-length-none").first()).toContainText("Sin estimación");
    await expect(page.getByTestId("yarn-length-value")).toHaveCount(0);
    await expect(page.getByTestId("yarn-length-total")).toHaveCount(0);
  });
});

test.describe("Selector de lanas en móvil @movil", () => {
  test("sin scroll horizontal con el selector abierto", async ({ page }) => {
    await openStudio(page);
    await page.getByRole("tab", { name: "Editor", exact: true }).click();
    await openPicker(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
