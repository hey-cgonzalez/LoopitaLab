import { expect, test } from "@playwright/test";

/*
 * QA de la fase 4 (T19, `qa-tester`), proyecto `webgl` (SwiftShader). Resaltado 3D de un rango (ADR 0010, T11-1 y
 * T11-3; sugerido por T14): la cabeza de `?demo=armar` tiene "V5-9: 24 pb (24)". Tocar la V7 en el 3D lleva el cursor
 * a la línea del rango y resalta la V7 (roundIndex 6), no la V5; moverse dentro de la misma línea no lo cambia, y
 * salir de la línea y volver tampoco (el toque se recuerda para ese rango).
 */
type PickHit = { partId: string; copy: number; roundIndex: number; stitchInRound: number };
type Hl = { partId: string; roundIndex?: number } | null;
type Hook = { viewer(): { renderer: { pick(x: number, y: number): PickHit | null; setHighlight(t: Hl): void } } | null };

test("tocar la V7 dentro de «V5-9» resalta la V7 y deja el cursor en la línea del rango", async ({ page }) => {
  await page.goto("/dev/amigurumi?demo=armar");
  await page.waitForFunction(() => (window as unknown as { __loopitaAmigurumi?: Hook }).__loopitaAmigurumi?.viewer() != null, null, { timeout: 60_000 });
  const canvas = page.getByTestId("visor-3d-lienzo");
  await expect(canvas).toHaveAttribute("data-mode", "full");
  await canvas.scrollIntoViewIfNeeded();

  // Registra cada resaltado que pide el estudio (instrumentación de la prueba; no cambia el visor).
  await page.evaluate(() => {
    const v = (window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi.viewer()!;
    const w = window as unknown as { __hl: Hl[] };
    w.__hl = [];
    const orig = v.renderer.setHighlight.bind(v.renderer);
    v.renderer.setHighlight = (t: Hl) => {
      w.__hl.push(t ? { ...t } : null);
      orig(t);
    };
  });
  const last = () => page.evaluate(() => (window as unknown as { __hl: Hl[] }).__hl.at(-1) ?? null);

  const box = (await canvas.boundingBox())!;
  const column = (await page.locator("[data-column=view]").boundingBox())!;
  const viewport = page.viewportSize()!;
  const found = await page.evaluate(() => {
    const v = (window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi.viewer()!;
    const out: Array<[number, number]> = [];
    for (let y = 0.8; y >= -0.8; y -= 0.02) for (let x = -0.9; x <= 0.9; x += 0.02) {
      const hit = v.renderer.pick(x, y);
      if (hit && hit.partId === "cabeza" && hit.roundIndex === 6) out.push([x, y]);
    }
    return out;
  });
  const toScreen = ([x, y]: [number, number]) => ({ x: box.x + ((x + 1) / 2) * box.width, y: box.y + ((1 - y) / 2) * box.height });
  const target = found.map(toScreen).find((p) => p.y > Math.max(0, column.y) + 2 && p.y < Math.min(viewport.height, column.y + column.height) - 2 && p.x > 0 && p.x < viewport.width);
  expect(target, "la V7 de la cabeza se ve en el lienzo").toBeDefined();
  await page.mouse.click(target!.x, target!.y);

  // El cursor va a la línea del rango y el 3D resalta la V7 (roundIndex 6).
  const text = page.getByTestId("part-text");
  await expect(page.getByTestId("editor-part-name")).toHaveText("Cabeza");
  await expect.poll(() => text.evaluate((el: HTMLTextAreaElement) => el.value.split("\n")[el.value.slice(0, el.selectionStart).split("\n").length - 1] ?? "")).toMatch(/^V5-9/);
  await expect.poll(last).toEqual({ partId: "cabeza", roundIndex: 6 });

  // Moverse dentro de la misma línea no cambia la vuelta resaltada.
  await text.focus();
  await page.keyboard.press("End");
  await expect.poll(last).toEqual({ partId: "cabeza", roundIndex: 6 });

  // Salir de la línea y volver: el estudio recuerda el toque mientras la vuelta sea del mismo rango (applyHighlight),
  // así que vuelve a resaltar la V7 y no la primera del rango.
  await page.keyboard.press("ArrowDown");
  await expect.poll(last).toEqual({ partId: "cabeza", roundIndex: 9 });
  await page.keyboard.press("ArrowUp");
  await expect.poll(last).toEqual({ partId: "cabeza", roundIndex: 6 });
});
